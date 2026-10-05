// /api/card offline: fake Telegram (fetch) and a real initData signature made with a test token.
// Run from repo root: node tools/tests/card_api.js
const crypto = require('crypto');
const TOKEN = '123:TEST'; process.env.TG_TOKEN = TOKEN; process.env.TG_BOT = 'upl30_bot'; process.env.SUPABASE_SERVICE_KEY = 'svc'; process.env.SUPABASE_URL = 'https://sb.test';
let STORAGE_OK = true, RATE_OK = true;   // RATE_OK: rate_hit response
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
function initData(user) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user), query_id: 'q1' });
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  p.set('hash', hmac(hmac('WebAppData', TOKEN), dcs).toString('hex')); return p.toString();
}
const calls = [];
global.fetch = async (url, opt) => { if (url.startsWith('https://sb.test/rest/v1/rpc/rate_hit')) return { ok: true, status: 200, text: async () => JSON.stringify(RATE_OK) };
  if (url.startsWith('https://sb.test/storage/')) { calls.push('storage'); return { ok: STORAGE_OK, status: STORAGE_OK ? 200 : 404, json: async () => ({}) }; }
  const m = url.split('/').pop(); calls.push(m);
  const body = opt.body instanceof FormData ? null : JSON.parse(opt.body || '{}');
  const R = x => ({ ok: true, status: 200, json: async () => x });
  if (m === 'sendPhoto') return R({ ok: true, result: { message_id: 7, photo: [{ file_id: 'small' }, { file_id: 'BIG' }] } });
  if (m === 'deleteMessage') return R({ ok: true, result: true });
  if (m === 'savePreparedInlineMessage') { global.prepBody = body; return R({ ok: true, result: { id: 'PREP1', expiration_date: 0 } }); }
  return R({ ok: false }); };
const handler = require('../../api/card.js');
const run = b => new Promise(res => { const r = { status(c) { this.c = c; return this; }, json(j) { res([this.c, j]); } }; handler({ method: 'POST', body: b }, r); });
const img = 'data:image/jpeg;base64,' + Buffer.from('fakejpeg').toString('base64');
let fail = 0; const check = (ok, m) => { if (!ok) { fail++; console.log('✗', m); } else console.log('✓', m); };
(async () => {
  let [c, j] = await run({ initData: initData({ id: 42, first_name: 'A' }), image: img, caption: 'hi' });
  check(c === 200 && j.ok && !j.prepared && calls.join() === 'sendPhoto', 'звичайна картка собі: лише sendPhoto');
  calls.length = 0;
  [c, j] = await run({ initData: initData({ id: 42, first_name: 'A' }), image: img, caption: 'hi', share: true });
  check(j.ok && j.prepared === 'PREP1' && calls.join() === 'storage,storage,savePreparedInlineMessage' && /^https:\/\/sb\.test\/storage\/v1\/object\/public\/cards\//.test(prepBody.result.photo_url), 'share через сховище: без особистого чату, photo_url з публічного bucket (і одне читання файлу перед відправкою, 0.67)');
  process.env.TG_CARDS_CHAT = '-100777'; calls.length = 0;
  [c, j] = await run({ initData: initData({ id: 42, first_name: 'A' }), image: img, caption: 'hi', share: true });
  check(j.ok && j.prepared === 'PREP1' && calls.join() === 'sendPhoto,savePreparedInlineMessage' && prepBody.result.photo_file_id === 'BIG' && !prepBody.result.photo_url, '0.67: службовий канал — картка йде як file_id, без сховища');
  delete process.env.TG_CARDS_CHAT;
  STORAGE_OK = false; calls.length = 0;
  [c, j] = await run({ initData: initData({ id: 42, first_name: 'A' }), image: img, caption: 'hi', share: true });
  await new Promise(r => setTimeout(r, 10));
  check(j.ok && j.prepared === 'PREP1', 'share: повертає id підготовленого повідомлення');
  check(calls.includes('deleteMessage') && calls.includes('savePreparedInlineMessage'), 'share: прибирає фото з особистих і готує повідомлення');
  check(prepBody.user_id === 42 && prepBody.result.photo_file_id === 'BIG' && prepBody.allow_group_chats && /startapp/.test(prepBody.result.reply_markup.inline_keyboard[0][0].url), 'share: найбільше фото, групи дозволені, кнопка на гру');
  [c, j] = await run({ initData: 'user=%7B%22id%22%3A1%7D&hash=bad', image: img });
  check(c === 401, 'чужий підпис — 401');
  RATE_OK = false; calls.length = 0;
  [c, j] = await run({ initData: initData({ id: 42, first_name: 'A' }), image: img, caption: 'hi' });
  check(c === 429 && /Забагато/.test(j.error) && !calls.length, 'забагато запитів — 429, у Telegram нічого не йде');
  process.exit(fail ? 1 : 0);
})();
