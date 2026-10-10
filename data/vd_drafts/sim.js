// Daily challenge difficulty calibration.
// Model "expert": perfect knowledge of who fits; real wheel (E.wheelSeq of a random seed, weighted club-seasons,
// skips club-seasons with nobody placeable, as spin() does); 4-4-2; event player pre-placed on his best slot;
// picks any player of the club-season into any slot he can play (effRating != null).
// Choice per spin: gate-advancing > scoring (req or bonus) > dud; slot = the open slot with the fewest scoring cards in the pool
// (fill scarce slots first; duds go to the scarcest slot too, it is least likely to be filled anyway).
// Rerolls (2): used when the spin has no scoring candidate; the expert picks the reroll kind (whole / club only / season only)
// with the highest chance of a scoring candidate, computed exactly over weighted candidates.
// Model "fan": knows the condition only; takes a gate player when one is on the wheel, otherwise a random player; rerolls when
// the gate is still open and no gate player is on the wheel.
const R='/home/user/upl-30-0/';
const E=require(R+'lib/engine.js'),V=require(R+'lib/vd_core.js'),CUR=require(R+'lib/vd_current.json');
E.setFormat('classic');
const D=E.DATA,A=D.alias||{},canon=id=>A[id]||id,IDX=V.vdIndex(D,CUR);
const SLOTS=E.FORMATIONS['4-4-2'].slots;
const lineOf=p=>V.VD_LINE[p[6]]||V.VD_LINE[p[1]];
// card table
const CARDS=[];D.clubs.forEach((c,ci)=>c.pl.forEach(p=>{const sl=SLOTS.map(s=>E.effRating(p,s)!=null);if(sl.some(Boolean))CARDS.push({ci,p,k:canon(p[5]),line:lineOf(p),sl});}));
const byClub=D.clubs.map(()=>[]);for(const x of CARDS)byClub[x.ci].push(x);
let rs=12345;const rnd=()=>{rs=(rs*1664525+1013904223)>>>0;return rs/4294967296;};
const pickW=c=>{let t=0;for(const x of c)t+=D.clubs[x].w;let r=rnd()*t;for(const x of c){r-=D.clubs[x].w;if(r<=0)return x;}return c[c.length-1];};
const yearsOf={},clubsOfY={};D.clubs.forEach((c,i)=>{(yearsOf[c.c]=yearsOf[c.c]||[]).push(i);(clubsOfY[c.y]=clubsOfY[c.y]||[]).push(i);});
const ALL=D.clubs.map((c,i)=>i);

function prep(ch){const parts=V.vdParts(ch),ev=ch.eventPlayer?canon(ch.eventPlayer):null;
  const f=CARDS.map(x=>{const q=IDX[x.k];const ok=parts.map(pt=>x.k!==ev&&V.vdMatch(pt,q,x.line));const b=x.k===ev||(!!ch.bonus&&V.vdMatch(ch.bonus,q,x.line));return {ok,req:ok.some(Boolean),bon:b,sc:ok.some(Boolean)||b};});
  const cov=SLOTS.map((s,j)=>CARDS.reduce((a,x,i)=>a+(f[i].sc&&x.sl[j]?1:0),0));
  return {parts,ev,f,cov,need:parts.map(p=>p.count||1)};}
const IX=new Map();CARDS.forEach((x,i)=>IX.set(x,i));

function draft(ch,P,mode){const open=SLOTS.map(()=>true),taken=new Set(),xi=[];
  if(P.ev){const e=V.vdEventCard(ch,D);let bj=-1,br=-1;SLOTS.forEach((s,j)=>{const r=E.effRating(e.p,s);if(r!=null&&r>br){br=r;bj=j;}});
    const ci=D.clubs.indexOf(e.c);const x=byClub[ci].find(y=>y.p===e.p);open[bj]=false;taken.add(P.ev);xi.push({x,j:bj});}
  const seq=E.wheelSeq(Math.floor(rnd()*2147483647));let ptr=0,rr=2;
  const got=P.parts.map(()=>0);
  const cand=ci=>{const o=[];for(const x of byClub[ci]){if(taken.has(x.k))continue;const fi=P.f[IX.get(x)];for(let j=0;j<SLOTS.length;j++)if(open[j]&&x.sl[j])o.push({x,fi,j});}return o;};
  const gateGain=fi=>{for(let a=0;a<P.parts.length;a++)if(fi.ok[a]&&got[a]<P.need[a])return a;return -1;};
  const goodC=o=>mode==='fan'?o.filter(c=>gateGain(c.fi)>=0):o.filter(c=>c.fi.sc);
  const pGood=list=>{let t=0,g=0;for(const ci of list){const o=cand(ci);if(!o.length)continue;const w=D.clubs[ci].w;t+=w;if(goodC(o).length)g+=w;}return t?g/t:0;};
  while(open.some(Boolean)){let ci=-1;while(ptr<seq.length){const c=seq[ptr++];if(cand(c).length){ci=c;break;}}
    if(ci<0)break;
    let o=cand(ci);
    while(!goodC(o).length&&rr>0&&(mode!=='fan'||got.some((g,a)=>g<P.need[a]))){rr--;
      const W=D.clubs[ci],opts=[['both',ALL],['club',clubsOfY[W.y]],['year',yearsOf[W.c]]].map(([k,l])=>[k,l.filter(i=>i!==ci&&cand(i).length)]).filter(z=>z[1].length);
      let pick=opts[0];if(mode!=='fan'){let bp=-1;for(const z of opts){const p=pGood(z[1]);if(p>bp){bp=p;pick=z;}}}else pick=opts[Math.floor(rnd()*opts.length)];
      ci=pickW(pick[1]);o=cand(ci);}
    let c;
    if(mode==='fan'){const g=o.filter(c=>gateGain(c.fi)>=0);c=g.length?g[Math.floor(rnd()*g.length)]:o[Math.floor(rnd()*o.length)];}
    else{const score=c=>(gateGain(c.fi)>=0?2e6:0)+(c.fi.sc?1e6:0)-(c.fi.sc?P.cov[c.j]:-P.cov[c.j]);
      // dud: put into the slot with fewest scoring cards (score above prefers high cov for duds? no: duds go to scarce slots)
      const s2=c=>(gateGain(c.fi)>=0?2e6:0)+(c.fi.sc?1e6:0)-P.cov[c.j];
      c=o.reduce((a,b)=>s2(b)>s2(a)?b:a);}
    const a=gateGain(c.fi);if(a>=0)got[a]++;
    open[c.j]=false;taken.add(c.x.k);xi.push({x:c.x,j:c.j});}
  return xi;}
function evalXi(ch,xi){return V.vdEval(ch,xi.map(({x})=>({id:x.p[5],line:x.line})),IDX,A);}
function calib(ch,N=2000,seed=777,FN=N){rs=seed;const P=prep(ch);let g=0,s11=0,s9=0,sum=0,fg=0;
  for(let i=0;i<N;i++){const r=evalXi(ch,draft(ch,P,'expert'));if(r.gate){g++;sum+=r.score;if(r.score>=11)s11++;if(r.score>=9)s9++;}}
  for(let i=0;i<FN;i++){const r=evalXi(ch,draft(ch,P,'fan'));if(r.gate)fg++;}
  // people counts
  const lines={};for(const x of CARDS)(lines[x.k]=lines[x.k]||new Set()).add(x.line);
  const LN=['GK','DF','MF','FW'];const cnt=c=>{let n=0;for(const k in IDX){const ls=lines[k]?[...lines[k]]:LN;if(ls.some(l=>V.vdMatch(c,IDX[k],l)))n++;}return n;};
  const req=P.parts.map(cnt),bon=ch.bonus?cnt(ch.bonus):0;
  let uni=0;for(const k in IDX){if(k===P.ev)continue;const ls=lines[k]?[...lines[k]]:LN;if(ls.some(l=>P.parts.some(pt=>V.vdMatch(pt,IDX[k],l))||(ch.bonus&&V.vdMatch(ch.bonus,IDX[k],l))))uni++;}
  return {req,bon,uni,pGate:g/N,p11:s11/N,p9:s9/N,avg:g?sum/g:0,pGateFan:FN?fg/FN:null};}
module.exports={calib,IDX,D,E,V,canon,CARDS};
if(require.main===module){const L=require(process.argv[2]||R+'lib/challenges.json');const N=+process.argv[3]||1000;
  for(const ch of L){const r=calib(ch,N);console.log(ch.day,ch.title.padEnd(34),'req',r.req.join('+'),'bon',r.bon,'uni',r.uni,'gate',(100*r.pGate).toFixed(0)+'%','fan',(100*r.pGateFan).toFixed(0)+'%','11/11',(100*r.p11).toFixed(0)+'%','9+',(100*r.p9).toFixed(0)+'%','avg',r.avg.toFixed(1));}}
