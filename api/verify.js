// 30-0 УПЛ — перевірка сезону (адреса /api/verify)
// POST {season_id}: сервер бере запис сезону з журналу, перевіряє seed, склад, рейтинги й правила формату
// і перераховує сезон тим самим рушієм, що й гра (lib/engine.js). Результат: seasons.verified = true/false.
const crypto = require('crypto');
const SB_URL = (process.env.SUPABASE_URL || 'https://qruhcbwycrnfgzzdbljr.supabase.co').trim();   // у тестовому оточенні Vercel — адреса тестової бази
const env = k => String(process.env[k] || '').replace(/\s+/g, '');
async function sb(path, { method = 'GET', body, prefer } = {}) {
  const key = env('SUPABASE_SERVICE_KEY');
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
  if (!r.ok) throw new Error(`db ${r.status}: ${t.slice(0, 150)}`);
  return j;
}
const xiHash = xi => crypto.createHash('sha256').update(xi.map(x => `${x.id}|${x.slot}|${x.c}|${x.y}`).join(';')).digest('hex');
let E = null;
function engine() { if (!E) E = require('../lib/engine.js'); return E; }

// головна перевірка: повертає [true|false|null, пояснення]; null — перевірити неможливо (стара версія тощо)
function check(row, seedRow) {
  const E = engine();
  if (row.version && row.version !== E.VERSION) return [null, `версія гри ${row.version} ≠ рушій ${E.VERSION}`];
  if (!seedRow) return [false, 'seed не видавався сервером'];
  if (String(seedRow.device_id) !== String(row.device_id)) return [false, 'seed іншого пристрою'];
  if (+seedRow.seed !== +row.seed) return [false, 'seed не збігається'];
  if (seedRow.used_by && +seedRow.used_by !== +row.id) return [false, 'seed уже використано'];
  const xi = row.xi || [];
  if (xi.length !== 11) return [false, 'не 11 гравців'];
  if (xiHash(xi) !== seedRow.xi_hash) return [false, 'склад змінено після видачі seed'];
  const F = E.FORMATIONS[row.formation]; if (!F) return [false, 'невідома схема'];
  if (F.slots.join() !== xi.map(x => x.slot).join()) return [false, 'позиції не відповідають схемі'];
  if (new Set(xi.map(x => x.id)).size !== 11) return [false, 'гравець двічі'];
  E.setFormat(row.format);
  for (const x of xi) {
    const club = E.DATA.clubs.find(c => c.n === x.c && c.y === +x.y);
    if (!club) return [false, `немає клуб-сезону ${x.c} ${x.y}`];
    const p = club.pl.find(q => q[5] === x.id);
    if (!p) return [false, `${x.n} не грав за ${x.c} ${x.y}`];
    const r = E.effRating(p, x.slot);
    if (r == null) return [false, `${x.n} не може грати на ${x.slot}`];
    if (r !== +x.r) return [false, `рейтинг ${x.n}: ${x.r} ≠ ${r}`];
    if (row.format === 'derby' && !E.FORMATS.derby.clubs.includes(club.c)) return [false, 'дербі: чужий клуб'];
    if (row.format === 'oneclub' && row.club && club.c !== row.club) return [false, 'один клуб: чужий клуб'];
    if (row.format === 'anti' && p[3] < E.ANTI_MIN_APPS) return [false, 'антисезон: замало матчів'];
  }
  if (row.day) {   // виклик дня: та сама схема, суперники й колесо
    const d = E.dailySetupFor(String(row.day).slice(0, 10));
    if (d.formation !== row.formation || d.year !== +row.year) return [false, 'не той виклик дня'];
    const inSeq = new Set(d.seq.slice(0, 400));
    const onWheel = xi.filter(x => { const i = E.DATA.clubs.findIndex(c => c.n === x.c && c.y === +x.y); return inSeq.has(i); }).length;
    if (onWheel < 10) return [false, `колесо дня: лише ${onWheel} з 11 клуб-сезонів`];   // 1 перекручування дозволено
  }
  const sim = E.run({ xi: xi.map(x => ({ id: x.id, name: x.n, slot: x.slot, pos: E.GROUP_OF[x.slot], r: +x.r })), mode: row.mode, format: row.format, year: +row.year, seed: +row.seed });
  const same = sim.W === row.w && sim.D === row.d && sim.L === row.l && sim.gf === row.gf && sim.ga === row.ga && sim.place === row.place;
  return same ? [true, 'ok'] : [false, `перерахунок: ${sim.W}-${sim.D}-${sim.L} ${sim.gf}:${sim.ga} #${sim.place}`];
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let stage = 'body';
  try {
    let b = req.body || {}; if (typeof b === 'string') b = JSON.parse(b);
    const id = +b.season_id; if (!id) return res.status(400).json({ error: 'season_id?' });
    stage = 'load';
    const [row] = await sb(`seasons?id=eq.${id}&select=*`) || [];
    if (!row) return res.status(404).json({ error: 'no season' });
    const [seedRow] = row.seed_id ? (await sb(`season_seeds?id=eq.${row.seed_id}&select=*`) || []) : [];
    const markDaily = async () => { if (row.day && seedRow && seedRow.official) await sb(`daily_results?day=eq.${String(row.day).slice(0, 10)}&device_id=eq.${row.device_id}`, { method: 'PATCH', prefer: 'return=minimal', body: { verified: true } }); };
    if (row.verified !== null && row.verified !== undefined) { if (row.verified === true) await markDaily(); return res.status(200).json({ verified: row.verified, note: row.verify_note, cached: true }); }
    stage = 'engine';
    let v, note;
    try { [v, note] = check(row, seedRow); } catch (e) { v = null; note = 'рушій недоступний: ' + String(e.message || e).slice(0, 80); }
    stage = 'save';
    await sb(`seasons?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: { verified: v, verify_note: String(note).slice(0, 200) } });
    if (v === true && seedRow) {
      await sb(`season_seeds?id=eq.${seedRow.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { used_by: id } });
      await markDaily();
    }
    res.status(200).json({ verified: v, note });
  } catch (e) {
    res.status(500).json({ error: `crash at ${stage}: ${String(e && e.message || e).slice(0, 160)}` });
  }
};
