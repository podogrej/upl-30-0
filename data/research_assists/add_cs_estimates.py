"""Оцінка «сухих» матчів гравців для сезонів без реальних даних (1992/93–2011/12, 2021/22).
Командні сухі — з повних протоколів результатів (rsssf / en.wikipedia, звірено з підсумковими таблицями).
Розподіл між гравцями (підібрано на реальних даних 2012+):
  воротар:  сухі = команда × min(1, матчі/ігри)                      (MAE 0.67, 89% у межах ±1)
  польовий: сухі = команда × min(1, матчі/ігри)^1.6 × 0.892           (MAE 1.09, 72% у межах ±1)
Запуск ПІСЛЯ positions/inject_positions.py (той перезаписує p[8], p[9]). Позначка клуб-сезону: c['cs_est']=1.
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
