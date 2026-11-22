// Team kinds (pull-values.js): Medium & Long a team of 3 with parents; Sprint & Mile and Dirt one
// meta uma every cup, no parents.
const test = require("node:test");
const assert = require("node:assert/strict");
const PV = require("../pull-values.js");
const VP = require("../vet-plan.js");

const teams = {
  sm: [{ id: 105301, style: "Sasi" }, { id: 106301, style: "Sasi" }, { id: 106101, style: "Sasi", rotate: true }],
  ml: [{ id: 111501, style: "Oikomi" }, { id: 111901, style: "Oikomi" }, { id: 102501, style: "Sasi", rotate: true }],
  dirt: [{ id: null, style: "Senkou" }, { id: 109801, style: "Senkou" }, { id: 102902, style: "Senkou", rotate: true }],
};

test("team kinds: by default Medium & Long is a team, the others one meta uma", () => {
  assert.deepEqual(PV.KINDS, { sm: "meta", ml: "team", dirt: "meta" });
  assert.deepEqual(PV.parentGroupsOf(PV.KINDS), ["ml"]);
  assert.deepEqual(PV.parentGroupsOf({}), ["sm", "ml", "dirt"], "no kinds: every track a team");
});

test("team kinds: a meta track races its first named uma alone, never a flex", () => {
  const t = PV.effectiveTeams(teams, PV.KINDS);
  assert.deepEqual(t.sm, [{ id: 105301, style: "Sasi" }]);
  assert.deepEqual(t.dirt, [{ id: 109801, style: "Senkou" }], "the first one named");
  assert.equal(t.ml, teams.ml, "the team stays as it is");
  assert.deepEqual(PV.effectiveTeams({ sm: [{ rotate: true }] }, PV.KINDS).sm, [], "no uma named yet");
});

test("team kinds: the cleanout keeps a general grandparent for your team's styles only", () => {
  const vet = (id, white) => ({ id, cid: id, self: { white, blue: [0, 0], pink: [0, 0], green: 0 }, parents: [] });
  const vets = [vet(1, [["a", 3]]), vet(2, [["b", 3]])];
  const general = (v, st) => (st === "Oikomi" ? (v.id === 1 ? 1 : 0) : st === "Nige" ? (v.id === 2 ? 1 : 0) : 0);
  const all = VP.cleanout(vets, { general });
  assert.ok(all.get(2).why.some((w) => /general Nige/.test(w)));
  const team = VP.cleanout(vets, { general, generalStyles: ["Oikomi", "Sasi"] });
  assert.ok(team.get(1).why.some((w) => /general Oikomi/.test(w)));
  assert.ok(!team.get(2).why.some((w) => /general/.test(w)), "not a style of your team");
});

test("team kinds: with has(id), a meta track races the first named uma you have", () => {
  const t = PV.effectiveTeams(teams, PV.KINDS, (id) => id === 106301);
  assert.deepEqual(t.sm, [{ id: 106301, style: "Sasi" }]);
  assert.deepEqual(t.dirt, [{ id: 109801, style: "Senkou" }], "none yours: the first named");
});
