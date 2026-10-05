# -*- coding: utf-8 -*-
import pandas as pd, re, json
ps = pd.read_csv('data/ratings_player_seasons.csv')
PATR = re.compile(r"(ович|евич|йович|ьович|іч|ич|івна|ївна|овна|евна|ична|инична)$", re.I)
UA = {"Україна","Ukraine","Украина"}
def clean(s):
    s = re.sub(r"\([^)]*\)", " ", str(s))          # parenthesized notes such as joined/loan
    s = re.sub(r"[\*†‡↑↓→←]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip(" ,;")
    return s
rows = []
for pid, g in ps.groupby("person_id"):
    g = g.sort_values("season")
    names = {}
    for lang in ("uk","ru","en"):
        v = g.loc[g.name_lang==lang, "player_name"]
        if len(v): names[lang] = clean(v.iloc[-1])   # latest spelling
    nat = g.nationality.dropna()
    nat_uk = [n for n in nat if re.search("[А-Яа-яІіЇїЄє]", str(n))]
    nat_v = nat_uk[0] if nat_uk else (nat.iloc[0] if len(nat) else "")
    clubs = list(dict.fromkeys(g.name_uk.tolist()))[:4]
    rows.append(dict(person_id=pid, name_uk=names.get("uk",""), name_ru=names.get("ru",""), name_en=names.get("en",""),
                     nat=nat_v, pos=g.position_group.iloc[0], seasons=f"{g.season.min()}–{g.season.max()}",
                     clubs="; ".join(clubs), apps=int(g.apps.sum())))
df = pd.DataFrame(rows)
def auto(r):
    uk = r.name_uk
    if not uk: return "", "llm"
    t = uk.split()
    if len(t)==3 and PATR.search(t[2]) and r.nat in UA: return f"{t[1]} {t[0]}", "auto"
    if len(t)==3 and PATR.search(t[2]): return f"{t[1]} {t[0]}", "llm"      # foreigner with patronymic: needs review
    if len(t)==2: return f"{t[1]} {t[0]}", "llm"
    if len(t)==1: return t[0], "llm"
    return "", "llm"
df[["proposal","route"]] = df.apply(lambda r: pd.Series(auto(r)), axis=1)
print(df.route.value_counts())
print(df[df.route=="auto"].sample(10, random_state=3)[["name_uk","proposal"]])
df.to_csv("names/names_master.csv", index=False)
llm = df[df.route=="llm"].copy()
print("llm rows", len(llm))
print("llm by presence:", (llm.name_uk!="").sum(), "uk;", ((llm.name_uk=="")&(llm.name_ru!="")).sum(), "ru-only;", ((llm.name_uk=="")&(llm.name_ru=="")).sum(), "en-only")
