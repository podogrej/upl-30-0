# Генерує icons.js: SVG-іконки (Material Design Icons + 2 бренди Font Awesome) для інтерфейсу (стиль C — іконка в помаранчевій плитці)
# і значки трофеїв (T3 — шестикутник). Іконки вбудовуються в сторінку, нічого не вантажиться зі сторонніх сайтів.
import re, json, os, sys
# Запуск з кореня репозиторію: python3 src/icons/make_icons.py [шлях до .icons]
# Іконки беруться з пакета mkdocs-material (pip download mkdocs-material, розпакувати wheel): material/templates/.icons
ROOT=sys.argv[1] if len(sys.argv)>1 else '/usr/local/lib/python3.11/dist-packages/material/templates/.icons'
SRC=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
UI=['trophy','fire','snowflake','sword-cross','calendar-star','ferris-wheel','soccer-field','format-list-numbered','share-variant','send',
    'account-circle','bullhorn','lock-open-variant','chart-bar','incognito','eye','check-circle','check-decagram','handshake','content-copy','image',
    'star','lock','google','star-four-points','account-group','new-box','chart-box','medal','crown','home','chevron-right','weather-night','white-balance-sunny','view-column','format-quote-open','history']
TR={ # трофей → гліф
 'champ':'trophy','top3':'star','unbeaten':'shield-star','perfect':'diamond-stone','mid8':'scale-balance','relegated':'trending-down',
 'goals80':'soccer','fortress':'wall','iron':'door-closed-lock','nodraw':'sword-cross','sieve':'dots-grid','lucky':'clover','unlucky':'weather-pouring',
 'allua':'flag-variant','nations':'earth','band7':'stadium-variant','band5':'account-group','abc':'alphabetical-variant','tannoy':'bullhorn',
 'pegs':'swap-horizontal','vets':'human-cane','striker':'target','assist':'magic-staff','eight':'star-shooting','hardchamp':'fire','hcchamp':'eye-off',
 'derbychamp':'lightning-bolt','oneclubchamp':'heart','antilast':'arrow-down-bold','anti0':'grave-stone','antidry':'bread-slice','dchamp':'calendar-star',
 's3':'fire','s7':'calendar-week','s14':'calendar-month','s30':'calendar-check','d10':'coffee','d50':'medal','golden':'trophy-variant','rebsh':'handshake',
 'samba':'music','noua':'airplane','namesakes':'card-account-details','ghosts':'ghost','crimea':'waves','cross':'road-variant','mediocre':'hat-fedora',
 'cursed':'crystal-ball','heist':'sack','fairy':'auto-fix','fallen':'star-off','kids':'baby-face-outline','gkmvp':'hand-back-right','bottom':'chevron-triple-down',
 'nice':'emoticon-wink-outline','homefort':'castle','thrash':'turtle','tractor':'tractor','minimal':'numeric-1-box','drawish':'handshake-outline','equal':'scale-balance','lonewolf':'account-alert','ukrposhta':'email-alert','kukuriku':'bird','lobanovsky':'clipboard-text','panenka':'feather','samba8':'music-note','gamarjoba':'hand-wave','ndoye':'star-face','pichkur':'glass-mug-off','poodles':'dog','sheep':'sheep','brains':'brain','talk':'microphone','tablo':'scoreboard','pyvo':'glass-mug-variant','palianytsia':'bread-slice','oleksandry':'account-group','trio':'glass-wine','rada':'vote','zarobitchany':'bag-suitcase','ga150':'pasta','serhiivka':'map-marker','andriivka':'map-marker','dmytrivka':'map-marker','yuriivka':'map-marker','oleksiivka':'map-marker','maksymivka':'map-marker','romaniv':'map-marker','volodymyr':'home-city','money':'cash-off','lucescu':'account-tie','lucescu2':'train','bronzedyn':'medal-outline','warsaw':'flag-checkered','sailors_eu':'sail-boat','sailors_back':'anchor','sailors_silver':'medal','zorya':'star-shooting-outline','rebrov15':'shield-check','collective':'account-group-outline','semi99':'stadium','odesa':'waves','shalandy':'fish','bronze06':'medal-outline','cup92':'trophy-outline','simple':'run-fast','vodka':'bottle-wine','ga250':'door-open','ga400':'target','ga600':'handball','ga800':'basketball','ga1000':'trophy-broken','ms1':'sprout','ms5':'soccer','ms10':'ticket','ms25':'ribbon','ms50':'medal','ms100':'star-circle','ms250':'bank'}
def load(path):
    t=open(path).read();vb=re.search(r'viewBox="([^"]+)"',t).group(1);ds=re.findall(r'<path[^>]*\sd="([^"]+)"',t)
    assert len(ds)==1,(path,len(ds));return [vb,ds[0]]
ICO={}
for n in sorted(set(UI)|set(TR.values())):ICO[n]=load(f'{ROOT}/material/{n}.svg')
ICO['telegram']=load(f'{ROOT}/fontawesome/brands/telegram.svg')
# у трофеях кожен id з гри має отримати гліф
ids=re.findall(r'\{id:"([a-z0-9]+)"',open(os.path.join(SRC,'trophies.js')).read())
miss=[i for i in ids if i not in TR];assert not miss,miss
js=f'''// ЗГЕНЕРОВАНО icons/make_icons.py — не редагувати вручну.
// Іконки: Material Design Icons (Pictogrammers, Apache-2.0) і логотип Telegram з Font Awesome Free (CC BY 4.0).
const ICO={json.dumps(ICO,separators=(',',':'))};
function icon(n){{const x=ICO[n];return x?`<svg class="ico" viewBox="${{x[0]}}" aria-hidden="true"><path d="${{x[1]}}"/></svg>`:'';}}
function ic(n,cls){{return `<i class="ic${{cls?' '+cls:''}}">${{icon(n)}}</i>`;}}   // стиль C: іконка в помаранчевій плитці
const TR_GLYPH={json.dumps(TR,separators=(',',':'))};
const TR_COL={{season:'color-mix(in srgb,var(--gk) 58%,var(--muted))',squad:'color-mix(in srgb,var(--mf) 58%,var(--muted))',players:'color-mix(in srgb,var(--amber) 62%,var(--muted))',modes:'color-mix(in srgb,var(--fw) 58%,var(--muted))',daily:'color-mix(in srgb,var(--df) 58%,var(--muted))',secret:'color-mix(in srgb,#a77ee6 60%,var(--muted))',milestone:'color-mix(in srgb,var(--gk) 58%,var(--muted))'}};   // приглушені кольори категорій
const HEX_D='M50 3 L91 26.5 V73.5 L50 97 L9 73.5 V26.5 Z';
// значок трофея (T3): шестикутник кольору категорії, гліф усередині; закритий — сірий із замком
function trBadge(t,got){{const g=ICO[TR_GLYPH[t.id]]||ICO.trophy;const l=ICO.lock;
  return `<svg class="hx${{got?'':' off'}}" viewBox="0 0 100 100" style="--c:${{got?(TR_COL[t.cat]||'var(--amber)'):'var(--muted)'}}" aria-hidden="true"><path class="o" d="${{HEX_D}}"/><path class="in" d="${{HEX_D}}" transform="translate(50 50) scale(.84) translate(-50 -50)"/><svg x="29" y="29" width="42" height="42" viewBox="${{g[0]}}"><path class="g" d="${{g[1]}}"/></svg>`+
    (got?'':`<circle class="lk" cx="80" cy="80" r="15"/><svg x="71" y="71" width="18" height="18" viewBox="${{l[0]}}"><path class="lg" d="${{l[1]}}"/></svg>`)+'</svg>';}}
'''
open(os.path.join(SRC,'icons.js'),'w').write(js)
print(len(ICO),'icons',len(js),'bytes')
