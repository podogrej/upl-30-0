// 30-0 UPL: evening daily summary for leagues (Vercel Cron from vercel.json at 18:00 UTC: 21:00 Kyiv in summer, 20:00 in winter)
// Posts to a group once per day and only if someone played. Repeated calls send nothing.
// Vercel env: CRON_SECRET (required, else 401).
const L = require('./_league.js');
const C = require('./_channel.js');   // channel post queue
const N = require('./_notify.js');   // opt-in evening notifications to players
const { plUk } = require('./_lib.js');
const D = require('./_device.js');   // per-IP rate limit for the database token
const { errDigest } = require('./_errdigest.js');   // errors digest
const MAX_LINES = 30;   // table lines per message (Telegram limit 4096 characters)
const more = n => n > 0 ? `\n…і ще ${n}` : '';
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && require('crypto').timingSafeEqual(x, y); };

module.exports = async (req, res) => {
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" itself when CRON_SECRET is set in Vercel.
  // Missing env var or wrong key -> 401. Manual runs need the same header.
  const cronSecret = L.env('CRON_SECRET');
  const auth = String((req.headers && req.headers.authorization) || '');
  const okBy = sec => !!sec && safeEq(auth, `Bearer ${sec}`);
  // ?task=channel: channel queue only (every 10 min from pg_cron, sql/v0912_channel_cron.sql); key: CHANNEL_SECRET, CRON_SECRET
  // or the database token (cron_token_ok, 64 hex chars), checked with the service key and rate limited per IP
  if (req.query && req.query.task === 'channel') {
    const tok = /^Bearer ([0-9a-f]{64})$/.exec(auth);
    const dbOk = async () => !!tok && !(await D.rateLimit(req, res, 'cron')) && (await L.sb('rpc/cron_token_ok', { method: 'POST', body: { p_token: tok[1] } }).catch(e => { console.error('cron token:', String(e && e.message || e).slice(0, 200)); return false; })) === true;
    if (!okBy(cronSecret) && !okBy(L.env('CHANNEL_SECRET')) && !(await dbOk())) return res.headersSent ? undefined : res.status(401).json({ error: 'unauthorized' });
    try { return res.status(200).json({ ok: true, channel: await C.runChannel() }); } catch (e) { return res.status(500).json({ error: String(e && e.message || e).slice(0, 200) }); }
  }
  if (!okBy(cronSecret)) return res.status(401).json({ error: 'unauthorized' });
  try {
    const day = (req.query && /^\d{4}-\d{2}-\d{2}$/.test(req.query.day || '')) ? req.query.day : L.kyivDate();
    const rows = await L.sbAll(`league_results?day=eq.${day}&select=chat_id&order=chat_id.asc,tg_user_id.asc`);
    const chats = [...new Set(rows.map(r => r.chat_id))];
    const done = [];
    const add = (d, n) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + n * 864e5).toISOString().slice(0, 10);
    // Sunday weekly summary (Mon-Sun, Kyiv): points total and day wins. Rows are read up front so boards and titles of all chats come in one batch
    const wd = (new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10))).getUTCDay() + 6) % 7;
    const isWeek = wd === 6 || (req.query && req.query.week === '1');
    const byChat = {}; let weekErr = null;
    if (isWeek) {
      try {
        const wrows = await L.onlyVerified(await L.sbAll(`league_results?day=gte.${add(day, -wd)}&day=lte.${day}&select=chat_id,day,tg_user_id,name,pts,gf,ga,created_at,season_id&order=day.asc,chat_id.asc,tg_user_id.asc`));
        for (const r of wrows) (byChat[r.chat_id] = byChat[r.chat_id] || []).push(r);
      } catch (e) { weekErr = e; }   // thrown after the daily summaries have gone out
    }
    // flags and titles of every involved chat: two requests per 50 chats instead of two per chat
    const flags = {}, titles = {};
    const involved = [...new Set([...chats, ...Object.keys(byChat)].map(String))];
    for (let i = 0; i < involved.length; i += 50) {
      const part = involved.slice(i, i + 50).join(',');
      for (const b of await L.sb(`league_boards?day=eq.${day}&chat_id=in.(${part})&select=chat_id,summary_sent,weekly_sent`) || []) flags[b.chat_id] = b;
      for (const l of await L.sb(`leagues?chat_id=in.(${part})&select=chat_id,title`) || []) titles[l.chat_id] = l.title;
    }
    const medal = ['🥇', '🥈', '🥉'];
    // true only when Telegram accepted the message (ok: true); a refusal or a network error is logged and the chat is skipped
    const send = async (chat_id, text, what) => {
      try {
        const r = await L.tg('sendMessage', { chat_id, text, parse_mode: 'HTML', reply_markup: L.playKb(chat_id), disable_web_page_preview: true });
        if (r && r.ok) return true;
        console.error(`cron ${what} ${chat_id}: telegram refused:`, String(r && r.description || 'no answer').slice(0, 200));
      } catch (e) { console.error(`cron ${what} ${chat_id}:`, String(e && e.message || e).slice(0, 200)); }
      return false;
    };
    for (const chat_id of chats) {
      if ((flags[chat_id] || {}).summary_sent) continue;
      // the league history already holds today's rows (checked once, by the same rules): today's list is cut from it
      let list, st;
      const view = await L.leagueView(chat_id, day);   // one call; rows older than the DB function take the paged path below
      if (view) { list = view.today; st = view.standings; }
      else { const hist = await L.leagueRows(chat_id); list = hist.filter(r => String(r.day).slice(0, 10) === day).sort(L.sortRes); st = L.standingsOf(hist); }
      if (!list.length) continue;
      const win = list[0], ws = st.find(s => s.name === win.name);
      // keep messages short: no trophies and no "new wheel tomorrow" line
      let t = `<b>🌙 Підсумок дня №${L.dayNo(day)} — ліга «${L.esc(titles[chat_id] || '')}»</b>\n\n`;
      t += list.slice(0, MAX_LINES).map((r, i) => `${medal[i] || (i + 1) + '.'} ${L.esc(r.name)} — <b>${r.pts}</b> (${r.w}-${r.d}-${r.l}, ${r.gf}:${r.ga})`).join('\n') + more(list.length - MAX_LINES);
      t += `\n\n👑 Переможець дня: <b>${L.esc(win.name)}</b>${ws && ws.wins > 1 ? ` (уже ${ws.wins}-й раз)` : ''}`;
      if (st.length > 1) t += `\n\n<b>Залік ліги</b> (перемоги в днях): ` + st.slice(0, 8).map(s => `${L.esc(s.name)} ${s.wins}`).join(' · ');
      if (!(await send(chat_id, t, 'summary'))) continue;   // not delivered: no flag, a rerun tries again
      await L.sb('league_boards?on_conflict=chat_id,day', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id, day, summary_sent: true } });
      done.push(chat_id);
    }
    const weekly = [];
    for (const [chat_id, rows] of Object.entries(byChat)) {
      if ((flags[chat_id] || {}).weekly_sent) continue;
      const byDay = {}; for (const r of rows) (byDay[r.day] = byDay[r.day] || []).push(r);
      const st = {};
      for (const list of Object.values(byDay)) { list.sort(L.sortRes); list.forEach((r, i) => { const s = st[r.tg_user_id] || (st[r.tg_user_id] = { name: r.name, pts: 0, days: 0, wins: 0 }); s.pts += r.pts; s.days++; s.name = r.name; if (i === 0) s.wins++; }); }
      const tab = Object.values(st).sort((a, b) => b.pts - a.pts || b.wins - a.wins);
      // league created mid-week: period starts from its first day, not Monday
      const first = rows.reduce((m, r) => (String(r.day) < m ? String(r.day) : m), day);
      let t = `<b>📅 Підсумок тижня ${L.dayShort(first)}–${L.dayShort(day)} — ліга «${L.esc(titles[chat_id] || '')}»</b>\n(сума очків за всі дні тижня)\n\n`;
      t += tab.slice(0, MAX_LINES).map((s, i) => `${medal[i] || (i + 1) + '.'} ${L.esc(s.name)} — <b>${s.pts}</b> за ${s.days} ${plUk(s.days, 'день', 'дні', 'днів')}${s.wins ? `, перемог: ${s.wins}` : ''}`).join('\n') + more(tab.length - MAX_LINES);
      t += `\n\n🏅 Гравець тижня: <b>${L.esc(tab[0].name)}</b>`;
      if (!(await send(chat_id, t, 'weekly'))) continue;
      await L.sb('league_boards?on_conflict=chat_id,day', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id, day, weekly_sent: true } });
      weekly.push(chat_id);
    }
    // old unused seeds and login tokens (sql/v090_seed_cleanup.sql); function missing or failing never breaks the summaries
    let cleaned = null;
    try { cleaned = await L.sb('rpc/cleanup_old_rows', { method: 'POST', body: {} }); } catch (e) { if (e.status !== 404) console.error('cleanup', e.message); }
    if (weekErr) throw weekErr;
    // opt-in evening notifications (one message per player): after the group summaries; failure doesn't break them
    let notify = null;
    try { notify = await N.sendEvening(day); } catch (e) { notify = { error: String(e && e.message || e).slice(0, 120) }; }
    // channel queue: daily fallback run (primary is GitHub Actions); failure doesn't break league summaries
    let channel = null;
    try { channel = await C.runChannel(); } catch (e) { channel = { error: String(e && e.message || e).slice(0, 120) }; }
    // player errors digest to admin (api/_errdigest.js); failure doesn't break league summaries
    let errs = null;
    try { errs = await errDigest({ sb: L.sb, tg: L.tg, env: L.env, day }); } catch (e) { errs = { error: String(e && e.message || e).slice(0, 120) }; }
    res.status(200).json({ ok: true, day, summaries: done.length, weekly: weekly.length, errs, channel, notify, cleaned });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e).slice(0, 200) });
  }
};
