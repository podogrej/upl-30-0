// ---------- "Your numbers" (docs/tvoi_tsyfry_plan.md): own player page only. One RPC player_numbers(device, secret),
// cached in upl30_nums {pid, at, n, d}; refetched when the season count changed or the cache is older than NM_TTL.
const NM_MIN=5;   // fewer seasons: a neutral line instead of conclusions
const NM_TTL=10*6e4;
const NM_CHIPS=8;   // "one season and never again": names shown before "Show all"
let NM=null;   // {pid, d, at, n, loading, err, sel, all}
const nmPct=(a,b)=>b?Math.round(100*a/b):0;
const nmDec=v=>(Math.round(v*10)/10).toLocaleString('uk-UA');
// full section only with enough seasons and a working RPC; then the old "favourite club / player" rows go
function nmFull(p){if(NM&&NM.err)return false;const n=NM&&NM.d?NM.d.n:p&&p.seasons;return (n||0)>=NM_MIN;}
async function nmLoad(seasons){
  if(!ONLINE||!PLAYER||!PLAYER.id)return;
  if(!NM||NM.pid!==PLAYER.id){const c=lsGet('upl30_nums');NM={pid:PLAYER.id,sel:-1,all:false,...(c&&c.pid===PLAYER.id?{d:c.d,at:c.at,n:c.n}:{})};}
  const now=Date.now();if(NM.loading||(NM.d&&NM.n===seasons&&now-NM.at<NM_TTL)||(NM.try&&NM.try.n===seasons&&now-NM.try.at<NM_TTL))return;
  const st=NM;st.loading=true;st.try={n:seasons,at:now};   // one request per season count and TTL, failures included
  if(!st.d)nmRender();   // skeleton while the first answer is on its way
  try{const d=await playerRpc('player_numbers');if(d&&typeof d==='object'){Object.assign(st,{d,at:Date.now(),n:seasons,err:false});lsSet('upl30_nums',{pid:st.pid,at:st.at,n:seasons,d});}}
  catch(e){st.err=!st.d;}
  st.loading=false;
  if(NM===st&&PP&&PP.own&&CUR_SEC===6)ppRender();}
// player name by pool id ("rejected" stores ids only)
let NM_NAMES=null;
function nmName(id){if(!NM_NAMES){NM_NAMES={};for(const c of DATA.clubs)for(const p of c.pl)NM_NAMES[p[5]]=p[0];}return NM_NAMES[id]||NM_NAMES[canon(id)]||'';}
// verdict: first rule that fires (thresholds from docs/tvoi_tsyfry_plan.md, section 4)
function nmVerdict(d){
  const once=nmPct(d.once,d.uniq),tp=d.pl[d.top.k],top=tp?nmPct(tp.k,d.n):0,fm=d.fm?nmPct(d.fm.k,d.n):0,dog=d.rn?d.dog/d.rn:0,avg=+d.avg||0,cl=d.cl[0],clp=cl?nmPct(cl.k,d.xin):0;
  if(once>=50)return `Ти не збираєш склад, а влаштовуєш перегляд: <em>${once}%</em> гравців ти взяв лише раз.`;
  if(top>=40)return `Твій незмінний гравець — ${esc(cardName(tp.n))}: він у <em>${top}%</em> твоїх складів.`;
  if(fm>=80)return `Ти не змінюєш схему: <em>${fm}%</em> сезонів — ${esc(d.fm.f)}.`;
  if(dog>=0.35)return `Ти віриш у невідомих: кожен <em>${Math.round(1/dog)}-й</em> гравець у твоєму складі має рейтинг до 80.`;
  if(avg>=86)return `Тобі потрібні лише зірки: середній рейтинг твоїх гравців <em>${nmDec(avg)}</em>.`;
  if(d.cl_n>=45&&d.n>=20)return `Ти збираєш склад з усієї ліги: <em>${d.cl_n}</em> різних клубів.`;
  if(clp>=25)return `Твоє серце — ${esc(cl.c)}: <em>${clp}%</em> гравців звідти.`;
  return `Ти граєш по-різному: ${d.n} ${plUk(d.n,'сезон','сезони','сезонів')} — і жодної явної звички.`;}
// "Your XI": per slot the most frequent player in the favourite formation, each player once (greedy by count)
function nmXi(d){const F=FORMATIONS[d.fm&&d.fm.f];if(!F)return null;const out=new Array(F.slots.length).fill(null),used=new Set();
  for(const c of [...d.xi].sort((a,b)=>b.k-a.k||a.i-b.i))if(c.i<out.length&&!out[c.i]&&!used.has(c.id)&&d.pl[c.id]){out[c.i]=c.id;used.add(c.id);}
  return {F,ids:out};}
const nmBar=(l,v,sub,pct,dim)=>`<div class="nm-bar${dim?' dim':''}"><span>${l}</span><b>${v}${sub?`<small>${sub}</small>`:''}</b><i><u style="width:${Math.max(2,Math.round(pct))}%"></u></i></div>`;
const nmSea=n=>`${fmtN(n)} ${plUk(n,'сезон','сезони','сезонів')}`;
function nmHtml(){
  const d=NM&&NM.d,h2='<h2>Твої цифри</h2>';
  if(!d)return NM&&NM.loading?`<section class="nm" id="nmSec" aria-busy="true">${h2}<p class="nm-verdict"><i class="sk w60"></i></p></section>`:'';
  if(d.n<NM_MIN)return `<section class="nm" id="nmSec">${h2}<p class="nm-low">Зіграй ще кілька сезонів, і ми розкажемо, який ти тренер.</p><p class="nm-basis">${d.n?`Поки є ${nmSea(d.n)}, а для висновків потрібно п'ять.`:'Для висновків потрібно п\'ять сезонів.'}</p></section>`;
  const games=d.w+d.d+d.l,pl=id=>d.pl[id]||{};
  let h=`<section class="nm" id="nmSec">${h2}<p class="nm-verdict">${nmVerdict(d)}</p><p class="nm-basis">За ${nmSea(d.n)} у твоїх складах ${plUk(d.uniq,'був','було','було')} ${fmtN(d.uniq)} ${plUk(d.uniq,'різний гравець','різні гравці','різних гравців')}.</p><div class="nm-two"><div>`;
  // record
  if(games)h+=`<div class="pp-sec"><h3>Твій рекорд</h3><span class="best">${nmSea(d.n)}</span></div><div class="nm-card">
    <div class="nm-rec-top"><b>${nmPct(d.w,games)}%</b><span>матчів ти виграв</span></div>
    <div class="nm-wdl" role="img" aria-label="Перемог ${fmtN(d.w)}, нічиїх ${fmtN(d.d)}, поразок ${fmtN(d.l)}"><i class="w" style="flex:${d.w}"></i><i class="d" style="flex:${d.d}"></i><i class="l" style="flex:${d.l}"></i></div>
    <div class="nm-wdl-l"><span><b>${fmtN(d.w)}</b> В</span><span><b>${fmtN(d.d)}</b> Н</span><span><b>${fmtN(d.l)}</b> П</span></div>
    <div class="nm-stats"><div><b>${nmDec(d.pts/d.na)}</b><span>очок за сезон</span></div><div><b>${Math.round(d.gf/d.na)}</b><span>голів за сезон</span></div><div><b>${d.best!=null?d.best:'—'}</b><span>найкращий сезон</span></div></div>
    ${d.na<d.n?'<p class="nm-note">Без антисезону: там мета — програти.</p>':''}</div>`;
  // XI on the game's pitch
  const X=nmXi(d);
  if(X){const G=pitchGeo(d.fm.f);
    h+=`<div class="pp-sec"><h3>Твоя 11-ка</h3><span class="best">${esc(d.fm.f)} · ${nmPct(d.fm.k,d.n)}% сезонів</span></div><div class="pitch" id="nmPitch">${PITCH_MK}${X.F.slots.map((sl,i)=>{const id=X.ids[i],q=id&&pl(id),pt=G.pts[i];
      if(!q)return `<div class="slot empty ${GROUP_OF[sl]}" style="left:${pt.x}%;top:${pt.y}%">${slotInner(sl,null,{})}</div>`;
      return `<div class="slot filled ${GROUP_OF[sl]}${NM.sel===i?' moving':''}" style="left:${pt.x}%;top:${pt.y}%" data-nm="${i}" role="button" tabindex="0" aria-pressed="${NM.sel===i}" aria-label="${esc(q.n)}: ${nmSea(q.k)} у складі">${slotInner(sl,{name:q.n,id,club:q.c},{pill:`<span class="pill avg">${q.k}</span>`})}</div>`;}).join('')}</div>
      <p class="nm-pitch-cap">Число біля кружка — у скількох сезонах гравець був у твоєму складі. Торкнись гравця, щоб побачити більше.</p><div id="nmCard">${nmCardHtml(d,X)}</div>`;}
  h+='</div><div>';
  // key players
  const row=(icn,k,id,sub,n,nsub)=>{const q=pl(id);return q.n?`<div class="nm-row">${ic(icn)}<div class="t"><span class="k">${k}</span><b>${esc(q.n)}</b><small>${sub(q)}</small></div><div class="n">${n(q)}${nsub?`<small>${nsub(q)}</small>`:''}</div></div>`:'';};
  const winW=q=>q.ka?`${nmPct(q.wa,30*q.ka)}% перемог з ним`:'';
  const rows=row('soccer','Бомбардир',d.top.g,q=>`${fmtN(q.g)} ${plUk(q.g,'гол','голи','голів')} за ${nmSea(q.k)}`,q=>fmtN(q.g))+
    row('heart','Найчастіший',d.top.k,q=>`у ${nmPct(q.k,d.n)}% твоїх складів`,q=>fmtN(q.k),q=>plUk(q.k,'сезон','сезони','сезонів'))+
    row('lightning-bolt','Твій андердог',d.top.dog,q=>[`рейтинг ${esc(String(q.r0))}`,`${fmtN(q.g)} ${plUk(q.g,'гол','голи','голів')}`,winW(q)].filter(Boolean).join(' · '),q=>fmtN(q.k),q=>plUk(q.k,'сезон','сезони','сезонів'));
  if(rows)h+=`<div class="pp-sec"><h3>Ключові гравці</h3></div><div class="nm-rows">${rows}</div>`;
  // rejected (needs logged wheel offers; the server sends it only with enough of them)
  const rej=(d.rej||[]).map(r=>({...r,n:nmName(r.id)})).filter(r=>r.n);
  if(rej.length)h+=`<div class="pp-sec"><h3>Відхилені</h3><span class="best">з ${nmSea(d.off_n)}</span></div><div class="nm-rows">${rej.map(r=>`<div class="nm-row">${ic('ferris-wheel')}<div class="t"><b>${esc(r.n)}</b></div><div class="n">${fmtN(r.k)}<small>${plUk(r.k,'раз','рази','разів')}</small></div></div>`).join('')}</div><p class="nm-note">Колесо пропонувало їх найчастіше, а ти не взяв жодного разу.</p>`;
  // one season and never again
  if(d.once){const names=d.once_n||[],shown=NM.all?names:names.slice(0,NM_CHIPS),more=d.once-shown.length;
    h+=`<div class="pp-sec"><h3>Один сезон і більше ніколи</h3></div><div class="nm-card"><div class="nm-once"><b>${nmPct(d.once,d.uniq)}%</b><p>гравців, які були у твоєму складі, ти брав лише один раз: ${fmtN(d.once)} із ${fmtN(d.uniq)}.</p></div>
      <div class="nm-chips">${shown.map(n=>`<span class="chip" title="${esc(n)}">${esc(cardName(n))}</span>`).join('')}</div>
      ${!NM.all&&names.length>shown.length?`<button class="nm-more" type="button" id="nmAll">Показати всіх ${fmtN(d.once)}</button>`:NM.all&&more>0?`<p class="nm-note">і ще ${fmtN(more)}</p>`:''}</div>`;}
  // points by mode and clubs
  const md=(d.modes||[]).filter(m=>m.k>0),mx=Math.max(1,...md.map(m=>Math.abs(m.pts))),c0=d.cl[0]?d.cl[0].k:1;
  const lab=b=>b==='daily'?'Виклик дня':(PP_BUCKETS.find(x=>x[0]===b)||[0,b])[1];   // daily-seed seasons are the daily challenge now
  const club=(c,i)=>nmBar(esc(c.c),nmPct(c.k,d.xin)+'%','',100*c.k/c0,i>0);
  const restK=d.xin-d.cl.reduce((a,c)=>a+c.k,0);
  if(md.length||d.cl.length)h+=`<div class="pp-sec"><h3>Очки й клуби</h3></div><div class="nm-card">
    ${md.length?`<p class="nm-sub">Очки за режимами</p><div class="nm-bars">${md.map((m,i)=>nmBar(esc(lab(m.b)),fmtN(m.pts),nmSea(m.k),100*Math.abs(m.pts)/mx,i>0)).join('')}</div>`:''}
    ${md.length&&d.cl.length?'<hr class="nm-div">':''}
    ${d.cl.length?`<p class="nm-sub">Звідки твої гравці</p><div class="nm-bars">${d.cl.slice(0,5).map(club).join('')}</div>
    ${d.cl_n>5?`<details class="nm-fold"><summary>Ще ${d.cl_n-5} ${plUk(d.cl_n-5,'клуб','клуби','клубів')}</summary><div class="nm-bars">${d.cl.slice(5).map(c=>club(c,1)).join('')}${restK>0?nmBar('Інші клуби',nmPct(restK,d.xin)+'%','',100*restK/c0,1):''}</div></details>`:''}`:''}</div>`;
  return h+'</div></div></section>';}
// card of the tapped XI player, under the pitch (one at a time)
function nmCardHtml(d,X){const id=NM.sel>=0&&X.ids[NM.sel];if(!id)return '';const q=d.pl[id],games=30*q.ka,rest=30*(d.na-q.ka);
  const w=games?nmPct(q.wa,games):null,wo=rest>0?nmPct(d.w-q.wa,rest):null,df=w!=null&&wo!=null?w-wo:null;
  return `<div class="nm-pc" role="status"><div class="nm-pc-h"><b>${esc(q.n)}</b><span>${[q.slot&&POSNAME[q.slot]||'',q.r0!=null?`рейтинг ${esc(String(q.r0))}`:''].filter(Boolean).join(' · ')}</span></div>
    <div class="nm-pc-g"><div><b>${fmtN(q.k)}</b><span>${plUk(q.k,'сезон','сезони','сезонів')} у складі</span></div><div><b>${fmtN(q.g)}</b><span>${plUk(q.g,'гол','голи','голів')} за тебе</span></div><div><b>${nmPct(q.k,d.n)}%</b><span>твоїх сезонів</span></div></div>
    ${w!=null?`<p class="nm-pc-d">Перемог з ним <b>${w}%</b>${wo!=null?`, без нього <b>${wo}%</b> <strong class="${df<0?'neg':''}">${df>0?'+':df<0?'−':''}${Math.abs(df)} п.п.</strong>`:''}</p>`:''}</div>`;}
function nmRender(){const el=document.getElementById('ppNums');if(!el)return;el.innerHTML=nmHtml();nmWire();}
function nmWire(){
  document.querySelectorAll('#nmPitch [data-nm]').forEach(s=>{const tap=()=>{NM.sel=NM.sel===+s.dataset.nm?-1:+s.dataset.nm;nmSel();};
    s.onclick=tap;s.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();tap();}else if(e.key==='Escape'&&NM.sel>=0){NM.sel=-1;nmSel();}};});
  const a=document.getElementById('nmAll');if(a)a.onclick=()=>{NM.all=true;nmRender();};}
// selection changes only the slot state and the card, the pitch is not redrawn
function nmSel(){const X=NM.d&&nmXi(NM.d);if(!X)return;
  document.querySelectorAll('#nmPitch [data-nm]').forEach(s=>{const on=+s.dataset.nm===NM.sel;s.classList.toggle('moving',on);s.setAttribute('aria-pressed',String(on));});
  const c=document.getElementById('nmCard');if(c)c.innerHTML=nmCardHtml(NM.d,X);haptic('select');}
