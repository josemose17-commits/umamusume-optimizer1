const test = require("node:test");
const assert = require("node:assert/strict");
const PP = require("../pull-planner.js");

const r = 0.0075; // a featured SSR or 3-star trainee on Global

test("one copy with the spark: the mean is (1 - (1 - r)^200) / r, and the spark makes it certain at 200", () => {
  const c = PP.cost(1, r, 200);
  assert.ok(Math.abs(c.mean - (1 - Math.pow(1 - r, 200)) / r) < 1e-6);
  assert.equal(c.max, 200);
  assert.equal(c.p90, 200, "under 90% to pull one before the spark");
  assert.equal(PP.chance(200, 1, r, 200), 1);
  assert.ok(PP.chance(199, 1, r, 200) < 0.8);
});

test("more copies cost more, and never more than one spark per copy", () => {
  let prev = 0;
  for (let k = 1; k <= 5; k++) {
    const c = PP.cost(k, r, 200);
    assert.ok(c.mean > prev && c.mean < 200 * k && c.p90 <= 200 * k && c.p50 <= c.p90);
    prev = c.mean;
  }
  // A featured SR (2.25%) to its last limit break is far cheaper than an SSR.
  assert.ok(PP.cost(5, 0.0225, 200).mean < PP.cost(5, r, 200).mean / 2);
});

test("carats grow with the monthly income from today", () => {
  const o = { today: "2026-11-04", carats: 10000, perMonth: 3000 };
  assert.equal(PP.caratsBy(o, "2026-11-04"), 10000);
  assert.ok(Math.abs(PP.caratsBy(o, "2027-11-04") - (10000 + 3000 * 365 / 30.4375)) < 1);
  assert.equal(PP.caratsBy(o, "2026-10-01"), 10000, "no negative income before today");
});

const values = (table) => (key, k) => (table[key] ? table[key][k - 1] || table[key][table[key].length - 1] : 0);

test("the route takes the most value per carat that fits the budget at every banner", () => {
  // Two cards on early banners, one later; carats for about two single copies by then.
  const items = [
    { key: "a", kind: "support", date: "2026-11-10", rate: r, have: 0, most: 5 },
    { key: "b", kind: "support", date: "2026-11-20", rate: r, have: 0, most: 5 },
    { key: "c", kind: "support", date: "2027-03-01", rate: r, have: 0, most: 5 },
  ];
  const o = { today: "2026-11-04", carats: 16000, perMonth: 4000, luck: "mean", value: values({ a: [10, 12], b: [30, 35], c: [50, 60] }) };
  const p = PP.plan(items, o);
  assert.ok(p.chosen.get("b") >= 1, "b is the better early card");
  assert.ok(p.chosen.get("c") >= 1, "c is affordable later with the income");
  assert.ok(!p.chosen.get("a"), "no carats left for a once b and c are paid for");
  for (const s of p.steps) assert.ok(s.left >= -1e-6, "never below zero at a banner");
});

test("a required trainee is planned first, tickets pay for pulls, and the 90% plan needs more carats", () => {
  const items = [
    { key: "uma", kind: "trainee", date: "2026-12-01", rate: r, have: 0, most: 1, required: true },
    { key: "card", kind: "support", date: "2026-11-10", rate: r, have: 0, most: 1 },
  ];
  const value = values({ uma: [1], card: [100] });
  const base = { today: "2026-11-04", carats: 16000, perMonth: 0, value };
  const mean = PP.plan(items, Object.assign({ luck: "mean" }, base));
  assert.equal(mean.chosen.get("uma"), 1, "the required trainee comes first");
  assert.ok(!mean.chosen.get("card"), "the card no longer fits");
  const withTickets = PP.plan(items, Object.assign({ luck: "mean", tickets: { support: 0, trainee: 104 } }, base));
  assert.equal(withTickets.chosen.get("card"), 1, "trainee tickets free the carats for the card");
  assert.deepEqual(PP.plan(items, Object.assign({ luck: "p90" }, base, { carats: 20000 })).missed, ["uma"], "20,000 carats don't cover a spark");
  const safe = PP.plan(items, Object.assign({ luck: "p90" }, base, { carats: 30000 }));
  assert.equal(safe.chosen.get("uma"), 1);
  assert.equal(safe.steps.find((s) => s.key === "uma").pulls, 200, "90% sure means planning for the spark");
  const poor = PP.plan(items, Object.assign({ luck: "mean" }, base, { carats: 1000 }));
  assert.deepEqual(poor.missed, ["uma"], "an unaffordable required trainee is reported");
});

test("fixed pulls: 200 or 400 on a banner, the packs' carats on their dates, free picks first and one per selector", () => {
  const items = [
    { key: "early", kind: "support", date: "2026-11-10", most: 2, pullsAt: (k) => 200 * k },
    { key: "late", kind: "support", date: "2027-01-10", most: 2, pullsAt: (k) => 200 * k },
    { key: "pickA", kind: "selector", date: "2026-12-01", group: "sel1", most: 1, pullsAt: () => 0 },
    { key: "pickB", kind: "selector", date: "2026-12-01", group: "sel1", most: 1, pullsAt: () => 0 },
  ];
  const value = values({ early: [100, 150], late: [120, 300], pickA: [50], pickB: [80] });
  // 30,000 carats now and 27,000 a month: 200 pulls on the early banner, and by January 400 on the
  // late one, but only with the pack's 1,500 carats on top.
  const o = { today: "2026-11-04", carats: 30000, perMonth: 27000, bonus: [{ date: "2026-12-01", carats: 1500 }], value };
  const p = PP.plan(items, o);
  assert.equal(p.chosen.get("pickB"), 1, "the bigger free pick");
  assert.ok(!p.chosen.get("pickA"), "one pick per selector");
  assert.equal(p.chosen.get("late"), 2, "400 pulls: worth more than twice 200");
  assert.equal(p.chosen.get("early"), 1, "200 pulls: all the carats there are by then");
  const steps = new Map(p.steps.map((s) => [s.key, s]));
  assert.equal(steps.get("early").pulls, 200);
  assert.equal(steps.get("late").pulls, 400);
  assert.equal(steps.get("pickB").carats, 0);
  assert.ok(p.steps.every((s) => s.left >= -1e-6));
  const noPack = PP.plan(items, Object.assign({}, o, { bonus: [] }));
  assert.equal(noPack.chosen.get("late"), 2);
  assert.ok(!noPack.chosen.get("early"), "without the pack's carats both don't fit");
});

test("copies after a fixed number of pulls: the spark plus Bin(n, r), capped at the last limit break", () => {
  const d = PP.outcomes(200, r, 0, 200);
  assert.equal(d[0], 0, "the spark makes one copy certain");
  assert.ok(Math.abs(d.reduce((a, x) => a + x, 0) - 1) < 1e-9);
  assert.ok(Math.abs(d[1] - Math.pow(1 - r, 200)) < 1e-12, "one copy: the spark and no pulled copy");
  assert.equal(PP.likely(d), 2, "200 pulls likely end at two copies (LB1)");
  assert.equal(PP.likely(PP.outcomes(400, r, 0, 200)), 5, "400 pulls likely reach LB4");
  assert.equal(PP.outcomes(200, r, 4, 200)[5], 1, "from LB3, one spark always reaches LB4");
});
