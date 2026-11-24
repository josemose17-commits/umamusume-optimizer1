// Runs alpha123's Umalator simulator (uma-tools, umalator-global) headless in Node
// to compute each skill's length gain on a course, exactly like the site's
// "Skill chart" tab. Usage: node tools/umalator_run.js <dir with simulator.worker.js
// + course_data.json + skill_data.json + skill_meta.json> <job.json> <out.json>
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const [dir, jobFile, outFile] = process.argv.slice(2);
const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
const courses = JSON.parse(fs.readFileSync(path.join(dir, 'course_data.json'), 'utf8'));
const skillData = JSON.parse(fs.readFileSync(path.join(dir, 'skill_data.json'), 'utf8'));

let handler = null;
let last = null;
const sandbox = {
  console: { log() {}, warn() {}, error() {}, assert() {} },
  addEventListener(type, fn) { if (type === 'message') handler = fn; },
  postMessage(m) { last = m; },
  Math, Date, Map, Set, Array, Object, JSON, Number, String, Symbol, Error,
  Float64Array, Uint32Array, Int32Array, Uint8Array, ArrayBuffer, DataView, BigInt,
  isNaN, isFinite, parseInt, parseFloat, Infinity, NaN,
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(dir, 'simulator.worker.js'), 'utf8'), sandbox);
if (!handler) throw new Error('worker did not register a message handler');

function course(id) {
  const c = JSON.parse(JSON.stringify(courses[id]));
  c.slopes.sort((a, b) => a.start - b.start);
  return c;
}
const ORDER = { Nige: [1, 1], Senkou: [2, 4], Sasi: [5, 9], Oikomi: [5, 9], Oonige: [1, 1] };

function chart(skills, job, strategy) {
  const uma = Object.assign({
    outfitId: '', starCount: 3, strategy,
    distanceAptitude: 'S', surfaceAptitude: 'A', strategyAptitude: 'A',
    aptitudes: ['S', 'S', 'S', 'S', 'A', 'A', 'A', 'A', 'A', 'A'],
    skills: new Map(), samplePolicies: new Map(), uniqueLv: 1, mood: 2, popularity: 1,
  }, job.stats);
  const r = job.racedef;
  const racedef = {
    groundCondition: r.ground, weather: r.weather, season: r.season, time: r.time,
    grade: 100, skillId: '', orderRange: ORDER[strategy], numUmas: job.numUmas || 9,
  };
  last = null;
  handler({ data: { msg: 'chart', data: { skills, course: course(job.courseId), racedef, uma,
    options: { seed: job.seed || 20261006, usePosKeep: true, useCompeteTop: true, useIntChecks: false } } } });
  return last && last.results;
}

const out = {};
const t0 = Date.now();
for (const strategy of job.strategies) {
  const res = {};
  // Run in small batches; if a batch throws, retry skills one by one so one
  // unparseable condition can't sink the rest.
  const ids = job.skills.filter((id) => skillData[id]);
  for (let i = 0; i < ids.length; i += 8) {
    const batch = ids.slice(i, i + 8);
    let r = null;
    try { r = chart(batch, job, strategy); } catch (e) { r = null; }
    if (!r) {
      for (const id of batch) {
        try { const one = chart([id], job, strategy); if (one) one.forEach((v, k) => (res[k] = v)); } catch (e) { /* skip */ }
      }
    } else r.forEach((v, k) => (res[k] = v));
  }
  out[strategy] = {};
  for (const [id, v] of Object.entries(res)) {
    // [median, mean, min, max, sd]: sd, the race-to-race spread of the skill's gain (its own sample).
    const xs = v.results || [], n = xs.length, sd = n > 1 ? Math.sqrt(xs.reduce((t, x) => t + (x - v.mean) * (x - v.mean), 0) / (n - 1)) : 0;
    out[strategy][id] = [+v.median.toFixed(3), +v.mean.toFixed(3), +v.min.toFixed(3), +v.max.toFixed(3), +sd.toFixed(3)];
  }
}
fs.writeFileSync(outFile, JSON.stringify({ courseId: job.courseId, ms: Date.now() - t0, values: out }));
