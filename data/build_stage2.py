"""Generates UPL_stage2_parse.ipynb — parses the Wikipedia harvest into a unified player-season table and merges with the Kaggle layer."""
import json

cells = []
def md(s): cells.append({"cell_type": "markdown", "metadata": {}, "source": s})
def code(s): cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": s})

md("""# Этап 2 — разбор сырья Википедии и сборка единой базы

Ничего не скачивает — только читает то, что уже лежит в `UPL-data/` на Drive. Работает 1–3 минуты.

Что делает:
1. Проверяет, для каких сезонов есть страницы с составами: украинская «…: вища ліга (склади команд)» и русская «… (составы)».
2. Разбирает эти страницы в таблицу «сезон × клуб × игрок» (позиция, дата рождения, страна, матчи, голы, для вратарей — пропущенные).
3. Склеивает с Kaggle-слоем (2012+) в единый файл `out/player_seasons_all.csv` и пишет короткую сводку `out/stage2_summary.txt`.
""")

code("""#@title 1. Настройки и Drive
OUT_DIR = "/content/drive/MyDrive/UPL-data"  #@param {type:"string"}
KAGGLE_FROM_SEASON = 2012  #@param {type:"integer"}

import os, re, json, traceback, datetime
from pathlib import Path
from google.colab import drive
drive.mount('/content/drive', force_remount=False)
import pandas as pd
from bs4 import BeautifulSoup

OUT = Path(OUT_DIR); WIKI = OUT / "wiki_raw"; OUTD = OUT / "out"; OUTD.mkdir(exist_ok=True)
SUMMARY = []
def say(*a):
    s = " ".join(str(x) for x in a); print(s); SUMMARY.append(s)
say("Этап 2 запущен", datetime.datetime.now().strftime("%Y-%m-%d %H:%M"))
""")

code("""#@title 2. Какие сезоны чем покрыты
UK_SQUAD_PAT = re.compile(r"склади команд", re.I)
RU_SQUAD_PAT = re.compile(r"\\(составы\\)", re.I)
CLUB_SEASON_PAT = re.compile(r"^Сезон ФК", re.I)

def season_dirs(lang):
    base = WIKI / lang
    return sorted([p for p in base.iterdir() if p.is_dir() and p.name.isdigit()], key=lambda p: int(p.name)) if base.exists() else []

coverage = []
pages = {}   # (lang, season) -> list of (title, html filename)
for lang in ["uk", "ru"]:
    for sd in season_dirs(lang):
        y = int(sd.name)
        idx_path = sd / "_index.json"
        if not idx_path.exists():
            continue
        idx = json.loads(idx_path.read_text(encoding="utf-8"))
        pages[(lang, y)] = [(t, v["html"]) for t, v in idx.items()]
        titles = list(idx.keys())
        coverage.append({
            "season": y, "lang": lang,
            "squad_page": any((UK_SQUAD_PAT if lang == "uk" else RU_SQUAD_PAT).search(t) for t in titles),
            "club_season_pages": sum(1 for t in titles if CLUB_SEASON_PAT.search(t)),
            "pages_total": len(titles),
        })
cov = pd.DataFrame(coverage)
piv = cov.pivot(index="season", columns="lang", values=["squad_page", "club_season_pages"])
piv.to_csv(OUTD / "wiki_coverage.csv")
say("Сезонов с украинской страницей составов:", int(cov[(cov.lang=="uk")].squad_page.sum()), "из", int((cov.lang=="uk").sum()))
say("Сезонов с русской страницей составов:   ", int(cov[(cov.lang=="ru")].squad_page.sum()), "из", int((cov.lang=="ru").sum()))
print(piv.to_string())
""")

code("""#@title 3. Парсер страниц с составами (uk и ru)
UK_MONTHS = {m: i+1 for i, m in enumerate(["січня","лютого","березня","квітня","травня","червня","липня","серпня","вересня","жовтня","листопада","грудня"])}
RU_MONTHS = {m: i+1 for i, m in enumerate(["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"])}
POS_MAP = {  # порядок важен: «півзахисник» содержит «захисник», поэтому полузащита проверяется первой
    "півзахисник": "MF", "полузащитник": "MF", "півзах": "MF", "полузащ": "MF",
    "воротар": "GK", "вратар": "GK", "голкіпер": "GK",
    "захисник": "DF", "защитник": "DF",
    "нападник": "FW", "нападающ": "FW", "форвард": "FW",
}
HDR = {  # ключевые слова заголовков столбцов
    "name":    ["футболіст", "гравець", "игрок", "футболист", "ім'я", "имя"],
    "dob":     ["дата народження", "дата рождения", "народ", "рожд"],
    "country": ["країна", "громадянство", "страна", "гражданство"],
    "apps":    ["ігри", "матчі", "игры", "матчи", "и", "і"],
    "goals":   ["голи", "голы", "г"],
    "number":  ["№", "номер"],
}

def clean(s):
    s = re.sub(r"\\[.*?\\]", "", s or "")           # [1], [ред.]
    return re.sub(r"\\s+", " ", s).strip(" \\u00a0")

def parse_date(s):
    s = clean(s)
    m = re.match(r"(\\d{1,2})\\s+([а-яіїє]+)\\s+(\\d{4})", s, re.I)
    if m:
        d, mon, y = int(m.group(1)), m.group(2).lower(), int(m.group(3))
        mm = UK_MONTHS.get(mon) or RU_MONTHS.get(mon)
        if mm: return f"{y:04d}-{mm:02d}-{d:02d}"
    m = re.match(r"(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})", s)
    if m: return f"{int(m.group(3)):04d}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    m = re.search(r"(\\d{4})", s)
    return f"{m.group(1)}-00-00" if m else None

def first_int(s):
    m = re.search(r"-?\\d+", clean(s) or "")
    return int(m.group()) if m else None

def pos_of(text):
    t = clean(text).lower()
    for k, v in POS_MAP.items():
        if k in t: return v
    return None

def col_index(headers, keys, exact_short=("и", "і", "г")):
    hs = [clean(h).lower() for h in headers]
    for k in keys:
        for i, h in enumerate(hs):
            if (k in exact_short and h == k) or (k not in exact_short and k in h):
                return i
    return None

def parse_squad_html(html, lang, season, page_title):
    soup = BeautifulSoup(html, "lxml")
    rows_out, skipped = [], []
    heading = None
    for el in soup.find_all(["h2", "h3", "h4", "table"]):
        if el.name != "table":
            txt = clean(el.get_text(" "))
            if txt: heading = txt
            continue
        trs = el.find_all("tr")
        if len(trs) < 3: continue
        # заголовок = первая строка с th
        hdr_row = next((tr for tr in trs if tr.find("th")), None)
        if hdr_row is None: continue
        headers = [clean(c.get_text(" ")) for c in hdr_row.find_all(["th", "td"])]
        ci = {k: col_index(headers, v) for k, v in HDR.items()}
        if ci["name"] is None or ci["apps"] is None:
            continue  # не таблица состава
        club = heading
        pos = None
        for tr in trs:
            if tr is hdr_row: continue
            cells = tr.find_all(["td", "th"])
            texts = [clean(c.get_text(" ")) for c in cells]
            if not any(texts): continue
            # строка-секция: одна ячейка с colspan или все ячейки одинаковые
            if len(cells) == 1 or (len(set(t for t in texts if t)) == 1 and pos_of(texts[0])):
                p = pos_of(texts[0])
                if p: pos = p
                continue
            if len(texts) <= max(ci["name"], ci["apps"]): continue
            name = texts[ci["name"]]
            if not name or name.lower() in ("футболіст", "игрок", "футболист"): continue
            goals_raw = texts[ci["goals"]] if ci["goals"] is not None and ci["goals"] < len(texts) else ""
            conceded = None; goals = None
            if re.search(r"\\d+\\s*(п|-п|проп)", goals_raw, re.I):
                conceded = first_int(goals_raw)
            else:
                goals = first_int(goals_raw)
            rows_out.append({
                "season": season, "lang": lang, "page": page_title,
                "club_heading": club, "position_group": pos,
                "number": texts[ci["number"]] if ci["number"] is not None and ci["number"] < len(texts) else None,
                "player_name": name,
                "dob": parse_date(texts[ci["dob"]]) if ci["dob"] is not None and ci["dob"] < len(texts) else None,
                "country": texts[ci["country"]] if ci["country"] is not None and ci["country"] < len(texts) else None,
                "apps": first_int(texts[ci["apps"]]),
                "goals": goals, "conceded": conceded,
            })
    return rows_out

def parse_lang(lang, pat):
    all_rows, report = [], []
    for (lg, y), lst in sorted(pages.items()):
        if lg != lang: continue
        hit = [(t, f) for t, f in lst if pat.search(t)]
        if not hit:
            report.append((y, 0, 0)); continue
        n_before = len(all_rows)
        for title, fname in hit:
            p = WIKI / lang / str(y) / fname
            if not p.exists(): continue
            try:
                all_rows += parse_squad_html(p.read_text(encoding="utf-8"), lang, y, title)
            except Exception:
                say(f"[{lang} {y}] ошибка разбора {title}: " + traceback.format_exc().splitlines()[-1])
        got = all_rows[n_before:]
        report.append((y, len({r['club_heading'] for r in got}), len(got)))
    return pd.DataFrame(all_rows), pd.DataFrame(report, columns=["season", "clubs", "players"])

uk_df, uk_rep = parse_lang("uk", UK_SQUAD_PAT)
ru_df, ru_rep = parse_lang("ru", RU_SQUAD_PAT)
uk_df.to_csv(OUTD / "wiki_uk_squads.csv", index=False)
ru_df.to_csv(OUTD / "wiki_ru_squads.csv", index=False)
rep = uk_rep.merge(ru_rep, on="season", how="outer", suffixes=("_uk", "_ru")).fillna(0).astype(int)
rep.to_csv(OUTD / "wiki_parse_report.csv", index=False)
say("uk: строк", len(uk_df), "| ru: строк", len(ru_df))
print(rep.to_string(index=False))
""")

code("""#@title 4. Контроль качества: что получилось разобрать
def qc(df, tag):
    if df.empty:
        say(f"[{tag}] пусто"); return
    say(f"[{tag}] сезонов {df.season.nunique()}, клубов-сезонов {df.groupby(['season','club_heading']).ngroups}, "
        f"игроков-строк {len(df)}, без позиции {df.position_group.isna().mean():.0%}, без даты рождения {df.dob.isna().mean():.0%}, "
        f"без матчей {df.apps.isna().mean():.0%}")
    per = df.groupby(["season", "club_heading"]).size()
    say(f"[{tag}] игроков на клуб: медиана {int(per.median())}, мин {int(per.min())}, макс {int(per.max())}")
    print(df.sample(min(8, len(df)), random_state=1)[["season","club_heading","position_group","player_name","dob","country","apps","goals","conceded"]].to_string(index=False))
qc(uk_df, "uk"); qc(ru_df, "ru")
""")

code("""#@title 5. Единая база: Википедия (до Kaggle) + Kaggle (с 2012)
kag = pd.read_csv(OUTD / "player_seasons_kaggle.csv")
kag_pos = {"Goalkeeper": "GK", "Defender": "DF", "Midfield": "MF", "Attack": "FW"}
kag_u = pd.DataFrame({
    "season": kag["season"], "club_name": kag["club_name"], "player_name": kag["name"].fillna(kag["player_name"]),
    "name_lang": "en", "dob": kag["date_of_birth"], "nationality": kag["country_of_citizenship"],
    "position_group": kag["position"].map(kag_pos), "sub_position": kag.get("sub_position"),
    "apps": kag["apps"], "goals": kag["goals"], "assists": kag["assists"], "minutes": kag["minutes"],
    "clean_sheets": kag["clean_sheets"], "conceded": None,
    "market_value_eur": kag.get("market_value_eur_at_season_start"),
    "tm_player_id": kag["player_id"], "tm_club_id": kag["club_id"], "source": "kaggle_tm",
})

def wiki_u(df, lang):
    if df.empty: return df
    return pd.DataFrame({
        "season": df["season"], "club_name": df["club_heading"], "player_name": df["player_name"],
        "name_lang": lang, "dob": df["dob"], "nationality": df["country"],
        "position_group": df["position_group"], "sub_position": None,
        "apps": df["apps"], "goals": df["goals"], "assists": None, "minutes": None,
        "clean_sheets": None, "conceded": df["conceded"], "market_value_eur": None,
        "tm_player_id": None, "tm_club_id": None, "source": f"wiki_{lang}",
    })

# для каждого сезона до KAGGLE_FROM_SEASON берём uk, если там >= 8 клубов, иначе ru
parts = [kag_u[kag_u.season >= KAGGLE_FROM_SEASON]]
choice = []
for y in range(1992, KAGGLE_FROM_SEASON):
    u = uk_df[uk_df.season == y]; r = ru_df[ru_df.season == y]
    if u.club_heading.nunique() >= 8:
        parts.append(wiki_u(u, "uk")); choice.append((y, "uk", u.club_heading.nunique(), len(u)))
    elif r.club_heading.nunique() >= 8:
        parts.append(wiki_u(r, "ru")); choice.append((y, "ru", r.club_heading.nunique(), len(r)))
    else:
        choice.append((y, "—", max(u.club_heading.nunique(), r.club_heading.nunique()), 0))
all_df = pd.concat(parts, ignore_index=True)
all_df.to_csv(OUTD / "player_seasons_all.csv", index=False)
ch = pd.DataFrame(choice, columns=["season", "source", "clubs", "rows"])
say("Источник по сезонам до Kaggle:"); print(ch.to_string(index=False))
gaps = ch[ch.source == "—"].season.tolist()
say("Сезоны БЕЗ составов (дыры):", gaps if gaps else "нет")
say("ИТОГО единая база:", len(all_df), "строк;", all_df.season.nunique(), "сезонов;",
    all_df.groupby(["season","club_name"]).ngroups, "клубов-сезонов")
print(all_df.groupby("season").agg(clubs=("club_name","nunique"), rows=("player_name","size"), src=("source","first")).to_string())
""")

code("""#@title 6. Сводка в файл
(OUTD / "stage2_summary.txt").write_text("\\n".join(SUMMARY), encoding="utf-8")
print("Сводка сохранена:", OUTD / "stage2_summary.txt")
print("Файлы:", [p.name for p in sorted(OUTD.glob('*'))])
""")

nb = {"cells": cells, "metadata": {"colab": {"provenance": [], "name": "UPL_stage2_parse.ipynb"},
      "kernelspec": {"name": "python3", "display_name": "Python 3"}, "language_info": {"name": "python"}},
      "nbformat": 4, "nbformat_minor": 0}
json.dump(nb, open("/home/claude/upl-dataset/UPL_stage2_parse.ipynb", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("written", len(cells), "cells")
