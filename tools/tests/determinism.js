const { chromium } = require('playwright');
const E=require('/home/claude/upl-dataset/game/site/lib/engine.js');
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const pg=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
 let errs=0;pg.on('pageerror',e=>{errs++;console.log('PAGEERROR',e.message)});
 await pg.goto(`file://${process.cwd()}/preview.html`);await pg.waitForTimeout(400);
 const runs=[['classic',1,1],['classic',2,2],['classic',3,3],['derby',1,1],['oneclub',1,1],['anti',3,1],['daily',0,0],['classic',1,6]];
 let ok=0;
 for(const [fmt,mode,form] of runs){
  await pg.click('#againBtn').catch(()=>{});await pg.waitForTimeout(200);
  if(fmt==='daily'){await pg.evaluate(()=>{const s=document.getElementById('s1');if(s&&s.hidden)document.getElementById('homeBtn').click();});await pg.click('#dailyBtn');}
  else{const fi={classic:1,derby:2,oneclub:3,anti:4}[fmt];await pg.evaluate(()=>{const s=document.getElementById('s4');if(s&&s.hidden)document.getElementById('freeOpen').click();});await pg.click(`#formats .opt:nth-child(${fi})`);await pg.evaluate(()=>{const s=document.getElementById('s4');if(s&&s.hidden)document.getElementById('freeOpen').click();});await pg.click(`#formations .opt:nth-child(${form})`);if(fmt!=='anti')await pg.evaluate(()=>{const s=document.getElementById('s4');if(s&&s.hidden)document.getElementById('freeOpen').click();});await pg.click(`#modes .opt:nth-child(${mode})`);await pg.evaluate(()=>{const s=document.getElementById('s4');if(s&&s.hidden)document.getElementById('freeOpen').click();});await pg.click('#startBtn');}
  for(let i=0;i<11;i++){await pg.click('#spinBtn');await pg.waitForTimeout(1750);const btn=await pg.$('.pl:not([disabled])');await btn.click();await pg.waitForTimeout(80);const pick=await pg.$('#pitch .slot.target');if(pick){await pick.click();await pg.waitForTimeout(60);}}
  await pg.click('#lockBtn');await pg.waitForSelector('#simBtn:not([hidden])');await pg.click('#simBtn');await pg.click('#skipBtn');await pg.waitForTimeout(400);
  const c=await pg.evaluate(()=>{const S=window.__dbg.S;const r=S.result;return {seed:r.seed,year:r.year,mode:S.mode,format:S.format,formation:S.formation,
    xi:S.slots.map(s=>({id:s.player.id,name:s.player.name,slot:s.slot,pos:s.player.pos,r:s.player.r})),W:r.W,D:r.D,L:r.L,gf:r.gf,ga:r.ga,place:r.place}});
  const s=E.run({xi:c.xi,mode:c.mode,format:c.format,year:c.year,seed:c.seed});
  const same=s.W===c.W&&s.D===c.D&&s.L===c.L&&s.gf===c.gf&&s.ga===c.ga&&s.place===c.place;if(same)ok++;
  console.log(fmt.padEnd(8),c.mode.padEnd(9),c.formation,'browser',`${c.W}-${c.D}-${c.L} ${c.gf}:${c.ga} #${c.place}`,'server',`${s.W}-${s.D}-${s.L} ${s.gf}:${s.ga} #${s.place}`,same?'✓':'✗ MISMATCH');
 }
 console.log('identical',ok,'/',runs.length,'errors',errs);await b.close();})();
