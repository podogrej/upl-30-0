// Line spacing guard: every visible text element (wrapped or stacked single lines) must have line-height / font-size <= 1.36,
// except long reading text (FAQ answers, news, one-club notes, text fields). Screens: phone 390 and iPad 1024.
// LH_SHOTS=<prefix> also saves screenshots to tools/tests/out/lh_<prefix>_<width>_<screen>.png.
// Run from repo root: node tools/tests/line_height.js
const path=require('path'),fs=require('fs');const {ROOT,launch,makeDB,openSite,checker}=require('./_site.js');
const OUT=path.join(ROOT,'tools','tests','out');fs.mkdirSync(OUT,{recursive:true});
const MAX=1.36,READING='.faq0, .news, #oc details, textarea, input';
const DEV='aaaaaaaa-0000-4000-a000-000000000001';
// runs in the page: wrapped text elements with their line-height ratio
function scan(arg){const {MAX,READING}=arg;const out=[],pc={};
  // 'normal' depends on the font: measure it with a probe span of the same font
  const probe=cs=>{const k=cs.fontFamily+cs.fontSize+cs.fontWeight;if(!(k in pc)){const sp=document.createElement('span');sp.textContent='Хйрд';sp.style.cssText=`position:absolute;visibility:hidden;line-height:normal;font:${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;document.body.appendChild(sp);pc[k]=sp.offsetHeight/parseFloat(cs.fontSize);sp.remove();}return pc[k];};
  const vis=e=>{const r=e.getBoundingClientRect();if(r.width<2||r.height<2)return false;for(let n=e;n&&n!==document.body;n=n.parentElement){const c=getComputedStyle(n);if(c.display==='none'||c.visibility==='hidden'||c.opacity==='0')return false;}return true;};
  for(const e of document.body.querySelectorAll('*')){
    if(/^(SCRIPT|STYLE|OPTION)$/i.test(e.tagName)||e.closest('svg'))continue;
    const tn=[...e.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim());if(!tn.length||!vis(e))continue;
    const tops=new Set();for(const n of tn){const r=document.createRange();r.selectNodeContents(n);for(const q of r.getClientRects())if(q.width>1)tops.add(Math.round(q.top/3));}
    // single-line elements count too: stacked lines (title, caption, hint) show the same big gap
    const cs=getComputedStyle(e),fs=parseFloat(cs.fontSize),lh=cs.lineHeight==='normal'?probe(cs):parseFloat(cs.lineHeight)/fs;
    const reading=!!e.closest(READING);
    out.push({tag:e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\s+/).join('.'):''),lh:+lh.toFixed(2),reading,bad:lh>MAX&&!reading,text:e.textContent.trim().slice(0,40)});}
  return out;}
const wait=(p,ms=350)=>p.waitForTimeout(ms);
const tryClick=async(p,sel)=>{try{await p.click(sel,{timeout:2500});return true;}catch(e){return false;}};
let B;   // one browser, a new context per screen
async function run(T,width){
  const shot=process.env.LH_SHOTS,results=[];
  const db=makeDB({seasons:{auto:'id'},trophies:{pk:['device_id','trophy']}},{trophy_stats:()=>({players:40,t:{champ:12,top3:25}}),device_ok:()=>'p-1'});
  db.DB.seasons.push({id:1,device_id:DEV,mode:'normal',format:'classic',w:24,d:6,l:0,pts:78,place:1,gf:70,ga:12,xp:66,golden:false,practice:false,day:null,created_at:'2026-09-28T10:00:00Z',
    xi:[{n:'Сергій Ребров',id:'x1',slot:'ST',r:95,c:'Динамо (Київ)',y:1997,f:2,g:26,a:5,rt:7.9}]});
  const tg={initData:'user=x&hash=abc',initDataUnsafe:{user:{id:1,first_name:'Андрій'},start_param:'g-100555'},colorScheme:'dark',platform:'android'};
  const nm=['Олег','Марко','Саша','Дмитро','Іра','Петро','Сергій','Таня'];
  const api={'/api/auth':async()=>({json:{token_hash:'TH'}}),
    '/api/league':async req=>req.method==='POST'?{json:{ok:true,joined:[],posted:[]}}:{json:{title:'Футбол по середах з дуже довгою назвою чату',day:'2026-09-28',today:nm.map((x,i)=>({name:x,w:20-i,d:5,l:5+i,pts:70-3*i,gf:50,ga:30})),members:30,standings:nm.map((x,i)=>({name:x,wins:9-i,days:9,pts:300}))}}};
  const open=(extra={})=>openSite({b:B,db,api,init:`if(!localStorage.getItem('upl30_device'))localStorage.setItem('upl30_device','"${DEV}"');`,viewport:{width,height:width>600?768:844},wait:1500,...extra});
  const at=async(pg,name)=>{await wait(pg);const r=await pg.evaluate(scan,{MAX,READING});results.push({name,r});
    if(shot)await pg.screenshot({path:path.join(OUT,`lh_${shot}_${width}_${name}.png`)});};
  const back=pg=>pg.evaluate(()=>{const c=document.getElementById('viewClose');if(c&&c.offsetParent)c.click();document.getElementById('homeBtn').click();});
  {const {pg,errs}=await open();
   await at(pg,'home');
   await pg.evaluate(()=>{document.getElementById('faqBox').open=true;document.querySelectorAll('.faq0 details').forEach(d=>d.open=true);});await at(pg,'faq');
   await pg.evaluate(()=>{document.getElementById('faqBox').open=false;});
   if(await tryClick(pg,'#newsBtn')){await at(pg,'news');await back(pg);}
   if(await tryClick(pg,'#fbBtn')){await at(pg,'feedback');await tryClick(pg,'#fbCancel');}
   await pg.evaluate(()=>window.__dbg.openTrophies());await at(pg,'trophies');
   await back(pg);await back(pg);
   await pg.evaluate(()=>document.getElementById('acctBtn').click());await at(pg,'player');
   if(await tryClick(pg,'#ppRowName')){await at(pg,'player_sheet');await pg.evaluate(()=>{const s=document.getElementById('ppSheet');if(s)s.remove();});}
   await back(pg);await pg.evaluate(()=>window.__dbg.openTables('all'));await at(pg,'tables_all');
   await pg.evaluate(()=>window.__dbg.openTables('chats'));await at(pg,'tables_chats_empty');
   await back(pg);await pg.evaluate(()=>window.__dbg.openOc());await at(pg,'oneclub');
   if(await tryClick(pg,'#ocGrid .oct')){await at(pg,'oneclub_setup');}
   await back(pg);await pg.evaluate(()=>window.__dbg.go(5));await at(pg,'five');
   await back(pg);await tryClick(pg,'#flOpen');await at(pg,'friends');
   await back(pg);await tryClick(pg,'#freeOpen');await at(pg,'setup');
   await tryClick(pg,'#startBtn');await tryClick(pg,'#spinBtn');await at(pg,'draft');
   await back(pg);await pg.evaluate(()=>{document.getElementById('freeOpen').click();});await pg.evaluate(()=>window.__dbg.setFmt('classic'));await pg.click('#startBtn');
   for(let i=0;i<11;i++){await pg.click('#spinBtn');await pg.waitForSelector('#squad .pl:not([disabled])',{timeout:8000});
     const btn=await pg.$('.pl:not([disabled])');await btn.click();await pg.waitForTimeout(80);const pick=await pg.$('#pitch .slot.target');if(pick){await pick.click();await pg.waitForTimeout(60);}}
   await pg.waitForSelector('#simBtn:not([hidden])');await at(pg,'draft_done');await pg.click('#simBtn');await pg.waitForSelector('#skipBtn:visible',{timeout:15000});await pg.waitForTimeout(1200);await at(pg,'live');
   await pg.click('#skipBtn');await pg.waitForTimeout(900);await at(pg,'result');
   T.check(!errs.length,`${width}: помилок на сторінці немає `+errs.join(' | '));await pg.context().close();}
  {const {pg,errs}=await open({tg,hash:'#tgWebAppData=x'});
   await pg.evaluate(()=>window.__dbg.openTables('chats'));await wait(pg,800);await at(pg,'tables_chats');
   await back(pg);await at(pg,'home_tg');
   T.check(!errs.length,`${width} Telegram: помилок на сторінці немає `+errs.join(' | '));await pg.context().close();}
  return results;}
(async()=>{const T=checker('інтервал рядків');let seen=0;B=await launch();
  for(const w of [390,1024]){const res=await run(T,w);
    for(const {name,r} of res){seen+=r.length;const bad=r.filter(x=>x.bad);
      T.check(!bad.length,`${w} ${name}: переносів ${r.length}, у читанні ${r.filter(x=>x.reading).length}`+bad.map(x=>`\n    ${x.tag} lh ${x.lh} «${x.text}»`).join(''));}}
  T.check(seen>40,`просканований текст із переносами: ${seen} елементів`);
  await B.close();process.exit(T.done());})();
