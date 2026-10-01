# Генерує icons.js: кілька SVG-іконок (Material Design Icons + логотип Telegram з Font Awesome) і емодзі для решти інтерфейсу й трофеїв (src/icons/emoji.js, з 0.67). Іконки вбудовуються в сторінку, нічого не вантажиться зі сторонніх сайтів.
import re, json, os, sys
# Запуск з кореня репозиторію: python3 src/icons/make_icons.py [шлях до .icons]
# Іконки беруться з пакета mkdocs-material (pip download mkdocs-material, розпакувати wheel): material/templates/.icons
ROOT=sys.argv[1] if len(sys.argv)>1 else '/usr/local/lib/python3.11/dist-packages/material/templates/.icons'
SRC=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
# 0.67 (власник: «назад на емодзі»): SVG лишились лише там, де емодзі немає або це бренд — решта іконок і значки трофеїв — емодзі (EMOJI нижче)
UI=['home-outline','chevron-right','google','weather-night','white-balance-sunny']
def load(path):
    t=open(path).read();vb=re.search(r'viewBox="([^"]+)"',t).group(1);ds=re.findall(r'<path[^>]*\sd="([^"]+)"',t)
    assert len(ds)==1,(path,len(ds));return [vb,ds[0]]+([1] if 'evenodd' in t else [])   # 3-й елемент — fill-rule evenodd
ICO={}
for n in sorted(UI):ICO[n]=load(f'{ROOT}/material/{n}.svg')
ICO['telegram']=load(f'{ROOT}/fontawesome/brands/telegram.svg')
# у трофеях кожен id з гри має отримати емодзі (поле i у trophies.js)
_t=open(os.path.join(SRC,'trophies.js')).read()
miss=[i for i,b in re.findall(r'\{id:"([a-z0-9]+)"([^}]*)',_t) if 'i:"' not in b];assert not miss,miss
EMOJI_JS=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'emoji.js')).read()
js=f'''// ЗГЕНЕРОВАНО icons/make_icons.py — не редагувати вручну.
// Іконки: Material Design Icons (Pictogrammers, Apache-2.0) і логотип Telegram з Font Awesome Free (CC BY 4.0).
const ICO={json.dumps(ICO,separators=(',',':'))};
function icon(n){{const x=ICO[n];return x?`<svg class="ico" viewBox="${{x[0]}}" aria-hidden="true"><path d="${{x[1]}}"${{x[2]?' fill-rule="evenodd"':''}}/></svg>`:EMOJI[n]?`<span class="ico em" aria-hidden="true">${{EMOJI[n]}}</span>`:'';}}   // немає SVG — емодзі
'''+EMOJI_JS
open(os.path.join(SRC,'icons.js'),'w').write(js)
print(len(ICO),'icons',len(js),'bytes')
