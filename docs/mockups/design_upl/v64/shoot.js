// Макети палітр 0.64 поверх справжньої гри (темна тема A). Запуск з кореня: node docs/mockups/design_upl/v64/shoot.js
// → <палітра>_<екран>.png і compare.png. Тут же правки власника 01.10 для показу: суцільний колір на вузьких кнопках, градієнт — лише на широких,
// трофеї (градієнтний шестикутник, заокруглені картки), xG/xGA/везіння — плитками з іконками, без рядка «Ліга легенд · схема · режим · голи», значок петуха.
const path=require('path'),fs=require('fs');const {launch,makeDB,openSite}=require('../../../../tools/tests/_site.js');
const TH=require('./themes.js');const OUT=__dirname;const SC=['home','result','trophies'];
const MDI='/usr/local/lib/python3.11/dist-packages/material/templates/.icons/material/';
const ico=n=>fs.readFileSync(MDI+n+'.svg','utf8').replace('<svg ','<svg class="ico" ');
const ROOSTER=fs.readFileSync(path.join(OUT,'rooster.svg'),'utf8');
const css=t=>`:root,:root[data-theme="dark"]{--amber:${t.acc};--amber2:${t.acc2};--grad:linear-gradient(90deg,${t.acc2},${t.acc})}
button.primary,.big0.primary,.daily #dailyBtn,.nudge .primary{background:${t.acc};color:${t.ink};border:0;box-shadow:0 6px 18px color-mix(in srgb,${t.acc} 28%,transparent)}
#freeOpen,#startBtn,#simBtn,#againBtn{background:var(--grad)!important;color:${t.ink}}
.logo0 span,.score0 b.hot{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.row0>.ic:first-child .ico,.ic .ico{fill:${t.acc}}.ic{background:color-mix(in srgb,${t.acc} 14%,transparent)}
.kicker,#dKicker,.sec0{color:${t.acc}}
#seasonLine{display:none!important}
details.tip>summary{display:none}details.tip{display:block}
.x0{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:6px}
.x0>div{border-radius:14px;padding:10px 8px;background:color-mix(in srgb,var(--bg) 70%,transparent);display:grid;justify-items:center;gap:2px;text-align:center}
.x0 .ico{width:20px;height:20px;fill:${t.acc}}.x0 b{font:700 18px var(--font-display);color:var(--ink)}.x0 span{font-size:11px;color:var(--muted)}
.tro{border:0!important;border-radius:16px;padding:12px 14px;background:linear-gradient(135deg,color-mix(in srgb,${t.acc} 10%,var(--surface)),var(--surface) 60%)}
.tro.on{box-shadow:inset 0 0 0 1px color-mix(in srgb,${t.acc} 35%,transparent)}
.tro:not(.on){background:var(--surface);opacity:.6}
.hx .o{fill:url(#trg)}.hx.off .o{fill:var(--line);opacity:1}.hx .in{fill:var(--surface)}.hx .g{fill:url(#trg)}.hx.off .g{fill:var(--muted)}
.tro.on.sec .hx .o,.tro.on.sec .hx .g{fill:url(#trg2)}
.tro .trn{color:${t.acc}}`;
const defs=t=>`<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="trg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.acc2}"/><stop offset="1" stop-color="${t.acc}"/></linearGradient>
 <linearGradient id="trg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="${t.acc2}"/><stop offset="1" stop-color="${t.acc}"/></linearGradient></defs></svg>`;
function mkDB(){const players=[{id:'p-me',name:'andré',anon_name:'calm_owl',public_id:'andr2345'}];
  const js=p=>({id:p.id,name:p.name,anon_name:p.anon_name,public_id:p.public_id,name_next:null,contact_email:null,news_optin:false});
  const db=makeDB({seasons:{auto:'id'},season_seeds:{auto:'id'},daily_results:{auto:'id'},player_links:{},user_state:{}},
    {player_hello:()=>js(players[0]),link_account:()=>({...js(players[0]),merge_offer:null}),trophy_stats:()=>({players:12,t:{}}),game_stats:()=>({seasons:75,players:4})});
  db.DB.players=players;global.fetch=db.fetch;return db;}
const api={'/api/save':async()=>({json:{id:1,verified:true,note:'ok'}}),'/api/seed':async()=>({json:{seed:12345,seed_id:'s1'}})};
(async()=>{const b=await launch();const db=mkDB();
 for(const [k,t] of Object.entries(TH)){
  const A=await openSite({b,db,api,signed:true,viewport:{width:390,height:844},wait:1300,
    init:`try{localStorage.setItem("upl30_theme","dark");localStorage.setItem("upl30_tr",JSON.stringify({t:{kukuriku:{n:1,at:"2026-10-01"},champ:{n:3,at:"2026-10-01"},striker:{n:1,at:"2026-10-01"},s3:{n:1,at:"2026-10-01"},nice:{n:1,at:"2026-10-01"},ms1:{n:1,at:"2026-10-01"},ms5:{n:1,at:"2026-10-01"},f5champ:{n:1,at:"2026-10-01"}},seasons:6,dailies:3}))}catch(e){}`});const pg=A.pg;
  const fix=async()=>{await pg.evaluate(([c,d,ic,R])=>{let s=document.getElementById('upl');if(!s){s=document.createElement('style');s.id='upl';document.body.append(s);document.body.insertAdjacentHTML('beforeend',d);}s.textContent=c;
     const x=document.getElementById('xRow'),r=window.__dbg.S.result;if(x&&r&&!x.dataset.m){x.dataset.m=1;const l=r.pts-r.xp;x.className='x0';x.innerHTML=`<div>${ic[0]}<b>${r.xgf.toFixed(1)}</b><span>xG · забили ${r.gf}</span></div><div>${ic[1]}<b>${r.xga.toFixed(1)}</b><span>xGA · пропустили ${r.ga}</span></div><div>${ic[2]}<b>${l>=0?'+':'−'}${Math.abs(l).toFixed(1)}</b><span>${l>=0?'везіння':'невезіння'}, очк.</span></div>`;}
     document.querySelectorAll('details.tip').forEach(d=>d.open=true);const cap=document.getElementById('xCap');if(cap)cap.style.display='none';
     document.querySelectorAll('.tro').forEach(e=>{if(/Кукуріку/.test(e.textContent)){const g=e.querySelector('.hx svg');if(g&&!g.dataset.r){g.dataset.r=1;g.setAttribute('viewBox','0 0 24 24');g.innerHTML=R.replace(/<\/?svg[^>]*>/g,'').replace(/<path /g,'<path class="g" ');}}});
     scrollTo(0,0);},[css(t),defs(t),[ico('target'),ico('shield-half-full'),ico('clover')],ROOSTER]);await pg.waitForTimeout(250);};
  const shot=async n=>{await fix();await pg.screenshot({path:path.join(OUT,`${k}_${n}.png`),clip:{x:0,y:0,width:390,height:1250},fullPage:true});};
  await shot('home');await pg.click('#freeOpen');await pg.waitForTimeout(200);await pg.click('#startBtn');
  for(let i=0;i<11;i++){await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});await (await pg.$('.pl:not([disabled])')).click();await pg.waitForTimeout(60);const s=await pg.$('#squad .plpos button');if(s)await s.click();}
  await pg.waitForSelector('#simBtn:not([hidden])');await pg.click('#simBtn');await pg.waitForSelector('#skipBtn:visible',{timeout:15000});await pg.click('#skipBtn');await pg.waitForTimeout(1500);
  await pg.evaluate(()=>{const m=document.querySelector('.champ0');if(m)m.remove();});await shot('result');
  await pg.evaluate(()=>window.__dbg.openTrophies());await pg.waitForTimeout(800);await fix();
  await pg.screenshot({path:path.join(OUT,`${k}_trophies.png`)});
  console.log('✓',k);await A.ctx.close();}
 const pg=await b.newPage({viewport:{width:1300,height:900}});const b64=f=>'data:image/png;base64,'+fs.readFileSync(path.join(OUT,f)).toString('base64');
 await pg.setContent(`<style>body{margin:0;background:#222;color:#eee;font:15px system-ui;padding:16px}h2{margin:16px 0 8px;font-size:18px}.r{display:grid;grid-template-columns:repeat(3,390px);gap:16px;align-items:start}img{width:390px;border-radius:10px}</style>`+
   Object.entries(TH).map(([k,t])=>`<h2>${t.name}</h2><div class="r">${SC.map(s=>`<img src="${b64(`${k}_${s}.png`)}">`).join('')}</div>`).join(''));
 await pg.waitForTimeout(300);await pg.screenshot({path:path.join(OUT,'compare.png'),fullPage:true});await b.close();console.log('✓ compare');})();
