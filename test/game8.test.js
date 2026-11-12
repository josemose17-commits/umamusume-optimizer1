"use strict";
const test = require("node:test");
const assert = require("node:assert");
const G = require("../game8.js");
const R = require("../race-skills.js");
const SV = require("../data/skillvalues/index.js");
const names = Object.keys(SV.skills).map((id) => [id, SV.skills[id][0]]);
const id = (n) => names.find(([, x]) => x === n)[0];

// game8's CM22 (Aquarius Cup 2) green skills, as copied from its Global guide.
const PAGE = `Track-based Conditionals:
・ Left-Handed ◯ ・ Winter Runner ◯ ・ Wet Conditions ◯ ・ Standard Distance ◯ ・ Tokyo Racecourse ◯ ・ Snowy Days ◯ ・ Muddy ◯
Racer-based Conditionals (Suggested):
・ Front Runner Savvy ◯
・ Solid Steps (requires 1000+ Power)
・ Restraint
・ Racing Spirit: Mood (has a mood and Wit check)
・ Lone Wolf (Matchup-dependent)`;

test("game8's pasted list: bullets, notes in brackets and headings", () => {
  const r = G.parse(PAGE, names);
  assert.deepEqual(r.missed, []);
  assert.equal(r.found.length, 12);
  assert.equal(r.found[0].id, id("Left-Handed ○"));
  const solid = r.found.find((x) => x.id === id("Solid Steps"));
  assert.equal(solid.note, "requires 1000+ Power");
  assert.ok(G.parse("Not a real skill name here", names).missed.length === 1);
});

test("a cup's entry: must-haves win over recommended, and picks follow her style", () => {
  const e = G.entry("Left-Handed O\nFront Runner Savvy O", PAGE, names, "2026-11-12");
  assert.equal(e.must.length, 2);
  assert.ok(!e.rec.some((x) => x.id === id("Left-Handed ○")), "a must-have isn't also recommended");
  const savvy = id("Front Runner Savvy ○");
  const fits = (x) => x !== savvy; // a Pace Chaser
  const p = G.picks(e, fits);
  assert.equal(p[id("Left-Handed ○")], "must");
  assert.equal(p[savvy], undefined);
  assert.equal(p[id("Restraint")], "rec");
  assert.deepEqual(G.mustToAdd(e, [], [], fits), [id("Left-Handed ○")]);
  assert.deepEqual(G.mustToAdd(e, [], [id("Left-Handed ○")], fits), [], "a must-have she dropped stays out");
  assert.deepEqual(G.mustToAdd(e, [id("Left-Handed ○")], [], fits), [], "nothing twice");
});

test("a game8 pick wins a close call and isn't pruned for a small, unclear gain", async () => {
  const [a, b] = ["200332", "200512"];
  // b adds +0.01 L on average, well inside race-to-race noise.
  const compare = async (before, after) => { const v = (set) => (set.includes(a) ? 1 : 0), w = (set) => (set.includes(b) ? 1 : 0);
    const d = v(after) - v(before), e = w(after) - w(before); return R.summary([d + 0.21 * e, d - 0.19 * e]); };
  const base = { catalog: require("../data/race-skills.json"), available: [a, b], learned: [], hints: {}, sp: 1000, values: { [a]: 1, [b]: 0.5 }, compare };
  const plain = await R.optimize(base);
  assert.deepEqual(plain.selected.map((x) => x.id), [a]);
  const liked = await R.optimize(Object.assign({}, base, { prefer: [b] }));
  assert.deepEqual(liked.selected.map((x) => x.id).sort(), [a, b].sort(), "kept: it doesn't lose lengths");
});
