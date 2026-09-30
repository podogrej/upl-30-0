"""Сглаживание «камео-сезонов» (0.46) и сжатие верха шкалы (0.50, TOP_PTS): мало матчей → рейтинг тянется к полным сезонам игрока рядом.
Запуск из корня: python3 data/ratings/smooth_cameo.py  (потом python3 src/build.py && node tools/make_engine.js)
Считает всегда от исходных рейтингов (data/ratings/pool_ratings_raw.json — создаётся при первом запуске), поэтому повторный запуск ничего не портит.
Правило: если матчей < FULL и у того же человека есть сезоны с 10+ матчами в пределах ±2 лет (кроме этого),
  рейтинг = w·свой + (1−w)·среднее тех сезонов, w = матчи / FULL.
«Тот же человек» — с 0.57 тот же canonical id (псевдонимы pool['alias'], data/aliases): у дублей камео тянется и к сезонам под другим id
(до 0.57 — только тот же person_id карточки).
Как модуль: smoothed(pool, raw) → {ключ «год|клуб|индекс»: рейтинг после сглаживания}; final(pool, raw) — итоговый рейтинг карточки
(с 0.57: сглаживание → рейтинги v2, data/ratings/class_v2.py). final() пишет main() и им пользуются data/fix_2021/fix_pool_2021.py,
data/fixes/fix_pool_054.py и fix_pool_057.py, чтобы не держать копию формулы.
"""
import json, os
from collections import defaultdict
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
POOL = os.path.join(ROOT, 'src', 'pool.json'); RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pool_ratings_raw.json')
FULL, MIN_REF_APPS, WINDOW = 15, 10, 2
# 0.50 (рішення власника 29.09.2026, відгук Віті «90+ занадто часто»): стиснути верх шкали — 90+ лише ~1% карток (було 4,2%).
# Кусково-лінійно, спільно для всіх ліній; до 80 нічого не змінюється. Останній крок, тож повторний запуск нічого не псує.
TOP_PTS = [(45, 45), (80, 80), (94, 90), (96, 93), (97, 95), (98, 97), (99, 99)]


def key(c, i):
    return f"{c['y']}|{c['c']}|{i}"


def top_map(r):
    for (a, b), (c, d) in zip(TOP_PTS, TOP_PTS[1:]):
        if a <= r <= c: return round(b + (r - a) * (d - b) / (c - a))
    return r


def smoothed(pool, raw):
    """итоговый рейтинг каждой карточки из исходных (raw) — без записи в пул"""
    alias = pool.get('alias') or {}
    canon = lambda pid: alias.get(pid, pid)
    per = defaultdict(list)
    for c in pool['clubs']:
        for i, p in enumerate(c['pl']): per[canon(p[5])].append((c['y'], p[3] or 0, raw[key(c, i)]))
    out = {}
    for c in pool['clubs']:
        for i, p in enumerate(c['pl']):
            r, a = raw[key(c, i)], p[3] or 0
            ref = [fr for fy, fa, fr in per[canon(p[5])] if fa >= MIN_REF_APPS and abs(fy - c['y']) <= WINDOW and fy != c['y']]
            new = r if (a >= FULL or not ref) else round((a / FULL) * r + (1 - a / FULL) * sum(ref) / len(ref))
            out[key(c, i)] = top_map(max(45, min(99, new)))
    return out


def final(pool, raw):
    """итоговый рейтинг каждой карточки — то, что лежит в pool.json (без записи)"""
    return smoothed(pool, raw)


def main():
    pool = json.load(open(POOL, encoding='utf-8'))
    if not os.path.exists(RAW):
        json.dump({key(c, i): p[2] for c in pool['clubs'] for i, p in enumerate(c['pl'])}, open(RAW, 'w', encoding='utf-8'), separators=(',', ':'))
    raw = json.load(open(RAW, encoding='utf-8'))
    new = final(pool, raw)
    changed = 0
    for c in pool['clubs']:
        for i, p in enumerate(c['pl']):
            if new[key(c, i)] != p[2]: changed += 1
            p[2] = new[key(c, i)]
    json.dump(pool, open(POOL, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('карточек изменено:', changed)


if __name__ == '__main__':
    main()
