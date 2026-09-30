// 30-0 УПЛ — спільне для /api/save і /api/seed (файл з «_» — не адреса, Vercel його не публікує).
// Власність пристрою: браузер надсилає device_id і секрет пристрою (upl30_dsecret); база перевіряє секрет функцією device_ok,
// яку може викликати лише сервер (service_role). Гравець — з прив'язки пристрою в базі, не з браузера.
const crypto = require('crypto');
const SB_URL = (process.env.SUPABASE_URL || 'https://qruhcbwycrnfgzzdbljr.supabase.co').trim();   // у тестовому оточенні Vercel — адреса тестової бази
const env = k => String(process.env[k] || '').replace(/\s+/g, '');
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// запит до бази ключем сервера; помилка — з кодом HTTP і текстом бази
async function sb(path, { method = 'GET', body, prefer } = {}) {
  const key = env('SUPABASE_SERVICE_KEY');
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
  if (!r.ok) { const e = new Error(`db ${r.status}: ${t.slice(0, 150)}`); e.status = r.status; e.body = t; throw e; }
  return j;
}
// функції ще немає в базі (SQL 0.53 не виконано): PostgREST 404 / PGRST202
const missingFn = e => e && (e.status === 404 || /PGRST202|Could not find the function/.test(e.body || ''));

// перевірка секрету пристрою → {player} | {status, error, fallback?}
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
// чи ще приймаємо запити без секрету (сайт 0.52) — до кроку 2 (sql/v054_close_writes.sql)
async function legacyOpen() {
  try { return (await sb('rpc/legacy_writes_open', { method: 'POST', body: {} })) !== false; }
  catch (e) { if (missingFn(e)) return true; throw e; }
}
// Telegram Mini App: tg_user_id у записі — лише з перевіреного підпису initData (інакше — без Telegram)
function tgUser(initData) {
  const token = env('TG_TOKEN'); if (!token || !initData || typeof initData !== 'string' || initData.length > 4096) return null;
  const p = new URLSearchParams(initData); const hash = p.get('hash'); if (!hash) return null;
  p.delete('hash');
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  if (crypto.createHmac('sha256', secret).update(dcs).digest('hex') !== hash) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date') || 0) > 86400) return null;
  let u = null; try { u = JSON.parse(p.get('user')); } catch (e) {}
  if (!u || !u.id) return null;
  return { tg_user_id: +u.id, tg_name: ([u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || '').slice(0, 64) };
}
// Обмеження частоти (0.55): лічильник у базі (rate_hits, функція rate_hit — лише service_role, sql/v055_backups.sql),
// бо в пам'яті функції Vercel його не втримати — екземплярів багато. Ліміт на пристрій (device_id) і, ширший, на IP (x-forwarded-for):
// так не допоможе й підміна device_id. Без device_id — лише IP. Помилка бази або SQL 0.55 ще не виконано — пропускаємо
// (грі важливіше працювати, ніж лічити).
const RATE_MSG = 'Забагато запитів за хвилину. Зачекай трохи й спробуй ще раз.';
const LIMITS = { seed: 20, save: 40, verify: 30, card: 10, auth: 60 };   // auth: вхід через бота опитує кожні 2,5 с   // запитів за хвилину на пристрій; на IP — у IP_X разів більше
const IP_X = 4;
const ipOf = req => String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').split(',')[0].trim().slice(0, 64) || 'unknown';
async function rateHit(key, limit) {
  try { return (await sb('rpc/rate_hit', { method: 'POST', body: { p_key: key, p_limit: limit } })) !== false; }
  catch (e) { if (!missingFn(e)) console.warn('rate', e.message); return true; }
}
// true — відповідь 429 уже надіслано, обробник має вийти
async function rateLimit(req, res, name, device) {
  const dev = uuidRe.test(String(device || '')) ? String(device).toLowerCase() : null;
  const checks = [rateHit(`${name}:ip:${ipOf(req)}`, dev ? LIMITS[name] * IP_X : LIMITS[name])];
  if (dev) checks.push(rateHit(`${name}:d:${dev}`, LIMITS[name]));
  if ((await Promise.all(checks)).every(Boolean)) return false;
  res.status(429).json({ error: RATE_MSG, rate: true });
  return true;
}
const body = req => { let b = req.body || {}; if (typeof b === 'string') b = JSON.parse(b); return b; };
const kyivDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
module.exports = { sb, deviceOk, legacyOpen, tgUser, body, kyivDate, uuidRe, env, rateLimit, RATE_MSG, LIMITS };
