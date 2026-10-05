// 5x5 leagues: Play with friends -> Create league -> 5x5 format (1h signup) -> own five (wheel, lines, respin) -> Submit squad;
// second member submits -> creator presses Start now -> server plays the tournament (real api/fl5.js play() with src/five_core.js) ->
// tournament finished, champion, matches -> match: score, events, watch live; guest via link sees squads and the sign-in-to-join prompt.
// DB and RPC are in memory (SQL: bash tools/tests/setup.sh). Screenshots: tools/tests/out/fl63_*.png. Run from repo root: node tools/tests/fl63.js
const path=require('path'),fs=require('fs');const {ROOT,launch,makeDB,openSite,checker}=require('./_site.js');
const {play}=require(path.join(ROOT,'api','fl5.js'));
const OUT=path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const T=checker('ліги 5×5');
function mkDB(){
  const players=[{id:'p-me',name:'andre',anon_name:'calm_owl',public_id:'andr2345'},{id:'p-v',name:'vitia',anon_name:'brave_fox',public_id:'vitya234'}];
  const leagues=[],members=[],fives=[],calls=[];
  const js=p=>({id:p.id,name:p.name,anon_name:p.anon_name,public_id:p.public_id,name_next:null,contact_email:null,news_optin:false});
  const get=id=>{const L=leagues.find(x=>x.id===id);if(!L)return null;const pub=pid=>players.find(p=>p.id===pid);
    return {...L,now:new Date().toISOString(),over:!!L.result,owner:'andr2345',tour:[],
      board:members.filter(m=>m.l===id).map(m=>({u:pub(m.p).public_id,name:pub(m.p).name,total:0,wins:0,best:null,played:0})),
      fives:fives.filter(f=>f.l===id).map(f=>({u:pub(f.p).public_id,name:pub(f.p).name,form:f.form,xi:f.xi}))};};
  const rpc={
    player_hello:()=>js(players[0]),link_account:()=>({...js(players[0]),merge_offer:null}),trophy_stats:()=>({players:2,t:{}}),
    player_profile:()=>({public_id:'andr2345',name:'andre',anon:false,since:'2026-09-02T10:00:00Z',seasons:3,champions:1,perfect:0,best_classic:70,win_pct:60,best:{},worst:{},trophies:[],streak_best:0,streak_now:0}),
    fl_mine:()=>leagues.filter(L=>members.some(m=>m.l===L.id&&m.p==='p-me')).map(L=>({id:L.id,name:L.name,fmt:L.fmt,days:1,tries:1,deadline:L.deadline,over:!!L.result,members:members.filter(m=>m.l===L.id).length,fives:fives.filter(f=>f.l===L.id).length,my_five:fives.some(f=>f.l===L.id&&f.p==='p-me'),tries_today:0,place:null})),
    fl_create5:a=>{calls.push(['fl_create5',a]);const id='fiv'+String(leagues.length+2).repeat(3);leagues.push({id,name:a.p_name,fmt:'5',start_day:'2026-10-01',days:1,tries:1,take:'best',scoring:'place',rerolls:a.p_rerolls,ratings:a.p_ratings,era:a.p_era,deadline:new Date(Date.now()+a.p_hours*3600e3).toISOString(),result:null});members.push({l:id,p:'p-me'});return get(id);},
    fl_join:a=>{calls.push(['fl_join',a.p_id]);if(!members.some(m=>m.l===a.p_id&&m.p==='p-me'))members.push({l:a.p_id,p:'p-me'});return get(a.p_id);},
    fl5_submit:a=>{calls.push(['fl5_submit',a]);if(!fives.some(f=>f.l===a.p_id&&f.p==='p-me'))fives.push({l:a.p_id,p:'p-me',form:a.p_form,xi:a.p_xi});return get(a.p_id);},
    fl5_start:a=>{calls.push(['fl5_start',a.p_id]);const L=leagues.find(x=>x.id===a.p_id);L.deadline=new Date(Date.now()-1000).toISOString();return get(a.p_id);},
    fl_get:a=>get(a.p_id)};
  const db=makeDB({seasons:{auto:'id'},season_seeds:{auto:'id'},daily_results:{auto:'id'},player_links:{},user_state:{}},rpc);
  db.DB.players=players;global.fetch=db.fetch;
  return {db,leagues,members,fives,calls,get};}
(async()=>{const b=await launch();const M=mkDB();const {db}=M;let played=0;
 const api={'/api/fl5':async req=>{const L=M.get(req.body.id);if(L&&!L.result&&new Date(L.deadline)<=new Date()){const lg=M.leagues.find(x=>x.id===L.id);lg.result=await play(L);played++;}return {json:M.get(req.body.id)};},
   '/api/seed':async()=>({json:{seed:1,seed_id:'s1'}})};
 const A=await openSite({b,db,api,signed:true,viewport:{width:390,height:844},wait:1500});const pg=A.pg;
 const ipad=async(name,fn)=>{await pg.setViewportSize({width:1000,height:1400});await pg.waitForTimeout(200);const r=fn?await pg.evaluate(fn):null;await pg.screenshot({path:path.join(OUT,name),fullPage:true});await pg.setViewportSize({width:390,height:844});await pg.waitForTimeout(150);return r;};
 await pg.click('#flOpen');await pg.waitForTimeout(400);await pg.click('#flNew');await pg.waitForTimeout(200);
 await pg.click('[data-k="fmt"][data-v="f5"]');
 T.check(/Збір складів/.test(await pg.textContent('#fl'))&&!/Спроби на день/.test(await pg.textContent('#fl')),'створення: формат 5×5 — «Збір складів», без спроб і турів');
 await pg.click('[data-k="hours"][data-v="1"]');await pg.click('[data-k="rerolls"][data-v="3"]');
 await pg.screenshot({path:path.join(OUT,'fl63_create.png'),fullPage:true});
 await pg.click('#flCreate');await pg.waitForTimeout(500);
 const cr=M.calls.find(c=>c[0]==='fl_create5');T.check(cr&&cr[1].p_hours===1&&cr[1].p_rerolls===3,'fl_create5: правила ('+JSON.stringify(cr&&cr[1])+')');
 T.check(/Твоя п'ятірка/.test(await pg.textContent('#fl'))&&!!await pg.$('[data-f5form]'),'одразу — драфт п\'ятірки, вибір схеми');
 // formation picker: 4 tiles per row, pitch at most 420px tall; centered on iPad
 const f5f=await pg.evaluate(()=>{const t=[...document.querySelectorAll('#fl [data-f5form]')].map(e=>e.getBoundingClientRect());const p=document.querySelector('#fl .pitch.p5').getBoundingClientRect();return {n:t.length,row:t.every(r=>Math.abs(r.top-t[0].top)<2),ph:Math.round(p.height),sub:t.every((r,i)=>!!document.querySelectorAll('#fl [data-f5form] small')[i])};});
 T.check(f5f.n===4&&f5f.row&&f5f.sub&&f5f.ph<=420,'схеми: 4 плитки в ряд з назвою, поле '+f5f.ph+'px');
 await pg.screenshot({path:path.join(OUT,'fl63_draft_start.png'),fullPage:true});
 const midD=await ipad('fl63_draft_ipad.png',()=>{const mid=e=>{const r=e.getBoundingClientRect();return (r.left+r.right)/2;};const p=document.querySelector('#fl .pitch.p5').getBoundingClientRect(),w=document.querySelector('#fl .fl5d>.wheel').getBoundingClientRect();return w.left>=p.right&&Math.abs(w.top-p.top)<4?0:99;});
 T.check(midD===0,'iPad: поле зліва, колесо й список справа');
 await pg.click('[data-f5form="2-2"]');
 const before=await pg.evaluate(()=>document.querySelector('#fl .reel .club').textContent);await pg.click('#fl5Rr');
 T.check(/залишилось <b>2|залишилось 2/.test(await pg.innerHTML('#fl .rr'))||/залишилось 2/.test(await pg.textContent('#fl')),'перекрут: залишилось 2 (було «'+before+'»)');
 for(let i=0;i<5;i++){await pg.waitForSelector('[data-p5]');await pg.click('[data-p5]');await pg.waitForTimeout(80);}
 T.check(!!await pg.$('#fl5Send')&&(await pg.$$('#fl .pitch.p5 .slot.filled')).length===5,'5 з 5: поле заповнене, «Відправити склад»');
 await pg.screenshot({path:path.join(OUT,'fl63_draft.png'),fullPage:true});
 await pg.click('#fl5Send');await pg.waitForTimeout(400);
 const sub=M.calls.find(c=>c[0]==='fl5_submit');const xi=sub&&sub[1].p_xi;
 T.check(sub&&sub[1].p_form==='2-2'&&xi.length===5&&xi.every(x=>x.id&&x.c&&x.y&&x.slot),'fl5_submit: схема 2-2, 5 гравців з клубом і сезоном');
 T.check(/Твій склад відправлено/.test(await pg.textContent('#fl')),'лобі: «Твій склад відправлено»');
 T.check(await pg.$eval('#fl5Start',e=>e.disabled)&&/запрацює, коли складів буде хоча б 2/.test(await pg.textContent('#fl')),'0.69: один склад — «Почати зараз» видно, але неактивна, з поясненням');
 // second member submits a squad with the same players (each has their own wheel)
 const L=M.leagues[0];M.members.push({l:L.id,p:'p-v'});M.fives.push({l:L.id,p:'p-v',form:'2-2',xi:xi.map(x=>({...x}))});
 await pg.click('#flBack');await pg.waitForTimeout(400);await pg.click(`[data-l="${L.id}"]`);await pg.waitForTimeout(600);
 T.check(/Зібрали 2 з 2/.test(await pg.textContent('#fl'))&&!!await pg.$('#fl5Start'),'лобі: «Зібрали 2 з 2», у творця — «Почати зараз»; склади відкриті');
 T.check((await pg.$$('#fl .fl5t')).length===2&&/vitia/.test(await pg.textContent('#fl .fl5teams')),'склади суперників відкриті');
 const xiL=await pg.$$eval('#fl .fl5t.me .fl5xi>div',es=>es.map(e=>e.textContent));
 T.check(xiL.length===3&&/^ВР/.test(xiL[0])&&/^ЗХ.+ · /.test(xiL[1])&&/^НП.+ · /.test(xiL[2]),'0.69: склад — по лініях від воротаря: '+xiL.join(' | '));
 await pg.screenshot({path:path.join(OUT,'fl63_lobby.png'),fullPage:true});
 const midL=await ipad('fl63_lobby_ipad.png',()=>{const mid=e=>{const r=e.getBoundingClientRect();return (r.left+r.right)/2;};const b=document.getElementById('fl5Start'),c=document.querySelector('#fl .fl-tour');return Math.round(Math.abs(mid(b)-mid(c)));});
 T.check(midL<=3,'iPad: «Почати зараз» по центру картки (зсув '+midL+'px)');
 T.check(/До кінця збору — (\d+ год|\d+ хв)/.test(await pg.textContent('#fl')),'0.64: лобі — скільки лишилось до кінця збору');
 await pg.click('#fl5Start');await pg.waitForTimeout(1200);
 const txt=(await pg.textContent('#fl')).replace(/\s+/g,' ');
 T.check(played===1&&/Турнір зіграно/.test(txt)&&/Серія \d:\d/.test(txt),'«Почати зараз» → сервер зіграв турнір: серія до двох перемог ('+txt.slice(0,120)+')');
 const res=M.leagues[0].result;T.check(res&&res.n===2&&res.matches.length>=2&&Math.max(...res.wins)>=1&&res.teams.length===2&&!res.bad.length,'результат: '+JSON.stringify({n:res&&res.n,m:res&&res.matches.length,wins:res&&res.wins,bad:res&&res.bad}));
 await pg.screenshot({path:path.join(OUT,'fl63_result.png'),fullPage:true});
 // tournament trophies (once per league) and Rematch
 const tr=await pg.evaluate(id=>{const s=JSON.parse(localStorage.getItem('upl30_tr')||'{}');return {play:s.t&&s.t.f5play&&s.t.f5play.n,f5:s.f5||[],box:!document.getElementById('fl5Tro').hidden&&document.getElementById('fl5Tro').textContent};},L.id);
 T.check(tr.play===1&&tr.f5.includes(L.id)&&/Двір на двір/.test(tr.box||''),'трофеї 5×5: «Двір на двір» видано й показано '+JSON.stringify(tr));
 await pg.click('#flBack');await pg.waitForTimeout(400);await pg.click(`[data-l="${L.id}"]`);await pg.waitForTimeout(600);
 T.check(await pg.evaluate(()=>JSON.parse(localStorage.getItem('upl30_tr')).t.f5play.n===1&&document.getElementById('fl5Tro').hidden),'повторний перегляд ліги — трофеї вдруге не видаються');
 await pg.click('#fl5Rev');await pg.waitForTimeout(300);
 const rv=await pg.evaluate(()=>({on:(document.querySelector('#fl .fl-names .onc')||{}).textContent,fmt:(document.querySelector('#fl [data-k="fmt"].on')||{}).dataset}));
 T.check(/^Реванш: /.test(rv.on||''),'«Реванш» → форма нової ліги з назвою «'+rv.on+'»');
 await pg.click('#flCreate');await pg.waitForTimeout(500);const c5=M.calls.filter(c=>c[0]==='fl_create5').pop();
 T.check(c5&&/^Реванш: /.test(c5[1].p_name)&&c5[1].p_rerolls===L.rerolls,'реванш створено: fl_create5 '+JSON.stringify(c5&&c5[1]));
 await pg.click('#fl5Back').catch(()=>{});await pg.waitForTimeout(300);await pg.evaluate(()=>{const b=document.getElementById('flBack');if(b)b.click();});await pg.waitForTimeout(400);await pg.click(`[data-l="${L.id}"]`);await pg.waitForTimeout(600);
 await pg.click('[data-m5="0"]');await pg.waitForTimeout(300);
 const mt=(await pg.textContent('#fl')).replace(/\s+/g,' ');
 T.check(/Матч серії/.test(mt)&&/\d+:\d+/.test(mt)&&/гравець матчу/.test(mt),'матч: рахунок, гравець матчу ('+mt.slice(0,90)+')');
 const nEv=await pg.$$eval('#fl5Feed .f5ev',e=>e.length);await pg.click('#fl5Live');await pg.waitForTimeout(200);
 T.check(await pg.$$eval('#fl5Feed .f5ev',e=>e.length)===0||nEv===0,'«Дивитися наживо»: епізоди з\'являються по одному');
 await pg.waitForTimeout(1600);T.check(nEv===0||await pg.$$eval('#fl5Feed .f5ev',e=>e.length)>=1,'наживо: перший епізод через ~1,4 с');
 await pg.screenshot({path:path.join(OUT,'fl63_match.png'),fullPage:true});
 await pg.click('#fl5Back');await pg.waitForTimeout(400);
 T.check(!A.errs.length,'помилок на сторінці немає '+A.errs.join(' | '));
 // 8-team tournament: group, semis, final - server engine called directly
 {const many={...M.get(L.id),fives:Array.from({length:8},(_,k)=>({u:'u'+k,name:'T'+k,form:'2-2',xi})),id:'abcdef',deadline:'2026-10-01T10:00:00Z'};const r=await play(many);
  T.check(r.table.length===8&&r.matches.filter(m=>m.stage==='sf').length===2&&r.matches.filter(m=>m.stage==='final').length===1&&r.matches.filter(m=>m.stage==='group').length===28,'8 учасників: 28 матчів групи, 2 півфінали, фінал');
  const r2=await play(many);T.check(JSON.stringify(r)===JSON.stringify(r2),'той самий seed — той самий турнір (однаково для всіх)');
  const bad={...many,fives:[{u:'x',name:'X',form:'2-2',xi:xi.map((x,i)=>i?x:{...x,slot:x.slot==='GK'?'FW':'GK'})},...many.fives.slice(0,1)]};const r3=await play(bad);
  T.check(r3.cancelled&&r3.bad[0]==='x','склад з неправильною лінією відкинуто → менше 2 — ліга скасована');}
 // guest via link
 const G=await openSite({b,db,api,query:'?l='+L.id,wait:1800});const gp=(await G.pg.textContent('#fl')).replace(/\s+/g,' ');
 T.check(gp.includes(L.name)&&/Турнір зіграно/.test(gp),'гість за посиланням: ліга й результат');
 T.check(!G.errs.length,'гість: помилок немає '+G.errs.join(' | '));
 await b.close();process.exit(T.done());})();
