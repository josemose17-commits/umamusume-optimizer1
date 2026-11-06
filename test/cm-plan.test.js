// The CM/LoH planner's logic (cm-plan.js): Parent 1 from your veterans given the ace's deck, a
// fresh Parent 1 when none is good enough, her races, how many keep SS, and the uma.moe search.
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../affinity.js");
const F = require("../family.js");
const SB = require("../skill-budget.js");
const E = require("../engine.js");
const PR = require("../parent-relevance.js");
const K = require("../data/skill-kinds.js");
const X = require("../data/debuffs.js");
const SV = require("../data/skillvalues/index.js");
const P = require("../data/presets.js");
const G = require("../data/gametora.js");
const V = require("../veterans.js");
const CP = require("../cm-plan.js");

const preset = P.list.find((p) => p.id === "cm1");
const L = {};
require("../data/skillvalues/cm1.json").Senkou.forEach(([id, m]) => { L[id] = m / 100; });
const rel = Object.assign(PR.aceTargets({ preset, style: "Senkou", raceSkills: L, debuffs: X, minL: 0.1, rarityOf: (id) => (SV.skills[id] ? SV.skills[id][2] : null), kinds: K }), { L });
const glob = G.trainees.filter((t) => t.en && t.en <= "2026-11-05");
const chars = [...new Set(glob.map((t) => t.cid))];
const saddles = {};
Object.keys(V.SADDLE).forEach((k) => { saddles[V.SADDLE[k]] = +k; });
const plan = CP.create({ A, F, skills: SB.DATA.skills, trainees: G.trainees, chars, saddles, SS: 17500 });
const byName = (n) => glob.find((t) => t.n === n);
const ace = byName("Special Week");
const x0 = () => plan.context({ ace: { cid: ace.cid, tid: ace.id }, race: { preset, style: "Senkou" }, rel, offers: null, build: E.BUILDS[preset.build] });
const want = plan.want(x0());
const top = want.white.slice(0, 6).map((w) => w.id);

// A veteran in veterans.js's shape: her sparks, wins, and her two parents.
let next = 1;
const m = (t, white, extra) => Object.assign({ cid: t.cid, tid: t.id, white: white || [], blue: [0, 0], pink: [0, 0], green: 0, wins: [], races: [], other: 0 }, extra || {});
function vet(t, white, o) {
  o = o || {};
  return { id: next++, cid: t.cid, tid: t.id, score: o.score || 18000, saddles: o.saddles || [], learned: o.learned == null ? 15 : o.learned, scenario: o.scenario || "grandlive", races: o.races == null ? A.careerGoals(t.cid).fixed.length + A.careerGoals(t.cid).choices.length : o.races,
    self: m(t, white, { blue: o.blue || [0, 3], wins: o.wins || [] }), parents: (o.parents || []).map((p) => m(p, [], { wins: p.wins || [] })) };
}
const others = glob.filter((t) => t.cid !== ace.cid);
// G1s she can run (B or better) on turns none of her career goals take, one per turn.
function open(t) {
  const g = A.careerGoals(t.cid), taken = new Set(g.fixed.map((x) => x.turn).concat(...g.choices.map((c) => c.map((y) => y.turn))));
  const names = new Set(g.fixed.map((x) => x.name).concat(...g.choices.map((c) => c.map((y) => y.name))));
  const out = [], used = new Set();
  A.g1Races().forEach((r) => { if (!A.fits(t.apt, r, "B") || names.has(r.name)) return; const turn = r.turns.find((x) => !taken.has(x) && !used.has(x)); if (turn == null) return; used.add(turn); out.push(r.name); });
  return out;
}
const uniq = []; others.forEach((t) => { if (!uniq.some((u) => u.cid === t.cid)) uniq.push(t); });

test("Parent 1 from your veterans: by the family score, with her parents as the ace's grandparents", () => {
  const strong = vet(uniq[0], top.slice(0, 3).map((id) => [id, 3]), { parents: [uniq[5], uniq[6]] });
  const weak = vet(uniq[1], [[top[3], 1]], { parents: [uniq[7], uniq[8]] });
  const self = vet(ace, top.map((id) => [id, 3]));
  const r = plan.rankVets(x0(), [weak, strong, self]);
  assert.deepEqual(r.map((y) => y.v.id), [strong.id, weak.id], "best first; never the ace's own character");
  assert.equal(r[0].f.g11.cid, uniq[5].cid, "her parents become the grandparents");
  assert.equal(r[0].f.g12.cid, uniq[6].cid);
  const rent = r[0].rent;
  const best = Math.max(...chars.filter((c) => c !== ace.cid && c !== strong.cid).map((c) => A.together(ace.cid, c) + A.together(strong.cid, c)));
  assert.equal(rent.pts, best, "Parent 2 stands in as the rental character that suits them best");
  assert.ok(r[0].value > r[1].value);
});

test("Parent 1 given the deck: sparks for skills her deck already offers count only for their discount", () => {
  const a = vet(uniq[0], top.slice(0, 3).map((id) => [id, 3]));
  const b = vet(uniq[1], top.slice(3, 6).map((id) => [id, 3]));
  const plain = plan.rankVets(x0(), [a, b]);
  const fam = (id) => SB.DATA.skills[id][0];
  const offered = Object.fromEntries(Object.keys(rel.targets).filter((id) => top.slice(0, 3).some((t) => fam(t) === fam(id))).map((id) => [id, 1]));
  const x = plan.context({ ace: { cid: ace.cid, tid: ace.id }, race: { preset, style: "Senkou" }, rel, offers: offered, build: E.BUILDS[preset.build] });
  const deck = plan.rankVets(x, [a, b]);
  assert.equal(plain[0].v.id, a.id, "with no deck, the top whites win");
  assert.equal(deck[0].v.id, b.id, "once her deck offers those skills, the other veteran's sparks matter more");
  assert.ok(deck.find((y) => y.v.id === a.id).value < plain.find((y) => y.v.id === a.id).value);
});

test("a fresh Parent 1: one of your umas, two veterans as her parents, the G1s she shares with them", () => {
  const her = uniq[2], gpA = uniq[3], gpB = uniq[4];
  const fits = open(her);
  const winsA = fits.slice(0, 3), winsB = fits.slice(2, 5);
  const vets = [vet(gpA, [[top[0], 2]], { wins: winsA }), vet(gpB, [[top[1], 2]], { wins: winsB }), vet(her, [[top[2], 1]])];
  const offers = Object.fromEntries(Object.keys(rel.targets).map((id) => [id, 0.5]));
  const r = plan.rankFresh(x0(), vets, [her.id, ace.id], offers);
  assert.equal(r.length, 1, "never the ace");
  const f = r[0];
  assert.equal(f.t.id, her.id);
  assert.deepEqual(f.parents.map((v) => v.cid).sort(), [gpA.cid, gpB.cid].sort(), "her parents: two veterans, neither her own character nor the ace");
  const shared = new Set(winsA.concat(winsB));
  assert.ok([...shared].every((n) => f.f.p1.wins.includes(n)), "she wins every G1 she shares with them");
  assert.ok(f.extra.whites.value > 0, "her expected white sparks count");
  assert.ok(Math.abs(f.value - (f.s.value + f.extra.value)) < 1e-12);
  assert.equal(f.rates.vets, 0, "fewer than 10 veterans with skills: the default rates");
  assert.equal(f.rates.spark, CP.SPARK_P);
});

test("a fresh Parent 1's whites: your veterans' own spark rate and stars", () => {
  const vets = uniq.slice(10, 22).map((t) => vet(t, [[top[0], 1], [top[1], 2], [top[2], 2], [top[3], 3]], { learned: 20 }));
  const q = plan.rates(vets);
  assert.equal(q.vets, 12);
  assert.ok(Math.abs(q.spark - 48 / 240) < 1e-12, "48 white sparks over 240 skills learned");
  assert.deepEqual(q.stars, [0.25, 0.5, 0.25]);
  assert.equal(q.learn, Math.round(20 * 0.75), "learns as many relevant skills as 3/4 of what your veterans learn");
  const none = plan.rates(uniq.slice(10, 22).map((t) => vet(t, [], { learned: 20 })));
  assert.equal(none.spark, 0.15, "a rate the game can't give is held to 15%..45%");
  const x = x0(), all = Object.fromEntries(Object.keys(rel.targets).map((id) => [id, 1]));
  const w = plan.freshWhites(x, all, 0, q);
  assert.ok(Math.abs(w.list.reduce((n, y) => n + y.learn, 0) - q.learn) < 1e-9, "no more skills than she can learn");
  const eff = plan.fam.worthOf(x);
  const firstFam = SB.DATA.skills[w.list[0].id][0];
  assert.equal(eff[firstFam], Math.max(...Object.values(eff)), "the most valuable first");
});

test("is your best veteran good enough? a fresh one only when she beats it by the margin", () => {
  assert.equal(plan.freshWins({ value: 2 }, { value: 2.1 }), false);
  assert.equal(plan.freshWins({ value: 2 }, { value: 2 * (1 + CP.MARGIN) + 0.01 }), true);
  assert.equal(plan.freshWins(null, { value: 0.5 }), true, "no veteran at all");
  assert.equal(plan.freshWins({ value: 2 }, null), false);
});

test("her races: career goals, then the G1s her parents won, then the ones your veterans win most", () => {
  const her = uniq[2], free = open(her), goals = A.careerGoals(her.cid);
  const gp = [vet(uniq[3], [], { wins: free.slice(0, 1) }), vet(uniq[4], [], { wins: free.slice(1, 2) })];
  const crowd = uniq.slice(30, 40).map((t) => vet(t, [], { wins: free.slice(2, 4) }));
  const pl = plan.racePlan({ t: her, parents: gp }, gp.concat(crowd));
  const ext = pl.agenda.filter((r) => !r.free).sort((a, b) => a.rank - b.rank);
  assert.deepEqual(ext.slice(0, 2).map((r) => r.name).sort(), free.slice(0, 2).sort(), "shared with her parents first");
  assert.deepEqual(ext.slice(2, 4).map((r) => r.name).sort(), free.slice(2, 4).sort(), "then the most won");
  assert.ok(ext.slice(2).every((r) => r.pop > 0 && r.extra));
  assert.equal(plan.upTo(pl, 1).filter((r) => !r.free).length, 1, "n extra races: the first n");
  const listed = new Set(pl.agenda.filter((r) => r.free).map((r) => r.name).concat(pl.goals.map((g) => g.name)));
  goals.fixed.forEach((g) => assert.ok(listed.has(g.name), "every career goal race is on her calendar: " + g.name));
});

test("how many extra races keep her at SS: your veterans' ratings, less what each race costs", () => {
  const t = uniq[0], goals = A.careerGoals(t.cid), n0 = goals.fixed.length + goals.choices.length;
  const scores = [19000, 19500, 20000, 20500, 18200, 18400, 18600, 21000, 17000, 22000];
  const vets = scores.map((s) => vet(t, [], { score: s, races: n0 }));
  vets.push(vet(t, [], { score: 16000, races: n0 + 8 }));
  vets.push(vet(t, [], { score: 20000, races: n0, scenario: "unity" }));
  const b = plan.baseline(vets, "grandlive");
  assert.equal(b.n, 10, "only the scenario's runs with no extra races");
  assert.equal(b.ss, 9);
  assert.deepEqual(b.more, { n: 1, ss: 0 });
  // 300 a race: 18,200 - 300n must stay ≥ 17,500 for 8 of the 10 (75%): the 8th best is 18,400.
  const sorted = scores.slice().sort((a, c) => c - a), eighth = sorted[7];
  const lim = plan.ssLimit(b, 300, 20);
  assert.equal(lim.n, Math.floor((eighth - 17500) / 300));
  assert.ok(lim.ss >= 7.5);
  assert.equal(plan.ssLimit(b, 300, 1).n, 1, "never more than she can run");
  assert.equal(plan.baseline(vets.slice(0, 5), "grandlive"), null, "too few to tell");
  const low = plan.baseline(scores.map((s) => vet(t, [], { score: s - 3000, races: n0 })), "grandlive");
  assert.equal(plan.ssLimit(low, 100, 5).none, true);
  const S = require('../rating.js').rankThreshold('S');
  const atS = plan.baseline(vets, 'grandlive', S);
  assert.equal(atS.ss, 10, 'S uses 14,500, not S+ or SS');
  assert.deepEqual(atS.more, { n: 1, ss: 1 }, 'the higher-race sample uses S too');
  const sLimit = plan.ssLimit(atS, 300, 20, S);
  assert.equal(sLimit.n, Math.floor((eighth - S) / 300));
  assert.ok(sLimit.n > lim.n, 'S leaves room for more shared G1s');
  assert.ok(sLimit.ss >= 8, 'at least 75%, rounded up');
  assert.ok(atS.scores.filter(s => s - (sLimit.n + 1) * 300 >= S).length < 8, 'one more race fails');
  assert.equal(plan.ssLimit(atS, 300, 20, 0).n, 20, 'no minimum keeps every available race');
});

test("the uma.moe search: its own filters in the link", () => {
  const p1 = { tid: uniq[0].id, saddles: [10, 11, 10] };
  const q = plan.umaMoe({ ace: ace.id, p1, blue: [0, 2], whites: top.slice(0, 2) });
  assert.ok(q.url.startsWith(CP.UMA_MOE + "?filters="));
  const back = JSON.parse(Buffer.from(decodeURIComponent(q.url.split("filters=")[1]), "base64").toString("utf8"));
  assert.deepEqual(back, q.filters);
  assert.deepEqual(back.t, [ace.id, null, null, null, null, null, null], "the ace: the affinity target");
  assert.equal(back.p2c, uniq[0].id, "Parent 1: the legacy she joins");
  assert.deepEqual(back.p2w, [10, 11], "with her G1 saddles");
  assert.deepEqual(back.mb, [[10, 3, 3], [30, 3, 3, 1]], "Speed 3★ or Power 3★ on the rental herself");
  assert.deepEqual(back.ow, top.slice(0, 2).map((id) => SB.DATA.skills[id][0] * 10), "preferred whites by factor id");
  assert.deepEqual(back.emp, [ace.cid, uniq[0].cid], "exclude every version of the ace and Parent 1 as the rental");
  // uma.moe's factor id is the game's without its star digit: Nimble Navigator 2★ (2004902) → 200490.
  const nn = Object.keys(SB.DATA.skills).find((id) => String(SB.DATA.skills[id][0]) === "20049");
  assert.deepEqual(plan.umaMoe({ ace: ace.id, whites: [nn] }).filters.ow, [200490]);
});

test("uma.moe advanced settings: family stars, own sparks and P0/P1/P2 use the site's codec", () => {
  const x = x0(), p1 = plan.rankVets(x, [vet(uniq[0], [])])[0];
  p1.f.p1.pink = [4, 3];
  const q = plan.rentalSearch(x, p1);
  assert.equal(q.filters.t[0], ace.id, "keeps the target's version");
  assert.equal(q.pink.i, 4, "Medium race: distance pink when no aptitude is missing");
  assert.equal(q.pink.known, 3, "count Parent 1's existing pink before asking the rental");
  assert.deepEqual(q.filters.p, [[330, 3, 9]], "family pink uses the 1–9★ range");
  assert.deepEqual(q.filters.mp, [[330, 3, 3]], "direct parent pink uses the 1–3★ range");
  assert.equal(q.filters.bss, 9);
  assert.ok(q.filters.ow.some(w => !Array.isArray(w)), "P0 is the first priority group");
  assert.ok(q.filters.ow.some(w => Array.isArray(w) && w[1] === 1), "P1 follows P0");
  assert.ok(q.filters.ow.some(w => Array.isArray(w) && w[1] === 2), "P2 follows P1");
  assert.deepEqual(q.filters.omw, q.whites.filter(w => w.priority === 0).map(w => +SB.DATA.skills[w.id][0] * 10));
  for (const k of ['pr', 'sid', 'sc', 'lb', 'mwc', 'mwh', 'rs', 'gss', 'wss']) assert.ok(!(k in q.filters), k + ' stays unrestricted');
  q.focused.forEach(g => {
    assert.ok(g.search.filters.mg.every(w => w[1] === 1 && w[2] === 3), "unique focus is on the rental herself");
    assert.deepEqual(g.search.filters.mg.map(w => w[0]), g.skill.owners.map(t => t.id * 10));
    assert.ok(g.skill.owners.every(t => t.cid !== ace.cid && t.cid !== p1.f.p1.cid), "unique focus never conflicts with main-parent exclusions");
  });
});

test("uma.moe wider search preserves required white families and can leave pink unrestricted", () => {
  const x = x0(), p1 = plan.rankVets(x, [vet(uniq[0], [])])[0];
  const same = Object.keys(SB.DATA.skills).find(id => id !== top[0] && SB.DATA.skills[id][0] === SB.DATA.skills[top[0]][0]);
  const q = plan.rentalSearch(x, p1, { quality: 'broad', pink: 'none', required: [top[0], same || top[0]] });
  assert.equal(q.filters.bss, 6);
  assert.ok(!q.filters.p && !q.filters.mp, "no hidden pink requirement");
  const factor = +SB.DATA.skills[top[0]][0] * 10;
  assert.deepEqual(q.filters.w, [[factor, 1, 9]], "same family's gold/white requirements deduplicate; each family is AND");
  assert.ok(!q.filters.ow.some(w => (Array.isArray(w) ? w[0] : w) === factor), "required is not counted again as optional");
  assert.deepEqual(q.filters.mb.map(w => w.slice(1, 3)), [[3, 3], [3, 3]], "own key-stat blue stays 3★");
  const focus = plan.rentalSearch(x, p1, { quality: 'broad', pink: '7' });
  assert.deepEqual(focus.filters.p, [[220, 1, 9]]);
  assert.ok(!focus.filters.mp, "grandparents can supply the focused pink in the wider search");
  assert.equal(focus.pink.label, 'Pace Chaser');
});

test("rentals you paste, ranked as Parent 2 with your Parent 1", () => {
  const p1 = plan.rankVets(x0(), [vet(uniq[0], [[top[0], 2]])])[0];
  const r = (t, white) => ({ friend: String(t.id), trainer: "T" + t.id, names: [t.n], parent: m(t, white, { blue: [0, 3] }), parents: [null, null], unknown: [] });
  const list = [r(uniq[1], [[top[1], 1]]), r(uniq[2], [[top[1], 3], [top[2], 3]]), r(ace, []), r(uniq[0], [])];
  const out = plan.rankRentals(x0(), p1, list);
  assert.deepEqual(out.map((y) => y.r.friend), [String(uniq[2].id), String(uniq[1].id)]);
  assert.deepEqual(out.hidden.map((h) => h.why), ["same character as the ace", "same character as Parent 1"]);
  list[0].score = 22000;
  list[1].score = 14500;
  assert.deepEqual(plan.rankRentals(x0(), p1, list).map(y => y.r.friend), out.map(y => y.r.friend), "an existing rental's rank adds no value or SS requirement to her actual sparks");
});
