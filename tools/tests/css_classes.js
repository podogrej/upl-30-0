// CSS class collisions: a new global rule must not hit markup it was not written for.
// A rule is global for a class when its leftmost compound is just that class (".nm{..}", ".nm>h2", ".nm:hover"),
// after dropping page-wide ancestors (html, body, :root, [data-theme=..]). Snapshot tools/tests/css_classes.json: class -> {bare, owners}
// (owners = files in src/ whose markup or JS uses the class). Fails when, compared to the snapshot:
//  - a class gets its first global rule while 2+ files already use it (0.85: section rule .nm hit player names), or
//  - a new class name in CSS is shorter than 4 chars without a hyphen (use a section prefix: nm-...).
// Intended change: node tools/tests/css_classes.js --update, and commit the snapshot.
// Run from repo root: node tools/tests/css_classes.js
const path=require('path'),fs=require('fs');
const ROOT=path.join(__dirname,'..','..'),SRC=path.join(ROOT,'src'),SNAP=path.join(__dirname,'css_classes.json');
const {checker}=require('./_site.js');
const tpl=fs.readFileSync(path.join(SRC,'template.html'),'utf8');
// ---------- CSS: selectors of every style rule, at-rules (media, supports, keyframes) unwrapped
function selectors(css){
  css=css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g,'""');
  const out=[],stack=[];let buf='';
  for(const ch of css){
    if(ch==='{'){const pre=buf.trim();buf='';const inRule=stack.includes('rule')||stack.includes('kf');
      if(inRule)stack.push('decl');else if(pre.startsWith('@'))stack.push(/^@(-\w+-)?keyframes/.test(pre)?'kf':'at');else{stack.push('rule');out.push(pre);}}
    else if(ch==='}'){stack.pop();buf='';}
    else if(ch===';'&&!stack.includes('rule'))buf='';
    else buf+=ch;}
  return out;}
// split by a top-level separator (commas, not inside :is()/:not() or [..])
function splitTop(s,re){const out=[];let d=0,cur='';for(const ch of s){if(ch==='('||ch==='[')d++;else if(ch===')'||ch===']')d--;if(d===0&&re.test(ch)){out.push(cur);cur='';continue;}cur+=ch;}out.push(cur);return out.map(x=>x.trim()).filter(Boolean);}
const GLOBAL_ANC=/^(html|body|:root|\[data-theme[^\]]*\]|:root\[data-theme[^\]]*\]|html\[data-theme[^\]]*\])$/;
const classesIn=s=>[...s.replace(/\[[^\]]*\]/g,'').matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(m=>m[1]);
function cssClasses(css){const all=new Set(),bare=new Set();
  for(const sel of selectors(css))for(const one of splitTop(sel,/,/)){
    classesIn(one).forEach(c=>all.add(c));
    const parts=splitTop(one.replace(/\s*([>+~])\s*/g,' $1 '),/\s/).filter(p=>!/^[>+~]$/.test(p));
    while(parts.length>1&&GLOBAL_ANC.test(parts[0]))parts.shift();
    const m=/^\.([a-zA-Z_][\w-]*)((?:::?[\w-]+(?:\([^)]*\))?)*)$/.exec(parts[0]||'');   // leftmost compound: one class plus pseudos only
    if(m)bare.add(m[1]);}
  return {all,bare};}
const css=[...tpl.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
const {all,bare}=cssClasses(css);
// ---------- markup and JS templates: class="..", className=.., classList.*('..'), toggle('..')
function markupClasses(txt){const out=new Set(),add=s=>{for(const t of s.replace(/\$\{[^}]*\}/g,' ').split(/\s+/))if(/^[a-zA-Z_][\w-]*$/.test(t))out.add(t);};
  for(const m of txt.matchAll(/class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g))add(m[1]||m[2]||m[3]||'');
  for(const m of txt.matchAll(/classList\.(?:add|remove|toggle|contains|replace)\(([^)]*)\)/g))for(const q of m[1].matchAll(/['"`]([^'"`]+)['"`]/g))add(q[1]);
  return out;}
const files=['template.html',...fs.readdirSync(SRC).filter(f=>f.endsWith('.js')).sort()];
const owners={};
for(const f of files){const txt=f==='template.html'?tpl.replace(/<style[^>]*>[\s\S]*?<\/style>/g,''):fs.readFileSync(path.join(SRC,f),'utf8');
  for(const c of markupClasses(txt))(owners[c]=owners[c]||[]).push(f);}
const now={};for(const c of [...all].sort())now[c]={bare:bare.has(c),owners:(owners[c]||[]).length};
if(process.argv.includes('--update')){fs.writeFileSync(SNAP,JSON.stringify(now,null,0).replace(/\},"/g,'},\n"')+'\n');console.log(`css_classes.json: ${Object.keys(now).length} класів`);process.exit(0);}
// ---------- checks against the snapshot
const T=checker('CSS-класи');
const snap=JSON.parse(fs.readFileSync(SNAP,'utf8'));
const short=c=>c.length<4&&!c.includes('-');
const newShort=Object.keys(now).filter(c=>!snap[c]&&short(c));
T.check(!newShort.length,`нові класи в CSS не короткі (≥ 4 символи або з дефісом): `+(newShort.map(c=>'.'+c).join(', ')||'нових коротких немає'));
const newGlobal=Object.keys(now).filter(c=>now[c].bare&&snap[c]&&!snap[c].bare&&(owners[c]||[]).length>=2);   // only classes that already existed: a brand-new prefixed class may span files
T.check(!newGlobal.length,`нове глобальне правило не чіпляє класи, які вже вживають кілька файлів`+newGlobal.map(c=>`\n    .${c} — уже в ${owners[c].join(', ')}: дай розділу свій клас із приставкою`).join(''));
T.check(all.size>200&&bare.size>100,`розібрано CSS: класів ${all.size}, глобальних ${bare.size}; у розмітці ${Object.keys(owners).length}`);
const gone=Object.keys(snap).filter(c=>!now[c]).length,added=Object.keys(now).filter(c=>!snap[c]);
if(gone||added.length)console.log(`· знімок застарів (нових ${added.length}, зниклих ${gone}): node tools/tests/css_classes.js --update`);
process.exit(T.done());
