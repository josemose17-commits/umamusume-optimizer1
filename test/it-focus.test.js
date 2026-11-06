// Independent Training's Training Focus in the simulator (optimizer.js applyFocus).
const test = require("node:test");
const assert = require("node:assert/strict");
const OPT = require("../optimizer.js");

test("Training Focus: Balanced weighs every stat alike; Stamina and Sprint lean to Stamina and Power", () => {
  const STATS = ["speed", "stamina", "power", "guts", "wit"];
  const base = () => ({ w: { speed: 1.4, stamina: 0.8, power: 1.1, guts: 0.6, wit: 0.9 }, target: { speed: 1500, stamina: 800, power: 1200, guts: 600, wit: 1000 } });
  const b = OPT.applyFocus(base(), "balanced");
  assert.equal(new Set(STATS.map(s => b.w[s])).size, 1, "one weight");
  assert.equal(new Set(STATS.map(s => b.target[s])).size, 1, "one target");
  const st = OPT.applyFocus(base(), "stamina"), sp = OPT.applyFocus(base(), "sprint");
  assert.equal(st.w.stamina, b.w.speed * OPT.FOCUS_LEAN); assert.equal(st.w.speed, b.w.speed);
  assert.equal(sp.w.power, b.w.speed * OPT.FOCUS_LEAN, "Sprint leans to Power, not Speed"); assert.equal(sp.w.speed, b.w.speed);
});
