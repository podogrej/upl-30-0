// ---------- Account (optional): play works without it; sign-in syncs trophies, streak, records and nick across devices
// Sign-in: Google (Supabase Auth), Telegram (Mini App: automatic; site: Telegram widget), Telegram via /api/auth.
const AUTH_GOOGLE=true;            // Google OAuth (Supabase). Google blocks sign-in inside the Telegram app, so the button is hidden there
const AUTH_TG=()=>!!TG_BOT;
const IN_TG=()=>!!(TG&&TG.initData);        // running inside the Telegram Mini App
let SB=null,SESSION=null,ACCT_MSG='',ACCT_ERR='';
const _fetch=window.fetch.bind(window);
if(ONLINE){
  // user-scoped DB requests: attach user token; if expired, retry anonymously
  window.fetch=async(u,o)=>{
    const url=typeof u==='string'?u:(u&&u.url)||'';
    if(!SESSION||!url.startsWith(SB_URL+'/rest/'))return _fetch(u,o);
    const o2={...(o||{}),headers:{...((o&&o.headers)||{}),Authorization:'Bearer '+SESSION.access_token}};
    const r=await _fetch(u,o2);if(r.status===401)return _fetch(u,o);return r;};
  const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  sc.onload=()=>acctInit();sc.onerror=()=>playerSync();document.head.appendChild(sc);   // without the auth library the player and device secret still get registered
}
// Safari sometimes dropped the apikey header; duplicate the key in the query string
const sbFetch=(u,o)=>{const url=typeof u==='string'?u:u.url;return _fetch(url+(url.includes('?')?'&':'?')+'apikey='+SB_KEY,o);};
function acctName(){const u=SESSION&&SESSION.user;if(!u)return '';const m=u.user_metadata||{};return m.full_name||m.name||m.tg_name||(u.email&&!u.email.endsWith('@users.upl-30-0.vercel.app')?u.email.split('@')[0]:'')||'Гравець';}
async function acctInit(){
  try{SB=window.supabase.createClient(SB_URL,SB_KEY,{global:{fetch:sbFetch},auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}});}catch(e){return;}
  SB.auth.onAuthStateChange((ev,s)=>{const was=!!SESSION;SESSION=s||null;renderAcct();if(SESSION&&!was&&ev!=='INITIAL_SESSION')acctOnLogin();});
  const {data}=await SB.auth.getSession();SESSION=data&&data.session||null;renderAcct();playerSync();
  if(SESSION)acctPull();
  else{acctTgAuto();if(!IN_TG()&&acctBotPending())acctBotPoll();}
}
function acctTgAuto(){if(!acctTgAuto.lg&&IN_TG()){acctTgAuto.lg=1;leagueInit();}if(SB&&!SESSION&&TG&&TG.initData&&!acctTgAuto.done){acctTgAuto.done=1;acctTelegram({initData:TG.initData},true);}}   // inside Telegram: sign in silently
// ---------- state sync (trophies, streak, records, nick, daily attempt) via user_state table
const ACCT_KEYS=()=>["upl30_tr","upl30_streak","upl30_best_v2","upl30_nick","upl30_daily_"+DAY,"upl30_sent_"+DAY,"upl30_tr_retro"];
function acctLocal(){const o={};for(const k of ACCT_KEYS()){const v=lsGet(k);if(v!=null)o[k]=v;}return o;}
function acctMerge(a,b){   // a: local, b: from server
  const o={...b,...a};
  const ta=a.upl30_tr,tb=b.upl30_tr;
  if(ta||tb){const t={...(tb&&tb.t||{})};for(const [id,e] of Object.entries(ta&&ta.t||{})){const f=t[id];t[id]=f?{n:Math.max(f.n,e.n),at:f.at<e.at?f.at:e.at}:e;}
    o.upl30_tr={t,seasons:Math.max(ta&&ta.seasons||0,tb&&tb.seasons||0),dailies:Math.max(ta&&ta.dailies||0,tb&&tb.dailies||0),f5:[...new Set([...(tb&&tb.f5||[]),...(ta&&ta.f5||[])])].slice(-200)};}   // f5: 5x5 leagues already rewarded with trophies
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
  // attach everything played on this device to the account and merge progress
  await playerSync();
  const res=await acctPull();const s=trStore();
  ACCT_MSG=`Готово! Прогрес збережено в акаунті: ${s.seasons} ${plUk(s.seasons,'сезон','сезони','сезонів')}, трофеїв — ${Object.values(s.t).filter(e=>e.n).length}.`;
  if(!lsGet("upl30_nick")){const n=acctName();if(n)lsSet("upl30_nick",n.slice(0,24));}
  renderAcct();if(!document.getElementById('viewBox').hidden&&document.getElementById('viewTitle').textContent==='Акаунт')openAcct();if(CUR_SEC===6&&PP&&PP.own)ppRender();
}
// ---------- sign-in methods
async function acctGoogle(){if(!SB)return;const {error}=await SB.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});if(error){ACCT_MSG='Не вдалося: '+error.message;openAcct();}}
async function acctTelegram(payload,silent){
  let step='0 (бібліотека)';
  try{if(!SB)throw new Error('бібліотека входу не завантажилась');
    step='1 (сервер /api/auth)';
    const r=await _fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const txt=await r.text();let j={};try{j=JSON.parse(txt);}catch(e){throw new Error(`відповідь ${r.status}: ${txt.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,120)}`);}
    if(r.status===202&&j.pending)return 'pending';   // bot sign-in: Start not pressed yet
    if(!r.ok||!j.token_hash)throw new Error((j.error||('HTTP '+r.status))+(j.status?' ('+j.status+')':''));
    step='2 (Supabase verify)';
    let ok=false;
    try{const {error}=await SB.auth.verifyOtp({token_hash:j.token_hash,type:'email'});if(error)throw error;ok=true;}
    catch(e1){   // fallback: verify the token directly and hand the session to the auth library
      step='3 (прямий verify після: '+String(e1.message||e1).slice(0,60)+')';
      const v=await _fetch(`${SB_URL}/auth/v1/verify?apikey=${SB_KEY}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:SB_KEY},body:JSON.stringify({token_hash:j.token_hash,type:'email'})});
      const vt=await v.text();let vj={};try{vj=JSON.parse(vt);}catch(e){throw new Error(`verify ${v.status}: ${vt.slice(0,100)}`);}
      if(!v.ok||!vj.access_token)throw new Error(`verify ${v.status}: ${(vj.msg||vj.error_description||vj.error||vt).toString().slice(0,100)}`);
      step='4 (setSession)';
      const {error}=await SB.auth.setSession({access_token:vj.access_token,refresh_token:vj.refresh_token});if(error)throw error;ok=true;}
    return 'ok';
  }catch(e){ACCT_ERR=`крок ${step}: ${e&&e.name&&e.name!=='Error'?e.name+': ':''}${String(e&&e.message||e).slice(0,160)}`;if(!silent){ACCT_MSG='Вхід через Telegram не вдався — '+ACCT_ERR;openAcct();}}
}
// ---------- bot sign-in: browser creates a one-time token, player presses Start in @upl30_bot, page polls for confirmation
function acctBotToken(){const a=new Uint8Array(16);crypto.getRandomValues(a);const t=[...a].map(b=>b.toString(16).padStart(2,'0')).join('');lsSet('upl30_login_tok',{t,at:Date.now()});return t;}
function acctBotPending(){const o=lsGet('upl30_login_tok');return o&&o.t&&Date.now()-o.at<10*60e3?o.t:null;}
let BOT_POLL=null;
function acctBotPoll(){if(BOT_POLL||SESSION)return;const tick=async()=>{const t=acctBotPending();if(!t||SESSION){clearInterval(BOT_POLL);BOT_POLL=null;return;}
    const res=await acctTelegram({login_token:t},true);
    if(res==='ok'){clearInterval(BOT_POLL);BOT_POLL=null;lsSet('upl30_login_tok',null);ACCT_MSG='Готово — ти увійшов через Telegram.';if(!document.getElementById('viewBox').hidden)openAcct();}
    else if(res!=='pending'&&/крок [234]/.test(ACCT_ERR||'')){clearInterval(BOT_POLL);BOT_POLL=null;lsSet('upl30_login_tok',null);ACCT_MSG='Вхід через Telegram не вдався — '+ACCT_ERR;openAcct();}};
  BOT_POLL=setInterval(tick,2500);tick();}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&acctBotPending()&&!SESSION){clearInterval(BOT_POLL);BOT_POLL=null;acctBotPoll();}});
async function acctLogout(){if(SB)await SB.auth.signOut();SESSION=null;ACCT_MSG='Ти вийшов. Прогрес на цьому пристрої лишився.';renderAcct();if(CUR_SEC===6&&PP&&PP.own)ppRender();else openAcct();}
// ---------- PLAYER: one person = one player. Device and sign-ins (Google/Telegram) are linked to it in the DB.
// Name lives in the player profile: rename propagates to all tables. Without a name: persistent anonymous one (e.g. silent_owl).
let PLAYER=lsGet("upl30_player")||null;   // {id,name,anon_name,public_id,name_next}
function devSecret(){let s=lsGet("upl30_dsecret");if(!s||String(s).length<32){const a=new Uint8Array(24);crypto.getRandomValues(a);s=[...a].map(b=>b.toString(16).padStart(2,'0')).join('');lsSet("upl30_dsecret",s);}return s;}
function myName(){return String((PLAYER&&(PLAYER.name||PLAYER.anon_name))||lsGet("upl30_nick")||'').toLowerCase();}   // names are lowercase only (DECISIONS item 2)
async function playerRpc(fn,extra){
  const r=await fetch(`${SB_URL}/rest/v1/rpc/${fn}?apikey=${SB_KEY}`,{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_device:deviceId(),p_secret:devSecret(),...(extra||{})})});
  const t=await r.text();if(!r.ok)throw new Error(`${fn} ${r.status}: ${t.slice(0,120)}`);return JSON.parse(t);}
function playerSet(p){if(!p||!p.id)return;const was=PLAYER&&PLAYER.id;PLAYER=p;lsSet("upl30_player",p);if(p.name)lsSet("upl30_nick",p.name);renderAcct();if(was&&was!==p.id)lsSet('upl30_tr_srv',null);trSrvRefresh();
  if(PP&&PP.own&&CUR_SEC===6){if(was!==p.id){PP.prof=null;ppLoad(PP);}ppRender();}}
async function playerSync(){
  if(!ONLINE)return;
  try{let p=null;
    if(SESSION){try{p=await playerRpc('link_account');}catch(e){p=null;}}
    if(!p)p=await playerRpc('player_hello');
    const offer=p&&p.merge_offer;if(p)delete p.merge_offer;if(offer&&offer.id)setTimeout(()=>mergeAsk(offer),600);
    // first time: legacy nick or account name becomes the profile name
    if(p&&!p.name){const nk=(lsGet("upl30_nick")||'').trim()||(SESSION?acctName():'');if(nk&&nk!=='Гравець')p=await playerAutoName(p,nk);}
    playerSet(p);
  }catch(e){
    // secret mismatch: device_id already taken (audit K6); continue as a new device, old history stays in DB
    if(/28000|device secret/.test(String(e&&e.message))&&!playerSync.rot){playerSync.rot=1;lsSet("upl30_device",null);lsSet("upl30_dsecret",null);lsSet("upl30_player",null);PLAYER=null;return playerSync();}
    console.warn('player',e);}
}
// ---------- RESULT WRITES: seasons, trophies, challenges are written by the server (/api/save) after device-secret check,
// so nobody can write into another player's history. Server unavailable / legacy schema (503, fallback): write directly.
let SAVE_LEGACY=false;
async function saveApi(kind,payload){
  const legacy=()=>Object.assign(new Error('legacy'),{legacy:true});
  if(!ONLINE)throw new Error('offline');if(SAVE_LEGACY)throw legacy();
  let r;try{r=await _fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,device_id:deviceId(),secret:devSecret(),tg_init:(TG&&TG.initData)||undefined,...payload})});}catch(e){throw legacy();}
  const j=await r.json().catch(()=>({}));
  if(r.status===404||j.fallback){SAVE_LEGACY=true;throw legacy();}
  if(!r.ok)throw Object.assign(new Error(j.error||('HTTP '+r.status)),{status:r.status});
  return j;}
// ---------- NAME (DECISIONS item 2): unique, lowercase Latin only: a-z, digits, "_" and ".", 3-20 chars, at least one letter,
// letter or digit at both ends, no profanity; rename at most once per 30 days.
// Same rules in DB (sql/v059_player_page.sql, name_problem); here only for instant hints. Cyrillic transliteration happens only in DB (name_translit).
const NAME_BAD=['^hui','^huy','khui','khuy','xui','xuy','pizd','pyzd','blyad','bliad','blyat','bliat','ebat','yeban','ieban','yobany',
  'mudak','mudil','zalup','gandon','pidor','pidar','shliukh','shlyukh','suchar','fuck','shit','cunt','bitch','nigger','nigga','faggot','whore','pussy','asshole'];   // data/names/blocklist.txt
const NAME_MIN=3,NAME_MAX=20;
const nameKey=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,'_');   // same as input field: lowercase, space -> "_"
const nameBad=s=>{const t=s.replace(/[_.]/g,'');return NAME_BAD.some(b=>b[0]==='^'?new RegExp('[_.0-9]'+b.slice(1)).test('_'+s):t.includes(b));};
function nameCheck(v){const s=nameKey(v);if(!s)return {name:null};const n=[...s].length;
  if(n<NAME_MIN||n>NAME_MAX)return {err:'len'};
  if(!/^[a-z0-9._]+$/.test(s)||!/[a-z]/.test(s))return {err:'chars'};
  if(!/^[a-z0-9](.*[a-z0-9])?$/.test(s))return {err:'edge'};
  if(nameBad(s))return {err:'bad'};
  return {name:s};}
const NAME_MSG={len:`Ім'я — від ${NAME_MIN} до ${NAME_MAX} символів.`,chars:'Лише латинські літери a–z, цифри, «_» і «.».',edge:'Починається й закінчується літерою або цифрою.',bad:"Таке ім'я не підходить. Обери інше.",
  taken:"Це ім'я вже зайняте. Спробуй інше.",wait:d=>`Змінити ім'я знову можна з ${fmtLong(d)}.`,fail:"Не вдалося зберегти. Спробуй ще раз."};
function nameErrOf(e){const m=/name_(len|chars|edge|bad|taken|wait)(?::(\d{4}-\d{2}-\d{2}))?/.exec(String(e&&e.message||e));return m?(m[1]==='wait'?NAME_MSG.wait(m[2]):NAME_MSG[m[1]]):NAME_MSG.fail;}
// first name from Telegram/Google or the name field: DB transliterates to Latin, taken -> numbered (andrii7), too short -> stay anonymous
async function playerAutoName(p,raw){
  try{return await playerRpc('set_player_auto_name',{p_raw:String(raw||'').slice(0,60)});}catch(e){return p;}}
// any place where the player typed a name (daily table, challenge, 5x5) sets only the first profile name; later changes via own page
function nickSet(v){v=String(v||'').trim().slice(0,24);if(v.length<2)return;if(PLAYER&&nameKey(v)===PLAYER.anon_name)return;lsSet("upl30_nick",v);
  if(ONLINE&&PLAYER&&!PLAYER.name)playerAutoName(PLAYER,v).then(playerSet).catch(e=>console.warn('name',e));}
async function playerRename(v){if(PLAYER&&PLAYER.name&&nameKey(v)===PLAYER.name)return '';   // same name (incl. reserved ones): no change
  const c=nameCheck(v);if(c.err)return NAME_MSG[c.err];
  try{const p=await playerRpc('set_player_name',{p_name:c.name||''});playerSet(p);if(!c.name)lsSet("upl30_nick",null);return '';}catch(e){return nameErrOf(e);}}
// ---------- UI
// header: avatar instead of a sign-in button; tap opens own page
function renderAcct(){const b=document.getElementById('acctBtn');if(!b)return;b.hidden=!ONLINE;b.className='avbtn';b.title='Моя сторінка';b.setAttribute('aria-label','Моя сторінка');const nm=myName();b.innerHTML=avatarSvg(mySeed(),28)+(nm?`<span class="me-n">${esc(nm)}</span>`:'');b.classList.toggle('noname',!nm);}   // name next to the avatar (button to own page)
// modal in sign-in sheet mode: .login class, close cross instead of a Close button; normal mode restored on hide
function viewMode(m){const box=document.getElementById('viewBox'),c=document.getElementById('viewClose');box.classList.toggle('login',m==='login');c.textContent=m==='login'?'✕':'Закрити';c.setAttribute('aria-label','Закрити');}
new MutationObserver(()=>{if(document.getElementById('viewBox').hidden)viewMode('');}).observe(document.getElementById('viewBox'),{attributes:true,attributeFilter:['hidden']});
function openAcct(){screenTag('account');
  const box=document.getElementById('viewBox'),body=document.getElementById('viewBody');document.getElementById('viewTitle').textContent='Акаунт';box.hidden=false;
  const msg=ACCT_MSG?`<p class="note">${esc(ACCT_MSG)}</p>`:'';
  if(SESSION){viewMode('');const u=SESSION.user;const via=(u.app_metadata&&u.app_metadata.provider)==='google'?'Google':(u.email||'').endsWith('@users.upl-30-0.vercel.app')?'Telegram':'пошту';
    body.innerHTML=`${msg}<p style="margin:0">Ти увійшов як <b>${esc(acctName())}</b> через ${via}.</p><p class="muted" style="margin:0">Трофеї, серія, рекорди й нік зберігаються в акаунті й доступні на будь-якому пристрої та в Telegram.</p><div class="row"><button class="ghost" id="acctOut">Вийти</button></div>`;
    document.getElementById('acctOut').onclick=acctLogout;return;}
  // compact sheet: title, purpose, two big buttons, play without sign-in; phone: bottom sheet, iPad: centered
  viewMode('login');
  body.innerHTML=`${msg}<h2 class="lg-h">Увійди в 30-0</h2><p class="lg-sub">Щоб трофеї, серія й рекорди не загубились і були на всіх пристроях.</p>
    <div class="lg-btns">${AUTH_GOOGLE&&!IN_TG()?`<button class="lgb g" id="acctG">${icon('google')}Продовжити з Google</button>`:''}${IN_TG()?`<button class="lgb t" id="acctT">${icon('telegram')}Продовжити з Telegram</button>`:''}${AUTH_TG()&&!IN_TG()?`<a class="lgb t" id="acctBot" href="https://t.me/${TG_BOT}?start=login_${acctBotPending()||acctBotToken()}" target="_blank" rel="noopener">${icon('telegram')}Продовжити з Telegram</a><span class="muted" style="font-size:12px" id="acctBotHint">${acctBotPending()&&BOT_POLL?'Чекаємо підтвердження: у чаті з ботом натисни «Start», потім «Підтвердити вхід» і повернись сюди.':'Відкриється чат з @'+TG_BOT+' — натисни там «Start», потім «Підтвердити вхід» і повернись сюди.'}</span>`:''}</div>
    <button class="link0 lg-skip" id="acctSkip">Грати без входу</button>
    ${ACCT_ERR||!SB?`<p class="muted mono" style="font-size:11px;margin:0">Діагностика: ${!SB?'бібліотека входу не завантажилась':esc(ACCT_ERR)}</p>`:''}
    <p class="lg-fine">Зберігаємо лише ім'я та ідентифікатор входу. Зігране на цьому пристрої перейде в акаунт.</p>`;
  document.getElementById('acctSkip').onclick=()=>{document.getElementById('viewBox').hidden=true;};
  const g=document.getElementById('acctG');if(g)g.onclick=acctGoogle;
  const tb=document.getElementById('acctT');if(tb)tb.onclick=()=>{ACCT_MSG='Входимо…';openAcct();acctTelegram({initData:TG.initData},false);};
  const ab=document.getElementById('acctBot');if(ab)ab.onclick=()=>{ACCT_ERR='';setTimeout(()=>{acctBotPoll();const h=document.getElementById('acctBotHint');if(h)h.textContent='Чекаємо підтвердження: у чаті з ботом натисни «Start», потім «Підтвердити вхід» і повернись сюди.';},300);};
}
// "Is this you?" (DECISIONS item 16): second sign-in method on a device where a player of another sign-in already has history.
// Never merged automatically (two people may share a phone); ask. "Yes" merges with a log (revertible manually).
function mergeAsk(o){if(!SESSION||!o||mergeAsk.shown===o.id)return;mergeAsk.shown=o.id;screenTag('merge');
  const box=document.getElementById('viewBox'),body=document.getElementById('viewBody');document.getElementById('viewTitle').textContent='Це ти?';box.hidden=false;
  const n=+o.seasons||0;
  body.innerHTML=`<p style="margin:0">На цьому пристрої вже грав <b>${esc(String(o.name||''))}</b> — ${n} ${plUk(n,'сезон','сезони','сезонів')}, але з іншим входом (Google чи Telegram).</p>
    <p class="muted" style="margin:0">Якщо це ти — об'єднаємо: сезони, трофеї, серія й ім'я стануть одним гравцем, і обидва входи відкриватимуть його. Якщо це хтось інший — нічого не зміниться.</p>
    <div class="grid" style="gap:8px"><button class="primary" id="mergeYes">${ic('account-multiple-check')}Так, це я — об'єднати</button><button class="ghost" id="mergeNo">Ні, це інший гравець</button></div><p class="note" id="mergeMsg" hidden style="margin:0"></p>`;
  const ans=async yes=>{const m=document.getElementById('mergeMsg');['mergeYes','mergeNo'].forEach(id=>document.getElementById(id).disabled=true);
    try{const p=await playerRpc('merge_answer',{p_offer:o.id,p_yes:yes});const prev=p&&p.prev_state;if(p)delete p.prev_state;if(PP)PP.prof=null;playerSet(p);
      if(yes){try{if(prev&&typeof prev==='object'){const m=acctMerge(acctLocal(),prev);for(const [k,v] of Object.entries(m))lsSet(k,v);if(m.upl30_best_v2)BEST=m.upl30_best_v2;}await acctPull();}catch(e){}}   // also bring over trophies, streak and records of the previous sign-in
      m.hidden=false;m.textContent=yes?`Готово — тепер ти один гравець: ${myName()}.`:'Добре, лишаємо окремо.';setTimeout(()=>{if(!box.hidden&&document.getElementById('mergeMsg'))viewHide();},1800);}
    catch(e){m.hidden=false;m.textContent='Не вдалося. Спробуй ще раз пізніше.';['mergeYes','mergeNo'].forEach(id=>{const b=document.getElementById(id);if(b)b.disabled=false;});}};
  document.getElementById('mergeYes').onclick=()=>ans(true);document.getElementById('mergeNo').onclick=()=>ans(false);}
// soft sign-in prompt: after first trophy, 3+ day streak, 3rd season or when posting to the daily table; "Later" mutes for 3 days
function acctNudge(r){
  const el=document.getElementById('acctNudge');if(!el)return;el.hidden=true;
  if(!ONLINE||SESSION||(TG&&TG.initData)||S.mode==='practice')return;
  const snooze=lsGet("upl30_nudge_until");if(snooze&&Date.now()<snooze)return;
  const s=trStore();const streak=trStreak();let why='';
  if(r.tro&&r.tro.fresh.length&&Object.values(s.t).filter(e=>e.n).length<=r.tro.fresh.length+1)why='Трофей збережено лише на цьому пристрої.';
  else if(streak>=3)why=`Серія ${streak} дні поспіль — не загуби її, якщо зміниш телефон.`;
  else if(s.seasons>=3){const nt=Object.values(s.t).filter(e=>e.n).length;why=`Уже ${s.seasons} ${plUk(s.seasons,'сезон','сезони','сезонів')} і ${nt} ${plUk(nt,'трофей','трофеї','трофеїв')}.`;}
  if(!why)return;
  el.hidden=false;el.innerHTML=`<span>${why} Увійди, щоб зберегти прогрес.</span><span class="row" style="gap:6px"><button class="primary" id="nudgeGo">Увійти</button><button class="ghost" id="nudgeLater">Пізніше</button></span>`;
  document.getElementById('nudgeGo').onclick=()=>openAcct();
  document.getElementById('nudgeLater').onclick=()=>{lsSet("upl30_nudge_until",Date.now()+3*864e5);el.hidden=true;};
}
// ---------- TELEGRAM GROUP LEAGUES: game opened from a group button -> join league; official daily result -> boards of all player's leagues
let LEAGUE=null,LEAGUE_DENIED=false;   // LEAGUE_DENIED: server refused (Telegram did not confirm group membership)   // {chat, title, today:[], members, standings:[]}
function leagueChat(){const sp=TG&&TG.initDataUnsafe&&TG.initDataUnsafe.start_param||'';const m=/^g(-?\d+)$/.exec(sp);if(m){lsSet("upl30_league",m[1]);return m[1];}return lsGet("upl30_league");}
async function leagueInit(){
  if(!IN_TG())return;let chat=leagueChat();
  let joined=false;   // just joined: fetch board bypassing cache (it may already include today's migrated result)
  try{if(/^g-?\d+$/.test(TG.initDataUnsafe.start_param||'')){const r=await _fetch('/api/league',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData:TG.initData})});joined=r.ok;LEAGUE_DENIED=r.status===403;
    // group became a supergroup: server moved the league to the new id, use that
    const j=await r.json().catch(()=>({}));const c=j.joined&&j.joined[0]&&String(j.joined[0].chat_id);if(c&&c!==chat){chat=c;lsSet('upl30_league',c);}}}catch(e){}
  if(chat){   // reserve league slot immediately (with last known title) so the home screen does not jump when the board loads
    // show last cached board (upl30_league_snap) at once, refresh from server quietly
    const el=document.getElementById('leagueCard'),snap=lsGet('upl30_league_snap');
    if(snap&&snap.chat===chat&&!LEAGUE){LEAGUE=snap.day===DAY?snap:{...snap,today:[]};renderLeague();}   // yesterday's board: drop "today"
    else if(el&&!LEAGUE){el.hidden=false;el.innerHTML=`<div class="kicker">Ліга Telegram-чату</div><div class="ttl">&nbsp;</div><div class="meta muted">Завантажуємо табло…</div>`;}
    leagueLoad(chat,joined);}
}
async function leagueLoad(chat,fresh){try{const r=await _fetch('/api/league?chat='+encodeURIComponent(chat)+(fresh?'&t='+Date.now():''));if(!r.ok){if(!LEAGUE)document.getElementById('leagueCard').hidden=true;return;}LEAGUE={chat,...await r.json()};lsSet('upl30_league_snap',LEAGUE);renderLeague();}catch(e){if(!LEAGUE)document.getElementById('leagueCard').hidden=true;}}
// home shows today's top 3 (+ own row if lower) and "Full table (N)" -> screen with Today / Standings tabs
const lgMe=r=>(r.u&&PLAYER&&r.u===PLAYER.public_id)||(!r.u&&TGU&&r.name===[TGU.first_name,TGU.last_name].filter(Boolean).join(' '));
const lgPlace=i=>i<3?`<span class="plc p${i+1}">${i+1}</span>`:i+1;
const lgToday=(r,i)=>`<tr${lgMe(r)?' class="me"':''}><td>${lgPlace(i)}</td><td class="nm"><span class="nmt">${plink({players:{name:r.name,public_id:r.u}})}</span></td><td class="num">${r.w}-${r.d}-${r.l}</td><td class="num"><b>${r.pts}</b></td></tr>`;
function renderLeague(){
  const el=document.getElementById('leagueCard');if(!el)return;if(!LEAGUE){el.hidden=true;return;}
  const L=LEAGUE,played=lsGet("upl30_daily_"+DAY),me=L.today.findIndex(lgMe);
  const top=L.today.slice(0,3).map(lgToday).join('')+(me>=3?`<tr class="gap"><td colspan="4">…</td></tr>${lgToday(L.today[me],me)}`:'');
  const all=L.today.length>3||(L.standings&&L.standings.length>1);
  el.hidden=false;el.innerHTML=`<div class="kicker">Ліга Telegram-чату</div><div class="ttl">«${esc(L.title)}»</div>
    <div class="meta">Сьогодні зіграли ${L.today.length} з ${Math.max(L.members,L.today.length)}</div>
    ${L.today.length?`<div class="tbl"><table>${top}</table></div>`:`<p class="muted" style="margin:0">${played?'Сьогодні з групи ще ніхто не зіграв.':'Ще ніхто не зіграв — будь першим!'}</p>`}
    ${all?`<button class="link0 lgall" id="leagueAll">Уся таблиця (${Math.max(L.members,L.today.length)})</button>`:''}
    ${LEAGUE_DENIED&&me<0?'<p class="muted" style="margin:0;font-size:13px">Тебе ще немає в цій лізі: Telegram не підтвердив, що ти в групі. Відкрий гру кнопкою з останнього повідомлення бота в групі.</p>':''}
    ${played?`<p class="muted" style="margin:0;font-size:13px">${me>=0?'Твій результат уже в табло.':'Драфт дня ти вже зіграв.'} Наступний — завтра о 00:00 за Києвом.</p>`:'<div class="row"><button class="primary" id="leagueGo">Зіграти драфт дня</button></div>'}`;
  const g=document.getElementById('leagueGo');if(g)g.onclick=()=>document.getElementById('dailyBtn').click();
  const a=document.getElementById('leagueAll');if(a)a.onclick=()=>openLeagueAll('today');
}
function openLeagueAll(tab){if(!LEAGUE)return;const L=LEAGUE,box=document.getElementById('viewBox');screenTag('league_all');
  document.getElementById('viewTitle').textContent=`«${L.title}»`;
  const st=L.standings||[];
  const body=tab==='today'?(L.today.length?`<div class="tbl"><table>${L.today.map(lgToday).join('')}</table></div>`:'<p class="muted">Сьогодні ще ніхто не зіграв.</p>')
    :(st.length?`<div class="tbl"><table><tr class="th"><td></td><td></td><td class="num">днів</td><td class="num">перемог</td></tr>${st.map((s,i)=>`<tr${lgMe(s)?' class="me"':''}><td>${lgPlace(i)}</td><td class="nm"><span class="nmt">${plink({players:{name:s.name,public_id:s.u}})}</span></td><td class="num">${s.days}</td><td class="num"><b>${s.wins}</b></td></tr>`).join('')}</table></div><p class="muted" style="font-size:13px">Перемога в дні — найбільше очок у драфті дня серед чату. При рівності — більше очок у середньому.</p>`:'<p class="muted">Залік зʼявиться після першого дня.</p>');
  document.getElementById('viewBody').innerHTML=`<div class="seg fl-tabs" id="lgTabs"><button data-t="today"${tab==='today'?' class="on"':''}>Сьогодні</button><button data-t="st"${tab!=='today'?' class="on"':''}>Залік</button></div>${body}`;
  document.querySelectorAll('#lgTabs button').forEach(b=>b.onclick=()=>openLeagueAll(b.dataset.t));
  box.hidden=false;}
async function leagueSubmit(r){
  if(!IN_TG())return;const el=document.getElementById('leagueMsg');
  const tro=(r.tro&&r.tro.fresh||[]).map(id=>{const t=trDef(id);return t?(t.sec?'✨':'')+t.n:null;}).filter(Boolean);
  try{const res=await _fetch('/api/league',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData:TG.initData,result:{w:r.W,d:r.D,l:r.L,pts:r.pts,place:r.place,gf:r.gf,ga:r.ga,xp:Math.round(r.xp*10)/10,formation:S.formation,day:DAY,trophies:tro,season_id:r.rowId||null}})});
    const j=await res.json().catch(()=>({}));
    if(el&&j.posted&&j.posted.length){el.hidden=false;el.textContent=`Результат додано в табло ${j.posted.length>1?'груп':'групи'}: ${j.posted.map(t=>'«'+t+'»').join(', ')}`;}
    if(LEAGUE)leagueLoad(LEAGUE.chat,true);   // bypass the 15 s cache so own result shows at once
  }catch(e){}
}
