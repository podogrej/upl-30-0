// 30-0 UPL: result writes (/api/save). Audit K5: nobody can write into another player's history.
// POST {kind, device_id, secret, tg_init?, ...}: the DB checks the device secret (device_ok); the server writes the row with its key.
// Row owner comes from the device binding in the DB (player_id trigger); Telegram only from a verified Mini App signature (tg_init).
//   kind 'season'      {row}           -> season + immediate verification (as /api/verify) -> {id, verified, note}
//   kind 'trophies'    {ids:[...]}     -> first trophy unlocks -> {ok}
//   kind 'challenge'   {row}           -> friend challenge -> {id}
//   kind 'chal_result' {row}           -> accepted challenge result -> {ok}
// Daily challenge result is not written here: the server writes it from the verified season (api/verify.js, syncDaily).
// 503 {fallback:true}: DB has no device_ok yet (SQL 0.53 not applied); the browser then writes directly (legacy path).
const { sb, deviceOk, tgUser, body, rateLimit } = require('./_device.js');
const { verifyById } = require('./verify.js');

const int = (v, lo, hi) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
const num = (v, lo, hi) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const str = (v, max) => v == null ? null : Array.from(String(v)).slice(0, max).join('');
// season score: same rules as DB policies (w+d+l=30, pts=3w+d, place 1-16)
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
    // era: only when not "all years" (otherwise the site doesn't send it). seasons.era may be missing: insert() retries without it
    ...(/^y\d{4}$/.test(String(r.era || '')) ? { era: String(r.era) } : {}),
    // "show ratings" was enabled in the draft (seasons.show_r; if the column is missing insert() retries without it)
    ...(r.show_r === true ? { show_r: true } : {}),
    // friends league attempt (league code); credited by the server after verification (api/verify.js -> fl_record)
    ...(/^[a-z2-9]{6}$/.test(String(r.fl_id || '')) ? { fl_id: String(r.fl_id) } : {}) };
}
// insert, retrying without columns the DB doesn't have yet
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
      return res.status(200).json({ id: ins.id, verified: v.verified, note: v.note, fl: v.fl });
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
