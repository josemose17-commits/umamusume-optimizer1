const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..');
const F = require('../field-race.js'), P = require('../data/presets.js'), SO = require('../skill-opt.js');
const opt = (id, cost = 100) => ({ id, family: id, cost, required: [] });
const her = { style: 'Senkou', stats: { speed: 1500, stamina: 900, power: 1200, guts: 700, wisdom: 1100 }, apt: ['A', 'A', 'A'], mood: 0, unique: { id: '100011', level: 3 } };

test('requests: the cup, gate draw, her unique, and only the skills in play', () => {
  const p = P.list.find((x) => x.id === 'cm22');
  const table = { 100011: { a: 1 }, 200331: { b: 1 }, 999999: { c: 1 } };
  const field = F.rivals(her, { mix: { Nige: 1, Senkou: 0, Sasi: 1, Oikomi: 0 }, strength: 'stronger', skillsFor: () => ['200331'] });
  assert.equal(field.length, 2); assert.equal(field[0].stats.speed, 1650);
  const req = F.request({ preset: p, table, settings: { x: 1 } }, [F.runner(Object.assign({}, her, { skills: ['100011', '200331'] }))].concat(field.map(F.runner)), [2, 0, 1]);
  assert.deepEqual(Object.keys(req.skillData).sort(), ['100011', '200331']);
  assert.deepEqual(req.horses.map((h) => h.gateIndex), [2, 0, 1]);
  assert.deepEqual(req.horses[0].skills[0], { skillId: '100011', level: 3, isUnique: true });
  assert.equal(req.horses[0].skills.filter((x) => x === '100011').length, 0, 'the unique is listed once');
  assert.equal(req.courseId, p.course.id); assert.equal(req.groundCondition, 'Soft'); assert.equal(req.weather, 'Snowy'); assert.equal(req.x, 1);
  assert.equal(req.experimentalLaterStaminaMechanics, false);
  const draws = F.layouts(9, 12);
  assert.equal(draws.length, 12);
  draws.forEach((d) => assert.deepEqual(d.slice().sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8]));
  assert.deepEqual(F.layouts(9, 12), draws, 'gate draws are reproducible');
});

// A fake engine: she wins when she has A (60%) or A and B (61%); C makes no difference.
function fake(calls) {
  return async (req, seeds) => {
    calls.push(seeds.length);
    const has = (id) => req.horses[0].skills.includes(id);
    return seeds.map((s) => {
      const u = ((s * 2654435761) >>> 0) / 4294967296, p = has('A') ? (has('B') ? 0.61 : 0.6) : 0.2;
      const first = u < p ? 0 : 1 + Math.floor(u * 8);
      return { results: req.horses.map((h, i) => ({ finishOrder: i === 0 ? first : i <= first ? i - 1 : i })) };
    });
  };
}
test('win search: picks the winning set, keeps a small but positive skill, drops a no-gain one', async () => {
  const p = P.list.find((x) => x.id === 'cm22'), calls = [];
  const field = F.rivals(her, { mix: F.MIX.cm, strength: 'equal', skillsFor: () => [] });
  const out = await F.search({ preset: p, kind: 'cm', her, learned: [], team: [], field, table: {}, settings: {}, run: fake(calls),
    candidates: [[opt('C')], [opt('A'), opt('C')], [opt('A'), opt('B'), opt('C')], [opt('B')]] });
  assert.ok(out.selected.some((x) => x.id === 'A'), 'A wins races');
  assert.ok(!out.selected.some((x) => x.id === 'C'), 'C adds nothing and is dropped');
  assert.ok(out.pruned.some((x) => x.id === 'C'));
  assert.equal(out.goal, 'win'); assert.equal(out.field, 9);
  assert.ok(out.result.win.mean > out.baseline.win.mean + 0.2);
});
test('League of Heroes goal is the average place; unsupported conditions are taken out and listed', async () => {
  const p = P.list.find((x) => x.id === 'loh3'), calls = [];
  const inner = fake(calls);
  const run = async (req, seeds) => {
    if (req.horses.some((h) => h.skills.includes('BAD'))) throw new Error('Untraced retail random trigger: phase_firstquarter_random');
    return inner(req, seeds);
  };
  const table = { BAD: { alternatives: [{ condition: 'phase_firstquarter_random==1' }] }, A: {}, B: {}, C: {} };
  const field = F.rivals(her, { mix: F.MIX.loh, strength: 'equal', skillsFor: () => ['BAD'] });
  const out = await F.search({ preset: p, kind: 'loh', her, learned: [], team: [], field, table, settings: {}, run, candidates: [[opt('A')], [opt('C')]] });
  assert.equal(out.goal, 'place'); assert.equal(out.field, 12);
  assert.deepEqual(out.unsupported, ['BAD']);
  assert.deepEqual(out.selected.map((x) => x.id), ['A']);
});

test('builds keep the goal and field settings', () => {
  const b = SO.decode(SO.encode({ cup: 'loh1', goal: 'win', strength: 'weaker', mix: { Nige: 2, Senkou: 4, Sasi: 3, Oikomi: 2 } }));
  assert.equal(b.goal, 'win'); assert.equal(b.strength, 'weaker'); assert.deepEqual(b.mix, { Nige: 2, Senkou: 4, Sasi: 3, Oikomi: 2 });
  assert.equal(SO.clean({ mix: { Nige: 0 } }).mix, null);
  assert.equal(SO.clean({ mix: { Nige: 20 } }).mix.Nige, 17);
  assert.equal(SO.clean({}).goal, 'length');
});

test('vendored GlobalSim: license, notice, every cup course but Del Mar, and the real engine races a field', async () => {
  const dir = path.join(ROOT, 'vendor/globalsim');
  ['LICENSE', 'NOTICE', 'README.md', 'index.js', 'pool.js', 'worker.js', 'engine.js', 'wasm/globalsim_bg.wasm', 'skill-data.json', 'settings.json'].forEach((f) => assert.ok(fs.existsSync(path.join(dir, f)), f));
  assert.match(fs.readFileSync(path.join(dir, 'LICENSE'), 'utf8'), /GNU AFFERO GENERAL PUBLIC LICENSE/);
  assert.match(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), /github\.com\/daftuyda\/GlobalSim/);
  P.list.filter((p) => p.course.track !== 'Del Mar').forEach((p) => assert.ok(fs.existsSync(path.join(dir, 'course_geometry', p.course.id + '.json')), p.id));
  const E = await import(path.join(dir, 'engine.js'));
  await E.init(fs.readFileSync(path.join(dir, 'wasm/globalsim_bg.wasm')));
  const T = JSON.parse(fs.readFileSync(path.join(dir, 'skill-data.json'), 'utf8')).skills, settings = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
  const p = P.list.find((x) => x.id === 'loh1');
  E.registerCourseGeometry(p.course.id, fs.readFileSync(path.join(dir, 'course_geometry', p.course.id + '.json'), 'utf8'));
  const base = Object.assign({}, her, { stats: Object.assign({}, her.stats, { stamina: 1300 }), unique: null });
  const field = F.rivals(base, { mix: F.MIX.loh, strength: 'equal', skillsFor: () => [] });
  const draws = F.layouts(12, 4);
  const race = async (skills) => {
    let empty = 0, place = 0, n = 0;
    for (const g of draws) {
      const r = new E.PreparedRace(F.request({ preset: p, table: T, settings }, [F.runner(Object.assign({}, base, { skills }))].concat(field.map(F.runner)), g));
      for (let s = 1; s <= 10; s++) { const x = r.runResults(s).results; assert.deepEqual(x.map((y) => y.finishOrder).sort((a, b) => a - b), [...Array(12).keys()]); empty += x[0].hpEmptyOnRace ? 1 : 0; place += x[0].finishOrder + 1; n++; }
      r.close();
    }
    return { empty: empty / n, place: place / n };
  };
  const none = await race([]), heal = await race(['200352']);
  // The validated setup (no experimental showdown): a heal never makes her run out more often.
  assert.ok(heal.empty <= none.empty + 0.1, `a heal ran her out of stamina: ${heal.empty} vs ${none.empty}`);
});
