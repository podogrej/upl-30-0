// 30-0 УПЛ — перевірка сезону (адреса /api/verify)
// POST {season_id}: сервер бере запис сезону з журналу, перевіряє seed, склад, рейтинги й правила формату
// і перераховує сезон тим самим рушієм, що й гра (lib/engine.js). Результат: seasons.verified = true/false.
const crypto = require('crypto');
const { sb, rateLimit } = require('./_device.js');   // запити до бази ключем сервера
const xiHash = xi => crypto.createHash('sha256').update(xi.map(x => `${x.id}|${x.slot}|${x.c}|${x.y}`).join(';')).digest('hex');
let E = null;
function engine() { if (!E) E = require('../lib/engine.js'); return E; }

// рік суперників, дозволений для сезону: для формату — той, що дає гра (oppYear: «Ліга легенд» або «Ліга культових клубів»).
// Виняток — класика за старим «Викликом другу» (до 0.50 виклик міг мати справжній сезон УПЛ на 16 команд):
// такий рік приймаємо, лише якщо в таблиці challenges є виклик з цим роком і схемою (chalYearOk рахує обробник нижче).
function yearOk(row, E, chalYearOk) {
  const y = +row.year;
  const opp = row.format === 'legends' ? E.LEAGUE_LEGENDS : E.LEAGUE_CULT;
  if (y === opp) return true;
  return row.format === 'classic' && !row.day && E.YEARS16.includes(y) && !!chalYearOk;
}

// Сайт попередньої версії ще відкритий у гравців (кеш браузера, Mini App). Якщо його сезон повністю сходиться з новим рушієм
// (симуляція між цими версіями не мінялася) — приймаємо; не сходиться (напр. у гравця змінилася позиція в пулі) — «не перевірити» (null), не «підробка».
// 0.57 змінила рейтинги (v2) і refA/refD: сезони 0.56 і раніше з новим рушієм не зійдуться — вони зберігаються з verified = null («не перевірити»).
// 0.58: пул і симуляція ті самі, що в 0.57 (у рушії додано лише ERAS і спільний plUk для тексту рівня) — сезони сайту 0.57 приймали.
// 0.59: пул і симуляція не мінялись (сторінка гравця, імена) — сезони сайту 0.58 приймаємо.
// 0.60: нога крайніх півзахисників (LM/RM) — як у вінгерів; новий режим 'pick' («Вибір сезону»). Сезони 0.59 без LM/RM з «перевернутою» ногою
//       сходяться й приймаються; з таким гравцем — «не перевірити» (null).
// 0.61: пул і симуляція як у 0.60 (ліги з друзями, трофеї, поле) — сезони сайту 0.60 приймаємо; 0.59 — як у 0.60.
// 0.62: лише дизайн (рушій і пул ті самі) — сезони сайту 0.61 приймаємо; 0.60 — як у 0.61.
// 0.63: змінилась лише «Ліга легенд» (сезон клубу — за силою складу): сезони 0.62/0.61 у інших форматах сходяться й приймаються, у «Лізі легенд» — «не перевірити» (null).
const PREV_VERSIONS = ['0.62', '0.61'];

// головна перевірка: повертає [true|false|null, пояснення]; null — перевірити неможливо (стара версія тощо)
function check(row, seedRow, opts = {}) {
  const E = engine();
  if (!row.version || row.version === E.VERSION) return checkCore(row, seedRow, opts);
  if (!PREV_VERSIONS.includes(row.version)) return [null, `версія гри ${row.version} ≠ рушій ${E.VERSION}`];
  const [v, note] = checkCore(row, seedRow, opts);
  return v === true ? [true, `ok (версія ${row.version})`] : [null, `версія гри ${row.version}: ${note}`];
}
function checkCore(row, seedRow, { chalYearOk = false } = {}) {
  const E = engine();
  if (!seedRow) return [false, 'seed не видавався сервером'];
  if (String(seedRow.device_id) !== String(row.device_id)) return [false, 'seed іншого пристрою'];
  if (+seedRow.seed !== +row.seed) return [false, 'seed не збігається'];
  if (seedRow.used_by && +seedRow.used_by !== +row.id) return [false, 'seed уже використано'];
  // схема, режим, формат і рік — ті самі, під які сервер видав seed (у старих seed полів може не бути)
  for (const k of ['formation', 'mode', 'format']) if (seedRow[k] != null && seedRow[k] !== '' && String(seedRow[k]) !== String(row[k])) return [false, `${k}: seed видано для «${seedRow[k]}»`];
  if (seedRow.year != null && +seedRow.year !== +row.year) return [false, `рік: seed видано для ${seedRow.year}`];
  if (!E.FORMATS[row.format]) return [false, 'невідомий формат'];
  if (!E.MODES[row.mode]) return [false, 'невідомий режим'];
  if (!yearOk(row, E, chalYearOk)) return [false, `суперники ${row.year} не для формату ${row.format}`];
  // епоха (0.58): seasons.era є, лише коли в базі з'явиться колонка; тоді всі клуб-сезони складу мають бути не раніше її початку
  const era = row.era == null || row.era === 'all' ? null : E.ERAS && E.ERAS[row.era];
  if (row.era != null && row.era !== 'all' && !era) return [false, `невідома епоха ${row.era}`];
  if (era && row.day) return [false, 'виклик дня — без епохи'];
  const xi = row.xi || [];
  if (xi.length !== 11) return [false, 'не 11 гравців'];
  if (xiHash(xi) !== seedRow.xi_hash) return [false, 'склад змінено після видачі seed'];
  const F = E.FORMATIONS[row.formation]; if (!F) return [false, 'невідома схема'];
  if (F.slots.join() !== xi.map(x => x.slot).join()) return [false, 'позиції не відповідають схемі'];
  const canon = id => (E.DATA.alias && E.DATA.alias[id]) || id;   // одна людина під двома id (data/aliases) — теж «двічі»
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
    if (x.r0 != null && +x.r0 !== p[2]) return [false, `базовий рейтинг ${x.n}: ${x.r0} ≠ ${p[2]}`];   // r0 показують таблиці й картка
    if (row.format === 'derby' && !E.FORMATS.derby.clubs.includes(club.c)) return [false, 'дербі: чужий клуб'];
    if (row.format === 'oneclub' && row.club && club.c !== row.club) return [false, 'один клуб: чужий клуб'];
    if (row.format === 'anti' && p[3] < E.ANTI_MIN_APPS) return [false, 'антисезон: замало матчів'];
    if (era && club.y < era.y0) return [false, `епоха «${era.name}»: ${x.c} ${x.y}`];
  }
  if (row.day) {   // виклик дня: та сама схема, суперники й колесо
    const d = E.dailySetupFor(String(row.day).slice(0, 10));
    if (d.formation !== row.formation || d.year !== +row.year) return [false, 'не той виклик дня'];
    const inSeq = new Set(d.seq.slice(0, 400));
    const onWheel = xi.filter(x => { const i = E.DATA.clubs.findIndex(c => c.n === x.c && c.y === +x.y); return inSeq.has(i); }).length;
    if (onWheel < 10) return [false, `колесо дня: лише ${onWheel} з 11 клуб-сезонів`];   // 1 перекручування дозволено
  }
  if (row.perfect != null && !!row.perfect !== (+row.w === 30)) return [false, 'позначка 30-0 не відповідає результату'];
  const sim = E.run({ xi: xi.map(x => ({ id: x.id, name: x.n, slot: x.slot, pos: E.GROUP_OF[x.slot], r: +x.r })), mode: row.mode, format: row.format, year: +row.year, seed: +row.seed });
  const same = sim.W === row.w && sim.D === row.d && sim.L === row.l && sim.gf === row.gf && sim.ga === row.ga && sim.place === row.place && (row.pts == null || sim.pts === row.pts);
  return same ? [true, 'ok'] : [false, `перерахунок: ${sim.W}-${sim.D}-${sim.L} ${sim.gf}:${sim.ga} #${sim.place}`];
}

// результат виклику дня пише сам сервер — з перевіреного сезону (цифри з браузера в daily_results не довіряємо).
// Лише перша офіційна спроба дня (seed official) і лише сезон, якому цей seed віддано (used_by).
// Рядок уже є (браузер вставив його кнопкою «Надіслати») — переписуємо цифри й ставимо verified; немає — вставляємо сами.
async function syncDaily(row, seedRow) {
  if (!row.day || row.verified !== true || row.practice || !seedRow || !seedRow.official || +seedRow.used_by !== +row.id) return false;
  const day = String(row.day).slice(0, 10), dev = encodeURIComponent(String(row.device_id));
  const res = { w: row.w, d: row.d, l: row.l, pts: row.w * 3 + row.d, gf: row.gf, ga: row.ga, place: row.place, formation: row.formation, xp: row.xp == null ? null : +row.xp,
    xi: (row.xi || []).map(x => [x.n, x.slot, x.r, x.c, x.y]), verified: true };
  // табло ліг групи: результат, надісланий до того, як браузер дізнався номер сезону, прив'язуємо до цього сезону
  if (row.tg_user_id) await sb(`league_results?day=eq.${day}&tg_user_id=eq.${+row.tg_user_id}&season_id=is.null`, { method: 'PATCH', prefer: 'return=minimal', body: { season_id: row.id } });
  const upd = await sb(`daily_results?day=eq.${day}&device_id=eq.${dev}`, { method: 'PATCH', prefer: 'return=representation', body: res });
  if (upd && upd.length) return true;
  let nick = Array.from(String(row.nickname || row.tg_name || '').trim()).slice(0, 24).join('').trim();   if (Array.from(nick).length < 2) nick = 'Гравець';   // основна база: char_length 2–24
  const ins = { day, device_id: row.device_id, nickname: nick, ...res };
  if (row.tg_user_id) { ins.tg_user_id = row.tg_user_id; ins.tg_name = row.tg_name || null; }
  await sb('daily_results?on_conflict=day,device_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: ins });
  return true;
}

// 0.61: сезон зіграно як спробу ліги з друзями (seasons.fl_id) — після перевірки зараховуємо (fl_record у базі: правила ліги, ліміт спроб).
// SQL 0.61 ще не виконано або спробу не зараховано — сезон однаково перевірено, повертаємо fl = null
async function flRecord(row, id) {
  if (!row.fl_id) return undefined;
  try { const n = await sb('rpc/fl_record', { method: 'POST', body: { p_season: id } }); return n == null ? null : +n; } catch (e) { return null; }
}
// перевірка сезону за номером (спільна для /api/verify і /api/save): {verified, note, cached?, fl?}
async function verifyById(id) {
  const [row] = await sb(`seasons?id=eq.${id}&select=*`) || [];
  if (!row) return { status: 404, error: 'no season' };
  const [seedRow] = row.seed_id ? (await sb(`season_seeds?id=eq.${encodeURIComponent(row.seed_id)}&select=*`) || []) : [];
  if (row.verified !== null && row.verified !== undefined) {
    if (row.verified === true) await syncDaily(row, seedRow);   // повторний виклик — пишемо перевірені цифри дня ще раз
    const fl = row.verified === true ? await flRecord(row, id) : undefined;
    return { verified: row.verified, note: row.verify_note, cached: true, fl };
  }
  let chalYearOk = false;
  if (row.format === 'classic' && !row.day && row.year != null && Number.isInteger(+row.year) && engine().YEARS16.includes(+row.year)) {
    const ch = await sb(`challenges?year=eq.${+row.year}&formation=eq.${encodeURIComponent(String(row.formation || ''))}&select=id&limit=1`) || [];
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

// POST {season_id}: сайт 0.52 (записав сезон сам) і повторна перевірка. З 0.53 сезон пише й одразу перевіряє /api/save.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    let b = req.body || {}; if (typeof b === 'string') b = JSON.parse(b);
    const id = +b.season_id; if (!id) return res.status(400).json({ error: 'season_id?' });
    if (await rateLimit(req, res, 'verify')) return;   // за IP (0.55)
    const r = await verifyById(id);
    if (r.status) return res.status(r.status).json({ error: r.error });
    res.status(200).json(r);
  } catch (e) {
    res.status(500).json({ error: `crash: ${String(e && e.message || e).slice(0, 160)}` });
  }
};
module.exports.verifyById = verifyById;
