// 30-0 UPL: shared by /api/save and /api/seed ("_" prefix: not a route, Vercel does not expose it).
// Device ownership: the browser sends device_id and the device secret (upl30_dsecret); the DB checks the secret with device_ok,
// callable only by the server (service_role). The player comes from the device binding in the DB, never from the browser.
const { SB_URL, env, sb, kyivDate, miniApp } = require('./_lib.js');
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// function not in DB yet (SQL 0.53 not applied): PostgREST 404 / PGRST202
const missingFn = e => e && (e.status === 404 || /PGRST202|Could not find the function/.test(e.body || ''));

// device secret check -> {player} | {status, error, fallback?}
async function deviceOk(device, secret) {
  if (!uuidRe.test(String(device || ''))) return { status: 400, error: 'device_id?' };
  if (typeof secret !== 'string' || secret.length < 16 || secret.length > 200) return { status: 401, error: 'secret?' };
  try {
    const pid = await sb('rpc/device_ok', { method: 'POST', body: { p_device: device, p_secret: secret } });
    return { player: pid };
  } catch (e) {
    if (missingFn(e)) return { status: 503, error: 'device_ok: SQL 0.53 ще не виконано', fallback: true };
    if (/28000|device secret/.test(e.body || e.message)) return { status: 401, error: 'device secret' };
    if (/22023/.test(e.body || '')) return { status: 400, error: 'device?' };
    throw e;
  }
}
// whether requests without a secret are still accepted (legacy 0.52 clients) until step 2 (sql/v054_close_writes.sql)
async function legacyOpen() {
  try { return (await sb('rpc/legacy_writes_open', { method: 'POST', body: {} })) !== false; }
  catch (e) { if (missingFn(e)) return true; throw e; }
}
// Telegram Mini App: tg_user_id is taken only from a verified initData signature (otherwise none)
function tgUser(initData) {
  const m = miniApp(initData); const u = m && m.user;
  if (!u || !u.id) return null;
  return { tg_user_id: +u.id, tg_name: ([u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || '').slice(0, 64) };
}
// Rate limiting: counter in the DB (rate_hits, function rate_hit, service_role only, sql/v055_backups.sql),
// since in-memory counters don't survive across many Vercel instances. Limit per device (device_id) and a wider one per IP (x-forwarded-for),
// so spoofing device_id doesn't help. Without device_id: IP only. On DB error or missing SQL 0.55, let the request through
// (availability over counting).
const RATE_MSG = 'Забагато запитів за хвилину. Зачекай трохи й спробуй ще раз.';
const LIMITS = { seed: 20, save: 40, verify: 30, card: 10, auth: 60, fl5: 30, err: 10, fb: 5 };   // requests per minute per device (per IP: IP_X times more). fb: footer feedback form; err: client error reports; fl5: every 5x5 league member opens the page after the draft closes; auth: bot login polls every 2.5 s
const IP_X = 4;
const ipOf = req => String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').split(',')[0].trim().slice(0, 64) || 'unknown';
async function rateHit(key, limit) {
  try { return (await sb('rpc/rate_hit', { method: 'POST', body: { p_key: key, p_limit: limit } })) !== false; }
  catch (e) { if (!missingFn(e)) console.warn('rate', e.message); return true; }
}
// true = 429 already sent, handler must return
async function rateLimit(req, res, name, device) {
  const dev = uuidRe.test(String(device || '')) ? String(device).toLowerCase() : null;
  const checks = [rateHit(`${name}:ip:${ipOf(req)}`, dev ? LIMITS[name] * IP_X : LIMITS[name])];
  if (dev) checks.push(rateHit(`${name}:d:${dev}`, LIMITS[name]));
  if ((await Promise.all(checks)).every(Boolean)) return false;
  res.status(429).json({ error: RATE_MSG, rate: true });
  return true;
}
const body = req => { let b = req.body || {}; if (typeof b === 'string') b = JSON.parse(b); return b; };
module.exports = { sb, deviceOk, legacyOpen, tgUser, body, kyivDate, uuidRe, env, rateLimit, RATE_MSG, LIMITS };
