// Chat league tables (since 0.79 on the Tables screen, chats tab) and /api/league.
// A. server: same output as before for a fixture, fewer sequential DB rounds, card=1 without standings (older tabs), cache header,
//    join still checks membership, a browser result is ignored.
// B. site: no table request before the screen opens, skeleton while loading, join skipped for 24 h, retry after an error,
//    column header / own row, standings from the same request, cache bypass after own season, 403 and migration, 404.
// Screenshots: tools/tests/out/v077b_*.png.   Run from repo root: node tools/tests/v077b.js [screenshot dir]
const path=require('path'),fs=require('fs'),crypto=require('crypto');const {ROOT,launch,makeDB,openSite,checker}=require('./_site.js');
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const T=checker('v077b');const wait=ms=>new Promise(r=>setTimeout(r,ms));
const kd=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const DAY=kd(new Date());

// ---------- A. server
// fixture: 24 players, today + 6 verified days + 2 days before VERIFIED_FROM; some seasons unverified or of another user; names from player_links
const GOLDEN={"title":"Футбол по середах","day":"TODAY","today":[{"name":"Ніна","w":23,"d":3,"l":4,"pts":72,"gf":44,"ga":22,"created_at":"2026-09-01T10:13:00Z"},{"name":"p_4","u":"abcdefg6","w":21,"d":5,"l":4,"pts":68,"gf":35,"ga":22,"created_at":"2026-09-01T10:04:00Z"},{"name":"Зоя","w":22,"d":0,"l":8,"pts":66,"gf":52,"ga":22,"created_at":"2026-09-01T10:21:00Z"},{"name":"p_8","u":"abcdefg3","w":19,"d":8,"l":3,"pts":65,"gf":39,"ga":22,"created_at":"2026-09-01T10:08:00Z"},{"name":"p_16","u":"abcdefg4","w":18,"d":5,"l":7,"pts":59,"gf":47,"ga":22,"created_at":"2026-09-01T10:16:00Z"},{"name":"p_20","u":"abcdefg8","w":16,"d":8,"l":6,"pts":56,"gf":51,"ga":22,"created_at":"2026-09-01T10:20:00Z"},{"name":"p_6","w":17,"d":0,"l":13,"pts":51,"gf":37,"ga":22,"created_at":"2026-09-01T10:06:00Z"},{"name":"Марко","w":15,"d":5,"l":10,"pts":50,"gf":32,"ga":22,"created_at":"2026-09-01T10:01:00Z"},{"name":"p_10","w":15,"d":3,"l":12,"pts":48,"gf":41,"ga":22,"created_at":"2026-09-01T10:10:00Z"},{"name":"Петро","w":13,"d":8,"l":9,"pts":47,"gf":36,"ga":22,"created_at":"2026-09-01T10:05:00Z"},{"name":"p_14","w":13,"d":6,"l":11,"pts":45,"gf":45,"ga":22,"created_at":"2026-09-01T10:14:00Z"},{"name":"Ліза","w":14,"d":2,"l":14,"pts":44,"gf":40,"ga":22,"created_at":"2026-09-01T10:09:00Z"},{"name":"p_18","w":14,"d":0,"l":16,"pts":42,"gf":49,"ga":22,"created_at":"2026-09-01T10:18:00Z"},{"name":"p_0","u":"abcdefg2","w":13,"d":1,"l":16,"pts":40,"gf":31,"ga":22,"created_at":"2026-09-01T10:00:00Z"}],"members":26,"standings":[{"name":"Влад","wins":1,"days":4,"pts":252},{"name":"Таня","wins":1,"days":5,"pts":304},{"name":"p_16","u":"abcdefg4","wins":1,"days":5,"pts":297},{"name":"p_8","u":"abcdefg3","wins":1,"days":6,"pts":345},{"name":"Петро","wins":1,"days":7,"pts":401},{"name":"Марко","wins":1,"days":6,"pts":336},{"name":"p_0","u":"abcdefg2","wins":1,"days":6,"pts":329},{"name":"Ніна","wins":1,"days":6,"pts":329},{"name":"Гліб","wins":1,"days":5,"pts":268},{"name":"p_2","wins":0,"days":6,"pts":350},{"name":"p_4","u":"abcdefg6","wins":0,"days":6,"pts":347},{"name":"Богдан","wins":0,"days":5,"pts":289},{"name":"Дмитро","wins":0,"days":6,"pts":346},{"name":"Зоя","wins":0,"days":6,"pts":339},{"name":"p_10","wins":0,"days":6,"pts":335},{"name":"p_6","wins":0,"days":6,"pts":333},{"name":"p_20","u":"abcdefg8","wins":0,"days":6,"pts":332},{"name":"Ева","wins":0,"days":5,"pts":269},{"name":"p_22","wins":0,"days":6,"pts":322},{"name":"Ліза","wins":0,"days":6,"pts":321},{"name":"Йосип","wins":0,"days":6,"pts":318},{"name":"p_12","u":"abcdefg7","wins":0,"days":5,"pts":260},{"name":"p_14","wins":0,"days":6,"pts":312},{"name":"p_18","wins":0,"days":6,"pts":289}]};
function fixture(){
  process.env.TG_TOKEN='123:ABC';process.env.SUPABASE_SERVICE_KEY='k';
  const days=[DAY,'2026-10-06','2026-10-05','2026-10-04','2026-10-03','2026-10-02','2026-10-01','2026-09-26','2026-09-25'];
  const names=['Олег','Марко','Саша','Дмитро','Іра','Петро','Сергій','Таня','Юра','Ліза','Костя','Влад','Андрій','Ніна','Остап','Богдан','Віра','Гліб','Данило','Ева','Жанна','Зоя','Ігор','Йосип'];
  const results=[];let sid=0;const seasons={};
  days.forEach((day,di)=>names.forEach((nm,i)=>{if((i+di)%4===3)return;const id=++sid;const pts=40+((i*7+di*5)%31);const w=Math.floor(pts/3)-((i+di)%3),d=pts-3*w,l=30-w-d;
    results.push({chat_id:'-100555',day,tg_user_id:1000+i,name:nm,w,d,l,pts,gf:30+((i*3+di)%20),ga:20+((i+di*2)%15),created_at:`2026-09-01T10:${String(i).padStart(2,'0')}:00Z`,season_id:id});
    if((i+di)%5!==2)seasons[id]={id,day,tg_user_id:(i===4&&di===1)?9999:1000+i,w:w+(i%2),d,l:l-(i%2),gf:31+i,ga:22,place:1+(i%16)};}));
  const links=[];for(let i=0;i<names.length;i+=2)links.push({key:String(1000+i),players:{name:'p_'+i,anon_name:'a'+i,public_id:i%4===0?'abcdefg'+(2+i%7):null}});
  const S={log:[],t0:0,member:'member',writes:[]};
  global.fetch=async(url,o={})=>{const u=decodeURIComponent(String(url));const s=Date.now()-S.t0;let body=[];const m=(o.method||'GET');
    if(u.includes('api.telegram.org')){body=/getChatMember/.test(u)?{ok:true,result:{status:S.member}}:{ok:true,result:{message_id:1}};}
    else{const p=u.split('/rest/v1/')[1];const q=new URLSearchParams(p.split('?')[1]);const t=p.split('?')[0];const f=k=>{const v=q.get(k);return v&&v.replace(/^eq\./,'');};
      if(m!=='GET'){S.writes.push(t);body=null;}
      else if(t==='leagues')body=f('chat_id')==='-100555'?[{chat_id:'-100555',title:'Футбол по середах'}]:[];
      else if(t==='league_members')body=names.map((_,i)=>({tg_user_id:1000+i})).concat([{tg_user_id:2001},{tg_user_id:2002}]);
      else if(t==='league_results'){body=results.filter(r=>(!f('day')||r.day===f('day'))&&(!f('tg_user_id')||String(r.tg_user_id)===f('tg_user_id')));const lim=+q.get('limit');if(q.get('order')==='day.desc')body=[...body].sort((a,b)=>a.day<b.day?1:a.day>b.day?-1:0);if(lim)body=body.slice(0,lim);}
      else if(t==='seasons'&&q.get('id')){const ids=q.get('id').replace(/^in\.\(|\)$/g,'').split(',').map(Number);body=ids.map(i=>seasons[i]).filter(Boolean);}
      else if(t==='player_links'){const ks=q.get('key').replace(/^in\.\(|\)$/g,'').split(',');body=links.filter(l=>ks.includes(l.key)).map(l=>({key:l.key,players:l.players}));}
      else if(t==='league_boards')body=[];}
    await wait(20);S.log.push({s,e:Date.now()-S.t0,k:m+' '+u.replace(/^.*\/(rest\/v1|bot[^/]*)\//,'')});
    return {ok:true,status:200,text:async()=>body==null?'':JSON.stringify(body),json:async()=>body};};
  const h=require(path.join(ROOT,'api','league.js'));
  const run=req=>new Promise(res=>{S.log=[];S.writes=[];S.t0=Date.now();const hd={};h(req,{status(c){this.c=c;return this;},json(j){res({c:this.c||200,j,hd,log:[...S.log]});},setHeader(k,v){hd[k]=v;},end(){res({c:this.c,hd,log:[...S.log]});}});});
  return {S,run};}
// sequential rounds: longest chain of calls where each starts after the previous one ended
const rounds=log=>{const L=[...log].sort((a,b)=>a.s-b.s);for(const c of L)c.dp=1+Math.max(0,...L.filter(p=>p!==c&&p.e<=c.s).map(p=>p.dp||0));return Math.max(0,...L.map(c=>c.dp));};
function initData(user,start){const p=new URLSearchParams({user:JSON.stringify(user),auth_date:String(Math.floor(Date.now()/1000)),start_param:start});
  const dcs=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
  const sec=crypto.createHmac('sha256','WebAppData').update('123:ABC').digest();p.set('hash',crypto.createHmac('sha256',sec).update(dcs).digest('hex'));return p.toString();}

async function server(){
  const F=fixture();
  const full=await F.run({method:'GET',query:{chat:'-100555'}});
  const norm=JSON.parse(JSON.stringify(full.j).split(DAY).join('TODAY'));
  T.check(JSON.stringify(norm)===JSON.stringify(GOLDEN),`сервер: «Уся таблиця» — той самий результат, що до 0.77 (сьогодні ${full.j.today.length}, залік ${full.j.standings.length})`);
  const rf=rounds(full.log),rq=full.log.filter(c=>/league_results/.test(c.k)).length;
  T.check(rf<=2&&rq===1,`сервер: повна таблиця — ${rf} послідовні раунди запитів (було 4), результати ліги читаються один раз (${rq})`);
  T.check(full.log.filter(c=>/^GET seasons/.test(c.k)).length===2&&rounds(full.log.filter(c=>/seasons|player_links/.test(c.k)))===1,'сервер: пачки перевірки сезонів та імена — паралельно (Promise.all)');
  T.check(full.hd['Cache-Control']==='public, s-maxage=30, stale-while-revalidate=300','сервер: Cache-Control s-maxage=30, stale-while-revalidate=300');
  const card=await F.run({method:'GET',query:{chat:'-100555',card:'1'}});
  T.check(!('standings' in card.j)&&JSON.stringify(card.j.today)===JSON.stringify(full.j.today)&&card.j.members===full.j.members&&card.j.title===full.j.title,'сервер: card=1 — той самий «сьогодні» і лічильники, без заліку');
  T.check(!card.log.some(c=>/order=day\.desc/.test(c.k))&&rounds(card.log)<=2&&card.log.length<full.log.length,`сервер: card=1 не читає історію ліги (${card.log.length} запитів проти ${full.log.length})`);
  T.check((await F.run({method:'GET',query:{chat:'-1'}})).c===404,'сервер: чужий чат без ліги — 404');
  // join: membership is still checked (403 for non-members), signature still checked (401); league lookup and getChatMember start together
  const id=initData({id:1001,first_name:'Марко'},'g-100555');
  const j1=await F.run({method:'POST',body:{initData:id}});
  const lgS=j1.log.find(c=>/^GET leagues/.test(c.k)),tgS=j1.log.find(c=>/getChatMember/.test(c.k));
  T.check(j1.c===200&&j1.j.joined[0].chat_id==='-100555'&&lgS&&tgS&&Math.abs(lgS.s-tgS.s)<15,`сервер: вступ — пошук ліги й getChatMember паралельно (${lgS&&lgS.s} / ${tgS&&tgS.s} мс)`);
  F.S.member='left';const j2=await F.run({method:'POST',body:{initData:id}});
  T.check(j2.c===403&&!F.S.writes.includes('league_members'),'сервер: не учасник групи — 403, у лігу не записано');
  F.S.member='member';const j3=await F.run({method:'POST',body:{initData:id.replace(/hash=\w+/,'hash=00')}});
  T.check(j3.c===401,'сервер: підпис Telegram не збігся — 401');
  // a result from the browser (older tabs sent the daily draft here) is ignored: nothing written to league_results
  const p=await F.run({method:'POST',body:{initData:initData({id:1001,first_name:'Марко'},''),result:{w:20,d:5,l:5,pts:65,gf:50,ga:30,place:2,day:DAY,season_id:5}}});
  T.check(p.c===200&&JSON.stringify(p.j.posted)==='[]'&&!p.log.some(c=>/league_results|league_members\?tg_user_id/.test(c.k)&&!/^GET/.test(c.k)),'сервер: результат від браузера ігнорується (posted порожній, у ліги нічого не записано)');
}

// ---------- B. site
const NM=['Олег','Марко','Саша','Дмитро','Іра','Петро','Сергій','Таня','Юра','Ліза','Костя','Влад'];
const board=(me)=>{const t=NM.map((x,i)=>({name:x,w:20-i,d:5,l:5+i,pts:70-3*i,gf:50,ga:30}));if(me)t.splice(6,0,{name:'Андрій',u:'andr2345',w:12,d:5,l:13,pts:41,gf:40,ga:40});return t;};
// Telegram launch URL as on real clients: initData (with start_param) in the hash
const tgHash=(start,user={id:1,first_name:'Андрій'})=>'#tgWebAppData='+encodeURIComponent('query_id=AAA&user='+encodeURIComponent(JSON.stringify(user))+'&auth_date=1'+(start?'&start_param='+start:'')+'&hash=abc')+'&tgWebAppVersion=7.10&tgWebAppPlatform=ios';
const tgObj=(start,user={id:1,first_name:'Андрій'},theme='dark')=>({initData:'user=x&hash=abc',initDataUnsafe:{user,start_param:start},colorScheme:theme,platform:'ios'});
// /api/league stub: request log with times, optional delays, gates and failures
function leagueApi(o={}){const A={reqs:[],t0:Date.now(),today:o.today||board(false),members:o.members||40,title:'Футбол по середах',gate:null,fail:0,post:o.post||(()=>({json:{ok:true,joined:[{chat_id:'-100555',title:'Футбол по середах'}]}}))};
  A.api={'/api/auth':async()=>({json:{token_hash:'TH'}}),
    '/api/league':async req=>{const q=req.url.searchParams,r={m:req.method,chat:q.get('chat'),card:q.get('card'),t:q.get('t'),s:Date.now()-A.t0};A.reqs.push(r);
      if(req.method==='POST'){await wait(o.postMs||0);r.e=Date.now()-A.t0;return A.post(req);}
      if(A.gate&&(!A.gateFull||!r.card))await A.gate.p;
      await wait(o.getMs||0);r.e=Date.now()-A.t0;
      if(A.fail>0){A.fail--;return {status:500,json:{error:'crash'}};}
      if(o.nolg)return {status:404,json:{error:'no league'}};
      const j={title:A.title,day:DAY,today:A.today,members:A.members};if(!r.card)j.standings=A.today.map((x,i)=>({name:x.name,u:x.u,wins:12-i,days:14,pts:600}));return {json:j};}};
  A.hold=(full)=>{let res;A.gateFull=!!full;A.gate={p:new Promise(r=>res=r)};A.gate.release=()=>{const g=A.gate;A.gate=null;res();};};
  return A;}
const shot=(pg,n)=>pg.screenshot({path:path.join(OUT,`v077b_${n}.png`)});

async function site(b){
  const open=async pg=>{await pg.click('#tablesOpen');await pg.waitForSelector('#tbChats td.nm .nmt',{timeout:8000});await wait(200);};
  // 1. opened from the group button: join POST at start, no table request until the Tables screen opens; it starts on the chats tab
  {const A=leagueApi({getMs:300,postMs:150,today:board(true)});
   const init=`localStorage.setItem('upl30_player',JSON.stringify({id:'p1',name:'андрій',public_id:'andr2345'}));`;
   const {ctx,pg,errs}=await openSite({b,db:makeDB({}),api:A.api,tg:tgObj('g-100555'),hash:tgHash('g-100555'),init,viewport:{width:390,height:844},wait:1500});
   T.check(A.reqs.length===1&&A.reqs[0].m==='POST','на старті — лише вступ у лігу (POST), таблиця не вантажиться заздалегідь: '+A.reqs.map(r=>r.m).join(','));
   await pg.click('#tablesOpen');await wait(120);
   const s0=await pg.evaluate(()=>({tab:document.querySelector('#tbTabs .tab.on').dataset.tb,sk:document.querySelectorAll('#tbChats tbody .sk.lg-sq').length,busy:!!document.querySelector('#tbChats [role=status][aria-busy=true]')}));
   T.check(s0.tab==='chats'&&s0.sk===5&&s0.busy,`з кнопки групи «Таблиці» відкриваються на «Мої чати»; поки вантажиться — скелетон (role=status, aria-busy): ${JSON.stringify(s0)}`);
   await pg.waitForSelector('#tbChats td.nm .nmt',{timeout:8000});await wait(200);
   const c=await pg.evaluate(()=>{const e=document.getElementById('tbChats'),q=s=>e.querySelector(s);const rows=[...e.querySelectorAll('tbody tr')];const me=q('tr.me td');
     return {title:q('.ttl').textContent,pill:q('.lg-pill').textContent,rule:q('.lg-sub').textContent,th:[...e.querySelectorAll('thead th')].map(x=>x.textContent),
       rowH:Math.min(...rows.map(r=>r.getBoundingClientRect().height)),n:rows.length,medals:e.querySelectorAll('tbody .plc').length,me:q('tr.me')?q('tr.me').innerText.replace(/\s+/g,' ').trim():'',accent:me?getComputedStyle(me).boxShadow:'',
       ptsFs:parseFloat(getComputedStyle(q('td.p')).fontSize),nameFs:parseFloat(getComputedStyle(q('td.nm')).fontSize)};});
   T.check(c.title==='Футбол по середах'&&c.pill==='13 з 40 зіграли'&&c.rule==='У лігу йде найкращий сезон із перших трьох спроб дня у «Грати».',`шапка: ${c.title} · «${c.pill}» · правило одним рядком`);
   T.check(c.th.join('|')==='#|Гравець|В-Н-П|Очки','заголовки колонок: '+c.th.join(' · '));
   T.check(c.n===13&&c.rowH>=44&&c.medals===3&&c.ptsFs>c.nameFs,`усі 13 рядків ≥44 px (${c.rowH}), медалі топ-3, очки більші за ім'я (${c.ptsFs}>${c.nameFs})`);
   T.check(/^7 андрій · ти/.test(c.me)&&/inset/.test(c.accent)&&/3px/.test(c.accent),'свій рядок «· ти» з акцентом зліва: '+c.me);
   const g1=A.reqs.filter(r=>r.m==='GET');T.check(g1.length===1&&!g1[0].card&&!g1[0].t&&g1[0].chat==='-100555','один повний запит (сьогодні й залік разом), без card=1 і без &t=');
   await pg.click('#lgTabs button[data-t=st]');await wait(150);
   T.check(A.reqs.filter(r=>r.m==='GET').length===1&&await pg.$$eval('#tbChats tbody tr',t=>t.length)===13&&/Днів.*Перемог/.test(await pg.textContent('#tbChats thead')),'«Залік» — з того самого запиту, 13 рядків');
   await shot(pg,'chats_st_phone390_dark');await pg.click('#lgTabs button[data-t=today]');
   await pg.click('#backBtn');await wait(300);await pg.click('#tablesOpen');await wait(300);
   T.check(A.reqs.filter(r=>r.m==='GET').length===1,'повторне відкриття екрана — з пам’яті, без нового запиту');
   // own verified free-play season -> the next load goes past the CDN cache
   A.reqs.length=0;await pg.click('#backBtn');await pg.evaluate(()=>window.__dbg.lgStale());await open(pg);
   T.check(A.reqs.some(r=>r.m==='GET'&&r.t),'після свого сезону — запит з &t= (мимо кешу)');
   T.check(!errs.length,'помилок JS немає '+errs.join(' | '));
   // 2. second open within 24 h: no join request
   A.reqs.length=0;await pg.reload();await wait(1500);
   T.check(!A.reqs.length,`повторне відкриття за добу: вступ не повторюється, таблиці не вантажаться (${A.reqs.map(r=>r.m).join(',')})`);
   const jk=await pg.evaluate(()=>JSON.parse(localStorage.getItem('upl30_joined_-100555')));
   T.check(jk&&jk.u===1&&jk.chat==='-100555'&&Date.now()-jk.at<6e4,'upl30_joined_<чат>: {u, at, chat}');
   await pg.evaluate(()=>{const k='upl30_joined_-100555',j=JSON.parse(localStorage.getItem(k));j.at=Date.now()-25*36e5;localStorage.setItem(k,JSON.stringify(j));});
   A.reqs.length=0;await pg.reload();await wait(1500);T.check(A.reqs.some(r=>r.m==='POST'),'через добу вступ повторюється');
   await pg.evaluate(()=>{const k='upl30_joined_-100555',j=JSON.parse(localStorage.getItem(k));j.u=2;localStorage.setItem(k,JSON.stringify(j));});
   A.reqs.length=0;await pg.reload();await wait(1500);T.check(A.reqs.some(r=>r.m==='POST'),'інший користувач Telegram на пристрої — вступ іде');
   await ctx.close();}
  // 3. error -> load-failed message with a retry button -> retry
  {const A=leagueApi({});A.fail=1;
   const {ctx,pg,errs}=await openSite({b,db:makeDB({}),api:A.api,tg:tgObj('g-100555'),hash:tgHash('g-100555'),viewport:{width:390,height:844},wait:1500});
   await pg.click('#tablesOpen');await wait(600);
   const e=await pg.evaluate(()=>{const c=document.getElementById('tbChats'),r=document.getElementById('lgRetry');return {txt:c.innerText.replace(/\s+/g,' '),h:r?r.getBoundingClientRect().height:0,alert:!!c.querySelector('[role=alert]')};});
   T.check(/Не вдалося завантажити · Спробувати ще/.test(e.txt)&&e.h>=44&&e.alert,`помилка: «${e.txt.slice(-40)}», кнопка ${e.h} px`);
   await shot(pg,'error_phone390_dark');
   await pg.click('#lgRetry');await pg.waitForSelector('#tbChats td.nm .nmt',{timeout:5000}).catch(()=>{});
   T.check(await pg.$$eval('#tbChats tbody tr',t=>t.length)===12,'«Спробувати ще» завантажує таблицю');
   T.check(!errs.length,'помилок JS немає '+errs.join(' | '));await ctx.close();}
  // 4. 403 (not confirmed as a group member): short note, join not remembered; supergroup migration
  {const A=leagueApi({post:()=>({status:403,json:{error:'not a member of this chat'}})});
   const {ctx,pg}=await openSite({b,db:makeDB({}),api:A.api,tg:tgObj('g-100555'),hash:tgHash('g-100555'),viewport:{width:390,height:844},wait:1500});
   await open(pg);
   T.check(/Ти ще не в цій лізі: відкрий гру кнопкою бота в групі\./.test(await pg.textContent('#tbChats'))&&!(await pg.evaluate(()=>localStorage.getItem('upl30_joined_-100555'))),'403: коротка примітка, вступ не запамʼятовано');
   await ctx.close();}
  {const A=leagueApi({post:()=>({json:{ok:true,joined:[{chat_id:'-100999',title:'Футбол по середах'}]}})});
   const {ctx,pg}=await openSite({b,db:makeDB({}),api:A.api,tg:tgObj('g-555'),hash:tgHash('g-555'),viewport:{width:390,height:844},wait:1500});
   await open(pg);
   const st=await pg.evaluate(()=>({lg:JSON.parse(localStorage.getItem('upl30_league')),j:JSON.parse(localStorage.getItem('upl30_joined_-555'))}));
   T.check(A.reqs.some(r=>r.m==='GET'&&r.chat==='-100999')&&!A.reqs.some(r=>r.m==='GET'&&r.chat==='-555')&&st.lg==='-100999'&&st.j&&st.j.chat==='-100999','група стала супергрупою: таблиця з нового id, id запамʼятовано');
   A.reqs.length=0;await pg.reload();await wait(1500);await open(pg);
   T.check(A.reqs.length&&A.reqs.every(r=>r.chat==='-100999'&&r.m==='GET'),'наступне відкриття зі старої кнопки — одразу новий id, без вступу: '+A.reqs.map(r=>r.m+' '+r.chat).join(', '));
   await ctx.close();}
  // 5. no league for the chat (404)
  {const A=leagueApi({nolg:true});
   const {ctx,pg}=await openSite({b,db:makeDB({}),api:A.api,tg:tgObj('g-777'),hash:tgHash('g-777'),viewport:{width:390,height:844},wait:1500});
   await pg.click('#tablesOpen');await wait(700);
   T.check(/Ліги цього чату більше немає/.test(await pg.textContent('#tbChats')),'чат без ліги (404) — коротке пояснення');await ctx.close();}
  // 6. wide screens: one column at most 640 px; screenshots iPad 820/1024, landscape 1366, phone 390, dark and light
  const VPS={ipad820:[820,1180],ipad1024:[1024,1366],land1366:[1366,1024],phone390:[390,844]};
  for(const [k,[w,h]] of Object.entries(VPS))for(const th of ['dark','light']){
    const A=leagueApi({today:board(true)});A.hold();
    const init=`localStorage.setItem('upl30_theme','${th}');localStorage.setItem('upl30_player',JSON.stringify({id:'p1',name:'андрій',public_id:'andr2345'}));`;
    const {ctx,pg,errs}=await openSite({b,db:makeDB({}),api:A.api,tg:tgObj('g-100555',undefined,th),hash:tgHash('g-100555'),init,viewport:{width:w,height:h},colorScheme:th,wait:900});
    await pg.click('#tablesOpen');await wait(300);await shot(pg,`skeleton_${k}_${th}`);const sk=await pg.$$eval('#tbChats .sk',e=>e.length);
    A.gate.release();await pg.waitForSelector('#tbChats td.nm .nmt');await wait(400);await shot(pg,`chats_${k}_${th}`);
    const m=await pg.evaluate(()=>({tw:document.querySelector('#tbChats table').getBoundingClientRect().width,sw:document.documentElement.scrollWidth,vw:innerWidth}));
    if(th==='dark')T.check(m.tw<=641&&m.sw<=m.vw,`${k}: таблиця ≤ 640 px (${Math.round(m.tw)}), нічого не вилазить`);
    if(th==='dark')T.check(!errs.length&&sk>0,`${k}: скелетон на знімку, помилок JS немає `+errs.join(' | '));
    await ctx.close();}
}

(async()=>{await server();const b=await launch();try{await site(b);}catch(e){T.check(false,'тест упав: '+(e&&e.stack||e).toString().slice(0,400));}await b.close();process.exit(T.done());})();
