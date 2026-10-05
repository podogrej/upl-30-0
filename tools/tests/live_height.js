// During the live season replay the current-match card keeps the same height every round (phone and iPad), so the screen doesn't jump.
// Run from repo root: node tools/tests/live_height.js
const {openSite,makeDB,checker,launch}=require('./_site.js');
(async()=>{const T=checker('live_height');const b=await launch();
 for(const w of [390,1000]){const {pg,errs}=await openSite({b,db:makeDB({}),viewport:{width:w,height:900},wait:1200});
  await pg.click('#freeOpen');await pg.click('#startBtn');
  for(let i=0;i<11;i++){await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});
    await (await pg.$('.pl:not([disabled])')).click();await pg.waitForTimeout(60);const t=await pg.$('#pitch .slot.target');if(t){await t.click();await pg.waitForTimeout(40);}}
  await pg.waitForSelector('#simBtn:not([hidden])');await pg.click('#simBtn');
  const hs=new Set(),tops=new Set();for(let k=0;k<40;k++){await pg.waitForTimeout(120);const r=await pg.evaluate(()=>{const e=document.querySelector('#lvMatch .lvMatch');if(!e)return null;const b=e.getBoundingClientRect();return [Math.round(b.height),Math.round(b.top+scrollY)];});if(r){hs.add(r[0]);tops.add(r[1]);}}
  T.check(hs.size===1,`${w}px: висота картки матчу стала (${[...hs].join(', ')} px)`);
  T.check(!errs.length,`${w}px: помилок JS немає`);await pg.context().close();}
 await b.close();process.exit(T.done());})();
