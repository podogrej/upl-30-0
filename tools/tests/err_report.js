// 0.68: помилка JavaScript на сторінці → звіт на /api/err (версія, екран, текст, рядок); однакові — одним записом із лічильником.
// Сервер: api/err.js пише в client_errors лише потрібні поля й обрізає довгі. Запуск з кореня: node tools/tests/err_report.js
const {openSite,makeDB,checker,callApi}=require('./_site.js');
(async()=>{const T=checker('err_report');const got=[];
  const {b,pg,errs}=await openSite({db:makeDB({}),api:{'/api/err':async req=>{got.push(req.body);return {status:204};}},wait:1200});
  await pg.evaluate(()=>{for(let i=0;i<3;i++)setTimeout(()=>{throw new Error('тест-помилка 0.68');},0);setTimeout(()=>Promise.reject(new Error('тест-проміс')),0);});
  await pg.waitForTimeout(4200);
  const r=got[0]||{};const e=(r.errors||[]).find(x=>/тест-помилка/.test(x.msg));
  T.check(got.length===1&&!!e,'звіт надіслано одним запитом ('+got.length+')');
  T.check(e&&e.n===3&&e.line>0,'однакові помилки — один запис, n=3, є рядок');
  T.check((r.errors||[]).some(x=>/^promise: тест-проміс/.test(x.msg)),'необроблений проміс теж у звіті');
  T.check(/^\d+\.\d+(\.\d+)?$/.test(r.version||'')&&r.screen==='home','версія й екран: '+r.version+' · '+r.screen);
  await b.close();
  // сервер: обрізання й поля (без бази — sb кидає помилку, відповідь усе одно 204)
  const h=require('../../api/err.js');const res=await callApi(h,{version:'0.68',errors:[{msg:'x'.repeat(999),line:'12',n:500}]});
  T.check(res.status===204,'сервер відповідає 204 навіть без бази');
  process.exit(T.done());})();
