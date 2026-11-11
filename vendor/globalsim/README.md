# GlobalSim (browser build)

GlobalSim, version v77, by Void (daftuyda) and GlobalSim contributors: a full-field race
simulator for Umamusume Global, licensed under the GNU Affero General Public License v3.0 only
(see LICENSE, NOTICE and licenses/). Game data belongs to Cygames.

Project: https://github.com/daftuyda/GlobalSim. Built from
https://github.com/Sevoii/GlobalSim/tree/58da7bc4693d9aa8f6340e348cba1c5b5fb5a856 (2026-11-08). These files are its
`js/dist` browser package, built unmodified from that revision with `npm install` and
`node build.mjs` in `js/` (wasm-bindgen 0.2.130). Source maps, type declarations and the Node
entry points are left out.

`skill-data.json`: the audited table (`data/v70-skill-data.json`, 730 skills) with the
engine's own bundled entries (`data/skill_data.json`) for 1253 skills it lacks, listed under `legacy`.
`settings.json`: `examples/v77-settings.json`, the validated configuration.
`course_geometry/`: `data/course_geometry` for the courses of this app's cups (not available: 11703, 11709).

Rebuild with `node tools/build_globalsim.js <GlobalSim checkout>`. The Skill optimizer loads it only
for a "for winning" race check.
