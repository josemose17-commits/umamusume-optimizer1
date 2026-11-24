// Deck search push 3 (optimizer.js): a reliably offered gold heal lowers the stamina need; the
// finalists' recheck buys skills with sim.specPurchase.
const test = require("node:test");
const assert = require("node:assert");
const D = require("../deck.js");
const O = require("../optimizer.js");
const T = require("../tiers.js");
const { SCENARIOS } = require("../scenarios.js");

const gl = SCENARIOS.find((s) => s.id === "grandlive");
const glob = D.DATA.supports.filter((c) => D.onGlobal(c, "2026-11-23"));
const pool = glob.filter((c) => c.r === 3).slice(0, 40).map((c) => ({ id: c.id, lb: 4 }));
const target = { speed: 1300, stamina: 1100, power: 1000, guts: 500, wit: 900 };

test("deckSkills lists what the deck can offer, with chances", () => {
  const deck = T.buildDeck({ scenario: "GL" }, pool, []).cards;
  const skills = {}; glob.forEach((c) => (c.hs || []).forEach((id) => { skills[id] = 0.1; }));
  const list = T.deckSkills({ scenario: "GL", skills }, deck).list;
  assert.ok(list.length > 3 && list.every((x) => x.p >= 0 && x.p <= 1));
});

test("a skill the deck offers reliably, with a lower stamina need, cuts the Stamina target by p x the drop", () => {
  const deck = T.buildDeck({ scenario: "GL" }, pool, []).cards;
  const skills = {}; glob.forEach((c) => (c.hs || []).forEach((id) => { skills[id] = 0.1; }));
  const offered = T.deckSkills({ scenario: "GL", skills }, deck).list.filter((x) => x.p >= 0.6).sort((a, b) => b.p - a.p)[0];
  assert.ok(offered, "some skill offered at 60%+");
  const opts = { scenario: "GL", skills };
  const sim = { scenario: gl, build: "long", target, raceValues: { staminaTarget: 1400 }, healNeeds: { [offered.id]: 1200 } };
  const sc = O.fitScorer(opts, sim), ctx = sc.ctxOf(6);
  const r = sc.evaluate(deck, ctx);
  assert.ok(r.heal && r.heal.id === String(offered.id) || r.heal && +r.heal.id === +offered.id);
  assert.ok(Math.abs(r.heal.cut - offered.p * 200) < 1e-6);
  const plain = O.fitScorer(opts, Object.assign({}, sim, { healNeeds: null })).evaluate(deck, ctx);
  assert.ok(r.short <= plain.short, "a lower Stamina target leaves her less short");
});

test("the finalists' recheck uses sim.specPurchase; the search careers don't", () => {
  let calls = 0;
  const sim = { scenario: gl, build: "medium", target, specPurchase: () => { calls++; return null; } };
  const sc = O.fitScorer({ scenario: "GL", skills: {} }, sim);
  assert.strictEqual(sc.ctxOf(4).specPurchase, null);
  assert.strictEqual(typeof sc.ctxOf(4, 99, true).specPurchase, "function");
});
