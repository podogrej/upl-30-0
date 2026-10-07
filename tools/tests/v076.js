// Sheets and skeletons: every dialog is a bottom sheet on a phone (spring in, blurred dim backdrop, grabber, swipe down, back/Escape/backdrop close,
// focus in and back to the trigger), a centered card on iPad, instant under reduced motion; loading states are shimmer skeletons with the final layout.
// Screenshots: tools/tests/out/v076_*.png.   Run from repo root: node tools/tests/v076.js [screenshot dir]
const path=require('path'),fs=require('fs');const {ROOT,openPage}=require('./_page.js');const {launch,makeDB,openSite,checker}=require('./_site.js');
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const shot=(pg,n,full)=>pg.screenshot({path:path.join(OUT,`v076_${n}.png`),fullPage:!!full});
const theme=(pg,t)=>pg.evaluate(t=>document.documentElement.setAttribute('data-theme',t),t);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const TODAY=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const geo=(pg,sel)=>pg.evaluate(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,w:r.width,h:r.height,vh:innerHeight,vw:innerWidth,rad:parseFloat(getComputedStyle(e).borderTopLeftRadius)};},sel);
const st=pg=>pg.evaluate(()=>({hidden:document.getElementById('viewBox').hidden,sheet:(history.state&&history.state.sheet)||0,ghosts:document.querySelectorAll('.sheet-ghost').length,focus:document.activeElement&&(document.activeElement.id||document.activeElement.className)}));
// press the grabber/header at x offset and drag by dy in steps; returns release()
async function drag(pg,sel,dy,o={}){const {steps=8,pause=16,hold=0}=o;const g=await pg.evaluate(s=>{const r=document.querySelector(s).getBoundingClientRect();return [r.left+r.width/2-60,r.top+12];},sel);
  await pg.mouse.move(g[0],g[1]);await pg.mouse.down();for(let i=1;i<=steps;i++){await pg.mouse.move(g[0],g[1]+dy*i/steps);if(pause)await pg.waitForTimeout(pause);}
  if(hold)await pg.waitForTimeout(hold);return ()=>pg.mouse.up();}
const bdInfo=(pg,sel)=>pg.evaluate(s=>{const e=document.querySelector(s),cs=getComputedStyle(e),f=cs.backdropFilter||cs.webkitBackdropFilter||'',a=+(cs.backgroundColor.match(/[\d.]+/g)||[0,0,0,1])[3];return {blur:/blur\(/.test(f),alpha:isNaN(a)?1:a,display:cs.display};},sel);
// DB for the site part
function mkDB(){
  const players=[{id:'p-me',name:'andre',anon_name:'calm_owl',public_id:'andr2345'},{id:'p-v',name:'vitia',anon_name:'brave_fox',public_id:'vitya234'}];
  const base={format:'classic',formation:'4-3-3',verified:true,practice:false,competition:'upl',xi:[],tbl:[],gd:0,created_at:'2026-10-02T11:00:00Z'};
  const seasons=[...Array(12).keys()].map(i=>({...base,id:i+1,player_id:i%2?'p-me':'p-v',mode:'normal',formation:'4-4-2',w:26-i,d:3,l:1+i,pts:81-3*i,place:1+(i>>2),gf:70-i,ga:20+i}));
  const js=p=>({id:p.id,name:p.name,anon_name:p.anon_name,public_id:p.public_id,name_next:null,contact_email:null,news_optin:false});
  const prof=p=>({public_id:p.public_id,name:p.name,anon:false,since:'2026-09-02T10:00:00Z',seasons:12,champions:2,perfect:0,best_classic:81,win_pct:60,best:{},worst:{},trophies:[],streak_best:3,streak_now:0});
  const L={id:'abc222',name:'Ліга лави запасних',fmt:'11',start_day:TODAY,days:5,tries:2,take:'best',scoring:'place',rerolls:1,ratings:'show',era:'all'};
  const leagueGet=()=>({...L,today:TODAY,day_n:2,over:false,owner:'andr2345',board:players.map(p=>({u:p.public_id,name:p.name,total:0,wins:0,best:null,played:0})),tour:[]});
  const rpc={player_hello:()=>js(players[0]),link_account:()=>({...js(players[0]),merge_offer:null}),trophy_stats:()=>({players:30,t:{}}),
    fl_mine:()=>[{id:'abc222',name:L.name,fmt:'11',day_n:2,days:5,members:2,over:false}],fl_get:leagueGet,tg_leagues_mine:()=>[],
    player_profile:()=>prof(players[0]),player_profile_pub:a=>prof(players.find(p=>p.public_id===a.p_public)||players[1])};
  const db=makeDB({seasons:{auto:'id'},season_seeds:{auto:'id'},daily_results:{auto:'id'},player_links:{},user_state:{}},rpc);
  db.DB.players=players;db.DB.seasons.push(...seasons);
  db.DB.daily_results.push(...[...Array(8).keys()].map(i=>({id:i+1,day:TODAY,verified:true,practice:false,device_id:'dev'+i,nickname:'гравець'+i,w:20-i,d:5,l:5+i,gf:50,ga:30,pts:65-3*i,formation:'4-4-2',mode:'normal'})));
  return db;}
// holds matching Supabase / API requests until release() (loading states stay on screen)
const H={p:null,res:null,pat:/$^/};
H.hold=(pat,get)=>{H.pat=pat;H.get=!!get;H.p=new Promise(r=>H.res=r);};H.release=()=>{H.pat=/$^/;const r=H.res;H.p=null;if(r)r();};
const route=async(r,u)=>{if(H.p&&H.pat.test(u.pathname)&&(!H.get||r.request().method()==='GET'))await H.p;return false;};
const noText=async(pg,sel,T,what)=>{const t=await pg.evaluate(s=>document.querySelector(s).innerText,sel);T.check(!/Завантаж|…/.test(t),`${what}: тексту «Завантаження…» немає (${JSON.stringify(t.slice(0,40))})`);};
const sk=(pg,sel)=>pg.evaluate(s=>{const n=[...document.querySelectorAll(s+' .sk')].filter(e=>e.getBoundingClientRect().width>0);const a=n[0]&&getComputedStyle(n[0],'::after');
  return {n:n.length,anim:a?a.animationName:'',box:!!document.querySelector(s+' [role=status][aria-busy=true]')||!!document.querySelector(s+'[role=status]')||!!n[0].closest('[role=status]')};},sel);

(async()=>{const T=checker('0.76 шторки');
 // ---- A. phone, file:// page: the "What's new" sheet
 {const {b,pg,errs}=await openPage();
  await pg.click('#newsBtn');await wait(70);
  const mid=await geo(pg,'#viewBox .box');
  const an=await pg.evaluate(()=>document.getAnimations().filter(a=>a.effect&&a.effect.getTiming().duration===420).map(a=>String(a.effect.getTiming().easing)));
  T.check(mid.top>mid.vh-300&&mid.bottom>mid.vh+20,`шторка їде знизу (через 70 мс верх ${Math.round(mid.top)}, низ ${Math.round(mid.bottom)} з ${mid.vh})`);
  T.check(an.length>=1&&/^(linear\(|cubic-bezier)/.test(an[0]),'анімація входу 420 мс з пружинною кривою ('+(an[0]||'').slice(0,16)+')');
  await wait(700);
  const fin=await geo(pg,'#viewBox .box');
  T.check(Math.abs(fin.bottom-fin.vh)<=.5&&fin.h<=fin.vh*.92+1&&fin.w===fin.vw,`шторка стоїть на нижньому краї (низ ${fin.bottom} з ${fin.vh}, висота ${Math.round(fin.h)} ≤ 92%)`);
  T.check(fin.rad>=16,`верхні кути заокруглені (${fin.rad}px)`);
  const gr=await geo(pg,'#viewBox .grab');const pill=await pg.evaluate(()=>{const s=getComputedStyle(document.querySelector('#viewBox .grab'),'::before');return [parseFloat(s.width),parseFloat(s.height)];});
  T.check(gr.h>=28&&pill[0]>=32&&pill[1]>=4,`ручка-«грабер» є (${gr.h}px зона, смужка ${pill.join('×')})`);
  const bd=await bdInfo(pg,'#viewBox .sheet-bd');T.check(bd.blur&&bd.alpha>=.4,`фон: затемнення ${bd.alpha} з розмиттям`);
  const dlg=await pg.evaluate(()=>{const b=document.querySelector('#viewBox .box');return {role:b.getAttribute('role'),modal:b.getAttribute('aria-modal'),lab:b.getAttribute('aria-labelledby'),focus:document.activeElement===b,st:history.state&&history.state.sheet};});
  T.check(dlg.role==='dialog'&&dlg.modal==='true'&&dlg.lab==='viewTitle','role=dialog, aria-modal, підпис — заголовок');
  T.check(dlg.focus,'фокус перейшов у шторку');T.check(dlg.st===1,'відкриття шторки — запис історії (sheet:1)');
  let inside=true;for(let i=0;i<6;i++){await pg.keyboard.press('Tab');inside=inside&&await pg.evaluate(()=>document.querySelector('#viewBox .box').contains(document.activeElement));}
  T.check(inside,'Tab не виходить за межі шторки');
  await shot(pg,'sheet_phone_dark');await theme(pg,'light');await wait(300);await shot(pg,'sheet_phone_light');await theme(pg,'dark');
  // closing: button, backdrop, Escape, history.back; focus returns to the trigger
  const reopen=async()=>{await pg.click('#newsBtn');await wait(650);};
  for(const [name,fn] of [['«Закрити»',()=>pg.click('#viewClose')],['тап по затемненню',()=>pg.mouse.click(195,60)],['Escape',()=>pg.keyboard.press('Escape')],['системне «назад»',()=>pg.evaluate(()=>history.back())]]){
    await fn();await wait(160);const s1=await st(pg);await wait(500);const s2=await st(pg);
    T.check(s1.hidden&&s2.sheet===0&&s2.ghosts===0&&s2.focus==='newsBtn',`закриття: ${name} — шторка закрита, запис історії знято, фокус на «Що нового» (${s2.focus})`);
    await reopen();}
  // swipe down on the grabber
  const top0=(await geo(pg,'#viewBox .box')).top;
  let rel=await drag(pg,'#viewHead',100,{steps:10,pause:30,hold:260});
  const dd=(await geo(pg,'#viewBox .box')).top-top0;
  T.check(dd>=85&&dd<=105,`шторка йде за пальцем 1:1 (змістилась на ${Math.round(dd)}px при русі 100px)`);
  const bo=await pg.evaluate(()=>+document.querySelector('#viewBox .sheet-bd').style.opacity);T.check(bo>0.7&&bo<1,`затемнення слабшає під час перетягу (${bo.toFixed(2)})`);
  await shot(pg,'sheet_drag_phone');
  await rel();await wait(120);const sn=await st(pg);await wait(600);const g1=await geo(pg,'#viewBox .box');
  T.check(!sn.hidden&&Math.abs(g1.top-top0)<=1,`повільне відпускання нижче порога — шторка пружно повертається (${Math.round(g1.top-top0)}px)`);
  rel=await drag(pg,'#viewHead',-100,{steps:8,pause:20,hold:150});const up=top0-(await geo(pg,'#viewBox .box')).top;
  T.check(up>0&&up<55,`тяг угору з опором (${Math.round(up)}px при 100px)`);await rel();await wait(600);
  rel=await drag(pg,'#viewHead',200,{steps:10,pause:30,hold:260});await rel();await wait(150);const far=await st(pg);await wait(450);
  T.check(far.hidden&&(await st(pg)).sheet===0,'повільний тяг далі за третину висоти — закриває');
  await reopen();
  rel=await drag(pg,'#viewHead',75,{steps:3,pause:8});await rel();await wait(150);const fl=await st(pg);await wait(450);
  T.check(fl.hidden&&(await st(pg)).focus==='newsBtn','швидкий змах вниз (малий шлях, велика швидкість) — закриває');
  await reopen();
  // grabbing during the enter animation: stays under the finger
  await pg.click('#viewClose');await wait(500);await pg.click('#newsBtn');await wait(220);
  rel=await drag(pg,'#viewHead',-20,{steps:4,pause:10,hold:100});
  T.check((await pg.evaluate(()=>document.getAnimations().filter(a=>a.effect&&a.effect.getTiming().duration===420).length))===0,'перехоплення під час входу: анімація знята, шторку тримає палець');
  await rel();await wait(700);const gz=await geo(pg,'#viewBox .box');T.check(Math.abs(gz.bottom-gz.vh)<=.5,'після відпускання шторка стала на місце');await pg.click('#viewClose');await wait(500);
  T.check(errs.length===0,'помилок на сторінці немає '+errs.join(' | '));
  // trophy dialog (offline) is a sheet as well
  await pg.evaluate(()=>window.__dbg.openTrophies());await wait(650);const tg=await geo(pg,'#viewBox .box');
  T.check(Math.abs(tg.bottom-tg.vh)<=.5&&/Трофеї/.test(await pg.textContent('#viewTitle')),'«Трофеї» (офлайн) — теж шторка знизу');await pg.keyboard.press('Escape');await wait(400);
  await b.close();}
 // ---- B. reduced motion: instant
 {const {b,pg}=await openPage({reducedMotion:'reduce'});await pg.click('#newsBtn');
  const r0=await pg.evaluate(()=>({anims:document.getAnimations().length,bottom:document.querySelector('#viewBox .box').getBoundingClientRect().bottom,vh:innerHeight}));
  T.check(r0.anims===0&&Math.abs(r0.bottom-r0.vh)<=.5,'«Зменшити рух»: шторка з’являється одразу, без анімацій');
  await pg.click('#viewClose');await wait(120);const s=await st(pg);T.check(s.ghosts===0&&s.hidden,'«Зменшити рух»: закривається одразу, без «привида»');
  await pg.evaluate(()=>document.body.insertAdjacentHTML('beforeend','<i class="sk" id="skT" style="width:80px"></i>'));
  const sa=await pg.evaluate(()=>{const s=getComputedStyle(document.getElementById('skT'),'::after');return s.animationName==='none'||s.display==='none';});
  T.check(sa,'«Зменшити рух»: мерехтіння скелетона вимкнено');
  await b.close();}
 // ---- C. iPad: centered card
 {const {b,pg}=await openPage({viewport:{width:820,height:1180}});await pg.click('#newsBtn');await wait(70);
  const mid=await pg.evaluate(()=>+getComputedStyle(document.querySelector('#viewBox .box')).opacity);await wait(500);
  const g=await geo(pg,'#viewBox .box');const gr=await pg.evaluate(()=>getComputedStyle(document.querySelector('#viewBox .grab')).display);
  T.check(Math.abs((g.left+g.right)/2-g.vw/2)<=1&&g.bottom<g.vh-40&&g.w<=640&&g.top>40&&gr==='none'&&mid<1,`iPad: картка по центру (${Math.round(g.w)}px), без ручки, з’являється плавно`);
  const bd=await bdInfo(pg,'#viewBox .sheet-bd');T.check(bd.blur,'iPad: фон з розмиттям');await shot(pg,'sheet_ipad');
  rel=await drag(pg,'#viewHead',200,{steps:8,pause:20});await rel();await wait(300);T.check(!(await st(pg)).hidden,'iPad: свайп вниз картку не закриває');
  await pg.mouse.click(30,30);await wait(500);T.check((await st(pg)).hidden,'iPad: тап по затемненню закриває');
  await b.close();}
 // ---- D. site: login sheet, name sheet, table (full screen), league list
 const bb=await launch();
 {const db=mkDB();
  const A=await openSite({b:bb,db,viewport:{width:390,height:844},wait:1500});const p=A.pg;   // no sign-in: login sheet
  await p.click('#acctBtn');await wait(300);await p.click('#ppLogin');await wait(650);
  const lg=await geo(p,'#viewBox .box'),ls=await p.evaluate(()=>({login:document.getElementById('viewBox').classList.contains('login'),x:document.getElementById('viewClose').textContent.trim(),focus:document.activeElement.className}));
  T.check(ls.login&&Math.abs(lg.bottom-lg.vh)<=.5&&ls.x==='✕','вхід: шторка знизу з хрестиком ✕');await shot(p,'login_phone_dark');
  await p.click('#acctSkip');await wait(500);T.check((await st(p)).hidden&&(await st(p)).focus==='ppLogin','«Грати без входу» закриває шторку, фокус повертається на «Увійти»');
  await p.click('#ppLogin');await wait(650);rel=await drag(p,'#viewHead',160,{steps:8,pause:20});await rel();await wait(600);
  T.check((await st(p)).hidden,'вхід: закривається свайпом вниз');
  await A.ctx.close();}
 {const db=mkDB();const A=await openSite({b:bb,db,signed:true,viewport:{width:390,height:844},wait:1500});const p=A.pg;
  await p.click('#acctBtn');await wait(400);await p.click('#ppRowName');const m1=await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>r(document.querySelector('#ppSheet .sheet0-box').getBoundingClientRect().top))));await wait(700);
  const g=await geo(p,'#ppSheet .sheet0-box');const s1=await p.evaluate(()=>({st:history.state&&history.state.sheet,foc:document.activeElement.id,grab:!!document.querySelector('#ppSheet .grab')}));
  T.check(m1>g.top+20&&Math.abs(g.bottom-g.vh)<=.5&&g.rad>=16,`ім’я: шторка знизу з пружиною (верх ${Math.round(m1)} → ${Math.round(g.top)}, низ ${g.bottom}/${g.vh}, кути ${g.rad})`);
  T.check((await bdInfo(p,'#ppSheet .sheet-bd')).blur&&s1.grab,'ім’я: затемнення з розмиттям, є ручка');
  T.check(s1.st===1&&s1.foc==='ppNameIn','ім’я: запис історії, фокус у полі');await shot(p,'name_sheet_phone_dark');
  await p.keyboard.press('Escape');await wait(500);
  const s2=await p.evaluate(()=>({gone:!document.getElementById('ppSheet'),st:history.state&&history.state.sheet||0,foc:document.activeElement.id,sec:document.getElementById('s6').hidden}));
  T.check(s2.gone&&s2.st===0&&s2.foc==='ppRowName'&&!s2.sec,'ім’я: Escape закриває, запис знято, фокус на рядку «Ім’я», сторінка гравця на місці');
  {await p.click('#ppRowName');await wait(700);const fit=await p.evaluate(()=>{const b=document.querySelector('#ppSheet .sheet0-box');return {sh:b.scrollHeight,ch:b.clientHeight,bottom:Math.round(b.getBoundingClientRect().bottom),vh:innerHeight};});
   T.check(fit.sh<=fit.ch+1&&fit.bottom>=fit.vh-1,`ім’я на 390×844: без зайвої прокрутки (${fit.sh}/${fit.ch}), лист до низу екрана`);await p.keyboard.press('Escape');await wait(500);}
  // low screen (keyboard up): the name sheet scrolls inside, the save button is reachable
  await p.setViewportSize({width:320,height:300});await wait(200);await p.click('#ppRowName');await wait(700);
  const lo=await p.evaluate(()=>{const b=document.querySelector('#ppSheet .sheet0-box');b.scrollTop=b.scrollHeight;const sv=[...b.querySelectorAll('button')].pop().getBoundingClientRect();return {ov:getComputedStyle(b).overflowY,bot:sv.bottom,vh:innerHeight};});
  T.check(lo.ov==='auto'&&lo.bot<=lo.vh+1,`ім’я на низькому екрані: прокрутка всередині, кнопка видна (${Math.round(lo.bot)} ≤ ${lo.vh})`);
  await p.keyboard.press('Escape');await wait(500);await p.setViewportSize({width:390,height:844});
  await p.click('#ppRowName');await wait(650);rel=await drag(p,'#ppSheet .sheet-head',170,{steps:8,pause:20});await rel();await wait(600);
  T.check(!(await p.$('#ppSheet'))&&(await st(p)).sheet===0,'ім’я: закривається свайпом вниз');
  await p.click('#ppRowName');await wait(650);await p.evaluate(()=>history.back());await wait(500);T.check(!(await p.$('#ppSheet')),'ім’я: системне «назад» закриває');
  await p.click('#ppRowName');await wait(650);await p.mouse.click(195,60);await wait(500);T.check(!(await p.$('#ppSheet')),'ім’я: тап по затемненню закриває');
  T.check(A.errs.length===0,'помилок на сторінці немає '+A.errs.join(' | '));
  // table: full screen, no backdrop, rises from below, header swipe closes
  await p.click('#homeBtn');await wait(300);await p.click('#boardOpen');await wait(90);
  const t0=await geo(p,'#viewBox');await wait(650);const t1=await geo(p,'#viewBox');const bd=await bdInfo(p,'#viewBox .sheet-bd');
  T.check(t0.top>100&&t1.top===0&&t1.bottom===t1.vh&&bd.display==='none','таблиця: на весь екран виїжджає знизу, затемнення немає');
  await p.mouse.click(30,30);await wait(400);T.check(!(await st(p)).hidden,'таблиця: тап по краю її не закриває');
  rel=await drag(p,'#viewHead',420,{steps:10,pause:30,hold:200});await rel();await wait(150);await wait(500);
  T.check((await st(p)).hidden&&(await st(p)).sheet===0&&(await st(p)).focus==='boardOpen','таблиця: закривається свайпом вниз по шапці, фокус на «Таблиця»');
  await A.ctx.close();}
 {const db=mkDB();const tg={initData:'user=x&hash=abc',initDataUnsafe:{user:{id:1,first_name:'Андрій'},start_param:'g-100555'},colorScheme:'dark',platform:'android'};
  const today=['Олег','Марко','Саша','Дмитро','Іра','Петро','Сергій','Таня'].map((x,i)=>({name:x,w:20-i,d:5,l:5+i,pts:70-3*i,gf:50,ga:30}));
  const api={'/api/auth':async()=>({json:{token_hash:'TH'}}),'/api/league':async req=>{if(req.method==='GET'){return {json:{title:'Футбол по середах',day:'2026-09-28',today,members:20,standings:today.map(t=>({name:t.name,wins:2,days:3}))}};}return {json:{ok:true,joined:[]}};}};
  // home league card skeleton while the board loads
  H.hold(/league/,true);
  const A=await openSite({b:bb,db,api,tg,hash:'#tgWebAppData=x',route,viewport:{width:430,height:900},wait:900});const p=A.pg;
  const lk=await p.evaluate(()=>{const c=document.getElementById('leagueCard');return {hidden:c.hidden,sk:c.querySelectorAll('.sk').length,txt:c.innerText};});
  T.check(!lk.hidden&&lk.sk>=1&&!/Завантаж/.test(lk.txt),'картка ліги на головній: скелетон замість «Завантажуємо табло…»');
  H.release();await wait(900);
  const lk2=await p.evaluate(()=>({sk:document.querySelectorAll('#leagueCard .sk').length,txt:document.getElementById('leagueCard').innerText}));
  T.check(lk2.sk===0&&/Футбол по середах/.test(lk2.txt),'картка ліги: після відповіді скелетона немає');
  await p.click('#leagueAll');await wait(650);const g=await geo(p,'#viewBox .box');
  T.check(Math.abs(g.bottom-g.vh)<=.5&&/Футбол по середах/.test(await p.textContent('#viewTitle')),'список ліги («Уся таблиця») — шторка знизу');await shot(p,'league_list_phone_dark');
  await p.mouse.click(215,50);await wait(500);T.check((await st(p)).hidden&&(await st(p)).focus==='leagueAll','список ліги: тап по затемненню закриває, фокус на «Уся таблиця»');
  await A.ctx.close();}
 // ---- E. skeletons: pending requests show shimmer blocks with the final layout
 {const db=mkDB();
  const A=await openSite({b:bb,db,signed:true,route,viewport:{width:390,height:844},wait:1500});const p=A.pg;
  // all-time table
  H.hold(/\/rest\/v1\/seasons/);await p.click('#boardOpen');await wait(300);
  const s1=await sk(p,'#viewBody'),skRow=await p.evaluate(()=>{const r=document.querySelectorAll('#boardBody tr');return {n:r.length,h:r[2].getBoundingClientRect().height,top:document.querySelector('#boardBody table').getBoundingClientRect().top};});
  T.check(s1.n>=20&&s1.anim==='skim'&&s1.box,`таблиця: скелетон (${s1.n} блоків, мерехтіння ${s1.anim}, role=status)`);await noText(p,'#viewBody',T,'таблиця');await shot(p,'skeleton_board_phone_dark');
  await theme(p,'light');await wait(900);await shot(p,'skeleton_board_phone_light');await theme(p,'dark');
  H.release();await wait(900);
  const rl=await p.evaluate(()=>{const r=document.querySelectorAll('#boardBody tr[data-q]');return {n:r.length,h:r[1].getBoundingClientRect().height,top:document.querySelector('#boardBody table').getBoundingClientRect().top,sk:document.querySelectorAll('#viewBody .sk').length};});
  T.check(rl.n>=10&&rl.sk===0&&Math.abs(rl.h-skRow.h)<=4&&Math.abs(rl.top-skRow.top)<=1,`таблиця: рядок ${Math.round(skRow.h)} → ${Math.round(rl.h)}px, верх таблиці ${Math.round(skRow.top)} → ${Math.round(rl.top)} — без стрибка`);
  // squad opened from the table
  H.hold(/\/rest\/v1\/seasons/);await p.click('#boardBody tr[data-q]');await wait(700);
  const v1=await p.evaluate(()=>{const h=document.querySelector('#viewBody .sk-hero'),pt=document.querySelector('#viewBody .sk-pitch');return {hero:h&&h.getBoundingClientRect().height,pw:pt&&pt.getBoundingClientRect().width,ph:pt&&pt.getBoundingClientRect().height,pt:pt&&pt.getBoundingClientRect().top};});
  const sv=await sk(p,'#viewBody');T.check(sv.n>=3&&v1.hero>0,'склад: скелетон картки й поля');await noText(p,'#viewBody',T,'склад');await shot(p,'skeleton_squad_phone_dark');
  H.release();await wait(900);
  const v2=await p.evaluate(()=>{const h=document.querySelector('#viewBody .hero'),pt=document.querySelector('#viewBody .pitch');return {hero:h&&h.getBoundingClientRect().height,pw:pt&&pt.getBoundingClientRect().width,ph:pt&&pt.getBoundingClientRect().height,pt:pt&&pt.getBoundingClientRect().top,sk:document.querySelectorAll('#viewBody .sk').length};});
  T.check(v2.sk===0&&Math.abs(v2.hero-v1.hero)<=6&&Math.abs(v2.pw-v1.pw)<=1&&Math.abs(v2.ph-v1.ph)<=1&&Math.abs(v2.pt-v1.pt)<=10,`склад: картка ${Math.round(v1.hero)} → ${Math.round(v2.hero)}px, поле ${Math.round(v1.pw)}×${Math.round(v1.ph)} → ${Math.round(v2.pw)}×${Math.round(v2.ph)}, верх поля ${Math.round(v1.pt)} → ${Math.round(v2.pt)}`);
  await p.click('#viewClose');await wait(500);
  // day leaderboard
  await p.evaluate(()=>{const d=document.createElement('div');d.className='tbl';d.id='lbT';d.style.cssText='position:fixed;left:0;top:0;width:390px;background:var(--bg);z-index:9';document.body.appendChild(d);});
  H.hold(/daily_results/);const pr=p.evaluate(()=>window.__dbg.loadLb(document.getElementById('lbT')));await wait(300);
  const l1=await p.evaluate(()=>{const r=document.querySelectorAll('#lbT tr');return {n:r.length,h:r[2].getBoundingClientRect().height,sk:document.querySelectorAll('#lbT .sk').length,txt:document.getElementById('lbT').innerText};});
  T.check(l1.sk>=10&&!/Завантаж|…/.test(l1.txt),'табло дня: скелетон замість «Завантаження…»');
  H.release();await pr;await wait(200);
  const l2=await p.evaluate(()=>{const r=document.querySelectorAll('#lbT tr');return {n:r.length,h:r[2].getBoundingClientRect().height,sk:document.querySelectorAll('#lbT .sk').length};});
  T.check(l2.sk===0&&l2.n>=8&&Math.abs(l2.h-l1.h)<=4,`табло дня: рядок ${Math.round(l1.h)} → ${Math.round(l2.h)}px`);
  await p.evaluate(()=>document.getElementById('lbT').remove());
  // league list (home -> friends) and league page
  H.hold(/rpc\/fl_mine/);await p.click('#homeBtn').catch(()=>{});await p.evaluate(()=>document.getElementById('flOpen').click());await wait(300);
  const f1=await p.evaluate(()=>({sk:document.querySelectorAll('#fl .sk-row').length,h:document.querySelector('#fl .sk-row').getBoundingClientRect().height,txt:document.getElementById('fl').innerText}));
  T.check(f1.sk===3&&!/Завантаж/.test(f1.txt),'ліги: скелетон трьох рядків замість «Завантаження…»');await shot(p,'skeleton_leagues_phone_dark');
  H.release();await wait(700);
  const f2=await p.evaluate(()=>({sk:document.querySelectorAll('#fl .sk').length,h:document.querySelector('#fl .fl-row[data-l]').getBoundingClientRect().height}));
  T.check(f2.sk===0&&Math.abs(f2.h-f1.h)<=4,`ліги: рядок ${Math.round(f1.h)} → ${Math.round(f2.h)}px`);
  H.hold(/rpc\/fl_get/);await p.click('#fl .fl-row[data-l]');await wait(300);
  const q1=await p.evaluate(()=>({sk:document.querySelectorAll('#fl .sk').length,txt:document.getElementById('fl').innerText,top:document.querySelector('#fl .sk-h1').getBoundingClientRect().top}));
  T.check(q1.sk>=4&&!/Завантаж/.test(q1.txt),'сторінка ліги: скелетон замість «Завантаження…»');await shot(p,'skeleton_league_phone_dark');
  H.release();await wait(700);
  const q2=await p.evaluate(()=>({sk:document.querySelectorAll('#fl .sk').length,tour:!!document.querySelector('#fl .fl-tour'),top:document.querySelector('#fl .fl-head h1').getBoundingClientRect().top}));
  T.check(q2.sk===0&&q2.tour&&Math.abs(q2.top-q1.top)<=6,`сторінка ліги: заголовок ${Math.round(q1.top)} → ${Math.round(q2.top)}px`);
  // own page: trophy rarity line and season history
  await p.evaluate(()=>{const id=window.__dbg.TROPHIES.find(t=>!t.sec&&!t.gone).id;localStorage.setItem('upl30_tr',JSON.stringify({seasons:1,dailies:0,t:{[id]:{n:1,at:'2026-10-01'}}}));});
  H.hold(/rpc\/trophy_stats|\/rest\/v1\/seasons/);await p.evaluate(()=>document.getElementById('acctBtn').click());await wait(300);
  const tr1=await p.evaluate(()=>({sk:document.querySelectorAll('#ppCab .trp .sk').length}));
  T.check(tr1.sk>=1,'трофеї: у рядку рідкості скелетон, поки йде статистика');
  await p.evaluate(()=>{document.getElementById('ppHist').open=true;});await wait(300);
  const h1=await p.evaluate(()=>({sk:document.querySelectorAll('#ppHistList .sk').length,txt:document.getElementById('ppHistList').innerText}));
  T.check(h1.sk>=3&&!/Завантаж/.test(h1.txt),'історія сезонів: скелетон замість «Завантаження…»');await shot(p,'skeleton_player_phone_dark');
  H.release();await wait(900);
  const h2=await p.evaluate(()=>({sk:document.querySelectorAll('#pp .sk').length,rows:document.querySelectorAll('#ppHistList .pp-row').length}));
  T.check(h2.sk===0&&h2.rows>=5,'сторінка гравця: скелетонів не лишилось, сезони на місці');
  T.check(A.errs.length===0,'помилок на сторінці немає '+A.errs.join(' | '));await A.ctx.close();}
 {const db=mkDB();H.hold(/rpc\/player_profile_pub/);
  const A=await openSite({b:bb,db,signed:true,route,query:'?u=vitya234',viewport:{width:390,height:844},wait:900});const p=A.pg;
  const a1=await p.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect();return {sk:document.querySelectorAll('#pp .sk').length,txt:document.getElementById('pp').innerText,head:r('.pp-head').height,big:r('.pp-big3').top,bigH:r('.pp-big3').height};});
  T.check(a1.sk>=5&&!/…|Завантаж/.test(a1.txt),'чужа сторінка гравця: скелетон імені й плиток, без «…»');await shot(p,'skeleton_player_other_phone_dark');
  H.release();await wait(900);
  const a2=await p.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect();return {sk:document.querySelectorAll('#pp .sk').length,name:document.getElementById('ppName').textContent,head:r('.pp-head').height,big:r('.pp-big3').top,bigH:r('.pp-big3').height};});
  T.check(a2.sk===0&&a2.name==='vitia'&&Math.abs(a2.head-a1.head)<=2&&Math.abs(a2.big-a1.big)<=2&&Math.abs(a2.bigH-a1.bigH)<=2,`чужа сторінка (${a2.sk} скелетонів, ім'я ${a2.name}): шапка ${Math.round(a1.head)} → ${Math.round(a2.head)}, плитки ${Math.round(a1.big)} → ${Math.round(a2.big)}, висота ${Math.round(a1.bigH)} → ${Math.round(a2.bigH)}px — без стрибка`);
  await A.ctx.close();}
 await bb.close();
 // ---- F. source: no old loading text left in code for players
 {const src=['template.html','account.js','leagues.js','player.js','trophies.js','five.js','oneclub.js','challenge.js'].map(f=>fs.readFileSync(path.join(ROOT,'src',f),'utf8')).join('\n');
  const left=(src.match(/[^`'"\n]{0,30}Завантаж(?:ення|уємо)…[^`'"\n]{0,20}/g)||[]);T.check(left.length===0,'у коді не лишилось «Завантаження…» / «Завантажуємо…» '+left.slice(0,2).join(' | '));}
 // ---- H. «Як грати?» on the home screen opens the FAQ answer
 {const {b:bh,pg}=await openPage();await pg.click('#howGo');await pg.waitForTimeout(300);
  T.check(await pg.evaluate(()=>document.getElementById('faqBox').open&&document.getElementById('howQ').open),'«Як грати?» відкриває відповідь у FAQ');await bh.close();}
 // ---- G. no repeated fades and no table height jumps
 {const {b:bg,pg}=await openPage();
  await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.click('#freeOpen');await pg.evaluate(()=>window.__dbg.setFmt('classic'));await pg.click('#modes .opt:nth-child(1)');await pg.click('#startBtn');
  await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});
  await pg.click('#showR');await pg.waitForTimeout(600);
  T.check(await pg.evaluate(()=>!document.getElementById('squad').classList.contains('rin')),'рейтинги: клас появи знято після першої анімації');
  for(let i=0;i<11;i++){if(i){await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});}
    const btn=await pg.$('.pl:not([disabled])');await btn.click();await pg.waitForTimeout(80);const pick=await pg.$('#pitch .slot.target');if(pick){await pick.click();await pg.waitForTimeout(60);}
    if(i===0)T.check(await pg.evaluate(()=>[...document.querySelectorAll('#squad .pl .rt')].every(e=>!e.getAnimations().length)),'рейтинги не з\'являються наново після вибору гравця');}
  await pg.waitForSelector('#simBtn:not([hidden])');await pg.click('#simBtn');
  const rows=new Set(),hs=new Set();
  for(let k=0;k<70;k++){const v=await pg.evaluate(()=>{const t=document.getElementById('lvTable');return document.getElementById('live').hidden?null:[t.querySelectorAll('tr').length,Math.round(t.getBoundingClientRect().height)];});
    if(!v)break;if(v[0]>1){   // ±3 px: web font may finish loading mid-season
     rows.add(v[0]);hs.add(v[1]);}await wait(300);}
  T.check(rows.size===1&&rows.has(7)&&Math.max(...hs)-Math.min(...hs)<=3,`живий сезон: завжди 6 рядків і та сама висота (рядків ${[...rows]}, висота ${[...hs]})`);
  await bg.close();}
 process.exit(T.done());})();
