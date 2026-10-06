"""Analysis for ratings v2: player class from data/class/class.csv and three ways of blending it with the season rating.
Changes nothing in the game (pre-v2 analysis; the pool now already holds v2 ratings from data/ratings/class_v2.py, so "before" here is no longer the raw season S). Run from repo root: python3 data/class/proposal.py  -> prints tables for data/class/proposal.md
and writes data/class/class_score.csv (person_id, name, class and components).

Class C (0..1) = weighted mean of components (each 0..1); formula in data/ratings/class_v2.py (class_score):
  national  0.25 * min(caps, 120) / 120                            - senior national team, any country
  euro      0.25 * min(euro_apps, 150) / 150                       - club European cup matches in the TM data
  money     0.20 * log(max(peak value, top transfer fee) / EUR 1M) / log(60), 0..1
  awards    0.30 * min(1, points / 20)                             - points below
Points: Ballon d'Or place 1-3: 6, 4-10: 4, 11-30: 2 (per year); Ukrainian Footballer of the Year (UF) 1st 3, 2nd-3rd 1.5;
Komanda/Komanda1 1st 2, 2nd-3rd 1; UPL top scorer 1.5; UEFA Team of the Year (poll) 2.
Money: Transfermarkt market values exist only from ~2004, so 90s veterans (born <= 1977) only have end-of-career values.
For them class = max of with-money and without-money (weight redistributed over the other components).
"""
import csv, json, math, collections, re, sys

pool = json.load(open('src/pool.json'))
cards = collections.defaultdict(list)
for c in pool['clubs']:
    for x in c['pl']:
        cards[x[5]].append((x[2], c['y'], c['n'], x[0], x[3]))
rows = {r['person_id']: r for r in csv.DictReader(open('data/class/class.csv'))}


# class C and components: same function as data/ratings/class_v2.py, no formula copy
sys.path.insert(0, 'data/ratings')
from class_v2 import class_score, W   # noqa: E402


C, PARTS = {}, {}
for pid, r in rows.items():
    if not r['tm_id']:
        continue    # no data: class unknown -> 0 (see README: such people are flagged)
    C[pid], PARTS[pid] = class_score(r)


# Each variant has one knob k; calibrate() picks k so that ~15 people are 90+.
def var_a(S, c, k):   # A. class ceiling: a season cannot exceed 84 + k*C
    return min(S, round(84 + k * c))


def var_b(S, c, k):   # B. top (above 80) is compressed more for lower class
    return S if S <= 80 else round(80 + (S - 80) * (k + (1 - k) * c))


def var_c(S, c, k):   # C. top compressed for everyone (above 82: x0.4) + class bonus k*C^2 for all cards >= 70
    s = S if S <= 82 else 82 + (S - 82) * 0.4
    return min(99, round(s + k * c * c)) if S >= 70 else S


VARS = {'A': (var_a, [x / 2 for x in range(10, 41)]), 'B': (var_b, [x / 100 for x in range(10, 71)]), 'C': (var_c, [x / 2 for x in range(6, 41)])}
K = {}


def best(pid, v, k=None):
    f = VARS[v][0]
    c = C.get(pid, 0.0)
    return max(f(S, c, K[v] if k is None else k) for S, *_ in cards[pid])


def calibrate(target=15):
    for v, (f, grid) in VARS.items():
        K[v] = min(grid, key=lambda k: (abs(sum(best(p, v, k) >= 90 for p in cards) - target), -k))


def counts():
    out = {}
    for k in VARS:
        vals = [best(p, k) for p in cards]
        out[k] = (sum(v >= 90 for v in vals), sum(v >= 95 for v in vals))
    cur = [max(S for S, *_ in cards[p]) for p in cards]
    out['now'] = (sum(v >= 90 for v in cur), sum(v >= 95 for v in cur))
    return out


calibrate()

if __name__ == '__main__':
    print('регулятори k:', K)
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
    for k in VARS:
        top = sorted(cards, key=lambda p: -best(p, k))
        print(f'\n{k}: 90+ →', ', '.join(f'{cards[p][0][3]} {best(p, k)}' for p in top if best(p, k) >= 90))


FAMOUS = ['Владислав Ванат', 'Данило Сілва', 'Андрій Шевченко', 'Сергій Ребров', 'Максим Шацьких', 'Марко Девич', 'Жажа',
          'Андрій Ярмоленко', 'Євгеній Коноплянка', 'Дарійо Срна', 'Фернандіньйо', 'Віллян', 'Артем Мілевський',
          'Олександр Шовковський', 'Анатолій Тимощук', 'Генріх Мхітарян', "Андрій П'ятов", 'Артем Довбик', 'Алекс Тейшейра',
          'Віктор Циганков', 'Луїс Адріано', 'Ярослав Ракицький', 'Віктор Леоненко', 'Олег Лужний', 'Валентин Бялькевич',
          'Андрій Воробєй', 'Марлос', 'Георгій Судаков', 'Віталій Миколенко', 'Олександр Головко', 'Тімєрлан Гусейнов', 'Михайло Мудрик']


def md_table():
    byname = {}
    for p in cards:
        byname.setdefault(cards[p][0][3], []).append(p)
    lines = ['| Гравець | Картка (найкраща) | Було | Клас | A | B | C |', '|---|---|---:|---:|---:|---:|---:|']
    for n in FAMOUS:
        ps = [p for p in byname.get(n, []) if p in rows] or byname.get(n, [])
        if not ps:
            continue
        p = max(ps, key=lambda q: max(S for S, *_ in cards[q]))
        c = C.get(p, 0.0)
        top = sorted(cards[p], key=lambda x: -x[0])[:2 if n == 'Андрій Шевченко' else 1]
        for S, y, club, _, apps in top:
            vals = [VARS[v][0](S, c, K[v]) for v in ('A', 'B', 'C')]
            lines.append(f'| {n} | {club} {y} | {S} | {c:.2f} | ' + ' | '.join(map(str, vals)) + ' |')
    return '\n'.join(lines)


def card_shift():
    """how many cards change and the mean change, to estimate balance impact (sim30)"""
    out = {}
    for v in VARS:
        f = VARS[v][0]
        d = [f(S, C.get(p, 0.0), K[v]) - S for p in cards for S, *_ in cards[p]]
        out[v] = (sum(1 for x in d if x), round(sum(d) / len(d), 2), sum(1 for p in cards for S, *_ in cards[p] if f(S, C.get(p, 0.0), K[v]) >= 90))
    out['now'] = (0, 0, sum(1 for p in cards for S, *_ in cards[p] if S >= 90))
    return out


if __name__ == '__main__' and '--md' in __import__('sys').argv:
    print(md_table())
    print('\nзміна карток (скільки змінилось, середній зсув, карток 90+):', card_shift(), 'усього карток', sum(len(v) for v in cards.values()))
