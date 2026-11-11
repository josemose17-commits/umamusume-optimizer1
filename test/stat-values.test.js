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
