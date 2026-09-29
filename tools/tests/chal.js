const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});
 const DB={challenges:[],challenge_results:[]};let errs=0;
 async function page(){const ctx=await b.newContext({viewport:{width:430,height:900}});const pg=await ctx.newPage();
  pg.on('pageerror',e=>{errs++;console.log('PAGEERROR',e.message)});
  await pg.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:'window.supabase={createClient(){return {auth:{onAuthStateChange(){},async getSession(){return {data:{session:null}}}}}}};'}));
  await pg.route('**/rest/v1/**',async r=>{const req=r.request();const u=new URL(req.url());const t=u.pathname.split('/').pop();
    if(DB[t]){if(req.method()==='POST'){DB[t].push(JSON.parse(req.postData()));return r.fulfill({status:201,body:''});}
      const f=[...u.searchParams].filter(([k,v])=>v.startsWith('eq.'));return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(DB[t].filter(x=>f.every(([k,v])=>String(x[k])===v.slice(3))))});}
    if(req.method()==='POST')return r.fulfill({status:201,contentType:'application/json',body:'[{"id":1}]'});
    return r.fulfill({status:200,contentType:'application/json',body:'[]'});});
  return pg;}
 async function draft(pg){const seen=[];for(let i=0;i<11;i++){await pg.click('#spinBtn');await pg.waitForTimeout(1750);seen.push(await pg.textContent('#reelClub .strip')+' '+await pg.textContent('#reelYear .strip'));const btn=await pg.$('.pl:not([disabled])');await btn.click();await pg.waitForTimeout(80);const pick=await pg.$('#pitch .slot.target');if(pick){await pick.click();await pg.waitForTimeout(60);}}
   await pg.click('#lockBtn');await pg.waitForSelector('#simBtn:not([hidden])');await pg.click('#simBtn');await pg.click('#skipBtn');await pg.waitForTimeout(600);return seen;}
 // A plays and creates challenge
 const A=await page();await A.goto('http://localhost:8765/preview.html');await A.waitForTimeout(500);
 await A.evaluate(()=>localStorage.setItem('upl30_nick','Андрій'));
 await A.evaluate(()=>{const s=document.getElementById('s4');if(s&&s.hidden)document.getElementById('freeOpen').click();});await A.click('#formations .opt:nth-child(3)');await A.evaluate(()=>{const s=document.getElementById('s4');if(s&&s.hidden)document.getElementById('freeOpen').click();});await A.click('#startBtn');const seenA=await draft(A);
 console.log('A result', (await A.textContent('#sumTiles .tile b')), 'chalBox visible', !(await A.$eval('#chalBox',e=>e.hidden)));
 await A.fill('#chalName','Андрій');await A.click('#chalCopyBtn');await A.waitForTimeout(400);console.log('A msg', await A.textContent('#chalMsg'));
 const id=DB.challenges[0].id;console.log('challenge row', JSON.stringify(DB.challenges[0]));
 // B opens link
 const B=await page();await B.goto('http://localhost:8765/preview.html?c='+id);await B.waitForTimeout(800);
 await B.evaluate(()=>localStorage.setItem('upl30_nick','Сергій'));
 console.log('B card', (await B.$eval('#chalCard',e=>e.hidden?'hidden':e.textContent.replace(/\s+/g,' ').trim())).slice(0,200));
 await B.click('#chalGo');console.log('B label', await B.textContent('#modeLabel'));const seenB=await draft(B);
 console.log('same wheel', JSON.stringify(seenA)===JSON.stringify(seenB), '| first spins A', seenA.slice(0,3), 'B', seenB.slice(0,3));
 console.log('B line', await B.$eval('#chalLine',e=>e.hidden?'hidden':e.textContent));
 console.log('results rows', JSON.stringify(DB.challenge_results));
 await B.click('#againBtn');await B.waitForTimeout(600);console.log('B card after', (await B.textContent('#chalCard')).replace(/\s+/g,' ').slice(0,220));
 console.log('errors',errs);await b.close();})();
