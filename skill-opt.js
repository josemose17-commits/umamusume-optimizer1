// The Skill optimizer tab's pure parts: a finished uma's skill shop for one CM or League of Heroes
// cup, its quick course-chart plan, share links and pasted skill lists. The page (app.js) adds
// the inputs and the paired race check (race-skills.js).
(function (root) {
  const B = root.UmaSkillBudget || (typeof require !== "undefined" ? require("./skill-budget.js") : null);
  const STATS = ["speed", "stamina", "power", "guts", "wisdom"];
  const STYLES = ["Nige", "Senkou", "Sasi", "Oikomi"];
  const MOODS = ["-2", "-1", "0", "1", "2"];
  const GRADES = "GFEDCBAS";
  const clampInt = (x, lo, hi, d) => { const n = Math.floor(+x); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

  // A saved or shared build, cleaned: unknown fields dropped, numbers in range.
  function clean(b) {
    b = b && typeof b === "object" ? b : {};
    const out = { cup: typeof b.cup === "string" ? b.cup.slice(0, 16) : "", style: STYLES.includes(b.style) ? b.style : "Senkou",
      tid: b.tid ? String(b.tid).replace(/\D/g, "").slice(0, 8) : "", stats: {}, apt: {}, mood: MOODS.includes(String(b.mood)) ? String(b.mood) : "0",
      uniqueLv: String(clampInt(b.uniqueLv, 1, 6, 1)), sp: b.sp === "" || b.sp == null ? "" : String(clampInt(b.sp, 0, 20000, 0)),
      fast: !!b.fast, skills: [], goal: b.goal === "win" ? "win" : "length",
      strength: ["weaker", "equal", "stronger"].includes(b.strength) ? b.strength : "equal", mix: null, team: [] };
    // Rivals by running style for the full-field check (null: the cup's default spread).
    if (b.mix && typeof b.mix === "object") {
      const mix = {}; let n = 0;
      ["Nige", "Senkou", "Sasi", "Oikomi"].forEach((k) => { mix[k] = clampInt(b.mix[k], 0, 17, 0); n += mix[k]; });
      if (n >= 1 && n <= 17) out.mix = mix;
    }
    // Teammates: saved builds' codes (at most two).
    (Array.isArray(b.team) ? b.team : []).forEach((c) => { if (typeof c === "string" && c.length < 4000 && out.team.length < 2) out.team.push(c); });
    STATS.forEach((s) => { const v = b.stats && b.stats[s]; if (v !== "" && v != null && Number.isFinite(+v)) out.stats[s] = String(clampInt(v, 1, 3000, 1)); });
    ["distanceAptitude", "surfaceAptitude", "strategyAptitude"].forEach((k) => { const g = b.apt && b.apt[k]; if (g && GRADES.includes(g) && g.length === 1) out.apt[k] = g; });
    const seen = new Set();
    (Array.isArray(b.skills) ? b.skills : []).forEach((x) => {
      const id = x && String(x.id).replace(/\D/g, "");
      if (!id || seen.has(id) || out.skills.length >= 120) return;
      seen.add(id);
      out.skills.push({ id, hint: clampInt(x.hint, 0, 5, 0), have: !!x.have });
    });
    return out;
  }

  // Share links: a compact array in base64url, after #so=.
  function b64(s) {
    const bytes = typeof TextEncoder !== "undefined" ? new TextEncoder().encode(s) : Buffer.from(s, "utf8");
    let bin = ""; bytes.forEach((c) => { bin += String.fromCharCode(c); });
    return (typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function unb64(s) {
    const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
    const bin = typeof atob !== "undefined" ? atob(pad) : Buffer.from(pad, "base64").toString("binary");
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return typeof TextDecoder !== "undefined" ? new TextDecoder().decode(bytes) : Buffer.from(bytes).toString("utf8");
  }
  function encode(build) {
    const b = clean(build);
    return b64(JSON.stringify([1, b.cup, b.style, b.tid, STATS.map((s) => b.stats[s] || ""), [b.apt.distanceAptitude || "", b.apt.surfaceAptitude || "", b.apt.strategyAptitude || ""],
      b.mood, b.uniqueLv, b.sp, b.fast ? 1 : 0, b.skills.map((x) => x.id + "." + x.hint + (x.have ? "h" : "")),
      b.goal === "win" ? 1 : 0, b.strength, b.mix ? ["Nige", "Senkou", "Sasi", "Oikomi"].map((k) => b.mix[k]) : 0]));
  }
  function decode(code) {
    let a;
    try { a = JSON.parse(unb64(String(code || "").trim())); } catch (e) { return null; }
    if (!Array.isArray(a) || a[0] !== 1) return null;
    const stats = {}, apt = {};
    STATS.forEach((s, i) => { if (a[4] && a[4][i]) stats[s] = a[4][i]; });
    ["distanceAptitude", "surfaceAptitude", "strategyAptitude"].forEach((k, i) => { if (a[5] && a[5][i]) apt[k] = a[5][i]; });
    const skills = (Array.isArray(a[10]) ? a[10] : []).map((t) => { const m = /^(\d+)\.([0-5])(h?)$/.exec(String(t)); return m ? { id: m[1], hint: +m[2], have: !!m[3] } : null; }).filter(Boolean);
    const mix = Array.isArray(a[13]) ? { Nige: a[13][0], Senkou: a[13][1], Sasi: a[13][2], Oikomi: a[13][3] } : null;
    return clean({ cup: a[1], style: a[2], tid: a[3], stats, apt, mood: a[6], uniqueLv: a[7], sp: a[8], fast: !!a[9], skills, goal: a[11] ? "win" : "length", strength: a[12], mix });
  }

  // Skill names as typed or copied: case, spacing and punctuation don't matter; "O"/"OO" (or
  // "○", "◯", "◎") at the end name the circle tiers.
  function norm(s) {
    return String(s).toLowerCase().replace(/[◯〇]/g, "○").replace(/\s+(oo|◎)$/i, " ◎").replace(/\s+o$/i, " ○")
      .replace(/[^a-z0-9○◎×☆★぀-ヿ一-鿿]+/g, "");
  }
  function distance(a, b, cap) {
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let low = i;
      for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); low = Math.min(low, cur[j]); }
      if (low > cap) return cap + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  // Pasted lines -> { found: [{ id, hint, line }], missed: [line] }. names: [[id, name], ...]
  // (one cup's skills). A hint level is "Lv3", "hint 3", "lvl 3" or "x3" on the line.
  function parsePaste(text, names) {
    const list = names.map(([id, name]) => ({ id: String(id), key: norm(name) })).filter((x) => x.key);
    const byKey = new Map();
    list.forEach((x) => { if (!byKey.has(x.key)) byKey.set(x.key, x.id); });
    const found = [], missed = [];
    String(text || "").split(/\r?\n|;/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
      const hm = /(?:\b(?:lv|lvl|level|hint)\s*\.?\s*|\bx)([0-5])\b/i.exec(line);
      const hint = hm ? +hm[1] : 0;
      const name = (hm ? line.slice(0, hm.index) + line.slice(hm.index + hm[0].length) : line).replace(/\(\s*\)|\[\s*\]/g, "").replace(/\b\d{2,4}\s*(sp|pt|pts)?\s*$/i, "").trim();
      const key = norm(name);
      if (!key) return;
      let id = byKey.get(key);
      if (!id) {
        const starts = list.filter((x) => x.key.startsWith(key) && key.length >= 5);
        if (starts.length === 1) id = starts[0].id;
      }
      if (!id && key.length >= 6) {
        const cap = key.length >= 12 ? 2 : 1;
        let best = null, bestD = cap + 1, tie = false;
        list.forEach((x) => { const d = distance(key, x.key, cap); if (d < bestD) { best = x.id; bestD = d; tie = false; } else if (d === bestD && best !== x.id) tie = true; });
        if (best && !tie) id = best;
      }
      if (id) found.push({ id, hint, line }); else missed.push(line);
    });
    return { found, missed };
  }

  // A shop row and its lower tiers (a gold's white, a ◎'s ○), each its own row so its hint can be
  // set, as the game lists them. Returns the rows to add, the asked skill last.
  function withLower(id, budget) {
    const c = budget.chain(String(id));
    return c ? c.map(String) : [String(id)];
  }

  // The quick plan: the best affordable purchases by the course chart's gains, added up (no race
  // simulation). values: { id: L }. Returns skill-budget's solve() plus each row's price.
  function quickPlan(o) {
    const learned = o.skills.filter((x) => x.have).map((x) => x.id), available = o.skills.filter((x) => !x.have).map((x) => x.id);
    const hints = Object.fromEntries(o.skills.map((x) => [x.id, x.hint]));
    const budget = B.create({ learned, available, skills: o.values, fastLearner: o.fast, metadata: o.metadata });
    const plan = budget.solve(hints, o.sp);
    const prices = {};
    budget.options(hints).flat().forEach((x) => { prices[x.id] = x.cost; });
    return Object.assign(plan, { prices, hints, learned, available });
  }
  // One skill's own price at its hint level (its tier only, not the lower tiers it needs).
  function price(id, hint, fast, metadata) {
    const m = (metadata || B.DATA.skills)[id];
    return m && Number.isFinite(m[1]) && m[1] >= 0 ? B.discounted(m[1], hint, fast) : null;
  }

  const api = { STATS, clean, encode, decode, parsePaste, norm, withLower, quickPlan, price };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaSkillOpt = api;
})(typeof window !== "undefined" ? window : globalThis);
