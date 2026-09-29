# -*- coding: utf-8 -*-
"""Builds clubs_canonical.csv (one row per club lineage) and club_aliases.csv (every name variant -> canonical_id)."""
import csv, io

# canonical_id: (name_uk, name_en, city_uk, decision_note)
CANON = {
 "dynamo-kyiv":        ("Динамо (Київ)", "Dynamo Kyiv", "Київ", ""),
 "shakhtar-donetsk":   ("Шахтар (Донецьк)", "Shakhtar Donetsk", "Донецьк", ""),
 "dnipro":             ("Дніпро (Дніпропетровськ)", "Dnipro Dnipropetrovsk", "Дніпро", "СК Дніпро-1 — окремий клуб (рішення для перевірки)"),
 "dnipro-1":           ("СК Дніпро-1", "SC Dnipro-1", "Дніпро", "не об'єднано з «Дніпром» (рішення для перевірки)"),
 "metalist-kharkiv":   ("Металіст (Харків)", "Metalist Kharkiv", "Харків", "старий Металіст (до 2016) + відроджений Металіст (2022/23) об'єднано; Металіст 1925 — окремо (рішення для перевірки)"),
 "metalist-1925":      ("Металіст 1925 (Харків)", "Metalist 1925 Kharkiv", "Харків", "окремий клуб"),
 "karpaty-lviv":       ("Карпати (Львів)", "Karpaty Lviv", "Львів", "старі Карпати (до 2021) + нові (з 2024 в УПЛ) об'єднано"),
 "chornomorets-odesa": ("Чорноморець (Одеса)", "Chornomorets Odesa", "Одеса", ""),
 "vorskla-poltava":    ("Ворскла (Полтава)", "Vorskla Poltava", "Полтава", "у 2003–04 — «Ворскла-Нафтогаз»"),
 "zorya-luhansk":      ("Зоря (Луганськ)", "Zorya Luhansk", "Луганськ", "у 1992–94 — «Зоря-МАЛС»"),
 "kryvbas":            ("Кривбас (Кривий Ріг)", "Kryvbas Kryvyi Rih", "Кривий Ріг", "старий (до 2013) + відроджений (з 2020) об'єднано — Transfermarkt веде як один клуб"),
 "tavriya-simferopol": ("Таврія (Сімферополь)", "Tavriya Simferopol", "Сімферополь", ""),
 "metalurh-zaporizhzhia": ("Металург (Запоріжжя)", "Metalurh Zaporizhzhia", "Запоріжжя", ""),
 "metalurh-donetsk":   ("Металург (Донецьк)", "Metalurh Donetsk", "Донецьк", ""),
 "mariupol":           ("Маріуполь / Іллічівець", "FC Mariupol (Illichivets)", "Маріуполь", "Металург (Маріуполь) 1997–2001 → Іллічівець 2002–2016 → ФК Маріуполь 2017–2022 — один клуб"),
 "arsenal-kyiv":       ("Арсенал (Київ)", "Arsenal Kyiv", "Київ", "2001–2013 та відроджений 2014–2019 об'єднано; ЦСКА (Київ) — окремо (рішення для перевірки)"),
 "cska-kyiv":          ("ЦСКА (Київ)", "CSKA Kyiv", "Київ", "у 1995 — «ЦСКА-Борисфен»; у 2001 місце в лізі перейшло «Арсеналу»"),
 "borysfen-boryspil":  ("Борисфен (Бориспіль)", "Borysfen Boryspil", "Бориспіль", ""),
 "volyn-lutsk":        ("Волинь (Луцьк)", "Volyn Lutsk", "Луцьк", ""),
 "hoverla-uzhhorod":   ("Говерла / Закарпаття (Ужгород)", "Hoverla Uzhhorod (Zakarpattia)", "Ужгород", "Закарпаття 2001–2011 → Говерла 2011–2016 — один клуб"),
 "zirka-kropyvnytskyi":("Зірка (Кропивницький)", "Zirka Kropyvnytskyi", "Кропивницький", "Зірка-НІБАС 1995–96 → Зірка (Кіровоград) → Зірка (Кропивницький) 2016–18"),
 "oleksandriya":       ("Олександрія", "FC Oleksandriya", "Олександрія", "Поліграфтехніка 2001 → ФК Олександрія 2002 → ПФК Олександрія 2015+ об'єднано (рішення для перевірки)"),
 "obolon-kyiv":        ("Оболонь (Київ)", "Obolon Kyiv", "Київ", "стара Оболонь (до 2013) + Оболонь-Бровар/Оболонь (з 2023) об'єднано (рішення для перевірки)"),
 "veres-rivne":        ("Верес (Рівне)", "Veres Rivne", "Рівне", "1992–94 + відроджений 2017+ об'єднано"),
 "sevastopol":         ("Севастополь", "FC Sevastopol", "Севастополь", ""),
 "nyva-ternopil":      ("Нива (Тернопіль)", "Nyva Ternopil", "Тернопіль", ""),
 "nyva-vinnytsia":     ("Нива (Вінниця)", "Nyva Vinnytsia", "Вінниця", ""),
 "bukovyna-chernivtsi":("Буковина (Чернівці)", "Bukovyna Chernivtsi", "Чернівці", ""),
 "kremin-kremenchuk":  ("Кремінь (Кременчук)", "Kremin Kremenchuk", "Кременчук", ""),
 "temp-shepetivka":    ("Темп (Шепетівка)", "Temp Shepetivka", "Шепетівка", ""),
 "torpedo-zaporizhzhia":("Торпедо (Запоріжжя)", "Torpedo Zaporizhzhia", "Запоріжжя", ""),
 "prykarpattia":       ("Прикарпаття (Івано-Франківськ)", "Prykarpattia Ivano-Frankivsk", "Івано-Франківськ", ""),
 "mykolaiv":           ("СК Миколаїв", "SC Mykolaiv", "Миколаїв", ""),
 "stal-alchevsk":      ("Сталь (Алчевськ)", "Stal Alchevsk", "Алчевськ", ""),
 "naftovyk-okhtyrka":  ("Нафтовик-Укрнафта (Охтирка)", "Naftovyk-Ukrnafta Okhtyrka", "Охтирка", ""),
 "fc-kharkiv":         ("ФК Харків", "FC Kharkiv", "Харків", ""),
 "fc-lviv-2008":       ("ФК Львів (2006–2012)", "FC Lviv (2008)", "Львів", "окремий від ПФК Львів (2018–22)"),
 "pfk-lviv":           ("ПФК Львів", "PFK Lviv", "Львів", ""),
 "desna-chernihiv":    ("Десна (Чернігів)", "Desna Chernihiv", "Чернігів", ""),
 "minaj":              ("Минай", "FC Mynai", "Минай", ""),
 "inhulets-petrove":   ("Інгулець (Петрове)", "Inhulets Petrove", "Петрове", ""),
 "kolos-kovalivka":    ("Колос (Ковалівка)", "Kolos Kovalivka", "Ковалівка", ""),
 "lnz-cherkasy":       ("ЛНЗ (Черкаси)", "LNZ Cherkasy", "Черкаси", ""),
 "livyi-bereh-kyiv":   ("Лівий Берег (Київ)", "Livyi Bereh Kyiv", "Київ", ""),
 "olimpik-donetsk":    ("Олімпік (Донецьк)", "Olimpik Donetsk", "Донецьк", ""),
 "stal-kamianske":     ("Сталь (Кам'янське)", "Stal Kamianske", "Кам'янське", "не плутати зі Сталлю (Алчевськ)"),
 "rukh-lviv":          ("Рух (Львів)", "Rukh Lviv", "Львів", ""),
 "sc-poltava":         ("СК Полтава", "SC Poltava", "Полтава", ""),
 "polissya-zhytomyr":  ("Полісся (Житомир)", "Polissya Zhytomyr", "Житомир", ""),
 "epicentr":           ("Епіцентр (Кам'янець-Подільський)", "Epitsentr Kamianets-Podilskyi", "Кам'янець-Подільський", ""),
 "kudrivka":           ("Кудрівка", "FC Kudrivka", "Кудрівка", ""),
}

# name variant -> canonical_id  (exact strings as they appear in the data; ru aliases for other seasons added too)
ALIASES = {
 # --- Kaggle / Transfermarkt (en)
 "Arsenal Kyiv": "arsenal-kyiv", "Chornomorets Odesa": "chornomorets-odesa", "Desna Chernigiv": "desna-chernihiv",
 "Dnipro Dnipropetrovsk (-2020)": "dnipro", "Dynamo Kyiv": "dynamo-kyiv", "Epicentr Kamyanets-Podilskyi": "epicentr",
 "FC Kudrivka": "kudrivka", "FC Minaj": "minaj", "FC Oleksandriya": "oleksandriya", "FC Shakhtar Donetsk": "shakhtar-donetsk",
 "FK Mariupol": "mariupol", "FK Polissya Zhytomyr": "polissya-zhytomyr", "FK Sevastopol (- 2014)": "sevastopol",
 "Goverla Uzhgorod (- 2016)": "hoverla-uzhhorod", "Ingulets Petrove": "inhulets-petrove", "Karpaty Lviv": "karpaty-lviv",
 "Karpaty Lviv (-2021)": "karpaty-lviv", "Kolos Kovalivka": "kolos-kovalivka", "Kryvbas Kryvyi Rig": "kryvbas",
 "LNZ Cherkasy": "lnz-cherkasy", "Livyi Bereg Kyiv": "livyi-bereh-kyiv", "Metalist Kharkiv": "metalist-kharkiv",
 "Metalist Kharkiv (- 2016)": "metalist-kharkiv", "Metalurg Donetsk (- 2015)": "metalurh-donetsk",
 "Metalurg Zaporizhya (-2016)": "metalurh-zaporizhzhia", "NK Veres Rivne": "veres-rivne", "Obolon Kyiv": "obolon-kyiv",
 "Olimpik Donetsk": "olimpik-donetsk", "PFK Lviv": "pfk-lviv", "PFK Stal Kamyanske (-2018)": "stal-kamianske",
 "Rukh Lviv": "rukh-lviv", "SC Dnipro-1": "dnipro-1", "SC Poltava": "sc-poltava",
 "SK Tavriya Simferopol ( - 2022)": "tavriya-simferopol", "TOV FK Metalist 1925 Kharkiv": "metalist-1925",
 "Volyn Lutsk": "volyn-lutsk", "Vorskla Poltava": "vorskla-poltava", "Zirka Kropyvnytskyi": "zirka-kropyvnytskyi",
 "Zorya Lugansk": "zorya-luhansk",
 # --- uk.wikipedia
 "«Іллічівець» (Маріуполь)": "mariupol", "«Арсенал» (Київ)": "arsenal-kyiv", "«Борисфен» (Бориспіль)": "borysfen-boryspil",
 "«Буковина» (Чернівці)": "bukovyna-chernivtsi", "«Верес» (Рівне)": "veres-rivne", "«Волинь» (Луцьк)": "volyn-lutsk",
 "«Ворскла-Нафтогаз» (Полтава)": "vorskla-poltava", "«Ворскла» (Полтава)": "vorskla-poltava", "«Динамо» (Київ)": "dynamo-kyiv",
 "«Дніпро» (Дніпропетровськ)": "dnipro", "«Закарпаття» (Ужгород)": "hoverla-uzhhorod", "«Зоря-МАЛС» (Луганськ)": "zorya-luhansk",
 "«Зоря» (Луганськ)": "zorya-luhansk", "«Зірка-НІБАС» (Кіровоград)": "zirka-kropyvnytskyi", "«Зірка» (Кіровоград)": "zirka-kropyvnytskyi",
 "«Карпати» (Львів)": "karpaty-lviv", "«Кремінь» (Кременчук)": "kremin-kremenchuk", "«Кривбас» (Кривий Ріг)": "kryvbas",
 "«Металург» (Донецьк)": "metalurh-donetsk", "«Металург» (Запоріжжя)": "metalurh-zaporizhzhia", "«Металург» (Маріуполь)": "mariupol",
 "«Металіст» (Харків)": "metalist-kharkiv", "«Нафтовик-Укрнафта» (Охтирка)": "naftovyk-okhtyrka", "«Нива» (Вінниця)": "nyva-vinnytsia",
 "«Нива» (Тернопіль)": "nyva-ternopil", "«Оболонь» (Київ)": "obolon-kyiv", "«Поліграфтехніка» (Олександрія)": "oleksandriya",
 "«Прикарпаття» (Івано-Франківськ)": "prykarpattia", "«Сталь» (Алчевськ)": "stal-alchevsk", "«Таврія» (Сімферополь)": "tavriya-simferopol",
 "«Темп» (Шепетівка)": "temp-shepetivka", "«Торпедо» (Запоріжжя)": "torpedo-zaporizhzhia", "«ЦСКА-Борисфен» (Київ)": "cska-kyiv",
 "«Чорноморець» (Одеса)": "chornomorets-odesa", "«Шахтар» (Донецьк)": "shakhtar-donetsk", "ПФК «Севастополь»": "sevastopol",
 "СК «Миколаїв»": "mykolaiv", "ФК «Львів»": "fc-lviv-2008", "ФК «Олександрія»": "oleksandriya", "ФК «Харків»": "fc-kharkiv",
 "ЦСКА (Київ)": "cska-kyiv",
 # --- ru.wikipedia (2011 + запас на інші сезони)
 "Александрия": "oleksandriya", "Арсенал (Киев)": "arsenal-kyiv", "Волынь (Луцк)": "volyn-lutsk", "Ворскла (Полтава)": "vorskla-poltava",
 "Динамо (Киев)": "dynamo-kyiv", "Днепр (Днепропетровск)": "dnipro", "Заря (Луганск)": "zorya-luhansk", "Ильичёвец (Мариуполь)": "mariupol",
 "Карпаты (Львов)": "karpaty-lviv", "Кривбасс (Кривой Рог)": "kryvbas", "Металлист (Харьков)": "metalist-kharkiv",
 "Металлург (Донецк)": "metalurh-donetsk", "Оболонь (Киев)": "obolon-kyiv", "Таврия (Симферополь)": "tavriya-simferopol",
 "Черноморец (Одесса)": "chornomorets-odesa", "Шахтёр (Донецк)": "shakhtar-donetsk",
 "Днепр-1 (Днепр)": "dnipro-1", "Днепр-1": "dnipro-1", "Колос (Ковалевка)": "kolos-kovalivka", "Десна (Чернигов)": "desna-chernihiv",
 "Мариуполь": "mariupol", "Верес (Ровно)": "veres-rivne", "Металлист 1925 (Харьков)": "metalist-1925", "Ингулец (Петрово)": "inhulets-petrove",
 "Львов": "pfk-lviv", "Минай": "minaj", "Рух (Львов)": "rukh-lviv", "Металлург (Запорожье)": "metalurh-zaporizhzhia",
 "Говерла (Ужгород)": "hoverla-uzhhorod", "Севастополь": "sevastopol", "Олимпик (Донецк)": "olimpik-donetsk",
 "Сталь (Каменское)": "stal-kamianske", "Сталь (Днепродзержинск)": "stal-kamianske", "Звезда (Кропивницкий)": "zirka-kropyvnytskyi",
 "Полесье (Житомир)": "polissya-zhytomyr", "ЛНЗ (Черкассы)": "lnz-cherkasy", "Левый Берег (Киев)": "livyi-bereh-kyiv",
 "Металлист (Харьков, 2020)": "metalist-kharkiv", "Эпицентр (Каменец-Подольский)": "epicentr", "Кудровка": "kudrivka", "Полтава": "sc-poltava",
}

def norm(s):
    return " ".join(s.replace("«", "").replace("»", "").split()).strip()

# verify inventory coverage
inv = list(csv.DictReader(open("club_names_inventory.csv", encoding="utf-8")))
missing = [r["club_name"] for r in inv if r["club_name"] not in ALIASES]
assert not missing, f"unmapped: {missing}"
bad = [k for k, v in ALIASES.items() if v not in CANON]
assert not bad, f"alias -> unknown canonical: {bad}"

with open("club_aliases.csv", "w", encoding="utf-8", newline="") as f:
    w = csv.writer(f); w.writerow(["club_name", "canonical_id"])
    for k, v in ALIASES.items(): w.writerow([k, v])
with open("clubs_canonical.csv", "w", encoding="utf-8", newline="") as f:
    w = csv.writer(f); w.writerow(["canonical_id", "name_uk", "name_en", "city_uk", "note"])
    for k, (uk, en, city, note) in CANON.items(): w.writerow([k, uk, en, city, note])

# summary of how many variants map to each canonical
from collections import defaultdict
m = defaultdict(list)
for r in inv: m[ALIASES[r["club_name"]]].append(f'{r["club_name"]} [{r["source"].replace("wiki_","")} {r["first"]}–{r["last"]}]')
print(len(CANON), "canonical clubs;", len(inv), "variants in data;", len(ALIASES), "aliases")
for k in CANON:
    if k in m and len(m[k]) > 1: print(f"{k:24s} <- " + " | ".join(m[k]))
