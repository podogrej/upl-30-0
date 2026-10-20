// Generates the link preview image og.png (1200x630) for the home page and /r. Run from repo root: node tools/make_og.js [out.png]
// Unbounded and Manrope fonts are fetched from Google Fonts via curl and embedded; without network, system fonts are used.
// Key content stays inside the centered 630x630 square: some apps crop the preview to a square.
const path=require('path'),{execFileSync}=require('child_process');
const UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
function fonts(){try{let css=execFileSync('curl',['-sS','-A',UA,'https://fonts.googleapis.com/css2?family=Unbounded:wght@800&family=Manrope:wght@600;700;800&subset=cyrillic&display=block']).toString();
  for(const u of new Set(css.match(/https:[^)]+\.woff2/g)||[]))css=css.split(u).join('data:font/woff2;base64,'+execFileSync('curl',['-sS',u]).toString('base64'));return css;}catch(e){return '';}}const {launch,ROOT}=require('./tests/_page.js');
// 4-3-3 on a horizontal pitch, x/y in % of the pitch box; colors match the game's position tokens
const XI=[[6,50,'#FFCC00'],[24,14,'#0062d1'],[22,38,'#0062d1'],[22,62,'#0062d1'],[24,86,'#0062d1'],[46,26,'#34C759'],[44,50,'#34C759'],[46,74,'#34C759'],[72,16,'#FF3B30'],[76,50,'#FF3B30'],[72,84,'#FF3B30']];
const dots=XI.map(([x,y,c])=>`<i style="left:${x}%;top:${y}%;--c:${c}"></i>`).join('');
const HTML=`<!doctype html><html><head><meta charset="utf-8">
<style>${fonts()}
body{margin:0;width:1200px;height:630px;overflow:hidden;background:radial-gradient(80% 110% at 50% 0%,#1b2a5c 0,#0b1430 65%);color:#fff;font-family:Manrope,system-ui,sans-serif;position:relative}
.p{position:absolute;left:60px;right:60px;top:40px;bottom:50px;border:2px solid rgba(255,255,255,.10);border-radius:18px}
.p::before{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:2px solid rgba(255,255,255,.10)}
.p::after{content:"";position:absolute;left:50%;top:50%;width:150px;height:150px;margin:-75px 0 0 -75px;border:2px solid rgba(255,255,255,.10);border-radius:50%}
.p b{position:absolute;top:28%;bottom:28%;width:110px;border:2px solid rgba(255,255,255,.10)}
.p b:first-of-type{left:-2px;border-left:0}.p b:last-of-type{right:-2px;border-right:0}
.p i{position:absolute;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:3px solid var(--c);background:rgba(11,20,48,.85);opacity:.55}
.v{position:absolute;inset:0;background:radial-gradient(34% 62% at 50% 52%,rgba(11,20,48,.92) 0,rgba(11,20,48,.75) 55%,rgba(11,20,48,0) 100%)}
.t{position:absolute;left:285px;width:630px;text-align:center}
.l{top:88px;font:800 64px/1 Unbounded,system-ui;letter-spacing:-.01em}
.l span{background:linear-gradient(90deg,#7e24b0,#d41e6f,#ff831e);-webkit-background-clip:text;background-clip:text;color:transparent}
.h{top:196px;font:800 58px/1.12 Manrope,system-ui;letter-spacing:-.01em}
.s{top:362px;font:700 26px/1.35 Manrope;color:#c9d0ea}
.u{top:512px;font:700 26px Manrope;color:#fff;letter-spacing:.02em}
.bar{position:absolute;left:0;right:0;bottom:0;height:10px;background:linear-gradient(90deg,#7e24b0,#d41e6f,#ff831e)}</style></head>
<body><div class="p"><b></b><b></b>${dots}</div><div class="v"></div>
<div class="t l">30-0 <span>УПЛ</span></div>
<div class="t h">Збери збірну УПЛ усіх&nbsp;часів</div>
<div class="t s">Пройди сезон 30 із 30<br>35 сезонів · 4&nbsp;601 футболіст</div>
<div class="t u">upl30.com.ua</div><div class="bar"></div></body></html>`;
const OUT=process.argv[2]||path.join(ROOT,'og.png');
(async()=>{const b=await launch();const pg=await b.newPage({viewport:{width:1200,height:630}});await pg.setContent(HTML);await pg.evaluate(()=>document.fonts.ready);await pg.waitForTimeout(500);
  const f=await pg.evaluate(()=>[...document.fonts].filter(x=>x.status==='loaded').map(x=>x.family).join(','));
  await pg.screenshot({path:OUT});console.log(OUT,'шрифти:',f||'системні');await b.close();})();
