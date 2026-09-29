// Античит без браузера: справжні api/seed.js і api/verify.js, база — у пам'яті.
// Чесний сезон (склад з рейтингами effRating, seed від сервера, перерахунок тим самим рушієм) має пройти,
// кожна підробка — ні. Запуск: node tools/tests/cheat.js
const path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
process.env.SUPABASE_SERVICE_KEY = 'svc';
const DB = { season_seeds: [], seasons: [], daily_results: [] }; let sid = 0;
global.fetch = async (url, o = {}) => {
  const u = new URL(url); const t = u.pathname.split('/').pop(); const m = o.method || 'GET';
  const f = [...u.searchParams].filter(([k, v]) => /^(eq|is)\./.test(v));
  const match = r => f.every(([k, v]) => String(r[k]) === v.slice(v.indexOf('.') + 1));
  const ok = j => ({ ok: true, status: 200, text: async () => j == null ? '' : JSON.stringify(j) });
  if (m === 'GET') return ok((DB[t] || []).filter(match));
  if (m === 'POST') { const b = JSON.parse(o.body); if (t === 'season_seeds') b.id = 'seed-' + (++sid); DB[t].push(b); return ok([b]); }
  if (m === 'PATCH') { const b = JSON.parse(o.body); (DB[t] || []).filter(match).forEach(r => Object.assign(r, b)); return ok(null); }
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
  const device = crypto.randomUUID(), formation = '4-3-3', year = E.YEARS16[3];
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
  await tamper('r0 змінено (лише показ, не впливає на перевірку)', r => { r.xi[0].r0 = 50; }, true);
  console.log(`нога у складі: ${foot ? `${foot.n} ${foot.slot} нога ${E.DATA.foot[foot.id]} r0 ${foot.r0} → r ${foot.r}` : 'нема'}`);
  console.log(bad ? `ПОМИЛКИ: ${bad}` : 'УСІ ПІДРОБКИ ВІДХИЛЕНО');
  process.exit(bad ? 1 : 0);
})();
