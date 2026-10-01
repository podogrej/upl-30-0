// 0.62 «Чистий дизайн» — правки DOM для макета (поверх справжньої гри). Викликається перед кожним знімком; повторний виклик нічого не дублює.
(()=>{const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const once=(el,k)=>{if(!el||el.dataset['c'+k])return false;el.dataset['c'+k]=1;return true;};
const vis=id=>{const e=document.getElementById(id);return e&&!e.hidden;};
const el=(tag,cls,html)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e;};

// ---- шапка: аватарка + ім'я
{const b=$('#acctBtn');if(b&&!b.hidden&&once(b,'me')){b.classList.add('me');b.append(el('span','', 'andré'));}}

// ---- головна
if(vis('s1')){
  if(once($('.lead0'),'t'))$('.lead0').innerHTML='Збери XI з історії УПЛ і пройди сезон <span style="white-space:nowrap">30-0</span>.';
  // драфт дня: фішки → один рядок; одна головна кнопка + «Таблиця дня» поруч
  const d=$('#dailyCard');if(once(d,'d')){
    $('#dTitle').textContent='Одне колесо для всіх';
    const meta=[...$('#dMeta').children].map(c=>c.textContent.replace(/^Схема |^Суперники: /,'')).join(' · ');
    $('#dMeta').after(el('div','dmeta',meta));$('#dailyBtn').lastChild.textContent='Грати';
    const lb=$('#lbOpenBtn');lb.hidden=false;}
  // секції: «Сьогодні» лишається, решта — одним списком «Режими» без підписів
  if(once($('#s1'),'rows')){
    const secs=$$('#s1 .sec0');secs.forEach((s,i)=>{if(i===1)s.textContent='Режими';else if(i>1)s.remove();});
    $('#pickOpen b').append(el('span','tag0','новий'));
    // блок «про проєкт» з великим лічильником (як у 38-0)
    const st=el('div','stat0',`<div class="n">1 873</div><div class="l">сезонів зіграно</div><div class="s"><span><b>24</b>гравці</span><span><b>4 547</b>футболістів</span><span><b>з 1992</b>34 сезони</span></div>`);
    $('#facts0').after(st);
    $('#s1 > h2:not(#howH)').textContent='Питання';
    // «Як грати» — першим питанням, коротко
    const how=el('details','faqx','<summary>Як грати?</summary><p>Обери схему, крути колесо й бери по одному гравцю на вільну позицію. Зібрав 11 — дивись рейтинги й грай 30 турів.</p>');
    $('.faq0').prepend(how);
    $('#howGo').textContent='Як грати?';}
}

// ---- вільна гра: налаштування
if(vis('s4')&&once($('#s4'),'set')){
  // назва команди — згорнуто
  const tn=$('#teamName').closest('.row');const h=tn.previousElementSibling;const det=el('details','team0','<summary>Назва команди (необов\'язково)</summary>');
  h.before(det);det.append(tn);h.remove();
  $('#startBtn').textContent='Почати драфт';
}

// ---- драфт
if(vis('s2')){
  const s2=$('#s2');
  if(once(s2,'top')){
    const n=$$('#pitch .slot.filled').length;
    s2.querySelector(':scope>.row').classList.add('hide0');s2.prepend(el('div','dtop',`<div class="l1"><b>Драфт · ${n} з 11</b><span>Класика · Звичайний · <u>Спочатку</u></span></div><div class="bar"><i style="width:${Math.round(n/11*100)}%"></i></div>`));
  }
  const w=$('#wheel');
  if(w&&!w.hidden&&once(w,'w')){
    const why=(($('#wHint').textContent.match(/^(\d+)/)||[])[1]);
    const club=$('#wClub')?.textContent||$('#reelClub .club').textContent,yr=$('#reelYear .season').textContent;
    $('.reels').after(el('div','why0',`Місце клубу в тому сезоні: ${why}`));
    const left=($('#rerollCnt').textContent.match(/\d+/)||['0'])[0];
    $('.why0').after(el('div','rr0',`<span class="lbl">Перекрутити: <b>${left}</b></span><span class="seg"><button>Клуб</button><button>Сезон</button><button>Усе</button></span>`));
    {const sp=$$('#sqHead span');const ab={'Матчі':'М','Голи':'Г','Асисти':'П','Ас.':'П','Сухарі':'С','Сух.':'С'};sp.forEach(x=>{const k=x.textContent.trim();for(const a in ab)if(k===a||k.startsWith(a)){x.textContent=ab[a];break;}});}
    const free=$$('#squad .pl:not([disabled])').length;
    $('#sqHead').before(el('div','lh0',`<span>Гравці · ${free}</span><span class="sw">Рейтинги <i></i></span>`));
    // недоступні — згорнуто
    const sq=$('#squad');const sep=[...sq.children].find(c=>c.classList.contains('muted'));
    if(sep){const off=$$('#squad .pl[disabled]');off.forEach(p=>p.classList.add('hide0'));sep.className='more0';sep.textContent=`Ще ${off.length} не підходять під вільні позиції ▾`;}
  }
}

// ---- підсумки
if(vis('s3')&&vis('final')&&once($('#final'),'res')){
  const nums=$$('#recTiles .tile b').map(b=>b.textContent),sums=$$('#sumTiles .tile b').map(b=>b.textContent);
  $('#seasonLine').textContent=`${$('#seasonLine').textContent.split(':')[0]} · голи ${sums[2]||''}`;
  $('#seasonLine').after(el('div','score0',`<div><b>${nums[0]}-${nums[1]}-${nums[2]}</b><span>В-Н-П</span></div><div><b>${sums[0]}</b><span>очок</span></div><div><b>${sums[1]}</b><span>місце</span></div>`));
  const tro=$$('#newTro .tro b').map(b=>b.textContent);
  if(tro.length)$('#newTro').after(el('div','tro0',tro.map(t=>`<span>🏆 ${t}</span>`).join('')));
  $('#replayBtn').hidden=true;$('#againBtn').style.flex='1';
  // «Поділитися» — один рядок без головної кнопки (головна на екрані — «Новий драфт»)
  const sb=$('#shareBox');$('#tgShareBtn').className='ghost';$('#tgShareBtn').style.flex='2';
  const row=el('div','share0');row.append($('#tgShareBtn'),$('#copyBtn'),$('#chalOpen'));$('.shtiles').replaceWith(row);
  $('#chalOpen').hidden=false;$('#tgShareBtn').lastChild.textContent='Картка';$$('.share0 button').forEach(b=>{b.className='ghost';b.style.flex='1';});
  // матчі: смужка з 30 результатів, список — згорнуто
  const ms=$('#matches');const res=$$('#matches .m .res').map(r=>r.className.match(/\b(w|d|l)\b/i)?.[1]||r.textContent);
  const strip=el('div','strip0',$$('#matches .m .res').map(r=>`<i style="background:${getComputedStyle(r).backgroundColor}"></i>`).join(''));
  strip.style.cssText='display:grid;grid-template-columns:repeat(15,1fr);gap:3px;margin:4px 0 6px';strip.querySelectorAll('i').forEach(i=>i.style.cssText+=';height:14px;border-radius:3px;display:block');
  const det=el('details','mt0','<summary>Усі 30 матчів</summary>');ms.before(strip);strip.after(det);det.append(ms);
  $('#scorers').style.fontSize='14px';
}

// ---- сторінка гравця
if(vis('s6')&&once($('#pp'),'pp')){
  const t=$$('.pp-tiles .tile b').map(b=>b.textContent);
  const big=el('div','pp-big3',`<div><b>${t[0]}</b><span>сезонів</span></div><div><b>${t[1]}</b><span>чемпіонств</span></div><div><b>${t[2]}</b><span>рекорд, очок</span></div>`);
  const small=el('p','muted',`${t[4]} перемог у матчах · сезонів 30-0: ${t[3]} · серія драфту дня ${t[5]}`);small.style.cssText='font-size:13px;text-align:center;margin:0';
  $('.pp-tiles').replaceWith(big);big.after(small);
  // трофеї: лише відкриті + «Усі 113»
  const cab=$('#ppCab');if(cab){$$('#ppCab .pp-filt, #ppCab .seg, #ppCab .tro:not(.on), #ppCab .pp-chips').forEach(e=>e.classList.add('hide0'));
    $$('#ppCab button').forEach(b=>{if(/Показати всі|Поділитися шафою/.test(b.textContent))b.classList.add('hide0');});
    $$('#ppCab *').forEach(e=>{if(/секретних трофеїв/.test(e.textContent)&&e.children.length<=2&&e!==cab)e.classList.add('hide0');});
    $$('#ppCab .chip').forEach(c=>c.classList.add('hide0'));
    cab.append(el('div','more0','Усі трофеї · 113 ▾'));}
  $$('#pp button').forEach(b=>{if(/Зіграти новий сезон/.test(b.textContent))b.classList.add('hide0');});
  // налаштування — згорнуто
  const acc=$('.pp-acct');if(acc){const h=acc.previousElementSibling;const det=el('details','mt0','<summary>Налаштування: ім\'я, пошта, вихід</summary>');h.replaceWith(det);det.append(acc);}
}
})();
