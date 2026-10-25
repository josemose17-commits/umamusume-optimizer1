// A career's final rating (the rank letter on the result screen): each stat's score, plus each
// learned skill's rating value, plus the unique skill's level bonus. The sum sets the rank
// (SS from 17,500); an SS parent doubles her white sparks' 3★ chance.
//
// Stat scores: UmaTools' rating guide (daftuyda.moe/guides/rating-system), which publishes the
// score at every 50 points; points between them are interpolated (the curve is smooth, so this
// is within a point or two). Skill values and rank thresholds: data/parent-data.js.
(function (root) {
  "use strict";
  const STAT_AT_50 = [0, 25, 66, 116, 181, 261, 352, 457, 577, 707, 847, 993, 1143, 1298, 1463, 1633, 1808, 2004, 2209, 2419, 2635, 2895, 3171, 3501, 3841, 4249, 4688, 5160, 5665, 6203, 6773, 7377, 8013, 8681, 9383, 10117, 10884, 11684, 12516, 13382, 14280, 15197, 16125, 17062, 18010, 18967, 19935, 20912, 21900, 22897, 23905];
  const RANK_LABELS = ["G", "G+", "F", "F+", "E", "E+", "D", "D+", "C", "C+", "B", "B+", "A", "A+", "S", "S+", "SS", "SS+", "UG"];
  const SS = 17500;
  // Aptitude multiplier on a skill's rating when its role (distance, style or surface) is S/A,
  // B/C, D/E/F or G for this uma.
  const MULT = { good: 1.1, average: 0.9, bad: 0.8, terrible: 0.7 };
  const ROLE_INDEX = { turf: 0, dirt: 1, sprint: 2, mile: 3, medium: 4, long: 5, front: 6, pace: 7, late: 8, end: 9 };
  const ROLE_GROUP = { turf: "surface", dirt: "surface", sprint: "distance", mile: "distance", medium: "distance", long: "distance", front: "style", pace: "style", late: "style", end: "style" };

  function data() {
    return root.UmaParentData || (typeof require === "function" ? require("./data/parent-data.js") : null);
  }

  function statScore(x) {
    const v = Math.max(0, Math.min(2500, Math.floor(+x || 0)));
    const i = Math.floor(v / 50);
    if (i >= STAT_AT_50.length - 1) return STAT_AT_50[STAT_AT_50.length - 1];
    return Math.round(STAT_AT_50[i] + (STAT_AT_50[i + 1] - STAT_AT_50[i]) * (v - i * 50) / 50);
  }

  const statsScore = (stats) => stats.reduce((a, x) => a + statScore(x), 0);

  // Stars 1-2: 120 per unique level, 3+: 170.
  const uniqueBonus = (level, stars) => (level > 0 ? level * (stars >= 3 ? 170 : 120) : 0);

  function bucket(grade) {
    const g = String(grade || "").toUpperCase();
    if (g === "S" || g === "A") return "good";
    if (g === "B" || g === "C") return "average";
    if (g === "D" || g === "E" || g === "F") return "bad";
    return "terrible";
  }

  // A skill's rating value for an uma with these aptitudes (GameTora order: turf, dirt, sprint,
  // mile, medium, long, front, pace, late, end). Unknown skills count 0.
  function skillScore(id, apt) {
    const P = data();
    const e = P && P.skillRating[String(id)];
    if (!e) return 0;
    const base = e[0] || 0;
    const role = String(e[5] || "").toLowerCase();
    if (!role || !apt) return base;
    const roles = role.split("/").filter((r) => ROLE_INDEX[r] != null);
    if (roles.length === 1) {
      const col = { good: 1, average: 2, bad: 3, terrible: 4 }[bucket(apt[ROLE_INDEX[roles[0]]])];
      return e[col] != null ? e[col] : Math.round(base * MULT[bucket(apt[ROLE_INDEX[roles[0]]])]);
    }
    // Several roles: the best multiplier in each group, multiplied across groups.
    const best = {};
    roles.forEach((r) => {
      const m = MULT[bucket(apt[ROLE_INDEX[r]])];
      const g = ROLE_GROUP[r];
      if (best[g] == null || m > best[g]) best[g] = m;
    });
    return Math.round(Object.values(best).reduce((v, m) => v * m, base));
  }

  function rankOf(total) {
    const P = data();
    const ranks = (P && P.ranks) || [];
    let i = 0;
    while (i + 1 < ranks.length && total >= ranks[i + 1]) i++;
    const label = i < RANK_LABELS.length ? RANK_LABELS[i] : "UG+";
    return { index: i, label, next: ranks[i + 1] != null ? ranks[i + 1] : null, nextLabel: i + 1 < RANK_LABELS.length ? RANK_LABELS[i + 1] : "UG+" };
  }

  // The whole rating: { stats, skills, unique, total, rank }.
  function rating(o) {
    const stats = statsScore(o.stats || []);
    const skills = (o.skills || []).reduce((a, id) => a + skillScore(id, o.apt), 0);
    const unique = uniqueBonus(o.uniqueLevel || 0, o.stars || 3);
    const total = stats + skills + unique;
    return { stats, skills, unique, total, rank: rankOf(total), toSS: Math.max(0, SS - total) };
  }

  // Stat points still needed to reach a rating gap, spent where they score most (the curve
  // rises, so the highest stats under their caps go first). Returns the per-stat additions.
  function statsFor(stats, gap, caps) {
    const x = stats.slice();
    const add = [0, 0, 0, 0, 0];
    let left = gap;
    let guard = 0;
    while (left > 0 && guard++ < 2000) {
      let best = -1, bestGain = 0;
      for (let i = 0; i < 5; i++) {
        if (caps && x[i] + 10 > caps[i]) continue;
        const g = statScore(x[i] + 10) - statScore(x[i]);
        if (g > bestGain) { bestGain = g; best = i; }
      }
      if (best < 0) return null;
      x[best] += 10; add[best] += 10; left -= bestGain;
    }
    return add;
  }

  const api = { STAT_AT_50, RANK_LABELS, SS, statScore, statsScore, uniqueBonus, skillScore, rankOf, rating, statsFor, bucket };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaRating = api;
})(typeof window !== "undefined" ? window : globalThis);
