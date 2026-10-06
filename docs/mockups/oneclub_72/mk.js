// 0.72 One-club mockups rendered inside the real site (tokens, fonts, header).
const {openSite}=require('/home/user/upl-30-0/tools/tests/_site.js');
const fs=require('fs');const D=__dirname;
const CL=JSON.parse(fs.readFileSync(D+'/clubs.json','utf8'));
// fake progress of one player
const ME={'dynamo-kyiv':{best:86,worst:31,n:7},'shakhtar-donetsk':{best:83,worst:52,n:4},'vorskla-poltava':{best:49,worst:17,n:3},'karpaty-lviv':{best:51,worst:22,n:2},'zorya-luhansk':{best:58,worst:40,n:1},'metalist-kharkiv':{best:71,worst:71,n:1},'oleksandriya':{best:55,worst:30,n:2}};
const CSS=`
.oc{max-width:980px;margin:0 auto}
.oc h1{font:var(--wt-heavy,800) var(--fs-title1)/1.1 var(--font-head,var(--font-body));margin:var(--sp-4) 0 var(--sp-1);letter-spacing:-.01em}
.oc .lead{color:var(--ink2);margin:0 0 var(--sp-3);line-height:var(--lh-body)}
.oc details{background:var(--surface);border-radius:var(--r-lg);box-shadow:var(--sh-1);padding:var(--sp-3) var(--sp-4);margin-bottom:var(--sp-2)}
.oc details summary{font-weight:var(--wt-bold);cursor:pointer}
.oc details p,.oc details li{color:var(--ink2);line-height:var(--lh-body);margin:var(--sp-2) 0 0}
.oc details ul{list-style:none;padding:0;margin:0}
.occ{display:flex;flex-wrap:wrap;gap:var(--sp-2);margin:var(--sp-4) 0 var(--sp-3)}
.occ span{display:inline-flex;align-items:center;gap:var(--sp-1);padding:var(--sp-1) var(--sp-3);border-radius:var(--r-pill);background:var(--surface);box-shadow:var(--sh-1);font-size:var(--fs-footnote);font-weight:var(--wt-bold);font-variant-numeric:tabular-nums}
.occ span.ok{color:var(--amber);box-shadow:inset 0 0 0 1px var(--amber)}
.ocf{display:inline-flex;gap:2px;padding:3px;border-radius:var(--r-md);background:var(--surface);box-shadow:var(--sh-1);margin-bottom:var(--sp-3)}
.ocf button{border:0;background:transparent;color:var(--ink2);font:var(--wt-bold) var(--fs-footnote)/1 var(--font-body);padding:var(--sp-2) var(--sp-3);border-radius:calc(var(--r-md) - 3px)}
.ocf button.on{background:var(--card);color:var(--ink)}
.ocg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sp-2)}
@media(min-width:700px){.ocg{grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sp-3)}}
.oct{position:relative;min-height:84px;border-radius:var(--r-lg);padding:var(--sp-3);display:flex;flex-direction:column;justify-content:flex-end;gap:2px;box-shadow:var(--sh-1);overflow:hidden}
.oct small{font-size:var(--fs-caption2,11px);letter-spacing:var(--ls-caps);text-transform:uppercase;opacity:.75;font-weight:var(--wt-bold)}
.oct b{font-size:var(--fs-callout,16px);line-height:1.15}
.oct .bd{position:absolute;top:var(--sp-2);right:var(--sp-2);display:flex;gap:4px}
.oct .bd i{font-style:normal;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:rgba(0,0,0,.35);font-size:14px}
.oct .done{position:absolute;top:var(--sp-2);right:var(--sp-2);background:var(--amber);color:#1a1200;font-size:var(--fs-caption2,11px);font-weight:var(--wt-heavy,800);letter-spacing:.04em;padding:3px 8px;border-radius:var(--r-pill)}
.oct.cmp{box-shadow:0 0 0 2px var(--amber),var(--sh-2)}
.oct.neutral{background:var(--card);color:var(--ink)}
.och{border-radius:var(--r-xl,22px);padding:var(--sp-5) var(--sp-4);text-align:center;box-shadow:var(--sh-2);margin:var(--sp-3) 0 var(--sp-2)}
.och small{display:block;font-size:var(--fs-caption);letter-spacing:var(--ls-caps);text-transform:uppercase;opacity:.75;font-weight:var(--wt-bold)}
.och h2{margin:var(--sp-1) 0 var(--sp-1);font-size:var(--fs-title2)}
.och p{margin:0;opacity:.85;font-size:var(--fs-footnote);line-height:var(--lh-body)}
.och .pills{display:flex;flex-wrap:wrap;justify-content:center;gap:var(--sp-2);margin:var(--sp-3) 0 var(--sp-1)}
.och .pills span{background:rgba(0,0,0,.28);padding:var(--sp-1) var(--sp-3);border-radius:var(--r-pill);font-weight:var(--wt-bold);font-size:var(--fs-footnote)}
.och .pills span.lt{background:rgba(255,255,255,.18)}
.och hr{border:0;border-top:1px solid currentColor;opacity:.2;margin:var(--sp-3) 0}
.och .ft{font-size:var(--fs-caption);opacity:.75}
.och a{color:inherit;font-weight:var(--wt-bold);font-size:var(--fs-footnote)}
.ocr{background:var(--surface);border-radius:var(--r-lg);box-shadow:var(--sh-2);padding:var(--sp-card);text-align:center}
.ocr .big{font-size:40px;line-height:1}
.ocr h3{margin:var(--sp-2) 0 var(--sp-1);font-size:var(--fs-title3)}
.ocr p{margin:0;color:var(--ink2);line-height:var(--lh-body)}
.lbl72{display:none;position:fixed;left:8px;bottom:8px;z-index:99;background:#e4007c;color:#fff;font:700 12px/1 sans-serif;padding:6px 8px;border-radius:6px}
`;
const lum=h=>{const n=parseInt(h.slice(1),16),c=[n>>16,n>>8&255,n&255].map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2];};
const cr=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
function pal(k){if(!k.c1)return null;let bg=k.c1,fg=k.c2||'#FFFFFF';if(lum(bg)>.8&&k.c2){bg=k.c2;fg=k.c1;}if(cr(bg,fg)<4.5)fg=lum(bg)>.4?'#000000':'#FFFFFF';return {bg,fg};}
const sl=y=>y+'/'+String((y+1)%100).padStart(2,'0');
const span=k=>k.ys.length===1?sl(k.ys[0]):`${k.ys[0]}–${k.ys[k.ys.length-1]+1}`;
function state(k){const m=ME[k.c];if(!m)return {s:'todo'};if(!k.best)return {s:'start'};const rec=m.best>k.best[0],wst=m.worst<k.worst[0];return {s:rec&&wst?'done':'start',rec,wst};}
function tile(k){const p=pal(k),st=state(k);const sty=p?`style="background:${p.bg};color:${p.fg}"`:'';
  const right=st.s==='done'?'<span class="done">✓ ПРОЙДЕНО</span>':(st.rec||st.wst)?`<span class="bd">${st.rec?'<i>🏅</i>':''}${st.wst?'<i>🪦</i>':''}</span>`:'';
  return `<div class="oct${p?'':' neutral'}${st.s==='done'?' cmp':''}" ${sty}>${right}<small>${k.best?`${k.ys.length} ${k.ys.length===1?'сезон':k.ys.length<5?'сезони':'сезонів'}`:'новачок'}</small><b>${k.n}</b></div>`;}
function counts(){let r=0,w=0,d=0;for(const k of CL){const s=state(k);if(s.rec)r++;if(s.wst)w++;if(s.s==='done')d++;}const n=CL.filter(k=>k.best).length;return {r,w,d,n};}
function listHTML(open){const c=counts();return `<div class="oc">
 <h1>Один клуб</h1><p class="lead">Обери клуб і збери XI лише з тих, хто за нього грав в УПЛ.</p>
 <details${open?' open':''}><summary>Як це працює</summary><p>Колесо дає тільки сезони обраного клубу. Рейтинг гравця — з того сезону, коли він там грав. Граєш 30 турів замість клубу.</p></details>
 <details${open?' open':''}><summary>Трофеї режиму</summary><ul><li>❤️ <b>Два кольори</b> — стань чемпіоном.</li><li>🏅 <b>Рекорд клубу</b> — набери більше очок, ніж клуб будь-коли в УПЛ.</li><li>🪦 <b>Найгірший сезон</b> — набери менше, ніж у найгіршому сезоні клубу.</li><li>✓ <b>Пройдено</b> — обидва рекорди клубу побиті.</li></ul></details>
 <div class="occ"><span>🏅 ${c.r}/${c.n} рекордів</span><span>🪦 ${c.w}/${c.n} найгірших</span><span class="ok">✓ ${c.d} ${c.d===1?'клуб пройдено':'клуби пройдено'}</span></div>
 <div class="ocf"><button class="on">Усі</button><button>Не почато</button><button>Почато</button><button>Пройдено</button></div>
 <div class="ocg">${CL.map(tile).join('')}</div></div>`;}
function cardHTML(code){const k=CL.find(x=>x.c===code),p=pal(k),m=ME[code];
  const star=x=>x[2]!==30||x[1]<=1993?'*':'';
  const notes=[k.best,k.worst].filter(x=>star(x)).map(x=>x[1]<=1993?`${sl(x[1])} — 2 очки за перемогу`:`${sl(x[1])} — ${x[2]} турів`);
  const left=k.best[0]-m.best;
  return `<div class="och" style="background:${p.bg};color:${p.fg}"><small>Один клуб</small><h2>${k.n}</h2><p>${k.ys.length} сезонів в УПЛ · ${span(k)}</p>
  <div class="pills"><span>🏅 Рекорд ${k.best[0]}${star(k.best)} оч. · ${sl(k.best[1])}</span><span>🪦 Найгірший ${k.worst[0]}${star(k.worst)} оч. · ${sl(k.worst[1])}</span></div>
  ${notes.length?`<div class="ft">* ${notes.join('; ')}. Ти граєш 30 турів.</div>`:''}<hr>
  <small>Твій рекорд</small><div class="pills"><span class="lt">Найкращий ${m.best}</span><span class="lt">Найгірший ${m.worst}</span><span class="lt">${m.n} сезонів</span></div>
  <div class="ft">${left>=0?`До рекорду клубу — ${left+1} оч.`:'Рекорд клубу вже твій 🏅'} · ${m.worst<k.worst[0]?'найгірший теж 🪦':`до найгіршого — менше ${k.worst[0]} оч.`}</div>
  <p style="margin-top:var(--sp-3)"><a href="#">Змінити клуб</a></p></div>`;}
function resHTML(){return `<div class="ocr"><div class="big">🏅</div><h3>Новий рекорд «Шахтаря»!</h3><p><b>83 очки</b> — більше, ніж клуб набирав будь-коли в УПЛ (80, 2016/17).</p><p class="muted cap" style="margin-top:var(--sp-2)">Залишився найгірший сезон: менше 34 очок.</p></div>`;}
async function shot(name,vp,scheme,fn){const {pg:page,b}=await openSite({viewport:vp,colorScheme:scheme});
  await page.waitForTimeout(800);
  await page.evaluate(([css,html,label,mode])=>{const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
    document.querySelectorAll('main>section,section[id^="s"]').forEach(s=>s.hidden=true);
    let host;if(mode==='card'){window.go&&go(4);const s4=document.getElementById('s4');s4.hidden=false;
      ['formats','clubPickRow'].forEach(id=>{const e=document.getElementById(id);e.hidden=true;if(e.previousElementSibling&&e.previousElementSibling.tagName==='H3')e.previousElementSibling.hidden=true;});
      document.getElementById('eraBox').hidden=true;s4.querySelector('h2').outerHTML=html;const sb=document.getElementById('startBtn');sb.textContent='Почати драфт · '+document.querySelector('.och h2').textContent.split(' (')[0];sb.style.position='static';
      document.getElementById('bestLine').textContent='';}
    else{host=document.createElement('section');host.innerHTML=html;const s=document.getElementById('s4');s.parentNode.insertBefore(host,s);}
    const l=document.createElement('div');l.className='lbl72';l.textContent=label;document.body.appendChild(l);window.scrollTo(0,0);},[CSS,fn(),name,name.startsWith('2')?'card':'']);
  await page.waitForTimeout(400);await page.screenshot({path:`${D}/${name}.png`,fullPage:true});await b.close();}
(async()=>{
  await shot('1_list_phone',{width:390,height:844},'dark',()=>listHTML(false));
    await shot('1_list_ipad',{width:1024,height:1366},'dark',()=>listHTML(true));
  await shot('2_card_phone',{width:390,height:844},'dark',()=>cardHTML('dynamo-kyiv'));
  await shot('2_card_phone_shakh',{width:390,height:844},'light',()=>cardHTML('shakhtar-donetsk'));
  await shot('3_result_phone',{width:390,height:500},'dark',()=>`<div class="oc" style="padding-top:var(--sp-4)">${resHTML()}</div>`);
})();
