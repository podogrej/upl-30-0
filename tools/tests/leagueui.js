// Ліга групи в Telegram Mini App (Telegram, /api/league і /api/auth підроблені): гру відкрито з кнопки групи (start_param g-…) →
// вступ у лігу й картка ліги на головній; тихий вхід через Telegram; виклик дня → результат іде в /api/league і показується в табло.
// Запуск з кореня: node tools/tests/leagueui.js [папка для знімків]
const path=require('path'),fs=require('fs');const {ROOT,makeDB,openSite,draftSeason,checker}=require('./_site.js');
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
(async()=>{const T=checker('ліга');const posts=[],auth=[];
 let today=[{name:'Сергій',w:20,d:5,l:5,pts:65,gf:60,ga:30}];let getChat=null;
 const api={
  '/api/auth':async req=>{auth.push(req.body);return {json:{token_hash:'TH'}};},
  '/api/league':async req=>{if(req.method==='POST'){posts.push(req.body);if(req.body.result)today.unshift({name:'Андрій',...req.body.result});return {json:{ok:true,joined:[],posted:req.body.result?['Футбол по середах']:[]}};}
    getChat=req.url.searchParams.get('chat');return {json:{title:'Футбол по середах',day:'2026-09-28',today,members:3,standings:[{name:'Сергій',wins:2},{name:'Андрій',wins:1}]}};}};
 const tg={initData:'user=x&hash=abc',initDataUnsafe:{user:{id:1,first_name:'Андрій'},start_param:'g-100555'},colorScheme:'dark',platform:'android'};
 const {b,pg,errs}=await openSite({db:makeDB({}),api,tg,hash:'#tgWebAppData=x',viewport:{width:430,height:900},wait:1800});
 const card=await pg.$eval('#leagueCard',e=>e.hidden?'':e.textContent.replace(/\s+/g,' ').trim());
 T.check(card.includes('«Футбол по середах»')&&card.includes('Сергій')&&/Сьогодні зіграли 1 з 3/.test(card),'картка ліги: '+card.slice(0,90));
 T.check(getChat==='-100555','картку взято для чату з start_param ('+getChat+')');
 T.check(posts.length>=1&&posts[0].initData==='user=x&hash=abc'&&!posts[0].result,'вступ у лігу: POST /api/league з initData');
 T.check(auth.length===1&&auth[0].initData==='user=x&hash=abc','тихий вхід: /api/auth з initData');
 T.check(/Андрій/.test(await pg.textContent('#acctBtn')),'після входу в шапці ім\'я: '+(await pg.textContent('#acctBtn')).trim());
 await pg.click('#acctBtn');await pg.waitForTimeout(200);T.check(!(await pg.$('#acctG')),'у Telegram немає кнопки Google');await pg.click('#viewClose');
 await pg.screenshot({path:path.join(OUT,'league_home.png')});
 await pg.click('#leagueGo');T.check(/Виклик дня/.test(await pg.textContent('#modeLabel')),'«Зіграти виклик дня» з картки ліги відкриває виклик дня');
 await draftSeason(pg);await pg.waitForTimeout(1500);
 const res=posts.find(p=>p.result);T.check(res&&res.result.day&&typeof res.result.pts==='number'&&res.result.formation,'результат дня надіслано в лігу: '+(res?JSON.stringify(res.result).slice(0,100):'—'));
 const msg=await pg.$eval('#leagueMsg',e=>e.hidden?'':e.textContent);T.check(/табло групи: «Футбол по середах»/.test(msg),'повідомлення: '+msg);
 await pg.click('#againBtn');await pg.waitForTimeout(600);
 const after=await pg.$eval('#leagueCard',e=>e.textContent.replace(/\s+/g,' ').trim());
 T.check(/Сьогодні зіграли 2 з 3/.test(after)&&/уже в табло групи/.test(after)&&!(await pg.$('#leagueGo')),'картка після гри: '+after.slice(0,90));
 T.check(!errs.length,'помилок на сторінці немає '+errs.join(' | '));
 await b.close();process.exit(T.done());})();
