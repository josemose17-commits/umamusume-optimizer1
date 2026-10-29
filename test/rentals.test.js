// Rental parents pasted from uma.moe (rentals.js): the rental, her parents and their sparks.
const test = require("node:test");
const assert = require("node:assert");
const R = require("../rentals.js");
const V = require("../veterans.js");
const SB = require("../skill-budget.js");
const G = require("../data/gametora.js");
const N = require("../data/spark-names.js");
const A = require("../affinity.js");

const rp = R.create({ names: N, whiteOf: V.create(SB.DATA.skills).whiteOf, trainees: G.trainees });
// A made-up card in uma.moe's layout (one value per line, as copied from the page).
const card = (trainer, id, extra) => [trainer, id, "Plan", "Share", "Races", "Outdated", "Save",
  "78", "Affinity", "8", "G1 Wins", "20", "White Skills", "19,635", "Score",
  "Nishino Flower", "78", "Mejiro Ryan", "23", "Taiki Shuttle", "33", "Riko Kashimoto", "Per Inh.", "★ Stars",
  "3", "★", "Wit", "1.00x", "(3★)",
  "6", "★", "Power", "2.00x",
  "4", "★", "Turf", "8.83%", "(2★)",
  "3", "★", "Sprint", "6.65%",
  "2", "★", "Budding Blossom", "17.80%", "(2★)",
  "1", "★", "Let's Pump Some Iron!", "6.15%",
  "Scenario whites", "3", "★", "Unity Cup", "12.89%", "(1★)",
  "Normal whites", "3", "★", "Corner Adept ○", "12.89%", "(1★)",
  "7", "★", "Groundwork", "29.84%", "(1★)",
  "2", "★", "Ignited Spirit: Wit +", "7.98%",
  "Race whites", "2", "★", "Hanshin J.F.", "3.56%", "(2★)",
  "1", "★", "Arima Kinen", "1.23%",
  ...(extra || []), "9", "0", "Verified", "·", "Oct 29, 2026 at 2:02 PM"].join("\n\n");

test("rentals: who's who, and versions from their green sparks", () => {
  const { list } = rp.parse(card("Trainer A", "111 222 333 444"));
  assert.strictEqual(list.length, 1);
  const r = list[0];
  assert.deepStrictEqual([r.trainer, r.friend, r.affinity, r.g1Wins, r.score], ["Trainer A", "111222333444", 78, 8, 19635]);
  assert.deepStrictEqual(r.names, ["Nishino Flower", "Mejiro Ryan", "Taiki Shuttle"]);
  const nishino = G.trainees.find((t) => t.n === "Nishino Flower"), ryan = G.trainees.find((t) => t.n === "Mejiro Ryan");
  assert.strictEqual(r.parent.cid, nishino.cid);
  assert.strictEqual(r.parent.tid, 105101, "Budding Blossom is card 105101's unique");
  assert.strictEqual(r.parent.green, 2);
  assert.strictEqual(r.parents[0].cid, ryan.cid);
  assert.strictEqual(r.parents[0].green, 1, "her parent's green, by whose unique it is");
});

test("rentals: the rental's own stars, the rest split between her parents (3★ at most each)", () => {
  const r = rp.parse(card("T", "111 222 333 444")).list[0];
  assert.deepStrictEqual(r.parent.blue, [4, 3], "Wit 3★ is hers");
  assert.deepStrictEqual(r.parents.map((p) => p.blue), [[2, 3], [2, 3]], "Power 6★ is her parents'");
  assert.deepStrictEqual(r.parent.pink, [0, 2]);
  assert.deepStrictEqual(r.parents.map((p) => p.pink), [[0, 2], [2, 3]], "Turf's other 2★, then Sprint 3★");
  const ca = (m) => m.white.filter(([id]) => id === "200332").map(([, n]) => n);
  assert.deepStrictEqual([ca(r.parent), ca(r.parents[0]).concat(ca(r.parents[1]))], [[1], [2]], "Corner Adept ○ 3★: 1 hers");
  const gw = (m) => m.white.filter(([id]) => SB.DATA.skills[id] && SB.DATA.skills[id][0] === "20160").map(([, n]) => n);
  assert.deepStrictEqual([gw(r.parent), gw(r.parents[0]), gw(r.parents[1])], [[1], [3], [3]], "Groundwork 7★");
});

test("rentals: G1 wins from her own race sparks; scenario sparks and unknown skills skipped", () => {
  const r = rp.parse(card("T", "111 222 333 444")).list[0];
  assert.deepStrictEqual(r.parent.wins, ["Hanshin Juvenile Fillies"]);
  assert.deepStrictEqual(r.parents.map((p) => p.wins), [[], []]);
  const names = new Set(A.g1Races().map((x) => x.name));
  Object.values(R.G1).forEach((n) => assert.ok(names.has(n), n));
  assert.deepStrictEqual(r.unscored, ["Ignited Spirit: Wit +"], "a spark with no skill data");
  assert.deepStrictEqual(r.unknown, []);
});

test("rentals: several cards at once, and names it doesn't know are listed", () => {
  const text = card("A", "111 222 333 444") + "\n" + card("B", "555 666 777 888", ["1", "★", "Made-Up Skill", "1.00%"]);
  const { list } = rp.parse(text);
  assert.deepStrictEqual(list.map((r) => r.trainer), ["A", "B"]);
  assert.deepStrictEqual(list[1].unknown, ["Made-Up Skill"]);
  assert.throws(() => rp.parse("hello"), /no uma.moe parents/);
});

test("rentals: cards it can't read are named with the reason, and names match loosely", () => {
  const odd = card("C", "999 888 777 666").replace("Nishino Flower", "Nobody Atall");
  const cut = ["D", "123 456 789 012", "Plan", "78", "Affinity"].join("\n");
  const { list, skipped } = rp.parse([card("A", "111 222 333 444"), odd, cut].join("\n"));
  assert.strictEqual(list.length, 1);
  assert.deepStrictEqual(skipped.map((x) => x.trainer), ["C", "D"]);
  assert.match(skipped[0].why, /not recognised: Nobody Atall/);
  assert.match(skipped[1].why, /cut off/);
  assert.throws(() => rp.parse(cut), /couldn't read D/);
  const spaced = rp.parse(card("E", "111 222 333 445").replace("Nishino Flower", "nishino  flower")).list[0];
  assert.strictEqual(spaced.parent.cid, G.trainees.find((t) => t.n === "Nishino Flower").cid);
});
