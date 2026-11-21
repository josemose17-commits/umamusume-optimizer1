// General grandparents by running style: uma.guide's "General Skill Priority for Parents"
// (uma.guide/guides/parenting-in-umamusume, read 2026-11-21). "Broad, generalized Skill
// recommendations": per style, 4 impactful skills that aren't too hard to get (the short list,
// for your first loop), a long-term list, and "Straight and Corner Skills". The page shows each
// list under a style icon; which list is whose was read from the skills themselves: Dodging Danger
// and Firm Resolve fire only for Front Runners, Shrewd Step only for Pace Chasers, Pedal to the
// Metal only for Late Surgers, and the 4th list (Restraint) is the End Closers'. Its sparks guide
// agrees: "Backliners will often need Uma Stan, and Front Runners will always need Groundwork."
// The straight and corner skills are ours: the ones that fire on any course (none tied to one
// distance or surface) plus the style's own. Skill ids are the white (○) versions.
(function (root) {
  "use strict";
  const DATA = {
    source: "uma.guide Global Parenting Guide",
    url: "https://uma.guide/guides/parenting-in-umamusume",
    read: "2026-11-21",
    styles: {
      // Groundwork, Ignited Spirit WIT, Prudent Positioning, Dodging Danger
      Nige: { short: [201601, 210052, 200452, 201262],
        // + Racing Spirit: Stamina, Tail Held High, Firm Resolve
        long: [201601, 210052, 210101, 200452, 201262, 201611, 202462],
        // Front Runner Straightaways/Corners ○
        corner: [201242, 201252] },
      // Groundwork, Nimble Navigator, Racing Spirit: Stamina, Uma Stan
      Senkou: { short: [201601, 200492, 210101, 201591],
        // + Racing Spirit: Power, Tail Held High, Shrewd Step
        long: [201601, 200492, 210101, 210111, 201591, 201611, 201332],
        // Pace Chaser Straightaways/Corners ○
        corner: [201312, 201322] },
      // Uma Stan, Pedal to the Metal, Tail Held High, Nimble Navigator
      Sasi: { short: [201591, 202452, 201611, 200492],
        // or: Uma Stan, Racing Spirit: Stamina, Pedal to the Metal, Nimble Navigator
        alt: [201591, 210101, 202452, 200492],
        // + Restraint, Racing Spirit: Stamina, Racing Spirit: Power
        long: [201591, 202161, 210101, 202452, 210111, 201611, 200492],
        // Late Surger Straightaways/Corners ○
        corner: [201382, 201392] },
      // Uma Stan, Restraint, Tail Held High, Nimble Navigator
      Oikomi: { short: [201591, 202161, 201611, 200492],
        // or: Uma Stan, Racing Spirit: Stamina, Tail Held High, Nimble Navigator
        alt: [201591, 210101, 201611, 200492],
        // + Racing Spirit: Stamina, Racing Spirit: Power
        long: [201591, 202161, 210101, 210111, 201611, 200492],
        // End Closer Straightaways/Corners ○, Straightaway Spurt (End Closers, last spurt)
        corner: [201452, 201462, 200642] },
    },
    // Corner Adept ○, Corner Acceleration ○, Straightaway Adept, Straightaway Acceleration: fire on
    // any course, for every style.
    corner: [200332, 200342, 200362, 200372],
    // uma.guide's "Special Mentions" for every style (notes, not targets).
    special: ["TS Climax", "Corner and Straight Skills", "Any late-race Speed Skills", "Green Skills"],
  };
  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
  else root.UmaGeneralParentsData = DATA;
})(typeof window !== "undefined" ? window : globalThis);
