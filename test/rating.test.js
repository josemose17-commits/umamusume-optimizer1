const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../rating.js');
const P = require('../data/parent-data.js');

test('stat scores match the published 50-point table and interpolate between', () => {
  assert.equal(R.statScore(0), 0);
  assert.equal(R.statScore(300), 352);
  assert.equal(R.statScore(1000), 2635);
  assert.equal(R.statScore(1200), 3841);
  assert.equal(R.statScore(1025), Math.round(2635 + (2895 - 2635) / 2));
  assert.equal(R.statScore(3000), 23905);
  assert.equal(R.statsScore([1200, 1000, 300, 0, 0]), 3841 + 2635 + 352);
});

test('unique bonus: 120 per level for 1-2 stars, 170 for 3+', () => {
  assert.equal(R.uniqueBonus(2, 2), 240);
  assert.equal(R.uniqueBonus(3, 3), 510);
  assert.equal(R.uniqueBonus(0, 5), 0);
});

test('ranks from the game table: SS at 17,500, SS+ at 19,200', () => {
  assert.equal(R.rankOf(17499).label, 'S+');
  assert.equal(R.rankOf(17500).label, 'SS');
  assert.equal(R.rankOf(19200).label, 'SS+');
  assert.equal(R.rankOf(0).label, 'G');
  assert.equal(R.SS, P.ranks[16]);
});

test('skill rating follows the aptitude of its role', () => {
  const id = Object.keys(P.skillRating).find((k) => P.skillRating[k][5] === 'Long' && P.skillRating[k][1] != null);
  const e = P.skillRating[id];
  const apt = (g) => ['A', 'A', 'A', 'A', 'A', g, 'A', 'A', 'A', 'A'];
  assert.equal(R.skillScore(id, apt('S')), e[1]);
  assert.equal(R.skillScore(id, apt('B')), e[2]);
  assert.equal(R.skillScore(id, apt('E')), e[3]);
  assert.equal(R.skillScore(id, apt('G')), e[4]);
  assert.equal(R.skillScore('no-such-skill', apt('A')), 0);
});

test('two-role skills take the best multiplier per group, multiplied across groups', () => {
  const id = Object.keys(P.skillRating).find((k) => P.skillRating[k][5] === 'Medium/Pace');
  const base = P.skillRating[id][0];
  // Medium A (1.1) × Pace C (0.9).
  const apt = ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'C', 'A', 'A'];
  assert.equal(R.skillScore(id, apt), Math.round(base * 1.1 * 0.9));
  const two = Object.keys(P.skillRating).find((k) => P.skillRating[k][5] === 'Medium/Long');
  // Same group: the better of Medium G and Long A.
  assert.equal(R.skillScore(two, ['A', 'A', 'A', 'A', 'G', 'A', 'A', 'A', 'A', 'A']), Math.round(P.skillRating[two][0] * 1.1));
});

test('rating sums stats, skills and unique; statsFor closes a gap on the highest stat first', () => {
  const apt = ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A'];
  const r = R.rating({stats: [1200, 1000, 1000, 600, 1000], skills: [], apt, uniqueLevel: 3, stars: 3});
  assert.equal(r.total, 3841 + 3 * 2635 + 1143 + 510);
  assert.equal(r.toSS, R.SS - r.total);
  const add = R.statsFor([1000, 600, 600, 600, 600], 500);
  assert.ok(add[0] > 0 && add.slice(1).every((n) => n === 0));
  assert.equal(R.statsFor([1200, 1200, 1200, 1200, 1200], 100, [1200, 1200, 1200, 1200, 1200]), null);
});
