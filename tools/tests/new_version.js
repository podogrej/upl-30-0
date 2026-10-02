// 0.69: вкладка, відкрита до випуску, — плашка «Є нова версія · Оновити» (version.json ≠ версії сторінки); та сама версія — плашки немає.
// І Telegram: disableVerticalSwipes викликано (свайп униз не згортає Mini App). Запуск з кореня: node tools/tests/new_version.js
const {openSite,checker}=require('./_site.js');
const fs=require('fs'),path=require('path');
(async()=>{const T=checker('new_version');
  const cur=JSON.parse(fs.readFileSync(path.join(__dirname,'../../version.json'))).v;
  const foot=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8').match(/Що нового у версії ([\d.]+)/)[1];
  T.check(cur===foot,'version.json = версія в підвалі: '+cur+' / '+foot);
  const vis=pg=>pg.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  let v='9.99';
  const {b,pg,errs}=await openSite({api:{'/version.json':async()=>({json:{v}})},tg:{initData:'x',platform:'ios'},hash:'#tgWebAppData=x'});
  T.check(await pg.evaluate(()=>window.__noSwipe===1),'Telegram: disableVerticalSwipes викликано');
  T.check(await pg.isHidden('#newVer'),'одразу після відкриття плашки немає');
  await vis(pg);await pg.waitForTimeout(400);
  T.check(await pg.isVisible('#newVer'),'нова версія на сервері → «Є нова версія»');
  await pg.screenshot({path:path.join(__dirname,'out/new_version.png')});
  await pg.click('#newVerGo');await pg.waitForTimeout(1200);
  T.check(await pg.isHidden('#newVer'),'«Оновити» перезавантажує сторінку');
  await b.close();
  const s2=await openSite({api:{'/version.json':async()=>({json:{v:foot}})}});
  await vis(s2.pg);await s2.pg.waitForTimeout(400);
  T.check(await s2.pg.isHidden('#newVer'),'та сама версія — плашки немає');
  T.check(!errs.length&&!s2.errs.length,'помилок на сторінці немає '+errs.concat(s2.errs).join('; '));
  await s2.b.close();process.exit(T.done());})();
