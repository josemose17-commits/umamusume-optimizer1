// Grand Masters: the Knowledge Table, Goddess Wisdom colors and the goddess plan, for the turn
// coach. Rules from GameTora's scenario guide (gametora.com/umamusume/grand-masters):
//  - Fragments come in three colors (red Darley Arabian, blue Godolphin Barb, yellow Byerley
//    Turk). The table holds 8; with 7, a double drop gives only one; with 8, nothing drops until
//    the Wisdom is obtained, and nothing drops on the turn you obtain it.
//  - Two fragments make a crystal, two crystals a merged crystal, two merged crystals the Wisdom.
//    A combination takes its left part's color, so the merged crystals are the 1st and 5th
//    fragments' colors. Same color: the Wisdom is that color. Different: the color with more of
//    the 8 fragments; a tie is a coin flip.
//  - Each Wisdom raises its goddess one level (0 to 5). About 9-11 levels a run.
//  - Year-end races (after turns 24, 48, 72) pay each goddess's bonus when her level is at least
//    the year (1, 2, 3). The goddess skill event (turn 77): her skill's rare version at level 4+,
//    both versions at 5, a level 3 hint when the three add up to 12+. All three at 3+ by the end:
//    a Firm Course Menace hint.
(function (root) {
  "use strict";
  const COLORS = ["red", "blue", "yellow"];
  const NAME = { red: "Red (Darley Arabian)", blue: "Blue (Godolphin Barb)", yellow: "Yellow (Byerley Turk)" };
  const SHORT = { red: "Red", blue: "Blue", yellow: "Yellow" };
  const SLOTS = 8, YEAR_END = { 24: 1, 48: 2, 72: 3 }, SKILL_TURN = 77;

  const blank = () => ({ table: [], levels: { red: 0, blue: 0, yellow: 0 }, skill: "red" });
  // The scenario's state on a career (created on first use).
  function of(state) {
    if (!state.gm) state.gm = blank();
    const g = state.gm;
    if (!Array.isArray(g.table)) g.table = [];
    g.levels = Object.assign({ red: 0, blue: 0, yellow: 0 }, g.levels || {});
    if (!COLORS.includes(g.skill)) g.skill = "red";
    return g;
  }
  // Fragments that fit from a drop of n (1 or 2): a double can't land on 7; nothing on 8.
  const fits = (table, n) => (table.length >= SLOTS ? 0 : table.length === SLOTS - 1 ? 1 : Math.max(0, Math.min(2, n)));
  // Adds a drop; returns how many fragments went in.
  function add(table, color, n) {
    if (!COLORS.includes(color)) return 0;
    const k = fits(table, n);
    for (let i = 0; i < k; i++) table.push(color);
    return k;
  }
  // The Wisdom color the table makes: { color, sure } (sure: false for a coin flip or an unfilled
  // deciding slot), or null while the 1st fragment is missing.
  function wisdomColor(table) {
    const a = table[0], b = table[4];
    if (!a) return null;
    if (!b) return { color: a, sure: false, open: true }; // the 5th slot can still change it
    if (a === b) return { color: a, sure: true };
    const n = (c) => table.filter((x) => x === c).length, full = table.length >= SLOTS;
    if (full && n(a) === n(b)) return { color: a, sure: false, tie: [a, b] };
    return { color: n(a) >= n(b) ? a : b, sure: full, majority: true };
  }

  // The goddess your next Wisdom should raise: { color, why }. The guides' order (game8,
  // GameTora): Red to 2 in Junior (level 1 already cuts training energy 10%), every goddess to 1,
  // the one whose skill you want to 4 (level 4: its rare skill), the others to 3 (all at 3: Firm
  // Course Menace), then 4s, then your skill goddess to 5 (both skill versions).
  function nextColor(levels, turn, skill) {
    const L = Object.assign({ red: 0, blue: 0, yellow: 0 }, levels || {}), sk = COLORS.includes(skill) ? skill : "red";
    const others = COLORS.filter((c) => c !== sk);
    const low = (list, below) => list.filter((c) => L[c] < below).sort((x, y) => L[x] - L[y] || COLORS.indexOf(x) - COLORS.indexOf(y))[0];
    if (turn <= 24 && L.red < 2) return { color: "red", why: "Red to level 2 in Junior: it cuts training energy 10% at level 1, 15% at 2" };
    let c = low(COLORS, 1);
    if (c) return { color: c, why: "every goddess to level 1 first (each adds +5% training and its year-end bonus)" };
    if (L[sk] < 4) return { color: sk, why: "your skill goddess to level 4 for her rare skill at the goddess event (turn 77)" };
    c = low(others, 3);
    if (c) return { color: c, why: "the others to level 3: all three at 3 give the Firm Course Menace hint and year-three bonuses" };
    c = low(others, 4);
    if (c && L[sk] + L[others[0]] + L[others[1]] < 12) return { color: c, why: "toward 12 levels in all: the goddess skill hint becomes level 3" };
    if (L[sk] < 5) return { color: sk, why: "your skill goddess to 5: both versions of her skill" };
    c = low(COLORS, 5);
    return c ? { color: c, why: "the lowest goddess (all goals reached)" } : null;
  }

  // What a drop of n fragments of `color` does to the next Wisdom's color: +1 when it lands on a
  // deciding slot (1st or 5th) in the color you want, -1 when it lands there in another color,
  // 0 otherwise. → { score, slots: [index], note }.
  function steer(table, color, n, want) {
    const k = fits(table, n), slots = [];
    for (let i = 0; i < k; i++) slots.push(table.length + i);
    const deciding = slots.filter((i) => i === 0 || i === 4);
    if (!want || !deciding.length) return { score: 0, slots, note: "" };
    const good = color === want;
    const where = deciding.map((i) => (i === 0 ? "1st" : "5th")).join(" and ");
    return { score: good ? deciding.length : -deciding.length, slots,
      note: good ? `${SHORT[color]} lands on the ${where} slot: it sets your next Wisdom to ${SHORT[want]}, the goddess you need next`
        : `${SHORT[color]} lands on the ${where} slot: your next Wisdom leans ${SHORT[color]}, not the ${SHORT[want]} you need next` };
  }

  // Reminders for the turn: year-end races and the goddess event.
  function warnings(levels, turn, skill) {
    const L = Object.assign({ red: 0, blue: 0, yellow: 0 }, levels || {}), out = [];
    Object.entries(YEAR_END).forEach(([t, need]) => {
      t = +t;
      if (turn > t || turn < t - 6) return;
      const short = COLORS.filter((c) => L[c] < need);
      out.push(short.length
        ? `Year-end race after turn ${t}: ${short.map((c) => SHORT[c]).join(", ")} ${short.length === 1 ? "is" : "are"} below level ${need}, so no bonus from ${short.length === 1 ? "her" : "them"} (${COLORS.filter((c) => L[c] >= need).map((c) => SHORT[c]).join(", ") || "none"} pay${COLORS.filter((c) => L[c] >= need).length === 1 ? "s" : ""}).`
        : `Year-end race after turn ${t}: every goddess is at level ${need}+, so all three bonuses pay.`);
    });
    if (turn >= SKILL_TURN - 12 && turn <= SKILL_TURN) {
      const sk = COLORS.includes(skill) ? skill : "red", total = L.red + L.blue + L.yellow;
      out.push(`Goddess skill event (turn ${SKILL_TURN}): ${SHORT[sk]} is level ${L[sk]}${L[sk] >= 5 ? ", both skill versions" : L[sk] >= 4 ? ", her rare skill" : ", below 4: only her normal skill"}; ${total} levels in all${total >= 12 ? " (12+: a level 3 hint)" : ""}; ${COLORS.every((c) => L[c] >= 3) ? "all three at 3+ (Firm Course Menace hint)" : "not all three at 3 yet (Firm Course Menace)"}.`);
    }
    return out;
  }

  const api = { COLORS, NAME, SHORT, SLOTS, YEAR_END, SKILL_TURN, of, fits, add, wisdomColor, nextColor, steer, warnings };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaGrandMasters = api;
})(typeof window !== "undefined" ? window : globalThis);
