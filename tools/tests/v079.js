// 0.79: chat leagues count free play (first 3 verified seasons of the Kyiv day, the best one counts; server-side),
// a browser "result" (daily draft from older tabs) is ignored; Tables screen with all-time and chats tabs; no tables on home.
// Run from repo root: node tools/tests/v079.js [screenshot dir]
const path=require('path'),fs=require('fs'),crypto=require('crypto');const {ROOT,makeDB,openSite,checker}=require('./_site.js');
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const T=checker('v079');
process.env.SUPABASE_SERVICE_KEY='svc';process.env.TG_TOKEN='123:TEST';

async function server(){
  const db=makeDB({seasons:{auto:'id'},season_seeds:{auto:'id'},player_links:{},league_members:{pk:['chat_id','tg_user_id']},league_results:{pk:['chat_id','day','tg_user_id']},leagues:{pk:['chat_id']},league_boards:{pk:['chat_id','day']}},
    {device_ok:()=>'p1',rate_hit:()=>true});
  const TG=[];
  global.fetch=async(url,o={})=>{const u=String(url);
    if(u.startsWith('https://api.telegram.org/')){const m=u.split('/').pop(),b=JSON.parse(o.body||'{}');TG.push({m,b});
      const j=m==='getChatMember'?{ok:true,result:{status:'member'}}:{ok:true,result:{message_id:TG.length}};return {ok:true,status:200,json:async()=>j,text:async()=>JSON.stringify(j)};}
    return db.fetch(url,o);};
  const L=require(path.join(ROOT,'api','_league.js')),leagueH=require(path.join(ROOT,'api','league.js')),seedH=require(path.join(ROOT,'api','seed.js'));
  const LL=require(path.join(ROOT,'lib','engine.js')).LEAGUE_LEGENDS;
  const D=db.DB,day=L.kyivDate(),yday=L.kyivDate(new Date(Date.now()-864e5));
  const DEV1=crypto.randomUUID(),DEV2=crypto.randomUUID(),OTHER=crypto.randomUUID();
  D.leagues.push({chat_id:-1,title:'Чат один'},{chat_id:-2,title:'Чат два'},{chat_id:-3,title:'Чат три'});
  D.player_links.push({kind:'tg',key:'11',player_id:'p1'},{kind:'device',key:DEV1,player_id:'p1'},{kind:'device',key:DEV2,player_id:'p1'});
  D.league_members.push({chat_id:-1,tg_user_id:11,name:'Андрій'},{chat_id:-2,tg_user_id:11,name:'Андрій'});
  let n=0,t=Date.now()-3600e3;
  // seed issued by the server; official = league attempt (classic, normal, all years, marked by the browser)
  const seed=(o={})=>{const s={id:crypto.randomUUID(),device_id:DEV1,day,daily:false,official:true,format:'classic',mode:'normal',year:LL,formation:'4-4-2',created_at:new Date(t+=60e3).toISOString(),...o};D.season_seeds.push(s);return s;};
  const season=(sd,o={})=>{const s={id:++n,player_id:'p1',device_id:sd.device_id,seed_id:sd.id,format:sd.format,mode:sd.mode,year:sd.year,practice:false,day:null,fl_id:null,era:null,verified:true,
    w:10,d:5,l:15,place:9,gf:30,ga:40,xp:40,formation:'4-4-2',created_at:new Date(t+=60e3).toISOString(),...o};s.pts=s.w*3+s.d;D.seasons.push(s);return s;};
  const play=async(sd,o)=>{const s=season(sd,o);await L.creditSeason(s,sd);return s;};
  const rowOf=c=>D.league_results.find(r=>String(r.chat_id)===String(c)&&r.day===day&&String(r.tg_user_id)==='11');
  // not attempts: other modes (seed not marked), daily draft, yesterday; their seasons never count
  for(const o of [{mode:'hardcore',official:false},{mode:'hard',official:false},{mode:'pick',official:false},{mode:'normal',official:false},{daily:true,official:true,mode:'daily'}])await play(seed(o),{w:28});
  await play(seed({day:yday}),{w:29,created_at:new Date(Date.now()-864e5).toISOString()});
  T.check(!D.league_results.some(r=>r.day===day),'інші режими, «Виклик другу» / ліга з друзями (seed не позначено як спробу), драфт дня — у ліги не йдуть і спроб не забирають');
  T.check(D.league_results.length===2&&D.league_results.every(r=>r.day===yday),'вчорашня спроба зараховується вчорашньому дню');
  // seed requested as another mode, season saved as classic normal: never counted (verify also rejects the mismatch: cheat.js)
  const sdHard=seed({mode:'hard',official:false});const sHack=season(sdHard,{mode:'normal',w:30,d:0,l:0});await L.creditSeason(sHack,sdHard);
  T.check(!D.league_results.some(r=>r.day===day),'seed узято як інший режим, сезон збережено як «Грати» — у лігу не йде');
  // attempt 1: issued, season never saved (dropped) -> burns the attempt
  seed();
  const a2=seed({device_id:DEV2}),s2=await play(a2,{w:15,d:5,l:10});
  T.check(rowOf(-1)&&rowOf(-1).season_id===s2.id&&rowOf(-2)&&rowOf(-2).season_id===s2.id&&rowOf(-1).pts===50,'2-га спроба дня (з іншого пристрою гравця) — в обох лігах');
  T.check(TG.filter(x=>x.m==='sendMessage'||x.m==='editMessageText').length>=2,'табло обох чатів оновлено');
  rowOf(-1).name='silent_owl';   // anonymised after account deletion: must stay
  const s3=await play(seed(),{w:20,d:5,l:5});
  T.check(rowOf(-1).season_id===s3.id&&rowOf(-1).pts===65&&rowOf(-2).season_id===s3.id,'3-тя спроба краща — замінила гіршу');
  T.check(rowOf(-1).name==='silent_owl','ім’я в рядку не перезаписано');
  const s4=await play(seed(),{w:27,d:3,l:0});
  T.check(rowOf(-1).season_id===s3.id,'4-та спроба (27-3-0) не рахується: перша спроба згоріла, хоч сезон не збережено');
  const sd5=seed();const s5=season(sd5,{w:28,d:2,l:0,created_at:new Date(t+=60e3).toISOString()});
  // 5th season saved with the seed of attempt 3? no: a season always sits on its own seed; replay with an early seed id is blocked by verify (used_by)
  await L.creditSeason(s5,sd5);T.check(rowOf(-2).season_id===s3.id,'5-та спроба — теж ні');
  T.check(L.cmpRes({pts:50,gf:40,ga:20},{pts:50,gf:30,ga:20})<0&&L.cmpRes({pts:50,gf:40,ga:30},{pts:50,gf:30,ga:10})>0&&L.cmpRes({pts:51,gf:0,ga:9},{pts:50,gf:90,ga:0})<0,'порівняння: очки → різниця м’ячів → забиті');
  T.check(L.RULE==='У лігу йде найкращий сезон із перших трьох спроб дня у «Грати».'&&/перших трьох спроб дня/.test(await L.boardText(-1,day))&&!/драфт|Драфт/.test(await L.boardText(-1,day)),'табло в чаті пояснює правило, без «Драфт дня»');
  T.check(L.playKb(-1).inline_keyboard[0][0].text==='▶️ Грати','кнопка під табло — «Грати»');
  // race: two verifications at once must leave the better season (no row yet, and an existing row)
  {D.league_results.length=0;const best=await L.dayBest([DEV1,DEV2],day);const worse={...best,id:s2.id,w:15,d:5,l:10,pts:50};const m=[{chat_id:-1,tg_user_id:11,name:'X'}];
   await Promise.all([L.putBest(worse,day,m),L.putBest(best,day,m)]);const r1=rowOf(-1).season_id;
   rowOf(-1).season_id=s2.id;Object.assign(rowOf(-1),{w:15,d:5,l:10,pts:50});
   const mid={...best,id:999,w:18,d:5,l:7,pts:59};await Promise.all([L.putBest(mid,day,m),L.putBest(best,day,m)]);
   T.check(r1===s3.id&&rowOf(-1).season_id===s3.id,`гонка двох перевірок — у рядку кращий сезон (без рядка: ${r1}, з рядком: ${rowOf(-1).season_id}, кращий ${s3.id})`);}
  // /api/seed marks league attempts only for classic + normal outside the daily draft
  {const call=body=>new Promise(res=>seedH({method:'POST',body,query:{},headers:{}},{status(c){this.c=c;return this;},json(j){res({c:this.c||200,j});},setHeader(){}}));
   const xi=[...Array(11)].map((_,i)=>({id:'x'+i,slot:'CB',c:'a',y:2000}));const base={device_id:OTHER,secret:'s'.repeat(32),xi,formation:'4-4-2',year:LL};
   const got=async b=>{const r=await call({...base,...b});return D.season_seeds.find(s=>s.id===r.j.seed_id)||{};};
   const k1=await got({mode:'normal',format:'classic',league:true}),k2=await got({mode:'hard',format:'classic',league:true}),k3=await got({mode:'normal',format:'classic'}),k4=await got({mode:'normal',format:'oneclub',league:true});
   T.check(k1.official===true&&k2.official===false&&k3.official===false&&k4.official===false,'/api/seed: спроба ліги — лише «Грати» (класика, «Звичайний») з позначкою браузера');}
  // Mini App: join a third chat -> today's best of the first 3 attempts is copied in; a browser result is ignored
  const hm=(k,d)=>crypto.createHmac('sha256',k).update(d).digest();
  const initData=(user,sp)=>{const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify(user),start_param:sp});
    p.set('hash',hm(hm('WebAppData',process.env.TG_TOKEN),[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n')).toString('hex'));return p.toString();};
  const call=body=>new Promise(res=>leagueH({method:'POST',body,query:{},headers:{}},{status(c){this.c=c;return this;},json(j){res({c:this.c||200,j});},setHeader(){}}));
  const j3=await call({initData:initData({id:11,first_name:'Андрій'},'g-3')});
  T.check(j3.c===200&&j3.j.joined[0].backfilled&&rowOf(-3)&&rowOf(-3).season_id===s3.id,'вступ у новий чат — найкращий сезон із перших трьох спроб дня ('+JSON.stringify(j3.j).slice(0,80)+')');
  const before=JSON.stringify(D.league_results);
  const old=await call({initData:initData({id:11,first_name:'Андрій'},''),result:{w:30,d:0,l:0,pts:90,place:1,gf:99,ga:0,day,season_id:s4.id,formation:'4-4-2'}});
  T.check(old.c===200&&Array.isArray(old.j.posted)&&!old.j.posted.length&&JSON.stringify(D.league_results)===before,'стара вкладка надсилає драфт дня в /api/league — проігноровано, ліги не змінились');
  const vsrc=fs.readFileSync(path.join(ROOT,'api','verify.js'),'utf8');
  T.check(/L\.creditSeason\(\{ \.\.\.row, verified: true \}, seedRow\)/.test(vsrc)&&!/league_results/.test(vsrc),'перевірка сезону (verify.js) сама зараховує сезон у ліги чатів зі своїм seed; результатів ліг з браузера більше немає');
  const asrc=fs.readFileSync(path.join(ROOT,'src','account.js'),'utf8')+fs.readFileSync(path.join(ROOT,'src','template.html'),'utf8');
  T.check(!/leagueSubmit|result:\{w:/.test(asrc),'клієнт більше не надсилає результат у /api/league');
}

async function ui(){
  const chats=[{chat_id:-100555,title:'Футбол по середах',members:4,played_today:2},{chat_id:-100777,title:'Сім’я',members:2,played_today:0}];
  const data={'-100555':{title:'Футбол по середах',day:'2026-10-09',members:4,today:[{name:'Сергій',w:20,d:5,l:5,pts:65,gf:60,ga:30},{name:'Олег',w:18,d:5,l:7,pts:59,gf:50,ga:30}],standings:[{name:'Сергій',wins:3,days:4},{name:'Олег',wins:1,days:4}]},
    '-100777':{title:'Сім’я',day:'2026-10-09',members:2,today:[],standings:[]}};
  let gets=[],delay=0,mine=chats;
  const api={'/api/league':async req=>{if(req.method==='POST')return {json:{ok:true,joined:[]}};const c=req.url.searchParams.get('chat');gets.push(c);if(delay)await new Promise(r=>setTimeout(r,delay));return {json:data[c]};}};
  const db=makeDB({},{tg_leagues_mine:()=>mine,player_hello:()=>({id:'p1',anon_name:'silent_owl',public_id:'abcd2345'})});
  for(const th of ['dark','light']){
    const {b,pg,errs}=await openSite({db,api,colorScheme:th,wait:1500,init:`localStorage.setItem('upl30_theme','${th}')`});
    if(th==='dark'){
      const home=await pg.evaluate(()=>({gone:['lbOpenBtn','lbHome','leagueCard','boardOpen'].filter(id=>document.getElementById(id)),tile:(document.getElementById('tablesOpen')||{}).innerText||'',
        foot:[...document.querySelectorAll('.foot0 a')].map(a=>a.dataset.go+':'+a.textContent).join(','),txt:document.getElementById('s1').innerText}));
      T.check(!home.gone.length,'на головній немає «Таблиця дня», плитки «Таблиця за весь час» і картки ліги ('+home.gone.join(',')+')');
      T.check(/Таблиці/.test(home.tile)&&/За весь час · Мої чати/.test(home.tile),'на головній — рядок «Таблиці» · «За весь час · Мої чати»');
      T.check(/tablesOpen:Таблиці/.test(home.foot),'підвал: «Таблиці»');
      T.check(!gets.length,'таблиці чатів не вантажаться заздалегідь');
      await pg.screenshot({path:path.join(OUT,'v079_home.png'),fullPage:true});
    }
    await pg.click('#tablesOpen');await pg.waitForTimeout(700);
    const st=await pg.evaluate(()=>({s9:!document.getElementById('s9').hidden,s1:!document.getElementById('s1').hidden,on:document.querySelector('#tbTabs .tab.on').dataset.tb,rows:document.querySelectorAll('#boardBody tr').length,back:!document.getElementById('backBtn').hidden}));
    T.check(st.s9&&!st.s1&&st.on==='all'&&st.back,`${th} · «Таблиці» відкриваються екраном, вкладка «За весь час», є «Назад»`);
    await pg.screenshot({path:path.join(OUT,`v079_tables_all_${th}.png`)});
    delay=th==='dark'?700:0;gets=[];
    await pg.click('#tbTabs .tab[data-tb=chats]');await pg.waitForTimeout(250);
    if(th==='dark')T.check(await pg.$$eval('#tbChats .sk',e=>e.length)>0,'«Мої чати»: поки вантажиться — скелет');
    await pg.waitForTimeout(900);
    const c=await pg.evaluate(()=>{const e=document.getElementById('tbChats');return {chips:[...e.querySelectorAll('.lg-chips .chip')].map(x=>x.textContent),on:(e.querySelector('.chip.on')||{}).textContent,ttl:(e.querySelector('.ttl')||{}).textContent,rows:e.querySelectorAll('tbody tr').length,txt:e.innerText};});
    T.check(c.chips.length===2&&c.on==='Футбол по середах'&&c.ttl==='Футбол по середах'&&c.rows===2,`${th} · «Мої чати»: чіпи чатів (${c.chips.join(', ')}), таблиця першого (${c.rows} рядки)`);
    T.check(/У лігу йде найкращий сезон із перших трьох спроб дня у «Грати»/.test(c.txt)&&/2 з 4 зіграли/.test(c.txt)&&!/Драфт дня/i.test(c.txt),`${th} · правило одним рядком, лічильник, без «Драфт дня»`);
    T.check(gets.length===1&&gets[0]==='-100555','завантажено лише відкритий чат');
    await pg.screenshot({path:path.join(OUT,`v079_tables_chats_${th}.png`)});
    await pg.click('#lgTabs button[data-t=st]');await pg.waitForTimeout(150);
    T.check(/Перемог/.test(await pg.textContent('#tbChats'))&&await pg.$$eval('#tbChats tbody tr',e=>e.length)===2,`${th} · «Залік» чату`);
    await pg.click('#lgTabs button[data-t=today]');
    await pg.click('#tbChats .chip:not(.on)');await pg.waitForTimeout(1300);
    const e2=await pg.evaluate(()=>({ttl:document.querySelector('#tbChats .ttl').textContent,play:!!document.getElementById('lgPlay'),txt:document.getElementById('tbChats').innerText}));
    T.check(e2.ttl==='Сім’я'&&e2.play&&/ще ніхто не зіграв/.test(e2.txt),`${th} · другий чат: порожньо сьогодні + «Грати»`);
    await pg.screenshot({path:path.join(OUT,`v079_tables_chat_empty_${th}.png`)});
    if(th==='dark'){await pg.evaluate(()=>{const S=window.__dbg.S;S.freeMode=S.mode='hard';S.era='d2000';window.__dbg.setFmt('oneclub');});await pg.click('#lgPlay');await pg.waitForTimeout(500);
      const st=await pg.evaluate(()=>{const S=window.__dbg.S;return {s4:!document.getElementById('s4').hidden,f:S.format,pick:S.pickMode,m:S.mode,e:S.era};});
      T.check(st.s4&&st.f==='classic'&&!st.pick&&st.m==='normal'&&st.e==='all','«Грати» з порожнього чату — завжди класика, «Звичайний», усі роки: '+JSON.stringify(st));
      await pg.click('#backBtn');await pg.waitForTimeout(400);}
    await pg.click('#backBtn');await pg.waitForTimeout(500);
    T.check(await pg.evaluate(()=>!document.getElementById('s1').hidden&&document.getElementById('s9').hidden),`${th} · «Назад» — на головну`);
    await pg.click('#tablesOpen');await pg.waitForTimeout(400);
    T.check(await pg.evaluate(()=>document.querySelector('#tbTabs .tab.on').dataset.tb)==='chats','повторне відкриття — та сама вкладка');
    if(th==='light'){
      mine=[];await pg.evaluate(()=>{});await pg.close();
      const s2=await openSite({b,db,api,wait:1200});await s2.pg.click('#tablesOpen');await s2.pg.click('#tbTabs .tab[data-tb=chats]');await s2.pg.waitForTimeout(500);
      const t=await s2.pg.textContent('#tbChats');
      T.check(/Ти ще не в жодній лізі чату/.test(t)&&/\/league/.test(t),'без чатів — пояснення, як додати бота й вступити');
      await s2.pg.screenshot({path:path.join(OUT,'v079_tables_none.png')});
      await s2.pg.setViewportSize({width:820,height:1180});await s2.pg.click('#tbTabs .tab[data-tb=all]');await s2.pg.waitForTimeout(400);await s2.pg.screenshot({path:path.join(OUT,'v079_tables_ipad.png')});
      await s2.pg.click('#homeBtn');await s2.pg.waitForTimeout(500);await s2.pg.screenshot({path:path.join(OUT,'v079_home_ipad.png'),fullPage:true});
      T.check(!s2.errs.length,'помилок немає '+s2.errs.join(' | '));
    }
    T.check(!errs.length,`${th} · помилок на сторінці немає `+errs.join(' | '));
    await b.close().catch(()=>{});
  }
}
(async()=>{await server();await ui();process.exit(T.done());})().catch(e=>{console.error(e);process.exit(1);});
