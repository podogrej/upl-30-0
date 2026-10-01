// 30-0 УПЛ — найпростіше спільне для всіх функцій сервера (файл з «_» — не адреса, Vercel його не публікує).
// 0.67 (аудит P2-13): раніше ці кілька рядків були скопійовані в 4–6 файлах.
const crypto = require('crypto');
const SB_URL = (process.env.SUPABASE_URL || 'https://qruhcbwycrnfgzzdbljr.supabase.co').trim();   // у тестовому оточенні Vercel — адреса тестової бази
const env = k => String(process.env[k] || '').replace(/\s+/g, '');   // прибираємо випадкові пробіли й переноси з ключів

// запит до бази ключем сервера; помилка — з кодом HTTP (e.status) і текстом бази (e.body)
async function sb(path, { method = 'GET', body, prefer } = {}) {
  const key = env('SUPABASE_SERVICE_KEY');
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
  if (!r.ok) { const e = new Error(`db ${r.status}: ${t.slice(0, 150)}`); e.status = r.status; e.body = t; throw e; }
  return j;
}
const kyivDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

// підпис Telegram Mini App (initData) → {user, start_param} або null; не старший за добу
function miniApp(initData, token = env('TG_TOKEN')) {
  if (!token || !initData || typeof initData !== 'string' || initData.length > 4096) return null;
  const p = new URLSearchParams(initData); const hash = p.get('hash'); if (!hash) return null;
  p.delete('hash');
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  if (crypto.createHmac('sha256', secret).update(dcs).digest('hex') !== hash) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date') || 0) > 86400) return null;
  let user = null; try { user = JSON.parse(p.get('user')); } catch (e) {}
  return user ? { user, start_param: p.get('start_param') || '' } : null;
}
// відмінювання: 1 день, 2 дні, 5 днів (як plUk на сайті)
const plUk = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
module.exports = { SB_URL, env, sb, kyivDate, miniApp, plUk };
