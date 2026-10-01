// 0.67 (власник: «іконки не працюють — назад на емодзі»): кнопки, рядки й трофеї — емодзі; SVG лишаються лише там, де емодзі немає
// (бренди Telegram і Google, «Головна», стрілки, перемикач теми)
const EMOJI={trophy:'🏆',fire:'🔥','sword-cross':'⚔️','calendar-star':'📅','ferris-wheel':'🎡','soccer-field':'🏟️','format-list-numbered':'📊','share-variant':'📤',send:'📨',
  'account-circle':'👤','lock-open-variant':'🔓','chart-bar':'📊',eye:'👁️','eye-off':'🙈','check-circle':'✅','check-decagram':'✅',handshake:'🤝','content-copy':'📋',image:'🖼️',
  star:'⭐',lock:'🔒','account-group':'👥',medal:'🏅',crown:'👑','format-quote-open':'❝',history:'🕘',pencil:'✏️',logout:'🚪','alert-outline':'⚠️','calendar-check':'📅',
  'account-multiple-check':'👥',bookshelf:'📚','timer-sand':'⏳',restart:'🔄','swap-horizontal':'🔁',soccer:'⚽','shield-star':'🛡️','trending-down':'📉',heart:'❤️','lightning-bolt':'⚡','arrow-down-bold':'⬇️'};
function ic(n,cls){const e=EMOJI[n];return e?`<i class="ic em${cls?' '+cls:''}" aria-hidden="true">${e}</i>`:`<i class="ic${cls?' '+cls:''}">${icon(n)}</i>`;}   // іконка в плитці: емодзі або SVG
function trBadge(t,got){const ms=/^ms(\d+)$/.exec(t.id||''),m=ms&&MILESTONES.find(x=>String(x[0])===ms[1]);
  const e=t.id==='secret'?'✨':t.i||(m&&m[1])||'🏆';return `<span class="tre${got?'':' off'}" aria-hidden="true">${got||!t.sec?e:'❔'}</span>`;}
