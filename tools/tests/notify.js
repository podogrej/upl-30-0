// Opt-in evening notifications (api/_notify.js) offline: DB and Telegram are stubs (tools/tests/_rest.js).
// Covers: /notify and /start notify explain what is sent and are off by default; on/off buttons (only in the player's own chat);
// evening: one message per subscriber with every group league played today + "streak at risk"; non-subscribers get nothing;
// nothing to say -> no message; second run -> no duplicates; blocked bot (403) -> switched off; daily cron runs it.
// Run from repo root: node tools/tests/notify.js
const path = require('path'); const { checker } = require('./_site.js');
Object.assign(process.env, { SUPABASE_URL: 'https://prod.db', SUPABASE_SERVICE_KEY: 'svc', TG_TOKEN: '123:T', TG_SECRET: 'sec', CRON_SECRET: 'cron', VERCEL_ENV: 'production' });
const ST = require('./_rest.js').pgStub(['https://prod.db']); const { tbl, TG } = ST; global.fetch = ST.fetch;
const DB = 'https://prod.db', T = t => tbl(DB, t);
const N = require(path.join(__dirname, '..', '..', 'api', '_notify.js'));
const BOT = require(path.join(__dirname, '..', '..', 'api', 'bot.js')), CRON = require(path.join(__dirname, '..', '..', 'api', 'cron.js'));
const bot = body => new Promise(r => BOT({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'sec' }, body }, { status() { return this; }, send() { r(); }, json() { r(); } }));
const cron = query => new Promise(r => CRON({ query, headers: { authorization: 'Bearer cron' } }, { c: 200, status(c) { this.c = c; return this; }, json(j) { r({ c: this.c, j }); } }));
let UID = 1;
const msg = (from, text, chat = { id: from, type: 'private' }) => ({ update_id: UID++, message: { message_id: UID, chat, from: { id: from, first_name: 'U' + from }, text } });
const cbq = (from, data, chat = { id: from, type: 'private' }) => ({ update_id: UID++, callback_query: { id: 'q' + UID, from: { id: from }, data, message: { message_id: 5, chat } } });
const sent = (chat, re) => TG.filter(x => x.m === 'sendMessage' && String(x.b.chat_id) === String(chat) && (!re || re.test(x.b.text || '')));
const kb = x => ((x.b.reply_markup && x.b.reply_markup.inline_keyboard) || []).flat().map(b => b.callback_data || b.text);
const on = id => (T('tg_notify').find(r => String(r.tg_user_id) === String(id)) || {}).enabled;
const DAY = '2026-10-08';
(async () => {
  const C = checker('notify'); const ok = C.check;
  ok(N.streakAtRisk(new Set(['2026-10-07', '2026-10-06']), DAY) === 2 && N.streakAtRisk(new Set(['2026-10-06', '2026-10-05']), DAY) === 2 &&
    N.streakAtRisk(new Set(['2026-10-08', '2026-10-07', '2026-10-06']), DAY) === 0 && N.streakAtRisk(new Set(['2026-10-07']), DAY) === 0 && N.streakAtRisk(new Set(['2026-10-05', '2026-10-04']), DAY) === 0,
    'серія під загрозою: учора й позавчора — так; зіграв сьогодні, 1 день чи пропуск 2 днів — ні');
  // freeze as on the site: one skipped day per week (Mon-Sun); 2026-10-05 is Monday
  ok(N.streakAtRisk(new Set(['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09']), '2026-10-11') === 0,
    'заморозку цього тижня вже витрачено (пропуск 07.10) — учора пропустив, серії вже немає, не нагадуємо');
  ok(N.streakAtRisk(new Set(['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']), DAY) === 6,
    'серія через заморозку (пропуск 03.10) рахується повністю: 6 дн., як на сайті');
  ok(N.streakAtRisk(new Set(['2026-10-05', '2026-10-06']), DAY) === 2 && N.streakAtRisk(new Set(['2026-10-12', '2026-10-13']), '2026-10-15') === 2,
    'пропустив учора, заморозка цього тижня ще є — нагадуємо');
  // /notify: what is sent, off by default
  await bot(msg(101, '/notify'));
  const a = sent(101, /Сповіщення від бота/)[0];
  ok(a && /підсумок дня в лігах/.test(a.b.text) && /серія драфту дня/.test(a.b.text) && /вимкнено/.test(a.b.text) && kb(a).join() === 'nt:on' && !on(101), '/notify — що надсилаємо, зараз вимкнено, кнопка «Увімкнути»');
  TG.length = 0; await bot(msg(101, '/start notify')); ok(sent(101, /Сповіщення від бота/).length === 1, '/start notify (посилання з сайту) — те саме');
  TG.length = 0; await bot(msg(101, '/notify', { id: -100500, type: 'group' })); ok(!TG.some(x => /Сповіщення від бота/.test(x.b.text || '')), '/notify у групі — не відповідаємо (лише в особистих)');
  TG.length = 0; await bot(msg(101, '/start')); ok(sent(101, /\/notify — вечірні сповіщення/).length === 1, 'привітання бота згадує /notify');
  // buttons
  await bot(cbq(101, 'nt:on')); ok(on(101) === true && sent(101, /Увімкнено/).length === 1, '«Увімкнути» — увімкнено');
  await bot(cbq(101, 'nt:on')); ok(T('tg_notify').filter(r => String(r.tg_user_id) === '101').length === 1, 'повторне натискання — один запис');
  await bot(cbq(202, 'nt:on', { id: -100500, type: 'group' })); ok(on(202) === undefined, 'кнопка не в особистому чаті — нічого не вмикає');
  await bot(cbq(101, 'nt:off')); ok(on(101) === false, '«Вимкнути» — вимкнено');
  await bot(cbq(101, 'nt:on'));
  // evening data: two group leagues, 101 plays in both; 303 subscribed, streak at risk; 404 not subscribed; 505 subscribed, played today, no league
  T('tg_notify').push({ tg_user_id: 303, enabled: true }, { tg_user_id: 404, enabled: false }, { tg_user_id: 505, enabled: true });
  T('leagues').push({ chat_id: -1, title: 'Друзі по лаві' }, { chat_id: -2, title: 'Робота' });
  let sid = 1; const res = (chat, tg, name, w, d, l, gf, ga) => { const id = sid++; T('seasons').push({ id, day: DAY, tg_user_id: tg, verified: true, practice: false, w, d, l, gf, ga, place: 3 }); T('league_results').push({ chat_id: chat, day: DAY, tg_user_id: tg, name, season_id: id, w, d, l, gf, ga, pts: w * 3 + d, created_at: DAY + 'T10:00:00Z' }); };
  res(-1, 101, 'Андрій', 20, 5, 5, 60, 20); res(-1, 404, 'Вітя', 22, 4, 4, 66, 22); res(-2, 101, 'Андрій', 15, 5, 10, 40, 35); res(-2, 606, 'Ігор', 10, 5, 15, 30, 40);
  T('daily_results').push({ day: '2026-10-07', tg_user_id: 303, verified: true }, { day: '2026-10-06', tg_user_id: 303, verified: true },
    { day: DAY, tg_user_id: 505, verified: true }, { day: '2026-10-07', tg_user_id: 505, verified: true }, { day: '2026-10-07', tg_user_id: null, player_id: 'p404', verified: true });
  TG.length = 0; const r1 = await N.sendEvening(DAY);
  const m101 = sent(101, /Твій день/);
  ok(m101.length === 1 && /«Друзі по лаві» — <b>2<\/b> з 2 · 65 оч\. \(20-5-5\)/.test(m101[0].b.text) && /«Робота» — <b>1<\/b> з 2 · 50 оч\./.test(m101[0].b.text) && !/Серія/.test(m101[0].b.text),
    'одне повідомлення на обидві ліги: місце, очки, рахунок ' + JSON.stringify(m101[0] && m101[0].b.text));
  ok(kb(m101[0]).includes('nt:off'), 'у повідомленні — кнопка «Вимкнути сповіщення»');
  const m303 = sent(303, /Твій день/); ok(m303.length === 1 && /Серія 2 дн\. під загрозою/.test(m303[0].b.text), 'серія під загрозою — нагадування');
  ok(!sent(404).length && !sent(606).length, 'хто не вмикав — нічого (навіть якщо грав у лізі)');
  ok(!sent(505).length, 'нема що сказати (зіграв сьогодні, ліг немає) — без повідомлення');
  ok(r1.subs === 3 && r1.sent === 2, 'підсумок запуску ' + JSON.stringify(r1));
  TG.length = 0; const r2 = await N.sendEvening(DAY); ok(!sent(101).length && !sent(303).length && r2.sent === 0, 'повторний запуск того ж вечора — без дублів');
  // blocked bot
  ST.FAIL['303'] = { error_code: 403, description: 'Forbidden: bot was blocked by the user' };
  T('daily_results').push({ day: '2026-10-08', tg_user_id: 303, verified: true });
  const NEXT = '2026-10-10'; T('daily_results').push({ day: '2026-10-09', tg_user_id: 303, verified: true });
  const r3 = await N.sendEvening(NEXT); ok(on(303) === false && r3.off === 1, 'бот заблокований (403) — сповіщення вимикаються');
  delete ST.FAIL['303'];
  // daily cron runs it
  T('daily_results').push({ day: '2026-10-11', tg_user_id: 101, verified: true }, { day: '2026-10-10', tg_user_id: 101, verified: true });
  TG.length = 0; const rc = await cron({ day: '2026-10-12' });
  ok(rc.c === 200 && rc.j.notify && rc.j.notify.sent === 1 && sent(101, /Серія 2 дн\./).length === 1, 'вечірній cron надсилає сповіщення ' + JSON.stringify(rc.j.notify));
  // many subscribers and long streaks: ids in chunks, rows page by page (Supabase returns at most 1000)
  const BIG = '2026-12-31'; let rid = 1;
  for (let u = 0; u < 120; u++) { T('tg_notify').push({ tg_user_id: 9000 + u, enabled: true }); for (let k = 1; k <= 40; k++) T('daily_results').push({ id: rid++, day: new Date(Date.parse(BIG) - k * 864e5).toISOString().slice(0, 10), tg_user_id: 9000 + u, verified: true }); }
  TG.length = 0; const rb = await N.sendEvening(BIG);
  const big = TG.filter(x => x.m === 'sendMessage' && +x.b.chat_id >= 9000);
  ok(big.length === 120 && big.every(x => /Серія 40 дн\./.test(x.b.text)), `120 підписників, 4800 днів у базі: усім нагадування й серія 40 дн. (надіслано ${big.length}) ` + JSON.stringify(rb));
  process.exit(C.done());
})();
