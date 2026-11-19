// Local run diagnostics. Reports contain recorded inputs and model estimates;
// they do not turn an estimated reward into an observed in-game reward.
(function (root) {
  const E = root.UmaEngine || (typeof require !== "undefined" ? require("./engine.js") : null);
  const D = root.UmaDeck || (typeof require !== "undefined" ? require("./deck.js") : null);
  const VERSION = "20261017l";
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const vector = (x) => Array.from({ length: 5 }, (_, i) => Number.isFinite((x || [])[i]) ? x[i] : 0);
  const add = (a, b) => a.map((n, i) => n + b[i]);
  const subtract = (a, b) => a.map((n, i) => n - b[i]);
  const sum = (a) => a.reduce((n, x) => n + x, 0);
  const entered = (x) => x != null && x !== "";

  function inputs(state) {
    const out = {};
    ["scenario", "turn", "build", "energy", "maxEnergy", "mood", "risk", "stats", "trackStats", "caps", "targets", "priority", "sparks", "fans", "race", "raceName", "raceBonus", "goalRace", "goals", "goalsOff", "extras", "conditions", "badCondition", "practicePoor", "facilities", "facLevels", "calib", "fcal"].forEach((key) => {
      if (state[key] !== undefined) out[key] = state[key];
    });
    if (state.deck) out.deck = { trainee: state.deck.trainee, slots: (state.deck.slots || []).map((s) => s && { id: s.id, card: D.card(s.id) ? D.card(s.id).n : String(s.id), lb: s.lb, bond: s.bond, met: s.met, dates: s.dates }) };
    if (state.gm) out.gm = clone(state.gm);
    if (state.gl) {
      out.gl = {};
      ["tokens", "songs", "songPeriods", "lessons", "focus", "tokenTypes", "shop", "carry", "holdSong", "carriedPeriods", "hints", "pendingConcert", "finalizationEvent"].forEach((key) => { if (state.gl[key] !== undefined) out.gl[key] = state.gl[key]; });
    }
    return clone(out);
  }

  function progress(state, sc, turn = state.turn) {
    if (sc.id !== "grandlive") return null;
    const s = Object.assign({}, state, { turn });
    const plan = E.songPlan(s, sc), held = E.heldSong(s, sc);
    return { total: E.songsLearned(s), paid: Object.entries((s.gl || {}).songs || {}).filter(([id, at]) => sc.songs.some((x) => x.id === id) && at <= turn).length, periodPaid: plan ? plan.bought : 0, periodGuideTarget: plan ? plan.target : null, held: held ? held.id : null, hype: E.hypeStatus(s, sc), deadline: E.concertGoal(s) };
  }

  function checkpoint(state, sc) {
    return { turn: state.turn, energy: state.energy, maxEnergy: state.maxEnergy || 100, mood: state.mood, stats: clone(state.stats || {}), conditions: clone(state.conditions || {}), badCondition: !!state.badCondition, practicePoor: !!state.practicePoor,
      gm: state.gm ? clone(state.gm) : null,
      tokens: sc.id === "grandlive" ? vector((state.gl || {}).tokens) : null, songs: clone((state.gl || {}).songs || {}), lessons: clone((state.gl || {}).lessons || {}) };
  }

  // Pending events live outside the turn log. The existing pre-command Undo
  // snapshot restores them; completed events live on that command's log entry.
  function event(state, kind, details, turn = state.turn) {
    const item = Object.assign({ kind, turn, recordedTurn: state.turn }, clone(details || {}));
    const events = state.runPending || (state.runPending = []);
    const last = events[events.length - 1];
    if (kind === "balanceCorrection" && last && last.kind === kind && last.turn === turn && last.type === item.type) {
      last.after = item.after;
      last.delta = subtract(item.after, last.before);
    } else events.push(item);
    return item;
  }

  // Completed receipts survive clearing pendingConcert. Callers may name the
  // concert explicitly; otherwise record the most recent completed concert.
  function recordFinalization(state, sc, turn) {
    if (sc.id !== "grandlive") return null;
    const receipts = (state.gl || {}).finalizationEvent || {};
    const eventKey = turn == null ? (sc.lives || []).filter((t) => receipts[t]).slice(-1)[0] : turn;
    const finEvent = receipts[eventKey];
    if (!finEvent || finEvent.turn !== eventKey || !(sc.lives || []).includes(eventKey)) return null;
    const details = Object.assign({ concertIndex: sc.lives.indexOf(eventKey) }, finEvent);
    const matches = (e) => e.kind === "finalizeConcert" && e.turn === eventKey;
    const prior = (state.runPending || []).find(matches) || (state.log || []).flatMap((l) => (l.diagnostics || {}).events || []).find(matches);
    // An older marker can be completed from its actual receipt. Repeating this
    // before/after the event moves to a command log must not append another one.
    if (prior) Object.assign(prior, clone(details));
    else event(state, "finalizeConcert", details, eventKey);
    return finEvent;
  }

  function balanceCorrection(state, before, type) {
    const after = vector((state.gl || {}).tokens);
    if (before.every((n, i) => n === after[i])) return;
    event(state, "balanceCorrection", { type, before, after, delta: subtract(after, before) });
  }

  function purchase(state, buy, undo = false) {
    const originalAfter = JSON.parse(buy.after);
    const before = undo ? originalAfter : buy.before;
    const after = undo ? buy.before : originalAfter;
    event(state, undo ? "purchaseUndo" : "purchase", {
      id: buy.id, label: buy.label, before: vector(before.tokens), after: vector(after.tokens),
      spent: subtract(vector(before.tokens), vector(after.tokens)),
      shop: clone(before.shop || {}), learnedTurn: buy.id.startsWith("song:") ? buy.turn : null,
      energyBefore: before.energy, energyAfter: after.energy, statsBefore: before.stats, statsAfter: after.stats
    }, buy.turn);
  }

  function afterPurchase(state, sc, option) {
    const working = inputs(state);
    // Facility estimates depend on earlier logged trainings, which are omitted
    // from compact inputs. Resolve them from the original state before replay.
    working.facLevels = Object.fromEntries(E.STATS.map((stat) => [stat, E.facLevelFor(state, sc, stat)]));
    if (option.song) E.buySong(working, sc, option.song.id);
    if (option.tech) E.buyTechnique(working, sc, option.tech.id, option.tech.type);
    return working;
  }

  function income(state, sc, f, expected) {
    const requested = vector(), credited = vector(), lost = vector();
    const balances = vector((state.gl || {}).tokens), cap = E.tokenCap(state, sc);
    const sources = E.tokenGain(f, state, sc, expected).map((g) => {
      const amount = Math.max(0, g.amount), room = Math.max(0, cap - balances[g.type]);
      const take = Math.min(room, amount);
      requested[g.type] += amount; credited[g.type] += take; lost[g.type] += amount - take; balances[g.type] += take;
      const ex = f.extras || {};
      return { type: g.type, amount, credited: take, lostAtCap: amount - take, amountEstimated: !!g.est, typeAssumed: g.lh || !entered(g.second ? ex.tokType2 : ex.tokType), helloExpectation: !!g.lh };
    });
    return { requested, credited, lostAtCap: lost, sources, balances };
  }

  function optionInfo(option, state, sc) {
    if (!option) return null;
    const out = { kind: option.kind, stat: option.stat || null, label: option.label, prefix: option.prefix || [], value: option.value, parts: option.parts || {}, fail: option.fail, failEstimated: option.failEst, gainEstimated: option.gainEst, statGains: option.statGains, energyDelta: option.energyDelta, moodDelta: option.moodDelta, outing: option.outing, song: option.song, technique: option.tech, notes: option.notes || [] };
    if (option.selectionPolicy) out.selectionPolicy = option.selectionPolicy;
    if (option.performancePriority) out.performancePriority = option.performancePriority;
    if (sc.id === "grandlive" && option.kind === "train") {
      const working = afterPurchase(state, sc, option);
      const f = (working.facilities || []).find((x) => x.stat === option.stat);
      if (f) {
        const inc = income(working, sc, f, true);
        out.expectedPerformance = { facilityLevel: working.facLevels[option.stat], requested: inc.requested, usable: inc.credited, lostAtCap: inc.lostAtCap, failureAdjustedUsable: sum(inc.credited) * (1 - (option.fail || 0) / 100), sources: inc.sources };
      }
    }
    return clone(out);
  }

  function tokenFlow(before, after, sc, option, failed) {
    if (sc.id !== "grandlive") return null;
    const working = afterPurchase(before, sc, option);
    const opening = vector((before.gl || {}).tokens), paid = vector((working.gl || {}).tokens);
    const f = (working.facilities || []).find((x) => x.stat === option.stat);
    const training = option.kind === "train" && !failed && f ? income(working, sc, f, false) : { requested: vector(), credited: vector(), lostAtCap: vector(), sources: [], balances: paid };
    let calculated = training.balances.slice();
    const calendar = { requested: vector(), credited: vector(), lostAtCap: vector() };
    const deferredCalendar = { requested: vector(), credited: vector(), lostAtCap: vector() };
    const reward = E.calendarPerformance(before.turn, sc);
    // Check if AFTER state has a pending concert pointing to the BEFORE turn
    // This identifies the command that ENTERED the pending phase
    if (reward && after.gl && after.gl.pendingConcert && after.gl.pendingConcert.turn === before.turn) {
      const cap = reward.cap;
      calculated.forEach((n, i) => {
        const take = Math.max(0, Math.min(reward.amount, cap - n));
        deferredCalendar.requested[i] = reward.amount; deferredCalendar.credited[i] = take; deferredCalendar.lostAtCap[i] = reward.amount - take;
      });
      // Don't add to calculated: the performance is applied by finalizeConcert.
    } else if (reward) {
      const cap = reward.cap;
      calculated = calculated.map((n, i) => {
        const take = Math.max(0, Math.min(reward.amount, cap - n));
        calendar.requested[i] = reward.amount; calendar.credited[i] = take; calendar.lostAtCap[i] = reward.amount - take;
        return n + take;
      });
    }
    const closing = vector((after.gl || {}).tokens);
    return { before: opening, prefixedPurchaseSpent: subtract(opening, paid), afterPurchase: paid, training, calendar, deferredCalendar, after: closing, unreconciled: subtract(closing, calculated) };
  }

  function recordTurn(before, after, sc, recommendation, chosen, observed = {}) {
    const last = (after.log || []).slice(-1)[0];
    if (after === before || !last || last.turn !== before.turn) return;
    last.diagnostics = {
      v: 1, build: VERSION, recommended: optionInfo(recommendation && recommendation.action, before, sc),
      confidence: recommendation ? recommendation.confidence : null, typicalTrainingValue: recommendation ? recommendation.typ : null,
      recoveryComparison: recommendation && recommendation.recoveryComparison ? clone(recommendation.recoveryComparison) : null,
      chosen: optionInfo(chosen, before, sc), followedRecommendation: recommendation ? recommendation.action === chosen : null,
      options: ((recommendation && recommendation.ranked) || []).map((o) => optionInfo(o, before, sc)),
      result: { training: chosen.kind === "train" ? observed.result || "success" : null, outing: chosen.outingRoll ? observed.outing || "success" : null, cured: chosen.consume && chosen.consume.cureConditions ? observed.cured !== false : null, gotPracticePoor: !!observed.gotPracticePoor },
      events: clone(before.runPending || []), after: checkpoint(after, sc),
      performance: tokenFlow(before, after, sc, chosen, observed.result),
      concert: (sc.lives || []).includes(before.turn) ? progress(after, sc, before.turn) : null
    };
    delete after.runPending;
  }

  function build(state, sc, why, recommendation) {
    const errors = [], gaps = [], events = [];
    let prior = null;
    const turns = (state.log || []).map((l, index) => {
      let before = null;
      try { const parsed = JSON.parse(l.snapshot); if (parsed && Array.isArray(parsed.facilities)) before = parsed; } catch (_) { /* legacy/malformed entry remains readable */ }
      if (!before) errors.push(l.turn);
      if (prior != null && l.turn !== prior + 1) gaps.push({ after: prior, next: l.turn });
      prior = l.turn;
      const d = l.diagnostics ? clone(l.diagnostics) : null;
      if (d) events.push(...d.events.map((e) => Object.assign({ loggedWithTurn: l.turn }, e)));
      return Object.assign({ index, turn: l.turn, label: l.label, kind: l.kind, stat: l.stat, failed: l.failed || null, coverage: d ? "detailed" : "legacy", inputs: before ? inputs(before) : null, progressBeforeCommand: before ? progress(before, sc) : null }, d || { recommended: null, chosen: null, options: [], after: null, performance: null, concert: null });
    });
    events.push(...clone(state.runPending || []).map((e) => Object.assign({ pending: true }, e)));
    const totals = { recordedTrainingIncome: vector(), trainingLostAtCap: vector(), calendarIncome: vector(), calendarLostAtCap: vector(), observedRewardIncome: vector(), observedRewardLostAtCap: vector(), netPurchaseSpend: vector(), balanceCorrections: vector(), helloIncome: vector(), helloLostAtCap: vector(), unreconciled: vector() };
    const recordedConcertIncome = new Set();
    const hasActualAmounts = (amounts) => amounts && ["credited", "lostAtCap"].every((key) => Array.isArray(amounts[key]) && amounts[key].length === 5 && amounts[key].every(Number.isFinite));
    turns.forEach((t) => {
      const p = t.performance; if (!p) return;
      // Older versions recorded resolved calendar income on the command itself.
      // Reconciled actual amounts there remain evidence without a new receipt.
      if ((sc.lives || []).includes(t.turn) && hasActualAmounts(p.calendar) && (p.calendar.requested || []).some((n) => n > 0)
        && Array.isArray(p.unreconciled) && p.unreconciled.length === 5 && p.unreconciled.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e-9)) recordedConcertIncome.add(t.turn);
      totals.recordedTrainingIncome = add(totals.recordedTrainingIncome, p.training.credited);
      totals.trainingLostAtCap = add(totals.trainingLostAtCap, p.training.lostAtCap);
      totals.calendarIncome = add(totals.calendarIncome, p.calendar.credited);
      totals.calendarLostAtCap = add(totals.calendarLostAtCap, p.calendar.lostAtCap);
      // Deferred calendar performance is NOT counted here - it's a forecast.
      // It will be counted when finalizeConcert event records actual credited amounts.
      totals.netPurchaseSpend = add(totals.netPurchaseSpend, p.prefixedPurchaseSpent);
      totals.unreconciled = add(totals.unreconciled, p.unreconciled);
    });
    const countedConcerts = new Set();
    events.forEach((e) => {
      if (e.spent) totals.netPurchaseSpend = add(totals.netPurchaseSpend, e.spent);
      if (e.kind === "balanceCorrection") totals.balanceCorrections = add(totals.balanceCorrections, e.delta);
      if (e.kind === "finalizeConcert") {
        // Enrich saved marker-only events from actual receipts, never forecasts.
        // Work on the report's clones, and count each concert only once even if
        // an older save contains repeated finalization events.
        const receipt = ((state.gl || {}).finalizationEvent || {})[e.turn];
        if (receipt && receipt.turn === e.turn) Object.assign(e, clone(receipt));
        if (hasActualAmounts(e)) recordedConcertIncome.add(e.turn);
        if (!countedConcerts.has(e.turn) && (e.credited || e.lostAtCap)) {
          if (e.credited) totals.calendarIncome = add(totals.calendarIncome, e.credited);
          if (e.lostAtCap) totals.calendarLostAtCap = add(totals.calendarLostAtCap, e.lostAtCap);
          countedConcerts.add(e.turn);
        }
      }
      if (e.kind === "helloEvent") { totals.helloIncome[e.type] += e.credited; totals.helloLostAtCap[e.type] += e.amount - e.credited; }
      if (e.kind === "observedTokenReward") {
        totals.observedRewardIncome = add(totals.observedRewardIncome, e.credited);
        totals.observedRewardLostAtCap = add(totals.observedRewardLostAtCap, e.lostAtCap);
      }
    });
    const sources = turns.flatMap((t) => t.performance && t.performance.training ? t.performance.training.sources || [] : []);
    const observations = sc.id === "grandlive" ? {
      trainingSources: sources.length,
      enteredAmounts: sources.filter((s) => !s.amountEstimated).length,
      enteredTypes: sources.filter((s) => !s.typeAssumed).length,
      helloEventsLogged: events.filter((e) => e.kind === "helloEvent").length,
      helloTypesAssumed: events.filter((e) => e.kind === "helloEvent" && e.typeAssumed).length,
      helloCheckWithoutEvent: !!((state.extras || {}).lh20 || turns.some((t) => t.inputs && (t.inputs.extras || {}).lh20)) && !events.some((e) => e.kind === "helloEvent")
    } : null;
    const pendingConcert = (state.gl || {}).pendingConcert;
    const missingConcertIncomeTurns = sc.id === "grandlive" ? (sc.lives || []).filter((turn) => turn < state.turn
      && (!pendingConcert || pendingConcert.turn !== turn) && !recordedConcertIncome.has(turn)) : [];
    return {
      v: 2, kind: "run", build: VERSION, why: (why || "").trim(), scenario: sc.id,
      coverage: { loggedTurns: turns.length, detailedTurns: turns.filter((t) => t.coverage === "detailed").length, legacyTurns: turns.filter((t) => t.coverage === "legacy").length, unreadableSnapshots: errors, firstLoggedTurn: turns.length ? turns[0].turn : null, startsAfterTurnOne: turns.length ? turns[0].turn > 1 : state.turn > 1, gaps, currentTurn: state.turn, endsBeforeCurrentTurn: prior != null && prior !== state.turn - 1 && !(prior === state.turn && state.turn === sc.totalTurns), unreconciledTurns: turns.filter((t) => t.performance && t.performance.unreconciled.some((n) => Math.abs(n) > 1e-9)).map((t) => t.turn), concertIncomeComplete: missingConcertIncomeTurns.length === 0, missingConcertIncomeTurns },
      current: inputs(state), currentProgress: progress(state, sc), currentRecommendation: optionInfo(recommendation && recommendation.action, state, sc), currentOptions: ((recommendation && recommendation.ranked) || []).map((o) => optionInfo(o, state, sc)), runChecks: clone(state.runChecks || {}), checks: clone(E.runCheck(state, sc)),
      tokens: sc.tokens || [], totals, turns, events, observations,
      recoveryComparison: recommendation && recommendation.recoveryComparison ? clone(recommendation.recoveryComparison) : null,
      currentPeriodBudget: sc.id === "grandlive" ? E.periodSongBudget(state, sc) : null,
      concerts: (sc.lives || []).filter((turn) => turn < state.turn || turns.some((t) => t.turn === turn) || (state.gl && state.gl.pendingConcert && state.gl.pendingConcert.turn === turn)).map((turn) => {
        const logged = turns.filter((t) => t.turn === turn).slice(-1)[0];
        const pending = state.gl && state.gl.pendingConcert && state.gl.pendingConcert.turn === turn;
        const finalized = events.some((e) => e.kind === "finalizeConcert" && e.turn === turn);
        return { turn, recorded: !!logged, beforeCommand: logged ? logged.progressBeforeCommand : null, afterCommand: logged ? logged.concert : null, pending: !!pending, finalized: !!finalized };
      }),
      limits: ["Only inputs and actions recorded in this browser are included. Unticked offers and unrecorded purchases are unknown.", "Recorded training income can use formula amounts or assumed types; inspect each source. Preselected usual types are assumptions until edited. Expected Hello rewards never count as recorded income.", "Songs first ranks the entered one-command candidates by its exported criterion; unknown future shops, event outcomes and token types prevent a proof of the best whole career.", "Legacy entries preserve saved inputs. Their original recommendation, command outcome and between-command purchases are unavailable.", "Net purchase spend excludes backfilled songs and unrecorded purchases; entered balance corrections and observed token rewards remain separate."]
    };
  }

  function format(report, sc) {
    const c = report.coverage;
    const state = report.current;
    const lines = ["Uma coach detailed run report", sc.name + " · turn " + state.turn,
      report.why ? "What went wrong: " + report.why : "",
      "Stats: " + E.STATS.map((s) => E.STAT_LABELS[s] + " " + ((state.stats || {})[s] || "?")).join(", "),
      state.deck ? "Deck: " + state.deck.slots.filter(Boolean).map((s) => s.card + " LB" + s.lb + (s.bond != null ? " bond " + s.bond : "")).join(", ") : "",
      "Checks: " + (report.checks ? report.checks.items.map((c) => c.label + " " + c.status).join("; ") : "none"),
      "History: " + c.detailedTurns + " detailed turns, " + c.legacyTurns + " legacy turns.",
      c.startsAfterTurnOne || c.gaps.length || c.endsBeforeCurrentTurn || c.unreadableSnapshots.length ? "History has missing turns or inputs; see coverage." : "",
      report.currentProgress ? "Songs: " + report.currentProgress.total + " total; " + report.currentProgress.hype.since + " this concert period." + (report.currentProgress.paid != null ? " Shop purchases: " + report.currentProgress.paid + " total; " + report.currentProgress.periodPaid + "/" + report.currentProgress.periodGuideTarget + " this period's guide target (free/held songs excluded)." : "") : ""];
    if (sc.tokens) {
      const counts = (values) => sc.tokens.map((name, i) => name + " " + Math.round(values[i] * 100) / 100).join(", ");
      if ((c.missingConcertIncomeTurns || []).length) lines.push("Calendar income history is incomplete: actual concert rewards are unknown for turn(s) " + c.missingConcertIncomeTurns.join(", ") + ". Totals include recorded amounts only.");
      lines.push("Recorded training income (entered or estimated): " + counts(report.totals.recordedTrainingIncome), "Training income lost at cap: " + counts(report.totals.trainingLostAtCap), "Automatic calendar income: " + counts(report.totals.calendarIncome), "Observed all-token rewards: " + counts(report.totals.observedRewardIncome), "Net recorded purchase spend: " + counts(report.totals.netPurchaseSpend), "Entered balance corrections: " + counts(report.totals.balanceCorrections));
      if (report.observations) {
        const o = report.observations;
        lines.push("Training observations: " + o.enteredAmounts + "/" + o.trainingSources + " amounts entered; " + o.enteredTypes + "/" + o.trainingSources + " types entered. Actual Hello events logged: " + o.helloEventsLogged + ".");
        if (o.helloTypesAssumed) lines.push(o.helloTypesAssumed + " Hello event type(s) used the first tied-lowest color; amounts were recorded, colors remain assumed.");
        if (o.helloCheckWithoutEvent) lines.push("Hello's prior +20 is checked, but no actual Hello token event was logged. Balance corrections cannot identify its timing or type.");
      }
    }
    if (state.gm) {
      const g = state.gm, L = g.levels || {};
      lines.push("Goddess levels: Red " + (L.red || 0) + ", Blue " + (L.blue || 0) + ", Yellow " + (L.yellow || 0) + " (skill goddess " + (g.skill || "red") + "). Knowledge Table: " + ((g.table || []).join(", ") || "empty") + ".",
        "Wisdoms: " + ((g.wisdoms || []).map((w) => w.color + " on turn " + w.turn).join(", ") || "none logged") + ".");
    }
    report.concerts.forEach((c) => lines.push("Concert turn " + c.turn + (c.pending ? " (pending — Step on stage to resolve)" : c.finalized ? " (resolved)" : c.recorded ? "" : " (unrecorded)") + (c.afterCommand ? ": " + c.afterCommand.total + " total songs; " + c.afterCommand.hype.since + " this period; " + c.afterCommand.hype.need + " short of full Hype" : c.recorded ? "" : " (end-of-command progress unavailable)")));
    lines.push("Details include available inputs, recommendations, chosen commands, offers, purchases and token accounting. Missing observations stay unknown.");
    return lines.filter(Boolean).join("\n") + "\n\n" + JSON.stringify(report);
  }

  const api = { VERSION, inputs, event, balanceCorrection, purchase, recordTurn, build, format, recordFinalization };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaRunReport = api;
})(typeof window !== "undefined" ? window : globalThis);
