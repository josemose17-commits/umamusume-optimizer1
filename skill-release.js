// Which skills a cup can use on Global. For a cup Global has run or is running: the skills out on
// Global now. For one it hasn't reached yet: those, plus every skill JP released by that cup's JP
// date, since Global releases in JP's order. Skill info is a data/skillvalues/index.js row:
// [name, cost, rarity, on Global now (1/0), first JP release (YYYY-MM-DD or null)].
(function (root) {
  // The JP date a cup's skills are counted up to, or null for Global's skills now.
  function cutoff(preset, today) {
    return preset && preset.global && preset.jp && preset.global.start > today ? preset.jp.start : null;
  }
  function outBy(info, cut) {
    if (!info) return false;
    if (info[3]) return true;
    return !!(cut && info[4] && info[4] <= cut);
  }
  // "global": out now; "by": not on Global yet, but JP had it by the cup's JP date; "jp": neither.
  function status(info, cut) {
    if (info && info[3]) return "global";
    return outBy(info, cut) ? "by" : "jp";
  }
  const api = { cutoff, outBy, status };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaSkillRelease = api;
})(typeof window !== "undefined" ? window : globalThis);
