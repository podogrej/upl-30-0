"""Сглаживание «камео-сезонов» (0.46): мало матчей → рейтинг тянется к полным сезонам игрока рядом.
Запуск из корня: python3 data/ratings/smooth_cameo.py  (потом python3 src/build.py && node tools/make_engine.js)
Считает всегда от исходных рейтингов (data/ratings/pool_ratings_raw.json — создаётся при первом запуске), поэтому повторный запуск ничего не портит.
Правило: если матчей < FULL и у того же человека есть сезоны с 10+ матчами в пределах ±2 лет (кроме этого),
  рейтинг = w·свой + (1−w)·среднее тех сезонов, w = матчи / FULL.
"""
import json, os
from collections import defaultdict
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
POOL = os.path.join(ROOT, 'src', 'pool.json'); RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pool_ratings_raw.json')
FULL, MIN_REF_APPS, WINDOW = 15, 10, 2
pool = json.load(open(POOL, encoding='utf-8'))
key = lambda c, i: f"{c['y']}|{c['c']}|{i}"
if not os.path.exists(RAW):
    json.dump({key(c, i): p[2] for c in pool['clubs'] for i, p in enumerate(c['pl'])}, open(RAW, 'w', encoding='utf-8'), separators=(',', ':'))
raw = json.load(open(RAW, encoding='utf-8'))
per = defaultdict(list)
for c in pool['clubs']:
    for i, p in enumerate(c['pl']): per[p[5]].append((c['y'], p[3] or 0, raw[key(c, i)]))
changed = 0
for c in pool['clubs']:
    for i, p in enumerate(c['pl']):
        r, a = raw[key(c, i)], p[3] or 0
        ref = [fr for fy, fa, fr in per[p[5]] if fa >= MIN_REF_APPS and abs(fy - c['y']) <= WINDOW and fy != c['y']]
        new = r if (a >= FULL or not ref) else round((a / FULL) * r + (1 - a / FULL) * sum(ref) / len(ref))
        new = max(45, min(99, new))
        if new != p[2]: changed += 1
        p[2] = new
json.dump(pool, open(POOL, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('карточек изменено:', changed)
