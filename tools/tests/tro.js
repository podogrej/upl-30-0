const { chromium } = require('playwright');
(async () => { const b = await chromium.launch({args:['--no-sandbox']});
 const pg = await (await b.newContext({viewport:{width:430,height:900}})).newPage();
 let errs=0; pg.on('pageerror', e => {errs++; console.log('PAGEERROR', e.message);});
 const posted=[];
 await pg.route('**/rest/v1/**', async (route) => { const req=route.request(); const u=req.url();
   if(u.includes('rpc/trophy_stats')) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({players:40,t:{champ:12,top3:25,perfect:0}})});
   if(u.includes('rpc/')) return route.fulfill({status:200,contentType:'application/json',body:'{}'});
   if(u.includes('/trophies')){posted.push(req.postData());return route.fulfill({status:201,body:''});}
   if(u.includes('/seasons')&&req.method()==='GET'&&u.includes('device_id=eq')){ // retro: one old season
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:1,mode:'normal',format:'classic',w:24,d:6,l:0,pts:78,place:1,gf:70,ga:12,xp:66,golden:false,practice:false,day:null,created_at:'2026-09-28T10:00:00Z',
       xi:[{n:'Сергій Ребров',id:'x1',slot:'ST',r:95,c:'Динамо (Київ)',y:1997,f:2,g:26,a:5,rt:7.9},{n:'Андрій Шевченко',id:'x2',slot:'ST',r:96,c:'Динамо (Київ)',y:1997,f:1,g:20,a:6,rt:7.7}]}])}); }
   if(req.method()==='POST') return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify([{id:9}])});
   return route.fulfill({status:200,contentType:'application/json',body:'[]'}); });
 await pg.goto('file://' + process.cwd() + '/preview.html'); await pg.waitForTimeout(900);
 console.log('btn after retro', await pg.textContent('#trBtn'), '| synced', posted.length, (posted[0]||'').slice(0,160));
 for(let k=0;k<2;k++){
  await pg.evaluate(()=>{const s=document.getElementById('s4');if(s&&s.hidden)document.getElementById('freeOpen').click();});await pg.click('#startBtn');
  for (let i=0;i<11;i++){ await pg.click('#spinBtn'); await pg.waitForTimeout(1750); const btn = await pg.$('.pl:not([disabled])'); await btn.click(); await pg.waitForTimeout(80); const pick=await pg.$('#pitch .slot.target'); if(pick){await pick.click(); await pg.waitForTimeout(60);} }
  await pg.click('#lockBtn');await pg.waitForSelector('#simBtn:not([hidden])');await pg.click('#simBtn'); await pg.click('#skipBtn'); await pg.waitForTimeout(1200);
  console.log('season',k,'|', (await pg.textContent('#tier')), '| newTro', await pg.$eval('#newTro',e=>e.hidden?'hidden':e.textContent.replace(/\s+/g,' ').slice(0,200)));
  console.log('share tail', (await pg.inputValue('#shareText')).split('\n').slice(-1)[0]);
  if(k===0) await pg.screenshot({path:'s_tro_result.png'});
  await pg.click('#againBtn');
 }
 await pg.evaluate(()=>{const s=document.getElementById('s1');if(s&&s.hidden)document.getElementById('homeBtn').click();});await pg.click('#trBtn'); await pg.waitForTimeout(500);
 console.log('cabinet', (await pg.textContent('#viewBody')).replace(/\s+/g,' ').slice(0,300));
 await pg.screenshot({path:'s_cab.png',fullPage:false});
 console.log('errors', errs); await b.close(); })();
