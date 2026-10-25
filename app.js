// UI for the turn coach. Depends on scenarios.js and engine.js (globals).
(function () {
  const { SCENARIOS, STATUS_LABELS } = window.UmaScenarios;
  const E = window.UmaEngine;
  const STORE_KEY = "uma-turn-coach-v2";
  const PIP_MAX = 5;

  const D = window.UmaDeck;
  const H = window.UmaLightHello;
  const C = window.UmaConditions;
  const R = window.UmaRunReport;
  const HAS_DATA = !!(D && D.DATA);
  const TODAY = new Date().toISOString().slice(0, 10);
  const APT = ["Turf", "Dirt", "Sprint", "Mile", "Medium", "Long", "Front", "Pace", "Late", "End"];
  const FX_SHORT = { 1: "Friendship", 8: "Training", 2: "Mood", 15: "Race", 19: "Specialty", 14: "Init. bond", 30: "SP bonus", 3: "Spd bonus", 4: "Sta bonus", 5: "Pow bonus", 6: "Gut bonus", 7: "Wit bonus", 27: "Fail prot.", 28: "Energy cut", 31: "Wit recovery", 41: "All stats", 18: "Hint rate", 17: "Hint Lv" };
  const blankFacility = (stat) => ({ stat, gain: null, cards: 0, rainbows: 0, unbonded: 0, hint: false, fail: null, extras: {}, members: [], hints: [], extra: 0 });
  const blankGl = () => ({ songs: {}, tokens: [0, 0, 0, 0, 0], lessons: {}, focus: "songs", tokenTypes: "usual" });
  const GAUGE = [["Blue", 40, "g-blue"], ["Green", 60, "g-green"], ["Orange", 80, "g-orange"], ["Max", 100, "g-max"]];
  const blankDeck = () => ({ trainee: null, slots: [null, null, null, null, null, null], globalOnly: true });
  const resetBonds = (d) => Object.assign({}, d, { slots: d.slots.map((sl) => (sl ? { id: sl.id, lb: sl.lb, bond: null, dates: { unlocked: false, done: 0 } } : null)) });

  function freshState(keep) {
    const k = keep || {};
    return {
      v: 2,
      scenario: k.scenario || "ura",
      build: k.build || "medium",
      risk: k.risk != null ? k.risk : 12,
      raceBonus: k.raceBonus || 0,
      // Each career starts at 100; outings (Light Hello's first: +4) raise it during the run.
      maxEnergy: 100,
      meFix: 1,
      fcalFix: 1,
      strengthFix: 1,
      resetMode: k.resetMode || "ace",
      trackStats: k.trackStats != null ? k.trackStats : true,
      calib: k.calib || [],
      fcal: k.fcal || [],
      caps: k.caps || {},
      sparks: k.sparks || {},
      // Your targets, stat priority and tier list settings carry over to the next career.
      targets: k.targets || {},
      priority: k.priority,
      eu: k.eu,
      tier: k.tier,
      deck: k.deck ? resetBonds(k.deck) : blankDeck(),
      gl: blankGl(),
      facLevels: {},
      db: k.db || null,
      cm: k.cm || null,
      // The Parents tab's plan spans careers (lineage, G1 wins, rating check).
      parents: k.parents || null,
      turn: 1,
      energy: 100,
      mood: 2,
      goalRace: false,
      badCondition: false,
      practicePoor: false,
      race: "",
      raceName: "",
      fans: 0,
      goals: [],
      goalsOff: [],
      extras: {},
      stats: {},
      log: [],
      tab: k.tab || "plan",
      facilities: E.STATS.map(blankFacility)
    };
  }

  // Opens on an example summer-camp turn so the coach has something to show.
  function exampleState() {
    const s = freshState();
    Object.assign(s, { turn: 38, energy: 62, mood: 3, example: true });
    s.facilities = [
      { stat: "speed", gain: null, cards: 3, rainbows: 2, unbonded: 0, hint: false, fail: null, extras: {} },
      { stat: "stamina", gain: null, cards: 1, rainbows: 0, unbonded: 0, hint: true, fail: null, extras: {} },
      { stat: "power", gain: null, cards: 2, rainbows: 1, unbonded: 1, hint: false, fail: null, extras: {} },
      { stat: "guts", gain: null, cards: 0, rainbows: 0, unbonded: 0, hint: false, fail: null, extras: {} },
      { stat: "wit", gain: null, cards: 1, rainbows: 0, unbonded: 0, hint: false, fail: null, extras: {} }
    ].map((f) => Object.assign(blankFacility(f.stat), f));
    return s;
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && s.v === 2 && s.facilities && s.facilities.length === 5) {
        s.deck = s.deck || blankDeck();
        s.facLevels = s.facLevels || {};
        s.facilities.forEach((f) => { f.members = f.members || []; f.hints = f.hints || []; f.extra = f.extra || 0; });
        s.gl = s.gl || blankGl();
        if (!s.gl.focus) s.gl.focus = "songs";
        if (!s.gl.tokenTypes) s.gl.tokenTypes = "usual";
        // Older saves carried max energy from career to career (100 → 104 → 108...): once, set
        // it back to 100 plus what this career's outings added.
        // Older saves learned the scenario multiplier against gains that weren't halved past
        // 1200, so it sank late in a run: rebuild it once from the logged turns.
        if (!s.fcalFix) {
          const lsc = SCENARIOS.find((x) => x.id === s.scenario);
          if (lsc && (s.fcal || []).length) s.fcal = E.relearnCalib(s, lsc);
          s.fcalFix = 1;
        }
        if (!s.meFix) {
          const me = E.careerMaxEnergy(s);
          if ((s.maxEnergy || 100) > me) { s.maxEnergy = me; s.energy = Math.min(s.energy, me); }
          s.meFix = 1;
        }
        repairStrength(s);
        return s;
      }
    } catch (e) { /* storage unavailable */ }
    return exampleState();
  }

  function repairStrength(s) {
    if (s.strengthFix) return;
    const sc = SCENARIOS.find(x => x.id === s.scenario);
    const rebuilt = sc && E.relearnStrength(s, sc);
    if (rebuilt && rebuilt.length) s.calib = rebuilt;
    s.strengthFix = 1;
  }

  let state = load();
  let songBalanceFix = null;

  // ---- Cards you own: { card id: limit break }, kept apart from careers ----
  const OWN_KEY = "uma-owned-v1";
  let owned = {};
  try { owned = JSON.parse(localStorage.getItem(OWN_KEY)) || {}; } catch (e) { owned = {}; }
  function saveOwned() { try { localStorage.setItem(OWN_KEY, JSON.stringify(owned)); } catch (e) { /* ignore */ } }
  // Cards you've marked as out on Global before the card data has their Global date (saved in
  // this browser): { id: date marked }. A date from the data always wins.
  const GL_KEY = "uma-global-v1";
  let markedGlobal = {};
  try { markedGlobal = JSON.parse(localStorage.getItem(GL_KEY)) || {}; } catch (e) { markedGlobal = {}; }
  function applyMarkedGlobal() {
    if (!HAS_DATA) return;
    D.DATA.supports.forEach((c) => {
      if (c.enMarked && !markedGlobal[c.id]) { c.en = null; c.enMarked = false; }
      if (markedGlobal[c.id] && !c.en) { c.en = markedGlobal[c.id]; c.enMarked = true; }
    });
  }
  applyMarkedGlobal();
  function toggleMarkedGlobal(id) {
    if (markedGlobal[id]) delete markedGlobal[id]; else markedGlobal[id] = new Date().toISOString().slice(0, 10);
    try { localStorage.setItem(GL_KEY, JSON.stringify(markedGlobal)); } catch (e) { /* ignore */ }
    applyMarkedGlobal();
  }
  const ownedLb = (id) => (owned[id] != null ? +owned[id] : null);
  const ownedIds = () => Object.keys(owned).map(Number).filter((id) => D && D.card(id));
  const ownedCode = () => D.encodeOwned(owned);
  const readOwnedCode = (text) => D.decodeOwned(text);
  let rec = null;
  // Lists inside the Grand Concert section stay open or closed across re-renders.
  const glOpen = {};
  let openRow = null;
  let resetArmed = null;
  // The turn-by-turn coach can be folded away (say, while using the deck tabs); it stays as you left it.
  const COACH_KEY = "uma-coach-open-v1";
  function coachOpen() { try { return localStorage.getItem(COACH_KEY) !== "0"; } catch (e) { return true; } }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const scenario = () => SCENARIOS.find((s) => s.id === state.scenario) || SCENARIOS[0];
  const numOrNull = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);
  const score = (v) => (v >= 1e4 ? "must" : Math.round((v / Math.max(1, rec ? rec.typ : 1)) * 100));

  function shell() {
    document.getElementById("app").innerHTML = `
      <header class="masthead">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true"></span>
          <div>
            <h1>Uma Turn Coach</h1>
            <p class="sub">Enter what this turn shows. The coach picks the best action and explains why.</p>
          </div>
        </div>
        <div class="controls">
          <label class="field grow"><span>Scenario</span><select id="scenario"></select></label>
          <label class="field"><span>Build</span><select id="build"></select></label>
          <details class="settings" id="settings">
            <summary class="btn ghost">Settings</summary>
            <div class="settings-body">
              <label class="field"><span>Max failure you accept <b id="riskOut"></b></span><input id="risk" type="range" min="0" max="40" step="1"></label>
              <label class="field"><span>Deck race bonus %</span><input id="raceBonus" type="number" inputmode="numeric" min="0" max="100"></label>
              <label class="field"><span>Max energy</span><input id="maxEnergy" type="number" inputmode="numeric" min="100" max="150"></label>
              <label class="field"><span>Reset advice</span><select id="resetMode"><option value="ace">Building an ace (strict)</option><option value="finish">Only when a goal is lost</option><option value="off">Off</option></select></label>
              <button type="button" class="btn ghost" id="resetCalib">Forget learned deck strength</button>
              <p class="mini" id="calibNote"></p>
            </div>
          </details>
          <button type="button" class="btn ghost" id="newCareer">New career</button>
        </div>
      </header>

      <details class="coach" id="coachPanel"${coachOpen() ? " open" : ""}>
        <summary><h2>Turn-by-turn coach</h2><span class="mini" id="coachSummary"></span></summary>
        <div class="coach-body">
      <section class="turnbar" aria-label="Career turns">
        <div class="turn-head">
          <button type="button" id="prev" class="btn ghost square" aria-label="Previous turn" title="Previous turn (←)">◀</button>
          <div class="turn-now"><span id="turnNum"></span><span id="turnText"></span></div>
          <button type="button" id="next" class="btn ghost square" aria-label="Next turn" title="Next turn (→)">▶</button>
          <button type="button" id="goalToggle" class="btn ghost goal" aria-pressed="false">★ Goal race this turn</button>
        </div>
        <div class="strip" id="strip"></div>
        <div class="legend">
          <span><i class="sw y0"></i>Junior</span><span><i class="sw y1"></i>Classic</span><span><i class="sw y2"></i>Senior</span><span><i class="sw camp"></i>Summer camp</span><span><i class="sw fin"></i>Finale</span><span><i class="dot"></i>Key event</span><span><i class="star">★</i>Goal race</span><span><i class="done"></i>Logged</span>
        </div>
      </section>

      <div id="exampleNote" class="example-note" hidden>These are example values for a summer-camp turn. Press <b>New career</b> to start your own run, or overwrite the numbers.</div>

      <main class="grid">
        <section class="inputs" aria-label="This turn">
          <details class="panel deckpanel" id="deckPanel">
            <summary><h2>Trainee and deck</h2><span class="mini" id="deckSummary"></span></summary>
            <div class="deck-body">
              <div class="row-wrap">
                <label class="field grow"><span>Trainee</span><input id="traineeInput" list="traineeList" placeholder="Type a name, e.g. Special Week" autocomplete="off"></label>
                <label class="chip-toggle"><input type="checkbox" id="globalOnly"> Global only</label>
                <label class="chip-toggle"><input type="checkbox" id="ownedOnly"> Cards I own</label>
              </div>
              <div id="traineeInfo" class="trainee-info"></div>
              <div class="slots" id="slots"></div>
              <div class="row-wrap"><button type="button" class="btn ghost small" id="allBond">All cards +5 bond</button><span class="mini">For events or items that raise every card's bond (e.g. Trackblazer's Grilled Carrots).</span></div>
              <p class="mini">Bonds start at each card's initial value. Pressing Done adds 7 for every card you trained with, plus about 5 for a card that had a hint (!). Card events also raise bond: tap <b>+5</b> or <b>+10</b> when one happens, or tap the gauge color the game shows (orange = 80+, friendship unlocked). For Friend and Group cards like Light Hello, tick <b>Outings unlocked</b> once the game offers outings with her and the coach will weigh them against training. Open a card's <b>Outings</b> list to see which event unlocks them and what each outing gives.</p>
            </div>
          </details>
          <datalist id="traineeList"></datalist><datalist id="cardList"></datalist><datalist id="cardListAll"></datalist>

          <div class="panel status">
            <div class="row2">
              <div class="field">
                <span>Energy <b id="energyOut"></b></span>
                <div class="energy">
                  <button type="button" class="btn ghost square" data-energy="-10" aria-label="Energy minus 10">−</button>
                  <input id="energy" type="range" min="0" max="100" step="1" aria-label="Energy">
                  <button type="button" class="btn ghost square" data-energy="10" aria-label="Energy plus 10">+</button>
                  <button type="button" class="btn ghost small" data-energy="5">+5 energy</button><button type="button" class="btn ghost small" id="maxEnergyPlus4">+4 max energy</button><input id="energyNum" type="number" inputmode="numeric" min="0" max="150" aria-label="Energy value">
                </div>
              </div>
              <div class="field"><span>Mood</span><div class="seg" id="mood" role="radiogroup" aria-label="Mood"></div></div>
            </div>
            <div class="row-wrap">
              <label class="field grow"><span>Optional race open</span><select id="race"></select></label>
              <label class="field"><span>Fans</span><input id="fans" type="number" inputmode="numeric" min="0" max="9999999" placeholder="0"></label>
              <label class="chip-toggle"><input type="checkbox" id="badCondition"> Other bad condition</label>
              <label class="chip-toggle" title="+2% failure on every stat training until the Infirmary (or an outing that cures) clears it"><input type="checkbox" id="practicePoor"> Practice Poor</label>
            </div>
            <details id="conditionsPanel" class="conditions-panel"><summary>Good and bad conditions <span id="conditionsSummary" class="mini"></span></summary><div id="conditionsBody"></div></details>
            <p class="mini fanplan" id="fanPlan" hidden></p>
            <div id="turnExtras" class="extras"></div>
          </div>

          <details class="panel songs" id="songsPanel" hidden>
            <summary><h2>Grand Concert</h2><span class="mini" id="songSummary"></span></summary>
            <div class="songs-body" id="songsBody"></div>
          </details>

          <div class="fac-head">
            <h2>Trainings</h2>
            <button type="button" class="btn ghost small" id="clearFacs">Clear</button>
          </div>
          <div class="facilities" id="facilities"></div>
          <p class="mini" id="facHelp"></p>
          <section class="panel quick-events" id="quickEvents" aria-label="Event shortcuts"></section>

          <details class="panel stats" id="statsPanel">
            <summary><h2>Stats and caps</h2><span class="mini">Optional. Lets the coach stop pushing stats that are capped or already enough.</span></summary>
            <div class="table-wrap"><table class="stat-table" id="statTable"></table></div>
            <div class="prio" id="prioRow"></div>
            <p class="mini" id="statNote"></p>
            <label class="chip-toggle"><input type="checkbox" id="trackStats"> Add training gains to these when I press Done</label>
          </details>
        </section>

        <aside class="verdict" aria-live="polite">
          <div class="panel call" id="call"></div>
          <div class="panel" id="options"></div>
        </aside>
      </main>
        </div>
      </details>

      <nav class="tabs" role="tablist">
        <button type="button" role="tab" data-tab="plan">Turn plan</button>
        <button type="button" role="tab" data-tab="log">Career log</button>
        <button type="button" role="tab" data-tab="guide">Scenario guide</button>
        <button type="button" role="tab" data-tab="all">All scenarios</button>
        <button type="button" role="tab" data-tab="cm" id="tabCM">CM &amp; decks</button>
        <button type="button" role="tab" data-tab="tiers" id="tabTiers">Tier list</button>
        <button type="button" role="tab" data-tab="parents" id="tabParents">Parents</button>
        <button type="button" role="tab" data-tab="cards" id="tabCards">Support cards</button>
        <button type="button" role="tab" data-tab="trainees" id="tabTrainees">Trainees</button>
      </nav>
      <section id="tabBody" class="tab-body"></section>
      <footer class="foot">Scenario notes are compiled from JP and Global guides as of October 2026 (Global after the July 2026 rebalance). Turns marked "approx." can shift, so the in-game goal list always wins. Scores are estimates: 100 means a typical training for this point in the career. Card, trainee and CM data from <a href="https://gametora.com/umamusume" target="_blank" rel="noopener">GameTora</a>${HAS_DATA ? " (built " + D.DATA.meta.built + ")" : ""}. Skill length gains from <a href="https://alpha123.github.io/uma-tools/umalator-global/" target="_blank" rel="noopener">alpha123's Umalator</a>. Fan-made tool, not affiliated with Cygames.</footer>
      <div class="dock" id="dock"><div class="dock-text" id="dockText"></div><button type="button" class="btn" id="dockDone">Done ▶</button></div>
    `;

    $("#coachPanel").addEventListener("toggle", (e) => {
      try { localStorage.setItem(COACH_KEY, e.target.open ? "1" : "0"); } catch (err) { /* ignore */ }
    });
    const sel = $("#scenario");
    const groups = [["global", "On Global now"], ["global-soon", "Coming to Global next"], ["jp-current", "JP latest"], ["jp", "JP only (future Global)"], ["announced", "Announced"]];
    sel.innerHTML = groups.map(([st, lab]) => {
      const items = SCENARIOS.filter((s) => s.status === st);
      return items.length ? `<optgroup label="${lab}">${items.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</optgroup>` : "";
    }).join("");
    $("#build").innerHTML = Object.entries(E.BUILDS).map(([k, b]) => `<option value="${k}">${b.label}</option>`).join("");
    $("#mood").innerHTML = E.MOODS.map((m, i) => `<button type="button" role="radio" data-mood="${i}" class="mood m${i}">${m}</button>`).join("");

    sel.addEventListener("change", () => {
      state.scenario = sel.value;
      state.extras = {};
      state.caps = {};
      state.facilities.forEach((f) => (f.extras = {}));
      clampTurn();
      commit(true);
    });
    $("#build").addEventListener("change", (e) => { state.build = e.target.value; commit(true); });
    $("#risk").addEventListener("input", (e) => { state.risk = +e.target.value; commit(); });
    $("#raceBonus").addEventListener("input", (e) => { state.raceBonus = Math.max(0, +e.target.value || 0); commit(); });
    $("#maxEnergy").addEventListener("input", (e) => { const v = +e.target.value; if (v >= 100 && v <= 150) { state.maxEnergy = v; state.energy = Math.min(state.energy, v); commit(); } });
    $("#resetCalib").addEventListener("click", () => { state.calib = []; state.fcal = []; commit(); flash("Learned deck strength cleared"); });
    $("#resetMode").addEventListener("change", (e) => { state.resetMode = e.target.value; commit(); });
    $("#newCareer").addEventListener("click", () => newCareer($("#newCareer")));

    $("#maxEnergyPlus4").addEventListener("click", () => {
      state.maxEnergy = Math.min(150, (state.maxEnergy || 100) + 4);
      commit(true); flash("Max energy: " + state.maxEnergy + ". Current energy unchanged.");
    });
    $("#energy").addEventListener("input", (e) => { state.energy = +e.target.value; $("#energyNum").value = state.energy; commit(); });
    $("#energyNum").addEventListener("input", (e) => { const v = numOrNull(e.target.value); if (v != null) { state.energy = Math.max(0, Math.min(state.maxEnergy, v)); $("#energy").value = state.energy; commit(); } });
    $$("[data-energy]").forEach((b) => b.addEventListener("click", () => {
      state.energy = Math.max(0, Math.min(state.maxEnergy, state.energy + +b.dataset.energy));
      $("#energy").value = state.energy; $("#energyNum").value = state.energy; commit();
    }));
    $("#mood").addEventListener("click", (e) => { const b = e.target.closest("[data-mood]"); if (b) { state.mood = +b.dataset.mood; commit(); } });
    $("#race").addEventListener("change", (e) => {
      const v = e.target.value;
      if (v.indexOf("named:") === 0) {
        const r = E.racesAt(state, state.turn).find((x) => x.n === v.slice(6));
        state.race = r ? E.GRADE_KEY[r.g] : "";
        state.raceName = r ? r.n : "";
      } else { state.race = v; state.raceName = ""; }
      commit();
    });
    $("#fans").addEventListener("input", (e) => { const v = numOrNull(e.target.value); state.fans = v == null ? 0 : Math.max(0, v); commit(); });
    $("#badCondition").addEventListener("change", (e) => { state.badCondition = e.target.checked; commit(); });
    $("#practicePoor").addEventListener("change", (e) => { C.set(state, "poor", e.target.checked); commit(true); });
    $("#conditionsBody").addEventListener("change", (e) => { if (!e.target.dataset.condition) return; C.set(state, e.target.dataset.condition, e.target.checked); commit(true); });
    $("#trackStats").addEventListener("change", (e) => { state.trackStats = e.target.checked; commit(); });

    $("#prev").addEventListener("click", () => setTurn(state.turn - 1));
    $("#next").addEventListener("click", () => setTurn(state.turn + 1));
    $("#goalToggle").addEventListener("click", toggleGoal);
    $("#strip").addEventListener("click", (e) => { const c = e.target.closest("[data-turn]"); if (c) setTurn(+c.dataset.turn); });
    $("#clearFacs").addEventListener("click", () => { state.facilities = E.STATS.map(blankFacility); commit(true); });
    $("#quickEvents").addEventListener("click", (e) => {
      if (e.target.closest("#lh20Add, #lh20Undo")) { handleHelloReward(e); return; }
      const b = e.target.closest("[data-training-bond]");
      if (b) {
        const sl = state.deck.slots[+b.dataset.trainingBond]; if (!sl) return;
        const before = slotBond(sl); sl.bond = Math.min(100, before + +b.dataset.add);
        R.event(state, "bondAdjustment", { slot: +b.dataset.trainingBond, before, after: sl.bond });
        commit(true); return;
      }
      const all = e.target.closest("[data-token-all]");
      if (all) {
        const reward = E.recordTokenReward(state, scenario(), +all.dataset.tokenAll); if (!reward) return;
        const key = state.turn + ":" + (state.gl.tokenRewardCount || 0);
        state.gl.tokenRewardCount = (state.gl.tokenRewardCount || 0) + 1;
        R.event(state, "observedTokenReward", Object.assign({ rewardKey: key }, reward));
        state.gl.tokenRewardUndo = Object.assign({ key }, reward);
        commit(true); flash("Recorded +" + reward.amount + " of every token. Future Promo Live collaborator rewards are added by Done automatically."); return;
      }
      if (e.target.closest("[data-token-reward-undo]")) {
        const u = state.gl.tokenRewardUndo;
        if (!u || u.turn !== state.turn || !u.after.every((n, i) => state.gl.tokens[i] === n)) { flash("Tokens changed: undo later actions first."); return; }
        state.gl.tokens = u.before;
        state.runPending = (state.runPending || []).filter((x) => x.rewardKey !== u.key);
        delete state.gl.tokenRewardUndo; commit(true);
      }
    });
    $("#quickEvents").addEventListener("change", (e) => {
      if (e.target.dataset.quickUnlock == null) return;
      const sl = state.deck.slots[+e.target.dataset.quickUnlock];
      if (sl) { sl.dates = Object.assign({ done: 0 }, sl.dates, { unlocked: e.target.checked }); commit(true); }
    });
    $("#dockDone").addEventListener("click", () => done(rec && rec.action));

    // Turn-level scenario inputs.
    $("#turnExtras").addEventListener("input", (e) => {
      const k = e.target.dataset.extra; if (!k) return;
      state.extras[k] = readExtra(e.target);
      // Trackblazer: a typed Grade Point count belongs to this year's goal.
      if (k === "gpNeed") state.extras.gpDue = (E.gradeGoal(state, scenario()) || {}).due;
      commit();
    });

    // Training cards: pips, toggles and number boxes.
    $("#facilities").addEventListener("click", (e) => {
      const mc = e.target.closest("[data-member]");
      if (mc) {
        // A card shows up on one training per turn, so tapping it here removes it elsewhere.
        // Each tap cycles: not here → here → here with a hint (!) → not here.
        const f = state.facilities[+mc.closest("[data-idx]").dataset.idx];
        const si = +mc.dataset.member;
        const on = f.members.indexOf(si) !== -1;
        const hinted = (f.hints || []).indexOf(si) !== -1;
        state.facilities.forEach((x) => {
          x.members = (x.members || []).filter((m) => m !== si);
          x.hints = (x.hints || []).filter((m) => m !== si);
        });
        if (!on) f.members.push(si);
        else if (!hinted) { f.members.push(si); f.hints.push(si); }
        renderFacilities();
        commit();
        return;
      }
      const pip = e.target.closest("[data-pip]");
      if (!pip) return;
      const box = pip.closest("[data-idx]");
      const idx = +box.dataset.idx;
      const f = state.facilities[idx];
      const k = pip.dataset.pip;
      let v = +pip.dataset.v;
      if (f[k] === v) v = v - 1; // tapping the last filled dot clears it
      if (k === "extra") f.extra = Math.max(0, v);
      else if (k === "rbmark") { if (+pip.dataset.v === rainbowCount(f)) v = +pip.dataset.v - 1; setRainbows(f, Math.max(0, v)); renderFacilities(); renderDeck(); commit(); return; }
      else setCount(f, k, Math.max(0, v));
      box.outerHTML = facilityHTML(f, idx);
      commit();
    });
    $("#facilities").addEventListener("input", (e) => {
      const box = e.target.closest("[data-idx]"); if (!box) return;
      const f = state.facilities[+box.dataset.idx];
      if (e.target.dataset.k) {
        const k = e.target.dataset.k;
        f[k] = e.target.type === "checkbox" ? e.target.checked : numOrNull(e.target.value);
        if (k === "hint") e.target.closest("label").classList.toggle("on", f.hint);
      }
      if (e.target.dataset.gltok) {
        const k = e.target.dataset.gltok;
        f.extras[k] = e.target.value === "" ? null : +e.target.value;
        if (k === "tokType" || k === "tokType2") { box.outerHTML = facilityHTML(f, +box.dataset.idx); }
      }
      if (e.target.dataset.lv) {
        const v = +e.target.value;
        if (v) state.facLevels[f.stat] = v; else delete state.facLevels[f.stat];
      }
      if (e.target.dataset.extra) {
        f.extras[e.target.dataset.extra] = readExtra(e.target);
        if (e.target.type === "checkbox") e.target.closest("label").classList.toggle("on", e.target.checked);
      }
      commit();
    });
    $("#facilities").addEventListener("focusin", (e) => { if (e.target.select && e.target.type === "number") e.target.select(); });

    $("#prioRow").addEventListener("change", (e) => {
      const i = e.target.dataset.prio; if (i == null) return;
      // The picked stat moves to that rank and the others keep their order around it.
      const order = (Array.isArray(state.priority) && state.priority.length === 5 ? state.priority : E.buildPriority(state.build)).filter((x) => x !== e.target.value);
      order.splice(+i, 0, e.target.value);
      state.priority = order;
      commit(true);
    });
    $("#prioRow").addEventListener("click", (e) => { if (e.target.closest("#prioReset")) { delete state.priority; commit(true); } });
    $("#statTable").addEventListener("input", (e) => {
      const s = e.target.dataset.stat; if (!s) return;
      if (e.target.dataset.kind === "sparks") {
        state.sparks = state.sparks || {};
        const txt = e.target.value.replace(/[^1-3 ,]/g, "").trim();
        if (txt) state.sparks[s] = txt; else delete state.sparks[s];
        const capIn = $('#statTable input[data-kind="cap"][data-stat="' + s + '"]');
        if (capIn) capIn.placeholder = E.capsFor(Object.assign({}, state, { caps: {} }), scenario())[s];
        commit();
        return;
      }
      const v = numOrNull(e.target.value);
      if (e.target.dataset.kind === "cap") { if (v) state.caps[s] = v; else delete state.caps[s]; }
      else if (e.target.dataset.kind === "target") { state.targets = state.targets || {}; if (v) state.targets[s] = v; else delete state.targets[s]; }
      else { if (v) state.stats[s] = v; else delete state.stats[s]; }
      commit();
    });

    if (HAS_DATA) {
      $("#globalOnly").addEventListener("change", (e) => { state.deck.globalOnly = e.target.checked; fillLists(); commit(); });
      $("#ownedOnly").addEventListener("change", (e) => {
        state.deck.ownedOnly = e.target.checked;
        fillLists();
        commit();
        if (e.target.checked && !ownedIds().length) flash("You haven't marked any cards as owned yet. Do it in the Support cards tab.");
      });
      $("#traineeInput").addEventListener("change", (e) => {
        const v = e.target.value.trim();
        const t = traineeByLabel.get(v);
        if (t && t.id === state.deck.trainee) return;
        if (t) { setTrainee(t.id); }
        else if (!v) { state.deck.trainee = null; commit(true); }
        else flash("No trainee matches that name. Pick one from the list.");
      });
      $("#traineeInfo").addEventListener("click", (e) => {
        const b = e.target.closest("[data-build]");
        if (b) { state.build = b.dataset.build; commit(true); flash("Build set to " + E.BUILDS[state.build].label); }
      });
      $("#slots").addEventListener("change", (e) => {
        const t = e.target;
        if (t.dataset.slotName != null) {
          const i = +t.dataset.slotName;
          const v = t.value.trim();
          const c = cardByLabel.get(v);
          const cur = state.deck.slots[i];
          if (c && cur && cur.id === c.id) return;
          if (c) { state.deck.slots[i] = { id: c.id, lb: ownedLb(c.id) != null ? ownedLb(c.id) : 4, bond: null }; commit(true); }
          else if (!v) { clearSlot(i); }
          else flash("No card matches that name. Pick one from the list.");
        }
        if (t.dataset.slotLb != null) { const sl = state.deck.slots[+t.dataset.slotLb]; sl.lb = +t.value; sl.bond = sl.bond; commit(true); }
      });
      $("#slots").addEventListener("input", (e) => {
        const t = e.target;
        if (t.dataset.slotBond != null) {
          const v = numOrNull(t.value);
          state.deck.slots[+t.dataset.slotBond].bond = v == null ? null : Math.max(0, Math.min(100, v));
          renderFacilities();
          commit();
        }
      });
      $("#allBond").addEventListener("click", () => {
        state.deck.slots.forEach((sl) => { if (sl) sl.bond = Math.min(100, slotBond(sl) + 5); });
        commit(true);
        flash("Every card: bond +5");
      });
      $("#slots").addEventListener("click", (e) => {
        const b = e.target.closest("[data-slot-clear]");
        if (b) { clearSlot(+b.dataset.slotClear); return; }
        const set = e.target.closest("[data-bondset]");
        const add = e.target.closest("[data-bondadd]");
        const adj = e.target.closest("[data-date-adj]");
        if (set || add) {
          const i = +(set || add).dataset[set ? "bondset" : "bondadd"];
          const sl = state.deck.slots[i];
          const v = +(set || add).dataset.v;
          sl.bond = Math.max(0, Math.min(100, set ? v : slotBond(sl) + v));
          commit(true);
          flash(D.card(sl.id).n + ": bond " + Math.round(sl.bond));
        }
        if (adj) {
          const sl = state.deck.slots[+adj.dataset.dateAdj];
          sl.dates = Object.assign({ unlocked: true, done: 0 }, sl.dates);
          sl.dates.done = Math.max(0, sl.dates.done + +adj.dataset.v);
          commit(true);
        }
      });
      $("#slots").addEventListener("change", (e) => {
        const u = e.target.dataset.dateUnlock;
        if (u == null) return;
        const sl = state.deck.slots[+u];
        sl.dates = Object.assign({ done: 0 }, sl.dates, { unlocked: e.target.checked });
        commit(true);
      });
    } else {
      $("#deckPanel").hidden = true;
      $("#tabCards").hidden = true;
      $("#tabCM").hidden = true;
      $("#tabTiers").hidden = true;
      $("#tabTrainees").hidden = true;
    }

    $("#songsBody").addEventListener("input", (e) => {
      if (e.target.dataset.helloMet != null) {
        const sl = state.deck.slots[+e.target.dataset.helloMet];
        if (sl) { sl.met = e.target.checked; commit(true); }
        return;
      }
      const i = e.target.dataset.tok;
      if (i == null) return;
      const before = state.gl.tokens.slice();
      state.gl.tokens[+i] = Math.max(0, +e.target.value || 0);
      R.balanceCorrection(state, before, +i);
      commit();
      renderSongsLight();
    });
    // Open/closed state of the lists inside, kept across re-renders.
    $("#songsBody").addEventListener("toggle", (e) => { const k = e.target.dataset && e.target.dataset.keep; if (k) glOpen[k] = e.target.open; }, true);
    $("#songsBody").addEventListener("change", (e) => {
      const d = e.target.dataset;
      if (e.target.id === "grandFocus") { state.gl.focus = e.target.value; commit(true); return; }
      // Your shop: tick what it shows (and the type an any-type cost asks for).
      if (d.techOffer || d.techType) {
        state.gl.shop = state.gl.shop || {};
        if (d.techOffer) { if (e.target.checked) state.gl.shop[d.techOffer] = state.gl.shop[d.techOffer] || { turn: state.turn }; else { delete state.gl.shop[d.techOffer]; if (state.gl.holdSong && d.techOffer === "song:" + state.gl.holdSong.id) delete state.gl.holdSong; } }
        if (d.techType) state.gl.shop[d.techType] = Object.assign({ turn: state.turn }, state.gl.shop[d.techType], { type: e.target.value === "" ? null : +e.target.value });
        commit(true);
        return;
      }
      // Songs you have: add one you'd learned before (no tokens taken).
      if (e.target.id === "songAdd" && e.target.value) {
        const song = scenario().songs.find((x) => x.id === e.target.value);
        const at = +$("#songAddTurn").value;
        if (!Number.isInteger(at) || at < song.from || at > state.turn) { flash("Choose the actual learned turn, from " + song.from + " through " + state.turn + "."); e.target.value = ""; return; }
        if (!E.recordLearnedSong(state, scenario(), song.id, at)) return;
        R.event(state, "songBackfill", { id: song.id, label: song.name, learnedTurn: at, paid: false });
        commit(true);
        flash("Added " + song.name + " to your songs");
      }
    });
    $("#songsBody").addEventListener("click", (e) => {
      const hold = e.target.closest("[data-song-hold]"), release = e.target.closest("[data-song-release]");
      if (hold || release) {
        e.preventDefault();
        const id = hold ? hold.dataset.songHold : state.gl.holdSong && state.gl.holdSong.id;
        if (hold && !E.holdSong(state, scenario(), id)) { flash("Mark this song as actually offered before holding it."); return; }
        if (release) delete state.gl.holdSong;
        R.event(state, hold ? "songHold" : "songHoldRelease", { id });
        commit(true); flash(hold ? "Selection held for after the concert; keep it unchanged in game." : "Released the hold; purchase advice is active again."); return;
      }
      const buy = e.target.closest("[data-tech-buy]");
      if (buy) {
        e.preventDefault();
        const id = buy.dataset.techBuy;
        const offer = (state.gl.shop || {})[id];
        const previous = state.gl.lastBuy;
        E.buyTechnique(state, scenario(), id, offer ? offer.type : null);
        if (state.gl.lastBuy === previous) { flash("Purchase not recorded: check your Performance balance and choose the type shown in the shop."); return; }
        songBalanceFix = null;
        R.purchase(state, state.gl.lastBuy);
        commit(true);
        flash("Bought " + state.gl.lastBuy.label + (state.gl.lastBuy.sp ? "; +" + state.gl.lastBuy.sp + " SP in game" : "") + ": tick your shop's new offers");
        return;
      }
      const sbuy = e.target.closest("[data-song-buy]");
      if (sbuy) {
        e.preventDefault();
        const previous = state.gl.lastBuy;
        E.buySong(state, scenario(), sbuy.dataset.songBuy);
        if (state.gl.lastBuy === previous) { songBalanceFix = sbuy.dataset.songBuy; renderShop(); flash("The coach balance is short. Update it, or record a song already bought in game below. Holding never locks Bought."); return; }
        songBalanceFix = null;
        R.purchase(state, state.gl.lastBuy);
        commit(true);
        flash("Learned " + state.gl.lastBuy.label + (state.gl.lastBuy.sp ? "; +" + state.gl.lastBuy.sp + " SP in game" : "") + ": tick your shop's new offers");
        return;
      }
      const owned = e.target.closest("[data-song-owned]");
      if (owned) {
        const id = owned.dataset.songOwned;
        if (!E.recordLearnedSong(state, scenario(), id, state.turn)) return;
        R.event(state, "songBackfill", { id, label: scenario().songs.find((x) => x.id === id).name, learnedTurn: state.turn, paid: false, source: "alreadyBoughtBalanceMismatch" });
        songBalanceFix = null; commit(true); flash("Recorded owned song. Tokens and stats unchanged; match the game's current balances."); return;
      }
      const rm = e.target.closest("[data-song-rm]");
      if (rm) {
        const song = scenario().songs.find((x) => x.id === rm.dataset.songRm);
        const learnedTurn = state.gl.songs[song.id];
        delete state.gl.songs[song.id];
        R.event(state, "songRemoval", { id: song.id, label: song.name, learnedTurn, refunded: false });
        commit(true);
        flash("Removed " + song.name + " (tokens unchanged)");
        return;
      }
      if (e.target.closest("[data-tech-undo]")) {
        const label = state.gl.lastBuy && state.gl.lastBuy.label;
        const previous = state.gl.lastBuy;
        E.undoBuy(state);
        if (previous && state.gl.lastBuy === previous) { flash("Run changed since purchase: undo later actions first or correct balances manually."); return; }
        if (previous) R.purchase(state, previous, true);
        commit(true);
        flash("Undid " + (label || "the buy"));
      }
    });

    $("#options").addEventListener("click", (e) => {
      const did = e.target.closest("[data-did]");
      if (did) { done(rec.ranked[+did.dataset.did]); return; }
      const row = e.target.closest("[data-row]");
      if (row) { openRow = openRow === +row.dataset.row ? null : +row.dataset.row; renderOptions(); }
    });
    // Number answers (songs bought, springs dug) count once you leave the box or press Enter.
    $("#call").addEventListener("change", (e) => {
      if (e.target.id === "gotPoor") { poorPick = e.target.checked; return; }
      const n = e.target.dataset.rcNum;
      if (!n) return;
      const [key, qid] = n.split("|");
      rcAnswer(key, qid, e.target.value === "" ? null : Math.max(0, +e.target.value || 0));
    });
    $("#call").addEventListener("click", (e) => {
      const fix = e.target.closest("[data-rc-fix]");
      if (fix) { rcFix[fix.dataset.rcFix] = true; renderCall(); return; }
      if (e.target.closest("#doneBtn")) done(rec && rec.action);
      if (e.target.closest("#undoBtn")) undoTurn();
      if (e.target.closest("#stepStageBtn")) stepStage();
      if (e.target.closest("#rcNew")) newCareer($("#rcNew"));
      const fb = e.target.closest("[data-fail]");
      if (fb) { failPick = fb.dataset.fail; if (!failPick || failPick === "slacker") poorPick = false; renderCall(); return; }
      const ob = e.target.closest("[data-outing-result]");
      const cb = e.target.closest("[data-cure-result]");
      if (cb) { curePick = cb.dataset.cureResult !== "no"; renderCall(); return; }
      if (ob) { outingPick = ob.dataset.outingResult; renderCall(); return; }
      const ans = e.target.closest("[data-rc-ans]");
      if (ans) { const [key, qid, v] = ans.dataset.rcAns.split("|"); const cur = (((state.runChecks || {})[key] || {}).a || {})[qid]; rcAnswer(key, qid, cur === v ? null : v); return; }
      const cont = e.target.closest("[data-rc-continue]");
      if (cont) {
        state.runChecks = state.runChecks || {};
        cont.dataset.rcContinue.split(",").forEach((key) => { (state.runChecks[key] = state.runChecks[key] || {}).decision = "continue"; });
        commit(true);
        flash("Finishing this run. The coach won't ask about that check again.");
        return;
      }
      if (e.target.closest("#rcCopy")) {
        const text = runSummary($("#rcWhy").value);
        const out = $("#rcOut");
        out.hidden = false;
        out.value = text;
        try { navigator.clipboard.writeText(text).then(() => flash("Run summary copied: paste it to me"), () => { out.select(); flash("Select the summary and copy it"); }); } catch (err) { out.select(); flash("Select the summary and copy it"); }
        return;
      }
      if (e.target.closest("#reportCopy")) {
        const text = turnReport($("#reportWhy").value);
        const out = $("#reportOut");
        out.hidden = false;
        out.value = text;
        try { navigator.clipboard.writeText(text).then(() => flash("Report copied: paste it to me"), () => { out.select(); flash("Select the report and copy it"); }); } catch (err) { out.select(); flash("Select the report and copy it"); }
      }
    });

    document.querySelector(".tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) { state.tab = b.dataset.tab; save(); renderTab(); } });
    $("#tabBody").addEventListener("click", (e) => {
      if (state.tab === "parents" && parents() && parents().click(e)) return;
      const t = e.target.closest("[data-goto]"); if (t) { setTurn(+t.dataset.goto); window.scrollTo({ top: 0, behavior: "smooth" }); }
      const s = e.target.closest("[data-pick]"); if (s) { sel.value = s.dataset.pick; sel.dispatchEvent(new Event("change")); state.tab = "guide"; save(); renderTab(); }
      if (e.target.closest("[data-undo]")) undoTurn();
      if (e.target.closest("#ownAddBtn")) {
        const c = cardByLabel.get($("#ownAddName").value.trim());
        if (!c) { flash("Pick a card from the list first."); return; }
        setOwned(c.id, $("#ownAddLb").value);
        $("#ownAddName").value = "";
        flash(c.n + " [" + c.t + "] saved as LB" + owned[c.id]);
        renderDbList();
        $("#ownAddName").focus();
        return;
      }
      if (e.target.closest("#ownExport")) {
        const code = ownedCode();
        const box = $("#ownCodeOut");
        box.hidden = false;
        box.value = code;
        box.select();
        try { navigator.clipboard.writeText(code).then(() => flash("Backup code copied"), () => flash("Select the code and copy it")); } catch (err) { flash("Select the code and copy it"); }
        return;
      }
      if (e.target.closest("#ownImport")) {
        const got = readOwnedCode($("#ownImportCode").value);
        if (!got) { flash("That isn't a backup code. It starts with UMA1:"); return; }
        owned = got;
        saveOwned();
        flash("Restored " + Object.keys(got).length + " cards");
        renderTab();
        fillLists();
        return;
      }
      if (cmClick(e)) return;
      if (tierClick(e)) return;
      const euSum = e.target.closest(".eu-settings > summary");
      if (euSum) euOpen = !euSum.parentElement.open;
      if (e.target.closest("#euReset")) { eu().over[euScen()] = { general: {}, tabs: {} }; save(); renderTab(); return; }
      const add = e.target.closest("[data-add-card]");
      if (add) { addToDeck(+add.dataset.addCard); return; }
      const use = e.target.closest("[data-use-trainee]");
      if (use) { setTrainee(+use.dataset.useTrainee); return; }
      const more = e.target.closest("[data-more]");
      if (more) { db().limit += 60; renderDbList(); return; }
      const mg = e.target.closest("[data-mark-global]");
      if (mg) {
        const id = +mg.dataset.markGlobal;
        toggleMarkedGlobal(id);
        flash(D.card(id).n + (markedGlobal[id] ? " counts as on Global now" : " no longer counts as on Global"));
        optResult = null;
        fillLists();
        renderDbList();
        return;
      }
      const row = e.target.closest("[data-db-row]");
      if (row) { const id = +row.dataset.dbRow; db().open = db().open === id ? null : id; renderDbList(); }
    });
    // Euophrys weight edits re-rank once you leave the box (or tick a box).
    $("#tabBody").addEventListener("change", (e) => { if (state.tab === "parents" && parents()) parents().change(e); });
    $("#tabBody").addEventListener("toggle", (e) => { if (state.tab === "parents" && parents()) parents().onToggle(e); }, true);
    $("#tabBody").addEventListener("change", (e) => { if (e.target.dataset.eu != null || e.target.dataset.cmTarget != null) setTimeout(renderTab, 0); });
    $("#tabBody").addEventListener("input", (e) => {
      if (e.target.dataset.own != null) {
        const id = +e.target.dataset.own;
        setOwned(id, e.target.value);
        const row = e.target.closest(".cardrow");
        if (row) row.classList.toggle("owned", e.target.value !== "");
        return;
      }
      if (e.target.dataset.cmComp != null) {
        const comp = cm().comp;
        if (e.target.value === "") delete comp[e.target.dataset.cmComp]; else comp[e.target.dataset.cmComp] = +e.target.value;
        save();
        renderCM();
        return;
      }
      if (e.target.dataset.cmTarget != null) {
        const tg = cm().targets;
        const v = +e.target.value;
        if (v > 0) tg[e.target.dataset.cmTarget] = v; else delete tg[e.target.dataset.cmTarget];
        save();
        return;
      }
      if (e.target.dataset.cm != null) { cmInput(e.target); return; }
      if (e.target.dataset.tier != null) { tierInput(e.target); return; }
      if (e.target.dataset.eu != null) { euInput(e.target); return; }
      if (e.target.dataset.euScen != null) { eu().scen = e.target.value; save(); renderTab(); return; }
      if (e.target.dataset.tierPreset != null && e.target.value !== "") {
        const ids = EU_PRESETS[+e.target.value][1];
        tier().deck = ids.filter((id) => D.card(id)).map((id) => ({ id, lb: owned[id] != null ? owned[id] : 4 }));
        save();
        renderTiers();
        return;
      }
      if (e.target.dataset.pickTrainee != null) {
        const v = e.target.value.trim();
        const tr = traineeByLabel.get(v);
        if ((tr && tr.id !== state.deck.trainee) || (!v && state.deck.trainee)) {
          if (tr) tier().deck = tier().deck.filter((x) => D.card(x.id).cid !== tr.cid);
          setTrainee(tr ? tr.id : null);
        }
        return;
      }
      const k = e.target.dataset.db; if (!k) return;
      const d = db();
      d[k] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
      d.limit = 60;
      save();
      renderDbList();
    });

    document.addEventListener("keydown", (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea" || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft") { setTurn(state.turn - 1); e.preventDefault(); }
      if (e.key === "ArrowRight") { setTurn(state.turn + 1); e.preventDefault(); }
    });
  }

  function readExtra(el) {
    if (el.type === "checkbox") return el.checked;
    if (el.tagName === "SELECT") return el.value;
    return Math.max(0, +el.value || 0);
  }

  // Keeps Cards ≥ Rainbow + Bond<80 so the dots always describe a real training.
  function setCount(f, k, v) {
    f[k] = Math.min(PIP_MAX, v);
    if (k === "cards") {
      f.rainbows = Math.min(f.rainbows, f.cards);
      f.unbonded = Math.min(f.unbonded, f.cards - f.rainbows);
    } else if (f.rainbows + f.unbonded > f.cards) {
      f.cards = Math.min(PIP_MAX, f.rainbows + f.unbonded);
      if (f.rainbows + f.unbonded > f.cards) {
        if (k === "rainbows") f.unbonded = f.cards - f.rainbows;
        else f.rainbows = f.cards - f.unbonded;
      }
    }
  }

  function clampTurn() {
    state.turn = Math.max(1, Math.min(scenario().totalTurns, state.turn));
  }

  function setTurn(t) {
    state.turn = t;
    clampTurn();
    state.goalRace = E.isGoalTurn(state, scenario(), state.turn);
    commit(true);
  }

  // A goal from the trainee's goal list is unmarked through goalsOff; others through goals.
  function toggleGoal() {
    const sc = scenario();
    const t = state.turn;
    const auto = E.traineeGoals(state, sc).some((x) => x.forced && x.turn === t);
    if (auto) {
      const off = new Set(state.goalsOff || []);
      if (off.has(t)) off.delete(t); else off.add(t);
      state.goalsOff = Array.from(off);
    } else {
      const g = new Set(state.goals || []);
      if (g.has(t)) g.delete(t); else g.add(t);
      state.goals = Array.from(g).sort((a, b) => a - b);
    }
    state.goalRace = E.isGoalTurn(state, sc, t);
    commit(true);
  }

  // The training's result for the next Done: "" (success), "fail" or "bad". It applies to
  // whichever training you log, then goes back to success.
  let failPick = "";
  let curePick = true;
  let poorPick = false;
  let outingPick = "success";
  function done(option) {
    if (!option) return;
    state.example = false;
    const failed = option.kind === "train" ? failPick : "";
    const poor = !!failed && poorPick;
    const before = state;
    const observed = { result: failed || null, outing: outingPick, cured: curePick, gotPracticePoor: poor };
    const next = E.advance(state, scenario(), option, failed || undefined, observed);
    if (next === state) { flash("The lesson can no longer be bought. Check your shop and Performance balance, then choose again."); return; }
    state = next;
    if (poor) C.set(state, "poor", true);
    R.recordTurn(before, state, scenario(), rec, option, observed);
    failPick = "";
    curePick = true;
    poorPick = false;
    outingPick = "success";
    openRow = null;
    commit(true);
    const last = state.log[state.log.length - 1];
    flash("Logged turn " + (state.turn - 1) + ": " + (last ? last.label : option.label) +
      (failed ? (failed === "slacker" ? ". Did not show up: no training gains, energy cost, bonds or Performance." : failed === "bad" ? ". Mood -3, " + E.STAT_LABELS[option.stat] + " -10: fix the 2 random stats it took in Stats." : ". Mood -1, " + E.STAT_LABELS[option.stat] + " -5.") + (poor ? " Practice Poor is on: +2% failure until the Infirmary cures it." : "") : ""));
  }

  function undoTurn() {
    if (!(state.log || []).length) return;
    const tab = state.tab;
    state = E.undo(state);
    repairStrength(state);
    state.tab = tab;
    commit(true);
    flash("Undid turn " + state.turn);
  }

  // Resolves a pending concert: applies the deferred concert rewards
  // (calendar performance, concert stats, shop carry) by calling the
  // engine's finalizeConcert, then records the event in the run report.
  function stepStage() {
    if (!state.gl || !state.gl.pendingConcert) return;
    const pending = state.gl.pendingConcert;
    const ok = E.finalizeConcert(state, scenario());
    if (ok) {
      R.recordFinalization(state, scenario(), pending.turn);
      commit(true);
      flash("Concert on turn " + pending.turn + " resolved: stats, collaborators' tokens and carry applied.");
    }
  }

  // Two taps start over (the first arms it for 3 seconds). btn: the button pressed.
  function newCareer(btn) {
    btn = btn || $("#newCareer");
    const label = btn.dataset.label || (btn.dataset.label = btn.textContent);
    if (!resetArmed) {
      btn.textContent = "Tap again to reset";
      btn.classList.add("warn");
      resetArmed = setTimeout(() => { resetArmed = null; btn.textContent = label; btn.classList.remove("warn"); }, 3000);
      return;
    }
    clearTimeout(resetArmed);
    resetArmed = null;
    state = freshState(state);
    btn.textContent = label;
    btn.classList.remove("warn");
    commit(true);
    flash("New career started at turn 1");
  }

  function handleHelloReward(e) {
      if (e.target.closest("#lh20Add")) {
        const sc = scenario(), tokens = state.gl.tokens, selected = $("#lh20Type").value;
        const low = Math.min(...tokens), tied = tokens.map((n,i) => n === low ? i : -1).filter(i => i >= 0);
        const type = selected === "" ? tied[0] : +selected;
        // The event does not change the turn log. Keeping the full log inside
        // every event backup makes subsequent turn snapshots grow recursively.
        const backup = Object.assign({}, state, { log: undefined, gl: Object.assign({}, state.gl) });
        delete backup.gl.lh20Undo;
        const before = JSON.stringify(backup);
        const amount = +$("#lhAmount").value;
        const last = (state.log || []).slice(-1)[0];
        const turn = last && last.kind === "train" && last.turn === state.turn - 1 ? last.turn : state.turn;
        const recorded = E.recordHelloEvent(state, sc, { amount, type, mood: $("#lhMood").checked, turn });
        if (!recorded) { flash("No eligible Light Hello event, or it was already recorded for that turn."); return; }
        if (selected === "" && tied.length > 1) recorded.typeAssumed = true;
        R.event(state, "helloEvent", recorded, recorded.turn);
        const entry = { v: 2, before, after: "" }; state.gl.lh20Undo = entry;
        commit(true);
        // Rendering normalizes a few saved fields. Compare Undo against the
        // resulting state, rather than the pre-render object.
        const current = Object.assign({}, state, { log: undefined, gl: Object.assign({}, state.gl) }); delete current.gl.lh20Undo;
        entry.after = JSON.stringify(current); save();
        flash("Light Hello: +" + recorded.credited + " " + sc.tokens[type] + ", Guts +" + recorded.guts + ", +7 bond; " + recorded.sp + " SP in game"); return;
      }
      if (e.target.closest("#lh20Undo")) {
        const entry = state.gl.lh20Undo; if (!entry) return;
        const current = Object.assign({}, state, {gl: Object.assign({}, state.gl)}); delete current.gl.lh20Undo;
        if (entry.v === 2) delete current.log;
        if (JSON.stringify(current) !== entry.after) { flash("Run changed since event: undo later actions first or correct balances manually."); return; }
        const log = state.log;
        state = JSON.parse(entry.before);
        if (entry.v === 2) state.log = log;
        commit(true); flash("Undid Light Hello event"); return;
      }
  }

  let flashTimer = null;
  function flash(msg) {
    let el = $("#toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  // Value edits refresh only the outputs, so a field being typed in keeps focus.
  function commit(full) {
    state.example = false;
    state.goalRace = E.isGoalTurn(state, scenario(), state.turn);
    save();
    if (full) render(); else renderOutputs();
  }

  function renderStrip() {
    const sc = scenario();
    const evTurns = new Set((sc.events || []).map((e) => e.turn).concat(sc.finale.turns, [12], E.traineeGoals(state, sc).map((g) => g.turn)));
    const goals = new Set(E.forcedTurns(state, sc));
    const logged = new Set((state.log || []).map((l) => l.turn));
    let html = "";
    for (let t = 1; t <= sc.totalTurns; t++) {
      const ti = E.turnInfo(t, sc);
      const y = t > 72 ? "fin" : "y" + Math.floor((t - 1) / 24);
      const cls = ["cell", y, E.isCamp(t, sc) ? "camp" : "", t === state.turn ? "on" : "", logged.has(t) ? "logged" : ""].join(" ");
      const mark = goals.has(t) ? '<i class="star">★</i>' : evTurns.has(t) ? '<i class="dot"></i>' : "";
      html += `<button type="button" class="${cls}" data-turn="${t}" title="Turn ${t}: ${esc(ti.text)}" aria-label="Turn ${t}, ${esc(ti.text)}${goals.has(t) ? ", goal race" : ""}">${mark}</button>`;
    }
    $("#strip").innerHTML = html;
    const ti = E.turnInfo(state.turn, sc);
    $("#turnNum").textContent = "Turn " + state.turn + " / " + sc.totalTurns;
    $("#turnText").innerHTML = esc(ti.text) + (E.isCamp(state.turn, sc) ? ' <span class="chip camp">summer camp</span>' : "") + (state.turn < 12 ? ' <span class="chip">' + E.turnsToDebut(state.turn) + " turns to debut</span>" : "");
    const isGoal = E.isGoalTurn(state, sc, state.turn);
    const forcedFinale = sc.finale.forced && sc.finale.turns.indexOf(state.turn) !== -1;
    const g = $("#goalToggle");
    g.setAttribute("aria-pressed", String(isGoal || forcedFinale));
    g.disabled = forcedFinale;
    const tg = E.traineeGoals(state, sc).find((x) => x.turn === state.turn);
    const raceName = tg ? tg.label.replace(/^Goal( option)?: /, "") : "";
    g.textContent = forcedFinale ? "★ Finale race" : isGoal ? "★ Goal race" + (tg && tg.forced ? ": " + raceName : "") + " (tap to unmark)" : tg && tg.choice ? "☆ Pick this goal: " + raceName : "☆ Mark goal race";
  }

  function pipsHTML(k, v, label, cls) {
    let h = `<div class="pips ${cls}" role="group" aria-label="${label}"><span class="pip-label">${label}</span><span class="pip-row">`;
    for (let i = 1; i <= PIP_MAX; i++) h += `<button type="button" class="pip ${i <= v ? "on" : ""}" data-pip="${k}" data-v="${i}" aria-label="${label} ${i}" aria-pressed="${i <= v}"></button>`;
    return h + `<b class="pip-n">${v}</b></span></div>`;
  }

  function renderQuickEvents() {
    const box = $("#quickEvents"); if (!box) return;
    const sc = scenario(), slots = (state.deck && state.deck.slots) || [];
    const hello = slots.findIndex((s) => s && H.isHello(D.card(s.id)));
    const hp = hello >= 0 ? H.profile(D.card(slots[hello].id), slots[hello].lb) : null;
    box.hidden = !slots.some(Boolean) && sc.id !== "grandlive";
    const gl = state.gl || {};
    box.innerHTML = `<h3>Event shortcuts</h3>
      ${sc.id === "grandlive" && state.turn >= 5 ? `<div class="row-wrap"><b>Performance</b><button type="button" class="btn ghost small" data-token-all="10">All tokens +10</button><button type="button" class="btn ghost small" data-token-all="5">Link reward +5 all</button>${gl.tokenRewardUndo && gl.tokenRewardUndo.turn === state.turn ? '<button type="button" class="btn ghost small" data-token-reward-undo>Undo token reward</button>' : ""}</div><p class="mini">For rewards actually received. New collaborators' +10 each is automatic after Promo Lives from this version onward; do not add it twice.</p>` : ""}
      ${sc.id === "grandlive" && state.turn >= 5 && hp ? `<div class="row-wrap hello-actual"><button type="button" class="btn" id="lh20Add">Hello +20 lowest</button><select id="lh20Type" aria-label="Awarded token type"><option value="">Lowest (auto)</option>${sc.tokens.map((n,i) => `<option value="${i}">${esc(n)}</option>`).join("")}</select>${hp.card.r === 1 ? '<select id="lhAmount" aria-label="Observed Light Hello tokens"><option value="20">+20</option><option value="10">+10</option></select>' : '<input id="lhAmount" type="hidden" value="20">'}<label class="chk"><input type="checkbox" id="lhMood">Mood +1 too</label>${gl.lh20Undo ? '<button type="button" class="btn ghost small" id="lh20Undo">Undo Hello event</button>' : ""}</div><p class="mini">Tap after Done for an actual event. Also records its Guts and bond. If lowest colors tie, auto uses the first; select the awarded color to override.</p><label class="chk"><input type="checkbox" data-quick-unlock="${hello}" ${slots[hello].dates && slots[hello].dates.unlocked ? "checked" : ""}> Hello outings unlocked</label>` : ""}
      ${slots.some(Boolean) ? `<div class="event-bond-list">${slots.map((sl,i) => { const c = sl && D.card(sl.id); return !c ? "" : `<div class="row-wrap"><span>${esc(shortName(c))}: <b>${Math.round(slotBond(sl))}</b> bond</span>${[5,10].map(n => `<button type="button" class="btn ghost small" data-training-bond="${i}" data-add="${n}" aria-label="+${n} bond for ${esc(c.n)}" ${slotBond(sl) >= 100 ? "disabled" : ""}>+${n} bond</button>`).join("")}</div>`; }).join("")}</div>` : ""}`;
  }

  function facilityHTML(f, idx) {
    const sc = scenario();
    const facInputs = sc.inputs.filter((i) => i.scope === "facility");
    return `
      <fieldset class="fac s-${f.stat}" data-idx="${idx}">
        <legend>${E.STAT_LABELS[f.stat]}</legend>
        <div class="nums">
          <label class="nf" title="Every green number on this training added up, e.g. Speed +20 and Power +10 = 30. Leave blank to use the coach's estimate."><span>Gain (total)</span><input type="number" inputmode="numeric" data-k="gain" min="0" max="400" value="${f.gain != null ? f.gain : ""}" placeholder="auto"></label>
          <label class="nf"><span>Fail %</span><input type="number" inputmode="numeric" data-k="fail" min="0" max="99" value="${f.fail != null ? f.fail : ""}" placeholder="auto"></label>
        </div>
        ${deckOn() ? memberChips(f) : `${pipsHTML("cards", f.cards, "Cards", "c")}
        ${pipsHTML("rainbows", f.rainbows, "Rainbow", "r")}
        ${pipsHTML("unbonded", f.unbonded, "Bond<80", "b")}`}
        ${deckOn() ? "" : `<label class="chk ${f.hint ? "on" : ""}"><input type="checkbox" data-k="hint" ${f.hint ? "checked" : ""}> Hint !</label>`}
        ${levelPicker(f)}
        ${facInputs.map((i) => extraField(i, f.extras)).join("")}
        ${sc.tokenOf ? tokenRow(f, sc) : ""}
      </fieldset>`;
  }


  // Grand Concert: the token(s) this training gives. Prefilled with its usual token and an
  // estimate; type what the training shows and Done adds it to your tokens.
  function tokenRow(f, sc) {
    const g = E.tokenGain(f, state, sc);
    if (!g.length) return "";
    const ex = f.extras || {};
    const unset = key => ex[key] == null || ex[key] === "";
    const help = [g.some((x, i) => unset(i ? "tokType2" : "tokType")) ? "Usual type preselected" : "", g.some((x, i) => unset(i ? "tok2" : "tok")) ? "blank amounts use the formula estimate" : ""].filter(Boolean).join("; ");
    // The picker's left edge takes the token's colour (no separate badge, so it fits narrow columns).
    const sel = (key, cur) => `<select class="t${cur}" data-gltok="${key}" aria-label="Token type">${sc.tokens.map((n, i) => `<option value="${i}" ${cur === i ? "selected" : ""}>${n}</option>`).join("")}</select>`;
    const row = (x, k) => `<div class="tokpick">${sel(k ? "tokType2" : "tokType", x.type)}<input type="number" inputmode="numeric" min="0" max="99" data-gltok="${k ? "tok2" : "tok"}" value="${ex[k ? "tok2" : "tok"] != null ? ex[k ? "tok2" : "tok"] : ""}" placeholder="~${x.amount}" aria-label="Token amount"></div>`;
    return `<div class="tokrow" title="Tokens this training gives. Set the type and amount your screen shows; Done adds them to your tokens.">
      <span class="pip-label">Tokens${g.length > 1 ? " (friendship: 2 types)" : ""}</span>
      ${g.map((x, i) => row(x, i)).join("")}
      ${help ? `<span class="mini">${help}; change if different.</span>` : ""}
    </div>`;
  }

  // ---- Deck (GameTora data) ----
  const cardByLabel = new Map();
  const traineeByLabel = new Map();
  if (HAS_DATA) {
    D.DATA.supports.forEach((c) => cardByLabel.set(D.label(c), c));
    D.DATA.trainees.forEach((t) => traineeByLabel.set(traineeLabel(t), t));
  }

  // Why a card is a focus card: the parts of its early-rainbow score.
  function focusWhy(fc, head) {
    return head + " Specialty Priority " + fc.spec + ": on its own training (where it rainbows) " + Math.round(fc.pSpec * 100) + "% of turns. " +
      (fc.bond >= 80 ? "Already orange." : fc.trainings + " training" + (fc.trainings === 1 ? "" : "s") + " with it to orange (about " + Math.round(fc.T) + " turns).") +
      " Score: own-training chance × 0.92 per turn to orange × (1 + Friendship " + fc.fb + "%) × a little for your stat priority.";
  }

  function traineeLabel(t) { return t.n + " [" + t.t + "]"; }
  function deckOn() { return HAS_DATA && state.deck && state.deck.slots.some(Boolean); }
  function shortName(c) { return c.n.length > 11 ? c.n.split(/[\s.]/)[0] : c.n; }
  function slotBond(sl) {
    const c = D.card(sl.id);
    return sl.bond != null ? sl.bond : D.initialBond(c, D.levelFor(c, sl.lb));
  }

  function bondBucket(b) {
    return b >= 100 ? 100 : b >= 80 ? 80 : b >= 60 ? 60 : 40;
  }

  // ---- Grand Concert songs panel ----
  // The run's token plan: what the songs left to buy cost, what you hold, roughly what training
  // brings in by the Grand Live, and which types you'll run short of (those count most).
  // The token aim: songs to buy, most important first (the ones available now, then the ones
  // that unlock later). Trainings are credited for filling the first song's gap first.
  function tokenAimHTML(sc) {
    const p = E.tokenPlan(state, sc);
    if (!p || !p.queue.length) return "";
    const needs = (short) => short.map((x, i) => (x ? sc.tokens[i] + " " + x : "")).filter(Boolean).join(", ");
    const items = p.queue.slice(0, 6).map((x) => `<li${x.ready ? ' class="ready"' : ""}><b>${esc(x.song.name)}</b> ${x.now
      ? (x.ready ? '<span class="pill c-clear-pick">affordable</span>' : `<span class="mini">needs ${esc(needs(x.short))} more</span>`)
      : `<span class="mini">unlocks turn ${x.song.from}${x.short.some(Boolean) ? ", needs " + esc(needs(x.short)) + " more" : ""}</span>`}</li>`).join("");
    return `<div class="token-aim"><div><b>Token aim</b>, most important first</div><ol>${items}</ol>
      ${p.queue.length > 6 ? `<p class="mini">${p.queue.length - 6} more after these.</p>` : ""}
      <p class="mini">Order: what each song is worth for your stat priority over the rest of the run, with the song plan's picks first and its skips last; songs you can buy now come before ones that unlock later. Each "needs" counts the tokens the songs above it use first, and trainings get credit for filling the top song's gap first.</p></div>`;
  }

  function tokenPlanHTML(sc) {
    const p = E.tokenPlan(state, sc);
    if (!p || !p.songs.length) return "";
    const row = sc.tokens.map((n, i) => {
      const gap = p.short[i] - p.supply[i];
      const cls = gap > 0 ? "short" : p.short[i] > 0.6 * p.supply[i] ? "tight" : "ok";
      return `<tr class="tp-${cls}"><th>${n}</th><td class="num">${p.need[i]}</td><td class="num">${p.have[i]}</td><td class="num">~${Math.round(p.supply[i])}</td><td>${cls === "short" ? "short by ~" + Math.round(gap) : cls === "tight" ? "tight" : "fine"}</td></tr>`;
    }).join("");
    const worst = sc.tokens.map((n, i) => [n, p.short[i] - p.supply[i]]).filter(([, g]) => g > 0).sort((a, b) => b[1] - a[1]).map(([n]) => n);
    return `<details class="token-plan"><summary><b>Token plan</b>: ${p.songs.length} songs left to buy${worst.length ? ` · short on ${worst.join(", ")}` : " · tokens look fine"}</summary>
      <div class="table-wrap"><table class="tp"><thead><tr><th>Token</th><th>Songs left cost</th><th>You have</th><th>Training brings</th><th></th></tr></thead><tbody>${row}</tbody></table></div>
      <p class="mini">Technique lessons the song plan still needs: <b>${p.tech.left}</b> (~${Math.round(p.tech.tokens)} tokens of whatever types the shop asks for), on top of the songs above.</p>
      <p class="mini">Songs left: the ${p.queue.length} priority purchases toward 18 by turn 71. Make Debut! counts, so 17 shop songs meet that threshold. Future carries and token supply are estimates; this period credits a carry only when recorded.</p>
    </details>`;
  }

  // ---- Grand Concert: one section ----
  // The coach's pick, what this half still wants and the next reward, your tokens, your shop
  // (songs first, then techniques), the songs you have, and More (plan, token plan, token aim,
  // every scenario reward). The shop part fills in after the call (it follows the call's pick).
  function currentSongBudgetHTML(sc) {
    const p = E.periodSongBudget(state, sc);
    const plan = E.songPlan(state, sc);
    if (!p || !plan) return "";
    const rows = sc.tokens.map((name, i) => `<tr><th>${esc(name)}</th><td>${p.purchaseNeed[i]}</td><td>${p.carry ? p.carry.cost[i] : 0}</td><td>${p.have[i]}</td><td>${p.short[i]}</td></tr>`).join("");
    return `<div class="token-plan"><h3>Song purchases and carry reserve</h3>
      <div class="table-wrap"><table class="tp"><thead><tr><th>Token</th><th>Period songs</th><th>Carry reserve</th><th>You have</th><th>Still needed</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="mini">${p.songs.length} projected period purchases. ${p.carry ? `${p.carryObserved ? "Observed" : "Projected"} carry: <b>${esc(p.carry.name)}</b>; buy from turn ${p.buyCarryFrom}.` : "No carry planned."} Reserve both columns before spending spare points. A held selection can cross the concert even if you still need points to buy it.</p>
      <p class="mini">Mark the actual shop offers: later selections are unknown, so projected songs can change. Learn useful training-bonus songs during the run; friendship bonuses activate after the concert.</p>
      ${p.manualHold && plan.bought < plan.target ? `<p class="mini warn">Your chosen carry stops purchases at ${plan.bought} of the guide's ${plan.target} purchased songs. It does not count as learned yet.</p>` : ""}
      <details><summary>Which songs are included?</summary><ul>${p.songs.map(song => `<li>${esc(song.name)} — ${song.cost.map((n,i) => n ? `${n} ${esc(sc.tokens[i])}` : "").filter(Boolean).join(", ")}</li>`).join("") || '<li>No additional current-period purchases planned.</li>'}</ul></details>
      <details><summary>Additional cost to unlock songs</summary><p class="mini">Approximately ${p.techTokens} points for ${p.techLeft} technique lessons, in addition to both song columns. Actual types and costs depend on shop offers.</p></details>
    </div>`;
  }

  function renderSongs() {
    const sc = scenario();
    const panel = $("#songsPanel");
    panel.hidden = !sc.songs;
    if (!sc.songs) return;
    const gl = state.gl;
    const hype = E.hypeStatus(state, sc);
    const learnedN = E.songsLearned(state);
    const goal = E.concertGoal(state);
    const plan = E.songPlan(state, sc);
    const bon = E.songBonuses(state, sc);
    const extras = Object.entries(bon.extra).filter(([, v]) => v).map(([k, v]) => "+" + v + " " + (k === "sp" ? "SP" : E.STAT_LABELS[k])).join(", ");
    const open = (k, def) => (glOpen[k] != null ? glOpen[k] : def) ? " open" : "";
    const status = [
      plan ? `This half: <b>${plan.bought} of ${plan.target}</b> purchased songs (guide target)` : "",
      hype && hype.next != null ? (hype.need ? `<b>${hype.since}/3</b> songs for the live on turn ${hype.next}` : `Hype full for the live on turn ${hype.next} ✓`) : "",
      `<b>${goal.count} of 18</b> ${goal.closed ? "by turn 71" : "for the special concert · deadline turn 71"}`
    ].filter(Boolean).join(" · ");
    const nextR = E.glRewards(state, sc).find((x) => x.status !== "done" && x.status !== "once");
    const mine = Object.entries(gl.songs || {}).map(([id, t]) => [sc.songs.find((x) => x.id === id), t]).filter(([x]) => x).sort((x, y) => x[1] - y[1]);
    const addable = sc.songs.filter((x) => gl.songs[x.id] == null && x.from <= state.turn);
    const helloSlot = state.deck.slots.find((s) => s && H.isHello(D.card(s.id)));
    const hp = helloSlot && H.profile(D.card(helloSlot.id), helloSlot.lb);
    $("#songSummary").textContent = learnedN + " of 22 songs" + (hype && hype.next != null ? " · " + hype.since + "/3 for the live on turn " + hype.next : "");
    $("#songsBody").innerHTML = `
      <div id="glShop"></div>
      <label class="field"><span>Grand Concert priority</span><select id="grandFocus"><option value="songs" ${gl.focus !== "balanced" ? "selected" : ""}>Songs first · fund offered songs, then tokens</option><option value="balanced" ${gl.focus === "balanced" ? "selected" : ""}>Balance stats and songs</option></select></label>
      <div class="gl-status">${status}</div>
      <p class="mini">The free Make Debut! counts toward Hype and the 18-song total, but not the purchased-song guide target. Usual token types are preselected; change them if the game shows a different type.</p>
      ${nextR ? `<div class="gl-next"><b>Next: ${esc(nextR.label)}</b>, turn ${nextR.turn}: ${esc(nextR.short || nextR.gain)}</div>` : ""}
      <div class="tokens">${sc.tokens.map((n, i) => `<label class="nf"><span>${n}</span><input type="number" inputmode="numeric" min="0" max="${E.tokenCap(state, sc)}" data-tok="${i}" value="${gl.tokens[i] || 0}"></label>`).join("")}</div>

      ${state.turn >= (sc.tokensFrom || 5) && hp ? `<details data-keep="hello"${open("hello", false)}><summary>Light Hello · ${D.RARITY[hp.card.r]} LB${helloSlot.lb} · events and value</summary>
        <p class="mini">Training Effectiveness ${hp.effects[8] || 0}%; normal energy reduction ${hp.effects[28] || 0}%${hp.card.r === 3 ? "; +30 percentage points when she joins a friendship training" : "; no SSR friendship-energy unique"}. Failure Protection ${hp.effects[27]}% reduces the current risk proportionally; it does not remove that many percentage points.</p>
        <p class="mini">First training: Speed +${hp.first.s[0]}, Guts +${hp.first.s[3]}, mood +1, +10 event bond. Outings still require their separate unlock event. Later token events are random: the coach uses a 40% estimate (published estimates 36–45%)${hp.card.r === 1 ? " and a conservative +10 for R because its +10/+20 mixture is unverified" : ", for +8 expected points"}. Expected points are never added by Done.</p>
        <label class="chk"><input type="checkbox" data-hello-met="${state.deck.slots.indexOf(helloSlot)}" ${H.hasMet(helloSlot) ? "checked" : ""}> Already had her first-training event</label>
        <p class="mini">Record after Done has added the training tokens. Adds Guts +${hp.repeat.s[3]} with stat tracking and +7 event bond; the game also gives ${hp.repeat.sp} SP. Do not add that bond twice. Select the actual token type when balances are tied or have changed. Recorded events: ${(gl.helloEvents || []).length}.</p>
      </details>` : ""}
      <p class="mini">Done adds training Performance; Bought pays a song's cost without using a turn. After buying an unrecorded unlock lesson in game, match these balances to the game before recording your next song. Cap ${E.tokenCap(state, sc)}.</p>
      <div id="glCurrentBudget">${currentSongBudgetHTML(sc)}</div>
      <div class="songs-have"><b>Songs you have</b> ${mine.length ? mine.map(([x, t]) => `<span class="have-chip">${esc(x.name)} <button type="button" class="linkish" data-song-rm="${x.id}" aria-label="Remove ${esc(x.name)}">×</button></span>`).join("") : '<span class="mini">none yet</span>'}
        ${addable.length ? `<label class="mini song-learned-turn">Learned turn <input id="songAddTurn" type="number" min="5" max="${state.turn}" value="${state.turn}" aria-label="Turn the existing song was learned"></label><select id="songAdd" aria-label="Add a song you already have"><option value="">+ add a song you already have</option>${addable.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select>` : ""}
        <span class="mini">For an existing song, enter its actual learned turn before adding it. This changes neither tokens nor current stats.</span></div>
      <details class="gl-more" data-keep="more"${open("more", false)}><summary>More: song plan, token plan, token aim, scenario rewards</summary>
        ${songPlanHTML(sc)}
        <div class="mini">Active now: ${extras || "no extra stat gains from songs yet"}${bon.fb ? ` · Friendship +${bon.fb}%` : ""}${bon.pendingFb ? ` · +${bon.pendingFb}% Friendship after the next live` : ""}</div>
        ${tokenPlanHTML(sc)}
        ${tokenAimHTML(sc)}
        ${rewardsHTML(sc)}
      </details>`;
  }

  // What the scenario gives at fixed points, with what you've done toward each so far.
  function rewardsHTML(sc) {
    const list = E.glRewards(state, sc);
    if (!list.length) return "";
    const chip = { done: "done", now: "this turn", next: "", once: "once" };
    return `<div class="rewards"><b>Scenario rewards</b>
      <ol class="reward-list">${list.map((x) => `<li class="rw-${x.status}">
        <div class="rw-head"><span class="rw-turn">Turn ${x.turn}${x.status === "once" ? "+" : ""}</span> <b>${esc(x.label)}</b>${chip[x.status] ? ` <span class="chip">${chip[x.status]}</span>` : ""}</div>
        <div class="mini">${esc(x.gain)}</div>
        ${x.sofar && x.status !== "once" ? `<div class="rw-sofar">${esc(x.sofar)}</div>` : ""}
      </li>`).join("")}</ol>
      <p class="mini">Done adds Make Debut!'s tokens going into turn 5, GIRLS' LEGEND U's stats after turn 71, and each live's stats (with "Add training gains" on). Friendship bonuses activate after their concert.</p>
    </div>`;
  }

  // The song plan for this half year (no technique counter: the songs you've bought set it).
  function songPlanHTML(sc) {
    const plan = E.songPlan(state, sc);
    if (!plan) return `<div class="song-plan mini">Song plan starts on turn 5, when lessons open. Year one: 5 songs, then carry the 6th over to after the 1st Promo Live.</div>`;
    return `<div class="song-plan">
      <div><b>Guide target to the ${plan.last ? "Grand Live" : "live on turn " + plan.live}:</b> ${plan.target} purchased songs${plan.last ? "" : ", then carry 1 over"} · bought: <b>${plan.bought}</b></div>
      <div class="plan-next">${esc(plan.text)}</div>
      ${plan.period > 0 && !plan.carried && state.turn <= 71 ? '<div class="mini">No carried song recorded for this period: technique budgets use the normal lesson pattern.</div>' : ""}
      ${budgetHTML(sc)}
    </div>`;
  }

  // This half's token budget: the songs the plan still wants (and the techniques before them),
  // against what you hold and what training should bring by the next live.
  function budgetHTML(sc) {
    const p = E.tokenPlan(state, sc);
    const h = p && p.half;
    if (!h || h.need <= 0) return "";
    const short = h.gap > 0;
    return `<div class="plan-budget${short ? " short" : ""}">Points to fund this period's purchases, unlock lessons and carry: ~${Math.round(h.need)}${h.carryTokens ? ` (including ${h.carryTokens} reserved for the carried song)` : ""} · you have ${Math.round(h.have)} · estimated training supply ~${Math.round(h.supply)} by turn ${h.live}${short ? ` · <b>total shortfall ~${Math.round(h.gap)}</b>` : ""}. Check the color budget too; total points alone do not establish affordability.</div>`;
  }

  function planTag(id) {
    const plan = E.songPlan(state, scenario());
    if (!plan) return "";
    if (plan.focus.indexOf(id) !== -1) return '<span class="pill c-clear-pick">aim for this</span>';
    if (plan.avoid.indexOf(id) !== -1) return '<span class="pill c-close-call">skip in year one</span>';
    return "";
  }

  // Your shop, songs first: tick what it shows and the coach says which one to get (the call's
  // own pick when it buys one with the turn). Bought takes the tokens and counts the song or
  // technique; Undo takes it back.
  function renderShop() {
    const sc = scenario();
    const box = $("#glShop");
    if (!sc.songs || !box) return;
    const open = (k, def) => (glOpen[k] != null ? glOpen[k] : def) ? " open" : "";
    if (state.turn < (sc.tokensFrom || 5)) {
      box.innerHTML = `<div class="tech-get">Your lesson shop opens on turn ${sc.tokensFrom || 5}, with the free song Make Debut! (+10 of every token). Then tick what it shows here and the coach says which to get.</div>`;
      return;
    }
    const ls = state.gl ? E.lessonShop(state, sc) : null;
    if (!ls) { box.innerHTML = ""; return; }
    const callTech = rec && rec.action && rec.action.tech;
    const callSong = rec && rec.action && rec.action.song;
    const pk = ls.pick;
    // The one to get: what the call buys with the turn, else the shop's pick.
    const getSong = callSong ? ls.songs.find((x) => x.song.id === callSong.id) : pk && pk.kind === "song" ? pk.item : null;
    const getTech = getSong ? null : callTech ? ls.items.find((t) => t.id === callTech.id) : pk && (pk.kind === "tech" ? pk.item : pk.tech) || null;
    const hold = pk && pk.kind === "hold" ? pk.item : null;
    const chips = (c) => c.map((n, i) => (n ? `<span class="tok t${i}">${sc.tokens[i].slice(0, 2)} ${n}</span>` : "")).join("");
    const costText = (c) => c.map((n, i) => (n ? n + " " + sc.tokens[i] : "")).filter(Boolean).join(" + ");
    const tCost = (t) => (t.cost ? costText(t.cost) : t.any + " " + (t.type != null ? sc.tokens[t.type] : "of the type shown"));
    const tCostHTML = (t) => t.cost ? chips(t.cost)
      : t.offered ? `<span class="tok-any">${t.any}</span><select class="tech-type${t.type != null ? " t" + t.type : ""}" data-tech-type="${t.id}" aria-label="Token type the shop shows"><option value="">type?</option>${sc.tokens.map((n, i) => `<option value="${i}" ${t.type === i ? "selected" : ""}>${n}</option>`).join("")}</select>`
        : `<span class="tok-any">${t.any} any</span>`;
    const tag = (id) => { const pl = ls.songPlan; return !pl ? "" : pl.focus.indexOf(id) !== -1 ? ' <span class="pill c-clear-pick">pick</span>' : pl.avoid.indexOf(id) !== -1 ? ' <span class="pill c-close-call">skip</span>' : ""; };
    const songRow = (x) => `<div class="shop-row song-row${getSong && getSong.id === x.id ? " best" : ""}${hold && hold.id === x.id ? " held" : ""}${x.offered ? " on" : ""}${x.afford ? "" : " cant"}">
        <label class="tech-pick"><input type="checkbox" data-tech-offer="${x.id}" ${x.offered ? "checked" : ""}><span class="tech-name">${esc(x.song.name)}${tag(x.song.id)}</span></label>
        <span class="tech-cost">${chips(x.song.cost)}</span>
        <div class="song-actions">
        <button type="button" class="btn ghost small" data-song-buy="${x.song.id}">Bought</button>
        ${ls.songPlan && !ls.songPlan.last ? E.heldSong(state, sc) && E.heldSong(state, sc).id === x.song.id ? '<button type="button" class="btn ghost small" data-song-release>Release hold</button>' : `<button type="button" class="btn ghost small" data-song-hold="${x.song.id}" ${x.offered ? "" : "disabled"}>Hold after concert</button>` : ""}
        </div>
      </div>`;
    const techRow = (t) => `<div class="shop-row${getTech && getTech.id === t.id ? " best" : ""}${t.offered ? " on" : ""}${t.afford ? "" : " cant"}">
        <label class="tech-pick"><input type="checkbox" data-tech-offer="${t.id}" ${t.offered ? "checked" : ""}><span class="tech-name">${esc(t.label)}</span></label>
        <span class="tech-cost">${tCostHTML(t)}</span>
        <button type="button" class="btn ghost small" data-tech-buy="${t.id}" ${t.afford && (!t.any || t.type != null) ? "" : "disabled"}>Bought</button>
      </div>`;
    const shownTechs = ls.techs.filter((t, i) => t.offered || i < 4);
    const moreTechs = ls.techs.filter((t, i) => !(t.offered || i < 4));
    const lb = state.gl.lastBuy && state.gl.lastBuy.turn === state.turn ? state.gl.lastBuy : null;
    const phaseText = ls.phase === "songs" ? "Songs first: techniques make songs show up, so the coach picks ones that keep your next song's tokens."
      : ls.phase === "hold" ? "The period target is met. Usually carry the next song; buy earlier when its estimated bonus before the following concert is worth more than the lesson saved."
        : "Song plan done: spare tokens go to stat techniques.";
    let get;
    if (getSong) get = `<b>Get: ${esc(getSong.song.name)}</b> (${esc(costText(getSong.song.cost))})${getSong.why.length ? ": " + esc(getSong.why.join(", ")) : ""}.`;
    else if (hold) get = `<b>Hold ${esc(hold.song.name)}</b>: buy from turn ${ls.songPlan.live + 1}, after the live. Keep this selection unchanged; buying another lesson replaces it.`;
    else if (getTech) get = `<b>Get: ${esc(getTech.label)}</b> (${esc(tCost(getTech))})${callTech ? ", with this turn's call" : ""}${getTech.why.length ? ": " + esc(getTech.why.join(", ")) : ""}.`;
    else if (ls.items.some((t) => t.needsType)) get = "Select the Performance type shown for your checked technique before the coach can price it.";
    else if (ls.offered || ls.songsOffered) get = "No purchase recommended right now: keep training for useful Performance.";
    else if (state.gl.focus === "songs") get = "Use lessons during the run: techniques unlock songs without spending a turn. Mark actual offers for advice, buy useful training-bonus songs early, and keep the song/carry reserve below. Record techniques under Advanced when needed.";
    else get = `Tick what your shop shows.${ls.ifOffered.length ? ` If it has them: <b>${ls.ifOffered.map((t) => esc(t.label)).join("</b>, <b>")}</b>.` : ""}`;
    $("#songSummary").textContent = getSong ? "Get: " + getSong.song.name : hold ? "Hold " + hold.song.name + (getTech ? " · get " + getTech.label : "") : getTech ? "Get: " + getTech.label : E.songsLearned(state) + " of 22 songs";
    box.innerHTML = `
      ${songBalanceFix && !state.gl.songs[songBalanceFix] ? `<div class="purchase-fix mini warn">The coach's balance cannot pay this song. Holding only changes advice. Match the five balances to the game before recording a purchase, or if you already bought it: <button type="button" class="btn ghost small" data-song-owned="${songBalanceFix}">Already bought in game · record owned</button><p>This records the current learned turn, clears the old selection and leaves tokens/stats unchanged.</p></div>` : ""}
      <div class="tech-get">${get}${lb ? ` <button type="button" class="btn ghost small" data-tech-undo>Undo ${esc(lb.label)}</button>` : ""}</div>
      <div class="shop">
        <div class="tech-head"><b>Your shop</b> <span class="mini">tick what it shows, tap Bought when you buy</span></div>
        <details class="shop-part" data-keep="songs"${open("songs", ls.songsOffered > 0)}><summary>Songs (${ls.songs.length})${ls.songsOffered ? ` · ${ls.songsOffered} ticked` : " · open it when your shop shows songs"}</summary>
          <div class="tech-list">${ls.songs.map(songRow).join("")}</div></details>
        <details class="shop-part advanced-techniques" data-keep="techs"${open("techs", false)}><summary>Advanced: record an actual technique or recovery lesson</summary>
          <div class="tech-list">${shownTechs.map(techRow).join("")}</div>
          ${moreTechs.length ? `<details class="tech-more" data-keep="alltechs"${open("alltechs", false)}><summary>${moreTechs.length} more</summary><div class="tech-list">${moreTechs.map(techRow).join("")}</div></details>` : ""}
        </details>
        <p class="mini">${phaseText}</p>
      </div>`;
  }

  // Token typing only refreshes the token aim, so the box keeps focus.
  function renderSongsLight() {
    const budget = $("#glCurrentBudget");
    if (budget) budget.innerHTML = currentSongBudgetHTML(scenario());
    const el = $("#songsBody .token-aim");
    if (!el) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = tokenAimHTML(scenario());
    if (tmp.firstElementChild) el.replaceWith(tmp.firstElementChild); else el.remove();
  }

  function renderConditions() {
    const active = C.list.filter((x) => C.has(state, x.id));
    const item = (x) => `<label class="chip-toggle" title="${esc(x.text)}"><input type="checkbox" data-condition="${x.id}" ${C.has(state, x.id) ? "checked" : ""}>${esc(x.name)}</label>`;
    const count = active.length + (state.badCondition ? 1 : 0);
    $("#conditionsSummary").textContent = count ? "· " + count + " active" : "· none selected";
    $("#conditionsBody").innerHTML = `<div class="row-wrap"><b>Good</b>${C.list.filter((x) => x.good && !x.special).map(item).join("")}</div><div class="row-wrap"><b>Bad</b>${C.list.filter((x) => !x.good && !x.special && x.id !== "poor").map(item).join("")}</div><details><summary>Character and other version conditions</summary><div class="row-wrap">${C.list.filter((x) => x.special).map(item).join("")}</div></details>${active.length ? `<ul class="mini">${active.map((x) => `<li><b>${esc(x.name)}:</b> ${esc(x.text)}</li>`).join("")}</ul>` : ""}<p class="mini">Select conditions actually shown by the game. Random energy and mood losses are recorded with the controls above. Character conditions follow their own career events. Failure percentages you type already include conditions.</p>`;
  }

  function renderFacilities() {
    $("#facilities").innerHTML = state.facilities.map(facilityHTML).join("");
    // Bonds come from logged turns; a run picked up partway has estimates that are too low.
    const stale = deckOn() && state.turn > 12 && (state.log || []).length < state.turn / 2;
    $("#facHelp").innerHTML = deckOn()
      ? (stale ? "<b>Bonds may be off:</b> you've logged fewer turns than you've played, so the coach's bonds are estimates. If the game shows a rainbow the coach doesn't, set <b>Rainbow (as in game)</b> on that training (it fixes the card's bond), or set each card's gauge under <b>Trainee and deck</b>. " : "") +
        "Tap your cards on each training: once = here, twice = here with a hint <b>!</b>, three times = gone. A gold ring means friendship there; if it doesn't match the game, set <b>Rainbow (as in game)</b>. Add <b>Others</b> for characters not in your deck. Gains come from your cards' real effects. Typing the real total gain still wins, and teaches the coach this scenario's extra bonuses."
      : "Tap the dots to set <b>Cards</b> on the training, <b>Rainbow</b> (friendship) cards and cards with <b>Bond under 80</b>. Leave <b>Gain</b> and <b>Fail</b> blank and the coach estimates them. Typing the real total gain (the green numbers added up) makes the call much sharper. For exact gains, set your deck under <b>Trainee and deck</b>.";
  }

  function memberChips(f) {
    const sc = scenario();
    const chips = state.deck.slots.map((sl, si) => {
      if (!sl) return "";
      const c = D.card(sl.id);
      const bond = slotBond(sl);
      const on = (f.members || []).indexOf(si) !== -1;
      const hint = on && (f.hints || []).indexOf(si) !== -1;
      const rb = D.isRainbow(c, bond, f.stat);
      // Every chip keeps the same size from turn to turn: name (cut short if needed), then the bond.
      return `<button type="button" class="mchip ty-${c.ty}${on ? " on" : ""}${rb ? " rb" : ""}${hint ? " hint" : ""}" data-member="${si}" aria-pressed="${on}" title="${esc(D.label(c))} · bond ${Math.round(bond)}${rb ? " · friendship here" : ""} · tap again to mark a hint (!)">${hint ? '<b class="bang">!</b>' : ""}<span class="mname">${esc(shortName(c))}</span><small class="${bond >= 80 ? "full" : ""}">${Math.round(bond)}</small></button>`;
    }).join("");
    const rbNow = rainbowCount(f);
    return `<div class="mchips" role="group" aria-label="Your cards on this training">${chips}</div>
      ${pipsHTML("extra", f.extra || 0, "Others (not in deck)", "c")}
      ${(f.members || []).length ? pipsHTML("rbmark", rbNow, "Rainbow (as in game)", "r") : ""}`;
  }

  // Rainbow cards on a training, from the cards' bonds.
  function rainbowCount(f) {
    return (f.members || []).filter((si) => { const sl = state.deck.slots[si]; const c = sl && D.card(sl.id); return c && D.isRainbow(c, slotBond(sl), f.stat); }).length;
  }

  // The game shows how many rainbows a training has; when that differs from the bonds the coach
  // tracks, fix the bonds (a rainbow card is at 80+, a card that could rainbow here but doesn't
  // is under 80), so this turn and the ones after it come out right.
  function setRainbows(f, v) {
    const here = (f.members || []).map((si) => ({ sl: state.deck.slots[si] })).filter((x) => x.sl && D.card(x.sl.id))
      .map((x) => Object.assign(x, { c: D.card(x.sl.id), bond: slotBond(x.sl) }));
    const can = here.filter((x) => D.isRainbow(x.c, 100, f.stat));
    const now = can.filter((x) => D.isRainbow(x.c, x.bond, f.stat));
    if (v > now.length) {
      can.filter((x) => now.indexOf(x) === -1).sort((a, b) => b.bond - a.bond).slice(0, v - now.length).forEach((x) => { x.sl.bond = Math.max(x.bond, 80); });
      if (v > can.length) flash("Only " + can.length + " card(s) here can rainbow on " + E.STAT_LABELS[f.stat] + ": a card rainbows on its own type's training. Add the right cards first.");
    } else if (v < now.length) {
      now.sort((a, b) => a.bond - b.bond).slice(0, now.length - v).forEach((x) => { x.sl.bond = 79; });
    }
  }

  // "Auto" follows the scenario's rule; the title explains where the number comes from.
  function levelPicker(f) {
    const sc = scenario();
    const auto = E.facLevelFor(Object.assign({}, state, { facLevels: {} }), sc, f.stat);
    const cur = state.facLevels[f.stat] || 0;
    const why = sc.levelRule === "rank" ? "Unity Cup: follows your team rank for this stat (F/G 1, D/E 2, B/C 3, A 4, S 5); pick it from your team screen"
      : sc.levelRule === "discipline" ? "U.A.F.: follows the sport's level (1-19 Lv1, 20s Lv2, 30s Lv3, 40s Lv4, 50+ Lv5)"
      : "Counted from your logged trainings (every 4 raise it), with skipped turns estimated. The game shows the real level on the training button.";
    return `<label class="nf lv" title="${esc(why)}"><span>Facility level</span><select data-lv="1"><option value="0">Auto (${auto})</option>${[1, 2, 3, 4, 5].map((l) => `<option value="${l}" ${cur === l ? "selected" : ""}>Lv ${l}</option>`).join("")}</select></label>`;
  }

  function keyEffects(c, level) {
    const fx = D.baseEffects(c, level);
    const order = [1, 8, 2, 15, 19, 14, 30, 3, 4, 5, 6, 7, 41, 27, 28, 31, 18, 17];
    const parts = order.filter((id) => fx[id]).map((id) => `<span class="fx"><b>${FX_SHORT[id]}</b> ${D.formatEffect(id, fx[id])}</span>`);
    const cond = D.conditionalUniques(c, level).map((u) => `<span class="fx uq">${esc(D.uniqueText(u))}</span>`);
    const locked = c.u && c.u.lv > level ? `<span class="fx dim">Unique effect unlocks at Lv ${c.u.lv}</span>` : "";
    return parts.concat(cond).join("") + locked;
  }

  function fillLists() {
    if (!HAS_DATA) return;
    const g = state.deck.globalOnly;
    const own = state.deck.ownedOnly && ownedIds().length;
    const cards = D.DATA.supports.filter((c) => (!g || D.onGlobal(c, TODAY)) && (!own || owned[c.id] != null)).sort((a, b) => b.r - a.r || a.n.localeCompare(b.n));
    $("#cardList").innerHTML = cards.map((c) => `<option value="${esc(D.label(c))}"></option>`).join("");
    $("#cardListAll").innerHTML = D.DATA.supports.filter((c) => !g || D.onGlobal(c, TODAY)).sort((a, b) => b.r - a.r || a.n.localeCompare(b.n)).map((c) => `<option value="${esc(D.label(c))}"></option>`).join("");
    const ts = D.DATA.trainees.filter((t) => !g || D.onGlobal(t, TODAY)).sort((a, b) => a.n.localeCompare(b.n));
    $("#traineeList").innerHTML = ts.map((t) => `<option value="${esc(traineeLabel(t))}"></option>`).join("");
  }

  function aptChips(t) {
    const grp = (from, to) => APT.slice(from, to).map((n, i) => `<span class="apt apt-${t.apt[from + i]}"><i>${n}</i>${t.apt[from + i]}</span>`).join("");
    return `<div class="apts">${grp(0, 2)}<span class="sep"></span>${grp(2, 6)}<span class="sep"></span>${grp(6, 10)}</div>`;
  }

  function growthText(t) {
    const g = E.STATS.map((s, i) => (t.g[i] ? "+" + t.g[i] + "% " + E.STAT_LABELS[s] : "")).filter(Boolean);
    return g.length ? g.join(", ") : "no growth bonus";
  }

  // Re-rendering the deck must not steal the field the user just moved into.
  function renderDeck() {
    if (!HAS_DATA) return;
    const a = document.activeElement;
    const keep = a && a.closest && a.closest("#deckPanel") && Object.keys(a.dataset).length ? Object.entries(a.dataset)[0] : a && a.id === "traineeInput" ? ["id", "traineeInput"] : null;
    renderDeckInner();
    if (keep) {
      const el = keep[0] === "id" ? $("#" + keep[1]) : $("#deckPanel [data-" + keep[0].replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()) + '="' + keep[1] + '"]');
      if (el) el.focus();
    }
  }

  function renderDeckInner() {
    const dk = state.deck;
    $("#globalOnly").checked = !!dk.globalOnly;
    $("#ownedOnly").checked = !!dk.ownedOnly;
    const t = dk.trainee ? D.trainee(dk.trainee) : null;
    $("#traineeInput").value = t ? traineeLabel(t) : "";
    if (t) {
      const sug = D.suggestBuild(t);
      $("#traineeInfo").innerHTML = `${aptChips(t)}
        <div class="mini">Growth: <b>${growthText(t)}</b> · Unique skill: <b>${esc(t.us.map((id) => D.DATA.skills[id] || id).join(", "))}</b></div>
        ${sug !== state.build ? `<button type="button" class="btn ghost small" data-build="${sug}">Use suggested build: ${E.BUILDS[sug].label}</button>` : `<span class="mini">Build matches her best distance.</span>`}`;
    } else {
      $("#traineeInfo").innerHTML = `<span class="mini">Pick your trainee to apply her growth bonuses and get a build suggestion.</span>`;
    }
    const focus = new Map(E.focusCards(E.deckInfo(state), state).map((fc) => [fc.idx, fc]));
    $("#slots").innerHTML = dk.slots.map((sl, i) => {
      const c = sl && D.card(sl.id);
      if (!c) return `<div class="slot empty"><input class="slot-name" data-slot-name="${i}" list="cardList" placeholder="Card ${i + 1}: type a name" autocomplete="off" aria-label="Support card ${i + 1}"></div>`;
      const lvl = D.levelFor(c, sl.lb);
      const bond = slotBond(sl);
      return `<div class="slot ty-${c.ty}">
        <div class="slot-top">
          <span class="tydot" aria-hidden="true"></span>
          <input class="slot-name" data-slot-name="${i}" list="cardList" value="${esc(D.label(c))}" autocomplete="off" aria-label="Support card ${i + 1}">
          <select data-slot-lb="${i}" aria-label="Limit break">${[0, 1, 2, 3, 4].map((lb) => `<option value="${lb}" ${lb === sl.lb ? "selected" : ""}>LB${lb} · Lv${D.levelFor(c, lb)}</option>`).join("")}</select>
          ${focus.has(i) ? (focus.get(i).rank === 1
            ? `<span class="chip focus" title="${esc(focusWhy(focus.get(i), "Main focus: the best early-rainbow card. Getting one card to friendship (80, orange) is a must, so the coach pushes hard for every training it's on."))}">${bond >= 80 ? "Focus 1 ✓" : "Focus 1 (must)"}</span>`
            : `<span class="chip focus focus2" title="${esc(focusWhy(focus.get(i), "Second focus: the next best. A small push toward orange, never over extra song tokens."))}">${bond >= 80 ? "Focus 2 ✓" : "Focus 2"}</span>`) : ""}
          <label class="bond${bond >= 80 ? " full" : ""}"><span>Bond</span><input type="number" inputmode="numeric" data-slot-bond="${i}" min="0" max="100" value="${Math.round(bond)}"></label>
          <button type="button" class="btn ghost small square" data-slot-clear="${i}" aria-label="Remove card">✕</button>
        </div>
        <div class="slot-bond" role="group" aria-label="Set bond">
          <span class="mini">Gauge</span>
          ${GAUGE.map(([n, v, cls]) => `<button type="button" class="gauge ${cls}${bondBucket(bond) === v ? " on" : ""}" data-bondset="${i}" data-v="${v}" title="Set bond to ${v}${v < 100 ? "+" : ""}">${n}</button>`).join("")}
          <span class="mini">Event</span>
          <button type="button" class="btn ghost small" data-bondadd="${i}" data-v="5">+5</button>
          <button type="button" class="btn ghost small" data-bondadd="${i}" data-v="10">+10</button>
          <span class="mini" title="Total bond from this card's events in a career${D.eventRewards(c).known ? "" : " (estimate: this card isn't in the event table yet)"}">Events: +${D.eventRewards(c).bond} bond total${D.eventRewards(c).known ? "" : " (est.)"}</span>
        </div>
        ${c.ty === "friend" || c.ty === "group" ? `<div class="slot-dates">
          <label class="chip-toggle small"><input type="checkbox" data-date-unlock="${i}" ${sl.dates && sl.dates.unlocked ? "checked" : ""}> Outings unlocked</label>
          <span class="mini">Outings done: <b>${(sl.dates && sl.dates.done) || 0}</b>${E.dateCard(c.id) ? " of " + E.dateCard(c.id).dates.length : ""}</span>
          <button type="button" class="btn ghost small square" data-date-adj="${i}" data-v="-1" aria-label="One fewer outing">−</button>
          <button type="button" class="btn ghost small square" data-date-adj="${i}" data-v="1" aria-label="One more outing">+</button>
          ${datesHTML(c, sl)}
        </div>` : ""}
        ${eventsHTML(c, sl)}
        <div class="slot-fx">${keyEffects(c, lvl)}</div>
      </div>`;
    }).join("");
    const used = dk.slots.filter(Boolean).length;
    const info = E.deckInfo(state);
    $("#deckSummary").textContent = (t ? t.n + " · " : "") + (used ? used + " card" + (used > 1 ? "s" : "") + (info ? " · race bonus " + info.raceBonus + "%" : "") : "Optional: set your deck for exact gains");
    if (!used && !t) $("#deckPanel").open = $("#deckPanel").open || false;
  }

  // Picking a trainee also loads her career goals into the turn plan.
  function setTrainee(id) {
    state.deck.trainee = id;
    state.goalsOff = [];
    commit(true);
    if (!id) { flash("Trainee cleared"); return; }
    const goals = E.traineeGoals(state, scenario()).filter((g) => g.forced).length;
    flash(D.trainee(id).n + " set as trainee" + (goals ? " · " + goals + " goal races marked" : ""));
  }

  function clearSlot(i) {
    state.deck.slots[i] = null;
    state.facilities.forEach((f) => { f.members = (f.members || []).filter((m) => m !== i); });
    commit(true);
  }

  function addToDeck(id) {
    const i = state.deck.slots.findIndex((x) => !x);
    if (i < 0) { flash("Your deck is full. Remove a card first."); return; }
    const lb = ownedLb(id) != null ? ownedLb(id) : 4;
    state.deck.slots[i] = { id, lb, bond: null };
    commit(true);
    flash(D.card(id).n + " added to slot " + (i + 1) + " (LB" + lb + "; change it in Trainee and deck)");
  }

  // ---- Support card and trainee browser ----
  function db() {
    if (!state.db) state.db = { q: "", type: "", rarity: "", lb: "4", sort: "1", global: true, open: null, limit: 60, tq: "", tsort: "name" };
    if (state.db.own == null) state.db.own = "";
    return state.db;
  }

  const SORTS = [["1", "Friendship"], ["8", "Training effectiveness"], ["2", "Mood effect"], ["19", "Specialty priority"], ["15", "Race bonus"], ["14", "Initial bond"], ["30", "Skill point bonus"], ["stat", "Stat bonuses"], ["evbond", "Event bond"], ["new", "Newest"]];

  function dbControls() {
    const d = db();
    const opt = (pairs, v) => pairs.map(([k, l]) => `<option value="${k}" ${String(v) === k ? "selected" : ""}>${l}</option>`).join("");
    if (state.tab === "cards") {
      return `${collectionPanel()}<div class="db-controls">
        <label class="field grow"><span>Search</span><input data-db="q" value="${esc(d.q)}" placeholder="Name or title" autocomplete="off"></label>
        <label class="field"><span>Type</span><select data-db="type">${opt([["", "All"], ["speed", "Speed"], ["stamina", "Stamina"], ["power", "Power"], ["guts", "Guts"], ["wit", "Wit"], ["friend", "Friend"], ["group", "Group"]], d.type)}</select></label>
        <label class="field"><span>Rarity</span><select data-db="rarity">${opt([["", "All"], ["3", "SSR"], ["2", "SR"], ["1", "R"]], d.rarity)}</select></label>
        <label class="field"><span>Collection</span><select data-db="own">${opt([["", "All cards"], ["yes", "Cards I own"], ["no", "Cards I don't own"]], d.own)}</select></label>
        <label class="field"><span>Limit break</span><select data-db="lb">${opt([["0", "LB0"], ["1", "LB1"], ["2", "LB2"], ["3", "LB3"], ["4", "LB4 (max)"], ["own", "Mine (owned LB)"]], d.lb)}</select></label>
        <label class="field"><span>Sort by</span><select data-db="sort">${opt(SORTS, d.sort)}</select></label>
        <label class="chip-toggle"><input type="checkbox" data-db="global" ${d.global ? "checked" : ""}> Global only</label>
        <span class="mini">New card out on Global but missing? Untick Global only, open the card and press <b>Mark as out on Global</b>.</span>
      </div><div id="dbList"></div>`;
    }
    return `<div class="db-controls">
      <label class="field grow"><span>Search</span><input data-db="tq" value="${esc(d.tq)}" placeholder="Name or title" autocomplete="off"></label>
      <label class="field"><span>Best distance</span><select data-db="tdist">${opt([["", "Any"], ["2", "Sprint"], ["3", "Mile"], ["4", "Medium"], ["5", "Long"], ["1", "Dirt"]], d.tdist || "")}</select></label>
      <label class="chip-toggle"><input type="checkbox" data-db="global" ${d.global ? "checked" : ""}> Global only</label>
    </div><div id="dbList"></div>`;
  }

  function renderDbList() {
    const el = $("#dbList");
    if (!el) return;
    const d = db();
    if (state.tab === "cards") {
      const q = d.q.trim().toLowerCase();
      let list = D.DATA.supports.filter((c) =>
        (!d.global || D.onGlobal(c, TODAY)) && (!d.type || c.ty === d.type) && (!d.rarity || c.r === +d.rarity) &&
        (!d.own || (d.own === "yes") === (owned[c.id] != null)) &&
        (!q || (c.n + " " + c.t).toLowerCase().indexOf(q) !== -1));
      const lvOf = (c) => D.levelFor(c, d.lb === "own" ? (ownedLb(c.id) != null ? ownedLb(c.id) : 4) : +d.lb);
      const key = (c) => {
        const fx = D.baseEffects(c, lvOf(c));
        if (d.sort === "stat") return [3, 4, 5, 6, 7, 41].reduce((a, id) => a + (fx[id] || 0), 0);
        if (d.sort === "new") return (d.global ? c.en : c.jp) || "";
        if (d.sort === "evbond") return D.eventRewards(c).bond;
        return fx[+d.sort] || 0;
      };
      list = list.map((c) => [c, key(c)]).sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : b[0].r - a[0].r)).map((x) => x[0]);
      const shown = list.slice(0, d.limit);
      el.innerHTML = `<p class="mini">${list.length} card${list.length === 1 ? "" : "s"}. Values at ${d.lb === "own" ? "your limit break (LB4 for cards you don't own)" : ["LB0", "LB1", "LB2", "LB3", "LB4"][+d.lb]}. Tap a card for every limit break, its skills and its unique effect.</p>
        <div class="cardgrid">${shown.map((c) => cardRow(c, lvOf(c), d.open === c.id)).join("")}</div>
        ${list.length > shown.length ? `<button type="button" class="btn ghost" data-more="1">Show more (${list.length - shown.length} left)</button>` : ""}`;
    } else {
      const q = (d.tq || "").trim().toLowerCase();
      const rank = (g) => "GFEDCBAS".indexOf(g);
      let list = D.DATA.trainees.filter((t) => (!d.global || D.onGlobal(t, TODAY)) && (!q || (t.n + " " + t.t).toLowerCase().indexOf(q) !== -1));
      if (d.tdist) list = list.filter((t) => rank(t.apt[+d.tdist]) >= rank("A"));
      list.sort((a, b) => a.n.localeCompare(b.n));
      el.innerHTML = `<p class="mini">${list.length} trainee${list.length === 1 ? "" : "s"}.</p>
        <div class="table-wrap"><table class="trainees"><thead><tr><th>Trainee</th><th>Aptitudes (surface · distance · style)</th><th>Growth</th><th>Unique skill</th><th></th></tr></thead><tbody>
        ${list.map((t) => `<tr${state.deck.trainee === t.id ? ' class="cur"' : ""}><td><b>${esc(t.n)}</b><div class="jp">${esc(t.t)} · ${"★".repeat(t.r)}${t.en ? " · Global " + t.en : " · JP " + t.jp}</div></td><td>${aptChips(t)}</td><td>${growthText(t)}</td><td>${esc(t.us.map((id) => D.DATA.skills[id] || id).join(", "))}</td><td><button type="button" class="btn ghost small" data-use-trainee="${t.id}">Use</button></td></tr>`).join("")}
        </tbody></table></div>`;
    }
  }

  function ownedSummary() {
    const ids = ownedIds();
    if (!ids.length) return "No cards marked yet";
    const ssr = ids.filter((id) => D.card(id).r === 3).length;
    const mlb = ids.filter((id) => owned[id] === 4).length;
    return ids.length + " owned · " + ssr + " SSR · " + mlb + " at max limit break";
  }

  function collectionPanel() {
    return `<details class="panel collection" id="collPanel" ${ownedIds().length ? "" : "open"}>
      <summary><h2>My cards</h2><span class="mini" id="collCount">${ownedSummary()}</span></summary>
      <div class="coll-body">
        <p class="mini">Mark the cards you own and their limit break. The deck optimizer uses them, and picking a card for your deck starts it at your limit break. Saved in this browser only, so keep a backup code if you switch devices.</p>
        <div class="row-wrap">
          <label class="field grow"><span>Quick add</span><input id="ownAddName" list="cardListAll" placeholder="Type a card name" autocomplete="off"></label>
          <label class="field"><span>Limit break</span><select id="ownAddLb">${[0, 1, 2, 3, 4].map((lb) => `<option value="${lb}" ${lb === 4 ? "selected" : ""}>LB${lb}</option>`).join("")}</select></label>
          <button type="button" class="btn small" id="ownAddBtn">Add</button>
        </div>
        <div class="row-wrap">
          <button type="button" class="btn ghost small" id="ownExport">Copy backup code</button>
          <label class="field grow"><span>Restore from a backup code</span><input id="ownImportCode" placeholder="UMA1:..." autocomplete="off"></label>
          <button type="button" class="btn ghost small" id="ownImport">Restore</button>
        </div>
        <textarea id="ownCodeOut" class="codebox" readonly hidden aria-label="Backup code"></textarea>
      </div>
    </details>`;
  }

  function setOwned(id, lb) {
    if (lb == null || lb === "") delete owned[id]; else owned[id] = +lb;
    saveOwned();
    const el = $("#collCount");
    if (el) el.textContent = ownedSummary();
    if (state.deck.ownedOnly) fillLists();
  }

  function eventText(c) {
    const ev = D.eventRewards(c);
    const parts = E.STATS.map((st, i) => (ev.stats[i] ? E.STAT_LABELS[st] + " " + (ev.stats[i] > 0 ? "+" : "") + ev.stats[i] : "")).filter(Boolean);
    if (ev.sp) parts.push((ev.sp > 0 ? "+" : "") + ev.sp + " SP");
    if (ev.energy) parts.push((ev.energy > 0 ? "+" : "") + ev.energy + " energy");
    parts.push("<b>bond +" + ev.bond + "</b>");
    return parts.join(", ") + (ev.known ? "" : " (estimate: not in the event table yet)");
  }

  function cardRow(c, level, open) {
    const inDeck = state.deck.slots.some((sl) => sl && sl.id === c.id);
    let detail = "";
    if (open) {
      const ids = new Set();
      [0, 4].forEach((lb) => Object.keys(D.baseEffects(c, D.levelFor(c, lb))).forEach((k) => ids.add(+k)));
      const rows = Array.from(ids).sort((a, b) => a - b).map((id) => `<tr><th scope="row">${esc(D.effectName(id))}</th>${[0, 1, 2, 3, 4].map((lb) => { const v = D.baseEffects(c, D.levelFor(c, lb))[id]; return `<td class="num">${v ? D.formatEffect(id, v) : "–"}</td>`; }).join("")}</tr>`).join("");
      const uq = c.u ? `<p class="mini"><b>Unique effect (Lv ${c.u.lv}+):</b> ${c.u.e.map((u) => (u.type >= 100 && u.type !== 9991 ? esc(D.uniqueText(u)) : esc(D.effectName(u.type)) + " +" + u.value)).join("; ")}</p>` : "";
      const sk = (ids2) => ids2.map((id) => esc(D.DATA.skills[id] || "#" + id)).join(", ") || "none";
      detail = `<div class="card-detail">
        <div class="table-wrap"><table class="lbtable"><thead><tr><th>Effect</th>${[0, 1, 2, 3, 4].map((lb) => `<th>LB${lb}<br><span class="mini">Lv${D.levelFor(c, lb)}</span></th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
        ${uq}
        <p class="mini"><b>Events over a career:</b> ${eventText(c)}</p>
        <p class="mini"><b>Hint skills:</b> ${sk(c.hs)}</p>
        <p class="mini"><b>Event skills:</b> ${sk(c.es)}</p>
        <p class="mini">Released JP ${esc(c.jp || "?")}${c.en ? ", Global " + esc(c.en) + (c.enMarked ? " (marked by you)" : "") : ", not on Global yet in the card data (" + esc(D.DATA.meta.built) + ")"} · ${esc(c.src || "")}
          ${!c.en || c.enMarked ? `<button type="button" class="btn ghost small" data-mark-global="${c.id}">${c.enMarked ? "Unmark: not out on Global" : "Mark as out on Global"}</button>` : ""}</p>
      </div>`;
    }
    const own = ownedLb(c.id);
    return `<div class="cardrow ty-${c.ty}${open ? " open" : ""}${own != null ? " owned" : ""}">
      <button type="button" class="cardrow-head" data-db-row="${c.id}" aria-expanded="${open}">
        <span class="tydot" aria-hidden="true"></span>
        <span class="cardname"><b>${esc(c.n)}</b> <span class="mini">${esc(c.t)}</span></span>
        <span class="rar r${c.r}">${D.RARITY[c.r]}</span>
      </button>
      <div class="slot-fx">${keyEffects(c, level)}</div>
      ${detail}
      <div class="cardrow-actions">
        <label class="own"><span>Owned</span><select data-own="${c.id}" aria-label="Do you own ${esc(c.n)}?"><option value="">No</option>${[0, 1, 2, 3, 4].map((lb) => `<option value="${lb}" ${own === lb ? "selected" : ""}>LB${lb}${lb === 4 ? " (max)" : ""}</option>`).join("")}</select></label>
        <button type="button" class="btn ghost small" data-add-card="${c.id}" ${inDeck ? "disabled" : ""}>${inDeck ? "In deck" : "Add to deck"}</button>
      </div>
    </div>`;
  }

  // A card's training events (Umamusume Wiki): its chain, then its other events, with what each
  // choice gives at this card's LB and the best choice for this turn marked.
  function eventsHTML(c, sl) {
    const ev = E.cardEvents(c.id, sl.lb, scenario());
    if (!ev) return "";
    const friend = c.ty === "friend" || c.ty === "group";
    // Friend and group chains are their outings, listed under Outings.
    const lists = [[friend && E.dateCard(c.id) ? [] : ev.chain, "Chain"], [ev.other, "Other events"]].filter(([l]) => l.length);
    if (!lists.length) return "";
    const total = lists.reduce((a, [l]) => a + l.length, 0);
    const known = lists.reduce((a, [l]) => a + l.filter((e) => e.c).length, 0);
    const sc = scenario();
    const item = (e, n, chain) => {
      const head = `<b>${esc(e.n)}</b>${chain ? ` <span class="mini">(${n + 1}/${ev.chain.length})</span>` : ""}`;
      if (!e.c) return `<li>${head} <span class="mini">· no results on the wiki yet</span></li>`;
      const ranked = E.rankEventChoices(state, sc, e, sl.lb);
      const best = ranked.length > 1 && ranked[0].value - ranked[1].value > 0.5 ? ranked[0].i : null;
      const rows = e.c.map((ch, i) => {
        const r = ranked.find((x) => x.i === i);
        return `<div class="ev-choice${i === best ? " best" : ""}">${e.c.length > 1 ? `<span class="ev-label">${i === best ? "★ " : ""}${esc(ch.t || "Choice " + (i + 1))}</span> ` : ""}${esc(r ? r.text : "")}</div>`;
      }).join("");
      return `<li>${head}${rows}</li>`;
    };
    return `<details class="events"><summary>Events (${total}${known < total ? ", " + known + " with results" : ""})</summary>
      ${lists.map(([l, name]) => `<div class="mini ev-sec">${name}</div><ol class="ev-list">${l.map((e, n) => item(e, n, name === "Chain")).join("")}</ol>`).join("")}
      <p class="mini">★ is the better choice for this turn. Ranges are by LB, shown at this card's. From the <a href="https://umamusu.wiki/" target="_blank" rel="noopener">Umamusume Wiki</a> (CC BY-SA 4.0).</p>
    </details>`;
  }

  // A friend or group card's outings (game8 values): how they unlock, then each outing.
  function datesHTML(c, sl) {
    const info = E.dateCard(c.id);
    if (!info) return `<p class="mini dates-note">No outing data for this card yet; the coach uses typical values.</p>`;
    const u = info.unlock;
    const k = E.dateScale({ card: c, level: D.levelFor(c, sl.lb) }, info);
    const how = u.auto ? `Outings unlock with the event “${esc(u.name)}” (no choice).`
      : u.both ? `Outings unlock with the event “${esc(u.name)}”, whichever choice you pick.`
      : `Outings unlock with the event “${esc(u.name)}”: take the choice that gives ${esc(E.dateText(E.scaleDate(u.keep, k)))}. The other (${esc(E.dateText(E.scaleDate(u.lose, k)))}) locks them.`;
    const done = (sl.dates && sl.dates.done) || 0;
    const card = { card: c, level: D.levelFor(c, sl.lb) };
    const ev = E.cardEvents(c.id, sl.lb, scenario());
    const names = ev && ev.chain.length === info.dates.length ? ev.chain.map((e) => e.n) : [];
    const row = (d0, n) => {
      const d = d0 && E.scaleDate(d0, k);
      const text = d ? (d.roll ? esc(E.dateText(d)) : d.opts.map((o) => esc(E.dateText(o))).join(" <i>or</i> ")) : "not listed on game8";
      return (names[n] ? `<b>${esc(names[n])}</b>: ` : "") + text;
    };
    const lv = info.unscaled ? "base rewards scaled once with this card's Event Recovery and Event Effectiveness, rounded down" : "rescaled to this card's LB" + (info.lv ? "" : " (game8 doesn't state its level; taken as full limit break)");
    return `<details class="dates"><summary>Outings (${info.dates.length})</summary>
      <p class="mini">${how}${u.note ? " " + esc(u.note) : ""}</p>
      <ol class="dates-list">${info.dates.map((d, n) => `<li class="${n < done ? "done" : n === done ? "next" : ""}">${row(d, n)}</li>`).join("")}</ol>
      <p class="mini">Values from <a href="${info.unscaled ? "https://gamewith.jp/uma-musume/article/show/360446" : "https://game8.jp/umamusume/" + info.page}" target="_blank" rel="noopener">${info.unscaled ? "GameWith (cross-checked with game8 and Wiki)" : "game8"}</a>, ${lv}${info.partial ? "; game8 lists only some of this card's outings" : ""}.</p>
    </details>`;
  }

  function extraField(i, bag) {
    const v = bag[i.id] != null ? bag[i.id] : (i.default != null ? i.default : (i.type === "check" ? false : i.type === "select" ? i.options[0][0] : 0));
    const help = i.help ? ` title="${esc(i.help)}"` : "";
    if (i.type === "check") return `<label class="chk sc ${v ? "on" : ""}"${help}><input type="checkbox" data-extra="${i.id}" ${v ? "checked" : ""}> ${esc(i.label)}</label>`;
    if (i.type === "select") return `<label class="nf sc"${help}><span>${esc(i.label)}</span><select data-extra="${i.id}">${i.options.map(([val, lab]) => `<option value="${val}" ${String(v) === String(val) ? "selected" : ""}>${esc(lab)}</option>`).join("")}</select></label>`;
    return `<label class="nf sc"${help}><span>${esc(i.label)}</span><input type="number" inputmode="numeric" data-extra="${i.id}" min="0" max="${i.max || 99}" value="${v}"></label>`;
  }

  function renderInputs() {
    const sc = scenario();
    $("#scenario").value = sc.id;
    $("#build").value = state.build;
    $("#risk").value = state.risk;
    $("#raceBonus").value = state.raceBonus || 0;
    $("#maxEnergy").value = state.maxEnergy;
    $("#resetMode").value = state.resetMode || "ace";
    $("#energy").max = state.maxEnergy;
    $("#energy").value = state.energy;
    $("#energyNum").value = state.energy;
    // This turn's races that fit the trainee, then the generic grades.
    const races = E.racesAt(state, state.turn);
    const fans = (x) => Math.round(E.expectedFans(state, x)).toLocaleString("en-US");
    $("#race").innerHTML = `<option value="">None</option>${races.length ? `<optgroup label="Races this turn">${races.map((r) => `<option value="named:${esc(r.n)}">${E.GRADE_LABEL[r.g]} ${esc(r.n)} · ${r.d}m ${r.s === 2 ? "dirt" : "turf"} · ~${fans(r)} fans</option>`).join("")}</optgroup>` : ""}<optgroup label="Other"><option value="op">OP / Pre-OP</option><option value="g3">G3</option><option value="g2">G2</option><option value="g1">G1</option></optgroup>`;
    $("#race").value = state.raceName && races.some((r) => r.n === state.raceName) ? "named:" + state.raceName : state.race || "";
    if (document.activeElement !== $("#fans")) $("#fans").value = state.fans || "";
    $("#badCondition").checked = !!state.badCondition;
    $("#practicePoor").checked = C.has(state, "poor");
    renderConditions();
    $("#trackStats").checked = !!state.trackStats;

    const turnInputs = sc.inputs.filter((i) => i.scope === "turn" && i.id !== "lh20");
    // Trackblazer's Grade Point box shows the coach's running count.
    const gp = sc.gradePoints ? E.gradePlan(state, sc) : null;
    const bag = gp ? Object.assign({}, state.extras, { gpNeed: gp.need }) : state.extras;
    $("#turnExtras").innerHTML = turnInputs.length ? `<div class="extras-head">${esc(sc.name)}</div>` + turnInputs.map((i) => extraField(i, bag)).join("") : "";
    $("#turnExtras").hidden = !turnInputs.length;
    renderFacilities();
    renderQuickEvents();
    renderDeck();
    renderSongs();

    const build = E.BUILDS[state.build];
    const tg = state.targets || {};
    const sparks = state.sparks || {};
    const capNow = E.capsFor(Object.assign({}, state, { caps: {} }), sc);
    $("#statTable").innerHTML = `<thead><tr><th>Stat</th><th>Current</th><th title="Stars of each blue spark for this stat from your parents and their parents, like 3 3 2. Each raises the cap: 1 star +4, 2 stars +9, 3 stars +16.">Sparks ★</th><th title="The most this stat can reach: the scenario's base cap plus your spark uncaps. Type the cap your game shows to override it.">Cap<small>limit</small></th><th title="Where you want this stat for your build. The coach values a stat less once it's past this.">Target<small>goal</small></th></tr></thead><tbody>${E.STATS.map((s, i) => `
      <tr class="s-${s}"><th scope="row">${E.STAT_LABELS[s]}</th>
        <td><input type="number" inputmode="numeric" data-stat="${s}" data-kind="cur" min="0" max="2500" value="${state.stats[s] || ""}" placeholder="—" aria-label="Current ${E.STAT_LABELS[s]}"></td>
        <td><input type="text" inputmode="numeric" class="sparks" data-stat="${s}" data-kind="sparks" value="${esc(sparks[s] || "")}" placeholder="3 2" aria-label="${E.STAT_LABELS[s]} blue spark stars"></td>
        <td><input type="number" inputmode="numeric" data-stat="${s}" data-kind="cap" min="0" max="2500" value="${state.caps[s] || ""}" placeholder="${capNow[s]}" title="Base ${sc.caps[i]}${capNow[s] > sc.caps[i] ? " + " + (capNow[s] - sc.caps[i]) + " from sparks" : ""}" aria-label="${E.STAT_LABELS[s]} cap"></td>
        <td><input type="number" inputmode="numeric" data-stat="${s}" data-kind="target" min="0" max="2500" value="${tg[s] || ""}" placeholder="${Math.min(build.target[s], state.caps[s] || capNow[s])}" aria-label="${E.STAT_LABELS[s]} target"></td></tr>`).join("")}</tbody>`;
    $("#prioRow").innerHTML = prioHTML(build);
    $("#statNote").textContent = "Cap is the game's limit for each stat in " + sc.name + ": training can't take it higher (blue sparks and some events raise it). Target is your goal for a " + build.label + " build: past it the coach values that stat less. A target above the cap counts as the cap. Stats over 1200 count half in races, so most targets stop near 1200.";
  }

  // Stat priority: five boxes, most important first. Picking a stat for a rank moves it there
  // and shifts the others. The build's order until you change one.
  function prioHTML(build) {
    const mine = Array.isArray(state.priority) && state.priority.length === 5;
    const order = mine ? state.priority : E.buildPriority(state.build);
    return `<span class="mini"><b>Stat priority</b>, most important first${mine ? "" : ` (now the ${esc(build.label)} build's order)`}. The coach fills stats in this order, each up to its target.</span>
      <div class="prio-row">${order.map((st, i) => `${i ? '<span class="prio-gt" aria-hidden="true">›</span>' : ""}<label class="prio-f"><span class="sr-only">${["1st", "2nd", "3rd", "4th", "5th"][i]}</span><select data-prio="${i}" aria-label="${["1st", "2nd", "3rd", "4th", "5th"][i]} priority">${E.STATS.map((x) => `<option value="${x}" ${x === st ? "selected" : ""}>${E.STAT_LABELS[x]}</option>`).join("")}</select></label>`).join("")}
      ${mine ? '<button type="button" class="btn ghost small" id="prioReset">Use the build\'s order</button>' : ""}</div>`;
  }

  function syncLight() {
    $("#riskOut").textContent = state.risk + "%";
    const info = E.deckInfo(state);
    $("#raceBonus").disabled = !!info;
    if (info) $("#raceBonus").value = info.raceBonus;
    $("#energyOut").textContent = state.energy + " / " + state.maxEnergy;
    $$("#mood [data-mood]").forEach((b) => b.setAttribute("aria-checked", String(+b.dataset.mood === state.mood)));
    $("#exampleNote").hidden = !state.example;
    const c = E.calibFactor(state);
    const fc = (state.fcal || []).filter((x) => x > 0).sort((a, b) => a - b);
    $("#calibNote").textContent = ((state.calib || []).length >= 3
      ? "Learned from your gains: your trainings run at " + Math.round(c * 100) + "% of a typical " + scenario().name + " deck."
      : "Enter real gains on 3 or more turns and the coach learns how strong your deck is.") +
      (E.deckInfo(state) && fc.length >= 2 ? " With your deck set, the gains you typed put this scenario's bonuses at " + Math.round(Math.min(1.6, Math.max(0.7, fc[Math.floor(fc.length / 2)])) * 100) + "% of the coach's estimate. If that looks off, press Forget learned deck strength." : "");
    const tg = $("#turnExtras");
    $$("label.chk", tg).forEach((l) => { const i = $("input", l); if (i) l.classList.toggle("on", i.checked); });
  }

  // Shows the coach's estimate inside blank Gain/Fail boxes.
  function syncPlaceholders() {
    const trains = rec.ranked.filter((o) => o.kind === "train" && !o.prefix.some((p) => /Charm/.test(p)));
    $$("#facilities [data-idx]").forEach((box) => {
      const f = state.facilities[+box.dataset.idx];
      const o = trains.find((x) => x.stat === f.stat);
      if (!o) return;
      $('[data-k="gain"]', box).placeholder = "~" + Math.round(o.gain);
      $('[data-k="fail"]', box).placeholder = "~" + o.fail;
    });
  }

  // The report box keeps what you typed while the coach re-renders.
  let reportOpen = false;
  let reportWhy = "";
  let runWhy = "";
  document.addEventListener("toggle", (e) => { if (e.target.id === "report") reportOpen = e.target.open; }, true);
  document.addEventListener("input", (e) => { if (e.target.id === "reportWhy") reportWhy = e.target.value; });
  document.addEventListener("input", (e) => { if (e.target.matches("[data-run-why]")) runWhy = e.target.value; });
  document.addEventListener("click", (e) => {
    const button = e.target.closest("[data-run-copy], [data-run-download]");
    if (!button) return;
    const box = button.closest("[data-run-export]");
    const note = box.querySelector("[data-run-why], #reportWhy");
    const report = R.build(state, scenario(), note ? note.value : "", rec);
    const out = box.querySelector("[data-run-output]");
    const text = R.format(report, scenario());
    out.hidden = false; out.value = text;
    if (button.hasAttribute("data-run-download")) {
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = "uma-run-" + scenario().id + "-turn-" + state.turn + ".json";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      flash("Run report downloaded");
      return;
    }
    try { navigator.clipboard.writeText(text).then(() => flash("Full run report copied: paste it to me"), () => { out.select(); flash("Select the report and copy it"); }); } catch (_) { out.select(); flash("Select the report and copy it"); }
  });

  // Everything needed to check a call: the turn's inputs, deck, tokens and every option's score.
  // ---- Reset check: questions, then reset or finish the run, with a run summary ----
  let rcWhy = "";
  let rcOpen = false;
  document.addEventListener("toggle", (e) => { if (e.target.id === "rcSummary") rcOpen = e.target.open; }, true);
  document.addEventListener("input", (e) => { if (e.target.id === "rcWhy") rcWhy = e.target.value; });
  const RC_HEAD = { reset: "Reset this run", warn: "This run is behind", ask: "Reset check: answer to decide", done: "Run finished", continued: "Finishing this run", wait: "Reset check coming up", ok: "Run check: keep going" };
  function rcQuestionHTML(it, q) {
    const id = it.key + "|" + q.id;
    const shown = (v) => (v === "yes" ? "Yes" : v === "no" ? "No" : String(v));
    // The coach answered it from what it tracks; "Not right?" lets you answer it yourself.
    if (q.auto && !rcFix[id]) {
      return `<div class="rc-q rc-auto"><span class="rc-qt">${esc(q.text)}</span> <span class="rc-known">${esc(shown(q.answer))}</span>${q.guessWhy ? ` <span class="mini">(${esc(q.guessWhy)})</span>` : ""} <button type="button" class="linkish" data-rc-fix="${id}">Not right?</button></div>`;
    }
    const guess = q.guess != null && q.answer == null ? `<span class="mini rc-guess">Coach's guess: ${esc(shown(q.guess))}${q.guessWhy ? " (" + esc(q.guessWhy) + ")" : ""}</span>` : "";
    const ctl = q.type === "number"
      ? `<input type="number" inputmode="numeric" min="0" max="30" class="rc-num" data-rc-num="${id}" value="${q.answer != null ? q.answer : ""}" placeholder="${q.guess != null ? q.guess : ""}" aria-label="${esc(q.text)}">`
      : (q.type === "choice" ? q.options : [["yes", "Yes"], ["no", "No"]]).map(([v, l]) => `<button type="button" class="btn ghost small rc-ans" data-rc-ans="${id}|${v}" aria-pressed="${String(q.answer) === v}">${esc(l)}</button>`).join("");
    return `<div class="rc-q"><span class="rc-qt">${esc(q.text)}</span><span class="rc-ctl">${ctl}</span>${guess}</div>`;
  }
  // Reset questions you chose to answer yourself instead of the coach's own count.
  const rcFix = {};
  function runBoxHTML(rc) {
    if (!rc) return "";
    const open = rc.items.filter((it) => it.status === "reset" || it.status === "warn");
    const summary = open.length || rc.items.some((it) => it.status === "done");
    return `<div class="runcheck rc-${rc.verdict}" ${rc.verdict === "reset" ? 'role="alert"' : ""}>
      <div class="rc-head">${esc(RC_HEAD[rc.verdict])}</div>
      ${rc.items.map((it) => `<div class="rc-item rc-${it.status}"><div><b>${esc(it.label)}:</b> ${esc(it.why)}</div>
        ${it.questions && it.status !== "wait" && it.status !== "continued" ? it.questions.map((q) => rcQuestionHTML(it, q)).join("") : ""}</div>`).join("")}
      ${open.length ? `<div class="rc-actions">
          <button type="button" class="btn small rc-reset-btn" id="rcNew">Reset: start a new career</button>
          <button type="button" class="btn ghost small" data-rc-continue="${open.map((it) => it.key).join(",")}">Continue and finish this run</button>
        </div>` : ""}
      ${summary ? `<details class="rc-summary" id="rcSummary" ${rcOpen || open.length ? "open" : ""}><summary>Run summary</summary>
          <p class="mini">Copy it and paste it to me: it has this run's checks and your answers, stats, deck, songs and every turn you logged, so the coach can be fixed.</p>
          <textarea id="rcWhy" rows="2" placeholder="Anything that went wrong in this run?">${esc(rcWhy)}</textarea>
          <button type="button" class="btn ghost small" id="rcCopy">Copy run summary</button>
          <textarea id="rcOut" rows="4" readonly hidden></textarea>
        </details>` : ""}
    </div>`;
  }
  function rcAnswer(key, qid, value) {
    state.runChecks = state.runChecks || {};
    const e = (state.runChecks[key] = state.runChecks[key] || {});
    e.a = e.a || {};
    if (value === null) delete e.a[qid]; else e.a[qid] = value;
    // Light Hello's +20 event is also the box under the scenario's turn inputs.
    if (qid === "lh20") state.extras.lh20 = value === "yes";
    commit(true);
  }

  // The whole run so far, for the coach to be fixed: a short readable recap, then the data.
  function runSummary(why) {
    return R.format(R.build(state, scenario(), why, rec), scenario());
  }

  function turnReport(why) {
    const sc = scenario();
    const typ = rec.typ || 1;
    const r2 = (x) => Math.round((x / typ) * 100) / 100;
    const name = (si) => { const sl = state.deck.slots[si]; const c = sl && D.card(sl.id); return c ? c.n + " [" + c.t + "]" : "slot " + si; };
    const rep = {
      v: 1, coachBuild: R.VERSION, why: (why || "").trim(), scenario: sc.id, turn: state.turn, when: rec.turn.text, build: state.build,
      energy: state.energy + "/" + (state.maxEnergy || 100), mood: E.MOODS[state.mood], risk: state.risk,
      stats: state.stats, targets: state.targets || {}, priority: state.priority, caps: state.caps, extras: state.extras, fans: state.fans,
      badCondition: !!state.badCondition, practicePoor: !!state.practicePoor, conditions: state.conditions || {},
      learned: { boost: Math.round(E.scenarioBoost(state, sc) * 1000) / 1000, fcal: (state.fcal || []).map((x) => Math.round(x * 100) / 100), calib: (state.calib || []).map((x) => Math.round(x * 100) / 100) },
      gl: state.gl ? { focus: state.gl.focus, tokens: state.gl.tokens, songs: Object.keys(state.gl.songs || {}), lessons: state.gl.lessons, shop: state.gl.shop } : undefined,
      deck: (state.deck.slots || []).map((sl) => sl && sl.id ? { card: name(state.deck.slots.indexOf(sl)), id: sl.id, lb: sl.lb, bond: Math.round(slotBond(sl)), dates: sl.dates } : null),
      trainings: state.facilities.map((f) => ({ stat: f.stat, cards: (f.members || []).map(name), hints: (f.hints || []).map(name), others: f.extra || 0, gain: f.gain, fail: f.fail, extras: f.extras })),
      pick: (rec.action.prefix || []).concat([rec.action.label]).join(" → "),
      recoveryComparison: rec.recoveryComparison,
      options: rec.ranked.slice(0, 8).map((o) => ({ label: o.label, score: r2(o.value), parts: Object.fromEntries(Object.entries(o.parts).filter(([, v]) => Math.abs(v) > 0.005 * typ).map(([k, v]) => [k, r2(v)])), gains: o.statGains ? Object.fromEntries(Object.entries(o.statGains).map(([k, v]) => [k, Math.round(v)])) : undefined, gainEstimated: o.gainEst, energyDelta: o.energyDelta, fail: o.fail, failEstimated: o.failEst, selectionPolicy: o.selectionPolicy, performancePriority: o.performancePriority }))
    };
    return "Uma coach report\n" + JSON.stringify(rep);
  }

  function skillSourcesHTML(skills, coupled = false) {
    const shown = skills.filter((s) => s.eventP != null && s.trainingP != null && (s.eventP > 0 || s.trainingP > 0));
    if (!shown.length) return "";
    const pct = (n) => Math.round(n * 100) + "%";
    return `<details class="pred-help"><summary>Event skills and training hints</summary><p class="mini">${coupled ? "Coupled event percentages are frequencies in these simulated careers; unresolved sources keep availability priors. Training percentages retain their hint-pool approximation. " : ""}Estimated direct hint opportunities for this race. Training hints share a card's hint pool; high Hint Frequency raises their chance. Event skills use separate completion assumptions. The sources can overlap, so their percentages do not add. Hint discounts follow their actual modeled likelihood, rather than assuming the highest hint level always happens.</p><div class="table-wrap"><table><thead><tr><th>Skill</th><th>Event</th><th>Training hint</th><th>Either source</th></tr></thead><tbody>${shown.map((s) => `<tr><th>${skillNameHTML(s.id)}</th><td>${pct(s.eventP)}</td><td>${pct(s.trainingP)}</td><td>${pct(s.sourceP == null ? s.p : s.sourceP)}</td></tr>`).join("")}</tbody></table></div><p class="mini">These are model estimates. Known event choices and success/failure branches are modeled separately. Missing event results retain availability priors. Conditional success is assumed; raw-text conditions and hint-pool sampling remain approximations. Trainee availability and lower tiers unlocked by a gold hint are additional purchase routes.</p></details>`;
  }

  function renderCall() {
    const sc = scenario();
    const explanationOpen = !!($("#callExplanation") && $("#callExplanation").open);
    rec = E.recommend(state, sc);
    renderShop();
    const a = rec.action;
    const kind = a.kind;
    $("#call").className = "panel call k-" + kind + (a.stat ? " s-" + a.stat : "");
    const runBox = runBoxHTML(E.runCheck(state, sc));
    const runner = rec.ranked[1];
    const vs = rec.versus ? rec.versus.policy
      ? `<div class="versus">Compared with <b>${esc(rec.versus.label)}</b>: ${runner && runner.performancePriority ? performanceSummary(runner.performancePriority) : "ordinary score " + score(runner.value)}. The ordering follows ${esc(a.selectionPolicy.objective)}; the ordinary score stays separate.</div>`
      : `<div class="versus">Beats <b>${esc(rec.versus.label)}</b> by ${score(rec.versus.gap)} points, mostly on ${esc(rec.versus.because)}.</div>` : "";
    const outcome = a.outingRoll && a.outingRoll[outingPick === "great" ? 0 : 1];
    const afterEnergy = outcome ? Math.min((state.maxEnergy || 100) + (outcome.me || 0), state.energy + (outcome.e || 0)) : rec.after.energy;
    const afterMood = outcome ? C.moodAfter(state, outcome.mo, outcome.cure || (a.consume && a.consume.cureConditions)) : rec.after.mood;
    const after = a.forced ? "" : `<div class="after">After this: energy about <b>${afterEnergy}</b>, mood <b>${E.MOODS[afterMood]}</b>.</div>`;
    const hype = sc.id === "grandlive" && state.turn >= 5 && state.turn <= 71 ? E.hypeStatus(state, sc) : null;
    const songPlan = hype && E.songPlan(state, sc), held = hype && E.heldSong(state, sc);
    const songProgress = hype ? `<div class="song-progress${hype.need && hype.turnsToLive <= 4 ? " warn" : ""}"><b>Songs: ${E.songsLearned(state)} total</b> · ${hype.since} this concert period${hype.need ? ` · <b>${hype.need} more before the concert on turn ${hype.next}</b>` : " · Hype full"}${songPlan ? ` · ${songPlan.bought}/${songPlan.target} shop purchases (guide target; free song excluded)` : ""}. ${held ? `Holding ${esc(held.name)}: keep the lesson selection unchanged until after the concert.` : "Open lessons during the run; learn useful training-bonus songs early. Bought does not advance the turn."}</div>` : "";
    $("#call").innerHTML = `
      <div class="eyebrow">${esc(rec.turn.text)} · ${esc(rec.phase.name)}</div>
      <div class="headline">${a.prefix.map((p) => `<span class="pre">${esc(p)} →</span>`).join(" ")}<span>${esc(a.label)}</span></div>
      <div class="pill-row"><span class="pill c-${rec.confidence.replaceAll(" ", "-")}">${esc(rec.confidence)}</span>${a.kind === "train" ? `<span class="pill">${a.selectionPolicy ? "ordinary score" : "score"} ${score(a.value)}</span>` : ""}</div>
      ${a.selectionPolicy ? `<div class="rank-reason"><b>#1 · ${esc(a.selectionPolicy.objective)}</b><p class="mini">${esc(a.selectionPolicy.why)}. ${esc(a.selectionPolicy.assumptions)}</p></div>` : ""}
      ${songProgress}
      ${runBox}
      ${rec.reasons.length ? `<p class="mini">${esc(rec.reasons[0])}</p>` : ""}
      ${after}
      ${rec.recoveryComparison ? `<div class="phase" id="recoveryTradeoff"><b>Camp energy choice</b><p class="mini">Wit leaves <b>${rec.recoveryComparison.wit.energyAfter}</b> energy; Rest leaves <b>${rec.recoveryComparison.rest.energyAfter}</b>. ${rec.recoveryComparison.campTurnsAfter} camp turn(s) follow. Wit's ${rec.recoveryComparison.wit.fail}% failure is ${rec.recoveryComparison.wit.failEstimated ? "estimated; enter the game's value" : "entered from the game"}. Reassess each turn.</p>${rec.recoveryComparison.checkEnergyLesson ? '<p class="mini">An affordable Energy lesson can recover energy without using a turn. Mark its actual offer and token type, then recheck the call.</p>' : ""}</div>` : ""}
      <details id="callExplanation" ${explanationOpen ? "open" : ""}><summary>Expand / shorten explanation</summary>
      ${rec.reasons.length ? `<ul class="why">${rec.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${vs}
      ${rec.events.length ? `<div class="events">${rec.events.map((e) => `<div class="ev"><b>${esc(e.label)}</b> ${esc(e.tip || "")}</div>`).join("")}</div>` : ""}
      <div class="phase"><b>${esc(rec.phase.name)}:</b> ${esc(rec.phase.tip)}</div>
      </details>
      ${a.outingRoll ? `<div class="fail-row" role="radiogroup" aria-label="Outing result"><span class="mini">Actual outing result:</span>${[["success", "Success"], ["great", "Great success"]].map(([v, label]) => `<button type="button" class="btn ghost small" data-outing-result="${v}" role="radio" aria-checked="${outingPick === v}">${label}</button>`).join("")}</div><p class="mini">Select the game's result before Done. The energy forecast follows your selected outcome; scoring averages both outcomes with an assumed 50/50 split.</p>` : ""}
      ${kind === "infirmary" ? `<div class="fail-row" role="radiogroup" aria-label="Infirmary result"><span class="mini">Actual treatment:</span>${[["yes", "Cured"], ["no", "Not cured"]].map(([v, l]) => `<button type="button" class="btn ghost small" data-cure-result="${v}" aria-checked="${curePick === (v === "yes")}">${l}</button>`).join("")}</div>` : ""}
      ${kind !== "train" ? '<details><summary>Logging a different training result</summary>' : ""}<div class="fail-row" role="radiogroup" aria-label="Training result"><span class="mini">Training result:</span>${[["", "Success", ""], ["fail", "Failed", "Get Well Soon!: mood -1, -5 to that stat"], ["bad", "Failed badly", "Don't Overdo It! (20%+ failure only): mood -3, -10 to that stat and 2 random stats"]].concat(C.has(state, "slacker") ? [["slacker", "Did not show up", "No training gains, energy cost, bonds or Performance"]] : []).map(([v, l, t]) => `<button type="button" class="btn ghost small" role="radio" data-fail="${v}" aria-checked="${failPick === v}"${t ? ` title="${esc(t)}"` : ""}>${l}</button>`).join("")}
        ${failPick && failPick !== "slacker" && !C.has(state, "poor") ? `<label class="chip-toggle"><input type="checkbox" id="gotPoor" ${poorPick ? "checked" : ""}> Got Practice Poor</label>` : ""}</div>${kind !== "train" ? "</details>" : ""}
      <div class="actions">
        <button type="button" class="btn" id="doneBtn" ${(state.gl && state.gl.pendingConcert) ? "disabled" : ""}>Done, next turn ▶</button>
        ${state.gl && state.gl.pendingConcert ? `<button type="button" class="btn ghost" id="stepStageBtn" title="Resolve the pending concert now. Spend song income from this command, then click to apply concert rewards, set up the carry, and clear the pre-stage.">Step on stage ▶</button>` : ""}
        <button type="button" class="btn ghost" id="undoBtn" ${(state.log || []).length ? "" : "disabled"}>Undo last</button>
      </div>
      <details class="report" id="report" data-run-export ${reportOpen ? "open" : ""}><summary>This call looks wrong?</summary>
        <p class="mini">Say why, then copy the report and paste it to me. It has this turn's inputs, your deck and tokens, and every option's score, so the call can be checked and the coach fixed.</p>
        <textarea id="reportWhy" rows="3" placeholder="e.g. Wit had a rainbow and 2 more cards, I think it beats Power">${esc(reportWhy)}</textarea>
        <div class="row-wrap"><button type="button" class="btn ghost small" id="reportCopy">Copy this turn</button><button type="button" class="btn ghost small" data-run-copy>Copy full run report</button><button type="button" class="btn ghost small" data-run-download>Download run JSON</button></div>
        <textarea id="reportOut" data-run-output rows="4" readonly hidden></textarea>
      </details>`;
    const fp = $("#fanPlan");
    const gp = rec.gradePlan;
    if (rec.fanPlan && rec.fanPlan.status !== "met") {
      fp.hidden = false;
      fp.textContent = E.fanPlanText(rec.fanPlan, sc);
      fp.className = "mini fanplan fp-" + rec.fanPlan.status;
    } else if (gp) {
      // Trackblazer: the Grade Point goal takes the same line (tight reads like an efficient race).
      fp.hidden = false;
      fp.textContent = E.gradePlanText(gp, sc);
      fp.className = "mini fanplan fp-" + ({ tight: "efficient", ok: "wait" }[gp.status] || gp.status);
    } else fp.hidden = true;
    $("#dockText").textContent = (a.prefix.length ? a.prefix.join(" → ") + " → " : "") + a.label;
    $("#dock").className = "dock k-" + kind + (a.stat ? " s-" + a.stat : "");
    $("#coachSummary").textContent = "Turn " + state.turn + " / " + sc.totalTurns + " · " + $("#dockText").textContent;
  }

  const PART_NAMES = { stats: "Stats", sp: "Skill points", bond: "Bonds", hint: "Hint", scenario: "Scenario", tokens: "Song tokens", songFocus: "Songs first preference", energy: "Energy", mood: "Mood", risk: "Failure risk", condition: "Condition", fans: "Fans", item: "Item / buff", goal: "Goal race", opening: "Opening plan" };

  function performanceSummary(p) {
    return (p.offeredGap > 0 ? Math.round(p.completionProbability * 100) + "% to fund an offered song · " + p.offeredGapReduction.toFixed(1) + " cost gap closed · " : "") + p.usable.toFixed(1) + " expected usable tokens" + (p.hello ? " (" + p.hello.toFixed(1) + " from random Hello events)" : "");
  }

  function renderOptions() {
    const top = Math.max(1, ...rec.ranked.filter((o) => o.value < 1e4).map((o) => o.value));
    const policy = rec.action.selectionPolicy;
    const riskOnly = policy && policy.objective === "respect failure limit";
    $("#options").innerHTML = `<h2>All options</h2><p class="mini">${riskOnly ? "Commands within your failure limit rank first, by ordinary score. " : policy ? "Songs first: among trainings within your failure limit and worth at least as much as recovery, prefer the chance to fund an offered song, then its remaining cost reduction, then usable tokens. If no candidate can finish an offered song, prefer usable tokens, then partial cost reduction. Ordinary score breaks ties. " : ""}Tap a row for its breakdown. If you picked something else, press <b>I did this</b> on it.</p><ol class="ranked">${rec.ranked.map((o, i) => {
      const pct = o.value >= 1e4 ? 100 : Math.max(0, Math.round((o.value / top) * 100));
      const open = openRow === i;
      const parts = Object.entries(o.parts).filter(([, v]) => Math.abs(v) >= 0.05 && Math.abs(v) < 1e4);
      const detail = open ? `<div class="detail">
          ${o.kind === "train" ? `<div class="mini">Gain ${o.gainEst ? "≈" : ""}${Math.round(o.gain)} · fail ${o.fail}%${o.failEst ? " (est.)" : ""} · energy ${o.energyDelta > 0 ? "+" : ""}${Math.round(o.energyDelta)}</div>` : ""}
          <ul class="parts">${parts.map(([k, v]) => `<li class="${v < 0 ? "neg" : "pos"}"><span>${PART_NAMES[k] || k}</span><span class="num">${v > 0 ? "+" : ""}${score(v)}</span></li>`).join("")}</ul>
          ${o.notes.length ? `<div class="mini">${o.notes.map(esc).join(" · ")}</div>` : ""}
          <button type="button" class="btn ghost small" data-did="${i}">I did this ▶</button>
        </div>` : "";
      return `<li class="${i === 0 ? "first" : ""} k-${o.kind}${o.stat ? " s-" + o.stat : ""}">
        <button type="button" class="opt" data-row="${i}" aria-expanded="${open}">
          <span class="opt-top"><span><span class="opt-rank">#${i + 1}</span> ${esc((o.prefix.length ? o.prefix.join(" → ") + " → " : "") + o.label)}</span><span class="num">${policy ? "score " : ""}${score(o.value)}</span></span>
          ${policy ? `<span class="opt-metrics">${o.performancePriority ? esc(performanceSummary(o.performancePriority)) : o.kind === "train" ? o.fail > state.risk ? "Above your failure limit" : riskOnly ? "Within your failure limit" : "Ordinary value below recovery" : "Recovery / other command"}</span>` : `<span class="bar"><i style="width:${pct}%"></i></span>`}
        </button>${detail}
      </li>`;
    }).join("")}</ol>`;
  }

  // ---- Champions Meeting / League of Heroes planner: presets, deck optimizer, skills ----
  const P = window.UmaPresets;
  const SV = window.UmaSkillValues;
  const OPT = window.UmaOptimizer;
  const ASSET_V = ((document.currentScript && document.currentScript.src.match(/v=([\w-]+)/)) || [])[1] || "1";
  const STYLES = [["Nige", "Front"], ["Senkou", "Pace"], ["Sasi", "Late"], ["Oikomi", "End"]];
  const STYLE_LABEL = Object.fromEntries(STYLES);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const PASTE_KEY = "uma-skillpaste-v1";
  let pasted = {};
  try { pasted = JSON.parse(localStorage.getItem(PASTE_KEY)) || {}; } catch (e) { pasted = {}; }
  const savePasted = () => { try { localStorage.setItem(PASTE_KEY, JSON.stringify(pasted)); } catch (e) { /* ignore */ } };
  const svCache = {}; // preset id -> { style: [[id, median x100, mean x100]] }, or "loading" / "missing" / "error"
  let optRun = null; // the search in progress: { worker, f }
  let optResult = null; // last result, with the settings it was found for
  let sensitivityJob = null;
  let wish = null; // cards worth getting for optResult
  let wishJob = null;
  let skillLimit = 60;

  const presetById = (id) => (P ? P.list.find((p) => p.id === id) : null);
  const fmtDate = (s) => { const [y, m, d] = s.split("-").map(Number); return MONTHS[m - 1] + " " + d + ", " + y; };
  const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

  function defaultPreset() {
    const next = P.list.filter((p) => p.kind === "cm" && p.global.end >= TODAY);
    return next[0] || P.list[P.list.length - 1];
  }

  // Running style the trainee is best at (Pace on ties), else Pace.
  function defaultStyle() {
    const t = state.deck.trainee ? D.trainee(state.deck.trainee) : null;
    if (!t) return "Senkou";
    const rank = (g) => "GFEDCBAS".indexOf(g);
    let best = 1;
    [0, 1, 2, 3].forEach((i) => { if (rank(t.apt[6 + i]) > rank(t.apt[6 + best])) best = i; });
    return STYLES[best][0];
  }

  function cm() {
    if (!state.cm) state.cm = {};
    const c = state.cm;
    const defaults = { goal: "race", statsW: "0.1", comp: {}, style: defaultStyle(), ownedOnly: true, borrow: true, skillW: "1", runs: "10", locked: [], must: [], targets: {}, independent: false, itManual: "0.5", sq: "", sfilter: "all", globalSkills: true, helloProcRate: "0.4", helloUnlockRate: "0.15", eventSuccessRate: "0.5", eventSongBoost: "0" };
    Object.keys(defaults).forEach((k) => { if (c[k] == null) c[k] = defaults[k]; });
    if (!presetById(c.preset)) c.preset = defaultPreset().id;
    return c;
  }
  // Independent Training's race agenda: the Parents tab's G1 plan when you've sent it over
  // (c.itRaces G1s), else a G1-heavy default. Optional races then take that share of the
  // ~60 turns after the debut.
  const itArg = (c) => (c.independent ? (cm().itRaces != null ? [cm().itRaces, 0, 0] : true) : false);
  const itShare = (c) => (c.independent ? (cm().itRaces != null ? Math.min(0.5, cm().itRaces / 60) : 0.25) : undefined);

  function presetStatus(p) {
    const g = p.global;
    if (g.end < TODAY) return ["ended", "Ended"];
    if (g.start <= TODAY) return ["live", "Running now"];
    const n = daysBetween(TODAY, g.start);
    return ["soon", (g.est ? "About " : "") + (n === 1 ? "starts tomorrow" : "in " + n + " days")];
  }

  function presetLabel(p) {
    return p.name + " · " + p.course.track + " " + p.course.distance + "m " + p.course.surface + " · " + (p.global.est ? "~" : "") + fmtDate(p.global.start);
  }

  function loadSkillValues(id) {
    if (svCache[id]) return;
    if (!SV || SV.ready.indexOf(id) === -1) { svCache[id] = "missing"; return; }
    svCache[id] = "loading";
    fetch("data/skillvalues/" + id + ".json?v=" + ASSET_V)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((j) => { svCache[id] = j; if (state.tab === "cm") renderCM(); if (state.tab === "tiers") renderTiers(); })
      .catch(() => { svCache[id] = "error"; if (state.tab === "cm") renderCM(); });
  }

  const skillInfo = (id) => (SV && SV.skills[id]) || [D.DATA.skills[id] || "#" + id, D.skillCost(id) || 0, 1, 1];

  // Skills ranked by median length gain for a preset and style. Your pasted Umalator results win.
  function skillRows(pid, style) {
    const mine = pasted[pid] && pasted[pid][style];
    if (mine) {
      return Object.entries(mine).map(([id, L]) => ({ id: +id, L, mean: null, mine: true })).sort((a, b) => b.L - a.L);
    }
    const data = svCache[pid];
    if (!data || typeof data === "string" || !data[style]) return [];
    return data[style].map(([id, med, mean]) => ({ id, L: med / 100, mean: mean / 100 }));
  }

  function skillMap(pid, style) {
    const map = {};
    const costs = {};
    skillRows(pid, style).forEach((r) => { map[r.id] = r.L; costs[r.id] = skillInfo(r.id)[1]; });
    return { map, costs };
  }

  // Which cards can give each skill (hint or event), among the cards the optimizer may use.
  function skillSources(c) {
    const out = {};
    const ids = c.ownedOnly && ownedIds().length ? ownedIds() : D.DATA.supports.filter((x) => D.onGlobal(x, TODAY)).map((x) => x.id);
    if (c.goal !== "race") {
      const inventory = window.UmaParentSkills.build(ids.map(id => D.card(id)).filter(card => D.onGlobal(card, TODAY)), {
        skills: SV.skills, purchases: window.UmaSkillPurchases.skills, events: window.UmaCardEvents,
        globalOnly: c.globalSkills, today: TODAY
      });
      inventory.skills.forEach(skill => { out[skill.id] = skill.sources.map(source => D.card(source.card)); });
    } else {
      ids.forEach((id) => {
        const card = D.card(id);
        (card.hs || []).concat(card.es || []).forEach((sk) => { (out[sk] = out[sk] || []).push(card); });
      });
    }
    return out;
  }

  // ---- Euophrys' scoring (shared by the deck optimizer and the tier list) ----
  const T = window.UmaTiers;
  const parentPurchaseRoutes = window.UmaParentPrerequisites.create(window.UmaSkillPurchases.skills);
  let euLoading = false;
  let euOpen = false; // keep the weights panel open across re-renders
  // Euophrys' card data is large, so it loads the first time a ranking needs it.
  function euReady() {
    if (window.EuophrysCards) return true;
    if (!euLoading) {
      euLoading = true;
      const sc = document.createElement("script");
      sc.src = "data/euophrys-cards.js?v=" + ASSET_V;
      sc.onload = () => { if (state.tab === "cm") renderCM(); if (state.tab === "tiers") renderTiers(); };
      sc.onerror = () => { euLoading = false; flash("Couldn't load the tier list data. Check your connection."); };
      document.head.appendChild(sc);
    }
    return false;
  }
  function eu() {
    if (!state.eu) state.eu = { scen: "", over: {} };
    return state.eu;
  }
  const euScen = () => eu().scen || T.FROM_COACH[state.scenario] || "GM";
  const euOver = () => eu().over[euScen()] || (eu().over[euScen()] = { general: {}, tabs: {} });
  function euOpts(c, p) {
    const sv = skillMap(p.id, c.style);
    const o = { scenario: euScen(), overrides: euOver(), trainee: state.deck.trainee, skills: sv.map, costs: sv.costs, skillWeight: +c.skillW, must: (c.must || []).slice(), independent: itArg(c), itManual: +cm().itManual, eventSuccessRate: +c.eventSuccessRate };
    if (c.goal === "ace" || c.goal === "debuff" || c.goal === "debuffAce") {
      o.parent = { targets: T.parentTargets(c.goal, p, c.style, sv.map, window.UmaDebuffs, 0.1, (id) => SV.skills[id] ? SV.skills[id][2] : null), statsWeight: +c.statsW, globalOnly: c.globalSkills, today: TODAY };
      if (c.globalSkills) {
        const released = id => !!(SV.skills[id] && SV.skills[id][3]);
        Object.keys(o.parent.targets).forEach(id => { if (!released(id)) delete o.parent.targets[id]; });
        o.must = o.must.filter(released);
      }
    }
    return o;
  }

  // Euophrys' scenario preset and weights, editable like on its site.
  function euSettingsHTML(ty) {
    const scen = euScen();
    const auto = !eu().scen;
    const tab = T.TABS[ty || "speed"][0];
    const w = T.weightsFor(scen, ty || "speed", Object.assign({}, euOver().general, euOver().tabs[tab]), null, itArg(cm()));
    const num = (k, v, step, path) => `<input type="number" step="${step}" data-eu="${path}" data-k="${k}" value="${v}">`;
    const coachName = (SCENARIOS.find((x) => x.id === state.scenario) || {}).name;
    return `<details class="eu-settings" ${euOpen ? "open" : ""}>
      <summary>Euophrys settings: <b>${esc(T.SCENARIOS.find((x) => x[0] === scen)[1])}</b> preset${auto ? (T.FROM_COACH[state.scenario] ? " (from the coach's scenario)" : ` (${esc(coachName)} isn't in Euophrys' list yet, so Grand Masters, the newest one)`) : ""}${Object.keys(euOver().general).length || Object.keys(euOver().tabs).length ? " · custom weights" : ""}</summary>
      <div class="eu-body">
        <label class="field"><span>Scenario preset</span><select data-eu-scen="1"><option value="">Same as the coach</option>${T.SCENARIOS.map(([k, l]) => `<option value="${k}" ${eu().scen === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
        <div><span class="mini"><b>Stat weights for ${esc(tab === "friend" ? "Friend and Group" : tab === "wisdom" ? "Wit" : tab[0].toUpperCase() + tab.slice(1))} cards</b> (what each point of gain is worth)</span>
          <div class="eu-grid">${["Speed", "Stamina", "Power", "Guts", "Wit", "Skill pts", "Energy"].map((l, i) => `<label class="field"><span>${l}</span>${num(i, w.stats[i], 0.1, "tab:stats")}</label>`).join("")}
            <label class="field"><span>Cap per stat</span>${num("cap", w.cap, 50, "tab")}</label></div></div>
        <div class="row-wrap">
          ${w.prioritize != null ? `<label class="chip-toggle"><input type="checkbox" data-eu="tab" data-k="prioritize" ${w.prioritize ? "checked" : ""}> Prioritize this stat</label>` : ""}
          ${w.onlySummer != null ? `<label class="chip-toggle"><input type="checkbox" data-eu="tab" data-k="onlySummer" ${w.onlySummer ? "checked" : ""}> Only summer rainbows</label>` : ""}
        </div>
        <div class="eu-grid">
          <label class="field"><span>Bond per turn</span>${num("bondPerDay", w.bondPerDay, 1, "general")}</label>
          <label class="field"><span>G1 races</span>${num(0, w.races[0], 1, "general:races")}</label>
          <label class="field"><span>G2/G3 races</span>${num(1, w.races[1], 1, "general:races")}</label>
          <label class="field"><span>OP races</span>${num(2, w.races[2], 1, "general:races")}</label>
          <label class="field"><span>Rainbow multiplier</span>${num("multi", w.multi, 0.05, "general")}</label>
          <label class="field"><span>Mood effect</span>${num("motivation", w.motivation, 0.05, "general")}</label>
        </div>
        <button type="button" class="btn ghost small" id="euReset">Reset to Euophrys' defaults</button>
        <p class="mini">These are Euophrys' own presets and formula (<a href="https://github.com/Euophrys/umamusume-tierlist" target="_blank" rel="noopener">source</a>, MIT). Changes apply to the tier list and the deck optimizer.</p>
      </div>
    </details>`;
  }

  function euInput(el) {
    const [where, field] = el.dataset.eu.split(":");
    const o = euOver();
    const ty = state.tab === "tiers" ? (tier().type || "speed") : "speed";
    const tab = T.TABS[ty][0];
    const bag = where === "tab" ? (o.tabs[tab] = o.tabs[tab] || {}) : o.general;
    const base = T.weightsFor(euScen(), ty, Object.assign({}, o.general, o.tabs[tab]), null, itArg(cm()));
    const v = el.type === "checkbox" ? el.checked : +el.value;
    if (field) { const arr = (bag[field] || base[field]).slice(); arr[+el.dataset.k] = v; bag[field] = arr; }
    else bag[el.dataset.k] = v;
    save();
  }

  function optPool(c) {
    if (c.ownedOnly && ownedIds().length) return ownedIds().filter(id => c.goal === "race" || D.onGlobal(D.card(id), TODAY)).filter((id) => !T.entry || window.EuophrysCards ? T.entry(id, owned[id]) : true).map((id) => ({ id, lb: owned[id] }));
    return D.DATA.supports.filter((x) => D.onGlobal(x, TODAY) && x.r >= 2).map((x) => ({ id: x.id, lb: 4 }));
  }
  const borrowPool = () => D.DATA.supports.filter((x) => D.onGlobal(x, TODAY) && x.r === 3).map((x) => ({ id: x.id, lb: 4 }));

  function optKey() {
    const c = cm();
    return [c.goal, c.goal !== "race" && c.globalSkills, c.statsW, c.preset, c.style, euScen(), JSON.stringify(euOver()), state.deck.trainee, c.ownedOnly, c.borrow, c.skillW, c.locked.join("."), c.must.join("."), JSON.stringify(c.targets), c.independent, cm().itRaces, cm().itManual, c.helloProcRate, c.helloUnlockRate, c.eventSuccessRate, c.eventSongBoost, JSON.stringify(c.comp), ownedCode(), svCache[c.preset] && typeof svCache[c.preset] === "object" ? 1 : 0].join("|");
  }

  function runOptimizer() {
    const c = cm();
    const p = presetById(c.preset);
    if (!euReady()) { flash("Loading the tier list data…"); return; }
    const pool = optPool(c);
    if (pool.length < 6 && !c.borrow) { flash("The optimizer needs at least 6 cards. Mark more owned cards, or untick “Only cards I own”."); return; }
    optRun = { f: 0 };
    renderCM();
    const key = optKey();
    const tg = cmTargets(c);
    // Independent Training parent runs race their agenda (see itShare).
    const raceShare = itShare(c);
    const simulationMeta = { scenario: scenario().id, trainee: state.deck.trainee };
    const done = (r, opts, fit) => {
      // The predicted stats: the target search's own careers, or a readout from the same
      // simulation for Euophrys' pick.
      let est = fit ? fit.after : null;
      if (!est) {
        try {
          const sv = skillMap(p.id, c.style);
          const ctx = OPT.buildCtx({ scenario: scenario(), build: p.build, trainee: state.deck.trainee, caps: E.capsFor(state, scenario()), raceShare, runs: 16, skills: sv.map, costs: sv.costs, helloProcRate: +c.helloProcRate, helloUnlockRate: +c.helloUnlockRate, eventSuccessRate: +c.eventSuccessRate, eventSongBoost: +c.eventSongBoost, must: c.must, independent: !!c.independent, skillBudget: c.goal === "race" });
          est = OPT.simulate(ctx, r.cards.map((x) => ({ card: D.card(x.id), lb: x.lb })));
        } catch (err) { est = null; }
      }
      if (scenario().id === "grandlive" && c.goal === "race" && est) r.skills = est.skills;
      optResult = Object.assign(r, { key, parentConfig: opts.parent ? { targets: opts.parent.targets, must: c.must.slice(), globalOnly: c.globalSkills } : null, goal: c.goal, preset: p.id, style: c.style, scen: euScen(), est, fit, simulationMeta, independent: !!c.independent, link, skillsUsed: Object.keys(opts.parent ? opts.parent.targets : skillMap(p.id, c.style).map).length });
      wish = null;
      optRun = null;
      if (state.tab === "cm") renderCM();
    };
    const fail = (err) => { flash(String(err.message || err)); optRun = null; if (state.tab === "cm") renderCM(); };
    let link = null;
    setTimeout(() => {
      try {
        let bp = c.borrow ? borrowPool() : [];
        const locked = c.locked.slice();
        link = itLink(c, pool, bp);
        if (link && link.lock && locked.indexOf(link.lock) === -1) locked.push(link.lock);
        if (link && link.borrow) bp = [link.borrow];
        const opts = Object.assign(euOpts(c, p), { borrow: c.borrow, locked, comp: Object.assign({}, c.comp) });
        const r = T.buildDeck(opts, pool, bp);
        if (!tg && !(state.scenario === "grandlive" && c.goal === "race")) { done(r, opts, null); return; }
        // Target stats: start from Euophrys' pick and swap cards toward the targets, a slot at
        // a time so the page can show progress.
        const sim = { scenario: scenario(), build: p.build, trainee: state.deck.trainee, target: tg, caps: E.capsFor(state, scenario()), raceShare, helloProcRate: +c.helloProcRate, helloUnlockRate: +c.helloUnlockRate, eventSuccessRate: +c.eventSuccessRate, eventSongBoost: +c.eventSongBoost, must: c.must, independent: !!c.independent };
        const search = OPT.targetSearch(opts, sim, r.cards, pool, bp);
        const tick = () => {
          try {
            let more = true;
            const t0 = Date.now();
            while (more && Date.now() - t0 < 150) more = search.next();
            if (optRun) optRun.f = search.progress();
            const bar = $("#cmProg i");
            if (bar) bar.style.width = Math.round(search.progress() * 100) + "%";
            if (more) { setTimeout(tick, 0); return; }
            const fit = search.result();
            done(T.describeDeck(opts, fit.cards, pool, bp), opts, fit);
          } catch (err) { fail(err); }
        };
        setTimeout(tick, 0);
      } catch (err) { fail(err); }
    }, 30);
  }

  // Independent Training: uma.guide calls the scenario's link card mandatory there (Grand
  // Concert: Light Hello), so she goes in: your best copy is locked in, or she's the borrowed
  // card. Returns what happened, for the result's note, or null when it doesn't apply.
  const IT_LINK = { GL: "Light Hello" };
  function itLink(c, pool, bp) {
    const name = c.independent && IT_LINK[euScen()];
    if (!name) return null;
    if (c.comp.friend === 0) return { name, blocked: true };
    const mine = pool.filter((x) => D.card(x.id).n === name).sort((a, b) => D.card(b.id).r - D.card(a.id).r || b.lb - a.lb)[0];
    if (mine) return { name, lock: mine.id };
    const lend = bp.find((x) => D.card(x.id).n === name);
    if (lend) return { name, borrow: lend, lock: lend.id };
    return { name, missing: true };
  }

  // Your target stats for the optimizer (blank ones take the race build's), or null when none set.
  function cmTargets(c) {
    const t = c.targets || {};
    const set = E.STATS.filter((s) => t[s] > 0);
    if (!set.length) return null;
    const out = {};
    set.forEach((s) => { out[s] = +t[s]; });
    return out;
  }

  // Cards you don't have (or have below LB4) that would beat a card in the deck, for its slot.
  function comparisonDecks(r, c) {
    const key = (cards) => cards.map((x) => x.id + ":" + x.lb + ":" + !!x.borrowed).sort().join(",");
    const candidates = [{ name: "Suggested deck", cards: r.cards }];
    const seen = new Set([key(r.cards)]);
    r.cards.map((card, i) => ({ card, i })).filter(({ card }) => card.alt && !card.alt.losesMust && !c.locked.includes(card.id)).sort((a, b) => (a.card.score - a.card.alt.score) - (b.card.score - b.card.alt.score)).slice(0, 2).forEach(({ card, i }) => {
      const cards = r.cards.map((x, j) => j === i ? { id: card.alt.id, lb: card.alt.lb, borrowed: card.borrowed } : x);
      if (!seen.has(key(cards))) { seen.add(key(cards)); candidates.push({ name: D.card(card.id).n + " → " + D.card(card.alt.id).n, cards }); }
    });
    if (r.fit && r.fit.startCards && !seen.has(key(r.fit.startCards))) candidates.push({ name: "Initial Euophrys deck", cards: r.fit.startCards });
    return candidates;
  }

  function runSensitivity() {
    const r = optResult, c = cm();
    if (!r || r.key !== optKey() || sensitivityJob) return;
    const candidates = comparisonDecks(r, c);
    if (candidates.length < 2) { flash("No eligible alternative: the current slots may be locked."); return; }
    const p = presetById(r.preset), sv = skillMap(p.id, c.style);
    const sim = { scenario: scenario(), build: p.build, trainee: state.deck.trainee, target: cmTargets(c) || undefined, caps: E.capsFor(state, scenario()), skills: sv.map, costs: sv.costs, skillWeight: +c.skillW, must: c.must, helloProcRate: +c.helloProcRate, helloUnlockRate: +c.helloUnlockRate, eventSuccessRate: +c.eventSuccessRate, eventSongBoost: +c.eventSongBoost, independent: !!c.independent, raceShare: itShare(c) };
    const job = OPT.sensitivity(sim, candidates);
    sensitivityJob = job; renderCM();
    const tick = () => {
      if (optResult !== r || r.key !== optKey()) { sensitivityJob = null; if (state.tab === "cm") renderCM(); return; }
      try {
        const more = job.next();
        const progress = $("#sensitivityProgress"); if (progress) progress.textContent = Math.round(job.progress() * 100) + "%";
        if (more) { setTimeout(tick, 0); return; }
        r.sensitivity = job.result(); sensitivityJob = null;
        if (state.tab === "cm") renderCM();
      } catch (err) { sensitivityJob = null; flash(err.message || String(err)); if (state.tab === "cm") renderCM(); }
    };
    setTimeout(tick, 0);
  }

  function sensitivityHTML(r) {
    if (!r.sensitivity) return "";
    const s = r.sensitivity, anyLoss = s.comparisons.some((x) => x.minDelta < -1e-6);
    const number = (n) => (n > 0 ? "+" : "") + n.toFixed(1);
    return `<details class="pred-help" open id="sensitivityResult"><summary>Deck sensitivity check</summary><p class="mini${anyLoss ? " warn" : ""}">${anyLoss ? "The lead changes in at least one check. Compare these decks as close or assumption-dependent options." : "The suggested deck keeps its lead or ties in these checks."} This covers the listed alternatives only. Ranges are model sensitivity, not confidence intervals or proof of the best deck.</p><p class="mini">${s.seeds.length} held-out seeds; ${s.runsPerSeed} careers per deck per seed. Positive gaps favor the suggested deck. Scores use target fit and affordable skill value; SP contributes through the skills it can buy.</p><div class="table-wrap"><table><thead><tr><th>Alternative</th><th>Assumptions</th><th>Mean gap</th><th>Seed range</th><th>Leads</th></tr></thead><tbody>${s.comparisons.map((x) => `<tr><td>${esc(x.candidate)}</td><td>${esc(x.profile)}</td><td>${number(x.meanDelta)}</td><td>${number(x.minDelta)} to ${number(x.maxDelta)}</td><td>${x.wins}/${s.seeds.length}${x.ties ? " · " + x.ties + " tied" : ""}</td></tr>`).join("")}</tbody></table></div></details>`;
  }

  function runWishlist() {
    if (!optResult || !euReady()) return;
    const c = cm();
    const p = presetById(optResult.preset);
    const opts = euOpts(c, p);
    const deck = optResult.cards;
    if (optResult.est && optResult.est.skillBudget) {
      if (wishJob || optResult.key !== optKey()) return;
      const r = optResult, jobs = [];
      const required = (r.must || []).filter((m) => m.p > 0).map((m) => String(m.id));
      deck.forEach((cur, i) => {
        if (cur.borrowed || c.locked.includes(cur.id)) return;
        const rest = deck.filter((_, j) => j !== i), ty = D.card(cur.id).ty;
        const candidates = D.DATA.supports.filter((x) => D.onGlobal(x, TODAY) && x.r >= 2 && x.ty === ty && (owned[x.id] == null || owned[x.id] < 4)).map((x) => ({ id: x.id, lb: 4 }));
        T.rank(opts, ty, rest, candidates).slice(0, 3).forEach((candidate) => {
          const cards = deck.map((x, j) => j === i ? { id: candidate.id, lb: candidate.lb, borrowed: false } : x);
          const covered = new Set(T.deckSkills(opts, cards).must.filter((m) => m.p > 0).map((m) => String(m.id)));
          if (required.every((id) => covered.has(id))) jobs.push({ cards, id: candidate.id, lb: candidate.lb, replaces: cur.id });
        });
      });
      const sv = skillMap(p.id, c.style);
      const sim = { scenario: scenario(), build: p.build, trainee: state.deck.trainee, target: cmTargets(c) || undefined, caps: E.capsFor(state, scenario()), skills: sv.map, costs: sv.costs, skillWeight: +c.skillW, must: c.must, helloProcRate: +c.helloProcRate, helloUnlockRate: +c.helloUnlockRate, eventSuccessRate: +c.eventSuccessRate, eventSongBoost: +c.eventSongBoost, independent: !!c.independent, raceShare: itShare(c) };
      const token = {}; wishJob = token; wish = null; renderCM();
      const out = []; let at = 0;
      const tick = () => {
        if (wishJob !== token) return;
        if (optResult !== r || r.key !== optKey()) { wishJob = null; if (state.tab === "cm") renderCM(); return; }
        try {
          if (at < jobs.length) {
            const job = jobs[at++];
            const check = OPT.sensitivity(sim, [{ name: "Suggested", cards: deck }, { name: "Upgrade", cards: job.cards }], { runs: 8, seeds: [857563], profiles: [{ name: "Selected assumptions" }] });
            while (check.next()) {} // one paired deck comparison
            const gain = -check.result().comparisons[0].meanDelta;
            if (gain > 1e-6) out.push({ id: job.id, lb: job.lb, replaces: job.replaces, gain });
            setTimeout(tick, 0); return;
          }
          const seen = new Set();
          wish = out.sort((a, b) => b.gain - a.gain).filter((x) => !seen.has(x.id) && seen.add(x.id)).slice(0, 10);
          r.wishMeta = { runs: 8, seed: 857563, candidates: jobs.length }; wishJob = null;
          if (state.tab === "cm") renderCM();
        } catch (err) { wishJob = null; flash(err.message || String(err)); if (state.tab === "cm") renderCM(); }
      };
      setTimeout(tick, 0); return;
    }
    const out = [];
    deck.forEach((cur, i) => {
      if (cur.borrowed || c.locked.indexOf(cur.id) !== -1) return;
      const ty = D.card(cur.id).ty;
      const rest = deck.filter((_, j) => j !== i);
      const cands = D.DATA.supports.filter((x) => D.onGlobal(x, TODAY) && x.r >= 2 && x.ty === ty && (owned[x.id] == null || owned[x.id] < 4)).map((x) => ({ id: x.id, lb: 4 }));
      T.rank(opts, ty, rest, cands).slice(0, 3).forEach((x) => { if (x.score > cur.score) out.push({ id: x.id, gain: x.score - cur.score, share: (x.score - cur.score) / Math.max(1, cur.score), replaces: cur.id }); });
    });
    const seen = new Set();
    wish = out.sort((a, b) => b.gain - a.gain).filter((x) => !seen.has(x.id) && seen.add(x.id)).slice(0, 10);
    renderCM();
  }

  function renderCM() {
    const body = $("#tabBody");
    if (!P || !T) { body.innerHTML = `<div class="empty">The CM data didn't load. Refresh the page.</div>`; return; }
    const c = cm();
    const p = presetById(c.preset);
    loadSkillValues(p.id);
    euReady();
    body.innerHTML = `<div class="cm">${cmHeader(p, c)}${cmOptimizer(p, c)}${cmSkills(p, c)}</div>`;
  }

  function cmHeader(p, c) {
    const groups = [
      ["Now and next on Global", P.list.filter((x) => x.kind === "cm" && x.global.end >= TODAY && !x.global.est)],
      ["Later Champions Meetings (Global dates estimated)", P.list.filter((x) => x.kind === "cm" && x.global.est)],
      ["League of Heroes (JP so far, Global dates estimated)", P.list.filter((x) => x.kind === "loh")],
      ["Past Global Champions Meetings", P.list.filter((x) => x.kind === "cm" && x.global.end < TODAY).reverse()]
    ];
    const opts = groups.filter((g) => g[1].length).map(([lab, xs]) => `<optgroup label="${esc(lab)}">${xs.map((x) => `<option value="${x.id}" ${x.id === p.id ? "selected" : ""}>${esc(presetLabel(x))}</option>`).join("")}</optgroup>`).join("");
    const [stCls, stText] = presetStatus(p);
    const s = p.stats;
    return `<section class="panel cm-head">
      <label class="field grow"><span>Champions Meeting or League of Heroes</span><select data-cm="preset">${opts}</select></label>
      <div class="cm-title"><h2>${esc(p.name)}</h2>
        <span class="chip">${p.kind === "loh" ? "League of Heroes " + p.no : "Champions Meeting #" + p.no}</span>
        <span class="chip cm-${stCls}">${stText}</span></div>
      <div class="cm-facts">
        <div class="cm-course"><b>${esc(p.course.track)} ${p.course.distance}m</b> · ${p.course.surface} · ${p.course.turn === "Straight" ? "straight course" : p.course.turn + "-handed"}${p.course.layout ? " (" + p.course.layout + ")" : ""} · ${p.course.dist}</div>
        <div>${esc(p.conditions)}</div>
        <div>Global: <b>${p.global.est ? "about " : ""}${fmtDate(p.global.start)} – ${fmtDate(p.global.end)}</b>${p.global.est ? ' <span class="pill">estimate</span>' : ""} · JP: ${fmtDate(p.jp.start)}</div>
        ${p.global.note ? `<div class="mini">${esc(p.global.note)}</div>` : p.global.est ? `<div class="mini">Global runs Champions Meetings in JP's order, lately about every 3 weeks, so this date is an estimate.</div>` : ""}
      </div>
      <div class="row-wrap">
        <div class="field"><span>Running style</span><div class="seg style-seg" role="radiogroup" aria-label="Running style">${STYLES.map(([k, l]) => `<button type="button" role="radio" aria-checked="${c.style === k}" data-cm-style="${k}">${l}</button>`).join("")}</div></div>
        <button type="button" class="btn ghost small" data-cm-build="${p.build}" ${state.build === p.build ? "disabled" : ""}>${state.build === p.build ? "Turn coach build: " + esc(E.BUILDS[p.build].label) : "Set the turn coach to " + esc(E.BUILDS[p.build].label)}</button>
      </div>
      <p class="mini">Skill values on this course were simulated with Speed ${s.speed}, Stamina ${s.stamina}, Power ${s.power}, Guts ${s.guts}, Wit ${s.wisdom}, S distance and A surface aptitude, Great mood.</p>
    </section>`;
  }

  function cmOptimizer(p, c) {
    const n = ownedIds().length;
    const running = !!optRun;
    const opt = (pairs, v) => pairs.map(([k, l]) => `<option value="${k}" ${String(v) === k ? "selected" : ""}>${l}</option>`).join("");
    const nSkills = Object.keys(skillMap(p.id, c.style).map).length;
    const goal = c.goal || "race";
    return `<section class="panel cm-opt">
      <h3>Deck optimizer</h3>
      <div class="field"><span>Build a deck for</span><div class="seg style-seg" role="radiogroup" aria-label="Deck goal">${GOALS.map(([k, l]) => `<button type="button" role="radio" aria-checked="${goal === k}" data-cm-goal="${k}">${l}</button>`).join("")}</div></div>
      ${goal === "debuffAce" ? `<p class="mini"><b>Debuffer ace:</b> the uma you enter in this CM to slow the others down rather than win. Picks the cards that give her the most debuffs that work on this race's distance and surface with your running style, golds counted double (they hit about twice as hard), white ones too. She needs Wit so they fire (each skill's activation chance is 100 − 9000 ÷ Wit %, at least 20%) and enough Speed and Stamina to stay in position: <b>Debuffer targets</b> below sets them.</p>` : ""}
      ${goal === "ace" || goal === "debuff" ? `<p class="mini"><b>${goal === "ace" ? "Ace parent" : "Debuffer parent"}:</b> picks the cards that give your parent the most ${goal === "ace" ? "white skills that are strong on this race (weighted by median L for the running style)" : "white debuff skills that work on this race's distance and surface with your running style"}, so she can learn them and pass them down as skill sparks. Gold skills don't count, since only white skills become sparks. Every skill counts, not just the best 8, and stats only count as much as you choose.</p>` : ""}
      ${goal !== "race" ? `<label class="field"><span>Stats still count</span><select data-cm="statsW">${opt([["0", "Not at all"], ["0.1", "A little"], ["0.25", "Some"], ["0.5", "Half"], ["1", "Fully"]], c.statsW)}</select></label>` : ""}
      <p class="mini">Builds the deck the way you'd use <a href="https://euophrys.github.io/uma-tiers/" target="_blank" rel="noopener">Euophrys' tier list</a>: it picks the best card, then the best card given that one, and so on, with Euophrys' own scoring for the scenario. On top, every skill a card can hint is scored by its median length gain on this race as a ${STYLE_LABEL[c.style]} runner. Then it rechecks each slot with the other five fixed.</p>
      ${traineePickerHTML(p, "data-cm-style")}
      ${nSkills ? "" : `<p class="mini warn">No skill values for this race yet${svCache[p.id] === "loading" ? " (loading…)" : ""}, so skills won't count. Paste your own Umalator results below to add them.</p>`}
      <div class="row-wrap">
        <label class="chip-toggle"><input type="checkbox" data-cm="ownedOnly" ${c.ownedOnly ? "checked" : ""}> Only cards I own (${n})</label>
        <label class="chip-toggle"><input type="checkbox" data-cm="borrow" ${c.borrow ? "checked" : ""}> Borrow 1 card from a friend</label>
        <label class="chip-toggle" title="The 50-minute auto mode"><input type="checkbox" data-cm="independent" ${c.independent ? "checked" : ""}> Independent Training</label>
        ${goal === "race" ? `<label class="field"><span>Skill hints count</span><select data-cm="skillW">${opt(SKILL_W, c.skillW)}</select></label>` : ""}
      </div>
      ${c.independent ? `<label class="field"><span>Friendship, Mood, Training eff. count</span><select data-cm="itManual">${opt(IT_MANUAL_OPTS, c.itManual)}</select></label>` : ""}
      ${c.independent ? `<p class="mini it-note"><b>Independent Training:</b> card scores follow players' testing there: initial stats count ${T.IT_INITIAL}× and skill points ${T.IT_SP}× (Skill Point Bonus, events, Initial Skill Points), Specialty Priority counts for nothing, and Friendship Bonus, Mood Effect and Training Effectiveness count as much as you pick above (they haven't been measured there). These weights are assumptions; compare real runs at your limit breaks. A card's 3rd chain event rarely fires there, so skills only it gives count at ${Math.round(T.IT_LATE_CHAIN * 100)}% of their usual chance. ${c.itRaces != null ? `Race Bonus counts for your G1 plan's ${c.itRaces} G1 races (Parents tab), and the predicted stats race that many times.` : `Race Bonus counts for a G1-heavy agenda (${T.IT_RACES[0]} G1, ${T.IT_RACES[1]} G2/G3; change it in the Euophrys settings), and the predicted stats race about 1 turn in 4. Each race costs rating: the Parents tab plans the fewest G1s for affinity and sends the count here.`} Races there are won on distance and surface aptitude alone, so stats only matter for sparks and rating.${IT_LINK[euScen()] ? ` ${IT_LINK[euScen()]} goes in, since uma.guide calls the scenario's link card mandatory there.` : ""}${goal !== "race" ? " Parent decks with target stats may take up to 2 Friend and 2 Group cards (players report they add a lot of skill points toward an SS rating)." : ""}</p>` : ""}
      ${compHTML(c)}
      ${state.scenario === "grandlive" ? `<details class="pred-help"><summary>Event-skill assumptions</summary><div class="row-wrap"><label class="field"><span>Conditional event success estimate</span><select data-cm="eventSuccessRate">${[["0.25", "25%"], ["0.5", "50% (default assumption)"], ["0.75", "75%"]].map(([v, l]) => `<option value="${v}" ${c.eventSuccessRate === v ? "selected" : ""}>${l}</option>`).join("")}</select></label><label class="field"><span>Experimental chain-rate boost per song level</span><select data-cm="eventSongBoost">${[["0", "0% (magnitude uncalibrated)"], ["0.05", "+5% relative rate (assumed)"], ["0.1", "+10% relative rate (assumed)"]].map(([v, l]) => `<option value="${v}" ${c.eventSongBoost === v ? "selected" : ""}>${l}</option>`).join("")}</select></label></div><p class="mini">Song event levels activate after concerts. Their numerical effect has not been verified; these boosts are sensitivity assumptions. Known event branches and chain-ending choices are separate. Grand Concert race decks receive career refinement using your targets, or the build defaults when blank.</p></details>` : ""}
      ${targetsHTML(p, c)}
      ${euSettingsHTML("speed")}
      <div class="row-wrap">
        <label class="field grow"><span>Must include (optional)</span><input id="cmLock" list="cardListAll" placeholder="A card that must be in the deck" autocomplete="off"></label>
        <button type="button" class="btn ghost small" id="cmLockAdd">Add</button>
      </div>
      ${c.locked.length ? `<div class="row-wrap">${c.locked.map((id) => `<span class="chip lockchip">${esc(D.card(id).n)} <button type="button" class="linkish" data-cm-unlock="${id}" aria-label="Remove ${esc(D.card(id).n)}">✕</button></span>`).join("")}</div>` : ""}
      ${mustHTML(c)}
      ${c.ownedOnly && n < 6 ? `<p class="mini warn">You've marked ${n} owned card${n === 1 ? "" : "s"}. Mark yours in the <button type="button" class="linkish" data-goto-tab="cards">Support cards</button> tab, or untick “Only cards I own” to search every Global SSR and SR at max limit break.</p>` : ""}
      <div class="row-wrap run-row">
        <button type="button" class="btn" id="cmRun" ${running ? "disabled" : ""}>${running ? (cmTargets(c) || state.scenario === "grandlive" && goal === "race" ? "Simulating careers…" : "Building…") : "Find my best deck"}</button>
        ${running && (cmTargets(c) || state.scenario === "grandlive" && goal === "race") ? `<span class="progress" id="cmProg"><i style="width:${Math.round((optRun.f || 0) * 100)}%"></i></span>` : ""}
      </div>
      <div id="cmOut">${optResult ? optResultHTML(optResult, c) : ""}</div>
    </section>`;
  }

  // Target stats: blank boxes show the race build's targets.
  function targetsHTML(p, c) {
    const bt = E.BUILDS[p.build].target;
    const t = c.targets || {};
    const coach = state.targets && E.STATS.some((s) => state.targets[s] > 0);
    const parent = c.goal === "ace" || c.goal === "debuff";
    const debuffer = c.goal === "debuffAce";
    const automatic = state.scenario === "grandlive" && c.goal === "race";
    return `<div class="cm-targets">
      <span class="mini"><b>Target stats</b> (optional). ${automatic ? "Blank boxes use the build targets below and still receive career comparison." : "Blank: Euophrys' pick. Set any target to compare simulated careers."} The optimizer tries swaps toward your targets while keeping useful skills and must-have coverage. Blank boxes use the ${esc(E.BUILDS[p.build].label)} targets shown.${parent ? " For a parent, stats decide spark quality: the blue spark's stat (picked at random) needs 600+ for any chance of 3★ (5%), and over 1100 doubles it (10%); a final rating of SS (17,500+) also doubles the 3★ chance of white sparks. <b>Stats still count</b> sets how much of the skill score the search may give up to get closer: A little 4%, Some 10%, Half 20%, Fully 40%." : ""}</span>
      <div class="tg-row">${E.STATS.map((s) => `<label class="field"><span>${E.STAT_LABELS[s]}</span><input type="number" inputmode="numeric" min="0" max="2500" step="50" data-cm-target="${s}" value="${t[s] > 0 ? t[s] : ""}" placeholder="${bt[s]}"></label>`).join("")}</div>
      ${coach || cmTargets(c) || parent || debuffer ? `<div class="row-wrap">${parent ? '<button type="button" class="btn ghost small" id="cmTgSpark">Blue spark targets (1100 each)</button>' : ""}${debuffer ? '<button type="button" class="btn ghost small" id="cmTgDebuffer">Debuffer targets (Wit 1200, the rest from the build)</button>' : ""}${coach ? '<button type="button" class="btn ghost small" id="cmTgCoach">Use the turn coach\'s targets</button>' : ""}${cmTargets(c) ? '<button type="button" class="btn ghost small" id="cmTgClear">Clear targets</button>' : ""}</div>` : ""}
      ${state.scenario === "grandlive" ? `<details class="pred-help"><summary>Grand Concert simulation assumptions</summary><div class="row-wrap"><label class="field"><span>Light Hello repeat-event estimate</span><select data-cm="helloProcRate">${[["0.36", "36% (lower estimate)"], ["0.4", "40% (default estimate)"], ["0.45", "45% (upper estimate)"]].map(([v, l]) => `<option value="${v}" ${c.helloProcRate === v ? "selected" : ""}>${l}</option>`).join("")}</select></label><label class="field"><span>Outing unlock model, after meeting and bond 60</span><select data-cm="helloUnlockRate">${[["0.05", "5% per turn (slow sensitivity check)"], ["0.15", "15% per turn (default assumption)"], ["0.3", "30% per turn (fast sensitivity check)"]].map(([v, l]) => `<option value="${v}" ${c.helloUnlockRate === v ? "selected" : ""}>${l}</option>`).join("")}</select></label></div><p class="mini">These are model assumptions, not confirmed game probabilities. Compare results across settings. The turn coach only uses outings once you mark the actual unlock; expected token events never change its saved balances.</p></details>` : ""}
    </div>`;
  }

  // Must-have skills: the deck has to include a card that can give each one (hint or event).
  // Lists every skill a Global card can give; ☆ in the skills table adds one too.
  function mustHTML(c) {
    const src = skillSources(c);
    const trn = state.deck.trainee ? D.trainee(state.deck.trainee) : null;
    const known = new Set(trn ? trn.us.concat(trn.is, trn.as).map(String) : []);
    let sourceIds = [...new Set(D.DATA.supports.filter((x) => D.onGlobal(x, TODAY)).flatMap((x) => (x.hs || []).concat(x.es || [])))];
    if (c.goal !== "race") {
      sourceIds = sourceIds.map(String);
      if (c.globalSkills) sourceIds = sourceIds.filter(id => SV.skills[id] && SV.skills[id][3]);
      sourceIds = [...new Set(sourceIds.flatMap(id => [id, ...parentPurchaseRoutes.whites(id)]))];
      if (c.globalSkills) sourceIds = sourceIds.filter(id => SV.skills[id] && SV.skills[id][3]);
      [...known].forEach(id => parentPurchaseRoutes.whites(id).forEach(white => known.add(white)));
    }
    const names = sourceIds.map(id => debuffOrSkillName(id)).sort();
    const mine = c.ownedOnly && ownedIds().length;
    return `<div class="must">
      <div class="row-wrap">
        <label class="field grow"><span>Must-have skills (optional)</span><input id="cmMust" list="cmSkillList" placeholder="A skill the deck must be able to give" autocomplete="off"></label>
        <button type="button" class="btn ghost small" id="cmMustAdd">Add</button>
      </div>
      <datalist id="cmSkillList">${names.map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>
      ${c.must.length ? `<div class="row-wrap">${c.must.map((id) => {
        const n = (src[id] || []).length;
        const note = known.has(String(id)) ? "available to your trainee" : n ? n + (mine ? " of your cards" : " cards") : mine ? "none of your cards" : "no support card";
        return `<span class="chip lockchip${n || known.has(String(id)) ? "" : " warnchip"}">${skillNameHTML(id)} <span class="mini">${note}</span> <button type="button" class="linkish" data-must-del="${id}" aria-label="Remove ${esc(debuffOrSkillName(id))}">✕</button></span>`;
      }).join("")}</div>` : ""}
      <p class="mini">${c.goal === "race" ? "The deck will include a card that can hint each must-have skill or give it through an event, before anything else counts." : "Parent must-haves prioritize cards with a direct hint/event source or a canonical gold prerequisite route. A gold route makes the white purchasable, without granting its hint discount."} Cards only offer a skill by chance, so the result shows how likely you are to see it.</p>
    </div>`;
  }
  const skillIdByName = (name) => {
    const n = name.trim().toLowerCase();
    if (!n) return null;
    if (cm().goal !== "race") {
      const id = Object.keys(SV.skills).find(id => debuffOrSkillName(id).toLowerCase() === n);
      if (id) return id;
    }
    for (const x of D.DATA.supports) for (const id of (x.hs || []).concat(x.es || [])) if (debuffOrSkillName(id).toLowerCase() === n) return String(id);
    return null;
  };

  // How much Friendship Bonus, Mood Effect and Training Effectiveness count in Independent
  // Training, against a manual career: unmeasured there, so it's your call (tiers.js IT_MANUAL).
  const IT_MANUAL_OPTS = [["1", "Fully (as in a manual career)"], ["0.5", "Half (default)"], ["0.25", "A quarter"], ["0", "Not at all"]];
  const GOALS = [["race", "Racing this CM"], ["ace", "Ace parent"], ["debuff", "Debuffer parent"], ["debuffAce", "Debuffer ace"]];
  const SKILL_W = [["0", "Not at all (pure Euophrys)"], ["0.5", "A little"], ["1", "Normal"], ["2", "A lot"], ["3", "Skills first"]];
  const COMP_TYPES = [["speed", "Speed"], ["stamina", "Stamina"], ["power", "Power"], ["guts", "Guts"], ["wit", "Wit"], ["friend", "Friend"], ["group", "Group"]];
  function compHTML(c) {
    const fixed = COMP_TYPES.reduce((a, [k]) => a + (c.comp[k] != null ? c.comp[k] : 0), 0);
    return `<div class="comp">
      <span class="mini"><b>Deck makeup</b> (how many of each type, borrowed card included). Leave “Any” to let the optimizer decide.</span>
      <div class="comp-row">${COMP_TYPES.map(([k, l]) => `<label class="field comp-f ty-${k}"><span><i class="tydot"></i>${l}</span><select data-cm-comp="${k}"><option value="">Any</option>${[0, 1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${c.comp[k] === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>`).join("")}
      ${Object.keys(c.comp).length ? '<button type="button" class="btn ghost small" id="compClear">Reset</button>' : ""}</div>
      ${fixed > 6 ? `<p class="mini warn">That adds up to ${fixed} cards; a deck has 6.</p>` : ""}
    </div>`;
  }

  // The Parents tab (parent-planner.js): G1 plan for affinity and the SS rating check.
  let pp = null;
  function parents() {
    if (pp || !window.UmaParentPlanner || !window.UmaParentData) return pp;
    const SB = window.UmaSkillBudget, PR = window.UmaRating;
    const names = new Map();
    Object.keys(SV.skills).forEach((id) => {
      const n = SV.skills[id][0];
      if (!n) return;
      const k = n.toLowerCase();
      // Prefer a purchasable id (the skill shop's) when two share a name.
      if (!names.has(k) || (!SB.DATA.skills[names.get(k)] && SB.DATA.skills[id])) names.set(k, id);
    });
    pp = window.UmaParentPlanner.create({
      D, A: window.UmaAffinity, R: PR, SB, esc, flash, save,
      state: () => state,
      container: () => $("#tabBody"),
      coachTrainee: () => (state.deck.trainee ? D.trainee(state.deck.trainee) : null),
      turnText: (t) => E.turnInfo(t, scenario()).text,
      skillName: (id) => skillInfo(id)[0],
      skillNames: () => Array.from(new Set(Object.values(SV.skills).map((x) => x[0]).filter(Boolean))).sort(),
      skillIdByName: (n) => names.get(String(n || "").trim().toLowerCase()) || null,
      caps: () => { const c = E.capsFor(state, scenario()); return E.STATS.map((k) => c[k]); },
      predicted: () => (optResult && optResult.est && optResult.est.stats ? { stats: optResult.est.stats.slice(), sp: Math.round(optResult.est.sp || 0) } : null),
      itRaces: () => (cm().itRaces != null ? cm().itRaces : null),
      cmMust: () => cm().must || [],
      setItRaces: (n) => { if (n == null) delete cm().itRaces; else cm().itRaces = n; optResult = null; save(); renderTab(); },
      // Rating lost per optional race: simulate your coach deck racing rarely and often, and
      // compare the rating of the stats and skill points (at the planner's SP_RATING).
      raceCost: () => {
        const cards = (state.deck.slots || []).filter(Boolean).map((sl) => ({ card: D.card(sl.id), lb: sl.lb })).filter((x) => x.card);
        if (!cards.length) return null;
        const sc = scenario();
        const runs = 24;
        const sim = (raceShare) => OPT.simulate(OPT.buildCtx({ scenario: sc, build: state.build, trainee: state.deck.trainee, caps: E.capsFor(state, sc), raceShare, runs, independent: !!cm().independent }), cards);
        const a = sim(0.02), b = sim(0.2);
        const value = (x) => PR.statsScore(x.stats) + x.sp * window.UmaParentPlanner.SP_RATING;
        const dr = b.races - a.races;
        if (!(dr > 0.5)) return { error: "The simulation couldn't vary the race count for this scenario." };
        return { perRace: (value(a) - value(b)) / dr, races: [a.races, b.races], runs };
      },
    });
    return pp;
  }

  const debuffOrSkillName = (id) => (window.UmaDebuffs && window.UmaDebuffs[id] ? window.UmaDebuffs[id].n : skillInfo(id)[0]);
  const skillLabels = window.UmaSkillLabels.create({skills: SV && SV.skills, trainees: D.DATA.trainees});
  function skillNameHTML(id, displayName = debuffOrSkillName(id)) {
    const source = skillLabels.sourceText(id);
    return esc(displayName) + (source ? ` <span class="mini inherited-source">· ${esc(source)}</span>` : "");
  }

  function supportEventsHTML(r) {
    const model = r.est && r.est.supportEvents;
    if (!model) return "";
    const cards = model.cards, coupled = cards.filter((c) => c.mode === "coupled").length, fallback = cards.filter((c) => c.mode === "aggregate").length;
    const n = (x) => Number.isInteger(x) ? String(x) : x.toFixed(1);
    const signed = (x) => (x > 0 ? "+" : "") + n(x);
    function text(event, credited = false) {
      const out = [];
      (event.s || []).forEach((x, i) => { if (x) out.push(E.STAT_LABELS[E.STATS[i]] + " " + signed(x)); });
      if (event.sp) out.push("SP " + signed(event.sp));
      const energy = credited ? event.energy : event.e;
      if (energy) out.push("Energy " + signed(energy));
      if (event.b) out.push("Bond " + signed(event.b));
      if (event.me) out.push("Max energy " + signed(event.me));
      if (event.mo) out.push("Mood " + signed(event.mo));
      Object.entries(event.h || {}).forEach(([id, lv]) => out.push(skillInfo(id)[0] + " hint +" + lv));
      return out.join("; ") || "No numeric reward";
    }
    const purchase = r.est.skillBudget && r.est.skillBudget.example;
    const events = purchase ? purchase.eventTrace : model.example, career = purchase ? purchase.career : 1;
    return `<details class="pred-help" id="supportEventRewards"><summary>Support-event rewards</summary>
      <p class="mini">${coupled} ordinary card(s) use coupled event rewards; ${fallback} card(s) use an aggregate fallback. Light Hello uses her separate lifecycle. Coupled stats, SP, energy, bond and hints come from the same chosen outcome. Event timing and success rates are estimates.</p>
      <div class="table-wrap"><table><thead><tr><th>Card</th><th>Reward model</th><th>Events per career</th><th>Chain completed</th><th>Ended early</th><th>Credited rewards per career</th></tr></thead><tbody>${cards.map((c) => `<tr><th>${esc(D.card(c.card).n)}</th><td>${c.mode === "coupled" ? "Coupled parsed rewards" : c.mode === "hello-lifecycle" ? "Hello lifecycle" : "Aggregate fallback"}</td><td>${c.mode === "coupled" ? n(c.totals.events) : "–"}</td><td>${c.mode === "coupled" && c.chainLength ? n(c.totals.complete * 100) + "%" : "–"}</td><td>${c.mode === "coupled" && c.chainLength ? n(c.totals.ended * 100) + "%" : "–"}</td><td class="mini">${c.mode === "coupled" ? esc(text(c.totals, true)) + `; energy cap loss ${n(c.totals.wastedEnergy)}; bond cap loss ${n(c.totals.wastedBond)}` : "See model notes"}</td></tr>`).join("")}</tbody></table></div>
      ${cards.some((c) => c.missing.length || c.notes.length || c.mode === "aggregate") ? `<ul class="mini">${cards.filter((c) => c.missing.length || c.notes.length || c.mode === "aggregate").map((c) => `<li><b>${esc(D.card(c.card).n)}</b>: ${c.mode === "aggregate" ? "whole-card aggregate fallback; parsed rewards are not added on top. " : ""}${c.missing.length ? c.missing.length + " event record(s) have no results. " : ""}${c.notes.map(esc).join("; ")}${c.mode === "aggregate" && !c.missing.length ? "Friend/Group lifecycle or complete event records unavailable." : ""}</li>`).join("")}</ul>` : ""}
      <details id="supportEventExample"><summary>Event ledger for example career ${career}</summary><p class="mini">Events occur after that turn's command. This ledger matches the complete purchase example when one is shown. Credited values reflect stat, energy and bond caps; hints are listed with the granted rewards. Unknown free grants, conditions and eligibility notes remain unmodeled.</p><div class="table-wrap"><table><thead><tr><th>Turn</th><th>Card / event</th><th>Choice / outcome</th><th>Granted</th><th>Credited numeric rewards</th></tr></thead><tbody>${events.map((e) => `<tr><td>${e.turn}</td><th>${esc(D.card(e.card).n)}<div class="mini">${esc((window.UmaCardEvents.events[e.event] || {}).n || "Event " + e.event)}</div></th><td>${e.choice} · ${esc(e.branch)}${e.end ? " · chain ends" : ""}</td><td class="mini">${esc(text(e.reward))}</td><td class="mini">${esc(text(e.credited, true))}</td></tr>`).join("") || '<tr><td colspan="5">No coupled ordinary-support events in this sample.</td></tr>'}</tbody></table></div></details>
      <p class="mini">The model uses independent event clocks across calendar turns and one chain step per card per turn. Ordinary listed events occur at most once. Song boosts apply to active chain levels only. Other Friend/Group cards and incomplete records retain older estimates. Unresolved event skills still use the stated availability priors. Generic career stats remain an uncalibrated allowance.</p>
    </details>`;
  }

  function affordableSkillsHTML(r) {
    const budget = r.est.skillBudget, example = budget.example;
    const number = (n) => Number.isInteger(n) ? String(n) : n.toFixed(1);
    const pct = (n) => Math.round(n * 100) + "%";
    const skills = r.est.skills.filter((s) => s.sampledAvailableP > 0 || s.selectedP > 0);
    return `<div id="skillBudget" class="pred-help">
      <b>Affordable skills</b>
      ${budget.valuesAvailable ? "" : '<p class="mini warn">No positive race skill values are loaded. This comparison cannot value SP through skills. Load the race results or paste your skill chart, then search again.</p>'}
      <p class="mini">Average of ${budget.careers} simulated careers: <b>${number(budget.learned)} final skills</b>, spending <b>${number(budget.spent)} / ${number(budget.budget)} SP</b>; ${number(budget.unspent)} SP left. Each career chooses its own set within its own budget, including lower-tier costs. Upgrades count as one final skill.</p>
      <details><summary>Skills selected across these careers</summary>
        <p class="mini">Counts describe this sample of simulated careers. Availability includes trainee skills and lower tiers unlocked by gold hints. Purchases also depend on the other available skills and SP. Each career's strongest affordable set uses the chart's additive gains.</p>
        <div class="table-wrap"><table><thead><tr><th>Final skill</th><th>Available</th><th>Purchased</th><th>Mean SP when purchased</th></tr></thead><tbody>${skills.map((s) => `<tr><th>${skillNameHTML(s.id, skillInfo(s.id)[0])}${s.innate ? ' <span class="mini">trainee</span>' : ""}</th><td>${pct(s.sampledAvailableP)}</td><td>${pct(s.selectedP)}</td><td>${s.meanPurchaseCost == null ? "–" : number(s.meanPurchaseCost)}</td></tr>`).join("") || '<tr><td colspan="4">No valued skills were available in these sampled careers.</td></tr>'}</tbody></table></div>
      </details>
      ${example ? `<details id="skillBudgetExample"><summary>One complete purchase example</summary><p class="mini">One simulated career: ${example.budget} SP, ${example.spent} spent, ${example.unspent} left. White/gold and ○/◎ versions replace each other's race gain; the cost includes every required tier.</p><div class="table-wrap"><table><thead><tr><th>Final skill</th><th>Total SP</th><th>Cost breakdown</th></tr></thead><tbody>${example.selected.map((s) => `<tr><th>${skillNameHTML(s.id, skillInfo(s.id)[0])}</th><td>${s.cost}</td><td class="mini">${s.tiers.map((t) => `${skillNameHTML(t.id, skillInfo(t.id)[0])}: ${t.cost} SP (hint Lv${t.hint})`).join(" + ")}</td></tr>`).join("") || '<tr><td colspan="3">No valued purchase fits this career.</td></tr>'}</tbody></table></div></details>` : ""}
      ${budget.must.length ? `<p class="mini">Must-have purchases in this sample: ${budget.must.map((m) => `${skillNameHTML(m.id)} ${pct(m.learnedP)}`).join("; ")}. Available must-haves get purchase priority; a shortfall can mean missing offers or insufficient SP.</p>` : ""}
      ${budget.unsupported.length ? `<p class="mini warn">Purchase data missing or unsupported; excluded from affordable skill value: ${budget.unsupported.map((id) => skillNameHTML(id, skillInfo(id)[0])).join(", ")}.</p>` : ""}
      <details><summary>Purchase assumptions</summary><p class="mini">All listed innate and awakening skills are assumed available at hint Lv0 and still cost SP. The trainee's own unique is already learned. Skills are bought at career end. Inherited skills, random scenario skills, Fast Learner, free skill grants, evolved skills and the effect of early purchases are omitted. Chart gains are added; skill interactions are not simulated. Parsed ordinary-support choices grant resources and hints together; incomplete records keep labeled fallbacks. Event choices and timing use the stated assumptions. SP contributes through affordable purchases, with no extra raw-SP bonus.</p></details>
    </div>`;
  }

  // Debuffer ace: the debuffs this deck can give her and how likely each is offered, the ones
  // she can already buy, the ones no card here covers, and whether her Wit makes them fire
  // (activation: 100 − 9000 ÷ Wit %, at least 20%).
  function debuffAceHTML(r) {
    const DB = window.UmaDebuffs || {};
    const targets = (r.parentConfig && r.parentConfig.targets) || {};
    const offered = (r.skills || []).filter((x) => targets[x.id] != null).sort((a, b) => b.p * targets[b.id] - a.p * targets[a.id]);
    const trn = r.simulationMeta && r.simulationMeta.trainee ? D.trainee(r.simulationMeta.trainee) : null;
    const own = trn ? [].concat(trn.is || [], trn.as || []).map(String).filter((id) => targets[id] != null) : [];
    const have = new Set(offered.map((x) => String(x.id)).concat(own));
    const missing = Object.keys(targets).filter((id) => !have.has(id)).sort((a, b) => targets[b] - targets[a]);
    const kind = (id) => (DB[id] && DB[id].r === 2 ? "gold" : "white");
    const wit = r.est && r.est.stats ? r.est.stats[4] : null;
    const fire = (w) => Math.round(Math.max(20, 100 - 9000 / Math.max(1, w)));
    return `<div class="pred-help">
      <p><b>${offered.length} debuff${offered.length === 1 ? "" : "s"}</b> this deck can give her on this race${own.length ? `, plus ${own.length} she can buy herself (${own.map((id) => skillNameHTML(id)).join(", ")})` : ""}. About ${offered.reduce((a, x) => a + x.p, 0).toFixed(1)} expected to be offered.</p>
      ${offered.length ? `<div class="table-wrap"><table><thead><tr><th>Debuff</th><th></th><th>Offered</th><th>From</th></tr></thead><tbody>${offered.map((x) => `<tr><th>${skillNameHTML(x.id)}</th><td class="mini">${kind(x.id)}</td><td class="num">${Math.round(x.p * 100)}%</td><td class="mini">${(x.src || []).map((id) => esc(D.card(id).n)).join(", ")}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${missing.length ? `<p class="mini">No card here gives ${missing.slice(0, 8).map((id) => skillNameHTML(id)).join(", ")}${missing.length > 8 ? ` and ${missing.length - 8} more` : ""}. Add one as a must-have to force a card that does, or get it as a spark from a Debuffer parent.</p>` : ""}
      ${wit ? `<p class="mini">Predicted Wit ${wit}: each debuff fires about <b>${fire(wit)}%</b> of the time when its condition is met (1200 Wit: ${fire(1200)}%).</p>` : `<p class="mini">Each debuff fires about ${fire(1000)}% of the time at 1000 Wit, ${fire(1200)}% at 1200, when its condition is met. Set target stats to see her predicted Wit.</p>`}
      <p class="mini">Offer chances are estimates from hints and events, not learned-skill chances. Which debuffs actually land also depends on where she runs and who's around her.</p>
    </div>`;
  }

  function parentSkillsHTML(r) {
    const config = r.parentConfig;
    const pool = window.UmaParentSkills.build(r.cards.map(x => D.card(x.id)), {
      skills: SV.skills, purchases: window.UmaSkillPurchases.skills, events: window.UmaCardEvents,
      targets: config.targets, must: config.must, globalOnly: config.globalOnly, today: TODAY
    });
    const name = id => skillNameHTML(id);
    const modeledAvailability = id => {
      const offer = (r.skills || []).find(x => String(x.id) === id) || (r.must || []).find(x => String(x.id) === id);
      return offer ? `<div class="mini">Estimated offer/unlock availability: ${Math.round(offer.p * 100)}%.${offer.hintP == null ? "" : ` Direct white hints: ${Math.round(offer.hintP * 100)}%.`} Not a learned-skill probability.</div>` : "";
    };
    const rows = skills => skills.map(s => `<tr data-parent-skill="${esc(s.id)}"><th>${name(s.id)} ${s.must ? '<span class="skillpill">Must-have</span>' : ""}${s.release === false ? ' <span class="mini warn">Not listed on Global</span>' : s.release == null ? ' <span class="mini warn">Release metadata unknown</span>' : ""}<div class="mini">${s.spark ? "White · skill spark candidate if learned" : s.rarity === 2 ? "Gold · does not itself become a skill spark" : "Spark eligibility unverified / not a white skill"}</div>${modeledAvailability(s.id)}</th><td>${s.sources.map(source => {
      const card = D.card(source.card), picked = r.cards.find(x => x.id === source.card);
      const routes = [...new Set(source.routes.map(route => {
        const event = route.event ? (window.UmaCardEvents.events[route.event] || {}).n || "event " + route.event : route.kind === "hint" ? "training" : "event details unknown";
        const detail = `${esc(event)}${route.event ? " / choice " + route.choice : ""}${route.conditional ? " (conditional outcome)" : ""}${route.note ? " · " + esc(route.note) : ""}`;
        if (route.via) return `Available through ${name(route.via)} from ${esc(card.n)} [${esc(card.t)}] / ${detail}. ${route.purchase === "prerequisite" ? "No white hint discount is granted by this gold hint." : "Purchase upgrade; not a separate hint."}`;
        return `${route.kind === "hint" ? "Training hint" : route.grant ? "Event skill grant" : "Event hint"} · ${detail}`;
      }))];
      return `<details><summary><b>${esc(card.n)} [${esc(card.t)}]</b>${picked.borrowed ? " · borrowed" : ""} · ${[...new Set(source.routes.map(route => route.via ? "Purchase availability" : route.kind === "hint" ? "Training hint" : "Event"))].join(" + ")}</summary><div class="mini">${routes.join("<br>")}</div></details>`;
    }).join("<hr>")}</td></tr>`).join("");
    const section = (title, skills, open) => `<details ${open ? "open" : ""}><summary>${title} (${skills.length})</summary><div class="table-wrap"><table><thead><tr><th>Skill / status</th><th>Deck sources</th></tr></thead><tbody>${rows(skills) || '<tr><td colspan="2">No known skills in this section.</td></tr>'}</tbody></table></div></details>`;
    return `<div id="parentSkillPool" class="pred-help"><h4>Recommended deck skill pool (${pool.skills.length})</h4>
      <p class="mini">Known support sources, including purchase prerequisites and ordinary white upgrades. ${config.globalOnly ? "Global releases only." : "All skill releases; the builder's card pool remains Global."} Source coverage is not an acquisition probability, an affordable purchase, or a skill actually learned. Event choices, conditions and completion can prevent obtaining every listed skill in one career. A white skill must be learned for a chance at its skill spark; a spark is not guaranteed.</p>
      ${section("Race/style-relevant parent targets", pool.skills.filter(s => s.target), true)}
      ${section("Other obtainable skills · relevance not established for this parent", pool.skills.filter(s => !s.target), false)}
      ${pool.missingMust.length ? `<p class="mini warn">Must-have source not covered in this released deck pool: ${pool.missingMust.map(name).join(", ")}. A source may be on another card, trainee/scenario-only, unreleased, or unknown in the data.</p>` : ""}
      ${pool.restricted.length ? `<details><summary>Release exclusions / unknown availability (${pool.restricted.length})</summary><ul>${pool.restricted.map(s => `<li>${name(s.id)}${s.must ? " · Must-have" : ""}: ${s.release === false ? "not listed on Global" : "release metadata unknown"}; ${s.sources.map(x => esc(D.card(x.card).n)).join(", ")}</li>`).join("")}</ul></details>` : ""}
      ${pool.unavailableCards.length ? '<p class="mini warn">Unreleased or undated source cards excluded from this skill pool.</p>' : ""}
      ${pool.unresolvedPrerequisites.length ? `<p class="mini warn">White prerequisite data missing or unsupported: ${pool.unresolvedPrerequisites.map(x => `${name(x.id)} from ${esc(D.card(x.card).n)}`).join(", ")}. No white purchase route was inferred.</p>` : ""}
      <details><summary>Parent estimates and limitations</summary><p class="mini">${r.expected == null ? "" : `Target offer estimate: ${r.expected.toFixed(1)} under the existing skill-source heuristic; not a learned-skill count or SP budget. `}Parent scoring values each target once through modeled direct offers or canonical gold-to-white prerequisite availability, alongside weighted stats. A gold hint does not grant a separate white hint or discount. It does not solve an affordable parent skill set. Trainee innate/awakening skills are assumed available by scoring and are excluded from its added support value; this pool still shows their support sources. Trainee-only and scenario-only skills are outside this deck-source inventory. Event data may be incomplete; unknown event routes remain labeled. Static shortlisting can miss cards that help by discounting trainee skills, and final ace simulation can rank candidates differently. All listed outcomes are possibilities, not guarantees.</p></details>
    </div>`;
  }

  function optResultHTML(r, c) {
    const p = presetById(r.preset);
    const stale = r.key !== optKey();
    const w = wish;
    const total = r.cards.reduce((a, x) => a + x.score, 0);
    return `<div class="opt-result">
      <h4>${r.goal === "ace" ? "Best ace parent deck" : r.goal === "debuff" ? "Best debuffer parent deck" : r.goal === "debuffAce" ? "Best debuffer ace deck" : r.simulationMeta && r.simulationMeta.scenario === "grandlive" ? "Suggested deck" : "Best deck"} for ${esc(p.name)} · ${STYLE_LABEL[r.style]} · ${esc(T.SCENARIOS.find((x) => x[0] === r.scen)[1])} weights</h4>
      ${stale ? `<p class="mini warn">Settings or cards changed since this search. Press <b>Find my best deck</b> again to update it.</p>` : ""}
      <div class="opt-cards">${r.cards.map((x) => {
        const card = D.card(x.id);
        return `<div class="opt-card ty-${card.ty}">
        <span class="tydot" aria-hidden="true"></span>
        <div class="opt-name"><b>${esc(card.n)}</b> <span class="mini">${esc(card.t)}</span>
          <div class="mini">${D.RARITY[card.r]} ${D.typeLabel(card.ty)} · LB${x.lb}${x.borrowed ? " · <b>borrow this</b>" : ""}${c.locked.indexOf(x.id) !== -1 ? " · locked" : r.link && r.link.lock === x.id ? " · scenario card" : ""}</div>
          ${x.it ? `<div class="mini">${itPartsText(x.it)}</div>` : ""}
          ${r.goal === "race" && x.gives && x.gives.length ? `<div class="mini must-gives">Gives your must-have: ${x.gives.map((id) => skillNameHTML(id)).join(", ")}</div>` : ""}
          ${x.alt ? `<div class="mini">Next best: ${esc(D.card(x.alt.id).n)} LB${x.alt.lb} (${Math.round(x.alt.score)}${x.alt.losesMust ? (r.goal === "race" ? ", but no must-have" : ", lower modeled must-have coverage") : ""})</div>` : ""}</div>
        <div class="num" title="Euophrys score with the other five cards fixed, plus skills">${Math.round(x.score)}<div class="mini">${Math.round(x.base)} + ${Math.round(x.skill)} skills</div></div>
      </div>`;
      }).join("")}</div>
      ${r.link ? `<p class="mini${r.link.lock ? "" : " warn"}">${r.link.lock ? `<b>${esc(r.link.name)}</b> is in${r.link.borrow ? " as the borrowed card" : ""}: uma.guide calls the scenario's link card mandatory for Independent Training.` : r.link.blocked ? `uma.guide calls ${esc(r.link.name)} mandatory for Independent Training here, but your deck makeup allows no Friend card.` : `uma.guide calls ${esc(r.link.name)} mandatory for Independent Training here, but you don't own her: mark her owned, or allow a borrowed card.`}</p>` : ""}
      ${r.goal === "race" ? mustResultHTML(r, c) : ""}
      ${predictedHTML(r)}
      ${supportEventsHTML(r)}
      <p class="mini">Each number is the card's score with the other five fixed: Euophrys' score plus its skill score. Deck total ${Math.round(total)}.</p>
      ${r.simulationMeta && r.simulationMeta.scenario === "grandlive" && r.goal === "race" ? '<p class="mini">The final suggestion also considers simulated careers. A lower static total can still finish closer to your targets or buy a stronger affordable skill set.</p>' : ""}
      ${r.goal === "debuffAce" ? debuffAceHTML(r) : r.goal !== "race" ? parentSkillsHTML(r) : r.expected != null ? `<p><b>About ${r.expected.toFixed(1)} target skills</b> expected from this deck's hints and events (out of ${r.skillsUsed} worth getting${r.goal === "debuff" ? " for a debuffer here" : " on this race"}). Each one you learn can become a skill spark.</p>
        <div class="opt-skills">${r.skills.map((x) => `<span class="skillpill">${skillNameHTML(x.id)} ${r.goal === "ace" ? `<b>${x.L.toFixed(2)} L</b> ` : ""}<span class="mini">${Math.round(x.p * 100)}%</span></span>`).join(" ")}</div>` : r.est && r.est.skillBudget ? affordableSkillsHTML(r) : r.skills.length ? `<div class="opt-skills"><b>Best skills this deck can hint here:</b> ${r.skills.map((x) => `<span class="skillpill">${skillNameHTML(x.id, skillInfo(x.id)[0])} <b>${x.L.toFixed(2)} L</b> <span class="mini">${Math.round(x.p * 100)}%</span></span>`).join(" ")}</div>` : r.skillsUsed ? "" : `<p class="mini">Skills weren't counted (no skill values for this race).</p>`}
      ${r.goal === "race" ? skillSourcesHTML(r.skills || [], !!(r.est && r.est.supportEvents)) : ""}
      <div class="row-wrap">
        <button type="button" class="btn" data-use-opt="1">Use this deck in the coach</button>
        <button type="button" class="btn ghost" id="cmWish" ${wishJob || stale && r.est && r.est.skillBudget ? "disabled" : ""}>${wishJob ? "Comparing upgrades…" : "Which cards would improve it?"}</button>
        ${r.simulationMeta && r.simulationMeta.scenario === "grandlive" && r.goal === "race" ? `<button type="button" class="btn ghost" id="cmSensitivity" ${stale || sensitivityJob || comparisonDecks(r, c).length < 2 ? "disabled" : ""}>${sensitivityJob ? "Checking…" : "Check ranking sensitivity"}</button>${sensitivityJob ? '<span class="mini" id="sensitivityProgress">0%</span>' : ""}` : ""}
      </div>
      ${sensitivityHTML(r)}
      ${r.wishMeta && Array.isArray(w) ? `<p class="mini" id="wishlistMethod">Upgrade comparison: ${r.wishMeta.candidates} shortlisted replacements, ${r.wishMeta.runs} careers per deck on paired seed ${r.wishMeta.seed}; target fit and affordable skills. Locked cards, borrowing and must-have coverage are preserved. This is a limited sample; use ranking sensitivity for closer checks.</p>` : ""}
      ${Array.isArray(w) ? (w.length ? `<div class="wish"><h4>Cards worth getting</h4><ol>${w.map((x) => {
        const cd = D.card(x.id);
        const have = owned[x.id] != null;
        return `<li><b>${esc(cd.n)}</b> <span class="mini">[${esc(cd.t)}] ${D.RARITY[cd.r]} ${D.typeLabel(cd.ty)}</span> ${have ? "from LB" + owned[x.id] + " to LB4" : "at LB4"}: <b>+${Math.round(x.gain)}</b>, replacing ${esc(D.card(x.replaces).n)}</li>`;
      }).join("")}</ol><p class="mini">Each card is tried in the slot of the same type, with the other five cards fixed.</p></div>` : `<p class="mini">${r.wishMeta ? "No shortlisted LB4 replacement improves the simulated score in this check." : "No card at LB4 beats your current picks for their slots."}</p>`) : ""}
    </div>`;
  }

  // Render diagnostics from the returned simulation, not a reconstructed expected calendar.
  function simulationDiagnosticsHTML(r) {
    const est = r.est || {};
    const cal = est.calendarAssumptions;
    const meta = r.simulationMeta || {};
    const count = (n) => typeof n === "number" && Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "Not reported";
    const turns = cal && Array.isArray(cal.scheduledRaces) ? cal.scheduledRaces : null;
    const tr = meta.trainee != null ? D.trainee(meta.trainee) : null;
    const sc = SCENARIOS.find((s) => s.id === meta.scenario);
    const ready = !!(turns && typeof cal.freeTurns === "number" && typeof est.requiredRaces === "number");
    const scenarioName = sc ? sc.name : (meta.scenario || "Not recorded");
    const traineeName = tr ? traineeLabel(tr) : meta.trainee != null ? String(meta.trainee) : "No trainee selected";
    return `<details class="pred-help" open>
      <summary>Simulation diagnostics</summary>
      <p class="mini">Display build: diagnostics-ui-1. Calendar model: ${ready ? "calendar/reward metadata returned (optimizer version not reported)" : "not verified: calendar/reward metadata missing"}.</p>
      <p class="mini">Scenario used: ${esc(scenarioName)}. Trainee used: ${esc(traineeName)}.</p>
      <ul class="mini">
        <li>Required-race turns: ${turns ? (turns.length ? turns.map((t) => esc(String(t))).join(", ") : "None scheduled") : "Not reported"}.</li>
        <li>Scheduled required races: ${turns ? turns.length : "Not reported"}. Simulated required races per career: ${count(est.requiredRaces)}.</li>
        <li>Available training/rest turns: ${count(cal && cal.freeTurns)}.</li>
        <li>Optional races per career: ${count(est.races)}.</li>
        <li>Rest turns per career: ${count(est.rests)}.</li>
        ${est.grandConcert ? `<li>Light Hello outings: ${count(est.outings)}; ordinary Recreation: ${count(est.recreations)}.</li>` : ""}
      </ul>
      ${ready ? `<p class="mini">These counts come from the returned simulation. Available turns can be used for training, rest or optional racing; they are not guaranteed trainings.</p>` : `<p class="mini short">Do not infer a correct calendar from the predicted stats alone. This optimizer has not supplied the calendar diagnostics; it may be an older build or a scenario without this instrumentation.</p>`}
      ${cal ? `<p class="mini">Model assumptions: ${[cal.requiredRaceResult, cal.randomGoalStats, cal.choiceAndFanGoals, cal.rewards].filter(Boolean).map(esc).join("; ")}.</p>` : ""}
      ${est.eventModel ? `<details><summary>Event-skill source coverage</summary><p class="mini">Conditional success estimate: ${Math.round(est.eventModel.successRate * 100)}%. Song-level relative chain-rate assumption: +${Math.round(est.eventModel.songBoost * 100)}% per level. Exposure: ${count(est.grandConcert && est.grandConcert.eventLevelExposure)} average active levels across the career. Completion priors: SSR 80%, SR 65%, R 50%; these are assumptions. Known branches are exclusive; unresolved skill sources keep a Lv1 availability prior. Hint levels accumulate to Lv5; hint-pool sampling remains approximate and free skill grants are not fully modeled. Raw-text eligibility and event timing still need calibration; the support-event rewards section shows coupled cards and aggregate fallbacks.</p><ul class="mini">${est.eventModel.coverage.filter((x) => x.unresolved.length || x.conditionalNotes.length).map((x) => `<li><b>${esc(D.card(x.card).n)}</b>: ${x.unresolved.length} unresolved event-skill source(s); ${x.conditionalNotes.length} raw condition note(s).</li>`).join("") || "<li>No missing event-result sources for these ordinary supports.</li>"}</ul></details>` : ""}
      ${est.grandConcert ? `<p class="mini"><b>Grand Concert / Light Hello:</b> ${count(est.grandConcert.songs)} songs, ${count(est.grandConcert.techniques)} techniques, ${count(est.grandConcert.greatConcerts)} Great Success concerts. Extra Hello Performance: ${count(est.grandConcert.helloTokens)}; energy saved on training: ${count(est.grandConcert.helloEnergySaved)}; outing energy actually recovered: ${count(est.grandConcert.helloEnergyRecovered)} (${count(est.grandConcert.helloEnergyWasted)} lost at the cap). Fifth outing completed in ${Math.round(est.grandConcert.helloCompletions * 100)}% of runs; 18-song deadline reached in ${Math.round(est.grandConcert.special * 100)}%.</p><p class="mini">Event rate used: ${Math.round(est.grandConcert.helloProcRate * 100)}%. Outing unlock assumption: ${Math.round(est.grandConcert.helloUnlockRate * 100)}% per eligible turn. Shop and policy estimates can change deck rankings. Promo Live collaborators' +10 of each token is included; conditional link-character Performance rewards are omitted. Guest placements and random mood drops are still omitted. Song event levels are tracked; their numeric effect is an explicit experimental assumption.</p>` : ""}
    </details>`;
  }

  // Predicted rating: the stats' score, the skill points spent at the Parents tab's typical
  // rating per point, and the unique at her star level. SS doubles white sparks' 3★ chance.
  function predictedRatingHTML(r) {
    const PR = window.UmaRating, PP = window.UmaParentPlanner;
    if (!PR || !PP || !window.UmaParentData) return "";
    const t = r.simulationMeta && r.simulationMeta.trainee ? D.trainee(r.simulationMeta.trainee) : null;
    const stars = t ? t.r : 3;
    const stats = PR.statsScore(r.est.stats), skills = Math.round((r.est.sp || 0) * PP.SP_RATING), unique = PR.uniqueBonus(stars, stars);
    const total = stats + skills + unique;
    const rk = PR.rankOf(total);
    return `<p class="mini"><b>Predicted rating: about ${total.toLocaleString()} (${rk.label})</b>${total >= PR.SS ? ", SS: white sparks get the doubled 3★ chance" : `, about ${(PR.SS - total).toLocaleString()} short of SS (${PR.SS.toLocaleString()})`}. Stats ${stats.toLocaleString()} + skills ~${skills.toLocaleString()} (all ${r.est.sp} SP spent at ~${PP.SP_RATING} rating each) + unique ~${unique}${t ? "" : " (3★ assumed: set your trainee for her own)"}. Inheritance adds stats on top. Plan the exact buy in the <button type="button" class="linkish" data-goto-tab="parents">Parents tab</button>; fewer races also help.</p>`;
  }

  // Predicted stats from the simulated careers, against your targets when you set them.
  function predictedHTML(r) {
    if (!r.est) return "";
    const f = r.fit;
    const cell = (i) => {
      const s = E.STATS[i];
      if (!f) return `<td class="num">${r.est.stats[i]}</td>`;
      const t = Math.min(f.target[s], f.caps[s]);
      const d = r.est.stats[i] - t;
      return `<td class="num">${r.est.stats[i]}<div class="mini">${t}</div><div class="mini ${d < 0 ? "short" : "over"}">${d < 0 ? d : "+" + d}</div></td>`;
    };
    const parent = r.goal === "ace" || r.goal === "debuff";
    const blue = (x) => (x > 1100 ? 10 : x >= 600 ? 5 : 0);
    return `<div class="predicted">
      <b>${f ? "Predicted stats vs your targets" : "Predicted stats"}</b> <span class="mini">(average of ${r.est.runs || 16} simulated careers${f ? "; rows: predicted, target, difference" : ""})</span>
      <table class="pred"><thead><tr>${E.STATS.map((s) => `<th>${E.STAT_LABELS[s]}</th>`).join("")}</tr></thead>
        <tbody><tr>${E.STATS.map((_, i) => cell(i)).join("")}</tr>
        ${parent ? `<tr class="blue-row">${E.STATS.map((_, i) => `<td class="num"><span class="mini">3★ ${blue(r.est.stats[i])}%</span></td>`).join("")}</tr>` : ""}</tbody></table>
      <p class="mini">Skill points: about ${r.est.sp}.${parent ? " 3★: the chance of a 3-star blue spark if that stat is the one picked (uma.guide: 0% under 600, 5% to 1100, 10% over). Inheritance isn't in these numbers and adds more." : ""}</p>
      ${parent ? predictedRatingHTML(r) : ""}
      ${f ? `<p class="mini">${f.after.short ? Math.round(f.after.short) + " points short in all" : "Every target reached"}; Euophrys' pick alone: ${Math.round(f.before.short)} short.${f.swaps.length ? " Swapped for your targets: " + f.swaps.map((x) => esc(D.card(x.out).n) + " → " + esc(D.card(x.in).n)).join(", ") + "." : " Euophrys' pick was already the closest."}</p>` : ""}
      ${simulationDiagnosticsHTML(r)}
      <details class="pred-help"><summary>What the predicted stats include</summary>
        <p class="mini"><b>Included:</b> your trainee's starting stats and growth bonuses (100 each without a trainee); every training turn up to the finale, with your cards dealt onto trainings by their specialty priority and the best training picked for your targets each turn (rest when energy runs low, failures by energy); the game's training formula with friendship at bond 80+, training effectiveness, stat bonuses, mood effect and unique effects; facility levels (+1 per 4 trainings, level 5 at summer camp); bonds (+7 per training, +5 per hint, plus card events); ${r.est.supportEvents ? "parsed ordinary-support event choices with coupled stats, SP, energy, bond, mood and hints; whole-card aggregate fallbacks where incomplete;" : "each card's aggregate event stats, skill points and energy;"} about 120 per stat from random events; ${r.est.calendarAssumptions ? "scheduled goal and URA races with winning rewards and Race Bonus; optional races: " + (typeof r.est.races === "number" ? Math.round(r.est.races * 100) / 100 : "not reported") + " per career" : "optional races on " + (r.independent ? "about 1 turn in 4 (a G1-heavy Independent Training agenda)" : "about 1 turn in 10 after the debut (more in Trackblazer)") + " with your race bonus"}; half gains past 1200; your stat caps with sparks; ${r.est.grandConcert ? "Grand Concert Performance, sampled lesson shops, song mastery gains, delayed friendship/specialty buffs, concerts, and Light Hello's first/repeat/unlock events, five outings, max energy and completion-dependent ending" : "a flat multiplier for the scenario's own bonuses"}.</p>
        <p class="mini"><b>Not included, so add these yourself:</b> inheritance (the two inspiration events from your parents' sparks), ${r.est.calendarAssumptions ? "separate career-end and secret-event rewards" : "goal and finale race rewards"}, ${r.est.grandConcert ? "other Friend/Group outings, raw-text event conditions/free grants, guest placements, uncalibrated event-frequency magnitude, hint-event stats and random mood drops (Grand Concert starts at Normal mood and uses Recreation/Hello to raise it)" : "friend card outings, New Year events, hint-event stats, scenario mechanics beyond the flat multiplier, and mood drops (it assumes Great all career)"}. These are simplified estimates, not guaranteed results. Missing mechanics can change both the predicted stats and how decks compare.</p>
      </details>
    </div>`;
  }

  // How the deck covers each must-have: the chance it's offered and from which cards, or which
  // cards (outside the ones you can use) would give it.
  function mustResultHTML(r, c) {
    if (!r.must || !r.must.length) return "";
    const all = {};
    D.DATA.supports.filter((x) => D.onGlobal(x, TODAY)).forEach((x) => (x.hs || []).concat(x.es || []).forEach((id) => { (all[id] = all[id] || []).push(x); }));
    return `<div class="must-result"><b>Must-have skills</b><ul>${r.must.map((m) => {
      const name = skillNameHTML(m.id);
      if (m.p > 0) {
        const from = m.src.map((id) => { const cd = D.card(id); return esc(cd.n) + ((cd.es || []).map(String).indexOf(String(m.id)) !== -1 ? " (event)" : " (hint)"); }).join(", ");
        return `<li class="ok"><b>${name}</b>: about ${Math.round(m.p * 100)}% to be offered, from ${from}.</li>`;
      }
      if (!all[m.id]) return `<li class="miss"><b>${name}</b>: no support card on Global gives it (it comes from trainees or the scenario), so it can't shape the deck.</li>`;
      const others = all[m.id].filter((x) => !r.cards.some((y) => y.id === x.id)).sort((a, b) => b.r - a.r).slice(0, 4);
      return `<li class="miss"><b>${name}</b>: no card ${c.ownedOnly && ownedIds().length ? "you own" : "the optimizer could use"} gives it${Object.keys(c.comp).length ? " with this deck makeup" : ""}.${others.length ? " Cards that do: " + others.map((x) => esc(x.n) + " [" + esc(x.t) + "]").join(", ") + "." : ""}</li>`;
    }).join("")}</ul></div>`;
  }

  function cmSkills(p, c) {
    const status = svCache[p.id];
    const mine = pasted[p.id] && pasted[p.id][c.style];
    let rows = skillRows(p.id, c.style);
    const src = skillSources(c);
    const deckIds = new Set(state.deck.slots.filter(Boolean).map((sl) => sl.id));
    const trn = state.deck.trainee ? D.trainee(state.deck.trainee) : null;
    const known = new Set(trn ? trn.us.concat(trn.is, trn.as) : []);
    const q = (c.sq || "").trim().toLowerCase();
    rows = rows.filter((r) => {
      const info = skillInfo(r.id);
      if (c.globalSkills && !info[3]) return false;
      if (q && info[0].toLowerCase().indexOf(q) === -1) return false;
      if (c.sfilter === "cards" && !src[r.id]) return false;
      if (c.sfilter === "deck" && !(src[r.id] || []).some((x) => deckIds.has(x.id)) && !D.DATA.supports.some((x) => deckIds.has(x.id) && (x.hs || []).concat(x.es || []).indexOf(r.id) !== -1)) return false;
      return true;
    });
    const shown = rows.slice(0, skillLimit);
    const opt = (pairs, v) => pairs.map(([k, l]) => `<option value="${k}" ${String(v) === k ? "selected" : ""}>${l}</option>`).join("");
    const empty = status === "loading" ? "Loading skill values…"
      : status === "missing" && !mine ? "Skill values for this race haven't been simulated yet. Paste your own from the Umalator below."
      : status === "error" && !mine ? "Couldn't load the skill values. Check your connection and reopen this tab."
      : "No skills match.";
    return `<section class="panel cm-skills">
      <h3>Skills for this race · ${STYLE_LABEL[c.style]}</h3>
      <p class="mini">${mine ? "Using <b>your pasted Umalator results</b> for this race and style." : `Median length gain (L = one horse length) of each skill on this course, from <a href="https://alpha123.github.io/uma-tools/umalator-global/" target="_blank" rel="noopener">alpha123's Umalator</a>: the same skill chart, run here for every skill.`} SP totals include every required tier before hints. L per 100 SP uses that full price. The affordable-skill result applies the hints available in each simulated career.</p>
      <div class="db-controls">
        <label class="field grow"><span>Search</span><input data-cm="sq" value="${esc(c.sq || "")}" placeholder="Skill name" autocomplete="off"></label>
        <label class="field"><span>Show</span><select data-cm="sfilter">${opt([["all", "All skills"], ["cards", c.ownedOnly && ownedIds().length ? "Skills my cards can give" : "Skills Global cards can give"], ["deck", "Skills my coach deck can give"]], c.sfilter)}</select></label>
        <label class="chip-toggle"><input type="checkbox" data-cm="globalSkills" ${c.globalSkills ? "checked" : ""}> On Global only</label>
      </div>
      <div id="cmSkillTable">${shown.length ? `<div class="table-wrap"><table class="skills"><thead><tr><th>Skill</th><th class="num">Median</th>${mine ? "" : '<th class="num opt-col">Mean</th>'}<th class="num">SP total</th><th class="num">L / 100 SP</th><th class="opt-col">From cards</th></tr></thead><tbody>
        ${shown.map((r) => {
          const info = skillInfo(r.id);
          const cost = window.UmaSkillBudget.baseCost(r.id);
          const from = src[r.id] || [];
          const kind = info[2] === 2 ? "gold" : info[2] === 9 ? "inh" : "white";
          const must = c.must.indexOf(String(r.id)) !== -1;
          return `<tr class="sk-${kind}"><td><button type="button" class="must-tog" data-must="${r.id}" aria-pressed="${must}" title="${must ? "Remove from" : "Add to"} the deck optimizer's must-have skills">${must ? "★" : "☆"}</button> <b>${skillNameHTML(r.id, info[0])}</b>${info[3] ? "" : ' <span class="pill">JP</span>'}${known.has(r.id) ? ' <span class="pill" title="Your trainee has this unique, or can buy this innate/awakening skill">trainee skill</span>' : ""}</td><td class="num"><b>${r.L.toFixed(2)}</b></td>${mine ? "" : `<td class="num opt-col">${r.mean != null ? r.mean.toFixed(2) : "–"}</td>`}<td class="num">${cost == null ? "Unknown" : cost}</td><td class="num">${cost ? (r.L / cost * 100).toFixed(2) : "–"}</td><td class="mini opt-col">${from.slice(0, 3).map((x) => esc(x.n) + (deckIds.has(x.id) ? " ★" : "")).join(", ")}${from.length > 3 ? " +" + (from.length - 3) : ""}</td></tr>`;
        }).join("")}</tbody></table></div>
        ${rows.length > shown.length ? `<button type="button" class="btn ghost" data-cm-more="1">Show more (${rows.length - shown.length} left)</button>` : ""}` : `<div class="empty">${empty}</div>`}</div>
      <details class="paste">
        <summary>Use your own Umalator results</summary>
        <p class="mini">In the Umalator's <b>Skill chart</b> tab, set up your own uma for this race and run it, then select the whole results table, copy it and paste it here. The coach reads each skill's median and uses it for this race and running style (${STYLE_LABEL[c.style]}). For purchase comparisons, use a chart with no purchased skills; the Umalator's learned-skill list is not imported.</p>
        <textarea id="cmPaste" rows="5" placeholder="Paste the Skill chart table here"></textarea>
        <div class="row-wrap"><button type="button" class="btn small" id="cmPasteBtn">Use these values</button>${mine ? '<button type="button" class="btn ghost small" id="cmPasteReset">Go back to the built-in values</button>' : ""}</div>
      </details>
    </section>`;
  }

  function parseUmalator(text) {
    const names = {};
    Object.entries(D.DATA.skills).forEach(([id, n]) => { names[id] = n; });
    if (SV) Object.entries(SV.skills).forEach(([id, v]) => { names[id] = v[0]; });
    return OPT.parseChart(text, names);
  }

  function cmInput(el) {
    const c = cm();
    const k = el.dataset.cm;
    const v = el.type === "checkbox" ? el.checked : el.value;
    c[k] = v;
    save();
    if (k === "sq") {
      skillLimit = 60;
      const box = $("#cmSkillTable");
      const tmp = document.createElement("div");
      tmp.innerHTML = cmSkills(presetById(c.preset), c);
      const fresh = tmp.querySelector("#cmSkillTable");
      if (box && fresh) box.innerHTML = fresh.innerHTML;
      return;
    }
    if (k === "preset") skillLimit = 60;
    renderCM();
  }

  function cmClick(e) {
    const t = e.target;
    const c = state.tab === "cm" ? cm() : null;
    if (!c) return false;
    const style = t.closest("[data-cm-style]");
    if (style) { c.style = style.dataset.cmStyle; skillLimit = 60; save(); renderCM(); return true; }
    const build = t.closest("[data-cm-build]");
    if (build) { state.build = build.dataset.cmBuild; commit(true); flash("Turn coach build set to " + E.BUILDS[state.build].label); return true; }
    const goalBtn = t.closest("[data-cm-goal]");
    if (goalBtn) { c.goal = goalBtn.dataset.cmGoal; save(); renderCM(); return true; }
    if (t.closest("#compClear")) { c.comp = {}; save(); renderCM(); return true; }
    if (t.closest("#cmRun")) {
      const fixed = Object.values(c.comp).reduce((a, b) => a + b, 0);
      if (fixed > 6) { flash("The deck makeup adds up to " + fixed + " cards. A deck has 6."); return true; }
      runOptimizer();
      return true;
    }
    if (t.closest("#cmWish")) { runWishlist(); return true; }
    if (t.closest("#cmSensitivity")) { runSensitivity(); return true; }
    if (t.closest("[data-goto-tab]")) { state.tab = t.closest("[data-goto-tab]").dataset.gotoTab; save(); renderTab(); return true; }
    if (t.closest("#cmLockAdd")) {
      const card = cardByLabel.get($("#cmLock").value.trim());
      if (!card) { flash("Pick a card from the list first."); return true; }
      if (c.locked.indexOf(card.id) === -1) c.locked.push(card.id);
      if (c.ownedOnly && owned[card.id] == null) flash(card.n + " isn't marked as owned, so it can only come in as the borrowed card.");
      save();
      renderCM();
      return true;
    }
    if (t.closest("#cmTgCoach")) { c.targets = Object.assign({}, state.targets); save(); renderCM(); return true; }
    if (t.closest("#cmTgClear")) { c.targets = {}; save(); renderCM(); return true; }
    if (t.closest("#cmTgDebuffer")) { c.targets = Object.assign({}, E.BUILDS[presetById(c.preset).build].target, { wit: 1200 }); save(); renderCM(); return true; }
    if (t.closest("#cmTgSpark")) { c.targets = { speed: 1100, stamina: 1100, power: 1100, guts: 1100, wit: 1100 }; save(); renderCM(); return true; }
    if (t.closest("#cmMustAdd")) {
      const id = skillIdByName($("#cmMust").value);
      if (!id) { flash("Pick a skill from the list first. It lists the skills support cards can give."); return true; }
      if (c.must.indexOf(id) === -1) c.must.push(id);
      save();
      renderCM();
      return true;
    }
    const md = t.closest("[data-must-del]");
    if (md) { c.must = c.must.filter((id) => id !== md.dataset.mustDel); save(); renderCM(); return true; }
    const mt = t.closest("[data-must]");
    if (mt) {
      const id = String(mt.dataset.must);
      c.must = c.must.indexOf(id) === -1 ? c.must.concat([id]) : c.must.filter((x) => x !== id);
      save();
      renderCM();
      return true;
    }
    const un = t.closest("[data-cm-unlock]");
    if (un) { c.locked = c.locked.filter((id) => id !== +un.dataset.cmUnlock); save(); renderCM(); return true; }
    if (t.closest("[data-use-opt]") && optResult) {
      state.deck.slots = optResult.cards.map((x) => ({ id: x.id, lb: x.lb, bond: null }));
      state.facilities.forEach((f) => { f.members = []; f.hints = []; });
      commit(true);
      flash("Deck set in Trainee and deck" + (optResult.cards.some((x) => x.borrowed) ? ". Remember to borrow the marked card." : ""));
      return true;
    }
    if (t.closest("[data-cm-more]")) { skillLimit += 60; renderCM(); return true; }
    if (t.closest("#cmPasteBtn")) {
      const r = parseUmalator($("#cmPaste").value);
      const n = Object.keys(r.values).length;
      if (!n) { flash("Couldn't find any skills with values like “1.23 L” in that text."); return true; }
      pasted[c.preset] = pasted[c.preset] || {};
      pasted[c.preset][c.style] = r.values;
      savePasted();
      flash("Read " + n + " skills" + (r.unknown ? ", " + r.unknown + " names not recognized" : ""));
      renderCM();
      return true;
    }
    if (t.closest("#cmPasteReset")) {
      if (pasted[c.preset]) delete pasted[c.preset][c.style];
      savePasted();
      renderCM();
      return true;
    }
    return false;
  }

  // ---- Tier list: Euophrys' ranking plus skills ----
  const TIER_NAMES = ["S", "A", "B", "C", "D", "E", "F"];
  const TIER_TYPES = [["speed", "Speed"], ["stamina", "Stamina"], ["power", "Power"], ["guts", "Guts"], ["wit", "Wit"], ["friend", "Friend and Group"]];
  const TIER_SHOW = [
    ["", "Nothing"], ["score", "Score (Euophrys + skills)"], ["skills", "Best skills (L)"], ["evbond", "Event bond"], ["bond", "Initial bond"], ["race", "Race bonus"],
    ["fs", "Friendship bonus"], ["te", "Training effectiveness"], ["spec", "Specialty priority"], ["mood", "Mood effect"], ["hint", "Hint frequency"], ["it", "Independent Training strengths"]
  ];
  // Euophrys' Global preset decks.
  const EU_PRESETS = [["Speed + Power", [30028, 20031, 20033, 20009, 20003]], ["Speed + Stamina", [30028, 20031, 20033, 20008, 30022]], ["Speed + Wit", [30028, 20031, 20033, 20012, 20002]], ["Guts + Wit", [30011, 30030, 30019, 20012, 20002]], ["Race bonus", [20031, 30074, 20027, 20012, 30054]]];

  function tier() {
    if (!state.tier) state.tier = {};
    const t = state.tier;
    const d = { type: "speed", lbs: "all", global: true, ownedOnly: false, rarity: "2", deck: [], show1: "score", show2: "skills" };
    Object.keys(d).forEach((k) => { if (t[k] == null) t[k] = d[k]; });
    if (!TIER_TYPES.some((x) => x[0] === t.type)) t.type = "speed";
    return t;
  }

  function tierCandidates(t) {
    const types = t.type === "friend" ? ["friend", "group"] : [t.type];
    let cards = D.DATA.supports.filter((c) => (!t.global || D.onGlobal(c, TODAY) || owned[c.id] != null) && types.indexOf(c.ty) !== -1 && c.r >= +t.rarity);
    if (t.ownedOnly) cards = cards.filter((c) => owned[c.id] != null);
    const out = [];
    cards.forEach((c) => {
      const mine = owned[c.id];
      if (t.ownedOnly || (t.lbs === "own" && mine != null)) out.push({ id: c.id, lb: mine });
      else if (t.lbs === "own" || t.lbs === "4") out.push({ id: c.id, lb: 4 });
      else for (let lb = 0; lb <= 4; lb++) out.push({ id: c.id, lb });
    });
    return out;
  }

  const tierTrainee = () => state.deck.trainee;

  function stylesFor(tr) {
    const rank = (g) => "GFEDCBAS".indexOf(g);
    return STYLES.map(([k, l], i) => [k, l, tr.apt[6 + i]]).sort((a, b) => rank(b[2]) - rank(a[2]));
  }

  function traineePickerHTML(p, styleAttr) {
    const tr = state.deck.trainee ? D.trainee(state.deck.trainee) : null;
    const label = tr ? traineeLabel(tr) : "";
    let info = '<span class="mini">No trainee: cards are ranked without growth bonuses.</span>';
    if (tr) {
      const distIdx = { Sprint: 2, Mile: 3, Medium: 4, Long: 5 }[p.course.dist];
      const surf = tr.apt[p.course.surface === "Dirt" ? 1 : 0];
      const dist = tr.apt[distIdx];
      const best = stylesFor(tr)[0];
      const weak = "GFEDCB".indexOf(surf) !== -1 || "GFEDCB".indexOf(dist) !== -1;
      info = `<span class="mini">Growth: <b>${growthText(tr)}</b> · ${esc(p.course.surface)} <b>${surf}</b> · ${esc(p.course.dist)} <b>${dist}</b> · best style ${esc(best[1])} <b>${best[2]}</b>. Her own character's cards are left out.</span>
        <span class="mini">Not counted from card hints (she already has them): ${esc(tr.us.concat(tr.is).map((id) => D.DATA.skills[id] || "#" + id).join(", "))}${tr.as.length ? "; awakening skills: " + esc(tr.as.map((id) => D.DATA.skills[id] || "#" + id).join(", ")) : ""}.</span>
        ${cm().style !== best[0] ? `<button type="button" class="btn ghost small" ${styleAttr}="${best[0]}">Use her best style: ${esc(best[1])}</button>` : ""}
        ${weak ? `<span class="mini warn">Her aptitude for this race is below A, so she'll race at a penalty.</span>` : ""}`;
    }
    return `<div class="row-wrap tier-trainee">
      <label class="field grow"><span>Trainee (shared with the coach)</span><input data-pick-trainee="1" list="traineeList" value="${esc(label)}" placeholder="Type a trainee name" autocomplete="off"></label>
      ${info}
    </div>`;
  }

  // What a card's Independent Training value rests on (tiers.js rank's `it` parts).
  function itPartsText(it) {
    const parts = [];
    if (it.initialStats) parts.push("Initial stats +" + it.initialStats);
    if (it.initialSp) parts.push("Initial SP +" + it.initialSp);
    if (it.spBonus) parts.push("SP bonus " + it.spBonus);
    if (it.raceBonus) parts.push("Race bonus " + it.raceBonus + "%");
    if (it.hint.lv) parts.push("Hint Lv +" + it.hint.lv);
    if (it.hint.rate > 1) parts.push("Hint freq. ×" + (+it.hint.rate).toFixed(2));
    return parts.length ? parts.join(" · ") : '<span class="mini">no Independent Training strengths</span>';
  }

  function tierInfo(x, card, what) {
    const lv = D.levelFor(card, x.lb);
    const fx = D.baseEffects(card, lv);
    switch (what) {
      case "score": return `<b>${Math.round(x.score)}</b> <span class="mini">(${Math.round(x.base)}${x.skill >= 0.5 ? " + " + Math.round(x.skill) + " skills" : ""})</span>`;
      case "skills": return x.skills.length ? x.skills.map((s) => skillNameHTML(s.id, skillInfo(s.id)[0]) + " " + s.L.toFixed(2) + "L").join(", ") : '<span class="mini">no strong skills here</span>';
      case "evbond": { const ev = D.eventRewards(card); return "Event bond +" + ev.bond + (ev.known ? "" : " (est.)"); }
      case "bond": return "Initial bond " + (fx[14] || 0);
      case "race": return "Race bonus " + (fx[15] || 0) + "%";
      case "fs": return "Friendship " + (fx[1] || 0) + "%";
      case "te": return "Training eff. " + (fx[8] || 0) + "%";
      case "spec": return "Specialty " + (fx[19] || 0);
      case "mood": return "Mood effect " + (fx[2] || 0) + "%";
      case "hint": return "Hint freq. " + (fx[18] || 0) + "%";
      case "it": return x.it ? itPartsText(x.it) : '<span class="mini">tick Independent Training</span>';
      default: return "";
    }
  }

  function renderTiers() {
    const body = $("#tabBody");
    const t = tier();
    const c = cm();
    const p = presetById(c.preset);
    loadSkillValues(p.id);
    const ready = euReady();
    const opt = (pairs, v) => pairs.map(([k, l]) => `<option value="${k}" ${String(v) === k ? "selected" : ""}>${esc(l)}</option>`).join("");
    const presetOpts = P.list.filter((x) => x.global.end >= TODAY || x.kind === "loh").concat(P.list.filter((x) => x.global.end < TODAY).reverse())
      .map((x) => `<option value="${x.id}" ${x.id === p.id ? "selected" : ""}>${esc(presetLabel(x))}</option>`).join("");
    const types = t.type === "friend" ? ["friend", "group"] : [t.type];
    const nType = t.deck.filter((x) => types.indexOf(D.card(x.id).ty) !== -1).length;
    const ord = ["1st", "2nd", "3rd", "4th", "5th", "6th"][Math.min(5, nType)];
    const typeName = TIER_TYPES.find((x) => x[0] === t.type)[1];
    let tiersHTML = '<div class="empty">Loading the tier list data…</div>';
    if (ready) {
      const cands = tierCandidates(t);
      const opts = euOpts(c, p);
      let res = [];
      types.forEach((ty) => { res = res.concat(T.rank(opts, ty, t.deck, cands.filter((x) => D.card(x.id).ty === ty))); });
      res.sort((a, b) => b.score - a.score);
      if (res.length) {
        const top = res[0].score;
        const step = Math.max(1e-6, (top - res[res.length - 1].score) / 7);
        const rows = TIER_NAMES.map(() => []);
        res.forEach((x) => { rows[Math.min(6, Math.floor((top - x.score) / step))].push(x); });
        tiersHTML = `<div class="tiers">${rows.map((r, i) => `<div class="tier-row"><div class="tier-name t${i}">${TIER_NAMES[i]}</div><div class="tier-cards">${r.map((x) => {
          const card = D.card(x.id);
          const own = owned[x.id];
          return `<button type="button" class="tcard ty-${card.ty}${own != null && own >= x.lb ? " owned" : ""}" data-tier-add="${x.id}" data-lb="${x.lb}" title="${esc(D.label(card))} LB${x.lb}: Euophrys ${Math.round(x.base)} + skills ${Math.round(x.skill)}. Tap to add to the deck.">
            <span class="tc-top"><span class="tydot" aria-hidden="true"></span><b>${esc(card.n)}</b><span class="tc-lb">LB${x.lb}</span></span>
            <span class="tc-title">${esc(card.t)} · ${D.RARITY[card.r]}${own != null ? ` · <span class="tc-own">owned LB${own}</span>` : ""}</span>
            ${t.show1 ? `<span class="tc-info">${tierInfo(x, card, t.show1)}</span>` : ""}
            ${t.show2 ? `<span class="tc-info">${tierInfo(x, card, t.show2)}</span>` : ""}
          </button>`;
        }).join("")}</div></div>`).join("")}</div>`;
      } else {
        tiersHTML = `<div class="empty">No cards match these filters${t.ownedOnly ? " (mark your cards in the Support cards tab)" : ""}.</div>`;
      }
    }
    const nSkills = Object.keys(skillMap(p.id, c.style).map).length;
    body.innerHTML = `<div class="cm">
      <section class="panel tier-ctl">
        <h2>Tier list</h2>
        <p class="mini"><a href="https://euophrys.github.io/uma-tiers/" target="_blank" rel="noopener">Euophrys' tier list</a>, with skills added. The base score is Euophrys' own formula and scenario weights: the extra stats a card adds to the deck you have so far. On top comes a skill score: ${c.goal === "race" ? "the skills the card can hint" : "parent targets available directly or through gold prerequisites"}, valued by their median length gain on the race below (1 L counts like 60 Speed) plus the SP the hint discount saves, not counting skills your deck or trainee already cover. The total is Euophrys' score plus the skill score. Tap a card to add it and the list re-ranks for your next pick.</p>
        <div class="db-controls">
          <label class="field"><span>Card type</span><select data-tier="type">${opt(TIER_TYPES, t.type)}</select></label>
          <label class="field"><span>Rarity</span><select data-tier="rarity">${opt([["1", "SSR, SR and R"], ["2", "SSR and SR"], ["3", "SSR only"]], t.rarity)}</select></label>
          <label class="field"><span>Limit breaks</span><select data-tier="lbs">${opt([["all", "Every limit break"], ["4", "LB4 only"], ["own", "Mine (LB4 if not owned)"]], t.lbs)}</select></label>
          <label class="chip-toggle"><input type="checkbox" data-tier="global" ${t.global ? "checked" : ""}> Global only</label>
          <label class="chip-toggle"><input type="checkbox" data-tier="ownedOnly" ${t.ownedOnly ? "checked" : ""}> Cards I own</label>
        </div>
        <div class="db-controls">
          <label class="field grow"><span>Race for skill values</span><select data-tier="preset">${presetOpts}</select></label>
          <div class="field"><span>Running style</span><div class="seg style-seg" role="radiogroup">${STYLES.map(([k, l]) => `<button type="button" role="radio" aria-checked="${c.style === k}" data-tier-style="${k}">${l}</button>`).join("")}</div></div>
          <label class="field"><span>Skill hints count</span><select data-tier="skillW">${opt(SKILL_W, c.skillW)}</select></label>
          <label class="chip-toggle" title="The 50-minute auto mode: skills only a card's 3rd chain event gives count much less, and Race Bonus counts for a G1-heavy agenda"><input type="checkbox" data-tier="independent" ${c.independent ? "checked" : ""}> Independent Training</label>
          ${c.independent ? `<label class="field"><span>Friendship, Mood, Training eff. count</span><select data-tier="itManual">${opt(IT_MANUAL_OPTS, c.itManual)}</select></label>` : ""}
          <label class="field"><span>Show</span><select data-tier="show1">${opt(TIER_SHOW, t.show1)}</select></label>
          <label class="field"><span>and</span><select data-tier="show2">${opt(TIER_SHOW, t.show2)}</select></label>
        </div>
        ${nSkills ? "" : `<p class="mini warn">No skill values for this race yet${svCache[p.id] === "loading" ? " (loading…)" : ""}, so this is Euophrys' ranking alone.</p>`}
        ${traineePickerHTML(p, "data-tier-style")}
        ${euSettingsHTML(t.type)}
        <div class="tier-deck">
          <span class="mini"><b>Your deck so far</b> (${t.deck.length}/6):</span>
          ${t.deck.map((x, i) => `<span class="chip lockchip ty-${D.card(x.id).ty}"><span class="tydot"></span>${esc(D.card(x.id).n)} LB${x.lb} <button type="button" class="linkish" data-tier-remove="${i}" aria-label="Remove">✕</button></span>`).join("") || '<span class="mini">empty: this ranks your first card</span>'}
          <button type="button" class="btn ghost small" id="tierFromCoach">Load my coach deck</button>
          <select class="btn ghost small" data-tier-preset="1" aria-label="Start from one of Euophrys' preset decks"><option value="">Euophrys preset deck…</option>${EU_PRESETS.map(([l], i) => `<option value="${i}">${esc(l)}</option>`).join("")}</select>
          ${t.deck.length ? '<button type="button" class="btn ghost small" id="tierClear">Clear</button><button type="button" class="btn ghost small" id="tierToCoach">Use in the coach</button>' : ""}
        </div>
      </section>
      <section class="panel">
        <h3>Ranking for your ${ord} ${esc(typeName)} card</h3>
        ${tiersHTML}
        <p class="mini">Tiers split the score range into 7 equal bands, like Euophrys' list. A green ring means you own the card at that limit break or higher.</p>
      </section>
    </div>`;
  }

  function tierInput(el) {
    const t = tier();
    const c = cm();
    const k = el.dataset.tier;
    const v = el.type === "checkbox" ? el.checked : el.value;
    if (k === "preset") c.preset = v;
    else if (k === "skillW") c.skillW = v;
    else if (k === "independent") c.independent = v;
    else if (k === "itManual") c.itManual = v;
    else t[k] = v;
    save();
    renderTiers();
  }

  function tierClick(e) {
    if (state.tab !== "tiers") return false;
    const t = tier();
    const el = e.target;
    const add = el.closest("[data-tier-add]");
    if (add) {
      if (t.deck.length >= 6) { flash("The deck is full. Remove a card first."); return true; }
      const card = D.card(+add.dataset.tierAdd);
      t.deck.push({ id: card.id, lb: +add.dataset.lb });
      save();
      flash(card.n + " LB" + add.dataset.lb + " added");
      renderTiers();
      return true;
    }
    const rm = el.closest("[data-tier-remove]");
    if (rm) { t.deck.splice(+rm.dataset.tierRemove, 1); save(); renderTiers(); return true; }
    const st = el.closest("[data-tier-style]");
    if (st) { cm().style = st.dataset.tierStyle; save(); renderTiers(); return true; }
    if (el.closest("#tierFromCoach")) { t.deck = state.deck.slots.filter(Boolean).map((sl) => ({ id: sl.id, lb: sl.lb })); save(); renderTiers(); return true; }
    if (el.closest("#tierClear")) { t.deck = []; save(); renderTiers(); return true; }
    if (el.closest("#tierToCoach")) {
      state.deck.slots = [0, 1, 2, 3, 4, 5].map((i) => (t.deck[i] ? { id: t.deck[i].id, lb: t.deck[i].lb, bond: null } : null));
      state.facilities.forEach((f) => { f.members = []; f.hints = []; });
      commit(true);
      flash("Deck set in Trainee and deck");
      return true;
    }
    return false;
  }

  function renderTab() {
    const sc = scenario();
    $$(".tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === state.tab)));
    const body = $("#tabBody");
    if (state.tab === "tiers" && HAS_DATA) {
      renderTiers();
      return;
    }
    if (state.tab === "cm" && HAS_DATA) {
      renderCM();
      return;
    }
    if (state.tab === "parents" && HAS_DATA && parents()) {
      parents().render(body);
      return;
    }
    if ((state.tab === "cards" || state.tab === "trainees") && HAS_DATA) {
      body.innerHTML = dbControls();
      renderDbList();
      return;
    }
    if (state.tab === "guide") {
      body.innerHTML = `
        <div class="guide">
          <div class="guide-head">
            <h2>${esc(sc.name)}</h2>
            <div class="jp">${esc(sc.jpName)}${sc.aka ? " · also called " + esc(sc.aka) : ""}</div>
            <div class="chips"><span class="chip st-${sc.status}">${STATUS_LABELS[sc.status]}</span><span class="chip">JP ${esc(sc.jpRelease)}</span><span class="chip">Global ${esc(sc.globalRelease)}</span><span class="chip">${sc.totalTurns} turns</span></div>
            <div class="caps-row">${E.STATS.map((s, i) => `<span class="cap s-${s}"><b>${E.STAT_LABELS[s]}</b> ${sc.caps[i]}</span>`).join("")}<span class="mini">base stat caps</span></div>
          </div>
          <p class="lede">${esc(sc.summary)}</p>
          <div class="cols">
            <div><h3>How to play it</h3><ol class="loop">${sc.coreLoop.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>
            <div>
              <h3>Deck</h3><p>${esc(sc.deck)}</p>
              ${sc.keyCards.length ? `<h3>Key cards</h3><ul>${sc.keyCards.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
              <h3>Finale</h3><p><b>${esc(sc.finale.name)}.</b> ${esc(sc.finale.note)}</p>
            </div>
          </div>
        </div>`;
    } else if (state.tab === "all") {
      body.innerHTML = `<div class="table-wrap"><table class="all"><thead><tr><th>#</th><th>Scenario</th><th>Status</th><th>JP release</th><th>Global</th><th>Caps (Spd/Sta/Pow/Gut/Wit)</th><th></th></tr></thead><tbody>${SCENARIOS.map((s, i) => `
        <tr class="${s.id === sc.id ? "cur" : ""}"><td class="num">${i + 1}</td><td><b>${esc(s.name)}</b><div class="jp">${esc(s.jpName)}</div></td><td><span class="chip st-${s.status}">${STATUS_LABELS[s.status]}</span></td><td class="num">${esc(s.jpRelease)}</td><td>${esc(s.globalRelease)}</td><td class="num">${s.caps.join("/")}</td><td><button type="button" class="btn ghost small" data-pick="${s.id}">Open</button></td></tr>`).join("")}</tbody></table></div>
        <p class="mini">Global has added a scenario about every four months. Grand Masters is next, then the JP order continues: L'Arc, UAF, Great Food Festival, Mecha, Legends, Island, Onsen, Beyond Dreams, Trecen-ken.</p>`;
    } else if (state.tab === "log") {
      const log = state.log || [];
      body.innerHTML = log.length
        ? `<div class="table-wrap"><table class="plan"><thead><tr><th>Turn</th><th>Date</th><th>Action</th><th>Energy</th><th>Mood</th></tr></thead><tbody>${log.slice().reverse().map((l) => `
            <tr><td class="num"><button type="button" class="linkish" data-goto="${l.turn}">${l.turn}</button></td><td>${esc(E.turnInfo(l.turn, sc).text)}</td><td class="k-${l.kind}${l.stat ? " s-" + l.stat : ""}"><span class="logdot"></span>${esc(l.label)}</td><td class="num">${l.energy}</td><td>${E.MOODS[l.mood]}</td></tr>`).join("")}</tbody></table></div>
            <div class="log-actions"><button type="button" class="btn ghost" data-undo="1">Undo last turn</button><span class="mini">${log.length} turn(s) logged. ${summary(log)}</span></div>`
        : `<div class="empty"><b>No turns logged yet.</b> Press <b>Done, next turn</b> after each turn and your run builds up here. Energy and mood carry forward, and the coach learns your deck strength from any gains you type.</div>`;
      body.insertAdjacentHTML("afterbegin", `<details class="panel report" data-run-export><summary>Detailed run report</summary><p class="mini">Includes logged choices, training inputs, shop purchases, token changes and concert progress. Entered values and estimates are identified. Older turns have partial history.</p><textarea data-run-why rows="2" placeholder="What should be checked?">${esc(runWhy)}</textarea><div class="row-wrap"><button type="button" class="btn ghost small" data-run-copy>Copy full run report</button><button type="button" class="btn ghost small" data-run-download>Download run JSON</button></div><textarea data-run-output rows="6" readonly hidden></textarea></details>`);
    } else {
      const logged = new Map((state.log || []).map((l) => [l.turn, l]));
      let rows = "";
      for (let t = 1; t <= sc.totalTurns; t++) {
        const ev = E.eventsFor(t, sc, state);
        const ph = E.phaseFor(t, sc);
        const prev = t > 1 ? E.phaseFor(t - 1, sc).id : null;
        if (ph.id !== prev) rows += `<tr class="phase-row"><td colspan="3"><b>${esc(ph.name)}</b> ${esc(ph.tip)}</td></tr>`;
        const l = logged.get(t);
        if (!ev.length && t !== state.turn && !l) continue;
        const what = ev.map((e) => `<b>${esc(e.label)}</b> ${esc(e.tip || "")}`).concat(l ? [`<span class="muted">✓ ${esc(l.label)}</span>`] : []).join("<br>");
        rows += `<tr class="${t === state.turn ? "cur" : ""}"><td class="num"><button type="button" class="linkish" data-goto="${t}">${t}</button></td><td>${esc(E.turnInfo(t, sc).text)}${E.isCamp(t, sc) ? ' <span class="chip camp">camp</span>' : ""}</td><td>${what || '<span class="muted">You are here</span>'}</td></tr>`;
      }
      body.innerHTML = `<div class="table-wrap"><table class="plan"><thead><tr><th>Turn</th><th>Date</th><th>What matters</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
  }

  function summary(log) {
    const c = {};
    log.forEach((l) => { const k = l.kind === "train" ? E.STAT_LABELS[l.stat] : l.kind; c[k] = (c[k] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => n + " " + k).join(", ");
  }

  function renderOutputs() {
    renderQuickEvents();
    syncLight();
    renderCall();
    renderOptions();
    syncPlaceholders();
    if (state.tab === "plan" || state.tab === "log") renderTab();
  }

  function render() {
    renderStrip();
    renderInputs();
    syncLight();
    renderCall();
    renderOptions();
    syncPlaceholders();
    renderTab();
  }

  shell();
  fillLists();
  render();
})();
