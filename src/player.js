// ---------- PLAYER PAGE (docs/player_page.md): own page in full; others: name, stats, favourite club, trophies; signed out: with a warning.
// Other player's URL: ?u=<public_id> (players.public_id, 8 chars). device_id and internal player id never appear in links.
// Data: others from player_profile_pub (sql/v059_player_page.sql); own from player_profile + local trophies, streak, season history (seasons by own player_id).
// ---------- avatar: two colors and a simple pattern from the public id hash (mockup docs/mockups/header_avatar.png)
const AV_PAL=['#e0287a','#0f1b3d','#9a2bb5','#ffffff','#ff5aa0','#26396b'];   // UPL palette
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
// ---------- dates
const UK_MON=['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];
const fmtLong=d=>{const s=String(d||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?`${+s.slice(8)} ${UK_MON[+s.slice(5,7)-1]} ${s.slice(0,4)}`:'';};
const fmtShort=d=>{const s=String(d||'').slice(0,10);return s.length===10?`${s.slice(8)}.${s.slice(5,7)}`:'';};
// ---------- trophy rarity (docs/player_page.md): share of players who own it. Secret trophies have no rarity, they have their own look
const RARITY=[[20,'common','Звичайний'],[5,'rare','Рідкісний'],[1,'epic','Епічний'],[0,'legend','Легендарний']];
const RARITY_MIN_PLAYERS=10;   // below this player count the shares are meaningless; tiers are hidden
function trPct(id){return TR_PCT&&TR_PCT.players>=RARITY_MIN_PLAYERS?100*((TR_PCT.t||{})[id]||0)/TR_PCT.players:null;}
function trTier(t){if(t.sec)return null;const p=trPct(t.id);return p==null?null:RARITY.find(([m])=>p>=m);}
// ---------- page state
let PP=null;   // {u, own, prof, have:{id:{n,at}}, f, s, all, hist:{rows,more}}
function ppUrl(u){try{const q=new URLSearchParams(location.search);if(u)q.set('u',u);else q.delete('u');const s=q.toString();history.replaceState(history.state,'',location.pathname+(s?'?'+s:'')+location.hash);}catch(e){}}
function openPlayer(u){
  u=u&&/^[a-z2-9]{8}$/.test(u)?u:null;
  const own=!u||!!(PLAYER&&PLAYER.public_id===u);
  document.getElementById('viewBox').hidden=true;
  PP={u:own?(PLAYER&&PLAYER.public_id)||null:u,own,prof:null,f:'all',s:'rare',all:false,hist:null,loading:true};
  go(6);ppUrl(own?null:u);ppRender();ppLoad(PP);
  if(ONLINE&&!TR_PCT)trLoadPct().then(()=>{if(PP&&CUR_SEC===6)ppRenderCab();});
}
// scroll to the trophy cabinet (Trophies button on home); the cabinet appears after the profile loads
function ppScrollCab(n){const el=document.getElementById('ppCab');if(el&&el.children.length){el.scrollIntoView({behavior:'smooth',block:'start'});return;}if((n||0)<30)setTimeout(()=>ppScrollCab((n||0)+1),150);}
async function ppRpc(fn,args){const r=await fetch(`${SB_URL}/rest/v1/rpc/${fn}?apikey=${SB_KEY}`,{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify(args)});
  const t=await r.text();if(!r.ok)throw Object.assign(new Error(`${fn} ${r.status}: ${t.slice(0,120)}`),{status:r.status});return t?JSON.parse(t):null;}
async function ppLoad(st){
  let prof=null,err=false;
  if(ONLINE)try{prof=st.own?(PLAYER&&PLAYER.id?await ppRpc('player_profile',{p_player:PLAYER.id}):null):await ppRpc('player_profile_pub',{p_public:st.u});}catch(e){err=true;}
  if(st.own&&prof)trSrvRefresh(prof);
  if(prof&&!prof.public_id&&!prof.name)prof=null;   // no such player
  if(PP!==st)return;st.prof=prof;st.loading=false;st.err=err;ppRender();}
// own page: trophies from this device (with counters) plus those unlocked on the player's other devices (from DB)
// account trophies from server go to cache for the home counter (renderTrBtn); once per page load
let TR_SRV_AT=0;
async function trSrvRefresh(prof){if(!prof){if(!ONLINE||!PLAYER||!PLAYER.id||Date.now()-TR_SRV_AT<6e4)return;TR_SRV_AT=Date.now();try{prof=await ppRpc('player_profile',{p_player:PLAYER.id});}catch(e){return;}}
  if(prof&&Array.isArray(prof.trophies)){lsSet('upl30_tr_srv',prof.trophies.map(t=>t.id));renderTrBtn();}}
function ppHave(){const st=PP;const h={};
  if(st.own){const s=trStore();for(const [id,e] of Object.entries(s.t))if(e&&e.n)h[id]={n:e.n,at:e.at};}
  for(const t of (st.prof&&st.prof.trophies)||[])if(!h[t.id])h[t.id]={n:1,at:t.at};
  return h;}
// ---------- markup
const ppTile=(n,l,hot)=>`<div class="tile${hot?' hot':''}"><b>${n==null||n===''?'—':esc(String(n))}</b><span>${l}</span></div>`;
function ppRender(){
  const el=document.getElementById('pp');if(!el||!PP)return;const st=PP,p=st.prof||{},own=st.own;
  if(!own&&!st.loading&&!st.prof){el.innerHTML=`<div class="pp-sec"><h3>Гравець</h3></div><p class="muted">${st.err?'Сторінка зараз недоступна. Спробуй пізніше.':'Такого гравця немає.'}</p><div class="row"><button class="primary" id="ppHome">На головну</button></div>`;document.getElementById('ppHome').onclick=()=>go(1);return;}
  const wait=st.loading&&!own,name=own?(myName()||'гравець'):(p.name||'');const seed=own?mySeed():(p.public_id||st.u);
  const guest=own&&ONLINE&&!SESSION;
  const loc=trStore(),si=streakInfo();
  const seasons=own?Math.max(p.seasons||0,loc.seasons||0):p.seasons;   // own page also counts seasons not yet saved to DB (offline, before sign-in)
  const best=p.best_classic!=null?p.best_classic:(own&&BEST.classic?BEST.classic.pts:null);
  const streak=own?Math.max(si.best||0,p.streak_best||0):p.streak_best;
  let h='';
  if(guest)h+=`<div class="pp-warn"><div class="h">${icon('alert-outline')}Усе зберігається лише на цьому пристрої</div><p>Очистиш кеш браузера чи Telegram, зміниш телефон, браузер або пристрій — і трофеї, рекорди та серія драфту дня зникнуть. Результати в таблицях залишаться, але не будуть пов’язані з тобою.</p><div class="row"><button class="primary" id="ppLogin">Увійти</button></div></div>`;
  h+=`<div class="pp-head">${avatarSvg(seed,64)}<div style="min-width:0"><div class="pp-name"><h1 id="ppName">${wait&&!name?'<i class="sk w60"></i>':esc(name)}</h1>${own&&ONLINE&&PLAYER?`<button id="ppEdit" title="Змінити ім'я" aria-label="Змінити ім'я">${icon('pencil')}</button>`:''}</div><div class="pp-since">${p.since?'грає з '+fmtLong(p.since):st.loading?'<i class="sk w40"></i>':''}</div></div></div>`;
  if(p.deleted)h+=`<p class="muted" style="margin-top:var(--sp-4)">Гравець видалив акаунт. Його результати лишились у таблицях під анонімним іменем.</p>`;
  else{
    const rest=[p.win_pct!=null?`${p.win_pct}% перемог у матчах`:'',`сезонів 30-0: ${numOr0(p.perfect)}`,streak||own?`серія драфту дня: ${numOr0(streak)}`:''].filter(Boolean).join(' · ');
    const tile=(n,l,hot)=>wait?`<div class="tile${hot?' hot':''}"><b><i class="sk num"></i></b><span>${l}</span></div>`:ppTile(n,l,hot);
    h+=`<div class="pp-big3 pp-tiles">${tile(seasons,plUk(numOr0(seasons),'сезон','сезони','сезонів'))}${tile(p.champions,'чемпіонств')}${tile(best,'рекорд, очок',true)}</div><p class="pp-rest">${wait?'<i class="sk w80"></i>':rest}</p>`;
    const fc=p.fav_club&&p.fav_club.pct>=15?p.fav_club:null,fp=p.fav_player&&p.fav_player.k>1?p.fav_player:null;
    if(fc||fp)h+=`<div class="pp-fav">${fc?`<div>${ic('heart')}<div><span class="k">Улюблений клуб</span><b>${esc(fc.c)}</b></div><span class="v">${numOr0(fc.pct)}% вибору</span></div>`:''}${fp?`<div>${ic('account-circle')}<div><span class="k">Найчастіший гравець</span><b>${esc(fp.n)}</b></div><span class="v">×${numOr0(fp.k)}</span></div>`:''}</div>`;
    h+=`<div id="ppCab"></div>`;
    if(own)h+=ppXiHtml(p);
    if(own)h+=`<details class="pp-hist" id="ppHist"><summary>Останні сезони${p.seasons?` (${Math.min(10,p.seasons)} з ${p.seasons})`:''}</summary><div id="ppHistList">${skBox(`<div class="pp-list">${skN(3,()=>'<div class="pp-row h"><span class="d"><i class="sk"></i></span><div class="t"><b><i class="sk w60"></i></b><span><i class="sk w40"></i></span></div><span class="n"><i class="sk num"></i></span><i class="sk w20"></i></div>')}</div>`)}</div></details>`;
    else h+=`<div class="pp-sec"><h3>Історія</h3></div><div class="pp-lock">${icon('eye-off')}Історію сезонів бачить лише ${esc(name)}</div>`;
  }
  if(own&&ONLINE&&!p.deleted)h+=`<div id="ppLeagues"></div>`;   // "My leagues" (src/leagues.js)
  if(own&&ONLINE)h+=ppSettingsHtml();
  el.innerHTML=h;
  if(!p.deleted)ppRenderCab();
  if(own&&ONLINE&&!p.deleted)ppLeagues();
  ppWire();
}
// best and worst XI per mode (own page only)
const PP_BUCKETS=[['classic','Класика','trophy'],['pick','Вибір сезону','calendar-check'],['daily','Драфт дня','calendar-star'],['derby','Дербі','lightning-bolt'],['oneclub','Один клуб','heart'],['anti','Антисезон','arrow-down-bold'],['legends','Ліга легенд','crown']];
function ppXiRow(x,kind,label,icn){if(!x)return '';const sub=[`${numOr0(x.place)} місце`,`${numOr0(x.w)}-${numOr0(x.d)}-${numOr0(x.l)}`,esc(x.formation||''),x.avg!=null?`сер. ${esc(String(x.avg))}`:'',x.club&&CLUBN[x.club]?esc(CLUBN[x.club]):''].filter(Boolean).join(' · ');
  return `<div class="pp-row" data-sid="${numOr0(x.id)}" role="button" tabindex="0">${ic(icn)}<div class="t"><b>${label} <em class="pp-k ${kind}">${kind==='best'?'найкращий':'найгірший'}</em></b><span>${sub}</span></div><span class="n${kind==='best'?' g':''}">${numOr0(x.pts)}<small>оч</small></span>${icon('chevron-right')}</div>`;}
function ppXiHtml(p){const b=p.best||{},w=p.worst||{};const rows=PP_BUCKETS.map(([k,l,i])=>ppXiRow(b[k],'best',l,i)+ppXiRow(w[k],'worst',l,i)).join('');
  return rows?`<div class="pp-sec"><h3>Найкращий і найгірший XI</h3></div><div class="pp-list">${rows}</div>`:'';}
// trophy cabinet: filter by section (N/M), sort by rarity / recent
function ppRenderCab(){
  const el=document.getElementById('ppCab');if(!el||!PP)return;const st=PP,own=st.own,have=ppHave();
  const mine=trStore().t;const got=t=>!!have[t.id];
  const LIVE=TROPHIES.filter(t=>!t.gone||got(t));const total=LIVE.length,n=LIVE.filter(got).length;
  const cats=[['all','Усі'],...TR_KINDS];
  const inCat=(t,c)=>c==='all'||trKind(t)===c;   // filters use the same three classes as colors
  let list=LIVE.filter(t=>inCat(t,st.f));
  const on=list.filter(got),off=own?list.filter(t=>!got(t)&&!t.sec):[];const secOff=list.filter(t=>!got(t)&&t.sec).length;
  const rk=t=>{if(t.sec)return -1;const p=trPct(t.id);return p==null?1e3:p;};
  if(st.s==='recent')on.sort((a,b)=>String(have[b.id].at||'').localeCompare(String(have[a.id].at||''))||rk(a)-rk(b));
  else on.sort((a,b)=>rk(a)-rk(b)||String(have[b.id].at||'').localeCompare(String(have[a.id].at||'')));
  off.sort((a,b)=>rk(a)-rk(b));
  const cards=[...on,...off];const shown=st.all?cards:on;   // collapsed: unlocked only
  const card=t=>{const e=have[t.id];
    if(!own&&t.sec&&e&&!(mine[t.id]&&mine[t.id].n))return `<div class="tro k-secret on sec"><span class="tri">${trBadge({id:'secret',cat:'secret'},true)}</span><div class="trt"><b>Секретний трофей</b><span>Відкрий його сам, щоб дізнатися, за що він</span><span class="trp">секретний${e.at?' · '+fmtShort(e.at):''}</span></div></div>`;
    const tier=trTier(t),p=trPct(t.id);
    const gem=e&&tier&&tier[1]!=='common';   // rarity from "rare" up: badge on the right, not inline
    const meta=[t.sec?'секретний':tier&&!gem?tier[2]:'',p!=null&&!t.sec?(p===0?'ще ніхто не відкрив':`є в ${p<1?'<1':Math.round(p)}% гравців`):'',e&&e.at?fmtShort(e.at):''].filter(Boolean).join(' · ');
    return `<div class="tro k-${trKind(t)}${e?' on':''}${t.sec?' sec':''}${tier&&e?' rt-'+tier[1]:''}" data-tr="${esc(t.id)}"><span class="tri">${trBadge(t,!!e)}</span><div class="trt"><b>${esc(t.n)}</b>${trQ(t)}<span>${esc(t.d)}</span>${meta||trBusy()&&!t.sec?`<span class="trp">${meta}${trBusy()&&!t.sec?(meta?' · ':'')+'<i class="sk"></i>':''}</span>`:''}</div>${gem?`<em class="gem rt-${tier[1]}">${tier[2]}</em>`:''}${e&&e.n>1?`<span class="trn">×${e.n}</span>`:''}</div>`;};
  const cnt=c=>{const l=LIVE.filter(t=>inCat(t,c));return `${l.filter(got).length}/${l.length}`;};
  // order: cards -> "+N secret" -> milestones -> collapse; secret row centered, badge aligned with text
  el.innerHTML=`<div class="pp-sec"><h3>Трофеї</h3><span class="best">Відкрито ${n} з ${total}</span></div><div class="pp-bar"><i style="width:${total?Math.round(100*n/total):0}%"></i></div>
    ${own&&n?`<button class="ghost wbtn" id="ppCabShare">${ic('bookshelf','sm')}Поділитися шафою</button><div id="ppCabOut" hidden class="pp-cabout"><img id="ppCabImg" alt="Шафа трофеїв"><div class="row"><button class="primary" id="ppCabSend" hidden>${ic('share-variant','sm')}Поділитися</button><span class="muted" id="ppCabMsg" style="font-size:var(--fs-footnote)"></span></div></div>`:''}
    ${st.all?`<div class="pp-filt" role="tablist">${cats.filter(([c])=>c==='all'||LIVE.some(t=>inCat(t,c))).map(([c,l])=>`<button class="chip${st.f===c?' onc':''}" data-f="${c}" role="tab" aria-selected="${st.f===c}">${l} <i>${cnt(c)}</i></button>`).join('')}</div>
    <div class="seg pp-sort"><button data-s="rare" class="${st.s==='rare'?'on':''}">За рідкістю</button><button data-s="recent" class="${st.s==='recent'?'on':''}">Нещодавні</button></div>`:''}
    ${st.all&&shown.length?`<div class="trleg"><div class="h">Колір картки — клас трофея</div><div class="row">${[['base','Основний'],['friends','З друзями'],['secret','Секретний']].map(([k,l])=>`<span class="it k-${k}"><i class="sw"></i>${l}</span>`).join('')}</div><div class="h">Значок праворуч — рідкість</div><div class="row">${RARITY.slice(1).map(([,k,l])=>`<em class="gem rt-${k}">${l}</em>`).join('')}</div></div>`:''}
    ${shown.length?`<div class="trg">${shown.map(card).join('')}</div>`:`<p class="pp-empty">${own?'Тут поки порожньо — зіграй сезон.':'Поки жодного трофея.'}</p>`}
    ${secOff&&own&&st.all?`<p class="trsec"><span>+${secOff} ${plUk(secOff,'секретний трофей чекає','секретні трофеї чекають','секретних трофеїв чекають')}</span>${icon('eye')}</p>`:''}
    ${own&&st.all?`<div class="row pp-ms">${MILESTONES.map(([k,,nm])=>{const e=have['ms'+k];return `<span class="chip ms${e?' onc':''}">${trBadge({id:'ms'+k,cat:'milestone'},!!e)}${nm}${!e&&trStore().seasons<k?` · ${trStore().seasons}/${k}`:''}</span>`;}).join('')}</div>`:''}
    ${cards.length>shown.length||st.all?`<button class="link0 pp-all" id="ppCabAll">${st.all?'Згорнути ▴':`Усі трофеї · ${total} ▾`}</button>`:''}`;
  el.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{st.f=b.dataset.f;ppRenderCab();});
  el.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{st.s=b.dataset.s;ppRenderCab();});
  const all=document.getElementById('ppCabAll');if(all)all.onclick=()=>{st.all=!st.all;ppRenderCab();};
  const sh=document.getElementById('ppCabShare');if(sh)sh.onclick=()=>ppShareCab(on.filter(got),n,total);
}
// "Share cabinet": 1080x1350 image: name, "unlocked N of M", up to 12 trophies (rarest first). Outside Telegram: system share sheet with file,
// in Telegram: bot sends the image to DM (api/card), otherwise long-press the image
const CAB_COL={base:'#8fa0d8',friends:'#33c9e6',secret:'#a970ff'};   // cabinet image uses the same three classes as the page
let CAB_CANVAS=null;
async function ppShareCab(got,n,total){try{await document.fonts.ready;}catch(e){}
  const W=1080,H=1350,c=document.createElement('canvas');c.width=W;c.height=H;CAB_CANVAS=c;const g=c.getContext('2d');
  const DISP='"KyivType Sans", sans-serif',BODY=DISP,MONO=DISP;   // 0.69.1: KyivType Sans
  const grd=g.createLinearGradient(0,0,0,H);grd.addColorStop(0,'#0b1430');grd.addColorStop(1,'#24124a');g.fillStyle=grd;g.fillRect(0,0,W,H);
  g.strokeStyle='rgba(255,255,255,.12)';g.lineWidth=4;g.strokeRect(40,40,W-80,H-80);
  g.fillStyle='#ffffff';g.font=`900 40px ${DISP}`;g.fillText('30-0',80,122);const lw=g.measureText('30-0 ').width;g.fillStyle='#ff5aa0';g.fillText('УПЛ',80+lw,122);
  g.fillStyle='#b3aea4';g.font=`600 28px ${MONO}`;g.fillText('ШАФА ТРОФЕЇВ',80,178);
  g.fillStyle='#ffffff';let fs=64;const nm=myName();g.font=`800 ${fs}px ${DISP}`;while(g.measureText(nm).width>W-160&&fs>34){fs-=2;g.font=`800 ${fs}px ${DISP}`;}g.fillText(nm,80,262);
  g.fillStyle='#ff5aa0';g.font=`700 34px ${BODY}`;g.fillText(`Відкрито ${n} з ${total}`,80,318);
  g.fillStyle='rgba(255,255,255,.08)';g.fillRect(80,340,W-160,14);g.fillStyle='#ff5aa0';g.fillRect(80,340,(W-160)*(total?n/total:0),14);
  const list=got.slice(0,12),cols=3,cw=(W-160)/cols,ch=222,y0=400;
  list.forEach((t,i)=>{const cx=80+(i%cols)*cw+cw/2,cy=y0+Math.floor(i/cols)*ch+70,R=58;
    g.beginPath();for(let k=0;k<6;k++){const a=Math.PI/3*k-Math.PI/2;g[k?'lineTo':'moveTo'](cx+R*Math.cos(a),cy+R*Math.sin(a));}g.closePath();
    g.fillStyle=CAB_COL[trKind(t)];g.globalAlpha=.22;g.fill();g.globalAlpha=1;g.lineWidth=5;g.strokeStyle=CAB_COL[trKind(t)];g.stroke();
    g.font=`52px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillText(t.i||'🏆',cx,cy+2);
    g.textBaseline='alphabetic';g.fillStyle='#ffffff';let f2=28;g.font=`700 ${f2}px ${BODY}`;let tn=t.n;while(g.measureText(tn).width>cw-20&&f2>20){f2-=1;g.font=`700 ${f2}px ${BODY}`;}
    while(g.measureText(tn).width>cw-20&&tn.length>4)tn=tn.slice(0,-2)+'…';g.fillText(tn,cx,cy+R+46);g.textAlign='left';});
  if(got.length>12){g.fillStyle='#b3aea4';g.font=`600 28px ${BODY}`;g.fillText(`і ще ${got.length-12}`,80,y0+4*ch-10);}
  g.fillStyle='#8f9bc4';g.font=`500 24px ${BODY}`;g.fillText('Збери свою 11-ку · '+SITE_HOST,80,H-62);
  const out=document.getElementById('ppCabOut'),img=document.getElementById('ppCabImg'),send=document.getElementById('ppCabSend'),msg=document.getElementById('ppCabMsg');if(!out)return;
  img.src=c.toDataURL('image/png');out.hidden=false;msg.textContent='';
  const inTg=!!(ONLINE&&TG&&TG.initData);let canFile=false;
  try{canFile=!inTg&&!!navigator.canShare&&navigator.canShare({files:[new File([new Blob(['x'],{type:'image/png'})],'x.png',{type:'image/png'})]});}catch(e){}
  send.hidden=!(inTg||canFile);send.innerHTML=inTg?`${ic('telegram','sm')}Надіслати мені в Telegram`:`${ic('share-variant','sm')}Поділитися`;
  if(!inTg&&!canFile)msg.textContent='Натисни й утримуй картинку, щоб зберегти її або поділитися.';
  send.onclick=()=>{const text=`🏆 Моя шафа трофеїв у 30-0 УПЛ: ${n} з ${total}`;
    if(inTg){send.disabled=true;msg.textContent='Надсилаємо…';_fetch('/api/card',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData:TG.initData,image:c.toDataURL('image/jpeg',0.9),caption:text})})
      .then(r=>r.json().catch(()=>({}))).then(j=>{msg.textContent=j.ok?`Готово — картинка в чаті з @${TG_BOT}.`:j.need_start?`Спочатку відкрий чат з @${TG_BOT} і натисни «Start».`:'Не вдалося надіслати.';}).catch(()=>{msg.textContent='Не вдалося надіслати: немає зв’язку.';}).finally(()=>{send.disabled=false;});return;}
    c.toBlob(bl=>{navigator.share({files:[new File([bl],'30-0-trophies.png',{type:'image/png'})],text}).catch(e=>{if(e&&e.name!=='AbortError')msg.textContent='Не вдалося відкрити меню «Поділитися».';});},'image/png');};
  out.scrollIntoView({behavior:'smooth',block:'center'});
}
// history: last 10 seasons, "10 more" on tap
const PP_MODE_DOT={classic:'var(--amber)',pick:'var(--mf)',daily:'var(--df)',derby:'var(--fw)',oneclub:'var(--mf)',anti:'var(--muted)',legends:'var(--gk)'};
async function ppHistLoad(more){
  const st=PP,el=document.getElementById('ppHistList');if(!el||!st)return;const off=more&&st.hist?st.hist.rows.length:0;
  const sel='id,created_at,day,mode,format,club,w,d,l,pts,place';const by=PLAYER&&PLAYER.id?`player_id=eq.${PLAYER.id}`:`device_id=eq.${deviceId()}`;
  let rows=[];try{rows=await sbGetFallback([`seasons?select=${sel}&${by}&practice=is.false&order=created_at.desc&limit=10&offset=${off}`,`seasons?select=${sel}&device_id=eq.${deviceId()}&practice=is.false&order=created_at.desc&limit=10&offset=${off}`]);}catch(e){if(!off){el.innerHTML='<p class="muted">Історія зараз недоступна.</p>';return;}}
  if(PP!==st)return;st.hist={rows:[...(off&&st.hist?st.hist.rows:[]),...rows],more:rows.length===10};
  const lab=r=>r.day?'Драфт дня':r.mode==='pick'?'Вибір сезону':(PP_BUCKETS.find(b=>b[0]===r.format)||[0,r.format])[1];
  el.innerHTML=st.hist.rows.length?`<div class="pp-list">${st.hist.rows.map(r=>`<div class="pp-row h" data-sid="${numOr0(r.id)}" role="button" tabindex="0"><span class="d">${fmtShort(r.day||r.created_at)}</span><div class="t"><b><i class="mdot" style="background:${PP_MODE_DOT[r.day?'daily':r.mode==='pick'?'pick':r.format]||'var(--muted)'}"></i>${esc(lab(r))}</b><span>${numOr0(r.place)} місце · ${numOr0(r.w)}-${numOr0(r.d)}-${numOr0(r.l)}</span></div><span class="n">${numOr0(r.pts)}<small>оч</small></span>${icon('chevron-right')}</div>`).join('')}</div>${st.hist.more?'<button class="ghost wbtn" id="ppMore" style="margin-top:var(--sp-2)">Ще 10 сезонів</button>':''}`:'<p class="muted">Ще немає зіграних сезонів.</p>';
  const m=document.getElementById('ppMore');if(m)m.onclick=()=>{m.disabled=true;ppHistLoad(true);};
}
// settings (own page only): shown expanded, list of rows like "Name > andré";
// tap opens a bottom sheet with a field and Save (ppSheet). Separate Account block: sign-in method, sign out; at the bottom: delete account
const ppRow=(id,k,sub,v,muted)=>`<button class="set-r" id="${id}"><span class="k">${k}<small>${sub}</small></span><span class="v${muted?' mu':''}">${esc(v)}</span>${icon('chevron-right')}</button>`;
function ppSettingsHtml(){
  const via=SESSION?((SESSION.user.app_metadata&&SESSION.user.app_metadata.provider)==='google'?'Google':'Telegram'):'';
  const team=lsGet('upl30_team')||'',mail=PLAYER&&PLAYER.contact_email||'';
  let h=`<div id="ppSet"><div class="pp-sec"><h3>Налаштування</h3></div><div class="set-card">`;
  if(PLAYER)h+=ppRow('ppRowName',"Ім'я",'одне на всі таблиці й ліги',PLAYER.name||PLAYER.anon_name||'',!PLAYER.name);
  h+=ppRow('ppRowTeam','Назва команди','на полі й у картці',team||'Твоя 11-ка',!team);
  if(PLAYER&&'contact_email' in PLAYER){h+=ppRow('ppRowMail','Пошта для новин','видно лише тобі',mail||'не вказано',!mail);
    h+=`<label class="set-r tg"><span class="k">Новини 30-0<small>великі оновлення, не частіше разу на місяць</small></span><input type="checkbox" role="switch" class="sw" id="ppNews"${PLAYER.news_optin?' checked':''}></label>`;}
  if(TG_BOT)h+=`<a class="set-r" id="ppNotify" href="https://t.me/${TG_BOT}?start=notify" target="_blank" rel="noopener"><span class="k">Сповіщення в Telegram<small>підсумок дня в лігах і нагадування про серію — вмикаєш у боті</small></span>${icon('chevron-right')}</a>`;   // opt-in lives in the bot (/notify), off by default
  h+=`</div><p class="pp-hint" id="ppSetMsg" hidden></p><div class="pp-sec"><h3>Акаунт</h3></div><div class="set-card">`;
  if(SESSION){const em=via==='Google'?(SESSION.user.email||''):acctName();
    h+=`<div class="set-r who"><i class="set-ic ${via==='Google'?'g':'t'}">${icon(via==='Google'?'google':'telegram')}</i><span class="k">Увійшов через ${via}<small>${esc(em)}</small></span></div>`+
       `<button class="set-r" id="ppOut">${ic('logout')}<span class="k">Вийти</span>${icon('chevron-right')}</button>`;}
  else h+=`<button class="set-r" id="ppLogin2"><span class="k">Увійти<small>щоб трофеї, рекорди й серія були на всіх пристроях</small></span>${icon('chevron-right')}</button>`;
  h+=`</div>`;
  if(PLAYER)h+=`<button class="pp-del" id="ppDel">${SESSION?'Видалити акаунт…':'Видалити мої дані…'}</button><div id="ppDelBox" hidden class="pp-delbox"><p>Ім'я, вхід і прив'язку цього пристрою буде стерто назавжди. Результати лишаться в таблицях під анонімним іменем, але вже не будуть пов’язані з тобою. Трофеї й серія на цьому пристрої теж зникнуть.</p><div class="row"><button class="danger" id="ppDelYes">Так, видалити</button><button class="ghost" id="ppDelNo">Скасувати</button></div><p class="muted" id="ppDelMsg" style="margin:0"></p></div>`;
  return h+`</div>`;}
// bottom sheet (iPad: centered): title, field, hint, Save; save(value) -> '' (done, close) or error text
function ppSheet({title,id,value,placeholder,hint,type,max,disabled,save,input,msgId,saveId}){msgId=msgId||id+'Msg';saveId=saveId||id+'Save';
  let pushed=false;const old=document.getElementById('ppSheet');if(old){pushed=!!(PPS&&PPS.pushed);PPS=null;old.remove();}
  const o=document.createElement('div');o.className='sheet0';o.id='ppSheet';
  o.innerHTML=`<div class="sheet-bd"></div><div class="sheet0-box" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1"><div class="sheet-head"><div class="grab" aria-hidden="true"></div><div class="sheet0-bar"><h3>${esc(title)}</h3><button class="link0" id="ppSheetX">Скасувати</button></div></div>
    <input id="${id}" type="${type||'text'}" maxlength="${max||40}" value="${esc(value||'')}" placeholder="${esc(placeholder||'')}" autocapitalize="none" autocorrect="off" spellcheck="false"${disabled?' disabled':''}>
    <p class="pp-hint" id="${msgId}">${hint||''}</p><button class="primary big0" id="${saveId}"${disabled?' disabled':''}>Зберегти</button></div>`;
  document.body.appendChild(o);const f=o.querySelector('#'+id),b=o.querySelector('#'+saveId),m=o.querySelector('#'+msgId);
  // closes at once, then drops its history entry (popstate finds nothing left to close)
  const c=sheetCtl(o,{panel:o.querySelector('.sheet0-box'),bd:o.querySelector('.sheet-bd'),request:()=>close()});
  c.dismiss=()=>{if(PPS!==c)return;PPS=null;sheetClose(c,()=>o.remove(),c.vy);};
  const close=()=>{if(PPS!==c)return;const pop=c.pushed;c.dismiss();if(pop&&SHEET)history.back();};
  PPS=c;c.pushed=pushed;if(!pushed&&!SHEET){sheetOpen();c.pushed=true;}
  sheetDrag(c,o.querySelector('.sheet-head'));sheetEnter(c);
  o.onclick=e=>{if(e.target===o||e.target.classList.contains('sheet-bd'))close();};o.querySelector('#ppSheetX').onclick=close;if(input)f.oninput=()=>input(f);
  b.onclick=async()=>{b.disabled=true;const err=await save(f.value);b.disabled=false;if(err){m.innerHTML=err;m.classList.add('bad');return;}close();ppRender();};
  f.onkeydown=e=>{if(e.key==='Enter')b.click();};if(!disabled)setTimeout(()=>{if(PPS===c)f.focus();},60);}
function ppNameSheet(){if(!PLAYER)return;const nx=PLAYER.name_next&&PLAYER.name_next>new Date().toISOString()?PLAYER.name_next:null;
  ppSheet({title:"Ім'я",id:'ppNameIn',msgId:'ppNameMsg',saveId:'ppNameSave',value:PLAYER.name||'',placeholder:PLAYER.anon_name||'',max:20,disabled:!!nx,
    hint:nx?`Змінити знову можна з ${fmtLong(nx)}.`:`3–20 символів: латинські літери a–z, цифри, «_» і «.». Змінювати можна раз на 30 днів. Це ім'я бачать усі в таблицях і лігах.${PLAYER.name?'':` Поки ти в таблицях як <b>${esc(PLAYER.anon_name||'')}</b>.`}`,
    input:f=>{const v=f.value,w=v.toLowerCase().replace(/\s/g,'_');if(w!==v){const c=f.selectionStart;f.value=w;try{f.setSelectionRange(c,c);}catch(x){}}},   // lowercase and "_" instead of space while typing
    save:async v=>{const err=await playerRename(v);if(err)return esc(err);const h=document.getElementById('ppName');if(h)h.textContent=myName();
      ppFlash(PLAYER.name?`Збережено: <b>${esc(PLAYER.name)}</b>.`:`Готово: ти знову <b>${esc(PLAYER.anon_name)}</b>.`);return '';}});}
function ppFlash(html){setTimeout(()=>{const m=document.getElementById('ppSetMsg');if(m){m.hidden=false;m.innerHTML=html;}},0);}   // after ppRender
// newsletter email: separate from profile, never shown on the public page
async function ppMailSave(v,optin){v=(v||'').trim();
  if(v&&!/^[^@\s]{1,64}@[^@\s]+\.[^@\s.]{2,}$/.test(v))return 'Схоже, в адресі помилка.';
  try{const p=await playerRpc('set_player_contact',{p_email:v,p_optin:!!(v&&optin)});playerSet(p);
    ppFlash(p.contact_email?(p.news_optin?'Збережено. Новини — лише про великі оновлення.':'Пошту збережено. Новин не надсилатимемо, доки не ввімкнеш.'):'Пошту стерто.');return '';}
  catch(e){return /email_bad/.test(String(e.message))?'Схоже, в адресі помилка.':'Не вдалося зберегти. Спробуй ще раз.';}}
function ppWire(){
  const $=id=>document.getElementById(id);
  for(const id of ['ppLogin','ppLogin2'])if($(id))$(id).onclick=()=>{ACCT_MSG='';openAcct();};
  const hd=$('ppHist');if(hd)hd.ontoggle=()=>{if(hd.open&&!(PP&&PP.hist))ppHistLoad(false);};
  if($('ppEdit'))$('ppEdit').onclick=ppNameSheet;   // pencil next to the name in the header
  if($('ppRowName'))$('ppRowName').onclick=ppNameSheet;
  if($('ppRowTeam'))$('ppRowTeam').onclick=()=>ppSheet({title:'Назва команди',id:'ppTeam',value:lsGet('upl30_team')||'',placeholder:'Твоя 11-ка',max:22,
    hint:'Видно на полі й у картці результату. Порожнє поле — «Твоя 11-ка».',save:async v=>{lsSet('upl30_team',v.trim().slice(0,22)||null);return '';}});   // team name is set here
  if($('ppRowMail'))$('ppRowMail').onclick=()=>ppSheet({title:'Пошта для новин',id:'ppMail',type:'email',max:254,value:PLAYER.contact_email||'',placeholder:'name@gmail.com',
    hint:'Видно лише тобі. Порожнє поле — пошту буде стерто.',save:v=>ppMailSave(v,PLAYER.contact_email?PLAYER.news_optin:true)});   // new email: news enabled (as the field label says); later via toggle
  if($('ppNews'))$('ppNews').onchange=async e=>{const on=e.target.checked;
    if(!(PLAYER&&PLAYER.contact_email)){e.target.checked=false;$('ppRowMail').click();const m=$('ppMailMsg');if(m)m.textContent='Спершу впиши пошту — туди й надсилатимемо новини.';return;}
    const err=await ppMailSave(PLAYER.contact_email,on);if(err){e.target.checked=!on;ppFlash(esc(err));}else ppRender();};
  if($('ppOut'))$('ppOut').onclick=acctLogout;
  if($('ppDel'))$('ppDel').onclick=()=>{$('ppDelBox').hidden=false;$('ppDel').hidden=true;};
  if($('ppDelNo'))$('ppDelNo').onclick=()=>{$('ppDelBox').hidden=true;$('ppDel').hidden=false;};
  if($('ppDelYes'))$('ppDelYes').onclick=async()=>{const b=$('ppDelYes'),m=$('ppDelMsg');b.disabled=true;m.textContent='Видаляємо…';
    try{await playerRpc('delete_player');}catch(e){b.disabled=false;m.textContent=/404|PGRST202/.test(String(e.message))?'Видалення ще не ввімкнено. Спробуй пізніше.':'Не вдалося видалити. Спробуй ще раз.';return;}
    await acctWipe();document.getElementById('pp').innerHTML=`<div class="pp-sec"><h3>Акаунт видалено</h3></div><p class="muted">Особисті дані стерто. Результати лишились у таблицях під анонімним іменем.</p><div class="row"><button class="primary" id="ppBye">На головну</button></div>`;
    document.getElementById('ppBye').onclick=()=>{location.href=location.pathname;};};
  document.querySelectorAll('#pp [data-sid]').forEach(r=>{const open=()=>openView(`id=eq.${numOr0(r.dataset.sid)}`);r.onclick=open;r.onkeydown=e=>{if(e.key==='Enter')open();};});
}
// after deletion: sign out and wipe own data from this device (theme and What's new state stay)
async function acctWipe(){try{if(SB&&SESSION)await SB.auth.signOut();}catch(e){}SESSION=null;PLAYER=null;
  try{for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k&&k.startsWith('upl30_')&&k!=='upl30_theme'&&k!=='upl30_news_seen')localStorage.removeItem(k);}}catch(e){}
  BEST={};renderAcct();}
// player page link in tables: name from profile (players), lowercase
function plink(r){const n=pname(r),u=r&&r.players&&r.players.public_id;return u&&/^[a-z2-9]{8}$/.test(u)?`<a class="plink" href="?u=${u}" data-u="${u}">${esc(n)}</a>`:esc(n);}
// ?u=... link opened: other (or own) player page
if(ONLINE){const m=/[?&]u=([a-z2-9]{8})(?:&|$)/.exec(location.search);if(m)setTimeout(()=>openPlayer(m[1]),0);}
