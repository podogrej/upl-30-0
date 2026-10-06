// Player chips on the pitch must not overlap. For every 11x11 (FORMATIONS) and 5x5 (F5_FORMS) formation the pitch is filled
// with the longest surnames in the pool (cardName, incl. nickname suffixes), each slot with players eligible for it.
// States: draft with ratings, draft without ratings, season summary (average grade + overall rating in the club line),
// saved-season view (board modal); 5x5: draft, squads with ratings, final with grades (single pitch and a 3-team grid).
// Viewport widths 320, 360, 390, 768, 1024. For every chip pair compare rects of the circle, badge, surname and club line
// (text via Range): no intersections, everything inside the pitch with a 2px margin. Expect 0.
// Run from repo root: node tools/tests/pitch_layout.js [width ...]
const {openPage}=require('./_page.js');
const WIDTHS=process.argv.slice(2).map(Number).filter(Boolean);
(async()=>{
  const {b,pg,errs}=await openPage({viewport:{width:390,height:900}});
  await pg.addStyleTag({content:'.slot *{animation:none!important;transition:none!important}'});   // the 'pop' badge scales - measure the final state
  await pg.evaluate(()=>document.fonts.ready);
  let total=0;const byW={};
  for(const W of (WIDTHS.length?WIDTHS:[320,360,390,768,1024])){
    await pg.setViewportSize({width:W,height:900});await pg.waitForTimeout(100);
    const r=await pg.evaluate(async()=>{
      const D=window.__dbg,S=D.S,DATA=D.DATA;const NICK_LEN={'w:1979-03-30:timoschuk':9};
      const len=p=>D.cardName(p[0]).length+(NICK_LEN[p[5]]||0);
      const cards=[];for(const c of DATA.clubs)for(const p of c.pl)cards.push({p,c});
      cards.sort((a,b)=>len(b.p)-len(a.p)||(D.clubShort(b.c.n).length-D.clubShort(a.c.n).length));
      const alias=DATA.alias||{},canon=id=>alias[id]||id;
      const pick=(slots,ok)=>{const used=new Set();return slots.map(sl=>{const x=cards.find(({p})=>!used.has(canon(p[5]))&&ok(p,sl));used.add(canon(x.p[5]));
        return {name:x.p[0],id:x.p[5],r0:x.p[2],r:x.p[2],cc:x.c.c,club:x.c.n,c:x.c.c,y:x.c.y,slot:sl};});};
      const nf=()=>new Promise(res=>requestAnimationFrame(()=>requestAnimationFrame(res)));
      const show=id=>{for(const s of document.querySelectorAll('main section, section'))s.hidden=s.id!==id;};
      // rects of each chip's parts
      function measure(pe,label){const pr=pe.getBoundingClientRect(),rg=document.createRange(),bad=[];
        const chips=[...pe.querySelectorAll('.slot')].map((sl,i)=>{const parts=[];
          const add=(k,e,txt)=>{if(!e)return;let r;if(txt){rg.selectNodeContents(e);r=rg.getBoundingClientRect();}else r=e.getBoundingClientRect();if(r.width>0)parts.push({k,r,i});};
          add('кружок',sl.querySelector('.disc'));add('плашка',sl.querySelector('.pill'));add('прізвище',sl.querySelector('.nm'),1);add('клуб',sl.querySelector('.club'),1);
          const nm=sl.querySelector('.nm');return {parts,nm:nm?nm.textContent:sl.querySelector('.pos').textContent};});
        const M=2;
        for(const c of chips)for(const q of c.parts){const r=q.r;if(r.left<pr.left+M-0.01||r.right>pr.right-M+0.01||r.top<pr.top+M-0.01||r.bottom>pr.bottom-M+0.01)bad.push(`${label}: ${c.nm} ${q.k} за краєм поля`);}
        for(let i=0;i<chips.length;i++)for(let j=i+1;j<chips.length;j++)for(const a of chips[i].parts)for(const bq of chips[j].parts){
          const x=Math.min(a.r.right,bq.r.right)-Math.max(a.r.left,bq.r.left),y=Math.min(a.r.bottom,bq.r.bottom)-Math.max(a.r.top,bq.r.top);
          if(x>0.01&&y>0.01)bad.push(`${label}: ${chips[i].nm} ${a.k} × ${chips[j].nm} ${bq.k} (${x.toFixed(1)}×${y.toFixed(1)}px)`);}
        return {bad,n:chips.length,w:Math.round(pr.width),shr:pe.querySelectorAll('.nm[style*="font-size"],.club[style*="font-size"]').length,flip:pe.querySelectorAll('.pill.flip').length,mv:pe.querySelectorAll('.nm[style*="transform"],.club[style*="transform"]').length};}
      const out=[];let checks=0,shr=0,flip=0,mv=0;const widths=new Set();
      const run=async(pe,label)=>{await nf();const m=measure(pe,label);checks++;shr+=m.shr;flip+=m.flip;mv+=m.mv;widths.add(m.w);out.push(...m.bad);};
      const sv={format:S.format,formation:S.formation,slots:S.slots,mode:S.mode,result:S.result,showR:S.showR,locked:S.locked,move:S.move,pending:S.pending};
      S.format='classic';S.move=null;S.pending=null;
      for(const f of Object.keys(D.FORMATIONS)){
        const xi=pick(D.FORMATIONS[f].slots,(p,sl)=>D.effRating(p,sl)!=null);
        S.formation=f;S.slots=xi.map(p=>({slot:p.slot,pos:D.GROUP_OF[p.slot],player:p}));
        show('s2');const pe=document.getElementById('pitch');
        S.mode='practice';S.showR=true;S.locked=false;S.result=null;D.renderPitch(pe,S.slots,false);await run(pe,`${f} драфт з рейтингами`);
        S.mode='hard';S.showR=false;D.renderPitch(pe,S.slots,false);await run(pe,`${f} драфт без рейтингів`);
        show('s3');const pe2=document.getElementById('pitch2');
        S.mode='normal';S.result={players:xi.map(p=>({id:p.id,rt:8.88}))};D.renderPitch(pe2,S.slots,true);await run(pe2,`${f} підсумки`);
        const vb=document.getElementById('viewBox');vb.hidden=false;document.getElementById('viewBody').innerHTML=D.pitchHtml(f,xi.map(p=>({n:p.name,id:p.id,slot:p.slot,r:p.r,r0:p.r0,c:p.club,y:p.y})));
        await run(document.querySelector('#viewBody .pitch'),`${f} перегляд сезону`);vb.hidden=true;document.getElementById('viewBody').innerHTML='';}
      Object.assign(S,sv);
      // 5x5: player line = GROUP_OF[primary position]
      const f5G=p=>D.GROUP_OF[p[6]]||p[1];show('s5');const host=document.getElementById('f5');const keep=host.innerHTML;
      for(const f of Object.keys(D.F5_FORMS)){
        const slots=D.F5_FORMS[f].rows.flat();const xi=pick(slots,(p,sl)=>f5G(p)===sl);
        const team={form:f,slots:xi.map(p=>({slot:p.slot,player:{name:p.name,id:p.id,slot:p.slot,r:p.r0,club:p.club,c:p.c,y:p.y}}))};
        for(const [st,opts] of [['драфт',{}],['склади з рейтингами',{reveal:true}],['фінал з оцінками',{rt:()=>8.8}]]){
          host.innerHTML=D.f5Pitch(team,opts);await run(host.querySelector('.pitch'),`5×5 ${f} ${st}`);
          host.innerHTML=`<div class="f5grid">${[team,team,team].map(t=>`<div>${D.f5Pitch(t,opts)}</div>`).join('')}</div>`;await run(host.querySelector('.pitch'),`5×5 ${f} ${st} (сітка)`);}}
      host.innerHTML=keep;show('s1');
      return {bad:out,checks,shr,flip,mv,widths:[...widths].sort((a,b)=>a-b)};});
    byW[W]=r.bad.length;total+=r.bad.length;
    console.log(`${W}px: ${r.checks} полів (ширина поля ${r.widths.join('/')}px) — перетинів і виходів за край: ${r.bad.length} (зсунуто підписів ${r.mv}, зменшено ${r.shr}, плашок зліва ${r.flip})`);
    r.bad.slice(0,12).forEach(x=>console.log('   '+x));if(r.bad.length>12)console.log(`   … ще ${r.bad.length-12}`);
  }
  if(errs.length)console.log('ПОМИЛКИ СТОРІНКИ:',errs);
  console.log(total||errs.length?`ПРОБЛЕМИ: ${total} (${Object.entries(byW).map(([w,n])=>w+': '+n).join(', ')})`:'УСЕ ГАРАЗД');
  await b.close();process.exit(total||errs.length?1:0);
})();
