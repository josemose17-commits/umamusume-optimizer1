const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../deck.js");
const T = require("../tiers.js");

const date = "2026-11-10";
const groups = D.DATA.supports.filter(c => c.ty === "group" && D.onGlobal(c, date));

test("GameTora group cards remain a separate, rankable card type", () => {
  assert.ok(groups.some(c => c.id === 30067), "The Throne's Assemblage is available");
  assert.ok(groups.some(c => c.id === 30081), "Team Sirius is available");
  const candidates = groups.map(c => ({ id: c.id, lb: 4 }));
  const ranked = T.rank({ scenario: "GL", skillWeight: 0 }, "group", [], candidates);
  assert.deepEqual(ranked.map(c => c.id).sort(), candidates.map(c => c.id).sort());
  assert.ok(ranked.every(c => Number.isFinite(c.score) && D.card(c.id).ty === "group"));
});

test("a deck can reserve a Group slot independently of Friend slots", () => {
  const pool = D.DATA.supports.filter(c => c.r >= 2 && D.onGlobal(c, date)).map(c => ({ id: c.id, lb: 4 }));
  const comp = { speed: 3, power: 1, wit: 1, group: 1, friend: 0 };
  const result = T.buildDeck({ scenario: "GL", comp, borrow: true, skillWeight: 0 }, pool, pool);
  assert.equal(result.cards.length, 6);
  assert.equal(result.cards.filter(c => D.card(c.id).ty === "group").length, 1);
  assert.equal(result.cards.filter(c => D.card(c.id).ty === "friend").length, 0);
  assert.equal(result.cards.filter(c => c.borrowed).length, 1);
});
