// Generates the messenger preview image og.png (1200×630) in UPL colors. Run from repo root: node tools/make_og.js
// Unbounded and Manrope fonts are fetched from Google Fonts via curl and embedded; without network, system fonts are used.
const path=require('path'),{execFileSync}=require('child_process');
const UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
function fonts(){try{let css=execFileSync('curl',['-sS','-A',UA,'https://fonts.googleapis.com/css2?family=Unbounded:wght@800&family=Manrope:wght@600;700&subset=cyrillic&display=block']).toString();
  for(const u of new Set(css.match(/https:[^)]+\.woff2/g)||[]))css=css.split(u).join('data:font/woff2;base64,'+execFileSync('curl',['-sS',u]).toString('base64'));return css;}catch(e){return '';}}const {launch,ROOT}=require('./tests/_page.js');
const HTML=`<!doctype html><html><head><meta charset="utf-8">
<style>${fonts()}
body{margin:0;width:1200px;height:630px;overflow:hidden;background:radial-gradient(90% 120% at 15% 0%,#1b2a5c 0,#0b1430 60%);color:#fff;font-family:Manrope,system-ui,sans-serif;position:relative}
.k{position:absolute;left:80px;top:160px;font:700 22px Manrope;letter-spacing:.2em;color:#b9c2de}
.l{position:absolute;left:76px;top:200px;font:800 128px/1.05 Unbounded,system-ui;letter-spacing:-.01em}
.l span{background:linear-gradient(90deg,#7e24b0,#d41e6f,#ff831e);-webkit-background-clip:text;background-clip:text;color:transparent}
.s{position:absolute;left:80px;top:368px;width:820px;font:600 40px/1.3 Manrope;color:#dfe4f4}
.c{position:absolute;right:-190px;top:250px;width:520px;height:520px;border-radius:50%;border:2px solid rgba(224,40,122,.45)}
.bar{position:absolute;left:0;right:0;bottom:0;height:10px;background:linear-gradient(90deg,#7e24b0,#d41e6f,#ff831e)}</style></head>
<body><div class="c"></div><div class="k">НЕОФІЦІЙНИЙ ФАН-ПРОЄКТ</div><div class="l">30-0 <span>УПЛ</span></div><div class="s">Збери найсильнішу 11-ку в історії УПЛ і пройди сезон без поразок</div><div class="bar"></div></body></html>`;
(async()=>{const b=await launch();const pg=await b.newPage({viewport:{width:1200,height:630}});await pg.setContent(HTML);await pg.evaluate(()=>document.fonts.ready);await pg.waitForTimeout(500);
  const f=await pg.evaluate(()=>[...document.fonts].filter(x=>x.status==='loaded').map(x=>x.family).join(','));
  await pg.screenshot({path:path.join(ROOT,'og.png')});console.log('og.png, шрифти:',f||'системні');await b.close();})();
