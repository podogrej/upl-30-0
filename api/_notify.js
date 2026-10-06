// 30-0 UPL: opt-in evening notifications in the bot's private chat (table tg_notify, sql/v070.sql). "_" prefix: not a route.
// Off by default; the player turns them on with /notify (or t.me/<bot>?start=notify) after reading what they are, off with one button.
// One message per player per evening (api/cron.js): the day result in every group league they played today + "streak at risk" if they skipped today.
// Only players who opened the private chat themselves get messages; a blocked bot (Telegram 403) switches the player off.
const L = require('./_league.js');

const ABOUT = '🔔 Сповіщення від бота\n\nРаз на день, увечері (близько 21:00 за Києвом), — одне повідомлення:\n' +
  '• підсумок дня в лігах твоїх груп: місце й очки;\n• нагадування, якщо серія драфту дня під загрозою.\n\nБільше нічого. Вимкнути можна однією кнопкою.';
const kb = on => ({ inline_keyboard: [[on ? { text: '🔕 Вимкнути сповіщення', callback_data: 'nt:off' } : { text: '🔔 Увімкнути сповіщення', callback_data: 'nt:on' }]] });
const state = on => (on ? '\n\nЗараз: увімкнено ✅' : '\n\nЗараз: вимкнено.');

async function isOn(tg_user_id) {
  const [r] = await L.sb(`tg_notify?tg_user_id=eq.${tg_user_id}&select=enabled`) || [];
  return !!(r && r.enabled);
}
const setOn = (tg_user_id, enabled) => L.sb('tg_notify?on_conflict=tg_user_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { tg_user_id, enabled, updated_at: new Date().toISOString() } });

// Telegram update: true = handled here (api/bot.js stops)
async function handleUpdate(u) {
  const cq = u.callback_query;
  if (cq && (cq.data === 'nt:on' || cq.data === 'nt:off')) {
    const msg = cq.message || {}, from = cq.from || {};
    if (!msg.chat || msg.chat.type !== 'private' || String(msg.chat.id) !== String(from.id)) { await L.tg('answerCallbackQuery', { callback_query_id: cq.id }); return true; }
    const on = cq.data === 'nt:on';
    await setOn(from.id, on);
    await L.tg('answerCallbackQuery', { callback_query_id: cq.id, text: on ? 'Сповіщення увімкнено' : 'Сповіщення вимкнено' });
    await L.tg('sendMessage', { chat_id: from.id, text: (on ? '✅ Увімкнено. Перше повідомлення — сьогодні ввечері, якщо буде що сказати.' : '🔕 Вимкнено. Більше не писатиму. Увімкнути знову — /notify.'), reply_markup: kb(on) });
    return true;
  }
  const m = u.message;
  if (!m || !m.chat || m.chat.type !== 'private' || typeof m.text !== 'string') return false;
  const [cmd, arg] = m.text.trim().split(/\s+/);
  const c = cmd.split('@')[0].toLowerCase();
  if (c === '/notify' || (c === '/start' && arg === 'notify')) {
    const on = await isOn(m.from.id);
    await L.tg('sendMessage', { chat_id: m.chat.id, text: ABOUT + state(on), reply_markup: kb(on) });
    return true;
  }
  return false;
}

const STREAK_DAYS = 400;   // look-back for the streak length in the message (longer streaks show as 400)
const chunks = (a, n = 100) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
// every row of a query: Supabase returns at most 1000 per request
async function all(q) { const out = []; for (let off = 0; ; off += 1000) { const pg = await L.sb(`${q}&limit=1000&offset=${off}`) || []; out.push(...pg); if (pg.length < 1000) return out; } }
const addDay = (d, n) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + n * 864e5).toISOString().slice(0, 10);
const weekKey = d => addDay(d, -((new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))).getUTCDay() + 6) % 7));
// daily-draft streak at risk today: replays the site's streakUpdate/streakInfo (src/template.html) over the played days,
// including the freeze (one skipped day per week, counted in the week of the day it was used); 0 if not at risk
function streakAtRisk(days, today) {
  if (days.has(today)) return 0;
  let last = null, count = 0, freezeWeek = null;
  for (const d of [...days].filter(x => x < today).sort()) {
    if (last === addDay(d, -1)) count++;
    else if (last === addDay(d, -2) && freezeWeek !== weekKey(d)) { count++; freezeWeek = weekKey(d); }
    else count = 1;
    last = d;
  }
  const alive = last === addDay(today, -1) || (last === addDay(today, -2) && freezeWeek !== weekKey(today));
  return alive && count >= 2 ? count : 0;
}

// evening run (api/cron.js after group summaries); idempotent per player and day (app_marks nt:<day>:<tg id>)
async function sendEvening(day) {
  const out = { subs: 0, sent: 0, off: 0 };
  const subs = await all('tg_notify?enabled=is.true&select=tg_user_id&order=tg_user_id.asc');
  out.subs = subs.length;
  if (!subs.length) return out;
  const ids = subs.map(s => s.tg_user_id);
  // group leagues played today
  const today = await L.onlyVerified(await L.sb(`league_results?day=eq.${day}&select=*`) || []);
  const byChat = {}; for (const r of today) (byChat[r.chat_id] = byChat[r.chat_id] || []).push(r);
  const titles = {};
  for (const lg of (Object.keys(byChat).length ? await L.sb(`leagues?chat_id=in.(${Object.keys(byChat).join(',')})&select=chat_id,title`) : []) || []) titles[lg.chat_id] = lg.title;
  const mine = {};   // tg id -> [{title, place, n, pts, w, d, l}]
  for (const [chat, list] of Object.entries(byChat)) {
    list.sort(L.sortRes);
    list.forEach((r, i) => { (mine[r.tg_user_id] = mine[r.tg_user_id] || []).push({ title: titles[chat] || 'ліга', place: i + 1, n: list.length, pts: r.pts, w: r.w, d: r.d, l: r.l }); });
  }
  // daily-draft days over the last STREAK_DAYS days, by Telegram id or by the linked player; ids go in chunks (URL length), rows page by page
  const pidOf = {}, from = addDay(day, -STREAK_DAYS), daysOf = {}, rows = [];
  for (const part of chunks(ids)) for (const k of await all(`player_links?kind=eq.tg&key=in.(${part.join(',')})&select=key,player_id&order=key.asc`)) pidOf[k.key] = k.player_id;
  const sel = `daily_results?day=gte.${from}&verified=is.true&select=id,day,tg_user_id,player_id&order=id.asc`;
  for (const part of chunks(ids)) rows.push(...await all(`${sel}&tg_user_id=in.(${part.join(',')})`));
  for (const part of chunks([...new Set(Object.values(pidOf))])) rows.push(...await all(`${sel}&player_id=in.(${part.join(',')})`));
  for (const id of ids) daysOf[id] = new Set(rows.filter(r => String(r.tg_user_id) === String(id) || (pidOf[id] && r.player_id === pidOf[id])).map(r => String(r.day).slice(0, 10)));
  for (const id of ids) {
    const lg = mine[id] || [], risk = streakAtRisk(daysOf[id], day);
    if (!lg.length && !risk) continue;
    const marked = ((await L.sb('app_marks?on_conflict=key', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=representation', body: { key: `nt:${day}:${id}` } })) || []).length > 0;
    if (!marked) continue;
    let t = `<b>🌙 Твій день №${L.dayNo(day)}</b>`;
    if (lg.length) t += '\n\n' + lg.map(x => `«${L.esc(x.title)}» — <b>${x.place}</b> з ${x.n} · ${x.pts} оч. (${x.w}-${x.d}-${x.l})`).join('\n');
    if (risk) t += `\n\n🔥 Серія ${risk} дн. під загрозою — зіграй драфт дня до півночі за Києвом.`;
    const r = await L.tg('sendMessage', { chat_id: id, text: t, parse_mode: 'HTML', disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: '▶️ Грати', web_app: { url: 'https://upl30.com.ua/' } }], [{ text: '🔕 Вимкнути сповіщення', callback_data: 'nt:off' }]] } });
    if (r && r.ok) out.sent++;
    else if (r && r.error_code === 403) { await setOn(id, false); out.off++; }
  }
  return out;
}

module.exports = { handleUpdate, sendEvening, streakAtRisk, ABOUT };
