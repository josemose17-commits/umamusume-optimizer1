// Which white skills are relevant for a parent built for one CM race and running style, to pass
// down as sparks:
// skills worth more than 0.1 L (median) there, the greens (passive stat skills) whose conditions
// fit the race, for Mile and longer the recoveries that fit it, and the position skills (lane
// speed, vision: Prudent Positioning, Go with the Flow...) that fit it, which the Umalator can't
// value. Greens, recoveries and position skills count at least 0.1 L. Never debuffs.
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
    // o.positions (data/skill-positions.js): skills that need her where her style doesn't run are out.
    const white = (id) => id[0] !== "9" && (!o.rarityOf || o.rarityOf(id) === 1) && !(o.debuffs && o.debuffs[id]) && positionFits(o.positions, id, o.style);
    Object.entries(o.raceSkills || {}).forEach(([id, L]) => {
      if (L > minL && white(id)) { out[id] = L; why[id] = "L"; }
    });
    const kinds = o.kinds && o.kinds.skills;
    if (kinds) {
      const facts = raceFacts(o.preset, o.style, o.kinds.tracks);
      // The kinds list is white skills only, including ones the race charts lack (so no rarity).
      const ok = (id) => id[0] !== "9" && !(o.debuffs && o.debuffs[id]) && positionFits(o.positions, id, o.style);
      Object.entries(kinds).forEach(([id, k]) => {
        if (out[id] || !ok(id)) return;
        if (k[0] === "recovery" && !(facts.distance_type >= 2)) return;
        // In-race clauses (position, lanes, being blocked) count as met for recoveries and
        // position skills; they're about the race as it goes.
        if (!fits(k[1], facts, k[0] === "recovery" || k[0] === "position")) return;
        out[id] = Math.max(minL, (o.raceSkills || {})[id] || 0);
        why[id] = k[0];
      });
    }
    return { targets: out, why };
  }

  // Whether a skill can fire for this running style, by where in the pack it needs her
  // (data/skill-positions.js): back-half skills never fit Front Runners or Pace Chasers, and
  // front-half skills never fit End Closers; Late Surgers move through the pack, so both fit.
  // The charts run a Front Runner in 1st place, so skills that need a rival ahead of her (No
  // Stopping Me!, Slipstream, passing skills) never fit her either.
  const BACK_NO = { Nige: 1, Senkou: 1 }, FRONT_NO = { Oikomi: 1 }, AHEAD_NO = { Nige: 1 };
  // With pos.contest (0..1, a share of races), Front Runners are taken to fight for the lead:
  // rival-ahead skills fit her, counted at that share (aheadScale).
  const sets = (pos) => pos.sets || (pos.sets = { back: new Set(pos.back.map(String)), front: new Set(pos.front.map(String)), ahead: new Set((pos.ahead || []).map(String)) });
  // Why a skill can't fire for this style: "back", "front", "ahead", or null when it can.
  function positionMiss(pos, id, style) {
    if (!pos) return null;
    sets(pos);
    const k = String(id);
    if (AHEAD_NO[style] && pos.sets.ahead.has(k) && !(pos.contest > 0)) return "ahead";
    if (BACK_NO[style] && pos.sets.back.has(k)) return "back";
    if (FRONT_NO[style] && pos.sets.front.has(k)) return "front";
    return null;
  }
  const positionFits = (pos, id, style) => !positionMiss(pos, id, style);
  // The share of her chart value a skill keeps: a rival-ahead skill for a Front Runner who fights
  // for the lead keeps pos.contest (the share of races someone is ahead of her); others keep 1.
  function aheadScale(pos, id, style) {
    if (!pos || !AHEAD_NO[style] || !(pos.contest > 0)) return 1;
    return sets(pos).ahead.has(String(id)) ? Math.min(1, pos.contest) : 1;
  }

  // A cup's own positions: data/skill-positions.js (Global's skill versions) with a JP-dated cup's
  // changes (data/skillvalues/index.js meta.variants[...].positions: { back|front|ahead: { add,
  // del } }), for the conditions JP changed by then and the skills only JP has.
  function positionsWith(base, changes) {
    if (!base || !changes) return base;
    const adj = (k) => {
      const d = changes[k] || {}, del = new Set((d.del || []).map(String));
      return (base[k] || []).map(String).filter((id) => !del.has(id)).concat((d.add || []).map(String));
    };
    return { back: adj("back"), front: adj("front"), ahead: adj("ahead") };
  }
  // The same positions with Front Runners fighting for the lead for that share of races.
  const withContest = (base, share) => (share > 0 && base ? { back: base.back, front: base.front, ahead: base.ahead || [], contest: share } : base);

  const api = { raceFacts, fits, aceTargets, positionFits, positionMiss, positionsWith, aheadScale, withContest };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaParentRelevance = api;
})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : globalThis);
