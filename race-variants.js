// A JP-dated cup's simulator from the unmodified JP Umalator worker (vendor/umalator-jp) and that
// cup's variant (data/race-variants/<name>.json, from tools/build_race_variants.js):
//   over        skills whose entry differs from the JP worker's (versions as on the cup's date);
//   syoubu      false: stamina showdown taken out (JP added it on Aug 24, 2023);
//   syoubuLong  true: JP's Oct 29, 2024 long-race factors (2401-2600 m 1.2 -> 1.5, beyond 1.5 -> 1.8).
// Used by race-worker.js in the browser and by the build tool and tests in Node.
(function (root) {
  const SKILLS = ['{"100011":{alternatives:', '{"100011":{"alternatives":'];
  const FACTOR = /(\w)<2401\?1:\1<2601\?1\.2:1\.5\}/;
  const SYOUBU = /\w\.withStaminaSyoubu\(\),(?:\w\.withStaminaSyoubu\(\),)?/g;
  function objectAt(s, start) {
    let depth = 0, q = null;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') { depth--; if (depth === 0) return [start, i + 1]; }
    }
    return null;
  }
  // { skills: [start, end] } of the embedded skill data, or null when this isn't a worker we can
  // patch. loose: also accept a variant worker (JSON skill data, showdown possibly removed).
  function locate(src, loose) {
    let at = SKILLS.map((m) => src.indexOf(m)).find((i) => i >= 0);
    // A variant's JSON skill data starts at its lowest skill ID.
    if (at == null && loose) { const m = /\{"\d+":\{"alternatives":/.exec(src); at = m ? m.index : undefined; }
    if (at == null) return null;
    const skills = objectAt(src, at);
    if (!skills) return null;
    if (!loose && (!FACTOR.test(src) || !(src.match(SYOUBU) || []).length)) return null;
    return { skills };
  }
  // Showdown and its factors only (the skill data is left as it is).
  function patchCode(src, v) {
    let out = src;
    if (!v.syoubu) out = out.replace(SYOUBU, '');
    if (v.syoubu && v.syoubuLong) out = out.replace(FACTOR, '$1<2401?1:$1<2601?1.5:1.8}');
    return out;
  }
  function patch(src, v) {
    const l = locate(src);
    if (!l) throw new Error('This JP simulator build cannot be adjusted for the cup.');
    const over = v.over && Object.keys(v.over).length ? v.over : null;
    const body = src.slice(0, l.skills[0]) + (over ? 'Object.assign(' + src.slice(l.skills[0], l.skills[1]) + ',' + JSON.stringify(over) + ')' : src.slice(l.skills[0], l.skills[1])) + src.slice(l.skills[1]);
    return patchCode(body, v);
  }
  const api = { locate, patch, patchCode, objectAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.UmaRaceVariants = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
