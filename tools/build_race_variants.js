// In-browser race comparisons for cups that run on a JP-dated simulator (cm22 on, League of
// Heroes). tools/build_skill_versions.js writes one full simulator per variant (~1 MB each); the
// page instead ships today's JP worker once, unmodified (vendor/umalator-jp), plus each variant's
// differences, which race-worker.js applies when it loads the worker for that cup:
//   - over: the skills whose entry differs from the JP worker's (as the variant has them);
//   - syoubu: false takes stamina showdown out (cm22 to cm26);
//   - syoubuLong: JP's Oct 2024 long-race showdown factors (2401-2600 m 1.5, beyond 1.8).
// It also writes data/race-skills-jp.json: the JP worker's skill data, meta and course data for
// the skills the app values and the cups' courses (the Global catalog lacks JP-only skills and
// tracks such as Del Mar).
//
// Usage: node tools/build_race_variants.js <uma-tools clone> <variants dir>
//   <variants dir> is tools/build_skill_versions.js's output for the same uma-tools revision.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const [toolsDir, variantsDir] = process.argv.slice(2);
if (!toolsDir || !variantsDir) throw new Error('usage: build_race_variants.js <uma-tools clone> <variants dir>');
const ROOT = path.join(__dirname, '..');
const P = require(path.join(ROOT, 'data/presets.js'));
const SV = require(path.join(ROOT, 'data/skillvalues/index.js'));
const PURCHASE = require(path.join(ROOT, 'data/skill-purchases.js')).skills;
const RV = require(path.join(ROOT, 'race-variants.js'));

const git = (args) => execFileSync('git', ['-C', toolsDir].concat(args), { encoding: 'utf8', maxBuffer: 1 << 30 });
const rev = git(['log', '-1', '--format=%H', '--', 'umalator/simulator.worker.js']).trim();
const built = git(['log', '-1', '--format=%ad', '--date=short', '--', 'umalator/simulator.worker.js']).trim();
const src = git(['show', rev + ':umalator/simulator.worker.js']);
const located = RV.locate(src);
if (!located) throw new Error('JP worker: skill data, showdown calls or distance factor not found');
const cur = vm.runInNewContext('(' + src.slice(located.skills[0], located.skills[1]) + ')');

const vjson = JSON.parse(fs.readFileSync(path.join(variantsDir, 'variants.json'), 'utf8'));
const outDir = path.join(ROOT, 'data/race-variants');
fs.mkdirSync(outDir, { recursive: true });
fs.readdirSync(outDir).forEach((f) => fs.unlinkSync(path.join(outDir, f)));
const index = { jpBuild: built, worker: rev, presets: vjson.presets, variants: {} };
let courses, meta;
for (const [name, v] of Object.entries(vjson.variants)) {
  const dir = path.join(variantsDir, name);
  const skills = JSON.parse(fs.readFileSync(path.join(dir, 'skill_data.json'), 'utf8'));
  courses = courses || JSON.parse(fs.readFileSync(path.join(dir, 'course_data.json'), 'utf8'));
  meta = meta || JSON.parse(fs.readFileSync(path.join(dir, 'skill_meta.json'), 'utf8'));
  const over = {};
  Object.keys(skills).forEach((id) => { if (JSON.stringify(skills[id]) !== JSON.stringify(cur[id])) over[id] = skills[id]; });
  Object.keys(cur).forEach((id) => { if (!(id in skills)) throw new Error(name + ': variant drops skill ' + id); });
  const file = { name, syoubu: !!v.syoubu, syoubuLong: !!v.syoubuLong, over };
  // The patch race-worker.js applies must give exactly the variant's simulator.
  // Code outside the skill data identical; skill data equal to the JP worker's with `over`.
  const want = fs.readFileSync(path.join(dir, 'simulator.worker.js'), 'utf8');
  const strip = (s) => { const l = RV.locate(s, true); return s.slice(0, l.skills[0]) + s.slice(l.skills[1]); };
  if (strip(RV.patchCode(src, file)) !== strip(want)) throw new Error(name + ': patched worker code differs from the variant');
  const wl = RV.locate(want, true), wantSkills = vm.runInNewContext('(' + want.slice(wl.skills[0], wl.skills[1]) + ')');
  if (JSON.stringify(wantSkills) !== JSON.stringify(Object.assign({}, cur, over))) throw new Error(name + ': skill data differs');
  RV.patch(src, file);
  fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify(file));
  index.variants[name] = { syoubu: file.syoubu, syoubuLong: file.syoubuLong, over: Object.keys(over).length, cups: v.cups };
  console.log(name, 'showdown', file.syoubu ? (file.syoubuLong ? 'on (long factors)' : 'on') : 'off', Object.keys(over).length, 'skills differ');
}
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 1));

// Catalog: every skill the app values or can sell (with each tier's prerequisites).
const want = new Set();
const add = (id) => { id = String(id); if (want.has(id) || !cur[id]) return; want.add(id); const m = PURCHASE[id]; if (m && m[2] != null) add(m[2]); };
Object.keys(SV.skills).forEach(add);
Object.keys(PURCHASE).forEach(add);
// Trainees' own uniques (equipped automatically) and everything the Global catalog has.
Object.keys(cur).filter((id) => /^1\d{5}$/.test(id)).forEach(add);
Object.keys(require(path.join(ROOT, 'data/race-skills.json')).skills).forEach(add);
const cups = P.list.filter((p) => vjson.presets[p.id]);
const catalog = { worker: rev, courses: {}, skills: {}, meta: {} };
cups.forEach((p) => { if (courses[p.course.id]) catalog.courses[p.course.id] = courses[p.course.id]; });
[...want].sort().forEach((id) => { catalog.skills[id] = cur[id]; if (meta[id]) catalog.meta[id] = meta[id]; });
fs.writeFileSync(path.join(ROOT, 'data/race-skills-jp.json'), JSON.stringify(catalog));

// The unmodified worker, with its revision and blob hash.
const vdir = path.join(ROOT, 'vendor/umalator-jp');
fs.mkdirSync(vdir, { recursive: true });
fs.writeFileSync(path.join(vdir, 'simulator.worker.js'), src);
fs.copyFileSync(path.join(ROOT, 'vendor/umalator/LICENSE'), path.join(vdir, 'LICENSE'));
const blob = crypto.createHash('sha1').update('blob ' + Buffer.byteLength(src) + '\0').update(src).digest('hex');
fs.writeFileSync(path.join(vdir, 'README.md'), `# Umalator JP worker

Unmodified JP worker by alpha123, licensed under GNU GPL v3 (see LICENSE).

Worker blob: ${blob}.
Source and build instructions: https://github.com/alpha123/uma-tools/tree/${rev} (built ${built}).
The source uses the uma-skill-tools submodule; initialize it recursively as recorded by that revision.
Game data belongs to Cygames. The worker is loaded only when a race comparison for a JP-dated cup
(Champions Meeting 22 on, League of Heroes) is requested.

\`race-worker.js\` modifies it in the browser as \`race-variants.js\` describes: it overrides the
skills listed in \`data/race-variants/<variant>.json\`, and takes out stamina showdown or sets
JP's later long-race showdown factors for that variant. Rebuild with \`tools/build_race_variants.js\`.
`);
console.log('catalog', Object.keys(catalog.skills).length, 'skills', Object.keys(catalog.courses).length, 'courses; worker', rev.slice(0, 10), built);
