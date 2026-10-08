// Game modes in one browser: live season view (round by round, skip to the end), derby (Dynamo and Shakhtar only),
// one club (club choice, all players from it), anti-season (players with 10+ apps), daily challenge (counted attempt plays a season, best kept).
// Texts and cards of these seasons are covered by scenarios.js. Run from repo root: node tools/tests/modes.js
const {openPage,pickFmt,playSeason}=require('./_page.js');const {checker}=require('./_site.js');
async function draft(pg,n=11){for(let i=0;i<n;i++){await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});const btn=await pg.$('.pl:not([disabled])');await btn.click();await pg.waitForTimeout(80);const pk=await pg.$('#pitch .slot.target');if(pk){await pk.click();await pg.waitForTimeout(60);}}
  await pg.waitForSelector('#simBtn:not([hidden])');}
async function free(pg,fi,before){await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.click('#freeOpen');await pickFmt(pg,['','classic','derby','oneclub','anti','legends'][fi]);if(before)await before();await pg.click('#startBtn');}
const clubsOf=pg=>pg.evaluate(()=>[...new Set(window.__dbg.S.slots.map(s=>s.player.cc))]);
(async()=>{const T=checker('modes');const {b,pg,errs}=await openPage();
 // modes: classic, season pick and anti-season only; classic and daily opponents are the Legends League, anti-season faces cult clubs
 await pg.click('#freeOpen');
 T.check(await pg.evaluate(()=>!document.getElementById('formats')&&document.getElementById('setTitle').textContent==='Класика'),'налаштування: плиток режимів немає, заголовок — «Класика» (режим обрано на головній)');
 T.check(await pg.evaluate(()=>{const D=window.__dbg,o=[];for(const f of ['classic','anti']){D.setFmt(f);o.push(D.oppYear());}D.setFmt('classic');return o.join()===D.LEAGUE_LEGENDS+','+D.LEAGUE_CULT&&D.chalNewGame(5).year===D.LEAGUE_LEGENDS;}),'суперники: класика (і виклик дня), виклик другу — легенди, антисезон — культові');
 // classic: live view
 await free(pg,1);await draft(pg);await pg.click('#simBtn');await pg.waitForSelector('#live:not([hidden])',{timeout:15000});await pg.waitForTimeout(2000);
 const live=await pg.evaluate(()=>({round:document.getElementById('lvRound').textContent,rec:document.getElementById('lvRec').textContent,fin:document.getElementById('final').hidden,cells:document.querySelectorAll('#lvGrid i[class]').length}));
 T.check(/^Тур \d+ \/ 30$/.test(live.round)&&/^\d+-\d+-\d+$/.test(live.rec)&&live.fin&&live.cells>=2&&live.cells<30,`живий показ: ${live.round}, ${live.rec}, ${live.cells} клітинок, підсумок схований`);
 await pg.click('#skipBtn');await pg.waitForTimeout(300);
 const fin=await pg.evaluate(()=>({fin:!document.getElementById('final').hidden,live:document.getElementById('live').hidden,m:document.getElementById('matches').children.length,share:document.getElementById('shareText').value}));
 T.check(fin.fin&&fin.live,'«Пропустити»: підсумок показано, живий показ сховано');
 T.check(fin.m>=30&&/30-0 УПЛ/.test(fin.share),`підсумок: ${fin.m} рядків матчів, текст «${fin.share.split('\n')[0]}»`);
 // derby
 await free(pg,2);await draft(pg);const dc=await clubsOf(pg);
 T.check(dc.length&&dc.every(c=>['dynamo-kyiv','shakhtar-donetsk'].includes(c)),'дербі: лише Динамо і Шахтар ('+dc.join(', ')+')');
 await pg.click('#simBtn');await pg.click('#skipBtn');T.check(/дербі/i.test(await pg.inputValue('#shareText')),'дербі: у тексті є «дербі»');
 // one club
 let club='';
 await free(pg,3,async()=>{T.check((await pg.$$('#ocGrid .oct')).length===51,'один клуб: сторінка з 51 клубом');
   club='karpaty-lviv';T.check(await pg.$eval('#ocCard',e=>!e.hidden&&/Карпати/.test(e.textContent))&&await pg.$eval('#fmtBox',e=>e.hidden),'один клуб: картка клубу замість режимів');});
 // One Club: the club reel stays fixed, the season reel spins only that club's seasons
 {const r=await pg.evaluate(()=>{document.getElementById('spinBtn').click();const D=window.__dbg,c=D.S.club,ys=new Set(D.DATA.clubs.filter(x=>x.c===c).map(x=>D.seasonLabel(x.y)));
   const cl=[...document.querySelectorAll('#reelClub .strip>div')].map(e=>e.textContent),se=[...document.querySelectorAll('#reelYear .strip>div')].map(e=>e.textContent);
   return {cl:cl.length,se:se.length,bad:se.filter(t=>!ys.has(t))};});
  T.check(r.cl===1&&!r.bad.length,`один клуб: барабан клубу не крутиться (${r.cl}), сезони лише цього клубу (${r.se} на барабані${r.bad.length?', чужі: '+r.bad.join(', '):''})`);
  await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});const btn=await pg.$('.pl:not([disabled])');await btn.click();await pg.waitForTimeout(80);const pk=await pg.$('#pitch .slot.target');if(pk){await pk.click();await pg.waitForTimeout(60);}}
 await draft(pg,10);const oc=await clubsOf(pg);T.check(oc.length===1&&oc[0]===club,'один клуб: усі гравці з «'+club+'» ('+oc.join(', ')+')');
 await pg.click('#simBtn');await pg.click('#skipBtn');
 T.check(/Найкращий результат/.test(await pg.evaluate(()=>{document.getElementById('homeBtn').click();document.getElementById('freeOpen').click();return document.getElementById('bestLine').textContent;})),'один клуб: після сезону є «Найкращий результат»');
 // anti-season: only players with 10+ apps for the club-season
 await free(pg,4);await draft(pg);
 const apps=await pg.evaluate(()=>window.__dbg.S.slots.map(s=>s.player.apps));T.check(apps.every(a=>a>=10),'антисезон: у всіх 10+ матчів ('+apps.join(',')+')');
 T.check(await pg.evaluate(()=>window.__dbg.S.mode)==='hardcore','антисезон: внутрішній режим «hardcore» (без рейтингів)');
 await pg.click('#simBtn');await pg.click('#skipBtn');T.check(/антисезон|0-30/i.test(await pg.inputValue('#shareText')),'антисезон: текст про антисезон');
 // daily challenge: the condition met -> the season plays (classic, normal), the attempt and its score are kept
 await playSeason(pg,'vd',0,0);
 const vd=await pg.evaluate(()=>{const S=window.__dbg.S;return {m:S.mode,f:S.format,sc:S.result.vd&&S.result.vd.score,st:JSON.parse(localStorage.getItem('upl30_vd_2026-10-12')||'{}')};});
 T.check(vd.m==='normal'&&vd.f==='classic'&&vd.sc>=1&&vd.st.used===1&&vd.st.best===vd.sc,`виклик дня: сезон — класика «Звичайний», спроба 1 з 5, рахунок ${vd.sc}/11 збережено`);
 T.check(!errs.length,'помилок на сторінці немає '+errs.join(' | '));
 await b.close();process.exit(T.done());})();
