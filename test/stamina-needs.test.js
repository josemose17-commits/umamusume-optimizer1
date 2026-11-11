"use strict";
const test = require("node:test");
const assert = require("node:assert");
const NEEDS = require("../data/stamina-needs.js");
const OPT = require("../optimizer.js");
const RS = require("../race-skills.js");
const { SCENARIOS } = require("../scenarios.js");

test("stamina needs cover the upcoming cups for every style", () => {
  assert.match(NEEDS.meta.rule, /no recovery skills/);
  for (const id of ["cm22", "cm23"]) {
    const cup = NEEDS.cups[id];
    assert.ok(cup, id);
    for (const style of ["Nige", "Senkou", "Sasi", "Oikomi"]) {
      assert.ok(cup[style] == null || (cup[style] % 50 === 0 && cup[style] >= 300 && cup[style] <= 2000), `${id} ${style}`);
    }
  }
  // A mile on dirt needs well under a 3200 m race.
  assert.ok(NEEDS.cups.cm22.Senkou < NEEDS.cups.cm24.Senkou);
});

test("a race build target replaces the distance build's stamina, and your own targets still win", () => {
  const E = require("../engine.js");
  const ura = SCENARIOS.find((s) => s.id === "ura");
  const base = OPT.buildCtx({ scenario: ura, build: "dirt", runs: 2 });
  const lowered = OPT.buildCtx({ scenario: ura, build: "dirt", runs: 2, buildTarget: { stamina: 650 } });
  const mine = OPT.buildCtx({ scenario: ura, build: "dirt", runs: 2, buildTarget: { stamina: 650 }, target: { stamina: 900 } });
  assert.strictEqual(base.target.stamina, E.BUILDS.dirt.target.stamina);
  assert.strictEqual(lowered.target.stamina, 650);
  assert.strictEqual(lowered.target.speed, E.BUILDS.dirt.target.speed);
  assert.strictEqual(mine.target.stamina, 900);
});

test("race comparisons default to Normal mood", () => {
  const catalog = { skills: {}, meta: {} };
  assert.strictEqual(RS.horse({ strategy: "Senkou" }, [], catalog).mood, 0);
  assert.strictEqual(RS.horse({ strategy: "Senkou", mood: 2 }, [], catalog).mood, 2);
});
