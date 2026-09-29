"""Рейтинги сезону 2021/22 тією самою формулою, що й етап 4 (data/build_stage4.py, розділ «4. Признаки и рейтинг»).

Запуск з кореня репозиторію:
  python3 data/fix_2021/recompute_2021.py      — перевірка: перерахувати ВСІ картки 2021 і порівняти з
                                                 data/ratings/pool_ratings_raw.json (нічого не записує)
Як модуль: compute(pool) -> {(club, index_in_club): рейтинг з 1 знаком} — використовує fix_pool_2021.py.

Що береться (як і в етапі 4 для 2021/22):
  - картка: лінія p[1], матчі p[3], голи p[4]. Асистів і сухих у етапі 4 для 2021 не було (усі NaN) —
    тому й тут вони НЕ враховуються, інакше нові картки рахувалися б інакше, ніж решта сезону;
  - команда: місце (team_rank_pct), голи за/проти за матч = att/def × base з pool.seasons['2021'];
    ігор у клубу — data/data/standings.csv (18, у Руху й Інгульця 17 — чемпіонат зупинено після 18 турів);
  - пропущені воротаря: stage4 брав їх із ru-Вікіпедії; тут — стовпець «Проп» sports.ru
    (data/research_assists/sportsru_2021_clubs.json), воротар без збігу → пропущені команди за матч (як у етапі 4).
Шкала: перцентиль у (сезон, лінія) → N(72, 10), розтяг малих груп до 150, межі 45–99, менше 8 матчів → до 50.
Після етапу 4: round → stretch_top.py (лише 90+) → pool_ratings_raw.json → smooth_cameo.py.
"""
import csv, json, math, os, sys
from statistics import NormalDist

D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(D, '..', '..')
POOL = os.path.join(ROOT, 'src', 'pool.json')
RAW = os.path.join(ROOT, 'data', 'ratings', 'pool_ratings_raw.json')
STAND = os.path.join(ROOT, 'data', 'data', 'standings.csv')
SPORTS = os.path.join(ROOT, 'data', 'research_assists', 'sportsru_2021_clubs.json')
NAMES = os.path.join(ROOT, 'data', 'names', 'names_master.csv')
Y = 2021

K_SHRINK, FULL_SAMPLE_APPS = 6, 8
RATING_MID, RATING_SD, RATING_MIN, RATING_MAX, RATING_REPLACEMENT, RATING_REF_GROUP = 72, 10, 45, 99, 50, 150
WEIGHTS = {
    "FW": {"gpg_adj": 0.40, "goals_tot": 0.20, "apg_adj": 0.15, "share": 0.10, "team": 0.15},
    "MF": {"gapg_adj": 0.30, "ga_tot": 0.20, "share": 0.25, "team": 0.25},
    "DF": {"share": 0.35, "team_def": 0.25, "team": 0.20, "ga_tot": 0.10, "cs_rate": 0.10},
    "GK": {"cpg_adj_neg": 0.40, "share": 0.30, "cs_rate": 0.15, "team": 0.15},
}
ND = NormalDist()


def zscore(xs):
    v = [x for x in xs if x is not None]
    if not v: return [None] * len(xs)
    m = sum(v) / len(v); sd = math.sqrt(sum((x - m) ** 2 for x in v) / len(v))
    if not math.isfinite(sd) or sd < 1e-9: return [0.0] * len(xs)
    return [None if x is None else (x - m) / sd for x in xs]


def shrunk(num, den, mask):
    sn = sum(n for n, m in zip(num, mask) if m and n is not None); sd = sum(d for d, m in zip(den, mask) if m)
    mu = sn / max(sd, 1.0) if any(mask) else 0.0
    return [((n or 0) + K_SHRINK * mu) / (d + K_SHRINK) for n, d in zip(num, den)]


def avg_rank(vals):
    order = sorted(range(len(vals)), key=lambda i: vals[i]); r = [0.0] * len(vals); i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]: j += 1
        for k in range(i, j + 1): r[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return r


def team_table(pool):
    s = pool['seasons'][str(Y)]; base = s['base']; n = len(s['teams'])
    games = {r['canonical_id']: float(r['games']) for r in csv.DictReader(open(STAND, encoding='utf-8')) if r['season'] == str(Y)}
    T = {}
    for code, _, place, att, dfn in s['teams']:
        T[code] = dict(rank_pct=(n - place) / (n - 1), ga_pg=dfn * base, gd_pg=(att - dfn) * base, games=games[code])
    return T


def gk_conceded(pool):
    """(club, person_id) -> пропущені за sports.ru (зіставлення воротарів у клубі за іменем і матчами)."""
    sys.path.insert(0, os.path.join(ROOT, 'data', 'research_assists'))
    from sportsru_2021 import lat, nsim
    S = json.load(open(SPORTS, encoding='utf-8'))
    nm = {r['person_id']: r for r in csv.DictReader(open(NAMES, encoding='utf-8'))}
    out = {}
    for c in pool['clubs']:
        if c['y'] != Y or c['c'] not in S: continue
        site = [g for g in S[c['c']]['gk'] if g.get('Проп', '').isdigit()]
        cand = []
        for p in c['pl']:
            if p[1] != 'GK': continue
            m = nm.get(p[5], {})
            ks = [lat(x) for x in [p[0], m.get('name_ru'), m.get('name_en')] if x]
            for j, g in enumerate(site):
                sim = max(nsim(lat(g['Игрок']), k) for k in ks)
                cand.append((sim + (0.15 if str(p[3]) == g['М'] else 0), sim, p[5], j))
        cand.sort(reverse=True); used_p, used_s = set(), set()
        for sc, sim, pid, j in cand:
            if pid in used_p or j in used_s or sim < 0.6: continue
            used_p.add(pid); used_s.add(j); out[(c['c'], pid)] = int(site[j]['Проп'])
    return out


def compute(pool, use_assists=False):
    T = team_table(pool); conc = gk_conceded(pool)
    rows = []
    for c in pool['clubs']:
        if c['y'] != Y: continue
        t = T[c['c']]
        for i, p in enumerate(c['pl']):
            apps = float(p[3] or 0)
            rows.append(dict(key=(c['c'], i), pg=p[1], apps=apps, goals=float(p[4] or 0),
                             ast=(float(p[8]) if use_assists and p[8] is not None else None),
                             conc=conc.get((c['c'], p[5])) if p[1] == 'GK' else None,
                             share=min(apps / t['games'], 1.0), **t))
    raw = {}
    for pg, W in WEIGHTS.items():
        g = [r for r in rows if r['pg'] == pg]
        if not g: continue
        den = [r['apps'] for r in g]
        F = {'share': [r['share'] for r in g]}
        zr = zscore([r['rank_pct'] for r in g]); zg = zscore([r['gd_pg'] for r in g])
        F['team'] = [0.5 * a + 0.5 * b for a, b in zip(zr, zg)]
        F['team_def'] = zscore([-r['ga_pg'] for r in g])
        gs = [r['goals'] + (r['ast'] or 0) for r in g]
        F['goals_tot'] = [r['goals'] for r in g]; F['ga_tot'] = gs
        F['gpg_adj'] = shrunk([r['goals'] for r in g], den, [True] * len(g))
        F['gapg_adj'] = shrunk(gs, den, [True] * len(g))
        has = [r['ast'] is not None for r in g]
        F['apg_adj'] = [v if h else None for v, h in zip(shrunk([r['ast'] for r in g], den, has), has)] if any(has) else [None] * len(g)
        F['cs_rate'] = [None] * len(g)   # сухих у етапі 4 для 2021 не було
        if pg == 'GK':
            hc = [r['conc'] is not None for r in g]
            cp = shrunk([r['conc'] for r in g], den, hc) if any(hc) else [None] * len(g)
            F['cpg_adj_neg'] = [-(v if h else r['ga_pg']) for v, h, r in zip(cp, hc, g)]
        Z = {k: zscore(F[k]) for k in W}
        for n, r in enumerate(g):
            num = sum(Z[k][n] * w for k, w in W.items() if Z[k][n] is not None)
            dn = sum(w for k, w in W.items() if Z[k][n] is not None)
            raw[r['key']] = num / dn if dn else None
        # перцентиль → шкала
        vals = [raw[r['key']] for r in g]; rk = avg_rank(vals)
        zp = [ND.inv_cdf(min(max((x - 0.5) / len(g), 1e-4), 1 - 1e-4)) for x in rk]
        z_ref = ND.inv_cdf((RATING_REF_GROUP - 0.5) / RATING_REF_GROUP); zmax = max(zp)
        for n, r in enumerate(g):
            za = zp[n] * (z_ref / zmax if zmax > 0 else 1.0)
            full = min(max(RATING_MID + RATING_SD * za, RATING_MIN), RATING_MAX)
            w = min(r['apps'] / FULL_SAMPLE_APPS, 1.0)
            r['rating'] = round(min(max(RATING_REPLACEMENT + (full - RATING_REPLACEMENT) * w, RATING_MIN), RATING_MAX), 1)
    return {r['key']: r['rating'] for r in rows}


def validate(pool, raw, skip=()):
    rt = compute(pool)
    pairs = [(round(v), raw[f"{Y}|{c}|{i}"]) for (c, i), v in rt.items() if (c, i) not in skip]
    def stats(ps):
        a = [x for x, _ in ps]; b = [y for _, y in ps]; n = len(ps)
        ma, mb = sum(a) / n, sum(b) / n
        cov = sum((x - ma) * (y - mb) for x, y in ps); va = sum((x - ma) ** 2 for x in a); vb = sum((y - mb) ** 2 for y in b)
        return dict(n=n, corr=round(cov / math.sqrt(va * vb), 4), mae=round(sum(abs(x - y) for x, y in ps) / n, 3),
                    exact=round(sum(x == y for x, y in ps) / n, 3), within1=round(sum(abs(x - y) <= 1 for x, y in ps) / n, 3),
                    maxdiff=max(abs(x - y) for x, y in ps))
    below = [(x, y) for x, y in pairs if y < 90 and x < 90]   # 90+ переставлені stretch_top.py за квотами всієї бази
    return stats(pairs), stats(below), rt


if __name__ == '__main__':
    pool = json.load(open(POOL, encoding='utf-8')); raw = json.load(open(RAW, encoding='utf-8'))
    allc, below, rt = validate(pool, raw)
    print('усі картки 2021:        ', allc)
    print('без 90+ (stretch_top):  ', below)
    worst = sorted(((abs(round(v) - raw[f"{Y}|{c}|{i}"]), c, i, v, raw[f"{Y}|{c}|{i}"]) for (c, i), v in rt.items()), reverse=True)[:12]
    cl = {c['c']: c for c in pool['clubs'] if c['y'] == Y}
    for d, c, i, v, r in worst: print(f'  {d:>2}  {c:<20} {cl[c]["pl"][i][0]:<24} {cl[c]["pl"][i][1]} apps={cl[c]["pl"][i][3]:<3} перерах.={v:<5} raw={r}')
