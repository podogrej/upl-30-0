"""Estimated player clean sheets for seasons without real data (1992/93-2011/12, 2021/22).
Team clean sheets come from full result lists (rsssf / en.wikipedia, checked against final tables).
Split between players (fitted on real 2012+ data):
  goalkeeper: cs = team x min(1, apps/games)                         (MAE 0.67, 89% within +-1)
  outfield:   cs = team x min(1, apps/games)^1.6 x 0.892              (MAE 1.09, 72% within +-1)
Run AFTER positions/inject_positions.py (it overwrites p[8], p[9]). Club-season flag: c['cs_est']=1.
"""
import json
ROOT = '/home/claude/upl-dataset'
pool = json.load(open(f'{ROOT}/game/pool.json'))
team = json.load(open(f'{ROOT}/research_assists/team_cs_map.json'))
n = 0
for c in pool['clubs']:
    key = f"{c['y']}|{c['c']}"
    if key not in team: continue
    games, tcs = team[key]
    filled = False
    for p in c['pl']:
        if p[9] is not None: continue
        share = min(1, (p[3] or 0) / games)
        p[9] = round(tcs * share) if p[6] == 'GK' else round(tcs * share ** 1.6 * 0.892)
        filled = True; n += 1
    if filled: c['cs_est'] = 1
json.dump(pool, open(f'{ROOT}/game/pool.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('estimated clean sheets for', n, 'cards')
