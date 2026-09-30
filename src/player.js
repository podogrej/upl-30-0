// ---------- СТОРІНКА ГРАВЦЯ (0.59, docs/player_page.md): своя — повністю; чужа — ім'я, цифри, улюблений клуб, трофеї; без входу — з попередженням.
// Адреса чужої сторінки — ?u=<public_id> (players.public_id, 8 символів). device_id і номер гравця в посиланні не світимо.
// Дані: чужа — player_profile_pub (sql/v059_player_page.sql); своя — player_profile + локальні трофеї, серія, історія сезонів (seasons за своїм player_id).
// іконки, яких ще немає в icons.js (Material Design Icons; при наступній генерації icons/make_icons.py — перенести в UI)
Object.assign(ICO,{pencil:['0 0 24 24','M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75M3 17.25V21h3.75L17.81 9.93l-3.75-3.75z'],
  logout:['0 0 24 24','M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5M4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4z'],
  'alert-outline':['0 0 24 24','M12 2 1 21h22M12 6l7.53 13H4.47M11 10v4h2v-4m-2 6v2h2v-2']});
// ---------- аватарка: два кольори й простий узор із хешу публічного номера гравця (макет docs/mockups/header_avatar.png)
const AV_PAL=['#ff7a1a','#1c1c1d','#c44f00','#f4f1ea','#ff9a3d','#3a3a3c'];
const AV_PAIRS=[[0,1],[1,0],[2,3],[1,4],[5,0],[3,2],[0,5],[4,1]];
function avHash(s){let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function avatarSvg(seed,size){
  const h=avHash(seed),[a,b]=AV_PAIRS[h%AV_PAIRS.length].map(i=>AV_PAL[i]),kind=(h>>>4)%4;let g='';
  if(kind===0){for(let y=0;y<5;y++)for(let x=0;x<3;x++)if((h>>>(8+y*3+x))&1){g+=`<rect x="${10+x*16}" y="${10+y*16}" width="16" height="16"/>`;if(x<2)g+=`<rect x="${10+(4-x)*16}" y="${10+y*16}" width="16" height="16"/>`;}}
  else if(kind===1)g=`<path d="M0 100 L100 0 L100 100 Z"/><circle cx="${30+(h>>>9)%10}" cy="${32+(h>>>13)%8}" r="14"/>`;
  else if(kind===2)g=`<g transform="rotate(${[45,-45,0,90][(h>>>10)%4]} 50 50)"><rect x="-20" y="14" width="140" height="14"/><rect x="-20" y="43" width="140" height="14"/><rect x="-20" y="72" width="140" height="14"/></g>`;
  else{const q=(h>>>11)%4,pts=[[0,0],[100,0],[100,100],[0,100]];g=[0,2].map(k=>{const [cx,cy]=pts[(q+k)%4];return `<circle cx="${cx}" cy="${cy}" r="50"/>`;}).join('')+'<circle cx="50" cy="50" r="12"/>';}
  return `<svg class="av" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><defs><clipPath id="av${h}"><rect width="100" height="100" rx="22"/></clipPath></defs><g clip-path="url(#av${h})"><rect width="100" height="100" fill="${a}"/><g fill="${b}" shape-rendering="crispEdges">${g}</g></g></svg>`;}
const mySeed=()=>(PLAYER&&(PLAYER.public_id||PLAYER.id))||deviceId();
// ---------- дати
const UK_MON=['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];
const fmtLong=d=>{const s=String(d||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?`${+s.slice(8)} ${UK_MON[+s.slice(5,7)-1]} ${s.slice(0,4)}`:'';};
const fmtShort=d=>{const s=String(d||'').slice(0,10);return s.length===10?`${s.slice(8)}.${s.slice(5,7)}`:'';};
// ---------- рідкість трофеїв (docs/player_page.md): частка гравців, у кого трофей є. Секретні рідкості не мають — у них свій вигляд
const RARITY=[[20,'common','Звичайний'],[5,'rare','Рідкісний'],[1,'epic','Епічний'],[0,'legend','Легендарний']];
const RARITY_MIN_PLAYERS=10;   // менше гравців — частки ще нічого не значать, рівнів не показуємо
function trPct(id){return TR_PCT&&TR_PCT.players>=RARITY_MIN_PLAYERS?100*((TR_PCT.t||{})[id]||0)/TR_PCT.players:null;}
function trTier(t){if(t.sec)return null;const p=trPct(t.id);return p==null?null:RARITY.find(([m])=>p>=m);}
// ---------- стан сторінки
let PP=null;   // {u, own, prof, have:{id:{n,at}}, f, s, all, hist:{rows,more}}
function ppUrl(u){try{const q=new URLSearchParams(location.search);if(u)q.set('u',u);else q.delete('u');const s=q.toString();history.replaceState(null,'',location.pathname+(s?'?'+s:'')+location.hash);}catch(e){}}
function openPlayer(u){
  u=u&&/^[a-z2-9]{8}$/.test(u)?u:null;
  const own=!u||!!(PLAYER&&PLAYER.public_id===u);
  document.getElementById('viewBox').hidden=true;
  PP={u:own?(PLAYER&&PLAYER.public_id)||null:u,own,prof:null,f:'all',s:'rare',all:false,hist:null,loading:true};
  go(6);ppUrl(own?null:u);ppRender();ppLoad(PP);
  if(ONLINE&&!TR_PCT)trLoadPct().then(()=>{if(PP&&CUR_SEC===6)ppRenderCab();});
}
async function ppRpc(fn,args){const r=await fetch(`${SB_URL}/rest/v1/rpc/${fn}?apikey=${SB_KEY}`,{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify(args)});
  const t=await r.text();if(!r.ok)throw Object.assign(new Error(`${fn} ${r.status}: ${t.slice(0,120)}`),{status:r.status});return t?JSON.parse(t):null;}
async function ppLoad(st){
  let prof=null,err=false;
  if(ONLINE)try{prof=st.own?(PLAYER&&PLAYER.id?await ppRpc('player_profile',{p_player:PLAYER.id}):null):await ppRpc('player_profile_pub',{p_public:st.u});}catch(e){err=true;}
  if(prof&&!prof.public_id&&!prof.name)prof=null;   // гравця немає
  if(PP!==st)return;st.prof=prof;st.loading=false;st.err=err;ppRender();}
// своя сторінка: трофеї — з цього пристрою (з лічильниками), плюс відкриті на інших пристроях цього гравця (з бази)
function ppHave(){const st=PP;const h={};
  if(st.own){const s=trStore();for(const [id,e] of Object.entries(s.t))if(e&&e.n)h[id]={n:e.n,at:e.at};}
  for(const t of (st.prof&&st.prof.trophies)||[])if(!h[t.id])h[t.id]={n:1,at:t.at};
  return h;}
// ---------- розмітка
const ppTile=(n,l,sub,hot)=>`<div class="tile${hot?' hot':''}"><b>${n==null||n===''?'—':esc(String(n))}</b><span>${l}</span>${sub?`<small>${sub}</small>`:''}</div>`;
function ppRender(){
  const el=document.getElementById('pp');if(!el||!PP)return;const st=PP,p=st.prof||{},own=st.own;
  if(!own&&!st.loading&&!st.prof){el.innerHTML=`<div class="pp-sec"><h3>Гравець</h3></div><p class="muted">${st.err?'Сторінка зараз недоступна. Спробуй пізніше.':'Такого гравця немає.'}</p><div class="row"><button class="primary" id="ppHome">На головну</button></div>`;document.getElementById('ppHome').onclick=()=>go(1);return;}
  const name=own?(myName()||'гравець'):(p.name||'…');const seed=own?mySeed():(p.public_id||st.u);
  const guest=own&&ONLINE&&!SESSION;
  const loc=trStore(),si=streakInfo();
  const seasons=own?Math.max(p.seasons||0,loc.seasons||0):p.seasons;   // своя: і сезони, ще не записані в базу (офлайн, до входу)
  const best=p.best_classic!=null?p.best_classic:(own&&BEST.classic?BEST.classic.pts:null);
  const streak=own?Math.max(si.best||0,p.streak_best||0):p.streak_best;
  let h='';
  if(guest)h+=`<div class="pp-warn"><div class="h">${icon('alert-outline')}Усе зберігається лише на цьому пристрої</div><p>Очистиш кеш браузера чи Telegram, зміниш телефон, браузер або пристрій — і трофеї, рекорди та серія виклику дня зникнуть. Результати в таблицях залишаться, але не будуть пов’язані з тобою.</p><div class="row"><button class="primary" id="ppLogin">Увійти</button></div></div>`;
  h+=`<div class="pp-head">${avatarSvg(seed,64)}<div style="min-width:0"><div class="pp-name"><h1 id="ppName">${esc(name)}</h1>${own&&ONLINE&&PLAYER?`<button id="ppEdit" title="Змінити ім'я" aria-label="Змінити ім'я">${icon('pencil')}</button>`:''}</div><div class="pp-since">${p.since?'грає з '+fmtLong(p.since):st.loading?'…':''}</div></div></div>`;
  if(p.deleted)h+=`<p class="muted" style="margin-top:14px">Гравець видалив акаунт. Його результати лишились у таблицях під анонімним іменем.</p>`;
  else{
    h+=`<div class="tiles t2 pp-tiles">${ppTile(seasons,'сезонів зіграно')}${ppTile(p.champions,'чемпіонств')}${ppTile(best,'найкращий сезон','очок · класика',true)}${ppTile(p.perfect,'сезонів 30-0')}${ppTile(p.win_pct!=null?p.win_pct+'%':null,'перемог у матчах')}${ppTile(streak||(own?0:null),'серія виклику дня','днів поспіль · рекорд')}</div>`;
    const fc=p.fav_club&&p.fav_club.pct>=15?p.fav_club:null,fp=p.fav_player&&p.fav_player.k>1?p.fav_player:null;
    if(fc||fp)h+=`<div class="pp-fav">${fc?`<div>${ic('heart')}<div><span class="k">Улюблений клуб</span><b>${esc(fc.c)}</b></div><span class="v">${numOr0(fc.pct)}% вибору</span></div>`:''}${fp?`<div>${ic('account-circle')}<div><span class="k">Найчастіший гравець</span><b>${esc(fp.n)}</b></div><span class="v">×${numOr0(fp.k)}</span></div>`:''}</div>`;
    h+=`<div id="ppCab"></div>`;
    if(own)h+=ppXiHtml(p);
    if(own)h+=`<details class="pp-hist" id="ppHist"><summary>Останні сезони${p.seasons?` (${Math.min(10,p.seasons)} з ${p.seasons})`:''}</summary><div id="ppHistList"><p class="muted">Завантаження…</p></div></details><button class="primary wbtn" id="ppPlay">Зіграти новий сезон</button>`;
    else h+=`<div class="pp-sec"><h3>Історія</h3></div><div class="pp-lock">${icon('eye-off')}Історію сезонів бачить лише ${esc(name)}</div>`;
  }
  if(own&&ONLINE)h+=ppSettingsHtml();
  el.innerHTML=h;
  if(!p.deleted)ppRenderCab();
  ppWire();
}
// найкращий і найгірший XI за режимами (лише своя сторінка)
const PP_BUCKETS=[['classic','Класика','trophy'],['daily','Виклик дня','calendar-star'],['derby','Дербі','lightning-bolt'],['oneclub','Один клуб','heart'],['anti','Антисезон','arrow-down-bold'],['legends','Ліга легенд','crown']];
function ppXiRow(x,kind,label,icn){if(!x)return '';const sub=[`${numOr0(x.place)} місце`,`${numOr0(x.w)}-${numOr0(x.d)}-${numOr0(x.l)}`,esc(x.formation||''),x.avg!=null?`сер. ${esc(String(x.avg))}`:'',x.club&&CLUBN[x.club]?esc(CLUBN[x.club]):''].filter(Boolean).join(' · ');
  return `<div class="pp-row" data-sid="${numOr0(x.id)}" role="button" tabindex="0">${ic(icn)}<div class="t"><b>${label} <em class="pp-k ${kind}">${kind==='best'?'найкращий':'найгірший'}</em></b><span>${sub}</span></div><span class="n${kind==='best'?' g':''}">${numOr0(x.pts)}<small>оч</small></span>${icon('chevron-right')}</div>`;}
function ppXiHtml(p){const b=p.best||{},w=p.worst||{};const rows=PP_BUCKETS.map(([k,l,i])=>ppXiRow(b[k],'best',l,i)+ppXiRow(w[k],'worst',l,i)).join('');
  return rows?`<div class="pp-sec"><h3>Найкращий і найгірший XI</h3></div><div class="pp-list">${rows}</div>`:'';}
// шафа трофеїв: фільтр за розділами (N/M), сортування «за рідкістю» / «нещодавні»
function ppRenderCab(){
  const el=document.getElementById('ppCab');if(!el||!PP)return;const st=PP,own=st.own,have=ppHave();
  const mine=trStore().t;const got=t=>!!have[t.id];
  const LIVE=TROPHIES.filter(t=>!t.gone||got(t));const total=LIVE.length,n=LIVE.filter(got).length;
  const cats=[['all','Усі'],...TR_CATS];
  const inCat=(t,c)=>c==='all'||t.cat===c;
  let list=LIVE.filter(t=>inCat(t,st.f));
  const on=list.filter(got),off=own?list.filter(t=>!got(t)&&!t.sec):[];const secOff=list.filter(t=>!got(t)&&t.sec).length;
  const rk=t=>{if(t.sec)return -1;const p=trPct(t.id);return p==null?1e3:p;};
  if(st.s==='recent')on.sort((a,b)=>String(have[b.id].at||'').localeCompare(String(have[a.id].at||''))||rk(a)-rk(b));
  else on.sort((a,b)=>rk(a)-rk(b)||String(have[b.id].at||'').localeCompare(String(have[a.id].at||'')));
  off.sort((a,b)=>rk(a)-rk(b));
  const cards=[...on,...off];const LIM=12;const shown=st.all?cards:cards.slice(0,LIM);
  const card=t=>{const e=have[t.id];
    if(!own&&t.sec&&e&&!(mine[t.id]&&mine[t.id].n))return `<div class="tro on sec"><span class="tri">${trBadge({id:'secret',cat:'secret'},true)}</span><div class="trt"><b>Секретний трофей</b><span>Відкрий його сам, щоб дізнатися, за що він</span><span class="trp">секретний${e.at?' · '+fmtShort(e.at):''}</span></div></div>`;
    const tier=trTier(t),p=trPct(t.id);
    const meta=[t.sec?'секретний':tier?tier[2]:'',p!=null&&!t.sec?(p===0?'ще ніхто не відкрив':`є в ${p<1?'<1':Math.round(p)}% гравців`):'',e&&e.at?fmtShort(e.at):''].filter(Boolean).join(' · ');
    return `<div class="tro${e?' on':''}${t.sec?' sec':''}${tier&&e?' rt-'+tier[1]:''}" data-tr="${esc(t.id)}"><span class="tri">${trBadge(t,!!e)}</span><div class="trt"><b>${esc(t.n)}</b>${trQ(t)}<span>${esc(t.d)}</span>${meta?`<span class="trp">${meta}</span>`:''}</div>${e&&e.n>1?`<span class="trn">×${e.n}</span>`:''}</div>`;};
  const cnt=c=>{const l=LIVE.filter(t=>inCat(t,c));return `${l.filter(got).length}/${l.length}`;};
  el.innerHTML=`<div class="pp-sec"><h3>Трофеї</h3><span class="best">Відкрито ${n} з ${total}</span></div><div class="pp-bar"><i style="width:${total?Math.round(100*n/total):0}%"></i></div>
    <div class="pp-filt" role="tablist">${cats.filter(([c])=>c==='all'||LIVE.some(t=>t.cat===c)).map(([c,l])=>`<button class="chip${st.f===c?' onc':''}" data-f="${c}" role="tab" aria-selected="${st.f===c}">${l} <i>${cnt(c)}</i></button>`).join('')}</div>
    <div class="seg pp-sort"><button data-s="rare" class="${st.s==='rare'?'on':''}">За рідкістю</button><button data-s="recent" class="${st.s==='recent'?'on':''}">Нещодавні</button></div>
    ${shown.length?`<div class="trg">${shown.map(card).join('')}</div>`:`<p class="pp-empty">${own?'Тут поки порожньо — зіграй сезон.':'Поки жодного трофея.'}</p>`}
    ${cards.length>shown.length?`<button class="ghost wbtn" id="ppCabAll">Показати всі · ${cards.length}</button>`:''}
    ${secOff&&own?`<p class="trsec">+${secOff} ${plUk(secOff,'секретний трофей чекає','секретні трофеї чекають','секретних трофеїв чекають')} ${icon('eye')}</p>`:''}
    ${own?`<div class="row" style="gap:6px;margin-top:10px">${MILESTONES.map(([k,,nm])=>{const e=have['ms'+k];return `<span class="chip ms${e?' onc':''}">${trBadge({id:'ms'+k,cat:'milestone'},!!e)}${nm}${!e&&trStore().seasons<k?` · ${trStore().seasons}/${k}`:''}</span>`;}).join('')}</div>`:''}`;
  el.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{st.f=b.dataset.f;st.all=false;ppRenderCab();});
  el.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{st.s=b.dataset.s;ppRenderCab();});
  const all=document.getElementById('ppCabAll');if(all)all.onclick=()=>{st.all=true;ppRenderCab();};
}
// історія: 10 останніх сезонів, «Ще 10» — лише за натисканням
const PP_MODE_DOT={classic:'var(--amber)',daily:'var(--df)',derby:'var(--fw)',oneclub:'var(--mf)',anti:'var(--muted)',legends:'var(--gk)'};
async function ppHistLoad(more){
  const st=PP,el=document.getElementById('ppHistList');if(!el||!st)return;const off=more&&st.hist?st.hist.rows.length:0;
  const sel='id,created_at,day,mode,format,club,w,d,l,pts,place';const by=PLAYER&&PLAYER.id?`player_id=eq.${PLAYER.id}`:`device_id=eq.${deviceId()}`;
  let rows=[];try{rows=await sbGetFallback([`seasons?select=${sel}&${by}&practice=is.false&order=created_at.desc&limit=10&offset=${off}`,`seasons?select=${sel}&device_id=eq.${deviceId()}&practice=is.false&order=created_at.desc&limit=10&offset=${off}`]);}catch(e){if(!off){el.innerHTML='<p class="muted">Історія зараз недоступна.</p>';return;}}
  if(PP!==st)return;st.hist={rows:[...(off&&st.hist?st.hist.rows:[]),...rows],more:rows.length===10};
  const lab=r=>r.day?'Виклик дня':(PP_BUCKETS.find(b=>b[0]===r.format)||[0,r.format])[1];
  el.innerHTML=st.hist.rows.length?`<div class="pp-list">${st.hist.rows.map(r=>`<div class="pp-row h" data-sid="${numOr0(r.id)}" role="button" tabindex="0"><span class="d">${fmtShort(r.day||r.created_at)}</span><div class="t"><b><i class="mdot" style="background:${PP_MODE_DOT[r.day?'daily':r.format]||'var(--muted)'}"></i>${esc(lab(r))}</b><span>${numOr0(r.place)} місце · ${numOr0(r.w)}-${numOr0(r.d)}-${numOr0(r.l)}</span></div><span class="n">${numOr0(r.pts)}<small>оч</small></span>${icon('chevron-right')}</div>`).join('')}</div>${st.hist.more?'<button class="ghost wbtn" id="ppMore" style="margin-top:8px">Ще 10 сезонів</button>':''}`:'<p class="muted">Ще немає зіграних сезонів.</p>';
  const m=document.getElementById('ppMore');if(m)m.onclick=()=>{m.disabled=true;ppHistLoad(true);};
}
// налаштування (лише своя сторінка): ім'я, вхід/вихід, видалення акаунта
function ppSettingsHtml(){
  const nx=PLAYER&&PLAYER.name_next&&PLAYER.name_next>new Date().toISOString()?PLAYER.name_next:null;
  const via=SESSION?((SESSION.user.app_metadata&&SESSION.user.app_metadata.provider)==='google'?'Google':'Telegram'):'';
  return `<div class="pp-sec"><h3>Налаштування</h3></div><div class="pp-acct">
    ${PLAYER?`<label for="ppNameIn"><b>Ім'я</b> <span class="muted" style="font-size:12px">— одне на всі таблиці, ліги й результати</span></label>
    <div class="row"><input id="ppNameIn" maxlength="20" autocomplete="nickname" value="${esc(PLAYER.name||'')}" placeholder="${esc(PLAYER.anon_name||'')}"><button class="ghost" id="ppNameSave">Зберегти</button></div>
    <p class="muted pp-hint" id="ppNameMsg">${nx?`Змінити знову можна з ${fmtLong(nx)}.`:`3–20 символів: малі літери, цифри, пробіл, _ ' -. Змінювати можна раз на 30 днів.`}${PLAYER.name?'':` Поки ти в таблицях як <b>${esc(PLAYER.anon_name||'')}</b>.`}</p>`:''}
    ${SESSION?`<div class="who">${icon(via==='Google'?'google':'telegram')}Увійшов через ${via}</div><div class="row"><button class="ghost" id="ppOut">${ic('logout','sm')}Вийти</button></div>`
      :`<span class="muted" style="font-size:13px">Увійди, щоб трофеї, рекорди й серія зберігались на всіх пристроях.</span><div class="row"><button class="primary" id="ppLogin2">Увійти</button></div>`}
    ${PLAYER?`<button class="pp-del" id="ppDel">${SESSION?'Видалити акаунт…':'Видалити мої дані…'}</button><div id="ppDelBox" hidden class="pp-delbox"><p>Ім'я, вхід і прив'язку цього пристрою буде стерто назавжди. Результати лишаться в таблицях під анонімним іменем, але вже не будуть пов’язані з тобою. Трофеї й серія на цьому пристрої теж зникнуть.</p><div class="row"><button class="danger" id="ppDelYes">Так, видалити</button><button class="ghost" id="ppDelNo">Скасувати</button></div><p class="muted" id="ppDelMsg" style="margin:0"></p></div>`:''}
  </div>`;}
function ppWire(){
  const $=id=>document.getElementById(id);
  for(const id of ['ppLogin','ppLogin2'])if($(id))$(id).onclick=()=>{ACCT_MSG='';openAcct();};
  if($('ppEdit'))$('ppEdit').onclick=()=>{const f=$('ppNameIn');if(f){f.scrollIntoView({behavior:'smooth',block:'center'});f.focus();}};
  if($('ppPlay'))$('ppPlay').onclick=()=>go(4);
  const hd=$('ppHist');if(hd)hd.ontoggle=()=>{if(hd.open&&!(PP&&PP.hist))ppHistLoad(false);};
  if($('ppNameSave'))$('ppNameSave').onclick=async()=>{const b=$('ppNameSave'),m=$('ppNameMsg');b.disabled=true;const err=await playerRename($('ppNameIn').value);b.disabled=false;
    const m2=$('ppNameMsg')||m;if(err){m2.textContent=err;m2.classList.add('bad');return;}m2.classList.remove('bad');m2.innerHTML=PLAYER.name?`Збережено: <b>${esc(PLAYER.name)}</b>.`:`Готово: ти знову <b>${esc(PLAYER.anon_name)}</b>.`;const h=$('ppName');if(h)h.textContent=myName();};
  if($('ppOut'))$('ppOut').onclick=acctLogout;
  if($('ppDel'))$('ppDel').onclick=()=>{$('ppDelBox').hidden=false;$('ppDel').hidden=true;};
  if($('ppDelNo'))$('ppDelNo').onclick=()=>{$('ppDelBox').hidden=true;$('ppDel').hidden=false;};
  if($('ppDelYes'))$('ppDelYes').onclick=async()=>{const b=$('ppDelYes'),m=$('ppDelMsg');b.disabled=true;m.textContent='Видаляємо…';
    try{await playerRpc('delete_player');}catch(e){b.disabled=false;m.textContent=/404|PGRST202/.test(String(e.message))?'Видалення ще не ввімкнено. Спробуй пізніше.':'Не вдалося видалити. Спробуй ще раз.';return;}
    await acctWipe();document.getElementById('pp').innerHTML=`<div class="pp-sec"><h3>Акаунт видалено</h3></div><p class="muted">Особисті дані стерто. Результати лишились у таблицях під анонімним іменем.</p><div class="row"><button class="primary" id="ppBye">На головну</button></div>`;
    document.getElementById('ppBye').onclick=()=>{location.href=location.pathname;};};
  document.querySelectorAll('#pp [data-sid]').forEach(r=>{const open=()=>openView(`id=eq.${numOr0(r.dataset.sid)}`);r.onclick=open;r.onkeydown=e=>{if(e.key==='Enter')open();};});
}
// після видалення: вийти з акаунта й стерти все своє з цього пристрою (тема й «Що нового» лишаються)
async function acctWipe(){try{if(SB&&SESSION)await SB.auth.signOut();}catch(e){}SESSION=null;PLAYER=null;
  try{for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k&&k.startsWith('upl30_')&&k!=='upl30_theme'&&k!=='upl30_news_seen')localStorage.removeItem(k);}}catch(e){}
  BEST={};renderAcct();}
// посилання на сторінку гравця в таблицях: ім'я — з профілю (players), у нижньому регістрі
function plink(r){const n=pname(r),u=r&&r.players&&r.players.public_id;return u&&/^[a-z2-9]{8}$/.test(u)?`<a class="plink" href="?u=${u}" data-u="${u}">${esc(n)}</a>`:esc(n);}
// відкрито посилання ?u=… — чужа (або своя) сторінка
if(ONLINE){const m=/[?&]u=([a-z2-9]{8})(?:&|$)/.exec(location.search);if(m)setTimeout(()=>openPlayer(m[1]),0);}
