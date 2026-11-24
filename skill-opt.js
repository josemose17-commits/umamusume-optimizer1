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

  // The spec's settings (Advanced): mode (auto: the cup's kind), the spread weight k (blank: the
  // mode's default), late-acceleration decay alpha, the early/mid speed bonus, beam width, and
  // off (the quick plan's exact knapsack on chart gains instead of the spec's scoring).
  function cleanAdv(a) {
    a = a && typeof a === "object" ? a : {};
    const num = (v, lo, hi) => (v === "" || v == null || !Number.isFinite(+v) ? "" : String(Math.min(hi, Math.max(lo, +v))));
    return { mode: ["auto", "cm", "loh"].includes(a.mode) ? a.mode : "auto", k: num(a.k, -2, 2), alpha: num(a.alpha, 0, 2), mid: num(a.mid, 1, 1.5), beam: num(a.beam, 5, 200), off: !!a.off };
  }
  // A saved or shared build, cleaned: unknown fields dropped, numbers in range.
  function clean(b) {
    b = b && typeof b === "object" ? b : {};
    const out = { cup: typeof b.cup === "string" ? b.cup.slice(0, 16) : "", style: STYLES.includes(b.style) ? b.style : "Senkou",
      tid: b.tid ? String(b.tid).replace(/\D/g, "").slice(0, 8) : "", stats: {}, apt: {}, mood: MOODS.includes(String(b.mood)) ? String(b.mood) : "0",
      uniqueLv: String(clampInt(b.uniqueLv, 1, 6, 1)), sp: b.sp === "" || b.sp == null ? "" : String(clampInt(b.sp, 0, 20000, 0)),
      fast: !!b.fast, skills: [], goal: b.goal === "win" ? "win" : "length",
      precise: !!b.precise, spurtGoal: [90, 95, 100].includes(+b.spurtGoal) ? +b.spurtGoal : 95, noFill: !!b.noFill, adv: cleanAdv(b.adv), strength: ["top-strong", "top-typical", "weaker", "equal", "stronger"].includes(b.strength) ? b.strength : "top-strong", mix: null, team: [] };
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
      b.goal === "win" ? 1 : 0, b.strength, b.mix ? ["Nige", "Senkou", "Sasi", "Oikomi"].map((k) => b.mix[k]) : 0, b.precise ? 1 : 0, b.spurtGoal, b.noFill ? 1 : 0, [b.adv.mode, b.adv.k, b.adv.alpha, b.adv.mid, b.adv.beam, b.adv.off ? 1 : 0]]));
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
    return clean({ cup: a[1], style: a[2], tid: a[3], stats, apt, mood: a[6], uniqueLv: a[7], sp: a[8], fast: !!a[9], skills, goal: a[11] ? "win" : "length", strength: a[12], mix, precise: !!a[14], spurtGoal: a[15] == null ? 95 : a[15], noFill: !!a[16], adv: Array.isArray(a[17]) ? { mode: a[17][0], k: a[17][1], alpha: a[17][2], mid: a[17][3], beam: a[17][4], off: !!a[17][5] } : null });
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
    // o.solve: another solver with the same inputs (skill-spec.js's beam search); else the exact knapsack.
    const plan = o.solve ? o.solve({ learned, available, hints, sp: o.sp, fast: o.fast, values: o.values, metadata: o.metadata }) : budget.solve(hints, o.sp);
    const prices = {};
    budget.options(hints).flat().forEach((x) => { prices[x.id] = x.cost; });
    return Object.assign(plan, { prices, hints, learned, available });
  }
  // One skill's own price at its hint level (its tier only, not the lower tiers it needs).
  function price(id, hint, fast, metadata) {
    const m = (metadata || B.DATA.skills)[id];
    return m && Number.isFinite(m[1]) && m[1] >= 0 ? B.discounted(m[1], hint, fast) : null;
  }

  // Spend all the SP: after the best set, the SP left buys the best other skills that still fit
  // (each family once, its lower tiers included), by o.score (lengths; missing counts 0), cheaper
  // first on a tie. A skill clearly costing lengths (score below o.floor, default -0.05) is never
  // bought. o: { learned, bought (ids bought, lower tiers included), available, hints, sp, spent,
  // fast, score: { id: L }, metadata }. Returns { added: [{ id, cost, tiers, score }], spent, left }.
  function fillRest(o) {
    const own = new Set((o.learned || []).concat(o.bought || []).map(String));
    const avail = (o.available || []).map(String).filter((id) => !own.has(id));
    const score = {};
    avail.forEach((id) => { const v = o.score && o.score[id]; score[id] = Number.isFinite(v) ? v : 0; });
    const budget = B.create({ learned: [...own], available: avail, skills: score, fastLearner: o.fast, metadata: o.metadata, includeZero: true });
    const floor = o.floor == null ? -0.05 : o.floor;
    const opts = budget.options(o.hints || {}).flat().filter((x) => x.L >= floor || (x.L === 0 && score[x.id] >= floor));
    let left = Math.max(0, (+o.sp || 0) - (+o.spent || 0));
    const used = new Set(), added = [];
    opts.map((x) => Object.assign({}, x, { score: score[x.id] }))
      .sort((a, b) => b.score - a.score || a.cost - b.cost)
      .forEach((x) => {
        if (used.has(x.family) || x.cost > left || x.score < floor) return;
        used.add(x.family); added.push({ id: x.id, cost: x.cost, tiers: x.tiers.map((t) => t.id), score: x.score }); left -= x.cost;
      });
    return { added, spent: (+o.sp || 0) - left, left };
  }

  // Race formulas (the CM & LoH skill optimizer spec): max HP, and a Wit check's chance to fire.
  const HP_COEF = { Oonige: 0.86, Nige: 0.95, Senkou: 0.89, Sasi: 1.0, Oikomi: 0.995 };
  const maxHP = (stamina, style, distance) => 0.8 * (HP_COEF[style] || 1) * (+stamina || 0) + (+distance || 0);
  const activation = (wiz) => (+wiz > 0 ? Math.max(100 - 9000 / +wiz, 20) / 100 : 0.2);
  // Heals for the stamina gate, most HP per SP first: hp is the share of max HP it restores.
  // o.heals: [{ id, cost, hp }]; chance: the Wit check's (the same for every heal).
  function healOrder(heals, chance) {
    return (heals || []).filter((h) => h.cost > 0 && h.hp > 0)
      .map((h) => Object.assign({}, h, { expected: h.hp * (chance == null ? 1 : chance), per100: h.hp * (chance == null ? 1 : chance) * 100 / h.cost }))
      .sort((a, b) => b.per100 - a.per100 || a.cost - b.cost);
  }

  // A link that opens alpha123's Global Umalator filled in (its own share format: gzipped JSON
  // in the URL fragment, base64, URI-encoded). o: { courseId, racedef: { ground, weather, season,
  // time }, uma1, uma2 (stats, aptitudes, strategy, mood, uniqueLv, outfitId, skills: [ids]),
  // hints: { id: level }, samples, seed }. Async (CompressionStream).
  const UMALATOR = "https://alpha123.github.io/uma-tools/umalator-global/";
  const UMA_DEFAULT = { outfitId: "", starCount: 3, strategy: "Senkou", distanceAptitude: "A", surfaceAptitude: "A", strategyAptitude: "A", aptitudes: Array(10).fill("A"), uniqueLv: 1, mood: 2, popularity: 1 };
  async function umalatorLink(o) {
    const uma = (u) => { const x = Object.assign({}, UMA_DEFAULT, u); x.skills = [...new Set((u.skills || []).map(String))]; delete x.samplePolicies; return x; };
    const rd = o.racedef || {};
    const data = { courseId: +o.courseId, nsamples: o.samples || 500, seed: o.seed || 2615953739, usePosKeep: true, useCompeteTop: true, useIntChecks: false,
      racedef: { ground: rd.ground, weather: rd.weather, season: rd.season, time: rd.time, grade: 100 },
      hintLevels: Object.fromEntries(Object.entries(o.hints || {}).filter(([, v]) => v > 0)), uma1: uma(o.uma1), uma2: uma(o.uma2 || o.uma1) };
    const stream = new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream("gzip"));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = ""; bytes.forEach((c) => { bin += String.fromCharCode(c); });
    return UMALATOR + "#" + encodeURIComponent(typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64"));
  }
  async function readUmalatorLink(url) {
    const hash = decodeURIComponent(String(url).split("#")[1] || "");
    const bin = typeof atob !== "undefined" ? atob(hash) : Buffer.from(hash, "base64").toString("binary");
    const stream = new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
  }

  const api = { cleanAdv, STATS, clean, encode, decode, parsePaste, norm, withLower, quickPlan, price, fillRest, maxHP, activation, healOrder, umalatorLink, readUmalatorLink, UMALATOR, HP_COEF };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaSkillOpt = api;
})(typeof window !== "undefined" ? window : globalThis);
