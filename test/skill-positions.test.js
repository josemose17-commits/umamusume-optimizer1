// Skills that need a rival ahead of her: the charts run a Front Runner in 1st place, so they're
// left out for her (tools/build_skill_positions.js, parent-relevance.js positionMiss).
const test = require("node:test");
const assert = require("node:assert");
const PR = require("../parent-relevance.js");
const POS = require("../data/skill-positions.js");
const SV = require("../data/skillvalues/index.js");
const { classify, needsAhead } = require("../tools/build_skill_positions.js");

const own = (cup) => { const v = SV.meta.variants[SV.meta.sims[cup]]; return PR.positionsWith(POS, v && v.positions); };
const rows = (cup, style) => require("../data/skillvalues/" + cup + ".json")[style];

test("a rival ahead: close in front in her lane, passing, blocked from the front, moving up", () => {
  ["infront_near_lane_time>=1", "is_overtake==1", "overtake_target_time>=2", "blocked_front_continuetime>=1", "change_order_onetime<0", "change_order_up_end_after>=3", "bashin_diff_infront<=1"]
    .forEach((c) => assert.ok(needsAhead(c), c));
  // A leader has nobody close in front, can be passed or blocked from the side, and can have a rival behind.
  ["near_infront_count==0", "change_order_onetime>0", "blocked_side_continuetime>=2", "bashin_diff_behind<=1", "behind_near_lane_time>=3", "order==1"]
    .forEach((c) => assert.ok(!needsAhead(c), c));
});

test("only skills whose every way to fire needs a rival ahead", () => {
  const alt = (condition, precondition = "") => ({ alternatives: [{ condition, precondition }] });
  const { ahead } = classify({
    1: alt("infront_near_lane_time>=1&is_lastspurt==1"), // No Stopping Me!
    2: alt("is_lastspurt==1&change_order_onetime<0@is_lastspurt==1&blocked_side_continuetime>=2"), // Earthshaker: side-blocked works for a leader
    3: alt("is_finalcorner==1&corner==0", "is_overtake==1&order<=5"), // passing first (Certain Victory)
    4: alt("phase==1&order==1", "running_style==1@is_overtake==1"), // one precondition branch needs no rival
    5: alt("distance_type==1&furlong==1&near_infront_count==0"),
  });
  assert.deepStrictEqual(ahead, ["1", "3"]);
});

test("Front Runners lose them; the other styles keep them", () => {
  // No Stopping Me!, Nimble Navigator, Slipstream, Perfect Spot!
  ["200491", "200492", "201651", "201652"].forEach((id) => {
    assert.ok(POS.ahead.includes(id), id);
    assert.strictEqual(PR.positionMiss(POS, id, "Nige"), "ahead");
    ["Senkou", "Sasi", "Oikomi"].forEach((s) => assert.ok(PR.positionFits(POS, id, s), id + " " + s));
  });
  // A leader can still fire these: side-blocked or passed (Earthshaker, Top Runner), a rival close
  // behind (Can't Even Catch My Shadow), leading at the final corner (Unrestrained).
  ["204101", "201271", "202461", "200551"].forEach((id) => {
    assert.ok(PR.positionFits(POS, id, "Nige"), id);
    assert.ok(PR.positionFits(own("cm22"), id, "Nige"), id + " cm22");
  });
});

test("JP-dated cups add their JP-only skills (Blast a Hole Through! on dirt)", () => {
  assert.strictEqual(PR.positionMiss(own("cm22"), "204661", "Nige"), "ahead");
  assert.ok(PR.positionFits(own("cm22"), "204661", "Sasi"));
  assert.strictEqual(PR.positionMiss(own("cm50"), "200491", "Nige"), "ahead");
  // CM 21 runs on Global's simulator, as data/skill-positions.js has it.
  assert.strictEqual(own("cm21"), POS);
});

test("CM 22's Front Runner chart keeps no skill a leader can't fire", () => {
  const all = rows("cm22", "Nige"), kept = all.filter(([id]) => PR.positionFits(own("cm22"), id, "Nige"));
  assert.ok(!kept.some(([id]) => ["200491", "200492", "204661", "204662"].includes(String(id))));
  assert.ok(all.length - kept.length >= 25, "about 30 skills left out");
  // The Pace Chaser chart keeps No Stopping Me!: there's always a Front Runner ahead of her.
  assert.ok(rows("cm22", "Senkou").some(([id]) => String(id) === "200491" && PR.positionFits(own("cm22"), id, "Senkou")));
});
