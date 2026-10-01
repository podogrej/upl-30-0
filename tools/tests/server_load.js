// Сервер на Vercel бачить лише api/ і lib/ (src/, tools/, data/, docs/, sql/ — у .vercelignore). Перевірка: кожен api/*.js завантажується
// з копії, де є тільки api/, lib/ і корінні файли, що не в .vercelignore (так упав /api/fl5 у 0.63). Запуск з кореня: node tools/tests/server_load.js
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const ROOT=path.join(__dirname,'..','..');const ign=fs.readFileSync(path.join(ROOT,'.vercelignore'),'utf8').split('\n').map(s=>s.trim().replace(/\/$/,'')).filter(Boolean);
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'vc-'));
for(const f of fs.readdirSync(ROOT)){if(f==='.git'||f==='node_modules'||ign.some(g=>g===f||(g.startsWith('*')&&f.endsWith(g.slice(1)))))continue;cp.execSync(`cp -r "${path.join(ROOT,f)}" "${tmp}/"`);}
let bad=0;
for(const f of fs.readdirSync(path.join(tmp,'api')).filter(f=>f.endsWith('.js'))){
  const r=cp.spawnSync(process.execPath,['-e',`require(${JSON.stringify(path.join(tmp,'api',f))})`],{cwd:tmp,encoding:'utf8',env:{...process.env,NODE_PATH:''}});
  if(r.status!==0){bad++;console.log('✗ api/'+f+' не завантажується без src/: '+(r.stderr||'').split('\n').find(l=>/Error/.test(l)));}else console.log('✓ api/'+f);}
fs.rmSync(tmp,{recursive:true,force:true});
console.log(bad?`сервер: ПРОБЛЕМИ ${bad}`:'сервер: УСЕ ГАРАЗД');process.exit(bad?1:0);
