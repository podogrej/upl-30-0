// Offline "online-like" site: index.html served from https://upl.test/, Supabase REST backed by an in-memory DB,
// /api/* routed to test handlers (may be the real api/ handlers, whose fetch hits the same DB). No other requests leave.
const path=require('path'),fs=require('fs');const {ROOT,launch}=require('./_page.js');
const SITE='https://upl.test/',SB_HOST='qruhcbwycrnfgzzdbljr.supabase.co';
const CORS={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS'};
// supabase-js stub: no session; verifyOtp signs in as opts.user
const SB_STUB=(user,signed)=>`window.supabase={createClient(){let cb=()=>{};return {auth:{onAuthStateChange(f){cb=f;},async getSession(){return {data:{session:${signed?'{access_token:\'AT\',user:'+JSON.stringify(user||{id:'u1',email:'g1@example.com',user_metadata:{full_name:'Андрій'},app_metadata:{provider:'google'}})+'}':'null'}}};},
  async verifyOtp(){setTimeout(()=>cb('SIGNED_IN',{access_token:'AT',user:${JSON.stringify(user||{id:'u1',email:'tg-1@users.upl-30-0.vercel.app',user_metadata:{full_name:'Андрій'},app_metadata:{}})}}),20);return {error:null};},
  async signOut(){cb('SIGNED_OUT',null);},async signInWithOAuth(){return {error:null};},async setSession(){return {error:null};}}};}};`;
// In-memory PostgREST. cfg[table]={pk:[...], uq:[[...]], auto:'id', def:{...}, cols:[...] (unknown columns -> 400), onInsert(row)};
// rpc[name]=(args)=>response; select=...players(name,anon_name[,public_id]) joins the players table when present
function makeDB(cfg={},rpc={}){
  const DB={};let seq=0;for(const t of Object.keys(cfg))DB[t]=[];
  const val=v=>v==='null'?null:v==='true'?true:v==='false'?false:v;
  const test=(r,k,v)=>{const i=v.indexOf('.'),op=v.slice(0,i),x=v.slice(i+1),a=r[k];
    if(op==='eq')return String(a)===x;if(op==='neq')return String(a)!==x;if(op==='is')return a==null?x==='null':a===val(x);
    if(op==='in')return x.replace(/^\(|\)$/g,'').split(',').includes(String(a));const c=isNaN(+x)?String(a==null?'':a).localeCompare(x):a-(+x);   // dates (created_at=gte.2026-...) compare as ISO strings
    if(op==='gt')return c>0;if(op==='gte')return c>=0;if(op==='lt')return c<0;if(op==='lte')return c<=0;return true;};
  const SKIP=new Set(['select','order','limit','offset','apikey','on_conflict']);
  const where=u=>[...u.searchParams].filter(([k])=>!SKIP.has(k));
  const out=(status,j)=>({status,body:j==null?'':JSON.stringify(j)});
  function handle(method,url,body,headers={}){
    const u=new URL(url);const parts=u.pathname.split('/');const t=parts.pop();const prefer=String(headers.prefer||headers.Prefer||'');
    if(parts.pop()==='rpc'){const f=rpc[t];if(!f)return out(404,{message:'no rpc '+t});const r=f(body?JSON.parse(body):{},headers);return r&&r.status?r:out(200,r==null?{}:r);}
    if(!DB[t])return method==='GET'?out(200,[]):out(201,null);
    const C=cfg[t]||{},f=where(u),match=r=>f.every(([k,v])=>test(r,k,v));
    const bad=k=>C.cols&&!C.cols.includes(k)&&k!=='id'&&k!=='created_at';
    const sel=u.searchParams.get('select')||'';const ord=(u.searchParams.get('order')||'').split(',').filter(Boolean).map(x=>x.split('.')[0]);
    if(method==='GET'){const miss=[...f.map(([k])=>k),...ord,...sel.split(',').filter(x=>x&&x!=='*'&&!x.includes('('))].find(bad);
      if(miss)return out(400,{code:'42703',message:`column ${t}.${miss} does not exist`});
      if(/players\(/.test(sel)&&!DB.players)return out(400,{code:'PGRST200',message:`Could not find a relationship between '${t}' and 'players' in the schema cache`});
      let rows=DB[t].filter(match);
      if(/players\(/.test(sel))rows=rows.map(r=>{const p=DB.players.find(x=>x.id===r.player_id);return {...r,players:p?{name:p.name,anon_name:p.anon_name,public_id:p.public_id}:null};});const o=u.searchParams.get('order');
      if(o)for(const p of o.split(',').reverse()){const [c,d]=p.split('.');rows=[...rows].sort((a,b)=>(a[c]>b[c]?1:a[c]<b[c]?-1:0)*(d==='desc'?-1:1));}
      const off=u.searchParams.get('offset');if(off)rows=rows.slice(+off);const lim=u.searchParams.get('limit');if(lim)rows=rows.slice(0,+lim);return out(200,rows);}
    if(method==='POST'){const list=[].concat(JSON.parse(body));const res=[];
      for(const row0 of list){const miss=Object.keys(row0).find(bad);if(miss)return out(400,{code:'PGRST204',message:`Could not find the '${miss}' column of '${t}' in the schema cache`});
        const row={...(C.def||{}),...row0};if(C.onInsert)C.onInsert(row,headers);if(C.auto&&row[C.auto]==null)row[C.auto]=++seq;row.created_at=row.created_at||new Date().toISOString();
        const oc=u.searchParams.get('on_conflict');
        if(oc&&/merge-duplicates/.test(prefer)){const ks=oc.split(',');const old=DB[t].find(x=>ks.every(k=>String(x[k])===String(row[k])));if(old){Object.assign(old,row0);res.push(old);continue;}}
        const dup=[C.pk,...(C.uq||[])].filter(Boolean).find(ks=>DB[t].some(x=>ks.every(k=>String(x[k])===String(row[k]))));
        if(dup&&/ignore-duplicates/.test(prefer))continue;
        if(dup)return out(409,{code:'23505',message:`duplicate key value violates unique constraint "${t}_${dup.join('_')}_key"`});
        DB[t].push(row);res.push(row);}
      return /return=representation/.test(prefer)?out(201,res):out(201,null);}
    if(method==='PATCH'){const b=JSON.parse(body);const rows=DB[t].filter(match);rows.forEach(r=>Object.assign(r,b));return /return=representation/.test(prefer)?out(200,rows):out(204,null);}
    if(method==='DELETE'){DB[t]=DB[t].filter(r=>!match(r));return out(204,null);}
    return out(405,null);}
  // fetch for api/ handlers running in node
  const fetch=async(url,o={})=>{const r=handle(o.method||'GET',url,o.body,o.headers||{});return {ok:r.status<300,status:r.status,text:async()=>r.body,json:async()=>r.body?JSON.parse(r.body):null};};
  return {DB,handle,fetch};}
// invoke a Vercel handler (api/*.js) without a server
const callApi=(h,body,method='POST',query={})=>new Promise(res=>{h({method,body,query,headers:{}},{status(c){this.c=c;return this;},json(j){res({status:this.c||200,json:j});},send(j){res({status:this.c||200,json:j});},setHeader(){},end(){res({status:this.c||200,json:null});}});});
// open the page. opts: {b, query:'?c=..', hash, init:'JS run before load', db, api:{'/api/x':async(req)=>({status,json})}, tg:{...WebApp}, user, route:(r,url)=>bool, viewport}
async function openSite(opts={}){
  const b=opts.b||await launch();const ctx=await b.newContext({viewport:opts.viewport||{width:390,height:844},colorScheme:opts.colorScheme||'dark'});
  const html=fs.readFileSync(path.join(ROOT,'index.html'));const log=[];
  await ctx.route(()=>true,async r=>{const req=r.request(),u=new URL(req.url()),m=req.method();
    try{
      if(opts.route&&await opts.route(r,u))return;
      if(u.host==='upl.test'){
        if(u.pathname==='/'||u.pathname==='/index.html')return r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});
        if(/^\/fonts\/[\w-]+\.otf$/.test(u.pathname))return r.fulfill({status:200,contentType:'font/otf',body:fs.readFileSync(path.join(ROOT,u.pathname.slice(1)))});   // KyivType Sans font
        if(/^\/pool\.\w+\.js$/.test(u.pathname))return r.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:fs.readFileSync(path.join(ROOT,u.pathname.slice(1)))});   // player pool is a separate file
        const h=opts.api&&opts.api[u.pathname];log.push(m+' '+u.pathname);
        if(h){const x=await h({method:m,url:u,body:req.postData()?JSON.parse(req.postData()):null});return r.fulfill({status:x.status||200,contentType:'application/json',body:JSON.stringify(x.json==null?{}:x.json)});}
        return r.fulfill({status:404,contentType:'application/json',body:'{"error":"not found"}'});}
      if(u.host===SB_HOST){if(m==='OPTIONS')return r.fulfill({status:204,headers:CORS});
        if(!opts.db)return r.abort();log.push(m+' '+u.pathname);const x=opts.db.handle(m,u.href,req.postData(),req.headers());
        return r.fulfill({status:x.status,headers:{...CORS,'content-type':'application/json'},body:x.body});}
      if(u.host==='cdn.jsdelivr.net'&&/supabase/.test(u.pathname))return r.fulfill({contentType:'application/javascript',body:SB_STUB(opts.user,opts.signed)});   // signed: already logged in
      if(u.host==='telegram.org'&&opts.tg)return r.fulfill({contentType:'application/javascript',body:`window.Telegram={WebApp:Object.assign({ready(){},expand(){},openTelegramLink(u){(window.__tgLinks=window.__tgLinks||[]).push(u);},onEvent(){},isVersionAtLeast(){return false;},disableVerticalSwipes(){window.__noSwipe=1;}},${JSON.stringify(opts.tg)})};`});
      if(/fonts\.(googleapis|gstatic)\.com/.test(u.host))return r.continue();
      return r.abort();
    }catch(e){console.log('route error',u.href,e.message);return r.abort();}});
  if(opts.init)await ctx.addInitScript(opts.init);   // e.g. seed localStorage before the game loads
  const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('dialog',d=>/Склад не збережеться/.test(d.message())?d.accept():d.dismiss());   // auto-accept the leave-unfinished-draft confirm
  await pg.goto(SITE+(opts.query||'')+(opts.hash||''));await pg.waitForTimeout(opts.wait||1000);
  return {b,ctx,pg,errs,log};}
// draft 11 players (first available player, first highlighted slot) and skip the season animation; onSpin runs after each spin
async function draftSeason(pg,onSpin){
  for(let i=0;i<11;i++){await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});
    if(onSpin)await onSpin(i);
    const btn=await pg.$('.pl:not([disabled])');await btn.click();await pg.waitForTimeout(80);const pick=await pg.$('#pitch .slot.target');if(pick){await pick.click();await pg.waitForTimeout(60);}}
  await pg.waitForSelector('#simBtn:not([hidden])');await pg.click('#simBtn');await pg.waitForSelector('#skipBtn:visible',{timeout:15000});await pg.click('#skipBtn');await pg.waitForTimeout(500);}
// checks with a summary line
function checker(name){const fail=[];let n=0;
  return {check(ok,msg){n++;if(!ok){fail.push(msg);console.log('✗',msg);}else console.log('✓',msg);},
    done(extra){console.log(fail.length?`${name}: ПРОБЛЕМИ ${fail.length}/${n}`:`${name}: УСЕ ГАРАЗД (${n} перевірок)`);return fail.length?1:0;}};}
module.exports={ROOT,SITE,launch,makeDB,callApi,openSite,draftSeason,checker};
