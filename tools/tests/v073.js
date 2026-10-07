// Draft and summary layout: setup without mode tiles, phone mini-bar and scroll to the list, pitch labels per width, summary hero,
// best scorer line, distinct draft icons, summary width on iPad. Screenshots: tools/tests/out/v073_*.png
// Run from repo root: node tools/tests/v073.js [screenshot dir]
const path=require('path'),fs=require('fs');const {ROOT,openPage,playSeason}=require('./_page.js');const {checker}=require('./_site.js');
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const shot=(pg,n,full)=>pg.screenshot({path:path.join(OUT,`v073_${n}.png`),fullPage:!!full});
const theme=(pg,t)=>pg.evaluate(t=>document.documentElement.setAttribute('data-theme',t),t);
const home=pg=>pg.evaluate(()=>document.getElementById('homeBtn').click());
const hit=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>0.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>0.5;
const box=(pg,sel)=>pg.$eval(sel,e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};});
async function pickOne(pg){await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});await (await pg.$('#squad .pl:not([disabled])')).click();await pg.waitForTimeout(80);
  const t=await pg.$('#pitch .slot.target');if(t){await t.click();await pg.waitForTimeout(60);}}
(async()=>{const T=checker('0.73');const {b,pg,errs}=await openPage();
 // ---- setup (classic): no mode tiles, title = mode, two difficulty options, start button does not cover anything
 await pg.click('#freeOpen');await pg.waitForTimeout(400);
 const su=await pg.evaluate(()=>({tiles:!!document.getElementById('formats'),title:document.getElementById('setTitle').textContent,h3:[...document.querySelectorAll('#s4 h3')].map(h=>h.textContent),
   dif:[...document.querySelectorAll('#modes .opt')].map(o=>o.textContent),era:!document.getElementById('eraBox').hidden,pos:getComputedStyle(document.getElementById('startBtn')).position}));
 T.check(!su.tiles&&!su.h3.includes('Режими'),'налаштування: блоку режимів немає');
 T.check(su.title==='Класика','налаштування: заголовок — режим («'+su.title+'»)');
 T.check(su.dif.join()==='Звичайний,Складний'&&su.era,'налаштування: дві кнопки складності, роки для класики');
 T.check(su.pos!=='fixed'&&su.pos!=='sticky','«Почати драфт» у потоці, не прилипає ('+su.pos+')');
 for(const y of ['top','bottom']){await pg.evaluate(y=>window.scrollTo(0,y==='top'?0:document.body.scrollHeight),y);await pg.waitForTimeout(150);
   const sb=await box(pg,'#startBtn');const opts=await pg.$$eval('#s4 .opt, #eras button',els=>els.map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
   T.check(!opts.some(o=>hit(o,sb)),`налаштування (${y}): кнопка не перекриває жодну опцію`);}
 await pg.evaluate(()=>window.scrollTo(0,0));await shot(pg,'setup_dark',true);await theme(pg,'light');await shot(pg,'setup_light',true);await theme(pg,'dark');
 // ---- draft on phone: scroll to the list after the wheel, mini-bar, scroll back to the pitch
 await pg.click('#startBtn');await pickOne(pg);await pickOne(pg);
 await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});await pg.waitForTimeout(900);
 const dr=await pg.evaluate(()=>{const q=document.querySelector('#squad .pl').getBoundingClientRect(),w=document.getElementById('reelClub').getBoundingClientRect(),m=document.getElementById('miniBar'),mr=m.getBoundingClientRect(),cs=getComputedStyle(m);
   return {listTop:q.top,club:w.top,vh:innerHeight,mini:m.classList.contains('on')&&cs.visibility==='visible'&&mr.height>0,mTop:mr.top,mText:document.getElementById('miniCnt').textContent,dots:m.querySelectorAll('.md i').length,full:m.querySelectorAll('.md i.f').length,
     up:document.getElementById('miniUp').getBoundingClientRect().height,sy:scrollY};});
 T.check(dr.listTop>0&&dr.listTop<dr.vh-60&&dr.club>0,`після колеса список у кадрі (верх списку ${Math.round(dr.listTop)} з ${dr.vh}, клуб ${Math.round(dr.club)}, scrollY ${Math.round(dr.sy)})`);
 T.check(dr.mini&&dr.mTop>=0&&dr.mTop<120&&dr.mText==='2/11'&&dr.dots===11&&dr.full===2&&dr.up>=44,`мініполоса на телефоні: «${dr.mText}», крапок ${dr.dots}, заповнених ${dr.full}, кнопка ${dr.up}px`);
 await shot(pg,'draft_phone_dark');await theme(pg,'light');await shot(pg,'draft_phone_light');await theme(pg,'dark');
 const ic=await pg.evaluate(()=>({a:document.querySelector('#restartBtn .ic path').getAttribute('d'),b:document.querySelector('#moveBtn .ic path').getAttribute('d')}));
 T.check(ic.a&&ic.b&&ic.a!==ic.b,`«Спочатку» і «Переставити гравців»: різні SVG-іконки`);
 await pg.click('#miniUp');await pg.waitForTimeout(900);
 const up=await pg.evaluate(()=>({t:document.getElementById('pitch').getBoundingClientRect().top,m:document.getElementById('miniBar').classList.contains('on')}));
 T.check(up.t>=0&&up.t<200,`«Поле ▴» повертає до поля (верх поля ${Math.round(up.t)})`);
 // phone pitch: no club line, bigger surname
 const ph=await pg.evaluate(()=>{const c=[...document.querySelectorAll('#pitch .slot.filled .club')].map(e=>getComputedStyle(e).display),n=[...document.querySelectorAll('#pitch .slot.filled .nm:not(.long):not(.xl)')].map(e=>parseFloat(getComputedStyle(e).fontSize)),d=document.querySelector('#pitch .slot.filled .disc').getBoundingClientRect().width;return {c,n,d,w:document.getElementById('pitch').clientWidth};});
 T.check(ph.c.length>=2&&ph.c.every(x=>x==='none'),`телефон: на полі немає рядка клубу (${ph.c.join()})`);
 T.check(ph.n.every(x=>x>=12.5&&x<=13.5),`телефон: прізвище ~13px (${ph.n.join()}), поле ${ph.w}px`);
 // ---- wide: mini-bar hidden, club line back, bigger chips
 const phoneDisc=ph.d;
 await pg.setViewportSize({width:1180,height:820});await pg.waitForTimeout(500);
 const wd=await pg.evaluate(()=>{const m=document.getElementById('miniBar');return {mini:getComputedStyle(m).display,c:[...document.querySelectorAll('#pitch .slot.filled .club')].map(e=>[getComputedStyle(e).display,e.getBoundingClientRect().width>0]),d:document.querySelector('#pitch .slot.filled .disc').getBoundingClientRect().width,w:document.getElementById('pitch').clientWidth};});
 T.check(wd.mini==='none','широкий екран: мініполоси немає');
 T.check(wd.c.length>=2&&wd.c.every(x=>x[0]==='block'&&x[1])&&wd.d>phoneDisc,`широке поле (${wd.w}px): є рядок клубу, фішки більші (${phoneDisc} → ${wd.d})`);
 await (await pg.$('#squad .pl:not([disabled])')).click();await pg.waitForTimeout(80);{const t=await pg.$('#pitch .slot.target');if(t){await t.click();await pg.waitForTimeout(60);}}
 const sy0=await pg.evaluate(()=>scrollY);await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});await pg.waitForTimeout(900);
 T.check(Math.abs(await pg.evaluate(()=>scrollY)-sy0)<5,'широкий екран: автопрокрутки до списку немає');
 await shot(pg,'draft_ipad_land');
 await pg.setViewportSize({width:820,height:1180});await pg.waitForTimeout(500);await shot(pg,'draft_ipad_port');
 T.check(await pg.evaluate(()=>getComputedStyle(document.getElementById('miniBar')).display==='none'),'iPad вертикально: мініполоси немає');
 await pg.setViewportSize({width:390,height:844});
 // ---- summary (classic season)
 await playSeason(pg,'classic',1,1);await pg.waitForTimeout(400);
 const sm=await pg.evaluate(()=>{const S=window.__dbg.S,r=S.result,R=id=>{const e=document.getElementById(id);return e&&!e.hidden?e.getBoundingClientRect():null;};const hero=document.querySelector('#final>.hero');
   const t2=document.getElementById('t2');const inD=id=>!!document.getElementById(id).closest('details:not(.x0q)');
   return {place:document.getElementById('placeBig').textContent,rp:r.place,tiles:document.querySelectorAll('#recTiles>div').length,heroTxt:hero.textContent,placeTiles:[...document.querySelectorAll('#recTiles span')].map(s=>s.textContent),
     big:R('placeBig'),tier:R('tier'),verd:R('verdRow'),chip:(()=>{const c=document.querySelector('#verdRow .vc');return c&&R('verdRow')?c.getBoundingClientRect():null;})(),
     inT2:['xRow','idxRow','linesRow','xCap'].every(i=>t2.contains(document.getElementById(i))),xTxt:document.getElementById('xRow').textContent,idx:document.getElementById('idxRow').textContent,lines:document.getElementById('linesRow').textContent+document.getElementById('sayRow').textContent,
     hiddenXD:inD('xRow'),oldX:!!document.querySelector('#final>.hero #xRow'),
     scorersEl:!!document.getElementById('scorers'),h3:[...document.querySelectorAll('#t1 h3')].map(h=>h.textContent),top:document.getElementById('topScorer').textContent,topHidden:document.getElementById('topScorer').hidden,mvp:document.getElementById('mvpLine2').textContent,
     sc:r.scorers[0]?r.scorers[0].name+' '+r.scorers[0].g:'',share:getComputedStyle(document.getElementById('tgShareBtn')).backgroundImage,alt:getComputedStyle(document.getElementById('againBtn')).backgroundImage,
     rows:(()=>{const a=document.getElementById('againBtn').getBoundingClientRect(),s=document.getElementById('tgShareBtn').getBoundingClientRect();return {againBelow:a.top>=s.bottom,w:a.width};})()};});
 T.check(sm.place===String(sm.rp)&&sm.tiles===2&&!sm.placeTiles.includes('місце'),`підсумок: одне велике місце (${sm.place}), плиток у рядку ${sm.tiles}`);
 T.check(!/Прогноз/.test(await pg.$eval('#final>.hero',e=>e.textContent)),'підсумок: плашки «Прогноз» у верхній картці немає');
 const ovl=[['місце×зона',sm.big,sm.tier],['місце×вердикт',sm.big,sm.verd],['зона×вердикт',sm.tier,sm.verd]].filter(([,a,c])=>a&&c&&hit(a,c));
 T.check(sm.big&&sm.tier&&!ovl.length,'підсумок: місце, зона й вердикт не накладаються '+ovl.map(o=>o[0]).join());
 T.check(!sm.verd||sm.verd.top>=sm.tier.bottom-0.5,'підсумок: вердикт під текстом зони');
 T.check(sm.inT2&&/xG/.test(sm.xTxt)&&/Атака/.test(sm.idx)&&/Оборона/.test(sm.idx)&&/Прогноз перед сезоном/.test(sm.lines)&&!sm.oldX,'підсумок: xG, індекси, лінії — у вкладці «Статистика сезону»');
 T.check(!sm.scorersEl&&!sm.h3.includes('Бомбардири')&&!sm.topHidden&&/⚽/.test(sm.top)&&/Найкращий бомбардир/.test(sm.top)&&sm.top.includes(sm.sc.split(' ').slice(0,-1).join(' ')),`бомбардири: «${sm.top}»`);
 T.check(/Гравець сезону/.test(sm.mvp),'«Гравець сезону» лишився: '+sm.mvp);
 T.check(/gradient/.test(sm.share)&&!/gradient/.test(sm.alt),'«Поділитися» — градієнтна головна кнопка, «Новий драфт» — другорядна');
 await shot(pg,'result_phone_dark',true);
 await pg.click('#tabs .tab[data-tab="t2"]');await pg.waitForTimeout(200);
 T.check(await pg.$eval('#xRow',e=>e.getBoundingClientRect().height>0&&!e.closest('[hidden]')),'«Статистика сезону»: xG видно одразу');
 await shot(pg,'stats_phone_dark',true);
 await pg.click('#tabs .tab[data-tab="t1"]');
 await theme(pg,'light');await shot(pg,'result_phone_light',true);await theme(pg,'dark');
 await pg.evaluate(()=>window.scrollTo(0,0));
 // pitch on the summary: phone has no club line, wide has
 T.check(await pg.evaluate(()=>[...document.querySelectorAll('#pitch2 .slot .club .ct')].every(e=>!e.offsetParent)),'підсумок на телефоні: у фішках немає рядка клубу');
 for(const [w,h,n] of [[1180,820,'result_ipad_land'],[820,1180,'result_ipad_port']]){
   await pg.setViewportSize({width:w,height:h});await pg.waitForTimeout(500);await pg.evaluate(()=>window.scrollTo(0,0));
   const g=await pg.evaluate(()=>{const h=document.querySelector('#final>.hero').getBoundingClientRect(),c=document.querySelector('#verdRow .vc'),cr=c&&c.getBoundingClientRect();return {hw:h.width,cw:cr?cr.width:0,left:h.left,right:innerWidth-h.right,club:[...document.querySelectorAll('#pitch2 .slot .club')].map(e=>getComputedStyle(e).display)};});
   T.check(g.hw<=(w>=1000?700:760)&&Math.abs(g.left-g.right)<2,`iPad ${w}×${h}: верхня картка ${Math.round(g.hw)}px, по центру`);
   T.check(g.cw<400,`iPad ${w}×${h}: вердикт не розтягнутий (${Math.round(g.cw)}px)`);
   if(w===1180)T.check(g.club.length>0&&g.club.every(x=>x==='block'),'підсумок на iPad: рядок клубу на полі є');
   await shot(pg,n,true);}
 // phone: overall rating on the summary pitch without the club name; zone line capitalised; season pick buttons in view after the club spin
 {const o=await openPage({viewport:{width:375,height:667}});await playSeason(o.pg,'classic',1,1);
  const r=await o.pg.evaluate(()=>({tier:document.getElementById('tier').textContent,r0:[...document.querySelectorAll('#final .pitch .slot .r0')].filter(e=>e.offsetParent).length,ct:[...document.querySelectorAll('#final .pitch .slot .ct')].filter(e=>e.offsetParent).length}));
  T.check(r.r0===11&&r.ct===0,`телефон: загальний рейтинг на полі підсумку (${r.r0}), клубу немає (${r.ct})`);
  T.check(r.tier[0]===r.tier[0].toUpperCase(),'рядок зони з великої літери: '+r.tier);
  await o.pg.evaluate(()=>document.getElementById('homeBtn').click());await o.pg.click('#pickOpen');await o.pg.waitForTimeout(300);
  await o.pg.click('#spinBtn');await o.pg.waitForSelector('#seaPick:not([hidden]) button',{timeout:8000});await o.pg.waitForTimeout(900);
  const q=await o.pg.evaluate(()=>({bot:document.querySelector('#seaPick button').getBoundingClientRect().bottom,vh:innerHeight}));
  T.check(q.bot<=q.vh,`вибір сезону: кнопки сезонів у кадрі після колеса (${Math.round(q.bot)} ≤ ${q.vh})`);
  T.check(!o.errs.length,'телефон 375: помилок немає '+o.errs.join(' | '));await o.b.close();}
 T.check(!errs.length,'помилок на сторінці немає '+errs.join(' | '));
 await b.close();process.exit(T.done());})();
