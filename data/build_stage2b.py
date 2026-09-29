"""Generates UPL_stage2b_fix.ipynb — position column support, duplicate-table diagnostics/dedupe, club-name inventory."""
import json
cells = []
def md(s): cells.append({"cell_type": "markdown", "metadata": {}, "source": s})
def code(s): cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": s})

md("""# Этап 2b — правки парсера и инвентаризация клубов

Читает только Drive, работает 1–2 минуты. Делает:
1. Перепарсивает страницы составов с поддержкой **колонки позиции** («Амплуа»/«Позиція»/«Позиция»).
2. Разбирается, почему в ru-2011/2012/2018 по ~65 игроков на клуб: показывает таблицы на каждый клуб и **убирает дубли** (один игрок в одном клубе-сезоне — одна строка).
3. Пересобирает `player_seasons_all.csv` и выгружает **компактные справочники**: все варианты названий клубов с сезонами и источниками (`club_names_inventory.csv`), выбросы по числу игроков (`club_size_outliers.csv`).
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
OUT = Path(OUT_DIR); WIKI = OUT / "wiki_raw"; OUTD = OUT / "out"
SUMMARY = []
def say(*a):
    s = " ".join(str(x) for x in a); print(s); SUMMARY.append(s)
say("Этап 2b запущен", datetime.datetime.now().strftime("%Y-%m-%d %H:%M"))
""")

code("""#@title 2. Парсер v2 (позиция из секций И из колонки; учёт нескольких таблиц на клуб)
UK_MONTHS = {m: i+1 for i, m in enumerate(["січня","лютого","березня","квітня","травня","червня","липня","серпня","вересня","жовтня","листопада","грудня"])}
RU_MONTHS = {m: i+1 for i, m in enumerate(["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"])}
POS_MAP = {
    "півзахисник": "MF", "полузащитник": "MF", "півзах": "MF", "полузащ": "MF",
    "воротар": "GK", "вратар": "GK", "голкіпер": "GK",
    "захисник": "DF", "защитник": "DF",
    "нападник": "FW", "нападающ": "FW", "форвард": "FW",
}
POS_ABBR = {  # значения в колонке позиции
    "вр": "GK", "в": "GK", "gk": "GK", "во": "GK",
    "з": "DF", "зщ": "DF", "защ": "DF", "зах": "DF", "df": "DF", "d": "DF",
    "п": "MF", "пз": "MF", "пів": "MF", "пол": "MF", "mf": "MF", "m": "MF", "хп": "MF",
    "н": "FW", "нп": "FW", "нап": "FW", "fw": "FW", "f": "FW",
}
HDR = {
    "name":    ["футболіст", "гравець", "игрок", "футболист", "ім'я", "имя", "прізвище", "фамилия"],
    "dob":     ["дата народження", "дата рождения", "народ", "рожд"],
    "country": ["країна", "громадянство", "страна", "гражданство"],
    "apps":    ["ігри", "матчі", "игры", "матчи", "и", "і", "м"],
    "goals":   ["голи", "голы", "г"],
    "number":  ["№", "номер"],
    "pos":     ["амплуа", "позиція", "позиция", "поз."],
}
def clean(s):
    s = re.sub(r"\\[.*?\\]", "", s or "")
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
    m = re.search(r"-?\\d+", (clean(s) or "").replace("\\u2212", "-").replace("\\u2013", "-"))
    return int(m.group()) if m else None
def pos_of(text):
    t = clean(text).lower()
    for k, v in POS_MAP.items():
        if k in t: return v
    return None
def pos_from_cell(text):
    t = clean(text).lower().strip(".")
    if not t: return None
    return POS_ABBR.get(t) or pos_of(t)
def col_index(headers, keys, exact_short=("и", "і", "г", "м", "в")):
    hs = [clean(h).lower() for h in headers]
    for k in keys:
        for i, h in enumerate(hs):
            if (k in exact_short and h == k) or (k not in exact_short and k in h):
                return i
    return None

def parse_squad_html(html, lang, season, page_title):
    soup = BeautifulSoup(html, "lxml")
    rows_out = []; heading = None; tcount = {}
    for el in soup.find_all(["h2", "h3", "h4", "table"]):
        if el.name != "table":
            txt = clean(el.get_text(" "))
            if txt: heading = txt
            continue
        trs = el.find_all("tr")
        if len(trs) < 3: continue
        hdr_row = next((tr for tr in trs if tr.find("th")), None)
        if hdr_row is None: continue
        headers = [clean(c.get_text(" ")) for c in hdr_row.find_all(["th", "td"])]
        ci = {k: col_index(headers, v) for k, v in HDR.items()}
        if ci["name"] is None or ci["apps"] is None: continue
        club = heading; tcount[club] = tcount.get(club, 0) + 1; tidx = tcount[club]
        pos = None
        for tr in trs:
            if tr is hdr_row: continue
            cells = tr.find_all(["td", "th"]); texts = [clean(c.get_text(" ")) for c in cells]
            if not any(texts): continue
            if len(cells) == 1 or (len(set(t for t in texts if t)) == 1 and pos_of(texts[0])):
                p = pos_of(texts[0])
                if p: pos = p
                continue
            if len(texts) <= max(ci["name"], ci["apps"]): continue
            name = texts[ci["name"]]
            if not name or name.lower() in ("футболіст", "игрок", "футболист"): continue
            goals_raw = texts[ci["goals"]] if ci["goals"] is not None and ci["goals"] < len(texts) else ""
            conceded = goals = None
            if re.search(r"\\d+\\s*(п|-п|проп)", goals_raw, re.I): conceded = first_int(goals_raw)
            else: goals = first_int(goals_raw)
            p_col = pos_from_cell(texts[ci["pos"]]) if ci["pos"] is not None and ci["pos"] < len(texts) else None
            if (p_col or pos) == "GK" and goals is not None and goals < 0:   # у вратарей «-12» = пропущенные
                conceded, goals = -goals, None
            rows_out.append({
                "season": season, "lang": lang, "page": page_title, "table_idx": tidx, "table_headers": " | ".join(headers),
                "club_heading": club, "position_group": p_col or pos,
                "number": texts[ci["number"]] if ci["number"] is not None and ci["number"] < len(texts) else None,
                "player_name": name,
                "dob": parse_date(texts[ci["dob"]]) if ci["dob"] is not None and ci["dob"] < len(texts) else None,
                "country": texts[ci["country"]] if ci["country"] is not None and ci["country"] < len(texts) else None,
                "apps": first_int(texts[ci["apps"]]), "goals": goals, "conceded": conceded,
            })
    return rows_out

UK_SQUAD_PAT = re.compile(r"склади команд", re.I); RU_SQUAD_PAT = re.compile(r"\\(составы\\)", re.I)
pages = {}
for lang in ["uk", "ru"]:
    base = WIKI / lang
    for sd in sorted(base.iterdir()):
        if sd.is_dir() and (sd / "_index.json").exists():
            idx = json.loads((sd / "_index.json").read_text(encoding="utf-8"))
            pages[(lang, int(sd.name))] = [(t, v["html"]) for t, v in idx.items()]

def parse_lang(lang, pat):
    rows = []
    for (lg, y), lst in sorted(pages.items()):
        if lg != lang: continue
        for title, fname in lst:
            if not pat.search(title): continue
            p = WIKI / lang / str(y) / fname
            if p.exists():
                try: rows += parse_squad_html(p.read_text(encoding="utf-8"), lang, y, title)
                except Exception: say(f"[{lang} {y}] ошибка: {title}: " + traceback.format_exc().splitlines()[-1])
    return pd.DataFrame(rows)

uk_raw = parse_lang("uk", UK_SQUAD_PAT); ru_raw = parse_lang("ru", RU_SQUAD_PAT)
for tag, df in (("uk", uk_raw), ("ru", ru_raw)):
    say(f"[{tag}] строк {len(df)}, без позиции {df.position_group.isna().mean():.0%} (было: uk 8%, ru 79%)")
""")

code("""#@title 3. Диагностика: несколько таблиц на клуб и дубли
def diag(df, tag):
    multi = df.groupby(["season", "club_heading"]).table_idx.max()
    multi = multi[multi > 1]
    say(f"[{tag}] клубов-сезонов с >1 таблицей: {len(multi)}; сезоны: {sorted(multi.reset_index().season.unique().tolist())}")
    if len(multi):
        ex = multi.reset_index().head(3)
        for _, r in ex.iterrows():
            sub = df[(df.season == r.season) & (df.club_heading == r.club_heading)]
            print(f"  пример {r.season} {r.club_heading}:")
            for ti, g in sub.groupby("table_idx"):
                print(f"    таблица {ti}: {len(g)} строк | заголовки: {g.table_headers.iloc[0][:110]}")
    dup = df.duplicated(["season", "club_heading", "player_name"], keep=False)
    say(f"[{tag}] дублей (тот же игрок в том же клубе-сезоне): {int(dup.sum())} строк")
diag(uk_raw, "uk"); diag(ru_raw, "ru")

def dedupe(df):
    # один игрок в одном клубе-сезоне — одна строка; оставляем запись с наибольшим числом матчей, позицию/дату заполняем из любой
    df = df.copy(); df["_apps"] = df.apps.fillna(-1)
    df = df.sort_values(["season", "club_heading", "player_name", "_apps"], ascending=[True, True, True, False])
    for c in ["position_group", "dob", "country", "goals", "conceded", "number"]:
        df[c] = df.groupby(["season", "club_heading", "player_name"])[c].transform(lambda s: s.ffill().bfill())
    return df.drop_duplicates(["season", "club_heading", "player_name"]).drop(columns="_apps")
uk_df = dedupe(uk_raw); ru_df = dedupe(ru_raw)
say(f"после дедупа: uk {len(uk_df)} строк, ru {len(ru_df)} строк")
per = ru_df.groupby(["season", "club_heading"]).size()
say("ru: игроков на клуб после дедупа — медиана", int(per.median()), "макс", int(per.max()))
print(ru_df.groupby("season").agg(clubs=("club_heading", "nunique"), rows=("player_name", "size")).T.to_string())
uk_df.to_csv(OUTD / "wiki_uk_squads.csv", index=False); ru_df.to_csv(OUTD / "wiki_ru_squads.csv", index=False)
""")

code("""#@title 4. Пересборка единой базы + инвентаризация клубов
kag = pd.read_csv(OUTD / "player_seasons_kaggle.csv")
kag_pos = {"Goalkeeper": "GK", "Defender": "DF", "Midfield": "MF", "Attack": "FW"}
kag_u = pd.DataFrame({
    "season": kag["season"], "club_name": kag["club_name"], "player_name": kag["name"].fillna(kag["player_name"]),
    "name_lang": "en", "dob": kag["date_of_birth"], "nationality": kag["country_of_citizenship"],
    "position_group": kag["position"].map(kag_pos), "sub_position": kag.get("sub_position"),
    "apps": kag["apps"], "goals": kag["goals"], "assists": kag["assists"], "minutes": kag["minutes"],
    "clean_sheets": kag["clean_sheets"], "conceded": None, "market_value_eur": kag.get("market_value_eur_at_season_start"),
    "tm_player_id": kag["player_id"], "tm_club_id": kag["club_id"], "source": "kaggle_tm",
})
def wiki_u(df, lang):
    return pd.DataFrame({
        "season": df["season"], "club_name": df["club_heading"], "player_name": df["player_name"], "name_lang": lang,
        "dob": df["dob"], "nationality": df["country"], "position_group": df["position_group"], "sub_position": None,
        "apps": df["apps"], "goals": df["goals"], "assists": None, "minutes": None, "clean_sheets": None,
        "conceded": df["conceded"], "market_value_eur": None, "tm_player_id": None, "tm_club_id": None, "source": f"wiki_{lang}",
    })
parts = [kag_u[kag_u.season >= KAGGLE_FROM_SEASON]]; choice = []
for y in range(1992, KAGGLE_FROM_SEASON):
    u = uk_df[uk_df.season == y]; r = ru_df[ru_df.season == y]
    if u.club_heading.nunique() >= 8: parts.append(wiki_u(u, "uk")); choice.append((y, "uk", u.club_heading.nunique(), len(u)))
    elif r.club_heading.nunique() >= 8: parts.append(wiki_u(r, "ru")); choice.append((y, "ru", r.club_heading.nunique(), len(r)))
    else: choice.append((y, "—", 0, 0))
all_df = pd.concat(parts, ignore_index=True)
all_df.to_csv(OUTD / "player_seasons_all.csv", index=False)
say("ИТОГО:", len(all_df), "строк;", all_df.season.nunique(), "сезонов;", all_df.groupby(["season","club_name"]).ngroups, "клубов-сезонов;",
    f"без позиции {all_df.position_group.isna().mean():.1%}")

# --- инвентаризация названий клубов (компактно, чтобы читать через Drive)
inv = (all_df.groupby(["club_name", "source"])
       .agg(first=("season", "min"), last=("season", "max"), seasons=("season", "nunique"), rows=("player_name", "size"))
       .reset_index().sort_values(["source", "club_name"]))
inv.to_csv(OUTD / "club_names_inventory.csv", index=False)
say("Вариантов названий клубов:", inv.club_name.nunique(), "→ club_names_inventory.csv")
# ru-названия тоже пригодятся для склейки
ru_inv = ru_df.groupby("club_heading").agg(first=("season","min"), last=("season","max"), seasons=("season","nunique")).reset_index()
ru_inv.to_csv(OUTD / "club_names_ru.csv", index=False)
# выбросы по размеру состава
sz = all_df.groupby(["season", "club_name", "source"]).size().rename("rows").reset_index()
sz[(sz.rows < 18) | (sz.rows > 45)].to_csv(OUTD / "club_size_outliers.csv", index=False)
say("Клубов-сезонов с <18 или >45 игроков:", int(((sz.rows < 18) | (sz.rows > 45)).sum()), "→ club_size_outliers.csv")
print(inv.to_string(index=False))
""")

code("""#@title 5. Сводка
(OUTD / "stage2b_summary.txt").write_text("\\n".join(SUMMARY), encoding="utf-8")
print("\\n".join(SUMMARY))
""")

nb = {"cells": cells, "metadata": {"colab": {"provenance": [], "name": "UPL_stage2b_fix.ipynb"},
      "kernelspec": {"name": "python3", "display_name": "Python 3"}, "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 0}
json.dump(nb, open("/home/claude/upl-dataset/UPL_stage2b_fix.ipynb", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("written", len(cells), "cells")
