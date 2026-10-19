// Friend challenge (links already sent keep working): A plays classic on a server wheel (real /api/seed draft start/lock, /api/save -> verify), a challenge is created server-side;
// B opens ?c=…, sees the card, plays the same wheel (draft start with chal_id), sees the comparison; B's result is written
// to challenge_results by the server on lock (not by the browser) and shows up on the card.
// E plays an era on a server wheel: verified.
// C plays without a server wheel (/api/seed down): a note under the result. In-memory DB.
// Run from repo root: node tools/tests/chal.js
const path=require('path'),crypto=require('crypto');const {ROOT,launch,makeDB,callApi,openSite,draftSeason,checker}=require('./_site.js');
process.env.SUPABASE_SERVICE_KEY='svc';
const saveH=require(path.join(ROOT,'api','save.js')),seedH=require(path.join(ROOT,'api','seed.js'));
(async()=>{const T=checker('chal');const b=await launch();
 const pid=dev=>'p-'+String(dev).slice(0,8);
 const db=makeDB({challenges:{pk:['id']},challenge_results:{auto:'id',uq:[['challenge_id','device_id']]},seasons:{auto:'id',onInsert:r=>{r.player_id=pid(r.device_id);}},
   season_seeds:{onInsert:r=>{r.id=crypto.randomUUID();}},trophies:{pk:['device_id','trophy']},players:{pk:['id']}},
  {device_ok:a=>pid(a.p_device),rate_hit:()=>true,
   player_hello:a=>{const id=pid(a.p_device);let p=db.DB.players.find(x=>x.id===id);if(!p)db.DB.players.push(p={id,name:null,anon_name:'гравець '+id.slice(2,6),public_id:null});return p;},
   set_player_auto_name:a=>{const p=db.DB.players.find(x=>x.id===pid(a.p_device));if(p&&!p.name)p.name=String(a.p_raw).toLowerCase();return p;}});
 const DB=db.DB;global.fetch=db.fetch;
 let seedDown=false;const calls=[];
 const api={'/api/seed':async req=>{calls.push('seed:'+req.body.draft);return seedDown?{status:500,json:{error:'down'}}:callApi(seedH,req.body);},
   '/api/save':async req=>{calls.push('save:'+req.body.kind);return callApi(saveH,req.body);}};
 const spins=pg=>{const seen=[];return [seen,async()=>seen.push(await pg.evaluate(()=>{const w=window.__dbg.S.wheel;return w.n+' '+w.y;}))];};
 // A: free classic, formation 3
 const A=await openSite({b,db,api,init:()=>localStorage.setItem('upl30_nick','"Андрій"')});
 await A.pg.click('#freeOpen');await A.pg.evaluate(()=>window.__dbg.setFmt('classic'));await A.pg.click('#formations .opt:nth-child(3)');await A.pg.click('#startBtn');
 const [seenA,onA]=spins(A.pg);await draftSeason(A.pg,onA);await A.pg.waitForTimeout(400);
 const sA=DB.seasons[0]||{},seedA=DB.season_seeds.find(x=>x.id===sA.seed_id)||{};
 T.check(calls.includes('seed:start')&&calls.includes('seed:lock')&&seedA.kind==='draft'&&!!seedA.locked_at&&sA.verified===true,`A: колесо й сезон від сервера (draft start/lock), сезон перевірено (${sA.verified} ${sA.verify_note||''})`);
 T.check(await A.pg.evaluate(()=>window.__dbg.S.chal.seed)===+seedA.wheel_seed,'A: колесо на сторінці — з сервера (ws = wheel_seed)');
 T.check(!await A.pg.$('#chalOpen')&&!await A.pg.$('#chalBox')&&!await A.pg.$('#chalCopyBtn'),'A: на екрані результату кнопки «Кинути виклик другу» більше немає');
 // a challenge sent earlier (link ?c=): created through the same server path the old button used
 await A.pg.evaluate(()=>fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'challenge',device_id:JSON.parse(localStorage.getItem('upl30_device')),secret:JSON.parse(localStorage.getItem('upl30_dsecret')),season_id:window.__dbg.S.result.rowId,row:{id:'abcdEFGH',name:'Андрій'}})}));await A.pg.waitForTimeout(300);
 const row=DB.challenges[0];
 const rA=await A.pg.evaluate(()=>{const S=window.__dbg.S;return {pts:S.result.pts,formation:S.formation,mode:S.mode,year:S.result.year};});
 T.check(calls.includes('save:challenge')&&!A.log.some(x=>/rest\/v1\/challenges$/.test(x)&&x.startsWith('POST')),'A: виклик записав сервер, не браузер');
 T.check(row&&row.name==='Андрій'&&row.pts===rA.pts&&row.formation===rA.formation&&row.mode===rA.mode&&row.year===rA.year&&row.seed===+seedA.wheel_seed,'A: рядок challenges збігається з сезоном, колесо = wheel_seed');
 // B opens the link
 const B=await openSite({b,db,api,query:'?c='+row.id,wait:1500,init:()=>localStorage.setItem('upl30_nick','"Сергій"')});
 const card=await B.pg.$eval('#chalCard',e=>e.hidden?'':e.textContent.replace(/\s+/g,' ').trim());
 T.check(card.includes('андрій')&&card.includes(String(row.pts))&&card.includes(row.formation),'B: картка виклику ('+card.slice(0,80)+')');
 await B.pg.click('#chalGo');const label=await B.pg.textContent('#modeLabel');
 T.check(label.startsWith('Виклик')&&label.includes(row.formation),'B: підпис драфту «'+label+'»');
 const [seenB,onB]=spins(B.pg);await draftSeason(B.pg,onB);await B.pg.waitForTimeout(400);
 T.check(seenA.length===11&&JSON.stringify(seenA)===JSON.stringify(seenB),'те саме колесо: '+seenA.slice(0,3).join(', ')+' …');
 const seedB=DB.season_seeds.find(x=>x.chal_id===row.id)||{};
 T.check(+seedB.wheel_seed===row.seed&&!!seedB.locked_at,'B: draft start з chal_id — колесо виклику, склад зафіксовано');
 T.check(await B.pg.evaluate(()=>window.__dbg.S.result.year)===row.year,'B: ті самі суперники (сезон '+row.year+')');
 const line=await B.pg.$eval('#chalLine',e=>e.hidden?'':e.textContent);T.check(/Ти \d+ : \d+ андрій/.test(line),'B: рядок порівняння «'+line+'»');
 await B.pg.waitForTimeout(600);const res=DB.challenge_results,ptsB=await B.pg.evaluate(()=>window.__dbg.S.result.pts);
 T.check(res.length===1&&res[0].challenge_id===row.id&&res[0].pts===ptsB&&res[0].player_id===seedB.player_id&&!calls.includes('save:chal_result')&&!B.log.some(x=>/challenge_results$/.test(x)&&x.startsWith('POST')),
  `B: результат (${ptsB} оч.) записав сервер при фіксації складу, не браузер`);
 await B.pg.click('#againBtn');await B.pg.waitForTimeout(1800);
 const after=await B.pg.$eval('#chalCard',e=>e.hidden?'':e.textContent.replace(/\s+/g,' '));T.check(after.includes('сергій')&&after.includes(String(ptsB)),'B: картка після гри показує результат Сергія ('+after.slice(0,120)+')');
 // E: era game on a server wheel: verified
 const Ep=await openSite({b,db,api});
 await Ep.pg.click('#freeOpen');await Ep.pg.evaluate(()=>window.__dbg.setFmt('classic'));await Ep.pg.click('#eras button[data-era="d2000"]');await Ep.pg.click('#startBtn');await draftSeason(Ep.pg);await Ep.pg.waitForTimeout(400);
 const sE=DB.seasons[DB.seasons.length-1]||{};
 T.check(sE.era==='d2000'&&sE.verified===true,`E: епоха «2000-ні» на серверному колесі — сезон перевірено (${sE.verified})`);
 // C: server wheel unavailable -> local wheel, season not verified, no Challenge tile, a note under the result
 seedDown=true;
 const C=await openSite({b,db,api});
 await C.pg.click('#freeOpen');await C.pg.evaluate(()=>window.__dbg.setFmt('classic'));await C.pg.click('#startBtn');await draftSeason(C.pg);await C.pg.waitForTimeout(400);
 const ver=await C.pg.$eval('#verLine',e=>e.hidden?'':e.textContent);
 T.check(/рекорди/.test(ver),'C: під результатом — пояснення «'+ver.trim()+'»');
 const sC=DB.seasons[DB.seasons.length-1]||{};T.check(sC.verified!==true&&!sC.seed_id,`C: сезон не перевірено (${sC.verified}, ${sC.verify_note||''})`);
 T.check(!A.errs.length&&!B.errs.length&&!C.errs.length&&!Ep.errs.length,'помилок на сторінках немає '+[...A.errs,...B.errs,...C.errs,...Ep.errs].join(' | '));
 await b.close();process.exit(T.done());})();
