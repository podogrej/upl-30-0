// Clarity loader in index.html (C-7): production host only, never in the Telegram Mini App, and never with a sign-in
// fragment in the URL (it waits for the app to consume it, then strips the rest). No browser: the head script runs with a fake window.
// Run from repo root: node tools/tests/clarity.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const { checker } = require('./_site.js');
const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const m = /<script>\/\* Microsoft Clarity[\s\S]*?\*\/([\s\S]*?)<\/script>/.exec(html);
const T = checker('clarity');
T.check(!!m, 'скрипт Clarity є в index.html');

// run the loader; returns what happened: [{t:'load', hash}] when the tag is inserted, [{t:'strip'}] on replaceState
function run({ host = 'upl30.com.ua', hash = '', session = {}, proxy = false, consumeAfter = null }) {
  const ev = [], timers = [];
  const location = { hostname: host, pathname: '/', search: '', hash };
  const doc = { createElement: () => ({}), getElementsByTagName: () => [{ parentNode: { insertBefore: () => ev.push({ t: 'load', hash: location.hash }) } }] };
  const win = { location, document: doc, sessionStorage: { getItem: k => session[k] || null },
    history: { replaceState: (a, b, url) => { ev.push({ t: 'strip' }); location.hash = ''; } },
    setInterval: f => { timers.push(f); return timers.length; }, clearInterval: () => { timers.length = 0; } };
  if (proxy) win.TelegramWebviewProxy = {};
  win.window = win;
  vm.runInNewContext(m[1], win);
  for (let k = 0; k < 40 && timers.length; k++) { if (consumeAfter != null && k === consumeAfter) location.hash = ''; timers.forEach(f => f()); }
  return ev;
}
if (m) {
  const plain = run({});
  T.check(plain.length === 1 && plain[0].t === 'load', 'прод, звичайна адреса — Clarity вантажиться одразу');
  T.check(!run({ host: 'upl-30-0-git-test.vercel.app' }).length && !run({ host: 'upl.test' }).length, 'тестовий сайт і автотести — без Clarity');
  T.check(!run({ hash: '#tgWebAppData=query_id%3Dx&tgWebAppVersion=7.0' }).length, 'Mini App (#tgWebAppData) — без Clarity');
  T.check(!run({ session: { __telegram__initParams: '{"tgWebAppData":"x"}' } }).length, 'Mini App після перезавантаження (sessionStorage) — без Clarity');
  T.check(!run({ proxy: true }).length, 'Mini App (TelegramWebviewProxy) — без Clarity');
  const g = run({ hash: '#access_token=eyJ.x.y&refresh_token=r&expires_in=3600', consumeAfter: 3 });
  T.check(g.length === 1 && g[0].t === 'load' && g[0].hash === '', 'вхід Google: чекає, поки сайт забере #access_token, потім вантажить (без токена в адресі)');
  const s = run({ hash: '#access_token=eyJ.x.y&refresh_token=r' });
  T.check(!s.length, 'токен не забрали за 10 с — Clarity не вантажиться, адресу не чіпаємо (вхід не зламається на повільній мережі)');
}
process.exit(T.done());
