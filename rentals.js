// Rental parents pasted as text from uma.moe's parent search: each block is a friend's uma with
// her two parents and the sparks of all three. Read into family members (family.js) for the
// Parent 2 slot and her parents.
//
// A block (one line each, as copied from the page): the trainer's name, her friend ID
// ("549 802 936 559"), buttons, then "78 / Affinity", "8 / G1 Wins", "20 / White Skills",
// "19,635 / Score", the rental and her two parents (each name with a number), a support card,
// "Per Inh." and "★ Stars", then every spark as stars / ★ / name / chance, with "(2★)" when the
// rental herself has it. Blue, pink and green come first, then "Scenario whites",
// "Normal whites" and "Race whites". The stars are the family's total: uma.moe doesn't say which
// of her parents has the rest, so it's split between them (3★ at most each, the first parent
// first). The green spark names tell each one's version. G1 wins come from the rental's own race
// sparks only (her parents' aren't known), so shared wins can be undercounted.
(function (root) {
  "use strict";
  const STATS = { speed: 0, stamina: 1, power: 2, guts: 3, wit: 4 };
  const PINKS = { turf: 0, dirt: 1, sprint: 2, mile: 3, medium: 4, long: 5, "front runner": 6, "pace chaser": 7, "late surger": 8, "end closer": 9 };
  const SECTIONS = { "scenario whites": "scenario", "normal whites": "white", "race whites": "race" };
  // A G1 race spark's race id → the G1's name as the affinity code has it.
  const G1 = {
    1001: "February Stakes", 1002: "Takamatsunomiya Kinen", 1003: "Osaka Hai", 1004: "Oka Sho", 1005: "Satsuki Sho", 1006: "Tenno Sho (Spring)",
    1007: "NHK Mile Cup", 1008: "Victoria Mile", 1009: "Japanese Oaks", 1010: "Tokyo Yushun (Japanese Derby)", 1011: "Yasuda Kinen",
    1012: "Takarazuka Kinen", 1013: "Sprinters Stakes", 1014: "Shuka Sho", 1015: "Kikuka Sho", 1016: "Tenno Sho (Autumn)",
    1017: "Queen Elizabeth II Cup", 1018: "Mile Championship", 1019: "Japan Cup", 1020: "Champions Cup", 1021: "Hanshin Juvenile Fillies",
    1022: "Asahi Hai Futurity Stakes", 1023: "Arima Kinen", 1024: "Hopeful Stakes", 1101: "Teio Sho", 1102: "Japan Dirt Derby",
    1103: "JBC Ladies’ Classic", 1104: "JBC Sprint", 1105: "JBC Classic", 1106: "Tokyo Daishoten", 1107: "Kawasaki Kinen",
    1108: "Zen-Nippon Junior Yushun", 1109: "Kashiwa Kinen", 1110: "M.C. Nambu Hai",
  };
  const key = (s) => String(s).normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  const FRIEND = /^\d{3} \d{3} \d{3} \d{3}$/;
  const num = (s) => (/^[\d,]+$/.test(s || "") ? +s.replace(/,/g, "") : null);

  // o: { names: data/spark-names.js, whiteOf: (family) → base white id or null (veterans.js),
  //      trainees: [{ id, cid, n }] }
  function create(o) {
    const N = o.names, byName = new Map();
    // Names match with spacing and punctuation ignored ("Matikane Fukukitaru", "T.M. Opera O").
    const squash = (n) => key(n).replace(/[^a-z0-9]/g, "");
    o.trainees.forEach((t) => { if (!byName.has(squash(t.n))) byName.set(squash(t.n), t.cid); });
    const firstVersion = new Map();
    o.trainees.slice().sort((a, b) => a.id - b.id).forEach((t) => { if (!firstVersion.has(t.cid)) firstVersion.set(t.cid, t.id); });

    // Every spark line after "★ Stars": { section, name, total, own }.
    function sparks(lines, i) {
      const out = [];
      let section = "head";
      while (i < lines.length) {
        const l = lines[i];
        if (SECTIONS[key(l)]) { section = SECTIONS[key(l)]; i++; continue; }
        if (/^\d+$/.test(l) && lines[i + 1] === "★" && lines[i + 2] != null) {
          const s = { section, name: lines[i + 2], total: +l, own: 0 };
          i += 3;
          if (/^[\d.]+\s*(x|%)$/.test(lines[i] || "")) i++;
          const m = /^\((\d)\s*★\)$/.exec(lines[i] || "");
          if (m) { s.own = +m[1]; i++; }
          out.push(s);
        } else i++;
      }
      return out;
    }

    function block(lines, trainer, friend) {
      const at = (word) => lines.findIndex((l) => key(l) === word);
      const before = (word) => { const i = at(word); return i > 0 ? num(lines[i - 1]) : null; };
      const s = at("score"), star = at("★ stars");
      if (s < 0 || star < 0) return null;
      const who = [lines[s + 1], lines[s + 3], lines[s + 5]].map((n) => byName.get(squash(n || "")) || null);
      const r = { trainer, friend, affinity: before("affinity"), g1Wins: before("g1 wins"), score: before("score"), names: [lines[s + 1], lines[s + 3], lines[s + 5]], unknown: [], unscored: [] };
      if (!who[0]) { r.unknown.push(lines[s + 1]); return r; }
      const fam = who.map((cid) => (cid ? { cid, tid: firstVersion.get(cid) || null, white: [], blue: [0, 0], pink: [0, 0], green: 0, wins: [] } : null));
      const [p, g1, g2] = fam, gps = [g1, g2].filter(Boolean);
      // The stars beyond the rental's own go to her parents, 3★ at most each.
      const rest = (n) => (n > 3 ? [3, n - 3] : n > 0 ? [n] : []);
      let turn = 0;
      sparks(lines, star + 1).forEach((x) => {
        const k = key(x.name), more = rest(Math.min(6, x.total - x.own));
        if (x.section === "head" && STATS[k] != null) {
          if (x.own) p.blue = [STATS[k], x.own];
          more.forEach((n) => { const g = gps.find((m) => !m.blue[1]); if (g) g.blue = [STATS[k], n]; });
        } else if (x.section === "head" && PINKS[k] != null) {
          if (x.own) p.pink = [PINKS[k], x.own];
          more.forEach((n) => { const g = gps.find((m) => !m.pink[1]); if (g) g.pink = [PINKS[k], n]; });
        } else if (x.section === "head") {
          const cards = N.green[k];
          if (!cards) { r.unknown.push(x.name); return; }
          // Her unique tells whose it is and which version she is.
          const m = fam.find((u) => u && cards.some((c) => Math.floor(c / 100) === u.cid));
          if (!m) { r.unscored.push(x.name); return; }
          m.tid = cards.find((c) => Math.floor(c / 100) === m.cid);
          m.green = Math.min(3, m === p ? x.own || x.total : x.total);
        } else if (x.section === "white") {
          const fid = N.white[k];
          if (!fid) { r.unknown.push(x.name); return; }
          const id = o.whiteOf(fid);
          if (!id) { r.unscored.push(x.name); return; }
          if (x.own) p.white.push([id, x.own]);
          more.forEach((n) => { const g = gps[turn++ % gps.length]; if (g) g.white.push([id, n]); });
        } else if (x.section === "race") {
          const race = N.race[k];
          if (race == null) { r.unknown.push(x.name); return; }
          if (x.own && G1[race] && p.wins.indexOf(G1[race]) === -1) p.wins.push(G1[race]);
        }
      });
      r.parent = p; r.parents = [g1, g2];
      return r;
    }

    // The pasted text → { list, skipped }: one rental per friend ID, in the order pasted;
    // skipped: [{ trainer, why }] for cards it couldn't read.
    function parse(text) {
      const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const starts = [];
      lines.forEach((l, i) => { if (FRIEND.test(l) && i > 0) starts.push(i); });
      const list = [];
      const skipped = [];
      starts.forEach((i, n) => {
        const end = n + 1 < starts.length ? starts[n + 1] - 1 : lines.length;
        const r = block(lines.slice(i + 1, end), lines[i - 1], lines[i].replace(/ /g, ""));
        if (r && r.parent) list.push(r);
        else skipped.push({ trainer: lines[i - 1], why: r ? `character not recognised: ${r.unknown[0]}` : "the card was cut off (no Score or ★ Stars lines)" });
      });
      if (!list.length) throw new Error(starts.length ? `couldn't read ${skipped.map((x) => `${x.trainer} (${x.why})`).join(", ")}.` : "no uma.moe parents found: copy whole cards, from the trainer's name to the race sparks.");
      return { list, skipped };
    }

    return { parse };
  }

  const api = { create, G1 };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaRentals = api;
})(typeof window !== "undefined" ? window : globalThis);
