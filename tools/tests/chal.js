// Виклик другові: A грає класику й створює виклик, B відкриває ?c=…, бачить картку, грає те саме колесо (ті самі клуби й сезони),
// бачить порівняння, результат B пишеться в challenge_results і з'являється в картці. База — у пам'яті.
// Запуск з кореня: node tools/tests/chal.js
const path=require('path');const {ROOT,launch,makeDB,callApi,openSite,draftSeason,checker}=require('./_site.js');
process.env.SUPABASE_SERVICE_KEY='svc';const saveH=require(path.join(ROOT,'api','save.js'));   // 0.53: виклик і результат пише сервер (/api/save)
(async()=>{const T=checker('chal');const b=await launch();
 const db=makeDB({challenges:{pk:['id']},challenge_results:{auto:'id',uq:[['challenge_id','device_id']]},seasons:{auto:'id'}},{device_ok:a=>'p-'+String(a.p_device).slice(0,8)});const DB=db.DB;global.fetch=db.fetch;
 const api={'/api/save':async req=>callApi(saveH,req.body)};
 const spins=pg=>{const seen=[];return [seen,async()=>seen.push(await pg.evaluate(()=>{const w=window.__dbg.S.wheel;return w.n+' '+w.y;}))];};
 // A: вільна класика, схема 3
 const A=await openSite({b,db,api});await A.pg.evaluate(()=>localStorage.setItem('upl30_nick','"Андрій"'));
 await A.pg.click('#freeOpen');await A.pg.click('#formats .opt:nth-child(1)');await A.pg.click('#formations .opt:nth-child(3)');await A.pg.click('#startBtn');
 const [seenA,onA]=spins(A.pg);await draftSeason(A.pg,onA);
 T.check(await A.pg.$eval('#chalBox',e=>!e.hidden),'A: після класики є блок «Виклик другові»');
 await A.pg.fill('#chalName','Андрій');await A.pg.click('#chalCopyBtn');await A.pg.waitForTimeout(500);
 const msgA=await A.pg.textContent('#chalMsg');const row=DB.challenges[0];
 T.check(row&&/\?c=/.test(msgA)&&msgA.includes(row.id),'A: виклик створено, посилання показано ('+msgA.slice(0,70)+')');
 const rA=await A.pg.evaluate(()=>{const S=window.__dbg.S;return {pts:S.result.pts,formation:S.formation,mode:S.mode,year:S.result.year};});
 T.check(A.log.includes('POST /api/save')&&!A.log.some(x=>/rest\/v1\/challenges$/.test(x)&&x.startsWith('POST')),'A: виклик записав сервер, не браузер');
 T.check(row&&row.name==='Андрій'&&row.pts===rA.pts&&row.formation===rA.formation&&row.mode===rA.mode&&row.year===rA.year&&row.seed>0,'A: рядок challenges збігається з сезоном');
 // B відкриває посилання
 const B=await openSite({b,db,api,query:'?c='+row.id,wait:1500});await B.pg.evaluate(()=>localStorage.setItem('upl30_nick','"Сергій"'));
 const card=await B.pg.$eval('#chalCard',e=>e.hidden?'':e.textContent.replace(/\s+/g,' ').trim());
 T.check(card.includes('Андрій')&&card.includes(String(row.pts))&&card.includes(row.formation),'B: картка виклику ('+card.slice(0,80)+')');
 await B.pg.click('#chalGo');const label=await B.pg.textContent('#modeLabel');
 T.check(label.startsWith('Виклик')&&label.includes(row.formation),'B: підпис драфту «'+label+'»');
 const [seenB,onB]=spins(B.pg);await draftSeason(B.pg,onB);
 T.check(seenA.length===11&&JSON.stringify(seenA)===JSON.stringify(seenB),'те саме колесо: '+seenA.slice(0,3).join(', ')+' …');
 T.check(await B.pg.evaluate(()=>window.__dbg.S.result.year)===row.year,'B: ті самі суперники (сезон '+row.year+')');
 const line=await B.pg.$eval('#chalLine',e=>e.hidden?'':e.textContent);T.check(/Ти \d+ : \d+ Андрій/.test(line),'B: рядок порівняння «'+line+'»');
 T.check(await B.pg.$eval('#chalBox',e=>!e.hidden),'B: може кинути свій виклик далі');
 await B.pg.waitForTimeout(600);const res=DB.challenge_results;
 T.check(res.length===1&&res[0].challenge_id===row.id&&res[0].name==='Сергій','B: результат записано в challenge_results');
 await B.pg.click('#againBtn');await B.pg.waitForTimeout(600);
 const after=await B.pg.$eval('#chalCard',e=>e.hidden?'':e.textContent.replace(/\s+/g,' '));T.check(after.includes('Сергій'),'B: картка після гри показує результат Сергія');
 T.check(!A.errs.length&&!B.errs.length,'помилок на сторінках немає '+[...A.errs,...B.errs].join(' | '));
 await b.close();process.exit(T.done());})();
