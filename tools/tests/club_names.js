// Club names a player sees are short (shortTeam / clubShort): no full data name with a city in brackets ("Dnipro (Dnipropetrovsk)", DATA.clubs[].n) on any screen.
// Browser: pool limited to clubs whose data name has brackets (every wheel spin shows one); stub DB rows carry full names (saved XI and table,
// favourite club, best XI club, "your numbers"). Walks home, tables (all, one club), own and other player page, one club (list, card, draft, live, result),
// classic and derby (draft, forecast, live, result, share text), daily challenge, 5x5 on one device, 5x5 friend league draft, saved season ?s=.
// Checks visible text with every <details> opened, visible field values, pitch labels and the share text. Server: result-link preview (api/r.js),
// and the Telegram/preview builders in api/ do not read club names (if they start to, they need a short-name helper in lib/ and a check here).
// Run from repo root: node tools/tests/club_names.js
const path=require('path'),fs=require('fs');const {ROOT,launch,makeDB,openSite,checker}=require('./_site.js');
const E=require(path.join(ROOT,'lib','engine.js'));
const T=checker('короткі назви клубів');
const FULL=[...new Set(E.DATA.clubs.map(c=>c.n).filter(n=>/ \([^)]+\)/.test(n)))];
const leaks=t=>FULL.filter(n=>String(t).includes(n));
const DEV='aaaaaaaa-0000-4000-a000-000000000001';
// pool limited to bracketed clubs: assigned by pool.*.js before the game script reads it
const POOL_INIT=`Object.defineProperty(window,'__POOL',{configurable:true,set(v){v.clubs=v.clubs.filter(c=>/ \\(/.test(c.n));Object.defineProperty(window,'__POOL',{value:v,writable:true,configurable:true});},get(){return undefined;}});`;
const INIT=`${POOL_INIT}localStorage.setItem('upl30_device','"${DEV}"');localStorage.setItem('upl30_dsecret','"${'5'.repeat(48)}"');localStorage.setItem('upl30_news_seen','"9.99"');`;

// ---------- stub DB
function mkDB(){
  const players=[{id:'p-me',name:'andrii',anon_name:'silent_owl',public_id:'meplaaaa'},{id:'p-v',name:'vitia',anon_name:'brave_fox',public_id:'vitya234'}];
  const js=p=>({id:p.id,name:p.name,anon_name:p.anon_name,public_id:p.public_id,name_next:null,contact_email:null,news_optin:false});
  const xiRow=(slot,c)=>({slot,c,y:2015});
  const prof=p=>p&&({public_id:p.public_id,name:p.name,anon:false,since:'2026-09-02T10:00:00Z',seasons:p.id==='p-me'?140:12,champions:3,perfect:0,best_classic:89,win_pct:62,
    best:{classic:{place:1,w:25,d:3,l:2,formation:'4-4-2',avg:85.1},oneclub:{place:3,w:20,d:5,l:5,formation:'4-3-3',avg:80.2,club:'karpaty-lviv'}},
    worst:{oneclub:{place:16,w:2,d:5,l:23,formation:'3-5-2',avg:71.4,club:'metalurh-donetsk'}},
    fav_club:{c:'Дніпро (Дніпропетровськ)',k:30,pct:27},fav_player:{id:'x',n:'Іван Гецко',k:11},trophies:[],streak_best:2,streak_now:1,xi:[xiRow('ST','Металург (Запоріжжя)')]});
  // fl5 leagues (as tools/tests/fl63.js): enough to create one and open its draft
  const leagues=[],members=[];
  const fget=id=>{const L=leagues.find(x=>x.id===id);return L&&{...L,now:new Date().toISOString(),over:false,owner:'meplaaaa',tour:[],board:[{u:'meplaaaa',name:'andrii',total:0,wins:0,best:null,played:0}],fives:[]};};
  const rpc={player_hello:()=>js(players[0]),device_ok:()=>'p-me',link_account:()=>({...js(players[0]),merge_offer:null}),trophy_stats:()=>({players:50,t:{}}),
    player_profile:a=>prof(players.find(p=>p.id===a.p_player)||players[0]),player_profile_pub:a=>prof(players.find(p=>p.public_id===a.p_public)),player_numbers:()=>numbers(),
    fl_mine:()=>leagues.map(L=>({id:L.id,name:L.name,fmt:L.fmt,days:1,tries:1,deadline:L.deadline,over:false,members:1,fives:0,my_five:false,tries_today:0,place:null})),
    fl_create5:a=>{const id='fivaaa';leagues.push({id,name:a.p_name,fmt:'5',start_day:'2026-10-01',days:1,tries:1,take:'best',scoring:'place',rerolls:a.p_rerolls,ratings:a.p_ratings,era:a.p_era,deadline:new Date(Date.now()+3600e3).toISOString(),result:null});members.push({l:id,p:'p-me'});return fget(id);},
    fl_get:a=>fget(a.p_id)};
  const db=makeDB({seasons:{auto:'id'},season_seeds:{auto:'id'},daily_results:{auto:'id'},player_links:{},user_state:{},trophies:{pk:['device_id','trophy']}},rpc);db.DB.players=players;
  // board rows and one saved season (?s=105): XI and table with full data names
  const tbl=FULL.slice(0,15).map((n,i)=>({n,w:20-i,d:5,l:5+i,gf:50-i,ga:20+i,pts:65-3*i,me:false}));tbl.splice(3,0,{n:'Твоя 11-ка',w:18,d:6,l:6,gf:55,ga:30,pts:60,me:true});
  const xi=E.FORMATIONS['4-4-2'].slots.map((slot,i)=>({n:'Гравець '+(i+1),id:'x'+i,slot,r:85,r0:85,c:FULL[i%FULL.length],y:2015,f:1,g:i,a:1,rt:7.1}));
  for(let i=0;i<12;i++){const oc=i%2===1,w=26-i,d=Math.min(4,30-w),l=30-w-d;
    db.DB.seasons.push({id:100+i,device_id:'dev-'+i,player_id:i%2?'p-v':'p-me',nickname:null,competition:'upl',mode:'normal',format:oc?'oneclub':'classic',club:oc?['karpaty-lviv','metalurh-donetsk','dnipro'][i%3]:null,
      formation:'4-4-2',w,d,l,pts:w*3+d,place:1,gf:80-i,ga:12+i,gd:68-i,xp:60,xg:70,xga:20,golden:false,practice:false,verified:true,show_r:false,fl_id:null,day:null,year:2016,tier:'Чемпіон',
      created_at:`2026-10-${String(1+i).padStart(2,'0')}T10:00:00Z`,xi,tbl});}
  return db;}
// "Your numbers": favourite clubs under their full data names (tools/tests/numbers.js has the full shape)
function numbers(){
  const slots=E.FORMATIONS['4-4-2'].slots,used=new Set(),ids=[],pl={};
  for(const sl of slots){let got=null;for(const c of E.DATA.clubs){for(const p of c.pl)if(p[6]===sl&&!used.has(p[5])&&p[2]>=80){got={p,c};break;}if(got)break;}
    used.add(got.p[5]);ids.push(got.p[5]);pl[got.p[5]]={n:got.p[0],k:20+ids.length*3,g:ids.length*7,r0:got.p[2],slot:sl,c:got.c.n,ka:15+ids.length*3,wa:300+ids.length*40};}
  return {n:140,na:128,w:2400,d:700,l:740,pts:7900,gf:7100,best:89,fm:{f:'4-4-2',k:85},xi:ids.map((id,i)=>({i,id,k:20+i*3})),pl,top:{g:ids[10],k:ids[2],dog:ids[5]},uniq:640,once:326,once_n:[],
    xin:1540,avg:82.4,dog:100,rn:1540,cl_n:FULL.length,cl:FULL.map((c,i)=>({c,k:i?Math.max(4,Math.round(300/(i+1))):600})),
    modes:[{b:'classic',k:98,pts:5940},{b:'oneclub',k:22,pts:2120}],off_n:0,rej:null};}

// ---------- page helpers
// visible text with all <details> open, visible field values, pitch labels (club line is hidden on a narrow pitch) and, after a season, the share text
const grab=pg=>pg.evaluate(()=>{for(const d of document.querySelectorAll('details'))d.open=true;
  const vals=[...document.querySelectorAll('textarea,input')].filter(e=>e.offsetParent).map(e=>e.value);
  const pitch=[...document.querySelectorAll('.pitch .club')].filter(e=>e.closest('section:not([hidden])')).map(e=>e.textContent);
  const D=window.__dbg,fin=document.getElementById('final'),share=fin&&!fin.hidden&&fin.offsetParent&&D.S.result?D.shareTextOf(D.S.result)+'\n'+D.shareTextOf(D.S.result,'copy'):'';
  return [document.body.innerText,...vals,...pitch,share].join('\n');});
const seen={};   // screen -> number of full names checked against
async function screen(pg,name,fn,errs){
  let text='';try{if(fn)await fn();await pg.waitForTimeout(250);text=await grab(pg);}catch(e){T.check(false,`${name}: екран не відкрився (${String(e.message).split('\n')[0].slice(0,120)})`);return '';}
  const bad=leaks(text);seen[name]=1;
  T.check(!bad.length,`${name}: ${bad.length?'повні назви: '+bad.slice(0,4).join(', ')+(bad.length>4?` і ще ${bad.length-4}`:''):'лише короткі назви'}${errs&&errs.length?' · помилки сторінки: '+errs.join(' | '):''}`);
  return text;}
const go1=pg=>pg.evaluate(()=>{const c=document.getElementById('viewClose');if(c&&c.offsetParent)c.click();window.__dbg.go(1);}).then(()=>pg.waitForTimeout(200));
const pickOne=async pg=>{await (await pg.$('#squad .pl:not([disabled])')).click();await pg.waitForTimeout(80);const t=await pg.$('#pitch .slot.target');if(t){await t.click();await pg.waitForTimeout(60);}};
const spin=async pg=>{await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});};
// whole season of a format from the setup screen: wheel and list, full XI with forecast, live season, result with share text
async function season(pg,label,fmt){
  await pg.evaluate(f=>{window.__dbg.go(4);window.__dbg.setFmt(f);},fmt);await pg.waitForTimeout(150);await pg.click('#startBtn');
  await screen(pg,`${label}: колесо і список гравців`,()=>spin(pg));await pickOne(pg);
  for(let i=0;i<12&&!await pg.evaluate(()=>window.__dbg.S.slots.every(s=>s.player));i++){await spin(pg);await pickOne(pg);}
  await screen(pg,`${label}: склад зібрано, прогноз`,async()=>{await pg.waitForSelector('#simBtn:not([hidden])',{timeout:5000});await pg.waitForTimeout(500);});
  await screen(pg,`${label}: живий сезон`,async()=>{await pg.click('#simBtn');await pg.waitForSelector('#skipBtn:visible',{timeout:15000});await pg.waitForTimeout(900);});
  await screen(pg,`${label}: результат і текст «Поділитися»`,async()=>{await pg.click('#skipBtn');await pg.waitForSelector('#final:not([hidden])',{timeout:8000});await pg.waitForTimeout(800);});}

(async()=>{
  // ---------- server: result-link preview, and no club names in the Telegram/preview builders
  {const R=require(path.join(ROOT,'api','r.js'));const db=mkDB();const s=db.DB.seasons[1];
   const html=R.page('https://upl.test/',s.id,{...s,players:{name:'vitia'}});
   T.check(!leaks(html).length&&/vitia/.test(html),'сервер: превʼю посилання на результат (api/r.js) — без повних назв');
   const src=['bot.js','_channel.js','_notify.js','_league.js','r.js','card.js','cron.js','league.js'].filter(f=>/DATA\.clubs|\bclubs\b.*\.n\b/.test(fs.readFileSync(path.join(ROOT,'api',f),'utf8')));
   T.check(!src.length,`сервер: тексти бота, каналу, нагадувань, ліг і превʼю не беруть назв клубів${src.length?' — тепер беруть: '+src.join(', ')+' (потрібен короткий варіант у lib/ і перевірка тут)':''}`);}
  const b=await launch();const db=mkDB();const VP={width:1024,height:1366};
  // ---------- main walk
  {const {pg,errs,ctx}=await openSite({b,db,init:INIT,viewport:VP,wait:1500});
   T.check(await pg.evaluate(()=>window.__dbg.DATA.clubs.every(c=>/ \(/.test(c.n))),'пул у браузері — лише клуби з містом у дужках');
   await screen(pg,'головна');
   await screen(pg,'таблиці: загальна',async()=>{await pg.evaluate(()=>window.__dbg.openTables('all'));await pg.waitForSelector('#boardBody table',{timeout:5000});});
   await screen(pg,'таблиці: «Один клуб»',async()=>{await pg.click('[data-board="oneclub"]');await pg.waitForSelector('#boardBody table',{timeout:5000});});
   await go1(pg);
   await screen(pg,'своя сторінка гравця з «Твоїми цифрами»',async()=>{await pg.click('#acctBtn');await pg.waitForSelector('#nmSec .nm-verdict',{timeout:5000});});
   await go1(pg);
   await screen(pg,'«Один клуб»: список клубів',()=>pg.evaluate(()=>window.__dbg.openOc()));
   await screen(pg,'«Один клуб»: картка клубу',()=>pg.click('#ocGrid .oct[data-c="karpaty-lviv"]'));
   await season(pg,'«Один клуб»','oneclub');await go1(pg);
   await season(pg,'класика','classic');await go1(pg);
   await season(pg,'дербі','derby');await go1(pg);
   await screen(pg,'виклик дня: драфт',async()=>{await pg.click('#vdCard');await pg.waitForTimeout(500);await spin(pg);});
   await screen(pg,'виклик дня: склад зібрано',async()=>{await pickOne(pg);for(let i=0;i<12&&!await pg.evaluate(()=>window.__dbg.S.slots.every(s=>s.player));i++){await spin(pg);await pickOne(pg);}
     await pg.waitForFunction(()=>!document.getElementById('vdFail')?.closest('section')?.hidden||!document.getElementById('simBtn').hidden,null,{timeout:5000}).catch(()=>{});await pg.waitForTimeout(400);});
   await go1(pg);
   // 5x5 on one device: the wheel names the club
   await screen(pg,'5×5: колесо',async()=>{await pg.evaluate(()=>document.getElementById('f5Open').click());await pg.fill('[data-nm="0"]','Андрій');await pg.fill('[data-nm="1"]','Сергій');await pg.click('#f5Go');
     for(let i=0;i<3&&await pg.$('#f5Ready');i++){await pg.click('#f5Ready');await pg.waitForTimeout(80);}await pg.waitForSelector('#f5Sq .pl:not([disabled])',{timeout:5000});});
   await screen(pg,'5×5: склади і матч',async()=>{for(let g=0;g<60&&!await pg.$('#f5Play');g++){const r=await pg.$('#f5Ready');if(r){await r.click();await pg.waitForTimeout(60);continue;}const p=await pg.$('#f5Sq .pl:not([disabled])');if(!p)break;await p.click();await pg.waitForTimeout(60);}
     await pg.click('#f5Play');await pg.waitForSelector('#f5Skip',{timeout:5000});await pg.click('#f5Skip');await pg.waitForSelector('#f5Again',{timeout:8000});});
   T.check(!errs.length,'помилок на сторінці немає'+(errs.length?': '+errs.join(' | '):''));await ctx.close();}
  // ---------- someone else's page, saved season, 5x5 friend league
  {const {pg,errs,ctx}=await openSite({b,db,init:INIT,viewport:VP,query:'?u=vitya234',wait:1500});
   await screen(pg,'чужа сторінка гравця (улюблений клуб, найкращий XI)',()=>pg.waitForSelector('#s6:not([hidden]) #ppName',{timeout:5000}),errs);await ctx.close();}
  {const {pg,errs,ctx}=await openSite({b,db,init:INIT,viewport:VP,query:'?s=105',wait:1500});
   await screen(pg,'сезон за посиланням ?s= (результат і склад)',()=>pg.waitForSelector('#s12:not([hidden]) #shrGo',{timeout:5000}),errs);await ctx.close();}
  {const {pg,errs,ctx}=await openSite({b,db,init:INIT,viewport:VP,signed:true,wait:1500});
   await screen(pg,'ліга 5×5 з друзями: колесо',async()=>{await pg.click('#flOpen');await pg.waitForTimeout(400);await pg.click('#flNew');await pg.waitForTimeout(200);
     await pg.click('[data-k="fmt"][data-v="f5"]');await pg.click('#flCreate');await pg.waitForSelector('#fl .reel .club',{timeout:5000});},errs);
   await ctx.close();}
  await b.close();
  console.log(`повних назв у даних: ${FULL.length}; екранів: ${Object.keys(seen).length}`);
  process.exit(T.done());})().catch(e=>{console.error(e);process.exit(1);});
