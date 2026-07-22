#!/usr/bin/env python3
"""
Pulls fresh items for the Addiction & Family Law Hub from public, free
sources and writes them to data/*.json for the static site to render.

Sources (all stdlib-only, no API keys required):
  - news      -> Google News RSS
  - research  -> PubMed E-utilities
  - courts    -> CourtListener REST API
  - books     -> Google Books API
  - podcasts  -> iTunes Search API

Designed to run in GitHub Actions (normal internet access). Each source
fails independently -- one flaky feed never blocks the others, and the
previous data file is left untouched if a fetch fails.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
SOURCES = json.loads((ROOT / "scripts" / "sources.json").read_text())

USER_AGENT = (
    "Mozilla/5.0 (compatible; AddictionFamilyLawHub/1.0; "
    "+https://github.com/) research-aggregator"
)
TIMEOUT = 20
RETRIES = 3

# Tabloid/gossip outlets to drop even if they match a query -- this is a
# clinical/legal current-awareness feed, not entertainment news.
TABLOID_SOURCES = {
    "page six", "us weekly", "tmz", "people", "daily mail", "life & style",
    "in touch weekly", "hollywood life", "ok magazine", "national enquirer",
    "star magazine", "music times", "nw magazine", "radar online",
}


def fetch(url, headers=None):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    last_err = None
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return resp.read()
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            time.sleep(1.5 * (attempt + 1))
    raise last_err


def strip_html(text):
    if not text:
        return ""
    return re.sub(r"<[^>]+>", "", text).strip()


def dedupe(items, key="link"):
    seen = set()
    out = []
    for item in items:
        k = item.get(key)
        if k and k in seen:
            continue
        if k:
            seen.add(k)
        out.append(item)
    return out


# ---------------------------------------------------------------- news --
def fetch_google_news(query, limit=8):
    url = (
        "https://news.google.com/rss/search?q="
        + urllib.parse.quote(query)
        + "&hl=en-US&gl=US&ceid=US:en"
    )
    xml = fetch(url)
    root = ET.fromstring(xml)
    items = []
    for item in root.findall("./channel/item"):
        source_el = item.find("source")
        source = source_el.text.strip() if source_el is not None and source_el.text else ""
        if source.strip().lower() in TABLOID_SOURCES:
            continue
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub_date = (item.findtext("pubDate") or "").strip()
        desc = strip_html(item.findtext("description"))
        items.append(
            {
                "title": title,
                "link": link,
                "source": source,
                "published": pub_date,
                "summary": desc[:280],
                "query": query,
            }
        )
        if len(items) >= limit:
            break
    return items


# ----------------------------------------------------------- research --
def fetch_pubmed(query, limit=8):
    base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    search_url = (
        f"{base}/esearch.fcgi?db=pubmed&retmode=json&sort=date&retmax={limit}"
        f"&term={urllib.parse.quote(query)}"
    )
    search_data = json.loads(fetch(search_url))
    ids = search_data.get("esearchresult", {}).get("idlist", [])
    if not ids:
        return []
    time.sleep(0.4)  # be polite to NCBI rate limits
    summary_url = f"{base}/esummary.fcgi?db=pubmed&retmode=json&id={','.join(ids)}"
    summary_data = json.loads(fetch(summary_url))
    result = summary_data.get("result", {})
    items = []
    for pmid in ids:
        rec = result.get(pmid)
        if not rec:
            continue
        authors = [a.get("name", "") for a in rec.get("authors", []) if a.get("name")]
        author_str = ", ".join(authors[:3]) + (" et al." if len(authors) > 3 else "")
        items.append(
            {
                "title": rec.get("title", "").strip(),
                "link": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                "journal": rec.get("fulljournalname") or rec.get("source", ""),
                "authors": author_str,
                "published": rec.get("pubdate", ""),
                "query": query,
            }
        )
    return items


# -------------------------------------------------------------- courts --
def fetch_courtlistener(query, limit=8):
    url = (
        "https://www.courtlistener.com/api/rest/v3/search/?type=o&order_by=dateFiled%20desc&q="
        + urllib.parse.quote(query)
    )
    data = json.loads(fetch(url))
    items = []
    for res in data.get("results", [])[:limit]:
        cluster_id = res.get("cluster_id") or res.get("id")
        items.append(
            {
                "title": res.get("caseName", "").strip(),
                "link": f"https://www.courtlistener.com{res.get('absolute_url', '')}"
                if res.get("absolute_url")
                else f"https://www.courtlistener.com/opinion/{cluster_id}/",
                "court": res.get("court", ""),
                "date_filed": res.get("dateFiled", ""),
                "snippet": strip_html(res.get("snippet", ""))[:280],
                "query": query,
            }
        )
    return items


# --------------------------------------------------------------- books --
def fetch_google_books(query, limit=6):
    url = (
        "https://www.googleapis.com/books/v1/volumes?orderBy=newest&maxResults="
        f"{limit}&q=" + urllib.parse.quote(query)
    )
    data = json.loads(fetch(url))
    items = []
    for vol in data.get("items", []):
        info = vol.get("volumeInfo", {})
        items.append(
            {
                "title": info.get("title", "").strip(),
                "authors": ", ".join(info.get("authors", [])),
                "published": info.get("publishedDate", ""),
                "link": info.get("infoLink", "") or info.get("canonicalVolumeLink", ""),
                "description": strip_html(info.get("description", ""))[:280],
                "thumbnail": info.get("imageLinks", {}).get("thumbnail", ""),
                "query": query,
            }
        )
    return items


# ------------------------------------------------------------ podcasts --
def fetch_itunes_podcasts(query, limit=6):
    url = (
        "https://itunes.apple.com/search?media=podcast&limit="
        f"{limit}&term=" + urllib.parse.quote(query)
    )
    data = json.loads(fetch(url))
    items = []
    for res in data.get("results", []):
        items.append(
            {
                "title": res.get("collectionName", "").strip(),
                "artist": res.get("artistName", ""),
                "link": res.get("collectionViewUrl", "") or res.get("trackViewUrl", ""),
                "feed_url": res.get("feedUrl", ""),
                "artwork": res.get("artworkUrl100", ""),
                "query": query,
            }
        )
    return items


def sort_key(item):
    for field in ("published", "date_filed"):
        val = item.get(field)
        if val:
            return val
    return ""


def build_category(name, fetch_fn, arg_key="queries"):
    cfg = SOURCES[name]
    kwargs = {"limit": cfg["per_query_limit"]} if "per_query_limit" in cfg else {}
    all_items = []
    errors = []
    for query in cfg[arg_key]:
        try:
            all_items.extend(fetch_fn(query, **kwargs))
        except Exception as e:  # noqa: BLE001 - one bad source must not break the run
            errors.append({"query": query, "error": str(e)})
            print(f"[warn] {name} query failed ({query!r}): {e}", file=sys.stderr)

    all_items = dedupe(all_items)
    all_items.sort(key=sort_key, reverse=True)
    all_items = all_items[: cfg.get("max_items", 40)]

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "label": cfg["label"],
        "count": len(all_items),
        "errors": errors,
        "items": all_items,
    }

    out_path = DATA_DIR / f"{name}.json"
    if all_items or not out_path.exists():
        out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False))
        print(f"[ok] wrote {len(all_items)} items to {out_path.name} ({len(errors)} query errors)")
    else:
        print(f"[warn] no items fetched for {name}; leaving existing {out_path.name} untouched")


def main():
    DATA_DIR.mkdir(exist_ok=True)
    build_category("news", fetch_google_news)
    build_category("research", fetch_pubmed)
    build_category("courts", fetch_courtlistener)
    build_category("books", fetch_google_books)
    build_category("podcasts", fetch_itunes_podcasts)

    meta = {"last_run": datetime.now(timezone.utc).isoformat()}
    (DATA_DIR / "meta.json").write_text(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
