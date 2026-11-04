// Pull planner math (no page code): the odds of getting copies of a featured card with the
// spark, the carats you'll have by a date, and the route: which banners to pull on and how far,
// for the most value within the carats you'll have at each banner.
//
// The spark: every `spark` pulls on one banner (200 on Global) give one featured card of your
// choice, and those points don't carry over to the next banner. So pulling for k copies of a
// featured card (rate r a pull) ends at the first n with Bin(n, r) + floor(n / spark) ≥ k, and
// never takes more than k sparks.
(function (root) {
  "use strict";

  // P(Bin(n, r) ≥ need).
  function atLeast(n, r, need) {
    if (need <= 0) return 1;
    if (need > n) return 0;
    let pmf = Math.pow(1 - r, n), below = 0;
    for (let i = 0; i < need; i++) {
      below += pmf;
      pmf *= ((n - i) / (i + 1)) * (r / (1 - r));
    }
    return Math.max(0, 1 - below);
  }

  // Pulls to reach k new copies of a featured card at rate r, sparking it: the mean, the median,
  // the 90th percentile and the most it can take (k sparks).
  const costMemo = new Map();
  function cost(k, r, spark) {
    spark = spark || 200;
    if (k <= 0) return { mean: 0, p50: 0, p90: 0, max: 0 };
    const key = k + ":" + r + ":" + spark;
    if (costMemo.has(key)) return costMemo.get(key);
    const max = spark * k;
    let mean = 0, p50 = null, p90 = null;
    for (let n = 0; n < max; n++) {
      const done = atLeast(n, r, k - Math.floor(n / spark));
      mean += 1 - done;
      if (p50 == null && done >= 0.5) p50 = n;
      if (p90 == null && done >= 0.9) p90 = n;
    }
    const out = { mean, p50: p50 == null ? max : p50, p90: p90 == null ? max : p90, max };
    costMemo.set(key, out);
    return out;
  }

  // The chance of at least k copies after n pulls (sparking the card when the pulls allow).
  const chance = (n, k, r, spark) => atLeast(n, r, k - Math.floor(n / (spark || 200)));

  // Copies you end with after a fixed n pulls on a banner, sparking the card each time the pulls
  // allow, from `have` copies: [P(0 copies), …, P(5 copies)] (5 is the last limit break; copies
  // past it are wasted). 200 pulls at 0.75%: one spark plus Bin(200, 0.75%).
  function outcomes(n, r, have, spark) {
    const sparks = Math.floor(n / (spark || 200)), out = [0, 0, 0, 0, 0, 0];
    let pmf = Math.pow(1 - r, n), cum = 0;
    for (let j = 0; j < 5; j++) {
      out[Math.min(5, (have || 0) + sparks + j)] += pmf;
      cum += pmf;
      pmf *= ((n - j) / (j + 1)) * (r / (1 - r));
    }
    out[Math.min(5, (have || 0) + sparks + 5)] += Math.max(0, 1 - cum);
    return out;
  }
  // The copies you'll most likely end with (the median of outcomes()).
  function likely(dist) {
    let cum = 0;
    for (let c = 0; c < dist.length; c++) { cum += dist[c]; if (cum >= 0.5) return c; }
    return dist.length - 1;
  }

  // Carats you'll have by a date: what you have now plus your monthly income since today.
  const DAY = 864e5;
  function caratsBy(o, date) {
    const days = Math.max(0, (Date.parse(date) - Date.parse(o.today)) / DAY);
    return (o.carats || 0) + (o.perMonth || 0) * (days / 30.4375);
  }

  // The route. items: [{ key, kind: "support" | "trainee" | "selector", date, rate, have (copies
  // you own), most (levels: copies worth having, or with pullsAt the pull options), required,
  // pullsAt(level) (fixed pulls for a level: 200, 400; 0 for a selector pick), group (items that
  // share a group are alternatives: one banner's picks, one selector's choice) }].
  // o: { today, carats, perMonth, bonus: [{ date, carats }] (carats that come with packs),
  //      tickets: { support, trainee }, luck: "mean" | "p90", pullCarats, spark,
  //      value(key, level, chosen), onStep(step) }: value is what that level of the item adds,
  // given the other planned items (chosen: Map key → level); onStep hears every item taken.
  // Takes the required items first (in date order, while they fit), then step by step the move (an
  // item to more copies) with the most value per carat that still fits the budget at every banner.
  // planner() runs one move per step() so a page can stay responsive; plan() runs to the end.
  function planner(items, o) {
    const pullCarats = o.pullCarats || 150, spark = o.spark || 200;
    const by = new Map(items.map((it) => [it.key, it]));
    const pulls = (it, k) => { if (it.pullsAt) return k > 0 ? it.pullsAt(k) : 0; const c = cost(k, it.rate, spark); return o.luck === "p90" ? c.p90 : c.mean; };
    const budgetAt = (date) => caratsBy(o, date) + (o.bonus || []).reduce((a, b) => a + (b.date <= date ? b.carats : 0), 0);
    // Carats a set of planned items needs, banner by banner, using tickets first; null when the
    // budget runs short at some banner.
    function walk(chosen) {
      const list = [...chosen.entries()].filter(([, k]) => k > 0).map(([key, k]) => ({ it: by.get(key), k }))
        .sort((a, b) => (a.it.date < b.it.date ? -1 : a.it.date > b.it.date ? 1 : 0));
      const tickets = { support: (o.tickets && o.tickets.support) || 0, trainee: (o.tickets && o.tickets.trainee) || 0 };
      let spent = 0;
      const steps = [];
      for (const x of list) {
        const p = pulls(x.it, x.k), use = Math.min(tickets[x.it.kind] || 0, p);
        tickets[x.it.kind] -= use;
        const carats = (p - use) * pullCarats;
        spent += carats;
        const have = budgetAt(x.it.date);
        if (spent > have + 1e-6) return null;
        steps.push({ key: x.it.key, k: x.k, pulls: p, tickets: use, carats, left: have - spent });
      }
      return steps;
    }
    const chosen = new Map(), missed = [], taken = new Map(); // taken: group → the item chosen in it
    items.filter((it) => it.required).sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((it) => {
      if (chosen.has(it.key)) return;
      chosen.set(it.key, 1);
      if (!walk(chosen)) { chosen.delete(it.key); missed.push(it.key); return; }
      if (it.group) taken.set(it.group, it.key);
      if (o.onStep) o.onStep({ key: it.key, k: 1, required: true });
    });
    let done = false, moves = 0;
    function step() {
      if (done || moves >= 500) return false;
      let best = null;
      for (const it of items) {
        if (it.group && taken.has(it.group) && taken.get(it.group) !== it.key) continue;
        const cur = chosen.get(it.key) || 0, most = it.pullsAt ? it.most : Math.min(it.most, 5 - (it.have || 0));
        if (cur >= most) continue;
        const v0 = cur ? o.value(it.key, cur, chosen) : 0, c0 = pulls(it, cur);
        for (let k = cur + 1; k <= most; k++) {
          const dv = o.value(it.key, k, chosen) - v0, dc = (pulls(it, k) - c0) * pullCarats;
          if (dv <= 1e-9 || dc < 0) continue;
          // A free pick (a selector) beats any carat cost; the bigger one among free picks.
          const ratio = dc === 0 ? Infinity : dv / dc;
          if (best && (ratio < best.ratio || (ratio === best.ratio && dv <= best.dv))) continue;
          chosen.set(it.key, k);
          const ok = walk(chosen);
          if (cur) chosen.set(it.key, cur); else chosen.delete(it.key);
          if (ok) best = { key: it.key, k, ratio, dv };
        }
      }
      if (!best) { done = true; return false; }
      chosen.set(best.key, best.k);
      const bit = by.get(best.key);
      if (bit.group) taken.set(bit.group, best.key);
      moves++;
      if (o.onStep) o.onStep(best);
      return true;
    }
    return { step, chosen, missed, result: () => ({ chosen, steps: walk(chosen) || [], missed }), pulls, budgetAt };
  }
  function plan(items, o) {
    const p = planner(items, o);
    while (p.step());
    return p.result();
  }

  const api = { atLeast, cost, chance, outcomes, likely, caratsBy, plan, planner };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaPullPlanner = api;
})(typeof window !== "undefined" ? window : globalThis);
