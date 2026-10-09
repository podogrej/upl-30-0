"""Preview of 2026/27 (live season) card ratings. Does not touch src/pool.json.

Usage (from repo root): python3 data/current/live_ratings.py <cache dir> [--offline]
Writes data/current/live_ratings_2026.csv and prints a report.

Sources (Transfermarkt, cached in <cache dir>; rerun reuses the cache, --offline never fetches):
  - season page: clubs; league table: place, games, goals for/against, points;
  - club 'leistungsdaten' pages (UKR1, plus/1): position, age, apps, goals, assists, minutes;
  - goalkeepers: tmapi per-game data (UKR1, season 2026): goals conceded while on the pitch, clean sheets
    (60+ minutes and the opponent scored 0, as stage 4 did for Kaggle seasons).
Rules:
  - person (canonical id via pool['alias']) with a 2025/26 card -> that card's current rating
    (several cards: most apps, then higher rating);
  - otherwise stage 4 (same as data/fix_2021/recompute_2021.py) over all 2026/27 players by line,
    team strength from the current table, under 8 apps -> toward 50 (weight apps/8);
    then TOP_PTS (smooth_cameo.top_map), then formula C (class_v2) with quality Q and age G; no cameo smoothing.
  - defenders have no clean sheets here (feature weight is redistributed, as stage 4 does for missing data).
"""
import csv, html, json, math, os, re, subprocess, sys, time
from statistics import NormalDist

D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(D, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'data', 'ratings'))
import smooth_cameo as SC
import class_v2 as CV

CACHE = sys.argv[1]
OFFLINE = '--offline' in sys.argv
SEASON, PREV = 2026, 2025
OUT = os.path.join(D, 'live_ratings_2026.csv')
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
BASE = 'https://www.transfermarkt.com'
TMAPI = 'https://tmapi-alpha.transfermarkt.technology'
# pool slug used for the club's display name (TM renamed Metalist 1925 to FC Kharkiv)
NAME_SLUG = {'fc-kharkiv': 'metalist-1925'}

# stage 4 constants (data/build_stage4.py)
K_SHRINK, FULL_SAMPLE_APPS = 6, 8
RATING_MID, RATING_SD, RATING_MIN, RATING_MAX, RATING_REPLACEMENT, RATING_REF_GROUP = 72, 10, 45, 99, 50, 150
WEIGHTS = {
    "FW": {"gpg_adj": 0.40, "goals_tot": 0.20, "apg_adj": 0.15, "share": 0.10, "team": 0.15},
    "MF": {"gapg_adj": 0.30, "ga_tot": 0.20, "share": 0.25, "team": 0.25},
    "DF": {"share": 0.35, "team_def": 0.25, "team": 0.20, "ga_tot": 0.10, "cs_rate": 0.10},
    "GK": {"cpg_adj_neg": 0.40, "share": 0.30, "cs_rate": 0.15, "team": 0.15},
}
TM_LINE = {'Goalkeeper': 'GK', 'Centre-Back': 'DF', 'Left-Back': 'DF', 'Right-Back': 'DF', 'Defender': 'DF',
           'Defensive Midfield': 'MF', 'Central Midfield': 'MF', 'Attacking Midfield': 'MF', 'Left Midfield': 'MF',
           'Right Midfield': 'MF', 'Midfield': 'MF', 'Left Winger': 'FW', 'Right Winger': 'FW',
           'Centre-Forward': 'FW', 'Second Striker': 'FW', 'Attack': 'FW'}
ND = NormalDist()
os.makedirs(CACHE, exist_ok=True)


def fetch(url, name, minsize=30000):
    p = os.path.join(CACHE, name)
    if os.path.exists(p) and os.path.getsize(p) > minsize:
        return open(p, encoding='utf-8').read()
    if OFFLINE:
        sys.exit('not in cache: ' + name)
    for _ in range(5):
        r = subprocess.run(['curl', '-sL', '-m', '40', '-A', UA, url, '-o', p, '-w', '%{http_code}'],
                           capture_output=True, text=True)
        if r.stdout == '200' and os.path.getsize(p) > minsize:
            time.sleep(1.5)
            return open(p, encoding='utf-8').read()
        time.sleep(4)
    sys.exit('FAILED ' + url)


def txt(s):
    return html.unescape(re.sub(r'<.*?>', '', s)).strip()


def num(s):
    s = txt(s).replace("'", '').replace('.', '')
    return int(s) if s.isdigit() else 0


# ---------- collect ----------
def collect():
    nmap = {}
    for r in csv.DictReader(open(os.path.join(ROOT, 'data/matches/club_names_map.csv'), encoding='utf-8')):
        if r['first_tm_season'] <= str(SEASON) <= r['last_tm_season']:
            nmap[r['source_name']] = r['slug']
    t = fetch('%s/premier-liga/startseite/wettbewerb/UKR1/saison_id/%d' % (BASE, SEASON), 'season_%d.html' % SEASON, 100000)
    clubs = {cid: (tslug, html.unescape(n).strip())
             for tslug, cid, n in re.findall(r'href="/([^"/]+)/startseite/verein/(\d+)/saison_id/%d">([^<]+)<' % SEASON, t)}
    slug = {cid: nmap[n] for cid, (_, n) in clubs.items()}

    t = fetch('%s/premier-liga/tabelle/wettbewerb/UKR1/saison_id/%d' % (BASE, SEASON), 'table_%d.html' % SEASON, 50000)
    i = t.find('class="items"'); tb = t[i:t.find('</table>', i)]
    table = {}
    for r in re.split(r'<tr', tb)[2:]:
        cid = re.search(r'/spielplan/verein/(\d+)/', r).group(1)
        cells = [txt(c) for c in re.findall(r'<td[^>]*>(.*?)</td>', r, re.S)]
        place = int(re.match(r'\d+', cells[0]).group())
        gf, ga = map(int, cells[7].split(':'))
        table[slug[cid]] = dict(place=place, games=int(cells[3]), gf=gf, ga=ga, pts=int(cells[9]))
    assert len(table) == len(clubs) == 16, (len(table), len(clubs))

    rows = []
    for cid, (tslug, _) in sorted(clubs.items()):
        page = fetch('%s/%s/leistungsdaten/verein/%s/reldata/UKR1%%26%d/plus/1' % (BASE, tslug, cid, SEASON),
                     'club_%s_%d.html' % (cid, SEASON))
        i = page.find('class="items"'); tb = page[i:page.find('</table>\n', i)]
        for r in re.split(r'<tr class="(?:odd|even)">', tb)[1:]:
            m = re.search(r'href="/[^"]*/profil/spieler/(\d+)">([^<]*)</a></span></div><div', r)
            if not m or '</table></td>' not in r:
                continue
            pos = re.search(r'<tr><td>([^<]*)</td></tr></table>', r)
            # cells: age, nat, in squad, apps, goals, assists, yellow, 2nd yellow, red, sub on, sub off, ppg, minutes
            c = re.findall(r'<td[^>]*>(.*?)</td>', r.split('</table></td>', 1)[1], re.S)
            apps = num(c[3])
            if apps < 1:
                continue
            rows.append(dict(club=slug[cid], tm=m.group(1), name=html.unescape(m.group(2)).strip(),
                             tm_pos=pos.group(1).strip() if pos else '', age=num(c[0]), apps=apps,
                             goals=num(c[4]), assists=num(c[5]), minutes=num(c[12])))
    # goalkeepers: conceded / clean sheets from per-game data
    for r in rows:
        r['conc'] = r['cs'] = None
        if TM_LINE.get(r['tm_pos']) != 'GK':
            continue
        js = json.loads(fetch('%s/player/%s/performance-game?season=%d' % (TMAPI, r['tm'], SEASON),
                              'gk_%s_%d.json' % (r['tm'], SEASON), 50))
        conc = cs = n = 0
        for g in js['data']['performance']:
            gi, st = g['gameInformation'], g['statistics']
            if gi['competitionId'] != 'UKR1' or gi['seasonId'] != SEASON:
                continue
            mins = st['playingTimeStatistics']['playedMinutes'] or 0
            if mins <= 0 or str(st['generalStatistics'].get('primaryClubId')) not in [k for k, v in slug.items() if v == r['club']]:
                continue
            n += 1
            conc += st['goalStatistics']['opponentGoalsOnThePitch'] or 0
            cs += int(mins >= 60 and g['clubsInformation']['club']['opponentGoalsTotal'] == 0)
        if n:
            r['conc'], r['cs'], r['gk_games'] = conc, cs, n
    return rows, table


# ---------- stage 4 (same math as data/fix_2021/recompute_2021.py) ----------
def zscore(xs):
    v = [x for x in xs if x is not None]
    if not v: return [None] * len(xs)
    m = sum(v) / len(v); sd = math.sqrt(sum((x - m) ** 2 for x in v) / len(v))
    if not math.isfinite(sd) or sd < 1e-9: return [0.0] * len(xs)
    return [None if x is None else (x - m) / sd for x in xs]


def shrunk(num_, den, mask):
    sn = sum(n for n, m in zip(num_, mask) if m and n is not None); sd = sum(d for d, m in zip(den, mask) if m)
    mu = sn / max(sd, 1.0) if any(mask) else 0.0
    return [((n or 0) + K_SHRINK * mu) / (d + K_SHRINK) for n, d in zip(num_, den)]


def avg_rank(vals):
    order = sorted(range(len(vals)), key=lambda i: vals[i]); r = [0.0] * len(vals); i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]: j += 1
        for k in range(i, j + 1): r[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return r


def stage4(rows, table):
    n = len(table)
    for r in rows:
        t = table[r['club']]
        r.update(rank_pct=(n - t['place']) / (n - 1), ga_pg=t['ga'] / t['games'], gd_pg=(t['gf'] - t['ga']) / t['games'],
                 share=min(r['apps'] / t['games'], 1.0))
    for pg, W in WEIGHTS.items():
        g = [r for r in rows if r['line'] == pg]
        den = [float(r['apps']) for r in g]
        F = {'share': [r['share'] for r in g]}
        zr = zscore([r['rank_pct'] for r in g]); zg = zscore([r['gd_pg'] for r in g])
        F['team'] = [0.5 * a + 0.5 * b for a, b in zip(zr, zg)]
        F['team_def'] = zscore([-r['ga_pg'] for r in g])
        gs = [r['goals'] + r['assists'] for r in g]
        F['goals_tot'] = [r['goals'] for r in g]; F['ga_tot'] = gs
        F['gpg_adj'] = shrunk([r['goals'] for r in g], den, [True] * len(g))
        F['gapg_adj'] = shrunk(gs, den, [True] * len(g))
        F['apg_adj'] = shrunk([r['assists'] for r in g], den, [True] * len(g))
        hcs = [r['cs'] is not None for r in g]
        F['cs_rate'] = [v if h else None for v, h in zip(shrunk([r['cs'] for r in g], den, hcs), hcs)] if any(hcs) else [None] * len(g)
        if pg == 'GK':
            hc = [r['conc'] is not None for r in g]
            cp = shrunk([r['conc'] for r in g], den, hc) if any(hc) else [None] * len(g)
            F['cpg_adj_neg'] = [-(v if h else r['ga_pg']) for v, h, r in zip(cp, hc, g)]
        Z = {k: zscore(F[k]) for k in W}
        for i, r in enumerate(g):
            num_ = sum(Z[k][i] * w for k, w in W.items() if Z[k][i] is not None)
            dn = sum(w for k, w in W.items() if Z[k][i] is not None)
            r['score'] = num_ / dn if dn else 0.0
            r['z'] = {k: Z[k][i] for k in W}
        rk = avg_rank([r['score'] for r in g])
        zp = [ND.inv_cdf(min(max((x - 0.5) / len(g), 1e-4), 1 - 1e-4)) for x in rk]
        z_ref = ND.inv_cdf((RATING_REF_GROUP - 0.5) / RATING_REF_GROUP); zmax = max(zp)
        for i, r in enumerate(g):
            r['pct'] = (rk[i] - 0.5) / len(g)
            za = zp[i] * (z_ref / zmax if zmax > 0 else 1.0)
            r['full'] = min(max(RATING_MID + RATING_SD * za, RATING_MIN), RATING_MAX)
            w = min(r['apps'] / FULL_SAMPLE_APPS, 1.0)
            r['s4'] = round(min(max(RATING_REPLACEMENT + (r['full'] - RATING_REPLACEMENT) * w, RATING_MIN), RATING_MAX), 1)


# ---------- main ----------
def main():
    pool = json.load(open(os.path.join(ROOT, 'src', 'pool.json'), encoding='utf-8'))
    alias = pool.get('alias') or {}
    canon = lambda pid: alias.get(pid, pid)
    ids = set(); last = {}; prev = {}; club_name = {}
    for c in pool['clubs']:
        club_name.setdefault(c['c'], c['n'])
        for p in c['pl']:
            pid = canon(p[5]); ids.add(p[5])
            if c['y'] >= last.get(pid, (0,))[0]: last[pid] = (c['y'], p[0], p[1], p[11])
            if c['y'] == PREV:
                cand = (p[3] or 0, p[2], c['c'], p[3], p[4])
                if cand > prev.get(pid, (-1,)): prev[pid] = cand
    names = {r['person_id']: (r['proposal'] or r['name_uk']) for r in csv.DictReader(open(os.path.join(ROOT, 'data/names/names_master.csv'), encoding='utf-8'))}

    rows, table = collect()
    for r in rows:
        tid = 'tm:' + r['tm']
        r['pid'] = canon(tid) if tid in ids or tid in alias else ''
        hist = last.get(r['pid'])
        r['line'] = hist[2] if hist else TM_LINE.get(r['tm_pos'], 'MF')
        r['name_uk'] = hist[1] if hist else (names.get(tid) or r['name'])
    stage4(rows, table)

    C, B = CV.load_class(alias), CV.load_dob(alias)
    A = CV.load_anchors()
    for r in rows:
        pid = r['pid']
        if pid and pid in prev:
            apps25, rating25, club25 = prev[pid][0], prev[pid][1], prev[pid][2]
            r.update(source='carried 2025/26', rating=rating25, r2025=rating25, note='%s, %d apps' % (club25, apps25))
            continue
        raw = round(r['s4']); S = SC.top_map(raw)
        dob = B.get(pid) if pid else None
        age = CV.age_on(dob, SEASON, last[pid][3]) if dob or (pid and last[pid][3]) else r['age']
        c = C.get(pid, 0.0) if pid else 0.0
        f = CV.bonus_factor(raw, age, r['line'] == 'GK')
        r.update(source='debut: rounds', rating=max(45, min(99, CV.formula_c(S, c, CV.K, f))), r2025='',
                 raw=raw, S=S, C=round(c, 3), f=round(f, 3), age_used=age,
                 note=('returning, last card %d' % last[pid][0] if pid else 'new to pool') + ('; has manual peak' if pid in A else ''))

    cols = ['club', 'club_uk', 'person_id', 'tm_id', 'name', 'name_tm', 'line', 'tm_pos', 'apps', 'goals', 'assists', 'minutes',
            'gk_conceded', 'gk_clean_sheets', 'club_games', 'club_place', 'source', 'rating', 'rating_2025', 'stage4', 'note']
    rows.sort(key=lambda r: (r['club'], -r['rating'], r['name']))
    with open(OUT, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f); w.writerow(cols)
        for r in rows:
            t = table[r['club']]
            w.writerow([r['club'], club_name.get(NAME_SLUG.get(r['club'], r['club']), ''), r['pid'], r['tm'], r['name_uk'], r['name'],
                        r['line'], r['tm_pos'], r['apps'], r['goals'], r['assists'], r['minutes'],
                        '' if r['conc'] is None else r['conc'], '' if r['cs'] is None else r['cs'], t['games'], t['place'],
                        r['source'], r['rating'], r['r2025'], r['s4'], r['note']])
    report(rows, table)
    return rows


def report(rows, table):
    car = [r for r in rows if r['source'].startswith('carried')]; deb = [r for r in rows if r['source'].startswith('debut')]
    print('cards', len(rows), '| carried', len(car), '| debut', len(deb), '(new to pool %d)' % sum(1 for r in deb if not r['pid']))
    print('GK with conceded:', sum(1 for r in rows if r['line'] == 'GK' and r['conc'] is not None), 'of', sum(1 for r in rows if r['line'] == 'GK'))
    print('\nTOP 30')
    for r in sorted(rows, key=lambda r: (-r['rating'], -r['apps']))[:30]:
        print(f"{r['rating']:>3} {r['name_uk']:<26} {r['club']:<22} {r['line']} {r['apps']}м {r['goals']}г {r['assists']}а  {r['source']}")
    print('\nDEBUT >= 75')
    for r in sorted(deb, key=lambda r: -r['rating']):
        if r['rating'] >= 75:
            print(f"{r['rating']:>3} {r['name_uk']:<26} {r['club']:<22} {r['line']} {r['apps']}м {r['goals']}г {r['assists']}а s4={r['s4']} raw={r['raw']} S={r['S']} C={r['C']} f={r['f']}  {r['note']}")


if __name__ == '__main__':
    main()
