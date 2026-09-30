"""Аналіз для рейтингів v2: «клас» гравця з data/class/class.csv і три варіанти змішування з сезонним рейтингом.
Нічого в грі не змінює. Запуск з кореня: python3 data/class/proposal.py  → друкує таблиці для data/class/proposal.md
і пише data/class/class_score.csv (person_id, name, клас і складові).

Клас C (0…1) = зважене середнє складових (кожна 0…1):
  збірна   0.30 · sqrt(min(caps, 100) / 100)                     — основна збірна, будь-яка країна
  єврокубки 0.25 · sqrt(min(euro_apps, 100) / 100)               — матчі клубних єврокубків у базі TM
  гроші    0.20 · log(max(пік вартості, найбільший трансфер) / €0.5 млн) / log(€50 млн / €0.5 млн), 0…1
  нагороди 0.25 · min(1, бали / 12)                               — бали нижче
Бали: Золотий м'яч — місце 1–3: 6, 4–10: 4, 11–30: 2 (за кожен рік); «Український футбол» (УФ) 1-е місце 3, 2–3-є 1.5;
«Команда»/«Команда1» 1-е місце 2, 2–3-є 1; найкращий бомбардир УПЛ 1.5; команда року UEFA (опитування) 2.
Гроші: у Transfermarkt ринкові вартості є лише приблизно з 2004 року. Якщо кар'єра людини закінчилась раніше
(народився ≤ 1977 і вартості немає) — складова «гроші» не рахується, вага ділиться між іншими.
"""
import csv, json, math, collections, re

pool = json.load(open('src/pool.json'))
cards = collections.defaultdict(list)
for c in pool['clubs']:
    for x in c['pl']:
        cards[x[5]].append((x[2], c['y'], c['n'], x[0], x[3]))
rows = {r['person_id']: r for r in csv.DictReader(open('data/class/class.csv'))}


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
    parts, w = {}, {'intl': .30, 'euro': .25, 'money': .20, 'awards': .25}
    caps, euro = num(r['caps']), num(r['euro_apps'])
    parts['intl'] = math.sqrt(min(caps or 0, 100) / 100)
    parts['euro'] = math.sqrt(min(euro or 0, 100) / 100)
    mv = max(num(r['peak_mv_eur']) or 0, num(r['max_fee_eur']) or 0)
    dob = r['dob'] or (r['person_id'].split(':')[1] if r['person_id'].startswith('w:') else '')
    if mv > 0:
        parts['money'] = max(0.0, min(1.0, math.log(mv / 5e5) / math.log(100)))
    elif dob[:4].isdigit() and int(dob[:4]) <= 1977:
        w = {k: v for k, v in w.items() if k != 'money'}      # немає даних про вартість — не штрафуємо ветеранів 90-х
    else:
        parts['money'] = 0.0
    parts['awards'] = min(1.0, award_points(r['awards']) / 12)
    tot = sum(w.values())
    return sum(parts.get(k, 0) * v for k, v in w.items()) / tot, parts


C, PARTS = {}, {}
for pid, r in rows.items():
    if not r['tm_id']:
        continue    # без даних клас невідомий → 0 (див. README: такі люди позначені)
    C[pid], PARTS[pid] = class_score(r)


def var_a(S, c):   # стеля від класу
    return min(S, round(86 + 13 * c))


def var_b(S, c):   # верхня зона стискається тим сильніше, чим нижчий клас
    return S if S <= 80 else round(80 + (S - 80) * (0.45 + 0.55 * c))


def var_c(S, c):   # стиснення верху для всіх + бонус класу до всіх карток людини
    s = S if S <= 84 else 84 + (S - 84) * 0.5
    return min(99, round(s + 9 * c * c)) if S >= 70 else S


VARS = {'A': var_a, 'B': var_b, 'C': var_c}


def best(pid, f):
    c = C.get(pid, 0.0)
    return max(f(S, c) for S, *_ in cards[pid])


def counts():
    out = {}
    for k, f in VARS.items():
        vals = [best(p, f) for p in cards]
        out[k] = (sum(v >= 90 for v in vals), sum(v >= 95 for v in vals))
    cur = [max(S for S, *_ in cards[p]) for p in cards]
    out['now'] = (sum(v >= 90 for v in cur), sum(v >= 95 for v in cur))
    return out


if __name__ == '__main__':
    with open('data/class/class_score.csv', 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['person_id', 'name', 'max_rating', 'class', 'intl', 'euro', 'money', 'awards'])
        for p in sorted(C, key=lambda p: -C[p]):
            pt = PARTS[p]
            w.writerow([p, rows[p]['name'], rows[p]['max_rating'], f'{C[p]:.3f}'] + [('%.2f' % pt[k]) if k in pt else '' for k in ('intl', 'euro', 'money', 'awards')])
    print('counts (90+, 95+ осіб):', counts())
    print('\nтоп-40 за класом')
    for p in sorted(C, key=lambda p: -C[p])[:40]:
        print(f'{rows[p]["name"]:28s} C={C[p]:.2f} max={rows[p]["max_rating"]}', {k: round(v, 2) for k, v in PARTS[p].items()})
    for k, f in VARS.items():
        top = sorted(cards, key=lambda p: -best(p, f))
        print(f'\n{k}: 90+ →', ', '.join(f'{cards[p][0][3]} {best(p, f)}' for p in top if best(p, f) >= 90))
