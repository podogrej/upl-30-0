// Trophy batch 0.88 (memes): every new condition on synthetic season contexts (positive and negative), mixed() where set,
// no anti-season, the surge2 and mediocre renames. No browser. Run from repo root: node tools/tests/trophies088.js
const fs=require('fs'),path=require('path');const {checker}=require('./_site.js');
const ROOT=path.join(__dirname,'..','..');const E=require(path.join(ROOT,'lib','engine.js'));
const {DATA,GROUP_OF}=E;const canon=id=>(DATA.alias&&DATA.alias[id])||id;const isLive=y=>!!DATA.seasons[y]&&DATA.seasons[y].status==='live';
const src=fs.readFileSync(path.join(ROOT,'src','trophies.js'),'utf8');
const {TROPHIES}=new Function('DATA','canon','isLive','GROUP_OF',src.slice(0,src.indexOf('const MILESTONES'))+';return {TROPHIES};')(DATA,canon,isLive,GROUP_OF);
const T=checker('trophies088');const tr=id=>TROPHIES.find(t=>t.id===id);

const M=(ug,og,home=false)=>({ug,og,home,res:ug>og?'W':ug===og?'D':'L'});
const SLOTS=['GK','CB','CB','LB','RB','CM','CM','CAM','LW','RW','ST'];
// season context: log of matches, players [{slot,g,a}], place, points of the top two (table), leader after round 15, nat / birth year
function ctx({log,pl,place=6,pts,gf,ga,top=[],lead15=false,nat=-1,age=26,format='classic',mode='normal'}={}){
  log=log||Array.from({length:30},()=>M(1,1));
  const W=log.filter(m=>m.res==='W').length,D=log.filter(m=>m.res==='D').length,L=log.length-W-D;
  pts=pts??3*W+D;
  const table=Array.from({length:16},(_,i)=>({id:i===place-1?'USER':'t'+i,pts:i===place-1?pts:(top[i]??Math.max(0,60-3*i))}));
  const snap=Array.from({length:16},(_,i)=>({id:i===0&&lead15?'USER':'t'+i}));if(!lead15)snap[5].id='USER';
  const r={W,D,L,pts,place,gf:gf??log.reduce((a,m)=>a+m.ug,0),ga:ga??log.reduce((a,m)=>a+m.og,0),xp:40,table,snaps:Array.from({length:30},()=>snap),log:log.map((m,k)=>({rd:k+1,...m}))};
  pl=pl||SLOTS.map(slot=>({slot,g:0,a:0}));
  return {r,xi:pl.map((p,k)=>({id:'x'+k,name:'Гравець '+k,slot:p.slot,nat,by:2010-age,cc:'c'+k,y:2010,r0:75})),pl:pl.map((p,k)=>({id:'x'+k,rt:6.5,form:0,...p})),format,mode,reveal:false};
}
const has=(id,c)=>{try{return !!tr(id).t(c);}catch(e){return false;}};
const MIXED=new Set(['dance','wedding','siuu','tikitaka','seaside','budmo']);
const both=(id,yes,no,msg)=>{T.check(has(id,yes)&&!has(id,no),`${id} «${tr(id)&&tr(id).n}»: ${msg}`);
  T.check(!has(id,{...yes,format:'anti'}),`${id}: не в антисезоні`);
  if(MIXED.has(id))T.check(!has(id,{...yes,format:'oneclub'})&&!has(id,{...yes,format:'derby'})&&has(id,{...yes,format:'legends'}),`${id}: mixed — «Легенди» так, «Один клуб» і «Дербі» ні`);
  else T.check(has(id,{...yes,format:'oneclub'}),`${id}: працює і в «Один клуб»`);};
const set=(log,k,m)=>{const a=[...log];a[k]=m;return a;};
const draws=Array.from({length:30},()=>M(1,1));
const pls=(g,a)=>SLOTS.map((slot,k)=>({slot,g:(g||[])[k]||0,a:(a||[])[k]||0}));

const NEW={avatar:'Постав хоч мого кота Аватара',punish:'Таке чувство, що Бог нас наказує за щось',merzost:'Це мєрзость',mayemo:'Маємо те, що маємо',
  choco:'Може я тоже хочу шоколадку',batya:'Батя на розслабоні',dance:'Дикі танці',wedding:'Скажене весілля',notkept:'Що маємо — не бережемо',
  kozaky:'Як козаки у футбол грали',aguero:'Агуерооо!',siuu:'Сіууу!',tikitaka:'Тікі-така',metal:'Хеві-метал футбол',seaside:'Ти де? А я на морі',
  hop:'Не кажи «гоп», поки не перескочиш',crayfish:'Як рак свисне',budmo:'Будьмо!'};
T.check(Object.entries(NEW).every(([id,n])=>tr(id)&&tr(id).n===n&&tr(id).rep===1&&!tr(id).sec&&tr(id).i&&tr(id).d),'18 нових трофеїв: назви, емодзі, опис, rep, не секретні');
T.check(tr('avatar').q==='Леоненко'&&tr('punish').q==='Кополовець'&&Object.keys(NEW).filter(id=>tr(id).q).length===2,'цитати: автор лише в Аватара і «Бог нас наказує»');
T.check(new Set(TROPHIES.map(t=>t.id)).size===TROPHIES.length&&new Set(TROPHIES.map(t=>t.n)).size===TROPHIES.length,'id і назви трофеїв унікальні');
T.check(TROPHIES.every(t=>/^[A-Za-z0-9_]{1,24}$/.test(t.id)),'усі id проходять перевірку сервера (≤ 24 символи)');
T.check([...MIXED].every(id=>/mixed\(c\)/.test(String(tr(id).t)))&&Object.keys(NEW).filter(id=>!MIXED.has(id)).every(id=>!/mixed\(c\)/.test(String(tr(id).t))),'mixed(c) рівно в dance, wedding, siuu, tikitaka, seaside, budmo');

const ones=n=>Array.from({length:30},(_,k)=>k<n?M(1,0):M(2,2));
both('avatar',ctx({log:ones(8),place:1}),ctx({log:ones(7),place:1}),'чемпіон із 8 перемогами 1:0 — так, із 7 — ні');
T.check(!has('avatar',ctx({log:ones(12),place:2})),'avatar: 12 перемог 1:0, але друге місце — ні');
const lossRun=n=>Array.from({length:30},(_,k)=>k>=10&&k<10+n?M(0,1):M(1,1));
both('punish',ctx({log:lossRun(5)}),ctx({log:lossRun(4)}),'5 поразок поспіль — так, 4 — ні');
T.check(!has('punish',ctx({log:Array.from({length:30},(_,k)=>k%5===4?M(1,1):M(0,1))})),'punish: 24 поразки, але серії по 4 — ні');
both('merzost',ctx({log:set(draws,3,M(1,6))}),ctx({log:set(draws,3,M(1,5))}),'поразка 1:6 — так, 1:5 — ні');
both('mayemo',ctx({place:8}),ctx({place:7}),'8-ме місце — так, 7-ме — ні');
T.check(!has('mayemo',ctx({place:9})),'mayemo: 9-те — ні');
both('choco',ctx({place:2,pts:70,top:[71]}),ctx({place:2,pts:70,top:[72]}),'друге, відставання 1 — так, 2 — ні');
T.check(!has('choco',ctx({place:2,pts:70,top:[70]})),'choco: друге при рівних очках — ні');
both('batya',ctx({place:1,age:30}),ctx({place:1,age:29}),'чемпіон, середній вік 30 — так, 29 — ні');
T.check(!has('batya',ctx({place:2,age:33})),'batya: вік 33, але друге місце — ні');
const noBy=ctx({place:1,age:35});noBy.xi[0].by=0;T.check(!has('batya',noBy),'batya: невідомий рік народження — ні');
both('dance',ctx({gf:90}),ctx({gf:89}),'90 голів — так, 89 — ні');
both('wedding',ctx({log:set(draws,4,M(5,3))}),ctx({log:set(draws,4,M(4,3))}),'матч 5:3 — так, 4:3 — ні');
T.check(has('wedding',ctx({log:set(draws,4,M(2,6))})),'wedding: поразка 2:6 теж рахується');
both('notkept',ctx({place:4,lead15:true}),ctx({place:3,lead15:true}),'лідер після 15 туру і 4-те — так, 3-тє — ні');
T.check(!has('notkept',ctx({place:9,lead15:false})),'notkept: не лідер після 15 туру — ні');
T.check(!has('notkept',{...ctx({place:9}),r:{...ctx({place:9}).r,snaps:undefined}}),'notkept: без таблиць по турах (старий запис) — ні');
both('kozaky',ctx({place:1,nat:0}),ctx({place:2,nat:0}),'чемпіон, усі українці — так, друге місце — ні');
const oneForeign=ctx({place:1,nat:0});oneForeign.xi[4].nat=3;T.check(!has('kozaky',oneForeign),'kozaky: один іноземець — ні');
both('aguero',ctx({place:1,pts:70,top:[0,70]}),ctx({place:1,pts:70,top:[0,69]}),'чемпіон при рівних очках з другим — так, +1 — ні');
both('siuu',ctx({pl:pls([0,0,0,0,0,0,0,0,0,0,30])}),ctx({pl:pls([0,0,0,0,0,0,0,0,0,0,29])}),'гравець 30 голів — так, 29 — ні');
both('tikitaka',ctx({pl:pls([],[0,0,0,0,0,5,5,5,5,5,5])}),ctx({pl:pls([],[0,0,0,0,0,4,5,5,5,5,5])}),'шестеро по 5 асистів — так, п’ятеро — ні');
both('metal',ctx({gf:50,ga:35}),ctx({gf:50,ga:34}),'50 забитих і 35 пропущених — так, 34 — ні');
T.check(!has('metal',ctx({gf:49,ga:60})),'metal: 49 забитих — ні');
both('seaside',ctx({place:1,pts:80,top:[0,70]}),ctx({place:1,pts:80,top:[0,71]}),'відрив 10 — так, 9 — ні');
const hopLog=n=>Array.from({length:30},(_,k)=>k<n?M(2,0):M(0,1));
both('hop',ctx({log:hopLog(5),place:4}),ctx({log:hopLog(4),place:4}),'5 перемог на старті і 4-те — так, 4 перемоги — ні');
T.check(!has('hop',ctx({log:hopLog(5),place:3}))&&!has('hop',ctx({log:hopLog(5).slice(0,29),place:9})),'hop: 3-тє місце або неповний журнал — ні');
const late=k0=>Array.from({length:30},(_,k)=>k===k0?M(1,0):M(0,0));
both('crayfish',ctx({log:late(10)}),ctx({log:late(9)}),'перша перемога в 11-му турі — так, у 10-му — ні');
T.check(!has('crayfish',ctx({log:draws}))&&!has('crayfish',ctx({log:late(10).slice(0,29)})),'crayfish: без перемог або неповний журнал — ні');
both('budmo',ctx({pl:pls([0,2,2,2,2,2,2,2,2,2,2])}),ctx({pl:pls([0,1,2,2,2,2,2,2,2,2,9])}),'10 гравців по 2+ голи — так, 9 по 2+ і один з 1 — ні');

// renames: ids and conditions unchanged
T.check(tr('surge2').n==="Don't push the horses"&&!TROPHIES.some(t=>t.n==='Друге дихання'),'surge2: нова назва, id той самий');
T.check(tr('mediocre').n==='5000 до 1'&&!TROPHIES.some(t=>t.n==='З грязі в князі')&&!/Лестер/.test(tr('mediocre').n),'mediocre: «5000 до 1», без «Лестер»');
T.check(/\bhalfGain\(c\)>=12\b/.test(String(tr('surge2').t))&&/<78/.test(String(tr('mediocre').t)),'умови surge2 і mediocre ті самі');
process.exit(T.done());
