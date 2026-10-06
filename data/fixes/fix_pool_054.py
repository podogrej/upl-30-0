"""Pool data fixes (audit 2026-09-30, items V10-V11). Idempotent.
Run from repo root: python3 data/fixes/fix_pool_054.py
Then: python3 data/aliases/apply.py && python3 data/update_meta.py && python3 data/check_pool.py && python3 src/build.py && node tools/make_engine.js

Rules (DECISIONS #7): ids never change or disappear. A card that stage 3 attached to the wrong person gets the real person's id
(as in data/fix_2021/fix_pool_2021.py). Cards are not reordered or added, so pool_ratings_raw.json keys ("year|club|index") stay the same
and the raw card rating (stage 4, from season stats) is unchanged; the final rating comes from data/ratings/smooth_cameo
(cameo smoothing depends on whose card it is).

1. Chornomorets 2021/22: card tm:755174 (Alefirenko, 1 app) is actually Daniil Sukhoruchko on sports.ru (1 app, 4 min);
   Alefirenko played for Zorya that season (that card is correct). -> tm:539448, ST (position as on his other cards).
2. Nyva Vinnytsia 1993/94: card w:1973-07-13:mihailenko (line GK, main CDM, 13 apps): the raw uk-wiki row is goalkeeper Vitaliy Tsyhankov,
   13 apps, 23 conceded (data/data_v2/ratings_player_seasons.csv); Mykhailenko played 32 apps for Dnipro that season.
   -> tm:774009 (Transfermarkt: born 1973-08-13, goalkeeper), GK. Clean sheets use the goalkeeper formula
   from data/research_assists/add_cs_estimates.py.
3. Empty main position (4 cards with 1 app): taken from data/positions/positions_manual.csv (Transfermarkt).
4. Citizenship: 9 people had -1 (unknown) on one 2011/12 card (ru row merged via names/merged_ids.csv) while all other cards
   agree on one country -> use that country.
5. Birth year of duplicates (data/aliases/aliases.csv) where the source had the wrong year: harmash 1980 -> 1990, izvoranu 1983 -> 1982 (Transfermarkt).
"""
import csv, json, os, sys
from collections import defaultdict, Counter

D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(D, '..', '..')
POOL = os.path.join(ROOT, 'src', 'pool.json')
RAW = os.path.join(ROOT, 'data', 'ratings', 'pool_ratings_raw.json')
MANUAL = os.path.join(ROOT, 'data', 'positions', 'positions_manual.csv')
CS_MAP = os.path.join(ROOT, 'data', 'research_assists', 'team_cs_map.json')
sys.path.insert(0, os.path.join(ROOT, 'data', 'ratings'))
import smooth_cameo as SC

# card: [name, line, rating, apps, goals, person_id, main, alts, assists, clean_sheets, nat, birth_year]
REASSIGN = [   # (year, club, (name, id) before fix, new fields {index: value})
    (2021, 'chornomorets-odesa', ('Данило Алефіренко', 'tm:755174'),
     {0: 'Даниїл Сухоручко', 1: 'FW', 5: 'tm:539448', 6: 'ST', 7: '', 10: 0, 11: 2000}),
    (1993, 'nyva-vinnytsia', ('Дмитро Михайленко', 'w:1973-07-13:mihailenko'),
     {0: 'Віталій Циганков', 1: 'GK', 5: 'tm:774009', 6: 'GK', 7: '', 10: 0, 11: 1973}),
]
BIRTH_YEAR = {'w:1980-04-19:harmash': 1990, 'w:1983-12-03:izvoranu': 1982}


def main():
    raw_txt = open(POOL, encoding='utf-8').read()
    pool = json.loads(raw_txt)
    raw = json.load(open(RAW, encoding='utf-8'))
    cs_map = json.load(open(CS_MAP, encoding='utf-8'))
    log = []
    touched_pids = set()

    # 1-2. card belongs to another person
    for y, club, before, new in REASSIGN:
        cl = [c for c in pool['clubs'] if c['y'] == y and c['c'] == club]
        assert len(cl) == 1, (y, club)
        cl = cl[0]
        after = (new[0], new[5])
        hit = [i for i, p in enumerate(cl['pl']) if (p[0], p[5]) in (before, after)]
        assert len(hit) == 1, (y, club, before, hit)
        p = cl['pl'][hit[0]]
        if (p[0], p[5]) == before:
            touched_pids |= {before[1], new[5]}
            for k, v in new.items(): p[k] = v
            key = f'{y}|{club}'
            if key in cs_map:   # clean sheets as in add_cs_estimates.py (club-season with estimated clean sheets)
                games, tcs = cs_map[key]; share = min(1, (p[3] or 0) / games)
                p[9] = round(tcs * share) if p[6] == 'GK' else round(tcs * share ** 1.6 * 0.892)
            log.append(f'{y} {club}: {before[0]} ({before[1]}) → {p[0]} ({p[5]}), {p[6]}, сухі {p[9]}')

    # 3. empty main position <- positions_manual.csv
    man = {r['person_id']: r for r in csv.DictReader(open(MANUAL, encoding='utf-8', newline=''))}
    for c in pool['clubs']:
        for p in c['pl']:
            if not p[6]:
                r = man.get(p[5])
                assert r and r['main'], f'{c["y"]} {c["c"]} {p[0]} {p[5]}: немає рядка в positions_manual.csv'
                p[6], p[7] = r['main'], (r['alts'] or '').replace(',', ';').replace(' ', '')
                log.append(f'{c["y"]} {c["c"]}: {p[0]} — основна позиція {p[6]} ({r["source"]})')

    # 4. citizenship: -1 on one card while the person's other cards agree on one country
    nat = defaultdict(Counter)
    for c in pool['clubs']:
        for p in c['pl']: nat[p[5]][p[10]] += 1
    for c in pool['clubs']:
        for p in c['pl']:
            known = [n for n in nat[p[5]] if n != -1]
            if p[10] == -1 and len(known) == 1:
                p[10] = known[0]
                log.append(f'{c["y"]} {c["c"]}: {p[0]} — громадянство {pool["nats"][known[0]]}')

    # 5. duplicate's birth year
    for c in pool['clubs']:
        for p in c['pl']:
            if p[5] in BIRTH_YEAR and p[11] != BIRTH_YEAR[p[5]]:
                log.append(f'{c["y"]} {c["c"]}: {p[0]} ({p[5]}) — рік народження {p[11]} → {BIRTH_YEAR[p[5]]}')
                p[11] = BIRTH_YEAR[p[5]]

    # rating: re-run cameo smoothing after ownership changes; only touched people's cards may change
    sm = SC.final(pool, raw)   # final rating (smoothing + ratings v2)
    for c in pool['clubs']:
        for i, p in enumerate(c['pl']):
            k = SC.key(c, i)
            if sm[k] == p[2]: continue
            if p[5] not in touched_pids:
                sys.exit(f'smooth_cameo розходиться з пулом на чужій картці {k} {p[0]}: {p[2]} → {sm[k]}')
            log.append(f'{k} {p[0]}: рейтинг {p[2]} → {sm[k]}')
            p[2] = sm[k]

    out = json.dumps(pool, ensure_ascii=False, separators=(',', ':'))
    if out != raw_txt: open(POOL, 'w', encoding='utf-8').write(out)
    print('src/pool.json:', 'змінено' if out != raw_txt else 'без змін')
    for l in log: print('  ' + l)


if __name__ == '__main__':
    main()
