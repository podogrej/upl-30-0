// On the main screens every icon/emoji inline with text is vertically centered on that text (±3 px).
// Run from repo root: node tools/tests/icon_align.js
const {openSite,makeDB,checker,draftSeason,launch}=require('./_site.js');
const ALIGN=()=>{const bad=[];const vis=e=>!e.closest('[hidden]')&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  for(const ic of document.querySelectorAll('.ic,.ico')){if(!vis(ic)||ic.parentElement.closest('.ic'))continue;
    const r=ic.getBoundingClientRect();if(!r.height)continue;const par=ic.parentElement;
    // nearest text on the same line: a sibling text node or the text of an adjacent inline element
    let tn=null;for(const n of par.childNodes){if(n!==ic&&n.nodeType===3&&n.textContent.trim()){tn=n;break;}}
    if(!tn){for(const s of [ic.nextElementSibling,ic.previousElementSibling])if(s&&vis(s)&&getComputedStyle(s).display.startsWith('inline')&&s.textContent.trim()){const w=document.createTreeWalker(s,NodeFilter.SHOW_TEXT);let x;while((x=w.nextNode()))if(x.textContent.trim()){tn=x;break;}if(tn)break;}}
    if(!tn)continue;const rg=document.createRange();rg.selectNodeContents(tn);const lines=[...rg.getClientRects()];
    const ln=lines.find(l=>l.bottom>r.top&&l.top<r.bottom);if(!ln)continue;
    const fs=parseFloat(getComputedStyle(tn.parentElement).fontSize);const textMid=ln.top+ln.height/2,icMid=r.top+r.height/2;
    if(Math.abs(textMid-icMid)>Math.max(3,fs*0.2))bad.push(`«${(par.innerText||'').trim().slice(0,30)}» зсув ${Math.round(icMid-textMid)}px`);}
  return [...new Set(bad)].slice(0,8);};
(async()=>{const T=checker('icon_align');const b=await launch();
 const init=`localStorage.setItem('upl30_tr',JSON.stringify({t:{champ:{n:1,at:'2026-10-01'},first:{n:2,at:'2026-10-01'},rebsh:{n:1,at:'2026-10-02'}},seasons:12}));`;
 for(const w of [390,1000]){const {pg,errs}=await openSite({b,db:makeDB({}),init,viewport:{width:w,height:900},wait:1500});
  const chk=async n=>{await pg.waitForTimeout(300);const bad=await pg.evaluate(ALIGN);T.check(!bad.length,`${w}px · ${n}: іконки на одній лінії з текстом`+(bad.length?' — '+bad.join('; '):''));};
  await chk('головна');
  await pg.evaluate(()=>document.querySelectorAll('#s1 details').forEach(d=>d.open=true));await chk('головна, FAQ розгорнуто');
  await pg.click('#acctBtn');await pg.waitForTimeout(400);await pg.click('#ppCabAll').catch(()=>{});await chk('своя сторінка, усі трофеї');
  await pg.click('#homeBtn');await pg.click('#freeOpen');await pg.click('#startBtn');await draftSeason(pg);await pg.waitForTimeout(1500);
  await pg.evaluate(()=>{const el=document.getElementById('verLine');el.hidden=false;el.innerHTML=window.__dbg.ic('check-decagram','sm')+'Результат перевірено сервером';});   // same as saveSeason after verification
  if(w===390)await (await pg.$('#verLine')).screenshot({path:require('path').join(__dirname,'out','verline.png')});
  await chk('підсумки сезону');
  T.check(!errs.length,`${w}px: помилок JS немає`);await pg.context().close();}
 await b.close();process.exit(T.done());})();
