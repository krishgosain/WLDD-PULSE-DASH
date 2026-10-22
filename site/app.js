/* ══════════════════════════════════════════════════════════════════
   WLDD PULSE DASH — app
   Buckets and capabilities unchanged. Cards show the headline only;
   everything else lives behind the open state.
   ══════════════════════════════════════════════════════════════════ */
(function () {
"use strict";

/* ── bucket definitions (order is the reading order) ───────────────
   Strategic Insights is always last; Experiential sits before it.   */
const BUCKETS = [
  { key:"bucket1", n:"01", slug:"mandates",     title:"Mandates &amp;<br>Campaigns",      short:"Mandates & Campaigns",     band:"yellow", dot:"pink",   groupBy:"industry" },
  { key:"bucket2", n:"02", slug:"ma",           title:"Mergers &amp;<br>Acquisitions",    short:"M&A",                      band:"purple", dot:"yellow", groupBy:"region" },
  { key:"bucket3", n:"03", slug:"launches",     title:"New Products &amp;<br>Launches",   short:"New Products & Launches",  band:"blue",   dot:"pink",   groupBy:null },
  { key:"bucket4", n:"04", slug:"people",       title:"People<br>Moves",                  short:"People Moves",             band:"green",  dot:"pink",   groupBy:null },
  { key:"bucket6", n:"05", slug:"experiential", title:"Experiential<br>Economy",          short:"Experiential Economy",     band:"pink",   dot:"yellow", groupBy:"category" },
  { key:"bucket5", n:"06", slug:"strategic",    title:"Strategic<br>Insights",            short:"Strategic Insights",       band:"ink",    dot:"pink",   groupBy:null, acc:"pink" },
];
const BY_KEY = Object.fromEntries(BUCKETS.map(b => [b.key, b]));

/* ── state ────────────────────────────────────────────────────────── */
const S = {
  data:null, wi:0, filter:"all", q:"", sub:{},
  read:new Set(), star:new Set(), cursor:-1, open:null,
};

const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

/* ── storage ──────────────────────────────────────────────────────── */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

/* ── small helpers ────────────────────────────────────────────────── */
const esc = s => String(s == null ? "" : s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return "i" + (h >>> 0).toString(36);
}

const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function d2(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.getUTCDate() + " " + MON[d.getUTCMonth()];
}
function weekLabel(w, withYear) {
  const a = new Date(w.week_start), b = new Date(w.week_end);
  if (isNaN(a) || isNaN(b)) return "This week";
  const end = new Date(b.getTime() - 86400000); // inclusive end
  const l = a.getUTCDate() + " " + MON[a.getUTCMonth()] + " — " + end.getUTCDate() + " " + MON[end.getUTCMonth()];
  return withYear ? l + " " + end.getUTCFullYear() : l;
}
function stampLabel(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  return "Updated " + days[d.getUTCDay()] + ", " + d.getUTCDate() + " " + MON[d.getUTCMonth()];
}

/* ── normalise any bucket record into one shape ───────────────────── */
function norm(raw, bkey, wi) {
  const b = BY_KEY[bkey];
  const o = { bucket:bkey, wi:wi, raw:raw, kind:bkey };

  if (bkey === "bucket4") {
    const who  = raw.person || "Someone";
    const role = raw.new_role_title || "a new role";
    const co   = raw.new_company || raw.org || "";
    o.headline = who + " → " + role + (co ? ", " + co : "");
    o.desc     = raw.previous_role && !/^not disclosed$/i.test(raw.previous_role)
                 ? "Previously: " + raw.previous_role : "";
    o.why      = "";
    o.group    = null;
    o.ents     = [];
    if (raw.linkedin_url) o.ents.push({ name:who, url:raw.linkedin_url, kind:"in" });
    if (raw.company_url)  o.ents.push({ name:co || raw.org, url:raw.company_url, kind:"co" });
    o.tag = co || raw.org || "";
  } else if (bkey === "bucket5") {
    o.headline = raw.headline || "";
    o.desc     = "";
    o.why      = raw.insight || "";
    o.group    = null;
    o.ents     = [];
    o.fit      = raw.product_fit || "";
    o.ref      = raw.ref_item ? (raw.ref_bucket_label || "") + " — " + raw.ref_item : "";
    o.tag      = raw.product_fit || "";
  } else {
    o.headline = raw.headline || "";
    o.desc     = raw.description || "";
    o.why      = raw.why_important || "";
    o.group    = b.groupBy ? (raw[b.groupBy] || "Other") : null;
    o.ents     = []
      .concat((raw.companies || []).map(c => ({ name:c.name, url:c.url, kind:"co" })))
      .concat((raw.people    || []).map(p => ({ name:p.name, url:p.url || p.linkedin_url, kind:"in" })))
      .filter(e => e.name);
    o.tag = bkey === "bucket1" ? raw.industry
          : bkey === "bucket2" ? raw.region
          : bkey === "bucket6" ? raw.category : "";
    if (bkey === "bucket2" && raw.deal_value && !/^not disclosed$/i.test(raw.deal_value)) o.deal = raw.deal_value;
  }

  o.src  = raw.source_name || "";
  o.url  = raw.source_url || "";
  o.date = raw.date || "";
  o.id   = hash(bkey + "|" + o.headline + "|" + o.url);
  o.hay  = (o.headline + " " + o.desc + " " + o.why + " " + o.tag + " " + o.src + " " +
            o.ents.map(e => e.name).join(" ")).toLowerCase();
  return o;
}

/* ── build the working set for the current view ───────────────────── */
function itemsFor(bkey) {
  const q = S.q.trim().toLowerCase();
  let list = [];
  if (q) {
    // search runs across every week
    S.data.weeks.forEach((w, i) => (w[bkey] || []).forEach(r => list.push(norm(r, bkey, i))));
    list = list.filter(it => it.hay.includes(q));
  } else {
    const w = S.data.weeks[S.wi] || {};
    list = (w[bkey] || []).map(r => norm(r, bkey, S.wi));
  }
  if (S.filter === "unread")  list = list.filter(it => !S.read.has(it.id));
  if (S.filter === "starred") list = list.filter(it =>  S.star.has(it.id));
  const sub = S.sub[bkey];
  if (sub) list = list.filter(it => it.group === sub);
  return list;
}

/* counts shown on the tiles — week totals, before filters */
function tileCounts() {
  const w = S.data.weeks[S.wi] || {};
  const o = {};
  BUCKETS.forEach(b => { o[b.key] = (w[b.key] || []).length; });
  return o;
}

/* ══════════════════════════ render ═══════════════════════════════ */

function renderChrome() {
  const w = S.data.weeks[S.wi];
  $("#weekBtnLabel").textContent = weekLabel(w, true);
  $("#lastUpdated").textContent  = stampLabel(w.updated_at || S.data.updated_at);

  const counts = tileCounts();
  const total  = BUCKETS.reduce((a, b) => a + counts[b.key], 0);
  const words  = total === 1 ? "thing" : "things";
  $("#heroH").innerHTML  = total + " " + words + "<br>worth knowing<i>.</i>";
  $("#heroMeta").textContent = "WLDD PULSE DASH / " + weekLabel(w, true) + " / INTERNAL";

  const all = allItemsThisWeek();
  const readN = all.filter(it => S.read.has(it.id)).length;
  $("#heroStat").textContent = readN
    ? "You've read " + readN + " of " + all.length + " this week. Star what matters, tap copy, send it on."
    : "Six buckets, one pass. Star what matters, tap copy, send it on.";

  // week panel
  $("#weekPanel").innerHTML = S.data.weeks.map((wk, i) => {
    const n = BUCKETS.reduce((a, b) => a + (wk[b.key] || []).length, 0);
    return '<button class="wk' + (i === S.wi ? " is-on" : "") + '" role="option" data-wi="' + i +
           '" aria-selected="' + (i === S.wi) + '">' + esc(weekLabel(wk, true)) +
           "<small>" + n + " items</small></button>";
  }).join("");

  // tiles
  const prev = S.data.weeks[S.wi + 1];
  $("#tiles").innerHTML = BUCKETS.map(b => {
    const list = (S.data.weeks[S.wi][b.key] || []).map(r => norm(r, b.key, S.wi));
    const read = list.filter(it => S.read.has(it.id)).length;
    const pct  = list.length ? Math.round(read / list.length * 100) : 0;

    // week-over-week movement, so the tile says something a static count cannot
    let delta = "";
    if (prev) {
      const d = list.length - (prev[b.key] || []).length;
      delta = '<span class="tile-d" title="vs the week before">' +
              (d > 0 ? "↑ " + d : d < 0 ? "↓ " + Math.abs(d) : "— level") + "</span>";
    }

    return '<a class="tile tile-' + b.key.replace("bucket","") + '" href="#b-' + b.slug + '" data-slug="' + b.slug + '">' +
      '<span class="tile-l">' + esc(b.short) + "</span>" +
      '<span class="tile-row"><span class="tile-n" data-n="' + list.length + '">' + list.length + "</span>" + delta + "</span>" +
      '<span class="tile-bar"><i style="width:' + pct + '%"></i></span></a>';
  }).join("");

  // the sticky bucket rail — same six, reachable from any scroll depth
  $("#brail").innerHTML = BUCKETS.map(b =>
    '<a class="bnav bnav-' + b.key.replace("bucket", "") + '" href="#b-' + b.slug +
    '" data-slug="' + b.slug + '"><span>' + esc(b.short) + "</span>" +
    '<span class="bnav-n">' + counts[b.key] + "</span></a>").join("");

  countUp();
}

/* the counts roll up once, on arrival */
function countUp() {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  $$(".tile-n").forEach(el => {
    const target = Number(el.dataset.n) || 0;
    if (target < 2) return;
    const t0 = performance.now(), dur = 620;
    el.textContent = "0";
    (function step(t) {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  });
}

function allItemsThisWeek() {
  const w = S.data.weeks[S.wi] || {};
  return BUCKETS.flatMap(b => (w[b.key] || []).map(r => norm(r, b.key, S.wi)));
}

function renderProgress() {
  const all = allItemsThisWeek();
  const readN = all.filter(it => S.read.has(it.id)).length;
  $("#progressLabel").textContent = readN + " / " + all.length + " read";
  $("#progBar").style.width = all.length ? (readN / all.length * 100) + "%" : "0%";
  $("#nUnread").textContent = all.length - readN;
  $("#nStar").textContent   = S.star.size;

  const n = S.star.size;
  const tray = $("#tray");
  tray.hidden = n === 0;
  $("#trayN").textContent = n;
  $("#trayT") && ($("#trayT").textContent = n === 1 ? "starred" : "starred");
}

const ICON_STAR  = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6.1L12 17.3 6.7 20.2l1.1-6.1L3.4 9.9l6-.8z"/></svg>';
const ICON_STARF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6.1L12 17.3 6.7 20.2l1.1-6.1L3.4 9.9l6-.8z"/></svg>';
const ICON_COPY  = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 4.5h-11a2 2 0 0 0-2 2v11" stroke-linecap="round"/></svg>';
const ICON_TICK  = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.5 5.5L20 6.5"/></svg>';

/* the button confirms on itself, before the toast has even landed */
function flashCopied(btn) {
  if (!btn) return;
  btn.classList.add("done");
  btn.innerHTML = ICON_TICK;
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.classList.remove("done"); btn.innerHTML = ICON_COPY; }, 1100);
}

function rowHTML(it) {
  const b = BY_KEY[it.bucket];
  const starred = S.star.has(it.id);
  const isRead  = S.read.has(it.id);
  const open    = S.open === it.id;

  const meta = [];
  if (it.fit) { /* strategic: fit badge sits above the headline instead */ }
  if (it.tag && it.bucket !== "bucket5") meta.push(esc(it.tag));
  if (it.src)  meta.push(esc(it.src));
  if (S.q && S.data.weeks[it.wi]) meta.push(esc(weekLabel(S.data.weeks[it.wi], false)));

  let body = "";
  if (it.desc)  body += '<p class="desc">' + esc(it.desc) + "</p>";
  if (it.why)   body += '<div class="why"><span class="eyebrow">' +
                        (it.bucket === "bucket5" ? "The play" : "Why it matters") +
                        '</span><p>' + esc(it.why) + "</p></div>";
  if (it.deal)  body += '<p class="ref">Deal value — ' + esc(it.deal) + "</p>";
  if (it.ref)   body += '<p class="ref">From ' + esc(it.ref) + "</p>";
  if (it.ents.length) {
    body += '<div class="ents">' + it.ents.map(e => e.url
      ? '<a class="ent" href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(e.name) +
        '<span class="ent-x" aria-hidden="true">' + (e.kind === "in" ? "in" : "↗") + "</span></a>"
      : '<span class="ent">' + esc(e.name) + "</span>"
    ).join("") + "</div>";
  }
  if (it.url) {
    body += '<a class="src-row" href="' + esc(it.url) + '" target="_blank" rel="noopener">' +
            "<span>" + (it.src ? "Read it on " + esc(it.src) : "Read the source story") + "</span>" +
            '<span aria-hidden="true">↗</span></a>';
  }

  return '<article class="row' + (isRead ? " is-read" : "") + (open ? " is-open" : "") +
         '" id="r-' + it.id + '" data-id="' + it.id + '" data-bucket="' + it.bucket + '">' +
    '<span class="row-dot" aria-hidden="true"></span>' +
    '<div class="row-head">' +
      '<button class="row-main" aria-expanded="' + open + '" aria-controls="body-' + it.id + '">' +
        (it.fit ? '<span class="fit">' + esc(it.fit) + "</span>" : "") +
        '<h3 class="row-h">' + esc(it.headline) + "</h3>" +
        (meta.length || it.date
          ? '<p class="row-meta">' + meta.join('<span class="sep">·</span>') +
            (it.date ? (meta.length ? '<span class="sep">·</span>' : "") +
              '<span class="row-date">' + esc(d2(it.date)) + "</span>" : "") + "</p>"
          : "") +
      "</button>" +
      '<div class="row-acts">' +
        '<button class="act js-copy" aria-label="Copy this item as text">' + ICON_COPY + "</button>" +
        '<button class="act js-star' + (starred ? " is-star" : "") + '" aria-pressed="' + starred +
          '" aria-label="' + (starred ? "Unstar" : "Star") + ' this item">' +
          (starred ? ICON_STARF : ICON_STAR) + "</button>" +
      "</div>" +
    "</div>" +
    '<div class="row-body" id="body-' + it.id + '">' + body + "</div>" +
  "</article>";
}

function renderBuckets() {
  const host = $("#buckets");
  let any = false;

  host.innerHTML = BUCKETS.map(b => {
    const list = itemsFor(b.key);
    if (list.length) any = true;

    // sub-filter chips, built from the unfiltered week (or search set)
    let chips = "";
    if (b.groupBy) {
      const base = (S.q
        ? S.data.weeks.flatMap((w, i) => (w[b.key] || []).map(r => norm(r, b.key, i))).filter(it => it.hay.includes(S.q.trim().toLowerCase()))
        : (S.data.weeks[S.wi][b.key] || []).map(r => norm(r, b.key, S.wi)));
      const groups = {};
      base.forEach(it => { groups[it.group] = (groups[it.group] || 0) + 1; });
      const keys = Object.keys(groups).sort((a, c) => groups[c] - groups[a]);
      if (keys.length > 1) {
        chips = '<div class="chips">' +
          '<button class="chip' + (!S.sub[b.key] ? " is-on" : "") + '" data-sub="" data-bk="' + b.key + '">All' +
            '<span class="chip-n">' + base.length + "</span></button>" +
          keys.map(k => '<button class="chip' + (S.sub[b.key] === k ? " is-on" : "") +
            '" data-sub="' + esc(k) + '" data-bk="' + b.key + '">' + esc(k) +
            '<span class="chip-n">' + groups[k] + "</span></button>").join("") + "</div>";
      }
    }

    // group items under hairline headings when no sub-filter is active
    let listHTML;
    if (b.groupBy && !S.sub[b.key] && list.length) {
      const groups = {};
      list.forEach(it => { (groups[it.group] = groups[it.group] || []).push(it); });
      const keys = Object.keys(groups).sort((a, c) => groups[c].length - groups[a].length);
      listHTML = keys.map(k =>
        '<div class="grp"><h3>' + esc(k) + '</h3><span class="eyebrow">' + groups[k].length + "</span></div>" +
        groups[k].map(rowHTML).join("")
      ).join("");
    } else {
      listHTML = list.map(rowHTML).join("");
    }

    if (!list.length) listHTML = '<p class="row-meta list-empty">Nothing here under the current filters.</p>';

    return '<section class="bucket reveal" id="b-' + b.slug + '" data-bk="' + b.key + '" style="--acc:var(--' + (b.acc || b.band) + ');--dot:var(--' + b.dot + ')">' +
      '<div class="band band-' + b.band + ' band-head">' +
        '<span class="ghost" aria-hidden="true">' + b.n + "</span>" +
        '<div class="wrap">' +
        '<span class="eyebrow">' + b.n + " / Bucket</span>" +
        "<h2>" + b.title + "<i>.</i></h2>" +
        '<div class="band-foot">' +
          '<span class="badge">' + list.length + " item" + (list.length === 1 ? "" : "s") + "</span>" +
          '<button class="tlink js-copy-sec" data-bk="' + b.key + '">Copy this section <span aria-hidden="true">⧉</span></button>' +
        "</div>" +
      "</div></div>" +
      '<div class="wrap">' + chips +
        '<div class="list' + (b.band === "ink" ? " list-ink" : "") + '">' + listHTML + "</div>" +
      "</div>" +
      (b.band === "ink" ? "" : "") +
    "</section>";
  }).join("");

  // the ink bucket's list needs the ink ground to run to the edges
  const inkSec = $('.bucket[data-bk="bucket5"]');
  if (inkSec) inkSec.style.background = "var(--ink)";

  // rows arrive in sequence behind their section, capped so a long list never drags
  $$(".bucket").forEach(sec => {
    $$(".row", sec).forEach((r, i) => r.style.setProperty("--d", Math.min(i * 22, 260) + "ms"));
  });

  $("#noResults").hidden = any;
  sweepReveals();
  armRevealFailsafe();
  renderProgress();
  onScroll();
}

function render() { renderChrome(); renderBuckets(); }

/* ══════════════════════════ copy ═════════════════════════════════ */

function fmtItem(it, n) {
  const L = [];
  const head = (n ? n + ". " : "") + it.headline;
  L.push(head);
  if (it.why)  L.push("", (it.bucket === "bucket5" ? "The play: " : "Why it matters: ") + it.why);
  else if (it.desc) L.push("", it.desc);
  const src = [it.src, d2(it.date)].filter(Boolean).join(" · ");
  if (src) L.push("", src);
  if (it.url) L.push(it.url);
  return L.join("\n");
}

function sign() {
  const w = S.data.weeks[S.wi];
  return "— WLDD Pulse · " + weekLabel(w, true);
}

function copy(text, msg) {
  const done = () => toast(msg || "Copied ↗");
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done, () => fallback(text, done));
  } else fallback(text, done);
}
function fallback(text, done) {
  const t = document.createElement("textarea");
  t.value = text; t.setAttribute("readonly", "");
  t.style.cssText = "position:fixed;top:-1000px;opacity:0";
  document.body.appendChild(t); t.select();
  try { document.execCommand("copy"); done(); } catch (e) { toast("Couldn't copy"); }
  document.body.removeChild(t);
}

let toastT;
function toast(msg) {
  const el = $("#toast");
  $("#toastText").textContent = msg;
  el.hidden = false;
  el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.hidden = true; }, 2200);
}

function findItem(id) {
  for (const b of BUCKETS) {
    const w = S.data.weeks[S.wi] || {};
    for (const r of (w[b.key] || [])) { const it = norm(r, b.key, S.wi); if (it.id === id) return it; }
  }
  // search view may surface items from other weeks
  for (let i = 0; i < S.data.weeks.length; i++) {
    for (const b of BUCKETS) {
      for (const r of (S.data.weeks[i][b.key] || [])) { const it = norm(r, b.key, i); if (it.id === id) return it; }
    }
  }
  return null;
}

function copyItem(id) {
  const it = findItem(id);
  if (!it) return;
  copy(fmtItem(it) + "\n\n" + sign(), "Copied — paste it anywhere ↗");
  markRead(id, true);
}

function copySection(bkey) {
  const list = itemsFor(bkey);
  if (!list.length) return toast("Nothing to copy here");
  const b = BY_KEY[bkey];
  const head = "WLDD PULSE · " + b.short.toUpperCase() + "\n" + weekLabel(S.data.weeks[S.wi], true) +
               "\n" + list.length + " item" + (list.length === 1 ? "" : "s");
  copy(head + "\n\n" + list.map((it, i) => fmtItem(it, i + 1)).join("\n\n") + "\n\n" + sign(),
       "Copied " + list.length + " items ↗");
}

function copyStarred() {
  const ids = Array.from(S.star);
  const list = ids.map(findItem).filter(Boolean);
  if (!list.length) return toast("Nothing starred yet");
  const head = "WLDD PULSE — worth your attention\n" + weekLabel(S.data.weeks[S.wi], true);
  copy(head + "\n\n" + list.map((it, i) => fmtItem(it, i + 1)).join("\n\n") + "\n\n" + sign(),
       "Copied " + list.length + " starred ↗");
}

function copyWeek() {
  const parts = [];
  let n = 0;
  BUCKETS.forEach(b => {
    const list = (S.data.weeks[S.wi][b.key] || []).map(r => norm(r, b.key, S.wi));
    if (!list.length) return;
    n += list.length;
    parts.push("▌" + b.short.toUpperCase() + " (" + list.length + ")\n\n" +
               list.map((it, i) => fmtItem(it, i + 1)).join("\n\n"));
  });
  const head = "WLDD PULSE · " + weekLabel(S.data.weeks[S.wi], true) + "\n" + n + " things worth knowing";
  copy(head + "\n\n" + parts.join("\n\n\n") + "\n\n" + sign(), "Copied the full week ↗");
}

/* ══════════════════════════ actions ══════════════════════════════ */

function markRead(id, v) {
  if (v) S.read.add(id); else S.read.delete(id);
  LS.set("wldd:read", Array.from(S.read));
  const el = $("#r-" + id);
  if (el) el.classList.toggle("is-read", v);
  renderProgress();
  // keep the tile bars honest
  const counts = tileCounts();
  BUCKETS.forEach(b => {
    const list = (S.data.weeks[S.wi][b.key] || []).map(r => norm(r, b.key, S.wi));
    const read = list.filter(x => S.read.has(x.id)).length;
    const bar = $('.tile[data-slug="' + b.slug + '"] .tile-bar i');
    if (bar) bar.style.width = (counts[b.key] ? read / counts[b.key] * 100 : 0) + "%";
  });
}

function toggleStar(id) {
  const on = !S.star.has(id);
  if (on) S.star.add(id); else S.star.delete(id);
  LS.set("wldd:star", Array.from(S.star));
  const btn = $("#r-" + id + " .js-star");
  if (btn) {
    btn.classList.toggle("is-star", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", (on ? "Unstar" : "Star") + " this item");
    btn.innerHTML = on ? ICON_STARF : ICON_STAR;
  }
  renderProgress();
  if (S.filter === "starred") renderBuckets();
}

function toggleOpen(id) {
  const was = S.open === id;
  const prev = S.open ? $("#r-" + S.open) : null;
  if (prev) { prev.classList.remove("is-open"); const b = $(".row-main", prev); if (b) b.setAttribute("aria-expanded", "false"); }
  S.open = was ? null : id;
  const el = $("#r-" + id);
  if (el && !was) {
    el.classList.add("is-open");
    const b = $(".row-main", el); if (b) b.setAttribute("aria-expanded", "true");
    markRead(id, true);
    // opening makes the card span the row, which moves it — follow it
    requestAnimationFrame(() => el.scrollIntoView({ block:"nearest", behavior:"smooth" }));
  }
}

/* ══════════════════════════ keyboard ═════════════════════════════ */

function rows() { return $$(".row"); }
function moveCursor(d) {
  const r = rows();
  if (!r.length) return;
  S.cursor = Math.max(0, Math.min(r.length - 1, S.cursor + d));
  const el = r[S.cursor];
  const btn = $(".row-main", el);
  if (btn) btn.focus({ preventScroll:true });
  el.scrollIntoView({ block:"center", behavior:"smooth" });
}
function cursorId() {
  const r = rows();
  if (S.cursor < 0 || !r[S.cursor]) {
    const act = document.activeElement && document.activeElement.closest(".row");
    return act ? act.dataset.id : null;
  }
  return r[S.cursor].dataset.id;
}

/* ══════════════════════════ sheets ═══════════════════════════════ */

function openSheet(sel) {
  $$(".sheet").forEach(s => { s.hidden = true; });
  $("#scrim").hidden = false;
  $(sel).hidden = false;
  const inp = $("input", $(sel));
  if (inp) { inp.value = ""; inp.focus(); buildPalette(""); }
  else { const b = $("button", $(sel)); b && b.focus(); }
}
function closeSheets() {
  $$(".sheet").forEach(s => { s.hidden = true; });
  $("#scrim").hidden = true;
}

function palItems() {
  const out = [];
  BUCKETS.forEach(b => out.push({ t:b.short, s:"Bucket " + b.n, go:() => jump(b.slug) }));
  S.data.weeks.forEach((w, i) => out.push({ t:weekLabel(w, true), s:"Week", go:() => setWeek(i) }));
  const inds = new Set();
  (S.data.weeks[S.wi].bucket1 || []).forEach(r => r.industry && inds.add(r.industry));
  inds.forEach(k => out.push({ t:k, s:"Industry", go:() => { S.sub.bucket1 = k; renderBuckets(); jump("mandates"); } }));
  out.push({ t:"Copy this week's digest", s:"Action", go:copyWeek });
  out.push({ t:"Copy everything starred", s:"Action", go:copyStarred });
  out.push({ t:"Switch theme", s:"Action", go:flipTheme });
  return out;
}
let palCache = [], palSel = 0;
function buildPalette(q) {
  const all = palItems();
  palCache = q ? all.filter(x => (x.t + " " + x.s).toLowerCase().includes(q.toLowerCase())) : all;
  palSel = 0;
  $("#palList").innerHTML = palCache.map((x, i) =>
    '<button class="pal' + (i === 0 ? " is-on" : "") + '" data-i="' + i + '" role="option">' +
    esc(x.t) + "<small>" + esc(x.s) + "</small></button>").join("");
}
function palMove(d) {
  if (!palCache.length) return;
  palSel = (palSel + d + palCache.length) % palCache.length;
  $$(".pal").forEach((el, i) => el.classList.toggle("is-on", i === palSel));
  const el = $$(".pal")[palSel]; el && el.scrollIntoView({ block:"nearest" });
}
function palRun() {
  const x = palCache[palSel];
  if (x) { closeSheets(); x.go(); }
}

function jump(slug) {
  const el = $("#b-" + slug);
  if (el) el.scrollIntoView({ behavior:"smooth", block:"start" });
}

function setWeek(i) {
  S.wi = i; S.open = null; S.cursor = -1; S.sub = {};
  $("#weekPanel").hidden = true;
  $("#weekBtn").setAttribute("aria-expanded", "false");
  render();
  window.scrollTo({ top:0, behavior:"smooth" });
}

function flipTheme() {
  const now = document.documentElement.getAttribute("data-theme") === "ink" ? "paper" : "ink";
  document.documentElement.setAttribute("data-theme", now);
  LS.set("wldd:theme", now);
  $("#themeLabel").textContent = now === "ink" ? "Light" : "Dark";
  $('meta[name="theme-color"]').setAttribute("content", now === "ink" ? "#111111" : "#72cc8b");
}

/* ══════════════════════════ the rail ═════════════════════════════
   Depth of scroll as width, and the bucket you are standing in as
   colour — so the masthead always answers "where am I" without a
   sidebar or a second nav.                                          */
let lastFlat = "", rafQ = false;

function onScroll() {
  const doc = document.documentElement;
  const bar = $("#railBar");
  if (!bar) return;

  const max = doc.scrollHeight - doc.clientHeight;
  bar.style.width = (max > 0 ? Math.min(1, doc.scrollTop / max) * 100 : 0) + "%";

  // measure the whole sticky stack, not just the masthead — the rail sits under it
  const mastH = parseInt(getComputedStyle(doc).getPropertyValue("--mast-h"), 10) || 74;
  const ctrl  = $("#controls");
  const stuck = mastH + (ctrl ? ctrl.offsetHeight : 0) + 12;

  let cur = null;
  $$(".bucket").forEach(sec => { if (sec.getBoundingClientRect().top <= stuck) cur = sec; });

  const chip = $("#nowChip"), stamp = $("#stamp"), dot = $("#nowChip i");
  const b = cur ? BY_KEY[cur.dataset.bk] : null;
  const flat = b ? "var(--" + (b.acc || b.band) + ")" : "var(--green)";

  if (flat !== lastFlat) {
    lastFlat = flat;
    bar.style.background = flat;
    if (dot) dot.style.background = flat;
  }
  if (b) {
    $("#nowChipLabel").textContent = b.n + " / " + b.short;
    chip.classList.add("on"); stamp.classList.add("off");
  } else {
    chip.classList.remove("on"); stamp.classList.remove("off");
  }

  // light the rail on the bucket you are standing in
  const here = b ? b.slug : null;
  $$(".bnav").forEach(el => {
    const on = el.dataset.slug === here;
    el.classList.toggle("is-here", on);
    if (on) el.setAttribute("aria-current", "true"); else el.removeAttribute("aria-current");
  });
}

function queueScroll() {
  if (rafQ) return;
  rafQ = true;
  requestAnimationFrame(() => { rafQ = false; onScroll(); });
}

/* ══════════════════════════ reveal on scroll ═════════════════════
   Deliberately NOT IntersectionObserver and NOT rAF. Both are
   throttled or paused while the page is backgrounded, and these
   classes gate whether CONTENT IS VISIBLE, not just how it animates.
   A plain geometry check on the scroll event always runs.          */
let revealT;
function sweepReveals() {
  const h = window.innerHeight || 800;
  $$(".reveal").forEach(e => {
    if (!e.classList.contains("seen") && e.getBoundingClientRect().top < h * 0.92) {
      e.classList.add("seen");
    }
  });
}

/* belt and braces: whatever happens with events, nothing in or above
   the viewport stays hidden past this point */
function armRevealFailsafe() {
  clearTimeout(revealT);
  revealT = setTimeout(sweepReveals, 700);
}

/* ══════════════════════════ wiring ═══════════════════════════════ */

function wire() {
  // delegated clicks
  document.addEventListener("click", e => {
    const t = e.target;

    const copyBtn = t.closest(".js-copy");
    if (copyBtn) { e.preventDefault(); copyItem(copyBtn.closest(".row").dataset.id); flashCopied(copyBtn); return; }

    const starBtn = t.closest(".js-star");
    if (starBtn) { e.preventDefault(); toggleStar(starBtn.closest(".row").dataset.id); return; }

    const main = t.closest(".row-main");
    if (main) { e.preventDefault(); toggleOpen(main.closest(".row").dataset.id); return; }

    const sec = t.closest(".js-copy-sec");
    if (sec) { e.preventDefault(); copySection(sec.dataset.bk); return; }

    const chip = t.closest(".chip");
    if (chip) {
      e.preventDefault();
      const bk = chip.dataset.bk;
      S.sub[bk] = chip.dataset.sub || null;
      renderBuckets();
      const sec2 = $("#b-" + BY_KEY[bk].slug);
      if (sec2) sec2.scrollIntoView({ behavior:"smooth", block:"start" });
      return;
    }

    const seg = t.closest(".seg");
    if (seg) { $$(".seg").forEach(s => s.classList.remove("is-on")); seg.classList.add("is-on");
      S.filter = seg.dataset.filter; S.open = null; S.cursor = -1; renderBuckets(); return; }

    const wk = t.closest(".wk");
    if (wk) { setWeek(Number(wk.dataset.wi)); return; }

    const pal = t.closest(".pal");
    if (pal) { palSel = Number(pal.dataset.i); palRun(); return; }

    const tile = t.closest(".tile");
    if (tile) { e.preventDefault(); jump(tile.dataset.slug); return; }

    const bnav = t.closest(".bnav");
    if (bnav) { e.preventDefault(); jump(bnav.dataset.slug); return; }

    // close the week panel on an outside click
    if (!t.closest("#weekPanel") && !t.closest("#weekBtn")) {
      $("#weekPanel").hidden = true;
      $("#weekBtn").setAttribute("aria-expanded", "false");
    }
  });

  $("#weekBtn").addEventListener("click", e => {
    e.stopPropagation();
    const p = $("#weekPanel");
    p.hidden = !p.hidden;
    $("#weekBtn").setAttribute("aria-expanded", String(!p.hidden));
  });

  $("#themeToggle").addEventListener("click", flipTheme);
  $("#keysBtn").addEventListener("click", () => openSheet("#keysSheet"));
  $("#keysClose").addEventListener("click", closeSheets);
  $("#flagClose").addEventListener("click", closeSheets);
  $("#scrim").addEventListener("click", closeSheets);
  $("#paletteBtn").addEventListener("click", () => openSheet("#palette"));
  $("#trayCopy").addEventListener("click", copyStarred);
  $("#copyWeek").addEventListener("click", copyWeek);
  $("#trayClear").addEventListener("click", () => {
    S.star.clear(); LS.set("wldd:star", []); renderBuckets(); toast("Starred list cleared");
  });

  $("#flaggedBtn").addEventListener("click", () => {
    const f = (S.data.weeks[S.wi] || {}).flagged || {};
    const rows2 = [];
    Object.keys(f).forEach(k => (f[k] || []).forEach(s => rows2.push({ b:BY_KEY[k] ? BY_KEY[k].short : k, s:s })));
    $("#flagList").innerHTML = rows2.length
      ? rows2.map(r => "<p><strong>" + esc(r.b) + "</strong> — " + esc(r.s) + "</p>").join("")
      : '<p>Everything resolved this week.</p>';
    openSheet("#flagSheet");
  });

  $("#clearAll").addEventListener("click", () => {
    S.q = ""; S.filter = "all"; S.sub = {};
    $("#searchInput").value = ""; $("#searchClear").hidden = true;
    $$(".seg").forEach(s => s.classList.toggle("is-on", s.dataset.filter === "all"));
    renderBuckets();
  });

  // search
  let sT;
  $("#searchInput").addEventListener("input", e => {
    const v = e.target.value;
    $("#searchClear").hidden = !v;
    clearTimeout(sT);
    sT = setTimeout(() => { S.q = v; S.open = null; S.cursor = -1; renderBuckets(); }, 170);
  });
  $("#searchClear").addEventListener("click", () => {
    $("#searchInput").value = ""; $("#searchClear").hidden = true;
    S.q = ""; renderBuckets(); $("#searchInput").focus();
  });

  // palette input
  $("#palInput").addEventListener("input", e => buildPalette(e.target.value));
  $("#palInput").addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); palMove(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); palMove(-1); }
    else if (e.key === "Enter") { e.preventDefault(); palRun(); }
  });

  // global keys
  document.addEventListener("keydown", e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);

    if (e.key === "Escape") {
      if (!$("#scrim").hidden) { closeSheets(); return; }
      if (!$("#weekPanel").hidden) { $("#weekPanel").hidden = true; return; }
      if (S.open) { toggleOpen(S.open); return; }
      if (typing) { e.target.blur(); return; }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSheet("#palette"); return; }
    if (typing) return;

    if (e.key === "/") { e.preventDefault(); $("#searchInput").focus(); return; }
    if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); moveCursor(1); return; }
    if (e.key === "ArrowUp"   || e.key === "k") { e.preventDefault(); moveCursor(-1); return; }
    if (e.key === "Enter") { const id = cursorId(); if (id) { e.preventDefault(); toggleOpen(id); } return; }
    if (e.key.toLowerCase() === "c") { const id = cursorId(); if (id) { e.preventDefault(); copyItem(id); flashCopied($("#r-" + id + " .js-copy")); } return; }
    if (e.key.toLowerCase() === "s") { const id = cursorId(); if (id) { e.preventDefault(); toggleStar(id); } return; }
    if (e.key === "?") { openSheet("#keysSheet"); return; }
    if (/^[1-6]$/.test(e.key)) { jump(BUCKETS[Number(e.key) - 1].slug); return; }
  });

  // sweepReveals runs straight off the event; only the rail is rAF-throttled
  window.addEventListener("scroll", () => { sweepReveals(); queueScroll(); }, { passive: true });
  window.addEventListener("resize", () => { sweepReveals(); queueScroll(); }, { passive: true });

  // track the cursor when the user clicks around
  document.addEventListener("focusin", e => {
    const r = e.target.closest && e.target.closest(".row");
    if (r) S.cursor = rows().indexOf(r);
  });
}

/* ══════════════════════════ boot ═════════════════════════════════ */

function boot() {
  const bar = $("#bootBar"), st = $("#bootStatus");
  const steps = ["establishing signal", "pulling the week", "sorting six buckets", "ready"];
  let p = 0, i = 0;
  const tick = setInterval(() => {
    p = Math.min(96, p + 11 + Math.random() * 14);
    bar.style.width = p + "%";
    if (p > (i + 1) * 24 && i < steps.length - 1) st.textContent = steps[++i];
  }, 130);

  fetch("data.json", { cache:"no-store" })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(d => {
      S.data = d;
      S.read = new Set(LS.get("wldd:read", []));
      S.star = new Set(LS.get("wldd:star", []));
      $("#themeLabel").textContent =
        document.documentElement.getAttribute("data-theme") === "ink" ? "Light" : "Dark";
      render();
      wire();
      clearInterval(tick);
      bar.style.width = "100%"; st.textContent = "ready";
      setTimeout(() => $("#boot").classList.add("gone"), 220);
    })
    .catch(err => {
      clearInterval(tick);
      st.textContent = "could not reach the feed";
      bar.style.background = "#ef4674";
      console.error(err);
    });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

})();
