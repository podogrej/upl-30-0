// 30-0 UPL: season seed issuance (/api/seed)
// The browser sends the built squad before simulation; the server stores it and issues a random seed.
// So the result can't be tuned by brute-forcing seeds locally, and the server later recomputes the season (/api/verify, /api/save).
// The browser also sends the device secret: another device can't burn the official daily attempt (audit K5).
// Without a secret (legacy clients): only until step 2 (sql/v054_close_writes.sql -> legacy_writes_open() = false).
const crypto = require('crypto');
const { sb, deviceOk, legacyOpen, body, kyivDate, uuidRe, rateLimit } = require('./_device.js');
// retry of an official daily attempt: same squad and year, not played yet
const sameAttempt = (p, b) => !!p && p.used_by == null && p.xi_hash === xiHash(b.xi) && (p.year == null || p.year === (+b.year || null));
const xiHash = xi => crypto.createHash('sha256').update(xi.map(x => `${x.id}|${x.slot}|${x.c}|${x.y}`).join(';')).digest('hex');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let stage = 'body';
  try {
    const b = body(req);
    if (!uuidRe.test(String(b.device_id || ''))) return res.status(400).json({ error: 'device_id?' });
    if (!Array.isArray(b.xi) || b.xi.length !== 11) return res.status(400).json({ error: 'xi?' });
    stage = 'rate';
    if (await rateLimit(req, res, 'seed', b.device_id)) return;
    stage = 'device';
    if (b.secret != null) {
      const d = await deviceOk(b.device_id, b.secret);
      if (d.status && !d.fallback) return res.status(d.status).json({ error: d.error });   // fallback: SQL 0.53 not applied, legacy behaviour
    } else if (!(await legacyOpen())) return res.status(401).json({ error: 'secret?' });
    const day = kyivDate();
    const daily = !!b.daily;
    let official = false;
    stage = 'daily';
    if (daily) {
      // only the first attempt of the day from this device is official
      const prev = await sb(`season_seeds?device_id=eq.${b.device_id}&day=eq.${day}&daily=is.true&official=is.true&select=id,seed,xi_hash,year,used_by&limit=1`) || [];
      official = prev.length === 0;
      // retry after a client timeout: same squad, attempt not played yet -> the same official seed again
      const p = prev[0];
      if (sameAttempt(p, b)) return res.status(200).json({ seed_id: p.id, seed: p.seed, official: true });
    }
    stage = 'insert';
    const seed = crypto.randomInt(1, 2147483647);
    const row = { device_id: b.device_id, xi_hash: xiHash(b.xi), seed, day, daily, official, formation: String(b.formation || '').slice(0, 8), mode: String(b.mode || '').slice(0, 12), format: String(b.format || '').slice(0, 12), year: +b.year || null };
    let ins;
    try { [ins] = await sb('season_seeds?select=id', { method: 'POST', prefer: 'return=representation', body: row }) || []; }
    catch (e) {
      // audit V2: concurrent requests: unique index season_seeds_official_uq lets only one official attempt through; the other is regular
      if (!(official && (e.status === 409 || /23505/.test(e.body || '')))) throw e;
      // the parallel request (client retry while the first one was still running) won: hand out its seed if it is the same attempt
      const [p] = await sb(`season_seeds?device_id=eq.${b.device_id}&day=eq.${day}&daily=is.true&official=is.true&select=id,seed,xi_hash,year,used_by&limit=1`) || [];
      if (sameAttempt(p, b)) return res.status(200).json({ seed_id: p.id, seed: p.seed, official: true });
      row.official = official = false;
      [ins] = await sb('season_seeds?select=id', { method: 'POST', prefer: 'return=representation', body: row }) || [];
    }
    res.status(200).json({ seed_id: ins && ins.id, seed, official });
  } catch (e) {
    res.status(500).json({ error: `crash at ${stage}: ${String(e && e.message || e).slice(0, 160)}` });
  }
};
