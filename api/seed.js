// 30-0 УПЛ — видача seed сезону (адреса /api/seed)
// Браузер надсилає зібраний склад перед симуляцією; сервер запам'ятовує склад і видає випадковий seed.
// Так результат не можна «підібрати» перебором seed у себе, а сервер потім перерахує сезон (/api/verify).
const crypto = require('crypto');
const SB_URL = 'https://qruhcbwycrnfgzzdbljr.supabase.co';
const env = k => String(process.env[k] || '').replace(/\s+/g, '');
async function sb(path, { method = 'GET', body, prefer } = {}) {
  const key = env('SUPABASE_SERVICE_KEY');
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
  if (!r.ok) throw new Error(`db ${r.status}: ${t.slice(0, 150)}`);
  return j;
}
const kyivDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const xiHash = xi => crypto.createHash('sha256').update(xi.map(x => `${x.id}|${x.slot}|${x.c}|${x.y}`).join(';')).digest('hex');
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let stage = 'body';
  try {
    let b = req.body || {}; if (typeof b === 'string') b = JSON.parse(b);
    if (!uuidRe.test(String(b.device_id || ''))) return res.status(400).json({ error: 'device_id?' });
    if (!Array.isArray(b.xi) || b.xi.length !== 11) return res.status(400).json({ error: 'xi?' });
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
    const [ins] = await sb('season_seeds?select=id', { method: 'POST', prefer: 'return=representation', body: row }) || [];
    res.status(200).json({ seed_id: ins && ins.id, seed, official });
  } catch (e) {
    res.status(500).json({ error: `crash at ${stage}: ${String(e && e.message || e).slice(0, 160)}` });
  }
};
