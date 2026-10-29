// Your veterans, from an umaextractor JSON export: each one as a family member (family.js) with
// her own sparks and G1 wins, plus her two parents (who become the ace's grandparents when she's
// a parent). Pasting a new export replaces the list.
//
// Spark (factor) ids, checked against GameTora's factor table: the factor's id × 100 + stars.
//   1–5: blue (Speed, Stamina, Power, Guts, Wit), e.g. 103 = Speed 3★
//   11, 12 / 21–24 / 31–34: pink (Turf, Dirt / Front, Pace, Late, End / Sprint, Mile, Medium, Long)
//   10001+: G1 race sparks (the race's id + 9000), 20001+: white skill sparks (the skill's
//   family, e.g. 2004902 = Nimble Navigator 2★), 30001+: scenario sparks, and 6-digit card ids:
//   green (her inherited unique), e.g. 10170102 = card 101701's unique 2★.
// G1 wins come as saddle ids. The map below was worked out from veterans' own race results
// (each saddle against the G1s its holders won, GameTora's race programs); 29 and 30 always came
// together, so their order is a guess (it doesn't change affinity), and titles are left out.
(function (root) {
  "use strict";
  const SADDLE = {
    10: "Arima Kinen", 11: "Japan Cup", 12: "Tokyo Yushun (Japanese Derby)", 13: "Tenno Sho (Spring)", 14: "Takarazuka Kinen",
    15: "Tenno Sho (Autumn)", 16: "Kikuka Sho", 17: "Osaka Hai", 18: "Satsuki Sho", 19: "Japanese Oaks", 20: "Takamatsunomiya Kinen",
    21: "Yasuda Kinen", 22: "Sprinters Stakes", 23: "Mile Championship", 24: "Oka Sho", 25: "Victoria Mile", 26: "Queen Elizabeth II Cup",
    27: "NHK Mile Cup", 28: "Shuka Sho", 29: "February Stakes", 30: "Champions Cup", 32: "Tokyo Daishoten", 33: "Asahi Hai Futurity Stakes",
    34: "Hopeful Stakes", 35: "Hanshin Juvenile Fillies", 36: "M.C. Nambu Hai", 38: "Japan Dirt Derby",
  };
  // Pink factor → family.js aptitude index (Turf, Dirt, Sprint, Mile, Medium, Long, Front, Pace, Late, End).
  const PINK = { 11: 0, 12: 1, 21: 6, 22: 7, 23: 8, 24: 9, 31: 2, 32: 3, 33: 4, 34: 5 };
  const GRADE = [null, "G", "F", "E", "D", "C", "B", "A", "S"];
  const APT_KEYS = ["proper_ground_turf", "proper_ground_dirt", "proper_distance_short", "proper_distance_mile", "proper_distance_middle", "proper_distance_long",
    "proper_running_style_nige", "proper_running_style_senko", "proper_running_style_sashi", "proper_running_style_oikomi"];
  const POS = { 10: 0, 20: 1 }; // succession_chara_array: 10 and 20 are her parents (11, 12, 21, 22 theirs)

  // meta: data/skill-purchases.js skills ({ id: [family, cost, prerequisite, …] }).
  function create(meta) {
    // A white spark's family → the skill whose hint it gives (the family's ○, no prerequisite).
    const base = {};
    Object.keys(meta).forEach((id) => {
      const f = meta[id][0];
      if (!base[f] || (meta[base[f]][2] && !meta[id][2])) base[f] = id;
    });

    // One uma: { card_id, factor_info_array, win_saddle_id_array } → a family member.
    function member(e) {
      const m = { cid: Math.floor(e.card_id / 100), tid: e.card_id, white: [], blue: [0, 0], pink: [0, 0], green: 0, wins: [], races: [], other: 0 };
      (e.factor_info_array || []).forEach((x) => {
        const id = Math.floor(x.factor_id / 100), stars = x.factor_id % 100;
        if (stars < 1 || stars > 3) { m.other++; return; }
        if (id >= 1 && id <= 5) m.blue = [id - 1, stars];
        else if (PINK[id] != null) m.pink = [PINK[id], stars];
        else if (id >= 10000 && id < 20000) m.races.push([id - 9000, stars]);
        else if (id >= 20000 && id < 30000 && base[String(id)]) m.white.push([base[String(id)], stars]);
        else if (id === e.card_id) m.green = stars;
        else m.other++;
      });
      m.wins = [...new Set((e.win_saddle_id_array || []).map((s) => SADDLE[s]).filter(Boolean))];
      return m;
    }

    // The export (text or parsed) → { list, skipped }. Each veteran: { id, cid, tid, score,
    // stats, apt, at, self: member, parents: [member|null, member|null] }.
    function parse(input) {
      const data = typeof input === "string" ? JSON.parse(input) : input;
      const arr = Array.isArray(data) ? data : data && Array.isArray(data.trained_chara_array) ? data.trained_chara_array : null;
      if (!arr) throw new Error("Expected the umaextractor veterans list (a JSON array).");
      let skipped = 0;
      const list = [];
      arr.forEach((v) => {
        if (!v || !v.card_id || !Array.isArray(v.factor_info_array)) { skipped++; return; }
        const parents = [null, null];
        (v.succession_chara_array || []).forEach((p) => { if (POS[p.position_id] != null && p.card_id) parents[POS[p.position_id]] = member(p); });
        list.push({
          id: v.trained_chara_id, cid: Math.floor(v.card_id / 100), tid: v.card_id, score: v.rank_score || 0,
          stats: [v.speed, v.stamina, v.power, v.guts, v.wiz], apt: APT_KEYS.map((k) => GRADE[v[k]] || null),
          at: v.create_time || "", self: member(v), parents,
        });
      });
      if (!list.length) throw new Error("No veterans found in that JSON.");
      return { list, skipped };
    }

    return { parse, member, whiteOf: (f) => base[String(f)] || null };
  }

  const api = { create, SADDLE, PINK };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaVeterans = api;
})(typeof window !== "undefined" ? window : globalThis);
