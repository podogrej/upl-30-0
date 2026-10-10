// "Your numbers" on the own player page (src/numbers.js): RPC player_numbers mocked (SQL part: tools/tests/setup.sh).
// Covers: 5+ seasons full section, fewer seasons neutral line, XI on the game's pitch (same proportions, same chips), tap card open/switch/close,
// old favourite rows hidden at 5+ seasons, not on someone else's page, cache (one request), RPC failure, "rejected" only with data,
// reduced motion, no horizontal scroll at 320/390/820, wheel offers sent with a drafted season (/api/save off).
// Screenshots: tools/tests/out/numbers_*.png (and SHOTS=dir for extra copies). Run from repo root: node tools/tests/numbers.js
const path=require('path'),fs=require('fs');const {ROOT,launch,makeDB,openSite,draftSeason,checker}=require('./_site.js');
const OUT=path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const SHOTS=process.env.SHOTS||null;if(SHOTS)fs.mkdirSync(SHOTS,{recursive:true});
const T=checker('твої цифри');
const E=require(path.join(ROOT,'lib','engine.js'));
// realistic data from the pool: 4-4-2, one player per slot by main position
function numbers(){
  const slots=E.FORMATIONS['4-4-2'].slots,used=new Set(),ids=[],pl={};
  for(const sl of slots){let got=null;for(const c of E.DATA.clubs){for(const p of c.pl)if(p[6]===sl&&!used.has(p[5])&&p[2]>=80){got={p,c};break;}if(got)break;}
    used.add(got.p[5]);ids.push(got.p[5]);pl[got.p[5]]={n:got.p[0],k:20+ids.length*3,g:ids.length*7,r0:got.p[2],slot:sl,c:got.c.n,ka:15+ids.length*3,wa:300+ids.length*40};}
  pl[ids[5]].r0=78;
  const alt=E.DATA.clubs[5].pl.find(p=>p[6]==='GK'&&!used.has(p[5]));pl[alt[5]]={n:alt[0],k:12,g:0,r0:alt[2],slot:'GK',c:E.DATA.clubs[5].n,ka:10,wa:200};
  const xi=ids.map((id,i)=>({i,id,k:20+i*3}));xi.push({i:1,id:ids[0],k:90},{i:0,id:alt[5],k:10});   // ids[0] is most frequent at slot 1: greedy keeps every player once
  const names=[...new Set(E.DATA.clubs.flatMap(c=>c.pl.map(p=>p[0])))];const clubs=[...new Set(E.DATA.clubs.map(c=>c.n))].slice(0,38);
  return {n:140,na:128,w:2400,d:700,l:740,pts:7900,gf:7100,best:89,fm:{f:'4-4-2',k:85},xi,pl,top:{g:ids[10],k:ids[2],dog:ids[5]},uniq:640,once:326,once_n:names.slice(0,300),
    xin:1540,avg:82.4,dog:400,rn:1540,cl_n:clubs.length,cl:clubs.map((c,i)=>({c,k:Math.max(4,Math.round(480/(i+1)))})),
    modes:[{b:'classic',k:98,pts:5940},{b:'daily',k:22,pts:2120},{b:'anti',k:12,pts:610},{b:'derby',k:8,pts:330}],off_n:0,rej:null,_ids:ids,_alt:alt[5]};}
const FULL=numbers();
let NUMS=FULL,CALLS=0,SEASONS=140;
const prof=p=>p&&({public_id:p.public_id,name:p.name||p.anon_name,anon:!p.name,since:'2026-09-02T10:00:00Z',seasons:p.id==='p-v'?2:SEASONS,champions:3,perfect:0,best_classic:89,win_pct:62,best:{},worst:{},
  fav_club:{c:'Чорноморець (Одеса)',k:30,pct:27},fav_player:{id:'x',n:'Іван Гецко',k:11},trophies:[],streak_best:0,streak_now:0});
const players=[{id:'p-v',name:'vitia',anon_name:'brave_fox',public_id:'vitya234'},{id:'p-me',name:null,anon_name:'silent_owl',public_id:'meplaaaa'}];
const rpc={player_hello:()=>({id:'p-me',name:null,anon_name:'silent_owl',public_id:'meplaaaa'}),trophy_stats:()=>({players:50,t:{}}),
  player_profile:a=>prof(players.find(p=>p.id===a.p_player)),player_profile_pub:a=>prof(players.find(p=>p.public_id===a.p_public)),
  player_numbers:a=>{CALLS++;if(!a.p_device||!a.p_secret)return {status:400,body:'{}'};return NUMS==='err'?{status:404,body:JSON.stringify({code:'PGRST202'})}:NUMS;}};
const db=makeDB({seasons:{auto:'id'},season_seeds:{auto:'id'},daily_results:{auto:'id'},player_links:{}},rpc);db.DB.players=players;
const INIT=`try{localStorage.setItem('upl30_news_seen','"9.99"');}catch(e){}`;
const openOwn=async(o={})=>{const A=await openSite({b:o.b,db,init:INIT+`;localStorage.setItem('upl30_theme','${o.scheme||'dark'}');`,viewport:o.viewport||{width:390,height:844},colorScheme:o.scheme||'dark',wait:1200,query:o.query});
  if(!o.query){await A.pg.click('#acctBtn');await A.pg.waitForTimeout(900);}return A;};
const shot=async(loc,name)=>{const f=path.join(OUT,'numbers_'+name+'.png');await loc.page().addStyleTag({content:'header.top{position:static!important}'});await loc.screenshot({path:f});if(SHOTS)fs.copyFileSync(f,path.join(SHOTS,name+'.png'));};
const noHScroll=pg=>pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
(async()=>{
 const b=await launch();
 // ===== 1. full section, 390 dark
 {const A=await openOwn({b});const pg=A.pg;
  T.check(!!(await pg.$('#nmSec'))&&/влаштовуєш перегляд: 51%/.test(await pg.textContent('#nmSec .nm-verdict')),'5+ сезонів: розділ «Твої цифри», вивід першим реченням');
  const heads=await pg.$$eval('#nmSec h3',hs=>hs.map(h=>h.textContent));
  T.check(['Твій рекорд','Твоя 11-ка','Ключові гравці','Один сезон і більше ніколи','Очки й клуби'].every(h=>heads.includes(h))&&!heads.includes('Відхилені'),'блоки: '+heads.join(' · '));
  T.check(!(await pg.$('.pp-fav')),'старий блок «Улюблений клуб / Найчастіший гравець» прибрано при 5+ сезонах');
  T.check(/63%/.test(await pg.textContent('.nm-rec-top'))&&/61,7/.test(await pg.textContent('.nm-stats')),'рекорд: % перемог і очки за сезон (без антисезону)');
  // XI: the game's chips and pitch proportions
  const xi=await pg.$$eval('#nmPitch .slot.filled',s=>s.map(x=>({disc:!!x.querySelector('.disc .pos'),pill:(x.querySelector('.pill')||{}).textContent,nm:(x.querySelector('.nm')||{}).textContent})));
  T.check(xi.length===11&&xi.every(x=>x.disc&&x.pill&&x.nm)&&new Set(xi.map(x=>x.nm)).size===11,'11-ка: 11 кружків гри (позиція, число сезонів, прізвище), кожен гравець один раз');
  const ratio=await pg.$eval('#nmPitch',e=>{const r=e.getBoundingClientRect();return r.width/r.height;});
  const gameRatio=await pg.evaluate(()=>{const e=document.getElementById('pitch');e.closest('section').hidden=false;const r=e.getBoundingClientRect();const v=r.width/r.height;e.closest('section').hidden=true;return v;});
  T.check(Math.abs(ratio-68/105)<0.01&&Math.abs(ratio-gameRatio)<0.01,`поле тих самих пропорцій, що в грі: ${ratio.toFixed(3)} / ${gameRatio.toFixed(3)}`);
  T.check(await pg.$eval('#nmPitch',e=>e.classList.contains('pitch')&&!!e.querySelector('svg.mk')),'поле — той самий компонент .pitch з розміткою гри');
  T.check(!(await pg.$('#nmCard .nm-pc')),'без тапу картки гравця немає');
  await shot(pg.locator('#nmSec'),'phone_dark');
  // tap: open, switch, close
  const slot=i=>pg.locator(`#nmPitch [data-nm="${i}"] .disc`);
  await slot(10).click();await pg.waitForTimeout(150);
  const c1=await pg.textContent('#nmCard');
  T.check((await pg.$$('#nmCard .nm-pc')).length===1&&/сезон/.test(c1)&&/за тебе/.test(c1)&&/Перемог з ним \d+%, без нього \d+%/.test(c1),'тап по гравцю — картка під полем: сезони, голи, частка, перемоги з ним і без нього');
  T.check(await pg.$eval('#nmPitch [data-nm="10"]',e=>e.classList.contains('moving')&&e.getAttribute('aria-pressed')==='true'),'вибраний кружок підсвічено (як у грі), aria-pressed');
  await shot(pg.locator('#nmPitch'),'phone_dark_xi');
  await shot(pg.locator('#nmCard'),'phone_dark_card');
  await slot(2).click();await pg.waitForTimeout(150);
  T.check((await pg.$$('#nmCard .nm-pc')).length===1&&(await pg.textContent('#nmCard'))!==c1&&await pg.$$eval('#nmPitch [aria-pressed="true"]',e=>e.length)===1,'тап по іншому — одна картка, інший гравець');
  await slot(2).click();await pg.waitForTimeout(150);
  T.check(!(await pg.$('#nmCard .nm-pc'))&&await pg.$$eval('#nmPitch [aria-pressed="true"]',e=>e.length)===0,'повторний тап закриває картку');
  await pg.focus('#nmPitch [data-nm="3"]');await pg.keyboard.press('Enter');await pg.waitForTimeout(100);
  T.check(!!(await pg.$('#nmCard .nm-pc')),'клавіатура: Enter відкриває картку');await pg.keyboard.press('Escape');await pg.waitForTimeout(100);
  T.check(!(await pg.$('#nmCard .nm-pc')),'Escape закриває');
  // key players, once, clubs
  const rows=await pg.$$eval('#nmSec .nm-row .k',e=>e.map(x=>x.textContent));
  T.check(rows.join()==='Бомбардир,Найчастіший,Твій андердог','ключові гравці: '+rows.join(', '));
  T.check(await pg.$$eval('#nmSec .nm-chips .chip',e=>e.length)===8&&/Показати всіх 326/.test(await pg.textContent('#nmAll')),'«Один сезон…»: 8 імен і «Показати всіх 326»');
  await pg.click('#nmAll');await pg.waitForTimeout(100);
  T.check(await pg.$$eval('#nmSec .nm-chips .chip',e=>e.length)===300&&/і ще 26/.test(await pg.textContent('#nmSec .nm-once ~ .nm-note')),'розгорнуто: 300 імен і «і ще 26»');
  T.check(/Класика/.test(await pg.textContent('#nmSec .nm-bars'))&&!/Вибір сезону/.test(await pg.textContent('#nmSec')),'очки за режимами — лише режими з даних (без прихованого вибору сезону)');
  T.check(await pg.$$eval('#nmSec .nm-fold .nm-bar',e=>e.length)>0&&/Ще 33 клуби/.test(await pg.textContent('#nmSec .nm-fold summary')),'клуби: топ-5 і «Ще 33 клуби»');
  T.check(await noHScroll(pg),'390: без горизонтальної прокрутки');
  T.check(CALLS===1,'один запит player_numbers на відкриття: '+CALLS);
  // cache: reopening the page within TTL and same season count does not ask again
  await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.waitForTimeout(200);await pg.click('#acctBtn');await pg.waitForTimeout(700);
  T.check(CALLS===1&&!!(await pg.$('#nmSec .nm-verdict')),'повторне відкриття — з кешу, без нового запиту');
  T.check(await pg.evaluate(()=>{const c=JSON.parse(localStorage.getItem('upl30_nums'));return c&&c.pid==='p-me'&&c.n===140;}),'кеш upl30_nums: гравець і кількість сезонів');
  // reduced motion: card without entrance animation
  await pg.emulateMedia({reducedMotion:'reduce'});await slot(1).click();await pg.waitForTimeout(100);
  T.check(await pg.$eval('#nmCard .nm-pc',e=>getComputedStyle(e).animationName==='none'),'зменшений рух: картка без анімації появи');
  T.check(!A.errs.length,'без помилок на сторінці '+A.errs.join(' | '));await A.ctx.close();}
 // someone else's page: nothing
 {const n0=CALLS,A=await openOwn({b,query:'?u=vitya234'});const pg=A.pg;await pg.waitForTimeout(500);
  T.check((await pg.textContent('#ppName'))==='vitia'&&!(await pg.$('#ppNums'))&&!(await pg.$('#nmSec'))&&CALLS===n0&&/Чорноморець/.test(await pg.textContent('.pp-fav')),'чужа сторінка: розділу немає, запиту немає, «Улюблений клуб» лишається');
  await A.ctx.close();}
 // ===== 2. light 390, iPad 820, 320
 {const A=await openOwn({b,scheme:'light'});await shot(A.pg.locator('#nmSec'),'phone_light');T.check(!A.errs.length,'світла тема: без помилок');await A.ctx.close();}
 {const A=await openOwn({b,viewport:{width:820,height:1180}});await A.pg.locator('#nmPitch [data-nm="9"] .disc').click();await A.pg.waitForTimeout(150);
  T.check(await A.pg.$eval('.nm-two',e=>getComputedStyle(e).gridTemplateColumns.split(' ').length===2),'iPad 820: дві колонки');
  T.check(await noHScroll(A.pg),'820: без горизонтальної прокрутки');await shot(A.pg.locator('#nmSec'),'ipad_dark');await A.ctx.close();}
 {const A=await openOwn({b,viewport:{width:320,height:640}});T.check(await noHScroll(A.pg)&&!!(await A.pg.$('#nmSec')),'320: без горизонтальної прокрутки');await shot(A.pg.locator('#nmSec'),'phone320');await A.ctx.close();}
 // ===== 3. "rejected" appears only with logged offers
 NUMS={...FULL,off_n:14,rej:[{id:FULL._ids[3],k:6},{id:'w:0000-00-00:unknown',k:5}]};
 {const A=await openOwn({b});const t=await A.pg.textContent('#nmSec');
  T.check(/Відхилені/.test(t)&&/з 14 сезонів/.test(t)&&await A.pg.$$eval('#nmSec .nm-row .ic',e=>e.length)===4,'«Відхилені»: є дані — блок з іменем із пулу (невідомий id пропущено)');
  await shot(A.pg.locator('#nmSec'),'phone_dark_rejected');await A.ctx.close();}
 // ===== 4. fewer than 5 seasons: neutral line, favourite rows stay
 NUMS={n:3};SEASONS=3;
 {const A=await openOwn({b});const pg=A.pg;
  T.check(/Зіграй ще кілька сезонів/.test(await pg.textContent('#nmSec .nm-low'))&&/Поки є 3 сезони/.test(await pg.textContent('#nmSec'))&&!(await pg.$('#nmPitch')),'<5 сезонів: нейтральний рядок без висновків');
  T.check(!!(await pg.$('.pp-fav')),'<5 сезонів: «Улюблений клуб» лишається');
  await shot(pg.locator('#nmSec'),'phone_dark_few');await A.ctx.close();}
 // ===== 5. RPC missing (SQL not applied yet): no section, favourite rows stay
 NUMS='err';SEASONS=140;
 {const A=await openOwn({b});const pg=A.pg;
  T.check(!(await pg.$('#nmSec'))&&!!(await pg.$('.pp-fav'))&&!A.errs.length,'без функції в базі: розділу немає, «Улюблений клуб» на місці, без помилок');await A.ctx.close();}
 // ===== 6. drafted season sends wheel offers: 11 lists aligned with xi, each with its picked player
 {let sent=null;const A=await openSite({b,db,init:INIT,wait:1200,api:{'/api/save':async req=>{if(req.body&&req.body.kind==='season')sent=req.body;return {json:{id:1,verified:true}};},'/api/seed':async()=>({json:{seed:12345,seed_id:'s1'}})}});
  await A.pg.click('#freeOpen');await A.pg.click('#startBtn');
  await draftSeason(A.pg);await A.pg.waitForTimeout(600);
  const off=sent&&sent.off,xi=sent&&sent.row&&sent.row.xi;
  T.check(Array.isArray(off)&&off.length===11&&off.every((a,i)=>Array.isArray(a)&&a[0]===xi[i].id&&a.length<=64&&a.length>1),'зіграний сезон: off — 11 списків, перший у кожному — обраний гравець '+(off?off.map(a=>a.length).join(','):'немає'));
  T.check(!A.errs.length,'драфт: без помилок '+A.errs.join(' | '));await A.ctx.close();}
 await b.close();
 process.exit(T.done());
})().catch(e=>{console.error(e);process.exit(1);});
