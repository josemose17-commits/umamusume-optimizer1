// Parents: which skills are relevant for a race, the buy that reaches SS with the most of them,
// and the deck search's Reach SS option.
const test = require("node:test");
const assert = require("node:assert");
const PR = require("../parent-relevance.js");
const K = require("../data/skill-kinds.js");
const X = require("../data/debuffs.js");
const SV = require("../data/skillvalues/index.js");
const P = require("../data/presets.js");
const SB = require("../skill-budget.js");
const R = require("../rating.js");
const PP = require("../parent-planner.js");

const rarityOf = (id) => (SV.skills[id] ? SV.skills[id][2] : null);
const preset = (f) => P.list.find(f);
const values = (p, style) => { const L = {}; require("../data/skillvalues/" + p.id + ".json")[style].forEach(([id, m]) => { L[id] = m / 100; }); return L; };
const ace = (p, style, raceSkills) => PR.aceTargets({ preset: p, style, raceSkills: raceSkills || {}, debuffs: X, minL: 0.1, rarityOf, kinds: K });
const named = (t, n) => Object.keys(t).some((id) => SV.skills[id] && SV.skills[id][0] === n);

test("ace parent: skills over 0.1 L count, debuffs never do", () => {
  const p = preset((x) => x.id === "cm1");
  const L = values(p, "Senkou");
  const { targets, why } = ace(p, "Senkou", L);
  assert.ok(Object.keys(L).some((id) => X[id] && L[id] > 0.1), "the race's chart has debuffs worth L");
  assert.ok(Object.keys(targets).every((id) => !X[id]));
  assert.ok(Object.keys(targets).every((id) => why[id] !== "L" || L[id] > 0.1));
  assert.ok(Object.keys(targets).every((id) => rarityOf(id) === 1 && id[0] !== "9"), "white skills only");
});

test("greens count when their condition fits the race", () => {
  const tokyo = preset((x) => x.course.track === "Tokyo"), kyoto = preset((x) => x.course.track === "Kyoto");
  assert.ok(named(ace(tokyo, "Senkou").targets, "Tokyo Racecourse ○"));
  assert.ok(!named(ace(kyoto, "Senkou").targets, "Tokyo Racecourse ○"));
  assert.ok(named(ace(tokyo, "Senkou").targets, "Left-Handed ○") && !named(ace(tokyo, "Senkou").targets, "Right-Handed ○"));
  assert.ok(named(ace(tokyo, "Nige").targets, "Front Runner Savvy ○") && !named(ace(tokyo, "Oikomi").targets, "Front Runner Savvy ○"));
  // Gate and popularity aren't known before the race, so those greens don't count.
  assert.ok(!named(ace(tokyo, "Senkou").targets, "Inner Post Proficiency ○"));
});

test("recoveries count for Mile and longer, when their style and distance fit", () => {
  const sprint = preset((x) => x.course.dist === "Sprint"), mile = preset((x) => x.course.dist === "Mile"), long = preset((x) => x.course.dist === "Long");
  assert.ok(!named(ace(sprint, "Senkou").targets, "Corner Recovery ○"));
  assert.ok(named(ace(mile, "Senkou").targets, "Corner Recovery ○"));
  assert.ok(named(ace(long, "Senkou").targets, "Deep Breaths") && !named(ace(mile, "Senkou").targets, "Deep Breaths"), "Long-only recovery");
  assert.ok(named(ace(long, "Senkou").targets, "Hydrate") && !named(ace(long, "Sasi").targets, "Hydrate"), "Pace Chaser-only recovery");
  const t = ace(long, "Senkou");
  assert.ok(Object.keys(t.targets).filter((id) => t.why[id] === "recovery").every((id) => t.targets[id] >= 0.1), "weighted at least 0.1 L");
});

test("condition parser: and, or, and unknown clauses", () => {
  const f = { track_id: 10006, rotation: 2 };
  assert.ok(PR.fits(["track_id==10006"], f, false));
  assert.ok(PR.fits(["track_id==10008@rotation==2"], f, false));
  assert.ok(!PR.fits(["track_id==10006&rotation==1"], f, false));
  assert.ok(!PR.fits(["post_number<=3"], f, false) && PR.fits(["post_number<=3"], f, true));
});

// A small shop: Corner Recovery ○ (white) and Swinging Maestro (its gold), Right-Handed ○/◎,
// Professor of Curvature's white and gold, and Straightaway Adept.
const APT = ["A", "G", "C", "A", "A", "B", "C", "A", "B", "C"];
const ratings = () => { const v = {}; Object.keys(SB.DATA.skills).forEach((id) => { v[id] = R.skillScore(id, APT); }); return v; };
const SHOP = ["200352", "200351", "200011", "200012", "200332", "200331", "200362"];
const REL = { "200352": 1, "200012": 1, "200332": 1 };

test("SS buy: the most relevant families while the rating gap is met", () => {
  const s = SB.create({ skills: ratings(), available: SHOP, lengthValue: 1 });
  const easy = s.solveSS({}, 1200, { gap: 0, relevant: REL });
  assert.ok(easy.reached);
  assert.strictEqual(easy.relevant, 3, "Corner Recovery, Right-Handed and Professor of Curvature families");
  const plain = s.solve({}, 1200);
  // A gap only the most rating can meet: SS comes first.
  const hard = s.solveSS({}, 1200, { gap: Math.round(plain.value), relevant: REL });
  assert.ok(hard.reached && hard.value >= plain.value - 1);
  // Out of reach: the highest rating, like the plain solver.
  const none = s.solveSS({}, 1200, { gap: 1e6, relevant: REL });
  assert.ok(!none.reached);
  assert.strictEqual(Math.round(none.value), Math.round(plain.value));
});

test("SS buy: relevant skills beat more rating when SS is already met", () => {
  // SP for one of two skills with the same cost and rating: the relevant one, either way round.
  const s = SB.create({ skills: ratings(), available: ["200352", "200362"], lengthValue: 1 });
  assert.deepStrictEqual(s.solveSS({}, 170, { gap: 0, relevant: { "200362": 1 } }).selected.map((o) => o.id), ["200362"]);
  const x = s.solveSS({}, 170, { gap: 0, relevant: { "200352": 1 } });
  assert.deepStrictEqual(x.selected.map((o) => o.id), ["200352"]);
});

test("SS buy: a gold keeps its white's spark, so it stays relevant", () => {
  // The spark is always the base white's; the gold only raises its chance (GameTora: 40%).
  const s = SB.create({ skills: ratings(), learned: ["200352"], available: ["200351"], lengthValue: 1 });
  const x = s.solveSS({}, 1000, { gap: 0, relevant: REL });
  assert.strictEqual(x.selected[0].id, "200351");
  assert.strictEqual(x.relevant, 0, "same family, no spark lost");
  const fresh = SB.create({ skills: ratings(), available: ["200351"], lengthValue: 1 }).solveSS({}, 1000, { gap: 0, relevant: REL });
  assert.strictEqual(fresh.relevant, 1);
});

test("skill rating: Turf/Dirt never scale a skill's rating (UmaTools)", () => {
  const P = require("../data/parent-data.js");
  const id = Object.keys(P.skillRating).find((k) => String(P.skillRating[k][5]).toLowerCase() === "dirt");
  const turfOnly = ["A", "G", "A", "A", "A", "A", "A", "A", "A", "A"];
  assert.strictEqual(R.skillScore(id, turfOnly), P.skillRating[id][0]);
});

test("SS buy: spark ★ skills are bought first", () => {
  const s = SB.create({ skills: ratings(), available: SHOP, must: ["200331"], lengthValue: 1 });
  const x = s.solveSS({}, 1200, { gap: 0, relevant: REL });
  assert.ok(x.selected.some((o) => o.id === "200331"));
  assert.deepStrictEqual(x.unmetMust, []);
});

test("rating per skill point follows the skills and her aptitudes", () => {
  const p = preset((x) => x.id === "cm1");
  const ids = Object.keys(ace(p, "Senkou", values(p, "Senkou")).targets);
  const good = PP.spRating(ids, ["A", "G", "A", "A", "A", "A", "A", "A", "A", "A"], R, SB);
  const bad = PP.spRating(ids, ["A", "G", "G", "G", "G", "G", "G", "G", "G", "G"], R, SB);
  assert.ok(good > bad && good > 1 && good < 2);
  assert.strictEqual(PP.spRating([], APT, R, SB), PP.SP_RATING);
});

test("SS buy: with SP to spare, a relevant skill goes up to the tier with the better spark chance", () => {
  // Right-Handed ○ alone vs ◎ (25%): the same one relevant family, the ◎ when SP allows.
  const s = SB.create({ skills: ratings(), available: ["200012", "200011"], lengthValue: 1 });
  const rel = { "200012": 1 };
  assert.deepStrictEqual(s.solveSS({}, 100, { gap: 0, relevant: rel }).selected.map((o) => o.id), ["200012"]);
  const x = s.solveSS({}, 400, { gap: 0, relevant: rel });
  assert.deepStrictEqual(x.selected.map((o) => o.id), ["200011"]);
  assert.strictEqual(x.spent, x.selected[0].cost);
});

test("SS buy: spark chance comes before rating among equal relevant counts, never before SS", () => {
  // Made-up ratings where the ○ rates higher than its ◎: the ◎ still wins on spark chance...
  const s = SB.create({ skills: { "200012": 200, "200011": 150 }, available: ["200012", "200011"], lengthValue: 1 });
  const rel = { "200012": 1 };
  assert.deepStrictEqual(s.solveSS({}, 400, { gap: 0, relevant: rel }).selected.map((o) => o.id), ["200011"]);
  // ...unless SS needs the ○'s rating.
  assert.deepStrictEqual(s.solveSS({}, 400, { gap: 180, relevant: rel }).selected.map((o) => o.id), ["200012"]);
});
