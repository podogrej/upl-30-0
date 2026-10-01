# Сборка (запускати з папки src/): python3 build.py
# → ../index.html (сайт для Vercel, усе всередині) і ../dist/30-0-upl.html (прототип без онлайну для артефакту)
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
tpl=open('template.html').read().replace('/*__ICONS__*/',open('icons.js').read()).replace('/*__TROPHIES__*/',open('trophies.js').read()).replace('/*__PLAYER__*/',open('player.js').read()).replace('/*__LEAGUES__*/',open('leagues.js').read()).replace('/*__ACCOUNT__*/',open('account.js').read()).replace('/*__CHALLENGE__*/',open('challenge.js').read()).replace('/*__FIVE__*/',open('pen_skill.js').read()+open('five_core.js').read().split('\nif(typeof module')[0]+'\n'+open('five.js').read()); pool=open('pool.json').read().replace('</','<\\/')
# кольори клубів (data/club_colors.csv, code = c у pool.json) → константа CLUB_COLORS {code:[c1,c2,c3]}; клуб без c1 (Темп) — не пишемо, гра малює нейтральну фішку
import csv,json
_cc={r['code']:[r['c1'],r['c2'],r['c3']] for r in csv.DictReader(open('../data/club_colors.csv',encoding='utf-8')) if r['c1']}
assert '/*__CLUB_COLORS__*/{}' in tpl
tpl=tpl.replace('/*__CLUB_COLORS__*/{}',json.dumps(_cc,separators=(',',':')))
import hashlib; datav='d'+hashlib.sha1(open('pool.json','rb').read()).hexdigest()[:8]; tpl=tpl.replace('__DATAV__',datav)
art=tpl.replace('__POOL__',pool).replace('__ONLINE__','false')
os.makedirs('../dist',exist_ok=True); open('../dist/30-0-upl.html','w').write(art)
head='''<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Збери XI з усієї історії Прем'єр-ліги України 1992–2026 і пройди сезон 30-0. Щоденний виклик, дербі, антисезон.">
<meta property="og:title" content="30-0 УПЛ — драфт з історії чемпіонату України">
<meta property="og:description" content="Колесо видає клуб і сезон, ти збираєш XI і граєш 30 турів. Чи вийде 30-0-0?">
<meta name="theme-color" content="#0b1430">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1'%3E%3Cstop offset='0' stop-color='%239a2bb5'/%3E%3Cstop offset='.5' stop-color='%23e0287a'/%3E%3Cstop offset='1' stop-color='%23ff831e'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='14' fill='%230b1430'/%3E%3Ctext x='32' y='38' font-size='23' font-family='Arial Black,Arial,sans-serif' font-weight='900' fill='white' text-anchor='middle' letter-spacing='-1'%3E30-0%3C/text%3E%3Crect x='12' y='46' width='40' height='6' rx='3' fill='url(%23g)'/%3E%3C/svg%3E">\n<link rel="apple-touch-icon" href="icon-180.png">   <!-- 0.67: іконка в новому дизайні (темно-синя + градієнт УПЛ) -->
<script>/* Microsoft Clarity (анонімна аналітика кліків, рішення власника 30.09.2026) — лише на боєвому адресі, не на тестовому й не в автотестах */
if(location.hostname==='upl-30-0.vercel.app'){(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","yq84mk48cm");}</script>
<style>html{-webkit-text-size-adjust:100%}:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}[hidden]{display:none!important}img{max-width:100%}</style>
</head>
<body>
'''
# 0.67 (власник: сайт довго вантажиться): база гравців (≈380 КБ стиснено) — окремим файлом pool.<версія даних>.js з довгим кешем (vercel.json);
# після кожного випуску телефон качає лише сторінку (≈180 КБ), базу — лише коли змінились дані. Старі pool.*.js прибираємо.
import glob
for f in glob.glob('../pool.*.js'):
    if f!=f'../pool.{datav}.js':os.remove(f)
open(f'../pool.{datav}.js','w').write('window.__POOL='+open('pool.json').read()+';\n')
assert '<script id="pool" type="application/json">__POOL__</script>' in tpl
site=head+tpl.replace('<script id="pool" type="application/json">__POOL__</script>',f'<script src="pool.{datav}.js"></script>').replace('__ONLINE__','true')+'\n</body>\n</html>\n'
open('../index.html','w').write(site)
print(len(art), len(site))
