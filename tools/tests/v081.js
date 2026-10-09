// Leave / delete a friends league and leave a chat league: origin line, quiet bottom buttons, in-place confirm, toast with Undo.
// RPC and DB are in memory (SQL part is covered by tools/tests/setup.sh). Screenshots: tools/tests/out/v081_*.png
// Run from repo root: node tools/tests/v081.js
const path=require('path'),fs=require('fs');const {ROOT,launch,makeDB,openSite,checker}=require('./_site.js');
const OUT=path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const T=checker('вихід і видалення ліг');
const ME='andr2345';
function mk(){
  const names={[ME]:'andre',vitya234:'vitia',igor2345:'igor',olha2345:'olha'};
  const L={abc222:{owner:ME,mem:[ME],name:'Соло'},abc333:{owner:ME,mem:[ME,'vitya234','igor2345','olha2345'],name:'Четвірка'},abc444:{owner:'vitya234',mem:[ME,'vitya234','igor2345'],name:'Чужа'}};
  const gone=new Set(),left=new Set(),calls=[];let chatOut=false;
  const get=id=>{const l=L[id];if(!l||gone.has(id))return null;const isLeft=u=>u===ME&&left.has(id),mem=l.mem.filter(u=>!isLeft(u));   // as the SQL: a member who left stays in the table with left:true
    return {id,name:l.name,fmt:'11',start_day:'2026-10-05',days:3,tries:3,take:'best',scoring:'place',rerolls:1,ratings:'show',era:'all',today:'2026-10-09',day_n:2,over:false,owner:l.owner,
      owner_name:names[l.owner],created_at:'2026-10-05T10:00:00Z',members:mem.length,board:l.mem.map((u,i)=>({u,name:names[u],total:4-i,wins:i?0:1,best:50,played:1,left:isLeft(u)})),tour:[]};};
  const js={id:'p-me',name:'andre',anon_name:'calm_owl',public_id:ME,name_next:null,contact_email:null,news_optin:false};
  const guard=(id,ok)=>ok?{ok:true}:{status:400,body:'{"message":"fl_none"}'};
  const rpc={player_hello:()=>js,link_account:()=>({...js,merge_offer:null}),trophy_stats:()=>({players:2,t:{}}),
    player_profile:()=>({public_id:ME,name:'andre',anon:false,since:'2026-09-02T10:00:00Z',seasons:0,champions:0,perfect:0,best_classic:0,win_pct:0,best:{},worst:{},trophies:[],streak_best:0,streak_now:0}),
    fl_mine:()=>Object.keys(L).filter(id=>get(id)&&get(id).board.some(r=>r.u===ME&&!r.left)).map(id=>({id,name:L[id].name,fmt:'11',days:3,tries:3,day_n:2,over:false,members:get(id).members,tries_today:0,place:1,mine:L[id].owner===ME})),
    fl_get:a=>get(a.p_id)||{status:200,body:'null'},
    fl_leave:a=>{calls.push(['fl_leave',a]);if(global.FAIL)return {status:400,body:'{"message":"boom"}'};if(L[a.p_id].owner===ME)return {status:400,body:'{"message":"fl_owner"}'};a.p_undo?left.delete(a.p_id):left.add(a.p_id);return {ok:true};},
    fl_delete:a=>{calls.push(['fl_delete',a]);if(global.FAIL)return {status:400,body:'{"message":"boom"}'};a.p_undo?gone.delete(a.p_id):gone.add(a.p_id);return {ok:true};},
    tg_leagues_mine:()=>chatOut?[]:[{chat_id:-100555,title:'Футбол по середах',members:4,played_today:1}],
    tg_league_leave:a=>{calls.push(['tg_league_leave',a]);chatOut=!a.p_undo;return {ok:true};}};
  const db=makeDB({seasons:{auto:'id'},season_seeds:{auto:'id'},daily_results:{auto:'id'},player_links:{},user_state:{}},rpc);
  db.DB.players=[{id:'p-me',name:'andre',anon_name:'calm_owl',public_id:ME}];global.fetch=db.fetch;
  return {db,calls,gone,left};}
const shot=(pg,f,full)=>pg.screenshot({path:path.join(OUT,'v081_'+f+'.png'),fullPage:!!full});
const txt=async(pg,sel)=>(await pg.textContent(sel).catch(()=>'')||'').replace(/\s+/g,' ');
async function openL(pg,id){await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.click('#flOpen');await pg.waitForTimeout(500);await pg.click(`.fl-row[data-l="${id}"]`);await pg.waitForTimeout(500);}
const toBottom=async pg=>{await pg.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await pg.waitForTimeout(150);};
(async()=>{const b=await launch();const M=mk();const {db}=M;
 const A=await openSite({b,db,signed:true,viewport:{width:390,height:844},wait:1500});const pg=A.pg;
 // ---- owner, single-player league: instant delete + toast + Undo
 await pg.click('#flOpen');await pg.waitForTimeout(500);
 T.check(await pg.$$eval('#fl .fl-row',e=>e.length)===3,'список: 3 ліги');
 await pg.click('.fl-row[data-l="abc222"]');await pg.waitForTimeout(500);
 T.check(/Створив ти · 5 жовт\./.test(await txt(pg,'#fl .fl-origin')),'«Створив ти · 5 жовт.»: '+await txt(pg,'#fl .fl-origin'));
 T.check(!/лише ти|1 гравець ·.*Створив/.test(await txt(pg,'#fl .fl-origin')),'у рядку походження немає кількості гравців');
 const og=await pg.$eval('#fl .fl-origin',e=>{const c=getComputedStyle(e);return {col:c.color,lh:c.lineHeight,fs:c.fontSize};});
 T.check(og.fs==='13px'&&parseFloat(og.lh)/13>1.27&&parseFloat(og.lh)/13<1.29,'рядок походження: 13px, висота рядка 1.28 ('+og.lh+')');
 await toBottom(pg);
 const geo=await pg.evaluate(()=>{const b=document.getElementById('flDel'),p=document.getElementById('flBack');return {h:b.getBoundingClientRect().height,gap:b.getBoundingClientRect().top-p.getBoundingClientRect().bottom,col:getComputedStyle(b).color,bd:getComputedStyle(b).borderTopWidth,bg:getComputedStyle(b).backgroundColor,loss:getComputedStyle(document.documentElement).getPropertyValue('--loss').trim()};});
 T.check(geo.h>=44&&geo.gap>=32&&geo.bd==='0px'&&geo.bg==='rgba(0, 0, 0, 0)','«Видалити лігу»: ≥44px, відступ ≥32px, без рамки й заливки ('+Math.round(geo.h)+'px, '+Math.round(geo.gap)+'px)');
 await shot(pg,'owner_solo',true);await shot(pg,'owner_solo_bottom');
 await pg.evaluate(()=>document.documentElement.dataset.theme='light');await pg.waitForTimeout(500);await shot(pg,'owner_solo_light');await pg.evaluate(()=>document.documentElement.dataset.theme='dark');
 await pg.click('#flDel');await pg.waitForTimeout(500);
 T.check(M.calls.some(c=>c[0]==='fl_delete'&&c[1].p_id==='abc222'&&!c[1].p_undo)&&!!await pg.$('#flNew'),'одиночна: видалено одразу, відкрито список ліг');
 T.check(await pg.$$eval('#fl .fl-row',e=>e.length)===2,'зі списку лігу прибрано');
 T.check(/Лігу видалено/.test(await txt(pg,'#toast'))&&await pg.$eval('#toast',e=>e.getAttribute('role')==='status'&&e.getAttribute('aria-live')==='polite'),'тост «Лігу видалено», role=status');
 const tb=await pg.$eval('#toast button',e=>({t:e.textContent,h:e.getBoundingClientRect().height,col:getComputedStyle(e).color,am:getComputedStyle(document.documentElement).getPropertyValue('--amber').trim()}));
 T.check(tb.t==='Повернути'&&tb.h>=44,'кнопка «Повернути» ≥44px');
 await shot(pg,'owner_solo_after');
 await pg.click('#toast button');await pg.waitForTimeout(600);
 T.check(M.calls.some(c=>c[0]==='fl_delete'&&c[1].p_id==='abc222'&&c[1].p_undo===true)&&/Соло/.test(await txt(pg,'#fl'))&&await pg.$('#flDel')!==null,'«Повернути»: p_undo, лігу знову відкрито');
 T.check(!await txt(pg,'#toast'),'після «Повернути» тост зник');
 // ---- owner, league with 4 players: confirm in place
 await openL(pg,'abc333');
 T.check(/Створив ти/.test(await txt(pg,'#fl .fl-origin')),'ліга на 4: рядок походження');
 await pg.click('#flDel');await pg.waitForTimeout(200);
 T.check(/Ліга зникне у всіх 4 гравців\./.test(await txt(pg,'#fl .fl-delbox'))&&!M.gone.has('abc333'),'«Ліга зникне у всіх 4 гравців.», ще не видалено');
 const bx=await pg.evaluate(()=>{const y=document.getElementById('flDelYes').getBoundingClientRect(),n=document.getElementById('flDelNo').getBoundingClientRect();return {h:Math.min(y.height,n.height),dw:Math.abs(y.width-n.width),dang:document.getElementById('flDelYes').classList.contains('danger'),focus:document.activeElement.id,modal:!!document.querySelector('dialog[open],.overlay:not([hidden])')};});
 T.check(bx.h>=44&&bx.dw<2&&bx.dang&&!bx.modal,'підтвердження на місці: дві кнопки по 44px однакової ширини, не модалка');
 T.check(bx.focus==='flDelNo','фокус на «Скасувати»');
 await toBottom(pg);await shot(pg,'owner_group_confirm_bottom');await shot(pg,'owner_group_confirm',true);
 await pg.evaluate(()=>document.documentElement.dataset.theme='light');await pg.waitForTimeout(500);await shot(pg,'owner_group_confirm_light');await pg.evaluate(()=>document.documentElement.dataset.theme='dark');
 await pg.click('#flDelNo');await pg.waitForTimeout(200);
 T.check(!await pg.$('#flDelYes')&&!!await pg.$('#flDel')&&!M.gone.has('abc333'),'«Скасувати» закриває підтвердження');
 await pg.click('#flDel');await pg.click('#flDelYes');await pg.waitForTimeout(500);
 T.check(M.gone.has('abc333')&&/Лігу видалено/.test(await txt(pg,'#toast')),'«Видалити»: ліга видалена, тост');
 // ---- toast timer: pause on hover, hides after 7 s
 await pg.evaluate(()=>{window.__t0=Date.now();});
 await pg.hover('#toast .toast');await pg.waitForTimeout(7600);
 T.check(!!await txt(pg,'#toast')&&await pg.$eval('#toast .toast',e=>e.classList.contains('hold')),'тост на паузі, поки на ньому курсор (>7 с)');
 await pg.mouse.move(5,5);await pg.waitForTimeout(7600);
 T.check(!await txt(pg,'#toast'),'тост зникає через ~7 с після того, як курсор пішов');
 // ---- member (not owner): leave without confirm
 await openL(pg,'abc444');
 T.check(/Створив vitia · 5 жовт\./.test(await txt(pg,'#fl .fl-origin')),'ліга друга: «Створив vitia · 5 жовт.»');
 T.check(!await pg.$('#flDel')&&/Вийти з ліги/.test(await txt(pg,'#flLeave')),'учасник: «Вийти з ліги», видалення немає');
 await toBottom(pg);await shot(pg,'member_leave_bottom');
 await pg.click('#flLeave');await pg.waitForTimeout(500);
 T.check(M.calls.some(c=>c[0]==='fl_leave'&&c[1].p_id==='abc444')&&/Ти вийшов з ліги/.test(await txt(pg,'#toast'))&&await pg.$$eval('#fl .fl-row',e=>e.length)===1,'вихід одразу: тост «Ти вийшов з ліги», у списку лишилась одна');
 await shot(pg,'member_left_toast');
 await pg.click('#toast button');await pg.waitForTimeout(600);
 T.check(M.calls.some(c=>c[0]==='fl_leave'&&c[1].p_undo===true)&&/Чужа/.test(await txt(pg,'#fl')),'«Повернути»: учасник знову в лізі');
 // ---- errors
 global.FAIL=true;await pg.click('#flLeave');await pg.waitForTimeout(500);
 T.check(/Не вдалося\. Спробуй ще раз\./.test(await txt(pg,'#toast'))&&!await pg.$('#toast button')&&/Чужа/.test(await txt(pg,'#fl')),'помилка: тост без дії, лишились на сторінці ліги');
 global.FAIL=false;
 await pg.click('#flLeave');await pg.waitForTimeout(500);
 const LV=await openSite({b,db,query:'?l=abc444',wait:1500});await LV.pg.waitForSelector('#fl .fl-origin');
 T.check(/приєднатися/i.test(await txt(LV.pg,'#fl'))&&!await LV.pg.$('#flLeave'),'вийшов і відкрив посилання: «Приєднатися», а не «Вийти з ліги» (у таблиці лишився з позначкою left)');
 M.left.delete('abc444');await LV.ctx.close();
 T.check(!A.errs.length,'помилок на сторінці немає '+A.errs.join(' | '));
 // ---- iPad
 await pg.setViewportSize({width:820,height:1180});await openL(pg,'abc444');await toBottom(pg);await shot(pg,'member_ipad');
 await pg.setViewportSize({width:390,height:844});
 // ---- not signed in: no buttons
 const G=await openSite({b,db,query:'?l=abc444',wait:1800});
 await G.pg.waitForFunction(()=>/Чужа/.test((document.getElementById('fl')||{}).textContent||''),null,{timeout:15000}).catch(()=>{});
 T.check(/Чужа/.test(await txt(G.pg,'#fl'))&&!await G.pg.$('#flDel,#flLeave'),'гість: ліга видна, кнопок «Видалити»/«Вийти» немає');
 T.check(/Створив/.test(await txt(G.pg,'#fl .fl-origin')),'гість: рядок походження є');
 // deleted league by link: "no such league"
 const D=await openSite({b,db,query:'?l=abc333',wait:1500});
 T.check(/Такої ліги немає/.test(await txt(D.pg,'#fl'))&&!await D.pg.$('#flDel,#flLeave')&&!D.errs.length,'видалена ліга за посиланням: «Такої ліги немає», без помилок '+D.errs.join(' | '));
 // ---- chat league
 const tg={initData:'user=x&hash=abc',initDataUnsafe:{user:{id:1,first_name:'Андрій'},start_param:'g-100555'},colorScheme:'dark',platform:'android'};
 const api={'/api/auth':async()=>({json:{token_hash:'TH'}}),'/api/league':async req=>req.method==='POST'?{json:{ok:true,joined:[],posted:[]}}:{json:{title:'Футбол по середах',day:'2026-10-09',members:4,today:[{name:'Сергій',w:20,d:5,l:5,pts:65},{name:'Андрій',u:ME,w:18,d:5,l:7,pts:59}],standings:[{name:'Сергій',wins:2,days:2}]}}};
 const C=await openSite({b,db,api,tg,hash:'#tgWebAppData=x',viewport:{width:390,height:844},wait:1800});const p2=C.pg;
 await p2.click('#tablesOpen');await p2.waitForTimeout(900);
 T.check(/Футбол по середах/.test(await txt(p2,'#tbChats'))&&!!await p2.$('#lgLeave'),'«Мої чати»: таблиця й «Вийти з ліги»');
 T.check(/Ліга належить групі в Telegram\. Повернешся, якщо знову відкриєш гру з групи\./.test(await txt(p2,'#tbChats .fl-note')),'пояснення під кнопкою');
 const nw=await p2.$eval('#tbChats .fl-note',e=>({mw:getComputedStyle(e).maxWidth,al:getComputedStyle(e).textAlign}));
 T.check(nw.al==='center'&&parseFloat(nw.mw)>0,'пояснення по центру, обмежена ширина ('+nw.mw+')');
 await p2.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await p2.waitForTimeout(200);await shot(p2,'chat_league');
 await p2.click('#lgLeave');await p2.waitForTimeout(700);
 T.check(M.calls.some(c=>c[0]==='tg_league_leave'&&c[1].p_chat==='-100555'&&!c[1].p_undo),'tg_league_leave викликано з p_chat');
 T.check(!/Футбол по середах/.test(await txt(p2,'#tbChats'))&&/жодній лізі/.test(await txt(p2,'#tbChats'))&&/Ти вийшов з ліги/.test(await txt(p2,'#toast')),'чат зник із вкладки, тост «Ти вийшов з ліги»');
 await shot(p2,'chat_left');
 T.check(await p2.evaluate(()=>!Object.keys(localStorage).some(k=>k.startsWith('upl30_joined_'))),'вихід із чату: upl30_joined_* стерто (у цій сесії гру відкрито з групи, тож upl30_league знову ставиться — так і має бути)');
 await p2.click('#toast button');await p2.waitForTimeout(900);
 T.check(M.calls.some(c=>c[0]==='tg_league_leave'&&c[1].p_undo===true)&&/Футбол по середах/.test(await txt(p2,'#tbChats')),'«Повернути»: чат знову на вкладці');
 T.check(!C.errs.length&&!G.errs.length,'помилок немає '+C.errs.concat(G.errs).join(' | '));
 await b.close();process.exit(T.done());})();
