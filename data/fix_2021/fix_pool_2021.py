"""Виправлення помилок пулу 2021/22 (див. data/research_assists/assists_2021_more_report.md, «Що знайшли в нашому пулі»).
Запуск з кореня репозиторію: python3 data/fix_2021/fix_pool_2021.py   (потім python3 src/build.py && node tools/make_engine.js)
Повторний запуск нічого не змінює (картки шукаються і «до», і «після» виправлення).

Джерело — sports.ru, сторінки клубів 2021/22 (data/research_assists/sportsru_2021_clubs.json) і профілі гравців
(дата народження, громадянство, амплуа — https://www.sports.ru/football/person/<slug>/, перевірено 29.09.2026).

Правила (DECISIONS п. 7): номери футболістів, коди клубів і сезони не змінюються. Жоден наявний person_id не зникає з пулу:
у картки міняється лише «чия вона» (старий id лишається на інших картках цієї людини).
Нові картки дописуються В КІНЕЦЬ списку клубу — ключі pool_ratings_raw.json («рік|клуб|індекс») не зсуваються.
Нові id — за правилом етапу 3 (build_stage3.py): w:<дата народження>:<перший за абеткою ключ імені з ru-запису>.

Рейтинг: формула етапу 4 (recompute_2021.py) на виправленому сезоні → round → (stretch_top лише для 90+, тут не потрібен)
→ pool_ratings_raw.json → smooth_cameo.smoothed() (імпорт, не копія) для змінених карток і для карток тих самих людей, у яких змінилася
«опора» згладжування (щоб повторний запуск smooth_cameo.py нічого не міняв).
"""
import json, os, re, sys, unicodedata

D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, D)
import recompute_2021 as RC
sys.path.insert(0, os.path.join(D, '..', 'ratings'))
import smooth_cameo as SC   # final(pool, raw) — та сама формула, що пише data/ratings/smooth_cameo.py

POOL, RAW = RC.POOL, RC.RAW
Y = 2021
DUMP = dict(ensure_ascii=False, separators=(',', ':'))

# ---- id нової людини — як в етапі 3 (build_stage3.py: translit/skeleton/name_keys, lang='ru') ----
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


# ---- виправлення: (клуб, як знайти картку до виправлення, як виглядає після) ----
# картка: [ім'я, лінія, рейтинг, матчі, голи, person_id, основна, додаткові, асисти, сухі, громадянство, рік народження]
PAVLOVETS = mint_id('Александр Павловец', '1996-08-13')      # sports.ru: 13.08.1996, Білорусь, захисник
VYUNNYK = mint_id('Богдан Вьюнник', '2002-05-21')            # 21.05.2002, Україна, нападник
SVITIUKHA = mint_id('Денис Свитюха', '2002-02-08')           # 08.02.2002, Україна, нападник
TURBAIEVSKYI = mint_id('Никита Турбаевский', '2002-03-12')   # 12.03.2002, Україна, воротар
FIXES = [
    # 1. Десна: «Євген Паст» (15 матчів) — це захисник Євген Селін (sports.ru: Евгений Селин 15 М, 0 Г, 0 П).
    #    Паста в Десні 2021/22 на sports.ru немає (воротарі — Литовка 13, Мисак 5) → окремої картки Паста в Десні не буде.
    #    Позиція/громадянство/рік — з інших карток Селіна (tm:59442) і positions.csv.
    dict(club='desna-chernihiv', find=('Євген Паст', 'tm:49016'),
         card=['Євген Селін', 'DF', None, 15, 0, 'tm:59442', 'LB', 'CB:0.64', 0, None, 0, 1988]),
    # 2. Верес: «Дмитро Махнєв» (8 М, 1 Г) — це Дмитро Кльоц (Дмитрий Клец 8 М, 1 Г, 0 П), tm:294188.
    dict(club='veres-rivne', find=('Дмитро Махнєв', 'w:1996-00-00:dmitri'),
         card=['Дмитро Кльоц', 'MF', None, 8, 1, 'tm:294188', 'CM', '', 0, None, 0, 1996]),
    #    Справжній Махнєв (Дмитрий Махнев 4 М, 0 Г; профіль: 02.03.1996, захисник) — id w:1996-00-00:dmitri (у names/positions це він).
    dict(club='veres-rivne', find=None,
         card=['Дмитро Махнєв', 'DF', None, 4, 0, 'w:1996-00-00:dmitri', 'CB', '', 0, None, 0, 1996]),
    # 3. Чорноморець: Петро Долгов — 0 голів (Петр Долгов 2 М, 0 Г); додати Сергія Кравченка (Сергей Кравченко 12 М, 1 Г, 0 П;
    #    профіль 24.04.1983 = tm:59076, ті самі позиції, що в інших його картках). Сума голів клубу лишається 20.
    dict(club='chornomorets-odesa', find=('Петро Долгов', 'w:2000-00-00:dolhov'),
         card=['Петро Долгов', 'MF', None, 2, 0, 'w:2000-00-00:dolhov', 'CM', '', 0, None, 0, 2000]),
    dict(club='chornomorets-odesa', find=None,
         card=['Сергій Кравченко', 'MF', None, 12, 1, 'tm:59076', 'CM', 'CDM:0.18;CAM:0.06', 0, None, 0, 1983]),
    # 5. Колос: «Олександр Демченко» (tm:463845, 11 М) — це Олександр Павловець (Александр Павловец 11 М, 0 Г, 0 П).
    #    Демченко з тим самим id в Олександрії (14 М) — справжній, не чіпаємо. Павловця в базі не було → новий id.
    dict(club='kolos-kovalivka', find=('Олександр Демченко', 'tm:463845'),
         card=['Олександр Павловець', 'DF', None, 11, 0, PAVLOVETS, 'CB', '', 0, None, 20, 1996]),
    # 6. Металіст 1925: додати воротаря Дениса Шеліхова (Денис Шелихов 1 М, 2 пропущені; профіль 23.06.1989 = tm:58972).
    dict(club='metalist-1925', find=None,
         card=['Денис Шеліхов', 'GK', None, 1, 0, 'tm:58972', 'GK', '', 0, None, 0, 1989]),
    # 7. Маріуполь. У етапі 3 кілька ru-записів без точної дати злилися в один id («Богдан 2002», «Денис 2002», tm:882227),
    #    а при збиранні пулу лишився рядок з більшою кількістю матчів під чужим ім'ям.
    #    «Богдан Поталов» (11 М, 1 Г) = Богдан Вьюнник (11 М, 1 Г, 1 П) → новий id; справжній Поталов (1 М) — окрема картка.
    dict(club='mariupol', find=('Богдан Поталов', 'w:2002-00-00:bohdan'),
         card=["Богдан В'юнник", 'FW', None, 11, 1, VYUNNYK, 'ST', '', 1, None, 0, 2002]),
    dict(club='mariupol', find=None,
         card=['Богдан Поталов', 'DF', None, 1, 0, 'w:2002-00-00:bohdan', 'CB', '', 0, None, 0, 2002]),
    #    «Денис Кузик» (9 М, 1 Г) = Денис Свитюха (9 М, 1 Г, 0 П). Кузик у 2021/22 грав за Чорноморець (14 М) — та картка правильна.
    dict(club='mariupol', find=('Денис Кузик', 'tm:723621'),
         card=['Денис Світюха', 'FW', None, 9, 1, SVITIUKHA, 'ST', '', 0, None, 0, 2002]),
    #    «Микита Козицький» (воротар, 6 М) = Никита Турбаевский (воротар 6 М, 15 пропущених) → новий id;
    #    справжній Козицький (польовий, 1 М) — окрема картка з його id tm:882227 (позиція — як у positions.csv).
    dict(club='mariupol', find=('Микита Козицький', 'tm:882227'),
         card=['Микита Турбаєвський', 'GK', None, 6, 0, TURBAIEVSKYI, 'GK', '', 0, None, 0, 2002]),
    dict(club='mariupol', find=None,
         card=['Микита Козицький', 'MF', None, 1, 0, 'tm:882227', 'RW', '', 0, None, 0, 2002]),
]


def locate(cl, fx):
    """індекс картки: після виправлення (той самий id і ім'я) або до виправлення (fx['find'])."""
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
    for pid in (PAVLOVETS, VYUNNYK, SVITIUKHA, TURBAIEVSKYI):   # новий id не повинен збігтися з чужим
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
        # сухі — оцінка як у add_cs_estimates.py (клуб-сезон 2021 має cs_est=1)
        games, tcs = cs_map[f"{Y}|{cl['c']}"]; share = min(1, card[3] / games)
        card[9] = round(tcs * share) if card[6] == 'GK' else round(tcs * share ** 1.6 * 0.892)
        touched.append((cl['c'], i))

    # ---- рейтинг: формула етапу 4 на виправленому сезоні ----
    rt = RC.compute(pool)
    for c, i in touched:
        r = int(round(rt[(c, i)]))
        assert r < 90, f'{c}/{i}: {r} ≥ 90 — потрібен stretch_top за квотами всієї бази, вручну не ставимо'
        raw[f"{Y}|{c}|{i}"] = r

    # ---- smooth_cameo.py (імпорт тієї самої функції, з 0.54 — без копії формули) для змінених карток і людей, яких це зачепило ----
    pids = old_pids | {clubs[c]['pl'][i][5] for c, i in touched}
    tk = {f"{Y}|{c}|{i}" for c, i in touched}
    sm = SC.final(pool, raw)   # итоговый рейтинг (сглаживание + с 0.57 рейтинги v2)
    changed = []
    for c in pool['clubs']:
        for i, p in enumerate(c['pl']):
            k = SC.key(c, i); new = sm[k]
            if new == p[2]: continue
            if k in tk or p[5] in pids:
                changed.append((k, p[0], p[2], new)); p[2] = new
            else:
                raise SystemExit(f'smooth_cameo розходиться з пулом на чужій картці {k} {p[0]}: {p[2]} → {new}')

    assert len(raw) == sum(len(c['pl']) for c in pool['clubs']) and all(v is not None for v in raw.values())   # pool['meta'] не чіпаємо
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
