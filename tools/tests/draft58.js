// 0.58 «Зручність»: кнопки позицій під гравцем у колесі, епохи у вільній грі, мітки екранів для Clarity,
// чистка старих ключів localStorage, один відмінок після числа (plUk), трофей «Гамарджоба».
// Запуск з кореня: node tools/tests/draft58.js [папка для знімків]. Код виходу 0 — усе гаразд.
const path=require('path'),fs=require('fs');const {ROOT,openPage}=require('./_page.js');
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const fail=[];const check=(ok,msg)=>{console.log((ok?'✓ ':'✗ ')+msg);if(!ok)fail.push(msg);};
const home=pg=>pg.evaluate(()=>document.getElementById('homeBtn').click());
const spin=async pg=>{await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});};
// індекс першого доступного гравця в колесі, у якого n вільних позицій (n=2 — «дві й більше»)
const findPl=(pg,multi)=>pg.evaluate(multi=>{const D=window.__dbg,S=D.S;const bs=[...document.querySelectorAll('#squad .pl')];
  return bs.findIndex(b=>{if(b.disabled)return false;const p=S.wheel.pl.find(q=>q[5]===b.dataset.id);const n=D.posOpts(p).length;return multi?n>=2:n===1;});},multi);
(async()=>{const {b,pg,errs}=await openPage();
 // ---- чистка localStorage: дневні ключі старші за 14 днів і старий рекорд upl30_best (переноситься в upl30_best_v2)
 await pg.evaluate(()=>{const d3=new Date(Date.now()-3*864e5).toISOString().slice(0,10);
   localStorage.setItem('upl30_daily_2020-01-01','{"W":1}');localStorage.setItem('upl30_sent_2020-01-01','true');localStorage.setItem('upl30_daily_'+d3,'{"W":2}');
   localStorage.setItem('upl30_best',JSON.stringify({W:20,D:5,L:5,pts:65,place:2,formation:'4-4-2',mode:'normal'}));localStorage.removeItem('upl30_best_v2');});
 await pg.reload();await pg.waitForTimeout(700);
 const ls=await pg.evaluate(()=>({old:localStorage.getItem('upl30_daily_2020-01-01'),sent:localStorage.getItem('upl30_sent_2020-01-01'),n:Object.keys(localStorage).filter(k=>/^upl30_daily_/.test(k)).length,
   best:localStorage.getItem('upl30_best'),v2:JSON.parse(localStorage.getItem('upl30_best_v2')||'{}')}));
 check(ls.old===null&&ls.sent===null,'localStorage: ключі виклику дня старші за 14 днів стерто');
 check(ls.n===1,'localStorage: свіжий ключ виклику дня лишився');
 check(ls.best===null&&ls.v2.classic&&ls.v2.classic.pts===65,'localStorage: upl30_best перенесено в upl30_best_v2 і стерто');
 // ---- відмінки: один plUk
 const pl=await pg.evaluate(()=>[0,1,2,4,5,11,12,14,21,22,25,101,111,112].map(n=>n+' '+window.__dbg.ptsWord(n)).join(', '));
 check(pl==='0 очок, 1 очко, 2 очки, 4 очки, 5 очок, 11 очок, 12 очок, 14 очок, 21 очко, 22 очки, 25 очок, 101 очко, 111 очок, 112 очок','відмінки: '+pl);
 // ---- Clarity: мітка екрана при кожній зміні (у тесті Clarity немає — ставимо заглушку)
 await pg.evaluate(()=>{window.__cl=[];window.clarity=(...a)=>window.__cl.push(a.join(':'));});
 await pg.click('#freeOpen');await pg.click('#startBtn');await pg.click('#newsBtn');await pg.click('#viewClose');await home(pg);
 await pg.click('#trBtn');await pg.waitForTimeout(200);await home(pg);await pg.click('#boardOpen');await pg.click('#viewBox',{position:{x:5,y:5}});await pg.evaluate(()=>document.getElementById('f5Open').click());await home(pg);   // 0.60: «Трофеї» — своя сторінка; 5×5 на одному телефоні сховано (кнопка лишилась)
 const cl=await pg.evaluate(()=>window.__cl.map(x=>x.replace('set:screen:','')).join(' '));
 check(cl==='setup draft news draft home player home table home five home','Clarity: '+cl);
 await pg.evaluate(()=>{delete window.clarity;});
 // ---- епохи: вибір на екрані вільної гри, пам'ятається; «Один клуб» — без епохи
 await pg.click('#freeOpen');
 const e0=await pg.evaluate(()=>({vis:!document.getElementById('eraBox').hidden,names:[...document.querySelectorAll('#eras button')].map(b=>b.textContent).join(','),on:(document.querySelector('#eras button.on')||{}).textContent}));
 check(e0.vis&&e0.names==='Усі роки,З 2000-х,З 2010-х,Сучасність'&&e0.on==='Усі роки','епохи: 4 кнопки, за замовчуванням «Усі роки» ('+JSON.stringify(e0)+')');
 await pg.click('#eras button[data-era="y2015"]');
 check(await pg.evaluate(()=>localStorage.getItem('upl30_era')==='"y2015"'&&document.querySelector('#eras button.on').dataset.era==='y2015'&&document.querySelector('#eras button.on').getAttribute('aria-checked')==='true'),'епохи: вибір збережено');
 await pg.click('#formats .opt[data-fmt="oneclub"]');check(await pg.evaluate(()=>document.getElementById('eraBox').hidden),'епохи: в «Одному клубі» вибору немає');
 await pg.click('#formats .opt[data-fmt="classic"]');check(await pg.evaluate(()=>!document.getElementById('eraBox').hidden),'епохи: у класиці вибір є');
 await pg.screenshot({path:path.join(OUT,'era_setup.png'),fullPage:true});
 await pg.setViewportSize({width:320,height:700});await pg.waitForTimeout(100);
 check(await pg.evaluate(()=>{const r=document.getElementById('eras').getBoundingClientRect();return r.right<=document.documentElement.clientWidth&&[...document.querySelectorAll('#eras button')].every(b=>b.scrollWidth<=b.clientWidth+1);}),'епохи: на 320 px кнопки влазять');
 await (await pg.$('#eraBox')).screenshot({path:path.join(OUT,'era_320.png')});await pg.setViewportSize({width:390,height:844});
 await pg.click('#modes .opt:nth-child(1)');await pg.click('#startBtn');
 check(await pg.evaluate(()=>/Сучасність/.test(document.getElementById('modeLabel').textContent)&&window.__dbg.S.chal===null),'епохи: підпис драфту з епохою, «Виклику другу» немає');
 const ys=[];for(let i=0;i<11;i++){await spin(pg);ys.push(await pg.evaluate(()=>window.__dbg.S.wheel.y));await (await pg.$('#squad .pl:not([disabled])')).click();await pg.waitForTimeout(60);const pb=await pg.$('#squad .plpos button');if(pb){await pb.click();await pg.waitForTimeout(60);}}
 check(ys.every(y=>y>=2015),'епохи: колесо «Сучасність» дає лише сезони 2015/16+ ('+ys.join(',')+')');
 check(await pg.evaluate(()=>window.__dbg.S.slots.every(s=>s.player&&s.player.y>=2015)),'епохи: увесь склад з 2015/16+');
 await pg.waitForSelector('#simBtn:not([hidden])');await pg.click('#simBtn');await pg.click('#skipBtn');await pg.waitForTimeout(400);
 check(await pg.evaluate(()=>/Сучасність/.test(document.getElementById('shareText').value)&&document.getElementById('chalBox').hidden),'епохи: епоха в тексті результату, виклику другу немає');
 await pg.reload();await pg.waitForTimeout(600);
 check(await pg.evaluate(()=>window.__dbg.S.era==='y2015'),'епохи: вибір пам\'ятається після перезавантаження');
 // дербі з 2010-х
 await pg.click('#freeOpen');await pg.click('#eras button[data-era="y2010"]');await pg.click('#formats .opt[data-fmt="derby"]');await pg.click('#startBtn');
 const dy=[];for(let i=0;i<4;i++){await spin(pg);dy.push(await pg.evaluate(()=>{const w=window.__dbg.S.wheel;return w.c+' '+w.y;}));await (await pg.$('#squad .pl:not([disabled])')).click();await pg.waitForTimeout(60);const pb=await pg.$('#squad .plpos button');if(pb)await pb.click();}
 check(dy.every(s=>/^(dynamo-kyiv|shakhtar-donetsk) 20(1\d|2\d)$/.test(s)),'епохи: дербі з 2010-х — лише Динамо/Шахтар 2010+ ('+dy.join(', ')+')');
 // виклик дня — завжди всі роки
 await home(pg);await pg.click('#dailyBtn');
 const dd=[];for(let i=0;i<11;i++){await spin(pg);dd.push(await pg.evaluate(()=>window.__dbg.S.wheel.y));await (await pg.$('#squad .pl:not([disabled])')).click();await pg.waitForTimeout(60);const pb=await pg.$('#squad .plpos button');if(pb)await pb.click();}
 check(await pg.evaluate(()=>window.__dbg.eraOf()==='all')&&dd.some(y=>y<2010),'епохи: виклик дня без епохи ('+dd.join(',')+')');
 // ---- кнопки позицій: класика, усі роки, 4-4-2
 await home(pg);await pg.click('#freeOpen');await pg.click('#eras button[data-era="all"]');await pg.click('#formats .opt[data-fmt="classic"]');await pg.click('#formations .opt:nth-child(1)');await pg.click('#startBtn');
 let shot=false,tested=0,kb=false,single=false;
 for(let k=0;k<11&&!(tested>=2&&kb&&single);k++){
  await spin(pg);
  const mi=await findPl(pg,true),si=await findPl(pg,false);
  if(mi>=0&&tested<2){
   const exp=await pg.evaluate(i=>{const D=window.__dbg,S=D.S;const b=document.querySelectorAll('#squad .pl')[i];const p=S.wheel.pl.find(q=>q[5]===b.dataset.id);
     return {id:p[5],codes:D.posOpts(p).map(s=>s.slot),free:[...new Set(S.slots.filter(s=>!s.player).map(s=>s.slot))]};},mi);
   await (await pg.$$('#squad .pl'))[mi].click();await pg.waitForTimeout(150);
   const got=await pg.evaluate(()=>{const S=window.__dbg.S;const bs=[...document.querySelectorAll('#squad .plpos button')];
     return {codes:bs.map(b=>b.dataset.slot),labels:bs.map(b=>b.textContent),focus:document.activeElement===bs[0],targets:[...new Set([...document.querySelectorAll('#pitch .slot')].map((d,i)=>d.classList.contains('target')?S.slots[i].slot:null).filter(Boolean))],after:document.querySelector('#squad .pl.on+.plpos')!=null};});
   check(got.codes.length>=2&&JSON.stringify([...got.codes].sort())===JSON.stringify([...exp.codes].sort()),'позиції: кнопки = вільні дозволені позиції ('+got.labels.join(' ')+')');
   check(JSON.stringify([...got.codes].sort())===JSON.stringify([...got.targets].sort()),'позиції: ті самі місця підсвічені на полі ('+got.targets.join(',')+')');
   check(got.codes.every(c=>exp.free.includes(c)),'позиції: зайнятих позицій немає');
   check(got.after&&got.focus,'позиції: кнопки одразу під гравцем, фокус на першій');
   if(!shot){shot=true;await pg.evaluate(()=>document.querySelector('#squad .plpos').scrollIntoView({block:'center'}));await pg.waitForTimeout(250);await pg.screenshot({path:path.join(OUT,'posbtn.png')});}
   const pick=got.codes[got.codes.length-1];await pg.click(`#squad .plpos button[data-slot="${pick}"]`);await pg.waitForTimeout(100);
   check(await pg.evaluate(([id,pick])=>{const S=window.__dbg.S;const s=S.slots.find(x=>x.player&&x.player.id===id);return !!s&&s.slot===pick&&!S.pending&&!S.wheel;},[exp.id,pick]),'позиції: тап по кнопці ставить гравця на цю позицію');
   tested++;continue;}
  if(mi>=0&&!kb){   // клавіатура: Enter — кнопки, Escape — скасувати, Enter на кнопці — поставити
   const pl=(await pg.$$('#squad .pl'))[mi];await pl.focus();await pg.keyboard.press('Enter');await pg.waitForTimeout(120);
   const a=await pg.evaluate(()=>!!document.querySelector('#squad .plpos')&&document.activeElement.parentElement.classList.contains('plpos'));
   await pg.keyboard.press('Escape');await pg.waitForTimeout(120);
   const c=await pg.evaluate(()=>!document.querySelector('#squad .plpos')&&!window.__dbg.S.pending&&document.activeElement.classList.contains('pl'));
   await pg.keyboard.press('Enter');await pg.waitForTimeout(120);const n0=await pg.evaluate(()=>window.__dbg.S.slots.filter(s=>s.player).length);
   await pg.keyboard.press('Enter');await pg.waitForTimeout(120);const n1=await pg.evaluate(()=>window.__dbg.S.slots.filter(s=>s.player).length);
   check(a&&c&&n1===n0+1,'позиції: з клавіатури (Enter — кнопки, Escape — скасувати, Enter — поставити)');kb=true;continue;}
  if(si>=0&&!single){const n0=await pg.evaluate(()=>window.__dbg.S.slots.filter(s=>s.player).length);await (await pg.$$('#squad .pl'))[si].click();await pg.waitForTimeout(100);
   check(await pg.evaluate(n0=>window.__dbg.S.slots.filter(s=>s.player).length===n0+1&&!document.querySelector('#squad .plpos'),n0),'позиції: одна вільна позиція — ставимо одразу, без кнопок');single=true;continue;}
  await (await pg.$('#squad .pl:not([disabled])')).click();await pg.waitForTimeout(60);const pb=await pg.$('#squad .plpos button');if(pb)await pb.click();
 }
 check(tested>=2&&kb&&single,`позиції: перевірено всі випадки (кнопки ${tested}, клавіатура ${kb}, одна позиція ${single})`);
 // тап по полю, як і раніше
 {let done=false;for(let k=0;k<6&&!done;k++){const left=await pg.evaluate(()=>window.__dbg.S.slots.filter(s=>!s.player).length);if(!left)break;await spin(pg);const mi=await findPl(pg,true);
   if(mi<0){await (await pg.$('#squad .pl:not([disabled])')).click();await pg.waitForTimeout(60);const pb=await pg.$('#squad .plpos button');if(pb)await pb.click();continue;}
   await (await pg.$$('#squad .pl'))[mi].click();await pg.waitForTimeout(100);const n0=await pg.evaluate(()=>window.__dbg.S.slots.filter(s=>s.player).length);
   await pg.click('#pitch .slot.target');await pg.waitForTimeout(100);check(await pg.evaluate(n0=>window.__dbg.S.slots.filter(s=>s.player).length===n0+1,n0),'позиції: тап по підсвіченому місцю на полі теж ставить');done=true;}
  if(!done)console.log('(тап по полю: не випало гравця з кількома позиціями — пропущено)');}
 // виклик дня теж з кнопками
 await home(pg);await pg.evaluate(()=>{localStorage.clear();});await pg.reload();await pg.waitForTimeout(500);await pg.click('#dailyBtn');
 {let seen=false;for(let k=0;k<11&&!seen;k++){await spin(pg);const mi=await findPl(pg,true);if(mi>=0){await (await pg.$$('#squad .pl'))[mi].click();await pg.waitForTimeout(100);seen=await pg.evaluate(()=>document.querySelectorAll('#squad .plpos button').length>=2);break;}
   await (await pg.$('#squad .pl:not([disabled])')).click();await pg.waitForTimeout(60);}
  check(seen,'позиції: у виклику дня кнопки теж є');}
 // ---- трофей «Гамарджоба»: 6+ грузинів
 check(await pg.evaluate(()=>{const D=window.__dbg,g=D.DATA.nats.indexOf('Грузія');const X=n=>Array.from({length:11},(_,i)=>({id:'x'+i,name:'Гравець Тест'+i,nat:i<n?g:0}));
   const c=xi=>({r:{W:10,D:10,L:10,pts:40,place:8,gf:40,ga:40,xp:40,log:[]},xi,pl:[],mode:'normal',format:'classic',reveal:true});
   return D.trEval(c(X(6))).includes('gamarjoba')&&!D.trEval(c(X(5))).includes('gamarjoba')&&D.TROPHIES.find(t=>t.id==='gamarjoba').sec===1;}),'трофей «Гамарджоба»: 6 грузинів — так, 5 — ні, секретний');
 check(!errs.length,'помилки на сторінці: '+errs.join(' | '));
 console.log('\nзнімки:',OUT);console.log(fail.length?'ПРОБЛЕМИ:\n- '+fail.join('\n- '):'УСЕ ГАРАЗД');await b.close();process.exit(fail.length?1:0);})();
