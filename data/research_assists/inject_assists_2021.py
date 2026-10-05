"""Writes 2021/22 assists (assists_2021_more.csv) into src/pool.json: field p[8] of 2021 club-season players.
Run from repo root: python3 data/research_assists/inject_assists_2021.py
Then: python3 src/build.py && node tools/make_engine.js
Idempotent: rows whose cards data/fix_2021/fix_pool_2021.py reassigned to another person (REPLACED) are skipped;
fix_pool_2021.py sets assists for those cards itself.
The Chornomorets row for tm:539448 was corrected per sports.ru (see data/fixes/fix_pool_054.py).
"""
import json, os
D = os.path.dirname(os.path.abspath(__file__))
POOL = os.path.join(D, '..', '..', 'src', 'pool.json')
rows = [l.split(';') for l in open(os.path.join(D, 'assists_2021_more.csv'), encoding='utf-8').read().splitlines()[1:]]
ast = {}
for pid, name, club, *_ , a, cs, url, conf in [(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]) for r in rows]:
    key = (club, pid, name)
    assert key not in ast, key
    ast[key] = int(a)
pool = json.load(open(POOL, encoding='utf-8'))
done = set()
for c in pool['clubs']:
    if c['y'] != 2021: continue
    for p in c['pl']:
        key = (c['c'], p[5], p[0])
        if key not in ast:  # id may have changed after duplicate merge (names/merged_ids.csv): fall back to name within the club
            same = [k for k in ast if k[0] == c['c'] and k[2] == p[0]]
            key = same[0] if len(same) == 1 else key
        if key in ast:
            p[8] = ast[key]; done.add(key)
    if any(k[0] == c['c'] for k in ast):
        assert all(p[8] is not None for p in c['pl']), c['c']
REPLACED = {('desna-chernihiv', 'tm:49016', 'Євген Паст'), ('kolos-kovalivka', 'tm:463845', 'Олександр Демченко')}   # fix_pool_2021.py
missing = set(ast) - done - REPLACED
assert not missing, missing
json.dump(pool, open(POOL, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('assists written:', len(done))
