// DB request counts of the background jobs and the daily challenge on an in-memory PostgREST stub (api/*, no browser).
// Guards the audit "package B": empty channel run, evening cron per group, evening notifications in batches, daily challenge calls.
// Prints the numbers; the checks are upper bounds. Messages sent are compared with the expected text, so fewer requests never change behavior.
// Run from repo root: node tools/tests/query_count.js    (API=/path/to/other/checkout measures another tree, bounds then only print)
const path = require('path'), crypto = require('crypto');
const ROOT = process.env.API || path.join(__dirname, '..', '..');
const { pgStub } = require('./_rest.js');
const { checker } = require('./_site.js');
Object.assign(process.env, { SUPABASE_URL: 'https://prod.db', SUPABASE_SERVICE_KEY: 'svc', TG_TOKEN: '123:T', OWNER_TG_ID: '777', CHANNEL_CHAT_ID: '-100111', CRON_SECRET: 'cs', VERCEL_ENV: 'production' });
const ST = pgStub(['https://prod.db'], { onInsert: (t, r) => { if (t === 'season_seeds') r.id = r.id || crypto.randomUUID(); } }), { TG, tbl } = ST;
let N = 0, LOG = [];
const PLAYER = 'pppppppp-0000-4000-a000-000000000001';
global.fetch = async (u, o = {}) => {
  u = String(u);
  if (u.startsWith('https://prod.db/')) {
    N++; LOG.push((o.method || 'GET') + ' ' + u.slice(24).split('?')[0]);
    if (u.includes('/rpc/')) { const f = u.split('/rpc/')[1]; const j = f === 'device_ok' ? PLAYER : f === 'rate_hit' ? true : null; return { ok: true, status: 200, text: async () => JSON.stringify(j), json: async () => j }; }
  }
  return ST.fetch(u, o);
};
// n does not include the one daily cleanup call (rpc/cleanup_old_rows): it is per run, not per group
const count = async fn => { N = 0; LOG = []; const r = await fn(); const c = LOG.filter(l => /cleanup_old_rows/.test(l)).length; return { n: N - c, cleanup: c, r, log: [...LOG] }; };
const day = (d, k) => new Date(Date.parse(d + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);

(async () => {
  const T = checker('query_count'), out = {};
  const C = require(path.join(ROOT, 'api', '_channel.js')), N_ = require(path.join(ROOT, 'api', '_notify.js'));
  const CRON = require(path.join(ROOT, 'api', 'cron.js'));

  // ---- channel queue: empty runs
  const LIST = require(path.join(ROOT, 'lib', 'challenges.json')), VD = LIST[LIST.length - 1].day;
  out.chDay = (await count(() => C.runChannel(new Date(Date.parse(day(VD, -1) + 'T08:00:00Z'))))).n;                  // 11:00 Kyiv, no windows open
  tbl('https://prod.db', 'app_marks').push({ key: `ch_daily:${VD}` });
  out.chEve = (await count(() => C.runChannel(new Date(Date.parse(day(VD, -1) + 'T16:00:00Z'))))).n;                  // 19:00 Kyiv, announcement window, mark exists
  T.check(out.chDay <= 1, `порожній запуск черги: ${out.chDay} запит(ів) (було 3)`);
  T.check(out.chEve <= 2, `порожній запуск у вікні анонсу: ${out.chEve} (було 4)`);

  // ---- evening cron: 3 group leagues, 4 players each, 10 days of history (14 with the Sunday week)
  const CH = [-1001, -1002, -1003], DAYS = Array.from({ length: 11 }, (_, i) => day('2026-10-01', i));   // 10-01 .. 10-11
  let sid = 1;
  const LR = tbl('https://prod.db', 'league_results'), SE = tbl('https://prod.db', 'seasons');
  for (const c of CH) for (const d of DAYS) for (let p = 1; p <= 4; p++) {
    const w = 8 + ((p * 7 + sid) % 15), dd = 5, l = 30 - w - dd, gf = 40 + w, ga = 30 - w + 20, tg = Math.abs(c) * 10 + p;
    SE.push({ id: sid, verified: true, practice: false, day: null, created_at: d + 'T10:00:00Z', tg_user_id: tg, w, d: dd, l, gf, ga, place: p });
    LR.push({ chat_id: c, day: d, tg_user_id: tg, name: 'p' + tg, w, d: dd, l, pts: w * 3 + dd, gf, ga, created_at: d + 'T10:00:00Z', season_id: sid++ });
    if (d === DAYS[0]) tbl('https://prod.db', 'player_links').push({ kind: 'tg', key: String(tg), player_id: 'pl-' + tg });
  }
  for (const c of CH) tbl('https://prod.db', 'leagues').push({ chat_id: c, title: 'Ліга ' + c });
  const run = q => new Promise(r => CRON({ query: q, headers: { authorization: 'Bearer cs' } }, { c: 200, status(c) { this.c = c; return this; }, json(j) { r({ c: this.c, j }); } }));
  TG.length = 0;
  const wk = await count(() => run({ day: '2026-10-10' }));
  const texts = TG.filter(x => x.m === 'sendMessage' && /Підсумок дня/.test(x.b.text)).map(x => x.b.text);
  out.cronDay = wk.n; out.cronGroups = wk.r.j.summaries;
  T.check(wk.r.c === 200 && wk.r.j.summaries === 3 && texts.length === 3 && texts.every(t => /Переможець дня/.test(t) && /Залік ліги/.test(t)), 'вечірній cron: 3 підсумки надіслано, зміст на місці');
  out.cronPerGroup = +(wk.n / CH.length).toFixed(1);
  T.check(wk.cleanup === 1, `cron: чистка старих рядків — один запит за запуск (${wk.cleanup})`);
  TG.length = 0;
  const sun = await count(() => run({ day: '2026-10-11' }));
  out.cronSun = sun.n;
  T.check(sun.r.c === 200 && sun.r.j.summaries === 3 && sun.r.j.weekly === 3, 'неділя: підсумки дня й тижня надіслано');
  const again = await count(() => run({ day: '2026-10-11' }));
  T.check(again.r.j.summaries === 0 && again.r.j.weekly === 0, `повторний запуск — без дублів (${again.n} запитів)`);
  T.check(wk.n / CH.length <= 7, `cron: ${out.cronPerGroup} запитів на групу в будній день (було ~9 + 1 разом)`);
  T.check(sun.n / CH.length <= 9, `cron: ${(sun.n / CH.length).toFixed(1)} запитів на групу в неділю (було ~12)`);

  // ---- evening notifications: 12 players with a result today, 38 more subscribed without anything to say
  const NT = tbl('https://prod.db', 'tg_notify');
  for (const c of CH) for (let p = 1; p <= 4; p++) NT.push({ tg_user_id: Math.abs(c) * 10 + p, enabled: true });
  for (let i = 0; i < 38; i++) NT.push({ tg_user_id: 900000 + i, enabled: true });
  TG.length = 0;
  const nt = await count(() => N_.sendEvening('2026-10-11'));
  out.notify = nt.n;
  T.check(nt.r.sent === 12 && TG.filter(x => x.m === 'sendMessage').length === 12, 'сповіщення: 12 гравцям по одному повідомленню');
  const nt2 = await count(() => N_.sendEvening('2026-10-11'));
  T.check(nt2.r.sent === 0, 'повторний вечір — нікому вдруге');
  T.check(nt.log.filter(l => /app_marks/.test(l)).length <= 1, `мітки сповіщень: ${nt.log.filter(l => /app_marks/.test(l)).length} запит (було 12)`);

  // ---- daily challenge, one device
  const V = require(path.join(ROOT, 'api', '_vd.js'));
  const dev = crypto.randomUUID();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const vdDay = LIST.find(c => c.day <= today).day;
  const call = b => V.handle({ device_id: dev, secret: 'secret-0123456789abcdef', day: vdDay, ...b });
  const s1 = await count(() => call({ vd: 'start' }));
  const s2 = await count(() => call({ vd: 'start' }));
  const mine = await count(() => call({ vd: 'mine' }));
  out.vdStart = s1.n; out.vdResume = s2.n; out.vdMine = mine.n;
  T.check(s1.r[0] === 200 && s2.r[0] === 200 && s1.r[1].seed_id === s2.r[1].seed_id, 'виклик: старт і повторний старт — та сама спроба');
  console.log('числа:', JSON.stringify(out));
  process.exit(T.done());
})();
