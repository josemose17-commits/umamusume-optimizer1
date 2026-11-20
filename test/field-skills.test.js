// Full-field skill values (data/field-skills.js, tools/build_field_skills.mjs).
const test = require("node:test");
const assert = require("node:assert/strict");
const FS = require("../data/field-skills.js");
const P = require("../data/presets.js");
const DEBUFFS = require("../data/debuffs.js");

test("field values: CM 22 has every running style, with a typical build and no partial runs", () => {
  const cup = FS.cups.cm22;
  assert.ok(cup, "CM 22 was raced");
  assert.equal(cup.course.id, P.list.find((p) => p.id === "cm22").course.id);
  ["Nige", "Senkou", "Sasi", "Oikomi"].forEach((st) => {
    const s = cup.styles[st];
    assert.ok(s && !s.partial, st + " finished");
    assert.ok(Array.isArray(s.build) && s.build.length >= 3, st + " raced with a typical build");
    assert.ok(Object.keys(s.skills).length >= 100, st + " skills");
    assert.ok(s.base.place > 2 && s.base.place < 8, st + ": mid-pack with her build, not last (" + s.base.place + ")");
    assert.ok(s.more.length >= 30 && s.more.every((id) => s.moreDone.includes(id)), st + " extra races done");
  });
});

test("field values: each row is [L, ci95, fire, p10, p50, p90, place, win, kind] within the course", () => {
  const cup = FS.cups.cm22, d = cup.course.distance;
  Object.entries(cup.styles).forEach(([st, s]) => {
    Object.entries(s.skills).forEach(([id, x]) => {
      if (x[0] == null) return; // a condition the engine can't run
      assert.equal(x.length, 9, id);
      assert.ok(x[1] >= 0 && x[2] >= 0 && x[2] <= 1, st + " " + id);
      if (x[2] > 0) assert.ok(x[3] >= 0 && x[3] <= x[4] && x[4] <= x[5] && x[5] <= d + 1, st + " " + id + " positions");
      assert.equal(x[8], DEBUFFS[id] ? 1 : 0, id + " kind");
    });
    assert.ok(s.placePerL > 0, st + ": places per length fitted for debuffs");
  });
});

test("field values: the skills that compete for SP have narrow intervals (1,600 races)", () => {
  Object.entries(FS.cups.cm22.styles).forEach(([st, s]) => {
    const ci = s.more.map((id) => s.skills[id]).filter((x) => x && x[0] != null).map((x) => x[1]).sort((a, b) => a - b);
    const med = ci[Math.floor(ci.length / 2)];
    assert.ok(med <= 0.3, `${st}: top skills ±${med} L`);
  });
});

test("field values: a skill that never fired is worth exactly nothing (its races count 0)", () => {
  Object.entries(FS.cups.cm22.styles).forEach(([st, s]) => {
    Object.entries(s.skills).forEach(([id, x]) => {
      if (x[0] == null || x[2] > 0) return;
      assert.equal(x[0], 0, st + " " + id); assert.equal(x[6], 0, st + " " + id + " places");
    });
  });
});

test("golds first: measured per style against the solo pick; only clear wins in lengths and wins switch the deck search", () => {
  const styles = FS.cups.cm22.styles;
  const on = Object.entries(styles).filter(([, s]) => s.goldsFirst && s.goldsFirst.L > s.goldsFirst.ci95 && s.goldsFirst.winGolds >= s.goldsFirst.winSolo).map(([st]) => st);
  Object.values(styles).forEach((s) => assert.ok(s.goldsFirst && s.goldsFirst.races >= 2000));
  assert.deepEqual(on, ["Oikomi"], "CM 22: End Closers buy golds first");
});

test("skill-budget golds first: must-haves, then the best golds, then the knapsack on what's left", () => {
  const B = require("../skill-budget.js");
  // A gold that a value-per-SP knapsack skips (two cheap whites beat it per SP).
  const vals = { 202671: 1.6, 202672: 1.3, 200512: 0.9, 200542: 0.9 }, ids = Object.keys(vals);
  const fam = (id) => B.DATA.skills[id][0], rar = (id) => B.DATA.skills[id][3];
  const knap = B.create({ available: ids, skills: vals }).solve({}, 400);
  const golds = B.create({ available: ids, skills: vals, goldsFirst: true }).solve({}, 400);
  assert.ok(golds.goldsFirst);
  assert.ok(golds.selected.some((o) => rar(o.id) === 2), "a gold is bought first");
  assert.ok(golds.spent <= 400 && new Set(golds.selected.map((o) => fam(o.id))).size === golds.selected.length);
  assert.ok(knap.value >= golds.value - 1e-9, "the knapsack is the best by added-up values");
  const must = B.create({ available: ids, skills: vals, goldsFirst: true, must: ["200512"] }).solve({}, 400);
  assert.ok(must.selected.some((o) => o.id === "200512" || o.required.includes("200512")), "must-haves first");
});
