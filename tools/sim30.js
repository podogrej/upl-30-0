// 30-0 difficulty benchmark: a "smart player" bot drafts from the wheel by game rules, the engine (lib/engine.js) simulates the season.
// Run from repo root: node tools/sim30.js [seasons, 2000] [expert|fan|casual] → tools/results_<type|all>.json (gitignored). Results go to DECISIONS.
// Env: SIM_SEE=eff|base (what the bot sees), SIM_ENGINE=<path> (alternative engine, e.g. pre-change).
const E = require(process.env.SIM_ENGINE || __dirname + '/../lib/engine.js');   // SIM_ENGINE: alternative engine, e.g. pre-change build
const SEE = process.env.SIM_SEE || 'eff';   // eff: bot sees rating with position/foot penalty; base: card base rating only, as a real player sees it
const { DATA, FORMATIONS, FORMATS, GROUP_OF, MODES, YEARS16, ANTI_MIN_APPS, effRating, mulberry32, hashStr } = E;
const FORMS = Object.keys(FORMATIONS);
const canon = id => (DATA.alias && DATA.alias[id]) || id;

function normal(r) { let u = 0, v = 0; while (!u) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function pickW(cands, r, uniform) {
  if (uniform) return cands[Math.floor(r() * cands.length)];
  let tot = 0; for (const c of cands) tot += c.w; let x = r() * tot;
  for (const c of cands) { x -= c.w; if (x <= 0) return c; } return cands[cands.length - 1];
}

// one draft + season
// cfg: {format, club, mode, sigma, formation, daily:{seq,year,formation}|null, seed, y0}; y0: era, wheel uses only club-seasons from y0
function play(cfg) {
  const r = mulberry32(cfg.seed);
  E.setFormat(cfg.format);
  const anti = cfg.format === 'anti';
  const formation = cfg.daily ? cfg.daily.formation : cfg.formation;
  const slots = FORMATIONS[formation].slots.map(slot => ({ slot, p: null }));
  const taken = new Set();   // people by canonical id (DATA.alias), same as S.taken in the game
  const noise = {};   // perception noise is fixed per player for the whole draft
  const perceived = (p, slot) => { const er = effRating(p, slot); if (er == null) return null; if (!(p[5] in noise)) noise[p[5]] = normal(r) * cfg.sigma; return (SEE === 'base' ? p[2] : er) + noise[p[5]]; };
  const pool0 = anti || cfg.format === 'classic' || cfg.format === 'legends' || cfg.daily ? DATA.clubs : cfg.format === 'derby' ? DATA.clubs.filter(c => FORMATS.derby.clubs.includes(c.c)) : DATA.clubs.filter(c => c.c === cfg.club);
  const pool = cfg.y0 && !cfg.daily ? pool0.filter(c => c.y >= cfg.y0) : pool0;
  const okP = p => !taken.has(canon(p[5])) && (!anti || p[3] >= ANTI_MIN_APPS);
  const best = cs => {   // best move (worst for anti) in this club-season
    let b = null;
    for (const p of cs.pl) { if (!okP(p)) continue;
      for (const s of slots) { if (s.p) continue; const v = perceived(p, s.slot); if (v == null) continue;
        const score = anti ? -v : v; if (!b || score > b.score) b = { p, s, score, v }; } }
    return b;
  };
  let rerolls = cfg.daily ? 1 : MODES[cfg.mode].rerolls, ptr = 0;
  // rejection sampling: same result as the game's "has a pickable player" filter + weighted pick, but faster
  const spinFresh = () => { for (let t = 0; t < 5000; t++) { const c = pickW(pool, r, anti); if (best(c)) return c; } return pool.find(c => best(c)); };
  const spin = () => {
    if (cfg.daily) { while (ptr < cfg.daily.seq.length) { const c = DATA.clubs[cfg.daily.seq[ptr++]]; if (best(c)) return c; } }
    return spinFresh();
  };
  const REROLL_BELOW = cfg.rerollBelow ?? 83;
  // season-pick mode: wheel gives a club, bot takes the best move among three random seasons of that club (with pickable players)
  const pickN = MODES[cfg.mode] && MODES[cfg.mode].pick;
  const spinPick = () => { const c0 = spinFresh(); const all = pool.filter(c => c.c === c0.c && best(c)); const opts = [];
    while (opts.length < pickN && all.length) opts.push(all.splice(Math.floor(r() * all.length), 1)[0]);
    let bb = null; for (const c of opts) { const b = best(c); if (b) { b.cc = c.c; b.y = c.y; } if (!bb || b.score > bb.score) bb = b; } return bb; };
  for (let k = 0; k < 11; k++) {
    if (pickN && !cfg.daily) { const b = spinPick(); b.s.p = b.p; b.s.cc = b.cc; b.s.y = b.y; taken.add(canon(b.p[5])); continue; }
    let cs = spin(), b = best(cs);
    while (rerolls > 0 && !anti && b.v < REROLL_BELOW) { rerolls--; cs = spinFresh(); b = best(cs); }
    b.s.p = b.p; b.s.cc = cs.c; b.s.y = cs.y; taken.add(canon(b.p[5]));
  }
  const xi = slots.map(s => ({ id: s.p[5], name: s.p[0], slot: s.slot, pos: GROUP_OF[s.slot], r: effRating(s.p, s.slot), cc: s.cc, y: s.y }));
  const year = cfg.daily ? cfg.daily.year : cfg.year || (E.LEAGUE_CULT ? (cfg.format === 'legends' || (cfg.format === 'classic' && E.VERSION >= '0.64') ? E.LEAGUE_LEGENDS : E.LEAGUE_CULT) : YEARS16[Math.floor(r() * YEARS16.length)]);   // cult-clubs league; classic uses the legends league since 0.64 (as oppYear); old engines use a random season
  const mode = cfg.daily ? 'daily' : cfg.mode;
  const res = E.run({ xi, mode, format: cfg.format, year, seed: Math.floor(r() * 2147483647) });
  const avg = xi.reduce((a, x) => a + x.r, 0) / 11;
  return { W: res.W, D: res.D, L: res.L, pts: res.pts, place: res.place, gf: res.gf, ga: res.ga, avg };
}

function summarize(rows) {
  const n = rows.length, s = rows.map(x => x.pts).sort((a, b) => a - b);
  const q = p => s[Math.min(n - 1, Math.floor(p * n))];
  const cnt = f => rows.filter(f).length / n;
  return { n, avgRating: +(rows.reduce((a, x) => a + x.avg, 0) / n).toFixed(1), meanPts: +(s.reduce((a, b) => a + b, 0) / n).toFixed(1),
    p10: q(0.1), median: q(0.5), p90: q(0.9), p99: q(0.99), max: s[n - 1],
    champion: +cnt(x => x.place === 1).toFixed(4), unbeaten: +cnt(x => x.L === 0).toFixed(4), w28: +cnt(x => x.W >= 28).toFixed(4),
    w29: +cnt(x => x.W >= 29).toFixed(4), perfect: +cnt(x => x.W === 30).toFixed(4), anti030: +cnt(x => x.L === 30).toFixed(4) };
}

module.exports = { play, summarize, FORMS };

if (require.main === module) {
  const N = +process.argv[2] || 2000;
  const ALL = { expert: 0, fan: 4, casual: 8 }; const only = process.argv[3]; const SIGMAS = only ? { [only]: ALL[only] } : ALL;
  const out = {}; let seedBase = 12345 + (only ? ['expert','fan','casual'].indexOf(only) * 1e7 : 0);
  const t0 = Date.now();
  const runSet = (key, mk) => { const rows = []; for (let i = 0; i < N; i++) rows.push(play(mk(i))); out[key] = summarize(rows); console.log(key, JSON.stringify(out[key]), ((Date.now() - t0) / 1000).toFixed(0) + 's'); };
  for (const [who, sigma] of Object.entries(SIGMAS)) {
    for (const mode of ['normal', 'hard', 'pick'])
      runSet(`classic|${mode}|${who}`, i => ({ format: 'classic', mode, sigma, formation: FORMS[i % FORMS.length], seed: seedBase++ }));
    // daily challenge: different days
    runSet(`daily|daily|${who}`, i => { const day = new Date(Date.UTC(2026, 8, 28) + (i % 365) * 864e5).toISOString().slice(0, 10); return { format: 'classic', mode: 'daily', sigma, daily: E.dailySetupFor(day), seed: seedBase++ }; });
    for (const mode of ['normal', 'hard'])
      runSet(`derby|${mode}|${who}`, i => ({ format: 'derby', mode, sigma, formation: FORMS[i % FORMS.length], seed: seedBase++ }));
    for (const club of ['dynamo-kyiv', 'shakhtar-donetsk', 'dnipro', 'vorskla-poltava'])
      for (const mode of ['normal', 'hard'])
        runSet(`oneclub:${club}|${mode}|${who}`, i => ({ format: 'oneclub', club, mode, sigma, formation: FORMS[i % FORMS.length], seed: seedBase++ }));
    runSet(`anti|hardcore|${who}`, i => ({ format: 'anti', mode: 'hardcore', sigma, formation: FORMS[i % FORMS.length], seed: seedBase++ }));
  }
  require('fs').writeFileSync(__dirname + '/results_' + (only || 'all') + '.json', JSON.stringify(out, null, 1));
}
