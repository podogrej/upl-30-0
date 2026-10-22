// CI guard: lib/challenges.json must cover at least 7 days from today (Kyiv), i.e. last day >= today+6.
// VD_TODAY=YYYY-MM-DD overrides "today" to test the guard itself.
// Run from repo root: node tools/tests/vd_runway.js
const {checker}=require('./_site.js');const list=require('../../lib/challenges.json');
const DAYS=7;
const today=process.env.VD_TODAY||new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const plus=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
const last=list.map(c=>c.day).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')).sort().pop()||'';
const need=plus(today,DAYS-1),dm=d=>d?d.slice(8,10)+'.'+d.slice(5,7):'—';
const T=checker('vd_runway');
T.check(/^\d{4}-\d{2}-\d{2}$/.test(today),'дата «сьогодні» у форматі РРРР-ММ-ДД: '+today);
T.check(last>=need,`виклики дня є щонайменше на ${DAYS} днів від ${dm(today)}: останній виклик ${dm(last)}, потрібно до ${dm(need)}`+(last>=need?'':' — додай нові виклики в lib/challenges.json'));
process.exit(T.done());
