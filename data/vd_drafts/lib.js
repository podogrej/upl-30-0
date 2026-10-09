// text builders for challenge conditions (Ukrainian player texts)
const C={ // nom, gen, acc
 'dynamo-kyiv':['Динамо','Динамо','Динамо'],'shakhtar-donetsk':['Шахтар','Шахтаря','Шахтар'],'karpaty-lviv':['Карпати','Карпат','Карпати'],
 'veres-rivne':['Верес','Вереса','Верес'],'kolos-kovalivka':['Колос','Колоса','Колос'],'zorya-luhansk':['Зоря','Зорі','Зорю'],
 'kryvbas':['Кривбас','Кривбасу','Кривбас'],'polissya-zhytomyr':['Полісся','Полісся','Полісся'],'chornomorets-odesa':['Чорноморець','Чорноморця','Чорноморець'],
 'obolon-kyiv':['Оболонь','Оболоні','Оболонь'],'lnz-cherkasy':['ЛНЗ','ЛНЗ','ЛНЗ'],'bukovyna-chernivtsi':['Буковина','Буковини','Буковину'],
 'epicentr':['Епіцентр','Епіцентру','Епіцентр'],'livyi-bereh-kyiv':['Лівий Берег','Лівого Берега','Лівий Берег'],'kudrivka':['Кудрівка','Кудрівки','Кудрівку'],
 'tavriya-simferopol':['Таврія','Таврії','Таврію'],'metalurh-zaporizhzhia':['Металург (Запоріжжя)','Металурга (Запоріжжя)','Металург (Запоріжжя)'],
 'metalurh-donetsk':['Металург (Донецьк)','Металурга (Донецьк)','Металург (Донецьк)'],'metalist-kharkiv':['Металіст','Металіста','Металіст'],
 'metalist-1925':['Металіст 1925','Металіста 1925','Металіст 1925'],'arsenal-kyiv':['Арсенал','Арсеналу','Арсенал'],
 'hoverla-uzhhorod':['Говерла','Говерли','Говерлу'],'nyva-vinnytsia':['Нива (Вінниця)','Ниви (Вінниця)','Ниву (Вінниця)'],'vorskla-poltava':['Ворскла','Ворскли','Ворсклу'],
 'dnipro':['Дніпро','Дніпра','Дніпро'],'mariupol':['Маріуполь','Маріуполя','Маріуполь'],'oleksandriya':['Олександрія','Олександрії','Олександрію'],
 'desna-chernihiv':['Десна','Десни','Десну'],'volyn-lutsk':['Волинь','Волині','Волинь'],'prykarpattia':['Прикарпаття','Прикарпаття','Прикарпаття']};
const N2=(n,one,few,many)=>{const a=n%10,b=n%100;return a===1&&b!==11?one:(a>=2&&a<=4&&(b<12||b>14))?few:many;};
const pl=n=>`${n} ${N2(n,'гравець','гравці','гравців')}`;
// club part: {club, min (apps for club), line ('DF'|'MF'|'FW'), legion}
const LINE={DF:['захисник','захисника','захисників'],MF:['півзахисник','півзахисника','півзахисників'],FW:['нападник','нападника','нападників']};
function clubPart(club,o={}){const [nom,gen,acc]=C[club];let cond,base,one,many,no,sh;
  if(o.min){cond={type:'club_apps_min',params:{club,n:o.min}};}else cond={type:'club',params:{club}};
  const noun1=o.line?LINE[o.line][0]:o.legion?'легіонер':'гравець',nounG1=o.line?LINE[o.line][1]:o.legion?'легіонера':'гравця',nounGm=o.line?LINE[o.line][2]:o.legion?'легіонерів':'гравців';
  const tail=o.min?` з ${o.min}+ матчами за клуб`:'';
  if(o.line)cond={type:'and',of:[cond,{type:'line',params:{lines:[o.line]}}]};
  if(o.legion)cond={type:'and',of:[cond,{type:'nationality',params:{except:['Україна']}}]};
  const label=`${noun1} ${gen}${tail}`;
  no=o.min?`менше ${o.min} матчів за ${acc}`:`не грав за ${acc}`;
  if(o.line)no+=` або не ${LINE[o.line][0]}`;if(o.legion)no+=' або не легіонер';
  sh=nom+(o.min?` (${o.min}+)`:'')+(o.line?` · ${LINE[o.line][2]}`:'')+(o.legion?' · легіонери':'');
  return {...cond,label,who:{one:`${nounG1} ${gen}${tail}`,many:`${nounGm} ${gen}${tail}`},_no:no,_sh:sh,_nom:nom,_acc:acc,_plain:!o.min&&!o.line&&!o.legion};}
function two(a,b){const pa={...a},pb={...b};const no=a._plain&&b._plain?`не грав ні за ${a._acc}, ні за ${b._acc}`:`${a._no}, ${b._no}`;
  const req={parts:[a,b].map(p=>({...strip(p),count:1})),label:`1 ${a.label} і 1 ${b.label}`,short:`${a._sh} і ${b._sh}`,no};return req;}
function one(p,n){return {...strip(p),count:n,label:p._lab?p._lab(n):`${n} ${p.label.replace(/^(гравець|захисник|півзахисник|нападник|легіонер)/,(m)=>({гравець:N2(n,'гравець','гравці','гравців'),захисник:N2(n,'захисник','захисники','захисників'),півзахисник:N2(n,'півзахисник','півзахисники','півзахисників'),нападник:N2(n,'нападник','нападники','нападників'),легіонер:N2(n,'легіонер','легіонери','легіонерів')})[m])}`,short:p._sh,no:p._no};}
const strip=p=>{const o={};for(const k in p)if(!k.startsWith('_'))o[k]=p[k];if(o.type!=='club'&&o.type!=='club_apps_min'){}return o;};
// generic condition with own texts
const cond=(c,label,short,who1,whoN,no)=>({...c,label,short,who:{one:who1,many:whoN},no});
// bonus library
const B={
 FW:{type:'line',params:{lines:['FW']},label:'⚔️ Нападники',no:'не нападник'},
 MF:{type:'line',params:{lines:['MF']},label:'⚙️ Півзахисники',no:'не півзахисник'},
 DF:{type:'line',params:{lines:['DF']},label:'🛡️ Захисники',no:'не захисник'},
 GKDF:{type:'line',params:{lines:['GK','DF']},label:'🧤 Воротарі й захисники',no:'не воротар і не захисник'},
 legion:{type:'nationality',params:{except:['Україна']},label:'🌍 Легіонери',no:'не легіонер'},
 apps:n=>({type:'apps_total_min',params:{n},label:`🎖️ ${n}+ матчів в УПЛ`,no:`менше ${n} матчів в УПЛ`}),
 clubs:n=>({type:'clubs_count_min',params:{n},label:`🧳 Гравці ${n}+ клубів`,no:`менше ${n} клубів`}),
 club:(c,emo='⚽')=>({type:'club',params:{club:c},label:`${emo} Гравці ${C[c][1]}`,no:`не грав за ${C[c][2]}`}),
 nat:(nats,label,no)=>({type:'nationality',params:{nats},label,no}),
 legionLine:(l)=>({type:'and',of:[{type:'nationality',params:{except:['Україна']}},{type:'line',params:{lines:[l]}}],label:`🌍 Легіонери-${{FW:'нападники',MF:'півзахисники',DF:'захисники'}[l]}`,no:`не легіонер або не ${LINE[l][0]}`}),
};
module.exports={C,clubPart,two,one,cond,B,N2,pl};
