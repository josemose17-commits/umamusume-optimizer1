const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../data/gametora.js');

// A fresh affinity module over the given groups (it caches its index on first use).
function withGroups(groups) {
  globalThis.UmaParentData = {affinity: groups, ranks: [], skillRating: {}};
  delete require.cache[require.resolve('../affinity.js')];
  const A = require('../affinity.js');
  return A;
}
test.afterEach(() => { delete globalThis.UmaParentData; delete require.cache[require.resolve('../affinity.js')]; });

test('total follows GameTora: trainee-parent pairs, parent pair counted on both sides, trios, +3 per shared G1', () => {
  const A = withGroups([[10, [1, 2]], [5, [1, 2, 3]], [7, [2, 4]], [2, [1, 3]]]);
  const L = {trainee: 1, p1: 2, p2: 4, g11: 3};
  const r = A.total(L, {p1: ['Japan Cup', 'Arima Kinen'], p2: ['Japan Cup'], g11: ['Arima Kinen', 'Japan Cup']});
  // (1,2) 15 + trio (1,2,3) 5 + parents (2,4) 7, on both sides; (1,4) 0.
  assert.equal(r.base, 15 + 5 + 7 + 7);
  assert.deepEqual(r.race.p1p2, ['Japan Cup']);
  assert.deepEqual(r.race.p1g11.sort(), ['Arima Kinen', 'Japan Cup']);
  assert.equal(r.racePts, 9);
  assert.equal(r.total, 43);
});

test('a grandparent who is the same character as her parent adds nothing', () => {
  const A = withGroups([[10, [1, 2]], [5, [1, 2, 3]]]);
  // (1,2) is in both groups: 15; the (1,2,2) "trio" adds nothing.
  assert.equal(A.total({trainee: 1, p1: 2, g11: 2}, {}).total, 15);
  assert.equal(A.together(2, 2), 0);
});

test('symbols: over 150 is ◎, over 50 is ○', () => {
  const A = withGroups([]);
  assert.equal(A.symbol(151), '◎');
  assert.equal(A.symbol(150), '○');
  assert.equal(A.symbol(51), '○');
  assert.equal(A.symbol(50), '△');
});

test('real data: every group has points and two or more members', () => {
  const P = require('../data/parent-data.js');
  assert.ok(P.affinity.length > 100);
  P.affinity.forEach(([pts, m]) => { assert.ok(pts > 0); assert.ok(m.length >= 2); });
});

test('race plan: career goals are free, races shared with more umas first, fewest races to the need', () => {
  const A = withGroups([]);
  const spe = D.trainees.find((t) => t.cid === 1001);
  const links = [
    {role: 'her parent 1', cid: 1002, wins: ['Japan Cup', 'Osaka Hai', 'Takarazuka Kinen', 'Satsuki Sho']},
    {role: 'her parent 2', cid: 1003, wins: ['Takarazuka Kinen', 'Satsuki Sho']},
  ];
  const p = A.planRaces({self: 1001, apt: spe.apt, links, need: 12});
  // Japan Cup is a Special Week goal (free, +3); Takarazuka and Satsuki give +6 each.
  const extra = p.agenda.filter((r) => !r.free).map((r) => r.name).sort();
  assert.deepEqual(extra, ['Satsuki Sho', 'Takarazuka Kinen']);
  assert.ok(p.agenda.some((r) => r.name === 'Japan Cup' && r.free));
  assert.equal(p.points, 15);
  assert.ok(p.reached);
});

test('race plan skips races outside her aptitudes and same-turn clashes', () => {
  const A = withGroups([]);
  const apt = ['A', 'G', 'G', 'A', 'A', 'A', 'A', 'A', 'A', 'A']; // no sprint, no dirt
  const links = [{role: 'p', cid: 1002, wins: ['Sprinters Stakes', 'February Stakes', 'Oka Sho', 'Satsuki Sho']}];
  const p = A.planRaces({self: 9999, apt, links, need: 99});
  assert.deepEqual(p.unfit.map((r) => r.name).sort(), ['February Stakes', 'Sprinters Stakes']);
  // Oka Sho and Satsuki Sho share a turn: only one can be run.
  assert.equal(p.agenda.length, 1);
  assert.equal(p.skipped.length, 1);
  assert.equal(p.skipped[0].why, 'clash');
});
