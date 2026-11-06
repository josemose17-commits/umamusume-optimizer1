const test = require("node:test");
const assert = require("node:assert/strict");
const PP = require("../parent-planner.js");
const R = require("../rating.js");
const SB = require("../skill-budget.js");
const D = require("../deck.js");
const A = require("../affinity.js");

test("one parent goal selects the S or SS threshold, or no minimum", () => {
  assert.deepEqual(PP.ratingGoal("S", R), { label: "S", minimum: 14500 });
  assert.deepEqual(PP.ratingGoal("SS", R), { label: "SS", minimum: 17500 });
  assert.deepEqual(PP.ratingGoal(undefined, R), { label: "SS", minimum: 17500 });
  assert.deepEqual(PP.ratingGoal("", R), { label: "", minimum: 0 });
});

test("parent race limit keeps 75% at the chosen rank, rather than using the mean", () => {
  const points = [{ n: 0, ratings: [12000, 17500, 18000, 19000] }, { n: 3, ratings: [12000, 16000, 17000, 18000] }, { n: 6, ratings: [11000, 14500, 16000, 17000] }, { n: 9, ratings: [10000, 13000, 14500, 16000] }];
  assert.equal(PP.raceLimit(points, PP.ratingGoal("SS", R).minimum).most, 0);
  assert.equal(PP.raceLimit(points, PP.ratingGoal("S", R).minimum).most, 6);
  assert.equal(PP.raceLimit(points, 20000).none, true);
  assert.equal(PP.raceLimit(points, 0).unlimited, true);
});

test("an S parent skill buy can keep relevance when SS would require more rating", () => {
  const goalS = PP.ratingGoal("S", R), goalSS = PP.ratingGoal("SS", R);
  const solver = SB.create({ skills: { "200012": 200, "200352": 100 }, available: ["200012", "200352"], lengthValue: 1 });
  const s = solver.solveSS({}, 170, { gap: goalS.minimum - 14500, relevant: { "200352": 1 } });
  const ss = solver.solveSS({}, 170, { gap: goalSS.minimum - 14500, relevant: { "200352": 1 } });
  assert.equal(s.selected[0].id, "200352");
  assert.equal(ss.selected[0].id, "200012");
});

test("the parent calendar keeps her career goals without charging extra races", () => {
  const t = D.trainee(100101), state = { parents: { self: t.cid, selfTrainee: t.id, races: [] } };
  const planner = PP.create({ D, A, R, SB, esc: String, state: () => state, coachTrainee: () => t });
  const plan = planner.schedule(), goals = A.careerGoals(t.cid);
  assert.equal(plan.extra.length, 0);
  assert.equal(plan.agenda.length, goals.fixed.length + goals.choices.length);
  assert.ok(plan.agenda.every(r => r.free));
});
