"use strict";
const test = require("node:test");
const assert = require("node:assert");
const D = require("../deck.js");
const A = require("../skill-access.js");

test("Halloween cards and outfits: JP's Halloween banners and Halloween titles, not every witch", () => {
  const h = D.halloween(), title = (id) => D.card(id).t, outfit = (id) => D.trainee(id).t;
  ["Beware! Halloween Night!", "The Ghost Finds Halloween Magic", "Moonlit Devil ♪", "Onwards, Demon Queen Lackeys!"].forEach((t) => assert.ok(h.cards.some((id) => title(id) === t), t));
  ["Vampire Makeover!", "Chiffon-Wrapped Mummy", "Fanatic♡Jiangshi", "Dot-o'-Lantern", "Highkey ☆ Hallowed"].forEach((t) => assert.ok(h.trainees.some((id) => outfit(id) === t), t));
  assert.ok(!h.cards.some((id) => /Witch/.test(title(id))), "Sweep Tosho's witch cards aren't Halloween");
  assert.ok(!h.trainees.some((id) => outfit(id) === "Platanus Witch"));
  assert.ok(!h.trainees.some((id) => outfit(id) === "Everlasting Sweet Treat"), "a Valentine's outfit");
  assert.ok(!h.cards.some((id) => D.card(id).r === 1), "R cards from that day aren't themed");
});

test("hidden cards: the list deck.js answers from, and the backup code keeps it", () => {
  const h = D.halloween();
  D.setHidden({ cards: h.cards, trainees: h.trainees.slice(0, 2) });
  assert.ok(D.isHidden(h.cards[0]) && D.isHiddenTrainee(h.trainees[0]) && !D.isHiddenTrainee(h.trainees[3]));
  const code = D.encodeOwned({ 30064: 3, 30001: 4 }, { cards: h.cards, trainees: h.trainees.slice(0, 2) });
  assert.deepEqual(D.decodeOwned(code), { 30001: 4, 30064: 3 });
  assert.deepEqual(D.decodeHidden(code).cards.sort(), h.cards.slice().sort());
  assert.equal(D.decodeHidden(code).trainees.length, 2);
  assert.equal(D.decodeHidden(D.encodeOwned({ 30001: 4 })), null, "older codes have no list");
  assert.deepEqual(D.decodeOwned("UMA1:" + (30001).toString(36) + "4"), { 30001: 4 });
  D.setHidden(null);
  assert.ok(!D.isHidden(h.cards[0]));
});

test("game8's must-have whites stay among her parents' targets after the purchase plan", () => {
  const acc = A.create();
  const rel = { targets: { 200331: 0.5, 201601: 3 }, why: { 200331: "L", 201601: "game8" }, L: {} };
  const out = acc.parentRel(rel, { parentValues: { 200332: 0.8 }, raceL: {} });
  assert.equal(out.why[201601], "game8");
  assert.equal(out.targets[201601], 3);
  assert.equal(out.why[200331], undefined, "other whites follow the purchase plan");
});

test("the Halloween rule: every Halloween card and outfit, except the ones you kept, and the backup code keeps it", () => {
  const hw = D.halloween();
  D.setHidden({ cards: [30001], trainees: [], halloween: true, keep: { cards: [hw.cards[0]], trainees: [] } });
  assert.ok(D.isHidden(30001), "your own list");
  assert.ok(!D.isHidden(hw.cards[0]), "kept");
  assert.ok(hw.cards.slice(1).every(D.isHidden) && hw.trainees.every(D.isHiddenTrainee), "the rest, from the current data");
  const code = D.encodeOwned({ 30001: 4 }, { cards: [30001], trainees: [], halloween: true, keep: { cards: [hw.cards[0]], trainees: [] } });
  const back = D.decodeHidden(code);
  assert.equal(back.halloween, true);
  assert.deepEqual(back.keep.cards, [hw.cards[0]]);
  assert.deepEqual(D.decodeOwned(code), { 30001: 4 });
  assert.equal(D.decodeHidden(D.encodeOwned({}, { cards: [30001], trainees: [] })).halloween, undefined, "no rule: a plain list");
  D.setHidden(null);
});
