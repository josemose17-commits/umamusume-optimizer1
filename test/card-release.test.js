const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../card-release.js");
const D = require("../deck.js");
const B = require("../data/banners.js");
const T = require("../tiers.js");
const PS = require("../parent-skills.js");
const SV = require("../data/skillvalues/index.js");
const today = "2026-11-10";
const cup = start => ({ global: { start } });
const cards = [{ id: 1, en: "2026-11-12", r: 3 }, { id: 2, en: null, r: 3 }, { id: 3, en: null, r: 2 }, { id: 4, en: null, r: 3 }];
const dates = { release: { cards: { 1: "2026-10-01", 2: "2026-11-29", 3: "2026-12-01" } } };

test("a confirmed Global date takes effect automatically on its release day", () => {
  assert.equal(D.onGlobal(cards[0], "2026-11-11"), false);
  assert.equal(D.onGlobal(cards[0], "2026-11-12"), true);
  assert.equal(R.create(dates, "2026-11-11").available(cards[0]), false);
  assert.equal(R.create(dates, "2026-11-12").available(cards[0]), true);
  assert.deepEqual(R.create(dates, today).info(cards[0]), { date: "2026-11-12", estimated: false });
});

test("future cups include forecasts at the boundary, never undated cards or later releases", () => {
  const r = R.create(dates, today);
  assert.equal(r.available(cards[1], cup("2026-11-28")), false);
  assert.equal(r.available(cards[1], cup("2026-11-29")), true);
  assert.equal(r.available(cards[2], cup("2026-11-29")), false);
  assert.equal(r.available(cards[3], cup("2029-01-01")), false);
  assert.deepEqual(r.info(cards[1]), { date: "2026-11-29", estimated: true });
  assert.equal(r.cutoff(cup("2026-10-01")), today);
});

test("an elapsed estimate never promotes a card to Global today", () => {
  const r = R.create(dates, "2026-12-02");
  assert.equal(r.available(cards[1]), false);
  assert.equal(r.available(cards[1], cup("2026-12-02")), false);
  assert.equal(r.available(cards[1], cup("2026-10-01")), false);
  assert.equal(r.available(cards[1], cup("2026-12-03")), true);
  assert.equal(D.onGlobal(cards[1], "2026-12-02"), false);
  assert.equal(cards[1].en, null);
});

test("banner and free-event forecasts fill missing dates; no calendar still allows confirmed cards", () => {
  const r = R.create({ support: [{ start: "2026-11-20", pick: [[2, 0.0075]] }], storyEvents: [{ start: "2026-11-21", cards: [3] }] }, today);
  assert.equal(r.available(cards[1], cup("2026-11-20")), true);
  assert.equal(r.available(cards[2], cup("2026-11-20")), false);
  assert.equal(r.available(cards[2], cup("2026-11-21")), true);
  assert.equal(R.create(null, today).available({ en: today }), true);
  assert.equal(R.create(null, today).available(cards[1], cup("2029-01-01")), false);
  assert.equal(r.available(null), false);
});

test("future pools keep ownership and LB separate from the borrowed and all-card previews", () => {
  const r = R.create(dates, today), owned = { 1: 1 }, p = cup("2026-11-29");
  assert.deepEqual(r.pools(cards, owned, { ownedOnly: true }, p), { pool: [{ id: 1, lb: 1 }], borrow: [{ id: 1, lb: 4 }, { id: 2, lb: 4 }] });
  assert.deepEqual(r.pools(cards, owned, { ownedOnly: false, borrow: false }, p), { pool: [{ id: 1, lb: 4 }, { id: 2, lb: 4 }], borrow: [] });
  assert.deepEqual(r.pools(cards, {}, { ownedOnly: true }, p, id => id === 2).pool, [{ id: 2, lb: 4 }]);
  assert.deepEqual(r.pools(cards, owned, { ownedOnly: true }, cup(today)).pool, []);
  assert.deepEqual(owned, { 1: 1 });
});

test("GameTora's Ramonu and Group forecasts are usable in real future deck searches", () => {
  const r = R.create(B, today), ramonu = D.card(30134), group = D.card(30137);
  // Use the current calendar's dates so daily forecast updates don't make this stale.
  for (const c of [ramonu, group]) {
    const date = r.info(c).date;
    assert.ok(date, c.n + " has a release date");
    assert.equal(r.available(c, cup(date > today ? date : "2029-01-01")), true);
    assert.ok(T.entry(c.id, 4), c.n + " has card scoring data");
  }
  const p = cup("2029-01-01"), pools = r.pools(D.DATA.supports, {}, { ownedOnly: false }, p, T.entry);
  const result = T.buildDeck({ scenario: "GM", comp: { wit: 1, group: 1 }, locked: [ramonu.id, group.id], borrow: true, skillWeight: 0 }, pools.pool, pools.borrow);
  assert.equal(result.cards.length, 6);
  assert.ok(result.cards.some(c => c.id === ramonu.id));
  assert.ok(result.cards.some(c => c.id === group.id));
  assert.ok(result.cards.every(c => r.available(D.card(c.id), p)));
});

test("a future parent deck counts the card's hints in scoring and its skill inventory", () => {
  const c = D.card(30134);
  // A fixed forecast keeps this about the future-card gate even after Global releases Ramonu.
  const futureCard = Object.assign({}, c, { en: null });
  const release = R.create({ release: { cards: { [c.id]: "2026-11-29" } } }, today);
  const targets = Object.fromEntries(c.hs.map(id => [id, 1]));
  const base = { globalOnly: true, today, skillsBy: "2025-12-31", targets };
  const future = Object.assign({}, base, { cardAvailable: card => release.available(Object.assign({}, card, { en: null }), cup("2026-11-29")) });
  const now = Object.assign({}, base, { cardAvailable: () => false });
  const opts = { skills: SV.skills, purchases: {}, events: { cards: {}, events: {} } };
  assert.equal(PS.build([futureCard], Object.assign({}, opts, now)).skills.length, 0);
  const inventory = PS.build([futureCard], Object.assign({}, opts, future));
  assert.ok(inventory.skills.some(s => s.id === String(c.hs[0])));
  assert.deepEqual(inventory.unavailableCards, []);
  const cards = [{ id: c.id, lb: 4 }];
  assert.deepEqual(Object.keys(T.deckOffers({ scenario: "GM", parent: now }, cards)), []);
  const offers = T.deckOffers({ scenario: "GM", parent: future }, cards);
  assert.ok(offers[c.hs[0]] > 0, "future card hints count toward the parent's targets");
});

test("a required future borrow survives deck building without adding it to your own pool", () => {
  const r = R.create(B, today), p = cup("2029-01-01");
  const owned = { 30002: 4, 30003: 4, 30004: 4, 30005: 4, 30006: 4, 30010: 4, 30014: 4 };
  const pools = r.pools(D.DATA.supports, owned, { ownedOnly: true }, p, T.entry);
  const opts = { scenario: "URA", skillWeight: 0, borrow: true, locked: [30134] };
  const result = T.buildDeck(opts, pools.pool, pools.borrow);
  assert.equal(result.cards.length, 6);
  assert.deepEqual(result.cards.filter(c => c.borrowed).map(c => c.id), [30134]);
  assert.ok(result.cards.filter(c => !c.borrowed).every(c => owned[c.id] === c.lb));
  assert.equal(owned[30134], undefined);
  assert.throws(() => T.buildDeck(Object.assign({}, opts, { locked: [30134, 30137] }), pools.pool, pools.borrow), /Only one must-include card can be borrowed/);
});
