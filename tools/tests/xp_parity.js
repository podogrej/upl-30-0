// Server xP (lib/engine.js xpOf, used by api/verify.js for xP trophies) equals the site's pre-season xP (xpRun) bit for bit.
// Run from repo root: node tools/tests/xp_parity.js
const path=require('path');const {ROOT,openPage}=require('./_page.js');
const E=require(path.join(ROOT,'lib','engine.js'));
const fail=[];const check=(ok,msg)=>{console.log((ok?'✓ ':'✗ ')+msg);if(!ok)fail.push(msg);};
function squad(formation,skip){const used=new Set(),xi=[];E.setFormat('classic');
  for(const slot of E.FORMATIONS[formation].slots){let n=0;for(const c of E.DATA.clubs){const p=c.pl.find(q=>!used.has(q[5])&&E.effRating(q,slot)!=null);if(p&&n++>=skip){used.add(p[5]);xi.push({id:p[5],name:p[0],slot,pos:E.GROUP_OF[slot],r:E.effRating(p,slot),cc:c.c,y:c.y});break;}}}
  return xi;}
(async()=>{const {b,pg}=await openPage();
  const cases=[['classic','normal','4-4-2',0,E.LEAGUE_LEGENDS],['classic','hard','4-3-3',7,E.LEAGUE_LEGENDS],['oneclub','normal','3-5-2',3,E.LEAGUE_CULT],['classic','practice','4-2-3-1',11,E.LEAGUE_LEGENDS]];
  for(const [format,mode,formation,skip,year] of cases){
    const xi=squad(formation,skip);
    const web=await pg.evaluate(async a=>{const D=window.__dbg,S=D.S;S.format=a.format;S.mode=a.mode;S.formation=a.formation;const r=await D.xpRun(a.xi,D.MODES[a.mode],a.year);S.format='classic';S.mode='normal';return r.xp;},{xi,format,mode,formation,year});
    const srv=E.xpOf({xi,mode,format,formation,year});
    check(web===srv,`${format}/${mode}/${formation}: браузер ${web} = сервер ${srv}`);
  }
  await b.close();console.log(fail.length?'ПРОБЛЕМИ: '+fail.length:'xp_parity: УСЕ ГАРАЗД');process.exit(fail.length?1:0);})();
