// ---------- One club: club list (s8), club card on the setup screen, per-player club records
// CLUB_REC {code:[best pts,year,games,worst pts,year,games]} is injected by build.py from standings; clubs without history are newcomers
const CLUB_REC=/*__CLUB_REC__*/{};
const OC_FILTERS=[['all','Усі'],['todo','Не почато'],['start','Почато'],['done','Пройдено']];
let OC_FILTER='all',OC_LIST=null;
// clubs A-Z with their latest name and number of UPL seasons
function ocClubs(){if(OC_LIST)return OC_LIST;const m={};
  for(const c of DATA.clubs){const e=m[c.c]||(m[c.c]={c:c.c,n:c.n,y:c.y,k:0});e.k++;if(c.y>=e.y){e.y=c.y;e.n=c.n;}}
  return OC_LIST=Object.values(m).sort((a,b)=>a.n.localeCompare(b.n,'uk'));}
// player records per club {code:{b,w,n}}; best results saved before this key existed count as one season
function ocMine(){const m={...(lsGet('upl30_clubrec')||{})};
  for(const [k,v] of Object.entries(BEST))if(k.startsWith('oneclub:')&&v&&v.pts!=null&&!m[k.slice(8)])m[k.slice(8)]={b:v.pts,w:v.pts,n:1};
  return m;}
function ocState(code,m){const rec=CLUB_REC[code],e=(m||ocMine())[code];if(!e)return {s:'todo'};if(!rec)return {s:'start'};
  const b=e.b>rec[0],w=e.w<rec[3];return {s:b&&w?'done':'start',b,w};}
// tile/card colors: club color as background; near-white first color swaps with the second
function ocPal(code){const c=CLUB_COLORS[code];if(!c||!c[0])return '';let bg=c[0],fg=c[1]||'#ffffff';
  if(relLum(bg)>.8&&c[1]){bg=c[1];fg=c[0];}
  if(contrast(bg,fg)<4.5)fg=contrast('#ffffff',bg)>=contrast('#111111',bg)?'#ffffff':'#111111';
  return `background:${bg};color:${fg}`;}
const ocSeasons=n=>`${n} ${plUk(n,'сезон','сезони','сезонів')}`;
// record from a season of other length or with 2 points per win (1992/93, 1993/94) gets a footnote
const ocOdd=(y,g)=>g!==30||y<=1993;
function ocTile(k,m){const st=ocState(k.c,m),rec=CLUB_REC[k.c];
  const right=st.s==='done'?'<span class="ocdone">✓ Пройдено</span>':(st.b||st.w)?`<span class="ocbd">${st.b?'<i title="Кращий сезон в історії клубу">🏅</i>':''}${st.w?'<i title="Гірший сезон в історії клубу">🪦</i>':''}</span>`:'';
  return `<button type="button" class="oct${st.s==='done'?' cmp':''}${right?' bdg':''}" data-c="${esc(k.c)}" data-s="${st.s}" style="${ocPal(k.c)}">${right}<small>${rec?ocSeasons(k.k):'новачок'}</small><b>${esc(k.n)}</b></button>`;}
function ocFilter(){const g=document.getElementById('ocGrid');if(!g)return;
  for(const t of g.children)t.hidden=OC_FILTER!=='all'&&t.dataset.s!==OC_FILTER;
  for(const b of document.querySelectorAll('#ocSeg button')){const on=b.dataset.f===OC_FILTER;b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on));}}
function renderOc(){const el=document.getElementById('oc');const m=ocMine(),list=ocClubs();
  let r=0,w=0,d=0;for(const k of list){const st=ocState(k.c,m);if(st.b)r++;if(st.w)w++;if(st.s==='done')d++;}
  const n=list.filter(k=>CLUB_REC[k.c]).length;
  el.innerHTML=`<h1>Один клуб</h1><p class="lead">Обери клуб і збери XI лише з тих, хто за нього грав в УПЛ.</p>
<details><summary>Як це працює</summary><p>Колесо дає тільки сезони обраного клубу, гравців береш лише з них. Сезон — 30 турів.</p><p>У кожного клубу свої рекорди в УПЛ: найкращий і найгірший сезон за очками. Побий обидва — і клуб пройдено. Новачки рекордів ще не мають.</p></details>
<details><summary>Трофеї режиму</summary><ul><li>🏅 <b>Кращий сезон в історії клубу</b> — набери більше очок, ніж клуб будь-коли в УПЛ.</li><li>🪦 <b>Гірший сезон в історії клубу</b> — набери менше очок, ніж у найгіршому сезоні клубу.</li><li>✓ <b>Пройдено</b> — обидва рекорди клубу побиті.</li></ul></details>
<div class="occ" id="ocCnt"><span>🏅 ${r}/${n} ${plUk(n,'рекорд','рекорди','рекордів')}</span><span>🪦 ${w}/${n} найгірших</span><span class="${d?'ok':''}">✓ ${d} ${plUk(d,'клуб','клуби','клубів')} пройдено</span></div>
<div class="seg ocf" id="ocSeg" role="radiogroup" aria-label="Фільтр клубів">${OC_FILTERS.map(([f,t])=>`<button type="button" role="radio" data-f="${f}">${t}</button>`).join('')}</div>
<div class="ocg" id="ocGrid">${list.map(k=>ocTile(k,m)).join('')}</div>`;
  for(const b of el.querySelectorAll('#ocSeg button'))b.onclick=()=>{OC_FILTER=b.dataset.f;ocFilter();};
  for(const t of el.querySelectorAll('.oct'))t.onclick=()=>ocPick(t.dataset.c);
  ocFilter();}
function openOc(){renderOc();go(8);}
function ocPick(code){S.club=code;lsSet('upl30_club',code);setFmt('oneclub');go(4);}
// club card on the setup screen
function renderOcCard(){const el=document.getElementById('ocCard');const k=ocClubs().find(x=>x.c===S.club);
  if(!k){el.innerHTML='';return;}
  const rec=CLUB_REC[k.c],e=ocMine()[k.c],st=ocState(k.c);
  const ys=DATA.clubs.filter(x=>x.c===k.c).map(x=>x.y),y0=Math.min(...ys),y1=Math.max(...ys);
  let h=`<small>Один клуб</small><h2>${esc(k.n)}</h2><p>${ocSeasons(k.k)} в УПЛ · ${y0===y1?seasonLabel(y0):y0+'–'+(y1+1)}</p>`;
  if(rec){const star=(y,g)=>ocOdd(y,g)?'*':'';
    h+=`<div class="pills"><span>🏅 Рекорд ${rec[0]}${star(rec[1],rec[2])} оч. · ${seasonLabel(rec[1])}</span><span>🪦 Найгірший ${rec[3]}${star(rec[4],rec[5])} оч. · ${seasonLabel(rec[4])}</span></div>`;
    const odd=[[rec[1],rec[2]],[rec[4],rec[5]]].filter(([y,g],i,a)=>ocOdd(y,g)&&(i===0||y!==a[0][0]));
    if(odd.length)h+=`<p class="ft">* ${odd.map(([y,g])=>seasonLabel(y)+' — '+[g!==30?`${g} ${plUk(g,'тур','тури','турів')}`:'',y<=1993?'2 очки за перемогу':''].filter(Boolean).join(', ')).join('; ')}. Ти граєш 30 турів.</p>`;}
  else h+=`<p class="ft">Новачок УПЛ: рекордів клубу ще немає — встанови свої.</p>`;
  h+=`<hr><small>Твій рекорд</small>`+(e?`<div class="pills"><span class="lt">Найкращий ${e.b}</span><span class="lt">Найгірший ${e.w}</span><span class="lt">${ocSeasons(e.n)}</span></div>`:'<p class="ft">Ще не грав за цей клуб.</p>');
  if(rec)h+=`<p class="ft">${st.s==='done'?'✓ Клуб пройдено: обидва рекорди твої.':st.b?`Рекорд клубу вже твій 🏅 · залишився найгірший: менше ${rec[3]} оч.`:st.w?`Найгірший сезон уже твій 🪦 · залишився рекорд: більше ${rec[0]} оч.`:`Набери більше ${rec[0]} або менше ${rec[3]} очок.`}</p>`;
  h+=`<button type="button" class="link0" id="ocChange">Змінити клуб</button>`;
  el.innerHTML=h;el.setAttribute('style',ocPal(k.c));
  document.getElementById('ocChange').onclick=openOc;}
// after a One club season: update player records, return what changed for the summary
function ocAfter(code,pts){const m=ocMine(),before=ocState(code,m),e=m[code];
  m[code]=e?{b:Math.max(e.b,pts),w:Math.min(e.w,pts),n:e.n+1}:{b:pts,w:pts,n:1};lsSet('upl30_clubrec',m);
  return {code,pts,before,after:ocState(code,m)};}
function renderOcRes(r){const el=document.getElementById('ocRes');const o=r&&r.oc;if(!o){el.hidden=true;return;}
  const rec=CLUB_REC[o.code],k=ocClubs().find(x=>x.c===o.code)||{n:''},a=o.after,me=ocMine()[o.code]||{b:o.pts,w:o.pts};
  let h;
  if(!rec)h=`<p class="ocnote">${esc(k.n)}: твій рекорд — ${me.b}, найгірший — ${me.w}.</p>`;
  else{const best=o.pts>rec[0],worst=o.pts<rec[3];
    if(!best&&!worst)h=`<p class="ocnote">${esc(k.n)}: рекорд клубу — ${rec[0]} оч. (${seasonLabel(rec[1])}), найгірший — ${rec[3]} (${seasonLabel(rec[4])}).</p>`;
    else{const left=a.s==='done'?(o.before.s!=='done'?'✓ Клуб пройдено: обидва рекорди побиті!':'Клуб уже пройдено.'):a.b?`Залишився найгірший сезон: менше ${rec[3]} оч.`:`Залишився рекорд: більше ${rec[0]} оч.`;
      h=`<div class="ocr"><div class="big" aria-hidden="true">${best?'🏅':'🪦'}</div><small>${esc(k.n)}</small><h3>${best?'Кращий сезон в історії клубу!':'Гірший сезон в історії клубу!'}</h3>`
       +`<p><b>${o.pts} ${ptsWord(o.pts)}</b> — ${best?'більше':'менше'}, ніж клуб набирав будь-коли в УПЛ (${best?rec[0]:rec[3]}, ${seasonLabel(best?rec[1]:rec[4])}).</p><p class="ft">${left}</p></div>`;}}
  el.innerHTML=h;el.hidden=false;}
