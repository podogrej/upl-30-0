// Code comments must be short technical English: no Cyrillic in any comment of tracked source files
// (JS, the HTML template incl. <script>/<style>, SQL, Python incl. docstrings, shell, YAML).
// Player-facing strings stay Ukrainian — only comments are checked. Generated index.html and lib/ are included (generators must emit English); pool.*.js and docs/ are skipped.
// Run from repo root: node tools/tests/code_comments.js
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const acorn = require(path.join(ROOT, 'tools', 'node_modules', 'acorn'));
const CYR = /[А-Яа-яЁёІіЇїЄєҐґ]/;
const files = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n')
  .filter(f => /\.(js|html|sql|py|sh|ya?ml)$/.test(f) && !/^(pool\.|docs\/|.*node_modules)/.test(f));   // generated index.html and lib/ are checked too: generators must emit English comments
const found = [];
const add = (f, src, pos, text) => { if (CYR.test(text)) found.push(`${f}:${src.slice(0, pos).split('\n').length}: ${text.replace(/\s+/g, ' ').trim().slice(0, 90)}`); };
function jsComments(f, src, offset = 0, whole = src) {
  const cs = [];
  for (const sourceType of ['script', 'module']) {
    try { cs.length = 0; acorn.parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true, onComment: cs }); break; }
    catch (e) { if (sourceType === 'module') { found.push(`${f}: не розбирається (${e.message})`); return; } }
  }
  for (const c of cs) add(f, whole, offset + c.start, c.value);
}
function sqlComments(f, src) {
  let i = 0, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) { if (c === q) { if (n === q) { i += 2; continue; } q = null; } i++; continue; }
    if (c === "'" || c === '"') { q = c; i++; continue; }
    if (c === '-' && n === '-') { const e = src.indexOf('\n', i); const end = e < 0 ? src.length : e; add(f, src, i, src.slice(i, end)); i = end; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; add(f, src, i, src.slice(i, end)); i = end; continue; }
    i++;
  }
}
function hashComments(f, src) {
  src.split('\n').forEach((line, k) => {
    let q = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === q && line[i - 1] !== '\\') q = null; continue; }
      if (c === "'" || c === '"') { q = c; continue; }
      if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) { if (CYR.test(line.slice(i))) found.push(`${f}:${k + 1}: ${line.slice(i).trim().slice(0, 90)}`); break; }
    }
  });
}
function pyComments(f) {
  const out = execSync(`python3 - ${JSON.stringify(path.join(ROOT, f))} <<'PY'
import ast, io, sys, tokenize
src = open(sys.argv[1], encoding='utf-8').read()
for t in tokenize.generate_tokens(io.StringIO(src).readline):
    if t.type == tokenize.COMMENT: print(t.start[0], t.string.replace('\\n', ' '))
for n in ast.walk(ast.parse(src)):
    b = getattr(n, 'body', None)
    if isinstance(b, list) and b and isinstance(b[0], ast.Expr) and isinstance(getattr(b[0], 'value', None), ast.Constant) and isinstance(b[0].value.value, str):
        print(b[0].lineno, b[0].value.value.replace('\\n', ' '))
PY`, { encoding: 'utf8' });
  for (const line of out.split('\n')) if (CYR.test(line)) found.push(`${f}:${line.slice(0, 100)}`);
}
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (/\.js$/.test(f)) jsComments(f, src);
  else if (/\.html$/.test(f)) {
    for (const m of src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) jsComments(f, m[1].replace(/\/\*__[A-Z_]+__\*\//g, ' '), m.index + m[0].indexOf(m[1]), src);
    for (const m of src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) for (const c of m[1].matchAll(/\/\*[\s\S]*?\*\//g)) add(f, src, m.index + c.index, c[0]);
    const markup = src.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, x => x.replace(/[^\n]/g, ' '));
    for (const c of markup.matchAll(/<!--(?!i:)[\s\S]*?-->/g)) add(f, src, c.index, c[0]);
  } else if (/\.sql$/.test(f)) sqlComments(f, src);
  else if (/\.py$/.test(f)) pyComments(f);
  else hashComments(f, src);
}
console.log(`перевірено файлів: ${files.length}`);
if (found.length) { console.log(`✗ коментарі не англійською: ${found.length}`); for (const x of (process.env.ALL ? found : found.slice(0, 40))) console.log('  ' + x); if (!process.env.ALL && found.length > 40) console.log(`  … ще ${found.length - 40}`); }
console.log(found.length ? 'code_comments: ПРОБЛЕМИ' : 'code_comments: УСЕ ГАРАЗД');
process.exitCode = found.length ? 1 : 0;   // not process.exit(): it would cut long piped output
