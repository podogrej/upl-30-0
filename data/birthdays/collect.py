#!/usr/bin/env python3
"""Collect dates of birth for all persons in the UPL player pool.
Stages: pool -> Wikidata (P2446) -> Transfermarkt profile pages -> CSV.
Progress is cached in .cache/*.json, rerun resumes. Usage: python3 collect.py [wd|tm|csv|all]
"""
import csv, glob, json, os, re, subprocess, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
CACHE = os.path.join(HERE, '.cache')
os.makedirs(CACHE, exist_ok=True)
UA = 'Mozilla/5.0 (X11; Linux x86_64) upl-30-0-research'

def load_pool():
    pool = glob.glob(os.path.join(ROOT, 'pool.*.js'))[0]
    js = ("global.window={};require(%s);const P=window.__POOL;const m={};"
          "for(const c of P.clubs)for(const p of c.pl){const i=p[5];const o=m[i]=m[i]||{id:i,name:p[0],apps:0};o.apps+=p[3];}"
          "console.log(JSON.stringify({p:m,alias:P.alias}))" % json.dumps(pool))
    d = json.loads(subprocess.check_output(['node', '-e', js]))
    persons = {}
    for pid, o in d['p'].items():
        tgt = d['alias'].get(pid, pid)
        t = persons.setdefault(tgt, {'id': tgt, 'name': o['name'], 'apps': 0})
        t['apps'] += o['apps']
    return persons

def jload(n, default):
    p = os.path.join(CACHE, n)
    return json.load(open(p)) if os.path.exists(p) else default

def jsave(n, v):
    json.dump(v, open(os.path.join(CACHE, n), 'w'))

def stage_wd(persons):
    wd = jload('wd.json', {})
    ids = [p['id'][3:] for p in persons.values() if p['id'].startswith('tm:') and p['id'][3:] not in wd]
    for i in range(0, len(ids), 150):
        batch = ids[i:i + 150]
        q = ('SELECT ?id ?d ?prec WHERE{VALUES ?id{%s} ?p wdt:P2446 ?id. ?p p:P569 ?s. '
             '?s psv:P569 ?v. ?v wikibase:timeValue ?d; wikibase:timePrecision ?prec.}'
             % ' '.join('"%s"' % b for b in batch))
        url = 'https://query.wikidata.org/sparql?format=json&query=' + urllib.parse.quote(q)
        for attempt in range(5):
            try:
                r = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'upl-30-0-bot/1.0 (andrejpodogrej@gmail.com)'}), timeout=90)
                rows = json.load(r)['results']['bindings']
                break
            except Exception as e:
                print('wd retry', e); time.sleep(5 * (attempt + 1))
        else:
            continue
        for b in batch:
            wd[b] = None
        for row in rows:
            prec = int(row['prec']['value'])
            wd[row['id']['value']] = [row['d']['value'][:10], prec]  # prec 11 = day, 9 = year
        jsave('wd.json', wd)
        print('wd', i + len(batch), '/', len(ids)); time.sleep(1)
    return wd

def tm_fetch(tid):
    req = urllib.request.Request('https://www.transfermarkt.com/x/profil/spieler/' + tid, headers={'User-Agent': UA, 'Accept-Language': 'en'})
    html = urllib.request.urlopen(req, timeout=30).read().decode('utf8', 'replace')
    m = re.search(r'itemprop="birthDate"[^>]*>\s*(\d\d)/(\d\d)/(\d{4})', html)
    return '%s-%s-%s' % (m.group(3), m.group(2), m.group(1)) if m else ''

def stage_tm(persons, wd):
    tm = jload('tm.json', {})
    todo = [p['id'][3:] for p in sorted(persons.values(), key=lambda p: -p['apps'])
            if p['id'].startswith('tm:') and p['id'][3:] not in tm and not (wd.get(p['id'][3:]) and wd[p['id'][3:]][1] >= 11)]
    print('tm todo', len(todo))
    for n, tid in enumerate(todo):
        try:
            tm[tid] = tm_fetch(tid)
        except urllib.error.HTTPError as e:
            if e.code in (429, 403):
                print('blocked', e.code); time.sleep(60); continue
            tm[tid] = ''
        except Exception as e:
            print('err', tid, e); time.sleep(5); continue
        if n % 25 == 0:
            jsave('tm.json', tm); print('tm', n, '/', len(todo), flush=True)
        time.sleep(1.1)
    jsave('tm.json', tm)
    return tm

def stage_csv(persons, wd, tm):
    rows = []
    for p in sorted(persons.values(), key=lambda p: -p['apps']):
        pid = p['id']; dob = src = note = ''; conf = ''
        if pid.startswith('w:'):
            dob = pid.split(':')[1]; src = 'pool'
            conf = 'low' if dob.endswith('-00') or dob.endswith('-00-00') else 'high'
            if conf == 'low': note = 'partial date in id'
        else:
            tid = pid[3:]; w = wd.get(tid); t = tm.get(tid, '')
            wdate = w[0] if w and w[1] >= 11 else ''
            if wdate and t:
                dob, src, conf = wdate, 'wikidata+transfermarkt', 'high'
                if wdate != t: conf, note = 'low', 'conflict wikidata %s vs tm %s' % (wdate, t)
            elif wdate: dob, src, conf = wdate, 'wikidata', 'high'
            elif t: dob, src, conf = t, 'transfermarkt', 'high'
            elif w: dob, src, conf, note = w[0][:4], 'wikidata', 'low', 'year only'
        rows.append([pid, p['name'], dob, src, conf, note, p['apps']])
    with open(os.path.join(HERE, 'player_birthdays.csv'), 'w', newline='', encoding='utf8') as f:
        wr = csv.writer(f); wr.writerow(['person_id', 'name_uk', 'date_of_birth', 'source', 'confidence', 'note', 'upl_apps'])
        wr.writerows(rows)
    return rows

if __name__ == '__main__':
    st = sys.argv[1] if len(sys.argv) > 1 else 'all'
    persons = load_pool(); print('persons', len(persons))
    wd = stage_wd(persons) if st in ('wd', 'tm', 'all') else jload('wd.json', {})
    tm = stage_tm(persons, wd) if st in ('tm', 'all') else jload('tm.json', {})
    rows = stage_csv(persons, wd, tm)
    print('exact', sum(1 for r in rows if len(r[2]) == 10 and r[4] == 'high'))
