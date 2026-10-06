// 30-0 UPL: evening daily summary for leagues (Vercel Cron from vercel.json at 18:00 UTC: 21:00 Kyiv in summer, 20:00 in winter)
// Posts to a group once per day and only if someone played. Repeated calls send nothing.
// Vercel env: CRON_SECRET (required, else 401).
const L = require('./_league.js');
const C = require('./_channel.js');   // channel post queue
const N = require('./_notify.js');   // opt-in evening notifications to players
const { plUk } = require('./_lib.js');
const { errDigest } = require('./_errdigest.js');   // errors digest
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && require('crypto').timingSafeEqual(x, y); };

module.exports = async (req, res) => {
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" itself when CRON_SECRET is set in Vercel.
  // Missing env var or wrong key -> 401. Manual runs need the same header.
  const cronSecret = L.env('CRON_SECRET');
  const auth = String((req.headers && req.headers.authorization) || '');
  const okBy = sec => !!sec && safeEq(auth, `Bearer ${sec}`);
  // ?task=channel: channel queue only (every ~10 min from GitHub Actions, .github/workflows/channel.yml); key: CHANNEL_SECRET or CRON_SECRET
  if (req.query && req.query.task === 'channel') {
    if (!okBy(cronSecret) && !okBy(L.env('CHANNEL_SECRET'))) return res.status(401).json({ error: 'unauthorized' });
    try { return res.status(200).json({ ok: true, channel: await C.runChannel() }); } catch (e) { return res.status(500).json({ error: String(e && e.message || e).slice(0, 200) }); }
  }
  if (!okBy(cronSecret)) return res.status(401).json({ error: 'unauthorized' });
  try {
    const day = (req.query && /^\d{4}-\d{2}-\d{2}$/.test(req.query.day || '')) ? req.query.day : L.kyivDate();
    const rows = await L.sb(`league_results?day=eq.${day}&select=chat_id`) || [];
    const chats = [...new Set(rows.map(r => r.chat_id))];
    const done = [];
    for (const chat_id of chats) {
      const [b] = await L.sb(`league_boards?chat_id=eq.${chat_id}&day=eq.${day}&select=summary_sent`) || [];
      if (b && b.summary_sent) continue;
      const [lg] = await L.sb(`leagues?chat_id=eq.${chat_id}&select=title`) || [];
      const list = (await L.onlyVerified(await L.sb(`league_results?chat_id=eq.${chat_id}&day=eq.${day}&select=*`) || [])).sort(L.sortRes);
      if (!list.length) continue;
      const st = await L.standings(chat_id);
      const win = list[0], ws = st.find(s => s.name === win.name);
      const medal = ['🥇', '🥈', '🥉'];
      // keep messages short: no trophies and no "new wheel tomorrow" line
      let t = `<b>🌙 Підсумок дня №${L.dayNo(day)} — ліга «${L.esc(lg ? lg.title : '')}»</b>\n\n`;
      t += list.map((r, i) => `${medal[i] || (i + 1) + '.'} ${L.esc(r.name)} — <b>${r.pts}</b> (${r.w}-${r.d}-${r.l}, ${r.gf}:${r.ga})`).join('\n');
      t += `\n\n👑 Переможець дня: <b>${L.esc(win.name)}</b>${ws && ws.wins > 1 ? ` (уже ${ws.wins}-й раз)` : ''}`;
      if (st.length > 1) t += `\n\n<b>Залік ліги</b> (перемоги в днях): ` + st.slice(0, 8).map(s => `${L.esc(s.name)} ${s.wins}`).join(' · ');
      await L.tg('sendMessage', { chat_id, text: t, parse_mode: 'HTML', reply_markup: L.playKb(chat_id), disable_web_page_preview: true });
      await L.sb('league_boards?on_conflict=chat_id,day', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id, day, summary_sent: true } });
      done.push(chat_id);
    }
    // Sunday weekly summary (Mon-Sun, Kyiv): points total and day wins
    const weekly = [];
    const wd = (new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10))).getUTCDay() + 6) % 7;
    if (wd === 6 || (req.query && req.query.week === '1')) {
      const add = (d, n) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + n * 864e5).toISOString().slice(0, 10);
      const from = add(day, -wd);
      const wrows = await L.onlyVerified(await L.sb(`league_results?day=gte.${from}&day=lte.${day}&select=chat_id,day,tg_user_id,name,pts,gf,ga,created_at,season_id`) || []);
      const byChat = {}; for (const r of wrows) (byChat[r.chat_id] = byChat[r.chat_id] || []).push(r);
      for (const [chat_id, rows] of Object.entries(byChat)) {
        const [b] = await L.sb(`league_boards?chat_id=eq.${chat_id}&day=eq.${day}&select=weekly_sent`) || [];
        if (b && b.weekly_sent) continue;
        const [lg] = await L.sb(`leagues?chat_id=eq.${chat_id}&select=title`) || [];
        const byDay = {}; for (const r of rows) (byDay[r.day] = byDay[r.day] || []).push(r);
        const st = {};
        for (const list of Object.values(byDay)) { list.sort(L.sortRes); list.forEach((r, i) => { const s = st[r.tg_user_id] || (st[r.tg_user_id] = { name: r.name, pts: 0, days: 0, wins: 0 }); s.pts += r.pts; s.days++; s.name = r.name; if (i === 0) s.wins++; }); }
        const tab = Object.values(st).sort((a, b) => b.pts - a.pts || b.wins - a.wins);
        const medal = ['🥇', '🥈', '🥉'];
        // league created mid-week: period starts from its first day, not Monday
        const first = rows.reduce((m, r) => (String(r.day) < m ? String(r.day) : m), day);
        let t = `<b>📅 Підсумок тижня ${L.dayShort(first)}–${L.dayShort(day)} — ліга «${L.esc(lg ? lg.title : '')}»</b>\n(сума очків за всі виклики тижня)\n\n`;
        t += tab.map((s, i) => `${medal[i] || (i + 1) + '.'} ${L.esc(s.name)} — <b>${s.pts}</b> за ${s.days} ${plUk(s.days, 'день', 'дні', 'днів')}${s.wins ? `, перемог: ${s.wins}` : ''}`).join('\n');
        t += `\n\n🏅 Гравець тижня: <b>${L.esc(tab[0].name)}</b>`;
        await L.tg('sendMessage', { chat_id, text: t, parse_mode: 'HTML', reply_markup: L.playKb(chat_id), disable_web_page_preview: true });
        await L.sb('league_boards?on_conflict=chat_id,day', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id, day, weekly_sent: true } });
        weekly.push(chat_id);
      }
    }
    // opt-in evening notifications (one message per player): after the group summaries; failure doesn't break them
    let notify = null;
    try { notify = await N.sendEvening(day); } catch (e) { notify = { error: String(e && e.message || e).slice(0, 120) }; }
    // channel queue: daily fallback run (primary is GitHub Actions); failure doesn't break league summaries
    let channel = null;
    try { channel = await C.runChannel(); } catch (e) { channel = { error: String(e && e.message || e).slice(0, 120) }; }
    // player errors digest to admin (api/_errdigest.js); failure doesn't break league summaries
    let errs = null;
    try { errs = await errDigest({ sb: L.sb, tg: L.tg, env: L.env, day }); } catch (e) { errs = { error: String(e && e.message || e).slice(0, 120) }; }
    res.status(200).json({ ok: true, day, summaries: done.length, weekly: weekly.length, errs, channel, notify });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e).slice(0, 200) });
  }
};
