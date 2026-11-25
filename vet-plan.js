// Your veterans for a CM, after LightBirb's "Uma Parenting 201": where to branch off your core
// loop for a cup (exit points), and which veterans are worth keeping (cleanout).
// A veteran (veterans.js): { id, cid, tid, self: member, parents: [member, member] }, a member
// { white: [[skill, stars]], blue: [stat, stars], pink: [aptitude, stars], green: stars }.
// Aptitude indexes: 0 Turf, 1 Dirt, 2 Sprint, 3 Mile, 4 Medium, 5 Long, 6 Front, 7 Pace, 8 Late, 9 End.
(function (root) {
  "use strict";
  // Exit points: veterans with a good blue and a good pink (2★+) of the cup (its distance, surface
  // or her style), ranked by the useful whites on her line (her own, then her parents' at half),
  // then her blue and pink stars. A good blue: 2★+ in a stat she needs; in Grand Live (its stat
  // gains favor them) 2★+ stamina or 3★ guts or wit instead. o: { pinks: [aptitude], blues: [stat]
  // (the ace's gaps or key stats), grandLive, family(skill) → white family, useful: Set(family) }.
  function exitPoints(vets, o) {
    const pinks = new Set(o.pinks || []), blues = new Set(o.blues || []), fam = o.family || ((id) => id), useful = o.useful || null;
    return (vets || []).map((v) => {
      const s = v.self || {}, blue = s.blue || [0, 0], pink = s.pink || [0, 0];
      const goodBlue = o.grandLive ? (blue[0] === 1 && blue[1] >= 2) || ((blue[0] === 3 || blue[0] === 4) && blue[1] >= 3) : blue[1] >= 2 && blues.has(blue[0]);
      if (!(goodBlue && pink[1] >= 2 && pinks.has(pink[0]))) return null;
      const mine = new Set(), line = new Set();
      (s.white || []).forEach(([id]) => { const f = fam(String(id)); if (!useful || useful.has(f)) mine.add(f); });
      (v.parents || []).forEach((p) => (p && p.white || []).forEach(([id]) => { const f = fam(String(id)); if ((!useful || useful.has(f)) && !mine.has(f)) line.add(f); }));
      return { v, blue, pink, green: s.green || 0, whites: mine.size, lineWhites: line.size, score: mine.size + line.size / 2 + (blue[1] + pink[1]) / 10 };
    }).filter(Boolean).sort((a, b) => b.score - a.score || b.green - a.green);
  }

  // Cleanout: keep the best blue+pink pair for each pink, the best of each character (her green),
  // any veteran who's the only one with a white (2★+) worth keeping, and with o.general the best
  // general grandparent of each style (o.generalStyles: your parent team's styles; else all four);
  // the rest are safe to transfer. → Map(veteran id → { keep, why: [reasons] }).
  function cleanout(vets, o = {}) {
    const fam = o.family || ((id) => id), out = new Map(), keep = (v, why) => { const e = out.get(v.id); e.keep = true; e.why.push(why); };
    const whites = (v) => ((v.self && v.self.white) || []).filter(([, st]) => st >= 2).map(([id]) => fam(String(id)));
    const value = (v) => { const s = v.self || {}; return ((s.blue || [])[1] || 0) + ((s.pink || [])[1] || 0) + whites(v).length / 2; };
    (vets || []).forEach((v) => out.set(v.id, { keep: false, why: [] }));
    const best = (group, why, score = value) => {
      const by = new Map();
      (vets || []).forEach((v) => { const k = group(v); if (k == null) return; const b = by.get(k); if (!b || score(v) > score(b)) by.set(k, v); });
      by.forEach((v, k) => keep(v, why(k, v)));
    };
    best((v) => (v.self && v.self.pink && v.self.pink[1] >= 1 ? v.self.pink[0] : null), (k) => "best blue + pink with " + (o.aptName ? o.aptName(k) : "pink " + k));
    best((v) => (v.self && v.self.green >= 1 ? v.cid : null), () => "your best of her (green)", (v) => v.self.green * 10 + value(v));
    // o.general(v, style) → her fit as a general grandparent (general-parents.js vetFit): keep each
    // style's best.
    if (o.general) (o.generalStyles && o.generalStyles.length ? o.generalStyles : ["Nige", "Senkou", "Sasi", "Oikomi"]).forEach((st) => best((v) => (o.general(v, st) > 0 ? st : null), () => "best general " + (o.styleName ? o.styleName(st) : st) + " grandparent", (v) => o.general(v, st)));
    const carriers = new Map();
    (vets || []).forEach((v) => whites(v).forEach((f) => carriers.set(f, (carriers.get(f) || []).concat([v]))));
    carriers.forEach((list, f) => { if (list.length === 1) keep(list[0], "the only one with " + (o.whiteName ? o.whiteName(f) : f)); });
    return out;
  }

  // The grandparent rule, compared (shown, not used): the app scales a grandparent's sparks by her
  // own affinity (only her own links, affinity.js individual); Parenting 201 says a grandparent
  // gets about half her parent's affinity bonus. s: family.js score() (own, white), F: family.js.
  // → { app, video, slots } in expected white hints from the four grandparents.
  function grandCheck(s, F) {
    const out = { app: 0, video: 0, slots: 0 };
    if (!s || !s.own) return out;
    (s.white || []).forEach((w) => {
      const parent = F.PARENT_OF[w.slot];
      if (!parent) return;
      out.slots++;
      out.app += F.twice(F.WHITE, w.stars, s.own[w.slot] || 0, F.GRAND);
      out.video += F.twice(F.WHITE, w.stars, (s.own[parent] || 0) / 2, F.GRAND);
    });
    return out;
  }

  // A veteran as a parent for one ace: Keep, Usable or Retrain, with why. o: { blue: stat indices
  // in order of the ace's gaps (first = biggest), pinks: aptitude indices the race needs that she
  // isn't at yet (empty: none needed), whites: target skill families (most valuable first),
  // family(id) -> skill family }.
  //   Keep: 3★ blue in her biggest gap, 2★+ pink in a needed aptitude (if any), 2+ target whites.
  //   Usable: 2★+ blue in one of her gap stats, 1★+ pink in a needed aptitude (if any).
  //   Retrain: blue in the wrong stat (or none), or no pink for a needed aptitude.
  function grade(v, o) {
    const self = (v && v.self) || {}, b = self.blue || [0, 0], p = self.pink || [0, 0];
    const top = (o.blue || [])[0], gapStats = new Set(o.blue || []), need = new Set(o.pinks || []);
    const tw = new Set((o.whites || []).slice(0, 4).map(String));
    const whites = (self.white || []).filter(([id, st]) => st >= 1 && tw.has(String(o.family ? o.family(id) : id)));
    const pinkOk = (min) => !need.size || (need.has(p[0]) && p[1] >= min);
    const why = [];
    if (!b[1]) why.push("no blue spark");
    else if (!gapStats.has(b[0])) why.push("blue in a stat she isn't short in");
    else if (b[1] < 2) why.push("only 1★ blue");
    if (need.size && !(need.has(p[0]) && p[1] >= 1)) why.push("no pink for an aptitude she needs");
    let mark = "retrain";
    if (b[1] === 3 && b[0] === top && pinkOk(2) && whites.length >= 2) mark = "keep";
    else if (b[1] >= 2 && gapStats.has(b[0]) && pinkOk(1)) mark = "usable";
    if (mark !== "retrain") why.length = 0;
    if (mark === "usable") {
      if (b[1] < 3 || b[0] !== top) why.push(b[0] !== top ? "blue in her second gap, not the biggest" : "2★ blue, not 3★");
      if (need.size && p[1] < 2) why.push("1★ pink");
      if (whites.length < 2) why.push(whites.length ? "only 1 target white" : "no target whites");
    }
    return { mark, why, whites: whites.map(([id, st]) => [String(id), st]) };
  }
  const api = { exitPoints, cleanout, grandCheck, grade };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaVetPlan = api;
})(typeof window !== "undefined" ? window : globalThis);
