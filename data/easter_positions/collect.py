"""Position easter eggs: goalkeepers who played outfield and defenders who were used as centre-forward.

Source: tmapi.transfermarkt.technology/player/<tm_id>/performance-game (as in data/penalties/collect.py).
Each match has statistics.generalStatistics.positionId (TM in-match position):
 1 GK, 2 Sweeper, 3 CB, 4 LB, 5 RB, 6 DM, 7 CM, 8 RM, 9 LM, 10 AM, 11 LW, 12 RW, 13 SS, 14 CF; 0/None = unknown.
Candidates: all pool people whose main position (by card apps) is GK or CB/RB/LB, with id tm:<N>;
plus w: people whose TM id is already confirmed in data/penalties/penalties.csv.
Cache: cache/<tm_id>.json, a compact list of played matches (raw 2-3 MB responses are not stored).
Run from repo root: python3 data/easter_positions/collect.py [budget_minutes=150]
CACHE_ONLY=1 only rebuilds the CSV from cache.
"""
import json, csv, os, sys, time, subprocess, collections, re

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
        e = P.setdefault(x[5], {'name': x[0], 'pos': collections.Counter(), 'cs': collections.defaultdict(set), 'apps': 0})
        e['pos'][x[6]] += (x[3] or 0) + 1
        e['apps'] += x[3] or 0
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
# order: goalkeepers, then CB, then full-backs
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


YOUTH = re.compile(r'U\d\d|1[5-9]EU|2[01]EU|^UYL|JL$')


def comp_kind(c):
    c = c or ''
    if YOUTH.search(c):
        return 'молодь'
    if c == 'FS':
        return 'товариський'
    return 'офіційний'


def identity(e, games, gk):
    """Is this the same player on TM: UPL (UKR1) matches and main position."""
    ukr = sum(1 for g in games if g['c'] == 'UKR1')
    known = [g['p'] for g in games if g['p']]
    gkn = sum(1 for p in known if p == 1)
    bad = []
    if e['apps'] >= 10 and ukr < 0.2 * e['apps']:
        bad.append(f'у TM {ukr} матчів УПЛ проти {e["apps"]} у пулі')
    if gk and len(known) >= 10 and gkn < 0.3 * len(known):
        bad.append(f'у TM воротарем лише {gkn} з {len(known)} матчів з позицією')
    if not gk and len(known) >= 10 and sum(1 for p in known if p in (2, 3, 4, 5)) < 0.3 * len(known):
        bad.append('у TM захисником менше 30% матчів (інша людина або зміна амплуа)')
    return ('СУМНІВНИЙ: ' + '; '.join(bad)) if bad else 'OK'


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
    idc = identity(e, games, gk)
    known_n = sum(1 for g in games if g['p'])
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
        note += f"; {comp_kind(g['c'])}; id {idc}; рахунок {g['sc']}; клуб TM {g['cl']} проти {g['op']}; позиції за кар'єру TM: " + \
            ', '.join(f"{POS.get(k, k)}×{v}" for k, v in pc.most_common(4))
        rows.append({'id': pid, 'name': e['name'], 'main_pos': e['main'], 'club_seasons': club_seasons(e),
                     'match_date': g['d'], 'competition': g['c'], 'played_position': POS.get(p, 'Goalkeeper' if gk else p),
                     'minutes': g['min'], 'goals': g['gl'],
                     'source_url': f"https://www.transfermarkt.com/spielbericht/index/spielbericht/{g['g']}",
                     'note': note, '_tm': tm, '_kind': comp_kind(g['c']), '_id': idc, '_known': known_n,
                     '_cat': note.split(';')[0], '_pos': p})
    if i % 50 == 0:
        log(i, pid, e['name'], len(rows))

with open(os.path.join(D, 'candidates.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, ['id', 'name', 'main_pos', 'club_seasons', 'match_date', 'competition', 'played_position',
                           'minutes', 'goals', 'source_url', 'note'], extrasaction='ignore')
    w.writeheader()
    for r in sorted(rows, key=lambda r: (r['main_pos'] != 'GK', r['name'], r['match_date'])):
        w.writerow(r)
# per-person summary for README: episodes counted separately (official senior matches, identity confirmed)
agg = collections.defaultdict(lambda: collections.Counter())
info = {}
for r in rows:
    k = (r['id'], r['_cat'])
    info[k] = r
    agg[k]['all'] += 1
    if r['_kind'] == 'офіційний' and r['_id'] == 'OK':
        agg[k]['off'] += 1
        agg[k]['min'] += r['minutes'] or 0
        agg[k]['gl'] += r['goals'] or 0
with open(os.path.join(D, 'summary.csv'), 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['id', 'name', 'main_pos', 'category', 'official_matches_ok', 'all_matches', 'minutes_official', 'goals_official',
                'tm_known_position_matches', 'identity', 'club_seasons', 'tm_profile'])
    for k, c in sorted(agg.items(), key=lambda kv: (kv[1]['off'] == 0, -kv[1]['off'])):
        r = info[k]
        w.writerow([r['id'], r['name'], r['main_pos'], r['_cat'], c['off'], c['all'], c['min'], c['gl'], r['_known'], r['_id'],
                    r['club_seasons'], f"https://www.transfermarkt.com/x/profil/spieler/{r['_tm']}"])
json.dump({'checked': stats['ok'], 'nodata': stats['nodata'], 'failed': failed, 'candidates_total': len(order), 'rows': len(rows)},
          open(os.path.join(D, 'cache', '_stats.json'), 'w'), ensure_ascii=False)
log('готово', dict(stats), 'рядків', len(rows), 'невдалих', len(failed))
