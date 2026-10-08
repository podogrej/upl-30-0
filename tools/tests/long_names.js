// Longest possible names: nickname of 20 "w" (widest Latin glyph), Telegram name of 24 wide Cyrillic letters (server truncates to 24),
// team name of 22 wide letters. On narrow (320) and normal (390) phones nothing overflows: header, own page, chat league on home
// and its full table, global table, season summary. Run from repo root: node tools/tests/long_names.js
const {openSite,makeDB,checker,draftSeason}=require('./_site.js');
const NICK='w'.repeat(20),TGN='Ш'.repeat(24),TEAM='Ш'.repeat(22);
const OVER=()=>{const W=innerWidth,bad=[];const clip=el=>{for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){const o=getComputedStyle(p).overflowX;if(o!=='visible')return true;}return false;};
  for(const el of document.querySelectorAll('body *')){if(el.closest('[hidden]')||!el.getClientRects().length)continue;const r=el.getBoundingClientRect();if(r.width&&r.right>W+1&&!clip(el))bad.push((el.id||el.className||el.tagName)+' '+Math.round(r.right)+'>'+W);}
  // tables: no horizontal scroll, all columns (points, W-D-L) visible
  for(const t of document.querySelectorAll('.tbl')){if(t.closest('[hidden]')||!t.getClientRects().length)continue;if(t.scrollWidth>t.clientWidth+1)bad.push('таблиця прокручується вбік '+t.scrollWidth+'>'+t.clientWidth);}
  for(const c of document.querySelectorAll('.tbl td.num')){if(c.closest('[hidden]')||!c.getClientRects().length)continue;if(c.getClientRects().length>1||c.scrollHeight>c.clientHeight+2||/\n/.test(c.innerText.trim()))bad.push('цифри перенеслись: '+c.innerText.trim().replace(/\n/g,'⏎'));}
  return {sw:document.documentElement.scrollWidth,W,bad:bad.slice(0,4)};};
(async()=>{const T=checker('long_names');
 for(const w of [320,390]){
  const today=[...Array(12)].map((_,i)=>({name:TGN,u:i===5?'abcdefgh':null,w:20,d:5,l:5,pts:65-i,gf:50,ga:30}));
  const api={'/api/league':async()=>({json:{title:'Хто програв — біжить по мʼяч',day:'2026-10-02',today,members:40,standings:today.map((r,i)=>({name:TGN,u:r.u,wins:12-i,days:14,pts:600}))}})};
  const init=`localStorage.setItem('upl30_player',JSON.stringify({id:'p1',name:'${NICK}',anon_name:'silent_owl',public_id:'abcdefgh'}));localStorage.setItem('upl30_team','${TEAM}');`;
  const {b,pg,errs}=await openSite({db:makeDB({},{tg_leagues_mine:()=>[{chat_id:-1,title:'Хто програв — біжить по мʼяч'},{chat_id:-2,title:'Ветерани дворового футболу Оболоні'}]}),api,init,viewport:{width:w,height:800},wait:1200});
  const OUT=require('path').join(__dirname,'out');let shot=0;
  const chk=async name=>{await pg.waitForTimeout(250);await pg.screenshot({path:`${OUT}/long_${w}_${++shot}.png`});const o=await pg.evaluate(OVER);T.check(o.sw<=o.W+1&&!o.bad.length,`${w}px · ${name}: нічого не вилазить`+(o.bad.length||o.sw>o.W+1?` — ширина ${o.sw}>${o.W}: ${o.bad.join('; ')}`:''));};
  await chk('головна, шапка з ніком 20 символів');
  await pg.click('#tablesOpen');await pg.click('#tbTabs .tab[data-tb=chats]');await pg.waitForTimeout(600);await chk('«Мої чати» · Сьогодні (імена 24 «Ш», довгі назви чатів)');
  await pg.click('#lgTabs button[data-t=st]');await chk('«Мої чати» · Залік');await pg.click('#homeBtn');
  await pg.evaluate(n=>{const rows=[...Array(5)].map((_,i)=>({id:i+1,device_id:'d',nickname:n,w:20,d:5,l:5,pts:65,place:1,gf:60,ga:20,formation:'4-4-2',mode:'normal',club:'dynamo-kyiv',created_at:'2026-10-01T10:00:00Z',players:{name:n,public_id:'abcdefgh'}}));
    document.getElementById('viewBody').innerHTML=`<div id="boardBody">${window.__dbg.boardHtml(rows,'main')}</div>`;document.getElementById('viewBox').hidden=false;},NICK);
  await chk('загальна таблиця (нік 20)');await pg.click('#viewClose');
  await pg.click('#acctBtn');await chk('своя сторінка (нік 20, назва команди 22)');
  await pg.click('#homeBtn');await pg.click('#freeOpen');await pg.click('#startBtn');await draftSeason(pg);await pg.waitForTimeout(1500);
  await chk('підсумки сезону (назва команди 22 у таблиці)');
  T.check(!errs.length,`${w}px: помилок JS немає`+(errs.length?' — '+errs.slice(0,2).join('; '):''));
  await b.close();}
 process.exit(T.done());})();
