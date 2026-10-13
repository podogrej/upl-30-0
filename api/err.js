// Client JavaScript errors
// (src/template.html, first <script>) -> client_errors table (sql/v068_client_errors.sql). Always responds 204.
// Also handles footer form feedback ({feedback:{text,contact}}) and traffic sources ({traffic}): no separate route due to the Vercel Hobby 12-function limit.
const { sb, rateLimit, body, tgUser, env, uuidRe } = require('./_device.js');
const L = require('./_league.js');
const cut = (v, n) => (v == null || v === '' ? null : String(v).slice(0, n));
const int = v => (Number.isFinite(+v) ? Math.max(0, Math.min(1e7, Math.round(+v))) : null);
// CSP violation reports (Content-Security-Policy-Report-Only, report-uri /api/err?csp=1): content type application/csp-report, the body is
// a string or a Buffer. Stored as a short client_errors row ("CSP <directive> <blocked>"), so the daily digest groups them with other errors.
const EXT = /^(chrome|moz|safari(-web)?)-extension:/;
const noQuery = u => { const m = /^([a-z]+:\/\/[^?#]*)/i.exec(String(u || '')); return m ? m[1] : null; };
// the Vercel Node runtime leaves req.body undefined for application/csp-report: read the raw stream first (1.5 s cap), req.body as a fallback
function rawText(req) {
  if (!req || typeof req.on !== 'function' || req.readableEnded) return Promise.resolve('');
  return new Promise(res => {
    const parts = []; let n = 0; const done = () => { clearTimeout(t); res(Buffer.concat(parts).toString('utf8')); };
    const t = setTimeout(done, 1500);
    req.on('data', c => { n += c.length; if (n <= 20000) parts.push(Buffer.from(c)); });
    req.on('end', done); req.on('error', done);
  });
}
function cspRow(req, raw) {
  let b = raw || req.body;
  if (Buffer.isBuffer(b)) b = b.toString('utf8');
  if (typeof b === 'string') b = JSON.parse(b.slice(0, 20000));
  const r = b && b['csp-report'];
  if (!r || typeof r !== 'object') return null;
  const blocked = String(r['blocked-uri'] || '');
  if (EXT.test(blocked) || EXT.test(String(r['source-file'] || ''))) return null;   // browser extensions, not our page
  return { msg: cut('CSP ' + (r['effective-directive'] || r['violated-directive'] || '?') + ' ' + (blocked || 'inline'), 300), src: cut(noQuery(r['source-file']) || r['source-file'], 200),
    line: int(r['line-number']), col: int(r['column-number']), screen: 'csp', url: cut(noQuery(r['document-uri']), 200), ua: cut(req.headers['user-agent'], 200), n: 1 };
}
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    if ((req.query && req.query.csp) || /csp-report/.test(String(req.headers['content-type'] || ''))) {
      if (await rateLimit(req, res, 'csp')) return;
      const row = cspRow(req, await rawText(req));
      if (row) await sb('client_errors', { method: 'POST', body: [row], prefer: 'return=minimal' });
      return res.status(204).end();
    }
    const b = body(req);
    if (b.feedback) return await feedback(req, res, b);   // feedback has its own fb limit, so page errors don't block it
    if (b.traffic) return await traffic(req, res, b.traffic);   // own trf limit as well
    if (await rateLimit(req, res, 'err')) return;
    const rows = (Array.isArray(b.errors) ? b.errors.slice(0, 5) : []).filter(e => e && e.msg).map(e => ({
      version: cut(b.version, 12), msg: cut(e.msg, 300), src: cut(e.src, 200), line: int(e.line), col: int(e.col), stack: cut(e.stack, 1500),
      screen: cut(b.screen, 20), url: cut(b.url, 200), ua: cut(req.headers['user-agent'], 200), tg: cut(b.tg, 40), player: cut(b.player, 12),
      n: Math.min(99, Math.max(1, int(e.n) || 1)) }));
    if (rows.length) await sb('client_errors', { method: 'POST', body: rows, prefer: 'return=minimal' });
  } catch (e) { console.warn('err', String(e && e.message).slice(0, 160)); }
  res.status(204).end();
};

// traffic source of a device (first touch) for one event: visit / season_start / season_finish (sql/v0903_traffic.sql); one row per device and event
const TRF_EVENTS = ['visit', 'season_start', 'season_finish'];
const tag = v => { const s = String(v == null ? '' : v).toLowerCase().trim().slice(0, 64).replace(/[^a-z0-9_.:-]/g, ''); return s || null; };
async function traffic(req, res, t) {
  const id = String(t && t.anon_id || '');
  if (!uuidRe.test(id) || !TRF_EVENTS.includes(t.event)) return res.status(204).end();
  if (await rateLimit(req, res, 'trf', id)) return;
  const row = { anon_id: id.toLowerCase(), event: t.event, utm_source: tag(t.utm_source), utm_medium: tag(t.utm_medium), utm_campaign: tag(t.utm_campaign), referrer: tag(t.referrer) };
  try { await sb('traffic_events?on_conflict=anon_id,event', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: row }); }
  catch (e) { console.warn('traffic', String(e && e.message).slice(0, 160)); }
  res.status(204).end();
}

// site feedback: forward to admin in Telegram (TG_FEEDBACK_CHAT or TG_CARDS_CHAT) and store in feedback (sql/v06969_feedback_site.sql)
async function feedback(req, res, b) {
  if (await rateLimit(req, res, 'fb')) return;
  const f = b.feedback || {}, text = cut(String(f.text || '').trim(), 2000), contact = cut(String(f.contact || '').trim(), 100);
  if (!text) return res.status(400).json({ error: 'text?' });
  const u = tgUser(b.initData);   // Telegram user only from a verified Mini App signature
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
  catch (e) {   // SQL 0.69.69 not applied: no new columns, append contact to the text
    try { await sb('feedback', { method: 'POST', prefer: 'return=minimal', body: { ...base, text: contact ? `${text}\n\n[контакт: ${contact}]` : text } }); }
    catch (e2) { console.error('feedback db', e2.message); if (!fwd) return res.status(503).json({ error: 'Не вдалося надіслати. Спробуй ще раз або напиши боту @upl30_bot.' }); }
  }
  res.status(200).json({ ok: true });
}
