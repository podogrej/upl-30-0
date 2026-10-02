// ---------- 5×5 з друзями. Позиції спрощені: ВР / ЗХ / ПЗ / НП; гравець грає лише у своїй лінії.
// Драфт «по черзі» (A-B-A-B з одного колеса, взятий гравець зникає для всіх) або «кожен сам» (однакове колесо, склади можуть збігатися).
// 2 гравці — один матч; 3–10 — «кожен з кожним» і фінал двох найкращих. Нічия в матчі на вибування — пенальті.
// Усе випадкове в матчі йде від seed гри, щоб онлайн у всіх учасників вийшов однаковий результат.
// рушій матчу (F5_FORMS, f5Match, f5Winner…) — у src/five_core.js (0.63: спільний із сервером)
const F5_REROLLS=1, F5_MAX=10;
const F5_TEAMS=["ФК Диван","Динамо Двір","Шахтар Гаражний","Металіст Під'їзд","Зірка Району","Спартак Балкон","Арсенал Кухня","Олімпік Лавочка","Карпати Кава","Ворскла Вечір"];
let F5=null;
const f5G=p=>GROUP_OF[p[6]]||p[1];                     // лінія гравця: ВР/ЗХ/ПЗ/НП
const f5Open=t=>t.slots.filter(s=>!s.player);
const f5Fits=(t,p)=>f5Open(t).some(s=>s.slot===f5G(p));
const f5Label=t=>t.team||t.name;
function f5Rng(tag){return mulberry32((F5.seed^hashStr(tag))>>>0);}
// схема з бази (f5_players.form) — лише зі списку F5_FORMS, інакше «1-2-1» (запис у f5_* відкритий, туди можна вписати що завгодно)
const f5Form=x=>Object.prototype.hasOwnProperty.call(F5_FORMS,x)?x:'1-2-1';
function f5Team(name,team,form){return {name,team,form,slots:F5_FORMS[form].rows.flat().map(slot=>({slot,player:null})),rerolls:F5_REROLLS,taken:new Set()};}
function f5Seat(){const n=F5.teams.length;return F5.mode==='turns'?F5.pick%n:F5.solo;}   // по черзі: суворо A-B-A-B
function f5Taken(team){return F5.mode==='turns'?F5.takenAll:team.taken;}
function f5Eligible(cs,team){const tk=f5Taken(team);return cs.pl.filter(p=>!tk.has(canon(p[5]))&&f5Fits(team,p));}
function f5Spin(){
  const ti=f5Seat(),team=F5.teams[ti];let cs=null;
  const seq=F5.mode==='turns'?F5.seqAll:(F5.seqs[ti]=F5.seqs[ti]||{ptr:0});
  for(let g=0;g<3000&&!cs;g++){const c=DATA.clubs[F5.wheel[seq.ptr++%F5.wheel.length]];if(f5Eligible(c,team).length)cs=c;}
  F5.cs=cs;F5.curPtr=seq.ptr;f5Render();}
function f5Reroll(){const team=F5.teams[f5Seat()];if(team.rerolls<=0)return;team.rerolls--;
  const c=DATA.clubs.filter(c=>f5Eligible(c,team).length);F5.cs=pickWeighted(c,Math.random);f5Render();}
function f5Choose(p){const team=F5.teams[f5Seat()];const s=f5Open(team).find(s=>s.slot===f5G(p));if(s)f5Place(p,s);}
function f5Place(p,s){if(F5.online){f5OnPlace(p,s);return;}const ti=f5Seat(),team=F5.teams[ti],cs=F5.cs;
  s.player={name:p[0],id:p[5],slot:s.slot,r:p[2],apps:p[3],goals:p[4],club:cs.n,c:cs.c,y:cs.y};
  f5Taken(team).add(canon(p[5]));F5.cs=null;F5.pick++;
  const full=t=>t.slots.every(x=>x.player);
  if(F5.mode==='solo'&&full(team)){F5.solo++;F5.handoff=F5.solo<F5.teams.length;}
  if(F5.teams.every(full))F5.phase='ready';
  else if(F5.mode==='turns')F5.handoff=true;
  if(F5.phase==='draft'&&!F5.handoff){f5Spin();return;}
  f5Render();window.scrollTo({top:0});}
function f5Play(){
  const R=f5Rng('play'+(F5.replay||0));f5SetForm(F5.teams,R);
  const T=F5.teams,res={matches:[],final:null,table:null};
  if(T.length===2)res.final=f5Match(T[0],T[1],true,R);
  else{for(let i=0;i<T.length;i++)for(let j=i+1;j<T.length;j++)res.matches.push(f5Match(T[i],T[j],false,R));
    const st=T.map(t=>({t,p:0,w:0,d:0,l:0,gf:0,ga:0}));
    for(const m of res.matches){const a=st[T.indexOf(m.A)],b=st[T.indexOf(m.B)];a.gf+=m.ga;a.ga+=m.gb;b.gf+=m.gb;b.ga+=m.ga;
      if(m.ga>m.gb){a.p+=3;a.w++;b.l++;}else if(m.ga<m.gb){b.p+=3;b.w++;a.l++;}else{a.p++;b.p++;a.d++;b.d++;}}
    st.sort((x,y)=>y.p-x.p||(y.gf-y.ga)-(x.gf-x.ga)||y.gf-x.gf||T.indexOf(x.t)-T.indexOf(y.t));res.table=st;
    res.final=f5Match(st[0].t,st[1].t,true,R);}
  F5.res=res;F5.phase='live';f5Render();window.scrollTo({top:0});}
// ---------- живий матч: смуга 0'→40' іде 5 с, на кожному голі — пауза 1 с з автором і хвилиною
function f5Live(m,done){
  const bar=document.getElementById('f5Bar'),dot=document.getElementById('f5Dot'),min=document.getElementById('f5Min'),sa=document.getElementById('f5Sa'),sb=document.getElementById('f5Sb'),goal=document.getElementById('f5Goal');
  const RUN=5000,PAUSE=1000;let t0=null,paused=0,gi=0,a=0,b=0,stop=false;
  F5.skip=()=>{stop=true;finish();};
  function finish(){sa.textContent=m.ga;sb.textContent=m.gb;bar.style.width='100%';dot.style.left='100%';min.textContent="40'";goal.hidden=true;done();}
  function frame(ts){if(stop)return;if(t0==null)t0=ts;const el=ts-t0-paused;const mm=Math.min(40,el/RUN*40);
    const next=m.ev[gi];
    if(next&&mm>=next.min){const at=next.min/40*100;bar.style.width=at+'%';dot.style.left=at+'%';min.textContent=next.min+"'";
      if(next.side===0)a++;else b++;sa.textContent=a;sb.textContent=b;
      goal.hidden=false;goal.className='f5goal s'+next.side;goal.innerHTML=`${ic('soccer','sm')}<b>${next.min}'</b> ${esc(next.sc.name)}${next.as?`<span class="muted"> · пас ${esc(next.as.name)}</span>`:''} <span class="muted">(${esc(f5Label(next.side?m.B:m.A))})</span>`;
      gi++;const p0=performance.now();setTimeout(()=>{paused+=performance.now()-p0;requestAnimationFrame(frame);},PAUSE);return;}
    const pc=mm/40*100;bar.style.width=pc+'%';dot.style.left=pc+'%';min.textContent=Math.floor(mm)+"'";
    if(mm>=40){finish();return;}requestAnimationFrame(frame);}
  requestAnimationFrame(frame);}
// ---------- інтерфейс
function f5Start(){go(5);f5StopPoll();const nick=myName();F5={phase:'setup',where:ONLINE?'online':'local',n:2,mode:'turns',names:Array.from({length:F5_MAX},(_,i)=>i===0?nick:''),teams_:Array(F5_MAX).fill(''),forms:Array(F5_MAX).fill('1-2-1')};f5Render();}
function f5Begin(){
  for(let i=0;i<F5.n;i++)if(!String(F5.names[i]||'').trim()){const el=document.querySelector(`[data-nm="${i}"]`);if(el){el.focus();el.classList.add('bad');}return;}
  if(F5.names[0])nickSet(F5.names[0]);
  F5.teams=Array.from({length:F5.n},(_,i)=>f5Team(F5.names[i].trim(),(F5.teams_[i]||'').trim(),F5.forms[i]));
  F5.seed=Math.floor(Math.random()*2147483647);const r=f5Rng('wheel');F5.wheel=[];for(let i=0;i<2000;i++)F5.wheel.push(DATA.clubs.indexOf(pickWeighted(DATA.clubs,r)));
  F5.seqAll={ptr:0};F5.seqs=[];F5.takenAll=new Set();F5.pick=0;F5.solo=0;F5.replay=0;F5.phase='draft';F5.handoff=true;F5.cs=null;f5Render();}
function f5Card(slot,p,body){return chipInner(F5_L[slot],p,body);}
function f5Pitch(team,opts={}){
  const F=F5_FORMS[team.form],n=F.rows.length,Y=n===4?[14,38.5,63,87]:[18,52,86];const X=k=>k===1?[50]:[30,70];let h=PITCH_MK,i=0;
  F.rows.forEach((row,ri)=>{const xs=X(row.length);row.forEach((slot,j)=>{const s=team.slots[i++];const p=s.player;
    const body=p?(opts.rt?{pill:avgPill(opts.rt(p).toFixed(1)),r0:p.r}:opts.reveal?{pill:rPill(p.r,true)}:{}):{};
    h+=`<div class="slot ${slot}${p?' filled':' empty'}" style="left:${xs[j]}%;top:${Y[ri]}%">${f5Card(slot,p,body)}</div>`;});});
  return `<div class="pitch p5">${h}</div>`;}
function f5Head(t){return `<b>${esc(f5Label(t))}</b>${t.team?` <span class="muted">· ${esc(t.name)}</span>`:''}`;}
function f5Render(){
  const el=document.getElementById('f5');if(!el||!F5)return;const f=F5;
  if(f.phase==='setup'){
    el.innerHTML=`<div class="daily"><div class="kicker">${ic('account-group','sm')}5×5 з друзями</div><div class="ttl">Збери п'ятірку з історії УПЛ і зіграй проти друзів</div>
      <p class="muted" style="margin:0">Воротар, захисник, півзахисник, нападник — лише у своїй лінії. Гра на одному пристрої: передавайте його по колу. Рейтинги приховані до матчу.</p></div>
      ${ONLINE?`<h3>Де граємо</h3><div class="grid modes f5w"><div class="opt${f.where==='online'?' on':''}" data-w="online"><b>Онлайн за посиланням</b><small>Кожен зі свого телефона. Створи кімнату й надішли друзям посилання.</small></div><div class="opt${f.where==='local'?' on':''}" data-w="local"><b>На одному пристрої</b><small>Усі поруч — передаєте телефон чи iPad по колу.</small></div></div>`:''}
      <h3>${f.where==='online'?'Скільки гравців максимум':'Скільки гравців'}</h3><div class="row f5cnt"><button class="ghost" id="f5Minus" ${f.n<=2?'disabled':''}>−</button><b class="f5num">${f.n}</b><button class="ghost" id="f5Plus" ${f.n>=F5_MAX?'disabled':''}>+</button><span class="muted">${f.n===2?'один матч, нічия — пенальті':'кожен з кожним, потім фінал двох найкращих'}</span></div>
      <h3>Як драфтимо</h3><div class="grid modes f5m"><div class="opt${f.mode==='turns'?' on':''}" data-m="turns"><b>По черзі</b><small>Одне колесо на всіх, по одному гравцю за хід. Кого взяв ти — вже не візьме ніхто.</small></div><div class="opt${f.mode==='solo'?' on':''}" data-m="solo"><b>Кожен сам</b><small>У всіх однакове колесо. Збираєте склади по черзі, можна взяти тих самих гравців.</small></div></div>
      <h3>${f.where==='online'?'Ти':'Учасники'}</h3><div class="f5players">${Array.from({length:f.where==='online'?1:f.n},(_,i)=>`<div class="f5pl"><span class="f5no">${i+1}</span>
        <input data-nm="${i}" value="${esc(f.names[i]||'')}" maxlength="18" placeholder="Нік" aria-label="Нік гравця ${i+1}">
        <input data-tm="${i}" value="${esc(f.teams_[i]||'')}" maxlength="22" placeholder="${F5_TEAMS[i%F5_TEAMS.length]}" aria-label="Назва команди гравця ${i+1}">
        <div class="f5forms">${Object.keys(F5_FORMS).map(k=>`<button class="f5f${f.forms[i]===k?' on':''}" data-fi="${i}" data-fm="${k}"><b>${k}</b><small>${F5_FORMS[k].tag}</small></button>`).join('')}</div></div>`).join('')}</div>
      <p class="muted cap" style="margin-top:6px">Назва команди — за бажанням; без неї показуємо нік.</p>
      <div class="row" style="margin-top:14px"><button class="primary" id="f5Go">${f.where==='online'?ic('send')+'Створити кімнату':ic('ferris-wheel')+'Почати драфт'}</button><button class="ghost" id="f5Back">На головну</button></div>`;
    document.getElementById('f5Minus').onclick=()=>{f.n=Math.max(2,f.n-1);f5Render();};document.getElementById('f5Plus').onclick=()=>{f.n=Math.min(F5_MAX,f.n+1);f5Render();};
    el.querySelectorAll('[data-m]').forEach(d=>d.onclick=()=>{f.mode=d.dataset.m;f5Render();});
    el.querySelectorAll('[data-w]').forEach(d=>d.onclick=()=>{f.where=d.dataset.w;f5Render();});
    el.querySelectorAll('[data-nm]').forEach(x=>x.oninput=()=>{f.names[+x.dataset.nm]=x.value;x.classList.remove('bad');});
    el.querySelectorAll('[data-tm]').forEach(x=>x.oninput=()=>{f.teams_[+x.dataset.tm]=x.value;});
    el.querySelectorAll('[data-fm]').forEach(x=>x.onclick=()=>{f.forms[+x.dataset.fi]=x.dataset.fm;el.querySelectorAll(`[data-fi="${x.dataset.fi}"]`).forEach(y=>y.classList.toggle('on',y===x));});
    document.getElementById('f5Go').onclick=()=>f.where==='online'?f5Create():f5Begin();document.getElementById('f5Back').onclick=()=>go(1);return;}
  if(f.online&&(f.phase==='lobby'||f.phase==='join'||f.phase==='draft')){f5RenderOnline(el);return;}
  if(f.phase==='draft'){
    const ti=f5Seat(),team=f.teams[ti],total=f.teams.length*5;
    if(f.handoff){el.innerHTML=`<div class="daily f5hand"><div class="kicker">${f.mode==='turns'?`Хід ${f.pick+1} з ${total}`:`Драфт ${ti+1} з ${f.teams.length}`}</div><div class="ttl">Ходить ${esc(f5Label(team))}</div>
        <p class="muted" style="margin:0">${f.mode==='solo'&&ti>0?'Передай пристрій — попередній склад сховано.':'Передай пристрій і тисни, коли готовий.'}</p><div class="row"><button class="primary" id="f5Ready">${ic('ferris-wheel')}Я готовий — крутити</button></div></div>`+
        (f.mode==='turns'&&f.pick>0?`<h3>Склади</h3><div class="f5grid">${f.teams.map(t=>`<div>${f5Head(t)}${f5Pitch(t)}</div>`).join('')}</div>`:'');
      document.getElementById('f5Ready').onclick=()=>{f.handoff=false;f5Spin();};return;}
    const cs=f.cs;const need=new Set(f5Open(team).map(s=>s.slot));
    const list=cs?[...cs.pl].map(p=>({p,ok:!f5Taken(team).has(canon(p[5]))&&need.has(f5G(p))})).sort((a,b)=>(b.ok-a.ok)||(b.p[3]-a.p[3])):[];
    el.innerHTML=`<div class="row" style="justify-content:space-between;margin-block:14px 8px"><div>${f5Head(team)} <span class="muted mono">${5-f5Open(team).length}/5 · ${team.form}</span></div><span class="muted mono">${f.mode==='turns'?`хід ${f.pick+1}/${total}`:''}</span></div>
      ${f5Pitch(team)}
      <div class="wheel" style="margin-top:12px"><div class="reels"><div class="reel"><div class="strip"><div class="club">${cs?esc(cs.n):''}</div></div></div><div class="reel"><div class="strip"><div class="season">${cs?seasonLabel(cs.y):''}</div></div></div></div>
      <div class="row" style="justify-content:space-between"><span class="muted">${cs?cs.pos+' місце в тому сезоні · потрібні: '+[...need].map(s=>F5_L[s]).join(', '):''}</span>${team.rerolls>0?`<button class="ghost" id="f5Rr">Перекрутити (${team.rerolls})</button>`:''}</div>
      <div class="sqHead noast"><span></span><span></span><span>Матчі</span><span>Голи</span><span></span><span class="h"></span></div><div class="squad noast" id="f5Sq"></div></div>`;
    const sq=document.getElementById('f5Sq');let sep=false;
    for(const {p,ok} of list){if(!ok&&!sep){sep=true;const h=document.createElement('div');h.className='muted';h.style.cssText='font-size:12px;margin:8px 0 2px';h.textContent='Лінія вже заповнена або гравця взяли';sq.appendChild(h);}
      const b=document.createElement('button');b.className='pl';b.disabled=!ok;const g=f5G(p);
      b.innerHTML=`<span class="pos ${g}">${F5_L[g]}</span><span class="nm">${esc(p[0])}</span><span class="st">${p[3]}</span><span class="st">${p[4]}</span><span></span><span class="rt"></span>`;
      b.onclick=()=>f5Choose(p);sq.appendChild(b);}
    const rr=document.getElementById('f5Rr');if(rr)rr.onclick=f5Reroll;return;}
  if(f.phase==='ready'){
    el.innerHTML=`<div class="daily"><div class="kicker">${ic('lock-open-variant','sm')}Склади зібрано</div><div class="ttl">Рейтинги відкрито</div><p class="muted" style="margin:0">${f.teams.length===2?'Один матч, 2×20 хвилин. Нічия — пенальті.':`Кожен з кожним (${f.teams.length*(f.teams.length-1)/2} матчів), потім фінал двох найкращих.`}</p>
      <div class="row"><button class="primary" id="f5Play">${ic('soccer')}Грати</button></div></div>
      <div class="f5grid">${f.teams.map(t=>{const x=f5Idx(t);return `<div>${f5Head(t)} <span class="muted mono">${t.form} · атака ${x.att.toFixed(0)} · оборона ${x.def.toFixed(0)}</span>${f5Pitch(t,{reveal:true})}</div>`;}).join('')}</div>`;
    document.getElementById('f5Play').onclick=f5Play;return;}
  const r=f.res,m0=r.final;
  if(f.phase==='live'){
    el.innerHTML=`<div class="hero f5live" style="margin-top:14px"><div class="kicker">${r.table?'Фінал':'Матч'} · 2×20 хвилин</div>
      <div class="f5score"><span>${esc(f5Label(m0.A))}</span><b><span id="f5Sa">0</span>:<span id="f5Sb">0</span></b><span>${esc(f5Label(m0.B))}</span></div>
      <div class="f5track"><div class="f5bar" id="f5Bar"></div><div class="f5dot" id="f5Dot"></div><i style="left:50%"></i></div>
      <div class="row" style="justify-content:space-between"><span class="mono" id="f5Min">0'</span><button class="ghost" id="f5Skip">Пропустити</button></div>
      <div class="f5goal" id="f5Goal" hidden></div></div>
      ${r.table?`<h3>Група</h3><div class="tbl"><table><tr><th>#</th><th>Команда</th><th class="num">В</th><th class="num">Н</th><th class="num">П</th><th class="num">Г</th><th class="num">О</th></tr>${r.table.map((s,i)=>`<tr${i<2?' class="z-cl"':''}><td class="num">${i+1}</td><td>${esc(f5Label(s.t))}</td><td class="num">${s.w}</td><td class="num">${s.d}</td><td class="num">${s.l}</td><td class="num">${s.gf}:${s.ga}</td><td class="num"><b>${s.p}</b></td></tr>`).join('')}</table></div>`:''}`;
    document.getElementById('f5Skip').onclick=()=>F5.skip&&F5.skip();
    f5Live(m0,()=>{setTimeout(()=>{if(F5.phase==='live'){F5.phase='result';f5Render();}},m0.pens?600:900);});return;}
  if(f.phase==='result'){
    const w=f5Winner(m0),champ=w===0?m0.A:m0.B;
    const score=m=>`${m.ga}:${m.gb}${m.pens?` <span class="muted f5pen">(пен. ${m.pens[0]}:${m.pens[1]})</span>`:''}`;
    const evl=m=>m.ev.length?m.ev.map(e=>`<div class="f5ev s${e.side}"><span class="mono">${e.min}'</span><b>${esc(e.sc.name)}</b>${e.as?`<span class="muted"> · ${esc(e.as.name)}</span>`:''}</div>`).join(''):'<p class="muted" style="margin:0">Голів не було.</p>';
    const all=[...m0.ra.map(x=>({...x,t:f5Label(m0.A)})),...m0.rb.map(x=>({...x,t:f5Label(m0.B)}))].sort((a,b)=>b.rt-a.rt);const mvp=all[0];
    el.innerHTML=`<div class="hero" style="margin-top:14px"><div class="tier gold">${ic('trophy','lg')} ${esc(f5Label(champ))}${r.table?' — чемпіон':' перемагає'}</div>
      <div class="f5score"><span>${esc(f5Label(m0.A))}</span><b>${score(m0)}</b><span>${esc(f5Label(m0.B))}</span></div>
      <p class="muted" style="margin:0">${r.table?'Фінал':'Матч'} · xG ${m0.la.toFixed(1)} : ${m0.lb.toFixed(1)} · ${ic('star','sm')}гравець матчу: <b>${esc(mvp.name)}</b> (${esc(mvp.t)}) ${mvp.rt.toFixed(1)}</p>
      <div class="f5evs">${evl(m0)}</div>
      <div class="row"><button class="primary" id="f5Again">${ic('fire')}Реванш тими ж складами</button><button class="ghost" id="f5New">Новий драфт</button><button class="ghost" id="f5Copy">${ic('content-copy')}Скопіювати результат</button><span class="best" id="f5Msg"></span></div></div>
      ${r.table?`<h3>Група</h3><div class="tbl"><table><tr><th>#</th><th>Команда</th><th class="num">В</th><th class="num">Н</th><th class="num">П</th><th class="num">Г</th><th class="num">О</th></tr>${r.table.map((s,i)=>`<tr${i<2?' class="z-cl"':''}><td class="num">${i+1}</td><td>${esc(f5Label(s.t))}</td><td class="num">${s.w}</td><td class="num">${s.d}</td><td class="num">${s.l}</td><td class="num">${s.gf}:${s.ga}</td><td class="num"><b>${s.p}</b></td></tr>`).join('')}</table></div>
        <h3>Матчі групи</h3><div class="matches">${r.matches.map(m=>`<div class="m"><span class="op">${esc(f5Label(m.A))} — ${esc(f5Label(m.B))}</span><span></span><span class="sc">${m.ga}:${m.gb}</span></div>`).join('')}</div>`:''}
      <h3>Склади фіналістів</h3><div class="f5grid">${[m0.A,m0.B].map((t,k)=>{const rs=k?m0.rb:m0.ra;return `<div>${f5Head(t)}${f5Pitch(t,{rt:p=>rs.find(x=>x.id===p.id).rt})}</div>`;}).join('')}</div>`;
    document.getElementById('f5Again').onclick=()=>{F5.replay=(F5.replay||0)+1;f5Play();};document.getElementById('f5New').onclick=f5Start;
    document.getElementById('f5Copy').onclick=()=>{const t=`⚽ 30-0 УПЛ · 5×5\n${r.table?'Фінал: ':''}${f5Label(m0.A)} ${m0.ga}:${m0.gb}${m0.pens?` (пен. ${m0.pens[0]}:${m0.pens[1]})`:''} ${f5Label(m0.B)}\n🏆 ${f5Label(champ)}\n⭐ ${mvp.name} ${mvp.rt.toFixed(1)}`+(ONLINE?`\n\nЗбери свою п'ятірку: https://upl-30-0.vercel.app`:'');
      const msg=document.getElementById('f5Msg');try{navigator.clipboard.writeText(t).then(()=>{msg.textContent='Скопійовано';},()=>{msg.textContent=t;});}catch(e){msg.textContent=t;}};}
}

// ---------- 5×5 онлайн: кімната в Supabase, усі пристрої опитують її раз на 2 с і будують однаковий стан із seed + піків
const F5_SB=(q,opt={})=>fetch(`${SB_URL}/rest/v1/${q}${q.includes('?')?'&':'?'}apikey=${SB_KEY}`,{method:opt.method||'GET',headers:{apikey:SB_KEY,'Content-Type':'application/json',Prefer:opt.prefer||'return=representation'},body:opt.body?JSON.stringify(opt.body):undefined})
  .then(async r=>{const tx=await r.text();let j=null;try{j=tx?JSON.parse(tx):null;}catch(e){}if(!r.ok){const e=new Error((j&&(j.message||j.details))||tx||r.status);e.status=r.status;e.code=j&&j.code;throw e;}return j;});
function f5Link(id){return `https://upl-30-0.vercel.app/?r=${id}`;}
function f5TgLink(id){return `https://t.me/${TG_BOT}?startapp=r${id}`;}
function f5StopPoll(){if(F5&&F5.online&&F5.online.timer){clearInterval(F5.online.timer);F5.online.timer=null;}}
function f5Poll(){if(!F5||!F5.online)return;f5StopPoll();const tick=()=>f5Sync().catch(()=>{});tick();F5.online.timer=setInterval(tick,2000);}
async function f5Create(){
  const nm=String(F5.names[0]||'').trim();if(!nm){const x=document.querySelector('[data-nm="0"]');if(x){x.focus();x.classList.add('bad');}return;}
  nickSet(nm);const b=document.getElementById('f5Go');b.disabled=true;
  const id=Math.random().toString(36).slice(2,8).toUpperCase(),seed=Math.floor(Math.random()*2147483647),dev=deviceId();
  try{await F5_SB('f5_rooms',{method:'POST',body:{id,seed,mode:F5.mode,max_players:F5.n,host_device:dev}});
    await F5_SB('f5_players',{method:'POST',body:{room_id:id,seat:0,device_id:dev,name:nm.slice(0,24),team:(F5.teams_[0]||'').trim().slice(0,22)||null,form:F5.forms[0]}});
    F5.online={id,dev,seat:0,host:true};F5.phase='lobby';history.replaceState(history.state,'',`?r=${id}`);f5Render();f5Poll();}
  catch(e){b.disabled=false;alertF5('Не вдалося створити кімнату: '+String(e.message||e).slice(0,120));}}
function alertF5(t){const el=document.getElementById('f5');if(el)el.insertAdjacentHTML('afterbegin',`<p class="note" style="margin-top:12px">${esc(t)}</p>`);}
function f5RoomParam(){const m=/[?&]r=([A-Za-z0-9]{5,12})/.exec(location.search);if(m)return m[1].toUpperCase();const sp=TG&&TG.initDataUnsafe&&TG.initDataUnsafe.start_param||'';const x=/^r([A-Za-z0-9]{5,12})$/.exec(sp);return x?x[1].toUpperCase():null;}
async function f5Boot(){if(!ONLINE)return;const id=f5RoomParam();if(!id||(F5&&F5.online&&F5.online.id===id))return;
  go(5);const nick=myName();F5={phase:'join',n:2,mode:'turns',names:[nick],teams_:[''],forms:['1-2-1'],online:{id,dev:deviceId(),seat:null}};f5Render();f5Poll();}
async function f5Join(){
  const nm=String(F5.names[0]||'').trim();if(!nm){const x=document.querySelector('[data-nm="0"]');if(x){x.focus();x.classList.add('bad');}return;}
  nickSet(nm);const o=F5.online;const b=document.getElementById('f5Join');if(b)b.disabled=true;
  for(let tries=0;tries<4;tries++){const seat=(F5.players||[]).length+tries;
    try{await F5_SB('f5_players',{method:'POST',body:{room_id:o.id,seat,device_id:o.dev,name:nm.slice(0,24),team:(F5.teams_[0]||'').trim().slice(0,22)||null,form:F5.forms[0]}});o.seat=seat;break;}
    catch(e){if(e.status===409&&/device/.test(String(e.message)))break;if(e.status!==409){alertF5('Не вдалося приєднатися: '+String(e.message||e).slice(0,120));break;}}}
  await f5Sync();}
async function f5Sync(){
  const o=F5.online;if(!o)return;
  const [room]=await F5_SB(`f5_rooms?id=eq.${o.id}&select=*`)||[];if(!room){F5.phase='gone';f5RenderOnline(document.getElementById('f5'));f5StopPoll();return;}
  const players=await F5_SB(`f5_players?room_id=eq.${o.id}&select=*&order=seat.asc`)||[];
  const me=players.find(p=>p.device_id===o.dev);if(me)o.seat=me.seat;o.host=room.host_device===o.dev;
  F5.room=room;F5.players=players;F5.mode=room.mode;F5.seed=+room.seed;
  if(room.status==='lobby'){F5.phase=me?'lobby':'join';f5Render();return;}
  if(!me){F5.phase='gone';f5RenderOnline(document.getElementById('f5'));f5StopPoll();return;}
  const picks=await F5_SB(`f5_picks?room_id=eq.${o.id}&select=*&order=n.asc`)||[];
  if(F5.phase!=='draft'||!F5.wheel){const r=f5Rng('wheel');F5.wheel=[];for(let i=0;i<2000;i++)F5.wheel.push(DATA.clubs.indexOf(pickWeighted(DATA.clubs,r)));}
  const n=room.players_n||players.length;const pl=players.slice(0,n);
  // той самий стан на кожному пристрої: склади з таблиці гравців + піки по порядку
  const myN=picks.filter(k=>k.seat===o.seat).length,key=(F5.mode==='turns'?picks.length:myN)+'|'+n;const keepCs=F5.phase==='draft'&&F5.cs&&F5.myTurnKey===key;const cs0=F5.cs;
F5.teams=pl.map(p=>f5Team(String(p.name||''),String(p.team||''),f5Form(p.form)));F5.takenAll=new Set();F5.seqAll={ptr:0};F5.seqs=[];
  for(const k of picks){const team=F5.teams[k.seat];if(!team)continue;const cs=DATA.clubs[k.club_idx];const pp=cs&&cs.pl.find(x=>x[5]===k.person_id);const s=team.slots[k.slot_idx];if(!pp||!s)continue;
    s.player={name:pp[0],id:pp[5],slot:s.slot,r:pp[2],apps:pp[3],goals:pp[4],club:cs.n,c:cs.c,y:cs.y};f5Taken(team).add(canon(pp[5]));
    if(F5.mode==='turns')F5.seqAll.ptr=k.ptr;else (F5.seqs[k.seat]=F5.seqs[k.seat]||{ptr:0}).ptr=k.ptr;}
  F5.pick=picks.length;F5.cs=keepCs?cs0:null;
  if(F5.teams.every(t=>t.slots.every(x=>x.player))){F5.phase='ready';f5StopPoll();if(o.host&&room.status!=='done')F5_SB(`f5_rooms?id=eq.${o.id}`,{method:'PATCH',prefer:'return=minimal',body:{status:'done'}}).catch(()=>{});f5Render();return;}
  F5.phase='draft';F5.solo=o.seat;
  const mine=F5.teams[o.seat];const myTurn=F5.mode==='turns'?F5.pick%n===o.seat:!!f5Open(mine).length;
  if(myTurn&&!F5.cs){F5.myTurnKey=key;f5Spin();return;}
  f5Render();}
async function f5StartRoom(){const o=F5.online;const b=document.getElementById('f5StartR');if(b)b.disabled=true;
  try{await F5_SB(`f5_rooms?id=eq.${o.id}`,{method:'PATCH',prefer:'return=minimal',body:{status:'draft',players_n:F5.players.length}});await f5Sync();}catch(e){if(b)b.disabled=false;alertF5('Не вдалося почати: '+String(e.message||e).slice(0,120));}}
async function f5OnPlace(p,s){const o=F5.online,team=F5.teams[o.seat],cs=F5.cs;const k=team.slots.filter(x=>x.player).length;
  const row={room_id:o.id,seat:o.seat,k,n:F5.mode==='turns'?F5.pick:o.seat*5+k,club_idx:DATA.clubs.indexOf(cs),person_id:p[5],slot_idx:team.slots.indexOf(s),ptr:F5.curPtr||0};
  F5.cs=null;document.querySelectorAll('#f5Sq .pl').forEach(b=>b.disabled=true);
  try{await F5_SB('f5_picks',{method:'POST',prefer:'return=minimal',body:row});}catch(e){alertF5('Хід не зараховано (можливо, гравця вже взяли) — спробуй ще раз.');}
  await f5Sync();}
function f5RenderOnline(el){const f=F5,o=f.online;
  if(f.phase==='gone'){el.innerHTML=`<div class="daily"><div class="ttl">Кімнату не знайдено або гра вже почалася без тебе</div><div class="row"><button class="primary" id="f5New2">Створити свою гру 5×5</button></div></div>`;document.getElementById('f5New2').onclick=f5Start;return;}
  const plist=(f.players||[]).map(p=>`<div class="f5who"><span class="f5no">${(Number(p.seat)||0)+1}</span><b>${esc(p.team||p.name)}</b>${p.team?`<span class="muted"> · ${esc(p.name)}</span>`:''}<span class="muted mono">${esc(f5Form(p.form))}</span>${p.device_id===o.dev?'<span class="chip">ти</span>':''}${f.room&&p.device_id===f.room.host_device?'<span class="chip">організатор</span>':''}</div>`).join('');
  if(f.phase==='join'){
    el.innerHTML=`<div class="daily"><div class="kicker">${ic('account-group','sm')}Запрошення в гру 5×5 · кімната ${esc(o.id)}</div><div class="ttl">${f.room?`${f.room.mode==='turns'?'Драфт по черзі':'Кожен драфтить сам'} · до ${Number(f.room.max_players)||0} гравців`:'Завантажуємо кімнату…'}</div>
      ${plist?`<div class="f5wholist">${plist}</div>`:''}</div>
      <h3>Ти</h3><div class="f5players"><div class="f5pl"><span class="f5no">${(f.players||[]).length+1}</span><input data-nm="0" value="${esc(f.names[0]||'')}" maxlength="18" placeholder="Нік"><input data-tm="0" value="${esc(f.teams_[0]||'')}" maxlength="22" placeholder="${F5_TEAMS[(f.players||[]).length%F5_TEAMS.length]}">
      <div class="f5forms">${Object.keys(F5_FORMS).map(k=>`<button class="f5f${f.forms[0]===k?' on':''}" data-fi="0" data-fm="${k}"><b>${k}</b><small>${F5_FORMS[k].tag}</small></button>`).join('')}</div></div></div>
      <div class="row" style="margin-top:14px"><button class="primary" id="f5Join" ${f.room&&f.room.status==='lobby'&&(f.players||[]).length<f.room.max_players?'':'disabled'}>${ic('account-group')}Приєднатися</button><button class="ghost" id="f5Back2">На головну</button></div>`;
    el.querySelectorAll('[data-nm]').forEach(x=>{x.oninput=()=>{f.names[0]=x.value;x.classList.remove('bad');};});
    el.querySelectorAll('[data-tm]').forEach(x=>{x.oninput=()=>{f.teams_[0]=x.value;};});
    el.querySelectorAll('[data-fm]').forEach(x=>x.onclick=()=>{f.forms[0]=x.dataset.fm;el.querySelectorAll('[data-fi="0"]').forEach(y=>y.classList.toggle('on',y===x));});
    document.getElementById('f5Join').onclick=f5Join;document.getElementById('f5Back2').onclick=()=>{f5StopPoll();go(1);};return;}
  if(f.phase==='lobby'){const n=(f.players||[]).length;
    el.innerHTML=`<div class="daily"><div class="kicker">${ic('account-group','sm')}Кімната ${esc(o.id)} · ${f.room&&f.room.mode==='turns'?'по черзі':'кожен сам'}</div><div class="ttl">Чекаємо гравців: ${n} з ${f.room?Number(f.room.max_players)||0:'…'}</div>
      <div class="f5wholist">${plist}</div>
      <div class="row"><button class="primary" id="f5TgInv">${ic('telegram')}Запросити в Telegram</button><button class="ghost" id="f5CopyInv">${ic('content-copy')}Скопіювати посилання</button></div>
      <div class="muted mono" id="f5InvMsg" style="font-size:12px;word-break:break-all">${esc(f5Link(o.id))}</div>
      ${o.host?`<div class="row"><button class="primary" id="f5StartR" ${n<2?'disabled':''}>${ic('ferris-wheel')}Почати гру (${n})</button><span class="muted" style="font-size:13px">${n<2?'потрібно щонайменше 2 гравці':'можна почати, не чекаючи всіх'}</span></div>`:`<p class="muted" style="margin:0">Організатор почне гру, коли всі зайдуть.</p>`}</div>`;
    const txt=`⚽ Гра 5×5 у 30-0 УПЛ: збери п'ятірку з історії УПЛ і зіграй проти мене. Кімната ${o.id}`;
    document.getElementById('f5TgInv').onclick=()=>{const u=`https://t.me/share/url?url=${encodeURIComponent(TG?f5TgLink(o.id):f5Link(o.id))}&text=${encodeURIComponent(txt)}`;if(TG&&TG.openTelegramLink)TG.openTelegramLink(u);else window.open(u,'_blank');};
    document.getElementById('f5CopyInv').onclick=()=>{const m=document.getElementById('f5InvMsg');try{navigator.clipboard.writeText(f5Link(o.id)).then(()=>{m.textContent='Скопійовано: '+f5Link(o.id);},()=>{});}catch(e){}};
    const sr=document.getElementById('f5StartR');if(sr)sr.onclick=f5StartRoom;return;}
  // драфт онлайн
  const n=f.teams.length,mine=f.teams[o.seat];const turnSeat=f.mode==='turns'?f.pick%n:o.seat;const myTurn=f.mode==='turns'?turnSeat===o.seat:!!f5Open(mine).length;
  if(!myTurn||!f.cs){const who=f.teams[turnSeat];
    el.innerHTML=`<div class="daily"><div class="kicker">Кімната ${esc(o.id)} · ${f.mode==='turns'?`хід ${f.pick+1} з ${n*5}`:'кожен драфтить сам'}</div><div class="ttl">${f.mode==='turns'?`Ходить ${esc(f5Label(who))}`:(f5Open(mine).length?'Крутимо колесо…':'Твій склад готовий — чекаємо інших')}</div><p class="muted" style="margin:0">Оновлюється автоматично.</p></div>
      <h3>Склади</h3><div class="f5grid">${f.teams.map((t,i)=>`<div>${f5Head(t)}${i===o.seat?' <span class="chip">ти</span>':''}${f.mode==='solo'&&i!==o.seat?`<p class="muted" style="margin:0">${5-f5Open(t).length}/5 — склад побачиш після драфту</p>`:f5Pitch(t)}</div>`).join('')}</div>`;return;}
  const cs=f.cs,team=mine,need=new Set(f5Open(team).map(s=>s.slot));
  const list=[...cs.pl].map(p=>({p,ok:!f5Taken(team).has(canon(p[5]))&&need.has(f5G(p))})).sort((a,b)=>(b.ok-a.ok)||(b.p[3]-a.p[3]));
  el.innerHTML=`<div class="row" style="justify-content:space-between;margin-block:14px 8px"><div>${f5Head(team)} <span class="muted mono">${5-f5Open(team).length}/5 · ${team.form}</span></div><span class="chip hot">твій хід</span></div>
    ${f5Pitch(team)}
    <div class="wheel" style="margin-top:12px"><div class="reels"><div class="reel"><div class="strip"><div class="club">${esc(cs.n)}</div></div></div><div class="reel"><div class="strip"><div class="season">${seasonLabel(cs.y)}</div></div></div></div>
    <div class="row" style="justify-content:space-between"><span class="muted">${cs.pos} місце в тому сезоні · потрібні: ${[...need].map(s=>F5_L[s]).join(', ')}</span>${team.rerolls>0?`<button class="ghost" id="f5Rr">Перекрутити (${team.rerolls})</button>`:''}</div>
    <div class="sqHead noast"><span></span><span></span><span>Матчі</span><span>Голи</span><span></span><span class="h"></span></div><div class="squad noast" id="f5Sq"></div></div>`;
  const sq=document.getElementById('f5Sq');
  for(const {p,ok} of list){const b=document.createElement('button');b.className='pl';b.disabled=!ok;const g=f5G(p);
    b.innerHTML=`<span class="pos ${g}">${F5_L[g]}</span><span class="nm">${esc(p[0])}</span><span class="st">${p[3]}</span><span class="st">${p[4]}</span><span></span><span class="rt"></span>`;b.onclick=()=>f5Choose(p);sq.appendChild(b);}
  const rr=document.getElementById('f5Rr');if(rr)rr.onclick=f5Reroll;}
