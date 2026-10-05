// 30-0 UPL Telegram channel (@upl_nostalgia): post queue channel_posts (sql/v06997_channel_posts.sql).
// Flow: draft -> pending_approval (preview sent to the admin) -> published (Publish button, sent right away) | rejected | failed (retry).
// Drafts come from the DB (Supabase connector), from /post <text> in the bot, or from auto posts; due drafts (publish_at <= now) are sent to the admin by runChannel.
// "_" prefix: not a route (Vercel Hobby function limit). Called from api/bot.js (commands, buttons) and api/cron.js?task=channel (run).
// Vercel env: OWNER_TG_ID (admin), CHANNEL_CHAT_ID (channel id or @username, Production), TEST_CHANNEL_ID (test channel),
// CHANNEL_SECRET (key for the frequent run from GitHub Actions, .github/workflows/channel.yml).
// One bot, webhook on prod: test-DB posts carry callback tag t (TEST_SUPABASE_URL/KEY) and go only to TEST_CHANNEL_ID.
const L = require('./_league.js');
const SITE = 'https://upl30.com.ua/';
const BOT = () => L.env('TG_BOT') || 'upl30_bot';
const DAILY_LINK = () => `https://t.me/${BOT()}?start=ch_daily`;
const DAILY_AT = [9, 0], WEEKLY_AT = [12, 0];   // when the auto draft is sent to the admin (Kyiv): daily draft announcement 9:00, weekly summary Monday 12:00
const DAILY_PREP_H = 18, WEEKLY_PREP_H = 8;   // when auto drafts are created (Kyiv): announcement the evening before, summary Monday morning

// ---------- DBs: p = main, t = test. Each environment knows its own DB from VERCEL_ENV
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

// ---------- Kyiv time
function kyivParts(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' })
    .formatToParts(d).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, H: +p.hour % 24, M: +p.minute, wd: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) };
}
function kyivToUtc(y, m, d, H, M) {   // UTC instant for Kyiv local y-m-d H:M (DST-aware)
  let t = Date.UTC(y, m - 1, d, H, M);
  for (let i = 0; i < 2; i++) { const k = kyivParts(new Date(t)); t -= Date.UTC(k.y, k.m - 1, k.d, k.H, k.M) - Date.UTC(y, m - 1, d, H, M); }
  return new Date(t);
}
const pad = n => String(n).padStart(2, '0');
function fmtKyiv(iso) { const k = kyivParts(new Date(iso)); return `${pad(k.d)}.${pad(k.m)} ${pad(k.H)}:${pad(k.M)}`; }
// ---------- post text: visible length, Telegram entities -> HTML
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
// matches DB check channel_posts_len_chk: tags stripped, "&amp;" counts as 5 (stricter than Telegram, so the DB never rejects)
const visibleLen = html => String(html).replace(/<[^>]+>/g, '').length;
function checkPost(p) {
  const text = String(p.text || ''), img = String(p.image_url || '').trim();
  if (!text.trim() && !img) return 'порожній пост';
  const n = visibleLen(text), max = img ? 1024 : 4096;
  return n > max ? `задовгий текст: ${n} символів, можна ${max}${img ? ' (підпис до картинки)' : ''}` : null;
}
// Telegram message entities (bold, italic, links...) -> HTML for parse_mode HTML. Offsets are UTF-16, same as JS strings
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
// target channel per DB tag: main-DB posts only to CHANNEL_CHAT_ID (CHANNEL_ID as fallback name) and only from Production; test-DB posts only to TEST_CHANNEL_ID
const channelFor = tag => (tag === 'p' ? (process.env.VERCEL_ENV === 'production' ? L.env('CHANNEL_CHAT_ID') || L.env('CHANNEL_ID') : '') : L.env('TEST_CHANNEL_ID'));
const STATUS = { draft: '📝 чернетка', pending_approval: '⏳ чекає рішення', published: '📣 опубліковано', rejected: '🚫 відхилено', failed: '⚠️ не вийшов' };
function postKb(tag, p) {
  const cb = a => `cp:${tag}:${p.id}:${a}`;
  if (p.status === 'published') return { inline_keyboard: [[{ text: '📣 Опубліковано', callback_data: 'cp:x' }]] };
  if (p.status === 'rejected') return { inline_keyboard: [[{ text: '🚫 Відхилено', callback_data: 'cp:x' }]] };
  return { inline_keyboard: [[{ text: p.status === 'failed' ? '🔁 Спробувати ще' : '✅ Опублікувати', callback_data: cb('pub') }, { text: '🚫 Відхилити', callback_data: cb('rej') }]] };
}
// admin preview: the post exactly as it will appear in the channel, buttons under it; if Telegram rejects the markup, an explanation with the same buttons
async function preview(owner, tag, p) {
  await L.tg('sendMessage', { chat_id: owner, text: `${label(tag)}Пост #${p.id} · ${STATUS[p.status] || p.status}` });
  const bad = checkPost(p);
  const r = bad ? null : await sendPost(owner, p, { reply_markup: postKb(tag, p) });
  if (!r || !r.ok) await L.tg('sendMessage', { chat_id: owner, text: `⚠️ Пост #${p.id} не вийде в такому вигляді: ${bad || (r && r.description) || 'Telegram не прийняв'}`, reply_markup: postKb(tag, p) });
}
// draft -> pending_approval atomically, then preview; returns false if another run/handler already took it
async function askOwner(q, owner, tag, id) {
  const [p] = await q(`channel_posts?id=eq.${id}&status=eq.draft`, { method: 'PATCH', prefer: 'return=representation', body: { status: 'pending_approval' } }) || [];
  if (!p) return false;
  await preview(owner, tag, p); return true;
}
// publish now: atomic claim pending_approval|failed -> published (a double tap or a concurrent handler gets nothing), then Telegram
async function publish(q, tag, id) {
  const chan = channelFor(tag);
  if (!chan) return { err: tag === 'p' ? 'не задано CHANNEL_CHAT_ID' : 'не задано TEST_CHANNEL_ID' };
  const iso = new Date().toISOString();
  const [p] = await q(`channel_posts?id=eq.${id}&status=in.(pending_approval,failed)`, { method: 'PATCH', prefer: 'return=representation', body: { status: 'published', published_at: iso, error: null } }) || [];
  if (!p) return { gone: true };
  let err = checkPost(p), r = null;
  if (!err) { try { r = await sendPost(chan, p); } catch (e) { err = String(e.message); } if (!err && !(r && r.ok)) err = (r && r.description) || 'Telegram не відповів'; }
  if (err) {
    await q(`channel_posts?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: 'failed', published_at: null, error: String(err).slice(0, 500) } });
    return { err, p: { ...p, status: 'failed' } };
  }
  await q(`channel_posts?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: { tg_message_id: r.result && r.result.message_id } });
  return { p };
}

const isOwner = from => { const o = L.env('OWNER_TG_ID'); return !!o && !!from && String(from.id) === o; };
const say = (chat_id, text, extra = {}) => L.tg('sendMessage', { chat_id, text, ...extra });
const POST_HELP = 'Як додати пост:\n/post <текст> — чернетка одразу приходить сюди з кнопками «Опублікувати» / «Відхилити». Розмітка (жирний, курсив, посилання) зберігається.\nКартинка: надішли фото з підписом «/post текст».\n/post test <текст> — у тестовий канал.\n/queue — пости, що чекають рішення; /queue test — тестові.\n/auto off|on — автопости (анонс драфту дня, підсумки тижня).';

async function queue(chat_id, tag) {
  const q = db(tag); if (!q) return say(chat_id, 'Ця база недоступна.');
  const rows = await q(`channel_posts?status=in.(draft,pending_approval,failed)&select=id,status,publish_at,text,image_url&order=publish_at.asc&limit=10`) || [];
  if (!rows.length) return say(chat_id, `${label(tag)}У черзі порожньо.`);
  const short = t => String(t || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 50);
  const text = `${label(tag)}Пости в черзі:\n` + rows.map(r => `#${r.id} · ${fmtKyiv(r.publish_at)} · ${STATUS[r.status]}${r.image_url ? ' · 🖼' : ''}\n${short(r.text)}`).join('\n\n');
  const kb = []; for (let i = 0; i < rows.length; i += 3) kb.push(rows.slice(i, i + 3).map(r => ({ text: `👁 #${r.id}`, callback_data: `cp:${tag}:${r.id}:show` })));
  return say(chat_id, text, { reply_markup: { inline_keyboard: kb } });
}

// ---------- Telegram update: true = handled here (api/bot.js stops)
async function handleUpdate(u) {
  const cq = u.callback_query;
  if (cq && typeof cq.data === 'string' && cq.data.startsWith('cp:')) {
    if (!isOwner(cq.from)) { await L.tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Ці кнопки — лише для адміністратора каналу.', show_alert: true }); return true; }
    const [, tag, id, act] = cq.data.split(':'), q = db(tag), msg = cq.message || {};
    if (!q || !/^\d+$/.test(id || '')) { await L.tg('answerCallbackQuery', { callback_query_id: cq.id }); return true; }
    let p = null, note = '';
    if (act === 'pub') {
      const r = await publish(q, tag, id); p = r.p || null;
      note = r.gone ? 'Уже опубліковано або відхилено' : r.err ? `Не вийшло: ${String(r.err).slice(0, 150)}` : 'Опубліковано ✅';
    } else if (act === 'rej') {
      [p] = await q(`channel_posts?id=eq.${id}&status=in.(draft,pending_approval,failed)`, { method: 'PATCH', prefer: 'return=representation', body: { status: 'rejected' } }) || [];
      note = p ? 'Відхилено' : 'Уже опубліковано або відхилено';
    } else if (act === 'show') {
      const [r] = await q(`channel_posts?id=eq.${id}&select=*`) || [];
      if (r && r.status === 'draft') await askOwner(q, cq.from.id, tag, id); else if (r) await preview(cq.from.id, tag, r);
    }
    await L.tg('answerCallbackQuery', { callback_query_id: cq.id, text: note, show_alert: /^Не вийшло/.test(note) });
    if (p && msg.chat) await L.tg('editMessageReplyMarkup', { chat_id: msg.chat.id, message_id: msg.message_id, reply_markup: postKb(tag, p) });
    return true;
  }
  const m = u.message;
  if (!m || !m.chat) return false;
  const photo = Array.isArray(m.photo) && m.photo.length ? m.photo[m.photo.length - 1].file_id : null;
  const raw = typeof m.text === 'string' ? m.text : photo && typeof m.caption === 'string' ? m.caption : '';
  const ents = typeof m.text === 'string' ? m.entities : m.caption_entities;
  const text = raw.trim(), isPrivate = m.chat.type === 'private';
  const cmd = text.startsWith('/') ? text.split(/[\s@]/)[0].toLowerCase() : '', args = text.split(/\s+/).slice(1);
  if (cmd === '/whoami') { await say(m.chat.id, `Твій Telegram ID: ${m.from && m.from.id}`); return true; }
  if (cmd === '/start' && isPrivate && args[0] === 'ch_daily') {
    await say(m.chat.id, '🎯 Драфт дня — однакове колесо для всіх, одна офіційна спроба. Тисни «Грати»!', { reply_markup: { inline_keyboard: [[{ text: '▶️ Грати', web_app: { url: SITE } }]] } });
    return true;
  }
  if (!['/post', '/queue', '/auto'].includes(cmd)) return false;
  if (!isOwner(m.from) || !isPrivate) { await say(m.chat.id, 'Ця команда — лише для адміністратора каналу, в особистих повідомленнях з ботом.'); return true; }
  const test = args[0] === 'test', tag = test ? 't' : OWN(), q = db(tag);
  if (!q) { await say(m.chat.id, 'Ця база недоступна.'); return true; }
  if (cmd === '/queue') { await queue(m.chat.id, tag); return true; }
  if (cmd === '/auto') {
    const opt = args[test ? 1 : 0];
    if (opt === 'off') await q('app_marks?on_conflict=key', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: { key: 'ch_auto_off' } });
    if (opt === 'on') await q('app_marks?key=eq.ch_auto_off', { method: 'DELETE', prefer: 'return=minimal' });
    const isOff = (await q('app_marks?key=eq.ch_auto_off&select=key') || []).length > 0;
    await say(m.chat.id, `${label(tag)}Автопости (анонс драфту дня, підсумки тижня): ${isOff ? 'вимкнено' : 'увімкнено'}. Вони приходять тобі чернетками на схвалення.`);
    return true;
  }
  // /post [test] <text>: the post body is everything after the command (and "test"), with its formatting converted to HTML
  const lead = raw.length - raw.trimStart().length;
  const head = /^\/post(@\w+)?\s*(test(\s+|$))?/i.exec(raw.trimStart());
  const cut = lead + (head ? head[0].length : 0);
  const shifted = (ents || []).filter(e => e.offset >= cut).map(e => ({ ...e, offset: e.offset - cut }));
  const body = entitiesToHtml(raw.slice(cut), shifted).trim();
  if (!body && !photo) { await say(m.chat.id, POST_HELP); return true; }
  const row = { text: body, image_url: photo, publish_at: new Date().toISOString(), status: 'draft', source: 'owner' };
  const bad = checkPost(row); if (bad) { await say(m.chat.id, `Не підходить: ${bad}.`); return true; }
  let p = null;
  try { [p] = await q('channel_posts', { method: 'POST', body: row, prefer: 'return=representation' }) || []; }
  catch (e) { await say(m.chat.id, `База не прийняла пост: ${String(e.message).slice(0, 200)}`); return true; }
  if (p) await askOwner(q, m.chat.id, tag, p.id);
  return true;
}

// ---------- auto posts: drafts for approval, daily / weekly (app_marks keys prevent duplicates)
async function once(key) { return ((await L.sb('app_marks?on_conflict=key', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=representation', body: { key } })) || []).length > 0; }
const unmark = key => L.sb(`app_marks?key=eq.${encodeURIComponent(key)}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {});   // draft insert failed -> next run retries
async function insertAuto(key, body) { try { const [p] = await L.sb('channel_posts', { method: 'POST', prefer: 'return=representation', body }) || []; return p; } catch (e) { await unmark(key); throw e; } }
const laterOf = (at, now) => new Date(Math.max(+at, +now));   // already past -> ask the admin on the next run
async function autoPosts(now = new Date()) {
  const made = [];
  if ((await L.sb('app_marks?key=eq.ch_auto_off&select=key') || []).length) return made;
  const k = kyivParts(now), day = `${k.y}-${pad(k.m)}-${pad(k.d)}`;
  const tk = kyivParts(new Date(+kyivToUtc(k.y, k.m, k.d, 12, 0) + 864e5)), tday = `${tk.y}-${pad(tk.m)}-${pad(tk.d)}`;   // tomorrow in Kyiv
  if (k.H >= DAILY_PREP_H && await once(`ch_daily:${tday}`)) {
    const E = require('../lib/engine.js'), ds = E.dailySetupFor(tday), rr = (E.MODES.daily || {}).rerolls || 0;
    const text = `<b>🎯 Драфт дня №${L.dayNo(tday)} · ${L.dayShort(tday)}</b>\n` +
      `Схема <b>${esc(ds.formation)}</b>, суперники — «Ліга легенд», ${rr === 1 ? 'одне перекручування' : rr + ' перекручування'} колеса.\n` +
      `Колесо однакове для всіх — хто збере найкращий сезон?\n\n<a href="${DAILY_LINK()}">Зіграти драфт дня →</a>`;
    const p = await insertAuto(`ch_daily:${tday}`, { text, publish_at: laterOf(kyivToUtc(tk.y, tk.m, tk.d, ...DAILY_AT), now).toISOString(), status: 'draft', source: 'auto' });
    if (p) made.push(p.id);
  }
  if (k.wd === 0 && k.H >= WEEKLY_PREP_H && await once(`ch_week:${day}`)) {   // Monday: last week's summary (Mon-Sun, Kyiv)
    const to = kyivToUtc(k.y, k.m, k.d, 0, 0), from = new Date(+to - 7 * 864e5);
    const rows = [];   // Supabase returns at most 1000 rows per request -> paginate (as in api/backup.js)
    for (let off = 0; ; off += 1000) {
      const pg = await L.sb(`seasons?created_at=gte.${from.toISOString()}&created_at=lt.${to.toISOString()}&verified=is.true&practice=is.false&select=id,pts,w,d,l,gf,ga,nickname,xi&order=id.asc&limit=1000&offset=${off}`) || [];
      rows.push(...pg); if (pg.length < 1000 || off > 200000) break;
    }
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
      const p = await insertAuto(`ch_week:${day}`, { text, publish_at: laterOf(kyivToUtc(k.y, k.m, k.d, ...WEEKLY_AT), now).toISOString(), status: 'draft', source: 'auto' });
      if (p) made.push(p.id);
    }
  }
  return made;
}

// ---------- run (every ~10 min from GitHub Actions, daily from Vercel Cron): auto posts -> drafts due (publish_at <= now) to the admin
async function runChannel(now = new Date()) {
  const tag = OWN(), owner = L.env('OWNER_TG_ID');
  const out = { env: tag, auto: [], asked: 0 };
  if (!owner) { out.off = 'не задано OWNER_TG_ID'; return out; }
  if (tag === 't' && /qruhcbwycrnfgzzdbljr/.test(L.SB_URL)) { out.off = 'тестовий сайт дивиться в основну базу (немає SUPABASE_URL тестової) — нічого не роблю'; return out; }
  try { out.auto = await autoPosts(now); } catch (e) { out.autoError = String(e.message).slice(0, 160); }
  for (const d of await L.sb(`channel_posts?status=eq.draft&publish_at=lte.${encodeURIComponent(now.toISOString())}&select=id&order=publish_at.asc&limit=10`) || [])
    if (await askOwner(L.sb, owner, tag, d.id)) out.asked++;
  // claimed for publishing but tg_message_id missing (handler died between status change and Telegram): tell the admin once
  const stale = new Date(+now - 15 * 6e4).toISOString();
  for (const d of await L.sb(`channel_posts?status=eq.published&tg_message_id=is.null&error=is.null&published_at=lt.${encodeURIComponent(stale)}&select=id`) || []) {
    const [p] = await L.sb(`channel_posts?id=eq.${d.id}&tg_message_id=is.null&error=is.null`, { method: 'PATCH', prefer: 'return=representation', body: { error: 'не підтверджено: публікація обірвалась' } }) || [];
    if (p) await say(owner, `❓ ${label(tag)}Пост #${p.id}: публікація не підтвердилась. Перевір канал; якщо поста немає — додай його ще раз.`);
  }
  return out;
}

module.exports = { handleUpdate, runChannel, autoPosts, publish, kyivToUtc, fmtKyiv, entitiesToHtml, checkPost, visibleLen };
