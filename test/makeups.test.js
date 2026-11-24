// Compare every deck makeup (optimizer.js makeupList / makeupSweep): which makeups count, and
// the sweep's winner, finalists and table.
const test = require("node:test");
const assert = require("node:assert");
const D = require("../deck.js");
const O = require("../optimizer.js");
const { SCENARIOS } = require("../scenarios.js");

const TODAY = "2026-11-23";
const glob = D.DATA.supports.filter((c) => D.onGlobal(c, TODAY));
const all = glob.filter((c) => c.r >= 2).map((c) => ({ id: c.id, lb: 4 }));
const ssr = glob.filter((c) => c.r === 3).map((c) => ({ id: c.id, lb: 4 }));
const TYPES = ["speed", "stamina", "power", "guts", "wit", "friend", "group"];
const total = (m) => TYPES.reduce((a, t) => a + m[t], 0);

test("makeups: every split of 6 cards over 7 types, Friend and Group up to 2 (or 1)", () => {
  const list = O.makeupList({ pool: all, borrowPool: ssr, borrow: true });
  assert.strictEqual(list.length, 757);
  assert.ok(list.every((m) => total(m) === 6 && m.friend <= 2 && m.group <= 2));
  assert.strictEqual(new Set(list.map(O.makeupKey)).size, list.length, "no makeup twice");
  assert.strictEqual(O.makeupList({ pool: all, borrowPool: ssr, borrow: true, max: { friend: 1, group: 1 } }).length, 532);
});

test("makeups: the types you fixed stay, must-include cards' types are in, and only what your cards can fill", () => {
  const fixed = O.makeupList({ pool: all, borrowPool: ssr, borrow: true, fixed: { speed: 2, wit: 1 } });
  assert.ok(fixed.length > 0 && fixed.every((m) => m.speed === 2 && m.wit === 1));
  const group = glob.find((c) => c.ty === "group");
  assert.ok(O.makeupList({ pool: all, borrowPool: ssr, borrow: true, locked: [group.id] }).every((m) => m.group >= 1));
  // One stamina character of your own: two stamina cards only with the borrowed one, and then
  // nothing else may need the borrow.
  const oneSta = all.filter((c) => D.card(c.id).ty !== "stamina").concat(all.filter((c) => D.card(c.id).ty === "stamina").slice(0, 1));
  const noBorrow = O.makeupList({ pool: oneSta, borrowPool: [], borrow: false });
  assert.ok(noBorrow.every((m) => m.stamina <= 1));
  const withBorrow = O.makeupList({ pool: oneSta, borrowPool: ssr, borrow: true });
  assert.ok(withBorrow.some((m) => m.stamina === 2) && withBorrow.every((m) => m.stamina <= 2));
});

test("makeup sweep: the best deck for the top makeups, the winner first, each deck in its makeup", () => {
  const gl = SCENARIOS.find((s) => s.id === "grandlive");
  const pool = ssr.slice(0, 50);
  const makeups = O.makeupList({ pool, borrowPool: [], borrow: false, fixed: { speed: 2, stamina: 1, power: 1 } });
  assert.ok(makeups.length >= 4, "a few makeups to compare");
  const run = O.makeupSweep({ scenario: "GL" }, { scenario: gl, build: "medium", target: { speed: 1300, stamina: 800, power: 1000, guts: 500, wit: 900 } }, pool, [], { makeups, finalists: 2 });
  let steps = 0;
  while (run.next()) steps++;
  assert.strictEqual(run.progress(), 1);
  const out = run.result(), m = out.fit.makeups;
  assert.strictEqual(m.finalists, 2);
  assert.strictEqual(m.rows.length, m.filled);
  assert.strictEqual(m.rows[0].gap, 0, "the winner leads the table");
  assert.ok(m.rows.slice(0, 2).every((r) => r.finalist != null) && m.rows.slice(2).every((r) => r.finalist == null));
  assert.strictEqual(O.makeupKey(out.comp), m.winner);
  const n = (cards, t) => cards.filter((c) => D.card(c.id).ty === t).length;
  out.finals.forEach((f) => {
    assert.strictEqual(f.cards.length, 6);
    TYPES.forEach((t) => assert.strictEqual(n(f.cards, t), f.makeupComp[t], "the deck keeps its makeup: " + t));
    assert.strictEqual(new Set(f.cards.map((c) => D.card(c.id).cid)).size, 6, "no character twice");
  });
  assert.deepStrictEqual(out.finals[0].cards, out.fit.cards);
});

test("Grand Concert's guide makeups: 12, each 6 cards with 1 Pal (Friend), for every distance", () => {
  const S = require("../data/scenario-decks.js");
  const gc = S.eras["4"];
  assert.strictEqual(gc.guide, "Grand Concert");
  assert.strictEqual(gc.decks.length, 12);
  gc.decks.forEach((d) => {
    assert.strictEqual(Object.values(d.comp).reduce((a, b) => a + b, 0), 6);
    assert.strictEqual(d.comp.friend, 1);
    assert.deepStrictEqual(d.dist, ["Sprint", "Mile", "Medium", "Long"]);
  });
  assert.ok(gc.decks.some((d) => d.comp.speed === 4 && d.comp.wit === 1), "4 Speed / 1 Wit / 1 Pal");
});

test("makeup sweep: a guide makeup's scenario card stays in its deck", () => {
  const gl = SCENARIOS.find((s) => s.id === "grandlive");
  const pool = ssr.slice(0, 50);
  const card = D.card(pool.find((c) => D.card(c.id).ty === "wit").id);
  const makeups = [{ comp: { speed: 3, stamina: 0, power: 0, guts: 0, wit: 2, friend: 1, group: 0 }, locked: [card.id] },
    { comp: { speed: 2, stamina: 1, power: 0, guts: 0, wit: 2, friend: 1, group: 0 }, locked: [card.id] }];
  const run = O.makeupSweep({ scenario: "GL" }, { scenario: gl, build: "medium", target: { speed: 1300, stamina: 800, power: 1000, guts: 500, wit: 900 } }, pool, [], { makeups, finalists: 2, meta: { mode: "guide", guide: "Test" } });
  while (run.next());
  const out = run.result();
  assert.strictEqual(out.fit.makeups.meta.guide, "Test");
  out.finals.forEach((f) => assert.ok(f.cards.some((c) => c.id === card.id), "the locked card is in every finalist's deck"));
  assert.deepStrictEqual(out.locked, [card.id]);
});

test("Grand Masters guide makeups: 15 post-Guides (30137) and 42 pre-Guides (Group/Pal + 6 stat cards)", () => {
  const S = require("../data/scenario-decks.js");
  const gm = S.eras["5"];
  assert.strictEqual(gm.guide, "Grand Masters");
  assert.strictEqual(gm.required, 30137);
  const post = gm.decks.filter((d) => d.phase === "post");
  const pre = gm.decks.filter((d) => d.phase === "pre");
  assert.strictEqual(post.length, 15);
  assert.strictEqual(pre.length, 42);
  post.forEach((d) => {
    assert.strictEqual(Object.values(d.comp).reduce((a, b) => a + b, 0), 6);
    assert.strictEqual(d.comp["card:30137"], 1);
  });
  assert.strictEqual(pre.filter((d) => d.comp.group === 1).length, 14);
  assert.strictEqual(pre.filter((d) => d.comp.friend === 1).length, 14);
  assert.strictEqual(pre.filter((d) => !d.comp.group && !d.comp.friend).length, 14);
  pre.forEach((d) => {
    assert.strictEqual(Object.values(d.comp).reduce((a, b) => a + b, 0), 6);
    assert.strictEqual(d.comp["card:30137"], undefined);
  });
});

