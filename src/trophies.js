// ---------- ТРОФЕЇ: видимі (умова відома), секретні (лише кількість), віхи за кількістю сезонів; повторювані мають лічильник ×N
const PERSON={};   // person_id → {main, nat, by, clubs:Set}
for(const c of DATA.clubs)for(const p of c.pl){const q=PERSON[p[5]]||(PERSON[p[5]]={main:p[6],nat:p[10],by:p[11],clubs:new Set()});q.clubs.add(c.c);}
const CLUBS_NOW=new Set(DATA.clubs.filter(c=>c.y===Math.max(...DATA.clubs.map(x=>x.y))).map(c=>c.c));
const UA=0;   // DATA.nats[0] = «Україна»
const TR_CATS=[["season","Сезон"],["squad","Склад"],["players","Гравці"],["modes","Режими та складність"],["daily","Виклик дня"],["secret","Секретні"]];
const surname=n=>{const t=String(n).split(' ');return t[t.length-1];};
const firstName=n=>String(n).split(' ')[0];
const byClub=xi=>{const m={};for(const x of xi)m[x.cc]=(m[x.cc]||0)+1;return Math.max(0,...Object.values(m));};
const byClubSeason=xi=>{const m={};for(const x of xi){const k=x.cc+'|'+x.y;m[k]=(m[k]||0)+1;}return Math.max(0,...Object.values(m));};
const notAnti=c=>c.format!=='anti', mixed=c=>c.format==='classic';
const LOG=c=>(c.r&&c.r.log)||[];   // матчі сезону (у старих рядках журналу їх немає — тоді трофеї за матчі не видаються)
const TROPHIES=[
  // сезон
  {id:"champ",i:"🏆",n:"Чемпіони",d:"Виграй чемпіонат",cat:"season",rep:1,t:c=>notAnti(c)&&c.r.place===1},
  {id:"top3",i:"⭐",n:"Бронза теж метал",d:"Фініш у трійці",cat:"season",rep:1,t:c=>notAnti(c)&&c.r.place<=3},
  {id:"unbeaten",i:"🛡️",n:"Не здамся без бою",d:"Сезон без поразок",cat:"season",rep:1,t:c=>notAnti(c)&&c.r.L===0},
  {id:"perfect",i:"💎",n:"30-0",d:"Виграй усі 30 матчів",cat:"season",rep:1,t:c=>notAnti(c)&&c.r.W===30},
  {id:"mid8",i:"😐",n:"Золота середина",d:"Фініш рівно на 8-му місці",cat:"season",rep:1,t:c=>notAnti(c)&&c.r.place===8},
  {id:"relegated",i:"📉",n:"Там, де нас нема",d:"Фініш у зоні вильоту (15–16 місце)",cat:"season",rep:1,t:c=>notAnti(c)&&c.r.place>=15},
  {id:"goals80",i:"⚽",n:"Голеада",d:"Забий 80+ голів за сезон",cat:"season",rep:1,t:c=>notAnti(c)&&c.r.gf>=80},
  {id:"fortress",i:"🧱",n:"Кам'янець-Подільський",d:"Пропусти 15 голів або менше",cat:"season",rep:1,t:c=>notAnti(c)&&c.r.ga<=15},
  {id:"iron",i:"🚪",n:"Сухарі",d:"Пропусти 8 голів або менше",cat:"season",t:c=>notAnti(c)&&c.r.ga<=8},
  {id:"nodraw",i:"⚔️",n:"Або пан, або пропав",d:"Сезон без жодної нічиєї",cat:"season",t:c=>notAnti(c)&&c.r.D===0},
  {id:"sieve",i:"🕳️",n:"Прохідний двір",d:"Пропусти 60+ голів за сезон",cat:"season",rep:1,t:c=>notAnti(c)&&c.r.ga>=60},
  {id:"lucky",i:"🍀",n:"Народжений у сорочці",d:"Набери на 15+ очок більше за xP",cat:"season",rep:1,t:c=>notAnti(c)&&c.r.pts-c.r.xp>=15},
  {id:"unlucky",i:"🌧️",n:"Не судилося",d:"Набери на 15+ очок менше за xP",cat:"season",rep:1,t:c=>notAnti(c)&&c.r.pts-c.r.xp<=-15},
  // склад
  {id:"allua",i:"🇺🇦",n:"Файна Юкрайна",d:"Усі 11 гравців — українці",cat:"squad",rep:1,t:c=>c.xi.every(x=>x.nat===UA)},
  {id:"nations",i:"🌍",n:"Євробачення",d:"8+ різних громадянств в одному XI",cat:"squad",t:c=>new Set(c.xi.filter(x=>x.nat>=0).map(x=>x.nat)).size>=8},
  {id:"band7",i:"🏟️",n:"Кайдашева сім'я",d:"7 гравців одного клубу (не в режимах «Один клуб» і «Дербі»)",cat:"squad",t:c=>mixed(c)&&byClub(c.xi)>=7},
  {id:"band5",i:"🥁",n:"Зібрали гурт",d:"5 гравців з одного клуб-сезону (не в «Один клуб» і «Дербі»)",cat:"squad",t:c=>mixed(c)&&byClubSeason(c.xi)>=5},
  {id:"abc",i:"🔤",n:"Буквар",d:"Імена всіх 11 гравців починаються з різних літер",cat:"squad",t:c=>new Set(c.xi.map(x=>firstName(x.name)[0])).size===11},
  {id:"tannoy",i:"📢",n:"Скоромовка",d:"5 прізвищ на одну літеру",cat:"squad",t:c=>{const m={};for(const x of c.xi){const k=surname(x.name)[0];m[k]=(m[k]||0)+1;}return Math.max(...Object.values(m))>=5;}},
  {id:"pegs",i:"🔄",n:"Хто в ліс, хто по дрова",d:"6+ польових гравців не на основній позиції",cat:"squad",t:c=>c.xi.filter(x=>x.slot!=='GK'&&x.main&&x.main.length>2&&x.main!==x.slot).length>=6},
  {id:"vets",i:"👴",n:"В бій ідуть лише «старі»",d:"Усім 11 гравцям 30+ у тому сезоні",cat:"squad",t:c=>c.xi.every(x=>x.by&&x.y-x.by>=30)},
  // гравці
  {id:"striker",i:"🎯",n:"Шева б пишався",d:"Гравець забиває 25+ голів за сезон",cat:"players",rep:1,t:c=>c.pl.some(p=>p.g>=25)},
  {id:"assist",i:"🪄",n:"Нова пошта",d:"Гравець віддає 15+ асистів за сезон",cat:"players",rep:1,t:c=>c.pl.some(p=>p.a>=15)},
  {id:"eight",i:"🌟",n:"Круглий відмінник",d:"Середня оцінка гравця за сезон 8.0+",cat:"players",rep:1,t:c=>c.pl.some(p=>p.rt>=8)},
  // режими
  {id:"hardchamp",i:"🔥",n:"Без права на помилку",d:"Стань чемпіоном у режимі «Складний»",cat:"modes",rep:1,t:c=>c.mode==='hard'&&notAnti(c)&&c.r.place===1},
  {id:"hcchamp",i:"🙈",n:"Кіт у мішку",d:"Стань чемпіоном у «Хардкорі»",cat:"modes",rep:1,t:c=>c.mode==='hardcore'&&notAnti(c)&&c.r.place===1},
  {id:"derbychamp",i:"⚡",n:"Класика жанру",d:"Стань чемпіоном у «Класичному дербі»",cat:"modes",rep:1,t:c=>c.format==='derby'&&c.r.place===1},
  {id:"oneclubchamp",i:"❤️",n:"Два кольори",d:"Стань чемпіоном у режимі «Один клуб»",cat:"modes",rep:1,t:c=>c.format==='oneclub'&&c.r.place===1},
  {id:"antilast",i:"⬇️",n:"Нижче плінтуса",d:"Антисезон: фініш останнім",cat:"modes",rep:1,t:c=>c.format==='anti'&&c.r.place===16},
  {id:"anti0",i:"🪦",n:"Нуль без палички",d:"Антисезон: програй усі 30 матчів",cat:"modes",t:c=>c.format==='anti'&&c.r.L===30},
  {id:"antidry",i:"🥖",n:"Сухий пайок",d:"Антисезон: забий 5 голів або менше",cat:"modes",t:c=>c.format==='anti'&&c.r.gf<=5},
  // виклик дня (перевіряються за лічильниками)
  {id:"dchamp",i:"📅",n:"Герой дня",d:"Стань чемпіоном в офіційній спробі виклику дня",cat:"daily",rep:1,t:c=>c.dailyOfficial&&c.r.place===1},
  {id:"s3",i:"🔥",n:"Бог любить трійцю",d:"Зіграй виклик дня 3 дні поспіль",cat:"daily",st:s=>s.streak>=3,prog:s=>[s.streak,3]},
  {id:"s7",i:"🗓️",n:"Як на роботу",d:"7 днів поспіль",cat:"daily",st:s=>s.streak>=7,prog:s=>[s.streak,7]},
  {id:"s14",i:"📆",n:"Відпустка? Не чув",d:"14 днів поспіль",cat:"daily",st:s=>s.streak>=14,prog:s=>[s.streak,14]},
  {id:"s30",i:"🏛️",n:"Трудоголік",d:"30 днів поспіль",cat:"daily",st:s=>s.streak>=30,prog:s=>[s.streak,30]},
  {id:"d10",i:"☕",n:"Завсідник",d:"Зіграй 10 викликів дня",cat:"daily",st:s=>s.dailies>=10,prog:s=>[s.dailies,10]},
  {id:"d50",i:"🎖️",n:"Старожил",d:"Зіграй 50 викликів дня",cat:"daily",st:s=>s.dailies>=50,prog:s=>[s.dailies,50]},
  // секретні
  {id:"golden",i:"🥇",n:"Як у 2006-му",d:"Стань чемпіоном через золотий матч",cat:"secret",sec:1,t:c=>notAnti(c)&&c.r.place===1&&!!c.r.golden},
  {id:"rebsh",i:"🤝",n:"Дует Лобановського",d:"Ребров і Шевченко в одному складі",cat:"secret",sec:1,t:c=>c.xi.some(x=>x.name==='Сергій Ребров')&&c.xi.some(x=>x.name==='Андрій Шевченко')},
  {id:"samba",i:"🇧🇷",n:"Самба на Донбасі",d:"5 бразильців «Шахтаря» в одному складі",cat:"secret",sec:1,t:c=>c.xi.filter(x=>x.cc==='shakhtar-donetsk'&&DATA.nats[x.nat]==='Бразилія').length>=5},
  {id:"noua",i:"✈️",n:"Іноземний легіон",d:"У складі немає жодного українця",cat:"secret",sec:1,t:c=>c.xi.every(x=>x.nat>=0&&x.nat!==UA)},
  {id:"namesakes",i:"🪪",n:"Ні, не родичі",d:"3 гравці з однаковим прізвищем",cat:"secret",sec:1,t:c=>{const m={};for(const x of c.xi){const k=surname(x.name);m[k]=(m[k]||0)+1;}return Math.max(...Object.values(m))>=3;}},
  {id:"ghosts",i:"👻",n:"Тіні забутих клубів",d:"Усі 11 — з клубів, яких немає в УПЛ 2025/26",cat:"secret",sec:1,t:c=>c.xi.every(x=>!CLUBS_NOW.has(x.cc))},
  {id:"crimea",i:"🌊",n:"Кримський рейс",d:"3+ гравці «Таврії» чи «Севастополя»",cat:"secret",sec:1,t:c=>c.xi.filter(x=>x.cc==='tavriya-simferopol'||x.cc==='sevastopol').length>=3},
  {id:"cross",i:"🔀",n:"Ні нашим, ні вашим",d:"Двоє гравців, які грали і за «Динамо», і за «Шахтар»",cat:"secret",sec:1,t:c=>c.xi.filter(x=>{const q=PERSON[x.id];return q&&q.clubs.has('dynamo-kyiv')&&q.clubs.has('shakhtar-donetsk');}).length>=2},
  {id:"mediocre",i:"🧢",n:"З грязі в князі",d:"Чемпіон із середнім рейтингом складу нижче 80",cat:"secret",sec:1,t:c=>c.reveal&&notAnti(c)&&c.r.place===1&&c.xi.reduce((s,x)=>s+x.r0,0)/c.xi.length<80},
  {id:"cursed",i:"🧿",n:"Прокляття xG",d:"xP 70+, але не чемпіон",cat:"secret",sec:1,t:c=>notAnti(c)&&c.r.xp>=70&&c.r.place>1},
  {id:"heist",i:"💰",n:"Пограбування",d:"Чемпіон з xP нижче 55",cat:"secret",sec:1,t:c=>notAnti(c)&&c.r.place===1&&c.r.xp<55},
  {id:"fairy",i:"✨",n:"Сила в єдності",d:"Усі 11 гравців провели сезон у плюсовій формі (+1 і вище)",cat:"secret",sec:1,t:c=>c.pl.length===11&&c.pl.every(p=>p.form>=1)},
  {id:"fallen",i:"🌠",n:"Зірка згасла",d:"Гравець з рейтингом 95+ провів найгірший можливий сезон (форма −10)",cat:"secret",sec:1,t:c=>c.pl.some(p=>p.r0>=95&&p.form<=-10)},
  {id:"kids",i:"🧒",n:"Молодо — зелено",d:"Усім 11 гравцям менше 23 у тому сезоні",cat:"secret",sec:1,t:c=>c.xi.every(x=>x.by&&x.y-x.by<23)},
  {id:"gkmvp",i:"🧤",n:"Воротар — пів команди",d:"Гравець сезону — воротар з оцінкою 7.8+",cat:"secret",sec:1,t:c=>{const m=[...c.pl].sort((a,b)=>b.rt-a.rt)[0];return !!m&&m.slot==='GK'&&m.rt>=7.8;}},
  {id:"bottom",i:"🕳️",n:"Знизу постукали",d:"10 очок або менше за сезон (не антисезон)",cat:"secret",sec:1,t:c=>notAnti(c)&&c.r.pts<=10},
  {id:"nice",i:"😏",n:"Nice",d:"Набери рівно 69 очок",cat:"secret",sec:1,t:c=>notAnti(c)&&c.r.pts===69},
  // ---- 0.42: нові
  {id:"homefort",i:"🏰",n:"Білгород-Дністровський",d:"Жодної поразки вдома за сезон",cat:"season",rep:1,t:c=>notAnti(c)&&LOG(c).length===30&&LOG(c).every(m=>!m.home||m.res!=='L')},
  {id:"thrash",i:"🐢",n:"Розбили, як Бог черепаху",d:"Перемога з різницею 6+ м'ячів",cat:"season",rep:1,t:c=>notAnti(c)&&LOG(c).some(m=>m.ug-m.og>=6)},
  {id:"tractor",i:"🚜",n:"Як трактор переїхав",d:"Поразка з різницею 6+ м'ячів",cat:"season",rep:1,t:c=>notAnti(c)&&LOG(c).some(m=>m.og-m.ug>=6)},
  {id:"minimal",i:"1️⃣",n:"Мінімалісти",d:"10+ перемог з рахунком 1:0",cat:"season",rep:1,t:c=>notAnti(c)&&LOG(c).filter(m=>m.ug===1&&m.og===0).length>=10},
  {id:"drawish",i:"🤝",n:"Нічия — теж результат",d:"15+ нічиїх за сезон",cat:"season",rep:1,t:c=>notAnti(c)&&c.r.D>=15},
  {id:"equal",i:"⚖️",n:"Порівну",d:"Рівно 10 перемог, 10 нічиїх і 10 поразок",cat:"season",rep:1,t:c=>c.r.W===10&&c.r.D===10&&c.r.L===10},
  {id:"lonewolf",i:"🐺",n:"Один у полі не воїн",d:"Гравець забив 20+, а команда вилетіла",cat:"players",rep:1,t:c=>notAnti(c)&&c.r.place>=15&&c.pl.some(p=>p.g>=20)},
  {id:"ukrposhta",i:"📮",n:"Укрпошта",d:"Атакувальний півзахисник чи вінгер віддав менше 5 асистів",cat:"players",rep:1,t:c=>notAnti(c)&&c.pl.length===11&&c.pl.some(p=>['CAM','LW','RW'].includes(p.slot)&&(p.a||0)<5)},
  {id:"kukuriku",i:"🐓",n:"Кукуріку",d:"Анатолій Тимощук у складі",cat:"secret",sec:1,t:c=>c.xi.some(x=>x.id==='w:1979-03-30:timoschuk')},
  {id:"lobanovsky",i:"📋",n:"Лобан би схвалив",d:"Чемпіон, у складі 6+ гравців «Динамо» 1997–2001",cat:"secret",sec:1,t:c=>notAnti(c)&&c.r.place===1&&c.xi.filter(x=>x.cc==='dynamo-kyiv'&&x.y>=1997&&x.y<=2000).length>=6},
  {id:"panenka",i:"🪶",n:"Паненка",d:"Артем Мілевський у складі, команда в трійці",cat:"secret",sec:1,t:c=>notAnti(c)&&c.r.place<=3&&c.xi.some(x=>x.id==='tm:9800')},
  {id:"samba8",i:"💃",n:"Самба",d:"8+ бразильців в одному складі",cat:"secret",sec:1,t:c=>c.xi.filter(x=>DATA.nats[x.nat]==='Бразилія').length>=8},
  // Кварцяний, Блохін, Лобановський
  {id:"ndoye",i:"🧤",n:"Шедевр! Феномен!",d:"Ісса Ндоє у складі — «кращий у світі» (Кварцяний)",cat:"secret",sec:1,t:c=>c.xi.some(x=>x.id==='w:1985-12-12:ndoe')},
  {id:"pichkur",i:"🚭",n:"Не п'є, не курить",d:"Євген Пічкур у складі — «дуже важка людина» (Кварцяний)",cat:"secret",sec:1,t:c=>c.xi.some(x=>x.id==='tm:89427')},
  {id:"poodles",i:"🐩",n:"Є пуделі, а є вівчарки",d:"Програй «Шахтарю» 1:4 (Кварцяний)",cat:"secret",sec:1,t:c=>notAnti(c)&&LOG(c).some(m=>/^Шахтар/.test(m.opp)&&m.ug===1&&m.og===4)},
  {id:"sheep",i:"🐑",n:"Стадо баранів",d:"5 поразок поспіль (Кварцяний)",cat:"secret",sec:1,t:c=>{if(!notAnti(c))return false;let k=0;for(const m of LOG(c)){k=m.res==='L'?k+1:0;if(k>=5)return true;}return false;}},
  {id:"brains",i:"🧠",n:"Трагедія з мізками",d:"xP 55+, але виліт (Кварцяний)",cat:"secret",sec:1,t:c=>notAnti(c)&&c.r.xp>=55&&c.r.place>=15},
  {id:"talk",i:"🎤",n:"Вийдемо, поговоримо",d:"Чемпіон, але двічі програв одній команді (Блохін)",cat:"secret",sec:1,t:c=>{if(!notAnti(c)||c.r.place!==1)return false;const m={};for(const x of LOG(c))if(x.res==='L')m[x.opp]=(m[x.opp]||0)+1;return Object.values(m).some(v=>v>=2);}},
  {id:"tablo",i:"🔢",n:"Результат на табло",d:"Чемпіон, забивши 45 або менше (Лобановський)",cat:"secret",sec:1,t:c=>notAnti(c)&&c.r.place===1&&c.r.gf<=45},
];
const MILESTONES=[[1,"🌱","Перший сезон"],[5,"⚽","5 сезонів"],[10,"🎫","10 сезонів"],[25,"🎗️","25 сезонів"],[50,"🥇","Півсотні"],[100,"💯","Клуб 100"],[250,"🏛️","250 сезонів"]];
function trStore(){const s=lsGet("upl30_tr")||{};s.t=s.t||{};s.seasons=s.seasons||0;s.dailies=s.dailies||0;return s;}
function trStreak(){return streakInfo().count;}
// контекст сезону → які трофеї отримано (без запису)
function trEval(c){const got=[];for(const t of TROPHIES){if(t.t){let ok=false;try{ok=!!t.t(c);}catch(e){}if(ok)got.push(t.id);}}return got;}
function trCtxNow(r){
  const m=MODES[S.mode];
  const xi=S.slots.map(s=>{const p=s.player;const q=PERSON[p.id]||{};return {name:p.name,id:p.id,slot:s.slot,main:p.main,r0:p.r0,r:p.r,nat:p.nat??q.nat??-1,by:p.by||q.by||0,cc:p.cc||(DATA.clubs.find(x=>x.n===p.club&&x.y===p.y)||{}).c,y:p.y};});
  const pl=r.players.map(p=>({...p,r0:(xi.find(x=>x.id===p.id)||{}).r0||p.r}));
  return {r,xi,pl,mode:S.mode,format:S.format,reveal:!!(m.reveal||m.showRatings),dailyOfficial:!!(S.daily&&!S.daily.practice)};
}
function trCtxRow(row){   // з рядка журналу seasons (для видачі заднім числом)
  const xi=(row.xi||[]).map(p=>{const q=PERSON[p.id]||{};const cc=(DATA.clubs.find(x=>x.n===p.c&&x.y===p.y)||{}).c;return {name:p.n,id:p.id,slot:p.slot,main:q.main,r0:p.r,r:p.r,nat:q.nat??-1,by:q.by||0,cc,y:p.y};});
  const pl=(row.xi||[]).map(p=>({id:p.id,slot:p.slot,g:p.g||0,a:p.a||0,rt:p.rt||0,form:p.f||0,r0:p.r}));
  const r={W:row.w,D:row.d,L:row.l,pts:row.pts,place:row.place,gf:row.gf,ga:row.ga,xp:row.xp??row.pts,golden:!!row.golden};
  const m=MODES[row.mode]||{};return {r,xi,pl,mode:row.mode,format:row.format,reveal:!!(m.reveal||m.showRatings),dailyOfficial:!!(row.day&&!row.practice)};
}
// записати сезон у колекцію; повертає {got:[ids], fresh:[ids нові]}
function trAward(c,{daily}={}){
  const s=trStore();const got=trEval(c);const fresh=[];const today=kyivDate();
  s.seasons++;if(daily)s.dailies++;
  const add=id=>{const e=s.t[id]||(s.t[id]={n:0,at:today});if(!e.n)fresh.push(id);e.n++;};
  for(const id of got)add(id);   // з 0.43 усі трофеї за сезон повторювані: лічильник ×N
  const ctxS={streak:trStreak(),dailies:s.dailies};
  for(const t of TROPHIES)if(t.st&&t.st(ctxS)&&!(s.t[t.id]&&s.t[t.id].n)){add(t.id);got.push(t.id);}
  for(const [k] of MILESTONES)if(s.seasons===k){add('ms'+k);got.push('ms'+k);}
  lsSet("upl30_tr",s);if(fresh.length)trSync(fresh);
  return {got,fresh};
}
const trDef=id=>{if(id.startsWith('ms')){const m=MILESTONES.find(x=>'ms'+x[0]===id);return m&&{id,i:m[1],n:m[2],d:`Зіграй ${m[0]} ${m[0]===1?'сезон':'сезонів'}`,cat:"milestone"};}return TROPHIES.find(t=>t.id===id);};
// онлайн: перше відкриття → таблиця trophies (для «у X% гравців»)
function trSync(ids){if(!ONLINE)return;const rows=ids.map(t=>({device_id:deviceId(),trophy:t,...(typeof tgFields==='function'?tgFields():{})}));
  fetch(`${SB_URL}/rest/v1/trophies?apikey=${SB_KEY}&on_conflict=device_id,trophy`,{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(rows)})
    .then(r=>{if(!r.ok&&rows[0].tg_user_id!=null){rows.forEach(x=>{delete x.tg_user_id;delete x.tg_name;});return fetch(`${SB_URL}/rest/v1/trophies?apikey=${SB_KEY}&on_conflict=device_id,trophy`,{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(rows)});}}).catch(()=>{});}
let TR_PCT=null;
async function trLoadPct(){if(!ONLINE)return null;try{const r=await fetch(`${SB_URL}/rest/v1/rpc/trophy_stats?apikey=${SB_KEY}`,{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:'{}'});if(!r.ok)return null;TR_PCT=await r.json();return TR_PCT;}catch(e){return null;}}
// разова видача заднім числом за журналом цього пристрою
async function trRetro(){
  if(!ONLINE||lsGet("upl30_tr_retro"))return;
  try{const rows=await sbGet(`seasons?device_id=eq.${deviceId()}&select=*&order=id.asc&limit=1000`);
    const s=trStore();const fresh=[];const today=kyivDate();
    for(const row of rows){if(row.practice||row.mode==='practice')continue;s.seasons++;if(row.day)s.dailies++;
      for(const id of trEval(trCtxRow(row))){const t=trDef(id);const e=s.t[id]||(s.t[id]={n:0,at:(row.created_at||today).slice(0,10)});if(!e.n)fresh.push(id);e.n++;}}
    for(const [k] of MILESTONES)if(s.seasons>=k){const id='ms'+k;if(!(s.t[id]&&s.t[id].n)){s.t[id]={n:1,at:today};fresh.push(id);}}
    lsSet("upl30_tr",s);lsSet("upl30_tr_retro",1);if(fresh.length)trSync(fresh);renderTrBtn();
  }catch(e){}
}
// ---------- UI: кнопка на головній, шафа трофеїв, нові трофеї після сезону
function renderTrBtn(){const s=trStore();const n=Object.values(s.t).filter(e=>e.n).length;{const tt=document.getElementById('trTotal');if(tt){const n=TROPHIES.length+MILESTONES.length,x=n%10,y=n%100;tt.textContent=`${n} ${x===1&&y!==11?'трофей':x>=2&&x<=4&&(y<12||y>14)?'трофеї':'трофеїв'}, частина — секретні`;}}const b=document.getElementById('trCount');if(b)b.textContent=n?` · ${n}`:'';}
function trCard(t,e,pct,prog){
  const got=e&&e.n;const p=pct!=null?`<span class="trp">${pct===0?'ще ніхто не відкрив':`є в ${pct<1?'<1':Math.round(pct)}% гравців`}</span>`:'';
  const pr=!got&&prog?`<span class="trp">${Math.min(prog[0],prog[1])}/${prog[1]}</span>`:'';
  return `<div class="tro${got?' on':''}${t.sec?' sec':''}"><span class="tri">${trBadge(t,got)}</span><div class="trt"><b>${esc(t.n)}</b><span>${esc(t.d)}</span>${p}${pr}</div>${got&&e.n>1?`<span class="trn">×${e.n}</span>`:''}</div>`;
}
async function openTrophies(){
  const box=document.getElementById('viewBox'),body=document.getElementById('viewBody');document.getElementById('viewTitle').textContent='Трофеї';box.hidden=false;
  const draw=()=>{const s=trStore();const st={streak:trStreak(),dailies:s.dailies};
    const pctOf=id=>TR_PCT&&TR_PCT.players>=10?100*((TR_PCT.t||{})[id]||0)/TR_PCT.players:null;
    const total=TROPHIES.length,have=TROPHIES.filter(t=>s.t[t.id]&&s.t[t.id].n).length;
    let h=`<p class="muted" style="margin:0">Відкрито ${have} з ${total} · зіграно сезонів: ${s.seasons}</p>`;
    for(const [cat,title] of TR_CATS){const list=TROPHIES.filter(t=>t.cat===cat&&(!t.sec||(s.t[t.id]&&s.t[t.id].n)));
      const hiddenN=TROPHIES.filter(t=>t.cat===cat&&t.sec&&!(s.t[t.id]&&s.t[t.id].n)).length;
      if(!list.length&&!hiddenN)continue;
      list.sort((a,b)=>((s.t[b.id]||{}).n?1:0)-((s.t[a.id]||{}).n?1:0));
      h+=`<h3>${title}</h3><div class="trg">${list.map(t=>trCard(t,s.t[t.id],pctOf(t.id),t.prog&&t.prog(st))).join('')}</div>`;
      if(hiddenN)h+=`<p class="trsec">+${hiddenN} ${hiddenN%10===1&&hiddenN%100!==11?'секретний трофей':'секретних трофеїв'} чекають ${icon('eye')}</p>`;}
    h+=`<h3>Віхи</h3><div class="row" style="gap:6px">${MILESTONES.map(([k,i,n])=>{const on=s.t['ms'+k]&&s.t['ms'+k].n;return `<span class="chip ms${on?' onc':''}">${trBadge({id:'ms'+k,cat:'milestone'},on)}${n}${!on&&s.seasons<k?` · ${s.seasons}/${k}`:''}</span>`;}).join('')}</div>`;
    body.innerHTML=h;};
  draw();if(ONLINE&&!TR_PCT){await trLoadPct();if(!box.hidden)draw();}
}
function renderNewTro(r){
  const el=document.getElementById('newTro');if(!el)return;const a=r.tro;
  if(!a||!a.got.length){el.hidden=true;return;}
  const s=trStore();const fresh=new Set(a.fresh);
  const items=[...new Set(a.got)].map(trDef).filter(Boolean).sort((x,y)=>(fresh.has(y.id)?1:0)-(fresh.has(x.id)?1:0));
  el.hidden=false;el.innerHTML=`<div class="kicker" style="margin-bottom:6px">${a.fresh.length?'Нові трофеї':'Трофеї сезону'}</div><div class="trg">`+items.map((t,k)=>`<div class="tro on pop${fresh.has(t.id)?' new':''}" style="animation-delay:${k*120}ms"><span class="tri">${trBadge(t,true)}</span><div class="trt"><b>${esc(t.n)}${t.sec&&fresh.has(t.id)?' <em class="trsx">секретний!</em>':''}</b><span>${esc(t.d)}</span></div>${(s.t[t.id]||{}).n>1?`<span class="trn">×${s.t[t.id].n}</span>`:''}</div>`).join('')+`</div>`;
}
