// Трофеї плитками (ідея власника 01.10, референс — скрин з Telegram): 2 в ряд, значок поруч із назвою, назва — акцентом, опис дрібно під нею, нічого зайвого.
// Лише CSS поверх гри 0.64. Запуск з кореня: node docs/mockups/design_upl/v64/tiles.js → tiles.png (було / стало, темна й світла)
const path=require('path'),fs=require('fs');const {launch,ROOT}=require('../../../../tools/tests/_page.js');
const CSS=`.trg{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px}
.trg .tro{display:grid;grid-template-columns:auto auto;justify-content:center;align-content:start;align-items:center;column-gap:6px;row-gap:4px;text-align:center;padding:12px 10px 12px;border-radius:16px;position:relative;opacity:1;
  background:color-mix(in srgb,var(--amber) 7%,var(--surface));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--amber) 28%,transparent)}
.trg .tro .trt{display:contents}.trg .tro .tri{grid-row:1;grid-column:1}.trg .tro .hx{width:22px;height:22px}
.trg .tro .trt b{grid-row:1;grid-column:2;font-size:14px;line-height:1.2;text-align:left;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.trg .tro .trt>span,.trg .tro .trq,.trg .tro .trp{grid-column:1/-1;font-size:12px;line-height:1.35;color:var(--ink2)}.trg .tro .trq{justify-content:center}
.trg .tro .trn{position:absolute;top:6px;right:9px;font-size:11px}
.trg .tro:not(.on){background:var(--surface);box-shadow:inset 0 0 0 1px var(--line)}.trg .tro:not(.on) .trt b{background:none;color:var(--muted)}.trg .tro:not(.on) .trt>span{color:var(--muted)}`;
const TR={kukuriku:1,champ:3,silver:1,striker:2,s3:1,nice:1,f5champ:1,f5play:2,homefort:1,allua:1};
(async()=>{const b=await launch();const shots=[];
 for(const th of ['dark','light'])for(const k of ['was','now']){const ctx=await b.newContext({viewport:{width:390,height:1100},deviceScaleFactor:2});
  await ctx.route(u=>!u.href.startsWith('file:'),r=>r.abort());
  await ctx.addInitScript(t=>{localStorage.setItem('upl30_theme',t.th);localStorage.setItem('upl30_tr',JSON.stringify({t:Object.fromEntries(Object.entries(t.TR).map(([id,n])=>[id,{n,at:'2026-10-01'}])),seasons:12,dailies:3}));},{th,TR});
  const pg=await ctx.newPage();await pg.goto('file://'+path.join(ROOT,'index.html'));await pg.waitForTimeout(800);
  if(k==='now')await pg.addStyleTag({content:CSS});await pg.evaluate(()=>window.__dbg.openTrophies());await pg.waitForTimeout(700);
  const f=path.join(__dirname,`tiles_${th}_${k}.png`);await pg.screenshot({path:f});shots.push([th,k,f]);await ctx.close();}
 const pg=await b.newPage({viewport:{width:1700,height:1200}});const b64=f=>'data:image/png;base64,'+fs.readFileSync(f).toString('base64');
 await pg.setContent(`<style>body{margin:0;background:#222;color:#eee;font:16px system-ui;padding:16px;display:grid;grid-template-columns:repeat(4,390px);gap:16px}h2{font-size:16px;margin:0 0 8px}img{width:390px;border-radius:10px}</style>`+
   shots.map(([th,k,f])=>`<div><h2>${th==='dark'?'Темна':'Світла'} · ${k==='was'?'було':'стало'}</h2><img src="${b64(f)}"></div>`).join(''));
 await pg.waitForTimeout(300);await pg.screenshot({path:path.join(__dirname,'tiles.png'),fullPage:true});await b.close();})();
