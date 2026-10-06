"""Fixes for 2021/22 pool errors (see data/research_assists/assists_2021_more_report.md, section on issues found in our pool).
Run from repo root: python3 data/fix_2021/fix_pool_2021.py   (then python3 src/build.py && node tools/make_engine.js)
Idempotent (cards are located both before and after the fix).

Source: sports.ru 2021/22 club pages (data/research_assists/sportsru_2021_clubs.json) and player profiles
(date of birth, citizenship, role: https://www.sports.ru/football/person/<slug>/).

Rules (DECISIONS #7): player ids, club codes and seasons never change. No existing person_id disappears from the pool:
only the card's owner changes (the old id stays on that person's other cards).
New cards are appended to the END of the club list, so pool_ratings_raw.json keys ("year|club|index") do not shift.
New ids follow the stage 3 rule (build_stage3.py): w:<date of birth>:<alphabetically first name key of the ru record>.

Rating: stage 4 formula (recompute_2021.py) on the corrected season -> round -> (stretch_top only for 90+, not needed here)
-> pool_ratings_raw.json -> smooth_cameo (imported, not copied) for changed cards and for cards of the same people whose
smoothing reference changed (so a rerun of smooth_cameo.py changes nothing).
"""
import json, os, re, sys, unicodedata

D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, D)
import recompute_2021 as RC
sys.path.insert(0, os.path.join(D, '..', 'ratings'))
import smooth_cameo as SC   # final(pool, raw): the same formula data/ratings/smooth_cameo.py writes

POOL, RAW = RC.POOL, RC.RAW
Y = 2021
DUMP = dict(ensure_ascii=False, separators=(',', ':'))

# ---- new person id, as in stage 3 (build_stage3.py: translit/skeleton/name_keys, lang='ru') ----
CYR = {'а': 'a', 'б': 'b', 'в': 'v', 'г': 'h', 'ґ': 'g', 'д': 'd', 'е': 'e', 'є': 'e', 'ж': 'zh', 'з': 'z', 'и': 'y', 'і': 'i', 'ї': 'i', 'й': 'i',
       'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch',
       'ш': 'sh', 'щ': 'shch', 'ь': '', 'ю': 'iu', 'я': 'ia', 'ы': 'y', 'э': 'e', 'ё': 'e', 'ъ': '', "'": '', 'ʼ': '', '’': ''}
COMMON_FIRST = set("oleksandr aleksandr andri andrei serhi serhei sergei volodimir vladimir oleh oleg ihor igor iuri mikola nikolai dmitro dmitri ievhen evheni evgeni maksim denis artem vitali roman ruslan pavlo pavel taras viktor vasil anatoli valeri kostiantin konstantin oleksi aleksei iaroslav bohdan bogdan mihailo mihail ivan anton stanislav vladislav vladyslav oleksii valentin vadim vacheslav viacheslav iehor egor illia ilia danilo daniil kirilo kirill mikita nikita vitalii heorhi georgi grigori hrihori eduard leonid boris petro piotr fedir fedor iakiv semen tymur timur marian nazar bohdan ostap orest".split())


def skeleton(s):
    s = ''.join(CYR.get(ch, ch) for ch in str(s).lower()); s = unicodedata.normalize('NFKD', s)
    s = re.sub(r'[^a-z]', '', ''.join(c for c in s if not unicodedata.combining(c)))
    for a, b in [('kh', 'h'), ('shch', 'sch'), ('zh', 'j'), ('ii', 'i'), ('iy', 'i'), ('yi', 'i'), ('y', 'i'), ('ie', 'e')]: s = s.replace(a, b)
    return re.sub(r'(.)\1', r'\1', s)


def mint_id(name_ru, dob):
    toks = name_ru.split(); keys = {skeleton(toks[0])} | {skeleton(t) for t in toks[1:] if len(skeleton(t)) >= 4 and skeleton(t) not in COMMON_FIRST}
    keys = {k for k in keys if len(k) >= 3} or keys
    return f"w:{dob}:{sorted(keys)[0]}"


# ---- fixes: (club, how to find the card before the fix, card after the fix) ----
# card: [name, line, rating, apps, goals, person_id, main, alts, assists, clean_sheets, nat, birth_year]
PAVLOVETS = mint_id('Александр Павловец', '1996-08-13')      # sports.ru: 1996-08-13, Belarus, defender
VYUNNYK = mint_id('Богдан Вьюнник', '2002-05-21')            # 2002-05-21, Ukraine, forward
SVITIUKHA = mint_id('Денис Свитюха', '2002-02-08')           # 2002-02-08, Ukraine, forward
TURBAIEVSKYI = mint_id('Никита Турбаевский', '2002-03-12')   # 2002-03-12, Ukraine, goalkeeper
FIXES = [
    # 1. Desna: the tm:49016 card (15 apps) is defender Selin (sports.ru: 15 apps, 0 goals, 0 assists).
    #    sports.ru lists no Past at Desna 2021/22 (goalkeepers: 13 + 5 apps), so no separate card for him.
    #    Position/citizenship/year from Selin's other cards (tm:59442) and positions.csv.
    dict(club='desna-chernihiv', find=('Євген Паст', 'tm:49016'),
         card=['Євген Селін', 'DF', None, 15, 0, 'tm:59442', 'LB', 'CB:0.64', 0, None, 0, 1988]),
    # 2. Veres: the Makhniev card (8 apps, 1 goal) is Klots (8 apps, 1 goal, 0 assists), tm:294188.
    dict(club='veres-rivne', find=('Дмитро Махнєв', 'w:1996-00-00:dmitri'),
         card=['Дмитро Кльоц', 'MF', None, 8, 1, 'tm:294188', 'CM', '', 0, None, 0, 1996]),
    #    The real Makhniev (4 apps, 0 goals; profile: 1996-03-02, defender) keeps id w:1996-00-00:dmitri (names/positions refer to him).
    dict(club='veres-rivne', find=None,
         card=['Дмитро Махнєв', 'DF', None, 4, 0, 'w:1996-00-00:dmitri', 'CB', '', 0, None, 0, 1996]),
    # 3. Chornomorets: Dolhov has 0 goals (2 apps); add Kravchenko (12 apps, 1 goal, 0 assists;
    #    profile 1983-04-24 = tm:59076, same positions as his other cards). Club goal total stays 20.
    dict(club='chornomorets-odesa', find=('Петро Долгов', 'w:2000-00-00:dolhov'),
         card=['Петро Долгов', 'MF', None, 2, 0, 'w:2000-00-00:dolhov', 'CM', '', 0, None, 0, 2000]),
    dict(club='chornomorets-odesa', find=None,
         card=['Сергій Кравченко', 'MF', None, 12, 1, 'tm:59076', 'CM', 'CDM:0.18;CAM:0.06', 0, None, 0, 1983]),
    # 5. Kolos: the tm:463845 card (11 apps) is Pavlovets (11 apps, 0 goals, 0 assists).
    #    The same id at Oleksandriya (14 apps) is genuine and untouched. Pavlovets was not in the pool -> new id.
    dict(club='kolos-kovalivka', find=('Олександр Демченко', 'tm:463845'),
         card=['Олександр Павловець', 'DF', None, 11, 0, PAVLOVETS, 'CB', '', 0, None, 20, 1996]),
    # 6. Metalist 1925: add goalkeeper Shelikhov (1 app, 2 conceded; profile 1989-06-23 = tm:58972).
    dict(club='metalist-1925', find=None,
         card=['Денис Шеліхов', 'GK', None, 1, 0, 'tm:58972', 'GK', '', 0, None, 0, 1989]),
    # 7. Mariupol: stage 3 merged several ru records without exact dob into one id each (Bohdan 2002, Denys 2002, tm:882227),
    #    and pool assembly kept the row with more apps under the wrong name.
    #    The Potalov card (11 apps, 1 goal) is Viunnyk (11 apps, 1 goal, 1 assist) -> new id; the real Potalov (1 app) gets a separate card.
    dict(club='mariupol', find=('Богдан Поталов', 'w:2002-00-00:bohdan'),
         card=["Богдан В'юнник", 'FW', None, 11, 1, VYUNNYK, 'ST', '', 1, None, 0, 2002]),
    dict(club='mariupol', find=None,
         card=['Богдан Поталов', 'DF', None, 1, 0, 'w:2002-00-00:bohdan', 'CB', '', 0, None, 0, 2002]),
    #    The Kuzyk card (9 apps, 1 goal) is Svitiukha (9 apps, 1 goal, 0 assists). Kuzyk played for Chornomorets in 2021/22 (14 apps); that card is correct.
    dict(club='mariupol', find=('Денис Кузик', 'tm:723621'),
         card=['Денис Світюха', 'FW', None, 9, 1, SVITIUKHA, 'ST', '', 0, None, 0, 2002]),
    #    The Kozytskyi card (goalkeeper, 6 apps) is Turbaievskyi (goalkeeper, 6 apps, 15 conceded) -> new id;
    #    the real Kozytskyi (outfield, 1 app) gets a separate card with his id tm:882227 (position from positions.csv).
    dict(club='mariupol', find=('Микита Козицький', 'tm:882227'),
         card=['Микита Турбаєвський', 'GK', None, 6, 0, TURBAIEVSKYI, 'GK', '', 0, None, 0, 2002]),
    dict(club='mariupol', find=None,
         card=['Микита Козицький', 'MF', None, 1, 0, 'tm:882227', 'RW', '', 0, None, 0, 2002]),
]


def locate(cl, fx):
    """card index: after the fix (same id and name) or before it (fx['find'])."""
    new = fx['card']
    hit = [i for i, p in enumerate(cl['pl']) if p[5] == new[5] and p[0] == new[0]]
    if not hit and fx['find']:
        hit = [i for i, p in enumerate(cl['pl']) if (p[0], p[5]) == fx['find']]
    assert len(hit) <= 1, (cl['c'], new[0], hit)
    return hit[0] if hit else None


def main():
    pool = json.load(open(POOL, encoding='utf-8')); raw = json.load(open(RAW, encoding='utf-8'))
    before = json.dumps(pool, **DUMP); raw_before = json.dumps(raw, separators=(',', ':'))
    clubs = {c['c']: c for c in pool['clubs'] if c['y'] == Y}
    cs_map = json.load(open(os.path.join(RC.ROOT, 'data', 'research_assists', 'team_cs_map.json'), encoding='utf-8'))
    all_ids = {p[5] for c in pool['clubs'] for p in c['pl']}
    for pid in (PAVLOVETS, VYUNNYK, SVITIUKHA, TURBAIEVSKYI):   # a new id must not collide with someone else's
        owners = {p[0] for c in pool['clubs'] for p in c['pl'] if p[5] == pid}
        assert owners <= {"Олександр Павловець", "Богдан В'юнник", 'Денис Світюха', 'Микита Турбаєвський'}, (pid, owners)

    touched, old_pids = [], set()
    for fx in FIXES:
        cl = clubs[fx['club']]; i = locate(cl, fx); card = list(fx['card'])
        if fx['find'] and i is None: raise SystemExit(f"не знайдено картку {fx['find']} у {fx['club']}")
        if i is None:
            cl['pl'].append(card); i = len(cl['pl']) - 1; raw[f"{Y}|{cl['c']}|{i}"] = None
        else:
            old_pids.add(cl['pl'][i][5]); card[2] = cl['pl'][i][2]; cl['pl'][i] = card
        # clean sheets estimated as in add_cs_estimates.py (2021 club-seasons have cs_est=1)
        games, tcs = cs_map[f"{Y}|{cl['c']}"]; share = min(1, card[3] / games)
        card[9] = round(tcs * share) if card[6] == 'GK' else round(tcs * share ** 1.6 * 0.892)
        touched.append((cl['c'], i))

    # ---- rating: stage 4 formula on the corrected season ----
    rt = RC.compute(pool)
    for c, i in touched:
        r = int(round(rt[(c, i)]))
        assert r < 90, f'{c}/{i}: {r} ≥ 90 — потрібен stretch_top за квотами всієї бази, вручну не ставимо'
        raw[f"{Y}|{c}|{i}"] = r

    # ---- smooth_cameo (imported, no formula copy) for changed cards and affected people ----
    pids = old_pids | {clubs[c]['pl'][i][5] for c, i in touched}
    tk = {f"{Y}|{c}|{i}" for c, i in touched}
    sm = SC.final(pool, raw)   # final rating (smoothing + ratings v2)
    changed = []
    for c in pool['clubs']:
        for i, p in enumerate(c['pl']):
            k = SC.key(c, i); new = sm[k]
            if new == p[2]: continue
            if k in tk or p[5] in pids:
                changed.append((k, p[0], p[2], new)); p[2] = new
            else:
                raise SystemExit(f'smooth_cameo розходиться з пулом на чужій картці {k} {p[0]}: {p[2]} → {new}')

    assert len(raw) == sum(len(c['pl']) for c in pool['clubs']) and all(v is not None for v in raw.values())   # pool['meta'] is left untouched
    out = json.dumps(pool, **DUMP)
    if out != before: open(POOL, 'w', encoding='utf-8').write(out)
    rout = json.dumps(raw, separators=(',', ':'))
    if rout != raw_before: open(RAW, 'w', encoding='utf-8').write(rout)

    print('pool.json:', 'змінено' if out != before else 'без змін', '| pool_ratings_raw.json:', 'змінено' if rout != raw_before else 'без змін')
    for c, i in touched:
        p = clubs[c]['pl'][i]; k = f"{Y}|{c}|{i}"
        print(f'  {k:<32} {p[0]:<22} {p[1]} {p[5]:<24} {p[6]:<3} М={p[3]:<2} Г={p[4]} П={p[8]} сухі={p[9]}  етап4={rt[(c, i)]:<5} raw={raw[k]:<3} рейтинг={p[2]}')
    if changed:
        print('рейтинг змінено (згладжування камео):')
        for k, n, a, b in changed: print(f'  {k:<32} {n:<22} {a} → {b}')


if __name__ == '__main__':
    main()
