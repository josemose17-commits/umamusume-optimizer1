// Which white skills are relevant for a parent built for one CM race and running style, to pass
// down as sparks:
// - Ace parent: skills worth more than 0.1 L (median) there, the greens (passive stat skills)
//   whose conditions fit the race, and for Mile and longer the recoveries that fit it. Never
//   debuffs: they're for debuffer parents only.
// - Debuffer parent: only the debuffs that work there (tiers.js parentTargets).
// Greens and recoveries come from data/skill-kinds.js; a green whose condition depends on
// something unknown before the race (gate, popularity, the other runners) doesn't count, and a
// recovery's in-race conditions (position, phase, corners) are taken as met.
(function (root) {
  "use strict";
  const STYLE_NO = { Nige: 1, Senkou: 2, Sasi: 3, Oikomi: 4 };
  const DIST_NO = { Sprint: 1, Mile: 2, Medium: 3, Long: 4 };

  // What's known about the race before it starts, in the game's condition names.
  function raceFacts(preset, style, tracks) {
    const c = preset.course, d = preset.racedef || {};
    const f = { always: 1, distance_type: DIST_NO[c.dist], ground_type: c.surface === "Dirt" ? 2 : 1, is_basis_distance: c.distance % 400 === 0 ? 1 : 0, running_style: STYLE_NO[style] };
    if (c.turn === "Right" || c.turn === "Left") f.rotation = c.turn === "Right" ? 1 : 2;
    if (tracks && tracks[c.id] != null) f.track_id = tracks[c.id];
    ["ground", "weather", "season", "time"].forEach((k) => { if (d[k] != null) f[k === "ground" ? "ground_condition" : k] = d[k]; });
    return f;
  }

  const OPS = { "==": (a, b) => a === b, "!=": (a, b) => a !== b, ">=": (a, b) => a >= b, "<=": (a, b) => a <= b, ">": (a, b) => a > b, "<": (a, b) => a < b };
  // One clause like "track_id==10006": true or false when the race decides it, else `unknown`.
  function clause(s, facts, unknown) {
    const m = /^([a-z_0-9]+)(==|!=|>=|<=|>|<)(-?\d+)$/.exec(s.trim());
    if (!m || facts[m[1]] == null) return unknown;
    return OPS[m[2]](facts[m[1]], +m[3]);
  }
  // A skill fits when any alternative does; in one, any "@" group whose "&" clauses all hold.
  const fits = (alternatives, facts, unknown) => alternatives.some((alt) => alt.split("@").some((g) => g.split("&").every((c) => clause(c, facts, unknown))));

  // { id: weight } for an ace parent; weight is the median L, at least minL for greens and
  // recoveries. why() says which rule let a skill in.
  function aceTargets(o) {
    const minL = o.minL == null ? 0.1 : o.minL, out = {}, why = {};
    const white = (id) => id[0] !== "9" && (!o.rarityOf || o.rarityOf(id) === 1) && !(o.debuffs && o.debuffs[id]);
    Object.entries(o.raceSkills || {}).forEach(([id, L]) => {
      if (L > minL && white(id)) { out[id] = L; why[id] = "L"; }
    });
    const kinds = o.kinds && o.kinds.skills;
    if (kinds) {
      const facts = raceFacts(o.preset, o.style, o.kinds.tracks);
      Object.entries(kinds).forEach(([id, k]) => {
        if (out[id] || !white(id)) return;
        if (k[0] === "recovery" && !(facts.distance_type >= 2)) return;
        if (!fits(k[1], facts, k[0] === "recovery")) return;
        out[id] = Math.max(minL, (o.raceSkills || {})[id] || 0);
        why[id] = k[0];
      });
    }
    return { targets: out, why };
  }

  const api = { raceFacts, fits, aceTargets };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaParentRelevance = api;
})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : globalThis);
