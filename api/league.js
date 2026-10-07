// 30-0 UPL: Telegram group leagues (/api/league)
// POST {initData, result?}: verifies the Telegram signature, adds the player to the group league (if the game was opened from the group button)
//   and records the official daily draft result in all their leagues, updating boards in chats.
//   Joining only if the bot sees the player as a group member (getChatMember); boards show only verified seasons.
// GET ?chat=ID[&card=1]: league data for the full table; card=1: home card only (today and counters, no standings).
const L = require('./_league.js');   // shared group league helpers
// whether the user is a group member (bot must be in the group). Telegram error -> "no" (fail closed)
const MEMBER = new Set(['member', 'administrator', 'creator']);
async function isMember(chat_id, user_id) {
  try {
    const r = await L.tg('getChatMember', { chat_id, user_id });
    // group became a supergroup: old board button points to the old id; Telegram reports the new one
    const to = r && !r.ok && r.parameters && r.parameters.migrate_to_chat_id;
    if (to) { await L.migrateLeague(chat_id, to); return { moved: String(to), ok: await isMember(to, user_id) }; }
    const st = r && r.ok && r.result ? r.result.status : null;
    return MEMBER.has(st) || (st === 'restricted' && r.result.is_member !== false);
  } catch (e) { return false; }
}

// Telegram player's daily draft result for today -> league chat_id (first official attempt only, server-verified season only)
async function backfill(chat_id, u, name) {
  const day = L.kyivDate();
  const have = await L.sb(`league_results?chat_id=eq.${chat_id}&day=eq.${day}&tg_user_id=eq.${u.id}&select=chat_id`) || [];
  if (have.length) return false;
  const [lr] = await L.onlyVerified(await L.sb(`league_results?tg_user_id=eq.${u.id}&day=eq.${day}&select=*&order=created_at.asc&limit=1`) || []);
  let row = lr ? { w: lr.w, d: lr.d, l: lr.l, pts: lr.pts, place: lr.place, gf: lr.gf, ga: lr.ga, xp: lr.xp, formation: lr.formation, trophies: lr.trophies || [], season_id: lr.season_id } : null;
  if (!row) {   // no other leagues: first official attempt of the day from seasons (verified only)
    const [s] = await L.sb(`seasons?tg_user_id=eq.${u.id}&day=eq.${day}&practice=is.false&select=id,w,d,l,pts,place,gf,ga,formation,verified&order=created_at.asc&limit=1`) || [];
    if (!s || s.verified !== true) return false;
    row = { w: s.w, d: s.d, l: s.l, pts: s.pts, place: s.place, gf: s.gf, ga: s.ga, xp: null, formation: s.formation, trophies: [], season_id: s.id };
  }
  await L.sb('league_results?on_conflict=chat_id,day,tg_user_id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: { chat_id, day, tg_user_id: u.id, name, ...row } });
  try { await L.upsertBoard(chat_id, day); } catch (e) { console.error('board', chat_id, e.message); }
  return true;
}

module.exports = async (req, res) => {
  let stage = 'start';
  try {
    if (req.method === 'GET') {
      const chat = String(req.query.chat || '').replace(/[^0-9-]/g, '');
      if (!chat) return res.status(400).json({ error: 'chat?' });
      const day = L.kyivDate();
      // card=1: home card (today + counters, no standings history); otherwise all rows once for both today and standings
      const card = String(req.query.card || '') === '1';
      const [[lg], rows, memberRows] = await Promise.all([
        L.sb(`leagues?chat_id=eq.${chat}&select=title`).then(x => x || []),
        card ? L.sb(`league_results?chat_id=eq.${chat}&day=eq.${day}&select=${L.RES_COLS}`).then(x => L.onlyVerified(x || [])) : L.leagueRows(chat),
        L.sb(`league_members?chat_id=eq.${chat}&select=tg_user_id`).then(x => x || [])]);
      if (!lg) return res.status(404).json({ error: 'no league' });
      const today = rows.filter(r => String(r.day).slice(0, 10) === day).sort(L.sortRes).map(({ name, u, w, d, l, pts, gf, ga, created_at }) => ({ name, u, w, d, l, pts, gf, ga, created_at }));
      res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');
      const out = { title: lg.title, day, today, members: memberRows.length };
      if (!card) out.standings = L.standingsOf(rows).slice(0, 100);   // full standings for the "full table" sheet
      return res.status(200).json(out);
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
    let b = req.body || {}; if (typeof b === 'string') b = JSON.parse(b);
    stage = 'signature';
    const v = L.checkMiniApp(b.initData);
    if (!v) return res.status(401).json({ error: 'bad telegram signature' });
    const u = v.user, name = L.nameOf(u);
    const joined = [];
    // game opened from a group button -> join that group's league
    stage = 'join';
    const m = /^g(-?\d+)$/.exec(v.start_param || '');
    if (m) {
      const chat_id = m[1];
      // audit V1: may join only a league of a group where the bot sees the player as a member (getChatMember). Otherwise 403
      // (when the request carries a result, skip joining; the result goes only to leagues the player is already in).
      // League lookup and membership check run in parallel; membership is still required to join.
      const [[lg], mem0] = await Promise.all([L.sb(`leagues?chat_id=eq.${chat_id}&select=chat_id,title`).then(x => x || []), isMember(chat_id, u.id)]);
      const mem = lg ? mem0 : false;
      let chat_to = chat_id;
      if (mem && mem.moved) { chat_to = mem.moved; }   // league moved to the supergroup id
      if (lg && !(mem && (mem.moved ? mem.ok : mem))) {
        if (!b.result) return res.status(403).json({ error: 'not a member of this chat' });
        lg.denied = true;
      }
      if (lg && !lg.denied) {
        await L.sb('league_members?on_conflict=chat_id,tg_user_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id: chat_to, tg_user_id: u.id, name } });
        const j = { chat_id: chat_to, title: lg.title };
        joined.push(j);
        // player joined a new group's league after playing the daily draft (and can't replay):
        // copy today's verified daily result into this league too (from another league of theirs or from their season)
        if (!b.result) { stage = 'backfill'; try { if (await backfill(chat_to, u, name)) j.backfilled = true; } catch (e) { console.error('backfill', chat_to, e.message); } }
      }
    }
    const r = b.result;
    if (!r) return res.status(200).json({ ok: true, joined });
    // result validation
    stage = 'result';
    const n = k => Number.isFinite(+r[k]) ? Math.round(+r[k]) : null;
    const w = n('w'), d = n('d'), l = n('l'), pts = n('pts'), gf = n('gf'), ga = n('ga'), place = n('place');
    if (w + d + l !== 30 || pts !== w * 3 + d || !(place >= 1 && place <= 16)) return res.status(400).json({ error: 'bad result' });
    const today = L.kyivDate(), yday = L.kyivDate(new Date(Date.now() - 864e5));
    const day = r.day === yday ? yday : today;
    const trophies = Array.isArray(r.trophies) ? r.trophies.slice(0, 12).map(x => String(x).slice(0, 40)) : [];
    // season of this result: from the browser (season_id) or the player's first non-practice attempt of the day.
    // It appears on the board only once the server verifies the season (L.onlyVerified).
    stage = 'season';
    let season_id = +r.season_id || null;
    if (!season_id) { const [s] = await L.sb(`seasons?tg_user_id=eq.${u.id}&day=eq.${day}&practice=is.false&select=id&order=created_at.asc&limit=1`) || []; season_id = s ? s.id : null; }
    stage = 'leagues';
    const my = await L.sb(`league_members?tg_user_id=eq.${u.id}&select=chat_id,leagues(title)`) || [];
    // first official attempt of the day only; leagues are independent, so they are written in parallel
    const posted = await Promise.all(my.map(async row => {
      await L.sb('league_results?on_conflict=chat_id,day,tg_user_id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
        body: { chat_id: row.chat_id, day, tg_user_id: u.id, name, w, d, l, pts, place, gf, ga, xp: +r.xp || null, formation: String(r.formation || '').slice(0, 8), trophies, season_id } });
      try { await L.upsertBoard(row.chat_id, day); } catch (e) { console.error('board', row.chat_id, e.message); }
      return row.leagues ? row.leagues.title : String(row.chat_id);
    }));
    res.status(200).json({ ok: true, joined, posted });
  } catch (e) {
    res.status(500).json({ error: `crash at ${stage}: ${String(e && e.message || e).slice(0, 180)}` });
  }
};
