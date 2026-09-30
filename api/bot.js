// 30-0 УПЛ — Telegram-бот (Vercel serverless function, адреса: /api/bot)
// Змінні оточення у Vercel: TG_TOKEN, TG_SECRET (обов'язкова, інакше 401), TG_BOT, SUPABASE_SERVICE_KEY
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

// з 0.52 у табло й підсумках ліг — лише результати, чий сезон сервер перевірив (цифри беремо із сезону, а не з браузера).
// Дні до VERIFIED_FROM показуємо як були, щоб не переписувати історію ліг.
const VERIFIED_FROM = '2026-10-01';
async function onlyVerified(rows) {
  const ids = [...new Set(rows.filter(r => String(r.day) >= VERIFIED_FROM).map(r => +r.season_id).filter(Boolean))];
  const ok = {};
  for (let i = 0; i < ids.length; i += 100)
    for (const s of await sb(`seasons?id=in.(${ids.slice(i, i + 100).join(',')})&verified=is.true&practice=is.false&select=id,day,tg_user_id,w,d,l,gf,ga,place`) || []) ok[s.id] = s;
  return rows.filter(r => {
    if (String(r.day) < VERIFIED_FROM) return true;
    const s = ok[+r.season_id];
    return !!s && String(s.day).slice(0, 10) === String(r.day).slice(0, 10) && (s.tg_user_id == null || String(s.tg_user_id) === String(r.tg_user_id));
  }).map(r => { const s = ok[+r.season_id]; return s ? { ...r, w: s.w, d: s.d, l: s.l, pts: s.w * 3 + s.d, gf: s.gf, ga: s.ga, place: s.place } : r; });
}

// загальний залік ліги: перемоги в днях (минулі дні + сьогодні)
async function standings(chat_id) {
  const rows = await onlyVerified(await sb(`league_results?chat_id=eq.${chat_id}&select=day,tg_user_id,name,pts,gf,ga,created_at,season_id&order=day.desc&limit=3000`) || []);
  const byDay = {}; for (const r of rows) (byDay[r.day] = byDay[r.day] || []).push(r);
  const st = {};
  for (const [day, list] of Object.entries(byDay)) {
    list.sort(sortRes);
    for (const r of list) { const s = st[r.tg_user_id] || (st[r.tg_user_id] = { name: r.name, wins: 0, days: 0, pts: 0 }); s.days++; s.pts += r.pts; s.name = r.name; }
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
const SITE = 'https://upl-30-0.vercel.app/';
const SB_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_pEszTOPsCHLgpiPpwB4JKg_SS-X07hY').trim(); // публічний ключ, як і на сайті

function playButton(isPrivate) {
  // у приватному чаті — кнопка Mini App; у групах Telegram такі кнопки не дозволяє, тож посилання на головний Mini App бота
  if (isPrivate) return { text: '▶️ Грати', web_app: { url: SITE } };
  return { text: '▶️ Грати', url: `https://t.me/${L.env('TG_BOT') || 'upl30_bot'}?startapp` };
}

async function topToday() {
  const day = L.kyivDate();
  const r = await fetch(`${L.SB_URL}/rest/v1/daily_results?apikey=${SB_KEY}&day=eq.${day}&verified=is.true&select=nickname,w,d,l,pts,gf,ga&order=pts.desc,ga.asc,gf.desc&limit=10`);
  const rows = r.ok ? await r.json() : [];
  if (!rows.length) return `<b>Виклик дня ${day}</b>\nПоки що ніхто не зіграв. Будь першим!`;
  const medal = ['🥇', '🥈', '🥉'];
  return `<b>Виклик дня ${day} — топ ${rows.length}</b>\n` + rows.map((x, i) =>
    `${medal[i] || (i + 1) + '.'} ${L.esc(x.nickname || 'Анонім')} — <b>${x.pts}</b> (${x.w}-${x.d}-${x.l}, ${x.gf}:${x.ga})`).join('\n');
}

const HELLO = 'Збери XI з усієї історії Прем\'єр-ліги України і пройди сезон 30-0.\n\n' +
  'Колесо видає клуб і сезон, з кожного береш одного гравця. Одинадцять обертів — і 30 турів чемпіонату.\n\n' +
  '/play — грати\n/top — таблиця виклику дня\n\nДодай мене в групу з друзями й напиши там /league — буде ліга вашої групи.';
const GROUP_HELLO = 'Привіт! Я — 30-0 УПЛ ⚽️\n\nНапишіть /league — створю лігу вашої групи. Щодня однакове колесо для всіх, ' +
  'таблиця дня оновлюється сама, а ввечері підсумок: хто виграв день і хто відкрив трофеї.\n\n' +
  'Порада: зробіть мене адміністратором (лише «Закріплення повідомлень»), щоб я закріплював табло.';

async function league(chat, from) {
  const chat_id = chat.id;
  const exists = (await L.sb(`leagues?chat_id=eq.${chat_id}&select=chat_id`) || []).length > 0;
  await L.sb('leagues?on_conflict=chat_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id, title: String(chat.title || 'Група').slice(0, 60), created_by: from && from.id } });
  if (from && !from.is_bot) await L.sb('league_members?on_conflict=chat_id,tg_user_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id, tg_user_id: from.id, name: L.nameOf(from) } });
  if (!exists) await L.tg('sendMessage', { chat_id, text: '🏟 Лігу групи створено! Грайте виклик дня з кнопки під табло — результати потраплять сюди автоматично. Підсумок дня — щовечора близько 21:00 за Києвом.' });
  await L.upsertBoard(chat_id, L.kyivDate(), { forceNew: true });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('30-0 УПЛ bot is alive');
  // вебхук приймає лише запити від Telegram із секретом (setWebhook … secret_token = TG_SECRET); без TG_SECRET у Vercel — 401 для всіх
  const secret = L.env('TG_SECRET'), got = String((req.headers && req.headers['x-telegram-bot-api-secret-token']) || '');
  if (!secret || got.length !== secret.length || !require('crypto').timingSafeEqual(Buffer.from(got), Buffer.from(secret)))
    return res.status(401).send('bad secret');
  try {
    const u = req.body || {};
    // бота додали в групу
    const mc = u.my_chat_member;
    if (mc && mc.chat && mc.chat.type !== 'private' && ['member', 'administrator'].includes(mc.new_chat_member.status) && !['member', 'administrator'].includes(mc.old_chat_member.status)) {
      await L.tg('sendMessage', { chat_id: mc.chat.id, text: GROUP_HELLO });
    }
    // кнопка «Підтвердити вхід»: прив'язуємо токен входу до того, хто натиснув (лише у власному приватному чаті з ботом, кнопка живе 10 хвилин)
    const cq = u.callback_query;
    if (cq && typeof cq.data === 'string' && /^login_[a-f0-9]{32}$/.test(cq.data)) {
      const f = cq.from || {}, msg = cq.message || {};
      const own = msg.chat && msg.chat.type === 'private' && String(msg.chat.id) === String(f.id);
      const fresh = msg.date && Date.now() / 1000 - msg.date < 600;
      if (!own || !fresh) {
        await L.tg('answerCallbackQuery', { callback_query_id: cq.id, text: fresh ? 'Цю кнопку може натиснути лише той, хто входить.' : 'Посилання застаріло — натисни «Увійти через Telegram» на сайті ще раз.', show_alert: true });
      } else {
        const row = { token: cq.data.slice(6), tg_id: f.id, first_name: f.first_name || null, last_name: f.last_name || null, username: f.username || null };
        await L.sb('tg_logins?on_conflict=token', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: row });
        // бот один на обидві бази: якщо у Vercel задано тестову базу, той самий токен входу пишемо й туди — тоді вхід через бота працює і на тестовому сайті
        const tUrl = String(process.env.TEST_SUPABASE_URL || '').trim(), tKey = String(process.env.TEST_SUPABASE_SERVICE_KEY || '').replace(/\s+/g, '');
        if (tUrl && tKey) {
          try { await fetch(`${tUrl}/rest/v1/tg_logins?on_conflict=token`, { method: 'POST', headers: { apikey: tKey, Authorization: `Bearer ${tKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(row) }); } catch (e) {}
        }
        await L.tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Вхід підтверджено' });
        await L.tg('editMessageText', { chat_id: msg.chat.id, message_id: msg.message_id, text: '✅ Вхід підтверджено. Повернись у браузер — гра вже знає, що це ти.' });
      }
    }
    const m = u.message;
    if (m && typeof m.text === 'string') {
      const chat = m.chat, isPrivate = chat.type === 'private';
      const cmd = m.text.trim().split(/[\s@]/)[0].toLowerCase();
      const arg = m.text.trim().split(/\s+/)[1] || '';
      if (cmd === '/start' && isPrivate && /^login_[a-f0-9]{32}$/.test(arg)) {
        // вхід на сайт через бота: браузер відкрив t.me/upl30_bot?start=login_<токен>. Одразу не прив'язуємо — посилання могли підсунути;
        // прив'язуємо лише після кнопки «Підтвердити вхід» (callback нижче) від цього ж користувача
        await L.tg('sendMessage', { chat_id: chat.id, text: '🔐 Вхід у 30-0 УПЛ на сайті upl-30-0.vercel.app.\n\nНатисни «Підтвердити вхід», лише якщо це ти щойно натиснув «Увійти через Telegram» у своєму браузері. Якщо ні — просто проігноруй це повідомлення.',
          reply_markup: { inline_keyboard: [[{ text: '✅ Підтвердити вхід', callback_data: arg }]] } });
      } else if (cmd === '/start' || cmd === '/help') {
        await L.tg('sendMessage', { chat_id: chat.id, text: isPrivate ? HELLO : GROUP_HELLO, reply_markup: { inline_keyboard: [[playButton(isPrivate)]] } });
      } else if (cmd === '/play') {
        const hasLeague = !isPrivate && (await L.sb(`leagues?chat_id=eq.${chat.id}&select=chat_id`) || []).length > 0;
        await L.tg('sendMessage', { chat_id: chat.id, text: 'Погнали! 🎡', reply_markup: hasLeague ? L.playKb(chat.id) : { inline_keyboard: [[playButton(isPrivate)]] } });
      } else if (cmd === '/league' || cmd === '/liga' || cmd === '/ліга') {
        if (isPrivate) await L.tg('sendMessage', { chat_id: chat.id, text: 'Ліги працюють у групах: додай мене в чат з друзями й напиши там /league.' });
        else await league(chat, m.from);
      } else if (cmd === '/top' || cmd === '/table') {
        const hasLeague = !isPrivate && (await L.sb(`leagues?chat_id=eq.${chat.id}&select=chat_id`) || []).length > 0;
        if (hasLeague) await L.upsertBoard(chat.id, L.kyivDate(), { forceNew: true });
        else await L.tg('sendMessage', { chat_id: chat.id, text: await topToday(), parse_mode: 'HTML', reply_markup: { inline_keyboard: [[playButton(isPrivate)]] } });
      }
    }
  } catch (e) { console.error(e); }
  res.status(200).send('ok'); // завжди 200, інакше Telegram повторює запит
};
