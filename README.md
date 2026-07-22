# Addiction & Family Law Hub

A personal current-awareness dashboard for tracking addiction, family law, and
their intersection — news, peer-reviewed research, court cases, policy/law,
books, and podcasts — in one place.

It's a static site (`index.html` + `assets/`) backed by JSON files in
`data/`. A scheduled GitHub Actions workflow refreshes most of that data daily
from free, keyless public sources; `data/policy.json` is a hand-curated list
you edit directly.

The default **Latest** tab interleaves the newest items across every
auto-updating category into one feed. While the page is open in a browser it
also rechecks `data/meta.json` every few minutes and silently reloads if a new
fetch has landed (with a small toast notification) — so it stays current
without a manual refresh, even though the underlying data only changes once a
day. The same combined feed is also published as `feed.xml` (RSS 2.0) for
subscribing in an external reader.

Practitioner-oriented extras:
- **Save** any card into a personal **Saved** tab (stored in `localStorage`,
  this browser only — there's no account/backend).
- **Cite** on Research and Court Cases items copies a simplified citation to
  the clipboard.
- **State filter** on Court Cases narrows results to a specific state (or
  Federal/Other), computed client-side from each case's court name.

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
2. **Enable Actions** if it's off: repo Settings → Actions → General →
   "Allow all actions and reusable workflows".
3. Push (or manually run) once — `.github/workflows/update-data.yml` fetches
   real data and `.github/workflows/pages.yml` deploys, chained via a
   `workflow_run` trigger so every daily refresh redeploys automatically.
4. Visit the Pages URL GitHub gives you (or open `index.html` directly in a
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
assets/app.js           Tab switching, search/filter, saved items, citations, rendering
data/*.json            Feed data (news/research/courts/books/podcasts auto-generated; policy hand-curated)
feed.xml                Combined RSS 2.0 feed, regenerated on every fetch run
scripts/fetch_feeds.py  Fetches from all sources, writes data/*.json + feed.xml
scripts/sources.json    Search-query config per category
.github/workflows/update-data.yml   Daily scheduled fetch + commit
.github/workflows/pages.yml         Deploys the static site to GitHub Pages (on push, or after a data refresh)
```
