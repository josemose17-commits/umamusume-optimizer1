const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../deck.js");
const T = require("../tiers.js");
const A = require("../affinity.js");
const B = require("../data/banners.js");
const P = require("../data/presets.js");
const PV = require("../pull-values.js");
const PP = require("../pull-planner.js");

// The Dirt team (El Condor Pasa, Copano Rickey and Valentine Yukino Bijin, all Pace Chasers) over
// 18 months, with a fixed sample collection.
const today = "2026-11-04", until = "2028-05-04";
const skills = (p, style) => { const L = {}; require("../data/skillvalues/" + p.id + ".json")[style].forEach(([id, m]) => { L[id] = m / 100; }); return L; };
let seed = 5;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const owned = {};
D.DATA.supports.filter((c) => D.onGlobal(c, today) && c.r >= 2).forEach((c) => { if (rnd() < 0.5) owned[c.id] = Math.floor(rnd() * 5); });
const teams = { sm: [], ml: [], dirt: [{ id: 101401, style: "Senkou" }, { id: 109801, style: "Senkou" }, { id: 102902, style: "Senkou" }] };
const make = (extra) => PV.create(Object.assign({ D, T, A, B, P, today, until, teams, owned, umas: new Set([101401]),
  deckOpts: (p, style, tid) => ({ scenario: "GM", trainee: tid, skills: skills(p, style), costs: {}, skillWeight: 1, borrow: true }),
  whites: () => [1, 0.8, 0.6], skillL: (p, style, id) => skills(p, style)[id] || 0 }, extra || {}));
// One prepared run, shared (decks are the slow part).
let base = null;
const prepared = () => {
  if (base) return base;
  base = make();
  base.pairs.forEach((pair) => base.buildPair(pair));
  base.prepare();
  return base;
};

test("your team counts as yours: every Dirt cup ahead has all three, out on Global or not", () => {
  const v = make();
  const dirtCups = P.list.filter((p) => p.global.start > today && p.global.start <= until && PV.groupOf(p) === "dirt");
  assert.equal(v.pairs.length, dirtCups.length * 3);
  const out = B.release.trainees["102902"];
  assert.ok(v.pairs.some((x) => x.trainee.id === 102902 && x.date < out), "Valentine Yukino Bijin races before her Global release");
  assert.ok(v.items.every((it) => it.kind !== "trainee" || it.feat.every((f) => !v.team.has(f.id))), "no carats go to a team uma");
  assert.ok(v.items.every((it) => !it.required));
});

test("banners are 200 or 400 pulls; the $20.99 packs bring 1,500 carats each", () => {
  const v = make();
  v.items.filter((it) => it.kind === "support").forEach((it) => {
    assert.equal(it.most, 2);
    assert.equal(it.pullsAt(1), 200);
    assert.equal(it.pullsAt(2), 400);
  });
  const anniv = (B.events || []).filter((e) => e.start > today && e.start <= until);
  assert.ok(anniv.length >= 3, "anniversaries in the window");
  assert.equal(v.selectors.length, anniv.length * 3, "free and $20.99 support selectors and the $20.99 Uma selector");
  assert.equal(v.bonus.length, anniv.length * 2);
  assert.ok(v.bonus.every((b) => b.carats === 1500));
  const none = make({ selectors: { free: false, paid: false, uma: false } });
  assert.equal(none.selectors.length + none.bonus.length, 0);
});

test("your decks now: six cards each, kept as they were before the route", () => {
  const v = prepared();
  assert.ok(v.pairs.every((pair) => pair.deck && pair.deck.length === 6 && pair.base.length === 6));
  assert.ok(v.pairs.every((pair) => pair.deck.filter((c) => c.borrowed).length === 1), "one friend's card each");
  // The decks are built from your cards: every owned slot is a card you have, at your limit break.
  v.pairs.forEach((pair) => pair.base.filter((c) => !c.borrowed).forEach((c) => assert.equal(c.lb, owned[c.id], D.card(c.id).n)));
});

test("a card counts only where it's clearly stronger, in enough cups; a banner only if its likely result is", () => {
  const v = prepared();
  const sup = v.items.filter((it) => it.kind === "support");
  const vals = sup.map((it) => ({ it, v1: v.value(it.key, 1), v2: v.value(it.key, 2) }));
  assert.ok(vals.some((x) => x.v1 > 0 || x.v2 > 0), "some banner clears the rules for the Dirt team");
  vals.forEach((x) => assert.ok(x.v2 >= x.v1 - 1e-6, "400 pulls are worth at least 200: " + x.it.key));
  // Stricter rules never add value; looser ones never take it away (same decks, reused).
  const strict = make({ minPct: 0.3, minCups: 3, reuse: v });
  strict.pairs.forEach((pair) => strict.buildPair(pair));
  strict.prepare();
  const loose = make({ minPct: 0.05, minCups: 1, reuse: v });
  loose.pairs.forEach((pair) => loose.buildPair(pair));
  loose.prepare();
  assert.deepEqual(strict.pairs.map((p) => p.base.map((c) => c.id)), v.pairs.map((p) => p.base.map((c) => c.id)), "reused decks");
  sup.forEach((it) => {
    const s = strict.value(it.key, 2), m = v.value(it.key, 2), l = loose.value(it.key, 2);
    assert.ok(s <= m + 1e-6 && m <= l + 1e-6, it.key + ": " + [s, m, l].join(" ≤ "));
  });
  // A banner worth nothing at 200 pulls has a likely result (spark + median pulls) that doesn't
  // clear the rules.
  const zero = vals.find((x) => x.v1 === 0 && x.v2 > 0);
  if (zero) {
    const r = v.review(zero.it.key);
    assert.ok(r.cards.some((c) => c.clear >= 2), "clear at LB4 in two cups, not at LB1");
  }
});

test("the route: selector picks first and free, only 200 or 400 pulls, never below zero carats", () => {
  const v = make({ reuse: prepared() });
  v.pairs.forEach((pair) => v.buildPair(pair));
  v.prepare();
  const plan = PP.plan(v.items, { today, carats: 30000, perMonth: 3000, bonus: v.bonus, value: (k, n) => v.value(k, n), onStep: (s) => v.commit(s.key, s.k) });
  assert.ok(plan.steps.length > 0);
  assert.ok(plan.steps.every((s) => s.left >= -1e-6), "carats at every banner");
  plan.steps.forEach((s) => {
    const it = v.byKey.get(s.key);
    if (it.kind === "selector") assert.equal(s.pulls, 0);
    else assert.ok(s.pulls === 200 || s.pulls === 400, s.key + " " + s.pulls);
  });
  const perSelector = new Map();
  plan.steps.forEach((s) => { const it = v.byKey.get(s.key); if (it.kind === "selector") perSelector.set(it.sel.id, (perSelector.get(it.sel.id) || 0) + 1); });
  assert.ok([...perSelector.values()].every((n) => n === 1), "one pick per selector");
  // A pulled card goes into the decks it makes clearly stronger, in two cups or more.
  const pulled = plan.steps.find((s) => v.byKey.get(s.key).kind === "support");
  if (pulled) {
    const c = v.committed.get(pulled.key);
    const clear = c.notes.filter((x) => x.clear);
    assert.ok(new Set(clear.map((x) => x.pair.cup.id)).size >= 2, "used in two cups or more");
    clear.forEach((x) => assert.ok(x.pct >= 0.1 - 1e-9));
    assert.ok(c.spark.length === pulled.pulls / 200);
  }
});

test("Parent 1's value grows with her affinity with the ace", () => {
  const v = make();
  const pair = v.pairs.find((x) => x.trainee.id === 101401);
  const grass = D.DATA.trainees.find((t) => t.n === "Grass Wonder");
  const urara = D.DATA.trainees.find((t) => t.n === "Haru Urara");
  const ga = v.parentAffinity(pair.trainee.cid, grass.cid), ua = v.parentAffinity(pair.trainee.cid, urara.cid);
  assert.ok(ga > ua, "El Condor Pasa and Grass Wonder are closer than El Condor Pasa and Haru Urara");
  const flat = make({ deckOpts: () => ({}), skillL: () => 0 });
  const fp = flat.pairs.find((x) => x.trainee.id === 101401);
  assert.ok(flat.parentValue(fp, grass) > flat.parentValue(fp, urara));
  assert.equal(flat.parentValue(fp, fp.trainee), 0, "she can't be her own parent");
});

test("copies after the pulls: the spark plus the binomial, capped at LB4", () => {
  const v = make();
  const d = v.copiesDist(0.0075, 200, 0, 1);
  assert.equal(d[0], 0, "the spark makes one copy certain");
  assert.ok(Math.abs(d.reduce((a, x) => a + x, 0) - 1) < 1e-9);
  assert.equal(PV.median(PV.binom(200, 0.0075)), 1, "200 pulls likely bring one more copy");
  assert.equal(PV.median(PV.binom(400, 0.0075)), 3);
  assert.equal(v.copiesDist(0.0075, 400, 3, 2)[5], 1, "two sparks from LB2 always reach LB4");
});
