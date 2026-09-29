# -*- coding: utf-8 -*-
"""Generates UPL_stage3_link.ipynb — canonical clubs, main-squad selection for ru, person linking across sources, final tables."""
import json
cells = []
def md(s): cells.append({"cell_type": "markdown", "metadata": {}, "source": s})
def code(s): cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": s})

md("""# Этап 3 — канонические клубы, чистка 2011, связка игроков между источниками

Читает `UPL-data/out/` и справочники `UPL-data/ref/` (их кладёт Claude). Работает 1–3 минуты.

1. Каждому названию клуба присваивается **канонический клуб** (51 клуб за всю историю УПЛ) с именем укр/англ.
2. Для сезонов из русской Википедии, где на клуб пришлось две таблицы (основа + молодёжка), оставляется **основной состав** — таблица со старшим медианным возрастом.
3. Игроки **связываются между источниками** по дате рождения + фамилии (транслитерация), чтобы Ярмоленко-2010 (укр.) и Yarmolenko-2013 (Transfermarkt) были одним человеком → `person_id`.
4. Итог: `player_seasons_final.csv`, `persons.csv`, `clubs_final.csv`, сводка `stage3_summary.txt`.
""")

code("""#@title 1. Настройки и Drive
OUT_DIR = "/content/drive/MyDrive/UPL-data"  #@param {type:"string"}
KAGGLE_FROM_SEASON = 2012  #@param {type:"integer"}
#@markdown Если в сезоне Kaggle медиана игроков на клуб ниже этого порога — сезон берётся из Википедии (касается 2021/22)
KAGGLE_MIN_MEDIAN_PER_CLUB = 20  #@param {type:"integer"}
import re, json, datetime, difflib, unicodedata
from pathlib import Path
from google.colab import drive
drive.mount('/content/drive', force_remount=False)
import pandas as pd, numpy as np
OUT = Path(OUT_DIR); OUTD = OUT / "out"; REF = OUT / "ref"
SUMMARY = []
def say(*a):
    s = " ".join(str(x) for x in a); print(s); SUMMARY.append(s)
say("Этап 3 запущен", datetime.datetime.now().strftime("%Y-%m-%d %H:%M"))
aliases = pd.read_csv(REF / "club_aliases.csv"); canon = pd.read_csv(REF / "clubs_canonical.csv")
def norm_club(s):
    s = str(s).replace("ё", "е").replace("Ё", "Е")
    s = re.sub(r"[«»“”„']", " ", s).replace('"', " ")
    s = re.sub(r"\s*\(\s*", " (", s); s = re.sub(r"\s*\)\s*", ") ", s)
    return re.sub(r"\s+", " ", s).strip().lower()
ALIAS = {norm_club(n): c for n, c in zip(aliases.club_name, aliases.canonical_id)}
say("Справочник: канонических клубов", len(canon), "| алиасов", len(ALIAS))
""")

code("""#@title 2. Основной состав для сезонов из ru-Википедии (две таблицы на клуб → берём старшую по возрасту)
uk = pd.read_csv(OUTD / "wiki_uk_squads.csv"); ru = pd.read_csv(OUTD / "wiki_ru_squads.csv")
def keep_main_table(df, tag):
    if "table_idx" not in df.columns: return df
    df = df.copy(); df["byear"] = pd.to_numeric(df["dob"].astype(str).str[:4], errors="coerce")
    med = df.groupby(["season", "club_heading", "table_idx"]).byear.median().reset_index()
    multi = med.groupby(["season", "club_heading"]).table_idx.nunique()
    multi = multi[multi > 1].reset_index()[["season", "club_heading"]]
    if multi.empty:
        say(f"[{tag}] клубов с несколькими таблицами нет"); return df.drop(columns="byear")
    # выбираем таблицу с минимальным медианным годом рождения (старшие игроки = основа)
    best = med.merge(multi).sort_values(["season", "club_heading", "byear", "table_idx"]).drop_duplicates(["season", "club_heading"])
    best = best.rename(columns={"table_idx": "keep_idx"})[["season", "club_heading", "keep_idx"]]
    df = df.merge(best, on=["season", "club_heading"], how="left")
    before = len(df)
    df = df[df.keep_idx.isna() | (df.table_idx == df.keep_idx)].drop(columns=["keep_idx", "byear"])
    say(f"[{tag}] клубов-сезонов с несколькими таблицами: {len(multi)}; убрано строк молодёжки/дублей: {before - len(df)}")
    ex = med.merge(multi).head(6)
    print(ex.to_string(index=False))
    return df
uk = keep_main_table(uk, "uk"); ru = keep_main_table(ru, "ru")
# в ru-таблицах 2011/12 и 2021/22 в состав попадают главные тренеры (Луческу, Сёмин, Маркевич…) и списки «пришёл/ушёл» без статистики
ru["_age"] = ru.season - pd.to_numeric(ru.dob.astype(str).str[:4], errors="coerce")
coach = ru._age.ge(37) & ru.position_group.ne("GK")
junk = ru.apps.isna()
ru[coach | junk].assign(kind=np.where(coach[coach | junk], "coach", "no_stats"))[["season", "club_heading", "player_name", "dob", "apps", "kind"]] \
    .to_csv(OUTD / "stage3_dropped_ru_rows.csv", index=False)
say(f"[ru] убрано тренеров/строк без статистики: {int(coach.sum())} / {int((junk & ~coach).sum())} (список: out/stage3_dropped_ru_rows.csv)")
ru = ru[~(coach | junk)].drop(columns="_age")
per = ru.groupby(["season", "club_heading"]).size()
say("ru после чистки: игроков на клуб — медиана", int(per.median()), "макс", int(per.max()))
""")

code("""#@title 3. Единая база v3: выбор источника по сезонам + канонические клубы
kag = pd.read_csv(OUTD / "player_seasons_kaggle.csv")
kag_pos = {"Goalkeeper": "GK", "Defender": "DF", "Midfield": "MF", "Attack": "FW"}
kag_u = pd.DataFrame({
    "season": kag["season"], "club_name": kag["club_name"], "player_name": kag["name"].fillna(kag["player_name"]), "name_lang": "en",
    "dob": kag["date_of_birth"].astype(str).str[:10].replace("nan", None), "nationality": kag["country_of_citizenship"],
    "position_group": kag["position"].map(kag_pos), "sub_position": kag.get("sub_position"),
    "apps": kag["apps"], "goals": kag["goals"], "assists": kag["assists"], "minutes": kag["minutes"],
    "clean_sheets": kag["clean_sheets"], "conceded": np.nan, "market_value_eur": kag.get("market_value_eur_at_season_start"),
    "tm_player_id": kag["player_id"], "tm_club_id": kag["club_id"], "source": "kaggle_tm",
})
def wiki_u(df, lang):
    return pd.DataFrame({
        "season": df["season"], "club_name": df["club_heading"], "player_name": df["player_name"], "name_lang": lang,
        "dob": df["dob"], "nationality": df["country"], "position_group": df["position_group"], "sub_position": None,
        "apps": df["apps"], "goals": df["goals"], "assists": np.nan, "minutes": np.nan, "clean_sheets": np.nan,
        "conceded": df["conceded"], "market_value_eur": np.nan, "tm_player_id": np.nan, "tm_club_id": np.nan, "source": f"wiki_{lang}",
    })
parts, choice = [], []
for y in range(1992, 2026):
    u = uk[uk.season == y]; r = ru[ru.season == y]; k = kag_u[kag_u.season == y]
    k_med = k.groupby("club_name").size().median() if len(k) else 0
    if y >= KAGGLE_FROM_SEASON and len(k) and k_med >= KAGGLE_MIN_MEDIAN_PER_CLUB:
        parts.append(k); choice.append((y, "kaggle_tm", k.club_name.nunique(), len(k)))
    elif u.club_heading.nunique() >= 8:
        parts.append(wiki_u(u, "uk")); choice.append((y, "wiki_uk", u.club_heading.nunique(), len(u)))
    elif r.club_heading.nunique() >= 8:
        parts.append(wiki_u(r, "ru")); choice.append((y, "wiki_ru", r.club_heading.nunique(), len(r)))
    elif len(k):
        parts.append(k); choice.append((y, "kaggle_tm(thin)", k.club_name.nunique(), len(k)))
    else:
        choice.append((y, "—", 0, 0))
all_df = pd.concat(parts, ignore_index=True)
ch = pd.DataFrame(choice, columns=["season", "source", "clubs", "rows"])
print(ch.to_string(index=False))
# канонические клубы
all_df["canonical_id"] = all_df["club_name"].map(lambda x: ALIAS.get(norm_club(x)))
unm = all_df[all_df.canonical_id.isna()].club_name.value_counts()
if len(unm):
    say("ВНИМАНИЕ: названия без канонического клуба:", unm.to_dict())
all_df = all_df.merge(canon[["canonical_id", "name_uk", "name_en", "city_uk"]], on="canonical_id", how="left")
say("v3:", len(all_df), "строк;", all_df.season.nunique(), "сезонов;", all_df.groupby(["season", "canonical_id"]).ngroups, "клубов-сезонов;",
    all_df.canonical_id.nunique(), "канонических клубов")
""")

code("""#@title 4. Связка игроков между источниками → person_id
CYR = {  # укр + рус → латиница (для сопоставления, не для отображения)
 'а':'a','б':'b','в':'v','г':'h','ґ':'g','д':'d','е':'e','є':'e','ж':'zh','з':'z','и':'y','і':'i','ї':'i','й':'i','к':'k','л':'l','м':'m',
 'н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ь':'','ю':'iu','я':'ia',
 'ы':'y','э':'e','ё':'e','ъ':'',"'":'','ʼ':'','’':'',
}
def translit(s):
    return "".join(CYR.get(ch, ch) for ch in s.lower())
def skeleton(s):
    \"\"\"фонетический скелет фамилии: латиница без диакритики, y→i, kh→h, схлопнутые повторы\"\"\"
    s = translit(str(s)); s = unicodedata.normalize("NFKD", s); s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z]", "", s.lower())
    s = s.replace("kh", "h").replace("shch", "sch").replace("zh", "j").replace("ii", "i").replace("iy", "i").replace("yi", "i").replace("y", "i").replace("ie", "e")
    return re.sub(r"(.)\\1", r"\\1", s)
COMMON_FIRST = set("oleksandr aleksandr andri andrei serhi serhei sergei volodimir vladimir oleh oleg ihor igor iuri mikola nikolai dmitro dmitri ievhen evheni evgeni maksim denis artem vitali roman ruslan pavlo pavel taras viktor vasil anatoli valeri kostiantin konstantin oleksi aleksei iaroslav bohdan bogdan mihailo mihail ivan anton stanislav vladislav vladyslav oleksii valentin vadim vacheslav viacheslav iehor egor illia ilia danilo daniil kirilo kirill mikita nikita vitalii heorhi georgi grigori hrihori eduard leonid boris petro piotr fedir fedor iakiv semen tymur timur marian nazar bohdan ostap orest".split())
PATRONYMIC = re.compile(r"(ович|евич|йович|ьович|іч|ич|івна|ївна|овна|евна|ична|инична)$", re.I)
def name_keys(name, lang):
    \"\"\"скелеты фамилии (основной ключ) + доп. токены для иностранцев вида «Дуглас Коста»; частые имена не используются как ключи\"\"\"
    toks = [t for t in re.split(r"[\\s,]+", str(name).strip()) if t and not t.startswith("(")]
    if not toks: return frozenset()
    if lang == "en":
        prim = toks[-1]; extra = toks[:-1]
    else:
        prim = toks[0]
        # «Прізвище Ім'я По батькові» → только фамилия; иностранные многочастные имена («Соуза да Сільва Луіс Адріано») → все части
        extra = [] if (len(toks) == 3 and PATRONYMIC.search(toks[2])) else toks[1:]
    keys = {skeleton(prim)}
    keys |= {skeleton(t) for t in extra if len(skeleton(t)) >= 4 and skeleton(t) not in COMMON_FIRST}
    keys = {k for k in keys if k}
    return frozenset(k for k in keys if len(k) >= 3) or frozenset(keys)   # «де», «да» не годятся как ключ
all_df["name_keys"] = [name_keys(n, l) for n, l in zip(all_df.player_name, all_df.name_lang)]
all_df["dob"] = all_df["dob"].where(all_df["dob"].astype(str).str.match(r"\\d{4}-\\d{2}-\\d{2}"), None)
# «1989-00-00» = известен только год рождения (так парсились некоторые таблицы ru-Википедии) → точной даты нет, есть год
all_df["dob_year"] = all_df["dob"].astype(str).str[:4].where(all_df["dob"].notna(), None)
all_df["dob_exact"] = all_df["dob"].where(~all_df["dob"].astype(str).str.endswith("-00-00"), None)
yo = all_df.dob.notna() & all_df.dob_exact.isna()
say("Строк только с годом рождения (без точной даты):", int(yo.sum()), "| по источникам:", all_df[yo].groupby("source").size().to_dict())

# 1) люди из Transfermarkt — якорь
persons = {}   # person_id -> dict
for pid, g in all_df[all_df.tm_player_id.notna()].groupby("tm_player_id"):
    d = g.dob_exact.dropna().iloc[0] if g.dob_exact.notna().any() else None
    persons[f"tm:{int(pid)}"] = {"person_id": f"tm:{int(pid)}", "dob": d, "year": (d or "")[:4] or None, "clubs": set(g.canonical_id.dropna()),
                                 "keys": set().union(*g.name_keys), "name_en": g.player_name.iloc[0], "name_uk": None, "name_ru": None}
by_dob, by_year = {}, {}
def index_person(p):
    if p["dob"]: by_dob.setdefault(p["dob"], []).append(p)
    if p["year"]: by_year.setdefault(p["year"], []).append(p)
for p in persons.values(): index_person(p)

def sim(keys, p):
    return max((difflib.SequenceMatcher(None, a, b).ratio() for a in keys for b in p["keys"]), default=0)
def best_match(keys, dob):
    best, score = None, 0.0
    for p in by_dob.get(dob, []):
        s = sim(keys, p)
        if s > score: best, score = p, s
    return (best, score) if best and score >= 0.6 else (None, score)
def best_match_year(keys, year, club):
    # без точной даты: тот же год рождения + очень похожая фамилия + тот же клуб в карьере; кандидат должен быть единственным
    scored = sorted(((sim(keys, p), p) for p in by_year.get(year, []) if club in p["clubs"]), key=lambda t: -t[0])
    if scored and scored[0][0] >= 0.8 and (len(scored) == 1 or scored[0][0] - scored[1][0] >= 0.1): return scored[0][1]
    return None

all_df["person_id"] = None
tm_mask = all_df.tm_player_id.notna()
all_df.loc[tm_mask, "person_id"] = "tm:" + all_df.loc[tm_mask, "tm_player_id"].astype(int).astype(str)
linked_tm = linked_wiki = linked_year = new_wiki = nodob = 0
wiki_rows = all_df[~tm_mask].sort_values(["season"])
for idx, r in wiki_rows.iterrows():
    if pd.isna(r.dob) or not str(r.dob).strip():
        slug = re.sub(r"\\s+", "_", str(r.player_name).lower())
        pid = f"w:{r.name_lang}:{slug}"; nodob += 1
        persons.setdefault(pid, {"person_id": pid, "dob": None, "year": None, "clubs": set(), "keys": set(r.name_keys), "name_en": None, "name_uk": None, "name_ru": None})
        p = persons[pid]
    else:
        p = None; d_exact = None if pd.isna(r.dob_exact) else r.dob_exact; d_year = None if pd.isna(r.dob_year) else r.dob_year
        if d_exact: p, sc = best_match(r.name_keys, d_exact)
        if p is None and d_year and not d_exact:   # запасной путь только для строк без точной даты
            p = best_match_year(r.name_keys, d_year, r.canonical_id)
            if p is not None: linked_year += 1
        elif p is not None:
            if p["person_id"].startswith("tm:"): linked_tm += 1
            else: linked_wiki += 1
        if p is not None:
            pid = p["person_id"]; p["keys"] |= set(r.name_keys)
            if not p["dob"] and d_exact:   # у человека была только «год», теперь есть точная дата
                p["dob"] = d_exact; by_dob.setdefault(d_exact, []).append(p)
        else:
            pid = f"w:{r.dob}:{sorted(r.name_keys)[0] if r.name_keys else 'x'}"; new_wiki += 1
            p = {"person_id": pid, "dob": d_exact, "year": d_year, "clubs": set(), "keys": set(r.name_keys), "name_en": None, "name_uk": None, "name_ru": None}
            persons[pid] = p; index_person(p)
    if pd.notna(r.canonical_id): p["clubs"].add(r.canonical_id)
    if r.name_lang == "uk" and not p["name_uk"]: p["name_uk"] = r.player_name
    if r.name_lang == "ru" and not p["name_ru"]: p["name_ru"] = r.player_name
    all_df.at[idx, "person_id"] = pid
say(f"Связка: строк из Википедии {len(wiki_rows)} → привязано к Transfermarkt {linked_tm}, склеено между собой {linked_wiki}, по году+клубу {linked_year}, новых людей {new_wiki}, без даты рождения {nodob}")
say("Всего людей (person_id):", all_df.person_id.nunique())
for probe in ["Мхитарян", "Мхітарян", "Цыганков", "Tsygankov", "Ракицкий", "Ракицький", "Селезнёв", "Селезньов"]:
    hit = all_df[all_df.player_name.str.contains(probe, na=False)]
    for pid in hit.person_id.unique()[:2]:
        tl = all_df[all_df.person_id == pid].sort_values("season")
        say(f"  {probe}: {pid} → " + ", ".join(f"{s}{'*' if l == 'ru' else ''}" for s, l in zip(tl.season, tl.name_lang)) + f" | dob {tl.dob.iloc[0]}")
# санити-чек на известных игроках
for probe in ["Ярмоленко", "Шовковськ", "Ребров", "Срна", "Шевченко Андрій", "Ротань"]:
    hit = all_df[all_df.player_name.str.contains(probe, na=False)]
    if len(hit):
        pid = hit.person_id.iloc[0]; tl = all_df[all_df.person_id == pid].sort_values("season")
        print(f"{probe}: person {pid} → " + ", ".join(f"{s} {c} [{l}]" for s, c, l in zip(tl.season, tl.name_uk, tl.name_lang)))
""")

code("""#@title 5. Итоговые таблицы
persons_df = pd.DataFrame(persons.values()).drop(columns=["keys", "clubs"])
agg = all_df.groupby("person_id").agg(first_season=("season", "min"), last_season=("season", "max"), seasons=("season", "nunique"),
                                      clubs=("name_uk", lambda s: " / ".join(pd.unique(s.dropna()))), total_apps=("apps", "sum"),
                                      total_goals=("goals", "sum"), nationality=("nationality", "first"), position_group=("position_group", lambda s: s.mode().iloc[0] if s.notna().any() else None))
persons_df = persons_df.merge(agg, on="person_id", how="left").sort_values(["last_season", "total_apps"], ascending=[False, False])
# единые украинские имена «Ім'я Прізвище» (ref/names_uk.csv); для новых person_id — запасной вариант из name_uk без по батькові
PATR_ = re.compile(r"(ович|евич|йович|ьович|іч|ич|івна|ївна|овна|евна|ична|инична)$", re.I)
def fallback_uk(n):
    t = str(n).split() if isinstance(n, str) else []
    if len(t) == 3 and PATR_.search(t[2]): return f"{t[1]} {t[0]}"
    return " ".join(t[1:] + t[:1]) if len(t) == 2 else (n if isinstance(n, str) else None)
NAMES_UK = {}
_parts = sorted(REF.glob("names_uk_ref_part*.csv"))
if _parts:
    NAMES_UK = pd.concat([pd.read_csv(f) for f in _parts]).drop_duplicates("person_id").set_index("person_id").display_uk.to_dict()
def _s(v): return v if isinstance(v, str) and v.strip() else None
persons_df["display_uk"] = [NAMES_UK.get(p) or fallback_uk(_s(u)) or _s(r) or _s(e) for p, u, r, e in
                            zip(persons_df.person_id, persons_df.name_uk, persons_df.name_ru, persons_df.name_en)]
say("Украинские имена: из справочника", int(persons_df.person_id.isin(NAMES_UK.keys()).sum()), "(остальные — из укр. Википедии без по батькові) из", len(persons_df))
all_df["display_uk"] = all_df.person_id.map(persons_df.set_index("person_id").display_uk)
persons_df.to_csv(OUTD / "persons.csv", index=False)

clubs_final = all_df.groupby("canonical_id").agg(first_season=("season", "min"), last_season=("season", "max"), seasons=("season", "nunique"),
                                                 player_seasons=("person_id", "size"), players=("person_id", "nunique")).reset_index()
clubs_final = canon.merge(clubs_final, on="canonical_id", how="left").sort_values("seasons", ascending=False)
clubs_final.to_csv(OUTD / "clubs_final.csv", index=False)

cols = ["season", "canonical_id", "name_uk", "name_en", "club_name", "person_id", "display_uk", "player_name", "name_lang", "dob", "nationality",
        "position_group", "sub_position", "apps", "goals", "assists", "minutes", "clean_sheets", "conceded", "market_value_eur", "tm_player_id", "source"]
all_df[cols].sort_values(["season", "name_uk", "apps"], ascending=[True, True, False]).to_csv(OUTD / "player_seasons_final.csv", index=False)
say("ФИНАЛ: player_seasons_final.csv —", len(all_df), "строк;", all_df.person_id.nunique(), "людей;", all_df.canonical_id.nunique(), "клубов;",
    all_df.season.nunique(), "сезонов")
print(clubs_final[["canonical_id", "name_uk", "first_season", "last_season", "seasons", "players"]].to_string(index=False))
(OUTD / "stage3_summary.txt").write_text("\\n".join(SUMMARY), encoding="utf-8")
""")

nb = {"cells": cells, "metadata": {"colab": {"provenance": [], "name": "UPL_stage3_link.ipynb"},
      "kernelspec": {"name": "python3", "display_name": "Python 3"}, "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 0}
json.dump(nb, open("/home/claude/upl-dataset/UPL_stage3_link.ipynb", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("written", len(cells), "cells")
