// JP Champions Meeting tier lists per distance (data/tier-list.js, tools/build_tier_list.py).
const test = require("node:test");
const assert = require("node:assert/strict");
const TL = require("../data/tier-list.js");
const G = require("../data/gametora.js");

const byId = new Map(G.trainees.map((t) => [t.id, t]));

test("tier list: every distance with SS/S/A, dated and sourced", () => {
  assert.match(TL.meta.url, /^https:\/\/kamigame\.jp\//);
  assert.match(TL.meta.updated || "", /^\d{4}-\d{2}-\d{2}$/, "the page's last update");
  ["Sprint", "Mile", "Medium", "Long", "Dirt"].forEach((d) => {
    const c = TL.cm[d];
    assert.ok(c && c.SS.length >= 1, d + ": an SS uma");
    ["SS", "S", "A"].forEach((t) => c[t].forEach((id) => assert.ok(byId.has(id), d + " " + t + " " + id + " is an outfit we know")));
    const all = c.SS.concat(c.S, c.A);
    assert.equal(new Set(all).size, all.length, d + ": each outfit in one tier");
  });
});

test("tier list: outfits matched by unique skill, as spot-checked by hand", () => {
  assert.ok(TL.cm.Sprint.SS.includes(108702), "Valentine Aston Machan (Everlasting Sweet Treat)");
  assert.ok(TL.cm.Sprint.SS.includes(104103), "new-outfit Sakura Bakushin O (Spring-Thunder Speedster)");
  assert.ok(TL.cm.Dirt.SS.includes(109902), "swimsuit Hokko Tarumae (Pastel Marine Locodol)");
  assert.ok(TL.cm.Dirt.S.includes(109801), "Copano Rickey (Eightfold Fortune), S on dirt");
  assert.ok(TL.cm.Long.SS.includes(107703), "new-outfit Narita Top Road");
});

test("tier list: few entries left unmatched, each named", () => {
  assert.ok(TL.unmatched.length <= 10, TL.unmatched.length + " unmatched: " + TL.unmatched.map((u) => u.name).join(", "));
  TL.unmatched.forEach((u) => assert.ok(u.name && u.distance && u.tier));
});
