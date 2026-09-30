// 30-0 УПЛ — видача seed сезону (адреса /api/seed)
// Браузер надсилає зібраний склад перед симуляцією; сервер запам'ятовує склад і видає випадковий seed.
// Так результат не можна «підібрати» перебором seed у себе, а сервер потім перерахує сезон (/api/verify, /api/save).
// З 0.53 браузер надсилає й секрет пристрою (secret): чужий пристрій не «спалить» офіційну спробу дня (аудит К5).
// Без секрету (сайт 0.52) — лише до кроку 2 (sql/v054_close_writes.sql → legacy_writes_open() = false).
const crypto = require('crypto');
const { sb, deviceOk, legacyOpen, body, kyivDate, uuidRe } = require('./_device.js');
const xiHash = xi => crypto.createHash('sha256').update(xi.map(x => `${x.id}|${x.slot}|${x.c}|${x.y}`).join(';')).digest('hex');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let stage = 'body';
  try {
    const b = body(req);
    if (!uuidRe.test(String(b.device_id || ''))) return res.status(400).json({ error: 'device_id?' });
    if (!Array.isArray(b.xi) || b.xi.length !== 11) return res.status(400).json({ error: 'xi?' });
    stage = 'device';
    if (b.secret != null) {
      const d = await deviceOk(b.device_id, b.secret);
      if (d.status && !d.fallback) return res.status(d.status).json({ error: d.error });   // fallback: SQL 0.53 ще не виконано — як раніше
    } else if (!(await legacyOpen())) return res.status(401).json({ error: 'secret?' });
    const day = kyivDate();
    const daily = !!b.daily;
    let official = false;
    stage = 'daily';
    if (daily) {
      // офіційна лише перша спроба дня з цього пристрою
      const prev = await sb(`season_seeds?device_id=eq.${b.device_id}&day=eq.${day}&daily=is.true&official=is.true&select=id&limit=1`) || [];
      official = prev.length === 0;
    }
    stage = 'insert';
    const seed = crypto.randomInt(1, 2147483647);
    const row = { device_id: b.device_id, xi_hash: xiHash(b.xi), seed, day, daily, official, formation: String(b.formation || '').slice(0, 8), mode: String(b.mode || '').slice(0, 12), format: String(b.format || '').slice(0, 12), year: +b.year || null };
    let ins;
    try { [ins] = await sb('season_seeds?select=id', { method: 'POST', prefer: 'return=representation', body: row }) || []; }
    catch (e) {
      // В2: два запити одночасно — унікальний індекс (season_seeds_official_uq) пропускає лише одну офіційну спробу; друга — звичайна
      if (!(official && (e.status === 409 || /23505/.test(e.body || '')))) throw e;
      row.official = official = false;
      [ins] = await sb('season_seeds?select=id', { method: 'POST', prefer: 'return=representation', body: row }) || [];
    }
    res.status(200).json({ seed_id: ins && ins.id, seed, official });
  } catch (e) {
    res.status(500).json({ error: `crash at ${stage}: ${String(e && e.message || e).slice(0, 160)}` });
  }
};
