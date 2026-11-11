// Tests for the deck optimizer, CM/LoH presets, skill values and the owned-card backup code.
const test = require("node:test");
const assert = require("node:assert");
const D = require("../deck.js");
const O = require("../optimizer.js");
const PRESETS = require("../data/presets.js");
const SV = require("../data/skillvalues/index.js");
const { SCENARIOS } = require("../scenarios.js");

const TODAY = "2026-10-06";
const ura = SCENARIOS.find((s) => s.id === "ura");
const globalCards = (r) => D.DATA.supports.filter((c) => D.onGlobal(c, TODAY) && (!r || c.r === r));
const pick = (pred) => D.DATA.supports.find(pred);

test("every card and trainee has a character id, so duplicates can be blocked", () => {
  assert.ok(D.DATA.supports.every((c) => c.cid > 0));
  assert.ok(D.DATA.trainees.every((t) => t.cid > 0));
});

test("optimizer returns 6 legal cards: no character twice, never the trainee's own character", () => {
  const trainee = D.DATA.trainees.find((t) => t.en && globalCards(3).some((c) => c.cid === t.cid));
  const pool = globalCards(3).slice(0, 60).concat(globalCards(3).filter((c) => c.cid === trainee.cid)).map((c) => ({ id: c.id, lb: 4 }));
  const r = O.runJob({ job: "optimize", opts: { scenario: "ura", build: "medium", trainee: trainee.id, runs: 4 }, pool, borrowPool: [] });
  assert.strictEqual(r.cards.length, 6);
  const cids = r.cards.map((c) => D.card(c.id).cid);
  assert.strictEqual(new Set(cids).size, 6, "a character appears twice");
  assert.ok(!cids.includes(trainee.cid), "the trainee's own character is in the deck");
});

test("locked cards stay in the deck and the borrowed card fills the last slot", () => {
  const pool = globalCards(3).slice(0, 40).map((c) => ({ id: c.id, lb: 3 }));
  const lock = pool[pool.length - 1].id;
  const borrow = globalCards(3).slice(40, 80).map((c) => ({ id: c.id, lb: 4 }));
  const r = O.runJob({ job: "optimize", opts: { scenario: "ura", build: "mile", runs: 4, locked: [lock], borrow: true }, pool, borrowPool: borrow });
  assert.ok(r.cards.some((c) => c.id === lock));
  assert.strictEqual(r.cards.filter((c) => c.borrowed).length, 1);
  assert.strictEqual(r.cards.find((c) => c.borrowed).lb, 4);
});

test("a better limit break never scores lower", () => {
  const card = pick((c) => c.id === 30028) || globalCards(3)[0];
  const others = globalCards(3).filter((c) => c.cid !== card.cid).slice(0, 5).map((c) => ({ card: c, lb: 4 }));
  const ctx = O.buildCtx({ scenario: ura, build: "medium", runs: 6 });
  const low = O.simulate(Object.assign({}, ctx), others.concat([{ card, lb: 0 }])).value;
  const high = O.simulate(Object.assign({}, ctx), others.concat([{ card, lb: 4 }])).value;
  assert.ok(high >= low, `LB4 ${high} < LB0 ${low}`);
});

test("simulated careers rest, race and spread training like a real run", () => {
  const deck = globalCards(3).filter((c) => ["speed", "stamina", "power", "wit"].includes(c.ty)).slice(0, 6).map((c) => ({ card: c, lb: 4 }));
  const r = O.simulate(O.buildCtx({ scenario: ura, build: "medium", runs: 8 }), deck);
  assert.ok(r.rests >= 4 && r.rests <= 25, "rests " + r.rests);
  assert.ok(r.races >= 2, "races " + r.races);
  assert.ok(r.stats.every((x) => x > 150), "stats " + r.stats);
});

test("skill values raise a deck whose cards hint skills that are good on the course", () => {
  const card = globalCards(3).find((c) => (c.hs || []).length);
  const others = globalCards(3).filter((c) => c.cid !== card.cid).slice(0, 5).map((c) => ({ card: c, lb: 4 }));
  const deck = others.concat([{ card, lb: 4 }]);
  const skills = {};
  card.hs.forEach((id) => { skills[id] = 2.0; });
  const base = O.simulate(O.buildCtx({ scenario: ura, build: "medium", runs: 4 }), deck);
  const withSkills = O.simulate(O.buildCtx({ scenario: ura, build: "medium", runs: 4, skills }), deck);
  assert.ok(withSkills.value > base.value);
  assert.ok(withSkills.skills.some((s) => card.hs.includes(+s.id) && s.p > 0));
});

test("wishlist only suggests swaps that improve the deck", () => {
  const pool = globalCards(2).slice(0, 12).map((c) => ({ id: c.id, lb: 0 }));
  const opt = O.runJob({ job: "optimize", opts: { scenario: "ura", build: "medium", runs: 4 }, pool, borrowPool: [] });
  const candidates = globalCards(3).slice(0, 25).map((c) => ({ id: c.id, lb: 4 }));
  const w = O.runJob({ job: "wishlist", opts: { scenario: "ura", build: "medium", runs: 4 }, deck: opt.cards, candidates, swapSlots: [0, 1] });
  assert.ok(w.list.length > 0, "SSRs at LB4 should beat LB0 SRs");
  assert.ok(w.list.every((x) => x.gain > 0));
});

test("presets: every CM has a course, dates and a build; Global dates run in order", () => {
  const cms = PRESETS.list.filter((p) => p.kind === "cm").sort((a, b) => a.no - b.no);
  assert.ok(cms.length >= 49);
  cms.forEach((p) => {
    assert.ok(p.course.id && p.course.distance && p.course.track, p.id);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(p.global.start) && p.global.end >= p.global.start, p.id);
    assert.ok(["sprint", "mile", "medium", "long", "dirt"].includes(p.build), p.id);
  });
  for (let i = 1; i < cms.length; i++) assert.ok(cms[i].global.start > cms[i - 1].global.start, cms[i].id + " is out of order");
  const sag = cms.find((p) => p.no === 20);
  assert.strictEqual(sag.name, "Sagittarius Cup 2");
  // GameTora's record of the race start (the Umalator's preset said 2026-10-07, its announcement).
  assert.strictEqual(sag.global.start, "2026-10-10");
  assert.strictEqual(sag.course.track, "Nakayama");
  assert.strictEqual(sag.course.distance, 2500);
  assert.ok(!sag.global.est);
  assert.ok(cms.filter((p) => p.no > 21).every((p) => p.global.est), "unannounced cups must be marked as estimates");
  const loh = PRESETS.list.filter((p) => p.kind === "loh");
  assert.ok(loh.length >= 5 && loh.every((p) => p.global.est && p.jp.start));
});

test("skill values: ready presets exist on disk with every running style", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  assert.ok(SV.ready.length >= 1);
  SV.ready.forEach((id) => {
    const v = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "skillvalues", id + ".json"), "utf8"));
    SV.meta.strategies.forEach((st) => {
      assert.ok(Array.isArray(v[st]) && v[st].length > 20, id + " " + st);
      v[st].forEach(([sid]) => assert.ok(SV.skills[sid], "no name for skill " + sid));
    });
  });
});

test("owned-card backup code round-trips and rejects junk", () => {
  const ids = globalCards(3).slice(0, 5).map((c) => c.id);
  const owned = { [ids[0]]: 0, [ids[1]]: 4, [ids[2]]: 2 };
  const code = D.encodeOwned(owned);
  assert.ok(code.startsWith("UMA1:"));
  assert.deepStrictEqual(D.decodeOwned(code), Object.fromEntries(Object.entries(owned).map(([k, v]) => [k, v])));
  assert.strictEqual(D.decodeOwned("hello"), null);
  assert.deepStrictEqual(D.decodeOwned("UMA1:zzzzzz9"), {});
});

test("pasted Umalator charts are read by median, including names on their own line", () => {
  const names = { 202481: "Beast Mode", 200012: "Right-Handed ○", 900681: "Victory Cheer! (inherited)" };
  const text = "Skill name\tMinimum\tMaximum\tMean\tMedian\tSP Cost\nBeast Mode\t3.86 L\t4.00 L\t3.93 L\t3.92 L\t180\nRight-Handed ○\n0.40 L\t0.45 L\t0.43 L\t0.44 L\t90\nVictory Cheer!\t1.80 L\t2.10 L\t1.95 L\t1.96 L\nMystery\t1 L\t1 L\t1 L\t1 L";
  const r = O.parseChart(text, names);
  assert.strictEqual(r.values[202481], 3.92);
  assert.strictEqual(r.values[200012], 0.44);
  assert.strictEqual(r.values[900681], 1.96);
  assert.strictEqual(r.unknown, 1);
});

test("tier list ranks every limit break, never lower for a higher LB, and skips characters already in the deck", () => {
  const speed = globalCards(3).filter((c) => c.ty === "speed").slice(0, 8);
  const candidates = [];
  speed.forEach((c) => { for (let lb = 0; lb <= 4; lb++) candidates.push({ id: c.id, lb }); });
  const deck = [{ id: speed[0].id, lb: 4 }];
  const r = O.runJob({ job: "tiers", opts: { scenario: "ura", build: "mile", runs: 6 }, deck, candidates });
  assert.ok(!r.list.some((x) => D.card(x.id).cid === speed[0].cid), "a card of a character already in the deck was ranked");
  assert.strictEqual(r.list.length, (speed.length - 1) * 5);
  const by = {};
  r.list.forEach((x) => { (by[x.id] = by[x.id] || [])[x.lb] = x.score; });
  Object.values(by).forEach((a) => { for (let i = 1; i < 5; i++) assert.ok(a[i] >= a[i - 1]); });
  for (let i = 1; i < r.list.length; i++) assert.ok(r.list[i].score <= r.list[i - 1].score);
});

test("event rewards: listed cards use the event table, others the rarity fallback", () => {
  const listed = D.DATA.supports.find((c) => c.ev);
  const ev = D.eventRewards(listed);
  assert.ok(ev.known && ev.bond === listed.ev[7] && ev.sp === listed.ev[5] && ev.energy === listed.ev[6]);
  const missing = D.DATA.supports.find((c) => !c.ev && c.r === 3);
  assert.deepStrictEqual(D.eventRewards(missing), { stats: [9, 9, 9, 9, 9], sp: 0, energy: 0, bond: 5, known: false });
});

test("skills the trainee already has (unique, innate, awakening) add no value from card hints", () => {
  const t = D.DATA.trainees.find((x) => x.en && x.is.length && D.DATA.supports.some((c) => (c.hs || []).includes(x.is[0]) && c.cid !== x.cid));
  const sk = t.is[0];
  const card = D.DATA.supports.find((c) => (c.hs || []).includes(sk) && c.cid !== t.cid);
  const ctx = (tr) => O.buildCtx({ scenario: ura, build: "medium", runs: 4, trainee: tr, skills: { [sk]: 2 } });
  assert.ok(O.simulate(ctx(null), [{ card, lb: 4 }]).skills.some((s) => +s.id === sk));
  assert.ok(!O.simulate(ctx(t.id), [{ card, lb: 4 }]).skills.some((s) => +s.id === sk));
});

test("deck makeup: the optimizer builds exactly the counts you fix, borrowed card included", () => {
  const pool = globalCards().filter((c) => c.r >= 2).map((c) => ({ id: c.id, lb: 4 }));
  const borrow = globalCards(3).map((c) => ({ id: c.id, lb: 4 }));
  const comp = { speed: 2, stamina: 2, wit: 1, friend: 1 };
  const r = O.runJob({ job: "optimize", opts: { scenario: "ura", build: "long", runs: 4, borrow: true, comp }, pool, borrowPool: borrow });
  const n = {};
  r.cards.forEach((c) => { const t = D.card(c.id).ty; n[t] = (n[t] || 0) + 1; });
  assert.deepStrictEqual(n, comp);
  assert.ok(r.runnersUp.every((a) => D.card(a.in).ty === D.card(a.out).ty), "an alternative broke the makeup");
  assert.throws(() => O.runJob({ job: "optimize", opts: { scenario: "ura", build: "long", runs: 4, comp: { group: 5 } }, pool: pool.slice(0, 20), borrowPool: [] }), /Not enough cards/);
});

// ---- Target stats ----
const Tiers = require("../tiers.js");
const gl = SCENARIOS.find((s) => s.id === "grandlive");
const pool4 = () => globalCards().filter((c) => c.r >= 2).map((c) => ({ id: c.id, lb: 4 }));
const runSearch = (opts, sim, start, pool) => { const s = O.targetSearch(opts, sim, start, pool, []); while (s.next()); return s.result(); };

test("target fit: points short count, big misses and the build's main stats count more", () => {
  const ctx = O.buildCtx({ scenario: ura, build: "medium", target: { speed: 1200, stamina: 800, power: 800, guts: 600, wit: 800 } });
  const at = (stats) => O.targetFit(ctx, stats, 0);
  assert.strictEqual(at([1200, 800, 800, 600, 800]).short, 0);
  assert.strictEqual(at([1100, 700, 800, 600, 800]).short, 200);
  assert.ok(at([1000, 800, 800, 600, 800]).value < at([1100, 700, 800, 600, 800]).value, "one 200 miss is worse than two 100 misses");
  assert.ok(at([1100, 800, 800, 600, 800]).value < at([1200, 800, 800, 500, 800]).value, "100 short in Speed is worse than 100 short in Guts");
});

test("target stats: the search ends closer to the targets than Euophrys' pick, with legal decks", () => {
  const pool = pool4();
  const opts = { scenario: "GL" };
  const start = Tiers.buildDeck(opts, pool, []).cards;
  const r = runSearch(opts, { scenario: gl, build: "medium", target: { speed: 1400, stamina: 900, power: 1000, guts: 600, wit: 1000 } }, start, pool);
  assert.ok(r.after.short < r.before.short, r.before.short + " -> " + r.after.short);
  assert.strictEqual(r.cards.length, 6);
  assert.strictEqual(new Set(r.cards.map((c) => D.card(c.id).cid)).size, 6, "no character twice");
  const n = (t) => r.cards.filter((c) => D.card(c.id).ty === t).length;
  assert.ok(n("friend") <= 1 && n("group") <= 1, "at most one Friend and one Group card");
  assert.ok(r.swaps.length > 0);
});

test("target stats: locked cards, deck makeup and must-have skills hold", () => {
  const pool = pool4();
  const comp = { speed: 2, stamina: 2, power: 1, wit: 1 };
  const lock = globalCards(3).find((c) => c.ty === "stamina").id;
  const must = String(globalCards().find((c) => c.r >= 2 && c.ty === "speed" && (c.es || []).length).es[0]);
  const opts = { scenario: "GL", comp, locked: [lock], must: [must] };
  const start = Tiers.buildDeck(opts, pool, []).cards;
  const r = runSearch(opts, { scenario: gl, build: "long", target: { speed: 1300, stamina: 1300 } }, start, pool);
  const n = {};
  r.cards.forEach((c) => { const t = D.card(c.id).ty; n[t] = (n[t] || 0) + 1; });
  assert.deepStrictEqual(n, comp);
  assert.ok(r.cards.some((c) => c.id === lock));
  assert.ok(r.cards.some((c) => (D.card(c.id).hs || []).concat(D.card(c.id).es || []).map(String).includes(must)), "must-have still covered");
});

test("racing rank goals: S / SS count careers and preserve the best success rate", () => {
  const R = require('../rating.js');
  const pool = pool4(), base = { scenario: 'GL' };
  const start = Tiers.buildDeck(base, pool, []).cards;
  for (const label of ['S', 'SS']) {
    const rankGoal = { ss: R.rankThreshold(label), spRating: 2.5, unique: R.uniqueBonus(3, 3), ignoreFit: true };
    const opts = { ...base, rankGoal, locked: start.slice(0, 4).map(c => c.id) };
    const r = runSearch(opts, { scenario: gl, build: 'medium' }, start, pool);
    const hits = r.after.finals.filter(f => R.statsScore(f.stats) + Math.round(f.sp * rankGoal.spRating) + rankGoal.unique >= rankGoal.ss).length;
    assert.equal(r.after.finals.length, r.validation.heldOut.runs);
    assert.equal(r.after.ssShare, hits / r.validation.heldOut.runs, label + ' uses its own threshold');
    assert.ok(r.after.ssShare >= r.before.ssShare, 'no lower success rate, including final validation');
    assert.equal(r.after.rating, R.statsScore(r.after.stats) + Math.round(r.after.sp * rankGoal.spRating) + rankGoal.unique);
    assert.ok(opts.locked.every(id => r.cards.some(c => c.id === id)), 'locked cards stay');
    assert.equal(new Set(r.cards.map(c => D.card(c.id).cid)).size, 6, 'legal racing deck');
  }
});

test("simulated careers start with the cards' initial stats and skill points", () => {
  const fuku = pick((c) => c.n === "Matikanefukukitaru" && c.r === 3 && c.ty === "speed" && D.onGlobal(c, TODAY));
  const lv = D.levelFor(fuku, 4);
  const base = D.baseEffects(fuku, lv);
  const r = O.simulate(O.buildCtx({ scenario: ura, build: "medium", runs: 2 }), [{ card: fuku, lb: 4 }]);
  assert.deepStrictEqual(r.initial, [9, 10, 11, 12, 13].map((i) => base[i] || 0));
  assert.ok(r.initial.every((v) => v === 30), "SSR Speed Fukukitaru: +30 to every stat");
});

// ---- Race scoring (stats and skills in lengths) ----
const CURVES = require("../data/stat-curves.js");

test("stat curves cover the simulated cups; showdown cups have none", () => {
  for (const [id, c] of Object.entries(CURVES.cups)) {
    if (c.status !== "ok") { assert.ok(["engine", "course"].includes(c.status), id); continue; }
    for (const st of ["Nige", "Senkou", "Sasi", "Oikomi"]) {
      const v = c.styles[st];
      assert.equal(v.status, "ok", id + st);
      assert.equal(v.curves.length, 5);
      v.curves.forEach((pts) => { assert.ok(pts.length >= 5); pts.forEach((p, i) => { assert.ok(Number.isFinite(p[1])); if (i) assert.ok(p[0] > pts[i - 1][0]); }); });
    }
  }
  assert.equal(O.raceValuesFor(CURVES, "cm27", "Senkou"), null, "stamina showdown");
  assert.ok(O.raceValuesFor(CURVES, "cm22", "Senkou"));
});

test("race value: more speed is worth lengths, stamina past her need is worth nothing", () => {
  const ctx = O.buildCtx({ scenario: ura, build: "mile", raceValues: O.raceValuesFor(CURVES, "cm22", "Senkou") });
  const need = O.raceValuesFor(CURVES, "cm22", "Senkou").need;
  const line = (sp, sta) => [sp, sta, 1200, 600, 1000];
  assert.ok(O.raceL(ctx, line(1300, 900)) > O.raceL(ctx, line(1100, 900)));
  const far = need + O.STAMINA_MARGIN + 400;
  assert.ok(Math.abs(O.raceL(ctx, line(1200, far)) - O.raceL(ctx, line(1200, far + 300))) < 1e-9);
  assert.ok(O.raceL(ctx, line(1200, need - 300)) < O.raceL(ctx, line(1200, need + O.STAMINA_MARGIN)) - 1, "short of her need loses lengths");
});

test("race scoring: used without targets, targets take over when typed, and the pick is rechecked on fresh careers", () => {
  const pool = pool4();
  const sim = { scenario: ura, build: "mile", raceValues: O.raceValuesFor(CURVES, "cm25", "Senkou") };
  const opts = { scenario: "URA" };
  const start = Tiers.buildDeck(opts, pool, []).cards;
  const r = runSearch(opts, sim, start, pool);
  assert.strictEqual(r.scoring, "race");
  assert.strictEqual(r.cards.length, 6);
  assert.strictEqual(new Set(r.cards.map((c) => D.card(c.id).cid)).size, 6);
  assert.ok(r.validation.heldOut.runs >= 32 && r.validation.heldOut.decks >= 2);
  assert.ok(r.after.value >= r.before.value - 1e-6, "never worse than Euophrys' pick on the recheck");
  assert.ok(Number.isFinite(r.after.raceL) && Number.isFinite(r.after.skill));
  if (r.close) assert.ok(r.close.gap < 2 * r.close.se && r.close.cards.length === 6);
  const t = runSearch(opts, Object.assign({}, sim, { target: { speed: 1400 } }), start, pool);
  assert.strictEqual(t.scoring, "targets");
});

test("race scoring buys skills with each career's SP outside Grand Concert too", () => {
  const skills = {};
  require("../data/skillvalues/cm25.json").Senkou.forEach((r) => { if (r[2] > 0) skills[r[0]] = r[2] / 100; });
  const ctx = O.buildCtx({ scenario: ura, build: "mile", runs: 4, skills, raceValues: O.raceValuesFor(CURVES, "cm25", "Senkou") });
  assert.ok(ctx.skillBudget);
  const cards = pool4().slice(0, 40).map((c) => ({ card: D.card(c.id), lb: 4 })).filter((c, i, a) => a.findIndex((x) => x.card.cid === c.card.cid) === i).slice(0, 6);
  const s = O.simulate(ctx, cards);
  assert.ok(Number.isFinite(s.skillValue) && s.skillValue > 0, String(s.skillValue));
  assert.strictEqual(s.skillBudget.careers, 4);
});
