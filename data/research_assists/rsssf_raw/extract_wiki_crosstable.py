#!/usr/bin/env python3
"""Fallback for seasons whose rsssf page could not be reached (not indexed by search):
convert en.wikipedia '<season> Vyshcha Liha' WebFetch results (markdown league table +
home/away crosstable) found in the agent transcript into rsssf_raw/<season>.txt
(TABLE + MATCHES format understood by parse_clean_sheets.py).
Usage: extract_wiki_crosstable.py <transcript.jsonl> [--force]
"""
import json, os, re, sys, urllib.parse

RAW = os.path.dirname(os.path.abspath(__file__))
ABBR = {  # crosstable column abbreviation -> keyword in league-table team name
    "BUC": "Bukovyna", "BUK": "Bukovyna", "CHO": "Chornomorets", "DNI": "Dnipro", "DYK": "Dynamo", "DYN": "Dynamo",
    "KAR": "Karpaty", "KRE": "Kremin", "KRY": "Kryvbas", "MKH": "Metalist", "MET": "Metalist", "MZA": "Metalurh Zap",
    "NVT": "Nyva Ternopil", "NYV": "Nyva Vinnytsia", "SHA": "Shakhtar", "TAV": "Tavriya", "TZA": "Torpedo",
    "VER": "Veres", "VOL": "Volyn", "ZOR": "Zorya", "TEM": "Temp", "MYK": "Mykolaiv", "CSK": "CSKA", "PRY": "Prykarpattya",
    "ZIR": "Zirka", "MMA": "Metalurh Mar", "MTM": "Metalurh Mar", "MDO": "Metalurh Don", "ARS": "Arsenal", "VOR": "Vorskla", "STA": "Stal",
    "POL": "Polihraftekhnika", "OLE": "Oleksandriya",
}


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def main():
    tr = sys.argv[1]
    force = "--force" in sys.argv
    uses, res = {}, {}
    for line in open(tr):
        d = json.loads(line)
        c = d.get("message", {}).get("content")
        if not isinstance(c, list):
            continue
        for x in c:
            if x.get("type") == "tool_use" and x["name"] == "WebFetch":
                uses[x["id"]] = x["input"]["url"]
            if x.get("type") == "tool_result" and x["tool_use_id"] in uses:
                cc = x["content"]
                res[x["tool_use_id"]] = cc if isinstance(cc, str) else "\n".join(y.get("text", "") for y in cc)
    for tid, url in uses.items():
        m = re.search(r"/wiki/(\d{4})[^_]*_Vyshcha_Liha", urllib.parse.unquote(url))
        if not m or tid not in res:
            continue
        season = int(m.group(1))
        path = os.path.join(RAW, f"{season}.txt")
        if os.path.exists(path) and not force:
            print(season, "exists, skip"); continue
        lines = [l for l in res[tid].splitlines() if l.strip().startswith("|")]
        table, cross_hdr, cross = [], None, []
        for l in lines:
            c = cells(l)
            if len(c) == 10 and c[0].isdigit():
                name = re.sub(r"\s*\((C|R)\)", "", c[1])
                table.append((name, c[2:8]))
            elif cross_hdr is None and len(c) > 10 and all(re.fullmatch(r"[A-Z]{3}", x) for x in c[1:]):
                cross_hdr = c[1:]
            elif cross_hdr and len(c) == len(cross_hdr) + 1 and not set(c[1]) <= set("-"):
                cross.append(c)
        tnames = [t for t, _ in table]

        def by_abbr(a):
            kw = ABBR[a].lower()
            hits = [t for t in tnames if kw in t.lower().replace("zaporizhzhia", "zaporizhzhia")]
            if not hits and kw.startswith("metalurh "):
                hits = [t for t in tnames if t.lower().startswith("metalurh") and kw.split()[1][:3] in t.lower()]
            assert len(hits) == 1, (season, a, hits)
            return hits[0]
        cols = [by_abbr(a) for a in cross_hdr]
        out = [f"# source: {url} (en.wikipedia via WebFetch summary; crosstable converted to match list;",
               "#   rsssf page for this season was not reachable: not returned by web search -> provenance block)", "TABLE"]
        for i, (t, v) in enumerate(table, 1):
            p, w, dd, l, gf, ga = v
            out.append(f"{i:2d}.{t:<34s} {p:>3s} {w:>3s} {dd:>3s} {l:>3s} {gf:>3s}-{ga:<3s} 0")
        out.append("MATCHES")
        assert len(cross) == len(cols), (season, len(cross), len(cols))
        for i, row in enumerate(cross):
            home = cols[i]
            if re.fullmatch(r"[A-Z]{3}", row[0]):
                assert by_abbr(row[0]) == home
            for j, cell in enumerate(row[1:]):
                if i == j:
                    continue
                cell = cell.replace("–", "-").replace("−", "-").replace(" ", "")
                if re.fullmatch(r"\d+-\d+|[+-]:[+-]", cell):
                    out.append(f"{home} {cell} {cols[j]}")
                else:
                    out.append(f"# unparsed cell {home} v {cols[j]}: {cell!r}")
        open(path, "w").write("\n".join(out) + "\n")
        print(season, "written:", len(table), "teams,", len(cross), "crosstable rows")


if __name__ == "__main__":
    main()
