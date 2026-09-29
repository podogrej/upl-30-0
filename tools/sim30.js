// Замір складності 30-0: «розумний гравець» збирає склад з колеса за правилами гри, рушій (site/lib/engine.js) симулює сезон.
// node harness.js  → results.json
const E = require(process.env.SIM_ENGINE || __dirname + '/../lib/engine.js');   // SIM_ENGINE — інший рушій (напр. «до» правки)
const SEE = process.env.SIM_SEE || 'eff';   // eff — бот бачить рейтинг зі штрафом за позицію й ногою; base — лише базовий рейтинг картки, як живий гравець з 0.50
const { DATA, FORMATIONS, FORMATS, GROUP_OF, MODES, YEARS16, ANTI_MIN_APPS, effRating, mulberry32, hashStr } = E;
const FORMS = Object.keys(FORMATIONS);

function normal(r) { let u = 0, v = 0; while (!u) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function pickW(cands, r, uniform) {
  if (uniform) return cands[Math.floor(r() * cands.length)];
  let tot = 0; for (const c of cands) tot += c.w; let x = r() * tot;
  for (const c of cands) { x -= c.w; if (x <= 0) return c; } return cands[cands.length - 1];
}

// один драфт + сезон
// cfg: {format, club, mode, sigma, formation, daily:{seq,year,formation}|null, seed}
function play(cfg) {
  const r = mulberry32(cfg.seed);
  E.setFormat(cfg.format);
  const anti = cfg.format === 'anti';
  const formation = cfg.daily ? cfg.daily.formation : cfg.formation;
  const slots = FORMATIONS[formation].slots.map(slot => ({ slot, p: null }));
  const taken = new Set();
  const noise = {};   // сприйняття гравця стабільне протягом драфту: знаєш когось як «сильного» — він сильний для тебе весь драфт
  const perceived = (p, slot) => { const er = effRating(p, slot); if (er == null) return null; if (!(p[5] in noise)) noise[p[5]] = normal(r) * cfg.sigma; return (SEE === 'base' ? p[2] : er) + noise[p[5]]; };
  const pool = anti || cfg.format === 'classic' || cfg.format === 'legends' || cfg.daily ? DATA.clubs : cfg.format === 'derby' ? DATA.clubs.filter(c => FORMATS.derby.clubs.includes(c.c)) : DATA.clubs.filter(c => c.c === cfg.club);
  const okP = p => !taken.has(p[5]) && (!anti || p[3] >= ANTI_MIN_APPS);
  const best = cs => {   // найкращий (для анти — найгірший) хід у цьому клуб-сезоні
    let b = null;
    for (const p of cs.pl) { if (!okP(p)) continue;
      for (const s of slots) { if (s.p) continue; const v = perceived(p, s.slot); if (v == null) continue;
        const score = anti ? -v : v; if (!b || score > b.score) b = { p, s, score, v }; } }
    return b;
  };
  let rerolls = cfg.daily ? 1 : MODES[cfg.mode].rerolls, ptr = 0;
  // вибірка з відхиленням = те саме, що гра робить фільтром «є кого взяти» + зважений вибір, але швидше
  const spinFresh = () => { for (let t = 0; t < 5000; t++) { const c = pickW(pool, r, anti); if (best(c)) return c; } return pool.find(c => best(c)); };
  const spin = () => {
    if (cfg.daily) { while (ptr < cfg.daily.seq.length) { const c = DATA.clubs[cfg.daily.seq[ptr++]]; if (best(c)) return c; } }
    return spinFresh();
  };
  const REROLL_BELOW = cfg.rerollBelow ?? 83;
  for (let k = 0; k < 11; k++) {
    let cs = spin(), b = best(cs);
    while (rerolls > 0 && !anti && b.v < REROLL_BELOW) { rerolls--; cs = spinFresh(); b = best(cs); }
    b.s.p = b.p; taken.add(b.p[5]);
  }
  const xi = slots.map(s => ({ id: s.p[5], name: s.p[0], slot: s.slot, pos: GROUP_OF[s.slot], r: effRating(s.p, s.slot) }));
  const year = cfg.daily ? cfg.daily.year : cfg.year || (E.LEAGUE_CULT ? (cfg.format === 'legends' ? E.LEAGUE_LEGENDS : E.LEAGUE_CULT) : YEARS16[Math.floor(r() * YEARS16.length)]);   // з 0.50 — ліга культових клубів; старий рушій — випадковий сезон
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
    for (const mode of ['normal', 'hard'])
      runSet(`classic|${mode}|${who}`, i => ({ format: 'classic', mode, sigma, formation: FORMS[i % FORMS.length], seed: seedBase++ }));
    // виклик дня: різні дні
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
