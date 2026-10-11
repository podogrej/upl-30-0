// One club (0.89): only the club's own records give trophies there ("best/worst season in the history of <club>", ids ob_/ow_ + code);
// every other trophy and the two-colour trophy are not awarded in one club; club trophies are hidden in the cabinet until earned.
// Run from repo root: node tools/tests/trophies089.js
const {makeDB,openSite,checker}=require('./_site.js');
(async()=>{const T=checker('trophies089');
 const {b,pg,errs}=await openSite({db:makeDB({}),api:{},viewport:{width:390,height:900}});
 const r=await pg.evaluate(()=>{const {TROPHIES,CLUB_REC,trEval}=window.__dbg;
   const code='dynamo-kyiv',rec=CLUB_REC[code],id=code.replace(/-/g,'_');
   const log=Array.from({length:30},(_,k)=>({rd:k+1,home:k%2===0,ug:3,og:0,res:'W'}));
   const pl=['GK','CB','CB','LB','RB','CM','CM','CAM','LW','RW','ST'].map((slot,k)=>({id:'x'+k,slot,g:k===10?35:6,a:6,rt:7,form:0}));
   const xi=pl.map((p,k)=>({id:p.id,name:'Гравець '+k,slot:p.slot,nat:0,by:1970,cc:code,y:2000,r0:90}));
   const ctx=(format,club,pts,place)=>({r:{W:30,D:0,L:0,pts,place,gf:90,ga:0,xp:80,log,table:[],snaps:[]},xi,pl,mode:'normal',format,club,reveal:true});
   const ids=TROPHIES.map(t=>t.id);
   return {rec,id,name:(TROPHIES.find(t=>t.id==='ob_'+id)||{}).n,wname:(TROPHIES.find(t=>t.id==='ow_'+id)||{}).n,
     nOc:TROPHIES.filter(t=>t.oc).length,nRec:Object.keys(CLUB_REC).length,long:ids.filter(i=>!/^[A-Za-z0-9_]{1,24}$/.test(i)),dup:ids.length-new Set(ids).size,
     best:trEval(ctx('oneclub',code,rec[0]+1,1)),eq:trEval(ctx('oneclub',code,rec[0],1)),worst:trEval(ctx('oneclub',code,rec[3]-1,16)),
     other:trEval(ctx('oneclub','shakhtar-donetsk',rec[0]+1,1)),classic:trEval(ctx('classic',null,90,1)),
     twoColors:(TROPHIES.find(t=>t.id==='oneclubchamp')||{}).gone};});
 T.check(r.name==='Динамо — найкращий сезон в історії'&&r.wname==='Динамо — найгірший сезон в історії','назви: «'+r.name+'», «'+r.wname+'»');
 T.check(r.nOc===2*r.nRec&&r.nOc>40,`по два трофеї на кожен клуб з історією: ${r.nOc} на ${r.nRec} клубів`);
 T.check(!r.long.length&&!r.dup,'id проходять перевірку сервера й не повторюються '+r.long.join(','));
 T.check(JSON.stringify(r.best)===JSON.stringify(['ob_'+r.id]),'«Один клуб», рекорд побито: лише клубний трофей, нічого іншого — '+r.best.join(','));
 T.check(!r.eq.length,'рівно рекорд — ні');
 T.check(JSON.stringify(r.worst)===JSON.stringify(['ow_'+r.id]),'найгірший сезон: лише клубний трофей — '+r.worst.join(','));
 T.check(!r.other.some(i=>i.endsWith('_dynamo_kyiv')),'інший клуб не дає трофеїв Динамо');
 T.check(!r.classic.some(i=>/^o[bw]_/.test(i))&&r.classic.length>3,'класика: звичайні трофеї є, клубних немає ('+r.classic.length+')');
 T.check(r.twoColors===1,'«Два кольори» більше не видається новим (gone), отримані лишаються');
 // cabinet: club trophies hidden until earned
 const cab=await pg.evaluate(()=>{const s={seasons:3,dailies:0,t:{ob_dynamo_kyiv:{n:1,at:'2026-10-11'}}};localStorage.setItem('upl30_tr',JSON.stringify(s));return true;});
 await pg.evaluate(()=>window.__dbg.openTrophies());await pg.waitForTimeout(500);
 const txt=await pg.textContent('#viewBody');
 T.check(/Динамо — найкращий сезон в історії/.test(txt)&&!/Динамо — найгірший/.test(txt)&&!/Шахтар — /.test(txt),'шафа: отриманий клубний трофей видно, неотримані клубні сховані');
 T.check(!errs.length,'без помилок у консолі '+errs.join(' | '));
 await b.close();process.exit(T.done());})();
