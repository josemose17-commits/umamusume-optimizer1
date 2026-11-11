// What an aptitude grade is worth in lengths: A vs S (and B vs A) for distance, surface and
// style, no skills, Normal mood, head-to-head on the same races. Usage: node tools/research/apt.js cm22
const B = require('./bench.js');
const RS = B.RS, orig = RS.request, mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const p = B.preset, s = p.stats, staminaFor = { Nige: 900, Senkou: 700, Sasi: 700, Oikomi: 700 };
function h2h(style, key, from, to) {
  RS.request = (pr, i, b, a, c, n, seed) => { const m = orig(pr, i, b, a, c, n, seed); m.data.uma1[key] = from; m.data.uma2[key] = to; return m; };
  const st = Math.max(s.stamina, staminaFor[style]);
  const r = B.run({ strategy: style, speed: s.speed, stamina: st, power: s.power, guts: s.guts, wisdom: s.wisdom, mood: 0 }, [], [], 120, 33).results;
  RS.request = orig; return mean(r.results);
}
console.log(p.id, p.name, p.course.track, p.course.distance, p.course.surface);
for (const st of ['Nige', 'Senkou', 'Sasi', 'Oikomi']) {
  const out = [];
  for (const [k, lbl] of [['distanceAptitude', 'distance'], ['surfaceAptitude', 'surface'], ['strategyAptitude', 'style']])
    out.push(`${lbl} A→S ${h2h(st, k, 'A', 'S').toFixed(2)}L, B→A ${h2h(st, k, 'B', 'A').toFixed(2)}L`);
  console.log(st, out.join(' | '));
}
