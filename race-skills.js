// Build-specific, paired Umalator comparisons. Purchase legality comes from skill-budget.js.
// This is a bounded set search, not a multi-runner win-rate model.
(function (root) {
  const B = root.UmaSkillBudget || (typeof require !== "undefined" ? require("./skill-budget.js") : null);
  const version = typeof document !== "undefined" && document.currentScript ? new URL(document.currentScript.src).search : "";
  const ids = xs => [...new Set((xs || []).map(String))].sort();
  const average = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
  function summary(xs) {
    const s = xs.slice().sort((a, b) => a - b), n = s.length;
    if (!n || s.some(x => !Number.isFinite(x))) throw new Error("The race simulator returned no valid comparisons.");
    const mean = average(s), sd = n > 1 ? Math.sqrt(s.reduce((t, x) => t + (x - mean) * (x - mean), 0) / (n - 1)) : 0;
    // sd of the paired per-race differences; ci95: the half-width of the mean's 95% interval
    // (normal approximation). It measures sampling noise only, not the simplified field.
    return { mean, median: (s[Math.floor((n - 1) / 2)] + s[Math.floor(n / 2)]) / 2, low: s[Math.floor((n - 1) * 0.1)], min: s[0], max: s[n - 1], samples: n, sd, ci95: n > 1 ? 1.96 * sd / Math.sqrt(n) : 0 };
  }
  // The simulator a cup runs on: its JP-dated variant (data/race-variants, cm22 on and League of
  // Heroes: skill versions as on its JP date, stamina showdown when JP had it), else Global's.
  // sims: data/skillvalues/index.js meta.sims.
  function engine(p, sims) {
    const name = p && sims ? sims[p.id] : null;
    return name && /^jp-[\w-]+$/.test(name) ? { sim: name, catalog: "jp" } : { sim: null, catalog: "global" };
  }
  // Why the race simulator can't run this cup (then only its course chart is used), or null.
  // variant: the cup's simVariant; inBrowser: its JP-dated simulator ships with the page.
  function supported(p, variant, catalog) {
    if (!catalog.courses[p.course.id]) return "This course is missing from the pinned race simulator.";
    if (variant && !variant.inBrowser && (variant.syoubu || Object.keys(variant.changed || {}).length)) return "This cup needs a later race-engine or skill version; only its existing course chart can be used.";
    return null;
  }
  function horse(input, skills, catalog) {
    const map = new Map();
    ids(skills).forEach(id => {
      if (!catalog.skills[id] || !catalog.meta[id]) throw new Error("Race data missing for skill " + id);
      const group = catalog.meta[id].groupId, before = map.get(group);
      // Upgrades replace lower tiers, regardless of the ordering of selected IDs.
      const chain = B.create().chain(id);
      if (!before || chain && chain.includes(before)) map.set(group, id);
    });
    return Object.assign({ outfitId: "", starCount: 3, uniqueLv: 1, mood: 0, popularity: 1,
      distanceAptitude: "A", surfaceAptitude: "A", strategyAptitude: "A",
      aptitudes: Array(10).fill("A"), samplePolicies: new Map() }, input, { skills: map, samplePolicies: new Map() });
  }
  function request(preset, input, before, after, catalog, samples = 24, seed = 271828) {
    const course = JSON.parse(JSON.stringify(catalog.courses[preset.course.id]));
    course.slopes.sort((a, b) => a.start - b.start);
    const count = preset.kind === "loh" ? 12 : 9;
    const half = Math.floor(count / 2);
    const range = input.orderRange || ({ Nige: [1, 1], Senkou: [2, half], Sasi: [half + 1, count], Oikomi: [half + 1, count] })[input.strategy];
    const { ground, weather, season, time } = preset.racedef;
    return { msg: "compare", data: { nsamples: samples, course,
      racedef: { groundCondition: ground, weather, season, time, grade: 100, skillId: "", orderRange: range, numUmas: count },
      uma1: horse(input, before, catalog), uma2: horse(input, after, catalog),
      options: { seed, usePosKeep: true, useCompeteTop: true, useIntChecks: true } } };
  }
  function runner(sim) {
    const worker = new Worker("race-worker.js" + version + (sim ? (version ? "&" : "?") + "sim=" + encodeURIComponent(sim) : ""));
    let pending = null;
    worker.onmessage = ({ data }) => {
      if (!pending) return;
      if (data.type === "error") { const p = pending; pending = null; clearTimeout(p.timer); p.reject(new Error(data.error)); }
      else if (data.type === "done") { const p = pending; pending = null; clearTimeout(p.timer); p.resolve(p.last); }
      else pending.last = data;
    };
    worker.onerror = event => { if (pending) { const p = pending; pending = null; clearTimeout(p.timer); p.reject(new Error(event.message || "Race worker failed to load.")); } };
    return { run: message => new Promise((resolve, reject) => { if (pending) { reject(new Error("Race worker is busy.")); return; } const timer=setTimeout(()=>{worker.terminate();pending=null;reject(new Error("The race comparison took too long. Reduce the skill list and try again."));},20000);pending = { resolve, reject, timer }; worker.postMessage(message); }),
      close: () => { worker.terminate(); if (pending) { clearTimeout(pending.timer); pending.reject(new Error("Comparison cancelled.")); pending = null; } } };
  }
  const catalogs = {};
  // kind "jp": the JP worker's skills and courses (JP-dated cups); else Global's.
  const load = (kind) => { const file = kind === "jp" ? "data/race-skills-jp.json" : "data/race-skills.json";
    return catalogs[file] || (catalogs[file] = fetch(file + version).then(r => { if (!r.ok) throw new Error("Race data did not load."); return r.json(); }).catch(e => { delete catalogs[file]; throw e; })); };
  const DUEL_RACES = 240, DUEL_SEED = 161803, CONFIRM_SEED = 577215, PRUNE_SEED = 141421;
  async function optimize(o) {
    const learned = ids(o.learned), values = Object.assign({}, o.values), excluded = [];
    // o.scale: { id: share } for skills the engine fires on a sampled timing but that need a rival
    // ahead (a Front Runner): 0 drops them (she leads alone), a share keeps that part of their gain.
    const scale = o.scale || {}, offPosition = ids(o.available).filter(id => scale[id] === 0 && !learned.includes(id));
    const available = ids(o.available).filter(id => !offPosition.includes(id)).filter(id => {
      if (o.catalog.skills[id] && o.catalog.meta[id] || o.allowChartOnly && B.DATA.skills[id] && Number.isFinite(values[id])) { if (!Number.isFinite(values[id])) values[id] = 0; return true; }
      excluded.push(id); return false;
    });
    const missing = o.allowChartOnly?[]:learned.filter(id => !o.catalog.skills[id] || !o.catalog.meta[id]);
    if (missing.length) throw new Error("Equipped skills lack race data: " + missing.join(", "));
    try { await o.compare(learned,learned,24,271828); }
    catch(error) {
      if (/cancelled|too long|load|busy/i.test(error.message)) throw error;
      throw new Error("The equipped baseline has conditions this engine cannot simulate. Change the comparison's equipped list or use the course chart.");
    }
    let budget = B.create({ learned, available, skills: values, must: o.must || [], includeZero: true, fastLearner: !!o.fastLearner });
    const preflight = new Map();
    // A catalog entry does not guarantee that this engine parses its conditions. Test each
    // addition and keep unsupported routes out of the search, with their IDs disclosed.
    for (const x of budget.options(o.hints || {}).flat()) {
      try { preflight.set(x.id, await o.compare(learned,ids(learned.concat(x.id)),24,271828)); }
      catch(error) {
        if (/cancelled|too long|load|busy/i.test(error.message)) throw error;
        excluded.push(x.id); delete values[x.id];
      }
    }
    // A scaled skill's simulated gain beyond its share, taken off any set that contains it
    // (additive: its standalone gain from the equipped baseline).
    const cut = list => list.reduce((n, x) => { const f = scale[x.id]; const alone = preflight.get(x.id); return f > 0 && f < 1 && alone ? n + (1 - f) * alone.mean : n; }, 0);
    const adjust = (result, list) => { const c = cut(list); return c ? Object.assign({}, result, { mean: result.mean - c, median: result.median - c, low: result.low - c, min: result.min - c, max: result.max - c, scaledOff: c }) : result; };
    budget = B.create({ learned, available, skills: values, must: o.must || [], includeZero: true, fastLearner: !!o.fastLearner });
    // Unvalued must-haves are normally retained by the purchase solver; an unsupported
    // race effect cannot be restored that way.
    // An upgrade of an available skill can also be dropped (scale 0) by position.
    const dropped = id => excluded.includes(id) || scale[id] === 0 && !learned.includes(id);
    budget.options(o.hints || {}).flat().forEach(x => { if (scale[x.id] === 0 && !learned.includes(x.id) && !offPosition.includes(x.id)) offPosition.push(x.id); });
    const groups = budget.options(o.hints || {}).map(g=>g.filter(x=>!dropped(x.id))).filter(g=>g.length), options = groups.flat();
    const seed = budget.solve(o.hints || {}, o.sp);
    seed.selected=seed.selected.filter(x=>!dropped(x.id));
    excluded.push(...seed.unsupported.filter(id=>!excluded.includes(id)));
    const limit = o.maxEvaluations || 96, cache = new Map();
    let calls = 0, failedSets = 0, goal = limit;
    const evaluate = async selected => {
      const key = ids(selected.map(s => s.id)).join(".");
      if (cache.has(key)) return cache.get(key);
      const spent = selected.reduce((n, x) => n + x.cost, 0);
      if (spent > o.sp) return null;
      const set = ids(learned.concat(selected.map(s => s.id))), satisfied = new Set(learned.concat(selected.flatMap(x => x.required)));
      const required = (o.must || []).map(String).filter(id => satisfied.has(id)).length;
      let result;
      try { result = selected.length ? adjust(await o.compare(learned, set, 24, 271828), selected) : summary([0]); }
      catch(error) { if (/cancelled|too long|load|busy/i.test(error.message)) throw error;cache.set(key,null);calls++;failedSets++;return null; }
      const v = { selected: selected.slice(), spent, required, result };
      cache.set(key, v); calls++; if (o.progress) o.progress(Math.min(0.9, calls / goal)); return v;
    };
    const better = (a, b) => a && (!b || a.required > b.required || a.required === b.required && (a.result.mean > b.result.mean + 1e-6 || Math.abs(a.result.mean - b.result.mean) <= 1e-6 && a.spent < b.spent));
    // A small shop: race every full affordable combination (one tier per skill family; full: no
    // other skill still fits the SP), so the answer is the best set under the simulator, not the
    // best one a bounded search reached. A skill that clearly loses lengths on its own is left
    // out; one that adds nothing is dropped from the winner afterwards (pruning below).
    const cap = o.exhaustive == null ? 200 : o.exhaustive;
    const all = (() => {
      if (!(cap > 0)) return null;
      const harmful = x => { const r = preflight.get(x.id); return !x.required.length && r && r.mean + (r.ci95 || 0) < 0; };
      const fams = groups.map(g => g.filter(x => !harmful(x))).filter(g => g.length);
      let sets = [[]];
      for (const g of fams) {
        const next = sets.slice();
        for (const set of sets) {
          const spent = set.reduce((n, x) => n + x.cost, 0);
          for (const x of g) if (spent + x.cost <= o.sp) { next.push(set.concat(x)); if (next.length > 20000) return null; }
        }
        sets = next;
      }
      const full = sets.filter(set => {
        const spent = set.reduce((n, x) => n + x.cost, 0), used = new Set(set.map(x => x.family));
        return !fams.some(g => !used.has(g[0].family) && g.some(x => spent + x.cost <= o.sp));
      });
      return full.length <= cap ? full : null;
    })();
    let best = null, method;
    if (all) {
      method = "every full affordable combination";
      goal = all.length;
      for (const set of all) { const v = await evaluate(set); if (better(v, best)) best = v; }
    } else {
      method = "bounded paired race comparisons";
      best = await evaluate(seed.selected);
      const empty = await evaluate([]);
      if (better(empty, best)) best = empty;
      // Several different starts: empty, the additive chart solution, and greedy fills by each
      // skill's own simulated gain (per SP, and outright), so one early ordering can't decide.
      const alone = x => (preflight.get(x.id) || { mean: x.L }).mean;
      const greedy = (key, from = [], skip = new Set()) => {
        const out = from.slice(), fams = new Set(out.map(x => x.family));
        let spent = out.reduce((n, x) => n + x.cost, 0);
        options.filter(x => !skip.has(x.family) && alone(x) > 0).sort((a, b) => key(b) - key(a)).forEach(x => {
          if (!fams.has(x.family) && spent + x.cost <= o.sp) { out.push(x); fams.add(x.family); spent += x.cost; }
        });
        return out;
      };
      const starts = [empty, best];
      for (const key of [x => alone(x) / Math.max(1, x.cost), x => alone(x)]) { const v = await evaluate(greedy(key)); if (v) starts.push(v); if (better(v, best)) best = v; }
      // Small pairs too: an enabling skill can be worthless alone.
      const short = groups.slice().sort((a,b) => Math.max(...b.map(x=>x.L)) - Math.max(...a.map(x=>x.L))).slice(0,8).map(g=>g.slice().sort((a,b)=>b.L/Math.max(1,b.cost)-a.L/Math.max(1,a.cost))[0]);
      for (let i=0;i<short.length;i++) for (let j=i+1;j<short.length && calls<Math.floor(limit/3);j++) {
        const v=await evaluate([short[i],short[j]]); if(better(v,best))best=v;
      }
      starts.push(best);
      for (let pass = 0; pass < 3 && calls < limit; pass++) {
        const centers = pass ? [best] : [...new Set(starts.filter(Boolean))];
        let moved = false;
        for (const center of centers) {
          const candidates = [[], ...center.selected.map(x => center.selected.filter(s => s.id !== x.id))];
          options.slice().sort((a, b) => b.required.length - a.required.length || b.L / Math.max(1,b.cost) - a.L / Math.max(1,a.cost)).forEach(option => {
            const rest = center.selected.filter(x => x.family !== option.family);
            candidates.push(rest.concat(option));
            // A one-for-one exchange can release SP even when the next addition alone won't fit.
            center.selected.forEach(old => { if (old.family !== option.family) candidates.push(rest.filter(x => x.id !== old.id).concat(option)); });
          });
          // Two-for-two: take out two purchases and refill the SP with the best others.
          center.selected.forEach((a, i) => center.selected.slice(i + 1).forEach(b => {
            candidates.push(greedy(x => alone(x) / Math.max(1, x.cost), center.selected.filter(x => x !== a && x !== b), new Set([a.family, b.family])));
          }));
          for (const selected of candidates) {
            if (calls >= limit) break;
            const v = await evaluate(selected);
            if (better(v, best)) { best = v; moved = true; }
          }
        }
        if (pass && !moved) break;
      }
    }
    // Report on a separate seed and a larger sample; a noisy search win can lose this check.
    const finalists = [...cache.values()].filter(Boolean).sort((a, b) => b.required - a.required || b.result.mean - a.result.mean || a.spent - b.spent).slice(0, 3);
    if (!finalists.includes(cache.get(ids(seed.selected.map(s=>s.id)).join(".")))) finalists.push(cache.get(ids(seed.selected.map(s=>s.id)).join(".")));
    best = null;
    const checked = [];
    for (const x of finalists.filter(Boolean)) {
      const r = adjust(await o.compare(learned, ids(learned.concat(x.selected.map(s=>s.id))), 96, 314159), x.selected);
      const v = Object.assign({}, x, { result: r }); checked.push(v); if (better(v, best)) best = v;
    }
    // Head-to-head: the best finalist against the runner-up (same must-haves met), paired on
    // fresh races. Within the 95% interval it's a tie; a clear loss swaps them.
    const setOf = x => ids(learned.concat(x.selected.map(s=>s.id)));
    const runner = checked.filter(v => v !== best && v.required === best.required && setOf(v).join() !== setOf(best).join()).sort((a,b) => b.result.mean - a.result.mean)[0];
    let duel = null;
    if (runner) {
      try {
        const raw = await o.compare(setOf(runner), setOf(best), DUEL_RACES, DUEL_SEED);
        const d = Object.assign({}, raw), shift = cut(runner.selected) - cut(best.selected);
        ["mean","median","low","min","max"].forEach(k => { d[k] += shift; });
        let verdict = Math.abs(d.mean) <= d.ci95 ? "tie" : d.mean > 0 ? "best" : "swapped";
        // No clear difference: the set that spends less SP is kept (an interval containing zero
        // shows no clear advantage, not that the two are equal).
        if (verdict === "swapped" || verdict === "tie" && runner.spent < best.spent) { const t = best; best = runner; Object.keys(d).forEach(k => { if (["mean","median","low","min","max"].includes(k)) d[k] = -d[k]; }); duel = { verdict, other: t.selected.map(x=>x.id), diff: d }; }
        else duel = { verdict, other: runner.selected.map(x=>x.id), diff: d };
      } catch (error) { if (/cancelled|too long|load|busy/i.test(error.message)) throw error; }
    }
    // The reported gain comes from races the search and the head-to-head never used.
    try { best = Object.assign({}, best, { result: adjust(await o.compare(learned, setOf(best), 96, CONFIRM_SEED), best.selected), selectedOn: best.result }); }
    catch (error) { if (/cancelled|too long|load|busy/i.test(error.message)) throw error; }
    // Keep SP rather than buy a skill that doesn't clearly add lengths: each purchase is raced
    // against the set without it on fresh paired races, and the weakest one goes while the set
    // isn't clearly better with it (its gain within the 95% interval of race-to-race noise).
    const pruned = [];
    for (let round = 0; round < 6 && best.selected.length; round++) {
      let weakest = null;
      for (const x of best.selected) {
        if (x.required.length) continue;
        const without = best.selected.filter(s => s !== x);
        const raw = await o.compare(setOf({ selected: without }), setOf(best), DUEL_RACES, PRUNE_SEED);
        const d = adjust(raw, [x]);
        if (d.mean <= d.ci95 && (!weakest || d.mean < weakest.d.mean)) weakest = { x, d };
      }
      if (!weakest) break;
      pruned.push({ id: weakest.x.id, cost: weakest.x.cost, diff: weakest.d });
      best = Object.assign({}, best, { selected: best.selected.filter(s => s !== weakest.x), spent: best.spent - weakest.x.cost });
    }
    if (pruned.length) {
      try { best = Object.assign({}, best, { result: best.selected.length ? adjust(await o.compare(learned, setOf(best), 96, CONFIRM_SEED), best.selected) : summary([0]) }); }
      catch (error) { if (/cancelled|too long|load|busy/i.test(error.message)) throw error; }
    }
    const rows = [];
    for (const x of best.selected) {
      const rest = ids(learned.concat(best.selected.filter(s => s.id !== x.id).map(s=>s.id)));
      const raw = await o.compare(rest, ids(learned.concat(best.selected.map(s=>s.id))), 96, 314159);
      const marginal = adjust(raw, [x]);
      rows.push(Object.assign({}, x, { marginal, per100: x.cost ? marginal.mean * 100 / x.cost : null }));
    }
    rows.sort((a,b) => (b.per100 || 0) - (a.per100 || 0));
    const ranking = [];
    for (const x of options) {
      const k=ids([x.id]).join("."), cached=cache.get(k);
      const result=cached ? cached.result : adjust(preflight.get(x.id), [x]);
      ranking.push(Object.assign({},x,{result,per100:x.cost?result.mean*100/x.cost:null}));
    }
    ranking.sort((a,b)=>(b.per100||0)-(a.per100||0));
    return { selected: rows, ranking, spent: best.spent, budget: o.sp, unspent: o.sp - best.spent, result: best.result, excluded,
      unmetMust: (o.must || []).map(String).filter(id => !learned.includes(id) && !best.selected.some(x=>x.required.includes(id))),
      evaluations: calls, failedSets, method, learned, duel, pruned, offPosition, scaled: Object.keys(scale).filter(id => scale[id] > 0 && scale[id] < 1) };
  }
  const api = { summary, supported, engine, horse, request, runner, load, optimize };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.UmaRaceSkills = api;
})(typeof window !== "undefined" ? window : globalThis);
