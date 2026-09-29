# -*- coding: utf-8 -*-
"""Generates UPL_stage4_ratings.ipynb — standings, GK conceded, per-season position-aware ratings, person×club pool, reports."""
import json
cells = []
def md(s): cells.append({"cell_type": "markdown", "metadata": {}, "source": s})
def code(s): cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": s})

md(r"""# Этап 4 — рейтинги игроков

Читает `UPL-data/out/player_seasons_final.csv` (этап 3), кэш Kaggle (`UPL-data/kaggle/`) и сырые страницы Википедии (`UPL-data/wiki_raw/`). Работает 2–5 минут.

1. **Таблицы чемпионата** по каждому сезону: 2012+ считаются из матчей Kaggle/Transfermarkt, 1992–2011 и 2021 — из сохранённых страниц Википедии. Если для какого-то сезона таблицу не удалось распарсить, сила клуба оценивается по голам его игроков (помечается `proxy`).
2. **Пропущенные голы вратарей** для сезонов Kaggle досчитываются из поматчевых данных.
3. **Рейтинг** считается внутри сезона и внутри позиции (вратарь / защитник / полузащитник / нападающий): голы и ассисты за матч со сглаживанием, доля сыгранных матчей, сила команды, сухие/пропущенные. Перцентиль → шкала 45–99. Малое число матчей тянет рейтинг вниз.
4. **Ручные поправки** — файл `UPL-data/ref/rating_overrides.csv` (создаётся пустым шаблоном; можно править).
5. Итог: `ratings_player_seasons.csv`, `ratings_person_club.csv` (карточки «игрок в клубе» с пиковым рейтингом и скрытым модификатором), `standings.csv`, отчёты `top20_by_season.txt`, `top100_alltime.txt`, `stage4_summary.txt`.
""")

code(r"""#@title 1. Настройки и Drive
OUT_DIR = "/content/drive/MyDrive/UPL-data"  #@param {type:"string"}
#@markdown Сглаживание показателей «за матч»: чем больше, тем сильнее короткие серии тянутся к среднему по лиге
K_SHRINK = 6  #@param {type:"integer"}
#@markdown Сколько матчей нужно, чтобы рейтинг «раскрылся» полностью (меньше — рейтинг тянется к нижней границе)
FULL_SAMPLE_APPS = 8  #@param {type:"integer"}
#@markdown Шкала: перцентиль внутри сезона и позиции → нормальное распределение со средним RATING_MID и разбросом RATING_SD, обрезка [RATING_MIN, RATING_MAX]
RATING_MID = 72  #@param {type:"integer"}
RATING_SD = 10  #@param {type:"integer"}
RATING_MIN = 45  #@param {type:"integer"}
RATING_MAX = 99  #@param {type:"integer"}
#@markdown К какому значению тянется рейтинг игрока с малым числом матчей
RATING_REPLACEMENT = 50  #@param {type:"integer"}
#@markdown Выравнивание позиций: лучший вратарь сезона получает тот же потолок, что лучший полузащитник, хотя вратарей в 3–4 раза меньше
RATING_REF_GROUP = 150  #@param {type:"integer"}
HIDDEN_MOD_SD = 1.5  #@param {type:"number"}
SEED = 30  #@param {type:"integer"}
import re, json, datetime, hashlib, unicodedata, difflib
from statistics import NormalDist
from pathlib import Path
try:
    from google.colab import drive
    drive.mount('/content/drive', force_remount=False)
except Exception as e:
    print("Colab drive недоступен (запуск вне Colab):", e)
import pandas as pd, numpy as np
from bs4 import BeautifulSoup
OUT = Path(OUT_DIR); OUTD = OUT / "out"; REF = OUT / "ref"; KAG = OUT / "kaggle"; WRAW = OUT / "wiki_raw"
SUMMARY = []
def say(*a):
    s = " ".join(str(x) for x in a); print(s); SUMMARY.append(s)
say("Этап 4 запущен", datetime.datetime.now().strftime("%Y-%m-%d %H:%M"))
aliases = pd.read_csv(REF / "club_aliases.csv"); canon = pd.read_csv(REF / "clubs_canonical.csv")
def norm_club(s):
    s = str(s).replace("ё", "е").replace("Ё", "Е")
    s = re.sub(r"[«»“”„']", " ", s).replace('"', " ")
    s = re.sub(r"\s*\(\s*", " (", s); s = re.sub(r"\s*\)\s*", ") ", s)
    return re.sub(r"\s+", " ", s).strip().lower()
ALIAS = {norm_club(n): c for n, c in zip(aliases.club_name, aliases.canonical_id)}
CANON_NAME = dict(zip(canon.canonical_id, canon.name_uk))
df = pd.read_csv(OUTD / "player_seasons_final.csv")
persons = pd.read_csv(OUTD / "persons.csv")
say("Загружено: игрок-сезонов", len(df), "| сезонов", df.season.nunique(), "| клубов", df.canonical_id.nunique(), "| людей", df.person_id.nunique())
SEASON_STATUS = {2021: "abandoned_18_rounds"}   # 2025/26 завершён; следующий сезон в базу пока не входит
season_clubs = df.groupby("season").canonical_id.apply(lambda s: set(s.dropna())).to_dict()
""")

code(r"""#@title 2. Таблицы чемпионата: Kaggle (матчи) + Википедия (сохранённые страницы)
# ---------- 2a. Kaggle: считаем таблицу из матчей ----------
standings = []
try:
    games = pd.read_csv(KAG / "games.csv", low_memory=False)
    g = games[games["competition_id"].eq("UKR1")].copy()
    club_names = pd.concat([g[["home_club_id", "home_club_name"]].rename(columns={"home_club_id": "club_id", "home_club_name": "club_name"}),
                            g[["away_club_id", "away_club_name"]].rename(columns={"away_club_id": "club_id", "away_club_name": "club_name"})]).dropna().drop_duplicates("club_id")
    KAG_CANON = {int(cid): ALIAS.get(norm_club(n)) for cid, n in zip(club_names.club_id, club_names.club_name)}
    miss = [n for cid, n in zip(club_names.club_id, club_names.club_name) if KAG_CANON.get(int(cid)) is None]
    if miss: say("Kaggle: клубы без канонического id:", miss)
    home = pd.DataFrame({"season": g.season, "club_id": g.home_club_id, "gf": g.home_club_goals, "ga": g.away_club_goals})
    away = pd.DataFrame({"season": g.season, "club_id": g.away_club_id, "gf": g.away_club_goals, "ga": g.home_club_goals})
    cg = pd.concat([home, away], ignore_index=True).dropna(subset=["gf", "ga"])
    cg["w"] = (cg.gf > cg.ga).astype(int); cg["d"] = (cg.gf == cg.ga).astype(int); cg["l"] = (cg.gf < cg.ga).astype(int)
    cg["pts"] = cg.w * 3 + cg.d
    st = cg.groupby(["season", "club_id"]).agg(games=("gf", "size"), w=("w", "sum"), d=("d", "sum"), l=("l", "sum"), gf=("gf", "sum"), ga=("ga", "sum"), pts=("pts", "sum")).reset_index()
    st["canonical_id"] = st.club_id.astype(int).map(KAG_CANON)
    st = st.dropna(subset=["canonical_id"]).drop(columns="club_id")
    st["source"] = "kaggle_games"
    standings.append(st)
    say("Kaggle: таблицы посчитаны для сезонов", sorted(st.season.unique().tolist()))
except Exception as e:
    say("Kaggle games.csv не прочитан:", repr(e))

# ---------- 2b. Википедия: ищем турнирную таблицу в сохранённых html ----------
def cell_text(td):
    for s in td.find_all(["sup", "style", "script"]): s.decompose()
    return re.sub(r"\s+", " ", td.get_text(" ", strip=True)).strip()
def first_int(s):
    m = re.search(r"-?\d+", str(s).replace("−", "-")); return int(m.group()) if m else None
TEAM_H = {"команда", "клуб", "команди", "команды", "team", "club"}
PTS_H = {"о", "очки", "очок", "о.", "pts", "points", "очков"}
GAMES_H = {"і", "ігри", "ігор", "матчі", "и", "игры", "игр", "м", "pld", "p", "мат."}
POS_H = {"місце", "м", "м.", "#", "№", "поз", "поз.", "место", "pos", "позиція", "позиция", "місце в таблиці"}
GF_H = {"гз", "зг", "забиті", "забито", "з", "gf", "мз", "забитые", "зм"}
GA_H = {"гп", "пг", "пропущені", "пропущено", "ga", "мп", "пропущенные", "пм"}
GOALS_H = {"голи", "голы", "м'ячі", "м’ячі", "мячи", "м’ячі (з–п)", "г", "г (з–п)", "gf–ga", "gf-ga", "р/м", "м'ячі (з—п)"}
DEBUG = []
def parse_standing_tables(html, rejects=None):
    soup = BeautifulSoup(html, "lxml"); found = []
    def reject(why, hdr=None):
        if rejects is not None: rejects.append((why, " | ".join(hdr or [])[:160]))
    for t in soup.find_all("table"):
        rows = t.find_all("tr")
        if len(rows) < 6: continue
        hdr = None
        for hi, r in enumerate(rows[:3]):
            txt = []
            for c in r.find_all(["th", "td"]):   # colspan раскрываем, чтобы индексы колонок совпадали с данными
                try: span = max(1, int(c.get("colspan", 1)))
                except Exception: span = 1
                txt += [cell_text(c).lower().strip(" .")] * span
            if any(x in TEAM_H for x in txt) and any(x in PTS_H for x in txt):
                hdr = txt; hstart = hi; break
        if hdr is None:
            first = [cell_text(c).lower() for c in rows[0].find_all(["th", "td"])]
            if any(x in TEAM_H for x in first): reject("нет колонки очков", first)
            continue
        used = set()
        def col(names, take=True):
            for i, h in enumerate(hdr):
                if h in names and i not in used:
                    if take: used.add(i)
                    return i
            return None
        i_team, i_pts, i_pos = col(TEAM_H), col(PTS_H), col(POS_H)   # сначала место — чтобы «М» (місце) не приняли за матчи
        i_g = col(GAMES_H)
        i_gf, i_ga, i_goals = col(GF_H), col(GA_H), col(GOALS_H)
        # если "п" одновременно и поражения, и пропущенные — не доверяем GA по "п"
        if i_ga is not None and hdr[i_ga] == "п" and hdr.count("п") > 1: i_ga = None
        out = []; counter = 0
        for r in rows[hstart + 1:]:
            cells = r.find_all(["th", "td"])
            if len(cells) <= max(i_team, i_pts): continue
            team = cell_text(cells[i_team])
            team = re.sub(r"\((?:[А-ЯЁЇІЄҐA-Z]{1,2})\)", "", team)   # (Ч), (В), (П)
            team = re.sub(r"\[.*?\]", "", team).strip(" .,;")
            pts = first_int(cell_text(cells[i_pts]))
            if not team or pts is None: continue
            counter += 1
            pos = first_int(cell_text(cells[i_pos])) if i_pos is not None and i_pos < len(cells) else None
            gp = first_int(cell_text(cells[i_g])) if i_g is not None and i_g < len(cells) else None
            gf = ga = None
            if i_gf is not None and i_ga is not None and max(i_gf, i_ga) < len(cells):
                gf, ga = first_int(cell_text(cells[i_gf])), first_int(cell_text(cells[i_ga]))
            elif i_goals is not None and i_goals + 1 < len(hdr) and hdr[i_goals + 1] == hdr[i_goals] and i_goals + 1 < len(cells):
                gf, ga = first_int(cell_text(cells[i_goals])), first_int(cell_text(cells[i_goals + 1]))   # «Голи» на две колонки
            elif i_goals is not None and i_goals < len(cells):
                m = re.findall(r"\d+", cell_text(cells[i_goals]))
                if len(m) >= 2: gf, ga = int(m[0]), int(m[1])
            out.append({"pos": pos if pos else counter, "team": team, "games": gp, "gf": gf, "ga": ga, "pts": pts})
        if len(out) < 8: reject(f"мало строк ({len(out)})", hdr); continue
        tb = pd.DataFrame(out)
        # проверки: очки в таблице идут по убыванию (таблица отсортирована по местам) и не превышают 3 очка за матч
        mono = (np.diff(tb.pts.values) <= 0).mean() if len(tb) > 1 else 1.0
        if mono < 0.85: reject(f"очки не по убыванию ({mono:.2f})", hdr); continue
        if tb.games.notna().any() and (tb.pts > 3 * tb.games.fillna(99) + 1).mean() > 0.3: reject("очков больше, чем 3 за матч", hdr); continue
        found.append(tb)
    return found

ALIAS_BY_CID = {}
for n, c in ALIAS.items(): ALIAS_BY_CID.setdefault(c, set()).add(n.split(" (")[0].strip())
for c, n in CANON_NAME.items(): ALIAS_BY_CID.setdefault(c, set()).add(norm_club(n).split(" (")[0].strip())
def resolve_table(teams, season):
    # 1) точное совпадение по алиасу (клуб должен играть в этом сезоне); 2) без города — по первому слову среди ещё не занятых клубов сезона
    clubs = season_clubs.get(season, set()); taken = set()
    norms = [norm_club(t) for t in teams]; cids = [None] * len(norms); hows = ["unmatched"] * len(norms)
    for i, n in enumerate(norms):
        c = ALIAS.get(n)
        if c is not None and c in clubs and c not in taken: cids[i], hows[i] = c, "alias"; taken.add(c)
        elif c is not None: hows[i] = "alias_not_in_season"
    for i, n in enumerate(norms):
        if cids[i] or hows[i] == "alias_not_in_season": continue
        tok = n.split(" (")[0].strip(); tok1 = tok.split(" ")[0]   # «ильичевец мариуполь» → сравниваем и целиком, и по первому слову
        scored = sorted(((max(max(difflib.SequenceMatcher(None, t, an).ratio() for an in ALIAS_BY_CID.get(cid, {""})) for t in {tok, tok1}), cid) for cid in clubs - taken), reverse=True)
        if scored and scored[0][0] >= 0.8 and (len(scored) == 1 or scored[0][0] - scored[1][0] > 0.05):   # неоднозначность (два «Металурга») → не угадываем
            cids[i], hows[i] = scored[0][1], f"fuzzy:{scored[0][0]:.2f}"; taken.add(scored[0][1])
    return cids, hows

kag_seasons = set(standings[0].season) if standings else set()
# страницы, где таблица точно не про основной чемпионат: дублёры, молодёжка, кубок, низшие лиги, составы
SKIP_PAGE = re.compile(r"дубл|молод|резерв|юнац|юніор|юнош|u-?1\d|u-?2\d|жіно|женск|кубок|суперкубок|cup|перша_ліга|первая_лига|друга_ліга|вторая_лига|склади|составы", re.I)
wiki_rows = []; wiki_report = []
for y in sorted(df.season.unique()):
    if y in kag_seasons: continue
    langs = ["uk", "ru"] if y not in (2011, 2021) else ["ru", "uk"]
    best_tbl, best_hit, best_src = None, -1, None
    n_exp = len(season_clubs.get(y, set()))
    for lang in langs:
        d = WRAW / lang / str(y)
        if not d.exists(): DEBUG.append(f"{y} {lang}: папки нет"); continue
        for hp in sorted(d.glob("*.html")):
            if SKIP_PAGE.search(hp.name): DEBUG.append(f"{y} {lang} {hp.name[:70]}: пропущена (не основной турнир)"); continue
            rejects = []
            try:
                tables = parse_standing_tables(hp.read_text(encoding="utf-8"), rejects)
            except Exception as e:
                DEBUG.append(f"{y} {lang} {hp.name[:70]}: ОШИБКА {e!r}"); continue
            DEBUG.append(f"{y} {lang} {hp.name[:70]}: таблиц-кандидатов {len(tables)}, отвергнуто {len(rejects)}")
            for why, h in rejects: DEBUG.append(f"      отвергнута: {why} | {h}")
            for tb in tables:
                tb = tb.copy()
                tb["canonical_id"], tb["how"] = resolve_table(tb.team.tolist(), y)
                hit = tb.canonical_id.notna().sum()
                DEBUG.append(f"      кандидат: строк {len(tb)}, распознано {hit}/{n_exp}; не распознаны {tb[tb.canonical_id.isna()].team.tolist()[:6]}")
                # лучшая таблица: больше распознанных клубов, ближе к ожидаемому числу
                score = hit - abs(len(tb) - n_exp) * 0.5
                if score > best_hit: best_hit, best_tbl, best_src = score, tb, f"wiki_{lang}:{hp.name[:60]}"
        if best_tbl is not None and best_tbl.canonical_id.notna().sum() >= 0.9 * n_exp: break
    if best_tbl is None:
        wiki_report.append((y, "нет таблицы", 0, len(season_clubs.get(y, set())))); continue
    n_exp = len(season_clubs.get(y, set()))
    unm = best_tbl[best_tbl.canonical_id.isna()].team.tolist()
    wiki_report.append((y, best_src, int(best_tbl.canonical_id.notna().sum()), n_exp, unm))
    tb = best_tbl.dropna(subset=["canonical_id"]).drop_duplicates("canonical_id")
    tb["season"] = y; tb["source"] = best_src.split(":")[0]
    tb["w"] = np.nan; tb["d"] = np.nan; tb["l"] = np.nan
    wiki_rows.append(tb[["season", "canonical_id", "pos", "games", "gf", "ga", "pts", "source"]])
for r in wiki_report:
    print("wiki standings", r)
    if len(r) < 5 or r[2] < r[3]: say("  таблица", r[0], "→", r[1] if len(r) < 5 else f"{r[1]}: распознано {r[2]} из {r[3]}, не распознаны {r[4]}")
    else: say("  таблица", r[0], "→", r[1].split(":")[0], "OK")
(OUTD / "standings_debug.txt").write_text("\n".join(DEBUG), encoding="utf-8")
if wiki_rows: standings.append(pd.concat(wiki_rows, ignore_index=True))
st_all = pd.concat(standings, ignore_index=True) if standings else pd.DataFrame(columns=["season", "canonical_id", "games", "gf", "ga", "pts", "source"])

# ---------- 2c. Ранжирование, недостающие клубы → прокси по голам игроков ----------
proxy = df.groupby(["season", "canonical_id"]).agg(p_goals=("goals", "sum"), p_apps=("apps", "max")).reset_index()
gk_conc = df[df.position_group.eq("GK")].groupby(["season", "canonical_id"]).conceded.sum(min_count=1).reset_index().rename(columns={"conceded": "p_conceded"})
proxy = proxy.merge(gk_conc, on=["season", "canonical_id"], how="left")
st_all = proxy.merge(st_all, on=["season", "canonical_id"], how="left")
st_all["source"] = st_all["source"].fillna("proxy")
st_all["games"] = st_all["games"].fillna(st_all["p_apps"])
st_all["gf"] = st_all["gf"].fillna(st_all["p_goals"])
st_all["ga"] = st_all["ga"].fillna(st_all["p_conceded"])
def rank_season(s):
    s = s.copy(); s["gd"] = s.gf - s.ga
    has = s.pts.notna()
    a = s[has].sort_values(["pts", "gd", "gf"], ascending=False)
    b = s[~has].copy()   # клубы без строки в таблице: прокси по голам игроков, ставим после всех
    b["proxy_key"] = np.where(b.ga.notna(), b.gd, b.gf)
    b = b.sort_values(["proxy_key", "gf"], ascending=False).drop(columns="proxy_key")
    s = pd.concat([a, b]); s["rank_calc"] = np.arange(1, len(s) + 1)
    pos = s["pos"].where(s["pos"].notna() & s["pos"].between(1, len(s)), s["rank_calc"])
    # позиции из таблицы берём, только если они образуют перестановку 1..n и таблица полная
    if bool(has.all()) and sorted(pos.astype(int).tolist()) == list(range(1, len(s) + 1)): s["pos"] = pos.astype(int)
    else: s["pos"] = s["rank_calc"]
    s["n_clubs"] = len(s)
    return s
st_all = pd.concat([rank_season(s) for _, s in st_all.groupby("season")], ignore_index=True)
st_all["games"] = st_all["games"].fillna(st_all.groupby("season").games.transform("median"))
st_all["gf_pg"] = st_all.gf / st_all.games; st_all["ga_pg"] = st_all.ga / st_all.games; st_all["gd_pg"] = (st_all.gf - st_all.ga) / st_all.games
st_all["team_rank_pct"] = (st_all.n_clubs - st_all.pos) / (st_all.n_clubs - 1)
st_all["season_status"] = st_all.season.map(SEASON_STATUS).fillna("complete")
st_all = st_all.sort_values(["season", "pos"])
st_all.to_csv(OUTD / "standings.csv", index=False)
src_by_season = st_all.groupby("season").source.agg(lambda s: ",".join(sorted(set(s))))
say("Таблицы: сезонов", st_all.season.nunique(), "| клубов-сезонов", len(st_all), "| источники по сезонам:")
say(src_by_season.to_string())
print(st_all[st_all.pos <= 3][["season", "pos", "canonical_id", "games", "gf", "ga", "pts", "source"]].to_string(index=False))
""")

code(r"""#@title 3. Пропущенные голы и сухие матчи вратарей из Kaggle (поматчево)
try:
    pl = pd.read_csv(KAG / "players.csv", low_memory=False)
    gk_ids = set(pl.loc[pl.position.eq("Goalkeeper"), "player_id"])
    apps = pd.read_csv(KAG / "appearances.csv", low_memory=False)
    a = apps[apps.player_id.isin(gk_ids) & apps.game_id.isin(g.game_id)].merge(
        g[["game_id", "season", "home_club_id", "away_club_id", "home_club_goals", "away_club_goals"]], on="game_id", how="left")
    a["opp_goals"] = np.where(a.player_club_id == a.home_club_id, a.away_club_goals, a.home_club_goals)
    a["cs"] = ((a.opp_goals == 0) & (a.minutes_played >= 60)).astype(int)
    a["canonical_id"] = a.player_club_id.astype(int).map(KAG_CANON)
    gk = a.groupby(["player_id", "season", "canonical_id"]).agg(conceded_k=("opp_goals", "sum"), cs_k=("cs", "sum"), gk_apps=("game_id", "nunique")).reset_index()
    gk = gk.rename(columns={"player_id": "tm_player_id"})
    df = df.merge(gk, on=["tm_player_id", "season", "canonical_id"], how="left")
    m = df.position_group.eq("GK") & df.source.eq("kaggle_tm")
    df.loc[m, "conceded"] = df.loc[m, "conceded"].fillna(df.loc[m, "conceded_k"])
    df.loc[m, "clean_sheets"] = df.loc[m, "clean_sheets"].fillna(df.loc[m, "cs_k"])
    say("Вратари Kaggle: пропущенные досчитаны для", int(df.loc[m, "conceded"].notna().sum()), "из", int(m.sum()), "вратарь-сезонов")
    df = df.drop(columns=["conceded_k", "cs_k", "gk_apps"])
except Exception as e:
    say("Поматчевые данные Kaggle не прочитаны (вратари без пропущенных для 2012+):", repr(e))
""")

code(r"""#@title 4. Признаки и рейтинг (внутри сезона, внутри позиции)
df = df.merge(st_all[["season", "canonical_id", "pos", "n_clubs", "games", "gf_pg", "ga_pg", "gd_pg", "team_rank_pct", "season_status"]].rename(columns={"pos": "club_pos", "games": "club_games"}),
              on=["season", "canonical_id"], how="left")
# позиция: пустую пробуем угадать
df["pos_inferred"] = df.position_group.isna()
gpg = df.goals / df.apps.replace(0, np.nan)
guess = pd.Series(np.where(df.conceded.notna(), "GK", np.where(gpg >= 0.25, "FW", "MF")), index=df.index)
df["position_group"] = df.position_group.fillna(guess)
say("Позиция угадана (была пустой):", int(df.pos_inferred.sum()), "строк; по сезонам:", df[df.pos_inferred].groupby("season").size().to_dict())
df["apps_f"] = df.apps.fillna(0).clip(lower=0)
df["share"] = (df.apps_f / df.club_games.replace(0, np.nan)).clip(upper=1.0)
df["ga_sum"] = df.goals.fillna(0) + df.assists.fillna(0)
df["has_assists"] = df.assists.notna()

def shrunk_rate(num, den, grp_mask, k=K_SHRINK):
    # (num + k*mu) / (den + k), mu — средняя ставка позиции в сезоне
    mu = (num[grp_mask].sum() / max(den[grp_mask].sum(), 1.0)) if grp_mask.any() else 0.0
    return (num.fillna(0) + k * mu) / (den.fillna(0) + k)
def zscore(s):
    s = s.astype(float); sd = s.std(ddof=0)
    if not np.isfinite(sd) or sd < 1e-9: return pd.Series(0.0, index=s.index)
    return (s - s.mean()) / sd

WEIGHTS = {
    "FW": {"gpg_adj": 0.40, "goals_tot": 0.20, "apg_adj": 0.15, "share": 0.10, "team": 0.15},
    "MF": {"gapg_adj": 0.30, "ga_tot": 0.20, "share": 0.25, "team": 0.25},
    "DF": {"share": 0.35, "team_def": 0.25, "team": 0.20, "ga_tot": 0.10, "cs_rate": 0.10},
    "GK": {"cpg_adj_neg": 0.40, "share": 0.30, "cs_rate": 0.15, "team": 0.15},
}
feat_rows = []
df["raw_score"] = np.nan
for (y, pg), idx in df.groupby(["season", "position_group"]).groups.items():
    s = df.loc[idx]; m = pd.Series(True, index=s.index)
    F = {}
    F["share"] = s.share
    F["team"] = 0.5 * zscore(s.team_rank_pct.fillna(s.team_rank_pct.mean())) + 0.5 * zscore(s.gd_pg.fillna(s.gd_pg.mean()))
    F["team_def"] = zscore(-s.ga_pg.fillna(s.ga_pg.mean()))
    F["goals_tot"] = s.goals.fillna(0)
    F["ga_tot"] = s.ga_sum
    F["gpg_adj"] = shrunk_rate(s.goals, s.apps_f, m)
    F["gapg_adj"] = shrunk_rate(s.ga_sum, s.apps_f, m)
    F["apg_adj"] = shrunk_rate(s.assists, s.apps_f, s.has_assists) if s.has_assists.any() else pd.Series(np.nan, index=s.index)
    if not s.has_assists.all(): F["apg_adj"] = F["apg_adj"].where(s.has_assists, np.nan)
    cs = s.clean_sheets
    F["cs_rate"] = shrunk_rate(cs, s.apps_f, cs.notna()).where(cs.notna(), np.nan) if cs.notna().any() else pd.Series(np.nan, index=s.index)
    if pg == "GK":
        conc = s.conceded
        cpg = shrunk_rate(conc, s.apps_f, conc.notna()).where(conc.notna(), np.nan) if conc.notna().any() else pd.Series(np.nan, index=s.index)
        # вратарь без своих пропущенных → пропущенные команды за матч
        cpg = cpg.fillna(s.ga_pg)
        F["cpg_adj_neg"] = -cpg
    W = WEIGHTS[pg]
    Z = pd.DataFrame({k: zscore(F[k]) if F[k].notna().any() else pd.Series(np.nan, index=s.index) for k in W})
    # если у строки нет признака (например, ассистов в 90-е) — его вес перераспределяется на остальные
    wv = pd.Series(W)
    num = (Z * wv).sum(axis=1, skipna=True); den = Z.notna().astype(float).mul(wv, axis=1).sum(axis=1)
    raw = num / den.replace(0, np.nan)
    df.loc[idx, "raw_score"] = raw.values
    feat_rows.append(Z.assign(season=y, position_group=pg))
# перцентиль внутри (сезон, позиция) → шкала
grp = df.groupby(["season", "position_group"]).raw_score
df["pos_pct"] = (grp.rank(method="average") - 0.5) / grp.transform("count")
ND = NormalDist()
df["z_pct"] = df.pos_pct.map(lambda p: ND.inv_cdf(min(max(p, 1e-4), 1 - 1e-4)) if pd.notna(p) else np.nan)
# в маленькой группе (вратари: ~45 в сезоне) максимальный перцентиль ниже, чем в большой (полузащитники: ~160) → растягиваем до эталонной группы
z_ref = ND.inv_cdf((RATING_REF_GROUP - 0.5) / RATING_REF_GROUP)
z_max = df.groupby(["season", "position_group"]).z_pct.transform("max")
df["z_adj"] = df.z_pct * np.where(z_max > 0, z_ref / z_max.replace(0, np.nan), 1.0)
df["rating_full"] = (RATING_MID + RATING_SD * df.z_adj).clip(RATING_MIN, RATING_MAX)
w_sample = (df.apps_f / FULL_SAMPLE_APPS).clip(upper=1.0).where(df.apps.notna(), 0.3)
df["rating"] = (RATING_REPLACEMENT + (df.rating_full - RATING_REPLACEMENT) * w_sample).clip(RATING_MIN, RATING_MAX).round(1)

# ручные поправки
ov_path = REF / "rating_overrides.csv"
if not ov_path.exists():
    pd.DataFrame([{"match": "Шевченко Андрій", "season": "", "delta": 0, "note": "пример: подстрока имени или person_id; season пустой = все сезоны; delta ±"}]).to_csv(ov_path, index=False)
    say("Создан шаблон поправок:", ov_path)
ov = pd.read_csv(ov_path, dtype=str).fillna("")
applied = 0
for _, r in ov.iterrows():
    try: delta = float(r["delta"])
    except Exception: continue
    if not r["match"] or delta == 0: continue
    m = df.player_name.astype(str).str.contains(r["match"], regex=False) | df.person_id.astype(str).eq(r["match"])
    if r["season"]: m &= df.season.eq(int(r["season"]))
    df.loc[m, "rating"] = (df.loc[m, "rating"] + delta).clip(RATING_MIN, RATING_MAX); applied += int(m.sum())
say("Ручных поправок применено к строкам:", applied)
ss = df.groupby("season").agg(rows=("rating", "size"), clubs=("canonical_id", "nunique"), src=("source", "first"), pos_guess=("pos_inferred", "mean"),
                              r90=("rating", lambda s: int((s >= 90).sum())), r80=("rating", lambda s: int((s >= 80).sum())))
ss["pos_guess"] = (ss.pos_guess * 100).round(1)
ss["standings"] = st_all.groupby("season").source.agg(lambda s: ",".join(sorted(set(s))))
print(ss.to_string())
say("Рейтинг: средний", round(df.rating.mean(), 1), "| медиана", round(df.rating.median(), 1), "| ≥90:", int((df.rating >= 90).sum()), "| ≥80:", int((df.rating >= 80).sum()))
print(df.groupby("position_group").rating.describe()[["count", "mean", "50%", "max"]].round(1).to_string())
if "display_uk" not in df.columns: df["display_uk"] = df.person_id.map(persons.set_index("person_id").get("display_uk", pd.Series(dtype=str)))
cols = ["season", "season_status", "canonical_id", "name_uk", "club_pos", "n_clubs", "person_id", "display_uk", "player_name", "name_lang", "dob", "nationality", "position_group", "pos_inferred",
        "apps", "goals", "assists", "clean_sheets", "conceded", "market_value_eur", "share", "raw_score", "pos_pct", "rating_full", "rating", "source"]
df[cols].sort_values(["season", "rating"], ascending=[True, False]).to_csv(OUTD / "ratings_player_seasons.csv", index=False)
""")

code(r"""#@title 5. Карточки «игрок в клубе», скрытый модификатор, отчёты
NAME_COLS = [c for c in ("display_uk", "name_uk", "name_ru", "name_en") if c in persons.columns]
name_map = persons.set_index("person_id")[NAME_COLS].to_dict("index") if NAME_COLS else {}
def display_name(pid, fallback):
    n = name_map.get(pid, {})
    for k in NAME_COLS:
        v = n.get(k)
        if isinstance(v, str) and v.strip(): return v
    return fallback
def hidden_mod(key):
    # воспроизводимый «скрытый модификатор»: зависит только от SEED и ключа игрок|клуб
    rng = np.random.default_rng(int(hashlib.md5(f"{SEED}:{key}".encode()).hexdigest()[:8], 16))
    return float(np.clip(rng.normal(0, HIDDEN_MOD_SD), -4, 4))
pool_src = df[df.season_status.ne("in_progress")]
agg = pool_src.sort_values("rating", ascending=False).groupby(["person_id", "canonical_id"]).agg(
    display_name=("player_name", "first"), position_group=("position_group", lambda s: s.mode().iloc[0]),
    nationality=("nationality", "first"), dob=("dob", "first"),
    first_season=("season", "min"), last_season=("season", "max"), seasons=("season", "nunique"),
    apps=("apps", "sum"), goals=("goals", "sum"), assists=("assists", "sum"), clean_sheets=("clean_sheets", "sum"),
    peak_rating=("rating", "max"), peak_season=("season", "first"),
    top3_mean=("rating", lambda s: round(s.head(3).mean(), 1)), mean_rating=("rating", lambda s: round(s.mean(), 1)),
).reset_index()
# рейтинг карточки: 60% пик + 40% среднее трёх лучших сезонов (недостающие сезоны считаются средними, RATING_MID) — один яркий сезон не равен долгой карьере
top3_filled = pool_src.sort_values("rating", ascending=False).groupby(["person_id", "canonical_id"]).rating.apply(lambda s: (list(s.head(3)) + [RATING_MID] * 3)[:3]).apply(np.mean)
agg = agg.merge(top3_filled.rename("top3_filled").reset_index(), on=["person_id", "canonical_id"], how="left")
agg["card_rating"] = (0.6 * agg.peak_rating + 0.4 * agg.top3_filled).round(1)
agg["display_name"] = [display_name(p, n) for p, n in zip(agg.person_id, agg.display_name)]
agg["club_name_uk"] = agg.canonical_id.map(CANON_NAME)
agg["decade"] = (agg.peak_season // 10 * 10).astype(int).astype(str) + "s"
agg["hidden_modifier"] = [round(hidden_mod(f"{p}|{c}"), 2) for p, c in zip(agg.person_id, agg.canonical_id)]
agg["effective_rating"] = (agg.card_rating + agg.hidden_modifier).clip(RATING_MIN, RATING_MAX).round(1)
agg = agg.sort_values(["card_rating", "peak_rating"], ascending=False)
agg.to_csv(OUTD / "ratings_person_club.csv", index=False)
say("Карточек игрок×клуб:", len(agg), "| людей:", agg.person_id.nunique(), "| с пиковым рейтингом ≥85:", int((agg.peak_rating >= 85).sum()))

# отчёт: топ-20 каждого сезона
lines = []
for y, s in df.sort_values(["season", "rating"], ascending=[True, False]).groupby("season"):
    st = SEASON_STATUS.get(y, "")
    lines.append(f"=== {y}/{str(y+1)[2:]} {('[' + st + ']') if st else ''} источник: {s.source.iloc[0]} ===")
    for _, r in s.head(20).iterrows():
        extra = f"проп {int(r.conceded)}" if r.position_group == "GK" and pd.notna(r.conceded) else (f"ас {int(r.assists)}" if pd.notna(r.assists) else "")
        lines.append(f"{r.rating:5.1f}  {r.position_group}  {str(r.player_name)[:28]:28s} {str(r.name_uk)[:22]:22s} м{int(r.club_pos) if pd.notna(r.club_pos) else '?'}  и {int(r.apps) if pd.notna(r.apps) else '?'} г {int(r.goals) if pd.notna(r.goals) else 0} {extra}")
    lines.append("")
(OUTD / "top20_by_season.txt").write_text("\n".join(lines), encoding="utf-8")
# отчёт: топ-100 всех времён по карточкам
top = agg.head(100)
lines = [f"{r.card_rating:5.1f} (пик {r.peak_rating:5.1f}, топ-3 {r.top3_mean:5.1f})  {r.position_group}  {str(r.display_name)[:30]:30s} {str(r.club_name_uk)[:24]:24s} {r.first_season}–{r.last_season} ({r.seasons} сез.)  и {int(r.apps)} г {int(r.goals)}" for _, r in top.iterrows()]
(OUTD / "top100_alltime.txt").write_text("\n".join(lines), encoding="utf-8")
print("\n".join(lines[:30]))
(OUTD / "stage4_summary.txt").write_text("\n".join(SUMMARY), encoding="utf-8")
say("ГОТОВО: ratings_player_seasons.csv, ratings_person_club.csv, standings.csv, top20_by_season.txt, top100_alltime.txt")
""")

nb = {"cells": cells, "metadata": {"colab": {"provenance": [], "name": "UPL_stage4_ratings.ipynb"},
      "kernelspec": {"name": "python3", "display_name": "Python 3"}, "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 0}
json.dump(nb, open("/home/claude/upl-dataset/UPL_stage4_ratings.ipynb", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("written", len(cells), "cells")
