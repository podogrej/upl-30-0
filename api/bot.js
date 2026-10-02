// 30-0 УПЛ — Telegram-бот (Vercel serverless function, адреса: /api/bot)
// Змінні оточення у Vercel: TG_TOKEN, TG_SECRET (обов'язкова, інакше 401), TG_BOT, SUPABASE_SERVICE_KEY
const L = require('./_league.js');   // спільні функції ліг груп (0.60: одна копія замість трьох)
const SITE = 'https://upl30.com.ua/';   // 0.68: свій домен   // 0.62.1: з 0.60 рядок випадково опинився в коментарі — /start, /play, /top в особистому чаті падали
const SB_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_pEszTOPsCHLgpiPpwB4JKg_SS-X07hY').trim(); // публічний ключ, як і на сайті

function playButton(isPrivate) {
  // у приватному чаті — кнопка Mini App; у групах Telegram такі кнопки не дозволяє, тож посилання на головний Mini App бота
  if (isPrivate) return { text: '▶️ Грати', web_app: { url: SITE } };
  return { text: '▶️ Грати', url: `https://t.me/${L.env('TG_BOT') || 'upl30_bot'}?startapp` };
}

async function topToday() {
  const day = L.kyivDate();
  // ім'я — з профілю гравця (players), копія nickname — лише якщо профілю немає (аудит В5)
  const q = sel => fetch(`${L.SB_URL}/rest/v1/daily_results?apikey=${SB_KEY}&day=eq.${day}&verified=is.true&select=${sel}&order=pts.desc,ga.asc,gf.desc&limit=30`);
  let r = await q('nickname,w,d,l,pts,gf,ga,player_id,players(name,anon_name)'); if (!r.ok) r = await q('nickname,w,d,l,pts,gf,ga');
  // у гравця може бути два результати дня (0.60: об'єднані входи з двох пристроїв) — лише кращий
  const seen = new Set();
  const rows = (r.ok ? await r.json() : []).filter(x => !x.player_id || (!seen.has(x.player_id) && seen.add(x.player_id))).slice(0, 10);
  if (!rows.length) return `<b>Драфт дня ${day}</b>\nПоки що ніхто не зіграв. Будь першим!`;
  const medal = ['🥇', '🥈', '🥉'];
  return `<b>Драфт дня ${day} — топ ${rows.length}</b>\n` + rows.map((x, i) =>
    `${medal[i] || (i + 1) + '.'} ${L.esc(x.players && (x.players.name || x.players.anon_name) ? String(x.players.name || x.players.anon_name) : (x.nickname || 'Анонім'))} — <b>${x.pts}</b> (${x.w}-${x.d}-${x.l}, ${x.gf}:${x.ga})`).join('\n');
}

const HELLO = 'Збери XI з усієї історії Прем\'єр-ліги України і пройди сезон 30-0.\n\n' +
  'Колесо видає клуб і сезон, з кожного береш одного гравця. Одинадцять обертів — і 30 турів чемпіонату.\n\n' +
  '/play — грати\n/top — таблиця драфту дня\n\nДодай мене в групу з друзями й напиши там /league — буде ліга вашої групи.';
const GROUP_HELLO = 'Привіт! Я — 30-0 УПЛ ⚽️\n\nНапишіть /league — створю лігу вашої групи. Щодня однакове колесо для всіх, ' +
  'таблиця дня оновлюється сама, а ввечері підсумок: хто виграв день і хто відкрив трофеї.\n\n' +
  'Порада: зробіть мене адміністратором (лише «Закріплення повідомлень»), щоб я закріплював табло.';

async function league(chat, from) {
  const chat_id = chat.id;
  const exists = (await L.sb(`leagues?chat_id=eq.${chat_id}&select=chat_id`) || []).length > 0;
  await L.sb('leagues?on_conflict=chat_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id, title: String(chat.title || 'Група').slice(0, 60), created_by: from && from.id } });
  if (from && !from.is_bot) await L.sb('league_members?on_conflict=chat_id,tg_user_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id, tg_user_id: from.id, name: L.nameOf(from) } });
  if (!exists) await L.tg('sendMessage', { chat_id, text: '🏟 Лігу групи створено! Грайте драфт дня з кнопки під табло — результати потраплять сюди автоматично. Підсумок дня — щовечора близько 21:00 за Києвом.' });
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
    const joined = mc && mc.chat && ['member', 'administrator'].includes(mc.new_chat_member.status) && !['member', 'administrator'].includes(mc.old_chat_member.status);
    // 0.67: службовий канал для карток (api/card.js, TG_CARDS_CHAT) — бот-адмін каналу пише його ID, щоб власник вписав його у Vercel
    if (mc && mc.chat && mc.chat.type === 'channel' && mc.new_chat_member.status === 'administrator' && mc.old_chat_member.status !== 'administrator') {
      await L.tg('sendMessage', { chat_id: mc.chat.id, text: `Канал для карток підключено ✅\nID каналу: ${mc.chat.id}\nУпиши його у Vercel → Settings → Environment Variables як TG_CARDS_CHAT і зроби Redeploy.` });
    } else if (joined && mc.chat.type !== 'private' && mc.chat.type !== 'channel') {
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
    // 0.69.4: група стала супергрупою — Telegram шле в нову службове повідомлення з migrate_from_chat_id: переносимо лігу
    if (m && m.migrate_from_chat_id && m.chat) { try { await L.migrateLeague(m.migrate_from_chat_id, m.chat.id); } catch (e) { console.error('migrate', e.message); } }
    if (m && typeof m.text === 'string') {
      const chat = m.chat, isPrivate = chat.type === 'private';
      const cmd = m.text.trim().split(/[\s@]/)[0].toLowerCase();
      const arg = m.text.trim().split(/\s+/)[1] || '';
      if (cmd === '/start' && isPrivate && /^login_[a-f0-9]{32}$/.test(arg)) {
        // вхід на сайт через бота: браузер відкрив t.me/upl30_bot?start=login_<токен>. Одразу не прив'язуємо — посилання могли підсунути;
        // прив'язуємо лише після кнопки «Підтвердити вхід» (callback нижче) від цього ж користувача
        await L.tg('sendMessage', { chat_id: chat.id, text: '🔐 Вхід у 30-0 УПЛ на сайті upl30.com.ua.\n\nНатисни «Підтвердити вхід», лише якщо це ти щойно натиснув «Увійти через Telegram» у своєму браузері. Якщо ні — просто проігноруй це повідомлення.',
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
