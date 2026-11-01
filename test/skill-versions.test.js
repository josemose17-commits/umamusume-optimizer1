const test = require("node:test");
const assert = require("node:assert/strict");
const SV = require("../data/skillvalues/index.js");
const P = require("../data/presets.js");

// tools/build_skill_versions.js: cups Global hasn't reached run as JP's game was on their JP date.
const jpOnly = P.list.filter((p) => SV.ready.includes(p.id) && (p.no >= 22 || p.kind === "loh"));

test("every cup Global hasn't reached ran on its own JP-dated simulator", () => {
  assert.ok(jpOnly.length >= 33);
  for (const p of jpOnly) {
    const name = SV.meta.sims[p.id];
    assert.ok(name && SV.meta.variants[name], p.id + " has no simulator variant");
    // Stamina showdown came to JP with its 2.5th anniversary update, 2023-08-24, and got stronger
    // in long races (2401 m and up) on 2024-10-29.
    assert.equal(SV.meta.variants[name].syoubu, p.jp.start >= "2023-08-24", p.id);
    assert.equal(SV.meta.variants[name].syoubuLong, p.jp.start >= "2024-10-29" && p.course.distance >= 2401, p.id);
  }
  for (const p of P.list.filter((x) => SV.ready.includes(x.id) && x.no < 22 && x.kind === "cm")) {
    assert.equal(SV.meta.sims[p.id], "global", p.id);
  }
});

test("a cup is never valued behind Global's current skills, and later cups get JP's later updates", () => {
  const changed = (id) => SV.meta.variants[SV.meta.sims[id]].changed;
  // CM 22 (JP 2023-02-17) comes before every JP update Global doesn't have yet.
  assert.deepEqual(changed("cm22"), {});
  // Breakin' Ahead: Global has order >= 75%; JP made it 50% on 2024-02-24 and 40% on 2026-08-24.
  assert.equal(changed("cm29")["202381"], undefined);
  assert.equal(changed("cm30")["202381"], "2024-02-24");
  assert.equal(changed("cm49")["202381"], "2026-08-24");
  // Come What May's last-straight condition: JP's 2.5th anniversary.
  assert.equal(changed("cm27")["201701"], "2023-08-24");
});

test("every valued skill carries its first JP release date", () => {
  for (const [id, s] of Object.entries(SV.skills)) {
    assert.equal(s.length, 5, id);
    assert.ok(s[4] === null || /^\d{4}-\d{2}-\d{2}$/.test(s[4]), id + " " + s[4]);
  }
});
