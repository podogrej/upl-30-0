// 0.80 daily challenge (vd_*). A. rules (lib/vd_core.js): "played for club" = a UPL club-season row with apps >= 1 (zero-app rows ignored),
// event player never counts for the required condition but always scores, parts need separate players.
// B. server (api/_vd.js via /api/seed, real handlers + in-memory DB): attempt issue and resume, burn on a missed condition, 5 attempts per day,
// score computed by the server (a forged one is ignored), archive day is late, future day refused, counted attempt -> season verified and linked,
// not credited to chat leagues; an older 0.79.2 tab's daily draft season is still verified.
// C. site (file://, offline): home card states, no hints in the wheel list, event player on the pitch, not-counted screen, result block, archive;
// screenshots tools/tests/out/v080_*.png (phone dark and light, iPad). Run from repo root: node tools/tests/v080.js
const path=require('path'),fs=require('fs'),crypto=require('crypto');const {ROOT,launch,makeDB,callApi,checker}=require('./_site.js');const {fastReel}=require('./_page.js');
process.env.SUPABASE_SERVICE_KEY='svc';
const E=require(path.join(ROOT,'lib','engine.js')),V=require(path.join(ROOT,'lib','vd_core.js')),LIST=require(path.join(ROOT,'lib','challenges.json'));
const seedH=require(path.join(ROOT,'api','seed.js')),saveH=require(path.join(ROOT,'api','save.js'));
const T=checker('v080');const OUT=path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const kd=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const TODAY=kd(new Date()),YDAY=kd(new Date(Date.now()-864e5)),TMRW=kd(new Date(Date.now()+864e5));
const ILS=LIST.find(c=>c.day==='2026-10-12');
const CUR=require(path.join(ROOT,'lib','vd_current.json'));
const A=E.DATA.alias||{},canon=id=>A[id]||id,IDX=V.vdIndex(E.DATA,CUR);

// ---- A. rules
{const D={clubs:[{c:'a',n:'A',y:2000,pl:[['Ікс','MF',70,0,0,'p1','CM','',null,0,0,1990]]},{c:'b',n:'B',y:2001,pl:[['Ікс','MF',72,5,0,'p1','CM','',null,0,0,1990],['Ігрек','DF',70,3,0,'p2','CB','',null,0,1,1991]]}],nats:['Україна','Бразилія'],alias:{}};
  const ix=V.vdIndex(D);
  T.check(!V.vdMatch({type:'club',params:{club:'a'}},ix.p1,'MF')&&V.vdMatch({type:'club',params:{club:'b'}},ix.p1,'MF'),'«гравець клубу»: рядок з 0 матчів не рахується, з 1+ — рахується');
  T.check(V.vdMatch({type:'nationality',params:{nats:['Бразилія']}},ix.p2,'DF')&&!V.vdMatch({type:'nationality',params:{except:['Бразилія']}},ix.p2,'DF')&&V.vdMatch({type:'nationality',params:{except:['Україна']}},ix.p2,'DF'),'громадянство: nats / except');
  T.check(V.vdMatch({type:'and',of:[{type:'nationality',params:{except:['Україна']}},{type:'line',params:{lines:['DF'],not:true}}]},ix.p2,'DF')===false,'комбінації and / line not');
  const zero=[];for(const c of E.DATA.clubs)for(const p of c.pl)if(p[3]<1)zero.push([c.c,p[5]]);
  const real=(c,id)=>E.DATA.clubs.filter(x=>x.c===c).reduce((a,x)=>a+x.pl.filter(p=>canon(p[5])===canon(id)).reduce((b,p)=>b+p[3],0),0);   // apps from rows with matches only
  T.check(zero.length===5&&zero.every(([c,id])=>((IDX[canon(id)]||{clubs:{}}).clubs[c]||0)===real(c,id)&&(real(c,id)>0||!((IDX[canon(id)]||{clubs:{}}).clubs[c]>=1))),`у пулі ${zero.length} рядків з 0 матчів, жоден не робить гравцем клубу`);
  const kar=IDX[canon('tm:59322')],kar0=V.vdIndex(E.DATA)[canon('tm:59322')];
  T.check(kar0&&!kar0.clubs['shakhtar-donetsk']&&V.vdMatch({type:'club',params:{club:'shakhtar-donetsk'}},kar,'DF')&&!!kar.clubs['dynamo-kyiv'],'поточний сезон: Караваєв (лише 2026/27 за Шахтар) — гравець Шахтаря, і далі гравець Динамо');
  const kov=IDX[canon('tm:120211')],ch0={type:'club',params:{club:'chornomorets-odesa'}};
  T.check(kov&&!(kov.clubs['chornomorets-odesa']>=1)&&V.vdMatch(ch0,kov,'DF')&&!V.vdMatch(ch0,V.vdIndex(E.DATA,{apps:CUR.apps})[canon('tm:120211')],'DF')&&V.vdMatch({type:'clubs_count_min',params:{n:3}},kov,'DF')===(Object.keys(kov.clubs).length>=3),'заявка 2026/27: Коваль (без матчів за Чорноморець) — гравець Чорноморця, матчів і клубів «зіграв за» не додає');
  T.check(!Object.keys(CUR.apps).some(c=>!E.DATA.clubs.some(x=>x.c===c)),'поточний сезон: усі клуби — slug пулу (ФК Харків 2026 = Металіст 1925)');
  const ils=V.vdEventCard(ILS,E.DATA);
  T.check(ils&&ils.p[0]==='Ілсіньйо'&&ils.c.c==='shakhtar-donetsk','гравець події — його найсильніша картка УПЛ');
  const mk=ids=>ids.map(id=>({id,line:'MF'}));const nonSh=Object.keys(IDX).filter(k=>!IDX[k].clubs['shakhtar-donetsk']&&IDX[k].nat!=='Бразилія').slice(0,10);
  const e1=V.vdEval(ILS,mk([ils.p[5],...nonSh]),IDX,A);
  T.check(e1.have===0&&!e1.gate&&e1.score===1&&e1.rows[0].event&&!e1.rows[0].req,'гравець події: не в умову (0/2), але в рахунок (1/11)');
  const sh=Object.keys(IDX).filter(k=>IDX[k].clubs['shakhtar-donetsk']&&k!==canon(ils.p[5])).slice(0,3);
  const e2=V.vdEval(ILS,mk([ils.p[5],...sh,...nonSh.slice(0,7)]),IDX,A);
  T.check(e2.gate&&e2.have===2&&e2.score>=4,`зайві гравці під умову теж дають очки (${e2.score}/11)`);
  const VS=LIST.find(c=>c.day==='2026-10-09');const both=Object.keys(IDX).find(k=>IDX[k].clubs['veres-rivne']&&IDX[k].clubs['shakhtar-donetsk']);
  const e3=V.vdEval(VS,mk([both,...nonSh.slice(0,10)]),IDX,A);
  T.check(!e3.gate&&e3.have===1,'дві частини умови: один гравець закриває лише одну');
  T.check(V.vdMedal(3)===null&&V.vdMedal(4).k==='bronze'&&V.vdMedal(6).k==='silver'&&V.vdMedal(9).k==='gold'&&V.vdMedal(11).k==='perfect','медалі 4 / 6 / 9 / 11');
  for(const ch of LIST){const ok=ch.title&&ch.story&&ch.task&&ch.required&&ch.required.label&&(!ch.eventPlayer||V.vdEventCard(ch,E.DATA))&&!/\d+\.\d\d|TODO|SQL/.test(ch.title+ch.story+ch.task);
    T.check(!!ok,`вміст ${ch.day}: заголовок, повід, завдання, умова, гравець події в пулі`);}
}

// ---- B. server
const SECRETS={};
const db=makeDB({seasons:{auto:'id',onInsert:r=>{r.verified=null;}},season_seeds:{},vd_results:{auto:'id',uq:[['day','device_id','attempt']]},daily_results:{auto:'id'},trophies:{pk:['device_id','trophy']},challenges:{}},
  {device_ok:a=>{if(SECRETS[a.p_device]==null)SECRETS[a.p_device]=a.p_secret;return SECRETS[a.p_device]===a.p_secret?'p-'+a.p_device.slice(0,4):{status:403,body:JSON.stringify({code:'28000',message:'device secret'})};},rate_hit:()=>true,
   vd_mine:a=>{const by={};for(const r of db.DB.vd_results.filter(r=>r.device_id===a.p_device)){const d=by[r.day]||(by[r.day]={c_day:r.day,best:null,attempts:0,gate_any:false});d.attempts++;if(r.gate_ok){d.gate_any=true;d.best=Math.max(d.best??-1,r.score);}}return Object.values(by);}});
let FAIL_PATCH=0;const xiH=xi=>require(path.join(ROOT,'api','_vd.js')).xiHash(sq(xi));
global.fetch=async(url,o={})=>{const m=o.method||'GET';
  if(m==='PATCH'&&/\/season_seeds/.test(url)&&FAIL_PATCH){FAIL_PATCH=0;throw new Error('timeout');}   // lost xi_hash write
  if(m==='POST'&&/\/season_seeds/.test(url)){const b=JSON.parse(o.body);b.id=b.id||crypto.randomUUID();o={...o,body:JSON.stringify(b)};
    if(b.vd_day&&db.DB.season_seeds.some(x=>x.device_id===b.device_id&&x.vd_day===b.vd_day&&x.vd_attempt===b.vd_attempt))return {ok:false,status:409,text:async()=>JSON.stringify({code:'23505'}),json:async()=>({code:'23505'})};}
  return db.fetch(url,o);};
for(const d of [TODAY,YDAY]){const i=LIST.findIndex(c=>c.day===d);if(i>=0)LIST.splice(i,1);}   // the real content may already have these days
LIST.push({...ILS,day:TODAY},{...ILS,day:YDAY});   // same module object as api/_vd.js uses
// squad: event player on his card, `sh` Shakhtar players, the rest neither Shakhtar nor Brazilian.
// sid: attempt seed id -> cards from the attempt wheel (first entries, as api/_vd.js checks); Shakhtar off the wheel only if the wheel has none
const wheelSet=sid=>new Set(E.wheelSeq(E.hashStr(String(sid)+'|wheel')).slice(0,20));
function buildXi(sh,sid){E.setFormat('classic');const F=E.FORMATIONS['4-4-2'].slots,ev=V.vdEventCard(ILS,E.DATA),used=new Set([canon(ev.p[5])]),out=[];let evSlot=null,best=-1;
  const W=sid?wheelSet(sid):null,onW=c=>!W||W.has(E.DATA.clubs.indexOf(c));
  F.forEach((s,i)=>{const r=E.effRating(ev.p,s);if(r!=null&&r>best){best=r;evSlot=i;}});
  F.forEach((slot,i)=>{if(i===evSlot){out.push({n:ev.p[0],id:ev.p[5],slot,r:E.effRating(ev.p,slot),r0:ev.p[2],c:ev.c.n,y:ev.c.y});return;}
    const want=sh>0;let pick=null;
    for(const strict of [true,false]){if(pick||(!strict&&!want))break;
      for(const c of E.DATA.clubs){if((c.c==='shakhtar-donetsk')!==want||(strict&&!onW(c)))continue;for(const p of c.pl){const k=canon(p[5]),q=IDX[k];if(used.has(k)||!q||p[3]<1)continue;
        if(!want&&(q.clubs['shakhtar-donetsk']||q.nat==='Бразилія'))continue;const r=E.effRating(p,slot);if(r!=null){pick={c,p,r};break;}}if(pick)break;}}
    if(want)sh--;used.add(canon(pick.p[5]));out.push({n:pick.p[0],id:pick.p[5],slot,r:pick.r,r0:pick.p[2],c:pick.c.n,y:pick.c.y});});
  return out;}
const SX=xi=>xi.map(x=>({id:x.id,name:x.n,slot:x.slot,pos:E.GROUP_OF[x.slot],r:x.r,cc:(E.DATA.clubs.find(c=>c.n===x.c&&c.y===+x.y)||{}).c,y:+x.y}));
const sq=xi=>xi.map(x=>({id:x.id,slot:x.slot,c:x.c,y:x.y}));
async function serverChecks(){
  const dev=crypto.randomUUID(),secret='secret-0123456789abcdef',call=b=>callApi(seedH,{device_id:dev,secret,...b});
  const fin=(a,xi,o={})=>call({vd:'finish',day:o.day||TODAY,attempt:a,formation:'4-4-2',xi:sq(xi),...o.extra});
  const s1=await call({vd:'start',day:TODAY}),s1b=await call({vd:'start',day:TODAY});
  T.check(s1.status===200&&s1.json.attempt===1&&s1b.json.attempt===1&&s1b.json.seed_id===s1.json.seed_id&&!('seed' in s1.json),'старт: спроба 1; повторний старт — та сама відкрита спроба, сезонний seed не видається');
  T.check([401,403].includes((await callApi(seedH,{device_id:dev,secret:'wrong-secret-0123456789',vd:'start',day:TODAY})).status),'старт: чужий секрет — відмова');
  T.check((await call({vd:'start',day:TMRW})).status===400,'майбутній день — відмова');
  T.check((await call({vd:'start',day:'2001-01-01'})).status===404,'день без виклику — 404');
  const free=buildXi(0,null),sid1=s1.json.seed_id;
  const offW=free.filter(x=>x.n!=='Ілсіньйо'&&!wheelSet(sid1).has(E.DATA.clubs.findIndex(c=>c.n===x.c&&c.y===x.y))).length;
  const fOff=await fin(1,free);
  T.check(offW>2?fOff.status===400&&/колеса/.test(fOff.json.error):true,`склад не з колеса спроби (${offW} поза колесом) — 400: ${fOff.json.error||fOff.status}`);
  const bad=buildXi(0,sid1);
  const f1=await fin(1,bad,{extra:{score:11,gate:true}});
  const r1=db.DB.vd_results.find(r=>r.device_id===dev&&r.attempt===1),seed1=db.DB.season_seeds.find(s=>s.id===sid1);
  T.check(f1.status===200&&f1.json.gate===false&&f1.json.score===1&&!f1.json.seed&&r1&&r1.gate_ok===false&&r1.score===1&&seed1.xi_hash==='','умову не виконано: спроба згорає, сезону немає; підроблений рахунок 11 проігноровано (сервер: '+(f1.json.score)+')');
  T.check(r1.player_id==='p-'+dev.slice(0,4)&&r1.late===false&&f1.json.late===false,'рядок спроби: гравець з привʼязки пристрою, не з архіву (late — з відповіді сервера)');
  T.check((await fin(1,buildXi(2,sid1))).json.gate===false,'спробу не переграти: повторне завершення повертає перший вердикт');
  const nx=bad.slice();nx[0]={...nx[0],slot:'GK'};
  const s2=await call({vd:'start',day:TODAY}),sid2=s2.json.seed_id;
  T.check(s2.json.attempt===2&&s2.json.used===1,'наступний старт — спроба 2');
  T.check((await fin(2,nx)).status===400,'склад не за схемою — 400');
  T.check((await fin(2,bad.filter(x=>x.n!=='Ілсіньйо').concat(bad.slice(0,1)))).status===400,'склад без гравця події або з повтором — 400');
  // race: two finishes of one attempt at once (counted XI A, not counted XI B) -> only the stored XI can get the seed
  const good=buildXi(2,sid2),bad2=buildXi(0,sid2);
  const [ra,rb]=await Promise.all([fin(2,good),fin(2,bad2)]);
  const stored=db.DB.vd_results.find(r=>r.device_id===dev&&r.attempt===2),storedA=stored.gate_ok===true;
  T.check((storedA?(ra.json.seed&&!rb.json.seed&&rb.json.gate===true):(!ra.json.seed&&!rb.json.seed&&ra.json.gate===false))&&db.DB.season_seeds.find(s=>s.id===sid2).xi_hash===(storedA?xiH(good):''),`паралельні завершення: seed лише для збереженого складу (${storedA?'A':'B'} першим)`);
  let f2=ra;
  if(!storedA){   // B won the race: repeat the counted path on the next attempt
    const s3=await call({vd:'start',day:TODAY});const g3=buildXi(2,s3.json.seed_id);f2=await fin(s3.json.attempt,g3);good.splice(0,11,...g3);}
  T.check(f2.json.gate===true&&f2.json.score>=3&&f2.json.seed,`умову виконано: ${f2.json.score}/11, видано seed сезону`);
  const q=E.run({xi:SX(good),mode:'normal',format:'classic',year:E.LEAGUE_LEGENDS,seed:f2.json.seed});
  const row={mode:'normal',format:'classic',formation:'4-4-2',year:E.LEAGUE_LEGENDS,seed:f2.json.seed,seed_id:f2.json.seed_id,version:E.VERSION,xi:good,practice:false,w:q.W,d:q.D,l:q.L,pts:q.pts,place:q.place,gf:q.gf,ga:q.ga,perfect:q.W===30};
  const sv=await callApi(saveH,{kind:'season',device_id:dev,secret,row});
  const r2=db.DB.vd_results.find(r=>r.device_id===dev&&r.seed_id===f2.json.seed_id);
  T.check(sv.json.verified===true&&+r2.season_id===+sv.json.id,`сезон спроби перевірено (${sv.json.note}) і привʼязано до спроби`);
  T.check(!(db.DB.league_results||[]).length,'сезон виклику не йде в ліги чатів (seed не позначено як спробу ліги)');
  const other=good.map((x,i)=>i===0?bad2[0]:x);
  const q2=E.run({xi:SX(other),mode:'normal',format:'classic',year:E.LEAGUE_LEGENDS,seed:f2.json.seed});
  const sv2=await callApi(saveH,{kind:'season',device_id:dev,secret,row:{...row,xi:other,w:q2.W,d:q2.D,l:q2.L,pts:q2.pts,place:q2.place,gf:q2.gf,ga:q2.ga,perfect:q2.W===30}});
  T.check(sv2.json.verified===false,'інший склад на seed спроби — не перевірено ('+sv2.json.note+')');
  // xi_hash PATCH lost (timeout): a retry with the same XI sets it and gets the seed, another XI never
  {const s=await call({vd:'start',day:TODAY}),g=buildXi(2,s.json.seed_id);FAIL_PATCH=1;const x=await fin(s.json.attempt,g);
   const retryOther=await fin(s.json.attempt,buildXi(0,s.json.seed_id)),retry=await fin(s.json.attempt,g);
   T.check(x.status===500&&!retryOther.json.seed&&retry.json.seed&&db.DB.season_seeds.find(r=>r.id===s.json.seed_id).xi_hash===xiH(g),'запис xi_hash упав: повтор тим самим складом отримує seed, інший склад — ні');}
  // remaining attempts burn, then no more
  for(let k=0;k<6;k++){const s=await call({vd:'start',day:TODAY});if(s.status!==200)break;await fin(s.json.attempt,buildXi(0,s.json.seed_id));}
  const s6=await call({vd:'start',day:TODAY});
  T.check(s6.status===409&&s6.json.used===5&&db.DB.vd_results.filter(r=>r.device_id===dev&&r.day===TODAY).length===5&&s6.json.best>=f2.json.score,`5 спроб на день: шостої немає (409), краща ${s6.json.best}/11`);
  T.check(db.DB.season_seeds.filter(s=>s.device_id===dev&&s.vd_day===TODAY).length===5,'у season_seeds рівно 5 спроб');
  // archive: yesterday is late
  const y1=await call({vd:'start',day:YDAY});const yf=await fin(y1.json.attempt,buildXi(2,y1.json.seed_id),{day:YDAY});
  T.check(yf.json.late===true&&db.DB.vd_results.find(r=>r.device_id===dev&&r.day===YDAY).late===true,'архів: спроба за вчора позначена late (не в серію)');
  const mine=await call({vd:'mine'});
  T.check(mine.status===200&&mine.json.days.find(d=>d.day===TODAY).attempts===5,'свої результати для архіву (vd_mine)');
  // older 0.79.2 tab: daily draft season still verified by the same engine
  const D=E.dailySetupFor(TODAY),dv=crypto.randomUUID();E.setFormat('classic');const dxi=[],u=new Set();
  for(const slot of E.FORMATIONS[D.formation].slots){let pick=null;for(const i of D.seq){const c=E.DATA.clubs[i];for(const p of c.pl){if(u.has(canon(p[5])))continue;const r=E.effRating(p,slot);if(r!=null){pick={c,p,r};break;}}if(pick)break;}
    u.add(canon(pick.p[5]));dxi.push({n:pick.p[0],id:pick.p[5],slot,r:pick.r,r0:pick.p[2],c:pick.c.n,y:pick.c.y});}
  const ds=await callApi(seedH,{device_id:dv,secret,xi:dxi,formation:D.formation,mode:'daily',format:'classic',year:D.year,daily:true});
  const dq=E.run({xi:SX(dxi),mode:'daily',format:'classic',year:D.year,seed:ds.json.seed});
  const dsv=await callApi(saveH,{kind:'season',device_id:dv,secret,row:{mode:'daily',format:'classic',formation:D.formation,year:D.year,seed:ds.json.seed,seed_id:ds.json.seed_id,version:'0.79.2',xi:dxi,day:TODAY,practice:false,w:dq.W,d:dq.D,l:dq.L,pts:dq.pts,place:dq.place,gf:dq.gf,ga:dq.ga,perfect:dq.W===30}});
  T.check(dsv.json.verified===true,'стара вкладка 0.79.2: сезон драфту дня перевірено ('+dsv.json.note+')');
}

// ---- C. site
const DAYS={vd:'2026-10-12',none:'2030-01-01'};
async function page(b,o={}){const ctx=await b.newContext({viewport:o.vp||{width:390,height:844},colorScheme:o.th||'dark'});
  await fastReel(ctx);
  await ctx.route(u=>!u.href.startsWith('file:'),r=>r.abort());
  await ctx.addInitScript(([d,th,ls])=>{window.__vdToday=d;if(!sessionStorage.getItem('init')){sessionStorage.setItem('init',1);localStorage.setItem('upl30_theme',th);for(const [k,v] of Object.entries(ls||{}))localStorage.setItem(k,JSON.stringify(v));}},[o.day||DAYS.vd,o.th||'dark',o.ls||{}]);
  const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('dialog',d=>d.accept());
  await pg.goto('file://'+path.join(ROOT,'index.html'));await pg.waitForTimeout(700);return {ctx,pg,errs};}
const secOf=pg=>pg.evaluate(()=>[...document.querySelectorAll('.wrap>section')].filter(s=>!s.hidden).map(s=>s.id).join());
// draft to 11 picking the first player; avoid: never take Shakhtar (condition fails); prefer: take Shakhtar seasons first
async function draft(pg,mode){for(let i=0;i<11;i++){if(await pg.evaluate(()=>window.__dbg.S.slots.every(s=>s.player)))break;
    await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});
    // avoid: first listed player who never played for Shakhtar (other club-seasons if none); prefer: Shakhtar seasons for the first picks
    const id=await pg.evaluate(([m,i])=>{const D=window.__dbg,S=D.S,ix=D.vdIdx(),A=D.DATA.alias||{},sh=id=>!!(ix[A[id]||id]||{clubs:{}}).clubs['shakhtar-donetsk'];
      const ids=()=>[...document.querySelectorAll('#squad .pl:not([disabled])')].map(b=>b.dataset.id);
      if(m==='prefer'&&i<3){S.wheel=D.DATA.clubs.find(c=>c.c==='shakhtar-donetsk'&&c.y===2010+i);D.renderWheel();}
      if(m!=='avoid')return ids()[0];
      for(const c of [S.wheel,...D.DATA.clubs.filter(c=>c.c==='vorskla-poltava')]){if(c!==S.wheel){S.wheel=c;D.renderWheel();}const x=ids().find(id=>!sh(id));if(x)return x;}},[mode,i]);
    const btn=await pg.$(`#squad .pl[data-id="${id}"]`);await btn.click();await pg.waitForTimeout(70);const pick=await pg.$('#pitch .slot.target');if(pick){await pick.click();await pg.waitForTimeout(50);}}
  await pg.waitForSelector('#s11:not([hidden]),#simBtn:not([hidden])');}   // squad complete: failure screen or Play season
// failure screen without spins: fill the open slots with players who never played for Shakhtar
async function fillAvoid(pg){await pg.evaluate(()=>{const D=window.__dbg,S=D.S,ix=D.vdIdx(),A=D.DATA.alias||{},sh=id=>!!(ix[A[id]||id]||{clubs:{}}).clubs['shakhtar-donetsk'];
    for(const c of D.DATA.clubs){if(S.slots.every(s=>s.player))break;for(const p of c.pl){if(S.slots.every(s=>s.player))break;S.wheel=c;const o=D.posOpts(p);if(!S.taken.has(A[p[5]]||p[5])&&!sh(p[5])&&o.length)D.place(p,o[0]);}}});
  await pg.waitForSelector('#s11:not([hidden])');}
async function siteChecks(b){
  // home card: new, no challenge, in progress, done
  let o=await page(b);
  const h=await o.pg.evaluate(()=>({card:document.getElementById('vdCard').className,txt:document.getElementById('vdBox').textContent,old:!!document.getElementById('dailyBtn'),
    sec:[...document.querySelectorAll('.sec0')].map(x=>x.textContent).join(),grati:document.querySelector('.btns0>#freeOpen')&&document.querySelector('.btns0>#freeOpen').nextElementSibling.id}));
  T.check(/\bnew\b/.test(h.card)&&/День народження Ілсіньйо/.test(h.txt)&&/Зібрати склад/.test(h.txt)&&!h.old&&h.grati==='vdBox','головна: «Грати», під ним картка виклику (нова), кнопки «Драфт дня» немає');
  T.check(h.sec==='Інші режими,Результати','головна: розділи «Інші режими» і «Результати»');
  await o.pg.screenshot({path:path.join(OUT,'v080_home_new.png')});
  // draft: event player placed, quiet mark only on his circle, brief, no hints in the list
  await o.pg.click('#vdCard');await o.pg.waitForTimeout(600);
  const d=await o.pg.evaluate(()=>{const S=window.__dbg.S;return {n:S.slots.filter(s=>s.player).length,ev:S.slots.filter(s=>s.player&&s.player.ev).map(s=>s.player.name),marks:document.querySelectorAll('#pitch .evg').length,
    brief:document.getElementById('vdBrief').textContent,note:document.querySelectorAll('#vdBrief .rqx .cnote').length,label:document.getElementById('modeLabel').textContent,rr:S.rerolls};});
  T.check(d.n===1&&d.ev.join()==='Ілсіньйо'&&d.marks===1,'гравець події вже на полі, тиха позначка лише на його кружку');
  T.check(/Обовʼязково/.test(d.brief)&&/0\/2/.test(d.brief)&&/Спроба1з5/.test(d.brief.replace(/\s+/g,''))&&/Бразильці/.test(d.brief)&&d.rr===2&&d.note===1&&!/Поки нікого/.test(d.brief),'бриф: умова з лічильником 0/2, підпис «гравець клубу» в блоці умови, без «Поки нікого», бонус, спроба 1 з 5, 2 перекрутки: '+d.brief);
  await o.pg.screenshot({path:path.join(OUT,'v080_draft_phone_dark.png'),fullPage:true});
  await o.pg.click('#spinBtn');await o.pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});
  const list=await o.pg.evaluate(()=>{const sq=document.getElementById('squad');return {txt:sq.textContent,cls:[...new Set([...sq.querySelectorAll('*')].map(e=>e.className).filter(Boolean))]};});
  T.check(!/Умова|Бонус|подія|🎂/.test(list.txt)&&list.cls.every(c=>/^(plrow|plrow in|pl|pos \w+|nm|nick|rt|alts|offhd|plrow off|plrow off in|GK|DF|MF|FW)$/.test(c)),'у списку гравців жодних підказок (як у звичайній грі): '+list.cls.join(' | '));
  await o.ctx.close();
  // leaving the draft keeps the open attempt: picks, wheel pointer, rerolls and the current wheel come back exactly
  o=await page(b);await o.pg.click('#vdCard');await o.pg.waitForTimeout(500);
  for(let i=0;i<2;i++){await o.pg.click('#spinBtn');await o.pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});await (await o.pg.$('#squad .pl:not([disabled])')).click();await o.pg.waitForTimeout(80);const t=await o.pg.$('#pitch .slot.target');if(t)await t.click();await o.pg.waitForTimeout(60);}
  await o.pg.click('#spinBtn');await o.pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});await o.pg.click('#rerollBtn');await o.pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});await o.pg.waitForTimeout(400);
  const snap=()=>o.pg.evaluate(()=>{const S=window.__dbg.S;return JSON.stringify({n:S.slots.map(s=>s.player&&s.player.id),ptr:S.vd.ptr,rr:S.rerolls,w:S.wheel&&S.wheel.c+S.wheel.y,a:S.vd.attempt});});
  const before=await snap();await o.pg.evaluate(()=>window.__dbg.go(1));await o.pg.waitForTimeout(300);await o.pg.click('#vdCard');await o.pg.waitForTimeout(700);const after=await snap();
  T.check(before===after&&JSON.parse(after).rr===1&&JSON.parse(after).n.filter(Boolean).length===3,'вийшов зі збору й повернувся — та сама спроба з тим самим складом, колесом і перекрутками: '+after);
  await o.ctx.close();
  // not counted: avoid Shakhtar
  o=await page(b);await o.pg.click('#vdCard');await o.pg.waitForTimeout(500);await draft(o.pg,'avoid');
  const f=await o.pg.evaluate(()=>({t:document.getElementById('vdFail').textContent,st:JSON.parse(localStorage.getItem('upl30_vd_2026-10-12')),res:window.__dbg.S.result}));
  T.check(await secOf(o.pg)==='s11'&&/Не зараховано/.test(f.t)&&/Бракує ще двох гравців Шахтаря/.test(f.t)&&!/Що далі/.test(f.t)&&/Спроба 2 з 5/.test(f.t)&&!f.res,'умову не виконано: «Не зараховано», чому, без блоку «Що далі», спроба 2 з 5, сезон не грався: '+f.t.slice(0,300));
  T.check(await o.pg.evaluate(()=>document.querySelectorAll('#vdFail .gate .cnote').length===1&&/зіграв за нього хоча б один матч в УПЛ або є в його заявці на сезон.2026\/27/.test(document.querySelector('#vdFail .gate .cnote').textContent)),'«Не зараховано»: підпис «гравець клубу — матч в УПЛ або заявка на сезон» у блоці умови');
  T.check(/Для умови/.test(f.t)&&/Бонус/.test(f.t)&&/Не підійшли/.test(f.t)&&f.st.used===1&&f.st.best===null,'розбір складу: для умови, бонус, не підійшли; спроба записана');
  await o.pg.screenshot({path:path.join(OUT,'v080_fail_phone_dark.png'),fullPage:true});
  // next attempt counts: prefer Shakhtar -> forecast -> season -> result block
  await o.pg.click('#vdAgain');await o.pg.waitForTimeout(500);
  T.check(await o.pg.evaluate(()=>window.__dbg.S.vd.attempt)===2,'кнопка «Спроба 2 з 5» відкриває нову спробу');
  await draft(o.pg,'prefer');await o.pg.waitForSelector('#simBtn:not([hidden])');await o.pg.click('#simBtn');await o.pg.waitForSelector('#skipBtn:visible',{timeout:15000});await o.pg.click('#skipBtn');await o.pg.waitForTimeout(1200);
  const r=await o.pg.evaluate(()=>({t:document.getElementById('vdRes').textContent,h:document.getElementById('vdRes').hidden,sc:window.__dbg.S.result.vd.score,share:window.__dbg.shareTextOf(window.__dbg.S.result,true,true),st:JSON.parse(localStorage.getItem('upl30_vd_2026-10-12'))}));
  T.check(!r.h&&new RegExp(`${r.sc} з 11 гравців`).test(r.t)&&/Виклик зараховано/.test(r.t)&&r.st.best===r.sc&&r.st.used===2,`виклик зараховано: блок над сезоном, ${r.sc}/11, краща спроба збережена`);
  T.check(/Виклик дня/.test(r.share)&&new RegExp(`${r.sc}/11`).test(r.share),'текст для поширення — з виклику дня');
  await o.pg.screenshot({path:path.join(OUT,'v080_result_phone_dark.png'),fullPage:true});
  await o.pg.evaluate(()=>window.__dbg.go(1));await o.pg.waitForTimeout(300);
  T.check(/\bprogress\b/.test(await o.pg.$eval('#vdCard',e=>e.className))&&/краща спроба/.test(await o.pg.textContent('#vdCard')),'головна: у процесі — краща спроба й медаль');
  await o.ctx.close();
  // done: 5 attempts or 11/11 -> timer, card opens the archive; local limit
  o=await page(b,{ls:{'upl30_vd_2026-10-12':{used:5,best:9,tries:[]}}});
  const dn=await o.pg.evaluate(()=>({c:document.getElementById('vdCard').className,t:document.getElementById('vdBox').textContent}));
  T.check(/\bdone\b/.test(dn.c)&&/Новий виклик через \d+ г \d+ хв/.test(dn.t)&&/9\/11/.test(dn.t)&&/Переглянути/.test(dn.t),'головна: виконано — таймер до нового виклику');
  await o.pg.screenshot({path:path.join(OUT,'v080_home_done.png')});
  await o.pg.click('#vdCard');await o.pg.waitForTimeout(500);
  const ar=await o.pg.evaluate(()=>({tiles:[...document.querySelectorAll('#vdArch .tc')].map(t=>t.dataset.day+':'+t.querySelector('.tc-r').textContent),secs:[...document.querySelectorAll('#vdArch .vsec')].map(x=>x.textContent)}));
  T.check(await secOf(o.pg)==='s10'&&ar.tiles.length===4&&/^2026-10-12:9\/11/.test(ar.tiles[0])&&ar.tiles.slice(1).every(t=>/Пропущено/.test(t))&&ar.secs.join()==='Сьогодні,Жовтень 2026','архів: сьогодні вгорі, минулі дні за місяцями («Пропущено»)');
  await o.pg.screenshot({path:path.join(OUT,'v080_archive_phone_dark.png'),fullPage:true});
  await o.pg.click('#vdArch .tc[data-day="2026-10-10"]');await o.pg.waitForTimeout(500);
  const late=await o.pg.evaluate(()=>({late:window.__dbg.S.vd&&window.__dbg.S.vd.late,ev:window.__dbg.S.slots.filter(s=>s.player).map(s=>s.player.name).join(),b:document.getElementById('vdBrief').textContent}));
  T.check(late.late===true&&late.ev==='Браун Ідейє'&&/архів/.test(late.b),'минулий день з архіву: спроба з позначкою «архів» (не в серію)');
  await o.ctx.close();
  // no content today
  o=await page(b,{day:DAYS.none});
  T.check(/Новий виклик скоро/.test(await o.pg.textContent('#vdBox'))&&!(await o.pg.$('#vdCard')),'день без виклику: «Новий виклик скоро», без помилок');
  T.check(!o.errs.length,'без помилок на сторінці: '+o.errs.join(' | '));await o.ctx.close();
  // screenshots: light phone and iPad
  for(const [tag,vp,th] of [['phone_light',{width:390,height:844},'light'],['ipad_dark',{width:1024,height:1366},'dark']]){
    o=await page(b,{vp,th,ls:{'upl30_vd_2026-10-12':{used:1,best:null,tries:[{a:1,g:false,s:2}]}}});
    await o.pg.screenshot({path:path.join(OUT,`v080_home_${tag}.png`)});
    await o.pg.click('#vdCard');await o.pg.waitForTimeout(500);await o.pg.screenshot({path:path.join(OUT,`v080_draft_${tag}.png`)});
    await fillAvoid(o.pg);await o.pg.screenshot({path:path.join(OUT,`v080_fail_${tag}.png`),fullPage:true});
    await o.pg.evaluate(()=>window.__dbg.openVdArchive());await o.pg.waitForTimeout(300);await o.pg.screenshot({path:path.join(OUT,`v080_archive_${tag}.png`),fullPage:true});
    T.check(!o.errs.length,`${tag}: без помилок `+o.errs.join(' | '));await o.ctx.close();}
}
(async()=>{await serverChecks();if(process.env.SRV_ONLY)process.exit(T.done());const b=await launch();try{await siteChecks(b);}finally{await b.close();}process.exit(T.done());})().catch(e=>{console.error(e);process.exit(1);});
