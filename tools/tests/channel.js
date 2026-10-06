// Telegram channel bot (api/_channel.js) offline: two DBs (prod and test) and Telegram are stubs.
// Covers: /whoami; non-admin cannot /post, /queue or press buttons; /post <text> -> draft -> pending_approval + preview with Publish / Reject;
// photo + "/post" caption; /post test -> test DB; due DB drafts -> one preview (even with two concurrent runs), future drafts wait;
// Publish -> channel (HTML, photo), published + tg_message_id, once; Reject -> rejected; Telegram error -> failed + retry;
// prod posts only to CHANNEL_CHAT_ID from Production, test only to TEST_CHANNEL_ID; daily / Monday autoposts and /auto; ?task=channel requires the key.
// Run from repo root: node tools/tests/channel.js
const path=require('path');const {checker}=require('./_site.js');
Object.assign(process.env,{SUPABASE_URL:'https://prod.db',SUPABASE_SERVICE_KEY:'svc',TEST_SUPABASE_URL:'https://test.db',TEST_SUPABASE_SERVICE_KEY:'tsvc',
  TG_TOKEN:'123:T',TG_SECRET:'sec',OWNER_TG_ID:'777',CHANNEL_CHAT_ID:'-100111',TEST_CHANNEL_ID:'-100222',CRON_SECRET:'cron',CHANNEL_SECRET:'chan',VERCEL_ENV:'production'});
// ---- PostgREST + Telegram stub (tools/tests/_rest.js); channel_posts get server defaults on insert
let SEQ=1;
const ST=require('./_rest.js').pgStub(['https://prod.db','https://test.db'],{onInsert:(t,r)=>{if(t!=='channel_posts')return;r.id=SEQ++;r.status=r.status||'draft';r.source=r.source||'chat';r.created_at=new Date().toISOString();for(const k of ['published_at','tg_message_id','error','image_url'])if(!(k in r))r[k]=null;}});
const {DBS,tbl,TG}=ST;let FAILCHAT=null;
global.fetch=(url,o)=>{for(const k in ST.FAIL)delete ST.FAIL[k];if(FAILCHAT)ST.FAIL[FAILCHAT]={description:'Bad Request: chat not found'};return ST.fetch(url,o);};
const C=require(path.join(__dirname,'..','..','api','_channel.js'));
const BOT=require(path.join(__dirname,'..','..','api','bot.js')),CRON=require(path.join(__dirname,'..','..','api','cron.js'));
const bot=body=>new Promise(r=>BOT({method:'POST',headers:{'x-telegram-bot-api-secret-token':'sec'},body},{status(){return this;},send(){r();},json(){r();}}));
const cron=(query,auth)=>new Promise(r=>CRON({query,headers:auth?{authorization:'Bearer '+auth}:{}},{c:200,status(c){this.c=c;return this;},json(j){r({c:this.c,j});}}));
let UID=1;const msg=(from,text,x={})=>({update_id:UID++,message:{message_id:UID,chat:{id:from,type:'private'},from:{id:from,first_name:'U'+from},text,...x}});
const cbq=(from,data)=>({update_id:UID++,callback_query:{id:'q'+UID,from:{id:from},data,message:{message_id:5,chat:{id:from}}}});
const sent=(chat,re)=>TG.filter(x=>String(x.b.chat_id)===String(chat)&&(!re||re.test(x.b.text||x.b.caption||'')));
const P=()=>tbl('https://prod.db','channel_posts'),T=()=>tbl('https://test.db','channel_posts');
const row=(x)=>({id:SEQ++,text:'x',image_url:null,publish_at:'2030-10-11T07:00:00.000Z',status:'draft',source:'chat',published_at:null,tg_message_id:null,error:null,...x});
const kb=x=>(x.b.reply_markup&&x.b.reply_markup.inline_keyboard||[]).flat().map(b=>b.callback_data);
(async()=>{const T_=checker('channel');const ok=T_.check;
  ok(C.entitiesToHtml('Жирний і посилання <x>',[{type:'bold',offset:0,length:6},{type:'text_link',offset:9,length:9,url:'https://a.b/?q=1&r=2'}])==='<b>Жирний</b> і <a href="https://a.b/?q=1&amp;r=2">посилання</a> &lt;x&gt;','розмітка повідомлення → HTML Telegram');
  ok(C.checkPost({text:'x'.repeat(1025),image_url:'f'})&&!C.checkPost({text:'<b>'+'x'.repeat(1024)+'</b>',image_url:'f'})&&C.checkPost({text:'x'.repeat(4097)}),'довжина: 1024 з картинкою, 4096 без (теги не рахуються)');
  ok(C.kyivToUtc(2030,10,10,18,0).toISOString()==='2030-10-10T15:00:00.000Z'&&C.kyivToUtc(2030,1,15,18,0).toISOString()==='2030-01-15T16:00:00.000Z','час за Києвом: жовтень UTC+3, січень UTC+2');
  // /whoami and a stranger
  await bot(msg(555,'/whoami'));ok(sent(555,/Твій Telegram ID: 555/).length===1,'/whoami — будь-кому його ID');
  TG.length=0;await bot(msg(555,'/post Чужий пост'));ok(sent(555,/лише для адміністратора/).length===1&&!P().length,'чужий: /post відхилено, у базі нічого');
  TG.length=0;await bot(msg(555,'/queue'));ok(sent(555,/лише для адміністратора/).length===1,'чужий: /queue відхилено');
  TG.length=0;await bot({update_id:UID++,message:{message_id:3,chat:{id:-100900,type:'group'},from:{id:777},text:'/post у групі'}});ok(!P().length&&sent(-100900,/в особистих/).length===1,'власник у групі: /post не приймається');
  // admin: /post <text> -> draft -> pending_approval + preview
  TG.length=0;await bot(msg(777,'/post'));ok(sent(777,/Як додати пост/).length===1&&!P().length,'/post без тексту — підказка');
  TG.length=0;const t0=Date.now();await bot(msg(777,'/post Перший пост',{entities:[{type:'bot_command',offset:0,length:5},{type:'bold',offset:6,length:6}]}));
  const p1=P()[0];ok(p1&&p1.source==='owner'&&p1.text==='<b>Перший</b> пост'&&Math.abs(Date.parse(p1.publish_at)-t0)<5000,'/post: у базі текст з розміткою, source owner, publish_at = зараз');
  ok(p1&&p1.status==='pending_approval','статус pending_approval (превʼю надіслано)');
  const pv1=TG.find(x=>x.m==='sendMessage'&&String(x.b.chat_id)==='777'&&x.b.text==='<b>Перший</b> пост');
  ok(pv1&&pv1.b.parse_mode==='HTML'&&kb(pv1).join()===`cp:p:${p1.id}:pub,cp:p:${p1.id}:rej`,'власнику — превʼю з кнопками «Опублікувати» / «Відхилити»');
  ok(!tbl('https://prod.db','feedback').some(f=>/Перший пост/.test(f.text||'')),'текст поста власника не пішов у відгуки');
  ok(!TG.some(x=>/^-100/.test(String(x.b.chat_id))),'до натискання в канал нічого не йде');
  // stranger presses the buttons
  TG.length=0;await bot(cbq(555,`cp:p:${p1.id}:pub`));ok(TG.some(x=>x.m==='answerCallbackQuery'&&x.b.show_alert)&&P()[0].status==='pending_approval'&&!TG.some(x=>x.b.chat_id==='-100111'),'чужий натиснув «Опублікувати» — відмова, нічого не вийшло');
  // publish
  TG.length=0;await bot(cbq(777,`cp:p:${p1.id}:pub`));
  const out=TG.filter(x=>x.b.chat_id==='-100111');
  ok(out.length===1&&out[0].m==='sendMessage'&&out[0].b.text==='<b>Перший</b> пост'&&out[0].b.parse_mode==='HTML'&&!out[0].b.reply_markup,'«Опублікувати»: пост у CHANNEL_CHAT_ID, parse_mode HTML, без кнопок');
  ok(P()[0].status==='published'&&P()[0].tg_message_id>1000&&P()[0].published_at,'статус published, tg_message_id записано');
  ok(TG.some(x=>x.m==='editMessageReplyMarkup'&&kb(x).join()==='cp:x')&&TG.some(x=>x.m==='answerCallbackQuery'&&/Опубліковано/.test(x.b.text)),'кнопки у превʼю змінились на «Опубліковано»');
  TG.length=0;await Promise.all([bot(cbq(777,`cp:p:${p1.id}:pub`)),bot(cbq(777,`cp:p:${p1.id}:rej`))]);
  ok(!TG.some(x=>x.b.chat_id==='-100111')&&P()[0].status==='published','повторне натискання — вдруге не публікує, статус не змінився');
  // photo with "/post" caption
  TG.length=0;await bot({update_id:UID++,message:{message_id:9,chat:{id:777,type:'private'},from:{id:777},photo:[{file_id:'small'},{file_id:'BIGPHOTO'}],caption:'/post Пост з картинкою'}});
  const p2=P()[1];ok(p2&&p2.image_url==='BIGPHOTO'&&p2.text==='Пост з картинкою'&&p2.status==='pending_approval'&&TG.some(x=>x.m==='sendPhoto'&&String(x.b.chat_id)==='777'&&x.b.photo==='BIGPHOTO'),'фото з підписом «/post …» — картинка (file_id найбільшої), превʼю фото');
  TG.length=0;await bot(cbq(777,`cp:p:${p2.id}:pub`));ok(TG.some(x=>x.m==='sendPhoto'&&x.b.chat_id==='-100111'&&x.b.photo==='BIGPHOTO'&&x.b.caption==='Пост з картинкою'&&x.b.parse_mode==='HTML')&&P()[1].status==='published','з картинкою — sendPhoto з підписом у канал');
  // reject
  TG.length=0;await bot(msg(777,'/post Не треба'));const p3=P()[2];await bot(cbq(777,`cp:p:${p3.id}:rej`));
  ok(p3.status==='rejected'&&!TG.some(x=>x.b.chat_id==='-100111'),'«Відхилити» — rejected, у канал нічого');
  TG.length=0;await bot(cbq(777,`cp:p:${p3.id}:pub`));ok(!TG.some(x=>x.b.chat_id==='-100111')&&p3.status==='rejected','відхилений не опублікувати навіть старою кнопкою');
  // /post test -> test DB and TEST_CHANNEL_ID only
  TG.length=0;await bot(msg(777,'/post test Тестовий пост'));const t1=T()[0];
  ok(t1&&t1.text==='Тестовий пост'&&t1.status==='pending_approval'&&P().length===3&&TG.some(x=>/ТЕСТ · Пост #/.test(x.b.text||'')),'/post test — у тестовій базі, превʼю з позначкою ТЕСТ');
  TG.length=0;await bot(cbq(777,`cp:t:${t1.id}:pub`));ok(TG.some(x=>x.b.chat_id==='-100222')&&!TG.some(x=>x.b.chat_id==='-100111')&&t1.status==='published','тестовий пост — лише в TEST_CHANNEL_ID');
  // DB drafts: due ones -> one preview, future ones wait
  P().push(row({text:'Чернетка <i>з бази</i>',publish_at:'2030-10-11T07:00:00.000Z'}),row({text:'Майбутня',publish_at:'2030-10-12T07:00:00.000Z'}));
  const did=P()[3].id,fut=P()[4].id;
  TG.length=0;const rr=await Promise.all([C.runChannel(new Date('2030-10-11T07:05:00Z')),C.runChannel(new Date('2030-10-11T07:05:00Z'))]);
  const pv=TG.filter(x=>String(x.b.chat_id)==='777'&&x.b.text==='Чернетка <i>з бази</i>');
  ok(pv.length===1&&kb(pv[0]).join()===`cp:p:${did}:pub,cp:p:${did}:rej`&&rr[0].asked+rr[1].asked===1,'чернетка з бази (час настав) — одне превʼю власнику, навіть з двох запусків');
  ok(P()[3].status==='pending_approval'&&P()[4].status==='draft'&&!TG.some(x=>x.b.text==='Майбутня'),'pending_approval; майбутня чернетка чекає свого часу');
  TG.length=0;await C.runChannel(new Date('2030-10-11T07:15:00Z'));ok(!TG.some(x=>String(x.b.chat_id)==='777'),'наступний запуск — превʼю вдруге не надсилає');
  TG.length=0;await C.runChannel(new Date('2030-10-12T07:01:00Z'));ok(TG.some(x=>x.b.text==='Майбутня')&&P()[4].status==='pending_approval','майбутня — прийшла, коли настав її час');
  ok(!TG.some(x=>x.b.chat_id==='-100111'),'без натискання нічого не публікується');
  // Telegram error -> failed -> retry
  FAILCHAT='-100111';TG.length=0;await bot(cbq(777,`cp:p:${did}:pub`));FAILCHAT=null;const fp=P()[3];
  ok(fp.status==='failed'&&/chat not found/.test(fp.error)&&!fp.published_at&&TG.some(x=>x.m==='answerCallbackQuery'&&/Не вийшло/.test(x.b.text)&&x.b.show_alert)&&TG.some(x=>x.m==='editMessageReplyMarkup'&&kb(x)[0]===`cp:p:${did}:pub`),'помилка Telegram → failed, текст помилки, кнопка «Спробувати ще»');
  TG.length=0;await bot(cbq(777,`cp:p:${did}:pub`));ok(fp.status==='published'&&!fp.error&&TG.filter(x=>x.b.chat_id==='-100111').length===1,'«Спробувати ще» → вийшов');
  // channel not set / not production
  delete process.env.CHANNEL_CHAT_ID;TG.length=0;await bot(cbq(777,`cp:p:${fut}:pub`));
  ok(P()[4].status==='pending_approval'&&TG.some(x=>x.m==='answerCallbackQuery'&&/CHANNEL_CHAT_ID/.test(x.b.text)),'без CHANNEL_CHAT_ID — не публікує, пояснення');
  process.env.CHANNEL_CHAT_ID='-100111';process.env.VERCEL_ENV='preview';TG.length=0;await bot(cbq(777,`cp:p:${fut}:pub`));process.env.VERCEL_ENV='production';
  ok(P()[4].status==='pending_approval'&&!TG.some(x=>x.b.chat_id==='-100111'),'з тестового сайту в основний канал — ніколи');
  // /queue + show
  TG.length=0;await bot(msg(777,'/queue'));const q=sent(777,/Пости в черзі/)[0];ok(q&&/Майбутня/.test(q.b.text)&&kb(q).includes(`cp:p:${fut}:show`)&&!/Перший пост/.test(q.b.text),'/queue — пости, що чекають, з кнопками');
  TG.length=0;await bot(cbq(777,`cp:p:${fut}:show`));ok(TG.some(x=>x.b.text==='Майбутня'&&kb(x).includes(`cp:p:${fut}:pub`)),'👁 — превʼю ще раз з кнопками');
  // too long DB draft -> explanation with buttons
  P().push(row({text:'y'.repeat(5000),publish_at:'2030-10-12T08:00:00.000Z'}));TG.length=0;await C.runChannel(new Date('2030-10-12T08:01:00Z'));
  ok(sent(777,/не вийде в такому вигляді: задовгий/).length===1&&kb(sent(777,/задовгий/)[0]).includes(`cp:p:${P()[5].id}:rej`),'задовга чернетка — пояснення і кнопка «Відхилити»');
  // autoposts
  const before=P().length;await C.runChannel(new Date('2030-10-14T12:00:00Z'));   // Monday, 15:00 Kyiv time - too early
  ok(!P().slice(before).some(p=>/Драфт дня/.test(p.text)),'анонс драфту дня не готується вдень (лише ввечері напередодні)');
  TG.length=0;await C.runChannel(new Date('2030-10-14T16:00:00Z'));   // 19:00 Kyiv time - prepare tomorrow's post
  const dl=P().filter(p=>p.source==='auto'&&/Драфт дня №\d+ · 15\.10/.test(p.text));
  ok(dl.length===1&&/start=ch_daily/.test(dl[0].text)&&dl[0].status==='draft'&&dl[0].publish_at==='2030-10-15T06:00:00.000Z'&&!TG.some(x=>/Драфт дня/.test(x.b.text||'')),'автопост: анонс драфту дня на 15.10 — чернетка, прийде на схвалення о 9:00 за Києвом');
  await C.runChannel(new Date('2030-10-14T17:00:00Z'));ok(P().filter(p=>p.source==='auto'&&/Драфт дня №\d+ · 15\.10/.test(p.text)).length===1,'анонс — лише раз на день');
  TG.length=0;await C.runChannel(new Date('2030-10-15T06:01:00Z'));ok(dl[0].status==='pending_approval'&&TG.some(x=>/Драфт дня/.test(x.b.text||'')&&kb(x).includes(`cp:p:${dl[0].id}:pub`)),'о 9:00 анонс прийшов власнику на схвалення');
  tbl('https://prod.db','seasons').push({id:1,created_at:'2030-10-09T10:00:00.000Z',verified:true,practice:false,pts:85,w:27,d:4,l:-1,gf:70,ga:20,nickname:'andre',xi:[{n:'Андрій Шевченко'},{n:'Сергій Ребров'}]},
    {id:2,created_at:'2030-10-10T10:00:00.000Z',verified:true,practice:false,pts:60,w:18,d:6,l:6,gf:50,ga:30,nickname:'vitya',xi:[{n:'Андрій Шевченко'}]});
  DBS['https://prod.db'].app_marks=DBS['https://prod.db'].app_marks.filter(m=>!/^ch_week/.test(m.key));await C.runChannel(new Date('2030-10-14T04:30:00Z'));ok(!P().some(p=>/Тиждень у 30-0/.test(p.text)),'підсумки тижня не готуються вночі');await C.runChannel(new Date('2030-10-14T05:30:00Z'));
  const wk=P().find(p=>p.source==='auto'&&/Тиждень у 30-0 УПЛ/.test(p.text));
  ok(wk&&wk.publish_at==='2030-10-14T09:00:00.000Z'&&/Зіграно сезонів: <b>2<\/b>/.test(wk.text)&&/andre/.test(wk.text)&&/Андрій Шевченко<\/b> — у 2/.test(wk.text),'автопост тижня: сезони, найкращий, найчастіший гравець');
  TG.length=0;await bot(msg(777,'/auto off'));const n0=P().length;DBS['https://prod.db'].app_marks=DBS['https://prod.db'].app_marks.filter(m=>!/^ch_daily/.test(m.key)||m.key==='ch_auto_off');
  await C.runChannel(new Date('2030-10-15T16:00:00Z'));ok(sent(777,/вимкнено/).length===1&&P().length===n0,'/auto off — автопостів немає');
  const S=tbl('https://prod.db','seasons');for(let i=0;i<2500;i++)S.push({id:10+i,created_at:'2030-10-16T10:00:00.000Z',verified:true,practice:false,pts:i===2400?99:40,w:i===2400?33:12,d:4,l:14,gf:40,ga:40,nickname:i===2400?'last_page':'x',xi:[{n:'Гравець '+(i%7)}]});
  TG.length=0;await bot(msg(777,'/auto on'));ok(sent(777,/увімкнено/).length===1,'/auto on');
  await C.runChannel(new Date('2030-10-21T06:00:00Z'));const wk2=P().find(p=>p.source==='auto'&&/Тиждень у 30-0 УПЛ · 14\.10–20\.10/.test(p.text));
  ok(wk2&&/Зіграно сезонів: <b>2500<\/b>/.test(wk2.text)&&/last_page/.test(wk2.text),'підсумки тижня: 2500 сезонів (сторінками по 1000), найкращий — з останньої сторінки');
  // DB rejected the post - bot reports to admin instead of staying silent
  let REJECT=true;
  global.fetch=(f=>async(url,o={})=>{if(REJECT&&String(url).includes('/rest/v1/channel_posts')&&o.method==='POST')return {ok:false,status:400,json:async()=>({}),text:async()=>'{"code":"23514","message":"violates check constraint channel_posts_len_chk"}'};return f(url,o);})(global.fetch);
  TG.length=0;await bot(msg(777,'/post Текст, який база не прийме'));ok(sent(777,/База не прийняла пост/).length===1,'база відмовила — власнику пояснення');REJECT=false;
  // test site pointed at the prod DB - does nothing
  process.env.VERCEL_ENV='preview';const sbu=require(path.join(__dirname,'..','..','api','_league.js'));const keepU=sbu.SB_URL;sbu.SB_URL='https://qruhcbwycrnfgzzdbljr.supabase.co';
  const g=await C.runChannel(new Date());ok(g.off&&/основну базу/.test(g.off),'тестовий сайт, підключений до основної бази, — нічого не робить');sbu.SB_URL=keepU;process.env.VERCEL_ENV='production';
  // interrupted publish: published without tg_message_id - admin notified once
  P().push(row({text:'Обірваний',status:'published',published_at:'2030-10-22T07:00:00.000Z'}));
  TG.length=0;await C.runChannel(new Date('2030-10-22T07:20:00Z'));await C.runChannel(new Date('2030-10-22T07:30:00Z'));
  ok(sent(777,/публікація не підтвердилась/).length===1,'обірвана публікація — власнику одне повідомлення');
  // no admin id -> nothing
  delete process.env.OWNER_TG_ID;const off=await C.runChannel(new Date());ok(off.off&&/OWNER_TG_ID/.test(off.off),'без OWNER_TG_ID — нічого не надсилає');
  TG.length=0;await bot(msg(777,'/post Без власника'));ok(sent(777,/лише для адміністратора/).length===1,'без OWNER_TG_ID /post не працює ні для кого');process.env.OWNER_TG_ID='777';
  // run key
  ok((await cron({task:'channel'})).c===401&&(await cron({task:'channel'},'wrong')).c===401,'?task=channel без ключа / з чужим — 401');
  const rc=await cron({task:'channel'},'chan');ok(rc.c===200&&rc.j.channel&&rc.j.channel.env==='p','?task=channel з CHANNEL_SECRET — працює');
  ok((await cron({},'chan')).c===401,'CHANNEL_SECRET не відкриває щоденний підсумок ліг (лише CRON_SECRET)');
  // bot made admin of a channel: ID goes to the admin privately, nothing into the channel
  TG.length=0;await bot({update_id:UID++,my_chat_member:{chat:{id:-1003748699064,type:'channel',title:'УПЛ ностальгія',username:'upl_nostalgia'},from:{id:777},old_chat_member:{status:'left'},new_chat_member:{status:'administrator'}}});
  ok(sent(777,/-1003748699064/).length===1&&!TG.some(x=>String(x.b.chat_id)==='-1003748699064'),'бота зробили адміном каналу — ID власнику в особисті, у канал нічого');
  process.exit(T_.done());})();
