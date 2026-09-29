const { chromium } = require('playwright');
(async()=>{const b = await chromium.launch({args:['--no-sandbox']});
 const pg = await (await b.newContext({viewport:{width:430,height:900}})).newPage();
 let errs=0; pg.on('pageerror', e => {errs++; console.log('PAGEERROR', e.message);});
 const posts=[];
 await pg.route('https://cdn.jsdelivr.net/**', r=>r.fulfill({contentType:'application/javascript',body:`window.supabase={createClient(){let cb;return {auth:{onAuthStateChange(f){cb=f},async getSession(){return {data:{session:null}}},async verifyOtp(){setTimeout(()=>cb('SIGNED_IN',{access_token:'AT',user:{id:'u1',email:'tg-1@users.upl-30-0.vercel.app',user_metadata:{full_name:'Андрій'},app_metadata:{}}}),20);return {error:null}}}}}};`}));
 await pg.route('https://telegram.org/js/telegram-web-app.js', r => r.fulfill({contentType:'application/javascript', body:`window.Telegram={WebApp:{initData:'user=x&hash=abc',initDataUnsafe:{user:{id:1,first_name:'Андрій'},start_param:'g-100555'},colorScheme:'dark',ready(){},expand(){},openTelegramLink(){}}};`}));
 await pg.route('**/api/auth', r=>r.fulfill({status:200,contentType:'application/json',body:'{"token_hash":"TH"}'}));
 let today=[{name:'Сергій',w:20,d:5,l:5,pts:65,gf:60,ga:30}];
 await pg.route('**/api/league**', r=>{const req=r.request();if(req.method()==='POST'){posts.push(req.postData());const j=JSON.parse(req.postData());if(j.result)today.unshift({name:'Андрій',...j.result});return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,joined:[],posted:j.result?['Футбол по середах']:[]})});}
   return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({title:'Футбол по середах',day:'2026-09-28',today,members:3,standings:[{name:'Сергій',wins:2},{name:'Андрій',wins:1}]})});});
 await pg.route('**/rest/v1/**', r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
 await pg.goto('http://localhost:8765/preview.html#tgWebAppData=x'); await pg.waitForTimeout(1200);
 console.log('card', await pg.$eval('#leagueCard',e=>e.hidden?'hidden':e.textContent.replace(/\s+/g,' ').trim().slice(0,200)));
 await pg.screenshot({path:'s_league.png'});
 await pg.click('#leagueGo');
 for (let i=0;i<11;i++){ await pg.click('#spinBtn'); await pg.waitForTimeout(1750); const btn = await pg.$('.pl:not([disabled])'); await btn.click(); await pg.waitForTimeout(80); const pick=await pg.$('#pitch .slot.target'); if(pick){await pick.click(); await pg.waitForTimeout(60);} }
 await pg.click('#lockBtn');await pg.waitForSelector('#simBtn:not([hidden])');await pg.click('#simBtn'); await pg.click('#skipBtn'); await pg.waitForTimeout(2200);
 console.log('leagueMsg', await pg.$eval('#leagueMsg',e=>e.hidden?'hidden':e.textContent));
 console.log('posts', posts.map(p=>p.slice(0,40)+' … '+(JSON.parse(p).result?JSON.stringify(JSON.parse(p).result).slice(0,160):'join')));
 await pg.click('#againBtn'); await pg.waitForTimeout(400);
 console.log('card after', await pg.$eval('#leagueCard',e=>e.textContent.replace(/\s+/g,' ').trim().slice(0,220)));
 console.log('google btn?', await pg.evaluate(()=>typeof AUTH_GOOGLE));
 console.log('errors',errs);await b.close();})();
