// ---------- 5x5 match and tournament engine. Shared by the site (build.py inlines it before five.js) and the server (api/fl5.js via require).
// No DOM or global state: all randomness is R() from the seed, so a server-played league tournament is identical for everyone and verifiable.
// Player: {id, name, slot, r, goals, form?}; team: {label, form, slots:[{slot, player}]}. Simplified positions: GK / DF / MF / FW.
const F5_FORMS={
  "1-2-1":{tag:"Ромб",rows:[["FW"],["MF","MF"],["DF"],["GK"]]},
  "2-2":{tag:"Квадрат",rows:[["FW","FW"],["DF","DF"],["GK"]]},
  "2-1-1":{tag:"Надійна",rows:[["FW"],["MF"],["DF","DF"],["GK"]]},
  "1-1-2":{tag:"Ва-банк",rows:[["FW","FW"],["MF"],["DF"],["GK"]]}};
const F5_L={GK:"ВР",DF:"ЗХ",MF:"ПЗ",FW:"НП"};
const F5_ATT={GK:0,DF:0.35,MF:0.8,FW:1.1}, F5_DEF={GK:1.6,DF:1.2,MF:0.6,FW:0.2};
const F5_GOAL={GK:0,DF:0.3,MF:0.7,FW:1.2}, F5_AST={GK:0.05,DF:0.4,MF:1,FW:0.6};
const F5_BASE=2.6, F5_BETA=0.05;
// in-match penalties (docs/leagues_online.md): award probability per team; VAR reviews some and sometimes cancels
const F5_PEN={award:0.13,varCheck:0.3,varCancel:0.35};
// penalty skill from Transfermarkt data (src/pen_skill.js, data/penalties/skill.md): taker = Bayesian conversion rate, keeper = save rate.
// Missing players get the average (keeper as taker: 0.70). Real spread is small, so it is amplified by F5_PEN_A in game.
const F5_PEN_A=3;
function f5PenSkill(p){const d=F5_PK[p.id];return d?d[0]/1000:p.slot==='GK'?0.7:F5_PM;}
function f5PenRate(p){const d=F5_PK[p.id];return d?d[1]:0;}   // designated taker: penalties per match x1000
function f5GkSave(g){const d=F5_GK[g.id];return d!=null?d/1000:F5_GM;}
function f5PenP(by,gk,lo,hi){return Math.max(lo,Math.min(hi,F5_PM+F5_PEN_A*(f5PenSkill(by)-F5_PM)-F5_PEN_A*(f5GkSave(gk)-F5_GM)));}
function f5Idx(team){let a=0,wa=0,d=0,wd=0;for(const s of team.slots){const r=s.player.r+(s.player.form||0);a+=F5_ATT[s.slot]*r;wa+=F5_ATT[s.slot];d+=F5_DEF[s.slot]*r;wd+=F5_DEF[s.slot];}return {att:a/wa,def:d/wd};}
function f5Match(A,B,knockout,R){
  const N=()=>{let u=0,v=0;while(u===0)u=R();while(v===0)v=R();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
  const P=l=>{const L=Math.exp(-l);let k=0,p=1;do{k++;p*=R();}while(p>L);return k-1;};
  const pick=(T,W,excl)=>{let tot=0;for(const s of T.slots)if(s.player.id!==excl)tot+=W[s.slot]*Math.max(1,s.player.r-40);let x=R()*tot;
    for(const s of T.slots){if(s.player.id===excl)continue;x-=W[s.slot]*Math.max(1,s.player.r-40);if(x<=0)return s.player;}return T.slots[T.slots.length-1].player;};
  const gkOf=T=>T.slots.find(s=>s.slot==='GK').player;
  // taker order: skill (to 0.01), then penalties per match, then goals, then id; deterministic
  const takers=T=>T.slots.map(s=>s.player).sort((x,y)=>Math.round(f5PenSkill(y)*100)-Math.round(f5PenSkill(x)*100)||f5PenRate(y)-f5PenRate(x)||(y.goals||0)-(x.goals||0)||String(x.id).localeCompare(String(y.id)));
  const ia=f5Idx(A),ib=f5Idx(B);
  const la=F5_BASE*Math.exp(F5_BETA*(ia.att-ib.def)+N()*0.15),lb=F5_BASE*Math.exp(F5_BETA*(ib.att-ia.def)+N()*0.15);
  const ev=[],ep=[];const add=(T,side,n)=>{for(let k=0;k<n;k++){const sc=pick(T,F5_GOAL);const as=R()<0.6?pick(T,F5_AST,sc.id):null;ev.push({min:1+Math.floor(R()*40),side,sc,as});}};
  let ga=P(la),gb=P(lb);add(A,0,ga);add(B,1,gb);
  // in-game penalty: awarded -> (VAR: confirmed / cancelled) -> kick: goal / save / miss
  for(const [T,O,side] of [[A,B,0],[B,A,1]]){
    if(R()>=F5_PEN.award)continue;const min=1+Math.floor(R()*40);
    if(R()<F5_PEN.varCheck){const cancel=R()<F5_PEN.varCancel;ep.push({min,side,k:'var',ok:!cancel});if(cancel)continue;}
    const by=takers(T)[0],gk=gkOf(O),pr=f5PenP(by,gk,0.5,0.93);
    const res=R()<pr?'goal':R()<0.6?'save':'miss';ep.push({min,side,k:'pen',by,gk,res});
    if(res==='goal'){ev.push({min,side,sc:by,as:null,pen:true});if(side)gb++;else ga++;}}
  ev.sort((x,y)=>x.min-y.min||x.side-y.side);ep.sort((x,y)=>x.min-y.min||x.side-y.side);
  // shootout (knockout only): 5 kicks by best takers, then sudden death
  let pens=null,so=null;
  if(knockout&&ga===gb){so=[];const ta=takers(A),tb=takers(B);let a=0,b=0;
    const kick=(T,O,side,k)=>{const by=T[k%T.length],gk=gkOf(O),pr=f5PenP(by,gk,0.55,0.92),ok=R()<pr;so.push({side,by,ok});return ok?1:0;};
    for(let k=0;k<5;k++){a+=kick(ta,B,0,k);b+=kick(tb,A,1,k);}
    for(let k=5;a===b&&k<40;k++){a+=kick(ta,B,0,k);b+=kick(tb,A,1,k);}
    if(a===b)a++;   // safety cap: shootout cannot run forever
    pens=[a,b];}
  const rate=(T,side,gf,gaa)=>T.slots.map(s=>{const p=s.player;const g=ev.filter(e=>e.side===side&&e.sc.id===p.id).length,a=ev.filter(e=>e.side===side&&e.as&&e.as.id===p.id).length;
    let v=6.5+(gf>gaa?0.4:gf<gaa?-0.4:0)+(p.r-80)*0.02+N()*0.35+g*0.9+a*0.5;
    if(s.slot==='GK')v+=gaa===0?0.9:-Math.max(0,gaa-2)*0.25;if(s.slot==='DF'&&gaa<=1)v+=0.3;
    for(const e of ep)if(e.k==='pen'&&e.res!=='goal'&&e.gk===p&&s.slot==='GK'&&e.res==='save')v+=0.6;
    return {id:p.id,name:p.name,slot:s.slot,g,a,rt:Math.max(3,Math.min(10,v))};});
  return {A,B,ga,gb,ev,ep,so,pens,la,lb,ra:rate(A,0,ga,gb),rb:rate(B,1,gb,ga)};}
function f5Winner(m){return m.ga>m.gb?0:m.ga<m.gb?1:m.pens?(m.pens[0]>m.pens[1]?0:1):-1;}
// tournament form: random "day" per team and per player (same as local 5x5)
function f5SetForm(teams,R){for(const t of teams){let u=0,v=0;while(u===0)u=R();while(v===0)v=R();const tf=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)*2;
  for(const s of t.slots){let a=0,b=0;while(a===0)a=R();while(b===0)b=R();s.player.form=Math.max(-8,Math.min(8,Math.round(tf+Math.sqrt(-2*Math.log(a))*Math.cos(2*Math.PI*b)*3)));}}}
// 5x5 league tournament (docs/leagues_online.md, step 5): 2 entrants: best of three; 3-7: round robin + final; 8-10: group, semis (1-4, 2-3), final.
// Group: 3 pts win, 1 draw; ties: goal diff -> goals for -> head-to-head -> join order. Result is plain JSON (no object references).
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
