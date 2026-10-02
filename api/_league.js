// 30-0 УПЛ — спільні функції ліг Telegram-груп для api/bot.js, api/cron.js, api/league.js (не адреса: файли з «_» Vercel не публікує).
// До 0.60 цей блок був трьома однаковими копіями в кожному файлі (аудит 30.09, «Порядок»).
const L = (() => {
const { SB_URL, env, sb, kyivDate, miniApp } = require('./_lib.js');
const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env('TG_TOKEN')}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
}

const LAUNCH = Date.UTC(2026, 8, 28);
const dayNo = day => Math.max(1, Math.round((Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) - LAUNCH) / 864e5) + 1);
const dayShort = day => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

const checkMiniApp = initData => miniApp(initData);   // {user, start_param} або null
const nameOf = u => ([u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Гравець').slice(0, 40);

const playUrl = chat_id => `https://t.me/${env('TG_BOT') || 'upl30_bot'}?startapp=g${chat_id}`;
const playKb = chat_id => ({ inline_keyboard: [[{ text: '▶️ Зіграти драфт дня', url: playUrl(chat_id) }]] });

const sortRes = (a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || String(a.created_at).localeCompare(String(b.created_at));

// ім'я в табло — з профілю гравця (players.name, інакше анонімне; з 0.59 — латиниця в нижньому регістрі), а не копія імені Telegram у рядку (аудит В5).
// Гравця шукаємо за прив'язкою Telegram (player_links, kind = 'tg'); немає прив'язки чи SQL 0.59 ще не виконано — ім'я з рядка, як було.
async function withNames(rows) {
  const keys = [...new Set(rows.map(r => r.tg_user_id).filter(x => x != null && /^\d+$/.test(String(x))).map(String))];
  const pl = {};
  for (let i = 0; i < keys.length; i += 100) {
    const q = `player_links?kind=eq.tg&key=in.(${keys.slice(i, i + 100).join(',')})&select=key,players(name,anon_name,public_id)`;
    let ls = []; try { ls = await sb(q) || []; } catch (e) { try { ls = await sb(q.replace(',public_id', '')) || []; } catch (e2) { console.warn('names', e2.message); } }
    for (const l of ls) if (l.players) pl[l.key] = l.players;
  }
  return rows.map(r => { const p = pl[String(r.tg_user_id)]; const n = p && (p.name || p.anon_name);
    return n ? { ...r, name: String(n), u: p.public_id || undefined } : r; });
}
// з 0.52 у табло й підсумках ліг — лише результати, чий сезон сервер перевірив (цифри беремо із сезону, а не з браузера).
// Дні до VERIFIED_FROM показуємо як були, щоб не переписувати історію ліг.
const VERIFIED_FROM = '2026-10-01';
async function onlyVerified(rows) {
  const ids = [...new Set(rows.filter(r => String(r.day) >= VERIFIED_FROM).map(r => +r.season_id).filter(Boolean))];
  const ok = {};
  for (let i = 0; i < ids.length; i += 100)
    for (const s of await sb(`seasons?id=in.(${ids.slice(i, i + 100).join(',')})&verified=is.true&practice=is.false&select=id,day,tg_user_id,w,d,l,gf,ga,place`) || []) ok[s.id] = s;
  return withNames(rows.filter(r => {
    if (String(r.day) < VERIFIED_FROM) return true;
    const s = ok[+r.season_id];
    return !!s && String(s.day).slice(0, 10) === String(r.day).slice(0, 10) && (s.tg_user_id == null || String(s.tg_user_id) === String(r.tg_user_id));
  }).map(r => { const s = ok[+r.season_id]; return s ? { ...r, w: s.w, d: s.d, l: s.l, pts: s.w * 3 + s.d, gf: s.gf, ga: s.ga, place: s.place } : r; }));
}

// загальний залік ліги: перемоги в днях (минулі дні + сьогодні)
async function standings(chat_id) {
  const rows = await onlyVerified(await sb(`league_results?chat_id=eq.${chat_id}&select=day,tg_user_id,name,pts,gf,ga,created_at,season_id&order=day.desc&limit=3000`) || []);
  const byDay = {}; for (const r of rows) (byDay[r.day] = byDay[r.day] || []).push(r);
  const st = {};
  for (const [day, list] of Object.entries(byDay)) {
    list.sort(sortRes);
    for (const r of list) { const s = st[r.tg_user_id] || (st[r.tg_user_id] = { name: r.name, u: r.u, wins: 0, days: 0, pts: 0 }); s.days++; s.pts += r.pts; s.name = r.name; }
    st[list[0].tg_user_id].wins++;
  }
  return Object.values(st).sort((a, b) => b.wins - a.wins || b.pts / b.days - a.pts / a.days);
}

async function boardText(chat_id, day) {
  const [lg] = await sb(`leagues?chat_id=eq.${chat_id}&select=title`) || [];
  const rows = (await onlyVerified(await sb(`league_results?chat_id=eq.${chat_id}&day=eq.${day}&select=*`) || [])).sort(sortRes);
  const members = (await sb(`league_members?chat_id=eq.${chat_id}&select=tg_user_id`) || []).length;
  const medal = ['🥇', '🥈', '🥉'];
  let t = `<b>🏟 Ліга «${esc(lg ? lg.title : 'група')}»</b>\nДрафт дня №${dayNo(day)} · ${dayShort(day)} — однакове колесо для всіх\n\n`;
  if (!rows.length) t += 'Сьогодні ще ніхто не зіграв. Будь першим!';
  else t += rows.map((r, i) => `${medal[i] || (i + 1) + '.'} ${esc(r.name)} — <b>${r.pts}</b> (${r.w}-${r.d}-${r.l}, ${r.gf}:${r.ga})${r.trophies && r.trophies.length ? ' 🏆' : ''}`).join('\n');
  t += `\n\nЗіграли: ${rows.length} з ${Math.max(members, rows.length)}`;
  return t;
}

// одне повідомлення-табло на день: редагуємо, а не шлемо нові
async function upsertBoard(chat_id, day, { forceNew = false } = {}) {
  const text = await boardText(chat_id, day);
  const [b] = await sb(`league_boards?chat_id=eq.${chat_id}&day=eq.${day}&select=message_id`) || [];
  if (b && b.message_id && !forceNew) {
    const r = await tg('editMessageText', { chat_id, message_id: b.message_id, text, parse_mode: 'HTML', reply_markup: playKb(chat_id), disable_web_page_preview: true });
    if (r.ok || /not modified/.test(r.description || '')) return b.message_id;
  }
  const m = await tg('sendMessage', { chat_id, text, parse_mode: 'HTML', reply_markup: playKb(chat_id), disable_web_page_preview: true });
  if (!m.ok) throw new Error('send: ' + m.description);
  const mid = m.result.message_id;
  await tg('pinChatMessage', { chat_id, message_id: mid, disable_notification: true });   // вийде, лише якщо бот — адмін
  await sb('league_boards?on_conflict=chat_id,day', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id, day, message_id: mid } });
  return mid;
}

// 0.69.4 (власник 02.10, група «трицать восем нуль»): Telegram перетворив групу на супергрупу (новий chat_id «-100…»),
// а ліга, учасники й результати лишились на старому номері — кнопка табло вела в «мертву» групу, вступ відмовляв.
// Копіюємо лігу на новий номер (старі рядки не видаляємо — DECISIONS п. 13); повторний виклик нічого не дублює.
async function migrateLeague(from, to) {
  if (!from || !to || String(from) === String(to)) return false;
  const [lg] = await sb(`leagues?chat_id=eq.${from}&select=*`) || [];
  if (!lg) return false;
  const put = (t, conflict, rows) => rows.length ? sb(`${t}?on_conflict=${conflict}`, { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: rows }) : null;
  await put('leagues', 'chat_id', [{ ...lg, chat_id: to }]);
  await put('league_members', 'chat_id,tg_user_id', (await sb(`league_members?chat_id=eq.${from}&select=*`) || []).map(r => ({ ...r, chat_id: to })));
  await put('league_results', 'chat_id,day,tg_user_id', (await sb(`league_results?chat_id=eq.${from}&select=*`) || []).map(r => ({ ...r, chat_id: to })));
  return true;
}

return { SB_URL, env, esc, tg, sb, kyivDate, migrateLeague, dayNo, dayShort, checkMiniApp, nameOf, playUrl, playKb, sortRes, onlyVerified, standings, boardText, upsertBoard };
})();

module.exports = L;
