// Skill optimizer spec, push A (skill-opt.js): spend all the SP, the stamina gate's formulas and
// heal order, the Umalator link, and the saved settings.
const test = require("node:test");
const assert = require("node:assert");
const SO = require("../skill-opt.js");
const B = require("../skill-budget.js");

const whites = Object.keys(B.DATA.skills).filter((id) => B.DATA.skills[id][3] === 1 && B.DATA.skills[id][1] > 0 && B.DATA.skills[id][2] == null).slice(0, 14);

test("spend all the SP: the rest buys the best other skills that fit, never a clearly negative one", () => {
  const vals = {}; whites.forEach((id, i) => { vals[id] = i < 2 ? 0.5 : 0; });
  vals[whites[13]] = -0.4; // clearly costs lengths
  const q = SO.quickPlan({ skills: whites.map((id) => ({ id, hint: 0 })), values: vals, sp: 1500, fast: false });
  const score = Object.assign({}, vals); whites.slice(2, 13).forEach((id, i) => { score[id] = 0.01 * (11 - i); });
  const f = SO.fillRest({ learned: [], bought: q.selected.map((x) => x.id), available: whites, hints: {}, sp: 1500, spent: q.spent, score });
  assert.ok(f.added.length > 0);
  assert.ok(!f.added.some((x) => x.id === whites[13]), "a skill that costs lengths isn't bought");
  assert.ok(f.added.every((x) => !q.selected.some((y) => y.id === x.id)), "nothing bought twice");
  assert.strictEqual(f.spent, q.spent + f.added.reduce((n, x) => n + x.cost, 0));
  const cheapest = Math.min(...whites.filter((id) => id !== whites[13] && !q.selected.some((y) => y.id === id) && !f.added.some((x) => x.id === id)).map((id) => B.DATA.skills[id][1]));
  assert.ok(f.left < cheapest || !Number.isFinite(cheapest), "nothing else would still fit: " + f.left);
  const sorted = f.added.map((x) => x.score);
  assert.deepStrictEqual(sorted, sorted.slice().sort((a, b) => b - a), "best first");
});

test("stamina gate formulas: max HP by style, the Wit check, heals by HP per SP", () => {
  assert.strictEqual(SO.maxHP(1000, "Sasi", 2400), 0.8 * 1.0 * 1000 + 2400);
  assert.ok(Math.abs(SO.maxHP(1000, "Nige", 2000) - (0.8 * 0.95 * 1000 + 2000)) < 1e-9);
  assert.ok(Math.abs(SO.maxHP(1000, "Oonige", 2000) - (0.8 * 0.86 * 1000 + 2000)) < 1e-9);
  assert.strictEqual(SO.activation(900), 0.9);
  assert.strictEqual(SO.activation(100), 0.2, "never under 20%");
  const order = SO.healOrder([{ id: "a", cost: 200, hp: 0.055 }, { id: "b", cost: 100, hp: 0.035 }, { id: "c", cost: 0, hp: 0.1 }], 0.9);
  assert.deepStrictEqual(order.map((h) => h.id), ["b", "a"], "most HP per SP first; free or unknown prices left out");
});

test("Umalator link: the site's share format (gzipped JSON in the fragment), both umas and hints", async () => {
  const url = await SO.umalatorLink({ courseId: 10504, racedef: { ground: 1, weather: 1, season: 1, time: 2 }, hints: { "200011": 2, "200021": 0 },
    uma1: { speed: 1500, stamina: 900, strategy: "Sasi", skills: ["200011", "200011", "200021"] }, uma2: { speed: 1500, skills: [] } });
  assert.ok(url.startsWith("https://alpha123.github.io/uma-tools/umalator-global/#"));
  const d = await SO.readUmalatorLink(url);
  assert.strictEqual(d.courseId, 10504);
  assert.deepStrictEqual(d.racedef, { ground: 1, weather: 1, season: 1, time: 2, grade: 100 });
  assert.deepStrictEqual(d.uma1.skills, ["200011", "200021"], "no skill twice");
  assert.strictEqual(d.uma1.strategy, "Sasi");
  assert.deepStrictEqual(d.uma2.skills, []);
  assert.deepStrictEqual(d.hintLevels, { "200011": 2 });
  assert.strictEqual(d.usePosKeep, true);
});

test("saved settings: full-spurt goal and Spend all the SP survive a share link", () => {
  const b = SO.clean({ cup: "cm23", spurtGoal: 90, noFill: true, sp: 1200 });
  assert.strictEqual(b.spurtGoal, 90);
  assert.strictEqual(b.noFill, true);
  const back = SO.decode(SO.encode(b));
  assert.strictEqual(back.spurtGoal, 90);
  assert.strictEqual(back.noFill, true);
  assert.strictEqual(SO.clean({}).spurtGoal, 95);
  assert.strictEqual(SO.clean({}).noFill, false);
});
