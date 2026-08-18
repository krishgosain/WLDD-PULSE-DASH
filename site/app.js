const BUCKET_LABELS = {
  bucket1: "Ad Mandates, Campaigns & Marketing Stunts",
  bucket2: "M&A",
  bucket3: "New Products & Brand Launches",
  bucket4: "People Moves",
  bucket5: "Strategic Insights",
};

let WEEKS = [];
let updatedAt = null;
let activeBucket = "bucket1";
let activeWeekIndex = 0;
let searchQuery = "";

function isNew(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const days = (Date.now() - d.getTime()) / 86400000;
  return days <= 7;
}

function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function weekLabel(week, idx) {
  const start = fmtDate(week.week_start);
  const endDisplay = new Date(week.week_end + "T00:00:00Z");
  endDisplay.setUTCDate(endDisplay.getUTCDate() - 1);
  const end = endDisplay.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const prefix = idx === 0 ? "This week — " : "";
  return `${prefix}${start} – ${end}`;
}

function linkOrText(name, url) {
  if (url) return `<a href="${url}" target="_blank" rel="noopener">${name}</a>`;
  return name;
}

function companiesHtml(item) {
  if (!item.companies) return "";
  return item.companies.map((c) => linkOrText(c.name, c.url)).join(", ");
}

function peopleHtml(item) {
  if (!item.people) return "";
  return item.people.map((p) => linkOrText(p.name, p.linkedin_url)).join(", ");
}

function renderCard(item, bucket) {
  const newTag = isNew(item.date) ? `<span class="tag">NEW</span>` : "";
  const regionTag =
    bucket === "bucket2" && item.region
      ? `<span class="tag ${item.region === "Global" ? "region-global" : ""}">${item.region}</span>`
      : "";
  const why = item.why_important
    ? `<div class="card-why"><b>Why it matters —</b> ${item.why_important}</div>`
    : "";
  const companies = companiesHtml(item);
  const people = peopleHtml(item);
  const entities = [companies, people].filter(Boolean).join(" &middot; ");

  return `
  <article class="card">
    <div class="card-top">
      <div class="card-headline"><a href="${item.source_url}" target="_blank" rel="noopener">${item.headline}</a></div>
      ${newTag}${regionTag}
    </div>
    <div class="card-desc">${item.description || ""}</div>
    ${why}
    <div class="card-foot">
      <span>${entities}</span>
      <span>${item.source_name || ""} · ${item.date || ""}</span>
    </div>
  </article>`;
}

function renderPeopleCard(item) {
  const personLink = linkOrText(item.person, item.linkedin_url);
  const companyLink = linkOrText(item.new_company, item.company_url);
  const newTag = isNew(item.date) ? `<span class="tag">NEW</span>` : "";
  return `
  <article class="card people-card">
    <div class="card-top">
      <div class="move">${personLink} joins <b>${companyLink}</b> as ${item.new_role_title || ""}</div>
      ${newTag}
    </div>
    <div class="card-desc">Previously: ${item.previous_role || "—"}</div>
    <div class="card-foot">
      <span></span>
      <span><a href="${item.source_url}" target="_blank" rel="noopener">${item.source_name || "source"}</a> · ${item.date || ""}</span>
    </div>
  </article>`;
}

function renderStrategicCard(item) {
  return `
  <article class="card strategic-card">
    <div class="fit">${item.product_fit || "WLDD"}</div>
    <div class="card-headline">${item.headline}</div>
    <div class="card-desc">${item.insight}</div>
    <div class="ref">Ref: ${item.ref_bucket_label || ""} — <a href="${item.source_url}" target="_blank" rel="noopener">${item.ref_item || "source"}</a></div>
  </article>`;
}

function renderFlagged(list, label) {
  if (!list || !list.length) return "";
  return `<details class="flagged"><summary>${label} (${list.length})</summary><ul>${list
    .map((f) => `<li>${f}</li>`)
    .join("")}</ul></details>`;
}

function currentWeek() {
  return WEEKS[activeWeekIndex] || { bucket1: [], bucket2: [], bucket3: [], bucket4: [], bucket5: [], flagged: {} };
}

function renderBucket(bucket) {
  const content = document.getElementById("content");
  const week = currentWeek();
  const items = week[bucket] || [];

  if (bucket === "bucket2") {
    const india = items.filter((i) => i.region === "India");
    const global = items.filter((i) => i.region !== "India");
    content.innerHTML = `
      <div class="section-title">India</div>
      <div class="grid">${india.map((i) => renderCard(i, bucket)).join("") || `<div class="empty-state">No India deals this week.</div>`}</div>
      <div class="section-title">Global</div>
      <div class="grid">${global.map((i) => renderCard(i, bucket)).join("") || `<div class="empty-state">No global deals this week.</div>`}</div>
      ${renderFlagged(week.flagged && week.flagged.bucket2, "Unresolved names")}
    `;
    return;
  }

  if (bucket === "bucket4") {
    content.innerHTML = `
      <div class="grid">${items.map(renderPeopleCard).join("") || `<div class="empty-state">No people moves this week.</div>`}</div>
      ${renderFlagged(week.flagged && week.flagged.bucket4, "Unresolved names")}
    `;
    return;
  }

  if (bucket === "bucket5") {
    content.innerHTML = `
      <div class="grid">${items.map(renderStrategicCard).join("") || `<div class="empty-state">No strategic insights this week.</div>`}</div>
    `;
    return;
  }

  content.innerHTML = `
    <div class="grid">${items.map((i) => renderCard(i, bucket)).join("") || `<div class="empty-state">No items this week.</div>`}</div>
    ${renderFlagged(week.flagged && week.flagged[bucket], "Unresolved names")}
  `;
}

function matchText(item, q) {
  const parts = [
    item.headline, item.description, item.why_important, item.person, item.new_company,
    item.previous_role, item.new_role_title, item.insight, item.ref_item,
    ...(item.companies || []).map((c) => c.name),
    ...(item.people || []).map((p) => p.name),
  ];
  return parts.filter(Boolean).join(" ␟").toLowerCase().includes(q);
}

function renderSearch(query) {
  const content = document.getElementById("content");
  const q = query.trim().toLowerCase();
  const results = [];
  WEEKS.forEach((week) => {
    ["bucket1", "bucket2", "bucket3"].forEach((b) => {
      (week[b] || []).forEach((item) => {
        if (matchText(item, q)) results.push({ item, bucket: b, week });
      });
    });
    (week.bucket4 || []).forEach((item) => {
      if (matchText(item, q)) results.push({ item, bucket: "bucket4", week });
    });
    (week.bucket5 || []).forEach((item) => {
      if (matchText(item, q)) results.push({ item, bucket: "bucket5", week });
    });
  });

  if (!results.length) {
    content.innerHTML = `<div class="empty-state">No results for "${query}"</div>`;
    return;
  }

  const cards = results
    .map(({ item, bucket, week }) => {
      const card =
        bucket === "bucket4" ? renderPeopleCard(item) : bucket === "bucket5" ? renderStrategicCard(item) : renderCard(item, bucket);
      const badge = `<div class="search-meta">${BUCKET_LABELS[bucket]} &middot; week of ${fmtDate(week.week_start)}</div>`;
      return `<div class="search-result">${badge}${card}</div>`;
    })
    .join("");

  content.innerHTML = `<div class="section-title">${results.length} result${results.length === 1 ? "" : "s"} for "${query}"</div><div class="grid">${cards}</div>`;
}

function render() {
  if (searchQuery.trim()) {
    document.getElementById("tabs").classList.add("hidden");
    renderSearch(searchQuery);
  } else {
    document.getElementById("tabs").classList.remove("hidden");
    renderBucket(activeBucket);
  }
}

function populateWeekSelect() {
  const sel = document.getElementById("weekSelect");
  sel.innerHTML = WEEKS.map((w, i) => `<option value="${i}">${weekLabel(w, i)}</option>`).join("");
  sel.value = String(activeWeekIndex);
}

document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  activeBucket = btn.dataset.bucket;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
  render();
});

document.getElementById("weekSelect").addEventListener("change", (e) => {
  activeWeekIndex = Number(e.target.value);
  render();
});

const searchInput = document.getElementById("searchInput");
const searchClear = document.getElementById("searchClear");
searchInput.addEventListener("input", (e) => {
  searchQuery = e.target.value;
  searchClear.hidden = !searchQuery;
  render();
});
searchClear.addEventListener("click", () => {
  searchQuery = "";
  searchInput.value = "";
  searchClear.hidden = true;
  render();
});

fetch("/data.json")
  .then((r) => r.json())
  .then((data) => {
    WEEKS = data.weeks || [];
    updatedAt = data.updated_at;
    if (updatedAt) {
      document.getElementById("lastUpdated").textContent = "Updated " + new Date(updatedAt).toDateString();
    }
    populateWeekSelect();
    render();
  })
  .catch(() => {
    document.getElementById("content").innerHTML = `<div class="empty-state">Could not load data.json</div>`;
  });
