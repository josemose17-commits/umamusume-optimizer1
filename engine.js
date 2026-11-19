// Turn coach engine. Pure functions only, so it runs in the browser and in Node tests.
//
// Every option is scored in "value points" (roughly: one point of a fully useful stat):
//   stats + skill points + bonds + hints + scenario extras + energy + mood + failure risk.
// Energy is valued with a lookahead over the rest of the career: for each future turn and
// energy level it plans train / Wit / rest against a spread of good and bad turns, so a
// rest is only recommended when the energy is worth more later (camp coming up, failure
// climbing) than this turn's training.
(function (root) {
  const Deck = root.UmaDeck || (typeof require !== "undefined" ? require("./deck.js") : null);
  const Dates = root.UmaDates || (typeof require !== "undefined" ? require("./data/dates.js") : null);
  const CardEvents = root.UmaCardEvents || (typeof require !== "undefined" ? require("./data/card-events.js") : null);
  const Hello = root.UmaLightHello || (typeof require !== "undefined" ? require("./light-hello.js") : null);
  const Conditions = root.UmaConditions || (typeof require !== "undefined" ? require("./conditions.js") : null);
  const GMs = root.UmaGrandMasters || (typeof require !== "undefined" ? require("./grand-masters.js") : null);
  const STATS = ["speed", "stamina", "power", "guts", "wit"];
  const STAT_LABELS = { speed: "Speed", stamina: "Stamina", power: "Power", guts: "Guts", wit: "Wit" };
  const MOODS = ["Awful", "Bad", "Normal", "Good", "Great"];
  const MOOD_MULT = [0.8, 0.9, 1.0, 1.1, 1.2];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const YEARS = ["Junior", "Classic", "Senior"];

  // Which stats each training raises (share of the total gain) and its level-1 energy cost.
  // Splits follow the base training values; Wit restores energy instead of spending it.
  const FACILITY = {
    speed: { split: { speed: 0.67, power: 0.33 }, base: 12, cost: 21 },
    stamina: { split: { stamina: 0.7, guts: 0.3 }, base: 10, cost: 19 },
    power: { split: { power: 0.6, stamina: 0.4 }, base: 10, cost: 20 },
    guts: { split: { guts: 0.5, speed: 0.25, power: 0.25 }, base: 12, cost: 22 },
    wit: { split: { wit: 0.75, speed: 0.25 }, base: 8, cost: -5 }
  };
  const SP_RATE = { speed: 0.1, stamina: 0.1, power: 0.1, guts: 0.1, wit: 0.2 };
  const SP_VALUE = 0.35;

  // Stat weights and the point where more of a stat stops paying much ("enough").
  const BUILDS = {
    sprint: { label: "Sprint (≤1400m)", w: { speed: 1.0, stamina: 0.3, power: 0.85, guts: 0.4, wit: 0.75 }, target: { speed: 1600, stamina: 600, power: 1200, guts: 600, wit: 1100 } },
    mile: { label: "Mile (1600m)", w: { speed: 1.0, stamina: 0.45, power: 0.8, guts: 0.4, wit: 0.7 }, target: { speed: 1600, stamina: 800, power: 1200, guts: 600, wit: 1100 } },
    medium: { label: "Medium (2000-2400m)", w: { speed: 1.0, stamina: 0.65, power: 0.75, guts: 0.4, wit: 0.65 }, target: { speed: 1600, stamina: 1000, power: 1200, guts: 600, wit: 1000 } },
    long: { label: "Long (2500m+)", w: { speed: 1.0, stamina: 0.9, power: 0.65, guts: 0.45, wit: 0.6 }, target: { speed: 1500, stamina: 1300, power: 1100, guts: 700, wit: 1000 } },
    dirt: { label: "Dirt", w: { speed: 1.0, stamina: 0.5, power: 0.9, guts: 0.4, wit: 0.65 }, target: { speed: 1500, stamina: 800, power: 1400, guts: 600, wit: 1000 } }
  };

  // Approximate race rewards for a win (stats are spread across all five).
  const RACES = {
    op: { label: "OP / Pre-OP", sp: 20, stats: 5 },
    g3: { label: "G3", sp: 30, stats: 6 },
    g2: { label: "G2", sp: 35, stats: 8 },
    g1: { label: "G1", sp: 45, stats: 10 }
  };
  // Optional races cost energy; goal races (career objectives, finale races) don't.
  const RACE_ENERGY = 15;
  const REST_OUTCOMES = [[30, 0.2], [50, 0.5], [70, 0.3]];
  // Spread of future turn quality used by the energy lookahead (weak / normal / strong).
  const DRAWS = [[0.55, 0.3], [1.0, 0.45], [1.6, 0.25]];
  const DEFAULT_CAMP = [37, 38, 39, 40, 61, 62, 63, 64];

  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  function campTurns(sc) {
    return (sc && sc.campTurns) || DEFAULT_CAMP;
  }

  function isCamp(turn, sc) {
    return campTurns(sc).indexOf(turn) !== -1;
  }

  function turnInfo(turn, scenario) {
    const total = scenario ? scenario.totalTurns : 78;
    if (turn > 72) return { year: "Finale", text: "Finale · turn " + (turn - 72), short: "F" + (turn - 72), total };
    const y = Math.floor((turn - 1) / 24);
    const inYear = (turn - 1) % 24;
    const half = inYear % 2 === 0 ? "Early" : "Late";
    const month = MONTHS[Math.floor(inYear / 2)];
    return { year: YEARS[y], month, half, text: YEARS[y] + " · " + half + " " + month, short: half[0] + " " + month, total };
  }

  function phaseFor(turn, scenario) {
    const finaleStart = scenario && scenario.totalTurns < 78 ? scenario.totalTurns : 73;
    if (turn >= finaleStart) return { id: "finale", name: "Finale", tip: "Every turn counts. Energy has little value left, so take the strongest training and spend skill points before the last race." };
    if (turn <= 11) return { id: "predebut", name: "Pre-debut", tip: "Build bonds. Max your Wit and Speed focus cards first, then train where the most un-bonded cards gather, and use Wit to save energy." };
    if (turn <= 24) return { id: "junior", name: "Junior", tip: "Keep building bonds until most cards reach orange (80+). Take friendship trainings as they appear." };
    if (turn <= 36) return { id: "classic1", name: "Classic spring", tip: "Friendship trainings in your main stats come first. Arrive at summer camp with high energy and Good or Great mood." };
    if (turn <= 40) return { id: "camp1", name: "Classic summer camp", tip: "Facilities are at max level. Take every strong training, and rest (which also lifts mood) only when failure gets risky." };
    if (turn <= 48) return { id: "classic2", name: "Classic autumn", tip: "Keep stacking friendship trainings. Fill weak stats once your main ones are on track." };
    if (turn <= 60) return { id: "senior1", name: "Senior spring", tip: "Enter current stats so the coach can see your caps. Shift toward stats that are still short, and start buying key skills." };
    if (turn <= 64) return { id: "camp2", name: "Senior summer camp", tip: "Last camp. Use saved items and buffs here." };
    return { id: "senior2", name: "Senior autumn", tip: "Close the remaining stat gaps. Stats over 1200 count half, so skill points matter more now." };
  }

  // The trainee's career goals (GameTora objectives), as turn plan entries. Fixed goal races
  // are forced; "pick one" goals are forced only when every option is on the same turn;
  // fan and race-count goals are deadlines. Scenarios with their own goal races keep them.
  function traineeGoals(state, sc) {
    if (!Deck || !Deck.DATA || !Deck.DATA.objectives || !state || !state.deck || !state.deck.trainee || (sc && sc.goalTurns)) return [];
    const t = Deck.trainee(state.deck.trainee);
    const list = t && Deck.DATA.objectives[t.cid];
    if (!list) return [];
    const place = (g) => (g.v === 0 ? "enter" : g.v === 1 ? "win" : "top " + g.v);
    const last = Math.min(72, (sc && sc.totalTurns) || 72);
    const out = [];
    for (let i = 0; i < list.length;) {
      const g = list[i];
      if (g.ch) {
        let j = i;
        while (j < list.length && list[j].ch) j++;
        const grp = list.slice(i, j);
        const turns = Array.from(new Set(grp.map((x) => x.t)));
        const all = Array.from(new Set(grp.reduce((a, x) => a.concat(x.r), [])));
        if (turns.length === 1) {
          out.push({ turn: turns[0], forced: true, label: "Goal: " + all.join(" or ") + " (" + place(grp[0]) + ")", tip: "Career goal. Race whichever one your goal list shows." });
        } else {
          turns.forEach((tu) => {
            const here = Array.from(new Set(grp.filter((x) => x.t === tu).reduce((a, x) => a.concat(x.r), [])));
            out.push({ turn: tu, forced: false, choice: true, label: "Goal option: " + here.join(" or ") + " (" + place(grp.find((x) => x.t === tu)) + ")", tip: "Your goal is one of: " + all.join(", ") + ". Tap ★ on the turn of the race you pick." });
          });
        }
        i = j;
        continue;
      }
      if (g.c === 1 && g.r.length) out.push({ turn: g.t, forced: true, races: g.r, place: g.v, label: "Goal: " + g.r.join(" or ") + " (" + place(g) + ")", tip: g.t === 12 ? "Goal race: your debut." : "Career goal race." });
      else if (g.c === 3) out.push({ turn: g.t, forced: false, fans: g.v, label: "Goal: " + g.v.toLocaleString("en-US") + " fans by this turn", tip: "Race optional races before this if you're short of fans." });
      else out.push({ turn: g.t, forced: false, label: "Goal due", tip: "A career goal is due by this turn. Check the in-game goal list." });
      i++;
    }
    // Trackblazer swaps the career goals for Grade Point goals; only the debut stays.
    if (sc && sc.gradePoints) return out.filter((x) => x.turn === 12);
    return out.filter((x) => x.turn >= 1 && x.turn <= last);
  }

  // ---- Races and fans ----
  // The career race calendar (GameTora) gives every race on each turn with its fans by place.
  const GRADE_KEY = { 100: "g1", 200: "g2", 300: "g3", 400: "op", 700: "op" };
  const GRADE_LABEL = { 100: "G1", 200: "G2", 300: "G3", 400: "OP", 700: "Pre-OP" };
  const TYPICAL_FANS = { g1: 10500, g2: 5700, g3: 3800, op: 2300 }; // 1st place, median per grade
  const APT_RANK = "GFEDCBAS";
  const distIdx = (m) => (m <= 1400 ? 2 : m <= 1800 ? 3 : m <= 2400 ? 4 : 5);

  // Races on a turn the trainee can run well (B aptitude or better for surface and distance).
  function racesAt(state, turn) {
    const all = (Deck && Deck.DATA && Deck.DATA.races) || [];
    const t = state.deck && state.deck.trainee && Deck ? Deck.trainee(state.deck.trainee) : null;
    return all.filter((r) => r.t === turn && (!t || (APT_RANK.indexOf(t.apt[r.s === 2 ? 1 : 0]) >= 5 && APT_RANK.indexOf(t.apt[distIdx(r.d)]) >= 5)));
  }

  function fanBonus(state) {
    if (!Deck || !state.deck || !state.deck.slots) return 0;
    return state.deck.slots.reduce((a, sl) => {
      const c = sl && Deck.card(sl.id);
      return a + (c ? Deck.baseEffects(c, Deck.levelFor(c, sl.lb))[16] || 0 : 0);
    }, 0);
  }

  // Expected fans from a race: 60% a win and 40% about 3rd (a goal's placing is only the minimum).
  function expectedFans(state, race) {
    const f = race.f;
    const base = 0.6 * f[0] + 0.4 * f[2];
    return Math.round(base * (1 + fanBonus(state) / 100));
  }

  // The race a goal turn holds, from the goal list and the calendar.
  function goalRaceAt(state, sc, turn) {
    const g = traineeGoals(state, sc).find((x) => x.forced && x.turn === turn && x.races);
    if (!g) return null;
    const r = ((Deck && Deck.DATA && Deck.DATA.races) || []).find((x) => x.t === turn && g.races.indexOf(x.n) !== -1);
    if (r) return { race: r, place: g.place };
    // The debut isn't in the calendar: about 700 fans for a win.
    if (g.races.some((n) => /Debut/.test(n))) return { race: { n: g.races[0], g: 900, f: [700, 280, 175, 105, 70] }, place: g.place };
    return null;
  }

  const bestRaceAt = (state, turn, have) => racesAt(state, turn).filter((r) => (r.need || 0) <= have)
    .map((r) => ({ race: r, fans: expectedFans(state, r) })).sort((a, b) => b.fans - a.fans)[0] || null;

  // Fans from goal races on this turn (they happen anyway).
  function fromGoalsBefore(state, sc, forced) {
    const gr = forced.has(state.turn) ? goalRaceAt(state, sc, state.turn) : null;
    return gr ? expectedFans(state, gr.race) : 0;
  }

  // Plans the next fan goal: how many fans are still needed after the goal races before it, and
  // whether to race now, whether racing now is free (it doesn't add a race), or whether bigger
  // races later cover it. status: met | covered | urgent | efficient | wait | short.
  function fanPlan(state, sc) {
    const goal = traineeGoals(state, sc).find((g) => g.fans && g.turn >= state.turn);
    if (!goal) return null;
    const have = state.fans || 0;
    const plan = { goal, have, need: Math.max(0, goal.fans - have), turnsLeft: goal.turn - state.turn };
    if (plan.need <= 0) return Object.assign(plan, { status: "met" });
    const forced = forcedTurns(state, sc);
    let fromGoals = 0;
    for (let t = state.turn; t < goal.turn; t++) {
      if (!forced.has(t)) continue;
      const gr = goalRaceAt(state, sc, t);
      if (gr) fromGoals += expectedFans(state, gr.race);
    }
    const left = plan.need - fromGoals;
    plan.fromGoals = fromGoals;
    plan.left = Math.max(0, left);
    if (left <= 0) return Object.assign(plan, { status: "covered" });
    // Later races, checking entry requirements against the fans you'd have by then. A race
    // you can only enter after one more race (prior) costs that extra race too.
    const laterFrom = (base) => {
      const out = [];
      let goalsSoFar = 0;
      let unlockTurn = false; // an earlier free turn with an open race, to reach entry fans
      for (let t = state.turn + 1; t < goal.turn; t++) {
        if (forced.has(t)) { const gr = goalRaceAt(state, sc, t); if (gr) goalsSoFar += expectedFans(state, gr.race); continue; }
        const all = racesAt(state, t).map((r) => ({ race: r, fans: expectedFans(state, r), prior: (r.need || 0) > base + goalsSoFar }));
        const open = all.filter((x) => !x.prior).sort((a, b) => b.fans - a.fans);
        const reach = all.filter((x) => !x.prior || unlockTurn).sort((a, b) => b.fans - a.fans);
        if (reach.length) out.push(Object.assign({ turn: t }, reach[0]));
        if (open.length) unlockTurn = true;
      }
      return out;
    };
    // Fewest races to cover n fans: biggest first, one per turn, plus one for a race that needs
    // more fans to enter unless an earlier pick gets you there.
    const count = (n, list) => {
      const sorted = list.slice().sort((a, b) => b.fans - a.fans);
      const used = new Set();
      let k = 0, sum = 0;
      for (const x of sorted) {
        if (sum >= n) break;
        if (used.has(x.turn)) continue;
        used.add(x.turn);
        sum += x.fans;
        k += 1;
        if (x.prior && !sorted.some((y) => used.has(y.turn) && y.turn < x.turn && y !== x)) k += 1;
      }
      return sum >= n ? k : Infinity;
    };
    const now = forced.has(state.turn) ? null : (state.raceName && racesAt(state, state.turn).find((r) => r.n === state.raceName)) || null;
    const nowBest = forced.has(state.turn) ? null : now ? { race: now, fans: expectedFans(state, now) } : bestRaceAt(state, state.turn, have);
    const later = laterFrom(have + fromGoalsBefore(state, sc, forced));
    const laterIfRace = nowBest ? laterFrom(have + nowBest.fans + fromGoalsBefore(state, sc, forced)) : later;
    const kLater = count(left, later);
    const kNow = nowBest ? 1 + (left - nowBest.fans <= 0 ? 0 : count(left - nowBest.fans, laterIfRace)) : Infinity;
    plan.now = nowBest;
    plan.racesNeeded = Math.min(kLater, kNow);
    // Races saved by racing now (each one is a turn you get back for training).
    plan.saves = kLater !== Infinity && kNow !== Infinity ? Math.max(0, kLater - kNow) : 0;
    if (kLater === Infinity) plan.status = nowBest && kNow < Infinity ? "urgent" : "short";
    else if (nowBest && kNow <= kLater) plan.status = "efficient";
    else plan.status = "wait";
    later.sort((a, b) => b.fans - a.fans);
    plan.picks = later.slice(0, Math.max(1, Math.min(4, kLater === Infinity ? 4 : kLater)));
    plan.tight = kLater !== Infinity && new Set(later.map((x) => x.turn)).size - kLater <= 1;
    // Few spare turns left: racing when you can is safer.
    if (plan.status === "wait" && later.length - kLater <= 1 && nowBest) plan.status = "efficient";
    return plan;
  }

  function fanPlanText(plan, sc) {
    if (!plan) return "";
    const n = (x) => Math.round(x).toLocaleString("en-US");
    const head = "Fan goal: " + n(plan.goal.fans) + " by turn " + plan.goal.turn + " (" + turnInfo(plan.goal.turn, sc).text + "). You have " + n(plan.have) + ".";
    if (plan.status === "met") return head + " Already reached.";
    if (plan.status === "covered") return head + " Your goal races before then should cover the other " + n(plan.need) + ".";
    const picks = (plan.picks || []).map((x) => x.race.n + " (turn " + x.turn + ", ~" + n(x.fans) + ")").join(", ");
    const rest = n(plan.left) + " more needed" + (plan.fromGoals ? " after your goal races" : "");
    if (plan.status === "urgent") return head + " " + rest + ", and later races can't cover it: race now (" + plan.now.race.n + ", ~" + n(plan.now.fans) + ").";
    if (plan.status === "short") return head + " " + rest + ", more than the races that fit you before then can give. Missing a career goal ends the run, so race every chance you get" + (plan.now ? " (now: " + plan.now.race.n + ")" : "") + ", and race ones outside your best distance if you must.";
    if (plan.status === "efficient") return head + " " + rest + ": racing now (" + plan.now.race.n + ", ~" + n(plan.now.fans) + ") " + (plan.saves ? "saves " + plan.saves + " race" + (plan.saves > 1 ? "s" : "") + " later, so it's worth a training turn." : "fits your plan without adding a race, so it's listed as an option against training.");
    const why = plan.now ? "races later give as much or more" : "no race that fits you is on this turn";
    return head + " " + rest + ": about " + plan.racesNeeded + " race(s) do it" + (picks ? " (" + picks + ")" : "") + ". " + (plan.tight ? "That's nearly every race that fits you before the deadline, so don't skip them. " : "") + "You can keep training now: " + why + ".";
  }

  // ---- Trackblazer Grade Points ----
  // Grade Points a win pays, by race grade (GameTora). Lower places pay less.
  const GP_BY_G = { 100: 100, 200: 80, 300: 60, 400: 40, 700: 20 };
  const GP_BY_KEY = { g1: 100, g2: 80, g3: 60, op: 40 };
  const gpOf = (r) => GP_BY_G[r.g] || 20;

  // The Grade Point goal in force on this turn. Each is due at the end of Late December; dirt
  // specialists and sprint-only turf trainees get lower targets (sc.gradePoints).
  function gradeGoal(state, sc) {
    const gp = sc && sc.gradePoints;
    if (!gp) return null;
    const i = gp.due.findIndex((d) => d >= state.turn);
    if (i === -1) return null;
    const t = state.deck && state.deck.trainee && Deck ? Deck.trainee(state.deck.trainee) : null;
    const ok = (a) => APT_RANK.indexOf(a) >= 5;
    let kind = "turf";
    if (t && ok(t.apt[1]) && !ok(t.apt[0])) kind = "dirt";
    else if (t && ok(t.apt[2]) && !ok(t.apt[3]) && !ok(t.apt[4]) && !ok(t.apt[5])) kind = "sprint";
    return { due: gp.due[i], goal: gp[kind][i], kind, n: i };
  }

  // Plans the Grade Point goal like fanPlan, counting wins: how many races still do it, and
  // whether later races that fit the trainee can cover it. The coach keeps the count (gpNeed)
  // as you race; type your real number in when you place lower than 1st.
  // status: met | ok | tight | urgent | short.
  function gradePlan(state, sc) {
    const g = gradeGoal(state, sc);
    if (!g) return null;
    const x = state.extras || {};
    const need = x.gpNeed != null && x.gpDue === g.due ? Math.max(0, +x.gpNeed || 0) : g.goal;
    const plan = Object.assign({}, g, { need, turnsLeft: g.due - state.turn });
    if (need <= 0) return Object.assign(plan, { status: "met" });
    const forced = forcedTurns(state, sc);
    const have = state.fans || 0;
    const list = [];
    for (let t = state.turn; t <= g.due; t++) {
      if (forced.has(t)) continue;
      let rs = racesAt(state, t);
      if (t === state.turn) {
        const picked = state.raceName && rs.find((r) => r.n === state.raceName);
        rs = picked ? [picked] : rs.filter((r) => !have || (r.need || 0) <= have);
      }
      const best = rs.sort((a, b) => gpOf(b) - gpOf(a) || b.f[0] - a.f[0])[0];
      if (best) list.push({ turn: t, race: best, gp: gpOf(best) });
    }
    const count = (n, arr) => {
      if (n <= 0) return 0;
      let k = 0, sum = 0;
      for (const v of arr.map((a) => a.gp).sort((a, b) => b - a)) { sum += v; k += 1; if (sum >= n) return k; }
      return Infinity;
    };
    const now = list.length && list[0].turn === state.turn ? list[0] : null;
    const later = list.filter((a) => a.turn > state.turn);
    const kLater = count(need, later);
    plan.now = now;
    plan.racesNeeded = Math.min(kLater, now ? 1 + count(need - now.gp, later) : Infinity);
    plan.spare = kLater === Infinity ? 0 : later.length - kLater;
    plan.picks = later.slice().sort((a, b) => b.gp - a.gp || a.turn - b.turn).slice(0, kLater === Infinity ? 4 : Math.min(4, kLater));
    if (kLater === Infinity) plan.status = now ? "urgent" : "short";
    else plan.status = plan.spare <= 2 ? "tight" : "ok";
    return plan;
  }

  function gradePlanText(plan, sc) {
    if (!plan) return "";
    const kind = plan.kind === "dirt" ? " (dirt target)" : plan.kind === "sprint" ? " (sprint target)" : "";
    const head = "Grade Points: " + plan.need + " of " + plan.goal + kind + " still needed by turn " + plan.due + " (" + turnInfo(plan.due, sc).text + ").";
    if (plan.status === "met") return "Grade Point goal for this year is done. Extra points don't carry over, so race now for coins, stats and fans.";
    const picks = (plan.picks || []).map((a) => a.race.n + " (turn " + a.turn + ", " + a.gp + ")").join(", ");
    if (plan.status === "urgent") return head + " Later races that fit you can't cover it: race now (" + plan.now.race.n + ", " + plan.now.gp + " for a win).";
    if (plan.status === "short") return head + " That's more than the races that fit you can pay, even winning them all. Missing it ends the run: race every turn you can, outside your best distance if you must.";
    const n = plan.racesNeeded;
    const spare = plan.spare === 0 ? "No spare race turns left before then, so don't skip any." : "Only " + plan.spare + " spare race turn" + (plan.spare === 1 ? "" : "s") + " left before then, so race when you can.";
    return head + " " + (n === 1 ? "One win does it" : "About " + n + " wins do it") + (picks ? " (" + picks + ")" : "") + ". " +
      (plan.status === "tight" ? spare : "Plenty of race turns left.") +
      " Counting wins; lower places pay less, so fix the number if you place lower.";
  }

  // ---- Reset advice ----
  // Is this run still worth playing? At each reset point (sc.resetChecks, plus bonds going into
  // Classic) the coach asks you a question or two, with its own guess, and on a miss says
  // reset: start over, or carry on and finish the run (your call, remembered). Career goals
  // the races can't reach count in every mode. state.resetMode: "ace" (default), "finish"
  // (goals only) or "off". Answers and decisions: state.runChecks[key] = { a: { question:
  // answer }, decision: "continue" }.
  // Item status: ask (questions open), ok (passed), reset (missed: reset or continue), warn (a
  // miss that's only a warning), continued (missed, finishing anyway), wait (coming up), done
  // (the run is over). The verdict is the most pressing one.
  const isStatCard = (sl) => sl.card.ty !== "friend" && sl.card.ty !== "group";
  // The coach's bonds come from logged turns; with fewer than half logged they're estimates.
  const bondsStale = (state) => state.turn > 6 && (state.log || []).length < (state.turn - 1) / 2;
  const isYes = (v) => v === "yes";
  const isNo = (v) => v === "no";
  const numAns = (v) => (v == null || v === "" || isNaN(+v) ? null : +v);
  // Each check: (state, sc, window, answers) -> { label, kind, questions, result, why }.
  // result: "pass", "fail" or null (still open); why: text for wait / ask / ok / fail.
  const RESET_CHECKS = {
    // Grand Concert (CM ace guide): one card rainbowing or Light Hello's +20 event by the debut.
    debut(state, sc, c, a) {
      const x = state.extras || {};
      const deck = deckInfo(state);
      const lh = !deck || deck.used.some((sl) => sl.card.n === "Light Hello");
      const rb = deck ? deck.used.filter((sl) => isStatCard(sl) && sl.bond >= 80) : [];
      const aL = a.lh20 != null ? a.lh20 : x.lh20 ? "yes" : undefined;
      const questions = [{
        id: "rainbow", type: "yesno", text: "Is any stat card's bond orange (80+), so it can rainbow?", answer: a.rainbow,
        guess: deck && !bondsStale(state) ? (rb.length ? "yes" : "no") : null,
        guessWhy: rb.length ? rb.map((sl) => sl.card.n).join(", ") + " at 80+" : "no stat card at 80+ in the coach's count"
      }];
      if (lh && !isYes(a.rainbow)) questions.push({ id: "lh20", type: "yesno", text: "Has Light Hello given her +20 event (Another Day's Hard Work!)?", answer: a.lh20, guess: x.lh20 ? "yes" : null, guessWhy: "a Light Hello +20 event is recorded for this career" });
      const result = isYes(a.rainbow) || isYes(aL) ? "pass" : isNo(a.rainbow) && (!lh || isNo(aL)) ? "fail" : null;
      return {
        label: "Debut check", kind: "reset", questions, result,
        why: {
          wait: "On turn " + c.at + " (your debut) the coach asks whether a card is rainbowing" + (lh ? " or Light Hello has given her +20 event" : "") + ". The guide resets on " + (lh ? "neither" : "no") + ".",
          ask: "By the debut the guide wants one stat card at friendship (orange bond)" + (lh ? " or Light Hello's +20 event" : "") + ", or it resets (around 85% of CM-ace runs here do).",
          ok: "Passed. Keep going.",
          fail: "No card at friendship" + (lh ? " and no Light Hello +20 event" : "") + " by the debut: the guide resets here."
        }
      };
    },
    // Grand Concert: 5 songs bought in year one and a 6th showing, held for after the 1st live.
    songs1(state, sc, c, a) {
      const gl = state.gl || {};
      const marked = Object.entries(gl.songs || {}).filter(([id, t]) => t >= 5 && glPeriodFor(sc, id, state) === 0).length;
      const n = numAns(a.songs);
      const questions = [
        { id: "songs", type: "number", text: "How many shop songs have you bought? Exclude the free Make Debut! and the held song.", answer: n, guess: marked, sure: marked > 0, guessWhy: marked ? "your purchased songs (free Make Debut! excluded)" : "none marked yet" },
        { id: "sixth", type: "yesno", text: "Is a 6th song showing in your lessons, held to buy right after the live?", answer: a.sixth,
          guess: Object.keys((state.gl && state.gl.shop) || {}).some((k) => k.indexOf("song:") === 0) ? "yes" : null, guessWhy: "a song is ticked in your shop" }
      ].filter((q) => q.id !== "sixth" || n == null || n >= 5);
      const result = n != null && n < 5 ? "fail" : isNo(a.sixth) ? "fail" : n != null && isYes(a.sixth) ? "pass" : null;
      return {
        label: "Year one paid-song guide target", kind: "reset", questions, result,
        why: {
          wait: "On turn " + c.at + " the coach asks about your songs: the guide wants 5 bought and a 6th showing by the 1st Promo Live (turn " + sc.lives[0] + ").",
          ask: "Year-one plan: 5 songs bought, then 2 more technique lessons so a 6th shows, held for after the live. The guide resets if you can't manage it.",
          ok: "Year-one song plan done. Keep going.",
          fail: (n != null && n < 5 ? "Only " + n + " of 5 purchased songs" : "No 6th shop song showing") + ": below the strict ace guide target. Make Debut! and a held song do not count as purchases. This is a high-roll guide target, not a requirement for Great Success: 3 total songs fill Hype. Five purchases plus 16 unlock techniques cost about 375 points; funding the held song is additional. Buy useful mastery songs during the run so their training bonuses can work, and preserve the colors for later songs."
        }
      };
    },
    // Mecha (game8): S in every Upgrade Exam; any A restarts the run.
    exam(state, sc, c, a) {
      const r = a.rank;
      return {
        label: "Upgrade Exam " + c.n, kind: "reset",
        questions: [{ id: "rank", type: "choice", options: [["S", "S"], ["A", "A"], ["B", "B or lower"]], text: "What rank did you get in Upgrade Exam " + c.n + "?", answer: r }],
        result: r === "S" ? "pass" : r ? "fail" : null,
        why: {
          wait: "Upgrade Exam " + c.n + " on turn " + c.at + ": game8 restarts the run on any A, so keep your Research Levels up for an S.",
          ask: "Once you see the rank: an A or lower means reset for an ace (game8).",
          ok: "S rank. Keep going.",
          fail: (r === "A" ? "A" : "B or lower") + " in exam " + c.n + ": game8 restarts the run on any A when building an ace."
        }
      };
    },
    // Onsen (game8): fewer than 2 springs dug by Junior November is a bad start.
    springs(state, sc, c, a) {
      const n = numAns(a.springs);
      return {
        label: "Springs dug", kind: "reset",
        questions: [{ id: "springs", type: "number", text: "How many springs have you finished digging?", answer: n }],
        result: n == null ? null : n >= 2 ? "pass" : "fail",
        why: {
          wait: "On turn " + c.at + " (Junior November) the coach asks how many springs you've dug: fewer than 2 is a reset (game8).",
          ask: "game8 calls fewer than 2 springs by Junior November a bad start: reset.",
          ok: "Good start. Keep going.",
          fail: "Only " + n + " spring" + (n === 1 ? "" : "s") + " by Junior November: game8 says reset."
        }
      };
    },
    // Every scenario: most stat cards at friendship going into Classic (a rule of thumb for
    // aces, so a miss is only a warning).
    bonds(state, sc, c, a) {
      const deck = deckInfo(state);
      const stat = deck ? deck.used.filter(isStatCard) : [];
      const rb = stat.filter((sl) => sl.bond >= 80).length;
      return {
        label: "Bonds", kind: "warn",
        questions: [{
          id: "most", type: "yesno", text: "Are most of your stat cards (60% or more) at friendship, with an orange bond?", answer: a.most,
          guess: stat.length && !bondsStale(state) ? (rb / stat.length >= 0.6 ? "yes" : "no") : null,
          guessWhy: stat.length ? "the coach counts " + rb + " of " + stat.length : ""
        }],
        result: isYes(a.most) ? "pass" : isNo(a.most) ? "fail" : null,
        why: {
          wait: "Going into Classic the coach asks how many stat cards are at friendship.",
          ask: "Aces usually have most stat cards at friendship by Classic.",
          ok: "Bonds on track. Keep going.",
          fail: "Most stat cards aren't at friendship going into Classic, so training will be weaker than an ace needs. Not a reset on its own, but with another miss it's a good time to start over."
        }
      };
    }
  };
  const RESET_RANK = { reset: 6, ask: 5, warn: 4, done: 3, continued: 2, wait: 1, ok: 0 };

  // One check in its window (c: { from, at, to }): coming up, asking, passed, or missed. A
  // miss stays until you choose to reset or continue.
  function checkItem(state, sc, c, key, check) {
    const t = state.turn;
    if (t < c.from) return null;
    const e = (state.runChecks && state.runChecks[key]) || {};
    const a0 = e.a || {};
    let r = check(state, sc, c, a0);
    // What the coach already knows (bonds from your deck, songs you've marked, Light Hello's
    // +20 tick) answers itself; you're only asked the rest. An answer you give still wins.
    const auto = {};
    (r.questions || []).forEach((q) => { if (a0[q.id] == null && q.guess != null && q.sure !== false) auto[q.id] = q.guess; });
    if (Object.keys(auto).length && t >= c.at) {
      r = check(state, sc, c, Object.assign({}, auto, a0));
      (r.questions || []).forEach((q) => { if (auto[q.id] != null && a0[q.id] == null) q.auto = true; });
    }
    const item = { key, label: r.label, kind: r.kind, questions: r.questions };
    if (r.result === "fail") {
      const status = e.decision === "continue" ? "continued" : r.kind === "warn" ? "warn" : "reset";
      if (status === "continued" && t > c.to) return null;
      return Object.assign(item, { status, why: r.why.fail });
    }
    if (t < c.at) return { key, label: r.label, kind: r.kind, status: "wait", why: r.why.wait };
    if (t > c.to) return null;
    return Object.assign(item, r.result === "pass" ? { status: "ok", why: r.why.ok } : { status: "ask", why: r.why.ask });
  }

  function runCheck(state, sc) {
    const mode = state.resetMode || "ace";
    if (mode === "off") return null;
    const items = [];
    const runChecks = state.runChecks || {};
    // Career goals: missing one ends the run, so a goal the races can't reach is a reset.
    const goalItem = (key, label, plan, text) => {
      if (!plan || plan.status !== "short") return;
      if ((runChecks[key] || {}).decision === "continue") return;
      const left = plan.turnsLeft;
      // Races outside your aptitudes can still save it, so it's a reset only at the very end.
      items.push({ key, label, kind: left <= 2 ? "reset" : "warn", status: left <= 2 ? "reset" : "warn", why: text + (left <= 2 ? " With " + left + " turn" + (left === 1 ? "" : "s") + " left the run is lost: reset." : " Race everything you can, outside your aptitudes too; if it still falls short, reset.") });
    };
    const fp = fanPlan(state, sc);
    if (fp) goalItem("fans" + fp.goal.turn, "Fan goal", fp, "Even winning every race that fits you, you're short of " + Math.round(fp.left || fp.need).toLocaleString("en-US") + " fans by turn " + fp.goal.turn + ".");
    const gp = gradePlan(state, sc);
    if (gp) goalItem("gp" + gp.due, "Grade Points", gp, "Even winning every race that fits you, you can't reach " + gp.need + " Grade Points by turn " + gp.due + ".");
    if (mode === "ace") {
      (sc.resetChecks || []).forEach((c) => {
        const check = RESET_CHECKS[c.id];
        if (!check) return;
        if (c.turns) c.turns.forEach((T, i) => { const it = checkItem(state, sc, { from: T - 2, at: T, to: T + 3, n: i + 1 }, c.id + (i + 1), check); if (it) items.push(it); });
        else { const it = checkItem(state, sc, c, c.id, check); if (it) items.push(it); }
      });
      if (deckInfo(state)) { const it = checkItem(state, sc, { from: 22, at: 24, to: 27 }, "bonds", RESET_CHECKS.bonds); if (it) items.push(it); }
    }
    // The end of the run: a last chance to copy the run summary.
    if (state.turn >= sc.totalTurns) items.push({ key: "end", label: "Run finished", kind: "info", status: "done", why: "Copy the run summary if anything in this run looked off, so the coach can be fixed." });
    if (!items.length) return null;
    const verdict = items.reduce((a, it) => (RESET_RANK[it.status] > RESET_RANK[a] ? it.status : a), "ok");
    return { verdict, mode, items };
  }

  // Goal race turns that come from the trainee's goals, minus any you unmarked.
  function autoGoalTurns(state, sc) {
    const off = new Set(state.goalsOff || []);
    return new Set(traineeGoals(state, sc).filter((g) => g.forced && !off.has(g.turn)).map((g) => g.turn));
  }

  function isGoalTurn(state, sc, turn) {
    return (state.goals || []).indexOf(turn) !== -1 || autoGoalTurns(state, sc).has(turn);
  }

  function forcedTurns(state, sc) {
    const set = new Set(state.goals || []);
    autoGoalTurns(state, sc).forEach((t) => set.add(t));
    if (sc.finale && sc.finale.forced) sc.finale.turns.forEach((t) => set.add(t));
    (sc.goalTurns || []).forEach((t) => set.add(t));
    return set;
  }

  function eventsFor(turn, scenario, state) {
    const out = [];
    const evs = scenario.events || [];
    // The scenario's own debut entry already covers the trainee's debut goal.
    const debutEv = evs.some((e) => e.turn === 12 && /debut/i.test(e.label));
    const tg = traineeGoals(state, scenario).filter((g) => g.turn === turn && !(turn === 12 && debutEv));
    if (turn === 12 && !debutEv && !tg.length) out.push({ turn, label: "Make Debut", tip: "Goal race." });
    const camps = campTurns(scenario);
    if (camps.indexOf(turn + 1) !== -1 && camps.indexOf(turn) === -1) out.push({ turn, label: "Camp next turn", tip: "Energy carried into camp is worth more than usual." });
    if (camps.indexOf(turn) !== -1 && camps.indexOf(turn - 1) === -1) out.push({ turn, label: "Summer camp starts", tip: "Four turns at max facility level." });
    evs.forEach((e) => { if (e.turn === turn) out.push(e); });
    const ny = NEW_YEAR[turn + 1];
    if (ny && turn + 1 <= scenario.totalTurns) out.push({ turn, label: "New Year next turn", tip: "The New Year event at the start of next turn offers +" + ny.e + " energy (or stats or " + ny.sp + " skill points), so spending energy now costs little: take the energy if you're low, the stats if you're not." });
    if (scenario.finale && scenario.finale.forced && scenario.finale.turns.indexOf(turn) !== -1) out.push({ turn, label: scenario.finale.name, tip: scenario.finale.note });
    tg.forEach((g) => out.push({ turn, label: g.label, tip: g.tip }));
    if (state && (state.goals || []).indexOf(turn) !== -1 && !tg.some((g) => g.forced)) out.push({ turn, label: "Goal race", tip: "You marked this turn as a goal race." });
    return out;
  }

  // Typical total gain of a turn's best training in URA, by stage of the career.
  function typGainAt(t, sc) {
    if (t > 72) return 45;
    if (isCamp(t, sc)) return t <= 48 ? 48 : 55;
    if (t <= 12) return 16;
    if (t <= 24) return 22;
    if (t <= 36) return 30;
    if (t <= 48) return 36;
    if (t <= 60) return 40;
    return 42;
  }

  // Your deck's strength compared with the scenario default, learned from logged gains.
  function calibFactor(state) {
    const c = (state.calib || []).slice(-12).filter((x) => x > 0);
    if (c.length < 3) return 1;
    const s = c.slice().sort((a, b) => a - b);
    const mid = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    return clamp(mid, 0.5, 2.5);
  }

  function typAt(t, sc, calib) {
    return typGainAt(t, sc) * (sc.gainScale || 1) * (calib || 1) * 0.8;
  }

  function facilityLevel(t, sc) {
    if (isCamp(t, sc)) return 5;
    if (t <= 24) return 1.5;
    if (t <= 36) return 2.5;
    if (t <= 48) return 3;
    if (t <= 60) return 3.5;
    return 4.5;
  }

  // Energy a training spends at level 1 (negative = it restores energy), from the scenario's
  // base values when known (U.A.F.'s Wit costs 15, for example).
  function baseCost(stat, sc) {
    if (sc && sc.train && sc.train[stat]) return -sc.train[stat][6];
    return FACILITY[stat].cost;
  }

  function energyCost(stat, t, sc, level) {
    const c = baseCost(stat, sc);
    return c < 0 ? c : c + 1.5 * ((level || facilityLevel(t, sc)) - 1);
  }

  // Failure estimate from energy, used when the failure box is left blank.
  function estimateFail(stat, energy) {
    if (stat === "wit") return clamp(Math.round((28 - energy) * 1.0), 0, 95);
    return clamp(Math.round((52 - energy) * 1.15), 0, 95);
  }

  // Total gain estimate from card counts, used when the gain box is left blank.
  function estimateGain(f, state, sc, calib) {
    const cards = f.cards || 0;
    const rb = Math.min(f.rainbows || 0, cards);
    const base = FACILITY[f.stat].base + (facLevelFor(state, sc, f.stat) - 1) * 1.3;
    return (base + 3.5 * cards) * (1 + 0.06 * cards) * Math.pow(1.3, rb) * MOOD_MULT[state.mood] * (sc.gainScale || 1) * (calib || 1);
  }

  function bondK(t) {
    if (t <= 12) return 0.25;
    if (t <= 24) return 0.18;
    if (t <= 36) return 0.08;
    if (t <= 48) return 0.03;
    return 0.01;
  }

  // Blue sparks raise stat caps at the start of a run (GameTora, Game8): +4 for a 1-star
  // spark, +9 for 2 stars, +16 for 3 stars. Typed per stat as the stars of each spark ("3 3 2").
  const SPARK_UNCAP = [0, 4, 9, 16];
  function sparkUncap(text) {
    return String(text || "").split(/[^0-9]+/).filter(Boolean)
      .reduce((a, x) => a + (+x >= 1 && +x <= 3 ? SPARK_UNCAP[+x] : 0), 0);
  }

  // The caps the coach uses: your typed cap, else the scenario's base cap plus spark uncaps.
  function capsFor(state, sc) {
    const caps = {};
    const userCaps = state.caps || {};
    const sparks = state.sparks || {};
    STATS.forEach((s, i) => {
      caps[s] = userCaps[s] > 0 ? userCaps[s] : (sc.caps ? sc.caps[i] : 1200) + sparkUncap(sparks[s]);
    });
    return caps;
  }

  // How far behind its target each stat is, relative to the others (1 = average). A stat
  // well short of its target counts for more, so the coach balances toward every target
  // instead of always taking the heaviest-weighted stat. Same idea as the optimizer's need.
  const NEED = 1.5;
  function needFactors(stats, target, w) {
    const raw = {};
    const known = STATS.filter((s) => +stats[s] > 0 && target[s] > 0);
    if (known.length < 3) return null;
    known.forEach((s) => { raw[s] = 1 + NEED * Math.max(0, 1 - stats[s] / target[s]); });
    const avgKnown = known.reduce((a, s) => a + raw[s], 0) / known.length;
    STATS.forEach((s) => { if (raw[s] == null) raw[s] = avgKnown; });
    const sumW = STATS.reduce((a, s) => a + w[s], 0);
    const norm = STATS.reduce((a, s) => a + w[s] * raw[s], 0) / sumW;
    const out = {};
    STATS.forEach((s) => { out[s] = raw[s] / norm; });
    return out;
  }

  // Since the July 2026 update, a stat past 1200 gains only half from training (Game8).
  function trainedGain(stat, g, stats) {
    const cur = +(stats || {})[stat];
    if (!(cur > 0) || !(g > 0)) return g;
    if (cur >= 1200) return g / 2;
    return cur + g <= 1200 ? g : (1200 - cur) + (cur + g - 1200) / 2;
  }

  // How a training's total gain splits across stats: the scenario's base values when known,
  // else the generic split.
  function splitFor(stat, sc) {
    const row = sc && sc.train && sc.train[stat];
    if (row) {
      const tot = row.slice(0, 5).reduce((a, b) => a + Math.max(0, b), 0);
      if (tot > 0) {
        const out = {};
        STATS.forEach((st, i) => { if (row[i] > 0) out[st] = row[i] / tot; });
        return out;
      }
    }
    return FACILITY[stat].split;
  }

  // Your stat priority (Stats panel), most important first, replaces the build's stat weights:
  // 1, 0.85, 0.72, 0.6, 0.48 by rank. Targets still decide when a stat has had enough.
  const PRIORITY_W = [1, 0.85, 0.72, 0.6, 0.48];
  function validPriority(p) {
    return Array.isArray(p) && p.length === 5 && STATS.every((s) => p.indexOf(s) !== -1);
  }
  function statWeights(state) {
    const p = state && state.priority;
    if (validPriority(p)) {
      const w = {};
      p.forEach((s, i) => { w[s] = PRIORITY_W[i]; });
      return w;
    }
    return (BUILDS[state && state.build] || BUILDS.medium).w;
  }
  // The build's own order, most important first (what the priority boxes start from).
  function buildPriority(build) {
    const w = (BUILDS[build] || BUILDS.medium).w;
    return STATS.slice().sort((a, b) => w[b] - w[a]);
  }

  // How much a typical training is still worth for your stats: 1 while they're below 1200 and
  // their targets, less once they're past them (a point past 1200 trains half and counts half;
  // past the target it counts 0.4; at the cap nothing). Each stat counts by its weight, since
  // that's how often you train it. The value of energy and mood comes from the trainings it
  // buys later, so it shrinks by the same factor; never above 1.
  function statSaturation(stats, target, caps, w, need) {
    let num = 0, den = 0;
    STATS.forEach((k) => {
      const x = +stats[k];
      const ww = w[k] * w[k];
      den += ww;
      if (!(x > 0)) { num += ww; return; }
      let m = need ? need[k] : 1;
      if (x >= caps[k]) m = 0;
      else {
        if (x >= 1200) m *= 0.25;
        if (x >= target[k]) m *= 0.4;
      }
      num += ww * m;
    });
    return den > 0 ? clamp(num / den, 0.3, 1) : 1;
  }

  function makeCtx(state, sc) {
    const build = BUILDS[state.build] || BUILDS.medium;
    const sw = statWeights(state);
    const caps = capsFor(state, sc);
    const calib = calibFactor(state);
    const target = Object.assign({}, build.target, state.targets || {});
    STATS.forEach((k) => { target[k] = Math.min(target[k], caps[k]); });
    const ctx = {
      state, sc, calib, caps,
      w: sw,
      // Your own targets (the Stats table) override the build's; none goes past the cap.
      target,
      need: needFactors(state.stats || {}, target, sw),
      stats: state.stats || {},
      E: clamp(Math.round(state.energy), 0, state.maxEnergy || 100),
      maxE: state.maxEnergy || 100,
      camp: isCamp(state.turn, sc),
      turnsLeft: sc.totalTurns - state.turn,
      typ: typAt(state.turn, sc, calib)
    };
    ctx.sat = statSaturation(ctx.stats, target, caps, sw, ctx.need);
    ctx.typ *= ctx.sat;
    ctx.deck = deckInfo(state);
    ctx.focus = focusCards(ctx.deck, state);
    ctx.songs = songBonuses(state, sc);
    ctx.boost = sc.train ? scenarioBoost(state, sc) : 1;
    ctx.V = continuation(state, sc, calib).map((v) => v * ctx.sat);
    ctx.gainValue = (stat, g) => gainValue(stat, g, ctx);
    // Fixed events at the end of this turn (URA's summer snack) land whatever you do.
    const evNow = (sc.energyEvents && sc.energyEvents[state.turn]) || 0;
    ctx.evNow = evNow;
    ctx.energyValue = (delta) => ctx.V[clamp(Math.round(ctx.E + delta + evNow), 0, ctx.maxE)] - ctx.V[clamp(ctx.E + evNow, 0, ctx.maxE)];
    ctx.moodStep = (from) => moodStepValue(from, state, sc, calib) * ctx.sat;
    ctx.avgW = STATS.reduce((a, s) => a + sw[s], 0) / STATS.length;
    return ctx;
  }

  function pointValue(stat, x, ctx) {
    if (x >= ctx.caps[stat]) return 0;
    let k = ctx.w[stat] * (ctx.need ? ctx.need[stat] : 1);
    if (x >= 1200) k *= 0.5;
    if (x >= ctx.target[stat]) k *= 0.4;
    return k;
  }

  // Value of g points of a stat, walking past 1200, the build target and the cap.
  function gainValue(stat, g, ctx) {
    const cur = +ctx.stats[stat];
    if (!(cur > 0)) return g * ctx.w[stat];
    const end = cur + g;
    const marks = [1200, ctx.target[stat], ctx.caps[stat]].filter((p) => p > cur && p < end).sort((a, b) => a - b);
    let v = 0;
    let x = cur;
    marks.concat([end]).forEach((p) => { v += (p - x) * pointValue(stat, x, ctx); x = p; });
    return v;
  }

  // Value of one mood step up from `from`: about +10% on the trainings of the next ~8 turns,
  // fading a little each turn because random events can knock mood back down.
  // Goal races in the next 3 turns add value too, since mood also affects race results.
  function moodStepValue(from, state, sc, calib) {
    if (from >= 4 || from < 0) return 0;
    if (Conditions.has(state, "migraine") && from >= state.mood) return 0;
    const forced = forcedTurns(state, sc);
    let sum = 0;
    let races = 0;
    for (let t = state.turn + 1, n = 0; t <= sc.totalTurns && n < 8; t++, n++) {
      if (forced.has(t)) { if (n < 3) races++; continue; }
      sum += typAt(t, sc, calib) * Math.pow(0.93, n);
    }
    const raceBoost = from < 3 ? races * 0.3 * typAt(state.turn, sc, calib) : 0;
    return (0.1 / MOOD_MULT[from]) * sum * 0.6 + raceBoost;
  }

  // Start-of-turn New Year events, common to every scenario: Classic Early January's New Year's
  // Resolutions (Energy +20, Stat +10 or 20 SP) and Senior Early January's Shrine Visit (Energy
  // +30, all stats +5 or 35 SP), then a raffle.
  const NEW_YEAR = { 25: { e: 20, stats: 10, sp: 20 }, 49: { e: 30, stats: 25, sp: 35 } };

  // Lookahead: V[e] = expected value of the turns after this one, starting with energy e.
  function continuation(state, sc, calib) {
    const maxE = state.maxEnergy || 100;
    const forced = forcedTurns(state, sc);
    const clampE = (e) => (e < 0 ? 0 : e > maxE ? maxE : Math.round(e));
    const avgCost = ["speed", "stamina", "power", "guts"].reduce((a, st) => a + baseCost(st, sc), 0) / 4;
    const witBase = baseCost("wit", sc);
    const bw = statWeights(state);
    const avgW = STATS.reduce((a, st) => a + bw[st], 0) / STATS.length;
    let next = new Float64Array(maxE + 1);
    for (let t = sc.totalTurns; t > state.turn; t--) {
      const cur = new Float64Array(maxE + 1);
      const typ = typAt(t, sc, calib);
      const regen = (t > 72 && sc.finaleEnergy ? sc.finaleEnergy : 0) + ((sc.energyEvents && sc.energyEvents[t]) || 0);
      const restGain = isCamp(t, sc) ? 40 : 50;
      const lv = facilityLevel(t, sc);
      const cost = avgCost + 1.5 * (lv - 1);
      const witDelta = witBase < 0 ? -witBase : -(witBase + 1.5 * (lv - 1));
      for (let e = 0; e <= maxE; e++) {
        if (forced.has(t)) { cur[e] = next[clampE(e - (sc.goalRaceEnergy || 0) + regen)]; continue; }
        const rest = next[clampE(e + restGain + regen)];
        const fw = estimateFail("wit", e) / 100;
        const wit = 0.4 * typ - fw * 0.9 * typ + next[clampE(e + witDelta + regen)];
        const f = estimateFail("speed", e) / 100;
        const after = next[clampE(e - cost + regen)];
        let v = 0;
        for (let i = 0; i < DRAWS.length; i++) {
          const q = DRAWS[i][0] * typ;
          const train = q - f * (q + 0.5 * typ) + after;
          v += DRAWS[i][1] * Math.max(train, wit, rest);
        }
        cur[e] = v;
      }
      // New Year (Classic and Senior Early January): the event at the start of the turn offers
      // energy (+20, then +30) or stats/skill points, so arriving low on energy costs little.
      const ny = NEW_YEAR[t];
      if (ny && t <= sc.totalTurns) {
        const w = cur.slice();
        const alt = Math.max(ny.stats * avgW, ny.sp * SP_VALUE);
        for (let e = 0; e <= maxE; e++) cur[e] = Math.max(w[clampE(e + ny.e)], w[e] + alt);
      }
      next = cur;
    }
    return next;
  }

  // ---- Deck mode: real card effects and the game's training formula ----

  // The deck in use: slots with their card, level and current bond. Null when no cards are set.
  function deckInfo(state) {
    if (!Deck || !Deck.DATA || !state.deck) return null;
    const slots = (state.deck.slots || []).map((sl, i) => {
      const card = sl && sl.id ? Deck.card(sl.id) : null;
      if (!card) return null;
      const level = Deck.levelFor(card, sl.lb);
      const bond = sl.bond != null ? sl.bond : Deck.initialBond(card, level);
      return { idx: i, card, level, bond };
    });
    const used = slots.filter(Boolean);
    if (!used.length) return null;
    const trainee = state.deck.trainee ? Deck.trainee(state.deck.trainee) : null;
    return {
      slots,
      used,
      trainee,
      growth: trainee ? trainee.g : [0, 0, 0, 0, 0],
      deckTypes: new Set(used.map((s) => s.card.ty)).size,
      totalBond: used.reduce((a, s) => a + s.bond, 0),
      raceBonus: used.reduce((a, s) => a + (Deck.baseEffects(s.card, s.level)[15] || 0), 0)
    };
  }

  // Training facility level: your override, else 5 at camp, else counted from logged trainings
  // (most scenarios level a facility every 4 trainings), else an estimate for the stage.
  // Facility level. Your choice wins; camp is always 5. Otherwise it follows the scenario's rule:
  //  "count" (most): +1 level per 4 trainings there, counted from the log, with turns you didn't
  //          log filled in from your training mix, plus scenario bonuses (L'Arc Expectation
  //          gauge, Onsen bathing parties);
  //  "rank"  (Unity Cup): follows team rank, so it's estimated from the stage of the career;
  //  "discipline" (U.A.F.): follows the discipline level, estimated from the stage.
  const DEFAULT_SHARE = { speed: 0.3, stamina: 0.15, power: 0.2, guts: 0.1, wit: 0.25 };
  function facLevelFor(state, sc, stat) {
    const o = state.facLevels && state.facLevels[stat];
    if (o) return o;
    if (isCamp(state.turn, sc)) return 5;
    const t = state.turn;
    const rule = sc.levelRule || "count";
    if (rule === "rank") return t <= 16 ? 1 : t <= 30 ? 2 : t <= 44 ? 3 : t <= 60 ? 4 : 5;
    if (rule === "discipline") return t <= 20 ? 1 : t <= 34 ? 2 : t <= 46 ? 3 : t <= 58 ? 4 : 5;
    const log = state.log || [];
    const loggedTurns = new Set(log.map((l) => l.turn));
    // Summer camp facilities are all level 5 for the camp only: training there doesn't count
    // toward the facility's real level.
    const trains = log.filter((l) => l.kind === "train" && !l.failed && !isCamp(l.turn, sc));
    const mine = trains.filter((l) => l.stat === stat).length;
    const forced = forcedTurns(state, sc);
    let unlogged = 0;
    for (let x = 1; x < t; x++) if (!loggedTurns.has(x) && !forced.has(x) && !isCamp(x, sc)) unlogged++;
    const share = trains.length >= 4 ? (mine + 0.5) / (trains.length + 2.5) : DEFAULT_SHARE[stat];
    const est = mine + unlogged * 0.78 * share;
    const bonus = sc.levelBonus ? sc.levelBonus(state) : 0;
    return Math.max(1, Math.min(5, 1 + Math.floor(est / 4) + bonus));
  }

  // Multiplier for scenario bonuses the card formula doesn't model (Unity training, island
  // facilities, springs...). Learned from your real gains once you type a few.
  function defaultBoost(sc) {
    if (sc.formulaBoost) return sc.formulaBoost;
    const avg = STATS.reduce((a, st) => a + sc.train[st].slice(0, 5).reduce((x, y) => x + y, 0), 0) / 5;
    return clamp((sc.gainScale || 1) * 15.6 / avg, 1, 2.2);
  }

  // A typed gain should be the total (every green number added up), but it's easy to type only
  // the training's own stat. Whichever estimate the number is closer to (as a ratio) is the
  // one it's compared with. est: the formula's gains by stat (halved past 1200).
  function typedGainBasis(typed, est, stat) {
    const total = est.reduce((a, b) => a + b, 0);
    const main = est[STATS.indexOf(stat)] || 0;
    if (!(total > 0)) return { base: 0, main: false };
    if (main > 0 && main < total * 0.9 && Math.abs(Math.log(typed / main)) < Math.abs(Math.log(typed / total))) return { base: main, main: true };
    return { base: total, main: false };
  }

  // Learning samples for the scenario multiplier: for each training whose gain you typed, what
  // the game showed over what the formula predicts at the default multiplier. The game shows
  // gains past 1200 already halved, so the prediction is halved the same way.
  function calibSamples(state, sc) {
    if (!sc.train || !deckInfo(state)) return [];
    const ctx = makeCtx(state, sc);
    const db = defaultBoost(sc);
    const out = [];
    (state.facilities || []).forEach((f) => {
      if (!(f.gain > 0)) return;
      const dg = deckGain(f, ctx);
      if (!dg || !(dg.rawTotal > 0)) return;
      const est = dg.gains.map((g, i) => trainedGain(STATS[i], (g / dg.boost) * db, ctx.stats));
      const b = typedGainBasis(+f.gain, est, f.stat);
      if (b.base > 0) out.push(f.gain / b.base);
    });
    return out;
  }

  // Rebuilds the learned multiplier from your logged turns (each keeps the state it was played
  // from), for saves that learned it the old way.
  function relearnCalib(state, sc) {
    const out = [];
    (state.log || []).forEach((l) => {
      if (!l.snapshot) return;
      try { calibSamples(JSON.parse(l.snapshot), sc).forEach((x) => out.push(x)); } catch (e) { /* skip a broken snapshot */ }
    });
    return out.slice(-12);
  }

  function scenarioBoost(state, sc) {
    let b = defaultBoost(sc);
    const c = (state.fcal || []).slice(-12).filter((x) => x > 0).sort((x, y) => x - y);
    // The formula uses your cards' real effects, so a deck far weaker than that is more likely
    // a typing slip than real: the learned multiplier stays within 0.7x-1.6x.
    if (c.length >= 2) b *= clamp(c[Math.floor(c.length / 2)], 0.7, 1.6);
    return b;
  }

  // Continuation compares future training quality with a typical best turn.
  // With no entered gains, inspect every facility, not just the first nonzero
  // formula result. Explicit gains retain their existing observation priority.
  function strengthSample(state, sc, ctx) {
    const entered = (state.facilities || []).filter(f => f.gain > 0);
    let best = entered.length ? Math.max(...entered.map(f => +f.gain)) : 0;
    if (!entered.length && sc.train && deckInfo(state)) {
      ctx = ctx || makeCtx(state, sc);
      (state.facilities || []).forEach(f => {
        const gain = deckGain(f, ctx);
        if (gain) best = Math.max(best, gain.total);
      });
    }
    return best > 0 ? best / (typGainAt(state.turn, sc) * (sc.gainScale || 1)) : null;
  }

  // Repair saved strength samples using original pre-command inputs. Restore
  // logged facility levels (or the preceding training history for older logs),
  // without changing balances, outcomes, snapshots or the formula multiplier.
  function relearnStrength(state, sc) {
    const samples = [], log = state.log || [];
    log.forEach((entry, i) => {
      try {
        const past = JSON.parse(entry.snapshot);
        if (!past || !Array.isArray(past.facilities) || past.scenario && past.scenario !== sc.id) return;
        past.log = log.slice(0, i);
        past.facLevels = Object.assign({}, past.facLevels);
        ((entry.diagnostics || {}).options || []).forEach(o => {
          const level = o.expectedPerformance && o.expectedPerformance.facilityLevel;
          if (o.kind === "train" && STATS.includes(o.stat) && level >= 1 && level <= 5) past.facLevels[o.stat] = level;
        });
        const sample = strengthSample(past, sc);
        if (sample != null && Number.isFinite(sample)) samples.push(sample);
      } catch (_) { /* skip unreadable legacy snapshots */ }
    });
    return samples.slice(-12);
  }

  // ---- Grand Concert performance tokens ----
  // Each training gives tokens of its primary type most of the time (secondary or another type
  // otherwise; the game shows which on the training), and friendship training gives a second
  // type too. Amounts: GameTora gives 10 (Wit 6) at level 1 with no cards; more cards, scenario
  // link cards and higher facility levels give more. The per-card amounts below are estimates.
  const GL_LINK = ["Silence Suzuka", "Agnes Tachyon", "Smart Falcon", "Mihono Bourbon", "Light Hello"];
  function tokenCap(state, sc) {
    const gl = state.gl || {};
    const pending = gl.pendingConcert;
    // Only count concerts that have been RESOLVED (not pending)
    // A concert turn before current turn is resolved unless it's the pending concert
    return 200 + 50 * (sc.lives || []).filter((t) => t < state.turn && (!pending || pending.turn !== t)).length;
  }
  function facilityRainbows(f, state) {
    if (Array.isArray(f.members) && f.members.length && Deck && state.deck) {
      return f.members.filter((i) => {
        const sl = state.deck.slots[i];
        const c = sl && Deck.card(sl.id);
        if (!c) return false;
        const bond = sl.bond != null ? sl.bond : Deck.initialBond(c, Deck.levelFor(c, sl.lb));
        return Deck.isRainbow(c, bond, f.stat);
      }).length;
    }
    return f.rainbows || 0;
  }
  // Points a training gives (uma.guide): floor((S + F) x 1.15^C + 2L), S = 5 for Wit and 9 for
  // the rest, F the facility level, C the support cards there and L the scenario-link cards.
  // A training gives its main type 60% of the time, its second type 30% and another 10%; a
  // friendship training adds a second type, very likely the one you have least of.
  // expected: add Light Hello's repeat expectation (40% estimate; R uses a +10
  // floor). Untouched types use the visible main-type assumption in "usual"
  // mode; other callers retain the 60/30/10 expectation. Done never adds a proc.
  function tokenGain(f, state, sc, expected) {
    if (!sc.tokenOf || !sc.tokenOf[f.stat]) return [];
    // No tokens before the lessons open (Grand Concert: turn 5).
    if (sc.tokensFrom && state.turn < sc.tokensFrom) return [];
    const ex = f.extras || {};
    const L = facLevelFor(state, sc, f.stat);
    let cards = f.cards || 0;
    let links = 0;
    if (Array.isArray(f.members) && f.members.length && Deck && state.deck) {
      cards = f.members.length + (f.extra || 0);
      links = f.members.filter((i) => { const sl = state.deck.slots[i]; const c = sl && Deck.card(sl.id); return c && GL_LINK.indexOf(c.n) !== -1; }).length;
    }
    const est = Math.floor(((f.stat === "wit" ? 5 : 9) + L) * Math.pow(1.15, cards) + 2 * links);
    const [pri, sec] = sc.tokenOf[f.stat];
    const set = (v) => v != null && v !== "";
    const have = (state.gl && state.gl.tokens) || [0, 0, 0, 0, 0];
    const amount = set(ex.tok) ? +ex.tok : est;
    const main = set(ex.tokType) ? +ex.tokType : pri;
    let out = [{ type: main, amount, est: !set(ex.tok) }];
    if (expected && !set(ex.tokType) && !(state.gl && state.gl.tokenTypes === "usual")) {
      out = [{ type: pri, amount: amount * 0.6, est: true }, { type: sec, amount: amount * 0.3, est: true }];
      [0, 1, 2, 3, 4].filter((i) => i !== pri && i !== sec).forEach((i) => out.push({ type: i, amount: amount * 0.1 / 3, est: true, minor: true }));
    }
    const order = [0, 1, 2, 3, 4].sort((a, b) => (have[a] || 0) - (have[b] || 0));
    const rb = facilityRainbows(f, state) > 0;
    if (rb || set(ex.tok2)) {
      const t2 = set(ex.tokType2) ? +ex.tokType2 : order.find((i) => i !== main);
      out.push({ type: t2, amount: set(ex.tok2) ? +ex.tok2 : amount, est: !set(ex.tok2), second: true });
    }
    if (expected && Array.isArray(f.members) && state.deck) {
      const sl = f.members.map((i) => state.deck.slots[i]).find((s) => s && Hello.isHello(Deck.card(s.id)));
      // The first training has a different fixed event. Bond from unrelated events
      // is not proof that this first training already happened.
      if (sl && Hello.hasMet(sl)) {
        const p = Hello.profile(Deck.card(sl.id), sl.lb);
        const balances = have.slice();
        out.forEach((g) => { balances[g.type] += g.amount; });
        const min = Math.min(...balances);
        const lows = balances.map((n, i) => n === min ? i : -1).filter((i) => i >= 0);
        lows.forEach((type) => out.push({ type, amount: p.procRate * p.tokenAmount / lows.length, est: true, lh: true }));
      }
    }
    return out;
  }

  // ---- Grand Concert songs ----
  // Record an observed event only. Expected Performance is never added to a run.
  // Mutable like buySong/buyTechnique; callers can snapshot this for Undo.
  function recordHelloEvent(state, sc, event) {
    if (sc.id !== "grandlive" || state.turn < (sc.tokensFrom || 5)) return null;
    const slots = (state.deck && state.deck.slots) || [];
    const idx = event.slot != null ? +event.slot : slots.findIndex((s) => s && Hello.isHello(Deck.card(s.id)));
    const slot = slots[idx], card = slot && Deck.card(slot.id);
    if (!Hello.isHello(card)) return null;
    const amount = +event.amount;
    if (amount !== 20 && !(amount === 10 && card.r === 1)) return null;
    const tokens = (state.gl && state.gl.tokens) || [0, 0, 0, 0, 0];
    const lows = tokens.map((n, i) => n === Math.min(...tokens) ? i : -1).filter((i) => i >= 0);
    const type = event.type != null && event.type !== "" ? +event.type : lows.length === 1 ? lows[0] : -1;
    if (!Number.isInteger(type) || type < 0 || type > 4) return null;
    const turn = event.turn != null ? +event.turn : state.turn;
    if (!Number.isInteger(turn) || turn < 5 || turn > state.turn) return null;
    const key = turn + ":" + idx;
    state.gl = state.gl || {};
    if ((state.gl.helloEvents || []).some((e) => e.key === key)) return null;
    const p = Hello.profile(card, slot.lb);
    const cap = tokenCap(Object.assign({}, state, { turn }), sc);
    // The UI records the event after Done. At a concert, Done has already
    // applied the later collaborator reward and raised the cap. Recover the
    // logged pre-calendar balance so that reward cannot steal the event's
    // old-cap headroom. Only use it while the closing balances still match
    // (or, in the pending-phase case, match after the deferred calendar is
    // applied by finalizeConcert).
    const last = (state.log || []).slice(-1)[0];
    const flow = last && last.diagnostics && last.diagnostics.performance;
    const beforeCalendar = turn === state.turn - 1 && last && last.turn === turn && calendarPerformance(turn, sc) && flow && (
      flow.after.every((n, i) => n === tokens[i])
      || (flow.deferredCalendar && flow.after.every((n, i) => n + flow.deferredCalendar.credited[i] === tokens[i]))
    );
    const eventBalance = beforeCalendar ? flow.training.balances[type] : tokens[type];
    const credited = Math.max(0, Math.min(amount, cap - eventBalance));
    state.gl.tokens = tokens.slice();
    state.gl.tokens[type] = tokens[type] + credited;
    slot.bond = Math.min(100, (slot.bond != null ? slot.bond : Deck.initialBond(card, p.level)) + p.repeat.b);
    slot.met = true;
    if (event.mood) state.mood = Conditions.moodAfter(state, 1);
    if (state.trackStats && state.stats && state.stats.guts > 0) state.stats.guts += p.repeat.s[3];
    state.extras = state.extras || {};
    if (amount === 20) state.extras.lh20 = true;
    const entry = { key, turn, card: card.id, amount, credited, type, guts: p.repeat.s[3], sp: p.repeat.sp, mood: event.mood ? 1 : 0, bond: p.repeat.b, beforeCalendar: !!beforeCalendar };
    state.gl.helloEvents = (state.gl.helloEvents || []).concat([entry]);
    return entry;
  }

  // Extra Stat Gain songs add a permanent flat bonus right away; Friendship Bonus songs start
  // working after the next live (lessons bought on a live turn count for that live).
  function songBonuses(state, sc) {
    const out = { extra: { speed: 0, stamina: 0, power: 0, guts: 0, wit: 0, sp: 0 }, fb: 0, pendingFb: 0 };
    if (!sc.songs) return out;
    const learned = (state.gl && state.gl.songs) || {};
    const pending = state.gl && state.gl.pendingConcert;
    sc.songs.forEach((song) => {
      const t = learned[song.id];
      if (t == null) return;
      Object.entries(song.extra || {}).forEach(([k, v]) => { out.extra[k] += v; });
      if (song.fb) {
        const period = glPeriodFor(sc, song.id, state);
        const live = period == null ? null : sc.lives[period];
        // Pre-stage purchases keep their concert after finalization/reload.
        // An explicitly unknown period cannot establish an active Live Bonus.
        if (live != null && state.turn > live && (!pending || pending.turn !== live)) out.fb += song.fb;
        else out.pendingFb += song.fb;
      }
    });
    if (state.turn > 72) {
      // GIRLS' LEGEND U's +10% is active after the final concert resolves,
      // but stays pending while that concert is still in the pre-stage window.
      if (pending && pending.turn === 72) out.pendingFb += 10;
      else out.fb += 10;
    }
    else if (state.turn === 72) out.pendingFb += 10;
    return out;
  }

  // Songs learned since the last live (3 fill the Hype gauge) and the next live turn. Make
  // Debut!, the song you get by itself on turn 5, counts for the 1st live (GameTora).
  const GL_DEBUT_SONG = 5;
  // New collaborators raise the cap and award ten of every type after each
  // Promo Live. Conditional link-character rewards are recorded separately.
  function calendarPerformance(turn, sc) {
    if (sc.id !== "grandlive") return null;
    if (turn === GL_DEBUT_SONG - 1) return { amount: 10, cap: 200, source: "Make Debut!" };
    const p = sc.lives.indexOf(turn);
    return p >= 0 && p < sc.lives.length - 1 ? { amount: 10, cap: tokenCap({ turn: turn + 1 }, sc), source: "New concert collaborators" } : null;
  }

  function recordTokenReward(state, sc, amount) {
    if (sc.id !== "grandlive" || !state.gl || state.turn < 5 || ![5, 10].includes(amount)) return null;
    const before = (state.gl.tokens || []).slice(), cap = tokenCap(state, sc);
    if (before.length !== 5) return null;
    const after = before.map((n) => Math.min(cap, n + amount));
    state.gl.tokens = after;
    return { turn: state.turn, amount, before, after, credited: after.map((n, i) => n - before[i]), lostAtCap: after.map((n, i) => amount - n + before[i]) };
  }
  function hypeStatus(state, sc) {
    if (!sc.songs) return null;
    const learned = (state.gl && state.gl.songs) || {};
    const pending = state.gl && state.gl.pendingConcert;
    if (pending) {
      // During the pending phase, Hype is reported for the concert that is
      // about to resolve, counting songs attributed to the pending period
      // via songPeriods (or date-based fallback for legacy saves).
      const li = pending.concertIndex;
      const next = sc.lives[li];
      const prev = li > 0 ? sc.lives[li - 1] : 0;
      // Use persistent period attribution
      const since = Object.entries(learned).filter(([id, turn]) => glPeriodFor(sc, id, state) === li).length + (prev === 0 && state.turn >= 5 ? 1 : 0) + (next === 72 && state.turn >= 72 ? 1 : 0);
      return { next, prev, since, need: Math.max(0, 3 - since), turnsToLive: 0 };
    }
    const next = sc.lives.find((l) => l >= state.turn);
    const prev = sc.lives.filter((l) => l < state.turn).pop() || 0;
    const li = sc.lives.indexOf(next);
    // Use persistent period attribution
    const since = Object.entries(learned).filter(([id, turn]) => glPeriodFor(sc, id, state) === li).length + (prev === 0 && state.turn >= 5 ? 1 : 0) + (next === 72 && state.turn === 72 ? 1 : 0);
    return { next, prev, since, need: Math.max(0, 3 - since), turnsToLive: next != null ? next - state.turn : null };
  }
  // Songs learned so far, counting Make Debut! from turn 5 (it counts toward the 18 too).
  function songsLearned(state, through = state.turn) {
    return Object.values((state.gl && state.gl.songs) || {}).filter((t) => t >= GL_DEBUT_SONG && t <= through).length + (through >= GL_DEBUT_SONG ? 1 : 0);
  }
  // The special version is chosen after the Early December command, one turn
  // before the concert. GIRLS' LEGEND U itself is excluded from this count.
  const GL_SPECIAL_DEADLINE = 71;
  function concertGoal(state) {
    const count = songsLearned(state, Math.min(state.turn, GL_SPECIAL_DEADLINE));
    return { count, target: 18, deadline: GL_SPECIAL_DEADLINE, left: Math.max(0, 18 - count), closed: state.turn > GL_SPECIAL_DEADLINE };
  }

  // ---- Grand Concert: what you get at fixed points (uma.guide, GameTora) ----
  // Make Debut! on turn 5 (+10 of every token), Light Hello's first training, the New Year
  // events, each Promo Live (all stats +10 on a Great Success, +3 otherwise; 5 SP per technique
  // and 25 per song since the last live; token cap +50), the lyrics event (16+ songs) and the
  // Grand Live's GIRLS' LEGEND U (all stats +10, Friendship +10%). Each with what you've done
  // toward it so far.
  function glRewards(state, sc) {
    if (!sc.songs) return [];
    const t = state.turn;
    const gl = state.gl || {};
    const learned = gl.songs || {};
    const lessons = gl.lessons || {};
    const pending = gl.pendingConcert;
    // During the pending phase, pre-stage purchases (songs/lessons bought at
    // turns after the pending concert's turn, before "Step on stage") count
    // toward the pending concert's Hype and rewards. status() reflects that.
    const status = (turn) => {
      if (pending && turn === pending.turn) return "pending";
      return turn < t ? "done" : turn === t ? "now" : "next";
    };
    const out = [];
    out.push({ turn: GL_DEBUT_SONG, label: "Make Debut! (a free song)", gain: "+10 of every token; Specialty Rate +5 after the 1st live. It counts as a song for the Hype gauge and toward the 18.", short: "+10 of every token, and it counts as a song", tokens: 10, status: status(GL_DEBUT_SONG) });
    const ch = sc.opening && sc.opening.chase;
    if (ch && ch.event) {
      const ev = ch.event;
      const bits = (ev.mood ? ["mood +" + ev.mood] : []).concat(Object.entries(ev.stats || {}).map(([k, n]) => STAT_LABELS[k] + " +" + n), ev.bond ? ["+" + ev.bond + " bond"] : []);
      out.push({ turn: ch.from, label: ch.name + "'s first training", gain: bits.join(", ") + " at SSR LB4 (less at lower LB/R). Later repeat events can add Performance of a scarce type: the coach uses a 40% estimate, with SSR +20 and a conservative R +10 floor; actual results are recorded separately.", status: "once" });
    }
    Object.keys(NEW_YEAR).forEach((k) => {
      const ny = NEW_YEAR[k];
      const g = "+" + ny.e + " energy, or " + (ny.stats >= 25 ? "all stats +" + ny.stats / 5 : "a stat +" + ny.stats) + ", or " + ny.sp + " skill points";
      out.push({ turn: +k, label: "New Year", gain: g + " (you pick).", short: g, status: status(+k) });
    });
    sc.lives.forEach((L, i) => {
      const last = i === sc.lives.length - 1;
      const prev = i ? sc.lives[i - 1] : 0;
      // Use persistent period attribution (songPeriods) when available
      // Songs attributed to this period count toward this concert's Hype and rewards
      const songs = Object.entries(learned).filter(([id, turn]) => glPeriodFor(sc, id, state) === i).length + (i === 0 && t >= 5 ? 1 : 0) + (last && t >= 72 ? 1 : 0);
      const tech = lessons[i] || 0;
      const sp = 5 * tech + 25 * songs;
      const great = songs >= 3;
      const cap = 200 + 50 * (i + 1);
      const st = status(L);
      const sofar = st === "done" ? "You had " : "So far: ";
      // A live whose half year hasn't started has nothing to count yet.
      const started = prev < t || i === 0;
      if (!last) {
        out.push({
          turn: L, label: ["1st", "2nd", "3rd", "4th"][i] + " Promo Live", status: st,
          gain: (i === 0 ? "Great Success (3+ songs so far, Make Debut! counts): all stats +10; fewer songs: +3. Skill points: 5 per technique and 25 per song so far."
            : "Great Success (3+ songs since the last live): all stats +10; fewer songs: +3. Skill points: 5 per technique and 25 per song since the last live.") + " New collaborators: token cap +50 (to " + cap + ") and +10 of every token afterward. Conditional link rewards are separate.",
          sofar: !started ? null : sofar + songs + " song" + (songs === 1 ? "" : "s") + (i === 0 ? " (with Make Debut!)" : "") + " and " + tech + " technique" + (tech === 1 ? "" : "s") + ": " + (great ? "Great Success, all stats +10" : st === "done" ? "all stats +3" : "all stats +3 (" + (3 - songs) + " more song" + (3 - songs === 1 ? "" : "s") + " for +10)") + ", +" + sp + " SP.",
          stats: great ? 10 : 3, sp, tokens: 10,
          short: (great ? "all stats +10" : "all stats +3 (" + (3 - songs) + " more song" + (3 - songs === 1 ? "" : "s") + " for +10)") + ", +" + sp + " SP so far, +10 of every token afterward; token cap to " + cap
        });
      } else {
        const n = concertGoal(state).count;
        out.push({
          turn: L, label: "Grand Live: GIRLS' LEGEND U", status: st,
          gain: "Concert reward: all stats +10 with full Hype, +3 otherwise; 25 SP per song and 5 per technique this period. GIRLS' LEGEND U activates Friendship +10% after this concert. The guaranteed special version requires 18 songs by the end of turn 71, counting Make Debut! and excluding GIRLS' LEGEND U.",
          sofar: sofar + n + " of 18 songs by turn 71; " + songs + " this period, +" + sp + " SP" + (n >= 18 ? "; guaranteed special version." : "; below the guaranteed threshold."),
          short: "all stats +" + (great ? 10 : 3) + ", +" + sp + " SP so far; Friendship +10% activates after the concert",
          stats: great ? 10 : 3, sp
        });
      }
    });
    out.push({ turn: GL_SPECIAL_DEADLINE, label: "GIRLS' LEGEND U learned / special-concert deadline", gain: "After this turn: all stats +10; Friendship +10% waits for the final concert. Learn 18 songs by this command's end to guarantee the special version. Make Debut! counts; GIRLS' LEGEND U does not.", short: "all stats +10; last command for the 18-song guarantee", stats: 10, status: status(GL_SPECIAL_DEADLINE) });
    const nL = songsLearned(Object.assign({}, state, { turn: Math.max(t, GL_DEBUT_SONG) }));
    out.push({ turn: 69, label: "Lyrics event", gain: "With 16+ songs: pick a lyrics line for a skill hint (gold if it's a scenario-link character you're using).", sofar: "So far: " + nL + " of 16 songs.", short: "a skill hint with 16+ songs (you have " + nL + ")", status: status(69) });
    return out.sort((a, b) => a.turn - b.turn);
  }

  // Resolves a pending concert that endOfTurn deferred into a "pre-stage"
  // window. The player can buy songs and lesson techniques between command
  // completion (endOfTurn on a concert turn) and concert resolution; this
  // applies the deferred concert rewards, sets up the carry, and clears the
  // pending phase. Returns true if a concert was resolved.
  function finalizeConcert(state, sc) {
    const gl = state.gl;
    if (!gl || !gl.pendingConcert) return false;
    const pending = gl.pendingConcert;
    const li = sc.lives.indexOf(pending.turn);
    if (li !== pending.concertIndex || li === -1) {
      delete gl.pendingConcert;
      return false;
    }
    // Record before state for actual credited amounts
    const beforeTokens = (gl.tokens || []).slice();
    const vector = () => Array.from({ length: 5 }, () => 0);
    // 1. Calendar performance: collaborators' +10 of every token after a
    //    Promo Live (Make Debut!'s +10 is applied by endOfTurn on turn 5).
    const perf = calendarPerformance(pending.turn, sc);
    const credited = vector();
    const lostAtCap = vector();
    if (perf) {
      gl.tokens = gl.tokens.map((n, i) => {
        const room = Math.max(0, perf.cap - n);
        const take = Math.min(perf.amount, room);
        credited[i] = take;
        lostAtCap[i] = perf.amount - take;
        return Math.min(perf.cap, (n || 0) + perf.amount);
      });
    }
    // 2. Concert stats (+10 Great Success: 3+ songs since the last live;
    //    +3 otherwise; +10 for GIRLS' LEGEND U regardless of Hype).
    if (state.trackStats && state.stats) {
      const r = glRewards(state, sc).find((x) => x.turn === pending.turn && x.stats);
      const add = r ? r.stats : 0;
      STATS.forEach((k) => { if (state.stats[k] > 0) state.stats[k] = Math.round(state.stats[k] + add); });
    }
    // 3. Stamp the shop selection turn, then establish the carry for the
    //    next period (the songs still in your shop that you didn't buy).
    Object.values(gl.shop || {}).forEach((offer) => { if (offer.turn == null) offer.turn = pending.turn; });
    const songs = Object.keys(gl.shop || {}).filter((id) => id.startsWith("song:")).map((id) => id.slice(5)).filter((id) => (gl.songs || {})[id] == null);
    gl.carry = { period: li + 1, songs };
    delete gl.holdSong;
    // 4. Clear the pending phase.
    delete gl.pendingConcert;
    // Store finalization event data for reporting
    gl.finalizationEvent = gl.finalizationEvent || {};
    gl.finalizationEvent[pending.turn] = { turn: pending.turn, before: beforeTokens, after: (gl.tokens || []).slice(), credited, lostAtCap };
    return true;
  }

  // ---- Grand Concert song plan (CM ace guide, with 5 songs in year one) ----
  // The guide's five-song Junior target and three-song intermediate targets
  // are heuristics. Carries are credited only when observed. The final target
  // catches up to 18 including Make Debut!, by the end of turn 71.
  // Steps: technique lessons before each song this half (the game's lesson pattern).
  const GL_FOCUS = { 1: ["yumewo", "growup"], 2: ["yumewo", "growup"], 3: ["daisuki", "fanfare"], 4: ["daisuki", "fanfare"] };
  // Technique lessons (uma.guide): the usual Stat or Skill Points technique each half year:
  // +5 for 10 points before the 1st live, +8 for 16 up to the 4th, +12 for 24 before the Grand
  // Live (Stat ones cost that stat's main type, SP ones a random type). Each also pays 5 SP at
  // the next live. Energy techniques (+20/30/40 for 25/30/35 points of a random type) are
  // techniques too, so they count toward the next song.
  const GL_TECH = [{ cost: 10, n: 5 }, { cost: 16, n: 8 }, { cost: 16, n: 8 }, { cost: 16, n: 8 }, { cost: 24, n: 12 }];
  const GL_ENERGY_TECH = { 20: 25, 30: 30, 40: 35 };
  const GL_HINT_TECH = { 1: 15, 2: 25, 3: 35 };
  // The shop's Stat, SP and combined techniques by tier (uma.guide): tier 0 before the 1st live,
  // 1 up to the 4th, 2 before the Grand Live. statSp: [stat and SP, main-type cost, second-type
  // cost]; two: [each stat, cost of each stat's main type].
  const GL_TECH_TIERS = [
    { stat: 5, statCost: 10, sp: 5, spCost: 10 },
    { stat: 8, statCost: 16, sp: 8, spCost: 16, statSp: [4, 10, 6], two: [4, 8] },
    { stat: 12, statCost: 24, sp: 12, spCost: 24, statSp: [6, 14, 10], two: [6, 12] }
  ];
  // Technique lessons the song plan takes each half year: year one 1+2+3+4+4 for 5 songs and 2
  // more so the 6th shows; then 1+2 after the carried song and 2 more for the next carry; the
  // healthy final half needs 1+2 after its carry, reaching 17 paid songs.
  function techniquesToSong(period, songIndex) {
    const first = period === 0 ? [1, 2, 3] : [2, 2, 2];
    const loop = period === 0 ? [4, 4, 2, 2] : period === 4 ? [4, 3, 2, 2] : [4, 5, 2, 2];
    return songIndex < first.length ? first[songIndex] : loop[(songIndex - first.length) % loop.length];
  }
  function songSteps(period, count, carried) {
    return Array.from({ length: count }, (_, i) => carried
      ? i === 0 ? 0 : techniquesToSong(period, i - 1) - (i === 1 ? 1 : 0)
      : techniquesToSong(period, i));
  }
  const GL_AVOID = { 0: ["ringring", "nigekiri"] };
  function glPeriod(sc, turn) {
    const i = sc.lives.findIndex((l) => turn <= l);
    return i === -1 ? sc.lives.length - 1 : i;
  }
  // Current period accounting for the pending-concert phase: while a concert
  // is pending, you're still in the period whose concert is pending (not the
  // next one the raw turn would place you in).
  function currentPeriod(sc, state) {
    const gl = state.gl || {};
    if (gl.pendingConcert) return gl.pendingConcert.concertIndex;
    return glPeriod(sc, state.turn);
  }
  // The period a song belongs to. Uses persistent songPeriods map when available,
  // falling back to date-based logic only for legacy saves without metadata.
  // Three states of attribution:
  // 1. Explicitly recorded period (from songPeriods[songId])
  // 2. Legacy entry with no period metadata (fallback to date-based glPeriod)
  // 3. Entry explicitly marked as ambiguous (songPeriods[songId] = null) - no definite assignment
  function glPeriodFor(sc, songId, state) {
    const gl = state.gl || {};
    const songPeriods = gl.songPeriods || {};
    // Check for explicit period assignment
    if (songPeriods[songId] !== undefined) {
      // null means explicitly ambiguous - do not fall through to date-based rule
      if (songPeriods[songId] === null) return null;
      return songPeriods[songId];
    }
    // Legacy fallback: use date-based logic
    const learnedTurn = (gl.songs || {})[songId];
    if (learnedTurn == null) return null;
    // During pending phase, purchases after the concert turn belong to pending period
    if (gl.pendingConcert && learnedTurn > gl.pendingConcert.turn) return gl.pendingConcert.concertIndex;
    return glPeriod(sc, learnedTurn);
  }
  function songPlan(state, sc) {
    if (!sc.songs || state.turn < 5) return null;
    const p = currentPeriod(sc, state);
    const last = p === sc.lives.length - 1;
    const gl = state.gl || {};
    const learned = gl.songs || {};
    const bought = Object.entries(learned).filter(([id, t]) => glPeriodFor(sc, id, state) === p && t >= 5).length;
    const live = sc.lives[p];
    const carried = p > 0 && (!!(gl.carriedPeriods || {})[p] || (gl.carry && gl.carry.period === p && gl.carry.songs.length > 0));
    const before = songsLearned(state, p ? sc.lives[p - 1] : 4);
    const target = last ? Math.max(3, GL_SONG_GOAL - before) : p === 0 ? 5 : 3;
    const steps = songSteps(p, Math.max(target, bought), carried);
    const carry = last ? null : techniquesToSong(p, Math.max(target, bought) - (carried ? 1 : 0));
    const cum = steps.reduce((a, x) => a.concat([(a.length ? a[a.length - 1] : 0) + x]), []);
    const recordedLessons = (gl.lessons || {})[p] || 0;
    // Bought songs prove the preceding lessons happened even in older saves.
    // A currently shown song also proves its unlock techniques are complete.
    const shown = Object.keys(gl.shop || {}).some((id) => id.startsWith("song:") && learned[id.slice(5)] == null && sc.songs.some((s) => s.id === id.slice(5) && s.from <= state.turn));
    const proved = bought ? cum[bought - 1] : 0;
    const offered = shown ? bought < target ? cum[bought] : cum[cum.length - 1] + (carry || 0) : 0;
    const lessons = Math.max(recordedLessons, proved, offered);
    const tech = GL_TECH[Math.min(p, GL_TECH.length - 1)];
    const plan = { period: p, target, bought, lessons, recordedLessons, live, last, carried: !!carried, focus: GL_FOCUS[p] || [], avoid: GL_AVOID[p] || [], techCost: tech.cost };
    // Techniques still to buy this half: to the last song, plus the carry-over's.
    plan.techLeft = Math.max(0, cum[cum.length - 1] + (carry || 0) - lessons);
    // The step comes from the songs you've bought (the game's technique count is easy to lose
    // track of): songs to buy this half, then hold the next one for after the live.
    plan.techNow = bought < steps.length ? Math.max(0, cum[bought] - lessons) : carry != null ? Math.max(0, cum[cum.length - 1] + carry - lessons) : 0;
    if (bought < target) {
      plan.step = "song";
      plan.text = carried && bought === 0
        ? "Buy the song you carried over first (it saves a lesson), then " + (steps.length - 1) + " more this half."
        : "Buy song " + (bought + 1) + " of " + steps.length + " this half: buy techniques until songs show in your shop, then the most important one.";
    } else if (carry != null) {
      plan.step = "hold";
      plan.text = "This half's " + steps.length + " shop songs are bought. Buy techniques until the next song shows, then hold the selection: buy it from turn " + (live + 1) + ", after the live. Buying another lesson refreshes the selection and loses this carry.";
    } else {
      plan.step = "done";
      plan.text = "Period plan done. " + (concertGoal(state).left ? concertGoal(state).left + " more songs still needed for the special concert." : "18-song requirement reached (Make Debut! counts).") + " Spare tokens can fund useful techniques or extra songs.";
    }
    if (state.turn > GL_SPECIAL_DEADLINE) {
      plan.step = "done"; plan.techLeft = 0; plan.techNow = 0;
      plan.text = "The special-concert deadline was turn 71: " + concertGoal(state).count + " of 18 songs by then. Extra lessons still give their immediate rewards.";
    }
    const held = heldSong(state, sc);
    if (held) {
      plan.held = held.id; plan.manualHold = true; plan.step = "hold"; plan.techNow = 0; plan.techLeft = 0;
      plan.text = "Hold " + held.name + " until after the concert; buy from turn " + (live + 1) + ". Keep the selection unchanged. " + (bought < target ? "You have " + bought + " of " + target + " purchased songs in the guide target; choosing this carry does not mark that target complete." : "The period's purchase target is complete.");
    }
    return plan;
  }

  function heldSong(state, sc) {
    const gl = state.gl || {}, hold = gl.holdSong, p = sc.lives && currentPeriod(sc, state);
    if (!hold || hold.period !== p || p >= sc.lives.length - 1 || !(gl.shop || {})["song:" + hold.id] || (gl.songs || {})[hold.id] != null) return null;
    return (sc.songs || []).find((s) => s.id === hold.id && s.from <= state.turn) || null;
  }
  function holdSong(state, sc, id) {
    if (!sc.songs || state.turn < 5 || currentPeriod(sc, state) >= sc.lives.length - 1) return false;
    const gl = state.gl || {}, song = sc.songs.find((s) => s.id === id && s.from <= state.turn);
    if (!song || !(gl.shop || {})["song:" + id] || (gl.songs || {})[id] != null) return false;
    gl.holdSong = { id, period: currentPeriod(sc, state), turn: state.turn };
    return true;
  }

  // A visible song is evidence; later selections are a priority projection, not
  // a forecast of random offers. Reserve the full remaining purchase sequence.
  function periodSongBudget(state, sc, tokenPlanIn) {
    const p = tokenPlanIn || tokenPlan(state, sc), sp = songPlan(state, sc);
    if (!p || !sp) return null;
    const rows = shopSongs(state, sc, p);
    const offered = rows.filter((x) => x.offered), rest = rows.filter((x) => !x.offered);
    const ordered = offered.concat(rest);
    const wanted = sp.manualHold || sp.step === "done" ? 0 : Math.max(0, sp.target - sp.bought);
    const songs = ordered.slice(0, wanted).map((x) => x.song);
    const carry = heldSong(state, sc) || (!sp.last && sp.step !== "done" ? (ordered[wanted] || {}).song : null);
    const need = [0, 0, 0, 0, 0], purchaseNeed = need.slice();
    songs.forEach((s) => s.cost.forEach((n, i) => { need[i] += n; purchaseNeed[i] += n; }));
    if (carry) carry.cost.forEach((n, i) => { need[i] += n; });
    const have = p.have.slice(), short = need.map((n, i) => Math.max(0, n - have[i]));
    return { songs, carry: carry || null, carryObserved: !!(carry && wanted === 0 && offered.some((x) => x.song.id === carry.id)), observedSelection: offered.length > 0, manualHold: !!sp.manualHold, wanted, need, purchaseNeed, have, short, techLeft: sp.techLeft, techTokens: sp.techLeft * sp.techCost, buyCarryFrom: !sp.last ? sp.live + 1 : null };
  }

  // What a song's bonus is worth over the turns left after you buy it (weighted stat points).
  function songBaseValue(song, build, left, liveLeft) {
    let v = 0;
    Object.entries(song.extra || {}).forEach(([k, n]) => { v += k === "sp" ? n * SP_VALUE * left * 0.75 : n * build.w[k] * left * 0.2; });
    Object.entries(song.once || {}).forEach(([k, n]) => { v += k === "sp" ? n * SP_VALUE : n * build.w[k]; });
    // Friendship %: about 45% of the remaining turns are friendship trainings worth ~30 weighted stats.
    if (song.fb) v += (song.fb / 100) * 0.45 * liveLeft * 30 * build.w.speed * 0.75;
    if (/Specialty/.test(song.live || "")) v += liveLeft * 0.2;
    return v;
  }
  function concertSongValue(song, w, turn, sc) {
    const next = sc.lives.find((l) => l >= turn);
    return songBaseValue(song, { w }, Math.max(0, sc.totalTurns - turn), next == null ? 0 : Math.max(0, sc.totalTurns - next));
  }
  // Compare the value lost by deferring this same song with the estimated value
  // of the one technique a carry saves in the next period. This is a transparent
  // heuristic, not a solved shop policy or a measured probability.
  function shouldCarrySong(song, w, turn, sc) {
    const live = sc.lives.find((l) => l >= turn);
    if (live == null || live === sc.lives[sc.lives.length - 1]) return false;
    const delayed = concertSongValue(song, w, turn, sc) - concertSongValue(song, w, live + 1, sc);
    const tier = GL_TECH[Math.min(glPeriod(sc, live + 1), GL_TECH.length - 1)];
    const top = STATS.map((k) => w[k]).sort((a, b) => b - a);
    const saved = tier.n * 0.8 * (top[0] + top[1]) / 2 + 5 * SP_VALUE;
    return delayed <= saved;
  }

  // How much a song matters for this run: its bonus over the turns left once you can buy it,
  // at your stat weights, with the song plan's picks first and its skips last.
  function songImportance(song, state, sc, w) {
    const at = Math.max(state.turn, song.from);
    let v = concertSongValue(song, w, at, sc);
    // For forward-looking planning, use date-based period assignment
    const p = glPeriod(sc, at);
    if ((GL_FOCUS[p] || []).indexOf(song.id) !== -1) v *= 1.6;
    if ((GL_AVOID[p] || []).indexOf(song.id) !== -1) v *= 0.3;
    return v;
  }

  // The run's token plan. queue: the songs to buy, in order: the ones you can buy now, most
  // important first, then the ones that unlock later (the 18 that matter most, counting what
  // you've learned). Each song's shortfall counts the tokens the songs before it use first, so
  // the aim is always the next song in line. need/short/supply: the whole queue against what
  // training brings by the Grand Live.
  const GL_SONG_GOAL = 18;
  const AIM_W = [1, 0.7, 0.5, 0.35, 0.25];
  function tokenPlan(state, sc) {
    if (!sc.songs || !sc.tokenOf || state.turn > sc.totalTurns) return null;
    const learned = (state.gl && state.gl.songs) || {};
    const have = ((state.gl && state.gl.tokens) || [0, 0, 0, 0, 0]).slice();
    const w = statWeights(state);
    const toBuy = state.turn > GL_SPECIAL_DEADLINE ? 0 : concertGoal(state).left;
    const picked = sc.songs.filter((song) => learned[song.id] == null && song.from <= 72).map((song) => ({
      song, v: songImportance(song, state, sc, w), cost: song.cost.reduce((a, b) => a + b, 0), now: song.from <= state.turn
    })).sort((a, b) => b.v - a.v).slice(0, toBuy);
    const queue = picked.filter((x) => x.now).concat(picked.filter((x) => !x.now).sort((a, b) => a.song.from - b.song.from || b.v - a.v));
    const left = have.slice();
    queue.forEach((x, k) => {
      x.short = x.song.cost.map((c, i) => Math.max(0, c - left[i]));
      x.song.cost.forEach((c, i) => { left[i] = Math.max(0, left[i] - c); });
      x.ready = x.now && x.short.every((n) => n === 0);
      x.w = k < AIM_W.length ? AIM_W[k] : 0.2;
    });
    const need = [0, 0, 0, 0, 0];
    queue.forEach((x) => x.song.cost.forEach((c, i) => { need[i] += c; }));
    // Technique lessons the song plan still takes, this half and every half after, and what
    // they cost. Their type is up to the lessons you're offered, so they're paid from any type.
    const sp = songPlan(state, sc);
    const p0 = currentPeriod(sc, state);
    const nL = sc.lives.length;
    // Future periods assume the planned carry succeeds. This period only credits
    // a carry actually observed at the preceding concert.
    const techCount = (p) => songSteps(p, 3, true).reduce((a, b) => a + b, 0) + (p === nL - 1 ? 0 : 2);
    let techAll = 0;
    let techTokens = 0;
    for (let p = p0; p < nL; p++) {
      const k = p === p0 ? (sp ? sp.techLeft : techCount(p)) : techCount(p);
      techAll += k;
      techTokens += k * GL_TECH[Math.min(p, GL_TECH.length - 1)].cost;
    }
    // Expected tokens from training: about 3 in 4 turns are trainings, spread over the
    // facilities like your stat weights, with ~2.5 cards each ((9 + level) x 1.15^2.5, 5 + level
    // for Wit), the main type 60% of the time, the second 30%, and about 40% friendship trainings
    // that add a second type (very likely your scarcest).
    const turnsLeft = Math.max(0, GL_SPECIAL_DEADLINE - state.turn + 1);
    const wsum = STATS.reduce((a, k) => a + w[k], 0);
    const supplyTo = (turns) => {
      const out = [0, 0, 0, 0, 0];
      let extra = 0;
      let F = 0;
      for (let t = state.turn; t < state.turn + turns; t++) F += facilityLevel(t, sc);
      F = turns > 0 ? F / turns : 1;
      STATS.forEach((k) => {
        const [pri, sec] = sc.tokenOf[k];
        const n = turns * 0.75 * (w[k] / wsum);
        // +3: link cards (+2 each) and Light Hello's +20 event now and then.
        const per = ((k === "wit" ? 5 : 9) + F) * 1.42 + 3;
        out[pri] += n * per * 0.6;
        out[sec] += n * per * 0.3;
        for (let i = 0; i < 5; i++) if (i !== pri && i !== sec) out[i] += (n * per * 0.1) / 3;
        extra += n * per * 0.4;
      });
      return { out, extra };
    };
    const sup = supplyTo(turnsLeft);
    const short = need.map((x, i) => Math.max(0, x - have[i]));
    // The friendship second type goes to your scarcest type, so it fills the gaps first.
    const supply = sup.out.slice();
    const gaps = short.map((x, i) => Math.max(0, x - supply[i]));
    const gapSum = gaps.reduce((a, b) => a + b, 0);
    supply.forEach((_, i) => { supply[i] += gapSum ? (sup.extra * gaps[i]) / gapSum : sup.extra / 5; });
    const totalV = queue.reduce((a, x) => a + x.v, 0);
    const totalCost = queue.reduce((a, x) => a + x.cost, 0);
    const base = totalCost ? totalV / totalCost : 0;
    // This half year's budget: the techniques and songs the song plan still wants before the
    // next live, against what you hold and what training should bring by then.
    let half = null;
    if (sp && sp.step !== "done") {
      const pb = periodSongBudget(state, sc, { queue, have });
      const songsLeft = pb.wanted;
      const songTokens = pb.songs.reduce((a, song) => a + song.cost.reduce((n, x) => n + x, 0), 0) + Math.max(0, songsLeft - pb.songs.length) * 42;
      const carryTokens = pb.carry ? pb.carry.cost.reduce((n, x) => n + x, 0) : 0;
      const techTok = sp.techLeft * sp.techCost;
      const toLive = Math.max(0, (sp.last ? GL_SPECIAL_DEADLINE : sp.live) - state.turn + 1);
      const hs = supplyTo(toLive);
      const supplyHalf = hs.out.reduce((a, b) => a + b, 0) + hs.extra;
      const haveSum = have.reduce((a, b) => a + b, 0);
      const needHalf = songTokens + techTok + carryTokens;
      half = { live: sp.live, techLeft: sp.techLeft, techCost: sp.techCost, techTokens: techTok, songsLeft, songTokens, carryTokens, need: needHalf, have: haveSum, supply: supplyHalf, gap: needHalf - haveSum - supplyHalf };
    }
    const tech = { left: techAll, tokens: techTokens, cost: GL_TECH[Math.min(p0, GL_TECH.length - 1)].cost, n: GL_TECH[Math.min(p0, GL_TECH.length - 1)].n };
    return { songs: queue, queue, aim: queue[0] || null, toBuy, need, have, supply, short, base, cap: tokenCap(state, sc), tech, half };
  }

  // Ranks songs you can learn now: value of the bonus over the rest of the run per token spent,
  // with a big push for songs that are still needed to fill the Hype gauge before the next live.
  function songAdvice(state, sc) {
    if (!sc.songs) return [];
    const learned = (state.gl && state.gl.songs) || {};
    const tokens = (state.gl && state.gl.tokens) || [0, 0, 0, 0, 0];
    const build = { w: statWeights(state) };
    const hype = hypeStatus(state, sc);
    return sc.songs.filter((song) => learned[song.id] == null && song.from <= state.turn).map((song) => {
      let v = concertSongValue(song, build.w, state.turn, sc);
      if (hype && hype.need > 0) v += 25;
      // The plan's picks: the SP songs in year two, the +10% friendship songs in year three; skip
      // the +Stamina and +Guts songs in year one.
      const p = currentPeriod(sc, state);
      const focus = (GL_FOCUS[p] || []).indexOf(song.id) !== -1;
      const avoid = (GL_AVOID[p] || []).indexOf(song.id) !== -1;
      if (focus) v *= 1.6;
      if (avoid) v *= 0.3;
      const cost = song.cost.reduce((a, b) => a + b, 0);
      const short = song.cost.map((c, i) => Math.max(0, c - (tokens[i] || 0)));
      return { song, value: v, perToken: v / Math.max(1, cost), affordable: short.every((x) => x === 0), short, focus, avoid };
    }).sort((a, b) => (b.affordable - a.affordable) || (b.perToken - a.perToken));
  }

  // What one token is worth through technique lessons (weighted points): a Stat technique on
  // one of your top stats (you pick from 3 offers, so a bit under the best) plus the 5 SP it
  // pays at the next live. Techniques are always on offer and the song plan needs them, so
  // every token up to the cap is worth at least this.
  function techStatValue(plan, ctx) {
    const top = STATS.map((k) => ctx.w[k] * (ctx.need ? ctx.need[k] : 1)).sort((a, b) => b - a);
    return 0.8 * plan.tech.n * (top[0] + top[1]) / 2;
  }
  function techTokenUnit(plan, ctx) {
    return (techStatValue(plan, ctx) + (ctx.sc.lives.some((l) => l >= ctx.state.turn) ? 5 * SP_VALUE : 0)) / plan.tech.cost;
  }
  // Technique lessons you can buy now without touching the tokens the next song in your token
  // aim needs (types are approximate: the shop's offers decide them).
  function techAffordable(plan) {
    const next = plan.queue.find((x) => x.now);
    const spare = plan.have.map((h, i) => Math.max(0, (h || 0) - (next ? next.song.cost[i] : 0)));
    return Math.floor(spare.reduce((a, b) => a + b, 0) / plan.tech.cost);
  }
  // How far this half year's song plan is behind: 1 when training should cover it, up to 1.6
  // when the techniques and songs it still wants need far more than you'll get by the live.
  function tokenUrgency(plan) {
    const h = plan.half;
    if (!h || h.need <= 0) return 1;
    return 1 + clamp(h.gap / h.need, 0, 0.6);
  }

  // ---- Technique shop ----
  // Every technique on offer this half year. cost: tokens by type; any: a cost in whatever type
  // the shop shows (SP, Energy and skill hint techniques).
  function techniqueList(state, sc) {
    if (!sc.songs || !sc.tokenOf || state.turn < (sc.tokensFrom || 5) || state.turn > 78) return [];
    const p = currentPeriod(sc, state);
    const T = GL_TECH_TIERS[p === 0 ? 0 : p < sc.lives.length - 1 ? 1 : 2];
    const tok = sc.tokenOf;
    const cost = (pairs) => { const c = [0, 0, 0, 0, 0]; pairs.forEach(([i, n]) => { c[i] += n; }); return c; };
    const L = STAT_LABELS;
    const out = [];
    STATS.forEach((k) => out.push({ id: "stat:" + k, kind: "stat", label: L[k] + " +" + T.stat, gain: { [k]: T.stat }, cost: cost([[tok[k][0], T.statCost]]) }));
    out.push({ id: "sp", kind: "sp", label: "Skill Points +" + T.sp, sp: T.sp, any: T.spCost });
    if (T.statSp) STATS.forEach((k) => out.push({ id: "statsp:" + k, kind: "statsp", label: L[k] + " +" + T.statSp[0] + " & SP +" + T.statSp[0], gain: { [k]: T.statSp[0] }, sp: T.statSp[0], cost: cost([[tok[k][0], T.statSp[1]], [tok[k][1], T.statSp[2]]]) }));
    if (T.two) STATS.forEach((a, i) => STATS.slice(i + 1).forEach((b) => out.push({ id: "two:" + a + "-" + b, kind: "two", label: L[a] + " +" + T.two[0] + " & " + L[b] + " +" + T.two[0], gain: { [a]: T.two[0], [b]: T.two[0] }, cost: cost([[tok[a][0], T.two[1]], [tok[b][0], T.two[1]]]) })));
    Object.keys(GL_ENERGY_TECH).forEach((e) => out.push({ id: "energy:" + e, kind: "energy", label: "Energy +" + e, energy: +e, any: GL_ENERGY_TECH[e] }));
    Object.keys(GL_HINT_TECH).forEach((h) => out.push({ id: "hint:" + h, kind: "hint", label: "Skill hint Lv +" + h, hint: +h, any: GL_HINT_TECH[h] }));
    return out;
  }
  // What a token of each type costs you (weighted points): what techniques make of a token,
  // half for a type near the cap (it would go to waste), and half more for a type the next two
  // songs in your token aim need and you don't have plenty of.
  function tokenPrices(plan, ctx) {
    const u = techTokenUnit(plan, ctx) * tokenUrgency(plan);
    const need = [0, 0, 0, 0, 0];
    plan.queue.filter((x) => x.now).slice(0, 2).forEach((x) => x.song.cost.forEach((c, i) => { need[i] += c; }));
    return plan.have.map((h, i) => ({
      price: u * ((h || 0) >= plan.cap - 30 ? 0.5 : need[i] > 0 && (h || 0) - need[i] < 10 ? 1.5 : 1),
      why: (h || 0) >= plan.cap - 30 ? "cap" : need[i] > 0 && (h || 0) - need[i] < 10 ? "song" : ""
    }));
  }
  function techCostOf(t, type) {
    if (t.cost) return t.cost.slice();
    const c = [0, 0, 0, 0, 0];
    if (type != null && type !== "" && Number.isInteger(+type) && +type >= 0 && +type < 5) c[+type] = t.any;
    return c;
  }
  function offeredTechnique(state, sc, id) {
    const offer = ((state.gl && state.gl.shop) || {})[id];
    const gl = state.gl || {};
    // During the pending phase, a shop offer without an explicit turn was
    // drawn before this concert. Use the concert's turn as the fallback so
    // the technique is listed at its original (older) tier.
    const fallback = gl.pendingConcert ? gl.pendingConcert.turn : state.turn;
    const at = offer && Number.isInteger(offer.turn) && offer.turn >= 5 && offer.turn <= state.turn ? offer.turn : fallback;
    return techniqueList({ turn: at }, sc).find((t) => t.id === id);
  }
  // Each technique's worth: its stats, SP, energy (what it saves you later) or hint (about 10 SP a
  // level), plus the 5 SP it pays at the next live, less what its tokens are worth. A random-type
  // cost counts the type you set (else an average type). shop: { id: { type } } for the ones on
  // offer. best: the one to get among those on offer you can afford (else among all).
  function rankTechniques(state, sc, ctxIn) {
    const list = techniqueList(state, sc);
    const plan = list.length ? tokenPlan(state, sc) : null;
    if (!plan) return null;
    const ctx = ctxIn || makeCtx(state, sc);
    const prices = tokenPrices(plan, ctx);
    const avgPrice = prices.reduce((a, x) => a + x.price, 0) / 5;
    const shop = (state.gl && state.gl.shop) || {};
    const have = plan.have;
    const rank = STATS.slice().sort((a, b) => ctx.w[b] * (ctx.need ? ctx.need[b] : 1) - ctx.w[a] * (ctx.need ? ctx.need[a] : 1));
    const items = list.map((current) => {
      const t = offeredTechnique(state, sc, current.id) || current;
      const offer = shop[t.id];
      const typed = offer && offer.type != null && offer.type !== "" ? +offer.type : null;
      const type = Number.isInteger(typed) && typed >= 0 && typed < 5 ? typed : null;
      const needsType = !!(t.any && offer && type == null);
      let value = sc.lives.some((l) => l >= state.turn) ? 5 * SP_VALUE : 0;
      const why = [];
      Object.entries(t.gain || {}).forEach(([k, n]) => { value += ctx.gainValue(k, n); });
      if (t.gain) why.push(Object.keys(t.gain).map((k) => L_RANK(rank.indexOf(k)) + " stat").join(" and "));
      if (t.sp) value += t.sp * SP_VALUE;
      if (t.energy) {
        const e2 = clamp(ctx.E + t.energy, 0, ctx.maxE);
        value += ctx.V[e2] - ctx.V[ctx.E];
        why.push(e2 > ctx.E ? "energy " + ctx.E + " → " + e2 : "energy is already full");
      }
      if (t.hint) { value += t.hint * 10 * SP_VALUE; why.push("a random skill for your A aptitudes"); }
      const c = techCostOf(t, type);
      let costV = c.reduce((a, n, i) => a + n * prices[i].price, 0);
      if (t.any && type == null) costV = t.any * avgPrice;
      c.forEach((n, i) => { if (n && prices[i].why) why.push(prices[i].why === "cap" ? "spends " + sc.tokens[i] + " (near the cap)" : "uses " + sc.tokens[i] + " your next songs need"); });
      const short = c.map((n, i) => Math.max(0, n - (have[i] || 0)));
      const afford = !needsType && (t.any && type == null ? Math.max.apply(null, have) >= t.any : short.every((n) => !n));
      if (needsType) why.push("choose the Performance type shown in your shop");
      return Object.assign({}, t, { value, costV, net: value - costV, afford, short, offered: !!offer, type, needsType, why: why.filter(Boolean) });
    }).sort((a, b) => b.net - a.net);
    const offered = items.filter((x) => x.offered);
    const pool = (offered.length ? offered : items).filter((x) => x.afford);
    const songs = shopSongs(state, sc, plan);
    const songOffers = songs.filter((x) => x.offered);
    return { items, offered: offered.length, best: pool[0] || null, plan, ctx, songs, songsOffered: songOffers.length, bestSong: songOffers.find((x) => x.afford) || null };
  }
  // The lesson shop, songs first: buy the most important song your shop shows (or hold it when
  // the song plan carries it over to after the live). Otherwise a technique: while this half
  // still wants songs, the one that keeps the tokens your next song needs (techniques are what
  // make songs show up), cheapest first; once its songs are bought, the best stat technique you
  // can pay from spare tokens. ifOffered: the top picks when you haven't ticked anything.
  function lessonShop(state, sc, ctxIn) {
    const r = rankTechniques(state, sc, ctxIn);
    if (!r) return null;
    const plan = songPlan(state, sc);
    const phase = !plan || plan.step === "song" ? "songs" : plan.step === "hold" ? "hold" : "stats";
    const have = r.plan.have;
    const budget = periodSongBudget(state, sc, r.plan);
    const nextSong = r.songs.find((x) => x.offered) || r.songs.find((x) => x.aim < Infinity);
    const reserve = phase !== "stats" && budget ? budget.need.slice() : [0, 0, 0, 0, 0];
    const total = (t) => techCostOf(t, t.type).reduce((a, b) => a + b, 0) || t.any || 0;
    r.items.forEach((t) => {
      const c = techCostOf(t, t.type);
      if (t.any && t.type == null) {
        // Paid from whatever type the shop shows: count it against your biggest spare pile.
        const spare = have.map((h, i) => (h || 0) - reserve[i]);
        t.conflict = Math.max(0, t.any - Math.max.apply(null, spare));
      } else {
        t.conflict = c.reduce((a, n, i) => a + Math.max(0, n - Math.max(0, (have[i] || 0) - reserve[i])), 0);
      }
      t.keeps = t.conflict === 0;
      t.total = total(t);
    });
    const order = phase === "songs"
      ? (a, b) => (b.afford - a.afford) || (a.conflict - b.conflict) || (a.total - b.total) || (b.net - a.net)
      : (a, b) => (b.afford - a.afford) || (a.conflict - b.conflict) || (b.net - a.net);
    const techs = r.items.slice().sort(order);
    const offeredTechs = techs.filter((t) => t.offered && t.afford);
    // A technique that eats into the next song's tokens only while no song is showing (you need
    // techniques to see songs); once songs are bought, only from spare tokens.
    const needsUnlock = !r.songsOffered && (phase === "songs" || (phase === "hold" && plan.techNow > 0));
    const okTech = (t) => (t.keeps || needsUnlock) && (phase !== "stats" || t.net > 0);
    let pick = null;
    const explicitHold = heldSong(state, sc);
    // When a concert is pending, songs held across it should be evaluated
    // against the pending concert's turn (not the post-advance turn).
    const glState = state.gl || {};
    const carryTurn = glState.pendingConcert ? glState.pendingConcert.turn : state.turn;
    let song = r.songs.find((x) => x.offered && x.afford);
    const shownSong = r.songs.find((x) => x.offered && (!explicitHold || x.song.id === explicitHold.id));
    if (phase === "stats") {
      const prices = tokenPrices(r.plan, r.ctx);
      const liveSP = sc.lives.some((l) => l >= state.turn) ? 25 * SP_VALUE : 0;
      r.songs.forEach((x) => { x.net = concertSongValue(x.song, r.ctx.w, state.turn, sc) + liveSP - x.song.cost.reduce((n, c, i) => n + c * prices[i].price, 0); });
      song = r.songs.filter((x) => x.offered && x.afford && x.net > 0).sort((a, b) => b.net - a.net)[0];
      const tech = offeredTechs.find((t) => t.kind !== "energy" && okTech(t));
      if (song && (!tech || song.net > tech.net)) pick = { kind: "song", item: song };
      else if (tech) pick = { kind: "tech", item: tech };
    } else if (shownSong && phase === "hold" && (explicitHold || !song || shouldCarrySong(song.song, r.ctx.w, carryTurn, sc))) pick = { kind: "hold", item: explicitHold ? shownSong : song || shownSong };
    else if (song) pick = { kind: "song", item: song };
    if (!pick) {
      const t = offeredTechs.find((x) => x.kind !== "energy" && okTech(x));
      if (t) pick = { kind: "tech", item: t };
    }
    const ifOffered = techs.filter((t) => t.afford && t.kind !== "energy" && okTech(t)).slice(0, 3);
    const songsWanted = plan ? Math.max(0, plan.target - plan.bought) : 0;
    return Object.assign(r, { phase, techs, pick, ifOffered, nextSong, reserve, songsWanted, songPlan: plan, budget });
  }

  // Songs your shop could show now (unlocked, not learned), in token aim order (most important
  // first), with the ones you've ticked as on offer. Song ids in the shop are "song:<id>".
  function shopSongs(state, sc, plan) {
    const learned = (state.gl && state.gl.songs) || {};
    const shop = (state.gl && state.gl.shop) || {};
    const have = (state.gl && state.gl.tokens) || [0, 0, 0, 0, 0];
    const pos = new Map(((plan && plan.queue) || []).map((x, i) => [x.song.id, i]));
    const p = currentPeriod(sc, state);
    const w = statWeights(state);
    return sc.songs.filter((song) => learned[song.id] == null && song.from <= state.turn && song.from <= 72).map((song) => {
      const short = song.cost.map((c, i) => Math.max(0, c - (have[i] || 0)));
      const aim = pos.has(song.id) ? pos.get(song.id) : Infinity;
      const why = [];
      if (aim < Infinity) why.push("#" + (aim + 1) + " in your token aim");
      if ((GL_FOCUS[p] || []).indexOf(song.id) !== -1) why.push("the song plan's pick");
      if ((GL_AVOID[p] || []).indexOf(song.id) !== -1) why.push("skip in year one if you can");
      return { id: "song:" + song.id, song, offered: !!shop["song:" + song.id], afford: short.every((n) => !n), short, aim, why };
    }).sort((a, b) => a.aim - b.aim || songImportance(b.song, state, sc, w) - songImportance(a.song, state, sc, w));
  }
  // Learning a song from the shop: its cost, marked learned this turn, and the shop's ticks clear
  // (it shows new lessons). lastBuy undoes it.
  function buySong(state, sc, songId) {
    const song = (sc.songs || []).find((x) => x.id === songId);
    const old = state.gl || {};
    const have = old.tokens || [0, 0, 0, 0, 0];
    if (!song || state.turn < song.from || state.turn > sc.totalTurns || (old.songs || {})[songId] != null || !canPay(have, song.cost)) return state;
    state.gl = state.gl || { songs: {}, tokens: [0, 0, 0, 0, 0], lessons: {} };
    const gl = state.gl;
    const before = purchaseState(state);
    gl.tokens = have.map((n, i) => n - song.cost[i]);
    gl.songs = Object.assign({}, gl.songs, { [song.id]: state.turn });
    // Record the current period for persistent attribution
    gl.songPeriods = Object.assign({}, gl.songPeriods, { [song.id]: currentPeriod(sc, state) });
    if (state.trackStats && state.stats) Object.entries(song.once || {}).forEach(([k, n]) => { if (STATS.includes(k) && state.stats[k] > 0) state.stats[k] += n; });
    const p = currentPeriod(sc, state);
    if (!Object.entries(old.songs || {}).some(([id, t]) => t < state.turn && glPeriodFor(sc, id, state) === p) && gl.carry && gl.carry.period === p && gl.carry.songs.includes(song.id)) {
      gl.carriedPeriods = Object.assign({}, gl.carriedPeriods, { [p]: true });
    }
    delete gl.carry;
    delete gl.holdSong;
    gl.shop = {};
    gl.lastBuy = { id: "song:" + song.id, label: song.name, turn: state.turn, before, after: JSON.stringify(purchaseState(state)), sp: (song.once || {}).sp || 0 };
    return state;
  }
  // Record an already-owned song when its rewards/cost are already reflected in
  // the game's balances. This never invents missing income or charges twice.
  // Preserves uncertainty when the historical date does not establish before/after
  // concert timing. A current pending phase or observed carry can establish it.
  function recordLearnedSong(state, sc, songId, at) {
    const song = (sc.songs || []).find((x) => x.id === songId);
    if (!state.gl || !song || !Number.isInteger(at) || at < song.from || at > Math.min(state.turn, sc.totalTurns) || (state.gl.songs || {})[songId] != null) return false;
    const gl = state.gl;
    const current = currentPeriod(sc, state);
    const observedCarry = gl.carry && gl.carry.period === current && gl.carry.songs.includes(songId);
    // The current pending phase or an observed current carry supplies timing
    // evidence. A historical concert-plus-one date alone could be pre-stage
    // or after the concert; persist null so legacy fallback cannot guess later.
    const p = at === state.turn && (gl.pendingConcert || observedCarry) ? current
      : sc.lives.some((turn) => at === turn + 1) ? null : glPeriod(sc, at);
    gl.songPeriods = Object.assign({}, gl.songPeriods, { [songId]: p });
    if (p != null && at === state.turn && !Object.entries(gl.songs || {}).some(([id]) => glPeriodFor(sc, id, state) === p) && observedCarry) gl.carriedPeriods = Object.assign({}, gl.carriedPeriods, { [p]: true });
    gl.songs = Object.assign({}, gl.songs, { [songId]: at });
    if (at === state.turn) { gl.shop = {}; delete gl.holdSong; delete gl.carry; }
    else if (gl.shop) delete gl.shop["song:" + songId];
    return true;
  }
  const L_RANK = (i) => ["your top", "your 2nd", "your 3rd", "your 4th", "your 5th"][i] || "a";
  // Buying a technique: its tokens (a random-type cost requires the actual shown
  // type), a lesson toward the next song, its stats (when the coach tracks them) and
  // energy. The shop shows 3 new offers after a buy, so the ticks clear. lastBuy undoes it.
  function buyTechnique(state, sc, id, type) {
    const t = offeredTechnique(state, sc, id);
    if (!t) return state;
    const old = state.gl || {};
    const offer = (old.shop || {})[id];
    const chosenType = type != null && type !== "" ? +type : offer && offer.type != null && offer.type !== "" ? +offer.type : null;
    if (t.any && !(Number.isInteger(chosenType) && chosenType >= 0 && chosenType < 5)) return state;
    const c = techCostOf(t, chosenType);
    if (!canPay(old.tokens || [], c)) return state;
    state.gl = state.gl || { songs: {}, tokens: [0, 0, 0, 0, 0], lessons: {} };
    const gl = state.gl;
    const before = purchaseState(state);
    gl.tokens = gl.tokens.map((n, i) => n - c[i]);
    const p = currentPeriod(sc, state);
    gl.lessons = gl.lessons || {};
    gl.lessons[p] = (gl.lessons[p] || 0) + 1;
    if (state.trackStats && state.stats) Object.entries(t.gain || {}).forEach(([k, n]) => { if (state.stats[k] > 0) state.stats[k] = Math.round(state.stats[k] + n); });
    if (t.energy) state.energy = clamp(Math.round(state.energy + t.energy), 0, state.maxEnergy || 100);
    delete gl.carry;
    delete gl.holdSong;
    gl.shop = {};
    gl.lastBuy = { id, label: t.label, turn: state.turn, before, after: JSON.stringify(purchaseState(state)), sp: t.sp || 0 };
    return state;
  }
  function canPay(have, cost) {
    return have.length === 5 && cost.length === 5 && cost.every((n, i) => Number.isFinite(have[i]) && have[i] >= 0 && Number.isFinite(n) && n >= 0 && have[i] >= n);
  }
  function purchaseState(state) {
    const gl = state.gl || {};
    return JSON.parse(JSON.stringify({ turn: state.turn, tokens: gl.tokens || [], lessons: gl.lessons || {}, songs: gl.songs || {}, ...(Object.prototype.hasOwnProperty.call(gl, "songPeriods") ? { songPeriods: gl.songPeriods } : {}), stats: state.stats || {}, energy: state.energy, shop: gl.shop || {}, carry: gl.carry || null, holdSong: gl.holdSong || null, carriedPeriods: gl.carriedPeriods || {}, pendingConcert: gl.pendingConcert || null, finalizationEvent: gl.finalizationEvent || {} }));
  }
  function undoBuy(state) {
    const b = state.gl && state.gl.lastBuy;
    if (!b) return state;
    if (b.turn !== state.turn || !b.after || JSON.stringify(purchaseState(state)) !== b.after) return state;
    state.gl.tokens = b.before.tokens;
    state.gl.lessons = b.before.lessons;
    if (b.before.songs) state.gl.songs = b.before.songs;
    if (Object.prototype.hasOwnProperty.call(b.before, "songPeriods")) state.gl.songPeriods = b.before.songPeriods; else delete state.gl.songPeriods;
    state.gl.shop = b.before.shop || {};
    if (b.before.stats) state.stats = b.before.stats;
    if (b.before.energy != null) state.energy = b.before.energy;
    if (b.before.carry) state.gl.carry = b.before.carry; else delete state.gl.carry;
    if (b.before.holdSong) state.gl.holdSong = b.before.holdSong; else delete state.gl.holdSong;
    state.gl.carriedPeriods = b.before.carriedPeriods || {};
    delete state.gl.lastBuy;
    return state;
  }

  // Tokens a training gives: every token buys technique lessons (stats, SP at the live, and the
  // lessons that make songs show up), worth more while this half's song plan is behind; on top,
  // the tokens that fill the token aim's gaps count toward those songs: the next song's
  // shortfall first, then the next one's, each song in line counting a little less. Nothing
  // past the cap.
  function songTokenValue(f, ctx) {
    const st = ctx.state;
    const sc = ctx.sc;
    if (!sc.songs || !sc.tokenOf || st.turn < 5 || st.turn > sc.totalTurns) return null;
    const plan = tokenPlan(st, sc);
    if (!plan) return null;
    const shorts = plan.queue.map((x) => x.short.slice());
    const unit = techTokenUnit(plan, ctx) * tokenUrgency(plan);
    let add = 0;
    let hello = 0;
    let first = Infinity;
    const got = [0, 0, 0, 0, 0];
    const room = plan.have.map((h) => Math.max(0, plan.cap - (h || 0)));
    tokenGain(f, st, sc, true).forEach((g) => {
      let amount = Math.min(g.amount, room[g.type]);
      room[g.type] -= amount;
      got[g.type] += amount;
      if (g.lh) hello += amount;
      add += amount * unit;
      plan.queue.forEach((x, k) => {
        const take = Math.min(amount, shorts[k][g.type]);
        if (take <= 0) return;
        shorts[k][g.type] -= take;
        amount -= take;
        add += take * plan.base * 0.75 * x.w;
        first = Math.min(first, k);
      });
    });
    if (!add) return null;
    const total = got.reduce((a, b) => a + b, 0);
    const bits = got.map((n, i) => [n, i]).filter(([n]) => n >= 1).sort((a, b) => b[0] - a[0]).map(([n, i]) => sc.tokens[i] + " " + Math.round(n));
    // Tokens are stats too (through techniques), but a much stronger training still wins.
    add = Math.min(add, 1.1 * ctx.typ);
    const song = first < Infinity ? plan.queue[first].song : null;
    return {
      add, tokens: true, amount: total,
      note: "~" + Math.round(total - hello) + " training points" + (hello ? " + ~" + hello.toFixed(1) + " Hello expectation (random event)" : "") + " (" + bits.join(", ") + ")" + (song ? " toward " + song.name + (first === 0 ? " (your next song)" : " (song " + (first + 1) + " in your token aim)") : " for technique lessons")
    };
  }

  // ---- Support card events (Umamusume Wiki) ----
  // Each card's chain and other events, with every choice's results. Values listed as a range
  // ("Energy +10-16") go from LB0 to LB4; success/failure results are counted half each.
  function cardEvents(cardId, lb, scenario) {
    const c = CardEvents && CardEvents.cards && CardEvents.cards[cardId];
    if (!c) return null;
    const list = (ids) => (ids || []).map((id) => Object.assign({ id }, CardEvents.events[id] || { n: "Event " + id }));
    const out = { chain: list(c.chain), other: list(c.other) };
    const hp = Hello.profile(Deck.card(cardId), lb == null ? 4 : lb);
    if (hp) {
      out.chain = out.chain.map((ev, i) => Object.assign({}, ev, { c: i < 4 ? hp.dates[i].opts : [{ ok: hp.dates[4].opts[0], ng: hp.dates[4].opts[1] }] }));
      out.other = out.other.map((ev) => {
        if (ev.id === 809008002) return Object.assign({}, ev, { c: [hp.first] });
        if (ev.id === 809008001) return Object.assign({}, ev, { c: hp.random.map((o, i) => Object.assign({ t: i ? "A large platter of desserts!" : "Maybe something to boost my energy." }, o)) });
        if (ev.id === 809008011) return Object.assign({}, ev, { c: hp.newYear(scenario && scenario.id === "grandlive").map((o, i) => Object.assign({ t: i ? "Time to kick back and chow down!" : "...Just one song." }, o)) });
        if (ev.id === 809008004) return Object.assign({}, ev, { c: [Object.assign({ t: "I'd be glad to!", unlock: true }, hp.unlock), Hello.scale({ t: "Sorry, I'm a little strapped for time...", s: [0, 0, 0, 0, 30], sp: 30, b: -5, h: [[200272, 5]] }, hp.effects)] });
        if (ev.id === 809008009 || ev.id === 809008010) return Object.assign({}, ev, { c: [hp.ending(ev.id === 809008009)] });
        if (ev.id === 809008003) return Object.assign({}, ev, { c: [{ ok: Object.assign({ mo: 1, x: "Grand Concert only: observed +20 tokens (R may also grant +10)" }, hp.repeat), ng: Object.assign({ x: "Grand Concert only: observed +20 tokens (R may also grant +10)" }, hp.repeat) }] });
        return ev;
      });
    }
    return out;
  }

  function atLB(v, lb) {
    return Array.isArray(v) ? Math.round(v[0] + ((v[1] - v[0]) * (lb != null ? lb : 4)) / 4) : v;
  }

  function evOutcome(o, lb) {
    if (!o) return null;
    const out = {};
    ["e", "me", "mo", "sp", "b", "r", "rn"].forEach((k) => { if (o[k] != null) out[k] = atLB(o[k], lb); });
    if (o.s) out.s = o.s.map((g) => atLB(g, lb));
    ["h", "g", "cure", "x", "unlock", "end"].forEach((k) => { if (o[k] != null) out[k] = o[k]; });
    return out;
  }

  // One choice's parts: what it always gives, plus half of success and half of failure.
  function eventChoiceParts(ch, ctx, lb) {
    const base = dateParts(evOutcome(ch, lb), ctx);
    if (ch.g) base.hint = (base.hint || 0) + ch.g.length * 0.5 * ctx.typ;
    [ch.ok, ch.ng].forEach((o) => {
      if (!o) return;
      const p = dateParts(evOutcome(o, lb), ctx);
      Object.keys(p).forEach((k) => { base[k] = (base[k] || 0) + 0.5 * p[k]; });
    });
    return base;
  }

  function eventText(ch, lb) {
    const o = evOutcome(ch, lb) || {};
    const bits = [];
    const main = dateText(o);
    if (main) bits.push(main);
    if (o.b) bits.push("bond " + (o.b > 0 ? "+" : "") + o.b);
    (ch.g || []).forEach((id) => bits.push("gets " + skillName(id)));
    if (ch.unlock) bits.push("unlocks outings");
    if (ch.ok) bits.push("on success: " + (eventText(ch.ok, lb) || "nothing"));
    if (ch.ng) bits.push("on failure: " + (eventText(ch.ng, lb) || "nothing"));
    (ch.when || []).forEach((r) => bits.push("if choice " + r.choice + " was selected in chain event " + r.stage + ": " + eventText(r, lb)));
    return bits.join(", ");
  }

  // Ranks an event's choices for this turn. Returns [{ i, text, label, value }], best first.
  function rankEventChoices(state, sc, ev, lb) {
    if (!ev || !ev.c || !ev.c.length) return [];
    const ctx = makeCtx(state, sc);
    // On an outing unlock event, the other choice locks the card's outings for the run: worth
    // about one strong turn per outing lost.
    const unlockEvent = ev.c.some((ch) => ch.unlock);
    return ev.c.map((ch, i) => {
      const locks = unlockEvent && !ch.unlock;
      const value = sumParts(eventChoiceParts(ch, ctx, lb)) - (locks ? 5 * ctx.typ : 0);
      return { i, label: ch.t || "", text: eventText(ch, lb) + (locks ? ", locks outings" : ""), value };
    }).sort((a, b) => b.value - a.value);
  }

  // ---- Friend / Group card outings ("dates") ----
  // Cards in data/dates.js use game8's values for each outing: the coach values every choice
  // (energy, max energy, mood, stats, skill points, hints, curing a bad condition) and picks
  // the best for this turn. Other cards fall back to typical values.
  const dateCard = (id) => {
    const p = Hello.profile(Deck && Deck.card(id), 4);
    if (p) return { unscaled: true, page: 473490, dates: p.rawDates, unlock: { name: "Embrace Those Emotions!", keep: p.rawUnlock, lose: { s: [0, 0, 0, 0, 30], sp: 30, b: -5, h: [[200272, 5]] } } };
    return (Dates && Dates.cards && Dates.cards[id]) || null;
  };
  const DATE_STATS = ["speed", "stamina", "power", "guts", "wit"];

  // Max energy for this career: 100 plus what the outings done so far added (Light Hello's
  // first: +4). An outing with a choice counts its best max energy.
  function careerMaxEnergy(state) {
    let me = 100;
    ((state.deck && state.deck.slots) || []).forEach((sl) => {
      const dc = sl && sl.id ? dateCard(sl.id) : null;
      const done = (sl && sl.dates && sl.dates.done) || 0;
      if (!dc || !done) return;
      dc.dates.slice(0, done).forEach((d) => { me += Math.max(0, ...(d.opts || []).map((o) => o.me || 0)); });
    });
    return me;
  }

  // What curing your conditions is worth: a bad condition can cost mood, energy or stats;
  // Practice Poor adds 2% to every stat training's failure until it's cured (umamusu.wiki),
  // worth more the more turns are left.
  function cureValue(state, ctx) {
    let v = 0;
    if (state.badCondition || Conditions.list.some((c) => c.cure && c.id !== "poor" && Conditions.has(state, c.id))) v += 0.7 * ctx.typ * Math.min(1, ctx.turnsLeft / 10);
    if (Conditions.has(state, "poor")) v += Math.min(0.8, 0.02 * ctx.turnsLeft) * ctx.typ;
    return v;
  }

  function hintValue(h, ctx) {
    return (h || []).reduce((a, [id, lv]) => {
      const gold = Dates && Dates.gold && Dates.gold.indexOf(id) !== -1;
      return a + lv * (gold ? 0.1 : 0.05) * ctx.typ;
    }, 0);
  }

  // Value of one outcome, split into parts so the comparison reasons stay readable.
  function curedMoodStep(ctx, from) {
    const state = Object.assign({}, ctx.state, { conditions: Object.assign({}, ctx.state.conditions, { migraine: false }) });
    return moodStepValue(from, state, ctx.sc, ctx.calib) * ctx.sat;
  }
  function dateParts(o, ctx) {
    const st = ctx.state;
    let mood = 0;
    for (let i = 0, m = st.mood; i < Math.abs(o.mo || 0); i++) {
      if (o.mo > 0 && m < 4) { mood += o.cure ? curedMoodStep(ctx, m) : ctx.moodStep(m); m++; } else if (o.mo < 0 && m > 0) { mood -= ctx.moodStep(m - 1); m--; }
    }
    const rand = o.r ? (o.r * (o.rn || 1)) / 5 : 0; // a random stat, spread as an average
    const stats = DATE_STATS.reduce((a, k, i) => { const g = ((o.s || [])[i] || 0) + rand; return a + (g ? ctx.gainValue(k, g) : 0); }, 0);
    return {
      energy: ctx.energyValue(o.e || 0) + (o.me ? ctx.energyValue(Math.min(o.me, 10)) * 0.5 : 0),
      mood,
      stats,
      sp: (o.sp || 0) * SP_VALUE,
      hint: hintValue(o.h, ctx),
      bond: (o.b || 0) > 0 ? 0.04 * ctx.typ : 0,
      condition: o.cure ? cureValue(st, ctx) : 0
    };
  }

  // A choice can be an outcome or a roll between two outcomes (success or not).
  function choiceParts(c, ctx) {
    if (!c.roll) return dateParts(c, ctx);
    const a = choiceParts(c.opts[0], ctx);
    const b = choiceParts(c.opts[1], ctx);
    const p = c.p != null ? c.p : 0.5;
    const out = {};
    Object.keys(a).forEach((k) => { out[k] = p * a[k] + (1 - p) * (b[k] || 0); });
    return out;
  }

  // Short text of what an outcome gives, e.g. "+80 energy, mood +1" or "Speed +20, Guts +20".
  function dateText(o) {
    if (o.roll) return o.fail ? dateText(o.opts[0]) + " if it succeeds (it can fail: " + (dateText(o.opts[1]) || "nothing") + ")" : dateText(o.opts[0]) + " on a great success (a little less otherwise)";
    const bits = [];
    if (o.e) bits.push((o.e > 0 ? "+" : "") + o.e + " energy");
    if (o.me) bits.push("+" + o.me + " max energy");
    if (o.mo) bits.push("mood " + (o.mo > 0 ? "+" : "") + o.mo);
    const s = o.s || [];
    if (s.length && s.every((g) => g === s[0]) && s[0]) bits.push("all stats +" + s[0]);
    else s.forEach((g, i) => { if (g) bits.push(STAT_LABELS[DATE_STATS[i]] + " +" + g); });
    if (o.r) bits.push((o.rn > 1 ? o.rn + " random stats +" : "a random stat +") + o.r);
    if (o.sp) bits.push(o.sp + " SP");
    (o.h || []).forEach(([id, lv]) => bits.push(skillName(id) + " hint +" + lv));
    if (o.cure) bits.push("cures a bad condition");
    if (o.x) bits.push(o.x);
    return bits.join(", ");
  }

  function skillName(id) {
    const n = Deck && Deck.DATA && Deck.DATA.skills ? Deck.DATA.skills[id] : null;
    return n || "skill #" + id;
  }

  // Multipliers that turn game8's values (at info.lv, full limit break when not stated) into
  // this card's: Event Recovery (effect 25) for energy, Event Effectiveness (26) for the rest.
  function dateScale(sl, info) {
    if (!Deck || !Deck.baseEffects) return { e: 1, s: 1 };
    const at = (lv) => Deck.baseEffects(sl.card, lv) || {};
    const now = at(sl.level);
    if (info.unscaled) return { e: 1 + (now[25] || 0) / 100, s: 1 + (now[26] || 0) / 100, floor: true };
    const ref = at(info.lv || 50);
    return {
      e: (1 + (now[25] || 0) / 100) / (1 + (ref[25] || 0) / 100),
      s: (1 + (now[26] || 0) / 100) / (1 + (ref[26] || 0) / 100)
    };
  }

  function scaleDate(o, k) {
    if (!o) return o;
    const out = Object.assign({}, o);
    if (o.opts) out.opts = o.opts.map((x) => scaleDate(x, k));
    const round = k.floor ? (n) => Math.floor(n + 1e-9) : Math.round;
    if (o.e > 0 && o.e < 100) out.e = round(o.e * k.e);
    if (o.s) out.s = o.s.map((g) => (g > 0 ? round(g * k.s) : g));
    if (o.sp > 0) out.sp = round(o.sp * k.s);
    if (o.r) out.r = round(o.r * k.s);
    return out;
  }

  function outingOptions(ctx) {
    const { state, deck, typ } = ctx;
    if (!deck || ctx.camp || state.goalRace) return [];
    return deck.used.filter((sl) => (sl.card.ty === "friend" || sl.card.ty === "group")).map((sl) => {
      const raw = state.deck.slots[sl.idx] || {};
      const d = raw.dates || {};
      if (!d.unlocked) return null;
      const n = (d.done || 0) + 1;
      const info = dateCard(sl.card.id);
      if (n > (info ? info.dates.length : 5)) return null; // every outing done
      const raw0 = info && info.dates[n - 1];
      // game8 lists values at one card level: rescale them by this card's Event Recovery
      // (energy) and Event Effectiveness (stats, SP) at its own level.
      const known = raw0 ? scaleDate(raw0, dateScale(sl, info)) : null;
      const base = { kind: "recreation", outing: sl.idx, prefix: [], consume: {} };
      if (known) {
        const tries = known.opts.map((c) => ({ c, parts: known.roll ? choiceParts(known, ctx) : choiceParts(c, ctx) }))
          .map((x) => Object.assign(x, { value: sumParts(x.parts) })).sort((a, b) => b.value - a.value);
        const pick = known.roll ? { c: known, parts: tries[0].parts, value: tries[0].value } : tries[0];
        const out = pick.c.roll ? pick.c.opts[1] : pick.c;
        const notes = ["outing " + n + " of " + info.dates.length + " with " + sl.card.n + ": " + dateText(pick.c)];
        if (!known.roll && tries.length > 1) notes.push("pick the choice that gives that; the other " + (tries.length > 2 ? "choices give " : "one gives ") + tries.slice(1).map((x) => dateText(x.c)).join("; or "));
        if (out.me) notes.push("max energy goes up to " + (ctx.maxE + out.me));
        const statGains = {};
        DATE_STATS.forEach((k, i) => { const g = ((out.s || [])[i] || 0) + (out.r ? (out.r * (out.rn || 1)) / 5 : 0); if (g) statGains[k] = g; });
        if (out.cure) base.consume = { cureConditions: true };
        return Object.assign(base, {
          label: "Outing with " + sl.card.n + " (" + n + "/" + info.dates.length + ")",
          energyDelta: out.e || 0, moodDelta: Math.max(-state.mood, Math.min(4 - state.mood, out.mo || 0)),
          maxEnergyDelta: out.me || 0, statGains,
          outingRoll: pick.c.roll ? pick.c.opts : null,
          outingHints: out.h || [],
          notes, parts: pick.parts, value: pick.value
        });
      }
      const last = n >= 5;
      const energy = 20;
      const parts = {
        energy: ctx.energyValue(energy),
        mood: ctx.moodStep(state.mood),
        stats: (last ? 25 : 12) * ctx.avgW,
        bond: 0.04 * typ
      };
      return Object.assign(base, {
        label: "Outing with " + sl.card.n,
        energyDelta: energy, moodDelta: state.mood < 4 ? 1 : 0,
        notes: ["outing " + n + " with " + sl.card.n + ": energy, mood, stats and bond (typical values; no outing data for this card)"].concat(state.mood >= 4 ? ["mood is already Great, but the outing still pays stats and energy"] : []),
        parts, value: sumParts(parts)
      });
    }).filter(Boolean);
  }

  function deckGain(f, ctx) {
    const { state, sc, deck } = ctx;
    if (!deck || !sc.train || !Array.isArray(f.members)) return null;
    const members = f.members.map((i) => deck.slots[i]).filter(Boolean);
    const L = facLevelFor(state, sc, f.stat);
    const genre = f.extras && f.extras.genre;
    const row = sc.trainByGenre && genre && sc.trainByGenre[genre] ? sc.trainByGenre[genre][f.stat] : sc.train[f.stat];
    const r = Deck.trainingGain(row, f.stat, members, {
      facilityLevel: L, extra: f.extra || 0, mood: state.mood, growth: deck.growth,
      energy: ctx.E, maxEnergy: ctx.maxE, deckTypes: deck.deckTypes, totalBond: deck.totalBond,
      flat: { main: ctx.songs.extra[f.stat] || 0, sp: ctx.songs.extra.sp || 0 }, fbBonus: ctx.songs.fb
    });
    const boost = ctx.boost;
    r.level = L;
    r.boost = boost;
    r.rawTotal = r.total;
    r.gains = r.gains.map((g, i) => i === 0 && Conditions.has(state, "slowMetabolism") ? 0 : g * boost);
    r.total = r.gains.reduce((a, b) => a + b, 0);
    r.sp *= boost;
    r.members = members;
    return r;
  }

  // ---- Focus cards ----
  // Getting one card to friendship (bond 80, orange) early is a must, and a second one is nice
  // to have. Which cards: the ones that should give the most rainbows in Junior year if you
  // focus them from now, from their current bond and their specialty priority:
  //   score = P(own training) × 0.92^T × (1 + Friendship bonus) × (0.75 + 0.25 × stat weight)
  //   P(own training) = (100 + SP) / (550 + SP): each training weighs 100, the card's own one
  //     100 + its Specialty Priority, not showing up 50 (fan guides). A card only rainbows there,
  //     so this is how often it rainbows once it's orange.
  //   T = turns to orange = trainings still needed (80 − bond) / 7, rounded up, ÷ (the chance
  //     it's on some training, (500 + SP) / (550 + SP), × 0.6, about how often you can follow it)
  //   0.92^T: early rainbows count most, so each turn of waiting costs about 8%.
  // So a card close to orange wins until a higher-specialty card is only a little behind, and
  // training with your focus card keeps it on top. With no card orange yet, the best one is the
  // main focus (a big push on every training it's on, full to the debut on turn 12, fading out
  // by the end of Junior year) and the next one gets a small push (never over extra song tokens,
  // see evaluate). Once one is orange, the best of the rest gets the small push. Friend and
  // Group cards aren't focus cards.
  const FOCUS_K = 2.0;
  const SECOND_K = 0.3;
  function focusWeight(turn, rank) {
    if (rank === 2) return turn <= 24 ? SECOND_K : turn >= 36 ? 0 : SECOND_K * (36 - turn) / 12;
    return turn <= 12 ? FOCUS_K : turn >= 24 ? 0 : FOCUS_K * (24 - turn) / 12;
  }
  const FOCUS_FOLLOW = 0.6;
  const FOCUS_DECAY = 0.92;
  function focusScore(x, w, bondGain = BOND_PER_TRAINING_E) {
    const sp = x.spec;
    const pSpec = (100 + sp) / (550 + sp);
    const pHere = (500 + sp) / (550 + sp);
    const trainings = Math.ceil(Math.max(0, 80 - x.bond) / bondGain);
    const T = trainings / (pHere * FOCUS_FOLLOW);
    const sw = w && w[x.type] != null ? w[x.type] : 1;
    return { pSpec, trainings, T, score: pSpec * Math.pow(FOCUS_DECAY, T) * (1 + x.fb / 100) * (0.75 + 0.25 * sw) };
  }
  function focusCards(deck, state) {
    if (!deck || !Deck) return [];
    const w = state ? statWeights(state) : null;
    const all = deck.used.filter((s) => s.card.ty !== "friend" && s.card.ty !== "group").map((s) => {
      const fx = Deck.baseEffects(s.card, s.level);
      const x = { idx: s.idx, card: s.card, bond: s.bond, type: s.card.ty, spec: fx[19] || 0, fb: fx[1] || 0, level: s.level };
      return Object.assign(x, focusScore(x, w, BOND_PER_TRAINING_E + (state && Conditions.has(state, "charming") ? 2 : 0)));
    });
    const tie = (a, b) => b.spec - a.spec || b.fb - a.fb || b.level - a.level;
    const orange = all.filter((x) => x.bond >= 80).sort((a, b) => b.pSpec - a.pSpec || tie(a, b));
    const building = all.filter((x) => x.bond < 80).sort((a, b) => b.score - a.score || tie(a, b));
    return orange.concat(building).slice(0, 2).map((x, i) => Object.assign(x, { rank: i + 1 }));
  }

  // The game counts down the turns to your debut (turn 12): 12 on turn 1, 9 on turn 4.
  function turnsToDebut(turn) {
    return turn <= 12 ? 13 - turn : 0;
  }

  // ---- Scenario openings (sc.opening in scenarios.js) ----
  //   early:      { to, wit, bond, note }  through turn `to`, favour Wit (wit x typ) and each card
  //               still building bond (bond x typ)
  //   rest:       { turn, below, note }    rest on this turn unless energy is at least `below`
  //   chase:      { name, from, belowGreat, event, note }  a scenario card that joins later: the
  //               first time she's on a training (from turn `from`), that training comes first
  //               wherever she is (within your failure limit), and her fixed first-training event
  //               (event: { mood, stats, bond }) is counted and applied on Done. With belowGreat,
  //               only while your mood is below Great.
  //   recreation: { from, to, note }  early Recreation for mood, by uma.guide's turn points (each
  //               card building bond, Wit, a hint, a white flame 1; a Spirit Burst 2): Recreation
  //               wins when no training scores above 1 on a full bar or at Good mood, or above 3
  //               at Normal mood once you've trained (its 10-30 energy isn't wasted then)
  const BOND_PER_TRAINING_E = 7;
  // Has this deck card trained with you yet? Logged by Done; older saves fall back to its bond.
  function metCard(ctx, slot) {
    const st = (ctx.state.deck && ctx.state.deck.slots[slot.idx]) || {};
    if (Hello.isHello(slot.card)) return Hello.hasMet(st);
    return !!st.met || slot.bond >= Deck.initialBond(slot.card, slot.level) + BOND_PER_TRAINING_E;
  }
  function chaseSlot(ctx, name) {
    if (!ctx.deck) return null;
    return ctx.deck.used.find((s) => s.card.n === name) || null;
  }
  function onTraining(ctx, o, idx) {
    const fac = ctx.state.facilities.find((x) => x.stat === o.stat);
    return !!(fac && Array.isArray(fac.members) && fac.members.indexOf(idx) !== -1);
  }
  function applyOpening(ctx, options) {
    const op = ctx.sc.opening;
    const t = ctx.state.turn;
    if (!op || options.some((o) => o.forced)) return;
    const typ = ctx.typ;
    const trains = options.filter((o) => o.kind === "train");
    const bump = (o, add) => { o.parts.opening = (o.parts.opening || 0) + add; o.value = sumParts(o.parts); };
    if (op.early && t <= op.early.to) {
      trains.forEach((o) => {
        const fac = ctx.state.facilities.find((x) => x.stat === o.stat) || {};
        const unbonded = Array.isArray(fac.members) && fac.members.length && ctx.deck
          ? fac.members.filter((i) => ctx.deck.slots[i] && ctx.deck.slots[i].bond < 80).length : fac.unbonded || 0;
        const add = ((o.stat === "wit" ? op.early.wit || 0 : 0) + (op.early.bond || 0) * unbonded) * typ;
        if (add) bump(o, add);
      });
    }
    if (op.recreation && t >= op.recreation.from && t <= op.recreation.to && ctx.state.mood < 4) {
      const rec = options.find((o) => o.kind === "recreation");
      const points = (o) => {
        const fac = ctx.state.facilities.find((x) => x.stat === o.stat) || {};
        const x = fac.extras || {};
        const deckMode = Array.isArray(fac.members) && fac.members.length && ctx.deck;
        const bonding = deckMode ? fac.members.filter((i) => ctx.deck.slots[i] && ctx.deck.slots[i].bond < 80).length : fac.unbonded || 0;
        const hints = deckMode ? (fac.hints || []).length : fac.hint ? 1 : 0;
        // Your main focus card comes first, so a training with it always counts as strong.
        const focus = deckMode ? ctx.focus.filter((fc) => fc.bond < 80 && fac.members.indexOf(fc.idx) !== -1).reduce((a, fc) => a + (fc.rank === 1 ? 3 : 1), 0) : 0;
        return bonding + hints + (o.stat === "wit" ? 1 : 0) + (x.flames > 0 ? 1 : 0) + 2 * (x.burst || 0) + focus;
      };
      const best = Math.max.apply(null, trains.map(points).concat([0]));
      const full = ctx.E >= ctx.maxE - 5;
      const limit = full || ctx.state.mood >= 3 ? 1 : 3;
      if (rec && best <= limit) {
        const top = Math.max.apply(null, options.filter((o) => o !== rec).map((o) => o.value));
        if (rec.value <= top) bump(rec, top - rec.value + 0.1 * typ);
        rec.notes.unshift((op.recreation.note || "opening: Recreation for mood") + " (no training scores above " + limit + " here)");
      }
    }
    const ch = op.chase;
    const slot = ch ? chaseSlot(ctx, ch.name) : null;
    if (slot && t >= ch.from && !metCard(ctx, slot) && !(ch.belowGreat && ctx.state.mood >= 4)) {
      const hers = trains.filter((o) => onTraining(ctx, o, slot.idx)).sort((a, b) => b.value - a.value)[0];
      if (hers) {
        // Her fixed first-training event.
        const hp = Hello.profile(slot.card, (ctx.state.deck.slots[slot.idx] || {}).lb);
        const ev = hp ? { mood: hp.first.mo, bond: hp.first.b, stats: { speed: hp.first.s[0], guts: hp.first.s[3] } } : ch.event || {};
        let add = 0;
        Object.keys(ev.stats || {}).forEach((k) => { add += ctx.gainValue(k, ev.stats[k]); });
        if (ev.mood && ctx.state.mood < 4) add += ctx.moodStep(ctx.state.mood);
        if (ev.bond) add += (ev.bond / BOND_PER_TRAINING_E) * bondK(t) * typ;
        if (add) bump(hers, add);
        hers.firstEvent = { idx: slot.idx, bond: ev.bond || 0, stats: ev.stats || null };
        if (ev.mood) hers.moodDelta = (hers.moodDelta || 0) + ev.mood;
        if (hers.fail <= ctx.state.risk) {
          const top = Math.max.apply(null, options.filter((o) => o !== hers).map((o) => o.value));
          if (hers.value <= top) bump(hers, top - hers.value + 0.1 * typ);
          hers.notes.unshift(ch.name + " is here for the first time: " + (hp ? "mood +1, Speed +" + ev.stats.speed + ", Guts +" + ev.stats.guts + ", +10 event bond; this enables her later outing-unlock event" : ch.note || "train with her now, whichever training she's on"));
        } else {
          hers.notes.unshift(ch.name + " is here for the first time, but failure (" + hers.fail + "%) is above your limit");
        }
      }
    }
    if (op.rest && t === op.rest.turn) {
      const rest = options.find((o) => o.kind === "rest");
      if (rest && ctx.E < op.rest.below) {
        const top = Math.max.apply(null, options.filter((o) => o !== rest).map((o) => o.value));
        if (rest.value <= top + 0.5 * typ) bump(rest, top + 0.5 * typ - rest.value);
        rest.notes.unshift((t <= 12 ? turnsToDebut(t) + " turns to your debut: rest. " : "Rest. ") + (op.rest.note || "") + " (rest is the pick below " + op.rest.below + " energy)");
      } else if (rest) {
        rest.notes.push("energy is " + ctx.E + ", high enough to skip the opening rest");
      }
    }
    options.sort((a, b) => b.value - a.value);
    if (op.early && t <= op.early.to && op.early.note && options[0]) options[0].notes.push(op.early.note);
  }

  function sumParts(p) {
    return Object.keys(p).reduce((a, k) => a + p[k], 0);
  }

  function trainingOption(f, ctx) {
    const { state, sc, typ } = ctx;
    const hook = HOOKS[sc.hook] || {};
    const est = !(f.gain > 0);
    const dg = deckGain(f, ctx);
    const failBlank = f.fail === null || f.fail === undefined || f.fail === "";
    const statGains = {};
    let gain, cards, rainbows, unbonded, spPts, energyDelta, fail;
    if (dg) {
      // Card formula, halved past 1200. A typed total gain (what the game shows) rescales the
      // formula's split across stats.
      const adj = dg.gains.map((g, i) => trainedGain(STATS[i], g, ctx.stats));
      const adjTotal = adj.reduce((a, b) => a + b, 0);
      // A typed number that's only the training's own stat rescales by that stat instead.
      const basis = !est ? typedGainBasis(+f.gain, adj, f.stat) : null;
      const scale = basis && basis.base > 0 ? +f.gain / basis.base : 1;
      STATS.forEach((st, i) => { if (adj[i] > 0) statGains[st] = adj[i] * scale; });
      gain = est ? adjTotal : basis && basis.main ? adjTotal * scale : +f.gain;
      if (!est && !(adjTotal > 0)) { const sp = splitFor(f.stat, sc); Object.keys(sp).forEach((st) => { statGains[st] = gain * sp[st]; }); }
      cards = dg.cards;
      rainbows = dg.rainbows;
      unbonded = dg.unbonded;
      spPts = dg.sp * scale;
      energyDelta = dg.energy;
      fail = failBlank ? clamp(Math.round(estimateFail(f.stat, ctx.E) * dg.failMult) + Conditions.failure(state), 0, 100) : clamp(+f.fail, 0, 100);
    } else {
      cards = f.cards || 0;
      rainbows = Math.min(f.rainbows || 0, cards);
      const rawGain = estimateGain(f, state, sc, ctx.calib) * (rainbows && ctx.songs.fb ? 1 + ctx.songs.fb / 100 : 1) + (ctx.songs.extra[f.stat] || 0);
      // Split by the scenario's base values and halve past 1200; a typed gain (what the game
      // shows) keeps that split.
      const sp = splitFor(f.stat, sc);
      Object.keys(sp).forEach((st) => { statGains[st] = st === "speed" && Conditions.has(state, "slowMetabolism") ? 0 : trainedGain(st, rawGain * sp[st], ctx.stats); });
      const adjTotal = Object.keys(statGains).reduce((a, st) => a + statGains[st], 0);
      gain = est ? adjTotal : +f.gain;
      if (!est && adjTotal > 0) Object.keys(statGains).forEach((st) => { statGains[st] *= gain / adjTotal; });
      unbonded = Math.min(f.unbonded || 0, cards - rainbows);
      spPts = (est ? rawGain : gain) * SP_RATE[f.stat];
      const ec = energyCost(f.stat, state.turn, sc, facLevelFor(state, sc, f.stat));
      energyDelta = ec < 0 ? -ec + 2 * rainbows : -ec;
      fail = failBlank ? clamp(estimateFail(f.stat, ctx.E) + Conditions.failure(state), 0, 100) : clamp(+f.fail, 0, 100);
    }
    let stats = 0;
    Object.keys(statGains).forEach((st) => { stats += ctx.gainValue(st, statGains[st]); });
    const o = {
      kind: "train",
      stat: f.stat,
      label: "Train " + STAT_LABELS[f.stat],
      gain, gainEst: est, fail, failEst: failBlank, cards, rainbows, statGains,
      formula: dg ? { level: dg.level, boost: dg.boost, sp: Math.round(spPts) } : null,
      energyDelta,
      moodDelta: 0,
      notes: [],
      prefix: [],
      consume: {},
      parts: {
        stats,
        sp: spPts * SP_VALUE,
        bond: unbonded * bondK(state.turn) * typ * (Conditions.has(state, "charming") ? 9 / 7 : 1),
        hint: (dg ? (f.hints || []).filter((i) => (f.members || []).indexOf(i) !== -1).length : f.hint ? 1 : 0) * 0.12 * typ,
        scenario: 0
      }
    };
    if (dg && dg.members.length) {
      const names = dg.members.map((m) => m.card.n + (Deck.isRainbow(m.card, m.bond, f.stat) ? " (friendship)" : m.bond < 80 ? " (bond " + Math.round(m.bond) + ")" : ""));
      o.notes.push(names.join(", "));
    }
    if (rainbows >= 2) o.notes.push(rainbows + " friendship cards stacked");
    else if (rainbows === 1) o.notes.push("1 friendship card");
    if (o.parts.bond >= 0.1 * typ) o.notes.push(unbonded + " card(s) still building bond");
    if (o.parts.hint > 0) o.notes.push(dg ? (f.hints || []).filter((i) => (f.members || []).indexOf(i) !== -1).length + " skill hint(s), with extra bond" : "skill hint");
    if (hook.facility) {
      const r = hook.facility(f, ctx, o) || {};
      if (r.tokenAdd) o.parts.tokens = r.tokenAdd;
      o.parts.scenario += r.add || 0;
      if (r.energy) o.energyDelta += r.energy;
      if (r.fail0) { o.fail = 0; o.failEst = false; }
      if (r.note) o.notes.push(r.note);
    }
    const aki = akikawaValue(f, ctx);
    if (aki) { o.parts.bond += aki.add; o.notes.push(aki.note); }
    if (dg && ctx.focus.length) {
      // Friendship (orange, 80) is the goal: bond past it adds nothing here.
      ctx.focus.filter((fc) => fc.bond < 80 && f.members.indexOf(fc.idx) !== -1 && focusWeight(state.turn, fc.rank) > 0).forEach((fc) => {
        const add = focusWeight(state.turn, fc.rank) * typ;
        o.parts.bond += add;
        o.focus = (o.focus || 0) + 1;
        if (fc.rank === 2) o.secondFocus = add;
        const eta = "bond " + Math.round(fc.bond) + ", " + fc.trainings + " training" + (fc.trainings === 1 ? "" : "s") + " to orange, on its own training " + Math.round(fc.pSpec * 100) + "% of turns";
        o.notes.push(fc.rank === 1
          ? "main focus card here: " + fc.card.n + " (" + eta + "). Getting one card to orange (80) early is a must"
          : "second focus card here: " + fc.card.n + " (" + eta + "), a small push toward orange");
      });
    }
    o.raw = o.parts.stats + o.parts.sp + o.parts.bond + o.parts.hint + o.parts.scenario + (o.parts.tokens || 0);
    scoreRisk(o, ctx);
    return o;
  }

  // ---- Chairman Akikawa ----
  // In scenarios with her bond check (sc.akikawa: [[turn, bond needed], ...]) she shows up on
  // trainings; training with her raises her bond (about +7, like a support card). The unique
  // skill level-up needs it (green, 60+, by Senior Early April in URA-style scenarios).
  const AKI_PER_TRAINING = 7;

  function akikawaCheck(state, sc) {
    if (!sc.akikawa) return null;
    const bond = +((state.extras && state.extras.akiBond) || 0);
    const next = sc.akikawa.find(([t, need]) => t >= state.turn && bond < need);
    return next ? { turn: next[0], need: next[1], bond, short: next[1] - bond } : null;
  }

  function akikawaValue(f, ctx) {
    if (!(f.extras && f.extras.aki)) return null;
    const chk = akikawaCheck(ctx.state, ctx.sc);
    if (!chk) return null;
    const gained = Math.floor(AKI_PER_TRAINING * (Conditions.has(ctx.state, "hotTopic") ? 1.4 : 1));
    const trainings = Math.ceil(chk.short / gained);
    const turnsLeft = chk.turn - ctx.state.turn + 1;
    // She's on a training only now and then (about 1 turn in 4), so few turns left makes each
    // chance count more. A missed check costs a unique skill level.
    const urgency = Math.min(3, trainings / Math.max(1, turnsLeft / 4));
    return {
      add: (0.1 + 0.15 * urgency) * ctx.typ,
      note: "Akikawa is here: her bond " + chk.bond + " → " + Math.min(100, chk.bond + gained) + " (needs " + chk.need + " by turn " + chk.turn + " for the unique skill level-up)"
    };
  }

  // Energy and failure parts of a training (re-run when an item changes cost or failure).
  function scoreRisk(o, ctx) {
    const hook = HOOKS[ctx.sc.hook] || {};
    const mood = ctx.state.mood;
    o.parts.energy = ctx.energyValue(o.energyDelta);
    const failMult = hook.failMult ? hook.failMult(ctx) : 1;
    const moodDrop = mood > 0 ? ctx.moodStep(mood - 1) : 0;
    let risk = -(o.fail / 100) * (o.raw + 0.5 * ctx.typ + moodDrop) * failMult;
    // Past your limit (Settings) each point costs 8% of a typical training on top: a little
    // over can still win a close call, far over almost never does.
    if (o.fail > ctx.state.risk) risk -= ((o.fail - ctx.state.risk) / 100) * ctx.typ * 8;
    o.parts.risk = risk;
    o.value = sumParts(o.parts);
  }

  function isStrong(o, ctx) {
    return o.kind === "train" && (o.raw >= 1.3 * ctx.typ || o.rainbows >= 2 || (ctx.camp && o.raw >= ctx.typ));
  }

  function bestTraining(options) {
    return options.filter((o) => o.kind === "train").sort((a, b) => b.value - a.value)[0];
  }
  // Discrete training/type and Hello outcomes. Finishing an actual displayed
  // song must be evaluated per outcome, not by pretending an expected +8 occurs.
  function performanceOutcomes(f, state, sc) {
    if (!sc.tokenOf || state.turn < (sc.tokensFrom || 5)) return [{ probability: 1, balances: state.gl.tokens.slice(), credited: [0,0,0,0,0], hello: 0 }];
    const ex = f.extras || {}, [pri, sec] = sc.tokenOf[f.stat];
    const entered = ex.tokType != null && ex.tokType !== "";
    const types = entered ? [[+ex.tokType, 1]] : state.gl && state.gl.tokenTypes === "usual" ? [[pri, 1]]
      : [[pri, 0.6], [sec, 0.3]].concat([0,1,2,3,4].filter(i => i !== pri && i !== sec).map(i => [i, 0.1 / 3]));
    const initial = state.gl.tokens, cap = tokenCap(state, sc), out = [];
    const hello = (f.members || []).map(i => state.deck && state.deck.slots[i]).find(sl => sl && Hello.isHello(Deck.card(sl.id)) && Hello.hasMet(sl));
    const hp = hello && Hello.profile(Deck.card(hello.id), hello.lb);
    types.forEach(([type, probability]) => {
      const after = initial.slice();
      tokenGain(Object.assign({}, f, { extras: Object.assign({}, ex, { tokType: type }) }), state, sc, false).forEach(g => { after[g.type] = Math.min(cap, after[g.type] + Math.max(0, g.amount)); });
      const emit = (p, balances, extra) => out.push({ probability: probability * p, balances, credited: balances.map((n,i) => n - initial[i]), hello: extra });
      if (!hp) { emit(1, after, 0); return; }
      emit(1 - hp.procRate, after, 0);
      const lows = after.map((n,i) => n === Math.min(...after) ? i : -1).filter(i => i >= 0);
      lows.forEach(i => { const balances = after.slice(); balances[i] = Math.min(cap, balances[i] + hp.tokenAmount); emit(hp.procRate / lows.length, balances, balances[i] - after[i]); });
    });
    return out;
  }

  function applySongFocus(ctx, options) {
    const state = ctx.state, sc = ctx.sc;
    if (sc.id !== "grandlive" || !state.gl || state.gl.focus !== "songs" || state.turn < 5 || state.turn > sc.totalTurns) return;
    let best = options[0];
    if (!best || best.firstEvent || best.kind === "race" && best.forced) return;
    // In Songs first the configured risk limit is a hard eligibility condition.
    if (best.kind === "train" && best.fail > state.risk) {
      const safe = options.filter(o => o.kind !== "train" || o.fail <= state.risk);
      if (safe.length) {
        options.sort((a,b) => (a.kind === "train" && a.fail > state.risk) - (b.kind === "train" && b.fail > state.risk) || b.value-a.value);
        best = options[0];
        best.selectionPolicy = { objective: "respect failure limit", why: "Highest ordinary score among commands within your " + state.risk + "% failure limit", assumptions: "Failure rates follow your entries, or the labeled estimate when blank." };
        best.notes.unshift("Trainings above your " + state.risk + "% failure limit cannot rank #1 in Songs first.");
      }
    }
    if (best.kind !== "train" || state.turn > 71 || !concertGoal(state).left) return;
    const recovery = Math.max(-Infinity, ...options.filter(o => o.kind !== "train").map(o => o.value));
    const candidates = options.filter(o => o.kind === "train" && o.fail <= state.risk && o.value >= recovery).map(o => {
      const before = JSON.parse(JSON.stringify(state));
      if (o.song) buySong(before, sc, o.song.id);
      if (o.tech) buyTechnique(before, sc, o.tech.id, o.tech.type);
      const f = before.facilities.find(f => f.stat === o.stat), budget = periodSongBudget(before, sc);
      const held = heldSong(before, sc);
      const offers = shopSongs(before, sc, tokenPlan(before, sc)).filter(x => x.offered && (!held || x.song.id === held.id));
      const gap = balances => offers.length ? Math.min(...offers.map(x => x.song.cost.reduce((n,c,i) => n + Math.max(0,c-balances[i]),0))) : 0;
      // On a concert command every candidate receives the same collaborator
      // reward. Do not prefer a color that this guaranteed reward already funds.
      const reward = calendarPerformance(state.turn, sc);
      const closing = balances => reward ? balances.map(n => Math.min(reward.cap, n + reward.amount)) : balances;
      const openingGap = gap(closing(before.gl.tokens)), success = 1 - o.fail / 100;
      let usable = 0, hello = 0, progress = 0, completion = 0, reduction = 0;
      performanceOutcomes(f, before, sc).forEach(path => {
        const p = path.probability * success;
        usable += p * path.credited.reduce((a,n) => a+n,0); hello += p * path.hello;
        if (budget) progress += p * path.credited.reduce((n,x,i) => n + Math.min(x,budget.short[i]),0);
        const afterGap = gap(closing(path.balances));
        if (openingGap > 0 && afterGap === 0) completion += p;
        reduction += p * Math.max(0,openingGap-afterGap);
      });
      const ex = f.extras || {};
      o.performancePriority = { usable, towardSongs: progress, training: usable-hello, hello, completionProbability: completion, offeredGapReduction: reduction, offeredGap: openingGap, offers: offers.map(x => x.song.name), need: budget && budget.need, short: budget && budget.short, typesAssumed: ex.tokType == null || ex.tokType === "", calendarReward: reward ? reward.amount : 0 };
      return o;
    });
    if (!candidates.length) return;
    const actual = candidates.some(o => o.performancePriority.offeredGap > 0);
    const canFinish = candidates.some(o => o.performancePriority.completionProbability > 0);
    candidates.sort((a,b) => {
      const A=a.performancePriority, B=b.performancePriority;
      // A small partial gap reduction must not discard a large rainbow token
      // haul when no candidate can finish a song. In that case build supply.
      return (canFinish ? B.completionProbability-A.completionProbability || B.offeredGapReduction-A.offeredGapReduction : 0) || B.usable-A.usable || (actual ? B.offeredGapReduction-A.offeredGapReduction : 0) || b.value-a.value;
    });
    const chosen = candidates[0], p = chosen.performancePriority;
    const why = canFinish ? Math.round(p.completionProbability*100) + "% chance to fund an offered song by the next command; expected remaining-cost reduction " + p.offeredGapReduction.toFixed(1) + " points"
      : "highest expected usable Performance among safe trainings worth at least as much as recovery (" + p.usable.toFixed(1) + " points)" + (actual ? "; no eligible training can finish an offered song in one command" : "");
    chosen.selectionPolicy = { objective: canFinish ? "fund an offered song" : "usable Performance", why, assumptions: state.gl.tokenTypes === "usual" ? "Untouched types use the preselected usual colors; amounts remain estimates." : "Unset types use the 60/30/10 distribution." };
    chosen.notes.unshift("Songs first: #1 for " + why + (p.hello ? "; Hello contributes " + p.hello.toFixed(1) + " expected points through a separate random outcome" : "") + ". " + chosen.selectionPolicy.assumptions);
    const remaining = options.filter(o => !candidates.includes(o)).sort((a,b) => (a.kind === "train" && a.fail > state.risk) - (b.kind === "train" && b.fail > state.risk) || b.value-a.value);
    options.splice(0,options.length,...candidates,...remaining);
  }

  function evaluate(state, sc, deferOpening = false) {
    const ctx = makeCtx(state, sc);
    const hook = HOOKS[sc.hook] || {};
    const { typ, E } = ctx;
    const options = state.facilities.map((f) => trainingOption(f, ctx));
    // The second focus card's push never outweighs extra song tokens another training gives.
    const maxTok = Math.max(0, ...options.map((o) => o.parts.tokens || 0));
    options.forEach((o) => {
      if (!o.secondFocus) return;
      const cut = Math.min(o.secondFocus, Math.max(0, maxTok - (o.parts.tokens || 0)));
      if (cut <= 0) return;
      o.parts.bond -= cut;
      o.raw -= cut;
      o.secondFocusCut = cut;
      o.notes.push("the second focus push " + (cut >= o.secondFocus ? "is off" : "is smaller") + " here: another training gives more song tokens");
      scoreRisk(o, ctx);
    });
    const facOpts = options.slice();

    const forced = forcedTurns(state, sc).has(state.turn) || state.goalRace;
    if (forced) {
      const finale = sc.finale && sc.finale.forced && sc.finale.turns.indexOf(state.turn) !== -1;
      options.push({
        kind: "race", forced: true,
        label: finale ? "Race: " + sc.finale.name : "Run your goal race",
        energyDelta: sc.goalRaceEnergy ? -sc.goalRaceEnergy : 0, moodDelta: 0, prefix: [], consume: {},
        notes: [finale ? "Finale race turn." : "This turn holds a goal race. Missing it ends the career.", sc.goalRaceEnergy ? "in this scenario goal races cost energy too (about " + sc.goalRaceEnergy + ")" : "goal races don't cost energy"],
        parts: { goal: 1e5 }, value: 1e5
      });
      const gr = goalRaceAt(state, sc, state.turn);
      if (gr) { const o = options[options.length - 1]; o.fans = expectedFans(state, gr.race, gr.place); o.label = "Run your goal race: " + gr.race.n; }
    } else {
      const camp = ctx.camp;
      const restParts = {
        energy: REST_OUTCOMES.reduce((a, [g, p]) => a + p * ctx.energyValue(camp ? 40 : g), 0),
        mood: camp ? curedMoodStep(ctx, state.mood) : 0,
        condition: camp ? cureValue(state, ctx) : 0
      };
      options.push({
        kind: "rest", label: camp ? "Rest (camp outing)" : "Rest",
        energyDelta: camp ? 40 : 50, moodDelta: camp ? 1 : 0, prefix: [], consume: {},
        notes: [camp ? "camp rest restores 40 energy and lifts mood" : "restores about 50 energy (30 to 70)"]
          .concat(camp && E >= 60 && state.mood < 4 ? ["you need about one rest per camp anyway; taking it now gives better mood for the remaining camp turns"] : [])
          .concat(!camp && isCamp(state.turn + 1, sc) ? ["camp starts next turn, so energy now pays off over four max-level turns"] : []),
        parts: restParts, value: sumParts(restParts)
      });
      if (!camp) {
        const recParts = { energy: ctx.energyValue(10), mood: ctx.moodStep(state.mood) };
        options.push({
          kind: "recreation", label: "Recreation (outing)",
          energyDelta: 10, moodDelta: state.mood < 4 ? 1 : 0, prefix: [], consume: {},
          notes: state.mood < 4 ? ["mood is " + MOODS[state.mood] + "; +1 mood is about +10% on every training"] : ["mood is already Great"],
          parts: recParts, value: sumParts(recParts)
        });
      }
      outingOptions(ctx).forEach((o) => options.push(o));
      if (Conditions.curable(state)) {
        const p = { condition: cureValue(state, ctx), energy: ctx.energyValue(20) };
        options.push({
          kind: "infirmary", label: "Infirmary", energyDelta: 20, moodDelta: 0, prefix: [], consume: { cureConditions: true },
          notes: [state.practicePoor && !state.badCondition ? "cures Practice Poor (+2% failure on every stat training until then)" : "clears the bad condition before it costs more mood, energy or stats" + (state.practicePoor ? ", and cures Practice Poor" : "")],
          parts: p, value: sumParts(p)
        });
      }
      const plan = fanPlan(state, sc);
      // A fan goal you can't make without racing now adds the best race this turn, even if
      // you didn't pick one.
      let raceKey = state.race;
      let named = state.raceName ? racesAt(state, state.turn).find((x) => x.n === state.raceName) : null;
      if (!raceKey && plan && (plan.status === "urgent" || plan.status === "short" || plan.status === "efficient") && plan.now) { named = plan.now.race; raceKey = GRADE_KEY[named.g]; }
      // Trackblazer runs on races, so the best race this turn that fits the trainee (most Grade
      // Points, then fans) is always weighed against training.
      if (!raceKey && sc.gradePoints && state.deck && state.deck.trainee) {
        const pick = racesAt(state, state.turn).filter((x) => !state.fans || (x.need || 0) <= state.fans).sort((a, b) => gpOf(b) - gpOf(a) || b.f[0] - a.f[0])[0];
        if (pick) { named = pick; raceKey = GRADE_KEY[pick.g]; }
      }
      if (raceKey && RACES[raceKey]) {
        const r = RACES[raceKey];
        const rb = 1 + (ctx.deck ? ctx.deck.raceBonus : state.raceBonus || 0) / 100;
        const consec = (state.extras && state.extras.consec) || 0;
        const p = {
          stats: r.stats * rb * ctx.avgW,
          sp: r.sp * rb * SP_VALUE,
          fans: 0.05 * typ,
          energy: ctx.energyValue(-RACE_ENERGY),
          // Back-to-back racing: a 3rd race is fine, a 4th+ risks bad conditions and mood drops.
          risk: consec >= 3 ? -(1.2 + (consec - 3) * 1.3) * typ : consec === 2 ? -0.2 * typ : 0
        };
        const o = {
          kind: "race", label: named ? "Race: " + named.n + " (" + GRADE_LABEL[named.g] + ")" : "Race (" + r.label + ")", energyDelta: -RACE_ENERGY, moodDelta: 0, prefix: [], consume: {},
          notes: ["about " + Math.round(r.sp * rb) + " skill points if you win", "an optional race costs about " + RACE_ENERGY + " energy"], parts: p,
          fans: named ? expectedFans(state, named) : Math.round(TYPICAL_FANS[raceKey] * 0.8 * (1 + fanBonus(state) / 100))
        };
        if (sc.gradePoints) { o.gp = named ? gpOf(named) : GP_BY_KEY[raceKey] || 20; o.raceName = named ? named.n : ""; }
        if (plan && plan.status !== "met" && plan.status !== "covered") {
          const typ = ctx.typ;
          p.fans += plan.status === "urgent" || plan.status === "short" ? 2.5 * typ : plan.status === "efficient" ? (0.35 + 0.9 * plan.saves) * typ : 0;
          o.notes.push(plan.status === "wait" ? "the fan goal can wait for bigger races later" : "counts toward your fan goal (" + Math.round(plan.left).toLocaleString("en-US") + " still needed)");
        }
        if (consec >= 3) o.notes.push(consec + " races in a row already; another one risks a bad condition or mood drop");
        if (hook.race) {
          const x = hook.race(ctx, raceKey, named) || {};
          p.scenario = x.add || 0;
          if (x.note) o.notes.push(x.note);
        }
        o.value = sumParts(p);
        options.push(o);
      }
      if (hook.actions) hook.actions(ctx, facOpts).forEach((a) => options.push(Object.assign({ prefix: [], notes: [], consume: {}, moodDelta: 0, energyDelta: 0 }, a, { value: sumParts(a.parts) })));
    }
    options.forEach((o) => { if (o.value === undefined) o.value = sumParts(o.parts); });
    options.sort((a, b) => b.value - a.value);
    if (hook.items) {
      hook.items(ctx, options);
      options.sort((a, b) => b.value - a.value);
    }
    if (!deferOpening) { applyOpening(ctx, options); applySongFocus(ctx, options); }
    return { options, ctx };
  }

  const PART_LABELS = {
    stats: "stat gains", sp: "skill points", bond: "bond building", hint: "skill hint", scenario: "scenario bonus", tokens: "tokens for songs", songFocus: "your Songs first preference",
    energy: "energy", mood: "mood", risk: "failure risk", condition: "curing the condition", fans: "fans", item: "item or buff", goal: "goal race", opening: "the scenario's opening plan"
  };

  function recommend(state, scenario) {
    const { options, ctx } = evaluate(state, scenario);
    const best = options[0];
    const second = options[1];
    const reasons = best.notes.slice();
    const plan = fanPlan(state, scenario);
    if (plan && plan.status !== "met" && (plan.status !== "covered" || plan.turnsLeft <= 6)) reasons.push(fanPlanText(plan, scenario));
    const gplan = gradePlan(state, scenario);
    if (gplan && gplan.status !== "met" && (gplan.status !== "ok" || best.kind === "race")) reasons.push(gradePlanText(gplan, scenario));
    if (best.kind === "train") {
      const top = Object.entries(best.statGains).filter(([, g]) => g >= 1).sort((a, b) => b[1] - a[1]);
      reasons.unshift((best.gainEst ? "about " : "") + top.map(([s, g]) => STAT_LABELS[s] + " +" + Math.round(g)).join(", ") + (best.gainEst ? " (estimated)" : ""));
      if (best.fail > 0) reasons.push(best.fail + "% failure" + (best.failEst ? " (estimated from energy)" : "") + (best.fail > state.risk ? ", above your limit, but still the best option" : ""));
    }
    let versus = null;
    if (second && !best.forced) {
      const keys = new Set(Object.keys(best.parts).concat(Object.keys(second.parts)));
      let bigKey = null;
      let big = -Infinity;
      keys.forEach((k) => {
        const d = (best.parts[k] || 0) - (second.parts[k] || 0);
        if (d > big) { big = d; bigKey = k; }
      });
      versus = { label: second.label, gap: best.value - second.value, because: PART_LABELS[bigKey] || bigKey };
    }
    if (best.selectionPolicy && second) versus = { label: second.label, gap: best.value - second.value, because: best.selectionPolicy.objective, policy: best.selectionPolicy.why };
    let confidence = "clear pick";
    if (best.selectionPolicy) confidence = "under entered assumptions";
    else if (versus) {
      const rel = versus.gap / Math.max(1, ctx.typ);
      if (rel < 0.08) confidence = "close call";
      else if (rel < 0.25) confidence = "good pick";
    }
    const after = {
      energy: clamp(Math.round(ctx.E + (best.energyDelta || 0)), 0, ctx.maxE + (best.maxEnergyDelta || 0)),
      mood: Conditions.moodAfter(state, best.moodDelta, (best.kind === "rest" && isCamp(state.turn, scenario)) || (best.consume && best.consume.cureConditions))
    };
    let recoveryComparison = null;
    if (scenario.id === "grandlive" && ctx.camp && ctx.E < 55 && !best.forced) {
      const wit = options.find(o => o.kind === "train" && o.stat === "wit" && !o.tech && !o.song);
      const rest = options.find(o => o.kind === "rest");
      if (wit && rest) {
        let campTurnsAfter = 0;
        for (let turn = state.turn + 1; isCamp(turn, scenario); turn++) campTurnsAfter++;
        const energyAfter = o => clamp(Math.round(ctx.E + o.energyDelta), 0, ctx.maxE);
        const checkEnergyLesson = !heldSong(state, scenario) && !best.tech && !best.song && ((state.gl || {}).tokens || []).some(n => n >= 25);
        recoveryComparison = { wit: { energyAfter: energyAfter(wit), delta: energyAfter(wit)-ctx.E, fail: wit.fail, failEstimated: wit.failEst, gainsEstimated: wit.gainEst, value: wit.value }, rest: { energyAfter: energyAfter(rest), delta: energyAfter(rest)-ctx.E, value: rest.value }, campTurnsAfter, checkEnergyLesson };
        reasons.push("Camp energy: Wit leaves about " + energyAfter(wit) + ", Rest about " + energyAfter(rest) + ". " + campTurnsAfter + " camp turn(s) follow; reassess the next placements rather than repeating Wit automatically.");
        if (checkEnergyLesson) reasons.push("Check your actual lesson shop for an affordable Energy technique before spending this turn. It costs Performance, uses no turn, and can change which training is safe; mark its actual offer/type and recheck failure.");
      }
    }
    return {
      action: best,
      headline: (best.prefix.length ? best.prefix.join(" → ") + " → " : "") + best.label,
      reasons,
      confidence,
      versus,
      ranked: options,
      after,
      recoveryComparison,
      typ: ctx.typ,
      calib: ctx.calib,
      phase: phaseFor(state.turn, scenario),
      fanPlan: plan,
      gradePlan: gplan,
      events: eventsFor(state.turn, scenario, state),
      turn: turnInfo(state.turn, scenario)
    };
  }

  // Applies a chosen option and moves to the next turn. Returns the new state (does not mutate).
  // result (trainings only): "fail" or "bad" when the training failed. umareference: a failed
  // training still uses its energy, and gives nothing but its failure event. The usual one
  // ("Get Well Soon!", top choice): mood -1 and -5 to the trained stat. The bad one ("Don't
  // Overdo It!", only at 20%+ failure; top choice): mood -3, +10 energy, -10 to the trained
  // stat and -10 to 2 random stats (type those in yourself). Either can bring Practice Poor;
  // tick Bad condition if it did. No bond, tokens or scenario gains, and it doesn't count
  // toward the facility's level.
  const FAIL_RESULT = { fail: { mood: -1, stat: -5, energy: 0, label: "failed" }, bad: { mood: -3, stat: -10, energy: 10, label: "failed badly" }, slacker: { mood: 0, stat: 0, energy: 0, label: "did not show up" } };
  function advance(state, scenario, option, result, observed) {
    // Engine-level command blocking during pending concert phase
    // ALL ordinary career commands (training, rest, racing, outings) are rejected
    // before any mutation, rewards, calibration, logging, or turn advancement.
    // Shop purchases must use standalone buySong/buyTechnique, not advance().
    const gl = state.gl || {};
    if (gl.pendingConcert) {
      // Reject ALL commands during pending phase
      // Shop purchases must use buySong/buyTechnique directly
      return state;
    }
    if (option.outingRoll) {
      const index = observed && observed.outing === "great" ? 0 : 1;
      const outcome = option.outingRoll[index];
      const gains = {};
      STATS.forEach((k, i) => { if ((outcome.s || [])[i]) gains[k] = outcome.s[i]; });
      option = Object.assign({}, option, { energyDelta: outcome.e || 0, moodDelta: outcome.mo || 0, statGains: gains, outingHints: outcome.h || [] });
    }
    const fr = option.kind === "train" && FAIL_RESULT[result];
    if (fr) {
      option = Object.assign({}, option, {
        statGains: { [option.stat]: fr.stat }, moodDelta: fr.mood, energyDelta: result === "slacker" ? (option.recoveryBefore || 0) : (option.energyDelta || 0) + fr.energy,
        firstEvent: null, failed: result, label: option.label + " (" + fr.label + ")"
      });
    }
    const s = JSON.parse(JSON.stringify(state));
    const hook = HOOKS[scenario.hook] || {};
    if (hook.beforeTurn && hook.beforeTurn(s, scenario, option) === false) return state;
    if ((option.kind === "rest" && isCamp(state.turn, scenario)) || (option.consume && option.consume.cureConditions && (!observed || observed.cured !== false))) Conditions.cure(s);
    // An outing that raises max energy (Light Hello's first: +4) counts before the energy it gives.
    if (option.maxEnergyDelta) s.maxEnergy = (s.maxEnergy || 100) + option.maxEnergyDelta;
    const maxE = s.maxEnergy || 100;
    s.extras = s.extras || {};
    s.energy = clamp(Math.round(s.energy + (option.energyDelta || 0)), 0, maxE);
    s.mood = Conditions.moodAfter(s, option.moodDelta);
    if (option.kind === "train" && scenario.akikawa && !fr) {
      const fac = s.facilities.find((x) => x.stat === option.stat);
      if (fac && fac.extras && fac.extras.aki) s.extras.akiBond = Math.min(100, (+s.extras.akiBond || 0) + Math.floor(AKI_PER_TRAINING * (Conditions.has(s, "hotTopic") ? 1.4 : 1)));
    }
    if ((option.kind === "train" || option.outing != null) && s.trackStats && option.statGains) {
      s.stats = s.stats || {};
      Object.entries(option.statGains).forEach(([k, g]) => { if (s.stats[k] > 0) s.stats[k] = Math.round(s.stats[k] + g); });
    }
    s.extras.consec = option.kind === "race" ? (s.extras.consec || 0) + 1 : 0;
    if (option.kind === "race" && option.fans) s.fans = Math.round((s.fans || 0) + option.fans);
    // Fixed scenario events at the end of this turn (e.g. URA's summer snack: +30 energy).
    const evE = (scenario.energyEvents && scenario.energyEvents[state.turn]) || 0;
    const evM = (scenario.moodEvents && scenario.moodEvents[state.turn]) || 0;
    if (evE) s.energy = clamp(s.energy + evE, 0, maxE);
    if (evM) s.mood = Conditions.moodAfter(s, evM);
    Object.entries(option.consume || {}).forEach(([k, v]) => {
      if (k === "cureConditions") { if (!observed || observed.cured !== false) Conditions.cure(s); }
      else if (k === "badCondition" || k === "practicePoor") s[k] = v;
      else s.extras[k] = typeof v === "function" ? v(s.extras[k]) : v;
    });
    if (option.kind === "rest" && isCamp(state.turn, scenario)) Conditions.cure(s);
    if (hook.afterTurn && !fr) hook.afterTurn(s, option, scenario);
    if (hook.endOfTurn) hook.endOfTurn(s, scenario, option);
    // Deck bonds: +7 for every card that trained with you this turn.
    if (option.kind === "train" && s.deck && s.deck.slots && !fr) {
      const fac = s.facilities.find((f) => f.stat === option.stat);
      (fac && fac.members || []).forEach((i) => {
        const sl = s.deck.slots[i];
        if (!sl || !sl.id) return;
        const c = Deck && Deck.card(sl.id);
        const start = sl.bond != null ? sl.bond : (c ? Deck.initialBond(c, Deck.levelFor(c, sl.lb)) : 0);
        const hinted = (fac.hints || []).indexOf(i) !== -1;
        const evBond = option.firstEvent && option.firstEvent.idx === i ? option.firstEvent.bond : 0;
        sl.bond = Math.min(100, start + (Deck ? Deck.BOND_PER_TRAINING : 7) + (Conditions.has(s, "charming") ? 2 : 0) + (hinted ? (Deck ? Deck.BOND_PER_HINT : 5) : 0) + evBond);
        sl.met = true;
      });
    }
    if (option.firstEvent && option.firstEvent.stats && s.trackStats && s.stats) {
      Object.entries(option.firstEvent.stats).forEach(([k, g]) => { if (s.stats[k] > 0) s.stats[k] = Math.round(s.stats[k] + g); });
    }
    if (option.outing != null && s.deck && s.deck.slots[option.outing]) {
      const sl = s.deck.slots[option.outing];
      const c = Deck && Deck.card(sl.id);
      const start = sl.bond != null ? sl.bond : (c ? Deck.initialBond(c, Deck.levelFor(c, sl.lb)) : 0);
      sl.bond = Math.min(100, start + (Deck ? Deck.BOND_PER_DATE : 5));
      sl.dates = Object.assign({ unlocked: true, done: 0 }, sl.dates);
      sl.dates.done += 1;
      if (option.outingHints && option.outingHints.length) {
        s.gl = s.gl || {};
        s.gl.hints = s.gl.hints || {};
        option.outingHints.forEach(([id, lv]) => { s.gl.hints[id] = Math.min(5, (s.gl.hints[id] || 0) + lv); });
      }
    }
    // Learn deck strength (and the formula's scenario multiplier) from real or formula gains.
    const ctx = deckInfo(state) && scenario.train ? makeCtx(state, scenario) : null;
    if (ctx) {
      const samples = calibSamples(state, scenario);
      if (samples.length) s.fcal = (s.fcal || []).concat(samples).slice(-12);
    }
    const sample = strengthSample(state, scenario, ctx);
    if (sample != null) s.calib = (s.calib || []).concat([sample]).slice(-12);
    s.log = (s.log || []).concat([{
      turn: s.turn,
      label: (option.prefix && option.prefix.length ? option.prefix.join(" → ") + " → " : "") + option.label,
      kind: option.kind,
      stat: option.stat || null,
      failed: option.failed || undefined,
      energy: state.energy,
      mood: state.mood,
      snapshot: JSON.stringify(Object.assign({}, state, { log: undefined }))
    }]).slice(-90);
    s.turn = Math.min(scenario.totalTurns, s.turn + 1);
    s.facilities = s.facilities.map((f) => ({ stat: f.stat, gain: null, cards: 0, rainbows: 0, unbonded: 0, hint: false, fail: null, extras: {}, members: [], hints: [], extra: 0 }));
    s.goalRace = isGoalTurn(s, scenario, s.turn);
    s.race = "";
    s.raceName = "";
    return s;
  }

  function undo(state) {
    const log = state.log || [];
    if (!log.length) return state;
    const last = log[log.length - 1];
    const prev = JSON.parse(last.snapshot);
    prev.log = log.slice(0, -1);
    return prev;
  }

  // Scenario rules. Each hook can define:
  //  facility(f, ctx, o) -> {add, energy, fail0, note}   extra value on one training
  //  race(ctx, grade)    -> {add, note}                  extra value on an optional race
  //  actions(ctx, trainingOptions) -> [option]           scenario-only actions
  //  items(ctx, options)  mutates or adds options for items and buffs used before acting
  //  failMult(ctx)        weight on failure risk
  //  afterTurn(state, option, scenario)  bookkeeping when moving to the next turn
  function useOn(o, ctx, prefix, itemValue, note, consume) {
    o.prefix.push(prefix);
    o.parts.item = (o.parts.item || 0) + itemValue;
    if (note) o.notes.push(note);
    Object.assign(o.consume, consume || {});
    o.value = sumParts(o.parts);
  }

  function variant(o) {
    return Object.assign({}, o, { parts: Object.assign({}, o.parts), prefix: o.prefix.slice(), notes: o.notes.slice(), consume: Object.assign({}, o.consume), statGains: Object.assign({}, o.statGains || {}) });
  }

  function statsValue(ctx, obj) {
    return Object.entries(obj).reduce((a, [k, v]) => a + (k === "sp" ? v * SP_VALUE : ctx.gainValue(k, v)), 0);
  }

  // Re-scores a training as if energy were `e2` (items that restore energy before training).
  // The energy they give carries into the turn's result, so Done keeps it.
  function withEnergy(o, ctx, e2) {
    const v = variant(o);
    v.energyDelta = (o.energyDelta || 0) + (e2 - ctx.E);
    const drop = estimateFail(o.stat, ctx.E) - estimateFail(o.stat, e2);
    v.fail = Math.max(0, Math.round(o.fail - drop));
    v.parts.energy = ctx.V[clamp(Math.round(e2 + o.energyDelta + ctx.evNow), 0, ctx.maxE)] - ctx.V[clamp(ctx.E + ctx.evNow, 0, ctx.maxE)];
    const moodDrop = ctx.state.mood > 0 ? ctx.moodStep(ctx.state.mood - 1) : 0;
    v.parts.risk = -(v.fail / 100) * (o.raw + 0.5 * ctx.typ + moodDrop) - (v.fail > ctx.state.risk ? ((v.fail - ctx.state.risk) / 100) * ctx.typ * 2 : 0);
    v.value = sumParts(v.parts);
    return v;
  }

  // Unity Cup tables (GameTora, after the July 2026 update).
  const UNITY_SPECIAL = {
    speed: { 2: { speed: 2, sp: 1 }, 3: { speed: 4, power: 1, sp: 3 }, 4: { speed: 6, power: 3, sp: 5 }, 5: { speed: 10, power: 5, sp: 7 } },
    stamina: { 2: { stamina: 2, sp: 1 }, 3: { stamina: 4, guts: 1, sp: 3 }, 4: { stamina: 6, guts: 3, sp: 5 }, 5: { stamina: 10, guts: 5, sp: 7 } },
    power: { 2: { power: 2, sp: 1 }, 3: { power: 4, stamina: 1, sp: 3 }, 4: { power: 6, stamina: 3, sp: 5 }, 5: { power: 10, stamina: 5, sp: 7 } },
    guts: { 2: { guts: 2, sp: 1 }, 3: { guts: 4, speed: 1, power: 1, sp: 3 }, 4: { guts: 6, speed: 2, power: 2, sp: 5 }, 5: { guts: 10, speed: 3, power: 3, sp: 7 } },
    wit: { 2: { wit: 1 }, 3: { wit: 2, sp: 2 }, 4: { wit: 4, speed: 1, sp: 4 }, 5: { wit: 6, speed: 2, sp: 6 } }
  };
  const UNITY_BURST = {
    speed: { speed: 15, power: 7, sp: 5 }, stamina: { stamina: 15, guts: 7, sp: 5 }, power: { stamina: 7, power: 15, sp: 5 },
    guts: { speed: 3, power: 3, guts: 15, sp: 5 }, wit: { speed: 2, wit: 15, sp: 5 }
  };
  const UNITY_EXTREME = {
    speed: { speed: 20, power: 10, sp: 15 }, stamina: { stamina: 20, guts: 10, sp: 15 }, power: { stamina: 10, power: 20, sp: 15 },
    guts: { speed: 5, power: 5, guts: 20, sp: 15 }, wit: { speed: 5, wit: 15, sp: 15 }
  };
  const COIN = 0.015; // value of one Trackblazer shop coin, as a share of a typical turn
  const VITA_COST = { 20: 35, 40: 55, 65: 75 };

  const HOOKS = {
    ura: {
      facility(f, ctx) {
        if (!(f.extras && f.extras.meek)) return null;
        // A win pays 10-25 of the stat, 30 SP, +4 to its cap, +4 max energy and an Essence of Racing hint.
        const add = ctx.gainValue(f.stat, 17) + 30 * SP_VALUE + 0.12 * ctx.typ;
        return { add, note: "Happy Meek duel: about +17 " + STAT_LABELS[f.stat] + ", 30 SP, +4 cap and max energy and a hint, if the training succeeds" };
      }
    },

    unity: {
      facility(f, ctx) {
        const x = f.extras || {};
        const t = ctx.state.turn;
        let add = 0;
        let energy = 0;
        const notes = [];
        const fl = Math.min(5, x.flames || 0);
        if (fl >= 2) {
          add += statsValue(ctx, UNITY_SPECIAL[f.stat][fl]);
          notes.push("Special Training with " + fl + " flames");
        }
        // Flame teammates grow, which raises team rank (facility levels) and Unity Cup results.
        if (fl) add += fl * (t <= 60 ? 0.04 : 0.015) * ctx.typ;
        const zenith = ((ctx.state.extras && ctx.state.extras.bursts) || 0) < 13 ? 0.08 * ctx.typ : 0;
        const b = x.burst || 0;
        if (b) {
          add += b * (statsValue(ctx, UNITY_BURST[f.stat]) + 0.12 * ctx.typ + zenith);
          if (f.stat === "wit") energy += 5 * b;
          notes.push(b + " Spirit Burst" + (b > 1 ? "s" : "") + " (+15 " + STAT_LABELS[f.stat] + " each and a Lv2+ hint)");
        }
        if (x.extreme) {
          add += statsValue(ctx, UNITY_EXTREME[f.stat]) + 0.15 * ctx.typ + zenith;
          notes.push("Extreme Spirit Burst: big stats, a hint, and failure becomes 0%");
        }
        return { add, energy, fail0: !!x.extreme, note: notes.join(", ") };
      },
      afterTurn(s, option) {
        if (option.kind !== "train") return;
        const fac = s.facilities.find((f) => f.stat === option.stat);
        const x = (fac && fac.extras) || {};
        const n = (x.burst || 0) + (x.extreme ? 1 : 0);
        if (n) s.extras.bursts = (s.extras.bursts || 0) + n;
      }
    },

    trackblazer: {
      race(ctx, grade, named) {
        const gp = named ? gpOf(named) : GP_BY_KEY[grade] || 20;
        const plan = gradePlan(ctx.state, ctx.sc);
        let add = 70 * COIN * ctx.typ; // expected coins over likely placements
        if (plan && plan.need > 0) {
          const share = Math.min(gp, plan.need) / 100;
          // A goal later races can't cover outweighs any training; a tight one adds a push, and
          // with plenty of race turns left the points could come later anyway.
          add += plan.status === "urgent" || plan.status === "short" ? 2.5 * ctx.typ : plan.status === "tight" ? (0.3 + 0.6 * share) * ctx.typ : 0.2 * share * ctx.typ;
        } else add += 0.1 * ctx.typ;
        // Guides keep race chains to 2, unless the 3rd ends the year.
        const chain = ((ctx.state.extras || {}).consec || 0) === 2 && ctx.sc.gradePoints.due.indexOf(ctx.state.turn) === -1;
        if (chain) add -= 0.4 * ctx.typ;
        return { add, note: (chain ? "this would be a 3rd race in a row; guides keep chains to 2 unless the 3rd ends the year. " : "") + "about " + gp + " Grade Points and 100 coins if you win" + (plan && plan.need > 0 ? " (" + plan.need + " still needed by turn " + plan.due + ")" : "") };
      },
      // Keeps the Grade Point count: a race takes its points off what's still needed (counting a
      // win), and each Late December deadline starts the next goal (surplus doesn't carry over).
      afterTurn(s, option, sc) {
        const plan = gradePlan(s, sc);
        if (!plan) return;
        if (option.kind === "race" && option.gp && !option.forced) {
          s.extras.gpNeed = Math.max(0, plan.need - option.gp);
          s.extras.gpDue = plan.due;
        }
        if (s.turn === plan.due) { delete s.extras.gpNeed; delete s.extras.gpDue; }
      },
      items(ctx, options) {
        const x = ctx.state.extras || {};
        const trains = options.filter((o) => o.kind === "train");
        if (x.charm) {
          const risky = trains.filter((o) => o.fail >= 8 && o.raw >= 0.9 * ctx.typ).sort((a, b) => b.raw - a.raw)[0];
          if (risky) {
            const v = variant(risky);
            v.fail = 0;
            v.failEst = false;
            v.parts.risk = 0;
            useOn(v, ctx, "Use Good-Luck Charm", -40 * COIN * ctx.typ, "Charm sets failure to 0%", { charm: false });
            options.push(v);
          }
        }
        const vita = +x.vita || 0;
        if (vita && ctx.E < ctx.maxE - 10) {
          const top = trains.slice().sort((a, b) => b.raw - a.raw)[0];
          if (top) {
            const v = withEnergy(top, ctx, Math.min(ctx.maxE, ctx.E + vita));
            useOn(v, ctx, "Drink Vita " + vita + " (no turn used)", -(VITA_COST[vita] || 50) * COIN * ctx.typ, "energy " + ctx.E + " → " + Math.min(ctx.maxE, ctx.E + vita) + " before training, instead of spending the turn resting", { vita: "0" });
            options.push(v);
          }
        }
        options.sort((a, b) => b.value - a.value);
        const best = bestTraining(options);
        const cup = +x.cupcake || 0;
        if (cup && ctx.state.mood < 4 && best && (isStrong(best, ctx) || ctx.state.mood <= 2)) {
          const steps = Math.min(cup, 4 - ctx.state.mood);
          let mv = 0;
          for (let i = 0; i < steps; i++) mv += ctx.moodStep(ctx.state.mood + i);
          useOn(best, ctx, "Eat the " + (cup === 2 ? "Berry Sweet" : "Plain") + " Cupcake (no turn used)", mv + best.parts.stats * 0.1 * steps - (cup === 2 ? 55 : 30) * COIN * ctx.typ, "mood +" + steps + " without spending a turn", { cupcake: "0" });
          best.moodDelta = steps;
        }
        const top = options[0];
        if (x.whistle && top && !top.forced && !ctx.camp && (!best || best.raw < 0.75 * ctx.typ)) {
          top.prefix.unshift("Try the Reset Whistle first (no turn used)");
          top.notes.push("every training is weak; the whistle reshuffles the cards for 20 coins, then re-enter the trainings");
        }
        const race = options.find((o) => o.kind === "race" && !o.forced);
        const hammer = +x.hammer || 0;
        if (hammer && race) useOn(race, ctx, "Use the +" + hammer + "% Cleat Hammer", (hammer / 100) * (race.parts.stats + race.parts.sp), "save hammers for G1s", { hammer: "0" });
        options.sort((a, b) => b.value - a.value);
        const b2 = bestTraining(options);
        if (!b2 || !isStrong(b2, ctx)) return;
        const mega = +x.megaphone || 0;
        if (mega) useOn(b2, ctx, "Use the +" + mega + "% Megaphone", b2.parts.stats * mega / 100 * 0.8, "Megaphone lasts " + ({ 20: 4, 40: 3, 60: 2 }[mega] || 2) + " turns from now", { megaphone: "0" });
        if (x.weights && b2.stat !== "wit") {
          const main = b2.statGains[b2.stat] || 0;
          useOn(b2, ctx, "Use Ankle Weights", ctx.gainValue(b2.stat, main * 0.5) - 50 * COIN * ctx.typ, "Ankle Weights: +50% " + STAT_LABELS[b2.stat] + ", +20% energy use", { weights: false });
          b2.energyDelta *= 1.2;
          b2.parts.energy = ctx.energyValue(b2.energyDelta);
          b2.value = sumParts(b2.parts);
        }
      }
    },

    grandlive: {
      // Lessons named before the action are paid from the balance before that
      // action. A failed training never refunds a lesson already bought.
      beforeTurn(s, sc, option) {
        if (!option.song && !option.tech) return true;
        const before = s.gl && s.gl.lastBuy;
        if (option.song) buySong(s, sc, option.song.id);
        if (option.tech) {
          const energy = s.energy;
          buyTechnique(s, sc, option.tech.id, option.tech.type);
          // withEnergy already includes this recovery in the action's delta.
          s.energy = energy;
        }
        if (!s.gl || s.gl.lastBuy === before) return false;
        delete s.gl.lastBuy;
        return true;
      },
      // Turns 5-11 (to the debut): favour the cards closest to friendship, so one or two rainbow
      // as soon as possible instead of spreading bond around. (Light Hello's first training is
      // the opening's chase rule.)
      // Every turn: the performance tokens a training gives count toward the next song you need.
      facility(f, ctx) {
        const t = ctx.state.turn;
        const tok = songTokenValue(f, ctx);
        const tokenAdd = tok ? tok.add : 0;
        if (t < 5 || t > 11 || !ctx.deck || !Array.isArray(f.members)) return tok ? { tokenAdd, note: tok.note } : null;
        let add = 0;
        const notes = tok ? [tok.note] : [];
        f.members.forEach((i) => {
          const sl = ctx.deck.slots[i];
          if (!sl) return;
          if (sl.card.ty !== "friend" && sl.bond >= 50 && sl.bond < 80) { add += 0.12 * ctx.typ; notes.push(sl.card.n + " is close to friendship (" + Math.round(sl.bond) + ")"); }
        });
        return add || tokenAdd ? { add, tokenAdd, note: notes.join("; ") } : null;
      },
      // Done on a training adds its performance tokens (what you typed, else the estimate).
      afterTurn(s, option, sc) {
        if (option.kind !== "train") return;
        const f = s.facilities.find((x) => x.stat === option.stat);
        if (!sc || !f) return;
        s.gl = s.gl || { songs: {}, tokens: [0, 0, 0, 0, 0] };
        const cap = tokenCap(s, sc);
        tokenGain(f, s, sc).forEach((g) => { s.gl.tokens[g.type] = Math.min(cap, (s.gl.tokens[g.type] || 0) + Math.max(0, g.amount)); });
      },
      // Fixed rewards: Make Debut!'s +10 each going into turn 5, collaborators'
      // +10 each after Promo Lives, and concert stats (+10 Great Success, +3
      // otherwise; GIRLS' LEGEND U's separate +10).
      // A song or technique in front of the call is bought with Done, even if the training
      // fails (lessons don't use the turn); an Energy technique's energy is already in the turn.
      endOfTurn(s, sc, option) {
        s.gl = s.gl || { songs: {}, tokens: [0, 0, 0, 0, 0], lessons: {} };
        const li = sc.lives.indexOf(s.turn);
        // Concert day: enter a pending phase instead of auto-resolving. The
        // concert's tokens, stats and shop reset are deferred to finalizeConcert,
        // leaving a pre-stage window to spend this command's income on songs or
        // lesson techniques before the live resolves.
        if (li !== -1) {
          s.gl.pendingConcert = { turn: s.turn, concertIndex: li };
          return;
        }
        // Non-concert turns: calendar performance (Make Debut!'s +10 going into
        // turn 5, collaborators' +10 after each Promo Live) and the
        // GL_SPECIAL_DEADLINE one-time +10 all-stats reward.
        const performance = calendarPerformance(s.turn, sc);
        if (performance) s.gl.tokens = s.gl.tokens.map((n) => Math.min(performance.cap, (n || 0) + performance.amount));
        if (s.turn === GL_SPECIAL_DEADLINE && s.trackStats && s.stats) {
          const r = glRewards(s, sc).find((x) => x.turn === s.turn && x.stats);
          const add = r ? r.stats : 0;
          STATS.forEach((k) => { if (s.stats[k] > 0) s.stats[k] = Math.round(s.stats[k] + add); });
        }
      },
      items(ctx, options) {
        if (ctx.state.turn < 5) return;
        const aim = tokenPlan(ctx.state, ctx.sc);
        const shop = rankTechniques(ctx.state, ctx.sc, ctx);
        const ls = lessonShop(ctx.state, ctx.sc, ctx);
        const holding = ls && ls.pick && ls.pick.kind === "hold";
        const costText = (t) => t.cost ? t.cost.map((n, i) => (n ? n + " " + ctx.sc.tokens[i] : "")).filter(Boolean).join(" + ") : t.any + " " + (t.type != null ? ctx.sc.tokens[t.type] : "tokens");
        // An Energy technique in your shop: buy it and train instead of resting. Its energy is
        // scored on the training; the rest of its worth (the live's SP) less its tokens is the
        // item's.
        const energyOffers = shop && !holding ? shop.items.filter((t) => t.offered && t.kind === "energy" && t.afford) : [];
        const trainsBeforeRecovery = options.filter((o) => o.kind === "train");
        for (const energyOffer of energyOffers) if (ctx.E < ctx.maxE) {
          const candidates = trainsBeforeRecovery.map((top) => {
            const e2 = Math.min(ctx.maxE, ctx.E + energyOffer.energy);
            const v = withEnergy(top, ctx, e2);
            useOn(v, ctx, "Buy the " + energyOffer.label + " technique (" + costText(energyOffer) + ", no turn used)", (ctx.sc.lives.some((l) => l >= ctx.state.turn) ? 5 * SP_VALUE : 0) - energyOffer.costV,
              "energy " + ctx.E + " → " + e2 + " before training; it counts as a technique lesson toward your next song");
            v.tech = { id: energyOffer.id, type: energyOffer.type };
            v.recoveryBefore = e2 - ctx.E;
            return v;
          }).sort((a, b) => b.value - a.value);
          if (candidates.length) {
            options.push(candidates[0]);
            options.sort((a, b) => b.value - a.value);
          }
        }
        let best = options[0];
        if (!best) return;
        const hype = hypeStatus(ctx.state, ctx.sc);
        // Songs first: the most important song your shop shows that you can afford (or hold it
        // for after the live), else a technique: one that keeps your next song's tokens while
        // songs are still wanted, stat techniques from spare tokens after.
        const pk = ls && ls.pick;
        const songCost = (song) => song.cost.map((n, i) => (n ? n + " " + ctx.sc.tokens[i] : "")).filter(Boolean).join(" + ");
        const nearCap = aim && aim.have.some((h) => h >= aim.cap - 15);
        if (pk && pk.kind === "song" && !best.tech) {
          // Mastery affects this command too. Re-evaluate after the purchase;
          // the cleared shop prevents another concrete purchase in this pass.
          const after = JSON.parse(JSON.stringify(ctx.state));
          buySong(after, ctx.sc, pk.item.song.id);
          const revised = evaluate(after, ctx.sc, true).options;
          revised.forEach((o) => { o.song = { id: pk.item.song.id }; o.prefix.unshift("Learn " + pk.item.song.name + " (" + songCost(pk.item.song) + ", no turn used)"); });
          options.splice(0, options.length, ...revised);
          best = options[0];
          best.notes.push((ls.phase === "hold" ? "buy before this concert to activate the valuable bonus sooner" : ls.phase === "stats" ? "the remaining song benefits are worth its Performance cost" : "songs first: the most important song in your shop you can afford") + (pk.item.why.length ? " (" + pk.item.why.join(", ") + ")" : ""));
          best.song = { id: pk.item.song.id };
        } else if (pk && pk.kind === "hold") {
          best.notes.push("hold " + pk.item.song.name + ": buy from turn " + (ls.songPlan.live + 1) + ", after the live. Do not buy another lesson: it refreshes this selection. Reserve " + songCost(pk.item.song));
        }
        const tPick = pk && (pk.kind === "tech" ? pk.item : pk.tech);
        if (tPick && !best.tech && !best.song) {
          best.prefix.unshift("Buy the " + tPick.label + " technique (" + costText(tPick) + ", no turn used)");
          best.notes.push(ls.phase === "songs" || ls.phase === "hold" ? "techniques unlock the next song; " + (tPick.keeps ? "this choice preserves the projected song/carry reserve" : "all affordable choices use planned song colors; this choice reduces that reserve by " + tPick.conflict + " points") : "spare tokens for stats" + (tPick.why.length ? ": " + tPick.why.join(", ") : ""));
          best.tech = { id: tPick.id, type: tPick.type };
        } else if (ls && !pk && ls.songsOffered) {
          best.notes.push("you can't afford the songs your shop shows yet: keep training for tokens");
        } else if (ls && !best.tech && !best.song && !ls.offered && !ls.songsOffered && ls.ifOffered.length && (ls.phase === "songs" || nearCap || ls.ifOffered.length)) {
          if (!ctx.state.gl || ctx.state.gl.focus !== "songs") best.prefix.unshift(ls.phase === "songs" ? "Buy a technique lesson (no turn used)" : "Spend spare tokens on a stat technique (no turn used)");
          best.notes.push(ctx.state.gl && ctx.state.gl.focus === "songs" ? "Open lessons during the run: techniques unlock songs. Mark the actual offers for purchase advice. Learn useful mastery songs early; friendship bonuses wait for the concert. The budget reserves the remaining song sequence and one projected carry." : (ls.phase === "songs" ? "songs only show up after technique lessons. " : "") + "Tick what your shop shows under Grand Concert and the coach picks; best if offered: " + ls.ifOffered.map((t) => t.label + " (" + costText(t) + ")").join(", "));
        }
        if (aim && aim.half && aim.half.gap > 0 && ctx.state.turn < aim.half.live) {
          best.notes.push("tokens are short for this half's songs: trainings with more cards, link cards and friendship count for more");
        }
        // A pile near the cap: spend it before training wastes it.
        if (aim) {
          const full = aim.have.map((h, i) => [h, i]).filter(([h]) => h >= aim.cap - 15).map(([h, i]) => ctx.sc.tokens[i] + " " + h + "/" + aim.cap);
          if (full.length) best.notes.push(full.join(", ") + ": near the cap, spend it on technique lessons before it's wasted");
        }
        if (!energyOffers.length && ctx.E < 50 && aim && Math.max.apply(null, aim.have) >= 25 && (best.kind === "rest" || best.kind === "recreation" || best.stat === "wit")) {
          best.notes.push("if your shop offers an Energy technique, tick it in the Lesson shop: it's a technique lesson too and can beat resting");
        }
        const live = glRewards(ctx.state, ctx.sc).find((x) => x.turn === ctx.state.turn && x.sofar && x.stats);
        if (live) best.notes.push(live.label + " after this turn. " + live.sofar);
        if (hype && hype.next != null && hype.need > 0 && hype.turnsToLive <= 4) {
          best.notes.push(hype.need + " more song(s) needed before the live on turn " + hype.next + " for a guaranteed Great Success");
        }
      }
    },

    grandmasters: {
      // A training's fragments: each one adds to the next Wisdom; one landing on a deciding slot
      // (the table's 1st or 5th) in the goddess color you need next is worth more, in another
      // color less. Nothing drops while the table is full or on a Wisdom turn.
      facility(f, ctx) {
        const n = (f.extras && f.extras.frag) || 0;
        if (!n) return null;
        const gm = GMs && ctx.state.gm, table = (gm && gm.table) || [], color = f.extras.fragColor;
        const k = GMs ? GMs.fits(table, n) : n;
        if (!k) return { add: 0, note: "the Knowledge Table is full: obtain the Wisdom first, nothing drops until then" };
        let add = k * 0.08 * ctx.typ, note = k + " fragment" + (k > 1 ? "s" : "") + " toward the next Goddess Wisdom" + (k < n ? " (only one fits: 7 held)" : "");
        if (GMs && gm && color) {
          const want = GMs.nextColor(gm.levels, ctx.state.turn, gm.skill), st = GMs.steer(table, color, k, want && want.color);
          if (st.score) { add += st.score * 0.06 * ctx.typ; note += "; " + st.note; }
        }
        return { add, note };
      },
      // Logs the turn on the Knowledge Table: a Wisdom raises its goddess and clears the table
      // (no fragments that turn); a training's fragments, in the color you set, go on the table.
      afterTurn(s, option) {
        if (!GMs) return;
        const gm = GMs.of(s);
        if (option.wisdomColor) {
          gm.levels[option.wisdomColor] = Math.min(5, (gm.levels[option.wisdomColor] || 0) + 1);
          gm.wisdoms = (gm.wisdoms || []).concat([{ turn: s.turn, color: option.wisdomColor, table: gm.table.slice() }]);
          gm.table = []; return;
        }
        if (option.kind !== "train") return;
        const fac = s.facilities.find((x) => x.stat === option.stat), ex = (fac && fac.extras) || {};
        if (ex.frag && ex.fragColor) GMs.add(gm.table, ex.fragColor, ex.frag);
      },
      // Each Wisdom is tried on every training; the best version is offered as its own option.
      items(ctx, options) {
        // The Wisdom you set as ready, or the full table's own color when it's sure.
        const gm = ctx.state.gm, made = GMs && gm && gm.table && gm.table.length >= GMs.SLOTS ? GMs.wisdomColor(gm.table) : null;
        const w = (ctx.state.extras && ctx.state.extras.wisdom) || (made && made.sure ? made.color : "");
        if (!w) return;
        const trains = options.filter((o) => o.kind === "train");
        const mood = ctx.state.mood;
        const t = ctx.state.turn;
        // Year-end race after this turn (all stats +10/+15/+20): Red adds 35% to race stats.
        const yearEnd = { 24: 10, 48: 15, 72: 20 }[t] || 0;
        const tries = trains.map((o) => {
          let v;
          if (w === "red") {
            v = withEnergy(o, ctx, Math.min(ctx.maxE, ctx.E + 50));
            const moodUp = MOOD_MULT[4] / MOOD_MULT[mood];
            let mv = 0;
            for (let i = mood; i < 4; i++) mv += ctx.moodStep(i);
            v.parts.item = o.parts.stats * (moodUp * 1.2 - 1) + mv + 0.35 * 5 * yearEnd * ctx.avgW;
            v.notes.push("+50 energy, mood to max and the facility trains past level 5 this turn");
            if (yearEnd) v.notes.push("the year-end race after this turn pays 35% more stats with Red active (it can't be used on the race screen)");
          } else if (w === "blue") {
            v = variant(o);
            v.parts.item = o.cards * (0.12 * ctx.typ + 3 * ctx.avgW);
            v.notes.push("every card here (" + o.cards + ") gives a skill hint and a few stats");
          } else {
            v = variant(o);
            const extra = Math.max(0, o.cards - o.rainbows);
            v.parts.item = o.parts.stats * (Math.pow(1.3, extra) - 1);
            v.notes.push("all " + o.cards + " card(s) here count as friendship");
          }
          v.prefix.unshift("Obtain " + w[0].toUpperCase() + w.slice(1) + " Wisdom (no turn used)");
          v.wisdomColor = w;
          v.consume = Object.assign({}, v.consume, { wisdom: "" });
          v.value = sumParts(v.parts);
          return v;
        }).sort((a, b) => b.value - a.value);
        const best = tries[0];
        if (!best) return;
        // Use it right away (no fragments drop while you hold 8), unless camp is a turn or two
        // off: guides save it for camp, where it's worth more.
        const soon = ctx.camp ? 0 : isCamp(t + 1, ctx.sc) ? 1 : isCamp(t + 2, ctx.sc) ? 2 : 0;
        if (soon && !(w === "red" && yearEnd)) {
          // Held, it pays about as much as now, scaled to camp's bigger trainings, minus the
          // fragments that don't drop meanwhile.
          const ratio = typAt(t + soon, ctx.sc, ctx.calib) / ctx.typ;
          best.parts.item -= Math.max(0, best.parts.item) * ratio * (1 - 0.08 * soon);
          const plain = trains.slice().sort((a, b) => b.value - a.value)[0];
          const note = "camp starts in " + soon + " turn" + (soon > 1 ? "s" : "") + "; guides save the Wisdom for camp, where it's worth more";
          best.notes.push(note);
          if (plain) plain.notes.push("hold the " + w + " Wisdom: " + note);
        } else {
          best.parts.item += 0.1 * ctx.typ;
          best.notes.push("no fragments drop while you hold 8, so use it now");
        }
        best.value = sumParts(best.parts);
        options.push(best);
      }
    },

    larc: {
      facility(f, ctx, o) {
        const n = (f.extras && f.extras.star) || 0;
        if (!n) return null;
        if (ctx.camp) return { add: 0, note: "Star gauges don't fill during the France expedition" };
        const blocks = 1 + Math.min(f.rainbows || 0, f.cards || 0);
        return { add: n * blocks * (ctx.state.turn <= 60 ? 0.035 : 0.015) * ctx.typ, note: n + " member(s) +" + blocks + " Star block" + (blocks > 1 ? "s" : "") };
      },
      actions(ctx) {
        const m = (ctx.state.extras && ctx.state.extras.ss) || 0;
        if (!m || ctx.camp) return [];
        // Energy sets the win chance (game8): sure above ~20%, shaky below, worse below ~10%;
        // a loss halves the stats.
        const pct = (100 * ctx.E) / ctx.maxE;
        const win = pct >= 30 ? 1 : pct > 20 ? 0.95 : pct > 10 ? 0.8 : 0.6;
        const notes = ["uses a turn but no energy; trains every stat and pays Supporter Points", m < 5 ? "waiting for 5 members makes it stronger and can trigger an SSS Match" : "5 members: run it now (holding only leaves more gauges stuck at full)"];
        if (win < 1) notes.push("energy is low enough that the match can be lost, which halves the stats; rest first if you can");
        return [{
          kind: "scenario", label: "SS Match (" + m + " member" + (m > 1 ? "s" : "") + ")",
          parts: { scenario: (0.28 * ctx.typ * m + 0.1 * ctx.typ + (m >= 5 ? 0.3 * ctx.typ : 0)) * (win + (1 - win) * 0.5) },
          notes,
          consume: { ss: 0 }
        }];
      }
    },

    uaf: {
      facility(f, ctx) {
        const x = f.extras || {};
        let add = 0;
        const notes = [];
        if (x.genre) {
          const link = ctx.state.facilities.filter((g) => g.extras && g.extras.genre === x.genre).length;
          if (link >= 2) {
            add += (link - 1) * 0.1 * ctx.typ;
            notes.push(link + "-sport " + x.genre + " Link Training");
          }
        }
        if (x.heat) {
          add += 0.45 * ctx.typ;
          notes.push("triggers a Heat-Up for the next 2 trainings");
        }
        return { add, note: notes.join(", ") };
      },
      items(ctx, options) {
        const x = ctx.state.extras || {};
        const left = x.consult != null ? +x.consult : 3;
        const counts = {};
        ctx.state.facilities.forEach((f) => { const g = f.extras && f.extras.genre; if (g) counts[g] = (counts[g] || 0) + 1; });
        const gs = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const top = options[0];
        if (left > 0 && gs.length >= 2 && gs[0][1] < 5 && top && !top.forced) {
          top.notes.push("consult Elfie (" + left + " left, no turn used) to swap " + gs[1][0] + " into " + gs[0][0] + " for a " + (gs[0][1] + gs[1][1]) + "-sport link, then re-enter");
        }
      }
    },

    cooking: {
      items(ctx, options) {
        const tier = +((ctx.state.extras && ctx.state.extras.dish) || 0);
        if (!tier || !ctx.sc.dishes) return;
        const t = ctx.state.turn;
        const pick = (stat) => {
          const list = ctx.sc.dishes.filter((d) => d.tier === tier && d.from <= t);
          return list.find((d) => d.stats.indexOf(stat) !== -1) || null;
        };
        const tries = options.filter((o) => o.kind === "train").map((o) => {
          const dish = pick(o.stat);
          if (!dish) return null;
          const v = variant(o);
          v.parts.item = o.parts.stats * dish.pct / 100 * 0.8 + (dish.energy ? ctx.energyValue(dish.energy) : 0);
          v.prefix.unshift("Cook " + dish.name);
          v.notes.push(dish.name + ": +" + dish.pct + "% to this training, this turn only");
          if (dish.energy) v.energyDelta += dish.energy;
          v.consume = Object.assign({}, v.consume, { dish: "0" });
          v.value = sumParts(v.parts);
          return v;
        }).filter(Boolean).sort((a, b) => b.value - a.value);
        const best = tries[0];
        // Cooking Points give a lasting training bonus, so Junior cooks whenever it can.
        if (best && t <= 24 && !(best.rainbows >= 2 || best.raw >= 1.2 * ctx.typ)) best.notes.push("Junior: cook whenever you can; Cooking Points boost training for the rest of the run");
        if (best && (best.rainbows >= 2 || best.raw >= 1.2 * ctx.typ || ctx.camp || tier === 4 || t <= 24)) options.push(best);
      }
    },

    mecha: {
      facility(f, ctx) {
        return f.extras && f.extras.gear ? { add: 0.12 * ctx.typ, note: "Mecha Gear: research and Overdrive gauge" } : null;
      },
      items(ctx, options) {
        const best = bestTraining(options);
        const t = ctx.state.turn;
        // Super Overdrive in the URA Finals can't use stored charges, so spend them by Late December.
        const flush = t >= 69 && t <= 72;
        if (ctx.state.extras && ctx.state.extras.overdrive && best && (isStrong(best, ctx) || flush)) {
          useOn(best, ctx, "Fire Overdrive", best.parts.stats * 0.3, flush && !isStrong(best, ctx) ? "spend stored Overdrive before the URA Finals: Super Overdrive there can't use it" : "Overdrive on a strong training", { overdrive: false });
        }
      }
    },

    legends: {
      facility(f, ctx, o) {
        if (!(f.extras && f.extras.legend)) return null;
        const rb = Math.min(f.rainbows || 0, f.cards || 0) > 0;
        return { add: (rb ? 0.12 : 0.05) * ctx.typ, note: rb ? "legend + friendship: +3 Guidance" : "legend here: +1 Guidance" };
      },
      failMult(ctx) {
        return ctx.state.extras && ctx.state.extras.follow === "pink" ? 1.6 : 1;
      },
      items(ctx, options) {
        const x = ctx.state.extras || {};
        const best = bestTraining(options);
        if (!x.buff || !best) return;
        const campStart = isCamp(ctx.state.turn, ctx.sc) && !isCamp(ctx.state.turn - 1, ctx.sc);
        if (isStrong(best, ctx) || campStart) useOn(best, ctx, "Use the guidance buff", best.parts.stats * 0.25, x.follow === "blue" ? "Blue lasts 3 turns, best at the start of a strong stretch" : "buff on a strong training", { buff: false });
      }
    },

    island: {
      actions(ctx, trains) {
        const tickets = (ctx.state.extras && ctx.state.extras.tickets) || 0;
        const t = ctx.state.turn;
        if (!tickets || ctx.camp || t > 72) return [];
        const friendFacs = trains.filter((o) => o.rainbows > 0).length;
        // You hold only 1 ticket until Senior Early September (turn 65), when 2 more arrive.
        // Classic: use it before camp. Senior spring: keep it through camp to enter the last
        // half year with 3, unless the turn is exceptional.
        let ok;
        if (t >= 65) ok = friendFacs >= 2 || ctx.turnsLeft <= tickets + 1;
        else if (t >= 49) ok = friendFacs >= 4;
        else ok = friendFacs >= 3 || (t >= 33 && t <= 36);
        if (t <= 24 && friendFacs < 3) ok = false;
        if (!ok) return [];
        const total = trains.reduce((a, o) => a + o.parts.stats + o.parts.sp, 0);
        const notes = [friendFacs + " facilities with friendship", "no energy cost and can't fail"];
        if (t >= 33 && t <= 36 && friendFacs < 3) notes.push("use it before summer camp");
        if (t >= 49 && t < 65) notes.push("an exceptional turn; otherwise keep the ticket through camp for 3 in the last half year");
        return [{ kind: "scenario", label: "Island Training", parts: { scenario: total * 0.5 + friendFacs * 0.1 * ctx.typ }, notes, consume: { tickets: (v) => Math.max(0, (v || 0) - 1) } }];
      }
    },

    onsen: {
      actions(ctx) {
        const x = ctx.state.extras || {};
        if (!x.pr || (x.baths || 0) > 0) return [];
        return [{
          kind: "scenario", label: "PR activity", energyDelta: -20,
          parts: { scenario: 0.45 * ctx.typ + 0.3 * ctx.typ, energy: ctx.energyValue(-20) },
          notes: ["always succeeds and gives a bath ticket", "costs as much energy as a training"],
          consume: { baths: (v) => Math.min(3, (v || 0) + 1) }
        }];
      },
      items(ctx, options) {
        const x = ctx.state.extras || {};
        const baths = x.baths || 0;
        const best = options[0];
        if (!best || !baths) return;
        if (!x.bathOn || baths >= 3) {
          best.prefix.unshift("Take a bath (no turn used)");
          best.notes.push(baths >= 3 ? "tickets at the 3 cap, so use one before more are lost" : "the bath boosts the next 2 turns; re-check energy and failure after it");
          best.parts.item = (best.parts.item || 0) + (best.kind === "train" ? best.parts.stats * 0.15 : 0.05 * ctx.typ);
          best.value = sumParts(best.parts);
          Object.assign(best.consume, { baths: (v) => Math.max(0, (v || 0) - 1), bathOn: true, bathLeft: 2 });
        }
      },
      afterTurn(s, option) {
        if (!(option.consume && option.consume.bathLeft)) {
          s.extras.bathLeft = Math.max(0, (s.extras.bathLeft || 0) - 1);
          s.extras.bathOn = s.extras.bathLeft > 0;
        } else {
          s.extras.bathLeft = 1;
        }
      }
    },

    dreams: {
      facility(f, ctx) {
        const x = f.extras || {};
        let add = 0;
        const notes = [];
        if (x.members) {
          add += x.members * (ctx.state.turn <= 60 ? 0.1 : 0.05) * ctx.typ;
          notes.push(x.members + " team member(s) for Dream gauge");
        }
        if (x.fullgauge) {
          add += x.fullgauge * 0.25 * ctx.typ;
          notes.push(x.fullgauge + " rank-up(s) ready");
        }
        return { add, note: notes.join(", ") };
      },
      actions(ctx, trains) {
        const x = ctx.state.extras || {};
        const left = x.dreamsLeft != null ? +x.dreamsLeft : 2;
        if (!left || ctx.state.turn > 72) return [];
        const t = ctx.state.turn;
        const end = [12, 24, 36, 48, 60, 72].find((h) => h >= t) || 72;
        const urgent = end - t + 1 <= left;
        const best = trains.slice().sort((a, b) => b.raw - a.raw)[0];
        const good = ctx.camp || ctx.E >= 60 || urgent;
        const delta = -energyCost(best.stat, t, ctx.sc);
        // Only 2 per half year: spending one now gives up using it on a better turn later
        // (camp, high energy), unless the half year is about to end.
        let reserve = urgent ? 0 : ctx.camp ? 0.3 * ctx.typ : 0.9 * ctx.typ;
        const gain = (best.parts.stats + best.parts.sp) * 1.6;
        const moodDrop = ctx.state.mood > 0 ? ctx.moodStep(ctx.state.mood - 1) : 0;
        const notes = ["every card and member joins every facility", urgent ? left + " left and the half year ends on turn " + end + ": use it or lose it" : good ? "high-value turn" : "energy is low, so consider saving it"];
        // game8: early on, use it when all three gauges are full; from Classic camp on, not on
        // turns when members rank up (the gains hit the cap).
        const rankUps = ctx.state.facilities.reduce((a, f) => a + ((f.extras && f.extras.fullgauge) || 0), 0);
        if (t <= 36 && x.allFull) { reserve -= 0.4 * ctx.typ; notes.push("all three gauges are full: the best early DREAMS turn"); }
        if (t >= 37 && rankUps && !urgent) { reserve += 0.5 * ctx.typ * rankUps; notes.push("a member ranks up this turn; guides avoid DREAMS training then (gains hit the cap)"); }
        return [{
          kind: "scenario", label: "DREAMS training (" + STAT_LABELS[best.stat] + ")", energyDelta: delta, fail: best.fail,
          parts: { scenario: gain - reserve, energy: ctx.energyValue(delta), risk: -(best.fail / 100) * (gain + 0.5 * ctx.typ + moodDrop) },
          notes,
          consume: { dreamsLeft: (v) => Math.max(0, (v != null ? +v : 2) - 1) }
        }];
      },
      afterTurn(s) {
        // 2 per half year; Senior June's meeting refills 4 for the last half year.
        if ([12, 24, 36, 48].indexOf(s.turn) !== -1) s.extras.dreamsLeft = 2;
        if (s.turn === 60) s.extras.dreamsLeft = 4;
        s.extras.allFull = false;
      }
    },

    ramen: {
      items(ctx, options) {
        const x = ctx.state.extras || {};
        const best = bestTraining(options);
        if (!best || !x.tasting) return;
        // Tips reset after each Late December, so the last turns of a year use them up.
        const t = ctx.state.turn;
        const yearEnd = (x.tips || 0) > 0 && [24, 48, 72].some((d) => d - t >= 0 && d - t <= 2);
        if (isStrong(best, ctx) || (x.tips || 0) >= 9 || ctx.camp || yearEnd) {
          useOn(best, ctx, "Hold a tasting session", best.parts.stats * 0.25, yearEnd && !isStrong(best, ctx) ? "tips reset after Late December, so use them now" : (x.tips || 0) >= 9 ? "tips are near the 10 cap" : "tasting right before a friendship training", { tasting: false });
        }
      }
    }
  };

  const api = {
    STATS, STAT_LABELS, MOODS, MOOD_MULT, BUILDS, RACES, FACILITY, HOOKS,
    turnInfo, phaseFor, eventsFor, traineeGoals, autoGoalTurns, isGoalTurn, akikawaCheck, tokenPlan, cardEvents, rankEventChoices, eventText, dateCard, dateText, dateScale, scaleDate, gradeGoal, gradePlan, gradePlanText, runCheck, calibSamples, relearnCalib, careerMaxEnergy, statWeights, buildPriority, racesAt, expectedFans, fanPlan, fanPlanText, GRADE_KEY, GRADE_LABEL, isCamp, campTurns, recommend, evaluate, advance, undo,
    estimateFail, estimateGain, calibFactor, typAt, forcedTurns, deckInfo, facLevelFor, scenarioBoost, relearnStrength,
    capsFor, sparkUncap, trainedGain, needFactors, focusCards, focusWeight, turnsToDebut, applyOpening, NEW_YEAR,
    songBonuses, hypeStatus, songsLearned, concertGoal, calendarPerformance, recordTokenReward, recordLearnedSong, performanceOutcomes, techniquesToSong, concertSongValue, shouldCarrySong, glRewards, songAdvice, songPlan, heldSong, holdSong, periodSongBudget, tokenGain, tokenCap, facilityRainbows, techniqueList, rankTechniques, lessonShop, buyTechnique, buySong, shopSongs, undoBuy, recordHelloEvent, finalizeConcert, currentPeriod, glPeriodFor, glPeriod, offeredTechnique
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
