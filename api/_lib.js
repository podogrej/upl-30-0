// 30-0 UPL: minimal helpers shared by all server functions ("_" prefix: not a route, Vercel does not expose it).
const crypto = require('crypto');
const SB_URL = (process.env.SUPABASE_URL || 'https://qruhcbwycrnfgzzdbljr.supabase.co').trim();   // in the Vercel test environment this points to the test DB
const env = k => String(process.env[k] || '').replace(/\s+/g, '');   // strip stray whitespace/newlines from keys

// DB request with the service key; errors carry HTTP status (e.status) and DB text (e.body)
async function sb(path, { method = 'GET', body, prefer } = {}) {
  const key = env('SUPABASE_SERVICE_KEY');
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
  if (!r.ok) { const e = new Error(`db ${r.status}: ${t.slice(0, 150)}`); e.status = r.status; e.body = t; throw e; }
  return j;
}
// every row of a query: Supabase returns at most 1000 rows per request, so page with limit/offset (q must have a stable order)
const PAGE = 1000;
async function sbAll(q, maxPages = 100) {
  const out = [];
  for (let off = 0, n = 0; n < maxPages; off += PAGE, n++) { const pg = await sb(`${q}&limit=${PAGE}&offset=${off}`) || []; out.push(...pg); if (pg.length < PAGE) break; }
  return out;
}
const kyivDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

// Telegram Mini App signature (initData) -> {user, start_param} or null; max age one day
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
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// every device bound to a player (player_links kind 'device'), plus the given one; lowercase uuids. Errors propagate (callers count attempts per player)
async function devicesOf(pid, device) {
  const ds = new Set(device ? [String(device).toLowerCase()] : []);
  if (pid) for (const l of await sb(`player_links?kind=eq.device&player_id=eq.${pid}&select=key&limit=50`) || []) ds.add(String(l.key).toLowerCase());
  return [...ds].filter(d => uuidRe.test(d));
}
// squad fingerprint stored in season_seeds.xi_hash (seed.js issues it, verify.js and _vd.js compare it)
const xiHash = xi => crypto.createHash('sha256').update(xi.map(x => `${x.id}|${x.slot}|${x.c}|${x.y}`).join(';')).digest('hex');
// JSON body of a request (Vercel may pass a string); throws on invalid JSON
const body = req => { let b = req.body || {}; if (typeof b === 'string') b = JSON.parse(b); return b; };
// 500 without internals: the cause (DB text, stage) goes to the server log only
const SERVER_ERR = 'Щось пішло не так на сервері. Спробуй ще раз трохи згодом.';
function fail(res, where, e) {
  console.error(`${where}: ${String(e && e.message || e).slice(0, 300)}`);
  return res.status(500).json({ error: SERVER_ERR });
}
// Ukrainian plural form by count (one / few / many), same as plUk on the site
const plUk = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
module.exports = { SB_URL, env, sb, sbAll, kyivDate, miniApp, plUk, uuidRe, devicesOf, xiHash, body, fail, SERVER_ERR };
