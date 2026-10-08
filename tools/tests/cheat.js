// Anti-cheat without a browser: real api/seed.js and api/verify.js, in-memory DB.
// Also: /api/backup (Cron secret, gzip in storage, retention), joining a group league only as a group member (getChatMember stubbed),
// rate limiting (rate_hit as an in-memory counter) -> 429.
// An honest season (squad with effRating, server seed, recomputed by the same engine) must pass,
// every forgery must fail. Run: node tools/tests/cheat.js
const path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
process.env.SUPABASE_SERVICE_KEY = 'svc'; process.env.TG_TOKEN = '123:TEST'; process.env.CRON_SECRET = 'cron-secret-0123456789';
const DB = { season_seeds: [], seasons: [], daily_results: [], challenges: [], challenge_results: [], trophies: [], league_results: [], leagues: [], league_members: [], league_boards: [] }; let sid = 0;
// Supabase storage (backups), Telegram (getChatMember), rate_hit counter
const STORE = {}, MEMBERS = {}, RATE = {}, MIGRATED = {}; let RATE_ON = false;
const jres = j => ({ ok: true, status: 200, json: async () => j, text: async () => JSON.stringify(j) });
// DB: device secrets (device_ok), step-2 switch, unique official daily attempt
const SECRETS = {}; let LEGACY_OPEN = true, SQL053 = true, ERA_COL = true;
const err = (status, j) => ({ ok: false, status, text: async () => JSON.stringify(j) });
global.fetch = async (url, o = {}) => {
  const u = new URL(url); const t = u.pathname.split('/').pop(); const m = o.method || 'GET';
  if (u.hostname === 'api.telegram.org') {
    const a = JSON.parse(o.body || '{}');
    if (t === 'getChatMember' && MIGRATED[a.chat_id]) return jres({ ok: false, description: 'Bad Request: group chat was upgraded to a supergroup chat', parameters: { migrate_to_chat_id: MIGRATED[a.chat_id] } });   // 0.69.4
    if (t === 'getChatMember') { const st = (MEMBERS[a.chat_id] || {})[a.user_id]; return jres(st ? { ok: true, result: { status: st, is_member: st !== 'left' } } : { ok: false, description: 'Bad Request: user not found' }); }
    return jres({ ok: true, result: { message_id: 1 } });
  }
  if (u.pathname.startsWith('/storage/v1/')) {
    const rest = u.pathname.slice('/storage/v1/'.length);
    if (m === 'POST' && rest.startsWith('object/list/backups')) return jres(Object.keys(STORE).sort().map(name => ({ name })));
    if (m === 'DELETE' && rest === 'object/backups') { JSON.parse(o.body).prefixes.forEach(n => { delete STORE[n]; }); return jres([]); }
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
    return err(404, { code: 'PGRST202' });
  }
  if (m === 'POST' && t === 'season_seeds') { const b = JSON.parse(o.body); if (b.official && DB.season_seeds.some(x => x.official && x.daily && x.device_id === b.device_id && x.day === b.day)) return err(409, { code: '23505', message: 'duplicate key value violates unique constraint "season_seeds_official_uq"' }); }
  if (m === 'POST' && t !== 'season_seeds' && t !== 'daily_results' && !u.searchParams.get('on_conflict')) {   // rows written by /api/save
    const list = [].concat(JSON.parse(o.body));
    if (t === 'seasons' && !ERA_COL && list.some(b => 'era' in b)) return err(400, { code: 'PGRST204', message: "Could not find the 'era' column of 'seasons' in the schema cache" });   // simulate DB without the era column
    for (const b of list) { if (t === 'seasons') b.id = 1000 + DB.seasons.length; if (t === 'challenges' && DB.challenges.some(x => x.id === b.id)) return err(409, { code: '23505' }); DB[t].push(b); }
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
const call = (h, body) => new Promise(res => { h({ method: 'POST', body }, { status(c) { this.c = c; return this; }, json(j) { res({ c: this.c, j }); } }); });

// honest squad: 4-3-3, each slot gets the first pool player eligible there (with foot if present, to cover it too)
function honestXi(formation) {
  E.setFormat('classic');
  const used = new Set(), xi = [];
  for (const slot of E.FORMATIONS[formation].slots) {
    let pick = null;
    for (const c of E.DATA.clubs) { for (const p of c.pl) { if (used.has(p[5])) continue; const r = E.effRating(p, slot);
      if (r != null && (!['LB', 'RB', 'LW', 'RW'].includes(slot) || (E.DATA.foot || {})[p[5]])) { pick = { c, p, r }; break; } } if (pick) break; }
    used.add(pick.p[5]);
    xi.push({ n: pick.p[0], id: pick.p[5], slot, r: pick.r, r0: pick.p[2], c: pick.c.n, y: pick.c.y });
  }
  return xi;
}
(async () => {
  const device = crypto.randomUUID(), formation = '4-3-3', year = E.LEAGUE_LEGENDS;   // classic opponents are the Legends League
  const xi = honestXi(formation);
  const s = await call(seedH, { device_id: device, xi, formation, mode: 'normal', format: 'classic', year });
  const sim = E.run({ xi: SX(xi), mode: 'normal', format: 'classic', year, seed: s.j.seed });
  const legit = { device_id: device, version: E.VERSION, mode: 'normal', format: 'classic', formation, year, seed: s.j.seed, seed_id: s.j.seed_id, xi,
    w: sim.W, d: sim.D, l: sim.L, pts: sim.pts, place: sim.place, gf: sim.gf, ga: sim.ga };
  let bad = 0;
  const tamper = async (name, fn, expect) => {
    const r = JSON.parse(JSON.stringify(legit)); r.id = DB.seasons.length + 1; r.verified = null; fn(r); DB.seasons.push(r);
    if (name !== 'seed reused') DB.season_seeds.forEach(x => { x.used_by = null; });
    const x = await call(verH, { season_id: r.id }); const v = x.j.verified;
    const pass = v === expect; if (!pass) bad++;
    console.log(`${pass ? '✓' : '✗'} ${name}: verified=${v} (${x.j.note})`);
  };
  const foot = xi.find(x => ['LB', 'RB', 'LW', 'RW'].includes(x.slot));
  await tamper('чесний сезон', r => {}, true);
  await tamper('seed reused', r => {}, false);
  await tamper('рейтинг піднято до 99', r => { r.xi[0].r = 99; }, false);
  await tamper('рейтинг без штрафу/ноги (r = базовий)', r => { const x = r.xi.find(q => q.r !== q.r0); if (x) x.r = x.r0; else r.xi[0].r += 1; }, false);
  await tamper('очки завищено', r => { r.w += 1; r.d -= 1; r.pts += 2; }, false);
  await tamper('seed не від сервера', r => { r.seed_id = null; }, false);
  await tamper('гравець не з того клубу', r => { r.xi[1].c = 'Динамо (Київ)'; r.xi[1].y = 1992; }, false);
  await tamper('слоти переставлено', r => { const t = r.xi[0].slot; r.xi[0].slot = r.xi[10].slot; r.xi[10].slot = t; }, false);
  // PREV_VERSIONS is empty: a season from an older site is 'unverifiable', not 'forged'
  await tamper('сезон з сайту 0.56 (до рейтингів v2) — не перевірити (null), не підробка', r => { r.version = '0.56'; }, null);
  await tamper('підробка з сайту 0.56 — не перевірено (null)', r => { r.version = '0.56'; r.xi[0].r = 99; }, null);
  await tamper('старша версія 0.49 — не перевірити (null)', r => { r.version = '0.49'; }, null);
  // any old version -> unverifiable (null); faking version to pass is impossible (audit P1-2)
  await tamper('сезон з сайту 0.66 — не перевірити (null)', r => { r.version = '0.66'; }, null);
  await tamper('сезон з сайту 0.65 — не перевірити (null)', r => { r.version = '0.65'; }, null);
  await tamper('підробка з сайту 0.62 — не перевірено (null)', r => { r.version = '0.62'; r.xi[0].r = 99; }, null);
  await tamper('сезон з сайту 0.61 — не перевірити (null)', r => { r.version = '0.61'; }, null);
  // classic seeded under LEAGUE_CULT (former cult-clubs opponents)
  { const sc = await call(seedH, { device_id: device, xi, formation, mode: 'normal', format: 'classic', year: E.LEAGUE_CULT });
    const q = E.run({ xi: SX(xi), mode: 'normal', format: 'classic', year: E.LEAGUE_CULT, seed: sc.j.seed });
    const cult = r => Object.assign(r, { year: E.LEAGUE_CULT, seed: sc.j.seed, seed_id: sc.j.seed_id, w: q.W, d: q.D, l: q.L, pts: q.pts, place: q.place, gf: q.gf, ga: q.ga });
    await tamper('класика з підробленою старою версією проти культових клубів — не перевірено (аудит P1-2)', r => { cult(r); r.version = '0.64'; }, null);
    await tamper('класика 0.64 проти культових клубів без виклику другу — ні', r => { cult(r); }, false);
    await tamper('антисезон проти «Ліги легенд» — ні', r => { cult(r); r.format = 'anti'; r.year = E.LEAGUE_LEGENDS; }, false); }
  // era (seasons.era, once the column exists): squad only from that era's club-seasons
  { const early = Math.min(...legit.xi.map(x => x.y));
    await tamper(`епоха «Сучасність», а в складі сезон ${early}`, r => { r.era = 'y2015'; }, early >= 2015);
    await tamper('епоха «Усі роки» — як без епохи', r => { r.era = 'all'; }, true);
    const late = Math.max(...legit.xi.map(x => x.y));
    await tamper(`десятиліття «90-ті», а в складі сезон ${late}`, r => { r.era = 'd1990'; }, late <= 1999);
    await tamper(`десятиліття «2020-ті», а в складі сезон ${early}`, r => { r.era = 'd2020'; }, early >= 2020);
    await tamper(`десятиліття «2000-ні» (${early}–${late})`, r => { r.era = 'd2000'; }, early >= 2000 && late <= 2009);
    await tamper('невідома епоха', r => { r.era = 'y1900'; }, false); }
  await tamper('r0 підроблено (показ у таблицях і на картці)', r => { r.xi[0].r0 = 99; }, false);
  await tamper('r0 немає (старий клієнт) — пропускаємо', r => { r.xi.forEach(x => { delete x.r0; }); }, true);
  // seed issued for one set of conditions, season saved with another
  await tamper('seed для іншої схеми', r => { r.formation = '4-4-2'; }, false);
  await tamper('seed для іншого формату', r => { r.format = 'derby'; }, false);
  await tamper('seed для іншого режиму', r => { r.mode = 'hard'; }, false);
  await tamper('seed для іншого року суперників', r => { r.year = E.LEAGUE_CULT; }, false);
  await tamper('позначка 30-0 без 30 перемог', r => { r.perfect = true; }, false);
  // one person under two ids (DATA.alias) counts as a duplicate player even if the seed is valid and the recompute matches
  { const place = (id, used) => { for (const c of E.DATA.clubs) for (const p of c.pl) if (p[5] === id) for (let i = 0; i < xi.length; i++) {
      if (used.has(i)) continue; const r = E.effRating(p, xi[i].slot); if (r != null) return { i, x: { n: p[0], id, slot: xi[i].slot, r, r0: p[2], c: c.n, y: c.y } }; } };
    let pair = null;
    for (const [d, k] of Object.entries(E.DATA.alias || {})) { const a = place(d, new Set()); const b = a && place(k, new Set([a.i])); if (a && b) { pair = [a, b]; break; } }
    if (!pair) { bad++; console.log('✗ немає пари псевдонімів для перевірки'); }
    else {
      const x2 = xi.map(x => ({ ...x })); for (const q of pair) x2[q.i] = q.x;
      const s2 = await call(seedH, { device_id: device, xi: x2, formation, mode: 'normal', format: 'classic', year });
      const q = E.run({ xi: SX(x2), mode: 'normal', format: 'classic', year, seed: s2.j.seed });
      await tamper(`одна людина двічі: ${pair[0].x.id} = ${pair[1].x.id}`, r => { Object.assign(r, { xi: x2, seed: s2.j.seed, seed_id: s2.j.seed_id, w: q.W, d: q.D, l: q.L, pts: q.pts, place: q.place, gf: q.gf, ga: q.ga }); }, false);
    } }
  // opponent year outside the format: seed issued for a weak real season with no matching challenge
  const weak = E.YEARS16[0];
  const sw = await call(seedH, { device_id: device, xi, formation, mode: 'normal', format: 'classic', year: weak });
  await tamper('класика проти справжнього сезону без виклику', r => { r.year = weak; r.seed = sw.j.seed; r.seed_id = sw.j.seed_id; const q = E.run({ xi: SX(xi), mode: 'normal', format: 'classic', year: weak, seed: sw.j.seed });
    Object.assign(r, { w: q.W, d: q.D, l: q.L, pts: q.pts, place: q.place, gf: q.gf, ga: q.ga }); }, false);
  DB.challenges.push({ id: 'newchal1', year: weak, formation, created_at: '2026-10-02T10:00:00Z' });   // audit P1-1: a new challenge does not unlock a weak season
  await tamper('той самий сезон, є лише НОВИЙ виклик з цим роком — ні', r => { r.year = weak; r.seed = sw.j.seed; r.seed_id = sw.j.seed_id; const q = E.run({ xi: SX(xi), mode: 'normal', format: 'classic', year: weak, seed: sw.j.seed });
    Object.assign(r, { w: q.W, d: q.D, l: q.L, pts: q.pts, place: q.place, gf: q.gf, ga: q.ga }); }, false);
  DB.challenges.push({ id: 'abcdefgh', year: weak, formation, created_at: '2026-09-25T10:00:00Z' });
  await tamper('той самий сезон, але є старий «Виклик другу» з цим роком', r => { r.year = weak; r.seed = sw.j.seed; r.seed_id = sw.j.seed_id; const q = E.run({ xi: SX(xi), mode: 'normal', format: 'classic', year: weak, seed: sw.j.seed });
    Object.assign(r, { w: q.W, d: q.D, l: q.L, pts: q.pts, place: q.place, gf: q.gf, ga: q.ga }); }, true);

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

  // ===== writes only via server with device secret (/api/save); seed requires the secret =====
  const saveH = require(path.join(ROOT, 'api', 'save.js'));
  const ok = (name, cond, extra = '') => { if (!cond) bad++; console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' (' + extra + ')' : ''}`); };
  const me = crypto.randomUUID(), mySecret = 'my-secret-0123456789abcdef', victim = crypto.randomUUID(), victimSecret = 'victim-secret-0123456789ab';
  const s1 = await call(seedH, { device_id: me, secret: mySecret, xi, formation, mode: 'normal', format: 'classic', year });
  ok('seed зі своїм секретом', s1.c === 200 && s1.j.seed > 0);
  const q1 = E.run({ xi: SX(xi), mode: 'normal', format: 'classic', year, seed: s1.j.seed });
  const season = { mode: 'normal', format: 'classic', formation, year, seed: s1.j.seed, seed_id: s1.j.seed_id, version: E.VERSION, xi, w: q1.W, d: q1.D, l: q1.L, pts: q1.pts, place: q1.place, gf: q1.gf, ga: q1.ga, perfect: q1.W === 30,
    verified: true, player_id: 'someone-else', device_id: victim, tg_user_id: 777, nickname: 'Я' };
  const n0 = DB.seasons.length;
  const sv = await call(saveH, { kind: 'season', device_id: me, secret: mySecret, row: season, tg_init: 'user=%7B%22id%22%3A777%7D&hash=fake' });
  const saved = DB.seasons[DB.seasons.length - 1];
  ok('save: сезон зі своїм секретом записано й перевірено', sv.c === 200 && sv.j.verified === true && saved.id === sv.j.id, `verified=${sv.j.verified} ${sv.j.note || sv.j.error || ''}`);
  ok('save: device_id — з перевіреного пристрою, player_id/verified/tg_user_id з браузера відкинуто', saved.device_id === me && !('player_id' in saved) && saved.tg_user_id == null && !('verified' in saved && saved.verified !== true));
  ok('save: без секрету — 401', (await call(saveH, { kind: 'season', device_id: me, row: season })).c === 401 && DB.seasons.length === n0 + 1);
  await call(seedH, { device_id: victim, secret: victimSecret, xi, formation, mode: 'normal', format: 'classic', year });   // victim has already played from this device
  const atk = await call(saveH, { kind: 'season', device_id: victim, secret: 'attacker-secret-0123456789', row: season });
  ok('save: у чужий пристрій (чужий секрет) — 401', atk.c === 401 && DB.seasons.length === n0 + 1, atk.j.error);
  const fake = await call(saveH, { kind: 'season', device_id: me, secret: mySecret, row: { ...season, w: 30, d: 0, l: 0, pts: 90 } });
  ok('save: неможливий/підроблений рахунок не стає перевіреним', fake.c === 400 || fake.j.verified !== true, `${fake.c} ${fake.j.verified}`);
  // era: written if the column exists; without it the season is still saved (no era); junk is not written
  await call(saveH, { kind: 'season', device_id: me, secret: mySecret, row: { ...season, era: 'y2015' } });
  ok('save: епоха записується в seasons.era', DB.seasons[DB.seasons.length - 1].era === 'y2015');
  await call(saveH, { kind: 'season', device_id: me, secret: mySecret, row: { ...season, era: '<b>' } });
  ok('save: некоректна епоха не пишеться', !('era' in DB.seasons[DB.seasons.length - 1]));
  ERA_COL = false; const nE = DB.seasons.length;
  const noCol = await call(saveH, { kind: 'season', device_id: me, secret: mySecret, row: { ...season, era: 'y2010' } });
  ok('save: без колонки era сезон однаково записано', noCol.c === 200 && DB.seasons.length === nE + 1 && !('era' in DB.seasons[nE]), `${noCol.c} ${noCol.j.error || ''}`);
  ERA_COL = true;
  const tr = await call(saveH, { kind: 'trophies', device_id: me, secret: mySecret, ids: ['nice', 'nice', 'bad id!', 'x'.repeat(40)] });
  ok('save: трофеї — лише коректні id, без дублів', tr.c === 200 && DB.trophies.filter(x => x.device_id === me).map(x => x.trophy).join() === 'nice');
  ok('save: трофей у чужий пристрій — 401', (await call(saveH, { kind: 'trophies', device_id: victim, secret: 'attacker-secret-0123456789', ids: ['hack'] })).c === 401 && !DB.trophies.some(x => x.device_id === victim));
  const ch = await call(saveH, { kind: 'challenge', device_id: me, secret: mySecret, row: { id: 'abcDEF23', name: 'Я', seed: 5, formation, year, mode: 'normal', w: q1.W, d: q1.D, l: q1.L, pts: q1.pts, place: q1.place, gf: q1.gf, ga: q1.ga } });
  ok('save: виклик другу записано', ch.c === 200 && DB.challenges.some(x => x.id === 'abcDEF23' && x.device_id === me));
  ok('save: той самий номер виклику вдруге — 409', (await call(saveH, { kind: 'challenge', device_id: me, secret: mySecret, row: { id: 'abcDEF23', seed: 5, formation, year, mode: 'normal', w: 30, d: 0, l: 0, pts: 90, place: 1, gf: 1, ga: 0 } })).c === 409);
  const cr = await call(saveH, { kind: 'chal_result', device_id: me, secret: mySecret, row: { challenge_id: 'abcDEF23', name: 'Я', w: q1.W, d: q1.D, l: q1.L, pts: q1.pts, place: q1.place, gf: q1.gf, ga: q1.ga } });
  ok('save: результат виклику записано', cr.c === 200 && DB.challenge_results.some(x => x.challenge_id === 'abcDEF23' && x.device_id === me));
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
