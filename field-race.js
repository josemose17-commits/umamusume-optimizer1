// Skill optimizer, "for winning": her skill sets raced in a full field with GlobalSim
// (vendor/globalsim). Pure logic: the field, gate draws, requests and paired statistics, and the
// win-rate search. The page supplies run(request, seeds) -> [result, ...] (GlobalSim's RacePool)
// and the rivals' skills; tests can supply GlobalSim's Node build.
(function (root) {
  const STYLES = ["Nige", "Senkou", "Sasi", "Oikomi"];
  // Umalator race definitions (data/presets.js racedef) to GlobalSim's names.
  const GROUND = { 1: "Good", 2: "Yielding", 3: "Soft", 4: "Heavy" };
  const WEATHER = { 1: "Sunny", 2: "Cloudy", 3: "Rainy", 4: "Snowy" };
  const SEASON = { 1: "Spring", 2: "Summer", 3: "Autumn", 4: "Winter", 5: "Sakura" };
  const TIME = { 0: "none", 1: "morning", 2: "midday", 3: "evening", 4: "night" };
  // A typical spread of running styles among the rivals (an assumption you can change).
  const MIX = { cm: { Nige: 1, Senkou: 3, Sasi: 2, Oikomi: 2 }, loh: { Nige: 2, Senkou: 4, Sasi: 3, Oikomi: 2 } };
  const STRENGTH = { weaker: 0.9, equal: 1, stronger: 1.1 };
  const STATS = ["speed", "stamina", "power", "guts", "wisdom"];

  function course(p) {
    const r = p.racedef || {};
    return { courseId: p.course.id, groundCondition: GROUND[r.ground] || "Good", weather: WEATHER[r.weather] || "Sunny",
      season: SEASON[r.season] || "Spring", time: TIME[r.time] || "midday" };
  }
  // One runner in GlobalSim's shape. skills: ids; unique: { id, level } for her own unique.
  function runner(o) {
    const skills = (o.skills || []).map(String).filter((id) => !o.unique || id !== String(o.unique.id));
    if (o.unique) skills.unshift({ skillId: String(o.unique.id), level: o.unique.level || 1, isUnique: true });
    const r = { strategy: o.style, distanceAptitude: o.apt[0], surfaceAptitude: o.apt[1], strategyAptitude: o.apt[2], mood: o.mood || 0, skills };
    STATS.forEach((s) => { r[s] = Math.max(1, Math.round(+o.stats[s])); });
    return r;
  }
  // The rivals: mix { style: count }, each as strong as her (her stats × strength), A aptitudes,
  // and skillsFor(style) as their skills.
  function rivals(her, o) {
    const k = STRENGTH[o.strength] || +o.strength || 1, out = [];
    STYLES.forEach((style) => {
      for (let i = 0; i < (o.mix[style] || 0); i++) {
        const stats = {}; STATS.forEach((s) => { stats[s] = Math.min(2000, Math.round(her.stats[s] * k)); });
        out.push({ style, stats, apt: ["A", "A", "A"], mood: her.mood || 0, skills: o.skillsFor(style) });
      }
    });
    return out;
  }
  const rng = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  // Whether conditions (strings: & = and, @ = or) can hold on this course for this style. Only the
  // fixed parts are checked: style, distance, surface, track and direction.
  function canFire(conds, p, style) {
    const fixed = { running_style: STYLES.indexOf(style) + 1, distance_type: { Sprint: 1, Mile: 2, Medium: 3, Long: 4 }[p.course.dist],
      ground_type: p.course.surface === "Dirt" ? 2 : 1, track_id: 10000 + Math.floor((p.course.id - 10000) / 100), rotation: p.course.turn === "Left" ? 2 : 1 };
    return [].concat(conds || []).join("@").split("@").some((alt) => alt.split("&").every((tok) => {
      const m = /^(\w+)(==|!=)(\d+)$/.exec(tok.trim());
      if (!m || !(m[1] in fixed) || !fixed[m[1]]) return true;
      return m[2] === "==" ? fixed[m[1]] === +m[3] : fixed[m[1]] !== +m[3];
    }));
  }
  const conditionsOf = (entry) => ((entry && entry.alternatives) || []).map((a) => a.condition || "");
  // Rivals as top players run them (data/rival-pools.js, one distance): each a most-picked uma,
  // drawn by pick rate, with her own aptitudes, unique and best running style; stats drawn from
  // top-class percentiles (p50..p95 for "strong", p25..p75 for "typical"); skills each drawn at
  // their real purchase rate, if they can fire for her style here (debuffs included).
  // o: { preset, count, seed, level ("strong"|"typical"), trainee(id) -> { apt, us, n }, allowed(id), table, mood, uniqueLevel, familyOf }
  function topRivals(pool, o) {
    const rand = rng(o.seed || 1793), p = o.preset;
    const di = { Sprint: 2, Mile: 3, Medium: 4, Long: 5 }[p.course.dist], si = p.course.surface === "Dirt" ? 1 : 0;
    const umas = pool.umas.map(([id, w]) => ({ id, w, t: o.trainee(id) })).filter((x) => x.t && x.t.apt);
    const total = umas.reduce((a, x) => a + x.w, 0), rank = (g) => "GFEDCBAS".indexOf(g);
    const [lo, hi] = o.level === "typical" ? ["p25", "p75"] : ["p50", "p95"];
    const out = [];
    for (let i = 0; i < o.count && umas.length; i++) {
      let r = rand() * total, u = umas[umas.length - 1];
      for (const x of umas) { r -= x.w; if (r <= 0) { u = x; break; } }
      const k = [1, 0, 2, 3].reduce((b, j) => (rank(u.t.apt[6 + j]) > rank(u.t.apt[6 + b]) ? j : b), 1), style = STYLES[k];
      const stats = {};
      STATS.forEach((st) => { const q = pool.stats[st]; stats[st] = Math.round(q[lo] + rand() * (q[hi] - q[lo])); });
      const picked = new Map(), familyOf = o.familyOf || ((id) => id);
      pool.skills.forEach(([id, rate]) => {
        if (/^1\d{5}$/.test(id) || !o.allowed(id) || !o.table[id] || !canFire(conditionsOf(o.table[id]), p, style) || rand() >= rate) return;
        const f = familyOf(id), had = picked.get(f);
        if (!had || +id < +had) picked.set(f, id); // a higher tier (lower ID) replaces the lower one
      });
      const uid = u.t.us && u.t.us[0] ? String(u.t.us[0]) : null;
      out.push({ name: u.t.n, uma: u.id, style, stats, apt: [u.t.apt[di], u.t.apt[si], u.t.apt[6 + k]], mood: o.mood || 0,
        unique: uid && o.table[uid] ? { id: uid, level: o.uniqueLevel || 4 } : null, skills: [...picked.values()] });
    }
    return out;
  }
  // Gate draws: count deterministic permutations of n gates (she is runner 0 in every draw).
  function layouts(n, count, seed = 20261111) {
    let s = seed >>> 0;
    const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return Array.from({ length: count }, () => {
      const g = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [g[i], g[j]] = [g[j], g[i]]; }
      return g;
    });
  }
  // A request: the cup, the validated settings, only the skill entries this field uses.
  function request(o, horses, gates) {
    const used = new Set();
    horses.forEach((h) => h.skills.forEach((x) => used.add(String(typeof x === "string" ? x : x.skillId))));
    const skillData = {};
    used.forEach((id) => { if (o.table[id]) skillData[id] = o.table[id]; });
    return Object.assign({}, o.settings, course(o.preset), { seed: 1, retainAllFrames: false, playerHorseIndex: 0, skillData,
      experimentalLaterStaminaMechanics: !!o.showdown, horses: horses.map((h, i) => Object.assign({}, h, { gateIndex: gates[i] })) });
  }
  // Races horses on one gate draw. A skill whose condition the engine can't run (it says so only
  // when that trigger comes up) is taken out of every runner, added to unsupported, and the races rerun.
  async function runSafe(o, horses, gates, seeds, unsupported) {
    for (;;) {
      const clean = horses.map((h) => Object.assign({}, h, { skills: h.skills.filter((x) => !unsupported.has(String(typeof x === "string" ? x : x.skillId))) }));
      const req = request(o, clean, gates);
      try { return await o.run(req, seeds); }
      catch (error) {
        const m = /(?:Untraced|[Uu]nsupported|[Uu]nknown)[^:]*:\s*([\w>=<!.&|]+)\s*$/.exec(error.message || "");
        const bad = m ? Object.keys(req.skillData).filter((id) => JSON.stringify(req.skillData[id]).includes(m[1]) && !unsupported.has(id)) : [];
        if (!bad.length) throw error;
        bad.forEach((id) => unsupported.add(id));
      }
    }
  }
  // Mean and 95% interval (normal approximation) of a list.
  function summary(xs) {
    const n = xs.length, mean = n ? xs.reduce((a, b) => a + b, 0) / n : 0;
    const sd = n > 1 ? Math.sqrt(xs.reduce((t, x) => t + (x - mean) * (x - mean), 0) / (n - 1)) : 0;
    return { mean, sd, n, ci95: n > 1 ? 1.96 * sd / Math.sqrt(n) : 0 };
  }

  // The search. o: { preset, kind ("cm"|"loh"), her (runner input without purchases), learned,
  //   team (teammates' runner inputs), field (rivals' runner inputs), table, settings, showdown,
  //   candidates: [[option, ...], ...] (each a purchase set: race-skills.js options), run, progress,
  //   draws (gate draws, default 12), screen / check (races per draw), signal }.
  // Goal: CM, her win rate; LoH, her average place (lower is better).
  async function search(o) {
    // Several rival fields (o.fields) take turns across the gate draws: real opponents change.
    const fields = o.fields && o.fields.length ? o.fields : [o.field];
    o = Object.assign({}, o, { field: fields[0] });
    const draws = layouts(1 + o.team.length + o.field.length, o.draws || 12);
    const SCREEN = o.screen || (o.precise ? 40 : 20), CHECK = o.check || (o.precise ? 250 : 100);
    const loh = o.kind === "loh";
    let done = 0, total = 0;
    const cache = new Map(), unsupported = o.unsupported || new Set();
    const keyOf = (set) => set.map((x) => x.id).sort().join(".");
    // Per-race outcomes for one set on one seed block (paired across sets: same draws, seeds).
    async function races(set, block, n) {
      const key = keyOf(set) + "|" + block + "|" + n;
      if (cache.has(key)) return cache.get(key);
      // A bought tier replaces the lower one she has (one skill per family, as in the game).
      const fams = new Set(set.map((x) => x.family)), familyOf = o.familyOf || ((id) => id);
      const her = runner(Object.assign({}, o.her, { skills: o.learned.filter((id) => !fams.has(familyOf(id))).concat(set.map((x) => x.id)) }));
      const out = { win: [], place: [], top3: [], team: [] };
      for (let g = 0; g < draws.length; g++) {
        const all = [her].concat(o.team.map(runner), fields[g % fields.length].map(runner));
        if (o.signal && o.signal.aborted) throw new Error("Comparison cancelled.");
        const seeds = Array.from({ length: n }, (_, i) => block * 1000000 + g * 10000 + i + 1);
        const results = await runSafe(o, all, draws[g], seeds, unsupported);
        results.forEach((r) => {
          const rs = r.results, order = rs[0].finishOrder;
          out.win.push(order === 0 ? 1 : 0); out.place.push(order + 1); out.top3.push(order < 3 ? 1 : 0);
          out.team.push(rs.slice(0, 1 + o.team.length).some((x) => x.finishOrder === 0) ? 1 : 0);
        });
        done += n; if (o.progress) o.progress(Math.min(0.99, done / Math.max(total, done)));
      }
      cache.set(key, out);
      return out;
    }
    const score = (r) => (loh ? -summary(r.place).mean : summary(o.team.length ? r.team : r.win).mean);
    const goalOf = (r) => (loh ? r.place.map((x) => -x) : o.team.length ? r.team : r.win);
    const paired = (a, b) => summary(goalOf(a).map((x, i) => x - goalOf(b)[i]));
    const spent = (set) => set.reduce((n, x) => n + x.cost, 0);
    const uniq = [];
    o.candidates.forEach((set) => { if (!uniq.some((u) => keyOf(u) === keyOf(set))) uniq.push(set); });
    // Preflight: every skill in play on a few races per gate draw, so a condition the engine can't
    // run is found before any set is scored (it is raised only when that trigger comes up).
    const allIds = [...new Set(uniq.flat().map((x) => x.id))];
    await races(allIds.map((id) => ({ id, family: id, cost: 0 })), 9, 3);
    for (let attempt = 0; ; attempt++) {
      const before = unsupported.size;
      const out = await body();
      if (unsupported.size === before || attempt >= 3) return out;
      cache.clear(); done = 0; // a skill was taken out mid-search: race every set again on the same field
    }
    async function body() {
    total = draws.length * ((uniq.length + (o.options && o.options.length ? (o.moves == null ? 30 : o.moves) : 0)) * SCREEN + CHECK * 4 + Math.round(CHECK / 2) * ((o.candidates[0] || []).length + 2));
    // 1. Screen every candidate on the same races.
    const screened = [];
    for (const set of uniq) screened.push({ set, r: await races(set, 1, SCREEN) });
    screened.sort((a, b) => score(b.r) - score(a.r) || spent(a.set) - spent(b.set));
    // 1b. Swap search in the field itself, so the answer doesn't rest on the lengths search's
    // shortlist: from the best set, remove, add or exchange one purchase (o.options, most
    // promising first) on the same races; move on the first improvement, up to o.moves sets.
    if (o.options && o.options.length) {
      const limit = o.moves == null ? 30 : o.moves, budget = o.sp == null ? Infinity : o.sp;
      let center = screened[0], tried = 0, moved = true;
      while (moved && tried < limit) {
        moved = false;
        const cands = center.set.map((x) => center.set.filter((y) => y !== x));
        o.options.forEach((x) => {
          if (center.set.some((y) => y.id === x.id)) return;
          const rest = center.set.filter((y) => y.family !== x.family);
          cands.push(rest.concat(x));
          rest.forEach((old) => cands.push(rest.filter((y) => y !== old).concat(x)));
        });
        for (const c of cands) {
          if (tried >= limit) break;
          if (spent(c) > budget || screened.some((v) => keyOf(v.set) === keyOf(c))) continue;
          tried++;
          const v = { set: c, r: await races(c, 1, SCREEN) };
          screened.push(v);
          if (score(v.r) > score(center.r) + 1e-9) { center = v; moved = true; break; }
        }
      }
      screened.sort((a, b) => score(b.r) - score(a.r) || spent(a.set) - spent(b.set));
    }
    // 2. The top two on fresh races, head to head (paired). Win/lose is a noisy yes/no, and SP
    // left on a finished uma is worth nothing, so without a clear difference the set with the
    // better estimate stays (her average place breaks an exact tie), not the cheaper one.
    let best = screened[0], duel = null;
    const second = screened[1];
    if (second) {
      const a = await races(best.set, 2, CHECK), b = await races(second.set, 2, CHECK), d = paired(a, b);
      const byPlace = summary(b.place.map((x, i) => x - a.place[i])).mean;
      let verdict = Math.abs(d.mean) <= d.ci95 ? "tie" : d.mean > 0 ? "best" : "swapped";
      if (verdict === "swapped" || verdict === "tie" && (d.mean < 0 || d.mean === 0 && byPlace < 0)) {
        duel = { verdict, other: best.set.map((x) => x.id), diff: Object.assign({}, d, { mean: -d.mean }) }; best = second;
      } else duel = { verdict, other: second.set.map((x) => x.id), diff: d };
    }
    // 3. Drop purchases that show no gain at all: without one she wins (or places) at least as
    // well and her average place is no worse. One pass: each purchase is raced without it, every
    // no-gain one is dropped together, and that is confirmed (else only the weakest goes). A small
    // but positive estimate is kept, since the SP has no other use.
    let set = best.set.slice();
    const pruned = [], HALF = Math.max(10, Math.round(CHECK / 2));
    if (set.length) {
      const full = await races(set, 3, HALF), weak = [];
      for (const x of set) {
        if (x.required && x.required.length) continue;
        const without = await races(set.filter((s) => s !== x), 3, HALF), d = paired(full, without);
        const place = summary(without.place.map((v, i) => v - full.place[i]));
        if (d.mean <= 0 && place.mean <= 0) weak.push({ x, d, place });
      }
      weak.sort((a, b) => a.d.mean - b.d.mean || a.place.mean - b.place.mean);
      let drop = weak;
      if (weak.length > 1) {
        const rest = set.filter((s) => !weak.some((w) => w.x === s)), d = paired(full, await races(rest, 3, HALF));
        const place = summary((await races(rest, 3, HALF)).place.map((v, i) => v - full.place[i]));
        if (!(d.mean <= 0 && place.mean <= 0)) drop = weak.slice(0, 1);
      }
      drop.forEach((w) => pruned.push({ id: w.x.id, cost: w.x.cost, diff: w.d, place: w.place }));
      set = set.filter((s) => !drop.some((w) => w.x === s));
    }
    // 4. Report on races no step used: this set and buying nothing.
    const fin = await races(set, 4, CHECK), none = await races([], 4, CHECK);
    const report = (r) => ({ win: summary(r.win), place: summary(r.place), top3: summary(r.top3), team: summary(r.team) });
    if (o.progress) o.progress(1);
    return { selected: set, spent: spent(set), result: report(fin), baseline: report(none), gain: paired(fin, none), duel, pruned,
      screened: screened.map((x) => ({ ids: x.set.map((s) => s.id), spent: spent(x.set), score: score(x.r), win: summary(x.r.win).mean, place: summary(x.r.place).mean })),
      unsupported: [...unsupported].sort(), races: done, draws: draws.length, screenRaces: draws.length * SCREEN, field: 1 + o.team.length + o.field.length, goal: loh ? "place" : o.team.length ? "team" : "win" };
    }
  }

  const api = { STYLES, MIX, STRENGTH, course, runner, rivals, topRivals, canFire, conditionsOf, layouts, request, runSafe, summary, search };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaFieldRace = api;
})(typeof window !== "undefined" ? window : globalThis);
