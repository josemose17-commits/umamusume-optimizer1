// Bundles Euophrys' support card tier list (MIT, github.com/Euophrys/umamusume-tierlist) for the
// browser: its scoring code (tierlist-calc.js), event table, scenario weights and Global card
// data, unchanged apart from turning the ES modules into one script. Cards not on Global yet come
// from its JP card data (identical to the Global data for every card both have, apart from the
// name's language), so the pull planner can score cards on future banners.
// Usage: node tools/build_euophrys.mjs   (needs network access to raw.githubusercontent.com)
import fs from "node:fs";
import vm from "node:vm";

const RAW = "https://raw.githubusercontent.com/Euophrys/umamusume-tierlist/main/";
const get = async (p) => {
  const r = await fetch(RAW + p);
  if (!r.ok) throw new Error(p + ": HTTP " + r.status);
  return r.text();
};
const strip = (src) => src
  .replace(/^import .*$/gm, "")
  .replace(/^export default \w+;?\s*$/gm, "")
  .replace(/^export (function|const|let)/gm, "$1");

const [calc, events, scenarios, gl, jp, license] = await Promise.all([
  get("src/components/tierlist-calc.js"), get("src/card-events.js"), get("src/scenarios.js"), get("src/cards/gl.js"), get("src/cards/jp.js"), get("LICENSE"),
]);
// The card files are ES modules exporting an object literal: evaluate just the literal.
const literal = (src) => vm.runInNewContext("(" + src.replace(/^export default cards;?\s*$/m, "").replace(/^const cards\s*=\s*/m, "").trim().replace(/;$/, "") + ")");
const cards = literal(gl);
const onGlobal = new Set(cards.map((c) => c.id));
const jpOnly = literal(jp).filter((c) => !onGlobal.has(c.id));
cards.push(...jpOnly);

const out = `// Euophrys' Uma Musume support card tier list, bundled by tools/build_euophrys.mjs. Do not edit.
// Source: https://github.com/Euophrys/umamusume-tierlist
/*
${license.trim()}
*/
(function (root) {
${strip(events)}
${strip(scenarios)}
${strip(calc)}
  const api = { processCards, GainsToScore, getScenario, getServerConfig, SCENARIOS_BY_SERVER, events, raceRewards };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Euophrys = api;
})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : globalThis);
`;
fs.writeFileSync("vendor/euophrys.js", out);
fs.writeFileSync("data/euophrys-cards.js",
  "// Support card data from Euophrys' tier list (MIT), one entry per card and limit break: its Global\n" +
  "// data, then its JP data for cards not on Global yet.\n" +
  "(function (root) {\n  const CARDS = " + JSON.stringify(cards) + ";\n" +
  '  if (typeof module !== "undefined" && module.exports) module.exports = CARDS;\n  else root.EuophrysCards = CARDS;\n' +
  '})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : globalThis);\n');
console.log("vendor/euophrys.js", out.length, "bytes; data/euophrys-cards.js", cards.length, "card entries (" + jpOnly.length + " from JP data)");
