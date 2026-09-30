// Античит без браузера: справжні api/seed.js і api/verify.js, база — у пам'яті.
// Чесний сезон (склад з рейтингами effRating, seed від сервера, перерахунок тим самим рушієм) має пройти,
// кожна підробка — ні. Запуск: node tools/tests/cheat.js
const path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
process.env.SUPABASE_SERVICE_KEY = 'svc';
const DB = { season_seeds: [], seasons: [], daily_results: [], challenges: [], league_results: [] }; let sid = 0;
global.fetch = async (url, o = {}) => {
  const u = new URL(url); const t = u.pathname.split('/').pop(); const m = o.method || 'GET';
  const f = [...u.searchParams].filter(([k, v]) => /^(eq|is)\./.test(v));
  const match = r => f.every(([k, v]) => { const x = v.slice(v.indexOf('.') + 1); return v.startsWith('is.') && x === 'null' ? r[k] == null : String(r[k]) === x; });
  const ok = j => ({ ok: true, status: 200, text: async () => j == null ? '' : JSON.stringify(j) });
  const rep = /return=representation/.test((o.headers || {}).Prefer || '');
  if (m === 'GET') return ok((DB[t] || []).filter(match));
  if (m === 'POST') { const b = JSON.parse(o.body); if (t === 'season_seeds') b.id = 'seed-' + (++sid);
    const oc = u.searchParams.get('on_conflict'); const old = oc && DB[t].find(r => oc.split(',').every(k => String(r[k]) === String(b[k])));
    if (old) Object.assign(old, b); else DB[t].push(b); return ok([old || b]); }
  if (m === 'PATCH') { const b = JSON.parse(o.body); const rows = (DB[t] || []).filter(match); rows.forEach(r => Object.assign(r, b)); return ok(rep ? rows : null); }
  return ok(null);
};
const E = require(path.join(ROOT, 'lib', 'engine.js'));
const seedH = require(path.join(ROOT, 'api', 'seed.js')), verH = require(path.join(ROOT, 'api', 'verify.js'));
const call = (h, body) => new Promise(res => { h({ method: 'POST', body }, { status(c) { this.c = c; return this; }, json(j) { res({ c: this.c, j }); } }); });

// чесний склад: 4-3-3, для кожного слоту — перший гравець пулу, що може там грати (з ногою, якщо є — щоб перевірити й її)
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
  const device = crypto.randomUUID(), formation = '4-3-3', year = E.LEAGUE_CULT;   // з 0.50 суперники класики — «Ліга культових клубів»
  const xi = honestXi(formation);
  const s = await call(seedH, { device_id: device, xi, formation, mode: 'normal', format: 'classic', year });
  const sim = E.run({ xi: xi.map(x => ({ id: x.id, name: x.n, slot: x.slot, pos: E.GROUP_OF[x.slot], r: x.r })), mode: 'normal', format: 'classic', year, seed: s.j.seed });
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
  await tamper('сезон з сайту попередньої версії 0.51 (симуляція та сама) — приймаємо', r => { r.version = '0.51'; }, true);
  await tamper('підробка з сайту 0.51 — не перевірено (null)', r => { r.version = '0.51'; r.xi[0].r = 99; }, null);
  await tamper('старша версія 0.49 — не перевірити (null)', r => { r.version = '0.49'; }, null);
  await tamper('r0 підроблено (показ у таблицях і на картці)', r => { r.xi[0].r0 = 99; }, false);
  await tamper('r0 немає (старий клієнт) — пропускаємо', r => { r.xi.forEach(x => { delete x.r0; }); }, true);
  // seed видано під одні умови, а сезон записано з іншими
  await tamper('seed для іншої схеми', r => { r.formation = '4-4-2'; }, false);
  await tamper('seed для іншого формату', r => { r.format = 'derby'; }, false);
  await tamper('seed для іншого режиму', r => { r.mode = 'hard'; }, false);
  await tamper('seed для іншого року суперників', r => { r.year = E.LEAGUE_LEGENDS; }, false);
  await tamper('позначка 30-0 без 30 перемог', r => { r.perfect = true; }, false);
  // рік суперників поза форматом: seed видано на слабкий справжній сезон, виклику з таким роком немає
  const weak = E.YEARS16[0];
  const sw = await call(seedH, { device_id: device, xi, formation, mode: 'normal', format: 'classic', year: weak });
  await tamper('класика проти справжнього сезону без виклику', r => { r.year = weak; r.seed = sw.j.seed; r.seed_id = sw.j.seed_id; const q = E.run({ xi: xi.map(x => ({ id: x.id, name: x.n, slot: x.slot, pos: E.GROUP_OF[x.slot], r: x.r })), mode: 'normal', format: 'classic', year: weak, seed: sw.j.seed });
    Object.assign(r, { w: q.W, d: q.D, l: q.L, pts: q.pts, place: q.place, gf: q.gf, ga: q.ga }); }, false);
  DB.challenges.push({ id: 'abcdefgh', year: weak, formation });
  await tamper('той самий сезон, але є старий «Виклик другу» з цим роком', r => { r.year = weak; r.seed = sw.j.seed; r.seed_id = sw.j.seed_id; const q = E.run({ xi: xi.map(x => ({ id: x.id, name: x.n, slot: x.slot, pos: E.GROUP_OF[x.slot], r: x.r })), mode: 'normal', format: 'classic', year: weak, seed: sw.j.seed });
    Object.assign(r, { w: q.W, d: q.D, l: q.L, pts: q.pts, place: q.place, gf: q.gf, ga: q.ga }); }, true);

  // виклик дня: браузер вставив у daily_results завищені очки → сервер переписує їх перевіреним сезоном; підробка без сезону verified не отримує
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const D = E.dailySetupFor(day);
  E.setFormat('classic');
  const dxi = [], used = new Set();
  for (const slot of E.FORMATIONS[D.formation].slots) { let pick = null;
    for (const i of D.seq) { const c = E.DATA.clubs[i]; for (const p of c.pl) { if (used.has(p[5])) continue; const r = E.effRating(p, slot); if (r != null) { pick = { c, p, r }; break; } } if (pick) break; }
    used.add(pick.p[5]); dxi.push({ n: pick.p[0], id: pick.p[5], slot, r: pick.r, r0: pick.p[2], c: pick.c.n, y: pick.c.y }); }
  const dev2 = crypto.randomUUID();
  const ds = await call(seedH, { device_id: dev2, xi: dxi, formation: D.formation, mode: 'daily', format: 'classic', year: D.year, daily: true });
  const dq = E.run({ xi: dxi.map(x => ({ id: x.id, name: x.n, slot: x.slot, pos: E.GROUP_OF[x.slot], r: x.r })), mode: 'daily', format: 'classic', year: D.year, seed: ds.j.seed });
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
  fakeDaily.pts = 90; fakeDaily.w = 30;   // браузер «підправив» знову → повторний виклик verify (кешований) знову пише цифри сезону
  await call(verH, { season_id: drow.id });
  const t2 = fakeDaily.pts === dq.pts && fakeDaily.w === dq.W;
  if (!t2) bad++; console.log(`${t2 ? '✓' : '✗'} виклик дня: повторний verify не лишає підроблених очок (${fakeDaily.pts})`);
  const t3 = cheater.verified !== true;
  if (!t3) bad++; console.log(`${t3 ? '✓' : '✗'} виклик дня: рядок з очками без перевіреного сезону не стає verified`);
  // сервер сам вставляє результат дня, якщо браузер ще нічого не надсилав
  const dev3 = crypto.randomUUID();
  const ds3 = await call(seedH, { device_id: dev3, xi: dxi, formation: D.formation, mode: 'daily', format: 'classic', year: D.year, daily: true });
  const dq3 = E.run({ xi: dxi.map(x => ({ id: x.id, name: x.n, slot: x.slot, pos: E.GROUP_OF[x.slot], r: x.r })), mode: 'daily', format: 'classic', year: D.year, seed: ds3.j.seed });
  const drow3 = { ...drow, id: DB.seasons.length + 1, device_id: dev3, seed: ds3.j.seed, seed_id: ds3.j.seed_id, perfect: dq3.W === 30, w: dq3.W, d: dq3.D, l: dq3.L, pts: dq3.pts, place: dq3.place, gf: dq3.gf, ga: dq3.ga, nickname: null, verified: null };
  DB.seasons.push(drow3);
  await call(verH, { season_id: drow3.id });
  const ins = DB.daily_results.find(x => x.device_id === dev3);
  const t4 = !!ins && ins.verified === true && ins.pts === dq3.pts && ins.nickname.length >= 2;
  if (!t4) bad++; console.log(`${t4 ? '✓' : '✗'} виклик дня: сервер сам записав результат (${ins ? ins.pts + ' оч., нік «' + ins.nickname + '»' : 'немає'})`);
  // друга (неофіційна) спроба дня в таблицю дня не йде
  const ds4 = await call(seedH, { device_id: dev3, xi: dxi, formation: D.formation, mode: 'daily', format: 'classic', year: D.year, daily: true });
  const dq4 = E.run({ xi: dxi.map(x => ({ id: x.id, name: x.n, slot: x.slot, pos: E.GROUP_OF[x.slot], r: x.r })), mode: 'daily', format: 'classic', year: D.year, seed: ds4.j.seed });
  const drow4 = { ...drow3, id: DB.seasons.length + 1, seed: ds4.j.seed, seed_id: ds4.j.seed_id, perfect: dq4.W === 30, w: dq4.W, d: dq4.D, l: dq4.L, pts: dq4.pts, place: dq4.place, gf: dq4.gf, ga: dq4.ga, verified: null };
  DB.seasons.push(drow4);
  const before = ins.pts; const v4 = await call(verH, { season_id: drow4.id });
  const t5 = !ds4.j.official && ins.pts === before && DB.daily_results.filter(x => x.device_id === dev3).length === 1;
  if (!t5) bad++; console.log(`${t5 ? '✓' : '✗'} виклик дня: друга спроба (verified=${v4.j.verified}) не змінює таблицю дня`);
  console.log(`нога у складі: ${foot ? `${foot.n} ${foot.slot} нога ${E.DATA.foot[foot.id]} r0 ${foot.r0} → r ${foot.r}` : 'нема'}`);
  console.log(bad ? `ПОМИЛКИ: ${bad}` : 'УСІ ПІДРОБКИ ВІДХИЛЕНО');
  process.exit(bad ? 1 : 0);
})();
