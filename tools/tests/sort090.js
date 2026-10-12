// Squad list order while drafting (renderWheel): rating desc (p[2]) when ratings are shown (toggle on or practice),
// otherwise matches/goals desc (p[3], p[4]); anti-season stays alphabetical. Checked per mode and format, toggle off/on,
// and that flipping the switch re-renders the list in the new order. Run from repo root: node tools/tests/sort090.js
const {openPage,pickFmt}=require('./_page.js');const {checker}=require('./_site.js');
// per case: format, mode, wheel club filter, whether the switch is visible, expected sort with the switch off / on
const CASES=[
  {n:'звичайний',fmt:'classic',mode:'normal',sw:true,off:'apps',on:'rating'},
  {n:'складний',fmt:'classic',mode:'hard',sw:true,off:'apps',on:'rating'},
  {n:'хардкор',fmt:'classic',mode:'hardcore',sw:false,off:'apps',on:'apps'},
  {n:'тренування',fmt:'classic',mode:'practice',sw:false,off:'rating',on:'rating'},
  {n:'вибір сезону',fmt:'classic',mode:'pick',sw:true,off:'apps',on:'rating'},
  {n:'один клуб',fmt:'oneclub',mode:'normal',sw:true,off:'apps',on:'rating'},
  {n:'дербі',fmt:'derby',mode:'normal',sw:true,off:'apps',on:'rating'},
  {n:'ліга легенд',fmt:'legends',mode:'normal',sw:true,off:'apps',on:'rating'},
  {n:'виклик другу',fmt:'classic',mode:'normal',chal:true,sw:true,off:'apps',on:'rating'},
  {n:'антисезон',fmt:'anti',mode:'hardcore',sw:false,off:'alpha',on:'alpha'},
  {n:'тренування в дербі',fmt:'derby',mode:'practice',sw:false,off:'rating',on:'rating'}];
(async()=>{const T=checker('сортування складу');const {b,pg,errs}=await openPage();
 for(const c of CASES){
  await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.click('#freeOpen');await pickFmt(pg,c.fmt);await pg.click('#startBtn');
  // set the mode, pick a club-season of the format where the two orders really differ, and render
  const info=await pg.evaluate(c=>{const D=window.__dbg,S=D.S;S.mode=c.mode;S.showR=false;S.chal=c.chal?D.chalNewGame(5):null;
    const ok=x=>(c.fmt==='derby'?['dynamo-kyiv','shakhtar-donetsk'].includes(x.c):c.fmt==='oneclub'?x.c===S.club:true)&&x.pl.length>=18;
    const byApps=(a,z)=>z[3]-a[3]||z[4]-a[4],byR=(a,z)=>z[2]-a[2]||z[3]-a[3]||z[4]-a[4];
    const cs=D.DATA.clubs.find(x=>ok(x)&&[...x.pl].sort(byApps).map(p=>p[5]).join()!==[...x.pl].sort(byR).map(p=>p[5]).join());
    S.wheel=cs;S.pending=null;D.renderWheel();return {found:!!cs,sw:!document.getElementById('showRRow').hidden};},c);
  T.check(info.found,`${c.n}: є клуб-сезон, де порядки за матчами й за рейтингом різні`);
  T.check(info.sw===c.sw,`${c.n}: перемикач «Рейтинги» ${c.sw?'є':'сховано'}`);
  // returns {kind, rt}: which order the DOM list follows and whether rating numbers are visible
  const read=()=>pg.evaluate(()=>{const S=window.__dbg.S,pl=S.wheel.pl,rows=[...document.querySelectorAll('#squad .plrow')].map(r=>{const nm=r.querySelector('.nm').childNodes[0].textContent,p=pl.find(q=>q[0]===nm);return {p,off:r.classList.contains('off'),rt:r.querySelector('.rt').textContent};});
    const grp=g=>rows.filter(r=>r.off===g).map(r=>r.p);const mono=(l,f)=>l.every((p,i)=>!i||f(l[i-1],p)>=0);
    const rating=l=>mono(l,(a,z)=>a[2]-z[2]||(a[2]===z[2]?(a[3]-z[3]||(a[3]===z[3]?a[4]-z[4]:0)):0)),apps=l=>mono(l,(a,z)=>a[3]-z[3]||(a[3]===z[3]?a[4]-z[4]:0)),alpha=l=>l.every((p,i)=>!i||l[i-1][0].localeCompare(p[0],'uk')<=0);
    const kinds=l=>({rating:rating(l),apps:apps(l),alpha:alpha(l)});
    return {n:rows.length,ok:kinds(grp(false)),off:kinds(grp(true)),rt:rows.some(r=>r.rt!==''),ids:rows.map(r=>r.p[5]).join()};});
  const check=(r,want,label)=>{T.check(r.n>0&&r.ok[want]&&r.off[want],`${c.n}, ${label}: порядок «${want}»`);
    const other=want==='rating'?'apps':want==='apps'?'rating':'apps';T.check(!r.ok[other],`${c.n}, ${label}: це саме «${want}», а не «${other}»`);};
  const r0=await read();check(r0,c.off,'перемикач вимкнено');
  T.check(r0.rt===(c.mode==='practice'),`${c.n}, вимкнено: числа рейтингу ${c.mode==='practice'?'видно (тренування)':'сховано'}`);
  if(c.sw){
   await pg.evaluate(()=>document.getElementById('showR').click());const r1=await read();check(r1,c.on,'перемикач увімкнено');
   T.check(r1.rt&&r1.ids!==r0.ids,`${c.n}: після перемикання список перемальовано в іншому порядку, числа видно`);
   await pg.evaluate(()=>document.getElementById('showR').click());const r2=await read();
   T.check(r2.ids===r0.ids&&!r2.rt,`${c.n}: вимкнули назад — початковий порядок`);}
 }
 T.check(!errs.length,'помилок на сторінці немає '+errs.join(' | '));
 await b.close();process.exit(T.done());})();
