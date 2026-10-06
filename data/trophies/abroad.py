"""Abroad trophy: Ukrainians from the pool who played for European clubs (excluding Russia, Belarus and other non-EU ex-USSR countries).

Source: Wikidata (query.wikidata.org), player clubs (P54) -> club country (P17).
- ids tm:<N> are looked up by Transfermarkt ID (P2446);
- ids w:<date>:<surname> by date of birth (P569) among footballers + Latin surname similarity.
Ukraine national teams do not count (country is Ukraine).

Run from repo root: python3 data/trophies/abroad.py <query cache dir>
Writes data/trophies/abroad_ua.json {person_id: [country codes]}; the id list is embedded in src/trophies.js (ABROAD).
"""
import json, subprocess, csv, io, sys, time, os, re, difflib, unicodedata, collections, random

CACHE_DIR = sys.argv[1] if len(sys.argv) > 1 else '.'
EUROPE = set('AL AD AT BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT ME NL MK NO PL PT RO SM RS SK SI ES SE CH TR GB MC FO GI'.split())

pool = json.load(open('src/pool.json'))
per = {}
for c in pool['clubs']:
    for x in c['pl']:
        per.setdefault(x[5], (x[0], x[10]))
ua = [k for k, v in per.items() if v[1] == 0]   # nats[0] = Ukraine

cache_f = os.path.join(CACHE_DIR, 'wd_cache.json')
C = json.load(open(cache_f)) if os.path.exists(cache_f) else {}

def q(key, sparql, head):
    if key in C:
        return C[key]
    for a in range(5):
        r = subprocess.run(['curl', '-sS', '-m', '70', 'https://query.wikidata.org/sparql', '--data-urlencode', 'query=' + sparql,
                            '-H', 'Accept: text/csv', '-H', 'User-Agent: upl30-research/0.1 (football game research)'], capture_output=True, text=True)
        if r.stdout.startswith(head):
            C[key] = list(csv.DictReader(io.StringIO(r.stdout)))
            json.dump(C, open(cache_f, 'w'))
            return C[key]
        time.sleep(3 + a * 3)
    print('FAIL', key, file=sys.stderr)
    return []

rows = []
tms = [k[3:] for k in ua if k.startswith('tm:')]
for i in range(0, len(tms), 50):
    v = ' '.join('"%s"' % t for t in tms[i:i + 50])
    rows += [dict(r, kind='tm') for r in q('tm%d' % i, 'SELECT DISTINCT ?tm ?p ?c WHERE { VALUES ?tm {%s} ?p wdt:P2446 ?tm. ?p p:P54/ps:P54 ?t. ?t wdt:P17 ?c. }' % v, 'tm,')]
bds = sorted({k.split(':')[1] for k in ua if k.startswith('w:') and '-00' not in k})
for i in range(0, len(bds), 15):
    v = ' '.join('"%sT00:00:00Z"^^xsd:dateTime' % d for d in bds[i:i + 15])
    rows += [dict(r, kind='bd') for r in q('bd%d' % i, 'SELECT DISTINCT ?bd ?p ?l ?c WHERE { VALUES ?bd {%s} ?p wdt:P569 ?bd; wdt:P106 wd:Q937857. ?p rdfs:label ?l FILTER(lang(?l)="en") ?p p:P54/ps:P54 ?t. ?t wdt:P17 ?c. }' % v, 'bd,')]

qids = sorted({r['c'].split('/')[-1] for r in rows})
cc = {}
for i in range(0, len(qids), 200):
    v = ' '.join('wd:' + x for x in qids[i:i + 200])
    for r in q('cc%d_%d' % (i, len(qids)), 'SELECT ?c ?cc WHERE { VALUES ?c { %s } ?c wdt:P297 ?cc. }' % v, 'c,'):
        cc[r['c'].split('/')[-1]] = r['cc']

def latin(s):
    s = unicodedata.normalize('NFKD', s.replace('ł', 'l').replace('Ł', 'L'))
    s = ''.join(ch for ch in s if not unicodedata.combining(ch)).lower()
    for a, b in (('shch', 's'), ('sch', 's'), ('ch', 'c'), ('sh', 's'), ('zh', 'j'), ('kh', 'h'), ('ts', 'c'), ('tz', 'c'), ('w', 'v'), ('y', 'i'), ('j', 'i')):
        s = s.replace(a, b)
    return re.sub('[^a-z]', '', s)

by_tm = collections.defaultdict(set)
by_bd = collections.defaultdict(lambda: collections.defaultdict(lambda: ['', set()]))
for r in rows:
    code = cc.get(r['c'].split('/')[-1])
    if r['kind'] == 'tm':
        if code in EUROPE:
            by_tm['tm:' + r['tm']].add(code)
    else:
        e = by_bd[r['bd'][:10]][r['p']]
        e[0] = r.get('l') or ''
        if code in EUROPE:
            e[1].add(code)

abroad = {}
for k in ua:
    if k.startswith('tm:'):
        if by_tm.get(k):
            abroad[k] = sorted(by_tm[k])
        continue
    _, d, slug = k.split(':')
    best, score = None, 0
    for label, codes in by_bd.get(d, {}).values():
        s = difflib.SequenceMatcher(None, latin(slug), latin(label.split(' ')[-1])).ratio() if label else 0
        if s > score:
            best, score = codes, s
    if best and score >= 0.6:
        abroad[k] = sorted(best)

print('українців у пулі', len(ua), 'грали в Європі', len(abroad))
cards = [x[5] for c in pool['clubs'] for x in c['pl']]
for th in (4, 5, 6):
    k = sum(sum(x in abroad for x in random.sample(cards, 11)) >= th for _ in range(40000))
    print(f'{th}+ у випадковому XI: {k / 400:.2f}%')
json.dump(dict(sorted(abroad.items())), open('data/trophies/abroad_ua.json', 'w'), ensure_ascii=False, indent=0)
