// 30-0 UPL: daily challenge attempts ("_" prefix: not a route). Called from /api/seed when the body has `vd`
// (Vercel Hobby allows 12 functions, so no separate endpoint).
//   vd 'start'  {day}                      -> open attempt (or a new one, at most VD_ATTEMPTS per device and day): {attempt, used, seed_id}
//   vd 'finish' {day, attempt, xi, formation} -> server computes the required condition and the score from the squad (lib/vd_core.js),
//                                            writes vd_results; condition met -> the attempt's season seed {seed_id, seed}, else the attempt burns
//   vd 'mine'   {from?}                    -> own best per day (vd_mine) for the archive
// Attempt = season_seeds row with vd_day/vd_attempt (sql/v080_vyklyk_dnia.sql). Results are written only here, with the device secret.
const crypto = require('crypto');
const { sb, deviceOk, kyivDate } = require('./_device.js');
const V = require('../lib/vd_core.js');
const LIST = require('../lib/challenges.json');
let E = null, IDX = null;
const engine = () => E || (E = require('../lib/engine.js'));
const CUR = require('../lib/vd_current.json');   // season in progress
const index = () => IDX || (IDX = V.vdIndex(engine().DATA, CUR));
const dayRe = /^\d{4}-\d{2}-\d{2}$/;
const xiHash = xi => crypto.createHash('sha256').update(xi.map(x => `${x.id}|${x.slot}|${x.c}|${x.y}`).join(';')).digest('hex');
const dup = e => e && (e.status === 409 || /23505/.test(e.body || ''));

// squad check: formation of the day, slots in order, real cards, playable slots, no person twice, event player on his card
// attempt wheel: same sequence as the site (wheelSeq of hashStr(seed_id + '|wheel')); picks come from its first VD_WHEEL_WIN entries,
// at most VD_REROLLS of them from rerolls (off the sequence). The event player is not drafted.
const VD_WHEEL_WIN = 24, VD_REROLLS = 2;   // honest drafts reach at most ~14 entries (3000 simulated drafts)
function wheelOf(seedId) { const D = engine(); return new Set(D.wheelSeq(D.hashStr(String(seedId) + '|wheel')).slice(0, VD_WHEEL_WIN)); }
function checkXi(ch, xi, formation, seedId) {
  const D = engine();
  if (!Array.isArray(xi) || xi.length !== 11) return ['не 11 гравців'];
  if (formation !== (ch.formation || '4-4-2')) return ['не та схема'];
  const F = D.FORMATIONS[formation]; if (!F || F.slots.join() !== xi.map(x => x && x.slot).join()) return ['позиції не відповідають схемі'];
  const A = D.DATA.alias || {}, seen = new Set(), out = [];
  D.setFormat('classic');
  for (const x of xi) {
    const club = D.DATA.clubs.find(c => c.n === x.c && c.y === +x.y);
    const p = club && club.pl.find(q => q[5] === x.id);
    if (!p) return [`немає картки ${x.id}`];
    if (D.effRating(p, x.slot) == null) return [`${p[0]} не може грати на ${x.slot}`];
    const k = A[p[5]] || p[5]; if (seen.has(k)) return ['гравець двічі']; seen.add(k);
    out.push({ id: p[5], line: V.VD_LINE[p[6]] || V.VD_LINE[p[1]], club: club.c, y: club.y });
  }
  const ev = V.vdEventCard(ch, D.DATA);
  if (ev && !out.some(x => x.id === ev.p[5] && x.club === ev.c.c && x.y === ev.c.y)) return ['немає гравця події'];
  if (seedId) {
    const W = wheelOf(seedId), D2 = engine().DATA, evId = ev && ev.p[5];
    const off = out.filter(x => x.id !== evId && !W.has(D2.clubs.findIndex(c => c.c === x.club && c.y === x.y))).length;
    if (off > VD_REROLLS) return [`склад не з колеса спроби (${off} поза колесом)`];
  }
  return [null, out];
}

async function state(dev, day) {
  const [seeds, res] = await Promise.all([
    sb(`season_seeds?device_id=eq.${dev}&vd_day=eq.${day}&select=id,seed,vd_attempt,used_by,xi_hash&order=vd_attempt.asc`),
    sb(`vd_results?device_id=eq.${dev}&day=eq.${day}&select=attempt,gate_ok,score,season_id,seed_id,late,xi&order=attempt.asc`)]);
  return { seeds: seeds || [], res: res || [] };
}
const summary = st => ({ used: st.res.length, best: st.res.filter(r => r.gate_ok).reduce((a, r) => Math.max(a, r.score), -1) });
const reply = (r, st) => { const s = summary(st); return { ...r, used: s.used, best: s.best < 0 ? null : s.best }; };

async function start(dev, day, ch) {
  for (let k = 0; k < 3; k++) {
    const st = await state(dev, day), done = new Set(st.res.map(r => +r.attempt));
    const open = st.seeds.find(s => !done.has(+s.vd_attempt) && s.used_by == null);
    if (open) return [200, reply({ attempt: +open.vd_attempt, seed_id: open.id }, st)];
    const n = Math.max(0, ...st.seeds.map(s => +s.vd_attempt), ...st.res.map(r => +r.attempt)) + 1;
    if (n > V.VD_ATTEMPTS) return [409, reply({ error: 'Спроби на цей день закінчились.', attempt: null }, st)];
    const row = { device_id: dev, xi_hash: '', seed: crypto.randomInt(1, 2147483647), day: kyivDate(), daily: false, official: false,
      formation: ch.formation || '4-4-2', mode: 'normal', format: 'classic', year: engine().LEAGUE_LEGENDS, vd_day: day, vd_attempt: n };
    try { const [ins] = await sb('season_seeds?select=id', { method: 'POST', prefer: 'return=representation', body: row }) || []; return [200, reply({ attempt: n, seed_id: ins && ins.id }, st)]; }
    catch (e) { if (!dup(e)) throw e; }   // parallel start took this number: read again
  }
  return [409, { error: 'Спробуй ще раз.' }];
}

// the seed goes only to the XI stored with the counted attempt: xi_hash is set once (while empty) and read back
async function seedFor(seed, row, b) {
  const h = xiHash(row.xi || []);
  if (!row.gate_ok || seed.used_by != null || !Array.isArray(b.xi) || xiHash(b.xi.map(x => ({ id: String(x.id), slot: String(x.slot), c: String(x.c), y: +x.y }))) !== h) return {};
  if (!seed.xi_hash) await sb(`season_seeds?id=eq.${seed.id}&used_by=is.null&xi_hash=eq.`, { method: 'PATCH', prefer: 'return=minimal', body: { xi_hash: h } });
  const [cur] = await sb(`season_seeds?id=eq.${seed.id}&select=xi_hash,used_by,seed`) || [];
  return cur && cur.xi_hash === h && cur.used_by == null ? { seed_id: seed.id, seed: +cur.seed } : {};
}
async function finish(dev, pid, day, ch, b, late) {
  const n = +b.attempt;
  let st = await state(dev, day);
  const seed = st.seeds.find(s => +s.vd_attempt === n);
  if (!seed) return [400, { error: 'attempt?' }];
  let row = st.res.find(r => +r.attempt === n), have = null, need = null;
  if (!row) {
    const [bad, cards] = checkXi(ch, b.xi, String(b.formation || ''), seed.id);
    if (bad) return [400, { error: bad }];
    const ev = V.vdEval(ch, cards, index(), engine().DATA.alias);
    have = ev.have; need = ev.need;
    const ins = { day, device_id: dev, player_id: pid || null, attempt: n, gate_ok: ev.gate, score: ev.score, seed_id: seed.id, late,
      xi: b.xi.map(x => ({ id: String(x.id), slot: String(x.slot), c: String(x.c), y: +x.y })) };
    try { await sb('vd_results', { method: 'POST', prefer: 'return=minimal', body: ins }); row = ins; }
    catch (e) { if (!dup(e)) throw e; }   // a parallel finish stored its XI first: that row decides
    st = await state(dev, day);
    row = st.res.find(r => +r.attempt === n) || row;
  }
  const out = { attempt: n, gate: !!row.gate_ok, score: row.score, have, need, late: row.late == null ? late : !!row.late };
  Object.assign(out, await seedFor(seed, row, b));   // also a retry after a timed-out PATCH
  return [200, reply(out, st)];
}

// b.vd: 'start' | 'finish' | 'mine'; device checked here (secret required)
async function handle(b) {
  const d = await deviceOk(b.device_id, b.secret);
  if (d.status) return [d.status, { error: d.error }];
  const dev = String(b.device_id).toLowerCase();
  if (b.vd === 'mine') {
    const from = dayRe.test(String(b.from || '')) ? b.from : null;
    const rows = await sb('rpc/vd_mine', { method: 'POST', body: { p_device: dev, p_from: from } });
    return [200, { days: (rows || []).map(r => ({ day: String(r.c_day).slice(0, 10), best: r.best, attempts: r.attempts, gate: r.gate_any })) }];
  }
  const day = String(b.day || ''), today = kyivDate();
  if (!dayRe.test(day) || day > today) return [400, { error: 'day?' }];
  const ch = V.vdFind(LIST, day);
  if (!ch) return [404, { error: 'Виклику на цей день немає.' }];
  if (b.vd === 'start') return start(dev, day, ch);
  if (b.vd === 'finish') return finish(dev, d.player, day, ch, b, day < today);
  return [400, { error: 'vd?' }];
}
module.exports = { handle, checkXi, xiHash, VD_WHEEL_WIN };
