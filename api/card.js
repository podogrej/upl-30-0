// 30-0 UPL: send the result card to the user's own Telegram chat (/api/card)
// In the Telegram app a long press on an image inside a Mini App doesn't save it, so the bot sends the card to the private chat,
// where it can be saved, forwarded or posted to stories.
// og:true {season_id, image (jpeg <= 400 KB), initData | device+secret}: stores og/<season_id>.jpg for the /r/<id> preview (see ogCard).
// POST {initData, image: "data:image/jpeg;base64,...", thumb?, caption, share?}. Vercel env: TG_TOKEN, TG_BOT.
// share=true: the bot returns a prepared message id (savePreparedInlineMessage) for WebApp.shareMessage.
//   The card is put into the public Supabase bucket "cards" (SQL: sql/cards_bucket.sql) and sent as photo_url,
//   so no private chat with the bot is needed. No bucket -> fallback via private chat (requires Start).
//   Env: SUPABASE_URL (test), SUPABASE_SERVICE_KEY.
//   First choice is the service channel TG_CARDS_CHAT (see cachePhoto); no env var or channel failure -> bucket.
const crypto = require('crypto');
const { rateLimit, gate } = require('./_device.js');   // rate limiting, device check
const { SB_URL, env, sb, miniAppCheck, body, fail, report, reportOnce } = require('./_lib.js');
async function storeCard(buf, ext) {   // -> public card URL or null
  const key = env('SUPABASE_SERVICE_KEY'); if (!key) { await report('card store', 'no service key'); return null; }
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomBytes(9).toString('hex')}.${ext}`;
  const r = await fetch(`${SB_URL}/storage/v1/object/cards/${path}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': `image/${ext === 'png' ? 'png' : 'jpeg'}`, 'x-upsert': 'false' }, body: buf });
  if (!r.ok) await report('card store', `storage ${r.status}`);
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
  if (!ph.length) await report('card channel', String(j.description || r.status));
  return ph.length ? ph[ph.length - 1].file_id : null;
}
async function warm(url) {   // read the whole file (up to 4 s) so Telegram gets it intact from the storage cache
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 4000);
  try { const r = await fetch(url, { signal: ac.signal }); await r.arrayBuffer(); } catch (e) {} finally { clearTimeout(t); }
}
async function prepare(token, u, photo, caption, html) {
  const bot = env('TG_BOT') || 'upl30_bot';
  const result = { type: 'photo', id: crypto.randomBytes(8).toString('hex'), ...photo, caption: String(caption || '').slice(0, 1000), ...(html ? { parse_mode: 'HTML' } : {}),
    reply_markup: { inline_keyboard: [[{ text: 'Зібрати свою 11-ку', url: `https://t.me/${bot}?startapp` }]] } };
  const pr = await fetch(`https://api.telegram.org/bot${token}/savePreparedInlineMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: u.id, result, allow_user_chats: true, allow_group_chats: true, allow_channel_chats: true }) });
  const pj = await pr.json().catch(() => ({}));
  return pj.ok ? { ok: true, prepared: pj.result.id } : { ok: false, error: String(pj.description || pr.status).slice(0, 160) };
}

// og: preview image of a result link, public bucket cards at og/<season id>.jpg (read by api/r.js). Only the owner of a verified, non-practice season
// may store it (Telegram initData or device secret); an existing file is never overwritten.
const OG_MAX = 400 * 1024;
const ogUrl = id => `${SB_URL}/storage/v1/object/public/cards/og/${id}.jpg`;
async function ogExists(id) {
  try { return (await fetch(ogUrl(id), { method: 'HEAD' })).ok; } catch (e) { return false; }
}
async function ogCard(req, res, b, token) {
  // input is checked first but refused only after the rate limit and the sign-in check, so junk requests can't flood client_errors
  const id = /^\d{1,12}$/.test(String(b.season_id)) ? String(b.season_id) : null;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image || ''));
  const buf = m ? Buffer.from(m[1], 'base64') : null;
  const bad = !id ? [400, 'season_id?'] : !buf ? [400, 'image?'] : buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 ? [400, 'jpeg?'] : buf.length > OG_MAX ? [413, 'image too large'] : null;
  let pid = null;
  if (b.initData) {
    if (await rateLimit(req, res, 'og')) return;
    const mc = miniAppCheck(String(b.initData), token), u = mc.user;
    if (!u || !u.id) { await reportOnce('card og sig', 'card og', 'telegram signature: ' + (mc.why || 'no user id')); return res.status(401).json({ error: 'bad telegram signature' }); }
    const l = await sb(`player_links?kind=eq.tg&key=eq.${encodeURIComponent(String(u.id))}&select=player_id&limit=1`);
    pid = l && l[0] && l[0].player_id;
  } else {
    const g = await gate(req, res, 'og', b.device, b.secret == null ? '' : b.secret);
    if (g.done) return;
    if (!g.dev || g.dev.status) { const d = g.dev || {}; return refuse(res, d.status || 401, { error: d.error || 'device secret' }, 'card og'); }
    pid = g.dev.player;
  }
  if (bad) return refuse(res, bad[0], { error: bad[1] }, 'card og');
  if (!pid) return refuse(res, 403, { error: 'owner? no player for this account' }, 'card og');
  const rows = await sb(`seasons?id=eq.${id}&select=player_id,verified,practice&limit=1`);
  const s = rows && rows[0];
  if (!s || s.player_id !== pid || s.verified !== true || s.practice) return refuse(res, 403, { error: `owner? season ${id}: ${!s ? 'missing' : s.player_id !== pid ? 'other player' : s.verified !== true ? 'not verified' : 'practice'}` }, 'card og');
  if (await ogExists(id)) return res.status(200).json({ ok: true, og: ogUrl(id) });
  const key = env('SUPABASE_SERVICE_KEY'); if (!key) return fail(res, 'card og', new Error('no service key'));
  const r = await fetch(`${SB_URL}/storage/v1/object/cards/og/${id}.jpg`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: buf });
  if (!r.ok && !(await ogExists(id))) return fail(res, 'card og store', new Error(`storage ${r.status}`));   // a parallel upload may have won
  res.status(200).json({ ok: true, og: ogUrl(id) });
}
// refusal: reported to client_errors with its reason, then answered
async function refuse(res, code, j, where) { await report(where, j.error); return res.status(code).json(j); }
// a refused prepared message is reported with Telegram's text
async function prepared(r) { if (!r.ok) await report('card prepare', r.error); return r; }
// HTML caption: only <b> and links to the site itself; anything else is sent as plain text with the tags removed
const OWN_LINK = /^https:\/\/(upl30\.com\.ua|upl-30-0[a-z0-9-]*\.vercel\.app)\//;   // the site and this project's preview deployments
const htmlOk = c => !/[<>]/.test(String(c).replace(/<\/?b>|<\/a>/g, '').replace(/<a href="([^"<>]*)">/g, (m, h) => OWN_LINK.test(h) ? '' : '<'));
const plainOf = c => String(c).replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let stage = 'config';
  try {
    const token = env('TG_TOKEN'); if (!token) return fail(res, 'card', new Error('TG_TOKEN is not set'));
    stage = 'body';
    const b = body(req);
    if (b.og === true) { stage = 'og'; return await ogCard(req, res, b, token); }
    stage = 'rate';
    if (await rateLimit(req, res, 'card')) return;   // per IP
    stage = 'signature';
    const mc = miniAppCheck(String(b.initData || ''), token), u = mc.user;
    if (!u || !u.id) { await reportOnce('card sig', 'card', 'telegram signature: ' + (mc.why || 'no user id')); return res.status(401).json({ error: 'bad telegram signature' }); }
    stage = 'image';
    const m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(String(b.image || ''));
    if (!m) return refuse(res, 400, { error: 'image?' }, 'card');
    const buf = Buffer.from(m[2], 'base64');
    const html = b.parse_mode === 'HTML' && htmlOk(b.caption || '');
    if (b.parse_mode === 'HTML' && !html) b.caption = plainOf(b.caption || '');
    if (buf.length > 3.5e6) return refuse(res, 413, { error: 'image too large' }, 'card');
    if (b.share) {
      stage = 'channel';
      const fid = await cachePhoto(token, buf, m[1]).catch(e => report('card channel', e).then(() => null));
      if (fid) { stage = 'prepare'; return res.status(200).json(await prepared(await prepare(token, u, { photo_file_id: fid }, b.caption, html))); }
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
        return res.status(200).json(await prepared(await prepare(token, u, { photo_url: url, thumbnail_url: thumb || url, photo_width: 1080, photo_height: 1350 }, b.caption, html)));
      }
      if (b.prefetch) return res.status(200).json({ ok: false, error: 'store' });   // prefetch: no private-chat fallback
    }
    stage = 'send';
    const fd = new FormData();
    fd.append('chat_id', String(u.id));
    fd.append('caption', String(b.caption || '').slice(0, 1000));
    if (html) fd.append('parse_mode', 'HTML');
    fd.append('photo', new Blob([buf], { type: `image/${m[1]}` }), `30-0-upl.${m[1] === 'png' ? 'png' : 'jpg'}`);
    const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) {
      // user hasn't started the bot in private chat; the bot can't write first
      const blocked = /chat not found|bot can't initiate|blocked/i.test(j.description || '');
      if (!blocked) await report('card send', String(j.description || r.status));
      return res.status(200).json({ ok: false, need_start: blocked, error: String(j.description || r.status).slice(0, 160) });
    }
    if (!b.share) return res.status(200).json({ ok: true });
    // share fallback: card is a file on Telegram servers; delete it from the private chat and prepare the message
    stage = 'prepare';
    const photos = (j.result && j.result.photo) || [];
    const fileId = photos.length ? photos[photos.length - 1].file_id : null;
    if (!fileId) return refuse(res, 200, { ok: false, error: 'no file_id' }, 'card send');
    fetch(`https://api.telegram.org/bot${token}/deleteMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: u.id, message_id: j.result.message_id }) }).catch(() => {});
    res.status(200).json(await prepared(await prepare(token, u, { photo_file_id: fileId }, b.caption, html)));
  } catch (e) {
    fail(res, `card ${stage}`, e);
  }
};
