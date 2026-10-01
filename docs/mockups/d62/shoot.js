// Макети 0.62 «Чистий дизайн»: знімки справжнього сайту «було» і «стало» (стало = clean.css + clean.js поверх гри).
// Запуск з кореня: node docs/mockups/d62/shoot.js [було|стало]  → docs/mockups/d62/<режим>_*.png
const path=require('path'),fs=require('fs');const {ROOT,launch,makeDB,openSite}=require('../../../tools/tests/_site.js');
const MODE=process.argv[2]||'було';const OUT=__dirname;
const CSS=MODE==='стало'?fs.readFileSync(path.join(OUT,'clean.css'),'utf8'):'';const JS=MODE==='стало'?fs.readFileSync(path.join(OUT,'clean.js'),'utf8'):'';
function mkDB(){
  const players=[{id:'p-me',name:'andré',anon_name:'calm_owl',public_id:'andr2345'}];
  const js=p=>({id:p.id,name:p.name,anon_name:p.anon_name,public_id:p.public_id,name_next:null,contact_email:null,news_optin:false});
  const rpc={player_hello:()=>js(players[0]),link_account:()=>({...js(players[0]),merge_offer:null}),trophy_stats:()=>({players:12,t:{champ:3,perfect:1}}),
    player_profile:()=>({public_id:'andr2345',name:'andré',anon:false,since:'2026-09-02T10:00:00Z',seasons:41,champions:9,perfect:0,best_classic:78,win_pct:61,best:{},worst:{},trophies:['champ','top3','silver','derby'],streak_best:4,streak_now:2}),
    fl_mine:()=>[{id:'abc222',name:'Динамо на дивані',fmt:'11',days:7,tries:3,day_n:3,over:false,members:4,tries_today:1,place:2}],
    game_stats:()=>({seasons:1873,players:24,footballers:5321})};
  const db=makeDB({seasons:{auto:'id'},season_seeds:{auto:'id'},daily_results:{auto:'id'},player_links:{},user_state:{}},rpc);db.DB.players=players;global.fetch=db.fetch;return db;}
const api={'/api/save':async()=>({json:{id:1,verified:true,note:'ok'}}),'/api/seed':async()=>({json:{seed:12345,seed_id:'s1'}})};
async function fix(pg){await pg.evaluate(()=>scrollTo(0,0));if(CSS)await pg.evaluate(c=>{let st=document.getElementById('c62');if(!st){st=document.createElement('style');st.id='c62';document.body.append(st);}st.textContent=c;},CSS);if(JS)await pg.evaluate(JS);await pg.waitForTimeout(150);}
async function shot(pg,name,full=true){await fix(pg);await pg.screenshot({path:path.join(OUT,MODE+'_'+name+'.png'),fullPage:full});console.log('✓',MODE+'_'+name);}
(async()=>{const b=await launch();const db=mkDB();
 for(const vp of [{w:390,h:844,tag:''},{w:1180,h:820,tag:'ipad_'}]){
  const A=await openSite({b,db,api,signed:true,viewport:{width:vp.w,height:vp.h},wait:1500,init:'try{localStorage.setItem("upl30_seed_demo","1")}catch(e){}'});const pg=A.pg;
  if(!vp.tag){await shot(pg,'1_home');
   await pg.click('#freeOpen');await pg.waitForTimeout(300);await shot(pg,'2_settings');
   await pg.click('#formats .opt[data-fmt="classic"]');await pg.click('#modes .opt:nth-child(1)');}
  else{await pg.click('#freeOpen');await pg.waitForTimeout(300);await pg.click('#formats .opt[data-fmt="classic"]');await pg.click('#modes .opt:nth-child(1)');}
  await pg.click('#startBtn');
  for(let i=0;i<5;i++){await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});
    const btn=await pg.$('.pl:not([disabled])');await btn.click();await pg.waitForTimeout(80);const t=await pg.$('#pitch .slot.target');if(t){await t.click();await pg.waitForTimeout(60);}}
  await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});await pg.waitForTimeout(300);
  await shot(pg,vp.tag+'3_wheel',!vp.tag);
  if(vp.tag){await A.ctx.close();continue;}
  for(let i=5;i<11;i++){if(i>5){await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});}
    const btn=await pg.$('.pl:not([disabled])');await btn.click();await pg.waitForTimeout(80);const t=await pg.$('#pitch .slot.target');if(t){await t.click();await pg.waitForTimeout(60);}}
  await pg.waitForSelector('#simBtn:not([hidden])');await pg.click('#simBtn');await pg.waitForSelector('#skipBtn:visible',{timeout:15000});await pg.click('#skipBtn');await pg.waitForTimeout(1200);
  await shot(pg,'4_result');
  await pg.evaluate(()=>document.getElementById('acctBtn').click());await pg.waitForTimeout(1500);await shot(pg,'5_player');
  if(A.errs.length)console.log('помилки:',A.errs.join(' | '));await A.ctx.close();}
 await b.close();})();
