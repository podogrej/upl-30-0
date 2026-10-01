// Макети 0.63 у кольорах УПЛ: справжня гра 0.63 (усі правки власника) + палітра з themes.js. Запуск з кореня: node docs/mockups/design_upl/v63/shoot.js
// → docs/mockups/design_upl/v63/<A|B|C|D>_<екран>.png і compare.png (усі варіанти поруч)
const path=require('path'),fs=require('fs');const {launch,makeDB,openSite}=require('../../../../tools/tests/_site.js');
const TH=require('./themes.js');const OUT=__dirname;const SC=['home','modes','wheel','result'];
function mkDB(){const players=[{id:'p-me',name:'andré',anon_name:'calm_owl',public_id:'andr2345'}];
  const js=p=>({id:p.id,name:p.name,anon_name:p.anon_name,public_id:p.public_id,name_next:null,contact_email:null,news_optin:false});
  const db=makeDB({seasons:{auto:'id'},season_seeds:{auto:'id'},daily_results:{auto:'id'},player_links:{},user_state:{}},
    {player_hello:()=>js(players[0]),link_account:()=>({...js(players[0]),merge_offer:null}),trophy_stats:()=>({players:12,t:{}}),game_stats:()=>({seasons:75,players:4})});
  db.DB.players=players;global.fetch=db.fetch;return db;}
const api={'/api/save':async()=>({json:{id:1,verified:true,note:'ok'}}),'/api/seed':async()=>({json:{seed:12345,seed_id:'s1'}})};
(async()=>{const b=await launch();const db=mkDB();
 for(const [k,t] of Object.entries(TH)){
  const A=await openSite({b,db,api,signed:true,viewport:{width:390,height:844},wait:1300,init:`try{localStorage.setItem("upl30_theme","${t.scheme}")}catch(e){}`});const pg=A.pg;
  const fix=async()=>{await pg.evaluate(c=>{let s=document.getElementById('upl');if(!s){s=document.createElement('style');s.id='upl';document.body.append(s);}s.textContent=c;scrollTo(0,0);},t.css);await pg.waitForTimeout(200);};
  const shot=async n=>{await fix();await pg.screenshot({path:path.join(OUT,`${k}_${n}.png`),clip:{x:0,y:0,width:390,height:1400},fullPage:true});};
  await shot('home');await pg.click('#freeOpen');await pg.waitForTimeout(300);await shot('modes');
  await pg.click('#formats .opt[data-fmt="classic"]');await pg.click('#modes .opt:nth-child(1)');await pg.click('#startBtn');
  for(let i=0;i<5;i++){await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});await (await pg.$('.pl:not([disabled])')).click();await pg.waitForTimeout(80);const s=await pg.$('#pitch .slot.target');if(s)await s.click();}
  await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});await pg.waitForTimeout(400);await shot('wheel');
  for(let i=5;i<11;i++){if(i>5){await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});}await (await pg.$('.pl:not([disabled])')).click();await pg.waitForTimeout(80);const s=await pg.$('#pitch .slot.target');if(s)await s.click();}
  await pg.waitForSelector('#simBtn:not([hidden])');await pg.click('#simBtn');await pg.waitForSelector('#skipBtn:visible',{timeout:15000});await pg.click('#skipBtn');await pg.waitForTimeout(1300);await shot('result');
  console.log('✓',k);await A.ctx.close();}
 const pg=await b.newPage({viewport:{width:1700,height:900}});const b64=f=>'data:image/png;base64,'+fs.readFileSync(path.join(OUT,f)).toString('base64');
 await pg.setContent(`<style>body{margin:0;background:#222;color:#eee;font:15px system-ui;padding:16px}h2{margin:16px 0 8px;font-size:18px}.r{display:grid;grid-template-columns:repeat(4,390px);gap:16px}img{width:390px;border-radius:10px}</style>`+
   Object.entries(TH).map(([k,t])=>`<h2>${t.name}</h2><div class="r">${SC.map(s=>`<img src="${b64(`${k}_${s}.png`)}">`).join('')}</div>`).join(''));
 await pg.waitForTimeout(300);await pg.screenshot({path:path.join(OUT,'compare.png'),fullPage:true});await b.close();console.log('✓ compare');})();
