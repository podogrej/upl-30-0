"""Вписати асисти 2021/22 (assists_2021_more.csv) у src/pool.json: поле p[8] гравців клуб-сезону 2021.
Запуск з кореня репозиторію: python3 data/research_assists/inject_assists_2021.py
Потім: python3 src/build.py && node tools/make_engine.js
Повторний запуск безпечний (0.54): рядки, чиї картки data/fix_2021/fix_pool_2021.py віддав іншій людині (REPLACED), пропускаються —
асисти тих карток ставить сам fix_pool_2021.py.
0.54: рядок «Чорноморець — Данило Алефіренко» виправлено на «Даниїл Сухоручко» (tm:539448): на sports.ru у Чорноморці 2021/22 — Сухоручко
(1 М, 4 хв), Алефіренко — у Зорі (data/fixes/fix_pool_054.py).
"""
import json, os
D = os.path.dirname(os.path.abspath(__file__))
POOL = os.path.join(D, '..', '..', 'src', 'pool.json')
rows = [l.split(';') for l in open(os.path.join(D, 'assists_2021_more.csv'), encoding='utf-8').read().splitlines()[1:]]
ast = {}
for pid, name, club, *_ , a, cs, url, conf in [(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]) for r in rows]:
    key = (club, pid, name)
    assert key not in ast, key
    ast[key] = int(a)
pool = json.load(open(POOL, encoding='utf-8'))
done = set()
for c in pool['clubs']:
    if c['y'] != 2021: continue
    for p in c['pl']:
        key = (c['c'], p[5], p[0])
        if key not in ast:  # id у пулі міг змінитися після злиття дублів (names/merged_ids.csv) — тоді за іменем у клубі
            same = [k for k in ast if k[0] == c['c'] and k[2] == p[0]]
            key = same[0] if len(same) == 1 else key
        if key in ast:
            p[8] = ast[key]; done.add(key)
    if any(k[0] == c['c'] for k in ast):
        assert all(p[8] is not None for p in c['pl']), c['c']
REPLACED = {('desna-chernihiv', 'tm:49016', 'Євген Паст'), ('kolos-kovalivka', 'tm:463845', 'Олександр Демченко')}   # fix_pool_2021.py
missing = set(ast) - done - REPLACED
assert not missing, missing
json.dump(pool, open(POOL, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('assists written:', len(done))
