// Adds each skill's race-to-race spread (sd of its length gain) to the cups' skill values, for the
// Skill optimizer's spec scoring (mean + k x spread). Runs alpha123's Umalator chart headless
// (tools/umalator_run.js) on each cup's own simulator: Global's pinned worker, or the JP worker
// with the cup's variant (race-variants.js), with the repo's race data (data/race-skills*.json).
// The cups' median and mean stay as they are; sd becomes the 4th number of each row
// ([id, median x100, mean x100, sd x100]). Cached per cup and style, so it can stop and resume.
//
// Usage: node tools/build_skill_spread.js <cache dir> [--workers=4] [--only=cm23,loh1] [--write]
//   --write puts the cached spreads into data/skillvalues/<cup>.json.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v == null ? true : v]; }));
const cacheDir = path.resolve(args[0] || path.join(ROOT, '.spread-cache'));
const WORKERS = +(flags.workers || 4);
fs.mkdirSync(cacheDir, { recursive: true });

const presets = require(path.join(ROOT, 'data/presets.js'));
const PRESETS = presets.list || presets;
const SV = require(path.join(ROOT, 'data/skillvalues/index.js'));
const only = flags.only ? new Set(String(flags.only).split(',')) : null;
const cups = PRESETS.filter((p) => SV.meta.sims[p.id] && fs.existsSync(path.join(ROOT, 'data/skillvalues', p.id + '.json')) && (!only || only.has(p.id)));

// One simulator directory per kind ("global" or a JP variant), as umalator_run.js expects.
const simDirs = {};
function simDir(kind) {
  if (simDirs[kind]) return simDirs[kind];
  const dir = path.join(cacheDir, 'sim-' + kind);
  fs.mkdirSync(dir, { recursive: true });
  const jp = kind !== 'global';
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, jp ? 'data/race-skills-jp.json' : 'data/race-skills.json'), 'utf8'));
  let worker = fs.readFileSync(path.join(ROOT, jp ? 'vendor/umalator-jp/simulator.worker.js' : 'vendor/umalator/simulator.worker.js'), 'utf8');
  if (jp) {
    const RV = require(path.join(ROOT, 'race-variants.js'));
    worker = RV.patch(worker, JSON.parse(fs.readFileSync(path.join(ROOT, 'data/race-variants', kind + '.json'), 'utf8')));
  }
  fs.writeFileSync(path.join(dir, 'simulator.worker.js'), worker);
  fs.writeFileSync(path.join(dir, 'course_data.json'), JSON.stringify(data.courses));
  fs.writeFileSync(path.join(dir, 'skill_data.json'), JSON.stringify(data.skills));
  fs.writeFileSync(path.join(dir, 'skill_meta.json'), JSON.stringify(data.meta));
  return (simDirs[kind] = dir);
}

const cacheFile = (p, style) => path.join(cacheDir, p.id + '-' + style + '.json');

if (flags.write) { write(); process.exit(0); }

const jobs = [];
cups.forEach((p) => {
  const values = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/skillvalues', p.id + '.json'), 'utf8'));
  Object.keys(values).forEach((style) => {
    if (fs.existsSync(cacheFile(p, style))) return;
    const kind = /^jp-/.test(SV.meta.sims[p.id]) ? SV.meta.sims[p.id] : 'global';
    jobs.push({ p, style, kind, skills: values[style].map((r) => String(r[0])) });
  });
});
console.log(`${jobs.length} jobs on ${WORKERS} workers (cache ${cacheDir})`);
let running = 0, done = 0;
const t0 = Date.now();
function next() {
  if (!jobs.length) { if (!running) console.log('all done in', Math.round((Date.now() - t0) / 60000), 'min'); return; }
  const j = jobs.shift(), out = cacheFile(j.p, j.style), jobFile = out + '.job.json', tmp = out + '.part';
  const dir = simDir(j.kind), have = JSON.parse(fs.readFileSync(path.join(dir, 'skill_data.json'), 'utf8'));
  fs.writeFileSync(jobFile, JSON.stringify({ courseId: j.p.course.id, racedef: j.p.racedef, stats: j.p.stats, strategies: [j.style], skills: j.skills.filter((id) => have[id]) }));
  running++;
  const child = spawn(process.execPath, [path.join(__dirname, 'umalator_run.js'), dir, jobFile, tmp], { stdio: 'inherit' });
  child.on('exit', (code) => {
    running--; done++;
    if (code === 0) {
      const r = JSON.parse(fs.readFileSync(tmp, 'utf8')).values[j.style];
      fs.writeFileSync(out, JSON.stringify(Object.fromEntries(Object.entries(r).map(([id, v]) => [id, v[4]]))));
      fs.unlinkSync(tmp);
    }
    fs.unlinkSync(jobFile);
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${code === 0 ? 'ok ' : 'ERR'} ${j.p.id} ${j.style} (${done} done, ${jobs.length} left)`);
    next();
  });
}
for (let i = 0; i < WORKERS; i++) next();

// The cached spreads into data/skillvalues/<cup>.json (4th number, x100); a skill without one keeps three.
function write() {
  let n = 0;
  cups.forEach((p) => {
    const f = path.join(ROOT, 'data/skillvalues', p.id + '.json'), values = JSON.parse(fs.readFileSync(f, 'utf8'));
    let changed = false;
    Object.keys(values).forEach((style) => {
      if (!fs.existsSync(cacheFile(p, style))) return;
      const sd = JSON.parse(fs.readFileSync(cacheFile(p, style), 'utf8'));
      values[style] = values[style].map((r) => (sd[r[0]] != null ? [r[0], r[1], r[2], Math.round(sd[r[0]] * 100)] : r.slice(0, 3)));
      changed = true;
    });
    if (changed) { fs.writeFileSync(f, JSON.stringify(values)); n++; }
  });
  console.log('wrote spreads into', n, 'cups');
}
