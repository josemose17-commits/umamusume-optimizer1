// Tests for the Euophrys-based tier list and deck builder (tiers.js).
const test = require("node:test");
const assert = require("node:assert");
const D = require("../deck.js");
const T = require("../tiers.js");
const EU = require("../vendor/euophrys.js");
const CARDS = require("../data/euophrys-cards.js");

const TODAY = "2026-10-06";
const glob = D.DATA.supports.filter((c) => D.onGlobal(c, TODAY));
const allLbs = (ty) => { const out = []; glob.filter((c) => c.ty === ty).forEach((c) => { for (let lb = 0; lb <= 4; lb++) out.push({ id: c.id, lb }); }); return out; };

test("Euophrys' data covers every Global card", () => {
  const ids = new Set(CARDS.map((c) => c.id));
  assert.deepStrictEqual(glob.filter((c) => !ids.has(c.id)).map((c) => c.n), []);
});

test("with skills off, the score is exactly Euophrys' score", () => {
  for (const scen of ["URA", "Aoharu", "MANT", "GL", "GM"]) {
    const s = EU.getScenario("gl", scen);
    const w = Object.assign({}, s.general, s.speed, { type: 0 });
    const deck = [{ id: 30028, lb: 4 }];
    const theirs = EU.processCards(CARDS.filter((c) => c.type === 0 && c.id !== 30028), w, [CARDS.find((c) => c.id === 30028 && c.limit_break === 4)]);
    const mine = T.rank({ scenario: scen, skillWeight: 0 }, "speed", deck, allLbs("speed"));
    const by = new Map(theirs.map((x) => [x.id + ":" + x.lb, x.score]));
    mine.forEach((x) => assert.ok(Math.abs(x.score - by.get(x.id + ":" + x.lb)) < 1e-9, scen + " " + x.id));
  }
});

test("a card that hints a strong skill on the race moves up when skills count", () => {
  const card = glob.find((c) => c.ty === "speed" && c.r === 3 && (c.hs || []).length);
  const skills = {};
  card.hs.forEach((id) => { skills[id] = 2.5; });
  const before = T.rank({ scenario: "GL", skillWeight: 0 }, "speed", [], allLbs("speed")).find((x) => x.id === card.id && x.lb === 4);
  const after = T.rank({ scenario: "GL", skillWeight: 1, skills }, "speed", [], allLbs("speed")).find((x) => x.id === card.id && x.lb === 4);
  assert.strictEqual(after.base, before.base);
  assert.ok(after.skill > 0 && after.score > before.score);
});

test("skills already in the deck or known by the trainee add nothing", () => {
  const card = glob.find((c) => c.ty === "speed" && c.r === 3 && (c.hs || []).length);
  const skills = { [card.hs[0]]: 2.5 };
  const twin = glob.find((c) => c.id !== card.id && c.cid !== card.cid && (c.hs || []).includes(card.hs[0]));
  const solo = T.rank({ scenario: "GL", skills }, "speed", [], [{ id: card.id, lb: 4 }])[0];
  if (twin) {
    const covered = T.rank({ scenario: "GL", skills }, "speed", [{ id: twin.id, lb: 4 }], [{ id: card.id, lb: 4 }])[0];
    assert.ok(covered.skill < solo.skill);
  }
  assert.ok(solo.skill > 0);
});

test("deck builder keeps to the makeup, never repeats a character, and fills the borrow slot", () => {
  const pool = glob.filter((c) => c.r >= 2).map((c) => ({ id: c.id, lb: 4 }));
  const borrow = glob.filter((c) => c.r === 3).map((c) => ({ id: c.id, lb: 4 }));
  const comp = { speed: 2, stamina: 2, wit: 1, friend: 1 };
  const r = T.buildDeck({ scenario: "GL", borrow: true, comp }, pool, borrow);
  const n = {};
  r.cards.forEach((c) => { const t = D.card(c.id).ty; n[t] = (n[t] || 0) + 1; });
  assert.deepStrictEqual(n, comp);
  assert.strictEqual(new Set(r.cards.map((c) => D.card(c.id).cid)).size, 6);
  assert.strictEqual(r.cards.filter((c) => c.borrowed).length, 1);
  assert.throws(() => T.buildDeck({ scenario: "GL", comp: { group: 6 } }, pool.slice(0, 30), []), /Not enough cards/);
});

test("the trainee's own character is never picked", () => {
  const tr = D.DATA.trainees.find((t) => t.en && glob.some((c) => c.cid === t.cid && c.r === 3 && c.ty === "speed"));
  const pool = glob.filter((c) => c.r >= 2).map((c) => ({ id: c.id, lb: 4 }));
  const r = T.buildDeck({ scenario: "URA", trainee: tr.id, comp: { speed: 4 } }, pool, []);
  assert.ok(r.cards.every((c) => D.card(c.id).cid !== tr.cid));
});

test("parent decks: debuff targets follow the race's distance and the runner's style", () => {
  const X = require("../data/debuffs.js");
  const P = require("../data/presets.js");
  const long = P.list.find((p) => p.course.dist === "Long" && p.course.surface === "Turf");
  const sprint = P.list.find((p) => p.course.dist === "Sprint");
  const name = (t) => Object.keys(t).map((id) => X[id].n);
  const tl = T.parentTargets("debuff", long, "Senkou", {}, X);
  const ts = T.parentTargets("debuff", sprint, "Oikomi", {}, X);
  assert.ok(name(tl).includes("Stamina Eater") && !name(tl).includes("Intimidate"));
  assert.ok(name(ts).includes("Intimidate") && !name(ts).includes("Stamina Eater"));
  assert.ok(name(ts).includes("Intense Gaze") && !name(tl).includes("Intense Gaze"), "End Closer-only debuffs follow the style");
  assert.ok(!name(tl).includes("Dust Cloud"), "dirt-only debuffs are left out on turf");
});

test("parent decks collect more target skills than a racing deck", () => {
  const X = require("../data/debuffs.js");
  const P = require("../data/presets.js");
  const pr = P.list.find((p) => p.course.dist === "Long");
  const targets = T.parentTargets("debuff", pr, "Senkou", {}, X);
  const pool = glob.filter((c) => c.r >= 2).map((c) => ({ id: c.id, lb: 4 }));
  const parent = T.buildDeck({ scenario: "GL", parent: { targets, statsWeight: 0.1 } }, pool, []);
  const race = T.buildDeck({ scenario: "GL", skillWeight: 0 }, pool, []);
  const covered = (cards) => new Set(cards.flatMap((c) => (D.card(c.id).hs || []).concat(D.card(c.id).es || [])).filter((id) => targets[id])).size;
  assert.ok(parent.expected > 3);
  assert.ok(covered(parent.cards) > covered(race.cards));
});

test("parent targets are white skills only (gold skills and inherited uniques don't become sparks)", () => {
  const X = require("../data/debuffs.js");
  const SV = require("../data/skillvalues/index.js");
  const P = require("../data/presets.js");
  const pr = P.list.find((p) => p.id === SV.ready[0]);
  const L = {};
  require("../data/skillvalues/" + pr.id + ".json").Senkou.forEach(([id, m]) => { L[id] = m / 100; });
  const ace = T.parentTargets("ace", pr, "Senkou", L, X, 0.1, (id) => SV.skills[id][2]);
  assert.ok(Object.keys(ace).length > 10);
  assert.ok(Object.keys(ace).every((id) => SV.skills[id][2] === 1));
  const deb = T.parentTargets("debuff", pr, "Senkou", {}, X);
  assert.ok(Object.keys(deb).every((id) => X[id].r === 1));
});

// ---- Must-have skills ----
const giversOf = (id, from) => from.filter((c) => (c.hs || []).concat(c.es || []).map(String).includes(String(id)));
const pool4 = () => glob.filter((c) => c.r >= 2).map((c) => ({ id: c.id, lb: 4 }));

test("must-have skills: the deck includes a card that gives each one", () => {
  const pool = pool4();
  const plain = T.buildDeck({ scenario: "GL", skillWeight: 0 }, pool, []);
  const offered = new Set(plain.cards.flatMap((c) => (D.card(c.id).hs || []).concat(D.card(c.id).es || [])).map(String));
  // Two skills the plain deck doesn't offer, each given by a card in the pool.
  const must = [...new Set(glob.filter((c) => c.r >= 2).flatMap((c) => (c.hs || []).concat(c.es || [])).map(String))].filter((id) => !offered.has(id)).slice(0, 2);
  assert.strictEqual(must.length, 2);
  const r = T.buildDeck({ scenario: "GL", skillWeight: 0, must }, pool, []);
  must.forEach((id) => assert.ok(r.cards.some((c) => giversOf(id, [D.card(c.id)]).length), "covers " + id));
  assert.deepStrictEqual(r.must.map((m) => m.id), must);
  r.must.forEach((m) => assert.ok(m.p > 0 && m.src.length));
  // The bonus that forces coverage isn't part of the scores shown.
  r.cards.forEach((c) => assert.ok(c.score < 1e5, "score " + c.score));
  assert.ok(r.cards.some((c) => c.gives.length));
});

test("must-have skills: one no usable card gives is reported, and the trainee's own skills need no card", () => {
  const pool = pool4().filter((c) => D.card(c.id).ty === "speed");
  const onlyElsewhere = [...new Set(glob.filter((c) => c.ty === "stamina").flatMap((c) => (c.hs || []).concat(c.es || [])).map(String))]
    .find((id) => !giversOf(id, pool.map((c) => D.card(c.id))).length);
  const r = T.buildDeck({ scenario: "GL", must: [onlyElsewhere] }, pool, []);
  assert.strictEqual(r.must[0].p, 0);
  assert.strictEqual(r.cards.length, 6);
  const tr = D.DATA.trainees.find((t) => t.en && (t.is || []).length);
  const own = String(tr.is[0]);
  const k = T.buildDeck({ scenario: "GL", trainee: tr.id, must: [own] }, pool4(), []);
  assert.deepStrictEqual(k.must, [], "the trainee's innate skill isn't a must-have to cover");
});

test("must-have skills: a locked deck makeup still covers what it can", () => {
  const pool = pool4();
  const comp = { speed: 3, stamina: 2, wit: 1 };
  const witOnly = [...new Set(glob.filter((c) => c.r >= 2 && c.ty === "wit").flatMap((c) => (c.hs || []).concat(c.es || [])).map(String))]
    .find((id) => !giversOf(id, glob.filter((c) => c.r >= 2 && c.ty !== "wit")).length);
  const r = T.buildDeck({ scenario: "GL", comp, must: [witOnly] }, pool, []);
  const wit = r.cards.find((c) => D.card(c.id).ty === "wit");
  assert.ok(giversOf(witOnly, [D.card(wit.id)]).length, "the Wit slot goes to a card that gives it");
});

// ---- Independent Training ----
test("Independent Training: skills only the 3rd chain event gives count much less", () => {
  const kita = glob.find((c) => c.n === "Kitasan Black" && c.r === 3 && (c.es || []).length >= 2);
  const late = T.lateChainSkills(kita);
  assert.ok(late.size >= 1, "her last chain event gives a skill no earlier event does");
  const id = [...late][0];
  const skills = { [id]: 1 };
  const pOf = (independent) => T.skillValue([{ id: kita.id, lb: 4 }], { skills, costs: {}, known: new Set(), it: independent, races: 0, speedWeight: 1, spWeight: 1 }).list.find((s) => s.id === id).p;
  const normal = pOf(false), it = pOf(true);
  assert.ok(it < normal * 0.5, normal + " -> " + it);
  // Skills from her first two chain events keep their chance.
  const early = (kita.es || []).map(String).find((x) => !late.has(x));
  if (early) {
    const sk = { [early]: 1 };
    const p = (independent) => T.skillValue([{ id: kita.id, lb: 4 }], { skills: sk, costs: {}, known: new Set(), it: independent, races: 0, speedWeight: 1, spWeight: 1 }).list.find((s) => s.id === early).p;
    assert.ok(Math.abs(p(true) - p(false)) < 0.05);
  }
});

test("Independent Training: a G1-heavy agenda for race bonus, unless you set your own race counts", () => {
  assert.deepStrictEqual(T.weightsFor("GL", "speed", {}, null, true).races.slice(0, 3), T.IT_RACES);
  assert.deepStrictEqual(T.weightsFor("GL", "speed", { races: [5, 1, 0, 3] }, null, true).races, [5, 1, 0, 3]);
  assert.notDeepStrictEqual(T.weightsFor("GL", "speed", {}, null, false).races.slice(0, 3), T.IT_RACES);
});

test("parent decks with stat targets: 'A little' keeps the skills and still gets closer to the targets", () => {
  const O = require("../optimizer.js");
  const { SCENARIOS } = require("../scenarios.js");
  const X = require("../data/debuffs.js");
  const P = require("../data/presets.js");
  const pr = P.list.find((p) => p.course.dist === "Long");
  const targets = T.parentTargets("debuff", pr, "Senkou", {}, X);
  const pool = glob.filter((c) => c.r >= 2).map((c) => ({ id: c.id, lb: 4 }));
  const opts = { scenario: "GL", parent: { targets, statsWeight: 0.1 }, independent: true };
  const start = T.buildDeck(opts, pool, []).cards;
  const s = O.targetSearch(opts, { scenario: SCENARIOS.find((x) => x.id === "grandlive"), build: "long", target: { speed: 1100, stamina: 1100, power: 1100, guts: 1100, wit: 1100 }, raceShare: 0.25 }, start, pool, []);
  while (s.next());
  const r = s.result();
  assert.ok(r.after.short <= r.before.short);
  assert.ok(T.deckSkills(opts, r.cards).value >= 0.9 * T.deckSkills(opts, start).value, "skills mostly kept");
});

test("Independent Training: no Specialty Priority, manual-career bonuses scaled, initial stats boosted", () => {
  const e = CARDS.find((c) => c.id === 30028 && c.limit_break === 4);
  const half = T.itEntry(e, 0.5);
  assert.strictEqual(half.specialty_rate, 0);
  assert.strictEqual(half.unique_specialty, 1);
  assert.ok(Math.abs(half.fs_bonus - (1 + (e.fs_bonus - 1) / 2)) < 1e-12);
  assert.ok(Math.abs(half.mb - (1 + (e.mb - 1) / 2)) < 1e-12);
  assert.ok(Math.abs(half.tb - (1 + (e.tb - 1) / 2)) < 1e-12);
  assert.strictEqual(T.itEntry(e, 1).fs_bonus, e.fs_bonus);
  const withInit = CARDS.find((c) => c.starting_stats.some((v) => v > 0));
  assert.deepStrictEqual(T.itEntry(withInit, 0.5).starting_stats, withInit.starting_stats.map((v) => v * T.IT_INITIAL));
  assert.strictEqual(e.specialty_rate > 0, true, "the source entry is not modified");
});

test("Independent Training weights skill points more and uses your race count", () => {
  const manual = T.weightsFor("GM", "speed", {}, null, false);
  const it = T.weightsFor("GM", "speed", {}, null, [4, 0, 0]);
  assert.ok(Math.abs(it.stats[5] - manual.stats[5] * T.IT_SP) < 1e-12);
  assert.deepStrictEqual(it.races.slice(0, 3), [4, 0, 0]);
  assert.strictEqual(manual.stats[5], T.weightsFor("GM", "speed", {}, null, false).stats[5], "the scenario preset is not modified");
});

test("Independent Training widens the lead of the biggest initial-stat speed card and reports what it rests on", () => {
  const speed = allLbs("speed").filter((x) => x.lb === 4);
  const sum = (x) => { const e = CARDS.find((c) => c.id === x.id && c.limit_break === 4); return e ? e.starting_stats.reduce((a, v) => a + v, 0) : 0; };
  const top = speed.slice().sort((a, b) => sum(b) - sum(a))[0];
  // Its score against the average speed card's.
  const lead = (independent) => {
    const r = T.rank({ scenario: "GM", skillWeight: 0, independent }, "speed", [], speed);
    return r.find((x) => x.id === top.id).score / (r.reduce((a, x) => a + x.score, 0) / r.length);
  };
  assert.ok(lead(true) > lead(false), `lead ${lead(true)} with Independent Training vs ${lead(false)} without`);
  const r = T.rank({ scenario: "GM", skillWeight: 0, independent: true }, "speed", [], [top])[0];
  assert.strictEqual(r.it.initialStats, sum(top));
  assert.strictEqual(T.rank({ scenario: "GM", skillWeight: 0 }, "speed", [], [top])[0].it, null);
});
