// 0.68 (власник 02.10, варіант C): «‹ Назад» + домик; свайп/кнопка браузера ведуть на попередній екран;
// з початого драфту — підтвердження «Вийти? Склад не збережеться». Запуск з кореня: node tools/tests/nav_back.js
const {launch,ROOT}=require('./_page.js');const path=require('path');const {checker}=require('./_site.js');
async function pickOne(pg){await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});await (await pg.$('#squad .pl:not([disabled])')).click();await (await pg.waitForSelector('#squad .plpos button')).click();await pg.waitForTimeout(40);}
(async()=>{const T=checker('nav_back');const b=await launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await ctx.route(u=>!(u.href.startsWith('file:')||/fonts\.(googleapis|gstatic)\.com/.test(u.host)),r=>r.abort());
  const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  let ans=false;const asked=[];pg.on('dialog',d=>{asked.push(d.message());ans?d.accept():d.dismiss();});
  const sec=()=>pg.evaluate(()=>[1,2,3,4,5,6,7].find(i=>!document.getElementById('s'+i).hidden));
  const wait=()=>pg.waitForTimeout(300);
  await pg.goto('file://'+path.join(ROOT,'index.html'));await pg.waitForTimeout(800);
  T.check(await pg.$eval('#backBtn',e=>e.hidden),'головна: «Назад» сховано, «Головна» з текстом');
  await pg.click('#freeOpen');await wait();
  T.check(await sec()===4&&await pg.$eval('#backBtn',e=>!e.hidden)&&await pg.$eval('#homeBtn .hl',e=>getComputedStyle(e).display==='none'),'режими: «‹ Назад» + лише домик');
  await pg.click('#backBtn');await wait();T.check(await sec()===1,'«Назад» з режимів → головна');
  await pg.click('#freeOpen');await pg.click('#startBtn');await wait();
  await pg.goBack();await wait();T.check(await sec()===4&&!asked.length,'порожній драфт: браузерне «назад» → режими без питання');
  await pg.click('#startBtn');for(let i=0;i<2;i++)await pickOne(pg);
  await pg.click('#backBtn');await wait();T.check(await sec()===2&&asked.length===1&&/Склад не збережеться/.test(asked[0]),'початий драфт: «Назад» питає, «Скасувати» — лишаємось');
  await pg.goBack();await wait();T.check(await sec()===2&&asked.length===2,'початий драфт: свайп/браузерне «назад» теж питає');
  await pg.click('#homeBtn');await wait();T.check(await sec()===2&&asked.length===3,'початий драфт: домик теж питає');
  ans=true;await pg.click('#backBtn');await wait();T.check(await sec()===4,'підтвердив — вийшли до режимів');
  await pg.click('#homeBtn');await wait();T.check(await sec()===1,'домик → головна');
  T.check(!errs.length,'без помилок JS'+(errs.length?': '+errs.slice(0,3).join('; '):''));
  await b.close();process.exit(T.done());})();
