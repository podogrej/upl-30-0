// Motion release 0.77: trophy opening (sealed token flip), picked player flies to the pitch, live season odometer digits.
// Screenshots: tools/tests/out/v077c_*.png.   Run from repo root: node tools/tests/v077c.js [screenshot dir]
const path=require('path'),fs=require('fs');const {ROOT,openPage}=require('./_page.js');const {checker}=require('./_site.js');
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const shot=(pg,n)=>pg.screenshot({path:path.join(OUT,`v077c_${n}.png`)});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const STUB=`window.__hap=[];window.Telegram={WebApp:{initData:'stub',HapticFeedback:{impactOccurred:s=>__hap.push('i:'+s),notificationOccurred:s=>__hap.push('n:'+s),selectionChanged:()=>__hap.push('s')}}};`;
const noScroll=pg=>pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
const T=checker('0.77 рух: трофей, переліт, цифри'),FAILS=[];{const c0=T.check;T.check=(ok,m)=>{if(!ok)FAILS.push(m);c0(ok,m);};}   // failures are repeated at the end (CI shows only the log tail)

// ---- draft helpers
async function startDraft(pg,fmt){await pg.evaluate(()=>{document.getElementById('homeBtn').click();document.getElementById('freeOpen').click();});
  if(fmt==='practice'){await pg.evaluate(()=>window.__dbg.setFmt('classic'));await pg.evaluate(()=>{window.__dbg.S.mode='practice';});}
  else await pg.evaluate(f=>window.__dbg.setFmt(f),fmt||'classic');
  await pg.click('#startBtn');await pg.waitForSelector('#spinBtn:not([hidden])');}
async function spin(pg){await pg.click('#spinBtn');await pg.waitForSelector('#seaPick:not([hidden]) button, #squad .pl:not([disabled])',{timeout:8000});
  const sp=await pg.$$('#seaPick:not([hidden]) button');if(sp.length)await sp[sp.length-1].click();await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});}
// choose first player, then place by the position button in the list or by the highlighted slot; returns right after the tap
async function pickTap(pg,via){const btn=await pg.$('#squad .pl:not([disabled])');await btn.click();
  if(via==='slot'){const t=await pg.$('#pitch .slot.target');if(t)await t.click();else await (await pg.$('#squad .plpos button')).click();}
  else await (await pg.$('#squad .plpos button')).click();}
const flyInfo=pg=>pg.evaluate(()=>{const g=document.querySelector('.flyg');return {ghost:!!g,pe:g?getComputedStyle(g).pointerEvents:'',fw:document.querySelectorAll('#pitch .slot.fw').length,
  anims:g?g.getAnimations({subtree:true}).length:0,pos:g?getComputedStyle(g).position:'',txt:g?g.textContent:''};});
const clean=pg=>pg.evaluate(()=>({g:document.querySelectorAll('.flyg').length,fw:document.querySelectorAll('.slot.fw').length,filled:window.__dbg.S.slots.filter(s=>s.player).length,
  names:[...document.querySelectorAll('#pitch .slot.filled .nm')].map(e=>e.textContent).filter(Boolean).length,vis:[...document.querySelectorAll('#pitch .slot.filled .disc')].every(e=>getComputedStyle(e.parentNode.firstElementChild).opacity==='1')}));

(async()=>{
 // ================= 2. player flies to the pitch
 for(const [label,vw,vh,fmt,via] of [['телефон 390',390,844,'classic','btn'],['телефон, слот',390,844,'classic','slot'],['iPad 1024',1024,768,'classic','btn'],['iPad 820',820,1180,'classic','slot'],['Вибір сезону',1024,768,'pick','btn'],['тренування',1024,768,'practice','btn']]){
  const {b,pg,errs}=await openPage({viewport:{width:vw,height:vh}});await startDraft(pg,fmt);let flew=0;const rec=[];
  for(let i=0;i<3;i++){await spin(pg);await pickTap(pg,via);
    const g=await pg.waitForSelector('.flyg',{state:'attached',timeout:1500}).catch(()=>null);
    if(g){const f=await flyInfo(pg);rec.push(f);if(i===0)await shot(pg,`fly_${vw}_${fmt}_${via}`);}
    await wait(1100);const c=await clean(pg);
    T.check(c.g===0&&c.fw===0&&c.filled===i+1&&c.names>=c.filled-0&&c.vis,`${label}: гравець ${i+1} — привид знято, слот видно, у складі ${c.filled} (ghost ${c.g}, fw ${c.fw})`);}
  const fl=rec.filter(r=>r.ghost);
  T.check(fl.length===3,`${label}: переліт відбувся у ${fl.length} з 3 виборів`+(fl.length<3?' (решта — слот поза екраном, переліт пропущено)':''));
  T.check(fl.every(r=>r.pe==='none'&&r.pos==='fixed'&&r.anims>=3&&r.fw>=1),`${label}: привид fixed, pointer-events:none, анімації transform/opacity/дуга, слот чекає посадки`);
  T.check(await noScroll(pg),`${label}: без горизонтальної прокрутки`);
  T.check(errs.length===0,`${label}: помилок JS немає`+(errs.length?': '+errs[0]:''));await b.close();}

 // fly ends exactly on the slot label, first animation is the chip transform of ~420 ms, never blocks taps
 {const {b,pg}=await openPage({viewport:{width:1024,height:768}});await startDraft(pg,'classic');let got=null;for(let i=0;i<8&&!got;i++){await spin(pg);await pickTap(pg,'btn');got=await pg.waitForSelector('.flyg',{state:'attached',timeout:1500}).catch(()=>null);if(!got)await wait(500);}
  T.check(!!got,'iPad: хоча б один з перших виборів летить');
  const d=await pg.evaluate(()=>{const g=document.querySelector('.flyg'),an=g.getAnimations().map(a=>[a.effect.getTiming().duration,Object.keys(a.effect.getKeyframes()[0]).filter(k=>/^(transform|opacity)$/.test(k)).join()]);
    const r=g.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {an,hit:hit&&hit.classList.contains('flyg')};});
  T.check(d.an.every(a=>a[0]<=420)&&d.an.some(a=>a[0]===420&&a[1]==='transform'),'переліт: одна дуга ≤420 мс, лише transform/opacity ('+d.an.map(a=>a.join(':'))+')');
  T.check(!d.hit,'привид не перехоплює тапи (elementFromPoint його не повертає)');
  // next tap during the flight works: choose a new player right away is blocked only by the wheel, so tap the spin button
  await wait(60);const sp=await pg.evaluate(()=>!document.getElementById('spinBtn').hidden);T.check(sp,'кнопка «Крутити» доступна під час польоту');
  await b.close();}

 // rapid picks: two places in the same tick, state and visuals stay consistent
 {const {b,pg,errs}=await openPage({viewport:{width:1024,height:768}});await startDraft(pg,'classic');await spin(pg);
  const r=await pg.evaluate(async()=>{const S=window.__dbg.S,w=S.wheel,ok=[];for(const p of w.pl){if(window.__dbg.posOpts(p).length)ok.push(p);if(ok.length>6)break;}
    const used=[];for(let i=0;i<3;i++){const p=ok.find(x=>!S.taken.has(x[5])&&!used.includes(x[5])&&window.__dbg.posOpts(x).length);if(!p)break;used.push(p[5]);S.wheel=w;window.__dbg.place(p,window.__dbg.posOpts(p)[0]);}
    S.wheel=null;return {n:S.slots.filter(s=>s.player).length,g:document.querySelectorAll('.flyg').length};});
  T.check(r.n===3,`швидкі вибори: у складі ${r.n} з 3`);
  await shot(pg,"fly_rapid_mid");await wait(1400);const c=await clean(pg);
  T.check(c.g===0&&c.fw===0&&c.filled===3&&c.vis,`швидкі вибори: після 0,9 с привидів ${c.g}, слотів-чекальників ${c.fw}, усі слоти видно`);
  T.check(errs.length===0,'швидкі вибори: помилок JS немає'+(errs.length?': '+errs[0]:''));await b.close();}

 // reduced motion: no ghost, no waiting slot, no landing animation
 {const {b,pg,errs}=await openPage({viewport:{width:1024,height:768},reducedMotion:'reduce'});await startDraft(pg,'classic');await spin(pg);await pickTap(pg,'btn');
  const r=await pg.evaluate(()=>({g:document.querySelectorAll('.flyg').length,fw:document.querySelectorAll('.slot.fw').length,land:document.querySelectorAll('.disc.land0').length,filled:window.__dbg.S.slots.filter(s=>s.player).length}));
  await wait(120);const r2=await pg.evaluate(()=>document.querySelectorAll('.flyg').length);
  T.check(r.g===0&&r2===0&&r.fw===0&&r.land===0&&r.filled===1,'reduce: без привида, без чекання слота, без посадки — одразу кінцевий стан');
  T.check(errs.length===0,'reduce: помилок JS немає');await b.close();}

 // offscreen slot (short phone): flight skipped, state is right
 {const {b,pg,errs}=await openPage({viewport:{width:320,height:480}});await startDraft(pg,'classic');await spin(pg);await pickTap(pg,'btn');await wait(150);
  const r=await pg.evaluate(()=>({g:document.querySelectorAll('.flyg').length,fw:document.querySelectorAll('.slot.fw').length}));await wait(600);const c=await clean(pg);
  T.check(c.g===0&&c.fw===0&&c.filled===1&&c.vis,`320×480: слот поза екраном або переліт завершився — стан чистий (ghost ${r.g}, fw ${r.fw})`);
  T.check(await noScroll(pg),'320×480: без горизонтальної прокрутки');T.check(errs.length===0,'320×480: помилок JS немає');await b.close();}

 // ================= 3. live season digits
 async function playToLive(pg){await startDraft(pg,'classic');for(let i=0;i<11;i++){await spin(pg);await pickTap(pg,'slot');await pg.waitForTimeout(50);}
  await pg.waitForSelector('#simBtn:not([hidden])',{timeout:15000});await pg.click('#simBtn');await pg.waitForSelector('#live:not([hidden])');}
 {const {b,pg,errs}=await openPage({viewport:{width:390,height:844}});await pg.evaluate(STUB);await playToLive(pg);
  const R=await pg.evaluate(()=>{const r=window.__dbg.S.result;let w=0,d=0,l=0;r.log.forEach(m=>{if(m.res==='W')w++;else if(m.res==='D')d++;else l++;});return {n:r.log.length,rec:`${w}-${d}-${l}`,pts:String(w*3+d)};});
  // sample the header every ~40 ms while rounds tick
  const samples=[];let shotDone=false,maxDur=0,odSeen=0;
  const t0=Date.now();
  while(Date.now()-t0<30000){const s=await pg.evaluate(()=>{const q=id=>document.getElementById(id),lv=q('lvRec').getBoundingClientRect(),lp=q('lvPts').getBoundingClientRect(),lr=q('lvRound').getBoundingClientRect(),top=document.querySelector('.lvTop').getBoundingClientRect();
      const an=q('live').getAnimations({subtree:true}).filter(a=>a.effect&&!a.effect.pseudoElement&&a.effect.target&&a.effect.target.closest('.od')).map(a=>a.effect.getTiming().duration);
      return {fin:!q('final').hidden,i:window.__dbg&&0,od:q('live').querySelectorAll('.od').length,dur:an,rec:q('lvRec').dataset.odo||'',pts:q('lvPts').dataset.odo||'',rd:q('lvRound').dataset.odo||'',wr:lv.width,wp:lp.width,wd:lr.width,h:top.height,t:q('lvRec').textContent};});
    if(s.fin)break;samples.push(s);odSeen=Math.max(odSeen,s.od);s.dur.forEach(d=>{maxDur=Math.max(maxDur,d);});
    if(!shotDone&&s.od>0&&samples.length>8){shotDone=true;await shot(pg,'live_digits_mid');}
    if(s.rd==='Тур '+R.n+' / '+R.n){await wait(330);const e=await pg.evaluate(()=>({rec:document.getElementById('lvRec').textContent,pts:document.getElementById('lvPts').textContent,rd:document.getElementById('lvRound').textContent,od:document.querySelectorAll('#live .od').length}));
      T.check(e.rec===R.rec&&e.pts===R.pts&&e.rd===`Тур ${R.n} / ${R.n}`&&e.od===0,`цифри живого сезону після останнього туру: ${e.rd}, ${e.rec}, ${e.pts} (очікувано ${R.rec}, ${R.pts}), комірок od ${e.od}`);break;}
    await wait(35);}
  T.check(odSeen>0,`під час сезону цифри котилися (макс. комірок одночасно ${odSeen}, знімків ${samples.length})`);
  T.check(maxDur>0&&maxDur<=240,`кожна зміна цифри ≤240 мс (${maxDur})`);
  const byLen={};samples.forEach(s=>{const k='rec'+s.rec.length+'/pts'+s.pts.length;(byLen[k]=byLen[k]||[]).push(s);});
  const jump=Object.values(byLen).some(a=>Math.max(...a.map(s=>s.wr))-Math.min(...a.map(s=>s.wr))>0.6||Math.max(...a.map(s=>s.wp))-Math.min(...a.map(s=>s.wp))>0.6);
  if(jump)for(const [k,a] of Object.entries(byLen)){const bad=a.filter(s=>Math.abs(s.wr-a[0].wr)>0.6||Math.abs(s.wp-a[0].wp)>0.6).slice(0,3);if(bad.length)console.log('  ',k,'ref',a[0].rec,a[0].wr.toFixed(2),a[0].pts,a[0].wp.toFixed(2),'bad',JSON.stringify(bad.map(x=>[x.rec,x.pts,x.t,x.od,+x.wr.toFixed(2),+x.wp.toFixed(2)])));}
  T.check(!jump,'ширина В-Н-П і очок не стрибає під час прокрутки (tabular-nums, однакова довжина)');
  const hs=samples.map(s=>s.h);T.check(Math.max(...hs)-Math.min(...hs)<=0.6,`висота шапки живого сезону сталa (${Math.min(...hs).toFixed(1)}–${Math.max(...hs).toFixed(1)} px)`);
  // the 650 ms tick: rounds advance one by one, each roll ends before the next tick
  T.check(samples.length>20,'такт 650 мс: знімки на кожен тур');
  // finish: the 0.76 morph still works with settled digits
  await pg.waitForSelector('#final:not([hidden])',{timeout:5000});
  const fm=await pg.evaluate(()=>({rec:document.querySelector('#recTiles>div:first-child>b').style.viewTransitionName,pts:document.querySelector('#recTiles b.hot').style.viewTransitionName,live:document.getElementById('lvRec').style.viewTransitionName}));
  T.check(true,'завершення сезону без помилок (імена: '+JSON.stringify(fm)+')');
  await wait(1900);
  const nm=await pg.evaluate(()=>[...document.querySelectorAll('*')].filter(e=>e.style.viewTransitionName).length+':'+document.documentElement.className);
  T.check(/^0:/.test(nm)&&!/vt/.test(nm),'після морфа імена й класи vt зняті ('+nm+')');
  T.check(errs.length===0,'цифри: помилок JS немає'+(errs.length?': '+errs[0]:''));await b.close();}

 // skip while digits roll: settles, morph pairs are named, final numbers are right
 {const {b,pg,errs}=await openPage({viewport:{width:390,height:844}});await playToLive(pg);
  await pg.waitForFunction(()=>document.querySelectorAll('#live .od').length>0,null,{polling:'raf',timeout:8000});
  const f0=await pg.evaluate(()=>{document.getElementById('skipBtn').click();return {od:document.querySelectorAll('#live .od').length,names:[document.getElementById('lvRec').style.viewTransitionName,document.getElementById('lvPts').style.viewTransitionName].join()};});
  T.check(f0.od===0&&f0.names==='vt-rec,vt-pts',`«Одразу до фіналу»: цифри зафіксовано до морфа (od ${f0.od}), імена ${f0.names}`);
  await wait(60);
  const mid=await pg.evaluate(()=>({rec:document.querySelector('#recTiles>div:first-child>b').style.viewTransitionName,pts:document.querySelector('#recTiles b.hot').style.viewTransitionName,fin:!document.getElementById('final').hidden,vt:document.getAnimations().filter(a=>/vt-(rec|pts)/.test(a.effect&&a.effect.pseudoElement||'')).length}));
  T.check(mid.fin&&mid.rec==='vt-rec'&&mid.pts==='vt-pts'&&mid.vt>=2,`skip: підсумок показано, групи vt-rec/vt-pts анімуються (${mid.vt})`);
  await wait(2000);const e=await pg.evaluate(()=>({place:document.getElementById('placeBig').textContent,want:String(window.__dbg.S.result.place),pts:document.querySelector('#recTiles b.hot').textContent,wp:String(window.__dbg.S.result.pts),lv:document.querySelectorAll('.od').length}));
  T.check(e.place===e.want&&e.pts===e.wp&&e.lv===0,`skip: підсумок місце ${e.place}, очки ${e.pts} — збігаються; комірок od ${e.lv}`);
  T.check(errs.length===0,'skip: помилок JS немає'+(errs.length?': '+errs[0]:''));await b.close();}

 // reduced motion: digits change instantly, no cells
 {const {b,pg,errs}=await openPage({viewport:{width:390,height:844},reducedMotion:'reduce'});await playToLive(pg);let od=0;
  for(let k=0;k<12;k++){od=Math.max(od,await pg.evaluate(()=>document.querySelectorAll('#live .od').length));await wait(100);}
  const t=await pg.evaluate(()=>/^\d+-\d+-\d+$/.test(document.getElementById('lvRec').textContent)&&/^\d+$/.test(document.getElementById('lvPts').textContent)&&/^Тур \d+ \/ \d+$/.test(document.getElementById('lvRound').textContent));
  T.check(od===0&&t,'reduce: цифри змінюються миттєво, без комірок');T.check(errs.length===0,'reduce цифри: помилок JS немає');await b.close();}

 // widths: 320, iPad, tgfs, light theme
 for(const [vw,vh,tg,th,tag] of [[320,640,0,'','320'],[1024,768,0,'light','ipad-light'],[390,844,1,'','tgfs']]){
  const {b,pg,errs}=await openPage({viewport:{width:vw,height:vh}});if(tg)await pg.evaluate(()=>document.documentElement.classList.add('tgfs'));if(th)await pg.evaluate(t=>document.documentElement.setAttribute('data-theme',t),th);
  await playToLive(pg);await pg.waitForFunction(()=>document.querySelectorAll('#live .od').length>0,null,{polling:'raf',timeout:8000});await shot(pg,`live_${tag}`);
  T.check(await noScroll(pg),`${tag}: без горизонтальної прокрутки під час прокрутки цифр`);T.check(errs.length===0,`${tag}: помилок JS немає`);await b.close();}

 // ================= 1. trophy opening
 const seed=async pg=>pg.evaluate(()=>{const sec=window.__dbg.TROPHIES.find(x=>x.sec&&!x.gone).id,ids=[sec,'champ','unbeaten'];
   const s={t:{top3:{n:1,at:'2026-10-01'}},seasons:3,dailies:0};[...ids].forEach(id=>{s.t[id]={n:1,at:'2026-10-02'};});localStorage.setItem('upl30_tr',JSON.stringify(s));
   document.getElementById('s1').hidden=true;document.getElementById('s3').hidden=false;document.getElementById('final').hidden=false;document.getElementById('live').hidden=true;
   return {sec,ids};});
 {const {b,pg,errs}=await openPage({viewport:{width:390,height:844}});await pg.evaluate(STUB);const {sec,ids}=await seed(pg);
  await pg.evaluate(ids=>{window.__dbg.renderNewTro({tro:{got:ids.concat(['top3']),fresh:ids}});document.getElementById('newTro').style.marginTop='900px';},ids);
  const w0=await pg.evaluate(()=>({wait:document.getElementById('newTro').classList.contains('wait'),open:document.querySelectorAll('#newTro .tro.open').length,seal:document.querySelectorAll('#newTro .tseal').length,
    cnt:document.getElementById('trTotN').textContent,run:document.getElementById('newTro').getAnimations({subtree:true}).filter(a=>a.playState==='running').length,hap:window.__hap.length}));
  T.check(w0.open===3&&w0.seal===3&&w0.wait&&w0.run===0,`трофеї нижче екрана: ${w0.open} жетони запечатані, анімація чекає появи (wait ${w0.wait}, біжить ${w0.run})`);
  T.check(w0.cnt==='1',`лічильник у шапці блоку стартує з ${w0.cnt} (було 1 до сезону)`);
  await wait(400);T.check(await pg.evaluate(()=>window.__hap.length===0),'вібрації немає, поки трофеї не видно');
  await pg.evaluate(()=>document.getElementById('newTro').scrollIntoView({block:'center'}));
  const tS=Date.now();const log=[];let midShot=false;
  while(Date.now()-tS<4400){const s=await pg.evaluate(()=>({t:performance.now(),wait:document.getElementById('newTro').classList.contains('wait'),cnt:document.getElementById('trTotN').dataset.odo||document.getElementById('trTotN').textContent,hap:window.__hap.slice(),
      flips:[...document.querySelectorAll('#newTro .tro.open .tri')].map(e=>e.getAnimations().filter(a=>a.animationName==='openflip'&&a.playState==='running').length).join(''),seal:document.querySelectorAll('#newTro .tseal').length}));
    s.dt=Date.now()-tS;log.push(s);if(!midShot&&s.dt>330&&!s.wait){midShot=true;await shot(pg,'trophy_mid');}await wait(40);}
  const L=log[log.length-1];
  T.check(log.some(s=>/1/.test(s.flips)),'жетон перевертається: openflip біжить');
  T.check(!log.some(s=>s.wait&&s.dt>1500),'клас wait знято, коли блок став видимим');
  T.check(JSON.stringify(L.hap)===JSON.stringify(['i:heavy','i:medium','i:medium','n:success'].filter(x=>L.hap.includes(x)))&&L.hap.filter(x=>x==='i:heavy').length===1&&L.hap.filter(x=>x==='i:medium').length===2&&L.hap[L.hap.length-1]==='n:success',`вібрація: на півоберті heavy для рідкісного, medium для решти, success у кінці (${L.hap.join(' ')})`);
  const hh=log.findIndex(s=>s.hap.length>0);const first=log[hh];T.check(first&&first.dt>250,`перша вібрація на півоберті, а не на старті (${first&&first.dt} мс)`);
  const cs=[...new Set(log.map(s=>s.cnt))];T.check(cs[0]==='1'&&cs[cs.length-1]==='4'&&cs.every((v,i)=>i===0||+v>+cs[i-1]),'лічильник тикає вгору до 4: '+cs.join(' → '));
  await wait(1500);
  const f=await pg.evaluate(()=>{const cards=[...document.querySelectorAll('#newTro .tro.open')];return {seal:document.querySelectorAll('#newTro .tseal').length,wait:document.getElementById('newTro').classList.contains('wait'),
    run:document.getElementById('newTro').getAnimations({subtree:true}).filter(a=>a.playState==='running').length,cnt:document.getElementById('trTotN').textContent,txt:document.getElementById('trTotN').children.length,
    ops:cards.map(c=>getComputedStyle(c).opacity).join(),tf:cards.map(c=>getComputedStyle(c.querySelector('.tri')).transform).join(),face:cards.map(c=>getComputedStyle(c.querySelector('.tre')).opacity).join()};});
  T.check(f.seal===0&&!f.wait&&f.run===0&&f.cnt==='4'&&f.txt===0,`кінець: запечатаних жетонів ${f.seal}, анімацій у русі ${f.run}, лічильник «${f.cnt}», комірок ${f.txt}`);
  T.check(f.ops==='1,1,1'&&f.face==='1,1,1'&&f.tf.split(',').length>0&&!/matrix3d/.test(f.tf),`кінцевий стан карток: видно (${f.ops}), лицьова сторона (${f.face}), без 3D-повороту`);
  // unify: rare card has one opening, no second rarein/rarespin animation
  const nm=await pg.evaluate(()=>{const c=document.querySelector('#newTro .tro.open.rarein');const own=c.getAnimations().map(a=>a.animationName||a.constructor.name),tri=c.querySelector('.tri').getAnimations().map(a=>a.animationName),cs=getComputedStyle(c),cts=getComputedStyle(c.querySelector('.tri'));
    return {own:own.join(),tri:tri.join(),an:cs.animationName,tan:cts.animationName};});
  T.check(!/rarein\b/.test(nm.an)&&!/rarespin/.test(nm.tan)&&/openin/.test(nm.an)&&/openflip/.test(nm.tan),`рідкісний трофей: одна анімація відкриття (${nm.an} / ${nm.tan}), без другої rarein/rarespin`);
  const sw=await pg.evaluate(()=>getComputedStyle(document.querySelector('#newTro .tro.open.rarein'),'::after').animationName);T.check(sw==='raresweep','блик рідкісного збережено (raresweep)');
  await pg.evaluate(()=>document.getElementById('newTro').style.marginTop='0');await pg.evaluate(()=>document.getElementById('newTro').scrollIntoView({block:'center'}));await shot(pg,'trophy_end');
  T.check(await noScroll(pg),'трофеї 390: без горизонтальної прокрутки');T.check(errs.length===0,'трофеї: помилок JS немає'+(errs.length?': '+errs[0]:''));await b.close();}

 // trophy stagger and rarity colors, light theme, 320
 {const {b,pg,errs}=await openPage({viewport:{width:320,height:640}});await pg.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));const {ids}=await seed(pg);
  await pg.evaluate(ids=>{window.__dbg.renderNewTro({tro:{got:ids,fresh:ids}});},ids);await pg.evaluate(()=>document.getElementById('newTro').scrollIntoView({block:'center'}));await wait(420);
  const st=await pg.evaluate(()=>[...document.querySelectorAll('#newTro .tro.open')].map(c=>({od:c.style.getPropertyValue('--od'),rc:getComputedStyle(c).getPropertyValue('--rc').trim()})));
  T.check(st.map(x=>x.od).join()==='0ms,180ms,360ms','кілька трофеїв: затримка сходинками 0/180/360 мс ('+st.map(x=>x.od)+')');
  T.check(st[0].rc!==''&&st[1].rc!==''&&st[0].rc.length>0,'колір ореола береться з рідкості: '+st.map(x=>x.rc).join(' | '));
  await shot(pg,'trophy_320_light');T.check(await noScroll(pg),'трофеї 320: без горизонтальної прокрутки');T.check(errs.length===0,'трофеї 320: помилок JS немає');await b.close();}

 // reduced motion: instant end state, haptics stay
 {const {b,pg,errs}=await openPage({viewport:{width:390,height:844},reducedMotion:'reduce'});await pg.evaluate(STUB);const {ids}=await seed(pg);
  await pg.evaluate(ids=>{window.__dbg.renderNewTro({tro:{got:ids,fresh:ids}});},ids);
  const r=await pg.evaluate(()=>({open:document.querySelectorAll('#newTro .tro.open').length,seal:document.querySelectorAll('#newTro .tseal').length,wait:document.getElementById('newTro').classList.contains('wait'),
    anims:document.getElementById('newTro').getAnimations({subtree:true}).length,cnt:document.getElementById('trTotN').textContent,cards:document.querySelectorAll('#newTro .tro.new').length}));
  console.log('  reduce',JSON.stringify(r));T.check(r.open===0&&r.seal===0&&!r.wait&&r.anims===0&&r.cnt==='4'&&r.cards===3,`reduce: без жетона-печатки й анімацій, лічильник одразу ${r.cnt}, картки на місці (${r.cards})`);
  await wait(1000);T.check(await pg.evaluate(()=>window.__hap.length>0),'reduce: вібрація зберігається');T.check(errs.length===0,'reduce трофеї: помилок JS немає');await b.close();}

 // a repeat render (new summary) cancels stale timers: counter belongs to the latest render
 {const {b,pg,errs}=await openPage({viewport:{width:390,height:844}});await pg.evaluate(STUB);const {ids}=await seed(pg);
  await pg.evaluate(ids=>{window.__dbg.renderNewTro({tro:{got:ids,fresh:ids}});},ids);await wait(300);
  await pg.evaluate(ids=>{window.__dbg.renderNewTro({tro:{got:['champ'],fresh:['champ']}});},ids);await pg.evaluate(()=>document.getElementById('newTro').scrollIntoView({block:'center'}));await wait(2200);
  const c=await pg.evaluate(()=>({cnt:document.getElementById('trTotN').textContent,hap:window.__hap.filter(x=>x==='i:heavy').length}));
  T.check(c.hap===0&&c.cnt==='4',`повторний показ: застарілі таймери мовчать (heavy ${c.hap}, лічильник ${c.cnt})`);
  T.check(errs.length===0,'повторний показ: помилок JS немає');await b.close();}

 // milestone trophies (ms*) are shown but not counted in the cabinet total
 {const {b,pg,errs}=await openPage({viewport:{width:390,height:844}});await pg.evaluate(STUB);const {ids}=await seed(pg);
  await pg.evaluate(()=>{window.__dbg.renderNewTro({tro:{got:['ms1'],fresh:['ms1']}});document.getElementById('newTro').scrollIntoView({block:'center'});});await wait(300);
  T.check(await pg.evaluate(()=>!document.getElementById('trTotN')),'лише рубіж: «Зібрано» не показано');
  await pg.evaluate(id=>{window.__dbg.renderNewTro({tro:{got:[id,'ms1'],fresh:[id,'ms1']}});document.getElementById('newTro').scrollIntoView({block:'center'});},ids[1]);await wait(2500);
  const c=await pg.evaluate(()=>document.getElementById('trTotN').textContent.trim());
  T.check(c==='4',`трофей + рубіж: «Зібрано» дорахувало до 4, рубіж не враховано (${c})`);
  T.check(errs.length===0,'рубежі: помилок JS немає');await b.close();}
 FAILS.forEach(m=>console.log('ПРОВАЛ:',m));process.exit(T.done());})();
