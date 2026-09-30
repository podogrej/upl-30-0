// ---------- ВИКЛИК ДРУГОВІ «побий мій результат»: те саме колесо (seed), та сама схема, режим і суперники
// Кожна вільна класична гра має seed колеса; після сезону можна створити виклик (таблиця challenges) і надіслати посилання.
const CHAL_ALPH='abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function chalId(){let s='';const a=new Uint32Array(8);try{crypto.getRandomValues(a);}catch(e){for(let i=0;i<8;i++)a[i]=Math.floor(Math.random()*4e9);}for(const x of a)s+=CHAL_ALPH[x%CHAL_ALPH.length];return s;}
function wheelSeq(seed){const r=mulberry32(seed);const seq=[];for(let i=0;i<600;i++){const c=pickWeighted(DATA.clubs,r);seq.push(DATA.clubs.indexOf(c));}return seq;}
// нова вільна гра: seed колеса й сезон суперників визначаються наперед (щоб гру можна було повторити у виклику)
function chalNewGame(seed,year){seed=seed||Math.floor(Math.random()*2147483647);return {seed,year:year||LEAGUE_CULT,seq:wheelSeq(seed),ptr:0};}
let CHAL=null;   // виклик, який зараз відкрито за посиланням
const chalName=()=>{const el=document.getElementById('chalName');const v=el&&el.value.trim();if(v&&v.length>=2){if(!TGU)nickSet(v);return v;}return (TGU?[TGU.first_name,TGU.last_name].filter(Boolean).join(' '):'')||myName()||'Друг';};
function chalLinkWeb(id){return `https://upl-30-0.vercel.app/?c=${id}`;}
function chalLinkTg(id){return `https://t.me/${TG_BOT}?startapp=c${id}`;}
async function chalCreate(r){
  const id=chalId();const row={id,device_id:deviceId(),name:chalName().slice(0,40),seed:S.chal.seed,formation:S.formation,year:r.year,mode:S.mode,w:r.W,d:r.D,l:r.L,pts:r.pts,place:r.place,gf:r.gf,ga:r.ga};
  const res=await fetch(`${SB_URL}/rest/v1/challenges?apikey=${SB_KEY}`,{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(row)});
  if(!res.ok)throw new Error('HTTP '+res.status);return id;
}
async function chalShare(){
  const r=S.result;const msg=document.getElementById('chalMsg');if(!r||!S.chal)return;
  msg.textContent='Створюю виклик…';
  try{const id=r.chalId||(r.chalId=await chalCreate(r));
    const text=`⚔️ Кидаю виклик у 30-0 УПЛ: ${r.pts} ${ptsWord(r.pts)} (${r.W}-${r.D}-${r.L}), ${r.place} місце. Те саме колесо, схема ${S.formation}. Побий!`;
    const url=`https://t.me/share/url?url=${encodeURIComponent(TG_BOT?chalLinkTg(id):chalLinkWeb(id))}&text=${encodeURIComponent(text)}`;
    if(TG&&TG.openTelegramLink)TG.openTelegramLink(url);else window.open(url,'_blank');
    msg.innerHTML=`Посилання на виклик: <span class="mono" style="user-select:all">${esc(chalLinkWeb(id))}</span>`;
  }catch(e){msg.textContent='Не вдалося створити виклик. Спробуй ще раз.';}
}
async function chalCopy(){
  const r=S.result;const msg=document.getElementById('chalMsg');if(!r||!S.chal)return;
  try{const id=r.chalId||(r.chalId=await chalCreate(r));const link=chalLinkWeb(id);
    try{await navigator.clipboard.writeText(link);msg.textContent='Посилання скопійовано: '+link;}catch(e){msg.innerHTML=`Скопіюй посилання: <span class="mono" style="user-select:all">${esc(link)}</span>`;}
  }catch(e){msg.textContent='Не вдалося створити виклик. Спробуй ще раз.';}
}
// відкрито посилання з викликом
function chalParam(){const m=/[?&]c=([A-Za-z0-9]{6,12})/.exec(location.search);if(m)return m[1];const sp=TG&&TG.initDataUnsafe&&TG.initDataUnsafe.start_param||'';const t=/^c([A-Za-z0-9]{6,12})$/.exec(sp);return t?t[1]:null;}
async function chalLoad(force){
  if(!ONLINE)return;const id=chalParam();if(!id||(!force&&CHAL&&CHAL.id===id))return;
  try{const rows=await sbGet(`challenges?id=eq.${id}&select=*`);if(!rows.length)return;CHAL=rows[0];
    CHAL.results=await sbGet(`challenge_results?challenge_id=eq.${id}&select=name,pts,w,d,l,place,created_at&order=pts.desc&limit=20`).catch(()=>[]);
    renderChal();}catch(e){}
}
function renderChal(){
  const el=document.getElementById('chalCard');if(!el)return;if(!CHAL){el.hidden=true;return;}const c=CHAL;
  el.hidden=false;el.innerHTML=`<div class="kicker">${ic('sword-cross','sm')}Виклик</div><div class="ttl">${esc(c.name)}: ${c.pts} ${ptsWord(c.pts)}</div>
    <div class="meta"><span class="chip">${c.w}-${c.d}-${c.l} · ${c.place} місце</span><span class="chip">Схема ${esc(c.formation)}</span><span class="chip">${MODES[c.mode]?MODES[c.mode].name:esc(c.mode)}</span><span class="chip">Суперники: ${esc(oppLabel(+c.year))}</span><span class="chip">Те саме колесо</span></div>
    ${c.results&&c.results.length?`<div class="tbl"><table>${c.results.slice(0,8).map(x=>`<tr><td>${esc(x.name)}</td><td class="num">${x.w}-${x.d}-${x.l}</td><td class="num"><b>${x.pts}</b></td><td>${x.pts>c.pts?ic('check-circle','sm')+'побив':x.pts===c.pts?ic('handshake','sm')+'нічия':'—'}</td></tr>`).join('')}</table></div>`:''}
    <div class="row"><button class="primary" id="chalGo">Прийняти виклик</button></div>`;
  document.getElementById('chalGo').onclick=chalStart;
}
function chalStart(){
  const c=CHAL;if(!c)return;S.daily=null;S.result=null;S.format='classic';S.mode=MODES[c.mode]&&c.mode!=='daily'?c.mode:'normal';S.formation=FORMATIONS[c.formation]?c.formation:'4-4-2';
  S.chal=chalNewGame(+c.seed,+c.year);S.challenge=c;
  S.slots=newSlots(S.formation);S.taken=new Set();S.wheel=null;S.rerolls=MODES[S.mode].rerolls;
  document.getElementById('modeLabel').textContent=`Виклик · ${S.formation} · ${MODES[S.mode].name}`;renderDraft();go(2);
}
// після сезону: порівняння з викликом і запис результату
function chalAfterSeason(r){
  const line=document.getElementById('chalLine'),box=document.getElementById('chalBox');
  if(box)box.hidden=!(ONLINE&&S.chal&&!S.daily&&S.format==='classic');
  const ni=document.getElementById('chalName');if(ni){ni.hidden=!!TGU;if(!ni.value)ni.value=myName();}
  document.getElementById('chalMsg').textContent='';
  if(!line)return;line.hidden=true;const c=S.challenge;if(!c)return;
  const diff=r.pts-c.pts;line.hidden=false;
  line.innerHTML=`${ic('sword-cross','sm')}Ти <b>${r.pts}</b> : <b>${c.pts}</b> ${esc(c.name)} — ${diff>0?`<b>виклик прийнято й виграно</b> (+${diff})`:diff===0?'нічия за очками':`не вистачило ${-diff} ${ptsWord(-diff)}`}`;
  if(ONLINE)fetch(`${SB_URL}/rest/v1/challenge_results?apikey=${SB_KEY}`,{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({challenge_id:c.id,device_id:deviceId(),name:chalName().slice(0,40),w:r.W,d:r.D,l:r.L,pts:r.pts,place:r.place,gf:r.gf,ga:r.ga})}).then(()=>chalLoad(true)).catch(()=>{});
}
