// 30-0 UPL: shared Telegram group league helpers for api/bot.js, api/cron.js, api/league.js ("_" prefix: not a route).
const L = (() => {
const { SB_URL, env, sb, sbAll, kyivDate, miniApp } = require('./_lib.js');
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

const checkMiniApp = initData => miniApp(initData);   // {user, start_param} or null
const nameOf = u => ([u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Гравець').slice(0, 40);

const playUrl = chat_id => `https://t.me/${env('TG_BOT') || 'upl30_bot'}?startapp=g${chat_id}`;
const playKb = chat_id => ({ inline_keyboard: [[{ text: '▶️ Грати', url: playUrl(chat_id) }]] });
const RULE = 'У лігу йде найкращий із перших трьох сезонів дня у «Грати».';

const cmpRes = (a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf;   // < 0: a is better
const sortRes = (a, b) => cmpRes(a, b) || String(a.created_at).localeCompare(String(b.created_at));

// board name comes from the player profile (players.name, else anonymous; lowercase Latin since 0.59), not a copy of the Telegram name in the row.
// Player is found via Telegram link (player_links, kind = 'tg'); no link or SQL 0.59 not applied -> name from the row.
// tg_user_id -> player profile (batches of 100 keys run in parallel)
async function nameMap(rows) {
  const keys = [...new Set(rows.map(r => r.tg_user_id).filter(x => x != null && /^\d+$/.test(String(x))).map(String))];
  const pl = {};
  const batches = [];
  for (let i = 0; i < keys.length; i += 100) batches.push(keys.slice(i, i + 100));
  await Promise.all(batches.map(async b => {
    const q = `player_links?kind=eq.tg&key=in.(${b.join(',')})&select=key,players(name,anon_name,public_id)`;
    let ls = []; try { ls = await sb(q) || []; } catch (e) { try { ls = await sb(q.replace(',public_id', '')) || []; } catch (e2) { console.warn('names', e2.message); } }
    for (const l of ls) if (l.players) pl[l.key] = l.players;
  }));
  return pl;
}
const applyNames = (rows, pl) => rows.map(r => { const p = pl[String(r.tg_user_id)]; const n = p && (p.name || p.anon_name);
  return n ? { ...r, name: String(n), u: p.public_id || undefined } : r; });
// Kyiv day of a season: the daily draft carries it, free play has only created_at
const seasonDay = s => (s.day ? String(s.day).slice(0, 10) : kyivDate(s.created_at ? new Date(s.created_at) : new Date()));
// league boards and summaries count only server-verified seasons (numbers taken from the season, not the browser).
// Days before VERIFIED_FROM are shown as they were, to keep league history intact.
const VERIFIED_FROM = '2026-10-01';
async function onlyVerified(rows) {
  const ids = [...new Set(rows.filter(r => String(r.day) >= VERIFIED_FROM).map(r => +r.season_id).filter(Boolean))];
  const ok = {};
  const batches = [];
  for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100));
  // season checks and name lookup are independent: run all batches at once (names for all rows; unverified ones are dropped below)
  const [, pl] = await Promise.all([
    Promise.all(batches.map(async b => { for (const s of await sb(`seasons?id=in.(${b.join(',')})&verified=is.true&practice=is.false&select=id,day,created_at,tg_user_id,w,d,l,gf,ga,place`) || []) ok[s.id] = s; })),
    nameMap(rows)]);
  return applyNames(rows.filter(r => {
    if (String(r.day) < VERIFIED_FROM) return true;
    const s = ok[+r.season_id];
    return !!s && seasonDay(s) === String(r.day).slice(0, 10) && (s.tg_user_id == null || String(s.tg_user_id) === String(r.tg_user_id));
  }).map(r => { const s = ok[+r.season_id]; return s ? { ...r, w: s.w, d: s.d, l: s.l, pts: s.w * 3 + s.d, gf: s.gf, ga: s.ga, place: s.place } : r; }), pl);
}

// overall league standings: day wins (past days + today) from verified rows
function standingsOf(rows) {
  const byDay = {}; for (const r of rows) (byDay[r.day] = byDay[r.day] || []).push(r);
  const st = {};
  for (const [day, list] of Object.entries(byDay)) {
    list.sort(sortRes);
    for (const r of list) { const s = st[r.tg_user_id] || (st[r.tg_user_id] = { name: r.name, u: r.u, wins: 0, days: 0, pts: 0 }); s.days++; s.pts += r.pts; s.name = r.name; }
    st[list[0].tg_user_id].wins++;
  }
  return Object.values(st).sort((a, b) => b.wins - a.wins || b.pts / b.days - a.pts / a.days);
}
const RES_COLS = 'day,tg_user_id,name,w,d,l,pts,gf,ga,created_at,season_id';
// all league rows (newest days first) for standings; today's rows are part of it. Paged: one request returns at most 1000 rows
const leagueRows = chat_id => sbAll(`league_results?chat_id=eq.${chat_id}&select=${RES_COLS}&order=day.desc,tg_user_id.asc`).then(onlyVerified);
async function standings(chat_id) { return standingsOf(await leagueRows(chat_id)); }

async function boardText(chat_id, day) {
  const [lg] = await sb(`leagues?chat_id=eq.${chat_id}&select=title`) || [];
  const rows = (await onlyVerified(await sb(`league_results?chat_id=eq.${chat_id}&day=eq.${day}&select=*`) || [])).sort(sortRes);
  const members = (await sb(`league_members?chat_id=eq.${chat_id}&select=tg_user_id`) || []).length;
  const medal = ['🥇', '🥈', '🥉'];
  let t = `<b>🏟 Ліга «${esc(lg ? lg.title : 'група')}»</b>\nДень №${dayNo(day)} · ${dayShort(day)}. ${RULE}\n\n`;
  if (!rows.length) t += 'Сьогодні ще ніхто не зіграв. Будь першим!';
  else t += rows.map((r, i) => `${medal[i] || (i + 1) + '.'} ${esc(r.name)} — <b>${r.pts}</b> (${r.w}-${r.d}-${r.l}, ${r.gf}:${r.ga})${r.trophies && r.trophies.length ? ' 🏆' : ''}`).join('\n');
  t += `\n\nЗіграли: ${rows.length} з ${Math.max(members, rows.length)}`;
  return t;
}

// one board message per group
// The bot creates and pins it once; each new day edits the same message (each day's league_boards row
// gets the same message_id). A new message + pin only if the old one is missing or can't be edited
// (deleted). copy: true (/top, /league in an existing league): after updating, also send an unpinned copy of the board.
async function upsertBoard(chat_id, day, { copy = false } = {}) {
  const text = await boardText(chat_id, day);
  const opts = { parse_mode: 'HTML', reply_markup: playKb(chat_id), disable_web_page_preview: true };
  const [b] = await sb(`league_boards?chat_id=eq.${chat_id}&message_id=not.is.null&select=day,message_id&order=day.desc&limit=1`) || [];
  let mid = null;
  if (b && b.message_id) {
    const r = await tg('editMessageText', { chat_id, message_id: b.message_id, text, ...opts });
    if (r.ok || /not modified/.test(r.description || '')) mid = b.message_id;
  }
  const fresh = !mid;
  if (fresh) {
    const m = await tg('sendMessage', { chat_id, text, ...opts });
    if (!m.ok) throw new Error('send: ' + m.description);
    mid = m.result.message_id;
    await tg('pinChatMessage', { chat_id, message_id: mid, disable_notification: true });   // succeeds only if the bot is an admin
  }
  if (fresh || !b || String(b.day).slice(0, 10) !== day)
    await sb('league_boards?on_conflict=chat_id,day', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id, day, message_id: mid } });
  if (copy && !fresh) await tg('sendMessage', { chat_id, text, ...opts });
  return mid;
}

// ---------- Chat leagues count free play (DECISIONS item 11): classic, normal level, all years, not daily / practice / friends league.
// Each Kyiv day the player's first DAY_N verified such seasons count; the league row holds the best of them (cmpRes).
const DAY_N = 3;
const leagueFree = s => !!s && s.verified === true && s.format === 'classic' && s.mode === 'normal' && !s.practice && !s.day && !s.fl_id && (s.era == null || s.era === 'all');
// UTC start of a Kyiv day (UTC+3 in summer, UTC+2 in winter)
const dayStart = day => { const t = Date.parse(day + 'T00:00:00Z'); return new Date(t - (kyivDate(new Date(t - 3 * 36e5)) === day ? 3 : 2) * 36e5).toISOString(); };
const nextDay = day => new Date(Date.parse(day + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
// best of the first DAY_N qualifying verified seasons of the day; who: PostgREST filter of the player's seasons
async function dayBest(who, day) {
  const rows = await sb(`seasons?${who}&created_at=gte.${dayStart(day)}&created_at=lt.${dayStart(nextDay(day))}&format=eq.classic&mode=eq.normal&practice=is.false&day=is.null&fl_id=is.null&era=is.null&verified=is.true`
    + `&select=id,w,d,l,place,gf,ga,xp,formation,created_at&order=created_at.asc,id.asc&limit=${DAY_N}`) || [];
  return rows.map(s => ({ ...s, pts: s.w * 3 + s.d })).sort(cmpRes)[0] || null;
}
// write best into league_results for members [{chat_id, tg_user_id, name}] when it beats the current row; returns changed chats.
// Existing rows keep their name (it may be anonymised after account deletion); the season_id filter makes a racing write a no-op.
async function putBest(best, day, members) {
  if (!best || !members.length) return [];
  const chats = [...new Set(members.map(m => m.chat_id))], ids = [...new Set(members.map(m => m.tg_user_id))];
  const have = await sb(`league_results?day=eq.${day}&chat_id=in.(${chats.join(',')})&tg_user_id=in.(${ids.join(',')})&select=chat_id,tg_user_id,pts,gf,ga,season_id`) || [];
  const num = { w: best.w, d: best.d, l: best.l, pts: best.pts, place: best.place, gf: best.gf, ga: best.ga, xp: best.xp == null ? null : +best.xp, formation: best.formation, season_id: best.id };
  const changed = await Promise.all(members.map(async m => {
    const e = have.find(r => String(r.chat_id) === String(m.chat_id) && String(r.tg_user_id) === String(m.tg_user_id));
    if (e && (+e.season_id === +best.id || cmpRes(best, e) >= 0)) return null;
    if (e) await sb(`league_results?chat_id=eq.${m.chat_id}&day=eq.${day}&tg_user_id=eq.${m.tg_user_id}&season_id=${e.season_id == null ? 'is.null' : 'eq.' + e.season_id}`, { method: 'PATCH', prefer: 'return=minimal', body: num });
    else await sb('league_results?on_conflict=chat_id,day,tg_user_id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: { chat_id: m.chat_id, day, tg_user_id: m.tg_user_id, name: m.name, trophies: [], ...num } });
    return m.chat_id;
  }));
  return [...new Set(changed.filter(c => c != null))];
}
// a season was just verified: update every chat league of its player, then their pinned boards
async function creditSeason(row) {
  if (!leagueFree(row)) return [];
  const ids = new Set(row.tg_user_id ? [String(row.tg_user_id)] : []);
  if (row.player_id) for (const l of await sb(`player_links?kind=eq.tg&player_id=eq.${row.player_id}&select=key`) || []) if (/^\d+$/.test(String(l.key))) ids.add(String(l.key));
  if (!ids.size) return [];
  const members = await sb(`league_members?tg_user_id=in.(${[...ids].join(',')})&select=chat_id,tg_user_id,name`) || [];
  if (!members.length) return [];
  const day = seasonDay(row);
  const best = await dayBest(row.player_id ? `player_id=eq.${row.player_id}` : `device_id=eq.${encodeURIComponent(row.device_id)}`, day);
  const changed = await putBest(best, day, members);
  await Promise.all(changed.map(c => upsertBoard(c, day).catch(e => console.error('board', c, e.message))));
  return changed;
}

// When Telegram upgrades a group to a supergroup (new chat_id "-100..."), the league, members and results stay on the old id.
// Copy the league to the new id (old rows are kept, DECISIONS item 13); repeated calls don't duplicate.
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

return { SB_URL, env, esc, tg, sb, sbAll, kyivDate, migrateLeague, dayNo, dayShort, checkMiniApp, nameOf, playUrl, playKb, RULE, sortRes, cmpRes, onlyVerified, DAY_N, leagueFree, dayBest, putBest, creditSeason, standings, standingsOf, leagueRows, RES_COLS, boardText, upsertBoard };
})();

module.exports = L;
