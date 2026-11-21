// General grandparents by running style (general-parents.js, data/general-parents.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../general-parents.js");
const A = require("../affinity.js");
const VP = require("../vet-plan.js");
const D = require("../data/gametora.js");
const SV = require("../data/skillvalues/index.js");
const RS = require("../data/race-skills.json");
const SP = require("../data/skill-purchases.js");

const meta = SP.skills || SP;
const family = (id) => (meta[id] ? String(meta[id][0]) : String(id));
const STYLE_NO = { Nige: 1, Senkou: 2, Sasi: 3, Oikomi: 4 };
const cond = (id) => ((RS.skills[id] || {}).alternatives || []).map((a) => a.condition).join("|");

test("general lists: every skill is a white the game knows, in every list of each style", () => {
  G.STYLES.forEach((st) => {
    const L = G.list(st);
    assert.ok(L.filter((x) => x.tier === "short").length === 4, st + ": uma.guide's first 4");
    L.forEach((x) => {
      // Lane, vision and wit skills have no simulator entry: the purchase data has them.
      assert.ok(meta[x.id], st + " " + x.id + " known");
      assert.equal(meta[x.id][3], 1, st + " " + x.id + " is a white");
      if (SV.skills[x.id]) assert.equal(SV.skills[x.id][2], 1, st + " " + SV.skills[x.id][0] + " is a white");
    });
    assert.equal(new Set(L.map((x) => x.id)).size, L.length, st + ": each skill once");
    (G.altList(st) || []).forEach((id) => assert.ok(L.some((x) => x.id === id), st + " alt " + id + " is on the lists"));
  });
});

test("general lists: each list is the right style's (a style-only skill fires for that style), none from another style", () => {
  G.STYLES.forEach((st) => {
    G.list(st).forEach((x) => {
      const c = cond(x.id), m = c.match(/running_style==(\d)/g) || [];
      m.forEach((k) => assert.equal(+k.slice(-1), STYLE_NO[st], `${st}: ${x.id} needs running_style ${k.slice(-1)}`));
    });
  });
  // The skills that told the lists apart.
  assert.ok(G.shortList("Nige").includes("201262"), "Dodging Danger: Front Runners");
  assert.ok(G.list("Senkou").some((x) => x.id === "201332"), "Shrewd Step: Pace Chasers");
  assert.ok(G.shortList("Sasi").includes("202452"), "Pedal to the Metal: Late Surgers");
  assert.ok(G.shortList("Oikomi").includes("202161"), "Restraint: End Closers");
  assert.ok(G.shortList("Nige").includes("201601") && G.shortList("Senkou").includes("201601"), "front: Groundwork");
  assert.ok(G.shortList("Sasi").includes("201591") && G.shortList("Oikomi").includes("201591"), "back: Uma Stan");
});

test("general targets: first 4 weigh most, then long-term, then straights and corners; skills not out are dropped", () => {
  const t = G.targets("Senkou");
  assert.equal(t.targets["201601"], 1);
  assert.equal(t.targets["210111"], G.WEIGHT.long);
  assert.equal(t.targets["200332"], G.WEIGHT.corner);
  assert.equal(t.why["201601"], "general-short");
  const out = G.targets("Senkou", { out: (id) => id !== "210111" });
  assert.ok(!("210111" in out.targets) && "201601" in out.targets);
  assert.ok(!("201242" in t.targets), "no other style's straights");
});

test("general per character: her list skills from innate and awakening, her A/S pinks with the style first", () => {
  const t = { apt: ["A", "G", "F", "C", "A", "A", "G", "A", "B", "C"], is: [201611], as: [200492, 201591] };
  const own = G.own(t, "Senkou", family).map((x) => x.id + ":" + x.how);
  assert.deepEqual(own.sort(), ["200492:awakening", "201591:awakening", "201611:innate"]);
  const pk = G.pinks(t.apt, "Senkou");
  assert.equal(pk[0].label, "Pace");
  assert.deepEqual(pk.map((p) => p.label), ["Pace", "Medium", "Long", "Turf"]);
  assert.deepEqual(G.pinks(t.apt, "Sasi").map((p) => p.label), ["Medium", "Long", "Turf"], "B in the style: no style pink");
});

test("general race plan: G1s that fit her (B+), each on its own turn, never her own goals, common goals first", () => {
  const cids = [...new Set(D.trainees.filter((t) => t.en).map((t) => t.cid))];
  const shares = G.goalShares(A, cids);
  assert.ok(shares.get("Arima Kinen") > 0.5, "Arima Kinen is most characters' goal");
  const sw = D.trainees.find((t) => t.cid === 1001 && t.en);
  const plan = G.racePlan(A, 1001, sw.apt, shares);
  const goals = new Set(plan.goals), races = A.g1Races();
  assert.ok(plan.extra.length > 0);
  assert.equal(new Set(plan.extra.map((r) => r.turn)).size, plan.extra.length, "one race a turn");
  plan.extra.forEach((r) => {
    assert.ok(!goals.has(r.name), r.name + " isn't a goal");
    assert.ok(A.fits(sw.apt, races.find((x) => x.name === r.name), "B"), r.name + " fits her");
  });
  assert.ok(plan.shared >= plan.goals.reduce((n, g) => n + (shares.get(g) || 0), 0));
});

test("general ranking: only A or S in the style; trio + shared G1s + list skills", () => {
  const cids = [...new Set(D.trainees.filter((t) => t.en).map((t) => t.cid))];
  const version = (cid, st) => D.trainees.filter((t) => t.cid === cid && t.en).sort((a, b) => "SABCDEFG".indexOf(a.apt[G.STYLE_APT[st]]) - "SABCDEFG".indexOf(b.apt[G.STYLE_APT[st]]))[0];
  const rows = G.rank("Oikomi", { A, cids, version, family, shares: G.goalShares(A, cids) });
  assert.ok(rows.length >= 3);
  rows.forEach((r) => {
    assert.ok(["A", "S"].includes(r.grade), r.t.n);
    assert.ok(Math.abs(r.score - (r.trio + r.shared + 2 * r.own.length)) < 1e-9);
  });
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].score >= rows[i].score);
});

const vet = (id, cid, self, parents = []) => ({ id, cid, self: Object.assign({ white: [], blue: [0, 0], pink: [0, 0], green: 0 }, self), parents });

test("veterans as general grandparents: list whites by tier and stars, her parents at half, stamina blue, style pink", () => {
  const a = vet(1, 1, { white: [["201601", 3]] }), b = vet(2, 2, { white: [["200332", 3]] }), c = vet(3, 3, {}, [{ white: [["201601", 3]] }]);
  const d = vet(4, 4, { white: [["201601", 3]], blue: [1, 3], pink: [7, 3] });
  const f = (v) => G.vetFit(v, "Senkou", family).score;
  assert.ok(f(a) > f(b), "first 4 over a corner skill");
  assert.ok(Math.abs(f(c) - f(a) / 2) < 1e-9, "on her parents: half");
  assert.ok(f(d) > f(a), "stamina blue and a Pace pink add");
  assert.equal(G.vetFit(vet(5, 5, { white: [["201242", 3]] }), "Senkou", family).score, 0, "another style's straights don't count");
});

test("veteran cleanout keeps each style's best general grandparent", () => {
  const vets = [vet("p", 1, { white: [["201601", 3], ["200492", 2]] }), vet("q", 2, { white: [["201601", 1]] }), vet("r", 3, { white: [["202161", 3]] })];
  const marks = VP.cleanout(vets, { general: (v, st) => G.vetFit(v, st, family).score, styleName: (st) => G.STYLE_LABEL[st] });
  assert.ok(marks.get("p").why.some((w) => /general Pace Chaser/.test(w)));
  assert.ok(marks.get("r").why.some((w) => /general End Closer/.test(w)));
  assert.ok(!marks.get("q").why.some((w) => /general/.test(w)), "not the best of any style");
});

// ---------- Her own parents: your veteran and a borrow ----------
const F = require("../family.js");
const m = (cid, white = [], wins = []) => ({ cid, tid: cid * 100 + 1, white, blue: [1, 3], pink: [0, 0], green: 0, wins });
const vetOf = (id, cid, white, parents = [m(1003), m(1004)], wins = []) => ({ id, cid, tid: cid * 100 + 1, saddles: [10, 11], self: m(cid, white, wins), parents });
const o = { A, F, family };
const me = { cid: 1001, tid: 100101 };

test("her parents: list hints from your veteran's side, her parents' sparks too, scaled by each one's affinity", () => {
  const a = vetOf(1, 1002, [["201601", 3]]), b = vetOf(2, 1002, [["201601", 1]]);
  const ha = G.parentHints("Senkou", me, a, null, o), hb = G.parentHints("Senkou", me, b, null, o);
  const ga = ha.hints.find((h) => h.id === "201601");
  assert.ok(ga && ga.p > hb.hints.find((h) => h.id === "201601").p, "3★ over 1★");
  const own = A.individual({ trainee: 1001, p1: 1002, g11: 1003, g12: 1004 }, {}).p1;
  const p = F.twice(F.WHITE, 3, own, 1);
  assert.ok(Math.abs(ga.p - p) < 1e-9, "the family.js chance at her own affinity");
  const line = vetOf(3, 1002, [], [m(1003, [["201601", 3]]), m(1004)]);
  assert.ok(G.parentHints("Senkou", me, line, null, o).hints.some((h) => h.id === "201601" && h.from[0] === "g11"), "her parent's spark counts");
  assert.equal(G.parentHints("Senkou", me, vetOf(4, 1002, [["201242", 3]]), null, o).hints.length, 0, "another style's skill doesn't");
});

test("her parents: veterans of her own character can't be her parent; rentals can't repeat her or your veteran", () => {
  const vets = [vetOf(1, 1001, [["201601", 3]]), vetOf(2, 1002, [["201601", 2]]), vetOf(3, 1005, [["200492", 3]])];
  const rows = G.rankParentVets("Senkou", me, vets, o);
  assert.ok(!rows.some((x) => x.v.cid === 1001));
  assert.ok(rows[0].value >= rows[1].value);
  const rent = (friend, cid, white) => ({ friend, names: ["x"], parent: m(cid, white), parents: [m(1006), m(1007)] });
  const rr = G.rankParentRentals("Senkou", me, vets[1], [rent("a", 1001, []), rent("b", 1002, []), rent("c", 1008, [["210101", 3]]), rent("d", 1009, [])], o);
  assert.deepEqual(rr.map((x) => x.r.friend), ["c", "d"]);
  assert.ok(rr[0].hints.some((h) => h.id === "210101" && h.from.includes("p2")));
});

test("her parents: the borrow's uma.moe query skips what your side already hints, list by tier, Stamina 3★ on her, no pink", () => {
  const v = vetOf(2, 1002, [["201601", 3]]);
  const side = { hints: [{ id: "201601", p: 0.6 }, { id: "200492", p: 0.2 }] };
  const q = G.borrowQuery("Senkou", me, v, side, { outNow: (id) => id !== "210111" });
  assert.equal(q.ace, 100101);
  assert.deepEqual(q.p1, { tid: v.tid, saddles: [10, 11] });
  assert.ok(!q.whites.some((w) => w.id === "201601"), "covered 50%+");
  assert.ok(q.whites.some((w) => w.id === "200492" && w.priority === 0), "first 4: P0");
  assert.ok(q.whites.some((w) => w.id === "201611" && w.priority === 1), "long-term: P1");
  assert.ok(q.whites.some((w) => w.id === "200332" && w.priority === 2), "corners: P2");
  assert.ok(!q.whites.some((w) => w.id === "210111"), "not on Global");
  assert.deepEqual(q.blueRows, { main: [1, 3], line: [] });
  assert.equal(q.pink, null);
});

test("her parents: the deck counts a skill less by the chance they hint it (never under a quarter); their G1s go first in her plan", () => {
  const t = G.targetsAfter("Senkou", [{ id: "201601", p: 0.4 }, { id: "200492", p: 0.95 }]);
  assert.ok(Math.abs(t.targets["201601"] - 0.6) < 1e-9);
  assert.ok(Math.abs(t.targets["200492"] - 0.25) < 1e-9);
  assert.equal(t.targets["201591"], 1);
  const cids = [...new Set(D.trainees.filter((x) => x.en).map((x) => x.cid))], shares = G.goalShares(A, cids);
  const sw = D.trainees.find((x) => x.cid === 1001 && x.en);
  const free = G.racePlan(A, 1001, sw.apt, shares), rare = A.g1Races().map((r) => r.name).filter((n) => !free.goals.includes(n) && A.fits(sw.apt, A.g1Races().find((r) => r.name === n), "B")).sort((a, b) => (shares.get(a) || 0) - (shares.get(b) || 0))[0];
  const withParents = G.racePlan(A, 1001, sw.apt, shares, [rare]);
  assert.ok(withParents.extra.some((r) => r.name === rare && r.parents), "her parent's G1 is planned");
});
