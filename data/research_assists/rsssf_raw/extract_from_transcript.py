#!/usr/bin/env python3
"""Extract WebFetch results for rsssf oekr*.html pages from the agent transcript
(jsonl) and write rsssf_raw/<season>.txt (TABLE + MATCHES) if not already present.
Usage: extract_from_transcript.py <transcript.jsonl> [--force SEASON ...]
"""
import json, os, re, sys

RAW = os.path.dirname(os.path.abspath(__file__))
URL2SEASON = {}
for yy in range(93, 100):
    URL2SEASON[f"oekr{yy}.html"] = 1900 + yy - 1
for yy in range(0, 10):
    URL2SEASON[f"oekr{yy:02d}.html"] = 2000 + yy - 1
for y in range(2010, 2013):
    URL2SEASON[f"oekr{y}.html"] = y - 1

TAB_RE = re.compile(r"^\s*(?:\d+\.)?\s*\S.*?\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s*-\s*\d+\s+-?\d+")
M_RE = re.compile(r"^(\S.*?\S)\s+(\d+-\d+|[+-]\s*:\s*[+-])\s+(\S.*?\S)\s*(\[.*\])?\s*$")


def main():
    tr = sys.argv[1]
    force = set(int(x) for x in sys.argv[3:]) if "--force" in sys.argv else set()
    uses, results = {}, {}
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
                if isinstance(cc, list):
                    cc = "\n".join(y.get("text", "") for y in cc)
                results[x["tool_use_id"]] = cc
    best = {}
    for tid, url in uses.items():
        fn = url.rsplit("/", 1)[-1]
        if fn not in URL2SEASON or tid not in results:
            continue
        txt = results[tid]
        nm = sum(1 for l in txt.splitlines() if M_RE.match(l.strip().strip("*")))
        s = URL2SEASON[fn]
        if nm > best.get(s, (0, None, None))[0]:
            best[s] = (nm, txt, url)
    for s, (nm, txt, url) in sorted(best.items()):
        path = os.path.join(RAW, f"{s}.txt")
        if os.path.exists(path) and s not in force:
            print(s, "exists, skip"); continue
        table, matches = [], []
        for l in txt.splitlines():
            ls = l.strip()
            if TAB_RE.match(l) and not matches:
                table.append(l.rstrip()); continue
            m = re.match(r"^\**\s*(Round|Tour)\s+(\d+)", ls)
            if m:
                matches.append(f"Round {m.group(2)}"); continue
            m = M_RE.match(ls)
            if m and table:
                matches.append(f"{m.group(1)} {m.group(2).replace(' ', '')} {m.group(3)}")
            elif ls.startswith("[") or ls.startswith("*"):
                matches.append("# " + ls)
        with open(path, "w") as f:
            f.write(f"# source: {url} (via WebFetch summary, requested verbatim; auto-extracted from transcript)\n")
            f.write("TABLE\n" + "\n".join(table) + "\nMATCHES\n" + "\n".join(matches) + "\n")
        print(s, "written", len(table), "table lines,", nm, "match lines")


if __name__ == "__main__":
    main()
