// Трофеї онлайн: видача заднім числом за старими сезонами пристрою (журнал seasons) і запис у trophies; два нові сезони —
// лічильник сезонів, блок «Нові трофеї» і рядок у тексті; шафа трофеїв з «є в X% гравців» (rpc trophy_stats).
// Логіку окремих трофеїв перевіряє scenarios.js. Запуск з кореня: node tools/tests/tro.js [папка для знімків]
const path=require('path'),fs=require('fs');const {ROOT,makeDB,openSite,draftSeason,checker}=require('./_site.js');
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const DEV='aaaaaaaa-0000-4000-a000-000000000001';
(async()=>{const T=checker('трофеї');
 const db=makeDB({seasons:{auto:'id'},trophies:{pk:['device_id','trophy']}},{trophy_stats:()=>({players:40,t:{champ:12,top3:25,perfect:0}})});
 // старий сезон цього пристрою: чемпіон без поразок
 db.DB.seasons.push({id:1,device_id:DEV,mode:'normal',format:'classic',w:24,d:6,l:0,pts:78,place:1,gf:70,ga:12,xp:66,golden:false,practice:false,day:null,created_at:'2026-09-28T10:00:00Z',
   xi:[{n:'Сергій Ребров',id:'x1',slot:'ST',r:95,c:'Динамо (Київ)',y:1997,f:2,g:26,a:5,rt:7.9},{n:'Андрій Шевченко',id:'x2',slot:'ST',r:96,c:'Динамо (Київ)',y:1997,f:1,g:20,a:6,rt:7.7}]});
 const {b,pg,errs}=await openSite({db,init:`if(!localStorage.getItem('upl30_device'))localStorage.setItem('upl30_device','"${DEV}"');`,viewport:{width:430,height:900},wait:1500});
 const got=()=>db.DB.trophies.map(x=>x.trophy);
 T.check(['champ','unbeaten','ms1'].every(t=>got().includes(t))&&!got().includes('top3')&&db.DB.trophies.every(x=>x.device_id===DEV),'заднім числом видано й записано: '+got().join(', '));
 const st0=await pg.evaluate(()=>({s:window.__dbg.trStore().seasons,retro:localStorage.getItem('upl30_tr_retro'),cnt:document.getElementById('trCount').textContent}));
 T.check(st0.s===1&&st0.retro==='1'&&/· \d+/.test(st0.cnt),`після видачі: сезонів ${st0.s}, кнопка «Трофеї${st0.cnt}»`);
 for(let k=0;k<2;k++){
  await pg.evaluate(()=>{document.getElementById('homeBtn').click();document.getElementById('freeOpen').click();});await pg.click('#formats .opt[data-fmt="classic"]');await pg.click('#startBtn');
  const n0=db.DB.trophies.length;await draftSeason(pg);await pg.waitForTimeout(700);
  const r=await pg.evaluate(()=>{const R=window.__dbg.S.result;return {got:R.tro.got,fresh:R.tro.fresh,seasons:window.__dbg.trStore().seasons,box:document.getElementById('newTro').hidden?'':document.getElementById('newTro').textContent,share:document.getElementById('shareText').value};});
  T.check(r.seasons===2+k,`сезон ${k+1}: лічильник сезонів ${r.seasons}`);
  T.check(r.got.length?!!r.box:!r.box,`сезон ${k+1}: блок трофеїв ${r.box?'показано ('+r.got.join(', ')+')':'схований — трофеїв немає'}`);
  T.check(r.fresh.length?/🏆 Нов/.test(r.share):!/🏆 Нов/.test(r.share),`сезон ${k+1}: нові трофеї в тексті ${r.fresh.length?'є':'не згадано'}`);
  T.check(db.DB.trophies.length===n0+r.fresh.length,`сезон ${k+1}: у trophies записано лише нові (${r.fresh.length})`);
  if(k===0)await pg.screenshot({path:path.join(OUT,'tro_result.png')});
 }
 // 0.60: «Трофеї» на головній відкриває шафу своєї сторінки; старе вікно лишилось для файлу без сайту — перевіряємо обидва
 await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.click('#trBtn');await pg.waitForTimeout(900);
 const ppc=(await pg.textContent('#ppCab')).replace(/\s+/g,' ');
 T.check(/Трофеї\s*Відкрито \d+ з \d+/.test(ppc)&&await pg.evaluate(()=>!document.getElementById('s6').hidden),'«Трофеї» → шафа своєї сторінки: '+ppc.slice(0,50));
 await pg.evaluate(()=>{document.getElementById('homeBtn').click();window.__dbg.openTrophies();});await pg.waitForTimeout(600);
 const cab=(await pg.textContent('#viewBody')).replace(/\s+/g,' ');
 T.check(/Відкрито \d+ з \d+ · зіграно сезонів: 3/.test(cab),'шафа: '+cab.slice(0,60));
 T.check(/Чемпіони.*є в 30% гравців/.test(cab),'шафа: «Чемпіони — є в 30% гравців» з trophy_stats');
 await pg.screenshot({path:path.join(OUT,'tro_cabinet.png')});
 T.check(!errs.length,'помилок на сторінці немає '+errs.join(' | '));
 await b.close();process.exit(T.done());})();
