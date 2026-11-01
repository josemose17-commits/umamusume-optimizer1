// Skills that wait for other skills to fire first (Groundwork: 3 at the start; Tail Held High: 3
// in the middle leg; Ignition: 13 in all; some inherited uniques) never fire in the Umalator's
// skill chart, which tests one skill at a time, so the chart gives them no length. This reruns
// just those skills with the skill-count clause taken as met (a parent built for the race fires
// her opening skills) and patches the results into data/skillvalues: each preset's rows for them
// and the index's names. Everything else in the charts stays as built by build_skillvalues.js.
//
// Usage: node tools/build_count_skills.js <umalator-global dir> <umalator jp dir> <GameTora skills.json> [--workers=4]
//   (umalator-global and umalator from https://github.com/alpha123/uma-tools; the JP data files
//   from https://github.com/alpha123/uma-skill-tools/tree/master/data)
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const [dirGlobal, dirJp, gtSkillsFile] = args;
const WORKERS = +(flags.workers || 4);
const STRATEGIES = ["Nige", "Senkou", "Sasi", "Oikomi"];
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data/skillvalues");
const P = require(path.join(ROOT, "data/presets.js"));
const SV = require(path.join(OUT, "index.js"));

// White and gold skills and inherited uniques (the ones that become sparks or count for a
// parent); not scenario skills (21xxxx) or full uniques.
const COUNT = /activate_count_[a-z_]+(>=|>|==)\d+/g, HAS_COUNT = /activate_count_/;
const wanted = (id, d) => (/^20\d{4}$/.test(id) || /^9\d{5}$/.test(id)) && d.alternatives.some((a) => HAS_COUNT.test(a.condition + "&" + (a.precondition || "")));

// When a skill-count clause is taken as met. Alone, it says when she'd have fired that many
// skills: a random point of the opening leg (start), the middle leg (middle), the last leg
// (end_after) or the second half (later_half, all). With other timing in the same branch
// (a phase, a distance, the last straight), that timing decides and the clause just holds.
const TIMING = /(^|&)(phase|distance_rate|remain_distance|is_last_straight|is_finalcorner|corner|straight|phase_random|phase_laterhalf_random)/;
const WHEN = { start: "phase_random==0", middle: "phase_random==1", end_after: "phase_random==2", later_half: "phase_laterhalf_random==1", all: "phase_laterhalf_random==1" };
function taken(cond) {
  return cond.split("@").map((g) => {
    const rest = g.replace(COUNT, "").replace(/&&+/g, "&").replace(/^&|&$/g, "");
    return g.replace(/activate_count_([a-z_]+)(>=|>|==)\d+/g, (m, kind) => (TIMING.test(rest) || !WHEN[kind] ? "distance_rate>=0" : WHEN[kind]));
  }).join("@");
}
// A copy of a simulator dir with those skills' count clauses taken as met, in its skill data and
// in the copy the simulator bundles.
function patchedDir(dir) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, "skill_data.json"), "utf8"));
  const ids = Object.keys(data).filter((id) => wanted(id, data[id]));
  ids.forEach((id) => data[id].alternatives.forEach((a) => {
    a.condition = taken(a.condition);
    if (a.precondition) a.precondition = taken(a.precondition);
  }));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "count-skills-"));
  ["course_data.json", "skill_meta.json"].forEach((f) => fs.copyFileSync(path.join(dir, f), path.join(out, f)));
  fs.writeFileSync(path.join(out, "skill_data.json"), JSON.stringify(data));
  // Only these skills are charted, so every count clause in the bundle can be replaced.
  const worker = fs.readFileSync(path.join(dir, "simulator.worker.js"), "utf8")
    .replace(/(condition:")([^"]*activate_count_[^"]*)(")/g, (m, a, c, b) => a + taken(c) + b);
  fs.writeFileSync(path.join(out, "simulator.worker.js"), worker);
  return { dir: out, ids };
}
const DIRS = { global: patchedDir(dirGlobal), jp: patchedDir(dirJp) };
console.log("global:", DIRS.global.ids.join(" "), "\njp:", DIRS.jp.ids.join(" "));

const jobs = [];
SV.ready.forEach((pid) => {
  const p = P.list.find((x) => x.id === pid);
  const sim = DIRS[p.sim];
  STRATEGIES.forEach((strategy) => jobs.push({ p, strategy, sim }));
});
const results = {}; // preset -> strategy -> { id: [median, mean] }
let running = 0;
function next(done) {
  if (!jobs.length) { if (!running) done(); return; }
  const j = jobs.shift();
  const base = path.join(j.sim.dir, `${j.p.id}-${j.strategy}`);
  fs.writeFileSync(base + ".job.json", JSON.stringify({ courseId: j.p.course.id, racedef: j.p.racedef, stats: j.p.stats, strategies: [j.strategy], skills: j.sim.ids }));
  running++;
  spawn(process.execPath, [path.join(__dirname, "umalator_run.js"), j.sim.dir, base + ".job.json", base + ".out.json"], { stdio: "inherit" }).on("exit", () => {
    running--;
    try {
      const r = JSON.parse(fs.readFileSync(base + ".out.json", "utf8")).values[j.strategy];
      ((results[j.p.id] = results[j.p.id] || {})[j.strategy] = r);
    } catch (e) { console.error("failed", j.p.id, j.strategy); }
    next(done);
    if (jobs.length % 20 === 0) console.log(jobs.length, "jobs left");
  });
}
function finish() {
  const all = new Set([...DIRS.global.ids, ...DIRS.jp.ids]);
  const used = new Set();
  Object.keys(results).forEach((pid) => {
    const file = path.join(OUT, pid + ".json"), chart = JSON.parse(fs.readFileSync(file, "utf8"));
    STRATEGIES.forEach((st) => {
      const r = (results[pid] || {})[st];
      if (!r) return;
      // Same rule as build_skillvalues.js: keep a skill worth at least 0.05 L (median or mean).
      const rows = (chart[st] || []).filter(([id]) => !all.has(String(id)));
      Object.entries(r).forEach(([id, v]) => { if (v[0] >= 0.05 || v[1] >= 0.05) { rows.push([+id, Math.round(v[0] * 100), Math.round(v[1] * 100)]); used.add(id); } });
      chart[st] = rows.sort((a, b) => b[1] - a[1]);
    });
    fs.writeFileSync(file, JSON.stringify(chart));
  });
  // Names for skills new to the index: [name, cost, rarity (1 white, 2 gold, 9 inherited), on Global].
  const gt = new Map(JSON.parse(fs.readFileSync(gtSkillsFile, "utf8")).map((s) => [String(s.id), s]));
  used.forEach((id) => {
    if (SV.skills[id]) return;
    const inherited = id[0] === "9", s = gt.get(inherited ? "1" + id.slice(1) : id);
    if (!s) return;
    SV.skills[id] = inherited ? [(s.name_en || s.jpname) + " (inherited)", 200, 9, s.name_en ? 1 : 0] : [s.name_en || s.jpname, s.cost || 0, s.rarity || 1, s.name_en ? 1 : 0];
  });
  SV.meta.countSkills = "Skills that need other skills to fire first were rerun with that taken as met (tools/build_count_skills.js, " + new Date().toISOString().slice(0, 10) + ")";
  fs.writeFileSync(path.join(OUT, "index.js"), "// Generated by tools/build_skillvalues.js from alpha123's Umalator. Do not edit.\n" +
    "(function (root) {\n  const SKILL_VALUES = " + JSON.stringify({ meta: SV.meta, ready: SV.ready, skills: SV.skills }) + ";\n" +
    '  if (typeof module !== "undefined" && module.exports) module.exports = SKILL_VALUES;\n  else root.UmaSkillValues = SKILL_VALUES;\n' +
    '})(typeof window !== "undefined" ? window : globalThis);\n');
  console.log("patched", Object.keys(results).length, "presets;", used.size, "skills worth 0.05 L somewhere");
}
const done = () => finish();
for (let i = 0; i < WORKERS; i++) next(done);
