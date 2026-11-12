// game8's skill picks for a Champions Meeting or League of Heroes cup, pasted by hand from game8's
// Global cup guide (game8.co). game8 lists recommended skills by group (greens, acceleration,
// speed, debuffs) without ranking them, and some as must-haves. The app treats must-haves as the
// deck's must-have skills and recommended ones as a tag and a tie-breaker; the race simulator
// still decides which skills are stronger.
(function (root) {
  const SO = root.UmaSkillOpt || (typeof require !== "undefined" ? require("./skill-opt.js") : null);

  // Copied text -> one skill per line. game8 writes "・ Left-Handed ◯" and adds notes in brackets
  // ("Solid Steps (requires 1000+ Power)"); a heading ends with ":" ("Track-based Conditionals:").
  function lines(text) {
    return String(text || "").split(/\r?\n|・|•|;/)
      .map((l) => l.replace(/^\s*(?:[-*–—]|\d+[.)])\s*/, "").trim())
      .filter((l) => l && !/:\s*$/.test(l));
  }
  // Pasted text -> { found: [{ id, note, line }], missed: [line] }. names: [[id, name], ...].
  // A note in brackets is kept and shown next to the skill.
  function parse(text, names) {
    const found = [], missed = [], seen = new Set();
    lines(text).forEach((line) => {
      const m = /^(.*?)\s*[([（]([^)\]）]*)[)\]）]\s*$/.exec(line);
      const name = (m ? m[1] : line).trim(), note = m ? m[2].trim() : "";
      let hit = SO.parsePaste(name, names).found[0];
      // "Racing Spirit: Mood" style lines: try the part before the colon too.
      if (!hit && name.indexOf(":") > 0) hit = SO.parsePaste(name.slice(0, name.indexOf(":")), names).found[0];
      if (!hit) { missed.push(line); return; }
      if (seen.has(hit.id)) return;
      seen.add(hit.id);
      found.push({ id: String(hit.id), note, line });
    });
    return { found, missed };
  }
  // A cup's saved picks from the two pasted lists. A skill in both counts as a must-have.
  function entry(mustText, recText, names, today) {
    const must = parse(mustText, names), rec = parse(recText, names);
    const mustIds = new Set(must.found.map((x) => x.id));
    return { must: must.found.map(({ id, note }) => ({ id, note })), rec: rec.found.filter((x) => !mustIds.has(x.id)).map(({ id, note }) => ({ id, note })),
      missed: must.missed.concat(rec.missed), text: { must: String(mustText || ""), rec: String(recText || "") }, at: today || null };
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
  const api = { lines, parse, entry, picks, mustToAdd };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaGame8 = api;
})(typeof window !== "undefined" ? window : globalThis);
