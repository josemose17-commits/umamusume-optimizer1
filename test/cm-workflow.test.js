const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../cm-workflow.js");
const ts = [{ id: 100101, cid: 1001 }, { id: 100201, cid: 1002 }, { id: 100301, cid: 1003 }];
const options = { cups: ["cm1", "cm2"], defaultCup: "cm2", trainee: id => ts.find(t => t.id === +id), style: () => "Senkou" };

for (const tab of ["cm", "cmplan", "parents"]) test(`old ${tab} save opens CM/LoH and preserves decks, family and training`, () => {
  const s = { tab, deck: { trainee: 100101 }, cm: { preset: "cm1", style: "Sasi", skillW: "2", locked: [30001], targets: { speed: 1400 } }, pcm: { reachSS: "S", comp: { wit: 2 } },
    parents: { selfTrainee: 100201, races: ["Japan Cup"], rating: { sp: 2000 }, family: { ace: { cid: 1001, tid: 100101 }, p1: { cid: 1002, tid: 100201, blue: [0, 3] } } },
    cmp: { cup: "cm1", parentRank: "SS", byCup: { cm1: [{ tid: 100101, style: "Sasi" }] }, sel: { cm1: 100101 }, decks: { "cm1|100101": { comp: { speed: 2 }, cards: [{ id: 30001, lb: 3 }], rental: { required: ["200012"] } } } } };
  W.migrate(s, options);
  assert.equal(s.tab, "cm");
  assert.equal(s.cm, s.cmp.decks["cm1|100101"]);
  assert.equal(s.cm.cards[0].lb, 3);
  if (tab !== "cmplan") assert.equal(s.cm.cards[0].locked, true);
  assert.deepEqual(s.cm.rental.required, ["200012"]);
  assert.equal(s.parents.family.p1.tid, 100201);
  assert.deepEqual(s.parents.races, ["Japan Cup"]); assert.equal(s.parents.rating.sp, 2000);
  assert.deepEqual(s.pcm.comp, { wit: 2 });
  assert.equal(s.cmp.parentRank, tab === "parents" ? "S" : "SS");
  const again = JSON.parse(JSON.stringify(s)); W.migrate(again, options);
  assert.deepEqual(again, s, "reload is idempotent");
});

test("ace changes use her own deck and family without replacing the parent being trained", () => {
  const s = { tab: "cmplan", cm: { preset: "cm1", must: ["200012"] }, parents: { selfTrainee: 100301 }, cmp: { cup: "cm1", byCup: { cm1: [{ tid: 100101 }, { tid: 100201 }] } } };
  W.migrate(s, options); s.cm.cards = [{ id: 30001, lb: 2 }]; s.cm.family.p1 = { tid: 100301 };
  s.cmp.sel.cm1 = 100201; W.sync(s, options);
  assert.equal(s.cm.cards, null); assert.equal(s.parents.family.ace.tid, 100201);
  assert.deepEqual(s.cm.must, []); assert.deepEqual(s.cm.locked, []);
  assert.deepEqual(s.cm.rental.required, []);
  s.cm.must.push("200352");
  s.cmp.sel.cm1 = 100101; W.sync(s, options);
  assert.equal(s.cm.cards[0].id, 30001); assert.equal(s.parents.family.p1.tid, 100301);
  assert.deepEqual(s.cm.must, ["200012"]); assert.equal(s.parents.selfTrainee, 100301);
});

test("legacy no-minimum and a parent's S choice remain one setting", () => {
  const s = { tab: "cmplan", cmp: { ssMust: false }, cm: {} };
  W.migrate(s, options); assert.equal(s.cmp.parentRank, ""); assert.equal(s.pcm.reachSS, "");
  W.setParentRank(s, "S"); assert.equal(s.cmp.parentRank, "S"); assert.equal(s.pcm.reachSS, "S");
  W.setParentRank(s, "SS"); assert.equal(s.cmp.parentRank, "SS");
});

test("a saved family supplies the ace when no racing trainee was picked", () => {
  const s = { tab: "cm", deck: { trainee: null }, cm: { preset: "cm1", targets: { speed: 1300 } }, parents: { selfTrainee: 100201, family: { ace: { cid: 1001, tid: 100101 }, p1: { cid: 1002, tid: 100201 } } } };
  W.migrate(s, options);
  assert.equal(W.current(s).ace.tid, 100101);
  assert.equal(s.parents.selfTrainee, 100201);
  assert.deepEqual(s.parents.family.p1.white, []);
  assert.deepEqual(s.cm.targets, { speed: 1300 });
});
