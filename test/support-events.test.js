const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const P = require("../support-events.js"), S = require("../skill-events.js"), D = require("../deck.js"), O = require("../optimizer.js");
const data = require("../data/card-events.js");
const sc = require("../scenarios.js").SCENARIOS.find((s) => s.id === "grandlive");
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
let serial = 990000;
function synthetic(chain, other = []) {
  const id = serial++, ids = [];
  const card = Object.assign({}, D.card(30002), { id, es: [900001, 900002], hs: [] });
  function put(events) { return events.map((e) => { const n = serial++; data.events[n] = Object.assign({ n: "Synthetic" }, e); ids.push(n); return n; }); }
  data.cards[id] = { chain: put(chain), other: put(other) };
  return { card, p: () => P.profile(card, 4), cleanup: () => { delete data.cards[id]; ids.forEach((n) => delete data.events[n]); } };
}
function situation(extra = {}) {
  const applied = [], levels = {};
  return Object.assign({ applied, levels, rewardValue: () => 0, skillValue: (ls) => Object.values(ls).reduce((n, lv) => n + lv * 100, 0), apply: (r) => { applied.push(r); Object.assign(levels, P.mergeHints(levels, r.reward.h)); } }, extra);
}

test("daily chain hazards reproduce the stated uncensored completion priors", () => {
  close(P.tail(4, 2, 0.5), 11 / 16);
  for (const days of [30, 78]) for (const stages of [1, 2, 3, 4]) for (const prior of [0.5, 0.65, 0.8]) close(P.tail(days, stages, P.hazard(days, stages, prior)), prior);
  assert.equal(P.hazard(78, 3, 0), 0); assert.equal(P.hazard(78, 3, 1), 1);
});

test("event random draws are reproducible and independent of call order", () => {
  const a = P.random(12345), b = P.random(12345);
  const values = [a(1, "chain"), a(2, "chain"), a(2, "ordinary:1")];
  assert.equal(b(2, "chain"), values[1]); assert.equal(b(1, "chain"), values[0]); assert.equal(b(2, "ordinary:1"), values[2]);
  assert.equal(new Set(values).size, 3); values.forEach((p) => assert.ok(p >= 0 && p < 1));
});

test("base and selected success/failure rewards remain one exclusive bundle", () => {
  const p = P.profile(D.card(30010), 4), event = p.chain[2];
  const [success, failure] = P.outcomes(event.c[0], {}, p, 0.5);
  assert.equal(success.reward.e, -10); assert.equal(failure.reward.e, -10);
  assert.deepEqual(success.reward.s, [0, 0, 0, 5, 10]); assert.deepEqual(failure.reward.s, [0, 0, 0, 5, 5]);
  assert.equal(success.reward.sp, 15); assert.equal(failure.reward.sp, 5);
  assert.deepEqual(success.reward.h, { 200581: 3 }); assert.deepEqual(failure.reward.h, { 200582: 1 });
});

test("LB ranges are not scaled twice and scalar bonuses do not amplify penalties or bond", () => {
  const p = { lb: 2, effects: { 25: 60, 26: 35 } };
  const r = P.reward([{ s: [10, -5, 0, 0, 0], sp: 10, e: 10, b: 5 }, { sp: -3, e: -5 }], p);
  assert.deepEqual(r.s, [13, -5, 0, 0, 0]); assert.equal(r.sp, 10); assert.equal(r.e, 11); assert.equal(r.b, 5);
  const ranged = P.reward([{ e: [10, 16], sp: [10, 20], s: [[10, 20], 0, 0, 0, 0] }], p);
  assert.equal(ranged.e, 13); assert.equal(ranged.sp, 15); assert.equal(ranged.s[0], 15);
});

test("a skill choice does not also grant the rejected stat reward", () => {
  const f = synthetic([], [{ c: [{ s: [30, 0, 0, 0, 0] }, { h: [[900001, 1]], b: 5 }] }]);
  try {
    const st = situation(); P.create(f.p(), { completion: 1, random: () => 0 }).tick(1, 0, st);
    assert.equal(st.applied.length, 1); assert.equal(st.applied[0].choice, 2);
    assert.deepEqual(st.applied[0].reward.s, [0, 0, 0, 0, 0]); assert.equal(st.applied[0].reward.b, 5);
    const stats = situation({ rewardValue: (r) => r.s[0] * 20, skillValue: () => 0 });
    P.create(f.p(), { completion: 1, random: () => 0 }).tick(1, 0, stats);
    assert.equal(stats.applied[0].choice, 1); assert.deepEqual(stats.applied[0].reward.h, {});
  } finally { f.cleanup(); }
});

test("resource choices can respond to current energy instead of a fixed card total", () => {
  const f = synthetic([], [{ c: [{ e: 20 }, { sp: 30 }] }]);
  try {
    for (const [energy, chosen] of [[10, 1], [100, 2]]) {
      const st = situation({ rewardValue: (r) => Math.min(100 - energy, r.e) * 2 + r.sp * 0.35 });
      P.create(f.p(), { completion: 1, random: () => 0 }).tick(1, 0, st); assert.equal(st.applied[0].choice, chosen);
    }
  } finally { f.cleanup(); }
});

test("a chain-ending failure gives only its actual reward and prevents later rewards", () => {
  const f = synthetic([{ c: [{ ok: { sp: 10, b: 7 }, ng: { sp: 2, end: true } }] }, { c: [{ sp: 50, h: [[900001, 5]] }] }]);
  try {
    const st = situation(), model = P.create(f.p(), { completion: 1, success: 0, random: () => 0 });
    model.tick(1, 0, st); model.tick(2, 0, st); model.tick(3, 0, st);
    assert.equal(st.applied.length, 1); assert.equal(st.applied[0].branch, "failure");
    assert.equal(st.applied[0].reward.sp, 2); assert.equal(st.applied[0].reward.b, 0); assert.deepEqual(st.levels, {});
    assert.equal(model.state.ended, true); assert.equal(model.state.stage, 1);
  } finally { f.cleanup(); }
});

test("continuation value can preserve a chain instead of taking a small ending reward", () => {
  const f = synthetic([{ c: [{ e: 5, end: true }, {}] }, { c: [{ h: [[900001, 3]], sp: 20 }] }]);
  try {
    const st = situation({ rewardValue: (r) => r.e + r.sp * 0.35 }), model = P.create(f.p(), { completion: 1, random: () => 0 });
    model.tick(1, 0, st); model.tick(2, 0, st);
    assert.equal(st.applied[0].choice, 2); assert.equal(st.applied[0].reward.e, 0); assert.equal(st.applied[1].reward.sp, 20);
  } finally { f.cleanup(); }
});

test("chain order, one chain step per turn and once-only ordinary events are preserved", () => {
  const f = synthetic([{ c: [{ sp: 1 }] }, { c: [{ sp: 2 }] }, { c: [{ sp: 3 }] }], [{ c: [{ sp: 4 }] }]);
  try {
    const st = situation(), model = P.create(f.p(), { completion: 1, random: () => 0 });
    for (const t of [1, 1, 2, 3, 4]) model.tick(t, 0, st);
    assert.deepEqual(st.applied.filter((r) => r.kind === "chain").map((r) => [r.turn, r.stage, r.reward.sp]), [[1, 1, 1], [2, 2, 2], [3, 3, 3]]);
    assert.equal(st.applied.filter((r) => r.kind === "ordinary").length, 1);
    const short = situation(), expired = P.create(Object.assign({}, f.p(), { chain: [] }), { days: 1, random: (turn) => turn === 1 ? 0.99 : 0 });
    expired.tick(1, 0, short); expired.tick(2, 0, short);
    assert.equal(short.applied.length, 0, "an event cannot arrive after the career horizon");
  } finally { f.cleanup(); }
});

test("song-rate assumptions affect only active chain clocks", () => {
  const f = synthetic([{ c: [{ sp: 5 }] }], [{ c: [{ sp: 9 }] }]);
  try {
    const h = P.hazard(78, 1, 0.8), draw = (h + 1 - Math.pow(1 - h, 1.5)) / 2;
    const base = situation(), boosted = situation();
    P.create(f.p(), { songBoost: 0.5, random: () => draw }).tick(1, 0, base);
    P.create(f.p(), { songBoost: 0.5, random: () => draw }).tick(1, 1, boosted);
    assert.equal(base.applied.length, 0); assert.equal(boosted.applied.length, 1); assert.equal(boosted.applied[0].kind, "chain");
  } finally { f.cleanup(); }
});

test("Independent Training's late-chain gate does not erase earlier rewards", () => {
  const f = synthetic([{ c: [{ sp: 1 }] }, { c: [{ sp: 2 }] }, { c: [{ sp: 3 }] }]);
  try {
    const st = situation(), model = P.create(f.p(), { completion: 1, independent: true, random: (turn, key) => key === "late-chain" ? 0.9 : 0 });
    for (let turn = 1; turn <= 5; turn++) model.tick(turn, 0, st);
    assert.deepEqual(st.applied.map((r) => r.reward.sp), [1, 2]);
  } finally { f.cleanup(); }
});

test("random-stat rewards select the stated number of distinct stats", () => {
  const f = synthetic([{ c: [{ r: 10, rn: 3 }] }]);
  try {
    const st = situation(); P.create(f.p(), { completion: 1, random: () => 0 }).tick(1, 0, st);
    assert.deepEqual(st.applied[0].reward.s, [10, 10, 10, 0, 0]);
  } finally { f.cleanup(); }
});

test("Nakayama Festa's final reward follows the actual first choice and success result", () => {
  const p = P.profile(D.card(30043), 4), choice = p.chain[2].c[0];
  const first = P.outcomes(choice, { 1: 1 }, p, 0.5);
  assert.equal(first.length, 1); assert.equal(first[0].reward.sp, 40); assert.equal(first[0].reward.b, 5);
  assert.deepEqual(first[0].reward.h, { 201591: 1 }); assert.deepEqual(first[0].reward.s, [0, 0, 0, 0, 0]);
  const [ok, ng] = P.outcomes(choice, { 1: 2 }, p, 0.5);
  assert.equal(ok.reward.sp, 20); assert.deepEqual(ok.reward.s, [0, 15, 0, 15, 0]); assert.deepEqual(ok.reward.h, { 201701: 3 });
  assert.equal(ng.reward.sp, 0); assert.equal(ng.reward.mo, -1); assert.deepEqual(ng.reward.s, [0, 0, 0, 10, 0]); assert.deepEqual(ng.reward.h, { 201702: 3 });
});

test("event parser retains prior-choice dependencies instead of flattening their rewards", () => {
  const source = "Selected Choice 1 for 1st event: Skill points +40, Bond +5, <skill:201591> Hint +1\nSelected Choice 2 for 1st event (Success): Stamina +15, Guts +15, Skill points +20, Bond +5, <skill:201701> Hint +3\nSelected Choice 2 for 1st event (Failure): Mood -1, Guts +10, Bond +5, <skill:201702> Hint +3";
  const code = "import importlib.util,json,sys; sys.dont_write_bytecode=True; s=importlib.util.spec_from_file_location('e','tools/build_card_events.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.parse_choice(sys.stdin.read())))";
  const parsed = JSON.parse(execFileSync("python", ["-c", code], { cwd: require("node:path").resolve(__dirname, ".."), input: source, encoding: "utf8" }));
  assert.deepEqual(parsed, data.events[830043004].c[0]);
  const bold = source.replace(/(Selected Choice [^:]+):/g, "'''$1''':");
  assert.deepEqual(JSON.parse(execFileSync("python", ["-c", code], { cwd: require("node:path").resolve(__dirname, ".."), input: bold, encoding: "utf8" })), parsed);
  // The wiki's current markup: bold labels with the outcome in italics.
  const italic = bold.replace(/\((Success|Failure)\)/g, "''($1)''");
  assert.deepEqual(JSON.parse(execFileSync("python", ["-c", code], { cwd: require("node:path").resolve(__dirname, ".."), input: italic, encoding: "utf8" })), parsed);
  const text = require("../engine.js").eventText(parsed, 4); assert.match(text, /if choice 1 was selected/); assert.match(text, /on failure/);
  const offers = D.skillOffers(); S.add(offers, D.card(30043), { skills: { 201701: 10 }, known: new Set(), costs: {}, must: [] }, { success: 1 });
  close(offers.values().find((s) => s.id === "201701").p, 0.8); assert.equal(offers.values().some((s) => s.id === "201591"), false);
});

test("incomplete records and non-Hello Friend/Group cards retain whole-card fallback", () => {
  const f = synthetic([{ n: "Missing results" }], [{ c: [{ sp: 10 }] }]);
  try {
    assert.equal(f.p().mode, "aggregate"); const st = situation(); P.create(f.p(), { completion: 1, random: () => 0 }).tick(1, 0, st); assert.equal(st.applied.length, 0);
    const opts = { scenario: sc, build: "medium", runs: 2 };
    const a = O.simulate(O.buildCtx(opts), [{ card: f.card, lb: 4 }]);
    const b = O.simulate(O.buildCtx(Object.assign({}, opts, { coupledEvents: false })), [{ card: f.card, lb: 4 }]);
    assert.deepEqual(a.stats, b.stats); assert.equal(a.sp, b.sp); assert.deepEqual(a.hints, b.hints);
    assert.equal(a.supportEvents.cards[0].mode, "aggregate");
    assert.equal(P.profile(D.card(30067), 4).mode, "aggregate");
  } finally { f.cleanup(); }
});

test("coupled cards do not also receive their legacy aggregate stat/SP/energy/bond totals", () => {
  const f = synthetic([{ c: [{ sp: 10, b: 5, s: [5, 0, 0, 0, 0] }] }]);
  try {
    const opts = { scenario: sc, build: "medium", runs: 3 };
    const a = O.simulate(O.buildCtx(opts), [{ card: Object.assign({}, f.card, { ev: [0, 0, 0, 0, 0, 0, 0, 0] }), lb: 4 }]);
    const b = O.simulate(O.buildCtx(opts), [{ card: Object.assign({}, f.card, { ev: [999, 999, 999, 999, 999, 999, 999, 999] }), lb: 4 }]);
    assert.deepEqual(a, b); assert.equal(a.supportEvents.cards[0].mode, "coupled");
  } finally { f.cleanup(); }
});

test("career ledgers and purchase hints use the same exclusive events and capped rewards", () => {
  const card = Object.assign({}, D.card(30010), { hs: [] });
  const opts = { scenario: sc, build: "medium", runs: 24, skills: { 200581: 4, 200582: 1 } };
  const r = O.simulate(O.buildCtx(opts), [{ card, lb: 4 }]); let ok = 0, ng = 0;
  r.skillBudget.plans.forEach((plan) => {
    plan.eventTrace.forEach((event) => {
      assert.equal(event.after.sp - event.before.sp, event.credited.sp);
      assert.equal(event.after.bond - event.before.bond, event.credited.b);
      assert.equal(event.after.energy - event.before.energy, event.credited.energy);
      assert.ok(event.after.energy >= 0 && event.after.energy <= event.after.maxEnergy);
      assert.ok(event.after.bond >= 0 && event.after.bond <= 100);
      event.after.stats.forEach((n, i) => assert.ok(n >= 0 && n <= sc.caps[i]));
      if (event.event !== 830010003) return;
      if (event.branch === "success") { ok++; assert.equal(event.reward.sp, 15); assert.equal(plan.hintLevels[200581], 3); assert.equal(plan.hintLevels[200582], undefined); }
      else { ng++; assert.equal(event.reward.sp, 5); assert.equal(plan.hintLevels[200582], 1); assert.equal(plan.hintLevels[200581], undefined); }
    });
    assert.ok(plan.spent <= plan.budget);
  });
  assert.ok(ok && ng, "both conditional outcomes are represented");
  assert.ok(r.supportEvents.cards[0].totals.wastedBond > 0, "bond cap losses are reported");
});

test("an event raises max energy before recovery and reports actual overflow", () => {
  const f = synthetic([{ c: [{ me: 4, e: 1000, b: 200, mo: 10 }] }]);
  try {
    const r = O.simulate(O.buildCtx({ scenario: sc, build: "medium", runs: 8 }), [{ card: f.card, lb: 4 }]);
    const events = r.skillBudget.plans.flatMap((p) => p.eventTrace);
    assert.ok(events.length > 0);
    events.forEach((event) => {
      assert.equal(event.before.maxEnergy, 100); assert.equal(event.after.maxEnergy, 104); assert.equal(event.after.energy, 104);
      assert.equal(event.credited.energy, 104 - event.before.energy); assert.equal(event.credited.me, 4);
      assert.equal(event.after.bond, 100); assert.equal(event.after.mood, 4);
      assert.equal(event.credited.mo, 4 - event.before.mood);
    });
    assert.ok(r.supportEvents.cards[0].totals.wastedEnergy > 500);
  } finally { f.cleanup(); }
});
