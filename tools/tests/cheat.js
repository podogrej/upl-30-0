const { chromium } = require('playwright');
process.env.SUPABASE_SERVICE_KEY='svc';
const DB={season_seeds:[],seasons:[],daily_results:[]};let sid=0;
const realFetch=global.fetch;
global.fetch=async(url,o={})=>{const u=new URL(url);const t=u.pathname.split('/').pop();const m=o.method||'GET';
  const f=[...u.searchParams].filter(([k,v])=>/^(eq|is)\./.test(v));
  const match=r=>f.every(([k,v])=>{const val=v.slice(v.indexOf('.')+1);if(v.startsWith('is.'))return String(r[k])===val;return String(r[k])===val;});
  const ok=j=>({ok:true,status:200,text:async()=>j==null?'':JSON.stringify(j)});
  if(m==='GET')return ok(DB[t].filter(match));
  if(m==='POST'){const b=JSON.parse(o.body);if(t==='season_seeds'){b.id='seed-'+(++sid);}DB[t].push(b);return ok([b]);}
  if(m==='PATCH'){const b=JSON.parse(o.body);DB[t].filter(match).forEach(r=>Object.assign(r,b));return ok(null);}
  return ok(null);};
const seedH=require('/home/claude/upl-dataset/game/site/api/seed.js');const verH=require('/home/claude/upl-dataset/game/site/api/verify.js');
const call=async(h,body)=>new Promise(res=>{h({method:'POST',body},{status(c){this.c=c;return this},json(j){res({c:this.c,j});}});});
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const pg=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
 let errs=0;pg.on('pageerror',e=>{errs++;console.log('PAGEERROR',e.message)});
 await pg.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:'window.supabase={createClient(){return {auth:{onAuthStateChange(){},async getSession(){return {data:{session:null}}}}}}};'}));
 await pg.route('**/api/seed',async r=>{const x=await call(seedH,JSON.parse(r.request().postData()));r.fulfill({status:x.c,contentType:'application/json',body:JSON.stringify(x.j)});});
 await pg.route('**/api/verify',async r=>{const x=await call(verH,JSON.parse(r.request().postData()));r.fulfill({status:x.c,contentType:'application/json',body:JSON.stringify(x.j)});});
 await pg.route('**/rest/v1/**',async r=>{const req=r.request();const u=req.url();
   if(u.includes('/seasons')&&req.method()==='POST'){const row=JSON.parse(req.postData());row.id=DB.seasons.length+1;row.verified=null;DB.seasons.push(row);return r.fulfill({status:201,contentType:'application/json',body:JSON.stringify([{id:row.id}])});}
   if(u.includes('/daily_results')&&req.method()==='POST'){DB.daily_results.push(JSON.parse(req.postData()));return r.fulfill({status:201,body:''});}
   if(req.method()==='POST')return r.fulfill({status:201,contentType:'application/json',body:'[]'});
   return r.fulfill({status:200,contentType:'application/json',body:'[]'});});
 await pg.goto('http://localhost:8765/preview.html');await pg.waitForTimeout(600);
 const play=async(daily)=>{await pg.click('#againBtn').catch(()=>{});await pg.waitForTimeout(200);await pg.evaluate(d=>{const home=document.getElementById('s1'),free=document.getElementById('s4');if(d){if(home.hidden)document.getElementById('homeBtn').click();}else if(free.hidden)document.getElementById('freeOpen').click();},daily);await pg.click(daily?'#dailyBtn':'#startBtn');
   for(let i=0;i<11;i++){await pg.click('#spinBtn');await pg.waitForTimeout(1750);const btn=await pg.$('.pl:not([disabled])');await btn.click();await pg.waitForTimeout(80);const pick=await pg.$('#pitch .slot.target');if(pick){await pick.click();await pg.waitForTimeout(60);}}
   await pg.click('#lockBtn');await pg.waitForSelector('#simBtn:not([hidden])');await pg.click('#simBtn');await pg.waitForTimeout(700);await pg.click('#skipBtn').catch(()=>{});await pg.waitForTimeout(900);
   return await pg.$eval('#verLine',e=>e.hidden?'(no ✓)':e.textContent);};
 console.log('free game →',await play(false),'| row',JSON.stringify({v:DB.seasons.at(-1).verified,note:DB.seasons.at(-1).verify_note}));
 console.log('daily official →',await play(true),'| seed official',DB.season_seeds.at(-1).official,'| note',DB.seasons.at(-1).verify_note);
 await pg.fill('#nick','Тест');await pg.click('#lbSend');await pg.waitForTimeout(800);
 console.log('daily table row verified:',DB.daily_results.at(-1)&&DB.daily_results.at(-1).verified);
 console.log('daily 2nd attempt blocked:',await pg.evaluate(()=>{document.getElementById('againBtn').click();document.getElementById('homeBtn').click();return document.getElementById('dailyBtn').disabled;}));
 // cheats: clone last legit free-game row and tamper
 const legit=DB.seasons.find(r=>r.verified===true&&!r.day);
 const tamper=async(name,fn)=>{const r=JSON.parse(JSON.stringify(legit));r.id=DB.seasons.length+1;r.verified=null;fn(r);DB.seasons.push(r);if(name!=='seed reused')DB.season_seeds.forEach(s=>{s.used_by=null;});const x=await call(verH,{season_id:r.id});console.log('cheat:',name.padEnd(28),'→',x.j.verified,'|',x.j.note);};
 await tamper('seed reused',r=>{});
 await tamper('rating raised to 99',r=>{r.xi[0].r=99;});
 await tamper('points inflated',r=>{r.w+=1;r.d-=1;r.pts+=2;});
 await tamper('local seed (no server seed)',r=>{r.seed_id=null;});
 await tamper('player not in that club',r=>{r.xi[1].c='Динамо (Київ)';r.xi[1].y=1992;});
 await tamper('honest copy (control)',r=>{});
 await tamper('slot swapped',r=>{const t=r.xi[0].slot;r.xi[0].slot=r.xi[10].slot;r.xi[10].slot=t;});
 console.log('errors',errs);await b.close();})();
