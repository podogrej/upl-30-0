"""Adds the live season 2026/27 to src/pool.json from data/current/live_ratings_2026.csv.

Usage (from repo root):
  python3 data/current/add_live_season.py --profiles <cache dir>   # once per new person: Transfermarkt profiles -> new_people_2026.csv
  python3 data/current/add_live_season.py                          # (re)build the y=2026 club-seasons in the pool
Then: python3 data/check_pool.py && python3 src/build.py && node tools/make_engine.js

Idempotent: every run drops all y=2026 club-seasons and rebuilds them from the CSVs (winter refresh = new CSV + rerun).
Inputs:
  - live_ratings_2026.csv (data/current/live_ratings.py): one row per player and club, rating already final;
  - new_people_2026.csv: people not yet in the pool (TM profile: birth year, citizenship, foot, positions; name_uk by hand);
  - data/matches/upl_matches.csv: played 2026/27 games -> goals for/against per game (seasons['2026'].teams, like other seasons).
Card fields for people already in the pool (name, positions, citizenship, birth year) come from their latest card,
so one id keeps one name/citizenship/birth year (check_pool). Clean sheets: goalkeepers only (TM per-game data).
Clubs: TM renamed Metalist 1925 to FC Kharkiv; the pool keeps one slug per club (SAME_CLUB, as in export_vd.py).
"""
import csv, json, os, re, subprocess, sys, time
from collections import Counter, defaultdict

D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(D, '..', '..'))
POOL = os.path.join(ROOT, 'src', 'pool.json')
RATINGS = os.path.join(D, 'live_ratings_2026.csv')
PEOPLE = os.path.join(D, 'new_people_2026.csv')
MATCHES = os.path.join(ROOT, 'data', 'matches', 'upl_matches.csv')
YEAR, SEASON = 2026, '2026/27'
SAME_CLUB = {'fc-kharkiv': 'metalist-1925'}
NAME_NOW = {'metalist-1925': 'ФК Харків'}   # club-season name for the live season only; history keeps the old name
# ceiling for ratings computed from 2026/27 rounds (not for carried 2025/26 ratings) until the winter refresh; None = off
LIVE_ROUNDS_CAP = 85
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
# Transfermarkt position -> game position (as data/positions/verify_manual.py); generic ones -> the group's central slot
TMPOS = {'Goalkeeper': 'GK', 'Centre-Back': 'CB', 'Left-Back': 'LB', 'Right-Back': 'RB', 'Defensive Midfield': 'CDM',
         'Central Midfield': 'CM', 'Attacking Midfield': 'CAM', 'Left Midfield': 'LM', 'Right Midfield': 'RM',
         'Left Winger': 'LW', 'Right Winger': 'RW', 'Centre-Forward': 'ST', 'Second Striker': 'ST', 'Sweeper': 'CB',
         'Defender': 'CB', 'Midfield': 'CM', 'Attack': 'ST'}
LINE_OF = {'GK': 'GK', 'CB': 'DF', 'LB': 'DF', 'RB': 'DF', 'CDM': 'MF', 'CM': 'MF', 'CAM': 'MF', 'LM': 'MF', 'RM': 'MF',
           'LW': 'FW', 'RW': 'FW', 'ST': 'FW'}
FOOT = {'left': 'L', 'right': 'R', 'both': 'B'}
# TM citizenship names that have no pool card yet (Ukrainian name appended to pool['nats'])
NEW_NATS = {'Korea, South': 'Південна Корея', 'Japan': 'Японія', 'Peru': 'Перу', 'Chile': 'Чилі', 'Mexico': 'Мексика',
            'Iraq': 'Ірак', 'Australia': 'Австралія', 'Central African Republic': 'ЦАР', 'Benin': 'Бенін', 'Liberia': 'Ліберія', 'Kenya': 'Кенія', 'Angola': 'Ангола',
            'Mozambique': 'Мозамбік', 'Equatorial Guinea': 'Екваторіальна Гвінея', 'Comoros': 'Коморські Острови',
            'Scotland': 'Шотландія', 'Wales': 'Уельс', 'Northern Ireland': 'Північна Ірландія', 'Turkmenistan': 'Туркменістан',
            'Zimbabwe': 'Зімбабве', 'Cyprus': 'Кіпр', 'Kazakhstan': 'Казахстан', 'Kuwait': 'Кувейт', 'Iran': 'Іран'}
PEOPLE_COLS = ['person_id', 'name_tm', 'name_uk', 'conf', 'tm_pos', 'main', 'alts', 'foot', 'citizenship', 'birth_year', 'url']


def read_csv(p):
    return list(csv.DictReader(open(p, encoding='utf-8'))) if os.path.exists(p) else []


def profiles(cache):
    """Fetch TM profiles of people missing from the pool and from new_people_2026.csv; keeps hand-made name_uk."""
    pool = json.load(open(POOL, encoding='utf-8'))
    ids = {p[5] for c in pool['clubs'] if c['y'] != YEAR for p in c['pl']} | set(pool.get('alias', {}))
    have = {r['person_id']: r for r in read_csv(PEOPLE)}
    os.makedirs(cache, exist_ok=True)
    for r in read_csv(RATINGS):
        pid = 'tm:' + r['tm_id']
        if r['person_id'] or pid in ids or pid in have:
            continue
        f = os.path.join(cache, 'profile_%s.html' % r['tm_id'])
        url = 'https://www.transfermarkt.com/-/profil/spieler/%s' % r['tm_id']
        if not (os.path.exists(f) and os.path.getsize(f) > 30000):
            subprocess.run(['curl', '-sL', '-m', '40', '-A', UA, url, '-o', f])
            time.sleep(3)
        t = re.sub(r'\s+', ' ', re.sub('<[^>]+>', ' ', open(f, encoding='utf-8', errors='replace').read())).replace('&nbsp;', ' ')
        g = lambda rx: (re.search(rx, t) or [None, ''])[1].strip()
        main = g(r'Main position: ([A-Za-z -]+?) (?:Other position|Facts|Name in home|Date of birth)')
        other = re.findall(r'Other position: ([A-Za-z -]+?)(?= Other position| Facts| Name| Date|$)', t)
        cit = g(r'Citizenship: ([A-Za-z\',. -]+?) (?:Height|Position|Foot|Player agent|Current club)')
        have[pid] = dict(person_id=pid, name_tm=r['name_tm'], name_uk='', conf='', tm_pos=r['tm_pos'],
                         main=TMPOS.get(main or r['tm_pos'], ''), alts=';'.join(dict.fromkeys(TMPOS[o] for o in other if o in TMPOS)),
                         foot=FOOT.get(g(r'Foot: (left|right|both)'), ''), citizenship=cit,
                         birth_year=g(r'Date of birth/Age: \d{2}/\d{2}/(\d{4})') or g(r'Date of birth/Age: [A-Z][a-z]{2} \d{1,2}, (\d{4})'), url=url)
        print(pid, have[pid])
    with open(PEOPLE, 'w', newline='', encoding='utf-8') as fo:
        w = csv.DictWriter(fo, fieldnames=PEOPLE_COLS); w.writeheader()
        w.writerows(sorted(have.values(), key=lambda x: x['person_id']))
    print(PEOPLE, len(have), 'people; without name_uk:', sum(1 for x in have.values() if not x['name_uk']))


def team_stats():
    """slug -> [games, goals for, goals against] from played 2026/27 games"""
    st = defaultdict(lambda: [0, 0, 0])
    for r in csv.DictReader(open(MATCHES, encoding='utf-8')):
        if r['season'] != SEASON or not r['home_goals'].strip():
            continue
        h, a = SAME_CLUB.get(r['home_slug'], r['home_slug']), SAME_CLUB.get(r['away_slug'], r['away_slug'])
        hg, ag = int(r['home_goals']), int(r['away_goals'])
        for s, f, x in ((h, hg, ag), (a, ag, hg)):
            st[s][0] += 1; st[s][1] += f; st[s][2] += x
    return st


def build():
    pool = json.load(open(POOL, encoding='utf-8'))
    pool['clubs'] = [c for c in pool['clubs'] if c['y'] != YEAR]
    alias = pool.get('alias', {})
    last, club_name = {}, {}
    for c in pool['clubs']:
        club_name[c['c']] = c['n']   # clubs are in year order: the latest name wins
        for p in c['pl']:
            last[p[5]] = p
    nats = pool['nats']
    # TM citizenship (English) -> nats index, by majority over people already in the pool
    vote = defaultdict(Counter)
    for r in csv.DictReader(open(os.path.join(ROOT, 'data', 'names', 'names_master.csv'), encoding='utf-8')):
        p = last.get(r['person_id'])
        if p and p[10] >= 0 and r['nat'] and re.match(r'^[A-Za-z]', r['nat']):
            vote[r['nat'].split(',')[0].strip()][p[10]] += 1
    nat_idx = {k: v.most_common(1)[0][0] for k, v in vote.items()}

    def nat_of(en):
        if not en:
            return -1
        if en in nat_idx:
            return nat_idx[en]
        if en not in NEW_NATS:
            sys.exit('unknown citizenship %r: add it to NEW_NATS' % en)
        if NEW_NATS[en] not in nats:
            nats.append(NEW_NATS[en])
        return nats.index(NEW_NATS[en])

    people = {r['person_id']: r for r in read_csv(PEOPLE)}
    rows = read_csv(RATINGS)
    clubs = defaultdict(list)
    foot_new, miss = {}, []
    for r in rows:
        slug = SAME_CLUB.get(r['club'], r['club'])
        rating = int(r['rating'])
        if LIVE_ROUNDS_CAP is not None and r['source'].startswith('rounds'):
            rating = min(rating, LIVE_ROUNDS_CAP)
        gk = r['line'] == 'GK'
        cs = int(r['gk_clean_sheets']) if gk and r['gk_clean_sheets'] else None
        pid = r['person_id'] or 'tm:' + r['tm_id']
        if pid in last:
            o = last[pid]
            card = [o[0], o[1], rating, int(r['apps']), int(r['goals']), pid, o[6], o[7], int(r['assists']), cs, o[10], o[11]]
        else:
            q = people.get(pid)
            if not q or not q['name_uk'] or not q['main']:
                miss.append('%s %s' % (pid, r['name_tm'])); continue
            main = q['main'] if LINE_OF.get(q['main']) == r['line'] else TMPOS[r['tm_pos']]
            alts = ';'.join(a for a in q['alts'].split(';') if a and a != main)
            card = [q['name_uk'], r['line'], rating, int(r['apps']), int(r['goals']), pid, main, alts, int(r['assists']), cs,
                    nat_of(q['citizenship']), int(q['birth_year'] or 0)]
            if q['foot']:
                foot_new[pid] = q['foot']
        clubs[slug].append(card)
    if miss:
        sys.exit('no profile or name_uk (run --profiles, then fill name_uk in new_people_2026.csv): ' + ', '.join(miss))

    place = {SAME_CLUB.get(r['club'], r['club']): int(r['club_place']) for r in rows}
    st = team_stats()
    base = sum(v[1] for v in st.values()) / sum(v[0] for v in st.values())
    teams = sorted(((s, NAME_NOW.get(s, club_name[s]), place[s], round(st[s][1] / st[s][0] / base, 3), round(st[s][2] / st[s][0] / base, 3))
                    for s in place), key=lambda t: t[2])
    assert len(teams) == 16 and [t[2] for t in teams] == list(range(1, 17)), teams
    for s, n, pos, _, _ in teams:
        pool['clubs'].append({'y': YEAR, 'c': s, 'n': n, 'pos': pos, 'pl': clubs[s]})
    pool['seasons'][str(YEAR)] = {'base': round(base, 3), 'status': 'live', 'teams': [list(t) for t in teams]}
    pool['seasons'][str(YEAR - 1)]['status'] = 'complete'

    ids = {p[5] for c in pool['clubs'] for p in c['pl']}
    foot = {k: v for k, v in pool['foot'].items() if k in ids}
    for k, v in foot_new.items():
        foot.setdefault(k, v)
    pool['foot'] = dict(sorted(foot.items()))
    open(POOL, 'w', encoding='utf-8').write(json.dumps(pool, ensure_ascii=False, separators=(',', ':')))
    subprocess.run([sys.executable, os.path.join(ROOT, 'data', 'update_meta.py')], check=True)
    n_new = sum(1 for p in {p[5] for c in pool['clubs'] if c['y'] == YEAR for p in c['pl']} if p not in last)
    print('2026/27: %d club-seasons, %d cards, %d new people, cap %s, base %.3f' %
          (len(teams), sum(len(v) for v in clubs.values()), n_new, LIVE_ROUNDS_CAP, base))


if __name__ == '__main__':
    if '--profiles' in sys.argv:
        profiles(sys.argv[sys.argv.index('--profiles') + 1])
    else:
        build()
