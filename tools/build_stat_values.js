// What stats and aptitude grades are worth in lengths, per cup and running style, from the pinned
// Umalator worker (vendor/umalator): head-to-head on the same races, no equipped skills, Normal mood.
//   stats: L per stat point, from +60 on each stat (L: per 60). She starts from the cup's simulation stats
//          with stamina at max(cup's, the style's full-spurt reference in data/stamina-needs.js),
//          so the others are valued with a full spurt; stamina itself is valued as the 60 points
//          over the 150 points below the style's reference (what filling a real gap is worth).
//   apt:   L for B→A and A→S of distance, surface and style aptitude (A aptitudes otherwise).
// Cups with stamina showdown (the Global engine has none) or without course data are skipped;
// the app then keeps its flat rules (60 stat points per L, 1 L per aptitude).
// Usage: node tools/build_stat_values.js           (rebuilds data/stat-values.js)
//        node tools/build_stat_values.js cm22      (prints those cups, writes nothing)
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const RS = require(path.join(ROOT, "race-skills.js"));
const SV = require(path.join(ROOT, "data/skillvalues/index.js"));
const NEEDS = require(path.join(ROOT, "data/stamina-needs.js"));
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "data/race-skills.json"), "utf8"));
const PRESETS = JSON.parse(fs.readFileSync(path.join(ROOT, "data/presets.js"), "utf8").match(/const PRESETS = (\{.*?\});\n/s)[1]);
const WORKER = (fs.readFileSync(path.join(ROOT, "vendor/umalator/README.md"), "utf8").match(/Worker blob: ([0-9a-f]+)/) || [])[1] || null;

if (!Set.prototype.union) Object.defineProperty(Set.prototype, "union", { configurable: true, writable: true,
  value: function (other) { const r = new Set(this); for (const v of other.keys()) r.add(v); return r; } });
if (!Set.prototype.intersection) Object.defineProperty(Set.prototype, "intersection", { configurable: true, writable: true,
  value: function (other) { const r = new Set(); for (const v of this) if (other.has(v)) r.add(v); return r; } });

let handler = null, last = null;
const sandbox = { console: { log() {}, warn() {}, error() {}, assert() {} },
  addEventListener(type, fn) { if (type === "message") handler = fn; }, postMessage(m) { last = m; },
  Math, Date, Map, Set, Array, Object, JSON, Number, String, Symbol, Error, Float64Array, Uint32Array,
  Int32Array, Uint8Array, ArrayBuffer, DataView, BigInt, isNaN, isFinite, parseInt, parseFloat, Infinity, NaN };
sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "vendor/umalator/simulator.worker.js"), "utf8"), sandbox);

const RACES = 120, SEED = 44, STEP = 60, STAMINA_STEP = 150, VERSION = 1;
const STYLES = ["Nige", "Senkou", "Sasi", "Oikomi"];
const KEYS = ["speed", "stamina", "power", "guts", "wisdom"];
const APT = { distance: "distanceAptitude", surface: "surfaceAptitude", style: "strategyAptitude" };

// Paired gain of uma2 over uma1 (edit sets each one's changes) on the same races.
function h2h(preset, input, edit1, edit2) {
  const m = RS.request(preset, input, [], [], catalog, RACES, SEED);
  Object.assign(m.data.uma1, edit1); Object.assign(m.data.uma2, edit2);
  last = null; handler({ data: m });
  if (!last || !last.results) throw new Error("the worker returned no result");
  const s = RS.summary(last.results.results);
  return { L: +s.mean.toFixed(4), ci: +s.ci95.toFixed(4) };
}

function style(preset, st) {
  const s = preset.stats, ref = (((NEEDS.cups[preset.id] || {}).styles || {})[st] || {});
  const stamina = Math.max(s.stamina, ref.status === "ok" ? ref.need : 0);
  // Stamina is valued just below the level she needs (the reference, else the cup's).
  const short = ref.status === "ok" ? ref.need : s.stamina;
  const input = { strategy: st, speed: s.speed, stamina, power: s.power, guts: s.guts, wisdom: s.wisdom, mood: 0 };
  const stats = KEYS.map((k) => {
    // Stamina loses length faster the further short she is, so it's valued over STAMINA_STEP.
    const r = k === "stamina" ? h2h(preset, input, { stamina: short - STAMINA_STEP }, { stamina: short }) : h2h(preset, input, {}, { [k]: input[k] + STEP });
    const per = (k === "stamina" ? STAMINA_STEP : STEP);
    return { perPoint: +(Math.max(0, r.L) / per).toFixed(5), L: +(r.L * STEP / per).toFixed(4), ci: +(r.ci * STEP / per).toFixed(4) };
  });
  const apt = {};
  Object.entries(APT).forEach(([name, key]) => {
    apt[name] = { BA: h2h(preset, input, { [key]: "B" }, { [key]: "A" }), AS: h2h(preset, input, { [key]: "A" }, { [key]: "S" }) };
  });
  return { status: "ok", base: { speed: input.speed, stamina, power: input.power, guts: input.guts, wisdom: input.wisdom, staminaValuedAt: short }, stats, apt };
}

const variantOf = (p) => { const n = SV.meta && SV.meta.sims ? SV.meta.sims[p.id] : null; return n && SV.meta.variants ? SV.meta.variants[n] : null; };
const only = process.argv.slice(2), cups = {}, t0 = Date.now();
for (const p of PRESETS.list) {
  if (only.length && !only.includes(p.id)) continue;
  if (!catalog.courses[p.course.id]) { cups[p.id] = { status: "course" }; continue; }
  const v = variantOf(p);
  if (v && v.syoubu) { cups[p.id] = { status: "engine", why: "stamina showdown" }; continue; }
  const styles = {};
  STYLES.forEach((st) => { try { styles[st] = style(p, st); } catch (e) { styles[st] = { status: "error", error: e.message }; } });
  cups[p.id] = { status: "ok", styles };
  process.stderr.write(`${p.id} ${Math.round((Date.now() - t0) / 1000)}s\n`);
}
const meta = { version: VERSION, built: new Date().toISOString().slice(0, 10), worker: WORKER, races: RACES, seed: SEED, step: STEP, staminaStep: STAMINA_STEP,
  rule: "head-to-head, no equipped skills, Normal mood, A aptitudes; stats from the cup's simulation stats with stamina at the style's full-spurt reference; stamina valued just below the full-spurt reference; stamina-showdown cups skipped" };
if (only.length) { process.stdout.write(JSON.stringify({ meta, cups }, null, 1) + "\n"); process.exit(0); }
fs.writeFileSync(path.join(ROOT, "data/stat-values.js"), `// Generated by tools/build_stat_values.js. Do not edit.
// Lengths per stat point and per aptitude grade, per cup and running style (see meta.rule).
(function (root) {
  const data = ${JSON.stringify({ meta, cups })};
  if (typeof module !== "undefined" && module.exports) module.exports = data;
  else root.UmaStatValues = data;
})(typeof window !== "undefined" ? window : globalThis);
`);
