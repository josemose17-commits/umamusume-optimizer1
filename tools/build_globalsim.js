// Vendors GlobalSim (Void (daftuyda) and contributors, AGPL-3.0; built from Sevoii/GlobalSim), a full-field race simulator for Global, for the Skill
// optimizer's "for winning" mode. Copies its browser package (built js/dist: ES modules and the
// WebAssembly engine) into vendor/globalsim, plus:
//   skill-data.json   the audited v70 skill table, with the engine's bundled (legacy) entries for
//                     skills it lacks (newer skills and uniques; same format the engine reads);
//   settings.json     the validated v77 switches (examples/v77-settings.json);
//   course_geometry/  captured geometry for our cups' courses only.
//
// Usage: node tools/build_globalsim.js <GlobalSim checkout with js/dist built>
//   (cd <checkout>/js && npm install && node build.mjs)
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const src = process.argv[2];
if (!src || !fs.existsSync(path.join(src, 'js/dist/index.js'))) throw new Error('usage: build_globalsim.js <GlobalSim checkout with js/dist built>');
const ROOT = path.join(__dirname, '..');
const P = require(path.join(ROOT, 'data/presets.js'));
const out = path.join(ROOT, 'vendor/globalsim');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'wasm'), { recursive: true });
fs.mkdirSync(path.join(out, 'course_geometry'), { recursive: true });

const dist = path.join(src, 'js/dist');
fs.readdirSync(dist).filter((f) => f.endsWith('.js') && !/^node(-worker)?\.js$/.test(f)).forEach((f) => fs.copyFileSync(path.join(dist, f), path.join(out, f)));
['globalsim.js', 'globalsim_bg.wasm'].forEach((f) => fs.copyFileSync(path.join(dist, 'wasm', f), path.join(out, 'wasm', f)));
// Strip source-map comments: the maps aren't shipped.
fs.readdirSync(out).filter((f) => f.endsWith('.js')).forEach((f) => {
  const file = path.join(out, f);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/\n\/\/# sourceMappingURL=.*\s*$/, '\n'));
});

const audited = JSON.parse(fs.readFileSync(path.join(src, 'data/v70-skill-data.json'), 'utf8'));
const legacy = JSON.parse(fs.readFileSync(path.join(src, 'data/skill_data.json'), 'utf8'));
const table = {}, added = [];
Object.keys(legacy).forEach((id) => { if (!audited[id]) { table[id] = legacy[id]; added.push(id); } });
Object.assign(table, audited);
fs.writeFileSync(path.join(out, 'skill-data.json'), JSON.stringify({ audited: Object.keys(audited).length, legacy: added.sort(), skills: table }));
fs.copyFileSync(path.join(src, 'examples/v77-settings.json'), path.join(out, 'settings.json'));

const courses = [...new Set(P.list.map((p) => String(p.course.id)))];
const missing = [];
courses.forEach((id) => {
  const f = path.join(src, 'data/course_geometry', id + '.json');
  if (fs.existsSync(f)) fs.copyFileSync(f, path.join(out, 'course_geometry', id + '.json')); else missing.push(id);
});
fs.copyFileSync(path.join(src, 'LICENSE'), path.join(out, 'LICENSE'));
if (fs.existsSync(path.join(src, 'NOTICE'))) fs.copyFileSync(path.join(src, 'NOTICE'), path.join(out, 'NOTICE'));
if (fs.existsSync(path.join(src, 'licenses'))) fs.cpSync(path.join(src, 'licenses'), path.join(out, 'licenses'), { recursive: true });
const rev = execFileSync('git', ['-C', src, 'log', '-1', '--format=%H %ad', '--date=short'], { encoding: 'utf8' }).trim().split(' ');
const version = (fs.readFileSync(path.join(src, 'VERSION'), 'utf8').trim());
fs.writeFileSync(path.join(out, 'README.md'), `# GlobalSim (browser build)

GlobalSim, version ${version}, by Void (daftuyda) and GlobalSim contributors: a full-field race
simulator for Umamusume Global, licensed under the GNU Affero General Public License v3.0 only
(see LICENSE, NOTICE and licenses/). Game data belongs to Cygames.

Project: https://github.com/daftuyda/GlobalSim. Built from
https://github.com/Sevoii/GlobalSim/tree/${rev[0]} (${rev[1]}). These files are its
\`js/dist\` browser package, built unmodified from that revision with \`npm install\` and
\`node build.mjs\` in \`js/\` (wasm-bindgen 0.2.130). Source maps, type declarations and the Node
entry points are left out.

\`skill-data.json\`: the audited table (\`data/v70-skill-data.json\`, ${Object.keys(audited).length} skills) with the
engine's own bundled entries (\`data/skill_data.json\`) for ${added.length} skills it lacks, listed under \`legacy\`.
\`settings.json\`: \`examples/v77-settings.json\`, the validated configuration.
\`course_geometry/\`: \`data/course_geometry\` for the courses of this app's cups${missing.length ? ` (not available: ${missing.join(', ')})` : ''}.

Rebuild with \`node tools/build_globalsim.js <GlobalSim checkout>\`. The Skill optimizer loads it only
for a "for winning" race check.
`);
console.log('vendored GlobalSim', version, rev[0].slice(0, 10), '| skills', Object.keys(table).length, '(' + added.length + ' legacy) | courses', courses.length - missing.length, 'missing', missing.join(','));
