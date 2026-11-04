const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../deck.js");
const T = require("../tiers.js");
const A = require("../affinity.js");
const B = require("../data/banners.js");
const P = require("../data/presets.js");
const PV = require("../pull-values.js");
const PP = require("../pull-planner.js");

// The Dirt team (El Condor Pasa, Copano Rickey and Valentine Yukino Bijin, all Pace Chasers) over a
// year, with a fixed sample collection.
const today = "2026-11-04", until = "2027-11-04";
const skills = (p, style) => { const L = {}; require("../data/skillvalues/" + p.id + ".json")[style].forEach(([id, m]) => { L[id] = m / 100; }); return L; };
let seed = 5;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const owned = {};
D.DATA.supports.filter((c) => D.onGlobal(c, today) && c.r >= 2).forEach((c) => { if (rnd() < 0.5) owned[c.id] = Math.floor(rnd() * 5); });
const teams = { sm: [], ml: [], dirt: [{ id: 101401, style: "Senkou" }, { id: 109801, style: "Senkou" }, { id: 102902, style: "Senkou" }] };
const umas = new Set([101401, 109801]);
const make = () => PV.create({ D, T, A, B, P, today, until, teams, owned, umas,
  deckOpts: (p, style, tid) => ({ scenario: "GM", trainee: tid, skills: skills(p, style), costs: {}, skillWeight: 1, borrow: true }),
  whites: () => [1, 0.8, 0.6], skillL: (p, style, id) => skills(p, style)[id] || 0 });

test("a team uma you don't own is required on her first banner, and sits out cups before she's on Global", () => {
  const v = make();
  const req = v.items.filter((it) => it.required);
  assert.deepEqual(req.map((it) => it.id), [102902]);
  const first = B.trainee.find((b) => b.pick.some(([id]) => id === 102902));
  assert.equal(req[0].banner.id, first.id);
  const out = B.release.trainees["102902"];
  assert.ok(v.pairs.filter((x) => x.trainee.id === 102902).every((x) => x.date >= out), "only cups after her Global release");
  assert.ok(v.pairs.some((x) => x.trainee.id === 101401), "El Condor Pasa races every Dirt cup");
  assert.ok(v.pairs.every((x) => x.group === "dirt"));
});

test("a card's value counts the decks it improves after its banner, and more copies never lower it", () => {
  const v = make();
  v.pairs.forEach((pair) => v.buildPair(pair));
  assert.ok(v.pairs.every((pair) => pair.deck && pair.deck.length === 6), "every deck has six cards");
  const sup = v.items.filter((it) => it.kind === "support");
  const valued = sup.map((it) => ({ it, v1: v.value(it.key, 1), v5: v.value(it.key, Math.min(5, 5 - it.have)) })).filter((x) => x.v1 > 0);
  assert.ok(valued.length > 0, "some banner card improves a Dirt deck");
  valued.forEach((x) => assert.ok(x.v5 >= x.v1 - 1e-9, x.it.key));
  // Its value is the gains in the decks of cups after its banner.
  const x = valued[0];
  const sum = v.pairs.filter((pair) => pair.date > x.it.date).reduce((a, pair) => { const g = pair.gains.get(x.it.id + ":" + Math.min(4, x.it.have)); return a + (g ? g.gain : 0); }, 0);
  assert.ok(Math.abs(sum - x.v1) < 1e-6);
});

test("Parent 1's value grows with her affinity with the ace", () => {
  const v = make();
  const pair = v.pairs.find((x) => x.trainee.id === 101401);
  const grass = D.DATA.trainees.find((t) => t.n === "Grass Wonder");
  const urara = D.DATA.trainees.find((t) => t.n === "Haru Urara");
  const ga = v.parentAffinity(pair.trainee.cid, grass.cid), ua = v.parentAffinity(pair.trainee.cid, urara.cid);
  assert.ok(ga > ua, "El Condor Pasa and Grass Wonder are closer than El Condor Pasa and Haru Urara");
  // With the same inherited-unique value, the closer one is worth more.
  const flat = PV.create({ D, T, A, B, P, today, until, teams, owned, umas, deckOpts: () => ({}), whites: () => [1, 0.8, 0.6], skillL: () => 0 });
  const fp = flat.pairs.find((x) => x.trainee.id === 101401);
  assert.ok(flat.parentValue(fp, grass) > flat.parentValue(fp, urara));
  assert.equal(flat.parentValue(fp, fp.trainee), 0, "she can't be her own parent");
});

test("the route plans the required uma first and stays within the carats at every banner", () => {
  const v = make();
  v.pairs.forEach((pair) => v.buildPair(pair));
  const plan = PP.plan(v.items, { today, carats: 40000, perMonth: 3000, luck: "mean", value: (k, n) => v.value(k, n), onStep: (s) => v.commit(s.key, s.k) });
  const req = v.items.find((it) => it.required);
  assert.equal(plan.chosen.get(req.key), 1);
  assert.ok(plan.steps.every((s) => s.left >= -1e-6));
  assert.ok(plan.steps.some((s) => v.byKey.get(s.key).kind === "support"), "a card is worth pulling");
});
