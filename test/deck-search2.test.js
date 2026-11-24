// Deck search push 2 (optimizer.js): CM's best-runs career score, the wider swap pool, the borrow pivot.
const test = require("node:test");
const assert = require("node:assert");
const D = require("../deck.js");
const O = require("../optimizer.js");
const T = require("../tiers.js");
const { SCENARIOS } = require("../scenarios.js");

const gl = SCENARIOS.find((s) => s.id === "grandlive");
const glob = D.DATA.supports.filter((c) => D.onGlobal(c, "2026-11-23"));
const run = (opts, sim, start, pool, bp) => { const s = O.targetSearch(opts, sim, start, pool, bp); while (s.next()); return s.result(); };
const sim = { scenario: gl, build: "medium", target: { speed: 1300, stamina: 800, power: 1000, guts: 500, wit: 900 } };

test("best-runs career score: a deck's value is its 85th-percentile career, not the average", () => {
  const pool = glob.filter((c) => c.r === 3).slice(0, 40).map((c) => ({ id: c.id, lb: 4 }));
  const start = T.buildDeck({ scenario: "GL" }, pool, []).cards;
  const sc85 = O.fitScorer({ scenario: "GL", careerScore: "p85" }, sim), scMean = O.fitScorer({ scenario: "GL" }, sim);
  const ctx = sc85.ctxOf(8);
  const a = sc85.evaluate(start, ctx), b = scMean.evaluate(start, ctx);
  assert.ok(a.value >= b.value, "the 85th percentile is at least the average: " + a.value + " vs " + b.value);
});

test("borrow pivot: the search ends legal, borrowing at most one card, makeup kept", () => {
  const pool = glob.filter((c) => c.r >= 2).slice(0, 60).map((c) => ({ id: c.id, lb: 2 }));
  const bp = glob.filter((c) => c.r === 3).map((c) => ({ id: c.id, lb: 4 }));
  const opts = { scenario: "GL", borrow: true, careerScore: "p85" };
  const start = T.buildDeck(opts, pool, bp).cards;
  const r = run(opts, sim, start, pool, bp);
  assert.strictEqual(r.cards.length, 6);
  assert.strictEqual(r.cards.filter((x) => x.borrowed).length, 1);
  assert.strictEqual(new Set(r.cards.map((x) => D.card(x.id).cid)).size, 6);
  assert.ok(Array.isArray(r.pivoted));
  assert.strictEqual(r.careerScore, "p85");
  r.cards.filter((x) => !x.borrowed).forEach((x) => assert.ok(pool.some((y) => y.id === x.id), "owned cards come from your pool"));
});
