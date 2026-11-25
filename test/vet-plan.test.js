const test = require("node:test");
const assert = require("node:assert");
const VP = require("../vet-plan.js");

const vet = (id, cid, self, parents = []) => ({ id, cid, self: Object.assign({ white: [], blue: [0, 0], pink: [0, 0], green: 0 }, self), parents });

test("exit points: good blue and cup pink, most useful whites first", () => {
  const vets = [
    vet("a", 1, { blue: [1, 3], pink: [4, 2], white: [["s1", 2]] }),
    vet("b", 2, { blue: [1, 2], pink: [4, 3], white: [["s1", 1], ["s2", 1]] }, [{ white: [["s3", 2]] }]),
    vet("c", 3, { blue: [1, 1], pink: [4, 3] }), // 1★ blue
    vet("d", 4, { blue: [0, 3], pink: [4, 3] }), // speed: not needed
    vet("e", 5, { blue: [1, 3], pink: [5, 3] }), // Long pink on a Medium cup
  ];
  const out = VP.exitPoints(vets, { pinks: [0, 4, 7], blues: [1, 2], useful: new Set(["s1", "s2", "s3"]) });
  assert.deepStrictEqual(out.map((e) => e.v.id), ["b", "a"]);
  assert.strictEqual(out[0].whites, 2);
  assert.strictEqual(out[0].lineWhites, 1);
});

test("exit points in Grand Live: 2★ stamina or 3★ guts/wit", () => {
  const vets = [vet("st", 1, { blue: [1, 2], pink: [4, 2] }), vet("g2", 2, { blue: [3, 2], pink: [4, 2] }), vet("w3", 3, { blue: [4, 3], pink: [4, 2] }), vet("sp", 4, { blue: [0, 3], pink: [4, 2] })];
  const ids = VP.exitPoints(vets, { pinks: [4], blues: [0], grandLive: true }).map((e) => e.v.id).sort();
  assert.deepStrictEqual(ids, ["st", "w3"]);
});

test("cleanout keeps the best per pink, per character and lone whites", () => {
  const vets = [
    vet("m1", 1, { blue: [1, 3], pink: [3, 3] }),
    vet("m2", 2, { blue: [1, 1], pink: [3, 1] }),
    vet("g1", 3, { blue: [1, 1], pink: [0, 0], green: 3 }),
    vet("g2", 3, { blue: [1, 2], pink: [0, 0], green: 2 }),
    vet("w", 4, { white: [["rare", 2]] }),
    vet("x", 5, { white: [["rare2", 1]] }),
  ];
  const m = VP.cleanout(vets);
  assert.ok(m.get("m1").keep);
  assert.ok(!m.get("m2").keep);
  assert.ok(m.get("g1").keep, "g1's 3★ green: the better of character 3");
  assert.ok(!m.get("g2").keep);
  assert.ok(m.get("w").keep);
  assert.ok(!m.get("x").keep, "a 1★ white alone isn't worth keeping");
});

test("grandparent rule check: own affinity vs half the parent's", () => {
  const F = require("../family.js");
  const s = { own: { p1: 40, g11: 10 }, white: [{ slot: "g11", stars: 3 }, { slot: "p1", stars: 3 }] };
  const g = VP.grandCheck(s, F);
  assert.strictEqual(g.slots, 1);
  assert.ok(Math.abs(g.app - F.twice(F.WHITE, 3, 10, F.GRAND)) < 1e-9);
  assert.ok(Math.abs(g.video - F.twice(F.WHITE, 3, 20, F.GRAND)) < 1e-9);
});

test("grade: a veteran as a parent for one ace (Keep / Usable / Retrain)", () => {
  const VP = require("../vet-plan.js");
  const o = { blue: [1, 2], pinks: [5], whites: ["fa", "fb", "fc", "fd", "fe"], family: (id) => id };
  const v = (blue, pink, white) => ({ self: { blue, pink, white } });
  assert.strictEqual(VP.grade(v([1, 3], [5, 2], [["fa", 2], ["fc", 1]]), o).mark, "keep");
  assert.strictEqual(VP.grade(v([1, 3], [5, 2], [["fa", 2], ["fe", 3]]), o).mark, "usable", "fe isn't a top-4 target");
  assert.strictEqual(VP.grade(v([2, 2], [5, 1], []), o).mark, "usable");
  const wrong = VP.grade(v([0, 3], [5, 3], [["fa", 3], ["fb", 3]]), o);
  assert.strictEqual(wrong.mark, "retrain");
  assert.ok(wrong.why.some((w) => /stat she isn't short/.test(w)));
  assert.strictEqual(VP.grade(v([1, 3], [4, 3], []), o).mark, "retrain", "no pink for a needed aptitude");
  assert.strictEqual(VP.grade(v([1, 3], [0, 0], [["fa", 1], ["fb", 1]]), Object.assign({}, o, { pinks: [] })).mark, "keep", "no pink needed");
});
