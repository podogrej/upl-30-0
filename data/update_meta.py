"""pool['meta'] — лічильники пулу з самих даних (до 0.54 їх вписували руками, і вони відстали: 16 250 карток замість 16 256).
Запуск з кореня репозиторію: python3 data/update_meta.py   (після будь-якого скрипта, що додає картки чи псевдоніми). Повторний запуск нічого не змінює.
club_seasons — клуб-сезонів; players — карток (гравець-сезонів); person_ids — різних id; persons — різних людей (id з урахуванням
pool['alias']); aliases — псевдонімів. Поля names/positions (опис версій) не чіпаємо. Гра meta не читає (сайт рахує з DATA сам).
"""
import json, os
POOL = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'pool.json')
raw = open(POOL, encoding='utf-8').read()
pool = json.loads(raw)
alias = pool.get('alias', {})
ids = {p[5] for c in pool['clubs'] for p in c['pl']}
m = pool['meta']
m.update(club_seasons=len(pool['clubs']), players=sum(len(c['pl']) for c in pool['clubs']), persons=len({alias.get(i, i) for i in ids}),
         person_ids=len(ids), aliases=len(alias))
out = json.dumps(pool, ensure_ascii=False, separators=(',', ':'))
if out != raw: open(POOL, 'w', encoding='utf-8').write(out)
print('meta:', {k: v for k, v in m.items() if isinstance(v, int)}, '| src/pool.json', 'змінено' if out != raw else 'без змін')
