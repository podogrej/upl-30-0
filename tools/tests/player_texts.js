// 0.69.3 (власник: «прибрати терміново й перевірити, щоб більше ніде такого не було» — трофей «Два кольори»: «режим сховано в 0.64»):
// у текстах для гравців немає номерів версій і службових слів. Без браузера: рядки в лапках (без коментарів) з кирилицею —
// src/*.js, src/template.html (і текст HTML між тегами), api/*.js; окремо — описи всіх трофеїв. Запуск з кореня: node tools/tests/player_texts.js
const fs=require('fs'),path=require('path');const ROOT=path.join(__dirname,'..','..');
const BAD=/(\b0\.\d{2}\b|\bверсі[їяю] \d|сховано в|прибрано в|TODO|FIXME|SQL|RPC|localStorage)/i;
const OK=[/Що нового у версії/,/попередній склад сховано/,/SQL 0\.53 ще не виконано/];   // підвал; 5×5 на одному телефоні; помилка сервера (не для гравця)
const CYR=/[а-яіїєґ]/i;let n=0;const bad=[];
const strip=l=>l.replace(/\/\*.*?\*\//g,'').replace(/<!--.*?-->/g,'').replace(/(^|[^:\\"'`])\/\/.*$/,'$1');
const files=[...fs.readdirSync(path.join(ROOT,'src')).filter(f=>/\.(js|html)$/.test(f)&&!/^(pen_skill|five_core)\.js$/.test(f)).map(f=>'src/'+f),...fs.readdirSync(path.join(ROOT,'api')).filter(f=>f.endsWith('.js')).map(f=>'api/'+f)];
let inBlock=false;
for(const f of files)fs.readFileSync(path.join(ROOT,f),'utf8').split('\n').forEach((line,i)=>{
  let l=line;if(inBlock){const e=l.indexOf('*/');if(e<0)return;l=l.slice(e+2);inBlock=false;}
  l=strip(l);const s=l.indexOf('/*');if(s>=0){inBlock=!l.includes('*/',s);l=l.slice(0,s);}
  const texts=[...l.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)].map(m=>m[2]);if(f.endsWith('.html'))texts.push(...[...l.matchAll(/>([^<>]+)</g)].map(m=>m[1]));
  for(const t of texts){if(!CYR.test(t))continue;n++;if(BAD.test(t)&&!OK.some(r=>r.test(t)))bad.push(`${f}:${i+1} «${t.slice(0,90)}»`);}});
// трофеї: описи й назви
const tro=[...fs.readFileSync(path.join(ROOT,'src/trophies.js'),'utf8').matchAll(/\{id:"(\w+)",i:"[^"]*",n:"([^"]*)",d:"([^"]*)"/g)];   // назви й описи трофеїв (вони ж є і в загальному обході рядків)
for(const [,id,nm,d] of tro)if(BAD.test(nm+' '+d))bad.push(`трофей ${id}: «${nm} — ${d}»`);
console.log(`перевірено текстів: ${n}, трофеїв: ${tro.length}`);
for(const b of bad)console.log('✗ '+b);
console.log(bad.length?`player_texts: ПРОБЛЕМИ ${bad.length}`:'player_texts: УСЕ ГАРАЗД');process.exit(bad.length?1:0);
