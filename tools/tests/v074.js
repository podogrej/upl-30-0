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
function mkDB(n,fmt5){
  const players=[{id:'p-me',name:'andre',anon_name:'calm_owl',public_id:'andr2345'},{id:'p-v',name:'vitia',anon_name:'brave_fox',public_id:'vitya234'},{id:'p-o',name:'oleh',anon_name:'sly_cat',public_id:'oleh2345'}];
  const base={format:'classic',formation:'4-3-3',verified:true,practice:false,competition:'upl',xi:[],tbl:[],gd:0,created_at:'2026-10-02T11:00:00Z'};
  const seasons=[{id:1,player_id:'p-v',mode:'hard',w:26,d:3,l:1,pts:81,place:1,gf:70,ga:20},{id:2,player_id:'p-me',mode:'normal',formation:'4-4-2',w:26,d:3,l:1,pts:81,place:1,gf:69,ga:21},
    {id:3,player_id:'p-o',mode:'daily',w:25,d:3,l:2,pts:78,place:2,gf:68,ga:22},{id:4,player_id:'p-v',mode:'normal',formation:'3-5-2',w:24,d:3,l:3,pts:75,place:2,gf:66,ga:24},{id:5,player_id:'p-me',mode:'pick',w:23,d:4,l:3,pts:73,place:3,gf:60,ga:30}].map(x=>({...base,...x}));
  const L={id:'abc222',name:'Ліга лави запасних',fmt:'11',start_day:'2026-10-07',days:5,tries:2,take:'best',scoring:'place',rerolls:1,ratings:'show',era:'all'};
  const members=players.slice(0,n).map(p=>p.id);
  const get=()=>{if(fmt5){const board=members.map(id=>{const p=players.find(x=>x.id===id);return {u:p.public_id,name:p.name};});return {id:'abc222',name:'П\'ятірки',fmt:'5',owner:'andr2345',board,fives:[],result:null,rerolls:1,ratings:'show',era:'all',deadline:new Date(Date.now()+36e5).toISOString(),now:new Date().toISOString()};}
    const board=members.map(id=>{const p=players.find(x=>x.id===id);return {u:p.public_id,name:p.name,total:0,wins:0,best:null,played:0};});return {...L,today:'2026-10-07',day_n:2,over:false,owner:'andr2345',board,tour:[]};};
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
 // ---- B. site with a DB: all-time table on the Tables screen
 const bb=await launch();
 {const {db}=mkDB(3);const A=await openSite({b:bb,db,signed:true,viewport:{width:390,height:844},wait:1500});const p=A.pg;
  await p.click('#tablesOpen');await p.waitForTimeout(900);
  const bd=await p.evaluate(()=>{const s=document.getElementById('s9');
    return {shown:!s.hidden,sheet:!document.getElementById('viewBox').hidden,title:s.querySelector('h2').textContent,tab:document.querySelector('#tbTabs .tab.on').textContent,back:!document.getElementById('backBtn').hidden,
      chips:[...document.querySelectorAll('#boardBody .lv')].map(x=>x.textContent),words:[...document.querySelectorAll('#boardBody .lvt')].map(x=>x.textContent),
      txt:document.getElementById('tbAll').innerText,rows:document.querySelectorAll('#boardBody tr[data-q]').length};});
  T.check(bd.shown&&!bd.sheet&&bd.back,'таблиця: окремий екран «Таблиці» з «Назад», не шторка');
  T.check(bd.title==='Таблиці'&&bd.tab==='За весь час',`заголовок «${bd.title}», вкладка «${bd.tab}»`);
  T.check(bd.rows===5&&!bd.chips.includes('Звичайний')&&!bd.words.includes('Звичайний')&&!/Звичайний/.test(bd.txt),'таблиця: позначки «Звичайний» немає');
  T.check(bd.words.includes('Складний')&&!bd.chips.includes('Складний'),'таблиця: «Складний» — просте слово біля схеми ('+bd.words.join()+')');
  T.check(!/Поруч з іменем/.test(bd.txt),'таблиця: службового рядка про позначку режиму немає');
  await shot(p,'board_phone_dark');await theme(p,'light');await shot(p,'board_phone_light');await theme(p,'dark');
  await p.click('#boardBody tr[data-q]');await p.waitForTimeout(600);
  T.check(await p.evaluate(()=>!document.getElementById('viewBox').hidden&&history.state&&history.state.sheet===1&&!document.getElementById('s9').hidden),'склад з таблиці: шторка над екраном «Таблиці», один запис історії');
  await shot(p,'squad_phone_dark');
  await p.click('#viewClose');await p.waitForTimeout(500);
  T.check(await p.evaluate(()=>!(history.state&&history.state.sheet)&&document.getElementById('viewBox').hidden&&!document.getElementById('s9').hidden),'«Закрити» зі складу — назад до таблиці, запис історії знято');
  await p.click('#boardBody tr[data-q]');await p.waitForTimeout(500);
  await p.evaluate(()=>history.back());await p.waitForTimeout(500);
  T.check(await p.evaluate(()=>document.getElementById('viewBox').hidden&&!document.getElementById('s9').hidden),'системне «назад» зі складу — до таблиці');
  await p.evaluate(()=>history.back());await p.waitForTimeout(500);
  T.check(await p.evaluate(()=>!document.getElementById('s1').hidden&&document.getElementById('s9').hidden),'ще раз «назад» — головна');
  // Telegram fullscreen: the screen title sits below Telegram's own buttons
  await p.evaluate(()=>{document.documentElement.classList.add('tgfs');document.documentElement.style.setProperty('--tg-safe-area-inset-top','60px');document.documentElement.style.setProperty('--tg-content-safe-area-inset-top','54px');});
  await p.click('#tablesOpen');await p.waitForTimeout(400);
  const fsT=await p.evaluate(()=>({back:document.getElementById('backBtn').getBoundingClientRect().top,title:document.querySelector('#s9 h2').getBoundingClientRect().top}));
  T.check(fsT.back>=114&&fsT.title>=114,`tgfs: «Назад» і заголовок нижче кнопок Telegram (${Math.round(fsT.back)}/${Math.round(fsT.title)}px ≥114)`);
  await p.evaluate(()=>{document.documentElement.classList.remove('tgfs');});
  await p.click('#newsBtn');await p.waitForTimeout(200);
  T.check(await p.$eval('#viewBox',e=>!e.hidden),'«Що нового» лишається шторкою');await p.click('#viewClose');await p.waitForTimeout(300);
  await p.setViewportSize({width:820,height:1180});await p.waitForTimeout(300);await shot(p,'board_ipad');
  const wd=await p.evaluate(()=>document.getElementById('tbAll').getBoundingClientRect().width);
  T.check(wd<=640,'iPad: таблиця не ширша за 640px ('+wd+')');
  await A.ctx.close();}
 // ---- C. league page: invite card under the round card for small leagues, compact share otherwise
 for(const [n,f5,guest] of [[1,0,0],[2,0,0],[3,0,0],[1,1,0],[2,1,0],[3,1,0],[1,0,1]]){const {db}=mkDB(n,f5);const A=await openSite({b:bb,db,signed:true,viewport:{width:390,height:844},query:'?l=abc222',init:guest?'localStorage.setItem("upl30_player",JSON.stringify({id:"p-x",name:"guest",anon_name:"g",public_id:"gest2345"}))':"localStorage.setItem('upl30_player',JSON.stringify({id:'p-me',name:'andre',anon_name:'calm_owl',public_id:'andr2345'}))",wait:1800});const p=A.pg;
  if(guest)await p.waitForFunction(()=>/Приєднатися|Увійти/.test((document.getElementById('fl')||{}).innerText||''),null,{timeout:5000}).catch(()=>{});
  const lg=await p.evaluate(()=>{const q=s=>document.querySelector(s),R=e=>e&&e.getBoundingClientRect();const inv=q('#fl .fl-invc'),tour=q('#fl .fl-tour'),tbl=q('#fl .tbl,#fl .pp-empty'),sh=q('#flShare');
    return {tour:!!tour,inv:!!inv,invTop:inv&&R(inv).top,tourBottom:tour&&R(tour).bottom,tblTop:tbl&&R(tbl).top,share:!!sh,shareIn:sh&&!!sh.closest('.fl-head'),shareH:sh&&Math.round(R(sh).height),input:!!q('#flLinkIn'),text:q('#fl').innerText,
      grad:[...document.querySelectorAll('#fl button')].filter(e=>/gradient/.test(getComputedStyle(e).backgroundImage)&&e.getBoundingClientRect().width>0).map(e=>e.id)};});
  const tag=`${f5?'5×5':'11×11'}, учасників ${n}${guest?' (гість за посиланням)':''}`;
  if(guest){T.check(!lg.inv&&lg.tour&&lg.share&&lg.shareIn&&/Приєднатися|Увійти/.test(lg.text),`${tag}: гість бачить «Приєднатися»/«Увійти» і компактне «Поділитися», великої картки немає`);   // join vs sign-in depends on when the session arrives
    T.check(lg.grad.length<=1,`${tag}: градієнтних кнопок ${lg.grad.length} (${lg.grad.join()})`);await shot(p,'league_guest_phone_dark',true);}
  else if(n<3){T.check(lg.tour&&lg.inv&&lg.input&&lg.share&&lg.invTop>=lg.tourBottom-1&&lg.invTop<lg.tourBottom+40&&(f5||lg.invTop<lg.tblTop),`${tag}: «Запроси друзів» одразу під карткою туру/збору`);
    T.check(lg.grad.length===1&&lg.grad[0]==='flShare',`${tag}: градієнт лише в «Поділитися» (${lg.grad.join()})`);
    T.check(!/Запросити/.test(lg.text.replace(/Запроси друзів/g,'')),`${tag}: нижнього блоку «Запросити» немає`);
    if(n===1&&!f5){T.check(/Тур 2 з 5/.test(lg.text),'11×11: «Тур 2 з 5» на місці');await shot(p,'league1_phone_dark',true);await theme(p,'light');await shot(p,'league1_phone_light',true);}
    if(f5&&n===2)await shot(p,'league5_2_phone_dark',true);}
  else{T.check(!lg.inv&&lg.share&&lg.shareIn&&lg.shareH>=44&&!/Запроси друзів/.test(lg.text),`${tag}: «Поділитися» в шапці (${lg.shareH}px), великої картки немає`);
    T.check(lg.grad.length<=1,`${tag}: градієнтних кнопок ${lg.grad.length} (${lg.grad.join()})`);
    if(!f5)await shot(p,'league3_phone_dark',true);}
  T.check(A.errs.length===0,`ліга (${tag}): помилок на сторінці немає ${A.errs.join(' | ')}`);await A.ctx.close();}
 // league list: three steps in one row
 {const {db}=mkDB(1);const A=await openSite({b:bb,db,signed:true,viewport:{width:390,height:844},wait:1500});const p=A.pg;await p.click('#flOpen');await p.waitForTimeout(500);
  const hw=await p.evaluate(()=>{const li=[...document.querySelectorAll('#fl .fl-how li')].map(e=>e.getBoundingClientRect());return {n:li.length,sameRow:li.length===3&&li.every(r=>Math.abs(r.top-li[0].top)<2),cards:document.querySelectorAll('#fl .fl-how>div').length};});
  T.check(hw.n===3&&hw.sameRow&&!hw.cards,'«Як це працює»: три кроки в одному рядку, не три картки');
  T.check((await gradients(p)).length===1,'список ліг: один градієнтний елемент-кнопка');
  await shot(p,'fl_list_phone_dark',true);await theme(p,'light');await shot(p,'fl_list_phone_light',true);await A.ctx.close();}
 // Telegram BackButton is shown while the sheet is open on Home, and its tap closes the sheet
 {const {db}=mkDB(3);const init="window.__bb={vis:false,cb:null};let _t;Object.defineProperty(window,'Telegram',{configurable:true,get(){return _t},set(v){if(v&&v.WebApp)v.WebApp.BackButton={show(){window.__bb.vis=true},hide(){window.__bb.vis=false},onClick(f){window.__bb.cb=f}};_t=v}})";
  const tg={initData:'user=x&hash=abc',initDataUnsafe:{user:{id:1,first_name:'A'}},colorScheme:'dark',platform:'android'};
  const api={'/api/auth':async()=>({json:{token_hash:'TH'}}),'/api/league':async()=>({json:{ok:true}})};
  const A=await openSite({b:bb,db,api,tg,init,hash:'#tgWebAppData=x',viewport:{width:430,height:900},wait:1800});const p=A.pg;
  T.check(await p.evaluate(()=>window.__bb.vis===false),'Telegram: на головній BackButton схований');
  await p.click('#tablesOpen');await p.waitForTimeout(500);
  T.check(await p.evaluate(()=>window.__bb.vis===true),'Telegram: на екрані «Таблиці» BackButton показано');
  await p.evaluate(()=>window.__bb.cb());await p.waitForTimeout(500);
  T.check(await p.evaluate(()=>!document.getElementById('s1').hidden&&window.__bb.vis===false),'Telegram: BackButton веде на головну й знову ховається');
  await A.ctx.close();}
 await bb.close();
 process.exit(T.done());})();
