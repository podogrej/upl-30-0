// Audit package C on the server side (api/_device.js gate, api/seed.js, api/save.js, api/league.js, api/cron.js) with a fetch stub:
// one api_gate call instead of rate_hit x2 + device_ok, 429 / 401 mapping, fallback to the old path while the SQL is missing,
// league_view used for the league page and the evening summary. The SQL itself is checked by tools/tests/setup.sh.
const path = require('path');
const { checker, callApi } = require('./_site.js');
Object.assign(process.env, { SUPABASE_URL: 'https://gate.test', SUPABASE_SERVICE_KEY: 'svc', TG_TOKEN: '123:T', CRON_SECRET: 'cs', VERCEL_ENV: 'production' });
const ROOT = path.join(__dirname, '..', '..');
const DEV = '11111111-2222-4333-8444-555555555555', SEC = 'abcdefghijklmnopqrstuvwxyz012345';
let LOG = [], GATE = 'ok', VIEW = 'ok', TGSENT = [];
const jres = (j, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(j) });
const missing = () => jres({ code: 'PGRST202', message: 'Could not find the function' }, 404);
global.fetch = async (u, o = {}) => {
  u = String(u);
  if (u.startsWith('https://api.telegram.org/')) { TGSENT.push(u.split('/').pop()); return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) }; }
  const rest = u.replace('https://gate.test/rest/v1/', ''), t = rest.split('?')[0], m = o.method || 'GET', a = o.body ? JSON.parse(o.body) : {};
  LOG.push(t.startsWith('rpc/') ? t : m + ' ' + t);
  if (t === 'rpc/api_gate') {
    if (GATE === 'missing') return missing();
    if (GATE === 'rate') return jres({ rate: false, player: null, err: null });
    if (GATE === 'secret') return jres({ rate: true, player: null, err: 'secret' });
    return jres({ rate: true, player: 'p-1', err: null });
  }
  if (t === 'rpc/rate_hit') return jres(true);
  if (t === 'rpc/device_ok') return jres('p-1');
  if (t === 'rpc/legacy_writes_open') return jres(false);
  if (t === 'rpc/league_view') {
    if (VIEW === 'missing') return missing();
    LOG.push('view:' + JSON.stringify([a.p_chat, a.p_card]));
    return jres({ title: 'Ліга', day: a.p_day, members: 3, today: [{ name: 'Аня', u: 'x', w: 20, d: 5, l: 5, pts: 65, gf: 50, ga: 20, created_at: '2026-10-11T10:00:00Z' }], ...(a.p_card ? {} : { standings: [{ name: 'Аня', u: 'x', wins: 2, days: 3, pts: 150 }] }) });
  }
  if (m === 'POST' && t === 'season_seeds') return jres([{ id: 's-1' }]);
  if (t === 'leagues') return jres([{ chat_id: -5, title: 'Ліга' }]);
  if (t === 'league_members') return jres([{ tg_user_id: 1 }]);
  return jres([]);
};
const mk = () => Array.from({ length: 11 }, (_, i) => ({ id: 'tm:' + i, slot: 'GK', c: 'x', y: 2020 }));
(async () => {
  const T = checker('gate_c'), seed = require(path.join(ROOT, 'api', 'seed.js')), save = require(path.join(ROOT, 'api', 'save.js')), league = require(path.join(ROOT, 'api', 'league.js'));
  const run = async (h, b) => { LOG = []; const r = await callApi(h, b); return { ...r, log: [...LOG] }; };
  const sb = { device_id: DEV, secret: SEC, xi: mk(), formation: '4-4-2', mode: 'normal', format: 'classic', year: 2020 };

  let r = await run(seed, sb);
  T.check(r.status === 200 && r.json.seed_id === 's-1' && r.log.filter(x => x.startsWith('rpc/')).join() === 'rpc/api_gate', 'seed: перевірка ліміту й секрету — один виклик api_gate: ' + r.log.join(' | '));
  r = await run(save, { kind: 'trophies', device_id: DEV, secret: SEC, ids: ['champ'] });
  T.check(r.log.filter(x => x.startsWith('rpc/')).join() === 'rpc/api_gate' && r.status !== 401 && r.status !== 429, `save: один виклик api_gate (${r.status})`);
  GATE = 'rate'; r = await run(seed, sb);
  T.check(r.status === 429 && r.json.rate === true && !r.log.includes('POST season_seeds'), 'seed: ліміт — 429, seed не видано');
  r = await run(save, { kind: 'trophies', device_id: DEV, secret: SEC, ids: ['champ'] });
  T.check(r.status === 429, 'save: ліміт — 429');
  GATE = 'secret'; r = await run(seed, sb);
  T.check(r.status === 401 && r.json.error === 'device secret' && !r.log.includes('POST season_seeds'), 'seed: чужий секрет — 401, seed не видано');
  r = await run(save, { kind: 'trophies', device_id: DEV, secret: SEC, ids: ['champ'] });
  T.check(r.status === 401 && r.json.error === 'device secret', 'save: чужий секрет — 401');
  r = await run(seed, { ...sb, vd: 'mine' });
  T.check(r.status === 401, 'виклик дня через seed: чужий секрет — 401');
  GATE = 'ok'; r = await run(save, { kind: 'trophies', device_id: DEV, ids: ['champ'] });
  T.check(r.status === 401 && r.json.error === 'secret?', 'save без секрету — 401 (api_gate не потрібен)');
  r = await run(save, { kind: 'trophies', device_id: 'not-a-uuid', secret: SEC, ids: ['champ'] });
  T.check(r.status === 400, 'save з поганим device_id — 400');
  GATE = 'missing'; r = await run(seed, sb);
  T.check(r.status === 200 && r.log.join().includes('rpc/api_gate') && r.log.filter(x => x === 'rpc/rate_hit').length === 2 && r.log.includes('rpc/device_ok'), 'seed: api_gate ще немає в базі — старий шлях (rate_hit x2 + device_ok): ' + r.log.join(' | '));
  r = await run(save, { kind: 'trophies', device_id: DEV, secret: SEC, ids: ['champ'] });
  T.check(r.status !== 401 && r.status !== 429 && r.log.includes('rpc/device_ok'), `save: старий шлях (${r.status})`);

  // league page: one league_view call, same answer shape as the row-by-row path
  const get = async q => { LOG = []; const out = await callApi(league, null, 'GET', q); return { ...out, log: [...LOG] }; };
  r = await get({ chat: '-5' });
  T.check(r.status === 200 && r.json.title === 'Ліга' && r.json.members === 3 && r.json.today.length === 1 && r.json.standings.length === 1 && r.log.join() === 'rpc/league_view,view:[-5,false]', 'ліга: сторінка — один виклик league_view з підсумками: ' + r.log.join(' | '));
  r = await get({ chat: '-5', card: '1' });
  T.check(r.status === 200 && !('standings' in r.json) && r.json.today.length === 1 && r.log.join() === 'rpc/league_view,view:[-5,true]', 'ліга: картка — без підсумків, один виклик');
  VIEW = 'missing'; r = await get({ chat: '-5' });
  T.check(r.status === 200 && r.json.title === 'Ліга' && r.log.includes('GET league_results'), 'ліга: league_view ще немає — рядки по одному, як раніше');

  // evening summary through league_view
  VIEW = 'ok'; TGSENT = [];
  const cron = require(path.join(ROOT, 'api', 'cron.js'));
  const rows = [{ chat_id: -5 }];
  const f2 = global.fetch; global.fetch = async (u, o = {}) => { const s = String(u); if (s.includes('/rest/v1/league_results?day=eq.') && s.includes('select=chat_id')) { LOG.push('GET league_results(chats)'); return jres(rows); } if (s.includes('/rest/v1/league_boards') && (o.method || 'GET') === 'GET') return jres([]); return f2(u, o); };
  LOG = []; const cr = await new Promise(res => cron({ method: 'GET', query: { day: '2026-10-07' }, headers: { authorization: 'Bearer cs' } }, { status(c) { this.c = c; return this; }, json(j) { res({ status: this.c || 200, json: j }); }, setHeader() {}, end() { res({ status: this.c || 200 }); } }));
  T.check(cr.status === 200 && TGSENT.includes('sendMessage') && LOG.includes('rpc/league_view') && !LOG.some(x => x === 'GET league_results'), 'підсумок дня: дані ліги — одним league_view, без вичитування історії: ' + LOG.join(' | '));
  process.exit(T.done());
})().catch(e => { console.error(e); process.exit(1); });
