"use strict";
const test = require("node:test");
const assert = require("node:assert");
const PR = require("../parent-relevance.js");
const RS = require("../race-skills.js");
const POS = require("../data/skill-positions.js");

const aheadId = String(POS.ahead[0]), backId = String(POS.back[0]);

test("a Front Runner who leads alone can't use rival-ahead skills; one fighting for the lead counts them at the share", () => {
  assert.equal(PR.positionMiss(POS, aheadId, "Nige"), "ahead");
  assert.equal(PR.aheadScale(POS, aheadId, "Nige"), 1, "no scale without a contest: the skill is out instead");
  const c = PR.withContest(POS, 0.3);
  assert.equal(PR.positionMiss(c, aheadId, "Nige"), null);
  assert.equal(PR.aheadScale(c, aheadId, "Nige"), 0.3);
  assert.equal(PR.positionMiss(c, backId, "Nige"), POS.ahead.map(String).includes(backId) ? null : "back", "back-half skills stay out");
  assert.equal(PR.aheadScale(c, aheadId, "Senkou"), 1, "other styles are unaffected");
  assert.equal(PR.withContest(POS, 0), POS);
});

test("the set search drops rival-ahead skills at 0 and takes the rest of a scaled skill's gain off", async () => {
  const B = require("../skill-budget.js");
  // Two skills from different families, each with no upgrade or prerequisite.
  const pool = Object.keys(B.DATA.skills).filter((id) => /^20\d{4}$/.test(id) && B.DATA.skills[id][1] > 0 && !B.DATA.skills[id][2]);
  const famOf = (id) => B.DATA.skills[id][0], solo = pool.filter((id) => pool.filter((x) => famOf(x) === famOf(id)).length === 1 && !Object.keys(B.DATA.skills).some((x) => x !== id && famOf(x) === famOf(id)));
  const [a, b] = solo;
  const catalog = { skills: { [a]: {}, [b]: {} }, meta: { [a]: { groupId: 1 }, [b]: { groupId: 2 } } };
  const gain = { [a]: 2, [b]: 1 };
  const compare = async (before, after) => RS.summary([after.filter((id) => !before.includes(id)).reduce((n, id) => n + (gain[id] || 0), 0)]);
  const base = { catalog, learned: [], available: [a, b], hints: {}, sp: 5000, values: { [a]: 2, [b]: 1 }, compare };
  const off = await RS.optimize(Object.assign({}, base, { scale: { [a]: 0 } }));
  assert.deepEqual(off.offPosition, [a]);
  assert.ok(!off.selected.some((x) => x.id === a));
  const half = await RS.optimize(Object.assign({}, base, { scale: { [a]: 0.25 } }));
  assert.ok(Math.abs(half.result.mean - (2 * 0.25 + 1)) < 1e-9, "a's 2 L kept at 25%, b's 1 L in full");
  const row = half.selected.find((x) => x.id === a);
  assert.ok(row && Math.abs(row.marginal.mean - 0.5) < 1e-9);
  assert.deepEqual(half.scaled, [a]);
});
