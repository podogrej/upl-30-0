// 30-0 УПЛ — Telegram-канал (0.69.97, власник 05.10): черга постів channel_posts (sql/v06997_channel_posts.sql),
// схвалення кнопками в особистих з ботом, публікація за розкладом, автопости (анонс драфту дня, підсумки тижня).
// Файл з «_» — не адреса (Vercel Hobby: функцій уже 12 з 12). Викликають api/bot.js (команди й кнопки) і api/cron.js?task=channel (запуск).
// Змінні Vercel: OWNER_TG_ID (хто керує каналом), CHANNEL_ID (лише Production), TEST_CHANNEL_ID (Preview — тестовий сайт),
// CHANNEL_SECRET (ключ для частого запуску з GitHub Actions, .github/workflows/channel.yml).
// Бот один, вебхук — на проді. Пости тестової бази бот показує з міткою «ТЕСТ» і кнопками з міткою t (як вхід через бота: TEST_SUPABASE_URL/KEY);
// публікує їх тестовий сайт — у TEST_CHANNEL_ID. У CHANNEL_ID публікує лише Production.
const L = require('./_league.js');
const SITE = 'https://upl30.com.ua/';
const BOT = () => L.env('TG_BOT') || 'upl30_bot';
const DAILY_LINK = () => `https://t.me/${BOT()}?start=ch_daily`;
const WAIT_MIN = 30;   // скільки хвилин бот чекає текст поста або новий час після команди
const DAILY_AT = [9, 0], WEEKLY_AT = [12, 0];   // автопости виходять: анонс драфту дня о 9:00, підсумки тижня в понеділок о 12:00 (за Києвом)
const DAILY_PREP_H = 18, WEEKLY_PREP_H = 8;   // а готуються (чернетка власнику): анонс — напередодні після 18:00, підсумки — у понеділок після 8:00; не вночі (власник в Індії, +2:30 до Києва)

// ---------- бази: p — основна, t — тестова. Свою базу кожне оточення знає з VERCEL_ENV
const OWN = () => (process.env.VERCEL_ENV === 'production' ? 'p' : 't');
async function testSb(path, { method = 'GET', body, prefer } = {}) {
  const url = String(process.env.TEST_SUPABASE_URL || '').trim(), key = L.env('TEST_SUPABASE_SERVICE_KEY');
  if (!url || !key) throw new Error('тестова база не налаштована (TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_KEY)');
  const r = await fetch(`${url}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
  if (!r.ok) { const e = new Error(`db ${r.status}: ${t.slice(0, 150)}`); e.status = r.status; e.body = t; throw e; }
  return j;
}
const db = tag => (tag === OWN() ? L.sb : tag === 't' ? testSb : null);
const label = tag => (tag === 't' ? 'ТЕСТ · ' : '');

// ---------- час за Києвом
function kyivParts(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' })
    .formatToParts(d).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, H: +p.hour % 24, M: +p.minute, wd: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) };
}
function kyivToUtc(y, m, d, H, M) {   // момент, коли в Києві y-m-d H:M (з урахуванням літнього часу)
  let t = Date.UTC(y, m - 1, d, H, M);
  for (let i = 0; i < 2; i++) { const k = kyivParts(new Date(t)); t -= Date.UTC(k.y, k.m - 1, k.d, k.H, k.M) - Date.UTC(y, m - 1, d, H, M); }
  return new Date(t);
}
const pad = n => String(n).padStart(2, '0');
function fmtKyiv(iso) { const k = kyivParts(new Date(iso)); return `${pad(k.d)}.${pad(k.m)} ${pad(k.H)}:${pad(k.M)}`; }
// «10.10 18:00», «10.10.2026 18:00», «18:00» (сьогодні, а якщо вже минуло — завтра), «зараз» / «now»
function parseWhen(s, now = new Date()) {
  s = String(s || '').trim().toLowerCase();
  if (s === 'зараз' || s === 'now') return now;
  const k = kyivParts(now);
  let m = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{2}|\d{4}))?\s+(\d{1,2})[:.](\d{2})$/.exec(s);
  if (m) {
    const [d, mo, H, M] = [+m[1], +m[2], +m[4], +m[5]];
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || H > 23 || M > 59) return null;
    let y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : k.y;
    let t = kyivToUtc(y, mo, d, H, M);
    if (!m[3] && t < now - 864e5) t = kyivToUtc(y + 1, mo, d, H, M);   // «02.01» у грудні — наступного року
    const back = kyivParts(t); if (back.d !== d || back.m !== mo) return null;   // 31.02 тощо
    return t;
  }
  m = /^(\d{1,2})[:.](\d{2})$/.exec(s);
  if (m && +m[1] < 24 && +m[2] < 60) { let t = kyivToUtc(k.y, k.m, k.d, +m[1], +m[2]); if (t < now) t = new Date(+t + 864e5); return t; }
  return null;
}

// ---------- текст поста: видима довжина, розмітка з повідомлення власника (entities → HTML)
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const visibleLen = html => String(html).replace(/<[^>]+>/g, '').replace(/&(lt|gt|amp|quot|#\d+);/g, 'x').length;
function checkPost(p) {
  const text = String(p.text || ''), img = String(p.image_url || '').trim();
  if (!text.trim() && !img) return 'порожній пост';
  const n = visibleLen(text), max = img ? 1024 : 4096;
  return n > max ? `задовгий текст: ${n} символів, можна ${max}${img ? ' (підпис до картинки)' : ''}` : null;
}
// повідомлення Telegram з розміткою (жирний, курсив, посилання…) → HTML для parse_mode HTML. Зсуви — у UTF-16, як рядки JS
function entitiesToHtml(text, ents) {
  text = String(text || '');
  const TAG = { bold: ['<b>', '</b>'], italic: ['<i>', '</i>'], underline: ['<u>', '</u>'], strikethrough: ['<s>', '</s>'], spoiler: ['<tg-spoiler>', '</tg-spoiler>'],
    code: ['<code>', '</code>'], pre: ['<pre>', '</pre>'], blockquote: ['<blockquote>', '</blockquote>'], expandable_blockquote: ['<blockquote expandable>', '</blockquote>'] };
  const open = {}, close = {};
  for (const e of ents || []) {
    let t = TAG[e.type];
    if (e.type === 'text_link' && e.url) t = [`<a href="${esc(e.url).replace(/"/g, '&quot;')}">`, '</a>'];
    if (!t) continue;
    (open[e.offset] = open[e.offset] || []).push({ t: t[0], len: e.length });
    (close[e.offset + e.length] = close[e.offset + e.length] || []).unshift(t[1]);
  }
  let out = '';
  for (let i = 0; i <= text.length; i++) {
    if (close[i]) out += close[i].join('');
    if (open[i]) out += open[i].sort((a, b) => b.len - a.len).map(x => x.t).join('');
    if (i < text.length) out += esc(text[i]);
  }
  return out;
}

// ---------- Telegram
async function sendPost(chat_id, p, extra = {}) {
  const img = String(p.image_url || '').trim();
  return img ? L.tg('sendPhoto', { chat_id, photo: img, caption: p.text, parse_mode: 'HTML', ...extra })
    : L.tg('sendMessage', { chat_id, text: p.text, parse_mode: 'HTML', ...extra });
}
const STATUS = { draft: '📝 чернетка', approved: '✅ схвалено', published: '📣 вийшов', skipped: '⏭ пропущено', failed: '⚠️ не вийшов' };
function postKb(tag, p) {
  const id = p.id, cb = a => `cp:${tag}:${id}:${a}`;
  if (p.status === 'published') return { inline_keyboard: [[{ text: `📣 Вийшов ${p.published_at ? fmtKyiv(p.published_at) : ''}`.trim(), callback_data: 'cp:x' }]] };
  if (p.status === 'skipped') return { inline_keyboard: [[{ text: '⏭ Пропущено', callback_data: 'cp:x' }]] };
  const top = p.status === 'approved' ? { text: `✅ Схвалено · вийде ${fmtKyiv(p.publish_at)}`, callback_data: 'cp:x' }
    : { text: `${p.status === 'failed' ? '🔁 Спробувати ще' : '✅ Опублікувати за розкладом'} · ${fmtKyiv(p.publish_at)}`, callback_data: cb('ok') };
  return { inline_keyboard: [[top], [{ text: '⏭ Пропустити', callback_data: cb('skip') }, { text: '🕒 Змінити час', callback_data: cb('time') }]] };
}
// попередній перегляд власнику: пост так, як він вийде в каналі, і кнопки під ним; якщо Telegram не приймає розмітку — пояснення й ті самі кнопки
async function preview(owner, tag, p) {
  const head = `${label(tag)}Пост #${p.id} · ${STATUS[p.status] || p.status} · ${fmtKyiv(p.publish_at)} за Києвом`;
  await L.tg('sendMessage', { chat_id: owner, text: head });
  const bad = checkPost(p);
  const r = bad ? null : await sendPost(owner, p, { reply_markup: postKb(tag, p) });
  if (!r || !r.ok) await L.tg('sendMessage', { chat_id: owner, text: `⚠️ Пост #${p.id} не вийде в такому вигляді: ${bad || (r && r.description) || 'Telegram не прийняв'}`, reply_markup: postKb(tag, p) });
}

// ---------- очікування відповіді власника (текст поста після /post, новий час після «Змінити час»): позначка в app_marks основної бази бота
async function setWait(kind, tag, val) { await clearWait(); await L.sb('app_marks', { method: 'POST', prefer: 'return=minimal', body: { key: `chw:${kind}:${tag}:${val}` } }); }
async function clearWait() { await L.sb('app_marks?key=like.chw:*', { method: 'DELETE', prefer: 'return=minimal' }); }
async function getWait() {
  const [w] = await L.sb(`app_marks?key=like.chw:*&select=key,at&order=at.desc&limit=1`) || [];
  if (!w || Date.now() - Date.parse(w.at) > WAIT_MIN * 6e4) return null;
  const [, kind, tag, ...rest] = w.key.split(':'); return { kind, tag, val: rest.join(':') };
}

const isOwner = from => { const o = L.env('OWNER_TG_ID'); return !!o && !!from && String(from.id) === o; };
const say = (chat_id, text, extra = {}) => L.tg('sendMessage', { chat_id, text, ...extra });
const POST_HELP = 'Як додати пост:\n/post 10.10 18:00 — потім надішли текст (можна картинку з підписом).\n/post 18:00 — сьогодні (або завтра, якщо вже минуло), /post зараз — одразу.\n/post test 10.10 18:00 — у тестовий канал.\n/queue — найближчі пости, /queue test — тестові.\n/auto off|on — автопости (анонс драфту дня, підсумки тижня); /auto test off — у тесті.\n/cancel — скасувати.';

async function queue(chat_id, tag) {
  const q = db(tag); if (!q) return say(chat_id, 'Ця база недоступна.');
  const rows = await q(`channel_posts?status=in.(draft,approved,failed)&select=id,status,publish_at,text,image_url&order=publish_at.asc&limit=10`) || [];
  if (!rows.length) return say(chat_id, `${label(tag)}У черзі порожньо.`);
  const short = t => String(t || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 50);
  const text = `${label(tag)}Найближчі пости:\n` + rows.map(r => `#${r.id} · ${fmtKyiv(r.publish_at)} · ${STATUS[r.status]}${r.image_url ? ' · 🖼' : ''}\n${short(r.text)}`).join('\n\n');
  const kb = []; for (let i = 0; i < rows.length; i += 3) kb.push(rows.slice(i, i + 3).map(r => ({ text: `👁 #${r.id}`, callback_data: `cp:${tag}:${r.id}:show` })));
  return say(chat_id, text, { reply_markup: { inline_keyboard: kb } });
}

// ---------- оновлення від Telegram: true — оброблено тут (api/bot.js далі не йде)
async function handleUpdate(u) {
  const cq = u.callback_query;
  if (cq && typeof cq.data === 'string' && cq.data.startsWith('cp:')) {
    if (!isOwner(cq.from)) { await L.tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Ці кнопки — лише для адміністратора каналу.', show_alert: true }); return true; }
    const [, tag, id, act] = cq.data.split(':'), q = db(tag), msg = cq.message || {};
    if (!q || !/^\d+$/.test(id || '')) { await L.tg('answerCallbackQuery', { callback_query_id: cq.id }); return true; }
    const patch = async (filter, body) => (await q(`channel_posts?id=eq.${id}&${filter}`, { method: 'PATCH', body, prefer: 'return=representation' }) || [])[0];
    let p = null, note = '';
    if (act === 'ok') { p = await patch('status=in.(draft,failed)', { status: 'approved', error: null }); note = p ? `Схвалено: вийде ${fmtKyiv(p.publish_at)}` : 'Вже не чернетка'; }
    else if (act === 'skip') { p = await patch('status=in.(draft,approved,failed)', { status: 'skipped' }); note = p ? 'Пропущено' : 'Уже вийшов або пропущений'; }
    else if (act === 'time') { await setWait('time', tag, id); note = 'Напиши новий час'; await say(cq.from.id, `${label(tag)}Новий час для поста #${id} за Києвом, наприклад: 10.10 18:00 (або 18:00, «зараз»). /cancel — скасувати.`); }
    else if (act === 'show') { const [r] = await q(`channel_posts?id=eq.${id}&select=*`) || []; if (r) await preview(cq.from.id, tag, r); }
    await L.tg('answerCallbackQuery', { callback_query_id: cq.id, text: note });
    if (p && msg.chat) await L.tg('editMessageReplyMarkup', { chat_id: msg.chat.id, message_id: msg.message_id, reply_markup: postKb(tag, p) });
    return true;
  }
  const m = u.message;
  if (!m || !m.chat) return false;
  const text = typeof m.text === 'string' ? m.text.trim() : '', isPrivate = m.chat.type === 'private';
  const cmd = text.startsWith('/') ? text.split(/[\s@]/)[0].toLowerCase() : '', args = text.split(/\s+/).slice(1);
  if (cmd === '/whoami') { await say(m.chat.id, `Твій Telegram ID: ${m.from && m.from.id}`); return true; }
  if (cmd === '/start' && isPrivate && args[0] === 'ch_daily') {
    await say(m.chat.id, '🎯 Драфт дня — однакове колесо для всіх, одна офіційна спроба. Тисни «Грати»!', { reply_markup: { inline_keyboard: [[{ text: '▶️ Грати', web_app: { url: SITE } }]] } });
    return true;
  }
  if (['/post', '/queue', '/auto', '/cancel'].includes(cmd)) {
    if (!isOwner(m.from) || !isPrivate) { await say(m.chat.id, 'Ця команда — лише для адміністратора каналу, в особистих повідомленнях з ботом.'); return true; }
    const tag = args[0] === 'test' ? 't' : OWN(), rest = args[0] === 'test' ? args.slice(1) : args;
    if (cmd === '/cancel') { await clearWait(); await say(m.chat.id, 'Скасовано.'); return true; }
    if (cmd === '/queue') { await queue(m.chat.id, tag); return true; }
    if (cmd === '/auto') {
      const q = db(tag), on = rest[0] === 'on', off = rest[0] === 'off';
      if (!q) { await say(m.chat.id, 'Ця база недоступна.'); return true; }
      if (off) await q('app_marks?on_conflict=key', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: { key: 'ch_auto_off' } });
      if (on) await q('app_marks?key=eq.ch_auto_off', { method: 'DELETE', prefer: 'return=minimal' });
      const isOff = (await q('app_marks?key=eq.ch_auto_off&select=key') || []).length > 0;
      await say(m.chat.id, `${label(tag)}Автопости (анонс драфту дня, підсумки тижня): ${isOff ? 'вимкнено' : 'увімкнено'}. Вони приходять тобі чернетками на схвалення.`);
      return true;
    }
    const when = parseWhen(rest.join(' '));
    if (!when) { await say(m.chat.id, POST_HELP); return true; }
    if (!db(tag)) { await say(m.chat.id, 'Тестова база не налаштована — пост нікуди записати.'); return true; }
    await setWait('post', tag, when.toISOString());
    await say(m.chat.id, `${label(tag)}Надішли текст поста (можна картинку з підписом). Вийде ${fmtKyiv(when)} за Києвом у ${tag === 't' ? 'тестовий канал' : 'канал'}. /cancel — скасувати.`);
    return true;
  }
  // відповідь власника на /post або «Змінити час» (інакше — звичайний відгук, api/bot.js)
  if (isPrivate && !cmd && isOwner(m.from)) {
    const w = await getWait(); if (!w) return false;
    const q = db(w.tag); if (!q) { await clearWait(); return false; }
    if (w.kind === 'time') {
      const when = parseWhen(text); if (!when) { await say(m.chat.id, 'Не зрозумів час. Приклад: 10.10 18:00, 18:00 або «зараз». /cancel — скасувати.'); return true; }
      const [p] = await q(`channel_posts?id=eq.${w.val}&status=in.(draft,approved,failed)`, { method: 'PATCH', body: { publish_at: when.toISOString() }, prefer: 'return=representation' }) || [];
      await clearWait();
      if (!p) { await say(m.chat.id, `Пост #${w.val} уже вийшов або пропущений.`); return true; }
      await say(m.chat.id, `${label(w.tag)}Пост #${p.id}: новий час ${fmtKyiv(p.publish_at)} за Києвом.`, { reply_markup: postKb(w.tag, p) });
      return true;
    }
    if (w.kind === 'post') {
      const photo = Array.isArray(m.photo) && m.photo.length ? m.photo[m.photo.length - 1].file_id : null;
      const row = { text: photo ? entitiesToHtml(m.caption, m.caption_entities) : entitiesToHtml(m.text, m.entities), image_url: photo, publish_at: w.val, status: 'approved', source: 'owner' };
      const bad = checkPost(row); if (bad) { await say(m.chat.id, `Не підходить: ${bad}. Надішли інший текст або /cancel.`); return true; }
      const [p] = await q('channel_posts', { method: 'POST', body: row, prefer: 'return=representation' }) || [];
      await clearWait();
      await say(m.chat.id, `${label(w.tag)}Заплановано: пост #${p.id} вийде ${fmtKyiv(p.publish_at)} за Києвом. Ось як він виглядатиме:`);
      await preview(m.chat.id, w.tag, p);
      return true;
    }
  }
  return false;
}

// ---------- автопости: чернетки на схвалення, раз на день / раз на тиждень (позначки app_marks — щоб не двічі)
async function once(key) { return ((await L.sb('app_marks?on_conflict=key', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=representation', body: { key } })) || []).length > 0; }
const laterOf = (at, now) => new Date(Math.max(+at, +now + 15 * 6e4));   // уже минуло — через 15 хвилин, щоб власник встиг схвалити
async function autoPosts(now = new Date()) {
  const made = [];
  if ((await L.sb('app_marks?key=eq.ch_auto_off&select=key') || []).length) return made;
  const k = kyivParts(now), day = `${k.y}-${pad(k.m)}-${pad(k.d)}`;
  const tk = kyivParts(new Date(+kyivToUtc(k.y, k.m, k.d, 12, 0) + 864e5)), tday = `${tk.y}-${pad(tk.m)}-${pad(tk.d)}`;   // завтра за Києвом
  if (k.H >= DAILY_PREP_H && await once(`ch_daily:${tday}`)) {
    const E = require('../lib/engine.js'), ds = E.dailySetupFor(tday), rr = (E.MODES.daily || {}).rerolls || 0;
    const text = `<b>🎯 Драфт дня №${L.dayNo(tday)} · ${L.dayShort(tday)}</b>\n` +
      `Схема <b>${esc(ds.formation)}</b>, суперники — «Ліга легенд», ${rr === 1 ? 'одне перекручування' : rr + ' перекручування'} колеса.\n` +
      `Колесо однакове для всіх — хто збере найкращий сезон?\n\n<a href="${DAILY_LINK()}">Зіграти драфт дня →</a>`;
    const [p] = await L.sb('channel_posts', { method: 'POST', prefer: 'return=representation', body: { text, publish_at: laterOf(kyivToUtc(tk.y, tk.m, tk.d, ...DAILY_AT), now).toISOString(), status: 'draft', source: 'auto' } }) || [];
    if (p) made.push(p.id);
  }
  if (k.wd === 0 && k.H >= WEEKLY_PREP_H && await once(`ch_week:${day}`)) {   // понеділок: підсумки минулого тижня (пн–нд за Києвом)
    const to = kyivToUtc(k.y, k.m, k.d, 0, 0), from = new Date(+to - 7 * 864e5);
    const rows = await L.sb(`seasons?created_at=gte.${from.toISOString()}&created_at=lt.${to.toISOString()}&verified=is.true&practice=is.false&select=pts,w,d,l,gf,ga,nickname,xi&limit=20000`) || [];
    if (rows.length) {
      const best = [...rows].sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf)[0];
      const cnt = {}; for (const r of rows) for (const x of (Array.isArray(r.xi) ? r.xi : [])) if (x && x.n) cnt[x.n] = (cnt[x.n] || 0) + 1;
      const [top, topN] = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0] || [];
      const fk = kyivParts(from), lk = kyivParts(new Date(+to - 864e5)), { plUk } = require('./_lib.js');
      const text = `<b>📊 Тиждень у 30-0 УПЛ · ${pad(fk.d)}.${pad(fk.m)}–${pad(lk.d)}.${pad(lk.m)}</b>\n` +
        `Зіграно сезонів: <b>${rows.length}</b>\n` +
        `🏆 Найкращий сезон: <b>${esc(best.nickname || 'анонім')}</b> — ${best.w}-${best.d}-${best.l}, ${best.pts} ${plUk(best.pts, 'очко', 'очки', 'очок')}\n` +
        (top ? `⭐ Найчастіше брали: <b>${esc(top)}</b> — у ${topN} ${plUk(topN, 'складі', 'складах', 'складах')}\n` : '') +
        `\n<a href="${DAILY_LINK()}">Зіграти →</a>`;
      const [p] = await L.sb('channel_posts', { method: 'POST', prefer: 'return=representation', body: { text, publish_at: laterOf(kyivToUtc(k.y, k.m, k.d, ...WEEKLY_AT), now).toISOString(), status: 'draft', source: 'auto' } }) || [];
      if (p) made.push(p.id);
    }
  }
  return made;
}

// ---------- запуск (кожні ~10 хв з GitHub Actions, і раз на день з Vercel Cron): автопости → нові чернетки власнику → публікація
async function runChannel(now = new Date()) {
  const tag = OWN(), owner = L.env('OWNER_TG_ID'), chan = tag === 'p' ? L.env('CHANNEL_ID') : L.env('TEST_CHANNEL_ID');
  const out = { env: tag, auto: [], notified: 0, published: 0, failed: 0 };
  if (!owner || !chan) { out.off = `не задано ${!owner ? 'OWNER_TG_ID' : tag === 'p' ? 'CHANNEL_ID' : 'TEST_CHANNEL_ID'}`; return out; }
  try { out.auto = await autoPosts(now); } catch (e) { out.autoError = String(e.message).slice(0, 160); }
  const iso = now.toISOString();
  for (const d of await L.sb('channel_posts?status=eq.draft&notified_at=is.null&select=id&order=publish_at.asc&limit=10') || []) {
    const [p] = await L.sb(`channel_posts?id=eq.${d.id}&notified_at=is.null`, { method: 'PATCH', prefer: 'return=representation', body: { notified_at: iso } }) || [];
    if (!p) continue;   // інший запуск уже надіслав
    await preview(owner, tag, p); out.notified++;
  }
  for (const d of await L.sb(`channel_posts?status=eq.approved&publish_at=lte.${encodeURIComponent(iso)}&select=id&order=publish_at.asc&limit=5`) || []) {
    // атомарно забираємо пост: approved → published лише в одному запуску; другий отримає порожньо й пропустить
    const [p] = await L.sb(`channel_posts?id=eq.${d.id}&status=eq.approved`, { method: 'PATCH', prefer: 'return=representation', body: { status: 'published', published_at: iso } }) || [];
    if (!p) continue;
    let err = checkPost(p), r = null;
    if (!err) { try { r = await sendPost(chan, p); } catch (e) { err = String(e.message); } if (!err && !(r && r.ok)) err = (r && r.description) || 'Telegram не відповів'; }
    if (err) {
      await L.sb(`channel_posts?id=eq.${p.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: 'failed', published_at: null, error: String(err).slice(0, 500) } });
      out.failed++;
      await say(owner, `⚠️ ${label(tag)}Пост #${p.id} не вийшов: ${err}`, { reply_markup: postKb(tag, { ...p, status: 'failed' }) });
    } else {
      await L.sb(`channel_posts?id=eq.${p.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { tg_message_id: r.result && r.result.message_id } });
      out.published++;
    }
  }
  return out;
}

module.exports = { handleUpdate, runChannel, autoPosts, parseWhen, kyivToUtc, fmtKyiv, entitiesToHtml, checkPost, visibleLen };
