// Security headers in vercel.json for every route (C-8, simple set): nosniff, referrer policy, no camera/microphone/geolocation,
// HSTS with subdomains, and only frame-ancestors in the CSP (Telegram Web embeds the Mini App in a frame, so no X-Frame-Options).
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
T.check(!H['x-frame-options'] && !H['content-security-policy-report-only'], 'без X-Frame-Options (ламає Telegram Web) і без Report-Only');
process.exit(T.done());
