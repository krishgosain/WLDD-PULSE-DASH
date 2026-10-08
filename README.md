# WLDD Pulse Dash

Internal media & marketing industry dashboard for WLDD's BD team. Tracks agency
mandates, campaigns, M&A, product launches, and people moves across Indian and
global media/marketing trade press, with a weekly "how could WLDD sell into this"
strategic pass.

## Structure

```
wldd-pulse-dash/
├── site/              dashboard frontend (static HTML/CSS/JS, reads ../data.json)
├── scraper/
│   ├── sources.json   editable list of tracked sources (core + experiential)
│   ├── taxonomy.json  fixed industry / experience-category labels
│   ├── run.py         weekly job: fetch → extract → categorize → link → save
│   └── prompt.md       WLDD product context used for the Bucket 5 strategic pass
├── data.json          weekly-bucketed items, newest week first (source of truth for the site)
└── README.md
```

## How it works

1. **Site** (`site/`) is a static page with a week picker, a 6-tab bucket view for
   the selected week, and a search box that queries every archived week at once.
   It fetches `data.json` and renders it client-side. No build step; deploys as-is
   on Vercel.
2. **Scraper** (`scraper/run.py`) is designed to be run by an agentic coding
   assistant (Claude Code) rather than as a traditional headless scraper: it fetches
   each source in `sources.json`, extracts and categorizes items into the 5 buckets,
   dedupes against the existing `data.json`, resolves company websites (web search)
   and person LinkedIn profiles (Apollo people-match), runs the Bucket 5 strategic
   pass using `prompt.md`, and merges the result into the correct week of `data.json`.
3. A weekly Claude Code cloud Routine runs this job every Monday 10:00 AM IST,
   commits the updated `data.json` to `main`, and pushes — Vercel then
   auto-redeploys from the new commit.

## Weekly structure

`data.json` is `{"weeks": [...], "updated_at": ...}`, weeks sorted newest first.
Each week is a strict, non-overlapping Monday-to-Monday span:

```
week_start (Monday, inclusive)  →  week_end (the following Monday, exclusive)
```

**Boundary rule**: an article dated exactly on a Monday belongs to the week
*starting* that Monday, never the week ending on it. Every item is routed into
its own week by its `date` field (not by when the scraper happened to run), so
weeks never overlap and nothing repeats across them. The site defaults to the
most recent week and lets you browse every earlier week via the week picker, or
search across all of them at once — searched matches are not deleted or rotated
out, they just move into the archive as new weeks are added.

## The buckets

1. **Ad mandates, campaigns & marketing stunts** — agency mandates, notable
   campaigns, feature rollouts, stunts. Each item has a "why it's important" subline.
2. **M&A** — mergers, acquisitions, investments, stake sales, split into India and
   Global sections. Each item has a "why it's important" subline.
3. **New products & brand launches** — genuinely new products/platforms/apps or
   significant new AI capabilities. Each item has a "why it's important" subline.
4. **People moves** — executive appointments/promotions with a clear destination
   (no bare exits). No subline.
5. **Strategic insights** — for the week's highest-potential items, how WLDD could
   sell in, mapped to a specific WLDD product (Solo, Memed, Imagined, The Lit
   School, Scoopwhoop).
6. **Experiential Economy** (`bucket6`, shown second on the site, right after
   Mandates & Campaigns) — concerts and comedy tours, film releases and trailer
   launches, HYROX, marathons and endurance events, music and cultural festivals,
   brand-owned experiences/IPs, and ticketing/venue/policy news. Same item shape
   as bucket 1 plus a required `category` and optional `region` (India/Global).

### Grouping labels

Every bucket 1 item carries an `industry` (the brand/client's industry, not the
agency's) and every bucket 6 item a `category`. Both label sets are fixed in
`scraper/taxonomy.json`; `run.py merge` warns about and defaults any unknown
label. On the site, bucket 1 and bucket 6 show a chip row to narrow to one
industry/category and, by default, a sectioned view grouped by it.

## Hyperlinking

Every company name links to its official site (resolved via web search, cached in
`data.json` so it isn't re-resolved every week). Every named person links to their
LinkedIn profile (resolved via Apollo's people-match API, matched on name +
organization). Anything that can't be confidently resolved is left unlinked and
listed in a "flagged" section at the end of its bucket, for that week, instead of
guessing.

## Editing sources

Add/remove sources by editing `scraper/sources.json` — no code changes needed.

## Deployment

Static site on Vercel (free tier), connected to this repo's default branch for
auto-redeploy on every push. `vercel.json` at the repo root routes `/` to `site/`
and leaves `/data.json` served from the repo root.

## Secrets

The weekly Routine needs `ANTHROPIC_API_KEY` and an Apollo API key, configured in
Claude Code's environment/secrets — never committed to this repo.
