// 30-0 УПЛ — надіслати картку результату собі в Telegram (адреса /api/card)
// У застосунку Telegram довге натискання на картинку в Mini App не дає її зберегти, тому бот надсилає картку в особистий чат:
// звідти її можна зберегти, переслати друзям або викласти в сторіз.
// POST {initData, image: "data:image/jpeg;base64,…", thumb?, caption, share?}. Змінні оточення у Vercel: TG_TOKEN, TG_BOT.
// share=true: бот повертає id підготовленого повідомлення (savePreparedInlineMessage) для WebApp.shareMessage.
//   Спершу картка кладеться у публічне сховище Supabase (bucket «cards», SQL: sql/cards_bucket.sql) і йде як photo_url —
//   так не потрібен особистий чат із ботом. Якщо сховища немає — запасний шлях через особистий чат (потрібен Start).
//   Змінні: SUPABASE_URL (у тесті), SUPABASE_SERVICE_KEY.
//   З 0.67 спершу — службовий канал TG_CARDS_CHAT (див. cachePhoto); немає змінної або канал не відповів — сховище, як раніше.
const crypto = require('crypto');
const { rateLimit } = require('./_device.js');   // обмеження частоти (0.55)
const { SB_URL, env, miniApp } = require('./_lib.js');
async function storeCard(buf, ext) {   // → публічна адреса картки або null
  const key = env('SUPABASE_SERVICE_KEY'); if (!key) return null;
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomBytes(9).toString('hex')}.${ext}`;
  const r = await fetch(`${SB_URL}/storage/v1/object/cards/${path}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': `image/${ext === 'png' ? 'png' : 'jpeg'}`, 'x-upsert': 'false' }, body: buf });
  return r.ok ? `${SB_URL}/storage/v1/object/public/cards/${path}` : null;
}
// 0.67: найнадійніше — картку один раз завантажує сам бот у службовий канал (TG_CARDS_CHAT, бот — адмін каналу), далі вона йде
// як фото, що вже лежить у Telegram (photo_file_id): Telegram нічого не качає за адресою, тож картка не може обірватися
async function cachePhoto(token, buf, ext) {   // → file_id або null
  const chat = env('TG_CARDS_CHAT'); if (!chat) return null;
  const fd = new FormData();
  fd.append('chat_id', chat); fd.append('disable_notification', 'true');
  fd.append('photo', new Blob([buf], { type: `image/${ext === 'png' ? 'png' : 'jpeg'}` }), `30-0-upl.${ext === 'png' ? 'png' : 'jpg'}`);
  const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({}));
  const ph = (j.ok && j.result && j.result.photo) || [];
  return ph.length ? ph[ph.length - 1].file_id : null;
}
async function warm(url) {   // прочитати файл повністю (до 4 с), щоб Telegram отримав його з кешу сховища цілим
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 4000);
  try { const r = await fetch(url, { signal: ac.signal }); await r.arrayBuffer(); } catch (e) {} finally { clearTimeout(t); }
}
async function prepare(token, u, photo, caption) {
  const bot = env('TG_BOT') || 'upl30_bot';
  const result = { type: 'photo', id: crypto.randomBytes(8).toString('hex'), ...photo, caption: String(caption || '').slice(0, 1000),
    reply_markup: { inline_keyboard: [[{ text: 'Зібрати свою 11-ку', url: `https://t.me/${bot}?startapp` }]] } };
  const pr = await fetch(`https://api.telegram.org/bot${token}/savePreparedInlineMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: u.id, result, allow_user_chats: true, allow_group_chats: true, allow_channel_chats: true }) });
  const pj = await pr.json().catch(() => ({}));
  return pj.ok ? { ok: true, prepared: pj.result.id } : { ok: false, error: String(pj.description || pr.status).slice(0, 160) };
}
const checkMiniApp = (initData, token) => { const m = miniApp(initData, token); return m && m.user; };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let stage = 'config';
  try {
    const token = env('TG_TOKEN'); if (!token) return res.status(500).json({ error: 'TG_TOKEN не задано' });
    stage = 'body';
    let b = req.body || {}; if (typeof b === 'string') b = JSON.parse(b);
    stage = 'rate';
    if (await rateLimit(req, res, 'card')) return;   // за IP (0.55)
    stage = 'signature';
    const u = checkMiniApp(String(b.initData || ''), token);
    if (!u || !u.id) return res.status(401).json({ error: 'bad telegram signature' });
    stage = 'image';
    const m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(String(b.image || ''));
    if (!m) return res.status(400).json({ error: 'image?' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 3.5e6) return res.status(413).json({ error: 'image too large' });
    if (b.share) {
      stage = 'channel';
      const fid = await cachePhoto(token, buf, m[1]).catch(() => null);
      if (fid) { stage = 'prepare'; return res.status(200).json(await prepare(token, u, { photo_file_id: fid }, b.caption)); }
      stage = 'store';
      const url = await storeCard(buf, m[1] === 'png' ? 'png' : 'jpg').catch(() => null);
      if (url) {
        // 0.67: картка приходила наполовину сірою — Telegram не дочекався файлу зі сховища. Окреме мале прев'ю
        // і одне повне читання файлу перед відправкою (сховище віддає його вже з кешу)
        const tm = /^data:image\/jpeg;base64,(.+)$/.exec(String(b.thumb || ''));
        const tbuf = tm && Buffer.from(tm[1], 'base64');
        const thumb = tbuf && tbuf.length < 2e5 ? await storeCard(tbuf, 'jpg').catch(() => null) : null;
        stage = 'warm';
        await warm(url);
        stage = 'prepare';
        return res.status(200).json(await prepare(token, u, { photo_url: url, thumbnail_url: thumb || url, photo_width: 1080, photo_height: 1350 }, b.caption));
      }
      if (b.prefetch) return res.status(200).json({ ok: false, error: 'store' });   // 0.66: заготовка заздалегідь — без запасного шляху через особистий чат
    }
    stage = 'send';
    const fd = new FormData();
    fd.append('chat_id', String(u.id));
    fd.append('caption', String(b.caption || '').slice(0, 1000));
    fd.append('photo', new Blob([buf], { type: `image/${m[1]}` }), `30-0-upl.${m[1] === 'png' ? 'png' : 'jpg'}`);
    const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) {
      // користувач ще не запускав бота в особистому чаті — бот не може написати першим
      const blocked = /chat not found|bot can't initiate|blocked/i.test(j.description || '');
      return res.status(200).json({ ok: false, need_start: blocked, error: String(j.description || r.status).slice(0, 160) });
    }
    if (!b.share) return res.status(200).json({ ok: true });
    // запасний шлях share: картка як файл на серверах Telegram — прибираємо її з особистого чату й готуємо повідомлення
    stage = 'prepare';
    const photos = (j.result && j.result.photo) || [];
    const fileId = photos.length ? photos[photos.length - 1].file_id : null;
    if (!fileId) return res.status(200).json({ ok: false, error: 'no file_id' });
    fetch(`https://api.telegram.org/bot${token}/deleteMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: u.id, message_id: j.result.message_id }) }).catch(() => {});
    res.status(200).json(await prepare(token, u, { photo_file_id: fileId }, b.caption));
  } catch (e) {
    res.status(500).json({ error: `crash at ${stage}: ${String(e && e.message || e).slice(0, 160)}` });
  }
};
