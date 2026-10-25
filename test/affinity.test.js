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

test('total follows GameTora: trainee-parent pairs, the parent pair once, trios, +3 per shared G1', () => {
  const A = withGroups([[10, [1, 2]], [5, [1, 2, 3]], [7, [2, 4]], [2, [1, 3]]]);
  const L = {trainee: 1, p1: 2, p2: 4, g11: 3};
  const W = {p1: ['Japan Cup', 'Arima Kinen'], p2: ['Japan Cup'], g11: ['Arima Kinen', 'Japan Cup']};
  const r = A.total(L, W);
  // (1,2) 15 + trio (1,2,3) 5 + parents (2,4) 7 once; (1,4) 0.
  assert.equal(r.base, 15 + 5 + 7);
  assert.deepEqual(r.race.p1p2, ['Japan Cup']);
  assert.deepEqual(r.race.p1g11.sort(), ['Arima Kinen', 'Japan Cup']);
  assert.equal(r.racePts, 9);
  assert.equal(r.total, 36);
  // Each uma's own affinity: the parent pair and the shared wins count for both umas involved.
  assert.deepEqual(A.individual(L, W), {p1: 15 + 5 + 7 + 3 * 3, p2: 7 + 3, g11: 5 + 3 * 2, g12: 0, g21: 0, g22: 0});
  assert.equal(A.sparkMult(50), 1.5);
});

test("matches GameTora's own calculator on 30 real families (totals and each uma's affinity)", () => {
  const F = require('./fixtures/affinity-gametora.json');
  F.cases.forEach((c, i) => {
    const A = withGroups(c.groups);
    const t = A.total(c.lineage, c.wins), ind = A.individual(c.lineage, c.wins);
    assert.equal(t.total, c.gametora.total, 'case ' + i + ' total');
    assert.equal(t.symbol, c.gametora.symbol.replace('◯', '○'), 'case ' + i + ' symbol');
    ['p1', 'p2', 'g11', 'g12', 'g21', 'g22'].forEach((k) => assert.equal(ind[k], c.gametora[k], 'case ' + i + ' ' + k));
  });
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

test('race plan: a race held in two years moves to the other one instead of blocking a one-year race', () => {
  const A = withGroups([]);
  const links = [{role: 'a', cid: 9001, wins: ['Tenno Sho (Autumn)', 'Kikuka Sho']}, {role: 'b', cid: 9002, wins: ['Tenno Sho (Autumn)']}, {role: 'c', cid: 9003, wins: ['Tenno Sho (Autumn)']}];
  // Kikuka Sho is only on turn 44; Tenno Sho (Autumn) is on 44 and 68.
  const p = A.planRaces({self: 9999, apt: Array(10).fill('A'), links, need: 12});
  assert.ok(p.reached);
  assert.deepEqual(p.agenda.map((r) => r.name + '@' + r.turn), ['Kikuka Sho@44', 'Tenno Sho (Autumn)@68']);
});

test("race plan: every career goal's turn is taken, G1 or not", () => {
  const A = withGroups([]);
  // Silence Suzuka races the Kobe Shimbun Hai (a goal) on turn 42, when the Sprinters Stakes is held.
  assert.ok(A.careerGoals(1002).fixed.some((g) => g.turn === 42 && !g.g1));
  const p = A.planRaces({self: 1002, apt: Array(10).fill('A'), links: [{role: 'a', cid: 9001, wins: ['Sprinters Stakes']}], need: 3});
  assert.deepEqual(p.agenda.map((r) => r.name + '@' + r.turn), ['Sprinters Stakes@66']);
});

test('race plan: a "pick one" career goal takes the shared G1, free', () => {
  const A = withGroups([]);
  // Daiwa Scarlet runs the Japanese Oaks or the Japanese Derby (same order, race choice).
  const derby = 'Tokyo Yushun (Japanese Derby)';
  assert.ok(A.careerGoals(1009).choices.some((opts) => opts.some((x) => x.name === derby) && opts.some((x) => x.name === 'Japanese Oaks')));
  const p = A.planRaces({self: 1009, apt: Array(10).fill('A'), links: [{role: 'a', cid: 9001, wins: [derby]}], need: 3});
  assert.equal(p.extraRaces, 0);
  assert.deepEqual(p.agenda.map((r) => [r.name, r.free, r.goal]), [[derby, true, 'choice']]);
});

test('race plan: G1s she has already won are not planned again', () => {
  const A = withGroups([]);
  const p = A.planRaces({self: 9999, apt: Array(10).fill('A'), links: [{role: 'a', cid: 9001, wins: ['Osaka Hai', 'Satsuki Sho']}], need: 99, won: ['Osaka Hai']});
  assert.deepEqual(p.agenda.map((r) => r.name), ['Satsuki Sho']);
  assert.deepEqual(p.alreadyWon, ['Osaka Hai']);
});
