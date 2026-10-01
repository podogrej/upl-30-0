// 30-0 УПЛ — ліги груп Telegram (адреса /api/league)
// POST {initData, result?}: перевіряє підпис Telegram, додає гравця в лігу групи (якщо гру відкрито з кнопки групи)
//   і записує офіційний результат драфту дня в усі його ліги, оновлюючи табло в чатах.
//   Вступ — лише якщо бот бачить гравця учасником групи (getChatMember, з 0.55), у табло — лише перевірені сезони (з 0.52).
// GET ?chat=ID: дані ліги для картки в грі.
const L = require('./_league.js');   // спільні функції ліг груп (0.60: одна копія замість трьох)
// чи є користувач учасником групи (бот має бути в групі). Помилка Telegram — «ні» (закрито за замовчуванням)
const MEMBER = new Set(['member', 'administrator', 'creator']);
async function isMember(chat_id, user_id) {
  try {
    const r = await L.tg('getChatMember', { chat_id, user_id });
    const st = r && r.ok && r.result ? r.result.status : null;
    return MEMBER.has(st) || (st === 'restricted' && r.result.is_member !== false);
  } catch (e) { return false; }
}

module.exports = async (req, res) => {
  let stage = 'start';
  try {
    if (req.method === 'GET') {
      const chat = String(req.query.chat || '').replace(/[^0-9-]/g, '');
      if (!chat) return res.status(400).json({ error: 'chat?' });
      const day = L.kyivDate();
      // 0.67 (власник: табло на головній вантажиться довго): усі запити разом, а не один за одним; відповідь кешує Vercel на 15 с
      const [[lg], todayRows, memberRows, st] = await Promise.all([
        L.sb(`leagues?chat_id=eq.${chat}&select=title`).then(x => x || []),
        L.sb(`league_results?chat_id=eq.${chat}&day=eq.${day}&select=name,w,d,l,pts,gf,ga,created_at,day,tg_user_id,season_id`).then(x => L.onlyVerified(x || [])),
        L.sb(`league_members?chat_id=eq.${chat}&select=tg_user_id`).then(x => x || []),
        L.standings(chat)]);
      if (!lg) return res.status(404).json({ error: 'no league' });
      const today = todayRows.sort(L.sortRes).map(({ name, u, w, d, l, pts, gf, ga, created_at }) => ({ name, u, w, d, l, pts, gf, ga, created_at }));
      res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
      return res.status(200).json({ title: lg.title, day, today, members: memberRows.length, standings: st.slice(0, 10) });
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
      // В1 (0.55): вступити можна лише в лігу групи, де бот бачить гравця учасником (getChatMember). Інакше — 403
      // (з результатом у запиті — вступ пропускаємо, результат іде лише в ліги, де гравець уже є).
      if (lg && !(await isMember(chat_id, u.id))) {
        if (!b.result) return res.status(403).json({ error: 'not a member of this chat' });
        lg.denied = true;
      }
      if (lg && !lg.denied) {
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
    // сезон цього результату: з браузера (season_id) або перша не-тренувальна спроба дня цього гравця Telegram.
    // У табло потрапить лише тоді, коли сервер перевірить цей сезон (L.onlyVerified).
    stage = 'season';
    let season_id = +r.season_id || null;
    if (!season_id) { const [s] = await L.sb(`seasons?tg_user_id=eq.${u.id}&day=eq.${day}&practice=is.false&select=id&order=created_at.asc&limit=1`) || []; season_id = s ? s.id : null; }
    stage = 'leagues';
    const my = await L.sb(`league_members?tg_user_id=eq.${u.id}&select=chat_id,leagues(title)`) || [];
    const posted = [];
    for (const row of my) {
      // лише перша офіційна спроба дня
      await L.sb('league_results?on_conflict=chat_id,day,tg_user_id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
        body: { chat_id: row.chat_id, day, tg_user_id: u.id, name, w, d, l, pts, place, gf, ga, xp: +r.xp || null, formation: String(r.formation || '').slice(0, 8), trophies, season_id } });
      try { await L.upsertBoard(row.chat_id, day); } catch (e) { console.error('board', row.chat_id, e.message); }
      posted.push(row.leagues ? row.leagues.title : String(row.chat_id));
    }
    res.status(200).json({ ok: true, joined, posted });
  } catch (e) {
    res.status(500).json({ error: `crash at ${stage}: ${String(e && e.message || e).slice(0, 180)}` });
  }
};
