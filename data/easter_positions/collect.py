"""Пасхалки по позиціях: воротарі, що грали в полі, і захисники, яких ставили центрфорвардом.

Джерело: tmapi.transfermarkt.technology/player/<tm_id>/performance-game (як у data/penalties/collect.py).
У кожному матчі statistics.generalStatistics.positionId (позиція в матчі за TM):
 1 GK, 2 Sweeper, 3 CB, 4 LB, 5 RB, 6 DM, 7 CM, 8 RM, 9 LM, 10 AM, 11 LW, 12 RW, 13 SS, 14 CF; 0/None — невідомо.
Кандидати: усі люди з пулу, чия основна позиція (за матчами в картках) GK або CB/RB/LB, з id tm:<N>;
додатково w:-люди, для яких TM id уже підтверджено в data/penalties/penalties.csv.
Кеш: cache/<tm_id>.json — стислий список зіграних матчів (сирі 2–3 МБ не зберігаються).
Запуск з кореня репозиторію: python3 data/easter_positions/collect.py [хвилин_бюджету=150]
CACHE_ONLY=1 — лише перебудувати CSV з кешу.
"""
import json, csv, os, sys, time, subprocess, collections

D = 'data/easter_positions'
CACHE = os.path.join(D, 'cache')
os.makedirs(CACHE, exist_ok=True)
BUDGET = float(sys.argv[1]) if len(sys.argv) > 1 else 150
CACHE_ONLY = os.environ.get('CACHE_ONLY') == '1'
GAP = 1.5
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
POS = {1: 'Goalkeeper', 2: 'Sweeper', 3: 'Centre-Back', 4: 'Left-Back', 5: 'Right-Back', 6: 'Defensive Midfield',
       7: 'Central Midfield', 8: 'Right Midfield', 9: 'Left Midfield', 10: 'Attacking Midfield', 11: 'Left Winger',
       12: 'Right Winger', 13: 'Second Striker', 14: 'Centre-Forward'}
T0 = time.time()


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


pool = json.load(open('src/pool.json'))
P = {}
for c in pool['clubs']:
    for x in c['pl']:
        e = P.setdefault(x[5], {'name': x[0], 'pos': collections.Counter(), 'cs': collections.defaultdict(set)})
        e['pos'][x[6]] += (x[3] or 0) + 1
        e['cs'][c['n']].add(c['y'])
for e in P.values():
    e['main'] = e['pos'].most_common(1)[0][0]

TM = {}
for pid, e in P.items():
    if e['main'] in ('GK', 'CB', 'RB', 'LB') and pid.startswith('tm:'):
        TM[pid] = pid[3:]
extra = 0
for r in csv.DictReader(open('data/penalties/penalties.csv')):
    pid = r['person_id']
    if pid.startswith('w:') and r['tm_id'] and pid in P and P[pid]['main'] in ('GK', 'CB', 'RB', 'LB'):
        TM[pid] = r['tm_id']; extra += 1
# порядок: воротарі, потім CB, потім крайні
order = sorted(TM, key=lambda p: ({'GK': 0, 'CB': 1}.get(P[p]['main'], 2), p))
log('кандидатів', len(order), 'з них w: з penalties.csv', extra)


def club_seasons(e):
    parts = []
    for club, ys in sorted(e['cs'].items(), key=lambda kv: min(kv[1])):
        ys = sorted(ys)
        parts.append(f"{club} {ys[0]}" + (f"–{ys[-1]}" if ys[-1] != ys[0] else ''))
    return '; '.join(parts)


_last = [0.0]
failed = []


def fetch(tm):
    f = os.path.join(CACHE, tm + '.json')
    if os.path.exists(f):
        return json.load(open(f))
    if CACHE_ONLY:
        return None
    url = f'https://tmapi.transfermarkt.technology/player/{tm}/performance-game'
    for a in range(3):
        w = _last[0] + GAP - time.time()
        if w > 0:
            time.sleep(w)
        r = subprocess.run(['curl', '-sS', '-m', '120', '-A', UA, url], capture_output=True, text=True, errors='replace')
        _last[0] = time.time()
        try:
            d = json.loads(r.stdout)['data']
            break
        except Exception:
            log('  помилка', tm, (r.stderr or r.stdout[:200]).strip()[:200])
            time.sleep(30 * (a + 1))
    else:
        failed.append(tm)
        return None
    games = []
    for m in d.get('performance') or []:
        gi, st = m['gameInformation'], m['statistics']
        gs = st['generalStatistics']
        if gs.get('participationState') != 'played':
            continue
        cl = m.get('clubsInformation') or {}
        games.append({'g': gi['gameId'], 'd': (gi.get('date') or {}).get('dateTimeUTC', '')[:10], 'c': gi.get('competitionId'),
                      'p': gs.get('positionId'), 'min': (st.get('playingTimeStatistics') or {}).get('playedMinutes'),
                      'gl': (st.get('goalStatistics') or {}).get('goalsScoredTotal'),
                      'pg': (st.get('goalStatistics') or {}).get('penaltyShooterGoalsScored'),
                      'cl': (cl.get('club') or {}).get('clubId'), 'op': (cl.get('opponent') or {}).get('clubId'),
                      'sc': f"{(cl.get('club') or {}).get('goalsTotal')}:{(cl.get('club') or {}).get('opponentGoalsTotal')}"})
    json.dump(games, open(f + '.tmp', 'w'))
    os.replace(f + '.tmp', f)
    return games


rows, stats = [], collections.Counter()
for i, pid in enumerate(order):
    if not CACHE_ONLY and (time.time() - T0) / 60 > BUDGET:
        log('бюджет вичерпано на', i); break
    tm = TM[pid]
    games = fetch(tm)
    if games is None:
        stats['nodata'] += 1; continue
    stats['ok'] += 1
    e = P[pid]
    pc = collections.Counter(g['p'] for g in games)
    gk = e['main'] == 'GK'
    for g in games:
        p = g['p']
        note = ''
        if gk and p not in (None, 0, 1):
            note = 'воротар у полі'
        elif gk and (g['gl'] or 0) > 0:
            note = 'воротар забив' + (' (пенальті)' if (g['pg'] or 0) >= (g['gl'] or 0) else '')
        elif not gk and p in (13, 14):
            note = 'захисник у нападі'
        elif not gk and p == 1:
            note = 'польовий у воротах'
        if not note:
            continue
        note += f"; рахунок {g['sc']}; клуб TM {g['cl']} проти {g['op']}; позиції за кар'єру TM: " + \
            ', '.join(f"{POS.get(k, k)}×{v}" for k, v in pc.most_common(4))
        rows.append({'id': pid, 'name': e['name'], 'main_pos': e['main'], 'club_seasons': club_seasons(e),
                     'match_date': g['d'], 'competition': g['c'], 'played_position': POS.get(p, 'Goalkeeper' if gk else p),
                     'minutes': g['min'], 'goals': g['gl'],
                     'source_url': f"https://www.transfermarkt.com/spielbericht/index/spielbericht/{g['g']}",
                     'note': note, '_tm': tm})
    if i % 50 == 0:
        log(i, pid, e['name'], len(rows))

with open(os.path.join(D, 'candidates.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, ['id', 'name', 'main_pos', 'club_seasons', 'match_date', 'competition', 'played_position',
                           'minutes', 'goals', 'source_url', 'note'], extrasaction='ignore')
    w.writeheader()
    for r in sorted(rows, key=lambda r: (r['main_pos'] != 'GK', r['name'], r['match_date'])):
        w.writerow(r)
json.dump({'checked': stats['ok'], 'nodata': stats['nodata'], 'failed': failed, 'candidates_total': len(order), 'rows': len(rows)},
          open(os.path.join(D, 'cache', '_stats.json'), 'w'), ensure_ascii=False)
log('готово', dict(stats), 'рядків', len(rows), 'невдалих', len(failed))
