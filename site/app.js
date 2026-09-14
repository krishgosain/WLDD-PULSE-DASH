/* ============================================================
   WLDD PULSE DASH
   Bucket 1/2/3 are headline-led: the headline (linked to the source)
   carries the item, company/person links live in the footer, and the
   "why it matters" is collapsed behind an optional expand.
   People Moves (b4) and Strategic Insights (b5) keep their own
   structure untouched.
   ============================================================ */

const BUCKETS = ["bucket1", "bucket2", "bucket3", "bucket4", "bucket5"];

const BUCKET_LABELS = {
  bucket1: "Mandates & Campaigns",
  bucket2: "M&A",
  bucket3: "New Products",
  bucket4: "People Moves",
  bucket5: "Strategic Insights",
};

const BUCKET_LONG = {
  bucket1: "Ad Mandates, Campaigns & Marketing Stunts",
  bucket2: "M&A",
  bucket3: "New Products & Brand Launches",
  bucket4: "People Moves",
  bucket5: "Strategic Insights",
};

let WEEKS = [];
let activeBucket = "bucket1";
let activeWeekIndex = 0;
let searchQuery = "";
let activeFilter = "all";
let cursor = -1;

/* ---------- persisted state (per browser) ---------- */

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      /* private mode / blocked storage — state just won't persist */
    }
  },
};

let readSet = new Set(store.get("wldd:read", []));
let starSet = new Set(store.get("wldd:star", []));
const lastVisit = store.get("wldd:lastVisit", null);
store.set("wldd:lastVisit", new Date().toISOString());

function persistRead() { store.set("wldd:read", [...readSet]); }
function persistStar() { store.set("wldd:star", [...starSet]); }

/* ---------- helpers ---------- */

function itemId(item, bucket) {
  if (bucket === "bucket4") return `${item.person}|${item.new_company}|${item.date}`;
  if (bucket === "bucket5") return `b5|${item.ref_item}|${item.product_fit}`;
  return item.source_url || `${bucket}|${item.headline}`;
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function shortDate(iso) {
  if (!iso) return "";
  const parts = iso.split("-");
  return parts.length >= 3 ? `${parts[1]}.${parts[2]}` : iso;
}

function weekLabel(week, idx) {
  const start = fmtDate(week.week_start);
  const end = new Date(week.week_end + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() - 1);
  const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${idx === 0 ? "This week — " : ""}${start} – ${endStr}`;
}

function isFresh(week) {
  // "new since you last opened the dashboard" — genuine freshness, not a badge for its own sake
  if (!lastVisit || !week.updated_at) return false;
  return new Date(week.updated_at) > new Date(lastVisit);
}

function linkOrText(name, url) {
  if (url) return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a>`;
  return esc(name);
}

function entitiesHtml(item) {
  const parts = [
    ...(item.companies || []).map((c) => linkOrText(c.name, c.url)),
    ...(item.people || []).map((p) => linkOrText(p.name, p.linkedin_url)),
  ];
  return parts.join(", ");
}

function currentWeek() {
  return WEEKS[activeWeekIndex] || { bucket1: [], bucket2: [], bucket3: [], bucket4: [], bucket5: [], flagged: {} };
}

function bucketItems(bucket) {
  return currentWeek()[bucket] || [];
}

function passesFilter(item, bucket) {
  const id = itemId(item, bucket);
  if (activeFilter === "unread") return !readSet.has(id);
  if (activeFilter === "starred") return starSet.has(id);
  return true;
}

/* ---------- card renderers ---------- */

const CHEV = `<svg width="9" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function starBtn(id) {
  const on = starSet.has(id);
  return `<button class="star ${on ? "on" : ""}" data-star="${esc(id)}" title="${on ? "Starred" : "Star this"}" aria-label="${on ? "Unstar" : "Star"}">${on ? "★" : "☆"}</button>`;
}

// Bucket 1/2/3 — headline-led. No paragraph in the default state.
function renderCard(item, bucket, fresh) {
  const id = itemId(item, bucket);
  const tags = [];
  if (fresh) tags.push(`<span class="tag tag-fresh">New</span>`);
  if (bucket === "bucket2" && item.region) {
    tags.push(`<span class="tag ${item.region.toLowerCase().includes("global") ? "region-global" : ""}">${esc(item.region)}</span>`);
  }

  const why = item.why_important || item.description;
  const drawer = why
    ? `<button class="expand" data-expand="${esc(id)}" title="Why it matters" aria-label="Why it matters">${CHEV}</button>
       <div class="drawer"><div class="drawer-inner"><div class="why"><b>Why it matters</b>${esc(why)}</div></div></div>`
    : "";

  const ents = entitiesHtml(item);

  return `
  <article class="card ${why ? "has-why" : ""} ${readSet.has(id) ? "is-read" : ""}" data-id="${esc(id)}" data-url="${esc(item.source_url || "")}">
    <div class="card-head">
      <div class="card-headline"><a href="${esc(item.source_url)}" target="_blank" rel="noopener">${esc(item.headline)}</a></div>
      <div class="card-tags">${tags.join("")}${starBtn(id)}</div>
    </div>
    <div class="card-foot">
      <span class="entities">${ents}</span>
      <span class="meta">${esc(item.source_name || "")}<br>${shortDate(item.date)}</span>
    </div>
    ${drawer}
  </article>`;
}

// Bucket 4 — unchanged in structure: person joins company as role, plus previous role.
function renderPeopleCard(item, fresh) {
  const id = itemId(item, "bucket4");
  const person = linkOrText(item.person, item.linkedin_url);
  const company = linkOrText(item.new_company, item.company_url);
  return `
  <article class="card people-card ${readSet.has(id) ? "is-read" : ""}" data-id="${esc(id)}" data-url="${esc(item.source_url || "")}">
    <div class="card-head">
      <div class="move">${person} joins <b>${company}</b> as ${esc(item.new_role_title || "")}</div>
      <div class="card-tags">${fresh ? `<span class="tag tag-fresh">New</span>` : ""}${starBtn(id)}</div>
    </div>
    <div class="prev">Previously: ${esc(item.previous_role || "—")}</div>
    <div class="card-foot">
      <span class="entities"></span>
      <span class="meta"><a href="${esc(item.source_url)}" target="_blank" rel="noopener">${esc(item.source_name || "source")}</a><br>${shortDate(item.date)}</span>
    </div>
  </article>`;
}

// Bucket 5 — unchanged in structure: product fit, headline, full insight, reference.
function renderStrategicCard(item) {
  const id = itemId(item, "bucket5");
  return `
  <article class="card strategic-card" data-id="${esc(id)}" data-url="${esc(item.source_url || "")}">
    <div class="fit">${esc(item.product_fit || "WLDD")}</div>
    <div class="card-headline">${esc(item.headline)}</div>
    <div class="insight">${esc(item.insight)}</div>
    <div class="ref">Ref: ${esc(item.ref_bucket_label || "")} — <a href="${esc(item.source_url)}" target="_blank" rel="noopener">${esc(item.ref_item || "source")}</a></div>
  </article>`;
}

function renderFlagged(list, label) {
  if (!list || !list.length) return "";
  return `<details class="flagged"><summary>${label} (${list.length})</summary><ul>${list
    .map((f) => `<li>${esc(f)}</li>`)
    .join("")}</ul></details>`;
}

/* ---------- pulse tiles ---------- */

function weekTotals(bucket) {
  // last 8 weeks, oldest → newest, for the sparkline
  const slice = WEEKS.slice(0, 8).reverse();
  return slice.map((w) => (w[bucket] || []).length);
}

function renderPulse() {
  const wrap = document.getElementById("pulse");
  wrap.innerHTML = BUCKETS.map((b, i) => {
    const count = bucketItems(b).length;
    const series = weekTotals(b);
    const max = Math.max(1, ...series);
    const bars = series
      .map((v, idx) => {
        const h = Math.max(2, Math.round((v / max) * 26));
        const isCurrent = idx === series.length - 1 - activeWeekIndex;
        return `<span class="spark-bar ${isCurrent ? "is-current" : ""}" style="height:${h}px" title="${v} items"></span>`;
      })
      .join("");
    return `
      <button class="tile ${b === activeBucket ? "active" : ""}" data-bucket="${b}" title="${esc(BUCKET_LONG[b])} — press ${i + 1}">
        <div class="tile-label">${esc(BUCKET_LABELS[b])}</div>
        <div class="tile-row">
          <span class="tile-count ${count === 0 ? "is-zero" : ""}" data-target="${count}">0</span>
          <span class="spark">${bars}</span>
        </div>
      </button>`;
  }).join("");

  animateCounts();
}

function animateCounts() {
  document.querySelectorAll(".tile-count").forEach((el) => {
    const target = Number(el.dataset.target) || 0;
    if (target === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = String(target);
      return;
    }
    const dur = 460;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/* ---------- progress + filters ---------- */

function updateChrome() {
  const items = bucketItems(activeBucket);
  const ids = items.map((i) => itemId(i, activeBucket));
  const read = ids.filter((id) => readSet.has(id)).length;
  const starred = ids.filter((id) => starSet.has(id)).length;
  const unread = ids.length - read;

  document.getElementById("cntUnread").textContent = unread ? ` ${unread}` : "";
  document.getElementById("cntStarred").textContent = starred ? ` ${starred}` : "";

  const pct = ids.length ? Math.round((read / ids.length) * 100) : 0;
  document.getElementById("progressFill").style.width = pct + "%";
  document.getElementById("progressLabel").textContent = `${read} / ${ids.length} read`;
  document.getElementById("progressWrap").classList.toggle("is-complete", ids.length > 0 && read === ids.length);

  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.filter === activeFilter));
  document.querySelectorAll(".tile").forEach((t) => t.classList.toggle("active", t.dataset.bucket === activeBucket));
}

/* ---------- main render ---------- */

function renderBucket(bucket) {
  const content = document.getElementById("content");
  const week = currentWeek();
  const fresh = isFresh(week);
  const all = bucketItems(bucket);
  const items = all.filter((i) => passesFilter(i, bucket));

  const emptyMsg = all.length === 0
    ? "Nothing filed for this week yet."
    : activeFilter === "unread" ? "All caught up — nothing unread here."
    : activeFilter === "starred" ? "No starred items in this bucket."
    : "Nothing here.";

  if (bucket === "bucket2") {
    // Only a region of exactly "India" is India-focused. Values like
    // "Global (India / Italy)" are cross-border deals and belong under Global —
    // a substring match on "india" would misfile them.
    const isIndia = (i) => (i.region || "").trim().toLowerCase() === "india";
    const india = items.filter(isIndia);
    const global = items.filter((i) => !isIndia(i));
    content.innerHTML = `
      <div class="section-title">India</div>
      <div class="grid">${india.map((i) => renderCard(i, bucket, fresh)).join("") || `<div class="empty-state">No India deals${activeFilter === "all" ? " this week" : " match this filter"}.</div>`}</div>
      <div class="section-title">Global</div>
      <div class="grid">${global.map((i) => renderCard(i, bucket, fresh)).join("") || `<div class="empty-state">No global deals${activeFilter === "all" ? " this week" : " match this filter"}.</div>`}</div>
      ${renderFlagged(week.flagged && week.flagged.bucket2, "Unresolved names")}`;
  } else if (bucket === "bucket4") {
    content.innerHTML = `
      <div class="grid">${items.map((i) => renderPeopleCard(i, fresh)).join("") || `<div class="empty-state">${emptyMsg}</div>`}</div>
      ${renderFlagged(week.flagged && week.flagged.bucket4, "Unresolved names")}`;
  } else if (bucket === "bucket5") {
    content.innerHTML = `
      <div class="grid">${items.map(renderStrategicCard).join("") || `<div class="empty-state">${emptyMsg}</div>`}</div>`;
  } else {
    content.innerHTML = `
      <div class="grid">${items.map((i) => renderCard(i, bucket, fresh)).join("") || `<div class="empty-state">${emptyMsg}</div>`}</div>
      ${renderFlagged(week.flagged && week.flagged[bucket], "Unresolved names")}`;
  }

  // stagger the entrance so the grid assembles rather than snapping in
  const cards = content.querySelectorAll(".card");
  cards.forEach((c, i) => { c.style.animationDelay = Math.min(i * 22, 340) + "ms"; });
}

/* ---------- search ---------- */

function matchText(item, q) {
  return [
    item.headline, item.description, item.why_important, item.person, item.new_company,
    item.previous_role, item.new_role_title, item.insight, item.ref_item, item.product_fit,
    ...(item.companies || []).map((c) => c.name),
    ...(item.people || []).map((p) => p.name),
  ].filter(Boolean).join(" ␟").toLowerCase().includes(q);
}

function renderSearch(query) {
  const content = document.getElementById("content");
  const q = query.trim().toLowerCase();
  const results = [];

  WEEKS.forEach((week) => {
    BUCKETS.forEach((b) => {
      (week[b] || []).forEach((item) => {
        if (matchText(item, q)) results.push({ item, bucket: b, week });
      });
    });
  });

  if (!results.length) {
    content.innerHTML = `<div class="empty-state">No results for “${esc(query)}”</div>`;
    return;
  }

  const cards = results.map(({ item, bucket, week }) => {
    const card =
      bucket === "bucket4" ? renderPeopleCard(item, false)
      : bucket === "bucket5" ? renderStrategicCard(item)
      : renderCard(item, bucket, false);
    return `<div class="search-result">
      <div class="search-meta">${esc(BUCKET_LABELS[bucket])} · week of ${fmtDate(week.week_start)}</div>
      ${card}
    </div>`;
  }).join("");

  content.innerHTML =
    `<div class="section-title">${results.length} result${results.length === 1 ? "" : "s"} for “${esc(query)}”</div>
     <div class="grid">${cards}</div>`;
}

function render() {
  cursor = -1;
  if (searchQuery.trim()) {
    renderSearch(searchQuery);
  } else {
    renderBucket(activeBucket);
  }
  updateChrome();

  const content = document.getElementById("content");
  content.classList.remove("content-in");
  void content.offsetWidth;
  content.classList.add("content-in");
}

/* ---------- interactions ---------- */

function markRead(id, el) {
  if (readSet.has(id)) return;
  readSet.add(id);
  persistRead();
  if (el) el.classList.add("is-read");
  updateChrome();
}

document.getElementById("pulse").addEventListener("click", (e) => {
  const tile = e.target.closest(".tile");
  if (!tile) return;
  activeBucket = tile.dataset.bucket;
  if (searchQuery) { searchQuery = ""; document.getElementById("searchInput").value = ""; document.getElementById("searchClear").hidden = true; }
  render();
});

document.querySelector(".filterbar").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  activeFilter = chip.dataset.filter;
  render();
});

document.getElementById("content").addEventListener("click", (e) => {
  const card = e.target.closest(".card");

  const starEl = e.target.closest("[data-star]");
  if (starEl) {
    e.preventDefault();
    const id = starEl.dataset.star;
    if (starSet.has(id)) { starSet.delete(id); starEl.classList.remove("on"); starEl.textContent = "☆"; }
    else { starSet.add(id); starEl.classList.add("on"); starEl.textContent = "★"; }
    persistStar();
    updateChrome();
    return;
  }

  // opening the source article counts as reading it
  if (e.target.closest("a")) {
    if (card) markRead(card.dataset.id, card);
    return;
  }

  // anywhere else on a card with a "why" toggles the drawer
  if (card && card.classList.contains("has-why")) {
    card.classList.toggle("is-open");
    if (card.classList.contains("is-open")) markRead(card.dataset.id, card);
  }
});

document.getElementById("weekSelect").addEventListener("change", (e) => {
  activeWeekIndex = Number(e.target.value);
  renderPulse();
  render();
});

const searchInput = document.getElementById("searchInput");
const searchClear = document.getElementById("searchClear");

searchInput.addEventListener("input", (e) => {
  searchQuery = e.target.value;
  searchClear.hidden = !searchQuery;
  document.getElementById("searchSlash").style.display = searchQuery ? "none" : "";
  render();
});

searchClear.addEventListener("click", () => {
  searchQuery = "";
  searchInput.value = "";
  searchClear.hidden = true;
  document.getElementById("searchSlash").style.display = "";
  render();
});

/* ---------- keyboard ---------- */

const overlay = document.getElementById("shortcutsOverlay");
document.getElementById("shortcutsBtn").addEventListener("click", () => { overlay.hidden = !overlay.hidden; });
overlay.addEventListener("click", () => { overlay.hidden = true; });

function cards() { return [...document.querySelectorAll("#content .card")]; }

function moveCursor(delta) {
  const list = cards();
  if (!list.length) return;
  list.forEach((c) => c.classList.remove("is-cursor"));
  cursor = Math.max(0, Math.min(list.length - 1, cursor + delta));
  const el = list[cursor];
  el.classList.add("is-cursor");
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function cursorCard() { return cards()[cursor] || null; }

document.addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);

  if (e.key === "Escape") {
    if (!overlay.hidden) { overlay.hidden = true; return; }
    if (typing) { document.activeElement.blur(); return; }
    if (searchQuery) { searchClear.click(); return; }
    cards().forEach((c) => c.classList.remove("is-cursor"));
    cursor = -1;
    return;
  }

  if (typing) return;

  if (e.key === "/") { e.preventDefault(); searchInput.focus(); return; }
  if (e.key === "?") { overlay.hidden = !overlay.hidden; return; }

  if (e.key >= "1" && e.key <= "5") {
    activeBucket = BUCKETS[Number(e.key) - 1];
    if (searchQuery) searchClear.click(); else render();
    return;
  }

  if (e.key === "j") { e.preventDefault(); moveCursor(cursor === -1 ? 1 : 1); return; }
  if (e.key === "k") { e.preventDefault(); moveCursor(-1); return; }

  const el = cursorCard();
  if (!el) return;

  if (e.key === "e") {
    e.preventDefault();
    const btn = el.querySelector("[data-expand]");
    if (btn) { el.classList.toggle("is-open"); if (el.classList.contains("is-open")) markRead(el.dataset.id, el); }
    return;
  }
  if (e.key === "o" || e.key === "Enter") {
    e.preventDefault();
    if (el.dataset.url) { window.open(el.dataset.url, "_blank", "noopener"); markRead(el.dataset.id, el); }
    return;
  }
  if (e.key === "s") {
    e.preventDefault();
    const btn = el.querySelector("[data-star]");
    if (btn) btn.click();
  }
});

/* ---------- boot ---------- */

function populateWeekSelect() {
  const sel = document.getElementById("weekSelect");
  sel.innerHTML = WEEKS.map((w, i) => `<option value="${i}">${esc(weekLabel(w, i))}</option>`).join("");
  sel.value = String(activeWeekIndex);
}

fetch("/data.json")
  .then((r) => r.json())
  .then((data) => {
    WEEKS = data.weeks || [];

    // land on the most recently *updated* week, tie-broken by volume, so a
    // single stray item in a brand-new week can't hijack the landing view
    const total = (w) => BUCKETS.reduce((n, b) => n + (w[b] || []).length, 0);
    let best = -1, bestStamp = "", bestCount = -1;
    WEEKS.forEach((w, i) => {
      const c = total(w);
      if (!c) return;
      const stamp = w.updated_at || "";
      if (best === -1 || stamp > bestStamp || (stamp === bestStamp && c > bestCount)) {
        best = i; bestStamp = stamp; bestCount = c;
      }
    });
    if (best >= 0) activeWeekIndex = best;

    if (data.updated_at) {
      const d = new Date(data.updated_at);
      document.getElementById("lastUpdated").textContent =
        "Updated " + d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    }

    populateWeekSelect();
    renderPulse();
    render();
  })
  .catch(() => {
    document.getElementById("content").innerHTML = `<div class="empty-state">Could not load data.json</div>`;
  });
