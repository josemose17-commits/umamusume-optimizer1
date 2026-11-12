// game8's skill picks for a Champions Meeting or League of Heroes cup, pasted by hand from game8's
// Global cup guide (game8.co). game8 lists recommended skills by group (greens, acceleration,
// speed, debuffs) without ranking them, and some as must-haves. The app treats must-haves as the
// deck's must-have skills and recommended ones as a tag and a tie-breaker; the race simulator
// still decides which skills are stronger.
(function (root) {
  const SO = root.UmaSkillOpt || (typeof require !== "undefined" ? require("./skill-opt.js") : null);

  // Copied text -> one skill line per entry: { text, star }. game8 writes "・ Left-Handed ◯" or
  // "★ Groundwork" (★: a top pick, taken as a must-have), adds notes in brackets ("Solid Steps
  // (requires 1000+ Power)"), and a heading ends with ":" ("Track-based Conditionals:").
  // A line starting with ⓘ is game8's note on the line above.
  function lines(text) {
    return String(text || "").split(/\r?\n|(?=★)|(?=ⓘ)|・|•|;/)
      .map((l) => { const star = /^\s*[★☆]/.test(l), info = /^\s*ⓘ/.test(l); return { text: l.replace(/^\s*(?:[★☆ⓘ]|[-*–—]|\d+[.)])\s*/, "").trim(), star, info }; })
      .filter((l) => l.text && (l.info || !/:\s*$/.test(l.text)));
  }
  // One name as game8's page copies it: its image label gives "Groundwork Icon Groundwork", and an
  // inherited unique comes after its card ("Seiun Sky (Reeling in the Big One) Angling and
  // Scheming Icon Angling and Scheming"): the name after the last "Icon" is the skill.
  const nameOf = (part) => { const i = part.lastIndexOf(" Icon "); return (i >= 0 ? part.slice(i + 6) : part.replace(/^Icon\s+/, "")).trim(); };
  function find(name, names) {
    let hit = SO.parsePaste(name, names).found[0];
    // "Racing Spirit: Mood" style lines: try the part before the colon too.
    if (!hit && name.indexOf(":") > 0) hit = SO.parsePaste(name.slice(0, name.indexOf(":")), names).found[0];
    return hit ? String(hit.id) : null;
  }
  // Pasted text -> { found: [{ id, note, line, star, alt }], missed: [line], pairs: [{ id, with }] }.
  // names: [[id, name], ...]. A note in brackets, or an ⓘ line under it, is kept and shown next to
  // the skill. "A / B" or "A or B" lists either skill: both are found, and B (alt) counts as
  // recommended even on a ★ line. "A + B or C" pairs A with B or C: A only pays off with one of
  // them (game8: "Dodging Danger must be paired with either Prudent Positioning or Ignited Spirit WIT").
  function parse(text, names) {
    const found = [], missed = [], pairs = [], seen = new Set();
    let last = [];
    lines(text).forEach(({ text: line, star, info }) => {
      if (info) { last.slice(0, 1).forEach((x) => { x.note = x.note ? x.note + "; " + line : line; }); return; }
      const m = /^(.*?)\s*[([（]([^)\]）]*)[)\]）]\s*$/.exec(line);
      const body = (m ? m[1] : line).trim(), note = m ? m[2].trim() : "";
      const sides = body.split(/\s+\+\s+/).map((side) => side.split(/\s+\/\s+|\s+or\s+/i).map(nameOf).filter(Boolean));
      const ids = sides.map((side) => side.map((name) => { const id = find(name, names); if (!id) missed.push(sides.flat().length > 1 ? name : line); return id; }).filter(Boolean));
      last = [];
      ids.flat().forEach((id, k) => {
        let x = found.find((y) => y.id === id);
        if (!x && !seen.has(id)) { seen.add(id); x = { id, note, line, star, alt: k > 0 }; found.push(x); }
        if (x) last.push(x);
      });
      if (ids.length > 1) ids[0].forEach((id) => { const w = ids.slice(1).flat(); if (w.length) pairs.push({ id, with: w }); });
    });
    return { found, missed, pairs };
  }
  // A cup's saved picks from the two pasted lists. A skill in both counts as a must-have, and so
  // does a ★ line's first skill in the recommended list.
  function entry(mustText, recText, names, today) {
    const must = parse(mustText, names), rec = parse(recText, names);
    const musts = must.found.filter((x) => !x.alt).concat(rec.found.filter((x) => x.star && !x.alt));
    const mustIds = new Set(musts.map((x) => x.id));
    const recs = must.found.filter((x) => x.alt).concat(rec.found).filter((x) => !mustIds.has(x.id));
    return { must: musts.map(({ id, note }) => ({ id, note })), rec: recs.filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i).map(({ id, note }) => ({ id, note })),
      missed: must.missed.concat(rec.missed), pairs: must.pairs.concat(rec.pairs), text: { must: String(mustText || ""), rec: String(recText || "") }, at: today || null };
  }
  // { id: "must" | "rec" } for a saved entry, only skills that fit her style (fits(id) false: a
  // skill another style's chart has and hers doesn't, such as Front Runner Savvy for a Pace Chaser).
  function picks(e, fits) {
    const out = {};
    if (!e) return out;
    (e.rec || []).forEach((x) => { if (!fits || fits(x.id)) out[x.id] = "rec"; });
    (e.must || []).forEach((x) => { if (!fits || fits(x.id)) out[x.id] = "must"; });
    return out;
  }
  // The must-haves to add to an ace's deck: game8's, minus the ones she dropped and the ones she has.
  function mustToAdd(e, have, dropped, fits) {
    const p = picks(e, fits), h = new Set((have || []).map(String)), d = new Set((dropped || []).map(String));
    return Object.keys(p).filter((id) => p[id] === "must" && !h.has(id) && !d.has(id));
  }
  // Skills bought or held without a partner game8 pairs them with: [{ id, with }].
  function unpaired(e, have) {
    const h = new Set((have || []).map(String));
    return ((e && e.pairs) || []).filter((p) => h.has(p.id) && !p.with.some((w) => h.has(w)));
  }
  const api = { lines, parse, entry, picks, mustToAdd, unpaired };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaGame8 = api;
})(typeof window !== "undefined" ? window : globalThis);
