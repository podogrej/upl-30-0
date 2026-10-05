"""Cameo-season smoothing and top-of-scale compression (TOP_PTS): few apps -> rating pulled toward the player's nearby full seasons.
Run from repo root: python3 data/ratings/smooth_cameo.py  (then python3 src/build.py && node tools/make_engine.js)
Always computes from source ratings (data/ratings/pool_ratings_raw.json, created on first run), so it is idempotent.
Rule: if apps < FULL and the same person has other seasons with 10+ apps within +-2 years,
  rating = w*own + (1-w)*mean of those seasons, w = apps / FULL.
"Same person" means the same canonical id (aliases in pool['alias'], data/aliases), so duplicates also pull toward seasons under the other id.
As a module: smoothed(pool, raw) -> {"year|club|index": smoothed rating}; final(pool, raw) -> final card rating
(smoothing -> ratings v2, data/ratings/class_v2.py). main() writes final(); data/fix_2021/fix_pool_2021.py,
data/fixes/fix_pool_054.py and fix_pool_057.py import it to avoid copying the formula.
"""
import json, os
from collections import defaultdict
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
POOL = os.path.join(ROOT, 'src', 'pool.json'); RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pool_ratings_raw.json')
FULL, MIN_REF_APPS, WINDOW = 15, 10, 2
# Compress the top of the scale so only ~1% of cards are 90+ (was 4.2%).
# Piecewise linear, shared by all lines; nothing changes below 80. Applied last, so reruns are safe.
TOP_PTS = [(45, 45), (80, 80), (94, 90), (96, 93), (97, 95), (98, 97), (99, 99)]


def key(c, i):
    return f"{c['y']}|{c['c']}|{i}"


def top_map(r):
    for (a, b), (c, d) in zip(TOP_PTS, TOP_PTS[1:]):
        if a <= r <= c: return round(b + (r - a) * (d - b) / (c - a))
    return r


def smoothed(pool, raw):
    """smoothed rating of every card from raw ratings; does not write the pool"""
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
    """final rating of every card as stored in pool.json (no write): smoothing -> ratings v2"""
    import class_v2   # sibling data/ratings/class_v2.py; imported lazily because class_v2 imports this module
    return class_v2.apply_v2(pool, smoothed(pool, raw))


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
