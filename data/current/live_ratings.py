"""Preview of 2026/27 (live season) card ratings. Does not touch src/pool.json.

Usage (from repo root): python3 data/current/live_ratings.py <cache dir> [--offline]
Writes data/current/live_ratings_2026.csv and prints a report.

Sources (Transfermarkt, cached in <cache dir>; rerun reuses the cache, --offline never fetches):
  - season page: clubs; league table: place, games, goals for/against, points;
  - club 'leistungsdaten' pages (UKR1, plus/1): position, age, apps, goals, assists, minutes;
  - goalkeepers: tmapi per-game data (UKR1, season 2026): goals conceded while on the pitch, clean sheets
    (60+ minutes and the opponent scored 0, as stage 4 did for Kaggle seasons).
Rules:
  - person (canonical id via pool['alias']) with CARRY_MIN_APPS+ apps over the whole 2025/26 season -> that card's current rating
    (several cards: most apps, then higher rating);
  - otherwise (short 2025/26 card, debut, returning) stage 4 (same as data/fix_2021/recompute_2021.py) over all 2026/27 players by line,
    team strength from the current table; small samples pulled toward 50 with weight = share of the club's games;
  - a player with 2+ clubs in 2026/27 is rated once on combined stats (sums; team features apps-weighted;
    share = total apps / league games of his clubs while registered, counted from his tmapi per-game list,
    fallback max club games); all his cards get that rating;
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
CARRY_MIN_APPS = 10
OUT = os.path.join(D, 'live_ratings_2026.csv')
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
BASE = 'https://www.transfermarkt.com'
TMAPI = 'https://tmapi-alpha.transfermarkt.technology'
# pool slug used for the club's display name (TM renamed Metalist 1925 to FC Kharkiv)
NAME_SLUG = {'fc-kharkiv': 'metalist-1925'}

# stage 4 constants (data/build_stage4.py)
K_SHRINK = 6   # FULL_SAMPLE_APPS (8) replaced by share of club games for the live season
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
    def league_games(tm):
        js = json.loads(fetch('%s/player/%s/performance-game?season=%d' % (TMAPI, tm, SEASON), 'perf_%s_%d.json' % (tm, SEASON), 50))
        return [g for g in js['data']['performance'] if g['gameInformation']['competitionId'] == 'UKR1'
                and g['gameInformation']['seasonId'] == SEASON and not g['gameInformation']['isGamePostponed']
                and 'terminated' in (g['gameInformation']['gameState'] or '')]
    # goalkeepers: conceded / clean sheets from per-game data
    for r in rows:
        r['conc'] = r['cs'] = None
        if TM_LINE.get(r['tm_pos']) != 'GK':
            continue
        conc = cs = n = 0
        for g in league_games(r['tm']):
            st = g['statistics']
            mins = st['playingTimeStatistics']['playedMinutes'] or 0
            if mins <= 0 or str(st['generalStatistics'].get('primaryClubId')) not in [k for k, v in slug.items() if v == r['club']]:
                continue
            n += 1
            conc += st['goalStatistics']['opponentGoalsOnThePitch'] or 0
            cs += int(mins >= 60 and g['clubsInformation']['club']['opponentGoalsTotal'] == 0)
        if n:
            r['conc'], r['cs'], r['gk_games'] = conc, cs, n
    # players with 2+ clubs: league games of their clubs while registered (all listed games, played or not)
    clubs_of = {}
    for r in rows: clubs_of.setdefault(r['tm'], []).append(r['club'])
    reg = {tm: len(league_games(tm)) for tm, cl in clubs_of.items() if len(cl) > 1}
    return rows, table, reg


def combine(rows, table, reg):
    """one stage-4 entity per player (tm id): stats summed over his 2026/27 clubs"""
    n = len(table); ents = {}
    for r in rows:
        t = table[r['club']]
        r.update(rank_pct=(n - t['place']) / (n - 1), ga_pg=t['ga'] / t['games'], gd_pg=(t['gf'] - t['ga']) / t['games'])
        ents.setdefault(r['tm'], []).append(r)
    out = []
    for tm, g in ents.items():
        apps = sum(r['apps'] for r in g)
        mix = lambda k: sum(r[k] * r['apps'] for r in g) / apps
        hc = [r for r in g if r['conc'] is not None]
        games = table[g[0]['club']]['games'] if len(g) == 1 else (reg.get(tm) or max(table[r['club']]['games'] for r in g))
        games = max(games, apps)
        out.append(dict(tm=tm, line=g[0]['line'], apps=apps, goals=sum(r['goals'] for r in g), assists=sum(r['assists'] for r in g),
                        conc=sum(r['conc'] for r in hc) if hc else None, cs=sum(r['cs'] for r in hc) if hc else None,
                        rank_pct=mix('rank_pct'), ga_pg=mix('ga_pg'), gd_pg=mix('gd_pg'), games=games, share=apps / games,
                        cards=g))
    return out


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


def stage4(rows):
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
            w = r['share']
            r['s4'] = round(min(max(RATING_REPLACEMENT + (r['full'] - RATING_REPLACEMENT) * w, RATING_MIN), RATING_MAX), 1)


# ---------- main ----------
def main():
    pool = json.load(open(os.path.join(ROOT, 'src', 'pool.json'), encoding='utf-8'))
    alias = pool.get('alias') or {}
    canon = lambda pid: alias.get(pid, pid)
    ids = set(); last = {}; prev = {}; prev_tot = {}; club_name = {}
    for c in pool['clubs']:
        if c['y'] > PREV: continue   # ignore the live season itself (rerun after add_live_season.py)
        club_name.setdefault(c['c'], c['n'])
        for p in c['pl']:
            pid = canon(p[5]); ids.add(p[5])
            if c['y'] >= last.get(pid, (0,))[0]: last[pid] = (c['y'], p[0], p[1], p[11])
            if c['y'] == PREV:
                prev_tot[pid] = prev_tot.get(pid, 0) + (p[3] or 0)
                cand = (p[3] or 0, p[2], c['c'], p[3], p[4])
                if cand > prev.get(pid, (-1,)): prev[pid] = cand
    names = {r['person_id']: (r['proposal'] or r['name_uk']) for r in csv.DictReader(open(os.path.join(ROOT, 'data/names/names_master.csv'), encoding='utf-8'))}

    rows, table, reg = collect()
    for r in rows:
        tid = 'tm:' + r['tm']
        r['pid'] = canon(tid) if tid in ids or tid in alias else ''
        hist = last.get(r['pid'])
        r['line'] = hist[2] if hist else TM_LINE.get(r['tm_pos'], 'MF')
        r['name_uk'] = hist[1] if hist else (names.get(tid) or r['name'])
    ents = combine(rows, table, reg)
    stage4(ents)
    for e in ents:
        for r in e['cards']:
            r.update({k: e[k] for k in ('s4', 'score', 'z', 'pct', 'full', 'share', 'games')})
            r['combined'] = len(e['cards']) > 1
            r['tot'] = (e['apps'], e['goals'], e['assists'], e['conc'], e['cs'])

    C, B = CV.load_class(alias), CV.load_dob(alias)
    A = CV.load_anchors()
    for r in rows:
        pid = r['pid']
        p25 = prev.get(pid) if pid else None
        if p25 and prev_tot[pid] >= CARRY_MIN_APPS:   # whole 2025/26 season, all clubs; rating of the busiest card
            r.update(source='carried 2025/26', rating=p25[1], r2025=p25[1], note='%s, %d apps (season %d)' % (p25[2], p25[0], prev_tot[pid]))
            continue
        raw = round(r['s4']); S = SC.top_map(raw)
        dob = B.get(pid) if pid else None
        age = CV.age_on(dob, SEASON, last[pid][3]) if dob or (pid and last[pid][3]) else r['age']
        c = C.get(pid, 0.0) if pid else 0.0
        f = CV.bonus_factor(raw, age, r['line'] == 'GK')
        if p25:
            src, note = 'rounds: short 2025/26', '2025/26: %s, %d apps' % (p25[2], p25[0])
        elif pid:
            src, note = 'rounds: returning', 'last card %d' % last[pid][0]
        else:
            src, note = 'rounds: debut', 'new to pool'
        r.update(source=src, rating=max(45, min(99, CV.formula_c(S, c, CV.K, f))), r2025=p25[1] if p25 else '',
                 raw=raw, S=S, C=round(c, 3), f=round(f, 3), age_used=age,
                 note=note + ('; has manual peak' if pid in A else ''))
    for r in rows:
        if r['combined']:
            r['note'] += '; rated on combined 2026/27: %d apps, %d g, %d a, share %d/%d' % (r['tot'][:3] + (r['tot'][0], r['games']))

    cols = ['club', 'club_uk', 'person_id', 'tm_id', 'name', 'name_tm', 'line', 'tm_pos', 'apps', 'goals', 'assists', 'minutes',
            'gk_conceded', 'gk_clean_sheets', 'club_games', 'club_place', 'share', 'source', 'rating', 'rating_2025', 'stage4', 'note']
    rows.sort(key=lambda r: (r['club'], -r['rating'], r['name']))
    with open(OUT, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f); w.writerow(cols)
        for r in rows:
            t = table[r['club']]
            w.writerow([r['club'], club_name.get(NAME_SLUG.get(r['club'], r['club']), ''), r['pid'], r['tm'], r['name_uk'], r['name'],
                        r['line'], r['tm_pos'], r['apps'], r['goals'], r['assists'], r['minutes'],
                        '' if r['conc'] is None else r['conc'], '' if r['cs'] is None else r['cs'], t['games'], t['place'], round(r['share'], 3),
                        r['source'], r['rating'], r['r2025'], r['s4'], r['note']])
    report(rows, table)
    return rows


def report(rows, table):
    car = [r for r in rows if r['source'].startswith('carried')]; deb = [r for r in rows if r['source'].startswith('rounds')]
    print('cards', len(rows), '| carried', len(car), '| rounds', len(deb),
          {s: sum(1 for r in deb if r['source'] == s) for s in ('rounds: short 2025/26', 'rounds: debut', 'rounds: returning')})
    print('GK with conceded:', sum(1 for r in rows if r['line'] == 'GK' and r['conc'] is not None), 'of', sum(1 for r in rows if r['line'] == 'GK'))
    print('\nTOP 30')
    for r in sorted(rows, key=lambda r: (-r['rating'], -r['apps']))[:30]:
        print(f"{r['rating']:>3} {r['name_uk']:<26} {r['club']:<22} {r['line']} {r['apps']}м {r['goals']}г {r['assists']}а  {r['source']}")
    print('\nROUNDS >= 75')
    for r in sorted(deb, key=lambda r: -r['rating']):
        if r['rating'] >= 75:
            print(f"{r['rating']:>3} {r['name_uk']:<26} {r['club']:<22} {r['line']} {r['apps']}м {r['goals']}г {r['assists']}а s4={r['s4']} raw={r['raw']} S={r['S']} C={r['C']} f={r['f']}  {r['note']}")


if __name__ == '__main__':
    main()
