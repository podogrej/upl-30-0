// 30-0 УПЛ — ліги груп Telegram (адреса /api/league)
// POST {initData, result?}: перевіряє підпис Telegram, додає гравця в лігу групи (якщо гру відкрито з кнопки групи)
//   і записує офіційний результат виклику дня в усі його ліги, оновлюючи табло в чатах.
//   Вступ — лише якщо бот бачить гравця учасником групи (getChatMember, з 0.55), у табло — лише перевірені сезони (з 0.52).
// GET ?chat=ID: дані ліги для картки в грі.
const L = (() => {   // спільні функції (вбудовано, щоб файл не залежав від інших)
const crypto = require('crypto');
const SB_URL = (process.env.SUPABASE_URL || 'https://qruhcbwycrnfgzzdbljr.supabase.co').trim();   // у тестовому оточенні Vercel — адреса тестової бази
const env = k => String(process.env[k] || '').replace(/\s+/g, '');
const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env('TG_TOKEN')}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
}

// запити до бази з правами сервера (ключ лише у Vercel)
async function sb(path, { method = 'GET', body, prefer } = {}) {
  const key = env('SUPABASE_SERVICE_KEY');
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
  if (!r.ok) throw new Error(`db ${r.status}: ${t.slice(0, 150)}`);
  return j;
}

function kyivDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
const LAUNCH = Date.UTC(2026, 8, 28);
const dayNo = day => Math.max(1, Math.round((Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) - LAUNCH) / 864e5) + 1);
const dayShort = day => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

// перевірка підпису Mini App (initData) — повертає {user, start_param} або null
function checkMiniApp(initData) {
  const token = env('TG_TOKEN');
  const p = new URLSearchParams(initData || ''); const hash = p.get('hash'); if (!hash) return null;
  p.delete('hash');
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  if (crypto.createHmac('sha256', secret).update(dcs).digest('hex') !== hash) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date') || 0) > 86400) return null;
  let user = null; try { user = JSON.parse(p.get('user')); } catch (e) {}
  return user ? { user, start_param: p.get('start_param') || '' } : null;
}
const nameOf = u => ([u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Гравець').slice(0, 40);

const playUrl = chat_id => `https://t.me/${env('TG_BOT') || 'upl30_bot'}?startapp=g${chat_id}`;
const playKb = chat_id => ({ inline_keyboard: [[{ text: '▶️ Зіграти виклик дня', url: playUrl(chat_id) }]] });

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
  let t = `<b>🏟 Ліга «${esc(lg ? lg.title : 'група')}»</b>\nВиклик дня №${dayNo(day)} · ${dayShort(day)} — однакове колесо для всіх\n\n`;
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

return { SB_URL, env, esc, tg, sb, kyivDate, dayNo, dayShort, checkMiniApp, nameOf, playUrl, playKb, sortRes, onlyVerified, standings, boardText, upsertBoard };
})();

// чи є користувач учасником групи (бот має бути в групі). Помилка Telegram — «ні» (закрито за замовчуванням)
const MEMBER = new Set(['member', 'administrator', 'creator']);
async function isMember(chat_id, user_id) {
  try {
    const r = await L.tg('getChatMember', { chat_id, user_id });
    const st = r && r.ok && r.result ? r.result.status : null;
    return MEMBER.has(st) || (st === 'restricted' && r.result.is_member !== false);
  } catch (e) { return false; }
}

module.exports = async (req, res) => {
  let stage = 'start';
  try {
    if (req.method === 'GET') {
      const chat = String(req.query.chat || '').replace(/[^0-9-]/g, '');
      if (!chat) return res.status(400).json({ error: 'chat?' });
      const [lg] = await L.sb(`leagues?chat_id=eq.${chat}&select=title`) || [];
      if (!lg) return res.status(404).json({ error: 'no league' });
      const day = L.kyivDate();
      const today = (await L.onlyVerified(await L.sb(`league_results?chat_id=eq.${chat}&day=eq.${day}&select=name,w,d,l,pts,gf,ga,created_at,day,tg_user_id,season_id`) || []))
        .sort(L.sortRes).map(({ name, u, w, d, l, pts, gf, ga, created_at }) => ({ name, u, w, d, l, pts, gf, ga, created_at }));
      const members = (await L.sb(`league_members?chat_id=eq.${chat}&select=tg_user_id`) || []).length;
      return res.status(200).json({ title: lg.title, day, today, members, standings: (await L.standings(chat)).slice(0, 10) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
    let b = req.body || {}; if (typeof b === 'string') b = JSON.parse(b);
    stage = 'signature';
    const v = L.checkMiniApp(b.initData);
    if (!v) return res.status(401).json({ error: 'bad telegram signature' });
    const u = v.user, name = L.nameOf(u);
    const joined = [];
    // гру відкрито з кнопки групи → вступаємо в лігу цієї групи
    stage = 'join';
    const m = /^g(-?\d+)$/.exec(v.start_param || '');
    if (m) {
      const chat_id = m[1];
      const [lg] = await L.sb(`leagues?chat_id=eq.${chat_id}&select=chat_id,title`) || [];
      // В1 (0.55): вступити можна лише в лігу групи, де бот бачить гравця учасником (getChatMember). Інакше — 403
      // (з результатом у запиті — вступ пропускаємо, результат іде лише в ліги, де гравець уже є).
      if (lg && !(await isMember(chat_id, u.id))) {
        if (!b.result) return res.status(403).json({ error: 'not a member of this chat' });
        lg.denied = true;
      }
      if (lg && !lg.denied) {
        await L.sb('league_members?on_conflict=chat_id,tg_user_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id, tg_user_id: u.id, name } });
        joined.push({ chat_id, title: lg.title });
      }
    }
    const r = b.result;
    if (!r) return res.status(200).json({ ok: true, joined });
    // перевірка результату
    stage = 'result';
    const n = k => Number.isFinite(+r[k]) ? Math.round(+r[k]) : null;
    const w = n('w'), d = n('d'), l = n('l'), pts = n('pts'), gf = n('gf'), ga = n('ga'), place = n('place');
    if (w + d + l !== 30 || pts !== w * 3 + d || !(place >= 1 && place <= 16)) return res.status(400).json({ error: 'bad result' });
    const today = L.kyivDate(), yday = L.kyivDate(new Date(Date.now() - 864e5));
    const day = r.day === yday ? yday : today;
    const trophies = Array.isArray(r.trophies) ? r.trophies.slice(0, 12).map(x => String(x).slice(0, 40)) : [];
    // сезон цього результату: з браузера (season_id) або перша не-тренувальна спроба дня цього гравця Telegram.
    // У табло потрапить лише тоді, коли сервер перевірить цей сезон (L.onlyVerified).
    stage = 'season';
    let season_id = +r.season_id || null;
    if (!season_id) { const [s] = await L.sb(`seasons?tg_user_id=eq.${u.id}&day=eq.${day}&practice=is.false&select=id&order=created_at.asc&limit=1`) || []; season_id = s ? s.id : null; }
    stage = 'leagues';
    const my = await L.sb(`league_members?tg_user_id=eq.${u.id}&select=chat_id,leagues(title)`) || [];
    const posted = [];
    for (const row of my) {
      // лише перша офіційна спроба дня
      await L.sb('league_results?on_conflict=chat_id,day,tg_user_id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
        body: { chat_id: row.chat_id, day, tg_user_id: u.id, name, w, d, l, pts, place, gf, ga, xp: +r.xp || null, formation: String(r.formation || '').slice(0, 8), trophies, season_id } });
      try { await L.upsertBoard(row.chat_id, day); } catch (e) { console.error('board', row.chat_id, e.message); }
      posted.push(row.leagues ? row.leagues.title : String(row.chat_id));
    }
    res.status(200).json({ ok: true, joined, posted });
  } catch (e) {
    res.status(500).json({ error: `crash at ${stage}: ${String(e && e.message || e).slice(0, 180)}` });
  }
};
