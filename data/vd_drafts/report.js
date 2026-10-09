const fs=require('fs');const {S}=require('./specs.js');
const M={};const L=f=>fs.readdirSync('.').filter(x=>f.test(x)).sort();
for(const f of [...L(/^out_\d\.json$/),...L(/^ovr2_\d\.json$/),...L(/^ovr_\d\.json$/)])for(const x of JSON.parse(fs.readFileSync(f)))M[x.ch.day]=x;
for(const f of L(/^fine_.*\.json$/)){const x=JSON.parse(fs.readFileSync(f));M[x.ch.day]=x;}
const TP=require('./textpass.js');const BEFORE={};for(const x of Object.values(M)){BEFORE[x.ch.day]=x.ch;x.ch=TP(x.ch);}
const all=Object.values(M);
let nCh=0,ex=[];for(const x of all){const b=BEFORE[x.ch.day];for(const f of ['title','story','task'])if(b[f]!==x.ch[f]){nCh++;if(f==='story')ex.push(x.ch.day+': '+b.story+' → '+x.ch.story);}if(b.bonus&&b.bonus.label!==x.ch.bonus.label)nCh++;}fs.writeFileSync('textpass_log.txt','changed '+nCh+'\n'+ex.join('\n'));
all.sort((a,b)=>a.ch.day<b.ch.day?-1:1);
const CHECK=JSON.parse(fs.readFileSync('checks.json'));
const week=all.filter(x=>x.ch.day>='2026-10-16'),arch=all.filter(x=>x.ch.day<='2026-10-08');
fs.writeFileSync('week_16_22.json',JSON.stringify(week.map(x=>x.ch),null,1));
fs.writeFileSync('archive.json',JSON.stringify(arch.map(x=>x.ch),null,1));
// clubs per Mon-Sun week (conditions only)
const clubsOf=o=>{const s=new Set();(function w(c){if(!c)return;if(c.parts)c.parts.forEach(w);if(c.of)(Array.isArray(c.of)?c.of:[c.of]).forEach(w);const p=c.params||{};if(p.club)s.add(p.club);(p.clubs||[]).forEach(x=>s.add(x));})(o);return s;};
const cur=JSON.parse(fs.readFileSync('/home/user/upl-30-0/lib/challenges.json'));
const wk=d=>{const t=new Date(d+'T12:00:00Z');const dow=(t.getUTCDay()+6)%7;t.setUTCDate(t.getUTCDate()-dow);return t.toISOString().slice(0,10);};
const W={};for(const ch of [...all.map(x=>x.ch),...cur]){const k=wk(ch.day);W[k]=W[k]||{};for(const c of new Set([...clubsOf(ch.required),...clubsOf(ch.bonus)]))(W[k][c]=W[k][c]||[]).push(ch.day.slice(5));}
const over=[];for(const k in W)for(const c in W[k])if(W[k][c].length>2)over.push(`${k}: ${c} ×${W[k][c].length} (${W[k][c].join(', ')})`);
const types=o=>{const s=new Set();(function w(c){if(!c)return;if(c.parts)c.parts.forEach(w);s.add(c.type);if(c.of)(Array.isArray(c.of)?c.of:[c.of]).forEach(w);})(o);s.delete(undefined);return [...s];};
const pc=x=>(100*x).toFixed(0)+'%';
const row=x=>{const c=x.ch,f=x.fin,chk=CHECK[c.day]||'';return `| ${c.day} | ${c.title} | ${c.required.label} | ${c.bonus?c.bonus.label:'—'} | ${c.eventPlayer?'так':'—'} | ${f.req.join(' + ')}${c.bonus?' / бонус '+f.bon:''} (разом ${f.uni}) | ${pc(f.p11)} | ${pc(f.pGate)} / ${pc(f.pGateFan)} | ${f.avg.toFixed(1)} | ${chk} |`;};
const H='| День | Заголовок | Обов’язкова умова | Бонус | Гравець події | Підходящих людей: умова / бонус (разом) | P(11/11) знавець | P(умова) знавець / уболівальник | Сер. рахунок | ПРОВЕРИТЬ |\n|---|---|---|---|---|---|---|---|---|---|';
const out=(L)=>L.map(row).join('\n');
const inR=L=>L.filter(x=>x.fin.p11>=0.25&&x.fin.p11<=0.40).length;
let md=fs.readFileSync('report_head.md','utf8');
const tag=x=>{const p=x.fin.p11;return p<0.25||p>0.40?' ⚠️':'';};
md=md.replace('## Модель калібрування','## Коротко: усі виклики\n\n| День | Заголовок | Обов’язкова умова | Бонус | P(11/11) |\n|---|---|---|---|---|\n'+[...week,...arch].map(x=>`| ${x.ch.day.slice(5)} | ${x.ch.title} | ${x.ch.required.label} | ${x.ch.bonus?x.ch.bonus.label:'—'} | ${pc(x.fin.p11)}${tag(x)} |`).join('\n')+'\n\n## Модель калібрування');
md+=`\n## (а) Тиждень 16–22.10.2026\n\n${H}\n${out(week)}\n\nУ коридорі 25–40%: ${inR(week)}/${week.length}.\n`;
md+=`\n## (б) Архів 31.07–08.10.2026\n\n${H}\n${out(arch)}\n\nУ коридорі 25–40%: ${inR(arch)}/${arch.length}.\n`;
const tcount={};for(const x of all)for(const t of types(x.ch.required).concat(types(x.ch.bonus)))tcount[t]=(tcount[t]||0)+1;
md+=`\n## Різноманіття і повтори клубів\n\nТипи умов (обов’язкова + бонус, скільки викликів використовують): ${Object.entries(tcount).map(([k,v])=>k+' '+v).join(', ')}.\n\nКлуб частіше 2 разів за тиждень (пн–нд, разом з уже готовими 9–15.10): ${over.length?over.join('; '):'немає'}.\n`;
md+=`\n## Як вибиралась умова (перебір варіантів)\n\n`+all.map(x=>`- ${x.ch.day}: `+x.tried.map(t=>`${t.req}${t.bonus?' + '+t.bonus:''} → ${pc(t.p11)}${t.gate<0.9?' (умова '+pc(t.gate)+')':''}`).join('; ')).join('\n')+'\n';
if(fs.existsSync('report_tail.md'))md+='\n'+fs.readFileSync('report_tail.md','utf8');fs.writeFileSync('report.md',md);
console.log('week',week.length,'arch',arch.length,'inrange',inR(all),'/',all.length);console.log(over.join('\n'));
