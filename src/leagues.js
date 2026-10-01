// ---------- ЛІГИ З ДРУЗЯМИ 11×11 (0.61, docs/leagues_online.md, макети docs/mockups/lg_1_list, lg_2_create, lg_3_league11).
// Ліга — правила для всіх (тривалість, спроби, у залік, очки за тур, перекрути, рейтинги, епоха); кожен день — тур; колесо в кожного своє.
// Спроба — звичайний сезон класики «Звичайний» з кодом ліги (seasons.fl_id): зараховує сервер після перевірки (api/verify.js → fl_record).
// Створити й вступити — лише з входом (RPC fl_create / fl_join, sql/v061_leagues.sql). Посилання — ?l=<код> (DECISIONS п. 10, 11).
const FL_NAMES=['Паляниця Ліга','Ліга диванних тренерів','Банка на воротах','Сухарі з родзинками','Кефаль і Ко','Автобус на воротах','Штанга-Перекладина','Мазила ФК',
  'Пиво і пенальті','Гра в одні ворота','Кум у запасі','Дворовий Кубок','Тренер, випусти мене','Жовта картка за сміх','Суддю на мило','Мʼяч круглий','Поле 3×3',
  'Серце легше','Все буде добре','Біля кутового','Золотий дубль','Офсайд по-київськи','Вареники в додатковий час','Ні кроку назад','Шаланди, повні голів',
  'Лобан би схвалив','Пенальті на 90+5','Легенди двору','Кубок кума','Сало і стандарти'];
const FL_OPT={days:[[1,'1 день'],[3,'3 дні'],[7,'7 днів']],
  scoring:[['place','За місце','1-й отримує стільки, скільки зіграло; останній — 1'],['sum','Сума','очки сезону додаються']],
  tries:[[1,'1 спроба','без права на помилку'],[3,'3 спроби','']],
  take:[['best','Найкраща','твій максимум за день'],['last','Остання','ризиковано: переграв — замінив']],
  rerolls:[[3,'3','легко'],[1,'1','нормально'],[0,'0','хардкор']],
  ratings:[['show','Видно',''],['memory','На пам\'ять','рейтинги приховані']]};
let FL=null;   // {view:'list'|'create'|'league', id, data, mine, form, tab, formation}
const flUrl=id=>{try{const q=new URLSearchParams(location.search);if(id)q.set('l',id);else q.delete('l');const s=q.toString();history.replaceState(null,'',location.pathname+(s?'?'+s:'')+location.hash);}catch(e){}};
const flLink=id=>`${location.origin&&location.origin!=='null'?location.origin:'https://upl-30-0.vercel.app'}${location.pathname||'/'}?l=${id}`;
async function flRpc(fn,args){const r=await fetch(`${SB_URL}/rest/v1/rpc/${fn}?apikey=${SB_KEY}`,{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify(args)});
  const t=await r.text();if(!r.ok)throw new Error(`${fn} ${r.status}: ${t.slice(0,160)}`);return t?JSON.parse(t):null;}
const flErr=e=>{const m=String(e&&e.message||e);return /login\?|28000/.test(m)?'Спершу увійди через Google чи Telegram.':/fl_over/.test(m)?'Ця ліга вже завершилась.':/fl_none/.test(m)?'Такої ліги немає. Перевір посилання.':/fl_many/.test(m)?'Забагато ліг за день. Спробуй завтра.':/404|PGRST202/.test(m)?'Ліги ще не ввімкнено. Спробуй трохи пізніше.':'Не вдалося. Спробуй ще раз.';};
function flShuffle(){const a=[...FL_NAMES],o=[];while(o.length<3)o.push(a.splice(Math.floor(Math.random()*a.length),1)[0]);return o;}
// хвилин до кінця туру (опівночі за Києвом)
function flLeft(){try{const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()).split(':');const m=24*60-(+p[0]%24)*60-(+p[1]);return `${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`;}catch(e){return '';}}
// ---------- вхід на екран
function openFriends(){FL={view:'list',mine:null};screenTag('friends');flUrl(null);go(7);flRender();flLoadMine();}
function openLeague(id){FL={view:'league',id,data:null,tab:'all',formation:lsGet('upl30_fl_form')||'4-4-2'};screenTag('league');go(7);flUrl(id);flRender();flLoad();}
async function flLoadMine(){if(!ONLINE||!FL)return;const st=FL;try{st.mine=await playerRpc('fl_mine');}catch(e){st.mine=[];}if(FL===st&&st.view==='list')flRender();}
async function flLoad(){const st=FL;try{st.data=await flRpc('fl_get',{p_id:st.id});st.err=st.data?'':'Такої ліги немає. Перевір посилання.';}catch(e){st.err=flErr(e);}if(FL===st)flRender();}
const flMe=d=>PLAYER&&PLAYER.public_id&&d&&d.board.some(r=>r.u===PLAYER.public_id);
// ---------- розмітка
function flRender(){const el=document.getElementById('fl');if(!el||!FL)return;
  el.innerHTML=FL.view==='create'?flCreateHtml():FL.view==='league'?flLeagueHtml():flListHtml();flWire();}
function flListHtml(){const mine=FL.mine||[];const on=mine.filter(x=>!x.over),off=mine.filter(x=>x.over);
  const row=x=>`<button class="fl-row" data-l="${esc(x.id)}">${ic(x.over?'trophy':'account-group')}<span class="t"><b>${esc(x.name)} <i class="fl-badge">11×11</i></b><small>${x.over?`${numOr0(x.days)} ${plUk(x.days,'день','дні','днів')} · ${numOr0(x.members)} ${plUk(x.members,'гравець','гравці','гравців')}`:`День ${numOr0(x.day_n)} з ${numOr0(x.days)} · ${numOr0(x.members)} ${plUk(x.members,'гравець','гравці','гравців')} · сьогодні ${numOr0(x.tries_today)} з ${numOr0(x.tries)} ${plUk(x.tries,'спроби','спроб','спроб')}`}</small></span>${x.place?`<span class="fl-place"><b>${numOr0(x.place)}</b><small>місце</small></span>`:''}</button>`;
  return `<div class="fl-hero"><h1>Грати з друзями</h1><p>Кожен збирає свою команду за однаковими правилами. Чия виявиться кращою?</p>
    ${SESSION?`<button class="primary big0" id="flNew">Створити лігу</button>`:`<button class="primary big0" id="flLogin">Увійти, щоб створити лігу</button><p class="muted" style="font-size:13px">Ліги — лише з акаунтом (Google чи Telegram): так результати не загубляться.</p>`}
    <p class="muted" style="font-size:13px;margin-top:8px">Отримав посилання від друга? Просто відкрий його.</p></div>
    ${FL.mine==null?'<p class="muted">Завантаження…</p>':''}
    ${on.length?`<div class="sec0">Грають зараз <span>${on.length}</span></div>${on.map(row).join('')}`:''}
    ${off.length?`<div class="sec0">Завершені <span>${off.length}</span></div>${off.map(row).join('')}`:''}
    <div class="sec0">Як це працює</div>
    <div class="fl-how"><div>${ic('format-list-numbered')}<span><b>Ти задаєш правила</b><small>Один раз для всіх — чесна гра.</small></span></div>
    <div>${ic('soccer-field')}<span><b>Кожен збирає склад</b><small>Колесо в кожного своє.</small></span></div>
    <div>${ic('trophy')}<span><b>Найкращий перемагає</b><small>Щодня тур, очки додаються до кінця ліги.</small></span></div></div>`;}
function flTiles(key,cols){const f=FL.form;return `<div class="fl-opts c${cols}">${FL_OPT[key].map(([v,t,s])=>`<button class="opt${f[key]===v?' on':''}" data-k="${key}" data-v="${v}"><b>${t}</b>${s?`<small>${s}</small>`:''}</button>`).join('')}</div>`;}
function flCreateHtml(){const f=FL.form;
  return `<div class="fl-hero"><h1>Правила ліги</h1><p>Однакові для всіх. Відрізняється лише команда.</p></div>
    <div class="sec0">Формат</div><div class="fl-opts c2"><button class="opt on" data-fmt="11"><b>11×11</b><small>Ліга на кілька днів: щодня тур, очки сумуються</small></button><button class="opt" disabled><b>5×5</b><small>Турнір: матчі між вами — скоро</small></button></div>
    <div class="sec0">Назва</div><div class="fl-names">${f.names.map(n=>`<button class="chip${f.name===n?' onc':''}" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div><button class="ghost fl-shuf" id="flShuf">${ic('swap-horizontal','sm')}Перемішати</button>
    <div class="sec0">Тривалість</div>${flTiles('days',3)}
    <div class="sec0">Очки за тур</div>${flTiles('scoring',2)}
    <div class="sec0">Спроби на день</div>${flTiles('tries',2)}
    ${f.tries>1?`<div class="sec0">У залік туру</div>${flTiles('take',2)}`:''}
    <div class="sec0">Перекрути колеса</div>${flTiles('rerolls',3)}
    <div class="sec0">Рейтинги гравців</div>${flTiles('ratings',2)}
    <div class="sec0">Епоха</div><div class="fl-opts c2">${Object.entries(ERAS).map(([k,e])=>`<button class="opt${f.era===k?' on':''}" data-k="era" data-v="${k}"><b>${esc(e.name)}</b><small>${e.y0?seasonLabel(e.y0)+' – '+seasonLabel(DSTAT.y1):seasonLabel(DSTAT.y0)+' – '+seasonLabel(DSTAT.y1)}</small></button>`).join('')}</div>
    <button class="primary big0" id="flCreate" style="margin-top:18px">Створити й грати</button><p class="muted" id="flMsg" style="font-size:13px;text-align:center">Далі — посилання для друзів і твоя перша спроба.</p>`;}
function flLeagueHtml(){const d=FL.data;
  if(!d)return `<div class="fl-hero"><p class="muted">${esc(FL.err||'Завантаження…')}</p>${FL.err?'<button class="ghost" id="flBack">До ліг</button>':''}</div>`;
  const me=PLAYER&&PLAYER.public_id,member=flMe(d),mine=d.tour.find(r=>r.u===me),used=mine?numOr0(mine.tries):0,left=Math.max(0,d.tries-used);
  const rules=`${d.board.length} ${plUk(d.board.length,'гравець','гравці','гравців')} · ${d.scoring==='place'?'очки за місце':'сума очок'} · ${d.tries>1?`${d.take==='best'?'найкраща':'остання'} з ${d.tries} спроб`:'1 спроба на день'} · перекрути ${d.rerolls}${d.ratings==='memory'?' · на пам\'ять':''}${d.era!=='all'&&ERAS[d.era]?' · '+ERAS[d.era].name.toLowerCase():''}`;
  const bars=Array.from({length:d.days},(_,i)=>`<i class="${i+1<d.day_n?'done':i+1===d.day_n&&!d.over?'now':''}"></i>`).join('');
  let card;
  if(d.over){const w=d.board[0];card=`<div class="fl-tour"><div class="fl-th"><b>Ліга завершена</b></div><div class="fl-bars">${bars}</div>${w?`<p style="margin:0">${ic('trophy','sm')}Переможець — <b>${esc(w.name)}</b>, ${numOr0(w.total)} ${ptsWord(numOr0(w.total))}</p>`:''}</div>`;}
  else{const chips=Array.from({length:d.tries},(_,i)=>`<span class="fl-try${i<used?' on':''}">${i<used&&mine&&d.tries===1?numOr0(mine.pts):i+1}</span>`).join('');
    const btn=!member?(SESSION?`<button class="primary big0" id="flJoin">Приєднатися й грати</button>`:`<button class="primary big0" id="flLogin">Увійти, щоб приєднатися</button>`)
      :left?`<div class="fl-forms">${Object.keys(FORMATIONS).map(f=>`<button class="chip${FL.formation===f?' onc':''}" data-form="${f}">${f}</button>`).join('')}</div><button class="primary big0" id="flPlay">Зіграти спробу ${used+1} з ${d.tries}</button>`
      :`<p class="muted" style="margin:0">Спроби на сьогодні вичерпано. Завтра — новий тур.</p>`;
    card=`<div class="fl-tour"><div class="fl-th"><b>Тур ${numOr0(d.day_n)} з ${numOr0(d.days)}</b><span class="mono muted">до кінця туру ${flLeft()}</span></div><div class="fl-bars">${bars}</div>
      ${member?`<div class="fl-tries"><span class="muted">Спроби сьогодні:</span>${chips}${mine?`<span class="muted">· у залік ${numOr0(mine.pts)} оч → ${numOr0(mine.rk)}-е місце в турі</span>`:''}</div>`:''}${btn}<p class="muted" id="flMsg" style="font-size:13px;margin:0"></p></div>`;}
  const all=FL.tab!=='tour';
  const rows=all?d.board.map((r,i)=>`<tr${r.u===me?' class="me"':''}><td class="num">${i+1}</td><td>${plink({players:{name:r.name,public_id:r.u}})}</td><td class="num muted">${r.wins?`${numOr0(r.wins)} ${plUk(r.wins,'тур','тури','турів')}`:''}</td><td class="num"><b>${numOr0(r.total)}</b></td></tr>`).join('')
    :d.tour.map(r=>`<tr${r.u===me?' class="me"':''}><td class="num">${numOr0(r.rk)}</td><td>${plink({players:{name:r.name,public_id:r.u}})}</td><td class="num muted">${numOr0(r.w)}-${numOr0(r.d)}-${numOr0(r.l)} · ${numOr0(r.pts)} оч</td><td class="num"><b>${numOr0(r.score)}</b></td></tr>`).join('');
  const link=flLink(d.id);
  return `<div class="fl-head"><h1>${esc(d.name)} <i class="fl-badge">11×11</i></h1><p class="muted">${esc(rules)}</p></div>${card}
    <div class="sec0">Таблиця</div><div class="seg fl-tabs"><button data-tab="all" class="${all?'on':''}">Загальна</button><button data-tab="tour" class="${all?'':'on'}">${d.over?'Останній тур':`Тур ${numOr0(d.day_n)} · сьогодні`}</button></div>
    ${rows?`<div class="tbl"><table><tr><th>#</th><th>Гравець</th><th class="num">${all?'Виграв':'Сезон'}</th><th class="num">Оч</th></tr>${rows}</table></div>`:`<p class="pp-empty">${all?'Поки нікого.':'Сьогодні ще ніхто не зіграв.'}</p>`}
    <p class="muted" style="font-size:12.5px">${d.scoring==='place'?'За місце в турі: 1-й отримує стільки очок, скільки гравців зіграло того дня, останній — 1. Не зіграв — 0.':'Сума: у залік туру йдуть очки сезону. Не зіграв — 0.'}</p>
    ${d.over?'':`<div class="sec0">Запросити</div><div class="fl-inv"><input readonly value="${esc(link)}" id="flLinkIn" aria-label="Посилання на лігу"><button class="primary" id="flShare" aria-label="Поділитися посиланням">${icon('share-variant')}</button></div><p class="muted" id="flShareMsg" style="font-size:13px"></p>`}
    <button class="ghost" id="flBack" style="margin-top:14px">Усі мої ліги</button>`;}
// ---------- дії
function flWire(){const $=id=>document.getElementById(id),el=$('fl');
  if($('flLogin'))$('flLogin').onclick=()=>{ACCT_MSG='';openAcct();};
  if($('flNew'))$('flNew').onclick=()=>{const names=flShuffle();FL={view:'create',form:{names,name:names[0],days:3,scoring:'place',tries:3,take:'best',rerolls:1,ratings:'show',era:'all'}};screenTag('league_new');flRender();window.scrollTo({top:0});};
  if($('flBack'))$('flBack').onclick=openFriends;
  el.querySelectorAll('[data-l]').forEach(b=>b.onclick=()=>openLeague(b.dataset.l));
  if(FL.view==='create'){
    el.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{const k=b.dataset.k,v=b.dataset.v;FL.form[k]=/^\d+$/.test(v)?+v:v;flRender();});
    el.querySelectorAll('[data-name]').forEach(b=>b.onclick=()=>{FL.form.name=b.dataset.name;flRender();});
    $('flShuf').onclick=()=>{FL.form.names=flShuffle();FL.form.name=FL.form.names[0];flRender();};
    $('flCreate').onclick=async()=>{const f=FL.form,b=$('flCreate'),m=$('flMsg');b.disabled=true;m.textContent='Створюємо…';
      try{const d=await playerRpc('fl_create',{p_name:f.name,p_days:f.days,p_tries:f.tries,p_take:f.tries>1?f.take:'best',p_scoring:f.scoring,p_rerolls:f.rerolls,p_ratings:f.ratings,p_era:f.era});
        FL={view:'league',id:d.id,data:d,tab:'all',formation:lsGet('upl30_fl_form')||'4-4-2'};flUrl(d.id);flPlay();}
      catch(e){b.disabled=false;m.textContent=flErr(e);}};}
  if(FL.view==='league'){
    el.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{FL.tab=b.dataset.tab;flRender();});
    el.querySelectorAll('[data-form]').forEach(b=>b.onclick=()=>{FL.formation=b.dataset.form;lsSet('upl30_fl_form',FL.formation);flRender();});
    if($('flPlay'))$('flPlay').onclick=flPlay;
    if($('flJoin'))$('flJoin').onclick=async()=>{const b=$('flJoin'),m=$('flMsg');b.disabled=true;
      try{FL.data=await playerRpc('fl_join',{p_id:FL.id});flRender();}catch(e){b.disabled=false;m.textContent=flErr(e);}};
    if($('flShare'))$('flShare').onclick=async()=>{const d=FL.data,url=flLink(d.id),text=`Грай зі мною в лігу «${d.name}» — 30-0 УПЛ`,m=$('flShareMsg');
      if(TG&&TG.openTelegramLink){TG.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);return;}
      if(navigator.share){try{await navigator.share({title:d.name,text,url});return;}catch(e){if(e&&e.name==='AbortError')return;}}
      try{await navigator.clipboard.writeText(url);m.textContent='Посилання скопійовано — надішли його друзям у WhatsApp, Viber чи Telegram.';}catch(e){const i=$('flLinkIn');i.focus();i.select();m.textContent='Скопіюй посилання вручну.';}};}
}
// спроба ліги: звичайний драфт класики за правилами ліги (перекрути, рейтинги, епоха); схема — своя
function flPlay(){const d=FL&&FL.data;if(!d)return;
  S.league={id:d.id,name:d.name,rerolls:d.rerolls,memory:d.ratings==='memory',era:ERAS[d.era]?d.era:'all'};
  S.daily=null;S.challenge=null;S.chal=null;S.result=null;setFmt('classic');S.mode='normal';
  S.formation=FORMATIONS[FL.formation]?FL.formation:'4-4-2';S.slots=newSlots(S.formation);S.taken=new Set();S.wheel=null;S.rerolls=d.rerolls;S.showR=false;S.moveMode=false;
  document.getElementById('modeLabel').textContent=`Ліга «${d.name}» · ${S.formation}`;renderDraft();go(2);}
// після сезону ліги: рядок під результатом (зараховано / ні)
function flAfterSave(r,j){if(!S.league||S.result!==r)return;const el=document.getElementById('leagueMsg');if(!el)return;
  if(j&&j.verified===true){el.hidden=false;el.textContent=j.fl?`Спробу ${j.fl} зараховано в лігу «${S.league.name}».`:j.fl===null?`Цю спробу не зараховано в лігу «${S.league.name}»: спроби на сьогодні вичерпано або тур закінчився.`:'';}}
// «Мої ліги» на своїй сторінці гравця
async function ppLeagues(){if(!document.getElementById('ppLeagues'))return;let mine=[];try{mine=await playerRpc('fl_mine');}catch(e){}
  const el=document.getElementById('ppLeagues');if(!el)return;   // сторінку могли перемалювати, поки чекали відповіді — беремо свіжий блок
  el.innerHTML=`<div class="pp-sec"><h3>Мої ліги</h3><button class="ghost" id="ppFl">${mine.length?'Усі':'Створити'}</button></div>`+(mine.length?mine.slice(0,5).map(x=>`<button class="fl-row" data-l="${esc(x.id)}">${ic(x.over?'trophy':'account-group')}<span class="t"><b>${esc(x.name)}</b><small>${x.over?'завершена':`день ${numOr0(x.day_n)} з ${numOr0(x.days)}`} · ${numOr0(x.members)} ${plUk(x.members,'гравець','гравці','гравців')}</small></span>${x.place?`<span class="fl-place"><b>${numOr0(x.place)}</b><small>місце</small></span>`:''}</button>`).join(''):`<p class="pp-empty">Ти ще не граєш у лігах з друзями.</p>`);
  el.querySelectorAll('[data-l]').forEach(b=>b.onclick=()=>openLeague(b.dataset.l));el.querySelector('#ppFl').onclick=openFriends;}
// відкрито посилання ?l=… — сторінка ліги
if(ONLINE){const m=/[?&]l=([a-z2-9]{6})(?:&|$)/.exec(location.search);if(m)setTimeout(()=>openLeague(m[1]),0);}
