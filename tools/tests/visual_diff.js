// Screens look like prod: screenshots of the main screens in a fully deterministic page, then a pixel diff against another build.
//   node tools/tests/visual_diff.js shoot <outdir>             screenshots of this checkout (ROOT) -> <outdir>/<screen>_<w>_<theme>.png
//   node tools/tests/visual_diff.js compare <baseDir> <headDir>   diff; changed screens must be listed in tools/tests/visual_expect.json
// CI (.github/workflows/tests.yml, job visual) shoots origin/main and the branch with this same file and compares them.
// Deterministic page: seeded Math.random and crypto, fixed Date, stub DB, fast reel and motion, reduced motion, version text masked.
// Only window.__dbg hooks shared with the base build are used; a screen that cannot be reached is reported as skipped.
const path=require('path'),fs=require('fs');
const ROOT=path.join(__dirname,'..','..');
const OUT=path.join(ROOT,'tools','tests','out','visual');
const SIZES=[[390,844],[1024,1366]],THEMES=['dark','light'];
const PIX_TOL=48;   // per pixel: sum of |dR|+|dG|+|dB|+|dA| above this counts as changed (anti-aliasing stays below)
const AREA_MAX=0.003;   // screen changed when more than 0.3% of its pixels changed
const FIXED_TIME='2026-10-12T09:00:00Z';   // same day as the fixed daily challenge (vdToday in _site.js)
const DEV='aaaaaaaa-0000-4000-a000-000000000001';
const VER_RE=/версі[яї] ([\d.]+)/;   // footer version, same as tools/make_engine.js
const PNG=()=>require(path.join(ROOT,'tools','node_modules','playwright-core','lib','utilsBundle.js')).PNG;   // pngjs bundled with playwright

// ---------- page setup, runs before any game script
function pageInit(seed,now){
  const mb=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
  const r1=mb(seed),r2=mb(seed^0x9e3779b9);
  Math.random=r1;
  const D=Date,T=D.parse(now);   // fixed clock: new Date() and Date.now(); timers keep running
  class FD extends D{constructor(...a){if(a.length)super(...a);else super(T);}static now(){return T;}}
  window.Date=FD;
  // interval registry: lets the live season be stopped at a fixed round without game internals
  const si=window.setInterval,ci=window.clearInterval,reg=new Map();
  window.setInterval=function(fn,ms,...a){const id=si.call(window,fn,ms,...a);reg.set(id,fn);return id;};
  window.clearInterval=function(id){reg.delete(id);return ci.call(window,id);};
  window.__vdIntervals=reg;
  try{const gv=function(a){const b=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);for(let i=0;i<b.length;i++)b[i]=Math.floor(r2()*256);return a;};
    Object.defineProperty(crypto,'getRandomValues',{value:gv,configurable:true});
    Object.defineProperty(crypto,'randomUUID',{value:()=>{const h=[...gv(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;},configurable:true});}catch(e){}
}
// CSS for the screenshot only: no caret, no transient toast (timer driven), header in flow so a full-page shot does not depend on scroll
const SHOT_CSS='*,*::before,*::after{caret-color:transparent!important}#toast{visibility:hidden!important}header.top{position:static!important}';
// version text differs by design between builds: mask the footer version number as "0.0"
const maskVersion=pg=>pg.evaluate(()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
  while((n=w.nextNode()))if(/версі[яї] \d+(\.\d+)+/.test(n.nodeValue))n.nodeValue=n.nodeValue.replace(/(версі[яї]) \d+(\.\d+)+/g,'$1 0.0');});

// ---------- stub data (same for every build)
function stubDb(makeDB){
  const players=[{id:'p-v',name:'vitia',anon_name:'brave_fox',public_id:'vitya234'},{id:'p-me',name:'andrii',anon_name:'silent_owl',public_id:'meplaaaa'},
    {id:'p-o',name:'oleh',anon_name:'calm_owl',public_id:'olehaaaa'}];
  const E=require(path.join(ROOT,'lib','engine.js'));
  const prof=p=>p&&({public_id:p.public_id,name:p.name||p.anon_name,anon:!p.name,since:'2026-09-02T10:00:00Z',seasons:p.id==='p-me'?140:12,champions:3,perfect:0,best_classic:89,win_pct:62,
    best:{},worst:{},fav_club:{c:'Чорноморець (Одеса)',k:30,pct:27},fav_player:{id:'x',n:'Іван Гецко',k:11},trophies:[],streak_best:2,streak_now:1});
  const rpc={player_hello:()=>({id:'p-me',name:'andrii',anon_name:'silent_owl',public_id:'meplaaaa'}),device_ok:()=>'p-me',
    trophy_stats:()=>({players:50,t:{champ:12,top3:25,unbeaten:2}}),
    player_profile:a=>prof(players.find(p=>p.id===a.p_player)),player_profile_pub:a=>prof(players.find(p=>p.public_id===a.p_public)),
    player_numbers:()=>numbers(E)};
  const db=makeDB({seasons:{auto:'id'},season_seeds:{auto:'id'},daily_results:{auto:'id'},player_links:{},trophies:{pk:['device_id','trophy']}},rpc);db.DB.players=players;
  // leaderboard rows and own history
  const who=['p-v','p-me','p-o'];
  for(let i=0;i<12;i++){const w=26-i,d=Math.min(4,30-w),l=30-w-d;
    db.DB.seasons.push({id:100+i,device_id:i%3===1?DEV:'dev-'+i,player_id:who[i%3],nickname:null,competition:'upl',mode:'normal',format:'classic',formation:['4-4-2','4-3-3','3-5-2'][i%3],
      w,d,l,pts:w*3+d,place:1+Math.floor(i/4),gf:80-i*2,ga:12+i,gd:68-i*3,xp:60,golden:false,practice:false,verified:true,show_r:false,fl_id:null,club:null,day:null,year:2000+i,
      created_at:`2026-10-${String(1+i).padStart(2,'0')}T10:00:00Z`,xi:[{n:'Сергій Ребров',id:'x1',slot:'ST',r:95,c:'Динамо (Київ)',y:1997,f:2,g:26,a:5,rt:7.9}]});}
  return db;}
// "Your numbers" RPC answer built from the pool (like tools/tests/numbers.js): 4-4-2, one player per slot
function numbers(E){
  const slots=E.FORMATIONS['4-4-2'].slots,used=new Set(),ids=[],pl={};
  for(const sl of slots){let got=null;for(const c of E.DATA.clubs){for(const p of c.pl)if(p[6]===sl&&!used.has(p[5])&&p[2]>=80){got={p,c};break;}if(got)break;}
    used.add(got.p[5]);ids.push(got.p[5]);pl[got.p[5]]={n:got.p[0],k:20+ids.length*3,g:ids.length*7,r0:got.p[2],slot:sl,c:got.c.n,ka:15+ids.length*3,wa:300+ids.length*40};}
  const xi=ids.map((id,i)=>({i,id,k:20+i*3}));
  const names=[...new Set(E.DATA.clubs.flatMap(c=>c.pl.map(p=>p[0])))];const clubs=[...new Set(E.DATA.clubs.map(c=>c.n))].slice(0,38);
  return {n:140,na:128,w:2400,d:700,l:740,pts:7900,gf:7100,best:89,fm:{f:'4-4-2',k:85},xi,pl,top:{g:ids[10],k:ids[2],dog:ids[5]},uniq:640,once:326,once_n:names.slice(0,300),
    xin:1540,avg:82.4,dog:400,rn:1540,cl_n:clubs.length,cl:clubs.map((c,i)=>({c,k:Math.max(4,Math.round(480/(i+1)))})),
    modes:[{b:'classic',k:98,pts:5940},{b:'daily',k:22,pts:2120},{b:'anti',k:12,pts:610}],off_n:0,rej:null};}

// ---------- shoot
async function shoot(dir){
  const {launch,makeDB,openSite}=require('./_site.js');
  fs.mkdirSync(dir,{recursive:true});for(const f of fs.readdirSync(dir))if(f.endsWith('.png'))fs.unlinkSync(path.join(dir,f));
  const t0=Date.now(),B=await launch(),report={saved:[],skipped:[],failed:[],unstable:[],errors:[]};
  const tg={initData:'user=x&hash=abc',initDataUnsafe:{user:{id:1,first_name:'Андрій'},start_param:'g-100555'},platform:'android'};
  const nm=['Олег','Марко','Саша','Дмитро','Іра','Петро','Сергій','Таня'];
  const api={'/api/auth':async()=>({json:{token_hash:'TH'}}),
    '/api/league':async req=>req.method==='POST'?{json:{ok:true,joined:[],posted:[]}}:{json:{title:'Футбол по середах',day:'2026-10-11',today:nm.map((x,i)=>({name:x,w:20-i,d:5,l:5+i,pts:70-3*i,gf:50,ga:30})),members:30,standings:nm.map((x,i)=>({name:x,wins:9-i,days:9,pts:300}))}}};
  async function run([w,h],theme){
    const db=stubDb(makeDB),tag=`${w}_${theme}`;
    const init=`(${pageInit})(${0x5eed},'${FIXED_TIME}');localStorage.setItem('upl30_device','"${DEV}"');localStorage.setItem('upl30_dsecret','"${'5'.repeat(48)}"');localStorage.setItem('upl30_news_seen','"9.99"');localStorage.setItem('upl30_theme','${theme}');`;
    const open=extra=>openSite({b:B,db,api,init,viewport:{width:w,height:h},colorScheme:theme,reducedMotion:'reduce',wait:1500,...extra});
    const settle=async pg=>{await pg.waitForLoadState('networkidle').catch(()=>{});
      await pg.evaluate(()=>document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
      await pg.waitForFunction(()=>![...document.querySelectorAll('.sk')].some(e=>e.offsetParent),null,{timeout:4000}).catch(()=>{});
      await pg.waitForTimeout(250);};
    // screenshot until two in a row are identical (waits out late renders; never loosens the diff)
    const snap=async(pg,name)=>{await settle(pg);await pg.evaluate(()=>window.scrollTo(0,0));await maskVersion(pg);const file=path.join(dir,`${name}_${tag}.png`);let prev=null,buf=null;
      for(let i=0;i<8;i++){buf=await pg.screenshot({fullPage:true,animations:'disabled',caret:'hide',style:SHOT_CSS});if(prev&&prev.equals(buf))break;prev=buf;await pg.waitForTimeout(300);await maskVersion(pg);}
      if(!prev||!prev.equals(buf))report.unstable.push(`${name}_${tag}`);
      fs.writeFileSync(file,buf);report.saved.push(`${name}_${tag}`);};
    // one screen: a missing hook or element in this build means skipped, not failed
    const step=async(pg,name,fn)=>{try{if(await fn()===false){report.skipped.push(`${name}_${tag}`);return;}await snap(pg,name);}
      catch(e){report.failed.push(`${name}_${tag}: ${String(e.message).split('\n')[0].slice(0,120)}`);}};   // an error is a failure: a silent skip would hide the screen from compare
    const has=(pg,k)=>pg.evaluate(k=>!!(window.__dbg&&window.__dbg[k]),k);
    const back=pg=>pg.evaluate(()=>{const c=document.getElementById('viewClose');if(c&&c.offsetParent)c.click();document.getElementById('homeBtn').click();}).then(()=>pg.waitForTimeout(250));
    const click=(pg,sel)=>pg.click(sel,{timeout:3000});
    {const {pg,errs,ctx}=await open();
     await step(pg,'home',async()=>{});
     await step(pg,'faq',async()=>{await pg.evaluate(()=>{document.getElementById('faqBox').open=true;document.querySelectorAll('.faq0 details').forEach(d=>d.open=true);});});
     await pg.evaluate(()=>{const f=document.getElementById('faqBox');if(f)f.open=false;window.scrollTo(0,0);});
     await step(pg,'news',async()=>{await click(pg,'#newsBtn');});await back(pg);
     await step(pg,'trophies',async()=>{if(!await has(pg,'openTrophies'))return false;await pg.evaluate(()=>window.__dbg.openTrophies());});await back(pg);await back(pg);
     await step(pg,'player_own',async()=>{await click(pg,'#acctBtn');await pg.waitForSelector('#nmSec .nm-verdict',{timeout:5000});});await back(pg);
     await step(pg,'tables_all',async()=>{if(!await has(pg,'openTables'))return false;await pg.evaluate(()=>window.__dbg.openTables('all'));await pg.waitForSelector('#boardBody table, #boardBody .muted',{timeout:5000});});await back(pg);
     await step(pg,'oneclub',async()=>{if(!await has(pg,'openOc'))return false;await pg.evaluate(()=>window.__dbg.openOc());});
     await step(pg,'oneclub_setup',async()=>{await click(pg,'#ocGrid .oct[data-c="karpaty-lviv"]');});await back(pg);
     await step(pg,'five',async()=>{if(!await has(pg,'go'))return false;await pg.evaluate(()=>window.__dbg.go(5));});await back(pg);
     await step(pg,'friends',async()=>{await click(pg,'#flOpen');});await back(pg);
     await step(pg,'setup',async()=>{await click(pg,'#freeOpen');if(await has(pg,'setFmt'))await pg.evaluate(()=>window.__dbg.setFmt('classic'));});
     // the wheel list after the first spin (a stray .nm rule doubled its rows in 0.85)
     await step(pg,'draft',async()=>{await click(pg,'#startBtn');await click(pg,'#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});});
     await step(pg,'draft_done',async()=>{for(let i=0;i<11;i++){if(await pg.evaluate(()=>window.__dbg.S.slots.every(s=>s.player)))break;
         if(i>0||!(await pg.$('#squad .pl:not([disabled])'))){await click(pg,'#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});}
         await (await pg.$('#squad .pl:not([disabled])')).click();await pg.waitForTimeout(80);const t=await pg.$('#pitch .slot.target');if(t){await t.click();await pg.waitForTimeout(60);}}
       await pg.waitForSelector('#simBtn:not([hidden])',{timeout:5000});await pg.waitForTimeout(600);});   // forecast runs on its own
     // live season frozen at round 15: the interval is stopped and rounds are stepped by hand
     await step(pg,'live',async()=>{const before=await pg.evaluate(()=>window.__vdIntervals?[...window.__vdIntervals.keys()]:null);if(!before)return false;
       await click(pg,'#simBtn');await pg.waitForSelector('#skipBtn:visible',{timeout:15000});
       return await pg.evaluate(old=>{const R=window.__vdIntervals,rd=()=>(document.getElementById('lvRound')||{}).textContent||'';
         for(const [id,fn] of [...R])if(!old.includes(id)){const was=rd();clearInterval(id);fn();if(rd()===was)continue;   // the round ticker label changes
           for(let i=0;i<40&&!/Тур 15\b/.test(rd());i++)fn();return /Тур 15\b/.test(rd());}
         return false;},before);});
     await step(pg,'result',async()=>{await click(pg,'#skipBtn');await pg.waitForSelector('#final:not([hidden])',{timeout:8000});await pg.waitForTimeout(1500);});
     if(errs.length)report.errors.push(`${tag}: `+errs.join(' | '));await ctx.close();}
    {const {pg,errs,ctx}=await open({query:'?u=vitya234'});
     await step(pg,'player_other',async()=>{await pg.waitForSelector('#s6:not([hidden]) #ppName',{timeout:5000});});
     if(errs.length)report.errors.push(`${tag} ?u=: `+errs.join(' | '));await ctx.close();}
    {const {pg,errs,ctx}=await open({tg,hash:'#tgWebAppData=x'});
     await step(pg,'tables_chats',async()=>{if(!await has(pg,'openTables'))return false;await pg.evaluate(()=>window.__dbg.openTables('chats'));await pg.waitForTimeout(500);});
     if(errs.length)report.errors.push(`${tag} Telegram: `+errs.join(' | '));await ctx.close();}}
  // sizes and themes in parallel: each has its own context and stub DB
  await Promise.all(SIZES.flatMap(s=>THEMES.map(t=>run(s,t))));
  await B.close();
  const sec=((Date.now()-t0)/1000).toFixed(0);
  console.log(`знімки: ${report.saved.length} у ${path.relative(process.cwd(),dir)||dir} за ${sec} с`);
  for(const s of report.skipped)console.log('· пропущено',s);
  for(const s of report.unstable)console.log('✗ нестабільний знімок',s);
  for(const s of report.failed)console.log('✗ не вдалося зняти',s);
  for(const s of report.errors)console.log('✗ помилки на сторінці',s);
  fs.writeFileSync(path.join(dir,'shoot.json'),JSON.stringify({version:version(),sec:+sec,...report},null,1));
  return report.unstable.length||report.failed.length||!report.saved.length?1:0;}

// ---------- compare
function version(){return (fs.readFileSync(path.join(ROOT,'src','template.html'),'utf8').match(VER_RE)||[])[1]||'?';}
function expected(){const f=path.join(ROOT,'tools','tests','visual_expect.json');let j={};try{j=JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){}
  const v=version();return {v,jv:j.version||'-',list:j.version===v&&Array.isArray(j.screens)?j.screens:[]};}
function diff(a,b){
  if(a.width!==b.width||a.height!==b.height)return {px:-1,ratio:1,size:`${a.width}×${a.height} → ${b.width}×${b.height}`};
  let px=0;const A=a.data,B=b.data;
  for(let i=0;i<A.length;i+=4){const d=Math.abs(A[i]-B[i])+Math.abs(A[i+1]-B[i+1])+Math.abs(A[i+2]-B[i+2])+Math.abs(A[i+3]-B[i+3]);if(d>PIX_TOL)px++;}
  return {px,ratio:px/(a.width*a.height)};}
// before | after, changed pixels of "after" tinted red
function sideBySide(a,b,file){const P=PNG(),G=16,W=a.width+G+b.width,H=Math.max(a.height,b.height),o=new P({width:W,height:H});o.data.fill(128);
  const put=(img,x0,other)=>{for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){const i=(y*img.width+x)*4,j=(y*W+x0+x)*4;let r=img.data[i],g=img.data[i+1],bl=img.data[i+2];
    if(other){const k=(y*other.width+x)*4;const same=x<other.width&&y<other.height&&Math.abs(r-other.data[k])+Math.abs(g-other.data[k+1])+Math.abs(bl-other.data[k+2])<=PIX_TOL;if(!same){r=255;g=g>>1;bl=bl>>1;}}
    o.data[j]=r;o.data[j+1]=g;o.data[j+2]=bl;o.data[j+3]=255;}};
  put(a,0,null);put(b,a.width+G,a.width===b.width&&a.height===b.height?a:null);fs.writeFileSync(file,P.sync.write(o));}   // different size: plain side by side
function compare(baseDir,headDir){
  const {checker}=require('./_site.js');const T=checker('екрани як на проді');const P=PNG();
  fs.rmSync(OUT,{recursive:true,force:true});fs.mkdirSync(OUT,{recursive:true});
  const exp=expected(),png=f=>f.endsWith('.png');
  const base=new Set(fs.readdirSync(baseDir).filter(png)),head=new Set(fs.readdirSync(headDir).filter(png));
  console.log(`версія ${exp.v}; visual_expect.json: ${exp.jv===exp.v?`очікувані зміни: ${exp.list.join(', ')||'жодних'}`:`версія ${exp.jv} ≠ ${exp.v}, список не діє`}`);
  const screen=f=>f.replace(/_\d+_(dark|light)\.png$/,'');const rep=[],by={};
  for(const f of [...head].sort()){const s=screen(f);by[s]=by[s]||{n:0,ch:[]};
    if(!base.has(f)){rep.push(`new     ${f} (no base screenshot)`);by[s].ch.push(f.slice(s.length+1,-4)+' без бази');continue;}   // unseen in base: allowed only via visual_expect.json
    const a=P.sync.read(fs.readFileSync(path.join(baseDir,f))),b=P.sync.read(fs.readFileSync(path.join(headDir,f))),d=diff(a,b);by[s].n++;
    const ch=d.ratio>AREA_MAX,what=d.size?'розмір '+d.size:(100*d.ratio).toFixed(2)+'%';rep.push(`${ch?'CHANGED':'same   '} ${f} ${d.size||`${d.px} px (${(100*d.ratio).toFixed(3)}%)`}`);
    if(ch){by[s].ch.push(f.slice(s.length+1,-4)+' '+what);sideBySide(a,b,path.join(OUT,f.replace(/\.png$/,'_before_after.png')));}}
  const changed=new Set(Object.keys(by).filter(s=>by[s].ch.length));
  for(const s of Object.keys(by).sort()){const c=by[s].ch,ok=!c.length||exp.list.includes(s);
    T.check(ok,`${s}: ${c.length?`змінено (${c.join('; ')})${ok?' — очікувано':' — немає в visual_expect.json'}`:`без змін (${by[s].n} знімків)`}`);}
  const gone=[...base].filter(f=>!head.has(f));
  for(const f of gone){rep.push(`missing ${f}`);T.check(false,`${f}: знімок є в базі, але не вийшов у цій версії`);}
  T.check(head.size>0&&base.size>0,`знімків: база ${base.size}, ця версія ${head.size}`);
  for(const s of exp.list)if(!changed.has(s))console.log(`· ${s}: у visual_expect.json, але не змінився`);
  fs.writeFileSync(path.join(OUT,'report.txt'),`version ${exp.v}, expected: ${exp.list.join(', ')||'none'}\nchanged screens: ${[...changed].join(', ')||'none'}\n\n${rep.join('\n')}\n`);
  return T.done();}

const [mode,a1,a2]=process.argv.slice(2);
if(mode==='shoot'&&a1)shoot(path.resolve(a1)).then(c=>process.exit(c),e=>{console.error(e);process.exit(2);});
else if(mode==='compare'&&a1&&a2)process.exit(compare(path.resolve(a1),path.resolve(a2)));
else{console.log('usage: node tools/tests/visual_diff.js shoot <outdir> | compare <baseDir> <headDir>');process.exit(2);}
