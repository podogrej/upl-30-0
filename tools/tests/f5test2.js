const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const pg=await (await b.newContext({viewport:{width:430,height:900},deviceScaleFactor:2,colorScheme:'dark'})).newPage();
 let errs=0;pg.on('pageerror',e=>{errs++;console.log('PAGEERROR',e.message)});
 await pg.goto(`file://${process.cwd()}/preview.html`);await pg.waitForTimeout(400);
 async function draft(tag){let guard=0,seq=[];
   while(guard++<120){
     if(await pg.$('#f5Play'))break;
     const ready=await pg.$('#f5Ready');if(ready){seq.push((await pg.textContent('.f5hand .ttl')).replace('Ходить ',''));await ready.click();await pg.waitForTimeout(120);continue;}
     const btn=await pg.$('#f5Sq .pl:not([disabled])');if(!btn){console.log('no player',tag);break;}
     await btn.click();await pg.waitForTimeout(100);}
   console.log(tag,'turn order:',seq.slice(0,8).join(' '));}
 await pg.click('#f5Open');await pg.click('[data-w="local"]');
 // перевірка: без ніку не стартує
 await pg.click('#f5Go');console.log('blocked without nick:',!!(await pg.$('#f5Go')));
 for(const [i,n] of [[0,'Андрій'],[1,'Сергій']])await pg.fill(`[data-nm="${i}"]`,n);
 await pg.fill('[data-tm="1"]','Динамо Двір');await pg.click('[data-fi="1"][data-fm="2-2"]');
 await pg.click('#f5Go');await draft('2turns');
 await pg.screenshot({path:'f5b_ready.png',fullPage:true});
 await pg.click('#f5Play');await pg.waitForTimeout(1500);await pg.screenshot({path:'f5b_live.png'});
 const t0=Date.now();await pg.waitForSelector('#f5Again',{timeout:20000});console.log('live took ~',Date.now()-t0+1500,'ms; score',await pg.textContent('.f5score'));
 await pg.screenshot({path:'f5b_result.png',fullPage:true});
 // 3 гравці, кожен сам
 await pg.click('#f5New');await pg.click('[data-w="local"]');await pg.click('#f5Plus');await pg.click('[data-m="solo"]');
 for(const [i,n] of [[0,'А'],[1,'Б'],[2,'В']])await pg.fill(`[data-nm="${i}"]`,n);
 await pg.click('#f5Go');await draft('3solo');await pg.click('#f5Play');await pg.waitForSelector('#f5Skip');await pg.click('#f5Skip');await pg.waitForSelector('#f5Again',{timeout:5000});
 console.log('3p final',await pg.textContent('.f5score'),'| table rows',await pg.$$eval('.tbl tr',r=>r.length));
 console.log('errors',errs);await b.close();})();
