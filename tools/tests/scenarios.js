// Сценарії перед виходом: головна, тема, 4 сезони (класика, виклик дня, антисезон, дербі), текст і картка результату.
// Запуск з кореня: node tools/tests/scenarios.js [папка для знімків]. Код виходу 0 — усе гаразд.
const path=require('path'),fs=require('fs');const {ROOT,openPage,playSeason}=require('./_page.js');
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const fail=[];const check=(ok,msg)=>{if(!ok)fail.push(msg);};
(async()=>{const {b,pg,errs}=await openPage({colorScheme:'light'});
 const foot=await pg.evaluate(()=>document.querySelector('.foot').textContent);console.log('підвал:',foot);
 check(/версії \d+\.\d+/.test(foot),'у підвалі немає «версії X.YY»');
 const tpl=fs.readFileSync(path.join(ROOT,'src','template.html'),'utf8');const eng=fs.readFileSync(path.join(ROOT,'lib','engine.js'),'utf8');
 const v1=(foot.match(/версії ([\d.]+)/)||[])[1],v2=(eng.match(/VERSION: '([^']+)'/)||[])[1],v3=(tpl.match(/const WHATSNEW=\{v:'([^']+)'/)||[])[1];
 console.log('версії: підвал',v1,'рушій',v2,'WHATSNEW',v3);check(v1&&v1===v2&&v2===v3,'версії не збігаються');
 check(await pg.evaluate(()=>document.documentElement.dataset.theme)==='dark','за замовчуванням не темна тема');
 await pg.screenshot({path:path.join(OUT,'home.png'),fullPage:true});
 await pg.click('#themeBtn');check(await pg.evaluate(()=>document.documentElement.dataset.theme)==='light','перемикач теми не працює');
 await pg.reload();await pg.waitForTimeout(500);check(await pg.evaluate(()=>document.documentElement.dataset.theme)==='light','тема не запам\'яталась');
 await pg.screenshot({path:path.join(OUT,'home_light.png')});await pg.click('#themeBtn');
 for(const [fmt,mode,form] of [['classic',1,1],['daily',0,0],['anti',3,1],['derby',2,2]]){
  await playSeason(pg,fmt,mode,form);
  await pg.screenshot({path:path.join(OUT,`result_${fmt}.png`),fullPage:true});
  await pg.click('#cardBtn');await pg.waitForTimeout(900);
  const d=await pg.evaluate(()=>{const S=window.__dbg.S;return {text:document.getElementById('shareText').value,cap:window.__dbg.shareTextOf(S.result,false,true),img:document.getElementById('shareImg').src,r:{W:S.result.W,D:S.result.D,L:S.result.L,gf:S.result.gf,ga:S.result.ga,log:S.result.log.map(m=>[m.ug,m.og,m.res])},verified:document.getElementById('verLine').textContent};});
  fs.writeFileSync(path.join(OUT,`card_${fmt}.png`),Buffer.from(d.img.split(',')[1],'base64'));
  const L=d.r.log;check(L.length===30,`${fmt}: не 30 матчів`);
  check(L.reduce((a,m)=>a+m[0],0)===d.r.gf&&L.reduce((a,m)=>a+m[1],0)===d.r.ga,`${fmt}: голи не сходяться з матчами`);
  check(L.every(m=>m[2]===(m[0]>m[1]?'W':m[0]<m[1]?'L':'D')),`${fmt}: результат матчу не збігається з рахунком`);
  check(/[🟩🟨🟥]/u.test(d.text),`${fmt}: у тексті немає квадратиків`);check(!/[🟩🟨🟥]/u.test(d.cap),`${fmt}: у підписі до картки є квадратики`);
  check(!/№/.test(d.text),`${fmt}: у тексті номер виклику`);
  console.log(`\n== ${fmt}: ${d.r.W}-${d.r.D}-${d.r.L} ${d.r.gf}:${d.r.ga}\n${d.cap}`);
 }
 check(!errs.length,'помилки на сторінці: '+errs.join(' | '));
 console.log('\nзнімки:',OUT);console.log(fail.length?'ПРОБЛЕМИ:\n- '+fail.join('\n- '):'УСЕ ГАРАЗД');await b.close();process.exit(fail.length?1:0);})();
