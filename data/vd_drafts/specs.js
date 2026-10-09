const {clubPart:P,two,one,cond,B}=require('./lib.js');
const NUM={1:'одного',2:'двох',3:'трьох'};
// task text from required condition
function task(req,ev){const pre=ev?`${ev} ${/[аеєиіїоуюяь]$/i.test(ev)?'вже':'уже'} в складі. `:'';
  if(req.parts)return pre+`Додай ${ev?'':'у склад '}${req.parts.map(p=>p.who.one).join(' і ')}.`;
  return pre+`Додай ${ev?'':'у склад '}${req.count===1?req.who.one:NUM[req.count]+' '+req.who.many}.`;}
// match day: A home, B away; harder = narrow clubs by apps for the club, easier = bonus
const {IDX}=require('./sim.js');const ppl=c=>{let n=0;for(const k in IDX)if(IDX[k].clubs[c]>=1)n++;return n;};
function M(day,a,b,title,story,o={}){const big=ppl(a)>=ppl(b)?a:b;
  const mk=(oa,ob)=>two(P(a,oa),P(b,ob));const nb=x=>big===a?mk(x,{}):mk({},x);
  if(o.any){const r=one(anyPart(a,b),2);return {day,title,story,base:{req:r,bonus:null},harder:[],easier:[],any:1};}
  return {day,title,story,grid:n=>({req:nb({min:n}),bonus:null}),grid2:n=>({req:mk({min:n},{min:n}),bonus:null}),base:{req:mk({},{}),bonus:null},
    harder:(o.harder||[10,25,50,100]).map(n=>({req:nb({min:n}),bonus:null})).concat([{req:mk({min:10},{min:10}),bonus:null},{req:mk({min:25},{min:25}),bonus:null}]),
    easier:(o.easier||[B.FW,B.legion,B.MF,B.DF,B.apps(150),B.apps(100)]).map(x=>({req:mk({},{}),bonus:x}))};}
// club x n (+event)
function K(day,club,n,title,story,o={}){const r=o.part?one(o.part,n):one(P(club,o.p||{}),n);
  return {day,title,story,ev:o.ev,evName:o.evName,grid:o.part?null:(m=>({req:one(P(club,{...(o.p||{}),min:m}),n),bonus:o.bonus===undefined?null:o.bonus})),fixedBonus:o.bonus!==undefined,base:{req:r,bonus:o.bonus===undefined?null:o.bonus},
    harder:(o.harder||[]).map(x=>({req:one(P(club,x),n),bonus:o.bonus===undefined?null:o.bonus})),
    easier:(o.easier||[]).map(x=>({req:r,bonus:x}))};}
// generic: given list of variants
function G(day,title,story,base,o={}){return {day,title,story,ev:o.ev,evName:o.evName,base,grid:o.grid,harder:o.harder||[],easier:o.easier||[]};}
const natPart=(nats,label,sh,w1,wm,no,lab)=>({type:'nationality',params:{nats},label,who:{one:w1,many:wm},_no:no,_sh:sh,_lab:lab});
const {C}=require('./lib.js');
const anyPart=(a,b)=>({type:'clubs_any',params:{clubs:[a,b]},label:`гравець ${C[a][1]} або ${C[b][1]}`,who:{one:`гравця ${C[a][1]} або ${C[b][1]}`,many:`гравців ${C[a][1]} або ${C[b][1]}`},_no:`не грав ні за ${C[a][2]}, ні за ${C[b][2]}`,_sh:`${C[a][0]} або ${C[b][0]}`,_lab:k=>`${k} гравці ${C[a][1]} або ${C[b][1]}`});
const S=[];
// ---------- archive 2026-07-31 .. 2026-10-08
S.push(M('2026-07-31','zorya-luhansk','kolos-kovalivka','⚽ Зоря — Колос 2:0','Сезон УПЛ 2026/27 стартував: у першому матчі Зоря обіграла Колос — 2:0.'));
S.push(M('2026-08-01','kryvbas','karpaty-lviv','⚽ Кривбас — Карпати 1:4','Карпати розгромили Кривбас у гостях — 4:1 у першому турі.',{big:'kryvbas'}));
S.push(M('2026-08-02','chornomorets-odesa','polissya-zhytomyr','⚽ Чорноморець — Полісся 1:2','Полісся вирвало перемогу в гостях у Чорноморця — 2:1.',{big:'chornomorets-odesa'}));
S.push(K('2026-08-03','shakhtar-donetsk',2,'🎂 День народження Ракицького','Ярославу Ракицькому — 37. За Шахтар лівоногий центрбек зіграв понад 220 матчів в УПЛ.',{ev:'tm:89222',evName:'Ракицький',easier:[B.DF,B.GKDF,B.legion,B.apps(150)],harder:[{min:25},{min:50}]}));
S.push(M('2026-08-04','tavriya-simferopol','kryvbas','📅 Таврія — Кривбас 4:3','4 серпня 2007 року Таврія і Кривбас забили на двох сім голів — 4:3 на користь сімферопольців.',{big:'kryvbas',_check:1}));
S.push(K('2026-08-05','dynamo-kyiv',2,'🎂 День народження Олега Лужного','Олегу Лужному — 58. Захисник Динамо 90-х провів за киян 173 матчі в УПЛ, а потім грав за лондонський Арсенал.',{ev:'w:1968-08-05:lujni',evName:'Лужний',easier:[B.apps(150),B.DF,B.GKDF,B.apps(100),B.legion]}));
S.push(M('2026-08-06','nyva-vinnytsia','zorya-luhansk','📅 Нива — Зоря 5:0','6 серпня 1995 року вінницька Нива розгромила Зорю — 5:0.',{big:'zorya-luhansk'}));
S.push(K('2026-08-07','tavriya-simferopol',2,'🎂 День народження Олександра Гайдаша','Олександру Гайдашу — 59. За Таврію він провів 218 матчів в УПЛ — більше в історії клубу лише в Андрія Опаріна.',{ev:'w:1967-08-07:haidash',evName:'Гайдаш',easier:[B.FW,B.apps(150),B.legion,B.MF],harder:[{min:25},{min:50}]}));
S.push(K('2026-08-08','metalurh-zaporizhzhia',2,'🎂 День народження Тараса Степаненка','Тарасу Степаненку — 37. Починав в УПЛ у запорізькому Металурзі, потім понад десять років грав за Шахтар.',{ev:'tm:59970',evName:'Степаненко',easier:[B.MF,B.apps(150),B.legion],harder:[{min:25},{min:50}]}));
S.push(K('2026-08-09','shakhtar-donetsk',2,'🎂 День народження Віліана','Віліану — 38. Бразилець грав за Шахтар у 2007–2013 роках, звідти поїхав в Анжі, потім — Челсі.',{ev:'tm:52769',evName:'Віліан',bonus:B.nat(['Бразилія'],'🇧🇷 Бразильці','не бразилець'),easier:[],harder:[{min:25},{min:50}]}));
S.push(M('2026-08-10','karpaty-lviv','lnz-cherkasy','⚽ Карпати — ЛНЗ 3:0','Карпати впевнено обіграли ЛНЗ у другому турі — 3:0.',{big:'karpaty-lviv'}));
S.push(M('2026-08-11','arsenal-kyiv','hoverla-uzhhorod','📅 Арсенал — Закарпаття 7:0','11 серпня 2007 року київський Арсенал розгромив Закарпаття (згодом — Говерла) — 7:0.',{big:'arsenal-kyiv'}));
S.push(K('2026-08-12','metalist-kharkiv',2,'📅 Закарпаття — Металіст 3:5','12 серпня 2001 року в Ужгороді забили вісім голів: Металіст переміг Закарпаття 5:3.',{easier:[B.FW,B.legion,B.MF,B.apps(150)],harder:[{min:25},{min:50}]}));
S.push(K('2026-08-13','dynamo-kyiv',2,'🎂 День народження Ніко Кранчара','Ніко Кранчару — 42. Хорватський півзахисник провів у Динамо сезон 2012/13.',{ev:'tm:16746',evName:'Кранчар',easier:[B.nat(['Хорватія','Сербія','Боснія і Герцеговина','Словенія','Чорногорія','Північна Македонія'],'🌍 Гравці з країн колишньої Югославії','не з колишньої Югославії'),B.legion,B.MF]}));
S.push(M('2026-08-14','epicentr','veres-rivne','⚽ Епіцентр — Верес 0:0','Епіцентр і Верес не забили одне одному в третьому турі — 0:0.',{big:'veres-rivne',any:1}));
S.push(M('2026-08-15','kryvbas','livyi-bereh-kyiv','⚽ Кривбас — Лівий Берег 1:1','Кривбас і Лівий Берег розійшлися миром — 1:1.',{big:'kryvbas',any:1}));
S.push(M('2026-08-16','dynamo-kyiv','kolos-kovalivka','⚽ Динамо — Колос 2:1','Динамо вдома обіграло Колос — 2:1 у третьому турі.',{big:'dynamo-kyiv'}));
S.push(M('2026-08-17','polissya-zhytomyr','zorya-luhansk','⚽ Полісся — Зоря 1:2','Зоря виграла в гостях у Полісся — 2:1.',{big:'zorya-luhansk'}));
S.push(K('2026-08-18','shakhtar-donetsk',2,'🎂 День народження Олега Матвєєва','Олегу Матвєєву — 56. Нападник Шахтаря 90-х провів за клуб 142 матчі в УПЛ.',{ev:'w:1970-08-18:matvev',evName:'Матвєєв',easier:[B.FW,B.apps(150),B.MF,B.legion],harder:[{min:25},{min:50}]}));
S.push(M('2026-08-19','dynamo-kyiv','karpaty-lviv','📅 Динамо — Карпати 7:3','19 серпня 2007 року Динамо і Карпати забили десять голів — 7:3 на користь киян.',{big:'karpaty-lviv'}));
S.push(G('2026-08-20','🎂 День народження Ігоря Пластуна','Ігорю Пластуну — 36. Центрбек збірної України починав в Оболоні, потім грав за Карпати.',{req:two(P('obolon-kyiv'),P('karpaty-lviv')),bonus:null},{ev:'tm:97335',evName:'Пластун',
  harder:[{req:two(P('obolon-kyiv'),P('karpaty-lviv',{min:25})),bonus:null},{req:two(P('obolon-kyiv'),P('karpaty-lviv',{min:50})),bonus:null},{req:two(P('obolon-kyiv',{min:10}),P('karpaty-lviv',{min:50})),bonus:null}],
  easier:[B.DF,B.legion,B.FW].map(b=>({req:two(P('obolon-kyiv'),P('karpaty-lviv')),bonus:b}))}));
S.push(K('2026-08-21','shakhtar-donetsk',2,'🎂 День народження Артема Бондаренка','Артему Бондаренку — 26. Півзахисник провів за Шахтар понад сто матчів в УПЛ.',{ev:'tm:537854',evName:'Бондаренко',easier:[B.MF,B.legion,B.apps(150),B.FW],harder:[{min:25},{min:50}]}));
S.push(G('2026-08-22','🎂 День народження Вадима Мілька','Вадиму Мільку — 40. Понад сто матчів в УПЛ він провів за Колос, а до того грав за Зорю.',{req:two(P('kolos-kovalivka'),P('zorya-luhansk')),bonus:null},{ev:'tm:58418',evName:'Мілько',
  harder:[10,25,50].map(n=>({req:two(P('kolos-kovalivka'),P('zorya-luhansk',{min:n})),bonus:null})),
  easier:[B.DF,B.legion,B.FW].map(b=>({req:two(P('kolos-kovalivka'),P('zorya-luhansk')),bonus:b}))}));
S.push(K('2026-08-23','metalist-kharkiv',2,'🇺🇦 День Державного Прапора','Синьо-жовті кольори — не лише на прапорі: у них грає харківський Металіст.',{}));
{const ua5=n=>({type:'and',of:[{type:'nationality',params:{nats:['Україна']}},{type:'clubs_count_min',params:{n}}],label:`українець, який грав в УПЛ за ${n}+ клубів`,who:{one:`українця з ${n}+ клубами`,many:`українців з ${n}+ клубами`},_no:`не українець або менше ${n} клубів`,_sh:`українці ${n}+ клубів`,_lab:k=>`${k} українці, які грали в УПЛ за ${n}+ клубів`});
 const uaB=n=>({type:'and',of:[{type:'nationality',params:{nats:['Україна']}},{type:'clubs_count_min',params:{n}}],label:`🇺🇦 Українці з ${n}+ клубами`,no:`не українець або менше ${n} клубів`});
 S.push(G('2026-08-24','🇺🇦 День Незалежності','З Днем Незалежності! Іменинник Олександр Гладкий (39) грав в УПЛ за вісім клубів — від Металіста до Чорноморця.',{req:one(ua5(5),2),bonus:null},{ev:'tm:53270',evName:'Гладкий',
  harder:[{req:one(ua5(6),2),bonus:null},{req:one(ua5(6),3),bonus:null},{req:one(ua5(7),2),bonus:null},{req:one(ua5(7),1),bonus:null}],easier:[uaB(4),uaB(3)].map(b=>({req:one(ua5(5),2),bonus:b}))}));}
S.push(G('2026-08-25','🎂 День народження Євгена Опанасенка','Євгену Опанасенку — 36. Найбільше матчів в УПЛ він провів за запорізький Металург і Зорю.',{req:two(P('metalurh-zaporizhzhia'),P('zorya-luhansk')),bonus:null},{ev:'tm:86931',evName:'Опанасенко',
  harder:[10,25,50].map(n=>({req:two(P('metalurh-zaporizhzhia',{min:n}),P('zorya-luhansk',{min:n})),bonus:null})),easier:[B.DF,B.legion].map(b=>({req:two(P('metalurh-zaporizhzhia'),P('zorya-luhansk')),bonus:b}))}));
S.push(G('2026-08-26','🎂 День народження Юхима Коноплі','Юхиму Коноплі — 27. Правий захисник пройшов шлях від Десни до Шахтаря.',{req:two(P('desna-chernihiv'),P('shakhtar-donetsk')),bonus:null},{ev:'tm:467250',evName:'Конопля',
  harder:[10,25,50].map(n=>({req:two(P('desna-chernihiv'),P('shakhtar-donetsk',{min:n})),bonus:null})),easier:[B.DF,B.legion,B.apps(150)].map(b=>({req:two(P('desna-chernihiv'),P('shakhtar-donetsk')),bonus:b}))}));
{const md=natPart(['Молдова','Румунія'],'гравець із Молдови або Румунії','молдовани й румуни','гравця з Молдови або Румунії','гравців з Молдови або Румунії','не з Молдови і не з Румунії',n=>n===1?'1 гравець із Молдови або Румунії':`${n} гравці з Молдови або Румунії`);
 S.push(G('2026-08-27','🇲🇩 День незалежності Молдови','27 серпня Молдова святкує День незалежності. В УПЛ грали близько сорока молдован і пів сотні румунів.',{req:one(md,1),bonus:null},{
  easier:[B.nat(['Молдова','Румунія'],'🇷🇴 Молдовани й румуни','не молдованин і не румун'),B.nat(['Молдова','Румунія','Білорусь','Грузія','Вірменія','Литва','Латвія','Естонія','Азербайджан'],'🌍 Легіонери з Молдови, Румунії, Білорусі, Кавказу й Балтії','не з цих країн'),B.legion].map(b=>({req:one(md,1),bonus:b}))}));}
S.push(M('2026-08-28','kolos-kovalivka','obolon-kyiv','⚽ Колос — Оболонь 0:0','Колос і Оболонь відкрили четвертий тур нульовою нічиєю.',{big:'obolon-kyiv'}));
S.push(M('2026-08-29','shakhtar-donetsk','polissya-zhytomyr','⚽ Шахтар — Полісся 0:2','Полісся обіграло Шахтар у гостях — 2:0.',{big:'shakhtar-donetsk'}));
S.push(K('2026-08-30','dynamo-kyiv',2,'🎂 День народження Максима Шацьких','Максиму Шацьких — 48. Узбецький форвард грав в УПЛ за Динамо, Арсенал, Чорноморець і Говерлу.',{ev:'tm:9798',evName:'Шацьких',easier:[B.club('arsenal-kyiv','🔴'),B.FW,B.legion,B.legionLine('FW')]}));
S.push(M('2026-08-31','bukovyna-chernivtsi','dynamo-kyiv','⚽ Буковина — Динамо 3:0','Сенсація четвертого туру: Буковина розгромила Динамо — 3:0.',{big:'dynamo-kyiv',any:1}));
S.push(G('2026-09-01','🎂 День народження Судакова і Забарного','Георгію Судакову та Іллі Забарному — по 24: обидва народилися 1 вересня 2002 року.',{req:two(P('dynamo-kyiv',{line:'DF'}),P('shakhtar-donetsk',{line:'MF'})),bonus:null},{ev:'tm:623325',evName:'Судаков',
  easier:[B.legion,B.apps(150)].map(b=>({req:two(P('dynamo-kyiv',{line:'DF'}),P('shakhtar-donetsk',{line:'MF'})),bonus:b}))}));
S.push(M('2026-09-02','arsenal-kyiv','zorya-luhansk','📅 Арсенал — Зоря 0:5','2 вересня 2018 року Зоря розгромила Арсенал у Києві — 5:0.',{big:'zorya-luhansk'}));
S.push(G('2026-09-03','🎂 День народження Павла Кутаса','Павлу Кутасу — 44. Понад сто матчів в УПЛ він провів за Оболонь і ще 70 — за Чорноморець.',{req:two(P('obolon-kyiv'),P('chornomorets-odesa')),bonus:null},{ev:'tm:27172',evName:'Кутас',
  harder:[10,25,50].map(n=>({req:two(P('obolon-kyiv'),P('chornomorets-odesa',{min:n})),bonus:null})),easier:[B.DF,B.legion].map(b=>({req:two(P('obolon-kyiv'),P('chornomorets-odesa')),bonus:b}))}));
S.push(K('2026-09-04','shakhtar-donetsk',1,'🎂 День народження Томаша Гюбшмана','Томашу Гюбшману — 45. Чеський опорник провів за Шахтар 168 матчів в УПЛ.',{ev:'tm:9688',evName:'Гюбшман',p:{legion:true},part:null,easier:[B.MF,B.legion,B.apps(150)]}));
S.push(M('2026-09-05','kryvbas','kolos-kovalivka','⚽ Кривбас — Колос 2:2','Кривбас і Колос забили по два м’ячі — 2:2 у п’ятому турі.',{big:'kryvbas'}));
S.push(M('2026-09-06','veres-rivne','zorya-luhansk','⚽ Верес — Зоря 1:1','Верес і Зоря зіграли внічию — 1:1.',{big:'zorya-luhansk'}));
{const br=natPart(['Бразилія'],'бразилець','бразильці','бразильця','бразильців','не бразилець',n=>`${n} бразильці`);
 S.push(G('2026-09-07','🇧🇷 День незалежності Бразилії','7 вересня Бразилія святкує День незалежності. Бразильців в УПЛ грало понад 250 — більше, ніж легіонерів з будь-якої іншої країни.',{req:one(br,2),bonus:null},{
  easier:[B.nat(['Бразилія','Аргентина','Колумбія','Венесуела','Уругвай','Парагвай','Чилі','Перу','Еквадор'],'🌎 Південноамериканці','не з Південної Америки'),B.legion].map(b=>({req:one(br,2),bonus:b}))}));}
S.push(K('2026-09-08','shakhtar-donetsk',2,'🎂 День народження Бернарда','Бернарду — 34. Бразильський вінгер грав за Шахтар у 2013–2018 роках.',{ev:'tm:175169',evName:'Бернард',easier:[B.legionLine('MF'),B.legionLine('FW'),B.FW,B.legion,B.MF],harder:[{min:25},{min:50}]}));
S.push(G('2026-09-09','📅 Шахтар — Динамо 1:1','9 вересня 2016 року Шахтар і Динамо зіграли внічию — 1:1.',{req:two(P('shakhtar-donetsk'),P('dynamo-kyiv')),bonus:null},{
  harder:[10,25,50,100].map(n=>({req:two(P('shakhtar-donetsk',{min:n}),P('dynamo-kyiv',{min:n})),bonus:null}))}));
S.push(M('2026-09-10','karpaty-lviv','veres-rivne','📅 Карпати — Верес 1:6','10 вересня 2017 року Верес розгромив Карпати у Львові — 6:1.',{big:'karpaty-lviv'}));
S.push(M('2026-09-11','kolos-kovalivka','karpaty-lviv','⚽ Колос — Карпати 0:2','Карпати виграли в гостях у Колоса — 2:0.',{big:'karpaty-lviv'}));
S.push(M('2026-09-12','lnz-cherkasy','obolon-kyiv','⚽ ЛНЗ — Оболонь 3:1','ЛНЗ упевнено обіграв Оболонь — 3:1.',{big:'obolon-kyiv'}));
S.push(M('2026-09-13','bukovyna-chernivtsi','zorya-luhansk','⚽ Буковина — Зоря 1:1','Буковина і Зоря зіграли внічию — 1:1.',{big:'zorya-luhansk',any:1}));
S.push(K('2026-09-14','shakhtar-donetsk',2,'🎂 День народження Дугласа Кости','Дугласу Кості — 36. Бразилець грав за Шахтар у 2010–2015 роках, потім — Баварія і Ювентус.',{ev:'tm:75615',evName:'Коста',easier:[B.legionLine('MF'),B.legionLine('FW'),B.legion,B.FW,B.MF],harder:[{min:25},{min:50}]}));
S.push(K('2026-09-15','vorskla-poltava',2,'🎂 День народження Сергія Долганського','Сергію Долганському — 52. Воротар провів за Ворсклу 212 матчів в УПЛ.',{ev:'tm:24004',evName:'Долганський',easier:[B.GKDF,B.apps(150),B.MF,B.legion],harder:[{min:25},{min:50}]}));
S.push(G('2026-09-16','🎂 День народження Сергія Валяєва','Сергію Валяєву — 48. Півзахисник провів понад 160 матчів в УПЛ за Металіст і сто — за Дніпро.',{req:two(P('metalist-kharkiv'),P('dnipro')),bonus:null},{ev:'tm:24061',evName:'Валяєв',
  harder:[10,25,50].map(n=>({req:two(P('metalist-kharkiv',{min:n}),P('dnipro',{min:n})),bonus:null})),easier:[B.MF,B.legion].map(b=>({req:two(P('metalist-kharkiv'),P('dnipro')),bonus:b}))}));
S.push(M('2026-09-17','chornomorets-odesa','tavriya-simferopol','📅 Чорноморець — Таврія 4:3','17 вересня 1995 року Чорноморець і Таврія забили сім голів — 4:3 на користь одеситів.',{big:'chornomorets-odesa'}));
S.push(M('2026-09-18','polissya-zhytomyr','kryvbas','⚽ Полісся — Кривбас 1:0','Полісся мінімально обіграло Кривбас — 1:0.',{big:'kryvbas'}));
S.push(M('2026-09-19','zorya-luhansk','dynamo-kyiv','⚽ Зоря — Динамо 0:2','Динамо виграло в гостях у Зорі — 2:0.',{big:'dynamo-kyiv'}));
S.push(M('2026-09-20','kudrivka','kolos-kovalivka','⚽ Кудрівка — Колос 2:3','Колос вирвав перемогу в Кудрівки — 3:2.',{big:'kolos-kovalivka',any:1}));
S.push(M('2026-09-21','epicentr','kryvbas','📅 Епіцентр — Кривбас 4:5','Рік тому, 21 вересня 2025-го, Епіцентр і Кривбас забили дев’ять голів — 5:4 на користь Кривбасу.',{big:'kryvbas',any:1}));
S.push(G('2026-09-22','🎂 День народження Дмитра Гречишкіна','Дмитру Гречишкіну — 35. Півзахисник грав в УПЛ за п’ять клубів, найдовше — за Зорю та Олександрію.',{req:two(P('zorya-luhansk'),P('oleksandriya')),bonus:null},{ev:'tm:130041',evName:'Гречишкін',
  harder:[10,25,50].map(n=>({req:two(P('zorya-luhansk',{min:n}),P('oleksandriya',{min:n})),bonus:null})),easier:[B.MF,B.legion].map(b=>({req:two(P('zorya-luhansk'),P('oleksandriya')),bonus:b}))}));
S.push(M('2026-09-23','tavriya-simferopol','volyn-lutsk','📅 Таврія — Волинь 6:0','23 вересня 1994 року Таврія розгромила Волинь — 6:0.',{big:'tavriya-simferopol'}));
{const both={type:'and',of:[{type:'club',params:{club:'dynamo-kyiv'}},{type:'club',params:{club:'shakhtar-donetsk'}}],label:'гравець, який грав і за Динамо, і за Шахтар',who:{one:'гравця, який грав і за Динамо, і за Шахтар',many:'гравців, які грали і за Динамо, і за Шахтар'},_no:'не грав за обидва клуби',_sh:'Динамо і Шахтар',_lab:k=>k===1?'1 гравець, який грав і за Динамо, і за Шахтар':`${k} гравці, які грали і за Динамо, і за Шахтар`};
 S.push(G('2026-09-24','📅 Динамо — Шахтар 0:0','24 вересня 2011 року Динамо і Шахтар зіграли в Києві внічию — 0:0. Згадаймо тих, хто встиг пограти за обидва клуби.',{req:one(both,1),bonus:null},{}));}
S.push(G('2026-09-25','🎂 День народження Сергія Мізіна','Сергію Мізіну — 54. Півзахисник грав в УПЛ за вісім клубів, найдовше — за Карпати й Арсенал.',{req:two(P('karpaty-lviv'),P('arsenal-kyiv')),bonus:null},{ev:'w:1972-09-25:mizin',evName:'Мізін',
  harder:[10,25,50].map(n=>({req:two(P('karpaty-lviv',{min:n}),P('arsenal-kyiv')),bonus:null})),easier:[B.clubs(5),B.clubs(4),B.MF].map(b=>({req:two(P('karpaty-lviv'),P('arsenal-kyiv')),bonus:b}))}));
S.push(K('2026-09-26','metalurh-donetsk',2,'🎂 День народження Георгія Деметрадзе','Георгію Деметрадзе — 50. Грузинський форвард грав в УПЛ за Динамо, донецький Металург і Арсенал.',{ev:'w:1976-09-26:demetradze',evName:'Деметрадзе',bonus:B.nat(['Грузія'],'🇬🇪 Грузини','не грузин'),easier:[],harder:[{min:25},{min:50}]}));
{const tr=n=>({type:'clubs_count_min',params:{n},label:`гравець, який грав в УПЛ за ${n}+ клубів`,who:{one:`гравця з ${n}+ клубами`,many:`гравців з ${n}+ клубами`},_no:`менше ${n} клубів`,_sh:`гравці ${n}+ клубів`,_lab:k=>`${k} гравці, які грали в УПЛ за ${n}+ клубів`});
 S.push(G('2026-09-27','🧳 Всесвітній день туризму','27 вересня — Всесвітній день туризму. Згадаймо мандрівників УПЛ, які змінили по сім і більше клубів.',{req:one(tr(5),2),bonus:null},{
  harder:[{req:one(tr(6),2),bonus:null},{req:one({...tr(6),type:'and',of:[{type:'clubs_count_min',params:{n:6}},{type:'apps_total_min',params:{n:200}}],params:undefined,label:'гравець, який грав в УПЛ за 6+ клубів і провів 200+ матчів',who:{one:'гравця з 6+ клубами і 200+ матчами',many:'гравців з 6+ клубами і 200+ матчами'},_no:'менше 6 клубів або менше 200 матчів',_sh:'6+ клубів, 200+ матчів',_lab:k=>`${k} гравці, які грали в УПЛ за 6+ клубів і провели 200+ матчів`},2),bonus:null},{req:one(tr(7),2),bonus:null}],easier:[B.clubs(4)].map(b=>({req:one(tr(5),2),bonus:b}))}));}
S.push(M('2026-09-28','karpaty-lviv','shakhtar-donetsk','📅 Карпати — Шахтар 1:6','28 вересня 2018 року Шахтар розгромив Карпати у Львові — 6:1.',{big:'karpaty-lviv'}));
S.push(K('2026-09-29','dynamo-kyiv',2,'🎂 Андрію Шевченку — 50','Андрію Шевченку — 50. Володар «Золотого м’яча» 2004 року починав і завершував кар’єру в Динамо.',{ev:'w:1976-09-29:shevchenko',evName:'Шевченко',easier:[B.FW,B.apps(150),B.MF,B.legion]}));
S.push(K('2026-09-30','dnipro',2,'🎂 День народження Олександра Грицая','Олександру Грицаю — 49. За Дніпро він провів майже 200 матчів в УПЛ.',{ev:'tm:24010',evName:'Грицай',easier:[B.MF,B.apps(150),B.legion,B.FW],harder:[{min:25},{min:50}]}));
{const ng=natPart(['Нігерія'],'гравець із Нігерії','нігерійці','гравця з Нігерії','гравців з Нігерії','не з Нігерії',n=>n===1?'1 гравець із Нігерії':`${n} гравці з Нігерії`);
 const afr=['Нігерія','Камерун',"Кот-д'Івуар",'Гана','Сенегал','Туніс','Республіка Конго','ДР Конго','Гвінея','Малі','Буркіна-Фасо','Того','Бенін','ПАР','Зімбабве','Замбія','Ангола','Габон','Марокко','Алжир','Єгипет','Кабо-Верде','Мозамбік','Гамбія','Ліберія','Сьєрра-Леоне','Екваторіальна Гвінея','Гвінея-Бісау','Кенія','Уганда','Танзанія','Ефіопія','Руанда','Бурунді','Мадагаскар','Судан','Лівія','Нігер','Чад','ЦАР','Мавританія'];
 S.push(G('2026-10-01','🇳🇬 День незалежності Нігерії','1 жовтня Нігерія святкує День незалежності. Нігерійців в УПЛ грало понад 60 — від Ідахора до Ідейє.',{req:one(ng,1),bonus:null},{
  easier:[B.nat(afr,'🌍 Африканці','не з Африки'),B.legion].map(b=>({req:one(ng,1),bonus:b}))}));}
S.push(G('2026-10-02','🎂 День народження Андрія Гітченка','Андрію Гітченку — 42. Центрбек грав за шість клубів УПЛ, найдовше — за Олександрію, Десну й Карпати.',{req:two(P('oleksandriya'),P('karpaty-lviv')),bonus:null},{ev:'tm:91727',evName:'Гітченко',
  harder:[10,25,50].map(n=>({req:two(P('oleksandriya'),P('karpaty-lviv',{min:n})),bonus:null})),easier:[B.DF,B.club('desna-chernihiv','⚪'),B.legion].map(b=>({req:two(P('oleksandriya'),P('karpaty-lviv')),bonus:b}))}));
S.push(M('2026-10-03','veres-rivne','kudrivka','⚽ Верес — Кудрівка 2:1','Верес обіграв Кудрівку в перенесеному матчі шостого туру — 2:1.',{big:'veres-rivne',any:1}));
S.push(K('2026-10-04','dynamo-kyiv',2,'🎂 День народження Миколи Шапаренка','Миколі Шапаренку — 28. Півзахисник провів за Динамо понад 140 матчів в УПЛ.',{ev:'tm:368611',evName:'Шапаренко',easier:[B.MF,B.apps(150),B.legion,B.FW]}));
S.push(K('2026-10-05','shakhtar-donetsk',2,'🎂 День народження Жадсона','Жадсону — 43. Бразилець забив переможний гол Вердеру у фіналі Кубка УЄФА 2009 року.',{ev:'w:1983-10-05:jadson',evName:'Жадсон',easier:[B.MF,B.legionLine('MF'),B.legion,B.apps(150)],harder:[{min:25},{min:50}]}));
S.push(K('2026-10-06','metalurh-donetsk',2,'📅 Динамо — Металург 9:1','6 жовтня 2013 року Динамо розгромило донецький Металург — 9:1. Згадаймо гравців клубу, якого вже немає в УПЛ.',{easier:[B.FW,B.legion,B.MF,B.apps(150)]}));
S.push(K('2026-10-07','zorya-luhansk',2,'🎂 День народження Ігоря Чайковського','Ігорю Чайковському — 35. Півзахисник провів за Зорю 110 матчів в УПЛ.',{ev:'tm:94923',evName:'Чайковський',easier:[B.MF,B.apps(150),B.legion,B.FW],harder:[{min:25},{min:50}]}));
S.push(G('2026-10-08','🎂 День народження Романа Русановського','Роману Русановському — 54. Центрбек грав в УПЛ за Прикарпаття і Маріуполь.',{req:two(P('prykarpattia'),P('mariupol')),bonus:null},{ev:'w:1972-10-08:rusanovski',evName:'Русановський',
  harder:[10,25,50].map(n=>({req:two(P('prykarpattia'),P('mariupol',{min:n})),bonus:null})),easier:[B.DF,B.legion,B.apps(150)].map(b=>({req:two(P('prykarpattia'),P('mariupol')),bonus:b}))}));
// ---------- week 2026-10-16 .. 2026-10-22
S.push(M('2026-10-16','obolon-kyiv','veres-rivne','⚽ Оболонь — Верес','Оболонь приймає Верес — матч відкриває дев’ятий тур УПЛ.',{big:'obolon-kyiv',future:1}));
S.push(G('2026-10-17','🎂 День народження Віталія Вернидуба','Віталію Вернидубу — 39. Центрбек провів за Зорю 139 матчів в УПЛ, а сьогодні Зоря грає з Чорноморцем.',{req:two(P('zorya-luhansk'),P('chornomorets-odesa')),bonus:null},{ev:'tm:59973',evName:'Вернидуб',
  harder:[10,25,50].map(n=>({req:two(P('zorya-luhansk',{min:n}),P('chornomorets-odesa',{min:n})),bonus:null})),easier:[B.DF,B.legion].map(b=>({req:two(P('zorya-luhansk'),P('chornomorets-odesa')),bonus:b}))}));
S.push(M('2026-10-18','polissya-zhytomyr','dynamo-kyiv','⚽ Полісся — Динамо','Полісся приймає Динамо в дев’ятому турі.',{big:'dynamo-kyiv'}));
S.push(K('2026-10-19','dynamo-kyiv',2,'🎂 День народження Олександра Хацкевича','Олександру Хацкевичу — 53. Білоруський півзахисник грав за Динамо Лобановського з 1996 по 2004 рік.',{ev:'w:1973-10-19:hatskevich',evName:'Хацкевич',easier:[B.legionLine('MF'),B.legion,B.MF,B.apps(150)]}));
S.push(M('2026-10-20','dynamo-kyiv','metalist-kharkiv','📅 Динамо — Металіст 1:3','20 жовтня 2012 року Металіст обіграв Динамо в Києві — 3:1.',{big:'dynamo-kyiv'}));
S.push(M('2026-10-21','vorskla-poltava','kryvbas','📅 Ворскла — Кривбас 4:0','21 жовтня 1996 року Ворскла-дебютантка розгромила Кривбас — 4:0. Того сезону полтавці стали бронзовими призерами.',{big:'kryvbas'}));
S.push(K('2026-10-22','shakhtar-donetsk',2,'🎂 День народження Олександра Кучера','Олександру Кучеру — 44. Центрбек провів за Шахтар 167 матчів в УПЛ.',{ev:'tm:44357',evName:'Кучер',easier:[B.DF,B.GKDF,B.apps(150),B.legion],harder:[{min:25},{min:50}]}));
module.exports={S,task};
