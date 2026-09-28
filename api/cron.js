// 30-0 УПЛ — вечірній підсумок дня в лігах (запускає Vercel Cron з vercel.json, ~21:00 за Києвом)
// Пише в групу один раз на день і лише якщо хтось грав. Повторний виклик нічого не надсилає.
const L = require('./_lib');

module.exports = async (req, res) => {
  const cronSecret = L.env('CRON_SECRET');
  const auth = req.headers.authorization || '';
  const manual = req.query && req.query.key && req.query.key === L.env('TG_SECRET');
  if (cronSecret && auth !== `Bearer ${cronSecret}` && !manual) return res.status(401).json({ error: 'unauthorized' });
  try {
    const day = (req.query && /^\d{4}-\d{2}-\d{2}$/.test(req.query.day || '')) ? req.query.day : L.kyivDate();
    const rows = await L.sb(`league_results?day=eq.${day}&select=chat_id`) || [];
    const chats = [...new Set(rows.map(r => r.chat_id))];
    const done = [];
    for (const chat_id of chats) {
      const [b] = await L.sb(`league_boards?chat_id=eq.${chat_id}&day=eq.${day}&select=summary_sent`) || [];
      if (b && b.summary_sent) continue;
      const [lg] = await L.sb(`leagues?chat_id=eq.${chat_id}&select=title`) || [];
      const list = (await L.sb(`league_results?chat_id=eq.${chat_id}&day=eq.${day}&select=*`) || []).sort(L.sortRes);
      if (!list.length) continue;
      const st = await L.standings(chat_id);
      const win = list[0], ws = st.find(s => s.name === win.name);
      const medal = ['🥇', '🥈', '🥉'];
      let t = `<b>🌙 Підсумок дня №${L.dayNo(day)} — ліга «${L.esc(lg ? lg.title : '')}»</b>\n\n`;
      t += list.map((r, i) => `${medal[i] || (i + 1) + '.'} ${L.esc(r.name)} — <b>${r.pts}</b> (${r.w}-${r.d}-${r.l}, ${r.gf}:${r.ga})`).join('\n');
      t += `\n\n👑 Переможець дня: <b>${L.esc(win.name)}</b>${ws && ws.wins > 1 ? ` (уже ${ws.wins}-й раз)` : ''}`;
      const tro = list.filter(r => r.trophies && r.trophies.length);
      if (tro.length) t += '\n' + tro.map(r => `🏆 ${L.esc(r.name)}: ${r.trophies.map(x => x.startsWith('✨') ? `секретний «${L.esc(x.slice(1).trim())}»` : `«${L.esc(x)}»`).join(', ')}`).join('\n');
      if (st.length > 1) t += `\n\n<b>Залік ліги</b> (перемоги в днях): ` + st.slice(0, 8).map(s => `${L.esc(s.name)} ${s.wins}`).join(' · ');
      t += `\n\nЗавтра нове колесо — о 00:00 за Києвом.`;
      await L.tg('sendMessage', { chat_id, text: t, parse_mode: 'HTML', reply_markup: L.playKb(chat_id), disable_web_page_preview: true });
      await L.sb('league_boards?on_conflict=chat_id,day', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id, day, summary_sent: true } });
      done.push(chat_id);
    }
    res.status(200).json({ ok: true, day, summaries: done.length });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e).slice(0, 200) });
  }
};
