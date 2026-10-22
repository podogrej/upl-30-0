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
  const top = x => x.version === 'server' && /^(telegram|auth|league|save): /.test(x.msg) ? 1 : 0;   // bot token and signature failures first: they break whole features
  const list = Object.values(g).sort((a, b) => top(b) - top(a) || b.who.size - a.who.size || b.n - a.n);
  const total = list.reduce((s, x) => s + x.n, 0), people = new Set(rows.map(r => r.player || r.ua || '?')).size;
  let t = `<b>🐞 Помилки гравців за добу (${esc(day)})</b>\nУсього ${total}, різних ${list.length}, пристроїв ~${people}\n`;
  t += list.slice(0, TOP).map(x => `\n• <b>${x.n}×</b> у ${x.who.size} · v${esc(x.version)} · ${esc([...x.screens].join(', ') || '?')} · ${esc([...x.where].join(', '))}\n<code>${esc(x.msg.slice(0, 160))}</code>${x.line ? ` (рядок ${x.line})` : ''}`).join('\n');
  if (list.length > TOP) t += `\n\n…і ще ${list.length - TOP}. Усі — у Supabase → Table Editor → client_errors.`;
  return t;
}
// fewer than 10 days of daily challenges left (counting `day`) -> warning line for the top of the digest, else null
const dayAdd = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
function runwayLine(challenges, day) {
  const last = (challenges || []).map(c => c && c.day).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop();
  if (last && last >= dayAdd(day, 9)) return null;
  const dm = last ? `${last.slice(8, 10)}.${last.slice(5, 7)}` : '—';
  return `<b>⚠️ Виклики дня ${last && last >= day ? 'закінчуються' : 'закінчились'}: останній — ${dm}.</b> Додай нові в lib/challenges.json, інакше на головній буде «Новий виклик скоро», а серії гравців обнуляться.`;
}
// sb, tg, env from api/_league.js; returns {sent, n}
async function errDigest({ sb, tg, env, day, now = Date.now(), challenges = require('../lib/challenges.json') }) {
  const chat = env('TG_ERRORS_CHAT') || env('TG_CARDS_CHAT');
  if (!chat) return { sent: false, n: 0, why: 'no chat' };
  const since = new Date(now - 864e5).toISOString();
  const rows = await sb(`client_errors?at=gte.${since}&select=version,msg,line,screen,ua,tg,player,n&order=at.desc&limit=2000`) || [];
  const warn = runwayLine(challenges, day), errs = digestText(rows, day);
  if (!errs && !warn) return { sent: false, n: 0 };
  const text = [warn, errs].filter(Boolean).join('\n\n');
  const mark = await sb('app_marks?on_conflict=key', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=representation', body: { key: 'errdigest-' + day } });
  if (Array.isArray(mark) && !mark.length) return { sent: false, n: rows.length, why: 'already sent' };
  const r = await tg('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }).catch(e => ({ description: e.message }));
  if (!r || !r.ok) {   // not delivered: drop the mark so the next run (after the token or chat is fixed) sends it
    await sb(`app_marks?key=eq.errdigest-${day}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {});
    return { sent: false, n: rows.length, why: 'telegram refused: ' + String(r && r.description || 'no answer').slice(0, 120) };
  }
  return { sent: true, n: rows.length };
}
module.exports = { digestText, errDigest, runwayLine };
