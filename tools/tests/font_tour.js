// 0.69.1 (власник: «прогнати зі всіма сторінками, заголовками, підзаголовками — щоб потім не було сюрпризів»): шрифт KyivType Sans.
// Обхід екранів на 320, 390 і 1000 px: шрифт справді завантажився (не системний), сторінка не прокручується вбік, нічого не вилазить за екран,
// заголовки, кнопки й підписи не обрізані. Знімок кожного екрана — tools/tests/out/font_<ширина>_<n>.png (дивитися очима).
// Запуск з кореня: node tools/tests/font_tour.js
const path=require('path');const {openSite,makeDB,checker,draftSeason,launch}=require('./_site.js');
const OUT=path.join(__dirname,'out');
const CHECK=()=>{const W=innerWidth,bad=[];const vis=el=>!el.closest('[hidden]')&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
  const clipAnc=el=>{for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){if(getComputedStyle(p).overflowX!=='visible')return true;}return false;};
  const name=el=>(el.id?'#'+el.id:el.tagName.toLowerCase()+(el.className&&typeof el.className==='string'?'.'+el.className.split(' ')[0]:''))+' «'+(el.innerText||'').trim().slice(0,24)+'»';
  for(const el of document.querySelectorAll('body *')){if(!vis(el))continue;const r=el.getBoundingClientRect();if(r.width&&r.right>W+1&&!clipAnc(el))bad.push('за краєм: '+name(el));}
  // заголовки, кнопки, підписи: текст ширший за свою коробку й обрізаний (імена гравців з «…» — навмисно, їх пропускаємо)
  for(const el of document.querySelectorAll('h1,h2,h3,summary,button,.kicker,.ttl,.lbl,.sec0,label,.chip,.lv,.tile0 b,.row0 b,.opt b,.opt small')){
    if(!vis(el)||el.closest('.nmt,.nm,.tbl'))continue;const cs=getComputedStyle(el);
    if(el.scrollWidth>el.clientWidth+1&&(cs.overflow!=='visible'||cs.textOverflow==='ellipsis'))bad.push('обрізано: '+name(el));}
  // шрифт: усі видимі тексти — KyivType Sans і він завантажений
  const fams=new Set();for(const el of document.querySelectorAll('body *')){if(vis(el)&&el.childNodes.length&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))fams.add(getComputedStyle(el).fontFamily.split(',')[0].replace(/"/g,'').trim());}
  const loaded=['400','500','700','900'].every(w=>document.fonts.check(`${w} 20px "KyivType Sans"`));
  return {sw:document.documentElement.scrollWidth,W,bad:[...new Set(bad)].slice(0,6),fams:[...fams],loaded};};
(async()=>{const T=checker('font_tour');const b=await launch();
 const rpc={fl_mine:()=>[],player_hello:()=>({id:'p1',name:'andrii',anon_name:'silent_owl',public_id:'abcdefgh'}),trophy_stats:()=>({players:2,t:{}})};
 for(const w of [320,390,1000]){
  const {pg,errs}=await openSite({b,db:makeDB({},rpc),signed:true,viewport:{width:w,height:w>900?1300:800},wait:1500});let n=0;
  const chk=async name=>{await pg.waitForTimeout(350);await pg.screenshot({path:`${OUT}/font_${w}_${++n}.png`,fullPage:true});const o=await pg.evaluate(CHECK);
    const other=o.fams.filter(f=>!/KyivType Sans|Apple Color Emoji|Segoe UI Emoji|Noto Color Emoji/.test(f));
    T.check(o.loaded&&o.sw<=o.W+1&&!o.bad.length&&!other.length,`${w}px · ${name}`+(o.loaded?'':' — шрифт НЕ завантажено')+(o.sw>o.W+1?` — сторінка ширша за екран ${o.sw}>${o.W}`:'')+(o.bad.length?' — '+o.bad.join('; '):'')+(other.length?' — інші шрифти: '+other.join(', '):''));};
  const safe=async(fn)=>{try{await fn();}catch(e){T.check(false,`${w}px: крок не вдався — ${String(e.message).split('\n')[0]}`);}};
  await chk('головна');
  T.check(await pg.evaluate(()=>{const b=document.getElementById('fbBtn'),r=b.getBoundingClientRect();return !b.hidden&&r.width>=36&&r.right<=innerWidth;}),`${w}px · шапка: кнопка «Відгук» на місці`);   // 0.69.5
  await pg.evaluate(()=>document.querySelectorAll('#s1 details').forEach(d=>d.open=true));await chk('головна: усі «Питання та відповіді» й «Про гру» розгорнуто');
  // 0.69.69 (власник): «Про гру та дані» завжди відкрито, без плиток-дублів; шрифт і іконки — у підвалі
  T.check(await pg.evaluate(()=>{const a=document.getElementById('aboutBox'),c=document.querySelector('.foot.cred');return a.tagName!=='DETAILS'&&!a.querySelector('.facts')&&a.offsetHeight>100&&!!c&&/KyivType/.test(c.textContent)&&c.getBoundingClientRect().right<=innerWidth+1;}),`${w}px · «Про гру та дані» відкрито, без плиток; подяки — у підвалі`);
  await safe(async()=>{await pg.click('#newsBtn');await chk('«Що нового»');await pg.click('#viewClose');});
  await safe(async()=>{await pg.click('#boardOpen');await chk('загальна таблиця');await pg.click('#viewClose');});
  await safe(async()=>{await pg.click('#trBtn');await chk('трофеї');await pg.click('#homeBtn');});
  await safe(async()=>{await pg.click('#acctBtn');await chk('своя сторінка й «Налаштування»');await pg.click('#ppRowName');await chk('вікно «Ім\'я»');await pg.keyboard.press('Escape');await pg.click('#homeBtn').catch(()=>{});});
  await safe(async()=>{await pg.click('#flOpen');await chk('«Грати з друзями»');await pg.click('#flNew');await chk('нова ліга 11×11');await pg.click('[data-k="fmt"][data-v="f5"]');await chk('нова ліга 5×5');await pg.click('#homeBtn');});
  await safe(async()=>{await pg.click('#freeOpen');await chk('вільна гра: режими');await pg.click('#startBtn');await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});await pg.waitForTimeout(900);await chk('драфт: колесо, перекрутки, список');
    await pg.click('#homeBtn');});
  await safe(async()=>{await pg.click('#freeOpen');await pg.click('#startBtn');await draftSeason(pg);await pg.waitForTimeout(1800);await chk('підсумки сезону');});
  T.check(!errs.length,`${w}px: помилок JS немає`+(errs.length?' — '+errs.slice(0,2).join('; '):''));
  await pg.context().close();}
 await b.close();process.exit(T.done());})();
