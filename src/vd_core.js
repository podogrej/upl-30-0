// ---------- Daily challenge (vd_*) rules. Shared by the site (build.py inlines it) and the server (lib/vd_core.js, api/_vd.js).
// Pure functions over the pool (DATA) and one challenge from lib/challenges.json; no DOM, no global state.
// A person "played for club X" when the pool has a club-season row of X for him with apps >= 1 (UPL seasons only; zero-app rows are ignored).
const VD_ATTEMPTS=5,VD_MEDALS=[[11,'perfect','Ідеально','⭐'],[9,'gold','Золото','🥇'],[6,'silver','Срібло','🥈'],[4,'bronze','Бронза','🥉']];
const VD_LINE={GK:'GK',CB:'DF',RB:'DF',LB:'DF',RWB:'DF',LWB:'DF',DF:'DF',CDM:'MF',CM:'MF',CAM:'MF',RM:'MF',LM:'MF',MF:'MF',RW:'FW',LW:'FW',ST:'FW',FW:'FW'};
// person index: canonical id -> {apps, clubs:{code:apps}, nat (name or null), n}
function vdIndex(DATA){const A=DATA.alias||{},out={};
  for(const c of DATA.clubs)for(const p of c.pl){if(!(p[3]>=1))continue;const k=A[p[5]]||p[5];const q=out[k]||(out[k]={apps:0,clubs:{},nat:null,n:p[0]});
    q.apps+=p[3];q.clubs[c.c]=(q.clubs[c.c]||0)+p[3];if(p[10]!=null&&DATA.nats&&DATA.nats[p[10]])q.nat=DATA.nats[p[10]];}
  return out;}
// one condition against a person (q from vdIndex) and the drafted card line (GK/DF/MF/FW)
function vdMatch(c,q,line){if(!c||!q)return false;const p=c.params||{};
  switch(c.type){
    case 'club':return (q.clubs[p.club]||0)>=1;
    case 'clubs_any':return (p.clubs||[]).some(x=>(q.clubs[x]||0)>=1);
    case 'club_apps_min':return (q.clubs[p.club]||0)>=p.n;
    case 'nationality':return p.nats?(p.nats.includes(q.nat)):(!!q.nat&&!(p.except||[]).includes(q.nat));
    case 'clubs_count_min':return Object.keys(q.clubs).length>=p.n;
    case 'apps_total_min':return q.apps>=p.n;
    case 'line':return (p.lines||[]).includes(line)!==!!p.not;
    case 'and':return (c.of||[]).every(x=>vdMatch(x,q,line));
    case 'or':return (c.of||[]).some(x=>vdMatch(x,q,line));
    case 'not':return !vdMatch(c.of,q,line);
  }return false;}
const vdParts=ch=>ch.required.parts||[ch.required];
// largest assignment of players to required parts (each player fills at most one slot of one part); small brute force: <= 11 players
function vdAssign(parts,ok){const need=parts.map(p=>p.count||1),got=parts.map(()=>[]);let best=null,bestN=-1;
  const n=ok.length;(function rec(i,cnt){if(cnt+Math.min(n-i,need.reduce((a,x,j)=>a+Math.max(0,x-got[j].length),0))<=bestN)return;
    if(i===n){if(cnt>bestN){bestN=cnt;best=got.map(a=>a.slice());}return;}
    for(let j=0;j<parts.length;j++)if(ok[i][j]&&got[j].length<need[j]){got[j].push(i);rec(i+1,cnt+1);got[j].pop();}
    rec(i+1,cnt);})(0,0);
  return best||parts.map(()=>[]);}
// xi: [{id, line}] -> {gate, have, need, score, parts:[{have,need,ids}], rows:[{id, req, bonus, event}]}
// event player never counts for the required condition, always counts in the score
function vdEval(ch,xi,idx,alias){const A=alias||{},parts=vdParts(ch),ev=ch.eventPlayer?(A[ch.eventPlayer]||ch.eventPlayer):null;
  const rows=xi.map(x=>{const k=A[x.id]||x.id,q=idx[k],event=!!ev&&k===ev;
    const ok=parts.map(pt=>!event&&vdMatch(pt,q,x.line));return {id:x.id,event,ok,req:ok.some(Boolean),bonus:event||(!!ch.bonus&&vdMatch(ch.bonus,q,x.line))};});
  const as=vdAssign(parts,rows.map(r=>r.ok));const need=parts.reduce((a,p)=>a+(p.count||1),0),have=as.reduce((a,x)=>a+x.length,0);
  return {gate:have>=need,have,need,score:rows.filter(r=>r.req||r.bonus).length,
    parts:parts.map((p,j)=>({need:p.count||1,have:as[j].length,ids:as[j].map(i=>rows[i].id)})),rows:rows.map(({ok,...r})=>r)};}
const vdMedal=s=>{for(const m of VD_MEDALS)if(s>=m[0])return {at:m[0],k:m[1],n:m[2],e:m[3]};return null;};
// card the event player stands with: his strongest UPL card (ties: latest season)
function vdEventCard(ch,DATA){if(!ch||!ch.eventPlayer)return null;const A=DATA.alias||{},ev=A[ch.eventPlayer]||ch.eventPlayer;let best=null;
  for(const c of DATA.clubs)for(const p of c.pl)if((A[p[5]]||p[5])===ev&&p[3]>=1&&(!best||p[2]>best.p[2]||(p[2]===best.p[2]&&c.y>best.c.y)))best={c,p};
  return best;}
const vdFind=(list,day)=>(list||[]).find(x=>x.day===day)||null;
if(typeof module!=='undefined'&&module.exports)module.exports={VD_ATTEMPTS,VD_MEDALS,VD_LINE,vdIndex,vdMatch,vdEval,vdMedal,vdEventCard,vdFind,vdParts};
