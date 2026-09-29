const { chromium } = require('playwright');
async function draft(pg){ for (let i=0;i<11;i++){ await pg.click('#spinBtn'); await pg.waitForTimeout(1750); const btn = await pg.$('.pl:not([disabled])'); if(!btn){console.log('NO BUTTON at',i); return false;} await btn.click(); await pg.waitForTimeout(80); const pk=await pg.$('#pitch .slot.target'); if(pk){await pk.click(); await pg.waitForTimeout(60);}} return true; }
async function fmt(pg,i){ await pg.evaluate(()=>{const s=document.getElementById('s4');if(s&&s.hidden)document.getElementById('freeOpen').click();});await pg.click(`#formats .opt:nth-child(${i})`); }
(async () => {
  const b = await chromium.launch({args:['--no-sandbox']});
  const pg = await (await b.newContext({viewport:{width:820,height:1100}})).newPage();
  let errs=0; pg.on('pageerror', e => {errs++; console.log('PAGEERROR', e.message);});
  await pg.goto('file://' + process.cwd() + '/preview.html'); await pg.waitForTimeout(400);
  // classic with reveal: check mid-reveal state
  await pg.evaluate(()=>{const s=document.getElementById('s4');if(s&&s.hidden)document.getElementById('freeOpen').click();});await pg.click('#startBtn'); await draft(pg); await pg.click('#lockBtn');await pg.waitForSelector('#simBtn:not([hidden])');await pg.click('#simBtn'); await pg.waitForTimeout(2200);
  console.log('LIVE', (await pg.textContent('#lvRound')), await pg.textContent('#lvRec'), '| final hidden', await pg.$eval('#final',e=>e.hidden));
  await pg.screenshot({path:'shot_live.png'});
  await pg.click('#fastBtn'); await pg.waitForTimeout(300); await pg.click('#skipBtn'); await pg.waitForTimeout(200);
  console.log('after skip final hidden', await pg.$eval('#final',e=>e.hidden), 'matches', (await pg.$$('.m')).length, '|', (await pg.inputValue('#shareText')).split('\n').slice(0,3).join(' / '));
  // derby
  await pg.click('#againBtn'); await fmt(pg,2); await pg.evaluate(()=>{const s=document.getElementById('s4');if(s&&s.hidden)document.getElementById('freeOpen').click();});await pg.click('#startBtn'); await draft(pg);
  const clubs = await pg.$$eval('#pitch .slot .club', els=>els.map(e=>e.textContent.split(' ')[0]));
  console.log('DERBY clubs', [...new Set(clubs)]);
  await pg.click('#lockBtn');await pg.waitForSelector('#simBtn:not([hidden])');await pg.click('#simBtn'); await pg.click('#skipBtn'); console.log('DERBY', (await pg.inputValue('#shareText')).split('\n').slice(0,3).join(' / '));
  // one club: Karpaty default, choose Metalist
  await pg.click('#againBtn'); await fmt(pg,3); console.log('clubpick visible', !(await pg.$eval('#clubPickRow',e=>e.hidden)));
  await pg.selectOption('#clubPick','metalist-kharkiv'); await pg.evaluate(()=>{const s=document.getElementById('s4');if(s&&s.hidden)document.getElementById('freeOpen').click();});await pg.click('#startBtn'); const ok=await draft(pg);
  const clubs2 = await pg.$$eval('#pitch .slot .club', els=>els.map(e=>e.textContent.replace(/ \d{4}.*/,'')));
  console.log('ONECLUB ok', ok, [...new Set(clubs2)]);
  if(ok){await pg.click('#lockBtn');await pg.waitForSelector('#simBtn:not([hidden])');await pg.click('#simBtn'); await pg.click('#skipBtn'); console.log('ONECLUB', (await pg.inputValue('#shareText')).split('\n').slice(0,3).join(' / '));}
  // anti: pick worst available
  await pg.click('#againBtn'); await fmt(pg,4); await pg.evaluate(()=>{const s=document.getElementById('s4');if(s&&s.hidden)document.getElementById('freeOpen').click();});await pg.click('#startBtn');
  for (let i=0;i<11;i++){ await pg.click('#spinBtn'); await pg.waitForTimeout(1750); const btns = await pg.$$('.pl:not([disabled])'); await btns[0].click(); await pg.waitForTimeout(80); const pk=await pg.$('#pitch .slot.target'); if(pk){await pk.click(); await pg.waitForTimeout(60);}}
  const apps = await pg.$$eval('#pitch .slot .r', els=>els.map(e=>e.textContent));
  console.log('ANTI ratings', apps.join(','));
  await pg.click('#lockBtn');await pg.waitForSelector('#simBtn:not([hidden])');await pg.click('#simBtn'); await pg.click('#skipBtn'); console.log('ANTI', (await pg.inputValue('#shareText')).split('\n').slice(0,3).join(' / '));
  console.log('best line', await pg.textContent('#bestLine').catch(()=>''));
  // daily determinism still
  await pg.click('#againBtn'); await pg.evaluate(()=>{const s=document.getElementById('s1');if(s&&s.hidden)document.getElementById('homeBtn').click();});await pg.click('#dailyBtn'); await draft(pg); await pg.click('#lockBtn');await pg.waitForSelector('#simBtn:not([hidden])');await pg.click('#simBtn'); await pg.click('#skipBtn'); const d1=await pg.inputValue('#shareText');
  await pg.click('#againBtn'); await pg.evaluate(()=>{const s=document.getElementById('s1');if(s&&s.hidden)document.getElementById('homeBtn').click();}); const dis=await pg.$eval('#dailyBtn',e=>[e.disabled,e.textContent]); const modesList=await pg.$$eval('#modes .opt b',e=>e.map(x=>x.textContent));
  console.log('daily after official: disabled', dis[0], '|', dis[1], '| modes', modesList.join(','), '|', d1.split('\n').slice(0,3).join(' / '));
  console.log('errors', errs); await b.close();
})();
