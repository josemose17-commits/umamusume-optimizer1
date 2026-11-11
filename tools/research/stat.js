// What +60 of each stat is worth in lengths, head-to-head, no skills, Normal mood, from the
// cup's simulation stats (stamina raised to a full spurt). Usage: node tools/research/stat.js cm22
const B = require('./bench.js');
const RS = B.RS, orig = RS.request, mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const p = B.preset, s = p.stats, staminaFor = { Nige: 900, Senkou: 700, Sasi: 700, Oikomi: 700 };
function h2h(style, key, add) {
  RS.request = (pr, i, b, a, c, n, seed) => { const m = orig(pr, i, b, a, c, n, seed); m.data.uma2[key] = m.data.uma2[key] + add; return m; };
  const st = Math.max(s.stamina, staminaFor[style]);
  const r = B.run({ strategy: style, speed: s.speed, stamina: st, power: s.power, guts: s.guts, wisdom: s.wisdom, mood: 0 }, [], [], 120, 44).results;
  RS.request = orig; return mean(r.results);
}
console.log(p.id, p.course.track, p.course.distance, JSON.stringify(s));
for (const st of ['Nige', 'Senkou', 'Sasi', 'Oikomi'])
  console.log(st, ['speed', 'stamina', 'power', 'guts', 'wisdom'].map(k => `${k} +60: ${h2h(st, k, 60).toFixed(2)}L`).join(' | '));
