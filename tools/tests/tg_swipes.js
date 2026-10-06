// In Telegram the game disables swipe-down-to-collapse of the Mini App (disableVerticalSwipes), so a swipe only scrolls the page.
// Run from repo root: node tools/tests/tg_swipes.js
const {openSite,checker}=require('./_site.js');
(async()=>{const T=checker('tg_swipes');
  const {b,pg,errs}=await openSite({tg:{initData:'x',platform:'ios'},hash:'#tgWebAppData=x'});
  T.check(await pg.evaluate(()=>window.__noSwipe===1),'Telegram: disableVerticalSwipes викликано');
  T.check(!errs.length,'помилок на сторінці немає '+errs.join('; '));
  await b.close();process.exit(T.done());})();
