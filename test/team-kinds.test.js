// Team kinds (pull-values.js): Medium & Long a team of 3 with parents; Sprint & Mile and Dirt one
// meta uma every cup, no parents.
const test = require("node:test");
const assert = require("node:assert/strict");
const PV = require("../pull-values.js");
const VP = require("../vet-plan.js");

const teams = {
  sprint: [{ id: 105301, style: "Sasi" }, { id: 106301, style: "Sasi" }, { id: 106101, style: "Sasi", rotate: true }],
  ml: [{ id: 111501, style: "Oikomi" }, { id: 111901, style: "Oikomi" }, { id: 102501, style: "Sasi", rotate: true }],
  dirt: [{ id: null, style: "Senkou" }, { id: 109801, style: "Senkou" }, { id: 102902, style: "Senkou", rotate: true }],
};

test("team kinds: by default Medium & Long is a team, the others one meta uma", () => {
  assert.deepEqual(PV.KINDS, { sprint: "meta", mile: "meta", ml: "team", dirt: "meta" });
  assert.deepEqual(PV.parentGroupsOf(PV.KINDS), ["ml"]);
  assert.deepEqual(PV.parentGroupsOf({}), ["sprint", "mile", "ml", "dirt"], "no kinds: every track a team");
  assert.deepEqual(Object.keys(PV.GROUPS), ["sprint", "mile", "ml", "dirt"], "Sprint and Mile are their own tracks");
});

test("team kinds: a meta track races its first named uma alone, never a flex", () => {
  const t = PV.effectiveTeams(teams, PV.KINDS);
  assert.deepEqual(t.sprint, [{ id: 105301, style: "Sasi" }]);
  assert.deepEqual(t.dirt, [{ id: 109801, style: "Senkou" }], "the first one named");
  assert.equal(t.ml, teams.ml, "the team stays as it is");
  assert.deepEqual(PV.effectiveTeams({ sprint: [{ rotate: true }] }, PV.KINDS).sprint, [], "no uma named yet");
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
  assert.deepEqual(t.sprint, [{ id: 106301, style: "Sasi" }]);
  assert.deepEqual(t.dirt, [{ id: 109801, style: "Senkou" }], "none yours: the first named");
});

test("team kinds: a meta track races the meta uma you picked, none until you pick (your team umas aren't meta umas)", () => {
  const t = PV.effectiveTeams(teams, PV.KINDS, null, {});
  assert.deepEqual(t.sprint, [], "no pick: no uma");
  assert.deepEqual(t.dirt, []);
  assert.equal(t.ml, teams.ml);
  const p = PV.effectiveTeams(teams, PV.KINDS, null, { dirt: { id: 109801, style: "Senkou" }, mile: { id: 105301, style: "Sasi" } });
  assert.deepEqual(p.dirt, [{ id: 109801, style: "Senkou" }]);
  assert.deepEqual(p.mile, [{ id: 105301, style: "Sasi" }], "a track with no team list yet");
});
