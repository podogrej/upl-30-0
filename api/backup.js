// 30-0 УПЛ — щоденна резервна копія бази (адреса /api/backup; запускає Vercel Cron з vercel.json раз на добу)
// Сервер ключем SUPABASE_SERVICE_KEY читає всі важливі таблиці сторінками по 1000 рядків, одразу стискає (gzip, потоком —
// у пам'яті лише стиснуте) і кладе один файл YYYY-MM-DD.json.gz (дата за Києвом) у ПРИВАТНЕ сховище Supabase «backups»
// (SQL: sql/v055_backups.sql). Повторний запуск того ж дня перезаписує файл.
// Зберігаємо: останні 14 щоденних файлів + понеділкові за 8 тижнів; старші видаляються.
// Доступ: лише з заголовком «Authorization: Bearer <CRON_SECRET>» (Vercel Cron шле його сам); без змінної — 401.
// Формат файлу: {"made":…, "source":…, "tables":{"players":[…], …}, "counts":{…}} — відновлення: tools/backup/restore_plan.md.
const zlib = require('zlib'), crypto = require('crypto');
const { SB_URL, sb, env, kyivDate } = require('./_lib.js');
const BUCKET = 'backups', PAGE = 1000, KEEP_DAYS = 14, KEEP_MONDAY_WEEKS = 8;
const CARDS = 'cards', CARDS_KEEP_DAYS = 7;   // аудит P2-20 (власник 02.10: «так»): картки для Telegram (api/card.js, папки ГГГГ-ММ-ДД) — Telegram забирає їх одразу, тиждень із запасом
// таблиця → порядок (первинний ключ). key — одна колонка: сторінки «після останнього» (keyset), інакше offset
const TABLES = [
  { t: 'players', order: 'id', key: 'id' },
  { t: 'player_links', order: 'kind,key' },
  { t: 'seasons', order: 'id', key: 'id' },
  { t: 'daily_results', order: 'id', key: 'id' },
  { t: 'trophies', order: 'device_id,trophy' },
  { t: 'challenges', order: 'id', key: 'id' },
  { t: 'challenge_results', order: 'challenge_id,device_id' },
  { t: 'leagues', order: 'chat_id', key: 'chat_id' },
  { t: 'league_members', order: 'chat_id,tg_user_id' },
  { t: 'league_results', order: 'chat_id,day,tg_user_id' },
  { t: 'league_boards', order: 'chat_id,day' },
  { t: 'season_seeds', order: 'id', key: 'id', since: 30 },   // лише за останні 30 днів
  { t: 'user_state', order: 'user_id', key: 'user_id' },
  { t: 'app_marks', order: 'key', key: 'key' },
  { t: 'f5_rooms', order: 'id', key: 'id' },
  { t: 'f5_players', order: 'room_id,seat' },
  { t: 'f5_picks', order: 'room_id,seat,k' },
  // 0.60 (sql/v060_one_player.sql): пошта для новин, питання «Це ти?», журнал злиттів (для відкату), іменні винятки
  { t: 'player_contacts', order: 'player_id', key: 'player_id' },
  { t: 'merge_offers', order: 'id', key: 'id' },
  { t: 'merge_log', order: 'id', key: 'id' },
  { t: 'name_reserved', order: 'name', key: 'name' },
];
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const q = v => encodeURIComponent(typeof v === 'string' && /[,.()"]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : String(v));

// усі рядки таблиці сторінками; кожна сторінка — одразу у gzip (onRows), назад — лише кількість
async function dumpTable({ t, order, key, since }, onRows) {
  let n = 0, last = null, from = 0;
  const cond = since ? `&created_at=gte.${new Date(Date.now() - since * 864e5).toISOString()}` : '';
  for (;;) {
    const page = key
      ? `${t}?select=*&order=${key}.asc&limit=${PAGE}${cond}${last != null ? `&${key}=gt.${q(last)}` : ''}`
      : `${t}?select=*&order=${order}&limit=${PAGE}&offset=${from}${cond}`;
    const rows = await sb(page) || [];
    if (rows.length) await onRows(rows);
    n += rows.length; from += rows.length;
    if (rows.length < PAGE) return n;
    if (key) last = rows[rows.length - 1][key];
  }
}

// запит до Storage ключем сервера
async function storage(path, { method = 'GET', body, headers = {} } = {}) {
  const k = env('SUPABASE_SERVICE_KEY');
  const r = await fetch(`${SB_URL}/storage/v1/${path}`, { method, headers: { apikey: k, Authorization: `Bearer ${k}`, ...headers }, body });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
  if (!r.ok) throw new Error(`storage ${r.status}: ${t.slice(0, 150)}`);
  return j;
}

// які файли лишити: 14 останніх днів + понеділки за 8 тижнів (дата — з імені файлу)
// картки старші за CARDS_KEEP_DAYS: список папок-днів → файли кожної (по PAGE) → видалення
async function cleanCards(today) {
  const json = { 'Content-Type': 'application/json' };
  const list = prefix => storage(`object/list/${CARDS}`, { method: 'POST', body: JSON.stringify({ prefix, limit: PAGE, offset: 0, sortBy: { column: 'name', order: 'asc' } }), headers: json }).then(r => r || []);
  const edge = new Date(Date.parse(today + 'T00:00:00Z') - CARDS_KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  const days = (await list('')).map(o => o.name).filter(n => /^\d{4}-\d{2}-\d{2}$/.test(n) && n < edge);
  let n = 0;
  for (const d of days) {
    for (;;) {
      const files = (await list(d + '/')).filter(o => o.id).map(o => `${d}/${o.name}`);
      if (!files.length) break;
      await storage(`object/${CARDS}`, { method: 'DELETE', body: JSON.stringify({ prefixes: files }), headers: json });
      n += files.length;
      if (files.length < PAGE) break;
    }
  }
  return n;
}
function toDelete(names, today) {
  const t0 = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  return names.filter(name => {
    const m = /^(\d{4})-(\d{2})-(\d{2})\.json\.gz$/.exec(name); if (!m) return false;   // чужі файли не чіпаємо
    const d = Date.UTC(+m[1], +m[2] - 1, +m[3]), age = Math.round((t0 - d) / 864e5);
    if (age < KEEP_DAYS) return false;
    if (new Date(d).getUTCDay() === 1 && age < KEEP_MONDAY_WEEKS * 7) return false;
    return true;
  });
}

module.exports = async (req, res) => {
  const cronSecret = env('CRON_SECRET');
  const auth = String((req.headers && req.headers.authorization) || '');
  if (!cronSecret || !safeEq(auth, `Bearer ${cronSecret}`)) return res.status(401).json({ error: 'unauthorized' });
  if (!env('SUPABASE_SERVICE_KEY')) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY не задано' });
  let stage = 'dump';
  const t0 = Date.now();
  try {
    const day = kyivDate(), name = `${day}.json.gz`;
    // gzip потоком: JSON пишемо шматками, стиснуті байти збираємо в масив
    const gz = zlib.createGzip({ level: 6 }), parts = [];
    gz.on('data', c => parts.push(c));
    const done = new Promise((ok, bad) => { gz.on('end', ok); gz.on('error', bad); });
    const write = s => new Promise(ok => { if (gz.write(s)) ok(); else gz.once('drain', ok); });
    await write(`{"made":${JSON.stringify(new Date().toISOString())},"source":${JSON.stringify(SB_URL)},"day":"${day}","tables":{`);
    const counts = {};
    for (let i = 0; i < TABLES.length; i++) {
      const T = TABLES[i]; stage = T.t;
      await write(`${i ? ',' : ''}${JSON.stringify(T.t)}:[`);
      let first = true;
      try {
        counts[T.t] = await dumpTable(T, async rows => {
          await write((first ? '' : ',') + rows.map(r => JSON.stringify(r)).join(','));
          first = false;
        });
      } catch (e) {
        // таблиці ще немає в цій базі (напр. тестова без 5×5) — пишемо порожньою, решту зберігаємо
        if (!/db (404|400)|PGRST205|42P01|does not exist/.test(e.message + (e.body || ''))) throw e;
        counts[T.t] = null; console.warn('backup: skip', T.t, e.message.slice(0, 120));
      }
      await write(']');
    }
    await write(`},"counts":${JSON.stringify(counts)}}`);
    gz.end();
    await done;
    const buf = Buffer.concat(parts);
    stage = 'upload';
    await storage(`object/${BUCKET}/${name}`, { method: 'POST', body: buf, headers: { 'Content-Type': 'application/gzip', 'x-upsert': 'true' } });
    stage = 'retention';
    const list = await storage(`object/list/${BUCKET}`, { method: 'POST', body: JSON.stringify({ prefix: '', limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }), headers: { 'Content-Type': 'application/json' } }) || [];
    const del = toDelete(list.map(o => o.name), day);
    if (del.length) await storage(`object/${BUCKET}`, { method: 'DELETE', body: JSON.stringify({ prefixes: del }), headers: { 'Content-Type': 'application/json' } });
    stage = 'cards';
    let cardsDeleted = 0;
    try { await sb(`client_errors?at=lt.${new Date(Date.now() - 30 * 864e5).toISOString()}`, { method: 'DELETE' }); } catch (e) { if (e.status !== 404) console.warn('backup: client_errors cleanup', e.message.slice(0, 120)); }   // 0.68: звіти про помилки — 30 днів
    try { cardsDeleted = await cleanCards(day); } catch (e) { console.warn('backup: cards cleanup', e.message.slice(0, 120)); }   // копія вже збережена — чистка карток не валить бекап
    const out = { ok: true, file: `${BUCKET}/${name}`, bytes: buf.length, counts, deleted: del, cardsDeleted, ms: Date.now() - t0 };
    console.log('backup', JSON.stringify(out));
    res.status(200).json(out);
  } catch (e) {
    console.error('backup failed at', stage, e && e.message);
    res.status(500).json({ error: `crash at ${stage}: ${String(e && e.message || e).slice(0, 180)}` });
  }
};
module.exports.toDelete = toDelete;
module.exports.TABLES = TABLES;
