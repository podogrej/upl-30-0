// 30-0 УПЛ — вечірній підсумок дня в лігах (запускає Vercel Cron з vercel.json, ~21:00 за Києвом)
// Пише в групу один раз на день і лише якщо хтось грав. Повторний виклик нічого не надсилає.
const L = (() => {   // спільні функції (вбудовано, щоб файл не залежав від інших)
const crypto = require('crypto');
const SB_URL = (process.env.SUPABASE_URL || 'https://qruhcbwycrnfgzzdbljr.supabase.co').trim();   // у тестовому оточенні Vercel — адреса тестової бази
const env = k => String(process.env[k] || '').replace(/\s+/g, '');
const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env('TG_TOKEN')}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
}

// запити до бази з правами сервера (ключ лише у Vercel)
async function sb(path, { method = 'GET', body, prefer } = {}) {
  const key = env('SUPABASE_SERVICE_KEY');
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
  if (!r.ok) throw new Error(`db ${r.status}: ${t.slice(0, 150)}`);
  return j;
}

function kyivDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
const LAUNCH = Date.UTC(2026, 8, 28);
const dayNo = day => Math.max(1, Math.round((Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) - LAUNCH) / 864e5) + 1);
const dayShort = day => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

// перевірка підпису Mini App (initData) — повертає {user, start_param} або null
function checkMiniApp(initData) {
  const token = env('TG_TOKEN');
  const p = new URLSearchParams(initData || ''); const hash = p.get('hash'); if (!hash) return null;
  p.delete('hash');
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  if (crypto.createHmac('sha256', secret).update(dcs).digest('hex') !== hash) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date') || 0) > 86400) return null;
  let user = null; try { user = JSON.parse(p.get('user')); } catch (e) {}
  return user ? { user, start_param: p.get('start_param') || '' } : null;
}
const nameOf = u => ([u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Гравець').slice(0, 40);

const playUrl = chat_id => `https://t.me/${env('TG_BOT') || 'upl30_bot'}?startapp=g${chat_id}`;
const playKb = chat_id => ({ inline_keyboard: [[{ text: '▶️ Зіграти виклик дня', url: playUrl(chat_id) }]] });

const sortRes = (a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || String(a.created_at).localeCompare(String(b.created_at));

// з 0.52 у табло й підсумках ліг — лише результати, чий сезон сервер перевірив (цифри беремо із сезону, а не з браузера).
// Дні до VERIFIED_FROM показуємо як були, щоб не переписувати історію ліг.
const VERIFIED_FROM = '2026-10-01';
async function onlyVerified(rows) {
  const ids = [...new Set(rows.filter(r => String(r.day) >= VERIFIED_FROM).map(r => +r.season_id).filter(Boolean))];
  const ok = {};
  for (let i = 0; i < ids.length; i += 100)
    for (const s of await sb(`seasons?id=in.(${ids.slice(i, i + 100).join(',')})&verified=is.true&practice=is.false&select=id,day,tg_user_id,w,d,l,gf,ga,place`) || []) ok[s.id] = s;
  return rows.filter(r => {
    if (String(r.day) < VERIFIED_FROM) return true;
    const s = ok[+r.season_id];
    return !!s && String(s.day).slice(0, 10) === String(r.day).slice(0, 10) && (s.tg_user_id == null || String(s.tg_user_id) === String(r.tg_user_id));
  }).map(r => { const s = ok[+r.season_id]; return s ? { ...r, w: s.w, d: s.d, l: s.l, pts: s.w * 3 + s.d, gf: s.gf, ga: s.ga, place: s.place } : r; });
}

// загальний залік ліги: перемоги в днях (минулі дні + сьогодні)
async function standings(chat_id) {
  const rows = await onlyVerified(await sb(`league_results?chat_id=eq.${chat_id}&select=day,tg_user_id,name,pts,gf,ga,created_at,season_id&order=day.desc&limit=3000`) || []);
  const byDay = {}; for (const r of rows) (byDay[r.day] = byDay[r.day] || []).push(r);
  const st = {};
  for (const [day, list] of Object.entries(byDay)) {
    list.sort(sortRes);
    for (const r of list) { const s = st[r.tg_user_id] || (st[r.tg_user_id] = { name: r.name, wins: 0, days: 0, pts: 0 }); s.days++; s.pts += r.pts; s.name = r.name; }
    st[list[0].tg_user_id].wins++;
  }
  return Object.values(st).sort((a, b) => b.wins - a.wins || b.pts / b.days - a.pts / a.days);
}

async function boardText(chat_id, day) {
  const [lg] = await sb(`leagues?chat_id=eq.${chat_id}&select=title`) || [];
  const rows = (await onlyVerified(await sb(`league_results?chat_id=eq.${chat_id}&day=eq.${day}&select=*`) || [])).sort(sortRes);
  const members = (await sb(`league_members?chat_id=eq.${chat_id}&select=tg_user_id`) || []).length;
  const medal = ['🥇', '🥈', '🥉'];
  let t = `<b>🏟 Ліга «${esc(lg ? lg.title : 'група')}»</b>\nВиклик дня №${dayNo(day)} · ${dayShort(day)} — однакове колесо для всіх\n\n`;
  if (!rows.length) t += 'Сьогодні ще ніхто не зіграв. Будь першим!';
  else t += rows.map((r, i) => `${medal[i] || (i + 1) + '.'} ${esc(r.name)} — <b>${r.pts}</b> (${r.w}-${r.d}-${r.l}, ${r.gf}:${r.ga})${r.trophies && r.trophies.length ? ' 🏆' : ''}`).join('\n');
  t += `\n\nЗіграли: ${rows.length} з ${Math.max(members, rows.length)}`;
  return t;
}

// одне повідомлення-табло на день: редагуємо, а не шлемо нові
async function upsertBoard(chat_id, day, { forceNew = false } = {}) {
  const text = await boardText(chat_id, day);
  const [b] = await sb(`league_boards?chat_id=eq.${chat_id}&day=eq.${day}&select=message_id`) || [];
  if (b && b.message_id && !forceNew) {
    const r = await tg('editMessageText', { chat_id, message_id: b.message_id, text, parse_mode: 'HTML', reply_markup: playKb(chat_id), disable_web_page_preview: true });
    if (r.ok || /not modified/.test(r.description || '')) return b.message_id;
  }
  const m = await tg('sendMessage', { chat_id, text, parse_mode: 'HTML', reply_markup: playKb(chat_id), disable_web_page_preview: true });
  if (!m.ok) throw new Error('send: ' + m.description);
  const mid = m.result.message_id;
  await tg('pinChatMessage', { chat_id, message_id: mid, disable_notification: true });   // вийде, лише якщо бот — адмін
  await sb('league_boards?on_conflict=chat_id,day', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id, day, message_id: mid } });
  return mid;
}

return { SB_URL, env, esc, tg, sb, kyivDate, dayNo, dayShort, checkMiniApp, nameOf, playUrl, playKb, sortRes, onlyVerified, standings, boardText, upsertBoard };
})();

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
      const list = (await L.onlyVerified(await L.sb(`league_results?chat_id=eq.${chat_id}&day=eq.${day}&select=*`) || [])).sort(L.sortRes);
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
        let t = `<b>📅 Підсумок тижня ${L.dayShort(from)}–${L.dayShort(day)} — ліга «${L.esc(lg ? lg.title : '')}»</b>\n(сума очків за всі виклики тижня)\n\n`;
        t += tab.map((s, i) => `${medal[i] || (i + 1) + '.'} ${L.esc(s.name)} — <b>${s.pts}</b> за ${s.days} ${s.days === 1 ? 'день' : s.days < 5 ? 'дні' : 'днів'}${s.wins ? `, перемог: ${s.wins}` : ''}`).join('\n');
        t += `\n\n🏅 Гравець тижня: <b>${L.esc(tab[0].name)}</b>. Новий тиждень — з понеділка!`;
        await L.tg('sendMessage', { chat_id, text: t, parse_mode: 'HTML', reply_markup: L.playKb(chat_id), disable_web_page_preview: true });
        await L.sb('league_boards?on_conflict=chat_id,day', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { chat_id, day, weekly_sent: true } });
        weekly.push(chat_id);
      }
    }
    res.status(200).json({ ok: true, day, summaries: done.length, weekly: weekly.length });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e).slice(0, 200) });
  }
};
