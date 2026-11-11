// Reference stamina for each running style on each cup's course, from the pinned Umalator
// worker (vendor/umalator). It is an EMPTY-SKILL reference: the cup's simulation stats, Normal
// mood, A aptitudes and no equipped skills at all (no heals, greens, uniques or speed skills).
// It is not the stamina a finished ace needs; the app rechecks her own build separately.
//
// need: the lowest stamina (steps of 50) whose full-last-spurt count over RACES races is within
// SLACK of her count at 2000 stamina (a Front Runner's count tops out below 100%: rushing costs
// stamina at random). Binary search assumes the count rises with stamina, so the step below is
// rerun and recorded (below), and the result is rerun on an independent seed (confirm).
//
// Cups whose JP-dated rules include stamina showdown (data/skillvalues meta.sims variants) are
// skipped: the Global engine has no showdown, and showdown is a stamina mechanic.
// Usage: node tools/build_stamina_needs.js            (rebuilds every cup: data/stamina-needs.js)
//        node tools/build_stamina_needs.js cm22 cm23  (prints those cups, writes nothing)
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const RS = require(path.join(ROOT, "race-skills.js"));
const SV = require(path.join(ROOT, "data/skillvalues/index.js"));
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "data/race-skills.json"), "utf8"));
const presetSrc = fs.readFileSync(path.join(ROOT, "data/presets.js"), "utf8");
const PRESETS = JSON.parse(presetSrc.match(/const PRESETS = (\{.*?\});\n/s)[1]);
const workerFile = path.join(ROOT, "vendor/umalator/simulator.worker.js");
const workerSrc = fs.readFileSync(workerFile, "utf8");
const WORKER = (fs.readFileSync(path.join(ROOT, "vendor/umalator/README.md"), "utf8").match(/Worker blob: ([0-9a-f]+)/) || [])[1] || null;

// Node 20 lacks Set.prototype.union/intersection, which the worker uses (as race-worker.js).
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
vm.runInContext(workerSrc, sandbox);

const RACES = 160, SEED = 4242, CONFIRM_SEED = 90210, SLACK = 0.02, STEP = 50, LOW = 300, HIGH = 2000;
const STYLES = ["Nige", "Senkou", "Sasi", "Oikomi"];
const VERSION = 2;

function spurts(preset, style, stamina, seed = SEED) {
  const s = preset.stats;
  const input = { strategy: style, speed: s.speed, stamina, power: s.power, guts: s.guts, wisdom: s.wisdom, mood: 0 };
  last = null;
  handler({ data: RS.request(preset, input, [], [], catalog, RACES, seed) });
  if (!last || !last.results || !last.results.runData) throw new Error("the worker returned no result");
  return last.results.runData.nspurt[1];
}

function need(preset, style) {
  const top = spurts(preset, style, HIGH), goal = Math.ceil(top - SLACK * RACES);
  if (top < RACES / 2) return { status: "unreached", top, of: RACES };
  let lo = LOW / STEP, hi = HIGH / STEP;
  while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (spurts(preset, style, mid * STEP) >= goal) hi = mid; else lo = mid + 1; }
  const n = lo * STEP, hits = spurts(preset, style, n);
  const below = n > LOW ? { stamina: n - STEP, hits: spurts(preset, style, n - STEP) } : null;
  return { status: "ok", need: n, hits, of: RACES, goal, top, below, confirm: { seed: CONFIRM_SEED, hits: spurts(preset, style, n, CONFIRM_SEED) } };
}

function variantOf(p) {
  const name = SV.meta && SV.meta.sims ? SV.meta.sims[p.id] : null;
  return name && SV.meta.variants ? SV.meta.variants[name] : null;
}

const only = process.argv.slice(2);
const cups = {};
const t0 = Date.now();
for (const p of PRESETS.list) {
  if (only.length && !only.includes(p.id)) continue;
  const s = p.stats, inputs = { speed: s.speed, power: s.power, guts: s.guts, wisdom: s.wisdom };
  if (!catalog.courses[p.course.id]) { cups[p.id] = { status: "course", inputs }; continue; }
  const v = variantOf(p);
  if (v && v.syoubu) { cups[p.id] = { status: "engine", why: "stamina showdown", inputs }; continue; }
  const styles = {};
  for (const st of STYLES) {
    try { styles[st] = need(p, st); } catch (e) { styles[st] = { status: "error", error: e.message }; }
  }
  cups[p.id] = { status: "ok", inputs, styles };
  process.stderr.write(`${p.id} ${STYLES.map((st) => st + ":" + (styles[st].need || styles[st].status)).join(" ")} ${Math.round((Date.now() - t0) / 1000)}s\n`);
}
const meta = { version: VERSION, built: new Date().toISOString().slice(0, 10), worker: WORKER, races: RACES, seed: SEED, confirmSeed: CONFIRM_SEED,
  rule: `empty-skill reference: lowest stamina (steps of ${STEP}) whose full-spurt count over ${RACES} races is within ${SLACK * 100} points of the count at ${HIGH} stamina; the cup's simulation stats, Normal mood, A aptitudes, no equipped skills; stamina-showdown cups skipped` };
if (only.length) { process.stdout.write(JSON.stringify({ meta, cups }, null, 1) + "\n"); process.exit(0); }
fs.writeFileSync(path.join(ROOT, "data/stamina-needs.js"), `// Generated by tools/build_stamina_needs.js. Do not edit.
// Reference stamina per cup and running style (see meta.rule): an empty-skill simulation, not
// a finished ace's requirement.
(function (root) {
  const data = ${JSON.stringify({ meta, cups })};
  if (typeof module !== "undefined" && module.exports) module.exports = data;
  else root.UmaStaminaNeeds = data;
})(typeof window !== "undefined" ? window : globalThis);
`);
