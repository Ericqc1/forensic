(function () {
  "use strict";

  const DATA_FILES = {
    news: "data/news.json",
    research: "data/research.json",
    courts: "data/courts.json",
    policy: "data/policy.json",
    books: "data/books.json",
    podcasts: "data/podcasts.json",
  };

  const QUICK_LINKS = {
    news: [
      ["Search Google News", "https://news.google.com/search?q=addiction%20family%20law"],
    ],
    research: [
      ["PubMed advanced search", "https://pubmed.ncbi.nlm.nih.gov/advanced/"],
      ["Google Scholar", "https://scholar.google.com/scholar?q=addiction+family+law+custody"],
    ],
    courts: [
      ["CourtListener search", "https://www.courtlistener.com/?q=custody+substance+abuse&type=o"],
      ["Justia case law", "https://law.justia.com/cases/"],
    ],
    policy: [
      ["Congress.gov", "https://www.congress.gov/"],
      ["NCSL", "https://www.ncsl.org/"],
    ],
    books: [
      ["Google Books search", "https://www.google.com/search?tbm=bks&q=addiction+family+law"],
    ],
    podcasts: [
      ["Apple Podcasts search", "https://podcasts.apple.com/us/search?term=addiction%20family%20law"],
      ["Spotify search", "https://open.spotify.com/search/addiction%20family%20law"],
    ],
  };

  const state = {
    activeTab: "news",
    data: {},
    query: "",
  };

  const panel = document.getElementById("panel");
  const statusLine = document.getElementById("status-line");
  const quickLinksEl = document.getElementById("quick-links");
  const searchInput = document.getElementById("search");
  const themeToggle = document.getElementById("theme-toggle");

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function timeAgo(iso) {
    if (!iso) return "unknown";
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return iso;
    const diffH = Math.round((Date.now() - then) / 36e5);
    if (diffH < 1) return "just now";
    if (diffH < 24) return `${diffH}h ago`;
    return `${Math.round(diffH / 24)}d ago`;
  }

  async function loadAll() {
    const entries = await Promise.all(
      Object.entries(DATA_FILES).map(async ([key, path]) => {
        try {
          const res = await fetch(`${path}?t=${Date.now()}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return [key, await res.json()];
        } catch (e) {
          return [key, { error: String(e), items: [] }];
        }
      })
    );
    entries.forEach(([key, val]) => (state.data[key] = val));
  }

  function cardFor(tab, item) {
    switch (tab) {
      case "news":
        return `<div class="card">
          <span class="tag">${escapeHtml(item.source || "News")}</span>
          <h3><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
          <p class="summary">${escapeHtml(item.summary)}</p>
          <span class="meta">${escapeHtml(item.published || "")}</span>
        </div>`;
      case "research":
        return `<div class="card">
          <span class="tag">${escapeHtml(item.journal || "Journal")}</span>
          <h3><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
          <p class="summary">${escapeHtml(item.authors || "")}</p>
          <span class="meta">${escapeHtml(item.published || "")}</span>
        </div>`;
      case "courts":
        return `<div class="card">
          <span class="tag">${escapeHtml(item.court || "Court")}</span>
          <h3><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
          <p class="summary">${escapeHtml(item.snippet || "")}</p>
          <span class="meta">Filed: ${escapeHtml(item.date_filed || "unknown")}</span>
        </div>`;
      case "policy":
        return `<div class="card">
          <span class="tag">${escapeHtml(item.org || "Policy")}</span>
          <h3><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
          <p class="summary">${escapeHtml(item.description || "")}</p>
        </div>`;
      case "books":
        return `<div class="card">
          ${item.thumbnail ? `<img class="thumb" src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy" />` : ""}
          <h3><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
          <p class="summary">${escapeHtml(item.authors || "")} — ${escapeHtml(item.published || "")}</p>
          <p class="summary">${escapeHtml(item.description || "")}</p>
        </div>`;
      case "podcasts":
        return `<div class="card">
          ${item.artwork ? `<img class="thumb" src="${escapeHtml(item.artwork)}" alt="" loading="lazy" />` : ""}
          <h3><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
          <p class="summary">${escapeHtml(item.artist || "")}</p>
        </div>`;
      default:
        return "";
    }
  }

  function itemMatches(item, q) {
    if (!q) return true;
    const haystack = Object.values(item).filter((v) => typeof v === "string").join(" ").toLowerCase();
    return haystack.includes(q);
  }

  function render() {
    const tab = state.activeTab;
    const bucket = state.data[tab] || { items: [] };
    const items = (bucket.items || []).filter((it) => itemMatches(it, state.query.toLowerCase()));

    if (bucket.error) {
      panel.innerHTML = `<div class="empty-state">Couldn't load this category (${escapeHtml(bucket.error)}).</div>`;
    } else if (!items.length) {
      const emptyMsg = bucket.generated_at === undefined
        ? "No items yet."
        : bucket.generated_at
          ? "No items match your filter."
          : "No data yet — this fills in after the first \"Update Feed Data\" GitHub Actions run (or run scripts/fetch_feeds.py locally).";
      panel.innerHTML = `<div class="empty-state">${escapeHtml(emptyMsg)}</div>`;
    } else {
      panel.innerHTML = items.map((it) => cardFor(tab, it)).join("");
    }

    const links = (QUICK_LINKS[tab] || [])
      .map(([label, url]) => `<a href="${url}" target="_blank" rel="noopener">${escapeHtml(label)} ↗</a>`)
      .join("");
    quickLinksEl.innerHTML = links;

    if (tab === "policy") {
      statusLine.textContent = `Curated list · last reviewed ${bucket.last_reviewed || "unknown"} · ${(bucket.items || []).length} entries`;
    } else if (bucket.generated_at) {
      const errCount = (bucket.errors || []).length;
      statusLine.textContent = `Updated ${timeAgo(bucket.generated_at)} · ${bucket.count ?? items.length} items` +
        (errCount ? ` · ${errCount} source ${errCount === 1 ? "query" : "queries"} failed` : "");
    } else if (bucket.error) {
      statusLine.textContent = "Failed to load.";
    } else {
      statusLine.textContent = "Not generated yet.";
    }
  }

  function selectTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.setAttribute("aria-selected", String(btn.dataset.tab === tab));
    });
    render();
  }

  function initTheme() {
    const saved = localStorage.getItem("theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    themeToggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
    });
  }

  function init() {
    initTheme();
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => selectTab(btn.dataset.tab));
    });
    searchInput.addEventListener("input", (e) => {
      state.query = e.target.value;
      render();
    });

    loadAll().then(() => {
      document.getElementById("loading-state")?.remove();
      render();
    });
  }

  init();
})();
