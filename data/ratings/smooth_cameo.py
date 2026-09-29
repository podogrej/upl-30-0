"""Сглаживание «камео-сезонов» (0.46) и сжатие верха шкалы (0.50, TOP_PTS): мало матчей → рейтинг тянется к полным сезонам игрока рядом.
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
# 0.50 (рішення власника 29.09.2026, відгук Віті «90+ занадто часто»): стиснути верх шкали — 90+ лише ~1% карток (було 4,2%).
# Кусково-лінійно, спільно для всіх ліній; до 80 нічого не змінюється. Останній крок, тож повторний запуск нічого не псує.
TOP_PTS = [(45, 45), (80, 80), (94, 90), (96, 93), (97, 95), (98, 97), (99, 99)]
def top_map(r):
    for (a, b), (c, d) in zip(TOP_PTS, TOP_PTS[1:]):
        if a <= r <= c: return round(b + (r - a) * (d - b) / (c - a))
    return r
changed = 0
for c in pool['clubs']:
    for i, p in enumerate(c['pl']):
        r, a = raw[key(c, i)], p[3] or 0
        ref = [fr for fy, fa, fr in per[p[5]] if fa >= MIN_REF_APPS and abs(fy - c['y']) <= WINDOW and fy != c['y']]
        new = r if (a >= FULL or not ref) else round((a / FULL) * r + (1 - a / FULL) * sum(ref) / len(ref))
        new = top_map(max(45, min(99, new)))
        if new != p[2]: changed += 1
        p[2] = new
json.dump(pool, open(POOL, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('карточек изменено:', changed)
