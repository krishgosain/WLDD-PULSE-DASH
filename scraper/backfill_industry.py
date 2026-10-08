#!/usr/bin/env python3
"""One-off (Oct 2026): tag every existing bucket1 item with an `industry`
label from taxonomy.json. Keyed by week_start + source_url so it is safe to
re-run; items that already carry an industry are left alone."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data.json"

F, B, FJ, E = "Food, Beverage & FMCG", "Beauty & Personal Care", "Fashion & Jewellery", "E-commerce & Quick Commerce"
BF, A, T, H = "BFSI & Fintech", "Auto & Mobility", "Tech, Telecom & Electronics", "Home & Durables"
R, M, HC, TR = "Real Estate & Building Materials", "Media, Entertainment & Sports", "Healthcare & Pharma", "Travel & Hospitality"
ED, EN, AD, O = "Education", "Energy & Industrial", "Adtech, Agencies & Regulation", "Other"

# week_start -> industries in the bucket1 order they appear in data.json (as of commit 6191650)
TAGS = {
    "2026-09-28": [M, FJ, E, F, FJ, A, A, H, F, H, F, BF, BF, FJ, B, B, B, H, H, BF, B, BF, HC, T, O,
                   F, EN, T, F, B, F, F, HC, E, AD, M, F, B, F, AD, F, EN, T, B, H, B, AD, M, F, M],
    "2026-09-21": [E, M, F, M, AD, B, B, FJ, BF, BF, M, T, TR, BF, E, H, EN, B, T, R, BF, T, F, AD, BF,
                   BF, A, E, FJ, F, E, F, F, A, TR, R, EN, B, T, H, BF, O, AD],
    "2026-09-14": [E, EN, FJ, T, H, B, FJ, H, BF, F, E, F, A, F, B, A, H, B, F, ED, ED, H, M, F, H, FJ, FJ, FJ],
    "2026-09-07": [FJ, F, T, AD, A, E, E, FJ, F, B, A, HC, BF, FJ, A, BF, F, FJ, T, A],
    "2026-08-31": [FJ, R, BF, F, H, BF, BF, T, BF, R, TR, H, AD, ED, T, H],
    "2026-08-24": [FJ, BF, E, O, H, AD, BF, M, FJ, B, E, FJ, F, FJ, EN, FJ, T],
    "2026-08-17": [F, E, R, M, T, M, M, F, FJ, F, BF, F, B, M],
    "2026-08-10": [E, H, HC, BF, R, B, FJ, FJ, FJ, R, H, A, FJ, F, O, F],
    "2026-08-03": [ED, M, B, AD, F, B, E, F, HC, H, FJ],
    "2026-07-27": [FJ, B],
    "2026-07-13": [AD, HC, TR, E, E],
    "2026-06-29": [R, E],
    "2026-06-15": [F],
}


def main():
    data = json.loads(DATA.read_text())
    tagged = 0
    for wk in data["weeks"]:
        tags = TAGS.get(wk["week_start"])
        items = wk.get("bucket1", [])
        if not items:
            continue
        if tags is None or len(tags) != len(items):
            raise SystemExit(f"tag count mismatch for {wk['week_start']}: {len(items)} items, {len(tags or [])} tags")
        for it, tag in zip(items, tags):
            if not it.get("industry"):
                it["industry"] = tag
                tagged += 1
    DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(f"tagged {tagged} bucket1 items")


if __name__ == "__main__":
    main()
