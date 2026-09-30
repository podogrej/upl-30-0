// Макети нового дизайну «в кольорах УПЛ» (ціль 0.69): 4 напрями × 4 екрани + варіанти газону.
// Статичні, гру не змінюють. Запуск: node docs/mockups/design_upl/make.js  → HTML і PNG у цій папці.
// ONLY=A_ — лише файли з таким початком (напр. ONLY=pitch).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..'), OUT = __dirname;
const { icon } = require('vm').runInNewContext(fs.readFileSync(path.join(ROOT, 'src/icons.js'), 'utf8') + ';({icon})');
const chev = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.41 8.58 12 13.17l4.59-4.59L18 10l-6 6-6-6z"/></svg>';
const back = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.41 16.58 10.83 12l4.58-4.59L14 6l-6 6 6 6z"/></svg>';
const reroll = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z"/></svg>';

// ---------- кольори клубів з data/club_colors.csv
const CLUB = {};
for (const l of fs.readFileSync(path.join(ROOT, 'data/club_colors.csv'), 'utf8').trim().split('\n').slice(1)) {
  const [code, , c1, c2, c3] = l.split(','); CLUB[code] = [c1, c2, c3].filter(Boolean);
}
const lum = h => { const n = parseInt(h.slice(1), 16), c = [n >> 16, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
// фішка: заливка — c1, окрім білого/дуже світлого c1 (тоді заливка c2, обідок c1); текст — контрастний
function chipColors(code) {
  const [c1, c2 = '#FFFFFF'] = CLUB[code] || ['#8a93b0', '#FFFFFF'];
  const [fill, ring] = lum(c1) > .8 ? [c2, c1] : [c1, c2];
  return { fill, ring, ink: lum(fill) > .45 ? '#0b1020' : '#ffffff' };
}

// ---------- склад (4-3-3). x/y — % від поля; зверху атака, знизу воротар
const SLOTS = [
  ['LW', 'ЛВ', 18, 17], ['ST', 'НП', 50, 12], ['RW', 'ПВ', 82, 17],
  ['CM', 'ЦПЗ', 26, 39], ['CDM', 'ОПЗ', 50, 47], ['CM2', 'ЦПЗ', 74, 39],
  ['LB', 'ЛЗ', 13, 62], ['CB', 'ЦЗ', 36, 67], ['CB2', 'ЦЗ', 64, 67], ['RB', 'ПЗ', 87, 62],
  ['GK', 'ВР', 50, 84]];
// повний склад для підсумків: [слот, прізвище, клуб, сезон, рейтинг]
const XI = {
  LW: ['Воробей', 'shakhtar-donetsk', '01/02', 84], ST: ['Ребров', 'dynamo-kyiv', '98/99', 93], RW: ['Девич', 'metalist-kharkiv', '09/10', 83],
  CM: ['Гусін', 'dynamo-kyiv', '99/00', 86], CDM: ['Степаненко', 'shakhtar-donetsk', '16/17', 85], CM2: ['Валяєв', 'metalist-kharkiv', '09/10', 82],
  LB: ['Несмачний', 'dynamo-kyiv', '04/05', 80], CB: ['Ващук', 'dynamo-kyiv', '97/98', 88], CB2: ['Кучер', 'shakhtar-donetsk', '10/11', 84], RB: ['Срна', 'shakhtar-donetsk', '07/08', 89],
  GK: ['Шовковський', 'dynamo-kyiv', '98/99', 90]};
// у драфті вже стоять 6 гравців, вільні: ЦПЗ (прав.), ОПЗ, ЛЗ, ЦЗ (лів.), ПВ
const DRAFT_FILLED = ['LW', 'ST', 'CM', 'CB2', 'RB', 'GK'];
const DRAFT_TARGET = ['CB', 'LB', 'CDM'];   // куди може стати обраний Каладзе

// ---------- газон: три види (SVG-розмітка + фон)
function pitchSVG(lc, lo, w = 1.4) {
  const s = `stroke="${lc}" stroke-opacity="${lo}" stroke-width="${w}" fill="none" vector-effect="non-scaling-stroke"`;
  return `<svg class="lines" viewBox="0 0 68 100" preserveAspectRatio="none" aria-hidden="true">
<rect x="2" y="2" width="64" height="96" ${s}/><line x1="2" y1="50" x2="66" y2="50" ${s}/>
<ellipse cx="34" cy="50" rx="9.2" ry="6.4" ${s}/><circle cx="34" cy="50" r=".5" fill="${lc}" fill-opacity="${lo}"/>
<rect x="15" y="2" width="38" height="15" ${s}/><rect x="25" y="2" width="18" height="5.5" ${s}/>
<rect x="15" y="83" width="38" height="15" ${s}/><rect x="25" y="92.5" width="18" height="5.5" ${s}/>
<path d="M27 17 A 8.5 6 0 0 0 41 17" ${s}/><path d="M27 83 A 8.5 6 0 0 1 41 83" ${s}/></svg>`;
}
const TURF = {
  radial: { name: 'Класичний зелений', bg: 'radial-gradient(120% 80% at 50% 45%,#1f5a3a 0%,#154630 45%,#0d3122 100%)', stripes: 'rgba(255,255,255,.035)', lc: '#ffffff', lo: .32, border: '#0a2519', label: '#ffffff', sub: 'rgba(255,255,255,.72)', slot: 'rgba(255,255,255,.55)', slotBg: 'rgba(0,0,0,.18)' },
  lime: { name: 'Нічний з лаймовою розміткою', bg: '#0b1410', stripes: 'rgba(200,255,61,.025)', lc: '#c8ff3d', lo: .55, border: '#1b2a20', label: '#ffffff', sub: 'rgba(255,255,255,.62)', slot: 'rgba(200,255,61,.7)', slotBg: 'rgba(200,255,61,.06)' },
  navy: { name: 'Темно-синій УПЛ', bg: 'radial-gradient(120% 80% at 50% 40%,#1b3a5c 0%,#12294a 50%,#0b1a33 100%)', stripes: 'rgba(255,255,255,.03)', lc: '#ffffff', lo: .22, border: '#0a1630', label: '#ffffff', sub: 'rgba(255,255,255,.66)', slot: 'rgba(255,255,255,.5)', slotBg: 'rgba(255,255,255,.04)' },
  paper: { name: 'Світлий «папір»', bg: '#eef2ea', stripes: 'rgba(19,35,70,.028)', lc: '#132346', lo: .28, border: '#dfe5da', label: '#132346', sub: 'rgba(19,35,70,.62)', slot: 'rgba(19,35,70,.45)', slotBg: 'rgba(255,255,255,.6)' },
  mono: { name: 'Світлий сірий', bg: '#f3f3f5', stripes: 'rgba(0,0,0,.022)', lc: '#0e1116', lo: .16, border: '#e7e7ea', label: '#0e1116', sub: '#6b7080', slot: '#9aa0ab', slotBg: '#ffffff' }};

// поле з фішками. mode: 'draft' | 'result'
function pitch(turf, mode, h) {
  const T = TURF[turf];
  let chips = '';
  for (const [k, pos, x, y] of SLOTS) {
    const p = XI[k], filled = mode === 'result' || DRAFT_FILLED.includes(k), target = mode === 'draft' && DRAFT_TARGET.includes(k);
    if (filled) {
      const c = chipColors(p[1]);
      chips += `<div class="pc" style="left:${x}%;top:${y}%"><i class="chip" style="background:${c.fill};box-shadow:0 0 0 2.5px ${c.ring},0 2px 6px rgba(0,0,0,.28);color:${c.ink}">${pos}</i>${mode === 'result' ? `<em class="rt">${p[3]}</em>` : ''}<b>${p[0]}</b><small>${clubShort(p[1])} ${p[2]}</small></div>`;
    } else chips += `<div class="pc" style="left:${x}%;top:${y}%"><i class="chip empty${target ? ' tgt' : ''}">${pos}</i></div>`;
  }
  return `<div class="pitch" style="height:${h}px;background:${T.bg};border-color:${T.border};--pl:${T.label};--ps:${T.sub};--slot:${T.slot};--slotbg:${T.slotBg}">
<div class="stripes" style="background:repeating-linear-gradient(0deg,${T.stripes} 0 ${h / 10}px,transparent ${h / 10}px ${h / 5}px)"></div>${pitchSVG(T.lc, T.lo)}${chips}</div>`;
}
const SHORT = { 'dynamo-kyiv': 'Динамо', 'shakhtar-donetsk': 'Шахтар', 'metalist-kharkiv': 'Металіст' };
const clubShort = c => SHORT[c] || c;

// ---------- напрями дизайну
const FONTS = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700;900&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&family=Oswald:wght@500;600;700&family=Golos+Text:wght@400;500;600;700;800&display=swap';
const GRAD = 'linear-gradient(90deg,#7e24b0 0%,#d41e6f 55%,#ff831e 100%)';
const DIR = {
  A: { title: 'УПЛ класика', theme: 'dark', turf: 'navy',
    t: { bg: '#0b1430', bg2: '#0f1b3d', surface: '#132346', surface2: '#1a2d59', line: '#26396b', ink: '#ffffff', ink2: '#b9c2de', muted: '#7f8aad',
      accent: '#e0287a', accent2: '#ff831e', violet: '#8b3fd0', onaccent: '#ffffff', win: '#2fd07a', draw: '#f5b83d', loss: '#ff4d5e', grad: GRAD },
    f: { display: "'Unbounded',sans-serif", body: "'Manrope',sans-serif", mono: "'JetBrains Mono',monospace" }, btn: 'grad', logo: 'grad' },
  B: { title: 'УПЛ світла', theme: 'light', turf: 'paper',
    t: { bg: '#f4f5fa', bg2: '#eceef6', surface: '#ffffff', surface2: '#f7f8fc', line: '#dfe3ef', ink: '#132346', ink2: '#4a5578', muted: '#8a93b0',
      accent: '#6d2abb', accent2: '#d8177b', violet: '#6d2abb', onaccent: '#ffffff', win: '#12a150', draw: '#c98a00', loss: '#e0263b', grad: GRAD },
    f: { display: "'Unbounded',sans-serif", body: "'Manrope',sans-serif", mono: "'JetBrains Mono',monospace" }, btn: 'grad', logo: 'grad' },
  C: { title: 'Матчдей', theme: 'dark', turf: 'lime',
    t: { bg: '#05070d', bg2: '#0a0d15', surface: '#0f131d', surface2: '#161b28', line: '#252c3c', ink: '#ffffff', ink2: '#aab3c5', muted: '#6c7488',
      accent: '#c8ff3d', accent2: '#ff2d78', violet: '#8b3fd0', onaccent: '#05070d', win: '#c8ff3d', draw: '#ffd23d', loss: '#ff2d78', grad: 'linear-gradient(90deg,#c8ff3d,#c8ff3d)' },
    f: { display: "'Oswald',sans-serif", body: "'Manrope',sans-serif", mono: "'JetBrains Mono',monospace" }, btn: 'solid', logo: 'solid', caps: true },
  D: { title: 'Мінімал 38-0', theme: 'light', turf: 'mono',
    t: { bg: '#ffffff', bg2: '#f4f4f6', surface: '#ffffff', surface2: '#f7f7f9', line: '#e7e7ea', ink: '#0e1116', ink2: '#5b6070', muted: '#9aa0ab',
      accent: '#132346', accent2: '#d41e6f', violet: '#6d2abb', onaccent: '#ffffff', win: '#12a150', draw: '#b98000', loss: '#e0263b', grad: 'linear-gradient(90deg,#132346,#132346)' },
    f: { display: "'Golos Text',sans-serif", body: "'Golos Text',sans-serif", mono: "'JetBrains Mono',monospace" }, btn: 'solid', logo: 'mono', min: true }};

const CSS = d => `
:root{${Object.entries(d.t).map(([k, v]) => `--${k}:${v}`).join(';')};--fd:${d.f.display};--fb:${d.f.body};--fm:${d.f.mono};--r:${d.min ? 12 : 14}px}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font-family:var(--fb);font-size:15px;line-height:1.4;-webkit-font-smoothing:antialiased}
.wrap{max-width:430px;margin:0 auto;padding:0 16px 28px}
.ico{width:20px;height:20px;fill:currentColor;flex:none;display:block}
button{font:inherit;color:inherit;border:0;background:none;cursor:pointer}
/* шапка як у 38-0: зліва «Головна», справа «Увійти» */
.top{display:flex;align-items:center;justify-content:space-between;height:56px;${d.min ? '' : 'border-bottom:1px solid var(--line);margin:0 -16px;padding:0 16px;'}}
.top .home{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px}
.top .mark{font-family:var(--fd);font-weight:${d.caps ? 700 : 900};font-size:${d.caps ? 20 : 15}px;letter-spacing:${d.caps ? '.02em' : '-.01em'};${d.logo === 'grad' ? 'background:var(--grad);-webkit-background-clip:text;color:transparent' : d.logo === 'solid' ? 'color:var(--accent)' : ''}}
.top .signin{font-weight:700;font-size:14px;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--surface)}
.top .back{display:flex;align-items:center;gap:2px;font-weight:600;color:var(--ink2);font-size:15px;margin-left:-6px}
/* головна */
.hero{text-align:center;padding:${d.min ? '46px 0 26px' : '40px 0 24px'}}
.logo{font-family:var(--fd);font-weight:${d.caps ? 700 : 900};line-height:.92;letter-spacing:${d.caps ? '0' : '-.03em'};font-size:${d.caps ? 84 : d.min ? 64 : 76}px}
.logo span{display:block;${d.logo === 'grad' ? 'background:var(--grad);-webkit-background-clip:text;color:transparent' : d.logo === 'solid' ? 'color:var(--accent)' : 'color:var(--accent2)'}}
${d.min ? '.logo{display:flex;justify-content:center;gap:14px;align-items:baseline}.logo span{display:inline}' : ''}
${d.caps ? '.logo{display:flex;justify-content:center;gap:16px}.logo span{display:inline}' : ''}
.lead{color:var(--ink2);font-size:15px;margin:${d.caps ? 20 : 14}px auto 0;max-width:30ch}
.cta{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;height:58px;border-radius:var(--r);font-family:var(--fd);font-weight:700;font-size:${d.caps ? 22 : 18}px;${d.caps ? 'text-transform:uppercase;letter-spacing:.06em;' : ''}color:var(--onaccent);background:${d.btn === 'grad' ? 'var(--grad)' : 'var(--accent)'};${d.btn === 'grad' ? 'box-shadow:0 8px 24px -8px rgba(212,30,111,.55)' : ''}}
.cta.sm{height:50px;font-size:${d.caps ? 18 : 16}px}
.btn2{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:50px;border-radius:var(--r);border:1px solid var(--line);background:var(--surface);font-weight:700;font-size:15px}
.hint{text-align:center;font-size:13px;color:var(--muted);margin-top:10px}
.sec{font-family:${d.caps ? 'var(--fd)' : 'var(--fm)'};font-size:${d.caps ? 14 : 11}px;font-weight:600;letter-spacing:${d.caps ? '.08em' : '.14em'};text-transform:uppercase;color:var(--muted);margin:26px 0 8px;display:flex;justify-content:space-between}
.list{border:1px solid var(--line);border-radius:var(--r);background:var(--surface);overflow:hidden}
.li{display:grid;grid-template-columns:auto 1fr auto auto;gap:12px;align-items:center;padding:0 14px;min-height:56px}
.li+.li{border-top:1px solid var(--line)}
.li .ic{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}
${d.theme === 'light' && !d.min ? '.li .ic{color:var(--violet);background:color-mix(in srgb,var(--violet) 10%,transparent)}' : ''}
${d.min ? '.li .ic{background:var(--bg2);color:var(--ink)}' : ''}
.li .ic .ico{width:18px;height:18px}
.li b{font-weight:700;font-size:15px}.li .m{font-size:13px;color:var(--muted);white-space:nowrap}
.li>.ico{width:18px;height:18px;fill:var(--muted)}
.li.hot{background:color-mix(in srgb,var(--accent) ${d.theme === 'dark' ? 9 : 6}%,var(--surface))}
.li.hot b{color:${d.min ? 'var(--ink)' : 'var(--accent)'}}
${d.theme === 'light' && !d.min ? '.li.hot b{color:var(--violet)}' : ''}
.new{font-family:var(--fm);font-size:10px;font-weight:600;letter-spacing:.06em;padding:3px 7px;border-radius:999px;color:var(--onaccent);background:${d.btn === 'grad' ? 'var(--grad)' : d.min ? 'var(--accent2)' : 'var(--accent)'};${d.min ? 'color:#fff' : ''}}
.stats{display:flex;justify-content:space-between;margin-top:22px;padding:0 2px;color:var(--muted);font-size:12px}
.stats b{font-family:var(--fd);font-size:18px;color:var(--ink);font-weight:700;margin-right:4px}
details{border:1px solid var(--line);border-radius:var(--r);background:var(--surface);margin-top:8px}
details summary{list-style:none;display:flex;justify-content:space-between;align-items:center;padding:14px;font-weight:700;font-size:15px}
details summary::-webkit-details-marker{display:none}details summary .ico{fill:var(--muted)}
.foot{text-align:center;font-family:var(--fm);font-size:11px;color:var(--muted);margin-top:26px}
.foot a{color:var(--ink2);text-decoration:none;font-weight:600}
/* поле */
.pitch{position:relative;border-radius:${d.min ? 14 : 16}px;overflow:hidden;border:1px solid}
.pitch .stripes,.pitch .lines{position:absolute;inset:0;width:100%;height:100%}
.pc{position:absolute;transform:translate(-50%,-22px);display:grid;justify-items:center;width:92px;text-align:center}
.chip{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-family:var(--fb);font-weight:800;font-size:11px;letter-spacing:.02em}
.chip.empty{border:1.5px dashed var(--slot);color:var(--slot);background:var(--slotbg)}
.chip.tgt{border:2px solid var(--accent);color:var(--accent);background:color-mix(in srgb,var(--accent) 16%,transparent);box-shadow:0 0 0 5px color-mix(in srgb,var(--accent) 22%,transparent)}
${d.turf === 'paper' ? '.chip.tgt{border-color:var(--violet);color:var(--violet);background:#fff;box-shadow:0 0 0 5px color-mix(in srgb,var(--violet) 18%,transparent)}' : ''}
.pc b{font-size:12.5px;font-weight:700;color:var(--pl);margin-top:5px;line-height:1.1;white-space:nowrap}
.pc small{font-size:10px;color:var(--ps);white-space:nowrap;line-height:1.2}
.pc .rt{position:absolute;top:-7px;left:calc(50% + 12px);font-style:normal;font-family:var(--fm);font-weight:600;font-size:10.5px;padding:1px 5px;border-radius:999px;background:${d.caps ? 'var(--accent)' : d.btn === 'grad' ? 'var(--grad)' : 'var(--accent)'};color:var(--onaccent)}
/* драфт */
.dbar{display:flex;align-items:baseline;justify-content:space-between;margin:12px 0 10px}
.dbar h1{font-family:var(--fd);font-weight:700;font-size:${d.caps ? 26 : 20}px;${d.caps ? 'text-transform:uppercase;letter-spacing:.03em' : ''}}
.dbar h1 em{font-style:normal;color:var(--muted);font-weight:600}
.dbar .f{font-family:var(--fm);font-size:12px;color:var(--ink2);padding:5px 9px;border:1px solid var(--line);border-radius:8px}
.wheel{margin-top:14px;display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:12px 14px;border-radius:var(--r);background:var(--surface);border:1px solid var(--line)}
.crest{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;font-family:var(--fd);font-weight:900;font-size:14px}
.wheel b{display:block;font-family:var(--fd);font-weight:700;font-size:${d.caps ? 20 : 16}px;${d.caps ? 'text-transform:uppercase' : ''}}
.wheel span{font-family:var(--fm);font-size:12px;color:var(--ink2)}
.rr{display:flex;align-items:center;gap:6px;height:38px;padding:0 12px;border-radius:10px;border:1px solid var(--line);font-weight:700;font-size:14px;color:var(--ink2)}
.rr .ico{width:17px;height:17px}
.pl{display:grid;grid-template-columns:40px 1fr auto;gap:10px;align-items:center;padding:10px 14px;min-height:54px}
.pl+.pl{border-top:1px solid var(--line)}
.pos{font-family:var(--fb);font-weight:800;font-size:10.5px;text-align:center;padding:4px 0;border-radius:6px;color:var(--ink2);background:var(--bg2)}
.pl b{font-weight:700;font-size:15px;display:block}.pl .n small{display:block;font-size:12px;color:var(--muted)}
.pl .st{font-family:var(--fm);font-size:12px;color:var(--muted);text-align:right;white-space:nowrap}
.pl.off{opacity:.42}.pl.off .st{font-family:var(--fb)}
.pl.sel{background:color-mix(in srgb,var(--accent) ${d.theme === 'dark' ? 10 : 6}%,var(--surface));box-shadow:inset 3px 0 0 var(--accent)}
${d.theme === 'light' && !d.min ? '.pl.sel{background:color-mix(in srgb,var(--violet) 6%,var(--surface));box-shadow:inset 3px 0 0 var(--violet)}' : ''}
.put{grid-column:2/-1;display:flex;gap:8px;align-items:center;margin-top:8px}
.put button{height:40px;min-width:62px;padding:0 14px;border-radius:10px;font-weight:800;font-size:14px;color:var(--onaccent);background:${d.btn === 'grad' ? 'var(--violet)' : 'var(--accent)'}}
${d.btn === 'grad' ? '.put button:first-child{background:var(--grad)}' : ''}
.put span{font-size:12px;color:var(--muted);margin-left:2px}
/* підсумки */
.res{text-align:center;padding:18px 0 4px}
.res .k{font-family:var(--fm);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.res h1{font-family:var(--fd);font-weight:${d.caps ? 700 : 900};font-size:${d.caps ? 40 : 30}px;line-height:1.05;margin-top:6px;${d.caps ? 'text-transform:uppercase' : ''}}
.res h1 span{${d.logo === 'grad' ? 'background:var(--grad);-webkit-background-clip:text;color:transparent' : d.logo === 'solid' ? 'color:var(--accent)' : 'color:var(--ink2)'}}
.score{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:16px}
.score div{border:1px solid var(--line);border-radius:var(--r);background:var(--surface);padding:10px 8px;text-align:center;position:relative;overflow:hidden}
.score b{display:block;font-family:var(--fd);font-weight:700;font-size:${d.caps ? 34 : 28}px;line-height:1.1;font-variant-numeric:tabular-nums}
.score span{font-size:12px;color:var(--muted)}
.score .W{box-shadow:inset 0 3px 0 var(--win)}.score .D{box-shadow:inset 0 3px 0 var(--draw)}.score .L{box-shadow:inset 0 3px 0 var(--loss)}
.score .P{grid-column:span 1;${d.btn === 'grad' ? 'background:var(--grad);border:0;color:#fff' : `background:var(--accent);border:0;color:var(--onaccent)`}}
.score .P span{color:inherit;opacity:.85}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
/* ліги */
.h1c{text-align:center;padding:26px 0 6px}.h1c h1{font-family:var(--fd);font-weight:${d.caps ? 700 : 900};font-size:${d.caps ? 34 : 26}px;letter-spacing:-.01em;${d.caps ? 'text-transform:uppercase' : ''}}
.h1c p{color:var(--ink2);font-size:14px;margin:8px auto 18px;max-width:32ch}
.lg{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:12px 14px;min-height:64px}
.lg+.lg{border-top:1px solid var(--line)}
.lg .ic{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--bg2);color:var(--ink2)}.lg .ic .ico{width:19px;height:19px}
.lg b{display:flex;align-items:center;gap:6px;font-size:15px;font-weight:700}.lg .t span{display:block;font-size:12.5px;color:var(--ink2);margin-top:2px}
.tag{font-family:var(--fm);font-size:10px;font-weight:600;padding:2px 6px;border-radius:5px;border:1px solid var(--line);color:var(--ink2)}
.place{text-align:right;font-family:var(--fd);font-weight:700;font-size:22px;line-height:1}.place small{display:block;font-family:var(--fb);font-size:11px;font-weight:600;color:var(--muted);margin-top:3px}
.place.g{${d.logo === 'grad' ? 'background:var(--grad);-webkit-background-clip:text;color:transparent' : 'color:var(--accent2)'}}
${d.caps ? '.place.g{color:var(--accent)}' : ''}
.timer{font-family:var(--fm);font-weight:600;font-size:13px;padding:6px 9px;border-radius:8px;border:1px solid var(--accent2);color:var(--accent2)}
${d.caps ? '.timer{border-color:var(--accent);color:var(--accent)}' : ''}
`;

function page(d, title, body) {
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><link rel="stylesheet" href="${FONTS}"><style>${CSS(d)}</style></head><body><div class="wrap">${body}</div></body></html>`;
}
const I = n => `<i class="ic">${icon(n)}</i>`;
const R = icon('chevron-right');
const topHome = d => `<header class="top"><span class="home"><span class="mark">30-0 УПЛ</span></span><button class="signin">Увійти</button></header>`;
const topBack = d => `<header class="top"><button class="back">${back}Головна</button><button class="signin">Увійти</button></header>`;
const foot = `<div class="foot">30-0 УПЛ · <a href="#">Що нового у версії 0.69</a> · неофіційний фан-проєкт</div>`;

// ---------- екрани
const home = d => topHome(d) + `
<div class="hero"><div class="logo">30-0<span>УПЛ</span></div>
<p class="lead">Збери 11-ку з історії УПЛ і пройди сезон без жодної втрати очок.</p></div>
<button class="cta">Грати</button>
<div class="sec"><span>Режими</span></div>
<div class="list">
<div class="li hot">${I('calendar-star')}<b>Виклик дня</b><span class="new">30.09</span>${R}</div>
<div class="li">${I('account-group')}<b>Грати з друзями</b><span class="m">2 ліги</span>${R}</div>
<div class="li">${I('lightning-bolt')}<b>Дербі</b><span class="m">Динамо — Шахтар</span>${R}</div>
<div class="li">${I('heart')}<b>Один клуб</b><span class="m"></span>${R}</div>
<div class="li">${I('arrow-down-bold')}<b>Антисезон</b><span class="m">0-30</span>${R}</div></div>
<div class="sec"><span>Ще</span></div>
<div class="list">
<div class="li">${I('format-list-numbered')}<b>Таблиця</b><span class="m"></span>${R}</div>
<div class="li">${I('trophy')}<b>Трофеї</b><span class="m">23 з 118</span>${R}</div></div>
<div class="stats"><span><b>34</b>сезони</span><span><b>524</b>клуб-сезони</span><span><b>4 547</b>футболістів</span></div>
<details><summary>Як грати ${chev}</summary></details>
<details><summary>Питання та відповіді ${chev}</summary></details>` + foot;

const crest = code => { const c = chipColors(code); return `<i class="crest" style="background:${c.fill};color:${c.ink};box-shadow:inset 0 0 0 3px ${c.ring}">Д</i>`; };
const draft = d => topBack(d) + `
<div class="dbar"><h1>Драфт <em>6/11</em></h1><span class="f">4-3-3 · Класика</span></div>
${pitch(d.turf, 'draft', 400)}
<div class="wheel">${crest('dynamo-kyiv')}<div><b>Динамо (Київ)</b><span>1998/99 · 1 місце</span></div><button class="rr">${reroll}2</button></div>
<div class="list" style="margin-top:8px">
<div class="pl off"><span class="pos">НП</span><div class="n"><b>Андрій Шевченко</b><small>28 матчів · 18 голів</small></div><span class="st">НП зайнято</span></div>
<div class="pl sel"><span class="pos">ЦЗ</span><div class="n"><b>Каха Каладзе</b><small>26 матчів · 2 голи</small></div><span class="st"></span>
<div class="put"><button>ЦЗ</button><button>ЛЗ</button><button>ОПЗ</button><span>куди поставити</span></div></div>
<div class="pl"><span class="pos">ЦЗ</span><div class="n"><b>Олександр Головко</b><small>27 матчів · 1 гол</small></div><span class="st"></span></div>
<div class="pl"><span class="pos">ЦПЗ</span><div class="n"><b>Валентин Белькевич</b><small>24 матчі · 5 голів</small></div><span class="st"></span></div>
<div class="pl"><span class="pos">ОПЗ</span><div class="n"><b>Олександр Хацкевич</b><small>22 матчі · 1 гол</small></div><span class="st"></span></div>
<div class="pl"><span class="pos">ПВ</span><div class="n"><b>Віталій Косовський</b><small>21 матч · 4 голи</small></div><span class="st"></span></div></div>` + foot;

const result = d => topBack(d) + `
<div class="res"><div class="k">Ліга культових клубів · 4-3-3</div><h1>Ліга чемпіонів<br><span>2 місце</span></h1></div>
<div class="score"><div class="W"><b>22</b><span>перемоги</span></div><div class="D"><b>5</b><span>нічиїх</span></div><div class="L"><b>3</b><span>поразки</span></div>
<div class="P"><b>71</b><span>очко</span></div><div><b>2</b><span>місце</span></div><div><b>68:24</b><span>голи</span></div></div>
<div class="row2"><button class="cta sm">Новий драфт</button><button class="btn2" style="height:50px">${icon('share-variant').replace('class="ico"', 'class="ico" style="width:18px;height:18px"')}Поділитися</button></div>
<div class="sec"><span>Твоя 11-ка</span><span>сер. 86</span></div>
${pitch(d.turf, 'result', 470)}
<details><summary>Статистика сезону ${chev}</summary></details>
<details><summary>30 матчів ${chev}</summary></details>` + foot;

const leagues = d => topBack(d) + `
<div class="h1c"><h1>Грати з друзями</h1><p>Кожен збирає свою команду за однаковими правилами. Чия краща?</p></div>
<button class="cta">Створити лігу</button><p class="hint">Отримав посилання від друга? Просто відкрий його.</p>
<div class="sec"><span>Грають зараз</span><span>2</span></div>
<div class="list">
<div class="lg">${I('account-group')}<div class="t"><b>Банка на воротах <span class="tag">11×11</span></b><span>День 3 з 7 · 9 гравців · спроб 1 з 3</span></div><div class="place g">2<small>місце</small></div></div>
<div class="lg">${I('sword-cross')}<div class="t"><b>Кубок кума <span class="tag">5×5</span></b><span>Склади до 21:00 · 5 з 6 готові</span></div><span class="timer">02:14:37</span></div></div>
<div class="sec"><span>Завершені</span><span>3</span></div>
<div class="list">
<div class="lg">${I('trophy')}<div class="t"><b>Суддю на мило <span class="tag">11×11</span></b><span>7 днів · 11 гравців · 22.09</span></div><div class="place g">1<small>місце</small></div></div>
<div class="lg">${I('sword-cross')}<div class="t"><b>Дуель з Вітею <span class="tag">5×5</span></b><span>1 матч · 3:2 · 19.09</span></div><div class="place">1<small>місце</small></div></div>
<div class="lg">${I('account-group')}<div class="t"><b>Офіс на Подолі <span class="tag">11×11</span></b><span>7 днів · 9 гравців · 15.09</span></div><div class="place">4<small>місце</small></div></div></div>
<details><summary>Як це працює ${chev}</summary></details>` + foot;

const SCREENS = { home, draft, result, leagues };
const files = {};
for (const [k, d] of Object.entries(DIR)) for (const [s, fn] of Object.entries(SCREENS)) files[`${k}_${s}`] = page(d, `${d.title} — ${s}`, fn(d));

// ---------- газони поруч (одні й ті самі фішки, підсумки)
const pd = { ...DIR.A, t: { ...DIR.A.t, bg: '#1b1d24' } };
const pv = (turf, cap, dark) => `<figure style="margin:0"><figcaption style="font-weight:700;font-size:15px;margin:0 0 4px;color:#fff">${cap}</figcaption><p style="font-size:12px;color:#aab;margin:0 0 10px">${TURF[turf].name}</p><div style="width:340px">${pitch(turf, 'result', 460)}</div></figure>`;
files.pitch_variants = page(pd, 'Газон — варіанти', `<div style="display:flex;gap:28px;padding:22px 6px">${pv('radial', 'А · Зараз (радіальний зелений)')}${pv('navy', 'Б · Синій УПЛ')}${pv('lime', 'В · Плаский темний, лайм')}${pv('paper', 'Г · Світлий «папір»')}</div>`)
  .replace('max-width:430px', 'max-width:none');

// ---------- зведення: 4 напрями × 4 екрани (перший екран кожного)
const cmp = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><style>body{margin:0;background:#1b1d24;color:#fff;font-family:Manrope,sans-serif}
.g{display:grid;grid-template-columns:120px repeat(4,300px);gap:14px;padding:18px}.g h2{font-size:15px;margin:0;align-self:center}.g .c{font-size:13px;color:#aab;text-align:center}
.g .s{width:300px;height:650px;overflow:hidden;border-radius:14px;border:1px solid #333}.g img{width:300px;display:block}</style></head><body><div class="g"><span></span>
${['Головна', 'Драфт', 'Підсумки', 'Грати з друзями'].map(c => `<div class="c">${c}</div>`).join('')}
${Object.entries(DIR).map(([k, d]) => `<h2>${k} · ${d.title}</h2>${Object.keys(SCREENS).map(s => `<div class="s"><img src="${k}_${s}.png"></div>`).join('')}`).join('')}</div></body></html>`;

const ONLY = process.env.ONLY;
for (const k of Object.keys(files)) if (ONLY && !k.startsWith(ONLY)) delete files[k];
for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(OUT, k + '.html'), v);
if (!ONLY) fs.writeFileSync(path.join(OUT, 'compare.html'), cmp);

// ---------- знімки 390 px, deviceScaleFactor 2 (compare — 1×)
(async () => {
  const { chromium } = require(path.join(ROOT, 'tools/node_modules/playwright'));
  const exe = fs.readdirSync('/opt/pw-browsers').filter(x => /^chromium-\d+$/.test(x)).map(x => `/opt/pw-browsers/${x}/chrome-linux/chrome`).find(fs.existsSync);
  const args = ['--no-sandbox']; args.push('--ignore-certificate-errors-spki-list=' + (process.env.PROXY_CA_SPKI || 'KnP1OnzHv/y42eRQmbGwoYTHcSJF448m6CU5mdngwKk='));   // той самий ключ, що в docs/mockups/make.js
  const browser = await chromium.launch({ executablePath: exe, args, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  try {
    for (const k of Object.keys(files).concat(ONLY ? [] : ['compare'])) {
      const wide = k === 'pitch_variants' || k === 'compare';
      const ctx = await browser.newContext({ viewport: { width: k === 'compare' ? 1370 : wide ? 1480 : 390, height: 844 }, deviceScaleFactor: k === 'compare' ? 1 : 2 });
      const pg = await ctx.newPage();
      await pg.goto('file://' + path.join(OUT, k + '.html'));
      await pg.evaluate(() => document.fonts.ready);
      await pg.waitForTimeout(400);
      if (k === 'pitch_variants') await pg.locator('.wrap > div').screenshot({ path: path.join(OUT, k + '.png') });
      else await pg.screenshot({ path: path.join(OUT, k + '.png'), fullPage: true });
      await ctx.close();
      console.log('ok', k);
    }
  } finally { await browser.close(); }
})();
