// On the main phone and iPad screens no emoji overflows its box or overlaps adjacent text.
// Run from repo root: node tools/tests/emoji_layout.js
const {launch,ROOT}=require('./_page.js');const path=require('path');const {checker}=require('./_site.js');
const CHECK=()=>{const bad=[];
  for(const el of document.querySelectorAll('.ic.em,.ico.em,.tre')){
    const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;
    const t=[...el.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());if(!t)continue;
    const rg=document.createRange();rg.selectNodeContents(t);const g=rg.getBoundingClientRect();
    const where=(el.parentElement&&el.parentElement.textContent||'').trim().replace(/\s+/g,' ').slice(0,40);
    if(g.right>r.right+1||g.left<r.left-1)bad.push(`емодзі ширше за рамку: «${where}»`);
    let n=el.nextSibling;while(n&&n.nodeType===3&&!n.textContent.trim())n=n.nextSibling;
    if(n){const rr=document.createRange();n.nodeType===3?rr.selectNodeContents(n):rr.selectNode(n);const nr=[...rr.getClientRects()].find(x=>x.width>0);
      if(nr&&nr.top<g.bottom-2&&nr.bottom>g.top+2&&nr.left<g.right-0.5)bad.push(`емодзі налазить на текст: «${where}»`);}
  }
  return bad;};
async function pickOne(pg){await pg.click('#spinBtn');await pg.waitForSelector('#seaPick:not([hidden]) button, #squad .pl:not([disabled])',{timeout:8000});const sp=await pg.$$('#seaPick:not([hidden]) button');if(sp.length)await sp[0].click();await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});await (await pg.$('#squad .pl:not([disabled])')).click();await (await pg.waitForSelector('#squad .plpos button')).click();await pg.waitForTimeout(40);}
(async()=>{const T=checker('emoji_layout');const b=await launch();
  for(const [tag,w,h] of [['телефон',390,844],['iPad',820,1180]]){
    const ctx=await b.newContext({viewport:{width:w,height:h},reducedMotion:'reduce'});
    await ctx.addInitScript(()=>{window.__champTest=true;try{const d=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv'}).format(new Date());localStorage.setItem('upl30_streak',JSON.stringify({last:d,count:4,best:4}));}catch(e){}});
    await ctx.route(u=>!(u.href.startsWith('file:')||/fonts\.(googleapis|gstatic)\.com/.test(u.host)),r=>r.abort());
    const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
    const scan=async name=>{await pg.waitForTimeout(300);const bad=await pg.evaluate(CHECK);T.check(!bad.length,`${tag} · ${name}: емодзі на місці`+(bad.length?' — '+bad.slice(0,4).join('; '):''));};
    await pg.goto('file://'+path.join(ROOT,'index.html'));await pg.waitForTimeout(800);
    T.check(await pg.evaluate(()=>!!document.querySelector('#dMeta .hot0')),`${tag} · головна: є «серія» з вогником`);
    await scan('головна');
    await pg.click('#freeOpen');await scan('режими');
    await pg.click('#startBtn');for(let i=0;i<3;i++)await pickOne(pg);await scan('драфт');
    await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])');await (await pg.$('#squad .pl:not([disabled])')).click();await scan('вибір гравця');
    await (await pg.$('#squad .plpos button')).click();for(let i=0;i<7;i++)await pickOne(pg);
    await pg.waitForSelector('#simBtn:not([hidden])');await scan('перед сезоном');
    await pg.click('#simBtn');await pg.waitForSelector('#live:not([hidden])');await pg.click('#skipBtn');await pg.waitForTimeout(1500);
    await pg.evaluate(()=>{const m=document.querySelector('.champ0');if(m)m.remove();});await scan('підсумки');
    await pg.evaluate(()=>window.__dbg.champModal({W:22,D:5,L:3,pts:71,place:1,log:Array(30).fill(0)}));await pg.waitForTimeout(800);await scan('вікно чемпіона');
    await pg.evaluate(()=>{const m=document.querySelector('.champ0');if(m)m.remove();document.getElementById('homeBtn').click();});await pg.waitForTimeout(200);
    await pg.click('#trBtn');await scan('трофеї');
    await pg.keyboard.press('Escape');await pg.evaluate(()=>{const v=document.getElementById('viewBox');if(v)v.hidden=true;document.getElementById('homeBtn').click();});await pg.waitForTimeout(200);
    await pg.click('#flOpen');await scan('ліги з друзями');
    // all children of the friends-league hero must be horizontally centered
    const off=await pg.evaluate(()=>[...document.querySelectorAll('.fl-hero>*')].filter(e=>e.getBoundingClientRect().width).map(e=>{const r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return [e.tagName+' '+e.textContent.trim().slice(0,20),Math.abs((r.left+r.right)/2-(p.left+p.right)/2)];}).filter(x=>x[1]>2));
    T.check(!off.length,`${tag} · ліги з друзями: заголовок, текст і кнопка по центру`+(off.length?' — '+off.map(x=>x[0]+' зсув '+Math.round(x[1])+'px').join('; '):''));
    T.check(!errs.length,`${tag}: помилок на сторінці немає`,errs.join('; '));
    await ctx.close();}
  await b.close();process.exit(T.done());})();
