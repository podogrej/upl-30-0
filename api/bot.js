// 30-0 УПЛ — Telegram-бот (Vercel serverless function, адреса: /api/bot)
// Змінні оточення у Vercel → Settings → Environment Variables:
//   TG_TOKEN  — токен від @BotFather (секрет, у коді його немає)
//   TG_SECRET — будь-який довгий випадковий рядок (Telegram надсилає його в заголовку, так бот відрізняє справжні запити)
//   TG_BOT    — username бота без @, напр. upl300_bot
const SITE = 'https://upl-30-0.vercel.app/';
const SB_URL = 'https://qruhcbwycrnfgzzdbljr.supabase.co';
const SB_KEY = 'sb_publishable_pEszTOPsCHLgpiPpwB4JKg_SS-X07hY'; // публічний ключ, як і на сайті

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${process.env.TG_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
}

function kyivDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function playButton(isPrivate) {
  // у приватному чаті — кнопка Mini App; у групах Telegram такі кнопки не дозволяє, тож посилання на головний Mini App бота
  const bot = process.env.TG_BOT;
  if (isPrivate) return { text: '▶️ Грати', web_app: { url: SITE } };
  return { text: '▶️ Грати', url: bot ? `https://t.me/${bot}?startapp` : SITE };
}

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function topToday() {
  const day = kyivDate();
  const r = await fetch(`${SB_URL}/rest/v1/daily_results?apikey=${SB_KEY}&day=eq.${day}&select=nickname,w,d,l,pts,gf,ga&order=pts.desc,ga.asc,gf.desc&limit=10`);
  const rows = r.ok ? await r.json() : [];
  if (!rows.length) return `<b>Виклик дня ${day}</b>\nПоки що ніхто не зіграв. Будь першим!`;
  const medal = ['🥇', '🥈', '🥉'];
  return `<b>Виклик дня ${day} — топ ${rows.length}</b>\n` + rows.map((x, i) =>
    `${medal[i] || (i + 1) + '.'} ${esc(x.nickname || 'Анонім')} — <b>${x.pts}</b> (${x.w}-${x.d}-${x.l}, ${x.gf}:${x.ga})`).join('\n');
}

const HELLO = 'Збери XI з усієї історії Прем\'єр-ліги України і пройди сезон 30-0.\n\n' +
  'Колесо видає клуб і сезон, з кожного береш одного гравця. Одинадцять обертів — і 30 турів чемпіонату.\n\n' +
  '/play — грати\n/top — таблиця виклику дня';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('30-0 УПЛ bot is alive');
  if (process.env.TG_SECRET && req.headers['x-telegram-bot-api-secret-token'] !== process.env.TG_SECRET)
    return res.status(401).send('bad secret');
  try {
    const u = req.body || {};
    const m = u.message;
    if (m && typeof m.text === 'string') {
      const chat = m.chat, isPrivate = chat.type === 'private';
      const cmd = m.text.trim().split(/[\s@]/)[0].toLowerCase();
      if (cmd === '/start' || cmd === '/play' || cmd === '/help') {
        await tg('sendMessage', { chat_id: chat.id, text: cmd === '/play' ? 'Погнали! 🎡' : HELLO,
          reply_markup: { inline_keyboard: [[playButton(isPrivate)]] } });
      } else if (cmd === '/top' || cmd === '/table') {
        await tg('sendMessage', { chat_id: chat.id, text: await topToday(), parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[playButton(isPrivate)]] } });
      }
    }
  } catch (e) { console.error(e); }
  res.status(200).send('ok'); // завжди 200, інакше Telegram повторює запит
};
