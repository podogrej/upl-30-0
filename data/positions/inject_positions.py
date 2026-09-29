"""Injects positions (main + alts) and extra stats (assists, clean sheets) into game/pool.json.

Card layout: [name, group, rating, apps, goals, person_id, main, alts, assists|null, clean_sheets|null]
Alts from TM lineups (share-based) are kept only if share * career apps >= MIN_ALT_APPS;
manual alts (positions_manual.csv, no share) are kept as they are.
"""
import json, csv, sys, collections
import pandas as pd

ROOT = '/home/claude/upl-dataset'
MIN_ALT_APPS = 10

pool = json.load(open(f'{ROOT}/game/pool.json'))

# positions
pos = {}
for r in csv.DictReader(open(f'{ROOT}/positions/positions.csv')):
    pos[r['person_id']] = (r['main'], r['alts'] or '', 'auto')
for r in csv.DictReader(open(f'{ROOT}/positions/positions_manual.csv')):
    alts = (r['alts'] or '').replace(',', ';').replace(' ', '')
    pos[r['person_id']] = (r['main'], alts, 'manual')

# career apps per person (from pool itself)
career = collections.Counter()
for c in pool['clubs']:
    for p in c['pl']:
        career[p[5]] += p[3] or 0

# assists / clean sheets per (season, club, person)
ps = pd.read_csv(f'{ROOT}/data_v2/ratings_player_seasons.csv', low_memory=False)
extra = {}
for r in ps.itertuples(index=False):
    if pd.notna(r.assists) or pd.notna(r.clean_sheets):
        extra[(int(r.season), r.canonical_id, r.person_id)] = (
            None if pd.isna(r.assists) else int(r.assists),
            None if pd.isna(r.clean_sheets) else int(r.clean_sheets))

dropped = kept = 0; n_extra = 0
for c in pool['clubs']:
    for p in c['pl']:
        pid = p[5]
        main, alts, src = pos.get(pid, (p[6] if len(p) > 6 else p[1], p[7] if len(p) > 7 else '', 'pool'))
        if src == 'auto' and alts:
            out = []
            for t in alts.split(';'):
                if not t: continue
                code, _, sh = t.partition(':')
                share = float(sh) if sh else 0.2
                if share * career[pid] >= MIN_ALT_APPS: out.append(t); kept += 1
                else: dropped += 1
            alts = ';'.join(out)
        a, cs = extra.get((c['y'], c['c'], pid), (None, None))
        if a is not None or cs is not None: n_extra += 1
        p[6:10] = [main, alts, a, cs]   # 10+ (nat, birth year) — з add_nat_dob.py

json.dump(pool, open(f'{ROOT}/game/pool.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'alts kept {kept}, dropped {dropped}; cards with assists/cs: {n_extra}')
