// FAQ accordion: height + fade animation without layout jumps, interruptible, instant under reduced motion; home footer links and disclaimer.
// Run from repo root: node tools/tests/faq_anim.js [screenshot dir]
const path=require('path'),fs=require('fs');const {ROOT,makeDB,openSite,checker}=require('./_site.js');
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
// sample the element height every frame for `ms`
const sample=(pg,sel,ms)=>pg.evaluate(([sel,ms])=>new Promise(res=>{const d=document.querySelector(sel),o=[],t0=performance.now();
  (function f(){o.push(Math.round(d.getBoundingClientRect().height*10)/10);if(performance.now()-t0<ms)requestAnimationFrame(f);else res(o);})();}),[sel,ms]);
const smooth=h=>h.every((v,i)=>i===0||Math.abs(v-h[i-1])<=Math.max(60,Math.abs(h[h.length-1]-h[0])*0.6));   // no single-frame jump of the whole distance
(async()=>{const T=checker('FAQ');
 for(const reduce of [false,true]){
  const {b,ctx,pg,errs}=await openSite({db:makeDB({}),fastMotion:false,viewport:{width:390,height:844},wait:1200});
  if(reduce)await pg.emulateMedia({reducedMotion:'reduce'});
  const tag=reduce?' (reduced motion)':'';
  const open=()=>pg.evaluate(()=>document.getElementById('faqBox').open);
  await pg.evaluate(()=>document.getElementById('faqBox').scrollIntoView());
  const h0=await pg.evaluate(()=>document.getElementById('faqBox').getBoundingClientRect().height);
  await pg.click('#faqBox>summary');const hs=await sample(pg,'#faqBox',700);
  T.check(await open(),'відкрилось'+tag);const h1=hs[hs.length-1];
  T.check(h1>h0+50,`висота ${h0} → ${h1}`+tag);
  if(!reduce){T.check(hs.length>8&&smooth(hs)&&hs.some(v=>v>h0+1&&v<h1-1),`анімація плавна: ${hs.length} кадрів`);
    T.check(await pg.evaluate(()=>getComputedStyle(document.querySelector('#faqBox>summary'),'::after').transform!=='none'),'шеврон є');}
  else T.check(hs.filter(v=>v>h0+1&&v<h1-1).length<=1,'без анімації: стрибок одразу'+tag);
  await pg.screenshot({path:path.join(OUT,`faq_open${reduce?'_reduced':''}.png`)});
  // inner item
  await pg.click('#howQ>summary');await pg.waitForTimeout(500);
  T.check(await pg.evaluate(()=>document.getElementById('howQ').open),'пункт відкрито'+tag);
  const chev=await pg.evaluate(()=>getComputedStyle(document.querySelector('#faqBox>summary'),'::after').transform);
  T.check(chev&&chev!=='none','шеврон повернуто/є: '+chev.slice(0,30));
  // interrupt: close the item, tap again mid-way -> opens again, no stray overflow/height left
  await pg.click('#howQ>summary');await pg.waitForTimeout(80);await pg.click('#howQ>summary');await pg.waitForTimeout(600);
  const st=await pg.evaluate(()=>{const d=document.getElementById('howQ');return {open:d.open,h:d.style.height,ov:d.style.overflow};});
  T.check(st.open&&!st.h&&!st.ov,`переривання: пункт відкритий, без залишкових стилів ${JSON.stringify(st)}`);
  await pg.click('#howQ>summary');await pg.waitForTimeout(500);T.check(!(await pg.evaluate(()=>document.getElementById('howQ').open)),'пункт закрито'+tag);
  await pg.click('#faqBox>summary');const hc=await sample(pg,'#faqBox',600);
  T.check(!(await open()),'закрито'+tag);T.check(Math.abs(hc[hc.length-1]-h0)<1.5,`висота після закриття ${hc[hc.length-1]} = ${h0}`+tag);
  if(!reduce)T.check(smooth(hc),'закриття плавне');
  T.check(await pg.evaluate(()=>!document.getElementById('faqBox').style.overflow&&!document.getElementById('faqBox').style.height),'залишкових стилів немає'+tag);
  if(!reduce){
   // footer: three links, disclaimer centered and tight
   await pg.evaluate(()=>document.querySelector('.ft').scrollIntoView());
   const f=await pg.evaluate(()=>{const l=document.querySelector('.ft-legal'),r=l.getBoundingClientRect(),cs=getComputedStyle(l);return {links:[...document.querySelectorAll('.ft-small a')].map(a=>a.getAttribute('href')),txt:l.textContent.length,lh:parseFloat(cs.lineHeight)/parseFloat(cs.fontSize),raw:cs.lineHeight+"/"+cs.fontSize,ta:cs.textAlign,w:r.width,vw:innerWidth,after:!!document.querySelector('.ft-copy+.ft-legal')};});
   T.check(f.links.includes('privacy.html')&&f.links.includes('terms.html'),'у підвалі: Конфіденційність і Умови використання');
   T.check(f.after&&f.txt>300&&f.lh<1.36&&f.ta==='center'&&f.w<=f.vw,`застереження під копірайтом, щільне (${f.lh.toFixed(2)} ${f.raw})`);
   await pg.screenshot({path:path.join(OUT,'faq_footer.png')});
  }
  T.check(!errs.length,'помилок на сторінці немає '+errs.join(' | '));await b.close();}
 // static pages link each other
 const priv=fs.readFileSync(path.join(ROOT,'privacy.html'),'utf8'),terms=fs.readFileSync(path.join(ROOT,'terms.html'),'utf8');
 T.check(priv.includes('href="terms.html"')&&terms.includes('href="privacy.html"')&&/<html lang="uk">/.test(terms)&&!/\b0\.\d{2}\b/.test(terms),'privacy.html і terms.html посилаються одна на одну');
 process.exit(T.done());})();
