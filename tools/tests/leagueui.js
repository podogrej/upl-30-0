// Group league in the Telegram Mini App (Telegram, /api/league and /api/auth are faked): game opened from the group button (start_param g-…) →
// joins the league; silent Telegram sign-in; the chat table lives on the Tables screen (chats tab), not on home;
// seasons go to chat leagues only through the server (the browser never posts a result to /api/league).
// Run from repo root: node tools/tests/leagueui.js [screenshot dir]
const path=require('path'),fs=require('fs');const {ROOT,makeDB,openSite,draftSeason,checker}=require('./_site.js');
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
(async()=>{const T=checker('ліга');const posts=[],auth=[];
 let today=[{name:'Сергій',w:20,d:5,l:5,pts:65,gf:60,ga:30}];let getChat=null;let standings=[{name:'Сергій',wins:2,days:2},{name:'Андрій',wins:1,days:2}],members=3;
 const api={
  '/api/auth':async req=>{auth.push(req.body);return {json:{token_hash:'TH'}};},
  '/api/league':async req=>{if(req.method==='POST'){posts.push(req.body);if(req.body.result)today.unshift({name:'Андрій',...req.body.result});return {json:{ok:true,joined:[],posted:req.body.result?['Футбол по середах']:[]}};}
    getChat=req.url.searchParams.get('chat');return {json:{title:'Футбол по середах',day:'2026-09-28',today,members,standings}};}};
 const tg={initData:'user=x&hash=abc',initDataUnsafe:{user:{id:1,first_name:'Андрій'},start_param:'g-100555'},colorScheme:'dark',platform:'android'};
 const {b,pg,errs}=await openSite({db:makeDB({}),api,tg,hash:'#tgWebAppData=x',viewport:{width:430,height:900},wait:1800});
 T.check(!(await pg.$('#leagueCard'))&&getChat===null,'на головній картки ліги немає, таблиця не вантажиться заздалегідь');
 T.check(posts.length>=1&&posts[0].initData==='user=x&hash=abc'&&!posts[0].result,'вступ у лігу: POST /api/league з initData');
 T.check(auth.length===1&&auth[0].initData==='user=x&hash=abc','тихий вхід: /api/auth з initData');
 T.check(await pg.$eval('#acctBtn',e=>!!e.querySelector('svg.av')),'у шапці — аватарка');
 await pg.click('#acctBtn');await pg.waitForTimeout(300);T.check(/Увійшов через Telegram/.test(await pg.textContent('#pp')),'своя сторінка: «Увійшов через Telegram»');
 await pg.click('#homeBtn');
 await pg.click('#tablesOpen');await pg.waitForTimeout(600);
 const card=await pg.$eval('#tbChats',e=>e.hidden?'':e.textContent.replace(/\s+/g,' ').trim());
 T.check(card.includes('Футбол по середах')&&card.includes('сергій')&&/1 з 3 зіграли/.test(card),'«Таблиці» → «Мої чати»: '+card.slice(0,90));
 T.check(getChat==='-100555','таблицю взято для чату з start_param ('+getChat+')');
 await pg.screenshot({path:path.join(OUT,'league_home.png')});
 await pg.click('#homeBtn');
 await pg.evaluate(()=>window.__dbg.vdOpen('2026-10-12'));await pg.waitForTimeout(300);T.check(/Виклик дня/.test(await pg.textContent('#modeLabel')),'виклик дня відкриває збір складу');
 await pg.evaluate(()=>window.__dbg.go(1));await pg.waitForTimeout(300);
 await pg.click('#freeOpen');await pg.evaluate(()=>window.__dbg.setFmt('classic'));await pg.click('#startBtn');await draftSeason(pg);await pg.waitForTimeout(2000);
 T.check(!posts.some(p=>p.result),'«Грати»: браузер теж нічого не надсилає — сезон зараховує сервер після перевірки');
 // large chat: full list with own row; standings tab
 const nm=['Олег','Марко','Саша','Дмитро','Іра','Петро','Сергій','Таня','Юра','Ліза','Костя','Влад'];
 today=nm.map((x,i)=>({name:x,w:20-i,d:5,l:5+i,pts:70-3*i,gf:50,ga:30}));today.splice(6,0,{name:'Андрій',w:12,d:5,l:13,pts:41,gf:40,ga:40});
 standings=today.map((r,i)=>({name:r.name,wins:13-i,days:14,pts:600}));members=40;
 await pg.evaluate(()=>window.__dbg.lgStale());await pg.click('#homeBtn').catch(()=>{});await pg.click('#tablesOpen');await pg.waitForTimeout(600);
 T.check(await pg.$$eval('#tbChats tbody tr',t=>t.length)===13&&await pg.$eval('#tbChats tr.me',e=>/андрій/i.test(e.textContent)),'«Мої чати» · Сьогодні: усі 13, свій рядок підсвічено');
 T.check(/13 з 40 зіграли/.test(await pg.textContent('#tbChats')),'лічильник «13 з 40 зіграли»');
 await pg.screenshot({path:path.join(OUT,'league_all.png')});
 await pg.click('#lgTabs button[data-t=st]');await pg.waitForTimeout(200);
 T.check(await pg.$$eval('#tbChats tbody tr',t=>t.length)===13&&/Перемог/.test(await pg.textContent('#tbChats')),'«Мої чати» · Залік: усі 13');
 T.check(!errs.length,'помилок на сторінці немає '+errs.join(' | '));
 await b.close();process.exit(T.done());})();
