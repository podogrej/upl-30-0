// Узкі кнопки при градієнті UPL.TV (фіолетовий → рожевий → оранжевий): 3 варіанти. Запуск з кореня: node docs/mockups/design_upl/v64/buttons.js → buttons.png
const path=require('path'),fs=require('fs');const {launch,makeDB,openSite}=require('../../../../tools/tests/_site.js');
const NARROW='.primary:not(#freeOpen):not(#startBtn):not(#simBtn):not(#againBtn):not(.champ0 button),.daily #dailyBtn';
const V={
 a:['А · суцільний рожевий',`${NARROW}{background:#e0287a!important}`],
 b:['Б · короткий градієнт (рожевий → оранжевий)',`${NARROW}{background:linear-gradient(90deg,#e0287a,#ff7a2e)!important}`],
 c:['В · той самий градієнт на ширину екрана',`${NARROW}{background:linear-gradient(90deg,#7e24b0,#d41e6f,#ff831e) fixed!important;background-size:100vw 100%!important}`]};
const api={'/api/save':async()=>({json:{id:1,verified:true,note:'ok'}}),'/api/seed':async()=>({json:{seed:12345,seed_id:'s1'}})};
(async()=>{const b=await launch();const db=makeDB({seasons:{auto:'id'},season_seeds:{auto:'id'},daily_results:{auto:'id'}},{});global.fetch=db.fetch;
 for(const [k,[,c]] of Object.entries(V)){const A=await openSite({b,db,api,viewport:{width:390,height:844},wait:1200,init:'try{localStorage.setItem("upl30_theme","dark")}catch(e){}'});
  await A.pg.evaluate(c=>{const s=document.createElement('style');s.textContent=c;document.body.append(s);
    document.getElementById('dailyCard').insertAdjacentHTML('afterend','<div class="nudge" style="margin-top:10px"><p style="margin:0 0 8px">Трофей збережено лише на цьому пристрої.</p><div class="row"><button class="primary">Увійти</button><button class="ghost">Пізніше</button></div></div>');},c);
  await A.pg.waitForTimeout(300);await A.pg.screenshot({path:path.join(__dirname,`btn_${k}.png`),clip:{x:0,y:120,width:390,height:640}});await A.ctx.close();}
 const pg=await b.newPage({viewport:{width:1250,height:800}});const b64=f=>'data:image/png;base64,'+fs.readFileSync(path.join(__dirname,f)).toString('base64');
 await pg.setContent(`<style>body{margin:0;background:#222;color:#eee;font:15px system-ui;padding:16px;display:grid;grid-template-columns:repeat(3,390px);gap:16px}h2{font-size:16px;margin:0 0 8px}img{width:390px;border-radius:10px}</style>`+Object.entries(V).map(([k,[n]])=>`<div><h2>${n}</h2><img src="${b64(`btn_${k}.png`)}"></div>`).join(''));
 await pg.waitForTimeout(300);await pg.screenshot({path:path.join(__dirname,'buttons.png'),fullPage:true});await b.close();})();
