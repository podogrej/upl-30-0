// Режими гри в одному браузері: живий показ сезону (тур за туром, «Швидше», «Пропустити»), дербі (лише «Динамо» і «Шахтар»),
// один клуб (вибір клубу, усі гравці з нього), антисезон (гравці з 10+ матчами), виклик дня (після офіційної спроби кнопка вимкнена).
// Тексти й картки цих сезонів перевіряє scenarios.js. Запуск з кореня: node tools/tests/modes.js
const {openPage}=require('./_page.js');const {checker}=require('./_site.js');
async function draft(pg){for(let i=0;i<11;i++){await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});const btn=await pg.$('.pl:not([disabled])');await btn.click();await pg.waitForTimeout(80);const pk=await pg.$('#pitch .slot.target');if(pk){await pk.click();await pg.waitForTimeout(60);}}
  await pg.waitForSelector('#simBtn:not([hidden])');}
async function free(pg,fi,before){await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.click('#freeOpen');await pg.click(`#formats .opt:nth-child(${fi})`);if(before)await before();await pg.click('#startBtn');}
const clubsOf=pg=>pg.evaluate(()=>[...new Set(window.__dbg.S.slots.map(s=>s.player.cc))]);
(async()=>{const T=checker('modes');const {b,pg,errs}=await openPage();
 // класика: живий показ
 await free(pg,1);await draft(pg);await pg.click('#simBtn');await pg.waitForSelector('#live:not([hidden])',{timeout:15000});await pg.waitForTimeout(2000);
 const live=await pg.evaluate(()=>({round:document.getElementById('lvRound').textContent,rec:document.getElementById('lvRec').textContent,fin:document.getElementById('final').hidden,cells:document.querySelectorAll('#lvGrid i[class]').length}));
 T.check(/^Тур \d+ \/ 30$/.test(live.round)&&/^\d+-\d+-\d+$/.test(live.rec)&&live.fin&&live.cells>=2&&live.cells<30,`живий показ: ${live.round}, ${live.rec}, ${live.cells} клітинок, підсумок схований`);
 await pg.click('#fastBtn');await pg.waitForTimeout(300);await pg.click('#skipBtn');await pg.waitForTimeout(300);
 const fin=await pg.evaluate(()=>({fin:!document.getElementById('final').hidden,live:document.getElementById('live').hidden,m:document.getElementById('matches').children.length,share:document.getElementById('shareText').value}));
 T.check(fin.fin&&fin.live,'«Пропустити»: підсумок показано, живий показ сховано');
 T.check(fin.m>=30&&/30-0 УПЛ/.test(fin.share),`підсумок: ${fin.m} рядків матчів, текст «${fin.share.split('\n')[0]}»`);
 // дербі
 await free(pg,2);await draft(pg);const dc=await clubsOf(pg);
 T.check(dc.length&&dc.every(c=>['dynamo-kyiv','shakhtar-donetsk'].includes(c)),'дербі: лише Динамо і Шахтар ('+dc.join(', ')+')');
 await pg.click('#simBtn');await pg.click('#skipBtn');T.check(/дербі/i.test(await pg.inputValue('#shareText')),'дербі: у тексті є «дербі»');
 // один клуб
 let club='';
 await free(pg,3,async()=>{T.check(await pg.$eval('#clubPickRow',e=>!e.hidden),'один клуб: видно вибір клубу');
   club=await pg.evaluate(()=>{const o=[...document.getElementById('clubPick').options];return (o.find(x=>x.value==='metalist-kharkiv')||o[1]).value;});await pg.selectOption('#clubPick',club);});
 await draft(pg);const oc=await clubsOf(pg);T.check(oc.length===1&&oc[0]===club,'один клуб: усі гравці з «'+club+'» ('+oc.join(', ')+')');
 await pg.click('#simBtn');await pg.click('#skipBtn');
 T.check(/Найкращий результат/.test(await pg.evaluate(()=>{document.getElementById('homeBtn').click();document.getElementById('freeOpen').click();return document.getElementById('bestLine').textContent;})),'один клуб: після сезону є «Найкращий результат»');
 // антисезон: лише гравці з 10+ матчами за клуб-сезон
 await free(pg,4);await draft(pg);
 const apps=await pg.evaluate(()=>window.__dbg.S.slots.map(s=>s.player.apps));T.check(apps.every(a=>a>=10),'антисезон: у всіх 10+ матчів ('+apps.join(',')+')');
 T.check(await pg.evaluate(()=>window.__dbg.S.mode)==='hardcore','антисезон: внутрішній режим «hardcore» (без рейтингів)');
 await pg.click('#simBtn');await pg.click('#skipBtn');T.check(/антисезон|0-30/i.test(await pg.inputValue('#shareText')),'антисезон: текст про антисезон');
 // виклик дня: офіційна спроба одна
 await pg.evaluate(()=>document.getElementById('homeBtn').click());T.check(!(await pg.$eval('#dailyBtn',e=>e.disabled)),'виклик дня: до гри кнопка активна');
 await pg.click('#dailyBtn');await draft(pg);await pg.click('#simBtn');await pg.click('#skipBtn');await pg.waitForTimeout(300);
 await pg.evaluate(()=>document.getElementById('homeBtn').click());const d=await pg.$eval('#dailyBtn',e=>[e.disabled,e.textContent]);
 const st=await pg.textContent('#dStatus');T.check(d[0]&&/завтра/.test(d[1])&&/^Сьогодні: \d+-\d+-\d+/.test(st),`виклик дня після гри: «${d[1].trim()}», «${st}»`);
 T.check(!errs.length,'помилок на сторінці немає '+errs.join(' | '));
 await b.close();process.exit(T.done());})();
