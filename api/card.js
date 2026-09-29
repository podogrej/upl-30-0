// 30-0 УПЛ — надіслати картку результату собі в Telegram (адреса /api/card)
// У застосунку Telegram довге натискання на картинку в Mini App не дає її зберегти, тому бот надсилає картку в особистий чат:
// звідти її можна зберегти, переслати друзям або викласти в сторіз.
// POST {initData, image: "data:image/jpeg;base64,…", caption}. Змінна оточення у Vercel: TG_TOKEN.
const crypto = require('crypto');
const env = k => String(process.env[k] || '').replace(/\s+/g, '');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

function checkMiniApp(initData, token) {
  const p = new URLSearchParams(initData); const hash = p.get('hash'); if (!hash) return null;
  p.delete('hash');
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  if (hmac(hmac('WebAppData', token), dcs).toString('hex') !== hash) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date') || 0) > 86400) return null;
  try { return JSON.parse(p.get('user')); } catch (e) { return null; }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let stage = 'config';
  try {
    const token = env('TG_TOKEN'); if (!token) return res.status(500).json({ error: 'TG_TOKEN не задано' });
    stage = 'body';
    let b = req.body || {}; if (typeof b === 'string') b = JSON.parse(b);
    stage = 'signature';
    const u = checkMiniApp(String(b.initData || ''), token);
    if (!u || !u.id) return res.status(401).json({ error: 'bad telegram signature' });
    stage = 'image';
    const m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(String(b.image || ''));
    if (!m) return res.status(400).json({ error: 'image?' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 3.5e6) return res.status(413).json({ error: 'image too large' });
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
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: `crash at ${stage}: ${String(e && e.message || e).slice(0, 160)}` });
  }
};
