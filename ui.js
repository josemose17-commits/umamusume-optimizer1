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

  const api = { NAV, ICON, navHTML, label, init, setActive, closeDrawer, toggleNav, toggleTheme };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaUI = api;
})(typeof window !== "undefined" ? window : globalThis);
