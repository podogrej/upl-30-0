// «Що нового»: крапка біля версії до першого перегляду, вікно з пунктами WHATSNEW, після перегляду крапки немає (і після перезавантаження).
// Вхід через бота на сайті: посилання t.me/upl30_bot?start=login_<токен>, сторінка опитує /api/auth (202 — чекаємо «Start», потім token_hash) і входить.
// Запуск з кореня: node tools/tests/news.js [папка для знімків]
const path=require('path'),fs=require('fs');const {ROOT,makeDB,openSite,checker}=require('./_site.js');
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
(async()=>{const T=checker('новини й вхід');const auth=[];let mode='pending';
 const api={'/api/auth':async req=>{auth.push(req.body);return mode==='pending'?{status:202,json:{pending:true}}:{json:{token_hash:'abc',name:'Андрій'}};}};
 const {b,ctx,pg,errs}=await openSite({db:makeDB({}),api,viewport:{width:390,height:900}});
 const tpl=fs.readFileSync(path.join(ROOT,'src','template.html'),'utf8');const items=(tpl.match(/const WHATSNEW=\{[\s\S]*?\]\]\};/)||[''])[0].split("['").length-1;
 T.check(await pg.$eval('#newsDot',e=>!e.hidden),'крапка «нове» видна при першому відкритті');
 await pg.click('#newsBtn');await pg.waitForTimeout(300);
 const nv=await pg.evaluate(()=>({t:document.getElementById('viewTitle').textContent,n:document.querySelectorAll('#viewBody .ni').length}));
 T.check(/Що нового · версія \d+\.\d+/.test(nv.t)&&nv.n===items&&nv.n>0,`вікно «${nv.t}»: ${nv.n} пунктів (у WHATSNEW ${items})`);
 await pg.locator('#viewBox .box').screenshot({path:path.join(OUT,'news.png')});
 await pg.click('#viewClose');T.check(await pg.$eval('#newsDot',e=>e.hidden),'після перегляду крапки немає');
 await pg.reload();await pg.waitForTimeout(1000);T.check(await pg.$eval('#newsDot',e=>e.hidden),'після перезавантаження крапки теж немає');
 // вхід через бота
 await pg.click('#acctBtn');await pg.waitForTimeout(300);await pg.click('#ppLogin');await pg.waitForTimeout(300);await pg.locator('#viewBox .box').screenshot({path:path.join(OUT,'acct.png')});
 const href=await pg.getAttribute('#acctBot','href');const tok=(/start=login_([0-9a-f]{32})$/.exec(href||'')||[])[1];
 T.check(/^https:\/\/t\.me\/upl30_bot\?start=login_/.test(href||'')&&!!tok,'посилання на бота з токеном: '+href);
 T.check(!!(await pg.$('#acctG')),'на сайті є кнопка Google');
 const [popup]=await Promise.all([ctx.waitForEvent('page',{timeout:3000}).catch(()=>null),pg.click('#acctBot')]);if(popup)await popup.close().catch(()=>{});
 await pg.waitForTimeout(3500);
 T.check(auth.length>=1&&auth.every(a=>a.login_token===tok),`поки «Start» не натиснуто — опитування /api/auth (${auth.length}) з тим самим токеном`);
 T.check(/Чекаємо підтвердження/.test(await pg.textContent('#viewBody')),'підказка «Чекаємо підтвердження»');
 mode='ok';await pg.waitForTimeout(3500);
 const body=(await pg.textContent('#viewBody')).replace(/\s+/g,' ');await pg.click('#viewClose');const page=(await pg.textContent('#pp')).replace(/\s+/g,' ');
 T.check(/Ти увійшов як Андрій через Telegram/.test(body)&&/Увійшов через Telegram/.test(page),`увійшов: ${body.slice(0,60)}; сторінка: «Увійшов через Telegram»`);
 const n=auth.length;await pg.waitForTimeout(3000);T.check(auth.length===n,'після входу опитування зупинилось');
 T.check(!errs.length,'помилок на сторінці немає '+errs.join(' | '));
 await b.close();process.exit(T.done());})();
