// The ace's family (family.js): what to look for in parents and grandparents, and the score.
const test = require("node:test");
const assert = require("node:assert");
const F = require("../family.js");
const A = require("../affinity.js");
const SB = require("../skill-budget.js");
const E = require("../engine.js");
const PR = require("../parent-relevance.js");
const K = require("../data/skill-kinds.js");
const X = require("../data/debuffs.js");
const SV = require("../data/skillvalues/index.js");
const P = require("../data/presets.js");
const G = require("../data/gametora.js");

const fam = F.create({ A, skills: SB.DATA.skills });
const preset = P.list.find((p) => p.id === "cm1");
const L = {};
require("../data/skillvalues/cm1.json").Senkou.forEach(([id, m]) => { L[id] = m / 100; });
const rel = PR.aceTargets({ preset, style: "Senkou", raceSkills: L, debuffs: X, minL: 0.1, rarityOf: (id) => (SV.skills[id] ? SV.skills[id][2] : null), kinds: K });
const spe = G.trainees.find((t) => t.n === "Special Week");
const chars = [...new Set(G.trainees.filter((t) => t.cid !== spe.cid).map((t) => t.cid))].slice(0, 30);
const base = { ace: { cid: spe.cid, apt: spe.apt }, race: { preset, style: "Senkou" }, rel, raceL: L, build: E.BUILDS[preset.build], chars, fam: {} };

test("a spark's chance: base by stars × (1 + affinity / 100), at two inspirations", () => {
  // uma.guide: a 3★ white skill spark is 9%; at affinity 30 it's 11.7% per inspiration.
  assert.ok(Math.abs(F.twice(F.WHITE, 3, 30) - (1 - 0.883 * 0.883)) < 1e-9);
  assert.strictEqual(F.twice(F.BLUE, 3, 50), 1, "capped at 100%");
  assert.strictEqual(F.twice(F.WHITE, 1, 0), 1 - 0.97 * 0.97);
});

test("what to look for: relevant white sparks, the build's top stats, pink only where she lacks A", () => {
  const w = fam.lookFor(base);
  assert.ok(w.white.length > 10);
  assert.ok(w.white.every((s) => !X[s.id]), "no debuffs for an ace");
  assert.ok(w.white.every((s) => SB.DATA.skills[s.id][3] === 1), "sparks are base whites");
  assert.deepStrictEqual(w.blue.map((b) => b.label), ["Speed", "Power"], "medium build: Speed, then Power");
  const weak = fam.lookFor(Object.assign({}, base, { ace: { cid: spe.cid, apt: spe.apt.map((g, i) => (i === 4 ? "C" : g)) } }));
  assert.deepStrictEqual(weak.pink.map((p) => p.label), ["Medium"]);
  assert.deepStrictEqual(fam.lookFor(Object.assign({}, base, { ace: { cid: spe.cid, apt: spe.apt.map(() => "A") } })).pink, []);
});

test("what to look for: skills the ace's deck already offers come later", () => {
  const top = fam.lookFor(base).white[0];
  const offers = Object.fromEntries(rel ? Object.keys(rel.targets).filter((id) => SB.DATA.skills[id] && SB.DATA.skills[id][0] === top.family).map((id) => [id, 0.95]) : []);
  const w = fam.lookFor(Object.assign({}, base, { offers }));
  assert.notStrictEqual(w.white[0].id, top.id);
  assert.ok(w.white.find((s) => s.id === top.id).deck >= 0.95);
});

test("parent pairs and grandparents follow the affinity formula", () => {
  const w = fam.lookFor(Object.assign({}, base, { fam: { p1: { cid: chars[0] } } }));
  const p = w.pairs[0];
  assert.strictEqual(p.pts, A.together(spe.cid, p.p1) + A.together(spe.cid, p.p2) + A.together(p.p1, p.p2));
  assert.ok(w.pairs.every((x, i) => i === 0 || w.pairs[i - 1].pts >= x.pts));
  assert.ok(w.pairs.every((x) => x.p1 !== spe.cid && x.p2 !== spe.cid), "never the ace herself");
  assert.strictEqual(w.grand.p1[0].pts, A.together(spe.cid, chars[0], w.grand.p1[0].cid));
  assert.ok(!w.grand.p1.some((g) => g.cid === chars[0]), "not her own grandparent");
});

test("family score: relevant sparks count by chance and L, others don't", () => {
  const top = fam.lookFor(base).white[0];
  const off = Object.keys(SB.DATA.skills).find((id) => SB.DATA.skills[id][3] === 1 && !fam.families(rel)[SB.DATA.skills[id][0]]);
  const one = (white, blue) => ({ p1: { cid: chars[0], white, blue: blue || [0, 0], pink: [0, 0], green: 0, wins: [] } });
  const s3 = fam.score(one([[top.id, 3]]), base), s1 = fam.score(one([[top.id, 1]]), base);
  assert.ok(s3.value > s1.value && s1.value > 0);
  assert.strictEqual(fam.score(one([[off, 3]]), base).value, 0, "irrelevant white spark");
  assert.strictEqual(fam.score(one([], [0, 3]), base).keyStart, 21, "3★ Speed: +21 at the start");
  assert.strictEqual(fam.score(one([], [3, 3]), base).keyStart, 0, "Guts isn't a key stat here");
  const L1 = { trainee: spe.cid, p1: chars[0] };
  assert.strictEqual(s3.total, A.total(L1, {}).total);
});

test("family problems: the game's family rules", () => {
  const m = (cid) => ({ cid, white: [], blue: [0, 0], pink: [0, 0], green: 0, wins: [] });
  assert.ok(fam.problems({ p1: m(spe.cid) }, base).length);
  assert.ok(fam.problems({ p1: m(chars[0]), p2: m(chars[0]) }, base).length);
  assert.ok(fam.problems({ p1: m(chars[0]), g11: m(chars[0]) }, base).length);
  assert.deepStrictEqual(fam.problems({ p1: m(chars[0]), p2: m(chars[1]), g11: m(chars[2]) }, base), []);
});

test("parent pairs from your umas: Parent 1 is one you own, Parent 2 anyone (a rental)", () => {
  const mine = chars.slice(0, 3);
  const w = fam.lookFor(Object.assign({}, base, { mine }));
  assert.ok(w.pairs.length > 0);
  assert.ok(w.pairs.every((p) => mine.includes(p.p1) && p.p2 !== p.p1), "Parent 1 always yours");
  assert.ok(w.pairs.some((p) => !mine.includes(p.p2)), "Parent 2 can be anyone");
  const best = Math.max(...mine.flatMap((a) => chars.filter((b) => b !== a).map((b) => A.together(spe.cid, a) + A.together(spe.cid, b) + A.together(a, b))));
  assert.strictEqual(w.pairs[0].pts, best);
});

test("what the ace gets: a skill several members carry combines their chances", () => {
  const top = fam.lookFor(base).white[0];
  const m = (cid, white) => ({ cid, white, blue: [0, 0], pink: [0, 0], green: 0, wins: [] });
  const one = fam.score({ p1: m(chars[0], [[top.id, 3]]) }, base);
  const two = fam.score({ p1: m(chars[0], [[top.id, 3]]), g11: m(chars[1], [[top.id, 2]]) }, base);
  const a = one.skills.find((k) => k.id === top.id), b = two.skills.find((k) => k.id === top.id);
  assert.strictEqual(a.p, one.white[0].p);
  const ws = two.white.filter((w) => w.id === top.id);
  assert.ok(Math.abs(b.p - (1 - (1 - ws[0].p) * (1 - ws[1].p))) < 1e-12);
  assert.deepStrictEqual(b.from.sort(), ["g11", "p1"]);
});

test("family score: a spark for a skill the ace's deck offers (or she has) counts only for its discount", () => {
  const top = fam.lookFor(base).white[0];
  const ids = Object.keys(rel.targets).filter((id) => SB.DATA.skills[id] && SB.DATA.skills[id][0] === top.family);
  const one = { p1: { cid: chars[0], white: [[top.id, 3]], blue: [0, 0], pink: [0, 0], green: 0, wins: [] } };
  const plain = fam.score(one, base);
  const half = fam.score(one, Object.assign({}, base, { offers: Object.fromEntries(ids.map((id) => [id, 0.5])) }));
  const sure = fam.score(one, Object.assign({}, base, { offers: Object.fromEntries(ids.map((id) => [id, 1])) }));
  const innate = fam.score(one, Object.assign({}, base, { innate: [ids[0]] }));
  const p = plain.white[0].p, L = plain.white[0].L, hint = Math.min(L, F.HINT_L);
  assert.ok(Math.abs(plain.whiteL - p * L) < 1e-12, "no deck: the skill's full L");
  assert.ok(Math.abs(half.whiteL - p * (L * 0.5 + hint * 0.5)) < 1e-12, "offered half the time: half its L, plus the discount the other half");
  assert.ok(Math.abs(sure.whiteL - p * hint) < 1e-12, "always offered: only the discount");
  assert.ok(Math.abs(innate.whiteL - p * hint) < 1e-12, "her own skill: only the discount");
  assert.strictEqual(sure.white[0].L, L, "the listed L stays the skill's own");
});
