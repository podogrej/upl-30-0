// ---------- АКАУНТ (необов'язковий): грати можна без нього; вхід зберігає трофеї, серію, рекорди й нік на всіх пристроях
// Вхід: Google (Supabase Auth), Telegram (Mini App — автоматично; сайт — віджет Telegram), обидва через /api/auth для Telegram.
const AUTH_GOOGLE=true;            // вхід через Google (Supabase OAuth). У Telegram-застосунку Google вхід блокує, тому там кнопку не показуємо
const AUTH_TG=()=>!!TG_BOT;
const IN_TG=()=>!!(TG&&TG.initData);        // вхід через Telegram на сайті — після створення бота
let SB=null,SESSION=null,ACCT_MSG='',ACCT_ERR='';
const _fetch=window.fetch.bind(window);
if(ONLINE){
  // запити до бази від імені користувача: додаємо його токен; якщо токен протух — повторюємо анонімно
  window.fetch=async(u,o)=>{
    const url=typeof u==='string'?u:(u&&u.url)||'';
    if(!SESSION||!url.startsWith(SB_URL+'/rest/'))return _fetch(u,o);
    const o2={...(o||{}),headers:{...((o&&o.headers)||{}),Authorization:'Bearer '+SESSION.access_token}};
    const r=await _fetch(u,o2);if(r.status===401)return _fetch(u,o);return r;};
  const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  sc.onload=()=>acctInit();document.head.appendChild(sc);
}
// Safari інколи не пропускав заголовок apikey — дублюємо ключ у рядку запиту
const sbFetch=(u,o)=>{const url=typeof u==='string'?u:u.url;return _fetch(url+(url.includes('?')?'&':'?')+'apikey='+SB_KEY,o);};
function acctName(){const u=SESSION&&SESSION.user;if(!u)return '';const m=u.user_metadata||{};return m.full_name||m.name||m.tg_name||(u.email&&!u.email.endsWith('@users.upl-30-0.vercel.app')?u.email.split('@')[0]:'')||'Гравець';}
async function acctInit(){
  try{SB=window.supabase.createClient(SB_URL,SB_KEY,{global:{fetch:sbFetch},auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}});}catch(e){return;}
  SB.auth.onAuthStateChange((ev,s)=>{const was=!!SESSION;SESSION=s||null;renderAcct();if(SESSION&&!was&&ev!=='INITIAL_SESSION')acctOnLogin();});
  const {data}=await SB.auth.getSession();SESSION=data&&data.session||null;renderAcct();playerSync();
  if(SESSION)acctPull();
  else{acctTgAuto();if(!IN_TG()&&acctBotPending())acctBotPoll();}
}
function acctTgAuto(){if(!acctTgAuto.lg&&IN_TG()){acctTgAuto.lg=1;leagueInit();}if(SB&&!SESSION&&TG&&TG.initData&&!acctTgAuto.done){acctTgAuto.done=1;acctTelegram({initData:TG.initData},true);}}   // у Telegram — входимо мовчки
// ---------- синхронізація стану (трофеї, серія, рекорди, нік, спроба дня) через таблицю user_state
const ACCT_KEYS=()=>["upl30_tr","upl30_streak","upl30_best_v2","upl30_nick","upl30_daily_"+DAY,"upl30_sent_"+DAY,"upl30_tr_retro"];
function acctLocal(){const o={};for(const k of ACCT_KEYS()){const v=lsGet(k);if(v!=null)o[k]=v;}return o;}
function acctMerge(a,b){   // a — локальний, b — із сервера
  const o={...b,...a};
  const ta=a.upl30_tr,tb=b.upl30_tr;
  if(ta||tb){const t={...(tb&&tb.t||{})};for(const [id,e] of Object.entries(ta&&ta.t||{})){const f=t[id];t[id]=f?{n:Math.max(f.n,e.n),at:f.at<e.at?f.at:e.at}:e;}
    o.upl30_tr={t,seasons:Math.max(ta&&ta.seasons||0,tb&&tb.seasons||0),dailies:Math.max(ta&&ta.dailies||0,tb&&tb.dailies||0)};}
  const sa=a.upl30_streak,sb=b.upl30_streak;if(sa&&sb)o.upl30_streak=(sa.last>sb.last||(sa.last===sb.last&&sa.count>=sb.count))?sa:sb;
  const ba=a.upl30_best_v2||{},bb=b.upl30_best_v2||{};const best={...bb};
  for(const [k,v] of Object.entries(ba)){const w=best[k];const sc=x=>k==='anti'?-(x.pts*100-x.place):x.pts*100+(30-x.place);if(!w||sc(v)>sc(w))best[k]=v;}
  if(Object.keys(best).length)o.upl30_best_v2=best;
  if(b.upl30_nick)o.upl30_nick=b.upl30_nick;
  return o;
}
async function acctPull(){
  if(!SESSION)return null;
  try{const r=await fetch(`${SB_URL}/rest/v1/user_state?apikey=${SB_KEY}&user_id=eq.${SESSION.user.id}&select=data`);const rows=r.ok?await r.json():[];
    const server=rows[0]&&rows[0].data||{};const merged=acctMerge(acctLocal(),server);
    for(const [k,v] of Object.entries(merged))lsSet(k,v);
    if(merged.upl30_best_v2)BEST=merged.upl30_best_v2;
    await acctPush();renderTrBtn();showBest();renderDailyCard();return {server,merged};
  }catch(e){return null;}
}
async function acctPush(){if(!SESSION)return;try{await fetch(`${SB_URL}/rest/v1/user_state?apikey=${SB_KEY}&on_conflict=user_id`,{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:SESSION.user.id,data:acctLocal(),updated_at:new Date().toISOString()})});}catch(e){}}
async function acctOnLogin(){
  // прив'язати до акаунта все, що зіграно з цього пристрою, і злити прогрес
  try{await fetch(`${SB_URL}/rest/v1/rpc/claim_device?apikey=${SB_KEY}`,{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_device:deviceId()})});}catch(e){}
  await playerSync();
  const res=await acctPull();const s=trStore();
  ACCT_MSG=`Готово! Прогрес збережено в акаунті: ${s.seasons} ${plUk(s.seasons,'сезон','сезони','сезонів')}, трофеїв — ${Object.values(s.t).filter(e=>e.n).length}.`;
  if(!lsGet("upl30_nick")){const n=acctName();if(n)lsSet("upl30_nick",n.slice(0,24));}
  renderAcct();if(!document.getElementById('viewBox').hidden&&document.getElementById('viewTitle').textContent==='Акаунт')openAcct();
}
// ---------- способи входу
async function acctGoogle(){if(!SB)return;const {error}=await SB.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});if(error){ACCT_MSG='Не вдалося: '+error.message;openAcct();}}
async function acctTelegram(payload,silent){
  let step='0 (бібліотека)';
  try{if(!SB)throw new Error('бібліотека входу не завантажилась');
    step='1 (сервер /api/auth)';
    const r=await _fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const txt=await r.text();let j={};try{j=JSON.parse(txt);}catch(e){throw new Error(`відповідь ${r.status}: ${txt.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,120)}`);}
    if(r.status===202&&j.pending)return 'pending';   // вхід через бота: «Start» ще не натиснуто
    if(!r.ok||!j.token_hash)throw new Error((j.error||('HTTP '+r.status))+(j.status?' ('+j.status+')':''));
    step='2 (Supabase verify)';
    let ok=false;
    try{const {error}=await SB.auth.verifyOtp({token_hash:j.token_hash,type:'email'});if(error)throw error;ok=true;}
    catch(e1){   // запасний шлях: перевіряємо токен напряму й передаємо сесію бібліотеці
      step='3 (прямий verify після: '+String(e1.message||e1).slice(0,60)+')';
      const v=await _fetch(`${SB_URL}/auth/v1/verify?apikey=${SB_KEY}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:SB_KEY},body:JSON.stringify({token_hash:j.token_hash,type:'email'})});
      const vt=await v.text();let vj={};try{vj=JSON.parse(vt);}catch(e){throw new Error(`verify ${v.status}: ${vt.slice(0,100)}`);}
      if(!v.ok||!vj.access_token)throw new Error(`verify ${v.status}: ${(vj.msg||vj.error_description||vj.error||vt).toString().slice(0,100)}`);
      step='4 (setSession)';
      const {error}=await SB.auth.setSession({access_token:vj.access_token,refresh_token:vj.refresh_token});if(error)throw error;ok=true;}
    return 'ok';
  }catch(e){ACCT_ERR=`крок ${step}: ${e&&e.name&&e.name!=='Error'?e.name+': ':''}${String(e&&e.message||e).slice(0,160)}`;if(!silent){ACCT_MSG='Вхід через Telegram не вдався — '+ACCT_ERR;openAcct();}}
}
window.onTelegramAuth=u=>acctTelegram({widget:u});   // колбек віджета Telegram (віджет більше не показуємо — лишено для сумісності)
// ---------- вхід через бота: браузер створює одноразовий токен, гравець тисне «Start» у @upl30_bot, сторінка чекає підтвердження
function acctBotToken(){const a=new Uint8Array(16);crypto.getRandomValues(a);const t=[...a].map(b=>b.toString(16).padStart(2,'0')).join('');lsSet('upl30_login_tok',{t,at:Date.now()});return t;}
function acctBotPending(){const o=lsGet('upl30_login_tok');return o&&o.t&&Date.now()-o.at<10*60e3?o.t:null;}
let BOT_POLL=null;
function acctBotPoll(){if(BOT_POLL||SESSION)return;const tick=async()=>{const t=acctBotPending();if(!t||SESSION){clearInterval(BOT_POLL);BOT_POLL=null;return;}
    const res=await acctTelegram({login_token:t},true);
    if(res==='ok'){clearInterval(BOT_POLL);BOT_POLL=null;lsSet('upl30_login_tok',null);ACCT_MSG='Готово — ти увійшов через Telegram.';if(!document.getElementById('viewBox').hidden)openAcct();}
    else if(res!=='pending'&&/крок [234]/.test(ACCT_ERR||'')){clearInterval(BOT_POLL);BOT_POLL=null;lsSet('upl30_login_tok',null);ACCT_MSG='Вхід через Telegram не вдався — '+ACCT_ERR;openAcct();}};
  BOT_POLL=setInterval(tick,2500);tick();}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&acctBotPending()&&!SESSION){clearInterval(BOT_POLL);BOT_POLL=null;acctBotPoll();}});
async function acctLogout(){if(SB)await SB.auth.signOut();SESSION=null;ACCT_MSG='Ти вийшов. Прогрес на цьому пристрої лишився.';renderAcct();openAcct();}
// ---------- ГРАВЕЦЬ (v0.39): одна людина — один гравець. Пристрій і вхід (Google/Telegram) прив'язуються до нього в базі.
// Ім'я живе в профілі гравця: змінив — змінилося в усіх таблицях. Без імені — постійне анонімне («Silent Owl»).
let PLAYER=lsGet("upl30_player")||null;   // {id,name,anon_name}
function devSecret(){let s=lsGet("upl30_dsecret");if(!s||String(s).length<32){const a=new Uint8Array(24);crypto.getRandomValues(a);s=[...a].map(b=>b.toString(16).padStart(2,'0')).join('');lsSet("upl30_dsecret",s);}return s;}
function myName(){return (PLAYER&&(PLAYER.name||PLAYER.anon_name))||lsGet("upl30_nick")||'';}
async function playerRpc(fn,extra){
  const r=await fetch(`${SB_URL}/rest/v1/rpc/${fn}?apikey=${SB_KEY}`,{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_device:deviceId(),p_secret:devSecret(),...(extra||{})})});
  const t=await r.text();if(!r.ok)throw new Error(`${fn} ${r.status}: ${t.slice(0,120)}`);return JSON.parse(t);}
function playerSet(p){if(!p||!p.id)return;PLAYER=p;lsSet("upl30_player",p);if(p.name)lsSet("upl30_nick",p.name);renderAcct();myNameShow();}
async function playerSync(){
  if(!ONLINE)return;
  try{let p=null;
    if(SESSION){try{p=await playerRpc('link_account');}catch(e){p=null;}}
    if(!p)p=await playerRpc('player_hello');
    // перший раз: нік, яким гравець підписувався до 0.39, або ім'я з акаунта стає ім'ям профілю
    if(p&&!p.name){const nk=(lsGet("upl30_nick")||'').trim()||(SESSION?acctName():'');if(nk.length>=2&&nk!=='Гравець'&&nk!==p.anon_name)p=await playerRpc('set_player_name',{p_name:nk.slice(0,24)});}
    playerSet(p);
  }catch(e){console.warn('player',e);}
}
// будь-яке місце, де гравець вписав своє ім'я (таблиця дня, виклик, 5×5, налаштування), — оновлює профіль
function nickSet(v){v=String(v||'').trim().slice(0,24);if(v.length<2)return;if(PLAYER&&v===PLAYER.anon_name)return;lsSet("upl30_nick",v);
  if(ONLINE&&PLAYER&&v!==PLAYER.name)playerRpc('set_player_name',{p_name:v}).then(playerSet).catch(e=>console.warn('name',e));}
async function playerRename(v){v=String(v||'').trim();if(v&&v.length<2)return 'Ім\'я — від 2 до 24 символів.';
  try{const p=await playerRpc('set_player_name',{p_name:v});playerSet(p);if(!v)lsSet("upl30_nick",null);return '';}catch(e){return 'Не вдалося зберегти. Спробуй ще раз.';}}
function nameBoxHtml(){if(!ONLINE||!PLAYER)return '';
  return `<div class="namebox"><label for="pName"><b>Твоє ім'я в таблицях</b></label><div class="row"><input id="pName" maxlength="24" value="${esc(PLAYER.name||'')}" placeholder="${esc(PLAYER.anon_name)}"><button class="ghost" id="pNameSave">Зберегти</button></div>
    <p class="muted" style="font-size:12px;margin:0" id="pNameMsg">${PLAYER.name?`Без імені ти був би <b>${esc(PLAYER.anon_name)}</b>.`:`Поки ти в таблицях як <b>${esc(PLAYER.anon_name)}</b>. Можна лишити так.`}</p></div>`;}
function nameBoxWire(){const b=document.getElementById('pNameSave');if(!b)return;b.onclick=async()=>{const m=document.getElementById('pNameMsg');b.disabled=true;const err=await playerRename(document.getElementById('pName').value);b.disabled=false;m.innerHTML=err?esc(err):(PLAYER.name?`Збережено: <b>${esc(PLAYER.name)}</b>.`:`Готово: ти знову <b>${esc(PLAYER.anon_name)}</b>.`);};}
// ---------- інтерфейс
function renderAcct(){const b=document.getElementById('acctBtn');if(!b)return;b.hidden=!ONLINE;b.innerHTML=SESSION?ic('account-circle')+esc(acctName().split(' ')[0]):ic('account-circle')+'Увійти';}
function openAcct(){
  const box=document.getElementById('viewBox'),body=document.getElementById('viewBody');document.getElementById('viewTitle').textContent='Акаунт';box.hidden=false;
  const msg=nameBoxHtml()+(ACCT_MSG?`<p class="note">${esc(ACCT_MSG)}</p>`:'');
  if(SESSION){const u=SESSION.user;const via=(u.app_metadata&&u.app_metadata.provider)==='google'?'Google':(u.email||'').endsWith('@users.upl-30-0.vercel.app')?'Telegram':'пошту';
    body.innerHTML=`${msg}<p style="margin:0">Ти увійшов як <b>${esc(acctName())}</b> через ${via}.</p><p class="muted" style="margin:0">Трофеї, серія, рекорди й нік зберігаються в акаунті й доступні на будь-якому пристрої та в Telegram.</p><div class="row"><button class="ghost" id="acctOut">Вийти</button></div>`;
    document.getElementById('acctOut').onclick=acctLogout;nameBoxWire();return;}
  body.innerHTML=`${msg}<p style="margin:0"><b>Грати можна без акаунта.</b> Вхід потрібен, щоб не загубити прогрес:</p>
    <ul class="muted" style="margin:0;padding-left:18px"><li>трофеї, серія виклику дня й рекорди — на всіх пристроях і в Telegram</li><li>ім'я та всі результати — одні на всіх пристроях</li><li>ліги з друзями в Telegram-групах</li></ul>
    <div class="grid" style="gap:8px">${IN_TG()?`<button class="primary" id="acctT">${ic('telegram')}Увійти через Telegram</button>`:''}${AUTH_GOOGLE&&!IN_TG()?`<button class="primary" id="acctG">${ic('google')}Увійти через Google</button>`:''}${AUTH_TG()&&!IN_TG()?`<a class="btnlink" id="acctBot" href="https://t.me/${TG_BOT}?start=login_${acctBotPending()||acctBotToken()}" target="_blank" rel="noopener">${ic('telegram')}Увійти через Telegram</a><span class="muted" style="font-size:12px" id="acctBotHint">${acctBotPending()&&BOT_POLL?'Чекаємо підтвердження: у чаті з ботом натисни «Start», потім «Підтвердити вхід» і повернись сюди.':'Відкриється чат з @'+TG_BOT+' — натисни там «Start», потім «Підтвердити вхід» і повернись сюди.'}</span>`:''}</div>
    ${ACCT_ERR||!SB?`<p class="muted mono" style="font-size:11px;margin:0">Діагностика: ${!SB?'бібліотека входу не завантажилась':esc(ACCT_ERR)}</p>`:''}
    <p class="muted" style="font-size:12px;margin:0">Зберігаємо лише ім'я та ідентифікатор входу. Усе, що вже зіграно на цьому пристрої, перейде в акаунт.</p>`;
  nameBoxWire();
  const g=document.getElementById('acctG');if(g)g.onclick=acctGoogle;
  const tb=document.getElementById('acctT');if(tb)tb.onclick=()=>{ACCT_MSG='Входимо…';openAcct();acctTelegram({initData:TG.initData},false);};
  const ab=document.getElementById('acctBot');if(ab)ab.onclick=()=>{ACCT_ERR='';setTimeout(()=>{acctBotPoll();const h=document.getElementById('acctBotHint');if(h)h.textContent='Чекаємо підтвердження: у чаті з ботом натисни «Start», потім «Підтвердити вхід» і повернись сюди.';},300);};
}
// м'яка пропозиція увійти: після першого трофея, серії 3+ днів, 3-го сезону або при надсиланні в таблицю дня; «Пізніше» — тиша на 3 дні
function acctNudge(r){
  const el=document.getElementById('acctNudge');if(!el)return;el.hidden=true;
  if(!ONLINE||SESSION||(TG&&TG.initData)||S.mode==='practice')return;
  const snooze=lsGet("upl30_nudge_until");if(snooze&&Date.now()<snooze)return;
  const s=trStore();const streak=trStreak();let why='';
  if(r.tro&&r.tro.fresh.length&&Object.values(s.t).filter(e=>e.n).length<=r.tro.fresh.length+1)why='Трофей збережено лише на цьому пристрої.';
  else if(streak>=3)why=`Серія ${streak} дні поспіль — не загуби її, якщо зміниш телефон.`;
  else if(s.seasons>=3){const nt=Object.values(s.t).filter(e=>e.n).length;const pl=(n,a,b,c)=>n%10===1&&n%100!==11?a:(n%10>=2&&n%10<=4&&(n%100<12||n%100>14))?b:c;why=`Уже ${s.seasons} ${pl(s.seasons,'сезон','сезони','сезонів')} і ${nt} ${pl(nt,'трофей','трофеї','трофеїв')}.`;}
  if(!why)return;
  el.hidden=false;el.innerHTML=`<span>${why} Увійди, щоб зберегти прогрес.</span><span class="row" style="gap:6px"><button class="primary" id="nudgeGo">Увійти</button><button class="ghost" id="nudgeLater">Пізніше</button></span>`;
  document.getElementById('nudgeGo').onclick=()=>openAcct();
  document.getElementById('nudgeLater').onclick=()=>{lsSet("upl30_nudge_until",Date.now()+3*864e5);el.hidden=true;};
}
// ---------- ЛІГИ ГРУП TELEGRAM: гру відкрито з кнопки групи → вступ у лігу; офіційний результат дня → у табло всіх ліг гравця
let LEAGUE=null;   // {chat, title, today:[], members, standings:[]}
function leagueChat(){const sp=TG&&TG.initDataUnsafe&&TG.initDataUnsafe.start_param||'';const m=/^g(-?\d+)$/.exec(sp);if(m){lsSet("upl30_league",m[1]);return m[1];}return lsGet("upl30_league");}
async function leagueInit(){
  if(!IN_TG())return;const chat=leagueChat();
  try{if(/^g-?\d+$/.test(TG.initDataUnsafe.start_param||''))await _fetch('/api/league',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData:TG.initData})});}catch(e){}
  if(chat)leagueLoad(chat);
}
async function leagueLoad(chat){try{const r=await _fetch('/api/league?chat='+encodeURIComponent(chat));if(!r.ok)return;LEAGUE={chat,...await r.json()};renderLeague();}catch(e){}}
function renderLeague(){
  const el=document.getElementById('leagueCard');if(!el)return;if(!LEAGUE){el.hidden=true;return;}
  const L=LEAGUE,medal=[1,2,3].map(k=>`<span class="plc p${k}">${k}</span>`);const played=lsGet("upl30_daily_"+DAY);
  el.hidden=false;el.innerHTML=`<div class="kicker">Ліга групи</div><div class="ttl">«${esc(L.title)}»</div>
    <div class="meta">Сьогодні зіграли ${L.today.length} з ${Math.max(L.members,L.today.length)}</div>
    ${L.today.length?`<div class="tbl"><table>${L.today.slice(0,6).map((r,i)=>`<tr${TGU&&r.name===[TGU.first_name,TGU.last_name].filter(Boolean).join(' ')?' class="me"':''}><td>${medal[i]||i+1}</td><td>${esc(r.name)}</td><td class="num">${r.w}-${r.d}-${r.l}</td><td class="num"><b>${r.pts}</b></td></tr>`).join('')}</table></div>`:'<p class="muted" style="margin:0">Ще ніхто не зіграв — будь першим!</p>'}
    ${L.standings&&L.standings.length>1?`<p class="muted" style="margin:0;font-size:13px">Залік (перемоги в днях): ${L.standings.slice(0,5).map(s=>`${esc(s.name)} ${s.wins}`).join(' · ')}</p>`:''}
    <div class="row">${played?'<span class="best">Твій результат уже в табло групи</span>':'<button class="primary" id="leagueGo">Зіграти виклик дня</button>'}</div>`;
  const g=document.getElementById('leagueGo');if(g)g.onclick=()=>document.getElementById('dailyBtn').click();
}
async function leagueSubmit(r){
  if(!IN_TG())return;const el=document.getElementById('leagueMsg');
  const tro=(r.tro&&r.tro.fresh||[]).map(id=>{const t=trDef(id);return t?(t.sec?'✨':'')+t.n:null;}).filter(Boolean);
  try{const res=await _fetch('/api/league',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData:TG.initData,result:{w:r.W,d:r.D,l:r.L,pts:r.pts,place:r.place,gf:r.gf,ga:r.ga,xp:Math.round(r.xp*10)/10,formation:S.formation,day:DAY,trophies:tro,season_id:r.rowId||null}})});
    const j=await res.json().catch(()=>({}));
    if(el&&j.posted&&j.posted.length){el.hidden=false;el.textContent=`Результат додано в табло ${j.posted.length>1?'груп':'групи'}: ${j.posted.map(t=>'«'+t+'»').join(', ')}`;}
    if(LEAGUE)leagueLoad(LEAGUE.chat);
  }catch(e){}
}
