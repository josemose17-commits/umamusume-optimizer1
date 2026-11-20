// What each stat is worth in lengths ACROSS its range, per cup and running style, from the pinned
// Umalator worker (vendor/umalator), for the deck optimizer's race scoring (optimizer.js raceL).
// data/stat-values.js measures one slope per stat at the cup's stat line; a deck can end hundreds
// of points away from it, and the value isn't one shape (power has steps), so this measures the
// curve: one stat at a time set to each grid level, the others at the cup's line (stamina at the
// style's full-spurt reference, as in build_stat_values.js), head-to-head against that line on the
// same races. No equipped skills, Normal mood, A aptitudes.
//   curves[i]: [[level, L, ci95], ...] for speed, stamina, power, guts, wit; L is 0 at the line.
//   Stamina's grid is around the style's reference (it stops mattering once the spurt is full).
// Stamina-showdown cups (CM 27 on, League of Heroes) run on the cup's JP-dated simulator
// (race-worker.js with its variant, as in the browser). There stamina past a full spurt still
// gains on courses over 2100 m, so stamina's grid runs from 300 to 2000 (showdown: true, no flat
// top), and the style's full-spurt stamina (need) is measured here: the lowest grid level whose
// full-spurt count is within 2 races of the count at 2000. Cups without course data are skipped.
// Course stat thresholds: a course lists up to two stats (courseSetStatus); above 300, 600 and 900
// each listed stat raises the course's speed bonus by 5% (averaged over the listed stats: on Tokyo
// dirt 1600, Speed and Stamina, so Stamina 901+ instead of 601-900 is +2.5% speed). steps:
// [[stat index, first level that pays, L, ci95]], each measured at the cup's line (that stat at the
// level vs one point below, same races). The curves are stored without them (pure: true, every
// grid point minus the steps between it and the line), so the app adds the steps by her absolute
// stat, also on stamina, whose curve it shifts to her full-spurt point.
// Usage: node tools/build_stat_curves.js                     (all cups, writes data/stat-curves.js)
//        node tools/build_stat_curves.js --steps [cm22 ...]  (adds the steps to the shipped curves)
//        node tools/build_stat_curves.js cm22 cm23 --part f  (those cups, to a JSON file f)
//        node tools/build_stat_curves.js --merge f1 f2 ...   (joins part files, writes the data)
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const RS = require(path.join(ROOT, "race-skills.js"));
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "data/race-skills.json"), "utf8"));
const PRESETS = JSON.parse(fs.readFileSync(path.join(ROOT, "data/presets.js"), "utf8").match(/const PRESETS = (\{.*?\});\n/s)[1]);
const WORKER = (fs.readFileSync(path.join(ROOT, "vendor/umalator/README.md"), "utf8").match(/Worker blob: ([0-9a-f]+)/) || [])[1] || null;

if (!Set.prototype.union) Object.defineProperty(Set.prototype, "union", { configurable: true, writable: true,
  value: function (other) { const r = new Set(this); for (const v of other.keys()) r.add(v); return r; } });
if (!Set.prototype.intersection) Object.defineProperty(Set.prototype, "intersection", { configurable: true, writable: true,
  value: function (other) { const r = new Set(); for (const v of this) if (other.has(v)) r.add(v); return r; } });

// JP-dated cups: race-worker.js loading the cup's variant, in a sandbox (as test/skill-opt.test.js).
const CJ = JSON.parse(fs.readFileSync(path.join(ROOT, "data/race-skills-jp.json"), "utf8"));
const jpWorkers = {};
function jpWorker(sim) {
  if (jpWorkers[sim]) return jpWorkers[sim];
  let h, got;
  const sb = { URL, console: { assert() {}, log() {}, warn() {}, error() {} }, location: { href: "http://localhost/race-worker.js?v=build&sim=" + sim },
    addEventListener: (t, f) => { h = f; }, postMessage: (m) => { if (m.type === "compare" || m.type === "error") got = m; } };
  sb.self = sb;
  sb.XMLHttpRequest = function () { let u; this.open = (m, url) => { u = url; }; this.send = () => { this.status = 200; this.responseText = fs.readFileSync(path.join(ROOT, u.split("?")[0]), "utf8"); }; };
  vm.createContext(sb);
  sb.importScripts = (u) => vm.runInContext(fs.readFileSync(path.join(ROOT, u.split("?")[0]), "utf8"), sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "race-worker.js"), "utf8"), sb);
  return (jpWorkers[sim] = (msg) => { got = null; h({ data: msg }); if (!got || got.type !== "compare") throw new Error((got && got.error) || "the JP worker returned no result"); return got; });
}
let handler = null, last = null;
const sandbox = { console: { log() {}, warn() {}, error() {}, assert() {} },
  addEventListener(type, fn) { if (type === "message") handler = fn; }, postMessage(m) { last = m; },
  Math, Date, Map, Set, Array, Object, JSON, Number, String, Symbol, Error, Float64Array, Uint32Array,
  Int32Array, Uint8Array, ArrayBuffer, DataView, BigInt, isNaN, isFinite, parseInt, parseFloat, Infinity, NaN };
sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "vendor/umalator/simulator.worker.js"), "utf8"), sandbox);

const SV = require(path.join(ROOT, "data/skillvalues/index.js"));
const NEEDS = require(path.join(ROOT, "data/stamina-needs.js"));
const RACES = 120, SEED = 44, VERSION = 2, THRESHOLDS = [300, 600, 900];
const STYLES = ["Nige", "Senkou", "Sasi", "Oikomi"];
const KEYS = ["speed", "stamina", "power", "guts", "wisdom"];
const GRID = [500, 700, 900, 1000, 1100, 1150, 1200, 1250, 1300, 1350, 1400, 1450, 1500, 1600, 1700, 1800];
const STAMINA_GRID = [-600, -500, -400, -300, -200, -150, -100, -50, 0, 100, 200];

function h2h(preset, input, edit1, edit2) {
  const m = RS.request(preset, input, [], [], catalog, RACES, SEED);
  Object.assign(m.data.uma1, edit1); Object.assign(m.data.uma2, edit2);
  last = null; handler({ data: m });
  if (!last || !last.results) throw new Error("the worker returned no result");
  const s = RS.summary(last.results.results);
  return [+s.mean.toFixed(3), +s.ci95.toFixed(3)];
}

// Head-to-head on a JP-dated cup's simulator: [L, ci95, full-spurt share of the changed runner].
function h2hJP(preset, sim, input, edit) {
  const m = RS.request(preset, input, [], [], CJ, RACES, SEED);
  Object.assign(m.data.uma2, edit);
  const r = jpWorker(sim)(m), s = RS.summary(Array.from(r.results.results)), sp = r.results.runData && r.results.runData.nspurt;
  return [+s.mean.toFixed(3), +s.ci95.toFixed(3), sp ? sp[1] / RACES : null];
}
const STAMINA_SWEEP = Array.from({ length: 18 }, (_, i) => 300 + 100 * i);
function styleJP(preset, st, sim) {
  const s = preset.stats, showdown = preset.course.distance > 2100;
  const line = { strategy: st, speed: s.speed, stamina: s.stamina, power: s.power, guts: s.guts, wisdom: s.wisdom, mood: 0 };
  // Stamina first: its curve against the cup's line, and the full-spurt share at each level.
  const sta = STAMINA_SWEEP.filter((v) => v !== s.stamina).map((v) => [v].concat(h2hJP(preset, sim, line, { stamina: v })));
  const top = sta[sta.length - 1][3];
  let need = (sta.find((x) => x[3] != null && x[3] * RACES >= top * RACES - 2) || sta[sta.length - 1])[0];
  // One step finer below it.
  if (need > 300 && need - 50 !== s.stamina) { const half = [need - 50].concat(h2hJP(preset, sim, line, { stamina: need - 50 })); sta.push(half); if (half[3] * RACES >= top * RACES - 2) need -= 50; }
  sta.push([s.stamina, 0, 0, null]);
  const input = Object.assign({}, line, { stamina: Math.max(s.stamina, need) });
  const curves = KEYS.map((k, i) => {
    if (i === 1) return sta.map((x) => x.slice(0, 3)).sort((a, b) => a[0] - b[0]);
    const pts = GRID.filter((v) => v !== input[k]).map((v) => [v].concat(h2hJP(preset, sim, input, { [k]: v }).slice(0, 2)));
    pts.push([input[k], 0, 0]);
    return pts.sort((a, b) => a[0] - b[0]);
  });
  return { status: "ok", engine: "jp:" + sim, showdown, base: { speed: input.speed, stamina: s.stamina, power: input.power, guts: input.guts, wisdom: input.wisdom, need }, curves };
}
function style(preset, st) {
  const s = preset.stats, ref = (((NEEDS.cups[preset.id] || {}).styles || {})[st] || {});
  const need = ref.status === "ok" ? ref.need : s.stamina;
  const input = { strategy: st, speed: s.speed, stamina: Math.max(s.stamina, need), power: s.power, guts: s.guts, wisdom: s.wisdom, mood: 0 };
  const curves = KEYS.map((k, i) => {
    const levels = i === 1 ? STAMINA_GRID.map((d) => need + d).filter((v) => v >= 100 && v <= 2500) : GRID;
    const pts = levels.filter((v) => v !== input[k]).map((v) => [v].concat(h2h(preset, input, {}, { [k]: v })));
    pts.push([input[k], 0, 0]);
    return pts.sort((a, b) => a[0] - b[0]);
  });
  return { status: "ok", base: { speed: input.speed, stamina: input.stamina, power: input.power, guts: input.guts, wisdom: input.wisdom, need }, curves };
}

// The stats a course's speed bonus counts (0 speed .. 4 wit), from the engine's course data.
const courseStats = (p, cat) => (((cat.courses[p.course.id] || {}).courseSetStatus) || []).map((n) => n - 1).filter((i) => i >= 0 && i < 5);
// steps for one style: measure(i, level) → [L, ci95] of that stat at level against level - 1.
function stepsOf(listed, measure) {
  const out = [];
  listed.forEach((i) => THRESHOLDS.forEach((t) => { const [L, ci] = measure(i, t + 1); out.push([i, t + 1, L, ci]); }));
  return out;
}
const stepL = (steps, i, x) => steps.reduce((n, s) => n + (s[0] === i && x >= s[1] ? s[2] : 0), 0);
// Takes the steps out of a style's curves (each point is relative to the line, so minus the steps
// between the line and it).
function purify(v, steps) {
  v.curves = v.curves.map((pts, i) => pts.map(([x, L, ci]) => [x, +(L - (stepL(steps, i, x) - stepL(steps, i, v.base[KEYS[i]]))).toFixed(3), ci]));
  v.steps = steps; v.pure = true;
  return v;
}
function withSteps(p, st, v) {
  if (!v || v.status !== "ok" || v.pure) return v;
  const jp = v.engine && /^jp:/.test(v.engine), cat = jp ? CJ : catalog, listed = courseStats(p, cat);
  if (!listed.length) { v.steps = []; v.pure = true; return v; }
  const line = { strategy: st, speed: v.base.speed, stamina: v.base.stamina, power: v.base.power, guts: v.base.guts, wisdom: v.base.wisdom, mood: 0 };
  const sim = jp ? v.engine.slice(3) : null;
  const measure = (i, level) => {
    const k = KEYS[i], below = Object.assign({}, line, { [k]: level - 1 });
    return jp ? h2hJP(p, sim, below, { [k]: level }).slice(0, 2) : h2h(p, below, {}, { [k]: level });
  };
  return purify(v, stepsOf(listed, measure));
}

const variantOf = (p) => { const n = SV.meta && SV.meta.sims ? SV.meta.sims[p.id] : null; return n && SV.meta.variants ? SV.meta.variants[n] : null; };
const args = process.argv.slice(2);
const meta = () => ({ version: VERSION, built: new Date().toISOString().slice(0, 10), worker: WORKER, races: RACES, seed: SEED, grid: GRID, staminaGrid: STAMINA_GRID,
  rule: "one stat at a time on a grid, the others at the cup's simulation stats (stamina at the style's full-spurt reference), head-to-head on the same races, no equipped skills, Normal mood, A aptitudes; stamina-showdown cups on their JP-dated simulator (engine), stamina swept 300-2000 with the full-spurt need measured" });
function write(cups) {
  fs.writeFileSync(path.join(ROOT, "data/stat-curves.js"), `// Generated by tools/build_stat_curves.js. Do not edit.
// Lengths across each stat's range, per cup and running style (see meta.rule).
(function (root) {
  const data = ${JSON.stringify({ meta: meta(), cups })};
  if (typeof module !== "undefined" && module.exports) module.exports = data;
  else root.UmaStatCurves = data;
})(typeof window !== "undefined" ? window : globalThis);
`);
}
if (args[0] === "--merge") {
  // Starts from the shipped data, so a part with a few cups updates only those.
  let cups = {};
  try { cups = Object.assign({}, require(path.join(ROOT, "data/stat-curves.js")).cups); } catch (e) { cups = {}; }
  args.slice(1).forEach((f) => Object.assign(cups, JSON.parse(fs.readFileSync(f, "utf8"))));
  const order = PRESETS.list.map((p) => p.id).filter((id) => cups[id]);
  write(Object.fromEntries(order.map((id) => [id, cups[id]])));
  process.exit(0);
}
if (args[0] === "--steps") {
  // The shipped curves (same worker), with each course's threshold steps measured and taken out.
  const data = require(path.join(ROOT, "data/stat-curves.js")), want = args.slice(1), t0 = Date.now();
  if (data.meta.worker !== WORKER) throw new Error("the curves were built with another worker: rebuild them instead");
  PRESETS.list.forEach((p) => {
    const cup = data.cups[p.id];
    if (!cup || cup.status !== "ok" || (want.length && !want.includes(p.id))) return;
    const anyJp = Object.values(cup.styles).some((v) => v.engine && /^jp:/.test(v.engine));
    cup.courseStats = courseStats(p, anyJp ? CJ : catalog);
    Object.keys(cup.styles).forEach((st) => { try { cup.styles[st] = withSteps(p, st, cup.styles[st]); } catch (e) { process.stderr.write(p.id + " " + st + ": " + e.message + "\n"); } });
    process.stderr.write(`${p.id} ${cup.courseStats.join(",") || "-"} ${Math.round((Date.now() - t0) / 1000)}s\n`);
  });
  const old = data.meta;
  write(data.cups);
  // Keep the curves' own build facts; note the steps.
  const out = require("node:fs").readFileSync(path.join(ROOT, "data/stat-curves.js"), "utf8").replace(/"meta":\{.*?"rule":"[^"]*"\}/, () => '"meta":' + JSON.stringify(Object.assign({}, old, { version: VERSION, steps: new Date().toISOString().slice(0, 10), thresholds: THRESHOLDS, stepRule: "course stat thresholds measured at the cup's line (the stat at 301/601/901 vs one point below), taken out of the curves (pure) and kept as steps" })));
  fs.writeFileSync(path.join(ROOT, "data/stat-curves.js"), out);
  process.exit(0);
}
const pi = args.indexOf("--part"), part = pi >= 0 ? args[pi + 1] : null;
const only = args.filter((a, i) => a !== "--part" && !(pi >= 0 && i === pi + 1));
const cups = {}, t0 = Date.now();
for (const p of PRESETS.list) {
  if (only.length && !only.includes(p.id)) continue;
  if (!catalog.courses[p.course.id]) { cups[p.id] = { status: "course" }; continue; }
  const v = variantOf(p);
  const sim = SV.meta && SV.meta.sims ? SV.meta.sims[p.id] : null;
  const styles = {};
  STYLES.forEach((st) => { try { styles[st] = withSteps(p, st, v && v.syoubu ? styleJP(p, st, sim) : style(p, st)); } catch (e) { styles[st] = { status: "error", error: e.message }; } });
  cups[p.id] = { status: "ok", courseStats: courseStats(p, v && v.syoubu ? CJ : catalog), styles };
  process.stderr.write(`${p.id} ${Math.round((Date.now() - t0) / 1000)}s\n`);
}
if (part) fs.writeFileSync(part, JSON.stringify(cups));
else write(cups);
