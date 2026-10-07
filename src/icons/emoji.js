// Emoji only for rewards (trophy badges, champion cup, award lines); the UI uses SVG via ic()
const EMOJI={trophy:'🏆',star:'⭐',soccer:'⚽'};
function em(n,cls){const e=EMOJI[n];return e?`<i class="ic em${cls?' '+cls:''}" aria-hidden="true">${e}</i>`:'';}   // reward emoji tile
function ic(n,cls){return `<i class="ic${cls?' '+cls:''}">${icon(n)}</i>`;}   // UI icon: always SVG, currentColor
function trBadge(t,got){const ms=/^ms(\d+)$/.exec(t.id||''),m=ms&&MILESTONES.find(x=>String(x[0])===ms[1]);
  const e=t.id==='secret'?'✨':t.i||(m&&m[1])||'🏆';return `<span class="tre${got?'':' off'}" aria-hidden="true">${got||!t.sec?e:'❔'}</span>`;}
