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
const need = new Set();
const visit = name => {
  if (need.has(name) || SKIP.has(name) || !decl[name]) return;
  need.add(name);
  walk.full(decl[name].n, x => { if (x.type === 'Identifier') visit(x.name); });
};
ROOTS.forEach(visit);
const idxs = [...new Set([...need].map(k => decl[k].idx))].sort((a, b) => a - b);
let out = idxs.map(i => code.slice(body[i].start, body[i].end)).join('\n');
// побічні інструкції, потрібні рушію: вага клуб-сезонів для колеса та режим виклику дня
const extra = body.filter(n => n.type !== 'FunctionDeclaration' && n.type !== 'VariableDeclaration').map(n => code.slice(n.start, n.end))
  .filter(t => /^for\(const c of DATA\.clubs\)\{const r=c\.pl/.test(t) || /^MODES\.daily=/.test(t) || /^for\(const f in FORMATIONS\)FORMATIONS\[f\]\.slots=/.test(t));
if (extra.length !== 3) throw new Error('extra statements not found: ' + extra.length);
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
  const year=YEARS16[Math.floor(r()*YEARS16.length)];
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
module.exports = { VERSION: '${VERSION}', DATA, FORMATIONS, FORMATS, GROUP_OF, MODES, YEARS16, ANTI_MIN_APPS, effRating, mulberry32, hashStr, dailySetupFor, run, setFormat: f => { S.format = f; } };
`;
fs.mkdirSync(ROOT + '/lib', { recursive: true });
fs.writeFileSync(ROOT + '/lib/engine.js', mod);
console.log('engine: ' + need.size + ' declarations, ' + (mod.length / 1024).toFixed(0) + ' KB');
