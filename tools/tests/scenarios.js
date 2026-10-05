// Pre-release scenarios: home, theme, 4 seasons (classic, daily, anti-season, derby), result text and card.
// Run from repo root: node tools/tests/scenarios.js [screenshot dir]. Exit code 0 = all good.
const path=require('path'),fs=require('fs');const {ROOT,openPage,playSeason,pickFmt}=require('./_page.js');
const OUT=process.argv[2]||path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const fail=[];const check=(ok,msg)=>{if(!ok)fail.push(msg);};
(async()=>{const {b,pg,errs}=await openPage({colorScheme:'light'});
 const foot=await pg.evaluate(()=>document.querySelector('.foot').textContent);console.log('підвал:',foot);
 check(/версії \d+\.\d+/.test(foot),'у підвалі немає «версії X.YY»');
 const tpl=fs.readFileSync(path.join(ROOT,'src','template.html'),'utf8');const eng=fs.readFileSync(path.join(ROOT,'lib','engine.js'),'utf8');
 const v1=(foot.match(/версії ([\d.]+)/)||[])[1],v2=(eng.match(/VERSION: '([^']+)'/)||[])[1],v3=(tpl.match(/const WHATSNEW=\{v:'([^']+)'/)||[])[1];
 console.log('версії: підвал',v1,'рушій',v2,'WHATSNEW',v3);check(v1&&v1===v2&&v2===v3,'версії не збігаються');
 check(await pg.evaluate(()=>document.documentElement.dataset.theme)==='dark','за замовчуванням не темна тема');
 await pg.screenshot({path:path.join(OUT,'home.png'),fullPage:true});
 await pg.click('#themeBtn');check(await pg.evaluate(()=>document.documentElement.dataset.theme)==='light','перемикач теми не працює');
 await pg.reload();await pg.waitForTimeout(500);check(await pg.evaluate(()=>document.documentElement.dataset.theme)==='light','тема не запам\'яталась');
 await pg.screenshot({path:path.join(OUT,'home_light.png')});await pg.click('#themeBtn');
 // show-ratings toggle: off by default, can be enabled mid-draft, doesn't change order, persists to the next spin
 await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.click('#freeOpen');await pg.click('#formats .opt[data-fmt="classic"]');await pg.click('#modes .opt:nth-child(1)');await pg.click('#startBtn');
 await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});
 const before=await pg.evaluate(()=>({vis:!document.getElementById('showRRow').hidden,on:document.getElementById('showR').checked,names:[...document.querySelectorAll('#squad .pl .nm')].map(e=>e.textContent),rt:[...document.querySelectorAll('#squad .pl .rt')].map(e=>e.textContent).join('')}));
 check(before.vis&&!before.on&&before.rt==='','рейтинги: галочка не видна або рейтинги вже показані');
 await pg.click('#showR');await pg.waitForTimeout(200);
 const after=await pg.evaluate(()=>({names:[...document.querySelectorAll('#squad .pl .nm')].map(e=>e.textContent),rt:[...document.querySelectorAll('#squad .pl .rt')].map(e=>e.textContent)}));
 check(after.rt.every(x=>/^\d+$/.test(x)),'рейтинги: після галочки цифр немає');check(JSON.stringify(after.names)===JSON.stringify(before.names),'рейтинги: змінився порядок гравців');
 await pg.screenshot({path:path.join(OUT,'draft_ratings.png'),fullPage:true});
 {const btn=await pg.$('.pl:not([disabled])');await btn.click();await pg.waitForTimeout(80);const pick=await pg.$('#pitch .slot.target');if(pick)await pick.click();}
 await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});
 check(await pg.evaluate(()=>document.getElementById('showR').checked&&[...document.querySelectorAll('#squad .pl .rt')].every(e=>/^\d+$/.test(e.textContent))),'рейтинги: не лишились на наступне кручення');
 check(await pg.evaluate(()=>/^\d+$/.test((document.querySelector('#pitch .slot.filled .r')||{}).textContent||'')),'рейтинги: немає цифри на полі');
 // no hardcore mode in the mode list; no toggle in anti-season
 check(await pg.evaluate(()=>{document.getElementById('homeBtn').click();document.getElementById('freeOpen').click();return [...document.querySelectorAll('#modes .opt b')].map(b=>b.textContent).join(',');})==='Звичайний,Складний','режими: у виборі не лише «Звичайний» і «Складний»');
 await pickFmt(pg,'anti');await pg.click('#startBtn');await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});
 check(await pg.evaluate(()=>document.getElementById('showRRow').hidden),'рейтинги: галочка є в антисезоні');
 await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.click('#freeOpen');await pg.click('#formats .opt[data-fmt="classic"]');await pg.click('#modes .opt:nth-child(1)');
 // swap-players: without the button a tap on a player does nothing; with it, target slots are highlighted
 await pg.click('#startBtn');
 for(let i=0;i<3;i++){await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});const btn=await pg.$('.pl:not([disabled])');await btn.click();await pg.waitForTimeout(80);const pick=await pg.$('#pitch .slot.target');if(pick){await pick.click();await pg.waitForTimeout(60);}}
 const fi=await pg.evaluate(()=>[...document.querySelectorAll('#pitch .slot')].findIndex(d=>d.classList.contains('filled')));
 check(await pg.evaluate(()=>!document.getElementById('moveBtn').hidden),'перестановка: немає кнопки «Переставити гравців»');
 await (await pg.$$('#pitch .slot'))[fi].click();await pg.waitForTimeout(100);
 check(await pg.evaluate(()=>window.__dbg.S.move==null),'перестановка: тап без кнопки вмикає перестановку');
 await pg.click('#moveBtn');await (await pg.$$('#pitch .slot'))[fi].click();await pg.waitForTimeout(100);
 check(await pg.evaluate(()=>window.__dbg.S.move!=null),'перестановка: з кнопкою тап не вибирає гравця');
 await pg.click('#moveBtn');await pg.evaluate(()=>document.getElementById('homeBtn').click());
 // easter egg and the Nice trophy
 check(await pg.evaluate(()=>{const D=window.__dbg;const cs=D.DATA.clubs.find(c=>c.pl.some(p=>p[5]==='w:1979-03-30:timoschuk'));D.S.wheel=cs;D.renderWheel();const ok=/Анатолій Тимощук \(пітух\)/.test(document.getElementById('squad').textContent);D.S.wheel=null;return ok;}),'пасхалка: у Тимощука немає «(пітух)»');
 check(await pg.evaluate(()=>{const e=window.__dbg.trEval;const X=n=>({id:'x'+n,name:'Олександр Тест'+n});const c={r:{W:1,D:1,L:28,pts:4,place:16,gf:5,ga:60,xp:10,log:[]},xi:[X(1),X(2),X(3),X(4),X(5),X(6),X(7),X(8),X(9),X(10),{id:'w:1972-02-29:palianitsia',name:'Олександр Паляниця'}],pl:[],mode:'normal',format:'classic',reveal:true};const g=e(c);const c5={...c,xi:c.xi.slice(1)};return g.includes('oleksandry')&&g.includes('palianytsia')&&!e(c5).includes('oleksandry');}),'трофеї Віті не видаються');
 check(await pg.evaluate(()=>{const e=window.__dbg.trEval;const base={r:{W:10,D:10,L:10,pts:40,place:8,gf:40,ga:40,xp:40,log:[]},pl:[],mode:'normal',format:'classic',reveal:true};
   const P=window.__dbg.PERSON;const nm=id=>{for(const c of window.__dbg.DATA.clubs)for(const p of c.pl)if(p[5]===id)return p[0];return id;};
   const trio=e({...base,xi:['tm:9796','tm:9800','tm:381268'].map(id=>({id,name:nm(id)}))});
   const zar=e({...base,xi:['tm:69015','w:1974-06-03:rebrov','tm:264372','tm:25732','w:1968-08-05:lujni'].map(id=>({id,name:nm(id)}))});
   const rada=e({...base,xi:['Абрамов', 'Аваков', 'Авраменко', 'Акопян', 'Аксьонов', 'Алексєєв'].map((s,i)=>({id:'r'+i,name:'Іван '+s}))});
   const rada5=e({...base,xi:['Абрамов', 'Аваков', 'Авраменко', 'Акопян', 'Аксьонов'].map((s,i)=>({id:'r'+i,name:'Іван '+s}))});
   return trio.includes('trio')&&zar.includes('zarobitchany')&&rada.includes('rada')&&!rada5.includes('rada');}),'трофеї 0.49 (трійця, заробітчани, Рада) не видаються');
 check(await pg.evaluate(()=>{const e=window.__dbg.trEval;const c={r:{W:1,D:1,L:28,pts:4,place:16,gf:5,ga:60,xp:10,log:[]},xi:[{id:'tm:9796'},{id:'tm:9800'}],pl:[],mode:'normal',format:'classic',reveal:true};return e(c).includes('pyvo');}),'трофей «По пиву?» не видається');
 check(await pg.evaluate(()=>{const D=window.__dbg;const before=(D.trStore().t.nodraw||{}).n||0;const c={r:{W:20,D:0,L:10,pts:60,place:3,gf:50,ga:30,xp:55,log:[]},xi:[],pl:[],mode:'normal',format:'classic',reveal:true};
   D.trAward(c);D.trAward(c);return ((D.trStore().t.nodraw||{}).n||0)===before+2;}),'трофеї: не повторюються (×N)');
 check(await pg.evaluate(()=>{const e=window.__dbg.trEval;const L=(n,f)=>Array.from({length:30},(_,i)=>f(i));
   const base={xi:[],pl:[],mode:'normal',format:'classic',reveal:true};
   const c1={...base,r:{W:10,D:10,L:10,pts:40,place:9,gf:30,ga:30,xp:40,log:L(30,i=>({ug:i<5?0:1,og:i<5?1:0,res:i<5?'L':'W',home:true,opp:'X'}))}};
   const g=e(c1);return g.includes('equal')&&g.includes('sheep')&&!g.includes('homefort');}),'нові трофеї: «Порівну»/«Стадо баранів»/«Білгород» рахуються неправильно');
 check(await pg.evaluate(()=>{const e=window.__dbg.trEval;const r=p=>({r:{W:20,D:9,L:1,pts:p,place:2,gf:60,ga:20,xp:60},xi:[],pl:[],mode:'normal',format:'classic',reveal:true});return e(r(69)).includes('nice')&&!e(r(70)).includes('nice');}),'трофей Nice: не видається за 69 або видається не за 69');
 for(const [fmt,mode,form] of [['classic',1,1],['daily',0,0],['anti',3,1],['derby',2,2]]){
  await playSeason(pg,fmt,mode,form);
  await pg.screenshot({path:path.join(OUT,`result_${fmt}.png`),fullPage:true});
  await pg.click('#tgShareBtn');await pg.waitForTimeout(900);   // outside Telegram and without a native share sheet: shows the card
  check(await pg.evaluate(()=>!document.getElementById('shareImg').hidden),`${fmt}: «Поділитися карткою» не показала картку`);
  const d=await pg.evaluate(()=>{const S=window.__dbg.S;return {text:document.getElementById('shareText').value,cap:window.__dbg.shareTextOf(S.result,false,true),img:document.getElementById('shareImg').src,r:{W:S.result.W,D:S.result.D,L:S.result.L,gf:S.result.gf,ga:S.result.ga,log:S.result.log.map(m=>[m.ug,m.og,m.res])},verified:document.getElementById('verLine').textContent};});
  fs.writeFileSync(path.join(OUT,`card_${fmt}.png`),Buffer.from(d.img.split(',')[1],'base64'));
  // player sees only the base card rating: on the result pitch, in the player table and in the season view
  if(fmt!=='anti'){const rb=await pg.evaluate(()=>{const D=window.__dbg,S=D.S;const bad=[];
    const base=S.slots.map(s=>s.player.r0);
    [...document.querySelectorAll('#pitch2 .slot')].forEach((d,i)=>{const e=d.querySelector('.r0');if(e&&+e.textContent!==base[i])bad.push('поле '+e.textContent+'≠'+base[i]);});
    const all=new Set(base);[...document.querySelectorAll('#playerStats tr')].slice(1).forEach(tr=>{const c=[...tr.children].map(td=>td.textContent);const v=+c[3];if(c.length>7&&!all.has(v))bad.push('таблиця '+v);});
    const xi=S.slots.map(s=>({n:s.player.name,id:s.player.id,slot:s.slot,r:s.player.r,r0:s.player.r0,c:s.player.club,y:s.player.y,rt:7}));
    const box=document.createElement('div');box.innerHTML=D.viewHtml({xi,tbl:[],w:1,d:1,l:1,pts:1,place:1,gf:1,ga:1,formation:S.formation,mode:S.mode,year:S.result.year});
    [...box.querySelectorAll('.slot .r')].forEach((e,i)=>{if(!all.has(+e.textContent))bad.push('перегляд '+e.textContent);});
    const diff=S.slots.filter(s=>s.player.r!==s.player.r0).length;return {bad,diff};});
   check(!rb.bad.length,`${fmt}: видно не базовий рейтинг: ${rb.bad.join(', ')}`);console.log(`${fmt}: гравців зі схованим модифікатором ${rb.diff}`);}
  const te=await pg.evaluate(()=>{const D=window.__dbg;const c=D.trCtxNow(D.S.result);const bad=[];for(const t of D.TROPHIES){if(!t.t)continue;try{t.t(c);}catch(e){bad.push(t.id+': '+e.message);}}return bad;});
  check(!te.length,`${fmt}: трофеї падають: ${te.join('; ')}`);
  const L=d.r.log;check(L.length===30,`${fmt}: не 30 матчів`);
  check(L.reduce((a,m)=>a+m[0],0)===d.r.gf&&L.reduce((a,m)=>a+m[1],0)===d.r.ga,`${fmt}: голи не сходяться з матчами`);
  check(L.every(m=>m[2]===(m[0]>m[1]?'W':m[0]<m[1]?'L':'D')),`${fmt}: результат матчу не збігається з рахунком`);
  check(/[🟩🟨🟥]/u.test(d.text),`${fmt}: у тексті немає квадратиків`);check(!/[🟩🟨🟥]/u.test(d.cap),`${fmt}: у підписі до картки є квадратики`);
  check(!/№/.test(d.text),`${fmt}: у тексті номер виклику`);
  console.log(`\n== ${fmt}: ${d.r.W}-${d.r.D}-${d.r.L} ${d.r.gf}:${d.r.ga}\n${d.cap}`);
 }
 check(!errs.length,'помилки на сторінці: '+errs.join(' | '));
 console.log('\nзнімки:',OUT);console.log(fail.length?'ПРОБЛЕМИ:\n- '+fail.join('\n- '):'УСЕ ГАРАЗД');await b.close();process.exit(fail.length?1:0);})();
