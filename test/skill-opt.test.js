const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const ROOT = path.join(__dirname, '..');
const SO = require('../skill-opt.js'), B = require('../skill-budget.js'), R = require('../race-skills.js'), RV = require('../race-variants.js');
const SV = require('../data/skillvalues/index.js'), P = require('../data/presets.js');
const CJ = require('../data/race-skills-jp.json');
const INDEX = require('../data/race-variants/index.json');
const names = Object.entries(SV.skills).filter(([, x]) => x[3]).map(([id, x]) => [id, x[0]]);

test('share links carry the whole build and reject junk', () => {
  const build = { cup: 'loh1', style: 'Sasi', tid: '100101', stats: { speed: 1600, stamina: 1250, power: 1300, guts: 900, wisdom: 1100 },
    apt: { distanceAptitude: 'S' }, mood: '2', uniqueLv: 4, sp: 1800, fast: true, skills: [{ id: '200351', hint: 3 }, { id: '200331', hint: 1, have: true }] };
  const back = SO.decode(SO.encode(build));
  assert.deepEqual(back, SO.clean(build));
  assert.equal(back.stats.speed, '1600'); assert.equal(back.fast, true); assert.equal(back.skills[1].have, true);
  assert.equal(SO.decode('not a code'), null);
  assert.equal(SO.clean({ style: 'Bogus', sp: 99999, skills: [{ id: '1', hint: 9 }, { id: '1' }] }).style, 'Senkou');
  assert.equal(SO.clean({ sp: 99999 }).sp, '20000');
  assert.deepEqual(SO.clean({ skills: [{ id: '1', hint: 9 }, { id: '1' }] }).skills, [{ id: '1', hint: 5, have: false }]);
});

test('pasted skill lists: names, typos, circles and hint levels', () => {
  const r = SO.parsePaste('corner adept o lv3\nProfessor of Curvature hint 2\nSwinging Maestro x4\nBeelin Burst 170\nnot a skill at all', names);
  assert.deepEqual(r.found.map((x) => [x.id, x.hint]), [['200332', 3], ['200331', 2], ['200351', 4], ['200361', 0]]);
  assert.deepEqual(r.missed, ['not a skill at all']);
});

test('a gold row brings its white, and Fast Learner adds 10% of the base cost to the hint discount', () => {
  assert.deepEqual(SO.withLower('200351', B.create()), ['200352', '200351']);
  assert.equal(B.discounted(170, 4, true), 93); // 45% off: floor(170 * 0.55)
  assert.equal(B.discounted(200, 5, true), 100);
  assert.equal(B.discounted(200, 0, false), 200);
  const skills = [{ id: '200331', hint: 0 }], values = { 200331: 1, 200332: 0.5 };
  const slow = SO.quickPlan({ skills, values, sp: 1000, fast: false }), fast = SO.quickPlan({ skills, values, sp: 1000, fast: true });
  assert.ok(fast.spent < slow.spent, 'Fast Learner lowers the price');
  assert.deepEqual(fast.selected.map((x) => x.id), ['200331']);
  assert.deepEqual(fast.selected[0].tiers.map((x) => x.id), ['200332', '200331'], 'the gold is priced with its white');
  const owned = SO.quickPlan({ skills: [{ id: '200332', hint: 0, have: true }, { id: '200331', hint: 0 }], values, sp: 1000 });
  assert.deepEqual(owned.selected[0].tiers.map((x) => x.id), ['200331'], 'an owned white is not bought again');
});

test('a head-to-head tie goes to the cheaper set', async () => {
  const [a, b] = ['200332', '200512'];
  const out = await R.optimize({ catalog: require('../data/race-skills.json'), available: [a, b], learned: [], hints: {}, sp: 1000, values: { [a]: 1, [b]: 0.5 },
    compare: async (before, after) => R.summary([after.includes(a) ? 1 : 0, after.includes(a) ? 1 : 0]) });
  assert.deepEqual(out.selected.map((x) => x.id), [a], 'a skill that adds nothing is not bought');
});

test('every JP-dated cup runs on its shipped in-browser simulator', () => {
  const sims = SV.meta.sims;
  P.list.forEach((p) => {
    const e = R.engine(p, sims);
    if (!/^jp-/.test(sims[p.id] || '')) { assert.equal(e.sim, null); return; }
    assert.equal(e.catalog, 'jp');
    assert.ok(fs.existsSync(path.join(ROOT, 'data/race-variants', e.sim + '.json')), p.id + ' variant file');
    assert.equal(INDEX.presets[p.id], e.sim, p.id + ' variant matches the skill values');
    assert.ok(CJ.courses[p.course.id], p.id + ' course in the JP catalog');
    assert.equal(R.supported(p, Object.assign({}, SV.meta.variants[e.sim], { inBrowser: true }), CJ), null);
  });
});

test('the JP worker is the pinned upstream build and every variant patches it', () => {
  const src = fs.readFileSync(path.join(ROOT, 'vendor/umalator-jp/simulator.worker.js'), 'utf8');
  const blob = crypto.createHash('sha1').update('blob ' + Buffer.byteLength(src) + '\0').update(src).digest('hex');
  assert.match(fs.readFileSync(path.join(ROOT, 'vendor/umalator-jp/README.md'), 'utf8'), new RegExp('Worker blob: ' + blob));
  assert.ok(fs.existsSync(path.join(ROOT, 'vendor/umalator-jp/LICENSE')));
  assert.ok(RV.locate(src));
  Object.keys(INDEX.variants).forEach((name) => {
    const v = require('../data/race-variants/' + name + '.json'), out = RV.patch(src, v);
    assert.equal(/withStaminaSyoubu\(\),/.test(out.replace(/withStaminaSyoubu\(\)\{/g, '')), v.syoubu, name + ' showdown');
    if (v.syoubuLong) assert.match(out, /<2601\?1\.5:1\.8\}/);
  });
});

function worker(sim) {
  let handler, last;
  const sb = { URL, console: { assert() {}, log() {}, warn() {}, error() {} }, location: { href: 'http://localhost/race-worker.js?v=t' + (sim ? '&sim=' + sim : '') },
    addEventListener: (t, f) => { handler = f; }, postMessage: (m) => { if (m.type === 'compare' || m.type === 'error') last = m; } };
  sb.self = sb;
  sb.XMLHttpRequest = function () { let u; this.open = (m, url) => { u = url; }; this.send = () => { this.status = 200; this.responseText = fs.readFileSync(path.join(ROOT, u.split('?')[0]), 'utf8'); }; };
  vm.createContext(sb);
  sb.importScripts = (u) => vm.runInContext(fs.readFileSync(path.join(ROOT, u.split('?')[0]), 'utf8'), sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'race-worker.js'), 'utf8'), sb);
  return (msg) => { last = null; handler({ data: msg }); return last; };
}
test('stamina showdown: stamina past 1200 gains lengths on League of Heroes 1, not without showdown', () => {
  const p = P.list.find((x) => x.id === 'loh1'), input = { ...p.stats, strategy: 'Senkou', outfitId: '100101' };
  const gain = (sim) => {
    const m = R.request(p, Object.assign({}, input, { stamina: 1250 }), ['100011'], ['100011'], CJ, 24);
    m.data.uma2 = Object.assign({}, m.data.uma2, { stamina: 1600 });
    const r = worker(sim)(m); assert.equal(r.type, 'compare', r.error);
    return R.summary(Array.from(r.results.results)).mean;
  };
  assert.ok(gain(SV.meta.sims.loh1) > 0.8, 'showdown with long-race factors');
  assert.ok(Math.abs(gain('jp-nosyoubu-8b68779361')) < 0.2, 'no showdown');
  assert.equal(worker('../bad')({}).type, 'error');
});
