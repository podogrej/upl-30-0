// 0.68 (власник 02.10: перед розсилкою на багато людей — бачити помилки гравців): помилки JavaScript з пристроїв
// (src/template.html, перший <script>) → таблиця client_errors (sql/v068_client_errors.sql). Відповідь завжди 204 — гравцеві байдуже.
// 0.69.69: тут же — відгук із форми в підвалі ({feedback:{text,contact}}): окремої адреси не робимо, бо Vercel Hobby дає лише 12 функцій.
const { sb, rateLimit, body, tgUser, env } = require('./_device.js');
const L = require('./_league.js');
const cut = (v, n) => (v == null || v === '' ? null : String(v).slice(0, n));
const int = v => (Number.isFinite(+v) ? Math.max(0, Math.min(1e7, Math.round(+v))) : null);
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const b = body(req);
    if (b.feedback) return await feedback(req, res, b);   // відгук — лише свій ліміт fb: помилки сторінки його не блокують
    if (await rateLimit(req, res, 'err')) return;
    const rows = (Array.isArray(b.errors) ? b.errors.slice(0, 5) : []).filter(e => e && e.msg).map(e => ({
      version: cut(b.version, 12), msg: cut(e.msg, 300), src: cut(e.src, 200), line: int(e.line), col: int(e.col), stack: cut(e.stack, 1500),
      screen: cut(b.screen, 20), url: cut(b.url, 200), ua: cut(req.headers['user-agent'], 200), tg: cut(b.tg, 40), player: cut(b.player, 12),
      n: Math.min(99, Math.max(1, int(e.n) || 1)) }));
    if (rows.length) await sb('client_errors', { method: 'POST', body: rows, prefer: 'return=minimal' });
  } catch (e) { console.warn('err', String(e && e.message).slice(0, 160)); }
  res.status(204).end();
};

// відгук із сайту: пересилаємо власнику в Telegram (TG_FEEDBACK_CHAT або TG_CARDS_CHAT) і пишемо в feedback (sql/v06969_feedback_site.sql)
async function feedback(req, res, b) {
  if (await rateLimit(req, res, 'fb')) return;
  const f = b.feedback || {}, text = cut(String(f.text || '').trim(), 2000), contact = cut(String(f.contact || '').trim(), 100);
  if (!text) return res.status(400).json({ error: 'text?' });
  const u = tgUser(b.initData);   // Telegram — лише з перевіреного підпису Mini App
  const meta = { version: cut(b.version, 12), player: cut(b.player, 12), screen: cut(b.screen, 20), ua: cut(req.headers['user-agent'], 200) };
  const to = env('TG_FEEDBACK_CHAT') || env('TG_CARDS_CHAT');
  let fwd = false;
  if (to) {
    try {
      const who = [u ? `${u.tg_name} · tg ${u.tg_user_id}` : null, meta.player ? 'гравець ' + meta.player : null, contact ? 'контакт: ' + contact : null].filter(Boolean).join('\n');
      const r = await L.tg('sendMessage', { chat_id: to, text: `💬 Відгук із сайту · ${meta.version || '?'} · ${meta.screen || '?'}\n${who || 'анонімно'}\n\n${text}` });
      fwd = !!(r && r.ok);
    } catch (e) { console.error('feedback fwd', e.message); }
  }
  const base = { tg_user_id: u ? u.tg_user_id : null, name: u ? u.tg_name : null, kind: 'text', text, forwarded: fwd };
  try { await sb('feedback', { method: 'POST', prefer: 'return=minimal', body: { ...base, source: 'site', contact, ...meta } }); }
  catch (e) {   // SQL 0.69.69 ще не виконано — без нових колонок, контакт дописуємо в текст
    try { await sb('feedback', { method: 'POST', prefer: 'return=minimal', body: { ...base, text: contact ? `${text}\n\n[контакт: ${contact}]` : text } }); }
    catch (e2) { console.error('feedback db', e2.message); if (!fwd) return res.status(503).json({ error: 'Не вдалося надіслати. Спробуй ще раз або напиши боту @upl30_bot.' }); }
  }
  res.status(200).json({ ok: true });
}
