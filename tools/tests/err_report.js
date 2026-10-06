// A page JS error → report to /api/err (version, screen, message, line); identical errors are merged into one record with a counter.
// Server: api/err.js writes only the needed fields to client_errors and truncates long ones. Run from repo root: node tools/tests/err_report.js
const {openSite,makeDB,checker,callApi}=require('./_site.js');
(async()=>{const T=checker('err_report');const got=[];
  let FAIL=false;const {b,pg,errs}=await openSite({db:makeDB({}),api:{'/api/err':async req=>{got.push(req.body);if(req.body&&req.body.feedback)return FAIL?{status:503,json:{error:'Не вдалося надіслати. Спробуй ще раз або напиши боту @upl30_bot.'}}:{status:200,json:{ok:true}};return {status:204};}},wait:1200});
  await pg.evaluate(()=>{for(let i=0;i<3;i++)setTimeout(()=>{throw new Error('тест-помилка 0.68');},0);setTimeout(()=>Promise.reject(new Error('тест-проміс')),0);});
  await pg.waitForTimeout(4200);
  const r=got[0]||{};const e=(r.errors||[]).find(x=>/тест-помилка/.test(x.msg));
  T.check(got.length===1&&!!e,'звіт надіслано одним запитом ('+got.length+')');
  T.check(e&&e.n===3&&e.line>0,'однакові помилки — один запис, n=3, є рядок');
  T.check((r.errors||[]).some(x=>/^promise: тест-проміс/.test(x.msg)),'необроблений проміс теж у звіті');
  T.check(/^\d+\.\d+(\.\d+)?$/.test(r.version||'')&&r.screen==='home','версія й екран: '+r.version+' · '+r.screen);
  // feedback form lives in the footer; no 💬 button in the header
  got.length=0;
  T.check(await pg.evaluate(()=>!document.querySelector('header #fbBtn')&&!!document.querySelector('#ft #fbBtn')&&document.getElementById('fbForm').hidden),'«Відгук і баги» — у підвалі, не в шапці; форма закрита');
  await pg.click('#fbBtn');T.check(await pg.evaluate(()=>!document.getElementById('fbForm').hidden&&document.getElementById('fbBtn').hidden&&document.activeElement.id==='fbTxt'),'тап — форма відкрилась, курсор у полі');
  await pg.click('#fbSend');await pg.waitForTimeout(200);T.check(!got.length,'порожній відгук не надсилається');
  FAIL=true;await pg.fill('#fbTxt','Не тиснеться «Інший сезон»');await pg.fill('#fbContact','a@b.c');await pg.click('#fbSend');await pg.waitForTimeout(500);
  T.check(await pg.evaluate(()=>!document.getElementById('fbErr').hidden&&/Спробуй ще раз/.test(document.getElementById('fbErr').textContent)&&!document.getElementById('fbForm').hidden&&document.getElementById('fbTxt').value!==''),'сервер не прийняв — помилка, текст не загубився');
  FAIL=false;await pg.click('#fbSend');await pg.waitForTimeout(500);const fb=(got[got.length-1]||{});
  T.check(fb.feedback&&fb.feedback.text==='Не тиснеться «Інший сезон»'&&fb.feedback.contact==='a@b.c'&&/^\d+\.\d+/.test(fb.version||'')&&fb.screen,'надіслано текст, контакт, версію й екран');
  T.check(await pg.evaluate(()=>document.getElementById('fbForm').hidden&&!document.getElementById('fbDone').hidden&&!document.getElementById('fbBtn').hidden),'«Дякуємо!» — форма закрилась');
  await pg.click('#fbBtn');await pg.click('#fbCancel');T.check(await pg.evaluate(()=>document.getElementById('fbForm').hidden&&!document.getElementById('fbBtn').hidden),'«Скасувати» закриває форму');
  await b.close();
  // server: truncation and fields (no DB: sb throws, response is still 204)
  const h=require('../../api/err.js');const res=await callApi(h,{version:'0.68',errors:[{msg:'x'.repeat(999),line:'12',n:500}]});
  T.check(res.status===204,'сервер відповідає 204 навіть без бази');
  process.exit(T.done());})();
