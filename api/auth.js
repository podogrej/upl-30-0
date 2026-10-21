// 30-0 UPL: Telegram login (Vercel function, /api/auth)
// Verifies the Telegram signature (Mini App initData or bot login via login_token) and issues a one-time Supabase login token.
// Vercel env: TG_TOKEN (bot token), SUPABASE_SERVICE_KEY (Supabase -> Settings -> API Keys -> secret key).
const { rateLimit } = require('./_device.js');   // rate limiting
const { SB_URL, env, sb: sbRest, miniApp, miniAppCheck, body, fail, reportOnce } = require('./_lib.js');
const checkMiniApp = (initData, token) => { const m = miniApp(initData, token); return m && m.user; };

async function admin(path, body) {
  const key = env('SUPABASE_SERVICE_KEY');
  const r = await fetch(`${SB_URL}/auth/v1/admin/${path}`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let j = {}; try { j = await r.json(); } catch (e) {}
  return { status: r.status, j };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let stage = 'config';
  try {
  const token = env('TG_TOKEN');
  if (!token || !env('SUPABASE_SERVICE_KEY')) return fail(res, 'auth', new Error('server not configured: ' + (!token ? 'TG_TOKEN ' : '') + (!env('SUPABASE_SERVICE_KEY') ? 'SUPABASE_SERVICE_KEY' : '')));
  stage = 'body';
  const b = body(req);
  stage = 'rate';
  if (await rateLimit(req, res, 'auth')) return;   // per IP
  stage = 'signature';
  let u = null;
  if (b.login_token) {
    // bot login: token the browser passed in t.me/upl30_bot?start=login_<token>; valid 10 minutes, single use
    stage = 'bot login';
    if (!/^[a-f0-9]{32}$/.test(String(b.login_token))) return res.status(400).json({ error: 'login_token?' });
    const since = new Date(Date.now() - 10 * 60e3).toISOString();
    // claim the token in one request: PATCH only an unused, fresh row; empty response = token not confirmed in the bot yet
    // or already used (a concurrent request gets nothing)
    const rows = await sbRest(`tg_logins?token=eq.${b.login_token}&used=is.false&created_at=gte.${since}&select=*`, { method: 'PATCH', prefer: 'return=representation', body: { used: true } });
    if (!rows || !rows.length) return res.status(202).json({ pending: true });
    const r0 = rows[0];
    u = { id: r0.tg_id, first_name: r0.first_name, last_name: r0.last_name, username: r0.username };
  } else u = b.initData ? checkMiniApp(b.initData, token) : null;   // Telegram login widget is no longer supported
  if (!u || !u.id) {
    if (b.initData && !b.login_token) { const why = miniAppCheck(String(b.initData), token).why || 'no user id'; await reportOnce('auth-sig ' + why.replace(/\d+/g, 'N'), 'auth', 'telegram signature: ' + why); }   // Mini App sign-in refused
    return res.status(401).json({ error: 'bad telegram signature' });
  }
  const tgId = Number(u.id);
  if (!Number.isSafeInteger(tgId) || tgId <= 0) return res.status(401).json({ error: 'bad telegram signature' });
  const email = `tg-${tgId}@users.upl-30-0.vercel.app`;   // service address, no mail is sent; do NOT switch to the new domain: Telegram accounts are looked up by it
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Гравець';
  const meta = { tg_id: u.id, tg_name: name, tg_username: u.username || null, full_name: name };
  // identity: app_metadata.tg_id (admin-only). An existing account with this service email is used only if tg_auth_user says
  // it belongs to this tg id; a self sign-up with the same email (pre-registration) is refused (sql/v087_data_protection.sql)
  stage = 'account';
  const owner = () => sbRest('rpc/tg_auth_user', { method: 'POST', body: { p_tg: tgId } });
  let st = await owner();
  if (st === 'none') {
    stage = 'create user';
    const cu = await admin('users', { email, email_confirm: true, user_metadata: meta, app_metadata: { tg_id: String(tgId) } });   // a parallel create gets "already exists": checked again below
    if (cu.status === 401 || cu.status === 403) return fail(res, 'auth', new Error(`Supabase refused SUPABASE_SERVICE_KEY (needs a secret key sb_secret_...), status ${cu.status}`));
    st = await owner();
  }
  if (st !== 'ok') { console.error('auth: account refused', tgId, st); return res.status(403).json({ error: 'tg_account' }); }
  stage = 'generate link';
  const { status, j } = await admin('generate_link', { type: 'magiclink', email });
  const token_hash = j.hashed_token || (j.properties && j.properties.hashed_token);
  if (status >= 300 || !token_hash) return fail(res, 'auth', new Error(`generate_link failed, status ${status}: ` + String(j.msg || j.error_description || j.error || '').slice(0, 120)));
  res.status(200).json({ token_hash, name });
  } catch (e) {
    fail(res, `auth ${stage}`, e);
  }
};
