// 0.78 "fewer DB requests": request counts per flow with the in-memory DB and the real api/ handlers.
// A. server: daily seed is one insert (409 path keeps retry / race / other squad), season save does not re-read the row,
//    new trophies come with the season, daily result is one upsert, chat league standings page past 1000 rows, league card.
// B. site: no table prefetch, tables load on open (head start on touch), trophy counter cache (6 h), trophy_stats cache (1 h),
//    player page asks for leagues once, day table loaded once and without xi, no user_state write when nothing changed.
// Run from repo root: node tools/tests/v078.js
const path=require('path'),crypto=require('crypto');const {ROOT,launch,makeDB,callApi,openSite,draftSeason,checker}=require('./_site.js');
const {pgStub}=require('./_rest.js');
process.env.SUPABASE_SERVICE_KEY='svc';process.env.TG_TOKEN='123:TEST';
const E=require(path.join(ROOT,'lib','engine.js'));
const seedH=require(path.join(ROOT,'api','seed.js')),saveH=require(path.join(ROOT,'api','save.js')),verH=require(path.join(ROOT,'api','verify.js'));
const T=checker('v078');
const kd=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const DAY=kd(new Date());
const keyOf=(m,url)=>{const u=new URL(url);return m+' '+(u.pathname.includes('/rpc/')?'rpc/':'')+u.pathname.split('/').pop();};
const count=(log,re)=>log.filter(k=>re.test(k)).length;
// in-memory DB for server handlers; official daily seeds are unique per device and day (season_seeds_official_uq)
const SECRETS={};
function serverDB(){
  const db=makeDB({seasons:{auto:'id'},season_seeds:{auto:'id'},daily_results:{auto:'id'},trophies:{pk:['device_id','trophy']},challenges:{}},
    {device_ok:a=>{if(SECRETS[a.p_device]==null)SECRETS[a.p_device]=a.p_secret;return SECRETS[a.p_device]===a.p_secret?'p-1':{status:403,body:JSON.stringify({code:'28000',message:'device secret'})};},rate_hit:()=>true});
  const log=[];
  global.fetch=async(url,o={})=>{const m=o.method||'GET';log.push(keyOf(m,url)+(m==='POST'&&/on_conflict/.test(url)?' upsert':''));
    if(m==='POST'&&/\/season_seeds/.test(url)){const b=JSON.parse(o.body);if(b.official&&db.DB.season_seeds.some(x=>x.official&&x.daily&&x.device_id===b.device_id&&x.day===b.day))
      return {ok:false,status:409,text:async()=>JSON.stringify({code:'23505'}),json:async()=>({code:'23505'})};}
    return db.fetch(url,o);};
  return {db,log};}
// daily squad: first eligible players from the wheel of the day
function dailyXi(skip=0){const D=E.dailySetupFor(DAY);E.setFormat('classic');const xi=[],used=new Set();
  for(const slot of E.FORMATIONS[D.formation].slots){let pick=null,k=skip;
    for(const i of D.seq){const c=E.DATA.clubs[i];for(const p of c.pl){if(used.has(p[5]))continue;const r=E.effRating(p,slot);if(r!=null){if(k>0&&slot==='GK'){k--;continue;}pick={c,p,r};break;}}if(pick)break;}
    used.add(pick.p[5]);xi.push({n:pick.p[0],id:pick.p[5],slot,r:pick.r,r0:pick.p[2],c:pick.c.n,y:pick.c.y});}
  return {D,xi};}
const SX=xi=>xi.map(x=>({id:x.id,name:x.n,slot:x.slot,pos:E.GROUP_OF[x.slot],r:x.r,cc:(E.DATA.clubs.find(c=>c.n===x.c&&c.y===+x.y)||{}).c,y:+x.y}));

async function serverChecks(){
  // ---- daily seed: insert first
  {const {db,log}=serverDB();const dev=crypto.randomUUID(),sec='secret-0123456789abcdef';const {D,xi}=dailyXi();
   const args={device_id:dev,secret:sec,xi,formation:D.formation,mode:'daily',format:'classic',year:D.year,daily:true};
   const s1=await callApi(seedH,args);
   T.check(s1.json.official===true&&count(log,/season_seeds/)===1&&count(log,/GET season_seeds/)===0,`seed дня: одна вставка, без читання (${log.filter(k=>/season_seeds/.test(k)).join(', ')})`);
   log.length=0;const s2=await callApi(seedH,args);
   T.check(s2.json.official===true&&s2.json.seed===s1.json.seed&&count(log,/season_seeds/)===2,'seed дня: повтор того самого складу — той самий офіційний seed (409 → читання)');
   const other=dailyXi(1).xi;log.length=0;const s3=await callApi(seedH,{...args,xi:other});
   T.check(s3.json.official===false&&s3.json.seed!==s1.json.seed,'seed дня: інший склад після офіційного — звичайна спроба');
   const r1=await callApi(seedH,{...args,device_id:crypto.randomUUID()});
   T.check(r1.json.official===true,'seed дня: новий пристрій — офіційна');
   const dv=crypto.randomUUID();const race=await Promise.all([callApi(seedH,{...args,device_id:dv}),callApi(seedH,{...args,device_id:dv})]);
   T.check(race.every(x=>x.json.official===true&&x.json.seed===race[0].json.seed)&&db.DB.season_seeds.filter(x=>x.device_id===dv&&x.official).length===1,'seed дня: гонка двох запитів — одна офіційна спроба');
   const plain=await callApi(seedH,{...args,daily:false,mode:'normal'});
   T.check(plain.json.official===false,'seed не дня — звичайний');
  // ---- season save: inserted row goes to verification, trophies in the same request, daily result as one upsert
   const q=E.run({xi:SX(xi),mode:'daily',format:'classic',year:D.year,seed:s1.json.seed});
   const row={mode:'daily',format:'classic',formation:D.formation,year:D.year,seed:s1.json.seed,seed_id:s1.json.seed_id,version:E.VERSION,xi,day:DAY,practice:false,
     w:q.W,d:q.D,l:q.L,pts:q.pts,place:q.place,gf:q.gf,ga:q.ga,perfect:q.W===30,nickname:'tester'};
   log.length=0;const sv=await callApi(saveH,{kind:'season',device_id:dev,secret:sec,row,trophies:['ms1','champ','bad id!']});
   const order=log.join(' | ');
   T.check(sv.status===200&&sv.json.verified===true&&sv.json.tr===true,`сезон: перевірено, трофеї записано (${sv.json.verified} ${sv.json.note||''} tr=${sv.json.tr})`);
   T.check(count(log,/GET seasons/)===0,'сезон: без повторного читання рядка (GET seasons = 0)');
   T.check(db.DB.trophies.filter(x=>x.device_id===dev).map(x=>x.trophy).sort().join()==='champ,ms1','сезон: трофеї з запиту — лише коректні id');
   const ins=log.indexOf('POST seasons'),pv=log.indexOf('PATCH seasons'),ps=log.indexOf('PATCH season_seeds'),pd=log.indexOf('POST daily_results upsert');
   T.check(ins>=0&&ins<pv&&ins<ps&&pd>pv&&pd>ps,'сезон: порядок вставка → вердикт і seed used_by → результат дня ('+order+')');
   T.check(count(log,/daily_results/)===1&&count(log,/PATCH daily_results/)===0,'сезон дня: результат дня одним upsert, без PATCH');
   const seedRow=db.DB.season_seeds.find(x=>x.id===s1.json.seed_id),dr=db.DB.daily_results.filter(x=>x.device_id===dev);
   T.check(+seedRow.used_by===+sv.json.id&&dr.length===1&&dr[0].verified===true&&dr[0].pts===q.pts&&dr[0].nickname==='tester',`seed used_by = сезон, у таблиці дня один перевірений рядок (${dr.length}, ${dr[0]&&dr[0].pts} оч.)`);
   T.check(log.length===9,`сезон дня зі збереженням трофеїв: ${log.length} запитів до бази (до 0.78 — 10, і ще 4 на окремий запит трофеїв)`);
   // repeated verify keeps the name in the row (anonymised after deletion) and rewrites numbers
   dr[0].nickname='calm_owl';dr[0].pts=90;log.length=0;await callApi(verH,{season_id:sv.json.id});
   T.check(dr[0].nickname==='calm_owl'&&dr[0].pts===q.pts&&count(log,/PATCH daily_results/)===1,'повторний verify: числа переписано, ім\'я в рядку не чіпаємо');
   // second save of a season with the same seed is not verified
   const sv2=await callApi(saveH,{kind:'season',device_id:dev,secret:sec,row});
   T.check(sv2.json.verified===false,'той самий seed удруге — не перевірено ('+sv2.json.note+')');
   // old tabs: separate trophies request still works
   const old=await callApi(saveH,{kind:'trophies',device_id:dev,secret:sec,ids:['perfect']});
   T.check(old.status===200&&db.DB.trophies.some(x=>x.device_id===dev&&x.trophy==='perfect'),'старий шлях kind: trophies працює');
   const wrong=await callApi(saveH,{kind:'season',device_id:dev,secret:'other-secret-0123456789',row,trophies:['hack']});
   T.check(wrong.status===401&&!db.DB.trophies.some(x=>x.trophy==='hack'),'чужий секрет: ні сезону, ні трофеїв (401)');
  }
  // ---- chat league standings ("Залік"): more than 1000 result rows
  {const S=pgStub(['https://qruhcbwycrnfgzzdbljr.supabase.co']);const base='https://qruhcbwycrnfgzzdbljr.supabase.co';
   const rows=S.tbl(base,'league_results');let n=0;
   for(let d=0;d<60;d++){const day=new Date(Date.UTC(2026,7,1)+d*864e5).toISOString().slice(0,10);   // days before VERIFIED_FROM: counted as stored
     for(let p=0;p<21;p++)rows.push({chat_id:'-100900',day,tg_user_id:7000+p,name:'u'+p,w:10,d:5,l:15,pts:35+((p*7+d*3)%40),gf:30,ga:30,created_at:`${day}T10:${String(p).padStart(2,'0')}:00Z`,season_id:null}),n++;}
   const log=[];global.fetch=async(url,o={})=>{log.push(keyOf(o.method||'GET',url));return S.fetch(url,o);};
   delete require.cache[require.resolve(path.join(ROOT,'api','_league.js'))];const L=require(path.join(ROOT,'api','_league.js'));
   const st=await L.standings('-100900');const days=st.reduce((a,s)=>a+s.days,0),wins=st.reduce((a,s)=>a+s.wins,0);
   T.check(n>1000&&days===n&&wins===60,`залік ліги чату: усі ${n} результатів за 60 днів (днів у заліку ${days}, перемог ${wins})`);
   T.check(count(log,/GET league_results/)===2,'залік: дві сторінки по 1000 ('+count(log,/GET league_results/)+' запити)');
   const lim=await (await S.fetch(`${base}/rest/v1/league_results?chat_id=eq.-100900&limit=3000`)).json();
   T.check(lim.length===1000,'перевірка мока: один запит віддає не більше 1000 рядків, як Supabase');
   // league card (GET /api/league?card=1): standings are not read
   S.tbl(base,'leagues').push({chat_id:'-100900',title:'Чат'});log.length=0;
   const h=require(path.join(ROOT,'api','league.js'));const day=L.kyivDate();rows.push({chat_id:'-100900',day,tg_user_id:7001,name:'u1',w:20,d:5,l:5,pts:65,gf:50,ga:30,created_at:new Date().toISOString(),season_id:null});
   const res=await new Promise(r=>h({method:'GET',query:{chat:'-100900',card:'1'},headers:{}},{status(c){this.c=c;return this;},json(j){r({c:this.c||200,j});},setHeader(){},send(){},end(){}}));
   T.check(res.c===200&&log.length<=5&&count(log,/GET league_results/)===1,`картка ліги: ${log.length} запитів до бази, без заліку (${log.join(', ')})`);
  }
}

// ---------- B. site
async function siteChecks(){
  const players=[{id:'p-me',name:'andrii',anon_name:'calm_owl',public_id:'andr2345'}];
  const js=p=>({id:p.id,name:p.name,anon_name:p.anon_name,public_id:p.public_id,name_next:null});
  const rpc={player_hello:()=>js(players[0]),link_account:()=>({...js(players[0]),merge_offer:null}),device_ok:()=>'p-me',rate_hit:()=>true,legacy_writes_open:()=>false,
    trophy_stats:()=>({players:50,t:{}}),player_profile:()=>({public_id:'andr2345',name:'andrii',since:'2026-09-02T10:00:00Z',seasons:3,champions:1,perfect:0,best_classic:70,win_pct:60,best:{},worst:{},trophies:[{id:'champ',at:'2026-10-01'}],streak_best:0,streak_now:0}),
    fl_mine:()=>[],tg_leagues_mine:()=>[]};
  const db=makeDB({seasons:{auto:'id',onInsert:r=>{r.verified=null;r.player_id='p-me';}},season_seeds:{auto:'id'},daily_results:{auto:'id'},user_state:{pk:['user_id']},trophies:{pk:['device_id','trophy']}},rpc);
  db.DB.players=players;
  let C=[];const cdb={DB:db.DB,handle:(m,url,b,h)=>{C.push(keyOf(m,url)+' '+decodeURIComponent(new URL(url).search));return db.handle(m,url,b,h);}};
  const api={'/api/seed':async r=>{C.push('API seed');return callApi(seedH,r.body);},'/api/save':async r=>{C.push('API save:'+r.body.kind+(r.body.trophies?' +trophies':''));return callApi(saveH,r.body);},
    '/api/verify':async r=>{C.push('API verify');return callApi(verH,r.body);},'/api/err':async()=>({status:204,json:{}})};
  global.fetch=db.fetch;
  const b=await launch();
  // guest, new device
  const o=await openSite({b,db:cdb,api,viewport:{width:430,height:900},wait:4000});const pg=o.pg;
  T.check(count(C,/GET seasons/)===0,'новий пристрій, головна: таблиці не підвантажуються, trRetro пропущено (GET seasons = 0)');
  T.check(count(C,/player_profile/)===1&&await pg.evaluate(()=>localStorage.getItem('upl30_tr_retro')==='1'),'перший захід: лічильник трофеїв з сервера один раз, позначка trRetro стоїть');
  // all-time table: request starts on touch, opening uses it
  C=[];await pg.hover('#boardOpen');await pg.mouse.down();await pg.waitForTimeout(300);const touch=count(C,/GET seasons/);
  await pg.mouse.up();await pg.waitForTimeout(700);
  T.check(touch===1&&count(C,/GET seasons/)===1&&await pg.evaluate(()=>!!document.getElementById('boardBody').textContent.trim()&&!document.querySelector('#boardBody .sk-box')),`таблиця за весь час: запит із дотику (${touch}), відкриття без другого (${count(C,/GET seasons/)})`);
  await pg.click('#viewClose');await pg.waitForTimeout(300);
  C=[];await pg.click('#boardOpen');await pg.waitForTimeout(700);
  T.check(count(C,/GET seasons/)===1,'повторне відкриття: свіжі дані одним запитом');await pg.click('#viewClose');await pg.waitForTimeout(300);
  // day table on home
  C=[];await pg.click('#lbOpenBtn');await pg.waitForTimeout(700);const lbq=C.filter(k=>/daily_results/.test(k));
  T.check(lbq.length===1&&!/xi|select=\*/.test(lbq[0]),'таблиця дня: один запит, без xi і без * ('+(lbq[0]||'').slice(0,120)+')');
  // classic season: one save request with trophies, no separate trophies request, no table prefetch afterwards
  C=[];await pg.click('#lbOpenBtn');await pg.click('#freeOpen');await pg.evaluate(()=>window.__dbg.setFmt('classic'));await pg.click('#startBtn');await draftSeason(pg);await pg.waitForTimeout(4000);
  T.check(count(C,/API save:season \+trophies/)===1&&count(C,/API save:trophies/)===0,'сезон: нові трофеї в запиті сезону ('+C.filter(k=>/API/.test(k)).join(', ')+')');
  T.check(db.DB.trophies.some(x=>x.trophy==='ms1')&&count(C,/GET seasons/)===0,'сезон: трофей записано, таблиці після сезону не підвантажуються');
  const srv=await pg.evaluate(()=>({at:+localStorage.getItem('upl30_tr_srv_at'),ids:localStorage.getItem('upl30_tr_srv')}));
  T.check(srv.at===0&&/champ/.test(srv.ids),'після сезону з новими трофеями кеш лічильника позначено застарілим');
  // own page: leagues once per open, trophy_stats once
  C=[];await pg.evaluate(()=>document.getElementById('acctBtn').click());await pg.waitForTimeout(2000);
  T.check(count(C,/rpc\/fl_mine/)===1&&count(C,/rpc\/tg_leagues_mine/)===1&&count(C,/trophy_stats/)===1&&count(C,/player_profile/)===1,`своя сторінка: ${C.filter(k=>/rpc/.test(k)).map(k=>k.split(' ')[1]).join(', ')}`);
  T.check(await pg.evaluate(()=>+localStorage.getItem('upl30_tr_srv_at')>0),'своя сторінка оновила кеш лічильника трофеїв');
  // reload: counter from cache (6 h), trophy_stats from cache (1 h)
  await pg.reload();await pg.waitForTimeout(3000);C=[];await pg.reload();await pg.waitForTimeout(3000);
  T.check(count(C,/player_profile/)===0&&await pg.textContent('#trCount')!=='','повторний захід: лічильник трофеїв з кешу, без player_profile');
  C=[];await pg.evaluate(()=>document.getElementById('acctBtn').click());await pg.waitForTimeout(1500);
  T.check(count(C,/trophy_stats/)===0,'trophy_stats з кешу (година)');
  await pg.evaluate(()=>{localStorage.setItem('upl30_tr_srv_at',String(Date.now()-7*36e5));localStorage.setItem('upl30_tr_pct',JSON.stringify({at:Date.now()-2*36e5,v:{players:1,t:{}}}));});
  C=[];await pg.reload();await pg.waitForTimeout(3000);
  T.check(count(C,/player_profile/)===1,'кеш лічильника старший за 6 год — один player_profile');
  // daily: day table loaded once (after the verdict), no table prefetch
  C=[];await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.waitForTimeout(200);await pg.click('#dailyBtn');await draftSeason(pg);await pg.waitForTimeout(5000);
  T.check(count(C,/daily_results/)===1&&count(C,/GET seasons/)===0,`драфт дня: таблиця дня один раз (${count(C,/daily_results/)}), без підвантаження таблиць`);
  T.check(await pg.$$eval('#lbTable tr.me',e=>e.length)===1,'драфт дня: свій рядок у таблиці дня');
  T.check(o.errs.length===0,'без помилок на сторінці'+(o.errs.length?': '+o.errs.join(' | '):''));
  await o.ctx.close();
  // signed in: no user_state write when nothing changed
  db.DB.user_state.length=0;C=[];
  db.DB.user_state.push({user_id:'u1',data:{upl30_best_v2:{classic:{W:21,D:5,L:4,pts:68,place:2,formation:'4-4-2',mode:'normal'}}}});
  const s=await openSite({b,db:cdb,api,signed:true,viewport:{width:430,height:900},wait:3500});
  T.check(/68/.test(await s.pg.textContent('#bestLine')),'вхід: рекорд з акаунта показано після синхронізації');
  const w1=count(C,/POST user_state/);await s.pg.reload();await s.pg.waitForTimeout(3500);C=[];await s.pg.reload();await s.pg.waitForTimeout(3500);
  T.check(w1===1&&count(C,/POST user_state/)===0&&count(C,/GET user_state/)===1,`вхід: стан записано раз (${w1}), без змін — без запису (${count(C,/POST user_state/)})`);
  await s.ctx.close();await b.close();
}
(async()=>{await serverChecks();await siteChecks();process.exit(T.done());})().catch(e=>{console.error(e);process.exit(1);});
