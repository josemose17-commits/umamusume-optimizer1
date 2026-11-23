// The app's shell (ui.js): sidebar groups and the Notes folding's text rules.
const test = require("node:test");
const assert = require("node:assert");
const UI = require("../ui.js");

test("ui: the sidebar groups every page once, Import & backup under My Data", () => {
  const ids = UI.NAV.flatMap(([, items]) => items.map(([id]) => id));
  assert.deepStrictEqual(ids, ["coach", "plan", "log", "cm", "parents", "skillopt", "pulls", "guide", "all", "tiers", "cards", "trainees", "data"]);
  assert.deepStrictEqual(UI.NAV.map(([g]) => g), ["Career", "Planning", "Reference", "My Data"]);
  const myData = UI.NAV.find(([g]) => g === "My Data")[1].map(([id]) => id);
  assert.deepStrictEqual(myData, ["cards", "trainees", "data"]);
  assert.strictEqual(UI.label("data"), "Import & backup");
  ids.forEach((id) => assert.ok(UI.ICON[id], "an icon for " + id));
});

test("ui: navHTML shows only the pages the app has", () => {
  const html = UI.navHTML(["coach", "data"]);
  assert.match(html, /data-tab="coach"/);
  assert.match(html, /data-tab="data"/);
  assert.doesNotMatch(html, /data-tab="cm"/);
  assert.doesNotMatch(html, /Planning/, "a group with no pages is left out");
});

test("ui: Notes fold long explanations only, and peek at their first sentence", () => {
  assert.strictEqual(UI.isLong("x".repeat(UI.FOLD_MIN - 1)), false);
  assert.strictEqual(UI.isLong("x".repeat(UI.FOLD_MIN)), true);
  assert.strictEqual(UI.peekOf("Mark the cards you own and their limit break. The deck optimizer uses them."), "Mark the cards you own and their limit break.");
  assert.strictEqual(UI.peekOf("Global's rules: 150 carats a pull, so 200 pulls are 30,000 carats."), "Global's rules");
  assert.strictEqual(UI.peekOf("Tokyo 1600 m Dirt · 9 runners. Race check: the JP Umalator."), "Tokyo 1600 m Dirt · 9 runners.");
  const long = "word ".repeat(60);
  const p = UI.peekOf(long);
  assert.ok(p.length <= 118 && p.endsWith("…"), "no sentence end: cut at a word, with an ellipsis");
  assert.strictEqual(UI.foldable(null), false);
});
