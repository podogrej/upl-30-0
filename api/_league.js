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
const RULE = 'У лігу йде найкращий сезон із перших трьох спроб дня у «Грати».';

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
// Kyiv day of a season: the daily draft carries it; free play counts on its seed's day, saved that day or (past midnight) the next
const nextDay = day => new Date(Date.parse(day + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
const dayOk = (s, day) => { day = String(day).slice(0, 10); if (s.day) return String(s.day).slice(0, 10) === day; const c = kyivDate(s.created_at ? new Date(s.created_at) : new Date()); return c === day || c === nextDay(day); };
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
    return !!s && dayOk(s, r.day) && (s.tg_user_id == null || String(s.tg_user_id) === String(r.tg_user_id));
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
// An attempt is a seed the server issued as a league attempt (season_seeds.official outside the daily draft: classic, normal, all years,
// marked by the browser for free play; api/seed.js). Each Kyiv day the player's first DAY_N such seeds are the attempts; a season counts only if it was played on one of them, so an issued seed that was never saved burns
// its attempt. The league row holds the best counted season (cmpRes).
const DAY_N = 3;
const legends = () => require('../lib/engine.js').LEAGUE_LEGENDS;
const leagueFree = s => !!s && s.verified === true && s.format === 'classic' && s.mode === 'normal' && !s.practice && !s.day && !s.fl_id && (s.era == null || s.era === 'all') && +s.year === legends();
// devices of a player (all linked devices); without a player only the given device
async function devicesOf(pid, device) {
  const ds = pid ? (await sb(`player_links?kind=eq.device&player_id=eq.${pid}&select=key`) || []).map(l => String(l.key)) : [];
  if (device && !ds.includes(String(device))) ds.push(String(device));
  return ds.filter(d => /^[0-9a-f-]{36}$/i.test(d));
}
// best counted season of the day for these devices: first DAY_N attempt seeds, then their verified free-play seasons
async function dayBest(devices, day) {
  if (!devices.length) return null;
  const seeds = await sb(`season_seeds?device_id=in.(${devices.join(',')})&day=eq.${day}&daily=is.false&official=is.true&format=eq.classic&mode=eq.normal&year=eq.${legends()}`
    + `&select=id&order=created_at.asc,id.asc&limit=${DAY_N}`) || [];
  if (!seeds.length) return null;
  const rows = await sb(`seasons?seed_id=in.(${seeds.map(s => s.id).join(',')})&verified=is.true&format=eq.classic&mode=eq.normal&practice=is.false&day=is.null&fl_id=is.null&era=is.null`
    + `&select=id,w,d,l,place,gf,ga,xp,formation,year,seed_id,created_at`) || [];
  return rows.filter(s => +s.year === legends()).map(s => ({ ...s, pts: s.w * 3 + s.d })).sort(cmpRes)[0] || null;
}
// write best into one member's row when it beats the stored one. Existing rows keep their name (it may be anonymised after
// account deletion). Two verifications may race: the PATCH is conditional on the season it read, then the row is read again and
// the write retried while the stored result is still worse (bounded).
async function putOne(best, day, m, num) {
  const key = `chat_id=eq.${m.chat_id}&day=eq.${day}&tg_user_id=eq.${m.tg_user_id}`;
  let wrote = false;
  for (let i = 0; i < 4; i++) {
    const [e] = await sb(`league_results?${key}&select=pts,gf,ga,season_id`) || [];
    if (e && (+e.season_id === +best.id || cmpRes(best, e) >= 0)) return wrote;
    if (e) await sb(`league_results?${key}&season_id=${e.season_id == null ? 'is.null' : 'eq.' + e.season_id}`, { method: 'PATCH', prefer: 'return=minimal', body: num });
    else await sb('league_results?on_conflict=chat_id,day,tg_user_id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: { chat_id: m.chat_id, day, tg_user_id: m.tg_user_id, name: m.name, trophies: [], ...num } });
    wrote = true;
  }
  return wrote;
}
// members [{chat_id, tg_user_id, name}]; returns changed chats
async function putBest(best, day, members) {
  if (!best || !members.length) return [];
  const num = { w: best.w, d: best.d, l: best.l, pts: best.pts, place: best.place, gf: best.gf, ga: best.ga, xp: best.xp == null ? null : +best.xp, formation: best.formation, season_id: best.id };
  const changed = await Promise.all(members.map(async m => (await putOne(best, day, m, num)) ? m.chat_id : null));
  return [...new Set(changed.filter(c => c != null))];
}
// Telegram ids of a player (season's own id and Telegram links) -> their league memberships
async function membersOf(pid, tgId) {
  const ids = new Set(tgId ? [String(tgId)] : []);
  if (pid) for (const l of await sb(`player_links?kind=eq.tg&player_id=eq.${pid}&select=key`) || []) if (/^\d+$/.test(String(l.key))) ids.add(String(l.key));
  return ids.size ? await sb(`league_members?tg_user_id=in.(${[...ids].join(',')})&select=chat_id,tg_user_id,name`) || [] : [];
}
// a season was just verified (seedRow: its seed): update every chat league of its player, then their pinned boards
async function creditSeason(row, seedRow) {
  if (!leagueFree(row) || !seedRow || !seedRow.day || String(seedRow.id) !== String(row.seed_id)) return [];
  const members = await membersOf(row.player_id, row.tg_user_id);
  if (!members.length) return [];
  const day = String(seedRow.day).slice(0, 10);
  const best = await dayBest(await devicesOf(row.player_id, row.device_id), day);
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

return { SB_URL, env, esc, tg, sb, sbAll, kyivDate, migrateLeague, dayNo, dayShort, checkMiniApp, nameOf, playUrl, playKb, RULE, sortRes, cmpRes, onlyVerified, DAY_N, leagueFree, devicesOf, dayBest, putBest, creditSeason, standings, standingsOf, leagueRows, RES_COLS, boardText, upsertBoard };
})();

module.exports = L;
