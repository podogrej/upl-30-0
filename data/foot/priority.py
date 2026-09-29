"""Порядок сбора рабочей ноги: кого искать первым.
Группа 1 — LB, RB, LWB, RWB, LM, RM (основная или запасная позиция), группа 2 — LW, RW (кто не попал в группу 1).
Внутри группы: частота появления на колесе (вес клуб-сезона как в игре: STAR_BIAS=0.04, топ-4 ×1.5, Динамо/Шахтар ×0.8)
× лучший рейтинг карточки. Пишет data/foot/priority.csv; колонка tm_foot — что уже есть в data/positions/positions.csv (Transfermarkt).
Запуск из корня: python3 data/foot/priority.py
"""
import json, math, csv, collections
pool = json.load(open('src/pool.json'))
G1 = {'LB', 'RB', 'LWB', 'RWB', 'LM', 'RM'}; G2 = {'LW', 'RW'}
tm = {r['person_id']: r['foot'] for r in csv.DictReader(open('data/positions/positions.csv'))}
clubs = pool['clubs']
for c in clubs:
    top = sorted((p[2] for p in c['pl']), reverse=True)[:11]
    q = sum(top) / len(top)
    c['w'] = math.exp(0.04 * (q - 85)) * (1.5 if c['pos'] <= 4 else 1) * (0.8 if c['c'] in ('dynamo-kyiv', 'shakhtar-donetsk') else 1)
tot = sum(c['w'] for c in clubs)
P = collections.defaultdict(lambda: {'freq': 0, 'best': 0, 'slots': set(), 'cs': []})
for c in clubs:
    for p in c['pl']:
        e = P[p[5]]; e['name'] = p[0]; e['freq'] += c['w'] / tot
        e['best'] = max(e['best'], p[2]); e['slots'] |= {p[6]} | {a.split(':')[0] for a in (p[7] or '').split(';') if a} if isinstance(p[7], str) else {p[6]} | set(p[7] or [])
        e['cs'].append(f"{c['n'].split(' (')[0]} {str(c['y'])[2:]}/{str(c['y'] + 1)[2:]}")
rows = []
for pid, e in P.items():
    g = 1 if e['slots'] & G1 else 2 if e['slots'] & G2 else 0
    if not g: continue
    rows.append({'group': g, 'person_id': pid, 'name': e['name'], 'slots': ' '.join(sorted(e['slots'] & (G1 | G2))),
                 'best_rating': e['best'], 'wheel_freq_pct': round(e['freq'] * 100, 3), 'score': round(e['freq'] * 1000 * e['best'] / 100, 4),
                 'club_seasons': '; '.join(e['cs']), 'tm_foot': tm.get(pid, '')})
rows.sort(key=lambda r: (r['group'], -r['score']))
for i, r in enumerate(rows, 1): r['rank'] = i
with open('data/foot/priority.csv', 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=['rank', 'group', 'person_id', 'name', 'slots', 'best_rating', 'wheel_freq_pct', 'score', 'club_seasons', 'tm_foot']); w.writeheader(); w.writerows(rows)
for g in (1, 2):
    rs = [r for r in rows if r['group'] == g]
    print(f'група {g}: {len(rs)} осіб, нога з Transfermarkt уже є в {sum(1 for r in rs if r["tm_foot"])}')
