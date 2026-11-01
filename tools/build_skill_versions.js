// Builds, for each JP-only cup (cm22 on, League of Heroes), an Umalator simulator that runs the
// skills as Global should have them on that cup's date. Global runs JP's calendar in order, so a
// cup on Global gets JP's game as it was on the cup's JP date: the skill effects from then (later
// balance patches not yet in), and stamina showdown only from JP's 2.5th anniversary (2023-08-24).
// Global is never put behind what it already has: a skill whose current Global version is newer on
// JP's calendar keeps it, and leg conservation (Global since 2026-07) stays on.
//
// Sources: alpha123's uma-skill-tools (data/skill_data.json, every commit since 2022-07) and
// uma-tools (umalator/simulator.worker.js, every JP build since 2025-08, which also carries the
// engine). Track data is JP's current (it matches Global's for every track Global has, and holds
// the newer Hanshin 2400 and the Longchamp and Del Mar tracks Global doesn't have yet).
//
// Usage: node tools/build_skill_versions.js <uma-tools clone> <uma-skill-tools clone> <out dir>
//   Both clones need their full history (git clone --filter=blob:none is enough). Writes
//   <out dir>/<variant>/ (simulator.worker.js + data files for tools/umalator_run.js) and
//   <out dir>/variants.json: { presets: { cm22: variant, ... }, variants: { variant: {...} } }.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const [toolsDir, sktDir, outDir] = process.argv.slice(2);
const ROOT = path.join(__dirname, '..');
const P = require(path.join(ROOT, 'data/presets.js'));
const POSITIONS = require(path.join(ROOT, 'data/skill-positions.js')); // from Global's skill data
const { classify } = require('./build_skill_positions.js');

// Data commit / build date -> the JP patch it carries (the commit lands after the patch).
// 2023-04-26: 2nd anniversary (Beeline Burst 2.4->3.0 s ...); 2023-10-27: 2.5th anniversary
// (last-straight conditions, Shooting for Victory! 3.0 s); 2024-03-06: 3rd anniversary (Breakin'
// Ahead order >= 50%); 2026-08-13: Silence Suzuka's unique, 2026-07-30 (official X post);
// 2026-09-13: 5.5th anniversary (order conditions 50% -> 40%).
const PATCH = { '2023-04-26': '2023-02-24', '2023-10-27': '2023-08-24', '2024-03-06': '2024-02-24', '2026-08-13': '2026-07-30', '2026-09-13': '2026-08-24' };
// Data changes that are the extractor's, not the game's: scenario skill scaling (2023-10/11),
// Seirios split and merged back (2024-12, 2025-12), durationScaling/scaling fields (2026-03-12).
const FORMAT_DATES = new Set(['2023-10-31', '2023-11-24', '2024-12-24', '2025-12-03', '2026-03-12']);
const STAMINA_SYOUBU = '2023-08-24';
// JP's 2024-10-29 update made stamina showdown stronger in long races (2401 m and up; 2200-2400 m
// unchanged): its distance factor went from 1.2 to 1.5 up to 2600 m and from 1.5 to 1.8 beyond,
// as measured by players (note.com/shimahokke_uma, note.com/200000is). The Umalator has the original.
const SYOUBU_LONG = '2024-10-29';
const JPW_FROM = '2025-08-23'; // first complete JP worker build; uma-skill-tools data before it
const patchDate = (d) => PATCH[d] || d;

const git = (dir, args) => execFileSync('git', ['-C', dir].concat(args), { encoding: 'utf8', maxBuffer: 1 << 30 });
function objectAt(s, start) {
  let depth = 0, q = null;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') { depth--; if (depth === 0) return [start, i + 1]; }
  }
  throw new Error('unbalanced object');
}
// The skill data, skill meta and course data objects a worker carries, with their text ranges.
function workerData(src) {
  const find = (marker) => {
    const i = src.indexOf(marker);
    if (i < 0) return null;
    const range = objectAt(src, src.lastIndexOf('{', i + 1));
    return { range, value: vm.runInNewContext('(' + src.slice(range[0], range[1]) + ')') };
  };
  return { skills: find('{"100011":{alternatives:'), meta: find('{"100011":{baseCost:') };
}

// ---- JP skill history ----
const sem = (s) => JSON.stringify((s.alternatives || []).filter((a) => a.condition != null).map((a) => ({
  c: a.condition, p: a.precondition || '', d: a.baseDuration,
  e: a.effects.map((e) => [e.type === 22 ? 27 : e.type, e.modifier]),
})));
const snaps = [];
git(sktDir, ['log', '--format=%h %ad', '--date=short', '--', 'data/skill_data.json']).trim().split('\n').forEach((l) => {
  const [h, date] = l.split(' ');
  if (date < JPW_FROM) snaps.push({ date, worker: false, load: () => JSON.parse(git(sktDir, ['show', h + ':data/skill_data.json'])) });
});
git(toolsDir, ['log', '--format=%h %ad', '--date=short', '--', 'umalator/simulator.worker.js']).trim().split('\n').forEach((l) => {
  const [h, date] = l.split(' ');
  if (date >= JPW_FROM) snaps.push({ date, worker: true, load: () => workerData(git(toolsDir, ['show', h + ':umalator/simulator.worker.js'])).skills.value });
});
snaps.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
const hist = {};
const firstSeen = {}; // first JP data snapshot that has the skill (dates scenario-only skills)
for (const sn of snaps) {
  const data = sn.load();
  if (sn.worker && Object.keys(data).length < 1500) continue; // a JP build made with Global data by mistake
  for (const [id, entry] of Object.entries(data)) {
    if (!entry.alternatives || !entry.alternatives.length) continue;
    if (!firstSeen[id]) firstSeen[id] = sn.date;
    const s = sem(entry);
    const h = hist[id] || (hist[id] = []);
    const last = h[h.length - 1];
    if (last && last.s === s) { last.entry = entry; continue; }
    if (last && FORMAT_DATES.has(sn.date)) { last.s = s; last.forms.push(s); last.entry = entry; continue; }
    h.push({ date: sn.date, s, forms: [s], entry });
  }
}

// ---- current JP and Global simulators ----
const jpSrc = git(toolsDir, ['show', 'HEAD:umalator/simulator.worker.js']);
const jp = workerData(jpSrc);
const glob = workerData(git(toolsDir, ['show', 'HEAD:umalator-global/simulator.worker.js'])).skills.value;
const cur = jp.skills.value, meta = jp.meta.value;
const courses = JSON.parse(git(sktDir, ['show', 'HEAD:data/course_data.json']));
const inPool = (id) => (cur[id].rarity < 3 || id[0] === '4' || (id[0] === '9' && id.length > 6)) &&
  !(meta[id] && String(meta[id].iconId).endsWith('4')) && id !== '1400011' && id !== '1400021';
const pool = Object.keys(cur).filter(inPool);

// An old-format entry in today's format: durationScaling/scaling/target taken from today's entry
// when it has the same shape, else the plain values.
function convert(old, shape) {
  const same = shape.alternatives.length === old.alternatives.length &&
    shape.alternatives.every((a, i) => a.effects.length === old.alternatives[i].effects.length);
  return Object.assign({}, shape, {
    alternatives: old.alternatives.filter((a) => a.condition != null).map((a, i) => ({
      baseDuration: a.baseDuration, condition: a.condition, precondition: a.precondition || '',
      durationScaling: a.durationScaling != null ? a.durationScaling : same ? shape.alternatives[i].durationScaling || 1 : 1,
      effects: a.effects.map((e, k) => ({
        modifier: e.modifier, target: e.target != null ? e.target : 1, type: e.type,
        scaling: e.scaling != null ? e.scaling : same ? shape.alternatives[i].effects[k].scaling || 1 : 1,
      })),
    })),
  });
}
// Where Global's current version sits in JP's history: a cup never gets an older one.
const floor = {};
pool.forEach((id) => {
  if (!glob[id] || !hist[id]) return;
  const gs = sem(glob[id]);
  hist[id].forEach((v, i) => { if (v.forms.includes(gs)) floor[id] = i; });
});

const cups = P.list.filter((p) => p.no >= 22 || p.kind === 'loh');
const variants = {}, presets = {};
for (const p of cups) {
  const d = p.jp.start;
  const over = {};
  const changed = {}; // skills out on Global now that this cup runs at another version: JP patch date
  for (const id of pool) {
    const h = hist[id];
    if (!h) continue;
    let i = 0;
    h.forEach((v, k) => { if (patchDate(v.date) <= d) i = k; });
    if (floor[id] != null && floor[id] > i) i = floor[id];
    const v = h[i];
    const fromGlobal = glob[id] && v.forms.includes(sem(glob[id]));
    if (glob[id] && !fromGlobal) changed[id] = patchDate(v.date);
    if (i === h.length - 1) continue;
    over[id] = { entry: fromGlobal ? glob[id] : convert(v.entry, cur[id]), src: fromGlobal ? 'global' : 'jp', since: patchDate(v.date) };
  }
  const syoubu = d >= STAMINA_SYOUBU;
  const syoubuLong = syoubu && d >= SYOUBU_LONG && p.course.distance >= 2401;
  const key = crypto.createHash('sha1').update(JSON.stringify(Object.assign({ syoubu, over: Object.keys(over).sort().map((id) => [id, over[id].entry]) }, syoubuLong ? { syoubuLong } : {}))).digest('hex').slice(0, 10);
  const name = 'jp' + (syoubu ? '' : '-nosyoubu') + (syoubuLong ? '-longsyoubu' : '') + '-' + key;
  if (!variants[name]) variants[name] = { syoubu, syoubuLong, cups: [], changed, over: Object.fromEntries(Object.entries(over).map(([id, o]) => [id, { src: o.src, since: o.since }])), entries: over };
  variants[name].cups.push(p.id);
  presets[p.id] = name;
}

// One simulator per variant: today's JP worker with the skill data swapped and stamina showdown
// taken out where it isn't in yet.
fs.mkdirSync(outDir, { recursive: true });
for (const [name, v] of Object.entries(variants)) {
  const skills = Object.assign({}, cur);
  Object.entries(v.entries).forEach(([id, o]) => { skills[id] = o.entry; });
  let src = jpSrc.slice(0, jp.skills.range[0]) + JSON.stringify(skills) + jpSrc.slice(jp.skills.range[1]);
  if (!v.syoubu) {
    const before = src.length;
    src = src.replace(/(\w)\.withStaminaSyoubu\(\),(\w)\.withStaminaSyoubu\(\),/g, '').replace(/(\w)\.withStaminaSyoubu\(\),/g, '');
    if (src.length === before) throw new Error('could not take out stamina showdown');
  }
  if (v.syoubuLong) {
    const re = /(\w)<2401\?1:\1<2601\?1\.2:1\.5\}/;
    if (!re.test(src)) throw new Error('could not find stamina showdown distance factor');
    src = src.replace(re, '$1<2401?1:$1<2601?1.5:1.8}');
  }
  // Which half of the pack each skill needs, from this simulator's versions (JP-only skills and
  // conditions JP changed included): kept as changes to data/skill-positions.js.
  const pos = classify(skills), charted = new Set(pool);
  v.positions = {};
  ['back', 'front'].forEach((k) => {
    const base = new Set(POSITIONS[k].map(String)), mine = new Set(pos[k].map(String));
    v.positions[k] = { add: [...mine].filter((id) => !base.has(id) && charted.has(id)), del: [...base].filter((id) => !mine.has(id) && charted.has(id)) };
  });
  const dir = path.join(outDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'simulator.worker.js'), src);
  fs.writeFileSync(path.join(dir, 'skill_data.json'), JSON.stringify(skills));
  fs.writeFileSync(path.join(dir, 'skill_meta.json'), JSON.stringify(meta));
  fs.writeFileSync(path.join(dir, 'course_data.json'), JSON.stringify(courses));
  delete v.entries;
  console.log(name, 'cups', v.cups.join(','), 'stamina showdown', v.syoubu ? 'on' : 'off', Object.keys(v.over).length, 'skills not at their current JP version,', Object.keys(v.changed).length, 'Global skills not at their current Global version');
}
const jpBuild = git(toolsDir, ['log', '-1', '--format=%ad', '--date=short', '--', 'umalator/simulator.worker.js']).trim();
fs.writeFileSync(path.join(outDir, 'variants.json'), JSON.stringify({ built: new Date().toISOString().slice(0, 10), jpBuild, presets, variants,
  firstSeen: Object.fromEntries(pool.map((id) => [id, firstSeen[id]])) }, null, 1));
