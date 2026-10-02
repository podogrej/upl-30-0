// Сторінка гравця (0.59): своя без входу (попередження), своя з входом (Telegram), чужа (?u=… і тап по імені в таблиці),
// правила імені (лише латиниця) й повідомлення (довжина, символи, краї, мат, зайняте, «раз на 30 днів»), поле вводу (малі літери, «_»), шафа трофеїв (рідкість, фільтр, «нещодавні»),
// видалення акаунта, ім'я в табло ліги з профілю гравця (api/league.js), список мату однаковий у трьох місцях.
// База — у пам'яті (_site.js), SQL-частину перевіряє bash tools/tests/setup.sh. Знімки 390 px: tools/tests/out/player_page_059_*.png
// Запуск з кореня: node tools/tests/player_page.js
const path=require('path'),fs=require('fs');const {ROOT,launch,makeDB,callApi,openSite,checker}=require('./_site.js');
const openSet=p=>p.evaluate(()=>{const d=document.getElementById('ppSet');if(d)d.open=true;});   // 0.62: «Налаштування» згорнуто
const OUT=path.join(ROOT,'tools','tests','out'),MOCK=OUT;   // 0.67.1: знімки — у tools/tests/out (раніше перезаписували docs/mockups при кожному прогоні)
fs.mkdirSync(OUT,{recursive:true});
process.env.SUPABASE_SERVICE_KEY='svc';
const T=checker('сторінка гравця');
// ---------- список мату: data/names/blocklist.txt = sql/v059_player_page.sql = sql/v059_name_conflicts.sql = src/account.js
{const txt=fs.readFileSync(path.join(ROOT,'data','names','blocklist.txt'),'utf8').split('\n').map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
 const arr=src=>JSON.stringify(((src.match(/'[^']+'/g))||[]).map(s=>s.slice(1,-1)));
 const sql=fs.readFileSync(path.join(ROOT,'sql','v059_player_page.sql'),'utf8'),acc=fs.readFileSync(path.join(ROOT,'src','account.js'),'utf8');
 const inSql=/array\[([\s\S]*?)\]\) b where/.exec(sql.slice(sql.indexOf('function public.name_blocked')))[1],inJs=/const NAME_BAD=\[([\s\S]*?)\];/.exec(acc)[1];
 const conf=fs.readFileSync(path.join(ROOT,'sql','v059_name_conflicts.sql'),'utf8'),inConf=/unnest\(array\[([\s\S]*?)\]\) b/.exec(conf)[1];
 T.check(arr(inSql)===JSON.stringify(txt)&&arr(inJs)===JSON.stringify(txt)&&arr(inConf)===JSON.stringify(txt),`список мату однаковий: файл ${txt.length}, SQL, конфлікти, account.js`);}
const TODAY=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
// ---------- база в пам'яті: гравці з public_id, правила імені як у name_clean/set_player_name (скорочено)
function mkDB(){
  const players=[{id:'p-v',name:'vitia',anon_name:'brave_fox',public_id:'vitya234'},{id:'p-a',name:'andrii',anon_name:'calm_owl',public_id:'andr2345'}];
  const links={};let n=0;const calls=[];
  const forDevice=d=>{let l=links[d];if(!l){const p={id:'p-'+(++n),name:null,anon_name:'silent_owl',public_id:'mepl'+String.fromCharCode(97+n).repeat(4)};players.push(p);l=links[d]={pid:p.id,secret:null};}return l;};
  const err=(status,code,message)=>({status,body:JSON.stringify({code,message})});
  const check=a=>{if(!a.p_device||String(a.p_secret||'').length<16)return {e:err(400,'22023','device?')};const l=forDevice(a.p_device);if(l.secret==null)l.secret=a.p_secret;else if(l.secret!==a.p_secret)return {e:err(401,'28000','device secret')};return {p:players.find(p=>p.id===l.pid)};};
  const js=p=>({id:p.id,name:p.name||null,anon_name:p.anon_name,public_id:p.public_id,name_next:p.next||null,contact_email:p.email||null,news_optin:!!p.optin});   // пошта для новин — з 0.60
  const key=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,'_');
  const TRANSLIT={'олег':'oleh'};   // name_translit у базі (перевіряє setup.sh); тут — лише потрібне тесту
  const rpc={
    player_hello:a=>{const c=check(a);return c.e||js(c.p);},device_ok:a=>{const c=check(a);return c.e||c.p.id;},
    set_player_name:a=>{calls.push(['set_player_name',a.p_name]);const c=check(a);if(c.e)return c.e;const nm=key(a.p_name)||null;
      if(nm&&(nm.length<3||nm.length>20))return err(400,'22023','name_len');
      if(nm===key(c.p.name))return js(c.p);
      if(c.p.next&&c.p.next>new Date().toISOString())return err(400,'22023','name_wait:'+c.p.next.slice(0,10));
      if(nm&&players.some(p=>p!==c.p&&key(p.name)===nm))return err(409,'23505','name_taken');
      if(c.p.name)c.p.next=new Date(Date.now()+30*864e5).toISOString();c.p.name=nm;return js(c.p);},
    set_player_auto_name:a=>{calls.push(['set_player_auto_name',a.p_raw]);const c=check(a);if(c.e)return c.e;const b=TRANSLIT[key(a.p_raw)]||key(a.p_raw);
      if(!c.p.name&&/^[a-z0-9._]{3,20}$/.test(b)){let v=b,k=1;while(players.some(p=>p!==c.p&&p.name===v))v=b+(++k);c.p.name=v;}return js(c.p);},
    delete_player:a=>{calls.push(['delete_player']);const c=check(a);if(c.e)return c.e;c.p.name=null;c.p.deleted=true;for(const k in links)if(links[k].pid===c.p.id)delete links[k];return {ok:true};},
    trophy_stats:()=>({players:50,t:{champ:30,top3:5,unbeaten:1,perfect:0}}),
    player_profile:a=>prof(players.find(p=>p.id===a.p_player)),
    player_profile_pub:a=>prof(players.find(p=>p.public_id===a.p_public))};
  const db=makeDB({seasons:{auto:'id'},season_seeds:{auto:'id'},daily_results:{auto:'id'},player_links:{},league_results:{},leagues:{},league_members:{}},rpc);
  db.DB.players=players;
  function prof(p){if(!p)return null;if(p.deleted)return {public_id:p.public_id,name:p.anon_name,anon:true,deleted:true};
    const s=db.DB.seasons.filter(x=>x.player_id===p.id&&!x.practice);const cl=s.filter(x=>x.format==='classic').sort((a,b)=>b.pts-a.pts);
    const row=x=>x&&{id:x.id,pts:x.pts,w:x.w,d:x.d,l:x.l,place:x.place,formation:x.formation,mode:x.mode,club:null,day:null,at:'2026-09-20',avg:81.4};
    return {public_id:p.public_id,name:key(p.name||p.anon_name),anon:!p.name,since:'2026-09-02T10:00:00Z',seasons:s.length,champions:s.filter(x=>x.place===1).length,perfect:s.filter(x=>x.w===30).length,
      best_classic:cl.length?cl[0].pts:null,win_pct:s.length?Math.round(100*s.reduce((a,x)=>a+x.w,0)/(30*s.length)):null,best:cl.length?{classic:row(cl[0])}:{},worst:cl.length>1?{classic:row(cl[cl.length-1])}:{},
      fav_club:s.length?{c:'Чорноморець (Одеса)',k:30,pct:27}:null,fav_player:s.length?{id:'x',n:'Іван Гецко',k:11}:null,
      trophies:p.id==='p-v'?[{id:'money',at:'2026-09-25'},{id:'champ',at:'2026-09-20'},{id:'top3',at:'2026-09-19'}]:[],streak_best:p.id==='p-v'?9:0,streak_now:0};}
  const season=(id,pid,pts,w,d,l,place,extra)=>({id,player_id:pid,device_id:'00000000-0000-4000-a000-00000000000'+(id%10),nickname:'Вітя-копія',format:'classic',mode:'normal',formation:'4-4-2',w,d,l,pts,place,gf:60,ga:30,gd:30,
    verified:true,practice:false,competition:'upl',created_at:'2026-09-2'+(id%10)+'T10:00:00Z',xi:[],tbl:[],...extra});
  db.DB.seasons.push(season(901,'p-v',77,24,5,1,1),season(902,'p-v',61,18,7,5,4));
  global.fetch=db.fetch;
  return {db,players,links,calls};}
const tr={t:{champ:{n:3,at:'2026-09-10'},top3:{n:1,at:'2026-09-28'},unbeaten:{n:1,at:'2026-09-20'},ms1:{n:1,at:'2026-09-01'},ms5:{n:1,at:'2026-09-05'}},seasons:7,dailies:2};
const INIT=`try{if(!localStorage.getItem('upl30_tr')){localStorage.setItem('upl30_tr',${JSON.stringify(JSON.stringify(tr))});localStorage.setItem('upl30_streak',${JSON.stringify(JSON.stringify({last:'2026-09-01',count:4,best:4}))});localStorage.setItem('upl30_news_seen','"9.99"');}}catch(e){}`;
const order=pg=>pg.$$eval('#ppCab .tro.on[data-tr]',es=>es.map(e=>e.dataset.tr));
(async()=>{
 const b=await launch();const M=mkDB();const {db}=M;
 const api={'/api/save':async req=>callApi(require(path.join(ROOT,'api','save.js')),req.body),'/api/auth':async()=>({json:{token_hash:'TH'}})};
 // ===== 1. своя сторінка без входу
 const A=await openSite({b,db,api,init:INIT,viewport:{width:390,height:844},wait:1500});const pg=A.pg;
 T.check(await pg.$eval('#acctBtn',e=>!e.hidden&&!!e.querySelector('svg.av')&&e.title==='Моя сторінка'),'у шапці — аватарка «Моя сторінка» замість «Увійти»');
 await pg.locator('header.top').screenshot({path:path.join(OUT,'pp_header.png')});
 await pg.click('#acctBtn');await pg.waitForTimeout(700);
 T.check(await pg.$eval('#s6',e=>!e.hidden)&&await pg.$eval('#s1',e=>e.hidden),'аватарка відкриває свою сторінку');
 T.check((await pg.textContent('#ppName'))==='silent_owl'&&!!(await pg.$('.pp-warn'))&&/лише на цьому пристрої/.test(await pg.textContent('.pp-warn')),'без входу: анонімне ім\'я й попередження «лише на цьому пристрої»');
 const tiles=await pg.$$eval('.pp-tiles .tile',ts=>ts.map(t=>t.innerText.replace(/\s+/g,' ')));const rest=await pg.textContent('.pp-rest');
 T.check(tiles.length===3&&/сезон/.test(tiles[0])&&/чемпіонств/.test(tiles[1])&&/серія драфту дня: 4/.test(rest),'3 великі цифри + рядок (0.62): '+tiles.join(' | ')+' · '+rest);
 // шафа: рідкість
 await pg.waitForTimeout(300);
 T.check(JSON.stringify(await order(pg))===JSON.stringify(['unbeaten','top3','champ']),'сортування «за рідкістю»: '+(await order(pg)).join(','));
 T.check(await pg.$eval('#ppCab .tro[data-tr="unbeaten"]',e=>e.classList.contains('rt-epic')&&/Епічний · є в 2% гравців/.test(e.textContent))
   &&await pg.$eval('#ppCab .tro[data-tr="top3"]',e=>e.classList.contains('rt-rare'))&&await pg.$eval('#ppCab .tro[data-tr="champ"]',e=>/Звичайний/.test(e.textContent)),'рівні рідкості: епічний 2%, рідкісний 10%, звичайний 60%');
 T.check(await pg.$$eval('#ppCab .tro.sec.rt-legend, #ppCab .tro.sec.rt-epic, #ppCab .tro.sec.rt-rare',e=>e.length)===0,'секретні трофеї без рівня рідкості');
 await pg.click('#ppCabAll');await pg.waitForTimeout(100);   // 0.62: фільтри й сортування — за «Усі трофеї»
 await pg.click('#ppCab [data-s="recent"]');await pg.waitForTimeout(100);
 T.check(JSON.stringify(await order(pg))===JSON.stringify(['top3','unbeaten','champ']),'«Нещодавні»: '+(await order(pg)).join(','));
 const catOf=await pg.evaluate(()=>Object.fromEntries(window.__dbg.TROPHIES.map(t=>[t.id,t.cat])));
 await pg.click('#ppCab [data-f="season"]');await pg.waitForTimeout(100);
 const shown=await pg.$$eval('#ppCab .tro[data-tr]',es=>es.map(e=>e.dataset.tr));const chip=await pg.textContent('#ppCab [data-f="season"]');
 T.check(shown.length>0&&shown.every(id=>catOf[id]==='season')&&/Сезон \d+\/\d+/.test(chip),`фільтр «Сезон»: ${shown.length} карток, «${chip}»`);
 await pg.click('#ppCab [data-f="all"]');await pg.click('#ppCab [data-s="rare"]');
 // ім'я: правила й повідомлення
 const rename=async v=>{await openSet(pg);await pg.fill('#ppNameIn',v);await pg.click('#ppNameSave');await pg.waitForTimeout(300);return pg.textContent('#ppNameMsg');};
 T.check(/від 3 до 20/.test(await rename('ab')),'ім\'я з 2 символів — «від 3 до 20»');
 T.check(/Лише латинські літери a–z, цифри, «_» і «\.»/.test(await rename('андрій')),'кирилиця — «Лише латинські літери a–z, цифри, «_» і «.»»');
 T.check(/Починається й закінчується літерою або цифрою/.test(await rename('andrii_')),'«_» у кінці — «Починається й закінчується…»');
 T.check(/не підходить/.test(await rename('Super Hui')),'мат (латиницею) — «Таке ім\'я не підходить»');
 await openSet(pg);await pg.fill('#ppNameIn','Serhii Sh');T.check((await pg.inputValue('#ppNameIn'))==='serhii_sh','поле вводу: одразу малі літери й «_» замість пробілу');
 const nCalls=M.calls.filter(c=>c[0]==='set_player_name').length;
 T.check(/вже зайняте/.test(await rename('ANDRII')),'зайняте (без урахування регістру) — «Це ім\'я вже зайняте»');
 T.check(M.calls.filter(c=>c[0]==='set_player_name').length===nCalls+1,'помилки правил ловить сайт, до бази йде лише перевірка зайнятості');
 T.check(/Збережено: serhii_sh/.test(await rename('Serhii Sh'))&&(await pg.textContent('#ppName'))==='serhii_sh','нове ім\'я «Serhii Sh» → «serhii_sh» у заголовку');
 T.check(/Збережено: petro/.test(await rename('petro')),'перша зміна вже вибраного імені — «petro» (перше ім\'я з анонімного відлік не запускає)');
 T.check(/Змінити ім'я знову можна з \d+ \S+ 20\d\d/.test(await rename('ivan.k')),'друга зміна — «Змінити ім\'я знову можна з …»');
 // історія
 const me=M.players.find(p=>p.public_id&&p.public_id.startsWith('mepl'));
 db.DB.seasons.push({id:950,player_id:me.id,device_id:'x',format:'classic',mode:'normal',formation:'4-3-3',w:20,d:5,l:5,pts:65,place:2,gf:50,ga:30,verified:true,practice:false,competition:'upl',created_at:'2026-09-29T10:00:00Z',xi:[],tbl:[]});
 await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.click('#acctBtn');await pg.waitForTimeout(600);
 await pg.click('#ppHist summary');await pg.waitForTimeout(400);
 T.check(/Останні сезони \(1 з 1\)/.test(await pg.textContent('#ppHist summary'))&&(await pg.$$('#ppHistList .pp-row')).length===1,'«Останні сезони (1 з 1)» розгортаються за тапом');
 T.check(/Класика.*найкращий/.test((await pg.textContent('.pp-list')).replace(/\s+/g,' ')),'«Найкращий і найгірший XI»: класика');
 await pg.screenshot({path:path.join(MOCK,'player_page_059_guest.png'),fullPage:true});
 // таблиця → чужа сторінка
 await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.click('#boardOpen');await pg.waitForTimeout(700);
 const links=await pg.$$eval('#boardBody a.plink',as=>as.map(a=>a.textContent+'→'+a.dataset.u));
 T.check(links.includes('vitia→vitya234')&&links.includes('petro→'+me.public_id),'таблиця: імена з профілю, нижній регістр, посилання: '+links.join(', '));
 await pg.click('#boardBody a[data-u="vitya234"]');await pg.waitForTimeout(700);
 const url=await pg.evaluate(()=>location.search);
 T.check(await pg.$eval('#viewBox',e=>e.hidden)&&(await pg.textContent('#ppName'))==='vitia'&&/[?&]u=vitya234/.test(url),'тап по імені → сторінка «vitia», адреса '+url);
 T.check(!(await pg.$('#ppNameIn'))&&!(await pg.$('.pp-warn'))&&/Історію сезонів бачить лише vitia/.test(await pg.textContent('.pp-lock')),'чужа: без налаштувань і попередження, історію не видно');
 T.check(await pg.$$eval('#ppCab .tro.on.sec',es=>es.length===1&&/Секретний трофей/.test(es[0].textContent)&&!/Гроші/.test(es[0].textContent)),'чужий секретний трофей, якого в мене немає, — без назви');
 T.check(/Чорноморець/.test(await pg.textContent('.pp-fav'))&&(await pg.$$eval('.pp-tiles .tile b',bs=>bs.map(b=>b.textContent))).slice(0,3).join()==='2,1,77','чужа: плитки 2 сезони, 1 чемпіонство, 77 очок; улюблений клуб');
 await pg.screenshot({path:path.join(MOCK,'player_page_059_other.png'),fullPage:true});
 await pg.click('#homeBtn');await pg.waitForTimeout(200);T.check(!/u=/.test(await pg.evaluate(()=>location.search)),'«Головна» прибирає ?u= з адреси');
 T.check(!A.errs.length,'без входу: помилок на сторінці немає '+A.errs.join(' | '));
 // ===== 2. пряме посилання ?u=… і невідомий гравець
 const B=await openSite({b,db,api,query:'?u=vitya234',wait:1500});
 T.check(await B.pg.$eval('#s6',e=>!e.hidden)&&(await B.pg.textContent('#ppName'))==='vitia','посилання ?u=vitya234 відкриває сторінку гравця');
 await B.pg.close();
 const C=await openSite({b,db,api,query:'?u=zzzzzzzz',wait:1500});T.check(/Такого гравця немає/.test(await C.pg.textContent('#pp')),'невідомий ?u= — «Такого гравця немає»');await C.pg.close();
 // ===== 3. своя з входом (Telegram Mini App) і видалення акаунта
 const tg={initData:'user=x&hash=abc',initDataUnsafe:{user:{id:7,first_name:'Олег'}},colorScheme:'dark',platform:'android'};
 const D=await openSite({b,db,api,tg,hash:'#tgWebAppData=x',init:INIT,viewport:{width:390,height:844},wait:2000});
 await D.pg.click('#acctBtn');await D.pg.waitForTimeout(700);
 T.check((await D.pg.textContent('#ppName'))==='oleh'&&!(await D.pg.$('.pp-warn'))&&/Увійшов через Telegram/.test(await D.pg.textContent('.pp-acct')),'з входом: ім\'я з Telegram «Олег» → «oleh» (транслітерує база), без попередження, «Вийти»');
 await D.pg.screenshot({path:path.join(MOCK,'player_page_059_own.png'),fullPage:true});
 await openSet(D.pg);await D.pg.click('#ppDel');T.check(await D.pg.$eval('#ppDelBox',e=>!e.hidden),'«Видалити акаунт…» питає підтвердження');
 await D.pg.locator('.pp-acct').screenshot({path:path.join(OUT,'pp_delete.png')});
 await D.pg.click('#ppDelYes');await D.pg.waitForTimeout(600);
 const left=await D.pg.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('upl30_')));
 T.check(M.calls.some(c=>c[0]==='delete_player')&&/Акаунт видалено/.test(await D.pg.textContent('#pp'))&&!left.includes('upl30_player')&&!left.includes('upl30_tr'),'видалено: RPC delete_player, локальні дані стерто (лишилось: '+left.join(',')+')');
 T.check(!D.errs.length,'з входом: помилок на сторінці немає '+D.errs.join(' | '));
 // ===== 4. табло ліги: ім'я з профілю гравця за прив'язкою Telegram (api/league.js)
 db.DB.leagues.push({chat_id:-1,title:'Офіс'});
 db.DB.league_results.push({chat_id:-1,day:TODAY,tg_user_id:555,name:'Vitya TG',w:24,d:5,l:1,pts:77,gf:60,ga:30,created_at:'x',season_id:901},{chat_id:-1,day:TODAY,tg_user_id:556,name:'Без профілю',w:20,d:5,l:5,pts:65,gf:50,ga:30,created_at:'y',season_id:902});
 Object.assign(db.DB.seasons.find(s=>s.id===901),{day:TODAY,tg_user_id:555});Object.assign(db.DB.seasons.find(s=>s.id===902),{day:TODAY,tg_user_id:556});
 db.DB.player_links.push({kind:'tg',key:'555',player_id:'p-v'});
 const lg=await callApi(require(path.join(ROOT,'api','league.js')),null,'GET',{chat:'-1'});
 const names=(lg.json.today||[]).map(r=>r.name+(r.u?'@'+r.u:''));
 T.check(names.join()==='vitia@vitya234,Без профілю','табло ліги: '+names.join(', '));
 await b.close();process.exit(T.done());})();
