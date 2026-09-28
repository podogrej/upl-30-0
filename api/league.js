// 30-0 УПЛ — ліги груп Telegram (адреса /api/league)
// POST {initData, result?}: перевіряє підпис Telegram, додає гравця в лігу групи (якщо гру відкрито з кнопки групи)
//   і записує офіційний результат виклику дня в усі його ліги, оновлюючи табло в чатах.
// GET ?chat=ID: дані ліги для картки в грі.
const L = require('./_lib');

module.exports = async (req, res) => {
  let stage = 'start';
  try {
    if (req.method === 'GET') {
      const chat = String(req.query.chat || '').replace(/[^0-9-]/g, '');
      if (!chat) return res.status(400).json({ error: 'chat?' });
      const [lg] = await L.sb(`leagues?chat_id=eq.${chat}&select=title`) || [];
      if (!lg) return res.status(404).json({ error: 'no league' });
      const day = L.kyivDate();
      const today = (await L.sb(`league_results?chat_id=eq.${chat}&day=eq.${day}&select=name,w,d,l,pts,gf,ga,created_at`) || []).sort(L.sortRes);
      const members = (await L.sb(`league_members?chat_id=eq.${chat}&select=tg_user_id`) || []).length;
      return res.status(200).json({ title: lg.title, day, today, members, standings: (await L.standings(chat)).slice(0, 10) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
    let b = req.body || {}; if (typeof b === 'string') b = JSON.parse(b);
    stage = 'signature';
    const v = L.checkMiniApp(b.initData);
    if (!v) return res.status(401).json({ error: 'bad telegram signature' });
    const u = v.user, name = L.nameOf(u);
    const joined = [];
    // гру відкрито з кнопки групи → вступаємо в лігу цієї групи
    stage = 'join';
    const m = /^g(-?\d+)$/.exec(v.start_param || '');
    if (m) {
      const chat_id = m[1];
      const [lg] = await L.sb(`leagues?chat_id=eq.${chat_id}&select=chat_id,title`) || [];
      if (lg) {
        await L.sb('league_members?on_conflict=chat_id,tg_user_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id, tg_user_id: u.id, name } });
        joined.push({ chat_id, title: lg.title });
      }
    }
    const r = b.result;
    if (!r) return res.status(200).json({ ok: true, joined });
    // перевірка результату
    stage = 'result';
    const n = k => Number.isFinite(+r[k]) ? Math.round(+r[k]) : null;
    const w = n('w'), d = n('d'), l = n('l'), pts = n('pts'), gf = n('gf'), ga = n('ga'), place = n('place');
    if (w + d + l !== 30 || pts !== w * 3 + d || !(place >= 1 && place <= 16)) return res.status(400).json({ error: 'bad result' });
    const today = L.kyivDate(), yday = L.kyivDate(new Date(Date.now() - 864e5));
    const day = r.day === yday ? yday : today;
    const trophies = Array.isArray(r.trophies) ? r.trophies.slice(0, 12).map(x => String(x).slice(0, 40)) : [];
    stage = 'leagues';
    const my = await L.sb(`league_members?tg_user_id=eq.${u.id}&select=chat_id,leagues(title)`) || [];
    const posted = [];
    for (const row of my) {
      // лише перша офіційна спроба дня
      await L.sb('league_results?on_conflict=chat_id,day,tg_user_id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
        body: { chat_id: row.chat_id, day, tg_user_id: u.id, name, w, d, l, pts, place, gf, ga, xp: +r.xp || null, formation: String(r.formation || '').slice(0, 8), trophies, season_id: +r.season_id || null } });
      try { await L.upsertBoard(row.chat_id, day); } catch (e) { console.error('board', row.chat_id, e.message); }
      posted.push(row.leagues ? row.leagues.title : String(row.chat_id));
    }
    res.status(200).json({ ok: true, joined, posted });
  } catch (e) {
    res.status(500).json({ error: `crash at ${stage}: ${String(e && e.message || e).slice(0, 180)}` });
  }
};
