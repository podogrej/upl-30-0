# -*- coding: utf-8 -*-
"""Colab notebook generator: stage 5, detailed player positions (13 positions + main/alternatives)."""
import json
cells = []
def md(s): cells.append({"cell_type": "markdown", "metadata": {}, "source": s})
def code(s): cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": s})

md("""# Этап 5 — детальные позиции игроков

Для каждого человека из `out/persons.csv` определяет **основную позицию** и **дополнительные** (с долями), в кодах игры:
`GK` вратарь · `CB` центральный защитник · `RB`/`LB` правый/левый защитник · `RWB`/`LWB` вингбеки · `CDM` опорный · `CM` центральный полузащитник · `CAM` атакующий · `RM`/`LM` правый/левый полузащитник · `RW`/`LW` вингеры · `ST` нападающий.

Источники по приоритету:
1. **Составы на каждый матч** (Kaggle `game_lineups.csv`, Transfermarkt, ≈2012+): на какой позиции игрок реально выходил → основная и дополнительные с долями.
2. **Основная позиция Transfermarkt** (`players.csv` → `sub_position`, плюс рабочая нога).
3. **Wikidata** (свойство «позиция на поле») — для игроков 1992–2011; сопоставление по точной дате рождения и фамилии.
4. Если ничего нет — только группа (ВР/ЗХ/ПЗ/НП), игра трактует её широко.

Итог: `out/positions.csv` и `out/stage5_summary.txt`. Работает 3–8 минут (Wikidata отвечает не быстро).
""")

code("""#@title 1. Настройки
OUT_DIR = "/content/drive/MyDrive/UPL-data"  #@param {type:"string"}
#@markdown Kaggle: сначала пробую скачать без ключа (датасет публичный). Если не выйдет — впиши новый API-токен (Kaggle → Settings → API Tokens → Generate).
KAGGLE_API_TOKEN = ""  #@param {type:"string"}
USE_WIKIDATA = False  #@param {type:"boolean"}
#@markdown Сколько минут максимум тратить на Wikidata за один запуск. Найденное сохраняется в Drive, повторный запуск продолжит с того же места.
WIKIDATA_MINUTES = 12  #@param {type:"integer"}
import os, re, json, time, datetime, difflib, unicodedata, shutil
from pathlib import Path
from collections import Counter, defaultdict
from google.colab import drive
drive.mount('/content/drive', force_remount=False)
import pandas as pd, numpy as np
OUT = Path(OUT_DIR); OUTD = OUT / "out"; KAG = OUT / "kaggle"; REF = OUT / "ref"
SUMMARY = []
def say(*a):
    s = " ".join(str(x) for x in a); print(s); SUMMARY.append(s)
say("Этап 5 запущен", datetime.datetime.now().strftime("%Y-%m-%d %H:%M"))
ps = pd.read_csv(OUTD / "player_seasons_final.csv", low_memory=False)
persons = pd.read_csv(OUTD / "persons.csv", low_memory=False)
grp = ps.groupby("person_id").position_group.agg(lambda s: s.mode().iloc[0] if s.notna().any() else None)
persons["group"] = persons.person_id.map(grp)
say("Людей:", len(persons), "| с id Transfermarkt:", int(persons.person_id.astype(str).str.startswith("tm:").sum()))
""")

code("""#@title 2. Словарь позиций
CODES = ["GK", "CB", "RB", "LB", "RWB", "LWB", "CDM", "CM", "CAM", "RM", "LM", "RW", "LW", "ST"]
GROUP_OF = {"GK": "GK", "CB": "DF", "RB": "DF", "LB": "DF", "RWB": "DF", "LWB": "DF", "CDM": "MF", "CM": "MF", "CAM": "MF",
            "RM": "MF", "LM": "MF", "RW": "FW", "LW": "FW", "ST": "FW"}
# Transfermarkt: sub_position в players.csv и position в game_lineups.csv
TM_MAP = {"goalkeeper": "GK", "centre-back": "CB", "center-back": "CB", "sweeper": "CB", "left-back": "LB", "right-back": "RB",
          "defensive midfield": "CDM", "central midfield": "CM", "attacking midfield": "CAM", "left midfield": "LM", "right midfield": "RM",
          "left winger": "LW", "right winger": "RW", "centre-forward": "ST", "center-forward": "ST", "second striker": "ST",
          "left wing-back": "LWB", "right wing-back": "RWB"}
def tm_code(s):
    if not isinstance(s, str): return None
    return TM_MAP.get(s.strip().lower())
# Wikidata: английские подписи позиций → код; «сторона неизвестна» решается ниже
def wd_codes(label):
    l = str(label).lower()
    if "goalkeeper" in l: return ["GK"]
    if "wing-back" in l or "wingback" in l or "wing back" in l:
        return ["LWB"] if "left" in l else ["RWB"] if "right" in l else ["RWB", "LWB"]
    if "full-back" in l or "fullback" in l or "full back" in l or l.endswith("back") and ("left" in l or "right" in l):
        return ["LB"] if "left" in l else ["RB"] if "right" in l else ["RB", "LB"]
    if "centre-back" in l or "center-back" in l or "centre back" in l or "center back" in l or "central defender" in l or "sweeper" in l or "libero" in l or "stopper" in l: return ["CB"]
    if "defensive midfield" in l or "holding midfield" in l: return ["CDM"]
    if "attacking midfield" in l or "playmaker" in l or "trequartista" in l: return ["CAM"]
    if "winger" in l or "wide midfield" in l:
        return ["LW"] if "left" in l else ["RW"] if "right" in l else ["RW", "LW"]
    if "left midfield" in l: return ["LM"]
    if "right midfield" in l: return ["RM"]
    if "central midfield" in l or "box-to-box" in l or "midfielder" in l or "half-back" in l or "wing half" in l: return ["CM"]
    if "forward" in l or "striker" in l or "attacker" in l or "centre forward" in l: return ["ST"]
    if "defender" in l: return ["CB"]
    return []
""")

code("""#@title 3. Transfermarkt: основная позиция и рабочая нога
pl = pd.read_csv(KAG / "players.csv", low_memory=False, usecols=lambda c: c in {"player_id", "sub_position", "position", "foot", "name"})
pl["tm_main"] = pl.sub_position.map(tm_code)
pl.loc[pl.tm_main.isna() & pl.position.eq("Goalkeeper"), "tm_main"] = "GK"
TM_MAIN = dict(zip("tm:" + pl.player_id.astype(str), pl.tm_main))
TM_FOOT = dict(zip("tm:" + pl.player_id.astype(str), pl.foot))
say("Transfermarkt: основная позиция известна у", sum(1 for p in persons.person_id if TM_MAIN.get(p)), "наших людей")
""")

code("""#@title 4. Составы на каждый матч (game_lineups.csv) → основная и дополнительные позиции
LU = KAG / "game_lineups.csv"
def try_download():
    if LU.exists(): return "уже в Drive"
    os.system("pip -q install -U kagglehub >/dev/null 2>&1")
    if KAGGLE_API_TOKEN.strip(): os.environ["KAGGLE_API_TOKEN"] = KAGGLE_API_TOKEN.strip()
    kj = Path("/content/drive/MyDrive/kaggle.json")
    if kj.exists() and not KAGGLE_API_TOKEN.strip():
        d = json.loads(kj.read_text()); os.environ["KAGGLE_USERNAME"], os.environ["KAGGLE_KEY"] = d["username"], d["key"]
    import kagglehub
    try:
        p = Path(kagglehub.dataset_download("davidcariboo/player-scores", path="game_lineups.csv"))
    except Exception as e:
        say("kagglehub: одиночный файл не скачался:", repr(e)[:200], "— качаю весь датасет")
        try: p = Path(kagglehub.dataset_download("davidcariboo/player-scores"))
        except Exception as e2:
            say("Kaggle не отдал датасет:", repr(e2)[:300]); return None
    hits = [p] if p.is_file() else list(p.rglob("game_lineups.csv"))
    if not hits: say("В датасете нет game_lineups.csv"); return None
    shutil.copy(hits[0], LU); return "скачан"
how = try_download()
LINEUP = {}
if how:
    say("game_lineups.csv:", how)
    our_tm = {int(p[3:]) for p in persons.person_id.astype(str) if p.startswith("tm:")}
    parts = []
    for ch in pd.read_csv(LU, usecols=["player_id", "type", "position"], chunksize=500_000):
        ch = ch[ch.player_id.isin(our_tm)]
        parts.append(ch)
    lu = pd.concat(parts)
    lu["code"] = lu.position.map(tm_code)
    lu = lu[lu.code.notna()]
    lu["w"] = np.where(lu.type.astype(str).str.contains("start"), 1.0, 0.35)   # выход в старте весит больше, чем на замену
    agg = lu.groupby(["player_id", "code"]).w.sum().reset_index()
    for pid, g in agg.groupby("player_id"):
        tot = g.w.sum()
        LINEUP["tm:" + str(pid)] = sorted(((c, w / tot) for c, w in zip(g.code, g.w)), key=lambda t: -t[1])
    say("Составы: позиции по матчам есть у", len(LINEUP), "наших людей (строк в выборке:", len(lu), ")")
else:
    say("Составы не получены — для 2012+ беру только основную позицию Transfermarkt")
""")

code("""#@title 5. Wikidata через обычный API (поиск по имени → дата рождения → позиции) — для 1992–2011
import urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
CYR = {'а':'a','б':'b','в':'v','г':'h','ґ':'g','д':'d','е':'e','є':'e','ж':'zh','з':'z','и':'y','і':'i','ї':'i','й':'i','к':'k','л':'l','м':'m',
 'н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ь':'','ю':'iu','я':'ia',
 'ы':'y','э':'e','ё':'e','ъ':'',"'":'','ʼ':'','’':''}
def skeleton(s):
    s = "".join(CYR.get(ch, ch) for ch in str(s).lower()); s = unicodedata.normalize("NFKD", s); s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z]", "", s)
    s = s.replace("kh", "h").replace("shch", "sch").replace("zh", "j").replace("ii", "i").replace("iy", "i").replace("yi", "i").replace("y", "i").replace("ie", "e").replace("g", "h")
    return re.sub(r"(.)\\1", r"\\1", s)
def name_tokens(*names):
    out = set()
    for n in names:
        if not isinstance(n, str): continue
        for t in re.split(r"[\\s,()]+", n):
            k = skeleton(t)
            if len(k) >= 4: out.add(k)
    return out
API = "https://www.wikidata.org/w/api.php"
UA = "UPL-30-0-dataset/0.2 (fan project; github.com/podogrej/upl-30-0)"
def api(params, tries=5):
    params = {**params, "format": "json", "maxlag": "5"}
    url = API + "?" + urllib.parse.urlencode(params)
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            d = json.loads(urllib.request.urlopen(req, timeout=15).read())
            if "error" in d and d["error"].get("code") == "maxlag": time.sleep(3 + 2 * k); continue
            return d
        except Exception as e:
            time.sleep(2 + 3 * k)
    return {}
WD = {}
if USE_WIKIDATA:
    need = persons[~persons.person_id.isin(set(LINEUP)) & ~persons.person_id.map(lambda p: bool(TM_MAIN.get(p)))].copy()
    need["dob_s"] = need.dob.astype(str).where(need.dob.notna(), "")
    say("Wikidata: ищу", len(need), "людей без данных Transfermarkt")
    CACHE = OUT / "cache"; CACHE.mkdir(exist_ok=True)
    CS, CE = CACHE / "wd_search.json", CACHE / "wd_entities.json"
    cands = json.loads(CS.read_text()) if CS.exists() else {}
    ENT = json.loads(CE.read_text()) if CE.exists() else {}
    say("  из кэша: поисков", len(cands), "| карточек Wikidata", len(ENT))
    def queries(r):
        qs = []
        for n, lang in ((getattr(r, "display_uk", None), "uk"), (r.name_ru, "ru"), (r.name_en, "en"), (r.name_uk, "uk")):
            if isinstance(n, str) and n.strip():
                t = [x for x in re.split(r"\\s+", re.sub(r"\\(.*?\\)", "", n).strip()) if x]
                if len(t) == 3 and re.search(r"(ович|евич|івна|ївна|овна|евна|ич|іч)$", t[2]): t = t[:2]
                q = (" ".join(t), lang)
                if q not in qs: qs.append(q)
        return qs[:2]
    def work(r):
        ids = []
        for q, lang in queries(r):
            d = api({"action": "wbsearchentities", "search": q, "language": lang, "uselang": lang, "type": "item", "limit": "7"}, tries=3)
            ids += [x["id"] for x in d.get("search", [])]
            if ids: break
        return r.person_id, list(dict.fromkeys(ids))
    rows = list(need.itertuples())
    todo = [r for r in rows if r.person_id not in cands]
    t0 = time.time(); deadline = t0 + WIKIDATA_MINUTES * 60
    say("  осталось искать:", len(todo))
    with ThreadPoolExecutor(8) as ex:
        for k in range(0, len(todo), 40):
            if time.time() > deadline: say("  лимит времени — остальное в следующем запуске"); break
            for pid, ids in ex.map(work, todo[k:k + 40]): cands[pid] = ids
            if (k // 40) % 5 == 0:
                CS.write_text(json.dumps(cands)); print(f"  … поиск {min(k + 40, len(todo))}/{len(todo)} · {int(time.time() - t0)} с")
    CS.write_text(json.dumps(cands))
    need_ids = sorted({q for v in cands.values() for q in v} - set(ENT))
    def fetch(batch):
        d = api({"action": "wbgetentities", "ids": "|".join(batch), "props": "claims|labels", "languages": "uk|ru|en"}, tries=3)
        out = {}
        for q, e in d.get("entities", {}).items():   # храним только нужное, чтобы кэш был маленьким
            out[q] = {"claims": {p: e.get("claims", {}).get(p, []) for p in ("P106", "P569", "P413")}, "labels": e.get("labels", {})}
        return out
    with ThreadPoolExecutor(4) as ex:
        for ents in ex.map(fetch, [need_ids[i:i + 50] for i in range(0, len(need_ids), 50)]): ENT.update(ents)
    CE.write_text(json.dumps(ENT))
    say("  карточек Wikidata:", len(ENT))
    def claim_vals(e, p):
        out = []
        for c in e.get("claims", {}).get(p, []):
            v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
            if isinstance(v, dict) and "id" in v: out.append(v["id"])
            elif isinstance(v, dict) and "time" in v: out.append(v["time"][1:11])
        return out
    pos_q = sorted({q for e in ENT.values() for q in claim_vals(e, "P413")})
    POSLAB = {}
    for i in range(0, len(pos_q), 50):
        d = api({"action": "wbgetentities", "ids": "|".join(pos_q[i:i + 50]), "props": "labels", "languages": "en"})
        for q, e in d.get("entities", {}).items(): POSLAB[q] = e.get("labels", {}).get("en", {}).get("value", "")
    hit = amb = 0
    for r in rows:
        dob = r.dob_s; year_only = dob.endswith("-00-00")
        mine = name_tokens(getattr(r, "display_uk", None), r.name_uk, r.name_ru, r.name_en)
        good = []
        for q in cands.get(r.person_id, []):
            e = ENT.get(q, {})
            if "Q937857" not in claim_vals(e, "P106"): continue
            births = claim_vals(e, "P569")
            ok = any(b == dob for b in births) if dob and not year_only else any(b[:4] == dob[:4] for b in births) if dob else False
            if not ok: continue
            labs = [v.get("value") for v in e.get("labels", {}).values()]
            sc = max((difflib.SequenceMatcher(None, a, b).ratio() for a in mine for b in name_tokens(*labs)), default=0)
            if sc >= (0.75 if not year_only else 0.85): good.append((sc, q, e))
        if len(good) > 1 and year_only: amb += 1; continue
        if good:
            sc, q, e = max(good, key=lambda t: t[0])
            poss = [c for p in claim_vals(e, "P413") for c in wd_codes(POSLAB.get(p, ""))]
            if poss: WD[r.person_id] = (q, poss); hit += 1
    say("Wikidata: найдено с позициями", hit, "из", len(rows), "| неоднозначных (только год рождения):", amb)
""")

code("""#@title 6. Сборка: основная позиция + дополнительные, совместимость с группой
def side_by_foot(codes, foot):
    # «фланговый защитник/вингер, сторона неизвестна» → по рабочей ноге (левша → слева)
    if set(codes) == {"RB", "LB"} or set(codes) == {"RW", "LW"} or set(codes) == {"RWB", "LWB"}:
        if foot == "left": return [c for c in codes if c.startswith("L")] + [c for c in codes if c.startswith("R")]
    return codes
res = []
for r in persons.itertuples():
    pid, g = r.person_id, r.group
    src, main, alts = None, None, []
    if pid in LINEUP and LINEUP[pid]:
        lst = [(c, s) for c, s in LINEUP[pid] if s >= 0.04]
        tmm = TM_MAIN.get(pid)
        main = lst[0][0] if lst else tmm
        # если основная по Transfermarkt близка к лидеру по матчам — верим Transfermarkt
        if tmm and lst and tmm != main and dict(lst).get(tmm, 0) >= 0.3: main = tmm
        alts = [(c, round(s, 2)) for c, s in lst if c != main][:3]; src = "tm_lineups"
    elif TM_MAIN.get(pid):
        main = TM_MAIN[pid]; src = "tm_main"
    elif pid in WD:
        qid, poss = WD[pid]; poss = list(dict.fromkeys(poss))
        # основная — первая позиция из Wikidata, совпадающая с группой игрока в наших данных
        same = [c for c in poss if GROUP_OF[c] == g] or poss
        main = same[0]; alts = [(c, None) for c in poss if c != main][:3]; src = "wikidata:" + qid
    else:
        main = {"GK": "GK", "DF": "DF", "MF": "MF", "FW": "ST"}.get(g, None); src = "group"
    # вратарь — всегда только вратарь; полевым не даём позицию вратаря
    if g == "GK" or main == "GK":
        main, alts = "GK", []
        if src == "group": src = "group_gk"   # для вратаря группа = точная позиция
    else: alts = [(c, s) for c, s in alts if c != "GK"]
    res.append({"person_id": pid, "display_uk": getattr(r, "display_uk", None), "group": g, "main": main,
                "alts": ";".join(f"{c}:{s}" if s is not None else c for c, s in alts), "foot": TM_FOOT.get(pid), "source": src})
pos = pd.DataFrame(res)
# ручные позиции (ref/positions_manual.csv: person_id, main, alts, source) имеют высший приоритет
man = REF / "positions_manual.csv"
if man.exists():
    m = pd.read_csv(man).drop_duplicates("person_id", keep="last").set_index("person_id")
    k = pos.person_id.isin(m.index)
    pos.loc[k, "main"] = pos.loc[k, "person_id"].map(m["main"]); pos.loc[k, "alts"] = pos.loc[k, "person_id"].map(m["alts"]).fillna("")
    pos.loc[k, "source"] = "manual:" + pos.loc[k, "person_id"].map(m["source"]).fillna("").astype(str)
    say("Ручные позиции применены к", int(k.sum()), "людям")
pos.to_csv(OUTD / "positions.csv", index=False)
un = pos[pos.source.eq("group")].merge(persons[["person_id", "dob", "name_uk", "name_ru", "name_en"]], on="person_id", how="left")
seas = ps.groupby("person_id").agg(seasons=("season", lambda s: f"{s.min()}–{s.max()}"), clubs=("name_uk", lambda s: "; ".join(pd.unique(s.dropna()))[:120]) if "name_uk" in ps.columns else ("season", "size"))
un = un.merge(seas, left_on="person_id", right_index=True, how="left")
un.to_csv(OUTD / "positions_unresolved.csv", index=False)
say("Без детальной позиции (для ручного поиска): positions_unresolved.csv —", len(un), "людей")
say("\\nИТОГ positions.csv:", len(pos), "людей")
say("Источник:", pos.source.str.split(":").str[0].value_counts().to_dict())
say("Основные позиции:", pos.main.value_counts().to_dict())
say("С дополнительными позициями:", int((pos.alts.fillna("") != "").sum()))
# расхождение группы и основной позиции
bad = pos[pos.main.map(GROUP_OF).notna() & pos.group.notna() & (pos.main.map(GROUP_OF) != pos.group)]
say("Основная позиция не совпадает с группой из составов:", len(bad), "(это нормально для гибридов, напр. ПЗ→вингер)")
for probe in ["Чигринськ", "Ракицьк", "Срна", "Тимощук", "Шевченко Андр", "Ярмоленк", "Циганков", "Зінченко", "Ващук", "Шовковськ", "Лужний", "Гусєв", "Ребров", "Мудрик"]:
    h = pos[pos.display_uk.astype(str).str.contains(probe.split()[0][:7], na=False)]
    for x in h.head(2).itertuples(): say(f"  {x.display_uk}: {x.main} | {x.alts} | {x.source}")
(OUTD / "stage5_summary.txt").write_text("\\n".join(SUMMARY), encoding="utf-8")
""")

nb = {"cells": cells, "metadata": {"colab": {"provenance": [], "name": "UPL_stage5_positions.ipynb"},
      "kernelspec": {"name": "python3", "display_name": "Python 3"}, "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 0}
json.dump(nb, open("/home/claude/upl-dataset/UPL_stage5_positions.ipynb", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("written", len(cells), "cells")
