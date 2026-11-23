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

test("ui: (?) help takes long explanations only", () => {
  assert.strictEqual(UI.FOLD_MIN, 120);
  assert.strictEqual(UI.isLong("x".repeat(UI.FOLD_MIN - 1)), false);
  assert.strictEqual(UI.isLong("x".repeat(UI.FOLD_MIN)), true);
  assert.strictEqual(UI.isLong("  short  "), false);
  assert.strictEqual(UI.foldable(null), false);
  assert.ok(UI.ICON.lock && UI.ICON.help, "the lock and (?) icons");
});
