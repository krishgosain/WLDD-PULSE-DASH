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
    python run.py merge new_items.json        # merge a buckets-shaped JSON file into data.json
    python run.py merge new_items.json --dry-run

new_items.json must have the same shape as data.json:
    {"bucket1": [...], "bucket2": [...], "bucket3": [...], "bucket4": [...],
     "bucket5": [...], "flagged": {...}}

Dedup key: source_url (bucket1-3), or (person, new_company, date) for bucket4.
"""

import argparse
import json
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = Path(__file__).resolve().parent / "sources.json"
DATA_FILE = ROOT / "data.json"

USER_AGENT = (
    "Mozilla/5.0 (compatible; WLDDPulseDashBot/1.0; "
    "+https://github.com/krishgosain/wldd-pulse-dash)"
)

EMPTY_DATA = {
    "bucket1": [],
    "bucket2": [],
    "bucket3": [],
    "bucket4": [],
    "bucket5": [],
    "flagged": {"bucket1": [], "bucket2": [], "bucket3": [], "bucket4": []},
    "updated_at": None,
}


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


def merge_data(existing: dict, incoming: dict) -> dict:
    merged = json.loads(json.dumps(existing))
    for bucket in ("bucket1", "bucket2", "bucket3", "bucket4"):
        existing_keys = {item_key(bucket, i) for i in merged.get(bucket, [])}
        new_items = [
            i for i in incoming.get(bucket, []) if item_key(bucket, i) not in existing_keys
        ]
        merged[bucket] = new_items + merged.get(bucket, [])
        merged[bucket].sort(key=lambda i: i.get("date") or "", reverse=True)

    # bucket5 (strategic insights) is a fresh weekly take — replace rather than accumulate forever,
    # keep most recent 20 across runs
    merged["bucket5"] = (incoming.get("bucket5", []) + merged.get("bucket5", []))[:20]

    for bucket in ("bucket1", "bucket2", "bucket3", "bucket4"):
        merged.setdefault("flagged", {}).setdefault(bucket, [])
        new_flags = incoming.get("flagged", {}).get(bucket, [])
        for f in new_flags:
            if f not in merged["flagged"][bucket]:
                merged["flagged"][bucket].append(f)

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
            print(f"Merged. data.json now has "
                  f"{len(merged['bucket1'])}/{len(merged['bucket2'])}/{len(merged['bucket3'])}/"
                  f"{len(merged['bucket4'])}/{len(merged['bucket5'])} items "
                  f"(buckets 1-5).", file=sys.stderr)


if __name__ == "__main__":
    main()
