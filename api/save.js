// 30-0 УПЛ — запис результатів (адреса /api/save), з 0.53. Аудит 30.09, К5: у чужу історію гравця ніхто не допише.
// POST {kind, device_id, secret, tg_init?, …}: база перевіряє секрет пристрою (device_ok), рядок пише сервер своїм ключем.
// Гравець рядка — з прив'язки пристрою в базі (тригер player_id), Telegram — лише з перевіреного підпису Mini App (tg_init).
//   kind 'season'      {row}           → сезон + одразу перевірка (як /api/verify) → {id, verified, note}
//   kind 'trophies'    {ids:[…]}       → перші відкриття трофеїв → {ok}
//   kind 'challenge'   {row}           → «Виклик другу» → {id}
//   kind 'chal_result' {row}           → результат прийнятого виклику → {ok}
// Результат виклику дня окремо не пишеться: його пише сервер із перевіреного сезону (api/verify.js, syncDaily).
// 503 {fallback:true} — у базі ще немає device_ok (SQL 0.53 не виконано): браузер тоді пише як 0.52.
const { sb, deviceOk, tgUser, body, rateLimit } = require('./_device.js');
const { verifyById } = require('./verify.js');

const int = (v, lo, hi) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
const num = (v, lo, hi) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const str = (v, max) => v == null ? null : Array.from(String(v)).slice(0, max).join('');
// рахунок сезону: ті самі правила, що й у політиках бази (w+d+l=30, pts=3w+d, місце 1–16)
function score(r) {
  const o = { w: int(r.w, 0, 30), d: int(r.d, 0, 30), l: int(r.l, 0, 30), pts: int(r.pts, 0, 90), place: int(r.place, 1, 16), gf: int(r.gf, 0, 999), ga: int(r.ga, 0, 999) };
  if (Object.values(o).some(v => v == null) || o.w + o.d + o.l !== 30 || o.pts !== o.w * 3 + o.d) return null;
  return o;
}
const xiItem = x => ({ n: str(x.n, 60), id: str(x.id, 60), slot: str(x.slot, 4), r: num(x.r, 0, 200), r0: num(x.r0, 0, 200), c: str(x.c, 60), y: int(x.y, 1900, 9999),
  f: num(x.f, -99, 99), g: int(x.g, 0, 99), a: int(x.a, 0, 99), rt: num(x.rt, 0, 20) });
const tblItem = t => ({ n: str(t.n, 60), w: int(t.w, 0, 30), d: int(t.d, 0, 30), l: int(t.l, 0, 30), gf: int(t.gf, 0, 999), ga: int(t.ga, 0, 999), pts: int(t.pts, 0, 90), me: !!t.me });
const dayRe = /^\d{4}-\d{2}-\d{2}$/;

function seasonRow(r) {
  const sc = score(r); if (!sc) return null;
  if (!Array.isArray(r.xi) || r.xi.length !== 11 || (r.tbl != null && (!Array.isArray(r.tbl) || r.tbl.length > 20))) return null;
  const mode = str(r.mode, 12), format = str(r.format, 12), formation = str(r.formation, 8);
  if (!mode || !format || !formation) return null;
  return { ...sc, nickname: str(r.nickname, 24), competition: str(r.competition || 'upl', 12), data_version: str(r.data_version, 16), mode, format, club: str(r.club, 40), formation,
    year: int(r.year, 1900, 9999), seed: int(r.seed, 0, 2 ** 53), version: str(r.version, 12), xp: num(r.xp, 0, 90), xg: num(r.xg, 0, 999), xga: num(r.xga, 0, 999),
    tier: str(r.tier, 80), golden: !!r.golden, perfect: !!r.perfect, seed_id: /^[0-9A-Za-z-]{1,64}$/.test(String(r.seed_id || '')) ? String(r.seed_id) : null, practice: !!r.practice,
    day: dayRe.test(String(r.day || '')) ? r.day : null, xi: r.xi.map(xiItem), tbl: (r.tbl || []).map(tblItem),
    // епоха (0.58) — лише не «Усі роки» (сайт інакше її не надсилає). Колонки seasons.era поки немає: insert() повторить запис без неї
    ...(/^y\d{4}$/.test(String(r.era || '')) ? { era: String(r.era) } : {}),
    // 0.60: у драфті вмикали «Показати рейтинги» (seasons.show_r; колонки ще немає — insert() повторить без неї)
    ...(r.show_r === true ? { show_r: true } : {}) };
}
// вставка з повтором без колонки, якої в базі ще немає (як робив браузер)
async function insert(table, row, qs = '', prefer = 'return=representation') {
  for (let n = 0; ; n++) {
    try { return await sb(`${table}${qs}`, { method: 'POST', prefer, body: row }); }
    catch (e) { const m = /'([a-z_]+)' column/.exec(e.body || ''); if (!m || n > 6 || !(m[1] in row)) throw e; delete row[m[1]]; if (m[1] === 'tg_user_id') delete row.tg_name; }
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let stage = 'body';
  try {
    const b = body(req);
    stage = 'rate';
    if (await rateLimit(req, res, 'save', b.device_id)) return;
    stage = 'device';
    const dev = await deviceOk(b.device_id, b.secret);
    if (dev.status) return res.status(dev.status).json({ error: dev.error, fallback: dev.fallback || undefined });
    const device_id = String(b.device_id), tg = tgUser(b.tg_init) || {};
    const r = b.row || {};
    stage = b.kind;
    if (b.kind === 'season') {
      const row = seasonRow(r); if (!row) return res.status(400).json({ error: 'season?' });
      const [ins] = await insert('seasons', { ...row, device_id, ...tg }, '?select=id') || [];
      if (!ins || !ins.id) return res.status(500).json({ error: 'no id' });
      stage = 'verify';
      const v = await verifyById(ins.id);
      return res.status(200).json({ id: ins.id, verified: v.verified, note: v.note });
    }
    if (b.kind === 'trophies') {
      const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(String))].filter(t => /^[A-Za-z0-9_]{1,24}$/.test(t)).slice(0, 100);
      if (!ids.length) return res.status(400).json({ error: 'ids?' });
      await insert('trophies', ids.map(trophy => ({ device_id, trophy, ...tg })), '?on_conflict=device_id,trophy', 'resolution=ignore-duplicates,return=minimal');
      return res.status(200).json({ ok: true, n: ids.length });
    }
    if (b.kind === 'challenge') {
      const sc = score(r), id = String(r.id || '');
      if (!sc || !/^[A-Za-z0-9]{6,12}$/.test(id) || !int(r.seed, 1, 2 ** 53) || !str(r.formation, 8) || !str(r.mode, 12) || int(r.year, 1900, 9999) == null) return res.status(400).json({ error: 'challenge?' });
      try { await insert('challenges', { id, device_id, name: str(r.name, 40), seed: +r.seed, formation: str(r.formation, 8), year: +r.year, mode: str(r.mode, 12), ...sc }, '', 'return=minimal'); }
      catch (e) { if (e.status === 409 || /23505/.test(e.body || '')) return res.status(409).json({ error: 'id taken' }); throw e; }
      return res.status(200).json({ id });
    }
    if (b.kind === 'chal_result') {
      const sc = score(r), cid = String(r.challenge_id || '');
      if (!sc || !/^[A-Za-z0-9]{6,12}$/.test(cid)) return res.status(400).json({ error: 'result?' });
      try { await insert('challenge_results', { challenge_id: cid, device_id, name: str(r.name, 40), ...sc }, '?on_conflict=challenge_id,device_id', 'resolution=ignore-duplicates,return=minimal'); }
      catch (e) { if (/23503/.test(e.body || '')) return res.status(400).json({ error: 'no challenge' }); throw e; }
      return res.status(200).json({ ok: true });
    }
    res.status(400).json({ error: 'kind?' });
  } catch (e) {
    res.status(500).json({ error: `crash at ${stage}: ${String(e && e.message || e).slice(0, 160)}` });
  }
};
