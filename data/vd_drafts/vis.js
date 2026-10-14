// "By card" player model (DECISIONS 18): knows only the drafted card (its club-season club, line) and nationality; no career history or apps totals.
// Run: node data/vd_drafts/vis.js <challenges.json> [N]   (sim.js is the "expert" model)
const M=require('./sim.js');const {D,V,CARDS,canon,IDX}=M;
const E=M.E,SLOTS=E.FORMATIONS['4-4-2'].slots,A=D.alias||{};
let rs=1;const rnd=()=>{rs=(rs*1664525+1013904223)>>>0;return rs/4294967296;};
const byClub=D.clubs.map(()=>[]);for(const x of CARDS)byClub[x.ci].push(x);
function run(ch,N){const parts=V.vdParts(ch),ev=ch.eventPlayer?canon(ch.eventPlayer):null,need=parts.map(p=>p.count||1);
  const vis=x=>{const q=IDX[x.k]||{};const qv={apps:0,clubs:{[D.clubs[x.ci].c]:1},nat:q.nat};const ok=parts.map(pt=>x.k!==ev&&V.vdMatch(pt,qv,x.line));return {ok,sc:ok.some(Boolean)||x.k===ev||(!!ch.bonus&&V.vdMatch(ch.bonus,qv,x.line))};};
  const F=new Map(CARDS.map(x=>[x,vis(x)]));let s11=0,s9=0,sum=0,g=0;rs=4242;
  for(let i=0;i<N;i++){const open=SLOTS.map(()=>true),taken=new Set(),xi=[];
    if(ev){const e=V.vdEventCard(ch,D);let bj=-1,br=-1;SLOTS.forEach((s,j)=>{const r=E.effRating(e.p,s);if(r!=null&&r>br){br=r;bj=j;}});open[bj]=false;taken.add(ev);xi.push({id:e.p[5],line:V.VD_LINE[e.p[6]]||V.VD_LINE[e.p[1]]});}
    const seq=E.wheelSeq(Math.floor(rnd()*2147483647));let ptr=0,rr=2;const got=parts.map(()=>0);
    const cand=ci=>{const o=[];for(const x of byClub[ci]){if(taken.has(x.k))continue;for(let j=0;j<SLOTS.length;j++)if(open[j]&&x.sl[j])o.push({x,f:F.get(x),j});}return o;};
    while(open.some(Boolean)){let ci=-1;while(ptr<seq.length){const c=seq[ptr++];if(cand(c).length){ci=c;break;}}if(ci<0)break;
      let o=cand(ci);while(!o.some(c=>c.f.sc)&&rr>0){rr--;let c2=-1;while(ptr<seq.length){const c=seq[ptr++];if(cand(c).length){c2=c;break;}}if(c2<0)break;o=cand(c2);}
      const gg=c=>c.f.ok.some((v,a)=>v&&got[a]<need[a]);
      const c=o.reduce((a,b)=>{const s=z=>(gg(z)?2:0)+(z.f.sc?1:0);return s(b)>s(a)?b:a;});
      c.f.ok.forEach((v,a)=>{if(v&&got[a]<need[a]){got[a]++;}});open[c.j]=false;taken.add(c.x.k);xi.push({id:c.x.p[5],line:c.x.line});}
    const r=V.vdEval(ch,xi,IDX,A);if(r.gate){g++;sum+=r.score;if(r.score>=11)s11++;if(r.score>=9)s9++;}}
  return {gate:g/N,p11:s11/N,p9:s9/N,avg:g?sum/g:0};}
module.exports={run};
if(require.main===module){const L=require(process.argv[2]);const N=+process.argv[3]||400;for(const ch of L){const r=run(ch,N);console.log(ch.day,ch.title.padEnd(32),'vis gate',(100*r.gate).toFixed(0)+'%','11/11',(100*r.p11).toFixed(0)+'%','9+',(100*r.p9).toFixed(0)+'%','avg',r.avg.toFixed(1));}}
