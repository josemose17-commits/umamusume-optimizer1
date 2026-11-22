// Runaway (大逃げ, the simulators' "Oonige"): a Front Runner sub-style the Runaway skill unlocks,
// for a few characters only (Game8: Silence Suzuka first on Global, Nov 2025; JP also has Daitaku
// Helios, Twin Turbo, Mejiro Palmer, Tap Dance City and Katsuragi Ace). The game data has no
// Runaway skill or list, so the characters are listed here by hand. She runs on her Front Runner
// aptitude, counts as a Front Runner for skill conditions and style debuffs (the simulators'
// strategyMatches: 1 and 5 match), sets herself further ahead and burns far more HP (HP
// coefficient 0.86 against Front Runner's 0.95).
// Precomputed data (skill charts, stat curves, uma values) is per style; a set without Runaway
// rows borrows Front Runner's (data()), and the app says so.
(function (root) {
  "use strict";
  const STYLE = "Oonige", LABEL = "Runaway", BASE = "Nige", APT = 6, HP = 0.86;
  // Character ids → where Game8 reported the Runaway skill.
  const CHARS = { 1002: "Global", 1064: "JP", 1065: "JP", 1066: "JP", 1104: "JP", 1107: "JP" };
  const STYLE_APT = { Nige: 6, Senkou: 7, Sasi: 8, Oikomi: 9, Oonige: 6 };
  const can = (t) => !!(t && CHARS[t.cid] != null);
  const is = (style) => style === STYLE;
  // The style a data set is read with: Runaway borrows Front Runner's unless the set has Runaway
  // (has: true, or a function of the style).
  const data = (style, has) => (style === STYLE && !(typeof has === "function" ? has(style) : has) ? BASE : style);
  const aptIndex = (style) => STYLE_APT[style];
  // Her grade in a style (Runaway: her Front Runner grade).
  const grade = (t, style) => (t && t.apt ? t.apt[STYLE_APT[style]] : null);
  // The styles she can run: the four, and Runaway when she has the skill.
  const stylesOf = (t) => ["Nige", "Senkou", "Sasi", "Oikomi"].concat(can(t) ? [STYLE] : []);
  const api = { STYLE, LABEL, BASE, APT, HP, CHARS, STYLE_APT, can, is, data, aptIndex, grade, stylesOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaRunaway = api;
})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : globalThis);
