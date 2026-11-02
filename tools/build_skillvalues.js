// Computes every skill's median/mean length gain (L) for each CM/LoH preset and running style,
// by running alpha123's Umalator simulator (tools/umalator_run.js) in parallel worker processes.
// Results are cached per job, so the run can be stopped and resumed.
//
// Usage: node tools/build_skillvalues.js <presets.json> <umalator-global dir> <umalator jp dir>
//        <cache dir> [--workers=4] [--only=cm20,cm21] [--variants=<dir from build_skill_versions.js>]
//   --variants: cups listed there run on their own simulator (JP's game as of that cup's JP date).
//   --metadata-only with --compose refreshes names and release dates from existing charts,
//   including count-dependent skills inserted by build_count_skills.js; no chart is rewritten.
//   Then write data/skillvalues.js from whatever is cached so far (cups without a cache keep the
//   values already in data/skillvalues):
//        node tools/build_skillvalues.js <same args> --compose=data/skillvalues --gametora=<dir>
//   <dir> holds GameTora's skills.json, support-cards.json and character-cards.json; with
//   --variants, scenarios.json too (to date skills that only come from a scenario).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [presetsFile, dirGlobal, dirJp, cacheDir] = args;
const WORKERS = +(flags.workers || 4);
const STRATEGIES = ['Nige', 'Senkou', 'Sasi', 'Oikomi'];
const DEBUFF_FREE = (meta, id) => !(meta[id] && String(meta[id].iconId).endsWith('4'));

fs.mkdirSync(cacheDir, { recursive: true });
const presets = JSON.parse(fs.readFileSync(presetsFile, 'utf8'));
const today = new Date().toISOString().slice(0, 10);

function skillList(dir) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, 'skill_data.json'), 'utf8'));
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'skill_meta.json'), 'utf8'));
  // Same pool as the Umalator's "all skills" chart: normal and gold skills, inherited uniques,
  // and no debuffs.
  return Object.keys(data).filter((id) =>
    (data[id].rarity < 3 || id[0] === '4' || (id[0] === '9' && id.length > 6)) &&
    DEBUFF_FREE(meta, id) && id !== '1400011' && id !== '1400021');
}
const SKILLS = { global: skillList(dirGlobal), jp: skillList(dirJp) };
const DIRS = { global: dirGlobal, jp: dirJp };
// Per-cup simulators (tools/build_skill_versions.js): the cup's sim becomes its variant.
const VARIANTS = flags.variants ? JSON.parse(fs.readFileSync(path.join(flags.variants, 'variants.json'), 'utf8')) : null;
if (VARIANTS) {
  for (const p of presets) {
    const v = VARIANTS.presets[p.id];
    if (!v) continue;
    p.sim = v;
    if (!DIRS[v]) { DIRS[v] = path.join(flags.variants, v); SKILLS[v] = skillList(DIRS[v]); }
  }
}

// Priority: Global cups from this week on, then League of Heroes, then the rest newest first.
const rank = (p) => (p.global.start >= addDays(today, -7) ? 0 : p.kind === 'loh' ? 1 : 2);
function addDays(s, n) { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
if (flags.compose) { compose(); process.exit(0); }

function specKey(spec) { return crypto.createHash('sha1').update(JSON.stringify(spec)).digest('hex').slice(0, 12); }

// Packs cached results for the browser: data/skillvalues/index.js holds skill names and costs
// and which presets are ready; data/skillvalues/<preset>.json holds, per running style, a list
// of [skill id, median L x100, mean L x100], loaded when that preset is picked.
function compose() {
  const outDir = flags.compose;
  const metadataOnly = Object.prototype.hasOwnProperty.call(flags, 'metadata-only');
  fs.mkdirSync(outDir, { recursive: true });
  const G = (f) => JSON.parse(fs.readFileSync(path.join(flags.gametora, f), 'utf8'));
  const gt = G('skills.json');
  const info = new Map(gt.map((s) => [String(s.id), s]));
  // Fallback names and costs for skills GameTora lists under other IDs (inherited uniques).
  const names = {};
  const metas = {};
  [dirGlobal, dirJp].concat(Object.keys(DIRS).filter((k) => k !== 'global' && k !== 'jp').map((k) => DIRS[k])).forEach((dir) => {
    const f = path.join(dir, 'skillnames.json');
    if (fs.existsSync(f)) Object.entries(JSON.parse(fs.readFileSync(f, 'utf8'))).forEach(([id, v]) => { if (!names[id]) names[id] = v[v.length - 1] || v[0]; });
    Object.assign(metas, JSON.parse(fs.readFileSync(path.join(dir, 'skill_meta.json'), 'utf8')), metas);
  });
  // Values already in data/skillvalues: cups this build didn't simulate keep theirs.
  const oldIndex = path.join(path.resolve(outDir), 'index.js');
  const old = fs.existsSync(oldIndex) ? require(oldIndex) : { ready: [], skills: {}, meta: {} };
  const ready = [];
  const used = new Set();
  const sims = {};
  let missing = 0, kept = 0;
  for (const p of presets) {
    const file = path.join(outDir, p.id + '.json');
    if (metadataOnly) {
      if (old.ready.indexOf(p.id) !== -1 && fs.existsSync(file)) {
        Object.values(JSON.parse(fs.readFileSync(file, 'utf8'))).forEach((rows) => rows.forEach(([id]) => used.add(String(id))));
        ready.push(p.id);
        sims[p.id] = (old.meta.sims && old.meta.sims[p.id]) || (p.sim === 'global' ? 'global' : 'jp');
        kept++;
      }
      continue;
    }
    const per = {};
    for (const strategy of STRATEGIES) {
      const f = path.join(cacheDir, specKey({ sim: p.sim, courseId: p.course.id, racedef: p.racedef, stats: p.stats, strategy }) + '.json');
      if (!fs.existsSync(f)) { missing++; continue; }
      const r = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (r.placeholder) { missing++; continue; } // a job still running elsewhere
      per[strategy] = Object.entries(r.values)
        .filter(([, v]) => v[0] >= 0.05 || v[1] >= 0.05)
        .map(([id, v]) => { used.add(id); return [+id, Math.round(v[0] * 100), Math.round(v[1] * 100)]; })
        .sort((a, b) => b[1] - a[1]);
    }
    if (Object.keys(per).length === STRATEGIES.length) {
      fs.writeFileSync(file, JSON.stringify(per));
      ready.push(p.id);
      sims[p.id] = VARIANTS && VARIANTS.presets[p.id] ? p.sim : p.sim === 'global' ? 'global' : 'jp';
    } else if (old.ready.indexOf(p.id) !== -1 && fs.existsSync(file)) {
      Object.values(JSON.parse(fs.readFileSync(file, 'utf8'))).forEach((rows) => rows.forEach(([id]) => used.add(String(id))));
      ready.push(p.id);
      sims[p.id] = (old.meta.sims && old.meta.sims[p.id]) || (p.sim === 'global' ? 'global' : 'jp');
      kept++;
    }
  }
  // The JP date each skill first came out: its earliest card or trainee (inherited uniques: the
  // trainee), a ◎/× its ○'s, scenario skills their scenario's, else the first JP data that had it.
  const cardDate = new Map(G('support-cards.json').map((c) => [c.support_id || c.id, c.release]));
  const charDate = new Map(G('character-cards.json').map((c) => [c.card_id, c.release]));
  const scenDate = VARIANTS ? G('scenarios.json').map((s) => new Date(s.start_ja * 1000).toISOString().slice(0, 10)).sort() : [];
  const flat = (x) => (Array.isArray(x) ? x.flat(Infinity) : []);
  function ownDate(id) {
    const s = info.get(id);
    if (!s) return null;
    const ds = flat(s.sup_hint).concat(flat(s.sup_e)).map((c) => cardDate.get(c))
      .concat(flat(s.char).concat(flat(s.char_e)).map((c) => charDate.get(c))).filter(Boolean).sort();
    return ds[0] || null;
  }
  function jpDate(id) {
    if (id[0] === '9' && id.length === 6) { const d = ownDate('1' + id.slice(1)); if (d) return d; }
    let d = ownDate(id);
    if (!d) {
      const sib = gt.filter((s) => String(s.id).slice(0, -1) === id.slice(0, -1)).map((s) => ownDate(String(s.id))).filter(Boolean).sort();
      d = sib[0] || null;
    }
    const s = info.get(id);
    if (!d && s && s.sce_e) d = flat(s.sce_e).map((n) => { const x = G('scenarios.json').find((y) => y.id === n); return x ? new Date(x.start_ja * 1000).toISOString().slice(0, 10) : null; }).filter(Boolean).sort()[0] || null;
    // A skill added to an older card or trainee later (awakening levels JP added in 2026, for one)
    // came out then, not with it: never before the JP data first had it, when that's more than
    // the longest gap between data snapshots (155 days) after its source.
    const seen = VARIANTS && VARIANTS.firstSeen[id];
    if (d && seen && seen > '2022-08-25' && (Date.parse(seen) - Date.parse(d)) / 864e5 > 180) d = seen;
    if (!d && VARIANTS && VARIANTS.firstSeen[id]) {
      // Seen first in a data snapshot: the scenario out on JP by then that brought it.
      const seen = VARIANTS.firstSeen[id];
      d = seen <= '2022-07-11' ? '2021-02-24' : scenDate.filter((x) => x <= seen).pop() || seen;
    }
    return d;
  }
  const skills = {};
  used.forEach((id) => {
    const m = metas[id] || {};
    const date = jpDate(id);
    // Inherited uniques (9xxxxx) share their name and Global release with the unique (1xxxxx).
    const base = id[0] === '9' ? info.get('1' + id.slice(1)) : null;
    if (base) {
      skills[id] = [(base.name_en || base.enname || base.jpname) + ' (inherited)', m.baseCost || 200, 9, base.name_en ? 1 : 0, date];
      return;
    }
    const s = info.get(id);
    // [name, skill point cost, rarity (1 white, 2 gold, 9 inherited unique), on Global (1/0),
    //  first JP release (YYYY-MM-DD, or null when unknown)]
    const inherited = id[0] === '9';
    skills[id] = s
      ? [s.name_en || s.enname || s.jpname, s.cost || m.baseCost || 0, inherited ? 9 : s.rarity || 1, s.name_en ? 1 : 0, date]
      : (old.skills[id] ? old.skills[id].slice(0, 4).concat([date]) : [names[id] || '#' + id, m.baseCost || 0, inherited ? 9 : 1, 0, date]);
  });
  const meta = {
    built: today,
    source: "alpha123's Umalator (alpha123.github.io/uma-tools), skill chart mode: up to 200 simulated races per skill, position keep and spot struggle on",
    strategies: STRATEGIES,
    // Which simulator each cup ran on: "global" (Global's game now), "jp" (JP's current game), or a
    // JP-only cup's variant (tools/build_skill_versions.js): JP's game as of that cup's JP date.
    sims,
  };
  if (metadataOnly && old.meta.countSkills) meta.countSkills = old.meta.countSkills;
  if (VARIANTS) {
    meta.jpBuild = VARIANTS.jpBuild;
    // Per variant: stamina showdown on or off, and the skills out on Global now that it runs at
    // another version (skill id -> the JP patch that version came with).
    // and which half of the pack its skills need where that differs from data/skill-positions.js.
    meta.variants = Object.fromEntries(Object.entries(VARIANTS.variants).map(([k, v]) => [k, { syoubu: v.syoubu, syoubuLong: !!v.syoubuLong, changed: v.changed, positions: v.positions }]));
  } else if (old.meta.variants) { meta.variants = old.meta.variants; meta.jpBuild = old.meta.jpBuild; }
  const body = JSON.stringify({ meta, ready, skills });
  fs.writeFileSync(path.join(outDir, 'index.js'), "// Generated by tools/build_skillvalues.js from alpha123's Umalator. Do not edit.\n" +
    '(function (root) {\n  const SKILL_VALUES = ' + body + ';\n' +
    '  if (typeof module !== "undefined" && module.exports) module.exports = SKILL_VALUES;\n  else root.UmaSkillValues = SKILL_VALUES;\n' +
    '})(typeof window !== "undefined" ? window : globalThis);\n');
  console.log('wrote', outDir, body.length, 'bytes index;', ready.length, 'presets ready (' + kept + ' kept from before),', Object.keys(skills).length, 'skills,', missing, 'jobs not computed yet');
}

let list = presets.slice().sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? (a.global.start < b.global.start ? -1 : 1) : (a.global.start > b.global.start ? -1 : 1)));
if (flags.only) list = list.filter((p) => flags.only.split(',').includes(p.id));

const jobs = [];
const seen = new Set();
for (const p of list) {
  for (const strategy of STRATEGIES) {
    const spec = { sim: p.sim, courseId: p.course.id, racedef: p.racedef, stats: p.stats, strategy };
    const key = specKey(spec);
    if (seen.has(key)) continue;
    seen.add(key);
    const out = path.join(cacheDir, key + '.json');
    if (fs.existsSync(out)) continue;
    jobs.push({ p, spec, key, out });
  }
}
console.log(`${jobs.length} jobs to run (${seen.size - jobs.length} cached) on ${WORKERS} workers`);

let running = 0;
let doneCount = 0;
const t0 = Date.now();
function next() {
  if (!jobs.length) { if (!running) console.log('all done in', Math.round((Date.now() - t0) / 60000), 'min'); return; }
  const j = jobs.shift();
  const jobFile = j.out.replace(/\.json$/, '.job.json');
  fs.writeFileSync(jobFile, JSON.stringify({
    courseId: j.spec.courseId, racedef: j.spec.racedef, stats: j.spec.stats,
    strategies: [j.spec.strategy], skills: SKILLS[j.spec.sim],
  }));
  running++;
  const tmp = j.out + '.part';
  const child = spawn(process.execPath, [path.join(__dirname, 'umalator_run.js'), DIRS[j.spec.sim], jobFile, tmp], { stdio: 'inherit' });
  child.on('exit', (code) => {
    running--;
    doneCount++;
    if (code === 0) {
      const r = JSON.parse(fs.readFileSync(tmp, 'utf8'));
      fs.writeFileSync(j.out, JSON.stringify({ spec: j.spec, ms: r.ms, values: r.values[j.spec.strategy] }));
      fs.unlinkSync(tmp);
    }
    fs.unlinkSync(jobFile);
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${code === 0 ? 'ok ' : 'ERR'} ${j.p.id} ${j.spec.strategy} (${doneCount} done, ${jobs.length} left)`);
    next();
  });
}
for (let i = 0; i < WORKERS; i++) next();
