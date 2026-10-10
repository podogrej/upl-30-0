// Motion release checks: motion tokens, press feedback (scale on :active, no layout shift, spring release), haptics through a stubbed
// Telegram HapticFeedback, reels (second reel lag, edge mask instead of blur, settle), reduced motion. Run from repo root: node tools/tests/v075.js
const {openPage}=require('./_page.js');const {checker}=require('./_site.js');
const STUB=`window.__hap=[];window.Telegram={WebApp:{initData:'stub',HapticFeedback:{impactOccurred:s=>__hap.push('i:'+s),notificationOccurred:s=>__hap.push('n:'+s),selectionChanged:()=>__hap.push('s')}}};`;
const hap=pg=>pg.evaluate(()=>window.__hap.slice());
const clear=pg=>pg.evaluate(()=>{window.__hap.length=0;});
(async()=>{const T=checker('0.75 рух');const {b,pg,errs}=await openPage({fastReel:false});   // checks the real reel animation
 // ---- tokens
 const tk=await pg.evaluate(()=>{const g=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();return {sp:g('--spring'),eo:g('--ease-out'),d:[1,2,3,4].map(i=>g('--dur-'+i)),css:CSS.supports('transition-timing-function','linear(0,1)')};});
 T.check(/^(linear\(|cubic-bezier\()/.test(tk.sp)&&/cubic-bezier/.test(tk.eo)&&tk.d.join()==='120ms,240ms,360ms,500ms',`токени руху: spring ${tk.sp.slice(0,18)}…, тривалості ${tk.d.join('/')}`);
 T.check(!tk.css||/^linear\(/.test(tk.sp),'пружина — linear() там, де браузер його підтримує');
 // ---- press feedback: scale on :active, layout unchanged, spring release
 const geo=sel=>pg.evaluate(sel=>[...document.querySelectorAll(sel)].map(e=>{const r=e.getBoundingClientRect();return [e.id||e.className,Math.round(r.left*10),Math.round(r.top*10),Math.round(r.width*10),Math.round(r.height*10)].join(':');}),sel);
 async function press(sel,name,id){const el=await pg.$(sel);if(!el){T.check(false,`${name}: елемент ${sel} не знайдено`);return;}
   await el.scrollIntoViewIfNeeded();const r=await el.boundingBox();
   const info=await pg.evaluate(sel=>{const e=document.querySelector(sel),cs=getComputedStyle(e);return {tap:cs.webkitTapHighlightColor,tr:cs.transitionProperty,off:[e.offsetWidth,e.offsetHeight]};},sel);
   const before=await geo('#s1 button, #s1 a');
   await pg.mouse.move(r.x+r.width/2,r.y+r.height/2);await pg.mouse.down();await pg.waitForTimeout(220);
   const dn=await pg.evaluate(sel=>{const e=document.querySelector(sel);return {s:getComputedStyle(e).scale,off:[e.offsetWidth,e.offsetHeight]};},sel);
   const mid=await geo('#s1 button, #s1 a');
   await pg.mouse.move(2,2);await pg.mouse.up();await pg.waitForTimeout(600);
   const up=await pg.evaluate(sel=>getComputedStyle(document.querySelector(sel)).scale,sel);
   T.check(/0, 0, 0, 0\)|transparent/.test(info.tap),`${name}: tap-highlight прозорий (${info.tap})`);
   T.check(/scale/.test(info.tr),`${name}: scale у переходах (${info.tr.slice(0,40)})`);
   T.check(Math.abs(parseFloat(dn.s)-.97)<.005,`${name}: під пальцем scale ${dn.s} (0.97)`);
   T.check(dn.off.join()===info.off.join(),`${name}: розмір у розкладці не змінився (${info.off})`);
   T.check(up==='none'||parseFloat(up)===1,`${name}: після відпускання scale ${up}`);
   const nb=before.filter(x=>!x.startsWith(id+':')),nm=mid.filter(x=>!x.startsWith(id+':'));
   T.check(nb.length>0&&nb.join('|')===nm.join('|'),`${name}: сусідні елементи не зрушили (${nb.length})`);}
 const hb=await pg.$$eval('#s1 button.primary',els=>els.filter(e=>e.getBoundingClientRect().width>0).map(e=>e.id).filter(Boolean));
 await press('#'+hb[0],`кнопка «${hb[0]}»`,hb[0]);
 // ---- reduced motion: no press scale, no transitions, no blur
 const rm=await b.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await rm.route(u=>!u.href.startsWith('file:'),r=>r.abort());
 const pr2=await rm.newPage();await pr2.goto(pg.url());await pr2.waitForTimeout(600);
 const rmi=await pr2.evaluate(()=>{const e=document.querySelector('#s1 button.primary');return {t:getComputedStyle(e).transitionDuration,s:matchMedia('(prefers-reduced-motion: reduce)').matches};});
 T.check(rmi.s&&/^0s(, 0s)*$/.test(rmi.t),`reduce: переходи кнопки вимкнено (${rmi.t})`);
 await pr2.click('#freeOpen');await pr2.waitForTimeout(300);await pr2.click('#startBtn');await pr2.waitForTimeout(200);await pr2.click('#spinBtn');
 const rf=await pr2.evaluate(()=>new Promise(r=>setTimeout(()=>{const st=document.querySelector('#reelClub .strip');r({f:getComputedStyle(st).filter,go:st.classList.contains('go')});},300)));
 T.check(rf.f==='none'&&!rf.go,`reduce: барабан без розмиття й руху (filter ${rf.f}, go ${rf.go})`);
 await rm.close();
 // ---- game flow with stubbed Telegram haptics
 await pg.context().addInitScript(STUB);await pg.reload();await pg.waitForTimeout(700);
 T.check(await pg.evaluate(()=>typeof __dbg.haptic==='function'&&Array.isArray(window.__hap)),'haptic() є, Telegram-заглушка підключена');
 await pg.click('#freeOpen');await pg.waitForTimeout(300);await pg.click('#startBtn');await pg.waitForTimeout(600);await clear(pg);   // let the screen transition finish before timing the reels
 await pg.evaluate(()=>{window.__mv=new Promise(r=>{const c=document.querySelector('#reelClub .strip'),y=document.querySelector('#reelYear .strip'),t0=performance.now();let a=null,b2=null,bl=0;
   const tick=()=>{const t=performance.now()-t0,f=getComputedStyle(c).filter;if(a==null&&c.classList.contains('go'))a=t;if(b2==null&&y.classList.contains('go'))b2=t;const m=/blur\(([\d.]+)px\)/.exec(f);if(m)bl=Math.max(bl,parseFloat(m[1]));
     if(t<1500)requestAnimationFrame(tick);else{const cs=getComputedStyle(c.parentNode);r({a,b:b2,bl,mask:cs.maskImage||cs.webkitMaskImage||''});}};tick();});});
 await pg.click('#spinBtn');await pg.waitForTimeout(60);
 let h=await hap(pg);T.check(h.includes('i:light'),`старт колеса: i:light (${h})`);
 const mv=await pg.evaluate(()=>window.__mv);
 T.check(mv.a!=null&&mv.b!=null&&mv.b-mv.a>=100&&mv.b-mv.a<=300,`другий барабан стартує пізніше (${Math.round(mv.b-mv.a)} мс)`);
 T.check(mv.bl===0&&/linear-gradient/.test(mv.mask),`барабан без розмиття стрічки, вікно з маскою по краях (blur ${mv.bl}px, mask ${mv.mask.slice(0,40)})`);
 await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});await pg.waitForTimeout(100);
 h=await hap(pg);T.check(h.includes('i:medium'),`зупинка колеса: i:medium (${h})`);
 const dirty=await pg.evaluate(()=>[...document.querySelectorAll('.reel .strip')].some(s=>s.classList.contains('go')||s.style.transform!==''));
 T.check(!dirty,'після зупинки барабани чисті (без залишкового зсуву)');
 await clear(pg);await (await pg.$('#squad .pl:not([disabled])')).click();await pg.waitForTimeout(100);
 h=await hap(pg);T.check(h.includes('s'),`вибір гравця: selectionChanged (${h})`);
 await clear(pg);const t=await pg.$('#pitch .slot.target');await t.click();await pg.waitForTimeout(100);
 h=await hap(pg);T.check(h.includes('i:light'),`гравець на місці: i:light (${h})`);
 // season end, trophies, errors (top-level functions are global)
 await clear(pg);await pg.evaluate(()=>__dbg.seasonHaptic({place:1}));await pg.waitForTimeout(80);
 await pg.evaluate(()=>__dbg.seasonHaptic({place:16}));await pg.waitForTimeout(80);await pg.evaluate(()=>__dbg.seasonHaptic({place:8}));
 h=await hap(pg);T.check(h.join()==='n:success,n:warning',`підсумок: чемпіон — success, вильот — warning, середина — тиша (${h})`);
 await clear(pg);await pg.evaluate(()=>{document.getElementById('s3').hidden=false;__dbg.renderNewTro({tro:{got:['hardchamp'],fresh:['hardchamp']}});document.getElementById('newTro').scrollIntoView({block:'center'});});await pg.waitForTimeout(1400);   // the opening starts once the block is on screen
 h=await hap(pg);T.check(['i:medium,n:success','i:heavy,n:success'].includes(h.join()),`новий трофей: удар на півоберті жетона, success після посадки (${h})`);
 await clear(pg);await pg.evaluate(()=>{const sec=__dbg.TROPHIES.find(x=>x.sec).id;__dbg.renderNewTro({tro:{got:[sec],fresh:[sec]}});document.getElementById('newTro').scrollIntoView({block:'center'});});await pg.waitForTimeout(1400);
 h=await hap(pg);T.check(h.join()==='i:heavy,n:success',`секретний трофей: важчий відгук (${h})`);
 await clear(pg);await pg.evaluate(()=>{__dbg.haptic('error');__dbg.haptic('error');});h=await hap(pg);T.check(h.join()==='n:error','помилка: n:error, повтор у межах 60 мс відсічено');
 await clear(pg);await pg.evaluate(()=>__dbg.haptic('light',500));await pg.waitForTimeout(100);await pg.evaluate(()=>__dbg.haptic('light',500));h=await hap(pg);T.check(h.length===1,`гол: тротлінг працює (${h.length})`);
 // fallbacks
 const vb=await pg.evaluate(()=>{window.Telegram=undefined;let n=0;navigator.vibrate=()=>{n++;return true;};__dbg.haptic('success');return n;});
 T.check(vb===1,'без Telegram — navigator.vibrate');
 const none=await pg.evaluate(()=>{navigator.vibrate=undefined;try{__dbg.haptic('heavy');return true;}catch(e){return false;}});T.check(none,'без Telegram і vibrate — нічого не ламається');
 // live season haptic on wins only (round is 650 ms), live table starts empty, no false reduced-motion note, no stale one-reel layout
 const src=require('fs').readFileSync(require('path').join(__dirname,'..','..','index.html'),'utf8');
 T.check(/m\.res==='W'\)\{haptic\('light'\)/.test(src)&&!/m\.ug>0\)haptic/.test(src),'сезон: вібрація лише на перемогу, не на кожен гол');
 T.check(/fin\.hidden=true;document\.getElementById\('lvTable'\)\.innerHTML=''/.test(src),'живий сезон: таблиця минулого сезону очищається (без хибного FLIP)');
 T.check(!/Вимикається системним/.test(src),'«Що нового»: без неправди про «Зменшити рух»');
 {const one=await pg.evaluate(()=>{const r=document.querySelector('.reels');r.classList.add('one');__dbg.S.mode='normal';try{document.getElementById('spinBtn').click();}catch(e){}return r.classList.contains('one');});T.check(!one,'колесо: залишок «одного барабана» знімається на старті');}
 T.check(errs.length===0,'помилок JS немає'+(errs.length?': '+errs[0]:''));
 await b.close();process.exit(T.done());})();
