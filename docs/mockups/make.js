// Макети: сторінка гравця + блок «Поділитися» (A/B/C). Статичні, гру не змінюють.
// Запуск: node docs/mockups/make.js  → HTML і PNG у docs/mockups/
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), OUT = __dirname;
const tpl = fs.readFileSync(path.join(ROOT, 'src/template.html'), 'utf8');
const CSS = tpl.slice(tpl.indexOf('<style>') + 7, tpl.indexOf('</style>'));
const ICO = require('vm').runInNewContext(fs.readFileSync(path.join(ROOT, 'src/icons.js'), 'utf8') + ';({ICO,icon,ic,trBadge})');
const { icon, trBadge } = ICO;
// кілька іконок MDI, яких ще немає в src/icons.js
Object.assign(ICO.ICO, {
  pencil: ['0 0 24 24', 'M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75M3 17.25V21h3.75L17.81 9.93l-3.75-3.75z'],
  'chevron-down': ['0 0 24 24', 'M7.41 8.58 12 13.17l4.59-4.59L18 10l-6 6-6-6z'],
  'dots-horizontal': ['0 0 24 24', 'M16 12a2 2 0 0 1 2-2 2 2 0 0 1 2 2 2 2 0 0 1-2 2 2 2 0 0 1-2-2m-6 0a2 2 0 0 1 2-2 2 2 0 0 1 2 2 2 2 0 0 1-2 2 2 2 0 0 1-2-2m-6 0a2 2 0 0 1 2-2 2 2 0 0 1 2 2 2 2 0 0 1-2 2 2 2 0 0 1-2-2'],
  logout: ['0 0 24 24', 'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5M4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4z'],
  'alert-outline': ['0 0 24 24', 'M12 2 1 21h22M12 6l7.53 13H4.47M11 10v4h2v-4m-2 6v2h2v-2'],
  'link-variant': ['0 0 24 24', 'M10.59 13.41c.41.39.41 1.03 0 1.42-.39.39-1.03.39-1.42 0a5.003 5.003 0 0 1 0-7.07l3.54-3.54a5.003 5.003 0 0 1 7.07 0 5.003 5.003 0 0 1 0 7.07l-1.49 1.49c.01-.82-.12-1.64-.4-2.42l.47-.48a2.98 2.98 0 0 0 0-4.24 2.98 2.98 0 0 0-4.24 0l-3.53 3.53a2.98 2.98 0 0 0 0 4.24m2.82-4.24c.39-.39 1.03-.39 1.42 0a5.003 5.003 0 0 1 0 7.07l-3.54 3.54a5.003 5.003 0 0 1-7.07 0 5.003 5.003 0 0 1 0-7.07l1.49-1.49c-.01.82.12 1.64.4 2.43l-.47.47a2.98 2.98 0 0 0 0 4.24 2.98 2.98 0 0 0 4.24 0l3.53-3.53a2.98 2.98 0 0 0 0-4.24.973.973 0 0 1 0-1.42'],
});

// ---------- трофеї з src/trophies.js (лише назва/опис/категорія)
const trSrc = fs.readFileSync(path.join(ROOT, 'src/trophies.js'), 'utf8');
const TR = {};
for (const m of trSrc.matchAll(/\{id:"([a-z0-9_]+)",i:"[^"]*",n:"([^"]*)",d:"([^"]*)",cat:"([a-z]+)"([^}]{0,60})/g))
  TR[m[1]] = { id: m[1], n: m[2], d: m[3], cat: m[4], sec: /sec:1/.test(m[5]), q: (/q:"([^"]+)"/.exec(m[5]) || [])[1] };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const trQ = t => t.q ? `<span class="trq">${icon('format-quote-open')}${esc(t.q)}</span>` : '';
const trCard = (id, got, extra = '') => { const t = TR[id] || { id, n: id, d: '', cat: 'season' };
  return `<div class="tro${got ? ' on' : ''}${t.sec ? ' sec' : ''}"><span class="tri">${trBadge(t, got)}</span><div class="trt"><b>${esc(t.n)}</b>${trQ(t)}<span>${esc(t.d)}</span>${extra}</div></div>`; };

// ---------- аватарка: два кольори + простий узор із хешу номера гравця
const PAL = ['#ff7a1a', '#1c1c1d', '#c44f00', '#f4f1ea', '#ff9a3d', '#3a3a3c'];
const PAIRS = [[0, 1], [1, 0], [2, 3], [1, 4], [5, 0], [3, 2], [0, 5], [4, 1]];
function fnv(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function avatar(id, size) {
  const h = fnv(id), [a, b] = PAIRS[h % PAIRS.length].map(i => PAL[i]), kind = (h >>> 4) % 4, r = 22;
  let g = '';
  if (kind === 0) { // дзеркальна сітка 5×5 (identicon)
    for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if ((h >>> (8 + y * 3 + x)) & 1) {
      g += `<rect x="${10 + x * 16}" y="${10 + y * 16}" width="16" height="16"/>`; if (x < 2) g += `<rect x="${10 + (4 - x) * 16}" y="${10 + y * 16}" width="16" height="16"/>`; }
  } else if (kind === 1) { // діагональ + коло
    g = `<path d="M0 100 L100 0 L100 100 Z"/><circle cx="${30 + (h >>> 9) % 10}" cy="${32 + (h >>> 13) % 8}" r="14"/>`;
  } else if (kind === 2) { // смуги під кутом
    const ang = [45, -45, 0, 90][(h >>> 10) % 4];
    g = `<g transform="rotate(${ang} 50 50)"><rect x="-20" y="14" width="140" height="14"/><rect x="-20" y="43" width="140" height="14"/><rect x="-20" y="72" width="140" height="14"/></g>`;
  } else { // чверті кіл
    const q = (h >>> 11) % 4, pts = [[0, 0], [100, 0], [100, 100], [0, 100]];
    g = [0, 2].map(k => { const [cx, cy] = pts[(q + k) % 4]; return `<circle cx="${cx}" cy="${cy}" r="50"/>`; }).join('') + `<circle cx="50" cy="50" r="12"/>`;
  }
  return `<svg class="av" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><defs><clipPath id="c${h}"><rect width="100" height="100" rx="${r}"/></clipPath></defs><g clip-path="url(#c${h})"><rect width="100" height="100" fill="${a}"/><g fill="${b}" shape-rendering="crispEdges">${g}</g></g></svg>`;
}

// ---------- додаткові стилі макета (поверх стилів гри)
const EXTRA = `
.avbtn{padding:0;border:0;background:none;border-radius:9px;line-height:0;box-shadow:0 0 0 1px var(--line)}
.avbtn .av{border-radius:8px}
.pp-head{display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:center;margin-top:18px}
.pp-head .av{border-radius:16px;box-shadow:0 0 0 1px var(--line)}
.pp-name{display:flex;align-items:center;gap:8px;min-width:0}
.pp-name h1{font-size:22px;font-weight:700;letter-spacing:-.01em;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pp-name button{padding:4px;border:0;background:none;color:var(--muted);line-height:0}.pp-name .ico{width:16px;height:16px}
.pp-since{font-family:var(--font-mono);font-size:12px;color:var(--ink2);margin-top:4px}
.pp-tiles{margin-top:16px}.pp-tiles .tile{background:var(--surface)}.pp-tiles .tile b{font-size:28px}.pp-tiles .tile span{font-size:12px;line-height:1.3}
.pp-tiles .tile small{font-family:var(--font-mono);font-size:11px;color:var(--muted)}
.pp-fav{display:grid;gap:0;margin-top:10px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
.pp-fav>div{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:10px 12px}
.pp-fav>div+div{border-top:1px solid var(--line)}
.pp-fav .k{font-size:12px;color:var(--ink2);font-weight:600;display:block}.pp-fav b{font-weight:700;font-size:15px}
.pp-fav .v{font-family:var(--font-mono);font-size:12px;color:var(--muted)}
.pp-sec{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:26px 0 10px}
.pp-sec h3{margin:0}.pp-sec .best{font-size:12px}
.pp-bar{height:4px;border-radius:2px;background:var(--line);overflow:hidden;margin:-4px 0 10px}.pp-bar i{display:block;height:100%;background:var(--amber)}
.trg1{display:grid;gap:8px}
details.pp-more{margin-top:8px;padding:0;background:none;border:0}
details.pp-more>summary{list-style:none;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--line);border-radius:var(--radius);padding:10px 12px;font-size:14px;color:var(--ink2);background:transparent}
details.pp-more>summary::-webkit-details-marker{display:none}details.pp-more>summary .ico{width:18px;height:18px}
.pp-list{border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden}
.pp-row{display:grid;grid-template-columns:auto 1fr auto auto;gap:10px;align-items:center;padding:10px 12px;min-height:48px}
.pp-row+.pp-row{border-top:1px solid var(--line)}
.pp-row .ic{width:28px;height:28px;border-radius:7px}.pp-row .ic .ico{width:16px;height:16px}
.pp-row .t{min-width:0}.pp-row .t b{display:block;font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pp-row .t span{display:block;font-size:12px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pp-row .n{font-family:var(--font-display);font-weight:700;font-size:18px;font-variant-numeric:tabular-nums;text-align:right}.pp-row .n small{font-family:var(--font-body);font-size:11px;color:var(--muted);font-weight:600;margin-left:2px}
.pp-row .n.g{color:var(--amber)}
.pp-row>.ico{width:18px;height:18px;fill:var(--muted)}
.pp-row.h{grid-template-columns:52px 1fr auto 18px}.pp-row.h .d{font-family:var(--font-mono);font-size:12px;color:var(--muted);line-height:1.2}
.mdot{display:inline-block;width:8px;height:8px;flex:none;border-radius:50%;margin-right:6px;vertical-align:1px}
.pp-empty{font-size:13px;color:var(--muted)}
.pp-acct{display:grid;gap:10px;border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:12px}
.pp-acct .who{display:flex;align-items:center;gap:8px;font-size:14px}.pp-acct .who .ico{width:18px;height:18px;fill:#2aabee}
.pp-del{border:0;background:none;color:var(--loss);font-weight:600;font-size:13px;padding:6px 0;justify-self:start}
.pp-warn{display:grid;gap:8px;margin-top:14px;padding:12px;border:1px solid color-mix(in srgb,var(--amber) 55%,var(--line));border-radius:10px;background:color-mix(in srgb,var(--amber) 9%,var(--surface))}
.pp-warn .h{display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px}.pp-warn .h .ico{width:18px;height:18px;fill:var(--amber)}
.pp-warn p{margin:0;font-size:13px;color:var(--ink2);line-height:1.45}
.pp-warn .row button{padding:8px 14px}
.pp-lock{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);padding:12px;border:1px dashed var(--line);border-radius:10px}
.pp-lock .ico{width:16px;height:16px}
.wbtn{width:100%;justify-content:center}
.cap{font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 8px;text-align:center}
/* share */
.sh-a{display:grid;gap:10px}
.sh-big{width:100%;padding:14px 18px;font-family:var(--font-display);font-weight:700;font-size:16px;background:var(--amber);border-color:var(--amber);color:#fff;display:inline-flex;align-items:center;justify-content:center;gap:10px;border-radius:12px}
.sh-big .ico{width:20px;height:20px}
.sh-icons{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.sh-icons button{display:grid;justify-items:center;gap:4px;padding:10px 4px;border-color:var(--line);background:var(--surface);font-size:12px;font-weight:600;color:var(--ink2)}
.sh-icons button .ico{width:20px;height:20px;fill:var(--ink)}
.sh-thumb{display:grid;grid-template-columns:84px 1fr;gap:12px;align-items:center}
.sh-thumb img{width:84px;border-radius:8px;border:1px solid var(--line);display:block}
.sh-thumb p{margin:0;font-size:13px;color:var(--ink2)}
.sh-link{border:0;background:none;padding:6px 0;font-size:14px;font-weight:600;color:var(--ink2);display:inline-flex;align-items:center;gap:6px}
.sh-link .ico{width:16px;height:16px}
details.sh-more{margin:0;padding:0;border:0;background:none}
details.sh-more>summary{list-style:none;display:flex;align-items:center;justify-content:center;gap:6px;color:var(--ink2);font-size:14px;font-weight:600;padding:10px;border:1px solid var(--line);border-radius:var(--radius)}
details.sh-more>summary::-webkit-details-marker{display:none}details.sh-more>summary .ico{width:18px;height:18px}
details.sh-more[open]>summary .ico{transform:rotate(180deg)}
.sh-menu{margin-top:8px;border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden}
.sh-menu>div{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center;padding:11px 12px;font-size:14px;font-weight:600}
.sh-menu>div+div{border-top:1px solid var(--line)}.sh-menu>div span{display:block;font-size:12px;color:var(--ink2);font-weight:500}
.sh-menu .ico{width:18px;height:18px;fill:var(--ink2)}
.seg{display:grid;grid-template-columns:1fr 1fr;padding:3px;border-radius:12px;background:var(--bg2);border:1px solid var(--line)}
.seg button{border:0;background:none;color:var(--ink2);padding:8px;font-size:14px;border-radius:9px}
.seg button.on{background:var(--ink);color:var(--bg);font-weight:700}
.sh-c{display:grid;gap:10px}
.sh-c input{font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);color:var(--ink);width:100%}
.sh-note{font-size:12px;color:var(--muted);margin:0}
body.dimmed{position:relative}.dim{position:absolute;inset:0;background:rgba(0,0,0,.6);z-index:60}
.sheet{position:absolute;left:0;right:0;bottom:0;z-index:61;border:1px solid var(--line);border-bottom:0;border-radius:16px 16px 0 0;background:var(--surface);padding:14px 16px 26px;display:grid;gap:10px;box-shadow:0 -8px 24px rgba(0,0,0,.35)}
.sheet .grab{width:36px;height:4px;border-radius:2px;background:var(--line);justify-self:center}
.sheet input{font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg);color:var(--ink);width:100%}
`;

function page(title, body, theme = 'dark') {
  return `<!doctype html><html lang="uk" data-skin="board" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700;900&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>${CSS}${EXTRA}</style></head><body><div class="wrap">${body}</div></body></html>`;
}
const I = (n, cls) => `<i class="ic${cls ? ' ' + cls : ''}">${icon(n)}</i>`;
const header = (me) => `<header class="top"><button class="nav">${I('home')}Головна</button>${me ? `<button class="avbtn" title="Моя сторінка">${avatar(me, 30)}</button>` : `<button class="nav">Увійти</button>`}</header>`;
const foot = `<div class="foot">30-0 УПЛ · <a href="#">Що нового у версії 0.51</a> · неофіційний фан-проєкт</div>`;

// ---------- дані
const ME = 'player:4817', OTHER = 'player:1290';
const pts = (n, g) => `<span class="n${g ? ' g' : ''}">${n}<small>оч</small></span>`;
const recent = ['kukuriku', 'champ', 'iron'];
const cabinetDetails = (have, total) => `<details class="pp-more"><summary>Уся шафа · ${have} з ${total} ${icon('chevron-down')}</summary></details>`;
function headBlock(id, name, since, editable) {
  return `<div class="pp-head">${avatar(id, 64)}<div style="min-width:0"><div class="pp-name"><h1>${name}</h1>${editable ? `<button title="Змінити ім'я">${icon('pencil')}</button>` : ''}</div><div class="pp-since">грає з ${since}</div></div></div>`;
}
function tiles(t) {
  return `<div class="tiles t2 pp-tiles">
<div class="tile"><b>${t[0]}</b><span>сезонів зіграно</span></div>
<div class="tile"><b>${t[1]}</b><span>чемпіонств</span></div>
<div class="tile"><b style="color:var(--amber)">${t[2]}</b><span>найкращий сезон</span><small>очок · класика</small></div>
<div class="tile"><b>${t[3]}</b><span>серія виклику дня</span><small>днів поспіль · рекорд</small></div></div>`;
}
function fav(club, pct, pl, n) {
  return `<div class="pp-fav"><div>${I('heart')}<div><span class="k">Улюблений клуб</span><b>${club}</b></div><span class="v">${pct}% вибору</span></div>
<div>${I('account-circle')}<div><span class="k">Найчастіший гравець</span><b>${pl}</b></div><span class="v">×${n}</span></div></div>`;
}
function trophies(have, total, ids) {
  return `<div class="pp-sec"><h3>Трофеї</h3><span class="best">Відкрито ${have} з ${total}</span></div>
<div class="pp-bar"><i style="width:${Math.round(100 * have / total)}%"></i></div>
<div class="kicker" style="font-family:var(--font-mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Останні</div>
<div class="trg1">${ids.map(id => trCard(id, true)).join('')}</div>${cabinetDetails(have, total)}`;
}
const records = `<div class="pp-sec"><h3>Рекорди</h3></div><div class="pp-list">
<div class="pp-row">${I('trophy')}<div class="t"><b>Класика</b><span>1 місце · 26-4-0 · 12.09</span></div>${pts(82, 1)}${icon('chevron-right')}</div>
<div class="pp-row">${I('lightning-bolt')}<div class="t"><b>Дербі</b><span>Динамо — Шахтар · 1 місце · 03.09</span></div>${pts(74)}${icon('chevron-right')}</div>
<div class="pp-row">${I('heart')}<div class="t"><b>Один клуб</b><span>Чорноморець (Одеса) · 3 місце</span></div>${pts(61)}${icon('chevron-right')}</div>
<div class="pp-row">${I('arrow-down-bold')}<div class="t"><b>Антисезон</b><span>16 місце · 1-3-26 · 21.09</span></div>${pts(6)}${icon('chevron-right')}</div>
<div class="pp-row">${I('calendar-star')}<div class="t"><b>Виклик дня</b><span>2 місце в таблиці дня · 27.09</span></div>${pts(71)}${icon('chevron-right')}</div></div>`;
const HIST = [['29.09', 'Виклик дня', 'var(--df)', '4 місце · 17-6-7', 57], ['29.09', 'Класика', 'var(--amber)', '1 місце · 23-5-2', 74], ['28.09', 'Дербі', 'var(--fw)', '2 місце · 20-6-4', 66], ['28.09', 'Виклик дня', 'var(--df)', '6 місце · 14-7-9', 49], ['27.09', 'Виклик дня', 'var(--df)', '2 місце · 22-5-3', 71], ['26.09', 'Антисезон', 'var(--muted)', '15 місце · 3-4-23', 13], ['26.09', 'Класика', 'var(--amber)', '3 місце · 19-7-4', 64], ['25.09', 'Один клуб', 'var(--mf)', '5 місце · 16-6-8', 54], ['25.09', 'Виклик дня', 'var(--df)', '9 місце · 12-6-12', 42], ['24.09', 'Класика', 'var(--amber)', '1 місце · 25-3-2', 78]];
const historyN = (n, label, more) => `<div class="pp-sec"><h3>Історія</h3><span class="best">${label}</span></div><div class="pp-list">${HIST.slice(0, n).map(([d, m, c, r, p]) => `<div class="pp-row h"><span class="d">${d}</span><div class="t"><b><i class="mdot" style="background:${c}"></i>${m}</b><span>${r}</span></div>${pts(p)}${icon('chevron-right')}</div>`).join('')}</div>
${more ? '<button class="ghost wbtn" style="margin-top:8px;width:100%">Ще 10 сезонів</button>' : ''}`;
const history = historyN(10, 'останні 10 з 47', true);
const leagues = `<div class="pp-sec"><h3>Ліги</h3></div><div class="pp-list">
<div class="pp-row">${I('account-group')}<div class="t"><b>Офіс на Подолі</b><span>9 гравців · вересень</span></div><span class="n g">2<small>місце</small></span>${icon('chevron-right')}</div>
<div class="pp-row">${I('account-group')}<div class="t"><b>Одеські моряки</b><span>4 гравці · вересень</span></div><span class="n">1<small>місце</small></span>${icon('chevron-right')}</div></div>`;
const acctIn = `<div class="pp-sec"><h3>Акаунт</h3></div><div class="pp-acct"><div class="who">${icon('telegram')}Увійшов через Telegram</div>
<div class="row"><button class="ghost">${I('logout', 'sm')}Вийти</button></div><button class="pp-del">Видалити акаунт…</button></div>`;
const acctOut = `<div class="pp-sec"><h3>Акаунт</h3></div><div class="pp-acct"><span class="muted" style="font-size:13px">Увійди, щоб трофеї, рекорди й серія зберігались на всіх пристроях.</span>
<div class="row"><button class="primary">${I('telegram')}Telegram</button><button class="ghost">${I('google')}Google</button></div></div>`;
const warn = `<div class="pp-warn"><div class="h">${icon('alert-outline')}Усе зберігається лише на цьому пристрої</div>
<p>Очистиш кеш браузера чи Telegram, зміниш телефон, браузер або пристрій — і трофеї, рекорди та серія виклику дня зникнуть. Результати в таблицях залишаться, але не будуть пов’язані з тобою.</p>
<div class="row"><button class="primary">Увійти</button></div></div>`;

const files = {};
const ownBody = me => header(me) + headBlock(ME, 'Андрій', '14 серпня 2026', true) + tiles([47, 6, 82, 12]) +
  fav('Динамо (Київ)', 31, 'Андрій Шевченко', 19) + trophies(23, 111, recent) + records + history + leagues;
files.player_own = page('Сторінка гравця', ownBody(ME) + acctIn + foot);
files.player_own_light = page('Сторінка гравця', ownBody(ME) + acctIn + foot, 'light');
files.player_guest = page('Сторінка гравця — без входу', header('device:7a31') + warn + headBlock('device:7a31', 'Гравець', '21 вересня 2026', true) + tiles([9, 1, 74, 4]) +
  fav('Шахтар (Донецьк)', 22, 'Дарійо Срна', 6) + trophies(8, 111, ['champ', 'top3', 'goals80']) +
  records.replace('82', '74').replace('1 місце · 26-4-0 · 12.09', '1 місце · 23-5-2 · 29.09') + historyN(9, 'усі 9', false) + acctOut + foot);
files.player_other = page('Сторінка іншого гравця', header(ME) + headBlock(OTHER, 'Вітя', '2 вересня 2026', false) + tiles([23, 3, 77, 9]) +
  fav('Чорноморець (Одеса)', 27, 'Іван Гецко', 11) + trophies(17, 111, ['dchamp', 'champ', 'fortress']) +
  `<div class="pp-sec"><h3>Історія</h3></div><div class="pp-lock">${icon('eye-off')}Історію сезонів бачить лише Вітя</div>` + foot);
files.header_avatar = page('Шапка з аватаркою', `<div class="cap" style="margin-top:12px">було</div>${header(null)}<div style="height:18px"></div><div class="cap">стало</div>${header(ME)}
<div style="height:22px"></div><div class="cap">аватарки різних гравців · 64 і 30 px</div>
<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center">${['player:4817', 'player:1290', 'player:77', 'player:3021', 'player:5550', 'player:12', 'player:908', 'player:4242'].map(i => avatar(i, 64)).join('')}</div>
<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:12px 0 20px">${['player:4817', 'player:1290', 'player:77', 'player:3021', 'player:5550', 'player:12', 'player:908', 'player:4242'].map(i => avatar(i, 30)).join('')}</div>`);

// ---------- «Поділитися»: результат сезону + варіанти
const result = `<div class="hero" style="margin-top:14px">
<div class="tier">Ліга чемпіонів · 2 місце</div>
<div class="muted">Ліга культових клубів: твоя 11-ка проти 15 культових клубів УПЛ. 4-4-2 · Звичайний.</div>
<div class="tiles t3"><div class="tile W"><b>17</b><span>перемог</span></div><div class="tile D"><b>6</b><span>нічиїх</span></div><div class="tile L"><b>7</b><span>поразок</span></div></div>
<div class="tiles t3"><div class="tile hot"><b>57</b><span>очок</span></div><div class="tile"><b>2</b><span>місце</span></div><div class="tile"><b>51:27</b><span>голи</span></div></div>
<div class="row" style="margin-top:4px"><button class="primary">Новий драфт</button><button class="ghost">Той самий склад</button></div></div>`;
const tabsAfter = `<div class="tabs" style="margin-top:26px"><button class="tab on">Огляд</button><button class="tab">Статистика сезону</button></div><h3>Твоя 11-ка</h3><div style="height:40px"></div>`;
const shareH = `<h3 style="margin:26px 0 10px">Поділитися</h3>`;
const shA = shareH + `<div class="sh-a"><button class="sh-big">${icon('share-variant')}Поділитися карткою</button>
<div class="sh-icons"><button>${icon('image')}Картка</button><button>${icon('content-copy')}Текст</button><button>${icon('sword-cross')}Виклик</button><button>${icon('telegram')}Мені в TG</button></div></div>`;
const shAsheet = shA + `<div class="dim"></div><div class="sheet"><div class="grab"></div><b style="font-family:var(--font-display);font-size:16px">Кинути виклик другу</b>
<p class="sh-note" style="font-size:13px;color:var(--ink2)">Друг зіграє з тим самим колесом, схемою й суперниками.</p>
<input value="Андрій" aria-label="Ім'я у виклику"><button class="sh-big">${icon('share-variant')}Надіслати виклик</button>
<button class="sh-link" style="justify-self:center">${icon('link-variant')}Скопіювати посилання</button></div>`;
const shB = (open) => shareH + `<div class="sh-a"><button class="sh-big">${icon('share-variant')}Поділитися карткою</button>
<details class="sh-more"${open ? ' open' : ''}><summary>Ще ${icon('chevron-down')}</summary><div class="sh-menu">
<div>${icon('image')}<div>Показати картку<span>зберегти або переслати вручну</span></div></div>
<div>${icon('content-copy')}<div>Скопіювати текст<span>результат і склад одним повідомленням</span></div></div>
<div>${icon('sword-cross')}<div>Кинути виклик другу<span>той самий драфт — хто сильніший?</span></div></div>
<div>${icon('link-variant')}<div>Скопіювати посилання на виклик</div></div></div></details></div>`;
const shC = (tab) => shareH + `<div class="sh-c"><div class="seg"><button class="${tab === 0 ? 'on' : ''}">Картка</button><button class="${tab === 1 ? 'on' : ''}">Виклик другу</button></div>` +
  (tab === 0 ? `<div class="sh-thumb"><img src="card_sample.png" alt=""><p>Картка сезону: рахунок, 30 матчів і твоя 11-ка.</p></div>
<button class="sh-big">${icon('share-variant')}Поділитися карткою</button><button class="sh-link" style="justify-self:center">${icon('content-copy')}Скопіювати текст</button>`
    : `<p class="sh-note" style="font-size:13px;color:var(--ink2)">Друг зіграє з тим самим колесом, схемою й суперниками — побачимо, хто сильніший.</p>
<input value="Андрій" aria-label="Ім'я у виклику"><button class="sh-big">${icon('sword-cross')}Кинути виклик</button><button class="sh-link" style="justify-self:center">${icon('link-variant')}Скопіювати посилання</button>`) + `</div>`;
const shCur = shareH + `<div class="share" style="margin:0"><div class="row"><button class="primary">${I('share-variant')}Поділитися карткою</button><button class="ghost">${I('image')}Показати картку</button><button class="ghost">${I('content-copy')}Скопіювати текст</button></div>
<div class="grid" style="gap:6px"><input placeholder="Твоє ім'я у виклику" style="max-width:260px;font:inherit;padding:9px 12px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);color:var(--ink)"><div class="row"><button class="primary">${I('sword-cross')}Кинути виклик другу</button><button class="ghost">${I('content-copy')}Скопіювати посилання</button></div><span class="muted" style="font-size:13px">Друг зіграє з тим самим колесом, схемою й суперниками — побачимо, хто сильніший.</span></div></div>`;
const shPage = (t, s) => page(t, header(ME) + result + s + tabsAfter);
files.share_0_now = shPage('Поділитися — зараз', shCur);
files.share_A = shPage('Поділитися — A', shA);
files.share_A_challenge = shPage('Поділитися — A, виклик', shAsheet).replace('<body>', '<body class="dimmed">');
files.share_B = shPage('Поділитися — B', shB(false));
files.share_B_open = shPage('Поділитися — B, відкрито', shB(true));
files.share_C = shPage('Поділитися — C, картка', shC(0));
files.share_C_challenge = shPage('Поділитися — C, виклик', shC(1));

Object.assign(files, require('./leagues.js')({ page, header, I, icon, avatar, ME }));
const ONLY = process.env.ONLY;   // напр. ONLY=lg_ — лише макети ліг
for (const k of Object.keys(files)) if (ONLY && !k.startsWith(ONLY)) delete files[k];
for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(OUT, k + '.html'), v);

// ---------- знімки
(async () => {
  const { chromium } = require(path.join(ROOT, 'tools/node_modules/playwright'));
  const exe = fs.readdirSync('/opt/pw-browsers').filter(d => /^chromium-\d+$/.test(d)).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(fs.existsSync);
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--ignore-certificate-errors-spki-list=KnP1OnzHv/y42eRQmbGwoYTHcSJF448m6CU5mdngwKk='], proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    for (const k of Object.keys(files)) {
      await pg.goto('file://' + path.join(OUT, k + '.html'));
      await pg.evaluate(() => document.fonts.ready);
      await pg.waitForTimeout(300);
      const clip = k === 'header_avatar' ? { x: 0, y: 0, width: 390, height: await pg.evaluate(() => document.body.scrollHeight) } : undefined;
      await pg.screenshot({ path: path.join(OUT, k + '.png'), fullPage: !clip, clip });
      console.log('ok', k);
    }
  } finally { await browser.close(); }
})();
