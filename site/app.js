/* ═══════════════════════════════════════════════════════════════════
   WLDD PULSE — v2

   Buckets, bucket order and every existing capability are unchanged.
   New in this build:
     · deep links  — every item has a stable URL, so a single card can
                     be sent to someone and it opens on that card
     · share sheet — copy link / copy text / WhatsApp / email / native
     · selection   — tick several cards, send them as one digest
     · density     — comfortable or compact
   ═══════════════════════════════════════════════════════════════════ */
(function () {
"use strict";

/* bucket definitions — reading order. The keys deliberately do not
   match the tab numbers: Experiential is bucket6, Strategic is bucket5
   and always sits last. */
const BUCKETS = [
  { key:"bucket1", n:"01", slug:"mandates",     short:"Mandates & Campaigns",    title:"Mandates &amp;<br>Campaigns",    c:"c1", on:"on1", group:"industry" },
  { key:"bucket2", n:"02", slug:"ma",           short:"M&A",                     title:"Mergers &amp;<br>Acquisitions",  c:"c2", on:"on2", group:"region" },
  { key:"bucket3", n:"03", slug:"launches",     short:"New Products",            title:"New Products<br>&amp; Launches", c:"c3", on:"on3", group:null },
  { key:"bucket4", n:"04", slug:"people",       short:"People Moves",            title:"People<br>Moves",                c:"c4", on:"on4", group:null },
  { key:"bucket6", n:"05", slug:"experiential", short:"Experiential Economy",    title:"Experiential<br>Economy",        c:"c6", on:"on6", group:"category" },
  { key:"bucket5", n:"06", slug:"strategic",    short:"Strategic Insights",      title:"Strategic<br>Insights",          c:"c5", on:"on5", group:null },
];
const BY_KEY = Object.fromEntries(BUCKETS.map(b => [b.key, b]));

const S = { data:null, wi:0, filter:"all", q:"", sub:{}, open:null, cursor:-1,
            read:new Set(), star:new Set(), sel:new Set(), selecting:false, share:null };

const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

const esc = s => String(s == null ? "" : s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
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
  const end = new Date(b.getTime() - 86400000);           // week_end is exclusive
  const l = a.getUTCDate() + " " + MON[a.getUTCMonth()] + " – " + end.getUTCDate() + " " + MON[end.getUTCMonth()];
  return withYear ? l + " " + end.getUTCFullYear() : l;
}
function stamp(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  return days[d.getUTCDay()] + " " + d.getUTCDate() + " " + MON[d.getUTCMonth()];
}

/* ── normalise every bucket shape into one item ───────────────────── */
function norm(raw, bkey, wi) {
  const b = BY_KEY[bkey];
  const o = { bucket:bkey, wi:wi, raw:raw };

  if (bkey === "bucket4") {
    const who  = raw.person || "Someone";
    const role = raw.new_role_title || "a new role";
    const co   = raw.new_company || raw.org || "";
    o.headline = who + " → " + role + (co ? ", " + co : "");
    o.desc = raw.previous_role && !/^not disclosed$/i.test(raw.previous_role)
             ? "Previously: " + raw.previous_role : "";
    o.why = ""; o.group = null; o.fit = ""; o.ref = "";
    o.ents = [];
    if (raw.linkedin_url) o.ents.push({ name:who, url:raw.linkedin_url, kind:"in" });
    if (raw.company_url)  o.ents.push({ name:co || raw.org, url:raw.company_url, kind:"co" });
    o.tag = co || raw.org || "";
  } else if (bkey === "bucket5") {
    o.headline = raw.headline || "";
    o.desc = ""; o.why = raw.insight || ""; o.group = null; o.ents = [];
    o.fit = raw.product_fit || "";
    o.ref = raw.ref_item ? (raw.ref_bucket_label || "") + " — " + raw.ref_item : "";
    o.tag = raw.product_fit || "";
  } else {
    o.headline = raw.headline || "";
    o.desc = raw.description || "";
    o.why  = raw.why_important || "";
    o.group = b.group ? (raw[b.group] || "Other") : null;
    o.fit = ""; o.ref = "";
    o.ents = []
      .concat((raw.companies || []).map(c => ({ name:c.name, url:c.url, kind:"co" })))
      .concat((raw.people || []).map(p => ({ name:p.name, url:p.url || p.linkedin_url, kind:"in" })))
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

function weekItems(wi, bkey) {
  const w = S.data.weeks[wi] || {};
  return (w[bkey] || []).map(r => norm(r, bkey, wi));
}
function allThisWeek() { return BUCKETS.flatMap(b => weekItems(S.wi, b.key)); }

function itemsFor(bkey) {
  const q = S.q.trim().toLowerCase();
  let list;
  if (q) {
    list = [];
    S.data.weeks.forEach((w, i) => (w[bkey] || []).forEach(r => list.push(norm(r, bkey, i))));
    list = list.filter(it => it.hay.includes(q));
  } else {
    list = weekItems(S.wi, bkey);
  }
  if (S.filter === "unread")  list = list.filter(it => !S.read.has(it.id));
  if (S.filter === "starred") list = list.filter(it =>  S.star.has(it.id));
  const sub = S.sub[bkey];
  if (sub) list = list.filter(it => it.group === sub);
  return list;
}

function findItem(id) {
  for (let i = 0; i < S.data.weeks.length; i++)
    for (const b of BUCKETS)
      for (const r of (S.data.weeks[i][b.key] || [])) {
        const it = norm(r, b.key, i);
        if (it.id === id) return it;
      }
  return null;
}

/* ══════════════════════ icons ═══════════════════════════════════ */
const I = {
  star:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3.6l2.6 5.5 6 .9-4.4 4.2 1.1 6-5.3-2.8L6.7 20.2l1-6L3.4 10l6-.9z"/></svg>',
  starF: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3.6l2.6 5.5 6 .9-4.4 4.2 1.1 6-5.3-2.8L6.7 20.2l1-6L3.4 10l6-.9z"/></svg>',
  share: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 15V3M8 7l4-4 4 4"/></svg>',
  tick:  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5L19.5 7"/></svg>',
  link:  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1L11.5 4.5"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.4-1.4"/></svg>',
  text:  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M5 5h14M5 10h14M5 15h9"/></svg>',
  wa:    '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 1 1 12 20zm4.4-5.9c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.6.8-.8 1-.3.2-.5 0a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.6-1.2a.4.4 0 0 0 0-.4L9.4 8c-.2-.4-.3-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11 11 0 0 0 4.3 3.8c1.6.6 2.2.7 3 .6a2.5 2.5 0 0 0 1.7-1.2 2 2 0 0 0 .1-1.2z"/></svg>',
  mail:  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  nat:   '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
};

/* ══════════════════════ render ══════════════════════════════════ */

function renderChrome() {
  const w = S.data.weeks[S.wi];
  const counts = {}; let total = 0;
  BUCKETS.forEach(b => { counts[b.key] = (w[b.key] || []).length; total += counts[b.key]; });

  $("#weekBtnLabel").textContent = weekLabel(w, true);
  $("#heroWeek").textContent = weekLabel(w, true).toUpperCase();
  $("#liveLabel").textContent = "Updated " + stamp(w.updated_at || S.data.updated_at);

  // hero number counts up once
  countTo($("#heroN"), total);

  const all = allThisWeek();
  const read = all.filter(it => S.read.has(it.id)).length;
  const prev = S.data.weeks[S.wi + 1];
  const prevTotal = prev ? BUCKETS.reduce((a, b) => a + (prev[b.key] || []).length, 0) : null;
  const delta = prevTotal == null ? null : total - prevTotal;

  $("#heroStats").innerHTML =
    stat(BUCKETS.length, "buckets") +
    stat(S.star.size, "starred") +
    (delta == null ? "" : stat((delta > 0 ? "+" : "") + delta, "vs last week"));

  // spectrum
  $("#spectrum").innerHTML = BUCKETS.map(b =>
    '<i style="flex:' + Math.max(counts[b.key], 1) + ';background:var(--' + b.c + ')" title="' +
    esc(b.short) + ": " + counts[b.key] + '"></i>').join("");

  // rail
  $("#rail").innerHTML = BUCKETS.map(b =>
    '<a class="rnav" href="#b-' + b.slug + '" data-slug="' + b.slug +
    '" style="--bc:var(--' + b.c + ');--on:var(--' + b.on + ')">' +
    '<i class="rnav-d" aria-hidden="true"></i><span>' + esc(b.short) + '</span>' +
    '<span class="rnav-n">' + counts[b.key] + '</span></a>').join("");

  // tiles
  $("#tiles").innerHTML = BUCKETS.map(b => {
    const list = weekItems(S.wi, b.key);
    const r = list.filter(it => S.read.has(it.id)).length;
    const pct = list.length ? Math.round(r / list.length * 100) : 0;
    let d = "";
    if (prev) {
      const diff = list.length - (prev[b.key] || []).length;
      d = '<span class="tile-d ' + (diff > 0 ? "up" : diff < 0 ? "dn" : "") + '">' +
          (diff > 0 ? "↑" + diff : diff < 0 ? "↓" + Math.abs(diff) : "— level") + "</span>";
    }
    return '<a class="tile" href="#b-' + b.slug + '" data-slug="' + b.slug +
      '" style="--bc:var(--' + b.c + ')">' +
      '<span class="tile-l">' + esc(b.short) + "</span>" +
      '<span class="tile-row"><span class="tile-n" data-n="' + list.length + '">0</span>' + d + "</span>" +
      '<span class="tile-track"><i style="width:' + pct + '%"></i></span></a>';
  }).join("");
  $$(".tile-n").forEach(el => countTo(el, Number(el.dataset.n) || 0));

  // week panel
  const max = Math.max(...S.data.weeks.map(wk => BUCKETS.reduce((a, b) => a + (wk[b.key] || []).length, 0)), 1);
  $("#weekPanel").innerHTML = S.data.weeks.map((wk, i) => {
    const n = BUCKETS.reduce((a, b) => a + (wk[b.key] || []).length, 0);
    return '<button class="wk' + (i === S.wi ? " is-on" : "") + '" role="option" data-wi="' + i +
      '" aria-selected="' + (i === S.wi) + '"><span>' + esc(weekLabel(wk, true)) + "</span>" +
      '<span class="wk-bar"><i style="width:' + Math.round(n / max * 100) + '%"></i></span>' +
      '<span class="wk-n">' + n + "</span></button>";
  }).join("");

  $("#readLabel").textContent = read + " / " + all.length;
  $("#readBar").style.width = all.length ? (read / all.length * 100) + "%" : "0%";
  $("#nUnread").textContent = all.length - read;
  $("#nStar").textContent = S.star.size;
}
const stat = (v, l) => '<span class="hstat"><b>' + esc(String(v)) + "</b><span>" + esc(l) + "</span></span>";

/* numbers roll up once, on arrival — the one piece of kinetic type */
function countTo(el, target) {
  if (!el) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = target; return;
  }
  const t0 = performance.now(), dur = 900;
  (function step(t) {
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = Math.round(target * (1 - Math.pow(1 - k, 4)));
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

function cardHTML(it) {
  const b = BY_KEY[it.bucket];
  const starred = S.star.has(it.id), read = S.read.has(it.id);
  const open = S.open === it.id, sel = S.sel.has(it.id);

  const meta = [];
  if (it.tag && it.bucket !== "bucket5") meta.push(esc(it.tag));
  if (it.src) meta.push(esc(it.src));
  if (S.q && S.data.weeks[it.wi]) meta.push(esc(weekLabel(S.data.weeks[it.wi], false)));
  if (it.date) meta.push(esc(d2(it.date)));

  let body = "";
  if (it.desc || it.why) {
    body += '<div class="body-grid">';
    body += "<div>" + (it.desc ? '<p class="desc">' + esc(it.desc) + "</p>" : "");
    if (it.ents.length) {
      body += '<div class="ents">' + it.ents.map(e => e.url
        ? '<a class="ent" href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(e.name) +
          '<i aria-hidden="true">' + (e.kind === "in" ? "in" : "↗") + "</i></a>"
        : '<span class="ent">' + esc(e.name) + "</span>").join("") + "</div>";
    }
    if (it.deal) body += '<p class="ref">Deal value — ' + esc(it.deal) + "</p>";
    if (it.ref)  body += '<p class="ref">From ' + esc(it.ref) + "</p>";
    if (it.url)  body += '<a class="src" href="' + esc(it.url) + '" target="_blank" rel="noopener">' +
                         (it.src ? "Read it on " + esc(it.src) : "Read the source") + ' <span aria-hidden="true">↗</span></a>';
    body += "</div>";
    body += it.why ? '<div class="why"><span class="why-l">' +
            (it.bucket === "bucket5" ? "The play" : "Why it matters") +
            '</span><p>' + esc(it.why) + "</p></div>" : "<div></div>";
    body += "</div>";
  } else {
    if (it.ents.length) {
      body += '<div class="ents">' + it.ents.map(e => e.url
        ? '<a class="ent" href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(e.name) +
          '<i aria-hidden="true">' + (e.kind === "in" ? "in" : "↗") + "</i></a>"
        : '<span class="ent">' + esc(e.name) + "</span>").join("") + "</div>";
    }
    if (it.url) body += '<a class="src" href="' + esc(it.url) + '" target="_blank" rel="noopener">' +
                        (it.src ? "Read it on " + esc(it.src) : "Read the source") + ' <span aria-hidden="true">↗</span></a>';
  }

  return '<article class="card' + (read ? " is-read" : "") + (open ? " is-open" : "") +
    (sel ? " is-sel" : "") + '" id="c-' + it.id + '" data-id="' + it.id + '">' +
    '<button class="card-pick js-pick" aria-label="Select this item" aria-pressed="' + sel + '">' + I.tick + "</button>" +
    '<div class="card-head js-open" role="button" tabindex="0" aria-expanded="' + open + '">' +
      '<div class="card-main">' +
        (it.fit ? '<span class="card-fit">' + esc(it.fit) + "</span>" : "") +
        '<h3 class="card-h">' + esc(it.headline) + "</h3>" +
        (meta.length ? '<p class="card-meta">' +
          meta.join('<span class="dot">·</span>') + "</p>" : "") +
      "</div>" +
      '<div class="card-acts">' +
        '<button class="act js-share" aria-label="Share this item">' + I.share + "</button>" +
        '<button class="act js-star' + (starred ? " on" : "") + '" aria-pressed="' + starred +
          '" aria-label="' + (starred ? "Unstar" : "Star") + '">' + (starred ? I.starF : I.star) + "</button>" +
      "</div>" +
    "</div>" +
    '<div class="card-body">' + body + "</div></article>";
}

function renderBuckets() {
  const host = $("#buckets");
  let any = false;

  host.innerHTML = BUCKETS.map(b => {
    const list = itemsFor(b.key);
    if (list.length) any = true;

    let chips = "";
    if (b.group) {
      const base = S.q
        ? S.data.weeks.flatMap((w, i) => (w[b.key] || []).map(r => norm(r, b.key, i)))
            .filter(it => it.hay.includes(S.q.trim().toLowerCase()))
        : weekItems(S.wi, b.key);
      const g = {};
      base.forEach(it => { g[it.group] = (g[it.group] || 0) + 1; });
      const keys = Object.keys(g).sort((x, y) => g[y] - g[x]);
      if (keys.length > 1) {
        chips = '<div class="chips">' +
          '<button class="chip' + (!S.sub[b.key] ? " is-on" : "") + '" data-sub="" data-bk="' + b.key +
            '">All<span class="chip-n">' + base.length + "</span></button>" +
          keys.map(k => '<button class="chip' + (S.sub[b.key] === k ? " is-on" : "") +
            '" data-sub="' + esc(k) + '" data-bk="' + b.key + '">' + esc(k) +
            '<span class="chip-n">' + g[k] + "</span></button>").join("") + "</div>";
      }
    }

    let inner;
    if (b.group && !S.sub[b.key] && list.length) {
      const g = {};
      list.forEach(it => { (g[it.group] = g[it.group] || []).push(it); });
      inner = Object.keys(g).sort((x, y) => g[y].length - g[x].length).map(k =>
        '<div class="grp"><h3>' + esc(k) + '</h3><span class="grp-n">' + g[k].length +
        '</span><span class="grp-rule"></span></div>' + g[k].map(cardHTML).join("")).join("");
    } else {
      inner = list.map(cardHTML).join("");
    }
    if (!list.length) inner = '<p class="empty">Nothing here under the current filters</p>';

    return '<section class="bucket" id="b-' + b.slug + '" data-bk="' + b.key +
      '" style="--bc:var(--' + b.c + ');--on:var(--' + b.on + ')">' +
      '<div class="band">' +
        '<span class="band-ghost" aria-hidden="true">' + b.n + "</span>" +
        '<div class="wrap band-in">' +
          '<div class="band-top"><span class="band-no">BUCKET ' + b.n + '</span><span class="band-rule"></span></div>' +
          "<h2>" + b.title + "</h2>" +
          '<div class="band-foot">' +
            '<span class="band-count">' + list.length + " item" + (list.length === 1 ? "" : "s") + "</span>" +
            '<button class="band-act js-copy-sec" data-bk="' + b.key + '">' + I.share + " Share this section</button>" +
          "</div>" +
        "</div>" +
      "</div>" +
      '<div class="wrap"><div class="list">' + chips + inner + "</div></div>" +
    "</section>";
  }).join("");

  $$(".bucket").forEach(sec => {
    $$(".card", sec).forEach((c, i) => c.style.setProperty("--d", Math.min(i * 28, 300) + "ms"));
  });

  $("#noRes").hidden = any;
  sweep(); setTimeout(sweep, 500);
  onScroll();
}

function render() { renderChrome(); renderBuckets(); }

/* ══════════════════════ formatting & share ══════════════════════ */

function itemLink(it) {
  return location.origin + location.pathname + "#i=" + it.id;
}
function fmtItem(it, n) {
  const L = [];
  L.push((n ? n + ". " : "") + it.headline);
  if (it.why)       L.push("", (it.bucket === "bucket5" ? "The play: " : "Why it matters: ") + it.why);
  else if (it.desc) L.push("", it.desc);
  const s = [it.src, d2(it.date)].filter(Boolean).join(" · ");
  if (s) L.push("", s);
  if (it.url) L.push(it.url);
  return L.join("\n");
}
function sign() { return "— WLDD Pulse · " + weekLabel(S.data.weeks[S.wi], true); }

function copy(text, msg) {
  const done = () => toast(msg || "Copied");
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done, () => fallback(text, done));
  } else fallback(text, done);
}
function fallback(text, done) {
  const t = document.createElement("textarea");
  t.value = text; t.setAttribute("readonly", "");
  t.style.cssText = "position:fixed;top:-2000px;opacity:0";
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
  toastT = setTimeout(() => { el.hidden = true; }, 2400);
}

/* The share sheet is the point of the whole build: one card, out of
   here and into someone's hands, in one tap. */
function openShare(payload) {
  S.share = payload;
  $("#shareSub").textContent = payload.sub;
  $("#sharePrev").textContent = payload.text;

  const enc = encodeURIComponent;
  const waText = payload.text + (payload.link ? "\n\n" + payload.link : "");
  const buttons = [
    payload.link ? { k:"link", t:"Copy link",  i:I.link, c:"var(--c3)", on:"#fff" } : null,
    { k:"text", t:"Copy as text", i:I.text, c:"var(--ink)", on:"var(--paper)" },
    { k:"wa",   t:"WhatsApp",     i:I.wa,   c:"#25D366",    on:"#04230f" },
    { k:"mail", t:"Email",        i:I.mail, c:"var(--c6)",  on:"#fff" },
    navigator.share ? { k:"nat", t:"More…", i:I.nat, c:"var(--c5)", on:"var(--ink)" } : null,
  ].filter(Boolean);

  $("#shareGrid").innerHTML = buttons.map(b =>
    '<button class="sbtn js-s" data-k="' + b.k + '" style="--sc:' + b.c + ';--son:' + b.on + '">' +
    b.i + "<span>" + b.t + "</span></button>").join("");

  $("#shareGrid").dataset.wa = "https://wa.me/?text=" + enc(waText);
  $("#shareGrid").dataset.mail = "mailto:?subject=" + enc(payload.subject) + "&body=" + enc(waText);
  openSheet("#shareSheet");
}

function runShare(k) {
  const p = S.share; if (!p) return;
  const g = $("#shareGrid");
  if (k === "link") { copy(p.link, "Link copied — paste it to your team"); closeSheets(); }
  else if (k === "text") { copy(p.text + (p.link ? "\n\n" + p.link : "") + "\n\n" + sign(), "Copied"); closeSheets(); }
  else if (k === "wa")   { window.open(g.dataset.wa, "_blank", "noopener"); closeSheets(); }
  else if (k === "mail") { window.location.href = g.dataset.mail; closeSheets(); }
  else if (k === "nat" && navigator.share) {
    navigator.share({ title:p.subject, text:p.text, url:p.link || undefined })
      .then(() => closeSheets()).catch(() => {});
  }
}

function shareItem(id) {
  const it = findItem(id); if (!it) return;
  markRead(id, true);
  openShare({
    sub: BY_KEY[it.bucket].short + " · " + (it.src || "—") + (it.date ? " · " + d2(it.date) : ""),
    subject: "WLDD Pulse — " + it.headline,
    text: fmtItem(it),
    link: itemLink(it),
  });
}
function shareSection(bkey) {
  const list = itemsFor(bkey);
  if (!list.length) return toast("Nothing to share here");
  const b = BY_KEY[bkey];
  openShare({
    sub: b.short + " · " + list.length + " items · " + weekLabel(S.data.weeks[S.wi], true),
    subject: "WLDD Pulse — " + b.short,
    text: "WLDD PULSE · " + b.short.toUpperCase() + "\n" + weekLabel(S.data.weeks[S.wi], true) +
          "\n\n" + list.map((it, i) => fmtItem(it, i + 1)).join("\n\n"),
    link: "",
  });
}
function shareSelection() {
  const list = Array.from(S.sel).map(findItem).filter(Boolean);
  if (!list.length) return toast("Nothing selected");
  openShare({
    sub: list.length + " hand-picked items · " + weekLabel(S.data.weeks[S.wi], true),
    subject: "WLDD Pulse — " + list.length + " things worth your attention",
    text: "WLDD PULSE — worth your attention\n" + weekLabel(S.data.weeks[S.wi], true) +
          "\n\n" + list.map((it, i) => fmtItem(it, i + 1)).join("\n\n"),
    link: "",
  });
}
function shareWeek() {
  const parts = []; let n = 0;
  BUCKETS.forEach(b => {
    const list = weekItems(S.wi, b.key);
    if (!list.length) return;
    n += list.length;
    parts.push("▌" + b.short.toUpperCase() + " (" + list.length + ")\n\n" +
               list.map((it, i) => fmtItem(it, i + 1)).join("\n\n"));
  });
  openShare({
    sub: "The whole week · " + n + " items",
    subject: "WLDD Pulse — " + weekLabel(S.data.weeks[S.wi], true),
    text: "WLDD PULSE · " + weekLabel(S.data.weeks[S.wi], true) + "\n" + n + " things worth knowing\n\n" +
          parts.join("\n\n\n"),
    link: "",
  });
}
function shareStarred() {
  const list = Array.from(S.star).map(findItem).filter(Boolean);
  if (!list.length) return toast("Nothing starred yet");
  openShare({
    sub: list.length + " starred · " + weekLabel(S.data.weeks[S.wi], true),
    subject: "WLDD Pulse — starred",
    text: "WLDD PULSE — starred\n" + weekLabel(S.data.weeks[S.wi], true) + "\n\n" +
          list.map((it, i) => fmtItem(it, i + 1)).join("\n\n"),
    link: "",
  });
}

/* ══════════════════════ state ═══════════════════════════════════ */

function markRead(id, v) {
  if (v) S.read.add(id); else S.read.delete(id);
  LS.set("wldd:read", Array.from(S.read));
  const el = $("#c-" + id);
  if (el) el.classList.toggle("is-read", v);
  refreshCounts();
}
function toggleStar(id) {
  const on = !S.star.has(id);
  if (on) S.star.add(id); else S.star.delete(id);
  LS.set("wldd:star", Array.from(S.star));
  const btn = $("#c-" + id + " .js-star");
  if (btn) {
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.innerHTML = on ? I.starF : I.star;
  }
  refreshCounts();
  if (S.filter === "starred") renderBuckets();
}
function togglePick(id) {
  const on = !S.sel.has(id);
  if (on) S.sel.add(id); else S.sel.delete(id);
  const el = $("#c-" + id);
  if (el) {
    el.classList.toggle("is-sel", on);
    const p = $(".js-pick", el);
    if (p) p.setAttribute("aria-pressed", String(on));
  }
  const d = $("#dock");
  d.hidden = S.sel.size === 0;
  $("#dockN").textContent = S.sel.size;
}
function refreshCounts() {
  const all = allThisWeek();
  const read = all.filter(it => S.read.has(it.id)).length;
  $("#readLabel").textContent = read + " / " + all.length;
  $("#readBar").style.width = all.length ? (read / all.length * 100) + "%" : "0%";
  $("#nUnread").textContent = all.length - read;
  $("#nStar").textContent = S.star.size;
  BUCKETS.forEach(b => {
    const list = weekItems(S.wi, b.key);
    const r = list.filter(x => S.read.has(x.id)).length;
    const bar = $('.tile[data-slug="' + b.slug + '"] .tile-track i');
    if (bar) bar.style.width = (list.length ? r / list.length * 100 : 0) + "%";
  });
}

function toggleOpen(id) {
  const was = S.open === id;
  if (S.open) {
    const p = $("#c-" + S.open);
    if (p) { p.classList.remove("is-open"); const h = $(".card-head", p); if (h) h.setAttribute("aria-expanded", "false"); }
  }
  S.open = was ? null : id;
  if (!was) {
    const el = $("#c-" + id);
    if (el) {
      el.classList.add("is-open");
      const h = $(".card-head", el); if (h) h.setAttribute("aria-expanded", "true");
      markRead(id, true);
      requestAnimationFrame(() => el.scrollIntoView({ block:"nearest", behavior:"smooth" }));
    }
  }
}

/* ══════════════════════ deep links ══════════════════════════════
   A card shared with the team has to open on that card. The hash
   carries the item id; on load (and on hashchange) we find which
   week it belongs to, switch to it, open it and flash it.          */
function openFromHash(scroll) {
  const m = /^#i=([a-z0-9]+)$/i.exec(location.hash || "");
  if (!m) return false;
  const id = m[1];
  const it = findItem(id);
  if (!it) { toast("That item is no longer in the feed"); return false; }
  if (it.wi !== S.wi) { S.wi = it.wi; S.sub = {}; S.filter = "all";
    $$(".seg").forEach(s => s.classList.toggle("is-on", s.dataset.filter === "all")); render(); }
  S.open = id;
  renderBuckets();
  const el = $("#c-" + id);
  if (el) {
    el.classList.add("is-open", "is-target");
    const sec = el.closest(".bucket"); if (sec) sec.classList.add("seen");
    if (scroll !== false) setTimeout(() => el.scrollIntoView({ block:"center", behavior:"smooth" }), 80);
    setTimeout(() => el.classList.remove("is-target"), 2600);
    markRead(id, true);
  }
  return true;
}

/* ══════════════════════ nav ═════════════════════════════════════ */

function restAt(el) {
  const pad = parseInt(getComputedStyle(document.documentElement).scrollPaddingTop, 10) || 130;
  let y = 0;
  for (let n = el; n; n = n.offsetParent) y += n.offsetTop;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return Math.max(0, Math.min(max, Math.round(y - pad)));
}
function jump(slug) {
  const el = $("#b-" + slug);
  if (el) window.scrollTo({ top:restAt(el), behavior:"smooth" });
}
function setWeek(i) {
  S.wi = i; S.open = null; S.sub = {}; S.cursor = -1;
  $("#weekPanel").hidden = true;
  $("#weekBtn").setAttribute("aria-expanded", "false");
  render();
  window.scrollTo({ top:0, behavior:"smooth" });
}

let lastAcc = "";
function onScroll() {
  const doc = document.documentElement;
  const max = doc.scrollHeight - doc.clientHeight;
  const bar = $("#barProg");
  if (bar) bar.style.width = (max > 0 ? Math.min(1, doc.scrollTop / max) * 100 : 0) + "%";

  /* must clear scroll-padding-top, or a section parked exactly at its
     resting place reads as "not reached yet" and the rail lags a section */
  const stuck = (parseInt(getComputedStyle(doc).scrollPaddingTop, 10) || 126) + 8;
  let cur = null;
  $$(".bucket").forEach(sec => { if (sec.getBoundingClientRect().top <= stuck) cur = sec; });
  const b = cur ? BY_KEY[cur.dataset.bk] : null;
  const acc = b ? "var(--" + b.c + ")" : "var(--c1)";
  if (acc !== lastAcc) { lastAcc = acc; doc.style.setProperty("--acc", acc); }
  $$(".rnav").forEach(el => {
    const on = b && el.dataset.slug === b.slug;
    el.classList.toggle("is-here", !!on);
    if (on) el.setAttribute("aria-current", "true"); else el.removeAttribute("aria-current");
  });
}
let rafQ = false;
function queueScroll() {
  if (rafQ) return; rafQ = true;
  requestAnimationFrame(() => { rafQ = false; onScroll(); });
}
/* plain geometry on the scroll event — these classes gate whether
   content is VISIBLE, so they must not depend on an observer that the
   browser is free to throttle while the tab is backgrounded */
function sweep() {
  const h = window.innerHeight || 800;
  $$(".bucket").forEach(e => {
    if (!e.classList.contains("seen") && e.getBoundingClientRect().top < h * 0.94) e.classList.add("seen");
  });
}

/* ══════════════════════ sheets ══════════════════════════════════ */
function openSheet(sel) {
  $$(".sheet").forEach(s => { s.hidden = true; });
  $("#scrim").hidden = false;
  $(sel).hidden = false;
  const inp = $("input", $(sel));
  if (inp) setTimeout(() => inp.focus(), 30);
}
function closeSheets() {
  $$(".sheet").forEach(s => { s.hidden = true; });
  $("#scrim").hidden = true;
}

function palItems() {
  const out = [];
  BUCKETS.forEach(b => out.push({ t:b.short, s:"Bucket " + b.n, c:"var(--" + b.c + ")", go:() => jump(b.slug) }));
  S.data.weeks.forEach((w, i) => out.push({ t:weekLabel(w, true), s:"Week", c:"var(--ink-3)", go:() => setWeek(i) }));
  const inds = new Set();
  (S.data.weeks[S.wi].bucket1 || []).forEach(r => r.industry && inds.add(r.industry));
  inds.forEach(k => out.push({ t:k, s:"Industry", c:"var(--c1)",
    go:() => { S.sub.bucket1 = k; renderBuckets(); jump("mandates"); } }));
  out.push({ t:"Share the full week", s:"Action", c:"var(--c5)", go:shareWeek });
  out.push({ t:"Share everything starred", s:"Action", c:"var(--c2)", go:shareStarred });
  out.push({ t:"Switch theme", s:"Action", c:"var(--c3)", go:flipTheme });
  out.push({ t:"Keyboard shortcuts", s:"Action", c:"var(--c4)", go:() => openSheet("#keysSheet") });
  return out;
}
let palCache = [], palSel = 0;
function buildPal(q) {
  const all = palItems();
  palCache = q ? all.filter(x => (x.t + " " + x.s).toLowerCase().includes(q.toLowerCase())) : all;
  palSel = 0;
  $("#palList").innerHTML = palCache.map((x, i) =>
    '<button class="pal' + (i === 0 ? " is-on" : "") + '" data-i="' + i + '" role="option">' +
    '<i class="pal-d" style="background:' + x.c + '"></i><span>' + esc(x.t) + "</span><small>" +
    esc(x.s) + "</small></button>").join("");
}
function palMove(d) {
  if (!palCache.length) return;
  palSel = (palSel + d + palCache.length) % palCache.length;
  $$(".pal").forEach((el, i) => el.classList.toggle("is-on", i === palSel));
  const el = $$(".pal")[palSel]; if (el) el.scrollIntoView({ block:"nearest" });
}
function palRun() { const x = palCache[palSel]; if (x) { closeSheets(); x.go(); } }

function flipTheme() {
  const now = document.documentElement.getAttribute("data-theme") === "night" ? "paper" : "night";
  document.documentElement.setAttribute("data-theme", now);
  LS.set("wldd:theme", now);
  $("#themeLabel").textContent = now === "night" ? "Day" : "Night";
  $('meta[name="theme-color"]').setAttribute("content", now === "night" ? "#111014" : "#F6F3EC");
}
function flipDensity() {
  const now = document.documentElement.getAttribute("data-density") === "compact" ? "comfortable" : "compact";
  document.documentElement.setAttribute("data-density", now);
  LS.set("wldd:density", now);
  toast(now === "compact" ? "Compact" : "Comfortable");
}

/* ══════════════════════ keyboard ════════════════════════════════ */
function cards() { return $$(".card"); }
function moveCursor(d) {
  const c = cards(); if (!c.length) return;
  S.cursor = Math.max(0, Math.min(c.length - 1, S.cursor + d));
  const el = c[S.cursor];
  const h = $(".card-head", el); if (h) h.focus({ preventScroll:true });
  el.scrollIntoView({ block:"center", behavior:"smooth" });
}
function cursorId() {
  const c = cards();
  if (S.cursor >= 0 && c[S.cursor]) return c[S.cursor].dataset.id;
  const a = document.activeElement && document.activeElement.closest(".card");
  return a ? a.dataset.id : null;
}

/* ══════════════════════ wiring ══════════════════════════════════ */
function wire() {
  document.addEventListener("click", e => {
    const t = e.target;

    const sb = t.closest(".js-s");
    if (sb) { e.preventDefault(); runShare(sb.dataset.k); return; }

    const pick = t.closest(".js-pick");
    if (pick) { e.preventDefault(); e.stopPropagation(); togglePick(pick.closest(".card").dataset.id); return; }

    const sh = t.closest(".js-share");
    if (sh) { e.preventDefault(); e.stopPropagation(); shareItem(sh.closest(".card").dataset.id); return; }

    const st = t.closest(".js-star");
    if (st) { e.preventDefault(); e.stopPropagation(); toggleStar(st.closest(".card").dataset.id); return; }

    const head = t.closest(".js-open");
    if (head && !t.closest("a")) {
      e.preventDefault();
      const id = head.closest(".card").dataset.id;
      if (S.selecting) togglePick(id); else toggleOpen(id);
      return;
    }

    const sec = t.closest(".js-copy-sec");
    if (sec) { e.preventDefault(); shareSection(sec.dataset.bk); return; }

    const chip = t.closest(".chip");
    if (chip) {
      e.preventDefault();
      S.sub[chip.dataset.bk] = chip.dataset.sub || null;
      renderBuckets();
      const s = $("#b-" + BY_KEY[chip.dataset.bk].slug);
      if (s) window.scrollTo({ top:restAt(s), behavior:"smooth" });
      return;
    }

    const seg = t.closest(".seg");
    if (seg) {
      $$(".seg").forEach(s => s.classList.remove("is-on"));
      seg.classList.add("is-on");
      S.filter = seg.dataset.filter; S.open = null; S.cursor = -1;
      renderBuckets(); return;
    }

    const wk = t.closest(".wk");
    if (wk) { setWeek(Number(wk.dataset.wi)); return; }

    const pal = t.closest(".pal");
    if (pal) { palSel = Number(pal.dataset.i); palRun(); return; }

    const nav = t.closest(".rnav") || t.closest(".tile");
    if (nav) { e.preventDefault(); jump(nav.dataset.slug); return; }

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

  $("#themeBtn").addEventListener("click", flipTheme);
  $("#densityBtn").addEventListener("click", flipDensity);
  $("#paletteBtn").addEventListener("click", () => { openSheet("#palette"); buildPal(""); });
  $("#searchBtn").addEventListener("click", () => openSheet("#searchSheet"));
  $("#searchClose").addEventListener("click", closeSheets);
  $("#shareClose").addEventListener("click", closeSheets);
  $("#keysClose").addEventListener("click", closeSheets);
  $("#flagClose").addEventListener("click", closeSheets);
  $("#scrim").addEventListener("click", closeSheets);
  $("#copyWeek").addEventListener("click", shareWeek);
  $("#copyStar").addEventListener("click", shareStarred);
  $("#dockShare").addEventListener("click", shareSelection);
  $("#dockClear").addEventListener("click", () => {
    S.sel.clear(); $("#dock").hidden = true;
    $$(".card.is-sel").forEach(c => c.classList.remove("is-sel"));
  });

  $("#selectBtn").addEventListener("click", () => {
    S.selecting = !S.selecting;
    document.body.classList.toggle("selecting", S.selecting);
    $("#selectBtn").setAttribute("aria-pressed", String(S.selecting));
    $("#selectBtn").textContent = S.selecting ? "Done selecting" : "Select items";
    if (!S.selecting) {
      S.sel.clear(); $("#dock").hidden = true;
      $$(".card.is-sel").forEach(c => c.classList.remove("is-sel"));
    } else toast("Tick the cards you want to send");
  });

  $("#flagBtn").addEventListener("click", () => {
    const f = (S.data.weeks[S.wi] || {}).flagged || {};
    const rows = [];
    Object.keys(f).forEach(k => (f[k] || []).forEach(s =>
      rows.push({ b:BY_KEY[k] ? BY_KEY[k].short : k, s })));
    $("#flagList").innerHTML = rows.length
      ? rows.map(r => "<p><b>" + esc(r.b) + "</b>" + esc(r.s) + "</p>").join("")
      : "<p>Everything resolved this week.</p>";
    openSheet("#flagSheet");
  });

  $("#clearAll").addEventListener("click", () => {
    S.q = ""; S.filter = "all"; S.sub = {};
    $("#searchInput").value = "";
    $$(".seg").forEach(s => s.classList.toggle("is-on", s.dataset.filter === "all"));
    renderBuckets();
  });

  let sT;
  $("#searchInput").addEventListener("input", e => {
    const v = e.target.value;
    clearTimeout(sT);
    sT = setTimeout(() => {
      S.q = v; S.open = null; S.cursor = -1;
      renderBuckets();
      const n = $$(".card").length;
      $("#searchHint").textContent = v
        ? n + (n === 1 ? " item" : " items") + " across all weeks — press esc to see them"
        : "Type to search all 20 weeks.";
    }, 160);
  });
  $("#searchInput").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); closeSheets(); }
  });

  $("#palInput").addEventListener("input", e => buildPal(e.target.value));
  $("#palInput").addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); palMove(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); palMove(-1); }
    else if (e.key === "Enter") { e.preventDefault(); palRun(); }
  });

  document.addEventListener("keydown", e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);

    if (e.key === "Escape") {
      if (!$("#scrim").hidden) { closeSheets(); return; }
      if (!$("#weekPanel").hidden) { $("#weekPanel").hidden = true; return; }
      if (S.open) { toggleOpen(S.open); return; }
      if (typing) { e.target.blur(); return; }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault(); openSheet("#palette"); buildPal(""); return;
    }
    if (typing) return;

    if (e.key === "/") { e.preventDefault(); openSheet("#searchSheet"); return; }
    if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); moveCursor(1); return; }
    if (e.key === "ArrowUp"   || e.key === "k") { e.preventDefault(); moveCursor(-1); return; }
    if (e.key === "Enter") { const id = cursorId(); if (id) { e.preventDefault(); toggleOpen(id); } return; }
    const L = e.key.toLowerCase();
    if (L === "c") { const id = cursorId(); if (id) { e.preventDefault(); const it = findItem(id);
      if (it) copy(fmtItem(it) + "\n\n" + itemLink(it) + "\n\n" + sign(), "Copied"); markRead(id, true); } return; }
    if (L === "s") { const id = cursorId(); if (id) { e.preventDefault(); toggleStar(id); } return; }
    if (L === "x") { const id = cursorId(); if (id) { e.preventDefault(); togglePick(id); } return; }
    if (e.key === "?") { openSheet("#keysSheet"); return; }
    if (/^[1-6]$/.test(e.key)) { jump(BUCKETS[Number(e.key) - 1].slug); return; }
  });

  window.addEventListener("scroll", () => { sweep(); queueScroll(); }, { passive:true });
  window.addEventListener("resize", () => { sweep(); queueScroll(); }, { passive:true });
  window.addEventListener("hashchange", () => openFromHash(true));

  document.addEventListener("focusin", e => {
    const c = e.target.closest && e.target.closest(".card");
    if (c) S.cursor = cards().indexOf(c);
  });
}

/* ══════════════════════ boot ════════════════════════════════════ */
function boot() {
  const bar = $("#bootBar"), st = $("#bootStatus");
  const steps = ["opening the week", "sorting six buckets", "resolving entities", "ready"];
  let p = 0, i = 0;
  const tick = setInterval(() => {
    p = Math.min(94, p + 9 + Math.random() * 13);
    bar.style.width = p + "%";
    if (p > (i + 1) * 23 && i < steps.length - 1) st.textContent = steps[++i];
  }, 140);

  fetch("/data.json", { cache:"no-store" })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(d => {
      S.data = d;
      S.read = new Set(LS.get("wldd:read", []));
      S.star = new Set(LS.get("wldd:star", []));
      $("#themeLabel").textContent =
        document.documentElement.getAttribute("data-theme") === "night" ? "Day" : "Night";
      render();
      wire();
      clearInterval(tick);
      bar.style.width = "100%"; st.textContent = "ready";
      setTimeout(() => {
        $("#boot").classList.add("gone");
        if (!openFromHash(true)) sweep();
      }, 260);
    })
    .catch(err => {
      clearInterval(tick);
      st.textContent = "could not reach the feed";
      bar.style.background = "var(--c6)";
      console.error(err);
    });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

})();
