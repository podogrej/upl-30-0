// 0.92 share: the screen opened by a result link (?s=<id>) for a normal season and a daily challenge (squad hidden today, open the next day),
// the play button starts a classic draft, the result screen has one gradient Share button (browser: copy / system share; Telegram: prepared message),
// share texts (utm, challenge number, no mode names), preview image and the "share" event. In-memory DB, no real network.
// Screenshots: tools/tests/out/v092_*.png. Run from repo root: node tools/tests/v092.js
const path=require('path'),fs=require('fs');const {ROOT,launch,makeDB,openSite,draftSeason,checker}=require('./_site.js');
let CARD_FAIL=null;   // set: the bot refuses to prepare the card
const OUT=path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const E=require(path.join(ROOT,'lib','engine.js')),V=require(path.join(ROOT,'lib','vd_core.js'));
const T=checker('0.92 поділитися');
// a squad of 11 real pool players for 4-4-2, one per slot
function squad(){const used=new Set();return E.FORMATIONS['4-4-2'].slots.map(sl=>{let got=null;
  for(const c of E.DATA.clubs){for(const p of c.pl)if(p[6]===sl&&!used.has(p[5])&&p[2]>=80&&p[3]>=20){got={p,c};break;}if(got)break;}
  used.add(got.p[5]);return {n:got.p[0],id:got.p[5],slot:sl,r:got.p[2],r0:got.p[2],c:got.c.n,y:got.c.y,f:0,g:3,a:2,rt:7.1};});}
const XI=squad();
const row=(id,o)=>({id,device_id:'dev-x',player_id:'p-v',nickname:null,competition:'upl',mode:'hardcore',format:'classic',formation:'4-4-2',year:2020,w:23,d:6,l:1,pts:75,place:1,gf:79,ga:10,gd:69,xp:60,
  tier:'ЧЕМПІОНИ УКРАЇНИ',golden:false,perfect:false,practice:false,verified:true,show_r:false,fl_id:null,club:null,day:null,created_at:'2026-10-12T10:00:00Z',xi:XI,tbl:[],...o});
function mkDb(){const db=makeDB({seasons:{auto:'id'},season_seeds:{auto:'id'},daily_results:{auto:'id'},player_links:{},trophies:{pk:['device_id','trophy']}},
  {player_hello:()=>({id:'p-me',name:'andrii',anon_name:'silent_owl',public_id:'meplaaaa'}),device_ok:()=>'p-me',trophy_stats:()=>({players:5,t:{}})});
  db.DB.players=[{id:'p-v',name:'ihor',anon_name:'brave_fox',public_id:'ihor2345'},{id:'p-me',name:'andrii',anon_name:'silent_owl',public_id:'meplaaaa'}];
  db.DB.seasons.push(row(500),row(501,{xi:null,vd_day:'2026-10-12',vd_score:9,tier:'8 місце · боротьба за виживання',place:8}),row(502,{vd_day:'2026-10-12',vd_score:9,place:8}),row(503,{vd_day:'2026-10-12',vd_score:2}));
  return db;}
const txt=async(pg,sel)=>(await pg.textContent(sel).catch(()=>'')||'').replace(/\s+/g,' ').trim();
const vis=(pg,sel)=>pg.$eval(sel,e=>!e.hidden&&e.offsetParent!==null).catch(()=>false);
// Telegram WebApp stub with functions (opts.tg is JSON only)
const TGJS=`window.Telegram={WebApp:{initData:'user=x&hash=abc',initDataUnsafe:{user:{id:1,first_name:'Андрій'}},platform:'android',ready(){},expand(){},onEvent(){},disableVerticalSwipes(){},
  openTelegramLink(u){(window.__tgLinks=window.__tgLinks||[]).push(u);},isVersionAtLeast(){return true;},shareMessage(id,cb){window.__sm=id;cb&&cb(true);}}};`;
const tgRoute=(r,u)=>{if(u.host==='telegram.org'){r.fulfill({contentType:'application/javascript',body:TGJS});return true;}return false;};
(async()=>{const b=await launch();const db=mkDb();global.fetch=db.fetch;
 const seen=[];const api={'/api/seed':async()=>({status:500,json:{error:'down'}}),'/api/save':async req=>req.body.kind==='season'?{json:{id:77,verified:true}}:{json:{}},
   '/api/err':async req=>{seen.push(['err',req.body]);return {json:{ok:true}};},'/api/card':async req=>{seen.push(['card',req.body]);return {json:req.body.share?(CARD_FAIL?{ok:false,error:CARD_FAIL}:{ok:true,prepared:'PM1'}):{ok:true}};},'/api/auth':async()=>({json:{token_hash:'TH'}})};
 // ---- 1. normal season by link
 {const A=await openSite({b,db,api,query:'?s=500'});const pg=A.pg;await pg.waitForSelector('#shr .hero',{timeout:5000});await pg.waitForTimeout(400);
  {const bk=await openSite({b,db,api,query:'?s=500'});await bk.pg.waitForSelector('#shr .hero',{timeout:5000});await bk.pg.waitForTimeout(400);await bk.pg.click('#backBtn');await bk.pg.waitForTimeout(700);T.check(await vis(bk.pg,'#s1')&&!await vis(bk.pg,'#s12'),'«Назад» у того, хто прийшов за посиланням без історії, веде на головну');await bk.ctx.close();}
  T.check(await vis(pg,'#s12')&&!await vis(pg,'#s1'),'за посиланням ?s= відкрито окремий екран, а не лист «Склад»');
  T.check(await pg.$eval('header.top',e=>getComputedStyle(e).display!=='none'&&!e.querySelector('#backBtn').hidden&&!e.querySelector('#homeBtn').hidden)&&!await pg.$('.shr-top')&&!await pg.$('.shr-logo'),'обычная шапка сайта: «Назад» і домик, власної шапки немає');
  T.check(await txt(pg,'#shr .hero .tier')==='ЧЕМПІОНИ УКРАЇНИ'&&/^ihor · /.test(await txt(pg,'#shr .hero .muted')),'картка підсумку сайту: звання й автор: '+await txt(pg,'#shr .hero .muted'));
  T.check(!/Хардкор|hardcore|Драфт дня|Лише пам/i.test(await txt(pg,'#s12')),'назви прихованого режиму немає');
  T.check(/^23-6-1в · н · п75очок1місце79:10голи/.test(await txt(pg,'#shr .hero .big')),'В-Н-П «в · н · п» / очки / місце / голи: '+await txt(pg,'#shr .hero .big'));
  T.check(await pg.$$eval('#shr .hero .xrow .chip',a=>a.map(e=>e.textContent.replace(/\s+/g,' ').trim()).join())==='xP 60.0','пусті xG/xGA не показано, лише xP: '+await pg.$$eval('#shr .hero .xrow .chip',a=>a.length));
  const xi=await pg.evaluate(()=>({pitch:document.querySelectorAll('#shr .pitch').length,pl:document.querySelectorAll('#shr .pitch .slot.filled').length,pills:document.querySelectorAll('#shr .pitch .pill').length,names:[...document.querySelectorAll('#shr .pitch .nm')].every(e=>e.textContent.trim().length>1),old:document.querySelectorAll('#shr .shr-xi,#shr .shr-pl').length}));
  T.check(xi.pitch===1&&xi.pl===11&&xi.pills===11&&xi.names&&xi.old===0,'склад: те саме поле сайту, 11 фішок з оцінкою й прізвищем');
  T.check(await pg.$eval('#shr details.tip',e=>!e.open),'«Що це за гра?» згорнуто');
  T.check(await txt(pg,'#shrGo')==='Зібрати свій склад'&&await txt(pg,'#shr .share p')==='Без реєстрації','кнопка «Зібрати свій склад» і підпис «Без реєстрації»');
  const g=await pg.evaluate(()=>{const c=document.getElementById('shrGo'),r=c.getBoundingClientRect(),h=document.getElementById('freeOpen');return {ch:r.height,grad:/gradient/.test(getComputedStyle(c).backgroundImage),same:getComputedStyle(c).backgroundImage===getComputedStyle(h).backgroundImage,ow:document.documentElement.scrollWidth<=innerWidth};});
  T.check(g.ch>=44&&g.grad&&g.ow,`кнопка ≥44px (${Math.round(g.ch)}), фірмовий градієнт, без горизонтального прокручування`);
  await pg.screenshot({path:path.join(OUT,'v092_link_390d.png'),fullPage:true});
  await pg.evaluate(()=>{document.documentElement.dataset.theme='light';});await pg.waitForTimeout(300);await pg.screenshot({path:path.join(OUT,'v092_link_390l.png'),fullPage:true});await pg.evaluate(()=>{document.documentElement.dataset.theme='dark';});
  for(const [w,h,n] of [[320,640,'320'],[1024,768,'1024']]){await pg.setViewportSize({width:w,height:h});await pg.waitForTimeout(250);
    T.check(await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${w}px: без горизонтального прокручування`);await pg.screenshot({path:path.join(OUT,`v092_link_${n}d.png`),fullPage:true});}
  await pg.setViewportSize({width:390,height:844});
  await pg.click('#shr details.tip summary');T.check(await pg.$eval('#shr details.tip',e=>e.open&&!/колес/i.test(e.textContent)),'«Що це за гра?» відкривається, без слова «колесо»');
  // home and back
  await pg.click('#homeBtn');await pg.waitForTimeout(300);T.check(await vis(pg,'#s1'),'домик у шапці веде на головну');
  await pg.evaluate(()=>history.back());await pg.waitForTimeout(500);
  T.check(await vis(pg,'#s12'),'назад з головної — знову екран за посиланням');
  await pg.click('#shrGo');await pg.waitForTimeout(600);
  const st=await pg.evaluate(()=>({s2:!document.getElementById('s2').hidden,fmt:window.__dbg.S.format,mode:window.__dbg.S.mode,vd:window.__dbg.S.vd,label:document.getElementById('modeLabel').textContent,era:window.__dbg.S.era}));
  T.check(st.s2&&st.fmt==='classic'&&st.mode==='normal'&&!st.vd&&/Звичайний/.test(st.label)&&st.era==='all',`«Зібрати свій склад» одразу запускає класичний драфт «Звичайний»: ${st.label}`);
  T.check(!A.errs.length,'помилок на сторінці немає '+A.errs.join(' | '));await A.ctx.close();}
 // ---- 2. missing season: message and the same button
 {const A=await openSite({b,db,api,query:'?s=9999'});await A.pg.waitForSelector('#shr .muted',{timeout:5000});
  T.check(/не знайдено/.test(await txt(A.pg,'#shr'))&&await txt(A.pg,'#shrGo')==='Зібрати свій склад','результат не знайдено: повідомлення й кнопка лишаються');await A.ctx.close();}
 // ---- 3. daily challenge: squad hidden on the day, open the next day
 {const A=await openSite({b,db,api,query:'?s=501'});const pg=A.pg;await pg.waitForSelector('#shr .hero',{timeout:5000});await pg.waitForTimeout(400);
  const n=V.vdNumber('2026-10-12');
  T.check(n===4&&V.vdNumber('2026-10-09')===1,'номер виклику: 09.10 — №1, 12.10 — №4');
  T.check(/^🥇 9 з 11$/.test(await txt(pg,'#shr .hero .tier'))&&/Виклик дня №4/.test(await txt(pg,'#shr .hero .muted')),'медаль, «9 з 11», «Виклик дня №4»: '+await txt(pg,'#shr .hero'));
  const task=await txt(pg,'#shr .hero .note');
  T.check(/^⚽|^🎂|^🧳|^🎖|^📅/.test(task)&&task.length>30,'умова виклику (з challenges.json): '+task.slice(0,70));
  const m=await pg.evaluate(()=>{const d=document.querySelector('#shr .shr-dots'),h3=document.querySelector('#shr h3');return {pitch:document.querySelectorAll('#shr .pitch').length,dots:d?d.children.length:0,on:d?d.querySelectorAll('i.on').length:0,names:document.querySelectorAll('#shr .nm').length,cap:h3.nextElementSibling.textContent,order:h3.nextElementSibling.nextElementSibling===d,one:d?new Set([...d.children].map(e=>Math.round(e.getBoundingClientRect().top))).size:0,w:d?d.children[0].getBoundingClientRect().width:0};});
  T.check(m.pitch===0&&m.dots===11&&m.on===9&&m.names===0&&m.cap==='Склад відкриється завтра'&&m.order&&m.one===1&&m.w>=24,'без поля: «Склад відкриється завтра» під заголовком, ряд з 11 кружків (9 заповнених) в один рядок, кружок ≥24px: '+JSON.stringify(m));
  T.check(await txt(pg,'#shrGo')==='Пройти виклик'&&await txt(pg,'#shr .share p')==='3 спроби · без реєстрації','кнопка «Пройти виклик» і «3 спроби · без реєстрації»');
  T.check(/^23-6-1в · н · п75очок8місце79:10голи$/.test(await txt(pg,'#shr .hero .big')),'на екрані виклику є числа сезону: '+await txt(pg,'#shr .hero .big'));
  await pg.screenshot({path:path.join(OUT,'v092_vd_390d.png'),fullPage:true});
  await pg.click('#shrGo');await pg.waitForTimeout(600);
  const v=await pg.evaluate(()=>({s2:!document.getElementById('s2').hidden,vd:window.__dbg.S.vd&&window.__dbg.S.vd.day}));
  T.check(v.s2&&v.vd==='2026-10-12','«Пройти виклик» відкриває сьогоднішній виклик');
  T.check(!A.errs.length,'помилок немає '+A.errs.join(' | '));await A.ctx.close();}
 {const A=await openSite({b,db,api,query:'?s=502',vdToday:'2026-10-13'});const pg=A.pg;await pg.waitForSelector('#shr .hero',{timeout:5000});await pg.waitForTimeout(400);
  const m=await pg.evaluate(()=>({pl:document.querySelectorAll('#shr .pitch .slot.filled').length,lock:document.querySelectorAll('#shr .shr-dots').length,nm:document.querySelector('#shr .pitch .nm').textContent,note:document.querySelectorAll('#shr .hero .note').length}));
  T.check(m.pl===11&&!m.lock&&m.nm.trim().length>1,'наступного дня склад відкрито, кружків-замка немає ('+m.nm+')');
  T.check(m.note===0,'наступного дня вчорашньої умови в картці немає');
  T.check(await txt(pg,'#shrGo')==='Сьогоднішній виклик','кнопка «Сьогоднішній виклик» (коротко, в один рядок)');
  {const cur=V.vdFind(JSON.parse(fs.readFileSync(path.join(ROOT,'lib','challenges.json'),'utf8')),'2026-10-13'),cap=await txt(pg,'#shr .share p');
   const nb=await pg.$eval('#shr .share p',e=>e.textContent.includes('\u00a0· 3')&&!e.textContent.includes(' · '));
   T.check(nb&&cap===(cur?`№${V.vdNumber('2026-10-13')}: ${cur.title.replace(/^[^\p{L}\p{N}]+/u,'').replace(/[.!?…]$/,'')}\u00a0· 3\u00a0спроби\u00a0· без реєстрації`:'Сьогодні новий виклик\u00a0· 3 спроби\u00a0· без реєстрації').replace(/\u00a0/g,' '),'підпис під кнопкою (нерозривний пробіл перед «·») називає сьогоднішній виклик: '+cap);
   T.check(/^23-6-1в · н · п75очок8місце/.test(await txt(pg,'#shr .hero .big')),'числа сезону на екрані виклику (наступний день)');}
  await pg.screenshot({path:path.join(OUT,'v092_vd_next_390d.png'),fullPage:true});
  await pg.click('#shrGo');await pg.waitForTimeout(600);T.check(await pg.evaluate(()=>window.__dbg.S.vd&&window.__dbg.S.vd.day)==='2026-10-13'||await pg.evaluate(()=>!document.getElementById('s2').hidden||!document.getElementById('s1').hidden),'сьогоднішній виклик: відкрито або головна, якщо виклику на день немає');
  await A.ctx.close();}
 {const A=await openSite({b,db,api,query:'?s=503'});await A.pg.waitForSelector('#shr .hero',{timeout:5000});
  T.check(/^2 з 11$/.test(await txt(A.pg,'#shr .hero .tier')),'без медалі (2 з 11): лише рахунок');await A.ctx.close();}
 // ---- 4. result screen in a browser: one gradient Share, copy with the copied state
 const CLIP=`window.__clip=null;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async t=>{if(window.__clipFail)throw new Error('no');window.__clip=t;}}});Object.defineProperty(navigator,'canShare',{configurable:true,value:undefined});Object.defineProperty(navigator,'share',{configurable:true,value:undefined});`;
 {seen.length=0;const A=await openSite({b,db,api,init:CLIP});const pg=A.pg;
  await pg.click('#freeOpen');await pg.evaluate(()=>window.__dbg.setFmt('classic'));await pg.click('#startBtn');await draftSeason(pg);await pg.waitForTimeout(800);
  const ids=await pg.evaluate(()=>[...document.querySelectorAll('#shareBox > *')].filter(e=>!e.hidden).map(e=>e.id||e.className));
  T.check(ids.join()==='tgShareBtn,shr2,copyMsg','на результаті: «Поділитися» і «Новий драфт» ('+ids+')');
  T.check(!await pg.$('#chalOpen')&&!await pg.$('#cardTgBtn')&&!await pg.$('#cardShareBtn')&&!await pg.$('#copyBtn')&&!await pg.$('#shareImg'),'кнопок «Кинути виклик», «Надіслати картку мені», «Поділитися карткою», «Копіювати текст» немає');
  const geo=await pg.evaluate(()=>{const s=document.getElementById('tgShareBtn'),a=document.getElementById('againBtn'),sr=s.getBoundingClientRect(),ar=a.getBoundingClientRect(),h=document.getElementById('freeOpen');
    return {sh:sr.height,ah:ar.height,below:ar.top>=sr.bottom-1,grad:/gradient/.test(getComputedStyle(s).backgroundImage),altGrad:/gradient/.test(getComputedStyle(a).backgroundImage),pos:getComputedStyle(document.getElementById('shareBox')).position,gradMain:/gradient/.test(getComputedStyle(h).backgroundImage)};});
  T.check(geo.sh>=56&&geo.ah>=44&&geo.below&&geo.grad&&!geo.altGrad&&geo.pos==='static','«Поділитися» — фірмова градієнтна кнопка (як на головній), не закріплена; «Новий драфт» під нею, без градієнта');
  await pg.screenshot({path:path.join(OUT,'v092_result_390d.png')});
  await pg.evaluate(()=>{document.documentElement.dataset.theme='light';});await pg.waitForTimeout(250);await pg.screenshot({path:path.join(OUT,'v092_result_390l.png')});await pg.evaluate(()=>{document.documentElement.dataset.theme='dark';});
  for(const [w,h] of [[320,640],[1024,768]]){await pg.setViewportSize({width:w,height:h});await pg.waitForTimeout(250);
    T.check(await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`результат ${w}px: без горизонтального прокручування`);
    await pg.screenshot({path:path.join(OUT,`v092_result_${w}d.png`)});}
  await pg.setViewportSize({width:390,height:844});
  await pg.click('#tgShareBtn');await pg.waitForTimeout(700);
  const c1=await pg.evaluate(()=>({label:document.getElementById('tgShareBtn').textContent.trim(),ok:document.getElementById('tgShareBtn').dataset.copied==='1',clip:window.__clip}));
  T.check(c1.label==='Скопійовано'&&c1.ok,'у браузері без меню «Поділитися»: кнопка стає «Скопійовано»');
  T.check(/^30-0 УПЛ · (\d+ місце · \d+-\d+-\d+ · \d+ \S+|30-0!)\n.+…\nПобий мій результат: https:\/\/upl\.test\/r\/77\?utm_source=share&utm_medium=copy&utm_campaign=result$/.test(c1.clip||''),'скопійований текст: заголовок, три картки, «Побий мій результат» + /r/<id> з utm: '+JSON.stringify(c1.clip));
  T.check(!/Звичайний|Класика|Хардкор|Драфт|№/.test(c1.clip||''),'у тексті немає назв режимів і номерів');
  await pg.waitForTimeout(2100);
  T.check(await pg.evaluate(()=>document.getElementById('tgShareBtn').textContent.trim()==='Поділитися'&&!document.getElementById('tgShareBtn').dataset.copied),'через ~2 с кнопка знову «Поділитися»');
  const ev=seen.filter(x=>x[0]==='err'&&x[1].traffic&&x[1].traffic.event==='share'),og=seen.filter(x=>x[0]==='card'&&x[1].og);
  T.check(ev.length===1&&ev[0][1].traffic.utm_medium==='copy'&&!!ev[0][1].traffic.anon_id,'подія «share» з utm_medium=copy відправлена');
  T.check(og.length===1&&og[0][1].season_id===77&&/^data:image\/jpeg;base64,/.test(og[0][1].image)&&!!og[0][1].device&&String(og[0][1].secret||'').length>=32&&!og[0][1].initData,'прев\'ю-картинка: POST /api/card {og, season_id, image jpeg, device, secret}');
  await pg.click('#tgShareBtn');await pg.waitForTimeout(500);T.check(seen.filter(x=>x[0]==='card'&&x[1].og).length===1,'прев\'ю відправляється один раз на сезон');
  // clipboard refused: the text is shown selected
  await pg.evaluate(()=>{window.__clipFail=true;});await pg.waitForTimeout(2200);await pg.click('#tgShareBtn');await pg.waitForTimeout(400);
  const f=await pg.evaluate(()=>{const t=document.getElementById('shareText');return {vis:!t.hidden,sel:t.selectionEnd-t.selectionStart,len:t.value.length,msg:document.getElementById('copyMsg').textContent};});
  T.check(f.vis&&f.sel===f.len&&f.len>20&&/виділено/.test(f.msg),'буфер недоступний: текст показано виділеним ('+f.msg+')');
  // card: a normal one draws the squad names, a daily-challenge one draws none (the squad opens the next day) but keeps the condition and circles
  const cd=await pg.evaluate(()=>{const S=window.__dbg.S,r=S.result,out={},cp=CanvasRenderingContext2D.prototype,orig=cp.fillText;
    const run=()=>{const t=[];cp.fillText=function(s){t.push(String(s));return orig.apply(this,arguments);};try{window.__dbg.drawCard(r);}finally{cp.fillText=orig;}return t;};
    const names=S.slots.map(s=>s.player.name.split(' ').pop());   // whole surname: a prefix can match the condition text
    const hit=t=>names.filter(n=>t.some(x=>new RegExp('(^|[^\\p{L}])'+n+'($|[^\\p{L}])','u').test(x)));
    const a=run();out.normal=hit(a).length;
    S.vd={day:'2026-10-12',ch:{title:'Мандрівники',task:'Два гравці, які грали в УПЛ за 7+ клубів.'}};r.vd={score:9};
    const b=run();out.vd=hit(b);out.vdText=b.join('|');S.vd=null;delete r.vd;return out;});
  T.check(cd.normal>=8,'звичайна картка малює прізвища складу ('+cd.normal+' з 11)');
  {const vh=await pg.evaluate(()=>{const h=window.__dbg.viewHtml({id:9,w:20,d:5,l:5,pts:65,place:2,gf:60,ga:30,formation:'4-4-2',xi:null,tbl:[],vd_day:'2026-10-12',created_at:'2026-10-12T08:00:00Z'});return {later:/Склад відкриється завтра/.test(h),table:/<th>Гравець<\/th>/.test(h)};});
   T.check(vh.later&&!vh.table,'лист «Склад» для схованого складу виклику: «Склад відкриється завтра», без порожньої таблиці гравців');}
  T.check(cd.vd.length===0&&/ВИКЛИК ДНЯ №4/.test(cd.vdText)&&/9 з 11/.test(cd.vdText)&&/Мандрівники/.test(cd.vdText)&&!/БОМБАРДИР|ГРАВЕЦЬ СЕЗОНУ/.test(cd.vdText),'картка виклику дня: прізвищ складу й плиток «Бомбардир»/«Гравець сезону» немає, є №, «9 з 11», умова: '+cd.vd.join());
  T.check(!A.errs.length,'помилок на сторінці немає '+A.errs.join(' | '));await A.ctx.close();}
 // ---- 5. system share sheet with the card file
 {seen.length=0;const A=await openSite({b,db,api,init:`window.__shared=null;Object.defineProperty(navigator,'canShare',{configurable:true,value:d=>!!(d&&d.files&&d.files.length)});Object.defineProperty(navigator,'share',{configurable:true,value:async d=>{window.__shared={n:d.files.length,type:d.files[0].type,text:d.text};}});`});const pg=A.pg;
  await pg.click('#freeOpen');await pg.evaluate(()=>window.__dbg.setFmt('classic'));await pg.click('#startBtn');await draftSeason(pg);await pg.waitForTimeout(800);
  await pg.click('#tgShareBtn');await pg.waitForTimeout(900);
  const s=await pg.evaluate(()=>window.__shared);
  T.check(s&&s.n===1&&s.type==='image/png'&&/utm_medium=web&utm_campaign=result/.test(s.text)&&/Побий мій результат: https:\/\/upl\.test\/r\/77\?/.test(s.text),'у браузері: navigator.share з файлом картки й текстом (utm_medium=web)');
  const ev=seen.filter(x=>x[0]==='err'&&x[1].traffic&&x[1].traffic.event==='share');T.check(ev.length===1&&ev[0][1].traffic.utm_medium==='web','подія «share» з utm_medium=web');
  await A.ctx.close();}
 // ---- 6. Telegram Mini App: prepared message with the card, link under the words
 {seen.length=0;const A=await openSite({b,db,api,route:tgRoute,hash:'#tgWebAppData=x',signed:true});const pg=A.pg;
  await pg.click('#freeOpen');await pg.evaluate(()=>window.__dbg.setFmt('classic'));await pg.click('#startBtn');await draftSeason(pg);await pg.waitForTimeout(2500);
  await pg.click('#tgShareBtn');await pg.waitForTimeout(900);
  const sm=await pg.evaluate(()=>window.__sm),cards=seen.filter(x=>x[0]==='card'&&x[1].share);
  T.check(sm==='PM1','у Telegram «Поділитися» відкриває вибір чату (shareMessage з підготовленим повідомленням)');
  const cap=cards.length&&cards[cards.length-1][1].caption,pm=cards.length&&cards[cards.length-1][1].parse_mode;
  T.check(!pm&&/^⚽ 30-0 УПЛ · /.test(cap||'')&&/перемог/.test(cap)&&/Найкращий бомбардир: /.test(cap)&&!/https?:|<[a-z\/]/.test(cap),'підпис у Telegram як до 0.92: звичайний текст, результат і бомбардир, без посилання й тегів: '+String(cap).slice(0,160));
  const vdc=await pg.evaluate(()=>{const D=window.__dbg,S=D.S,r={...S.result,vd:{score:9},tro:{fresh:[D.TROPHIES[0].id,D.TROPHIES[1].id]}},sv=S.vd;S.vd={day:'2026-10-12'};const c=D.cardCaption(r);S.vd=sv;return c;});
  T.check(/Виклик дня №/.test(vdc)&&!/бомбардир|трофе|«/i.test(vdc),'підпис виклику дня: без бомбардира й трофеїв (їхні назви можуть назвати гравця): '+vdc.replace(/\n/g,' / ').slice(0,160));
  const og=seen.filter(x=>x[0]==='card'&&x[1].og);T.check(og.length===1&&!!og[0][1].initData&&!og[0][1].device,'прев\'ю в Telegram: initData замість device/secret');
  const ev=seen.filter(x=>x[0]==='err'&&x[1].traffic&&x[1].traffic.event==='share');T.check(ev.length===1&&ev[0][1].traffic.utm_medium==='telegram','подія «share» з utm_medium=telegram');
  await pg.screenshot({path:path.join(OUT,'v092_result_tg.png')});
  T.check(!A.errs.length,'помилок на сторінці немає '+A.errs.join(' | '));await A.ctx.close();}
 // ---- 7. Telegram refuses the card: text fallback, and the reason is reported to client_errors
 {seen.length=0;CARD_FAIL='Bad Request: test refusal';const A=await openSite({b,db,api,route:tgRoute,hash:'#tgWebAppData=x',signed:true});const pg=A.pg;
  await pg.click('#freeOpen');await pg.evaluate(()=>window.__dbg.setFmt('classic'));await pg.click('#startBtn');await draftSeason(pg);await pg.waitForTimeout(2500);
  await pg.click('#tgShareBtn');await pg.waitForTimeout(4000);
  const links=await pg.evaluate(()=>window.__tgLinks||[]),msgs=seen.filter(x=>x[0]==='err'&&x[1].errors).flatMap(x=>x[1].errors.map(e=>e.msg));
  T.check(links.some(u=>/^https:\/\/t\.me\/share\/url\?/.test(u)),'бот не підготував картку: текст через t.me/share');
  T.check(msgs.some(m=>/^share fallback: card not prepared · Bad Request: test refusal/.test(m)),'причина записана в client_errors: '+msgs.join(' | '));
  CARD_FAIL=null;await A.ctx.close();}
 await b.close();process.exit(T.done());})();
