"""Аналіз для рейтингів v2: «клас» гравця з data/class/class.csv і три варіанти змішування з сезонним рейтингом.
Нічого в грі не змінює (аналіз перед 0.57; з 0.57 у пулі вже рейтинги v2 — data/ratings/class_v2.py, тож «було» тут уже не сезонний S). Запуск з кореня: python3 data/class/proposal.py  → друкує таблиці для data/class/proposal.md
і пише data/class/class_score.csv (person_id, name, клас і складові).

Клас C (0…1) = зважене середнє складових (кожна 0…1) — формула в data/ratings/class_v2.py (class_score):
  збірна   0.25 · min(caps, 120) / 120                            — основна збірна, будь-яка країна
  єврокубки 0.25 · min(euro_apps, 150) / 150                      — матчі клубних єврокубків у базі TM
  гроші    0.20 · log(max(пік вартості, найбільший трансфер) / €1 млн) / log(60), 0…1
  нагороди 0.30 · min(1, бали / 20)                               — бали нижче
Бали: Золотий м'яч — місце 1–3: 6, 4–10: 4, 11–30: 2 (за кожен рік); «Український футбол» (УФ) 1-е місце 3, 2–3-є 1.5;
«Команда»/«Команда1» 1-е місце 2, 2–3-є 1; найкращий бомбардир УПЛ 1.5; команда року UEFA (опитування) 2.
Гроші: у Transfermarkt ринкові вартості є лише приблизно з 2004 року, тож у ветеранів 90-х (народжені ≤ 1977) там лише
вартість кінця кар'єри. Для них клас = більше з двох: з грошима або без них (вага ділиться між іншими складовими).
"""
import csv, json, math, collections, re, sys

pool = json.load(open('src/pool.json'))
cards = collections.defaultdict(list)
for c in pool['clubs']:
    for x in c['pl']:
        cards[x[5]].append((x[2], c['y'], c['n'], x[0], x[3]))
rows = {r['person_id']: r for r in csv.DictReader(open('data/class/class.csv'))}


# клас C і його складові — та сама функція, що в підсумковому кроці data/ratings/class_v2.py (з 0.57), без копії формули
sys.path.insert(0, 'data/ratings')
from class_v2 import class_score, W   # noqa: E402


C, PARTS = {}, {}
for pid, r in rows.items():
    if not r['tm_id']:
        continue    # без даних клас невідомий → 0 (див. README: такі люди позначені)
    C[pid], PARTS[pid] = class_score(r)


# Кожен варіант має один «регулятор» k; calibrate() підбирає k так, щоб 90+ мали ~15 осіб.
def var_a(S, c, k):   # A. стеля від класу: сезон не може бути вищим за 84 + k·C
    return min(S, round(84 + k * c))


def var_b(S, c, k):   # B. верх (понад 80) стискається тим сильніше, чим нижчий клас
    return S if S <= 80 else round(80 + (S - 80) * (k + (1 - k) * c))


def var_c(S, c, k):   # C. верх стискається для всіх (понад 82 — ×0.4) + бонус класу k·C² до всіх карток ≥ 70
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
    """скільки карток змінюється і середня зміна — для оцінки впливу на баланс (sim30)"""
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
