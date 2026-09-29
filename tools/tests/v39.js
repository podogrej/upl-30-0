// v0.39 наскрізно: сайт у браузері, база — у пам'яті (імітує players.sql: player_hello/set_player_name, player_id від пристрою),
// /api/seed і /api/verify — справжні обробники з api/ на тій самій базі.
//  new — база з players.sql: ім'я гравця, сезон з player_id/competition/data_version, перевірка сервером, таблиця 11×11, перейменування;
//  old — база до players.sql (нова версія сайту до запуску SQL): гра не ламається, сезон пишеться без нових колонок, таблиця — запасним запитом.
// SQL-частину (секрет пристрою, тригери, RLS, повторний запуск) перевіряє справжній Postgres: bash tools/tests/setup.sh
// Запуск з кореня: node tools/tests/v39.js [new|old|both] (за замовчуванням both)
const path=require('path'),fs=require('fs');const {ROOT,launch,makeDB,callApi,openSite,draftSeason,checker}=require('./_site.js');
const OUT=path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
process.env.SUPABASE_SERVICE_KEY='svc';
const seedH=require(path.join(ROOT,'api','seed.js')),verH=require(path.join(ROOT,'api','verify.js'));
const OLD_COLS='device_id,nickname,mode,format,club,formation,year,seed,version,w,d,l,pts,place,gf,ga,xp,xg,xga,tier,golden,perfect,practice,day,xi,tbl,seed_id,verified,verify_note,user_id,tg_user_id,tg_name'.split(',');
function mkDB(v39){
  const P={players:[],links:{}};let pn=0;
  const forDevice=d=>{let l=P.links[d];if(!l){const p={id:'p-'+(++pn),name:null,anon_name:['Silent Owl','Brave Fox','Quiet Lynx'][pn%3]};P.players.push(p);l=P.links[d]={pid:p.id,secret:null};}return l;};
  const check=(a)=>{if(!a.p_device||String(a.p_secret||'').length<16)return {err:{status:400,body:JSON.stringify({code:'22023',message:'device?'})}};
    const l=forDevice(a.p_device);if(l.secret==null)l.secret=a.p_secret;else if(l.secret!==a.p_secret)return {err:{status:401,body:JSON.stringify({code:'28000',message:'device secret'})}};return {p:P.players.find(p=>p.id===l.pid)};};
  const js=p=>({id:p.id,name:p.name,anon_name:p.anon_name});
  const rpc=v39?{player_hello:a=>{const c=check(a);return c.err||js(c.p);},
    set_player_name:a=>{const c=check(a);if(c.err)return c.err;const nm=String(a.p_name||'').trim()||null;if(nm&&(nm.length<2||nm.length>24))return {status:400,body:'{"code":"22023"}'};c.p.name=nm;return js(c.p);}}:{};
  const db=makeDB({seasons:{auto:'id',cols:v39?null:OLD_COLS,onInsert:r=>{if(v39){r.player_id=forDevice(r.device_id).pid;r.competition=r.competition||'upl';r.gd=r.gf-r.ga;}r.verified=null;}},season_seeds:{auto:'id'},daily_results:{auto:'id'}},rpc);
  if(v39)db.DB.players=P.players;
  global.fetch=db.fetch;   // для api/seed і api/verify
  return {db,P};}
const api={'/api/seed':async req=>callApi(seedH,req.body),'/api/verify':async req=>callApi(verH,req.body)};
async function run(MODE,b){const T=checker('v39 '+MODE);const v39=MODE==='new';const {db,P}=mkDB(v39);const DB=db.DB;
 const {pg,errs}=await openSite({b,db,api,viewport:{width:430,height:900},wait:1500});
 const player=await pg.evaluate(()=>JSON.parse(localStorage.getItem('upl30_player')||'null'));
 const board=async()=>{await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.click('#boardOpen');await pg.waitForTimeout(700);
   return pg.$$eval('#boardBody tr[data-q]',trs=>trs.map(t=>(t.className==='me'?'* ':'  ')+t.children[1].innerText.split('\n')[0]));};
 if(v39){
  T.check(player&&player.id===P.players[0].id&&player.anon_name,'гравець після завантаження: '+JSON.stringify(player));
  await pg.click('#acctBtn');await pg.waitForTimeout(200);
  T.check(await pg.$eval('#pName',e=>e.placeholder)===player.anon_name&&/Поки ти в таблицях як/.test(await pg.textContent('#pNameMsg')),'акаунт: поле імені з анонімним «'+player.anon_name+'»');
  await pg.screenshot({path:path.join(OUT,'v39_acct.png')});
  await pg.fill('#pName','Андрій');await pg.click('#pNameSave');await pg.waitForTimeout(500);
  T.check(/Збережено: Андрій/.test(await pg.textContent('#pNameMsg'))&&P.players[0].name==='Андрій','ім\'я збережено в профілі гравця');await pg.click('#viewClose');
 }else{
  T.check(!player,'без players.sql гравця немає, сайт працює');
  await pg.click('#acctBtn');await pg.waitForTimeout(200);T.check(!(await pg.$('#pName')),'акаунт без поля імені');await pg.click('#viewClose');
 }
 // вільна гра, «Складний»
 await pg.click('#freeOpen');const nameRow=await pg.$eval('#myNameRow',e=>!e.hidden);
 T.check(v39?nameRow&&await pg.$eval('#myName',e=>e.value)==='Андрій':!nameRow,'налаштування: рядок імені '+(v39?'з «Андрій»':'схований'));
 await pg.click('#formats .opt:nth-child(1)');await pg.click('#modes .opt:nth-child(2)');await pg.click('#startBtn');await draftSeason(pg);await pg.waitForTimeout(1500);
 const ver=await pg.$eval('#verLine',e=>e.hidden?'':e.textContent);T.check(/перевірено сервером/.test(ver),'«Результат перевірено сервером»');
 const row=DB.seasons[DB.seasons.length-1]||{};
 T.check(row.mode==='hard'&&row.verified===true&&row.seed_id!=null&&row.verify_note!=null,`рядок seasons: mode ${row.mode}, verified ${row.verified}, seed_id ${row.seed_id}`);
 if(v39)T.check(row.player_id===player.id&&row.competition==='upl'&&/^d[0-9a-f]{8}$/.test(row.data_version)&&row.nickname==='Андрій',`нові колонки: player_id ${row.player_id}, competition ${row.competition}, data_version ${row.data_version}`);
 else T.check(!('competition' in row)&&!('data_version' in row),'стара база: сезон записано без нових колонок');
 // таблиця 11×11
 let rows=await board();T.check(rows.length===1&&rows[0].startsWith('* ')&&(!v39||rows[0].includes('Андрій')),'таблиця: мій рядок '+JSON.stringify(rows));
 await pg.screenshot({path:path.join(OUT,`v39_board_${MODE}.png`)});
 await pg.click('[data-board="anti"]');await pg.waitForTimeout(400);T.check(/порожньо/.test(await pg.textContent('#boardBody')),'вкладка «Антисезон» порожня');
 await pg.click('[data-board="main"]');await pg.waitForTimeout(400);await pg.click('#boardBody tr.me');await pg.waitForTimeout(500);
 T.check(!!(await pg.$('#viewBack'))&&!!(await pg.$('#viewBody .slot')),'рядок відкриває сезон із кнопкою «До таблиці»');
 await pg.click('#viewBack');await pg.waitForTimeout(500);T.check((await pg.$$('#boardBody tr[data-q]')).length===1,'«До таблиці» повертає таблицю');await pg.click('#viewClose');
 if(v39){
  await pg.click('#freeOpen');await pg.fill('#myName','Andriy 2');await pg.dispatchEvent('#myName','change');await pg.waitForTimeout(500);
  rows=await board();T.check(rows[0]==='* Andriy 2','перейменування в налаштуваннях → у таблиці «Andriy 2»');await pg.click('#viewClose');
  await pg.click('#acctBtn');await pg.fill('#pName','');await pg.click('#pNameSave');await pg.waitForTimeout(500);
  T.check(/ти знову/.test(await pg.textContent('#pNameMsg')),'порожнє ім\'я — знову анонімний');await pg.click('#viewClose');
  rows=await board();T.check(rows[0]==='* '+player.anon_name,'у таблиці анонімне ім\'я: '+rows[0]);await pg.click('#viewClose');
  // чужий пристрій (той самий device_id, інший секрет) не перейменує — перевірка секрету на боці бази, тут лише як імітація; справжня — setup.sh
 }
 T.check(!errs.length,'помилок на сторінці немає '+errs.join(' | '));
 return T.done();}
(async()=>{const want=process.argv[2]||'both';const b=await launch();let bad=0;
 for(const m of ['new','old'])if(want===m||want==='both')bad+=await run(m,b);
 await b.close();console.log(bad?'v39: ПРОБЛЕМИ':'v39: УСЕ ГАРАЗД');process.exit(bad?1:0);})();
