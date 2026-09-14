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

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- theme ---------- */

const SUN = `<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>`;
const MOON = `<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"></path>`;

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  store.set("wldd:theme", theme);
  const icon = document.getElementById("themeIcon");
  if (icon) icon.innerHTML = theme === "dark" ? SUN : MOON;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#07080d" : "#eef0f4");
}

function toggleTheme() {
  const now = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(now);
}

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
  const parts = String(iso).split("-");
  if (parts.length >= 3) return `${parts[1]}.${parts[2]}`;
  // a few older entries only carry a month or a year — show that, not a broken date
  if (parts.length === 2) return `${parts[1]}.${String(parts[0]).slice(2)}`;
  return parts[0];
}

// week_end is exclusive, so the last day people actually read about is the day before
function weekRange(week) {
  const start = new Date(week.week_start + "T00:00:00Z");
  const end = new Date(week.week_end + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() - 1);
  const opts = { month: "short", day: "numeric", timeZone: "UTC" };
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
}

function weekLabel(week, idx) {
  return `${idx === 0 ? "This week — " : ""}${weekRange(week)}`;
}

function weekTotal(week) {
  return BUCKETS.reduce((n, b) => n + (week[b] || []).length, 0);
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

// shown only when a card is read — colour + label, so "read" is visible at a glance
const READ_FLAG = `<span class="read-flag"><svg width="8" height="8" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M1.5 6.5l3 3 6-7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>Read</span>`;

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
      <div class="card-tags">${READ_FLAG}${tags.join("")}${starBtn(id)}</div>
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
      <div class="card-tags">${READ_FLAG}${fresh ? `<span class="tag tag-fresh">New</span>` : ""}${starBtn(id)}</div>
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
    if (target === 0 || reduceMotion.matches) {
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

let wasComplete = false;

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

  const wrap = document.getElementById("progressWrap");
  const complete = ids.length > 0 && read === ids.length;
  wrap.classList.toggle("is-complete", complete);
  // celebrate only on the transition into "done", never on every re-render
  if (complete && !wasComplete) celebrate(wrap);
  wasComplete = complete;

  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.filter === activeFilter));
  document.querySelectorAll(".tile").forEach((t) => t.classList.toggle("active", t.dataset.bucket === activeBucket));
}

/* ---------- particle burst ---------- */

function burst(x, y, count) {
  if (reduceMotion.matches) return;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = "burst";
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = 26 + Math.random() * 30;
    p.style.left = x + "px";
    p.style.top = y + "px";
    p.style.setProperty("--bx", (Math.cos(angle) * dist).toFixed(1) + "px");
    p.style.setProperty("--by", (Math.sin(angle) * dist).toFixed(1) + "px");
    p.style.animationDelay = (i * 12) + "ms";
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 900 + i * 12);
  }
}

function burstFrom(el, count) {
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, count || 8);
}

function celebrate(wrap) {
  wrap.classList.add("just-completed");
  setTimeout(() => wrap.classList.remove("just-completed"), 950);
  const track = wrap.querySelector(".progress-track");
  if (track) {
    const r = track.getBoundingClientRect();
    burst(r.right - 4, r.top + r.height / 2, 14);
  }
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

// cardIn is `animation-fill-mode: both`, so its final keyframe (`transform: none`)
// keeps winning over the inline transform the tilt sets. Drop the animation once
// it has finished and the cursor tilt takes over cleanly.
document.getElementById("content").addEventListener("animationend", (e) => {
  if (e.animationName === "cardIn" && e.target.classList.contains("card")) {
    e.target.style.animation = "none";
  }
});

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
    else { starSet.add(id); starEl.classList.add("on"); starEl.textContent = "★"; burstFrom(starEl, 8); }
    persistStar();
    updateChrome();
    return;
  }

  // opening the source article counts as reading it
  if (e.target.closest("a")) {
    if (card) markRead(card.dataset.id, card);
    return;
  }

  if (!card) return;

  // a card with a "why" toggles its drawer; either way, engaging with a card
  // marks it read so the colour state reflects what you've actually looked at
  if (card.classList.contains("has-why")) {
    card.classList.toggle("is-open");
    if (card.classList.contains("is-open")) markRead(card.dataset.id, card);
  } else {
    markRead(card.dataset.id, card);
  }
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

/* ============================================================
   WEEK COMBOBOX
   A native <select> renders its popup with OS chrome that ignores
   our dark palette — grey-on-white and unreadable. This is the same
   control built from real elements so it obeys the theme, and it can
   carry per-week volume that a <select> never could.
   ============================================================ */

const combo = document.getElementById("weekCombo");
const comboBtn = document.getElementById("weekBtn");
const comboLabel = document.getElementById("weekBtnLabel");
const comboPanel = document.getElementById("weekPanel");
let comboCursor = 0;

function renderWeekPanel() {
  const max = Math.max(1, ...WEEKS.map(weekTotal));
  comboPanel.innerHTML = WEEKS.map((w, i) => {
    const n = weekTotal(w);
    const width = Math.max(4, Math.round((n / max) * 46));
    return `<button class="combo-opt" role="option" data-week="${i}" aria-selected="${i === activeWeekIndex}" tabindex="-1">
      <span>${esc(weekRange(w))}</span>
      <span class="combo-right">
        ${i === 0 ? `<span class="combo-now">NOW</span>` : ""}
        <span class="combo-vol" style="width:${width}px"></span>
        <span class="combo-count">${n}</span>
      </span>
    </button>`;
  }).join("");
  comboLabel.textContent = WEEKS[activeWeekIndex] ? weekLabel(WEEKS[activeWeekIndex], activeWeekIndex) : "—";
}

function moveComboCursor(delta) {
  const opts = [...comboPanel.querySelectorAll(".combo-opt")];
  if (!opts.length) return;
  opts.forEach((o) => o.classList.remove("cursor"));
  comboCursor = Math.max(0, Math.min(opts.length - 1, comboCursor + delta));
  opts[comboCursor].classList.add("cursor");
  opts[comboCursor].scrollIntoView({ block: "nearest" });
}

function openCombo() {
  comboPanel.hidden = false;
  combo.classList.add("open");
  comboBtn.setAttribute("aria-expanded", "true");
  comboCursor = activeWeekIndex;
  moveComboCursor(0);
}

function closeCombo() {
  comboPanel.hidden = true;
  combo.classList.remove("open");
  comboBtn.setAttribute("aria-expanded", "false");
}

function selectWeek(index) {
  activeWeekIndex = index;
  renderWeekPanel();
  renderPulse();
  wasComplete = false; // a different week is a different reading target
  render();
}

comboBtn.addEventListener("click", () => {
  if (comboPanel.hidden) openCombo(); else closeCombo();
});

comboPanel.addEventListener("click", (e) => {
  const opt = e.target.closest(".combo-opt");
  if (!opt) return;
  selectWeek(Number(opt.dataset.week));
  closeCombo();
  comboBtn.focus();
});

combo.addEventListener("keydown", (e) => {
  if (comboPanel.hidden) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); openCombo(); }
    return;
  }
  if (e.key === "ArrowDown") { e.preventDefault(); moveComboCursor(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); moveComboCursor(-1); }
  else if (e.key === "Home") { e.preventDefault(); comboCursor = 0; moveComboCursor(0); }
  else if (e.key === "End") { e.preventDefault(); comboCursor = WEEKS.length - 1; moveComboCursor(0); }
  else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectWeek(comboCursor); closeCombo(); }
  else if (e.key === "Escape") { e.preventDefault(); closeCombo(); comboBtn.focus(); }
});

document.addEventListener("click", (e) => {
  if (!comboPanel.hidden && !combo.contains(e.target)) closeCombo();
});

/* ============================================================
   COMMAND PALETTE (⌘K / Ctrl-K)
   Buckets, weeks and every headline in the archive in one index.
   ============================================================ */

const palette = document.getElementById("palette");
const paletteInput = document.getElementById("paletteInput");
const paletteResults = document.getElementById("paletteResults");
let paletteIndex = [];
let paletteHits = [];
let paletteCursor = 0;

function itemTitle(item, bucket) {
  if (bucket === "bucket4") return `${item.person} → ${item.new_company}`;
  return item.headline || item.ref_item || "";
}

function buildPaletteIndex() {
  paletteIndex = [];
  BUCKETS.forEach((b, i) => {
    paletteIndex.push({ kind: "tab", text: BUCKET_LONG[b], sub: `press ${i + 1}`, bucket: b });
  });
  WEEKS.forEach((w, i) => {
    paletteIndex.push({ kind: "week", text: weekRange(w), sub: `${weekTotal(w)} items`, weekIndex: i });
  });
  WEEKS.forEach((w, wi) => {
    BUCKETS.forEach((b) => {
      (w[b] || []).forEach((item) => {
        paletteIndex.push({
          kind: BUCKET_LABELS[b],
          text: itemTitle(item, b),
          sub: shortDate(item.date) || weekRange(w).split(" – ")[0],
          weekIndex: wi,
          bucket: b,
          id: itemId(item, b),
        });
      });
    });
  });
}

function renderPalette(q) {
  const query = q.trim().toLowerCase();
  paletteHits = query
    ? paletteIndex.filter((o) => (o.text + " " + o.kind).toLowerCase().includes(query)).slice(0, 40)
    : paletteIndex.filter((o) => o.kind === "tab" || o.kind === "week").slice(0, 14);
  paletteCursor = 0;

  paletteResults.innerHTML = paletteHits.length
    ? paletteHits.map((o, i) => `
        <button class="palette-opt ${i === 0 ? "cursor" : ""}" data-i="${i}">
          <span class="palette-kind">${esc(o.kind === "tab" ? "go" : o.kind === "week" ? "week" : o.kind)}</span>
          <span class="palette-txt">${esc(o.text)}</span>
          <span class="palette-sub">${esc(o.sub || "")}</span>
        </button>`).join("")
    : `<div class="palette-empty">Nothing matches “${esc(q)}”</div>`;
}

function movePaletteCursor(delta) {
  const opts = [...paletteResults.querySelectorAll(".palette-opt")];
  if (!opts.length) return;
  opts.forEach((o) => o.classList.remove("cursor"));
  paletteCursor = (paletteCursor + delta + opts.length) % opts.length;
  opts[paletteCursor].classList.add("cursor");
  opts[paletteCursor].scrollIntoView({ block: "nearest" });
}

function runPalette(hit) {
  if (!hit) return;
  closePalette();
  if (searchQuery) { searchQuery = ""; searchInput.value = ""; searchClear.hidden = true; document.getElementById("searchSlash").style.display = ""; }

  if (hit.kind === "tab") { activeBucket = hit.bucket; render(); return; }
  if (hit.kind === "week") { selectWeek(hit.weekIndex); return; }

  // a picked headline may live in another week, another bucket, or behind a
  // filter — clear all three so the card is guaranteed to be on screen
  activeBucket = hit.bucket;
  activeFilter = "all";
  activeWeekIndex = hit.weekIndex;
  wasComplete = false;
  renderWeekPanel();
  renderPulse();
  render();

  // land the eye on the exact card that was picked
  const el = [...document.querySelectorAll("#content .card")].find((c) => c.dataset.id === hit.id);
  if (el) {
    el.scrollIntoView({ block: "center", behavior: reduceMotion.matches ? "auto" : "smooth" });
    el.classList.add("is-cursor");
    cursor = [...document.querySelectorAll("#content .card")].indexOf(el);
  }
}

function openPalette() {
  palette.hidden = false;
  paletteInput.value = "";
  renderPalette("");
  paletteInput.focus();
}

function closePalette() { palette.hidden = true; }

document.getElementById("paletteBtn").addEventListener("click", openPalette);
paletteInput.addEventListener("input", (e) => renderPalette(e.target.value));
paletteResults.addEventListener("click", (e) => {
  const opt = e.target.closest(".palette-opt");
  if (opt) runPalette(paletteHits[Number(opt.dataset.i)]);
});
palette.addEventListener("click", (e) => { if (e.target === palette) closePalette(); });

paletteInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); movePaletteCursor(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); movePaletteCursor(-1); }
  else if (e.key === "Enter") { e.preventDefault(); runPalette(paletteHits[paletteCursor]); }
  else if (e.key === "Escape") { e.preventDefault(); closePalette(); }
});

/* ---------- keyboard ---------- */

const overlay = document.getElementById("shortcutsOverlay");
document.getElementById("shortcutsBtn").addEventListener("click", () => { overlay.hidden = !overlay.hidden; });
overlay.addEventListener("click", () => { overlay.hidden = true; });
document.getElementById("themeToggle").addEventListener("click", toggleTheme);

/* ---------- cursor glow + 3D tilt ---------- */
// One rAF-throttled listener for the whole page. Cards tilt toward the cursor,
// a specular highlight tracks it, and a soft accent glow follows the pointer —
// which together is what sells the depth.

const glow = document.getElementById("cursorGlow");
let tiltFrame = null;
let tiltTarget = null;
let tiltEvent = null;

function applyTilt() {
  tiltFrame = null;
  if (!tiltEvent) return;

  if (glow) {
    glow.style.transform = `translate3d(${tiltEvent.clientX}px, ${tiltEvent.clientY}px, 0)`;
    glow.classList.add("on");
  }

  if (!tiltTarget) return;
  const r = tiltTarget.getBoundingClientRect();
  const px = (tiltEvent.clientX - r.left) / r.width;
  const py = (tiltEvent.clientY - r.top) / r.height;
  const max = 5;
  tiltTarget.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
  tiltTarget.style.setProperty("--my", (py * 100).toFixed(1) + "%");
  tiltTarget.style.transform =
    `perspective(1100px) rotateX(${((0.5 - py) * max).toFixed(2)}deg) rotateY(${((px - 0.5) * max).toFixed(2)}deg) translateY(-3px)`;
}

function clearTilt(el) {
  if (!el) return;
  el.style.transform = "";
  el.style.removeProperty("--mx");
  el.style.removeProperty("--my");
}

document.addEventListener("mousemove", (e) => {
  if (reduceMotion.matches) return;
  const card = e.target.closest("#content .card, .tile");
  if (card !== tiltTarget) { clearTilt(tiltTarget); tiltTarget = card; }
  tiltEvent = e;
  if (!tiltFrame) tiltFrame = requestAnimationFrame(applyTilt);
}, { passive: true });

document.addEventListener("mouseleave", () => {
  clearTilt(tiltTarget);
  tiltTarget = null;
  if (glow) glow.classList.remove("on");
}, true);

/* ---------- scroll parallax on the ambient field ---------- */

const aurora = document.querySelector(".aurora");
let parFrame = null;
window.addEventListener("scroll", () => {
  if (reduceMotion.matches || parFrame) return;
  parFrame = requestAnimationFrame(() => {
    parFrame = null;
    aurora.style.setProperty("--par", (-window.scrollY * 0.14).toFixed(1) + "px");
  });
}, { passive: true });

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
  // ⌘K / Ctrl-K works from anywhere, including inside the search field
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if (palette.hidden) openPalette(); else closePalette();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!palette.hidden) return; // the palette owns its own keys

  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);

  if (e.key === "Escape") {
    if (!overlay.hidden) { overlay.hidden = true; return; }
    if (!comboPanel.hidden) { closeCombo(); return; }
    if (typing) { document.activeElement.blur(); return; }
    if (searchQuery) { searchClear.click(); return; }
    cards().forEach((c) => c.classList.remove("is-cursor"));
    cursor = -1;
    return;
  }

  if (typing || !comboPanel.hidden) return;

  if (e.key === "/") { e.preventDefault(); searchInput.focus(); return; }
  if (e.key === "?") { overlay.hidden = !overlay.hidden; return; }
  if (e.key === "t") { toggleTheme(); return; }
  if (e.key === "w") { e.preventDefault(); openCombo(); comboBtn.focus(); return; }

  if (e.key >= "1" && e.key <= "5") {
    activeBucket = BUCKETS[Number(e.key) - 1];
    if (searchQuery) searchClear.click(); else render();
    return;
  }

  if (e.key === "j") { e.preventDefault(); moveCursor(1); return; }
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

/* ============================================================
   BOOT
   The curtain tracks the real fetch. The only added time is a short
   floor so the sequence doesn't flash out of existence on a warm cache.
   ============================================================ */

const boot = document.getElementById("boot");
const bootBar = document.getElementById("bootBar");
const bootStatus = document.getElementById("bootStatus");
const BOOT_FLOOR = 1080;
const bootStart = performance.now();

const BOOT_STEPS = [
  [0, "establishing signal", 14],
  [300, "pulling the week", 44],
  [620, "resolving entities", 72],
  [880, "ranking the pulse", 90],
];
const bootTimers = BOOT_STEPS.map(([at, msg, pct]) =>
  setTimeout(() => { bootStatus.textContent = msg; bootBar.style.width = pct + "%"; }, at)
);

function finishBoot(status) {
  // the staged copy is allowed to play out to the floor; past it, the curtain
  // lifts the moment the data is in hand
  const wait = Math.max(0, BOOT_FLOOR - (performance.now() - bootStart));
  setTimeout(() => {
    bootTimers.forEach(clearTimeout);
    bootStatus.textContent = status || "live";
    bootBar.style.width = "100%";
    setTimeout(() => boot.classList.add("done"), 300);
  }, wait);
}

function showSkeletons(n) {
  document.getElementById("content").innerHTML =
    `<div class="grid">${Array.from({ length: n }, () => `
      <div class="skeleton">
        <div class="sk-line w80"></div>
        <div class="sk-line w60"></div>
        <div class="sk-line w40"></div>
      </div>`).join("")}</div>`;
}

applyTheme(store.get("wldd:theme", "dark"));
showSkeletons(6);

fetch("/data.json")
  .then((r) => r.json())
  .then((data) => {
    WEEKS = data.weeks || [];

    // land on the most recently *updated* week, tie-broken by volume, so a
    // single stray item in a brand-new week can't hijack the landing view
    let best = -1, bestStamp = "", bestCount = -1;
    WEEKS.forEach((w, i) => {
      const c = weekTotal(w);
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

    renderWeekPanel();
    buildPaletteIndex();
    renderPulse();
    render();
    finishBoot();
  })
  .catch(() => {
    document.getElementById("content").innerHTML = `<div class="empty-state">Could not load data.json</div>`;
    finishBoot("signal lost");
  });
