// Parent affinity (compatibility, the ◎/○/△ on the legacy screen) and a G1 plan that reaches it
// with as few races as possible.
//
// Global's formula, as GameTora's compatibility calculator computes it: every affinity group a
// set of characters all belong to adds its points.
//   total = (trainee, parent 1) + (trainee, parent 2) + (parent 1, parent 2)
//         + (trainee, parent, grandparent) for each of the 4 grandparents
//         + 3 for each G1 both members of a pair won: parent 1 & parent 2, and each parent
//           with her own two grandparents (one win per race name, Classic or Senior).
// G2/G3 wins and titles don't count on Global. Over 150 is ◎, over 50 is ○, the rest △.
// A grandparent or parent that is the same character as the one below it adds no points.
// Each uma also has her own affinity (individual()), which is what her sparks' chances scale
// with: a spark's chance × (1 + her affinity / 100), capped at 100% (GameTora's inheritance
// chances). Checked against GameTora's own code on 1,500 random families: totals and every
// uma's own affinity match.
(function (root) {
  "use strict";
  const WIN_POINTS = 3;
  const GREAT = 151, GOOD = 51;

  const pdata = () => root.UmaParentData || (typeof require === "function" ? require("./data/parent-data.js") : null);
  const gdata = () => root.UmaData || (typeof require === "function" ? require("./data/gametora.js") : null);

  let index = null;
  function groupsOf(cid) {
    if (!index) {
      index = new Map();
      pdata().affinity.forEach(([pts, members], i) => members.forEach((m) => {
        if (!index.has(m)) index.set(m, []);
        index.get(m).push(i);
      }));
    }
    return index.get(+cid) || [];
  }

  // Points from every group all of these characters belong to (kept per set: families are
  // ranked by the thousand).
  const memo = new Map();
  function together(...cids) {
    if (cids.some((c) => !c) || new Set(cids.map(Number)).size < cids.length) return 0;
    const key = cids.map(Number).sort((a, b) => a - b).join(",");
    if (!memo.has(key)) memo.set(key, groupPoints(cids));
    return memo.get(key);
  }
  function groupPoints(cids) {
    const P = pdata();
    const first = groupsOf(cids[0]);
    let sum = 0;
    first.forEach((i) => {
      const m = P.affinity[i][1];
      if (cids.every((c) => m.indexOf(+c) !== -1)) sum += P.affinity[i][0];
    });
    return sum;
  }

  const shared = (a, b) => {
    if (!a || !b) return [];
    const B = new Set(b);
    return Array.from(new Set(a)).filter((r) => B.has(r));
  };

  const symbol = (n) => (n >= GREAT ? "◎" : n >= GOOD ? "○" : "△");

  // Lineage: { trainee, p1, p2, g11, g12, g21, g22 } character ids; wins: { p1: [G1 names], ... }.
  function total(L, wins) {
    const w = wins || {};
    const side = (p, ga, gb) => ({
      base: together(L.trainee, L[p]),
      ga: L[ga] && L[ga] !== L[p] ? together(L.trainee, L[p], L[ga]) : 0,
      gb: L[gb] && L[gb] !== L[p] ? together(L.trainee, L[p], L[gb]) : 0,
    });
    const s1 = side("p1", "g11", "g12"), s2 = side("p2", "g21", "g22");
    const pp = together(L.p1, L.p2);
    const race = {
      p1p2: L.p1 && L.p2 ? shared(w.p1, w.p2) : [],
      p1g11: L.p1 && L.g11 ? shared(w.p1, w.g11) : [],
      p1g12: L.p1 && L.g12 ? shared(w.p1, w.g12) : [],
      p2g21: L.p2 && L.g21 ? shared(w.p2, w.g21) : [],
      p2g22: L.p2 && L.g22 ? shared(w.p2, w.g22) : [],
    };
    const racePts = Object.values(race).reduce((a, r) => a + r.length * WIN_POINTS, 0);
    // The parent pair counts once in the total (and in each parent's own affinity).
    const sum = s1.base + s1.ga + s1.gb + s2.base + s2.ga + s2.gb + pp + racePts;
    return { total: sum, symbol: symbol(sum), pp, side1: s1, side2: s2, race, racePts, base: sum - racePts };
  }

  // Each uma's own affinity in the lineage (GameTora's per-slot values).
  function individual(L, wins) {
    const t = total(L, wins), r = t.race, P = WIN_POINTS;
    return {
      p1: L.p1 ? t.side1.base + t.side1.ga + t.side1.gb + t.pp + P * (r.p1p2.length + r.p1g11.length + r.p1g12.length) : 0,
      p2: L.p2 ? t.side2.base + t.side2.ga + t.side2.gb + t.pp + P * (r.p1p2.length + r.p2g21.length + r.p2g22.length) : 0,
      g11: L.g11 ? t.side1.ga + P * r.p1g11.length : 0,
      g12: L.g12 ? t.side1.gb + P * r.p1g12.length : 0,
      g21: L.g21 ? t.side2.ga + P * r.p2g21.length : 0,
      g22: L.g22 ? t.side2.gb + P * r.p2g22.length : 0,
    };
  }
  // How much more often her sparks fire than their base chance.
  const sparkMult = (affinity) => 1 + Math.max(0, affinity || 0) / 100;

  const DIST = (d) => (d <= 1400 ? 2 : d <= 1800 ? 3 : d <= 2400 ? 4 : 5); // index in the aptitude list
  const GRADE_OK = { S: 7, A: 6, B: 5, C: 4, D: 3, E: 2, F: 1, G: 0 };

  // Every G1 on the career calendar: { name, turns, d, s }.
  function g1Races() {
    const by = new Map();
    gdata().races.filter((r) => r.g === 100).forEach((r) => {
      if (!by.has(r.n)) by.set(r.n, { name: r.n, turns: [], d: r.d, s: r.s });
      by.get(r.n).turns.push(r.t);
    });
    return Array.from(by.values());
  }

  // A character's career race goals: fixed races (run on their turn) and "pick one" choices
  // (goals sharing an order with a race choice: she runs one of them).
  function careerGoals(cid) {
    const goals = (gdata().objectives || {})[cid] || [];
    const g1 = new Set(g1Races().map((r) => r.name));
    const fixed = [], byOrder = new Map();
    goals.forEach((g) => {
      if (!g.r || !g.r.length) return;
      if (!g.ch) { g.r.forEach((n) => fixed.push({ name: n, turn: g.t, g1: g1.has(n) })); return; }
      const key = g.o != null ? g.o : "t" + g.t;
      if (!byOrder.has(key)) byOrder.set(key, []);
      g.r.forEach((n) => byOrder.get(key).push({ name: n, turn: g.t, g1: g1.has(n) }));
    });
    return { fixed, choices: Array.from(byOrder.values()) };
  }
  // The fixed G1 career goals (run anyway, so their affinity is free).
  const goalG1s = (cid) => careerGoals(cid).fixed.filter((g) => g.g1).map((g) => ({ name: g.name, turn: g.turn }));

  // Can every item get its own turn? items: [{ turns }], blocked: turns already taken.
  // Bipartite matching (augmenting paths); returns item index -> turn, or null.
  function assignTurns(items, blocked) {
    const owner = new Map();
    const tryItem = (k, seen) => {
      for (const t of items[k].turns) {
        if (blocked.has(t) || seen.has(t)) continue;
        seen.add(t);
        if (!owner.has(t) || tryItem(owner.get(t), seen)) { owner.set(t, k); return true; }
      }
      return false;
    };
    for (let k = 0; k < items.length; k++) if (!tryItem(k, new Set())) return null;
    const out = new Array(items.length);
    owner.forEach((k, t) => { out[k] = t; });
    return out;
  }

  // Plan the G1s for the uma you're training now (`self`), so that later, as a parent, she
  // shares wins with the uma she'll be paired with: her own two parents (they'll be her
  // grandparents in that lineage) and the other parent.
  //   o.self: character id; o.links: [{ role, cid, wins: [names] }]; o.apt: her aptitudes
  //   (GameTora order); o.minGrade: lowest distance/surface aptitude worth racing ("B");
  //   o.need: race points still needed for the target (from total()); o.won: G1s she has
  //   already won (counted in total(), so not planned again); o.races: override list.
  // Her career goals come first: fixed G1 goals are free, a "pick one" goal takes its shared
  // G1 if it has one, and every goal's turn is taken. Then the races shared with the most umas,
  // each kept only if every planned race still gets its own turn (a race held in two years
  // moves to the other one). Highest points first gives the fewest races: sets of races that
  // fit distinct turns form a matroid, where greedy by weight is optimal.
  function planRaces(o) {
    const links = (o.links || []).filter((l) => l.cid && l.cid !== o.self && (l.wins || []).length);
    const won = new Set(o.won || []);
    const goals = o.self ? careerGoals(o.self) : { fixed: [], choices: [] };
    const min = GRADE_OK[o.minGrade || "B"];
    const apt = o.apt || null;
    const all = (o.races || g1Races()).map((r) => {
      const with_ = links.filter((l) => l.wins.indexOf(r.name) !== -1).map((l) => l.role);
      const aptGrades = apt ? [apt[r.s === 2 ? 1 : 0], apt[DIST(r.d)]] : null;
      const fits = !aptGrades || aptGrades.every((g) => GRADE_OK[g] >= min);
      return { name: r.name, turns: r.turns, d: r.d, s: r.s, points: won.has(r.name) ? 0 : with_.length * WIN_POINTS, with: with_, aptGrades, fits, won: won.has(r.name) };
    });
    const byName = new Map(all.map((r) => [r.name, r]));
    const blocked = new Set(), agenda = [];
    let got = 0;
    // Fixed goals: their turns are taken; shared G1 goals are free points.
    goals.fixed.forEach((g) => {
      blocked.add(g.turn);
      const r = byName.get(g.name);
      if (r && r.points > 0) { agenda.push(Object.assign({}, r, { turn: g.turn, free: true, goal: "fixed" })); got += r.points; }
    });
    // "Pick one" goals: the shared option with the most points, else any option (matched below).
    const open = [];
    goals.choices.forEach((opts) => {
      const best = opts.map((x) => ({ x, r: byName.get(x.name) })).filter((y) => y.r && y.r.points > 0 && !blocked.has(y.x.turn))
        .sort((a, b) => b.r.points - a.r.points)[0];
      if (best) {
        blocked.add(best.x.turn);
        agenda.push(Object.assign({}, best.r, { turn: best.x.turn, free: true, goal: "choice", options: opts.map((x) => x.name) }));
        got += best.r.points;
      } else open.push({ turns: Array.from(new Set(opts.map((x) => x.turn))), choice: opts.map((x) => x.name) });
    });
    const goalNames = new Set(agenda.map((r) => r.name));
    const candidates = all.filter((r) => r.points > 0);
    const rest = candidates.filter((r) => !goalNames.has(r.name) && r.fits).sort((a, b) => b.points - a.points || a.turns.length - b.turns.length || a.name.localeCompare(b.name));
    const picked = [], skipped = [];
    rest.forEach((r) => {
      if (got >= (o.need || 0)) return;
      if (!assignTurns(open.concat(picked, [r]), blocked)) { skipped.push(Object.assign({ why: "clash" }, r)); return; }
      picked.push(r);
      got += r.points;
    });
    const turns = assignTurns(open.concat(picked), blocked) || [];
    picked.forEach((r, k) => agenda.push(Object.assign({}, r, { turn: turns[open.length + k], free: false })));
    agenda.sort((a, b) => a.turn - b.turn);
    return { candidates, agenda, points: got, extraRaces: picked.length, reached: got >= (o.need || 0), skipped,
      unfit: candidates.filter((r) => !goalNames.has(r.name) && !r.fits), alreadyWon: all.filter((r) => r.won).map((r) => r.name) };
  }

  const api = { WIN_POINTS, GREAT, GOOD, together, total, individual, sparkMult, symbol, g1Races, careerGoals, goalG1s, assignTurns, planRaces, shared };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaAffinity = api;
})(typeof window !== "undefined" ? window : globalThis);
