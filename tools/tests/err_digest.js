// Daily client-error digest to the admin Telegram chat (api/_errdigest.js, called by api/cron.js).
// No browser: DB and Telegram are faked. No errors → nothing sent; errors → one message; rerun the same day → no duplicate.
// Run from repo root: node tools/tests/err_digest.js
const {checker}=require('./_site.js');const {digestText,errDigest}=require('../../api/_errdigest.js');
(async()=>{const T=checker('err_digest');
  T.check(digestText([],'2026-10-02')===null,'немає помилок — немає тексту');
  const rows=[{version:'0.69',msg:"TypeError: x is <null>",line:12,screen:'draft',tg:'ios 8.0',player:'a1',n:3},{version:'0.69',msg:"TypeError: x is <null>",line:12,screen:'home',ua:'iPhone',player:'b2',n:1},{version:'0.68',msg:'boom',screen:'result',ua:'Android',n:1}];
  const t=digestText(rows,'2026-10-02');
  T.check(/Усього 5, різних 2/.test(t)&&/<b>4×<\/b> у 2/.test(t)&&/&lt;null&gt;/.test(t)&&/Telegram ios/.test(t)&&/Safari iOS/.test(t),'текст: групування, кількість, екранування HTML\n'+t);
  const env=k=>({TG_CARDS_CHAT:'-100777'})[k]||'';const sent=[],marks=new Set();
  const sb=async(p,o={})=>{if(p.startsWith('client_errors'))return /gte\./.test(p)?rows:[];if(p.startsWith('app_marks')){const k=o.body.key;if(marks.has(k))return [];marks.add(k);return [o.body];}throw new Error('?'+p);};
  const tg=async(m,b)=>{sent.push(b);return {ok:true};};
  const r1=await errDigest({sb,tg,env,day:'2026-10-02'}),r2=await errDigest({sb,tg,env,day:'2026-10-02'});
  T.check(r1.sent&&sent.length===1&&sent[0].chat_id==='-100777'&&sent[0].parse_mode==='HTML','надіслано в канал TG_CARDS_CHAT (немає TG_ERRORS_CHAT)');
  T.check(!r2.sent&&sent.length===1,'повтор того ж дня — без дубля');
  const r3=await errDigest({sb:async p=>p.startsWith('client_errors')?[]:[],tg,env,day:'2026-10-03'});
  T.check(!r3.sent&&sent.length===1,'за добу без помилок — нічого не надіслано');
  const r4=await errDigest({sb,tg,env:()=>'',day:'2026-10-04'});T.check(!r4.sent,'без чату — нічого');
  process.exit(T.done());})();
