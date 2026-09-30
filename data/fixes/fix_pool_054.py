"""Виправлення пулу 0.54 «порядок у даних» (аудит 30.09, В10–В11). Повторний запуск нічого не змінює.
Запуск з кореня репозиторію: python3 data/fixes/fix_pool_054.py
Далі: python3 data/aliases/apply.py && python3 data/update_meta.py && python3 data/check_pool.py && python3 src/build.py && node tools/make_engine.js

Правила (DECISIONS п. 7): id не змінюються і не зникають. Картка, яку етап 3 прив'язав не до тієї людини, отримує id справжньої людини
(як у data/fix_2021/fix_pool_2021.py). Картки не переставляються й не додаються — ключі pool_ratings_raw.json («рік|клуб|індекс») ті самі,
сирий рейтинг картки (етап 4, за статистикою сезону) не змінюється; підсумковий рейтинг — data/ratings/smooth_cameo.smoothed()
(згладжування камео залежить від того, чия картка).

1. Чорноморець 2021/22: «Данило Алефіренко» (tm:755174, 1 М) — на sports.ru у Чорноморці 2021/22 «Даниил Сухоручко» (1 М, 4 хв),
   а Алефіренко — у Зорі (1 М, 1 хв; та картка правильна). → Даниїл Сухоручко, tm:539448, ST (позиція — як у інших його картках).
2. Нива (Вінниця) 1993/94: «Дмитро Михайленко» (лінія GK, основна CDM, 13 М) — у сирому рядку uk-вікі це «Циганков Віталій Вікторович»,
   воротар, 13 М, 23 пропущені (data/data_v2/ratings_player_seasons.csv); Михайленко того сезону зіграв 32 М за Дніпро.
   → Віталій Циганков, tm:774009 (Transfermarkt: «Циганков Віталій Вікторович», 13.08.1973, воротар), GK. Сухі — формула воротаря
   з data/research_assists/add_cs_estimates.py.
3. Порожня основна позиція (4 картки з 1 матчем) — з data/positions/positions_manual.csv (Transfermarkt, 30.09.2026).
4. Громадянство: у 9 людей одна картка 2011/12 мала -1 (невідоме; ru-рядок, злитий через names/merged_ids.csv), решта — одна країна
   → ставимо ту саму країну.
5. Рік народження дублів (data/aliases/aliases.csv), де джерело помилилося роком: Гармаш 1980 → 1990, Ізворану 1983 → 1982 (Transfermarkt).
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

# картка: [ім'я, лінія, рейтинг, матчі, голи, person_id, основна, додаткові, асисти, сухі, громадянство, рік народження]
REASSIGN = [   # (рік, клуб, (ім'я, id) до виправлення, нові поля {індекс: значення})
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

    # 1–2. картка не тієї людини
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
            if key in cs_map:   # сухі — як add_cs_estimates.py (клуб-сезон з оцінкою сухих)
                games, tcs = cs_map[key]; share = min(1, (p[3] or 0) / games)
                p[9] = round(tcs * share) if p[6] == 'GK' else round(tcs * share ** 1.6 * 0.892)
            log.append(f'{y} {club}: {before[0]} ({before[1]}) → {p[0]} ({p[5]}), {p[6]}, сухі {p[9]}')

    # 3. порожня основна позиція ← positions_manual.csv
    man = {r['person_id']: r for r in csv.DictReader(open(MANUAL, encoding='utf-8', newline=''))}
    for c in pool['clubs']:
        for p in c['pl']:
            if not p[6]:
                r = man.get(p[5])
                assert r and r['main'], f'{c["y"]} {c["c"]} {p[0]} {p[5]}: немає рядка в positions_manual.csv'
                p[6], p[7] = r['main'], (r['alts'] or '').replace(',', ';').replace(' ', '')
                log.append(f'{c["y"]} {c["c"]}: {p[0]} — основна позиція {p[6]} ({r["source"]})')

    # 4. громадянство: -1 на одній картці, а решта карток людини — одна країна
    nat = defaultdict(Counter)
    for c in pool['clubs']:
        for p in c['pl']: nat[p[5]][p[10]] += 1
    for c in pool['clubs']:
        for p in c['pl']:
            known = [n for n in nat[p[5]] if n != -1]
            if p[10] == -1 and len(known) == 1:
                p[10] = known[0]
                log.append(f'{c["y"]} {c["c"]}: {p[0]} — громадянство {pool["nats"][known[0]]}')

    # 5. рік народження дубля
    for c in pool['clubs']:
        for p in c['pl']:
            if p[5] in BIRTH_YEAR and p[11] != BIRTH_YEAR[p[5]]:
                log.append(f'{c["y"]} {c["c"]}: {p[0]} ({p[5]}) — рік народження {p[11]} → {BIRTH_YEAR[p[5]]}')
                p[11] = BIRTH_YEAR[p[5]]

    # рейтинг: згладжування камео після зміни «чия картка» — лише для карток зачеплених людей
    sm = SC.smoothed(pool, raw)
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
