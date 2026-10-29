// Affordable final skill sets. Exact multiple-choice knapsack for one realized
// offer/hint state; race gains remain additive estimates from the skill chart.
(function (root) {
  const DATA = root.UmaSkillPurchases || (typeof require !== "undefined" ? require("./data/skill-purchases.js") : null);
  const DISCOUNT = [0, 10, 20, 30, 35, 40];
  const level = (n) => Math.max(0, Math.min(5, Math.floor(+n || 0)));
  const discounted = (cost, lv) => Math.floor(cost * (100 - DISCOUNT[level(lv)]) / 100);
  function create(opts = {}) {
    const metadata = opts.metadata || DATA.skills, values = Object.assign({}, opts.skills), costs = Object.assign({}, opts.costs);
    const learned = new Set([...(opts.learned || [])].map(String));
    const available = new Set([...(opts.available || [])].map(String));
    const must = new Set((opts.must || []).map(String));
    must.forEach((id) => { if (!Number.isFinite(values[id])) values[id] = 0; });
    const lengthValue = opts.lengthValue == null ? 60 : opts.lengthValue;
    const spValue = opts.spValue == null ? 0.35 : opts.spValue;
    const chains = new Map(), unsupported = new Set();
    const whites = new Map();
    Object.entries(metadata).forEach(([id, m]) => {
      if (m[3] !== 1) return;
      if (!whites.has(m[0])) whites.set(m[0], []);
      whites.get(m[0]).push(id);
    });
    function chain(id, seen = new Set()) {
      id = String(id);
      if (chains.has(id)) return chains.get(id);
      const m = metadata[id];
      if (!m || seen.has(id) || !Number.isFinite(m[1]) || m[1] < 0) return null;
      const path = new Set(seen); path.add(id);
      const before = m[2] == null ? [] : chain(m[2], path);
      const out = before && before.every((p) => metadata[p][0] === m[0]) ? before.concat(id) : null;
      chains.set(id, out);
      return out;
    }
    // Include unvalued prerequisites; never substitute a guessed purchase cost.
    Object.keys(values).concat([...available], [...must]).forEach((id) => { if (metadata[id]) chain(id); });
    function unlocks(id) {
      const c = chain(id);
      if (!c) return [];
      // ○ also permits the ordinary ◎ purchase; it does not unlock gold.
      return [...new Set(c.concat(whites.get(metadata[id][0]) || []))];
    }
    function options(levels = {}) {
      const offered = new Set([...available, ...learned, ...Object.keys(levels).filter((id) => levels[id] > 0)]);
      [...offered].forEach((id) => {
        const c = chain(id);
        if (!c && !learned.has(id) && (Number.isFinite(values[id]) || must.has(id))) unsupported.add(id);
        unlocks(id).forEach((p) => offered.add(p));
      });
      const owned = new Map();
      learned.forEach((id) => {
        const c = chain(id);
        if (c && (!owned.has(metadata[id][0]) || owned.get(metadata[id][0]).length < c.length)) owned.set(metadata[id][0], c);
      });
      const groups = new Map();
      [...offered].sort((a, b) => +a - +b).forEach((id) => {
        const c = chain(id);
        if (!c || !Number.isFinite(values[id])) return;
        const family = metadata[id][0], base = owned.get(family) || [];
        if (base.length >= c.length) return;
        const tiers = c.slice(base.length).map((p) => {
          const raw = Number.isFinite(costs[p]) && costs[p] > 0 ? costs[p] : metadata[p][1];
          return { id: p, hint: level(levels[p]), cost: discounted(raw, levels[p]) };
        });
        const cost = tiers.reduce((n, p) => n + p.cost, 0);
        const L = values[id] - (base.length ? values[base[base.length - 1]] || 0 : 0);
        const required = c.filter((p) => must.has(p) && !learned.has(p));
        const value = L * lengthValue;
        if (!(L > 0) && !required.length) return;
        const fullCost = tiers.reduce((n, p) => n + (Number.isFinite(costs[p.id]) && costs[p.id] > 0 ? costs[p.id] : metadata[p.id][1]), 0);
        const option = { id, family, L, cost, value, hintSaving: fullCost - cost, required, tiers };
        if (!groups.has(family)) groups.set(family, []);
        groups.get(family).push(option);
      });
      return [...groups.values()];
    }
    function solve(levels, projectedSp) {
      const groups = options(levels), budget = Number.isFinite(+projectedSp) ? Math.max(0, Math.floor(+projectedSp)) : 0;
      const limit = Math.min(budget, groups.reduce((n, g) => n + Math.max(...g.map((o) => o.cost)), 0));
      // Lexicographic objective: fulfill as many offered must-haves as possible,
      // then maximize the final set's additive race gain. SP counts through
      // this constraint, rather than also rewarding an unspent raw SP total.
      const priority = 1 + 2 * groups.reduce((n, g) => n + Math.max(...g.map((o) => Math.abs(o.value))), 0);
      let dp = new Float64Array(limit + 1); dp.fill(-Infinity); dp[0] = 0;
      const history = [];
      let reachable = 0;
      groups.forEach((group) => {
        const next = dp.slice(), picked = new Int16Array(limit + 1);
        group.forEach((option, i) => {
          const v = option.value + option.required.length * priority;
          for (let b = 0, end = Math.min(reachable, limit - option.cost); b <= end; b++) {
            if (dp[b] === -Infinity) continue;
            const at = b + option.cost, candidate = dp[b] + v;
            if (candidate > next[at] + 1e-9) { next[at] = candidate; picked[at] = i + 1; }
          }
        });
        dp = next; history.push(picked);
        reachable = Math.min(limit, reachable + Math.max(...group.map((o) => o.cost)));
      });
      let at = 0;
      for (let b = 1; b <= limit; b++) if (dp[b] > dp[at] + 1e-9) at = b;
      const spent = at, selected = [];
      for (let g = groups.length - 1; g >= 0; g--) {
        const choice = history[g][at];
        if (choice) { const option = groups[g][choice - 1]; selected.push(option); at -= option.cost; }
      }
      selected.reverse();
      const satisfied = new Set(selected.flatMap((s) => s.required).concat([...learned].filter((id) => must.has(id))));
      return { budget, spent, unspent: budget - spent, selected,
        value: selected.reduce((n, o) => n + o.value, 0), L: selected.reduce((n, o) => n + o.L, 0),
        unmetMust: [...must].filter((id) => !satisfied.has(id)),
        offered: [...new Set(groups.flat().map((o) => o.id))], unsupported: [...unsupported].sort() };
    }
    // The parent's buy: values are rating points. Must-haves first, then reach `gap` more
    // rating (SS) if any buy does, then the most relevant skill families, then better spark
    // chances among them (an upgrade pass after the knapsack), then the most rating. A family counts once: its spark is always the base white's, whether she learns
    // ○, ◎ or the gold (which only raise its chance: 20%, 25%, 40%; GameTora, umamusu.wiki).
    // Returns solve()'s fields plus reached (gap met) and relevant (net relevant skills added).
    function solveSS(levels, projectedSp, o = {}) {
      const rel = o.relevant || {}, gap = o.gap || 0;
      const isRel = (id) => {
        const c = id && chain(id);
        return !!(c && c.some((p) => rel[p]));
      };
      const owned = new Map();
      learned.forEach((id) => { const c = chain(id); if (c && (!owned.has(metadata[id][0]) || owned.get(metadata[id][0]).length < c.length)) owned.set(metadata[id][0], c); });
      const groups = options(levels).map((g) => g.map((x) => {
        const base = owned.get(x.family);
        return Object.assign({}, x, { rel: (isRel(x.id) ? 1 : 0) - (base && isRel(base[base.length - 1]) ? 1 : 0) });
      }));
      const budget = Number.isFinite(+projectedSp) ? Math.max(0, Math.floor(+projectedSp)) : 0;
      const limit = Math.min(budget, groups.reduce((n, g) => n + Math.max(...g.map((x) => x.cost)), 0));
      const neg = groups.filter((g) => g.some((x) => x.rel < 0)).length, pos = groups.filter((g) => g.some((x) => x.rel > 0)).length;
      const C = neg + pos + 1, W = limit + 1;
      // best[c * W + b]: the highest (must-haves × priority + rating) with net relevant c − neg
      // and exactly b SP spent; rating and musts are kept alongside to read them back.
      const priority = 1 + 2 * groups.reduce((n, g) => n + Math.max(...g.map((x) => Math.abs(x.value))), 0);
      let best = new Float64Array(C * W).fill(-Infinity);
      best[neg * W] = 0;
      const history = [];
      groups.forEach((group) => {
        const next = best.slice(), picked = new Int16Array(C * W);
        group.forEach((x, i) => {
          const v = x.value + x.required.length * priority;
          for (let c = 0; c < C; c++) {
            const c2 = c + x.rel;
            if (c2 < 0 || c2 >= C) continue;
            for (let b = 0; b + x.cost <= limit; b++) {
              const from = best[c * W + b];
              if (from === -Infinity) continue;
              const at = c2 * W + b + x.cost;
              if (from + v > next[at] + 1e-9) { next[at] = from + v; picked[at] = i + 1; }
            }
          }
        });
        best = next; history.push(picked);
      });
      const musts = (s) => Math.floor((s + 1e-6) / priority);
      const later = (a, b) => { const i = a.findIndex((k, j) => Math.abs(k - b[j]) > 1e-9); return i !== -1 && a[i] > b[i]; };
      let top = 0;
      best.forEach((s) => { if (s > -Infinity) top = Math.max(top, musts(s)); });
      let pick = -1, pickKey = null;
      for (let c = 0; c < C; c++) for (let b = 0; b <= limit; b++) {
        const s = best[c * W + b];
        if (s === -Infinity || musts(s) < top) continue;
        const rating = s - top * priority, ok = rating >= gap - 1e-9;
        // Reached first, then (if reached) more relevant before more rating, else rating first.
        const key = ok ? [1, c, rating, -b] : [0, rating, c, -b];
        if (!pickKey || later(key, pickKey)) { pick = c * W + b; pickKey = key; }
      }
      const selected = [];
      let at = pick, spent = pick % W;
      for (let g = groups.length - 1; g >= 0 && at >= 0; g--) {
        const choice = history[g][at];
        if (choice) { const x = groups[g][choice - 1]; selected.push(x); at -= x.rel * W + x.cost; }
      }
      selected.reverse();
      // Same number of relevant families: upgrade one to the tier with a better spark chance
      // (◎ 25%, gold 40%, ○ 20%) while the SP left covers it and the rating gap stays met.
      const chance = (id) => (metadata[id][3] === 2 ? 40 : metadata[id][2] && metadata[metadata[id][2]] && metadata[metadata[id][2]][3] === 1 ? 25 : 20);
      let value = selected.reduce((n, x) => n + x.value, 0);
      for (let more = true; more;) {
        more = false;
        let best = null;
        selected.forEach((x, i) => {
          if (!isRel(x.id)) return;
          groups.find((g) => g.some((o) => o.id === x.id)).forEach((y) => {
            const extra = y.cost - x.cost, after = value - x.value + y.value;
            if (chance(y.id) <= chance(x.id) || extra > budget - spent || y.required.length < x.required.length) return;
            if (value >= gap - 1e-9 && after < gap - 1e-9) return;
            const gain = chance(y.id) - chance(x.id);
            if (!best || gain > best.gain || gain === best.gain && after > best.after) best = { i, y, extra, after, gain };
          });
        });
        if (best) { spent += best.extra; value = best.after; selected[best.i] = best.y; more = true; }
      }
      const satisfied = new Set(selected.flatMap((s) => s.required).concat([...learned].filter((id) => must.has(id))));
      return { budget, spent, unspent: budget - spent, selected, value, L: selected.reduce((n, x) => n + x.L, 0),
        reached: value >= gap - 1e-9, relevant: selected.reduce((n, x) => n + x.rel, 0),
        unmetMust: [...must].filter((id) => !satisfied.has(id)), offered: [...new Set(groups.flat().map((x) => x.id))], unsupported: [...unsupported].sort() };
    }
    // Event-route screening values the best family gain plus hint savings.
    // Final affordable selection is separate; routes are not jointly optimized
    // with every other card's random offers.
    const bestByFamily = (groups) => new Map(groups.map((g) => [g[0].family, Math.max(0, ...g.map((o) => o.value + o.hintSaving * spValue))]));
    const base = bestByFamily(options({}));
    const utilities = new Map();
    function hintUtility(levels) {
      const key = JSON.stringify(Object.keys(levels).sort().map((id) => [id, levels[id]]));
      if (utilities.has(key)) return utilities.get(key);
      const after = bestByFamily(options(levels));
      const value = [...after].reduce((n, [family, value]) => n + Math.max(0, value - (base.get(family) || 0)), 0);
      if (utilities.size >= 2048) utilities.clear();
      utilities.set(key, value); return value;
    }
    const key = JSON.stringify([values, costs, [...learned].sort(), [...available].sort(), [...must].sort()]);
    return { options, solve, solveSS, chain, unlocks, hintUtility, key };
  }
  let catalog;
  function baseCost(id) {
    if (!catalog) catalog = create();
    const c = catalog.chain(id);
    return c ? c.reduce((n, p) => n + DATA.skills[p][1], 0) : null;
  }
  const api = { create, discounted, baseCost, DATA };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaSkillBudget = api;
})(typeof window !== "undefined" ? window : globalThis);
