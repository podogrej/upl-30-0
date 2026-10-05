// Verifies that a change touched comments only: for every file changed since <base> (default origin/test),
// the code with comments stripped must be identical before and after.
// JS: acorn token stream; template/HTML: <script> via acorn, <style> without /* */, markup without <!-- --> (build markers kept);
// SQL: without -- and /* */ (quote-aware); Python: AST without docstrings; shell/YAML: without # comments (quote-aware).
// Usage from repo root: node tools/comments_only.js [base] [file ...]   → exit 0 when only comments changed (all changed files, or just the listed ones).
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const acorn = require(path.join(__dirname, 'node_modules', 'acorn'));
const base = process.argv[2] || 'origin/test';
const sh = c => execSync(c, { encoding: 'utf8', maxBuffer: 1 << 28 });

function jsTokens(src) {
  const out = [], opts = { ecmaVersion: 'latest', allowHashBang: true, allowReturnOutsideFunction: true };
  for (const sourceType of ['script', 'module']) {
    try { out.length = 0; for (const t of acorn.tokenizer(src, { ...opts, sourceType })) out.push(t.type.label + '\u0001' + (t.value === undefined ? '' : String(t.value))); return out.join('\u0002'); }
    catch (e) { if (sourceType === 'module') throw e; }
  }
}
const KEEP = /\/\*__[A-Z_]+__\*\/|<!--i:[\w-]+-->/g;   // build.py markers and icon macros are code, not comments
const norm = s => s.replace(/\s+/g, ' ').trim();
function htmlStrip(src) {
  return src.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, a, body, b) => {
    const marks = []; const b2 = body.replace(KEEP, x => { marks.push(x); return `__KEEP${marks.length - 1}__`; });
    let t; try { t = jsTokens(b2); } catch (e) { t = 'UNPARSABLE:' + norm(b2); }
    return `${a}${t}${marks.join('')}${b}`;
  }).replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, a, body, b) => a + norm(body.replace(KEEP, x => '\u0003' + x + '\u0003').replace(/\/\*(?!__)[\s\S]*?\*\//g, ' ')) + b)
    .replace(/<!--(?!i:)[\s\S]*?-->/g, ' ').replace(/\s+/g, ' ');
}
function sqlStrip(src) {
  let out = '', i = 0, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) { out += c; if (c === q) { if (n === q) { out += n; i += 2; continue; } q = null; } i++; continue; }
    if (c === "'" || c === '"') { q = c; out += c; i++; continue; }
    if (c === '-' && n === '-') { while (i < src.length && src[i] !== '\n') i++; out += ' '; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; out += ' '; continue; }
    out += c; i++;
  }
  return norm(out);
}
function hashStrip(src) {   // shell / YAML: # starts a comment at line start or after whitespace, outside quotes
  return norm(src.split('\n').map(line => {
    let q = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === q && line[i - 1] !== '\\') q = null; continue; }
      if (c === "'" || c === '"') { q = c; continue; }
      if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
    }
    return line;
  }).join('\n'));
}
function pyStrip(file, src) {
  const tmp = path.join(require('os').tmpdir(), 'co_' + process.pid + '.py'); fs.writeFileSync(tmp, src);
  try {
    return sh(`python3 -c "
import ast,sys
t=ast.parse(open(sys.argv[1],encoding='utf-8').read())
for n in ast.walk(t):
    b=getattr(n,'body',None)
    if isinstance(b,list) and b and isinstance(b[0],ast.Expr) and isinstance(getattr(b[0],'value',None),ast.Constant) and isinstance(b[0].value.value,str): n.body=b[1:] or [ast.Pass()]
print(ast.dump(t))" ${JSON.stringify(tmp)}`);
  } finally { fs.unlinkSync(tmp); }
}
function strip(file, src) {
  if (/\.(js|mjs|cjs)$/.test(file)) return jsTokens(src);
  if (/\.html?$/.test(file)) return htmlStrip(src);
  if (/\.sql$/.test(file)) return sqlStrip(src);
  if (/\.py$/.test(file)) return pyStrip(file, src);
  if (/\.(sh|ya?ml)$/.test(file) || /(^|\/)\.(gitignore|vercelignore)$/.test(file)) return hashStrip(src);
  return null;   // other files: not checked here
}

const only = process.argv.slice(3);
const files = only.length ? only : sh(`git diff --name-only ${base} --`).trim().split('\n').filter(Boolean);
let bad = 0, ok = 0, skipped = [];
for (const f of files) {
  if (!fs.existsSync(f)) { skipped.push(f + ' (deleted)'); continue; }
  let before = ''; try { before = sh(`git show ${base}:${JSON.stringify(f).slice(1, -1)}`); } catch (e) { skipped.push(f + ' (new)'); continue; }
  const after = fs.readFileSync(f, 'utf8');
  let a, b;
  try { a = strip(f, before); b = strip(f, after); } catch (e) { console.log('✗', f, '— не розбирається:', e.message.split('\n')[0]); bad++; continue; }
  if (a === null) { skipped.push(f); continue; }
  if (a === b) { ok++; continue; }
  bad++;
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  console.log('✗', f, '— змінено не лише коментарі. Перша різниця:\n   було:  ', JSON.stringify(a.slice(Math.max(0, i - 60), i + 80)), '\n   стало: ', JSON.stringify(b.slice(Math.max(0, i - 60), i + 80)));
}
if (skipped.length) console.log('· не перевірялось:', skipped.join(', '));
console.log(bad ? `ЗМІНЕНО КОД у ${bad} файлах` : `лише коментарі: ${ok} файлів`);
process.exit(bad ? 1 : 0);
