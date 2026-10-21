// 30-0 UPL: result writes (/api/save). Audit K5: nobody can write into another player's history.
// POST {kind, device_id, secret, tg_init?, ...}: the DB checks the device secret (device_ok); the server writes the row with its key.
// Row owner comes from the device binding in the DB (player_id trigger); Telegram only from a verified Mini App signature (tg_init).
//   kind 'season'      {row, trophies?} -> season + immediate verification (as /api/verify) -> {id, verified, note, tr?}; trophies: new unlocks of this season
//                                         (same as kind 'trophies', saves a request; tr = true when written)
//                                         off?: wheel offers, 11 arrays of player ids aligned with row.xi (each contains its picked player);
//                                         stored in season_offers (no anon access), invalid ones are dropped without failing the season
//   kind 'trophies'    {ids:[...]}     -> first trophy unlocks -> {ok}
//   kind 'challenge'   {season_id, row:{id, name}} -> friend challenge from an own verified season with a server wheel -> {id}
//   kind 'chal_result' -> ignored (the result is written when the squad is locked, api/_draft.js)
// 503 {fallback:true}: DB has no device_ok yet (SQL 0.53 not applied). Clients 0.73.1+ do not write directly any more (sql/v054_close_writes.sql).
const { sb, gate, tgUser, body } = require('./_device.js');
const { verifyById, seasonTrophy } = require('./verify.js');
const { fail, report, miniAppCheck } = require('./_lib.js');

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
// site version as sent by the browser: digits only, else null (the season is then verified against the current engine)
const verOf = v => (/^\d+\.\d+(\.\d+)?$/.test(String(v == null ? '' : v)) ? String(v).slice(0, 12) : null);
const dayRe = /^\d{4}-\d{2}-\d{2}$/;
// challenge day of a season: only today or yesterday in Kyiv (a season finished after midnight), anything else is dropped
const kyivDay = t => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
const vdDayOk = d => dayRe.test(String(d || '')) && [kyivDay(Date.now()), kyivDay(Date.now() - 864e5)].includes(d);
const trophyIds = a => [...new Set((Array.isArray(a) ? a : []).map(String))].filter(t => /^[A-Za-z0-9_]{1,24}$/.test(t)).slice(0, 100);

// wheel offers: exactly one list per xi slot, ids in pool format, each list contains the player picked for that slot
const OFF_ID = /^[A-Za-z0-9:._-]{1,40}$/, OFF_MAX = 64;
function offersOf(off, xi) {
  if (!Array.isArray(off) || !Array.isArray(xi) || off.length !== xi.length || off.length !== 11) return null;
  const out = [];
  for (let i = 0; i < off.length; i++) {
    const a = off[i], id = xi[i] && xi[i].id;
    if (!Array.isArray(a) || !a.length || a.length > OFF_MAX || !a.every(v => typeof v === 'string' && OFF_ID.test(v)) || !a.includes(id)) return null;
    out.push([...new Set(a)]);
  }
  return out;
}

function seasonRow(r) {
  const sc = score(r); if (!sc) return null;
  if (!Array.isArray(r.xi) || r.xi.length !== 11 || (r.tbl != null && (!Array.isArray(r.tbl) || r.tbl.length > 20))) return null;
  const mode = str(r.mode, 12), format = str(r.format, 12), formation = str(r.formation, 8);
  if (!mode || !format || !formation) return null;
  return { ...sc, nickname: str(r.nickname, 24), competition: str(r.competition || 'upl', 12), data_version: str(r.data_version, 16), mode, format, club: str(r.club, 40), formation,
    year: int(r.year, 1900, 9999), seed: int(r.seed, 0, 2 ** 53), version: verOf(r.version), xp: num(r.xp, 0, 90), xg: num(r.xg, 0, 999), xga: num(r.xga, 0, 999),
    tier: str(r.tier, 80), golden: !!r.golden, perfect: !!r.perfect, seed_id: /^[0-9A-Za-z-]{1,64}$/.test(String(r.seed_id || '')) ? String(r.seed_id) : null, practice: !!r.practice,
    day: dayRe.test(String(r.day || '')) ? r.day : null,
    // daily-challenge day: seasons_pub hides the squad until it is over (seasons.vd_day may be missing: insert() retries without it)
    ...(vdDayOk(r.vd_day) ? { vd_day: r.vd_day } : {}),
    xi: r.xi.map(xiItem), tbl: (r.tbl || []).map(tblItem),
    // era: only when not "all years" (otherwise the site doesn't send it). seasons.era may be missing: insert() retries without it
    ...(/^[yd]\d{4}$/.test(String(r.era || '')) ? { era: String(r.era) } : {}),
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

// browser trophy claims: season trophies and milestones are dropped (the server writes them from the verified season); the rest (series, 5x5, friend leagues) as before
const claimable = ids => ids.filter(id => !seasonTrophy(id));
const putTrophies = (ids, device_id, tg) => insert('trophies', ids.map(trophy => ({ device_id, trophy, ...tg })), '?on_conflict=device_id,trophy', 'resolution=ignore-duplicates,return=minimal');

const handler = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let stage = 'body';
  try {
    const b = body(req);
    stage = 'gate';
    const g = await gate(req, res, 'save', b.device_id, b.secret == null ? '' : b.secret);   // secret is required here
    if (g.done) return;
    const dev = g.dev;
    if (dev.status) return res.status(dev.status).json({ error: dev.error, fallback: dev.fallback || undefined });
    const device_id = String(b.device_id), tg = tgUser(b.tg_init) || {};
    if (b.tg_init && !tg.tg_user_id) await report('save', 'telegram signature: ' + (miniAppCheck(String(b.tg_init)).why || 'no user id'));   // Mini App season saved without its Telegram user
    const r = b.row || {};
    stage = b.kind;
    if (b.kind === 'season') {
      const row = seasonRow(r); if (!row) return res.status(400).json({ error: 'season?' });
      // the inserted row (select=*) goes straight to verification: no second read
      const [ins] = await insert('seasons', { ...row, device_id, ...tg }, '?select=*') || [];
      if (!ins || !ins.id) return fail(res, 'save', new Error('season insert returned no id'));
      stage = 'verify';
      const off = b.off != null ? offersOf(b.off, row.xi) : null;
      const putOff = off ? insert('season_offers', { season_id: ins.id, player_id: ins.player_id || null, off }, '', 'return=minimal').then(() => true, e => report('save offers', e).then(() => false)) : undefined;
      const [v, of] = await Promise.all([verifyById(ins.id, ins), putOff]);   // verification first: milestone claims count this season
      const ids = claimable(trophyIds(b.trophies));
      const tr = ids.length ? await putTrophies(ids, device_id, tg).then(() => true, e => report('save trophies', e).then(() => false)) : true;   // true: nothing left for the browser to resend
      return res.status(200).json({ id: ins.id, verified: v.verified, note: v.note, fl: v.fl, tr, off: of });
    }
    if (b.kind === 'trophies') {   // 5x5, retro awards, older tabs
      const ids = claimable(trophyIds(b.ids));
      if (ids.length) await putTrophies(ids, device_id, tg);
      return res.status(200).json({ ok: true, n: ids.length });
    }
    if (b.kind === 'challenge') {   // from a verified free-play season with a server wheel: wheel seed, rules and result come from the DB
      const id = String(r.id || ''), sid = +b.season_id;
      if (!/^[A-Za-z0-9]{6,12}$/.test(id) || !Number.isInteger(sid) || sid < 1) return res.status(400).json({ error: 'challenge?' });
      const [se] = await sb(`seasons?id=eq.${sid}&select=id,device_id,player_id,verified,practice,format,era,fl_id,day,mode,formation,year,seed_id,w,d,l,pts,place,gf,ga`) || [];
      const mine = se && (String(se.device_id) === device_id.toLowerCase() || (dev.player && se.player_id === dev.player));
      if (!mine || se.verified !== true || se.practice || se.format !== 'classic' || se.era || se.fl_id || se.day || !se.seed_id) return res.status(400).json({ error: 'challenge?' });
      const [sd] = await sb(`season_seeds?id=eq.${encodeURIComponent(se.seed_id)}&kind=eq.draft&select=wheel_seed`) || [];
      if (!sd) return res.status(400).json({ error: 'challenge?' });
      try { await insert('challenges', { id, device_id, name: str(r.name, 40), seed: +sd.wheel_seed, formation: se.formation, year: se.year, mode: se.mode,
        w: se.w, d: se.d, l: se.l, pts: se.pts, place: se.place, gf: se.gf, ga: se.ga }, '', 'return=minimal'); }
      catch (e) { if (e.status === 409 || /23505/.test(e.body || '')) return res.status(409).json({ error: 'id taken' }); throw e; }
      return res.status(200).json({ id });
    }
    if (b.kind === 'chal_result') return res.status(200).json({ ok: true, ignored: true });   // older tabs: the result is written on lock (api/_draft.js)
    res.status(400).json({ error: 'kind?' });
  } catch (e) {
    fail(res, `save ${stage}`, e);
  }
};
module.exports = handler;
module.exports.offersOf = offersOf;
