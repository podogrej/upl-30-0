# -*- coding: utf-8 -*-
"""Rebuild pool.json: Ukrainian names, drop coaches from ru tables 2011/2021, merge duplicate persons."""
import json, pandas as pd, numpy as np
ps = pd.read_csv("data_v2/ratings_player_seasons.csv")
names = pd.read_csv("names/names_final_v2.csv").fillna("")
disp = dict(zip(names.person_id, names.display_uk))
ps["by"] = pd.to_numeric(ps.dob.astype(str).str[:4], errors="coerce"); ps["age"] = ps.season - ps.by
ru = ps.source.eq("wiki_ru")
coach = ru & ((ps.age.ge(40) & ps.position_group.ne("GK")) | (ps.pos_inferred & ps.apps.notna()) |
              (ps.season.eq(2021) & ps.position_group.eq("FW") & ps.age.ge(37)))
junk = ru & ps.apps.isna()          # joined/left lists without stats
drop = ps[coach | junk]
drop.assign(display_uk=drop.person_id.map(disp))[["season","name_uk","person_id","display_uk","age","apps","source"]] \
    .to_csv("names/dropped_rows.csv", index=False)
print("coach rows", int(coach.sum()), "junk rows", int((junk & ~coach).sum()))
keep = ps[~(coach | junk)].copy()
keep["disp"] = keep.person_id.map(disp)
# merge duplicates: same name, same birth year, at least one loose id (w:YYYY-00-00 / w:ru:), no overlapping seasons
per = keep.groupby("person_id").agg(disp=("disp","first"), by=("by","first"), apps=("apps","sum"),
                                     yrs=("season", lambda s: set(s)), clubs=("canonical_id", lambda s: set(s)))
per["loose"] = per.index.str.contains(r"^w:\d{4}-00-00:|^w:ru:")
merge = {}
for nm, g in per.groupby("disp"):
    if len(g) < 2: continue
    g = g.sort_values("apps", ascending=False)
    anchors = [pid for pid in g.index if not g.loc[pid, "loose"]]
    for pid in g.index[g.loose]:
        by = g.loc[pid, "by"]
        cands = [a for a in (anchors or list(g.index)) if a != pid and a not in merge and
                 (np.isnan(by) or np.isnan(g.loc[a, "by"]) or g.loc[a, "by"] == by) and not (g.loc[a, "yrs"] & g.loc[pid, "yrs"])]
        if len(cands) == 1: merge[pid] = cands[0]
# second pass: same name and same exact date of birth (different spellings across sources)
dob = keep.groupby("person_id").dob.first()
per["dob"] = dob
for (nm, d), g in per[per.dob.notna() & ~per.dob.astype(str).str.endswith("-00-00")].groupby(["disp", "dob"]):
    if len(g) < 2: continue
    g = g.sort_values("apps", ascending=False); root = g.index[0]
    for pid in g.index[1:]:
        if pid not in merge and not (g.loc[root, "yrs"] & g.loc[pid, "yrs"]): merge[pid] = merge.get(root, root)
print("merged ids", len(merge))
pd.Series(merge, name="into").rename_axis("person_id").reset_index().assign(
    display_uk=lambda d: d.person_id.map(disp)).to_csv("names/merged_ids.csv", index=False)
keep["pid"] = keep.person_id.map(lambda x: merge.get(x, x))
# same person twice in one club-season after merge: keep the row with more apps
keep = keep.sort_values("apps", ascending=False).drop_duplicates(["season","canonical_id","pid"])
p = json.load(open("game/pool.json"))
by_cs = {k: g.sort_values("rating", ascending=False) for k, g in keep.groupby(["season","canonical_id"])}
n_pl = 0
for c in p["clubs"]:
    g = by_cs[(c["y"], c["c"])]
    c["pl"] = [[r.disp, r.position_group, int(round(r.rating)), int(r.apps) if pd.notna(r.apps) else 0,
                int(r.goals) if pd.notna(r.goals) else 0, r.pid] for r in g.itertuples()]
    n_pl += len(c["pl"])
p["meta"].update(players=n_pl, persons=int(keep.pid.nunique()), names="uk v1 (Ім'я Прізвище)")
json.dump(p, open("game/pool.json","w"), ensure_ascii=False, separators=(",",":"))
print(p["meta"])
