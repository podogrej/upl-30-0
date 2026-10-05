// 5×5 on one device: won't start without nicknames; two players alternating (A-B-A-B, taken player disappears for all, ratings hidden),
// live match to the result; three players each drafting alone: group (3 matches, table) and final. Run: node tools/tests/f5test2.js [screenshot dir]
const path=require('path'),fs=require('fs');const {ROOT,openPage}=require('./_page.js');const {checker}=require('./_site.js');
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
(async()=>{const T=checker('f5 локально');const {b,pg,errs}=await openPage({viewport:{width:430,height:900},colorScheme:'dark'});
 async function draft(){const turns=[],picked=[];let hidden=true;
   for(let g=0;g<200;g++){
     if(await pg.$('#f5Play'))break;
     const ready=await pg.$('#f5Ready');if(ready){turns.push((await pg.textContent('.f5hand .ttl')).replace('Ходить ',''));await ready.click();await pg.waitForTimeout(80);continue;}
     const btn=await pg.$('#f5Sq .pl:not([disabled])');if(!btn){console.log('немає доступного гравця');break;}
     hidden=hidden&&await pg.$$eval('#f5Sq .pl .rt',e=>e.every(x=>x.textContent===''));
     picked.push(await btn.$eval('.nm',e=>e.textContent));await btn.click();await pg.waitForTimeout(80);}
   return {turns,picked,hidden};}
 await pg.evaluate(()=>document.getElementById('f5Open').click());   /* entry button is hidden on home */await pg.click('[data-w="local"]');
 await pg.click('#f5Go');T.check(!!(await pg.$('#f5Go'))&&await pg.$eval('[data-nm="0"]',e=>e.classList.contains('bad')),'без ніку драфт не починається');
 await pg.fill('[data-nm="0"]','Андрій');await pg.fill('[data-nm="1"]','Сергій');await pg.fill('[data-tm="1"]','Динамо Двір');await pg.click('[data-fi="1"][data-fm="2-2"]');
 await pg.click('#f5Go');const d2=await draft();
 T.check(d2.turns.length===10&&d2.turns.every((t,i)=>t===(i%2?'Динамо Двір':'Андрій')),'по черзі: A-B-A-B ('+d2.turns.slice(0,4).join(' ')+' …)');
 T.check(d2.picked.length===10&&new Set(d2.picked).size===10,'по черзі: 10 різних гравців');
 T.check(d2.hidden,'під час драфту рейтинги сховані');
 const ready=await pg.evaluate(()=>[...document.querySelectorAll('.f5grid > div')].map(d=>d.textContent));
 T.check(ready.length===2&&/2-2/.test(ready[1])&&/1-2-1/.test(ready[0]),'склади зібрано: схеми 1-2-1 і 2-2');
 await pg.screenshot({path:path.join(OUT,'f5_ready.png'),fullPage:true});
 await pg.click('#f5Play');await pg.waitForTimeout(1500);T.check(!!(await pg.$('#f5Skip')),'живий матч іде');
 const t0=Date.now();await pg.waitForSelector('#f5Again',{timeout:20000});const sc=await pg.textContent('.f5score');
 T.check(/\d+:\d+/.test(sc),`матч дограв сам за ~${Math.round((Date.now()-t0+1500)/1000)} с: ${sc.replace(/\s+/g,' ')}`);
 await pg.screenshot({path:path.join(OUT,'f5_result.png'),fullPage:true});
 // three players, each drafting alone
 await pg.click('#f5New');await pg.click('[data-w="local"]');await pg.click('#f5Plus');await pg.click('[data-m="solo"]');
 for(const [i,n] of [[0,'А'],[1,'Б'],[2,'В']])await pg.fill(`[data-nm="${i}"]`,n);
 await pg.click('#f5Go');const d3=await draft();
 T.check(d3.turns.join('')==='АБВ'&&d3.picked.length===15,'кожен сам: драфт А, Б, В по 5 гравців');
 await pg.click('#f5Play');await pg.waitForSelector('#f5Skip');await pg.click('#f5Skip');await pg.waitForSelector('#f5Again',{timeout:5000});
 const r3=await pg.evaluate(()=>({rows:document.querySelector('#f5 .tbl table').rows.length,m:document.querySelectorAll('#f5 .matches .m').length,champ:document.querySelector('#f5 .tier').textContent}));
 T.check(r3.rows===4&&r3.m===3&&/чемпіон/.test(r3.champ),`троє: таблиця ${r3.rows-1} команди, ${r3.m} матчі групи, «${r3.champ.trim()}»`);
 T.check(!errs.length,'помилок на сторінці немає '+errs.join(' | '));
 await b.close();process.exit(T.done());})();
