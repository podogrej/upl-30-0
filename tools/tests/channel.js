// Telegram channel bot (api/_channel.js) offline: two DBs (prod and test) and Telegram are stubs.
// Covers: /whoami; non-admin cannot /post, /queue or press buttons; /post + text -> approved post scheduled in Kyiv time; /post test + image -> test DB;
// DB draft -> preview to admin (once) -> Publish -> posted to channel (once, even with two concurrent runs);
// Telegram error -> failed + admin notified; prod posts only to CHANNEL_ID, test only to TEST_CHANNEL_ID;
// reschedule; daily / Monday autoposts and the /auto toggle; ?task=channel requires the key. Run from repo root: node tools/tests/channel.js
const path=require('path');const {checker}=require('./_site.js');
Object.assign(process.env,{SUPABASE_URL:'https://prod.db',SUPABASE_SERVICE_KEY:'svc',TEST_SUPABASE_URL:'https://test.db',TEST_SUPABASE_SERVICE_KEY:'tsvc',
  TG_TOKEN:'123:T',TG_SECRET:'sec',OWNER_TG_ID:'777',CHANNEL_ID:'-100111',TEST_CHANNEL_ID:'-100222',CRON_SECRET:'cron',CHANNEL_SECRET:'chan',VERCEL_ENV:'production'});
// ---- PostgREST stub: filters eq/neq/is/lt/lte/gt/gte/in/like, order, limit, on_conflict, Prefer return/resolution
const DBS={'https://prod.db':{},'https://test.db':{}};let SEQ=1;
const tbl=(base,t)=>(DBS[base][t]=DBS[base][t]||[]);
function match(row,k,v){const i=v.indexOf('.'),op=v.slice(0,i),a=decodeURIComponent(v.slice(i+1));const x=row[k];
  if(op==='eq')return String(x)===a;if(op==='neq')return String(x)!==a;if(op==='is')return a==='null'?x==null:String(x)===a;
  if(op==='in')return a.replace(/^\(|\)$/g,'').split(',').includes(String(x));if(op==='like')return new RegExp('^'+a.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$').test(String(x));
  const c=x==null?null:String(x);if(c==null)return false;return op==='lt'?c<a:op==='lte'?c<=a:op==='gt'?c>a:op==='gte'?c>=a:true;}
function rest(base,pathq,o){const [t,qs='']=pathq.split('?');const P=[...new URLSearchParams(qs)];const m=o.method||'GET',pref=(o.headers||{}).Prefer||'';
  const filt=P.filter(([k])=>!['select','order','limit','offset','on_conflict','apikey'].includes(k));const rows=tbl(base,t);const sel=r=>filt.every(([k,v])=>match(r,k,v));
  if(m==='GET'){let out=rows.filter(sel);const ord=(P.find(([k])=>k==='order')||[])[1];if(ord){const [c,d]=ord.split(',')[0].split('.');out=[...out].sort((a,b)=>(String(a[c])<String(b[c])?-1:1)*(d==='desc'?-1:1));}
    const lim=Math.min(1000,+((P.find(([k])=>k==='limit')||[])[1]||1000)),off=+((P.find(([k])=>k==='offset')||[])[1]||0);return out.slice(off,off+lim);}   // like Supabase: at most 1000 rows
  if(m==='POST'){const body=JSON.parse(o.body);const list=Array.isArray(body)?body:[body];const oc=(P.find(([k])=>k==='on_conflict')||[])[1];const done=[];
    for(const b of list){if(oc&&rows.some(r=>r[oc]===b[oc])){if(/ignore-duplicates/.test(pref))continue;}
      const r={...b};if(t==='channel_posts'){r.id=SEQ++;r.status=r.status||'draft';r.source=r.source||'chat';r.created_at=new Date().toISOString();for(const k of ['notified_at','published_at','tg_message_id','error','image_url'])if(!(k in r))r[k]=null;}
      if(t==='app_marks')r.at=r.at||new Date().toISOString();rows.push(r);done.push(r);}
    return /return=representation/.test(pref)?done.map(r=>({...r})):null;}
  if(m==='PATCH'){const body=JSON.parse(o.body);const hit=rows.filter(sel);for(const r of hit)Object.assign(r,body);return /return=representation/.test(pref)?hit.map(r=>({...r})):null;}
  if(m==='DELETE'){const keep=rows.filter(r=>!sel(r));DBS[base][t]=keep;return null;}}
const TG=[];let FAILCHAT=null;
global.fetch=async(url,o={})=>{const u=String(url);const J=(s,j)=>({ok:s<300,status:s,json:async()=>j,text:async()=>j==null?'':JSON.stringify(j)});
  if(u.startsWith('https://api.telegram.org/')){const method=u.split('/').pop(),b=JSON.parse(o.body||'{}');TG.push({m:method,b});
    if(/^(sendMessage|sendPhoto)$/.test(method)&&String(b.chat_id)===FAILCHAT)return J(200,{ok:false,description:'Bad Request: chat not found'});
    return J(200,{ok:true,result:{message_id:TG.length+1000}});}
  const base=Object.keys(DBS).find(b=>u.startsWith(b+'/rest/v1/'));if(!base)return J(404,{message:'?'+u});
  return J(200,rest(base,u.slice(base.length+9),o));};
const C=require(path.join(__dirname,'..','..','api','_channel.js'));
const BOT=require(path.join(__dirname,'..','..','api','bot.js')),CRON=require(path.join(__dirname,'..','..','api','cron.js'));
const bot=body=>new Promise(r=>BOT({method:'POST',headers:{'x-telegram-bot-api-secret-token':'sec'},body},{status(){return this;},send(){r();},json(){r();}}));
const cron=(query,auth)=>new Promise(r=>CRON({query,headers:auth?{authorization:'Bearer '+auth}:{}},{c:200,status(c){this.c=c;return this;},json(j){r({c:this.c,j});}}));
let UID=1;const msg=(from,text,x={})=>({update_id:UID++,message:{message_id:UID,chat:{id:from,type:'private'},from:{id:from,first_name:'U'+from},text,...x}});
const cbq=(from,data)=>({update_id:UID++,callback_query:{id:'q'+UID,from:{id:from},data,message:{message_id:5,chat:{id:from}}}});
const sent=(chat,re)=>TG.filter(x=>String(x.b.chat_id)===String(chat)&&(!re||re.test(x.b.text||x.b.caption||'')));
const P=()=>tbl('https://prod.db','channel_posts'),T=()=>tbl('https://test.db','channel_posts');
(async()=>{const T_=checker('channel');const ok=T_.check;
  // times
  ok(C.parseWhen('10.10.2030 18:00').toISOString()==='2030-10-10T15:00:00.000Z'&&C.parseWhen('15.01.2030 18:00').toISOString()==='2030-01-15T16:00:00.000Z','час за Києвом: жовтень UTC+3, січень UTC+2');
  ok(C.parseWhen('31.02.2030 10:00')===null&&C.parseWhen('25:00')===null&&C.parseWhen('абв')===null,'неправильний час — не приймається');
  ok(C.entitiesToHtml('Жирний і посилання <x>',[{type:'bold',offset:0,length:6},{type:'text_link',offset:9,length:9,url:'https://a.b/?q=1&r=2'}])==='<b>Жирний</b> і <a href="https://a.b/?q=1&amp;r=2">посилання</a> &lt;x&gt;','розмітка повідомлення → HTML Telegram');
  ok(C.checkPost({text:'x'.repeat(1025),image_url:'f'})&&!C.checkPost({text:'<b>'+'x'.repeat(1024)+'</b>',image_url:'f'})&&C.checkPost({text:'x'.repeat(4097)}),'довжина: 1024 з картинкою, 4096 без (теги не рахуються)');
  // /whoami and a stranger
  await bot(msg(555,'/whoami'));ok(sent(555,/Твій Telegram ID: 555/).length===1,'/whoami — будь-кому його ID');
  TG.length=0;await bot(msg(555,'/post 10.10.2030 18:00'));await bot(msg(555,'Чужий пост'));
  ok(sent(555,/лише для адміністратора/).length===1&&!P().length,'чужий: /post відхилено, у базі нічого');
  TG.length=0;await bot(msg(555,'/queue'));ok(sent(555,/лише для адміністратора/).length===1,'чужий: /queue відхилено');
  // admin: /post + text -> approved
  TG.length=0;await bot(msg(777,'/post 10.10.2030 18:00'));ok(sent(777,/Надішли текст поста/).length===1,'власник: /post — бот чекає текст');
  await bot(msg(777,'Перший пост',{entities:[{type:'bold',offset:0,length:6}]}));
  const p1=P()[0];ok(p1&&p1.status==='approved'&&p1.source==='owner'&&p1.publish_at==='2030-10-10T15:00:00.000Z'&&p1.text==='<b>Перший</b> пост','пост у черзі: approved, owner, час 15:00 UTC, розмітка збережена');
  ok(sent(777,/Заплановано: пост #/).length===1&&TG.some(x=>x.m==='sendMessage'&&x.b.chat_id===777&&x.b.text==='<b>Перший</b> пост'&&x.b.parse_mode==='HTML'),'власнику — підтвердження й вигляд поста');
  ok(!tbl('https://prod.db','feedback').some(f=>/Перший пост/.test(f.text||'')),'текст поста власника не пішов у відгуки');
  // /post test + image -> test DB
  TG.length=0;await bot(msg(777,'/post test 10.10.2030 19:00'));await bot({update_id:UID++,message:{message_id:9,chat:{id:777,type:'private'},from:{id:777},photo:[{file_id:'small'},{file_id:'BIGPHOTO'}],caption:'Тестова картинка'}});
  const t1=T()[0];ok(t1&&t1.image_url==='BIGPHOTO'&&t1.text==='Тестова картинка'&&P().length===1,'/post test з картинкою — у тестовій базі (file_id найбільшої)');
  // publish: prod
  TG.length=0;let r=await C.runChannel(new Date('2030-10-10T15:05:00Z'));
  ok(r.published===1&&TG.filter(x=>x.b.chat_id==='-100111').length===1&&!TG.some(x=>x.b.chat_id==='-100222'),'прод: пост вийшов у CHANNEL_ID, у тестовий — нічого');
  ok(P()[0].status==='published'&&P()[0].tg_message_id>1000&&P()[0].published_at,'статус published, tg_message_id записано');
  TG.length=0;r=await C.runChannel(new Date('2030-10-10T15:15:00Z'));ok(r.published===0&&!TG.some(x=>x.b.chat_id==='-100111'),'повторний запуск — вдруге не публікує');
  // test site: TEST_CHANNEL_ID only
  process.env.VERCEL_ENV='preview';const save=DBS['https://prod.db'];DBS['https://prod.db']=DBS['https://test.db'];   // on the test site SUPABASE_URL points to the test DB
  TG.length=0;r=await C.runChannel(new Date('2030-10-10T16:05:00Z'));
  ok(r.env==='t'&&r.published===1&&TG.some(x=>x.m==='sendPhoto'&&x.b.chat_id==='-100222'&&x.b.photo==='BIGPHOTO')&&!TG.some(x=>x.b.chat_id==='-100111'),'тестовий сайт: картинка вийшла в TEST_CHANNEL_ID, у прод-канал — ні');
  DBS['https://prod.db']=save;process.env.VERCEL_ENV='production';
  // DB draft -> preview to admin -> approve -> publish
  P().push({id:SEQ++,text:'Чернетка <i>з бази</i>',image_url:null,publish_at:'2030-10-11T07:00:00.000Z',status:'draft',source:'chat',notified_at:null,published_at:null,tg_message_id:null,error:null});
  const did=P()[P().length-1].id;
  TG.length=0;await Promise.all([C.runChannel(new Date('2030-10-11T06:00:00Z')),C.runChannel(new Date('2030-10-11T06:00:00Z'))]);
  const pv=TG.filter(x=>x.b.chat_id==='777'&&x.b.text==='Чернетка <i>з бази</i>');
  ok(pv.length===1&&pv[0].b.reply_markup.inline_keyboard.flat().some(b=>b.callback_data===`cp:p:${did}:ok`)&&/Опублікувати за розкладом · 11\.10 10:00/.test(JSON.stringify(pv[0].b.reply_markup)),'чернетка — один перегляд власнику (навіть з двох запусків), кнопки й час 11.10 10:00');
  TG.length=0;await C.runChannel(new Date('2030-10-11T06:10:00Z'));ok(!TG.some(x=>x.b.chat_id==='777'),'чернетку не надсилає вдруге');
  TG.length=0;await bot(cbq(555,`cp:p:${did}:ok`));ok(TG.some(x=>x.m==='answerCallbackQuery'&&x.b.show_alert)&&P().find(p=>p.id===did).status==='draft','чужий натиснув «Опублікувати» — відмова, статус не змінився');
  TG.length=0;await C.runChannel(new Date('2030-10-11T07:05:00Z'));ok(!TG.some(x=>x.b.chat_id==='-100111'),'чернетка без схвалення не виходить');
  await bot(cbq(777,`cp:p:${did}:ok`));ok(P().find(p=>p.id===did).status==='approved'&&TG.some(x=>x.m==='editMessageReplyMarkup'),'власник схвалив — approved, кнопки оновлено');
  TG.length=0;await Promise.all([C.runChannel(new Date('2030-10-11T07:06:00Z')),C.runChannel(new Date('2030-10-11T07:06:00Z'))]);
  ok(TG.filter(x=>x.b.chat_id==='-100111').length===1,'схвалений вийшов один раз (два запуски одночасно)');
  // reschedule
  P().push({id:SEQ++,text:'Інший',image_url:null,publish_at:'2030-10-12T07:00:00.000Z',status:'draft',source:'chat',notified_at:'x',published_at:null,tg_message_id:null,error:null});const tid=P()[P().length-1].id;
  TG.length=0;await bot(cbq(777,`cp:p:${tid}:time`));await bot(msg(777,'12.10.2030 21:30'));
  ok(P().find(p=>p.id===tid).publish_at==='2030-10-12T18:30:00.000Z'&&sent(777,/новий час 12\.10 21:30/).length===1,'«Змінити час» → новий час 21:30 за Києвом');
  await bot(cbq(777,`cp:p:${tid}:skip`));ok(P().find(p=>p.id===tid).status==='skipped','«Пропустити» → skipped');
  // Telegram error
  P().push({id:SEQ++,text:'Зламаний',image_url:null,publish_at:'2030-10-13T07:00:00.000Z',status:'approved',source:'chat',notified_at:'x',published_at:null,tg_message_id:null,error:null});const fid=P()[P().length-1].id;
  FAILCHAT='-100111';TG.length=0;await C.runChannel(new Date('2030-10-13T07:01:00Z'));FAILCHAT=null;const fp=P().find(p=>p.id===fid);
  ok(fp.status==='failed'&&/chat not found/.test(fp.error)&&!fp.published_at&&sent(777,/не вийшов: Bad Request/).length===1,'помилка Telegram → failed, текст помилки, власнику повідомлення');
  await bot(cbq(777,`cp:p:${fid}:ok`));TG.length=0;await C.runChannel(new Date('2030-10-13T07:02:00Z'));ok(P().find(p=>p.id===fid).status==='published','«Спробувати ще» → вийшов');
  // /queue
  P().push({id:SEQ++,text:'У черзі',image_url:null,publish_at:'2030-10-20T07:00:00.000Z',status:'approved',source:'chat',notified_at:'x',published_at:null,tg_message_id:null,error:null});
  TG.length=0;await bot(msg(777,'/queue'));const q=sent(777,/Найближчі пости/)[0];ok(q&&/У черзі/.test(q.b.text)&&q.b.reply_markup.inline_keyboard.flat().length>=1,'/queue — список з кнопками');
  // autoposts
  TG.length=0;const before=P().length;await C.runChannel(new Date('2030-10-14T12:00:00Z'));   // Monday, 15:00 Kyiv time - too early
  ok(!P().slice(before).some(p=>/Драфт дня/.test(p.text)),'анонс драфту дня не готується вдень (лише ввечері напередодні)');
  await C.runChannel(new Date('2030-10-14T16:00:00Z'));   // 19:00 Kyiv time - prepare tomorrow's post
  const dl=P().filter(p=>p.source==='auto'&&/Драфт дня №\d+ · 15\.10/.test(p.text));
  ok(dl.length===1&&/start=ch_daily/.test(dl[0].text)&&dl[0].status==='draft'&&dl[0].publish_at==='2030-10-15T06:00:00.000Z','автопост: анонс драфту дня на 15.10 — чернетка, вийде о 9:00 за Києвом, з посиланням ch_daily');
  await C.runChannel(new Date('2030-10-14T17:00:00Z'));ok(P().filter(p=>p.source==='auto'&&/Драфт дня №\d+ · 15\.10/.test(p.text)).length===1,'анонс — лише раз на день');
  tbl('https://prod.db','seasons').push({id:1,created_at:'2030-10-09T10:00:00.000Z',verified:true,practice:false,pts:85,w:27,d:4,l:-1+0,gf:70,ga:20,nickname:'andre',xi:[{n:'Андрій Шевченко'},{n:'Сергій Ребров'}]},
    {id:2,created_at:'2030-10-10T10:00:00.000Z',verified:true,practice:false,pts:60,w:18,d:6,l:6,gf:50,ga:30,nickname:'vitya',xi:[{n:'Андрій Шевченко'}]});
  DBS['https://prod.db'].app_marks=DBS['https://prod.db'].app_marks.filter(m=>!/^ch_week/.test(m.key));await C.runChannel(new Date('2030-10-14T04:30:00Z'));ok(!P().some(p=>/Тиждень у 30-0/.test(p.text)),'підсумки тижня не готуються вночі');await C.runChannel(new Date('2030-10-14T05:30:00Z'));
  const wk=P().find(p=>p.source==='auto'&&/Тиждень у 30-0 УПЛ/.test(p.text));
  ok(wk&&wk.publish_at==='2030-10-14T09:00:00.000Z'&&/Зіграно сезонів: <b>2<\/b>/.test(wk.text)&&/andre/.test(wk.text)&&/Андрій Шевченко<\/b> — у 2/.test(wk.text),'автопост тижня: сезони, найкращий, найчастіший гравець');
  TG.length=0;await bot(msg(777,'/auto off'));const n0=P().length;DBS['https://prod.db'].app_marks=DBS['https://prod.db'].app_marks.filter(m=>!/^ch_daily/.test(m.key)||m.key==='ch_auto_off');
  await C.runChannel(new Date('2030-10-15T16:00:00Z'));ok(sent(777,/вимкнено/).length===1&&P().length===n0,'/auto off — автопостів немає');
  // over 1000 seasons per week - read in pages
  const S=tbl('https://prod.db','seasons');for(let i=0;i<2500;i++)S.push({id:10+i,created_at:'2030-10-16T10:00:00.000Z',verified:true,practice:false,pts:i===2400?99:40,w:i===2400?33:12,d:4,l:14,gf:40,ga:40,nickname:i===2400?'last_page':'x',xi:[{n:'Гравець '+(i%7)}]});
  DBS['https://prod.db'].app_marks=DBS['https://prod.db'].app_marks.filter(m=>m.key!=='ch_auto_off');
  await C.runChannel(new Date('2030-10-21T06:00:00Z'));const wk2=P().find(p=>p.source==='auto'&&/Тиждень у 30-0 УПЛ · 14\.10–20\.10/.test(p.text));
  ok(wk2&&/Зіграно сезонів: <b>2500<\/b>/.test(wk2.text)&&/last_page/.test(wk2.text),'підсумки тижня: 2500 сезонів (сторінками по 1000), найкращий — з останньої сторінки');
  // DB rejected the post - bot reports to admin instead of staying silent
  const realRest=rest;let REJECT=true;
  global.fetch=(f=>async(url,o={})=>{if(REJECT&&String(url).includes('/rest/v1/channel_posts')&&o.method==='POST')return {ok:false,status:400,json:async()=>({}),text:async()=>'{"code":"23514","message":"violates check constraint channel_posts_len_chk"}'};return f(url,o);})(global.fetch);
  TG.length=0;await bot(msg(777,'/post 25.10.2030 10:00'));await bot(msg(777,'Текст, який база не прийме'));
  ok(sent(777,/База не прийняла пост/).length===1,'база відмовила — власнику пояснення');REJECT=false;
  // test site pointed at the prod DB - does not publish
  process.env.VERCEL_ENV='preview';const sbu=require(path.join(__dirname,'..','..','api','_league.js'));const keepU=sbu.SB_URL;sbu.SB_URL='https://qruhcbwycrnfgzzdbljr.supabase.co';
  const g=await C.runChannel(new Date());ok(g.off&&/основну базу/.test(g.off),'тестовий сайт, підключений до основної бази, — не публікує');sbu.SB_URL=keepU;process.env.VERCEL_ENV='production';
  // interrupted publish: published without tg_message_id - admin notified once
  P().push({id:SEQ++,text:'Обірваний',image_url:null,publish_at:'2030-10-22T07:00:00.000Z',status:'published',source:'chat',notified_at:'x',published_at:'2030-10-22T07:00:00.000Z',tg_message_id:null,error:null});
  TG.length=0;await C.runChannel(new Date('2030-10-22T07:20:00Z'));await C.runChannel(new Date('2030-10-22T07:30:00Z'));
  ok(sent(777,/публікація не підтвердилась/).length===1,'обірвана публікація — власнику одне повідомлення');
  // run key
  ok((await cron({task:'channel'})).c===401&&(await cron({task:'channel'},'wrong')).c===401,'?task=channel без ключа / з чужим — 401');
  const rc=await cron({task:'channel'},'chan');ok(rc.c===200&&rc.j.channel&&rc.j.channel.env==='p','?task=channel з CHANNEL_SECRET — працює');
  ok((await cron({},'chan')).c===401,'CHANNEL_SECRET не відкриває щоденний підсумок ліг (лише CRON_SECRET)');
  delete process.env.CHANNEL_ID;const off=await C.runChannel(new Date());ok(off.off&&/CHANNEL_ID/.test(off.off),'без CHANNEL_ID прод нічого не публікує');
  process.exit(T_.done());})();
