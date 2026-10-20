// Generates the link preview image og.jpg (1200x630) for the home page and /r. Run from repo root: node tools/make_og.js [out.jpg]
// Site font KyivType Sans is embedded from fonts/ so the preview matches the site and renders offline.
// Key content stays inside the centered 630x630 square: some apps crop the preview to a square.
const path=require('path'),fs=require('fs');
const {launch,ROOT}=require('./tests/_page.js');
function fonts(){const F=w=>'data:font/otf;base64,'+fs.readFileSync(path.join(ROOT,'fonts','KyivTypeSans-'+w+'.otf')).toString('base64');
  return '@font-face{font-family:K;src:url('+F('Black')+');font-weight:900}@font-face{font-family:K;src:url('+F('Bold')+');font-weight:700}';}
// 4-3-3 on a horizontal pitch, x/y in % of the pitch box; colors match the game's position tokens
const G='#FFD60A',D='#0A84FF',M='#30D158',F='#FF453A';const XI=[[5,50,G],[17,14,D],[15,38,D],[15,62,D],[17,86,D],[30,18,M],[28,50,M],[30,82,M],[71,20,F],[73,50,F],[71,80,F]];
const dots=XI.map(([x,y,c])=>`<i style="left:${x}%;top:${y}%;--c:${c}"></i>`).join('');
const HTML=`<!doctype html><html><head><meta charset="utf-8">
<style>${fonts()}
body{margin:0;width:1200px;height:630px;overflow:hidden;background:radial-gradient(80% 110% at 50% 0%,#1b2a5c 0,#0b1430 65%);color:#fff;font-family:K,system-ui,sans-serif;position:relative}
.p{position:absolute;left:60px;right:60px;top:40px;bottom:50px;border:2px solid rgba(200,215,255,.32);border-radius:18px}
.p::before{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:2px solid rgba(200,215,255,.32)}
.p::after{content:"";position:absolute;left:50%;top:50%;width:150px;height:150px;margin:-75px 0 0 -75px;border:2px solid rgba(200,215,255,.32);border-radius:50%}
.p b{position:absolute;top:28%;bottom:28%;width:110px;border:2px solid rgba(200,215,255,.32)}
.p b:first-of-type{left:-2px;border-left:0}.p b:last-of-type{right:-2px;border-right:0}
.p i{position:absolute;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;border:4px solid var(--c);background:color-mix(in srgb,var(--c) 22%,#0b1430);box-shadow:0 0 12px color-mix(in srgb,var(--c) 40%,transparent)}
.v{position:absolute;inset:0;background:radial-gradient(24% 48% at 50% 50%,rgba(11,20,48,.85) 0,rgba(11,20,48,0) 100%)}
.t{position:absolute;left:285px;width:630px;text-align:center}
.l{top:92px;font:900 48px/1 K,system-ui;letter-spacing:-.03em}
.l span{background:linear-gradient(90deg,#7e24b0,#d41e6f,#ff831e);-webkit-background-clip:text;background-clip:text;color:transparent}
.h{top:172px;font:900 62px/1.08 K,system-ui;letter-spacing:-.02em}
.s{top:350px;font:700 32px/1.28 K,system-ui;color:#d3d9f0}
.u{top:500px;font:700 32px K,system-ui;color:#fff;letter-spacing:.01em}
.bar{position:absolute;left:0;right:0;bottom:0;height:10px;background:linear-gradient(90deg,#7e24b0,#d41e6f,#ff831e)}</style></head>
<body><div class="p"><b></b><b></b>${dots}</div><div class="v"></div>
<div class="t l">30-0 <span>УПЛ</span></div>
<div class="t h">Збери збірну УПЛ усіх&nbsp;часів</div>
<div class="t s">Пройди сезон 30 із 30<br>35 сезонів · 4&nbsp;601 футболіст</div>
<div class="t u">upl30.com.ua</div><div class="bar"></div></body></html>`;
const OUT=process.argv[2]||path.join(ROOT,'og.jpg');
(async()=>{const b=await launch();const pg=await b.newPage({viewport:{width:1200,height:630}});await pg.setContent(HTML);await pg.evaluate(()=>document.fonts.ready);await pg.waitForTimeout(500);
  const f=await pg.evaluate(()=>[...document.fonts].filter(x=>x.status==='loaded').map(x=>x.family).join(','));
  await pg.screenshot({path:OUT,type:'jpeg',quality:90});console.log(OUT,'шрифти:',f||'системні');await b.close();})();
