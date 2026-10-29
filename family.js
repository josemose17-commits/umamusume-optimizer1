// The ace's family, from the top down: what to look for in her parents and grandparents (which
// characters, white, blue, pink and green sparks), and a score for a family you've entered.
//
// Inheritance (uma.guide's parenting guide, community research): during the ace's run each
// parent and grandparent rolls each of her sparks at both inspiration events, at its base chance
// × (1 + that uma's own affinity / 100), capped at 100%. Base chances by stars (1★/2★/3★):
// white skill 3/6/9%, green (inherited unique) 5/10/15%, pink 2/3/5%, blue 70/80/90%.
// A white skill spark gives a hint (+1 to +5 levels, no known odds by star) for its base white
// skill. Blue sparks also add stats at the start: +5/+12/+21 per spark by stars (GameTora).
// Logic only; family-planner.js renders it.
(function (root) {
  "use strict";
  const WHITE = [0.03, 0.06, 0.09], GREEN = [0.05, 0.1, 0.15], PINK = [0.02, 0.03, 0.05], BLUE = [0.7, 0.8, 0.9];
  const START_BLUE = [5, 12, 21];
  const STATS = ["speed", "stamina", "power", "guts", "wit"];
  const STAT_LABELS = ["Speed", "Stamina", "Power", "Guts", "Wit"];
  const APT_LABELS = ["Turf", "Dirt", "Sprint", "Mile", "Medium", "Long", "Front", "Pace", "Late", "End"];
  const DIST_INDEX = { Sprint: 2, Mile: 3, Medium: 4, Long: 5 };
  const STYLE_INDEX = { Nige: 6, Senkou: 7, Sasi: 8, Oikomi: 9 };
  const GOOD = { S: 1, A: 1 };
  const SLOTS = ["p1", "p2", "g11", "g12", "g21", "g22"];
  const PARENT_OF = { g11: "p1", g12: "p1", g21: "p2", g22: "p2" };
  // In length units: 1 L counts like 60 stat points (as in the deck optimizer), and an
  // aptitude raised to A on the race like 1 L (a rough stand-in: no measured value).
  const STAT_PER_L = 60, APT_L = 1;

  // The chance a spark fires at least once in the run's two inspiration events.
  const twice = (base, stars, affinity) => {
    const p = Math.min(1, (base[Math.max(1, Math.min(3, stars)) - 1] || 0) * (1 + Math.max(0, affinity || 0) / 100));
    return 1 - (1 - p) * (1 - p);
  };

  function create(o) {
    const A = o.A, meta = o.skills; // meta: data/skill-purchases.js skills
    // A skill family (◎/○/gold share one): its white sparks all give the base white's hint.
    const family = (id) => (meta[id] ? meta[id][0] : null);
    function baseWhite(id) {
      let x = String(id), seen = 0;
      while (meta[x] && meta[x][2] && seen++ < 5) x = String(meta[x][2]);
      return meta[x] && meta[x][3] === 1 ? x : String(id);
    }

    // Relevant families for the ace's race: { family: { L, why, ids } } from parent-relevance's
    // targets (L and the rule that let each in).
    function families(rel) {
      const out = {};
      Object.keys((rel && rel.targets) || {}).forEach((id) => {
        const f = family(id);
        if (!f) return;
        const x = out[f] || (out[f] = { L: 0, why: rel.why[id], ids: [] });
        x.ids.push(id);
        if (rel.targets[id] > x.L) { x.L = rel.targets[id]; x.why = rel.why[id]; }
      });
      return out;
    }

    // What to look for. ace: { cid, apt }, race: { preset, style }, rel: the ace's relevant
    // skills, raceL: { skill id: L } (inherited uniques included), offers: { id: chance the ace's
    // deck offers it } or null, innate: her own innate/awakening skill ids, build: engine build,
    // chars: character ids to pick from, uniques: [{ id (inherited), L, owners }], fam: entered.
    function lookFor(x) {
      const fams = families(x.rel);
      const innate = new Set((x.innate || []).map(String));
      const famOffer = (f) => Math.max(0, ...fams[f].ids.map((id) => (x.offers && x.offers[id]) || 0));
      const white = Object.keys(fams).map((f) => {
        const F = fams[f], id = baseWhite(F.ids[0]), deck = x.offers ? famOffer(f) : null, own = F.ids.some((i) => innate.has(i));
        // A spark matters most for skills her deck rarely offers and she can't buy on her own.
        return { id, family: f, L: F.L, why: F.why, deck, own, priority: F.L * (1 - (deck || 0)) * (own ? 0.5 : 1) };
      }).sort((a, b) => b.priority - a.priority || b.L - a.L);
      const w = (x.build && x.build.w) || {};
      const blue = STATS.map((s, i) => ({ i, label: STAT_LABELS[i], w: w[s] || 0 })).sort((a, b) => b.w - a.w).slice(0, 2);
      const apt = (x.ace && x.ace.apt) || null, c = x.race.preset.course;
      const needs = [c.surface === "Dirt" ? 1 : 0, DIST_INDEX[c.dist], STYLE_INDEX[x.race.style]].filter((i) => i != null);
      const pink = apt ? needs.filter((i) => !GOOD[apt[i]]).map((i) => ({ i, label: APT_LABELS[i], grade: apt[i] })) : [];
      const green = (x.uniques || []).filter((u) => u.L > 0.1).sort((a, b) => b.L - a.L);
      const ace = x.ace && x.ace.cid;
      const pool = (x.chars || []).filter((cid) => +cid !== +ace);
      // Parent pairs: the ace with each parent, plus the pair together (grandparents and G1 wins
      // come on top).
      const pairs = [];
      if (ace) {
        const withAce = new Map(pool.map((cid) => [cid, A.together(ace, cid)]));
        pool.forEach((a, i) => pool.slice(i + 1).forEach((b) => pairs.push({ p1: a, p2: b, pts: withAce.get(a) + withAce.get(b) + A.together(a, b) })));
        pairs.sort((a, b) => b.pts - a.pts);
      }
      // Grandparents for each parent: what each adds with the ace and that parent.
      const grand = {};
      ["p1", "p2"].forEach((k) => {
        const p = x.fam && x.fam[k] && x.fam[k].cid;
        if (!ace || !p) return;
        grand[k] = (x.chars || []).filter((cid) => +cid !== +p).map((cid) => ({ cid, pts: A.together(ace, p, cid) })).sort((a, b) => b.pts - a.pts);
      });
      return { white, blue, pink, green, pairs: pairs.slice(0, 8), grand };
    }

    // A family's score for the ace's run. fam: { p1, p2, g11, g12, g21, g22 }, each
    // { cid, unique (inherited id), white: [[skill id, stars]], blue: [stat, stars],
    // pink: [aptitude index, stars], green: stars, wins: [G1 names] }.
    function score(fam, x) {
      const fams = families(x.rel), raceL = x.raceL || {};
      const L = { trainee: x.ace && x.ace.cid };
      SLOTS.forEach((k) => { L[k] = fam[k] && fam[k].cid; });
      const wins = {};
      SLOTS.forEach((k) => { if (fam[k]) wins[k] = fam[k].wins || []; });
      const total = A.total(L, wins), own = A.individual(L, wins);
      const want = lookFor(Object.assign({}, x, { chars: [], fam: {} }));
      const keyStats = new Set(want.blue.map((b) => b.i)), needs = new Set(want.pink.map((p) => p.i));
      const out = { total: total.total, symbol: total.symbol, own, white: [], green: [], hints: 0, whiteL: 0, greenL: 0, start: [0, 0, 0, 0, 0], keyStart: 0, pinkMiss: {}, problems: problems(fam, x) };
      SLOTS.forEach((k) => {
        const m = fam[k];
        if (!m || !m.cid) return;
        const aff = own[k] || 0;
        (m.white || []).forEach(([id, stars]) => {
          const f = fams[family(id)];
          if (!f) return;
          const p = twice(WHITE, stars, aff);
          out.white.push({ slot: k, id: String(id), stars, p, L: f.L });
          out.hints += p; out.whiteL += p * f.L;
        });
        if (m.green && m.unique) {
          const p = twice(GREEN, m.green, aff), gl = raceL[m.unique] || 0;
          out.green.push({ slot: k, id: String(m.unique), stars: m.green, p, L: gl });
          out.greenL += p * gl;
        }
        if (m.blue && m.blue[1]) {
          out.start[m.blue[0]] += START_BLUE[m.blue[1] - 1];
          if (keyStats.has(m.blue[0])) out.keyStart += START_BLUE[m.blue[1] - 1];
        }
        if (m.pink && m.pink[1] && needs.has(m.pink[0])) {
          out.pinkMiss[m.pink[0]] = (out.pinkMiss[m.pink[0]] == null ? 1 : out.pinkMiss[m.pink[0]]) * (1 - twice(PINK, m.pink[1], aff));
        }
      });
      out.pink = [...needs].map((i) => ({ i, label: APT_LABELS[i], p: out.pinkMiss[i] == null ? 0 : 1 - out.pinkMiss[i] }));
      out.value = out.whiteL + out.greenL + out.keyStart / STAT_PER_L + out.pink.reduce((n, p) => n + p.p * APT_L, 0);
      return out;
    }

    // Families the game doesn't allow (GameTora's checks).
    function problems(fam, x) {
      const out = [], same = (a, b) => a && b && +a === +b, c = (k) => fam[k] && fam[k].cid, ace = x.ace && x.ace.cid;
      if (same(ace, c("p1")) || same(ace, c("p2"))) out.push("The ace can't be the same character as a parent.");
      if (same(c("p1"), c("p2"))) out.push("The two parents can't be the same character.");
      Object.keys(PARENT_OF).forEach((g) => { if (same(c(g), c(PARENT_OF[g]))) out.push("A parent can't be her own grandparent."); });
      if (same(c("g11"), c("g12")) || same(c("g21"), c("g22"))) out.push("A parent's two parents can't be the same character.");
      return [...new Set(out)];
    }

    return { lookFor, score, families, baseWhite, problems };
  }

  const api = { create, twice, WHITE, GREEN, PINK, BLUE, START_BLUE, SLOTS, PARENT_OF, APT_LABELS, STAT_LABELS, STAT_PER_L };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaFamily = api;
})(typeof window !== "undefined" ? window : globalThis);
