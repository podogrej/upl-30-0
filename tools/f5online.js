const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});
 const DB={f5_rooms:[],f5_players:[],f5_picks:[]};const PK={f5_rooms:['id'],f5_players:['room_id','seat'],f5_picks:['room_id','seat','k']};
 const UQ={f5_players:[['room_id','device_id']],f5_picks:[['room_id','n']]};let errs=0;
 async function page(tag,mode){const ctx=await b.newContext({viewport:{width:430,height:900}});const pg=await ctx.newPage();
  pg.on('pageerror',e=>{errs++;console.log(tag,'PAGEERROR',e.message)});
  await pg.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:'window.supabase={createClient(){return {auth:{onAuthStateChange(){},async getSession(){return {data:{session:null}}}}}}};'}));
  await pg.route('**/rest/v1/**',async r=>{const req=r.request();const u=new URL(req.url());const t=u.pathname.split('/').pop();
    if(!DB[t])return r.fulfill({status:200,contentType:'application/json',body:'[]'});
    const f=[...u.searchParams].filter(([k,v])=>v.startsWith('eq.'));const match=x=>f.every(([k,v])=>String(x[k])===v.slice(3));
    if(req.method()==='GET'){let rows=DB[t].filter(match);const o=u.searchParams.get('order');if(o){const [c,d]=o.split('.');rows=[...rows].sort((a,b)=>(a[c]-b[c])*(d==='desc'?-1:1));}return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(rows)});}
    if(req.method()==='POST'){const row=JSON.parse(req.postData());
      const clash=[PK[t],...(UQ[t]||[])].some(keys=>DB[t].some(x=>keys.every(k=>String(x[k])===String(row[k]))));
      if(clash)return r.fulfill({status:409,contentType:'application/json',body:JSON.stringify({code:'23505',message:'duplicate key '+(UQ[t]&&UQ[t][0].includes('device_id')&&DB[t].some(x=>x.device_id===row.device_id&&x.room_id===row.room_id)?'device':'')})});
      DB[t].push({...(t==='f5_rooms'?{status:'lobby',players_n:null}:{}),...row,created_at:new Date().toISOString()});return r.fulfill({status:201,contentType:'application/json',body:JSON.stringify([row])});}
    if(req.method()==='PATCH'){const body=JSON.parse(req.postData());DB[t].filter(match).forEach(x=>Object.assign(x,body));return r.fulfill({status:204,body:''});}
    return r.fulfill({status:200,body:'[]'});});
  return pg;}
 const H=await page('host');await H.goto('http://localhost:8765/preview.html');await H.waitForTimeout(500);
 await H.click('#f5Open');await H.fill('[data-nm="0"]','Андрій');await H.click('#f5Go');await H.waitForTimeout(800);
 const id=DB.f5_rooms[0].id;console.log('room',id,'players',DB.f5_players.length);
 const G=await page('guest');await G.goto('http://localhost:8765/preview.html?r='+id);await G.waitForTimeout(1500);console.log('guest s5 hidden',await G.$eval('#s5',e=>e.hidden),(await G.$eval('#f5',e=>e.innerHTML)).slice(0,300));
 await G.fill('[data-nm="0"]','Сергій');await G.fill('[data-tm="0"]','Динамо Двір');await G.click('#f5Join');await G.waitForTimeout(2500);
 console.log('players',DB.f5_players.map(p=>p.seat+':'+p.name).join(', '));
 await H.waitForTimeout(2200);await H.screenshot({path:'on_lobby.png',fullPage:true});
 await H.click('#f5StartR');await H.waitForTimeout(500);
 // по черзі: хто ходить — той клікає
 for(let step=0;step<40&&DB.f5_picks.length<10;step++){
   for(const P of [H,G]){const btn=await P.$('#f5Sq .pl:not([disabled])');if(btn){await btn.click();await P.waitForTimeout(400);}}
   await H.waitForTimeout(2100);}
 console.log('picks',DB.f5_picks.length,'order seats',DB.f5_picks.sort((a,b)=>a.n-b.n).map(p=>p.seat).join(''),'status',DB.f5_rooms[0].status);
 await G.waitForTimeout(2500);
 for(const P of [H,G]){await P.waitForSelector('#f5Play',{timeout:8000});await P.click('#f5Play');await P.waitForSelector('#f5Skip');await P.click('#f5Skip');await P.waitForSelector('#f5Again',{timeout:5000});}
 console.log('host score',await H.textContent('.f5score'),'| guest score',await G.textContent('.f5score'));
 await G.screenshot({path:'on_result.png',fullPage:true});
 console.log('errors',errs);await b.close();})();
