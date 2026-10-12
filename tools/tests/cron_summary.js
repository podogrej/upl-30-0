// Evening daily summary and Sunday weekly summary in the group chat, kept compact.
// Day: day table, day winner, league standings; no trophies, no "new wheel tomorrow" line.
// Week: full table, player of the week, no "new week from Monday" line; a league created mid-week counts from its first day.
// No browser: DB and Telegram are faked. Run from repo root: node tools/tests/cron_summary.js
const path=require('path');const {checker}=require('./_site.js');
process.env.SUPABASE_SERVICE_KEY='svc';process.env.TG_TOKEN='123:T';process.env.CRON_SECRET='cs';
const CHAT=-100500,SENT=[];let TGOK=true;
// Sunday 2026-10-04; league created Thursday 10-01 → week 09-28..10-04 counts results from 10-01 only
const R=[];let id=1;
const add=(day,uid,name,w,d,l,gf,ga)=>R.push({id:id,chat_id:CHAT,day,tg_user_id:uid,name,season_id:id++,w,d,l,gf,ga,pts:w*3+d,created_at:day+'T10:00:00Z',trophies:['Чемпіони','✨Дует Лобановського']});
for(const day of ['2026-10-01','2026-10-02','2026-10-03','2026-10-04']){add(day,1,'Андрій',20,5,5,60,20);add(day,2,'Вітя',15,5,10,45,35);add(day,3,'Ігор',10,10,10,40,40);add(day,4,'Слава',5,5,20,25,60);}
// Monday 2026-10-05: 35 players (list is cut to 30 lines)
for(let u=100;u<135;u++)add('2026-10-05',u,'Гравець'+u,30-(u-100)%25,0,0,50,10);
const SEAS=Object.fromEntries(R.map(r=>[r.season_id,{id:r.season_id,day:r.day,tg_user_id:r.tg_user_id,w:r.w,d:r.d,l:r.l,gf:r.gf,ga:r.ga,place:1}]));
const BOARDS={};
const f=(q,k)=>{const m=new RegExp('[?&]'+k+'=([^&]+)').exec(q);return m?decodeURIComponent(m[1]):null;};
global.fetch=async(url,o={})=>{const u=String(url),m=o.method||'GET';const J=(s,j)=>({ok:s<300,status:s,json:async()=>j,text:async()=>j==null?'':JSON.stringify(j)});
  if(u.includes('api.telegram.org')){SENT.push(JSON.parse(o.body||'{}'));return TGOK?J(200,{ok:true,result:{message_id:1}}):J(403,{ok:false,description:'Forbidden: bot was kicked'});}
  const q=u.split('/rest/v1/')[1]||'';const t=q.split('?')[0];
  if(t==='league_results'){let rows=R;const c=f(q,'chat_id'),d=f(q,'day'),g=/day=gte\.([\d-]+)/.exec(q),l=/day=lte\.([\d-]+)/.exec(q);
    if(c)rows=rows.filter(r=>String(r.chat_id)===c.replace('eq.',''));if(d&&d.startsWith('eq.'))rows=rows.filter(r=>r.day===d.slice(3));
    if(g)rows=rows.filter(r=>r.day>=g[1]);if(l)rows=rows.filter(r=>r.day<=l[1]);return J(200,rows.map(r=>({...r})));}
  if(t==='seasons'){const ids=(/id=in\.\(([^)]*)\)/.exec(q)||[,''])[1].split(',').map(Number);return J(200,ids.map(i=>SEAS[i]).filter(Boolean));}
  if(t==='leagues')return J(200,[{chat_id:CHAT,title:'38.0'}]);
  if(t==='league_boards'){const day=(f(q,'day')||'').replace('eq.','');if(m==='POST'){const b=JSON.parse(o.body);BOARDS[b.day]={...(BOARDS[b.day]||{}),...b};return J(201,null);}return J(200,BOARDS[day]?[BOARDS[day]]:[]);}
  return J(200,[]);};
const H=require(path.join(__dirname,'..','..','api','cron.js'));
const run=query=>new Promise(r=>H({query,headers:{authorization:'Bearer cs'}},{c:200,status(c){this.c=c;return this;},json(j){r({c:this.c,j});}}));
(async()=>{const T=checker('cron_summary');
  const r=await run({day:'2026-10-04'});
  const day=SENT.find(s=>/Підсумок дня/.test(s.text)),wk=SENT.find(s=>/Підсумок тижня/.test(s.text));
  T.check(r.c===200&&r.j.summaries===1&&r.j.weekly===1&&day&&wk,'неділя: надіслано підсумок дня й підсумок тижня '+JSON.stringify(r.j));
  T.check(day&&/👑 Переможець дня: <b>Андрій<\/b>/.test(day.text)&&/Залік ліги/.test(day.text),'день: «Переможець дня» і залік ліги на місці');
  T.check(day&&!/🏆|Чемпіони|Дует Лобановського|секретний/.test(day.text),'день: трофеїв гравців немає');
  T.check(day&&!/Завтра/.test(day.text),'день: без «Завтра нове колесо»');
  T.check(wk&&/Підсумок тижня 01\.10–04\.10/.test(wk.text),'тиждень: ліга з четверга — період 01.10–04.10, не 28.09–04.10');
  T.check(wk&&['Андрій','Вітя','Ігор','Слава'].every(n=>wk.text.includes(n))&&/🏅 Гравець тижня: <b>Андрій<\/b>/.test(wk.text),'тиждень: уся таблиця (4 гравці) і «Гравець тижня»');
  T.check(wk&&!/Новий тиждень/.test(wk.text),'тиждень: без «Новий тиждень — з понеділка»');
  console.log('--- день ---\n'+(day&&day.text)+'\n--- тиждень ---\n'+(wk&&wk.text));
  SENT.length=0;const r2=await run({day:'2026-10-04'});T.check(!SENT.some(s=>/Підсумок/.test(s.text)),'повторний запуск того ж дня — без дублів');
  // Telegram refuses: no "sent" flag, error logged, next run sends; list capped at 30 lines
  SENT.length=0;TGOK=false;const errs=[],ce=console.error;console.error=(...a)=>errs.push(a.join(' '));
  const f1=await run({day:'2026-10-05'});console.error=ce;
  T.check(f1.c===200&&f1.j.summaries===0&&!BOARDS['2026-10-05'],'Telegram відмовив: прапорця «надіслано» немає, підсумків 0 '+JSON.stringify(f1.j));
  T.check(errs.some(e=>/bot was kicked/.test(e)),'Telegram відмовив: причина в журналі сервера');
  TGOK=true;SENT.length=0;const f2=await run({day:'2026-10-05'});
  const big=SENT.find(s=>/Підсумок дня/.test(s.text));
  T.check(f2.j.summaries===1&&BOARDS['2026-10-05']&&BOARDS['2026-10-05'].summary_sent===true,'повторний запуск після відмови — надіслано, прапорець стоїть');
  const lines=big.text.split('\n').filter(l=>/^(🥇|🥈|🥉|\d+\.) /.test(l));
  T.check(lines.length===30&&/…і ще 5/.test(big.text)&&big.text.length<4096,'35 гравців: у таблиці 30 рядків і «…і ще 5», повідомлення '+big.text.length+' символів');
  process.exit(T.done());})();
