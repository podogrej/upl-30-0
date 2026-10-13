// Run from repo root: node tools/wheel_window.js [drafts]
// Honest-draft bot over the server wheel (wheelFor): walks the wheel like the site (skips club-seasons with nobody to take),
// spends rerolls at random, and reports the deepest wheel position an honest squad uses, per format/era (one club: worst club).
// The server window W in api/_draft.js must stay above these numbers.
const E = require('../lib/engine.js');
const N = +process.argv[2] || 3000;
const canon = id => (E.DATA.alias && E.DATA.alias[id]) || id;
function draft(ws, format, era, club, rerolls, formation, rand) {
  const seq = E.wheelFor(ws, format, era, club), slots = E.FORMATIONS[formation].slots.map(slot => ({ slot, p: null })), taken = new Set();
  const open = () => slots.filter(s => !s.p);
  const cands = c => c.pl.filter(p => !taken.has(canon(p[5])) && open().some(s => E.effRating(p, s.slot) != null));
  let ptr = 0, deep = -1, rr = rerolls, off = 0;
  const pool = E.DATA.clubs.filter(c => (format !== 'oneclub' || c.c === club) && (era === 'all' || (c.y >= E.ERAS[era].y0 && (E.ERAS[era].y1 == null || c.y <= E.ERAS[era].y1))));
  while (open().length) {
    let c = null, at = -1;
    while (ptr < seq.length) { const x = E.DATA.clubs[seq[ptr++]]; if (cands(x).length) { c = x; at = ptr - 1; break; } }
    if (!c) return null;
    if (rr > 0 && rand() < 0.3) {   // reroll: a random club-season off the wheel, wheel position not advanced
      rr--; ptr--;
      const alt = pool.filter(x => cands(x).length); if (!alt.length) continue;
      c = alt[Math.floor(rand() * alt.length)]; at = -1;
    }
    const ps = cands(c), p = ps[Math.floor(rand() * ps.length)];
    const ss = open().filter(s => E.effRating(p, s.slot) != null), s = ss[Math.floor(rand() * ss.length)];
    s.p = p; taken.add(canon(p[5]));
    if (at >= 0) deep = Math.max(deep, at); else off++;
  }
  return { deep, off };
}
const rand = E.mulberry32(20261013);
const forms = Object.keys(E.FORMATIONS);
const cases = [...['all', 'd1990', 'd2000', 'd2010', 'd2020'].map(era => ['classic', era, null]),
  ...[...new Set(E.DATA.clubs.map(c => c.c))].map(club => ['oneclub', 'all', club])];
const out = {};
for (const [format, era, club] of cases) {
  let max = -1, fails = 0;
  const n = format === 'oneclub' ? Math.max(200, N / 10) : N;
  for (let i = 0; i < n; i++) {
    const r = draft(1 + Math.floor(rand() * 2147483646), format, era, club, [0, 1, 2, 3][i % 4], forms[i % forms.length], rand);
    if (!r) { fails++; continue; } max = Math.max(max, r.deep);
  }
  const k = format === 'oneclub' ? 'oneclub' : format + '/' + era;
  if (!out[k] || max > out[k].max) out[k] = { max, fails, club };
}
console.log(JSON.stringify(out, null, 1));
