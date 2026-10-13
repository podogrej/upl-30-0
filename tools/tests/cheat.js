// Anti-cheat without a browser: real api/seed.js and api/verify.js, in-memory DB.
// Also: /api/backup (Cron secret, gzip in storage, retention), joining a group league only as a group member (getChatMember stubbed),
// rate limiting (rate_hit as an in-memory counter) -> 429.
// An honest season (squad with effRating, server seed, recomputed by the same engine) must pass,
// every forgery must fail. Run: node tools/tests/cheat.js
const path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
process.env.SUPABASE_SERVICE_KEY = 'svc'; process.env.TG_TOKEN = '123:TEST'; process.env.CRON_SECRET = 'cron-secret-0123456789';
const DB = { season_seeds: [], seasons: [], daily_results: [], challenges: [], challenge_results: [], trophies: [], league_results: [], leagues: [], league_members: [], league_boards: [], season_offers: [] }; let sid = 0; let OFF_TABLE = true;
// Supabase storage (backups), Telegram (getChatMember), rate_hit counter
const STORE = {}, MEMBERS = {}, RATE = {}, MIGRATED = {}; let RATE_ON = false, TAMPER = null; const TGMSG = [];
const jres = j => ({ ok: true, status: 200, json: async () => j, text: async () => JSON.stringify(j) });
// DB: device secrets (device_ok), step-2 switch, unique official daily attempt
const SECRETS = {}; let LEGACY_OPEN = true, SQL053 = true, ERA_COL = true;
const err = (status, j) => ({ ok: false, status, text: async () => JSON.stringify(j) });
// Supabase Auth (api/auth.js): accounts by service email; tg_auth_user as in sql/v087 (made = created by our server, no password)
const AUTH = {}, LINKS = [];
global.fetch = async (url, o = {}) => {
  const u = new URL(url); const t = u.pathname.split('/').pop(); const m = o.method || 'GET';
  if (u.pathname.startsWith('/auth/v1/admin/')) {
    const a = JSON.parse(o.body || '{}'), tg = (/^tg-(\d+)@/.exec(a.email || '') || [])[1];
    if (t === 'users') { if (AUTH[tg]) return err(422, { msg: 'already registered' }); AUTH[tg] = { made: true, app: a.app_metadata || {}, user: a.user_metadata || {} }; return jres({ id: 'u' + tg }); }
    if (t === 'generate_link') { LINKS.push(tg); return jres({ hashed_token: 'h' + tg }); }
  }
  if (t === 'tg_auth_user') { const x = AUTH[JSON.parse(o.body).p_tg]; const tg = String(JSON.parse(o.body).p_tg);
    const v = !x ? 'none' : x.app.tg_id ? (x.app.tg_id === tg ? 'ok' : 'bad') : x.made ? ((x.app.tg_id = tg), 'ok') : 'bad'; return jres(v); }
  if (u.hostname === 'api.telegram.org') {
    const a = JSON.parse(o.body || '{}');
    if (t === 'getChatMember' && MIGRATED[a.chat_id]) return jres({ ok: false, description: 'Bad Request: group chat was upgraded to a supergroup chat', parameters: { migrate_to_chat_id: MIGRATED[a.chat_id] } });   // 0.69.4
    if (t === 'getChatMember') { const st = (MEMBERS[a.chat_id] || {})[a.user_id]; return jres(st ? { ok: true, result: { status: st, is_member: st !== 'left' } } : { ok: false, description: 'Bad Request: user not found' }); }
    if (t === 'sendMessage') TGMSG.push(a);
    return jres({ ok: true, result: { message_id: 1 } });
  }
  if (u.pathname.startsWith('/storage/v1/')) {
    const rest = u.pathname.slice('/storage/v1/'.length);
    if (m === 'POST' && rest.startsWith('object/list/backups')) return jres(Object.keys(STORE).sort().map(name => ({ name })));
    if (m === 'DELETE' && rest === 'object/backups') { JSON.parse(o.body).prefixes.forEach(n => { delete STORE[n]; }); return jres([]); }
    if (m === 'GET' && rest.startsWith('object/backups/')) { let f = STORE[decodeURIComponent(rest.slice('object/backups/'.length))]; if (f && TAMPER) f = TAMPER(f); return f ? { ok: true, status: 200, arrayBuffer: async () => f.buffer.slice(f.byteOffset, f.byteOffset + f.length), text: async () => '' } : err(404, { message: 'not found' }); }
    if (m === 'POST' && rest.startsWith('object/backups/')) { STORE[decodeURIComponent(rest.slice('object/backups/'.length))] = Buffer.from(o.body); return jres({ Key: rest }); }
    return err(400, { message: 'storage?' });
  }
  if (u.pathname.includes('/rpc/')) {
    const a = JSON.parse(o.body || '{}');
    if (!SQL053) return err(404, { code: 'PGRST202', message: 'Could not find the function public.' + t });
    if (t === 'rate_hit') { if (!RATE_ON) return jres(true); RATE[a.p_key] = (RATE[a.p_key] || 0) + 1; return jres(RATE[a.p_key] <= a.p_limit); }
    if (t === 'legacy_writes_open') return { ok: true, status: 200, text: async () => JSON.stringify(LEGACY_OPEN) };
    if (t === 'device_ok') {
      if (String(a.p_secret || '').length < 16) return err(400, { code: '22023', message: 'device?' });
      if (SECRETS[a.p_device] == null) SECRETS[a.p_device] = a.p_secret;
      if (SECRETS[a.p_device] !== a.p_secret) return err(403, { code: '28000', message: 'device secret' });
      return { ok: true, status: 200, text: async () => JSON.stringify('player-' + a.p_device.slice(0, 8)) };
    }
    if (t === 'fl_record_seed') return jres(null);   // friend-league try on lock: no fl_leagues rows here
    return err(404, { code: 'PGRST202' });
  }
  if (m === 'POST' && t === 'season_seeds') { const b = JSON.parse(o.body); if (b.daily && b.official && DB.season_seeds.some(x => x.official && x.daily && x.device_id === b.device_id && x.day === b.day)) return err(409, { code: '23505', message: 'duplicate key value violates unique constraint "season_seeds_official_uq"' }); }
  if (m === 'POST' && t !== 'season_seeds' && t !== 'daily_results' && !u.searchParams.get('on_conflict')) {   // rows written by /api/save
    const list = [].concat(JSON.parse(o.body));
    if (t === 'season_offers' && !OFF_TABLE) return err(404, { code: 'PGRST205', message: "Could not find the table 'public.season_offers' in the schema cache" });   // 0.85 SQL not applied yet
    if (t === 'seasons' && !ERA_COL && list.some(b => 'era' in b)) return err(400, { code: 'PGRST204', message: "Could not find the 'era' column of 'seasons' in the schema cache" });   // simulate DB without the era column
    for (const b of list) { if (t === 'seasons') { b.id = 1000 + DB.seasons.length; if (SECRETS[b.device_id] != null) b.player_id = 'player-' + b.device_id.slice(0, 8); }   // player_id as the DB trigger sets it
      if (t === 'challenges' && DB.challenges.some(x => x.id === b.id)) return err(409, { code: '23505' }); DB[t].push(b); }
    return { ok: true, status: 201, text: async () => JSON.stringify(list) };
  }
  if (m === 'POST' && (t === 'trophies' || t === 'challenge_results')) {
    for (const b of [].concat(JSON.parse(o.body))) { const ks = u.searchParams.get('on_conflict').split(','); if (!DB[t].some(x => ks.every(k => String(x[k]) === String(b[k])))) DB[t].push(b); }
    return { ok: true, status: 201, text: async () => '' };
  }
  const f = [...u.searchParams].filter(([k, v]) => /^(eq|is|lt)\./.test(v));   // lt. used for legacy challenges (created_at)
  const match = r => f.every(([k, v]) => { const x = v.slice(v.indexOf('.') + 1); if (v.startsWith('lt.')) return r[k] != null && String(r[k]) < x; return v.startsWith('is.') && x === 'null' ? r[k] == null : String(r[k]) === x; });
  const ok = j => ({ ok: true, status: 200, text: async () => j == null ? '' : JSON.stringify(j) });
  const rep = /return=representation/.test((o.headers || {}).Prefer || '');
  if (m === 'GET') return ok((DB[t] || []).filter(match));
  if (m === 'POST') { const out = [], ign = /ignore-duplicates/.test((o.headers && o.headers.Prefer) || '');   // row arrays and ignore-duplicates
    for (const b of [].concat(JSON.parse(o.body))) { if (t === 'season_seeds') b.id = crypto.randomUUID();
      const oc = u.searchParams.get('on_conflict'); const old = oc && DB[t].find(r => oc.split(',').every(k => String(r[k]) === String(b[k])));
      if (old) { if (!ign) Object.assign(old, b); } else DB[t].push(b); out.push(old || b); }
    return ok(out); }
  if (m === 'PATCH') { const b = JSON.parse(o.body); const rows = (DB[t] || []).filter(match); rows.forEach(r => Object.assign(r, b)); return ok(rep ? rows : null); }
  return ok(null);
};
const E = require(path.join(ROOT, 'lib', 'engine.js'));
// squad for E.run built the same way as api/verify.js, incl. club code and season (chemistry)
const SX = xi => xi.map(x => ({ id: x.id, name: x.n, slot: x.slot, pos: E.GROUP_OF[x.slot], r: x.r, cc: (E.DATA.clubs.find(c => c.n === x.c && c.y === +x.y) || {}).c, y: +x.y }));
const seedH = require(path.join(ROOT, 'api', 'seed.js')), verH = require(path.join(ROOT, 'api', 'verify.js'));
const { xiHash } = require(path.join(ROOT, 'api', '_lib.js')), { WIN } = require(path.join(ROOT, 'api', '_draft.js'));
const call = (h, body) => new Promise(res => { h({ method: 'POST', body }, { status(c) { this.c = c; return this; }, json(j) { res({ c: this.c, j }); } }); });
const canon = id => (E.DATA.alias && E.DATA.alias[id]) || id;
const card = (c, p, slot) => ({ n: p[0], id: p[5], slot, r: E.effRating(p, slot), r0: p[2], c: c.n, y: c.y });

// honest squad from a server wheel (idea of tools/wheel_window.js): one pick per wheel stop, first free player that fits an open slot
function wheelXi(ws, formation, format = 'classic', era = 'all', club = null) {
  E.setFormat(format);
  const seq = E.wheelFor(ws, format, era, club), slots = E.FORMATIONS[formation].slots.map(slot => ({ slot, x: null })), taken = new Set();
  for (let k = 0; k < seq.length && slots.some(s => !s.x); k++) {
    const c = E.DATA.clubs[seq[k]];
    for (const p of c.pl) {
      if (taken.has(canon(p[5]))) continue;
      const s = slots.find(q => !q.x && E.effRating(p, q.slot) != null);
      if (s) { s.x = card(c, p, s.slot); taken.add(canon(p[5])); break; }
    }
  }
  return slots.every(s => s.x) ? slots.map(s => s.x) : null;
}
const lockXi = xi => xi.map(x => ({ id: x.id, slot: x.slot, c: x.c, y: x.y }));
// full honest flow as the site does it: draft start -> squad from the wheel -> lock -> season row with the locked seed
async function draftSeason(dev, secret, o = {}) {
  const a = { format: 'classic', mode: 'normal', era: 'all', formation: '4-3-3', ...o };
  delete a.xi;
  const st = await call(seedH, { draft: 'start', device_id: dev, secret, ...a });
  if (st.c !== 200) return { st };
  const era = a.chal_id ? 'all' : a.era, xi = o.xi || wheelXi(st.j.ws, st.j.formation, a.format, era, a.club || null);
  const lk = await call(seedH, { draft: 'lock', device_id: dev, secret, seed_id: st.j.seed_id, xi: lockXi(xi) });
  if (lk.c !== 200) return { st, lk, xi };
  const q = E.run({ xi: SX(xi), mode: st.j.mode, format: a.format, year: st.j.year, seed: lk.j.seed });
  const row = { device_id: dev, version: E.VERSION, mode: st.j.mode, format: a.format, formation: st.j.formation, year: st.j.year, seed: lk.j.seed, seed_id: st.j.seed_id, xi,
    w: q.W, d: q.D, l: q.L, pts: q.pts, place: q.place, gf: q.gf, ga: q.ga,
    ...(era !== 'all' ? { era } : {}), ...(st.j.mode === 'practice' ? { practice: true } : {}), ...(a.format === 'oneclub' ? { club: a.club } : {}) };
  return { st, lk, xi, q, row };
}
const res6 = q => ({ w: q.W, d: q.D, l: q.L, pts: q.pts, place: q.place, gf: q.gf, ga: q.ga });
(async () => {
  const device = crypto.randomUUID(), devSec = 'legit-secret-0123456789abcd', formation = '4-3-3', year = E.LEAGUE_LEGENDS;   // classic opponents are the Legends League
  const L0 = await draftSeason(device, devSec, { formation });
  const xi = L0.xi, legit = L0.row;
  let bad = 0;
  const ok = (name, cond, extra = '') => { if (!cond) bad++; console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' (' + extra + ')' : ''}`); };
  ok('draft: старт і фіксація чесного складу з колеса, результат сервера = симуляція', !!xi && L0.lk.c === 200 && Object.entries(res6(L0.q)).every(([k, v]) => L0.lk.j.res[k] === v), `${L0.st.c}/${L0.lk && L0.lk.c} ${JSON.stringify(L0.lk && L0.lk.j)}`);
  const tamper = async (name, fn, expect, base = legit) => {
    const r = JSON.parse(JSON.stringify(base)); r.id = DB.seasons.length + 1; r.verified = null; fn(r); DB.seasons.push(r);
    if (name !== 'seed reused') DB.season_seeds.forEach(x => { x.used_by = null; });
    const x = await call(verH, { season_id: r.id }); const v = x.j.verified;
    const pass = v === expect; if (!pass) bad++;
    console.log(`${pass ? '✓' : '✗'} ${name}: verified=${v} (${x.j.note})`);
    return r;
  };
  const foot = xi.find(x => ['LB', 'RB', 'LW', 'RW'].includes(x.slot));
  const honest = await tamper('чесний сезон', r => {}, true);
  // season trophies are written by the server after verification (src 'srv'), the same conditions as the site
  { const st = DB.seasons.find(x => x.id === honest.id), c = E.trCtxRow(st); c.r = { ...L0.q, xp: L0.q.pts };
    const want = E.trEval(c).sort().join(), got = DB.trophies.filter(x => x.device_id === device && x.src === 'srv').map(x => x.trophy).sort().join();
    ok('verify: сервер сам записав сезонні трофеї (src srv), ті самі, що рахує сайт', got === want && DB.trophies.filter(x => x.device_id === device).every(x => x.src === 'srv'), `${got.split(',').filter(Boolean).length} шт.: ${got}`); }
  await tamper('seed reused', r => {}, false);
  // two parallel verifications of seasons that share one seed (both read used_by = null): the atomic claim lets exactly one through
  { const sr = await draftSeason(device, devSec, { formation });
    const mk = () => { const r = JSON.parse(JSON.stringify(sr.row)); r.id = DB.seasons.length + 1; r.verified = null; DB.seasons.push(r); return r; };
    const ra = mk(), rb = mk();
    const [xa, xb] = await Promise.all([call(verH, { season_id: ra.id }), call(verH, { season_id: rb.id })]);
    const won = [xa, xb].filter(x => x.j.verified === true), lost = [xa, xb].filter(x => x.j.verified === false);
    const seedRow = DB.season_seeds.find(x => x.id === sr.st.j.seed_id);
    const okRace = won.length === 1 && lost.length === 1 && /seed уже використано/.test(lost[0].j.note) && seedRow && [ra.id, rb.id].includes(+seedRow.used_by) && DB.seasons.filter(x => x.verified === true && x.seed_id === sr.st.j.seed_id).length === 1;
    ok(`два сезони на один seed одночасно: один перевірено, другий «seed уже використано» (${xa.j.verified}/${xb.j.verified}, ${xa.j.note} / ${xb.j.note})`, okRace);
    DB.seasons.forEach(x => { if (x.seed_id === sr.st.j.seed_id) x.verified = null; });
    const again = await call(verH, { season_id: won.length ? (xa.j.verified === true ? ra.id : rb.id) : ra.id });
    ok(`повторна перевірка того самого сезону, що взяв seed, лишається чинною (${again.j.verified})`, again.j.verified === true);
  }
  await tamper('рейтинг піднято до 99', r => { r.xi[0].r = 99; }, false);
  await tamper('рейтинг без штрафу/ноги (r = базовий)', r => { const x = r.xi.find(q => q.r !== q.r0); if (x) x.r = x.r0; else r.xi[0].r += 1; }, false);
  await tamper('очки завищено', r => { r.w += 1; r.d -= 1; r.pts += 2; }, false);
  await tamper('seed не від сервера', r => { r.seed_id = null; }, false);
  await tamper('гравець не з того клубу', r => { r.xi[1].c = 'Динамо (Київ)'; r.xi[1].y = 1992; }, false);
  await tamper('слоти переставлено', r => { const t = r.xi[0].slot; r.xi[0].slot = r.xi[10].slot; r.xi[10].slot = t; }, false);
  // PREV_VERSIONS is short: a season from an older site is 'unverifiable', not 'forged'
  await tamper('сезон з сайту 0.56 (до рейтингів v2) — не перевірити (null), не підробка', r => { r.version = '0.56'; }, null);
  await tamper('підробка з сайту 0.56 — не перевірено (null)', r => { r.version = '0.56'; r.xi[0].r = 99; }, null);
  await tamper('старша версія 0.49 — не перевірити (null)', r => { r.version = '0.49'; }, null);
  // any old version -> unverifiable (null); faking version to pass is impossible (audit P1-2)
  await tamper('сезон з сайту 0.66 — не перевірити (null)', r => { r.version = '0.66'; }, null);
  await tamper('сезон з сайту 0.65 — не перевірити (null)', r => { r.version = '0.65'; }, null);
  await tamper('підробка з сайту 0.62 — не перевірено (null)', r => { r.version = '0.62'; r.xi[0].r = 99; }, null);
  await tamper('сезон з сайту 0.61 — не перевірити (null)', r => { r.version = '0.61'; }, null);
  // classic against cult clubs (former opponents) on a Legends wheel: result recomputed honestly, only the year is wrong
  { const q = E.run({ xi: SX(xi), mode: 'normal', format: 'classic', year: E.LEAGUE_CULT, seed: legit.seed });
    const cult = r => Object.assign(r, { year: E.LEAGUE_CULT }, res6(q));
    await tamper('класика з підробленою старою версією проти культових клубів — не перевірено (аудит P1-2)', r => { cult(r); r.version = '0.64'; }, null);
    await tamper('класика проти культових клубів на колесі «Ліги легенд» — ні', r => { cult(r); }, false);
    await tamper('антисезон на колесі класики — ні', r => { cult(r); r.format = 'anti'; }, false); }
  // era: the season's era must be the wheel's era; the wheel of an era only offers that era's club-seasons, lock refuses others
  await tamper('епоха сезону «Сучасність», колесо — «Усі роки»', r => { r.era = 'y2015'; }, false);
  await tamper('епоха «Усі роки» — як без епохи', r => { r.era = 'all'; }, true);
  await tamper('невідома епоха', r => { r.era = 'y1900'; }, false);
  { const e2 = await draftSeason(device, devSec, { formation, era: 'd2000' });
    ok('draft епохи «2000-ні»: усі клуб-сезони складу з 2000–2009', !!e2.row && e2.xi.every(x => x.y >= 2000 && x.y <= 2009), e2.xi && e2.xi.map(x => x.y).join(','));
    if (e2.row) {
      await tamper('десятиліття «2000-ні»: чесний сезон з колеса епохи', r => {}, true, e2.row);
      await tamper('колесо «2000-ні», сезон записано як «Усі роки»', r => { delete r.era; }, false, e2.row);
      await tamper('колесо «2000-ні», сезон записано як «90-ті»', r => { r.era = 'd1990'; }, false, e2.row); }
    const st = await call(seedH, { draft: 'start', device_id: device, secret: devSec, format: 'classic', mode: 'normal', era: 'd2000', formation });
    const ex = wheelXi(st.j.ws, formation, 'classic', 'd2000'), used = new Set(ex.map(x => canon(x.id)));
    let old = null; for (const c of E.DATA.clubs) { if (c.y >= 2000) continue; const p = c.pl.find(p => !used.has(canon(p[5])) && E.effRating(p, ex[0].slot) != null); if (p) { old = card(c, p, ex[0].slot); break; } }
    ex[0] = old;
    const lk = await call(seedH, { draft: 'lock', device_id: device, secret: devSec, seed_id: st.j.seed_id, xi: lockXi(ex) });
    ok(`lock: колесо «2000-ні», у складі ${old.c} ${old.y} — 400`, lk.c === 400 && /епоха/.test(lk.j.error), `${lk.c} ${lk.j.error}`); }
  await tamper('r0 підроблено (показ у таблицях і на картці)', r => { r.xi[0].r0 = 99; }, false);
  await tamper('r0 немає (старий клієнт) — пропускаємо', r => { r.xi.forEach(x => { delete x.r0; }); }, true);
  // seed issued for one set of conditions, season saved with another
  await tamper('seed для іншої схеми', r => { r.formation = '4-4-2'; }, false);
  await tamper('seed для іншого формату', r => { r.format = 'derby'; }, false);
  await tamper('seed для іншого режиму', r => { r.mode = 'hard'; }, false);
  await tamper('seed для іншого року суперників', r => { r.year = E.LEAGUE_CULT; }, false);
  await tamper('позначка 30-0 без 30 перемог', r => { r.perfect = true; }, false);
  await tamper('сезон записано як тренування, колесо — звичайне', r => { r.practice = true; }, false);
  // one person under two ids (DATA.alias) counts as a duplicate player: lock refuses it, and verify too if such a squad were ever locked
  { const place = (id, used) => { for (const c of E.DATA.clubs) for (const p of c.pl) if (p[5] === id) for (let i = 0; i < xi.length; i++) {
      if (used.has(i)) continue; const r = E.effRating(p, xi[i].slot); if (r != null) return { i, x: card(c, p, xi[i].slot) }; } };
    let pair = null;
    for (const [d, k] of Object.entries(E.DATA.alias || {})) { const a = place(d, new Set()); const b = a && place(k, new Set([a.i])); if (a && b) { pair = [a, b]; break; } }
    if (!pair) ok('немає пари псевдонімів для перевірки', false);
    else {
      const x2 = xi.map(x => ({ ...x })); for (const q of pair) x2[q.i] = q.x;
      const sa = await call(seedH, { draft: 'start', device_id: device, secret: devSec, format: 'classic', mode: 'normal', formation });
      const la = await call(seedH, { draft: 'lock', device_id: device, secret: devSec, seed_id: sa.j.seed_id, xi: lockXi(x2) });
      ok(`lock: одна людина двічі (${pair[0].x.id} = ${pair[1].x.id}) — 400`, la.c === 400 && /двічі/.test(la.j.error), `${la.c} ${la.j.error}`);
      const srow = DB.season_seeds.find(x => x.id === sa.j.seed_id);
      Object.assign(srow, { xi_hash: xiHash(x2), locked_at: new Date().toISOString(), res: {} });   // as if a lock had let it through
      const q = E.run({ xi: SX(x2), mode: 'normal', format: 'classic', year, seed: +srow.seed });
      await tamper(`verify: одна людина двічі: ${pair[0].x.id} = ${pair[1].x.id}`, r => { Object.assign(r, { xi: x2, seed: +srow.seed, seed_id: srow.id }, res6(q)); }, false);
    } }
  // opponent year outside the format: a real weak season is allowed only for a replay of an old challenge (its wheel seed carries the year)
  const weak = E.YEARS16[0];
  { const q = E.run({ xi: SX(xi), mode: 'normal', format: 'classic', year: weak, seed: legit.seed });
    const wk = r => Object.assign(r, { year: weak }, res6(q));
    await tamper('класика проти справжнього сезону без виклику', wk, false);
    DB.challenges.push({ id: 'newchal1', seed: 777, year: weak, formation, mode: 'normal', created_at: '2026-10-02T10:00:00Z' });   // audit P1-1: a new challenge does not unlock a weak season
    await tamper('той самий сезон, є лише НОВИЙ виклик з цим роком — ні', wk, false);
    DB.challenges.push({ id: 'abcdefgh', seed: 424242, year: weak, formation, mode: 'normal', created_at: '2026-09-25T10:00:00Z' });
    await tamper('той самий сезон, є старий «Виклик другу» з цим роком, але колесо не з виклику — ні', wk, false); }
  { const oc = await draftSeason(device, devSec, { chal_id: 'abcdefgh' });
    ok('draft за старим викликом: колесо, схема й рік суперників — з виклику', oc.st.c === 200 && oc.st.j.ws === 424242 && oc.st.j.year === weak && oc.st.j.formation === formation && !!oc.row, `${oc.st.j.ws} ${oc.st.j.year}`);
    if (oc.row) await tamper('відповідь на старий «Виклик другу» з реальним сезоном — перевірено', r => {}, true, oc.row); }
  // seeds of tabs older than 0.90.1 ('legacy', no server wheel): the season is not verified (null), not a forgery
  { const lg = await call(seedH, { device_id: device, secret: devSec, xi, formation, mode: 'normal', format: 'classic', year });
    const q = E.run({ xi: SX(xi), mode: 'normal', format: 'classic', year, seed: lg.j.seed });
    ok('старий запит seed (без draft) — рядок kind legacy', (DB.season_seeds.find(x => x.id === lg.j.seed_id) || {}).kind === 'legacy');
    await tamper('сезон на seed без серверного колеса (legacy) — null', r => { Object.assign(r, { seed: lg.j.seed, seed_id: lg.j.seed_id }, res6(q)); }, null); }
  // one club and practice: honest drafts pass, the club / practice flag must match the wheel
  { const club = E.DATA.clubs.find(c => c.c && E.DATA.clubs.filter(x => x.c === c.c).length > 5).c;
    const oc = await draftSeason(device, devSec, { format: 'oneclub', club, formation });
    ok(`draft «Один клуб» (${club}): склад лише з цього клубу`, !!oc.row && oc.xi.every(x => (E.DATA.clubs.find(c => c.n === x.c && c.y === x.y) || {}).c === club), oc.lk ? `${oc.lk.c} ${oc.lk.j.error || ''}` : `${oc.st.c} ${oc.st.j.error}`);
    if (oc.row) { await tamper('«Один клуб»: чесний сезон', r => {}, true, oc.row);
      await tamper('«Один клуб»: сезон записано на інший клуб', r => { r.club = 'zzz'; }, false, oc.row); }
    const pr = await draftSeason(device, devSec, { mode: 'practice', formation });
    if (pr.row) { await tamper('тренування: чесний сезон', r => {}, true, pr.row);
      await tamper('тренування на колесі, сезон записано як звичайний', r => { r.practice = false; }, false, pr.row); }
    else ok('draft тренування', false, JSON.stringify(pr.st.j)); }

  // daily challenge: browser inserted inflated points into daily_results -> server overwrites with the verified season; a forgery without a season gets no verified flag
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const D = E.dailySetupFor(day);
  E.setFormat('classic');
  const dxi = [], used = new Set();
  for (const slot of E.FORMATIONS[D.formation].slots) { let pick = null;
    for (const i of D.seq) { const c = E.DATA.clubs[i]; for (const p of c.pl) { if (used.has(p[5])) continue; const r = E.effRating(p, slot); if (r != null) { pick = { c, p, r }; break; } } if (pick) break; }
    used.add(pick.p[5]); dxi.push({ n: pick.p[0], id: pick.p[5], slot, r: pick.r, r0: pick.p[2], c: pick.c.n, y: pick.c.y }); }
  const dev2 = crypto.randomUUID();
  const ds = await call(seedH, { device_id: dev2, xi: dxi, formation: D.formation, mode: 'daily', format: 'classic', year: D.year, daily: true });
  const dq = E.run({ xi: SX(dxi), mode: 'daily', format: 'classic', year: D.year, seed: ds.j.seed });
  const fakeDaily = { day, device_id: dev2, nickname: 'Шахрай', w: 30, d: 0, l: 0, pts: 90, gf: 99, ga: 0, place: 1, verified: null };
  DB.daily_results.push(fakeDaily);
  const cheater = { device_id: crypto.randomUUID(), day, nickname: 'Без сезону', w: 30, d: 0, l: 0, pts: 90, gf: 99, ga: 0, place: 1, verified: null };
  DB.daily_results.push(cheater);
  const drow = { id: DB.seasons.length + 1, device_id: dev2, version: E.VERSION, mode: 'daily', format: 'classic', formation: D.formation, year: D.year, day, practice: false, perfect: dq.W === 30,
    seed: ds.j.seed, seed_id: ds.j.seed_id, xi: dxi, w: dq.W, d: dq.D, l: dq.L, pts: dq.pts, place: dq.place, gf: dq.gf, ga: dq.ga, nickname: 'Чесний', verified: null };
  DB.seasons.push(drow);
  const dv = await call(verH, { season_id: drow.id });
  const t1 = dv.j.verified === true && fakeDaily.verified === true && fakeDaily.pts === dq.pts && fakeDaily.w === dq.W && fakeDaily.gf === dq.gf;
  if (!t1) bad++; console.log(`${t1 ? '✓' : '✗'} виклик дня: підроблені очки в daily_results переписано перевіреним сезоном (${fakeDaily.w}-${fakeDaily.d}-${fakeDaily.l}, ${fakeDaily.pts} оч., verified=${fakeDaily.verified})`);
  fakeDaily.pts = 90; fakeDaily.w = 30;   // browser tampered again -> repeated (cached) verify rewrites season numbers again
  await call(verH, { season_id: drow.id });
  const t2 = fakeDaily.pts === dq.pts && fakeDaily.w === dq.W;
  if (!t2) bad++; console.log(`${t2 ? '✓' : '✗'} виклик дня: повторний verify не лишає підроблених очок (${fakeDaily.pts})`);
  const t3 = cheater.verified !== true;
  if (!t3) bad++; console.log(`${t3 ? '✓' : '✗'} виклик дня: рядок з очками без перевіреного сезону не стає verified`);
  // server inserts the daily result itself if the browser has not sent one
  const dev3 = crypto.randomUUID();
  const ds3 = await call(seedH, { device_id: dev3, xi: dxi, formation: D.formation, mode: 'daily', format: 'classic', year: D.year, daily: true });
  const dq3 = E.run({ xi: SX(dxi), mode: 'daily', format: 'classic', year: D.year, seed: ds3.j.seed });
  const drow3 = { ...drow, id: DB.seasons.length + 1, device_id: dev3, seed: ds3.j.seed, seed_id: ds3.j.seed_id, perfect: dq3.W === 30, w: dq3.W, d: dq3.D, l: dq3.L, pts: dq3.pts, place: dq3.place, gf: dq3.gf, ga: dq3.ga, nickname: null, verified: null };
  DB.seasons.push(drow3);
  await call(verH, { season_id: drow3.id });
  const ins = DB.daily_results.find(x => x.device_id === dev3);
  const t4 = !!ins && ins.verified === true && ins.pts === dq3.pts && ins.nickname.length >= 2;
  if (!t4) bad++; console.log(`${t4 ? '✓' : '✗'} виклик дня: сервер сам записав результат (${ins ? ins.pts + ' оч., нік «' + ins.nickname + '»' : 'немає'})`);
  // second (unofficial) daily attempt does not go to the daily table
  const ds4 = await call(seedH, { device_id: dev3, xi: dxi, formation: D.formation, mode: 'daily', format: 'classic', year: D.year, daily: true });
  const dq4 = E.run({ xi: SX(dxi), mode: 'daily', format: 'classic', year: D.year, seed: ds4.j.seed });
  const drow4 = { ...drow3, id: DB.seasons.length + 1, seed: ds4.j.seed, seed_id: ds4.j.seed_id, perfect: dq4.W === 30, w: dq4.W, d: dq4.D, l: dq4.L, pts: dq4.pts, place: dq4.place, gf: dq4.gf, ga: dq4.ga, verified: null };
  DB.seasons.push(drow4);
  const before = ins.pts; const v4 = await call(verH, { season_id: drow4.id });
  const t5 = !ds4.j.official && ins.pts === before && DB.daily_results.filter(x => x.device_id === dev3).length === 1;
  if (!t5) bad++; console.log(`${t5 ? '✓' : '✗'} виклик дня: друга спроба (verified=${v4.j.verified}) не змінює таблицю дня`);
  // a chat-league attempt (draft seed with league) cannot carry a daily draft season: unlimited daily tries otherwise
  const dev5 = crypto.randomUUID(), sec5 = 'dev5-secret-0123456789abcd';
  const L5 = await draftSeason(dev5, sec5, { formation: D.formation, league: true });
  const lrow = { ...L5.row, id: DB.seasons.length + 1, day, practice: false, nickname: 'Обхід', verified: null };
  DB.seasons.push(lrow);
  const lv = await call(verH, { season_id: lrow.id });
  const lseed = DB.season_seeds.find(x => x.id === L5.st.j.seed_id) || {};
  ok(`виклик дня: сезон дня на колесі спроби ліги — відхилено, таблиця дня не змінена (${lv.j.note})`, lseed.league === true && !lseed.official && lv.j.verified === false && !DB.daily_results.some(x => x.device_id === dev5));
  { const ls = await call(seedH, { device_id: crypto.randomUUID(), xi: dxi, formation: D.formation, mode: 'normal', format: 'classic', year: D.year, league: true });
    const s = DB.season_seeds.find(x => x.id === ls.j.seed_id) || {};
    ok('старий запит seed з league — спробою ліги не позначається', ls.c === 200 && s.kind === 'legacy' && !s.league); }
  // and a daily seed is not spent on another (non-daily) season: such a seed has no server wheel -> not verified
  const dev6 = crypto.randomUUID();
  const ds6 = await call(seedH, { device_id: dev6, xi: dxi, formation: D.formation, mode: 'normal', format: 'classic', year: D.year, daily: true });
  const dq6 = E.run({ xi: SX(dxi), mode: 'normal', format: 'classic', year: D.year, seed: ds6.j.seed });
  const row6 = { ...drow, id: DB.seasons.length + 1, device_id: dev6, mode: 'normal', day: null, seed: ds6.j.seed, seed_id: ds6.j.seed_id, perfect: dq6.W === 30, ...res6(dq6), verified: null };
  DB.seasons.push(row6);
  const v6 = await call(verH, { season_id: row6.id });
  ok(`seed драфту дня для звичайного сезону — не перевірено (${v6.j.verified}, ${v6.j.note})`, v6.j.verified !== true && (DB.season_seeds.find(x => x.id === ds6.j.seed_id) || {}).used_by == null);

  // ===== 0.90.1: server wheel (draft start / lock) =====
  { const dv = crypto.randomUUID(), dsec = 'wheel-secret-0123456789abc';
    const start = o => call(seedH, { draft: 'start', device_id: dv, secret: dsec, format: 'classic', mode: 'normal', formation, ...o });
    const lock = (id, x, dev = dv, sec = dsec) => call(seedH, { draft: 'lock', device_id: dev, secret: sec, seed_id: id, xi: lockXi(x) });
    const w1 = await start({}), s1row = DB.season_seeds.find(x => x.id === w1.j.seed_id) || {};
    ok('draft start: колесо, рероли й суперники від сервера, рядок kind draft без складу', w1.c === 200 && w1.j.ws > 0 && w1.j.rerolls === E.MODES.normal.rerolls && w1.j.year === E.LEAGUE_LEGENDS
      && s1row.kind === 'draft' && +s1row.wheel_seed === w1.j.ws && s1row.xi_hash === '' && s1row.era === 'all' && !s1row.locked_at, JSON.stringify(w1.j));
    ok('draft start без секрету — 401', (await call(seedH, { draft: 'start', device_id: dv, format: 'classic', mode: 'normal', formation })).c === 401);
    const n1 = DB.season_seeds.length, codes = [];
    for (const o of [{ format: 'derby' }, { format: 'anti' }, { format: 'legends' }, { mode: 'hardcore' }, { mode: 'pick' }, { mode: 'daily' }, { format: '__proto__' }, { formation: '9-9-9' }, { era: 'y1900' }, { format: 'oneclub', club: 'nope' }, { draft: 'what' }])
      codes.push((await start(o)).c);
    ok('draft start: приховані формати (дербі, антисезон, легенди) і режими (хардкор, вибір), сміття — 400, рядків немає', codes.every(c => c === 400) && DB.season_seeds.length === n1, codes.join(','));
    // squad off the wheel: each club-season outside the first WIN positions needs a reroll
    const wx = wheelXi(w1.j.ws, formation), win = new Set(E.wheelFor(w1.j.ws, 'classic', 'all').slice(0, WIN['classic/all']));
    const offXi = n => { const out = wx.map(x => ({ ...x })), used = new Set(out.map(x => canon(x.id))); let k = 0;
      for (let i = 0; i < out.length && k < n; i++) for (let ci = 0; ci < E.DATA.clubs.length; ci++) { if (win.has(ci)) continue; const c = E.DATA.clubs[ci];
        const p = c.pl.find(p => !used.has(canon(p[5])) && E.effRating(p, out[i].slot) != null); if (p) { out[i] = card(c, p, out[i].slot); used.add(canon(p[5])); k++; break; } }
      return out; };
    const rr = w1.j.rerolls, far = await lock(w1.j.seed_id, offXi(rr + 1));
    ok(`lock: ${rr + 1} гравців поза колесом при ${rr} перекрутах — 400, склад не зафіксовано`, far.c === 400 && /поза колесом/.test(far.j.error) && !s1row.locked_at, `${far.c} ${far.j.error}`);
    for (const [name, x] of [['10 гравців', wx.slice(0, 10)], ['позиції не за схемою', [wx[1], wx[0], ...wx.slice(2)]], ['вигаданий гравець', wx.map((x, i) => i ? x : { ...x, id: 'w:2000-01-01:nobody' })]]) {
      const r = await lock(w1.j.seed_id, x); ok(`lock: ${name} — 400`, r.c === 400, `${r.c} ${r.j.error}`); }
    const near = offXi(rr), l1 = await lock(w1.j.seed_id, near);
    ok(`lock: ${rr} поза колесом (рівно стільки перекрутів) — прийнято`, l1.c === 200 && l1.j.seed > 0 && !!s1row.locked_at && s1row.xi_hash === xiHash(lockXi(near)), `${l1.c} ${l1.j.error || ''}`);
    const l2 = await lock(w1.j.seed_id, near);
    ok('lock: той самий склад удруге — та сама відповідь (seed і результат)', l2.c === 200 && l2.j.seed === l1.j.seed && JSON.stringify(l2.j.res) === JSON.stringify(l1.j.res));
    const l3 = await lock(w1.j.seed_id, wx);
    ok('lock: інший склад після фіксації — 409', l3.c === 409 && s1row.xi_hash === xiHash(lockXi(near)), `${l3.c} ${l3.j.error}`);
    const w2 = await start({});
    const l4 = await lock(w2.j.seed_id, wheelXi(w2.j.ws, formation), device, devSec);
    ok('lock: чужий seed (інший пристрій) — 404, не зафіксовано', l4.c === 404 && !(DB.season_seeds.find(x => x.id === w2.j.seed_id) || {}).locked_at, `${l4.c}`);
    ok('lock: seed_id не uuid — 400', (await call(seedH, { draft: 'lock', device_id: dv, secret: dsec, seed_id: 'x', xi: lockXi(wx) })).c === 400);
    // day limit: 60 draft starts per player and Kyiv day
    const dl = crypto.randomUUID(), dls = 'limit-secret-0123456789abcd', lc = [];
    for (let i = 0; i < 61; i++) lc.push((await call(seedH, { draft: 'start', device_id: dl, secret: dls, format: 'classic', mode: 'normal', formation })).c);
    const n61 = DB.season_seeds.filter(x => x.device_id === dl).length;
    const l62 = await call(seedH, { draft: 'start', device_id: dl, secret: dls, format: 'classic', mode: 'normal', formation });
    ok('draft start: 60 за день, 61-й — 429 з поясненням, рядок не створено', lc.slice(0, 60).every(c => c === 200) && lc[60] === 429 && l62.c === 429 && /сьогодні/.test(l62.j.error) && n61 === 60, `${lc.slice(58).join(',')} ${l62.j.error}`);
  }

  // ===== writes only via server with device secret (/api/save); seed requires the secret =====
  const saveH = require(path.join(ROOT, 'api', 'save.js'));
  const me = crypto.randomUUID(), mySecret = 'my-secret-0123456789abcdef', victim = crypto.randomUUID(), victimSecret = 'victim-secret-0123456789ab';
  const s1 = await draftSeason(me, mySecret, { formation });
  ok('draft зі своїм секретом: старт і фіксація', s1.st.c === 200 && !!s1.lk && s1.lk.c === 200 && s1.lk.j.seed > 0);
  const q1 = s1.q;
  const season = { ...s1.row, perfect: q1.W === 30, verified: true, player_id: 'someone-else', device_id: victim, tg_user_id: 777, nickname: 'Я' };
  const n0 = DB.seasons.length;
  const sv = await call(saveH, { kind: 'season', device_id: me, secret: mySecret, row: season, tg_init: 'user=%7B%22id%22%3A777%7D&hash=fake' });
  const saved = DB.seasons[DB.seasons.length - 1];
  ok('save: сезон зі своїм секретом записано й перевірено', sv.c === 200 && sv.j.verified === true && saved.id === sv.j.id, `verified=${sv.j.verified} ${sv.j.note || sv.j.error || ''}`);
  ok('save: device_id — з перевіреного пристрою, player_id/verified/tg_user_id з браузера відкинуто', saved.device_id === me && saved.player_id !== 'someone-else' && saved.tg_user_id == null && !('verified' in saved && saved.verified !== true));
  ok('save: без секрету — 401', (await call(saveH, { kind: 'season', device_id: me, row: season })).c === 401 && DB.seasons.length === n0 + 1);
  await call(seedH, { draft: 'start', device_id: victim, secret: victimSecret, format: 'classic', mode: 'normal', formation });   // victim has already played from this device
  const atk = await call(saveH, { kind: 'season', device_id: victim, secret: 'attacker-secret-0123456789', row: season });
  ok('save: у чужий пристрій (чужий секрет) — 401', atk.c === 401 && DB.seasons.length === n0 + 1, atk.j.error);
  const fake = await call(saveH, { kind: 'season', device_id: me, secret: mySecret, row: { ...season, w: 30, d: 0, l: 0, pts: 90 } });
  ok('save: неможливий/підроблений рахунок не стає перевіреним', fake.c === 400 || fake.j.verified !== true, `${fake.c} ${fake.j.verified}`);
  // era: written if the column exists; without it the season is still saved (no era); junk is not written
  const sEra = await call(saveH, { kind: 'season', device_id: me, secret: mySecret, row: { ...season, era: 'y2015' } });
  ok('save: епоха записується в seasons.era (колесо «Усі роки» — не перевірено)', DB.seasons[DB.seasons.length - 1].era === 'y2015' && sEra.j.verified === false, sEra.j.note);
  await call(saveH, { kind: 'season', device_id: me, secret: mySecret, row: { ...season, era: '<b>' } });
  ok('save: некоректна епоха не пишеться', !('era' in DB.seasons[DB.seasons.length - 1]));
  ERA_COL = false; const nE = DB.seasons.length;
  const noCol = await call(saveH, { kind: 'season', device_id: me, secret: mySecret, row: { ...season, era: 'y2010' } });
  ok('save: без колонки era сезон однаково записано', noCol.c === 200 && DB.seasons.length === nE + 1 && !('era' in DB.seasons[nE]), `${noCol.c} ${noCol.j.error || ''}`);
  ERA_COL = true;
  // wheel offers (0.85): 11 lists aligned with xi, each with its picked player; anything else is dropped, the season is saved anyway
  const offOk = season.xi.map((x, i) => [x.id, 'w:1990-01-01:other' + i]);
  const offSave = async off => { const n = DB.season_offers.length, r = await call(saveH, { kind: 'season', device_id: me, secret: mySecret, row: season, off }); return { r, added: DB.season_offers.slice(n) }; };
  { const { r, added } = await offSave(offOk);
    ok('save: пропозиції колеса записано окремо (season_offers), з id сезону', r.c === 200 && r.j.off === true && added.length === 1 && added[0].season_id === r.j.id && JSON.stringify(added[0].off) === JSON.stringify(offOk)); }
  { const { r, added } = await offSave(offOk.map(a => [...a, a[0]]));
    ok('save: дублікати в пропозиціях прибрано', r.j.off === true && added.length === 1 && added[0].off.every(a => a.length === 2)); }
  for (const [name, off] of [['сміття (рядок)', 'garbage'], ['сміття (числа)', offOk.map(() => [1, 2])], ['не 11 списків', offOk.slice(0, 10)], ['порожній список', offOk.map((a, i) => i === 3 ? [] : a)],
    ['завеликий список (65)', offOk.map((a, i) => i === 0 ? [a[0], ...Array.from({ length: 64 }, (_, k) => 'w:1990-01-01:x' + k)] : a)], ['завеликий id', offOk.map((a, i) => i === 0 ? [a[0], 'x'.repeat(41)] : a)],
    ['чужі символи в id', offOk.map((a, i) => i === 0 ? [a[0], '<script>'] : a)], ['без обраного гравця', offOk.map((a, i) => i === 5 ? ['w:1990-01-01:nobody'] : a)], ['обраний не в своєму слоті', [offOk[1], offOk[0], ...offOk.slice(2)]]]) {
    const { r, added } = await offSave(off);
    ok(`save: пропозиції «${name}» відкинуто, сезон записано`, r.c === 200 && !!r.j.id && r.j.off !== true && added.length === 0, `${r.c} off=${r.j.off}`);
  }
  { const n = DB.season_offers.length, r = await call(saveH, { kind: 'season', device_id: me, secret: mySecret, row: season });
    ok('save: без поля off нічого не пишеться в season_offers', r.c === 200 && r.j.off === undefined && DB.season_offers.length === n); }
  OFF_TABLE = false;
  { const { r } = await offSave(offOk); ok('save: без таблиці season_offers (SQL 0.85 ще не виконано) сезон однаково записано', r.c === 200 && !!r.j.id && r.j.off === false, `${r.c} ${r.j.error || ''}`); }
  OFF_TABLE = true;
  const mine = () => DB.trophies.filter(x => x.device_id === me && x.src !== 'srv').map(x => x.trophy).sort().join();
  const tr = await call(saveH, { kind: 'trophies', device_id: me, secret: mySecret, ids: ['f5play', 'f5play', 'bad id!', 'x'.repeat(40)] });
  ok('save: трофеї — лише коректні id, без дублів', tr.c === 200 && mine() === 'f5play', mine());
  ok('save: трофей у чужий пристрій — 401', (await call(saveH, { kind: 'trophies', device_id: victim, secret: 'attacker-secret-0123456789', ids: ['hack'] })).c === 401 && !DB.trophies.some(x => x.device_id === victim));
  // season trophies come only from the server; milestones msN only with N verified seasons
  { const STR = E.TROPHIES.find(t => t.t && !DB.trophies.some(x => x.device_id === me && x.trophy === t.id)).id;
    const t1 = await call(saveH, { kind: 'trophies', device_id: me, secret: mySecret, ids: [STR] });
    ok(`save: сезонний трофей від браузера (${STR}) відкинуто — 200, n 0`, t1.c === 200 && t1.j.ok === true && t1.j.n === 0 && !DB.trophies.some(x => x.device_id === me && x.trophy === STR), JSON.stringify(t1.j));
    const sx = await draftSeason(me, mySecret, { formation });
    const t2 = await call(saveH, { kind: 'season', device_id: me, secret: mySecret, row: sx.row, trophies: [STR, 'f5hat'] });
    ok('save сезону з трофеями: сезонний трофей з браузера відкинуто, решту записано', t2.j.verified === true && t2.j.tr === true && !DB.trophies.some(x => x.device_id === me && x.trophy === STR && x.src !== 'srv') && mine() === 'f5hat,f5play', mine());
    const nv = DB.seasons.filter(x => x.device_id === me && x.verified === true && !x.practice).length;
    const t3 = await call(saveH, { kind: 'trophies', device_id: me, secret: mySecret, ids: ['ms1', 'ms' + (nv + 1), 'ms1000'] });
    ok(`save: віхи — ms1 записано, ms${nv + 1} і ms1000 ні (перевірених сезонів ${nv})`, t3.c === 200 && t3.j.n === 1 && mine() === 'f5hat,f5play,ms1', mine()); }
  // friend challenge: only from an own verified free classic season; wheel, rules and result come from the DB
  { const fakeChal = { id: 'abcDEF23', name: 'Я', seed: 5, formation: '4-4-2', year: E.YEARS16[0], mode: 'hard', w: 30, d: 0, l: 0, pts: 90, place: 1, gf: 99, ga: 0 };
    const ch = await call(saveH, { kind: 'challenge', device_id: me, secret: mySecret, season_id: sv.j.id, row: fakeChal });
    const c0 = DB.challenges.find(x => x.id === 'abcDEF23') || {};
    ok('save: виклик другу з перевіреного сезону — колесо (wheel_seed) і результат з бази, не з браузера', ch.c === 200 && c0.device_id === me && c0.seed === s1.st.j.ws && c0.formation === formation && c0.year === year && c0.mode === 'normal'
      && c0.pts === q1.pts && c0.w === q1.W && c0.gf === q1.gf, `${ch.c} ${JSON.stringify(c0)}`);
    ok('save: той самий номер виклику вдруге — 409', (await call(saveH, { kind: 'challenge', device_id: me, secret: mySecret, season_id: sv.j.id, row: { id: 'abcDEF23' } })).c === 409);
    const unver = DB.seasons.find(x => x.device_id === me && x.verified !== true), foreign = DB.seasons.find(x => x.device_id === device && x.verified === true);
    for (const [name, sid] of [['неперевірений сезон', unver && unver.id], ['чужий перевірений сезон', foreign && foreign.id], ['без season_id', undefined], ['неіснуючий сезон', 999999]]) {
      const n = DB.challenges.length, r = await call(saveH, { kind: 'challenge', device_id: me, secret: mySecret, season_id: sid, row: { id: 'zzzZZZ99', name: 'Я' } });
      ok(`save: виклик з ${name} — 400, не записано`, r.c === 400 && DB.challenges.length === n, `${r.c} ${r.j.error}`); }
    const cr = await call(saveH, { kind: 'chal_result', device_id: me, secret: mySecret, row: { challenge_id: 'abcDEF23', name: 'Я', w: 30, d: 0, l: 0, pts: 90, place: 1, gf: 99, ga: 0 } });
    ok('save: chal_result від браузера ігнорується (200, ignored), рядка немає', cr.c === 200 && cr.j.ignored === true && !DB.challenge_results.some(x => x.challenge_id === 'abcDEF23'));
    // the friend plays the same wheel; the result is written by the server on lock, the first locked attempt counts
    const v1 = await draftSeason(victim, victimSecret, { chal_id: 'abcDEF23', formation: '3-5-2' });
    const cr1 = DB.challenge_results.filter(x => x.challenge_id === 'abcDEF23');
    ok('виклик: друг отримав те саме колесо, схему й суперників', v1.st.c === 200 && v1.st.j.ws === s1.st.j.ws && v1.st.j.formation === formation && v1.st.j.year === year, JSON.stringify(v1.st.j));
    ok('виклик: результат друга записав сервер при фіксації складу', cr1.length === 1 && cr1[0].device_id === victim && cr1[0].pts === v1.lk.j.res.pts && cr1[0].w === v1.lk.j.res.w, JSON.stringify(cr1));
    const v2 = await draftSeason(victim, victimSecret, { chal_id: 'abcDEF23' });
    const cr2 = DB.challenge_results.filter(x => x.challenge_id === 'abcDEF23');
    ok('виклик: друга спроба не замінює першу', v2.lk && v2.lk.c === 200 && cr2.length === 1 && cr2[0].pts === v1.lk.j.res.pts);
    const vs = await call(saveH, { kind: 'season', device_id: victim, secret: victimSecret, row: v1.row });
    ok('виклик: сезон друга на колесі виклику перевірено', vs.j.verified === true, vs.j.note);
    ok('draft start: неіснуючий виклик — 404', (await call(seedH, { draft: 'start', device_id: victim, secret: victimSecret, chal_id: 'nochal99', formation })).c === 404); }
  ok('save: невідомий kind — 400', (await call(saveH, { kind: 'daily', device_id: me, secret: mySecret, row: {} })).c === 400);
  // /api/seed: foreign device
  const dayArgs = { xi: dxi, formation: D.formation, mode: 'daily', format: 'classic', year: D.year, daily: true };
  ok('seed: чужий пристрій з чужим секретом — 401 (офіційна спроба жертви ціла)', (await call(seedH, { device_id: victim, secret: 'attacker-secret-0123456789', ...dayArgs })).c === 401 && !DB.season_seeds.some(x => x.device_id === victim && x.daily));
  ok('seed: без секрету в перехідний період (сайт 0.52) — видається', (await call(seedH, { device_id: crypto.randomUUID(), ...dayArgs })).c === 200);
  LEGACY_OPEN = false;
  ok('seed: без секрету після кроку 2 — 401', (await call(seedH, { device_id: victim, ...dayArgs })).c === 401 && !DB.season_seeds.some(x => x.device_id === victim && x.daily));
  // client timed out and retried: same squad, attempt not played -> the same official seed; another squad -> a regular attempt
  {const rd = crypto.randomUUID(), rsec = 'retry-secret-0123456789ab';
   const r1 = await call(seedH, { device_id: rd, secret: rsec, ...dayArgs }), r2 = await call(seedH, { device_id: rd, secret: rsec, ...dayArgs });
   const n1 = DB.season_seeds.filter(x => x.device_id === rd).length;
   const other = { ...dayArgs, xi: [...dayArgs.xi.slice(1), dayArgs.xi[0]] };
   const r3 = await call(seedH, { device_id: rd, secret: rsec, ...other });
   ok('seed: повтор після таймауту — той самий офіційний seed', r1.j.official && r2.j.official && r2.j.seed === r1.j.seed && r2.j.seed_id === r1.j.seed_id && n1 === 1, `${r1.j.seed}/${r2.j.seed}`);
   ok('seed: інший склад після офіційного — звичайна спроба', r3.c === 200 && !r3.j.official && r3.j.seed_id !== r1.j.seed_id);}
  // two concurrent requests - only one official attempt
  const racer = crypto.randomUUID(), rs = 'racer-secret-0123456789ab';
  const both = await Promise.all([call(seedH, { device_id: racer, secret: rs, ...dayArgs }), call(seedH, { device_id: racer, secret: rs, ...dayArgs })]);
  ok('seed: гонка двох запитів — одна офіційна спроба (той самий seed обом)', both.every(x => x.c === 200) && both[0].j.seed_id === both[1].j.seed_id && DB.season_seeds.filter(x => x.device_id === racer && x.official).length === 1, both.map(x => x.j.official + ':' + x.j.seed).join('/'));
  // race with a different squad: the second one is a regular attempt
  const racer2 = crypto.randomUUID(), rs2 = 'racer2-secret-0123456789ab', alt = { ...dayArgs, xi: [...dayArgs.xi.slice(1), dayArgs.xi[0]] };
  const both2 = await Promise.all([call(seedH, { device_id: racer2, secret: rs2, ...dayArgs }), call(seedH, { device_id: racer2, secret: rs2, ...alt })]);
  ok('seed: гонка з різними складами — офіційна лише одна', both2.every(x => x.c === 200) && both2.filter(x => x.j.official).length === 1);
  // device-secret SQL not applied yet: server says 'write the old way', seed still works
  SQL053 = false;
  const fb = await call(saveH, { kind: 'season', device_id: me, secret: mySecret, row: season });
  ok('save без device_ok у базі — 503 fallback (браузер пише як 0.52)', fb.c === 503 && fb.j.fallback === true);
  ok('seed без device_ok у базі — працює', (await call(seedH, { device_id: me, secret: mySecret, xi, formation, mode: 'normal', format: 'classic', year })).c === 200);
  SQL053 = true;

  // ===== backup (/api/backup) =====
  const zlib = require('zlib');
  const backupH = require(path.join(ROOT, 'api', 'backup.js'));
  const callReq = (h, req) => new Promise(res => { h({ method: 'GET', query: {}, headers: {}, ...req }, { status(c) { this.c = c; return this; }, json(j) { res({ c: this.c, j }); } }); });
  ok('backup: без заголовка — 401', (await callReq(backupH, {})).c === 401 && !Object.keys(STORE).length);
  ok('backup: чужий секрет — 401', (await callReq(backupH, { headers: { authorization: 'Bearer wrong' } })).c === 401 && !Object.keys(STORE).length);
  { const cs = process.env.CRON_SECRET; process.env.CRON_SECRET = '';
    ok('backup: CRON_SECRET не задано — 401 (закрито за замовчуванням)', (await callReq(backupH, { headers: { authorization: 'Bearer ' } })).c === 401);
    process.env.CRON_SECRET = cs; }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const dAgo = n => new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10)) - n * 864e5).toISOString().slice(0, 10);
  const mondayAgo = min => { for (let n = min; ; n++) if (new Date(dAgo(n)).getUTCDay() === 1) return n; };
  const nonMondayAgo = min => { for (let n = min; ; n++) if (new Date(dAgo(n)).getUTCDay() !== 1) return n; };
  const keep = [dAgo(1), dAgo(13), dAgo(mondayAgo(20)), dAgo(mondayAgo(43))].map(d => d + '.json.gz').concat(['notes.txt']);   // mondayAgo(50) would equal 56 days on a Monday, the same date as in drop
  const drop = [dAgo(nonMondayAgo(14)), dAgo(nonMondayAgo(30)), dAgo(mondayAgo(56)), dAgo(mondayAgo(90))].map(d => d + '.json.gz');
  for (const n of keep.concat(drop)) STORE[n] = Buffer.from('old');
  const bk = await callReq(backupH, { headers: { authorization: 'Bearer ' + process.env.CRON_SECRET } });
  let dump = null; try { dump = JSON.parse(zlib.gunzipSync(STORE[today + '.json.gz'])); } catch (e) {}
  ok('backup: з секретом — файл YYYY-MM-DD.json.gz, gzip JSON з усіма таблицями', bk.c === 200 && !!dump && backupH.TABLES.every(T => Array.isArray(dump.tables[T.t])),
    `${bk.c} ${bk.j.file || bk.j.error} ${bk.j.bytes} Б`);
  ok('backup: рядки й кількості сходяться (seasons, daily_results, trophies)', !!dump && dump.counts.seasons === DB.seasons.length && dump.tables.seasons.length === DB.seasons.length
    && dump.tables.seasons.some(r => Array.isArray(r.xi)) && dump.counts.daily_results === DB.daily_results.length && dump.counts.trophies === DB.trophies.length, dump && JSON.stringify(dump.counts));
  ok('backup: лишились 14 днів + понеділки за 8 тижнів, старші видалено, чужі файли не чіпаємо', keep.every(n => STORE[n]) && drop.every(n => !STORE[n]), `видалено ${(bk.j.deleted || []).join(', ')}`);
  const bk2 = await callReq(backupH, { headers: { authorization: 'Bearer ' + process.env.CRON_SECRET } });
  ok('backup: повторний запуск того ж дня — перезапис, без помилок', bk2.c === 200 && Object.keys(STORE).filter(n => n.startsWith(today)).length === 1);
  // self-check after the upload: a good copy passes silently; a damaged one fails with a message to the admin and nothing is pruned
  ok('backup: перевірка копії після запису пройшла, власнику нічого не надсилали', bk.j.verified === true && !TGMSG.length, JSON.stringify(TGMSG[0] || ''));
  { const fresh = dAgo(nonMondayAgo(14)) + '.json.gz'; STORE[fresh] = Buffer.from('old');
    process.env.TG_ERRORS_CHAT = '4242';
    TAMPER = f => { const d = JSON.parse(zlib.gunzipSync(f)); d.tables.seasons.pop(); return zlib.gzipSync(JSON.stringify(d)); };   // one row lost on the way back, size differs
    const bad1 = await callReq(backupH, { headers: { authorization: 'Bearer ' + process.env.CRON_SECRET } });
    ok('backup: у файлі бракує рядка — 500, у повідомленні таблиця і числа, копії не чистяться', bad1.c === 500 && bad1.j.told === true && bad1.j.problems.some(x => /seasons: у файлі \d+ рядків, вивантажено \d+/.test(x))
      && TGMSG.length === 1 && TGMSG[0].chat_id === '4242' && /не пройшла перевірку/.test(TGMSG[0].text) && /seasons/.test(TGMSG[0].text) && !!STORE[fresh], JSON.stringify(bad1.j.problems));
    TGMSG.length = 0;
    TAMPER = f => f.subarray(0, Math.floor(f.length / 2));   // truncated file
    const bad2 = await callReq(backupH, { headers: { authorization: 'Bearer ' + process.env.CRON_SECRET } });
    ok('backup: обірваний файл — не розпаковується, 500 і повідомлення', bad2.c === 500 && bad2.j.problems.some(x => /не розпаковується|не читається/.test(x)) && TGMSG.length === 1, JSON.stringify(bad2.j.problems));
    TGMSG.length = 0; TAMPER = null; delete STORE[fresh];
    const keepGet = global.fetch; global.fetch = async (url, o = {}) => (String(url).includes('/storage/v1/object/backups/') && (o.method || 'GET') === 'GET' ? err(500, { message: 'down' }) : keepGet(url, o));
    const bad3 = await callReq(backupH, { headers: { authorization: 'Bearer ' + process.env.CRON_SECRET } });
    global.fetch = keepGet;
    ok('backup: сховище не віддає файл — 500 на кроці verify і повідомлення', bad3.c === 500 && /verify/.test(bad3.j.error) && TGMSG.length === 1 && /Крок: verify/.test(TGMSG[0].text), JSON.stringify(bad3.j));
    TGMSG.length = 0; delete process.env.TG_ERRORS_CHAT; }

  // ===== Telegram group leagues: join only as a group member (audit B1) =====
  const leagueH = require(path.join(ROOT, 'api', 'league.js'));
  const hm = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  const initData = (user, start_param) => { const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user), start_param });
    const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
    p.set('hash', hm(hm('WebAppData', process.env.TG_TOKEN), dcs).toString('hex')); return p.toString(); };
  const CHAT = -100123;
  DB.leagues.push({ chat_id: CHAT, title: 'Група друзів' });
  MEMBERS[CHAT] = { 501: 'member', 502: 'administrator', 503: 'left', 504: 'kicked', 505: 'restricted' };
  const join = uid => call(leagueH, { initData: initData({ id: uid, first_name: 'U' + uid }, 'g' + CHAT) });
  const inLeague = uid => DB.league_members.some(x => String(x.chat_id) === String(CHAT) && String(x.tg_user_id) === String(uid));
  const j1 = await join(501);
  ok('ліга: учасник групи вступає', j1.c === 200 && j1.j.joined && j1.j.joined.length === 1 && inLeague(501), `${j1.c} ${JSON.stringify(j1.j)}`);
  ok('ліга: адміністратор групи вступає', (await join(502)).c === 200 && inLeague(502));
  ok('ліга: обмежений учасник (restricted) вступає', (await join(505)).c === 200 && inLeague(505));
  for (const [uid, why] of [[503, 'вийшов з групи'], [504, 'вигнаний'], [599, 'не з цієї групи']]) {
    const x = await join(uid); ok(`ліга: ${why} — 403, у лігу не додано`, x.c === 403 && !inLeague(uid), `${x.c}`); }
  const x6 = await call(leagueH, { initData: initData({ id: 599, first_name: 'U599' }, 'g' + CHAT), result: { w: 20, d: 5, l: 5, pts: 65, place: 2, gf: 60, ga: 30, day: today } });
  ok('ліга: чужий із результатом від браузера — 403, нічого не записано (результати пише лише сервер)', x6.c === 403 && !inLeague(599) && !DB.league_results.some(r => String(r.tg_user_id) === '599'), `${x6.c} ${JSON.stringify(x6.j)}`);
  // joining a second group's league: membership row only; carrying today's best attempt over needs a player link and seeds (tested in v079.js)
  const CHAT2 = -100777; DB.leagues.push({ chat_id: CHAT2, title: 'Нова група' }); MEMBERS[CHAT2] = { 501: 'member' };
  DB.seasons.push({ practice: false, verified: true, day: null, format: 'classic', mode: 'normal', w: 20, d: 5, l: 5, pts: 65, place: 2, gf: 60, ga: 30, formation: '4-4-2', created_at: new Date().toISOString(), id: 9001, tg_user_id: 501 });
  const j21 = await call(leagueH, { initData: initData({ id: 501, first_name: 'U501' }, 'g' + CHAT2) });
  ok('ліга: вступ у другу лігу; сезон без спроби ліги (seed) і без привʼязки гравця не переноситься', j21.c === 200 && j21.j.joined[0].chat_id === String(CHAT2) && !DB.league_results.some(r => String(r.chat_id) === String(CHAT2)), `${j21.c} ${JSON.stringify(j21.j)}`);
  // group migrated to a supergroup: old button (old chat_id) moves the league to the new id and adds the player there
  const OLD = -5000001, NEW = -1005000001; DB.leagues.push({ chat_id: OLD, title: 'Стара група' });
  DB.league_members.push({ chat_id: OLD, tg_user_id: 501, name: 'U501' }); MIGRATED[OLD] = NEW; MEMBERS[NEW] = { 506: 'member', 501: 'member' };
  const jm = await call(leagueH, { initData: initData({ id: 506, first_name: 'U506' }, 'g' + OLD) });
  const inNew = uid => DB.league_members.some(x => String(x.chat_id) === String(NEW) && String(x.tg_user_id) === String(uid));
  ok('ліга: супергрупа — ліга переїхала на новий номер, новий гравець вступив туди', jm.c === 200 && DB.leagues.some(l => String(l.chat_id) === String(NEW)) && inNew(506) && inNew(501) && String(jm.j.joined[0].chat_id) === String(NEW), `${jm.c} ${JSON.stringify(jm.j)}`);
  await call(leagueH, { initData: initData({ id: 506, first_name: 'U506' }, 'g' + OLD) });
  ok('ліга: повторний перехід за старою кнопкою — без дублів', DB.leagues.filter(l => String(l.chat_id) === String(NEW)).length === 1 && DB.league_members.filter(x => String(x.chat_id) === String(NEW) && String(x.tg_user_id) === '506').length === 1);
  ok('ліга: підробний підпис — 401', (await call(leagueH, { initData: initData({ id: 501 }, 'g' + CHAT).replace(/hash=[0-9a-f]+/, 'hash=00') })).c === 401);

  // ===== Telegram sign-in (V-4): identity in app_metadata; a pre-registered account with the service email is refused =====
  const authH = require(path.join(ROOT, 'api', 'auth.js'));
  const login = id => callReq(authH, { method: 'POST', body: { initData: initData({ id, first_name: 'T' + id }, '') } });
  const l1 = await login(7001);
  ok('auth: новий гравець — акаунт з app_metadata.tg_id, вхід видано', l1.c === 200 && l1.j.token_hash === 'h7001' && AUTH[7001].app.tg_id === '7001', `${l1.c} ${JSON.stringify(AUTH[7001])}`);
  ok('auth: повторний вхід — той самий акаунт', (await login(7001)).c === 200 && LINKS.filter(x => x === '7001').length === 2);
  AUTH[7002] = { made: false, app: { provider: 'email' } };   // attacker: signUp with tg-7002@… and a password before the victim
  const l2 = await login(7002);
  ok('auth: заздалегідь зареєстрований акаунт з цією поштою — 403, вхід не видано', l2.c === 403 && !LINKS.includes('7002') && !AUTH[7002].app.tg_id, `${l2.c} ${JSON.stringify(l2.j)}`);
  AUTH[7003] = { made: true, app: { provider: 'email' } };   // created by the previous server version (no tg_id yet)
  ok('auth: акаунт від попереднього сервера без tg_id — вхід, tg_id дописано', (await login(7003)).c === 200 && AUTH[7003].app.tg_id === '7003');
  AUTH[7004] = { made: true, app: { tg_id: '9999' } };
  ok('auth: tg_id іншої людини — 403', (await login(7004)).c === 403 && !LINKS.includes('7004'));
  ok('auth: підробний підпис — 401', (await callReq(authH, { method: 'POST', body: { initData: initData({ id: 7001 }, '').replace(/hash=[0-9a-f]+/, 'hash=00') } })).c === 401);

  // ===== 0.90: seed fields are required (S-3), server-written text and stats (N-1), version format (S-2) =====
  { const base = { device_id: me, secret: mySecret, xi, formation, mode: 'normal', format: 'classic', year }, n1 = DB.season_seeds.length;
    const bad400 = [{ mode: '' }, { format: '' }, { formation: '' }, { year: 0 }, { year: null }, { mode: 'bogus' }, { mode: 'constructor' }, { format: '__proto__' }, { formation: '9-9-9' }, { year: 1800 }, { year: 2000 }, { year: E.LEAGUE_CULT, format: 'legends' }, { mode: 'daily' }, { daily: true }, { mode: undefined, format: undefined, formation: undefined, year: undefined }];
    const codes400 = []; for (const o of bad400) codes400.push((await call(seedH, { ...base, ...o })).c);
    ok('seed: порожні й чужі mode/format/formation/year, daily без daily — 400, рядок не створено', codes400.every(c => c === 400) && DB.season_seeds.length === n1, codes400.join(','));
    // old tabs (0.89.x) send valid values: every mode, the Legends year for classic, cult year for other formats, a real UPL year only for an old challenge
    const goodCombos = [['normal', 'classic', E.LEAGUE_LEGENDS], ['hard', 'classic', E.LEAGUE_LEGENDS], ['hardcore', 'classic', E.LEAGUE_LEGENDS], ['pick', 'classic', E.LEAGUE_LEGENDS], ['practice', 'classic', E.LEAGUE_LEGENDS],
      ['normal', 'legends', E.LEAGUE_LEGENDS], ['normal', 'derby', E.LEAGUE_CULT], ['normal', 'oneclub', E.LEAGUE_CULT], ['normal', 'anti', E.LEAGUE_CULT], ['normal', 'classic', E.YEARS16[0]]];
    const good = []; for (const [m, f, y] of goodCombos) good.push((await call(seedH, { ...base, mode: m, format: f, year: y })).c);
    ok('seed: чинні комбінації старих вкладок (усі режими й формати) проходять', good.every(c => c === 200), good.join(','));
    { const D0 = E.dailySetupFor('2026-10-12'); ok('seed: старий драфт дня (daily + mode daily, рік і схема дня) проходить', (await call(seedH, { ...base, device_id: crypto.randomUUID(), secret: 'daily-secret-0123456789abc', mode: 'daily', daily: true, year: D0.year, formation: D0.formation })).c === 200); }
    // verify no longer lets an empty seed field match any mode
    const sr = await draftSeason(me, mySecret, { formation });
    const seedRow = DB.season_seeds.find(x => x.id === sr.st.j.seed_id);
    const mkRow = () => ({ ...sr.row, id: DB.seasons.length + 1, verified: null });
    for (const k of ['mode', 'format', 'formation', 'year']) { seedRow[k] = k === 'year' ? null : ''; seedRow.used_by = null;
      const r = mkRow(); DB.seasons.push(r); const v = await call(verH, { season_id: r.id });
      ok(`verify: seed з порожнім «${k}» — не підходить (verified=false)`, v.j.verified === false && /seed без поля/.test(v.j.note), v.j.note);
      seedRow[k] = k === 'year' ? year : base[k]; }
    seedRow.used_by = null; const r0 = mkRow(); DB.seasons.push(r0);
    ok('verify: той самий seed з усіма полями — перевірено', (await call(verH, { season_id: r0.id })).j.verified === true);
    // N-1: forged names, stats, table and tier are overwritten from the pool and the simulation when the season is verified
    const s2 = await draftSeason(me, mySecret, { formation }), q2 = s2.q, x2 = s2.xi;
    const forged = { ...season, ...s2.row, perfect: q2.W === 30, tier: 'ІДЕАЛЬНИЙ СЕЗОН · 30-0-0', golden: true,
      xi: x2.map((x, i) => ({ ...x, n: 'Фальшивий ' + i, g: 99, a: 99, rt: 9.99, f: 5 })), tbl: [{ n: 'Моя команда', w: 30, d: 0, l: 0, gf: 99, ga: 0, pts: 90, me: true }] };
    const f2 = await call(saveH, { kind: 'season', device_id: me, secret: mySecret, row: forged }), st = DB.seasons[DB.seasons.length - 1];
    const want = q2.players.reduce((a, p) => a + p.g, 0);
    ok('verify: підроблені імена гравців замінено іменами з пулу', f2.j.verified === true && st.xi.every((x, i) => x.n === E.DATA.clubs.find(c => c.n === x2[i].c && c.y === x2[i].y).pl.find(p => p[5] === x2[i].id)[0]), f2.j.note);
    ok('verify: голи, асисти, оцінки, форма — з симуляції', st.xi.every(x => { const q = q2.players.find(p => p.id === x.id); return x.g === q.g && x.a === q.a && x.f === (q.form || 0) && x.rt === (q.rt ? Math.round(q.rt * 100) / 100 : null); }) && st.xi.reduce((a, x) => a + x.g, 0) === want);
    ok('verify: таблиця — з симуляції, назва своєї команди лишається', st.tbl.length === q2.table.length && st.tbl.filter(t => t.me).length === 1 && st.tbl.every((t, i) => (t.me ? t.n === 'Моя команда' : t.n === q2.table[i].n) && t.pts === q2.table[i].pts));   // own team name is kept, numbers are from the simulation
    E.setFormat('classic');
    ok('verify: tier і golden — з симуляції (підроблене «30-0» не лишилось)', st.tier === E.tierOf(q2)[0] && st.golden === !!q2.golden && (q2.W === 30 || !/ІДЕАЛЬНИЙ/.test(st.tier)) && st.perfect === (q2.W === 30), `${st.tier} golden=${st.golden}`);
    ok('verify: решта рядка (клуб, рік, слот, рейтинг) не змінена', st.xi.every((x, i) => x.id === x2[i].id && x.slot === x2[i].slot && x.c === x2[i].c && x.y === x2[i].y && x.r === x2[i].r && x.r0 === x2[i].r0));
    // S-2: version is digits and dots only, otherwise stored as null (verified against the current engine like a missing version)
    const vers = {}; for (const v of ['0.89.1', '0.9', '1.2.3.4', 'abc', '0.89 <b>', '', '0.89.1-x', null]) {
      const sv2 = await draftSeason(me, mySecret, { formation });
      await call(saveH, { kind: 'season', device_id: me, secret: mySecret, row: { ...sv2.row, version: v } });
      vers[v] = DB.seasons[DB.seasons.length - 1].version; }
    ok('save: version — лише цифри й крапки (0.89.1, 0.9 лишаються), решта → null', vers['0.89.1'] === '0.89.1' && vers['0.9'] === '0.9' && ['1.2.3.4', 'abc', '0.89 <b>', '', '0.89.1-x', null].every(v => vers[v] === null), JSON.stringify(vers));
    // S-2: result link preview claims a result only for a verified season
    const R = require(path.join(ROOT, 'api', 'r.js')), ps = { id: 5, w: 30, d: 0, l: 0, pts: 90, place: 1, gf: 99, ga: 0, format: 'classic', players: { name: 'Вітя' } };
    const pv = R.page('https://upl.test/', 5, { ...ps, verified: true }), pn = R.page('https://upl.test/', 5, { ...ps, verified: null }), pf = R.page('https://upl.test/', 5, { ...ps, verified: false });
    ok('r: перевірений сезон — «30-0!» у превʼю', /30-0!/.test(pv) && !/не перевірено/.test(pv));
    ok('r: неперевірений (null і false) — без «30-0!», рахунку й місця, з позначкою «не перевірено»', [pn, pf].every(h => !/30-0!|30-0-0|Чемпіон|90 очок|99:0/.test(h.replace(/<a [^>]*>[^<]*<\/a>/, '').replace(/збери|пройди сезон без поразок/gi, '')) && /не перевірено/.test(h)));
  }
  // ===== rate limiting -> 429 =====
  RATE_ON = true;
  const rdev = crypto.randomUUID(), rsec = 'rate-secret-0123456789abcd';
  const codes = [];
  for (let i = 0; i < 21; i++) codes.push((await call(seedH, { device_id: rdev, secret: rsec, xi, formation, mode: 'normal', format: 'classic', year })).c);
  const last = await call(seedH, { device_id: rdev, secret: rsec, xi, formation, mode: 'normal', format: 'classic', year });
  ok('rate: /api/seed — 20 за хвилину з пристрою, далі 429 з поясненням українською', codes.slice(0, 20).every(c => c === 200) && codes[20] === 429 && last.c === 429 && /Забагато/.test(last.j.error), codes.join(','));
  ok('rate: інший пристрій не зачеплено', (await call(seedH, { device_id: crypto.randomUUID(), secret: 'other-secret-0123456789ab', xi, formation, mode: 'normal', format: 'classic', year })).c === 200);
  const n429 = DB.season_seeds.length;
  ok('rate: після 429 seed не видається', (await call(seedH, { device_id: rdev, secret: rsec, xi, formation, mode: 'normal', format: 'classic', year })).c === 429 && DB.season_seeds.length === n429);
  const vcodes = []; for (let i = 0; i < 31; i++) vcodes.push((await callReq(verH, { method: 'POST', headers: { 'x-forwarded-for': '10.0.0.7, 172.16.0.1' }, body: { season_id: 1 } })).c);
  ok('rate: /api/verify — за IP (x-forwarded-for), 31-й — 429', vcodes.slice(0, 30).every(c => c === 200) && vcodes[30] === 429, vcodes.slice(28).join(','));
  ok('rate: /api/verify з іншої IP — працює', (await callReq(verH, { method: 'POST', headers: { 'x-forwarded-for': '10.0.0.8' }, body: { season_id: 1 } })).c === 200);
  const scodes = []; for (let i = 0; i < 41; i++) scodes.push((await call(saveH, { kind: 'trophies', device_id: me, secret: mySecret, ids: ['nice'] })).c);
  ok('rate: /api/save — 40 за хвилину з пристрою, далі 429', scodes.slice(0, 40).every(c => c === 200) && scodes[40] === 429, scodes.slice(38).join(','));
  const ipDev = []; for (let i = 0; i < 81; i++) ipDev.push((await callReq(seedH, { method: 'POST', headers: { 'x-forwarded-for': '10.9.9.9' }, body: { device_id: crypto.randomUUID(), secret: 'ip-secret-0123456789abcdef', xi, formation, mode: 'normal', format: 'classic', year } })).c);
  ok('rate: підміна device_id не допомагає — ширший ліміт на IP (80), далі 429', ipDev.slice(0, 80).every(c => c === 200) && ipDev[80] === 429, ipDev.slice(78).join(','));
  SQL053 = false;
  ok('rate: SQL 0.55 ще не виконано (rate_hit немає) — пропускаємо', (await call(seedH, { device_id: rdev, secret: rsec, xi, formation, mode: 'normal', format: 'classic', year })).c === 200);
  SQL053 = true; RATE_ON = false;
  console.log(`нога у складі: ${foot ? `${foot.n} ${foot.slot} нога ${E.DATA.foot[foot.id]} r0 ${foot.r0} → r ${foot.r}` : 'нема'}`);
  console.log(bad ? `ПОМИЛКИ: ${bad}` : 'УСІ ПІДРОБКИ ВІДХИЛЕНО');
  process.exit(bad ? 1 : 0);
})();
