// ---------- 5×5: рушій матчу й турніру (0.63). Спільний для сайту (build.py вбудовує його перед five.js) і сервера (api/fl5.js — require).
// Без DOM і глобального стану: уся випадковість — R() від seed, тож турнір ліги, зіграний сервером, однаковий для всіх і перевірний.
// Гравець: {id, name, slot, r, goals, form?}; команда: {label, form, slots:[{slot, player}]}. Позиції спрощені: ВР / ЗХ / ПЗ / НП.
const F5_FORMS={
  "1-2-1":{tag:"Ромб",rows:[["FW"],["MF","MF"],["DF"],["GK"]]},
  "2-2":{tag:"Квадрат",rows:[["FW","FW"],["DF","DF"],["GK"]]},
  "2-1-1":{tag:"Надійна",rows:[["FW"],["MF"],["DF","DF"],["GK"]]},
  "1-1-2":{tag:"Ва-банк",rows:[["FW","FW"],["MF"],["DF"],["GK"]]}};
const F5_L={GK:"ВР",DF:"ЗХ",MF:"ПЗ",FW:"НП"};
const F5_ATT={GK:0,DF:0.35,MF:0.8,FW:1.1}, F5_DEF={GK:1.6,DF:1.2,MF:0.6,FW:0.2};
const F5_GOAL={GK:0,DF:0.3,MF:0.7,FW:1.2}, F5_AST={GK:0.05,DF:0.4,MF:1,FW:0.6};
const F5_BASE=2.6, F5_BETA=0.05;
// пенальті в матчі (0.63, docs/leagues_online.md): ймовірність, що команді призначать пенальті; VAR перевіряє частину й іноді скасовує
const F5_PEN={award:0.13,varCheck:0.3,varCancel:0.35};
// навик пенальтиста: поки без даних Transfermarkt/FIFA — оцінка за лінією, рейтингом і голами (рішення власника 30.09: «кого немає ніде — оцінка»)
function f5PenSkill(p){const line={FW:0.05,MF:0.03,DF:0,GK:-0.25}[p.slot]||0;return Math.max(0.45,Math.min(0.92,0.7+line+((p.r||70)-75)*0.006+Math.min(20,p.goals||0)*0.003));}
function f5Idx(team){let a=0,wa=0,d=0,wd=0;for(const s of team.slots){const r=s.player.r+(s.player.form||0);a+=F5_ATT[s.slot]*r;wa+=F5_ATT[s.slot];d+=F5_DEF[s.slot]*r;wd+=F5_DEF[s.slot];}return {att:a/wa,def:d/wd};}
function f5Match(A,B,knockout,R){
  const N=()=>{let u=0,v=0;while(u===0)u=R();while(v===0)v=R();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
  const P=l=>{const L=Math.exp(-l);let k=0,p=1;do{k++;p*=R();}while(p>L);return k-1;};
  const pick=(T,W,excl)=>{let tot=0;for(const s of T.slots)if(s.player.id!==excl)tot+=W[s.slot]*Math.max(1,s.player.r-40);let x=R()*tot;
    for(const s of T.slots){if(s.player.id===excl)continue;x-=W[s.slot]*Math.max(1,s.player.r-40);if(x<=0)return s.player;}return T.slots[T.slots.length-1].player;};
  const gkOf=T=>T.slots.find(s=>s.slot==='GK').player;
  const takers=T=>T.slots.map(s=>s.player).sort((x,y)=>f5PenSkill(y)-f5PenSkill(x)||String(x.id).localeCompare(String(y.id)));
  const ia=f5Idx(A),ib=f5Idx(B);
  const la=F5_BASE*Math.exp(F5_BETA*(ia.att-ib.def)+N()*0.15),lb=F5_BASE*Math.exp(F5_BETA*(ib.att-ia.def)+N()*0.15);
  const ev=[],ep=[];const add=(T,side,n)=>{for(let k=0;k<n;k++){const sc=pick(T,F5_GOAL);const as=R()<0.6?pick(T,F5_AST,sc.id):null;ev.push({min:1+Math.floor(R()*40),side,sc,as});}};
  let ga=P(la),gb=P(lb);add(A,0,ga);add(B,1,gb);
  // пенальті в грі: «Суддя призначив пенальті» → (VAR: підтверджено / скасовано) → удар: забив / сейв / мимо
  for(const [T,O,side] of [[A,B,0],[B,A,1]]){
    if(R()>=F5_PEN.award)continue;const min=1+Math.floor(R()*40);
    if(R()<F5_PEN.varCheck){const cancel=R()<F5_PEN.varCancel;ep.push({min,side,k:'var',ok:!cancel});if(cancel)continue;}
    const by=takers(T)[0],gk=gkOf(O),pr=Math.max(0.5,Math.min(0.93,f5PenSkill(by)-((gk.r||75)-75)*0.004));
    const res=R()<pr?'goal':R()<0.6?'save':'miss';ep.push({min,side,k:'pen',by,gk,res});
    if(res==='goal'){ev.push({min,side,sc:by,as:null,pen:true});if(side)gb++;else ga++;}}
  ev.sort((x,y)=>x.min-y.min||x.side-y.side);ep.sort((x,y)=>x.min-y.min||x.side-y.side);
  // серія пенальті (лише плей-офф): 5 ударів — найкращі пенальтисти, далі до першого промаху
  let pens=null,so=null;
  if(knockout&&ga===gb){so=[];const ta=takers(A),tb=takers(B);let a=0,b=0;
    const kick=(T,O,side,k)=>{const by=T[k%T.length],gk=gkOf(O),pr=Math.max(0.55,Math.min(0.92,f5PenSkill(by)-((gk.r||75)-75)*0.004)),ok=R()<pr;so.push({side,by,ok});return ok?1:0;};
    for(let k=0;k<5;k++){a+=kick(ta,B,0,k);b+=kick(tb,A,1,k);}
    for(let k=5;a===b&&k<40;k++){a+=kick(ta,B,0,k);b+=kick(tb,A,1,k);}
    if(a===b)a++;   // запобіжник: серія не нескінченна
    pens=[a,b];}
  const rate=(T,side,gf,gaa)=>T.slots.map(s=>{const p=s.player;const g=ev.filter(e=>e.side===side&&e.sc.id===p.id).length,a=ev.filter(e=>e.side===side&&e.as&&e.as.id===p.id).length;
    let v=6.5+(gf>gaa?0.4:gf<gaa?-0.4:0)+(p.r-80)*0.02+N()*0.35+g*0.9+a*0.5;
    if(s.slot==='GK')v+=gaa===0?0.9:-Math.max(0,gaa-2)*0.25;if(s.slot==='DF'&&gaa<=1)v+=0.3;
    for(const e of ep)if(e.k==='pen'&&e.res!=='goal'&&e.gk===p&&s.slot==='GK'&&e.res==='save')v+=0.6;
    return {id:p.id,name:p.name,slot:s.slot,g,a,rt:Math.max(3,Math.min(10,v))};});
  return {A,B,ga,gb,ev,ep,so,pens,la,lb,ra:rate(A,0,ga,gb),rb:rate(B,1,gb,ga)};}
function f5Winner(m){return m.ga>m.gb?0:m.ga<m.gb?1:m.pens?(m.pens[0]>m.pens[1]?0:1):-1;}
// форма на турнір: у команди й у кожного гравця свій «день» (як у 5×5 на одному телефоні)
function f5SetForm(teams,R){for(const t of teams){let u=0,v=0;while(u===0)u=R();while(v===0)v=R();const tf=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)*2;
  for(const s of t.slots){let a=0,b=0;while(a===0)a=R();while(b===0)b=R();s.player.form=Math.max(-8,Math.min(8,Math.round(tf+Math.sqrt(-2*Math.log(a))*Math.cos(2*Math.PI*b)*3)));}}}
// турнір ліги 5×5 (docs/leagues_online.md, крок 5): 2 учасники — серія до двох перемог; 3–7 — група «кожен з кожним» і фінал; 8–10 — група, півфінали (1–4, 2–3), фінал.
// Група: 3 очки за перемогу, 1 за нічию; рівність — різниця → забиті → очна зустріч → порядок вступу. Результат — простий JSON (без посилань на об'єкти).
function f5Tournament(teams,R){
  f5SetForm(teams,R);const n=teams.length,out={v:1,n,matches:[],table:null,champ:null};
  const pl=p=>p?{id:p.id,name:p.name}:null;
  const M=(i,j,ko,stage)=>{const m=f5Match(teams[i],teams[j],ko,R);
    out.matches.push({i,j,stage,ga:m.ga,gb:m.gb,pens:m.pens,xg:[+m.la.toFixed(2),+m.lb.toFixed(2)],
      ev:m.ev.map(e=>({min:e.min,side:e.side,sc:pl(e.sc),as:pl(e.as),pen:!!e.pen})),
      ep:m.ep.map(e=>e.k==='var'?{min:e.min,side:e.side,k:'var',ok:e.ok}:{min:e.min,side:e.side,k:'pen',by:pl(e.by),gk:pl(e.gk),res:e.res}),
      so:m.so?m.so.map(x=>({side:x.side,by:pl(x.by),ok:x.ok})):null,
      ra:m.ra.map(x=>({...x,rt:+x.rt.toFixed(2)})),rb:m.rb.map(x=>({...x,rt:+x.rt.toFixed(2)}))});
    const w=f5Winner(m);return w<0?-1:w===0?i:j;};
  if(n===2){const wins=[0,0];let last=-1;
    for(let k=0;k<4&&Math.max(...wins)<2;k++){if(k>=3&&wins[0]!==wins[1])break;const ko=k>=2&&wins[0]===wins[1];last=M(0,1,ko,'duel');if(last>=0)wins[last]++;}
    out.wins=wins;out.champ=wins[0]>wins[1]?0:wins[1]>wins[0]?1:last;return out;}
  const st=teams.map((t,i)=>({i,p:0,w:0,d:0,l:0,gf:0,ga:0}));
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){M(i,j,false,'group');const m=out.matches[out.matches.length-1],a=st[i],b=st[j];
    a.gf+=m.ga;a.ga+=m.gb;b.gf+=m.gb;b.ga+=m.ga;if(m.ga>m.gb){a.p+=3;a.w++;b.l++;}else if(m.ga<m.gb){b.p+=3;b.w++;a.l++;}else{a.p++;b.p++;a.d++;b.d++;}}
  const h2h=(x,y)=>{const m=out.matches.find(q=>q.stage==='group'&&((q.i===x.i&&q.j===y.i)||(q.i===y.i&&q.j===x.i)));if(!m)return 0;const gx=m.i===x.i?m.ga:m.gb,gy=m.i===x.i?m.gb:m.ga;return gy-gx;};
  st.sort((x,y)=>y.p-x.p||(y.gf-y.ga)-(x.gf-x.ga)||y.gf-x.gf||h2h(x,y)||x.i-y.i);out.table=st;
  if(n<=7)out.champ=M(st[0].i,st[1].i,true,'final');
  else{const a=M(st[0].i,st[3].i,true,'sf'),b=M(st[1].i,st[2].i,true,'sf');out.champ=M(a,b,true,'final');}
  return out;}
if(typeof module!=='undefined'&&module.exports)module.exports={F5_FORMS,F5_L,f5PenSkill,f5Idx,f5Match,f5Winner,f5Tournament};
