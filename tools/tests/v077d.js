// One icon system: no non-reward emoji in the rendered UI, reward emoji kept, mode-row plates, short inner footer, no horizontal scroll.
// Run from repo root: node tools/tests/v077d.js   (screenshots: tools/tests/out/v077d_*.png)
const fs=require('fs'),path=require('path');
const {openSite,makeDB,draftSeason,checker,launch,ROOT}=require('./_site.js');
const OUT=path.join(__dirname,'out');fs.mkdirSync(OUT,{recursive:true});
const T=checker('v077d');
// 1. static: every icon key used in the sources exists as an SVG; emoji helper only knows reward keys
{const ico=fs.readFileSync(path.join(ROOT,'src/icons.js'),'utf8');const have=new Set([...ico.matchAll(/"([a-z-]+)":\["0 0 \d+ \d+"/g)].map(m=>m[1]));
 const used=new Set(),emu=new Set();
 for(const f of fs.readdirSync(path.join(ROOT,'src')).filter(f=>/\.(js|html)$/.test(f)&&f!=='icons.js')){const t=fs.readFileSync(path.join(ROOT,'src',f),'utf8');
  for(const m of t.matchAll(/\b(?:ic|icon)\('([a-z-]+)'/g))used.add(m[1]);for(const m of t.matchAll(/<!--i:([a-z0-9-]+)-->/g))used.add(m[1]);
  for(const m of t.matchAll(/\bem\('([a-z-]+)'/g))emu.add(m[1]);
  if(f==='template.html'){const wn=/const WHATSNEW=[\s\S]*?\]\};/.exec(t);if(wn)for(const m of wn[0].matchAll(/\['([a-z-]+)','[^']+','/g))used.add(m[1]);}}   // WHATSNEW items
 const miss=[...used].filter(k=>!have.has(k));T.check(!miss.length,'усі ключі ic()/icon()/<!--i:--> мають SVG: '+used.size+(miss.length?' — немає: '+miss.join(', '):''));
 const em=/const EMOJI=\{([^}]*)\}/.exec(fs.readFileSync(path.join(ROOT,'src/icons/emoji.js'),'utf8'))[1].match(/[a-z-]+(?=:)/g);
 T.check(em.sort().join()==='soccer,star,trophy','EMOJI лише для нагород (trophy, star, soccer)');
 T.check([...emu].every(k=>em.includes(k)),'em() викликається лише з ключами нагород');}
// emoji anywhere in a text node, except inside reward contexts
const SCAN=()=>{const re=/(?![©®™])\p{Extended_Pictographic}|️/u,ok='.ic.em,.tre,.cup,.big,.pills,.occ,.ocbd,#topScorer,#mvpLine,#mvpLine2,.trq,.tro,.champ0,.evc .em,.evr .mm,.vmst,.evg,.brief .em,.rs .em,.vres .em,.lad,.tc-i,.bon1,.pr .chip.b,.grp.bg .bs';   // daily challenge: event and medal emoji are content (approved mockups)
  const bad=[];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
  while((n=w.nextNode())){if(!re.test(n.textContent))continue;const p=n.parentElement;if(!p||p.closest('script,style,textarea,template')||p.closest(ok))continue;bad.push(n.textContent.trim().slice(0,40));}
  return bad;};
const SEED=`try{const d=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv'}).format(new Date());localStorage.setItem('upl30_streak',JSON.stringify({last:d,count:4,best:4}));}catch(e){}
localStorage.setItem('upl30_tr',JSON.stringify({t:{champ:{n:1,at:'2026-10-01'},first:{n:2,at:'2026-10-01'},rebsh:{n:1,at:'2026-10-02'}},seasons:12}));`;
(async()=>{const b=await launch();
 const shot=(pg,n,full)=>pg.screenshot({path:path.join(OUT,`v077d_${n}.png`),fullPage:!!full});
 const noScroll=async(pg,tag)=>T.check(await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${tag}: немає горизонтального скролу`);
 const noEmoji=async(pg,tag)=>{await pg.waitForTimeout(250);const bad=await pg.evaluate(SCAN);T.check(!bad.length,`${tag}: немає емодзі поза нагородами`+(bad.length?' — '+bad.slice(0,5).join(' | '):''));};
 for(const [w,h,theme] of [[390,844,'dark'],[390,844,'light'],[820,1180,'dark'],[320,700,'dark']]){
  const tag=`${w}px ${theme}`;
  const {pg,errs,ctx}=await openSite({b,db:makeDB({}),init:SEED,viewport:{width:w,height:h},colorScheme:theme,wait:1500});
  await pg.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await pg.waitForTimeout(200);
  // home (visible mode rows only: season pick is hidden)
  await noEmoji(pg,`${tag} · головна`);await noScroll(pg,`${tag} · головна`);
  const home=await pg.evaluate(()=>{const tiles=[...document.querySelectorAll('button.tile1')].filter(t=>!t.hidden);const bg=e=>getComputedStyle(e).backgroundColor;
   return {n:tiles.length,plates:tiles.filter(t=>{const i=t.querySelector(':scope>.ic');return i&&i.querySelector('svg.ico')&&bg(i)!=='rgba(0, 0, 0, 0)'&&i.getBoundingClientRect().width>=44;}).length,
    tr:!!document.querySelector('#trBtn>.ic svg.ico')&&!/🏆/.test(document.getElementById('trBtn').textContent),daily:!!document.querySelector('#vdCard .af svg.ico'),fire:!!document.querySelector('#stkChip svg.ico'),
    mail:!!document.querySelector('#fbBtn svg.ico'),cred:getComputedStyle(document.querySelector('.ft-cred')).display!=='none',nav:getComputedStyle(document.querySelector('.foot0')).display!=='none'};});
  T.check(home.n===4&&home.plates===4,`${tag} · рядки режимів: 4 плашки з SVG-іконкою (${home.plates}/${home.n})`);
  T.check(home.tr,`${tag} · «Трофеї» на головній — SVG, не 🏆`);T.check(home.daily&&home.fire&&home.mail,`${tag} · виклик дня, серія й відгук — SVG`);
  T.check(home.cred&&home.nav,`${tag} · на головній повний футер (розділи й подяки)`);
  if(w===390)await shot(pg,`home_phone_${theme}`,true);if(w===820)await shot(pg,'home_ipad_dark',true);
  // setup
  await pg.click('#freeOpen');await pg.waitForTimeout(400);await noEmoji(pg,`${tag} · налаштування`);await noScroll(pg,`${tag} · налаштування`);
  const foot=await pg.evaluate(()=>{const v=s=>{const e=document.querySelector(s);return !!e&&getComputedStyle(e).display!=='none'&&e.getClientRects().length>0;};
   return {nav:v('.foot0'),cred:v('.ft-cred'),news:v('#newsBtn'),fb:v('#fbBtn'),bot:v('#ftBot'),thm:v('#themeBtn')};});
  T.check(!foot.nav&&!foot.cred&&foot.news&&foot.fb&&foot.bot&&foot.thm,`${tag} · короткий футер на внутрішньому екрані`+JSON.stringify(foot));
  // draft
  await pg.click('#startBtn');await pg.waitForTimeout(400);await noEmoji(pg,`${tag} · драфт`);await noScroll(pg,`${tag} · драфт`);
  T.check(await pg.evaluate(()=>!document.getElementById('moveSub')&&!/будь-де/.test(document.getElementById('spinZone').textContent)),`${tag} · зайвих підписів у драфті немає`);
  if(w===390&&theme==='dark')await shot(pg,'draft_phone_dark');
  await draftSeason(pg);await pg.waitForTimeout(1200);await pg.evaluate(()=>{const m=document.querySelector('.champ0');if(m)m.remove();});
  await noEmoji(pg,`${tag} · підсумок`);await noScroll(pg,`${tag} · підсумок`);
  const rew=await pg.evaluate(()=>({tre:document.querySelectorAll('#newTro .tre').length,star:!!document.querySelector('#mvpLine2 .ic.em'),share:!!document.querySelector('#tgShareBtn svg.ico')}));
  T.check(rew.star&&rew.share,`${tag} · підсумок: ⭐ біля гравця сезону на місці, «Поділитися» — SVG`);
  if(w===390)await shot(pg,`summary_phone_${theme}`);
  if(w===820)await shot(pg,'summary_ipad_dark');
  // news sheet
  await pg.evaluate(()=>document.getElementById('newsBtn').click());await pg.waitForTimeout(600);await noEmoji(pg,`${tag} · що нового`);
  T.check(await pg.evaluate(()=>document.querySelectorAll('#viewBody .news .ic svg.ico').length>=1),`${tag} · «Що нового»: іконки SVG`);
  if(w===390&&theme==='dark')await shot(pg,'news_phone_dark');
  await pg.evaluate(()=>document.getElementById('viewClose').click());await pg.waitForTimeout(400);
  // account sheet + leagues
  await pg.evaluate(()=>{const m=document.querySelector('.champ0');if(m)m.remove();document.getElementById('homeBtn').click();});await pg.waitForTimeout(300);
  await pg.click('#acctBtn');await pg.waitForTimeout(500);await noEmoji(pg,`${tag} · акаунт`);
  const cab=await pg.evaluate(()=>document.querySelectorAll('#viewBody .tre,#pp .tre').length);T.check(cab>0,`${tag} · акаунт: емодзі трофеїв на місці (${cab})`);
  await pg.evaluate(()=>{const v=document.getElementById('viewBox');if(v)v.hidden=true;document.getElementById('homeBtn').click();});await pg.waitForTimeout(300);
  await pg.click('#flOpen');await pg.waitForTimeout(500);await noEmoji(pg,`${tag} · ліги з друзями`);await noScroll(pg,`${tag} · ліги з друзями`);
  T.check(!errs.length,`${tag}: помилок JS немає`+(errs.length?' — '+errs.join('; '):''));
  await ctx.close();}
 // reward emoji stay: trophy cup, trophy badges
 {const {pg,ctx}=await openSite({b,db:makeDB({}),init:SEED,wait:1200});
  T.check(await pg.evaluate(()=>window.__dbg.em('trophy','lg').includes('🏆')&&window.__dbg.em('star','sm').includes('⭐')&&window.__dbg.ic('trophy').includes('<svg')&&!window.__dbg.ic('star').includes('⭐')),'em() дає емодзі нагород, ic() — завжди SVG');
  T.check(await pg.evaluate(()=>document.documentElement.innerHTML.includes('class="cup"')||/🏆/.test(document.documentElement.innerHTML)),'🏆 для вікна чемпіона лишився в коді');
  await ctx.close();}
 await b.close();process.exit(T.done());})();
