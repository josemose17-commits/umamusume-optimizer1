// Race mechanics the app uses directly, from KuromiAK's "Uma Musume Race Mechanics" document
// (reverse engineering by @umamusu_reveng, @kak_eng and @hoffe_33; see docs/race-mechanics-notes.md).
// The race simulators already run these; this module is for explaining a build and for checks
// the skill chart can't make (it was run at one stat line per cup).
(function (root) {
  // Raw stats past 1200 count half.
  const halved = (x) => (x > 1200 ? 1200 + (x - 1200) / 2 : x);
  // Ground modifier for power (adjusted power): turf loses 50 on anything but Firm; dirt loses 100,
  // or 50 on Good.
  function groundPower(surface, ground) {
    const g = String(ground || "").toLowerCase();
    if (/dirt/i.test(surface)) return g === "good" ? -50 : -100;
    return g === "firm" ? 0 : -50;
  }
  // Ground modifier for speed: -50 on Heavy, either surface.
  const groundSpeed = (surface, ground) => (String(ground || "").toLowerCase() === "heavy" ? -50 : 0);
  // A cup's ground ("Soft · Snowy · Winter" -> "Soft").
  const groundOf = (p) => String((p && p.conditions) || "").split("·")[0].trim();

  // Conserve Power / Release (足を貯める / 脚色十分): above 1200 power she builds up power over the
  // first 10 sections and releases it as extra acceleration when her last spurt starts. The
  // document counts base power (motivation applied, no ground modifier); the Umalator adds the
  // ground modifier first, which moves the line up by the cup's power penalty. Both lines, in
  // shown power at Normal mood.
  function conservationLine(p) {
    // Both count shown power past 1200 one for one (the document: base power, halved past 1200,
    // plus half the shown power past 1200; the Umalator: shown power times motivation).
    const pen = Math.abs(groundPower(p.course.surface, groundOf(p)));
    return { doc: 1200, sim: 1200 + pen, penalty: pen, ground: groundOf(p), surface: p.course.surface };
  }
  // The document's acceleration bonus at release, before the activity factors (m/s²).
  const STRATEGY_DISTANCE = { Nige: [1, 1, 1, 1], Senkou: [0.7, 0.8, 0.9, 0.9], Sasi: [0.75, 0.7, 0.875, 1], Oikomi: [0.7, 0.75, 0.86, 0.9] };
  const DIST_INDEX = { Sprint: 0, Mile: 1, Medium: 2, Long: 3 };
  function releaseAccel(power, style, dist) {
    const k = (STRATEGY_DISTANCE[style] || [1, 1, 1, 1])[DIST_INDEX[dist] != null ? DIST_INDEX[dist] : 1];
    return power > 1200 ? Math.sqrt((power - 1200) * 130) * 0.001 * k : 0;
  }

  // Skill activation chance (the Wit check before the race), from base Wit: shown Wit halved past
  // 1200, times motivation. Not changed by style aptitude or skills.
  const MOOD = { "-2": 0.96, "-1": 0.98, 0: 1, 1: 1.02, 2: 1.04 };
  const baseWit = (wit, mood) => halved(+wit || 0) * (MOOD[mood || 0] || 1);
  const activation = (wit, mood) => Math.max(1 - 9000 / Math.max(1, baseWit(wit, mood)) / 100, 0.2);
  // Rushed chance before the race, rounded up to a whole percent; Self-Control takes 3 points off.
  function rushed(wit, mood, selfControl) {
    const w = baseWit(wit, mood);
    const pct = Math.ceil(Math.pow(6.5 / Math.log10(0.1 * w + 1), 2) - 1e-9);
    return Math.max(0, pct - (selfControl ? 3 : 0)) / 100;
  }

  // Skills whose effect scales with her stats (ability value usage): 13 by her highest shown stat,
  // 22 and 23 by her speed in the race. 14 (greens fired) depends on the race, not her stats.
  function valueScale(type, stats, ground) {
    if (type === 13) { const m = Math.max.apply(null, stats); return m < 600 ? 0.8 : m < 800 ? 0.9 : m < 1000 ? 1 : m < 1100 ? 1.1 : 1.2; }
    const speed = halved(stats[0]) + (ground || 0);
    if (type === 22) return speed < 1700 ? 0 : speed < 1800 ? 1 : speed < 1900 ? 2 : speed < 2000 ? 3 : 4;
    if (type === 23) return speed < 1400 ? 1 : speed < 1600 ? 2 : 3;
    return 1;
  }
  const STAT_SCALED = [13, 22, 23];
  // A chart value's factor for her stats, against the stats the chart was run at: { k, type } for
  // a skill that scales with stats, null otherwise. k is null when the chart's factor was 0.
  function statScale(skill, her, chart, ground) {
    const e = ((skill && skill.alternatives) || []).flatMap((a) => a.effects || []).find((x) => STAT_SCALED.includes(x.scaling));
    if (!e) return null;
    const a = valueScale(e.scaling, her, ground), b = valueScale(e.scaling, chart, ground);
    return { type: e.scaling, k: b ? a / b : null, at: a };
  }

  const api = { valueScale, statScale, halved, groundPower, groundSpeed, groundOf, conservationLine, releaseAccel, baseWit, activation, rushed };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaMechanics = api;
})(typeof window !== "undefined" ? window : globalThis);
