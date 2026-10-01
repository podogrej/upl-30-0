// Запуск з кореня репозиторію: node tools/make_engine.js → lib/engine.js
// Генерує серверний рушій симуляції з template.html: бере з гри рівно ті функції й константи, від яких залежить simulate(),
// щоб сервер рахував сезон ідентично браузеру. Запуск: node tools/make_engine.js  → lib/engine.js (з пулом усередині)
const fs = require('fs');
const req = m => { try { return require(m); } catch (e) { return require('/opt/node-tools/node_modules/' + m); } };   // npm i acorn acorn-walk у tools/
const acorn = req('acorn');
const walk = req('acorn-walk');
const ROOT = __dirname + '/..';
const html = fs.readFileSync(ROOT + '/src/template.html', 'utf8').replace('/*__TROPHIES__*/', '');
// головний скрипт гри — IIFE після <script id="pool">
const start = html.indexOf('<script>\n(function(){');
const end = html.indexOf('</script>', start);
const code = html.slice(start + '<script>\n'.length, end);
const ast = acorn.parse(code, { ecmaVersion: 'latest' });
const body = ast.body[0].expression.callee.body.body;   // тіло IIFE
const decl = {};   // ім'я → {node, idx}
body.forEach((n, idx) => {
  if (n.type === 'FunctionDeclaration') decl[n.id.name] = { n, idx };
  if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (d.id.type === 'Identifier') decl[d.id.name] = { n, idx };
});
const ROOTS = ['simulate', 'effRating', 'slotPenalty', 'FORMATIONS', 'FORMATS', 'GROUP_OF', 'MODES', 'mulberry32', 'hashStr', 'pickWeighted', 'YEARS16', 'ANTI_MIN_APPS', 'tierOf'];
const SKIP = new Set(['DATA', 'S', 'rnd', 'document', 'window', 'BEST']);   // підставляємо самі
// глобальні об'єкти JS/браузера, які рушій може згадувати; будь-яке інше невідоме ім'я — помилка збірки (а не тихий ReferenceError на сервері)
const KNOWN = new Set(['Math', 'Object', 'Array', 'Number', 'String', 'Boolean', 'JSON', 'Set', 'Map', 'WeakMap', 'Symbol', 'Date', 'Intl', 'Error', 'RegExp', 'Promise',
  'Infinity', 'NaN', 'undefined', 'isFinite', 'isNaN', 'parseInt', 'parseFloat', 'console', 'arguments', 'localStorage', 'crypto', 'Uint8Array', 'Uint32Array',
  'encodeURIComponent', 'decodeURIComponent', 'navigator', 'location', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'getComputedStyle', 'NodeFilter',
  'fetch', 'history', 'screen', 'performance', 'requestAnimationFrame', 'Image', 'Blob', 'File', 'URL', 'URLSearchParams', 'AbortController', 'globalThis']);
// імена, оголошені в області видимості вузла (функція: параметри, var усередині, ім'я виразу-функції; блок: let/const/class/function; for; catch)
const patNames = (p, out = []) => {
  if (!p) return out;
  if (p.type === 'Identifier') out.push(p.name);
  else if (p.type === 'ObjectPattern') p.properties.forEach(q => patNames(q.type === 'RestElement' ? q.argument : q.value, out));
  else if (p.type === 'ArrayPattern') p.elements.forEach(q => patNames(q, out));
  else if (p.type === 'RestElement') patNames(p.argument, out);
  else if (p.type === 'AssignmentPattern') patNames(p.left, out);
  return out;
};
const isFn = n => /Function/.test(n.type);
function varsIn(node, out) {   // var-оголошення всередині функції (без вкладених функцій)
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'VariableDeclaration' && node.kind === 'var') node.declarations.forEach(d => patNames(d.id, out));
  for (const k of Object.keys(node)) { const v = node[k];
    if (Array.isArray(v)) v.forEach(c => { if (c && typeof c.type === 'string' && !isFn(c)) varsIn(c, out); });
    else if (v && typeof v.type === 'string' && !isFn(v)) varsIn(v, out); }
}
const SCOPE = new WeakMap();
function declaredIn(n) {
  if (SCOPE.has(n)) return SCOPE.get(n);
  const out = [];
  const lexical = list => list.forEach(st => {
    if (st.type === 'VariableDeclaration' && st.kind !== 'var') st.declarations.forEach(d => patNames(d.id, out));
    if ((st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') && st.id) out.push(st.id.name);
  });
  if (isFn(n)) { n.params.forEach(p => patNames(p, out)); if (n.type === 'FunctionExpression' && n.id) out.push(n.id.name); varsIn(n.body, out); }
  else if (n.type === 'BlockStatement' || n.type === 'Program') lexical(n.body);
  else if (n.type === 'SwitchStatement') n.cases.forEach(c => lexical(c.consequent));
  else if ((n.type === 'ForStatement' && n.init && n.init.type === 'VariableDeclaration') ) n.init.declarations.forEach(d => patNames(d.id, out));
  else if ((n.type === 'ForInStatement' || n.type === 'ForOfStatement') && n.left.type === 'VariableDeclaration') n.left.declarations.forEach(d => patNames(d.id, out));
  else if (n.type === 'CatchClause' && n.param) patNames(n.param, out);
  const set = new Set(out); SCOPE.set(n, set); return set;
}
// вільні (не локальні) імена у вузлі верхнього рівня: ключі властивостей (a.place, {place: 1}) і локальні змінні (const place=…) — не залежності
function freeNames(top) {
  const names = new Set();
  walk.fullAncestor(top, (x, st, anc) => {
    if (x.type !== 'Identifier') return;
    const parent = anc[anc.length - 2];
    if (parent && parent.type === 'MemberExpression' && parent.property === x && !parent.computed) return;
    if (parent && (parent.type === 'Property' || parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') && parent.key === x && !parent.computed && parent.value !== x) return;
    if (parent && (parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement')) return;
    for (let i = anc.length - 2; i >= 0; i--) if (declaredIn(anc[i]).has(x.name)) return;   // локальне ім'я
    names.add(x.name);
  });
  return names;
}
const need = new Set();
const visit = name => {
  if (need.has(name) || SKIP.has(name)) return;
  if (!decl[name]) { if (KNOWN.has(name)) return; throw new Error(`make_engine: невідоме ім'я «${name}» — ні оголошення в грі, ні відомого глобального об'єкта`); }
  need.add(name);
  for (const x of freeNames(decl[name].n)) visit(x);
};
ROOTS.forEach(visit);
// побічні інструкції, потрібні рушію: вага клуб-сезонів для колеса та режим виклику дня
const extraN = body.filter(n => n.type !== 'FunctionDeclaration' && n.type !== 'VariableDeclaration')
  .filter(n => { const t = code.slice(n.start, n.end); return /^for\(const c of DATA\.clubs\)\{const r=c\.pl/.test(t) || /^MODES\.daily=/.test(t) || /^for\(const f in FORMATIONS\)FORMATIONS\[f\]\.slots=/.test(t); });
if (extraN.length !== 3) throw new Error('extra statements not found: ' + extraN.length);
extraN.forEach(n => { for (const x of freeNames(n)) visit(x); });
const extra = extraN.map(n => code.slice(n.start, n.end));
// ім'я, яке дописуємо нижче вручну (dailySetupFor, run, module.exports), має бути в рушії
['LEAGUE_CULT', 'LEAGUE_LEGENDS', 'LEAGUES', 'YEARS16', 'ERAS', 'hashStr', 'mulberry32', 'pickWeighted'].forEach(visit);
const idxs = [...new Set([...need].map(k => decl[k].idx))].sort((a, b) => a - b);
let out = idxs.map(i => code.slice(body[i].start, body[i].end)).join('\n');
const pool = fs.readFileSync(ROOT + '/src/pool.json', 'utf8');
const VERSION = (html.match(/версі[яї] ([\d.]+)/) || [])[1] || '?';   // підвал: «Що нового у версії X.YY»
const mod = `// ЗГЕНЕРОВАНО tools/make_engine.js з template.html — не редагувати вручну. Рушій симуляції 30-0 УПЛ для сервера.
'use strict';
const DATA = ${pool};
let S = { format: 'classic' };
let rnd = Math.random;
${out}
${extra.join('\n')}
function dailySetupFor(day){
  const r=mulberry32(hashStr("upl30|"+day+"|setup"));
  const fs=Object.keys(FORMATIONS);const formation=fs[Math.floor(r()*fs.length)];
  const year=LEAGUE_LEGENDS;   // з 0.64 — «Ліга легенд» (0.50–0.63 — «Ліга культових клубів»), як dailySetup у template.html
  const prev=S.format;S.format='classic';
  const wr=mulberry32(hashStr("upl30|"+day+"|wheel"));const seq=[];for(let i=0;i<600;i++){const c=pickWeighted(DATA.clubs,wr);seq.push(DATA.clubs.indexOf(c));}
  S.format=prev;return {formation,year,seq};
}
// перерахунок сезону з seed: xi — [{id, slot, r}] у порядку слотів схеми
function run({ xi, mode, format, year, seed }){
  S.format = format; rnd = mulberry32(seed);
  const r = simulate(xi, MODES[mode], year);
  rnd = Math.random; S.format = 'classic';
  return r;
}
module.exports = { VERSION: '${VERSION}', DATA, FORMATIONS, FORMATS, GROUP_OF, MODES, YEARS16, LEAGUE_CULT, LEAGUE_LEGENDS, LEAGUES, ERAS, ANTI_MIN_APPS, effRating, mulberry32, hashStr, dailySetupFor, run, setFormat: f => { S.format = f; } };
`;
fs.mkdirSync(ROOT + '/lib', { recursive: true });
fs.writeFileSync(ROOT + '/lib/engine.js', mod);
// рушій 5×5 (0.63) — копія src/five_core.js для сервера (api/fl5.js): src/ не викладається на Vercel (.vercelignore)
fs.writeFileSync(ROOT + '/lib/five_core.js', '// ЗГЕНЕРОВАНО з src/five_core.js (node tools/make_engine.js) — не правити\n' + fs.readFileSync(ROOT + '/src/five_core.js', 'utf8'));
console.log('engine: ' + need.size + ' declarations, ' + (mod.length / 1024).toFixed(0) + ' KB');
