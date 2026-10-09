"""Export current-season UPL appearances for daily-challenge club conditions.

Usage (from repo root): python3 data/current/export_vd.py
Reads data/current/apps_2026.csv, writes lib/vd_current.json: {season, date, apps:{club:{pool_id:apps}}}.
Only players already in the pool; club slugs renamed to the pool's slug for the same club.
"""
import csv, json, os
SEASON, DATE = '2026/27', '2026-10-09'
SAME_CLUB = {'fc-kharkiv': 'metalist-1925'}   # same TM club, renamed in 2026
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
apps = {}
for r in csv.DictReader(open(os.path.join(ROOT, 'data', 'current', 'apps_2026.csv'), encoding='utf-8')):
    if not r['player_id'] or int(r['apps']) < 1:
        continue
    c = SAME_CLUB.get(r['club_slug'], r['club_slug'])
    apps.setdefault(c, {})[r['player_id']] = int(r['apps'])
out = {'season': SEASON, 'date': DATE, 'apps': {c: dict(sorted(v.items())) for c, v in sorted(apps.items())}}
json.dump(out, open(os.path.join(ROOT, 'lib', 'vd_current.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(apps), 'clubs,', sum(len(v) for v in apps.values()), 'players')
