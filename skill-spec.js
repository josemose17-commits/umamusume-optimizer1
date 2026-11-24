// The CM & LoH skill optimizer spec's scoring for the Skill optimizer's quick plan, where a
// skill's worth depends on the rest of the set: condition reliability (fragile positional
// triggers), early/mid speed and current-speed bonuses, late-race acceleration's diminishing
// returns and Groundwork's start-count gate, solved with a beam search seeded by the exact
// knapsack (so it never does worse than the additive plan). The race check (race-skills.js)
// uses the spec's variance objective (mean + k x spread) and the reliability factors; the
// mechanics themselves it races for real.
(function (root) {
  "use strict";
  const B = root.UmaSkillBudget || (typeof require !== "undefined" ? require("./skill-budget.js") : null);

  // Calibration defaults (the spec's section 5).
  const DEFAULTS = { kCM: 0.35, kLoH: -0.75, alpha: 0.4, mid: 1.1, current: 1.1, beam: 50 };
  // Fragile triggers: the share of their gain kept (they break the moment the position does).
  const FRAGILE = [[/is_surrounded==1/, 0.65], [/near_count>=/, 0.75], [/behind_near_lane_time>=/, 0.7], [/infront_near_lane_time>=/, 0.7]];
  function reliability(conditions) {
    const text = (conditions || []).join("@");
    return FRAGILE.reduce((k, [re, f]) => (re.test(text) ? k * f : k), 1);
  }
  // A skill's race traits from its simulator entry (data/race-skills*.json): tags 301/302/303
  // early/mid/late race; effect types 27 target speed, 21/22 current speed, 31 acceleration,
  // 9 recovery, 1-5 stats (green); activate_count_start>=N needs N skills fired at the start.
  const SPEED = new Set([27, 21, 22]), CURRENT = new Set([21, 22]), STAT = new Set([1, 2, 3, 4, 5]);
  function traits(entry) {
    if (!entry) return null;
    const alts = entry.alternatives || [], tags = new Set(entry.tags || []);
    const fx = alts.flatMap((a) => (a.effects || []).map((e) => Object.assign({ duration: a.baseDuration || 0 }, e)));
    const types = new Set(fx.map((e) => e.type));
    const conditions = alts.map((a) => [a.precondition, a.condition].filter(Boolean).join("&"));
    const need = conditions.map((c) => /activate_count_start>=(\d+)/.exec(c)).filter(Boolean).map((m) => +m[1]);
    const accel = fx.filter((e) => e.type === 31).reduce((n, e) => n + (e.modifier / 10000) * (e.duration / 10000), 0);
    return {
      early: tags.has(301), mid: tags.has(302), late: tags.has(303),
      speed: [...types].some((t) => SPEED.has(t)), current: [...types].some((t) => CURRENT.has(t)),
      accel, green: types.size > 0 && [...types].every((t) => STAT.has(t)), heal: types.has(9),
      needStart: need.length ? Math.max(...need) : 0, reliability: reliability(conditions),
    };
  }
  // Fires at the race start (counts toward Groundwork): green skills and early-race skills.
  const atStart = (t) => !!t && (t.green || t.early);

  // A set's spec value. ids: the bought skills (top tiers); base: { id: L }; info: { id: traits };
  // learned: skills she has (they count toward Groundwork). cfg: { alpha, mid, current }.
  // Late accelerations count in order of their own value, each scaled by 1 / (1 + alpha x A),
  // A the acceleration already counted (m/s^2 x s).
  function setValue(ids, base, info, learned, cfg) {
    const c = Object.assign({}, DEFAULTS, cfg || {});
    const starts = (learned || []).concat(ids).filter((id) => atStart(info[id])).length;
    const own = (id) => {
      const t = info[id], v = base[id] || 0;
      if (!t) return v;
      let k = t.reliability;
      if (t.speed && (t.early || t.mid)) k *= c.mid;
      else if (t.current && t.late) k *= c.current;
      return v * k;
    };
    let total = 0, A = 0;
    const per = {};
    const lateAccel = ids.filter((id) => info[id] && info[id].late && info[id].accel > 0).sort((a, b) => own(b) - own(a));
    ids.filter((id) => !lateAccel.includes(id)).forEach((id) => {
      const t = info[id];
      per[id] = t && t.needStart && starts - (atStart(t) ? 1 : 0) < t.needStart ? 0 : own(id);
    });
    lateAccel.forEach((id) => {
      const t = info[id];
      const gated = t.needStart && starts - (atStart(t) ? 1 : 0) < t.needStart;
      per[id] = gated ? 0 : own(id) / (1 + c.alpha * A);
      if (!gated) A += t.accel;
    });
    Object.values(per).forEach((v) => { total += v; });
    return { total, per };
  }

  // The spec's beam search over the shop's choice groups (one option per skill family: its
  // tiers priced together), keeping the best `width` partial sets by spec value, plus the exact
  // knapsack's set (additive values) as a seed. o: { learned, available, hints, sp, fast, values,
  // info, cfg, metadata }. Returns skill-budget's solve() shape with spec: { value, per, seeded }.
  function solve(o) {
    const c = Object.assign({}, DEFAULTS, o.cfg || {});
    const budget = B.create({ learned: o.learned, available: o.available, skills: o.values, fastLearner: o.fast, metadata: o.metadata });
    const groups = budget.options(o.hints || {});
    const sp = Math.max(0, Math.floor(+o.sp || 0));
    const value = (sel) => setValue(sel.map((x) => x.id), o.values, o.info, o.learned, c).total;
    // Groups with the biggest options first, so the beam keeps the strong families early.
    const order = groups.slice().sort((a, b) => Math.max(...b.map((x) => x.value)) - Math.max(...a.map((x) => x.value)));
    let beam = [{ sel: [], spent: 0, v: 0 }];
    for (const g of order) {
      const next = beam.slice();
      beam.forEach((s) => g.forEach((x) => {
        if (s.spent + x.cost > sp) return;
        const sel = s.sel.concat(x);
        next.push({ sel, spent: s.spent + x.cost, v: value(sel) });
      }));
      next.sort((a, b) => b.v - a.v || a.spent - b.spent);
      const seen = new Set();
      beam = next.filter((s) => { const k = s.sel.map((x) => x.id).sort().join("."); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, c.beam);
    }
    const exact = budget.solve(o.hints || {}, sp);
    const seed = { sel: exact.selected, spent: exact.spent, v: value(exact.selected) };
    let best = beam[0] || seed, seeded = false;
    if (seed.v > best.v + 1e-9 || (Math.abs(seed.v - best.v) <= 1e-9 && seed.spent < best.spent)) { best = seed; seeded = true; }
    const ids = best.sel.map((x) => x.id), sv = setValue(ids, o.values, o.info, o.learned, c);
    return { budget: sp, spent: best.spent, unspent: sp - best.spent, selected: best.sel, L: best.sel.reduce((n, x) => n + x.L, 0), value: best.sel.reduce((n, x) => n + x.value, 0),
      unmetMust: [], offered: [...new Set(groups.flat().map((x) => x.id))], unsupported: exact.unsupported,
      spec: { value: sv.total, per: sv.per, seeded, exactValue: seed.v, width: c.beam } };
  }

  // The race check's objective: a set's gain (mean) plus k times its race-to-race spread. CM
  // (k > 0) favours upside that wins races; LoH (k < 0) favours steady placings.
  const objective = (r, k) => (r ? r.mean + (k || 0) * (r.sd || 0) : -Infinity);
  const kFor = (kind, cfg) => { const c = Object.assign({}, DEFAULTS, cfg || {}); return kind === "loh" ? c.kLoH : c.kCM; };

  const api = { DEFAULTS, FRAGILE, reliability, traits, setValue, solve, objective, kFor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaSkillSpec = api;
})(typeof window !== "undefined" ? window : globalThis);
