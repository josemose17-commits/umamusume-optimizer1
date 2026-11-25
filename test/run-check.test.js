// Predictions vs your runs: each veteran keeps her deck (veterans.js), and optimizer.checkRuns
// simulates it in her scenario next to her real stats, per scenario.
const test = require("node:test");
const assert = require("node:assert");
const D = require("../deck.js");
const O = require("../optimizer.js");
const SB = require("../skill-budget.js");
const V = require("../veterans.js").create(SB.DATA.skills);
const { SCENARIOS } = require("../scenarios.js");

const ssr = D.DATA.supports.filter((c) => c.r === 3 && D.onGlobal(c, "2026-11-25")).slice(0, 6);
const deckList = ssr.map((c, i) => ({ support_card_id: c.id, limit_break_count: i === 5 ? 4 : 3, position: i + 1 }));
const vet = (id, stats) => ({ card_id: 101701, trained_chara_id: id, scenario_id: 1, factor_info_array: [{ factor_id: 103 }], win_saddle_id_array: [],
  speed: stats[0], stamina: stats[1], power: stats[2], guts: stats[3], wiz: stats[4], support_card_list: deckList,
  proper_distance_middle: 8, proper_distance_long: 6, proper_distance_short: 2, proper_distance_mile: 4, proper_ground_turf: 7, proper_ground_dirt: 1 });

test("a veteran keeps her own deck (slot 6 is the borrowed card)", () => {
  const { list } = V.parse(JSON.stringify([vet(1, [1200, 800, 900, 500, 600])]));
  assert.strictEqual(list[0].deck.length, 6);
  assert.strictEqual(list[0].deck.filter((x) => x.borrowed).length, 1);
  assert.strictEqual(list[0].scenario, "ura");
});

test("checkRuns: her deck simulated in her scenario, averaged per scenario with actual / predicted", () => {
  const { list } = V.parse(JSON.stringify([vet(1, [1300, 900, 1000, 600, 700]), vet(2, [1100, 700, 800, 400, 500])]));
  const r = O.checkRuns(list, { scenarios: Object.fromEntries(SCENARIOS.map((s) => [s.id, s])), buildOf: () => "medium", runs: 4 });
  const g = r.by.ura;
  assert.strictEqual(g.n, 2);
  assert.deepStrictEqual(g.actual, [1200, 800, 900, 500, 600]);
  g.ratio.forEach((x, i) => assert.ok(Math.abs(x - g.actual[i] / g.predicted[i]) < 1e-9));
  assert.strictEqual(r.rows.length, 2);
});
