// Inheritance in the career sim (optimizer.js inheritFrom): parents' blue sparks at the start and
// at the two inspirations, raising the predicted stats.
const test = require("node:test");
const assert = require("node:assert");
const D = require("../deck.js");
const O = require("../optimizer.js");
const { SCENARIOS } = require("../scenarios.js");

test("inheritFrom: start bonus by stars, inspiration chance by affinity", () => {
  const inh = O.inheritFrom([{ blue: [0, 3], aff: 50 }, { blue: [0, 1], aff: 0 }, { blue: [1, 2], aff: 200 }, { blue: [2, 0] }]);
  assert.deepStrictEqual(inh.start, [26, 12, 0, 0, 0]);
  assert.strictEqual(inh.sparks.length, 3);
  assert.ok(Math.abs(inh.sparks[0].p - 0.9 * 1.5) < 1e-9 || inh.sparks[0].p === 1);
  assert.strictEqual(inh.sparks[1].p, 0.7);
  assert.strictEqual(inh.sparks[2].p, 1, "capped at certain");
  assert.deepStrictEqual(inh.sparks.map((b) => b.most), [28, 10, 16]);
  assert.strictEqual(O.inheritFrom([]), null);
  assert.deepStrictEqual(O.INSPIRATION_TURNS, [31, 55]);
});

test("the career sim adds inheritance: more of the sparked stats, same seeds otherwise", () => {
  const ura = SCENARIOS.find((s) => s.id === "ura");
  const cards = D.DATA.supports.filter((c) => c.r === 3 && D.onGlobal(c, "2026-11-23")).slice(0, 6).map((c) => ({ card: c, lb: 4 }));
  const base = O.simulate(O.buildCtx({ scenario: ura, build: "medium", runs: 8 }), cards);
  const inh = O.inheritFrom([{ blue: [1, 3], aff: 100 }, { blue: [1, 3], aff: 100 }, { blue: [2, 2], aff: 100 }]);
  const withInh = O.simulate(O.buildCtx({ scenario: ura, build: "medium", runs: 8, inherit: inh }), cards);
  assert.ok(withInh.stats[1] > base.stats[1] + 30, "stamina: " + base.stats[1] + " -> " + withInh.stats[1]);
  assert.ok(withInh.stats[2] > base.stats[2], "power up too");
});

test("must-have inherited uniques: the top group when it stands clear of the rest", () => {
  const F = require("../family.js");
  const ids = (l) => [...F.mustUniques(l.map((L, i) => ({ id: i, L })))].map(Number);
  assert.deepEqual(ids([6.01, 5.58, 2.39, 2.39]), [0, 1]); // two clear picks
  assert.deepEqual(ids([4, 1, 0.9]), [0]);
  assert.deepEqual(ids([2, 1.9, 1.85, 1.8, 1.7]), []); // falls off evenly: none
  assert.deepEqual(ids([0.8, 0.2]), []); // under 1 L: none
  assert.deepEqual(ids([3]), [0]);
});
