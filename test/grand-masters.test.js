const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../grand-masters.js");
const E = require("../engine.js");
const { SCENARIOS } = require("../scenarios.js");
const gmSc = SCENARIOS.find((s) => s.id === "grandmasters");
const fac = (stat, o) => Object.assign({ stat, gain: null, cards: 0, rainbows: 0, unbonded: 0, hint: false, fail: null, extras: {} }, o || {});
const facs = (o) => E.STATS.map((s) => fac(s, (o || {})[s]));
const base = (o) => Object.assign({ turn: 30, energy: 80, maxEnergy: 100, mood: 3, build: "medium", risk: 12, raceBonus: 0,
  goals: [], extras: {}, stats: {}, caps: {}, calib: [], log: [], goalRace: false, race: "", badCondition: false, facilities: facs() }, o);

test("Knowledge Table: 8 slots, a double can't land on 7, nothing on 8", () => {
  const t = [];
  assert.equal(G.add(t, "red", 2), 2);
  ["blue", "blue", "blue", "blue", "blue"].forEach((c) => G.add(t, c, 1));
  assert.equal(t.length, 7);
  assert.equal(G.add(t, "yellow", 2), 1, "7 held: only one");
  assert.equal(G.add(t, "red", 1), 0, "full");
  assert.equal(t.length, 8);
});

test("Wisdom color: the 1st and 5th fragments, else the color with more fragments, a tie a coin flip", () => {
  assert.deepEqual(G.wisdomColor(["red", "blue", "blue", "blue", "red", "blue", "blue", "blue"]), { color: "red", sure: true });
  assert.equal(G.wisdomColor(["red", "blue", "blue", "blue", "yellow", "yellow", "yellow", "red"]).color, "yellow");
  assert.ok(G.wisdomColor(["red", "red", "red", "red", "blue", "blue", "blue", "blue"]).tie);
  assert.ok(G.wisdomColor(["red", "blue"]).open, "the 5th slot can still change it");
  assert.equal(G.wisdomColor([]), null);
});

test("goddess plan: Red to 2 in Junior, all to 1, skill goddess to 4, others to 3", () => {
  assert.equal(G.nextColor({ red: 1 }, 10, "red").color, "red");
  assert.equal(G.nextColor({ red: 2 }, 20, "red").color, "blue");
  assert.equal(G.nextColor({ red: 2, blue: 1, yellow: 1 }, 40, "yellow").color, "yellow");
  assert.equal(G.nextColor({ red: 2, blue: 1, yellow: 4 }, 50, "yellow").color, "blue");
  assert.equal(G.nextColor({ red: 3, blue: 3, yellow: 4 }, 60, "yellow").color, "red", "toward 12 in all");
  assert.equal(G.nextColor({ red: 5, blue: 5, yellow: 5 }, 70, "red"), null);
});

test("steering: a fragment on the 1st or 5th slot in the color you need is worth more", () => {
  assert.equal(G.steer([], "red", 1, "red").score, 1);
  assert.equal(G.steer([], "blue", 1, "red").score, -1);
  assert.equal(G.steer(["red"], "blue", 1, "red").score, 0, "2nd slot doesn't decide");
  assert.equal(G.steer(["red", "red", "red"], "red", 2, "red").score, 1, "lands on the 5th");
});

test("warnings: year-end bonus below the year, and the goddess event", () => {
  assert.match(G.warnings({ red: 2, blue: 0, yellow: 1 }, 22, "red")[0], /Blue is below level 1/);
  const w = G.warnings({ red: 4, blue: 3, yellow: 3 }, 74, "red").join(" ");
  assert.match(w, /rare skill/); assert.match(w, /Firm Course Menace/);
});

test("the coach: Done logs a training's fragments; a full table's Wisdom is offered and raises its goddess", () => {
  let s = base({ turn: 30, gm: { table: [], levels: { red: 2, blue: 1, yellow: 1 }, skill: "red" }, facilities: facs({ speed: { cards: 3, rainbows: 1, extras: { frag: 2, fragColor: "red" } } }) });
  const r = E.recommend(s, gmSc), opt = r.ranked.find((o) => o.kind === "train" && o.stat === "speed");
  assert.ok(opt.notes.some((n) => /1st slot/.test(n)), "steering note");
  s = E.advance(s, gmSc, opt);
  assert.deepEqual(s.gm.table, ["red", "red"]);
  // A full, sure table: its Wisdom is offered without setting it by hand.
  const full = base({ turn: 40, gm: { table: ["red", "red", "red", "red", "red", "blue", "blue", "blue"], levels: { red: 2, blue: 1, yellow: 1 }, skill: "red" }, facilities: facs({ power: { cards: 4, rainbows: 1 } }) });
  const w = E.recommend(full, gmSc).ranked.find((o) => o.wisdomColor === "red");
  assert.ok(w, "Red Wisdom offered");
  const after = E.advance(full, gmSc, w);
  assert.equal(after.gm.levels.red, 3);
  assert.deepEqual(after.gm.table, []);
});

test("career model: about 9-11 Wisdoms a run, goddess levels and year-end races raise stats over a flat boost's", () => {
  const O = require("../optimizer.js"), D = require("../deck.js");
  const pick = (ty, n) => D.DATA.supports.filter((c) => c.r === 3 && c.ty === ty && D.onGlobal(c, "2026-11-19")).slice(-n);
  const deck = pick("speed", 3).concat(pick("power", 2), pick("stamina", 1)).map((card) => ({ card, lb: 4 }));
  const r = O.simulate(O.buildCtx({ scenario: gmSc, build: "medium", runs: 12 }), deck);
  assert.ok(r.grandMasters, "Grand Masters totals");
  assert.ok(r.grandMasters.wisdoms >= 8 && r.grandMasters.wisdoms <= 12.5, "wisdoms " + r.grandMasters.wisdoms);
  Object.values(r.grandMasters.levels).forEach((l) => assert.ok(l >= 0 && l <= 5));
  assert.ok(r.grandMasters.levels.red >= 3, "Red first");
  const flat = O.simulate(O.buildCtx({ scenario: gmSc, build: "medium", runs: 12, gmModel: false }), deck);
  assert.equal(flat.grandMasters, null);
  const tot = (x) => x.stats.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(tot(r) - tot(flat)) / tot(flat) < 0.15, "within 15% of the old flat boost: " + tot(r) + " vs " + tot(flat));
});

test("the daily data counts evolved skills (JP has them; Global none yet)", () => {
  const ev = require("../data/gametora.js").meta.evolved;
  assert.ok(ev && ev.jp > 0, "JP's evolved skills are listed");
  assert.ok(Number.isInteger(ev.global));
});

test("audit fixes: typed fragments with crystals, unique specialty multiplies, events halve past 1200", () => {
  const O = require("../optimizer.js"), D = require("../deck.js");
  // +1 per fragment of its type; a crystal of two colors gives +1.5 each, of one color +1 each.
  assert.deepEqual(O.gmFragBonus([{ t: 0, c: "red" }, { t: 0, c: "red" }, { t: 5, c: "blue" }]), [2, 0, 0, 0, 0, 1]);
  assert.deepEqual(O.gmFragBonus([{ t: 0, c: "red" }, { t: 2, c: "blue" }]), [1.5, 0, 1.5, 0, 0, 0]);
  // A card whose unique adds Specialty Priority shows up on its training more than the sum would give.
  const card = D.DATA.supports.find((c) => c.r === 3 && c.u && c.u.lv <= 50 && c.u.e.some((u) => u.type === 19) && ["speed", "stamina", "power", "guts", "wit"].includes(c.ty));
  assert.ok(card, "a card with a specialty unique");
  const ctx = O.buildCtx({ scenario: gmSc, build: "medium", runs: 2 });
  const r = O.simulate(ctx, [{ card, lb: 4 }]);
  assert.ok(r.stats.every((v) => v > 0));
  // Grand Masters stats stay under the caps and Speed past 1200 is reached more slowly than before.
  r.stats.forEach((v, i) => assert.ok(v <= gmSc.caps[i] + 1e-9));
});
