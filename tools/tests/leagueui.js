// Group league in the Telegram Mini App (Telegram, /api/league and /api/auth are faked): game opened from the group button (start_param g-…) →
// joins the league, league card on home; silent Telegram sign-in; daily challenge → result goes to /api/league and shows on the board.
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
 const card=await pg.$eval('#leagueCard',e=>e.hidden?'':e.textContent.replace(/\s+/g,' ').trim());
 T.check(card.includes('«Футбол по середах»')&&card.includes('сергій')&&/Сьогодні зіграли 1 з 3/.test(card),'картка ліги: '+card.slice(0,90));
 T.check(getChat==='-100555','картку взято для чату з start_param ('+getChat+')');
 T.check(posts.length>=1&&posts[0].initData==='user=x&hash=abc'&&!posts[0].result,'вступ у лігу: POST /api/league з initData');
 T.check(auth.length===1&&auth[0].initData==='user=x&hash=abc','тихий вхід: /api/auth з initData');
 T.check(await pg.$eval('#acctBtn',e=>!!e.querySelector('svg.av')),'у шапці — аватарка');
 await pg.click('#acctBtn');await pg.waitForTimeout(300);T.check(/Увійшов через Telegram/.test(await pg.textContent('#pp')),'своя сторінка: «Увійшов через Telegram»');
await pg.click('#homeBtn');
 await pg.screenshot({path:path.join(OUT,'league_home.png')});
 await pg.click('#leagueGo');T.check(/Драфт дня/.test(await pg.textContent('#modeLabel')),'«Зіграти драфт дня» з картки ліги відкриває драфт дня');
 await draftSeason(pg);await pg.waitForTimeout(1500);
 const res=posts.find(p=>p.result);T.check(res&&res.result.day&&typeof res.result.pts==='number'&&res.result.formation,'результат дня надіслано в лігу: '+(res?JSON.stringify(res.result).slice(0,100):'—'));
 const msg=await pg.$eval('#leagueMsg',e=>e.hidden?'':e.textContent);T.check(/табло групи: «Футбол по середах»/.test(msg),'повідомлення: '+msg);
 await pg.click('#againBtn');await pg.waitForTimeout(600);
 const after=await pg.$eval('#leagueCard',e=>e.textContent.replace(/\s+/g,' ').trim());
 T.check(/Сьогодні зіграли 2 з 3/.test(after)&&!/уже в табло групи/.test(after)&&!(await pg.$('#leagueGo')),'картка після гри (0.65: без «уже в табло групи», без кнопки): '+after.slice(0,90));
 // large chat: home shows top-3 + own row; "full table (N)" opens a screen with today/standings tabs
 const nm=['Олег','Марко','Саша','Дмитро','Іра','Петро','Сергій','Таня','Юра','Ліза','Костя','Влад'];
 today=nm.map((x,i)=>({name:x,w:20-i,d:5,l:5+i,pts:70-3*i,gf:50,ga:30}));today.splice(6,0,{name:'Андрій',w:12,d:5,l:13,pts:41,gf:40,ga:40});
 standings=today.map((r,i)=>({name:r.name,wins:13-i,days:14,pts:600}));members=40;
 await pg.evaluate(()=>window.__dbg.leagueLoad('-100555',true));await pg.waitForTimeout(400);
 const rows=await pg.$$eval('#leagueCard tr',t=>t.map(r=>r.textContent.replace(/\s+/g,' ').trim()));
 T.check(rows.length===5&&/^1/.test(rows[0])&&/^3/.test(rows[2])&&rows[3]==='…'&&/^7/.test(rows[4])&&/андрій/i.test(rows[4]),'головна: топ-3, «…» і свій рядок (7-й): '+rows.join(' | '));
 T.check(await pg.$eval('#leagueCard tr:last-child',e=>e.classList.contains('me')),'свій рядок підсвічено');
 T.check(/Уся таблиця \(40\)/.test(await pg.textContent('#leagueAll')),'посилання «Уся таблиця (40)»');
 await pg.click('#leagueAll');await pg.waitForTimeout(300);
 T.check(await pg.$$eval('#viewBody tr',t=>t.length)===13&&await pg.$eval('#viewBody tr.me',e=>/андрій/i.test(e.textContent)),'«Уся таблиця» · Сьогодні: усі 13, свій рядок підсвічено');
 await pg.screenshot({path:path.join(OUT,'league_all.png')});
 await pg.click('#lgTabs button[data-t=st]');await pg.waitForTimeout(200);
 T.check(await pg.$$eval('#viewBody tr:not(.th)',t=>t.length)===13&&/перемог/.test(await pg.textContent('#viewBody')),'«Уся таблиця» · Залік: усі 13');
 await pg.click('#viewClose');
 T.check(!errs.length,'помилок на сторінці немає '+errs.join(' | '));
 await b.close();process.exit(T.done());})();
