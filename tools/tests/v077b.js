// Chat league card on Home (Telegram Mini App) and its "full table" sheet; loading speed of the card and /api/league.
// A. server: same output as before for a fixture, fewer sequential DB rounds, card=1 without standings, cache header, join still checks membership.
// B. site: skeleton (or cached board) in the first frame before the main script, no layout shift, GET does not wait for the join POST,
//    join skipped for 24 h, retry after an error, column header / own row / 48 px button, sheet header and lazy standings, 403 and migration.
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
  // result to several leagues: written in parallel, titles in the same order
  const res={w:20,d:5,l:5,pts:65,gf:50,ga:30,place:2,day:DAY,season_id:5};
  const my=[{chat_id:'-1',leagues:{title:'A'}},{chat_id:'-2',leagues:{title:'B'}},{chat_id:'-3',leagues:{title:'C'}}];
  const f0=global.fetch;global.fetch=(u,o)=>/league_members\?tg_user_id/.test(decodeURIComponent(String(u)))?wait(20).then(()=>({ok:true,status:200,text:async()=>JSON.stringify(my)})):f0(u,o);
  const p=await F.run({method:'POST',body:{initData:initData({id:1001,first_name:'Марко'},''),result:res}});global.fetch=f0;
  const ins=p.log.filter(c=>/^POST league_results/.test(c.k));
  T.check(p.c===200&&JSON.stringify(p.j.posted)==='["A","B","C"]'&&ins.length===3&&Math.max(...ins.map(c=>c.s))-Math.min(...ins.map(c=>c.s))<15,'сервер: результат у кілька ліг — паралельно, порядок назв збережено');
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
// card state recorder (init script): first visible state, whether the main script / player pool had run, heights
const REC=`(()=>{window.__lg={};const f=window.fetch;window.fetch=function(u,o){if(String(u).includes('/api/league'))(window.__req=window.__req||[]).push([(o&&o.method)||'GET',Math.round(performance.now())]);return f.apply(this,arguments);};
  new MutationObserver(()=>{const e=document.getElementById('leagueCard');if(!e||e.hidden||window.__lg.first)return;
    window.__lg.first={t:Math.round(performance.now()),pool:!!window.__POOL,main:!!window.__dbg,sk:e.querySelectorAll('tbody .sk.lg-sq').length,busy:!!e.querySelector('[role=status][aria-busy=true]'),data:!!e.querySelector('td.nm .nmt'),h:Math.round(e.getBoundingClientRect().height)};}).observe(document,{subtree:true,childList:true,attributes:true});})();`;
const cardGeo=pg=>pg.evaluate(()=>{const e=document.getElementById('leagueCard'),r=e.getBoundingClientRect(),n=e.nextElementSibling;let x=n;while(x&&(x.tagName==='SCRIPT'||x.hidden))x=x.nextElementSibling;
  return {h:Math.round(r.height),top:Math.round(r.top+scrollY),next:x?Math.round(x.getBoundingClientRect().top+scrollY):null,sk:e.querySelectorAll('.sk').length,data:!!e.querySelector('td.nm .nmt')};});
const shot=(pg,n)=>pg.screenshot({path:path.join(OUT,`v077b_${n}.png`)});
const toCard=pg=>pg.evaluate(()=>{const e=document.getElementById('leagueCard');e.scrollIntoView({block:"start"});window.scrollBy(0,-76);});
const poolSlow=ms=>async(r,u)=>{if(/^\/pool\./.test(u.pathname))await wait(ms);return false;};

async function site(b){
  // 1. cold open from the group button: skeleton before the main script, then data with no layout shift; GET does not wait for POST
  {const A=leagueApi({getMs:300,postMs:450});
   const {ctx,pg,errs}=await openSite({b,db:makeDB({}),api:A.api,tg:tgObj('g-100555'),hash:tgHash('g-100555'),route:poolSlow(400),init:REC,viewport:{width:820,height:1180},wait:50});
   await pg.waitForSelector('#leagueCard td.nm .nmt',{timeout:8000});await wait(300);
   const f=await pg.evaluate(()=>window.__lg.first),g=await cardGeo(pg);
   T.check(f&&!f.pool&&!f.main&&f.sk===3&&f.busy&&!f.data,`перший кадр: скелетон 3 рядки (role=status, aria-busy) ще до пулу гравців і головного скрипта (${JSON.stringify(f)})`);
   T.check(f&&Math.abs(f.h-g.h)<=1,`без зсуву: висота скелетона ${f&&f.h} = висота картки з даними ${g.h}`);
   for(let i=0;i<40&&!(A.reqs.find(r=>r.m==='POST')||{}).e;i++)await wait(50);
   const get=A.reqs.find(r=>r.m==='GET'),post=A.reqs.find(r=>r.m==='POST');
   T.check(get&&post&&get.card==='1'&&!get.t&&get.s<=post.s&&get.e<post.e,`GET не чекає на POST вступу: GET ${get&&get.s}–${get&&get.e} мс, POST ${post&&post.s}–${post&&post.e} мс`);
   const pr=await pg.evaluate(()=>window.__req);T.check(pr&&pr[0][0]==='GET'&&pr[0][1]<(f?f.t+50:0)+400,`GET стартує з першого скрипта сторінки (${pr&&pr[0][1]} мс від початку)`);
   // header, column header, rows, button
   const c=await pg.evaluate(()=>{const e=document.getElementById('leagueCard'),q=s=>e.querySelector(s);const rows=[...e.querySelectorAll('tbody tr')];const btn=q('#leagueAll').getBoundingClientRect(),tb=q('table').getBoundingClientRect();
     return {kicker:q('.kicker').textContent,title:q('.ttl').textContent,pill:q('.lg-pill').textContent,th:[...e.querySelectorAll('thead th')].map(x=>x.textContent),
       rowH:Math.min(...rows.map(r=>r.getBoundingClientRect().height)),n:rows.length,medals:e.querySelectorAll('tbody .plc').length,btn:q('#leagueAll').textContent.replace(/\s+/g,' ').trim(),btnH:btn.height,btnW:Math.round(btn.width),tbW:Math.round(tb.width),
       go:!!document.getElementById('leagueGo'),ptsFs:parseFloat(getComputedStyle(q('td.p')).fontSize),nameFs:parseFloat(getComputedStyle(q('td.nm')).fontSize)};});
   T.check(c.kicker==='Ліга чату'&&c.title==='Футбол по середах'&&c.pill==='12 з 40 зіграли',`шапка: «${c.kicker}» · ${c.title} · «${c.pill}»`);
   T.check(c.th.join('|')==='#|Гравець|В-Н-П|Очки','заголовки колонок: '+c.th.join(' · '));
   T.check(c.n===3&&c.rowH>=44&&c.medals===3&&c.ptsFs>c.nameFs,`топ-3 з медалями, рядки ≥44 px (${c.rowH}), очки більші за ім'я (${c.ptsFs}>${c.nameFs})`);
   T.check(/^Уся таблиця · 40 ›$/.test(c.btn)&&c.btnH>=48&&Math.abs(c.btnW-c.tbW)<=1&&!c.go,`кнопка «${c.btn}» на всю ширину таблиці, ${c.btnH} px; дубля «Зіграти драфт дня» немає`);
   T.check(!errs.length,'помилок JS немає '+errs.join(' | '));
   // 2. second open within 24 h: no join request; board from the snapshot in the first frame, no shift
   A.reqs.length=0;A.t0=Date.now();await pg.reload();await pg.waitForSelector('#leagueCard td.nm .nmt');await wait(1200);
   const f2=await pg.evaluate(()=>window.__lg.first),g2=await cardGeo(pg);
   T.check(!A.reqs.some(r=>r.m==='POST')&&A.reqs.filter(r=>r.m==='GET').length===1,`повторне відкриття за добу: вступ не повторюється (${A.reqs.map(r=>r.m).join(',')})`);
   T.check(f2&&f2.data&&!f2.main&&f2.sk===0&&Math.abs(f2.h-g2.h)<=1,`повторне відкриття: у першому кадрі вже табло з кешу, без зсуву (${f2&&f2.h}→${g2.h})`);
   const jk=await pg.evaluate(()=>JSON.parse(localStorage.getItem('upl30_joined_-100555')));
   T.check(jk&&jk.u===1&&jk.chat==='-100555'&&Date.now()-jk.at<6e4,'upl30_joined_<чат>: {u, at, chat}');
   // older than a day or another Telegram user on this device: join again
   await pg.evaluate(()=>{const k='upl30_joined_-100555',j=JSON.parse(localStorage.getItem(k));j.at=Date.now()-25*36e5;localStorage.setItem(k,JSON.stringify(j));});
   A.reqs.length=0;await pg.reload();await wait(1500);T.check(A.reqs.some(r=>r.m==='POST'),'через добу вступ повторюється');
   await pg.evaluate(()=>{const k='upl30_joined_-100555',j=JSON.parse(localStorage.getItem(k));j.u=2;localStorage.setItem(k,JSON.stringify(j));});
   A.reqs.length=0;await pg.reload();await wait(1500);T.check(A.reqs.some(r=>r.m==='POST'),'інший користувач Telegram на пристрої — вступ іде');
   await ctx.close();}
  // 3. start param only in Telegram.WebApp (no launch data in the URL): GET and POST start together
  {const A=leagueApi({getMs:300,postMs:450});
   const {ctx}=await openSite({b,db:makeDB({}),api:A.api,tg:tgObj('g-100555'),hash:'#tgWebAppData=x',viewport:{width:390,height:844},wait:1500});
   const get=A.reqs.find(r=>r.m==='GET'),post=A.reqs.find(r=>r.m==='POST');
   T.check(get&&post&&Math.abs(get.s-post.s)<100,`без даних у URL: GET і POST стартують разом (${get&&get.s} / ${post&&post.s} мс)`);await ctx.close();}
  // 4. error -> «Не вдалося завантажити · Спробувати ще» -> retry
  {const A=leagueApi({});A.fail=1;
   const {ctx,pg,errs}=await openSite({b,db:makeDB({}),api:A.api,tg:tgObj('g-100555'),hash:tgHash('g-100555'),viewport:{width:390,height:844},wait:1500});
   const e=await pg.evaluate(()=>{const c=document.getElementById('leagueCard'),r=document.getElementById('leagueRetry');return {hidden:c.hidden,txt:c.innerText.replace(/\s+/g,' '),h:r?r.getBoundingClientRect().height:0,alert:!!c.querySelector('[role=alert]')};});
   T.check(!e.hidden&&/Не вдалося завантажити · Спробувати ще/.test(e.txt)&&e.h>=44&&e.alert,`помилка: картка не зникає — «${e.txt.slice(-40)}», кнопка ${e.h} px`);
   await toCard(pg);await shot(pg,'error_phone390_dark');
   await pg.click('#leagueRetry');await pg.waitForSelector('#leagueCard td.nm .nmt',{timeout:5000}).catch(()=>{});
   T.check(await pg.$eval('#leagueCard',c=>c.querySelectorAll('tbody tr').length===3),'«Спробувати ще» завантажує табло');
   T.check(!errs.length,'помилок JS немає '+errs.join(' | '));await ctx.close();}
  // 5. own row lower than 3rd, played today; sheet: header, tabs, standings loaded on open (skeleton), cache bust only after own result
  {const A=leagueApi({today:board(true)});
   const init=`localStorage.setItem('upl30_player',JSON.stringify({id:'p1',name:'андрій',public_id:'andr2345'}));localStorage.setItem('upl30_daily_${DAY}',JSON.stringify({W:12,D:5,L:13,pts:41}));`;
   const {ctx,pg,errs}=await openSite({b,db:makeDB({}),api:A.api,tg:tgObj('g-100555'),hash:tgHash('g-100555'),init,viewport:{width:390,height:844},wait:1500});
   const c=await pg.evaluate(()=>{const e=document.getElementById('leagueCard'),rows=[...e.querySelectorAll('tbody tr')].map(r=>r.innerText.replace(/\s+/g,' ').trim());const me=e.querySelector('tr.me td');
     return {rows,me:e.querySelector('tr.me')?e.querySelector('tr.me').innerText.replace(/\s+/g,' '):'',accent:me?getComputedStyle(me).boxShadow:'',note:(e.querySelector('.lg-note')||{}).textContent||''};});
   T.check(c.rows.length===5&&c.rows[3]==='⋮'&&/^7 андрій · ти/.test(c.rows[4]),'головна: топ-3, «⋮», свій 7-й рядок «· ти»: '+c.rows.join(' | '));
   T.check(/inset/.test(c.accent)&&/3px/.test(c.accent),'свій рядок — акцент зліва ('+c.accent+')');
   T.check(/^Твій результат уже в табло\./.test(c.note),'рядок статусу: '+c.note);
   const cardReqs=A.reqs.filter(r=>r.m==='GET');T.check(cardReqs.length===1&&cardReqs[0].card==='1'&&!cardReqs[0].t,'головна бере лише card=1 (без заліку), без &t=');
   await toCard(pg);await shot(pg,'own_phone390_dark');
   A.hold(true);await pg.click('#leagueAll');await wait(700);
   const s1=await pg.evaluate(()=>({title:document.getElementById('viewTitle').textContent,fs:parseFloat(getComputedStyle(document.getElementById('viewTitle')).fontSize),sub:document.querySelector('#viewBody .lg-sub').textContent,
     th:[...document.querySelectorAll('#viewBody thead th')].map(x=>x.textContent).join('|'),n:document.querySelectorAll('#viewBody tbody tr').length,me:!!document.querySelector('#viewBody tr.me')}));
   const dd=DAY.slice(8,10)+'.'+DAY.slice(5,7);
   T.check(s1.title==='Футбол по середах'&&s1.fs>=24&&s1.sub===`Драфт дня ${dd} · зіграли 13 з 40`,`шторка: великий заголовок (${s1.fs}px), «${s1.sub}»`);
   T.check(s1.th==='#|Гравець|В-Н-П|Очки'&&s1.n===13&&s1.me,'шторка · Сьогодні: заголовки колонок, усі 13, свій рядок');
   await pg.click('#lgTabs button[data-t=st]');await wait(200);
   const sk=await pg.evaluate(()=>({sk:document.querySelectorAll('#viewBody tbody .sk').length,busy:!!document.querySelector('#viewBody [role=status][aria-busy=true]'),th:[...document.querySelectorAll('#viewBody thead th')].map(x=>x.textContent).join('|')}));
   T.check(sk.sk>0&&sk.busy&&sk.th==='#|Гравець|Днів|Перемог','шторка · Залік: поки вантажиться — скелетон з тими самими колонками');
   await shot(pg,'sheet_st_loading_phone390_dark');
   A.gate.release();await wait(500);
   const full=A.reqs.filter(r=>r.m==='GET'&&!r.card);
   T.check(full.length===1&&!full[0].t&&await pg.$$eval('#viewBody tbody tr',t=>t.length)===13&&!(await pg.$('#viewBody .sk')),'Залік підвантажено при відкритті шторки (повний запит без card=1), 13 рядків');
   await pg.click('#lgTabs button[data-t=today]');await wait(100);await pg.click('#lgTabs button[data-t=st]');await wait(100);
   T.check(A.reqs.filter(r=>r.m==='GET'&&!r.card).length===1,'повна таблиця запитується один раз за відкриття сторінки');
   await pg.click('#viewClose');await wait(500);
   T.check(!(await pg.$eval('#viewBox',e=>e.classList.contains('lgs'))),'після закриття шторки клас lgs знято');
   // own result posted -> card reloads bypassing the CDN cache (&t=), the full table too
   A.reqs.length=0;await pg.evaluate(()=>window.__dbg.leagueLoad('-100555',true));await wait(300);
   T.check(A.reqs.some(r=>r.card==='1'&&r.t),'після свого результату — card=1 з &t= (мимо кешу)');
   await pg.click('#leagueAll');await wait(500);T.check(A.reqs.some(r=>!r.card&&r.t&&r.m==='GET'),'і повна таблиця після свого результату — з &t=');
   await pg.click('#viewClose');await wait(400);
   T.check(!errs.length,'помилок JS немає '+errs.join(' | '));await ctx.close();}
  // 6. 403 (not confirmed as a group member): short note, join not remembered; supergroup migration
  {const A=leagueApi({post:()=>({status:403,json:{error:'not a member of this chat'}})});
   const {ctx,pg}=await openSite({b,db:makeDB({}),api:A.api,tg:tgObj('g-100555'),hash:tgHash('g-100555'),viewport:{width:390,height:844},wait:1500});
   const n=await pg.$eval('#leagueCard',e=>e.innerText.replace(/\s+/g,' '));
   T.check(/Ти ще не в цій лізі: відкрий гру кнопкою бота в групі\./.test(n)&&!(await pg.evaluate(()=>localStorage.getItem('upl30_joined_-100555'))),'403: коротка примітка, вступ не запамʼятовано');
   await pg.click('#leagueAll');await wait(500);T.check(/Ти ще не в цій лізі/.test(await pg.textContent('#viewBody')),'403: примітка і в шторці');await pg.click('#viewClose');await wait(300);
   await ctx.close();}
  {const A=leagueApi({post:()=>({json:{ok:true,joined:[{chat_id:'-100999',title:'Футбол по середах'}]}})});
   const {ctx,pg}=await openSite({b,db:makeDB({}),api:A.api,tg:tgObj('g-555'),hash:tgHash('g-555'),viewport:{width:390,height:844},wait:1500});
   const moved=A.reqs.find(r=>r.m==='GET'&&r.chat==='-100999');
   const st=await pg.evaluate(()=>({lg:JSON.parse(localStorage.getItem('upl30_league')),j:JSON.parse(localStorage.getItem('upl30_joined_-555'))}));
   T.check(moved&&moved.t&&st.lg==='-100999'&&st.j&&st.j.chat==='-100999','група стала супергрупою: табло з нового id (з &t=), id запамʼятовано');
   A.reqs.length=0;await pg.reload();await wait(1500);
   T.check(A.reqs.length&&A.reqs.every(r=>r.chat==='-100999'&&r.m==='GET'),'наступне відкриття зі старої кнопки — одразу новий id, без вступу: '+A.reqs.map(r=>r.m+' '+r.chat).join(', '));
   await ctx.close();}
  // 7. no league for the chat (404): the card disappears
  {const A=leagueApi({nolg:true});
   const {ctx,pg}=await openSite({b,db:makeDB({}),api:A.api,tg:tgObj('g-777'),hash:tgHash('g-777'),viewport:{width:390,height:844},wait:1500});
   T.check(await pg.$eval('#leagueCard',e=>e.hidden),'чат без ліги (404) — картки немає');await ctx.close();}
  // 8. wide screens: column at most 560 px; screenshots iPad 820/1024, landscape 1366, phone 390, dark and light
  const VPS={ipad820:[820,1180],ipad1024:[1024,1366],land1366:[1366,1024],phone390:[390,844]};
  for(const [k,[w,h]] of Object.entries(VPS))for(const th of ['dark','light']){
    const A=leagueApi({today:board(true)});A.hold();
    const init=`localStorage.setItem('upl30_theme','${th}');localStorage.setItem('upl30_player',JSON.stringify({id:'p1',name:'андрій',public_id:'andr2345'}));localStorage.setItem('upl30_daily_${DAY}',JSON.stringify({W:12,D:5,L:13,pts:41}));`;
    const {ctx,pg,errs}=await openSite({b,db:makeDB({}),api:A.api,tg:tgObj('g-100555',undefined,th),hash:tgHash('g-100555'),init,viewport:{width:w,height:h},colorScheme:th,wait:900});
    await toCard(pg);await shot(pg,`skeleton_${k}_${th}`);const g0=await cardGeo(pg);
    A.gate.release();await pg.waitForSelector('#leagueCard td.nm .nmt');await wait(400);await toCard(pg);await shot(pg,`home_${k}_${th}`);
    const m=await pg.evaluate(()=>{const e=document.getElementById('leagueCard');const t=e.querySelector('table').getBoundingClientRect(),c=e.getBoundingClientRect();return {tw:t.width,cw:c.width,sw:document.documentElement.scrollWidth,vw:innerWidth};});
    if(th==='dark')T.check(m.tw<=561&&m.sw<=m.vw,`${k}: таблиця ≤ 560 px (${Math.round(m.tw)} у картці ${Math.round(m.cw)}), нічого не вилазить`);
    await pg.click('#leagueAll');await wait(700);await shot(pg,`sheet_today_${k}_${th}`);
    await pg.click('#lgTabs button[data-t=st]');await wait(300);await shot(pg,`sheet_st_${k}_${th}`);
    if(th==='dark')T.check(!errs.length&&g0.sk>0,`${k}: скелетон на знімку, помилок JS немає `+errs.join(' | '));
    await ctx.close();}
}

(async()=>{await server();const b=await launch();try{await site(b);}catch(e){T.check(false,'тест упав: '+(e&&e.stack||e).toString().slice(0,400));}await b.close();process.exit(T.done());})();
