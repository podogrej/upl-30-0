// One club page: club records from standings, club list (A-Z, counters, filters, tiles), club card, record block after a season,
// records sync merge. Screenshots: tools/tests/out/oc72_*.png. Run from repo root: node tools/tests/oneclub72.js
const path=require('path');const {openPage,playSeason,ROOT}=require('./_page.js');const {checker}=require('./_site.js');
const OUT=path.join(ROOT,'tools','tests','out');
(async()=>{const T=checker('oneclub72');const {b,pg,errs}=await openPage();
 // records: deductions 2016/17, full tables 2017/18-2019/20, no 2021/22 and current season
 const R=await pg.evaluate(()=>window.__dbg.CLUB_REC);
 T.check(Object.keys(R).length===48,`рекорди є в ${Object.keys(R).length} клубів (48, без трьох новачків)`);
 T.check(R['dnipro'][3]===13&&R['dnipro'][4]===2016&&R['volyn-lutsk'][3]===10,'2016/17 зі знятими очками: Дніпро 13, Волинь 10');
 T.check(R['shakhtar-donetsk'].join()==='83,2018,32,34,1992,30','Шахтар: рекорд 83 (2018/19, 32 тури), найгірший 34 (1992/93)');
 T.check(R['karpaty-lviv'][3]===15&&R['karpaty-lviv'][4]===2014&&R['metalurh-donetsk'][3]===22&&R['hoverla-uzhhorod'][3]===7,'знято очки 2014/15–2015/16: Карпати 15, Металург Д. 22, Говерла 7');
 T.check(R['arsenal-kyiv'][4]!==2013&&R['tavriya-simferopol'].slice(3).join()==='10,2013,28','2013/14: Арсенал анульовано, Таврія 10 за 28 турів');
 T.check(Object.values(R).every(v=>![2021,2025].includes(v[1])&&![2021,2025].includes(v[4])),'2021/22 і поточний сезон у рекордах не враховано');
 T.check(!R['epicentr']&&!R['kudrivka']&&!R['sc-poltava'],'новачки без рекордів');
 // list page
 await pg.click('#clubOpen');await pg.waitForTimeout(300);
 const L=await pg.evaluate(()=>({vis:!document.getElementById('s8').hidden,names:[...document.querySelectorAll('#ocGrid .oct b')].map(e=>e.textContent),
   newc:[...document.querySelectorAll('#ocGrid .oct small')].filter(e=>e.textContent==='новачок').length,cnt:document.getElementById('ocCnt').textContent}));
 const sorted=[...L.names].sort((a,c)=>a.localeCompare(c,'uk'));
 T.check(L.vis&&L.names.length===51,`сторінка клубів: ${L.names.length} плиток`);
 T.check(L.names.join('|')===sorted.join('|'),'плитки за абеткою');
 T.check(L.newc===3,`позначка «новачок» у ${L.newc} плиток`);
 T.check(/0\/48/.test(L.cnt)&&/0 клубів пройдено/.test(L.cnt),'лічильники до гри: '+L.cnt);
 // player progress: Shakhtar done, Dynamo best only, Karpaty from an old best record
 await pg.evaluate(()=>{localStorage.setItem('upl30_clubrec',JSON.stringify({'shakhtar-donetsk':{b:85,w:30,n:3},'dynamo-kyiv':{b:90,w:50,n:2},'epicentr':{b:40,w:40,n:1}}));
   const D=window.__dbg;D.BEST['oneclub:karpaty-lviv']={W:10,D:10,L:10,pts:40,place:9,formation:'4-4-2',mode:'normal'};D.renderOc();});
 const P=await pg.evaluate(()=>{const st=c=>document.querySelector(`#ocGrid .oct[data-c="${c}"]`).dataset.s;
   const f=k=>{document.querySelector(`#ocSeg button[data-f="${k}"]`).click();return [...document.querySelectorAll('#ocGrid .oct')].filter(t=>!t.hidden).length;};
   const r={cnt:document.getElementById('ocCnt').textContent,sh:st('shakhtar-donetsk'),dy:st('dynamo-kyiv'),ka:st('karpaty-lviv'),ep:st('epicentr'),
     done:document.querySelector('#ocGrid .oct[data-c="shakhtar-donetsk"] .ocdone')?.textContent,bd:document.querySelector('#ocGrid .oct[data-c="dynamo-kyiv"] .ocbd')?.textContent,
     fDone:f('done'),fStart:f('start'),fTodo:f('todo'),fAll:f('all')};return r;});
 T.check(/🏅 2\/48/.test(P.cnt)&&/🪦 1\/48/.test(P.cnt)&&/1 клуб пройдено/.test(P.cnt),'лічильники: '+P.cnt);
 T.check(P.sh==='done'&&/Пройдено/.test(P.done||'')&&P.dy==='start'&&P.bd==='🏅'&&P.ka==='start'&&P.ep==='start',`стани плиток: Шахтар ${P.sh}, Динамо ${P.dy} ${P.bd}, Карпати ${P.ka}, Епіцентр ${P.ep}`);
 T.check(P.fDone===1&&P.fStart===3&&P.fTodo===47&&P.fAll===51,`фільтри: пройдено ${P.fDone}, почато ${P.fStart}, не почато ${P.fTodo}, усі ${P.fAll}`);
 await pg.evaluate(()=>{document.querySelector('#ocSeg button[data-f="all"]').click();window.scrollTo(0,0);});
 await pg.screenshot({path:path.join(OUT,'oc72_list.png'),fullPage:true});
 // club card
 await pg.click('#ocGrid .oct[data-c="shakhtar-donetsk"]');await pg.waitForTimeout(300);
 const C=await pg.evaluate(()=>({s4:!document.getElementById('s4').hidden,fmt:document.getElementById('fmtBox').hidden,era:document.getElementById('eraBox').hidden,
   txt:document.getElementById('ocCard').textContent,start:document.getElementById('startBtn').textContent,club:window.__dbg.S.club}));
 T.check(C.s4&&C.fmt&&C.era&&C.club==='shakhtar-donetsk','картка: екран налаштувань без режимів і років');
 T.check(/Рекорд 83\* оч\. · 2018\/19/.test(C.txt)&&/Найгірший 34\* оч\. · 1992\/93/.test(C.txt)&&/2018\/19 — 32 тури; 1992\/93 — 2 очки за перемогу/.test(C.txt),'картка: рекорди зі зносками');
 T.check(/Найкращий 85/.test(C.txt)&&/Найгірший 30/.test(C.txt)&&/3 сезони/.test(C.txt)&&/Клуб пройдено/.test(C.txt),'картка: «Твій рекорд»');
 T.check(/Почати драфт · Шахтар/.test(C.start),'кнопка: '+C.start);
 await pg.screenshot({path:path.join(OUT,'oc72_card.png'),fullPage:true});
 await pg.click('#ocChange');await pg.waitForTimeout(200);T.check(await pg.$eval('#s8',e=>!e.hidden),'«Змінити клуб» веде до списку клубів');
 await pg.click('#ocGrid .oct[data-c="kudrivka"]');await pg.waitForTimeout(200);
 T.check(/Новачок УПЛ/.test(await pg.textContent('#ocCard'))&&/Ще не грав/.test(await pg.textContent('#ocCard')),'картка новачка: рекордів ще немає');
 // challenge sets S.format directly: free play must still show the format choice
 await pg.click('#ocChange');await pg.click('#ocGrid .oct[data-c="karpaty-lviv"]');await pg.evaluate(()=>{window.__dbg.S.format='classic';document.getElementById('homeBtn').click();});await pg.click('#freeOpen');
 T.check(await pg.evaluate(()=>!document.getElementById('fmtBox').hidden&&document.getElementById('ocCard').hidden&&!/Карпати/.test(document.getElementById('startBtn').textContent)),'після виклику «Вільна гра» без картки клубу');
 // free play returns to the format choice
 await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.click('#freeOpen');
 T.check(await pg.evaluate(()=>!document.getElementById('fmtBox').hidden&&document.getElementById('ocCard').hidden&&window.__dbg.S.format==='classic'),'«Вільна гра» знову з режимами');
 // a real season for Karpaty (from the card), records updated
 await playSeason(pg,'oneclub',1,1);
 const S1=await pg.evaluate(()=>({res:!document.getElementById('ocRes').hidden,txt:document.getElementById('ocRes').textContent,me:window.__dbg.ocMine()['karpaty-lviv']}));
 T.check(S1.res&&/Карпати/.test(S1.txt)&&S1.me&&S1.me.n===2&&S1.me.w===Math.min(40,S1.me.b),`після сезону: блок клубу, мій рекорд ${JSON.stringify(S1.me)}`);
 // record block: Vorskla best 58 -> 70
 await pg.evaluate(()=>{window.__dbg.renderOcRes({oc:window.__dbg.ocAfter('vorskla-poltava',70)});document.getElementById('ocRes').scrollIntoView();});
 const V=await pg.textContent('#ocRes');
 T.check(/Кращий сезон в історії клубу!/.test(V)&&/70 очок — більше, ніж клуб набирав будь-коли в УПЛ \(58, 1996\/97\)/.test(V)&&/Залишився найгірший сезон: менше 23 оч\./.test(V),'блок рекорду: '+V);
 await pg.locator('#ocRes').screenshot({path:path.join(OUT,'oc72_result.png')});
 await pg.evaluate(()=>window.__dbg.renderOcRes({oc:window.__dbg.ocAfter('vorskla-poltava',10)}));
 T.check(/Гірший сезон в історії клубу!/.test(await pg.textContent('#ocRes'))&&/Клуб пройдено/.test(await pg.textContent('#ocRes')),'найгірший сезон і «Клуб пройдено»');
 // sync merge: best of both devices
 const M=await pg.evaluate(()=>window.__dbg.acctMerge({upl30_clubrec:{'dynamo-kyiv':{b:70,w:40,n:5}}},{upl30_clubrec:{'dynamo-kyiv':{b:80,w:45,n:2},'zorya-luhansk':{b:50,w:50,n:1}}}).upl30_clubrec);
 T.check(M['dynamo-kyiv'].b===80&&M['dynamo-kyiv'].w===40&&M['dynamo-kyiv'].n===5&&M['zorya-luhansk'],'синхронізація: краще з двох пристроїв');
 // light theme list
 await pg.evaluate(()=>{document.documentElement.setAttribute('data-theme','light');window.__dbg.openOc();});await pg.waitForTimeout(200);
 await pg.screenshot({path:path.join(OUT,'oc72_list_light.png')});
 await pg.setViewportSize({width:1024,height:900});await pg.waitForTimeout(200);
 await pg.screenshot({path:path.join(OUT,'oc72_list_ipad.png')});
 const ow=await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);T.check(ow,'немає горизонтальної прокрутки');
 T.check(!errs.length,'помилок на сторінці немає '+errs.join(' | '));
 await b.close();process.exit(T.done());})();
