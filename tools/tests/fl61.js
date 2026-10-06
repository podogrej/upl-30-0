// Friends leagues (11x11): home -> Play with friends -> Create league (rules) -> attempt = classic draft under league rules
// (respins, from-memory, era, own formation) -> season tagged with league code -> counted -> league page (round, attempts, tables, invite);
// guest via ?l=... link sees the league and the sign-in-to-join prompt; My leagues on the own page.
// DB and RPC are in memory (SQL part is covered by bash tools/tests/setup.sh). Screenshots: tools/tests/out/fl61_*.png
// Run from repo root: node tools/tests/fl61.js
const path=require('path'),fs=require('fs');const {ROOT,launch,makeDB,openSite,checker}=require('./_site.js');
const OUT=path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const T=checker('ліги з друзями');
const TODAY=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function mkDB(){
  const players=[{id:'p-me',name:'andre',anon_name:'calm_owl',public_id:'andr2345'},{id:'p-v',name:'vitia',anon_name:'brave_fox',public_id:'vitya234'}];
  const leagues=[],members=[],entries=[],calls=[];
  const js=p=>({id:p.id,name:p.name,anon_name:p.anon_name,public_id:p.public_id,name_next:null,contact_email:null,news_optin:false});
  const me=()=>players[0];
  const get=id=>{const L=leagues.find(x=>x.id===id);if(!L)return null;
    const board=members.filter(m=>m.l===id).map(m=>{const p=players.find(x=>x.id===m.p);const es=entries.filter(e=>e.l===id&&e.p===m.p);
      return {u:p.public_id,name:p.name,total:es.length?(L.scoring==='sum'?Math.max(...es.map(e=>e.pts)):1):0,wins:es.length?1:0,best:es.length?Math.max(...es.map(e=>e.pts)):null,played:es.length?1:0};}).sort((a,b)=>b.total-a.total);
    const tour=board.filter(r=>r.played).map((r,i)=>({u:r.u,name:r.name,pts:r.best,w:20,d:5,l:5,gf:60,ga:30,score:r.total,rk:i+1,tries:entries.filter(e=>e.l===id&&players.find(p=>p.id===e.p).public_id===r.u).length}));
    return {...L,today:TODAY,day_n:1,over:false,owner:'andr2345',board,tour};};
  const rpc={
    player_hello:()=>js(me()),link_account:()=>({...js(me()),merge_offer:null}),trophy_stats:()=>({players:2,t:{}}),
    player_profile:()=>({public_id:'andr2345',name:'andre',anon:false,since:'2026-09-02T10:00:00Z',seasons:3,champions:1,perfect:0,best_classic:70,win_pct:60,best:{},worst:{},trophies:[],streak_best:0,streak_now:0}),
    fl_mine:()=>global.MINE_FAIL?{status:500,body:'{"message":"boom"}'}:leagues.filter(L=>members.some(m=>m.l===L.id&&m.p==='p-me')).map(L=>({id:L.id,name:L.name,fmt:'11',days:L.days,tries:L.tries,day_n:1,over:false,members:members.filter(m=>m.l===L.id).length,tries_today:entries.filter(e=>e.l===L.id&&e.p==='p-me').length,place:1})),
    fl_create:a=>{calls.push(['fl_create',a]);const id='abc'+String(leagues.length+2).repeat(3);leagues.push({id,name:a.p_name,fmt:'11',start_day:TODAY,days:a.p_days,tries:a.p_tries,take:a.p_take,scoring:a.p_scoring,rerolls:a.p_rerolls,ratings:a.p_ratings,era:a.p_era});members.push({l:id,p:'p-me'});return get(id);},
    fl_join:a=>{calls.push(['fl_join',a.p_id]);members.push({l:a.p_id,p:'p-me'});return get(a.p_id);},
    tg_leagues_mine:()=>[{chat_id:-100777,title:'Друзі по лаві',members:4,played_today:2}],
    fl_get:a=>get(a.p_id)};
  const db=makeDB({seasons:{auto:'id'},season_seeds:{auto:'id'},daily_results:{auto:'id'},player_links:{},user_state:{}},rpc);
  db.DB.players=players;global.fetch=db.fetch;
  return {db,leagues,members,entries,calls};}
(async()=>{const b=await launch();const M=mkDB();const {db}=M;const saves=[];
 const api={'/api/save':async req=>{const x=req.body;saves.push(x);if(x.kind!=='season')return {json:{ok:true}};
   const id=1000+saves.length;let fl;if(x.row.fl_id){const L=M.leagues.find(l=>l.id===x.row.fl_id);const n=M.entries.filter(e=>e.l===L.id&&e.p==='p-me').length;if(n<L.tries){M.entries.push({l:L.id,p:'p-me',pts:x.row.pts});fl=n+1;}else fl=null;}
   return {json:{id,verified:true,note:'ok',fl}};},'/api/seed':async()=>({json:{seed:12345,seed_id:'s1'}})};
 // ---- signed in: home -> Play with friends -> create league
 const A=await openSite({b,db,api,signed:true,viewport:{width:390,height:844},wait:1500});const pg=A.pg;
 T.check(await pg.$eval('#flOpen',e=>!e.hidden),'головна: «Грати з друзями» є');
 await pg.click('#flOpen');await pg.waitForTimeout(500);
 T.check(await pg.$eval('#s7',e=>!e.hidden)&&!!await pg.$('#flNew'),'екран ліг: «Створити лігу» (з входом)');
 await pg.screenshot({path:path.join(OUT,'fl61_list_empty.png'),fullPage:true});
 await pg.click('#flNew');await pg.waitForTimeout(200);
 T.check(!!await pg.$('[data-k="fmt"][data-v="f5"]'),'0.69: формат 5×5 при створенні знову є');
 const names0=await pg.$$eval('[data-name]',es=>es.map(e=>e.dataset.name));await pg.click('#flShuf');const names1=await pg.$$eval('[data-name]',es=>es.map(e=>e.dataset.name));
 T.check(names0.length===3&&names1.length===3&&(names0.join()!==names1.join()),'назви: 3 варіанти, «Перемішати» міняє ('+names1.join(', ')+')');
 await pg.click('[data-k="days"][data-v="7"]');await pg.click('[data-k="scoring"][data-v="sum"]');await pg.click('[data-k="ratings"][data-v="memory"]');await pg.click('[data-k="era"][data-v="y2010"]');await pg.click('[data-k="rerolls"][data-v="0"]');
 T.check(await pg.$$eval('#fl .opt.on',es=>es.length)>=7,'правила: вибрано по одному в кожному блоці');
 await pg.screenshot({path:path.join(OUT,'fl61_create.png'),fullPage:true});
 // Create button and rule tile labels are centered
 await pg.setViewportSize({width:1000,height:1400});await pg.waitForTimeout(200);
 const offC=await pg.evaluate(()=>{const mid=e=>{const r=e.getBoundingClientRect();return (r.left+r.right)/2;};const bad=[];
   for(const b of [document.getElementById('flCreate'),document.getElementById('flMsg')])if(Math.abs(mid(b)-mid(b.parentElement))>2)bad.push(b.id+' зсув '+Math.round(mid(b)-mid(b.parentElement))+'px');
   for(const o of document.querySelectorAll('#fl .opt'))for(const t of o.querySelectorAll('b,small'))if(Math.abs(mid(t)-mid(o))>2){bad.push('«'+t.textContent.slice(0,16)+'» не по центру плитки');break;}
   return bad;});
 T.check(!offC.length,'iPad: правила ліги й кнопка по центру'+(offC.length?' — '+offC.slice(0,3).join('; '):''));
 await pg.screenshot({path:path.join(OUT,'fl61_create_ipad.png'),fullPage:true});await pg.setViewportSize({width:390,height:844});
 await pg.click('#flCreate');await pg.waitForTimeout(500);
 const cr=M.calls.find(c=>c[0]==='fl_create');
 T.check(cr&&cr[1].p_days===7&&cr[1].p_scoring==='sum'&&cr[1].p_ratings==='memory'&&cr[1].p_era==='y2010'&&cr[1].p_rerolls===0&&cr[1].p_tries===3&&cr[1].p_take==='best','fl_create: правила передано ('+JSON.stringify(cr&&cr[1])+')');
 const dr=await pg.evaluate(()=>{const S=window.__dbg.S;return {sec:!document.getElementById('s2').hidden,label:document.getElementById('modeLabel').textContent,mode:S.mode,fmt:S.format,rr:S.rerolls,era:window.__dbg.eraOf(),lg:S.league&&S.league.id};});
 T.check(dr.sec&&/Ліга «/.test(dr.label)&&dr.mode==='normal'&&dr.fmt==='classic'&&dr.rr===0&&dr.era==='y2010'&&dr.lg,'одразу — спроба: драфт класики за правилами ліги ('+dr.label+', перекрути '+dr.rr+', епоха '+dr.era+')');
 await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});
 T.check(await pg.$eval('#showRRow',e=>e.hidden),'«на пам\'ять»: галочки «Показати рейтинги» немає');
 const yrs=await pg.evaluate(()=>window.__dbg.S.wheel.y);T.check(yrs>=2010,'епоха ліги: колесо дає сезони з 2010-х ('+yrs+')');
 for(let i=0;i<11;i++){if(i){await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});}
   await (await pg.$('#squad .pl:not([disabled])')).click();await pg.waitForTimeout(60);const t=await pg.$('#pitch .slot.target');if(t){await t.click();await pg.waitForTimeout(60);}}
 await pg.waitForSelector('#simBtn:not([hidden])');await pg.click('#simBtn');await pg.click('#skipBtn');await pg.waitForTimeout(1500);
 const sv=saves.find(x=>x.kind==='season');
 T.check(sv&&sv.row.fl_id===M.leagues[0].id&&sv.row.mode==='normal'&&sv.row.era==='y2010','сезон записано з кодом ліги ('+(sv&&sv.row.fl_id)+')');
 const msg=await pg.textContent('#leagueMsg');T.check(/Спробу 1 зараховано в лігу/.test(msg),'підсумки: «'+msg.trim()+'»');
 T.check(/До ліги/.test(await pg.textContent('#againBtn')),'кнопка «До ліги»');
 T.check(await pg.evaluate(()=>!/Рейт/.test(document.getElementById('playerStats').textContent)),'«на пам\'ять»: у статистиці сезону рейтингів немає');
 await pg.click('#againBtn');await pg.waitForTimeout(600);
 const page=(await pg.textContent('#fl')).replace(/\s+/g,' ');
 T.check(/Тур 1 з 7/.test(page)&&/Зіграти спробу 2 з 3/.test(page)&&/Загальна/.test(page)&&/andre/.test(page),'сторінка ліги: тур, наступна спроба, таблиця ('+page.slice(0,90)+')');
 T.check(await pg.evaluate(()=>/[?&]l=abc/.test(location.search)),'адреса сторінки ліги — ?l=…');
 // formations and the play-attempt button centered in the round card; rules as chips; Share has a caption
 await pg.setViewportSize({width:1000,height:1400});await pg.waitForTimeout(200);
 const offL=await pg.evaluate(()=>{const mid=e=>{const r=e.getBoundingClientRect();return (r.left+r.right)/2;};const bad=[],card=document.querySelector('#fl .fl-tour');
   for(const e of [document.getElementById('flPlay'),document.querySelector('#fl .fl-forms .chip:nth-child(3)')?document.querySelector('#fl .fl-forms'):null])if(e){const r=[...(e.children.length?e.children:[e])].map(x=>x.getBoundingClientRect());const c=(Math.min(...r.map(x=>x.left))+Math.max(...r.map(x=>x.right)))/2;if(Math.abs(c-mid(card))>3)bad.push((e.id||e.className)+' зсув '+Math.round(c-mid(card))+'px');}
   if(document.querySelectorAll('#fl .fl-rules .chip').length<4)bad.push('правила не чипами');
   if(!/Поділитися/.test(document.getElementById('flShare').textContent))bad.push('кнопка без підпису');return bad;});
 T.check(!offL.length,'iPad: сторінка ліги — схеми й кнопка по центру, правила чипами, «Поділитися»'+(offL.length?' — '+offL.join('; '):''));
 await pg.screenshot({path:path.join(OUT,'fl61_league_ipad.png'),fullPage:true});await pg.setViewportSize({width:390,height:844});
 await pg.click('[data-tab="tour"]');T.check(/сьогодні/.test(await pg.textContent('#fl')),'вкладка «Тур · сьогодні»');await pg.click('[data-tab="all"]');
 await pg.screenshot({path:path.join(OUT,'fl61_league.png'),fullPage:true});
 // own page: My leagues
 await pg.evaluate(()=>document.getElementById('acctBtn').click());await pg.waitForTimeout(1200);
 const ppl=(await pg.textContent('#ppLeagues').catch(()=>'')).replace(/\s+/g,' ');
 T.check(/Мої ліги/.test(ppl)&&ppl.includes(M.leagues[0].name),'своя сторінка: «Мої ліги» — '+ppl.slice(0,60));
 T.check(/Друзі по лаві/.test(ppl)&&/група в Telegram · 4 гравці · сьогодні зіграли 2/.test(ppl)&&await pg.$eval('#ppLeagues a.fl-row',a=>a.href).then(h=>/t\.me\/upl30_bot\?startapp=g-100777$/.test(h)),'«Мої ліги»: і ліга Telegram-групи з посиланням у бот');
 // league list: Playing now
 await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.click('#flOpen');await pg.waitForTimeout(600);
 T.check(/Грають зараз/.test(await pg.textContent('#fl')),'список: «Грають зараз»');
 await pg.screenshot({path:path.join(OUT,'fl61_list.png'),fullPage:true});
 T.check(!A.errs.length,'помилок на сторінці немає '+A.errs.join(' | '));
 // ---- guest via link: sees the league and the sign-in-to-join prompt
 const G=await openSite({b,db,api,query:'?l='+M.leagues[0].id,wait:1800});
 await G.pg.waitForFunction(n=>{const s7=document.getElementById('s7'),t=((document.getElementById('fl')||{}).textContent||'').replace(/\s+/g,' ');return s7&&!s7.hidden&&/Увійти, щоб приєднатися/.test(t)&&t.includes(n);},M.leagues[0].name,{timeout:15000}).catch(()=>{});   // wait for screen, text and name rather than a fixed delay (slow under load)
 const gp=(await G.pg.textContent('#fl')).replace(/\s+/g,' ');
 {const s7=await G.pg.$eval('#s7',e=>!e.hidden),ok=s7&&/Увійти, щоб приєднатися/.test(gp)&&gp.includes(M.leagues[0].name);   // flaky on CI only: on failure dump what the guest saw
  T.check(ok,'гість за посиланням: ліга й «Увійти, щоб приєднатися»'+(ok?'':` — бачить: s7 ${s7}, ліга «${M.leagues[0].name}», текст: ${gp.slice(0,240)} | помилки: ${G.errs.join(' | ')}`));}
 T.check(!G.errs.length,'гість: помилок немає '+G.errs.join(' | '));
 // ---- fl_mine failed: show load error with retry, not 'not playing yet'
 global.MINE_FAIL=true;const E=await openSite({b,db,api,signed:true,wait:1500});
 await E.pg.click('#flOpen');await E.pg.waitForTimeout(600);
 T.check(/Не вдалося завантажити ліги/.test(await E.pg.textContent('#fl'))&&!!await E.pg.$('#flRetry'),'збій fl_mine: «Не вдалося завантажити ліги» + «Спробувати ще»');
 global.MINE_FAIL=false;await E.pg.click('#flRetry');await E.pg.waitForTimeout(600);
 T.check(!/Не вдалося/.test(await E.pg.textContent('#fl'))&&await E.pg.$$eval('#fl .fl-row',es=>es.length)>0,'«Спробувати ще» — ліги завантажились');
 T.check(!E.errs.length,'збій fl_mine: помилок немає '+E.errs.join(' | '));
 await b.close();process.exit(T.done());})();
