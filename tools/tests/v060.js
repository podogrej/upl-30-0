// 0.60 «Один гравець»: «Вибір сезону» (колесо дає клуб → три сезони, без перекручувань, у базу — mode 'pick'), 5×5 сховано, FAQ,
// блок «Поділитися» (варіант A), позначка «рейтинги відкриті» (show_r), рідкісний трофей з ефектом, кращий результат дня на гравця.
// Запуск з кореня: node tools/tests/v060.js [папка для знімків]. Код виходу 0 — усе гаразд.
const path=require('path'),fs=require('fs');const {ROOT}=require('./_page.js');const {openSite,makeDB}=require('./_site.js');
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const fail=[];let n=0;const check=(ok,msg)=>{n++;console.log((ok?'✓ ':'✗ ')+msg);if(!ok)fail.push(msg);};
(async()=>{
 // сайт «як онлайн» (https://upl.test/, _site.js): свіжий Chromium (GitHub Actions) блокує запити до /api/* зі сторінки, відкритої з файлу
 const saves=[];const db=makeDB({seasons:{auto:'id'},season_seeds:{auto:'id'},daily_results:{auto:'id'}});
 const {b,pg,errs}=await openSite({db,api:{'/api/save':async req=>{saves.push(req.body||{});return {json:{id:7,verified:true}};},'/api/seed':async()=>({json:{seed:12345,seed_id:'s1'}})}});
 // ---- головна: «Новий режим», 5×5 сховано, FAQ актуальний
 const home=await pg.evaluate(()=>({pick:!document.getElementById('pickOpen').hidden,f5:document.getElementById('f5Open').hidden,
   faq:document.querySelector('.faq0').textContent.replace(/\s+/g,' '),daily:document.getElementById('dKicker').textContent+' / '+document.getElementById('dailyBtn').textContent}));   // 0.62: «Драфт дня» — у заголовку картки, кнопка — «Грати»
 check(home.pick&&home.f5,'головна: «Вибір сезону» є, 5×5 на одному телефоні сховано');
 check(/Що таке «Драфт дня»/.test(home.faq)&&/Що таке «Вибір сезону»/.test(home.faq)&&!/5×5 на одному пристрої/.test(home.faq)&&/Це ти\?/.test(home.faq),'FAQ: драфт дня, вибір сезону, «Це ти?», без 5×5 на одному пристрої');
 check(/^драфт дня/i.test(home.daily)&&/ \/ Грати$/.test(home.daily.trim())&&!/виклик дня/i.test(home.daily),'картка дня: «'+home.daily.trim()+'»');
 // ---- «Вибір сезону»: плитка формату, режимів немає
 // 0.65: «Вибір сезону» з головної — одразу в драфт; налаштування — через «Грати» → плитка «Вибір сезону»
 await pg.click('#pickOpen');await pg.waitForTimeout(300);
 check(await pg.evaluate(()=>!document.getElementById('s2').hidden&&window.__dbg.S.pickMode&&window.__dbg.S.format==='classic'),'«Вибір сезону» з головної — одразу драфт');
 await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.click('#freeOpen');await pg.click('#formats .opt[data-fmt="pick"]');await pg.waitForTimeout(200);
 const setup=await pg.evaluate(()=>({on:(document.querySelector('#formats .opt.on')||{}).dataset.fmt,modes:document.getElementById('modesBox').hidden,S:{f:window.__dbg.S.format,p:window.__dbg.S.pickMode}}));
 check(setup.on==='pick'&&setup.modes&&setup.S.f==='classic'&&setup.S.p,'налаштування: плитка «Вибір сезону», вибору складності немає, у базі — класика');
 await pg.screenshot({path:path.join(OUT,'v060_setup.png'),fullPage:true});
 await pg.click('#formations .opt:nth-child(1)');await pg.click('#startBtn');
 check(/Вибір сезону/.test(await pg.textContent('#modeLabel')),'підпис драфту: «'+(await pg.textContent('#modeLabel')).trim()+'»');
 let shot=false,one=0;
 for(let i=0;i<11;i++){await pg.click('#spinBtn');await pg.waitForSelector('#seaPick:not([hidden]) button',{timeout:8000});
   const st=await pg.evaluate(()=>{const S=window.__dbg.S,o=S.pickOpts||[];return {n:o.length,club:new Set(o.map(c=>c.c)).size,yrs:o.map(c=>c.y),rr:document.getElementById('rerollRow').offsetParent===null?'hidden':'shown',sq:document.querySelectorAll('#squad .pl').length};});
   if(st.n<3)one++;
   if(i===0){check(st.n>=1&&st.n<=3&&st.club===1&&new Set(st.yrs).size===st.n,`колесо: ${st.n} сезони одного клубу (${st.yrs.join(', ')})`);check(st.rr==='hidden'&&st.sq===0,'до вибору сезону — гравців немає, перекручувань немає');}
   if(!shot&&st.n===3){await pg.locator('#wheel').screenshot({path:path.join(OUT,'v060_pick_wheel.png')});shot=true;}
   const bs=await pg.$$('#seaPick button');const yr=st.yrs[st.yrs.length-1];await bs[bs.length-1].click();
   await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});
   if(i===0){const w=await pg.evaluate(()=>({y:window.__dbg.S.wheel.y,rr:document.getElementById('rerollRow').hidden,sp:document.getElementById('seaPick').hidden,show:!document.getElementById('showRRow').hidden}));
     check(w.y===yr&&w.rr&&w.sp,'обраний сезон — у колесі; кнопок перекручування немає');
     if(w.show){await pg.check('#showR');}check(w.show,'галочка «Показати рейтинги» є');}
   const btn=await pg.$('.pl:not([disabled])');await btn.click();await pg.waitForTimeout(60);const t=await pg.$('#pitch .slot.target');if(t){await t.click();await pg.waitForTimeout(60);}}
 await pg.waitForSelector('#simBtn:not([hidden])');await pg.click('#simBtn');await pg.click('#skipBtn');await pg.waitForTimeout(1200);
 const res=await pg.evaluate(()=>({mode:window.__dbg.S.mode,share:document.getElementById('shareText').value,
   tiles:[...document.querySelectorAll('#shareBox > button')].map(b=>b.id+(b.hidden?':h':'')).join(','),big:!document.getElementById('tgShareBtn').hidden,chal:document.getElementById('chalBox').hidden}));
 check(res.mode==='pick'&&/Вибір сезону/.test(res.share),'сезон: режим pick, у тексті «Вибір сезону»');
 for(let k=0;k<40&&!saves.find(x=>x.kind==='season');k++)await pg.waitForTimeout(200);   // запис іде після анімацій підсумку; на повільній машині (GitHub Actions) — довше 1,2 с
 const sv=saves.find(x=>x.kind==='season');
 check(sv&&sv.row.mode==='pick'&&sv.row.format==='classic'&&sv.row.show_r===true,'запис сезону: mode pick, format classic, show_r (рейтинги відкривали) — '+(sv?JSON.stringify({m:sv.row.mode,f:sv.row.format,r:sv.row.show_r}):'немає'));
 check(res.big&&res.tiles==='tgShareBtn,chalOpen:h,againBtn'&&res.chal,'«Поділитися» (0.63 — одна кнопка; виклику у «Виборі сезону» немає; 0.66 — «Новий драфт» теж під карткою): '+res.tiles);
 await pg.locator('#shareBox').screenshot({path:path.join(OUT,'v060_share.png')});
 // ---- рідкісний новий трофей — з ефектом (секретний)
 const sec=await pg.evaluate(()=>{const t=window.__dbg.TROPHIES.find(x=>x.sec&&!x.gone);window.__dbg.renderNewTro({tro:{got:[t.id,'champ'],fresh:[t.id,'champ']}});
   const el=document.querySelector('#newTro .tro.rarein');return {id:t.id,rare:!!el,cnt:document.querySelectorAll('#newTro .tro.rarein').length};});
 check(sec.rare&&sec.cnt===1,'новий секретний трофей «'+sec.id+'» — з ефектом, звичайний «champ» — без');
 await pg.evaluate(()=>document.getElementById('newTro').scrollIntoView({block:'center'}));await pg.waitForTimeout(1600);
 await pg.locator('#newTro').screenshot({path:path.join(OUT,'v060_rare_trophy.png')});
 // ---- таблиця дня: у гравця кілька результатів — лише кращий (рядки вже відсортовано)
 const bp=await pg.evaluate(()=>window.__dbg.bestPerPlayer([{player_id:'a',pts:80},{player_id:'b',pts:70},{player_id:'a',pts:60},{player_id:null,pts:50},{player_id:null,pts:40}]).map(r=>(r.player_id||'-')+r.pts).join(','));
 check(bp==='a80,b70,-50,-40','таблиця дня: кращий результат гравця ('+bp+')');
 check(!errs.length,'помилок на сторінці немає '+errs.join(' | '));
 await b.close();console.log(fail.length?`v060: ПРОБЛЕМИ ${fail.length}/${n}`:`v060: УСЕ ГАРАЗД (${n} перевірок)`);process.exit(fail.length?1:0);})();
