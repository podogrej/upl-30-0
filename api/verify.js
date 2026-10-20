// 30-0 UPL: season verification (/api/verify)
// POST {season_id}: the server takes the season record from the log, checks seed, squad, ratings and format rules
// and recomputes the season with the same engine as the game (lib/engine.js). Result: seasons.verified = true/false.
const { sb, rateLimit, body } = require('./_device.js');   // DB requests with the service key
const { xiHash, fail } = require('./_lib.js');
const L = require('./_league.js');   // chat leagues: credit verified free-play seasons
let E = null;
const CHAL_OLD_BEFORE = '2026-10-01T14:56:00Z';   // since this merge (0.64) challenges are created only against "League of Legends"
const SEED_STRICT_FROM = '2026-10-12T00:00:00';   // ISO prefix compare with season_seeds.created_at
function engine() { if (!E) E = require('../lib/engine.js'); return E; }

// opponent year allowed for a season: for the format, the one the game uses (oppYear: LEAGUE_LEGENDS or LEAGUE_CULT).
// Exception: classic mode from an old friend challenge (before 0.50 a challenge could use a real 16-team UPL season):
// such a year is accepted only if challenges has a challenge with that year and formation (chalYearOk computed by the handler below).
function yearOk(row, E, chalYearOk) {
  const y = +row.year;
  // classic (and season pick) is against LEAGUE_LEGENDS; LEAGUE_CULT only for seasons from site 0.63 and earlier
  // or a friend challenge created before 0.64 (chalYearOk). Anti-season and hidden derby / one-club modes: cult clubs as before.
  if (row.format === 'legends') return y === E.LEAGUE_LEGENDS;
  if (row.format !== 'classic') return y === E.LEAGUE_CULT;
  if (y === E.LEAGUE_LEGENDS) return true;
  if (y === E.LEAGUE_CULT) return !!chalYearOk;   // audit P1-2: no "old version" exception, it could be forged via the version field
  return E.YEARS16.includes(y) && !!chalYearOk;
}

// The previous site version stays open for players (browser cache, Mini App): if simulation didn't change between versions, add it here
// so its seasons are verified by the new engine. History for 0.57-0.64 is in CHANGELOG.
const PREV_VERSIONS = ['0.91', '0.92'];   // only versions with identical simulation; others get null ("not verified"). Keeping it short also blocks forged version (audit P1-2)

// main check: returns [true|false|null, reason]; null = cannot verify (old version etc.)
function check(row, seedRow, opts = {}) {
  const E = engine();
  if (!row.version || row.version === E.VERSION) return checkCore(row, seedRow, opts);
  if (!PREV_VERSIONS.includes(row.version)) return [null, `версія гри ${row.version} ≠ рушій ${E.VERSION}`];
  const [v, note, fix, sim] = checkCore(row, seedRow, { ...opts, prev: true });
  return v === true ? [true, `ok (версія ${row.version})`, fix, sim] : [null, `версія гри ${row.version}: ${note}`];
}
function checkCore(row, seedRow, { chalYearOk = false, prev = false } = {}) {
  const E = engine();
  if (!seedRow) return [false, 'seed не видавався сервером'];
  if (String(seedRow.device_id) !== String(row.device_id)) return [false, 'seed іншого пристрою'];
  if (row.day) return [null, 'драфт дня більше не перевіряється'];   // retired daily draft is never verified
  // since 0.90.1 a free-play / league / challenge season needs a server wheel locked with this squad (api/_draft.js);
  // seeds of older tabs ('legacy') and hidden formats leave the season unverified. The daily challenge keeps its own seeds.
  const draft = seedRow.kind === 'draft';
  if (!draft && !seedRow.vd_day) return [null, 'сезон без серверного колеса'];
  if (draft) {
    if (!seedRow.locked_at || !seedRow.res) return [false, 'склад не зафіксовано'];
    if ((row.era || 'all') !== (seedRow.era || 'all')) return [false, 'епоха не та, що в колесі'];
    if ((row.fl_id || null) !== (seedRow.fl_id || null)) return [false, 'ліга не та, що в колесі'];
    if (row.format === 'oneclub' && row.club !== seedRow.club) return [false, 'клуб не той, що в колесі'];
    if (!!row.practice !== (seedRow.mode === 'practice')) return [false, 'тренування не збігається'];
  }
  if (+seedRow.seed !== +row.seed) return [false, 'seed не збігається'];
  if (seedRow.used_by && +seedRow.used_by !== +row.id) return [false, 'seed уже використано'];
  // formation, mode, format and year must match what the seed was issued for (old seeds may lack these fields)
  // seeds issued since SEED_STRICT_FROM always carry all four (api/seed.js); an empty field no longer matches any mode
  const strict = !seedRow.created_at || seedRow.created_at >= SEED_STRICT_FROM;
  for (const k of ['formation', 'mode', 'format']) {
    if (strict && !seedRow[k]) return [false, `seed без поля ${k}`];
    if (seedRow[k] != null && seedRow[k] !== '' && String(seedRow[k]) !== String(row[k])) return [false, `${k}: seed видано для «${seedRow[k]}»`];
  }
  if (strict && !seedRow.year) return [false, 'seed без поля year'];
  if (seedRow.year != null && +seedRow.year !== +row.year) return [false, `рік: seed видано для ${seedRow.year}`];
  // a seed of the retired daily draft is never spent on another season
  if (seedRow.daily === true) return [false, 'seed драфту дня для іншого сезону'];
  // a daily challenge seed (vd_day) carries only the classic season of that attempt's squad (xi_hash is set when the attempt is finished)
  if (seedRow.vd_day && (row.practice || row.fl_id || (row.era != null && row.era !== 'all'))) return [false, 'seed виклику дня для іншого сезону'];
  if (!E.FORMATS[row.format]) return [false, 'невідомий формат'];
  if (!E.MODES[row.mode]) return [false, 'невідомий режим'];
  if (!yearOk(row, E, chalYearOk || !!(draft && seedRow.chal_id))) return [false, `суперники ${row.year} не для формату ${row.format}`];
  // era: seasons.era exists only once the DB column is added; then every club-season in the squad must be no earlier than its start
  const era = row.era == null || row.era === 'all' ? null : E.ERAS && E.ERAS[row.era];
  if (row.era != null && row.era !== 'all' && !era) return [false, `невідома епоха ${row.era}`];
  const xi = row.xi || [];
  if (xi.length !== 11) return [false, 'не 11 гравців'];
  if (xiHash(xi) !== seedRow.xi_hash) return [false, 'склад змінено після видачі seed'];
  const F = E.FORMATIONS[row.formation]; if (!F) return [false, 'невідома схема'];
  if (F.slots.join() !== xi.map(x => x.slot).join()) return [false, 'позиції не відповідають схемі'];
  const canon = id => (E.DATA.alias && E.DATA.alias[id]) || id;   // one person under two ids (data/aliases) also counts as a duplicate
  if (new Set(xi.map(x => canon(x.id))).size !== 11) return [false, 'гравець двічі'];
  E.setFormat(row.format);
  const names = [];   // pool names, written over the browser's text fields on success (fix below)
  for (const x of xi) {
    const club = E.DATA.clubs.find(c => c.n === x.c && c.y === +x.y);
    if (!club) return [false, `немає клуб-сезону ${x.c} ${x.y}`];
    const p = club.pl.find(q => q[5] === x.id);
    if (!p) return [false, `${x.n} не грав за ${x.c} ${x.y}`];
    const r = E.effRating(p, x.slot);
    if (r == null) return [false, `${x.n} не може грати на ${x.slot}`];
    names.push(p[0]);
    if (r !== +x.r) return [false, `рейтинг ${x.n}: ${x.r} ≠ ${r}`];
    if (x.r0 != null && +x.r0 !== p[2]) return [false, `базовий рейтинг ${x.n}: ${x.r0} ≠ ${p[2]}`];   // r0 is shown in tables and on the card
    if (row.format === 'derby' && !E.FORMATS.derby.clubs.includes(club.c)) return [false, 'дербі: чужий клуб'];
    if (row.format === 'oneclub' && row.club && club.c !== row.club) return [false, 'один клуб: чужий клуб'];
    if (row.format === 'anti' && p[3] < E.ANTI_MIN_APPS) return [false, 'антисезон: замало матчів'];
    if (era && (club.y < era.y0 || (era.y1 != null && club.y > era.y1))) return [false, `епоха «${era.name}»: ${x.c} ${x.y}`];
  }
  if (row.perfect != null && !!row.perfect !== (+row.w === 30)) return [false, 'позначка 30-0 не відповідає результату'];
  // club code and season, for "chemistry" (players from the same club)
  const ccOf = x => (E.DATA.clubs.find(c => c.n === x.c && c.y === +x.y) || {}).c;
  const sim = E.run({ xi: xi.map(x => ({ id: x.id, name: x.n, slot: x.slot, pos: E.GROUP_OF[x.slot], r: +x.r, cc: ccOf(x), y: +x.y })), mode: row.mode, format: row.format, year: +row.year, seed: +row.seed });
  const same = sim.W === row.w && sim.D === row.d && sim.L === row.l && sim.gf === row.gf && sim.ga === row.ga && sim.place === row.place && (row.pts == null || sim.pts === row.pts);
  return same ? [true, 'ok', stored(E, row, xi, names, sim), sim] : [false, `перерахунок: ${sim.W}-${sim.D}-${sim.L} ${sim.gf}:${sim.ga} #${sim.place}`];
}

// Fields stored with a verified season are rewritten from the pool and the simulation, so text and stats cannot be forged:
// names from the pool, g/a/rt/f from the simulated players, the table, tier, golden and perfect marks (same rules as logSeason in the site).
// the player's own team name is a label only (not a result): keep the one the site stored for the 'me' row
const teamName = (row, dflt) => { const m = Array.isArray(row.tbl) && row.tbl.find(t => t && t.me); const n = m && typeof m.n === 'string' ? m.n.trim().slice(0, 60) : ''; return n || dflt; };
function stored(E, row, xi, names, sim) {
  E.setFormat(row.format);   // E.run resets the format; tierOf reads it
  return {
    xi: xi.map((x, i) => { const q = sim.players.find(v => v.id === x.id) || {}; return { ...x, n: names[i], f: q.form || 0, g: q.g || 0, a: q.a || 0, rt: q.rt ? Math.round(q.rt * 100) / 100 : null }; }),
    tbl: sim.table.map(t => ({ n: t.id === 'USER' ? teamName(row, t.n) : t.n, w: t.w, d: t.d, l: t.l, gf: t.gf, ga: t.ga, pts: t.pts, me: t.id === 'USER' })),
    tier: E.tierOf(sim)[0], golden: !!sim.golden, perfect: sim.W === 30 };
}

// Season trophies are written by the server from the verified season (src 'srv'): the same TROPHIES conditions as the site,
// on the simulated season, the stored squad and the server's own xP.
async function putTrophies(row, sim) {
  const E = engine();
  const c = E.trCtxRow(row);
  // pre-season xP recomputed here (same runs as the site, ~0.2 s), not taken from the browser
  c.r = { ...sim, xp: E.xpOf({ xi: (row.xi || []).map(x => ({ id: x.id, name: x.n, slot: x.slot, pos: E.GROUP_OF[x.slot], r: +x.r, cc: (E.DATA.clubs.find(k => k.n === x.c && k.y === +x.y) || {}).c, y: +x.y })),
    mode: row.mode, format: row.format, formation: row.formation, year: +row.year }) };
  const ids = E.trEval(c);
  // season-count milestones from the DB (this season is already verified): also restores ones a device never reported
  if (row.player_id) {
    const n = (await sb(`seasons?player_id=eq.${row.player_id}&verified=is.true&practice=is.false&select=id&limit=${Math.max(...E.MILESTONES.map(m => m[0]))}`) || []).length;
    for (const [k] of E.MILESTONES) if (n >= k) ids.push('ms' + k);
  }
  if (!ids.length) return;
  await sb('trophies?on_conflict=device_id,trophy', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
    body: ids.map(trophy => ({ device_id: row.device_id, trophy, src: 'srv', ...(row.tg_user_id ? { tg_user_id: row.tg_user_id, tg_name: row.tg_name || null } : {}) })) });
}
// season trophies and season-count milestones: only the server writes them (putTrophies); a browser claim of one of these ids is dropped
let SEASON_IDS = null;
const seasonTrophy = id => /^ms\d+$/.test(id) || (SEASON_IDS || (SEASON_IDS = new Set(engine().TROPHIES.filter(t => t.t).map(t => t.id)))).has(id);

// daily challenge: the attempt's result row gets the verified season (vd_results.season_id)
async function vdLink(row, seedRow, id) {
  const day = String(seedRow.vd_day).slice(0, 10);
  await sb(`vd_results?device_id=eq.${encodeURIComponent(String(row.device_id))}&day=eq.${day}&attempt=eq.${+seedRow.vd_attempt}&season_id=is.null`, { method: 'PATCH', prefer: 'return=minimal', body: { season_id: id } });
}
// season played as a friends league attempt (seasons.fl_id): credit it after verification (fl_record in DB: league rules, attempt limit).
// SQL 0.61 not applied or attempt not credited: season is still verified, return fl = null
async function flRecord(row, id) {
  if (!row.fl_id) return undefined;
  try { const n = await sb('rpc/fl_record', { method: 'POST', body: { p_season: id } }); return n == null ? null : +n; } catch (e) { return null; }
}
// verify season by id (shared by /api/verify and /api/save): {verified, note, cached?, fl?}
// row: the full row just inserted by /api/save (insert returned select=*), saves re-reading it
async function verifyById(id, row) {
  if (!row || +row.id !== +id) [row] = await sb(`seasons?id=eq.${id}&select=*`) || [];
  if (!row) return { status: 404, error: 'no season' };
  const [seedRow] = row.seed_id ? (await sb(`season_seeds?id=eq.${encodeURIComponent(row.seed_id)}&select=*`) || []) : [];
  if (row.verified !== null && row.verified !== undefined) {
    const fl = row.verified === true ? await flRecord(row, id) : undefined;
    return { verified: row.verified, note: row.verify_note, cached: true, fl };
  }
  let chalYearOk = false;
  if (row.format === 'classic' && row.year != null && Number.isInteger(+row.year) && (engine().YEARS16.includes(+row.year) || +row.year === engine().LEAGUE_CULT)) {
    // audit P1-1: only challenges created before 0.64 (could use a real UPL season); new challenges are always LEAGUE_LEGENDS
    const ch = await sb(`challenges?year=eq.${+row.year}&formation=eq.${encodeURIComponent(String(row.formation || ''))}&created_at=lt.${CHAL_OLD_BEFORE}&select=id&limit=1`) || [];
    chalYearOk = ch.length > 0;
  }
  let v, note, fix, sim;
  try { [v, note, fix, sim] = check(row, seedRow, { chalYearOk }); } catch (e) { v = null; note = 'рушій недоступний: ' + String(e.message || e).slice(0, 80); }
  // claim the seed atomically (only while used_by is still null): of two parallel verifications of seasons that share one seed, only one wins
  if (v === true && seedRow) {
    const got = await sb(`season_seeds?id=eq.${seedRow.id}&used_by=is.null`, { method: 'PATCH', prefer: 'return=representation', body: { used_by: id } }) || [];
    if (!got.length) {
      const [cur] = await sb(`season_seeds?id=eq.${seedRow.id}&select=used_by`) || [];
      if (!cur || +cur.used_by !== +id) { v = false; note = 'seed уже використано'; }   // same season again (retry after a failed verdict write) stays valid
    }
  }
  // verdict and the server-computed fields in one PATCH (retry-safe: the same values every time)
  await sb(`seasons?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: { verified: v, verify_note: String(note).slice(0, 200), ...(v === true && fix ? fix : {}) } });
  if (v === true && fix) row = { ...row, ...fix };
  if (v === true && sim && !row.practice) await putTrophies(row, sim).catch(e => console.error('trophies', e.message));
  if (v === true && seedRow && seedRow.vd_day) await vdLink(row, seedRow, id).catch(e => console.error('vd', e.message));
  // friends league attempt and chat leagues are independent; a chat league failure never fails the verification
  const [fl] = v === true ? await Promise.all([flRecord(row, id), L.creditSeason({ ...row, verified: true }, seedRow).catch(e => console.error('chat leagues', e.message))]) : [];
  return { verified: v, note, fl };
}

// POST {season_id}: legacy clients (wrote the season themselves) and re-verification. Normally /api/save writes and verifies at once.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const b = body(req);
    const id = +b.season_id; if (!id) return res.status(400).json({ error: 'season_id?' });
    if (await rateLimit(req, res, 'verify')) return;   // per IP
    const r = await verifyById(id);
    if (r.status) return res.status(r.status).json({ error: r.error });
    res.status(200).json(r);
  } catch (e) {
    fail(res, 'verify', e);
  }
};
module.exports.verifyById = verifyById;
module.exports.engine = engine;
module.exports.yearOk = yearOk;
module.exports.seasonTrophy = seasonTrophy;
