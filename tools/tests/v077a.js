// Season summary, tab "Season stats": strength card with bars, result-vs-expected card, one collapsed "how to read", tips grouped under the player list,
// same column width as the hero, scroll hint on the wide table. Screenshots: tools/tests/out/v077a_*.png.   Run from repo root: node tools/tests/v077a.js [screenshot dir]
const path=require('path'),fs=require('fs');const {ROOT,openPage,playSeason}=require('./_page.js');const {checker}=require('./_site.js');
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const shot=(pg,n)=>pg.screenshot({path:path.join(OUT,`v077a_${n}.png`),fullPage:true});
const theme=(pg,t)=>pg.evaluate(t=>document.documentElement.setAttribute('data-theme',t),t);
const size=async(pg,w,h)=>{await pg.setViewportSize({width:w,height:h});await pg.waitForTimeout(250);};
const num=s=>parseFloat(String(s).replace('−','-').replace(/[^\d.\-]/g,''));
(async()=>{const T=checker('0.77 сила команди');
 const {b,pg,errs}=await openPage();
 await playSeason(pg,'classic',1,1);await pg.waitForTimeout(400);
 await pg.click('#tabs .tab[data-tab="t2"]');await pg.waitForTimeout(200);
 const d=await pg.evaluate(()=>{const S=window.__dbg.S,r=S.result,q=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
   const bars=all('#idxRow .mbar').map(m=>{const t=m.getBoundingClientRect(),u=m.firstElementChild.getBoundingClientRect();return {w:u.width/t.width,l:u.left>=t.left-.5,r:u.right<=t.right+.5,now:+m.getAttribute('aria-valuenow'),lo:+m.getAttribute('aria-valuemin'),hi:+m.getAttribute('aria-valuemax')};});
   const big=all('#idxRow .v b').map(e=>e.textContent),words=all('#idxRow .v i').map(e=>e.textContent);
   const res=all('#xRow>div').map(e=>({k:e.querySelector('.k').textContent,b:e.querySelector('b').textContent,s:(e.querySelector('small')||e.querySelector('.delta0')).textContent,cls:(e.querySelector('.delta0')||{}).className||''}));
   const det=all('#t2 details').map(e=>({s:e.querySelector('summary').textContent,open:e.open,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom}));
   const lines=all('#linesRow>div').map(e=>e.textContent);
   return {r:{att:r.t.att,def:r.t.def,gf:r.gf,ga:r.ga,xgf:r.xgf,xga:r.xga,pts:r.pts,xp:r.xp,proj:r.projPlace},bars,big,words,res,det,lines,say:q('#sayRow').textContent,
     tabsIn:!!q('#t2 .tipgrp #modelNote'),old:all('.x0,.lines0,.x0q').length,modelNote:q('#modelNote').textContent,
     cards:['strCard','xRow'].map(i=>{const e=document.getElementById(i),c=getComputedStyle(e);return {i,rad:parseFloat(c.borderTopLeftRadius),sh:c.boxShadow!=='none',w:e.getBoundingClientRect().width};}),
     heroW:q('#final>.hero').getBoundingClientRect().width,tabsW:q('#tabs').getBoundingClientRect().width,stripW:q('#strCard').getBoundingClientRect().width};});
 T.check(d.cards.every(c=>c.i&&c.w>0),'обидві картки є: «Сила команди» і «Результат проти очікувань»');
 T.check(d.big.length===2&&num(d.big[0])===+d.r.att.toFixed(1)&&num(d.big[1])===+d.r.def.toFixed(1),`атака ${d.big[0]} і оборона ${d.big[1]} збігаються з S.result (${d.r.att.toFixed(1)} / ${d.r.def.toFixed(1)})`);
 T.check(d.words.every(w=>/^(еліта|відмінно|сильно|добре|середньо|слабко)$/.test(w)),'біля чисел є слова: '+d.words.join(', '));
 T.check(d.bars.length===2&&d.bars.every(x=>x.w>=0&&x.w<=1.001&&x.l&&x.r&&x.lo===60&&x.hi===99&&Math.abs(x.w*100-Math.max(4,Math.min(100,(x.now-60)/39*100)))<=1),'смужки в межах доріжки 0–100% і відповідають шкалі 60..99: '+d.bars.map(x=>Math.round(x.w*100)+'%').join(', '));
 T.check(d.lines.length===4&&/^Атака/.test(d.lines[0])&&/^Півзахист/.test(d.lines[1])&&/^Захист/.test(d.lines[2])&&/^Воротар/.test(d.lines[3]),'4 лінії: '+d.lines.join(' | '));
 T.check(/Сильна сторона|Рівна команда/.test(d.say)&&new RegExp('Прогноз перед сезоном — '+d.r.proj+'-(ше|ге|тє|ме|те) місце').test(d.say),'підсумкове речення з порядковим числівником: '+d.say);
 T.check(d.res.length===3&&num(d.res[0].b)===d.r.gf&&num(d.res[1].b)===d.r.ga&&num(d.res[2].b)===d.r.pts,`забили ${d.res[0].b}, пропустили ${d.res[1].b}, очки ${d.res[2].b} — як у результаті (${d.r.gf}/${d.r.ga}/${d.r.pts})`);
 T.check(num(d.res[0].s.replace('xG',''))===+d.r.xgf.toFixed(1)&&num(d.res[1].s.replace('xGA',''))===+d.r.xga.toFixed(1),`очікувано: ${d.res[0].s}; ${d.res[1].s}`);
 const luck=d.r.pts-d.r.xp;
 T.check(Math.abs(num(d.res[2].s)-(+(luck>=0?luck:-luck).toFixed(1))*(luck>=0?1:-1))<.051&&/до прогнозу/.test(d.res[2].s)&&(luck>=0)===/\bup\b/.test(d.res[2].cls),`очки до прогнозу: ${d.res[2].s} (${luck>=0?'зелена':'червона'} плашка)`);
 const read=d.det.filter(x=>x.s==='Як це читати');
 T.check(read.length===1&&!read[0].open&&!d.det.some(x=>/xG|везіння/.test(x.s)),'«Як це читати» одна й згорнута, старих пояснень xG немає');
 T.check(await pg.evaluate(()=>{const t=document.getElementById('xCap').textContent;return /xG/.test(t)&&/xGA/.test(t)&&/Г−xG/.test(t)&&/До прогнозу/.test(t)&&/xP/.test(t);}),'у «Як це читати» злито всі пояснення (xG, xGA, Г−xG, до прогнозу, xP)');
 T.check(d.tabsIn&&d.old===0&&!/індекс/.test(d.modelNote)&&/Середній рейтинг XI|Лише пам/.test(d.modelNote)&&/Очікувані голи/.test(d.modelNote),'«Як рахувався сезон» у вкладці, без дубля індексів: '+d.modelNote.slice(0,70));
 T.check(d.cards.every(c=>c.rad===16&&c.sh),'картки: радіус 16, тінь --sh-1');
 T.check(Math.abs(d.heroW-d.tabsW)<=1&&Math.abs(d.stripW-d.tabsW)<=1,`одна колонка: герой ${d.heroW}, вкладки ${d.tabsW}, картка ${d.stripW}`);
 // tab "Overview": the grouped tips must not leak there
 await pg.click('#tabs .tab[data-tab="t1"]');await pg.waitForTimeout(100);
 T.check(await pg.evaluate(()=>!document.getElementById('modelNote').getBoundingClientRect().height),'на вкладці «Огляд» пояснень сезону немає');
 await pg.click('#tabs .tab[data-tab="t2"]');
 // layout at several widths
 const lay=()=>pg.evaluate(()=>{const g=document.querySelector('.tipgrp'),ds=[...g.querySelectorAll('details')],a=ds[0].getBoundingClientRect(),c=ds[1].getBoundingClientRect(),key=document.querySelector('.lnkey').getBoundingClientRect();
   const small=[...document.querySelectorAll('#t2 .mtr .k,#t2 .res0 .k,#t2 .res0 small,#t2 .lns4 span,#t2 .delta0,#t2 .say0')].map(e=>parseFloat(getComputedStyle(e).fontSize));
   const hint=id=>{const tw=document.getElementById(id).closest('.tblw'),s=tw.firstElementChild;return {scroll:s.scrollWidth>s.clientWidth+2,more:tw.classList.contains('more'),fade:+getComputedStyle(tw,'::after').opacity};};
   return {gap:c.top-a.bottom,afterList:a.top-key.bottom,sw:document.documentElement.scrollWidth,vw:innerWidth,minFs:Math.min(...small),sumH:[...document.querySelectorAll('#t2 details>summary')].map(s=>s.getBoundingClientRect().height),
     over:[...document.querySelectorAll('#t2 .card0 *')].filter(e=>e.getBoundingClientRect().right>e.closest('.card0').getBoundingClientRect().right+.5).length,
     hw:document.querySelector('#final>.hero').getBoundingClientRect().width,tw:document.getElementById('tabs').getBoundingClientRect().width,lg:hint('table'),pl:hint('playerStats')};});
 for(const [w,h,n] of [[820,1180,'ipad820'],[390,844,'phone390'],[320,700,'phone320'],[1024,1366,'ipad1024'],[1366,1024,'land1366']]){
   await size(pg,w,h);const l=await lay();
   T.check(l.gap>=0&&l.gap<24&&l.afterList<48,`${n}: два пояснення поруч (проміжок ${Math.round(l.gap)} px, від списку ${Math.round(l.afterList)} px)`);
   if(w<1000)T.check(Math.abs(l.hw-l.tw)<=1,`${n}: герой і вкладки в одній колонці (${l.hw} / ${l.tw})`);
   T.check(l.sw<=l.vw,`${n}: без горизонтального скролу сторінки (${l.sw} ≤ ${l.vw})`);
   T.check(l.minFs>=13&&l.sumH.every(x=>x>=43.5)&&l.over===0,`${n}: підписи ≥13 px (${l.minFs}), заголовки пояснень ≥44 px, вміст у картках без виходу за межі`);
   T.check(l.lg.scroll===l.lg.more&&l.pl.scroll===l.pl.more&&(!l.lg.scroll||l.lg.fade>.5)&&(w>390||l.lg.scroll),`${n}: підказка (затінений край) є, коли таблиця прокручується: турнірна ${l.lg.scroll}, гравці ${l.pl.scroll}`);
 }
 // the hint disappears at the end of scroll
 await size(pg,390,844);
 const end=await pg.evaluate(async()=>{const s=document.getElementById('table').parentElement;s.scrollLeft=s.scrollWidth;await new Promise(r=>setTimeout(r,200));return s.parentElement.classList.contains('more');});
 T.check(end===false,'у кінці прокрутки підказка зникає');
 // screenshots
 for(const [w,h,n] of [[820,1180,'ipad820'],[1366,1024,'land1366'],[390,844,'phone390']])for(const th of (n==='ipad820'?['dark','light']:['dark'])){
   await size(pg,w,h);await theme(pg,th);await pg.evaluate(()=>scrollTo(0,0));await pg.waitForTimeout(150);await shot(pg,`${n}_${th}`);}
 await theme(pg,'dark');
 T.check(errs.length===0,'помилок JS немає '+errs.join(';'));
 await b.close();process.exit(T.done());})();
