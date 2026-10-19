// Security headers in vercel.json for every route (C-8, simple set): nosniff, referrer policy, no camera/microphone/geolocation,
// HSTS with subdomains, and only frame-ancestors in the CSP (Telegram Web embeds the Mini App in a frame, so no X-Frame-Options).
// Plus (0.90, enforced since 0.91.1) Content-Security-Policy on "/" and "/index.html": script-src with the sha256 of every inline script of index.html
// (build.py writes it), supabase-js only from its own jsdelivr path, frame-ancestors repeated, SRI for supabase-js, /api/err accepting CSP reports.
// Plus (0.90.4) Google sign-in uses the PKCE flow (login CSRF).
// Plus short marketing links: 302 redirects to the home page with UTM tags (docs/marketing/README.md, section 6).
// Run from repo root: node tools/tests/headers.js
const path = require('path');
const { checker } = require('./_site.js');
const cfg = require(path.join(__dirname, '..', '..', 'vercel.json'));
const T = checker('headers');
const all = (cfg.headers || []).find(h => h.source === '/(.*)');
const H = Object.fromEntries(((all && all.headers) || []).map(h => [h.key.toLowerCase(), h.value]));
T.check(!!all, 'правило для всіх адрес /(.*)');
T.check(H['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options: nosniff');
T.check(H['referrer-policy'] === 'strict-origin-when-cross-origin', 'Referrer-Policy');
T.check(/camera=\(\)/.test(H['permissions-policy']) && /microphone=\(\)/.test(H['permissions-policy']) && /geolocation=\(\)/.test(H['permissions-policy']), 'Permissions-Policy: камера, мікрофон, геолокація вимкнені');
T.check(/max-age=\d{7,}/.test(H['strict-transport-security']) && /includeSubDomains/.test(H['strict-transport-security']), 'HSTS з includeSubDomains');
T.check(H['content-security-policy'] === "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org", 'CSP: лише frame-ancestors (сайт і Telegram)');
T.check(!H['x-frame-options'] && !H['content-security-policy-report-only'], 'без X-Frame-Options (ламає Telegram Web) і без Report-Only на всіх адресах');
T.check(!(cfg.headers || []).some(h => h.headers.some(x => x.key.toLowerCase() === 'content-security-policy-report-only')), 'Report-Only більше ніде немає: політика діє');

// ---- short marketing links: temporary redirects keep the UTM tags the game reads on the first visit
const RD = Object.fromEntries((cfg.redirects || []).map(r => [r.source, r]));
const SHORT = { '/t': 'utm_source=threads&utm_medium=social&utm_campaign=post', '/tb': 'utm_source=threads&utm_medium=social&utm_campaign=bio',
  '/to': 'utm_source=threads&utm_medium=outreach', '/tg': 'utm_source=telegram&utm_medium=social&utm_campaign=post',
  '/ig': 'utm_source=instagram&utm_medium=social&utm_campaign=bio', '/tt': 'utm_source=tiktok&utm_medium=social&utm_campaign=bio',
  '/tr/:name([a-z0-9-]{1,48})': 'utm_source=tribuna&utm_medium=blog&utm_campaign=:name' };
T.check(Object.entries(SHORT).every(([k, q]) => RD[k] && RD[k].destination === '/?' + q && RD[k].statusCode === 302) && (cfg.redirects || []).length === 7, 'короткі посилання /t /tb /to /tg /ig /tt /tr/<назва> → 302 на головну з UTM');
T.check(!(cfg.rewrites || []).some(r => /^\/(t|tb|to|tg|ig|tt|tr)(\/|$)/.test(r.source)) && !['t', 'tb', 'to', 'tg', 'ig', 'tt', 'tr'].some(f => ['', '.html'].some(x => require('fs').existsSync(path.join(__dirname, '..', '..', f + x)))), 'короткі посилання не перетинаються з адресами сайту');

// ---- enforced CSP of the page itself
const fs = require('fs'), crypto = require('crypto'), ROOT = path.join(__dirname, '..', '..');
const ro = (cfg.headers || []).filter(h => h.source !== '/(.*)' && h.headers.some(x => x.key.toLowerCase() === 'content-security-policy'));
T.check(ro.map(h => h.source).sort().join() === '/,/index.html', 'повна CSP лише на «/» і «/index.html»', ro.map(h => h.source).join());
const CSP = ro.length ? ro[0].headers.find(x => x.key.toLowerCase() === 'content-security-policy').value : '';
T.check(ro.every(h => h.headers.length === 1 && h.headers[0].value === CSP), 'однакове правило для обох адрес');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// link preview text (Telegram, Threads): marketing never says "wheel"
{ const d = (html.match(/<meta property="og:description" content="([^"]*)">/) || [])[1] || '', m = (html.match(/<meta name="description" content="([^"]*)">/) || [])[1] || '';
  T.check(d.length > 40 && m.length > 40 && !/колес/i.test(d + m), 'опис для превʼю (og:description, description) є і без слова «колесо»'); }
// inline scripts the way the browser reads them: from <script> to the first </script>, no src, JavaScript type
const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m => !/\bsrc=/i.test(m[1]) && !/type=["']?(?!text\/javascript|module|application\/javascript)/i.test(m[1])).map(m => m[2]);
const want = [...new Set(inline.map(t => "'sha256-" + crypto.createHash('sha256').update(t, 'utf8').digest('base64') + "'"))].sort();
const have = (CSP.match(/'sha256-[A-Za-z0-9+/]+=*'/g) || []).sort();
T.check(inline.length >= 3 && want.length > 0 && JSON.stringify(want) === JSON.stringify(have), `хеші sha256 у CSP збігаються з убудованими скриптами index.html (${inline.length} скриптів)`, `${want.length} очікується, ${have.length} в правилі`);
const dirs = Object.fromEntries(CSP.split(';').map(x => x.trim()).filter(Boolean).map(x => [x.split(/\s+/)[0], x.split(/\s+/).slice(1)]));
T.check(['https://telegram.org', 'https://www.clarity.ms', 'https://scripts.clarity.ms', "'self'"].every(x => (dirs['script-src'] || []).includes(x)) && !(dirs['script-src'] || []).some(x => /unsafe-inline|unsafe-eval|\*/.test(x)), 'script-src: self, хеші й потрібні вузли, без unsafe-inline/unsafe-eval');
const sbSrc = (fs.readFileSync(path.join(ROOT, 'src', 'account.js'), 'utf8').match(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[\d.]+\//) || [''])[0];
T.check(!!sbSrc && (dirs['script-src'] || []).includes(sbSrc) && !(dirs['script-src'] || []).includes('https://cdn.jsdelivr.net'), 'jsdelivr лише шлях supabase-js тієї версії, що вантажить account.js', sbSrc);
T.check((dirs['frame-ancestors'] || []).join(' ') === H['content-security-policy'].replace(/^frame-ancestors /, ''), 'frame-ancestors повторено в CSP сторінки');
T.check((dirs['object-src'] || []).join() === "'none'" && (dirs['base-uri'] || []).join() === "'none'" && (dirs['report-uri'] || []).join() === '/api/err?csp=1', "object-src 'none', base-uri 'none', report-uri /api/err?csp=1");
// every external script the page adds must be allowed by script-src
const hosts = new Set([...html.matchAll(/\.src\s*=\s*["'`](https:\/\/[^/"'`]+)/g)].map(m => m[1]));
T.check(hosts.size >= 2 && [...hosts].every(h => (dirs['script-src'] || []).some(x => x === h || x.startsWith(h + '/') || x === h.replace(/^https:\/\/[^.]+\./, 'https://'))), 'зовнішні скрипти сторінки дозволені в script-src', [...hosts].join(' '));
T.check(/ src=["']pool\.[a-z0-9]+\.js["']/.test(html) && !/<script[^>]* src=["']https?:/i.test(html), 'пул — свій файл («self»), без зовнішніх <script src> у розмітці');

// ---- SRI for supabase-js (the exact file from the npm package, not the jsdelivr .min.js)
const acc = fs.readFileSync(path.join(ROOT, 'src', 'account.js'), 'utf8');
const sriOk = f => /supabase-js@2\.45\.4\/dist\/umd\/supabase\.js'/.test(f) && /\.integrity='sha384-[A-Za-z0-9+/]{64}'/.test(f) && /\.crossOrigin='anonymous'/.test(f) && !/src='[^']*supabase\.min\.js/.test(f);
T.check(sriOk(acc) && sriOk(html), 'supabase-js: integrity sha384 + crossOrigin anonymous (src/account.js і index.html)');
// Google sign-in via PKCE: a planted link with someone else's #access_token or ?code is rejected (login CSRF, 0.90.4)
T.check([acc, html].every(f => /flowType:'pkce'/.test(f) && !/flowType:'implicit'/.test(f)), 'вхід через Google — PKCE (чуже посилання з токеном не входить в чужий акаунт)');

// ---- /api/err accepts CSP reports (string and Buffer), one compact row, rate-limited, no new function
(async () => {
  const D = require(path.join(ROOT, 'api', '_device.js')), rows = []; let limited = false;
  D.sb = async (t, o) => { rows.push(...(o.body || [])); }; D.rateLimit = async (req, res, name) => { if (limited) { res.status(429).json({}); return true; } return name !== 'csp' ? false : false; };
  const err = require(path.join(ROOT, 'api', 'err.js'));
  const send = (body, q = { csp: '1' }, ct = 'application/csp-report') => new Promise(r => err({ method: 'POST', query: q, headers: { 'content-type': ct, 'user-agent': 'UA' }, body }, { status(c) { this.c = c; return this; }, json() { r(this.c); }, end() { r(this.c); } }));
  const rep = { 'csp-report': { 'document-uri': 'https://upl30.com.ua/?s=5#x', 'violated-directive': 'script-src-elem', 'effective-directive': 'script-src-elem', 'blocked-uri': 'https://evil.example/x.js', 'source-file': 'https://upl30.com.ua/', 'line-number': 12, 'column-number': 3 } };
  const c1 = await send(JSON.stringify(rep)), c2 = await send(Buffer.from(JSON.stringify(rep))), c3 = await send(rep);
  T.check(c1 === 204 && c2 === 204 && c3 === 204 && rows.length === 3, 'err: CSP-звіт як рядок, Buffer і обʼєкт → 204 і один рядок на звіт');
  T.check(rows[0] && /^CSP script-src-elem https:\/\/evil\.example/.test(rows[0].msg) && rows[0].url === 'https://upl30.com.ua/' && rows[0].screen === 'csp' && rows[0].line === 12, 'err: рядок короткий, адреса сторінки без query і #');
  const n = rows.length; await send(JSON.stringify({ 'csp-report': { ...rep['csp-report'], 'blocked-uri': 'chrome-extension://abc/x.js' } })); await send('{broken'); await send(JSON.stringify({ foo: 1 }));
  T.check(rows.length === n, 'err: звіти розширень браузера, зламаний JSON і чужий формат — не записуються (204)');
  limited = true; const c4 = await send(JSON.stringify(rep));
  T.check(c4 === 429 && rows.length === n, 'err: ліміт частоти для CSP-звітів');
  T.check(fs.readdirSync(path.join(ROOT, 'api')).filter(f => f.endsWith('.js') && !f.startsWith('_')).length <= 12, 'функцій Vercel не більше 12');
  process.exit(T.done());
})();
