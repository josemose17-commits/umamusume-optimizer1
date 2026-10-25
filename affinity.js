// Parent affinity (compatibility, the ◎/○/△ on the legacy screen) and a G1 plan that reaches it
// with as few races as possible.
//
// Global's formula, as GameTora's compatibility calculator computes it: every affinity group a
// set of characters all belong to adds its points.
//   total = (trainee, parent 1) + (trainee, parent 2) + 2 × (parent 1, parent 2)
//         + (trainee, parent, grandparent) for each of the 4 grandparents
//         + 3 for each G1 both members of a pair won: parent 1 & parent 2, and each parent
//           with her own two grandparents (one win per race name, Classic or Senior).
// G2/G3 wins and titles don't count on Global. Over 150 is ◎, over 50 is ○, the rest △.
// A grandparent or parent that is the same character as the one below it adds no points.
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

  // Points from every group all of these characters belong to.
  function together(...cids) {
    if (cids.some((c) => !c) || new Set(cids.map(Number)).size < cids.length) return 0;
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
    const side1 = s1.base + s1.ga + s1.gb + (L.p1 ? pp : 0), side2 = s2.base + s2.ga + s2.gb + (L.p2 ? pp : 0);
    const sum = side1 + side2 + racePts;
    return { total: sum, symbol: symbol(sum), pp, side1: s1, side2: s2, race, racePts, base: sum - racePts };
  }

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

  // The fixed G1 career goals of a character: run anyway, so their affinity is free.
  function goalG1s(cid) {
    const goals = (gdata().objectives || {})[cid] || [];
    const g1 = new Set(g1Races().map((r) => r.name));
    const out = [];
    goals.forEach((g) => { if (!g.ch && g.r) g.r.forEach((n) => { if (g1.has(n)) out.push({ name: n, turn: g.t }); }); });
    return out;
  }

  // Plan the G1s for the uma you're training now (`self`), so that later, as a parent, she
  // shares wins with the uma she'll be paired with: her own two parents (they'll be her
  // grandparents in that lineage) and the other parent.
  //   o.self: character id; o.links: [{ role, cid, wins: [names] }]; o.apt: her aptitudes
  //   (GameTora order); o.minGrade: lowest distance/surface aptitude worth racing ("B");
  //   o.need: race points still needed for the target (from total()); o.races: override list.
  // Returns every candidate race with its points and why, the picked agenda (fewest races to
  // cover `need`, career goals first since they're free) and the points it reaches.
  function planRaces(o) {
    const links = (o.links || []).filter((l) => l.cid && l.cid !== o.self && (l.wins || []).length);
    const goals = o.self ? goalG1s(o.self) : [];
    const goalName = new Map(goals.map((g) => [g.name, g.turn]));
    const min = GRADE_OK[o.minGrade || "B"];
    const apt = o.apt || null;
    const all = (o.races || g1Races()).map((r) => {
      const with_ = links.filter((l) => l.wins.indexOf(r.name) !== -1).map((l) => l.role);
      const aptGrades = apt ? [apt[r.s === 2 ? 1 : 0], apt[DIST(r.d)]] : null;
      const fits = !aptGrades || aptGrades.every((g) => GRADE_OK[g] >= min);
      return { name: r.name, turns: r.turns, d: r.d, s: r.s, points: with_.length * WIN_POINTS, with: with_, goal: goalName.has(r.name), goalTurn: goalName.get(r.name), aptGrades, fits };
    });
    const candidates = all.filter((r) => r.points > 0);
    const used = new Set();
    const agenda = [];
    let got = 0;
    // Career goals first: they're run anyway (and their turns are taken).
    candidates.filter((r) => r.goal).forEach((r) => { used.add(r.goalTurn); agenda.push(Object.assign({ turn: r.goalTurn, free: true }, r)); got += r.points; });
    goals.forEach((g) => used.add(g.turn));
    const rest = candidates.filter((r) => !r.goal && r.fits).sort((a, b) => b.points - a.points || a.turns.length - b.turns.length || a.name.localeCompare(b.name));
    const skipped = [];
    rest.forEach((r) => {
      if (got >= (o.need || 0)) return;
      const turn = r.turns.find((t) => !used.has(t));
      if (turn == null) { skipped.push(Object.assign({ why: "clash" }, r)); return; }
      used.add(turn);
      agenda.push(Object.assign({ turn, free: false }, r));
      got += r.points;
    });
    agenda.sort((a, b) => a.turn - b.turn);
    const extra = agenda.filter((r) => !r.free).length;
    return { candidates, agenda, points: got, extraRaces: extra, reached: got >= (o.need || 0), skipped, unfit: candidates.filter((r) => !r.goal && !r.fits) };
  }

  const api = { WIN_POINTS, GREAT, GOOD, together, total, symbol, g1Races, goalG1s, planRaces, shared };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaAffinity = api;
})(typeof window !== "undefined" ? window : globalThis);
