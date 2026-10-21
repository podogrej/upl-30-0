// Generates the link preview image og.jpg (1200x630) for the home page and /r. Run from repo root: node tools/make_og.js [out.jpg]
// Site font KyivType Sans is embedded from fonts/ so the preview matches the site and renders offline.
// Key content stays inside the centered 630x630 square: some apps crop the preview to a square.
// Picture: logo, a row of 30 equal bars in the brand gradient (30 matches, no defeat), two-line caption.
const path=require('path'),fs=require('fs');
const {launch,ROOT}=require('./tests/_page.js');
function fonts(){const F=w=>'data:font/otf;base64,'+fs.readFileSync(path.join(ROOT,'fonts','KyivTypeSans-'+w+'.otf')).toString('base64');
  return [['Black',900],['Bold',700],['Medium',500]].map(([w,n])=>`@font-face{font-family:K;src:url(${F(w)});font-weight:${n}}`).join('');}
const ROW=1050,BARS=30,BW=6,bars=Array.from({length:BARS},(_,k)=>`<i style="background-position:-${Math.round(k*(ROW-BW)/(BARS-1))}px 0"></i>`).join('');
const HTML=`<!doctype html><html lang="uk"><head><meta charset="utf-8">
<style>${fonts()}
:root{--bg:#0b1430;--ink:#ffffff;--ink2:#b9c2de;--grad:linear-gradient(90deg,#7e24b0,#d41e6f,#ff831e)}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:radial-gradient(70% 90% at 50% 38%,#16275a 0,var(--bg) 70%);color:var(--ink);font-family:K,system-ui,sans-serif;line-height:1.28}
.c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.logo{font-weight:900;font-size:72px;letter-spacing:-.03em;line-height:1;white-space:nowrap}
.logo span{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.04em}
.row{margin-top:64px;width:${ROW}px;height:60px;display:flex;justify-content:space-between}
.row i{width:${BW}px;height:100%;border-radius:3px;background:var(--grad);background-size:${ROW}px 100%}
.t{margin-top:52px;text-align:center;font-weight:700;font-size:44px;letter-spacing:-.02em}
.t em{display:block;font-style:normal;color:var(--ink2);font-weight:500}</style></head>
<body><div class="c"><div class="logo">30-0 <span>УПЛ</span></div><div class="row">${bars}</div><div class="t"><em>Тридцять матчів.</em>Жодної поразки.</div></div></body></html>`;
const OUT=process.argv[2]||path.join(ROOT,'og.jpg');
(async()=>{const b=await launch();const pg=await b.newPage({viewport:{width:1200,height:630}});await pg.setContent(HTML);await pg.evaluate(()=>document.fonts.ready);await pg.waitForTimeout(500);
  const f=await pg.evaluate(()=>[...document.fonts].filter(x=>x.status==='loaded').map(x=>x.family).join(','));
  await pg.screenshot({path:OUT,type:'jpeg',quality:90});console.log(OUT,'шрифти:',f||'системні');await b.close();})();
