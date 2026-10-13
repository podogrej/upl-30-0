// Traffic sources (0.90.3): first touch from UTM / referrer / direct is kept in upl30_src and sent once per device and event
// (visit, season_start, season_finish) to /api/err {traffic} -> traffic_events (real api/err.js on an in-memory DB). Run: node tools/tests/traffic.js
const path=require('path');const {ROOT,launch,makeDB,callApi,openSite,draftSeason,checker}=require('./_site.js');
process.env.SUPABASE_SERVICE_KEY='svc';
const errH=require(path.join(ROOT,'api','err.js'));
(async()=>{const T=checker('traffic');const b=await launch();
  const db=makeDB({traffic_events:{auto:'id',uq:[['anon_id','event']]},client_errors:{auto:'id'}},{rate_hit:()=>true});global.fetch=db.fetch;
  const api={'/api/err':async req=>{await new Promise(res=>errH({method:'POST',body:req.body,headers:{},query:{}},{status(c){this.c=c;return this;},json(j){res();},end(){res();},setHeader(){}}));return {status:204};}};
  const rows=()=>db.DB.traffic_events.map(r=>`${r.event}:${r.utm_source}/${r.utm_medium}/${r.utm_campaign}/${r.referrer}`);
  // first visit with UTM
  const A=await openSite({b,db,api,query:'?utm_source=Threads&utm_medium=social&utm_campaign=organic'});await A.pg.waitForTimeout(2200);
  const dev=await A.pg.evaluate(()=>JSON.parse(localStorage.getItem('upl30_device')));
  T.check(rows().join()===`visit:threads/social/organic/direct`,'перший візит з UTM записано (мітки в нижньому регістрі): '+rows().join());
  T.check(db.DB.traffic_events.every(r=>r.anon_id===dev),'анонімний id — номер пристрою сайту');
  // same device, new UTM: first touch kept, visit not repeated
  await A.pg.goto('https://upl.test/?utm_source=telegram&utm_medium=social');await A.pg.waitForTimeout(2200);
  T.check(db.DB.traffic_events.length===1&&(await A.pg.evaluate(()=>JSON.parse(localStorage.getItem('upl30_src')).utm_source))==='threads','повторний захід з іншою міткою: джерело не перезаписано, візит не дублюється');
  // season start and finish (free classic)
  await A.pg.click('#freeOpen');await A.pg.evaluate(()=>window.__dbg.setFmt('classic'));await A.pg.click('#startBtn');await draftSeason(A.pg);await A.pg.waitForTimeout(1500);
  const ev=db.DB.traffic_events.map(r=>r.event).sort().join();
  T.check(ev==='season_finish,season_start,visit','старт і завершення сезону записано з тим самим джерелом: '+rows().join(' | '));
  T.check(db.DB.traffic_events.every(r=>r.utm_source==='threads'),'усі події — з першим джерелом');
  // second season: no new rows
  await A.pg.evaluate(()=>document.getElementById('homeBtn').click());await A.pg.click('#freeOpen');await A.pg.click('#startBtn');await draftSeason(A.pg);await A.pg.waitForTimeout(1500);
  T.check(db.DB.traffic_events.length===3,'другий сезон нових рядків не додає (по одному на подію)');
  // no UTM, no referrer: direct
  const B=await openSite({b,db,api});await B.pg.waitForTimeout(2200);
  T.check(db.DB.traffic_events.some(r=>r.event==='visit'&&r.utm_source==null&&r.referrer==='direct'&&r.anon_id!==dev),'без UTM і реферера — direct');
  // Telegram Mini App without UTM (SDK not loaded yet): recognised by the URL fragment
  const C=await openSite({b,db,api,hash:'#tgWebAppData=user%3D1&tgWebAppVersion=7.0'});await C.pg.waitForTimeout(2200);
  const cs=await C.pg.evaluate(()=>JSON.parse(localStorage.getItem('upl30_src')));
  T.check(cs&&cs.utm_source==='telegram_miniapp','Mini App без UTM — telegram_miniapp ('+(cs&&cs.utm_source)+')');
  // a format without a server wheel (anti-season) still counts its start
  const Dp=await openSite({b,db,api});await Dp.pg.waitForTimeout(2200);const dd=await Dp.pg.evaluate(()=>JSON.parse(localStorage.getItem('upl30_device')));
  await Dp.pg.click('#freeOpen');await Dp.pg.evaluate(()=>window.__dbg.setFmt('anti'));await Dp.pg.click('#startBtn');await Dp.pg.waitForTimeout(800);
  T.check(db.DB.traffic_events.some(r=>r.anon_id===dd&&r.event==='season_start'),'антисезон: старт сезону теж записано');
  // server rejects junk: bad id, bad event; strips odd characters
  const before=db.DB.traffic_events.length;
  await api['/api/err']({body:{traffic:{anon_id:'nope',event:'visit'}}});await api['/api/err']({body:{traffic:{anon_id:dev,event:'hack'}}});
  await api['/api/err']({body:{traffic:{anon_id:'11111111-2222-3333-4444-555555555555',event:'visit',utm_source:'<b>X</b> y',referrer:'t.co'}}});
  const last=db.DB.traffic_events[db.DB.traffic_events.length-1];
  T.check(db.DB.traffic_events.length===before+1&&last.utm_source==='bxby'&&last.referrer==='t.co','сервер: чужий id і подія відкинуті, мітки очищено ('+last.utm_source+')');
  T.check(!A.errs.length&&!B.errs.length,'без помилок на сторінці '+A.errs.concat(B.errs).join(' '));
  await b.close();process.exit(T.done());})().catch(e=>{console.error(e);process.exit(1);});
