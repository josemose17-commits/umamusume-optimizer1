const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../skill-release.js");
const PS = require("../parent-skills.js");

// [name, cost, rarity, on Global now, first JP release]
const onGlobal = ["Global skill", 100, 1, 1, "2021-02-24"];
const early = ["JP 2023 skill", 100, 1, 0, "2023-01-10"];
const late = ["JP 2026 skill", 100, 1, 0, "2026-09-11"];
const undated = ["Undated", 100, 1, 0, null];
const future = { global: { start: "2027-03-02" }, jp: { start: "2023-10-13" } };
const running = { global: { start: "2026-10-27" }, jp: { start: "2023-01-14" } };

test("a cup Global hasn't reached counts skills JP had by that cup's JP date", () => {
  const cut = R.cutoff(future, "2026-11-01");
  assert.equal(cut, "2023-10-13");
  assert.equal(R.outBy(onGlobal, cut), true);
  assert.equal(R.outBy(early, cut), true);
  assert.equal(R.outBy(late, cut), false);
  assert.equal(R.outBy(undated, cut), false, "an unknown JP date never counts as out");
  assert.deepEqual([onGlobal, early, late].map((s) => R.status(s, cut)), ["global", "by", "jp"]);
});

test("a cup Global is running or has run counts only Global's skills now", () => {
  assert.equal(R.cutoff(running, "2026-11-01"), null);
  assert.equal(R.outBy(early, null), false);
  assert.equal(R.outBy(onGlobal, null), true);
  assert.equal(R.outBy(undefined, "2030-01-01"), false);
});

test("the parent deck's skill pool counts a JP skill out by the ace's cup", () => {
  const skills = { g: onGlobal, e: early, l: late };
  const cards = [{ id: 1, n: "A", en: "2020-01-01", hs: ["g", "e", "l"], es: [] }];
  const opts = { skills, purchases: {}, events: { cards: {}, events: {} }, globalOnly: true, today: "2026-11-01", targets: {}, must: [] };
  assert.deepEqual(PS.build(cards, opts).skills.map((s) => s.id).sort(), ["g"]);
  assert.deepEqual(PS.build(cards, Object.assign({}, opts, { skillsBy: "2023-10-13" })).skills.map((s) => s.id).sort(), ["e", "g"]);
});
