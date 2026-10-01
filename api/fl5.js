// 30-0 УПЛ — турнір ліги 5×5 (0.63, адреса /api/fl5). POST {id}: якщо збір складів закінчився, а турнір ще не зіграно — сервер
// перевіряє склади за пулом гри (гравець справді є в цьому клуб-сезоні, лінія збігається зі схемою, епоха ліги, без повторів),
// розігрує весь турнір рушієм src/five_core.js із seed ліги (однаково для всіх, перевірно) і зберігає (fl5_store — лише сервер, один раз).
// Відповідь — ліга (fl_get). Складів менше 2 — ліга скасовується (result.cancelled). Змінні: SUPABASE_SERVICE_KEY (+ SUPABASE_URL у тесті).
const { sb, body, rateLimit } = require('./_device.js');
const E = require('../lib/engine.js');
const C = require('../src/five_core.js');

const canon = id => (E.DATA.alias && E.DATA.alias[id]) || id;
const lineOf = p => E.GROUP_OF[p[6]] || p[1];   // лінія гравця для 5×5: GK / DF / MF / FW
// склад → команда для рушія або null (не пройшов перевірку)
function team(f, era) {
  const form = C.F5_FORMS[f.form]; if (!form || !Array.isArray(f.xi) || f.xi.length !== 5) return null;
  const need = form.rows.flat().sort().join(), y0 = (E.ERAS[era] || {}).y0 || 0, seen = new Set(), slots = [];
  for (const x of f.xi) {
    const cl = E.DATA.clubs.find(c => c.c === x.c && c.y === Number(x.y)); if (!cl || cl.y < y0) return null;
    const p = cl.pl.find(q => q[5] === x.id); if (!p || lineOf(p) !== x.slot || seen.has(canon(p[5]))) return null;
    seen.add(canon(p[5]));
    slots.push({ slot: x.slot, player: { id: p[5], name: p[0], slot: x.slot, r: p[2], goals: p[4] } });
  }
  if (slots.map(s => s.slot).sort().join() !== need) return null;
  const order = form.rows.flat(); slots.sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
  return { label: f.name, u: f.u, form: f.form, slots };
}
async function play(L) {
  const fives = L.fives || [], teams = [], bad = [];
  for (const f of fives) { const t = team(f, L.era); if (t) teams.push(t); else bad.push(f.u); }
  const seed = E.hashStr(`${L.id}|${L.deadline}`) >>> 0;
  const res = teams.length < 2 ? { v: 1, cancelled: true, n: teams.length } : C.f5Tournament(teams, E.mulberry32(seed));
  res.seed = seed; res.teams = teams.map(t => ({ u: t.u, name: t.label, form: t.form })); res.bad = bad;
  return res;
}
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let b; try { b = body(req); } catch (e) { return res.status(400).json({ error: 'json?' }); }
  const id = String(b.id || '').toLowerCase(); if (!/^[a-z2-9]{6}$/.test(id)) return res.status(400).json({ error: 'id?' });
  if (await rateLimit(req, res, 'fl5', b.device_id)) return;
  try {
    let L = await sb('rpc/fl_get', { method: 'POST', body: { p_id: id } });
    if (!L) return res.status(404).json({ error: 'fl_none' });
    if (L.fmt === '5' && !L.result && L.deadline && new Date(L.deadline) <= new Date()) {
      await sb('rpc/fl5_store', { method: 'POST', body: { p_id: id, p_result: await play(L) } });
      L = await sb('rpc/fl_get', { method: 'POST', body: { p_id: id } });
    }
    return res.status(200).json(L);
  } catch (e) { console.warn('fl5', e.message); return res.status(500).json({ error: 'db' }); }
};
module.exports.play = play;   // для тесту
