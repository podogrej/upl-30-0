// ---------- Daily challenge UI (vd_*): home card, attempt flow, brief and sticky bar on the draft, not-counted screen, result block, archive.
// Rules live in vd_core.js (shared with the server); content in lib/challenges.json (inlined by build.py as VD_LIST).
// Attempt: issued by the server (api/_vd.js via /api/seed) when the draft opens; finished when the XI is complete (condition missed: burns)
// or on Play season (condition met: the server fixes the squad and returns the season seed). Offline: local attempt count and seed.
const VD_LIST=/*__VD_LIST__*/[];
const VD_DAY=(typeof window.__vdToday==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(window.__vdToday))?window.__vdToday:DAY;   // test hook: pretend another day is today
let VD_IDX=null;const vdIdx=()=>VD_IDX||(VD_IDX=vdIndex(DATA));
const vdCh=day=>vdFind(VD_LIST,day);
const VD_SRV={};   // own results from the server (archive): day -> {used, best}
function vdSt(day){const s=lsGet('upl30_vd_'+day)||{};return {used:s.used||0,best:s.best??null,tries:s.tries||[],open:s.open||null};}
function vdState(day){const a=vdSt(day),b=VD_SRV[day];if(!b)return a;const bs=[a.best,b.best].filter(x=>x!=null);return {...a,used:Math.max(a.used,b.used||0),best:bs.length?Math.max(...bs):null};}
const VD_EM=/^(\p{Extended_Pictographic}️?)\s*/u;
const vdSplit=t=>{const m=VD_EM.exec(t||'');return m?[m[1],t.slice(m[0].length)]:['',String(t||'')];};
const VD_MON=['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];
const VD_MONTH=['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const VD_WD=['нд','пн','вт','ср','чт','пт','сб'];
const vdDate=d=>`${+d.slice(8,10)} ${VD_MON[+d.slice(5,7)-1]}`;
// any club condition: show the shared note that a club's player is anyone with a UPL match for it
const vdClubIn=c=>!!c&&(c.type==='club'||[...(c.of||[]),...(c.parts||[])].some(vdClubIn));
const VD_CLUB_NOTE='Гравець клубу — нинішній чи колишній: будь‑хто, хто зіграв за нього хоча б один матч в УПЛ.';
const vdClubNote=(ch,cls)=>vdClubIn(ch.required)||vdClubIn(ch.bonus)?`<span class="${cls}">${VD_CLUB_NOTE}</span>`:'';
const vdNo=ch=>[...new Set([ch.required.no,ch.bonus&&ch.bonus.no].filter(Boolean))].join(' · ')||'Не підходить';
function vdMedals(best){return `<span class="vmst" role="img" aria-label="Медалі: бронза — 4, срібло — 6, золото — 9, ідеально — 11 з 11">${[...VD_MEDALS].reverse().map(([t,,,e])=>`<span class="${best!=null&&best>=t?'got':''}"><i>${e}</i>${t}</span>`).join('')}</span>`;}
// time to the next Kyiv midnight, hours and minutes
function vdLeft(){try{const f=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const h=+f.find(x=>x.type==='hour').value,m=+f.find(x=>x.type==='minute').value,l=24*60-(h*60+m);return `${Math.floor(l/60)} г ${l%60} хв`;}catch(e){return '';}}
async function vdApi(body){const ctl=typeof AbortController!=='undefined'?new AbortController():null;const tm=setTimeout(()=>ctl&&ctl.abort(),6000);
  try{const r=await _fetch('/api/seed',{method:'POST',headers:{'Content-Type':'application/json'},signal:ctl&&ctl.signal,body:JSON.stringify({device_id:deviceId(),secret:devSecret(),...body})});
    const j=await r.json().catch(()=>({}));return {...j,status:r.status};}finally{clearTimeout(tm);}}
function vdMerge(day,j){if(!j||j.used==null)return;const st=vdSt(day),bs=[st.best,j.best].filter(x=>x!=null);
  lsSet('upl30_vd_'+day,{used:Math.max(st.used,j.used),best:bs.length?Math.max(...bs):null,tries:st.tries,open:st.open});}
// open attempt progress (picked players, wheel pointer and seed, rerolls, current wheel): reopening resumes it exactly instead of a fresh draft on a known wheel
function vdSave(){const v=S.vd;if(!v||v.fin||!v.seq)return;const st=vdSt(v.day);
  lsSet('upl30_vd_'+v.day,{...st,open:{a:v.attempt,sid:v.seedId||null,ws:v.ws,ptr:v.ptr,rr:S.rerolls,w:S.wheel?DATA.clubs.indexOf(S.wheel):-1,sl:S.slots.map(x=>x.player)}});}
function vdRestore(v){const o=vdSt(v.day).open;if(!o||o.a!==v.attempt||(o.sid||null)!==(v.seedId||null)||!Array.isArray(o.sl)||o.sl.length!==S.slots.length)return;
  S.slots.forEach((x,i)=>{x.player=o.sl[i]||null;});S.taken=new Set(S.slots.filter(x=>x.player).map(x=>canon(x.player.id)));
  v.ws=o.ws;v.seq=wheelSeq(o.ws);v.ptr=o.ptr||0;S.rerolls=o.rr??S.rerolls;S.wheel=o.w>=0?DATA.clubs[o.w]:null;S.wheelFresh=false;}

// ---- header streak
function stkRender(){const el=document.getElementById('stkChip');if(!el)return;const n=streakInfo().count;el.hidden=n<1;
  if(n>=1){el.innerHTML=`${ic('fire')}${n} ${plUk(n,'день','дні','днів')}`;el.title=`Серія виклику дня: ${n} ${plUk(n,'день','дні','днів')} поспіль`;}}

// ---- home card: new / in progress (best medal) / done (timer to the next one); no challenge today: "coming soon"
function renderVdCard(){const box=document.getElementById('vdBox');if(!box)return;stkRender();const ch=vdCh(VD_DAY);
  if(!ch){box.innerHTML=`<div class="evc soon"><span class="e1"><span class="lb">Виклик дня</span></span><span class="e3">Новий виклик скоро.</span></div>`;return;}
  const st=vdState(VD_DAY),done=st.used>=VD_ATTEMPTS||st.best===11,k=done?'done':st.used?'progress':'new';
  const af=k==='new'?'Зібрати склад':k==='progress'?(st.best!=null?'Покращити':'Ще спроба'):'Переглянути';
  const m=st.best!=null&&vdMedal(st.best),[em,tt]=vdSplit(ch.title);
  const res=st.best!=null?`<span class="evr"><span class="mm" aria-hidden="true">${m?m.e:ic('check-circle')}</span><b>${st.best}/11</b><span>краща спроба</span></span>`
    :st.used?`<span class="evr no"><span>Не зараховано · ${done?'спроби закінчились':`спроба ${st.used} з ${VD_ATTEMPTS}`}</span></span>`:'';
  box.innerHTML=`<button class="evc ${k}" id="vdCard" type="button"><span class="e1"><span class="lb">Виклик дня</span><span class="af">${af}${ic('chevron-right')}</span></span>`
    +`<span class="e2">${em?`<span class="em" aria-hidden="true">${em}</span>`:''}<span>${esc(tt)}</span></span><span class="e3">${esc(ch.task)}</span>${res}<span class="e4">${vdMedals(st.best)}</span>`
    +(done?`<span class="evt">${ic('timer-sand')}<span id="vdLeft">Новий виклик через ${vdLeft()}</span></span>`:'')+`</button>`;
  document.getElementById('vdCard').onclick=()=>done?openVdArchive():vdOpen(VD_DAY,'#vdCard');}
setInterval(()=>{const el=document.getElementById('vdLeft');if(el&&CUR_SEC===1)el.textContent='Новий виклик через '+vdLeft();},30e3);

// ---- attempt: draft with the event player already on the pitch; the server issues (or resumes) the attempt
function vdOpen(day,from){const ch=vdCh(day);if(!ch)return;const st=vdState(day);
  if(st.used>=VD_ATTEMPTS){openVdArchive('Спроби на цей день закінчились.');return;}
  S.league=null;S.challenge=null;S.chal=null;S.result=null;setFmt('classic');S.mode='normal';S.formation=FORMATIONS[ch.formation]?ch.formation:'4-4-2';
  S.slots=newSlots(S.formation);S.taken=new Set();S.wheel=null;S.rerolls=MODES.normal.rerolls;S.showR=false;S.moveMode=false;S.pending=null;S.move=null;
  const v=S.vd={day,ch,late:day<VD_DAY,attempt:st.used+1,seq:null,ptr:0,wait:null,fin:null,seedId:null};
  const ev=vdEventCard(ch,DATA);
  if(ev){const p=ev.p,b=bestSlot(p);if(b){const s=b.s;s.player={name:p[0],pos:GROUP_OF[s.slot],slot:s.slot,main:p[6],alts:p[7],r:effRating(p,s.slot),r0:p[2],apps:p[3],goals:p[4],ast:p[8],cs:p[9],nat:p[10],by:p[11],cc:ev.c.c,id:p[5],club:ev.c.n,y:ev.c.y,ev:vdSplit(ch.title)[0]||'★'};S.taken.add(canon(p[5]));}}
  document.getElementById('modeLabel').textContent=`Виклик дня · ${S.formation}`;
  v.wait=vdStart(v).then(()=>{v.wait=null;if(S.vd!==v)return;if(v.over){S.vd=null;openVdArchive('Спроби на цей день закінчились.');return;}renderDraft();if(S.slots.every(x=>x.player))setTimeout(vdComplete,0);});
  renderDraft();go(2,false,from);}
async function vdStart(v){let seed=null;   // online: the wheel comes from the attempt (server checks the XI against it)
  if(ONLINE){try{const j=await vdApi({vd:'start',day:v.day});
      if(j.attempt){v.attempt=j.attempt;v.seedId=j.seed_id;seed=hashStr(String(j.seed_id)+'|wheel');vdMerge(v.day,j);}   // same attempt -> same wheel
      else if(j.status===409){vdMerge(v.day,{...j,used:VD_ATTEMPTS});v.over=true;}}catch(e){}}
  v.ws=seed||Math.floor(Math.random()*2147483647);v.seq=wheelSeq(v.ws);if(!v.over)vdRestore(v);}
const vdXi=()=>S.slots.filter(s=>s.player).map(s=>({id:s.player.id,line:VD_LINE[s.player.main]||s.player.pos,p:s.player}));
function vdEvalNow(){const xi=vdXi(),e=vdEval(S.vd.ch,xi,vdIdx(),DATA.alias);e.xi=xi;return e;}
// XI complete: condition met -> forecast and Play season; missed -> the attempt burns, no season
function vdComplete(){const v=S.vd;if(!v||S.locked||S.locking||v.fin)return;const e=vdEvalNow();
  if(e.gate){lockDraft();return;}
  vdFinish(v,e).then(f=>{if(S.vd!==v)return;if(f.gate)lockDraft();else vdFailShow(f);});}
// finish once per attempt: server verdict (score computed there) or local one offline; local record, streak, home card
function vdFinish(v,e){if(v.fin)return v.fin;return v.fin=(async()=>{let j=null;
  if(ONLINE&&v.seedId){try{j=await vdApi({vd:'finish',day:v.day,attempt:v.attempt,formation:S.formation,xi:S.slots.map(s=>({id:s.player.id,slot:s.slot,c:s.player.club,y:s.player.y}))});if(j.status>=300)j=null;}catch(x){j=null;}}
  const gate=j?!!j.gate:e.gate,score=j?j.score:e.score,st=vdSt(v.day),late=j&&j.late!=null?!!j.late:v.late;   // late: the server's day decides (midnight)
  const first=gate&&!late&&!st.tries.some(x=>x.g&&!x.l);   // first counted attempt of today: streak and the trophy counter
  const tries=[...st.tries.filter(x=>x.a!==v.attempt),{a:v.attempt,g:gate,s:score,l:late}];
  const bs=[st.best,j&&j.best,...tries.filter(x=>x.g).map(x=>x.s)].filter(x=>x!=null);
  const used=Math.max(st.used,v.attempt,j&&j.used||0);
  lsSet('upl30_vd_'+v.day,{used,best:bs.length?Math.max(...bs):null,tries});
  const streak=first?streakUpdate():null;renderVdCard();if(typeof SESSION!=='undefined'&&SESSION)acctPush();
  return {gate,score,e,attempt:v.attempt,used,late,first,streak,seed:j&&j.seed?{seed:j.seed,seed_id:j.seed_id}:null};})();}

// ---- brief on the draft screen and the compact sticky bar
function vdBrief(){const el=document.getElementById('vdBrief'),bar=document.getElementById('vdBar'),v=S.vd;
  if(!v){if(!el.hidden){el.hidden=true;el.innerHTML='';}bar.innerHTML='';return;}
  vdSave();
  const ch=v.ch,rq=ch.required,e=vdEvalNow(),[em,tt]=vdSplit(ch.title),tot=MODES.normal.rerolls;
  const names=e.parts.flatMap(p=>p.ids).map(id=>{const x=e.xi.find(q=>q.id===id);return x?cardName(x.p.name):'';}).filter(Boolean);
  const pips=Array.from({length:VD_ATTEMPTS},(_,i)=>`<i class="${i+1<v.attempt?'u':i+1===v.attempt?'c':''}"></i>`).join('');
  el.hidden=false;el.classList.toggle('ok',e.gate);
  el.innerHTML=`<div class="bl"><p class="bk">Виклик дня · ${vdDate(v.day)}${v.late?' · архів':''}</p><h2 class="bh1">${em?`<span class="em" aria-hidden="true">${em}</span>`:''}<span>${esc(tt)}</span></h2><p class="bs1">${esc(ch.story)}</p></div>`
    +`<div class="br"><div class="rqx"><div class="rq1"><span class="tag-req">${e.gate?ic('check-circle'):''}Обовʼязково</span><span class="cnt" aria-label="Виконано ${e.have} з ${e.need}">${e.have}<i>/${e.need}</i></span></div>`
    +`<b class="rq2">${esc(rq.label)}</b>${vdClubNote(ch,'cnote')}${names.length?`<p class="rq3">Зараховано: <b>${esc(names.join(', '))}</b></p>`:''}<div class="rqseg" aria-hidden="true" style="--n:${e.need}">${Array.from({length:e.need},(_,i)=>`<i class="${i<e.have?'on':''}"></i>`).join('')}</div></div>`
    +`<p class="bon1"><span class="lb">Бонус</span>${ch.bonus?`<span class="bv">${esc(ch.bonus.label)}</span><span class="bn">теж рахуються в N/11</span>`:`<span class="bn">рахуються всі, хто підходить під умову</span>`}</p>`
    +`<div class="meta"><div><small>Спроба</small><b>${v.attempt} з ${VD_ATTEMPTS}</b><span class="pips" aria-hidden="true">${pips}</span></div><div><small>Перекрутки</small><b>${Math.max(0,S.rerolls)} з ${tot}</b></div>`
    +`<div class="mm"><small>Медалі</small>${vdMedals(null)}</div></div></div>`;
  bar.innerHTML=`<div class="tx"><small>Обовʼязково</small><b><span class="cnt sm${e.gate?' ok':''}">${e.have}/${e.need}</span>${esc(rq.short||rq.label)}</b></div><div class="rt"><span>Спроба <b>${v.attempt}/${VD_ATTEMPTS}</b></span><span>Перекрутки <b>${Math.max(0,S.rerolls)}</b></span></div>`;
}
// S.vdOut: the brief scrolled above the header; miniSync shows the bar only on the draft screen
if(typeof IntersectionObserver!=='undefined')new IntersectionObserver(([x])=>{S.vdOut=!x.isIntersecting&&x.boundingClientRect.top<0;miniSync();},{rootMargin:'-60px 0px 0px 0px'}).observe(document.getElementById('vdBrief'));

// ---- why it did not count, squad breakdown
const VD_N=['','одного','двох','трьох','чотирьох','пʼятьох'];
function vdWhy(ch,e){const parts=vdParts(ch),miss=[];
  e.parts.forEach((p,j)=>{const k=p.need-p.have;if(k<=0)return;const w=parts[j].who||ch.required.who||{one:'гравця',many:'гравців'};miss.push(`ще ${VD_N[k]||k} ${k===1?w.one:w.many}`);});
  const ids=e.parts.flatMap(p=>p.ids),nm=ids.map(id=>{const x=e.xi.find(q=>q.id===id);return x?x.p.name:'';}).filter(Boolean);
  const tail=parts.length>1?'':nm.length?` — у складі тільки ${nm.join(', ')}`:' — у складі немає жодного';
  return `Бракує ${miss.join(' і ')}${tail}.`;}
function vdSquad(ch,e){const P=id=>e.xi.find(x=>x.id===id).p,bl=ch.bonus?esc(ch.bonus.label):'';
  const req=e.rows.filter(r=>r.req),bon=e.rows.filter(r=>!r.req&&r.bonus),no=e.rows.filter(r=>!r.req&&!r.bonus);
  const card=p=>`${esc(clubShort(p.club))} ${SEA_SHORT(p.y)}`;
  const row=(r,chips,sub)=>{const p=P(r.id);return `<li class="pr"><span class="pos ${GROUP_OF[p.slot]}">${POSNAME[p.slot]}</span><div><b>${esc(p.name)}</b>${chips?`<span class="cs">${chips}</span>`:''}<small>${sub}</small></div></li>`;};
  return `<div class="sqd"><div class="lab2">Склад · 11 гравців<span>рахується ${e.score}</span></div>`
    +`<section class="grp"><h3>Для умови<span class="cn2 ${e.gate?'ok':'lo'}">${e.have} з ${e.need}</span></h3><p>${esc(ch.required.label)}</p>`
    +(req.length?`<ul>${req.map(r=>row(r,`<span class="chip r">${ic('check-circle')}Умова</span>${r.bonus&&bl?`<span class="chip b">${bl}</span>`:''}`,card(P(r.id)))).join('')}</ul>`:'<p class="none">У складі — нікого.</p>')+`</section>`
    +(bon.length?`<details class="grp bg"><summary><span class="bh"><span class="h3">Бонус<span>${bon.length}</span></span><span class="bs">${bl?bl+': ':''}${bon.map(r=>esc(cardName(P(r.id).name))).join(', ')}</span></span><span class="more">${ic('chevron-right')}</span></summary><ul>${bon.map(r=>row(r,'',card(P(r.id)))).join('')}</ul></details>`:'')
    +(no.length?`<section class="grp nn"><h3>Не підійшли<span>${no.length}</span></h3><p>${esc(vdNo(ch).replace(/^./,c=>c.toUpperCase()))}</p><ul>${no.map(r=>row(r,'',card(P(r.id)))).join('')}</ul></section>`:'')+`</div>`;}

// ---- not counted (s11): one sentence why, what next, breakdown
function vdFailShow(f){const v=S.vd;if(!v)return;const ch=v.ch,e=f.e,[em,tt]=vdSplit(ch.title),left=VD_ATTEMPTS-f.used,m=vdMedal(e.score);haptic('warning');
  document.getElementById('vdFail').innerHTML=`<div class="rs"><p class="at">${em?`<span class="em" aria-hidden="true">${em}</span>`:''}${esc(tt)} · спроба ${f.attempt} з ${VD_ATTEMPTS}</p><h1 class="no">Не зараховано</h1>`
    +`<p class="why2">${esc(vdWhy(ch,e))}</p><div class="gate bad"><span class="tag-req">Обовʼязково</span><div class="gb2"><span class="n no">${e.have}/${e.need}</span><b>${esc(ch.required.label)}</b></div>${vdClubNote(ch,'cnote')}</div>`
    +`<section class="next2"><b>${left>0?'Що далі':'Це була остання спроба'}</b><p>${left>0?`Ця спроба витрачена, але в тебе ще ${left} ${plUk(left,'спроба','спроби','спроб')} з ${VD_ATTEMPTS}. Умова та сама: ${esc(ch.required.label)}.`:`Спроб більше немає. ${v.late?'Інші дні — в архіві.':'Новий виклик — завтра.'}`}</p>`
    +(m?`<p class="would">Без умови було б ${e.score} з 11 — це ${m.e}, але така спроба не рахується.</p>`:'')+`</section>${vdSquad(ch,e)}</div>`
    +`<div class="rs-ft">${left>0?`<button class="primary big0" id="vdAgain" type="button">${ic('restart')}Спроба ${f.attempt+1} з ${VD_ATTEMPTS}</button><p class="fine">${MODES.normal.rerolls} перекрутки на спробу · сезон не грається</p>`:`<button class="primary big0" id="vdToArch" type="button">До викликів</button>`}</div>`;
  const a=document.getElementById('vdAgain'),b=document.getElementById('vdToArch');if(a)a.onclick=()=>vdOpen(v.day);if(b)b.onclick=()=>openVdArchive();
  go(11);}

// ---- counted attempt: block above the season result
function vdResult(r){const el=document.getElementById('vdRes'),f=r.vd,v=S.vd;if(!f||!v){el.hidden=true;el.innerHTML='';return;}
  const ch=v.ch,[em,tt]=vdSplit(ch.title),m=vdMedal(f.score),st=vdSt(v.day),left=VD_ATTEMPTS-f.used,nx=[...VD_MEDALS].reverse().find(x=>x[0]>f.score);
  el.hidden=false;
  el.innerHTML=`<p class="at">${em?`<span class="em" aria-hidden="true">${em}</span>`:''}${esc(tt)} · спроба ${f.attempt} з ${VD_ATTEMPTS}</p>`
    +`<h2 class="vh">${m?`<span class="em" aria-hidden="true">${m.e}</span>${m.n}`:'Зараховано'}</h2><p class="sub2">Виклик зараховано · ${f.score} з 11 гравців${st.best!=null&&st.best>f.score?` · краща спроба ${st.best}/11`:''}${v.late?' · з архіву, без серії':''}</p>`
    +`<div class="lad">${[...VD_MEDALS].reverse().map(([t,k,n,e])=>`<div class="med${f.score>=t?' got':''}${m&&m.k===k?' cur':''}"><span aria-hidden="true">${e}</span>${t}<small>${n}</small></div>`).join('')}</div>`
    +(nx?`<p class="vnext">До «${nx[2]}» ще ${nx[0]-f.score} ${plUk(nx[0]-f.score,'гравець','гравці','гравців')}</p>`:'')
    +`<details class="vsq"><summary>Хто рахується</summary>${vdSquad(ch,f.e)}</details>`
    +(left>0&&(st.best??0)<11?`<button class="ghost" id="vdMore" type="button">${ic('restart')}Покращити · спроба ${f.attempt+1} з ${VD_ATTEMPTS}</button>`:'');
  const b=document.getElementById('vdMore');if(b)b.onclick=()=>vdOpen(v.day);}

// ---- archive (s10): today on top, past days by month; a missed day can be played later (no streak)
async function vdMine(){if(!ONLINE||vdMine.p)return vdMine.p;return vdMine.p=(async()=>{try{const j=await vdApi({vd:'mine',from:VD_LIST.length?VD_LIST[0].day:null});
    for(const d of j.days||[])VD_SRV[d.day]={used:d.attempts,best:d.best};}catch(e){vdMine.p=null;}})();}
function vdTile(ch,today){const st=vdState(ch.day),[em,tt]=vdSplit(ch.title),d=new Date(ch.day+'T12:00:00Z');let cls,res;
  if(st.best!=null){cls=st.best===11?'perfect':'got';res=`${st.best===11?ic('star'):''}${st.best}/11<em>${st.best===11?'Ідеально':st.used>=VD_ATTEMPTS?`${st.used}/${VD_ATTEMPTS}`:'Побий'}</em>`;}
  else if(st.used){cls='fail';res=`Не зараховано<em>${st.used}/${VD_ATTEMPTS}</em>`;}
  else{cls='todo';res=today?'Зібрати склад':'Пропущено';}
  const late=st.tries.length&&st.tries.every(x=>x.l);
  return `<button class="tc ${cls}${today?' tdy':''}" type="button" data-day="${ch.day}"${st.used>=VD_ATTEMPTS?' aria-disabled="true"':''}><span class="tc-h"><span>${VD_WD[d.getUTCDay()]} ${d.getUTCDate()}</span>${late?'<span>з архіву</span>':''}</span>`
    +`<span class="tc-i" aria-hidden="true">${em}</span><span class="tc-t">${esc(tt)}</span><span class="tc-r">${res}</span></button>`;}
function renderVdArchive(msg){const el=document.getElementById('vdArch'),today=vdCh(VD_DAY);
  const past=VD_LIST.filter(c=>c.day<VD_DAY).sort((a,b)=>a.day<b.day?1:-1),by=[];
  for(const c of past){const k=c.day.slice(0,7);let g=by.find(x=>x.k===k);if(!g)by.push(g={k,list:[]});g.list.push(c);}
  el.innerHTML=`<h2 class="lg-h" style="margin-top:var(--sp-4)">Виклик дня</h2><p class="lead1">Пропущені дні можна зіграти пізніше — серію тримає лише виклик у свій день.</p>${msg?`<p class="vmsg" role="status">${esc(msg)}</p>`:''}`
    +`<div class="vsec">Сьогодні</div>${today?`<div class="vgrid one">${vdTile(today,true)}</div>`:'<p class="muted">Новий виклик скоро.</p>'}`
    +(by.length?by.map(g=>`<div class="vsec">${VD_MONTH[+g.k.slice(5,7)-1]} ${g.k.slice(0,4)}</div><div class="vgrid">${g.list.map(c=>vdTile(c,false)).join('')}</div>`).join(''):'<p class="muted vempty">Минулі виклики зʼявляться тут.</p>');
  el.querySelectorAll('.tc[data-day]').forEach(b=>b.onclick=()=>{if(b.getAttribute('aria-disabled')==='true'){haptic('error');return;}vdOpen(b.dataset.day,`.tc[data-day="${b.dataset.day}"]`);});}
function openVdArchive(msg){renderVdArchive(msg);go(10);vdMine().then(()=>{if(CUR_SEC===10)renderVdArchive(msg);renderVdCard();});}
document.getElementById('vdArchGo').onclick=()=>openVdArchive();
renderVdCard();
