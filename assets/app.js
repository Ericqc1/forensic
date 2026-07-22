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

  const LATEST_SOURCE_CATEGORIES = ["news", "research", "courts", "books", "podcasts"];
  const LATEST_PER_CATEGORY = 5;
  const REFRESH_CHECK_MS = 3 * 60 * 1000; // recheck data/meta.json every 3 minutes
  const SAVED_STORAGE_KEY = "afl-saved-items";

  const US_STATES = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
    "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
    "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
    "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
    "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina",
    "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
    "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
    "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
  ];
  const FEDERAL_OTHER = "Federal / Other";

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
      ["Open Library search", "https://openlibrary.org/search?q=addiction+family+law"],
    ],
    podcasts: [
      ["Apple Podcasts search", "https://podcasts.apple.com/us/search?term=addiction%20family%20law"],
      ["Spotify search", "https://open.spotify.com/search/addiction%20family%20law"],
    ],
  };

  const CATEGORY_LABELS = {
    news: "News", research: "Research", courts: "Court Cases",
    policy: "Policy & Law", books: "Books", podcasts: "Podcasts",
  };

  const state = {
    activeTab: "latest",
    data: {},
    query: "",
    lastRun: null,
    saved: [],
    courtStateFilter: "",
  };

  const panel = document.getElementById("panel");
  const statusText = document.getElementById("status-text");
  const quickLinksEl = document.getElementById("quick-links");
  const searchInput = document.getElementById("search");
  const themeToggle = document.getElementById("theme-toggle");
  const toastEl = document.getElementById("toast");
  const stateFilterEl = document.getElementById("state-filter");

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

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove("show"), 3200);
  }

  async function fetchJson(path) {
    const res = await fetch(`${path}?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function loadAll() {
    const entries = await Promise.all(
      Object.entries(DATA_FILES).map(async ([key, path]) => {
        try {
          return [key, await fetchJson(path)];
        } catch (e) {
          return [key, { error: String(e), items: [] }];
        }
      })
    );
    entries.forEach(([key, val]) => (state.data[key] = val));
    try {
      const meta = await fetchJson("data/meta.json");
      state.lastRun = meta.last_run || null;
    } catch (e) {
      // meta is best-effort; ignore failures
    }
  }

  function buildLatest() {
    const combined = [];
    let round = 0;
    let added = true;
    while (added && round < LATEST_PER_CATEGORY) {
      added = false;
      for (const cat of LATEST_SOURCE_CATEGORIES) {
        const items = (state.data[cat] && state.data[cat].items) || [];
        if (items[round]) {
          combined.push({ ...items[round], _cat: cat });
          added = true;
        }
      }
      round += 1;
    }
    return combined;
  }

  // ------------------------------------------------------------- saved --
  function loadSaved() {
    try {
      state.saved = JSON.parse(localStorage.getItem(SAVED_STORAGE_KEY) || "[]");
    } catch (e) {
      state.saved = [];
    }
  }

  function persistSaved() {
    localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(state.saved));
  }

  function isSaved(link) {
    return link ? state.saved.some((it) => it.link === link) : false;
  }

  function toggleSaved(item) {
    const idx = state.saved.findIndex((it) => it.link === item.link);
    if (idx >= 0) {
      state.saved.splice(idx, 1);
      showToast("Removed from Saved");
    } else {
      state.saved.push(item);
      showToast("Saved");
    }
    persistSaved();
    updateTabCounts();
    render();
  }

  // --------------------------------------------------------- citations --
  function citationFor(cat, item) {
    if (cat === "research") {
      const yearMatch = (item.published || "").match(/\d{4}/);
      const year = yearMatch ? yearMatch[0] : "n.d.";
      const authors = item.authors ? `${item.authors} ` : "";
      const journal = item.journal ? `${item.journal}. ` : "";
      return `${authors}(${year}). ${item.title} ${journal}Retrieved from ${item.link}`.replace(/\s+/g, " ").trim();
    }
    if (cat === "courts") {
      const yearMatch = (item.date_filed || "").match(/^\d{4}/);
      const year = yearMatch ? yearMatch[0] : "n.d.";
      const court = item.court ? `${item.court}, ` : "";
      return `${item.title}, ${court}${year}. Retrieved from ${item.link}`.replace(/\s+/g, " ").trim();
    }
    return item.link || "";
  }

  // ----------------------------------------------------------- courts --
  function stateForCourt(courtStr) {
    if (!courtStr) return FEDERAL_OTHER;
    for (const s of US_STATES) {
      if (courtStr.includes(s)) return s;
    }
    return FEDERAL_OTHER;
  }

  function updateStateFilterUI(tab) {
    if (tab !== "courts") {
      stateFilterEl.hidden = true;
      return;
    }
    const items = (state.data.courts && state.data.courts.items) || [];
    const counts = {};
    items.forEach((it) => {
      const s = stateForCourt(it.court);
      counts[s] = (counts[s] || 0) + 1;
    });
    const states = Object.keys(counts).filter((s) => s !== FEDERAL_OTHER).sort();
    const current = state.courtStateFilter;
    let optionsHtml = `<option value="">All states &amp; federal</option>`;
    optionsHtml += states
      .map((s) => `<option value="${escapeHtml(s)}"${s === current ? " selected" : ""}>${escapeHtml(s)} (${counts[s]})</option>`)
      .join("");
    if (counts[FEDERAL_OTHER]) {
      optionsHtml += `<option value="${FEDERAL_OTHER}"${current === FEDERAL_OTHER ? " selected" : ""}>${FEDERAL_OTHER} (${counts[FEDERAL_OTHER]})</option>`;
    }
    stateFilterEl.innerHTML = optionsHtml;
    stateFilterEl.hidden = items.length === 0;
  }

  // -------------------------------------------------------------- card --
  function buildActions(tab, item) {
    const saved = isSaved(item.link);
    const itemPayload = escapeHtml(JSON.stringify({ ...item, _cat: tab }));
    const starBtn = `<button type="button" class="icon-btn star-btn${saved ? " is-saved" : ""}" data-item="${itemPayload}" aria-pressed="${saved}" title="${saved ? "Remove from Saved" : "Save for later"}">${saved ? "★" : "☆"} ${saved ? "Saved" : "Save"}</button>`;
    let citeBtn = "";
    if (tab === "research" || tab === "courts") {
      citeBtn = `<button type="button" class="icon-btn cite-btn" data-citation="${escapeHtml(citationFor(tab, item))}" title="Copy a simplified citation">📋 Cite</button>`;
    }
    return `<div class="card-actions">${starBtn}${citeBtn}</div>`;
  }

  function cardFor(tab, item) {
    const actions = buildActions(tab, item);
    switch (tab) {
      case "news":
        return `<div class="card cat-news">
          <span class="tag">${escapeHtml(item.source || "News")}</span>
          <h3><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
          <p class="summary">${escapeHtml(item.summary)}</p>
          <span class="meta">${escapeHtml(item.published || "")}</span>
          ${actions}
        </div>`;
      case "research":
        return `<div class="card cat-research">
          <span class="tag">${escapeHtml(item.journal || "Journal")}</span>
          <h3><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
          <p class="summary">${escapeHtml(item.authors || "")}</p>
          <span class="meta">${escapeHtml(item.published || "")}</span>
          ${actions}
        </div>`;
      case "courts":
        return `<div class="card cat-courts">
          <span class="tag">${escapeHtml(item.court || "Court")}</span>
          <h3><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
          <p class="summary">${escapeHtml(item.snippet || "")}</p>
          <span class="meta">Filed: ${escapeHtml(item.date_filed || "unknown")}</span>
          ${actions}
        </div>`;
      case "policy":
        return `<div class="card cat-policy">
          <span class="tag">${escapeHtml(item.org || "Policy")}</span>
          <h3><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
          <p class="summary">${escapeHtml(item.description || "")}</p>
          ${actions}
        </div>`;
      case "books":
        return `<div class="card cat-books">
          ${item.thumbnail ? `<img class="thumb" src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy" />` : ""}
          <h3><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
          <p class="summary">${escapeHtml(item.authors || "")} — ${escapeHtml(item.published || "")}</p>
          <p class="summary">${escapeHtml(item.description || "")}</p>
          ${actions}
        </div>`;
      case "podcasts":
        return `<div class="card cat-podcasts">
          ${item.artwork ? `<img class="thumb" src="${escapeHtml(item.artwork)}" alt="" loading="lazy" />` : ""}
          <h3><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
          <p class="summary">${escapeHtml(item.artist || "")}</p>
          ${actions}
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

  function renderCrossCategoryList(items) {
    return items
      .map((it) => `<div class="latest-item cat-${it._cat}"><span class="latest-cat-label">${escapeHtml(CATEGORY_LABELS[it._cat] || it._cat)}</span>${cardFor(it._cat, it)}</div>`)
      .join("");
  }

  function render() {
    const tab = state.activeTab;
    const q = state.query.toLowerCase();
    updateStateFilterUI(tab);

    if (tab === "latest") {
      const items = buildLatest().filter((it) => itemMatches(it, q));
      panel.innerHTML = items.length
        ? renderCrossCategoryList(items)
        : `<div class="empty-state">Nothing yet — check back after the next scheduled update, or browse a category tab.</div>`;
      quickLinksEl.innerHTML = "";
      statusText.textContent = state.lastRun
        ? `Live briefing across all categories · last updated ${timeAgo(state.lastRun)}`
        : "Live briefing across all categories";
      return;
    }

    if (tab === "saved") {
      const items = state.saved.filter((it) => itemMatches(it, q));
      panel.innerHTML = items.length
        ? renderCrossCategoryList(items)
        : `<div class="empty-state">No saved items yet — click "☆ Save" on any card to add it here. Saved items are stored in this browser only.</div>`;
      quickLinksEl.innerHTML = "";
      statusText.textContent = `${state.saved.length} saved item${state.saved.length === 1 ? "" : "s"} · stored in this browser`;
      return;
    }

    const bucket = state.data[tab] || { items: [] };
    let items = bucket.items || [];
    if (tab === "courts" && state.courtStateFilter) {
      items = items.filter((it) => stateForCourt(it.court) === state.courtStateFilter);
    }
    items = items.filter((it) => itemMatches(it, q));

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
      statusText.textContent = `Curated list · last reviewed ${bucket.last_reviewed || "unknown"} · ${(bucket.items || []).length} entries`;
    } else if (bucket.generated_at) {
      const errCount = (bucket.errors || []).length;
      statusText.textContent = `Updated ${timeAgo(bucket.generated_at)} · ${bucket.count ?? items.length} items` +
        (errCount ? ` · ${errCount} source ${errCount === 1 ? "query" : "queries"} failed` : "");
    } else if (bucket.error) {
      statusText.textContent = "Failed to load.";
    } else {
      statusText.textContent = "Not generated yet.";
    }
  }

  function updateTabCounts() {
    document.querySelectorAll(".count[data-count-for]").forEach((el) => {
      const key = el.dataset.countFor;
      let n;
      if (key === "latest") n = buildLatest().length;
      else if (key === "saved") n = state.saved.length;
      else n = ((state.data[key] && state.data[key].items) || []).length;
      el.textContent = n ? String(n) : "";
    });
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

  function initPanelActions() {
    panel.addEventListener("click", (e) => {
      const starBtn = e.target.closest(".star-btn");
      if (starBtn) {
        try {
          toggleSaved(JSON.parse(starBtn.dataset.item));
        } catch (err) {
          // ignore malformed payload
        }
        return;
      }
      const citeBtn = e.target.closest(".cite-btn");
      if (citeBtn) {
        const text = citeBtn.dataset.citation || "";
        navigator.clipboard
          .writeText(text)
          .then(() => showToast("Citation copied"))
          .catch(() => showToast("Couldn't copy — select and copy manually"));
      }
    });
  }

  function initStateFilter() {
    stateFilterEl.addEventListener("change", () => {
      state.courtStateFilter = stateFilterEl.value;
      render();
    });
  }

  async function checkForUpdates() {
    try {
      const meta = await fetchJson("data/meta.json");
      if (meta.last_run && meta.last_run !== state.lastRun) {
        await loadAll();
        updateTabCounts();
        render();
        showToast("New content just landed");
      }
    } catch (e) {
      // silent -- this is a background best-effort check
    }
  }

  function initLiveRefresh() {
    setInterval(checkForUpdates, REFRESH_CHECK_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkForUpdates();
    });
  }

  function init() {
    initTheme();
    loadSaved();
    initPanelActions();
    initStateFilter();
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => selectTab(btn.dataset.tab));
    });
    searchInput.addEventListener("input", (e) => {
      state.query = e.target.value;
      render();
    });

    loadAll().then(() => {
      document.getElementById("loading-state")?.remove();
      updateTabCounts();
      render();
      initLiveRefresh();
    });
  }

  init();
})();
