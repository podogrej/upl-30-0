// 30-0 УПЛ — вечірній підсумок дня в лігах (Vercel Cron з vercel.json о 18:00 UTC: 21:00 за Києвом улітку, 20:00 — узимку)
// Пише в групу один раз на день і лише якщо хтось грав. Повторний виклик нічого не надсилає.
// Змінна оточення у Vercel: CRON_SECRET (обов'язкова, інакше 401).
const L = require('./_league.js');
const C = require('./_channel.js');   // 0.69.97: черга постів каналу
const { plUk } = require('./_lib.js');
const { errDigest } = require('./_errdigest.js');   // спільні функції ліг груп (0.60: одна копія замість трьох)
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && require('crypto').timingSafeEqual(x, y); };

module.exports = async (req, res) => {
  // Vercel Cron сам надсилає заголовок «Authorization: Bearer <CRON_SECRET>», якщо змінну CRON_SECRET задано у Vercel.
  // Без змінної або з чужим ключем — 401 (раніше без змінної cron був відкритий усім). Ручний запуск — лише з тим самим заголовком.
  const cronSecret = L.env('CRON_SECRET');
  const auth = String((req.headers && req.headers.authorization) || '');
  const okBy = sec => !!sec && safeEq(auth, `Bearer ${sec}`);
  // 0.69.97: ?task=channel — лише черга каналу (кожні ~10 хв з GitHub Actions, .github/workflows/channel.yml); ключ — CHANNEL_SECRET або CRON_SECRET
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
      // 0.69.96 (власник 05.10: «бот кидає дуже великі повідомлення»): без трофеїв і без «Завтра нове колесо»
      let t = `<b>🌙 Підсумок дня №${L.dayNo(day)} — ліга «${L.esc(lg ? lg.title : '')}»</b>\n\n`;
      t += list.map((r, i) => `${medal[i] || (i + 1) + '.'} ${L.esc(r.name)} — <b>${r.pts}</b> (${r.w}-${r.d}-${r.l}, ${r.gf}:${r.ga})`).join('\n');
      t += `\n\n👑 Переможець дня: <b>${L.esc(win.name)}</b>${ws && ws.wins > 1 ? ` (уже ${ws.wins}-й раз)` : ''}`;
      if (st.length > 1) t += `\n\n<b>Залік ліги</b> (перемоги в днях): ` + st.slice(0, 8).map(s => `${L.esc(s.name)} ${s.wins}`).join(' · ');
      await L.tg('sendMessage', { chat_id, text: t, parse_mode: 'HTML', reply_markup: L.playKb(chat_id), disable_web_page_preview: true });
      await L.sb('league_boards?on_conflict=chat_id,day', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id, day, summary_sent: true } });
      done.push(chat_id);
    }
    // недільний підсумок тижня (пн–нд за Києвом): сума очків і перемоги в днях
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
        // 0.69.96 (власник 05.10): ліга з'явилась посеред тижня — період від її першого дня, а не з понеділка
        const first = rows.reduce((m, r) => (String(r.day) < m ? String(r.day) : m), day);
        let t = `<b>📅 Підсумок тижня ${L.dayShort(first)}–${L.dayShort(day)} — ліга «${L.esc(lg ? lg.title : '')}»</b>\n(сума очків за всі виклики тижня)\n\n`;
        t += tab.map((s, i) => `${medal[i] || (i + 1) + '.'} ${L.esc(s.name)} — <b>${s.pts}</b> за ${s.days} ${plUk(s.days, 'день', 'дні', 'днів')}${s.wins ? `, перемог: ${s.wins}` : ''}`).join('\n');
        t += `\n\n🏅 Гравець тижня: <b>${L.esc(tab[0].name)}</b>`;
        await L.tg('sendMessage', { chat_id, text: t, parse_mode: 'HTML', reply_markup: L.playKb(chat_id), disable_web_page_preview: true });
        await L.sb('league_boards?on_conflict=chat_id,day', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id, day, weekly_sent: true } });
        weekly.push(chat_id);
      }
    }
    // 0.69.97: черга каналу — запасний запуск раз на день (основний — GitHub Actions); збій не ламає підсумки ліг
    let channel = null;
    try { channel = await C.runChannel(); } catch (e) { channel = { error: String(e && e.message || e).slice(0, 120) }; }
    // 0.69: зведення помилок гравців власнику (api/_errdigest.js); збій зведення не ламає підсумки ліг
    let errs = null;
    try { errs = await errDigest({ sb: L.sb, tg: L.tg, env: L.env, day }); } catch (e) { errs = { error: String(e && e.message || e).slice(0, 120) }; }
    res.status(200).json({ ok: true, day, summaries: done.length, weekly: weekly.length, errs, channel });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e).slice(0, 200) });
  }
};
