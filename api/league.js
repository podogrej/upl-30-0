// 30-0 UPL: Telegram group leagues (/api/league)
// POST {initData}: verifies the Telegram signature and adds the player to the group league (if the game was opened from the group button),
//   copying today's best free-play season in. Joining only if the bot sees the player as a group member (getChatMember).
//   Results are written by the server when it verifies a season (api/_league.js creditSeason); a browser "result" is ignored.
// GET ?chat=ID[&card=1]: league data (today and standings); card=1: today and counters only (home card of tabs before 0.79).
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

// player joined a league: today's best counted free-play season goes in (devices of the player linked to this Telegram id)
async function backfill(chat_id, u, name) {
  const day = L.kyivDate();
  const [lk] = await L.sb(`player_links?kind=eq.tg&key=eq.${u.id}&select=player_id`) || [];
  if (!lk || !lk.player_id) return false;
  const best = await L.dayBest(await L.devicesOf(lk.player_id), day);
  const changed = await L.putBest(best, day, [{ chat_id, tg_user_id: u.id, name }]);
  if (!changed.length) return false;
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
      // audit V1: may join only a league of a group where the bot sees the player as a member (getChatMember). Otherwise 403.
      // League lookup and membership check run in parallel; membership is still required to join.
      const [[lg], mem0] = await Promise.all([L.sb(`leagues?chat_id=eq.${chat_id}&select=chat_id,title`).then(x => x || []), isMember(chat_id, u.id)]);
      const mem = lg ? mem0 : false;
      let chat_to = chat_id;
      if (mem && mem.moved) { chat_to = mem.moved; }   // league moved to the supergroup id
      if (lg && !(mem && (mem.moved ? mem.ok : mem))) return res.status(403).json({ error: 'not a member of this chat' });
      if (lg) {
        await L.sb('league_members?on_conflict=chat_id,tg_user_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id: chat_to, tg_user_id: u.id, name } });
        const j = { chat_id: chat_to, title: lg.title };
        joined.push(j);
        stage = 'backfill';
        try { if (await backfill(chat_to, u, name)) j.backfilled = true; } catch (e) { console.error('backfill', chat_to, e.message); }
      }
    }
    // clients before 0.79 also sent the daily draft result here: chat leagues no longer take it (posted stays empty)
    res.status(200).json({ ok: true, joined, posted: [] });
  } catch (e) {
    res.status(500).json({ error: `crash at ${stage}: ${String(e && e.message || e).slice(0, 180)}` });
  }
};
