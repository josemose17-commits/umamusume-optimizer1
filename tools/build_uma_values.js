// What each uma brings to a cup herself, in lengths, for the Pull planner's team picks (2 of
// your 3 per cup, the flex slot): her own unique and her aptitudes, per cup ahead and running
// style she has at A or S, on the cup's JP-dated simulator (race-worker.js with its variant, as
// in the browser), head-to-head on the same races at the cup's stat line (stamina at the style's
// full-spurt reference from data/stat-curves.js), no other skills, Normal mood.
//   umas[trainee id][style]: L of her own unique (raced with it against without it).
//   apt[style]: L of distance, surface and style aptitude B→A and A→S on that cup.
// Uniques that scale with how many green skills fired (ability value usage 14, Copano Rickey's
// Luck Runs My Way) are valued at ×1, as with 3-4 greens (the race-mechanics document); the
// simulator would fire none here.
// Usage: node tools/build_uma_values.js                    (cups from today, writes data/uma-values.js)
//        node tools/build_uma_values.js cm22 --part f      (those cups, to a JSON file f)
//        node tools/build_uma_values.js --merge f1 f2 ...  (joins part files into the data)
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = path.join(__dirname, "..");
if (!Set.prototype.union) Object.defineProperty(Set.prototype, "union", { configurable: true, writable: true,
  value: function (o) { const r = new Set(this); for (const v of o.keys()) r.add(v); return r; } });
if (!Set.prototype.intersection) Object.defineProperty(Set.prototype, "intersection", { configurable: true, writable: true,
  value: function (o) { const r = new Set(); for (const v of this) if (o.has(v)) r.add(v); return r; } });
const RS = require(path.join(ROOT, "race-skills.js"));
const SV = require(path.join(ROOT, "data/skillvalues/index.js"));
const D = require(path.join(ROOT, "deck.js"));
const CURVES = require(path.join(ROOT, "data/stat-curves.js"));
const CJ = JSON.parse(fs.readFileSync(path.join(ROOT, "data/race-skills-jp.json"), "utf8"));
const PRESETS = JSON.parse(fs.readFileSync(path.join(ROOT, "data/presets.js"), "utf8").match(/const PRESETS = (\{.*?\});\n/s)[1]);
const RACES = 60, SEED = 44, VERSION = 1;
const STYLES = ["Nige", "Senkou", "Sasi", "Oikomi"], STYLE_IX = { Nige: 6, Senkou: 7, Sasi: 8, Oikomi: 9 };
const APT = { distance: "distanceAptitude", surface: "surfaceAptitude", style: "strategyAptitude" };

// Green-count uniques at ×1: the variant's (or the JP worker's) entry with that scaling set to 1.
const GREEN_COUNT = Object.keys(CJ.skills).filter((id) => (CJ.skills[id].alternatives || []).some((a) => (a.effects || []).some((e) => e.scaling === 14)));
function asOne(over) {
  const out = {};
  GREEN_COUNT.forEach((id) => {
    const e = JSON.parse(JSON.stringify(over[id] || CJ.skills[id]));
    e.alternatives.forEach((a) => (a.effects || []).forEach((f) => { if (f.scaling === 14) f.scaling = 1; }));
    out[id] = e;
  });
  return out;
}
const workers = {};
function worker(sim) {
  if (workers[sim]) return workers[sim];
  let h, got;
  const sb = { URL, console: { assert() {}, log() {}, warn() {}, error() {} }, location: { href: "http://localhost/race-worker.js?v=build&sim=" + sim },
    addEventListener: (t, f) => { h = f; }, postMessage: (m) => { if (m.type === "compare" || m.type === "error") got = m; } };
  sb.self = sb;
  sb.XMLHttpRequest = function () {
    let u;
    this.open = (m, url) => { u = url; };
    this.send = () => {
      this.status = 200;
      let text = fs.readFileSync(path.join(ROOT, u.split("?")[0]), "utf8");
      if (/race-variants\//.test(u)) { const v = JSON.parse(text); v.over = Object.assign({}, v.over || {}, asOne(v.over || {})); text = JSON.stringify(v); }
      this.responseText = text;
    };
  };
  vm.createContext(sb);
  sb.importScripts = (u) => vm.runInContext(fs.readFileSync(path.join(ROOT, u.split("?")[0]), "utf8"), sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "race-worker.js"), "utf8"), sb);
  return (workers[sim] = (msg) => { got = null; h({ data: msg }); if (!got || got.type !== "compare") throw new Error((got && got.error) || "no result"); return got; });
}
function h2h(p, sim, input, edit1, edit2, after) {
  const m = RS.request(p, input, [], after || [], CJ, RACES, SEED);
  Object.assign(m.data.uma1, edit1); Object.assign(m.data.uma2, edit2);
  const s = RS.summary(Array.from(worker(sim)(m).results.results));
  return +s.mean.toFixed(3);
}
const good = (g) => g === "A" || g === "S";
function cup(p) {
  const sim = SV.meta.sims[p.id];
  const curve = (CURVES.cups[p.id] || {}).styles || {};
  const line = (st) => ({ strategy: st, speed: p.stats.speed, stamina: Math.max(p.stats.stamina, ((curve[st] || {}).base || {}).need || 0), power: p.stats.power, guts: p.stats.guts, wisdom: p.stats.wisdom, mood: 0 });
  const apt = {}, umas = {};
  STYLES.forEach((st) => {
    const input = line(st);
    apt[st] = {};
    Object.entries(APT).forEach(([k, key]) => { apt[st][k] = { BA: h2h(p, sim, input, { [key]: "B" }, { [key]: "A" }), AS: h2h(p, sim, input, { [key]: "A" }, { [key]: "S" }) }; });
  });
  D.DATA.trainees.forEach((t) => {
    const u = (t.us || []).map(String).filter((id) => CJ.skills[id] && CJ.meta[id]);
    if (!u.length) return;
    const styles = STYLES.filter((st) => good(t.apt[STYLE_IX[st]]));
    (styles.length ? styles : [STYLES.reduce((a, b) => ("SABCDEFG".indexOf(t.apt[STYLE_IX[b]]) < "SABCDEFG".indexOf(t.apt[STYLE_IX[a]]) ? b : a))]).forEach((st) => {
      try { (umas[t.id] = umas[t.id] || {})[st] = h2h(p, sim, line(st), {}, {}, [u[u.length - 1]]); } catch (e) { /* a unique the simulator can't run: left out */ }
    });
  });
  return { status: "ok", sim, apt, umas };
}
const today = new Date().toISOString().slice(0, 10);
const meta = () => ({ version: VERSION, built: today, races: RACES, seed: SEED,
  rule: "own unique raced with vs without at the cup's stat line (stamina at the style's full-spurt reference), every running style she has at A or S, on the cup's JP-dated simulator; green-count uniques at x1; aptitude B->A and A->S per style; no other skills, Normal mood" });
function write(cups) {
  fs.writeFileSync(path.join(ROOT, "data/uma-values.js"), `// Generated by tools/build_uma_values.js. Do not edit.
// What each uma brings to a cup herself (own unique, aptitudes), in lengths (see meta.rule).
(function (root) {
  const data = ${JSON.stringify({ meta: meta(), cups })};
  if (typeof module !== "undefined" && module.exports) module.exports = data;
  else root.UmaUmaValues = data;
})(typeof window !== "undefined" ? window : globalThis);
`);
}
const args = process.argv.slice(2);
if (args[0] === "--merge") {
  let cups = {};
  try { cups = Object.assign({}, require(path.join(ROOT, "data/uma-values.js")).cups); } catch (e) { cups = {}; }
  args.slice(1).forEach((f) => Object.assign(cups, JSON.parse(fs.readFileSync(f, "utf8"))));
  const order = PRESETS.list.map((p) => p.id).filter((id) => cups[id]);
  write(Object.fromEntries(order.map((id) => [id, cups[id]])));
  process.exit(0);
}
const pi = args.indexOf("--part"), part = pi >= 0 ? args[pi + 1] : null;
const only = args.filter((a, i) => a !== "--part" && !(pi >= 0 && i === pi + 1));
const out = {}, t0 = Date.now();
for (const p of PRESETS.list) {
  if (only.length ? !only.includes(p.id) : !(p.global.end >= today)) continue;
  if (!CJ.courses[p.course.id] || !SV.meta.sims[p.id] || !/^jp-/.test(SV.meta.sims[p.id])) { out[p.id] = { status: "skipped" }; continue; }
  out[p.id] = cup(p);
  process.stderr.write(`${p.id} ${Math.round((Date.now() - t0) / 1000)}s\n`);
}
if (part) fs.writeFileSync(part, JSON.stringify(out));
else write(out);
