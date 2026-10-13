// 30-0 UPL: server wheel and server season for free play, friend leagues and friend challenges ("_" prefix: not a route).
// Called from /api/seed when the body has `draft` (Vercel Hobby allows 12 functions, so no separate endpoint).
//   draft 'start' {format, mode, era?, club?, formation, fl_id?, chal_id?, league?} -> {seed_id, ws, rerolls, year, formation, mode}
//       the wheel seed ws comes from the server; rules of a friend league / challenge come from the DB, not from the browser
//   draft 'lock'  {seed_id, xi}  -> squad checked against the wheel (first WIN[...] positions, at most `rerolls` picks off it),
//       season simulated here and stored with the seed (res, locked_at) -> {seed_id, seed, res, fl}; same squad again -> same answer, other squad -> 409
// A friend-league try is spent on lock (fl_record_seed), a challenge result is written on lock; abandoning the season does not undo either.
const crypto = require('crypto');
const { sb, kyivDate } = require('./_device.js');
const { xiHash } = require('./_lib.js');
let E = null;
const engine = () => E || (E = require('../lib/engine.js'));
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const DRAFT_MODES = ['normal', 'hard', 'practice'];   // visible levels; hidden formats and levels get no server wheel (season stays unverified)
const DAY_LIMIT = 60;   // draft starts per player and Kyiv day
// wheel window per format/era: deepest honest position from tools/wheel_window.js (3000 bot drafts each) with a margin
const WIN = { 'classic/all': 32, 'classic/d1990': 80, 'classic/d2000': 40, 'classic/d2010': 32, 'classic/d2020': 32, oneclub: 100 };
const winOf = (format, era) => format === 'oneclub' ? WIN.oneclub : WIN['classic/' + era] || 80;
const oppYear = format => format === 'classic' ? engine().LEAGUE_LEGENDS : engine().LEAGUE_CULT;
const err = (code, error) => [code, { error }];

async function start(b, dev, pid) {
  const D = engine();
  let format = String(b.format || ''), mode = String(b.mode || ''), era = String(b.era || 'all'), club = b.club == null ? null : String(b.club);
  let formation = String(b.formation || ''), year, ws = crypto.randomInt(1, 2147483647), rerolls, fl = null, chal = null;
  if (b.fl_id != null) {
    const id = String(b.fl_id);
    if (!/^[a-z2-9]{6}$/.test(id)) return err(400, 'fl_id?');
    const [L] = await sb(`fl_leagues?id=eq.${id}&deleted_at=is.null&select=id,fmt,era,rerolls`) || [];
    if (!L || L.fmt !== '11') return err(404, 'Ліги не знайдено.');
    fl = L.id; format = 'classic'; mode = 'normal'; era = L.era || 'all'; club = null; rerolls = +L.rerolls || 0;
  } else if (b.chal_id != null) {
    const id = String(b.chal_id);
    if (!/^[A-Za-z0-9]{6,12}$/.test(id)) return err(400, 'chal_id?');
    const [c] = await sb(`challenges?id=eq.${id}&select=id,seed,formation,year,mode`) || [];
    if (!c) return err(404, 'Виклику не знайдено.');
    chal = c.id; format = 'classic'; era = 'all'; club = null; ws = +c.seed; formation = c.formation; year = +c.year;
    mode = DRAFT_MODES.includes(c.mode) && c.mode !== 'practice' ? c.mode : 'normal';
  }
  if (!['classic', 'oneclub'].includes(format)) return err(400, 'format?');
  if (!DRAFT_MODES.includes(mode)) return err(400, 'mode?');
  if (!has(D.FORMATIONS, formation)) return err(400, 'formation?');
  if (format === 'oneclub') { era = 'all'; if (!club || !D.DATA.clubs.some(c => c.c === club)) return err(400, 'club?'); }
  else club = null;
  if (!has(D.ERAS, era)) return err(400, 'era?');
  if (rerolls == null) rerolls = D.MODES[mode].rerolls || 0;
  if (year == null) year = oppYear(format);
  const day = kyivDate();
  const mine = pid ? `player_id=eq.${pid}` : `device_id=eq.${dev}`;
  const used = await sb(`season_seeds?${mine}&day=eq.${day}&kind=eq.draft&select=id&limit=${DAY_LIMIT}`) || [];
  if (used.length >= DAY_LIMIT) return err(429, `Ліміт на сьогодні — ${DAY_LIMIT} сезонів. Цей сезон не потрапить у рекорди й таблиці.`);
  const league = b.league === true && !fl && !chal && format === 'classic' && mode === 'normal' && era === 'all';   // chat-league attempt (api/_league.js)
  const row = { device_id: dev, player_id: pid || null, xi_hash: '', seed: crypto.randomInt(1, 2147483647), day, daily: false, official: false,
    formation, mode, format, year, kind: 'draft', wheel_seed: ws, era, club, rerolls, fl_id: fl, chal_id: chal, league };
  const [ins] = await sb('season_seeds?select=id', { method: 'POST', prefer: 'return=representation', body: row }) || [];
  return [200, { seed_id: ins && ins.id, ws, rerolls, year, formation, mode }];
}

// squad against the seed's rules and wheel -> [error] or [null, cards]
function checkDraftXi(s, xi) {
  const D = engine();
  if (!Array.isArray(xi) || xi.length !== 11) return ['не 11 гравців'];
  const F = D.FORMATIONS[s.formation];
  if (!F || F.slots.join() !== xi.map(x => x && x.slot).join()) return ['позиції не відповідають схемі'];
  const A = D.DATA.alias || {}, seen = new Set(), cards = [];
  const era = s.era && s.era !== 'all' ? D.ERAS[s.era] : null;
  D.setFormat(s.format);
  for (const x of xi) {
    const ci = D.DATA.clubs.findIndex(c => c.n === x.c && c.y === +x.y), club = D.DATA.clubs[ci];
    const p = club && club.pl.find(q => q[5] === x.id);
    if (!p) return [`немає картки ${x.id}`];
    const r = D.effRating(p, x.slot);
    if (r == null) return [`${p[0]} не може грати на ${x.slot}`];
    const k = A[p[5]] || p[5]; if (seen.has(k)) return ['гравець двічі']; seen.add(k);
    if (s.format === 'oneclub' && club.c !== s.club) return ['один клуб: чужий клуб'];
    if (era && (club.y < era.y0 || (era.y1 != null && club.y > era.y1))) return [`епоха: ${x.c} ${x.y}`];
    cards.push({ ci, id: p[5], name: p[0], slot: x.slot, pos: D.GROUP_OF[x.slot], r, cc: club.c, y: club.y });
  }
  // one pick per wheel stop: each club-season occurrence in the window covers one player; the rest come from rerolls
  const left = {};
  for (const i of D.wheelFor(+s.wheel_seed, s.format, s.era || 'all', s.club).slice(0, winOf(s.format, s.era || 'all'))) left[i] = (left[i] || 0) + 1;
  let off = 0;
  for (const c of cards) { if (left[c.ci] > 0) left[c.ci]--; else off++; }
  if (off > (+s.rerolls || 0)) return [`склад не з колеса (${off} поза колесом)`];
  return [null, cards];
}

const norm = xi => (Array.isArray(xi) ? xi : []).map(x => ({ id: String(x && x.id || ''), slot: String(x && x.slot || ''), c: String(x && x.c || ''), y: +(x && x.y) }));
async function lock(b, dev, pid) {
  const D = engine();
  const id = String(b.seed_id || '');
  if (!uuidRe.test(id)) return err(400, 'seed_id?');
  const [s] = await sb(`season_seeds?id=eq.${id}&device_id=eq.${dev}&kind=eq.draft&select=*`) || [];
  if (!s) return err(404, 'seed?');
  const xi = norm(b.xi), h = xiHash(xi);
  const done = r => r.xi_hash === h ? [200, { seed_id: r.id, seed: +r.seed, res: r.res }] : err(409, 'Склад уже зафіксовано.');
  if (s.locked_at) return done(s);
  const [bad, cards] = checkDraftXi(s, xi);
  if (bad) return err(400, bad);
  const sim = D.run({ xi: cards.map(c => ({ id: c.id, name: c.name, slot: c.slot, pos: c.pos, r: c.r, cc: c.cc, y: c.y })), mode: s.mode, format: s.format, year: +s.year, seed: +s.seed });
  const res = { w: sim.W, d: sim.D, l: sim.L, pts: sim.pts, gf: sim.gf, ga: sim.ga, place: sim.place };
  let [got] = await sb(`season_seeds?id=eq.${id}&locked_at=is.null&select=*`, { method: 'PATCH', prefer: 'return=representation', body: { xi_hash: h, locked_at: new Date().toISOString(), res } }) || [];
  if (!got) { [got] = await sb(`season_seeds?id=eq.${id}&select=*`) || []; return got ? done(got) : err(404, 'seed?'); }   // a parallel lock won
  let fl;
  if (s.fl_id) { try { const n = await sb('rpc/fl_record_seed', { method: 'POST', body: { p_seed: id } }); fl = n == null ? null : +n; } catch (e) { console.error('fl lock', e.message); fl = null; } }
  if (s.chal_id) {   // first locked attempt per device counts (rerolling the draft cannot replace it)
    await sb('challenge_results?on_conflict=challenge_id,device_id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
      body: { challenge_id: s.chal_id, device_id: dev, player_id: pid || null, name: null, ...res } }).catch(e => console.error('chal lock', e.message));
  }
  return [200, { seed_id: id, seed: +s.seed, res, fl }];
}

async function handle(b, checked) {
  const d = checked;
  if (!d || d.status) return [d && d.status || 401, { error: d && d.error || 'secret?' }];
  const dev = String(b.device_id).toLowerCase();
  if (b.draft === 'start') return start(b, dev, d.player);
  if (b.draft === 'lock') return lock(b, dev, d.player);
  return err(400, 'draft?');
}
module.exports = { handle, checkDraftXi, WIN };
