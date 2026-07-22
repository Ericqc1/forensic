# Addiction & Family Law Hub

A personal current-awareness dashboard for tracking addiction, family law, and
their intersection — news, peer-reviewed research, court cases, policy/law,
books, and podcasts — in one place.

It's a static site (`index.html` + `assets/`) backed by JSON files in
`data/`. A scheduled GitHub Actions workflow refreshes most of that data daily
from free, keyless public sources; `data/policy.json` is a hand-curated list
you edit directly.

## Sources

| Category | Source | Notes |
|---|---|---|
| News | Google News RSS | Per-topic search queries |
| Peer-reviewed research | PubMed E-utilities | esearch + esummary, sorted by date |
| Court cases | CourtListener REST API | Public opinions search |
| Books | Open Library Search API | Sorted by newest |
| Podcasts | iTunes Search API | Podcast search |
| Policy & Law | Hand-curated | `data/policy.json` — no good free legislative-tracking API exists, so this is maintained manually |

All of these are free and require no API keys. None of the fetch calls could
be tested from the sandbox this was built in (its outbound network is
allowlisted and blocks these hosts), but they run fine from GitHub Actions'
runners, which have normal internet access — the workflow's first run is the
real test. If a particular query starts failing (site layout change, rate
limit, etc.), check the `errors` array in the corresponding `data/*.json`
file; each source fails independently so one bad query never blocks the rest.

## One-time setup

1. **Enable GitHub Pages**: repo Settings → Pages → Source: "GitHub Actions".
   The included `.github/workflows/pages.yml` deploys the site on every push
   to `main`. Until this branch is merged to `main`, trigger it manually from
   the Actions tab ("Deploy Hub to GitHub Pages" → Run workflow) to preview.
2. **Kick off the first data fetch**: Actions tab → "Update Feed Data" → Run
   workflow. This populates `data/news.json`, `research.json`, `courts.json`,
   `books.json`, and `podcasts.json` (they start empty). After that it runs
   automatically once a day (12:00 UTC).
3. Visit the Pages URL GitHub gives you (or open `index.html` directly in a
   browser — it works locally too, since it just reads relative JSON files).

## Customizing what it tracks

Edit `scripts/sources.json` — it's a list of plain search queries per
category (e.g. `"parental substance abuse custody"`). Add, remove, or reword
queries to shift focus; no code changes needed. The next scheduled run (or a
manual "Run workflow") picks up the change.

For Policy & Law, edit `data/policy.json` directly — add an object with
`title`, `org`, `link`, and `description` for any statute tracker, agency
page, or professional-association resource you want listed.

## Running the fetch script locally

```bash
python3 scripts/fetch_feeds.py
```

Requires only the Python standard library (3.8+). Writes/updates the files
in `data/`.

## Structure

```
index.html            Dashboard shell
assets/style.css       Styling (light/dark, responsive card grid)
assets/app.js           Tab switching, search/filter, rendering
data/*.json            Feed data (news/research/courts/books/podcasts auto-generated; policy hand-curated)
scripts/fetch_feeds.py  Fetches from all sources, writes data/*.json
scripts/sources.json    Search-query config per category
.github/workflows/update-data.yml   Daily scheduled fetch + commit
.github/workflows/pages.yml         Deploys the static site to GitHub Pages
```
