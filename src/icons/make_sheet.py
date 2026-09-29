# Лист варіантів іконок для 30-0 УПЛ: інтерфейс (3 стилі) і трофеї (3 форми значка).
# Іконки: Material Design Icons (Pictogrammers, Apache-2.0 / Pictogrammers Free License) і Font Awesome Free (CC BY 4.0) — локальні копії з mkdocs-material.
import re, os
ROOT='/usr/local/lib/python3.11/dist-packages/material/templates/.icons'
def svg(set_, name):
    t=open(f'{ROOT}/{set_}/{name}.svg').read()
    vb=re.search(r'viewBox="([^"]+)"',t).group(1)
    inner=re.sub(r'^.*?<svg[^>]*>|</svg>\s*$','',t,flags=re.S)
    inner=re.sub(r'<!--.*?-->','',inner,flags=re.S)
    return vb,inner
def icon(set_,name,cls='i'):
    vb,inner=svg(set_,name)
    return f'<svg class="{cls}" viewBox="{vb}" aria-hidden="true">{inner}</svg>'

UI=[  # підпис, MDI outline, FA solid, MDI filled
 ('Трофеї','trophy-outline','trophy','trophy'),
 ('Серія днів','fire','fire','fire'),
 ('Заморозка','snowflake','snowflake','snowflake'),
 ('Виклик другу','sword-cross','user-group','sword-cross'),
 ('Виклик дня','calendar-star-outline','calendar-check','calendar-star'),
 ('Колесо','ferris-wheel','dharmachakra','ferris-wheel'),
 ('Склад / поле','soccer-field','futbol','soccer-field'),
 ('Таблиця','format-list-numbered','table-list','format-list-numbered'),
 ('Поділитися','share-variant-outline','share-nodes','share-variant'),
 ('Надіслати в Telegram','send-outline','paper-plane','send'),
 ('Увійти / акаунт','account-circle-outline','circle-user','account-circle'),
 ('Що нового','bullhorn-outline','bullhorn','bullhorn'),
 ('Рейтинги відкрито','lock-open-variant-outline','lock-open','lock-open-variant'),
 ('Статистика','chart-bar','chart-simple','chart-bar'),
 ('Секретне','eye-off-outline','user-secret','incognito'),
]
for _,a,b,c in UI:
    for s,n in (('material',a),('fontawesome/solid',b),('material',c)):
        assert os.path.exists(f'{ROOT}/{s}/{n}.svg'),(s,n)

CAT={'season':('#ffb22e','Сезон'),'daily':('#5ea0e8','Щодня'),'squad':('#43c26b','Склад'),'secret':('#b48cf0','Секретний'),'locked':('#6f6a62','Ще не відкрито')}
TRO=[ # назва, умова, категорія, гліф MDI
 ('Чемпіони','Виграй чемпіонат','season','trophy'),
 ('Непереможні','Сезон без поразок','season','shield-star'),
 ('Фортеця','Пропусти 15 голів або менше','season','wall'),
 ('Голеада','Забий 90+ голів за сезон','season','soccer'),
 ('Тиждень поспіль','Грай виклик дня 7 днів підряд','daily','fire'),
 ('Все своє','Усі 11 гравців — українці','squad','flag-variant'),
 ('Зірка згасла','Гравець 95+ провалив сезон','secret','star-off'),
 ('Ідеальний сезон','30 перемог із 30','locked','crown'),
]
for t in TRO: assert os.path.exists(f'{ROOT}/material/{t[3]}.svg'),t

SHIELD='M50 4 L90 16 V50 C90 76 72 92 50 100 C28 92 10 76 10 50 V16 Z'
HEX='M50 3 L91 26.5 V73.5 L50 97 L9 73.5 V26.5 Z'
def badge(kind,cat,glyph,size=64):
    col=CAT[cat][0];locked=cat=='locked'
    vb,inner=svg('material',glyph)
    gfill='#8a847a' if locked else col
    if kind=='shield':
        shape=f'<path d="{SHIELD}" fill="#1b1a19" stroke="{col}" stroke-width="5"/><path d="{SHIELD}" fill="{col}" opacity=".10" transform="translate(50 52) scale(.8) translate(-50 -52)"/>'
        g=f'<svg x="28" y="26" width="44" height="44" viewBox="{vb}" fill="{gfill}">{inner}</svg>'
    elif kind=='medal':
        shape=(f'<path d="M30 2 L46 38 L38 42 L22 6 Z" fill="{col}" opacity=".55"/><path d="M70 2 L54 38 L62 42 L78 6 Z" fill="{col}" opacity=".85"/>'
               f'<circle cx="50" cy="62" r="34" fill="#1b1a19" stroke="{col}" stroke-width="5"/><circle cx="50" cy="62" r="26" fill="none" stroke="{col}" stroke-width="1.5" opacity=".45"/>')
        g=f'<svg x="32" y="44" width="36" height="36" viewBox="{vb}" fill="{gfill}">{inner}</svg>'
    else:
        shape=f'<path d="{HEX}" fill="{col}" opacity="{.25 if locked else 1}"/><path d="{HEX}" fill="#1b1a19" transform="translate(50 50) scale(.84) translate(-50 -50)"/>'
        g=f'<svg x="29" y="29" width="42" height="42" viewBox="{vb}" fill="{gfill}">{inner}</svg>'
    lock=''
    if locked:
        lvb,lin=svg('material','lock')
        lock=f'<circle cx="80" cy="84" r="14" fill="#2a2826" stroke="#1b1a19" stroke-width="3"/><svg x="71" y="75" width="18" height="18" viewBox="{lvb}" fill="#b3aea4">{lin}</svg>'
    return f'<svg class="bd" width="{size}" height="{size}" viewBox="0 0 100 106" aria-hidden="true">{shape}{g}{lock}</svg>'

ui_rows=''.join(f'''<div class="ur"><span class="ul">{lab}</span>
  <span class="uc a">{icon('material',a)}</span><span class="uc b">{icon('fontawesome/solid',b)}</span><span class="uc c"><i>{icon('material',c)}</i></span></div>''' for lab,a,b,c in UI)

def ctx(style):
    fx={'a':lambda n:icon('material',n),'b':lambda n:icon('fontawesome/solid',n),'c':lambda n:f'<i class="tile">{icon("material",n)}</i>'}[style]
    m={'a':('fire','snowflake','sword-cross','trophy-outline','send-outline'),'b':('fire','snowflake','user-group','trophy','paper-plane'),'c':('fire','snowflake','sword-cross','trophy','send')}[style]
    return f'''<div class="ctx s{style}"><div class="chips"><span class="chip hot">{fx(m[0])}Серія: 5 дн.</span><span class="chip">{fx(m[1])}Заморозка: є</span></div>
      <div class="btns"><button class="pb">{fx(m[2])}Кинути виклик другу</button><button class="gb">{fx(m[3])}Трофеї</button><button class="pb tg">{fx(m[4])}Надіслати в Telegram</button></div></div>'''

tro_cols=''
for kind,title,note in (('shield','T1 · Щит','Найбільш «футбольний»: як емблема клубу. Рамка — колір категорії.'),
                        ('medal','T2 · Медаль','Нагорода на стрічці. Урочисто, але займає більше місця по висоті.'),
                        ('hex','T3 · Шестикутник','Як досягнення в іграх (Steam, Xbox): щільно, сучасно.')):
    cards=''.join(f'''<div class="tro{' off' if c=='locked' else ''}{' sec' if c=='secret' else ''}">{badge(kind,c,g,52)}<div class="tt"><b>{n}</b><span>{d}</span><em style="color:{CAT[c][0]}">{CAT[c][1]}</em></div></div>''' for n,d,c,g in TRO)
    big=''.join(badge(kind,c,g,76) for n,d,c,g in TRO)
    tro_cols+=f'<section class="tv"><h3>{title}</h3><p class="note">{note}</p><div class="big">{big}</div><div class="cards">{cards}</div></section>'

html=f'''<title>Іконки 30-0: варіанти</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@700&family=Manrope:wght@500;600;700;800&family=JetBrains+Mono:wght@600&display=swap">
<style>
:root{{color-scheme:dark;--bg:#121212;--surface:#1c1c1d;--line:#303032;--ink:#f4f1ea;--ink2:#b3aea4;--muted:#7c776f;--amber:#ff7a1a;--amber2:#ff9a3d}}
body{{background:var(--bg);color:var(--ink);font-family:"Manrope",system-ui,sans-serif;margin:0;padding-inline:16px;padding-block:22px 48px}}
.wrap{{max-width:1100px;margin:0 auto}}
h1{{font-family:"Unbounded",sans-serif;font-size:22px;margin:0 0 6px}}
h2{{font-family:"Unbounded",sans-serif;font-size:17px;margin:34px 0 6px}}
h3{{font-size:14px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2);margin:0 0 4px}}
.lead,.note{{color:var(--ink2);font-size:14px;line-height:1.5;max-width:70ch;margin:0 0 12px}}.note{{font-size:13px}}
svg.i{{width:22px;height:22px;fill:currentColor;display:block}}
/* інтерфейс */
.ut{{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--surface)}}
.uh,.ur{{display:grid;grid-template-columns:minmax(120px,1.4fr) repeat(3,minmax(60px,1fr));align-items:center}}
.uh{{font-size:12px;color:var(--ink2);font-weight:700;border-bottom:1px solid var(--line)}}.uh span{{padding:10px 12px}}.uh span+span{{text-align:center}}
.ur{{border-bottom:1px solid var(--line)}}.ur:last-child{{border-bottom:0}}
.ul{{padding:9px 12px;font-size:13px;font-weight:600}}.uc{{display:grid;place-items:center;padding:8px}}
.uc.a svg,.ctx.sa svg{{color:var(--ink)}} .uc.b svg{{width:19px;height:19px;color:var(--ink)}} .ctx.sb svg{{width:15px;height:15px}}
.uc.c i,.tile{{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:color-mix(in srgb,var(--amber) 16%,transparent);color:var(--amber2)}}
.tile{{width:24px;height:24px;border-radius:6px}}.tile svg{{width:16px;height:16px}}
.ctxs{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin-top:14px}}
.ctx{{border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--surface);display:grid;gap:10px}}
.ctx .lbl{{font-size:12px;color:var(--ink2);font-weight:700}}
.chips,.btns{{display:flex;flex-wrap:wrap;gap:8px}}
.chip{{display:inline-flex;align-items:center;gap:6px;font-family:"JetBrains Mono",monospace;font-size:12px;padding:4px 10px;border:1px solid var(--line);border-radius:999px;color:var(--ink2);background:var(--bg)}}
.chip svg{{width:15px;height:15px}}.chip.hot{{border-color:var(--amber);color:var(--amber2)}}.chip.hot svg{{color:var(--amber2)}}
button{{font:inherit;font-weight:700;font-size:14px;display:inline-flex;align-items:center;gap:8px;border-radius:10px;padding:9px 14px;cursor:pointer}}
.pb{{background:var(--ink);color:#121212;border:1px solid var(--ink)}}.pb svg{{color:#121212}}.gb{{background:transparent;color:var(--ink2);border:1px solid var(--line)}}
.btns svg{{width:18px;height:18px}}.ctx .btns .pb svg{{color:#121212}}.ctx.sc .pb .tile{{background:rgba(0,0,0,.12);color:#121212}}
/* трофеї */
.tvs{{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;margin-top:10px}}
.tv{{border:1px solid var(--line);border-radius:14px;padding:14px;background:#161616}}
.big{{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 14px}}
.cards{{display:grid;gap:8px}}
.tro{{display:grid;grid-template-columns:52px 1fr;gap:12px;align-items:center;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}}
.tro.sec{{border-color:#4a3a66}}.tro.off{{opacity:.6}}
.tt{{display:grid;gap:1px;min-width:0}}.tt b{{font-size:14px}}.tt span{{font-size:12px;color:var(--ink2)}}.tt em{{font-style:normal;font-family:"JetBrains Mono",monospace;font-size:10px;text-transform:uppercase;letter-spacing:.06em}}
.was{{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:8px}}
.was .tro{{min-width:260px;opacity:1}}.emo{{font-size:26px;text-align:center}}
.src{{margin-top:34px;font-size:12px;color:var(--muted);max-width:80ch;line-height:1.5}}
</style>
<div class="wrap">
<h1>Іконки: варіанти замість емодзі</h1>
<p class="lead">Два набори: іконки інтерфейсу (кнопки, чипи, меню) і значки трофеїв. Усі кольори — зі скіна «Табло». Обери стиль для кожного набору — або скажи, що змішати.</p>

<h2>1. Інтерфейс — три стилі</h2>
<p class="note"><b>A</b> — тонкий контур (Material Design Icons, outline): спокійно, як у FotMob. <b>B</b> — щільна заливка (Font Awesome): спортивно, помітно. <b>C</b> — заливка в помаранчевій плитці: як у застосунках, найбільше акценту.</p>
<div class="ut"><div class="uh"><span>Де</span><span>A · контур</span><span>B · заливка</span><span>C · у плитці</span></div>{ui_rows}</div>
<div class="ctxs"><div class="ctx sa"><span class="lbl">A у грі</span>{ctx('a')[len('<div class="ctx sa">'):-6]}</div><div class="ctx sb"><span class="lbl">B у грі</span>{ctx('b')[len('<div class="ctx sb">'):-6]}</div><div class="ctx sc"><span class="lbl">C у грі</span>{ctx('c')[len('<div class="ctx sc">'):-6]}</div></div>

<h2>2. Трофеї — три форми значка</h2>
<p class="note">Колір рамки — категорія: <span style="color:#ffb22e">золотий — сезон</span>, <span style="color:#5ea0e8">синій — щоденні</span>, <span style="color:#43c26b">зелений — склад</span>, <span style="color:#b48cf0">фіолетовий — секретні</span>, сірий із замком — ще не відкрито. Малюнок усередині — з того ж набору, футбольні (рукавиця, ворота, бутса) домалюю.</p>
<div class="tvs">{tro_cols}</div>
<h3 style="margin-top:22px">Для порівняння — як зараз</h3>
<div class="was"><div class="tro"><span class="emo">🏆</span><div class="tt"><b>Чемпіони</b><span>Виграй чемпіонат</span></div></div><div class="tro"><span class="emo">🛡️</span><div class="tt"><b>Непереможні</b><span>Сезон без поразок</span></div></div><div class="tro"><span class="emo">🌠</span><div class="tt"><b>Зірка згасла</b><span>Гравець 95+ провалив сезон</span></div></div></div>
<p class="src">Референси: кабінет трофеїв 38-0 (там теж емодзі, закриті — сірі), значки досягнень Steam/Xbox, лінійні іконки FotMob і Sofascore. Іконки — Material Design Icons і Font Awesome Free: безкоштовні, вбудовуються прямо в сторінку, працюють і в Telegram. Font Awesome просить згадку автора — додамо рядок у «Про гру».</p>
</div>'''
open('/home/claude/upl-dataset/game/icons/icons_sheet.html','w').write(html)
print(len(html))
