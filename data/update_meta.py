"""pool['meta']: pool counters computed from the data itself (previously maintained by hand and drifted).
Run from repo root: python3 data/update_meta.py   (after any script that adds cards or aliases). Idempotent.
club_seasons: club-seasons; players: cards (player-seasons); person_ids: distinct ids; persons: distinct people (ids resolved
through pool['alias']); aliases: alias count. Fields names/positions (version notes) are left as is. The game does not read meta.
"""
import json, os
POOL = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'pool.json')
raw = open(POOL, encoding='utf-8').read()
pool = json.loads(raw)
alias = pool.get('alias', {})
ids = {p[5] for c in pool['clubs'] for p in c['pl']}
m = pool['meta']
m.update(club_seasons=len(pool['clubs']), players=sum(len(c['pl']) for c in pool['clubs']), persons=len({alias.get(i, i) for i in ids}),
         person_ids=len(ids), aliases=len(alias))
out = json.dumps(pool, ensure_ascii=False, separators=(',', ':'))
if out != raw: open(POOL, 'w', encoding='utf-8').write(out)
print('meta:', {k: v for k, v in m.items() if isinstance(v, int)}, '| src/pool.json', 'змінено' if out != raw else 'без змін')
