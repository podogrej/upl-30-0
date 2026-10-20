// 0.93: tap on an empty pitch position (spin / hint / swap mode / season pick / daily challenge / one club), Clarity events,
// quiet reroll row and hint, layout shifts on the home screen (slow network + CPU) and a reserved height of the daily challenge card.
// Screenshots: tools/tests/out/v093_*.png. Run from repo root: node tools/tests/v093.js
const path=require('path'),fs=require('fs'),http=require('http'),zlib=require('zlib');
const {ROOT,launch,openPage,playSeason,pickFmt}=require('./_page.js');const {checker}=require('./_site.js');
const OUT=path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const T=checker('0.93 порожня позиція, події, CLS');
const EMPTY='#pitch .slot.slot-tap .disc';
const stubClarity=pg=>pg.evaluate(()=>{window.__ce=[];window.clarity=(...a)=>window.__ce.push(a);});
const evs=pg=>pg.evaluate(()=>window.__ce.map(a=>a.join(':')));
const dbg=(pg,f,a)=>pg.evaluate(f,a);
async function toastText(pg){return (await pg.evaluate(()=>{const e=document.querySelector('#toast .toast:not(.out) span');return e?e.textContent:'';}));}
async function openDraft(pg,fmt){await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.waitForTimeout(200);await pg.click('#freeOpen');if(fmt)await pickFmt(pg,fmt);await pg.click('#startBtn');await pg.waitForTimeout(400);}
(async()=>{const b=await launch();
 // ---- 1. before the first spin: tap spins the wheel, once
 {const {pg,ctx,errs}=await openPage({b,viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await stubClarity(pg);await openDraft(pg);
  const r0=await pg.$$eval('#pitch .slot.slot-tap',a=>a.length);T.check(r0===11,'11 порожніх позицій мають зону дотику: '+r0);
  const box=await pg.$eval(EMPTY,e=>{const c=getComputedStyle(e,'::before');return {w:parseFloat(c.width),h:parseFloat(c.height),pos:c.position};});
  T.check(box.w>=44&&box.h>=44&&box.pos==='absolute','зона дотику порожнього кружка ≥ 44px: '+box.w+'×'+box.h);
  const a11y=await pg.$eval('#pitch .slot.slot-tap',e=>({tab:e.hasAttribute('tabindex'),role:e.getAttribute('role')}));T.check(!a11y.tab&&!a11y.role,'порожній кружок не кнопка для скринрідера і клавіатури');
  T.check(await pg.$eval('#pitch .slot.slot-tap',e=>getComputedStyle(e).webkitTapHighlightColor)==='rgba(0, 0, 0, 0)','тап без системного підсвічування');
  await pg.screenshot({path:path.join(OUT,'v093_1_idle.png')});
  // two taps in a row: the wheel is issued once
  const w1=await pg.evaluate(()=>{const e=document.querySelector('#pitch .slot.slot-tap .disc');const rr=window.__dbg.S.rerolls;e.click();const w=window.__dbg.S.wheel;e.click();e.click();return {same:window.__dbg.S.wheel===w&&!!w,rr,rr2:window.__dbg.S.rerolls,wheelOpen:!document.getElementById('wheel').hidden,btnHidden:document.getElementById('spinBtn').hidden};});
  T.check(w1.same&&w1.wheelOpen&&w1.btnHidden&&w1.rr===w1.rr2,'тап по порожній позиції крутить колесо; подвійний тап — одне колесо',JSON.stringify(w1));
  // reels still spinning: no hint yet
  await pg.evaluate(()=>{const e=document.querySelector('#pitch .slot.slot-tap .disc');if(!document.querySelector('#squad .pl'))e.click();});
  await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});await pg.waitForTimeout(400);
  // wheel open and the list is ready: scroll to the list and hint
  await pg.evaluate(()=>window.scrollTo(0,0));await pg.waitForTimeout(300);
  await pg.evaluate(()=>document.querySelector('#pitch .slot.slot-tap .disc').click());await pg.waitForTimeout(900);
  T.check(await toastText(pg)==='Обери гравця зі списку','колесо вже відкрите: підказка «Обери гравця зі списку»',await toastText(pg));
  const lay=await pg.evaluate(()=>{const t=document.querySelector('#toast .toast:not(.out)').getBoundingClientRect(),h=document.querySelector('header.top').getBoundingClientRect();const q=s=>{const e=document.querySelector(s);return e?e.getBoundingClientRect():null;};const first=q('#squad .pl'),rr=q('#rerollClub'),rb=q('#rerollRow .seg');return {sy:scrollY,tTop:t.top,hb:h.bottom,firstBottom:first&&first.bottom,rrBottom:rb&&rb.bottom,rrTop:rb&&rb.top,reels:q('.reels').top};});
  T.check(lay.sy>200&&lay.reels>=0&&lay.reels<400,'список прокручено під шапку (scrollY '+Math.round(lay.sy)+', колесо '+Math.round(lay.reels)+'px зверху)');
  T.check(lay.rrBottom<lay.tTop-4,'підказка не закриває кнопки перекрутки: кнопки до '+Math.round(lay.rrBottom)+', підказка з '+Math.round(lay.tTop));
  T.check(lay.firstBottom<lay.tTop-4,'підказка не закриває перший рядок списку: до '+Math.round(lay.firstBottom)+', підказка з '+Math.round(lay.tTop));
  await pg.screenshot({path:path.join(OUT,'v093_2_wheel_toast.png')});
  // quiet reroll row
  const q=await pg.evaluate(()=>{const cs=(s,p)=>getComputedStyle(document.querySelector(s))[p],root=getComputedStyle(document.documentElement);const px=n=>{const d=document.createElement('i');d.style.fontSize=`var(${n})`;document.body.appendChild(d);const v=getComputedStyle(d).fontSize;d.remove();return v;};
   return {bg:cs('#rerollCnt','backgroundColor'),fs:cs('#rerollCnt','fontSize'),fsLbl:cs('#rerollRow .lbl','fontSize'),wLbl:cs('#rerollRow .lbl','fontWeight'),fsFoot:px('--fs-footnote'),fsBody:px('--fs-body'),wb:cs('#rerollCnt','fontWeight'),hint:cs('#wHint','fontSize'),w:cs('#rerollCnt','minWidth')};});
  T.check(q.bg==='rgba(0, 0, 0, 0)'&&q.w==='auto'||q.w==='0px','число перекруток без заливки і кружка',JSON.stringify(q));
  T.check(q.fs===q.fsFoot&&q.fsLbl===q.fsFoot&&+q.wLbl<=500&&+q.wb>=600,'підпис перекруток — footnote, число жирне',JSON.stringify(q));
  T.check(q.hint===q.fsFoot,'#wHint — дрібний підпис (footnote)',q.hint);
  T.check(errs.length===0,'без помилок JS: '+errs.join(';'));
  const ev=await evs(pg);T.check(ev.filter(x=>x==='event:empty_tap').length>=3,'подія empty_tap: '+ev.join(','));
  await ctx.close();}
 // ---- 2. swap mode: an empty target moves the player as before, other empty positions do nothing
 {const {pg,ctx}=await openPage({b,viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await openDraft(pg);
  for(let i=0;i<2;i++){await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});
  await dbg(pg,()=>{const D=window.__dbg,w=D.S.wheel,id=document.querySelector('#squad .pl:not([disabled])').dataset.id,p=w.pl.find(x=>x[5]===id);D.place(p,D.posOpts(p)[0]);});await pg.waitForTimeout(500);}
  const vis=await pg.$eval('#moveBtn',e=>!e.hidden);T.check(vis,'кнопка «Переставити гравців» видна після двох гравців');
  if(vis){await pg.click('#moveBtn');await pg.waitForTimeout(200);
   await pg.click('#pitch .slot.filled');await pg.waitForTimeout(300);
   const s0=await dbg(pg,()=>({mv:window.__dbg.S.move,t:document.querySelectorAll('#pitch .slot.target').length,slot:window.__dbg.S.move,spin:!document.getElementById('spinBtn').hidden}));
   await pg.evaluate(()=>{const e=document.querySelector('#pitch .slot.empty.slot-tap .disc');if(e)e.click();});await pg.waitForTimeout(300);
   const s1=await dbg(pg,()=>({wheel:!document.getElementById('wheel').hidden,toast:!!document.querySelector('#toast .toast:not(.out)'),mv:window.__dbg.S.move}));
   T.check(s0.mv!=null&&!s1.wheel&&!s1.toast&&s1.mv===s0.mv,'режим перестановки: порожня позиція без підсвітки нічого не робить',JSON.stringify([s0,s1]));
   if(s0.t>0){await pg.click('#pitch .slot.target');await pg.waitForTimeout(400);const s2=await dbg(pg,m=>({vacated:!window.__dbg.S.slots[m].player,mv:window.__dbg.S.move}),s0.mv);
    T.check(s2.vacated&&s2.mv==null,'режим перестановки: цільова позиція переставляє гравця як раніше',JSON.stringify([s0,s2]));}
   else T.check(true,'(гравець без альтернативних позицій — цілей немає)');}
  await ctx.close();}
 // ---- 3. season pick: tap spins the club, then the hint is "Обери сезон"
 {const {pg,ctx}=await openPage({b,viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await stubClarity(pg);await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.click('#freeOpen');await pickFmt(pg,'pick');await pg.click('#startBtn');await pg.waitForTimeout(400);
  await pg.evaluate(()=>document.querySelector('#pitch .slot.slot-tap .disc').click());
  await pg.waitForSelector('#seaPick:not([hidden]) button',{timeout:8000});await pg.waitForTimeout(500);
  await pg.evaluate(()=>window.scrollTo(0,0));await pg.waitForTimeout(300);
  await pg.evaluate(()=>document.querySelector('#pitch .slot.slot-tap .disc').click());await pg.waitForTimeout(900);
  T.check(await toastText(pg)==='Обери сезон','вибір сезону: підказка «Обери сезон»',await toastText(pg));
  const h=await pg.evaluate(()=>{const px=n=>{const d=document.createElement('i');d.style.fontSize=`var(${n})`;document.body.appendChild(d);const v=getComputedStyle(d).fontSize;d.remove();return v;};return {hint:getComputedStyle(document.getElementById('wHint')).fontSize,body:px('--fs-body'),text:document.getElementById('wHint').textContent};});
  T.check(h.hint===h.body,'вибір сезону: #wHint — інструкція у розмірі body',JSON.stringify(h));
  await pg.screenshot({path:path.join(OUT,'v093_3_pick.png')});
  T.check((await evs(pg)).includes('event:spin_first'),'spin_first і в режимі вибору сезону');
  await ctx.close();}
 // ---- 4. daily challenge and one club: tap spins
 {const {pg,ctx}=await openPage({b,viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await stubClarity(pg);
  await pg.evaluate(()=>window.__dbg.vdOpen('2026-10-12'));await pg.waitForTimeout(500);
  const n0=await pg.$$eval('#pitch .slot.slot-tap',a=>a.length);
  await pg.evaluate(()=>document.querySelector('#pitch .slot.slot-tap .disc').click());
  await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});
  T.check(n0===10,'виклик дня: перший гравець стоїть заздалегідь, 10 порожніх позицій: '+n0);T.check(true,'виклик дня: тап по порожній позиції відкрив колесо');
  const e1=await evs(pg);T.check(e1.includes('event:draft_start')&&e1.includes('event:spin_first')&&!e1.includes('event:pick_1'),'виклик дня: draft_start, spin_first, без pick_1: '+e1.join(','));
  await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.waitForTimeout(200);
  await pg.click('#freeOpen');await pickFmt(pg,'oneclub');await pg.waitForTimeout(300);
  await pg.click('#startBtn');await pg.waitForTimeout(500);
  await pg.evaluate(()=>document.querySelector('#pitch .slot.slot-tap .disc').click());
  await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});
  T.check(true,'«Один клуб»: тап по порожній позиції відкрив колесо');
  await ctx.close();}
 // ---- 5. Clarity events over a whole season
 {const {pg,ctx}=await openPage({b,viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await stubClarity(pg);await playSeason(pg,'classic',1,1,{dbg:true});await pg.waitForTimeout(500);
  const raw=await pg.evaluate(()=>window.__ce),names=raw.filter(a=>a[0]==='event').map(a=>a[1]);
  const want=['draft_start','spin_first',...Array.from({length:11},(_,i)=>'pick_'+(i+1)),'squad_full','season_go','season_done'];
  T.check(want.every(n=>names.includes(n)),'усі події сезону надіслано: '+names.join(','));
  T.check(names.filter(n=>n==='draft_start').length===1&&names.filter(n=>n==='spin_first').length===1,'draft_start і spin_first — по одному разу за драфт');
  T.check(names.indexOf('draft_start')<names.indexOf('spin_first')&&names.indexOf('pick_11')<names.indexOf('squad_full')&&names.indexOf('season_go')<names.indexOf('season_done'),'порядок подій: від початку до кінця');
  T.check(raw.every(a=>(a[0]==='event'&&/^[a-z_0-9]+$/.test(a[1])&&a.length===2)||(a[0]==='set'&&a[1]==='screen')),'у подіях немає даних гравця: лише імена та мітка screen');
  // new draft: spin_first again
  await pg.evaluate(()=>{window.__ce.length=0;});await openDraft(pg);await pg.click('#spinBtn');await pg.waitForTimeout(300);
  T.check((await evs(pg)).filter(x=>x==='event:spin_first').length===1,'новий драфт: spin_first знову');
  await ctx.close();}
 // ---- 6. home screen over a slow network: layout shifts and a reserved height of the challenge card
 {const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript','.otf':'font/otf','.png':'image/png','.json':'application/json'};
  const srv=http.createServer((q,s)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u==='/')u='/index.html';const f=path.join(ROOT,u);
   if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()||/node_modules|\.git/.test(u)){s.statusCode=404;return s.end();}
   const buf=fs.readFileSync(f),ext=path.extname(f),h={'content-type':mime[ext]||'application/octet-stream'};
   if(/html|js|json/.test(ext)){h['content-encoding']='gzip';s.writeHead(200,h);return s.end(zlib.gzipSync(buf));}s.writeHead(200,h);s.end(buf);});
  await new Promise(r=>srv.listen(0,'127.0.0.1',r));const url='http://upl30.test:'+srv.address().port+'/';
  // own browser: the local host must bypass the sandbox proxy
  const {chromium}=require(path.join(ROOT,'tools','node_modules','playwright'));const pd=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';let exe;try{const c=fs.readdirSync(pd).filter(x=>/^chromium-\d+$/.test(x)).sort().pop();if(c)exe=path.join(pd,c,'chrome-linux','chrome');}catch(e){}
  const b2=await chromium.launch({executablePath:exe,args:['--no-sandbox','--host-resolver-rules=MAP upl30.test 127.0.0.1'],proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY,bypass:'upl30.test'}:undefined});
  const ctx=await b2.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await ctx.route(u=>!u.href.startsWith(url),r=>r.abort());
  const pg=await ctx.newPage();const cdp=await ctx.newCDPSession(pg);
  await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1.6*1024*1024/8,uploadThroughput:750*1024/8});await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await pg.addInitScript(()=>{window.__ls=[];window.__vdH=[];new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__ls.push(e.value);}).observe({type:'layout-shift',buffered:true});
   const t=setInterval(()=>{const e=document.getElementById('vdBox');if(e){window.__vdH.push(Math.round(e.getBoundingClientRect().height)+':'+e.childElementCount);}},30);setTimeout(()=>clearInterval(t),20000);});
  await pg.goto(url,{waitUntil:'load',timeout:90000});await pg.waitForTimeout(6000);
  const r=await pg.evaluate(()=>({sum:window.__ls.reduce((a,x)=>a+x,0),h:window.__vdH}));
  const first=r.h.find(x=>+x.split(':')[0]>0);T.check(r.sum<0.05,'головна на повільній мережі: сума зсувів '+r.sum.toFixed(3)+' < 0.05');
  T.check(r.h.length>0&&+r.h[0].split(':')[0]>=170&&r.h[0].endsWith(':0'),'#vdBox резервує місце ще до відмальовування картки: '+r.h[0]);
  const after=await pg.evaluate(()=>({h:Math.round(document.getElementById('vdBox').getBoundingClientRect().height),ls:localStorage.getItem('upl30_vdh')}));
  T.check(after.h>=100&&after.ls&&JSON.parse(after.ls).h===after.h,'після відмальовування висота картки запам\'ятана для наступного відкриття: '+JSON.stringify(after));
  await pg.screenshot({path:path.join(OUT,'v093_4_home.png')});await ctx.close();await b2.close();srv.close();}
 await b.close();T.done();
})().catch(e=>{console.error(e);process.exit(1);});
