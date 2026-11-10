// The ace's family, from the top down: what to look for in her parents and grandparents (which
// characters, white, blue, pink and green sparks), and a score for a family you've entered.
//
// Inheritance (uma.guide's sparks and parenting guides, umareference, umamusu.wiki): during the
// ace's run each parent and grandparent rolls each of her sparks at both inspiration events
// (early April, Classic and Senior), at its base chance × (1 + that uma's own affinity / 100),
// capped at 100%. Base chances by stars (1★/2★/3★): white skill 3/6/9%, green (inherited
// unique) 5/10/15%, pink 1/3/5% (uma.guide and umareference; the parenting guide says 2% for
// 1★), blue 70/80/90%. Grandparents fire less often than parents; no page gives the factor and
// umareference guesses half, so GRAND = 0.5.
// Blue: every member's blue adds +5/+12/+21 at the start, and each time it fires at an
// inspiration a random +1–10 / 1–16 / 1–28 (taken as even odds: 5.5 / 8.5 / 14.5 on average).
// Pink: at the start the family's pink stars per aptitude raise it 1 grade for 1–3★, 2 for
// 4–6★, 3 for 7–9★, 4 for 10★+, but never past A; going on (A to S) takes a pink spark firing at
// an inspiration (one grade each).
// A white skill spark gives a hint (+1 to +5 levels, no known odds by star) for its base white
// skill. Logic only; family-planner.js renders it.
(function (root) {
  "use strict";
  const WHITE = [0.03, 0.06, 0.09], GREEN = [0.05, 0.1, 0.15], PINK = [0.01, 0.03, 0.05], BLUE = [0.7, 0.8, 0.9];
  const START_BLUE = [5, 12, 21], EVENT_BLUE = [5.5, 8.5, 14.5], GRAND = 0.5;
  const GRADES = ["G", "F", "E", "D", "C", "B", "A", "S"];
  const gi = (g) => GRADES.indexOf(g);
  const STATS = ["speed", "stamina", "power", "guts", "wit"];
  const STAT_LABELS = ["Speed", "Stamina", "Power", "Guts", "Wit"];
  const APT_LABELS = ["Turf", "Dirt", "Sprint", "Mile", "Medium", "Long", "Front", "Pace", "Late", "End"];
  const DIST_INDEX = { Sprint: 2, Mile: 3, Medium: 4, Long: 5 };
  const STYLE_INDEX = { Nige: 6, Senkou: 7, Sasi: 8, Oikomi: 9 };
  const SLOTS = ["p1", "p2", "g11", "g12", "g21", "g22"];
  const PARENT_OF = { g11: "p1", g12: "p1", g21: "p2", g22: "p2" };
  // In length units: 1 L counts like 60 stat points (as in the deck optimizer), and an
  // aptitude raised to A on the race like 1 L (a rough stand-in: no measured value).
  const STAT_PER_L = 60, APT_L = 1, HINT_L = 0.15;

  // The chance a spark fires at least once in the run's two inspiration events.
  // The chance it fires at one inspiration (scale: GRAND for a grandparent).
  const once = (base, stars, affinity, scale) => Math.min(1, (base[Math.max(1, Math.min(3, stars)) - 1] || 0) * (1 + Math.max(0, affinity || 0) / 100) * (scale == null ? 1 : scale));
  const twice = (base, stars, affinity, scale) => { const p = once(base, stars, affinity, scale); return 1 - (1 - p) * (1 - p); };
  const slotScale = (k) => (PARENT_OF[k] ? GRAND : 1);
  // A blue spark's stats over the run: the start bonus and both inspirations, on average.
  const blueStats = (stars, affinity, scale) => { const s = Math.max(1, Math.min(3, stars)); return START_BLUE[s - 1] + 2 * once(BLUE, s, affinity, scale) * EVENT_BLUE[s - 1]; };
  // Start grades from the family's pink stars in one aptitude (never past A there).
  const startSteps = (n) => (n <= 0 ? 0 : n <= 3 ? 1 : n <= 6 ? 2 : n <= 9 ? 3 : 4);
  // The chance at least k of these independent events happen.
  function atLeast(ps, k) {
    if (k <= 0) return 1;
    let d = [1];
    ps.forEach((p) => { const n = new Array(d.length + 1).fill(0); d.forEach((v, i) => { n[i] += v * (1 - p); n[i + 1] += v * p; }); d = n; });
    return d.slice(k).reduce((a, b) => a + b, 0);
  }
  // An aptitude's chance to reach its target grade: start steps from the family's pink stars (up
  // to A), then one grade per pink spark that fires at an inspiration. sparks: [{ stars, aff, scale }].
  function pinkReach(cur, target, sparks) {
    const c = gi(cur), t = gi(target);
    if (c < 0 || t < 0 || c >= t) return 1;
    const start = Math.min(gi("A"), c + startSteps(sparks.reduce((n, x) => n + x.stars, 0)));
    if (start >= t) return 1;
    const ps = [];
    sparks.forEach((x) => { const p = once(PINK, x.stars, x.aff, x.scale); ps.push(p, p); });
    return atLeast(ps, t - start);
  }

  // The aptitudes a race asks for and the grade to aim at: a sprint wants S on its surface, every
  // other race S on its distance; the other of the two A; the running style A (never S).
  function aptTargets(course, style) {
    const sprint = course.dist === "Sprint", surf = course.surface === "Dirt" ? 1 : 0, dist = DIST_INDEX[course.dist];
    return [{ i: surf, target: sprint ? "S" : "A" }, dist != null ? { i: dist, target: sprint ? "A" : "S" } : null, STYLE_INDEX[style] != null ? { i: STYLE_INDEX[style], target: "A" } : null].filter(Boolean);
  }

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
    // chars: character ids to pick from, mine: the ones you own (or none), uniques: [{ id (inherited), L, owners }], fam: entered.
    function lookFor(x) {
      const fams = families(x.rel);
      const innate = new Set((x.innate || []).map(String));
      const famOffer = (f) => Math.max(0, ...fams[f].ids.map((id) => (x.offers && x.offers[id]) || 0));
      const white = Object.keys(fams).map((f) => {
        const F = fams[f], id = baseWhite(F.ids[0]), deck = x.offers ? famOffer(f) : null, own = F.ids.some((i) => innate.has(i));
        // A spark matters most for skills her deck rarely offers and she can't buy on her own.
        return { id, family: f, L: F.L, why: F.why, deck, own, priority: x.skillPlan ? worth(F,x) : F.L * (1 - (deck || 0)) * (own ? 0.5 : 1) };
      }).sort((a, b) => b.priority - a.priority || b.L - a.L);
      const w = (x.build && x.build.w) || {};
      // Blue fills her gaps (x.gaps: how far her deck's predicted stats end short of her targets),
      // biggest first; with none known, the build's two top stats.
      const gaps = (x.gaps || []).map((g) => Math.max(0, +g || 0));
      const blue = gaps.some((g) => g > 0)
        ? STATS.map((s, i) => ({ i, label: STAT_LABELS[i], w: w[s] || 0, gap: gaps[i] || 0 })).filter((b) => b.gap > 0).sort((a, b) => b.gap - a.gap)
        : STATS.map((s, i) => ({ i, label: STAT_LABELS[i], w: w[s] || 0, gap: 0 })).sort((a, b) => b.w - a.w).slice(0, 2);
      const apt = (x.ace && x.ace.apt) || null, c = x.race.preset.course;
      const pink = apt ? aptTargets(c, x.race.style).filter((n) => gi(apt[n.i]) >= 0 && gi(apt[n.i]) < gi(n.target)).map((n) => Object.assign(n, { label: APT_LABELS[n.i], grade: apt[n.i] })) : [];
      const green = (x.uniques || []).filter((u) => u.L > 0.1).sort((a, b) => b.L - a.L);
      const ace = x.ace && x.ace.cid;
      const pool = (x.chars || []).filter((cid) => +cid !== +ace);
      // Parent pairs: the ace with each parent, plus the pair together (grandparents and G1 wins
      // come on top). With x.mine (characters you own), Parent 1 is one of them and Parent 2 any
      // character, as a friend's rental.
      const pairs = [];
      if (ace) {
        const withAce = new Map(pool.map((cid) => [cid, A.together(ace, cid)]));
        const pair = (a, b) => ({ p1: a, p2: b, pts: withAce.get(a) + withAce.get(b) + A.together(a, b) });
        const mine = x.mine && x.mine.length ? new Set(x.mine.map(Number)) : null;
        if (mine) pool.filter((a) => mine.has(+a)).forEach((a) => pool.forEach((b) => { if (+a !== +b) pairs.push(pair(a, b)); }));
        else pool.forEach((a, i) => pool.slice(i + 1).forEach((b) => pairs.push(pair(a, b))));
        pairs.sort((a, b) => b.pts - a.pts);
      }
      // Grandparents for each parent: what each adds with the ace and that parent.
      const grand = {};
      ["p1", "p2"].forEach((k) => {
        const p = x.fam && x.fam[k] && x.fam[k].cid;
        if (!ace || !p) return;
        grand[k] = (x.chars || []).filter((cid) => +cid !== +p).map((cid) => ({ cid, pts: A.together(ace, p, cid) })).sort((a, b) => b.pts - a.pts);
      });
      return { white, blue, pink, green, pairs: pairs.slice(0, 8), grand, gaps: gaps.some((g) => g > 0) ? gaps : null };
    }

    // A family's score for the ace's run. fam: { p1, p2, g11, g12, g21, g22 }, each
    // { cid, unique (inherited id), white: [[skill id, stars]], blue: [stat, stars],
    // pink: [aptitude index, stars], green: stars, wins: [G1 names] }.
    // The race's side of a score (relevant families, what to look for) depends only on x, so it's
    // kept per x: ranking many families against one ace stays fast.
    // A white spark's hint is worth its skill's L only when the ace couldn't get the skill
    // otherwise: for a skill her deck offers anyway (x.offers: chance by skill id) or one she has
    // (innate or awakening), the hint just makes it cheaper, worth about HINT_L (a +1..+5 hint
    // takes ~20% off a ~170 SP skill, at the optimizer's 0.35 points per SP and 60 per L).
    const worth = (F, x) => {
      const q = F.ids.some((id) => (x.innate || []).map(String).indexOf(id) !== -1) ? 1 : Math.max(0, ...F.ids.map((id) => (x.offers && x.offers[id]) || 0));
      return F.L * (1 - q) + Math.min(F.L, HINT_L) * q;
    };
    const cache = new WeakMap();
    function prep(x) {
      if (!cache.has(x)) {
        const fams = families(x.rel), eff = {};
        Object.keys(fams).forEach((f) => { eff[f] = worth(fams[f], x); });
        cache.set(x, { fams, eff, want: lookFor(Object.assign({}, x, { chars: [], fam: {} })) });
      }
      return cache.get(x);
    }
    function score(fam, x) {
      const { fams, eff, want } = prep(x), raceL = x.raceL || {};
      const L = { trainee: x.ace && x.ace.cid };
      SLOTS.forEach((k) => { L[k] = fam[k] && fam[k].cid; });
      const wins = {};
      SLOTS.forEach((k) => { if (fam[k]) wins[k] = fam[k].wins || []; });
      const total = A.total(L, wins), own = A.individual(L, wins);
      const keyStats = new Set(want.blue.map((b) => b.i));
      const out = { total: total.total, symbol: total.symbol, own, white: [], green: [], hints: 0, whiteL: 0, greenL: 0, start: [0, 0, 0, 0, 0], keyStart: 0, blueStats: [0, 0, 0, 0, 0], problems: problems(fam, x) };
      const pinkSparks = {};
      SLOTS.forEach((k) => {
        const m = fam[k];
        if (!m || !m.cid) return;
        const aff = own[k] || 0, scale = slotScale(k);
        (m.white || []).forEach(([id, stars]) => {
          const f = fams[family(id)];
          if (!f) return;
          const p = twice(WHITE, stars, aff, scale), worthL = eff[family(id)];
          out.white.push({ slot: k, id: String(id), stars, p, L: f.L, worth: worthL });
          out.hints += p; out.whiteL += p * worthL;
        });
        if (m.green && m.unique) {
          const p = x.skillPlan && !PARENT_OF[k] ? 1 : twice(GREEN, m.green, aff, scale), gl = raceL[m.unique] || 0;
          out.green.push({ slot: k, id: String(m.unique), stars: m.green, p, L: gl });
          out.greenL += p * gl;
        }
        if (m.blue && m.blue[1]) {
          out.start[m.blue[0]] += START_BLUE[m.blue[1] - 1];
          if (keyStats.has(m.blue[0])) out.keyStart += START_BLUE[m.blue[1] - 1];
          out.blueStats[m.blue[0]] += blueStats(m.blue[1], aff, scale);
        }
        if (m.pink && m.pink[1]) (pinkSparks[m.pink[0]] = pinkSparks[m.pink[0]] || []).push({ stars: m.pink[1], aff, scale });
      });
      // Blue: the stats it adds where she's short (her gaps), else on the build's key stats.
      out.blueFill = want.gaps ? out.blueStats.reduce((n, v, i) => n + Math.min(v, want.gaps[i] || 0), 0) : out.blueStats.reduce((n, v, i) => n + (keyStats.has(i) ? v : 0), 0);
      out.pink = want.pink.map((n) => ({ i: n.i, label: n.label, grade: n.grade, target: n.target, p: pinkReach(n.grade, n.target, pinkSparks[n.i] || []), stars: (pinkSparks[n.i] || []).reduce((a, b) => a + b.stars, 0) }));
      // Per skill, the chance at least one family member's spark for it fires (white and green):
      // what the ace can count on getting a hint for.
      const by = new Map();
      out.white.concat(out.green).forEach((w) => {
        const x = by.get(w.id) || { id: w.id, L: w.L, miss: 1, from: [] };
        x.miss *= 1 - w.p; x.from.push(w.slot); by.set(w.id, x);
      });
      out.skills = [...by.values()].map((x) => ({ id: x.id, L: x.L, p: 1 - x.miss, from: x.from })).sort((a, b) => b.p * b.L - a.p * a.L);
      if(x.skillPlan) {
        const union=(rows,key)=>{const map=new Map();rows.forEach(w=>{const k=key(w),r=map.get(k)||{miss:1,worth:w.worth==null?w.L:w.worth};r.miss*=1-w.p;map.set(k,r);});return [...map.values()].reduce((n,r)=>n+(1-r.miss)*r.worth,0);};
        out.whiteL=union(out.white,w=>family(w.id));out.greenL=union(out.green,w=>w.id);
      }
      out.value = out.whiteL + out.greenL + out.blueFill / STAT_PER_L + out.pink.reduce((n, p) => n + p.p * APT_L, 0);
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

    // What a white spark of each relevant family is worth to the ace ({ family: L }, her deck's
    // offers and her own skills counted).
    const worthOf = (x) => prep(x).eff;
    return { lookFor, score, families, baseWhite, problems, worthOf, family };
  }

  const api = { create, twice, once, blueStats, pinkReach, startSteps, aptTargets, slotScale, WHITE, GREEN, PINK, BLUE, START_BLUE, EVENT_BLUE, GRAND, SLOTS, PARENT_OF, APT_LABELS, STAT_LABELS, STAT_PER_L, HINT_L, APT_L };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaFamily = api;
})(typeof window !== "undefined" ? window : globalThis);
