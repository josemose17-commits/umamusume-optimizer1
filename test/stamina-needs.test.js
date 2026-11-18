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

test("automatic stamina: the distance drain twice by default, 4 adds the style drains, none on Sprint", async () => {
  const global = require("../data/race-skills.json"), jp = require("../data/race-skills-jp.json");
  const cases = [["cm21", [], []], ["cm22", ["200921", "200931"], ["200921", "200931", "201441", "201441"]],
    ["cm23", ["201161", "201161"], ["201161", "201161", "200921", "200931"]], ["cm24", ["201221", "201221"], ["201221", "201221", "200921", "200931"]]];
  for (const catalog of [global, jp]) {
    for (const [id, two, four] of cases) {
      const p = PRESETS.list.find(x => x.id === id);
      assert.deepEqual(RS.staminaDebuffs(p, "Oikomi"), two);
      assert.deepEqual(RS.staminaDebuffs(p, "Oikomi", 4), four);
      assert.deepEqual(RS.staminaDebuffs(p, "Oikomi", 0), []);
      if (!catalog.courses[p.course.id]) continue;
      const input = { strategy: "Oikomi", speed: 1500, stamina: 750, power: 1240, guts: 850, wisdom: 1100, mood: 1 };
      const { msg, data } = RS.staminaRequest(p, input, catalog, 120, 4242);
      assert.equal(msg, "hpcalc");
      assert.equal(data.racedef.orderRange, null);
      assert.equal(data.course.distance, p.course.distance);
      for (const [k, v] of Object.entries(input)) assert.equal(data.uma[k], v);
      assert.equal(data.uma.skills.size, 0);
      assert.deepEqual([...data.debufUma.skills.values()], two);
      assert.equal(RS.staminaRequest(p, input, catalog, 120, 4242, null, { debuffs: 4 }).data.debufUma.skills.size, four.length);
      assert.equal(data.options.forceFullSpurt, true);
    }
  }
  const p2 = PRESETS.list.find(x => x.id === "cm22"), catalog = global;
  const run = async ({ data }) => ({ results: { runData: { nspurt: data.uma.stamina < 1000 ? 115 : 120 }, results: { requiredHp: [] } } });
  const r95 = await RS.staminaTarget(p2, { strategy: "Nige", stamina: 1200 }, catalog, run, null, { debuffs: 0 });
  const r100 = await RS.staminaTarget(p2, { strategy: "Nige", stamina: 1200 }, catalog, run, null, { debuffs: 0, goal: 1 });
  assert.equal(r95.mode, "d0");
  assert.equal(r95.need, 25);
  assert.equal(r100.need, 1000);
  assert.equal(r100.goal, 1);
});

test("automatic stamina verifies 95% full spurt rather than using a high-stamina relative threshold", async () => {
  const p = PRESETS.list.find(x => x.id === "cm22"), catalog = require("../data/race-skills.json");
  const result = await RS.staminaTarget(p, { strategy: "Nige", stamina: 800, guts: 700 }, catalog, async ({ data }) => {
    assert.equal(data.uma.strategy, "Nige");
    assert.equal(data.uma.guts, 700);
    assert.equal(data.debufUma.skills.size, 2);
    const hits = data.uma.stamina < 681 ? 113 : 115;
    return { results: { runData: { nspurt: hits }, results: { requiredHp: [2100] } } };
  });
  assert.equal(result.need, 700);
  assert.equal(result.hits, 115);
  assert.equal(result.at, 800);
  assert.equal((await RS.staminaTarget(p, { strategy: "Nige" }, catalog, async () =>
    ({ results: { runData: { nspurt: 111 }, results: { requiredHp: [] } } }))).need, null);
});

test("Umalator stamina links preserve both skill lists, options, mood and RNG", async () => {
  const { gzipSync } = require("node:zlib");
  const p = PRESETS.list.find(x => x.id === "cm22"), catalog = require("../data/race-skills.json");
  const url = value => "https://alpha123.github.io/uma-tools/umalator-global/stamina#" +
    encodeURIComponent(gzipSync(JSON.stringify(value)).toString("base64"));
  const uma = { speed: 1450, stamina: 675, power: 1250, guts: 750, wisdom: 1200,
    strategy: "Senkou", surfaceAptitude: "A", distanceAptitude: "S", strategyAptitude: "A", mood: 2 };
  const cfg = { courseId: p.course.id, racedef: p.racedef, nsamples: 500, seed: 321,
    usePosKeep: false, useCompeteTop: true, useIntChecks: true,
    uma1: { ...uma, skills: ["200331"] }, debufUma: { ...uma, strategy: "Sasi", skills: ["200871", "200871"] } };
  const setup = await RS.readStaminaLink(url(cfg), p);
  const { data } = RS.staminaRequest(p, setup.ace, catalog, setup.samples, setup.seed, setup);
  assert.equal(data.nsamples, 500);
  assert.equal(data.options.seed, 321);
  assert.equal(data.options.usePosKeep, false);
  assert.equal(data.uma.mood, 2);
  assert.deepEqual([...data.uma.skills.values()], ["200331"]);
  assert.deepEqual([...data.debufUma.skills.values()], ["200871", "200871"]);
  await assert.rejects(RS.readStaminaLink(url({ ...cfg, racedef: { ...cfg.racedef, ground: 1 } }), p), /same course/);
  assert.equal(RS.staminaEstimate([0, 0, 1600 + 0.8 * 0.89 * 825], "Senkou", 1600), 825);
});

test("automatic stamina is the deck target and moves the stamina shortfall in race scoring", () => {
  const ura = SCENARIOS.find(s => s.id === "ura");
  const raceValues = { ...OPT.raceValuesFor(require("../data/stat-curves.js"), "cm22", "Senkou"), staminaTarget: 825, staminaMargin: 0 };
  const opts = { scenario: ura, build: "dirt", buildTarget: { stamina: 825 }, raceValues };
  const ctx = OPT.buildCtx(opts), line = stamina => [1500, stamina, 1200, 700, 1100];
  assert.equal(ctx.target.stamina, 825);
  assert.ok(OPT.raceL(ctx, line(650)) < OPT.raceL(ctx, line(825)));
  assert.equal(OPT.raceL(ctx, line(825)), OPT.raceL(ctx, line(950)));
  const manual = OPT.buildCtx({ ...opts, target: { stamina: 900 } });
  assert.equal(manual.target.stamina, 900);
  assert.equal(manual.race, null);
});
