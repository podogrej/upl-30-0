// Значок трофея «Кукуріку» (силует півня) у 4 палітрах. Запуск з кореня: node docs/mockups/design_upl/v64/rooster_preview.js → rooster_preview.png
const path=require('path'),fs=require('fs');const {launch}=require('../../../../tools/tests/_page.js');const TH=require('./themes.js');
const R=fs.readFileSync(path.join(__dirname,'rooster.svg'),'utf8').replace(/<\/?svg[^>]*>/g,'');const HEX='M50 3 L91 26.5 V73.5 L50 97 L9 73.5 V26.5 Z';
const card=(k,t)=>`<div class="c"><svg width="0" height="0"><defs><linearGradient id="g${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.acc2}"/><stop offset="1" stop-color="${t.acc}"/></linearGradient></defs></svg>
<svg viewBox="0 0 100 100" width="64" height="64"><path d="${HEX}" fill="url(#g${k})"/><path d="${HEX}" fill="#132346" transform="translate(50 50) scale(.84) translate(-50 -50)"/><svg x="24" y="22" width="52" height="52" viewBox="0 0 24 24" fill="url(#g${k})">${R}</svg></svg>
<div><b>Кукуріку</b><span>Анатолій Тимощук у складі</span><i style="color:${t.acc}">${t.name}</i></div></div>`;
(async()=>{const b=await launch();const p=await b.newPage({viewport:{width:760,height:320}});
await p.setContent(`<style>body{margin:0;background:#0b1430;color:#fff;font:14px system-ui;padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:14px}
.c{display:flex;gap:14px;align-items:center;padding:14px;border-radius:16px;background:linear-gradient(135deg,#1b2b55,#132346 60%)}.c div{display:grid;gap:3px}.c span{color:#b9c2de;font-size:13px}.c i{font-style:normal;font-size:12px}</style>`+Object.entries(TH).map(([k,t])=>card(k,t)).join(''));
await p.screenshot({path:path.join(__dirname,'rooster_preview.png'),fullPage:true});await b.close();})();
