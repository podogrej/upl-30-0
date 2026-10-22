// Daily digest warns when daily challenges are about to run out (api/_errdigest.js, errDigest({challenges})).
// Fewer than 10 days left counting `day` (last challenge day < day+9) -> first line is a warning with the last date DD.MM,
// and the digest is sent even with zero errors. 10+ days -> old behaviour. DB and Telegram are faked.
// Run from repo root: node tools/tests/vd_digest.js
const {checker}=require('./_site.js');const {errDigest}=require('../../api/_errdigest.js');
const ch=days=>days.map(d=>({day:d,title:'t'}));
const ERR=[{version:'0.99',msg:'boom',screen:'home',ua:'iPhone',player:'a1',n:2}];
async function run(challenges,rows,day='2026-10-22'){
  const sent=[],marks=new Set();
  const sb=async(p,o={})=>{if(p.startsWith('client_errors'))return rows;if(p.startsWith('app_marks')){if(o.method==='DELETE')return [];const k=o.body.key;if(marks.has(k))return [];marks.add(k);return [o.body];}throw new Error('?'+p);};
  const tg=async(m,b)=>{sent.push(b);return {ok:true};};
  const r=await errDigest({sb,tg,env:k=>k==='TG_CARDS_CHAT'?'-100777':'',day,challenges});
  return {r,sent,text:sent[0]&&sent[0].text||''};
}
const first=t=>t.split('\n')[0];
(async()=>{const T=checker('vd_digest');
  // 7 days left (22..28.10), unsorted on purpose: the last date is the max, not the last element
  let x=await run(ch(['2026-10-28','2026-10-22','2026-10-25']),[]);
  T.check(x.r.sent&&x.sent.length===1,'виклики до 28.10, день 22.10, помилок немає — зведення все одно надіслано');
  T.check(/28\.10/.test(first(x.text))&&/[іїєґа-я]/i.test(first(x.text)),'перший рядок — попередження з датою 28.10\n'+x.text);
  x=await run(ch(['2026-10-28','2026-10-22','2026-10-25']),ERR);
  const iw=x.text.indexOf('28.10'),ie=x.text.indexOf('Помилки гравців');
  T.check(x.r.sent&&/28\.10/.test(first(x.text))&&ie>0&&iw<ie,'з помилками: попередження на початку, блок помилок нижче\n'+x.text);
  // boundary: last = day+8 (9 days) -> warn; last = day+9 (10 days) -> enough
  x=await run(ch(['2026-10-22','2026-10-30']),[]);
  T.check(x.r.sent&&/30\.10/.test(first(x.text)),'межа: останній 30.10 (9 днів) — попередження\n'+x.text);
  x=await run(ch(['2026-10-22','2026-10-31']),[]);
  T.check(!x.r.sent&&x.sent.length===0,'межа: останній 31.10 (10 днів), помилок немає — нічого не надіслано');
  x=await run(ch(['2026-10-22','2026-10-31']),ERR);
  T.check(x.r.sent&&!/31\.10/.test(x.text)&&/^<b>🐞 Помилки гравців/.test(x.text),'10 днів і є помилки — звичайне зведення без попередження\n'+x.text);
  // no challenge on `day` at all
  x=await run(ch(['2026-10-15','2026-10-20']),[]);
  T.check(x.r.sent&&/20\.10/.test(first(x.text)),'виклики скінчились 20.10 (до дня) — попередження з 20.10\n'+x.text);
  // month/year rollover in DD.MM
  x=await run(ch(['2026-12-28','2027-01-03']),[],'2026-12-28');
  T.check(x.r.sent&&/03\.01/.test(first(x.text)),'перехід року: останній 03.01 — формат ДД.ММ з нулем\n'+x.text);
  process.exit(T.done());})();
