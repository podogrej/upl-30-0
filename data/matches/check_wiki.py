"""Cross-check TM-derived club-season totals (games, GF, GA) against uk.wikipedia standings tables.

Usage (from repo root): python3 data/matches/check_wiki.py <dir with w_<year>.html>
Prints seasons whose multiset of (games, gf, ga) differs from the Wikipedia top-flight table.
"""
import re, sys, csv, html, collections, os

W = sys.argv[1]
agg = collections.defaultdict(lambda: collections.defaultdict(lambda: [0, 0, 0]))
for r in csv.DictReader(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'upl_matches.csv'), encoding='utf-8')):
    if r['home_goals'] == '' or r['season'] == '1992':
        continue
    y = r['season'][:4]
    for t, a, b in ((r['home_slug'], r['home_goals'], r['away_goals']), (r['away_slug'], r['away_goals'], r['home_goals'])):
        x = agg[y][t]; x[0] += 1; x[1] += int(a); x[2] += int(b)

def wiki(y):
    t = open(os.path.join(W, 'w_%s.html' % y), encoding='utf-8').read()
    t = re.sub(r"data-mw='[^']*'", '', t)
    res = []
    for m in re.finditer(r'<table class="wikitable".*?</table>', t, re.S):
        rows = re.findall(r'<tr.*?</tr>', m.group(0), re.S)
        cells = [[html.unescape(re.sub(r'<[^>]+>', '', c)).strip() for c in re.findall(r'<t[dh].*?</t[dh]>', r, re.S)] for r in rows]
        txt = ' '.join(cells[0]) if cells else ''
        if 'Команда' in txt and ('І' in cells[0] or 'Ігри' in cells[0]) and 'О' in cells[0]:
            for c in cells[1:]:
                g = [x for x in c if re.fullmatch(r'\d+\s*[-−–:]\s*\d+', x)]
                if len(c) >= 8 and g:
                    nums = [x for x in c if x.isdigit()]
                    gf, ga = re.split(r'\s*[-−–:]\s*', g[0])
                    res.append((int(nums[1]) if len(nums) > 1 else 0, int(gf), int(ga)))
            return res
    return res

for y in sorted(agg):
    if y == '2026':
        continue
    w = collections.Counter(wiki(y)); a = collections.Counter(tuple(v) for v in agg[y].values())
    if w != a:
        print(y, 'wiki-only', sorted((w - a).elements()), 'tm-only', sorted((a - w).elements()))
    else:
        print(y, 'OK')
