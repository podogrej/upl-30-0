"""Перевірка «позицій з пам'яті» в positions_manual.csv за Transfermarkt.

Рядки, де source = knowledge / own-knowledge / own_knowledge / own (і варіанти з «own-knowledge»), звіряються з профілем
гравця на transfermarkt.com (поля «Main position» / «Other position»).
- id tm:<N>  → профіль N;
- id w:<дата>:<прізвище> → Transfermarkt ID з Wikidata (P2446) серед футболістів з тією ж датою народження (P569) і схожим
  прізвищем латиницею (≥0.7); далі дата народження на профілі мусить збігтися з нашою, прізвище на профілі — схоже (≥0.7).
Second Striker → ST (нападник). Якщо на профілі лише загальна позиція («Midfield») — verdict tm_generic, нічого не міняємо.

Вихід: data/positions/verify_manual_report.csv; з --apply ще й правка positions_manual.csv
(main/alts з TM, conf=tm, source=url профілю) лише для знайдених із збігом дати, і тих самих позицій у src/pool.json
(p[6] main, p[7] alts усіх карток цієї людини — як робить inject_positions.py для ручних рядків).
Запуск з кореня: python3 data/positions/verify_manual.py <тека для кешу> [--apply]
Кеш positions_tm.json (tm id → позиції, дата, ім'я) — можна зупиняти й продовжувати; скрипт ідемпотентний.
"""
import json, csv, os, sys, re, time, subprocess, io, difflib, unicodedata, collections

args = [a for a in sys.argv[1:] if not a.startswith('--')]
CACHE = args[0] if args else '.'
APPLY = '--apply' in sys.argv
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
MANUAL = 'data/positions/positions_manual.csv'
REPORT = 'data/positions/verify_manual_report.csv'
TMPOS = {'Goalkeeper': 'GK', 'Centre-Back': 'CB', 'Left-Back': 'LB', 'Right-Back': 'RB', 'Defensive Midfield': 'CDM',
         'Central Midfield': 'CM', 'Attacking Midfield': 'CAM', 'Left Midfield': 'LM', 'Right Midfield': 'RM',
         'Left Winger': 'LW', 'Right Winger': 'RW', 'Centre-Forward': 'ST', 'Second Striker': 'ST', 'Sweeper': 'CB'}
MON = {m: i for i, m in enumerate(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 1)}


def jload(f, d):
    p = os.path.join(CACHE, f)
    return json.load(open(p)) if os.path.exists(p) else d


def jsave(f, o):
    json.dump(o, open(os.path.join(CACHE, f), 'w'), ensure_ascii=False, indent=0)


WD = jload('wd_foot.json', {})        # дата → [[label, tm_id]] (спільний кеш з data/foot/collect.py)
TMP = jload('positions_tm.json', {})  # tm id → {name, dob, main, other[]} або {err}


def is_memory(src):
    s = src.strip().lower()
    return s in ('knowledge', 'own-knowledge', 'own_knowledge', 'own') or s.startswith('own-knowledge') or s.endswith('+own-knowledge')


def latin(s):
    s = unicodedata.normalize('NFKD', s.replace('ł', 'l').replace('Ł', 'L'))
    s = ''.join(ch for ch in s if not unicodedata.combining(ch)).lower()
    for a, b in (('shch', 's'), ('sch', 's'), ('ch', 'c'), ('sh', 's'), ('zh', 'j'), ('kh', 'h'), ('ts', 'c'), ('tz', 'c'), ('w', 'v'), ('y', 'i'), ('j', 'i')):
        s = s.replace(a, b)
    return re.sub('[^a-z]', '', s)


def sim(a, b):
    return difflib.SequenceMatcher(None, latin(a), latin(b)).ratio()


UK = dict(zip('абвгґдеєжзиіїйклмнопрстуфхцчшщьюя', ['a', 'b', 'v', 'h', 'g', 'd', 'e', 'ie', 'zh', 'z', 'y', 'i', 'i', 'i', 'k', 'l', 'm', 'n', 'o',
                                              'p', 'r', 's', 't', 'u', 'f', 'kh', 'ts', 'ch', 'sh', 'shch', '', 'iu', 'ia']))


def translit(s):
    return ''.join(UK.get(ch, ch) for ch in s.lower().replace("'", '').replace('’', ''))


def name_sim(pid, label):
    """найкраща схожість між словами нашого імені (slug з id + ім'я з пулу латиницею) і словами імені з Wikidata/TM
    (slug іноді — ім'я, а не прізвище: w:…:badr, w:…:chiprian)"""
    ours = {pid.split(':', 2)[2]} | {translit(t) for t in re.split(r'[\s-]+', names.get(pid, '')) if t}
    theirs = [t for t in re.split(r'[\s-]+', label) if len(latin(t)) >= 3]
    return max((sim(a, b) for a in ours for b in theirs if len(latin(a)) >= 3), default=0)


def sparql(q, head):
    for a in range(5):
        r = subprocess.run(['curl', '-sS', '-m', '70', 'https://query.wikidata.org/sparql', '--data-urlencode', 'query=' + q,
                            '-H', 'Accept: text/csv', '-H', 'User-Agent: upl30-research/0.1 (football game research)'], capture_output=True, text=True)
        if r.stdout.startswith(head):
            return list(csv.DictReader(io.StringIO(r.stdout)))
        time.sleep(3 + a * 3)
    return None


def wd_tm_ids(dates):
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


def tm_profile(tid, tries=3):
    if tid in TMP and 'err' not in TMP[tid]:
        return TMP[tid]
    time.sleep(6)
    r = subprocess.run(['curl', '-sL', '-m', '40', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9',
                        f'https://www.transfermarkt.com/-/profil/spieler/{tid}'], capture_output=True, text=True)
    h = r.stdout
    txt = re.sub(r'\s+', ' ', re.sub('<[^>]+>', ' ', h)).replace('&nbsp;', ' ')
    m = re.search(r'<title>([^<|]*)', h)
    e = {'name': m.group(1).replace(' - Player profile', '').strip() if m else ''}
    d = re.search(r'Date of birth/Age: (\d{2})/(\d{2})/(\d{4})', txt)
    e['dob'] = f'{d.group(3)}-{d.group(2)}-{d.group(1)}' if d else ''
    if not d:
        d = re.search(r'Date of birth/Age: ([A-Z][a-z]{2}) (\d{1,2}), (\d{4})', txt)
        e['dob'] = f'{d.group(3)}-{MON[d.group(1)]:02d}-{int(d.group(2)):02d}' if d else ''
    mm = re.search(r'Main position:</dt>\s*<dd[^>]*>([^<]+)</dd>', h)
    e['main'] = mm.group(1).strip() if mm else ''
    om = re.search(r'Other position:</dt>(.*?)</dl>', h, re.S)
    e['other'] = [x.strip() for x in re.findall(r'<dd[^>]*>([^<]+)</dd>', om.group(1))] if om else []
    if not e['main']:   # старі профілі: лише «Position: Attack - Second Striker» або «Position: Midfield»
        p = re.search(r'Position: ([A-Za-z -]+?) (?:Foot|Current club|Former International|Joined|Citizenship|Height)', txt)
        e['main'] = p.group(1).split(' - ')[-1].strip() if p else ''
    if not e['name'] or 'Transfermarkt' not in h or 'Human Verification' in h:
        if tries > 1:
            print('  human verification / порожня сторінка — пауза 90 с', flush=True)
            time.sleep(90)
            return tm_profile(tid, tries - 1)
        e = {'err': f'http/parse ({len(h)} bytes)'}
    TMP[tid] = e
    jsave('positions_tm.json', TMP)
    return e


SEARCH = {k: v for k, v in jload('positions_tm_search.json', {}).items() if all(isinstance(x, list) for x in v)}   # запит → [[slug, tm id]]


def tm_search(q, tries=3):
    """запасний шлях, коли у Wikidata немає Transfermarkt ID: пошук на transfermarkt.com за прізвищем латиницею"""
    if q in SEARCH:
        return SEARCH[q]
    time.sleep(6)
    r = subprocess.run(['curl', '-sL', '-m', '40', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9',
                        'https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=' + q], capture_output=True, text=True)
    h = r.stdout
    if 'Transfermarkt' not in h or 'Human Verification' in h:
        if tries > 1:
            print('  human verification (пошук) — пауза 90 с', flush=True)
            time.sleep(90)
            return tm_search(q, tries - 1)
        return None
    ids = []
    for sl, t in re.findall(r'href="/([a-z0-9-]+)/profil/spieler/(\d+)"', h):
        if [sl, t] not in ids:
            ids.append([sl, t])
    SEARCH[q] = ids[:10]
    jsave('positions_tm_search.json', SEARCH)
    return SEARCH[q]


pool = json.load(open('src/pool.json'))
names = {}
for c in pool['clubs']:
    for x in c['pl']:
        names.setdefault(x[5], x[0])

hdr, allrows = None, []
with open(MANUAL, newline='') as f:
    rd = csv.DictReader(f)
    hdr = rd.fieldnames
    allrows = list(rd)
# список рядків і їхні початкові позиції фіксуються в кеші при першому запуску — повторний запуск після --apply дає той самий звіт
ORIG = jload('positions_orig.json', {})
if not ORIG:
    ORIG = {r['person_id']: [r['main'], r['alts'], r['conf'], r['source']] for r in allrows if is_memory(r['source'])}
    jsave('positions_orig.json', ORIG)
todo = [dict(person_id=k, main=v[0], alts=v[1], conf=v[2], source=v[3]) for k, v in ORIG.items()]
dates = {r['person_id'].split(':')[1] for r in todo if r['person_id'].startswith('w:') and '-00' not in r['person_id']}
wd_tm_ids(dates)

rep = []
for r in todo:
    pid = r['person_id']
    our_alts = (r['alts'] or '').replace(',', ';').replace(' ', '')
    out = dict(person_id=pid, name=names.get(pid, ''), our_main=r['main'], our_alts=our_alts, tm_main='', tm_other='',
               verdict='not_found', new_main='', new_alts='', url='')
    tids = []
    if pid.startswith('tm:'):
        tids = [pid[3:]]
    elif pid.startswith('w:') and '-00' not in pid:
        _, d, slug = pid.split(':', 2)
        c = sorted(((name_sim(pid, lab) if lab else 0, tid) for lab, tid in WD.get(d, [])), reverse=True)
        tids = [tid for s, tid in c if s >= 0.7][:2]
        if not tids:   # кілька варіантів написання прізвища латиницею (Гармаш → harmash / garmash, Чернат → chernat / cernat)
            t = translit(names.get(pid, '').split(' ')[-1]) or slug
            g = t.replace('kh', 'h').replace('h', 'g')
            qs = [t, slug, g, g.replace('y', 'i'), g.replace('ts', 'c').replace('ch', 'c'), re.sub('i$', 'y', t.replace('ie', 'ye')), re.sub('ov$', 'ev', g)]
            for q in dict.fromkeys(q for q in qs if len(q) >= 3):
                tids += [t for sl, t in (tm_search(q) or []) if t not in tids and name_sim(pid, sl.replace('-', ' ')) >= 0.7]
    for tid in tids:
        e = tm_profile(tid)
        if 'err' in e:
            out['verdict'] = 'tm_error'
            continue
        if pid.startswith('w:'):
            if e.get('dob') != pid.split(':')[1] or name_sim(pid, e['name']) < 0.7:
                continue
        out['url'] = f'https://www.transfermarkt.com/-/profil/spieler/{tid}'
        out['tm_main'] = e.get('main', '')
        out['tm_other'] = ', '.join(e.get('other', []))
        main = TMPOS.get(e.get('main', ''))
        if not main:
            out['verdict'] = 'tm_generic'
            break
        alts = []
        for o in e.get('other', []):
            code = TMPOS.get(o)
            if code and code != main and code not in alts:
                alts.append(code)
        out['new_main'], out['new_alts'] = main, ';'.join(alts)
        same = main == r['main'] and set(alts) == set(a for a in our_alts.split(';') if a)
        out['verdict'] = 'ok' if same else 'changed'
        break
    rep.append(out)
    print(pid, out['verdict'], out['tm_main'], '|', out['tm_other'], flush=True)

with open(REPORT, 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rep[0].keys()))
    w.writeheader()
    w.writerows(rep)
print(collections.Counter(x['verdict'] for x in rep))

if APPLY:
    by = {x['person_id']: x for x in rep if x['verdict'] in ('ok', 'changed')}
    for r in allrows:
        x = by.get(r['person_id'])
        if x:
            r['main'], r['alts'], r['conf'], r['source'] = x['new_main'], x['new_alts'], 'tm', x['url']
    with open(MANUAL, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=hdr, lineterminator='\n')
        w.writeheader()
        w.writerows(allrows)
    print('positions_manual.csv: оновлено рядків', len(by))
    # у пул: як inject_positions.py для ручних рядків — p[6] main, p[7] alts (без часток); інші поля карток не чіпаємо
    n = 0
    for c in pool['clubs']:
        for x in c['pl']:
            v = by.get(x[5])
            if v and (x[6], x[7]) != (v['new_main'], v['new_alts']):
                x[6], x[7] = v['new_main'], v['new_alts']
                n += 1
    open('src/pool.json', 'w').write(json.dumps(pool, ensure_ascii=False, separators=(',', ':')))
    print('src/pool.json: змінено карток', n)
