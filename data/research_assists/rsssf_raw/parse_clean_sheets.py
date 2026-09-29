#!/usr/bin/env python3
"""Parse rsssf_raw/<season>.txt files (TABLE + MATCHES sections) and compute
team clean sheets per season, verified against the final table.

Raw file format:
  TABLE section: rsssf final-table lines "N.Team  P W D L GF-GA Pts ..."
  MATCHES section: "Home Team X-Y Away Team" lines (round headers ignored).
  Optional ALIAS lines:  "ALIAS match name => table name"
  Awarded matches may be written "Home +:- Away" / "Home -:+ Away" (no score);
  those are counted as games but not as clean sheets / goals and flagged.
"""
import csv, difflib, glob, os, re, sys

RAW = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(RAW), "team_clean_sheets.csv")

TAB_RE = re.compile(r"^\s*(?:\d+\.)?\s*(\S.*?\S)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*-\s*(\d+)\s+(-?\d+)")
M_RE = re.compile(r"^(\S.*?\S)\s+(\d+)\s*-\s*(\d+)(?:\s*(?:aet|awd|\[.*?\]|\(.*?\)))?\s+(\S.*?\S)\s*(?:\[.*\]|\(.*\))?\s*$")
AWD_RE = re.compile(r"^(\S.*?\S)\s+([+-]):([+-])\s+(\S.*?\S)\s*$")


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def parse(path):
    table, matches, awarded, aliases = {}, [], [], {}
    sec = None
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        if line.startswith("#") or not line.strip():
            continue
        if line.strip() in ("TABLE", "MATCHES"):
            sec = line.strip(); continue
        if line.startswith("ALIAS "):
            a, b = line[6:].split("=>"); aliases[a.strip()] = b.strip(); continue
        if sec == "TABLE":
            m = TAB_RE.match(line)
            if m:
                t = m.group(1)
                table[t] = dict(p=int(m.group(2)), w=int(m.group(3)), d=int(m.group(4)),
                                l=int(m.group(5)), gf=int(m.group(6)), ga=int(m.group(7)))
        elif sec == "MATCHES":
            if re.match(r"^\s*(Round|Tour|Matchday)\b", line, re.I):
                continue
            m = AWD_RE.match(line.strip())
            if m:
                awarded.append((m.group(1), m.group(4), m.group(2), m.group(3))); continue
            m = M_RE.match(line.strip())
            if m:
                matches.append((m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)))
            else:
                print(f"  [warn] unparsed match line: {line!r}", file=sys.stderr)
    return table, matches, awarded, aliases


def build_map(names, table, aliases):
    tnames = list(table)
    mp = {}
    for n in names:
        if n in aliases:
            mp[n] = aliases[n]; continue
        if n in table:
            mp[n] = n; continue
        best = max(tnames, key=lambda t: difflib.SequenceMatcher(None, norm(n), norm(t)).ratio())
        mp[n] = best
    return mp


def season_rows(season, path):
    table, matches, awarded, aliases = parse(path)
    names = sorted({m[0] for m in matches} | {m[3] for m in matches} | {a[0] for a in awarded} | {a[1] for a in awarded})
    mp = build_map(names, table, aliases)
    notes = []
    if len(set(mp.values())) != len(mp):
        notes.append("info: several source spellings per team")
    n = len(table)
    head = open(path, encoding="utf-8").readline()
    src_note = "src=en.wikipedia crosstable, not rsssf" if "wikipedia" in head else ""
    recon = {}
    if season == 2008:
        for t in ("FC L'viv", "Vorskla Poltava"):
            recon[t] = "incl. 1 match (FC L'viv-Vorskla) missing in fetch, reconstructed 0-0 from table residual"
    stat = {t: dict(g=0, gf=0, ga=0, cs=0, w=0, d=0, l=0, awd=0) for t in table}
    for h, hg, ag, a in matches:
        H, A = mp[h], mp[a]
        for T, f, g in ((H, hg, ag), (A, ag, hg)):
            s = stat[T]; s["g"] += 1; s["gf"] += f; s["ga"] += g
            s["cs"] += (g == 0)
            s["w" if f > g else "d" if f == g else "l"] += 1
    for h, a, hs, as_ in awarded:
        for T, r in ((mp[h], hs), (mp[a], as_)):
            s = stat[T]; s["g"] += 1; s["awd"] += 1
            s["w" if r == "+" else "l"] += 1
    rows = []
    for t in table:
        s, tb = stat[t], table[t]
        issues = []
        if s["g"] != tb["p"]: issues.append(f"games {s['g']}!={tb['p']}")
        if s["g"] != 2 * (n - 1): issues.append(f"games!=2(n-1)={2*(n-1)}")
        if s["ga"] != tb["ga"]: issues.append(f"GA {s['ga']}!={tb['ga']}")
        if s["gf"] != tb["gf"]: issues.append(f"GF {s['gf']}!={tb['gf']}")
        if (s["w"], s["d"], s["l"]) != (tb["w"], tb["d"], tb["l"]): issues.append(f"WDL {s['w']}-{s['d']}-{s['l']}!={tb['w']}-{tb['d']}-{tb['l']}")
        hard = list(issues)
        ok = not hard
        extra = []
        if s["awd"]:
            extra.append(f"{s['awd']} awarded match(es) counted in games but not as clean sheets")
        if src_note:
            extra.append(src_note)
        if recon.get(t):
            extra.append(recon[t])
        status_txt = "OK" if ok else "FAIL: " + ", ".join(hard)
        if extra:
            status_txt += " (" + "; ".join(extra) + ")"
        rows.append(dict(season=season, team_name_as_source=t, games=s["g"], goals_against=s["ga"],
                         clean_sheets=s["cs"], check_ok=status_txt.replace(";", ",")))
    return rows, mp, notes, len(matches) + len(awarded), n


def main():
    allrows = []
    status = {}
    for path in sorted(glob.glob(os.path.join(RAW, "[12][0-9][0-9][0-9].txt"))):
        season = int(os.path.basename(path)[:4])
        rows, mp, notes, nm, n = season_rows(season, path)
        bad = [r for r in rows if not r["check_ok"].startswith("OK")]
        status[season] = "OK" if not bad else "FAIL"
        print(f"{season}: teams={n} matches={nm} expected={n*(n-1)} fails={len(bad)} {notes}")
        for r in bad:
            print("   ", r["team_name_as_source"], r["check_ok"])
        allrows += rows
    # placeholder rows for missing seasons
    for season in range(1992, 2012):
        if season not in status:
            allrows.append(dict(season=season, team_name_as_source="", games="", goals_against="",
                                clean_sheets="", check_ok="NOT_FETCHED"))
    allrows.sort(key=lambda r: (r["season"], -int(r["clean_sheets"] or 0)))
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["season", "team_name_as_source", "games", "goals_against", "clean_sheets", "check_ok"], delimiter=";")
        w.writeheader(); w.writerows(allrows)
    print("written", OUT, "| seasons OK:", sum(v == "OK" for v in status.values()), "/", len(status))


if __name__ == "__main__":
    main()
