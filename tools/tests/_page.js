const path=require('path'),fs=require('fs');
const ROOT=path.join(__dirname,'..','..');
const { chromium } = require(path.join(ROOT,'tools','node_modules','playwright'));
// Chromium: PLAYWRIGHT_BROWSERS_PATH (/opt/pw-browsers in the cloud sandbox) or playwright's bundled one
function exe(){const d=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';try{const c=fs.readdirSync(d).filter(x=>/^chromium-\d+$/.test(x)).sort().pop();if(c)return path.join(d,c,'chrome-linux','chrome');}catch(e){}return undefined;}
// page is opened from index.html; all network requests are blocked, so nothing is written to the DB
async function launch(){
  const args=['--no-sandbox'];const spki=process.env.PROXY_CA_SPKI;if(spki)args.push('--ignore-certificate-errors-spki-list='+spki);
  return chromium.launch({executablePath:exe(),args,proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY}:undefined});}
// Reel spin is ~2.4 s of CSS transition; tests skip it (transitionend still fires, so the game logic runs as usual). fastReel:false keeps the real animation
const FAST_REEL_CSS='.reel .strip.go,.reel .strip.go.settle{transition-duration:1ms!important;animation:none!important}';
async function fastReel(ctx){await ctx.addInitScript(css=>{document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=css;document.head.appendChild(s);});},FAST_REEL_CSS);}
// Scripted motion (MOTION in the game: odometer digits, counters, toast, sheets, accordion, forecast bars) runs for 1 ms in tests, so text and layout
// read right after a click are final. fastMotion:false keeps the real durations (tests of the animations themselves)
async function fastMotion(ctx){await ctx.addInitScript(()=>{window.__fastMotion=1;});}
// page is ready when the game API exists and fonts are loaded (the script ends with window.__dbg)
const ready=pg=>pg.waitForFunction(()=>window.__dbg&&document.fonts.status==='loaded',null,{timeout:15000});
// daily challenge: "today" is fixed to 12.10.2026 (lib/challenges.json has it), so home and draft do not depend on the run date; vdToday:null keeps the real day.
// opts.b: reuse a browser (the returned b.close() then closes only this context); opts.fastReel:false: real reel animation; opts.fastMotion:false: real scripted motion
async function openPage(opts={}){
  const {vdToday='2026-10-12',b:own,fastReel:fr=true,fastMotion:fm=true,...cx}=opts;const b=own||await launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},...cx});
  if(vdToday)await ctx.addInitScript(d=>{window.__vdToday=d;},vdToday);
  if(fr)await fastReel(ctx);
  if(fm)await fastMotion(ctx);
  await ctx.route(u=>!u.href.startsWith('file:'),r=>r.abort());
  const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('dialog',d=>/Склад не збережеться/.test(d.message())?d.accept():d.dismiss());   // accept the "leave unfinished draft" confirm
  await pg.goto('file://'+path.join(ROOT,'index.html'));await ready(pg);await pg.waitForTimeout(100);
  return {b:own?{close:()=>ctx.close()}:b,ctx,pg,errs};}
// pick format on the setup screen: the mode is chosen on the home screen, so the setup screen has no mode tiles; here setFmt stands in for the home entry points
// (and for hidden formats: derby, legends). oneclub: the club list, then the club tile, as a player would
async function pickFmt(pg,fmt){if(fmt==='oneclub'){await pg.evaluate(()=>window.__dbg.openOc());await pg.click('#ocGrid .oct[data-c="karpaty-lviv"]');return;}
  await pg.evaluate(k=>window.__dbg.setFmt(k),fmt);}
// play one season: fmt = tile data-fmt ('pick' = season pick, 'vd' = daily challenge of 12.10.2026: Shakhtar seasons on the first spins so the
// required condition is met and the season plays); mode/form = 1-based option index in setup lists
// opts.dbg: place the first allowed player through window.__dbg (S.wheel + place) instead of tapping the list
async function playSeason(pg,fmt,mode,form,opts={}){
  await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.waitForTimeout(200);
  if(fmt==='vd'){await pg.evaluate(()=>window.__dbg.vdOpen('2026-10-12'));await pg.waitForTimeout(300);}
  else{await pg.click('#freeOpen');await pickFmt(pg,fmt);await pg.click(`#formations .opt:nth-child(${form})`);if(fmt!=='anti'&&fmt!=='pick')await pg.click(`#modes .opt:nth-child(${mode})`);await pg.click('#startBtn');}
  for(let i=0;i<11;i++){if(await pg.evaluate(()=>window.__dbg.S.slots.every(s=>s.player)))break;   // daily challenge: the event player is already on the pitch
    await pg.click('#spinBtn');
    if(fmt==='vd'&&i<3){await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});await pg.evaluate(y=>{const D=window.__dbg;D.S.wheel=D.DATA.clubs.find(c=>c.c==='shakhtar-donetsk'&&c.y===y);D.renderWheel();},2010+i);}
    // season-pick mode: after the club spin there are three season buttons; take the last (latest) one
    await pg.waitForSelector('#seaPick:not([hidden]) button, #squad .pl:not([disabled])',{timeout:8000});const sp=await pg.$$('#seaPick:not([hidden]) button');if(sp.length)await sp[sp.length-1].click();
    await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});
    if(opts.dbg){await pg.evaluate(()=>{const D=window.__dbg,w=D.S.wheel,id=document.querySelector('#squad .pl:not([disabled])').dataset.id,p=w.pl.find(x=>x[5]===id);D.place(p,D.posOpts(p)[0]);});continue;}
    const btn=await pg.$('.pl:not([disabled])');await btn.click();await pg.waitForTimeout(80);const pick=await pg.$('#pitch .slot.target');if(pick){await pick.click();await pg.waitForTimeout(60);}}
  await pg.waitForSelector('#simBtn:not([hidden])');/* forecast runs automatically */await pg.click('#simBtn');await pg.click('#skipBtn');if(opts.dbg)await pg.waitForSelector('#final:not([hidden])');else await pg.waitForTimeout(500);}
module.exports={ROOT,launch,openPage,playSeason,pickFmt,fastReel,fastMotion,ready};
