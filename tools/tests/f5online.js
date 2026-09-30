// 5×5 онлайн: господар створює кімнату, гість заходить за ?r=…, драфт по черзі з двох браузерів через базу (у пам'яті),
// обидва бачать однакові склади й однаковий рахунок матчу. Запуск з кореня: node tools/tests/f5online.js [папка для знімків]
const path=require('path'),fs=require('fs');const {ROOT,launch,makeDB,openSite,checker}=require('./_site.js');
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
(async()=>{const T=checker('f5 онлайн');const b=await launch();
 const db=makeDB({f5_rooms:{pk:['id'],def:{status:'lobby',players_n:null}},f5_players:{pk:['room_id','seat'],uq:[['room_id','device_id']]},f5_picks:{pk:['room_id','seat','k'],uq:[['room_id','n']]}});const DB=db.DB;
 const H=await openSite({b,db,viewport:{width:430,height:900}});
 await H.pg.evaluate(()=>document.getElementById('f5Open').click());   /* 0.60: кнопку сховано на головній, режим лишився */await H.pg.fill('[data-nm="0"]','Андрій');await H.pg.click('#f5Go');await H.pg.waitForTimeout(800);
 const room=DB.f5_rooms[0];T.check(room&&DB.f5_players.length===1&&DB.f5_players[0].seat===0,'господар створив кімнату '+(room&&room.id));
 T.check(/\?r=/.test(H.pg.url()),'у адресі господаря посилання на кімнату');
 const G=await openSite({b,db,query:'?r='+room.id,viewport:{width:430,height:900},wait:1500});
 T.check(await G.pg.$eval('#s5',e=>!e.hidden)&&!!(await G.pg.$('#f5Join')),'гість за посиланням бачить «Приєднатися»');
 await G.pg.fill('[data-nm="0"]','Сергій');await G.pg.fill('[data-tm="0"]','Динамо Двір');await G.pg.click('#f5Join');await G.pg.waitForTimeout(1500);
 T.check(DB.f5_players.map(p=>p.seat+':'+p.name).join(',')==='0:Андрій,1:Сергій','у кімнаті двоє: '+DB.f5_players.map(p=>p.seat+':'+p.name).join(', '));
 await H.pg.waitForSelector('#f5StartR:not([disabled])',{timeout:6000});await H.pg.screenshot({path:path.join(OUT,'f5on_lobby.png'),fullPage:true});
 await H.pg.click('#f5StartR');await H.pg.waitForTimeout(500);
 // хто ходить — той клікає
 for(let step=0;step<60&&DB.f5_picks.length<10;step++){
   for(const P of [H.pg,G.pg]){const btn=await P.$('#f5Sq .pl:not([disabled])');if(btn){await btn.click().catch(()=>{});await P.waitForTimeout(300);}}
   await H.pg.waitForTimeout(700);}
 const order=[...DB.f5_picks].sort((a,b)=>a.n-b.n).map(p=>p.seat).join('');
 T.check(DB.f5_picks.length===10&&order==='0101010101','10 ходів по черзі: '+order);
 T.check(new Set(DB.f5_picks.map(p=>p.person_id)).size===10,'жодного гравця двічі');
 for(const P of [H.pg,G.pg])await P.waitForSelector('#f5Play',{timeout:8000});
 T.check(DB.f5_rooms[0].status==='done','кімната закрита після драфту (status=done)');
 const sq=P=>P.evaluate(()=>[...document.querySelectorAll('.f5grid > div')].map(d=>d.textContent).join('|'));
 T.check(await sq(H.pg)===await sq(G.pg),'склади однакові в обох');
 const score=[];for(const P of [H.pg,G.pg]){await P.click('#f5Play');await P.waitForSelector('#f5Skip');await P.click('#f5Skip');await P.waitForSelector('#f5Again',{timeout:5000});score.push((await P.textContent('.f5score')).replace(/\s+/g,' '));}
 T.check(score[0]===score[1]&&/\d+:\d+/.test(score[0]),'рахунок однаковий: '+score.join(' / '));
 await G.pg.screenshot({path:path.join(OUT,'f5on_result.png'),fullPage:true});
 T.check(!H.errs.length&&!G.errs.length,'помилок на сторінках немає '+[...H.errs,...G.errs].join(' | '));
 await b.close();process.exit(T.done());})();
