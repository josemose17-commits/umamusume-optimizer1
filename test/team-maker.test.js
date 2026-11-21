// Team maker (team-maker.js): the best team for a cup from a pool, with fixed umas.
const test = require("node:test");
const assert = require("node:assert/strict");
const TM = require("../team-maker.js");
const G = require("../data/gametora.js");
const UV = require("../data/uma-values.js");
const P = require("../data/presets.js");

const D = { trainee: (id) => G.trainees.find((t) => t.id === +id) || null };
const cup = (id) => P.list.find((p) => p.id === id);
const t = (n, title) => G.trainees.find((x) => x.n === n && x.en && (!title || x.t === title));
const pool = (...ts) => ts.map((x) => ({ tid: x.id, styles: [], fixed: false }));
const ids = (r) => r.team.map((p) => p.tid).sort();

test("team maker: the best 3 by lengths, each in her own style, values from uma-values", () => {
  const q = cup("cm23"), names = ["Special Week", "Silence Suzuka", "Tokai Teio", "Gold Ship", "Daiwa Scarlet", "Oguri Cap", "Mejiro McQueen"];
  const list = pool(...names.map((n) => t(n)));
  const r = TM.best(q, list, { D, UV });
  assert.equal(r.team.length, 3);
  assert.equal(new Set(r.team.map((p) => p.style)).size, 3, "no style twice");
  r.team.forEach((p) => assert.ok(Math.abs(p.v - TM.worth(D.trainee(p.tid), q, p.style, UV).v) < 1e-9));
  // No other team of distinct styles from the pool does better.
  r.teams.forEach((x) => { if (!x.repeats) assert.ok(x.total <= r.total + 1e-9); });
  assert.ok(r.team.every((p) => p.how === "measured"), "all raced on this cup");
});

test("team maker: a fixed uma is always in, even when she's worth less than the others", () => {
  const q = cup("cm23"), list = pool(t("Special Week"), t("Silence Suzuka"), t("Tokai Teio"), t("Gold Ship"), t("Daiwa Scarlet"));
  const free = TM.best(q, list, { D, UV });
  const out = list.find((m) => !free.team.some((p) => p.tid === m.tid));
  out.fixed = true;
  const r = TM.best(q, list, { D, UV });
  assert.ok(r.team.some((p) => p.tid === out.tid && p.fixed), "the fixed uma is in");
  assert.ok(r.total <= free.total + 1e-9);
});

test("team maker: only the styles you allow; a repeated style only when nothing else fits", () => {
  const q = cup("cm23");
  const a = t("Special Week"), b = t("Tokai Teio"), c = t("Daiwa Scarlet");
  const r = TM.best(q, [{ tid: a.id, styles: ["Senkou"] }, { tid: b.id, styles: ["Senkou"] }, { tid: c.id, styles: ["Senkou", "Nige"] }], { D, UV });
  r.team.forEach((p) => assert.ok(p.style === "Senkou" || (p.tid === c.id && p.style === "Nige")));
  assert.equal(r.repeats, 1, "two Pace: no other style allowed for them");
  const r2 = TM.best(q, [{ tid: a.id, styles: ["Sasi"] }, { tid: b.id, styles: ["Senkou"] }, { tid: c.id, styles: ["Nige"] }], { D, UV });
  assert.equal(r2.repeats, 0);
});

test("team maker: never two outfits of one character; a pool too small says so", () => {
  const q = cup("cm23"), sw = G.trainees.filter((x) => x.n === "Special Week" && x.en);
  assert.ok(sw.length >= 2, "two Special Week outfits on Global");
  const r = TM.best(q, pool(...sw, t("Gold Ship")), { D, UV });
  assert.equal(r.team.length, 2);
  assert.equal(new Set(r.team.map((p) => D.trainee(p.tid).cid)).size, 2);
  assert.ok(r.problems.some((x) => /Only 2 of 3/.test(x)));
});

test("team maker: an uma not raced on the cup counts her aptitudes only; a cup without values uses grades", () => {
  const q = cup("cm23"), c = UV.cups.cm23;
  const missing = G.trainees.find((x) => x.en && !c.umas[x.id]);
  if (missing) assert.equal(TM.worth(missing, q, "Senkou", UV).how, "aptitude");
  const fake = Object.assign({}, q, { id: "nope" });
  const w = TM.worth(t("Gold Ship"), fake, "Oikomi", UV);
  assert.equal(w.how, "grades");
});

test("team maker: every cup ahead from one pool, with how often each uma is picked", () => {
  const list = pool(t("Special Week"), t("Silence Suzuka"), t("Tokai Teio"), t("Gold Ship"));
  const cups = P.list.filter((p) => UV.cups[p.id]).slice(0, 6);
  const e = TM.everyCup(cups, list, { D, UV });
  assert.equal(e.rows.length, 6);
  assert.equal(Object.values(e.count).reduce((n, x) => n + x, 0), 18, "3 a cup");
});
