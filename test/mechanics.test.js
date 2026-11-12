"use strict";
const test = require("node:test");
const assert = require("node:assert");
const M = require("../mechanics.js");
const PRESETS = require("../data/presets.js");
const C = require("../data/stat-curves.js");

test("Wit check and Rushed match the mechanics document's examples", () => {
  [[300, 0.7], [600, 0.85], [900, 0.9], [1200, 0.925]].forEach(([w, p]) => assert.ok(Math.abs(M.activation(w) - p) < 1e-9, w));
  assert.equal(M.activation(100), 0.2, "never under 20%");
  assert.ok(M.activation(1400) < M.activation(1200) + 0.02, "Wit past 1200 counts half");
  [[300, 0.19], [600, 0.14], [900, 0.12], [1200, 0.10]].forEach(([w, p]) => assert.ok(Math.abs(M.rushed(w) - p) < 1e-9, w + " " + M.rushed(w)));
  assert.ok(Math.abs(M.rushed(300, 0, true) - 0.16) < 1e-9, "Restraint: 19% to 16%");
});

test("ground modifiers for power and speed", () => {
  assert.equal(M.groundPower("Turf", "Firm"), 0);
  assert.equal(M.groundPower("Turf", "Heavy"), -50);
  assert.equal(M.groundPower("Dirt", "Good"), -50);
  assert.equal(M.groundPower("Dirt", "Soft"), -100);
  assert.equal(M.groundPower("Dirt", "Firm"), -100);
  assert.equal(M.groundSpeed("Turf", "Heavy"), -50);
  assert.equal(M.groundSpeed("Dirt", "Soft"), 0);
});

test("the simulator's power line is where the measured power step is", () => {
  const P = (id) => PRESETS.list.find((p) => p.id === id);
  for (const id of ["cm20", "cm21", "cm22", "cm23", "cm25", "cm26"]) {
    const line = M.conservationLine(P(id)).sim, pts = C.cups[id].styles.Senkou.curves[2];
    // The steepest 50-point step on the curve starts at the line.
    let best = null;
    for (let i = 1; i < pts.length; i++) if (pts[i][0] - pts[i - 1][0] === 50) { const g = pts[i][1] - pts[i - 1][1]; if (!best || g > best.g) best = { at: pts[i - 1][0], g }; }
    assert.equal(best.at, line, id);
  }
});

test("stat-scaled skills: by highest stat and by speed", () => {
  const skill = (t) => ({ alternatives: [{ effects: [{ scaling: t, modifier: 1 }] }] });
  assert.equal(M.statScale({ alternatives: [{ effects: [{ scaling: 1 }] }] }, [1000], [1000]), null);
  const s13 = M.statScale(skill(13), [1150, 600, 900, 300, 900], [950, 800, 900, 600, 900]);
  assert.ok(Math.abs(s13.k - 1.2) < 1e-9, "1.2x at 1100+ vs 1.0x at 800-999");
  assert.equal(M.statScale(skill(22), [1500, 0, 0, 0, 0], [1500, 0, 0, 0, 0]).k, null, "0x on the chart: not rescaled");
  assert.equal(M.valueScale(23, [1700, 0, 0, 0, 0]), 2, "1700 shown speed counts 1450");
});
