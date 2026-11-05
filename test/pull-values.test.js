const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../deck.js");
const T = require("../tiers.js");
const A = require("../affinity.js");
const B = require("../data/banners.js");
const P = require("../data/presets.js");
const PV = require("../pull-values.js");
const PP = require("../pull-planner.js");
const fs = require("fs");

// The Dirt team (El Condor Pasa, Copano Rickey and Valentine Yukino Bijin, all Pace Chasers) over
// 18 months, with a fixed sample collection.
const today = "2026-11-04", until = "2028-05-04";
const skills = (p, style) => { const L = {}; require("../data/skillvalues/" + p.id + ".json")[style].forEach(([id, m]) => { L[id] = m / 100; }); return L; };
let seed = 5;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const owned = {};
D.DATA.supports.filter((c) => D.onGlobal(c, today) && c.r >= 2).forEach((c) => { if (rnd() < 0.5) owned[c.id] = Math.floor(rnd() * 5); });
const teams = { sm: [], ml: [], dirt: [{ id: 101401, style: "Senkou" }, { id: 109801, style: "Senkou" }, { id: 102902, style: "Senkou" }] };
const make = (extra) => PV.create(Object.assign({ D, T, A, B, P, today, until, teams, owned, umas: new Set([101401]),
  deckOpts: (p, style, tid, scen) => ({ scenario: scen || "GM", trainee: tid, skills: skills(p, style), costs: {}, skillWeight: 1, borrow: true }),
  whites: () => [1, 0.8, 0.6], skillL: (p, style, id) => skills(p, style)[id] || 0 }, extra || {}));
// One prepared run, shared (decks are the slow part).
let base = null;
const prepared = () => {
  if (base) return base;
  base = make();
  base.pairs.forEach((pair) => base.buildPair(pair));
  base.prepare();
  return base;
};

test("your team counts as yours, from when you'll have her: every Dirt cup has its three, a flex until then", () => {
  const mine = new Set(D.DATA.trainees.filter((t) => D.onGlobal(t, today)).map((t) => t.id));
  const v = make({ umas: mine });
  const dirtCups = P.list.filter((p) => p.global.start > today && p.global.start <= until && PV.groupOf(p) === "dirt");
  assert.equal(v.pairs.length + v.unrotated.length, dirtCups.length * 3);
  // Valentine Yukino Bijin isn't out on Global until her release: her slot is a flex before it.
  const out = B.release.trainees["102902"];
  assert.ok(v.pairs.filter((x) => x.trainee.id === 102902 && !x.rotating).every((x) => x.date > out));
  assert.ok(v.pairs.some((x) => x.member.waiting === 102902 && x.date <= out && x.rotating), "a flex in her slot before");
  assert.ok(v.items.every((it) => it.kind !== "trainee" || it.feat.every((f) => !v.team.has(f.id))), "no carats go to a team uma");
  assert.ok(v.items.every((it) => !it.required));
});

test("banners are 200 or 400 pulls; the $20.99 packs bring 1,500 carats each", () => {
  const v = make();
  v.items.filter((it) => it.kind === "support").forEach((it) => {
    assert.equal(it.most, 2);
    assert.equal(it.pullsAt(1), 200);
    assert.equal(it.pullsAt(2), 400);
  });
  const anniv = (B.events || []).filter((e) => e.start > today && e.start <= until);
  assert.ok(anniv.length >= 3, "anniversaries in the window");
  assert.equal(v.selectors.length, anniv.length * 3, "free and $20.99 support selectors and the $20.99 Uma selector");
  assert.equal(v.bonus.length, anniv.length * 2);
  assert.ok(v.bonus.every((b) => b.carats === 1500));
  const none = make({ selectors: { free: false, paid: false, uma: false } });
  assert.equal(none.selectors.length + none.bonus.length, 0);
});

test("your decks now: six cards each, kept as they were before the route", () => {
  const v = prepared();
  assert.ok(v.pairs.every((pair) => pair.deck && pair.deck.length === 6 && pair.base.length === 6));
  assert.ok(v.pairs.every((pair) => pair.deck.filter((c) => c.borrowed).length === 1), "one friend's card each");
  // The decks are built from your cards: every owned slot is a card you have, at your limit break.
  // (or a story event's free SSR, at LB4 once its event is over).
  v.pairs.forEach((pair) => pair.base.filter((c) => !c.borrowed).forEach((c) => {
    if (v.freeCards.has(c.id) && v.freeCards.get(c.id) < pair.date) assert.equal(c.lb, 4, D.card(c.id).n);
    else assert.equal(c.lb, owned[c.id], D.card(c.id).n);
  }));
  const late = v.pairs[v.pairs.length - 1], free = [...v.freeCards].filter(([, by]) => by < late.date).map(([id]) => id);
  assert.ok(free.length > 0 && free.every((id) => v.poolFor(late).some((c) => c.id === id && c.lb === 4)), "the free event SSRs are in your cards for the deck, at LB4");
});

test("a card counts only where it's clearly stronger, in enough cups; a banner only if its likely result is", () => {
  const v = prepared();
  const sup = v.items.filter((it) => it.kind === "support");
  const vals = sup.map((it) => ({ it, v1: v.value(it.key, 1), v2: v.value(it.key, 2) }));
  assert.ok(vals.some((x) => x.v1 > 0 || x.v2 > 0), "some banner clears the rules for the Dirt team");
  vals.forEach((x) => assert.ok(x.v2 >= x.v1 - 1e-6, "400 pulls are worth at least 200: " + x.it.key));
  // Stricter rules never add value; looser ones never take it away (same decks, reused).
  const strict = make({ minPct: 0.3, minCups: 3, reuse: v });
  strict.pairs.forEach((pair) => strict.buildPair(pair));
  strict.prepare();
  const loose = make({ minPct: 0.05, minCups: 1, reuse: v });
  loose.pairs.forEach((pair) => loose.buildPair(pair));
  loose.prepare();
  assert.deepEqual(strict.pairs.map((p) => p.base.map((c) => c.id)), v.pairs.map((p) => p.base.map((c) => c.id)), "reused decks");
  sup.forEach((it) => {
    const s = strict.value(it.key, 2), m = v.value(it.key, 2), l = loose.value(it.key, 2);
    assert.ok(s <= m + 1e-6 && m <= l + 1e-6, it.key + ": " + [s, m, l].join(" ≤ "));
  });
  // A banner worth nothing at 200 pulls has a likely result (spark + median pulls) that doesn't
  // clear the rules.
  const zero = vals.find((x) => x.v1 === 0 && x.v2 > 0);
  if (zero) {
    const r = v.review(zero.it.key);
    assert.ok(r.cards.some((c) => c.clear >= 2), "clear at LB4 in two cups, not at LB1");
  }
});

test("the route: selector picks first and free, only 200 or 400 pulls, never below zero carats", () => {
  const v = make({ reuse: prepared() });
  v.pairs.forEach((pair) => v.buildPair(pair));
  v.prepare();
  const rt = v.route(PP, { today, carats: 30000, perMonth: 3000 });
  while (rt.step());
  const { plan, gains, runners } = rt.result();
  assert.ok(plan.steps.length > 0);
  // No pick goes to a card the pulls (or earlier picks) already bring to LB4.
  plan.steps.forEach((s) => {
    const it = v.byKey.get(s.key);
    if (it.kind !== "selector" || it.pick !== "support") return;
    const sameDay = plan.steps.filter((x) => { const y = v.byKey.get(x.key); return y.kind === "selector" && y.pick === "support" && y.date === it.date && y.id === it.id; }).length;
    assert.ok(v.copiesBy(it.id, it.date, s.key) + sameDay <= 5, "no wasted pick: " + s.key);
    assert.ok(gains.get(s.key) > 0, "every pick adds something");
  });
  // A selector's runners-up: its other picks, best first, none worth more than the pick.
  assert.ok(runners.size > 0);
  runners.forEach((alt, key) => {
    const dv = gains.get(key);
    const it = v.byKey.get(key);
    alt.forEach((x, i) => {
      assert.notEqual(x.key, key);
      assert.equal(v.byKey.get(x.key).group, it.group, "same selector");
      assert.ok(x.value <= dv + 1e-6, "the pick is the best there");
      if (i) assert.ok(x.value <= alt[i - 1].value + 1e-9, "best first");
    });
  });
  // A banner's notes tell the sparked card from the copies that came with the pulls.
  plan.steps.forEach((s) => {
    const it = v.byKey.get(s.key), c = v.committed.get(s.key);
    if (it.kind === "support") c.notes.forEach((x) => assert.equal(x.side, c.spark.indexOf(x.id) === -1, x.id + " on " + s.key));
    if (it.kind === "selector" && it.pick === "support") c.notes.forEach((x) => assert.equal(x.side, false));
  });
  assert.ok(plan.steps.every((s) => s.left >= -1e-6), "carats at every banner");
  plan.steps.forEach((s) => {
    const it = v.byKey.get(s.key);
    if (it.kind === "selector") assert.equal(s.pulls, 0);
    else assert.ok(s.pulls === 200 || s.pulls === 400, s.key + " " + s.pulls);
  });
  const perSelector = new Map();
  plan.steps.forEach((s) => { const it = v.byKey.get(s.key); if (it.kind === "selector") perSelector.set(it.sel.id, (perSelector.get(it.sel.id) || 0) + 1); });
  assert.ok([...perSelector.values()].every((n) => n === 1), "one pick per selector");
  // A pulled card goes into the decks it makes clearly stronger, in two cups or more.
  const pulled = plan.steps.find((s) => v.byKey.get(s.key).kind === "support");
  if (pulled) {
    const c = v.committed.get(pulled.key);
    const clear = c.notes.filter((x) => x.clear);
    assert.ok(new Set(clear.map((x) => x.pair.cup.id)).size >= 2, "used in two cups or more");
    clear.forEach((x) => assert.ok(x.pct >= 0.1 - 1e-9));
    assert.ok(c.spark.length === pulled.pulls / 200);
  }
  // The picks anyway go only to the selectors the route leaves open, and the route stays as it was.
  const sig = () => v.pairs.map((p) => p.deck && p.deck.map((c) => c.id + ":" + c.lb + ":" + c.score.toFixed(6)).join(",")).join("|");
  const before = sig(), keys = [...v.committed.keys()].join(",");
  const any = v.anyway();
  while (any.step());
  any.result().forEach((x, sid) => assert.ok(!perSelector.has(sid), "a selector the route leaves open: " + sid));
  assert.equal(sig(), before, "the route's decks put back");
  assert.equal([...v.committed.keys()].join(","), keys, "the route's picks and pulls as they were");
});

test("selectors left open: picks anyway, planned together (each with the ones before it in your decks)", () => {
  // Rules nothing clears, so every selector is open.
  const v = make({ minCups: 99, reuse: prepared() });
  v.pairs.forEach((pair) => v.buildPair(pair));
  v.prepare();
  const sig = () => v.pairs.map((p) => p.deck && p.deck.map((c) => c.id + ":" + c.lb + ":" + c.score.toFixed(6)).join(",")).join("|");
  const before = sig(), gains = v.pairs.map((p) => p.gains && p.gains.size);
  const any = v.anyway();
  assert.equal(any.total(), v.selectors.filter((s) => s.kind === "support").length);
  while (any.step());
  const sug = any.result();
  assert.ok(sug.size > 0, "some pick adds to your decks");
  const count = new Map();
  v.selectors.filter((s) => s.kind === "support").forEach((s) => {
    const x = sug.get(s.id);
    if (!x) return;
    assert.ok(v.items.some((it) => it.kind === "selector" && it.sel === s && it.id === x.id), "a card from that selector's pool");
    // A card's copies in date order, each a limit break on: never past LB4.
    const n = count.get(x.id) || 0;
    assert.equal(x.have, Math.min(5, v.copiesAtPick(x.id, s.date) + n), D.card(x.id).n + " counts the picks of it before");
    assert.ok(x.have < 5, "never past LB4");
    assert.ok(x.value >= 0.5 && x.cups >= 1 && x.from && x.from.date > s.date, "adds points after its date");
    count.set(x.id, n + 1);
  });
  const lbs = [...sug.values()].map((x) => x.id + ":" + x.have);
  assert.equal(new Set(lbs).size, lbs.length, "no card twice at the same limit break");
  assert.equal(sig(), before, "your decks put back");
  assert.deepEqual(v.pairs.map((p) => p.gains && p.gains.size), gains);
  assert.equal([...v.committed.keys()].length, 0, "nothing left in the route");
});

test("Parent 1's value grows with her affinity with the ace", () => {
  const v = make();
  const pair = v.pairs.find((x) => x.trainee.id === 101401);
  const grass = D.DATA.trainees.find((t) => t.n === "Grass Wonder");
  const urara = D.DATA.trainees.find((t) => t.n === "Haru Urara");
  const ga = v.parentAffinity(pair.trainee.cid, grass.cid), ua = v.parentAffinity(pair.trainee.cid, urara.cid);
  assert.ok(ga > ua, "El Condor Pasa and Grass Wonder are closer than El Condor Pasa and Haru Urara");
  const flat = make({ deckOpts: () => ({}), skillL: () => 0 });
  const fp = flat.pairs.find((x) => x.trainee.id === 101401);
  assert.ok(flat.parentValue(fp, grass) > flat.parentValue(fp, urara));
  assert.equal(flat.parentValue(fp, fp.trainee), 0, "she can't be her own parent");
});

test("copies after the pulls: the spark plus the binomial, capped at LB4", () => {
  const v = make();
  const d = v.copiesDist(0.0075, 200, 0, 1);
  assert.equal(d[0], 0, "the spark makes one copy certain");
  assert.ok(Math.abs(d.reduce((a, x) => a + x, 0) - 1) < 1e-9);
  assert.equal(PV.median(PV.binom(200, 0.0075)), 1, "200 pulls likely bring one more copy");
  assert.equal(PV.median(PV.binom(400, 0.0075)), 3);
  assert.equal(v.copiesDist(0.0075, 400, 3, 2)[5], 1, "two sparks from LB2 always reach LB4");
});

test("a rotating slot: each cup the uma of yours that fits it, a fresh one when another fits; no parent value", () => {
  const mine = new Set(D.DATA.trainees.filter((t) => D.onGlobal(t, today)).map((t) => t.id));
  const v = make({ teams: { sm: [], ml: [], dirt: [{ id: 101401, style: "Senkou" }, { id: 109801, style: "Senkou" }, { rotate: true }] }, umas: mine });
  const rot = v.pairs.filter((p) => p.rotating);
  const cups = [...new Set(v.pairs.map((p) => p.cup.id))];
  assert.equal(rot.length, cups.length, "one rotating uma a cup");
  const R = { S: 8, A: 7 };
  rot.forEach((p) => {
    const t = p.trainee, apt = t.apt;
    assert.ok(R[apt[1]] && R[apt[{ Sprint: 2, Mile: 3, Medium: 4, Long: 5 }[p.cup.course.dist]]] && R[apt[{ Nige: 6, Senkou: 7, Sasi: 8, Oikomi: 9 }[p.member.style]]], t.n + " fits " + p.cup.id);
    assert.ok([101401, 109801].every((id) => D.trainee(id).cid !== t.cid), "not a fixed uma's character");
    assert.equal(v.parentValue(p, D.trainee(101401)), 0, "parents count for the fixed umas only");
  });
  for (let i = 1; i < rot.length; i++) assert.notEqual(rot[i].trainee.id, rot[i - 1].trainee.id, "a fresh uma each cup");
  // Without umas of yours, the slot sits out (and says so).
  const none = make({ teams: { sm: [], ml: [], dirt: [{ id: 101401, style: "Senkou" }, { rotate: true }] }, umas: new Set() });
  assert.equal(none.pairs.filter((p) => p.rotating).length, 0);
  assert.equal(none.unrotated.length, cups.length);
});

test("scenario eras: each cup in the scenario of its date, estimates with the scenario's friend as link", () => {
  const v = make();
  const names = v.eras.map((e) => e.name);
  assert.deepEqual(names.slice(0, 4), ["Grand Concert", "Grand Masters", "Project L'Arc", "U.A.F. Ready GO!"]);
  const larc = v.eras.find((e) => e.name === "Project L'Arc");
  assert.ok(larc.est && D.card(larc.link).n === "Mei Satake", "L'Arc's link is its opening banner's friend");
  const w = T.weightsFor(larc.key, "friend");
  assert.deepEqual(w.scenarioLink, [T.entry(larc.link, 4).char_name]);
  assert.equal(w.scenarioBonus, 1000);
  assert.ok(T.hasScenario("DYI") && !v.eras.find((e) => e.name === "Design Your Island").est, "Design Your Island from Euophrys' JP bundle");
  v.pairs.forEach((p) => {
    const e = v.eraAt(p.date);
    assert.equal(p.era.key, e.key);
    assert.ok(!e.start || e.start <= p.date);
  });
  assert.equal(v.eraAt("2026-11-20").name, "Grand Concert");
  assert.equal(v.eraAt("2027-05-01").name, "Project L'Arc");
});

test("far-off cups count less: a year ahead loses the fade", () => {
  const v = make({ fade: 0.2 });
  assert.equal(v.weight(today), 1);
  assert.ok(Math.abs(v.weight("2027-11-04") - 0.8) < 0.002);
  assert.ok(v.weight("2028-11-04") < v.weight("2027-11-04"));
  assert.equal(make().weight("2028-11-04"), 1, "no fade by default");
});

test("your plan: parsed from your planner's table, matched to the calendar, its Carat Est. read as a balance", () => {
  const old = PV.parsePlan(fs.readFileSync(__dirname + "/fixtures/pull-plan.txt", "utf8"));
  assert.equal(old.length, 13);
  assert.deepEqual(old[1], { names: ["Mei Satake", "El Condor Pasa"], title: "Project L'Arc", kind: "support", start: "2027-04-07", end: "2027-04-25", free: 197, carats: 92700, paid: 4750, max: 815, pulls: 400, target: "El Condor Pasa" });
  const plan = PV.parsePlan(fs.readFileSync(__dirname + "/fixtures/pull-plan-2.txt", "utf8"));
  assert.equal(plan.length, 16);
  assert.deepEqual(plan.map((x) => x.kind).filter((k) => k !== "support"), ["stepup", "trainee", "trainee"]);
  const dj = plan.find((x) => x.names[0] === "Dream Journey"), step = plan.find((x) => x.kind === "stepup");
  assert.deepEqual([dj.title, dj.start, dj.pulls, dj.free, dj.carats], ["Great Food Festival", "2027-11-01", 200, 224, 164650]);
  assert.deepEqual([step.names[0], step.pulls, step.max], ["Yukino Bijin (Valentine)", 0, 5], "a step-up with 0 steps");
  assert.deepEqual(plan.filter((x) => x.kind !== "stepup").map((x) => x.pulls), [400, 400, 400, 200, 200, 400, 200, 200, 400, 400, 400, 200, 400, 400, 400]);
  assert.equal(plan[15].target, "Mr. C.B.", "two at once: the first one's MLB");
  plan.filter((x) => x.kind !== "stepup").forEach((x) => assert.equal(x.max, Math.floor(x.carats / 150) + x.free, "its Max Pulls: carats / 150 + Free/Tickets/Paid"));
  const m = PV.matchPlan(plan, B, D);
  m.forEach((x) => {
    if (x.kind === "stepup") { assert.equal(x.banner, null, "a step-up isn't on the calendar"); return; }
    assert.ok(x.banner, x.names.join("+") + " on the calendar");
    assert.ok(Math.abs(Date.parse(x.banner.start) - Date.parse(x.start)) <= 21 * 864e5);
    const get = x.kind === "trainee" ? (id) => D.trainee(id) : (id) => D.card(id);
    assert.ok(x.names.every((n) => x.banner.pick.some(([id]) => get(id).n === n)));
    assert.equal(get(x.targetId).n, x.target);
  });
  assert.equal(m.find((x) => x.kind === "trainee" && x.target === "Orfevre").banner.start, "2028-04-25", "Orfevre's own banner, not the UAF card");
  // Two rows on one day show the balance: Carat Est. is what's left after the rows above it.
  // Adding back their costs gives the carats you'd have by each date if you spent none.
  const budget = PV.budgetFrom(m, "2026-11-05", null);
  assert.equal(budget("2026-12-01"), 60040);
  const cost = (x) => Math.max(0, x.pulls - x.free) * 150;
  assert.equal(budget("2027-04-07"), 92700 + cost(m[0]));
  const before = m.slice(0, 15).filter((x) => x.kind !== "stepup").reduce((a, x) => a + cost(x), 0);
  assert.equal(budget("2029-05-18"), 287920 + before);
  assert.ok(budget("2026-11-05") < 60040 && budget("2026-11-05") > 0, "back to today at the first stretch's pace");
  assert.equal(PV.budgetFrom(m, "2026-11-05", 40000)("2026-11-05"), 40000, "or from the carats you have now");
});

test("your plan, locked: each row at its # Pulls, free pulls first, and it fits your planner's carats", () => {
  const m = PV.matchPlan(PV.parsePlan(fs.readFileSync(__dirname + "/fixtures/pull-plan-2.txt", "utf8")), B, D).filter((x) => x.banner);
  const locked = new Map(m.filter((x) => x.pulls > 0).map((x) => [x.banner.id, { level: x.pulls >= 400 ? 2 : 1, free: x.free, target: x.targetId }]));
  const yours = new Map(m.filter((x) => x.kind === "trainee").map((x) => [x.targetId, x.banner.start]));
  const v = make({ locked, yours, reuse: prepared() });
  v.pairs.forEach((pair) => v.buildPair(pair));
  v.prepare();
  const solo = v.standalone();
  assert.ok(solo.length > 20 && solo.every((x) => x.v2 >= x.v1 - 1e-6 || x.item.most < 2));
  const rt = v.route(PP, { today, budget: PV.budgetFrom(m, today, null) });
  while (rt.step());
  const { plan, gains } = rt.result();
  const mine = v.items.filter((it) => it.locked && it.kind !== "selector");
  assert.equal(mine.length, 15, "every banner of the plan (past the window too), not the step-up");
  assert.deepEqual(plan.missed, [], "it fits your planner's carats");
  mine.forEach((it) => assert.equal(plan.chosen.get(it.key), locked.get(it.banner.id).level, it.key));
  mine.forEach((it) => assert.equal(it.most, it.required, "your plan is fixed: a 200 stays 200"));
  // Even with carats to spare, a locked 200 isn't taken to 400.
  const rich = make({ locked, yours, reuse: prepared() });
  rich.pairs.forEach((pair) => rich.buildPair(pair));
  rich.prepare();
  const rt2 = rich.route(PP, { today, budget: () => 1e9 });
  while (rt2.step());
  rich.items.filter((it) => it.locked && it.kind !== "selector").forEach((it) => assert.equal(rt2.result().plan.chosen.get(it.key), it.required));
  plan.steps.forEach((s) => {
    const it = v.byKey.get(s.key);
    assert.ok(s.left >= -1e-6);
    if (!it.locked || it.kind === "selector") return;
    assert.equal(s.free, Math.min(s.pulls, it.free));
    assert.equal(s.carats, (s.pulls - s.free) * 150);
    const c = v.committed.get(s.key);
    if (!it.blind && (gains.get(s.key) || 0) === 0) assert.ok(c.spark.every((id) => id === it.target), "nothing helps: your target gets the sparks");
  });
  const team = mine.filter((it) => it.kind === "trainee");
  assert.deepEqual(team.map((it) => D.trainee(it.mine[0]).n).sort(), ["Dream Journey", "Orfevre"], "your team umas' own banners");
  assert.ok(team.every((it) => it.blind), "their carats set aside; she's yours from there");
});

test("your team by date: a fixed uma races once she's yours, a flex slot in between; your selector picks first", () => {
  const teams = { sm: [{ id: 105301, style: "Sasi" }, { id: 106301, style: "Sasi" }, { id: 106101, style: "Sasi", rotate: true }],
    ml: [{ id: 111501, style: "Oikomi" }, { id: 111901, style: "Oikomi" }, { id: 102501, style: "Sasi", rotate: true }], dirt: [] };
  const mine = new Set(D.DATA.trainees.filter((t) => D.onGlobal(t, today) && [105301, 102501].indexOf(t.id) === -1).map((t) => t.id));
  const yours = new Map([[111901, "2027-11-06"], [111501, "2028-04-25"], [105301, "2026-11-29"], [102501, "2027-04-05"]]);
  const lockedPicks = new Map([["anniv2-uma", 105301], ["anniv2.5-uma", 102501]]);
  const v = make({ teams, umas: mine, yours, lockedPicks, until: "2028-09-30" });
  ["Orfevre", "Dream Journey"].forEach((n) => {
    const id = D.DATA.trainees.find((t) => t.n === n && yours.has(t.id)).id, from = yours.get(id);
    const own = v.pairs.filter((p) => !p.rotating && p.trainee.id === id), wait = v.pairs.filter((p) => p.member.waiting === id);
    assert.ok(own.length && own.every((p) => p.date > from), n + " races once she's yours");
    assert.ok(wait.length && wait.every((p) => p.date <= from && p.rotating), "her slot is a flex until then");
  });
  // Ikuno Dictus isn't in the plan: hers from her Global release.
  const ikuno = v.pairs.filter((p) => !p.rotating && p.trainee.id === 106301);
  assert.ok(ikuno.length && ikuno.every((p) => p.date > B.release.trainees["106301"]));
  // The named third is yours (a parent, a flex pick), but her slot is the flex.
  assert.ok(v.pairs.filter((p) => p.slot === 2).every((p) => p.rotating));
  assert.ok(v.yoursBy(102501, "2027-05-01") && !v.yoursBy(102501, "2027-03-01"), "Manhattan Cafe from your 2.5 Anniversary pick");
  // Your Uma selector picks are taken first, before anything else on those selectors.
  v.addSelectors();
  const picks = v.items.filter((it) => it.kind === "selector" && it.locked);
  assert.deepEqual(picks.map((it) => [it.sel.id, it.id]).sort(), [["anniv2-uma", 105301], ["anniv2.5-uma", 102501]]);
  const p = PP.plan(v.items, { today, carats: 0, perMonth: 0, value: () => 0, onStep: (s) => v.commit(s.key, s.k) });
  picks.forEach((it) => assert.equal(p.chosen.get(it.key), 1));
  assert.ok(v.items.filter((it) => it.kind === "selector" && it.group === picks[0].group && !it.locked).every((it) => !p.chosen.get(it.key)), "one pick per selector");
});


test("your plan as time goes by: banners behind you drop out, what you got comes off the budget", () => {
  const m = PV.matchPlan(PV.parsePlan(fs.readFileSync(__dirname + "/fixtures/pull-plan-2.txt", "utf8")), B, D);
  const events = B.events, picks = { anniv2: 105301, "anniv2.5": 102501 };
  const now = PV.planParts(m, { today: "2026-11-05", selPicks: picks, selUma: true, events });
  assert.equal(now.locked.size, 15);
  assert.deepEqual([...now.lockedPicks.keys()].sort(), ["anniv2-uma", "anniv2.5-uma"]);
  // After Ramonu's banner has ended (your table's End: Dec 25), it's behind you: not locked, and
  // its carats aren't added back (the balances after it have them paid).
  const later = PV.planParts(m, { today: "2026-12-27", selPicks: picks, selUma: true, events });
  const ramonu = m.find((x) => x.target === "Mejiro Ramonu");
  assert.ok(!later.locked.has(ramonu.banner.id) && later.done.has("s" + ramonu.banner.id));
  assert.equal(later.locked.size, 14);
  const larc = m.find((x) => x.target === "El Condor Pasa");
  assert.equal(later.budget(larc.start), 92700, "L'Arc's own balance, nothing to add back now");
  assert.ok(!later.lockedPicks.has("anniv2-uma") && later.yours.get(105301) === B.events.find((e) => e.id === "anniv2").start, "a pick behind you: she's yours");
  // You entered what you got on L'Arc early, and on a banner outside your plan (400 pulls).
  const done = { ["s" + larc.banner.id]: { pulls: 400, free: 197 }, s30213: { pulls: 400, free: 0 } };
  const after = PV.planParts(m, { today: "2026-12-27", done, selPicks: picks, selUma: true, events });
  assert.ok(!after.locked.has(larc.banner.id) && after.done.has("s30213"));
  const uaf = m.find((x) => x.target === "Orfevre" && x.kind === "support");
  assert.equal(Math.round(later.budget(uaf.start) - after.budget(uaf.start)), 60000 + 30450, "the extra 400 pulls and L'Arc's carats come off");
  // The trainee rows make your team umas yours, behind you or not.
  assert.ok(after.yours.has(111901) && after.yours.has(111501));
  assert.ok(PV.rowDone(ramonu, "2026-12-27", {}) && !PV.rowDone(larc, "2026-12-27", {}));
});
