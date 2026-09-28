// 30-0 УПЛ — Telegram-бот (Vercel serverless function, адреса: /api/bot)
// Змінні оточення у Vercel: TG_TOKEN, TG_SECRET, TG_BOT, SUPABASE_SERVICE_KEY
const L = require('./_lib');
const SITE = 'https://upl-30-0.vercel.app/';
const SB_KEY = 'sb_publishable_pEszTOPsCHLgpiPpwB4JKg_SS-X07hY'; // публічний ключ, як і на сайті

function playButton(isPrivate) {
  // у приватному чаті — кнопка Mini App; у групах Telegram такі кнопки не дозволяє, тож посилання на головний Mini App бота
  if (isPrivate) return { text: '▶️ Грати', web_app: { url: SITE } };
  return { text: '▶️ Грати', url: `https://t.me/${L.env('TG_BOT') || 'upl30_bot'}?startapp` };
}

async function topToday() {
  const day = L.kyivDate();
  const r = await fetch(`${L.SB_URL}/rest/v1/daily_results?apikey=${SB_KEY}&day=eq.${day}&select=nickname,w,d,l,pts,gf,ga&order=pts.desc,ga.asc,gf.desc&limit=10`);
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
  if (L.env('TG_SECRET') && req.headers['x-telegram-bot-api-secret-token'] !== L.env('TG_SECRET'))
    return res.status(401).send('bad secret');
  try {
    const u = req.body || {};
    // бота додали в групу
    const mc = u.my_chat_member;
    if (mc && mc.chat && mc.chat.type !== 'private' && ['member', 'administrator'].includes(mc.new_chat_member.status) && !['member', 'administrator'].includes(mc.old_chat_member.status)) {
      await L.tg('sendMessage', { chat_id: mc.chat.id, text: GROUP_HELLO });
    }
    const m = u.message;
    if (m && typeof m.text === 'string') {
      const chat = m.chat, isPrivate = chat.type === 'private';
      const cmd = m.text.trim().split(/[\s@]/)[0].toLowerCase();
      if (cmd === '/start' || cmd === '/help') {
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
