// 30-0 UPL: Telegram bot (Vercel serverless function, /api/bot)
// Vercel env: TG_TOKEN, TG_SECRET (required, else 401), TG_BOT, SUPABASE_SERVICE_KEY
const L = require('./_league.js');   // shared group league helpers
const C = require('./_channel.js');   // Telegram channel: admin commands, approval buttons, /whoami
const SITE = 'https://upl30.com.ua/';   // must stay code (not commented out): /start, /play, /top in private chat depend on it
const SB_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_pEszTOPsCHLgpiPpwB4JKg_SS-X07hY').trim(); // publishable key, same as on the site

function playButton(isPrivate) {
  // private chat: Mini App button; groups don't allow such buttons, so link to the bot's main Mini App
  if (isPrivate) return { text: '▶️ Грати', web_app: { url: SITE } };
  return { text: '▶️ Грати', url: `https://t.me/${L.env('TG_BOT') || 'upl30_bot'}?startapp` };
}

async function topToday() {
  const day = L.kyivDate();
  // name from player profile (players); nickname copy only if no profile (audit V5)
  const q = sel => fetch(`${L.SB_URL}/rest/v1/daily_results?apikey=${SB_KEY}&day=eq.${day}&verified=is.true&select=${sel}&order=pts.desc,ga.asc,gf.desc&limit=30`);
  let r = await q('nickname,w,d,l,pts,gf,ga,player_id,players(name,anon_name)'); if (!r.ok) r = await q('nickname,w,d,l,pts,gf,ga');
  // a player may have two day results (merged logins from two devices): keep the best
  const seen = new Set();
  const rows = (r.ok ? await r.json() : []).filter(x => !x.player_id || (!seen.has(x.player_id) && seen.add(x.player_id))).slice(0, 10);
  if (!rows.length) return `<b>Драфт дня ${day}</b>\nПоки що ніхто не зіграв. Будь першим!`;
  const medal = ['🥇', '🥈', '🥉'];
  return `<b>Драфт дня ${day} — топ ${rows.length}</b>\n` + rows.map((x, i) =>
    `${medal[i] || (i + 1) + '.'} ${L.esc(x.players && (x.players.name || x.players.anon_name) ? String(x.players.name || x.players.anon_name) : (x.nickname || 'Анонім'))} — <b>${x.pts}</b> (${x.w}-${x.d}-${x.l}, ${x.gf}:${x.ga})`).join('\n');
}

const HELLO = 'Збери XI з усієї історії Прем\'єр-ліги України і пройди сезон 30-0.\n\n' +
  'Колесо видає клуб і сезон, з кожного береш одного гравця. Одинадцять обертів — і 30 турів чемпіонату.\n\n' +
  '/play — грати\n/top — таблиця драфту дня\n\nДодай мене в групу з друзями, зроби адміністратором і напиши там /league — буде ліга вашої групи.';
// make the bot admin before /league: otherwise Telegram upgrades the group to a supergroup with a new id and a league created earlier stays in the old chat
const GROUP_ABOUT = 'Щодня однакове колесо для всіх, таблиця дня оновлюється сама, а ввечері підсумок: хто виграв день і хто відкрив трофеї.';
const GROUP_HELLO = 'Привіт! Я — 30-0 УПЛ ⚽️\n\nДва кроки:\n1. Зробіть мене адміністратором (досить одного права — «Закріплення повідомлень»), щоб я закріплював табло.\n' +
  '2. Потім напишіть /league — створю лігу вашої групи.\n\n' + GROUP_ABOUT;
const GROUP_HELLO_ADMIN = 'Привіт! Я — 30-0 УПЛ ⚽️\n\nНапишіть /league — створю лігу вашої групи. ' + GROUP_ABOUT;

// Feedback: the header feedback button opens
// t.me/upl30_bot?start=feedback; anything a player sends the bot in private (non-command: text, screenshots, voice) is feedback:
// forwarded to the admin (TG_FEEDBACK_CHAT, else cards channel TG_CARDS_CHAT) and stored in feedback (sql/v0695_feedback.sql).
const FEEDBACK_ASK = '💬 Напиши, що подобається, що зламалось або чого не вистачає. Можна кількома повідомленнями й зі скріншотами — я все передам розробнику.';
async function feedback(m) {
  const f = m.from || {}, to = L.env('TG_FEEDBACK_CHAT') || L.env('TG_CARDS_CHAT');
  const name = [f.first_name, f.last_name].filter(Boolean).join(' ').slice(0, 80);
  const kind = m.photo ? 'photo' : m.voice ? 'voice' : m.video ? 'video' : m.document ? 'document' : m.sticker ? 'sticker' : m.text ? 'text' : 'other';
  const file = m.photo ? m.photo[m.photo.length - 1].file_id : (m.voice || m.video || m.document || m.sticker || {}).file_id || null;
  let fwd = false, recent = false;
  if (to) {
    try {
      if (!m.media_group_id || m.caption) await L.tg('sendMessage', { chat_id: to, text: `💬 Відгук: ${name || 'гравець'}${f.username ? ' (@' + f.username + ')' : ''} · id ${f.id}` });
      const r = await L.tg('forwardMessage', { chat_id: to, from_chat_id: m.chat.id, message_id: m.message_id }); fwd = !!(r && r.ok);
    } catch (e) { console.error('feedback fwd', e.message); }
  }
  try {   // "thanks" reply at most once a minute (an album or several messages in a row get one reply)
    recent = ((await L.sb(`feedback?tg_user_id=eq.${f.id}&at=gte.${new Date(Date.now() - 60e3).toISOString()}&select=id&limit=1`)) || []).length > 0;
    await L.sb('feedback', { method: 'POST', prefer: 'return=minimal', body: { tg_user_id: f.id, name: name || null, username: f.username || null, kind, text: String(m.text || m.caption || '').slice(0, 4000) || null, file_id: file, forwarded: fwd } });
  } catch (e) { if (e.status !== 404) console.error('feedback db', e.message); }
  if (!recent) await L.tg('sendMessage', { chat_id: m.chat.id, text: 'Дякую! Передав розробнику 🙌' });
}

async function league(chat, from) {
  const chat_id = chat.id;
  const exists = (await L.sb(`leagues?chat_id=eq.${chat_id}&select=chat_id`) || []).length > 0;
  await L.sb('leagues?on_conflict=chat_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id, title: String(chat.title || 'Група').slice(0, 60), created_by: from && from.id } });
  if (from && !from.is_bot) await L.sb('league_members?on_conflict=chat_id,tg_user_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id, tg_user_id: from.id, name: L.nameOf(from) } });
  if (!exists) await L.tg('sendMessage', { chat_id, text: '🏟 Лігу групи створено! Грайте драфт дня з кнопки під табло — результати потраплять сюди автоматично. Підсумок дня — щовечора близько 21:00 за Києвом.' });
  await L.upsertBoard(chat_id, L.kyivDate(), { copy: exists });   // new league: board is created and pinned; existing one: update + unpinned copy
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('30-0 УПЛ bot is alive');
  // webhook accepts only Telegram requests carrying the secret (setWebhook ... secret_token = TG_SECRET); no TG_SECRET in Vercel -> 401 for all
  const secret = L.env('TG_SECRET'), got = String((req.headers && req.headers['x-telegram-bot-api-secret-token']) || '');
  if (!secret || got.length !== secret.length || !require('crypto').timingSafeEqual(Buffer.from(got), Buffer.from(secret)))
    return res.status(401).send('bad secret');
  try {
    const u = req.body || {};
    if (await C.handleUpdate(u)) return res.status(200).send('ok');   // channel (/post, /queue, /auto, /whoami, cp:... buttons) handled before feedback and game commands
    // bot added to a group
    const mc = u.my_chat_member;
    const joined = mc && mc.chat && ['member', 'administrator'].includes(mc.new_chat_member.status) && !['member', 'administrator'].includes(mc.old_chat_member.status);
    // bot became a channel admin: send the channel ID to the admin privately (never post into the channel itself, it may be public)
    if (mc && mc.chat && mc.chat.type === 'channel' && mc.new_chat_member.status === 'administrator' && mc.old_chat_member.status !== 'administrator') {
      const owner = L.env('OWNER_TG_ID');
      if (owner) await L.tg('sendMessage', { chat_id: owner, text: `Мене зробили адміністратором каналу «${String(mc.chat.title || '').slice(0, 60)}» ✅\nID каналу: ${mc.chat.id}${mc.chat.username ? ' (@' + mc.chat.username + ')' : ''}\nДля карток — змінна TG_CARDS_CHAT, для публікацій — CHANNEL_CHAT_ID у Vercel → Settings → Environment Variables, потім Redeploy.` });
    } else if (joined && mc.chat.type !== 'private' && mc.chat.type !== 'channel') {
      await L.tg('sendMessage', { chat_id: mc.chat.id, text: mc.new_chat_member.status === 'administrator' ? GROUP_HELLO_ADMIN : GROUP_HELLO });
    }
    // "confirm login" button: bind the login token to the user who pressed it (only in their own private chat with the bot; button lives 10 minutes)
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
        // one bot for both DBs: if a test DB is configured in Vercel, write the same login token there too so bot login works on the test site
        const tUrl = String(process.env.TEST_SUPABASE_URL || '').trim(), tKey = String(process.env.TEST_SUPABASE_SERVICE_KEY || '').replace(/\s+/g, '');
        if (tUrl && tKey) {
          try { await fetch(`${tUrl}/rest/v1/tg_logins?on_conflict=token`, { method: 'POST', headers: { apikey: tKey, Authorization: `Bearer ${tKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(row) }); } catch (e) {}
        }
        await L.tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Вхід підтверджено' });
        await L.tg('editMessageText', { chat_id: msg.chat.id, message_id: msg.message_id, text: '✅ Вхід підтверджено. Повернись у браузер — гра вже знає, що це ти.' });
      }
    }
    const m = u.message;
    // group became a supergroup: Telegram sends a service message with migrate_from_chat_id to the new chat; move the league
    if (m && m.migrate_from_chat_id && m.chat) { try { await L.migrateLeague(m.migrate_from_chat_id, m.chat.id); } catch (e) { console.error('migrate', e.message); } }
    if (m && typeof m.text === 'string') {
      const chat = m.chat, isPrivate = chat.type === 'private';
      const cmd = m.text.trim().split(/[\s@]/)[0].toLowerCase();
      const arg = m.text.trim().split(/\s+/)[1] || '';
      if (cmd === '/start' && isPrivate && /^login_[a-f0-9]{32}$/.test(arg)) {
        // site login via bot: the browser opened t.me/upl30_bot?start=login_<token>. Don't bind immediately (the link could be planted);
        // bind only after the "confirm login" button (callback below) from the same user
        await L.tg('sendMessage', { chat_id: chat.id, text: '🔐 Вхід у 30-0 УПЛ на сайті upl30.com.ua.\n\nНатисни «Підтвердити вхід», лише якщо це ти щойно натиснув «Увійти через Telegram» у своєму браузері. Якщо ні — просто проігноруй це повідомлення.',
          reply_markup: { inline_keyboard: [[{ text: '✅ Підтвердити вхід', callback_data: arg }]] } });
      } else if (cmd === '/start' && isPrivate && arg === 'feedback') {
        await L.tg('sendMessage', { chat_id: chat.id, text: FEEDBACK_ASK });
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
        if (hasLeague) await L.upsertBoard(chat.id, L.kyivDate(), { copy: true });   // pinned board is updated; an unpinned copy goes to the chat
        else await L.tg('sendMessage', { chat_id: chat.id, text: await topToday(), parse_mode: 'HTML', reply_markup: { inline_keyboard: [[playButton(isPrivate)]] } });
      }
    }
    // any private non-command message is feedback
    if (m && m.chat && m.chat.type === 'private' && !(typeof m.text === 'string' && m.text.trim().startsWith('/')) && !m.migrate_from_chat_id) await feedback(m);
  } catch (e) { console.error(e); }
  res.status(200).send('ok'); // always 200, otherwise Telegram retries
};
