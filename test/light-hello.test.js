const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../deck.js");
const H = require("../light-hello.js");
const E = require("../engine.js");
const O = require("../optimizer.js");
const T = require("../tiers.js");
const GC = require("../grand-concert.js");
const { SCENARIOS } = require("../scenarios.js");
const gl = SCENARIOS.find((s) => s.id === "grandlive");
const profile = (id, lb) => H.profile(D.card(id), lb);
const facilities = () => E.STATS.map((stat) => ({ stat, gain: null, fail: 0, members: [], hints: [], extra: 0, extras: {} }));
function state(id = 30052, lb = 4, done = 0) {
  return { turn: 30, energy: 20, maxEnergy: 100, mood: 2, build: "medium", risk: 12, goals: [], goalRace: false, extras: {}, stats: { speed: 400, stamina: 400, power: 400, guts: 400, wit: 400 }, trackStats: true, caps: {}, calib: [], log: [], facilities: facilities(), gl: { songs: {}, tokens: [50, 20, 40, 30, 60], lessons: {} }, deck: { slots: [{ id, lb, bond: 90, met: true, dates: { unlocked: true, done } }] } };
}
const outing = (st) => E.evaluate(st, gl).options.find((o) => o.outing != null);
const cards = (id = 30052, lb = 4) => [30002, 30016, 30010, 30078, 30043, id].map((cardId) => ({ card: D.card(cardId), lb: cardId === id ? lb : 4 }));

test("Hello base events are scaled once, rounded down, at every limit break", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((lb) => profile(30052, lb).first.s[0]), [12, 12, 13, 13, 13]);
  assert.deepEqual([0, 1, 2, 3, 4].map((lb) => profile(30052, lb).dates[0].opts[0].e), [35, 36, 37, 38, 40]);
  assert.equal(profile(10083, 4).first.s[0], 12);
  assert.equal(profile(10083, 4).dates[2].opts[0].e, 70);
  assert.equal(profile(30052, 4).dates[4].opts[0].e, 48);
  assert.equal(profile(30052, 4).dates[4].opts[1].e, 32);
  assert.equal(profile(30052, 4).dates[4].opts[0].s[0], 13);
  assert.equal(profile(30052, 4).repeat.sp, 4);
  assert.equal(profile(30052, 0).unlock.e, 21);
  assert.equal(profile(10083, 4).unlock.e, 21);
});

test("R and SSR give their own fifth-outing skill; neither outcome loses it", () => {
  for (const [id, skill] of [[30052, 201662], [10083, 201661]]) {
    const p = profile(id, 4);
    assert.deepEqual(p.dates[4].opts.map((o) => o.h[0]), [[skill, 3], [skill, 1]]);
    const event = E.cardEvents(id, 4, gl).chain[4].c[0];
    assert.equal(event.ok.h[0][0], skill);
    assert.equal(event.ng.h[0][0], skill);
  }
});

test("Hello's 10% and 30-point unique add to 40% only when present on a rainbow", () => {
  const hello = D.card(30052), speed = D.card(30028);
  const h = { card: hello, level: 50, bond: 30 };
  const s = { card: speed, level: 50, bond: 80 };
  assert.equal(D.effectsIn(hello, 50, { rainbow: true, bond: 30 })[28], 40);
  assert.equal(D.effectsIn(hello, 50, { rainbow: false, bond: 100 })[28], 10);
  const g = D.trainingGain(gl.train.speed, "speed", [h, s], { facilityLevel: 1, mood: 4 });
  assert.equal(g.energy, -12, "19 base cost with 40% reduction, rounded to an integer cost");
  const without = D.trainingGain(gl.train.speed, "speed", [s], { facilityLevel: 1, mood: 4 });
  assert.equal(without.energy, -19);
  assert.equal(D.effectsIn(D.card(10083), 40, { rainbow: true })[28], 10);
  assert.equal(D.isRainbow(hello, 100, "speed"), false, "Hello herself never rainbows");
});

test("token forecasts separate first training, estimated repeats and actual saved balances", () => {
  const st = state(); const f = st.facilities[0]; f.members = [0];
  assert.equal(E.tokenGain(f, st, gl, true).filter((t) => t.lh).reduce((a, t) => a + t.amount, 0), 8);
  assert.equal(E.tokenGain(f, st, gl, false).some((t) => t.lh), false);
  st.deck.slots[0].met = false; st.deck.slots[0].dates.unlocked = false;
  assert.equal(E.tokenGain(f, st, gl, true).some((t) => t.lh), false);
  st.turn = 4;
  assert.deepEqual(E.tokenGain(f, st, gl, true), []);
  const rare = state(10083); rare.facilities[0].members = [0];
  assert.equal(E.tokenGain(rare.facilities[0], rare, gl, true).filter((t) => t.lh).reduce((a, t) => a + t.amount, 0), 4);
});

test("observed Hello events record tokens, scaled Guts/SP, extra bond and optional mood once", () => {
  const st = state();
  const ev = E.recordHelloEvent(st, gl, { amount: 20, mood: true });
  assert.equal(ev.type, 1);
  assert.equal(st.gl.tokens[1], 40);
  assert.equal(st.stats.guts, 404);
  assert.equal(ev.sp, 4);
  assert.equal(st.deck.slots[0].bond, 97);
  assert.equal(st.mood, 3);
  assert.equal(st.extras.lh20, true);
  assert.equal(E.recordHelloEvent(st, gl, { amount: 20, type: 1 }), null);
  const rare = state(10083);
  assert.equal(E.recordHelloEvent(rare, gl, { amount: 10 }).amount, 10);
  assert.equal(rare.extras.lh20, undefined);
  const invalid = state(), before = JSON.stringify(invalid);
  assert.equal(E.recordHelloEvent(invalid, gl, { amount: 10 }), null);
  assert.equal(JSON.stringify(invalid), before);
});

test("observed event ties require a type and token caps do not suppress bond/stat rewards", () => {
  const st = state(); st.gl.tokens = [0, 0, 0, 0, 0];
  assert.equal(E.recordHelloEvent(st, gl, { amount: 20 }), null);
  st.gl.tokens = [249, 249, 249, 249, 249];
  const ev = E.recordHelloEvent(st, gl, { amount: 20, type: 4 });
  assert.equal(ev.credited, 1); assert.equal(st.gl.tokens[4], 250); assert.equal(st.stats.guts, 404);
});

test("a raised bond alone does not claim Hello's first training already happened", () => {
  const st = state(30052, 0);
  st.turn = 6; st.energy = 95; st.deck.slots[0].met = false; st.deck.slots[0].dates = { unlocked: false, done: 0 };
  st.facilities[3].members = [0];
  const option = E.recommend(st, gl).action;
  assert.equal(option.stat, "guts");
  assert.deepEqual(option.firstEvent.stats, { speed: 12, guts: 12 });
  const next = E.advance(st, gl, option);
  assert.equal(next.stats.speed, Math.round(400 + (option.statGains.speed || 0)) + 12);
  assert.equal(next.deck.slots[0].met, true);
  assert.equal(next.deck.slots[0].dates.unlocked, false);
});

test("fifth outing applies the observed outcome and Undo restores its hint and outing count", () => {
  for (const [result, energy, stats, hint] of [["success", 52, 406, 1], ["great", 68, 413, 3]]) {
    const st = state(30052, 4, 4);
    const next = E.advance(st, gl, outing(st), undefined, { outing: result });
    assert.equal(next.energy, energy);
    assert.equal(next.stats.speed, stats);
    assert.equal(next.stats.guts, stats);
    assert.equal(next.mood, 3);
    assert.equal(next.gl.hints[201662], hint);
    assert.equal(next.deck.slots[0].dates.done, 5);
    assert.deepEqual(E.undo(next), st);
  }
  const st = state(10083, 4, 4);
  const next = E.advance(st, gl, outing(st));
  assert.equal(next.gl.hints[201661], 1);
  assert.equal(next.gl.hints[201662], undefined);
});

test("first outing raises the energy cap before recovery; outings are unavailable at camp", () => {
  const st = state(); st.energy = 95;
  const next = E.advance(st, gl, outing(st));
  assert.equal(next.maxEnergy, 104); assert.equal(next.energy, 104);
  st.turn = 38;
  assert.equal(outing(st), undefined);
});

test("concert economy preserves currency, delays live buffs and holds an offered song", () => {
  const ctx = O.buildCtx({ scenario: gl, build: "medium", runs: 1 });
  const econ = GC.create(ctx, () => 0.2); const events = [];
  econ.start(5, (e) => events.push(e));
  assert.deepEqual(econ.state.tokens, [10, 10, 10, 10, 10]);
  for (let i = 0; i < 5; i++) econ.add(i, 500);
  econ.shop(5, 100, 100, (e) => events.push(e));
  assert.equal(econ.state.friendship, 0);
  econ.end(24, (e) => events.push(e));
  assert.equal(econ.state.specialty >= 5, true);
  assert.equal(econ.state.concerts, 1);
  for (let i = 0; i < 5; i++) assert.ok(Math.abs(econ.state.earned[i] - econ.state.spent[i] - econ.state.tokens[i] - econ.state.wasted[i]) < 1e-8);
  assert.equal(events.some((e) => e.sp > 0), true);
});

test("Grand Concert simulations include Hello's lifecycle without a flat scenario multiplier", () => {
  const ctx = O.buildCtx({ scenario: gl, build: "medium", runs: 12, skills: { 201662: 2 } });
  assert.equal(ctx.boost, 1);
  const r = O.simulate(ctx, cards());
  assert.equal(r.grandConcert.model, "discrete-lessons-v1");
  assert.ok(r.grandConcert.helloTokens > 0);
  assert.ok(r.grandConcert.helloEnergySaved > 0);
  assert.ok(r.grandConcert.helloOutings > 0);
  assert.ok(r.grandConcert.techniques > 0 && r.grandConcert.songs > 1);
  assert.ok(r.outings <= 5 && r.grandConcert.helloCompletions <= 1);
  const used = r.trainMix.reduce((a, n) => a + n, 0) + r.rests + r.outings + r.recreations + r.requiredRaces + r.races;
  assert.ok(Math.abs(used - 78) < 1e-8, "every turn must be accounted for: " + used);
  for (let i = 0; i < 5; i++) assert.ok(r.grandConcert.earnedTokens[i] >= r.grandConcert.spentTokens[i]);
  assert.ok(r.stats.every((n, i) => n <= ctx.caps[E.STATS[i]]));
});

test("changing probability assumptions changes only the simulator, with zero-rate procs absent", () => {
  const r = O.simulate(O.buildCtx({ scenario: gl, build: "medium", runs: 4, helloProcRate: 0, helloUnlockRate: 0 }), cards());
  assert.equal(r.grandConcert.helloEvents, 0); assert.equal(r.grandConcert.helloTokens, 0); assert.equal(r.outings, 0);
  assert.equal(r.skills.some((s) => s.id === "201662"), false);
  const plain = O.simulate(O.buildCtx({ scenario: gl, build: "medium", runs: 4 }), cards(30028));
  assert.equal(plain.grandConcert.helloTokens, 0); assert.equal(plain.grandConcert.helloEnergySaved, 0); assert.equal(plain.outings, 0);
});

test("simulated results do not depend on slot order or mutate the reusable context", () => {
  const ctx = O.buildCtx({ scenario: gl, build: "medium", runs: 4 });
  const before = Object.keys(ctx).join();
  const a = O.simulate(ctx, cards()), b = O.simulate(ctx, cards().reverse());
  assert.deepEqual(a.stats, b.stats); assert.deepEqual(a.grandConcert, b.grandConcert); assert.equal(a.sp, b.sp);
  assert.equal(Object.keys(ctx).join(), before);
});

test("target search returns the calendar and Hello diagnostics used for its displayed stats", () => {
  const start = cards().map((c) => ({ id: c.card.id, lb: c.lb }));
  const search = O.targetSearch({ scenario: "GL", skills: {}, locked: start.map((c) => c.id) }, { scenario: gl, build: "medium", target: { speed: 1500 } }, start, start, []);
  const result = search.result();
  assert.equal(result.after.runs, result.validation.heldOut.runs); assert.ok(result.after.calendarAssumptions); assert.ok(result.after.grandConcert);
  assert.equal(result.after.grandConcert.model, "discrete-lessons-v1");
});

test("accepting Hello's outings does not also cover the rejection-only Maverick hint", () => {
  const r = T.deckSkills({ scenario: "GL", skills: { 200272: 3 }, must: [200272] }, [{ id: 30052, lb: 4 }]);
  assert.equal(r.value, 0);
  assert.equal(r.must[0].p, 0);
});
