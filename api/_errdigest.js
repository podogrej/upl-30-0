// Daily (api/cron.js, 18:00 UTC) digest of player errors sent to Telegram
// from client_errors (sql/v068_client_errors.sql) for the last 24 h. No errors -> nothing is sent.
// Target: Vercel env TG_ERRORS_CHAT (admin's chat with the bot), else the cards service channel TG_CARDS_CHAT.
// Same-day reruns don't duplicate: app_marks key "errdigest-DATE" (server-only table).
const TOP = 8;
const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const where = r => r.tg ? 'Telegram ' + r.tg.split(' ')[0] : /iPad|iPhone/.test(r.ua || '') ? 'Safari iOS' : /Android/.test(r.ua || '') ? 'Android' : 'браузер';
// client_errors rows -> message text (HTML), or null when there are no errors
function digestText(rows, day) {
  if (!rows || !rows.length) return null;
  const g = {};
  for (const r of rows) {
    const k = (r.version || '?') + '|' + r.msg;
    const x = g[k] || (g[k] = { msg: r.msg, version: r.version || '?', n: 0, who: new Set(), screens: new Set(), where: new Set(), line: r.line });
    x.n += r.n || 1; x.who.add(r.player || r.ua || '?'); if (r.screen) x.screens.add(r.screen); x.where.add(where(r));
  }
  const list = Object.values(g).sort((a, b) => b.who.size - a.who.size || b.n - a.n);
  const total = list.reduce((s, x) => s + x.n, 0), people = new Set(rows.map(r => r.player || r.ua || '?')).size;
  let t = `<b>🐞 Помилки гравців за добу (${esc(day)})</b>\nУсього ${total}, різних ${list.length}, пристроїв ~${people}\n`;
  t += list.slice(0, TOP).map(x => `\n• <b>${x.n}×</b> у ${x.who.size} · v${esc(x.version)} · ${esc([...x.screens].join(', ') || '?')} · ${esc([...x.where].join(', '))}\n<code>${esc(x.msg.slice(0, 160))}</code>${x.line ? ` (рядок ${x.line})` : ''}`).join('\n');
  if (list.length > TOP) t += `\n\n…і ще ${list.length - TOP}. Усі — у Supabase → Table Editor → client_errors.`;
  return t;
}
// sb, tg, env from api/_league.js; returns {sent, n}
async function errDigest({ sb, tg, env, day, now = Date.now() }) {
  const chat = env('TG_ERRORS_CHAT') || env('TG_CARDS_CHAT');
  if (!chat) return { sent: false, n: 0, why: 'no chat' };
  const since = new Date(now - 864e5).toISOString();
  const rows = await sb(`client_errors?at=gte.${since}&select=version,msg,line,screen,ua,tg,player,n&order=at.desc&limit=2000`) || [];
  const text = digestText(rows, day);
  if (!text) return { sent: false, n: 0 };
  const mark = await sb('app_marks?on_conflict=key', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=representation', body: { key: 'errdigest-' + day } });
  if (Array.isArray(mark) && !mark.length) return { sent: false, n: rows.length, why: 'already sent' };
  await tg('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true });
  return { sent: true, n: rows.length };
}
module.exports = { digestText, errDigest };
