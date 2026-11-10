// The Parents tab's logic (cm-plan.js): Parent 1 from your veterans given the ace's deck, a
// new Parent 1 and her races at SS, the affinity outlook, and both uma.moe searches.
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
const purchaseContext = values => plan.context({ace:{cid:ace.cid,tid:ace.id},race:{preset,style:'Senkou'},rel,build:E.BUILDS[preset.build],skillPlan:{parentValues:values,deckCoverage:{},raceL:L}});

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

test('purchase targets change parent ranking and both decoded rental searches',()=>{
  const a=vet(uniq[0],[[top[0],3]]),b=vet(uniq[0],[[top[1],3]]);
  const x=purchaseContext({[top[0]]:4}),y=purchaseContext({[top[1]]:4});
  assert.equal(plan.rankVets(x,[a,b])[0].v.id,a.id);
  assert.equal(plan.rankVets(y,[a,b])[0].v.id,b.id);
  const p1=plan.rankVets(x,[vet(uniq[0],[])])[0];
  const q=plan.rentalSearch(x,p1,{sort:'whites',pink:'none'}),f=decode(q);
  assert.deepEqual(q.whites.map(w=>w.id),[top[0]]);
  assert.deepEqual(f.ow,[+SB.DATA.skills[top[0]][0]*10]);
  assert.ok(!f.w && !f.pr,'targets never become required whites or a rental rank filter');
  const fresh=plan.rankFresh(x,[vet(uniq[3],[])],[uniq[2].id],{})[0];
  const gp=plan.trainingRentalSearch(x,fresh,{sort:'whites',pink:'none'}),gf=decode(gp);
  assert.deepEqual(gp.whites.map(w=>w.id),[top[0]]);
  assert.deepEqual(gf.omw,[+SB.DATA.skills[top[0]][0]*10]);
  assert.ok(!gf.mw && !gf.pr);
  assert.equal(gf.t[0],fresh.t.id);assert.equal(gf.p2c,fresh.parents[0].tid);
});

test('fresh whites require an affordable purchase and sufficient SS careers',()=>{
  const x=purchaseContext({[top[0]]:4,[top[1]]:3}),t=uniq[2],v=vet(uniq[3],[]);
  const f=SB.DATA.skills[top[0]][0],offers={[top[0]]:1,[top[1]]:1};
  const learning={ssShare:1,ss:16,of:16,skills:{[top[0]]:0.5},families:{[f]:{learn:0.5,spark:0.1}}};
  const fresh=plan.rankFresh(x,[v],[t.id],offers,{plans:{[t.id]:{offers,learning}}})[0];
  assert.deepEqual(fresh.extra.whites.list.map(w=>w.id),[top[0]],'offered but unpurchased skills give no projected spark');
  assert.equal(fresh.extra.whites.list[0].learn,0.5);
  assert.equal(fresh.extra.whites.list[0].spark,0.1);
  assert.equal(fresh.extra.whites.list[0].budgeted,true);
  const weak={...learning,ssShare:0.5,ss:8};
  const blocked=plan.rankFresh(x,[v],[t.id],offers,{plans:{[t.id]:{offers,learning:weak}}})[0];
  assert.equal(blocked.extra.value,0);assert.equal(blocked.extra.unready,true);
  const rental={friend:'checked',parent:m(uniq[4],[]),parents:[null,null]};
  const row=plan.rankRentals(x,blocked,[rental])[0];
  assert.equal(row.value,row.s.value,'a new rental cannot restore unbudgeted fresh-parent credit');
  assert.ok(plan.itSkills(x,{}).length===0,'no random-event wishes fill Independent Training slots');
});

test("a fresh Parent 1: one of your umas, two veterans as her parents, the G1s she shares with them", () => {
  const her = uniq[2], gpA = uniq[3], gpB = uniq[4];
  const fits = open(her);
  const winsA = fits.slice(0, 3), winsB = fits.slice(2, 5);
  const vets = [vet(gpA, [[top[0], 2]], { wins: winsA }), vet(gpB, [[top[1], 2]], { wins: winsB }), vet(her, [[top[2], 1]])];
  const offers = Object.fromEntries(Object.keys(rel.targets).map((id) => [id, 0.5]));
  const r = plan.rankFresh(x0(), vets, [her.id, ace.id], offers, { parentMode: "veterans" });
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

test("a fresh Parent 1's whites: your veterans' own spark rate, SS stars, and copies in her lineage", () => {
  const vets = uniq.slice(10, 22).map((t) => vet(t, [[top[0], 1], [top[1], 2], [top[2], 2], [top[3], 3]], { learned: 20 }));
  const q = plan.rates(vets);
  assert.equal(q.vets, 12);
  assert.ok(Math.abs(q.spark - 48 / 240) < 1e-12, "48 white sparks over 240 skills learned");
  assert.deepEqual(q.stars, [0.2, 0.7, 0.1], "a parent you train is always SS: her white sparks come out 20/70/10%");
  assert.equal(q.learn, Math.round(20 * 0.75), "learns as many relevant skills as 3/4 of what your veterans learn");
  const none = plan.rates(uniq.slice(10, 22).map((t) => vet(t, [], { learned: 20 })));
  assert.equal(none.spark, 0.15, "a rate the game can't give is held to 15%..45%");
  const x = x0(), all = Object.fromEntries(Object.keys(rel.targets).map((id) => [id, 1]));
  const w = plan.freshWhites(x, all, 0, q);
  assert.ok(Math.abs(w.list.reduce((n, y) => n + y.learn, 0) - q.learn) < 1e-9, "no more skills than she can learn");
  const eff = plan.fam.worthOf(x);
  const firstFam = SB.DATA.skills[w.list[0].id][0];
  assert.equal(eff[firstFam], Math.max(...Object.values(eff)), "the most valuable first");
  const copies = { [firstFam]: 2 }, boosted = plan.freshWhites(x, all, 0, q, copies);
  assert.ok(Math.abs(boosted.list[0].spark - w.list[0].learn * (q.spark + 0.05)) < 1e-12, "two copies in her parents and grandparents: +2.5% each");
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

const decode = q => {
  const back = JSON.parse(Buffer.from(new URL(q.url).searchParams.get("filters"), "base64").toString("utf8"));
  assert.deepEqual(back, q.filters);
  return back;
};
test("uma.moe codec: one blue stat across the branch, version target, legacy wins and character exclusions", () => {
  const q = plan.umaMoe({ ace: ace.id, p1: { tid: uniq[0].id, saddles: [10, 11, 10] }, blue: 0, whites: top });
  const f = decode(q);
  assert.deepEqual(f, { t: [ace.id, null, null, null, null, null, null], p2c: uniq[0].id, p2w: [10, 11], mb: [[10, 3, 3]], b: [[10, 7, 9]], emp: [ace.cid, uniq[0].cid] });
});

for (const quality of ["recommended", "broad"]) for (const sort of ["affinity", "whites"]) test(`Parent 2 search decodes every field: ${quality}, ${sort}`, () => {
  const x = x0(), p1 = plan.rankVets(x, [vet(uniq[0], [])])[0];
  p1.v.saddles = [10, 11];
  const q = plan.rentalSearch(x, p1, { quality, sort, blue: 0, pink: "none" });
  const f = decode(q), broad = quality === "broad";
  assert.deepEqual(f.t, [ace.id, null, null, null, null, null, null]);
  assert.equal(f.p2c, uniq[0].id); assert.deepEqual(f.p2w, [10, 11]);
  assert.deepEqual(f.emp, [ace.cid, uniq[0].cid]);
  assert.deepEqual(f.mb, [[10, broad ? 2 : 3, 3]]);
  assert.deepEqual(f.b, [[10, broad ? 6 : 7, 9]]);
  for (const key of ["p", "mp", "bss", "w", "pr"]) assert.ok(!(key in f), key + " is not a hidden requirement");
  const expected = ["t", "p2c", "p2w", "emp", "mb", "b"];
  if (sort === "whites") {
    assert.deepEqual(f.ow, q.whites.map(w => w.priority ? [+SB.DATA.skills[w.id][0] * 10, w.priority] : +SB.DATA.skills[w.id][0] * 10));
    assert.deepEqual(f.omw, q.whites.filter(w => w.priority === 0).map(w => +SB.DATA.skills[w.id][0] * 10));
    assert.ok(f.ow.some(w => Array.isArray(w) && w[1] === 1));
    assert.ok(f.ow.some(w => Array.isArray(w) && w[1] === 2));
    expected.push("ow", "omw");
  }
  assert.deepEqual(Object.keys(f).sort(), expected.sort(), "no other filters");
  const text = plan.searchSummary(q, id => "Skill " + id).join(" · ");
  for (const part of [ace.n, uniq[0].n, "2 G1 wins", "Speed", "Pink: off", "Exclude:", "Sort:"]) assert.ok(text.includes(part), part);
  q.whites.forEach(w => assert.ok(text.includes("Skill " + w.id + (sort === "whites" ? " (P" + w.priority + ")" : ""))));
  q.focused.forEach(g => {
    const gf = decode(g.search);
    const rest = { ...gf }; delete rest.mg; assert.deepEqual(rest, f);
    assert.deepEqual(gf.mg, g.skill.owners.map((t, k) => k ? [t.id * 10, 1, 3, 1] : [t.id * 10, 1, 3]));
    assert.ok(plan.searchSummary(g.search).join(" · ").includes("Own unique:"));
    assert.ok(g.skill.owners.every(t => !gf.emp.includes(t.cid)));
  });
});

test("search defaults: top key blue, pink by the rule, every listed white preferred, required only when ticked", () => {
  const x = x0(), p1 = plan.rankVets(x, [vet(uniq[0], [])])[0];
  const defaults = decode(plan.rentalSearch(x, p1));
  assert.equal(defaults.mb[0][0], CP.BLUE_IDS[plan.want(x).blue[0].i]);
  assert.ok(defaults.ow && defaults.ow.length, "listed whites go in as preferred whites"); assert.ok(!defaults.mp && !defaults.w, "nothing required by default");
  const need = plan.want(x).pink.find(p => p.target === "S") || plan.want(x).pink[0];
  if (need) assert.deepEqual(defaults.p, [[CP.PINK_IDS[need.i], 3, 9]], "pink per the rule by default");
  else assert.ok(!defaults.p, "no pink when she's already there");
  assert.ok(!decode(plan.rentalSearch(x, p1, { pink: "none" })).p, "pink can be turned off");
  const q = plan.rentalSearch(x, p1, { blue: 4, pink: "7", required: [top[0]] });
  const f = decode(q);
  assert.deepEqual(f.b, [[50, 7, 9]]); assert.deepEqual(f.mb, [[50, 3, 3]]);
  assert.deepEqual(f.p, [[220, 3, 9]]); assert.ok(!f.mp);
  assert.deepEqual(f.w, [[+SB.DATA.skills[top[0]][0] * 10, 1, 9]]);
  assert.ok(f.ow.every(o => (Array.isArray(o) ? o[0] : o) !== f.w[0][0]), "a required white isn't also preferred");
  const off = decode(plan.rentalSearch(x, p1, { sort: "affinity" }));
  assert.ok(!off.ow && !off.omw, "affinity only leaves whites out of the link");
  const same = Object.keys(SB.DATA.skills).find(id => id !== top[0] && SB.DATA.skills[id][0] === SB.DATA.skills[top[0]][0]);
  const req = plan.rentalSearch(x, p1, { sort: "whites", required: [top[0], same || top[0], top[1], top[2]] });
  const rf = decode(req);
  const families = new Set([top[0], same || top[0], top[1], top[2]].map(id => SB.DATA.skills[id][0]));
  assert.equal(rf.w.length, families.size, "every ticked family is required, one each");
  assert.ok(rf.w.every(w => !rf.ow.some(o => (Array.isArray(o) ? o[0] : o) === w[0])));
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

function freshFixture() {
  const t = uniq[2], v = vet(uniq[3], [[top[0], 3]], { wins: open(t).slice(0, 2), parents: [uniq[6], uniq[7]], saddles: [10, 11] });
  const x = x0(), fresh = plan.rankFresh(x, [v], [t.id], {})[0];
  const rental = { friend: "qa-rental", trainer: "QA", names: [uniq[4].n, uniq[8].n, uniq[9].n], parent: m(uniq[4], [[top[1], 3]], { blue: [0, 3], wins: open(t).slice(2, 3) }),
    parents: [m(uniq[8], [], { blue: [0, 3] }), m(uniq[9], [], { blue: [0, 3] })] };
  return { x, t, v, fresh, rental };
}

for (const quality of ["recommended", "broad"]) for (const sort of ["affinity", "whites"]) test(`grandparent search asks for her own sparks only: ${quality}, ${sort}`, () => {
  const { x, t, v, fresh } = freshFixture();
  assert.equal(fresh.parentMode, "rental"); assert.equal(fresh.parents.length, 1, "one veteran plus an unfilled rental");
  const q = plan.trainingRentalSearch(x, fresh, { quality, sort, blue: 0, pink: "none" });
  const f = decode(q), broad = quality === "broad";
  assert.deepEqual(f.t, [t.id, null, null, null, null, null, null]);
  assert.equal(f.p2c, v.tid); assert.deepEqual(f.p2w, [...new Set(v.saddles.concat(v.self.wins.map(n => saddles[n]).filter(Boolean)))]);
  assert.deepEqual(f.emp, [t.cid, v.cid]);
  assert.deepEqual(f.mb, [[10, broad ? 2 : 3, 3]], "blue on her"); assert.ok(!f.b, "no lineage blue: her parents never reach the ace");
  assert.ok(!f.p && !f.mp && !f.w && !f.pr && !f.bss);
  const expected = ["t", "p2c", "p2w", "emp", "mb"];
  if (sort === "affinity") assert.ok(!f.ow && !f.omw);
  else {
    assert.ok(!f.ow, "no lineage whites");
    assert.deepEqual(f.omw, q.whites.map(w => w.priority ? [+SB.DATA.skills[w.id][0] * 10, w.priority] : +SB.DATA.skills[w.id][0] * 10), "all preferred whites are hers, by priority");
    expected.push("omw");
  }
  assert.deepEqual(Object.keys(f).sort(), expected.sort());
  const chosen = decode(plan.trainingRentalSearch(x, fresh, { required: [top[0]], pink: "7", quality }));
  assert.deepEqual(chosen.mw, [[+SB.DATA.skills[top[0]][0] * 10, 1, 3]], "a required white on her");
  assert.deepEqual(chosen.mp, [[220, broad ? 1 : 2, 3]], "pink on her: 2–3★, wider 1–3★"); assert.ok(!chosen.p && !chosen.w && !chosen.ow && !chosen.b);
  const text = plan.searchSummary(plan.trainingRentalSearch(x, fresh, { required: [top[0]], pink: "7" }), id => "Skill " + id).join(" · ");
  ["on the rental herself (her own sparks only", "2–3★ on the rental herself", "on the rental herself, 1–3★ each"].forEach(part => assert.ok(text.includes(part), part));
  q.focused.forEach(g => { const gf = decode(g.search); const base = { ...gf }; delete base.mg; assert.deepEqual(base, f); assert.ok(gf.mg.every(w => !f.emp.includes(Math.floor(w[0] / 1000)))); });
  assert.ok(plan.searchSummary(q).join(" · ").includes(t.n));
});

test("rental ranking adds her own sparks for the ace and her lineage for X; great-grandparents drop out", () => {
  const { x, t, v, fresh, rental } = freshFixture();
  const better = JSON.parse(JSON.stringify(rental)); better.friend = "qa-better";
  better.parents.forEach(g => { g.white = [[top[2], 3]]; });
  const rows = plan.rankTrainingRentals(x, fresh, [rental, better]);
  assert.equal(rows[0].r.friend, "qa-better");
  assert.equal(rows[0].acePart.value, rows[1].acePart.value, "R's parents never contribute to the ace");
  assert.ok(rows[0].trainingPart.value > rows[1].trainingPart.value, "R's lineage gives X relevant hints");
  for (const row of rows) {
    assert.ok(Math.abs(row.value - row.acePart.value - row.trainingPart.value) < 1e-12);
    assert.equal(row.f.g12.tid, rental.parent.tid);
    assert.deepEqual(row.trainingPart.start, [63, 0, 0, 0, 0], "all three blues help X's key-stat / SS targets");
    assert.deepEqual(row.acePart.start, [21, 0, 0, 0, 0], "only R's own blue helps the ace");
    assert.ok(row.trainingPart.stats[0] > row.trainingPart.start[0], "over the run, blues add more at the inspirations");
    assert.deepEqual(row.trainingScore.own, A.individual({ trainee: t.cid, p1: v.cid, p2: rental.parent.cid, g11: v.parents[0].cid, g12: v.parents[1].cid, g21: rental.parents[0].cid, g22: rental.parents[1].cid }, { p1: v.self.wins, p2: rental.parent.wins, g11: [], g12: [], g21: [], g22: [] }));
  }
  const invalid = { ...rental, parent: m(t) };
  assert.equal(plan.rankTrainingRentals(x, fresh, [invalid]).hidden.length, 1);
  const oldRank = rows.map(r => r.r.friend); rental.score = 22000; better.score = 12000;
  assert.deepEqual(plan.rankTrainingRentals(x, fresh, [rental, better]).map(r => r.r.friend), oldRank, "rental rating is irrelevant");
});

test("fresh-parent rental choice keeps X's borrowed parent and puts her shared G1s first", () => {
  const { x, t, v, rental } = freshFixture();
  const f = plan.rankFresh(x, [v], [t.id], {}, { rental })[0];
  assert.equal(f.parents.length, 2); assert.equal(f.parents[1].rental, rental.friend);
  assert.equal(f.f.g12.tid, rental.parent.tid);
  assert.equal(plan.trainingStart(x, f)[0], 84, "V's 3★ plus the rental's 9★ lineage become X's starting stats");
  const races = plan.racePlan(f, [v]);
  const shared = races.agenda.filter(r => !r.free && r.with.length).sort((a, b) => a.rank - b.rank);
  assert.ok(shared.length >= 2);
  assert.ok(rental.parent.wins.includes(shared[0].name), "R's G1 first among equally shared races");
  assert.equal(shared[0].points, 3);
  const cut = plan.rankTrainingRentals(x, f, [rental], { maxRaces: 1, vets: [v] })[0];
  assert.ok(cut.f.p1.wins.includes(shared[0].name));
  const limited = plan.atRaceCount(x, f, races, 1);
  assert.deepEqual(limited.f.p1.wins, plan.raceWins(races, 1), "ace affinity never assumes X wins rank-cut races");
  A.goalG1s(t.cid).forEach(g => assert.ok(limited.f.p1.wins.includes(g.name), "fixed career G1 wins are kept even when not shared yet"));
  assert.equal(cut.s.own.g12, A.together(x.ace.cid, t.cid, rental.parent.cid) + 3 * A.shared(cut.f.p1.wins, rental.parent.wins).length);
});

test("the ace's gaps pick the blue for both searches; the grandparent search uses the ace's pink rule and missing whites", () => {
  const gaps = [0, 300, 0, 120, 0];
  const x = plan.context({ ace: { cid: ace.cid, tid: ace.id }, race: { preset, style: "Senkou" }, rel, offers: null, build: E.BUILDS[preset.build], gaps });
  assert.deepEqual(plan.want(x).blue.map(b => b.i), [1, 3], "gap stats, biggest first");
  const p1 = plan.rankVets(x, [vet(uniq[0], [])])[0];
  const f2 = decode(plan.rentalSearch(x, p1));
  assert.deepEqual(f2.mb, [[CP.BLUE_IDS[1], 3, 3]]); assert.deepEqual(f2.b, [[CP.BLUE_IDS[1], 7, 9]]);
  const t = uniq[2], v = vet(uniq[3], [], { saddles: [10] });
  const fresh = plan.rankFresh(x, [v], [t.id], {})[0];
  const gq = plan.trainingRentalSearch(x, fresh), gf = decode(gq);
  assert.deepEqual(gf.t, [t.id, null, null, null, null, null, null], "the new parent is the affinity target");
  assert.equal(gf.p2c, v.tid, "your veteran is the other parent");
  assert.deepEqual(gf.emp, [t.cid, v.cid], "neither can be the grandparent");
  assert.deepEqual(gf.mb, [[CP.BLUE_IDS[1], 3, 3]], "blue in the ace's biggest gap, on her"); assert.ok(!gf.b);
  const need = plan.want(x).pink.find(p => p.target === "S") || plan.want(x).pink[0];
  assert.ok(need && need.target === "S", "Special Week takes Medium to S");
  assert.deepEqual(gf.mp, [[CP.PINK_IDS[need.i], 2, 3]], "pink by the ace's rule, on her"); assert.ok(!gf.p && !gf.ow && !gf.w);
  assert.deepEqual(gf.omw, gq.whites.map(w => w.priority ? [+SB.DATA.skills[w.id][0] * 10, w.priority] : +SB.DATA.skills[w.id][0] * 10), "the ace's missing whites preferred on her");
  assert.deepEqual(gq.whites.map(w => w.id), plan.missingWhites(x, fresh.s).slice(0, 12).map(w => w.id), "the ace's missing whites, listed");
  const text = plan.searchSummary(gq).join(" · ");
  ["Affinity target: " + t.n, "Other parent (legacy): " + uniq[3].n, "Blue: Stamina", "to take the ace to S", "Her own preferred whites", "Exclude:", "Sort: rentals with P0 whites first"].forEach(s => assert.ok(text.includes(s), s));
});

test("the ace's family affinity once you borrow: open slots take the best-affinity characters with popular G1s", () => {
  const x = x0(), t = uniq[2], v = vet(uniq[3], [], { wins: open(t).slice(0, 2) });
  const fresh = plan.rankFresh(x, [v], [t.id], {})[0];
  const y = plan.outlook(x, fresh.f, [v]);
  assert.deepEqual(y.filled.slice().sort(), ["g12", "g21", "g22", "p2"], "grandparent, Parent 2 and her parents are borrowed");
  assert.ok(y.total > y.known, "borrowed slots add affinity");
  assert.equal(y.known, A.total({ trainee: ace.cid, p1: t.cid, g11: v.cid }, { p1: fresh.f.p1.wins, g11: fresh.f.g11.wins }).total);
  assert.ok(!y.family.g12.cid || y.family.g12.cid !== t.cid && y.family.g12.cid !== v.cid, "the grandparent is neither of her parents' characters");
  const full = Object.assign({}, fresh.f, { g12: m(uniq[4]), p2: m(uniq[5]), g21: m(uniq[6]), g22: m(uniq[7]) });
  const z = plan.outlook(x, full, [v]);
  assert.deepEqual(z.filled, []); assert.equal(z.total, z.known, "nothing assumed once every member is known");
});

test("the new parent's veteran: ranked best first, never the ace's own character", () => {
  const x = x0(), t = uniq[2];
  const own = vet(ace, top.map((id) => [id, 3]), { wins: open(t) });
  const a = vet(uniq[3], [[top[0], 3]], { wins: open(t).slice(0, 2) }), b = vet(uniq[4], [], {});
  const fresh = plan.rankFresh(x, [own, a, b], [t.id], {})[0];
  assert.notEqual(fresh.parents[0].cid, ace.cid, "the ace's character would have 0 affinity as her grandparent");
  assert.ok(fresh.vetOptions.every((o) => o.v.cid !== ace.cid && o.v.cid !== t.cid));
  assert.deepEqual(fresh.vetOptions.map((o) => o.value), fresh.vetOptions.map((o) => o.value).slice().sort((p, q) => q - p), "best first");
  assert.equal(fresh.parents[0], fresh.vetOptions[0].v, "the suggestion is the top one");
  const picked = plan.rankFresh(x, [own, a, b], [t.id], {}, { picks: { [t.id]: { veteran: String(b.id) } } })[0];
  assert.equal(picked.parents[0].id, b.id, "your pick wins"); assert.equal(picked.vetOptions.length, fresh.vetOptions.length, "and the list stays whole");
});

test("the parent you planned, once imported, is found by version and date or by her veteran parent", () => {
  const t = uniq[2], plan0 = { tid: t.id, vet: uniq[3].cid, at: "2026-11-06T12:00:00Z" };
  const older = Object.assign(vet(t, []), { at: "2026-10-01 10:00:00" });
  assert.equal(plan.trainedParent(plan0, [older]), null, "a veteran of her from before the plan isn't the new one");
  const made = Object.assign(vet(t, [], { parents: [uniq[3], uniq[8]] }), { at: "2026-11-07 09:30:00" });
  const later = Object.assign(vet(t, []), { at: "2026-11-08 09:30:00" });
  assert.equal(plan.trainedParent(plan0, [older, made]), made);
  assert.equal(plan.trainedParent(plan0, [older, made, later]), later, "the newest one made after the plan");
  assert.equal(plan.trainedParent({ tid: t.id, vet: uniq[3].cid }, [older, made]), made, "no date: her veteran parent identifies her");
  assert.equal(plan.trainedParent(null, [made]), null);
  assert.equal(plan.trainedParent(plan0, [vet(uniq[4], [])]), null, "another uma never counts");
});

test("Parent 2's blue goes to the gap her known family leaves open", () => {
  const gaps = [0, 45, 0, 40, 0];
  const x = plan.context({ ace: { cid: ace.cid, tid: ace.id }, race: { preset, style: "Senkou" }, rel, offers: null, build: E.BUILDS[preset.build], gaps });
  const covers = plan.rankVets(x, [vet(uniq[0], [], { blue: [1, 3], parents: [uniq[5], uniq[6]] })])[0];
  assert.ok(covers.s.blueStats[1] >= 45, "her Stamina 3★ covers the Stamina gap");
  const q = plan.rentalSearch(x, covers);
  assert.equal(q.blue[0].i, 3, "so the rental's blue goes to Guts");
  assert.deepEqual(q.remaining, [0, 0, 0, 40, 0]);
  assert.deepEqual(decode(q).mb, [[CP.BLUE_IDS[3], 3, 3]]);
  const none = plan.rankVets(x, [vet(uniq[0], [], { blue: [0, 3] })])[0];
  assert.equal(plan.rentalSearch(x, none).blue[0].i, 1, "a family with no blue there leaves the biggest gap first");
});

test("Independent Training's prioritized skills: offered race whites by value × chance, gold when offered, then random-event gambles, 10 at most", () => {
  const x = x0();
  const w = plan.want(x).white;
  const offers = {}; offers[w[0].id] = 0.3; offers[w[1].id] = 0.9; offers[w[2].id] = 0.9;
  const gold = Object.keys(SB.DATA.skills).find(id => SB.DATA.skills[id][3] === 2 && SB.DATA.skills[id][0] === SB.DATA.skills[w[2].id][0]);
  if (gold) offers[gold] = 0.5;
  const list = plan.itSkills(x, offers, 10);
  assert.equal(list.length, Math.min(10, list.length)); assert.ok(list.length <= 10);
  const offered = list.filter(k => !k.gamble);
  assert.equal(offered.length, 3, "only the whites her deck offers count as offered");
  assert.deepEqual(offered.map(k => k.score), offered.map(k => k.score).slice().sort((a, b) => b - a), "most valuable × likely first");
  assert.ok(list.findIndex(k => k.gamble) === -1 || list.findIndex(k => k.gamble) >= offered.length, "gambles only after every offered one");
  if (gold) { const g = list.find(k => SB.DATA.skills[k.id][0] === SB.DATA.skills[w[2].id][0]); assert.equal(g.id, gold); assert.ok(g.gold); }
  assert.equal(plan.itSkills(x, offers, 2).length, 2);
});

test("a skill an event gives on every choice takes no priority slot; one given on one choice keeps its slot", () => {
  const x = x0(), w = plan.want(x).white;
  const offers = {}; offers[w[0].id] = 0.9; offers[w[1].id] = 0.9; offers[w[2].id] = 0.5;
  const all = plan.itSkills(x, offers, 10);
  const anyway = new Set([String(all[0].id)]);
  const list = plan.itSkills(x, offers, 10, anyway);
  assert.ok(!list.some(k => k.id === all[0].id), "it comes whatever is picked");
  assert.deepEqual(list.anyway.map(k => k.id), [all[0].id], "listed apart");
  assert.equal(list.filter(k => !k.gamble).length, all.filter(k => !k.gamble).length - 1, "its slot goes to the next skill");
});

test("whites the ace's family already gives rank lower on the parent you train; the family's blues shrink her gaps", () => {
  const x = x0(), w = plan.want(x).white;
  const offers = {}; w.slice(0, 4).forEach(k => { offers[k.id] = 0.9; });
  const v = vet(uniq[3], [[w[0].id, 3]], { blue: [1, 3] });
  const t = uniq[2], fresh = plan.rankFresh(x, [v], [t.id], offers)[0];
  const cover = plan.familyCover(fresh.s);
  const famOf = (id) => SB.DATA.skills[id][0];
  const g = fresh.s.white.find(k => famOf(k.id) === famOf(w[0].id));
  assert.ok(g && Math.abs(cover[famOf(w[0].id)] - g.p) < 1e-12, "her veteran's 3★ spark: the chance it fires for the ace");
  const plain = plan.itSkills(x, offers, 10), aware = plan.itSkills(x, offers, 10, new Set(), cover);
  const rank = (list) => list.findIndex(k => famOf(k.id) === famOf(w[0].id));
  assert.ok(rank(aware) >= rank(plain), "it moves down");
  assert.equal(aware.find(k => famOf(k.id) === famOf(w[0].id)).cover, cover[famOf(w[0].id)]);
  assert.equal(fresh.extra.whites.list.find(k => famOf(k.id) === famOf(w[0].id)).cover, cover[famOf(w[0].id)], "the parent's own white list knows it too");
  assert.ok(fresh.s.blueStats[1] > 21, "her veteran's Stamina 3★: the start bonus and more");
});

test("pink: an aptitude still below A comes first (start stars lift it for sure), then your rule's S", () => {
  const apt = ace.apt.slice(); apt[0] = "B"; // Turf B on a turf race
  const x = plan.context({ ace: { cid: ace.cid, tid: ace.id, apt }, race: { preset, style: "Senkou" }, rel, offers: null, build: E.BUILDS[preset.build] });
  const p1 = plan.rankVets(x, [vet(uniq[0], [])])[0];
  const q = plan.rentalSearch(x, p1);
  assert.equal(q.pink.label, "Turf", "Turf B → A first");
  assert.equal(q.pink.target, "A");
  const sI = plan.want(x).pink.find(p => p.target === "S").i;
  assert.deepEqual(decode(q).p, [[CP.PINK_IDS[0], 1, 9], [CP.PINK_IDS[sI], 3, 9]], "B → A: any 1★ lifts it; and her line also carries the S-distance pink");
  assert.ok(plan.searchSummary(q).join(" · ").includes("to take the ace to S"));
  const gpq = plan.trainingRentalSearch(x, plan.rankFresh(x, [vet(uniq[3], [])], [uniq[2].id], {})[0]);
  assert.equal(decode(gpq).mp.length, 1, "the grandparent is one uma: one pink");
  assert.ok(plan.searchSummary(q).join(" · ").includes("1–9★ across her and her parents") && plan.searchSummary(q).join(" · ").includes("enough to lift the ace's Turf B to A"));
  const aptC = ace.apt.slice(); aptC[0] = "C";
  const xC = plan.context({ ace: { cid: ace.cid, tid: ace.id, apt: aptC }, race: { preset, style: "Senkou" }, rel, offers: null, build: E.BUILDS[preset.build] });
  assert.deepEqual(decode(plan.rentalSearch(xC, plan.rankVets(xC, [vet(uniq[0], [])])[0])).p[0], [CP.PINK_IDS[0], 4, 9], "C → A: two grades need 4★");
  const some = vet(uniq[0], [], {}); some.self.pink = [0, 2];
  const qSome = plan.rentalSearch(xC, plan.rankVets(xC, [some])[0]);
  assert.deepEqual(decode(qSome).p[0], [CP.PINK_IDS[0], 2, 9], "her family's 2★ counts: 2 more make 4★");
  assert.equal(decode(plan.rentalSearch(xC, plan.rankVets(xC, [some])[0], { pink: "0" })).p.length, 1, "picking one aptitude yourself asks for just that one");
  assert.equal(plan.pinkFocus(x, p1.s).label, "Turf");
  // her family already brings Turf pink: it lifts her to A, so pink goes to the S rule
  const lifted = plan.rankVets(x, [vet(uniq[0], [], { parents: [] })].map(v => (v.self.pink = [0, 2], v)))[0];
  assert.ok(lifted.s.pink.find(p => p.i === 0).p >= 0.9);
  const q2 = plan.rentalSearch(x, lifted);
  assert.equal(q2.pink.target, "S"); assert.notEqual(q2.pink.label, "Turf");
  assert.equal(plan.pinkFocus(x, lifted.s).target, "S");
});

test("a planned blue split: Parent 2's own stat on her, each stat's stars across her line", () => {
  const x = x0(), p1 = plan.rankVets(x, [vet(uniq[0], [])])[0];
  const q = plan.rentalSearch(x, p1, { blueRows: { main: [1, 3], line: [[1, 6], [2, 3]] } });
  const f = decode(q);
  assert.deepEqual(f.mb, [[CP.BLUE_IDS[1], 3, 3]]);
  assert.deepEqual(f.b, [[CP.BLUE_IDS[1], 6, 9], [CP.BLUE_IDS[2], 3, 9]], "Stamina 6–9★ and Power 3–9★ across her and her parents");
  const text = plan.searchSummary(q).join(" · ");
  assert.ok(text.includes("Stamina 3★ on the rental herself") && text.includes("Stamina 6–9★") && text.includes("Power 3–9★"));
  const gp = decode(plan.trainingRentalSearch(...(() => { const t = uniq[2], v = vet(uniq[3], []); const fr = plan.rankFresh(x, [v], [t.id], {})[0]; return [x, fr, { blueRows: { main: [3, 2], line: [] } }]; })()));
  assert.deepEqual(gp.mb, [[CP.BLUE_IDS[3], 2, 3]], "the grandparent's own blue at the planned stars"); assert.ok(!gp.b);
});

test("searches and the parent's skill list only use whites out on Global today", () => {
  const out = (id) => !!(SV.skills[id] && SV.skills[id][3]);
  const planNow = CP.create({ A, F, skills: SB.DATA.skills, trainees: G.trainees, chars, saddles, SS: 17500, outNow: out });
  const x = planNow.context({ ace: { cid: ace.cid, tid: ace.id }, race: { preset, style: "Senkou" }, rel, offers: null, build: E.BUILDS[preset.build] });
  const q = planNow.rentalSearch(x, planNow.rankVets(x, [vet(uniq[0], [])])[0]);
  assert.ok(q.whites.length && q.whites.every(w => out(w.id)), "only whites a rental can have now");
  const offers = {}; planNow.want(x).white.forEach(w => { offers[w.id] = 0.5; });
  assert.ok(planNow.itSkills(x, offers, 10).every(k => out(k.id) || out(k.white)));
});
