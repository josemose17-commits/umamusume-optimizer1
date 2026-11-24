// Deck optimizer: simulates careers with a deck and searches for the best 6 cards you own.
//
// Each simulated career walks the scenario's turns. Every turn, each card shows up on one of the
// five trainings (or none), weighted by its specialty priority, and the trainee takes the
// training worth most for the build. Gains use the same card formula as the turn coach
// (deck.js), so friendship trainings, training effectiveness, mood effect, stat bonuses and
// conditional unique effects all count. Grand Concert race comparisons select affordable
// final skill sets using median L from alpha123's Umalator on the chosen course. Other
// comparisons retain the earlier expected skill-surplus heuristic.
(function (root) {
  const D = root.UmaDeck || (typeof require !== "undefined" ? require("./deck.js") : null);
  const E = root.UmaEngine || (typeof require !== "undefined" ? require("./engine.js") : null);
  const H = root.UmaLightHello || (typeof require !== "undefined" ? require("./light-hello.js") : null);
  const GC = root.UmaGrandConcert || (typeof require !== "undefined" ? require("./grand-concert.js") : null);
  const SkillEvents = root.UmaSkillEvents || (typeof require !== "undefined" ? require("./skill-events.js") : null);
  const SkillBudget = root.UmaSkillBudget || (typeof require !== "undefined" ? require("./skill-budget.js") : null);
  const SupportEvents = root.UmaSupportEvents || (typeof require !== "undefined" ? require("./support-events.js") : null);
  const GMs = root.UmaGrandMasters || (typeof require !== "undefined" ? require("./grand-masters.js") : null);
  // Grand Masters (GameTora's scenario guide; the drop chances are estimates): each goddess
  // level's training bonus, Red's energy discount, the year-end races (after turns 24, 48, 72:
  // all stats +10/+15/+20 and SP, Darley's SP and Turk's random stats when her level is at least
  // the year) and the Grand Masters race (+20 all, +80 SP).
  const GM_TRAIN = [0, 5, 8, 11, 13, 15], GM_CUT = [0, 10, 15, 18, 20, 23];
  const GM_YEAR = { 24: [1, 10, 50, 20], 48: [2, 15, 60, 30], 72: [3, 20, 70, 45] };
  // A plain action drops one fragment, sometimes two; a friendship training two (Wit rarely);
  // a goal race two. Each fragment held adds about 1 to a stat the training gives (crystals more):
  // about 0.6 per fragment to the main stat and 0.3 to SP, on average over fragment types.
  const GM_DOUBLE = 0.1, GM_WIT_DOUBLE = 0.1, GM_FRAG_MAIN = 0.6, GM_FRAG_SP = 0.3;
  const STATS = ["speed", "stamina", "power", "guts", "wit"];
  const SP_VALUE = 0.35;
  // Value points per length (L) of race gain. Roughly what 1 L of speed stat costs, and in line
  // with SP_VALUE: an average skill buys about 0.5 L per 100 SP.
  const L_VALUE = 60;
  // Cost discount from hint levels 1-5.
  const HINT_DISCOUNT = [0, 0.1, 0.2, 0.3, 0.35, 0.4];
  const HINT_CHANCE = 0.075; // chance per card per training it is on (before Hint Frequency)
  const ABSENT_WEIGHT = 50; // weight of "not at any training" when cards are dealt
  const RACE_SHARE = 0.1; // share of turns spent on optional races
  const RACE_SHARE_BY_SCENARIO = { trackblazer: 0.35, grandlive: 0 }; // race-driven scenarios
  const RACE_REWARD = { stats: 8, sp: 40 }; // per race; scaled by the deck's Race Bonus
  const EVENT_STATS = 120; // stats per stat from random events over a career, about the same for any deck

  // Inheritance, from her family's blue sparks (family.js's rules): each member's spark gives
  // +5/+12/+21 (1-3 stars) at the start, and at each inspiration (Classic and Senior, early
  // April: turns 31 and 55) fires at 70/80/90% x (1 + that member's affinity / 100), for 1 to
  // 10/16/28 points. members: [{ blue: [stat index, stars], aff, scale }] (scale: 1, grandparents
  // too). Pink sparks change aptitudes, not training, so they don't enter the career.
  const INSPIRATION_TURNS = [31, 55];
  const START_BLUE = [5, 12, 21], BLUE_P = [0.7, 0.8, 0.9], BLUE_MOST = [10, 16, 28];
  function inheritFrom(members) {
    const start = [0, 0, 0, 0, 0], sparks = [];
    (members || []).forEach((m) => {
      const b = m && m.blue, st = b ? Math.max(0, Math.min(3, +b[1] || 0)) : 0;
      if (!st || !(b[0] >= 0 && b[0] < 5)) return;
      start[b[0]] += START_BLUE[st - 1];
      sparks.push({ i: +b[0], p: Math.min(1, BLUE_P[st - 1] * (1 + Math.max(0, +m.aff || 0) / 100) * (m.scale == null ? 1 : m.scale)), most: BLUE_MOST[st - 1] });
    });
    return sparks.length ? { start, sparks } : null;
  }

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  function grandConcertCalendar(opts) {
    const sc = opts.scenario;
    const state = { goals: [], deck: { trainee: opts.trainee || null, slots: [] } };
    const goals = E.traineeGoals(state, sc);
    const fixed = new Map(goals.filter(g => g.forced).map(g => [g.turn, g]));
    const finale = new Map([74, 76, 78].map((t,i) => [t, i]));
    const races = (D.DATA && D.DATA.races) || [];
    return Array.from({length: sc.totalTurns}, (_,i) => {
      const turn = i + 1;
      if (finale.has(turn)) return {turn, kind:"race", finale:true, statsEach:10, statCount:5, sp:[40,60,80][finale.get(turn)], energy:0};
      const g = fixed.get(turn);
      if (!g) return {turn, kind:"free"};
      const debut = turn === 12 || (g.races || []).some(n => /Debut/.test(n));
      const race = races.find(r => r.t === turn && (g.races || []).includes(r.n));
      const grade = race ? race.g : 100;
      return {turn, kind:"race", finale:false, statsEach:3, statCount:debut?3:grade===100?5:4,
        sp:debut?30:grade===100?45:35, energy:0};
    });
  }

  function buildCtx(opts) {
    const sc = opts.scenario;
    const b = E.BUILDS[opts.build] || E.BUILDS.medium;
    const target = Object.assign({}, b.target, opts.buildTarget || {}, opts.target || {});
    const caps = {};
    STATS.forEach((s, i) => { caps[s] = (opts.caps && opts.caps[s]) || sc.caps[i]; });
    const forced = E.forcedTurns({ goals: [] }, sc);
    const last = sc.finale && sc.finale.forced && sc.finale.turns.length ? Math.min.apply(null, sc.finale.turns) - 1 : Math.min(72, sc.totalTurns);
    const turns = [];
    for (let t = 1; t <= Math.max(last, 1); t++) if (!forced.has(t)) turns.push(t);
    const calendar = sc.id === "grandlive" ? grandConcertCalendar(opts) : null;
    if (calendar) { turns.length = 0; calendar.forEach(day => turns.push(day.turn)); }
    const race = raceOn(opts, target, caps);
    const camp = new Set(E.campTurns(sc));
    // Grand Concert and Grand Masters run their own mechanics; the rest a flat scenario boost.
    const boost = sc.id === "grandlive" || (sc.id === "grandmasters" && GMs && opts.gmModel !== false) ? 1 : E.scenarioBoost({ fcal: [] }, sc);
    const t = opts.trainee ? D.trainee(opts.trainee) : null;
    return {
      sc, w: b.w, target, caps, turns, camp, boost, calendar,
      growth: t ? t.g : [0, 0, 0, 0, 0],
      start: t && t.b ? t.b.slice(0, 5) : [100, 100, 100, 100, 100],
      // Her parents' blue sparks (inheritFrom): start stats, and per inspiration each spark's
      // chance to fire and the most it gives (1 to max points, at random).
      inherit: opts.inherit || null,
      // A per-career skill purchase to use instead of the exact knapsack (the finalists' recheck:
      // the Skill optimizer's spec scoring): (ctx, hint levels, sp) -> a solve()-shaped plan.
      specPurchase: opts.specPurchase || null,
      skills: opts.skills || {}, // skill id -> median L on the chosen course and style
      costs: opts.costs || {}, // skill id -> skill point cost, for skills deck.js doesn't know
      raceShare: opts.raceShare != null ? opts.raceShare : (RACE_SHARE_BY_SCENARIO[sc.id] != null ? RACE_SHARE_BY_SCENARIO[sc.id] : RACE_SHARE),
      skillWeight: opts.skillWeight != null ? opts.skillWeight : 1,
      known: new Set((t ? [].concat(t.us || [], t.is || [], t.as || []) : []).map(String)),
      learned: new Set((t ? t.us || [] : []).map(String)),
      available: (t ? [].concat(t.is || [], t.as || []) : []).map(String),
      // SP-limited skill purchases per simulated career (skill-budget.js): Grand Concert, and race
      // scoring in every scenario (stats and skills both in lengths).
      skillBudget: (sc.id === "grandlive" || !!race) && opts.skillBudget !== false,
      coupledEvents: sc.id === "grandlive" && opts.coupledEvents !== false,
      gmModel: sc.id === "grandmasters" && !!GMs && opts.gmModel !== false,
      // Buy golds first in each career (skill-budget.js) where full-field races showed it pays.
      goldsFirst: !!opts.goldsFirst,
      runs: opts.runs || 10,
      seed: opts.seed || 12345,
      helloProcRate: opts.helloProcRate != null ? Math.max(0, Math.min(1, +opts.helloProcRate)) : 0.4,
      helloUnlockRate: opts.helloUnlockRate != null ? Math.max(0, Math.min(1, +opts.helloUnlockRate)) : 0.15,
      eventSuccessRate: opts.eventSuccessRate == null ? 0.5 : Math.max(0, Math.min(1, +opts.eventSuccessRate)),
      eventSongBoost: opts.eventSongBoost == null ? 0 : Math.max(0, Math.min(0.5, +opts.eventSongBoost)),
      must: (opts.must || []).map(String),
      independent: !!opts.independent,
      // Race values (raceValuesFor): finished stats are scored in lengths on the cup's course
      // for her style, unless you typed your own targets (then the targets decide, as before).
      race,
      userTarget: !!(opts.target && STATS.some((s) => opts.target[s] > 0)),
    };
  }

  // ---- Race value: finished stats in lengths (data/stat-curves.js) ----
  // Each stat's L across its range on the cup's course for her style, measured one stat at a time
  // in the race simulator (tools/build_stat_curves.js): no skills, Normal mood, against the cup's
  // stat line. Between grid points the value is a straight line; past the ends it continues the
  // last segment. The CM deck aligns the stamina curve with its measured target; callers with
  // only the reference curves can still supply a fixed margin.
  // The five are added up (checked against whole stat lines). Stamina-showdown cups were measured
  // on their JP-dated simulator, where stamina past a full spurt still counts (showdown). Cups
  // without course data have no curves (null): targets decide there.
  const STAMINA_MARGIN = 100;
  function raceValuesFor(data, cupId, style) {
    const cup = data && data.cups && data.cups[cupId];
    const v = cup && cup.status === "ok" && cup.styles && cup.styles[style];
    if (!v || v.status !== "ok" || !v.curves) return null;
    return { cup: cupId, style, curves: v.curves, need: v.base.need, showdown: !!v.showdown, steps: v.steps || [], base: v.base };
  }
  // Course stat thresholds (data/stat-curves.js steps): her speed bonus jumps when a stat the
  // course lists passes 300, 600 or 900. The curves are stored without them, so each step counts
  // here by her absolute stat, against the cup's line. → L.
  const CURVE_KEYS = ["speed", "stamina", "power", "guts", "wisdom"];
  function stepL(r, i, x) {
    if (!r || !r.steps || !r.steps.length) return 0;
    const line = r.base ? r.base[CURVE_KEYS[i]] : null;
    let d = 0;
    for (const s of r.steps) if (s[0] === i) d += (x >= s[1] - 0.5 ? s[2] : 0) - (line != null && line >= s[1] ? s[2] : 0);
    return d;
  }
  // Use race scoring when the curves exist and the build can meet the spurt estimate.
  // Explicit stat targets or a cap below the estimate use target fit instead.
  function raceOn(opts, target, caps) {
    const r = opts.raceValues;
    if (!r || opts.target && STATS.some((s) => opts.target[s] > 0)) return null;
    const need = r.staminaTarget ?? r.need + (r.staminaMargin ?? STAMINA_MARGIN);
    const usable = r.staminaTarget == null ? target.stamina : Math.min(target.stamina, caps.stamina);
    return need <= usable + 1 ? r : null;
  }
  function onCurve(pts, x, flatTop) {
    const n = pts.length;
    if (n === 1) return pts[0][1];
    let i = 1;
    while (i < n - 1 && x > pts[i][0]) i++;
    if (x >= pts[n - 1][0] && flatTop) return pts[n - 1][1];
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  // L of a stat line against the cup's line (only differences between decks matter).
  function raceL(ctx, stats) {
    const r = ctx.race;
    let L = 0;
    for (let i = 0; i < 5; i++) {
      const x = Math.max(0, +stats[i] || 0);
      // Stamina stops counting past a full spurt, except with stamina showdown (JP-dated cups over
      // 2100 m), where its curve runs to 2000.
      L += (i === 1 ? staminaL(r, x) : onCurve(r.curves[i], x, false)) + stepL(r, i, x);
    }
    return L;
  }
  function staminaL(r, raw) {
    const curve = r.curves[1];
    if (r.staminaTarget == null) {
      return onCurve(curve, raw - (r.staminaMargin ?? STAMINA_MARGIN), true);
    }
    // Align the shortfall curve with the measured spurt threshold. Above it, keep the
    // raw-stat showdown gains at their original stamina breakpoints.
    const x = Math.min(raw, r.staminaTarget) - r.staminaTarget + r.need;
    const showdown = r.showdown && raw > r.staminaTarget
      ? onCurve(curve, raw, true) - onCurve(curve, r.staminaTarget, true) : 0;
    return onCurve(curve, x, true) + showdown;
  }
  // The stat part of a deck's score from its simulated careers (s: simulate's result), with each
  // career's own value (for the noise check). Race values when the cup has them and you set no
  // targets; otherwise target fit, as before.
  function deckFit(ctx, s) {
    const finals = s.finals || [];
    if (ctx.race && !ctx.userTarget) {
      const per = finals.map((f) => raceL(ctx, f.stats) * L_VALUE + (ctx.skillBudget ? 0 : f.sp * SP_VALUE));
      const short = targetFit(ctx, s.stats, s.sp).short;
      const value = per.length ? per.reduce((a, b) => a + b, 0) / per.length : raceL(ctx, s.stats) * L_VALUE;
      return { value, short, L: value / L_VALUE, careers: per, scoring: "race" };
    }
    const fit = targetFit(ctx, s.stats, s.sp);
    return Object.assign(fit, { careers: finals.map((f) => targetFit(ctx, f.stats, f.sp).value), scoring: "targets" });
  }

  // Independent Training's Training Focus, as uma.guide describes it: Balanced gives every stat
  // the same priority; Stamina and Sprint give "slightly more priority" to Stamina and to Power.
  // The game doesn't say how much: FOCUS_LEAN is an estimate. Balanced uses one weight and one
  // target (the build's averages) for all five stats.
  const FOCUS_LEAN = 1.25;
  function applyFocus(ctx, focus) {
    const avg = (o) => STATS.reduce((n, s) => n + o[s], 0) / STATS.length;
    const w = avg(ctx.w), t = Math.round(avg(ctx.target));
    ctx.w = {}; ctx.target = Object.assign({}, ctx.target);
    STATS.forEach((s) => { ctx.w[s] = w; ctx.target[s] = t; });
    const lean = focus === "stamina" ? "stamina" : focus === "sprint" ? "power" : null;
    if (lean) ctx.w[lean] = w * FOCUS_LEAN;
    return ctx;
  }

  // Marginal value of one point of a stat at x: the turn coach's pointValue, plus a "need"
  // factor so a stat far below its target (stamina for a long race, say) counts for more.
  const NEED = 1.5;
  function pointValue(ctx, s, x) {
    if (x >= ctx.caps[s]) return 0;
    let k = ctx.w[s];
    if (x >= 1200) k *= 0.5;
    if (x >= ctx.target[s]) k *= 0.4;
    else k *= 1 + NEED * (1 - x / ctx.target[s]);
    return k;
  }

  // Training past 1200 gives half (July 2026 update).
  function trained(x, g) {
    if (!(g > 0)) return g;
    if (x >= 1200) return g / 2;
    return x + g <= 1200 ? g : (1200 - x) + (x + g - 1200) / 2;
  }

  // Total value of a stat line: pointValue integrated from 0 (in steps of 10 points).
  function statsValue(ctx, x) {
    let v = 0;
    STATS.forEach((s, i) => { for (let at = 0; at < x[i]; at += 10) v += Math.min(10, x[i] - at) * pointValue(ctx, s, at + 5); });
    return v;
  }

  // Effects of a card in a situation, memoised: the same few situations repeat every turn.
  function makeEffects() {
    const memo = new Map();
    const dependencies = new Map();
    return (m, sit) => {
      const cardKey = m.card.id + "|" + m.level;
      if (!dependencies.has(cardKey)) dependencies.set(cardKey, D.conditionalUniques(m.card, m.level));
      const unique = dependencies.get(cardKey);
      const dynamic = unique.map((u) => {
        if (u.type === 101 || u.type === 102) return m.bond >= u.value ? 1 : 0;
        if (u.type === 107 || u.type === 114) return sit.energy;
        if (u.type === 108) return sit.maxEnergy;
        if (u.type === 109) return Math.floor(sit.totalBond / u.value_1);
        return "";
      }).join(":");
      const key = cardKey + "|" + dynamic + "|" + sit.facStat + "|" + sit.members + "|" + sit.facilityLevel + "|" + (sit.rainbow ? 1 : 0);
      let e = memo.get(key);
      if (!e) {
        e = D.effectsIn(m.card, m.level, Object.assign({ bond: m.bond }, sit));
        memo.set(key, e);
      }
      return e;
    };
  }

  // Same formula as deck.js trainingGain, using memoised effects.
  function gain(ctx, fx, row, facStat, members, L, mood) {
    const n = members.length;
    let fm = 1, te = 0, me = 0, sp = 0, all = 0, failMult = 1, costDown = 0, witRec = 0;
    const bonus = [0, 0, 0, 0, 0];
    let anyRainbow = false;
    const gm = ctx.gmTurn;
    const rainbowOf = (m) => (gm && gm.yellow) || D.isRainbow(m.card, m.bond, facStat);
    for (let k = 0; k < n; k++) if (rainbowOf(members[k])) { anyRainbow = true; break; }
    let rainbows = 0;
    for (let k = 0; k < n; k++) {
      const m = members[k];
      const eff = fx(m, { facStat, members: n, facilityLevel: L, energy: ctx.energy != null ? ctx.energy : 60, maxEnergy: ctx.maxEnergy || 100, deckTypes: ctx.deckTypes, totalBond: ctx.totalBond != null ? ctx.totalBond : 300, rainbow: anyRainbow });
      if (rainbowOf(m)) { fm *= 1 + (eff[1] || 0) / 100; rainbows++; if (facStat === "wit") witRec += eff[31] || 0; }
      if (eff[27]) failMult *= 1 - eff[27] / 100;
      costDown += eff[28] || 0;
      te += eff[8] || 0; me += eff[2] || 0; sp += eff[30] || 0; all += eff[41] || 0;
      for (let i = 0; i < 5; i++) bonus[i] += eff[3 + i] || 0;
    }
    const moodCoef = [-0.2, -0.1, 0, 0.1, 0.2][mood];
    const moodMult = 1 + (moodCoef > 0 ? moodCoef * (1 + me / 100) : moodCoef);
    if (rainbows && ctx.live) fm *= 1 + ctx.live.friendship / 100;
    const common = fm * moodMult * (1 + te / 100) * (1 + 0.05 * n) * (gm ? 1 + gm.te / 100 : 1);
    const mainIdx = STATS.indexOf(facStat);
    const out = [0, 0, 0, 0, 0];
    for (let i = 0; i < 5; i++) {
      const b = row[i];
      if (!(b > 0)) continue;
      const lvAdd = i === mainIdx ? L - 1 : Math.floor((L - 1) / 2);
      // The game caps one training's gain per stat at 100; scenario bonuses come on top.
      out[i] = Math.min(100, Math.floor((b + lvAdd + bonus[i] + all) * common * (1 + (ctx.growth[i] || 0) / 100))) * ctx.boost + (ctx.live && i === mainIdx ? ctx.live.extra[i] : 0) + (gm && i === mainIdx ? gm.frag * GM_FRAG_MAIN : 0);
    }
    const baseEnergy = row[6] - 1.5 * (L - 1);
    const energy = row[6] < 0 ? Math.floor(baseEnergy * Math.max(0, 1 - costDown / 100) * (gm ? 1 - gm.cut / 100 : 1)) : row[6] + witRec;
    return { g: out, sp: Math.floor((row[5] + sp) * common) * ctx.boost + (ctx.live ? ctx.live.extraSp : 0) + (gm ? gm.frag * GM_FRAG_SP : 0), rainbows, energy, failMult };
  }

  // Simulates `runs` careers with these cards. cards: [{ card, lb }].
  function simulate(ctx, cards) {
    ctx = Object.assign({}, ctx);
    const inputCards = cards.slice();
    cards = cards.slice().sort((a,b) => Number(a.card.id) - Number(b.card.id) || Number(a.lb) - Number(b.lb));
    const fx = makeEffects();
    const deck = cards.map((c) => {
      const level = D.levelFor(c.card, c.lb);
      const base = D.baseEffects(c.card, level);
      const spec = c.card.ty === "friend" || c.card.ty === "group" ? 0 : (base[19] || 0);
      const hello = ctx.sc.id === "grandlive" ? H.profile(c.card, c.lb) : null;
      const support = ctx.coupledEvents && !hello ? SupportEvents.profile(c.card, c.lb) : null;
      return { card: c.card, level, base, spec, hello, support, init: D.initialBond(c.card, level), ev: hello || support && support.mode === "coupled" ? { stats: [0, 0, 0, 0, 0], sp: 0, energy: 0, bond: 0 } : D.eventRewards(c.card), hintRate: HINT_CHANCE * (1 + (base[18] || 0) / 100), hintLv: 1 + (base[17] || 0) };
    });
    ctx.deckTypes = new Set(deck.map((d) => d.card.ty)).size;
    // Cards' starting bonuses: Initial Speed..Wit (effects 9-13) and Initial Skill Points (32).
    const initial = [0, 0, 0, 0, 0];
    let initialSp = 0;
    deck.forEach((d) => { for (let i = 0; i < 5; i++) initial[i] += d.base[9 + i] || 0; initialSp += d.base[32] || 0; });
    const raceBonus = deck.reduce((a, d) => a + (d.base[15] || 0), 0);
    const R = ctx.runs;
    let total = 0, spTotal = 0, rainbowTotal = 0;
    const statSum = [0, 0, 0, 0, 0];
    // Each career's final stats and skill points, for chances like reaching SS.
    const finals = [];
    const hints = deck.map(() => 0);
    const bondAt = deck.map(() => 0);
    const train = [0, 0, 0, 0, 0];
    let rests = 0, races = 0, fails = 0, requiredRaces = 0, outings = 0, recreations = 0;
    const liveTotals = { songs: 0, techniques: 0, greatConcerts: 0, lessonEnergy: 0, helloTokens: 0, helloEvents: 0, helloTrainings: 0, helloOutings: 0, helloEnergyRecovered: 0, helloEnergyWasted: 0, helloEnergySaved: 0, helloCompletions: 0, helloUnlocks: 0, lyrics: 0, special: 0 };
    const earnedTokens = [0, 0, 0, 0, 0], spentTokens = [0, 0, 0, 0, 0], finalTokens = [0, 0, 0, 0, 0];
    const helloSkillEvents = new Map();
    const eventExposures = [];
    const careers = [];
    const supportTotals = deck.map(() => ({ events: 0, complete: 0, ended: 0, s: [0, 0, 0, 0, 0], sp: 0, energy: 0, wastedEnergy: 0, b: 0, wastedBond: 0, me: 0, mo: 0 }));
    const purchase = ctx.skillBudget ? SkillBudget.create({ skills: ctx.skills, costs: ctx.costs, learned: ctx.learned, available: ctx.available, must: ctx.must, goldsFirst: !!ctx.goldsFirst, lengthValue: L_VALUE, spValue: SP_VALUE }) : null;
    const eventCtx = purchase ? Object.assign({}, ctx, { known: ctx.learned, must: ctx.must.filter((id) => !ctx.available.includes(id)), eventUtility: purchase.hintUtility, eventUtilityKey: purchase.key }) : ctx;
    const scheduled = new Map((ctx.calendar || []).map(day => [day.turn, day]));
    const gmTotals = { wisdoms: 0, red: 0, blue: 0, yellow: 0 };
    for (let run = 0; run < R; run++) {
      const runHints = deck.map(() => 0);
      const runLevels = {}, trainingLevels = deck.map(() => ({})), eventLevels = deck.map(() => ({})), eventTrace = [];
      const trainingRand = deck.map((d) => rng(((ctx.seed + run * 7919) ^ Math.imul(+d.card.id, 2654435761)) ^ 0x19e7d31));
      const support = deck.map((d) => d.support ? SupportEvents.create(d.support, { days: ctx.turns.length, success: ctx.eventSuccessRate, songBoost: ctx.eventSongBoost, independent: ctx.independent, seed: (ctx.seed + run * 7919) ^ Math.imul(+d.card.id, 2654435761) }) : null);
      const addHint = (k, id, lv, kind) => {
        id = String(id); const dst = kind === "training" ? trainingLevels[k] : eventLevels[k];
        dst[id] = Math.min(5, (dst[id] || 0) + lv); runLevels[id] = Math.min(5, (runLevels[id] || 0) + lv);
      };
      const rand = rng(ctx.seed + run * 7919);
      const inh = ctx.inherit, inhRand = inh ? rng(((ctx.seed + run * 7919) ^ 0x5a17c3) >>> 0) : null, inhDone = new Set();
      const x = ctx.start.map((v, i) => Math.min(ctx.caps[STATS[i]], v + initial[i] + (inh ? inh.start[i] || 0 : 0)));
      let sp = 120 + initialSp;
      let energy = 100;
      let maxEnergy = 100;
      let mood = ctx.sc.id === "grandlive" ? 2 : 4;
      let typ = 0;
      const bond = deck.map((d) => d.init);
      const count = [0, 0, 0, 0, 0];
      const eventRand = rng((ctx.seed + run * 7919) ^ 0x537f82);
      const live = ctx.sc.id === "grandlive" ? GC.create(ctx, rng((ctx.seed + run * 7919) ^ 0x68e31d)) : null;
      const hello = deck.map((d) => d.hello ? { p: d.hello, met: false, metTurn: 0, unlocked: false, done: 0, hints: {} } : null);
      ctx.live = live && live.state;
      // Grand Masters: fragments held, goddess levels, and this turn's Wisdom (gmTurn, read by gain()).
      const gmS = ctx.gmModel ? { held: 0, levels: { red: 0, blue: 0, yellow: 0 }, wisdoms: 0 } : null;
      let gmUsed = false, gmDrop = 0;
      ctx.gmTurn = null;
      const gmEnd = (turn) => {
        if (!gmS) return;
        if (turn >= 3 && !gmUsed) {
          const n = gmDrop || (rand() < GM_DOUBLE ? 2 : 1);
          gmS.held += gmS.held >= 8 ? 0 : gmS.held === 7 ? 1 : n;
        }
        const y = GM_YEAR[turn];
        if (y) {
          const [year, all, spv, darley] = y, lv = gmS.levels;
          for (let i = 0; i < 5; i++) x[i] = Math.min(ctx.caps[STATS[i]], x[i] + all + (lv.yellow >= year ? 2 * year : 0));
          sp += spv + (lv.red >= year ? darley : 0);
        }
      };
      const applyEvent = (event) => {
        if (event.me) maxEnergy = Math.max(1, maxEnergy + event.me);
        for (let i = 0; i < 5; i++) if ((event.s || [])[i]) x[i] = Math.max(0, Math.min(ctx.caps[STATS[i]], x[i] + event.s[i]));
        sp = Math.max(0, sp + (event.sp || 0));
        const before = energy;
        energy = Math.max(0, Math.min(maxEnergy, energy + (event.e || 0)));
        mood = Math.max(0, Math.min(4, mood + (event.mo || 0)));
        return energy - before;
      };
      const finishTurn = (turn) => {
        gmEnd(turn);
        if (!live) return;
        support.forEach((model, k) => {
          if (!model || model.profile.mode !== "coupled") return;
          const lambda = (typ || 25) / 52;
          const skillValue = (levels) => (purchase ? ctx.skillWeight * purchase.hintUtility(levels) : Object.keys(levels).reduce((n, id) => n + (ctx.known.has(id) ? 0 : Math.max(0, ctx.skills[id] || 0) * L_VALUE), 0)) + ctx.must.filter((id) => levels[id] && !ctx.known.has(id)).length * 10000;
          model.tick(turn, live.state.eventLevel, {
            levels: runLevels, skillValue,
            rewardValue: (event) => {
              let value = event.sp * SP_VALUE;
              for (let i = 0; i < 5; i++) value += Math.max(-x[i], Math.min(ctx.caps[STATS[i]] - x[i], event.s[i])) * pointValue(ctx, STATS[i], x[i]);
              event.random.forEach((g) => { value += g.count / 5 * STATS.reduce((n, s, i) => n + Math.min(ctx.caps[s] - x[i], g.amount) * pointValue(ctx, s, x[i]), 0); });
              value += (Math.max(0, Math.min(maxEnergy + event.me, energy + event.e)) - energy) * lambda;
              value += event.me * 0.2 + (Math.max(0, Math.min(4, mood + event.mo)) - mood) * 0.1 * (typ || 25) * Math.min(10, 79 - turn);
              const change = Math.max(0, Math.min(100, bond[k] + event.b)) - bond[k];
              value += change * (bond[k] < 80 ? 0.3 + 1.2 * Math.max(0, 1 - turn / 50) : 0.05);
              return value;
            },
            apply: (record) => {
              const beforeStats = x.slice(), beforeBond = bond[k], beforeSp = sp;
              record.before = { stats: x.slice(), sp, energy, maxEnergy, mood, bond: bond[k] };
              const recovered = applyEvent(record.reward);
              bond[k] = Math.max(0, Math.min(100, bond[k] + record.reward.b));
              Object.entries(record.reward.h).forEach(([id, lv]) => addHint(k, id, lv, "event"));
              const credited = { s: x.map((v, i) => v - beforeStats[i]), sp: sp - beforeSp, energy: recovered, b: bond[k] - beforeBond, me: maxEnergy - record.before.maxEnergy, mo: mood - record.before.mood };
              const total = supportTotals[k]; total.events++; total.sp += credited.sp; total.energy += recovered; total.b += credited.b;
              total.wastedEnergy += Math.max(0, record.reward.e - recovered); total.wastedBond += Math.max(0, record.reward.b - credited.b);
              total.me += credited.me; total.mo += credited.mo;
              credited.s.forEach((n, i) => { total.s[i] += n; });
              record.after = { stats: x.slice(), sp, energy, maxEnergy, mood, bond: bond[k] };
              eventTrace.push(Object.assign({}, record, { credited }));
            }
          });
        });
        hello.forEach((h, k) => {
          if (!h || !h.met || h.unlocked || h.metTurn >= turn || bond[k] < 60) return;
          if (eventRand() < ctx.helloUnlockRate) { h.unlocked = true; applyEvent(h.p.unlock); bond[k] = Math.min(100, bond[k] + h.p.unlock.b); liveTotals.helloUnlocks++; }
        });
        live.shop(turn, energy, maxEnergy, applyEvent);
        live.end(turn, applyEvent);
        if (turn === 24) deck.forEach((d, k) => { bondAt[k] += bond[k]; });
      };
      // Only incomplete/special-card aggregate fallbacks remain spread estimates.
      // Fully parsed ordinary cards have zero aggregate rewards and fire in finishTurn.
      const eventBond = deck.map((d) => d.ev.bond / Math.max(1, ctx.turns.length * 0.6));
      const evStats = [0, 0, 0, 0, 0];
      let evSp = 0, evEnergy = 0;
      deck.forEach((d) => {
        const up = 1 + (d.base[26] || 0) / 100;
        for (let i = 0; i < 5; i++) evStats[i] += d.ev.stats[i] * up;
        evSp += d.ev.sp * up;
        evEnergy += d.ev.energy * (1 + (d.base[25] || 0) / 100);
      });
      for (let ti = 0; ti < ctx.turns.length; ti++) {
        const turn = ctx.turns[ti];
        // Inheritance's two inspirations (Classic and Senior, early April): each blue spark fires
        // at its chance and gives 1 to its most points (inheritFrom).
        if (inh) INSPIRATION_TURNS.forEach((at) => {
          if (turn < at || inhDone.has(at)) return;
          inhDone.add(at);
          inh.sparks.forEach((b) => { if (inhRand() < b.p) x[b.i] = Math.min(ctx.caps[STATS[b.i]], x[b.i] + 1 + Math.floor(inhRand() * b.most)); });
        });
        gmUsed = false; gmDrop = 0;
        if (gmS) {
          // A full table: obtain its Wisdom at the start of the turn, in the color the goddess plan
          // wants (you steer it with the 1st and 5th fragments).
          const one = {};
          if (gmS.held >= 8) {
            const next = GMs.nextColor(gmS.levels, turn, "red"), c = next ? next.color : "red";
            gmS.levels[c] = Math.min(5, gmS.levels[c] + 1); gmS.held = 0; gmS.wisdoms++; gmUsed = true; one[c] = true;
            if (c === "red") { energy = Math.min(maxEnergy, energy + 50); mood = 4; }
          }
          const lv = gmS.levels;
          ctx.gmTurn = { te: GM_TRAIN[lv.red] + GM_TRAIN[lv.blue] + GM_TRAIN[lv.yellow], cut: GM_CUT[lv.red], frag: gmS.held, red: !!one.red, blue: !!one.blue, yellow: !!one.yellow };
        }
        deck.forEach((d, k) => { bond[k] = Math.min(100, bond[k] + eventBond[k]); });
        for (let i = 0; i < 5; i++) x[i] = Math.max(0, Math.min(ctx.caps[STATS[i]], x[i] + (EVENT_STATS + evStats[i]) / ctx.turns.length));
        sp += evSp / ctx.turns.length;
        energy = Math.max(0, Math.min(maxEnergy, energy + evEnergy / ctx.turns.length));
        if (live) {
          live.start(turn, applyEvent);
          if (turn === 25 || turn === 49) applyEvent({ e: E.NEW_YEAR[turn] ? E.NEW_YEAR[turn].e : 20 });
          if (turn === 25) hello.forEach((h, k) => {
            if (!h || !h.unlocked) return;
            const options = h.p.newYear(true);
            const chosen = energy < maxEnergy - 15 ? options[1] : options[0];
            applyEvent(chosen); bond[k] = Math.min(100, bond[k] + chosen.b);
            (chosen.h || []).forEach(([id, lv]) => { h.hints[id] = Math.min(5, (h.hints[id] || 0) + lv); runLevels[id] = Math.min(5, (runLevels[id] || 0) + lv); });
          });
          live.shop(turn, energy, maxEnergy, applyEvent);
        }
        const day = scheduled.get(turn);
        if (day && day.kind === "race") {
          // Conditional on winning: random rewarded stats are represented by their expectation.
          const multiplier = 1 + raceBonus / 100;
          const perStat = Math.floor(day.statsEach * multiplier + 1e-9) * day.statCount / 5;
          for (let i = 0; i < 5; i++) x[i] = Math.min(ctx.caps[STATS[i]], x[i] + perStat);
          sp += Math.floor(day.sp * multiplier + 1e-9);
          energy = Math.max(0, energy - day.energy);
          requiredRaces++;
          gmDrop = 2;
          finishTurn(turn);
          continue;
        }
        // Optional races: stats and SP, raised by the deck's race bonus, for some energy.
        if (turn > 12 && (!ctx.calendar || turn <= 72) && rand() < ctx.raceShare) {
          for (let i = 0; i < 5; i++) x[i] = Math.min(ctx.caps[STATS[i]], x[i] + RACE_REWARD.stats / 5 * (1 + raceBonus / 100));
          sp += RACE_REWARD.sp * (1 + raceBonus / 100);
          energy = Math.max(0, energy - 15);
          races++;
          finishTurn(turn);
          continue;
        }
        // Deal the cards onto trainings.
        const at = [[], [], [], [], []];
        deck.forEach((d, k) => {
          if (d.hello && turn < 5) return;
          const own = STATS.indexOf(d.card.ty);
          const wOwn = own >= 0 ? 100 + d.spec + (live ? live.state.specialty : 0) : 100;
          const sum = wOwn + 400 + ABSENT_WEIGHT;
          let r = rand() * sum;
          for (let f = 0; f < 5; f++) {
            r -= f === own ? wOwn : 100;
            if (r < 0) { at[f].push(k); return; }
          }
        });
        const camp = ctx.camp.has(turn);
        // Energy is worth what it saves: a rest turn (no training) buys about 52 of it.
        const lambda = (typ || 20) / 52;
        let best = -1, bestV = lambda * (Math.min(maxEnergy, energy + 52) - energy), bestG = null, bestFail = 0;
        let bestRaw = 0;
        let bestTokens = [], bestOuting = null, doRecreation = false, bestHelloSaving = 0;
        const moodValue = (delta) => live ? Math.min(4 - mood, delta) * 0.1 * (typ || 25) * Math.min(10, ctx.turns.length - ti) : 0;
        if (live && mood < 4) {
          const v = lambda * Math.min(10, maxEnergy - energy) + moodValue(1);
          if (v > bestV) { bestV = v; doRecreation = true; }
        }
        if (live && !camp) hello.forEach((h, k) => {
          if (!h || !h.unlocked || h.done >= 5) return;
          const d = h.p.dates[h.done];
          const value = (o) => Math.min(maxEnergy + (o.me || 0) - energy, o.e || 0) * lambda + moodValue(o.mo || 0) + (o.s || []).reduce((a, n, i) => a + n * pointValue(ctx, STATS[i], x[i]), 0) + (o.sp || 0) * SP_VALUE;
          const options = d.roll ? [{ o: d.opts[1], value: d.p * value(d.opts[0]) + (1 - d.p) * value(d.opts[1]) }] : d.opts.map((o) => ({ o, value: value(o) }));
          const pick = options.sort((a, b) => b.value - a.value)[0];
          // Finishing enables her fifth-outing skill; give earlier outings a
          // modest planning value as the number of remaining free turns shrinks.
          const L = ctx.skills[h.p.skill];
          const hintSurplus = L != null ? Math.max(0, L * L_VALUE - (ctx.costs[h.p.skill] || D.skillCost(h.p.skill) || 160) * 0.8 * SP_VALUE) : 0;
          const complete = h.p.ending(true), incomplete = h.p.ending(false);
          const endingValue = complete.s.reduce((a, n, i) => a + (n - incomplete.s[i]) * pointValue(ctx, STATS[i], x[i]), 0) + (complete.sp - incomplete.sp) * SP_VALUE;
          const completion = (hintSurplus + endingValue) / (5 - h.done) * Math.min(2, 1 + 10 / Math.max(1, 78 - turn)) + (h.done === 0 ? 3 : 0);
          if (pick.value + completion > bestV) { bestV = pick.value + completion; bestOuting = { h, k, d, outcome: pick.o }; doRecreation = false; }
        });
        ctx.energy = energy; ctx.maxEnergy = maxEnergy; ctx.totalBond = bond.reduce((a, n) => a + n, 0);
        for (let f = 0; f < 5; f++) {
          const L = ctx.gmTurn && ctx.gmTurn.red ? 6 : camp ? 5 : Math.min(5, 1 + Math.floor(count[f] / 4));
          const members = at[f].map((k) => ({ card: deck[k].card, level: deck[k].level, bond: bond[k] }));
          const g = gain(ctx, fx, ctx.sc.train[STATS[f]], STATS[f], members, L, mood);
          let v = g.sp * SP_VALUE;
          for (let i = 0; i < 5; i++) v += trained(x[i], g.g[i]) * pointValue(ctx, STATS[i], x[i]);
          const raw = v;
          const tok = live ? live.training(turn, STATS[f], L, members, g.rainbows) : [];
          if (live) v += live.tokenValue(tok);
          at[f].forEach((k) => {
            const h = hello[k];
            if (!h) return;
            if (!h.met) v += h.p.first.s.reduce((a, n, i) => a + n * pointValue(ctx, STATS[i], x[i]), 0) + moodValue(1) + 10;
            else if (turn <= 72) v += ctx.helloProcRate * live.tokenValue([{ type: live.low(), amount: h.p.tokenAmount }]);
          });
          // Early on, raising bonds pays off later.
          const early = Math.max(0, 1 - turn / 40);
          at[f].forEach((k) => { if (bond[k] < 80 && deck[k].card.ty !== "friend") v += early * 6; });
          const fail = E.estimateFail(STATS[f], energy) * g.failMult / 100;
          v = v * (1 - fail) - fail * raw * 0.5 + lambda * (Math.max(0, Math.min(maxEnergy, energy + g.energy)) - energy);
          if (v > bestV) {
            bestV = v; best = f; bestG = g; bestFail = fail; bestRaw = raw; bestTokens = tok; bestOuting = null; doRecreation = false;
            bestHelloSaving = 0;
            if (live && members.some((m) => H.isHello(m.card)) && g.energy < 0) {
              const without = gain(ctx, fx, ctx.sc.train[STATS[f]], STATS[f], members.filter((m) => !H.isHello(m.card)), L, mood);
              bestHelloSaving = Math.max(0, g.energy - without.energy);
            }
          }
        }
        if (bestOuting) {
          const { h, k, d } = bestOuting;
          const outcome = d.roll ? d.opts[eventRand() < d.p ? 0 : 1] : bestOuting.outcome;
          const recovered = applyEvent(outcome);
          liveTotals.helloEnergyRecovered += recovered;
          liveTotals.helloEnergyWasted += Math.max(0, (outcome.e || 0) - recovered);
          bond[k] = Math.min(100, bond[k] + (outcome.b || 0));
          (outcome.h || []).forEach(([id, lv]) => { h.hints[id] = Math.min(5, (h.hints[id] || 0) + lv); runLevels[id] = Math.min(5, (runLevels[id] || 0) + lv); });
          h.done++; outings++; liveTotals.helloOutings++;
          finishTurn(turn); continue;
        }
        if (doRecreation) { applyEvent({ e: 10, mo: 1 }); recreations++; finishTurn(turn); continue; }
        if (best < 0) { energy = Math.min(maxEnergy, energy + 52); rests++; finishTurn(turn); continue; }
        typ = typ ? typ * 0.9 + bestRaw * 0.1 : bestRaw;
        energy = Math.max(0, Math.min(maxEnergy, energy + bestG.energy));
        train[best]++;
        if (gmS && bestG.rainbows) gmDrop = STATS[best] === "wit" ? (rand() < GM_WIT_DOUBLE ? 2 : 1) : 2;
        if (rand() < bestFail) { fails++; gmDrop = 1; finishTurn(turn); continue; }
        if (!camp) count[best]++; // failed and camp trainings don't level facilities
        for (let i = 0; i < 5; i++) x[i] = Math.min(ctx.caps[STATS[i]], x[i] + trained(x[i], bestG.g[i]));
        sp += bestG.sp;
        rainbowTotal += bestG.rainbows;
        // Blue Wisdom: every card on the training gives a skill hint and a few stats.
        if (ctx.gmTurn && ctx.gmTurn.blue) at[best].forEach((k) => {
          const hs = deck[k].card.hs || [];
          if (hs.length) addHint(k, hs[Math.floor(rand() * hs.length)], 1, "training");
          x[best] = Math.min(ctx.caps[STATS[best]], x[best] + 2); sp += 2;
        });
        at[best].forEach((k) => {
          bond[k] = Math.min(100, bond[k] + D.BOND_PER_TRAINING);
          if ((deck[k].card.hs || []).length && rand() < deck[k].hintRate) { hints[k]++; runHints[k]++; bond[k] = Math.min(100, bond[k] + D.BOND_PER_HINT); const hs = deck[k].card.hs; addHint(k, hs[Math.floor(trainingRand[k]() * hs.length)], deck[k].hintLv, "training"); }
        });
        if (live) {
          bestTokens.forEach((t) => live.add(t.type, t.amount));
          at[best].forEach((k) => {
            const h = hello[k];
            if (!h) return;
            if (h.met) {
              liveTotals.helloTrainings++;
              if (eventRand() < ctx.helloProcRate) {
                liveTotals.helloTokens += live.add(live.low(), h.p.tokenAmount);
                liveTotals.helloEvents++;
                applyEvent(h.p.repeat); bond[k] = Math.min(100, bond[k] + h.p.repeat.b);
              }
            } else { applyEvent(h.p.first); bond[k] = Math.min(100, bond[k] + h.p.first.b); h.met = true; h.metTurn = turn; }
            liveTotals.helloEnergySaved += bestHelloSaving;
          });
        }
        finishTurn(turn);
        if (!live && ti === Math.floor(ctx.turns.length / 3)) deck.forEach((d, k) => { bondAt[k] += bond[k]; });
      }
      if (gmS) {
        for (let i = 0; i < 5; i++) x[i] = Math.min(ctx.caps[STATS[i]], x[i] + 20);
        sp += 80;
        gmTotals.wisdoms += gmS.wisdoms; gmTotals.red += gmS.levels.red; gmTotals.blue += gmS.levels.blue; gmTotals.yellow += gmS.levels.yellow;
        ctx.gmTurn = null;
      }
      if (live) {
        hello.forEach((h) => {
          if (!h || !h.met) return;
          applyEvent(h.p.ending(h.done === 5));
          if (h.done === 5) liveTotals.helloCompletions++;
          Object.entries(h.hints).forEach(([id, lv]) => {
            const key = h.p.card.id + ":" + id;
            const old = helloSkillEvents.get(key) || { count: 0, byLevel: {} };
            old.count++; old.byLevel[lv] = (old.byLevel[lv] || 0) + 1; helloSkillEvents.set(key, old);
          });
        });
        live.shop(78, energy, maxEnergy, applyEvent, true);
        const ls = live.state;
        eventExposures.push(ls.eventLevelTurns / ctx.turns.length);
        support.forEach((model, k) => { if (model && model.profile.mode === "coupled") { supportTotals[k].complete += +(model.state.stage === model.profile.chain.length && model.profile.chain.length > 0); supportTotals[k].ended += +(model.state.ended && model.state.stage < model.profile.chain.length); } });
        careers.push({ sp, hints: runHints, training: trainingLevels, events: eventLevels, eventTrace, hello: hello.map((h) => h ? Object.assign({}, h.hints) : {}), exposure: ls.eventLevelTurns / ctx.turns.length });
        liveTotals.songs += Object.keys(ls.songs).length + 1;
        liveTotals.techniques += ls.techniques; liveTotals.greatConcerts += ls.greatConcerts; liveTotals.lessonEnergy += ls.lessonEnergy;
        if (ls.songCountAtLyrics >= 16) liveTotals.lyrics++;
        if (ls.songCountAtFinalDeadline >= 18) liveTotals.special++;
        for (let i = 0; i < 5; i++) { earnedTokens[i] += ls.earned[i]; spentTokens[i] += ls.spent[i]; finalTokens[i] += ls.tokens[i]; }
      } else if (purchase) careers.push({ sp, hints: runHints, training: trainingLevels, events: eventLevels, eventTrace, hello: deck.map(() => ({})), exposure: 0 });
      total += statsValue(ctx, x) + (purchase ? 0 : sp * SP_VALUE);
      spTotal += sp;
      for (let i = 0; i < 5; i++) statSum[i] += x[i];
      finals.push({ stats: x.map(Math.round), sp: Math.round(sp) });
    }
    ctx.helloSkillEvents = helloSkillEvents;
    ctx.eventExposures = eventExposures;
    Object.assign(eventCtx, { helloSkillEvents, eventExposures });
    eventCtx.careers = careers;
    const skill = skillValue(eventCtx, deck, hints.map((h) => h / R));
    const budget = purchase ? affordableSkills(ctx, eventCtx, purchase, deck, careers, skill.list) : null;
    if (budget) { skill.value = budget.value; skill.list = budget.skills; }
    return {
      value: total / R + skill.value * ctx.skillWeight,
      trainValue: total / R,
      skillValue: skill.value,
      skillBudget: budget && budget.summary,
      stats: statSum.map((s) => Math.round(s / R)),
      sp: Math.round(spTotal / R),
      finals,
      rainbows: rainbowTotal / R,
      raceBonus,
      hints: inputCards.map(c => hints[cards.indexOf(c)] / R),
      bondByJuniorEnd: inputCards.map(c => Math.round(bondAt[cards.indexOf(c)] / R)),
      trainMix: train.map((n) => n / R),
      rests: rests / R,
      races: races / R,
      requiredRaces: requiredRaces / R,
      runs: R,
      outings: outings / R,
      recreations: recreations / R,
      grandMasters: ctx.gmModel ? { model: "goddess-levels-v1 (estimate)", wisdoms: gmTotals.wisdoms / R, levels: { red: gmTotals.red / R, blue: gmTotals.blue / R, yellow: gmTotals.yellow / R } } : null,
      grandConcert: ctx.sc.id === "grandlive" ? Object.assign(
        Object.fromEntries(Object.entries(liveTotals).map(([k, n]) => [k, n / R])), {
          earnedTokens: earnedTokens.map((n) => n / R), spentTokens: spentTokens.map((n) => n / R), finalTokens: finalTokens.map((n) => n / R),
          model: "discrete-lessons-v1", helloProcRate: ctx.helloProcRate, helloUnlockRate: ctx.helloUnlockRate,
          eventSuccessRate: ctx.eventSuccessRate, eventSongBoost: ctx.eventSongBoost, eventLevelExposure: eventExposures.reduce((n, x) => n + x, 0) / R,
          assumptions: "repeat/unlock rates, conditional success and event clocks are assumptions; song levels activate after concerts; base Promo Live collaborator rewards add +10 of every type; conditional link-character Performance rewards are omitted; per-level boost is experimental (default 0); parsed ordinary events couple rewards and hints, incomplete/special cards retain aggregate rewards; generic career events, guest placements and raw-text conditions remain approximate or omitted"
        }) : null,
      calendarAssumptions: ctx.calendar ? {
        requiredRaceResult:"wins assumed; race failure and aptitude feasibility not simulated",
        randomGoalStats:"expected distribution across five stats",
        choiceAndFanGoals:"only automatically fixed race objectives scheduled",
        rewards:"standard goal/URA winning rewards; discrete concerts, Light Hello events/ending and parsed ordinary support events (aggregate fallback where incomplete); other career-end/secret rewards omitted",
        scheduledRaces:ctx.calendar.filter(d => d.kind === "race").map(d => d.turn),
        freeTurns:ctx.calendar.filter(d => d.kind === "free").length
      } : null,
      fails: fails / R,
      skills: skill.list,
      eventModel: { successRate: ctx.eventSuccessRate, songBoost: ctx.eventSongBoost, completionPriors: SkillEvents.PRIOR, coverage: skill.coverage },
      supportEvents: ctx.coupledEvents ? { model: "coupled-events-v1", cards: deck.map((d, k) => ({ card: d.card.id, chainLength: d.support ? d.support.chain.length : 0, mode: d.hello ? "hello-lifecycle" : d.support.mode, missing: d.support ? d.support.missing : [], notes: d.support ? d.support.notes : [], totals: Object.fromEntries(Object.entries(supportTotals[k]).map(([key, value]) => [key, Array.isArray(value) ? value.map((n) => n / R) : value / R])) })),
        example: careers[0] ? careers[0].eventTrace : [],
        assumptions: "independent card/event clocks across all calendar turns; binomial chain arrivals calibrated to rarity priors before failures/choices; conditional success assumed; event timing, future choice utility, raw-text conditions and generic +120 per-stat career events remain estimates; incomplete/special cards retain whole-card aggregate rewards" } : null,
      initial,
      initialSp,
    };
  }

  // Sample complete event routes and distribute each collected training hint to
  // one pool skill. These streams do not change the training/calendar random draws.
  // Stable card-specific seeds preserve pairing when deck order changes.
  function affordableSkills(ctx, eventCtx, purchase, deck, careers, analytic) {
    const plans = [], rows = new Map(analytic.filter((s) => purchase.chain(s.id)).map((s) => [String(s.id), Object.assign({}, s, { offered: 0, selected: 0, spent: 0, givenBy: new Set() })]));
    const diagnosticRows = new Map(analytic.map((s) => [String(s.id), s]));
    const unsupported = new Set();
    careers.forEach((career, run) => {
      const levels = {}, sources = new Map();
      function add(id, lv, card) {
        id = String(id); if (!(lv > 0)) return;
        levels[id] = Math.min(5, (levels[id] || 0) + lv);
        if (!sources.has(id)) sources.set(id, new Set()); sources.get(id).add(card);
      }
      deck.forEach((d, k) => {
        const seed = (ctx.seed + run * 7919) ^ Math.imul(+d.card.id, 2654435761);
        const event = rng(seed ^ 0x428bd57);
        const hs = d.card.hs || [];
        Object.entries(career.training[k]).forEach(([id, lv]) => add(id, lv, d.card.id));
        if (d.hello) Object.entries(career.hello[k]).forEach(([id, lv]) => add(id, lv, d.card.id));
        else if (d.support && d.support.mode === "coupled") {
          Object.entries(career.events[k]).forEach(([id, lv]) => add(id, lv, d.card.id));
          d.support.fallback.forEach((id) => { if (event() < (SkillEvents.PRIOR[d.card.r] || 0.5)) add(id, 1, d.card.id); });
        }
        else {
          const model = SkillEvents.model(d.card, eventCtx, { success: ctx.eventSuccessRate, multiplier: 1 + ctx.eventSongBoost * career.exposure, independent: ctx.independent });
          model.groups.forEach((group) => {
            let r = event();
            const outcome = group.outcomes.find((o) => (r -= o.p) < 0);
            Object.entries(outcome ? outcome.levels : {}).forEach(([id, lv]) => add(id, lv, d.card.id));
          });
          model.fallback.forEach((id) => { if (event() < model.completion) add(id, 1, d.card.id); });
        }
      });
      const plan = ctx.specPurchase && !(ctx.must && ctx.must.length) ? ctx.specPurchase(ctx, levels, career.sp) || purchase.solve(levels, career.sp) : purchase.solve(levels, career.sp);
      plan.hintLevels = levels;
      plan.eventTrace = career.eventTrace;
      plan.career = run + 1;
      plan.unsupported.forEach((id) => unsupported.add(id));
      plan.offered.forEach((id) => {
        if (!rows.has(id)) rows.set(id, Object.assign({}, diagnosticRows.get(id) || { id, L: ctx.skills[id] || 0, p: 0, src: [], eventP: 0, trainingP: 0 }, { offered: 0, selected: 0, spent: 0, givenBy: new Set() }));
        const row = rows.get(id); row.offered++;
        // A gold hint also unlocks its lower tiers for purchase.
        Object.entries(levels).forEach(([hintId]) => {
          if (purchase.unlocks(hintId).includes(id)) (sources.get(hintId) || []).forEach((card) => row.givenBy.add(card));
        });
      });
      plan.selected.forEach((s) => { const row = rows.get(s.id); row.selected++; row.spent += s.cost; });
      plans.push(plan);
    });
    const R = plans.length;
    const avg = (key) => plans.reduce((n, p) => n + p[key], 0) / R;
    const skills = [...rows.values()].map((s) => {
      const selectedP = s.selected / R;
      return Object.assign({}, s, { sourceP: diagnosticRows.has(s.id) ? diagnosticRows.get(s.id).p : 0,
        p: ctx.available.includes(s.id) ? 1 : diagnosticRows.has(s.id) ? s.p : s.offered / R,
        sampledAvailableP: s.offered / R, selectedP, meanPurchaseCost: s.selected ? s.spent / s.selected : null,
        src: [...new Set(s.src.concat([...s.givenBy]))], innate: ctx.available.includes(s.id), raceValue: s.L * L_VALUE, surplus: undefined,
        offered: undefined, selected: undefined, spent: undefined, givenBy: undefined });
    }).sort((a, b) => b.selectedP * b.L - a.selectedP * a.L || +a.id - +b.id);
    const ordered = plans.slice().sort((a, b) => a.budget - b.budget);
    const example = ordered[Math.floor((ordered.length - 1) / 2)];
    const summary = { model: "sampled-skill-budget-v1", careers: R, budget: avg("budget"), spent: avg("spent"), unspent: avg("unspent"),
      valuesAvailable: Object.values(ctx.skills).some((n) => Number.isFinite(n) && n > 0),
      learned: plans.reduce((n, p) => n + p.selected.length, 0) / R, L: avg("L"),
      must: ctx.must.map((id) => ({ id, learnedP: plans.filter((p) => !p.unmetMust.includes(id)).length / R })),
      unsupported: [...unsupported].sort(), example, plans,
      assumptions: "end-of-career purchases; all listed innate/awakening skills available at Lv0; own unique already learned; no inherited or scenario-random skills, Fast Learner, early purchases, free grants or evolved skills; additive chart gains; independent training-hint pool draws; complete ordinary-support records use coupled events; incomplete records/unknown skills keep disclosed fallbacks; must-haves prioritize affordable purchases; SP is scored through affordable skills, without a second raw-SP bonus" };
    return { value: avg("value"), skills, summary };
  }

  // Skills a deck can hint, each valued by its race gain minus its skill point cost.
  function skillValue(ctx, deck, hintEvents) {
    const offers = D.skillOffers();
    const coverage = [];
    const add = (id, prob, lv, src, kind) => offers.add(id, prob, lv, src, kind);
    deck.forEach((d, k) => {
      const hs = d.card.hs || [];
      hs.forEach((id) => offers.trainingHints(id, hintEvents[k] / Math.max(1, hs.length), d.hintLv, d.card.id));
      if (d.hello) (d.card.es || []).forEach((id) => {
          const observed = ctx.helloSkillEvents.get(d.card.id + ":" + id);
          if (observed) offers.exclusive(Object.entries(observed.byLevel).map(([level, count]) => ({ p: count / ctx.runs, levels: { [id]: +level } })), d.card.id);
      });
      else if (d.support && d.support.mode === "coupled") {
        const profile = d.support;
        offers.exclusive(ctx.careers.map((career) => ({ p: 1 / ctx.runs, levels: career.events[k] })), d.card.id);
        profile.fallback.forEach((id) => add(id, SkillEvents.PRIOR[d.card.r] || 0.5, 1, d.card.id));
        coverage.push({ card: d.card.id, eventSkills: (d.card.es || []).length, unresolved: profile.fallback, conditionalNotes: profile.notes, coupled: true });
      }
      else {
        const exposures = ctx.eventExposures.length ? ctx.eventExposures : [0];
        const models = exposures.map((exposure) => SkillEvents.model(d.card, ctx, { success: ctx.eventSuccessRate, multiplier: 1 + ctx.eventSongBoost * exposure, independent: ctx.independent }));
        coverage.push({ card: d.card.id, eventSkills: (d.card.es || []).length, unresolved: models[0].fallback, conditionalNotes: [...new Set(models[0].routes.map((r) => r.note).filter(Boolean))] });
        models[0].groups.forEach((_, i) => offers.exclusive(models.flatMap((m) => m.groups[i].outcomes.map((o) => ({ p: o.p / models.length, levels: o.levels }))), d.card.id));
        models[0].fallback.forEach((id) => add(id, models[0].completion, 1, d.card.id));
      }
    });
    const list = [];
    offers.values().forEach((offer) => {
      const { id } = offer;
      const L = ctx.skills[id];
      if (L == null || ctx.known.has(id)) return;
      const cost = ctx.costs[id] || D.skillCost(id) || 150;
      const surplus = L * L_VALUE - cost * (1 - offer.conditionalDiscount) * SP_VALUE;
      list.push(Object.assign({}, offer, { L, cost, surplus }));
    });
    list.sort((a, b) => b.surplus * b.p - a.surplus * a.p);
    // A career only has the skill points for so many skills: the best few count in full.
    let value = 0;
    list.forEach((s, i) => { if (s.surplus > 0) value += s.p * s.surplus * (i < 8 ? 1 : 0.4); });
    return { value, list, coverage };
  }

  // Characters can only appear once in a deck, and never the trainee's own character.
  function compatible(cards, c, traineeChar) {
    if (traineeChar && c.card.cid === traineeChar) return false;
    return !cards.some((x) => x.card.id === c.card.id || (x.card.cid && x.card.cid === c.card.cid));
  }

  // Deck makeup: comp is { type: exact count } for the types you fixed (others are free).
  // A partial deck is fine as long as the slots left can still meet every fixed count.
  const TYPES = ["speed", "stamina", "power", "guts", "wit", "friend", "group"];
  function compOK(cards, comp, total) {
    if (!comp) return true;
    const n = {};
    cards.forEach((c) => { n[c.card.ty] = (n[c.card.ty] || 0) + 1; });
    let need = 0;
    for (const t of TYPES) {
      if (comp[t] == null) continue;
      if ((n[t] || 0) > comp[t]) return false;
      need += comp[t] - (n[t] || 0);
    }
    return need <= total - cards.length;
  }

  // Finds the best decks. pool: [{ card, lb, borrowed? }]. opts.locked: card ids that must stay.
  // onProgress(fraction) is called as the search goes.
  function optimize(opts, onProgress) {
    const ctx = buildCtx(opts);
    const tchar = opts.trainee ? (D.trainee(opts.trainee) || {}).cid : null;
    const pool = opts.pool.filter((c) => !(tchar && c.card.cid === tchar));
    const borrowPool = (opts.borrowPool || []).filter((c) => !(tchar && c.card.cid === tchar));
    const comp = opts.comp && Object.keys(opts.comp).length ? opts.comp : null;
    const ok = (rest, c) => compatible(rest, c, tchar) && compOK(rest.concat([c]), comp, 6);
    const cache = new Map();
    const evals = { n: 0 };
    const key = (cards) => cards.map((c) => c.card.id + ":" + c.lb + (c.borrowed ? "b" : "")).sort().join(",");
    const score = (cards, runs) => {
      const k = key(cards) + "|" + (runs || ctx.runs);
      if (!cache.has(k)) { evals.n++; cache.set(k, simulate(Object.assign({}, ctx, { runs: runs || ctx.runs }), cards)); }
      return cache.get(k);
    };
    const quick = Math.max(4, Math.round(ctx.runs / 2));
    let deck = pool.filter((c) => (opts.locked || []).indexOf(c.card.id) !== -1).slice(0, 6);
    const borrowedSlot = opts.borrow && borrowPool.length ? 1 : 0;
    const ownedSlots = 6 - borrowedSlot;
    const progress = (f) => { if (onProgress) onProgress(Math.min(1, f)); };

    // 1. Greedy: add whichever card raises the deck most.
    const steps = Math.max(0, ownedSlots - deck.length);
    for (let s = 0; s < steps; s++) {
      let best = null, bestV = -Infinity;
      pool.forEach((c) => {
        if (!ok(deck, c)) return;
        const v = score(deck.concat([c]), quick).value;
        if (v > bestV) { bestV = v; best = c; }
      });
      if (!best) break;
      deck.push(best);
      progress(0.1 + 0.4 * (s + 1) / Math.max(1, steps));
    }
    if (deck.length < ownedSlots) {
      const short = comp ? TYPES.filter((t) => comp[t] != null).map((t) => comp[t] + " " + t).join(", ") : "";
      throw new Error("Not enough cards to fill the deck" + (short ? " with " + short + ". Check you own enough cards of each type (or allow a borrowed card)" : "") + ".");
    }
    // 2. Swaps: try replacing each unlocked card with every other card until nothing improves.
    const locked = new Set(opts.locked || []);
    let cur = score(deck, quick).value;
    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      for (let i = 0; i < deck.length; i++) {
        if (locked.has(deck[i].card.id)) continue;
        const rest = deck.filter((_, j) => j !== i);
        pool.forEach((c) => {
          if (!ok(rest, c)) return;
          const cand = rest.concat([c]);
          const v = score(cand, quick).value;
          if (v > cur + 1e-6) { deck = cand; cur = v; improved = true; }
        });
      }
      progress(0.5 + 0.15 * (pass + 1));
      if (!improved) break;
    }
    // 3. Borrowed card: the best friend's card for the last slot.
    if (borrowedSlot) {
      let best = null, bestV = -Infinity;
      borrowPool.forEach((c) => {
        if (!ok(deck, c)) return;
        const v = score(deck.concat([Object.assign({}, c, { borrowed: true })]), quick).value;
        if (v > bestV) { bestV = v; best = c; }
      });
      if (best) deck.push(Object.assign({}, best, { borrowed: true }));
    }
    progress(0.9);
    // 4. Runner-up decks: the best single swaps away from the winner, rescored with full runs.
    const result = score(deck);
    const alts = [];
    deck.forEach((d, i) => {
      if (locked.has(d.card.id) || d.borrowed) return;
      const rest = deck.filter((_, j) => j !== i);
      let best = null, bestV = -Infinity;
      pool.forEach((c) => {
        if (c.card.id === d.card.id || !ok(rest, c)) return;
        const v = score(rest.concat([c]), quick).value;
        if (v > bestV) { bestV = v; best = c; }
      });
      if (best) alts.push({ out: d, in: best, cards: rest.concat([best]) });
    });
    const runnersUp = alts.map((a) => Object.assign({ swap: { out: a.out, in: a.in }, cards: a.cards }, { r: score(a.cards) }))
      .sort((a, b) => b.r.value - a.r.value).slice(0, 3);
    // What each card adds: the deck's value without it (empty slot).
    const contrib = deck.map((d, i) => result.value - score(deck.filter((_, j) => j !== i)).value);
    progress(1);
    return { cards: deck, result, contrib, runnersUp, evals: evals.n };
  }

  // ---- Target stats: steer a deck toward your stat targets ----
  // How close a simulated stat line ends to the targets (each capped at the stat cap): every
  // point short costs 1, a big miss counts extra (400 short costs 720), and a miss in a stat
  // the build leans on counts up to double (Speed most). Points past a target count 0.1 each,
  // skill points 0.35 each.
  function targetFit(ctx, stats, sp) {
    let value = 0, short = 0;
    const top = Math.max.apply(null, STATS.map((s) => ctx.w[s]));
    STATS.forEach((s, i) => {
      const t = Math.min(ctx.target[s], ctx.caps[s]);
      const miss = Math.max(0, t - stats[i]);
      short += miss;
      value -= miss * (1 + miss / 500) * (1 + ctx.w[s] / top);
      value += 0.1 * Math.max(0, Math.min(stats[i], ctx.caps[s]) - t);
    });
    return { value: value + (ctx.skillBudget ? 0 : sp * SP_VALUE), short: Math.round(short) };
  }

  // Starts from a deck (Euophrys' pick) and goes slot by slot: the best few cards of each type
  // the deck makeup allows (by Euophrys' score with the other five fixed) go in one at a time,
  // and a swap stays when the simulated careers end closer to the targets, counting the
  // deck's skills (tiers.js) and must-haves too. Locked cards stay. Up to 2 passes.
  // Friend and Group cards help every training, so balanced targets would pull in several;
  // racing decks rarely run more than one of each, so the search stays at 1 (or the start
  // deck's count, or your deck makeup's). Parent decks may take 2 of each: players report
  // they add a lot of skill points toward an SS rating in Independent Training.
  // opts: the tier list options (scenario key, skills, must, comp, locked, skillWeight...);
  // sim: buildCtx options (coach scenario, build, trainee, target, caps).
  // Returns a stepper so the page can show progress: next() does one slot, result() ends it.
  const FIT_RUNS = 6;
  const HELD_OUT_DECKS = 5, HELD_OUT_RUNS = 32;
  const FIT_PER_TYPE = { friend: 2, group: 2 };
  const SKILL_EXTRA = 2; // per type, the cards whose skill hints are worth the most on the course
  const FIT_TYPES = ["speed", "stamina", "power", "guts", "wit", "friend", "group"];
  // How Find my best deck scores a deck on simulated careers: how close she ends to the targets
  // (or her lengths on the course), the deck's skills and must-haves, and the share reaching
  // the rank goal first when there is one. targetSearch and makeupSweep share it, so a makeup is
  // scored exactly as one search scores a deck. ctxOf(runs, seed) makes careers to score on.
  // The q-quantile of xs (linear between neighbours).
  const HEAL_RELIABLE = 0.6;
  function percentile(xs, q) {
    const s = xs.slice().sort((a, b) => a - b), at = (s.length - 1) * q, lo = Math.floor(at), hi = Math.ceil(at);
    return s[lo] + (s[hi] - s[lo]) * (at - lo);
  }
  function fitScorer(opts, sim) {
    const Tr = root.UmaTiers || (typeof require !== "undefined" ? require("./tiers.js") : null);
    // final: the finalists' recheck, where each career's purchases may use sim.specPurchase.
    const ctxOf = (runs, seed, final) => buildCtx(Object.assign({}, sim, seed != null ? { seed } : {}, { runs, skills: opts.skills, costs: opts.costs, skillWeight: opts.skillWeight, must: opts.must, independent: opts.independent, skillBudget: !opts.parent, specPurchase: final ? sim.specPurchase || null : null }));
    // Parent decks: the skills are the point, so a swap may cost at most a share of the start
    // deck's skill score, set by "Stats still count" (A little 4%, Some 10%, Half 20%, Fully
    // 40%); within that, the closest stats win. skillWeight is the racing slider.
    const sw = opts.parent ? 1 : opts.skillWeight != null ? opts.skillWeight : 1;
    const giveUp = opts.parent ? Math.min(0.4, 0.4 * (opts.parent.statsWeight || 0)) : null;
    // Rank goal: parent reachSS and racing rankGoal use the same rating estimate. The share
    // reaching the goal comes first, even when stats or skills would favor a different deck.
    const ss = (opts.parent && opts.parent.reachSS) || opts.rankGoal;
    const Ra = ss ? root.UmaRating || (typeof require !== "undefined" ? require("./rating.js") : null) : null;
    let floor = -Infinity;
    // sim.healNeeds: { gold heal id: the stamina she needs with it equipped }. A deck that offers
    // one with at least HEAL_RELIABLE chance is scored against need = p x that + (1 - p) x the
    // usual need (the best such heal).
    // The cut is p x (the usual need - the need with it), off the race scoring's stamina line, or
    // off the Stamina target when the deck is scored on targets (a need past her cap).
    const healNeed = (c, sk) => {
      const hn = sim.healNeeds, base = sim.raceValues && sim.raceValues.staminaTarget;
      if (!hn || !(base > 0)) return null;
      let best = null;
      (sk.list || []).forEach((x) => {
        const n = hn[x.id];
        if (n == null || !(x.p >= HEAL_RELIABLE) || !(n < base)) return;
        const cut = x.p * (base - n);
        if (!best || cut > best.cut) best = { id: x.id, p: x.p, cut, need: base - cut };
      });
      return best;
    };
    const withHeal = (c, heal) => {
      if (!heal) return c;
      if (c.race && c.race.staminaTarget > 0) return Object.assign({}, c, { race: Object.assign({}, c.race, { staminaTarget: c.race.staminaTarget - heal.cut }) });
      return Object.assign({}, c, { target: Object.assign({}, c.target, { stamina: Math.max(0, c.target.stamina - heal.cut) }) });
    };
    const evaluate = (deck, c) => {
      const s = simulate(c, deck.map((x) => ({ card: D.card(x.id), lb: x.lb })));
      const sk = Tr.deckSkills(opts, deck);
      const heal = healNeed(c, sk);
      const fit = deckFit(withHeal(c, heal), s);
      const over = sk.value < floor - 1e-9 ? 1e9 : 0;
      // Race scoring counts skills as the SP-limited purchases of each simulated career (lengths, like
      // the stats), as Grand Concert does; the tier list's skill score otherwise.
      const skillScore = (c.sc.id === "grandlive" || fit.scoring === "race") && !opts.parent ? s.skillValue : sk.value;
      // opts.careerScore "p85": the stat part is her 85th-percentile career (CM: you train several
      // and race your best), else the average career (LoH: steady).
      const statPart = opts.careerScore === "p85" && fit.careers && fit.careers.length > 1 ? percentile(fit.careers, 0.85) : fit.value;
      let value = (ss && ss.ignoreFit ? 0 : statPart) + sw * skillScore + sk.mustValue - over, rating = null, ssShare = null;
      if (ss) {
        rating = Ra.statsScore(s.stats) + Math.round(s.sp * ss.spRating) + ss.unique;
        ssShare = s.finals.filter((f) => Ra.statsScore(f.stats) + Math.round(f.sp * ss.spRating) + ss.unique >= ss.ss).length / s.finals.length;
        value += 1e6 * ssShare - 10 * Math.max(0, ss.ss - rating);
      }
      return Object.assign({}, s, { value, short: fit.short, skill: skillScore, rating, ssShare, scoring: fit.scoring, raceL: fit.L, fitCareers: fit.careers, heal });
    };
    const better = (a, b) => ss && a.ssShare !== b.ssShare ? a.ssShare > b.ssShare : a.value > b.value + 1e-6;
    // Parent decks: the floor comes from the deck the search starts from.
    const startFrom = (deck) => { if (giveUp != null && !ss) floor = (1 - giveUp) * Tr.deckSkills(opts, deck).value; };
    // A runner-up within twice the paired standard error of the winner (same careers) is a close call.
    const closeCall = (a, b) => {
      const n = Math.min(a.fitCareers.length, b.fitCareers.length);
      const d = Array.from({ length: n }, (_, i) => a.fitCareers[i] - b.fitCareers[i]);
      const mean = d.reduce((x, y) => x + y, 0) / Math.max(1, n);
      const se = n > 1 ? Math.sqrt(d.reduce((x, y) => x + (y - mean) * (y - mean), 0) / (n - 1) / n) : Infinity;
      const gap = a.value - b.value;
      return !(ss && a.ssShare !== b.ssShare) && gap < 2 * se ? { gap, se } : null;
    };
    return { Tr, ctxOf, evaluate, better, startFrom, closeCall, ss };
  }

  function targetSearch(opts, sim, start, pool, borrowPool) {
    const sc = fitScorer(opts, sim), Tr = sc.Tr, evaluate = sc.evaluate, better = sc.better, ss = sc.ss;
    const ctx = sc.ctxOf(FIT_RUNS);
    const comp = opts.comp || {};
    const locked = new Set(opts.locked || []);
    const cache = new Map();
    const testedDecks = new Map();
    const score = (deck) => {
      const k = deck.map((x) => x.id + ":" + x.lb).sort().join(",");
      if (!cache.has(k)) {
        cache.set(k, evaluate(deck, ctx));
        testedDecks.set(k, deck.map(x => Object.assign({}, x)));
      }
      return cache.get(k);
    };
    let deck = start.map((x) => ({ id: x.id, lb: x.lb, borrowed: !!x.borrowed }));
    sc.startFrom(deck);
    let cur = score(deck);
    const nOf = (cards, t) => cards.filter((x) => D.card(x.id).ty === t).length;
    const cap = opts.parent ? 2 : 1;
    const most = { friend: comp.friend != null ? comp.friend : Math.max(cap, nOf(deck, "friend")), group: comp.group != null ? comp.group : Math.max(cap, nOf(deck, "group")) };
    const slots = deck.map((_, i) => i).filter((i) => !locked.has(deck[i].id));
    const swaps = [];
    let step = 0, pass = 0, changed = false, pivots = null;
    const pivoted = [];
    // Borrow pivot, after the swaps: the borrow moves to another slot (the best friend's card of
    // that slot's type), and the old borrow slot takes one of your 3 best owned cards of its type.
    // Kept when the careers score better. Types stay, so the makeup does.
    function pivotJobs() {
      const b = deck.findIndex((x) => x.borrowed);
      if (b < 0 || locked.has(deck[b].id) || !borrowPool.length) return [];
      return deck.map((_, j) => j).filter((j) => j !== b && !locked.has(deck[j].id));
    }
    function pivot(j) {
      const b = deck.findIndex((x) => x.borrowed);
      if (b < 0 || j === b) return;
      const tj = D.card(deck[j].id).ty, tb = D.card(deck[b].id).ty;
      const restJ = deck.filter((_, k) => k !== j && k !== b);
      const lend = Tr.rank(opts, tj, restJ, borrowPool.filter((x) => D.card(x.id).ty === tj && !restJ.some((y) => y.id === x.id)))[0];
      if (!lend) return;
      const withLend = restJ.concat([{ id: lend.id, lb: lend.lb, borrowed: true }]);
      Tr.rank(opts, tb, withLend, pool.filter((x) => D.card(x.id).ty === tb && !withLend.some((y) => y.id === x.id))).slice(0, 3).forEach((own) => {
        const cand = deck.slice();
        cand[j] = { id: lend.id, lb: lend.lb, borrowed: true };
        cand[b] = { id: own.id, lb: own.lb, borrowed: false };
        if (new Set(cand.map((x) => D.card(x.id).cid)).size < cand.length) return;
        const v = score(cand);
        if (better(v, cur)) { pivoted.push({ from: deck[b].id, to: lend.id, own: own.id }); swaps.push({ out: deck[j].id, in: lend.id, inLb: lend.lb }, { out: deck[b].id, in: own.id, inLb: own.lb }); deck = cand; cur = v; }
      });
    }
    function next() {
      if ((pass >= 2 || !slots.length) && opts.borrowPivot !== false) {
        if (!pivots) pivots = pivotJobs();
        if (pivots.length) { pivot(pivots.shift()); return true; }
        return false;
      }
      if (pass >= 2 || !slots.length) return false;
      const i = slots[step % slots.length];
      const c = deck[i];
      const u = D.card(c.id).ty;
      const rest = deck.filter((_, j) => j !== i);
      const from = c.borrowed ? borrowPool : pool;
      let best = null;
      // A fixed type keeps its slot; free types can trade places.
      FIT_TYPES.filter((t) => (t === u || (comp[u] == null && comp[t] == null)) && !(most[t] != null && nOf(rest, t) >= most[t])).forEach((t) => {
        const cands = from.filter((x) => x.id !== c.id && D.card(x.id).ty === t);
        if (!cands.length) return;
        // Euophrys' best few, plus the 2 whose skill hints are worth the most on this course.
        const ranked = Tr.rank(opts, t, rest, cands), top = ranked.slice(0, FIT_PER_TYPE[t] || 4);
        ranked.slice(top.length).sort((a, b) => b.skill - a.skill).slice(0, SKILL_EXTRA).forEach((r) => { if (r.skill > 0) top.push(r); });
        top.forEach((r) => {
          const cand = deck.slice();
          cand[i] = { id: r.id, lb: r.lb, borrowed: c.borrowed };
          const v = score(cand);
          if (better(v, best ? best.v : cur)) best = { cand, v, in: r };
        });
      });
      if (best) { swaps.push({ out: c.id, in: best.in.id, inLb: best.in.lb }); deck = best.cand; cur = best.v; changed = true; }
      step++;
      if (step % slots.length === 0) { pass = changed ? pass + 1 : 2; changed = false; }
      return pass < 2 || opts.borrowPivot !== false;
    }
    // The start and final decks, rescored with more careers for the readout.
    function result() {
      const full = sc.ctxOf(16);
      // Validate every candidate actually evaluated by the cheap search, not just its winner.
      const finalists = new Map(testedDecks);
      const put = d => finalists.set(d.map(x => x.id + ":" + x.lb).sort().join(","), d);
      put(start); put(deck);
      const ranked = [...finalists.values()].map((d) => ({ cards: d.map((x) => Object.assign({}, x)), r: evaluate(d, full) }));
      ranked.sort((a, b) => (better(a.r, b.r) ? -1 : better(b.r, a.r) ? 1 : 0));
      // The best few, plus Euophrys' pick, again on careers no step above used (another seed,
      // more careers): picking the top of many noisy scores favors lucky decks. The winner is
      // the best there, and a runner-up within twice the paired standard error is a close call.
      const startKey = start.map((x) => x.id + ":" + x.lb).sort().join(",");
      const keyOf = (d) => d.map((x) => x.id + ":" + x.lb).sort().join(",");
      const top = ranked.slice(0, HELD_OUT_DECKS);
      if (!top.some((x) => keyOf(x.cards) === startKey)) top.push(ranked.find((x) => keyOf(x.cards) === startKey));
      const held = sc.ctxOf(HELD_OUT_RUNS, ((sim.seed || 12345) ^ 0x5bd1e995) >>> 0, true);
      const checked = top.filter(Boolean).map((x) => ({ cards: x.cards, r: evaluate(x.cards, held) }));
      checked.sort((a, b) => (better(a.r, b.r) ? -1 : better(b.r, a.r) ? 1 : 0));
      const winner = checked[0].cards;
      const after = checked[0].r;
      const before = (checked.find((x) => keyOf(x.cards) === startKey) || { r: evaluate(start, held) }).r;
      let close = null;
      if (checked[1]) {
        const cc = sc.closeCall(checked[0].r, checked[1].r);
        if (cc) close = { cards: checked[1].cards, gap: cc.gap, se: cc.se, est: checked[1].r };
      }
      const finalSwaps = [];
      const removed = start.filter(x => !winner.some(y => x.id === y.id && x.lb === y.lb && !!x.borrowed === !!y.borrowed));
      const added = winner.filter(x => !start.some(y => x.id === y.id && x.lb === y.lb && !!x.borrowed === !!y.borrowed));
      removed.forEach((x, i) => { if (added[i]) finalSwaps.push({out:x.id, in:added[i].id, inLb:added[i].lb}); });
      return { cards: winner, startCards: start.map((x) => Object.assign({}, x)), swaps: finalSwaps, pivoted, careerScore: opts.careerScore || "mean", before, after, target: ctx.target, caps: ctx.caps,
        scoring: after.scoring, close,
        validation: { runs:16, candidates:finalists.size, heldOut: { runs: HELD_OUT_RUNS, decks: checked.length }, method:"rescore-all-tested, best few on held-out careers" } };
    }
    return { next, result, progress: () => (slots.length ? Math.min(1, step / (slots.length * 2)) : 1) };
  }

  // ---- Every deck makeup: the best deck for each, then the best makeup ----
  // Every way to split the 6 cards (the borrowed one included) over the 7 types that your cards
  // could fill: at most o.max[type] of a type (Friend and Group up to 2 by default), each type
  // fixed in o.fixed kept, at least the must-include cards' types, and no more cards of a type
  // than you have characters for (one more for the borrowed slot when its pool has that type).
  // o: { pool, borrowPool, borrow, locked: [card ids], fixed: { type: n }, max, trainee }.
  const MAKEUP_MAX = { friend: 2, group: 2 };
  function makeupList(o) {
    const tr = o.trainee ? D.trainee(o.trainee) : null, tchar = tr ? tr.cid : null;
    const chars = (list) => { const by = {}; (list || []).forEach((x) => { const c = D.card(x.id); if (!c || c.cid === tchar) return; (by[c.ty] = by[c.ty] || new Set()).add(c.cid); }); return by; };
    const own = chars(o.pool), lend = chars(o.borrow ? o.borrowPool : []);
    const borrowSlot = o.borrow && (o.borrowPool || []).length ? 1 : 0;
    const fixed = o.fixed || {}, max = Object.assign({}, MAKEUP_MAX, o.max || {});
    const least = {};
    (o.locked || []).forEach((id) => { const c = D.card(id); if (c) least[c.ty] = (least[c.ty] || 0) + 1; });
    const out = [];
    const walk = (i, left, m) => {
      const t = FIT_TYPES[i];
      if (i === FIT_TYPES.length - 1) { m[t] = left; check(Object.assign({}, m)); return; }
      for (let n = 0; n <= left; n++) { m[t] = n; walk(i + 1, left - n, m); }
    };
    const check = (m) => {
      let fromBorrow = 0;
      for (const t of FIT_TYPES) {
        if (fixed[t] != null && m[t] !== +fixed[t]) return;
        if (max[t] != null && m[t] > max[t]) return;
        if (m[t] < (least[t] || 0)) return;
        const have = own[t] ? own[t].size : 0;
        if (m[t] > have) {
          if (m[t] > have + 1 || !(lend[t] && lend[t].size)) return;
          fromBorrow++;
        }
      }
      if (fromBorrow > borrowSlot) return;
      out.push(m);
    };
    walk(0, 6, {});
    return out;
  }
  // A makeup as text: "2 speed · 1 stamina · 1 power · 1 wit · 1 friend".
  const makeupKey = (m) => FIT_TYPES.filter((t) => m[t]).map((t) => m[t] + " " + t).join(" · ");

  // Runs Find my best deck over every makeup: (1) Euophrys' pick in each makeup (one shared
  // ranking cache), scored on the same FIT_RUNS careers as the search; (2) the o.finalists best
  // get the full targetSearch with their makeup held; (3) their winners are raced again on fresh
  // careers (a third seed, HELD_OUT_RUNS) and the best is the makeup to use; a runner-up within
  // the noise is a close call. A stepper like targetSearch: next() does a little, result() ends it.
  // o.makeups holds makeups ({ type: n }) or { comp, locked: [card ids] } (a guide makeup with its
  // scenario card); o.meta rides along to the result (which list it was).
  const SWEEP_FINALISTS = 5;
  const SWEEP_COST = 40; // a finalist's full search, in quick checks (for the progress bar)
  function makeupSweep(opts, sim, pool, borrowPool, o) {
    const sc = fitScorer(opts, sim);
    const quickCtx = sc.ctxOf(FIT_RUNS);
    const list = (o && o.makeups) || [];
    const K = (o && o.finalists) || SWEEP_FINALISTS;
    const rankCache = new Map();
    const rows = [];
    let i = 0, skipped = 0, fin = null, fi = 0, search = null;
    const unfilled = [];
    const lockOf = (extra) => [...new Set((opts.locked || []).concat(extra || []))];
    const slim = (r) => ({ value: r.value, stats: r.stats, sp: r.sp, raceL: r.raceL, short: r.short, skill: r.skill, ssShare: r.ssShare, rating: r.rating, scoring: r.scoring });
    function next() {
      if (i < list.length) {
        const it = list[i++], m = it.comp || it, locked = lockOf(it.locked);
        try {
          const deck = sc.Tr.pickDeck(Object.assign({}, opts, { comp: m, locked, rankCache }), pool, borrowPool).map((x) => ({ id: x.id, lb: x.lb, borrowed: !!x.borrowed }));
          if (deck.length === 6) rows.push({ comp: m, locked, start: deck, quick: slim(sc.evaluate(deck, quickCtx)) });
          else { skipped++; unfilled.push(makeupKey(m)); }
        } catch (err) { skipped++; unfilled.push(makeupKey(m)); }
        return true;
      }
      if (!fin) {
        if (!rows.length) throw new Error("None of the deck makeups could be filled with these cards. Mark more owned cards, or allow a borrowed card.");
        rows.sort((a, b) => (sc.better(a.quick, b.quick) ? -1 : sc.better(b.quick, a.quick) ? 1 : 0));
        fin = rows.slice(0, K);
        return true;
      }
      if (fi >= fin.length) return false;
      const f = fin[fi];
      if (!search) search = targetSearch(Object.assign({}, opts, { comp: f.comp, locked: f.locked }), sim, f.start, pool, borrowPool);
      if (search.next()) return true;
      f.fit = search.result();
      search = null;
      fi++;
      return fi < fin.length;
    }
    const total = () => list.length + K * SWEEP_COST;
    function progress() {
      const done = i + fi * SWEEP_COST + (search ? search.progress() * SWEEP_COST : 0);
      return Math.min(1, done / Math.max(1, total()));
    }
    // What the page shows while it runs.
    function status() {
      if (i < list.length || !fin) return `Makeup ${Math.min(i + 1, list.length)} of ${list.length}`;
      return `Best deck for makeup ${Math.min(fi + 1, fin.length)} of ${fin.length}`;
    }
    function result() {
      const fresh = sc.ctxOf(HELD_OUT_RUNS, ((sim.seed || 12345) ^ 0x2c1b3c6d) >>> 0, true);
      const checked = fin.filter((f) => f.fit).map((f) => ({ f, r: sc.evaluate(f.fit.cards, fresh) }));
      checked.sort((a, b) => (sc.better(a.r, b.r) ? -1 : sc.better(b.r, a.r) ? 1 : 0));
      const win = checked[0];
      const cc = checked[1] ? sc.closeCall(win.r, checked[1].r) : null;
      const best = rows[0].quick;
      const table = checked.map((x, k) => ({ comp: x.f.comp, key: makeupKey(x.f.comp), cards: x.f.fit.cards, finalist: k, check: slim(x.r), quick: x.f.quick, gap: x.r.value - win.r.value }))
        .concat(rows.slice(fin.length).map((x) => ({ comp: x.comp, key: makeupKey(x.comp), cards: x.start, finalist: null, quick: x.quick, gap: x.quick.value - best.value })));
      const fit = Object.assign({}, win.f.fit);
      if (cc) fit.close = { cards: checked[1].f.fit.cards, gap: cc.gap, se: cc.se, est: checked[1].r, makeup: makeupKey(checked[1].f.comp) };
      fit.makeups = { rows: table, tried: list.length, filled: rows.length, skipped, unfilled, finalists: checked.length, winner: makeupKey(win.f.comp),
        runs: { quick: FIT_RUNS, final: HELD_OUT_RUNS }, scoring: win.r.scoring, meta: (o && o.meta) || null };
      // Each finalist's own search result, for "Use this deck".
      const finals = checked.map((x) => Object.assign({}, x.f.fit, { makeups: fit.makeups, makeupComp: x.f.comp, makeupLocked: x.f.locked }));
      fit.makeupComp = win.f.comp;
      fit.makeupLocked = win.f.locked;
      finals[0] = fit;
      return { fit, comp: win.f.comp, locked: win.f.locked, finals };
    }
    return { next, result, progress, status, count: () => list.length };
  }

  // Paired, held-out seed checks, separate from the seeds used to search decks.
  // Ranges across assumptions are sensitivity diagnostics, not confidence bounds.
  function sensitivity(sim, candidates, settings = {}) {
    if (candidates.length < 2) throw new Error("Choose at least two decks to compare.");
    const seeds = settings.seeds || [857563, 962293, 1067023];
    const runs = settings.runs || 8;
    const defaults = { helloProcRate: sim.helloProcRate == null ? 0.4 : sim.helloProcRate, helloUnlockRate: sim.helloUnlockRate == null ? 0.15 : sim.helloUnlockRate, eventSuccessRate: sim.eventSuccessRate == null ? 0.5 : sim.eventSuccessRate, eventSongBoost: sim.eventSongBoost || 0, coupledEvents: sim.coupledEvents !== false };
    const proposed = settings.profiles || [
      { name: "Selected assumptions" }, { name: "Slow Hello", helloProcRate: 0.36, helloUnlockRate: 0.05 }, { name: "Fast Hello", helloProcRate: 0.45, helloUnlockRate: 0.3 },
      { name: "Conditional event success 25%", eventSuccessRate: 0.25 }, { name: "Conditional event success 75%", eventSuccessRate: 0.75 },
      { name: "No assumed song-rate boost", eventSongBoost: 0 }, { name: "Assumed chain rate +5% per level", eventSongBoost: 0.05 }, { name: "Assumed chain rate +10% per level", eventSongBoost: 0.1 },
      { name: "Legacy aggregate reward comparison", coupledEvents: false }
    ];
    const seen = new Set();
    const profiles = proposed.filter((p) => { const values = Object.assign({}, defaults, p); const key = Object.keys(defaults).map((k) => values[k]).join(":"); if (seen.has(key)) return false; seen.add(key); return true; });
    if (!profiles.length || !seeds.length) throw new Error("Sensitivity needs a profile and a seed.");
    const jobs = profiles.flatMap((profile, i) => seeds.map((seed) => ({ profile, i, seed })));
    const comparisons = profiles.map((profile) => candidates.slice(1).map((candidate) => ({ profile: profile.name, candidate: candidate.name, deltas: [] })));
    let at = 0;
    function next() {
      if (at >= jobs.length) return false;
      const job = jobs[at++];
      const ctx = buildCtx(Object.assign({}, sim, defaults, job.profile, { seed: job.seed, runs }));
      const scores = candidates.map((candidate) => {
        const result = simulate(ctx, candidate.cards.map((x) => ({ card: D.card(x.id), lb: x.lb })));
        return deckFit(ctx, result).value + ctx.skillWeight * result.skillValue;
      });
      comparisons[job.i].forEach((comparison, i) => comparison.deltas.push(scores[0] - scores[i + 1]));
      return at < jobs.length;
    }
    function result() {
      if (at < jobs.length) throw new Error("Sensitivity check is still running.");
      return { baseline: candidates[0].name, seeds: seeds.slice(), runsPerSeed: runs, profiles: profiles.map((p) => Object.assign({}, defaults, p)),
        comparisons: comparisons.flat().map((c) => ({ profile: c.profile, candidate: c.candidate, meanDelta: c.deltas.reduce((n, x) => n + x, 0) / c.deltas.length, minDelta: Math.min(...c.deltas), maxDelta: Math.max(...c.deltas), wins: c.deltas.filter((x) => x > 1e-6).length, ties: c.deltas.filter((x) => Math.abs(x) <= 1e-6).length })) };
    }
    return { next, result, progress: () => at / jobs.length };
  }

  // Cards you don't own (or own at a lower limit break) that would raise the deck most.
  // Each candidate is tried in place of the deck's weakest cards (swapSlots, by index).
  function wishlist(opts, deck, candidates, limit, swapSlots) {
    const ctx = buildCtx(opts);
    const tchar = opts.trainee ? (D.trainee(opts.trainee) || {}).cid : null;
    const quick = Math.max(4, Math.round(ctx.runs / 2));
    const sim = (cards) => simulate(Object.assign({}, ctx, { runs: quick }), cards).value;
    const base = sim(deck);
    const slots = swapSlots || deck.map((_, i) => i);
    const comp = opts.comp && Object.keys(opts.comp).length ? opts.comp : null;
    const ok = (rest, c) => compatible(rest, c, tchar) && compOK(rest.concat([c]), comp, 6);
    const out = [];
    candidates.forEach((c) => {
      if (tchar && c.card.cid === tchar) return;
      let best = -Infinity, swapOut = null;
      slots.forEach((i) => {
        const d = deck[i];
        if (!d || d.borrowed) return;
        const rest = deck.filter((_, j) => j !== i);
        if (!ok(rest, c)) return;
        const v = sim(rest.concat([c]));
        if (v > best) { best = v; swapOut = d; }
      });
      if (swapOut && best > base) out.push({ card: c.card, lb: c.lb, gain: best - base, share: (best - base) / base, replaces: swapOut.card });
    });
    return out.sort((a, b) => b.gain - a.gain).slice(0, limit || 8);
  }

  // Reads a pasted Umalator skill chart. Each row is a skill name, then Minimum, Maximum, Mean
  // and Median as "1.23 L" (a copied table may put the name on its own line). names: id -> name.
  function parseChart(text, names) {
    const norm = (x) => String(x).toLowerCase().replace(/\(inherited\)/g, "").replace(/[^a-z0-9○◎×☆!?\u3040-\u30ff\u4e00-\u9fff]+/g, "");
    const byName = new Map();
    Object.entries(names).forEach(([id, n]) => { const k = norm(n); if (!byName.has(k) || id[0] !== "9") byName.set(k, +id); });
    const values = {};
    let pending = "";
    let unknown = 0;
    const NUM = /(-?\d+(?:\.\d+)?)\s*L\b/g;
    String(text).split(/\r?\n/).forEach((line) => {
      const nums = Array.from(line.matchAll(NUM)).map((m) => +m[1]);
      if (nums.length >= 4) {
        const at = line.search(/-?\d+(?:\.\d+)?\s*L\b/);
        const name = (line.slice(0, at).trim() || pending).replace(/^[✕×x]\s+/, "");
        const id = byName.get(norm(name));
        if (id) values[id] = nums[3]; else unknown++;
        pending = "";
      } else if (/[A-Za-z\u3040-\u30ff\u4e00-\u9fff]/.test(line)) {
        pending = line.trim();
      }
    });
    return { values, unknown };
  }

  // Tier list: how much each candidate (card at a limit break) adds to the deck so far, like
  // Euophrys' tier list but from full simulated careers, with skills valued on the chosen race.
  // Candidates whose character is already in the deck are skipped.
  function tierScores(opts, deck, candidates, onProgress) {
    const ctx = buildCtx(opts);
    const tchar = opts.trainee ? (D.trainee(opts.trainee) || {}).cid : null;
    const sim = (cards) => simulate(Object.assign({}, ctx), cards);
    const base = sim(deck);
    const out = [];
    candidates.forEach((c, i) => {
      if (onProgress && i % 10 === 0) onProgress(i / candidates.length);
      if (!compatible(deck, c, tchar)) return;
      const r = sim(deck.concat([c]));
      out.push({
        id: c.card.id, lb: c.lb,
        score: r.value - base.value,
        train: r.trainValue - base.trainValue,
        skill: (r.skillValue - base.skillValue) * ctx.skillWeight,
        stats: r.stats.map((x, k) => x - base.stats[k]),
        sp: r.sp - base.sp,
        rainbows: r.rainbows - base.rainbows,
        topSkills: r.skills.filter((x) => x.src.indexOf(c.card.id) !== -1 && x.surplus > 0).slice(0, 3).map((x) => ({ id: x.id, L: x.L, p: x.p })),
      });
    });
    // A higher limit break is never worse in the game, so smooth out simulation noise.
    const byCard = {};
    out.forEach((x) => { (byCard[x.id] = byCard[x.id] || []).push(x); });
    Object.values(byCard).forEach((xs) => {
      xs.sort((a, b) => a.lb - b.lb);
      for (let k = 1; k < xs.length; k++) if (xs[k].score < xs[k - 1].score) xs[k].score = xs[k - 1].score;
    });
    if (onProgress) onProgress(1);
    return out.sort((a, b) => b.score - a.score);
  }

  // One request from the page (or its worker): card ids in, card ids out.
  //   { job: "optimize" | "wishlist", opts, pool, borrowPool, deck, candidates, swapSlots }
  function runJob(data, onProgress) {
    const Scen = root.UmaScenarios || (typeof require !== "undefined" ? require("./scenarios.js") : null);
    const sc = Scen.SCENARIOS.find((x) => x.id === data.opts.scenario) || Scen.SCENARIOS[0];
    const resolve = (list) => (list || []).map((c) => ({ card: D.card(c.id), lb: c.lb, borrowed: !!c.borrowed })).filter((c) => c.card);
    const ids = (list) => list.map((c) => ({ id: c.card.id, lb: c.lb, borrowed: !!c.borrowed }));
    const o = Object.assign({}, data.opts, { scenario: sc, pool: resolve(data.pool), borrowPool: resolve(data.borrowPool) });
    if (data.job === "tiers") {
      return { type: "tiers", list: tierScores(o, resolve(data.deck), resolve(data.candidates), onProgress) };
    }
    if (data.job === "wishlist") {
      const list = wishlist(o, resolve(data.deck), resolve(data.candidates), 10, data.swapSlots);
      return { type: "wishlist", list: list.map((w) => ({ id: w.card.id, lb: w.lb, gain: w.gain, share: w.share, replaces: w.replaces.id })) };
    }
    const r = optimize(o, onProgress);
    return {
      type: "result",
      cards: ids(r.cards), result: r.result, contrib: r.contrib, evals: r.evals,
      runnersUp: r.runnersUp.map((x) => ({ out: x.swap.out.card.id, in: x.swap.in.card.id, inLb: x.swap.in.lb, value: x.r.value, cards: ids(x.cards) })),
    };
  }

  const api = { inheritFrom, INSPIRATION_TURNS, makeupList, makeupKey, makeupSweep, fitScorer, MAKEUP_MAX, SWEEP_FINALISTS, grandConcertCalendar, optimize, simulate, wishlist, runJob, parseChart, tierScores, compOK, buildCtx, applyFocus, FOCUS_LEAN, statsValue, targetFit, deckFit, raceL, stepL, onCurve, raceValuesFor, STAMINA_MARGIN, targetSearch, sensitivity, L_VALUE, SP_VALUE, HINT_DISCOUNT };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaOptimizer = api;
})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : globalThis);
