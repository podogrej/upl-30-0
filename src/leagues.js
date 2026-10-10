// ---------- Leagues with friends: 11x11 and 5x5. Spec: docs/leagues_online.md, mockups docs/mockups/lg_1_list ... lg_6_match5.
// A league sets shared rules (duration, attempts, counted attempts, points per round, rerolls, ratings, era); each day is a round; each player has own wheel.
// An attempt is a regular classic season tagged with the league code (seasons.fl_id), credited by the server after verification (api/verify.js -> fl_record).
// Create/join require sign-in (RPC fl_create / fl_join, sql/v061_leagues.sql). Link: ?l=<code> (DECISIONS items 10, 11).
const FL_NAMES=['Паляниця Ліга','Ліга диванних тренерів','Банка на воротах','Сухарі з родзинками','Кефаль і Ко','Автобус на воротах','Штанга-Перекладина','Мазила ФК','Гра в одні ворота',
  'Кум у запасі','Дворовий Кубок','Тренер, випусти мене','Жовта картка за сміх','Суддю на мило','Мʼяч круглий','Все буде добре','Біля кутового','Золотий дубль',
  'Офсайд по-київськи','Вареники в додатковий час','Ні кроку назад','Шаланди, повні голів','Лобан би схвалив','Пенальті на 90+5','Легенди двору','Кубок кума',
  'Сало і стандарти','Не робіть мені нерви','Дві великі різниці','Щоб я так жив','Не смішіть мої капці','Щоб ви були здорові','Чемпіони дивана','Друзі по лаві',
  'Ліга запасних','Мундіаль на кухні','Каштани і кутові','Бутси на цвях','Ліга вихідного дня','Футбол до темряви','Мама кличе додому','Хто останній — на воротах',
  'Ворота з портфелів','Мʼяч через паркан','Ліга за гаражами','Коробка біля школи','Хто програв — біжить по мʼяч'];   // default league name suggestions; no parentheses
const FL_OPT={days:[[1,'1 день'],[3,'3 дні'],[7,'7 днів']],
  scoring:[['place','За місце','1-й отримує стільки, скільки зіграло; останній — 1'],['sum','Сума','очки сезону додаються']],
  tries:[[1,'1 спроба','без права на помилку'],[3,'3 спроби','']],
  take:[['best','Найкраща','твій максимум за день'],['last','Остання','ризиковано: переграв — замінив']],
  rerolls:[[3,'3','легко'],[1,'1','нормально'],[0,'0','хардкор']],
  ratings:[['show','Видно',''],['memory','На пам\'ять','рейтинги приховані']],
  hours:[[1,'1 година','швидкий турнір'],[3,'3 години',''],[24,'Добу','щоб усі встигли']]};
let FL=null;   // {view:'list'|'create'|'league', id, data, mine, form, tab, formation}
const flUrl=id=>{try{const q=new URLSearchParams(location.search);if(id)q.set('l',id);else q.delete('l');const s=q.toString();history.replaceState(history.state,'',location.pathname+(s?'?'+s:'')+location.hash);}catch(e){}};
const flLink=id=>`${location.origin&&location.origin!=='null'?location.origin:SITE.slice(0,-1)}${location.pathname||'/'}?l=${id}`;
async function flRpc(fn,args){const r=await fetch(`${SB_URL}/rest/v1/rpc/${fn}?apikey=${SB_KEY}`,{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify(args)});
  const t=await r.text();if(!r.ok)throw new Error(`${fn} ${r.status}: ${t.slice(0,160)}`);return t?JSON.parse(t):null;}
const flErr=e=>{const m=String(e&&e.message||e);return /login\?|28000/.test(m)?'Спершу увійди через Google чи Telegram.':/fl_over/.test(m)?'Ця ліга вже завершилась.':/fl_full/.test(m)?'У лізі 5×5 уже 10 гравців.':/fl_few/.test(m)?'Потрібно щонайменше 2 зібрані склади.':/fl_member/.test(m)?'Спершу приєднайся до ліги.':/fl_none/.test(m)?'Такої ліги немає. Перевір посилання.':/fl_many/.test(m)?'Забагато ліг за день. Спробуй завтра.':/404|PGRST202/.test(m)?'Ліги ще не ввімкнено. Спробуй трохи пізніше.':'Не вдалося. Спробуй ще раз.';};
function flShuffle(){const a=[...FL_NAMES],o=[];while(o.length<3)o.push(a.splice(Math.floor(Math.random()*a.length),1)[0]);return o;}
// minutes until round end (midnight Kyiv time)
function flLeft(){try{const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()).split(':');const m=24*60-(+p[0]%24)*60-(+p[1]);return `${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`;}catch(e){return '';}}
// ---------- screen entry
function openFriends(){FL={view:'list',mine:null};screenTag('friends');flUrl(null);go(7);flRender();flLoadMine();}
function openLeague(id){FL={view:'league',id,data:null,tab:'all',formation:lsGet('upl30_fl_form')||'4-4-2'};screenTag('league');go(7);flUrl(id);flRender();flLoad();}
// fl_mine failure shows a retryable load error instead of "no leagues" (signed out: just empty)
const flMineFail=e=>!/login\?|28000/.test(String(e&&e.message||e));
async function flLoadMine(){if(!ONLINE||!FL)return;const st=FL;st.mineErr=false;try{st.mine=await playerRpc('fl_mine');}catch(e){st.mine=[];st.mineErr=flMineFail(e);}if(FL===st&&st.view==='list')flRender();}
const flMineErrHtml=id=>`<p class="pp-empty">Не вдалося завантажити ліги. <button class="link0" id="${id}">Спробувати ще</button></p>`;
async function flLoad(){const st=FL;try{st.data=await flRpc('fl_get',{p_id:st.id});st.err=st.data?'':'Такої ліги немає. Перевір посилання.';}catch(e){st.err=flErr(e);}if(FL===st)flRender();
  if(FL===st&&fl5Due(st.data))fl5Play();}
// 5x5: entry window closed and no tournament yet -> server plays it (api/fl5.js) and returns the league with result
const fl5Due=d=>d&&d.fmt==='5'&&!d.result&&d.deadline&&new Date(d.deadline)<=new Date(d.now||Date.now());
async function fl5Play(){const st=FL;try{const r=await _fetch('/api/fl5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:st.id,device_id:deviceId()})});
  if(r.ok){const d=await r.json();if(FL===st&&d&&d.id){st.data=d;flRender();}}}catch(e){}}
const flMe=d=>PLAYER&&PLAYER.public_id&&d&&(d.board||[]).some(r=>r.u===PLAYER.public_id&&!r.left);   // left members stay in the table but can join again
// league rules rendered as chips
const flRules=r=>`<div class="fl-rules">${r.split(' · ').map(x=>`<span class="chip">${esc(x)}</span>`).join('')}</div>`;
const flBadge=f=>`<i class="fl-badge">${f==='5'?'5×5':'11×11'}</i>`;
const flTime=t=>{try{return new Intl.DateTimeFormat('uk-UA',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'}).format(new Date(t));}catch(e){return '';}};
const flDay=t=>{try{return new Intl.DateTimeFormat('uk-UA',{timeZone:'Europe/Kyiv',day:'numeric',month:'short'}).format(new Date(t));}catch(e){return '';}};
// origin line under the title: who made the league and when (fl_get: owner_name, created_at)
function flOrigin(d){const me=PLAYER&&PLAYER.public_id,day=d.created_at?flDay(d.created_at):'';if(!day)return '';
  const who=me&&d.owner===me?'ти':d.owner_name?esc(d.owner_name):'';return `<p class="fl-origin">${who?`Створив ${who} · ${day}`:`Створено ${day}`}</p>`;}
// bottom of the league page: owner deletes (asks first when others play), member leaves; hidden when signed out
function flFootHtml(d){const me=PLAYER&&PLAYER.public_id;if(!me||!SESSION||!flMe(d))return '';
  const n=Number(d.members)||d.board.length;
  if(d.owner!==me)return `<div class="fl-foot"><button class="fl-quiet calm" id="flLeave">Вийти з ліги</button></div>`;
  if(FL.confirm&&n>1)return `<div class="fl-foot"><div class="fl-delbox pp-delbox" role="group" aria-label="Видалення ліги"><p>Ліга зникне у всіх ${n} ${plUk(n,'гравця','гравців','гравців')}.</p><div class="row"><button class="danger" id="flDelYes">Видалити</button><button class="ghost" id="flDelNo">Скасувати</button></div></div></div>`;
  return `<div class="fl-foot"><button class="fl-quiet" id="flDel">Видалити лігу</button></div>`;}
const flManageErr=e=>/login\?|28000/.test(String(e&&e.message||e))?'Увійди, щоб керувати лігою':'Не вдалося. Спробуй ще раз.';
// leave / delete: server call, back to the list, toast with Undo (same RPC with p_undo)
async function flGone(fn,btn){const id=FL.id;btn.disabled=true;
  try{await playerRpc(fn,{p_id:id});}catch(e){btn.disabled=false;toast(flManageErr(e));return;}
  openFriends();toast(fn==='fl_delete'?'Лігу видалено':'Ти вийшов з ліги','Повернути',()=>flUndo(fn,id));}
async function flUndo(fn,id){try{await playerRpc(fn,{p_id:id,p_undo:true});}catch(e){toast(flManageErr(e));return;}openLeague(id);}
// one bottom toast: toast(text, actionLabel, onAction); hides after 7 s, the timer is paused on touch, hover and focus
const TOAST_MS=7000,TOAST={t:0,left:0,at:0,hold:false};
// exit: back down the way it came in (opacity only with reduced motion), removed when the animation ends
function toastOut(c,ms){if(c.dataset.out)return;c.dataset.out='1';c.classList.add('out');c.setAttribute('aria-hidden','true');const rm=()=>c.remove();
  if(!c.animate){rm();return;}const kf=LESS_MOTION()?[{opacity:1},{opacity:0}]:[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(12px)'}];
  c.animate(kf,{duration:ms,easing:MOTION.ease(),fill:'forwards'}).finished.then(rm,rm);setTimeout(rm,ms+300);}
function toastHide(){clearTimeout(TOAST.t);document.querySelectorAll('#toast .toast:not(.out)').forEach(c=>toastOut(c,MOTION.ms('--dur-out')));}
function toastHold(on){const c=document.querySelector('#toast .toast:not(.out)');if(!c||TOAST.hold===on)return;TOAST.hold=on;c.classList.toggle('hold',on);
  if(on){clearTimeout(TOAST.t);TOAST.left-=Date.now()-TOAST.at;}else{TOAST.at=Date.now();TOAST.t=setTimeout(toastHide,Math.max(TOAST.left,600));}}
function toast(text,action,fn){let el=document.getElementById('toast');
  if(!el){el=document.createElement('div');el.id='toast';el.setAttribute('role','status');el.setAttribute('aria-live','polite');document.body.appendChild(el);}
  clearTimeout(TOAST.t);TOAST.left=TOAST_MS;TOAST.hold=false;TOAST.at=Date.now();
  el.querySelectorAll('.toast:not(.out)').forEach(c=>toastOut(c,MOTION.t(120)));   // replaced: the old one leaves quickly, the new one enters at once
  el.insertAdjacentHTML('beforeend',`<div class="toast"><span>${esc(text)}</span>${action?`<button type="button">${esc(action)}</button>`:''}<i></i></div>`);
  const c=el.lastElementChild;c.onpointerenter=c.onfocusin=()=>toastHold(true);c.onpointerleave=c.onpointercancel=c.onfocusout=()=>toastHold(false);
  if(action)c.querySelector('button').onclick=()=>{toastHide();fn&&fn();};
  TOAST.t=setTimeout(toastHide,TOAST_MS);}
// ---------- markup
function flRender(){const el=document.getElementById('fl');if(!el||!FL)return;
  el.innerHTML=FL.view==='create'?flCreateHtml():FL.view==='draft5'?fl5DraftHtml():FL.view==='match5'?fl5MatchHtml():FL.view==='league'?(FL.data&&FL.data.fmt==='5'?fl5LeagueHtml():flLeagueHtml()):flListHtml();flWire();}
function flListHtml(){const mine=FL.mine||[];const on=mine.filter(x=>!x.over),off=mine.filter(x=>x.over);
  const row=x=>`<button class="fl-row" data-l="${esc(x.id)}">${ic(x.over?'trophy':'account-group')}<span class="t"><b>${esc(x.name)} ${flBadge(x.fmt)}</b><small>${x.fmt==='5'?fl5Sub(x):x.over?`${numOr0(x.days)} ${plUk(x.days,'день','дні','днів')} · ${numOr0(x.members)} ${plUk(x.members,'гравець','гравці','гравців')}`:`День ${numOr0(x.day_n)} з ${numOr0(x.days)} · ${numOr0(x.members)} ${plUk(x.members,'гравець','гравці','гравців')} · сьогодні ${numOr0(x.tries_today)} з ${numOr0(x.tries)} ${plUk(x.tries,'спроби','спроб','спроб')}`}</small></span>${x.place?`<span class="fl-place"><b>${numOr0(x.place)}</b><small>місце</small></span>`:''}</button>`;
  return `<div class="fl-hero"><h1>Грати з друзями</h1><p>Кожен збирає свою команду за однаковими правилами. Чия виявиться кращою?</p>
    ${SESSION?`<button class="primary big0" id="flNew">Створити лігу</button>`:`<button class="primary big0" id="flLogin">Увійти, щоб створити лігу</button><p class="muted" style="font-size:var(--fs-footnote)">Ліги — лише з акаунтом (Google чи Telegram): так результати не загубляться.</p>`}
    <p class="muted" style="font-size:var(--fs-footnote);margin-top:var(--sp-2)">Отримав посилання від друга? Просто відкрий його.</p></div>
    ${FL.mine==null?skBox(skN(3,()=>'<div class="fl-row sk-row"><i class="sk dot"></i><span class="t"><b><i class="sk w60"></i></b><small><i class="sk w40"></i></small></span></div>')):FL.mineErr?flMineErrHtml('flRetry'):''}
    ${on.length?`<div class="sec0">Грають зараз <span>${on.length}</span></div>${on.map(row).join('')}`:''}
    ${off.length?`<div class="sec0">Завершені <span>${off.length}</span></div>${off.map(row).join('')}`:''}
    <div class="sec0">Як це працює</div>
    <ol class="fl-how"><li>${ic('format-list-numbered')}<b>Ти задаєш правила</b></li><li>${ic('soccer-field')}<b>Кожен збирає склад</b></li><li>${ic('trophy')}<b>Найкращий перемагає</b></li></ol>`;}
const fl5Sub=x=>x.over?`турнір зіграно · ${numOr0(x.members)} ${plUk(x.members,'гравець','гравці','гравців')}`:`збір до ${flTime(x.deadline)} · складів ${numOr0(x.fives)} з ${numOr0(x.members)}${x.my_five?'':' · твій ще ні'}`;
function flTiles(key,cols){const f=FL.form;return `<div class="fl-opts c${cols}">${FL_OPT[key].map(([v,t,s])=>`<button class="opt${f[key]===v?' on':''}" data-k="${key}" data-v="${v}"><b>${t}</b>${s?`<small>${s}</small>`:''}</button>`).join('')}</div>`;}
function flCreateHtml(){const f=FL.form;
  return `<div class="fl-hero"><h1>Правила ліги</h1><p>Однакові для всіх. Відрізняється лише команда.</p></div>
    <div class="sec0">Формат</div><div class="fl-opts c2"><button class="opt${f.fmt!=='5'?' on':''}" data-k="fmt" data-v="f11"><b>11×11</b><small>Ліга на кілька днів: щодня тур, очки сумуються</small></button><button class="opt${f.fmt==='5'?' on':''}" data-k="fmt" data-v="f5"><b>5×5</b><small>Турнір: ваші п'ятірки грають одна з одною</small></button></div>
    <div class="sec0">Назва</div><div class="fl-names">${f.names.map(n=>`<button class="chip${f.name===n?' onc':''}" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div><button class="ghost fl-shuf" id="flShuf">${ic('swap-horizontal','sm')}Перемішати</button>
    ${f.fmt==='5'?`<div class="sec0">Збір складів</div>${flTiles('hours',3)}`:`<div class="sec0">Тривалість</div>${flTiles('days',3)}`}
    ${f.fmt==='5'?'':`<div class="sec0">Очки за тур</div>${flTiles('scoring',2)}
    <div class="sec0">Спроби на день</div>${flTiles('tries',2)}
    ${f.tries>1?`<div class="sec0">У залік туру</div>${flTiles('take',2)}`:''}`}
    <div class="sec0">Перекрути колеса</div>${flTiles('rerolls',3)}
    <div class="sec0">Рейтинги гравців</div>${flTiles('ratings',2)}
    <div class="sec0">Епоха</div><div class="fl-opts c2">${ERA_KEYS.map(k=>{const e=ERAS[k];return `<button class="opt${f.era===k?' on':''}" data-k="era" data-v="${k}"><b>${esc(e.name)}</b><small>${seasonLabel(e.y0||DSTAT.y0)+' – '+seasonLabel(e.y1==null?DSTAT.y1:e.y1)}</small></button>`;}).join('')}</div>
    <button class="primary big0" id="flCreate" style="margin-top:var(--sp-4)">${f.fmt==='5'?'Створити й зібрати п\'ятірку':'Створити й грати'}</button><p class="muted" id="flMsg" style="font-size:var(--fs-footnote);text-align:center">${f.fmt==='5'?'Далі — посилання для друзів (до 10) і твоя п\'ятірка. Коли збір закінчиться, турнір зіграє сервер.':'Далі — посилання для друзів і твоя перша спроба.'}</p>`;}
function flLeagueHtml(){const d=FL.data;
  if(!d)return FL.err?`<div class="fl-hero"><p class="muted">${esc(FL.err)}</p><button class="ghost" id="flBack">До ліг</button></div>`:skBox(`<div class="fl-head"><div class="fl-top"><i class="sk blk sk-h1"></i></div></div><div class="fl-tour"><i class="sk w40"></i><i class="sk blk sk-bar"></i><i class="sk blk sk-btn"></i></div>${skN(3,()=>'<div class="fl-row sk-row"><i class="sk dot"></i><span class="t"><b><i class="sk w60"></i></b></span></div>')}`);
  const me=PLAYER&&PLAYER.public_id,member=flMe(d),few=!d.over&&d.board.length<3&&member,mine=d.tour.find(r=>r.u===me),used=mine?numOr0(mine.tries):0,left=Math.max(0,d.tries-used);
  const rules=`${d.board.length} ${plUk(d.board.length,'гравець','гравці','гравців')} · ${d.scoring==='place'?'очки за місце':'сума очок'} · ${d.tries>1?`${d.take==='best'?'найкраща':'остання'} з ${d.tries} спроб`:'1 спроба на день'} · перекрути ${d.rerolls}${d.ratings==='memory'?' · на пам\'ять':''}${d.era!=='all'&&ERAS[d.era]?' · '+ERAS[d.era].name.toLowerCase():''}`;
  const bars=Array.from({length:d.days},(_,i)=>`<i class="${i+1<d.day_n?'done':i+1===d.day_n&&!d.over?'now':''}"></i>`).join('');
  let card;
  if(d.over){const w=d.board[0];card=`<div class="fl-tour"><div class="fl-th"><b>Лігу завершено</b></div><div class="fl-bars">${bars}</div>${w?`<p style="margin:0">${em('trophy','sm')}Переможець — <b>${esc(w.name)}</b>, ${numOr0(w.total)} ${ptsWord(numOr0(w.total))}</p>`:''}</div>`;}
  else{const chips=Array.from({length:d.tries},(_,i)=>`<span class="fl-try${i<used?' on':''}">${i<used&&mine&&d.tries===1?numOr0(mine.pts):i+1}</span>`).join('');
    const btn=!member?(SESSION?`<button class="primary big0" id="flJoin">Приєднатися й грати</button>`:`<button class="primary big0" id="flLogin">Увійти, щоб приєднатися</button>`)
      :left?`<div class="fl-forms">${Object.keys(FORMATIONS).map(f=>`<button class="chip${FL.formation===f?' onc':''}" data-form="${f}">${f}</button>`).join('')}</div><button class="primary big0${few?' solid':''}" id="flPlay">Зіграти спробу ${used+1} з ${d.tries}</button>`
      :`<p class="muted" style="margin:0">Спроби на сьогодні вичерпано. Завтра — новий тур.</p>`;
    card=`<div class="fl-tour"><div class="fl-th"><b>Тур ${numOr0(d.day_n)} з ${numOr0(d.days)}</b><span class="mono muted">до кінця туру ${flLeft()}</span></div><div class="fl-bars">${bars}</div>
      ${member?`<div class="fl-tries"><span class="muted">Спроби сьогодні:</span>${chips}${mine?`<span class="muted">· у залік ${numOr0(mine.pts)} оч → ${numOr0(mine.rk)}-е місце в турі</span>`:''}</div>`:''}${btn}<p class="muted" id="flMsg" style="font-size:var(--fs-footnote);margin:0"></p></div>`;}
  const all=FL.tab!=='tour';
  const rows=all?d.board.map((r,i)=>`<tr${r.u===me?' class="me"':''}><td class="num">${i+1}</td><td>${plink({players:{name:r.name,public_id:r.u}})}</td><td class="num muted">${r.wins?`${numOr0(r.wins)} ${plUk(r.wins,'тур','тури','турів')}`:''}</td><td class="num"><b>${numOr0(r.total)}</b></td></tr>`).join('')
    :d.tour.map(r=>`<tr${r.u===me?' class="me"':''}><td class="num">${numOr0(r.rk)}</td><td>${plink({players:{name:r.name,public_id:r.u}})}</td><td class="num muted">${numOr0(r.w)}-${numOr0(r.d)}-${numOr0(r.l)} · ${numOr0(r.pts)} оч</td><td class="num"><b>${numOr0(r.score)}</b></td></tr>`).join('');
  const link=flLink(d.id),shareBtn=cls=>`<button class="${cls}" id="flShare">${icon('share-variant')}<span>Поділитися</span></button>`;
  // fewer than 3 members: invite is the main action right under the round card; otherwise a compact share button in the header
  const invite=few?`<div class="fl-invc"><b>Запроси друзів</b><p class="muted">У лізі ще мало гравців. Надішли посилання в чат.</p><div class="fl-inv"><input readonly value="${esc(link)}" id="flLinkIn" aria-label="Посилання на лігу">${shareBtn('primary')}</div><p class="muted" id="flShareMsg" style="font-size:var(--fs-footnote)"></p></div>`:'';
  const compact=!d.over&&!few?shareBtn('ghost fl-sh'):'';
  return `<div class="fl-head"><div class="fl-top"><h1>${esc(d.name)} <i class="fl-badge">11×11</i></h1>${compact}</div>${flOrigin(d)}${flRules(rules)}${compact?'<p class="muted" id="flShareMsg" style="font-size:var(--fs-footnote);margin:0"></p>':''}</div>${card}${invite}
    <div class="sec0">Таблиця</div><div class="seg fl-tabs"><button data-tab="all" class="${all?'on':''}">Загальна</button><button data-tab="tour" class="${all?'':'on'}">${d.over?'Останній тур':`Тур ${numOr0(d.day_n)} · сьогодні`}</button></div>
    ${rows?`<div class="tbl"><table><tr><th>#</th><th>Гравець</th><th class="num">${all?'Виграв':'Сезон'}</th><th class="num">Оч</th></tr>${rows}</table></div>`:`<p class="pp-empty">${all?'Поки нікого.':'Сьогодні ще ніхто не зіграв.'}</p>`}
    <p class="muted" style="font-size:var(--fs-caption)">${d.scoring==='place'?'За місце в турі: 1-й отримує стільки очок, скільки гравців зіграло того дня, останній — 1. Не зіграв — 0.':'Сума: у залік туру йдуть очки сезону. Не зіграв — 0.'}</p>
    <button class="ghost" id="flBack" style="margin-top:var(--sp-4)">Усі мої ліги</button>${flFootHtml(d)}`;}
// ---------- actions
function flWire(){const $=id=>document.getElementById(id),el=$('fl');
  if($('flLogin'))$('flLogin').onclick=()=>{ACCT_MSG='';openAcct();};
  if($('flRetry'))$('flRetry').onclick=()=>{FL.mine=null;flRender();flLoadMine();};
  if($('flNew'))$('flNew').onclick=()=>{const names=flShuffle();FL={view:'create',form:{names,name:names[0],fmt:'11',hours:3,days:3,scoring:'place',tries:3,take:'best',rerolls:1,ratings:'show',era:'all'}};screenTag('league_new');flRender();window.scrollTo({top:0});};
  if($('flBack'))$('flBack').onclick=openFriends;
  el.querySelectorAll('[data-l]').forEach(b=>b.onclick=()=>openLeague(b.dataset.l));
  if(FL.view==='create'){
    el.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{const k=b.dataset.k,v=b.dataset.v;FL.form[k]=k==='fmt'?v.slice(1):/^\d+$/.test(v)?+v:v;flRender();});
    el.querySelectorAll('[data-name]').forEach(b=>b.onclick=()=>{FL.form.name=b.dataset.name;flRender();});
    $('flShuf').onclick=()=>{FL.form.names=flShuffle();FL.form.name=FL.form.names[0];flRender();};
    $('flCreate').onclick=async()=>{const f=FL.form,b=$('flCreate'),m=$('flMsg');b.disabled=true;m.textContent='Створюємо…';
      try{if(f.fmt==='5'){const d=await playerRpc('fl_create5',{p_name:f.name,p_hours:f.hours,p_rerolls:f.rerolls,p_ratings:f.ratings,p_era:f.era});
          FL={view:'league',id:d.id,data:d};flUrl(d.id);fl5Draft();return;}
        const d=await playerRpc('fl_create',{p_name:f.name,p_days:f.days,p_tries:f.tries,p_take:f.tries>1?f.take:'best',p_scoring:f.scoring,p_rerolls:f.rerolls,p_ratings:f.ratings,p_era:f.era});
        FL={view:'league',id:d.id,data:d,tab:'all',formation:lsGet('upl30_fl_form')||'4-4-2'};flUrl(d.id);flPlay();}
      catch(e){b.disabled=false;m.textContent=flErr(e);}};}
  if(FL.view==='draft5'||FL.view==='match5'||(FL.view==='league'&&FL.data&&FL.data.fmt==='5'))fl5Wire($,el);
  if(FL.view==='league'){
    if($('flDel'))$('flDel').onclick=()=>{const d=FL.data;if((Number(d.members)||d.board.length)>1){FL.confirm=true;flRender();$('flDelNo').focus();}else flGone('fl_delete',$('flDel'));};
    if($('flDelNo'))$('flDelNo').onclick=()=>{FL.confirm=false;flRender();$('flDel').focus();};
    if($('flDelYes'))$('flDelYes').onclick=()=>flGone('fl_delete',$('flDelYes'));
    if($('flLeave'))$('flLeave').onclick=()=>flGone('fl_leave',$('flLeave'));
    el.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{FL.tab=b.dataset.tab;flRender();});
    el.querySelectorAll('[data-form]').forEach(b=>b.onclick=()=>{FL.formation=b.dataset.form;lsSet('upl30_fl_form',FL.formation);flRender();});
    if($('flPlay'))$('flPlay').onclick=flPlay;
    if($('flJoin'))$('flJoin').onclick=async()=>{const b=$('flJoin'),m=$('flMsg');b.disabled=true;
      try{FL.data=await playerRpc('fl_join',{p_id:FL.id});if(FL.data&&FL.data.fmt==='5'){fl5Draft();return;}flRender();}catch(e){b.disabled=false;m.textContent=flErr(e);}};
    if($('flShare'))$('flShare').onclick=async()=>{const d=FL.data,url=flLink(d.id),text=`Грай зі мною в лігу «${d.name}» — 30-0 УПЛ`,m=$('flShareMsg');
      if(TG&&TG.openTelegramLink){TG.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);return;}
      if(navigator.share){try{await navigator.share({title:d.name,text,url});return;}catch(e){if(e&&e.name==='AbortError')return;}}
      try{await navigator.clipboard.writeText(url);m.textContent='Посилання скопійовано — надішли його друзям у WhatsApp, Viber чи Telegram.';}catch(e){const i=$('flLinkIn');if(i){i.focus();i.select();}m.textContent=i?'Скопіюй посилання вручну.':'Скопіюй посилання вручну: '+url;}};}
}
// league attempt: regular classic draft under league rules (rerolls, ratings, era); formation is the player's own
function flPlay(){const d=FL&&FL.data;if(!d)return;
  S.league={id:d.id,name:d.name,rerolls:d.rerolls,memory:d.ratings==='memory',era:ERAS[d.era]?d.era:'all'};
  S.vd=null;S.challenge=null;S.chal=null;S.result=null;setFmt('classic');S.mode='normal';
  S.formation=FORMATIONS[FL.formation]?FL.formation:'4-4-2';S.slots=newSlots(S.formation);S.taken=new Set();S.wheel=null;S.rerolls=d.rerolls;S.showR=false;S.moveMode=false;
  document.getElementById('modeLabel').textContent=`Ліга «${d.name}» · ${S.formation}`;renderDraft();go(2);}
// after a league season: line under the result (credited or not)
function flAfterSave(r,j){if(!S.league||S.result!==r)return;const el=document.getElementById('leagueMsg');if(!el)return;
  if(j&&j.verified===true){el.hidden=false;el.textContent=j.fl?`Спробу ${j.fl} зараховано в лігу «${S.league.name}».`:j.fl===null?`Цю спробу не зараховано в лігу «${S.league.name}»: спроби на сьогодні вичерпано або тур закінчився.`:'';}}
// ---------- 5x5: squads collected until the deadline -> server plays the tournament (api/fl5.js, engine src/five_core.js) -> table, bracket, matches with events
const FL5_STAGE={group:'Група',sf:'Півфінал',final:'Фінал',duel:'Матч серії'};
// drafting own five: own wheel per player, era and rerolls from league rules; a player only fits his own line
function fl5Draft(){const d=FL&&FL.data;if(!d)return;const form=lsGet('upl30_fl5_form')||'1-2-1';
  FL.view='draft5';FL.d5={form:F5_FORMS[form]?form:'1-2-1',rerolls:d.rerolls,taken:new Set(),cs:null};fl5Slots();fl5Spin();screenTag('league5_draft');window.scrollTo({top:0});}
function fl5Slots(){const t=FL.d5;t.slots=F5_FORMS[t.form].rows.flat().map(slot=>({slot,player:null}));}
function fl5Pool(){const era=FL.data.era,t=FL.d5,need=new Set(t.slots.filter(s=>!s.player).map(s=>s.slot));
  return DATA.clubs.filter(c=>inEra(era,c.y)&&c.pl.some(p=>!t.taken.has(canon(p[5]))&&need.has(f5G(p))));}
function fl5Spin(){const t=FL.d5;const pool=fl5Pool();t.cs=pool.length?pickWeighted(pool,Math.random):null;flRender();}
function fl5Pick(p){const t=FL.d5,cs=t.cs;const s=t.slots.find(x=>!x.player&&x.slot===f5G(p));if(!s)return;
  s.player={name:p[0],id:p[5],slot:s.slot,r:p[2],goals:p[4],club:cs.n,c:cs.c,cc:cs.c,y:cs.y};t.taken.add(canon(p[5]));t.cs=null;
  if(t.slots.every(x=>x.player)){flRender();return;}fl5Spin();}
function fl5DraftHtml(){const d=FL.data,t=FL.d5,cs=t.cs,n=t.slots.filter(s=>s.player).length,full=n===5;
  const need=new Set(t.slots.filter(s=>!s.player).map(s=>s.slot));
  const list=cs?cs.pl.filter(p=>!t.taken.has(canon(p[5]))&&need.has(f5G(p))).sort((a,b)=>b[3]-a[3]):[];
  return `<div class="fl-head"><h1>Твоя п'ятірка ${flBadge('5')}</h1><p class="muted">Ліга «${esc(d.name)}» · воротар і четверо польових, кожен — у своїй лінії</p></div>
    ${n===0?`<div class="sec0">Схема</div><div class="f5forms fl5f">${Object.keys(F5_FORMS).map(k=>`<button class="f5f${t.form===k?' on':''}" data-f5form="${k}"><b>${k}</b><small>${F5_FORMS[k].tag}</small></button>`).join('')}</div>`:`<p class="fl5st"><b>${esc(t.form)}</b> ${esc(F5_FORMS[t.form].tag)} · <b>${n}</b> з 5</p>`}
    <div class="fl5d">${f5Pitch(t)}
    ${full?`<div class="fl5send"><button class="primary big0" id="fl5Send">Відправити склад</button><p class="muted" id="flMsg" style="font-size:var(--fs-footnote);text-align:center">Після відправки змінити не можна. Склади суперників відкриті.</p></div>`
      :`<div class="wheel" style="margin-top:var(--sp-3)"><div class="reels"><div class="reel"><div class="strip"><div class="club">${cs?`<i class="cdot" style="${clubPal(cs.c)}"></i>${esc(cs.n)}`:'Гравців немає'}</div></div></div><div class="reel"><div class="strip"><div class="season">${cs?seasonLabel(cs.y):''}</div></div></div></div>
      <p class="why0">Потрібні: ${[...need].map(s=>F5_L[s]).join(', ')}${cs?` · ${placeNote(cs)||'місце клубу в тому сезоні: '+cs.pos}`:''}</p>
      ${t.rerolls>0?`<div class="rr"><span class="lbl"><span>Перекрутити колесо</span><span class="rrn">залишилось <b>${t.rerolls}</b></span></span><span class="seg"><button id="fl5Rr">Інший клуб і сезон</button></span></div>`:''}
      <div class="squad">${list.map(p=>`<div class="plrow"><button class="pl" data-p5="${esc(p[5])}"><span class="pos ${f5G(p)}">${F5_L[f5G(p)]}</span><span class="nm">${esc(p[0])}</span><span class="rt"></span></button></div>`).join('')}</div></div>`}</div>
    <button class="ghost" id="fl5Back" style="margin-top:var(--sp-4)">До ліги</button>`;}
// 5x5 league page: entry -> tournament -> summary
// squad shown by line from the keeper, surnames only
const fl5Xi=xi=>`<div class="fl5xi">${['GK','DF','MF','FW'].map(g=>{const ps=xi.filter(x=>x.slot===g);return ps.length?`<div><i class="pos ${g}">${F5_L[g]}</i>${ps.map(x=>esc(String(x.name||'').split(' ').pop())).join(' · ')}</div>`:'';}).join('')}</div>`;
// time left until entry deadline; last 15 minutes highlighted
function fl5Left(d){const ms=new Date(d.deadline)-new Date(d.now||Date.now());if(!(ms>0))return '';const m=Math.ceil(ms/60000),h=Math.floor(m/60),mm=m%60;
  const t=h?`${h} год${mm?` ${mm} хв`:''}`:`${m} хв`;return `<p class="fl5left${m<=15?' soon':''}">${ic('timer-sand','sm')}<span>До кінця збору — ${t}<span class="muted"> · до ${flTime(d.deadline)}</span></span></p>`;}
// trophies for a played tournament (once per league; only for entrants with a squad)
function fl5Award(d){const me=PLAYER&&PLAYER.public_id,res=d.result;if(!me||!res||res.cancelled||!res.teams)return;const team=res.teams.findIndex(t=>t.u===me);if(team<0)return;
  const {fresh}=trAwardF5(d.id,res,team);if(fresh.length)setTimeout(()=>{const el=document.getElementById('fl5Tro');if(el){el.hidden=false;el.innerHTML=`<div class="sec0">Нові трофеї</div><div class="tro0">${fresh.map(id=>{const t=trDef(id);return t?`<span>${trBadge(t,true)}${esc(t.n)}</span>`:'';}).join('')}</div>`;}},0);}
function fl5LeagueHtml(){const d=FL.data,me=PLAYER&&PLAYER.public_id,member=flMe(d),few=!d.result&&!fl5Due(d)&&d.board.length<3&&member,my=d.fives.find(f=>f.u===me),res=d.result,owner=me&&d.owner===me;
  const rules=`${d.board.length} ${plUk(d.board.length,'гравець','гравці','гравців')} з 10 · перекрути ${d.rerolls}${d.ratings==='memory'?' · на пам\'ять':''}${d.era!=='all'&&ERAS[d.era]?' · '+ERAS[d.era].name.toLowerCase():''}`;
  const nm=i=>res&&res.teams&&res.teams[i]?res.teams[i].name:'?';
  const score=m=>`${m.ga}:${m.gb}${m.pens?` <span class="muted">(пен. ${m.pens[0]}:${m.pens[1]})</span>`:''}`;
  let card;
  if(res&&res.cancelled)card=`<div class="fl-tour"><b>Лігу скасовано</b><p class="muted" style="margin:0">До кінця збору склад зібрали менше двох гравців.</p></div>`;
  else if(res){const fin=[...res.matches].reverse().find(m=>m.stage==='final')||res.matches[res.matches.length-1];fl5Award(d);
    card=`<div class="fl-tour fl5champ"><div class="kicker">${em('trophy','sm')}Турнір зіграно</div><div class="ttl">${esc(nm(res.champ))}</div><p class="muted" style="margin:0">${res.n===2?`Серія ${res.wins[0]}:${res.wins[1]} · ${esc(nm(0))} — ${esc(nm(1))}`:`Фінал: ${esc(nm(fin.i))} ${score(fin)} ${esc(nm(fin.j))}`}</p>${member?`<button class="primary big0" id="fl5Rev">Реванш</button><p class="muted" style="margin:0;font-size:var(--fs-footnote)">Нова ліга з тими самими правилами — надішли посилання тій самій компанії.</p>`:''}</div>`;}
  else if(fl5Due(d))card=`<div class="fl-tour"><b>Збір закінчився — розігруємо турнір…</b></div>`;
  else{const btn=!member?(SESSION?`<button class="primary big0" id="flJoin">Приєднатися й зібрати п'ятірку</button>`:`<button class="primary big0" id="flLogin">Увійти, щоб приєднатися</button>`)
      :my?`<p style="margin:0">${ic('check-circle','sm')}Твій склад відправлено. Чекаємо на інших.</p>`:`<button class="primary big0${few?' solid':''}" id="fl5Go">Зібрати п'ятірку</button>`;
    card=`<div class="fl-tour"><div class="fl-th"><b>Збір складів</b></div>${fl5Left(d)}
      <p class="muted" style="margin:0">Зібрали ${d.fives.length} з ${d.board.length}. Коли час вийде${owner?' або ти натиснеш «Почати зараз»':''}, сервер зіграє турнір: ${d.board.length<=2?'серія до двох перемог':d.board.length<=7?'група «кожен з кожним» і фінал':'група, півфінали й фінал'}.</p>
      ${btn}${owner?`<button class="ghost big0" id="fl5Start"${d.fives.length<2?' disabled':''}>Почати зараз</button>${d.fives.length<2?'<p class="muted" style="margin:0;font-size:var(--fs-footnote);text-align:center">«Почати зараз» запрацює, коли складів буде хоча б 2.</p>':''}`:''}<p class="muted" id="flMsg" style="font-size:var(--fs-footnote);margin:0"></p></div>`;}
  const mrow=(m,k)=>`<button class="fl5m" data-m5="${k}"><span class="st">${FL5_STAGE[m.stage]||''}</span><span class="a">${esc(nm(m.i))}</span><b>${score(m)}</b><span class="b">${esc(nm(m.j))}</span></button>`;
  let out='';
  if(res&&!res.cancelled){
    const po=res.matches.map((m,k)=>[m,k]).filter(([m])=>m.stage!=='group');
    if(res.table)out+=`<div class="sec0">Група</div><div class="tbl"><table><tr><th>#</th><th>Команда</th><th class="num">В-Н-П</th><th class="num">Голи</th><th class="num">Очки</th></tr>${res.table.map((s,i)=>`<tr${res.teams[s.i].u===me?' class="me"':''}><td class="num">${i+1}</td><td>${esc(nm(s.i))}</td><td class="num">${s.w}-${s.d}-${s.l}</td><td class="num">${s.gf}:${s.ga}</td><td class="num"><b>${s.p}</b></td></tr>`).join('')}</table></div>`;
    out+=`<div class="sec0">${res.table?'Плей-оф':'Матчі'}</div><div class="fl5ms">${po.map(([m,k])=>mrow(m,k)).join('')}</div>`;
    if(res.table)out+=`<details class="tip" style="margin-top:var(--sp-2)"><summary>Матчі групи</summary><div class="fl5ms">${res.matches.map((m,k)=>[m,k]).filter(([m])=>m.stage==='group').map(([m,k])=>mrow(m,k)).join('')}</div></details>`;}
  const waiting=d.board.filter(b=>!d.fives.some(f=>f.u===b.u));
  out+=`<div class="sec0">Склади <span>${d.fives.length}</span></div><div class="fl5teams">${d.fives.map(f=>`<div class="fl5t${f.u===me?' me':''}"><b>${esc(f.name)}</b> <span class="muted mono">${esc(f.form)}</span>${fl5Xi(f.xi||[])}</div>`).join('')}
    ${!res?waiting.map(b=>`<div class="fl5t off"><b>${esc(b.name)}</b> <span class="muted">збирає склад…</span></div>`).join(''):''}</div>`;
  const link=flLink(d.id),open=!res&&!fl5Due(d),shareBtn=cls=>`<button class="${cls}" id="flShare">${icon('share-variant')}<span>Поділитися</span></button>`;
  // fewer than 3 members: invite right under the status card as the main action; otherwise a compact share button in the header
  const invite=few?`<div class="fl-invc"><b>Запроси друзів</b><p class="muted">У лізі ще мало гравців. Надішли посилання в чат.</p><div class="fl-inv"><input readonly value="${esc(link)}" id="flLinkIn" aria-label="Посилання на лігу">${shareBtn('primary')}</div><p class="muted" id="flShareMsg" style="font-size:var(--fs-footnote)"></p></div>`:'';
  const compact=open&&!few?shareBtn('ghost fl-sh'):'';
  return `<div class="fl-head"><div class="fl-top"><h1>${esc(d.name)} ${flBadge('5')}</h1>${compact}</div>${flOrigin(d)}${flRules(rules)}${compact?'<p class="muted" id="flShareMsg" style="font-size:var(--fs-footnote);margin:0"></p>':''}</div>${card}${invite}<div id="fl5Tro" hidden></div>${out}
    <button class="ghost" id="flBack" style="margin-top:var(--sp-4)">Усі мої ліги</button>${flFootHtml(d)}`;}
// match: score, events by minute (goals, penalties, VAR), shootout; "watch live" reveals events one by one
function fl5Feed(m,nm){const it=[];
  for(const e of m.ev)if(!e.pen)it.push({min:e.min,side:e.side,g:1,h:`${ic('soccer','sm')}<b>${esc(e.sc.name)}</b>${e.as?`<span class="muted"> · пас ${esc(e.as.name)}</span>`:''}`});
  for(const e of m.ep)it.push({min:e.min,side:e.side,h:e.k==='var'?`${ic('tv','sm')}<b>VAR:</b> суддя йде до монітора — ${e.ok?'пенальті підтверджено':'<b>рішення скасовано</b>'}`
    :`Суддя призначив пенальті. ${esc(e.by.name)} — ${e.res==='goal'?'<b>забив</b>':e.res==='save'?`<b>сейв</b> ${esc(e.gk.name)}`:'<b>мимо</b>'}`,pen:1,g:e.k==='pen'&&e.res==='goal'?1:0});
  it.sort((a,b)=>a.min-b.min||(a.pen&&!b.pen?-1:0));
  return it.map(x=>({...x,html:`<div class="f5ev s${x.side}"><span class="mono">${x.min}'</span><span>${x.h}</span><span class="muted fl5who">${esc(nm(x.side))}</span></div>`}));}
function fl5MatchHtml(){const d=FL.data,res=d.result,m=res.matches[FL.mi],nm=s=>res.teams[s?m.j:m.i].name;
  const feed=fl5Feed(m,nm),shown=FL.live==null?feed.length:FL.live,seen=feed.slice(0,shown);
  const sc=FL.live==null?[m.ga,m.gb]:[0,1].map(sd=>seen.filter(x=>x.g&&x.side===sd).length);   // live: score grows with revealed events
  const all=[...m.ra.map(x=>({...x,t:nm(0)})),...m.rb.map(x=>({...x,t:nm(1)}))].sort((a,b)=>b.rt-a.rt),mvp=all[0];
  return `<div class="hero f5live" style="margin-top:var(--sp-4)"><div class="kicker">${FL5_STAGE[m.stage]||''} · 2×20 хвилин</div>
    <div class="f5score"><span>${esc(nm(0))}</span><b>${sc[0]}:${sc[1]}</b><span>${esc(nm(1))}</span></div>
    ${m.pens?`<p class="muted" style="margin:0;text-align:center">Серія пенальті ${m.pens[0]}:${m.pens[1]}</p>`:''}
    <p class="muted" style="margin:0;text-align:center">xG ${m.xg[0].toFixed(1)} : ${m.xg[1].toFixed(1)} · ${em('star','sm')}гравець матчу: <b>${esc(mvp.name)}</b> ${mvp.rt.toFixed(1)}</p></div>
    <div class="row" style="margin-top:var(--sp-3)"><button class="ghost" id="fl5Live">${FL.live==null?'Дивитися наживо':'Одразу підсумок'}</button></div>
    <div class="f5evs" id="fl5Feed" style="margin-top:var(--sp-2)">${seen.map(x=>x.html).join('')||(shown>=feed.length?'<p class="muted" style="margin:0">Голів не було.</p>':'')}</div>
    ${m.so&&shown>=feed.length?`<div class="sec0">Серія пенальті</div><div class="fl5so">${m.so.map(k=>`<span class="s${k.side}${k.ok?' ok':''}">${k.ok?'✓':'✗'} ${esc(k.by.name)}</span>`).join('')}</div>`:''}
    <button class="ghost" id="fl5Back" style="margin-top:var(--sp-4)">До ліги</button>`;}
function fl5Wire($,el){
  if($('fl5Go'))$('fl5Go').onclick=fl5Draft;
  // "Rematch": new 5x5 league form with the same rules and a "Rematch: ..." name (deadline editable), then a regular invite link
  if($('fl5Rev'))$('fl5Rev').onclick=()=>{const d=FL.data,nm=Array.from('Реванш: '+String(d.name).replace(/^Реванш: /,'')).slice(0,40).join('');const names=[nm,...flShuffle().filter(x=>x!==nm)];
    FL={view:'create',form:{names,name:nm,fmt:'5',hours:3,days:3,scoring:'place',tries:3,take:'best',rerolls:d.rerolls,ratings:d.ratings,era:ERA_KEYS.includes(d.era)?d.era:'all'}};screenTag('league_new');flRender();window.scrollTo({top:0});};
  if($('fl5Back'))$('fl5Back').onclick=()=>{clearInterval(FL.liveT);FL.view='league';FL.live=null;flRender();flLoad();};
  el.querySelectorAll('[data-f5form]').forEach(b=>b.onclick=()=>{FL.d5.form=b.dataset.f5form;lsSet('upl30_fl5_form',FL.d5.form);fl5Slots();flRender();});
  el.querySelectorAll('[data-p5]').forEach(b=>b.onclick=()=>{const p=FL.d5.cs&&FL.d5.cs.pl.find(q=>q[5]===b.dataset.p5);if(p)fl5Pick(p);});
  if($('fl5Rr'))$('fl5Rr').onclick=()=>{if(FL.d5.rerolls>0){FL.d5.rerolls--;fl5Spin();}};
  if($('fl5Send'))$('fl5Send').onclick=async()=>{const b=$('fl5Send'),m=$('flMsg');b.disabled=true;m.textContent='Відправляємо…';
    const xi=FL.d5.slots.map(s=>({id:s.player.id,name:s.player.name,slot:s.slot,c:s.player.c,y:s.player.y}));
    try{FL.data=await playerRpc('fl5_submit',{p_id:FL.id,p_form:FL.d5.form,p_xi:xi});FL.view='league';FL.d5=null;flRender();window.scrollTo({top:0});}catch(e){b.disabled=false;m.textContent=flErr(e);}};
  if($('fl5Start'))$('fl5Start').onclick=async()=>{const b=$('fl5Start'),m=$('flMsg');b.disabled=true;
    try{FL.data=await playerRpc('fl5_start',{p_id:FL.id});flRender();fl5Play();}catch(e){b.disabled=false;m.textContent=flErr(e);}};
  el.querySelectorAll('[data-m5]').forEach(b=>b.onclick=()=>{FL.view='match5';FL.mi=+b.dataset.m5;FL.live=null;flRender();window.scrollTo({top:0});});
  if($('fl5Live'))$('fl5Live').onclick=()=>{clearInterval(FL.liveT);
    if(FL.live!=null){FL.live=null;flRender();return;}
    FL.live=0;flRender();const st=FL,res=st.data.result,m=res.matches[st.mi],n=fl5Feed(m,()=>'').length;
    st.liveT=setInterval(()=>{if(FL!==st||st.view!=='match5'){clearInterval(st.liveT);return;}st.live++;if(st.live>=n){clearInterval(st.liveT);st.live=null;}flRender();},1400);};
}
// "My leagues" on the player's own page
// group leagues (Telegram chats with the bot): tg_leagues_mine, sql/v070.sql; before that SQL runs the call fails and the list is just empty
const tgLeagueRow=x=>`<a class="fl-row" href="https://t.me/${TG_BOT}?startapp=g${encodeURIComponent(x.chat_id)}" target="_blank" rel="noopener">${ic('telegram')}<span class="t"><b>${esc(x.title||'Група')}</b><small>група в Telegram · ${numOr0(x.members)} ${plUk(x.members,'гравець','гравці','гравців')}${x.played_today?` · сьогодні зіграли ${numOr0(x.played_today)}`:''}</small></span></a>`;
async function ppLeagues(){if(!document.getElementById('ppLeagues')||!PP)return;
  // the page re-renders 2-3 times per open (profile, account): request the lists once per open (PP.lg)
  const st=PP;if(!st.lg){const o={mine:[],groups:[],err:false};st.lg=Promise.all([playerRpc('fl_mine').then(r=>{o.mine=r||[];},e=>{o.err=flMineFail(e);}),playerRpc('tg_leagues_mine').then(r=>{o.groups=Array.isArray(r)?r:[];},()=>{})]).then(()=>o);}
  const {mine,groups,err}=await st.lg;if(PP!==st)return;
  const el=document.getElementById('ppLeagues');if(!el)return;   // page may have re-rendered while awaiting the response; take the fresh element
  el.innerHTML=`<div class="pp-sec"><h3>Мої ліги</h3><button class="ghost" id="ppFl">${mine.length?'Усі':'Створити'}</button></div>`+(mine.length?mine.slice(0,5).map(x=>`<button class="fl-row" data-l="${esc(x.id)}">${ic(x.over?'trophy':'account-group')}<span class="t"><b>${esc(x.name)} ${flBadge(x.fmt)}</b><small>${x.fmt==='5'?fl5Sub(x):`${x.over?'завершена':`день ${numOr0(x.day_n)} з ${numOr0(x.days)}`} · ${numOr0(x.members)} ${plUk(x.members,'гравець','гравці','гравців')}`}</small></span>${x.place?`<span class="fl-place"><b>${numOr0(x.place)}</b><small>місце</small></span>`:''}</button>`).join(''):(err?flMineErrHtml('ppFlRetry'):groups.length?'':`<p class="pp-empty">Ти ще не граєш у лігах з друзями.</p>`))+groups.slice(0,5).map(tgLeagueRow).join('');
  el.querySelectorAll('[data-l]').forEach(b=>b.onclick=()=>openLeague(b.dataset.l));el.querySelector('#ppFl').onclick=openFriends;
  const r=el.querySelector('#ppFlRetry');if(r)r.onclick=()=>{r.disabled=true;st.lg=null;ppLeagues();};}
// ?l=... link opened: league page
if(ONLINE){const m=/[?&]l=([a-z2-9]{6})(?:&|$)/.exec(location.search);if(m)setTimeout(()=>openLeague(m[1]),0);}
