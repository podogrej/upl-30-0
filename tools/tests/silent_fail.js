// Server failures that used to go only to console (Vercel keeps it 1 hour) now reach client_errors; junk input does not.
// Offline: fake Supabase and Telegram (fetch). Run from repo root: node tools/tests/silent_fail.js
process.env.TG_TOKEN = '123:TEST'; process.env.SUPABASE_SERVICE_KEY = 'svc'; process.env.SUPABASE_URL = 'https://sb.test'; process.env.TG_CARDS_CHAT = '-100';
const errRows = [], calls = []; let TG_ANSWER = { ok: true, result: {} }, ERR_STATUS = 201, PUB_STATUS = 200;
const R = (x, status = 200) => ({ ok: status < 300, status, json: async () => x, text: async () => JSON.stringify(x) });
global.fetch = async (url, opt = {}) => {
  calls.push((opt.method || 'GET') + ' ' + url.replace(/^https:\/\/[^/]+/, ''));
  if (url.includes('/rest/v1/client_errors')) { if (ERR_STATUS < 300) errRows.push(...JSON.parse(opt.body)); return R(null, ERR_STATUS); }
  if (url.includes('/rpc/rate_hit')) return R(true);
  if (url.includes('/rest/v1/app_marks')) return R(opt.method === 'DELETE' ? null : [{ key: 'x' }]);
  if (url.includes('/rest/v1/seasons_pub')) return R([], PUB_STATUS);
  if (url.startsWith('https://api.telegram.org/')) return R(TG_ANSWER);
  return R([]);
};
const run = (h, req) => new Promise(done => { const r = { h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.c = c; return this; }, json(j) { done([this.c, j, this.h]); }, send(t) { done([this.c, t, this.h]); }, end() { done([this.c]); } }; h({ headers: {}, query: {}, ...req }, r); });
let fail = 0; const check = (ok, m) => { console.log(ok ? '✓' : '✗', m); if (!ok) fail++; };
const rows = re => errRows.filter(r => re.test(r.msg)).length;
(async () => {
  // junk JSON: 400 and nothing stored (client_errors is not a junk sink)
  for (const name of ['save', 'seed', 'verify', 'card', 'auth', 'league']) {
    const [c] = await run(require(`../../api/${name}.js`), { method: 'POST', body: '{bad' });
    check(c === 400, `${name}: зіпсований JSON — 400 (було 500)`);
  }
  check(rows(/json/i) === 0, 'зіпсований JSON нічого не пише в client_errors');
  // wrong bot token: Telegram answers 401 to every call; one row per instance, not one per call
  const L = require('../../api/_league.js');
  TG_ANSWER = { ok: false, error_code: 401, description: 'Unauthorized' };
  await L.tg('sendMessage', { chat_id: 1, text: 'a' }); await L.tg('sendMessage', { chat_id: 1, text: 'b' });
  check(rows(/^telegram: sendMessage: 401/) === 1, 'неправильний токен бота: один запис «telegram: … 401» на два виклики');
  TG_ANSWER = { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' };
  await L.tg('sendMessage', { chat_id: 1, text: 'c' });
  check(rows(/403/) === 0, 'гравець заблокував бота (403) — це не поломка, не пишемо');
  // error digest: a refused send drops the mark, so the next run sends it again
  const { errDigest } = require('../../api/_errdigest.js');
  const dsb = async (p, o) => p.startsWith('client_errors') ? [{ version: '0.94', msg: 'boom', n: 1 }] : L.sb(p, o);
  calls.length = 0;
  const tgBad = async () => ({ ok: false, error_code: 401, description: 'Unauthorized' });
  const d1 = await errDigest({ sb: dsb, tg: tgBad, env: L.env, day: '2026-10-21' });
  check(!d1.sent && /Unauthorized/.test(d1.why) && calls.some(c => /^DELETE .*app_marks\?key=eq\.errdigest-2026-10-21/.test(c)), 'зведення помилок не дійшло — позначку знято, причина в відповіді');
  const d2 = await errDigest({ sb: dsb, tg: async () => ({ ok: true }), env: L.env, day: '2026-10-21' });
  check(d2.sent, 'після ремонту токена зведення надсилається');
  const { digestText } = require('../../api/_errdigest.js');
  const many = Array.from({ length: 12 }, (_, i) => ({ version: '0.94', msg: 'client ' + i, player: 'p' + i, n: 5 }));
  check(/telegram: sendMessage: 401/.test(digestText([...many, { version: 'server', msg: 'telegram: sendMessage: 401 Unauthorized', n: 1 }], 'd').split('…')[0]), 'зведення: поломка токена бота — вгорі, не в «…і ще N»');
  // evening league summaries: a group that removed the bot (403) is normal, not stored
  process.env.CRON_SECRET = 'cs'; const n0 = errRows.length;
  TG_ANSWER = { ok: false, error_code: 403, description: 'Forbidden: bot was kicked from the group chat' };
  const lr = [-1, -2].map((chat_id, i) => ({ id: i + 1, chat_id, day: '2026-10-05', tg_user_id: 1, name: 'P', season_id: i + 1, w: 10, d: 0, l: 0, gf: 1, ga: 0, pts: 30, created_at: '2026-10-05T10:00:00Z' }));
  const f0 = global.fetch; global.fetch = async (url, opt = {}) => url.includes('/rest/v1/league_results') ? R(lr) : /\/rest\/v1\/seasons\?/.test(url) ? R(lr.map(r => ({ id: r.season_id, day: r.day, tg_user_id: 1, w: 10, d: 0, l: 0, gf: 1, ga: 0, place: 1 }))) : f0(url, opt);
  const [cc] = await run(require('../../api/cron.js'), { method: 'GET', query: { day: '2026-10-05' }, headers: { authorization: 'Bearer cs' } });
  global.fetch = f0;
  check(cc === 200 && errRows.slice(n0).filter(r => /cron summary/.test(r.msg)).length === 0, 'вечірній підсумок: група, що вигнала бота (403), не пише в журнал');
  // Mini App sign-in and group league join with a bad signature: refusal reason stored once
  const bad = 'auth_date=1&user=%7B%22id%22%3A1%7D&hash=00';
  let [c] = await run(require('../../api/auth.js'), { method: 'POST', body: { initData: bad } });
  await run(require('../../api/auth.js'), { method: 'POST', body: { initData: bad } });
  check(c === 401 && rows(/^auth: telegram signature: bad hash/) === 1, 'вхід у Mini App з поганим підписом — 401 і один запис з причиною');
  [c] = await run(require('../../api/league.js'), { method: 'POST', body: { initData: bad } });
  check(c === 401 && rows(/^league: telegram signature: bad hash/) === 1, 'ліга групи з поганим підписом — 401 і запис з причиною');
  // /r preview: DB failure is stored and the generic page is cached briefly, not for a day
  PUB_STATUS = 500;
  const [, html, h] = await run(require('../../api/r.js'), { method: 'GET', query: { id: '7' } });
  check(/s-maxage=300\b/.test(h['Cache-Control']) && rows(/^r: seasons_pub 500/) === 1 && /<html/i.test(html), '/r при збої бази: запис і кеш 5 хв, а не доба');
  PUB_STATUS = 200;
  const [, , h2] = await run(require('../../api/r.js'), { method: 'GET', query: { id: '8' } });
  check(/s-maxage=86400/.test(h2['Cache-Control']), '/r: сезону немає — як і раніше кеш на добу');
  // report() itself: a refused write is visible in the log instead of vanishing
  const { report } = require('../../api/_lib.js');
  const logged = []; const ce = console.error; console.error = (...a) => logged.push(a.join(' '));
  ERR_STATUS = 401; await report('x', 'y'); ERR_STATUS = 201; console.error = ce;
  check(logged.some(l => /report not stored: client_errors 401/.test(l)), 'журнал не прийняв запис — це видно в лозі');
  console.log(fail ? `ПОМИЛОК: ${fail}` : 'УСЕ ГАРАЗД');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗', e.stack); process.exit(1); });
