// Linked transitions: screen switch through View Transitions (fallback without the API and under reduced motion), shared names only for one
// transition, home -> draft morph with the slot wave, live season -> summary, reverse direction on back.
// Screenshots: tools/tests/out/v076b_*.png.   Run from repo root: node tools/tests/v076b.js [screenshot dir]
const path=require('path'),fs=require('fs');const {ROOT,launch,openPage}=require('./_page.js');const {checker}=require('./_site.js');
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const shot=(pg,n)=>pg.screenshot({path:path.join(OUT,`v076b_${n}.png`)});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// transition pseudo animations: [pseudo, animationName, duration]
const vtAnims=pg=>pg.evaluate(()=>document.getAnimations().filter(a=>a.effect&&/view-transition/.test(a.effect.pseudoElement||'')).map(a=>[a.effect.pseudoElement,a.animationName||'',a.effect.getTiming().duration]));
const names=pg=>pg.evaluate(()=>[...document.querySelectorAll('*')].filter(e=>e.style.viewTransitionName).map(e=>(e.id||e.className||e.tagName)+':'+e.style.viewTransitionName));
const noScroll=pg=>pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
const hasVt=pg=>pg.evaluate(()=>document.documentElement.className.split(' ').filter(c=>/^vt/.test(c)).join(' '));
// fill the squad through the game API (first allowed player of each spin), the UI draft is covered elsewhere
async function draftAll(pg){for(let i=0;i<11;i++){await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});
  await pg.evaluate(()=>{const D=window.__dbg,id=document.querySelector('#squad .pl:not([disabled])').dataset.id,p=D.S.wheel.pl.find(x=>x[5]===id);D.place(p,D.posOpts(p)[0]);});}
  await pg.waitForSelector('#simBtn:not([hidden])');}
(async()=>{const T=checker('0.76 переходи');const B=await launch();   // one browser, a new context per page
 const {b,pg,errs}=await openPage({b:B});
 T.check(await pg.evaluate(()=>typeof document.startViewTransition==='function'),'браузер тесту має View Transitions');
 // ---- 1. screen switch: transition runs, names and classes are gone afterwards
 await pg.evaluate(()=>document.getElementById('freeOpen').click());
 T.check(/vt-fwd/.test(await hasVt(pg)),'перехід вперед: html.vt-fwd одразу після натиску');
 await wait(90);let an=await vtAnims(pg);
 const nw=an.find(a=>a[0]==='::view-transition-new(root)'),od=an.find(a=>a[0]==='::view-transition-old(root)');
 T.check(nw&&nw[1]==='vtup'&&nw[2]<=360,`новий екран: vtup ${nw&&nw[2]} мс (≤360)`);
 T.check(od&&od[1]==='vtout'&&od[2]<=360,`старий екран: vtout ${od&&od[2]} мс — гасне, а не зникає миттєво`);
 T.check(an.every(a=>a[2]<=360),`усі анімації переходу ≤360 мс (${[...new Set(an.map(a=>a[2]))]})`);
 await shot(pg,'home_setup_mid');await wait(700);
 T.check(await hasVt(pg)==='','після переходу класи vt зняті');
 T.check((await names(pg)).length===0,'після переходу view-transition-name нікого не залишилось: '+(await names(pg)));
 T.check(await pg.evaluate(()=>!document.getElementById('s4').hidden&&document.getElementById('s1').hidden&&!document.getElementById('s4').classList.contains('enter')),'setup видно, головна схована, без дубля secin');
 T.check(await pg.evaluate(()=>__dbg.VT_N)>=1,'лічильник переходів зріс');
 T.check(await pg.evaluate(()=>document.querySelector('header.top').style.viewTransitionName===''&&getComputedStyle(document.querySelector('header.top')).viewTransitionName==='none'),'шапка без постійного імені');
 // ---- 2. back: reverse direction, incoming from the left
 await pg.evaluate(()=>history.back());await pg.waitForFunction(()=>/vt-back/.test(document.documentElement.className),null,{polling:'raf',timeout:3000}).catch(()=>{});
 T.check(/vt-back/.test(await hasVt(pg)),'назад: html.vt-back');
 await wait(90);an=await vtAnims(pg);const nb=an.find(a=>a[0]==='::view-transition-new(root)');
 T.check(nb&&nb[1]==='vtleft','назад: новий екран входить зліва (vtleft), не знизу');
 await shot(pg,'back_mid');await wait(600);
 T.check(await pg.evaluate(()=>!document.getElementById('s1').hidden&&document.getElementById('s4').hidden)&&(await hasVt(pg))==='','назад: головна на місці, класи зняті');
 // ---- 3. home -> draft: the tapped button morphs into the progress bar, slot wave, spin button last
 const t0=await pg.evaluate(()=>{document.getElementById('vdCard').click();return document.getElementById('vdCard').style.viewTransitionName;});
 T.check(t0==='vt-play','картка «Виклик дня» отримала ім’я vt-play на час переходу');
 await pg.waitForFunction(()=>!document.getElementById('s2').hidden,null,{polling:'raf'});
 const mid=await pg.evaluate(()=>({from:document.getElementById('vdCard').style.viewTransitionName,to:document.querySelector('#s2 .dtop .bar').style.viewTransitionName,
   s2:!document.getElementById('s2').hidden,wave:document.getElementById('s2').classList.contains('wave'),
   dl:[...document.querySelectorAll('#pitch .slot')].map(e=>({g:e.className.match(/GK|DF|MF|FW/)[0],d:parseFloat(getComputedStyle(e).animationDelay)*1000})),
   sp:parseFloat(getComputedStyle(document.getElementById('spinZone')).animationDelay)*1000}));
 T.check(mid.from===''&&mid.to==='vt-play'&&mid.s2,'ім’я переїхало на смугу прогресу, драфт видно');
 an=await vtAnims(pg);T.check(an.some(a=>a[0]==='::view-transition-group(vt-play)'),'лінкований перехід vt-play: група анімується');
 T.check(mid.wave&&mid.dl.length===11,`хвиля слотів: клас wave, ${mid.dl.length} слотів`);
 const ord={GK:0,DF:1,MF:2,FW:3};const sd=[...mid.dl].sort((a,c)=>a.d-c.d);
 T.check(sd.every((x,i)=>i===0||x.d-sd[i-1].d<=30.5&&x.d-sd[i-1].d>0),`крок між слотами ≤30 мс (${sd.map(x=>Math.round(x.d))})`);
 T.check(sd[0].g==='GK'&&sd.every((x,i)=>i===0||ord[x.g]>=ord[sd[i-1].g]),'порядок хвилі: від воротаря до нападників');
 T.check(mid.sp>sd[sd.length-1].d,`«Крутити колесо» останнім (${Math.round(mid.sp)} мс)`);
 await shot(pg,'home_draft_mid');await wait(1600);
 T.check((await names(pg)).length===0&&(await hasVt(pg))==='','імена й класи зняті після переходу в драфт');
 T.check(await pg.evaluate(()=>!document.getElementById('s2').classList.contains('wave')),'клас wave знято');
 T.check(await noScroll(pg),'драфт 390: без горизонтальної прокрутки');
 await shot(pg,'draft_end');
 // ---- 4. live season -> summary (skip morph names, groups and final numbers are checked in v077c)
 await pg.evaluate(()=>{window.__dbg.setFmt('classic');document.getElementById('startBtn').click();});await wait(700);   // classic game: the challenge draft above may not meet its condition
 await draftAll(pg);await pg.click('#simBtn');await pg.waitForSelector('#live:not([hidden])');await wait(900);await shot(pg,'live');
 await pg.evaluate(()=>document.getElementById('skipBtn').click());
 await wait(60);
 const fm=await pg.evaluate(()=>({fin:!document.getElementById('final').hidden,live:document.getElementById('live').hidden,rec:document.querySelector('#recTiles>div:first-child>b').style.viewTransitionName,pts:document.querySelector('#recTiles b.hot').style.viewTransitionName,chip:document.getElementById('final').classList.contains('fin-in')}));
 T.check(fm.chip,'fin-in: чип вердикту виїжджає пружиною');
 await shot(pg,'live_summary_mid');await wait(1800);
 T.check((await names(pg)).length===0&&(await hasVt(pg))==='','після підсумку імена й класи зняті');
 T.check(await pg.evaluate(()=>!document.getElementById('final').classList.contains('fin-in')),'fin-in знято');
 T.check(await noScroll(pg),'підсумок 390: без горизонтальної прокрутки');
 await shot(pg,'summary');
 T.check(await pg.evaluate(()=>{const r=__dbg.S.result;return !!r&&document.getElementById('placeBig').textContent===String(r.place);}),'логіку підсумку не зламано');
 // ---- 5. fast chain of go(): pending swap is flushed, state is consistent
 const chain=await pg.evaluate(()=>{const c=id=>document.getElementById(id).click();c('homeBtn');c('freeOpen');c('homeBtn');return new Promise(r=>setTimeout(()=>r({s:[1,2,3,4].map(i=>!document.getElementById('s'+i).hidden),cur:0}),700));});
 T.check(chain.s.join()==='true,false,false,false'&&true,`швидкий ланцюжок go(): лише головна видима (${chain.s})`);
 T.check((await names(pg)).length===0&&(await hasVt(pg))==='','ланцюжок: імена й класи зняті');
 T.check(errs.length===0,'помилок JS немає'+(errs.length?': '+errs[0]:''));
 await b.close();

 // ---- 6. fallback: no View Transitions API -> the old synchronous switch with secin
 {const o=await openPage({b:B});await o.pg.evaluate(()=>{delete Document.prototype.startViewTransition;});
  const r=await o.pg.evaluate(()=>{document.getElementById('freeOpen').click();const s=document.getElementById('s4');return {vis:!s.hidden,home:document.getElementById('s1').hidden,enter:s.classList.contains('enter'),n:__dbg.VT_N,cls:document.documentElement.className};});
  T.check(r.vis&&r.home&&r.enter&&r.n===0&&!/vt/.test(r.cls),'без API: перемикання синхронне, secin, без класів vt');
  const d=await o.pg.evaluate(()=>{document.getElementById('vdCard')&&0;history.back();return 0;});await wait(400);
  await o.pg.evaluate(()=>document.getElementById('vdCard').click());await wait(100);
  T.check(await o.pg.evaluate(()=>!document.getElementById('s2').hidden&&document.getElementById('s2').classList.contains('wave')),'без API: драфт відкривається, хвиля слотів працює');
  T.check((await names(o.pg)).length===0,'без API: імен немає');
  T.check(o.errs.length===0,'без API: помилок JS немає'+(o.errs.length?': '+o.errs[0]:''));await o.b.close();}

 // ---- 7. reduced motion: no transition, no wave, no chip animation
 {const o=await openPage({b:B,reducedMotion:'reduce'});
  const r=await o.pg.evaluate(()=>{document.getElementById('freeOpen').click();const s=document.getElementById('s4');return {vis:!s.hidden,n:__dbg.VT_N,cls:document.documentElement.className,enter:getComputedStyle(s).animationName};});
  T.check(r.vis&&r.n===0&&!/vt/.test(r.cls)&&r.enter==='none','reduce: без переходу, без secin');
  await o.pg.evaluate(()=>history.back());await wait(300);await o.pg.evaluate(()=>document.getElementById('vdCard').click());await wait(100);
  const w=await o.pg.evaluate(()=>({draft:!document.getElementById('s2').hidden,wave:document.getElementById('s2').classList.contains('wave'),n:__dbg.VT_N,an:document.getAnimations().length}));
  T.check(w.draft&&!w.wave&&w.n===0,'reduce: драфт без хвилі і без переходу');
  const css=await o.pg.evaluate(()=>{const e=document.getElementById('spinZone');return getComputedStyle(e).animationName;});
  T.check(css==='none','reduce: «Крутити колесо» без анімації входу');
  T.check(o.errs.length===0,'reduce: помилок JS немає');await o.b.close();}

 // ---- 8. layouts: 320 phone, iPad 1024, Telegram fullscreen
 for(const [vw,vh,tg,tag] of [[320,640,0,'320'],[1024,768,0,'ipad'],[390,844,1,'tgfs']]){
  const o=await openPage({b:B,viewport:{width:vw,height:vh}});if(tg)await o.pg.evaluate(()=>document.documentElement.classList.add('tgfs'));
  await o.pg.evaluate(()=>document.getElementById('vdCard').click());await wait(110);
  T.check((await vtAnims(o.pg)).length>0,`${tag}: переход іде`);await shot(o.pg,`${tag}_mid`);await wait(1200);
  const g=await o.pg.evaluate(()=>{const h=document.querySelector('header.top').getBoundingClientRect(),bar=document.querySelector('#s2 .dtop .bar').getBoundingClientRect();return {sw:document.documentElement.scrollWidth<=innerWidth+1,hTop:h.top,bar:bar.width>20,names:[...document.querySelectorAll('*')].filter(e=>e.style.viewTransitionName).length};});
  T.check(g.sw&&g.hTop===0&&g.bar&&g.names===0,`${tag}: без горизонтальної прокрутки, шапка на місці, імена зняті`);
  T.check(o.errs.length===0,`${tag}: помилок JS немає`+(o.errs.length?': '+o.errs[0]:''));await shot(o.pg,`${tag}_draft`);await o.b.close();}
 // ---- regressions: footer FAQ link from another screen, season ending in the background
 {const {b,pg,errs}=await openPage({b:B});
  await pg.click('#freeOpen');await wait(700);
  await pg.evaluate(()=>[...document.querySelectorAll('.foot0 a')].find(a=>a.dataset.go==='howQ').click());await wait(1500);
  const f=await pg.evaluate(()=>({s1:!document.getElementById('s1').hidden,open:document.getElementById('howQ').open,top:Math.round(document.getElementById('howQ').getBoundingClientRect().top)}));
  T.check(f.s1&&f.open&&f.top>=0&&f.top<200,`посилання в підвалі з іншого екрана: головна, відповідь розкрита й прокручена (top ${f.top})`);
  await pg.click('#freeOpen');await wait(700);await pg.click('#startBtn');await wait(800);
  await wait(800);
  // live season -> home; the season ends there without a full-screen transition
  await draftAll(pg);
  await pg.click('#simBtn');await wait(1500);
  await pg.evaluate(()=>document.getElementById('homeBtn').click());await wait(800);
  const n0=await pg.evaluate(()=>window.__dbg.VT_N);let seen=false;
  for(let k=0;k<90&&!seen;k++){seen=await pg.evaluate(()=>/\bvt\b/.test(document.documentElement.className));if(await pg.evaluate(()=>!document.getElementById('final').hidden))break;await wait(300);}
  const e=await pg.evaluate(()=>({n:window.__dbg.VT_N,s1:!document.getElementById('s1').hidden,fin:!document.getElementById('final').hidden}));
  T.check(e.fin&&e.s1&&e.n===n0&&!seen,`кінець сезону у фоні: без переходу на головній (VT ${n0}→${e.n})`);
  T.check(!errs.length,'регресії: помилок JS немає '+errs.join(' | '));await b.close();}
 await B.close();process.exit(T.done());})();
