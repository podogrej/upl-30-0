const path=require('path'),fs=require('fs');
const ROOT=path.join(__dirname,'..','..');
const { chromium } = require(path.join(ROOT,'tools','node_modules','playwright'));
// Chromium: PLAYWRIGHT_BROWSERS_PATH (/opt/pw-browsers in the cloud sandbox) or playwright's bundled one
function exe(){const d=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';try{const c=fs.readdirSync(d).filter(x=>/^chromium-\d+$/.test(x)).sort().pop();if(c)return path.join(d,c,'chrome-linux','chrome');}catch(e){}return undefined;}
// page is opened from index.html; all network requests except fonts are blocked, so nothing is written to the DB
async function launch(){
  const args=['--no-sandbox'];const spki=process.env.PROXY_CA_SPKI;if(spki)args.push('--ignore-certificate-errors-spki-list='+spki);
  return chromium.launch({executablePath:exe(),args,proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY}:undefined});}
async function openPage(opts={}){
  const b=await launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},...opts});
  await ctx.route(u=>!(u.href.startsWith('file:')||/fonts\.(googleapis|gstatic)\.com/.test(u.host)),r=>r.abort());
  const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('dialog',d=>/Склад не збережеться/.test(d.message())?d.accept():d.dismiss());   // accept the "leave unfinished draft" confirm
  await pg.goto('file://'+path.join(ROOT,'index.html'));await pg.waitForTimeout(800);
  return {b,pg,errs};}
// pick format on the setup screen: the mode is chosen on the home screen, so the setup screen has no mode tiles; here setFmt stands in for the home entry points
// (and for hidden formats: derby, legends). oneclub: the club list, then the club tile, as a player would
async function pickFmt(pg,fmt){if(fmt==='oneclub'){await pg.evaluate(()=>window.__dbg.openOc());await pg.click('#ocGrid .oct[data-c="karpaty-lviv"]');return;}
  await pg.evaluate(k=>window.__dbg.setFmt(k),fmt);}
// play one season: fmt = tile data-fmt ('pick' = season pick, 'daily' = daily draft); mode/form = 1-based option index in setup lists
async function playSeason(pg,fmt,mode,form){
  await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.waitForTimeout(200);
  if(fmt==='daily')await pg.click('#dailyBtn');
  else{await pg.click('#freeOpen');await pickFmt(pg,fmt);await pg.click(`#formations .opt:nth-child(${form})`);if(fmt!=='anti'&&fmt!=='pick')await pg.click(`#modes .opt:nth-child(${mode})`);await pg.click('#startBtn');}
  for(let i=0;i<11;i++){await pg.click('#spinBtn');
    // season-pick mode: after the club spin there are three season buttons; take the last (latest) one
    await pg.waitForSelector('#seaPick:not([hidden]) button, #squad .pl:not([disabled])',{timeout:8000});const sp=await pg.$$('#seaPick:not([hidden]) button');if(sp.length)await sp[sp.length-1].click();
    await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});const btn=await pg.$('.pl:not([disabled])');await btn.click();await pg.waitForTimeout(80);const pick=await pg.$('#pitch .slot.target');if(pick){await pick.click();await pg.waitForTimeout(60);}}
  await pg.waitForSelector('#simBtn:not([hidden])');/* forecast runs automatically */await pg.click('#simBtn');await pg.click('#skipBtn');await pg.waitForTimeout(500);}
module.exports={ROOT,launch,openPage,playSeason,pickFmt};
