"""Generates the Colab notebook 'UPL_dataset_builder.ipynb'."""
import json

cells = []

def md(src):
    cells.append({"cell_type": "markdown", "metadata": {}, "source": src})

def code(src):
    cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": src})

# ---------------------------------------------------------------- intro
md("""# Сборщик базы игроков УПЛ (1992 → сегодня)

Ноутбук собирает базу «клуб × сезон × игрок» для драфт-игры по Украинской Премьер-лиге и складывает результат в твой Google Drive, в папку `UPL-data/`.

**Три слоя данных (каждый — отдельная ячейка, можно включать/выключать в настройках):**

1. **Kaggle → `transfermarkt-datasets`** — открытый датасет, качается официальным API, без скрапинга. Даёт составы с матчами/голами/передачами/минутами и рыночной стоимостью примерно с 2012 года.
2. **Википедия (uk + ru) через официальный API** — «сырой урожай»: все таблицы со страниц про сезоны чемпионата и клубов. Главный источник для 1992–2011. Разбирать таблицы в единый формат будем следующим шагом, когда увидим, как они реально выглядят.
3. **Transfermarkt напрямую** (по умолчанию выключен) — сохраняет HTML страниц «состав» и «статистика за сезон» для каждого клуба каждого сезона. Может блокироваться с серверов Google; умеет останавливаться и продолжать с места обрыва.

**Что нужно перед запуском**
- Аккаунт Kaggle → Settings → вкладка *API Tokens*. Либо (А) внизу, в *Legacy API Credentials*, нажми *Create Legacy API Key* — скачается `kaggle.json`, положи его в корень Google Drive (`My Drive/kaggle.json`); либо (Б) создай новый токен (*Generate*) и вставь его в поле `KAGGLE_API_TOKEN` в ячейке «Настройки».
- (Необязательно) файл `players.json` из игры 30-0 → положи в `My Drive/UPL-data/players_30-0.json` — тогда последняя ячейка сверит, кого мы не нашли.

**Как запускать:** заполни «Настройки» → меню *Runtime → Run all* (или ячейки по очереди). При обрыве сессии просто запусти снова — уже скачанное пропускается.
""")

# ---------------------------------------------------------------- config
code("""#@title 1. Настройки { display-mode: "form" }
#@markdown **Диапазон сезонов.** Год = год начала сезона: 1992 → сезон 1992/93, 2025 → сезон 2025/26.
SEASON_FROM = 1992  #@param {type:"integer"}
SEASON_TO   = 2025  #@param {type:"integer"}

#@markdown **Какие слои запускать**
RUN_KAGGLE = True   #@param {type:"boolean"}
RUN_WIKI   = True   #@param {type:"boolean"}
RUN_TM     = False  #@param {type:"boolean"}

#@markdown **Kaggle** — нужен ОДИН из вариантов: (А) файл kaggle.json в корне Drive — тогда ничего не вписывай; (Б) новый API-токен со страницы Settings → API Tokens → вставь в KAGGLE_API_TOKEN; (В) старые username + key
KAGGLE_API_TOKEN = ""  #@param {type:"string"}
KAGGLE_USERNAME  = ""  #@param {type:"string"}
KAGGLE_KEY       = ""  #@param {type:"string"}

#@markdown **Википедия** — языковые разделы через запятую и контакт для User-Agent (правила Wikimedia просят указывать контакт)
WIKI_LANGS   = "uk,ru"  #@param {type:"string"}
WIKI_CONTACT = "your-email@example.com"  #@param {type:"string"}

#@markdown **Transfermarkt** — паузы между запросами (секунды) и сколько подряд ошибок терпеть
TM_DELAY_MIN = 4   #@param {type:"number"}
TM_DELAY_MAX = 9   #@param {type:"number"}
TM_MAX_CONSECUTIVE_FAILS = 5  #@param {type:"integer"}

#@markdown **Куда складывать** (внутри Google Drive)
OUT_DIR = "/content/drive/MyDrive/UPL-data"  #@param {type:"string"}

print("Настройки приняты. Сезоны:", f"{SEASON_FROM}/{str(SEASON_FROM+1)[-2:]} → {SEASON_TO}/{str(SEASON_TO+1)[-2:]}")
""")

# ---------------------------------------------------------------- setup
code("""#@title 2. Подключение Google Drive и подготовка папок
import os, sys, json, time, random, re, traceback, datetime
from pathlib import Path

from google.colab import drive
drive.mount('/content/drive', force_remount=False)

OUT = Path(OUT_DIR)
DIRS = {k: OUT / k for k in ["kaggle", "wiki_raw", "tm_raw", "out", "logs"]}
for p in DIRS.values():
    p.mkdir(parents=True, exist_ok=True)

LOG_FILE = DIRS["logs"] / f"run_{datetime.datetime.now():%Y%m%d_%H%M%S}.log"
def log(*args):
    msg = " ".join(str(a) for a in args)
    print(msg)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(f"{datetime.datetime.now():%H:%M:%S} {msg}\\n")

import pandas as pd
pd.set_option("display.width", 200)
pd.set_option("display.max_columns", 40)

SEASONS = list(range(SEASON_FROM, SEASON_TO + 1))
def season_label(y):  # 1998 -> "1998/99"
    return f"{y}/{str(y+1)[-2:]}"

log("Папка результатов:", OUT)
log("Сезонов к обработке:", len(SEASONS))
""")

# ---------------------------------------------------------------- layer 1: kaggle
code("""#@title 3. Слой 1 — Kaggle: transfermarkt-datasets (≈2012 → сегодня)
KAGGLE_SLUG = "davidcariboo/player-scores"
NEEDED = ["competitions.csv", "games.csv", "clubs.csv", "players.csv", "appearances.csv", "player_valuations.csv"]

def kaggle_auth():
    kj = Path("/content/drive/MyDrive/kaggle.json")
    if KAGGLE_API_TOKEN.strip():
        os.environ["KAGGLE_API_TOKEN"] = KAGGLE_API_TOKEN.strip()
        os.system("pip -q install -U kagglehub >/dev/null 2>&1")  # новые токены понимает kagglehub >= 0.4.1
        return "API token"
    if KAGGLE_USERNAME and KAGGLE_KEY:
        os.environ["KAGGLE_USERNAME"], os.environ["KAGGLE_KEY"] = KAGGLE_USERNAME.strip(), KAGGLE_KEY.strip()
        return "form"
    if kj.exists():
        d = json.loads(kj.read_text())
        os.environ["KAGGLE_USERNAME"], os.environ["KAGGLE_KEY"] = d["username"], d["key"]
        Path.home().joinpath(".kaggle").mkdir(exist_ok=True)
        Path.home().joinpath(".kaggle/kaggle.json").write_text(kj.read_text())
        os.chmod(Path.home().joinpath(".kaggle/kaggle.json"), 0o600)
        return "kaggle.json из Drive"
    return None

def kaggle_download():
    # Уже есть копия в Drive? Тогда ничего не качаем.
    if all((DIRS["kaggle"] / f).exists() for f in NEEDED):
        log("Kaggle: файлы уже лежат в Drive, пропускаю скачивание")
        return True
    how = kaggle_auth()
    if not how:
        log("Kaggle: нет учётных данных — впиши KAGGLE_USERNAME/KAGGLE_KEY в настройки или положи kaggle.json в корень Drive")
        return False
    log("Kaggle: авторизация через", how)
    src = None
    try:
        import kagglehub
        src = Path(kagglehub.dataset_download(KAGGLE_SLUG))
        log("Kaggle: скачано через kagglehub →", src)
    except Exception as e:
        log("kagglehub не сработал:", repr(e), "— пробую kaggle CLI")
        os.system("pip -q install -U kaggle >/dev/null 2>&1")
        tmp = Path("/content/kaggle_dl"); tmp.mkdir(exist_ok=True)
        rc = os.system(f"kaggle datasets download -d {KAGGLE_SLUG} -p {tmp} --unzip -q")
        if rc != 0:
            log("Kaggle CLI вернул код", rc)
            return False
        src = tmp
    import shutil
    found = 0
    for f in NEEDED:
        hits = list(src.rglob(f))
        if hits:
            shutil.copy(hits[0], DIRS["kaggle"] / f); found += 1
        else:
            log("Kaggle: в датасете нет файла", f)
    log(f"Kaggle: скопировано в Drive {found}/{len(NEEDED)} файлов")
    return found >= 5

def kaggle_build():
    K = DIRS["kaggle"]
    comps = pd.read_csv(K / "competitions.csv")
    mask = comps["competition_id"].eq("UKR1")
    if not mask.any():
        mask = comps["country_name"].astype(str).str.contains("Ukrain", case=False) & comps["type"].astype(str).str.contains("league", case=False)
    if not mask.any():
        log("Kaggle: чемпионат Украины в датасете НЕ найден. Доступные competition_id:")
        log(", ".join(sorted(comps["competition_id"].astype(str))))
        return None
    league_id = comps.loc[mask, "competition_id"].iloc[0]
    log("Kaggle: чемпионат Украины =", league_id, "|", comps.loc[mask, "name"].iloc[0])

    games = pd.read_csv(K / "games.csv", low_memory=False)
    g = games[games["competition_id"].eq(league_id)].copy()
    g = g[g["season"].between(SEASON_FROM, SEASON_TO)]
    log(f"Kaggle: матчей УПЛ в датасете: {len(g)}; сезоны: {sorted(g['season'].unique().tolist())}")
    if g.empty:
        return None

    # имена клубов берём из матчей (clubs.csv может не содержать выбывшие клубы)
    club_names = pd.concat([
        g[["home_club_id", "home_club_name"]].rename(columns={"home_club_id": "club_id", "home_club_name": "club_name"}),
        g[["away_club_id", "away_club_name"]].rename(columns={"away_club_id": "club_id", "away_club_name": "club_name"}),
    ]).dropna().drop_duplicates("club_id")

    apps = pd.read_csv(K / "appearances.csv", low_memory=False)
    a = apps[apps["game_id"].isin(g["game_id"])].merge(
        g[["game_id", "season", "home_club_id", "away_club_id", "home_club_goals", "away_club_goals"]], on="game_id", how="left")
    log(f"Kaggle: записей об участии игроков в матчах УПЛ: {len(a)}")

    # сухие матчи (для вратарей посчитаем позже по позиции; здесь — для всех, кто отыграл ≥60 минут)
    import numpy as np
    a["opp_goals"] = np.where(a["player_club_id"] == a["home_club_id"], a["away_club_goals"], a["home_club_goals"])
    a["clean_sheet"] = ((a["opp_goals"] == 0) & (a["minutes_played"] >= 60)).astype(int)

    ps = a.groupby(["player_id", "player_club_id", "season"]).agg(
        apps=("game_id", "nunique"), goals=("goals", "sum"), assists=("assists", "sum"),
        minutes=("minutes_played", "sum"), yellow=("yellow_cards", "sum"), red=("red_cards", "sum"),
        clean_sheets=("clean_sheet", "sum"), player_name=("player_name", "first"),
    ).reset_index().rename(columns={"player_club_id": "club_id"})

    players = pd.read_csv(K / "players.csv", low_memory=False)
    keep = [c for c in ["player_id", "name", "date_of_birth", "country_of_citizenship", "country_of_birth",
                        "position", "sub_position", "foot", "height_in_cm", "image_url", "url"] if c in players.columns]
    ps = ps.merge(players[keep], on="player_id", how="left")
    ps = ps.merge(club_names, on="club_id", how="left")

    # рыночная стоимость на начало сезона (последняя оценка до 1 июля года начала сезона)
    try:
        pv = pd.read_csv(K / "player_valuations.csv", low_memory=False)
        pv["date"] = pd.to_datetime(pv["date"], errors="coerce")
        pv = pv.dropna(subset=["date"]).sort_values("date")
        ps["season_start"] = pd.to_datetime(ps["season"].astype(str) + "-07-01")
        ps = ps.sort_values("season_start")
        ps = pd.merge_asof(ps, pv[["player_id", "date", "market_value_in_eur"]].sort_values("date"),
                           left_on="season_start", right_on="date", by="player_id", direction="backward")
        ps = ps.drop(columns=["date"]).rename(columns={"market_value_in_eur": "market_value_eur_at_season_start"})
    except Exception as e:
        log("Kaggle: рыночную стоимость подтянуть не удалось:", repr(e))

    ps["season_label"] = ps["season"].apply(season_label)
    ps = ps.sort_values(["season", "club_name", "apps"], ascending=[True, True, False])
    ps.to_csv(DIRS["out"] / "player_seasons_kaggle.csv", index=False)
    club_names.sort_values("club_name").to_csv(DIRS["out"] / "clubs_kaggle.csv", index=False)
    players[players["player_id"].isin(ps["player_id"])][keep].to_csv(DIRS["out"] / "players_kaggle.csv", index=False)

    log("Kaggle: ГОТОВО →", DIRS["out"] / "player_seasons_kaggle.csv")
    log("Игрок-сезонов:", len(ps), "| уникальных игроков:", ps["player_id"].nunique(), "| клубов:", ps["club_id"].nunique())
    print(ps.groupby("season_label").agg(clubs=("club_id", "nunique"), players=("player_id", "nunique")).to_string())
    return ps

kaggle_ps = None
if RUN_KAGGLE:
    try:
        if kaggle_download():
            kaggle_ps = kaggle_build()
    except Exception:
        log("Kaggle: ОШИБКА\\n" + traceback.format_exc())
else:
    log("Слой Kaggle выключен в настройках")
""")

# ---------------------------------------------------------------- layer 2: wikipedia
code("""#@title 4. Слой 2 — Википедия (uk, ru): сырой урожай таблиц по сезонам
import requests, re, time, json, traceback
from io import StringIO

WIKI_UA = f"UPL-draft-dataset-builder/0.1 (hobby project; contact: {WIKI_CONTACT})"
S = requests.Session(); S.headers.update({"User-Agent": WIKI_UA})

def wiki_api(lang, **params):
    params.update(format="json", maxlag=5)
    for attempt in range(3):
        r = S.get(f"https://{lang}.wikipedia.org/w/api.php", params=params, timeout=60)
        if r.status_code == 200:
            j = r.json()
            if "error" in j and j["error"].get("code") == "maxlag":
                time.sleep(5); continue
            return j
        time.sleep(3)
    return {}

def wiki_search(lang, query, limit=30):
    j = wiki_api(lang, action="query", list="search", srsearch=query, srlimit=limit, srnamespace=0)
    return [h["title"] for h in j.get("query", {}).get("search", [])]

def wiki_page_html(lang, title):
    j = wiki_api(lang, action="parse", page=title, prop="text", redirects=1)
    if "parse" not in j:
        return None
    return j["parse"]["text"]["*"]

def safe_name(s):
    return re.sub(r"[^\\w\\-]+", "_", s)[:120]

def candidate_titles(lang, y):
    y1, y2 = y, y + 1
    if lang == "ru":
        direct = [f"Чемпионат Украины по футболу {y1}/{y2} (составы)",
                  f"Чемпионат Украины по футболу {y1}/{y2}"]
        queries = [f"Чемпионат Украины по футболу {y1}/{y2}"]
        year_pat = f"{y1}/{y2}"
    else:  # uk
        direct = [f"Чемпіонат України з футболу {y1}—{y2}: Прем'єр-ліга",
                  f"Чемпіонат України з футболу {y1}—{y2}: вища ліга",
                  f"Чемпіонат України з футболу {y1}—{y2}"]
        queries = [f"Чемпіонат України з футболу {y1}—{y2}", f"у сезоні {y1}—{y2}", f"сезон {y1}—{y2} футбол"]
        year_pat = f"{y1}—{y2}"
    return direct, queries, year_pat

def harvest_season(lang, y):
    direct, queries, year_pat = candidate_titles(lang, y)
    titles = list(direct)
    for q in queries:
        for t in wiki_search(lang, q):
            if (year_pat in t or year_pat.replace("—", "–") in t) and t not in titles:
                titles.append(t)
        time.sleep(0.5)
    season_dir = DIRS["wiki_raw"] / lang / str(y)
    season_dir.mkdir(parents=True, exist_ok=True)
    index = {}
    for t in titles:
        html_path = season_dir / (safe_name(t) + ".html")
        if html_path.exists():
            html = html_path.read_text(encoding="utf-8")
        else:
            html = wiki_page_html(lang, t)
            time.sleep(0.7)
            if html is None:
                continue
            html_path.write_text(html, encoding="utf-8")
        try:
            tables = pd.read_html(StringIO(html))
        except ValueError:
            tables = []
        n = 0
        for i, tb in enumerate(tables):
            if len(tb) >= 5:
                tb.to_csv(season_dir / f"{safe_name(t)}__table{i:02d}.csv", index=False)
                n += 1
        index[t] = {"tables_saved": n, "html": html_path.name}
    (season_dir / "_index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    return index

if RUN_WIKI:
    langs = [l.strip() for l in WIKI_LANGS.split(",") if l.strip()]
    summary = []
    for lang in langs:
        for y in SEASONS:
            try:
                idx = harvest_season(lang, y)
                pages = len(idx); tabs = sum(v["tables_saved"] for v in idx.values())
                summary.append((lang, season_label(y), pages, tabs))
                log(f"wiki[{lang}] {season_label(y)}: страниц {pages}, таблиц {tabs}")
            except Exception:
                log(f"wiki[{lang}] {season_label(y)}: ОШИБКА\\n" + traceback.format_exc())
    sm = pd.DataFrame(summary, columns=["lang", "season", "pages", "tables"])
    sm.to_csv(DIRS["out"] / "wiki_harvest_summary.csv", index=False)
    log("Википедия: ГОТОВО. Сырьё лежит в", DIRS["wiki_raw"])
    print(sm.pivot(index="season", columns="lang", values="tables").fillna(0).astype(int).to_string())
else:
    log("Слой Википедии выключен в настройках")
""")

# ---------------------------------------------------------------- layer 3: transfermarkt
code("""#@title 5. Слой 3 — Transfermarkt напрямую (выключен по умолчанию; умеет продолжать после обрыва)
import requests, re, time, random, traceback
from io import StringIO

TM_BASE = "https://www.transfermarkt.com"
TM_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.transfermarkt.com/",
}
TM_STATE = {"fails": 0, "fetched": 0, "skipped": 0}

def tm_get(url, path):
    if path.exists() and path.stat().st_size > 5000:
        TM_STATE["skipped"] += 1
        return path.read_text(encoding="utf-8")
    for attempt in range(4):
        time.sleep(random.uniform(TM_DELAY_MIN, TM_DELAY_MAX))
        try:
            r = requests.get(url, headers=TM_HEADERS, timeout=60)
        except Exception as e:
            log("TM: сетевая ошибка", repr(e)); r = None
        if r is not None and r.status_code == 200 and len(r.text) > 5000:
            path.write_text(r.text, encoding="utf-8")
            TM_STATE["fails"] = 0; TM_STATE["fetched"] += 1
            return r.text
        code_ = r.status_code if r is not None else "net"
        wait = 30 * (attempt + 1)
        log(f"TM: {code_} на {url} — жду {wait}s (попытка {attempt+1}/4)")
        time.sleep(wait)
    TM_STATE["fails"] += 1
    return None

def tm_clubs_for_season(y):
    url = f"{TM_BASE}/premier-liga/startseite/wettbewerb/UKR1/plus/?saison_id={y}"
    sdir = DIRS["tm_raw"] / str(y); sdir.mkdir(parents=True, exist_ok=True)
    html = tm_get(url, sdir / "_competition.html")
    if not html:
        return []
    found = {}
    for slug, cid in re.findall(r'href="/([^/"]+)/startseite/verein/(\\d+)/saison_id/\\d+"', html):
        found.setdefault(cid, slug)
    return [(cid, slug) for cid, slug in found.items()]

def tm_harvest():
    log("TM: старт. Внимание: Transfermarkt может блокировать серверы Google — ноутбук остановится после",
        TM_MAX_CONSECUTIVE_FAILS, "ошибок подряд, а при повторном запуске продолжит с места обрыва.")
    manifest_path = DIRS["tm_raw"] / "_manifest.csv"
    rows = []
    for y in SEASONS:
        clubs = tm_clubs_for_season(y)
        log(f"TM {season_label(y)}: клубов на странице турнира: {len(clubs)}")
        if not clubs and TM_STATE["fails"] >= TM_MAX_CONSECUTIVE_FAILS:
            break
        sdir = DIRS["tm_raw"] / str(y)
        for cid, slug in clubs:
            kader_url = f"{TM_BASE}/{slug}/kader/verein/{cid}/saison_id/{y}/plus/1"
            perf_url  = f"{TM_BASE}/{slug}/leistungsdaten/verein/{cid}/reldata/UKR1%26{y}/plus/1"
            k = tm_get(kader_url, sdir / f"{cid}_{slug}_kader.html")
            p = tm_get(perf_url,  sdir / f"{cid}_{slug}_perf.html")
            rows.append({"season": y, "club_id": cid, "slug": slug, "kader": bool(k), "perf": bool(p)})
            if TM_STATE["fails"] >= TM_MAX_CONSECUTIVE_FAILS:
                log("TM: слишком много ошибок подряд — останавливаюсь. Запусти ячейку позже, продолжу с этого места.")
                pd.DataFrame(rows).to_csv(manifest_path, index=False)
                return
        pd.DataFrame(rows).to_csv(manifest_path, index=False)
    log("TM: обход завершён. Скачано:", TM_STATE["fetched"], "| пропущено (уже было):", TM_STATE["skipped"])

def tm_quick_parse():
    # Черновой разбор: все крупные таблицы из сохранённого HTML → один CSV на тип страницы. Чистовой парсер напишем по факту.
    out = []
    for html_path in sorted(DIRS["tm_raw"].rglob("*_kader.html")) + sorted(DIRS["tm_raw"].rglob("*_perf.html")):
        y = html_path.parent.name; kind = "kader" if html_path.name.endswith("_kader.html") else "perf"
        cid = html_path.name.split("_")[0]
        try:
            tables = pd.read_html(StringIO(html_path.read_text(encoding="utf-8")))
        except ValueError:
            continue
        for i, tb in enumerate(tables):
            if len(tb) >= 8 and tb.shape[1] >= 4:
                tb = tb.copy(); tb.columns = [str(c) for c in tb.columns]
                tb.insert(0, "src_kind", kind); tb.insert(0, "src_club_id", cid); tb.insert(0, "src_season", y)
                out.append(tb)
    if out:
        big = pd.concat(out, ignore_index=True, sort=False)
        big.to_csv(DIRS["out"] / "tm_tables_raw.csv", index=False)
        log("TM: черновые таблицы →", DIRS["out"] / "tm_tables_raw.csv", "| строк:", len(big))

if RUN_TM:
    try:
        tm_harvest(); tm_quick_parse()
    except Exception:
        log("TM: ОШИБКА\\n" + traceback.format_exc())
else:
    log("Слой Transfermarkt выключен в настройках (RUN_TM=False)")
""")

# ---------------------------------------------------------------- layer 4: crosscheck
code("""#@title 6. Сверка с файлом игры 30-0 (если положил players_30-0.json в UPL-data)
p30 = OUT / "players_30-0.json"
kag = DIRS["out"] / "player_seasons_kaggle.csv"
if p30.exists() and kag.exists():
    ref = pd.DataFrame(json.load(open(p30, encoding="utf-8")))
    ours = pd.read_csv(kag)
    ref_ids = set(ref["player_id"].dropna().astype(int)); our_ids = set(ours["player_id"].dropna().astype(int))
    miss = ref[~ref["player_id"].isin(our_ids)].copy()
    miss = miss[miss["decade"].isin(["2010s", "2020s"])]  # Kaggle-слой покрывает только современную эру
    miss[["player_id", "player_name", "team_name", "decade", "game_position", "global_rating"]].sort_values(["team_name", "decade"]).to_csv(
        DIRS["out"] / "crosscheck_missing_vs_30-0.csv", index=False)
    log(f"Сверка: в файле 30-0 {len(ref_ids)} игроков; у нас (Kaggle) {len(our_ids)}; "
        f"из 30-0 за 2010-е/2020-е у нас отсутствует {miss['player_id'].nunique()} → crosscheck_missing_vs_30-0.csv")
    print(miss.groupby(["team_name", "decade"]).size().sort_values(ascending=False).head(25).to_string())
else:
    log("Сверка пропущена: нужен players_30-0.json в", OUT, "и результат слоя Kaggle")
""")

# ---------------------------------------------------------------- summary
code("""#@title 7. Итог: что лежит в Drive
def human(n):
    for u in ["B", "KB", "MB", "GB"]:
        if n < 1024: return f"{n:.0f}{u}"
        n /= 1024
    return f"{n:.1f}TB"
rows = []
for p in sorted(DIRS["out"].glob("*.csv")):
    try: nrows = sum(1 for _ in open(p, encoding="utf-8")) - 1
    except Exception: nrows = -1
    rows.append((p.name, human(p.stat().st_size), nrows))
print(pd.DataFrame(rows, columns=["файл в UPL-data/out", "размер", "строк"]).to_string(index=False))
wiki_files = sum(1 for _ in DIRS["wiki_raw"].rglob("*.csv")); tm_files = sum(1 for _ in DIRS["tm_raw"].rglob("*.html"))
print(f"\\nСырьё: Википедия — {wiki_files} таблиц, Transfermarkt — {tm_files} HTML-страниц")
print("Лог этого запуска:", LOG_FILE)
""")

nb = {
    "cells": cells,
    "metadata": {
        "colab": {"provenance": [], "name": "UPL_dataset_builder.ipynb"},
        "kernelspec": {"name": "python3", "display_name": "Python 3"},
        "language_info": {"name": "python"},
    },
    "nbformat": 4,
    "nbformat_minor": 0,
}
with open("/home/claude/upl-dataset/UPL_dataset_builder.ipynb", "w", encoding="utf-8") as f:
    json.dump(nb, f, ensure_ascii=False, indent=1)
print("written", len(cells), "cells")
