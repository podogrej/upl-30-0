// ---------- Friend challenge ("beat my result"): same wheel seed, formation, mode and opponents
// Every free classic game has a wheel seed. New challenges are no longer created in the UI; links already sent (?c=, startapp=c) keep working.
const wheelSeq=seed=>wheelFor(seed,'classic','all');
// new game: the server issues the wheel seed (api/_draft.js start) and later locks the squad and simulates the season (lock);
// the wheel is the same for a challenge replay. No answer within 6 s, the day limit or a hidden format: local wheel, season not verified (d.note)
const DRAFT_NOTE='Без зв\'язку з сервером. Сезон не потрапить у рекорди й таблиці.';
const DRAFT_BAD='Сервер не прийняв цей склад. Сезон не потрапить у рекорди й таблиці.';
const draftOk=()=>(S.format==='classic'||S.format==='oneclub')&&['normal','hard','practice'].includes(S.mode)&&!S.pickMode;
function draftNew(extra){trafficSend('season_start');
  const d={seed:0,year:oppYear(),seq:[],ptr:0,sid:null,note:''};
  const local=note=>{d.seed=extra&&extra.ws?extra.ws:Math.floor(Math.random()*2147483647);d.note=note;};   // a challenge keeps its wheel even without the server
  const era=eraOf(),club=S.format==='oneclub'?S.club:null;
  d.wait=(async()=>{
    if(ONLINE&&(extra||draftOk())){
      const ctl=typeof AbortController!=='undefined'?new AbortController():null;const tm=setTimeout(()=>ctl&&ctl.abort(),6000);
      try{const r=await _fetch('/api/seed',{method:'POST',headers:{'Content-Type':'application/json'},signal:ctl&&ctl.signal,
          body:JSON.stringify({draft:'start',device_id:deviceId(),secret:devSecret(),format:S.format,mode:S.mode,era,club,formation:S.formation,league:lgAttempt(),...(extra?{fl_id:extra.fl_id,chal_id:extra.chal_id}:{})})});
        const j=await r.json().catch(()=>({}));
        if(r.ok&&j.seed_id){d.seed=+j.ws;d.sid=j.seed_id;d.year=+j.year||d.year;}else local(r.status===429&&j.error?j.error:DRAFT_NOTE);}
      catch(e){local(DRAFT_NOTE);}finally{clearTimeout(tm);}
    }else local(ONLINE?'':DRAFT_NOTE);
    d.seq=wheelFor(d.seed,S.format,era,club);d.wait=null;})();
  return d;}
// squad locked on "Play season": the server checks it against the wheel and fixes the season seed. null: play locally, not verified
async function draftLock(d,retry=2){
  if(!d||!d.sid||!ONLINE)return null;
  const ctl=typeof AbortController!=='undefined'?new AbortController():null;const tm=setTimeout(()=>ctl&&ctl.abort(),8000);
  try{const r=await _fetch('/api/seed',{method:'POST',headers:{'Content-Type':'application/json'},signal:ctl&&ctl.signal,
      body:JSON.stringify({draft:'lock',device_id:deviceId(),secret:devSecret(),seed_id:d.sid,xi:S.slots.map(s=>({id:s.player.id,slot:s.slot,c:s.player.club,y:s.player.y}))})});
    const j=await r.json().catch(()=>({}));if(r.ok&&j.seed)return j;
    if(r.status>=500&&retry>0){clearTimeout(tm);return draftLock(d,retry-1);}   // the server may have locked already: same squad, same answer
    d.note=r.status===429&&j.error?j.error:r.status>=500?DRAFT_NOTE:DRAFT_BAD;return null;}
  catch(e){clearTimeout(tm);if(retry>0)return draftLock(d,retry-1);d.note=DRAFT_NOTE;return null;}finally{clearTimeout(tm);}}
let CHAL=null;   // challenge currently opened via link
// challenger name comes from the player profile (audit V5); legacy rows without player fall back to name
const chalWho=x=>x&&x.players&&(x.players.name||x.players.anon_name)?pname(x):String((x&&x.name)||'друг').toLowerCase();
const chalLink=x=>x&&x.players&&x.players.public_id?plink(x):esc(chalWho(x));
// challenge link opened
function chalParam(){const m=/[?&]c=([A-Za-z0-9]{6,12})/.exec(location.search);if(m)return m[1];const sp=TG&&TG.initDataUnsafe&&TG.initDataUnsafe.start_param||'';const t=/^c([A-Za-z0-9]{6,12})$/.exec(sp);return t?t[1]:null;}
async function chalLoad(force){
  if(!ONLINE)return;const id=chalParam();if(!id||(!force&&CHAL&&CHAL.id===id))return;
  try{const rows=await sbGet(`challenges_pub?id=eq.${id}&select=*`);if(!rows.length)return;CHAL=rows[0];
    CHAL.results=await sbGet(`challenge_results_pub?challenge_id=eq.${id}&select=name,pts,w,d,l,place,created_at,players&order=pts.desc&limit=20`).catch(()=>[]);
    renderChal();}catch(e){}
}
function renderChal(){
  const el=document.getElementById('chalCard');if(!el)return;if(!CHAL){el.hidden=true;return;}const c=CHAL;
  el.hidden=false;el.innerHTML=`<div class="kicker">${ic('sword-cross','sm')}Виклик</div><div class="ttl">${chalLink(c)}: ${c.pts} ${ptsWord(c.pts)}</div>
    <div class="meta"><span class="chip">${c.w}-${c.d}-${c.l} · ${c.place} місце</span><span class="chip">Схема ${esc(c.formation)}</span><span class="chip">${MODES[c.mode]?MODES[c.mode].name:esc(c.mode)}</span><span class="chip">Суперники: ${esc(oppLabel(+c.year))}</span><span class="chip">Те саме колесо</span></div>
    ${c.results&&c.results.length?`<div class="tbl"><table>${c.results.slice(0,8).map(x=>`<tr><td>${chalLink(x)}</td><td class="num">${x.w}-${x.d}-${x.l}</td><td class="num"><b>${x.pts}</b></td><td>${x.pts>c.pts?ic('check-circle','sm')+'побив':x.pts===c.pts?ic('handshake','sm')+'нічия':'—'}</td></tr>`).join('')}</table></div>`:''}
    <div class="row"><button class="primary" id="chalGo">Прийняти виклик</button></div>`;
  document.getElementById('chalGo').onclick=chalStart;
}
function chalStart(){
  const c=CHAL;if(!c)return;S.league=null;S.vd=null;S.result=null;S.format='classic';S.pickMode=false;S.mode=c.mode==='hard'?'hard':'normal';S.formation=FORMATIONS[c.formation]?c.formation:'4-4-2';   // level: same rule as api/_draft.js start
  S.challenge=c;S.chal=draftNew({chal_id:c.id,ws:+c.seed});S.chal.year=+c.year;
  S.slots=newSlots(S.formation);S.taken=new Set();S.wheel=null;S.rerolls=MODES[S.mode].rerolls;
  document.getElementById('modeLabel').textContent=`Виклик · ${S.formation} · ${MODES[S.mode].name}`;renderDraft();go(2);
}
// after the season: compare with the challenge and save the result
function chalAfterSeason(r){
  const line=document.getElementById('chalLine');
  if(!line)return;line.hidden=true;const c=S.challenge;if(!c)return;
  const diff=r.pts-c.pts;line.hidden=false;
  line.innerHTML=`${ic('sword-cross','sm')}Ти <b>${r.pts}</b> : <b>${c.pts}</b> ${esc(chalWho(c))} — ${diff>0?`<b>виклик прийнято й виграно</b> (+${diff})`:diff===0?'нічия за очками':`не вистачило ${-diff} ${ptsWord(-diff)}`}`;
  if(ONLINE)setTimeout(()=>chalLoad(true),1500);   // the server wrote the result when the squad was locked
}
