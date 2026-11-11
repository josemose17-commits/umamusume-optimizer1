"use strict";
const test = require("node:test");
const assert = require("node:assert");
const V = require("../data/stat-values.js");
const F = require("../family.js");
const PRESETS = require("../data/presets.js");
const preset = (id) => PRESETS.list.find((p) => p.id === id);
const x = (id, style) => ({ race: { preset: preset(id), style } });

test("measured values cover every simulated cup and style, with no errors", () => {
  for (const [id, c] of Object.entries(V.cups)) {
    if (c.status !== "ok") { assert.ok(["engine", "course"].includes(c.status), id); continue; }
    for (const st of ["Nige", "Senkou", "Sasi", "Oikomi"]) {
      const v = c.styles[st];
      assert.equal(v.status, "ok", id + st);
      assert.equal(v.stats.length, 5);
      v.stats.forEach((s) => assert.ok(s.perPoint >= 0 && Number.isFinite(s.ci)));
      ["distance", "surface", "style"].forEach((k) => assert.ok(Number.isFinite(v.apt[k].BA.L) && Number.isFinite(v.apt[k].AS.L)));
    }
  }
});

test("past 1200 speed counts half, so on Aquarius Cup 2 power is worth far more per point", () => {
  const pp = F.statPoints(x("cm22", "Senkou"));
  assert.ok(pp[2] > 3 * pp[0], `power ${pp[2]} vs speed ${pp[0]}`);
});

test("aptitude steps add up, and showdown cups fall back to the flat rules", () => {
  const a = F.aptL(x("cm22", "Senkou"), 4, "B", "S"), ba = F.aptL(x("cm22", "Senkou"), 4, "B", "A"), as = F.aptL(x("cm22", "Senkou"), 4, "A", "S");
  assert.ok(Math.abs(a - (ba + as)) < 1e-9 && ba > as && as > 0);
  assert.equal(F.aptL(x("cm22", "Senkou"), 4, "S", "S"), 0);
  assert.equal(F.measured(x("cm27", "Senkou")), null);
  assert.equal(F.aptL(x("cm27", "Senkou"), 4, "A", "S"), F.APT_L);
  assert.deepEqual(F.statPoints(x("cm27", "Senkou")), [1, 1, 1, 1, 1].map(() => 1 / F.STAT_PER_L));
});

test("her predicted stats rescale the measured values across 1200, and stamina stays", () => {
  const plain = F.statPoints(x("cm22", "Senkou"));
  const base = V.cups.cm22.styles.Senkou.base;
  assert.ok(base.speed > 1200, "Aquarius' line has speed past 1200");
  const below = F.statPoints(Object.assign(x("cm22", "Senkou"), { stats: [1100, 500, 1250, 600, 1000] }));
  assert.ok(Math.abs(below[0] - 2 * plain[0]) < 1e-12, "speed at 1100 counts double");
  assert.equal(below[1], plain[1], "stamina is valued against her need, not rescaled");
  assert.ok(Math.abs(below[2] - plain[2]) < 1e-12, "power past 1200 on both: unchanged");
});

test("blue past her target counts at half", () => {
  assert.equal(F.blueWorth(50, 30, 1), 30 + 0.5 * 20);
  assert.equal(F.blueWorth(20, 30, 1), 20);
  assert.equal(F.blueWorth(50, 0, 0.01), 0.25);
});
