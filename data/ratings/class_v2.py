"""Ratings v2 (docs/ratings_v2.md): formula C + manual peaks + Chornomorets 2011-2013 bonus.
Run from repo root: python3 data/ratings/class_v2.py   (then python3 data/update_meta.py && python3 data/check_pool.py,
python3 src/build.py && node tools/make_engine.js). Prints a report: k, number of people 90+/95+, who is 90+.

Always computes from source ratings (data/ratings/pool_ratings_raw.json -> smooth_cameo.smoothed()), so it is idempotent
and order-independent with other scripts: smooth_cameo.final() = this step after smoothing (fix scripts use it too).

Steps per card (S = rating after cameo smoothing and TOP_PTS compression):
1. Formula C (data/class/proposal.md): S >= 70 -> s = S if S <= 82, else 82 + (S - 82)*0.4 (top compression for everyone),
   R = min(99, round(s + K*C^2*Q*G)), where Q = season quality clamp((raw - 80)/12, 0, 1) from the source rating,
   G = age factor: 1 up to AGE_FULL (goalkeepers + GK_EXTRA), then -AGE_STEP per year (age on 1 Sep of the season); C is the person's class (0..1) from data/class/class.csv; S < 70 -> R = S.
   Class C = weighted mean: national team 25% (senior caps, 120 = 1), European cups 25% (club European apps, 150 = 1),
   money 20% (max of TM peak market value and top transfer fee: EUR 1M = 0, EUR 60M = 1, log scale),
   awards 30% (points, 20 = 1: Ballon d'Or 1-3 = 6, 4-10 = 4, 11-30 = 2; Ukrainian Footballer of the Year 1st = 3, 2nd-3rd = 1.5;
   Komanda 1st = 2, 2nd-3rd = 1; UPL top scorer = 1.5; UEFA Team of the Year = 2). For 90s veterans (born <= 1977) money can
   only raise the class (TM has no values before ~2004). No class.csv row or no TM id -> class 0.
   Person = canonical id (pool['alias']): class and peak are computed over all their ids.
   K is calibrated (proposal.py, calibrate) so that ~15 people are 90+ before manual peaks.
2. Manual peaks (data/ratings/anchors_v2.csv): the person's best card = the peak, all their other cards shift by the same delta.
3. Deliberate bonus (DECISIONS): +3 to all Chornomorets cards for y 2011-2013;
   a person with a manual peak is capped at that peak.
4. Clamp to 45-99.
"""
import csv, json, math, os, re, sys

D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(D, '..', '..')
POOL = os.path.join(ROOT, 'src', 'pool.json')
RAW = os.path.join(D, 'pool_ratings_raw.json')
CLASS = os.path.join(ROOT, 'data', 'class', 'class.csv')
ANCHORS = os.path.join(D, 'anchors_v2.csv')
sys.path.insert(0, D)
import smooth_cameo as SC

Q_LO, Q_SPAN = 80, 12      # class bonus only for strong seasons: Q = (raw - Q_LO) / Q_SPAN, clamped 0..1
AGE_FULL, AGE_STEP, GK_EXTRA = 30, 0.2, 3
K = 10.5                     # class bonus K*C^2 (proposal.py -> calibrate(): ~15 people 90+ before manual peaks)
KNEE, SLOPE, FLOOR = 82, 0.4, 70
SAILORS = ('chornomorets-odesa', (2011, 2012, 2013), 3)
W = {'intl': .25, 'euro': .25, 'money': .20, 'awards': .30}


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def award_points(s):
    pts = 0.0
    for a in [x.strip() for x in (s or '').split(';') if x.strip()]:
        m = re.search(r'#(\d+)', a)
        k = int(m.group(1)) if m else 0
        if a.startswith("Ballon"):
            pts += 6 if k <= 3 else 4 if k <= 10 else 2
        elif a.startswith('UF '):
            pts += 3 if k == 1 else 1.5
        elif a.startswith('Komanda'):
            pts += 2 if k == 1 else 1
        elif a.startswith('UPL top scorer'):
            pts += 1.5
        elif a.startswith('UEFA Team'):
            pts += 2
    return pts


def class_score(r):
    """class.csv row -> (C 0..1, components)"""
    parts, w = {}, dict(W)
    parts['intl'] = min(num(r['caps']) or 0, 120) / 120
    parts['euro'] = min(num(r['euro_apps']) or 0, 150) / 150
    mv = max(num(r['peak_mv_eur']) or 0, num(r['max_fee_eur']) or 0)
    dob = r['dob'] or (r['person_id'].split(':')[1] if r['person_id'].startswith('w:') else '')
    parts['money'] = max(0.0, min(1.0, math.log(mv / 1e6) / math.log(60))) if mv > 0 else 0.0
    veteran = dob[:4].isdigit() and int(dob[:4]) <= 1977
    parts['awards'] = min(1.0, award_points(r['awards']) / 20)
    full = sum(parts[k] * v for k, v in w.items())
    if veteran:   # TM values exist only from ~2004: for 90s veterans money may raise the class but never lower it
        w.pop('money')
        no_money = sum(parts[k] * v for k, v in w.items()) / sum(w.values())
        return max(full, no_money), parts
    return full, parts


def load_class(alias):
    out = {}
    for r in csv.DictReader(open(CLASS, encoding='utf-8', newline='')):
        if not r['tm_id']:
            continue   # no data: class 0
        p = alias.get(r['person_id'], r['person_id'])
        out[p] = max(out.get(p, 0.0), class_score(r)[0])
    return out


def load_dob(alias):
    out = {}
    for r in csv.DictReader(open(CLASS, encoding='utf-8', newline='')):
        d = r['dob'] or (r['person_id'].split(':')[1] if r['person_id'].startswith('w:') else '')
        if re.match(r'\d{4}-\d{2}-\d{2}$', d[:10]): out[alias.get(r['person_id'], r['person_id'])] = d[:10]
    return out


def age_on(dob, year, birth_year):
    """age on 1 Sep of season start; falls back to the card's birth year"""
    if dob:
        y, m, d = map(int, dob.split('-'))
        return year - y - (1 if (m, d) > (9, 1) else 0)
    return year - birth_year if birth_year else AGE_FULL


def bonus_factor(raw, age, gk):
    q = max(0.0, min(1.0, (raw - Q_LO) / Q_SPAN))
    g = max(0.0, min(1.0, 1 - AGE_STEP * (age - AGE_FULL - (GK_EXTRA if gk else 0))))
    return q * g


def load_anchors():
    return {r['person_id']: int(r['peak']) for r in csv.DictReader(open(ANCHORS, encoding='utf-8', newline=''))}


def formula_c(S, c, k=K, f=1.0):
    if S < FLOOR:
        return S
    s = S if S <= KNEE else KNEE + (S - KNEE) * SLOPE
    return min(99, round(s + k * c * c * f))


def apply_v2(pool, sm, k=K, anchors=True):
    """{card key: smoothed rating} -> {key: v2 rating}; anchors=False applies formula C only (calibration and report)"""
    alias = pool.get('alias') or {}
    canon = lambda i: alias.get(i, i)
    C, B = load_class(alias), load_dob(alias)
    raw = json.load(open(RAW, encoding='utf-8'))
    live = SC.live_years(pool)
    cards = [(SC.key(c, i), c, p) for c in pool['clubs'] if c['y'] not in live for i, p in enumerate(c['pl'])]
    out = {key: formula_c(sm[key], C.get(canon(p[5]), 0.0), k,
                          bonus_factor(raw[key], age_on(B.get(canon(p[5])), c['y'], p[11]), p[1] == 'GK'))
           for key, c, p in cards}
    if anchors:
        A = load_anchors()
        best = {}
        for key, c, p in cards:
            if canon(p[5]) in A: best[canon(p[5])] = max(best.get(canon(p[5]), 0), out[key])
        assert set(best) == set(A), f'піків без карток: {set(A) - set(best)}'
        club, years, bonus = SAILORS
        for key, c, p in cards:
            pid = canon(p[5])
            if pid in A:
                out[key] += A[pid] - best[pid]
            if c['c'] == club and c['y'] in years:
                out[key] += bonus
                if pid in A: out[key] = min(out[key], A[pid])   # bonus card of a person with a manual peak: capped at the peak
            out[key] = max(45, min(99, out[key]))
    out.update((SC.key(c, i), p[2]) for c in pool['clubs'] if c['y'] in live for i, p in enumerate(c['pl']))   # live cards: final already
    return out


def rated(pool, raw):
    return apply_v2(pool, SC.smoothed(pool, raw))


def persons_at(pool, r, lo):
    alias = pool.get('alias') or {}
    best = {}
    for c in pool['clubs']:
        for i, p in enumerate(c['pl']):
            pid = alias.get(p[5], p[5]); v = r[SC.key(c, i)]
            if v > best.get(pid, (0,))[0]: best[pid] = (v, p[0], c['n'], c['y'])
    return sorted(((v, n, cl, y, pid) for pid, (v, n, cl, y) in best.items() if v >= lo), key=lambda x: (-x[0], x[1]))


def calibrate(pool, sm, target=15):
    """k from the same grid as proposal.py (0.5 step): ~target people 90+ with formula C only"""
    grid = [x / 2 for x in range(6, 41)]
    return min(grid, key=lambda k: (abs(len(persons_at(pool, apply_v2(pool, sm, k, anchors=False), 90)) - target), -k))


def main():
    pool = json.load(open(POOL, encoding='utf-8'))
    raw = json.load(open(RAW, encoding='utf-8'))
    sm = SC.smoothed(pool, raw)
    new = apply_v2(pool, sm)
    changed = 0
    for c in pool['clubs']:
        for i, p in enumerate(c['pl']):
            if new[SC.key(c, i)] != p[2]: changed += 1
            p[2] = new[SC.key(c, i)]
    txt = json.dumps(pool, ensure_ascii=False, separators=(',', ':'))
    if txt != open(POOL, encoding='utf-8').read(): open(POOL, 'w', encoding='utf-8').write(txt)
    onlyC = apply_v2(pool, sm, anchors=False)
    print(f'K = {K} (calibrate → {calibrate(pool, sm)}); карток змінено зараз: {changed}')
    print('лише формула C: 90+ людей', len(persons_at(pool, onlyC, 90)), '| 95+', len(persons_at(pool, onlyC, 95)))
    for lo in (90, 95):
        top = persons_at(pool, new, lo)
        print(f'підсумок {lo}+: {len(top)} людей, карток {sum(1 for v in new.values() if v >= lo)}')
    A = load_anchors()
    for v, n, cl, y, pid in persons_at(pool, new, 88):
        print(f'  {v} {n} — {cl} {y}' + (' (пік власника)' if pid in A else ''))


if __name__ == '__main__':
    main()
