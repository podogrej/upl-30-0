// Home with solo / with-friends sections, animations (player flies to the pitch, goal flash, summary counters), champion dialog with cup and confetti;
// reduced motion disables animations. Run from repo root: node tools/tests/v064.js [screenshot dir]
const path=require('path'),fs=require('fs');const {ROOT,launch,fastReel}=require('./_page.js');const {checker}=require('./_site.js');
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
async function open(b,opts={}){const ctx=await b.newContext({viewport:{width:390,height:844},...opts});
  await fastReel(ctx);
  await ctx.route(u=>!u.href.startsWith('file:'),r=>r.abort());
  await ctx.addInitScript(()=>{window.__champTest=true;});
  const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));await pg.goto('file://'+path.join(ROOT,'index.html'));await pg.waitForTimeout(800);return {ctx,pg,errs};}
async function pickOne(pg){await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});
  await (await pg.$('#squad .pl:not([disabled])')).click();await pg.waitForTimeout(40);const pb=await pg.$('#squad .plpos button');if(pb)await pb.click();}
(async()=>{const T=checker('0.64');const b=await launch();
 const {pg,errs}=await open(b);
 // home (variant E): two buttons on top, then section labels in order: other modes (league, one club; season pick hidden), board and trophies, about
 const home=await pg.evaluate(()=>{const s=[...document.querySelectorAll('#s1 .sec0')].map(x=>x.textContent);const sec=document.querySelectorAll('#s1 .sec0')[1];const o=id=>document.getElementById(id).compareDocumentPosition(sec);
   return {s,daily:!!document.querySelector('.btns0 #vdBox')&&!document.getElementById('dailyBtn'),modes:['flOpen','clubOpen'].every(id=>o(id)&Node.DOCUMENT_POSITION_FOLLOWING),pickHidden:document.getElementById('pickOpen').hidden,rest:['tablesOpen','trBtn'].every(id=>o(id)&Node.DOCUMENT_POSITION_PRECEDING)};});
 T.check(home.s.join()==='Інші режими,Результати'&&home.daily&&home.modes&&home.pickHidden&&home.rest,'головна: «Грати» і картка виклику дня, «Інші режими», «Результати» '+JSON.stringify(home));
 await pg.screenshot({path:path.join(OUT,'v064_home.png'),fullPage:true});
 // draft: player flies to the pitch
 await pg.click('#freeOpen');await pg.click('#startBtn');
 await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});await (await pg.$('#squad .pl:not([disabled])')).click();await pg.waitForTimeout(40);
 const pb=await pg.$('#squad .plpos button');const land=pg.waitForSelector('#pitch .disc.land0',{timeout:1500}).then(()=>true).catch(()=>false);if(pb)await pb.click();
 T.check(await land,'0.66: гравець не «летить», лише відгук кружка на полі (.land0)');await pg.waitForTimeout(500);
 for(let i=1;i<11;i++)await pickOne(pg);
 await pg.waitForSelector('#simBtn:not([hidden])');await pg.click('#simBtn');await pg.waitForSelector('#live:not([hidden])');
 const goal=await pg.waitForFunction(()=>document.querySelector('#lvMatch .goal0'),null,{timeout:12000}).then(()=>true).catch(()=>false);
 T.check(goal,'живий показ: спалах перемоги (#lvMatch .goal0)');
 await pg.click('#skipBtn');await pg.waitForTimeout(120);
 const cu=await pg.evaluate(()=>({now:document.querySelector('#recTiles b.hot').textContent,pts:String(window.__dbg.S.result.pts)}));
 await pg.waitForTimeout(900);const cu2=await pg.evaluate(()=>document.querySelector('#recTiles b.hot').textContent);
 T.check(+cu.now<+cu.pts&&cu2===cu.pts,`очки рахуються від нуля: ${cu.now} → ${cu2} (${cu.pts})`);
 await pg.evaluate(()=>{const m=document.querySelector('.champ0');if(m)m.remove();});
 // champion dialog: 30-0, champion, anti-season 0-30; not shown without 1st place
 const fake=(W,D,L,place)=>({W,D,L,pts:W*3+D,place,log:Array(30).fill(0)});
 await pg.evaluate(f=>window.__dbg.champModal(f),fake(30,0,0,1));await pg.waitForTimeout(700);
 const m1=await pg.evaluate(()=>{const m=document.querySelector('.champ0');return m&&{h:m.querySelector('h2').textContent,p:m.querySelector('p').textContent,cup:/🏆/.test(m.querySelector('.cup').textContent),cv:!!m.querySelector('canvas'),bg:getComputedStyle(m).backgroundColor};});
 T.check(m1&&m1.h==='30-0!'&&m1.cup&&m1.cv&&/rgba/.test(m1.bg),'30-0: вікно з кубком, конфеті й затемненням '+JSON.stringify(m1));
 await pg.screenshot({path:path.join(OUT,'v064_champ.png')});
 T.check(!!(await pg.$('.champ0 .cshare')),'0.67: у вікні — «Поділитися»');await pg.click('.champ0 .cclose');T.check(!(await pg.$('.champ0')),'«Весь сезон» закриває вікно');
 await pg.evaluate(f=>window.__dbg.champModal(f),fake(22,5,3,1));await pg.waitForTimeout(300);
 T.check(await pg.evaluate(()=>/Ти молодець/.test(document.querySelector('.champ0 p').textContent)),'чемпіон: «Ти молодець!»');
 await pg.keyboard.press('Escape');T.check(!(await pg.$('.champ0')),'Escape закриває вікно');
 await pg.evaluate(f=>window.__dbg.champModal(f),fake(18,6,6,2));T.check(!(await pg.$('.champ0')),'2 місце — вікна немає');
 await pg.evaluate(f=>{window.__dbg.S.format='anti';window.__dbg.champModal(f);},fake(0,0,30,16));T.check(await pg.evaluate(()=>document.querySelector('.champ0 h2').textContent==='0-30!'),'антисезон 0-30 — теж вікно');
 await pg.mouse.click(5,5);T.check(!(await pg.$('.champ0')),'тап по затемненню закриває вікно');
 T.check(!errs.length,'помилок на сторінці немає '+errs.join(' | '));
 // reduced motion: no flight, no confetti
 const R=await open(b,{reducedMotion:'reduce'});
 await R.pg.click('#freeOpen');await R.pg.click('#startBtn');const f2=R.pg.waitForSelector('#pitch .disc.land0',{timeout:800}).then(()=>true).catch(()=>false);await pickOne(R.pg);
 T.check(!(await f2),'«Зменшити рух»: без анімації кружка');
 await R.pg.evaluate(f=>window.__dbg.champModal(f),fake(25,3,2,1));await R.pg.waitForTimeout(200);
 T.check(await R.pg.evaluate(()=>{const m=document.querySelector('.champ0');const c=m&&m.querySelector('canvas');return !!m&&c.width===300;}),'«Зменшити рух»: вікно є, конфеті немає');
 T.check(!R.errs.length,'помилок немає (зменшений рух) '+R.errs.join(' | '));
 await b.close();process.exit(T.done());})();
