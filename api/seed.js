// 30-0 UPL: season seed issuance (/api/seed)
// The browser sends the built squad before simulation; the server stores it and issues a random seed.
// So the result can't be tuned by brute-forcing seeds locally, and the server later recomputes the season (/api/verify, /api/save).
// The browser also sends the device secret: another device can't burn the official daily attempt (audit K5).
// Without a secret (legacy clients): only until step 2 (sql/v054_close_writes.sql -> legacy_writes_open() = false).
// Body with `vd`: daily challenge attempts, handled by api/_vd.js.
// Body with `draft`: server wheel and season (api/_draft.js). Without it (tabs older than 0.90.1): a 'legacy' seed, the season stays unverified.
const crypto = require('crypto');
const { sb, legacyOpen, body, kyivDate, uuidRe, gate } = require('./_device.js');
const { xiHash, fail } = require('./_lib.js');
const V = require('./verify.js');   // engine lists and the opponent-year rule, same as the season check
const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
// mode, format, formation and year are required and must exist in the engine, so one seed cannot be pointed at any mode later.
// 'daily' mode belongs only to the old daily-draft request (daily: true) and the other way round. Returns an error text or null.
function fieldsErr(b) {
  const E = V.engine();
  if (!has(E.MODES, b.mode)) return 'mode?';
  if (!!b.daily !== (b.mode === 'daily')) return 'mode?';
  if (!has(E.FORMATS, b.format)) return 'format?';
  if (!has(E.FORMATIONS, b.formation)) return 'formation?';
  if (!Number.isInteger(+b.year) || !V.yearOk({ format: b.format, year: +b.year }, E, true)) return 'year?';
  return null;
}
// retry of an official daily attempt: same squad and year, not played yet
const sameAttempt = (p, b) => !!p && p.used_by == null && p.xi_hash === xiHash(b.xi) && (p.year == null || p.year === (+b.year || null));

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let stage = 'body';
  try {
    const b = body(req);
    if (!uuidRe.test(String(b.device_id || ''))) return res.status(400).json({ error: 'device_id?' });
    if (b.vd) {   // daily challenge attempts (api/_vd.js): start, finish (squad -> score and season seed), own results
      stage = 'vd';
      const g = await gate(req, res, 'seed', b.device_id, b.secret);
      if (g.done) return;
      const [code, j] = await require('./_vd.js').handle(b, g.dev);
      return res.status(code).json(j);
    }
    if (b.draft) {   // server wheel and season (api/_draft.js): start, lock
      stage = 'draft';
      const g = await gate(req, res, 'seed', b.device_id, b.secret);
      if (g.done) return;
      const [code, j] = await require('./_draft.js').handle(b, g.dev);
      return res.status(code).json(j);
    }
    if (!Array.isArray(b.xi) || b.xi.length !== 11) return res.status(400).json({ error: 'xi?' });
    const fe = fieldsErr(b);
    if (fe) return res.status(400).json({ error: fe });
    stage = 'gate';
    const g = await gate(req, res, 'seed', b.device_id, b.secret);
    if (g.done) return;
    if (b.secret != null) {
      const d = g.dev;
      if (d.status && !d.fallback) return res.status(d.status).json({ error: d.error });   // fallback: SQL 0.53 not applied, legacy behaviour
    } else if (!(await legacyOpen())) return res.status(401).json({ error: 'secret?' });
    const day = kyivDate();
    const daily = !!b.daily;
    // only the first attempt of the day from this device is official: try to insert it as official straight away,
    // the unique index season_seeds_official_uq (audit V2) rejects a second one with 409
    let official = daily;
    stage = 'insert';
    const seed = crypto.randomInt(1, 2147483647);
    const row = { device_id: b.device_id, xi_hash: xiHash(b.xi), seed, day, daily, official, kind: daily ? null : 'legacy', formation: b.formation, mode: b.mode, format: b.format, year: +b.year };
    let ins;
    try { [ins] = await sb('season_seeds?select=id', { method: 'POST', prefer: 'return=representation', body: row }) || []; }
    catch (e) {
      if (!(daily && official && (e.status === 409 || /23505/.test(e.body || '')))) throw e;
      // official attempt already issued (client retry after a timeout, parallel request): same squad, not played yet -> the same seed again
      stage = 'daily';
      const [p] = await sb(`season_seeds?device_id=eq.${b.device_id}&day=eq.${day}&daily=is.true&official=is.true&select=id,seed,xi_hash,year,used_by&limit=1`) || [];
      if (sameAttempt(p, b)) return res.status(200).json({ seed_id: p.id, seed: p.seed, official: true });
      row.official = official = false;
      [ins] = await sb('season_seeds?select=id', { method: 'POST', prefer: 'return=representation', body: row }) || [];
    }
    res.status(200).json({ seed_id: ins && ins.id, seed, official });
  } catch (e) {
    fail(res, `seed ${stage}`, e);
  }
};
