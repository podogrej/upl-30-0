const path=require('path'),fs=require('fs');
const ROOT=path.join(__dirname,'..','..');
const { chromium } = require(path.join(ROOT,'tools','node_modules','playwright'));
// Chromium: PLAYWRIGHT_BROWSERS_PATH (облачна среда Claude — /opt/pw-browsers) або вбудований у playwright
function exe(){const d=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';try{const c=fs.readdirSync(d).filter(x=>/^chromium-\d+$/.test(x)).sort().pop();if(c)return path.join(d,c,'chrome-linux','chrome');}catch(e){}return undefined;}
// сторінка відкривається з файлу index.html; усі мережеві запити, крім шрифтів, блокуються — у бази нічого не пишеться
async function openPage(opts={}){
  const args=['--no-sandbox'];const spki=process.env.PROXY_CA_SPKI;if(spki)args.push('--ignore-certificate-errors-spki-list='+spki);
  const b=await chromium.launch({executablePath:exe(),args,proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY}:undefined});
  const ctx=await b.newContext({viewport:{width:390,height:844},...opts});
  await ctx.route(u=>!(u.href.startsWith('file:')||/fonts\.(googleapis|gstatic)\.com/.test(u.host)),r=>r.abort());
  const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto('file://'+path.join(ROOT,'index.html'));await pg.waitForTimeout(800);
  return {b,pg,errs};}
// один сезон: формат, номер режиму й схеми у списках налаштувань (як їх бачить гравець)
async function playSeason(pg,fmt,mode,form){
  await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.waitForTimeout(200);
  if(fmt==='daily')await pg.click('#dailyBtn');
  else{await pg.click('#freeOpen');const fi={classic:1,derby:2,oneclub:3,anti:4}[fmt];await pg.click(`#formats .opt:nth-child(${fi})`);await pg.click(`#formations .opt:nth-child(${form})`);if(fmt!=='anti')await pg.click(`#modes .opt:nth-child(${mode})`);await pg.click('#startBtn');}
  for(let i=0;i<11;i++){await pg.click('#spinBtn');await pg.waitForTimeout(1750);const btn=await pg.$('.pl:not([disabled])');await btn.click();await pg.waitForTimeout(80);const pick=await pg.$('#pitch .slot.target');if(pick){await pick.click();await pg.waitForTimeout(60);}}
  await pg.waitForSelector('#simBtn:not([hidden])');/* з 0.45 прогноз рахується сам */await pg.click('#simBtn');await pg.click('#skipBtn');await pg.waitForTimeout(500);}
module.exports={ROOT,openPage,playSeason};
