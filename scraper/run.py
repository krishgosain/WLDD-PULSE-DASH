#!/usr/bin/env python3
"""
WLDD Pulse Dash — weekly scraper job.

This script handles the *mechanical* parts of the weekly run (fetching source
pages into a raw link list, and merging/deduping new items into data.json). It
is designed to be driven by an agentic coding assistant (Claude Code): the
assistant runs `fetch`, reads the raw listings, does the actual extraction /
categorization / "why it's important" writing / company & person link
resolution (web search + Apollo) / Bucket 5 strategic pass itself, then calls
`merge` to write the results into data.json and `run.py` again is not needed
for git commit/push (the assistant does that directly).

Usage:
    python run.py fetch                      # fetch all sources, print raw links as JSON
    python run.py fetch --out raw.json        # ...and save to a file
    python run.py merge new_items.json        # merge a flat buckets-shaped JSON file into data.json
    python run.py merge new_items.json --dry-run

new_items.json is a FLAT (not week-nested) buckets object — the item shape data.json
uses inside each week entry:
    {"bucket1": [...], "bucket2": [...], "bucket3": [...], "bucket4": [...],
     "bucket5": [...], "flagged": {...}}

`merge` routes each bucket1-4 item into its own Monday-start week bucket by the
item's `date` field (strict, non-overlapping weeks — a date that IS a Monday
belongs to the week starting on it, not the one ending on it). bucket5 and
flagged entries are filed under the week containing today (the run date).
data.json itself is week-nested: {"weeks": [{"week_start", "week_end",
"bucket1".."bucket5", "flagged"}, ...], "updated_at"}, newest week first.

Dedup key: source_url (bucket1-3), or (person, new_company, date) for bucket4,
scoped within each item's own week.
"""

import argparse
import json
import sys
import urllib.request
import urllib.error
from datetime import datetime, date, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = Path(__file__).resolve().parent / "sources.json"
DATA_FILE = ROOT / "data.json"

USER_AGENT = (
    "Mozilla/5.0 (compatible; WLDDPulseDashBot/1.0; "
    "+https://github.com/krishgosain/wldd-pulse-dash)"
)

EMPTY_DATA = {"weeks": [], "updated_at": None}

EMPTY_WEEK = {
    "bucket1": [],
    "bucket2": [],
    "bucket3": [],
    "bucket4": [],
    "bucket5": [],
    "flagged": {"bucket1": [], "bucket2": [], "bucket3": [], "bucket4": []},
}


def monday_of(d: date) -> date:
    """Monday-start week boundary. A date that IS a Monday belongs to the week
    starting on it (not the prior week ending on it) — the strict, non-overlapping
    boundary rule: each week runs [week_start, week_end) with week_start inclusive
    and week_end (the following Monday) exclusive."""
    return d - timedelta(days=d.weekday())


def parse_item_date(s):
    """Best-effort parse of an item's date field (YYYY-MM-DD, YYYY-MM, or YYYY)."""
    if not s:
        return None
    parts = s.split("-")
    try:
        if len(parts) == 3:
            return date(int(parts[0]), int(parts[1]), int(parts[2]))
        if len(parts) == 2:
            return date(int(parts[0]), int(parts[1]), 15)
        if len(parts) == 1:
            return date(int(parts[0]), 1, 1)
    except (ValueError, IndexError):
        return None
    return None


def week_bounds_for(d: date):
    ws = monday_of(d)
    we = ws + timedelta(days=7)
    return ws.isoformat(), we.isoformat()


class LinkExtractor(HTMLParser):
    """Minimal HTML link/title extractor — good enough to produce a raw
    candidate list of (url, anchor text) pairs for a human/agent to triage.
    Not a full article scraper; the agent does the real extraction by
    visiting promising links."""

    def __init__(self):
        super().__init__()
        self.links = []
        self._in_a = False
        self._href = None
        self._text = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            attrs = dict(attrs)
            href = attrs.get("href")
            if href:
                self._in_a = True
                self._href = href
                self._text = []

    def handle_data(self, data):
        if self._in_a:
            self._text.append(data.strip())

    def handle_endtag(self, tag):
        if tag == "a" and self._in_a:
            text = " ".join(t for t in self._text if t).strip()
            if text and len(text) > 15:
                self.links.append({"url": self._href, "text": text})
            self._in_a = False
            self._href = None
            self._text = []


def fetch_url(url: str, timeout: int = 20) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        charset = resp.headers.get_content_charset() or "utf-8"
        return resp.read().decode(charset, errors="replace")


def fetch_sources() -> dict:
    sources = json.loads(SOURCES_FILE.read_text())["sources"]
    results = {}
    for src in sources:
        name, url = src["name"], src["url"]
        try:
            html = fetch_url(url)
            parser = LinkExtractor()
            parser.feed(html)
            # de-dupe by url, keep order
            seen = set()
            links = []
            for link in parser.links:
                if link["url"] in seen:
                    continue
                seen.add(link["url"])
                links.append(link)
            results[name] = {"url": url, "status": "ok", "links": links[:200]}
        except (urllib.error.URLError, TimeoutError, Exception) as e:  # noqa: BLE001
            results[name] = {"url": url, "status": "error", "error": str(e), "links": []}
    return results


def load_data() -> dict:
    if DATA_FILE.exists():
        return json.loads(DATA_FILE.read_text())
    return json.loads(json.dumps(EMPTY_DATA))


def item_key(bucket: str, item: dict):
    if bucket == "bucket4":
        return (item.get("person"), item.get("new_company"), item.get("date"))
    return item.get("source_url")


def find_or_create_week(data: dict, week_start: str, week_end: str) -> dict:
    for wk in data["weeks"]:
        if wk["week_start"] == week_start:
            return wk
    wk = json.loads(json.dumps(EMPTY_WEEK))
    wk["week_start"] = week_start
    wk["week_end"] = week_end
    data["weeks"].append(wk)
    data["weeks"].sort(key=lambda w: w["week_start"], reverse=True)
    return wk


def find_items_week(data: dict, source_url: str, headline: str):
    """Locate which week a bucket1-4 item lives in, matching by source_url (or
    headline as a fallback). Returns the week dict, or None if not found."""
    for wk in data["weeks"]:
        for bucket in ("bucket1", "bucket2", "bucket3"):
            for it in wk[bucket]:
                if (source_url and it.get("source_url") == source_url) or it.get("headline") == headline:
                    return wk
        for it in wk["bucket4"]:
            if source_url and it.get("source_url") == source_url:
                return wk
    return None


def merge_data(existing: dict, incoming_items: dict, run_date: date = None) -> dict:
    """incoming_items has the same per-bucket shape as before (flat lists of new
    items to add), NOT a weeks-shaped object. Each item is routed into its own
    Monday-start week by its `date` field (bucket1-4) using the strict boundary
    rule. bucket5 items are filed into the SAME week as the bucket1-4 item they
    reference (via ref_item/source_url) — NOT the run date — so a week's
    strategic insights always live alongside the news that inspired them. Only
    falls back to the run-date week if no matching referenced item is found."""
    merged = json.loads(json.dumps(existing))
    merged.setdefault("weeks", [])
    run_date = run_date or datetime.now(timezone.utc).date()

    for bucket in ("bucket1", "bucket2", "bucket3", "bucket4"):
        for item in incoming_items.get(bucket, []):
            d = parse_item_date(item.get("date")) or run_date
            ws, we = week_bounds_for(d)
            wk = find_or_create_week(merged, ws, we)
            existing_keys = {item_key(bucket, i) for i in wk[bucket]}
            if item_key(bucket, item) not in existing_keys:
                wk[bucket].append(item)
                wk[bucket].sort(key=lambda i: i.get("date") or "", reverse=True)

    if incoming_items.get("bucket5"):
        for item in incoming_items["bucket5"]:
            wk = find_items_week(merged, item.get("source_url"), item.get("ref_item"))
            if wk is None:
                ws, we = week_bounds_for(run_date)
                wk = find_or_create_week(merged, ws, we)
            existing_refs = {i.get("ref_item") for i in wk["bucket5"]}
            if item.get("ref_item") not in existing_refs:
                wk["bucket5"].append(item)

    if incoming_items.get("flagged"):
        ws, we = week_bounds_for(run_date)
        wk = find_or_create_week(merged, ws, we)
        for bucket, flags in incoming_items["flagged"].items():
            wk.setdefault("flagged", {}).setdefault(bucket, [])
            for f in flags:
                if f not in wk["flagged"][bucket]:
                    wk["flagged"][bucket].append(f)

    merged["weeks"].sort(key=lambda w: w["week_start"], reverse=True)
    merged["updated_at"] = datetime.now(timezone.utc).isoformat()
    return merged


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_fetch = sub.add_parser("fetch", help="fetch all sources, output raw link candidates")
    p_fetch.add_argument("--out", type=str, default=None)

    p_merge = sub.add_parser("merge", help="merge a new-items JSON file into data.json")
    p_merge.add_argument("file", type=str)
    p_merge.add_argument("--dry-run", action="store_true")

    args = parser.parse_args()

    if args.cmd == "fetch":
        results = fetch_sources()
        out = json.dumps(results, indent=2, ensure_ascii=False)
        if args.out:
            Path(args.out).write_text(out)
            print(f"Wrote raw listings for {len(results)} sources to {args.out}", file=sys.stderr)
        else:
            print(out)

    elif args.cmd == "merge":
        incoming = json.loads(Path(args.file).read_text())
        existing = load_data()
        merged = merge_data(existing, incoming)
        if args.dry_run:
            print(json.dumps(merged, indent=2, ensure_ascii=False))
        else:
            DATA_FILE.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n")
            print(f"Merged. data.json now has {len(merged['weeks'])} week(s):", file=sys.stderr)
            for wk in merged["weeks"]:
                counts = "/".join(str(len(wk[b])) for b in ("bucket1", "bucket2", "bucket3", "bucket4", "bucket5"))
                print(f"  {wk['week_start']} .. {wk['week_end']}: {counts} (buckets 1-5)", file=sys.stderr)


if __name__ == "__main__":
    main()
