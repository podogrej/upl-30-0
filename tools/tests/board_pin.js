// Group league board: a single message pinned once; a new day edits the same message; /top sends an unpinned copy;
// if the board message was deleted, a new one is sent and pinned. No browser: Telegram and DB are stubs.
// Run from repo root: node tools/tests/board_pin.js
const path=require('path');const {checker}=require('./_site.js');
process.env.SUPABASE_SERVICE_KEY='svc';process.env.TG_TOKEN='123:T';
const TG=[],BOARDS=[];let MID=100,DELETED=new Set(),PIN_OK=true;
global.fetch=async(url,o={})=>{const u=new URL(url),t=u.pathname.split('/').pop(),m=o.method||'GET';const J=(s,j)=>({ok:s<300,status:s,json:async()=>j,text:async()=>JSON.stringify(j)});
  if(u.hostname==='api.telegram.org'){const b=JSON.parse(o.body||'{}');TG.push({m:t,b});
    if(t==='sendMessage')return J(200,{ok:true,result:{message_id:++MID}});
    if(t==='editMessageText')return J(200,DELETED.has(b.message_id)?{ok:false,description:'Bad Request: message to edit not found'}:{ok:true});
    if(t==='pinChatMessage')return J(200,PIN_OK?{ok:true}:{ok:false,description:'not enough rights'});
    return J(200,{ok:true});}
  if(t==='league_boards'){
    if(m==='POST'){const b=JSON.parse(o.body);const old=BOARDS.find(r=>String(r.chat_id)===String(b.chat_id)&&r.day===b.day);if(old)Object.assign(old,b);else BOARDS.push({...b});return J(201,null);}
    const chat=u.searchParams.get('chat_id').replace('eq.','');return J(200,BOARDS.filter(r=>String(r.chat_id)===chat&&r.message_id!=null).sort((a,b)=>b.day.localeCompare(a.day)).slice(0,1));}
  return J(200,[]);};   // league_results, leagues, seasons are empty: board without results
const L=require(path.join(__dirname,'..','..','api','_league.js'));
const count=(m,f=()=>true)=>TG.filter(x=>x.m===m&&f(x.b)).length;
(async()=>{const T=checker('board_pin');const C=-1001;
  const m1=await L.upsertBoard(C,'2026-10-03');
  T.check(count('sendMessage')===1&&count('pinChatMessage',b=>b.message_id===m1)===1,'перше табло групи — нове повідомлення й закріплення');
  TG.length=0;await L.upsertBoard(C,'2026-10-03');
  T.check(count('editMessageText',b=>b.message_id===m1)===1&&!count('sendMessage')&&!count('pinChatMessage'),'другий результат того ж дня — лише редагування');
  TG.length=0;const m2=await L.upsertBoard(C,'2026-10-04');
  T.check(m2===m1&&count('editMessageText',b=>b.message_id===m1&&/04\.10/.test(b.text))===1&&!count('sendMessage')&&!count('pinChatMessage'),'новий день — те саме повідомлення відредаговано, нового й закріплення немає');
  T.check(BOARDS.some(r=>r.day==='2026-10-04'&&r.message_id===m1),'рядок нового дня в league_boards з тим самим message_id (для вечірнього підсумку)');
  TG.length=0;await L.upsertBoard(C,'2026-10-04',{copy:true});
  T.check(count('editMessageText')===1&&count('sendMessage')===1&&!count('pinChatMessage'),'/top — табло оновлено + копія звичайним повідомленням, без закріплення');
  DELETED.add(m1);TG.length=0;const m3=await L.upsertBoard(C,'2026-10-04');
  T.check(m3!==m1&&count('sendMessage')===1&&count('pinChatMessage',b=>b.message_id===m3)===1&&BOARDS.find(r=>r.day==='2026-10-04').message_id===m3,'табло видалили — нове повідомлення й закріплення, далі редагується нове');
  TG.length=0;await L.upsertBoard(C,'2026-10-05');T.check(count('editMessageText',b=>b.message_id===m3)===1&&!count('sendMessage'),'наступного дня редагується вже нове табло');
  PIN_OK=false;TG.length=0;const m4=await L.upsertBoard(-1002,'2026-10-05');T.check(m4&&count('sendMessage')===1,'бот не адмін — табло все одно створюється (закріпити не вдалось — не помилка)');
  process.exit(T.done());})();
