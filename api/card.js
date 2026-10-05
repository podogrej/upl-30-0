// 30-0 UPL: send the result card to the user's own Telegram chat (/api/card)
// In the Telegram app a long press on an image inside a Mini App doesn't save it, so the bot sends the card to the private chat,
// where it can be saved, forwarded or posted to stories.
// POST {initData, image: "data:image/jpeg;base64,...", thumb?, caption, share?}. Vercel env: TG_TOKEN, TG_BOT.
// share=true: the bot returns a prepared message id (savePreparedInlineMessage) for WebApp.shareMessage.
//   The card is put into the public Supabase bucket "cards" (SQL: sql/cards_bucket.sql) and sent as photo_url,
//   so no private chat with the bot is needed. No bucket -> fallback via private chat (requires Start).
//   Env: SUPABASE_URL (test), SUPABASE_SERVICE_KEY.
//   First choice is the service channel TG_CARDS_CHAT (see cachePhoto); no env var or channel failure -> bucket.
const crypto = require('crypto');
const { rateLimit } = require('./_device.js');   // rate limiting
const { SB_URL, env, miniApp } = require('./_lib.js');
async function storeCard(buf, ext) {   // -> public card URL or null
  const key = env('SUPABASE_SERVICE_KEY'); if (!key) return null;
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomBytes(9).toString('hex')}.${ext}`;
  const r = await fetch(`${SB_URL}/storage/v1/object/cards/${path}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': `image/${ext === 'png' ? 'png' : 'jpeg'}`, 'x-upsert': 'false' }, body: buf });
  return r.ok ? `${SB_URL}/storage/v1/object/public/cards/${path}` : null;
}
// Most reliable path: the bot uploads the card once to a service channel (TG_CARDS_CHAT, bot is channel admin), then it is sent
// as a photo already stored in Telegram (photo_file_id): Telegram fetches nothing by URL, so the card can't arrive truncated
async function cachePhoto(token, buf, ext) {   // -> file_id or null
  const chat = env('TG_CARDS_CHAT'); if (!chat) return null;
  const fd = new FormData();
  fd.append('chat_id', chat); fd.append('disable_notification', 'true');
  fd.append('photo', new Blob([buf], { type: `image/${ext === 'png' ? 'png' : 'jpeg'}` }), `30-0-upl.${ext === 'png' ? 'png' : 'jpg'}`);
  const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({}));
  const ph = (j.ok && j.result && j.result.photo) || [];
  return ph.length ? ph[ph.length - 1].file_id : null;
}
async function warm(url) {   // read the whole file (up to 4 s) so Telegram gets it intact from the storage cache
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
    if (await rateLimit(req, res, 'card')) return;   // per IP
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
        // Telegram used to fetch the file from storage before it was complete (half-grey card). Hence a separate small preview
        // and one full read of the file before sending (storage then serves it from cache)
        const tm = /^data:image\/jpeg;base64,(.+)$/.exec(String(b.thumb || ''));
        const tbuf = tm && Buffer.from(tm[1], 'base64');
        const thumb = tbuf && tbuf.length < 2e5 ? await storeCard(tbuf, 'jpg').catch(() => null) : null;
        stage = 'warm';
        await warm(url);
        stage = 'prepare';
        return res.status(200).json(await prepare(token, u, { photo_url: url, thumbnail_url: thumb || url, photo_width: 1080, photo_height: 1350 }, b.caption));
      }
      if (b.prefetch) return res.status(200).json({ ok: false, error: 'store' });   // prefetch: no private-chat fallback
    }
    stage = 'send';
    const fd = new FormData();
    fd.append('chat_id', String(u.id));
    fd.append('caption', String(b.caption || '').slice(0, 1000));
    fd.append('photo', new Blob([buf], { type: `image/${m[1]}` }), `30-0-upl.${m[1] === 'png' ? 'png' : 'jpg'}`);
    const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) {
      // user hasn't started the bot in private chat; the bot can't write first
      const blocked = /chat not found|bot can't initiate|blocked/i.test(j.description || '');
      return res.status(200).json({ ok: false, need_start: blocked, error: String(j.description || r.status).slice(0, 160) });
    }
    if (!b.share) return res.status(200).json({ ok: true });
    // share fallback: card is a file on Telegram servers; delete it from the private chat and prepare the message
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
