"""Виправлення пулу 0.57: картки, які етап 3 прив'язав не до тієї людини (BACKLOG «Данные», 0.54). Повторний запуск нічого не змінює.
Запуск з кореня репозиторію: python3 data/fixes/fix_pool_057.py
Далі: python3 data/aliases/apply.py && python3 data/ratings/class_v2.py && python3 data/update_meta.py && python3 data/check_pool.py
      && python3 src/build.py && node tools/make_engine.js

Правила (DECISIONS п. 7): id не змінюються і не зникають, чужий id іншій людині не віддаємо. Картка, яку етап 3 віддав не тій людині,
отримує id справжньої людини; якщо її в пулі немає — Transfermarkt id `tm:<N>` (у всіх знайденому профілі та сама дата народження).
Старий id лишається на картках людини, якій він справді належить. Картки не переставляються й не додаються — ключі
pool_ratings_raw.json («рік|клуб|індекс») ті самі, сирий рейтинг картки (етап 4, за статистикою саме цього рядка) не змінюється;
підсумковий рейтинг — smooth_cameo.final() (згладжування камео залежить від того, чия картка).

Звідки відомо, що картка чужа: у сирому рядку data/data_v2/ratings_player_seasons.csv (player_name — ПІБ зі складу на uk-вікі)
інша людина, ніж у id. Друге джерело — профіль і історія переходів Transfermarkt (tmapi.transfermarkt.technology, 30.09.2026).
Кілька випадків — близнюки з однаковою датою народження (id `w:<дата>:<прізвище>` у них спільний, тому етап 3 їх злив):
Мазури, Капанадзе, Бабійчуки, Пашаєви, Баранці, Маковські. Карток «другого близнюка», яких у пулі немає зовсім, тут не додаємо (BACKLOG).

Джерела по людях (TM = https://www.transfermarkt.com/-/profil/spieler/<N>):
- Микола Каліщук, TM 999526, 26.11.1967 (та сама дата, що в Анатолія Поліщука): Верес → Карпати 14.03.1993; у Поліщука 1992/93 —
  лише Волинь (14 М; разом із «Вересом» і «Карпатами» вийшло б 33 М за 30 турів). Позиція — «ЗХ» у складі «Карпат»
  (uk-вікі «Сезон ФК «Карпати» (Львів) 1992—1993»).
- Василь Мазур, TM 518654, 23.05.1970, SW → CB (близнюк Сергія, TM 999294: Кривбас → Зоря 11.1992 → Кривбас 1993 → Сіріус 01.1994
  → Кривбас 07.1995). Рядки Зоря 1992 (30 М), Кривбас 1993–1995 (33/34/17 М) — Василь; Кривбас 1992 (6 М) — Сергій.
- Віталій Левченко, TM 251328, 28.03.1972 (та сама дата, що в Олексія Коробченка, TM 774168), LB, Таджикистан:
  ЦСКА-Борисфен 1994 → ЦСКА 1996 → Таврія 01.2001. Коробченко — лише Зоря 1992–1995; його позиція за TM — RW, громадянство (сирі рядки) — Україна.
- Олексій Кузнецов (id уже є, w:1976-02-23:kuznetsov), TM 969948: Таврія до 01.1995. Картка Таврії 1993/94 — він, не Віктор.
- Михайло Маковський, TM 92633, 23.04.1977, CM, Білорусь (близнюк Володимира, TM 158439: у «Ворсклі» лише з 01.2000, 15 М).
  Картка «Ворскли» 1999/2000 (22 М, 1 гол) — рядок Михайла (TM: Динамо → Ворскла 07.1999).
- Автанділ Капанадзе, TM 843683, 01.12.1962, SS → ST, Грузія (близнюк Таріела, TM 843175): Темп → Нива Т 01.1996.
  Картки «Ниви» 1997/98 і 1998/99 (28 М 15 г, 29 М 10 г) — рядки Автанділа; решта карток id — Таріел.
- Руслан Суанов, TM 63164, 18.06.1975, SS → ST, Росія: Металург З 01.2004 – 01.2005 (картка 2003/04, 5 М).
- Олександр Бабійчук, TM 992337, 02.02.1973, CF → ST (близнюк Сергія, TM 986515): Нива В 01.1997 – 1999 (картка 1996/97).
- Максим Пашаєв, TM 59114, 04.01.1988, LB (близнюк Павла): Кривбас (оренда) 2007/08, Дніпро з 06.2008 (картки Кривбас 2007, Дніпро 2008).
  id tm:58961 — це Павло Пашаєв (TM 58961: Кривбас 08–12.2008, Дніпро 2009–2012, …) → решта карток лише перейменовуються.
- Григорій Баранець, TM 82593, 22.07.1986, AM → CAM (близнюк Бориса, TM 82592): Карпати 07.2010 → Оболонь 02.2011 (картка Карпат 2010/11).
Тутиченко: окремо, псевдонім у data/aliases/aliases.csv (одна людина, TM 533750); рік народження дубля 1971 → 1970.
"""
import json, os, sys

D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(D, '..', '..')
POOL = os.path.join(ROOT, 'src', 'pool.json')
RAW = os.path.join(ROOT, 'data', 'ratings', 'pool_ratings_raw.json')
sys.path.insert(0, os.path.join(ROOT, 'data', 'ratings'))
import smooth_cameo as SC

# картка: [ім'я, лінія, рейтинг, матчі, голи, person_id, основна, додаткові, асисти, сухі, громадянство, рік народження]
UA, TJ, GE, BY, RU = 0, 81, 31, 20, 71   # індекси pool['nats'] (перевіряються нижче)
KALISCHUK = {0: 'Микола Каліщук', 5: 'tm:999526', 6: 'CB', 7: '', 10: UA, 11: 1967}
V_MAZUR = {0: 'Василь Мазур', 5: 'tm:518654', 6: 'CB', 7: '', 10: UA, 11: 1970}
LEVCHENKO = {0: 'Віталій Левченко', 5: 'tm:251328', 6: 'LB', 7: '', 10: TJ, 11: 1972}
A_KAPANADZE = {0: 'Автанділ Капанадзе', 5: 'tm:843683', 6: 'ST', 7: '', 10: GE, 11: 1962}
M_PASHAEV = {0: 'Максим Пашаєв', 5: 'tm:59114', 6: 'LB', 7: '', 10: UA, 11: 1988}
POLISCHUK = ('Анатолій Поліщук', 'w:1967-11-26:polischuk')
S_MAZUR = ('Сергій Мазур', 'w:1970-05-23:mazur')
KOROBCHENKO = ('Олексій Коробченко', 'w:1972-03-28:korobchenko')
T_KAPANADZE = ('Таріел Капанадзе', 'w:1962-12-01:kapanadze')
P_PASHAEV_OLD = ('Максим Пашаєв', 'tm:58961')

REASSIGN = [   # (рік, клуб, (ім'я, id) до виправлення, нові поля {індекс: значення})
    (1992, 'veres-rivne', POLISCHUK, KALISCHUK),
    (1992, 'karpaty-lviv', POLISCHUK, KALISCHUK),
    (1992, 'zorya-luhansk', S_MAZUR, V_MAZUR),
    (1993, 'kryvbas', S_MAZUR, V_MAZUR),
    (1994, 'kryvbas', S_MAZUR, V_MAZUR),
    (1995, 'kryvbas', S_MAZUR, V_MAZUR),
    *[(y, 'cska-kyiv', KOROBCHENKO, LEVCHENKO) for y in range(1995, 2001)],
    (2000, 'tavriya-simferopol', KOROBCHENKO, LEVCHENKO),
    (1993, 'tavriya-simferopol', ('Віктор Кузнецов', 'w:1975-03-31:kuznetsov'),
     {0: 'Олексій Кузнецов', 5: 'w:1976-02-23:kuznetsov', 6: 'CB', 7: '', 10: UA, 11: 1976}),
    (1999, 'vorskla-poltava', ('Володимир Маковський', 'w:1977-04-23:makovski'),
     {0: 'Михайло Маковський', 5: 'tm:92633', 6: 'CM', 7: '', 10: BY, 11: 1977}),
    (1997, 'nyva-ternopil', T_KAPANADZE, A_KAPANADZE),
    (1998, 'nyva-ternopil', T_KAPANADZE, A_KAPANADZE),
    (2003, 'metalurh-zaporizhzhia', ('Денис Смірнов', 'w:1975-06-18:smirnov'),
     {0: 'Руслан Суанов', 5: 'tm:63164', 6: 'ST', 7: '', 10: RU, 11: 1975}),
    (1996, 'nyva-vinnytsia', ('Сергій Бабійчук', 'w:1973-02-02:babichuk'),
     {0: 'Олександр Бабійчук', 5: 'tm:992337', 6: 'ST', 7: '', 10: UA, 11: 1973}),
    (2007, 'kryvbas', P_PASHAEV_OLD, M_PASHAEV),
    (2008, 'dnipro', P_PASHAEV_OLD, M_PASHAEV),
    (2010, 'karpaty-lviv', ('Борис Баранець', 'w:1986-07-22:baranets'),
     {0: 'Григорій Баранець', 5: 'tm:82593', 6: 'CAM', 7: '', 10: UA, 11: 1986}),
]
# людина лишається на своєму id, але поля id були взяті з чужих рядків
PERSON = {
    'tm:58961': {0: 'Павло Пашаєв'},                     # TM 58961 = Pavlo Pashayev
    'w:1972-03-28:korobchenko': {6: 'RW', 7: '', 10: UA},  # TM 774168: RW; сирі рядки «Зорі» — Україна (81 = Таджикистан — від Левченка)
}
BIRTH_YEAR = {'w:1971-07-10:tutichenko': 1970}   # псевдонім до w:1970-03-05:tutichenko (TM 533750: 05.03.1970)


def main():
    raw_txt = open(POOL, encoding='utf-8').read()
    pool = json.loads(raw_txt)
    raw = json.load(open(RAW, encoding='utf-8'))
    assert [pool['nats'][i] for i in (UA, TJ, GE, BY, RU)] == ['Україна', 'Таджикистан', 'Грузія', 'Білорусь', 'Росія']
    log, touched = [], set()
    ids = {p[5] for c in pool['clubs'] for p in c['pl']}

    for y, club, before, new in REASSIGN:
        cl = [c for c in pool['clubs'] if c['y'] == y and c['c'] == club]
        assert len(cl) == 1, (y, club)
        cl = cl[0]
        after = (new[0], new[5])
        hit = [i for i, p in enumerate(cl['pl']) if (p[0], p[5]) in (before, after)]
        assert len(hit) == 1, (y, club, before, hit)
        p = cl['pl'][hit[0]]
        if (p[0], p[5]) == before:
            # новий tm-id не має належати комусь іншому в пулі
            owners = {q[0] for c in pool['clubs'] for q in c['pl'] if q[5] == new[5]}
            assert owners <= {new[0]}, (new[5], owners)
            touched |= {before[1], new[5]}
            for k, v in new.items(): p[k] = v
            log.append(f'{y} {club}: {before[0]} ({before[1]}) → {p[0]} ({p[5]}), {p[6]}')

    for c in pool['clubs']:
        for p in c['pl']:
            for pid, fix in PERSON.items():
                if p[5] == pid and any(p[k] != v for k, v in fix.items()):
                    log.append(f'{c["y"]} {c["c"]}: {p[0]} ({pid}) → ' + ', '.join(f'[{k}]={v}' for k, v in fix.items()))
                    for k, v in fix.items(): p[k] = v
                    touched.add(pid)
            if p[5] in BIRTH_YEAR and p[11] != BIRTH_YEAR[p[5]]:
                log.append(f'{c["y"]} {c["c"]}: {p[0]} ({p[5]}) — рік народження {p[11]} → {BIRTH_YEAR[p[5]]}')
                p[11] = BIRTH_YEAR[p[5]]

    # старі id нікуди не зникли
    assert ids <= {p[5] for c in pool['clubs'] for p in c['pl']}

    # рейтинг: згладжування камео після зміни «чия картка» — лише для карток зачеплених людей
    alias = pool.get('alias', {})
    canon = lambda i: alias.get(i, i)
    touched_c = {canon(i) for i in touched}
    fin = SC.final(pool, raw)
    for c in pool['clubs']:
        for i, p in enumerate(c['pl']):
            k = SC.key(c, i)
            if fin[k] == p[2]: continue
            if canon(p[5]) not in touched_c:
                sys.exit(f'рейтинг розходиться з пулом на чужій картці {k} {p[0]}: {p[2]} → {fin[k]} (спершу python3 data/ratings/smooth_cameo.py)')
            log.append(f'{k} {p[0]}: рейтинг {p[2]} → {fin[k]}')
            p[2] = fin[k]

    out = json.dumps(pool, ensure_ascii=False, separators=(',', ':'))
    if out != raw_txt: open(POOL, 'w', encoding='utf-8').write(out)
    print('src/pool.json:', 'змінено' if out != raw_txt else 'без змін')
    for l in log: print('  ' + l)


if __name__ == '__main__':
    main()
