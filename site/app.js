const BUCKET_LABELS = {
  bucket1: "Ad Mandates, Campaigns & Marketing Stunts",
  bucket2: "M&A",
  bucket3: "New Products & Brand Launches",
  bucket4: "People Moves",
  bucket5: "Strategic Insights",
};

let DATA = { bucket1: [], bucket2: [], bucket3: [], bucket4: [], bucket5: [], updated_at: null };
let activeBucket = "bucket1";

function isNew(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const days = (Date.now() - d.getTime()) / 86400000;
  return days <= 7;
}

function linkOrText(name, url) {
  if (url) return `<a href="${url}" target="_blank" rel="noopener">${name}</a>`;
  return name;
}

function companiesHtml(item) {
  if (!item.companies) return "";
  return item.companies
    .map((c) => linkOrText(c.name, c.url))
    .join(", ");
}

function peopleHtml(item) {
  if (!item.people) return "";
  return item.people
    .map((p) => linkOrText(p.name, p.linkedin_url))
    .join(", ");
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

function renderBucket(bucket) {
  const content = document.getElementById("content");
  const items = DATA[bucket] || [];

  if (bucket === "bucket2") {
    const india = items.filter((i) => i.region === "India");
    const global = items.filter((i) => i.region !== "India");
    content.innerHTML = `
      <div class="section-title">India</div>
      <div class="grid">${india.map((i) => renderCard(i, bucket)).join("") || `<div class="empty-state">No India deals yet.</div>`}</div>
      <div class="section-title">Global</div>
      <div class="grid">${global.map((i) => renderCard(i, bucket)).join("") || `<div class="empty-state">No global deals yet.</div>`}</div>
      ${renderFlagged(DATA.flagged && DATA.flagged.bucket2, "Unresolved names")}
    `;
    return;
  }

  if (bucket === "bucket4") {
    content.innerHTML = `
      <div class="grid">${items.map(renderPeopleCard).join("") || `<div class="empty-state">No people moves yet.</div>`}</div>
      ${renderFlagged(DATA.flagged && DATA.flagged.bucket4, "Unresolved names")}
    `;
    return;
  }

  if (bucket === "bucket5") {
    content.innerHTML = `
      <div class="grid">${items.map(renderStrategicCard).join("") || `<div class="empty-state">No strategic insights yet.</div>`}</div>
    `;
    return;
  }

  content.innerHTML = `
    <div class="grid">${items.map((i) => renderCard(i, bucket)).join("") || `<div class="empty-state">No items yet.</div>`}</div>
    ${renderFlagged(DATA.flagged && DATA.flagged[bucket], "Unresolved names")}
  `;
}

function setActiveTab(bucket) {
  activeBucket = bucket;
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.bucket === bucket);
  });
  renderBucket(bucket);
}

document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  setActiveTab(btn.dataset.bucket);
});

fetch("/data.json")
  .then((r) => r.json())
  .then((data) => {
    DATA = data;
    if (data.updated_at) {
      document.getElementById("lastUpdated").textContent =
        "Updated " + new Date(data.updated_at).toDateString();
    }
    setActiveTab(activeBucket);
  })
  .catch(() => {
    document.getElementById("content").innerHTML =
      `<div class="empty-state">Could not load data.json</div>`;
  });
