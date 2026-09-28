// 30-0 УПЛ — вхід через Telegram (Vercel function, адреса /api/auth)
// Перевіряє підпис Telegram (Mini App initData або віджет входу на сайті) і видає одноразовий токен входу Supabase.
// Змінні оточення у Vercel: TG_TOKEN (токен бота), SUPABASE_SERVICE_KEY (Supabase → Settings → API Keys → secret key).
const crypto = require('crypto');
const SB_URL = 'https://qruhcbwycrnfgzzdbljr.supabase.co';

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

function checkMiniApp(initData, token) {
  const p = new URLSearchParams(initData); const hash = p.get('hash'); if (!hash) return null;
  p.delete('hash');
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = hmac('WebAppData', token);
  if (hmac(secret, dcs).toString('hex') !== hash) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date') || 0) > 86400) return null;
  try { return JSON.parse(p.get('user')); } catch (e) { return null; }
}

function checkWidget(w, token) {
  if (!w || !w.hash) return null;
  const { hash, ...rest } = w;
  const dcs = Object.keys(rest).filter(k => rest[k] != null).sort().map(k => `${k}=${rest[k]}`).join('\n');
  const secret = crypto.createHash('sha256').update(token).digest();
  if (hmac(secret, dcs).toString('hex') !== hash) return null;
  if (Date.now() / 1000 - Number(w.auth_date || 0) > 86400) return null;
  return { id: w.id, first_name: w.first_name, last_name: w.last_name, username: w.username };
}

async function admin(path, body) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  const r = await fetch(`${SB_URL}/auth/v1/admin/${path}`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let j = {}; try { j = await r.json(); } catch (e) {}
  return { status: r.status, j };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const token = process.env.TG_TOKEN;
  if (!token || !process.env.SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'server not configured' });
  const b = req.body || {};
  const u = b.initData ? checkMiniApp(b.initData, token) : checkWidget(b.widget, token);
  if (!u || !u.id) return res.status(401).json({ error: 'bad telegram signature' });
  const email = `tg-${u.id}@users.upl-30-0.vercel.app`;   // службова адреса, листи туди не надсилаються
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Гравець';
  const meta = { tg_id: u.id, tg_name: name, tg_username: u.username || null, full_name: name };
  await admin('users', { email, email_confirm: true, user_metadata: meta });   // якщо вже є — Supabase поверне помилку, це нормально
  const { status, j } = await admin('generate_link', { type: 'magiclink', email });
  const token_hash = j.hashed_token || (j.properties && j.properties.hashed_token);
  if (status >= 300 || !token_hash) return res.status(500).json({ error: 'generate_link failed', status });
  res.status(200).json({ token_hash, name });
};
