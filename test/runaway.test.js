// Runaway (runaway.js): a Front Runner sub-style for a few characters.
const test = require("node:test");
const assert = require("node:assert/strict");
const RW = require("../runaway.js");
const G = require("../data/gametora.js");
const TM = require("../team-maker.js");
const GP = require("../general-parents.js");
const PR = require("../parent-relevance.js");
const UV = require("../data/uma-values.js");
const P = require("../data/presets.js");

const D = { trainee: (id) => G.trainees.find((t) => t.id === +id) || null };
const t = (n) => G.trainees.find((x) => x.n === n && x.en);

test("runaway: only the listed characters, on her Front Runner grade", () => {
  const suzuka = t("Silence Suzuka"), spe = t("Special Week");
  assert.ok(RW.can(suzuka) && !RW.can(spe));
  assert.deepEqual(RW.stylesOf(suzuka), ["Nige", "Senkou", "Sasi", "Oikomi", "Oonige"]);
  assert.deepEqual(RW.stylesOf(spe), ["Nige", "Senkou", "Sasi", "Oikomi"]);
  assert.equal(RW.grade(suzuka, "Oonige"), suzuka.apt[6]);
  Object.keys(RW.CHARS).forEach((cid) => assert.ok(G.trainees.some((x) => x.cid === +cid), cid + " is a character"));
});

test("runaway: data without Runaway rows reads Front Runner's; with them, her own", () => {
  assert.equal(RW.data("Oonige", false), "Nige");
  assert.equal(RW.data("Oonige", true), "Oonige");
  assert.equal(RW.data("Senkou", false), "Senkou");
});

test("runaway: a Front Runner for skill conditions and positions", () => {
  const p = P.list.find((x) => x.id === "cm23");
  assert.equal(PR.raceFacts(p, "Oonige").running_style, 1);
  const pos = { back: ["1"], front: ["2"], ahead: ["3"] };
  assert.equal(PR.positionMiss(pos, "1", "Oonige"), "back");
  assert.equal(PR.positionMiss(pos, "3", "Oonige"), "ahead");
  assert.equal(PR.positionMiss(pos, "2", "Oonige"), null);
});

test("runaway in the team maker: offered to Suzuka, Front Runner's values, its own style next to a Front Runner", () => {
  const q = P.list.find((x) => x.id === "cm23"), suzuka = t("Silence Suzuka");
  const w = TM.worth(suzuka, q, "Oonige", UV), f = TM.worth(suzuka, q, "Nige", UV);
  assert.ok(w.asFront && Math.abs(w.v - f.v) < 1e-9);
  assert.ok(TM.goodStyles(suzuka).includes("Oonige"));
  const front = G.trainees.find((x) => x.en && x.n !== "Silence Suzuka" && x.apt[6] === "A" && UV.cups.cm23.umas[x.id] && UV.cups.cm23.umas[x.id].Nige != null);
  const r = TM.best(q, [{ tid: suzuka.id, styles: ["Oonige"] }, { tid: front.id, styles: ["Nige"] }], { D, UV, k: 2 });
  assert.equal(r.repeats, 0, "Runaway and Front Runner don't count as one style");
  assert.ok(r.team.some((x) => x.style === "Oonige" && x.asFront));
  assert.ok(!TM.best(q, [{ tid: t("Special Week").id, styles: ["Oonige"] }], { D, UV }).team.some((x) => x.style === "Oonige"), "not for umas who can't learn it");
});

test("runaway in General grandparents: Front Runner's lists, only characters who can learn it", () => {
  assert.ok(GP.STYLES.includes("Oonige"));
  assert.deepEqual(GP.list("Oonige"), GP.list("Nige"));
  assert.deepEqual(GP.shortList("Oonige"), GP.shortList("Nige"));
  const A = require("../affinity.js"), SP = require("../data/skill-purchases.js"), meta = SP.skills || SP;
  const cids = [...new Set(G.trainees.filter((x) => x.en).map((x) => x.cid))];
  const version = (cid, st) => G.trainees.filter((x) => x.cid === cid && x.en)[0];
  const rows = GP.rank("Oonige", { A, cids, version, family: (id) => (meta[id] ? String(meta[id][0]) : id), shares: GP.goalShares(A, cids) });
  assert.ok(rows.length >= 1 && rows.every((r) => RW.can(r.t)));
});
