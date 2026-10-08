// Browser and server (lib/engine.js) must compute the same season: 10/10, season-pick mode included. Run from repo root: node tools/tests/determinism.js
const path=require('path');const {ROOT,openPage,playSeason}=require('./_page.js');
const E=require(path.join(ROOT,'lib','engine.js'));
(async()=>{const {b,pg,errs}=await openPage();
 const runs=[['classic',1,1],['classic',2,2],['classic',2,3],['derby',1,1],['oneclub',1,1],['anti',3,1],['vd',0,0],['classic',1,6],['legends',1,2],['pick',0,4]];
 let ok=0;
 for(const [fmt,mode,form] of runs){
  await playSeason(pg,fmt,mode,form);
  const c=await pg.evaluate(()=>{const S=window.__dbg.S;const r=S.result;return {seed:r.seed,year:r.year,mode:S.mode,format:S.format,formation:S.formation,
    xi:S.slots.map(s=>({id:s.player.id,name:s.player.name,slot:s.slot,pos:s.player.pos,r:s.player.r,c:s.player.club,y:s.player.y})),W:r.W,D:r.D,L:r.L,gf:r.gf,ga:r.ga,place:r.place}});
  // server resolves the club code for chemistry from the pool by club name and season, same as api/verify.js
  const ccOf=x=>(E.DATA.clubs.find(k=>k.n===x.c&&k.y===+x.y)||{}).c;c.xi=c.xi.map(x=>({...x,cc:ccOf(x),y:+x.y}));
  const s=E.run({xi:c.xi,mode:c.mode,format:c.format,year:c.year,seed:c.seed});
  const same=s.W===c.W&&s.D===c.D&&s.L===c.L&&s.gf===c.gf&&s.ga===c.ga&&s.place===c.place;if(same)ok++;
  console.log(fmt.padEnd(8),c.mode.padEnd(9),c.formation,'browser',`${c.W}-${c.D}-${c.L} ${c.gf}:${c.ga} #${c.place}`,'server',`${s.W}-${s.D}-${s.L} ${s.gf}:${s.ga} #${s.place}`,same?'✓':'✗ MISMATCH');
 }
 console.log('identical',ok,'/',runs.length,'errors',errs.length);await b.close();process.exit(ok===runs.length&&!errs.length?0:1);})();
