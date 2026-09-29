"""Робоча нога гравців пулу → data/foot/foot.csv (person_id, name, foot L/R/B, source, url, note).

Джерела (жодних здогадок, у кожного значення є джерело):
1. data/positions/positions.csv, колонка foot — Transfermarkt через набір Kaggle «transfermarkt-datasets» (players.csv, поле foot);
   url — профіль гравця на transfermarkt.com.
2. Живий профіль transfermarkt.com (поле «Foot:»):
   - для id tm:<N> — одразу профіль N;
   - для id w:<дата>:<прізвище> — Transfermarkt ID береться з Wikidata (P2446) серед футболістів із тією ж датою народження (P569)
     і схожим прізвищем латиницею; далі дата народження на профілі Transfermarkt мусить збігтися з нашою.
Порядок: data/foot/priority.csv (спершу крайні захисники й півзахисники, потім вінгери), далі решта; воротарі — в кінці.
Запуск з кореня: python3 data/foot/collect.py <тека для кешу> [ліміт профілів]
Кеш (wd_foot.json, tm_profiles.json) дозволяє зупиняти й продовжувати.
"""
import json, csv, os, sys, re, time, subprocess, io, difflib, unicodedata, collections, datetime

CACHE = sys.argv[1] if len(sys.argv) > 1 else '.'
LIMIT = int(sys.argv[2]) if len(sys.argv) > 2 else 10**9
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
FOOT = {'left': 'L', 'right': 'R', 'both': 'B'}

pool = json.load(open('src/pool.json'))
per = {}
for c in pool['clubs']:
    for x in c['pl']:
        per.setdefault(x[5], {'name': x[0], 'main': x[6]})
pos = {r['person_id']: r for r in csv.DictReader(open('data/positions/positions.csv'))}
prio = [r['person_id'] for r in csv.DictReader(open('data/foot/priority.csv'))]
order = prio + sorted((k for k in per if k not in set(prio)), key=lambda k: (per[k]['main'] == 'GK', k))

def jload(f, d):
    p = os.path.join(CACHE, f)
    return json.load(open(p)) if os.path.exists(p) else d
def jsave(f, o):
    json.dump(o, open(os.path.join(CACHE, f), 'w'), ensure_ascii=False)

WD = jload('wd_foot.json', {})          # батч дат → рядки Wikidata
TMP = {k: v for k, v in jload('tm_profiles.json', {}).items() if v.get('dob') and 'err' not in v}     # tm id → {foot, dob, name} або {err}; без дати — перезавантажити

def latin(s):
    s = unicodedata.normalize('NFKD', s.replace('ł', 'l').replace('Ł', 'L'))
    s = ''.join(ch for ch in s if not unicodedata.combining(ch)).lower()
    for a, b in (('shch', 's'), ('sch', 's'), ('ch', 'c'), ('sh', 's'), ('zh', 'j'), ('kh', 'h'), ('ts', 'c'), ('tz', 'c'), ('w', 'v'), ('y', 'i'), ('j', 'i')):
        s = s.replace(a, b)
    return re.sub('[^a-z]', '', s)

def sparql(q, head):
    for a in range(5):
        r = subprocess.run(['curl', '-sS', '-m', '70', 'https://query.wikidata.org/sparql', '--data-urlencode', 'query=' + q,
                            '-H', 'Accept: text/csv', '-H', 'User-Agent: upl30-research/0.1 (football game research)'], capture_output=True, text=True)
        if r.stdout.startswith(head):
            return list(csv.DictReader(io.StringIO(r.stdout)))
        time.sleep(3 + a * 3)
    return None

def wd_tm_ids(dates):
    """дата → [(label, tm_id)] для футболістів з Transfermarkt ID"""
    out = collections.defaultdict(list)
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
        jsave('wd_foot.json', WD)
    for d in dates:
        out[d] = WD.get(d, [])
    return out

MON = {m: i for i, m in enumerate(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 1)}
def tm_profile(tid, tries=3):
    if tid in TMP and not ('err' in TMP[tid] and tries == 3):
        return TMP[tid]
    time.sleep(6)
    r = subprocess.run(['curl', '-sL', '-m', '40', '-A', UA, f'https://www.transfermarkt.com/-/profil/spieler/{tid}'], capture_output=True, text=True)
    h = r.stdout
    txt = re.sub(r'\s+', ' ', re.sub('<[^>]+>', ' ', h))
    m = re.search(r'<title>([^<|]*)', h)
    e = {'name': m.group(1).replace(' - Player profile', '').strip() if m else ''}
    f = re.search(r'Foot: (left|right|both)', txt)
    e['foot'] = f.group(1) if f else ''
    d = re.search(r'Date of birth/Age: (\d{2})/(\d{2})/(\d{4})', txt)
    e['dob'] = f'{d.group(3)}-{d.group(2)}-{d.group(1)}' if d else ''
    if not d:
        d = re.search(r'Date of birth/Age: ([A-Z][a-z]{2}) (\d{1,2}), (\d{4})', txt)
        e['dob'] = f'{d.group(3)}-{MON[d.group(1)]:02d}-{int(d.group(2)):02d}' if d else ''
    if not e['name'] or 'Transfermarkt' not in h:
        if tries > 1:
            time.sleep(90)   # заглушка від частих запитів — пауза й повтор
            return tm_profile(tid, tries - 1)
        e = {'err': f'http/parse ({len(h)} bytes)'}
    TMP[tid] = e
    jsave('tm_profiles.json', TMP)
    return e

rows = {}
# 1) Kaggle Transfermarkt
for pid in order:
    f = (pos.get(pid) or {}).get('foot')
    if f in FOOT:
        tid = pid[3:] if pid.startswith('tm:') else ''
        rows[pid] = dict(person_id=pid, name=per[pid]['name'], foot=FOOT[f], source='transfermarkt (kaggle transfermarkt-datasets)',
                         url=f'https://www.transfermarkt.com/-/profil/spieler/{tid}' if tid else '', note='')
# 2) живий Transfermarkt
need = [pid for pid in order if pid not in rows]
dates = {pid.split(':')[1] for pid in need if pid.startswith('w:') and '-00' not in pid}
cand = wd_tm_ids(dates)
done = 0
for pid in need:
    if done >= LIMIT:
        break
    tids = []
    if pid.startswith('tm:'):
        tids = [(pid[3:], 1.0)]
    else:
        _, d, slug = pid.split(':', 2)
        for label, tid in cand.get(d, []):
            s = difflib.SequenceMatcher(None, latin(slug), latin(label.split(' ')[-1])).ratio() if label else 0
            tids.append((tid, s))
        tids = [t for t in sorted(tids, key=lambda t: -t[1]) if t[1] >= 0.7][:2]
    for tid, score in tids:
        new = tid not in TMP
        e = tm_profile(tid)
        done += new
        if 'err' in e or not e.get('foot'):
            continue
        if pid.startswith('w:') and e.get('dob') != pid.split(':')[1]:
            continue
        if pid.startswith('w:') and difflib.SequenceMatcher(None, latin(pid.split(':', 2)[2]), latin(e['name'].split(' ')[-1])).ratio() < 0.7:
            continue   # та сама дата народження, але інша людина
        rows[pid] = dict(person_id=pid, name=per[pid]['name'], foot=FOOT[e['foot']], source='transfermarkt (profile)',
                         url=f'https://www.transfermarkt.com/-/profil/spieler/{tid}',
                         note=('via wikidata P2446, dob match' if pid.startswith('w:') else '') + f'; tm name: {e["name"]}; checked {datetime.date.today()}')
        break

with open('data/foot/foot.csv', 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=['person_id', 'name', 'foot', 'source', 'url', 'note'])
    w.writeheader()
    for pid in order:
        if pid in rows:
            w.writerow(rows[pid])
g = collections.Counter(r['source'] for r in rows.values())
print('усього в пулі', len(per), 'з ногою', len(rows), dict(g))
pr = list(csv.DictReader(open('data/foot/priority.csv')))
for grp in ('1', '2'):
    ids = [r['person_id'] for r in pr if r['group'] == grp]
    print('група', grp, len(ids), 'з ногою', sum(1 for i in ids if i in rows))
