// Clean-up release checks: light-theme contrast, hover only for a mouse, 44px tap targets, full-screen all-time table with plain mode labels,
// invite card in small leagues, header logo on Home, FAQ item instead of the home "about" block, one gradient button per screen.
// Screenshots: tools/tests/out/v074_*.png.   Run from repo root: node tools/tests/v074.js [screenshot dir]
const path=require('path'),fs=require('fs');const {ROOT,openPage}=require('./_page.js');const {launch,makeDB,openSite,checker}=require('./_site.js');
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const shot=(pg,n,full)=>pg.screenshot({path:path.join(OUT,`v074_${n}.png`),fullPage:!!full});
const theme=(pg,t)=>pg.evaluate(t=>document.documentElement.setAttribute('data-theme',t),t);
const home=pg=>pg.evaluate(()=>document.getElementById('homeBtn').click());
// visible buttons/links filled with a gradient (text-clipped logos do not count)
const gradients=pg=>pg.evaluate(()=>[...document.querySelectorAll('button,a')].filter(e=>{const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return r.width>0&&r.height>0&&!e.closest('[hidden]')&&/gradient/.test(cs.backgroundImage)&&cs.backgroundClip!=='text'&&cs.webkitBackgroundClip!=='text';}).map(e=>e.id||e.className));
const lum=c=>{const v=c.map(x=>{x/=255;return x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4);});return .2126*v[0]+.7152*v[1]+.0722*v[2];};
const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
// phone 390x844: draft 11 players and open the pre-season screen
async function draftTo(pg,pre){for(let i=0;i<11;i++){if(!(pre&&!i))await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});await (await pg.$('#squad .pl:not([disabled])')).click();await pg.waitForTimeout(80);
  const t=await pg.$('#pitch .slot.target');if(t){await t.click();await pg.waitForTimeout(60);}}await pg.waitForSelector('#simBtn:not([hidden])');}
function mkDB(n){
  const players=[{id:'p-me',name:'andre',anon_name:'calm_owl',public_id:'andr2345'},{id:'p-v',name:'vitia',anon_name:'brave_fox',public_id:'vitya234'},{id:'p-o',name:'oleh',anon_name:'sly_cat',public_id:'oleh2345'}];
  const base={format:'classic',formation:'4-3-3',verified:true,practice:false,competition:'upl',xi:[],tbl:[],gd:0,created_at:'2026-10-02T11:00:00Z'};
  const seasons=[{id:1,player_id:'p-v',mode:'hard',w:26,d:3,l:1,pts:81,place:1,gf:70,ga:20},{id:2,player_id:'p-me',mode:'normal',formation:'4-4-2',w:26,d:3,l:1,pts:81,place:1,gf:69,ga:21},
    {id:3,player_id:'p-o',mode:'daily',w:25,d:3,l:2,pts:78,place:2,gf:68,ga:22},{id:4,player_id:'p-v',mode:'normal',formation:'3-5-2',w:24,d:3,l:3,pts:75,place:2,gf:66,ga:24},{id:5,player_id:'p-me',mode:'pick',w:23,d:4,l:3,pts:73,place:3,gf:60,ga:30}].map(x=>({...base,...x}));
  const L={id:'abc222',name:'Ліга лави запасних',fmt:'11',start_day:'2026-10-07',days:5,tries:2,take:'best',scoring:'place',rerolls:1,ratings:'show',era:'all'};
  const members=players.slice(0,n).map(p=>p.id);
  const get=()=>{const board=members.map(id=>{const p=players.find(x=>x.id===id);return {u:p.public_id,name:p.name,total:0,wins:0,best:null,played:0};});return {...L,today:'2026-10-07',day_n:2,over:false,owner:'andr2345',board,tour:[]};};
  const js=p=>({id:p.id,name:p.name,anon_name:p.anon_name,public_id:p.public_id,name_next:null,contact_email:null,news_optin:false});
  const rpc={player_hello:()=>js(players[0]),link_account:()=>({...js(players[0]),merge_offer:null}),trophy_stats:()=>({players:3,t:{}}),fl_mine:()=>[],fl_get:()=>get(),tg_leagues_mine:()=>[]};
  const db=makeDB({seasons:{auto:'id'},season_seeds:{auto:'id'},daily_results:{auto:'id'},player_links:{},user_state:{}},rpc);
  db.DB.players=players;db.DB.seasons.push(...seasons);global.fetch=db.fetch;return {db};}
(async()=>{const T=checker('0.74 чистота');
 // ---- A. file:// phone page
 const {b,pg,errs}=await openPage();
 // header on Home: logo, no home or back button
 const h0=await pg.evaluate(()=>{const v=id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return !e.hidden&&r.width>0;};return {logo:v('hLogo'),logoTxt:document.getElementById('hLogo').textContent.trim(),back:v('backBtn'),home:v('homeBtn'),txt:document.querySelector('header.top').innerText};});
 T.check(h0.logo&&/^30-0/.test(h0.logoTxt)&&!h0.back&&!h0.home&&!/Головна|Назад/.test(h0.txt),`головна: у шапці логотип «${h0.logoTxt}», без «Головна» і «Назад»`);
 // contrast in the light theme
 await theme(pg,'light');
 const cc=await pg.evaluate(()=>{const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number),mk=(p,v)=>{const e=document.createElement('i');e.style[p]=`var(--${v})`;document.body.appendChild(e);const c=getComputedStyle(e)[p==='color'?'color':'backgroundColor'];e.remove();return rgb(c);};
   return {bg:mk('backgroundColor','bg'),sf:mk('backgroundColor','surface'),muted:mk('color','muted'),win:mk('color','win'),df:mk('color','df')};});
 for(const k of ['muted','win','df'])for(const g of ['bg','sf']){const r=ratio(cc[k],cc[g]);T.check(r>=4.5,`світла тема: --${k} на --${g==='sf'?'surface':'bg'} ${r.toFixed(2)}:1 (≥4.5)`);}
 await pg.waitForTimeout(600);await shot(pg,'home_phone_light',true);
 await theme(pg,'dark');await pg.waitForTimeout(300);await shot(pg,'home_phone_dark',true);
 // :hover only inside (hover:hover) media
 const hov=await pg.evaluate(()=>{const bad=[];const walk=(rules,ok)=>{for(const r of rules){if(r.type===4||r.constructor.name==='CSSMediaRule'){walk(r.cssRules,ok||/hover:\s*hover/.test(r.conditionText||r.media.mediaText));}else if(r.cssRules&&r.selectorText===undefined){walk(r.cssRules,ok);}else if(r.selectorText&&/:hover/.test(r.selectorText)&&!ok)bad.push(r.selectorText);}};
   for(const s of document.styleSheets)try{walk(s.cssRules,false);}catch(e){}return bad;});
 T.check(hov.length===0,'усі :hover — лише в @media (hover:hover) and (pointer:fine)'+(hov.length?': '+hov.slice(0,4).join(' | '):''));
 const hovN=await pg.evaluate(()=>{let n=0;const walk=rs=>{for(const r of rs){if(r.selectorText&&/:hover/.test(r.selectorText))n++;if(r.cssRules)walk(r.cssRules);}};for(const s of document.styleSheets)walk(s.cssRules);return n;});
 T.check(hovN>=10,'правила :hover збережено в медіазапиті ('+hovN+')');
 // FAQ item and no "about" block on Home
 const ab=await pg.evaluate(()=>({sec:[...document.querySelectorAll('#s1 .sec0')].map(x=>x.textContent),box:!!document.getElementById('aboutBox'),faq:[...document.querySelectorAll('#faqBox summary')].map(s=>s.textContent.trim()),txt:document.getElementById('s1').innerText}));
 T.check(!ab.sec.includes('Про гру та дані')&&!ab.box&&!/Про гру та дані/.test(ab.txt),'головна: блоку «Про гру та дані» немає');
 T.check(ab.faq.some(s=>/Як рахується гра/.test(s)),'«Питання та відповіді»: є «Як рахується гра»');
 await pg.evaluate(()=>{document.getElementById('faqBox').open=true;document.getElementById('calcQ').open=true;});
 const calc=await pg.$eval('#calcQ',e=>e.innerText);T.check(/пуассонівські/.test(calc)&&/Ліга легенд/.test(calc)&&/хімію/.test(calc),'«Як рахується гра» містить опис рейтингів і симуляції');
 // tap targets: FAQ rows, footer links, theme toggle
 const tg=await pg.evaluate(()=>{const H=sel=>[...document.querySelectorAll(sel)].filter(e=>e.getBoundingClientRect().width>0).map(e=>({t:(e.textContent||e.id).trim().slice(0,22),h:Math.round(e.getBoundingClientRect().height)}));
   const th=document.getElementById('themeBtn');th.scrollIntoView({block:'center'});const r=th.getBoundingClientRect(),cx=(r.left+r.right)/2,top=document.elementFromPoint(cx,r.top-9),bot=document.elementFromPoint(cx,r.bottom+9);
   return {faq:H('#faqBox summary'),foot:[...H('.foot0 a'),...H('.ft-small a'),...H('.ft-pill')],thm:{top:top===th,bot:bot===th,w:Math.round(r.width)}};});
 const small=a=>a.filter(x=>x.h<44).map(x=>x.t+' '+x.h);
 T.check(tg.faq.length>=10&&!small(tg.faq).length,`рядки FAQ ≥44px (${tg.faq.length})`+(small(tg.faq).length?' — '+small(tg.faq).join('; '):''));
 T.check(tg.foot.length>=8&&!small(tg.foot).length,`посилання й кнопки підвалу ≥44px (${tg.foot.length})`+(small(tg.foot).length?' — '+small(tg.foot).join('; '):''));
 T.check(tg.thm.top&&tg.thm.bot&&tg.thm.w>=44,`перемикач теми: зона натискання 44px (шир. ${tg.thm.w})`);
 await pg.evaluate(()=>{document.getElementById('faqBox').open=false;});
 // gradient: one button on Home
 let gr=await gradients(pg);T.check(gr.length===1,'головна: один градієнтний елемент-кнопка ('+gr.join()+')');
 // inner screen: Back + home icon
 await pg.click('#freeOpen');await pg.waitForTimeout(400);
 const h1=await pg.evaluate(()=>{const e=id=>document.getElementById(id),r=e('homeBtn').getBoundingClientRect();return {back:!e('backBtn').hidden&&/Назад/.test(e('backBtn').textContent),bh:Math.round(e('backBtn').getBoundingClientRect().height),home:!e('homeBtn').hidden,w:Math.round(r.width),h:Math.round(r.height),logo:!e('hLogo').hidden&&e('hLogo').getBoundingClientRect().width>0,txt:e('homeBtn').textContent.trim()};});
 T.check(h1.back&&h1.home&&!h1.logo&&h1.w>=44&&h1.h>=44&&h1.bh>=44&&!h1.txt,`внутрішній екран: «Назад» + домик ${h1.w}×${h1.h}, логотип сховано`);
 gr=await gradients(pg);T.check(gr.length===1,'налаштування: один градієнтний елемент-кнопка ('+gr.join()+')');
 await shot(pg,'setup_phone_dark',true);await theme(pg,'light');await shot(pg,'setup_phone_light',true);await theme(pg,'dark');
 // draft: ratings switch row, then pre-season: skip link
 await pg.click('#startBtn');await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});
 const rt=await pg.evaluate(()=>{const l=document.getElementById('showRRow');const r=l&&l.getBoundingClientRect();return r&&r.width>0?Math.round(r.height):-1;});
 T.check(rt>=44,'«Рейтинги»: зона перемикача '+rt+'px');
 await shot(pg,'draft_phone_dark');
 await draftTo(pg,true);
 gr=await gradients(pg);T.check(gr.length<=1,'драфт/перед сезоном: градієнтних кнопок '+gr.length+' ('+gr.join()+')');
 await pg.click('#simBtn');await pg.waitForSelector('#skipBtn:visible',{timeout:15000});
 const sk=await pg.$eval('#skipBtn',e=>Math.round(e.getBoundingClientRect().height));T.check(sk>=44,'«Одразу до фіналу сезону»: висота '+sk+'px');
 await shot(pg,'live_phone_dark');
 await pg.click('#skipBtn');await pg.waitForTimeout(700);
 gr=await gradients(pg);T.check(gr.length===1,'підсумок: один градієнтний елемент-кнопка ('+gr.join()+')');
 await shot(pg,'result_phone_dark',true);await theme(pg,'light');await shot(pg,'result_phone_light',true);await theme(pg,'dark');
 const sm=await pg.evaluate(()=>{document.querySelectorAll('#final details').forEach(d=>d.open=false);const t=document.querySelector('#tabs .tab[data-tab="t2"]');if(t)t.click();return [...document.querySelectorAll('#final summary')].filter(s=>s.getBoundingClientRect().width>0).map(s=>({t:s.textContent.trim().slice(0,24),h:Math.round(s.getBoundingClientRect().height)}));});
 T.check(sm.length>=3&&!small(sm).length,`підсумок: summary-рядки ≥44px (${sm.map(x=>x.t+' '+x.h).join('; ')})`);
 T.check(errs.length===0,'помилок на сторінці немає '+errs.join(' | '));
 // iPad home
 await pg.setViewportSize({width:820,height:1180});await home(pg);await pg.waitForTimeout(400);await shot(pg,'home_ipad',true);
 await b.close();
 // ---- B. site with a DB: all-time table
 const bb=await launch();
 {const {db}=mkDB(3);const A=await openSite({b:bb,db,signed:true,viewport:{width:390,height:844},wait:1500});const p=A.pg;
  await p.click('#boardOpen');await p.waitForTimeout(900);
  const bd=await p.evaluate(()=>{const bx=document.getElementById('viewBox'),r=bx.getBoundingClientRect(),box=bx.querySelector('.box'),c=document.getElementById('viewClose'),cr=c.getBoundingClientRect();
    return {hidden:bx.hidden,full:bx.classList.contains('full'),r:[r.left,r.top,r.width,r.height],bw:innerWidth,bh:innerHeight,title:document.getElementById('viewTitle').textContent,close:c.textContent.trim(),ch:Math.round(cr.height),cw:Math.round(cr.width),
      chips:[...document.querySelectorAll('#boardBody .lv')].map(x=>x.textContent),words:[...document.querySelectorAll('#boardBody .lvt')].map(x=>x.textContent),
      txt:document.getElementById('viewBody').innerText,bg:getComputedStyle(bx).backgroundColor,rows:document.querySelectorAll('#boardBody tr[data-q]').length,sub:[...document.querySelectorAll('#boardBody td.nm .sub')].map(x=>x.innerText.replace(/\s+/g,' '))};});
  T.check(!bd.hidden&&bd.full&&bd.r[0]===0&&bd.r[1]===0&&bd.r[2]===bd.bw&&bd.r[3]===bd.bh,`таблиця: на весь екран (${bd.r.join('×')} з ${bd.bw}×${bd.bh})`);
  T.check(bd.title==='Таблиця за весь час'&&bd.close==='Закрити'&&bd.ch>=44&&bd.cw>=44,`заголовок «${bd.title}», кнопка «${bd.close}» ${bd.cw}×${bd.ch}`);
  T.check(bd.rows===5&&!bd.chips.includes('Звичайний')&&!bd.words.includes('Звичайний')&&!/Звичайний/.test(bd.txt),'таблиця: позначки «Звичайний» немає');
  T.check(bd.words.includes('Складний')&&!bd.chips.includes('Складний'),'таблиця: «Складний» — просте слово біля схеми ('+bd.words.join()+')');
  T.check(!/Поруч з іменем/.test(bd.txt),'таблиця: службового рядка про позначку режиму немає');
  await shot(p,'board_phone_dark');await theme(p,'light');await shot(p,'board_phone_light');await theme(p,'dark');
  await p.click('#boardBody tr[data-q]');await p.waitForTimeout(600);
  T.check(await p.$eval('#viewBox',e=>!e.hidden&&e.classList.contains('full'))&&/До таблиці/.test(await p.textContent('#viewBody')),'склад з таблиці: той самий екран, «До таблиці» є');
  await shot(p,'squad_phone_dark');
  await p.click('#viewBack');await p.waitForTimeout(400);await p.click('#viewClose');await p.waitForTimeout(200);
  T.check(await p.$eval('#viewBox',e=>e.hidden&&!e.classList.contains('full')),'«Закрити» закриває таблицю і знімає повний екран');
  await p.click('#newsBtn');await p.waitForTimeout(200);
  T.check(await p.$eval('#viewBox',e=>!e.hidden&&!e.classList.contains('full')),'«Що нового» лишається шторкою, не на весь екран');await p.click('#viewClose');
  await p.setViewportSize({width:820,height:1180});await p.click('#boardOpen');await p.waitForTimeout(700);await shot(p,'board_ipad');
  const wd=await p.evaluate(()=>{const b=document.querySelector('#viewBox .box').getBoundingClientRect(),r=document.getElementById('viewBox').getBoundingClientRect();return {w:b.width,full:r.width===innerWidth&&r.height===innerHeight};});
  T.check(wd.full&&wd.w<=640,'iPad: лист на весь екран, зміст не ширший за 640px ('+wd.w+')');
  await p.click('#viewClose');
  await A.ctx.close();}
 // ---- C. league page: invite card under the round card for small leagues, compact share otherwise
 for(const n of [1,3]){const {db}=mkDB(n);const A=await openSite({b:bb,db,signed:true,viewport:{width:390,height:844},query:'?l=abc222',init:"localStorage.setItem('upl30_player',JSON.stringify({id:'p-me',name:'andre',anon_name:'calm_owl',public_id:'andr2345'}))",wait:1800});const p=A.pg;
  const lg=await p.evaluate(()=>{const q=s=>document.querySelector(s),R=e=>e&&e.getBoundingClientRect();const inv=q('#fl .fl-invc'),tour=q('#fl .fl-tour'),tbl=q('#fl .tbl,#fl .pp-empty'),sh=q('#flShare');
    return {tour:!!tour,inv:!!inv,invTop:inv&&R(inv).top,tourBottom:tour&&R(tour).bottom,tblTop:tbl&&R(tbl).top,share:!!sh,shareIn:sh&&!!sh.closest('.fl-head'),shareH:sh&&Math.round(R(sh).height),input:!!q('#flLinkIn'),text:q('#fl').innerText,
      grad:[...document.querySelectorAll('#fl button')].filter(e=>/gradient/.test(getComputedStyle(e).backgroundImage)&&e.getBoundingClientRect().width>0).map(e=>e.id)};});
  if(n===1){T.check(lg.tour&&lg.inv&&lg.input&&lg.share&&lg.invTop>=lg.tourBottom-1&&lg.invTop<lg.tourBottom+40&&lg.invTop<lg.tblTop,'ліга з 1 учасником: «Запроси друзів» одразу під карткою туру, над таблицею');
    T.check(/Тур 2 з 5/.test(lg.text)&&/Запроси друзів/.test(lg.text),'ліга з 1 учасником: «Тур 2 з 5» і запрошення на місці');
    T.check(lg.grad.length===1&&lg.grad[0]==='flShare','ліга з 1 учасником: градієнт лише в «Поділитися» ('+lg.grad.join()+')');
    await shot(p,'league1_phone_dark',true);await theme(p,'light');await shot(p,'league1_phone_light',true);}
  else{T.check(!lg.inv&&lg.share&&lg.shareIn&&lg.shareH>=44&&!/Запроси друзів/.test(lg.text),`ліга з 3 учасниками: «Поділитися» в шапці (${lg.shareH}px), великої картки немає`);
    T.check(lg.grad.length<=1,'ліга з 3 учасниками: градієнтних кнопок '+lg.grad.length+' ('+lg.grad.join()+')');
    await shot(p,'league3_phone_dark',true);}
  T.check(A.errs.length===0,`ліга (${n}): помилок на сторінці немає ${A.errs.join(' | ')}`);await A.ctx.close();}
 // league list: three steps in one row
 {const {db}=mkDB(1);const A=await openSite({b:bb,db,signed:true,viewport:{width:390,height:844},wait:1500});const p=A.pg;await p.click('#flOpen');await p.waitForTimeout(500);
  const hw=await p.evaluate(()=>{const li=[...document.querySelectorAll('#fl .fl-how li')].map(e=>e.getBoundingClientRect());return {n:li.length,sameRow:li.length===3&&li.every(r=>Math.abs(r.top-li[0].top)<2),cards:document.querySelectorAll('#fl .fl-how>div').length};});
  T.check(hw.n===3&&hw.sameRow&&!hw.cards,'«Як це працює»: три кроки в одному рядку, не три картки');
  T.check((await gradients(p)).length===1,'список ліг: один градієнтний елемент-кнопка');
  await shot(p,'fl_list_phone_dark',true);await theme(p,'light');await shot(p,'fl_list_phone_light',true);await A.ctx.close();}
 await bb.close();
 process.exit(T.done());})();
