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
    return { mean: average(s), median: (s[Math.floor((n - 1) / 2)] + s[Math.floor(n / 2)]) / 2, low: s[Math.floor((n - 1) * 0.1)], min: s[0], max: s[n - 1], samples: n };
  }
  function supported(p, variant, catalog) {
    if (!catalog.courses[p.course.id]) return "This course is missing from the pinned race simulator.";
    if (variant && (variant.syoubu || Object.keys(variant.changed || {}).length)) return "This cup needs a later race-engine or skill version; only its existing course chart can be used.";
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
  function runner() {
    const worker = new Worker("race-worker.js" + version);
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
  let catalogPromise;
  const load = () => catalogPromise || (catalogPromise = fetch("data/race-skills.json" + version).then(r => { if (!r.ok) throw new Error("Race data did not load."); return r.json(); }).catch(e => { catalogPromise = null; throw e; }));
  async function optimize(o) {
    const learned = ids(o.learned), values = Object.assign({}, o.values), excluded = [];
    const available = ids(o.available).filter(id => {
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
    let budget = B.create({ learned, available, skills: values, must: o.must || [], includeZero: true });
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
    budget = B.create({ learned, available, skills: values, must: o.must || [], includeZero: true });
    // Unvalued must-haves are normally retained by the purchase solver; an unsupported
    // race effect cannot be restored that way.
    const groups = budget.options(o.hints || {}).map(g=>g.filter(x=>!excluded.includes(x.id))).filter(g=>g.length), options = groups.flat();
    const seed = budget.solve(o.hints || {}, o.sp);
    seed.selected=seed.selected.filter(x=>!excluded.includes(x.id));
    excluded.push(...seed.unsupported.filter(id=>!excluded.includes(id)));
    const limit = o.maxEvaluations || 96, cache = new Map();
    let calls = 0, failedSets = 0;
    const evaluate = async selected => {
      const key = ids(selected.map(s => s.id)).join(".");
      if (cache.has(key)) return cache.get(key);
      const spent = selected.reduce((n, x) => n + x.cost, 0);
      if (spent > o.sp) return null;
      const set = ids(learned.concat(selected.map(s => s.id))), satisfied = new Set(learned.concat(selected.flatMap(x => x.required)));
      const required = (o.must || []).map(String).filter(id => satisfied.has(id)).length;
      let result;
      try { result = selected.length ? await o.compare(learned, set, 24, 271828) : summary([0]); }
      catch(error) { if (/cancelled|too long|load|busy/i.test(error.message)) throw error;cache.set(key,null);calls++;failedSets++;return null; }
      const v = { selected: selected.slice(), spent, required, result };
      cache.set(key, v); calls++; if (o.progress) o.progress(Math.min(0.95, calls / limit)); return v;
    };
    const better = (a, b) => a && (!b || a.required > b.required || a.required === b.required && (a.result.mean > b.result.mean + 1e-6 || Math.abs(a.result.mean - b.result.mean) <= 1e-6 && a.spent < b.spent));
    let best = await evaluate(seed.selected), empty = await evaluate([]);
    if (better(empty, best)) best = empty;
    // Grow from empty too, so a standalone ordering cannot fix the answer before interaction
    // tests begin. Retain the additive purchase set as a second starting point.
    const starts = [empty, best].filter(Boolean);
    // Test small pairs as well: an enabling skill can be worthless alone. This also
    // supplies starts beyond the additive solution without claiming an exhaustive search.
    const short = groups.slice().sort((a,b) => Math.max(...b.map(x=>x.L)) - Math.max(...a.map(x=>x.L))).slice(0,8).map(g=>g.slice().sort((a,b)=>b.L/Math.max(1,b.cost)-a.L/Math.max(1,a.cost))[0]);
    for (let i=0;i<short.length;i++) for (let j=i+1;j<short.length && calls<Math.floor(limit/3);j++) {
      const v=await evaluate([short[i],short[j]]); if(better(v,best))best=v;
    }
    starts.push(best);
    for (let pass = 0; pass < 3 && calls < limit; pass++) {
      const centers = pass ? [best] : starts;
      let moved = false;
      for (const center of centers) {
        const candidates = [[], ...center.selected.map(x => center.selected.filter(s => s.id !== x.id))];
        options.slice().sort((a, b) => b.required.length - a.required.length || b.L / Math.max(1,b.cost) - a.L / Math.max(1,a.cost)).forEach(option => {
          const rest = center.selected.filter(x => x.family !== option.family);
          candidates.push(rest.concat(option));
          // A one-for-one exchange can release SP even when the next addition alone won't fit.
          center.selected.forEach(old => { if (old.family !== option.family) candidates.push(rest.filter(x => x.id !== old.id).concat(option)); });
        });
        // Keep candidate order deterministic and alternate small additions with exchanges.
        for (const selected of candidates) {
          if (calls >= limit) break;
          const v = await evaluate(selected);
          if (better(v, best)) { best = v; moved = true; }
        }
      }
      if (pass && !moved) break;
    }
    // Report on a separate seed and a larger sample; a noisy search win can lose this check.
    const finalists = [...cache.values()].filter(Boolean).sort((a, b) => b.required - a.required || b.result.mean - a.result.mean || a.spent - b.spent).slice(0, 3);
    if (!finalists.includes(cache.get(ids(seed.selected.map(s=>s.id)).join(".")))) finalists.push(cache.get(ids(seed.selected.map(s=>s.id)).join(".")));
    best = null;
    for (const x of finalists.filter(Boolean)) {
      const r = await o.compare(learned, ids(learned.concat(x.selected.map(s=>s.id))), 96, 314159);
      const v = Object.assign({}, x, { result: r }); if (better(v, best)) best = v;
    }
    const rows = [];
    for (const x of best.selected) {
      const rest = ids(learned.concat(best.selected.filter(s => s.id !== x.id).map(s=>s.id)));
      const marginal = await o.compare(rest, ids(learned.concat(best.selected.map(s=>s.id))), 96, 314159);
      rows.push(Object.assign({}, x, { marginal, per100: x.cost ? marginal.mean * 100 / x.cost : null }));
    }
    rows.sort((a,b) => (b.per100 || 0) - (a.per100 || 0));
    const ranking = [];
    for (const x of options) {
      const k=ids([x.id]).join("."), cached=cache.get(k);
      const result=cached ? cached.result : preflight.get(x.id);
      ranking.push(Object.assign({},x,{result,per100:x.cost?result.mean*100/x.cost:null}));
    }
    ranking.sort((a,b)=>(b.per100||0)-(a.per100||0));
    return { selected: rows, ranking, spent: best.spent, budget: o.sp, unspent: o.sp - best.spent, result: best.result, excluded,
      unmetMust: (o.must || []).map(String).filter(id => !learned.includes(id) && !best.selected.some(x=>x.required.includes(id))),
      evaluations: calls, failedSets, method: "bounded paired race comparisons", learned };
  }
  const api = { summary, supported, horse, request, runner, load, optimize };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.UmaRaceSkills = api;
})(typeof window !== "undefined" ? window : globalThis);
