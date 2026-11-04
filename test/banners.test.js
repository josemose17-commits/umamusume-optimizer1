const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../data/banners.js");
const D = require("../deck.js");
const A = require("../affinity.js");
const PD = require("../data/parent-data.js");

test("banners: Global's rules, dated and sorted, every pick a known card or trainee at a featured rate", () => {
  assert.equal(B.meta.pullCarats, 150);
  assert.equal(B.meta.spark, 200);
  for (const kind of ["support", "trainee"]) {
    assert.ok(B[kind].length > 20, kind);
    for (let i = 1; i < B[kind].length; i++) assert.ok(B[kind][i].start >= B[kind][i - 1].start, kind + " in date order");
    B[kind].forEach((b) => {
      assert.match(b.start, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(b.pick.length > 0);
      b.pick.forEach(([id, r]) => {
        const x = kind === "support" ? D.card(id) : D.trainee(id);
        assert.ok(x, kind + " " + id);
        const want = B.meta.featured[kind][String(x.r)];
        if (b.est) assert.equal(r, want, "a forecast banner uses the featured rate for its rarity");
        else assert.ok(r >= 0.005, "an announced banner keeps its own rate");
      });
    });
  }
  assert.ok(B.release.cards && Object.keys(B.release.cards).length > 100, "forecast Global releases");
});

test("banners: anniversaries on Global's calendar, in JP's order, every half year of JP", () => {
  assert.ok(B.events.length >= 6);
  B.events.forEach((e, i) => {
    assert.match(e.start, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(e.jp, /^\d{4}-(02|08)-24$/, "JP's anniversaries are on Feb 24 and Aug 24");
    if (i) assert.ok(e.start > B.events[i - 1].start && e.jp > B.events[i - 1].jp, "Global keeps JP's order");
  });
  const half = B.events.find((e) => e.name === "1.5 Anniversary");
  assert.ok(half && !half.est && half.start.slice(0, 4) === "2026", "Global's 1.5 Anniversary is announced, in 2026");
});

test("affinity: future characters take JP's groups; Global families keep Global's", () => {
  const cid = (n) => D.DATA.trainees.find((t) => t.n === n).cid;
  assert.ok(PD.affinityJp.length > 0);
  // Orfevre isn't on Global yet: Global's table has no group with her, JP's has her with Gold Ship.
  assert.ok(!PD.affinity.some(([, m]) => m.includes(cid("Orfevre"))));
  assert.ok(A.together(cid("Orfevre"), cid("Gold Ship")) > 0);
  // Every JP-only group includes a character Global's table doesn't have.
  const global = new Set(PD.affinity.flatMap(([, m]) => m));
  assert.ok(PD.affinityJp.every(([, m]) => m.some((c) => !global.has(c))));
  // A pair of Global characters is Global's sum.
  const g = (a, b) => PD.affinity.filter(([, m]) => m.includes(a) && m.includes(b)).reduce((s, [p]) => s + p, 0);
  assert.equal(A.together(cid("El Condor Pasa"), cid("Grass Wonder")), g(cid("El Condor Pasa"), cid("Grass Wonder")));
});
