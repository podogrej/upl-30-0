"""Рейтинги v2 (0.57, пакет затверджено власником 30.09.2026 — docs/ratings_v2.md): формула C + ручні піки власника + «Моряки Григорчука».
Запуск з кореня репозиторію: python3 data/ratings/class_v2.py   (потім python3 data/update_meta.py && python3 data/check_pool.py,
python3 src/build.py && node tools/make_engine.js). Друкує звіт: k, скільки людей 90+/95+, хто 90+.

Рахує завжди від вихідних рейтингів (data/ratings/pool_ratings_raw.json → smooth_cameo.smoothed()), тому повторний запуск нічого не змінює
і порядок запуску з іншими скриптами не важливий: smooth_cameo.final() = цей крок після згладжування (так пишуть і fix-скрипти).

Кроки для кожної картки (S — рейтинг після згладжування камео і стиснення TOP_PTS, як до 0.57):
1. Формула C (data/class/proposal.md): S ≥ 70 → s = S, якщо S ≤ 82, інакше 82 + (S − 82)·0.4 (стиснення верху для всіх),
   R = min(99, round(s + K·C²)), де C — клас людини (0…1) з data/class/class.csv; S < 70 → R = S.
   Клас C = зважене середнє: збірна 25% (матчі за дорослу збірну, 120 = 1), єврокубки 25% (матчі клубних єврокубків, 150 = 1),
   гроші 20% (більше з піку ринкової вартості TM і найдорожчого трансферу: €1 млн = 0, €60 млн = 1, логарифм),
   нагороди 30% (бали, 20 = 1: Золотий м'яч 1–3 — 6, 4–10 — 4, 11–30 — 2; «Український футбол» 1-е — 3, 2–3-є — 1.5;
   «Команда» 1-е — 2, 2–3-є — 1; бомбардир УПЛ — 1.5; команда року UEFA — 2). Ветеранам 90-х (нар. ≤ 1977) «гроші» можуть
   лише підняти клас (у TM немає вартостей до ~2004). Людина без рядка в class.csv або без TM — клас 0.
   Людина — canonical id (pool['alias']): клас і пік рахуються за всіма її id.
   K підібрано (proposal.py, calibrate) так, щоб до ручних піків 90+ мали ~15 людей.
2. Ручні піки (data/ratings/anchors_v2.csv): найкраща картка людини = пік власника, усі інші її картки зсуваються на ту саму різницю.
3. «Моряки Григорчука» (свідомий бонус власника, DECISIONS): +3 усім карткам «Чорноморця» 2011/12–2013/14 (y 2011–2013);
   у людини з ручним піком (Шацьких, Чорноморець 2013) — не вище за її пік.
4. Межі 45–99.
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

K = 10.5                     # бонус класу K·C² (proposal.py → calibrate(): ~15 людей 90+ до ручних піків)
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
    """рядок class.csv → (C 0…1, складові)"""
    parts, w = {}, dict(W)
    parts['intl'] = min(num(r['caps']) or 0, 120) / 120
    parts['euro'] = min(num(r['euro_apps']) or 0, 150) / 150
    mv = max(num(r['peak_mv_eur']) or 0, num(r['max_fee_eur']) or 0)
    dob = r['dob'] or (r['person_id'].split(':')[1] if r['person_id'].startswith('w:') else '')
    parts['money'] = max(0.0, min(1.0, math.log(mv / 1e6) / math.log(60))) if mv > 0 else 0.0
    veteran = dob[:4].isdigit() and int(dob[:4]) <= 1977
    parts['awards'] = min(1.0, award_points(r['awards']) / 20)
    full = sum(parts[k] * v for k, v in w.items())
    if veteran:   # вартості TM є лише з ~2004: ветерану 90-х «гроші» можуть лише додати, але не зменшити клас
        w.pop('money')
        no_money = sum(parts[k] * v for k, v in w.items()) / sum(w.values())
        return max(full, no_money), parts
    return full, parts


def load_class(alias):
    out = {}
    for r in csv.DictReader(open(CLASS, encoding='utf-8', newline='')):
        if not r['tm_id']:
            continue   # немає даних — клас 0
        p = alias.get(r['person_id'], r['person_id'])
        out[p] = max(out.get(p, 0.0), class_score(r)[0])
    return out


def load_anchors():
    return {r['person_id']: int(r['peak']) for r in csv.DictReader(open(ANCHORS, encoding='utf-8', newline=''))}


def formula_c(S, c, k=K):
    if S < FLOOR:
        return S
    s = S if S <= KNEE else KNEE + (S - KNEE) * SLOPE
    return min(99, round(s + k * c * c))


def apply_v2(pool, sm, k=K, anchors=True):
    """{ключ картки: рейтинг після згладжування} → {ключ: рейтинг v2}; anchors=False — лише формула C (для калібрування й звіту)"""
    alias = pool.get('alias') or {}
    canon = lambda i: alias.get(i, i)
    C = load_class(alias)
    cards = [(SC.key(c, i), c, p) for c in pool['clubs'] for i, p in enumerate(c['pl'])]
    out = {key: formula_c(sm[key], C.get(canon(p[5]), 0.0), k) for key, c, p in cards}
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
                if pid in A: out[key] = min(out[key], A[pid])   # «моряк» з ручним піком (Шацьких 2013) — не вище за пік
            out[key] = max(45, min(99, out[key]))
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
    """k з тієї ж сітки, що proposal.py (0.5 крок): ~target людей 90+ лише за формулою C"""
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
