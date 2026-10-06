// 30-0 UPL: season verification (/api/verify)
// POST {season_id}: the server takes the season record from the log, checks seed, squad, ratings and format rules
// and recomputes the season with the same engine as the game (lib/engine.js). Result: seasons.verified = true/false.
const crypto = require('crypto');
const { sb, rateLimit } = require('./_device.js');   // DB requests with the service key
const xiHash = xi => crypto.createHash('sha256').update(xi.map(x => `${x.id}|${x.slot}|${x.c}|${x.y}`).join(';')).digest('hex');
let E = null;
const CHAL_OLD_BEFORE = '2026-10-01T14:56:00Z';   // since this merge (0.64) challenges are created only against "League of Legends"
function engine() { if (!E) E = require('../lib/engine.js'); return E; }

// opponent year allowed for a season: for the format, the one the game uses (oppYear: LEAGUE_LEGENDS or LEAGUE_CULT).
// Exception: classic mode from an old friend challenge (before 0.50 a challenge could use a real 16-team UPL season):
// such a year is accepted only if challenges has a challenge with that year and formation (chalYearOk computed by the handler below).
function yearOk(row, E, chalYearOk, prev) {
  const y = +row.year;
  // classic (and season pick, daily draft) is against LEAGUE_LEGENDS; LEAGUE_CULT only for seasons from site 0.63 and earlier
  // or a friend challenge created before 0.64 (chalYearOk). Anti-season and hidden derby / one-club modes: cult clubs as before.
  if (row.format === 'legends') return y === E.LEAGUE_LEGENDS;
  if (row.format !== 'classic') return y === E.LEAGUE_CULT;
  if (y === E.LEAGUE_LEGENDS) return true;
  if (y === E.LEAGUE_CULT) return !row.day && !!chalYearOk;   // audit P1-2: no "old version" exception, it could be forged via the version field
  return !row.day && E.YEARS16.includes(y) && !!chalYearOk;
}

// The previous site version stays open for players (browser cache, Mini App): if simulation didn't change between versions, add it here
// so its seasons are verified by the new engine. History for 0.57-0.64 is in CHANGELOG.
const PREV_VERSIONS = [];   // only versions with identical simulation; others get null ("not verified"). Keeping it short also blocks forged version (audit P1-2)

// main check: returns [true|false|null, reason]; null = cannot verify (old version etc.)
function check(row, seedRow, opts = {}) {
  const E = engine();
  if (!row.version || row.version === E.VERSION) return checkCore(row, seedRow, opts);
  if (!PREV_VERSIONS.includes(row.version)) return [null, `версія гри ${row.version} ≠ рушій ${E.VERSION}`];
  const [v, note] = checkCore(row, seedRow, { ...opts, prev: true });
  return v === true ? [true, `ok (версія ${row.version})`] : [null, `версія гри ${row.version}: ${note}`];
}
function checkCore(row, seedRow, { chalYearOk = false, prev = false } = {}) {
  const E = engine();
  if (!seedRow) return [false, 'seed не видавався сервером'];
  if (String(seedRow.device_id) !== String(row.device_id)) return [false, 'seed іншого пристрою'];
  if (+seedRow.seed !== +row.seed) return [false, 'seed не збігається'];
  if (seedRow.used_by && +seedRow.used_by !== +row.id) return [false, 'seed уже використано'];
  // formation, mode, format and year must match what the seed was issued for (old seeds may lack these fields)
  for (const k of ['formation', 'mode', 'format']) if (seedRow[k] != null && seedRow[k] !== '' && String(seedRow[k]) !== String(row[k])) return [false, `${k}: seed видано для «${seedRow[k]}»`];
  if (seedRow.year != null && +seedRow.year !== +row.year) return [false, `рік: seed видано для ${seedRow.year}`];
  if (!E.FORMATS[row.format]) return [false, 'невідомий формат'];
  if (!E.MODES[row.mode]) return [false, 'невідомий режим'];
  if (!yearOk(row, E, chalYearOk, prev)) return [false, `суперники ${row.year} не для формату ${row.format}`];
  // era: seasons.era exists only once the DB column is added; then every club-season in the squad must be no earlier than its start
  const era = row.era == null || row.era === 'all' ? null : E.ERAS && E.ERAS[row.era];
  if (row.era != null && row.era !== 'all' && !era) return [false, `невідома епоха ${row.era}`];
  if (era && row.day) return [false, 'виклик дня — без епохи'];
  const xi = row.xi || [];
  if (xi.length !== 11) return [false, 'не 11 гравців'];
  if (xiHash(xi) !== seedRow.xi_hash) return [false, 'склад змінено після видачі seed'];
  const F = E.FORMATIONS[row.formation]; if (!F) return [false, 'невідома схема'];
  if (F.slots.join() !== xi.map(x => x.slot).join()) return [false, 'позиції не відповідають схемі'];
  const canon = id => (E.DATA.alias && E.DATA.alias[id]) || id;   // one person under two ids (data/aliases) also counts as a duplicate
  if (new Set(xi.map(x => canon(x.id))).size !== 11) return [false, 'гравець двічі'];
  E.setFormat(row.format);
  for (const x of xi) {
    const club = E.DATA.clubs.find(c => c.n === x.c && c.y === +x.y);
    if (!club) return [false, `немає клуб-сезону ${x.c} ${x.y}`];
    const p = club.pl.find(q => q[5] === x.id);
    if (!p) return [false, `${x.n} не грав за ${x.c} ${x.y}`];
    const r = E.effRating(p, x.slot);
    if (r == null) return [false, `${x.n} не може грати на ${x.slot}`];
    if (r !== +x.r) return [false, `рейтинг ${x.n}: ${x.r} ≠ ${r}`];
    if (x.r0 != null && +x.r0 !== p[2]) return [false, `базовий рейтинг ${x.n}: ${x.r0} ≠ ${p[2]}`];   // r0 is shown in tables and on the card
    if (row.format === 'derby' && !E.FORMATS.derby.clubs.includes(club.c)) return [false, 'дербі: чужий клуб'];
    if (row.format === 'oneclub' && row.club && club.c !== row.club) return [false, 'один клуб: чужий клуб'];
    if (row.format === 'anti' && p[3] < E.ANTI_MIN_APPS) return [false, 'антисезон: замало матчів'];
    if (era && club.y < era.y0) return [false, `епоха «${era.name}»: ${x.c} ${x.y}`];
  }
  if (row.day) {   // daily challenge: same formation, opponents and wheel
    const d = E.dailySetupFor(String(row.day).slice(0, 10));
    if (d.formation !== row.formation || (d.year !== +row.year && !(prev && +row.year === E.LEAGUE_CULT))) return [false, 'не той виклик дня'];   // 0.63 and earlier: cult clubs
    const inSeq = new Set(d.seq.slice(0, 400));
    const onWheel = xi.filter(x => { const i = E.DATA.clubs.findIndex(c => c.n === x.c && c.y === +x.y); return inSeq.has(i); }).length;
    if (onWheel < 10) return [false, `колесо дня: лише ${onWheel} з 11 клуб-сезонів`];   // 1 reroll allowed
  }
  if (row.perfect != null && !!row.perfect !== (+row.w === 30)) return [false, 'позначка 30-0 не відповідає результату'];
  // club code and season, for "chemistry" (players from the same club)
  const ccOf = x => (E.DATA.clubs.find(c => c.n === x.c && c.y === +x.y) || {}).c;
  const sim = E.run({ xi: xi.map(x => ({ id: x.id, name: x.n, slot: x.slot, pos: E.GROUP_OF[x.slot], r: +x.r, cc: ccOf(x), y: +x.y })), mode: row.mode, format: row.format, year: +row.year, seed: +row.seed });
  const same = sim.W === row.w && sim.D === row.d && sim.L === row.l && sim.gf === row.gf && sim.ga === row.ga && sim.place === row.place && (row.pts == null || sim.pts === row.pts);
  return same ? [true, 'ok'] : [false, `перерахунок: ${sim.W}-${sim.D}-${sim.L} ${sim.gf}:${sim.ga} #${sim.place}`];
}

// daily challenge result is written by the server from the verified season (browser numbers in daily_results are not trusted).
// Only the first official attempt of the day (seed official) and only the season that seed was assigned to (used_by).
// Row exists (browser inserted it via the submit button): overwrite numbers and set verified; otherwise insert it.
async function syncDaily(row, seedRow) {
  if (!row.day || row.verified !== true || row.practice || !seedRow || !seedRow.official || +seedRow.used_by !== +row.id) return false;
  const day = String(row.day).slice(0, 10), dev = encodeURIComponent(String(row.device_id));
  const res = { w: row.w, d: row.d, l: row.l, pts: row.w * 3 + row.d, gf: row.gf, ga: row.ga, place: row.place, formation: row.formation, xp: row.xp == null ? null : +row.xp,
    xi: (row.xi || []).map(x => [x.n, x.slot, x.r, x.c, x.y]), verified: true };
  // group league boards: bind a result submitted before the browser knew the season id to this season
  if (row.tg_user_id) await sb(`league_results?day=eq.${day}&tg_user_id=eq.${+row.tg_user_id}&season_id=is.null`, { method: 'PATCH', prefer: 'return=minimal', body: { season_id: row.id } });
  const upd = await sb(`daily_results?day=eq.${day}&device_id=eq.${dev}`, { method: 'PATCH', prefer: 'return=representation', body: res });
  if (upd && upd.length) return true;
  let nick = Array.from(String(row.nickname || row.tg_name || '').trim()).slice(0, 24).join('').trim();   if (Array.from(nick).length < 2) nick = 'Гравець';   // main DB: char_length 2-24
  const ins = { day, device_id: row.device_id, nickname: nick, ...res };
  if (row.tg_user_id) { ins.tg_user_id = row.tg_user_id; ins.tg_name = row.tg_name || null; }
  await sb('daily_results?on_conflict=day,device_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: ins });
  return true;
}

// season played as a friends league attempt (seasons.fl_id): credit it after verification (fl_record in DB: league rules, attempt limit).
// SQL 0.61 not applied or attempt not credited: season is still verified, return fl = null
async function flRecord(row, id) {
  if (!row.fl_id) return undefined;
  try { const n = await sb('rpc/fl_record', { method: 'POST', body: { p_season: id } }); return n == null ? null : +n; } catch (e) { return null; }
}
// verify season by id (shared by /api/verify and /api/save): {verified, note, cached?, fl?}
async function verifyById(id) {
  const [row] = await sb(`seasons?id=eq.${id}&select=*`) || [];
  if (!row) return { status: 404, error: 'no season' };
  const [seedRow] = row.seed_id ? (await sb(`season_seeds?id=eq.${encodeURIComponent(row.seed_id)}&select=*`) || []) : [];
  if (row.verified !== null && row.verified !== undefined) {
    if (row.verified === true) await syncDaily(row, seedRow);   // repeated call: rewrite the verified daily numbers again
    const fl = row.verified === true ? await flRecord(row, id) : undefined;
    return { verified: row.verified, note: row.verify_note, cached: true, fl };
  }
  let chalYearOk = false;
  if (row.format === 'classic' && !row.day && row.year != null && Number.isInteger(+row.year) && (engine().YEARS16.includes(+row.year) || +row.year === engine().LEAGUE_CULT)) {
    // audit P1-1: only challenges created before 0.64 (could use a real UPL season); new challenges are always LEAGUE_LEGENDS
    const ch = await sb(`challenges?year=eq.${+row.year}&formation=eq.${encodeURIComponent(String(row.formation || ''))}&created_at=lt.${CHAL_OLD_BEFORE}&select=id&limit=1`) || [];
    chalYearOk = ch.length > 0;
  }
  let v, note;
  try { [v, note] = check(row, seedRow, { chalYearOk }); } catch (e) { v = null; note = 'рушій недоступний: ' + String(e.message || e).slice(0, 80); }
  await sb(`seasons?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: { verified: v, verify_note: String(note).slice(0, 200) } });
  if (v === true && seedRow) {
    await sb(`season_seeds?id=eq.${seedRow.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { used_by: id } });
    await syncDaily({ ...row, verified: true }, { ...seedRow, used_by: id });
  }
  const fl = v === true ? await flRecord(row, id) : undefined;
  return { verified: v, note, fl };
}

// POST {season_id}: legacy clients (wrote the season themselves) and re-verification. Normally /api/save writes and verifies at once.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    let b = req.body || {}; if (typeof b === 'string') b = JSON.parse(b);
    const id = +b.season_id; if (!id) return res.status(400).json({ error: 'season_id?' });
    if (await rateLimit(req, res, 'verify')) return;   // per IP
    const r = await verifyById(id);
    if (r.status) return res.status(r.status).json({ error: r.error });
    res.status(200).json(r);
  } catch (e) {
    res.status(500).json({ error: `crash: ${String(e && e.message || e).slice(0, 160)}` });
  }
};
module.exports.verifyById = verifyById;
