// Your veterans from an umaextractor export (veterans.js): sparks, G1 wins and her parents.
const test = require("node:test");
const assert = require("node:assert");
const V = require("../veterans.js");
const SB = require("../skill-budget.js");
const A = require("../affinity.js");
const F = require("../family.js");

const vets = V.create(SB.DATA.skills);
// A made-up export in umaextractor's shape: Special Week (card 101701) with Teio and McQueen as parents.
const uma = (card, factors, saddles, extra) => Object.assign({ card_id: card, factor_info_array: factors.map((id) => ({ factor_id: id, level: 0 })), win_saddle_id_array: saddles }, extra || {});
const EXPORT = [
  uma(101701, [103, 3301, 2004902, 2019001, 10170102, 1002301, 3000102], [10, 11, 12, 18, 1, 2], {
    trained_chara_id: 403, rank_score: 12573, speed: 1200, stamina: 805, power: 913, guts: 509, wiz: 437,
    proper_ground_turf: 7, proper_ground_dirt: 1, proper_distance_short: 3, proper_distance_mile: 5, proper_distance_middle: 8, proper_distance_long: 7,
    proper_running_style_nige: 6, proper_running_style_senko: 7, proper_running_style_sashi: 7, proper_running_style_oikomi: 5,
    succession_chara_array: [
      Object.assign(uma(101501, [202, 3302, 2003502, 10150102], [10, 11, 12, 14, 18]), { position_id: 10 }),
      Object.assign(uma(101301, [403, 1103], [13]), { position_id: 20 }),
      Object.assign(uma(100101, [101], [10]), { position_id: 11 }),
    ],
  }),
  { trained_chara_id: 9, note: "not a veteran" },
];

test("veterans: spark ids by GameTora's factor table", () => {
  const { list, skipped } = vets.parse(JSON.stringify(EXPORT));
  assert.strictEqual(list.length, 1);
  assert.strictEqual(skipped, 1);
  const v = list[0];
  assert.deepStrictEqual([v.id, v.cid, v.tid], [403, 1017, 101701]);
  assert.deepStrictEqual(v.self.blue, [0, 3], "103: Speed 3★");
  assert.deepStrictEqual(v.self.pink, [4, 1], "3301: Medium 1★ (family.js index 4)");
  // 2004902: family 20049 (Nimble Navigator) 2★, as the ○ that its hint gives.
  assert.deepStrictEqual(v.self.white, [["200492", 2], ["201902", 1]]);
  assert.strictEqual(v.self.green, 2, "10170102: her own unique 2★");
  assert.deepStrictEqual(v.self.races, [[1023, 1]], "1002301: Arima Kinen (race 1023) 1★");
  assert.strictEqual(v.self.other, 1, "a scenario spark");
  assert.deepStrictEqual(v.apt, ["A", "G", "E", "C", "S", "A", "B", "A", "A", "C"]);
  assert.deepStrictEqual(v.stats, [1200, 805, 913, 509, 437]);
});

test("veterans: every pink id lands on its aptitude", () => {
  const pinks = { 11: "Turf", 12: "Dirt", 21: "Front", 22: "Pace", 23: "Late", 24: "End", 31: "Sprint", 32: "Mile", 33: "Medium", 34: "Long" };
  Object.keys(pinks).forEach((id) => assert.strictEqual(F.APT_LABELS[vets.member(uma(101701, [+id * 100 + 2], [])).pink[0]], pinks[id]));
});

test("veterans: G1 wins from saddles, titles left out, names the affinity code knows", () => {
  const v = vets.parse(EXPORT).list[0];
  assert.deepStrictEqual(v.self.wins, ["Arima Kinen", "Japan Cup", "Tokyo Yushun (Japanese Derby)", "Satsuki Sho"]);
  const names = new Set(A.g1Races().map((r) => r.name));
  Object.values(V.SADDLE).forEach((n) => assert.ok(names.has(n), n));
});

test("veterans: her parents are positions 10 and 20, not their own parents", () => {
  const v = vets.parse(EXPORT).list[0];
  assert.deepStrictEqual(v.parents.map((p) => p.tid), [101501, 101301]);
  assert.deepStrictEqual(v.parents[1].blue, [3, 3], "403: Guts 3★");
  assert.deepStrictEqual(v.parents[1].pink, [0, 3], "1103: Turf 3★");
});

test("veterans: a bad paste says what's wrong", () => {
  assert.throws(() => vets.parse("{\"a\":1}"), /veterans list/);
  assert.throws(() => vets.parse("[]"), /No veterans/);
  assert.throws(() => vets.parse("not json"));
});

test("veterans: as a parent, her wins shared with her own parents count for affinity", () => {
  const v = vets.parse(EXPORT).list[0];
  const L = { trainee: 1001, p1: v.cid, g11: v.parents[0].cid, g12: v.parents[1].cid };
  const t = A.total(L, { p1: v.self.wins, g11: v.parents[0].wins, g12: v.parents[1].wins });
  assert.strictEqual(t.race.p1g11.length, 4, "Arima, Japan Cup, Derby, Satsuki Sho");
  assert.strictEqual(t.race.p1g12.length, 0);
});
