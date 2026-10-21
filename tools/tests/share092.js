// 0.92 share, server side offline: /api/card og upload (owner, JPEG, no overwrite), /r/<id> preview (daily challenge, hidden formats, og:image, utm),
// traffic event 'share'. Run from repo root: node tools/tests/share092.js
const crypto = require('crypto');
const TOKEN = '123:TEST'; process.env.TG_TOKEN = TOKEN; process.env.SUPABASE_SERVICE_KEY = 'svc'; process.env.SUPABASE_URL = 'https://sb.test';
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
function initData(user) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user), query_id: 'q1' });
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  p.set('hash', hmac(hmac('WebAppData', TOKEN), dcs).toString('hex')); return p.toString();
}
const DEV = '11111111-1111-4111-8111-111111111111', SEC = 's'.repeat(32);
let OG_EXISTS = false, uploads = 0, SEASON, PUB_400 = false, traffic = [];
const R = (ok, j, status = ok ? 200 : 400) => ({ ok, status, text: async () => JSON.stringify(j), json: async () => j });
global.fetch = async (url, opt = {}) => {
  const m = opt.method || 'GET';
  if (url.includes('/rpc/rate_hit')) return R(true, true);
  if (url.includes('/rpc/api_gate')) { const b = JSON.parse(opt.body); return R(true, b.p_secret === SEC ? { rate: true, player: 'P1' } : { rate: true, err: 'secret' }); }
  if (url.includes('/rest/v1/player_links')) return R(true, /key=eq\.42&/.test(url) ? [{ player_id: 'P1' }] : []);
  if (url.includes('/rest/v1/seasons?')) return R(true, SEASON ? [SEASON] : []);
  if (url.includes('/rest/v1/traffic_events')) { traffic.push(JSON.parse(opt.body)); return R(true, null, 201); }
  if (url.includes('/rest/v1/seasons_pub')) { if (PUB_400 && /vd_day/.test(url)) return R(false, {}, 400); return R(true, [PUB]); }
  if (url.includes('/storage/v1/object/public/cards/og/')) return { ok: OG_EXISTS, status: OG_EXISTS ? 200 : 404 };
  if (url.includes('/storage/v1/object/cards/og/')) { uploads++; OG_EXISTS = true; return { ok: true, status: 200 }; }
  return R(false, {}, 404);
};
const mk = (b) => new Promise(res => { const r = { status(c) { this.c = c; return this; }, json(j) { res([this.c, j]); }, end() { res([this.c]); } }; require('../../api/card.js')({ method: 'POST', body: b, headers: {} }, r); });
const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
let bad = 0; const check = (ok, m) => { if (!ok) { bad++; console.log('✗', m); } else console.log('✓', m); };
let PUB = { id: 7, w: 20, d: 5, l: 5, pts: 65, place: 2, gf: 50, ga: 20, format: 'classic', verified: true, players: { name: 'Vitia' } };
const prev = async (query) => new Promise(res => { const r = { setHeader(k, v) { (this.h = this.h || {})[k] = v; }, status() { return this; }, send(h) { res([h, this.h]); } };
  require('../../api/r.js')({ query: { id: '7', ...query }, headers: { host: 'upl30.com.ua' } }, r); });
(async () => {
  SEASON = { player_id: 'P1', verified: true, practice: false };
  let [c, j] = await mk({ og: true, season_id: 7, image: jpeg, device: DEV, secret: SEC });
  check(c === 200 && j.ok && j.og === 'https://sb.test/storage/v1/object/public/cards/og/7.jpg' && uploads === 1, 'власник (пристрій): картка збережена, відповідь ok + og');
  [c, j] = await mk({ og: true, season_id: 7, image: jpeg, device: DEV, secret: SEC });
  check(c === 200 && j.ok && uploads === 1, 'повтор: ok без перезапису');
  OG_EXISTS = false;
  [c] = await mk({ og: true, season_id: 7, image: jpeg, initData: initData({ id: 42, first_name: 'A' }) });
  check(c === 200 && uploads === 2, 'власник (Telegram): ok');
  OG_EXISTS = false;
  [c] = await mk({ og: true, season_id: 7, image: jpeg, initData: initData({ id: 43, first_name: 'B' }) });
  check(c === 403 && uploads === 2, 'Telegram без привʼязаного гравця: 403');
  SEASON = { player_id: 'P2', verified: true, practice: false };
  [c] = await mk({ og: true, season_id: 7, image: jpeg, device: DEV, secret: SEC });
  check(c === 403 && uploads === 2, 'чужий сезон: 403');
  SEASON = { player_id: 'P1', verified: false, practice: false };
  [c] = await mk({ og: true, season_id: 7, image: jpeg, device: DEV, secret: SEC });
  check(c === 403, 'неперевірений сезон: 403');
  SEASON = { player_id: 'P1', verified: true, practice: true };
  [c] = await mk({ og: true, season_id: 7, image: jpeg, device: DEV, secret: SEC });
  check(c === 403, 'тренування: 403');
  SEASON = { player_id: 'P1', verified: true, practice: false };
  [c] = await mk({ og: true, season_id: 7, image: jpeg, device: DEV, secret: 'x'.repeat(32) });
  check(c === 401, 'хибний секрет: 401');
  [c] = await mk({ og: true, season_id: 7, image: 'data:image/jpeg;base64,' + Buffer.from('notajpeg').toString('base64'), device: DEV, secret: SEC });
  check(c === 400, 'не JPEG: 400');
  [c] = await mk({ og: true, season_id: 7, image: 'data:image/png;base64,AAAA', device: DEV, secret: SEC });
  check(c === 400, 'PNG: 400');
  [c] = await mk({ og: true, season_id: 7, image: 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(401 * 1024)]).toString('base64'), device: DEV, secret: SEC });
  check(c === 413, 'більше 400 КБ: 413');
  [c] = await mk({ og: true, season_id: 'x', image: jpeg, device: DEV, secret: SEC });
  check(c === 400, 'season_id не число: 400');

  // preview
  OG_EXISTS = false;
  let [h, hd] = await prev({});
  check(/og\.jpg/.test(h) && /1200/.test(h), 'без файлу: загальна картинка og.jpg 1200x630');
  check(!/http-equiv="refresh"/i.test(h) && /location\.replace\(/.test(h), 'перехід на сайт лише скриптом: бот месенджера лишається на сторінці сезону');
  OG_EXISTS = true;
  [h] = await prev({});
  check(/og\/7\.jpg/.test(h) && /og:image:width" content="1080"/.test(h) && /height" content="1350"/.test(h) && !/og\.jpg/.test(h), 'з файлом: og/7.jpg 1080x1350');
  PUB = { ...PUB, vd_day: '2026-10-19', vd_score: 9, vd_gate: true };
  [h] = await prev({});
  check(/Vitia: Виклик дня №11 · 🥇 9 з 11/.test(h), 'виклик дня: заголовок, номер 11 для 19.10, медаль');
  PUB = { ...PUB, vd_day: '2026-10-09', vd_score: 3 };
  [h] = await prev({});
  check(/Виклик дня №1 · 3 з 11/.test(h) && !/🥉/.test(h), 'виклик №1, менше 4 — без медалі');
  PUB = { ...PUB, vd_day: '2026-10-10', vd_score: 11 };
  [h] = await prev({});
  check(/№2 · ⭐ 11 з 11/.test(h), '11 з 11 — зірка');
  PUB = { id: 7, w: 20, d: 5, l: 5, pts: 65, place: 2, gf: 50, ga: 20, format: 'derby', verified: true, players: { name: 'Vitia' } };
  [h] = await prev({});
  check(!/дербі|легенд|Один клуб/i.test(h) && /30-0 УПЛ · голи/.test(h), 'прихований режим: нейтрально «30-0 УПЛ»');
  PUB.format = 'legends'; [h] = await prev({});
  check(!/легенд/i.test(h), 'ліга легенд не названа');
  PUB.format = 'anti'; [h] = await prev({});
  check(/Антисезон/.test(h), 'видимий режим названо');
  PUB_400 = true; PUB.format = 'classic';
  [h] = await prev({});
  check(/Vitia/.test(h) && !/Виклик/.test(h), 'старе сховище без vd_*: перевірка повторюється без них');
  [h] = await prev({ utm_source: 'telegram', utm_medium: 'share', utm_campaign: 'r', foo: 'bar' });
  check(/\?s=7&amp;utm_source=telegram&amp;utm_medium=share&amp;utm_campaign=r"/.test(h) && !/foo/.test(h) && /replace\("[^"]*\?s=7&utm_source=telegram/.test(h), 'utm переноситься, чужі параметри — ні');
  [h] = await prev({ utm_source: 'https://evil.com/<x>', url: 'https://evil.com', next: '//evil.com' });
  check(!/evil\.com\/|url=https:\/\/evil|<x>/.test(h) && /replace\("https:\/\/upl30\.com\.ua\/\?s=7/.test(h), 'без відкритого редиректу, значення фільтруються');

  // traffic
  const err = require('../../api/err.js');
  const t = await new Promise(res => err({ method: 'POST', body: { traffic: { anon_id: DEV, event: 'share', utm_medium: 'Telegram' } }, headers: {} }, { status() { return this; }, end() { res(1); }, json() { res(1); } }));
  check(traffic.length === 1 && traffic[0].event === 'share' && traffic[0].utm_medium === 'telegram', "подія 'share' приймається, канал у utm_medium");
  console.log(bad ? `share092: ПРОБЛЕМИ ${bad}` : 'share092: УСЕ ГАРАЗД'); process.exit(bad ? 1 : 0);
})();
