// 0.68 (власник 02.10: перед розсилкою на багато людей — бачити помилки гравців): помилки JavaScript з пристроїв
// (src/template.html, перший <script>) → таблиця client_errors (sql/v068_client_errors.sql). Відповідь завжди 204 — гравцеві байдуже.
const { sb, rateLimit, body } = require('./_device.js');
const cut = (v, n) => (v == null || v === '' ? null : String(v).slice(0, n));
const int = v => (Number.isFinite(+v) ? Math.max(0, Math.min(1e7, Math.round(+v))) : null);
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    if (await rateLimit(req, res, 'err')) return;
    const b = body(req);
    const rows = (Array.isArray(b.errors) ? b.errors.slice(0, 5) : []).filter(e => e && e.msg).map(e => ({
      version: cut(b.version, 12), msg: cut(e.msg, 300), src: cut(e.src, 200), line: int(e.line), col: int(e.col), stack: cut(e.stack, 1500),
      screen: cut(b.screen, 20), url: cut(b.url, 200), ua: cut(req.headers['user-agent'], 200), tg: cut(b.tg, 40), player: cut(b.player, 12),
      n: Math.min(99, Math.max(1, int(e.n) || 1)) }));
    if (rows.length) await sb('client_errors', { method: 'POST', body: rows, prefer: 'return=minimal' });
  } catch (e) { console.warn('err', String(e && e.message).slice(0, 160)); }
  res.status(204).end();
};
