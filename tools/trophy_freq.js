// Trophy frequency per season: the tools/sim30.js bot drafts by game rules, lib/engine.js plays the season,
// src/trophies.js conditions are checked on the same context the game builds (trCtxNow).
// Run from repo root: node tools/trophy_freq.js [N, 1000] [id,id,...]
//   N seasons per set: classic fan (sigma 4) and casual (sigma 8), daily challenge, one club (8 clubs), anti-season (fan bot).
//   Mix weights: classic 62% (fan 31 + casual 31), daily 24%, one club 12%, anti 2%.
// Env: XPK=k xP replays per season (default 40; only lucky/unlucky/cursed/heist/brains need xP, XPK=1 is much faster),
//      SEED=base seed (default 91000), SETS=comma list of sets to run.
const ROOT = __dirname + '/..';
const fs = require('fs');
const E = require(ROOT + '/lib/engine.js');
const S = require(ROOT + '/tools/sim30.js');
const { DATA, GROUP_OF } = E;
const canon = id => (DATA.alias && DATA.alias[id]) || id;
const isLive = y => !!DATA.seasons[y] && DATA.seasons[y].status === 'live';
const src = fs.readFileSync(ROOT + '/src/trophies.js', 'utf8');
const { TROPHIES, PERSON } = new Function('DATA', 'canon', 'isLive', 'GROUP_OF',
  src.slice(0, src.indexOf('const MILESTONES')) + ';return {TROPHIES,PERSON};')(DATA, canon, isLive, GROUP_OF);
const BASE = {}; for (const c of DATA.clubs) for (const p of c.pl) BASE[c.c + '|' + c.y + '|' + p[5]] = p[2];

// capture the engine call made by sim30.play
const run0 = E.run; let cap = null; E.run = a => { const r = run0(a); cap = { a, r }; return r; };
const XPK = +process.env.XPK || 40;

function season(cfg) {
  S.play(cfg); const { a, r } = cap;
  let sp = 0; for (let k = 0; k < XPK; k++) sp += run0({ ...a, seed: E.hashStr('xp|' + a.seed + '|' + k) }).pts; r.xp = sp / XPK;
  const xi = a.xi.map(x => { const q = PERSON[x.id] || {}; return { name: x.name, id: x.id, slot: x.slot, main: q.main, r0: BASE[x.cc + '|' + x.y + '|' + x.id] ?? x.r, r: x.r, nat: q.nat ?? -1, by: q.by || 0, cc: x.cc, y: x.y }; });
  const pl = r.players.map(p => ({ ...p, r0: (xi.find(x => x.id === p.id) || {}).r0 || p.r }));
  const m = E.MODES[a.mode] || {};
  const c = { r, xi, pl, mode: a.mode, format: a.format, reveal: !!(m.reveal || m.showRatings) };
  const got = []; for (const t of TROPHIES) if (t.t) { let ok = false; try { ok = !!t.t(c); } catch (e) { } if (ok) got.push(t.id); }
  return got;
}

const N = +process.argv[2] || 1000;
const ONLY = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
const OC = ['dynamo-kyiv', 'shakhtar-donetsk', 'dnipro', 'vorskla-poltava', 'metalist-kharkiv', 'chornomorets-odesa', 'zorya-luhansk', 'karpaty-lviv'];
const FORMS = S.FORMS; let seed = +(process.env.SEED || 91000);
const day = i => new Date(Date.UTC(2026, 8, 28) + (i % 365) * 864e5).toISOString().slice(0, 10);
const SETS = {
  cf: ['класика fan', i => ({ format: 'classic', mode: 'normal', sigma: 4, formation: FORMS[i % FORMS.length], seed: seed++ })],
  cc: ['класика casual', i => ({ format: 'classic', mode: 'normal', sigma: 8, formation: FORMS[i % FORMS.length], seed: seed++ })],
  dy: ['виклик дня', i => ({ format: 'classic', mode: 'daily', sigma: 4, daily: E.dailySetupFor(day(i)), seed: seed++ })],
  oc: ['один клуб', i => ({ format: 'oneclub', club: OC[i % OC.length], mode: 'normal', sigma: 4, formation: FORMS[i % FORMS.length], seed: seed++ })],
  an: ['антисезон', i => ({ format: 'anti', mode: 'hardcore', sigma: 4, formation: FORMS[i % FORMS.length], seed: seed++ })],
};
const W = { cf: .31, cc: .31, dy: .24, oc: .12, an: .02 };
const use = process.env.SETS ? process.env.SETS.split(',') : Object.keys(SETS);

const P = {};   // set -> id -> share of seasons
for (const k of use) {
  const [label, mk] = SETS[k]; const cnt = {}; const t0 = Date.now();
  for (let i = 0; i < N; i++) for (const id of season(mk(i))) cnt[id] = (cnt[id] || 0) + 1;
  P[k] = {}; for (const t of TROPHIES) P[k][t.id] = (cnt[t.id] || 0) / N;
  console.error(`${label}: ${N} сезонів, ${((Date.now() - t0) / 1000).toFixed(0)} с`);
}

const pc = x => x == null ? '—' : (100 * x).toFixed(x > 0 && x < 0.01 ? 2 : 1) + '%';
const get = (k, id) => P[k] ? P[k][id] : null;
console.log(`| id | трофей | класика (fan / casual) | виклик дня | один клуб | анти | мікс |`);
console.log('|---|---|---|---|---|---|---|');
for (const t of TROPHIES) {
  if (!t.t || (ONLY && !ONLY.has(t.id))) continue;
  const cl = P.cf && P.cc ? (get('cf', t.id) + get('cc', t.id)) / 2 : null;
  const mix = use.length === 5 ? Object.keys(W).reduce((s, k) => s + W[k] * get(k, t.id), 0) : null;
  console.log(`| ${t.id} | ${t.n} | ${pc(cl)} (${pc(get('cf', t.id))} / ${pc(get('cc', t.id))}) | ${pc(get('dy', t.id))} | ${pc(get('oc', t.id))} | ${pc(get('an', t.id))} | ${pc(mix)} |`);
}
