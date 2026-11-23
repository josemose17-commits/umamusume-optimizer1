// The scenario each cup's decks are trained in (pull-values.js erasFor), as CM & decks and the
// Pull planner both use it.
const test = require("node:test");
const assert = require("node:assert/strict");
const PV = require("../pull-values.js");
const T = require("../tiers.js");
const B = require("../data/banners.js");
const D = require("../deck.js");

const E = PV.erasFor(B, T, (id) => D.card(id), (id) => !!T.entry(id, 4));

test("cup scenario: Grand Concert now, Grand Masters from its forecast start, the next ones after", () => {
  const gm = (B.scenarios || []).find((s) => s.id === 5);
  assert.ok(gm, "Grand Masters is in the forecast");
  assert.equal(E.eraAt("2026-11-14").coach, "grandlive", "CM 22's training: Grand Concert");
  assert.equal(E.eraAt(gm.start).coach, "grandmasters");
  assert.equal(E.eraAt("2026-12-02").key, "GM", "CM 23's training: Grand Masters' own preset");
  const larc = (B.scenarios || []).find((s) => s.id === 6);
  const e = E.eraAt(larc.start);
  assert.equal(e.coach, "larc");
  assert.ok(e.est && T.hasScenario(e.key), "an estimated preset registered for Euophrys");
});

test("cup scenario: every era names a coach scenario the career simulation knows", () => {
  const S = require("../scenarios.js"), list = S.SCENARIOS || S.list || S, ids = new Set((Array.isArray(list) ? list : Object.values(list)).map((s) => s.id));
  E.eras.forEach((e) => assert.ok(ids.has(e.coach), e.name + " → " + e.coach));
});
