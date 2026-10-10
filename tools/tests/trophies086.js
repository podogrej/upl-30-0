// Trophy batch 0.86: every new condition on synthetic season contexts (positive and negative), mixed() exclusion
// in one club / derby, the ukrposhta threshold, the anti-season ga ladder, the thrash rename, ids accepted by the server.
// No browser: src/trophies.js is evaluated with the engine data. Run from repo root: node tools/tests/trophies086.js
const fs=require('fs'),path=require('path');const {checker}=require('./_site.js');
const ROOT=path.join(__dirname,'..','..');const E=require(path.join(ROOT,'lib','engine.js'));
const {DATA,GROUP_OF}=E;const canon=id=>(DATA.alias&&DATA.alias[id])||id;const isLive=y=>!!DATA.seasons[y]&&DATA.seasons[y].status==='live';
const src=fs.readFileSync(path.join(ROOT,'src','trophies.js'),'utf8');
const {TROPHIES}=new Function('DATA','canon','isLive','GROUP_OF',src.slice(0,src.indexOf('const MILESTONES'))+';return {TROPHIES};')(DATA,canon,isLive,GROUP_OF);
const T=checker('trophies086');const tr=id=>TROPHIES.find(t=>t.id===id);

// season context: matches [[ug,og,home],...] (30 by default: 1:1 away), players [{slot,g,a}], table fields
const M=(ug,og,home=false)=>({ug,og,home,res:ug>og?'W':ug===og?'D':'L'});
function ctx({log,pl,place=6,pts,ga,format='classic',mode='normal'}={}){
  log=log||Array.from({length:30},()=>M(1,1));
  const W=log.filter(m=>m.res==='W').length,D=log.filter(m=>m.res==='D').length,L=log.length-W-D;
  const r={W,D,L,pts:pts??3*W+D,place,gf:log.reduce((a,m)=>a+m.ug,0),ga:ga??log.reduce((a,m)=>a+m.og,0),xp:40,log:log.map((m,k)=>({rd:k+1,...m}))};
  pl=pl||['GK','CB','CB','LB','RB','CM','CM','CAM','LW','RW','ST'].map(slot=>({slot,g:0,a:5}));
  return {r,xi:pl.map((p,k)=>({id:'x'+k,name:'Гравець '+k,slot:p.slot,nat:-1,by:0,cc:'c'+k,y:2010,r0:75})),pl:pl.map((p,k)=>({id:'x'+k,rt:6.5,form:0,...p})),format,mode,reveal:false};
}
const has=(id,c)=>{try{return !!tr(id).t(c);}catch(e){return false;}};
const both=(id,yes,no,msg)=>{T.check(has(id,yes)&&!has(id,no),`${id} «${tr(id)&&tr(id).n}»: ${msg}`);
  T.check(!has(id,{...yes,format:'oneclub'})&&!has(id,{...yes,format:'derby'})&&!has(id,{...yes,format:'anti'}),`${id}: не в «Один клуб», «Дербі», антисезоні`);};
const set=(log,k,m)=>{const a=[...log];a[k]=m;return a;};
const draws=Array.from({length:30},()=>M(1,1));
const runOf=(n,m,fill=M(0,1))=>Array.from({length:30},(_,k)=>k<n?m:fill);
const goals=g=>['GK','CB','CB','LB','RB','CM','CM','CAM','LW','RW','ST'].map((slot,k)=>({slot,g:g[k]||0,a:5}));

// new trophies: ids, names, categories
const NEW={rout8:'Як на тренуванні',conc12:'Моурінью задоволений',champ75:'Поза конкуренцією',scorer20:'Голеадор',trio12:'Бейленко, Бенземенко, Роналденко',
  trio15:'Мессієнко, Суаресенко, Неймаренко',duo15:'Шева й Інзагі',wins10:'Інтерсіті без зупинок',unbeat20:'Нас не подолати',awayfort:'Почувайтеся як вдома',
  surge2:'Друге дихання',fade2:'Весняне загострення',dfgoals12:'Оборона — найкращий напад',nil5:'Нудьга',cs18:'Ворота на замку',fourth:'Перший за бортом',
  loss17:'Вийшов бразилити',win71:'Вийшов німити'};
T.check(Object.entries(NEW).every(([id,n])=>tr(id)&&tr(id).n===n&&tr(id).rep===1&&!tr(id).sec&&tr(id).i&&tr(id).d),'18 нових трофеїв: назви, емодзі, опис, rep, не секретні');
T.check(new Set(TROPHIES.map(t=>t.id)).size===TROPHIES.length,'id трофеїв унікальні');
T.check(new Set(TROPHIES.map(t=>t.n)).size===TROPHIES.length,'назви трофеїв унікальні');
T.check(TROPHIES.every(t=>/^[A-Za-z0-9_]{1,24}$/.test(t.id)),'усі id проходять перевірку сервера (api/save.js, ≤ 24 символи)');

// each new condition
both('rout8',ctx({log:set(draws,3,M(8,0))}),ctx({log:set(draws,3,M(7,0))}),'перемога 8:0 — так, 7:0 — ні');
both('conc12',ctx({ga:12}),ctx({ga:13}),'12 пропущених — так, 13 — ні');
both('champ75',ctx({place:1,pts:75}),ctx({place:1,pts:74}),'чемпіон із 75 — так, із 74 — ні');
T.check(!has('champ75',ctx({place:2,pts:80})),'champ75: 80 очок, але друге місце — ні');
both('wins10',ctx({log:runOf(10,M(2,0))}),ctx({log:runOf(9,M(2,0))}),'10 перемог поспіль — так, 9 — ні');
T.check(!has('wins10',ctx({log:Array.from({length:30},(_,k)=>k%10===9?M(1,1):M(2,0))})),'wins10: 27 перемог, але серії по 9 — ні');
both('unbeat20',ctx({log:runOf(20,M(1,1))}),ctx({log:runOf(19,M(1,1))}),'20 матчів без поразок поспіль — так, 19 — ні');
const away=Array.from({length:30},(_,k)=>M(k%2?0:1,k%2?0:2,k%2===0));   // home: all lost; away: all drawn
both('awayfort',ctx({log:away}),ctx({log:set(away,1,M(0,1,false))}),'усі поразки вдома — так, одна на виїзді — ні');
T.check(!has('awayfort',ctx({log:away.slice(0,29)})),'awayfort: неповний журнал матчів — ні');
const halves=(a,b)=>Array.from({length:30},(_,k)=>k<15?a(k):b(k-15));   // a, b: match index within the half
both('surge2',ctx({log:halves(k=>k<4?M(1,0):M(0,1),k=>k<8?M(1,0):M(0,1))}),ctx({log:halves(k=>k<4?M(1,0):M(0,1),k=>k<7?M(1,0):M(0,1))}),'друге коло +12 очок — так, +9 — ні');
both('fade2',ctx({log:halves(k=>k<8?M(1,0):M(0,1),k=>k<4?M(1,0):M(0,1))}),ctx({log:halves(k=>k<7?M(1,0):M(0,1),k=>k<4?M(1,0):M(0,1))}),'друге коло −12 очок — так, −9 — ні');
T.check(!has('surge2',ctx({log:halves(k=>M(0,1),k=>M(1,0)).slice(0,29)})),'surge2: неповний журнал — ні');
both('nil5',ctx({log:Array.from({length:30},(_,k)=>k<5?M(0,0):M(1,1))}),ctx({log:Array.from({length:30},(_,k)=>k<4?M(0,0):M(1,1))}),'п’ять 0:0 — так, чотири — ні');
both('cs18',ctx({log:Array.from({length:30},(_,k)=>k<18?M(1,0):M(1,1))}),ctx({log:Array.from({length:30},(_,k)=>k<17?M(1,0):M(1,1))}),'18 матчів на нуль — так, 17 — ні');
both('fourth',ctx({place:4}),ctx({place:3}),'4-те місце — так, 3-тє — ні');
T.check(!has('fourth',ctx({place:5})),'fourth: 5-те місце — ні');
both('scorer20',ctx({pl:goals([0,0,0,0,0,0,0,0,0,0,20])}),ctx({pl:goals([0,0,0,0,0,0,0,0,0,0,19])}),'гравець забив 20 — так, 19 — ні');
both('duo15',ctx({pl:goals([0,0,0,0,0,0,0,0,0,15,15])}),ctx({pl:goals([0,0,0,0,0,0,0,0,0,14,30])}),'двоє по 15 — так, 30 і 14 — ні');
both('trio12',ctx({pl:goals([0,0,0,0,0,0,0,0,12,12,12])}),ctx({pl:goals([0,0,0,0,0,0,0,0,11,20,20])}),'троє по 12 — так, 20, 20 і 11 — ні');
both('trio15',ctx({pl:goals([0,0,0,0,0,0,0,0,15,15,15])}),ctx({pl:goals([0,0,0,0,0,0,0,0,14,20,20])}),'троє по 15 — так, 20, 20 і 14 — ні');
both('dfgoals12',ctx({pl:goals([0,4,4,2,2])}),ctx({pl:goals([5,4,4,2,1,9,9])}),'захисники разом 12 — так, 11 (+ воротар і півзахисники) — ні');
T.check(has('dfgoals12',ctx({pl:[{slot:'GK',g:0},{slot:'LWB',g:6},{slot:'RWB',g:6},...goals([]).slice(3)]})),'dfgoals12: вінгбеки (LWB, RWB) — захисники');
T.check(has('loss17',ctx({log:set(draws,5,M(1,7))}))&&!has('loss17',ctx({log:set(draws,5,M(0,7))}))&&!has('loss17',ctx({log:set(draws,5,M(1,8))})),'loss17 «Вийшов бразилити»: 1:7 — так, 0:7 і 1:8 — ні');
T.check(!has('loss17',ctx({log:set(draws,5,M(1,7)),format:'anti'})),'loss17: не в антисезоні');
both('win71',ctx({log:set(draws,5,M(7,1))}),ctx({log:set(draws,5,M(7,0))}),'7:1 — так, 7:0 — ні');
T.check(['rout8','conc12','champ75','scorer20','duo15'].every(id=>has(id,{...ctx({log:set(draws,3,M(8,0)),place:1,pts:80,ga:10,pl:goals([0,0,0,0,0,0,0,0,0,20,20])}),format:'legends'})),'нові трофеї працюють у «Легендах» (mixed)');
T.check(Object.keys(NEW).filter(id=>id!=='loss17').every(id=>/mixed\(c\)/.test(String(tr(id).t))),'усі нові, крім loss17, обмежені mixed(c)');

// one club / derby with an otherwise winning context: no new trophy except loss17
const rich=ctx({log:Array.from({length:30},(_,k)=>k<18?M(8,0,k%2===0):k===18?M(7,1):k<25?M(0,0):M(1,1)),place:1,pts:80,ga:1,pl:goals([0,6,6,2,2,0,0,15,15,15,25])});
const newOf=c=>Object.keys(NEW).filter(id=>has(id,c));
T.check(newOf(rich).length>=12,'насичений класичний сезон дає більшість нових ('+newOf(rich).join(', ')+')');
T.check(newOf({...rich,format:'oneclub'}).length===0&&newOf({...rich,format:'derby'}).length===0,'той самий сезон в «Один клуб» і «Дербі» — жодного нового');

// changed: ukrposhta < 3 assists, nova poshta unchanged
const up=a=>ctx({pl:['GK','CB','CB','LB','RB','CM','CM','CAM','LW','RW','ST'].map(slot=>({slot,g:0,a:['CAM','LW','RW'].includes(slot)?(slot==='LW'?a:9):5}))});
T.check(has('ukrposhta',up(2))&&!has('ukrposhta',up(3))&&!has('ukrposhta',up(4)),'ukrposhta: 2 асисти — так, 3 і 4 — ні');
T.check(/менше 3 асистів/.test(tr('ukrposhta').d),'ukrposhta: опис «менше 3 асистів»');
T.check(has('assist',ctx({pl:goals([]).map((p,k)=>({...p,a:k===7?15:0}))}))&&!has('assist',ctx({pl:goals([]).map((p,k)=>({...p,a:k===7?14:0}))})),'Нова пошта без змін: 15 асистів — так, 14 — ні');

// anti-season ladder
const LADDER={ga150:60,ga250:70,ga400:80,ga600:90,ga800:100,ga1000:110};
for(const [id,n] of Object.entries(LADDER)){const t=tr(id);
  T.check(has(id,ctx({format:'anti',ga:n}))&&!has(id,ctx({format:'anti',ga:n-1}))&&!has(id,ctx({ga:n+50})),`${id}: антисезон ${n} — так, ${n-1} — ні, класика — ні`);
  T.check(t.d===`Пропусти ${n}+ голів в антисезоні`,`${id}: опис «${t.d}»`);}

// rename
const th=tr('thrash');T.check(th.n==='Хокейний рахунок'&&!TROPHIES.some(t=>t.n==='Розбили, як Бог черепаху'),'thrash: нова назва, id той самий');
T.check(has('thrash',ctx({log:set(draws,3,M(6,0))}))&&!has('thrash',ctx({log:set(draws,3,M(5,0))})),'thrash: умова та сама (6+)');
process.exit(T.done());
