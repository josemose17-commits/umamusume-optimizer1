// The app's shell: the grouped sidebar (collapsible on desktop, a drawer on phones), the header's
// theme toggle (dark by default, light on request), and which page is showing. Layout only: no
// calculations or saved state of the coach live here.
(function (root) {
  "use strict";
  const svg = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    coach: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>'),
    plan: svg('<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>'),
    log: svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'),
    cm: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>'),
    parents: svg('<circle cx="12" cy="5" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M12 7v4M12 11H6v5M12 11h6v5"/>'),
    skillopt: svg('<path d="M12 3l1.8 4.7L18 9.5l-4.2 1.8L12 16l-1.8-4.7L6 9.5l4.2-1.8z"/><path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'),
    pulls: svg('<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M4 13h16M12 9v11M12 9c-2-4-6-4-6-1.5S10 9 12 9c2 0 6 1 6-1.5S14 5 12 9z"/>'),
    guide: svg('<path d="M5 4h9a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z"/><path d="M9 8h5M9 12h5"/>'),
    all: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
    tiers: svg('<path d="M5 20V10M12 20V4M19 20v-7"/>'),
    cards: svg('<rect x="7" y="3" width="12" height="16" rx="2"/><path d="M5 7v12a2 2 0 0 0 2 2h9"/>'),
    trainees: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    data: svg('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>'),
    menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
    lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6M12 17h.01"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  };
  // The sidebar, by what you're doing: playing a career, planning ahead, reading, your own data.
  const NAV = [
    ["Career", [["coach", "Turn-by-turn coach"], ["plan", "Turn plan"], ["log", "Career log"]]],
    ["Planning", [["cm", "CM & decks"], ["parents", "Parents"], ["skillopt", "Skill optimizer"], ["pulls", "Pull planner"]]],
    ["Reference", [["guide", "Scenario guide"], ["all", "All scenarios"], ["tiers", "Tier list"]]],
    ["My Data", [["cards", "Support cards"], ["trainees", "Trainees"], ["data", "Import & backup"]]],
  ];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; };
  const THEME_KEY = "uma-theme-v1", NAV_KEY = "uma-nav-collapsed-v1";
  const doc = root.document && root.document.documentElement;

  // Dark unless you chose light (set before the page draws, so it doesn't flash).
  const applyTheme = (t) => { if (doc) doc.dataset.theme = t === "light" ? "light" : "dark"; };
  if (doc) { applyTheme(store(THEME_KEY)); if (store(NAV_KEY) === "1") doc.classList.add("nav-collapsed"); }

  function navHTML(pages) {
    const has = (id) => !pages || pages.includes(id);
    return NAV.map(([group, items]) => {
      const list = items.filter(([id]) => has(id));
      return list.length ? `<div class="side-group"><div class="side-label">${esc(group)}</div>${list.map(([id, label]) => `<button type="button" class="side-link" data-tab="${id}" title="${esc(label)}">${ICON[id] || ""}<span>${esc(label)}</span></button>`).join("")}</div>` : "";
    }).join("");
  }
  const label = (id) => { for (const [, items] of NAV) for (const [k, l] of items) if (k === id) return l; return ""; };
  const mobile = () => root.matchMedia && root.matchMedia("(max-width: 900px)").matches;
  const closeDrawer = () => doc && doc.classList.remove("nav-open");
  function toggleNav() {
    if (!doc) return;
    if (mobile()) doc.classList.toggle("nav-open");
    else { doc.classList.toggle("nav-collapsed"); store(NAV_KEY, doc.classList.contains("nav-collapsed") ? "1" : "0"); }
  }
  function toggleTheme() {
    const next = doc && doc.dataset.theme === "light" ? "dark" : "light";
    applyTheme(next); store(THEME_KEY, next);
    return next;
  }
  // The page showing: the sidebar's current link and body[data-page] for page-only pieces
  // (the coach's Done dock).
  function setActive(tab) {
    if (!root.document) return;
    root.document.body.dataset.page = tab;
    root.document.querySelectorAll("#sidebar [data-tab]").forEach((b) => { if (b.dataset.tab === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  }
  // Wires the header's menu and theme buttons and the drawer's scrim.
  function init() {
    const $ = (s) => root.document.querySelector(s);
    const nav = $("#navToggle"), theme = $("#themeToggle"), scrim = $("#scrim");
    if (nav) nav.addEventListener("click", toggleNav);
    if (scrim) scrim.addEventListener("click", closeDrawer);
    const paint = () => { if (theme) { const light = doc.dataset.theme === "light"; theme.innerHTML = light ? ICON.moon : ICON.sun; theme.setAttribute("aria-label", light ? "Dark theme" : "Light theme"); theme.title = light ? "Dark theme" : "Light theme"; } };
    if (theme) { theme.addEventListener("click", () => { toggleTheme(); paint(); }); paint(); }
    root.document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
  }

  // Long explanations move behind a (?) next to their section's heading (or in the card's
  // corner when it has none), so a page leads with its controls and numbers. Hover or focus
  // shows it, a click or tap keeps it open; Escape or a click elsewhere closes it. Only plain
  // explanatory paragraphs move: p.mini of 120+ characters (or any p.explain), with no action
  // buttons or fields, nothing the app updates by id, no warning or bold status line.
  // Neighbouring ones, and every one under the same heading, share one (?).
  const FOLD_MIN = 120;
  const isLong = (text) => String(text || "").trim().length >= FOLD_MIN;
  const NOT_IN = "details:not(.panel):not(.deck-adv), table, summary, li, .help-pop, .dock, .settings, .topbar, .stepper";
  function foldable(p) {
    if (!p || p.tagName !== "P") return false;
    const explain = p.classList.contains("explain");
    if (!explain && !(p.classList.length === 1 && p.classList.contains("mini"))) return false;
    if (p.id || p.querySelector("[id], input, select, textarea, label, button:not(.linkish)")) return false;
    if ((!explain && !isLong(p.textContent)) || p.closest(NOT_IN)) return false;
    if (explain) return true;
    let first = p.firstChild;
    while (first && first.nodeType === 3 && !first.textContent.trim()) first = first.nextSibling;
    return !(first && first.nodeType === 1 && /^(B|STRONG)$/.test(first.tagName));
  }
  const BOX = ".panel, details, section";
  const boxOf = (el, scope) => (el && el.parentElement && el.parentElement.closest(BOX)) || scope;
  // The heading a paragraph explains: the last heading before it in its own card.
  function headingFor(p, scope) {
    const box = boxOf(p, scope);
    // A card can name the spot itself (data-help-anchor), e.g. a bar with no heading.
    const spot = [...box.querySelectorAll("[data-help-anchor]")].find((x) => boxOf(x, scope) === box);
    if (spot) return { box, heading: spot };
    let best = null;
    box.querySelectorAll("h2, h3, h4, summary").forEach((h) => {
      if (h.closest(".help-pop")) return;
      const own = h.tagName === "SUMMARY" ? h.parentElement === box : boxOf(h, scope) === box || (h.closest("summary") && h.closest("summary").parentElement === box);
      if (own && (h.compareDocumentPosition(p) & 4)) best = h;
    });
    return { box, heading: best };
  }
  let helpSeq = 0;
  // The (?) and its popover for a heading (or a card's corner), made once and shared.
  function helpFor(heading, box) {
    const d = root.document;
    let btn = heading ? heading.querySelector(":scope > .help-btn") : box.querySelector(":scope > .help-btn.corner");
    if (btn) return d.getElementById(btn.getAttribute("aria-controls"));
    const id = "help-" + (++helpSeq);
    btn = d.createElement("button");
    btn.type = "button";
    btn.className = "help-btn" + (heading ? "" : " corner");
    btn.setAttribute("aria-label", "About this");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", id);
    btn.innerHTML = ICON.help;
    const pop = d.createElement("div");
    pop.className = "help-pop";
    pop.id = id;
    pop.hidden = true;
    pop.setAttribute("role", "note");
    if (heading) {
      heading.appendChild(btn);
      // Outside a <summary> (and its closed <details>), so it can show and its links work.
      const sum = heading.closest("summary");
      const after = sum ? sum.parentElement : heading;
      after.parentNode.insertBefore(pop, after.nextSibling);
    } else {
      box.classList.add("help-corner");
      box.insertBefore(pop, box.firstChild);
      box.insertBefore(btn, box.firstChild);
    }
    return pop;
  }
  function tidy(scope) {
    if (!scope || !scope.querySelectorAll) return 0;
    let n = 0;
    const done = new Set();
    scope.querySelectorAll("p.mini, p.explain").forEach((p) => {
      if (done.has(p) || !foldable(p)) return;
      const group = [p];
      for (let x = p.nextElementSibling; x && foldable(x); x = x.nextElementSibling) group.push(x);
      group.forEach((x) => done.add(x));
      const { box, heading } = headingFor(p, scope);
      const pop = helpFor(heading, box);
      group.forEach((x) => pop.appendChild(x));
      n++;
    });
    return n;
  }

  // ---- The popover and tooltip: placed under (or over) what opened it, inside the screen ----
  function place(anchor, pop) {
    const d = root.document.documentElement, r = anchor.getBoundingClientRect();
    const vw = d.clientWidth, vh = root.innerHeight;
    pop.hidden = false;
    const w = Math.min(pop.classList.contains("tip") ? 260 : 440, vw - 24);
    pop.style.maxWidth = w + "px";
    const pw = Math.min(w, pop.offsetWidth), ph = pop.offsetHeight;
    pop.style.left = Math.round(Math.min(Math.max(12, r.left + r.width / 2 - pw / 2), vw - pw - 12)) + "px";
    let top = r.bottom + 8;
    if (top + ph > vh - 12 && r.top - 8 - ph >= 12) top = r.top - 8 - ph;
    pop.style.top = Math.round(Math.max(12, top)) + "px";
  }
  let open = null, pinned = false, timer = 0, tipEl = null, tipFor = null;
  const popOf = (btn) => root.document.getElementById(btn.getAttribute("aria-controls"));
  function openHelp(btn, pin) {
    const pop = popOf(btn);
    if (!pop) return;
    if (open && open.btn !== btn) closeHelp();
    clearTimeout(timer);
    place(btn, pop);
    btn.setAttribute("aria-expanded", "true");
    open = { btn, pop };
    pinned = !!pin;
  }
  function closeHelp() {
    clearTimeout(timer);
    if (!open) return;
    open.pop.hidden = true;
    open.btn.setAttribute("aria-expanded", "false");
    open = null; pinned = false;
  }
  function showTip(el) {
    const d = root.document;
    if (!tipEl) { tipEl = d.createElement("div"); tipEl.className = "help-pop tip"; tipEl.setAttribute("role", "tooltip"); tipEl.hidden = true; d.body.appendChild(tipEl); }
    tipEl.textContent = el.dataset.tip;
    tipFor = el;
    place(el, tipEl);
  }
  const hideTip = () => { if (tipEl) tipEl.hidden = true; tipFor = null; };
  const finePointer = () => !root.matchMedia || root.matchMedia("(hover: hover)").matches;
  function initHelp() {
    const d = root.document;
    // Capture: a (?) click never reaches the page's own handlers (or toggles a <summary>).
    d.addEventListener("click", (e) => {
      const btn = e.target.closest && e.target.closest(".help-btn");
      if (btn) {
        e.preventDefault(); e.stopPropagation();
        if (open && open.btn === btn && pinned) closeHelp(); else openHelp(btn, true);
        return;
      }
      const tip = e.target.closest && e.target.closest('[data-tip][aria-disabled="true"]');
      if (tip) { e.preventDefault(); e.stopPropagation(); showTip(tip); clearTimeout(timer); timer = setTimeout(hideTip, 2500); return; }
      if (open && !open.pop.contains(e.target)) closeHelp();
    }, true);
    d.addEventListener("mouseover", (e) => {
      if (!finePointer() || !e.target.closest) return;
      const btn = e.target.closest(".help-btn");
      if (btn && !pinned) { clearTimeout(timer); timer = setTimeout(() => openHelp(btn, false), 120); return; }
      if (open && (open.pop.contains(e.target) || open.btn.contains(e.target))) { clearTimeout(timer); return; }
      const tip = e.target.closest("[data-tip]");
      if (tip && tip !== tipFor) showTip(tip);
    });
    d.addEventListener("mouseout", (e) => {
      // Touch screens have no hover: a tapped tip times out instead.
      if (!finePointer() || !e.target.closest) return;
      const to = e.relatedTarget;
      if (open && !pinned && (open.btn.contains(e.target) || open.pop.contains(e.target)) && !(to && (open.btn.contains(to) || open.pop.contains(to)))) { clearTimeout(timer); timer = setTimeout(closeHelp, 180); }
      const tip = e.target.closest("[data-tip]");
      if (tip && !(to && tip.contains(to))) hideTip();
    });
    d.addEventListener("focusin", (e) => {
      const btn = e.target.closest && e.target.closest(".help-btn");
      if (btn && !(open && open.btn === btn)) openHelp(btn, false);
      const tip = e.target.closest && e.target.closest("[data-tip]");
      if (tip) showTip(tip);
    });
    d.addEventListener("focusout", (e) => {
      const to = e.relatedTarget;
      if (open && !pinned && open.btn === e.target && !(to && open.pop.contains(to))) closeHelp();
      if (tipFor === e.target) hideTip();
    });
    d.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (open) open.btn.focus(); closeHelp(); hideTip(); } });
    const follow = () => {
      if (open) { if (!open.btn.isConnected || !open.btn.getClientRects().length) closeHelp(); else place(open.btn, open.pop); }
      if (tipFor) { if (!tipFor.isConnected || !tipFor.getClientRects().length) hideTip(); else place(tipFor, tipEl); }
    };
    root.addEventListener("scroll", follow, { passive: true, capture: true });
    root.addEventListener("resize", follow);
  }
  // Moves what a page draws behind its (?)s, as it draws it (before the browser paints).
  function watchNotes(el) {
    if (!el || !root.MutationObserver) return;
    const obs = new root.MutationObserver(() => { tidy(el); obs.takeRecords(); if (open && !open.btn.isConnected) { open = null; pinned = false; } });
    obs.observe(el, { childList: true, subtree: true });
    tidy(el);
    initHelp();
  }

  const api = { NAV, ICON, navHTML, label, init, setActive, closeDrawer, toggleNav, toggleTheme, FOLD_MIN, isLong, foldable, tidy, watchNotes, closeHelp };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaUI = api;
})(typeof window !== "undefined" ? window : globalThis);
