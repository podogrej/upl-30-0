"""Player class (career beyond UPL season stats) -> data/class/class.csv.

Why: card ratings are computed only from UPL season stats (docs/ratings.md). Ratings v2 (docs/ratings_v2.md)
need data on a person's class: national team, European cups, market value, transfers, awards.
This script only collects sourced data; it changes nothing in the game.

Candidates: every person (p[5] in src/pool.json) with at least one card >= 84, plus people with >= 5 seasons
at Dynamo or Shakhtar. Processed by max rating (descending) so the most important are done if the budget runs out.

Sources (no guesses, every number has a source):
1. Transfermarkt ID:
   - id tm:<N> -> N;
   - id w:<date>:<surname> -> candidates: TM profile links in data/foot/foot.csv, data/positions/verify_manual_report.csv,
     data/positions/positions_manual.csv; Wikidata P2446 among footballers with the same date of birth (P569);
     fallback: transfermarkt.com search by Latin surname. Every candidate is verified: TM date of birth
     must match ours, Latin surname similarity >= 0.7.
2. tmapi.transfermarkt.technology (the API used by the Transfermarkt site itself):
   - /players?ids[]=... -> name, date of birth, highest market value (marketValueDetails.highest);
   - /player/<id>/national-career-history -> apps/goals per national team; /clubs?ids[]=... -> national team names
     (youth U17-U23, Olympic, "B" do not count as the senior team);
   - /player/<id>/performance-game -> all the player's matches in TM; counts played (participationState = played)
     matches in competition type 10 (club European cups: CL, CLQ, EL, ELQ, UEFA, UCOL, ECLQ, Cup Winners' Cup, Intertoto, UEFA Super Cup).
   - /transfer/history/player/<id> -> top transfer fee (paid loans separately).
3. Wikipedia (action=raw, several pages): "Ukrainian Footballer of the Year" (Ukrainskyi Futbol poll, top 3 since 1991;
   Komanda award 1995-2016 and Komanda1 2017-2020, top 3), template "Ukrainian Premier League top scorers",
   "<year> Ballon d'Or" (places 1-30), "UEFA Team of the Year" (UEFA.com fan poll 2001-2020).
   Page links -> Wikidata (SPARQL by sitelink, P2446) -> Transfermarkt ID -> our person.

Rate limits: >= 6 s between www.transfermarkt.com requests (search only; on Human Verification wait 90 s and retry),
>= 1.5 s between tmapi requests, >= 3 s for Wikipedia. Single process, no browser.

Run from repo root:
    python3 data/class/collect.py <cache dir> [budget_minutes=300]
    CACHE_ONLY=1 python3 data/class/collect.py <cache dir>   # offline: only rebuild class.csv from cache
Cache (tm_players.json, tm_nat.json, tm_perf.json, tm_transfers.json, tm_clubs.json, tm_search.json, wd_dates.json,
wiki/*.wt, wd_titles.json) allows stop/resume; reruns are idempotent.
For identification the Wikidata cache of data/foot/collect.py (wd_foot.json) is reused if present in ../foot.
"""
import json, csv, os, sys, re, time, subprocess, io, difflib, unicodedata, collections, datetime, urllib.parse

args = [a for a in sys.argv[1:] if not a.startswith('--')]
CACHE = args[0] if args else '.'
BUDGET_MIN = float(args[1]) if len(args) > 1 else 300
CACHE_ONLY = os.environ.get('CACHE_ONLY') == '1'
T0 = time.time()
os.makedirs(os.path.join(CACHE, 'wiki'), exist_ok=True)
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
WUA = 'upl30-research/0.1 (football game research)'
TODAY = str(datetime.date.today())
OUT = 'data/class/class.csv'
EURO_TYPE = 10           # tmapi competitionTypeId of club European cups
YOUTH = re.compile(r'\bU-?\d{2}\b|Olympic|\bB\b|Amateur|Futsal|Beach|Military|Universiade|Youth|Students|\bII\b', re.I)


def log(*a):
    print(*a, flush=True)


def jload(f, d):
    p = os.path.join(CACHE, f)
    return json.load(open(p)) if os.path.exists(p) else d


def jsave(f, o):
    p = os.path.join(CACHE, f)
    json.dump(o, open(p + '.tmp', 'w'), ensure_ascii=False)
    os.replace(p + '.tmp', p)


def over_budget():
    return (time.time() - T0) / 60 > BUDGET_MIN


# ---------- candidates ----------
pool = json.load(open('src/pool.json'))
P = {}
for c in pool['clubs']:
    for x in c['pl']:
        e = P.setdefault(x[5], {'name': x[0], 'max': 0, 'best': '', 'cards84': 0, 'dksh': set()})
        if x[2] > e['max']:
            e['max'], e['best'] = x[2], f"{c['n']} {c['y']}"
        e['cards84'] += x[2] >= 84
        if c['c'] in ('dynamo-kyiv', 'shakhtar-donetsk'):
            e['dksh'].add((c['c'], c['y']))
CAND = sorted((p for p, e in P.items() if e['max'] >= 84 or len(e['dksh']) >= 5), key=lambda p: (-P[p]['max'], p))
log('кандидатів', len(CAND))


# ---------- names ----------
def latin(s):
    s = unicodedata.normalize('NFKD', s.replace('ł', 'l').replace('Ł', 'L'))
    s = ''.join(ch for ch in s if not unicodedata.combining(ch)).lower()
    for a, b in (('shch', 's'), ('sch', 's'), ('ch', 'c'), ('sh', 's'), ('zh', 'j'), ('kh', 'h'), ('ts', 'c'), ('tz', 'c'), ('w', 'v'), ('x', 'ks'), ('y', 'i'), ('j', 'i')):
        s = s.replace(a, b)
    return re.sub('[^a-z]', '', s)


UK = dict(zip('абвгґдеєжзиіїйклмнопрстуфхцчшщьюяыэё', ['a', 'b', 'v', 'h', 'g', 'd', 'e', 'ie', 'zh', 'z', 'y', 'i', 'i', 'i', 'k', 'l', 'm', 'n', 'o',
                                                  'p', 'r', 's', 't', 'u', 'f', 'kh', 'ts', 'ch', 'sh', 'shch', '', 'iu', 'ia', 'y', 'e', 'e']))


def translit(s):
    return ''.join(UK.get(ch, ch) for ch in s.lower().replace("'", '').replace('’', ''))


def sim(a, b):
    return difflib.SequenceMatcher(None, latin(a), latin(b)).ratio()


def name_sim(pid, *labels):
    ours = {translit(t) for t in re.split(r'[\s-]+', P[pid]['name']) if t}
    if pid.startswith('w:'):
        ours.add(pid.split(':', 2)[2])
    best = 0
    for label in labels:
        theirs = [translit(t) for t in re.split(r'[\s-]+', label or '') if len(latin(translit(t))) >= 3]
        best = max([best] + [sim(a, b) for a in ours for b in theirs if len(latin(a)) >= 3])
    return best


# ---------- network ----------
_last = collections.defaultdict(float)


def fetch(url, host, gap, tries=3, headers=()):
    """GET with a per-host delay between requests; returns text or None"""
    if CACHE_ONLY:
        return None
    for a in range(tries):
        w = _last[host] + gap - time.time()
        if w > 0:
            time.sleep(w)
        cmd = ['curl', '-sL', '-m', '90', '-A', WUA if 'wiki' in host else UA, '-H', 'Accept-Language: en-US,en;q=0.9']
        for h in headers:
            cmd += ['-H', h]
        r = subprocess.run(cmd + [url], capture_output=True, text=True, errors='replace')
        _last[host] = time.time()
        h = r.stdout
        if h and 'Human Verification' not in h[:3000] and 'too many requests' not in h[:500].lower() and '<title>Wikimedia Error' not in h[:500]:
            return h
        log('  блок/порожньо', host, url[:90], '— пауза 90 с')
        time.sleep(90)
    return None


def fetch_json(url, host, gap):
    h = fetch(url, host, gap)
    try:
        return json.loads(h) if h else None
    except ValueError:
        return None


TMAPI = 'https://tmapi.transfermarkt.technology'

# ---------- 1. Transfermarkt ID ----------
TMPL = jload('tm_players.json', {})     # tm id -> compact tmapi profile
SEARCH = jload('tm_search.json', {})    # query -> [[slug, tm id]]
WD = jload('wd_dates.json', {})         # date -> [[label, tm id]]
for f in (os.path.join(CACHE, '..', 'foot', 'wd_foot.json'),):
    if os.path.exists(f):
        for k, v in json.load(open(f)).items():
            WD.setdefault(k, v)


def tm_players(ids):
    need = [i for i in dict.fromkeys(ids) if i not in TMPL]
    for k in range(0, len(need), 25):
        part = need[k:k + 25]
        d = fetch_json(TMAPI + '/players?' + '&'.join('ids[]=' + i for i in part), 'tmapi', 1.5)
        if not d or not d.get('success'):
            continue
        got = set()
        for x in d['data']:
            mv = (x.get('marketValueDetails') or {})
            hi = mv.get('highest') or {}
            TMPL[x['id']] = dict(name=x.get('name', ''), short=x.get('shortName', ''),
                                 passport=((x.get('nationalityDetails') or {}).get('passportName') or ''),
                                 dob=((x.get('lifeDates') or {}).get('dateOfBirth') or ''),
                                 nat=((x.get('nationalityDetails') or {}).get('nationalities') or {}).get('nationalityId'),
                                 mv_hi=hi.get('value'), mv_hi_date=hi.get('determined'),
                                 url='https://www.transfermarkt.com' + (x.get('relativeUrl') or f'/-/profil/spieler/{x["id"]}'))
            got.add(x['id'])
        for i in part:
            if i not in got:
                TMPL[i] = {'err': 'not found'}
        jsave('tm_players.json', TMPL)
    return {i: TMPL.get(i, {'err': 'not fetched'}) for i in ids}


def sparql(q, head):
    if CACHE_ONLY:
        return None
    for a in range(5):
        r = subprocess.run(['curl', '-sS', '-m', '70', 'https://query.wikidata.org/sparql', '--data-urlencode', 'query=' + q,
                            '-H', 'Accept: text/csv', '-H', 'User-Agent: ' + WUA], capture_output=True, text=True)
        if r.stdout.startswith(head):
            return list(csv.DictReader(io.StringIO(r.stdout)))
        time.sleep(3 + a * 3)
    return None


def wd_dates(dates):
    todo = sorted(d for d in dates if d not in WD)
    for i in range(0, len(todo), 15):
        part = todo[i:i + 15]
        v = ' '.join('"%sT00:00:00Z"^^xsd:dateTime' % d for d in part)
        rows = sparql('SELECT DISTINCT ?bd ?l ?tm WHERE { VALUES ?bd {%s} ?p wdt:P569 ?bd; wdt:P106 wd:Q937857; wdt:P2446 ?tm. '
                      'OPTIONAL{?p rdfs:label ?l FILTER(lang(?l)="en")} }' % v, 'bd,')
        if rows is None:
            continue
        for d in part:
            WD[d] = []
        for r in rows:
            WD[r['bd'][:10]].append([r.get('l') or '', r['tm']])
        jsave('wd_dates.json', WD)


def tm_search(q):
    if q in SEARCH:
        return SEARCH[q]
    h = fetch('https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=' + urllib.parse.quote(q), 'www', 6)
    if h is None or 'Transfermarkt' not in h:
        return []
    ids = []
    for sl, t in re.findall(r'href="/([a-z0-9-]+)/profil/spieler/(\d+)"', h):
        if [sl, t] not in ids:
            ids.append([sl, t])
    SEARCH[q] = ids[:10]
    jsave('tm_search.json', SEARCH)
    return SEARCH[q]


def known_links():
    """w: id -> tm id from already verified repo files"""
    out = collections.defaultdict(list)
    rx = re.compile(r'spieler/(\d+)')
    for f, col in (('data/foot/foot.csv', 'url'), ('data/positions/verify_manual_report.csv', 'url'), ('data/positions/positions_manual.csv', 'source')):
        if os.path.exists(f):
            for r in csv.DictReader(open(f, newline='')):
                m = rx.search(r.get(col) or '')
                if m and r['person_id'].startswith('w:'):
                    out[r['person_id']].append(m.group(1))
    return out


def ok_identity(pid, e):
    if 'err' in e:
        return False
    if pid.startswith('tm:'):
        return True
    return e.get('dob') == pid.split(':')[1] and name_sim(pid, e['name'], e.get('short', ''), e.get('passport', '')) >= 0.7


IDMAP = jload('idmap.json', {})    # person_id -> {tm, how} or {tm: '', how: 'not found'}


def resolve_ids(search=True):
    links = known_links()
    wd_dates({p.split(':')[1] for p in CAND if p.startswith('w:') and '-00' not in p})
    # first pass: tm: ids and candidates without TM search
    cands = {}
    for pid in CAND:
        if pid.startswith('tm:'):
            cands[pid] = [(pid[3:], 'tm id')]
        elif '-00' not in pid:
            d = pid.split(':')[1]
            c = [(t, 'repo link (data/foot, data/positions)') for t in links.get(pid, [])]
            c += [(t, 'wikidata P2446 + dob') for lab, t in WD.get(d, []) if lab and name_sim(pid, lab) >= 0.7]
            cands[pid] = list(dict.fromkeys(c))
        else:
            cands[pid] = []
    tm_players([t for v in cands.values() for t, _ in v])
    for pid in CAND:
        if pid in IDMAP and IDMAP[pid].get('tm'):
            continue
        for t, how in cands[pid]:
            if ok_identity(pid, TMPL.get(t, {'err': 1})):
                IDMAP[pid] = {'tm': t, 'how': how}
                break
    # fallback: transfermarkt.com search (only for those not found yet); runs after the main collection
    for pid in (CAND if search else []):
        if (pid in IDMAP and (IDMAP[pid].get('tm') or IDMAP[pid].get('searched'))) or pid.startswith('tm:') or '-00' in pid or over_budget() or CACHE_ONLY:
            continue
        slug = pid.split(':', 2)[2]
        t = translit(P[pid]['name'].split(' ')[-1]) or slug
        g = t.replace('kh', 'h').replace('h', 'g')
        qs = [t, slug, g, g.replace('y', 'i'), re.sub('ov$', 'ev', g)]
        found = ''
        for q in dict.fromkeys(q for q in qs if len(q) >= 3):
            ids = [x for sl, x in tm_search(q) if name_sim(pid, sl.replace('-', ' ')) >= 0.7]
            tm_players(ids)
            for x in ids:
                if ok_identity(pid, TMPL.get(x, {'err': 1})):
                    found = x
                    break
            if found:
                break
        IDMAP[pid] = {'tm': found, 'how': 'transfermarkt search + dob' if found else 'not found', 'searched': 1}
        log('пошук', pid, P[pid]['name'], '→', found or '—')
        jsave('idmap.json', IDMAP)
    for pid in CAND:
        IDMAP.setdefault(pid, {'tm': '', 'how': 'not found'})
    jsave('idmap.json', IDMAP)


# ---------- 2. Transfermarkt data ----------
NAT = jload('tm_nat.json', {})        # tm id → [[clubId, games, goals, state]]
PERF = jload('tm_perf.json', {})      # tm id → {comp: [typeId, national, played, goals]} + '_euro_by_club'
TRF = jload('tm_transfers.json', {})  # tm id → [[date, from, to, fee, mv]]
CLUBS = jload('tm_clubs.json', {})    # club id → name


def club_names(ids):
    need = [i for i in dict.fromkeys(ids) if i and i not in CLUBS]
    for k in range(0, len(need), 25):
        part = need[k:k + 25]
        d = fetch_json(TMAPI + '/clubs?' + '&'.join('ids[]=' + i for i in part), 'tmapi', 1.5)
        if d and d.get('success'):
            for c in d['data']:
                CLUBS[str(c['id'])] = c.get('name', '')
            jsave('tm_clubs.json', CLUBS)


def get_nat(t):
    if t in NAT:
        return NAT[t]
    d = fetch_json(f'{TMAPI}/player/{t}/national-career-history', 'tmapi', 1.5)
    if not d or not d.get('success'):
        return None
    NAT[t] = [[h['clubId'], h.get('gamesPlayed') or 0, h.get('goalsScored') or 0, h.get('careerState') or ''] for h in (d['data'] or {}).get('history', [])]
    jsave('tm_nat.json', NAT)
    return NAT[t]


def get_perf(t):
    if t in PERF:
        return PERF[t]
    d = fetch_json(f'{TMAPI}/player/{t}/performance-game', 'tmapi', 1.5)
    if not d or not d.get('success'):
        return None
    comps, euro_club, seasons = {}, collections.Counter(), collections.Counter()
    for g in (d['data'] or {}).get('performance', []):
        gi, st = g['gameInformation'], g['statistics']
        if (st.get('generalStatistics') or {}).get('participationState') != 'played':
            continue
        c = comps.setdefault(gi['competitionId'], [gi.get('competitionTypeId'), bool(gi.get('isNationalGame')), 0, 0])
        c[2] += 1
        c[3] += ((st.get('goalStatistics') or {}).get('goalsScoredTotal') or 0)
        if gi.get('competitionTypeId') == EURO_TYPE:
            euro_club[str(g['clubsInformation']['club']['clubId'])] += 1
            seasons[str(gi['seasonId'])] += 1
    PERF[t] = {'comps': comps, 'euro_by_club': dict(euro_club), 'euro_seasons': dict(seasons)}
    jsave('tm_perf.json', PERF)
    return PERF[t]


def get_transfers(t):
    """tmapi /transfer/history/player/<id> -> [[date, from club id, to club id, fee text, market value, fee EUR, type]]"""
    if t in TRF:
        return TRF[t]
    d = fetch_json(f'{TMAPI}/transfer/history/player/{t}', 'tmapi', 1.5)
    if not d or not d.get('success'):
        return None
    out = []
    for x in ((d.get('data') or {}).get('history') or {}).get('terminated', []):
        det = x.get('details') or {}
        fee = det.get('fee') or {}
        c = fee.get('compact') or {}
        out.append([(det.get('date') or '')[:10], (x.get('transferSource') or {}).get('clubId', ''), (x.get('transferDestination') or {}).get('clubId', ''),
                    (c.get('prefix', '') + c.get('content', '') + c.get('suffix', '')).strip(), ((det.get('marketValue') or {}).get('value')),
                    fee.get('value'), (x.get('typeDetails') or {}).get('type', '')])
    TRF[t] = out
    jsave('tm_transfers.json', TRF)
    return TRF[t]


# ---------- 3. awards from Wikipedia ----------
WT = {}


def wiki(lang, title):
    f = os.path.join(CACHE, 'wiki', re.sub(r'[^\w.-]+', '_', f'{lang}_{title}') + '.wt')
    if os.path.exists(f):
        return open(f).read()
    h = fetch(f'https://{lang}.wikipedia.org/w/index.php?title=' + urllib.parse.quote(title.replace(' ', '_')) + '&action=raw', 'wiki', 3)
    if h is None or h.lstrip().startswith('<!DOCTYPE'):
        return ''
    open(f, 'w').write(h)
    return h


LINK = re.compile(r'\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]')
SORTNAME = re.compile(r'\{\{\s*[Ss]ortname\s*\|([^|}]+)\|([^|}]+)(?:\|([^|}]*))?')


def person_titles(row):
    """links [[...]] and {{sortname|First|Last|link}} in order of appearance"""
    found = []
    for m in re.finditer(LINK.pattern + '|' + SORTNAME.pattern, row):
        if m.group(1):
            found.append(m.group(1).strip())
        else:
            lk = (m.group(4) or '').strip()
            found.append(lk if lk and lk != 'nolink' else f'{m.group(2).strip()} {m.group(3).strip()}')
    return [x for x in found if not x.lower().startswith(('file:', 'image:', 'category:'))]


def awards_raw():
    """→ [(title, award label, source url)]"""
    out = []
    src = 'https://en.wikipedia.org/wiki/Ukrainian_Footballer_of_the_Year'
    t = wiki('en', 'Ukrainian Footballer of the Year')
    parts = re.split(r"===\s*''?'?([^=]+?)'?'?\s*===", t)
    for i in range(1, len(parts), 2):
        head, body = parts[i], parts[i + 1]
        tag = 'UF' if 'Ukrainskiy' in head else 'Komanda1' if 'Komanda1' in head else 'Komanda' if 'Komanda' in head else ''
        if not tag:
            continue
        for m in re.finditer(r'^\s*\|\s*(\d{4})\b(.*?)(?=^\s*\|\s*\d{4}\b|\Z)', body, re.S | re.M):
            year, row = m.group(1), m.group(2)
            line = [l for l in row.split('\n') if "'''[[" in l]
            if not line:
                continue
            line = line[0]
            win = re.search(r"'''\[\[([^\]|]+)", line)
            if win:
                out.append((win.group(1).strip(), f'{tag} #1 {year}', src))
            for place, pl in re.findall(r'(2nd|3rd)\s*\[\[([^\]|]+)', line):
                out.append((pl.strip(), f'{tag} #{place[0]} {year}', src))
    t = wiki('en', 'Template:Ukrainian Premier League top scorers')
    for season, body in re.findall(r'^\*\s*(\d{4}(?:–\d{2})?):(.*)$', t, re.M):
        for pl in LINK.findall(body):
            out.append((pl.strip(), f'UPL top scorer {season}', 'https://en.wikipedia.org/wiki/Template:Ukrainian_Premier_League_top_scorers'))
    for year in range(1992, 2026):
        if year == 2020:
            continue   # no Ballon d'Or in 2020
        title = f"{year} Ballon d'Or"
        t = wiki('en', title)
        red = re.match(r'#REDIRECT\s*\[\[([^\]]+)\]\]', t, re.I)
        if red:   # 2010–2015: FIFA Ballon d'Or
            title = red.group(1)
            t = wiki('en', title)
        # tables with a Rank column; on FIFA Ballon d'Or pages (2010-2015) the first lists only 3 finalists, so take the longer of the first two
        tabs = []
        for m in re.finditer(r'Rank', t):
            end = t.find('\n|}', m.start())
            if not any(a <= m.start() < b for a, b in tabs):
                tabs.append((m.start(), end))
        tabs = sorted(tabs[:2], key=lambda ab: -t[ab[0]:ab[1]].count('\n|-'))[:1]
        rank = None
        for a, b in tabs:
            for row in t[a:b].split('\n|-')[1:]:
                pre = re.sub(r'(style|rowspan|colspan|align|scope)\s*=\s*"?[^"|]*"?', '', re.split(r'\[\[|\{\{\s*[Ss]ortname', row)[0])
                nums = re.findall(r'(?<![\d.])(\d{1,2})(?:st|nd|rd|th|=|T)?(?![\d.])', re.sub(r'\{\{.*?\}\}', '', pre))
                if nums:
                    rank = int(nums[-1])
                names = person_titles(row)
                if rank is None or not names:
                    continue
                if rank > 30:
                    break
                for nm in names:   # rows also contain clubs/positions; extra names are dropped when matching to our people
                    out.append((nm, f"Ballon d'Or #{rank} {year}", 'https://en.wikipedia.org/wiki/' + urllib.parse.quote(title.replace(' ', '_'))))
    t = wiki('en', 'UEFA Team of the Year')
    for year, body in re.findall(r'==\s*Team of the Year (\d{4})\s*==(.*?)(?=\n==)', t, re.S):
        for row in body.split('\n|-')[1:]:
            first = row.strip().split('\n')[0]
            ls = LINK.findall(first)
            if ls:
                out.append((ls[0].strip(), f'UEFA Team of the Year {year}', 'https://en.wikipedia.org/wiki/UEFA_Team_of_the_Year'))
    return out


TITLES = jload('wd_titles.json', {})   # enwiki title → [qid, [tm ids]]


def titles_to_tm(titles):
    """English Wikipedia article title -> [QID, [TM id]] via SPARQL (sitelink). SPARQL does not resolve redirects;
    those fall back to name matching (see main)."""
    need = [t for t in dict.fromkeys(titles) if t not in TITLES]
    for k in range(0, len(need), 40):
        part = need[k:k + 40]
        v = ' '.join('"%s"@en' % t.replace('\\', '').replace('"', '\\"') for t in part)
        rows = sparql('SELECT ?t ?p ?tm WHERE { VALUES ?t {%s} ?a schema:about ?p; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?t. '
                      'OPTIONAL { ?p wdt:P2446 ?tm } }' % v, 't,')
        if rows is None:
            continue
        for t in part:
            TITLES[t] = ['', []]
        for r in rows:
            e = TITLES[r['t']]
            e[0] = r['p'].rsplit('/', 1)[-1]
            if r.get('tm') and r['tm'] not in e[1]:
                e[1].append(r['tm'])
        jsave('wd_titles.json', TITLES)


# ---------- main pass ----------
def collect_tm():
    order = [p for p in CAND if IDMAP.get(p, {}).get('tm')]
    log('з TM id', len(order), 'з', len(CAND))
    tm_players([IDMAP[p]['tm'] for p in order])
    done = 0
    for p in order:
        t = IDMAP[p]['tm']
        if over_budget():
            log('бюджет часу вичерпано — зупинка')
            break
        if t in NAT and t in PERF and t in TRF:
            continue
        n, pf, tr = get_nat(t), get_perf(t), get_transfers(t)
        done += 1
        log(done, p, P[p]['name'], P[p]['max'], 'nat' if n is not None else 'nat?', 'perf' if pf is not None else 'perf?', 'trf' if tr is not None else 'trf?')


def main():
    resolve_ids(search=False)
    collect_tm()
    resolve_ids(search=True)
    collect_tm()
    club_names([h[0] for v in NAT.values() for h in v] + [c for v in PERF.values() for c in v.get('euro_by_club', {})]
               + [str(x[i]) for v in TRF.values() for x in v for i in (1, 2)])
    aw = awards_raw()
    # matching: article title -> our person. First a rough name filter (TM), then Wikidata P2446 = our TM id;
    # if Wikidata has no TM id or the article is a redirect, only an unambiguous full-name match (>= 0.9), flagged.
    tm2p = {IDMAP[p]['tm']: p for p in CAND if IDMAP[p].get('tm')}
    tmnames = {t: TMPL.get(t, {}).get('name', '') for t in tm2p}

    def base(title):
        return re.sub(r'\s*\(.*?\)', '', title)

    memo = {}

    def close(title):
        if title not in memo:
            b = latin(base(title))
            memo[title] = [t for t, n in tmnames.items() if n and difflib.SequenceMatcher(None, b, latin(n)).ratio() >= 0.8]
        return memo[title]
    titles = [a[0] for a in aw if close(a[0])]
    titles_to_tm(titles)
    by_tm = collections.defaultdict(list)
    unmatched = collections.Counter()
    for title, label, src in aw:
        q, tms = TITLES.get(title, ['', []])
        hit = [x for x in tms if x in tm2p]
        how = 'wikidata P2446'
        if not hit and not tms:
            c = [t for t in close(title) if sim(base(title), tmnames[t]) >= 0.9]
            if len(c) == 1:
                hit, how = c, 'name match'
        if hit:
            by_tm[hit[0]].append((label, src, how))
        elif close(title):
            unmatched[title] += 1
    write(by_tm, unmatched)


def write(by_tm, unmatched):
    rows = []
    for p in CAND:
        e = P[p]
        t = IDMAP.get(p, {}).get('tm', '')
        pl = TMPL.get(t, {}) if t else {}
        r = dict(person_id=p, name=e['name'], max_rating=e['max'], best_card=e['best'], cards84=e['cards84'],
                 dk_sh_seasons=len(e['dksh']), tm_id=t, tm_name=pl.get('name', ''), dob=pl.get('dob', ''),
                 caps='', intl_goals='', country='', ukraine='', other_senior='', youth_caps='',
                 euro_apps='', ucl_apps='', euro_goals='', euro_apps_foreign='', peak_mv_eur=pl.get('mv_hi') or '',
                 peak_mv_date=pl.get('mv_hi_date') or '', max_fee_eur='', max_fee_move='', max_loan_fee_eur='',
                 awards='', sources='', checked=TODAY, note='')
        src, note = [], []
        if not t:
            note.append('немає Transfermarkt ID (не знайдено/не підтверджено датою народження)')
        else:
            src.append(pl.get('url') or f'https://www.transfermarkt.com/-/profil/spieler/{t}')
            if p.startswith('w:'):
                note.append('tm id: ' + IDMAP[p]['how'])
            n = NAT.get(t)
            if n is not None:
                senior = [(CLUBS.get(c, c), g, gl) for c, g, gl, s in n if not YOUTH.search(CLUBS.get(c, 'U99'))]
                youth = sum(g for c, g, gl, s in n if YOUTH.search(CLUBS.get(c, 'U99')))
                senior.sort(key=lambda x: -x[1])
                r['caps'] = sum(x[1] for x in senior)
                r['intl_goals'] = sum(x[2] for x in senior)
                r['country'] = senior[0][0] if senior and senior[0][1] else ''
                r['ukraine'] = int(any(x[0] == 'Ukraine' and x[1] for x in senior))
                r['other_senior'] = '; '.join(f'{a} {b}/{c}' for a, b, c in senior[1:] if b)
                r['youth_caps'] = youth
                src.append(f'{TMAPI}/player/{t}/national-career-history')
            pf = PERF.get(t)
            if pf is not None:
                eu = {k: v for k, v in pf['comps'].items() if v[0] == EURO_TYPE}
                r['euro_apps'] = sum(v[2] for v in eu.values())
                r['ucl_apps'] = sum(v[2] for k, v in eu.items() if k == 'CL')
                r['euro_goals'] = sum(v[3] for v in eu.values())
                ua = {'Dynamo Kyiv', 'Shakhtar Donetsk'}
                r['euro_apps_foreign'] = sum(v for c, v in pf['euro_by_club'].items() if CLUBS.get(c, '') and not re.search(
                    r'Kyiv|Donetsk|Dnipro|Kharkiv|Odesa|Lviv|Luhansk|Poltava|Zaporizhya|Kryvyi|Mariupol|Oleksandriya|Kolos|Uzhhorod|Lutsk|Kropyvnytskyi|Simferopol|Chornomorets|Vorskla|Karpaty|Metalist|Zorya|Olimpik|Desna|Illichivets|Tavriya|Kryvbas|Veres|Rukh|Polissya|Mynai|Arsenal Kyiv|Obolon|Metalurh', CLUBS[c]))
                if pf['euro_seasons']:
                    ys = sorted(int(x) for x in pf['euro_seasons'])
                    note.append(f'єврокубки в базі TM: {ys[0]}–{ys[-1] + 1}')
                src.append(f'{TMAPI}/player/{t}/performance-game')
            tr = TRF.get(t)
            if tr is not None:
                best, loan = None, None
                for d, fr, to, fee, mv, v, typ in tr:
                    fr, to = CLUBS.get(str(fr), str(fr)), CLUBS.get(str(to), str(to))
                    if not v:
                        continue
                    if 'LOAN' in (typ or '').upper():
                        loan = max(loan or 0, v)
                    elif best is None or v > best[0]:
                        best = (v, f'{d[:4]} {fr} → {to}')
                if best:
                    r['max_fee_eur'], r['max_fee_move'] = best
                r['max_loan_fee_eur'] = loan or ''
                src.append(f'{TMAPI}/transfer/history/player/{t}')
            if t not in NAT or t not in PERF or t not in TRF:
                note.append('дані TM зібрано не повністю (бюджет/помилка)')
            a = by_tm.get(t, [])
            r['awards'] = '; '.join(sorted({x[0] for x in a}, key=lambda s: (s.split()[-1], s)))
            src += sorted({x[1] for x in a})
            if any(x[2] == 'name match' for x in a):
                note.append('нагороди: частина зіставлена лише за іменем (у Wikidata немає TM id)')
        r['sources'] = ' '.join(src)
        r['note'] = '; '.join(note)
        rows.append(r)
    with open(OUT, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    full = sum(1 for r in rows if r['tm_id'] and r['caps'] != '' and r['euro_apps'] != '' and r['sources'].count('transfer/history'))
    log('рядків', len(rows), 'з TM id', sum(1 for r in rows if r['tm_id']), 'повних', full,
        'з нагородами', sum(1 for r in rows if r['awards']))
    log('нагороди без збігу (топ):', unmatched.most_common(15))
    jsave('awards_unmatched.json', dict(unmatched))


if __name__ == '__main__':
    main()
