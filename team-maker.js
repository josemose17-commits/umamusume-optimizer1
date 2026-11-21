// Team maker (CM & decks): from a pool of umas you list, each with the running styles she may
// run and an optional "fixed" pin, the best team for a cup. An uma's worth on a cup is what she
// brings herself (data/uma-values.js, as the Pull planner's teams use it): her own unique raced
// there in that style plus her surface, distance and style aptitudes against A, in lengths. Her
// deck, stats and bought skills aren't in it (they come from her deck later).
// The team: every fixed uma, then the open slots from the rest, the most lengths in all, no two
// in one running style unless nothing else fits (two in a style fight for one spot), and no
// character twice (two outfits of one uma can't race together).
(function (root) {
  "use strict";
  const STYLES = ["Nige", "Senkou", "Sasi", "Oikomi"];
  const STYLE_IX = { Nige: 6, Senkou: 7, Sasi: 8, Oikomi: 9 }, DIST_IX = { Sprint: 2, Mile: 3, Medium: 4, Long: 5 };
  const GRADES = "SABCDEFG";
  const SAME_STYLE = 100; // a repeated style loses to any team without one
  const NO_VALUE_STEP = 1; // a grade under A, for a cup with no measured values

  // Her styles at A or S (the default allowed styles in the pool).
  const goodStyles = (t) => STYLES.filter((st) => GRADES.indexOf(t.apt[STYLE_IX[st]]) <= 1);

  // Her worth on the cup in a style: { v, how } with how "measured" (her unique raced there in
  // that style), "estimated" (raced in her other styles only: their average unique, plus this
  // style's grade), "aptitude" (not raced on this cup: aptitudes only, unique counted 0) or
  // "grades" (no values for the cup: each grade under A in surface, distance or style −1, S +0.2).
  function worth(t, cup, st, UV) {
    const surf = cup.course.surface === "Dirt" ? 1 : 0, dist = DIST_IX[cup.course.dist];
    const grades = [t.apt[surf], t.apt[dist], t.apt[STYLE_IX[st]]];
    const c = UV && UV.cups && UV.cups[cup.id];
    if (!c || c.status !== "ok" || !c.apt[st]) {
      const v = grades.reduce((n, g) => { const k = GRADES.indexOf(g); return n + (k === 0 ? 0.2 : k <= 1 ? 0 : -(k - 1) * NO_VALUE_STEP); }, 0);
      return { v, how: "grades" };
    }
    const a = c.apt[st], aptL = (g, m) => { const k = GRADES.indexOf(g); return k === 0 ? m.AS : k <= 1 ? 0 : -(k - 1) * m.BA; };
    const apt = aptL(grades[0], a.surface) + aptL(grades[1], a.distance) + aptL(grades[2], a.style);
    const own = c.umas[t.id];
    if (own && own[st] != null) return { v: own[st] + apt, how: "measured" };
    const raced = own ? Object.values(own).filter((x) => x != null) : [];
    if (raced.length) return { v: raced.reduce((n, x) => n + x, 0) / raced.length + apt, how: "estimated" };
    return { v: apt, how: "aptitude" };
  }

  // pool: [{ tid, styles: [style] (empty: her A/S styles), fixed }]. o: { D, UV, k (3) }.
  // → { team: [{ tid, style, v, how, fixed }], total, repeats, teams (the best few), alts:
  // [{ out: tid, tid, style, v, loss }] (each pick's best stand-in), problems: [text] }.
  function best(cup, pool, o) {
    const k = o.k || 3, D = o.D, problems = [];
    const members = [];
    const seen = new Set();
    (pool || []).forEach((m) => {
      const t = D.trainee(m.tid);
      if (!t || seen.has(t.id)) return;
      seen.add(t.id);
      const styles = (m.styles && m.styles.length ? m.styles : goodStyles(t)).filter((st) => STYLES.includes(st));
      const ops = (styles.length ? styles : [STYLES.reduce((b, st) => (GRADES.indexOf(t.apt[STYLE_IX[st]]) < GRADES.indexOf(t.apt[STYLE_IX[b]]) ? st : b), "Senkou")])
        .map((st) => Object.assign({ style: st }, worth(t, cup, st, o.UV))).sort((a, b) => b.v - a.v);
      members.push({ t, fixed: !!m.fixed, ops });
    });
    const fixed = members.filter((m) => m.fixed), open = members.filter((m) => !m.fixed);
    if (fixed.length > k) problems.push(`${fixed.length} fixed umas, but a team has ${k}: the first ${k} are used.`);
    const fixedCids = new Set();
    fixed.slice(0, k).forEach((m) => { if (fixedCids.has(m.t.cid)) problems.push(`${m.t.n} is fixed twice (two outfits can't race together): one is used.`); fixedCids.add(m.t.cid); });
    const must = fixed.slice(0, k).filter((m, i, a) => a.findIndex((x) => x.t.cid === m.t.cid) === i);
    const teams = [];
    const keep = (picks) => {
      const total = picks.reduce((n, p) => n + p.v, 0), styles = picks.map((p) => p.style);
      const repeats = styles.length - new Set(styles).size;
      teams.push({ team: picks.map((p) => Object.assign({}, p)), total, repeats, score: total - repeats * SAME_STYLE });
    };
    // Every team: the fixed umas in each of their styles, then each choice of open umas and styles.
    const go = (list, i, picks, need) => {
      if (need === 0 || i === list.length) { if (need === 0) keep(picks); return; }
      go(list, i + 1, picks, need);
      const m = list[i];
      if (picks.some((p) => D.trainee(p.tid).cid === m.t.cid)) return;
      m.ops.forEach((op) => { picks.push({ tid: m.t.id, style: op.style, v: op.v, how: op.how, fixed: m.fixed }); go(list, i + 1, picks, need - 1); picks.pop(); });
    };
    // As many open slots as there are other characters to fill them (outfits of one count once).
    const fill = Math.min(k - must.length, new Set(open.filter((m) => !fixedCids.has(m.t.cid)).map((m) => m.t.cid)).size);
    let bases = [{ team: [] }];
    if (must.length) { go(must, 0, [], must.length); bases = teams.splice(0); }
    bases.forEach((b) => go(open, 0, b.team.slice(), fill));
    if (!teams.length && !must.length) return { team: [], total: 0, repeats: 0, teams: [], alts: [], problems: problems.concat(members.length ? [] : ["Add umas to the pool first."]) };
    teams.sort((a, b) => b.score - a.score || b.total - a.total);
    const top = teams[0];
    if (top.team.length < k) problems.push(`Only ${top.team.length} of ${k} slots can be filled: add more umas (different characters) to the pool.`);
    // Each pick's best stand-in: the best team without her, keeping the others.
    const alts = top.team.filter((p) => !p.fixed).map((p) => {
      const others = top.team.filter((x) => x !== p);
      const alt = teams.find((tm) => tm.team.length === top.team.length && !tm.team.some((x) => x.tid === p.tid) && others.every((o) => tm.team.some((x) => x.tid === o.tid && x.style === o.style)));
      if (!alt) return null;
      const sub = alt.team.find((x) => !others.some((o) => o.tid === x.tid));
      return { out: p.tid, tid: sub.tid, style: sub.style, v: sub.v, how: sub.how, loss: top.score - alt.score };
    }).filter(Boolean);
    return { team: top.team.sort((a, b) => b.v - a.v), total: top.total, repeats: top.repeats, teams: teams.slice(0, 5), alts, problems };
  }

  // The best team for each cup ([cup]) from the same pool. → [{ cup, r }] and, per uma, how many
  // cups she's in: { tid: count }.
  function everyCup(cups, pool, o) {
    const rows = cups.map((cup) => ({ cup, r: best(cup, pool, o) })), count = {};
    rows.forEach((x) => x.r.team.forEach((p) => { count[p.tid] = (count[p.tid] || 0) + 1; }));
    return { rows, count };
  }

  const api = { STYLES, SAME_STYLE, goodStyles, worth, best, everyCup };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaTeamMaker = api;
})(typeof window !== "undefined" ? window : globalThis);
