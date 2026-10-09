// Screenshots + hit-area check of the draft screen before/after the first spin.
// Run: node tools/tests/spin_shots.js [prefix]. Exit code 0 = ok.
const path=require('path'),fs=require('fs');const {ROOT,openPage,pickFmt}=require('./_page.js');
const OUT=path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const pre=process.argv[2]||'spin_after';const fail=[];
const check=(ok,m)=>{console.log((ok?'✓ ':'✗ ')+m);if(!ok)fail.push(m);};
const VP=[['1366',1366,1024],['1024',1024,768],['p1024',1024,1366],['820',820,1180],['390',390,844]];
(async()=>{for(const [n,w,h] of VP){
  const {b,pg}=await openPage({viewport:{width:w,height:h},fastReel:false});   // real reel animation
  await pg.click('#freeOpen');await pickFmt(pg,'oneclub');await pg.click('#startBtn');await pg.waitForTimeout(1800);
  await pg.screenshot({path:`${OUT}/${pre}_${n}_idle.png`});
  const r=await pg.evaluate(()=>{const q=s=>document.querySelector(s).getBoundingClientRect(),bt=q('#spinBtn'),p=q('#pitch');return {bt:bt.height,top:bt.top,pitchTop:p.top,w:bt.width};});
  console.log(n,JSON.stringify(r));
  check(r.bt>=44,n+': button >=44px');
  if(w>=760)check(Math.abs(r.top-r.pitchTop)<=24,n+': button near pitch top (delta '+Math.round(r.top-r.pitchTop)+')');
  await pg.click('#spinBtn');await pg.waitForTimeout(350);await pg.screenshot({path:`${OUT}/${pre}_${n}_spinning.png`});
  check(await pg.evaluate(()=>{const s=document.querySelector('#reelYear .strip.go');return !!s&&parseFloat(getComputedStyle(s).transitionDuration)>1;}),n+': reel is really spinning (strip.go, transition > 1 s)');
  await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});await pg.waitForTimeout(400);
  await pg.screenshot({path:`${OUT}/${pre}_${n}_list.png`});
  const rr=await pg.$('#rerollClub');if(rr&&await rr.isVisible()&&await rr.isEnabled()){await rr.click();await pg.waitForTimeout(2500);await pg.screenshot({path:`${OUT}/${pre}_${n}_reroll.png`});}
  await b.close();}
 process.exit(fail.length?1:0);})();
