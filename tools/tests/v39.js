// End-to-end: site in a browser, in-memory DB (emulates players.sql: player_hello/set_player_name, player_id per device),
// /api/seed, /api/save and /api/verify are the real api/ handlers on the same DB (new: season written via /api/save; old: no device-secret SQL, fallback path).
//  new - DB with players.sql: player name, season with player_id/competition/data_version, server verification, 11x11 board, rename;
//  old - DB before players.sql (new site before SQL is applied): game still works, season saved without new columns, board via fallback query.
// SQL part (device secret, triggers, RLS, re-run) is covered by real Postgres: bash tools/tests/setup.sh
// Run from repo root: node tools/tests/v39.js [new|old|both] (default both)
const path=require('path'),fs=require('fs');const {ROOT,launch,makeDB,callApi,openSite,draftSeason,checker}=require('./_site.js');
const openSet=async p=>{if(!(await p.$('#ppSheet'))){await p.click('#ppRowName');await p.waitForTimeout(150);}};   // Settings are rows; the name is edited in a bottom sheet
const setMsg=p=>p.evaluate(()=>(document.getElementById('ppNameMsg')||document.getElementById('ppSetMsg')||{}).textContent||'');   // error shows in the sheet, success under the settings
const OUT=path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
process.env.SUPABASE_SERVICE_KEY='svc';
const seedH=require(path.join(ROOT,'api','seed.js')),verH=require(path.join(ROOT,'api','verify.js')),saveH=require(path.join(ROOT,'api','save.js'));
const OLD_COLS='device_id,nickname,mode,format,club,formation,year,seed,version,w,d,l,pts,place,gf,ga,xp,xg,xga,tier,golden,perfect,practice,day,xi,tbl,seed_id,verified,verify_note,user_id,tg_user_id,tg_name'.split(',');
function mkDB(v39){
  const P={players:[],links:{}};let pn=0;
  const forDevice=d=>{let l=P.links[d];if(!l){const p={id:'p-'+(++pn),name:null,anon_name:['silent_owl','brave_fox','quiet_lynx'][pn%3]};P.players.push(p);l=P.links[d]={pid:p.id,secret:null};}return l;};
  const check=(a)=>{if(!a.p_device||String(a.p_secret||'').length<16)return {err:{status:400,body:JSON.stringify({code:'22023',message:'device?'})}};
    const l=forDevice(a.p_device);if(l.secret==null)l.secret=a.p_secret;else if(l.secret!==a.p_secret)return {err:{status:401,body:JSON.stringify({code:'28000',message:'device secret'})}};return {p:P.players.find(p=>p.id===l.pid)};};
  const js=p=>({id:p.id,name:p.name,anon_name:p.anon_name});
  const rpc=v39?{player_hello:a=>{const c=check(a);return c.err||js(c.p);},
    device_ok:a=>{const c=check(a);return c.err||c.p.id;},   // /api/save and /api/seed check the device secret
    set_player_name:a=>{const c=check(a);if(c.err)return c.err;const nm=String(a.p_name||'').trim()||null;if(nm&&(nm.length<2||nm.length>24))return {status:400,body:'{"code":"22023"}'};c.p.name=nm&&nm.toLowerCase().replace(/\s+/g,'_');return js(c.p);}}:{};
  const db=makeDB({seasons:{auto:'id',cols:v39?null:OLD_COLS,onInsert:r=>{if(v39){r.player_id=forDevice(r.device_id).pid;r.competition=r.competition||'upl';r.gd=r.gf-r.ga;}r.verified=null;}},season_seeds:{auto:'id'},daily_results:{auto:'id'}},rpc);
  if(v39)db.DB.players=P.players;
  global.fetch=db.fetch;   // for api/seed and api/verify
  return {db,P};}
const api={'/api/seed':async req=>callApi(seedH,req.body),'/api/verify':async req=>callApi(verH,req.body),'/api/save':async req=>callApi(saveH,req.body)};
async function run(MODE,b){const T=checker('v39 '+MODE);const v39=MODE==='new';const {db,P}=mkDB(v39);const DB=db.DB;
 const {pg,errs,log}=await openSite({b,db,api,viewport:{width:430,height:900},wait:1500});
 const player=await pg.evaluate(()=>JSON.parse(localStorage.getItem('upl30_player')||'null'));
 const board=async()=>{await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.click('#boardOpen');await pg.waitForTimeout(700);
   return pg.$$eval('#boardBody tr[data-q]',trs=>trs.map(t=>(t.className==='me'?'* ':'  ')+t.children[1].innerText.split('\n')[0]));};
 if(v39){
  T.check(player&&player.id===P.players[0].id&&player.anon_name,'гравець після завантаження: '+JSON.stringify(player));
  await pg.click('#acctBtn');await pg.waitForTimeout(400);   // avatar -> own page with name settings
  await openSet(pg);T.check(await pg.$eval('#ppNameIn',e=>e.placeholder)===player.anon_name&&/Поки ти в таблицях як/.test(await pg.textContent('#ppNameMsg')),'своя сторінка: поле імені з анонімним «'+player.anon_name+'»');
  await pg.screenshot({path:path.join(OUT,'v39_acct.png')});
  await openSet(pg);await pg.fill('#ppNameIn','Andrii');await pg.click('#ppNameSave');await pg.waitForTimeout(500);
  T.check(/Збережено: andrii/.test(await setMsg(pg))&&P.players[0].name==='andrii','ім\'я збережено в профілі гравця (нижній регістр)');await pg.click('#homeBtn');
 }else{
  T.check(!player,'без players.sql гравця немає, сайт працює');
  await pg.click('#acctBtn');await pg.waitForTimeout(400);T.check(!(await pg.$('#ppNameIn')),'своя сторінка без поля імені');await pg.click('#homeBtn');
 }
 // free play, Hard
 await pg.click('#freeOpen');const hdrName=await pg.$eval('#acctBtn',e=>e.hidden?'':(e.querySelector('.me-n')||{}).textContent||'');
 T.check(v39?hdrName==='andrii':!hdrName,'шапка (0.62, замість рядка імені в налаштуваннях): '+(v39?'«andrii» поруч з аватаркою':'без імені')+' — «'+hdrName+'»');
 await pg.click('#formats .opt[data-fmt="classic"]');await pg.click('#modes .opt:nth-child(2)');await pg.click('#startBtn');await draftSeason(pg);await pg.waitForTimeout(1500);
 const ver=await pg.$eval('#verLine',e=>e.hidden?'':e.textContent);T.check(/перевірено сервером/.test(ver),'«Результат перевірено сервером»');
 const row=DB.seasons[DB.seasons.length-1]||{};
 T.check(v39?log.includes('POST /api/save')&&!log.includes('POST /api/verify'):log.includes('POST /api/save')&&log.includes('POST /api/verify'),v39?'сезон записав сервер (/api/save), не браузер':'SQL 0.53 немає — /api/save відповів 503, сезон записано напряму, як 0.52');
 T.check(row.mode==='hard'&&row.verified===true&&row.seed_id!=null&&row.verify_note!=null,`рядок seasons: mode ${row.mode}, verified ${row.verified}, seed_id ${row.seed_id}`);
 if(v39)T.check(row.player_id===player.id&&row.competition==='upl'&&/^d[0-9a-f]{8}$/.test(row.data_version)&&row.nickname==='andrii',`нові колонки: player_id ${row.player_id}, competition ${row.competition}, data_version ${row.data_version}`);
 else T.check(!('competition' in row)&&!('data_version' in row),'стара база: сезон записано без нових колонок');
 // 11x11 board
 let rows=await board();T.check(rows.length===1&&rows[0].startsWith('* ')&&(!v39||rows[0].includes('andrii')),'таблиця: мій рядок '+JSON.stringify(rows));
 await pg.screenshot({path:path.join(OUT,`v39_board_${MODE}.png`)});
 // board opened while still loading in background (cache entry without rows): no error, rows appear later
 {await pg.click('#viewClose');const e0=errs.length;await pg.evaluate(()=>{window.__dbg.boardStale();window.__dbg.boardPrefetch();document.getElementById('boardOpen').click();});
  await pg.waitForTimeout(800);const nr=await pg.$$eval('#boardBody tr[data-q]',e=>e.length);T.check(errs.length===e0&&nr>=1,'таблиця під час фонового завантаження: без помилки, рядки з\'явились ('+nr+(errs.length>e0?'; '+errs.slice(e0).join(' | '):'')+')');}
 // BOARD_FROM (global board reset): enabled -> old season hidden; disabled (current) -> all seasons
 {await pg.click('#viewClose');const old={...DB.seasons[DB.seasons.length-1],id:9999,nickname:'old_one',created_at:'2026-09-01T10:00:00Z',pts:90};DB.seasons.push(old);
  const r2=await board(),bf=await pg.evaluate(()=>window.__dbg.BOARD_FROM),bt=await pg.textContent('#boardBody');
  T.check(bf?r2.length===1&&/Сезони з /.test(bt):r2.length===2&&!/Сезони з /.test(bt),'0.69: BOARD_FROM '+(bf?'увімкнено — старого сезону немає, є «Сезони з …»':'вимкнено — у таблиці всі сезони, без підпису'));
  DB.seasons.pop();await pg.click('#viewClose');await board();}
 T.check(await pg.evaluate(()=>{const t=document.querySelector('#viewBody .tabs');return !document.querySelector('[data-board="anti"]')&&!!document.querySelector('[data-board="oneclub"]')&&t&&!t.hidden;}),'0.67: вкладки «Антисезон» немає, є «Один клуб» (режим повернуто)');
 await pg.click('#boardBody tr.me');await pg.waitForTimeout(500);
 T.check(!!(await pg.$('#viewBack'))&&!!(await pg.$('#viewBody .slot')),'рядок відкриває сезон із кнопкою «До таблиці»');
 await pg.click('#viewBack');await pg.waitForTimeout(500);T.check((await pg.$$('#boardBody tr[data-q]')).length===1,'«До таблиці» повертає таблицю');await pg.click('#viewClose');
 if(v39){
  T.check(/\S/.test(await pg.textContent('#acctBtn .me-n')),'шапка: поруч з аватаркою — ім\'я (0.62)');await pg.click('#acctBtn');await pg.waitForTimeout(400);T.check(await pg.$eval('#s6',e=>!e.hidden),'аватарка з ім\'ям у шапці відкриває свою сторінку');
  await openSet(pg);await pg.fill('#ppNameIn','Andriy 2');await pg.click('#ppNameSave');await pg.waitForTimeout(500);
  rows=await board();T.check(rows[0]==='* andriy_2','перейменування на своїй сторінці → у таблиці «andriy_2»: '+rows[0]+' · '+await pg.evaluate(()=>(document.getElementById('ppNameMsg')||{}).textContent));await pg.click('#viewClose');
  await pg.click('#acctBtn');await pg.waitForTimeout(300);await openSet(pg);await pg.fill('#ppNameIn','');await pg.click('#ppNameSave');await pg.waitForTimeout(500);
  T.check(/ти знову/.test(await setMsg(pg)),'порожнє ім\'я — знову анонімний');await pg.click('#homeBtn');
  rows=await board();T.check(rows[0]==='* '+player.anon_name.toLowerCase(),'у таблиці анонімне ім\'я: '+rows[0]);await pg.click('#viewClose');
  // 'Andriy 2' -> the field turns it into 'andriy_2'
  // foreign device (same device_id, other secret) cannot rename; the DB enforces the secret, emulated here; real check in setup.sh
 }
 T.check(!errs.length,'помилок на сторінці немає '+errs.join(' | '));
 return T.done();}
(async()=>{const want=process.argv[2]||'both';const b=await launch();let bad=0;
 for(const m of ['new','old'])if(want===m||want==='both')bad+=await run(m,b);
 await b.close();console.log(bad?'v39: ПРОБЛЕМИ':'v39: УСЕ ГАРАЗД');process.exit(bad?1:0);})();
