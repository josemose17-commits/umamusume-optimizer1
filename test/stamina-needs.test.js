"use strict";
const test = require("node:test");
const assert = require("node:assert");
const NEEDS = require("../data/stamina-needs.js");
const OPT = require("../optimizer.js");
const RS = require("../race-skills.js");
const PRESETS = require("../data/presets.js");
const { SCENARIOS } = require("../scenarios.js");
const STYLES = ["Nige", "Senkou", "Sasi", "Oikomi"];

test("stamina references: every simulated cup has every style, with counts and checks", () => {
  assert.equal(NEEDS.meta.version, 2);
  assert.match(NEEDS.meta.rule, /no equipped skills/);
  for (const id of ["cm22", "cm23"]) {
    const cup = NEEDS.cups[id];
    assert.equal(cup.status, "ok", id);
    for (const style of STYLES) {
      assert.ok(Object.hasOwn(cup.styles, style), `${id} ${style} missing`);
      const x = cup.styles[style];
      assert.equal(x.status, "ok", `${id} ${style}`);
      assert.ok(x.need % 50 === 0 && x.need >= 300 && x.need <= 2000);
      assert.ok(x.hits >= x.goal, "the chosen stamina meets the rule");
      if (x.below) assert.ok(x.below.hits < x.goal, "the step below does not");
      assert.ok(x.confirm && x.confirm.seed !== NEEDS.meta.seed, "rerun on an independent seed");
      assert.ok(x.confirm.hits >= x.goal - 4, "the upcoming cups hold up on the independent seed");
    }
  }
  assert.ok(NEEDS.cups.cm22.styles.Senkou.need < NEEDS.cups.cm24.styles.Senkou.need, "a dirt mile needs less than 3200 m");
});

test("stamina-showdown cups are not simulated with an engine that lacks showdown", () => {
  const SV = require("../data/skillvalues/index.js");
  for (const p of PRESETS.list) {
    const v = SV.meta.sims && SV.meta.variants && SV.meta.variants[SV.meta.sims[p.id]];
    if (v && v.syoubu) assert.ok(NEEDS.cups[p.id] && NEEDS.cups[p.id].status !== "ok" && !NEEDS.cups[p.id].styles, p.id);
  }
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

test("the request sent to the race worker carries the chosen mood, Normal by default", () => {
  const catalog = require("../data/race-skills.json");
  const p = PRESETS.list.find((x) => x.id === "cm22");
  const input = { strategy: "Senkou", speed: 1450, stamina: 650, power: 1300, guts: 700, wisdom: 1050 };
  const normal = RS.request(p, input, [], [], catalog, 4, 1).data;
  assert.equal(normal.uma1.mood, 0);
  assert.equal(normal.uma2.mood, 0);
  assert.equal(RS.request(p, Object.assign({ mood: 2 }, input), [], [], catalog, 4, 1).data.uma2.mood, 2);
});

test("comparison summaries report the paired SD and a 95% interval", () => {
  const s = RS.summary([1, 2, 3, 4]);
  assert.ok(Math.abs(s.sd - Math.sqrt(5 / 3)) < 1e-12);
  assert.ok(Math.abs(s.ci95 - 1.96 * Math.sqrt(5 / 3) / 2) < 1e-12);
  assert.equal(RS.summary([0]).ci95, 0);
});
