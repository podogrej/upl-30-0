"""Writes preferred foot into src/pool.json as a separate dict "foot": {person_id: "L"|"R"|"B"} (player cards unchanged).
Source: data/foot/foot.csv (every row has source and url). Run from repo root: python3 data/foot/inject.py
"""
import json, csv
pool = json.load(open('src/pool.json'))
ids = {x[5] for c in pool['clubs'] for x in c['pl']}
foot = {r['person_id']: r['foot'] for r in csv.DictReader(open('data/foot/foot.csv')) if r['foot'] in ('L', 'R', 'B') and r['person_id'] in ids}
pool['foot'] = dict(sorted(foot.items()))
open('src/pool.json', 'w').write(json.dumps(pool, ensure_ascii=False, separators=(',', ':')))
print('foot:', len(foot), 'з', len(ids), {k: list(foot.values()).count(k) for k in 'LRB'})
