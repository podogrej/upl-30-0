// Online trophies: retroactive awards from the device's past seasons (seasons log) stay local, season trophy claims are not written
// (since 0.90.1 the server writes season trophies after verification); two new seasons on the server wheel →
// season counter, "new trophies" block and a line in the share text; trophy cabinet with "X% of players have it" (rpc trophy_stats).
// Individual trophy logic is covered by scenarios.js. Run from repo root: node tools/tests/tro.js [screenshot dir]
const path=require('path'),fs=require('fs');const {ROOT,makeDB,callApi,openSite,draftSeason,checker}=require('./_site.js');
const seedH=require(path.join(ROOT,'api','seed.js')),verH=require(path.join(ROOT,'api','verify.js')),saveH=require(path.join(ROOT,'api','save.js'));   // results are written only by the server
const crypto=require('crypto'),E=require(path.join(ROOT,'lib','engine.js'));const SEASON=new Set(E.TROPHIES.filter(t=>t.t).map(t=>t.id));
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const DEV='aaaaaaaa-0000-4000-a000-000000000001';
(async()=>{const T=checker('трофеї');
 const db=makeDB({seasons:{auto:'id',onInsert:r=>{r.player_id='p-1';}},season_seeds:{onInsert:r=>{r.id=crypto.randomUUID();}},trophies:{pk:['device_id','trophy']}},{trophy_stats:()=>({players:40,t:{champ:12,top3:25,perfect:0}}),device_ok:()=>'p-1'});
 global.fetch=db.fetch;const api={'/api/seed':async req=>callApi(seedH,req.body),'/api/verify':async req=>callApi(verH,req.body),'/api/save':async req=>callApi(saveH,req.body)};
 // past season on this device: unbeaten champion
 db.DB.seasons.push({id:1,device_id:DEV,mode:'normal',format:'classic',w:24,d:6,l:0,pts:78,place:1,gf:70,ga:12,xp:66,golden:false,practice:false,day:null,created_at:'2026-09-28T10:00:00Z',
   xi:[{n:'Сергій Ребров',id:'x1',slot:'ST',r:95,c:'Динамо (Київ)',y:1997,f:2,g:26,a:5,rt:7.9},{n:'Андрій Шевченко',id:'x2',slot:'ST',r:96,c:'Динамо (Київ)',y:1997,f:1,g:20,a:6,rt:7.7}]});
 const {b,pg,errs}=await openSite({db,api,init:`if(!localStorage.getItem('upl30_device'))localStorage.setItem('upl30_device','"${DEV}"');`,viewport:{width:430,height:900},wait:1500});
 const got=()=>db.DB.trophies.map(x=>x.trophy);
 const loc=await pg.evaluate(()=>Object.keys(window.__dbg.trStore().t));
 T.check(['champ','unbeaten','ms1'].every(t=>loc.includes(t))&&!loc.includes('top3'),'заднім числом видано на пристрої: '+loc.join(', '));
 T.check(!got().length,'заднім числом: сезонні трофеї й ms1 без перевірених сезонів у trophies не записано ('+(got().join(', ')||'порожньо')+')');
 const st0=await pg.evaluate(()=>({s:window.__dbg.trStore().seasons,retro:localStorage.getItem('upl30_tr_retro'),cnt:document.getElementById('trCount').textContent}));
 T.check(st0.s===1&&st0.retro==='1'&&/^Зібрано \d+$/.test(st0.cnt),`після видачі: сезонів ${st0.s}, кнопка «Трофеї${st0.cnt}»`);
 for(let k=0;k<2;k++){
  await pg.evaluate(()=>{document.getElementById('homeBtn').click();document.getElementById('freeOpen').click();});await pg.evaluate(()=>window.__dbg.setFmt('classic'));await pg.click('#startBtn');
  const n0=db.DB.trophies.length;await draftSeason(pg);await pg.waitForTimeout(700);
  const r=await pg.evaluate(()=>{const R=window.__dbg.S.result;return {got:R.tro.got,fresh:R.tro.fresh,seasons:window.__dbg.trStore().seasons,box:document.getElementById('newTro').hidden?'':document.getElementById('newTro').textContent,share:document.getElementById('shareText').value};});
  T.check(r.seasons===2+k,`сезон ${k+1}: лічильник сезонів ${r.seasons}`);
  T.check(r.got.length?!!r.box:!r.box,`сезон ${k+1}: блок трофеїв ${r.box?'показано ('+r.got.join(', ')+')':'схований — трофеїв немає'}`);
  T.check(!/🏆 Нов/.test(r.share),`сезон ${k+1}: у тексті шерингу трофеїв немає`);
  const sn=db.DB.seasons[db.DB.seasons.length-1]||{},mine=db.DB.trophies.filter(x=>x.device_id===DEV);
  T.check(sn.verified===true&&r.got.filter(t=>SEASON.has(t)).every(t=>mine.some(x=>x.trophy===t&&x.src==='srv'))&&mine.filter(x=>SEASON.has(x.trophy)).every(x=>x.src==='srv')&&new Set(mine.map(x=>x.trophy)).size===mine.length,
   `сезон ${k+1}: сезон перевірено, сезонні трофеї записав сервер, з браузера — лише несезонні (${mine.map(x=>x.trophy+(x.src?':'+x.src:'')).join(', ')})`);
  if(k===0)await pg.screenshot({path:path.join(OUT,'tro_result.png')});
 }
 // home trophies button opens the cabinet on the own page; the legacy dialog remains for the offline file; check both
 await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.click('#trBtn');await pg.waitForTimeout(900);
 const ppc=(await pg.textContent('#ppCab')).replace(/\s+/g,' ');
 T.check(/Трофеї\s*Відкрито \d+ з \d+/.test(ppc)&&await pg.evaluate(()=>!document.getElementById('s6').hidden),'«Трофеї» → шафа своєї сторінки: '+ppc.slice(0,50));
 await pg.evaluate(()=>{document.getElementById('homeBtn').click();window.__dbg.openTrophies();});await pg.waitForTimeout(600);
 const cab=(await pg.textContent('#viewBody')).replace(/\s+/g,' ');
 T.check(/Відкрито \d+ з \d+ · зіграно сезонів: 3/.test(cab),'шафа: '+cab.slice(0,60));
 T.check(/Чемпіони.*30% гравців/.test(cab),'шафа: «Чемпіони — є в 30% гравців» з trophy_stats');
 await pg.screenshot({path:path.join(OUT,'tro_cabinet.png')});
 T.check(!errs.length,'помилок на сторінці немає '+errs.join(' | '));
 await b.close();process.exit(T.done());})();
