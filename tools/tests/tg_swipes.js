// 0.69: у Telegram гра вимикає згортання Mini App свайпом униз (disableVerticalSwipes) — свайп по сторінці лише гортає.
// Запуск з кореня: node tools/tests/tg_swipes.js
const {openSite,checker}=require('./_site.js');
(async()=>{const T=checker('tg_swipes');
  const {b,pg,errs}=await openSite({tg:{initData:'x',platform:'ios'},hash:'#tgWebAppData=x'});
  T.check(await pg.evaluate(()=>window.__noSwipe===1),'Telegram: disableVerticalSwipes викликано');
  T.check(!errs.length,'помилок на сторінці немає '+errs.join('; '));
  await b.close();process.exit(T.done());})();
