// Feedback: a player DMs the bot (text, screenshot, album) → forwarded to the admin chat (TG_CARDS_CHAT / TG_FEEDBACK_CHAT),
// a row in the feedback table, "thanks" reply at most once a minute; commands and group messages are not feedback. No browser; Telegram and DB are stubs.
// Run from repo root: node tools/tests/feedback.js
const path=require('path');const {checker}=require('./_site.js');
process.env.SUPABASE_SERVICE_KEY='svc';process.env.TG_TOKEN='123:T';process.env.TG_SECRET='sec';process.env.TG_CARDS_CHAT='-100999';
const TG=[],DB={feedback:[]};let NOTABLE=false,OLDCOLS=false;
global.fetch=async(url,o={})=>{const u=new URL(url),t=u.pathname.split('/').pop(),m=o.method||'GET';const J=(s,j)=>({ok:s<300,status:s,json:async()=>j,text:async()=>JSON.stringify(j)});
  if(u.hostname==='api.telegram.org'){TG.push({m:t,b:JSON.parse(o.body||'{}')});return J(200,{ok:true,result:{message_id:1}});}
  if(t==='feedback'){if(NOTABLE)return J(404,{message:'relation does not exist'});
    if(m==='POST'&&OLDCOLS&&'source' in JSON.parse(o.body))return J(400,{code:'PGRST204',message:"Could not find the 'contact' column"});
    if(m==='POST'){DB.feedback.push({...JSON.parse(o.body),at:new Date().toISOString()});return J(201,null);}
    const uid=u.searchParams.get('tg_user_id').replace('eq.','');return J(200,DB.feedback.filter(r=>String(r.tg_user_id)===uid));}
  return J(200,[]);};
const H=require(path.join(__dirname,'..','..','api','bot.js'));
const send=body=>new Promise(r=>H({method:'POST',headers:{'x-telegram-bot-api-secret-token':'sec'},body},{status(){return this;},send(){r();},json(){r();}}));
const msg=(id,x)=>({update_id:id,message:{message_id:id,chat:{id:777,type:'private'},from:{id:777,first_name:'Віктор',username:'vitya'},...x}});
(async()=>{const T=checker('feedback');
  await send(msg(1,{text:'/start feedback'}));
  T.check(TG.some(x=>x.m==='sendMessage'&&x.b.chat_id===777&&/Напиши, що подобається/.test(x.b.text))&&!DB.feedback.length,'/start feedback — бот просить написати відгук, у базу нічого');
  TG.length=0;await send(msg(2,{text:'Колесо крутиться повільно на iPhone'}));
  const fw=TG.find(x=>x.m==='forwardMessage');
  T.check(fw&&fw.b.chat_id==='-100999'&&fw.b.from_chat_id===777&&fw.b.message_id===2,'текст переслано власнику в канал карток');
  T.check(TG.some(x=>x.m==='sendMessage'&&x.b.chat_id==='-100999'&&/Відгук: Віктор \(@vitya\) · id 777/.test(x.b.text)),'перед пересилкою — хто написав');
  T.check(DB.feedback.length===1&&DB.feedback[0].text==='Колесо крутиться повільно на iPhone'&&DB.feedback[0].kind==='text'&&DB.feedback[0].forwarded===true,'рядок у таблиці feedback');
  T.check(TG.some(x=>x.m==='sendMessage'&&x.b.chat_id===777&&/Дякую/.test(x.b.text)),'гравцю — «Дякую! Передав розробнику»');
  TG.length=0;await send(msg(3,{photo:[{file_id:'s'},{file_id:'BIG'}],caption:'ось скрін'}));
  T.check(TG.some(x=>x.m==='forwardMessage'&&x.b.message_id===3)&&DB.feedback[1].kind==='photo'&&DB.feedback[1].file_id==='BIG'&&DB.feedback[1].text==='ось скрін','скрін з підписом переслано й записано (найбільший розмір)');
  T.check(!TG.some(x=>x.m==='sendMessage'&&x.b.chat_id===777),'друге повідомлення протягом хвилини — без повторного «Дякую»');
  TG.length=0;await send(msg(4,{text:'/top'}));T.check(!TG.some(x=>x.m==='forwardMessage')&&DB.feedback.length===2,'команда — не відгук');
  TG.length=0;await send({update_id:5,message:{message_id:5,chat:{id:-100555,type:'supergroup'},from:{id:777},text:'привіт усім'}});
  T.check(!TG.some(x=>x.m==='forwardMessage')&&DB.feedback.length===2,'повідомлення в групі — не відгук');
  NOTABLE=true;TG.length=0;await send({update_id:6,message:{message_id:6,chat:{id:888,type:'private'},from:{id:888,first_name:'Новий'},text:'класна гра'}});
  T.check(TG.some(x=>x.m==='forwardMessage'&&x.b.message_id===6)&&TG.some(x=>x.m==='sendMessage'&&x.b.chat_id===888&&/Дякую/.test(x.b.text)),'таблиці ще немає (SQL не виконано) — пересилка й «Дякую» все одно працюють');
  // site footer feedback form → /api/err ({feedback}) → admin Telegram chat and a feedback row (source site, contact, version)
  NOTABLE=false;DB.feedback.length=0;TG.length=0;
  const E=require(path.join(__dirname,'..','..','api','err.js'));
  const post=body=>new Promise(r=>{const res={c:200,status(c){this.c=c;return this;},json(j){r({c:this.c,j});},end(){r({c:this.c});}};E({method:'POST',headers:{'user-agent':'UA test','x-forwarded-for':'1.2.3.4'},body},res);});
  let r=await post({version:'0.69.69',screen:'home',player:'p123',feedback:{text:'  На iPad «Інший сезон» не тиснеться  ',contact:'@andrii_k'}});
  const tm=TG.find(x=>x.m==='sendMessage'&&x.b.chat_id==='-100999');
  T.check(r.c===200&&r.j&&r.j.ok&&tm&&/Відгук із сайту · 0\.69\.69 · home/.test(tm.b.text)&&/контакт: @andrii_k/.test(tm.b.text)&&/гравець p123/.test(tm.b.text)&&/На iPad «Інший сезон» не тиснеться$/.test(tm.b.text),'сайт: відгук пішов власнику в Telegram з версією, екраном, гравцем і контактом');
  const fr=DB.feedback[0]||{};
  T.check(DB.feedback.length===1&&fr.source==='site'&&fr.contact==='@andrii_k'&&fr.version==='0.69.69'&&fr.player==='p123'&&fr.ua==='UA test'&&fr.text==='На iPad «Інший сезон» не тиснеться'&&fr.forwarded===true&&fr.tg_user_id===null,'сайт: рядок feedback з новими колонками');
  r=await post({feedback:{text:'   '}});T.check(r.c===400&&DB.feedback.length===1,'сайт: порожній відгук — 400, нічого не записано');
  r=await post({feedback:{text:'x'.repeat(5000),contact:'y'.repeat(300)}});T.check(r.c===200&&DB.feedback[1].text.length===2000&&DB.feedback[1].contact.length===100,'сайт: довгий текст і контакт обрізано (2000 / 100)');
  OLDCOLS=true;r=await post({feedback:{text:'стара база',contact:'a@b.c'}});
  T.check(r.c===200&&DB.feedback[2]&&!('source' in DB.feedback[2])&&/стара база\n\n\[контакт: a@b\.c\]/.test(DB.feedback[2].text),'сайт: SQL 0.69.69 ще не виконано — рядок без нових колонок, контакт у тексті');
  OLDCOLS=false;r=await post({errors:[]});T.check(r.c===204,'звичайний звіт про помилки — як і раніше 204');
  process.exit(T.done());})();
