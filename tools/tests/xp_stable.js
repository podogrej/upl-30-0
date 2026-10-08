// Pre-season forecast is stable: the same squad in the same slots always gets the same xP and chances; swapping two players
// moves it only slightly, and swapping them back returns exactly the same forecast. Run from repo root: node tools/tests/xp_stable.js
const {openPage}=require('./_page.js');const {checker}=require('./_site.js');
(async()=>{const T=checker('xp_stable');const {b,pg,errs}=await openPage();
 await pg.evaluate(()=>document.getElementById('homeBtn').click());await pg.click('#freeOpen');await pg.evaluate(()=>window.__dbg.setFmt('classic'));await pg.click('#modes .opt:nth-child(1)');await pg.click('#startBtn');
 for(let i=0;i<11;i++){await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});const bt=await pg.$('.pl:not([disabled])');await bt.click();await pg.waitForTimeout(80);const pk=await pg.$('#pitch .slot.target');if(pk){await pk.click();await pg.waitForTimeout(60);}}
 const pre=()=>pg.waitForFunction(()=>window.__dbg.S.locked&&window.__dbg.S.pre,null,{timeout:20000}).then(()=>pg.evaluate(()=>{const p=window.__dbg.S.pre;return {xp:p.xp,pl:p.pl.join(','),xi:window.__dbg.S.slots.map(s=>s.slot+':'+s.player.id).join(',')};}));
 const p0=await pre();
 // two slots of the same line (e.g. two central defenders): a swap that keeps every player in a natural position
 const pair=await pg.evaluate(()=>{const D=window.__dbg,sl=D.S.slots;for(let i=0;i<sl.length;i++)for(let j=i+1;j<sl.length;j++)if(sl[i].slot===sl[j].slot)return [i,j];return null;});
 T.check(!!pair,'є два однакові місця для обміну');
 const swap=async()=>{await pg.click('#moveBtn');await pg.waitForTimeout(150);const s=await pg.$$('#pitch .slot');await s[pair[0]].click();await pg.waitForTimeout(150);await (await pg.$$('#pitch .slot'))[pair[1]].click();await pg.waitForTimeout(150);await pg.click('#moveBtn');return pre();};
 const p1=await swap(),p2=await swap();
 T.check(p1.xi!==p0.xi&&p2.xi===p0.xi,'гравців переставлено й повернуто');
 T.check(Math.abs(p1.xp-p0.xp)<0.5,`обмін рівноцінних місць — прогноз майже той самий, без шуму ±1 (${p0.xp.toFixed(2)} → ${p1.xp.toFixed(2)})`);   // random draws follow the xi order, so a swap may move xP by a few hundredths
 T.check(p2.xp===p0.xp&&p2.pl===p0.pl,`повернули назад — прогноз точно той самий (${p2.xp.toFixed(2)})`);
 // a release without new news items does not light the news dot again for those who read them
 await pg.evaluate(()=>{localStorage.setItem('upl30_news_seen',JSON.stringify('0.77'));});await pg.reload();await pg.waitForTimeout(600);
 T.check(await pg.evaluate(()=>document.getElementById('newsDot').hidden),'«Що нового» вже прочитано (0.77) — точка не горить');
 T.check(!errs.length,'помилок на сторінці немає '+errs.join(' | '));
 await b.close();process.exit(T.done());})();
