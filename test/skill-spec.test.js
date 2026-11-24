// The CM & LoH skill optimizer spec's scoring (skill-spec.js): reliability, traits, set value
// (bonuses, acceleration decay, Groundwork), the beam search and the race check's objective.
const test = require("node:test");
const assert = require("node:assert");
const SS = require("../skill-spec.js");
const CAT = require("../data/race-skills.json");
const SV = require("../data/skillvalues/index.js");
const byName = (re) => Object.keys(SV.skills).find((id) => re.test(SV.skills[id][0]) && CAT.skills[id]);

test("reliability: fragile positional triggers keep part of their gain", () => {
  assert.strictEqual(SS.reliability(["is_surrounded==1&phase==2"]), 0.65);
  assert.strictEqual(SS.reliability(["near_count>=3"]), 0.75);
  assert.strictEqual(SS.reliability(["behind_near_lane_time>=1"]), 0.7);
  assert.strictEqual(SS.reliability(["infront_near_lane_time>=1&is_lastspurt==1"]), 0.7);
  assert.strictEqual(SS.reliability(["is_surrounded==1&near_count>=2"]), 0.65 * 0.75);
  assert.strictEqual(SS.reliability(["phase==1&corner==0"]), 1);
});

test("traits from the simulator's data: phase, effect kind, Groundwork's start count", () => {
  const gw = SS.traits(CAT.skills[byName(/^Groundwork$/)]);
  assert.strictEqual(gw.needStart, 3);
  assert.ok(gw.accel > 0);
  const haste = SS.traits(CAT.skills[byName(/^Homestretch Haste$/)]);
  assert.ok(haste.late && haste.speed && !haste.current);
  const heal = SS.traits(CAT.skills[byName(/^Swinging Maestro$/)]);
  assert.ok(heal.heal);
  const greens = Object.values(CAT.skills).map(SS.traits).filter((t) => t && t.green);
  assert.ok(greens.length > 20, "green skills found");
});

test("set value: early/mid speed bonus, late-acceleration decay, Groundwork's gate", () => {
  const info = {
    a1: { late: true, accel: 1.2, reliability: 1 }, a2: { late: true, accel: 1.2, reliability: 1 },
    mid: { mid: true, speed: true, reliability: 1 }, gw: { early: true, accel: 0.6, needStart: 3, reliability: 1 },
    g1: { green: true, reliability: 1 }, g2: { green: true, reliability: 1 },
  };
  const base = { a1: 1, a2: 0.8, mid: 1, gw: 0.5, g1: 0, g2: 0 };
  const two = SS.setValue(["a1", "a2"], base, info, [], { alpha: 0.4 });
  assert.strictEqual(two.per.a1, 1, "the stronger acceleration counts in full");
  assert.ok(Math.abs(two.per.a2 - 0.8 / (1 + 0.4 * 1.2)) < 1e-9, "the next one decays");
  assert.ok(Math.abs(SS.setValue(["mid"], base, info, [], { mid: 1.1 }).per.mid - 1.1) < 1e-9);
  assert.strictEqual(SS.setValue(["gw"], base, info, ["g1"], {}).per.gw, 0, "Groundwork needs 3 others at the start");
  assert.strictEqual(SS.setValue(["gw", "g2"], base, info, ["g1", "x"], {}).per.gw, 0, "only 2 others");
  info.g3 = { green: true, reliability: 1 };
  assert.strictEqual(SS.setValue(["gw", "g2"], base, info, ["g1", "g3"], {}).per.gw, 0.5, "3 others: it counts");
});

test("beam search: within the SP, never below the exact knapsack's set by the spec's value", () => {
  const ids = Object.keys(CAT.skills).filter((id) => SV.skills[id] && SV.skills[id][1] > 0).slice(0, 40);
  const values = {}; ids.forEach((id, i) => { values[id] = ((i * 37) % 11) / 10; });
  const info = {}; ids.forEach((id) => { info[id] = SS.traits(CAT.skills[id]); });
  for (const sp of [300, 700, 1200]) {
    const r = SS.solve({ learned: [], available: ids, hints: {}, sp, fast: false, values, info, cfg: { beam: 30 } });
    assert.ok(r.spent <= sp);
    assert.ok(r.spec.value >= r.spec.exactValue - 1e-9, "beam " + r.spec.value + " vs exact " + r.spec.exactValue);
  }
});

test("race check objective: mean plus k times the spread; CM seeks upside, LoH steadiness", () => {
  assert.strictEqual(SS.kFor("cm"), 0.35);
  assert.strictEqual(SS.kFor("loh"), -0.75);
  const steady = { mean: 1, sd: 0.2 }, swingy = { mean: 0.9, sd: 1.0 };
  assert.ok(SS.objective(swingy, SS.kFor("cm")) > SS.objective(steady, SS.kFor("cm")));
  assert.ok(SS.objective(steady, SS.kFor("loh")) > SS.objective(swingy, SS.kFor("loh")));
});
