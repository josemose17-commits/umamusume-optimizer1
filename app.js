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
  const CARD_RELEASE = window.UmaCardRelease.create(window.UmaBanners, TODAY);
  const ACCESS = window.UmaSkillAccess.create();
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
      pcm: k.pcm || null,
      cmp: k.cmp || null,
      contest: k.contest || {},
      cmLog: k.cmLog || {},
      pull: k.pull || null,
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
  // Cards and outfits you won't use (deck.js keeps them out of every search and suggestion).
  // { cards, trainees }: hidden by hand; halloween: the standing rule (new Halloween cards and
  // outfits from the daily data are left out too), keep: the Halloween ones you brought back.
  const hiddenList = () => {
    const h = (state.hidden = state.hidden || { cards: [], trainees: [] });
    if (!h.keep) h.keep = { cards: [], trainees: [] };
    // Lists saved by the one-time "Hide Halloween" button become the standing rule.
    if (h.halloween == null) {
      const hw = D.halloween(), has = new Set(h.cards.map(Number));
      if (hw.cards.length && hw.cards.every((id) => has.has(id))) {
        h.halloween = true;
        const hc = new Set(hw.cards), ht = new Set(hw.trainees), hadT = new Set(h.trainees.map(Number));
        h.keep.trainees = hw.trainees.filter((id) => !hadT.has(id));
        h.cards = h.cards.filter((id) => !hc.has(+id)); h.trainees = h.trainees.filter((id) => !ht.has(+id));
      } else h.halloween = false;
    }
    return h;
  };
  // Hide or bring back one card (kind "cards") or outfit ("trainees"): a Halloween one under the
  // rule moves in or out of keep; anything else in or out of your own list.
  function setHidden(kind, ids, on) {
    const h = hiddenList(), hw = h.halloween ? new Set(D.halloween()[kind]) : new Set();
    const mine = new Set(h[kind].map(Number)), keep = new Set(h.keep[kind].map(Number));
    ids.forEach((id) => {
      id = +id;
      if (hw.has(id)) { if (on) keep.delete(id); else keep.add(id); }
      else if (on) mine.add(id); else mine.delete(id);
    });
    h[kind] = [...mine].sort((a, b) => a - b); h.keep[kind] = [...keep].sort((a, b) => a - b);
    D.setHidden(h); save();
  }
  D.setHidden(hiddenList());
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
  const ownedCode = () => D.encodeOwned(owned, state.hidden);
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
        <button type="button" role="tab" data-tab="skillopt" id="tabSkillOpt">Skill optimizer</button>
        <button type="button" role="tab" data-tab="parents" id="tabParents">Parents</button>
        <button type="button" role="tab" data-tab="tiers" id="tabTiers">Tier list</button>
        <button type="button" role="tab" data-tab="pulls" id="tabPulls">Pull planner</button>
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
      $("#tabSkillOpt").hidden = true;
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
      if (state.tab === "pulls" && pulls() && pulls().click(e)) return;
      if (state.tab === "cm" && cmLogClick(e.target)) return;
      if (state.tab === "skillopt" && soClick(e)) return;
      if (deckTab() && cmPlan() && cmPlan().click(e)) return;
      const nav = e.target.closest("[data-goto-tab]");
      if (nav) {
        const dest = nav.dataset.gotoTab === "cmplan" ? "cm" : nav.dataset.gotoTab;
        state.tab = dest;
        save(); renderTab();
        if (nav.dataset.gotoSection) showSection(nav.dataset.gotoSection);
        else window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
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
      const hc = e.target.closest("[data-hide-card]");
      if (hc) { const id = +hc.dataset.hideCard, on = !D.isHidden(id); setHidden("cards", [id], on); flash(D.card(id).n + " [" + D.card(id).t + "] " + (on ? "won't be used: it's left out of deck searches and suggestions." : "can be used again.")); renderTab(); return; }
      const ht = e.target.closest("[data-hide-trainee]");
      if (ht) { const id = +ht.dataset.hideTrainee; setHidden("trainees", [id], !D.isHiddenTrainee(id)); renderTab(); return; }
      if (e.target.closest("#hideHalloween")) {
        const h = hiddenList();
        h.halloween = !h.halloween; if (!h.halloween) h.keep = { cards: [], trainees: [] };
        D.setHidden(h); save();
        const hw = D.halloween();
        flash(h.halloween ? `Halloween cards and outfits are left out: ${hw.cards.length} cards and ${hw.trainees.length} outfits today, and new ones as the data adds them.` : "Halloween cards and outfits can be used again.");
        renderTab(); return;
      }
      if (e.target.closest("#unhideAll")) { state.hidden = { cards: [], trainees: [], halloween: false, keep: { cards: [], trainees: [] } }; D.setHidden(state.hidden); save(); renderTab(); return; }
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
        const hid = D.decodeHidden($("#ownImportCode").value);
        if (hid) { state.hidden = Object.assign({ halloween: false, keep: { cards: [], trainees: [] } }, hid); D.setHidden(state.hidden); save(); }
        flash("Restored " + Object.keys(got).length + " cards" + (hid ? ", and " + (hid.cards.length + hid.trainees.length) + " cards and outfits you don't use" : ""));
        renderTab();
        fillLists();
        return;
      }
      if (cmClick(e)) return;
      if (tierClick(e)) return;
      const euSum = e.target.closest(".eu-settings > summary");
      if (euSum) euOpen = !euSum.parentElement.open;
      const ppSum = e.target.closest(".pp-skills > summary");
      if (ppSum) ppSkillsOpen = !ppSum.parentElement.open;
      if (e.target.closest('#euReset, [data-cm-id="euReset"]')) { eu().over[euScen()] = { general: {}, tabs: {} }; save(); renderTab(); return; }
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
        [...deckJobs.values()].forEach((j) => { j.optResult = null; });
        fillLists();
        renderDbList();
        return;
      }
      const row = e.target.closest("[data-db-row]");
      if (row) { const id = +row.dataset.dbRow; db().open = db().open === id ? null : id; renderDbList(); }
    });
    // Euophrys weight edits re-rank once you leave the box (or tick a box).
    $("#tabBody").addEventListener("change", (e) => { if (state.tab === "parents" && parents()) parents().change(e); });
    $("#tabBody").addEventListener("change", (e) => { if (state.tab === "pulls" && pulls()) pulls().change(e); });
    $("#tabBody").addEventListener("change", (e) => { if (state.tab === "skillopt") soChange(e); });
    $("#tabBody").addEventListener("change", (e) => { if (deckTab() && cmPlan()) cmPlan().change(e); });
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
        const comp = cm(deckHost(e.target)).comp;
        if (e.target.value === "") delete comp[e.target.dataset.cmComp]; else comp[e.target.dataset.cmComp] = +e.target.value;
        save();
        renderCM();
        return;
      }
      if (e.target.dataset.cmTarget != null) {
        const tg = cm(deckHost(e.target)).targets;
        const v = +e.target.value;
        if (v > 0) tg[e.target.dataset.cmTarget] = v; else delete tg[e.target.dataset.cmTarget];
        save();
        return;
      }
      if (e.target.dataset.cmContest != null) {
        state.contest = state.contest || {};
        const v = +e.target.value;
        if (v > 0) state.contest[e.target.dataset.cmContest] = v; else delete state.contest[e.target.dataset.cmContest];
        skillLimit = 60; save(); renderCM(); return;
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
      if (e.target.dataset.ownTrainee) {
        const id = +e.target.dataset.ownTrainee, mine = myUmas();
        if (e.target.checked) mine.add(id); else mine.delete(id);
        setMyUmas(mine);
        if (db().town) renderDbList();
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
      <label class="field"><span>Collection</span><select data-db="town">${opt([["", "All umas"], ["yes", "Umas I own"], ["no", "Umas I don't own"]], d.town || "")}</select></label>
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
      const mine = myUmas();
      if (d.town) list = list.filter((t) => (d.town === "yes") === mine.has(t.id));
      list.sort((a, b) => a.n.localeCompare(b.n));
      el.innerHTML = `<p class="mini">${list.length} trainee${list.length === 1 ? "" : "s"}. Tick <b>Own</b> on the umas you have (${mine.size} ticked): CM &amp; decks picks your team from them and Parents picks Parent 1. Importing your veterans ticks the versions you've trained.</p>
        <div class="table-wrap"><table class="trainees"><thead><tr><th>Own</th><th>Trainee</th><th>Aptitudes (surface · distance · style)</th><th>Growth</th><th>Unique skill</th><th></th></tr></thead><tbody>
        ${list.map((t) => `<tr${state.deck.trainee === t.id ? ' class="cur"' : ""}><td><input type="checkbox" data-own-trainee="${t.id}" aria-label="I own ${esc(t.n)} [${esc(t.t)}]"${mine.has(t.id) ? " checked" : ""}></td><td><b>${esc(t.n)}</b><div class="jp">${esc(t.t)} · ${"★".repeat(t.r)}${t.en ? " · Global " + t.en : " · JP " + t.jp}</div></td><td>${aptChips(t)}</td><td>${growthText(t)}</td><td>${esc(t.us.map((id) => D.DATA.skills[id] || id).join(", "))}</td><td><button type="button" class="btn ghost small" data-use-trainee="${t.id}">Use</button> <button type="button" class="linkish" data-hide-trainee="${t.id}" title="${D.isHiddenTrainee(t.id) ? "Suggest this outfit again" : "Leave this outfit out of parent training and the Pull planner"}">${D.isHiddenTrainee(t.id) ? "use again" : "don't use"}</button></td></tr>`).join("")}
        </tbody></table></div>`;
    }
  }

  // The umas you own (trainee version ids), shared with the Parents tab (family-planner.js).
  const UMAS_KEY = "uma-my-umas-v1";
  function myUmas() { try { return new Set(JSON.parse(localStorage.getItem(UMAS_KEY)) || []); } catch (e) { return new Set(); } }
  function setMyUmas(set) { try { localStorage.setItem(UMAS_KEY, JSON.stringify([...set])); } catch (e) { /* ignore */ } }

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
        ${hiddenPanelHTML()}
      </div>
    </details>`;
  }
  // Cards and outfits you won't use: left out of deck searches, upgrades, borrowed cards, the tier
  // list, parent training and the Pull planner, still findable in these tabs.
  function hiddenPanelHTML() {
    const h = hiddenList(), hw = D.halloween();
    const cards = [...D.hidden.cards].map((id) => D.card(id)).filter(Boolean), outs = [...D.hidden.trainees].map((id) => D.trainee(id)).filter(Boolean);
    const kept = h.halloween ? h.keep.cards.map((id) => D.card(id)).filter(Boolean).map((c) => c.n + " · " + c.t).concat(h.keep.trainees.map((id) => D.trainee(id)).filter(Boolean).map((t) => t.n + " [" + t.t + "]")) : [];
    const chip = (label, attr, id) => `<span class="chip">${esc(label)} <button type="button" class="linkish" ${attr}="${id}" aria-label="Use ${esc(label)} again">✕</button></span>`;
    return `<div class="hidden-cards"><h3>Cards and outfits I won't use</h3>
      <p class="mini">Left out of deck searches, upgrade suggestions, borrowed cards, the tier list, parent training and the Pull planner. You can still find them here and in the Support cards and Trainees tabs. Hide a card from its details (<b>Don't use this card</b>), an outfit from the Trainees tab, or every Halloween-themed one with the rule below. ✕ brings one back.</p>
      <label class="chip-toggle"><input type="checkbox" id="hideHalloween"${h.halloween ? " checked" : ""}> Never use Halloween cards and outfits</label>
      <p class="mini">The cards and outfits from JP's yearly Halloween banner (it opens around Sept 29; its R and promo cards aren't themed) and anything with a Halloween word in its title ("witch" alone doesn't count). It's a standing rule: new ones are left out as the daily data adds them (${hw.cards.length} cards and ${hw.trainees.length} outfits today).${kept.length ? ` Brought back: ${kept.map(esc).join(", ")}.` : ""}</p>
      ${cards.length || outs.length ? '<div class="row-wrap"><button type="button" class="linkish" id="unhideAll">Use them all again</button></div>' : ""}
      ${cards.length ? `<div class="row-wrap"><span class="mini"><b>Support cards (${cards.length}):</b></span>${cards.map((c) => chip(c.n + " · " + c.t, "data-hide-card", c.id)).join("")}</div>` : ""}
      ${outs.length ? `<div class="row-wrap"><span class="mini"><b>Outfits (${outs.length}):</b></span>${outs.map((t) => chip(t.n + " [" + t.t + "]", "data-hide-trainee", t.id)).join("")}</div>` : ""}
    </div>`;
  }

  function raiseOwned(cards) {
    const out = { added: 0, raised: 0, unknown: 0 };
    Object.keys(cards || {}).forEach((id) => {
      const lb = Math.max(0, Math.min(4, Math.round(+cards[id])));
      if (!D.DATA.supports.some((c) => c.id === +id)) { out.unknown++; return; }
      if (owned[id] == null) { owned[id] = lb; out.added++; } else if (lb > +owned[id]) { owned[id] = lb; out.raised++; }
    });
    if (out.added || out.raised) { saveOwned(); if (state.deck.ownedOnly) fillLists(); }
    return out;
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
          ${!c.en || c.enMarked ? `<button type="button" class="btn ghost small" data-mark-global="${c.id}">${c.enMarked ? "Unmark: not out on Global" : "Mark as out on Global"}</button>` : ""}
          <button type="button" class="btn ghost small" data-hide-card="${c.id}">${D.isHidden(c.id) ? "Use this card again" : "Don't use this card"}</button></p>
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
  const STYLE_NAME = { Nige: "Front Runner", Senkou: "Pace Chaser", Sasi: "Late Surger", Oikomi: "End Closer" };
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const PASTE_KEY = "uma-skillpaste-v1";
  let pasted = {};
  try { pasted = JSON.parse(localStorage.getItem(PASTE_KEY)) || {}; } catch (e) { pasted = {}; }
  const savePasted = () => { try { localStorage.setItem(PASTE_KEY, JSON.stringify(pasted)); } catch (e) { /* ignore */ } };
  const svCache = {}; // preset id -> { style: [[id, median x100, mean x100]] }, or "loading" / "missing" / "error"
  // Each builder owns its result and async jobs. A section passes its host explicitly.
  const W = window.UmaCmWorkflow;
  const deckJobs = new Map();
  const deckJob = (host = "cm") => {
    const key = host === "parents" ? "parents|" + deckTrainee(host) : "cm|" + (W.current(state).key || "default");
    if (!deckJobs.has(key)) deckJobs.set(key, {});
    return deckJobs.get(key);
  };
  const workflowOptions = () => ({ cups: P.list.map(p => p.id), defaultCup: defaultPreset().id, trainee: id => D.trainee(+id), style: bestTraineeStyle });
  const syncWorkflow = () => W.sync(state, workflowOptions());
  const deckTrainee = (host) => host === "parents" ? (state.parents || {}).selfTrainee || null : host === "tiers" ? state.deck.trainee : (W.current(state).ace || {}).tid || null;
  function bestTraineeStyle(t) {
    if (!t) return "Senkou";
    const rank = g => "GFEDCBAS".indexOf(g);
    return STYLES[[0, 2, 3].reduce((a, b) => rank(t.apt[6 + b]) > rank(t.apt[6 + a]) ? b : a, 1)][0];
  }
  const deckSelector = (host, selector) => host === "parents" ? selector.replace(/#([\w-]+)/g, "#parents-$1") : selector;
  const deckElement = (host, selector) => document.querySelector(`[data-deck-host="${host}"] ${deckSelector(host, selector)}`);
  function deckIds(html, host) {
    if (host !== "parents") return html;
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]));
    return html.replace(/\bid="([^"]+)"/g, (_, id) => `id="parents-${id}" data-cm-id="${id}"`)
      .replace(/\blist="([^"]+)"/g, (all, id) => ids.has(id) ? `list="parents-${id}"` : all);
  }
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

  // Two deck-builder setups with their own settings and result: CM & decks (racing)
  // and the Parents tab's ③ Deck (Ace parent). cm() is the one for the open tab.
  const deckHost = (el) => (el && el.closest("[data-deck-host]") ? el.closest("[data-deck-host]").dataset.deckHost : "cm");
  const PARENT_GOALS = ["ace"];
  function cm(host = "cm") {
    syncWorkflow();
    if (!state.cm) state.cm = {};
    // The debuffer goals are gone: a saved one becomes the plain goal for its tab.
    if (state.cm.goal === "debuffAce") state.cm.goal = "race";
    if (state.cm.goal === "debuff") state.cm.goal = "ace";
    if (state.pcm && state.pcm.goal === "debuff") state.pcm.goal = "ace";
    // Parent decks built in CM & decks before they moved: carry those settings over once.
    if (!state.pcm && PARENT_GOALS.indexOf(state.cm.goal) !== -1) {
      state.pcm = JSON.parse(JSON.stringify(state.cm));
      state.cm.goal = "race";
    }
    if (host === "parents" && !state.pcm) state.pcm = { goal: "ace", independent: true };
    const c = host === "parents" ? state.pcm : state.cm;
    if (host === "parents" && PARENT_GOALS.indexOf(c.goal) === -1) c.goal = "ace";
    // An ace parent is built for the ace's race: CM & decks' race and style, set there only.
    if (host === "parents") {
      const from = state.cmp.training;
      const ace = from && (state.cmp.byCup[from.cup] || []).find(a => +a.tid === +from.tid);
      c.preset = from && presetById(from.cup) ? from.cup : state.cm.preset;
      c.style = ace ? ace.style || bestTraineeStyle(D.trainee(ace.tid)) : state.cm.style;
    }
    // Parents are trained in Independent Training here, so its race count always applies.
    if (host === "parents") { c.independent = true; c.reachSS = state.cmp.parentRank; }
    if (host === "cm" && PARENT_GOALS.indexOf(c.goal) !== -1) c.goal = "race";
    const defaults = { goal: "race", statsW: "0.1", comp: {}, style: defaultStyle(), ownedOnly: true, borrow: true, skillW: "1", runs: "10", locked: [], must: [], targets: {}, rankGoal: "", independent: false, itManual: "0.5", sq: "", sfilter: "all", globalSkills: true, reachSS: "SS", helloProcRate: "0.4", helloUnlockRate: "0.15", eventSuccessRate: "0.5", eventSongBoost: "0" };
    Object.keys(defaults).forEach((k) => { if (c[k] == null) c[k] = defaults[k]; });
    if (c.reachSS === true) c.reachSS = "SS";
    if (c.reachSS === false) c.reachSS = "";
    if (!presetById(c.preset)) c.preset = defaultPreset().id;
    if (host === "cm" && c.goal === "race") g8Sync(c);
    return c;
  }
  // Independent Training's race agenda: the Parents tab's G1 plan when you've sent it over
  // (c.itRaces G1s), else a G1-heavy default. Optional races then take that share of the
  // ~60 turns after the debut.
  const itArg = (c) => (c.independent ? (c.itRaces != null ? [c.itRaces, 0, 0] : true) : false);
  const itShare = (c) => (c.independent ? (c.itRaces != null ? Math.min(0.5, c.itRaces / 60) : 0.25) : undefined);

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

  const monthYear = (s) => MONTHS[+s.slice(5, 7) - 1] + " " + s.slice(0, 4);
  // The simulator a cup's skill values came from (data/skillvalues/index.js meta.sims): "global",
  // "jp", or a JP-only cup's variant { syoubu, changed } (tools/build_skill_versions.js).
  function simVariant(p) {
    const name = SV && SV.meta && SV.meta.sims ? SV.meta.sims[p.id] : null;
    const v = name && SV.meta.variants ? SV.meta.variants[name] : null;
    return v ? Object.assign({ kind: "variant" }, v) : { kind: name || (p.sim === "global" ? "global" : "jp") };
  }
  // Which half of the pack each skill needs on this cup (parent-relevance.js positionsWith).
  const posCache = {};
  // Front Runners fight for the lead in this cup: the share of races someone is ahead of her
  // (state.contest[cup], 0 = she leads alone). An assumption you set, not a measured rate.
  const CONTEST_SHARES = [0.15, 0.3, 0.5];
  const contestShare = (pid) => { const v = state.contest && +state.contest[pid]; return v > 0 && v <= 1 ? v : 0; };
  function positionsFor(p) {
    const v = p ? simVariant(p) : {};
    const base = !v.positions ? window.UmaSkillPositions : posCache[p.id] || (posCache[p.id] = window.UmaParentRelevance.positionsWith(window.UmaSkillPositions, v.positions));
    const share = p ? contestShare(p.id) : 0;
    if (!share) return base;
    const key = p.id + "@" + share;
    return posCache[key] || (posCache[key] = window.UmaParentRelevance.withContest(base, share));
  }
  function simNote(p) {
    const v = simVariant(p);
    if (v.kind === "global") return "Run on the Global Umalator: Global's skills as they are now.";
    if (v.kind !== "variant") return "Run on the JP Umalator.";
    const n = Object.keys(v.changed || {}).length;
    return `Run on the JP Umalator${SV.meta.jpBuild ? " (build of " + fmtDate(SV.meta.jpBuild) + ")" : ""} as JP's game was on this cup's JP date, ${fmtDate(p.jp.start)}: Global runs JP's calendar in order. Skills have the versions JP's balance updates had given them by then${n ? `, so ${n} of the skills on Global now are valued at a newer version than Global has (marked “JP version”)` : ", which for every skill on Global now is the version Global has"}. Stamina showdown (JP added it on Aug 24, 2023) is ${v.syoubu ? "on" : "off"}${v.syoubuLong ? ", at the strength JP gave long races on Oct 29, 2024 (distance factor 1.5 up to 2600 m and 1.8 beyond, as players measured it; the Umalator has 1.2 and 1.5)" : ""}.`;
  }
  // Release label for a skill row: none when out on Global now, "By then" when JP had it by this
  // cup's JP date, "JP" otherwise.
  function releasePill(info, p, cut) {
    const st = window.UmaSkillRelease.status(info, cut);
    if (st === "global") return "";
    if (st === "by") return ` <span class="pill" title="Not on Global yet. JP released it on ${fmtDate(info[4])}, before this cup's JP date (${fmtDate(p.jp.start)}), so it should be out on Global by this cup.">By then</span>`;
    return ` <span class="pill" title="${info[4] ? "JP released it on " + fmtDate(info[4]) + (cut ? ", after this cup's JP date (" + fmtDate(p.jp.start) + "), so it won't be out on Global by this cup" : "; not on Global yet") : "Not on Global yet"}.">JP</span>`;
  }

  function loadSkillValues(id) {
    if (svCache[id]) return;
    if (!SV || SV.ready.indexOf(id) === -1) { svCache[id] = "missing"; return; }
    svCache[id] = "loading";
    fetch("data/skillvalues/" + id + ".json?v=" + ASSET_V)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((j) => { svCache[id] = j; renderCM(); if (state.tab === "tiers") renderTiers(); if (state.tab === "skillopt") renderTab(); })
      .catch(() => { svCache[id] = "error"; renderCM(); });
  }

  const skillInfo = (id) => (SV && SV.skills[id]) || [D.DATA.skills[id] || "#" + id, D.skillCost(id) || 0, 1, 1];

  // Skills ranked by median length gain for a preset and style. Your pasted Umalator results win.
  function chartRows(pid, style) {
    const mine = pasted[pid] && pasted[pid][style];
    if (mine) return Object.entries(mine).map(([id, L]) => ({ id: +id, L, mean: null, mine: true })).sort((a, b) => b.L - a.L);
    const data = svCache[pid];
    if (!data || typeof data === "string" || !data[style]) return [];
    return data[style].map(([id, med, mean]) => ({ id, L: med / 100, mean: mean / 100 }));
  }
  // A race's skill values for a style. The Umalator runs one horse without a pack, so skills that
  // need her in the other half of the field (Leap Forward for a Pace Chaser), or a rival ahead of
  // a Front Runner, who runs in 1st (No Stopping Me!), are left out here, for every use:
  // data/skill-positions.js, parent-relevance.js positionFits.
  function skillRows(pid, style) {
    const pos = positionsFor(presetById(pid));
    const PR = window.UmaParentRelevance;
    // A rival-ahead skill for a Front Runner fighting for the lead counts at that share.
    return chartRows(pid, style).filter((r) => PR.positionFits(pos, r.id, style)).map((r) => { const k = PR.aheadScale(pos, r.id, style); return k < 1 ? Object.assign({}, r, { L: r.L * k, mean: r.mean == null ? null : r.mean * k, ahead: k }) : r; });
  }
  // The rows skillRows leaves out, by why: { ahead, back, front }, most valuable first.
  function skillsLeftOut(pid, style) {
    const pos = positionsFor(presetById(pid)), out = { ahead: [], back: [], front: [] };
    chartRows(pid, style).forEach((r) => { const why = window.UmaParentRelevance.positionMiss(pos, r.id, style); if (why) out[why].push(r); });
    return out;
  }
  // For the race simulator's set search: { id: share } for rival-ahead skills, which it fires on a
  // sampled timing. A Front Runner who leads alone gets 0 (dropped), one fighting for the lead
  // the cup's share; every other style and skill is simulated as is.
  function raceScale(p, style, list) {
    if (style !== "Nige") return {};
    const PR = window.UmaParentRelevance, pos = positionsFor(p), out = {}, SB = window.UmaSkillBudget.DATA.skills;
    // Every tier of each listed skill (an upgrade or its gold can be bought from it).
    const fams = new Set(list.map((id) => SB[id] && SB[id][0]).filter(Boolean));
    const all = new Set(list.map(String).concat(Object.keys(SB).filter((id) => fams.has(SB[id][0]))));
    all.forEach((id) => { if (PR.positionMiss(pos, id, style) === "ahead") out[id] = 0; else { const k = PR.aheadScale(pos, id, style); if (k < 1) out[id] = k; } });
    return out;
  }
  // Why a skill can't fire for this style, in a few words, or "".
  const MISS_SHORT = { ahead: "won't fire while she leads", back: "needs her in the back half", front: "needs her in the front half" };
  function positionNote(pid, id, style) {
    const pos = positionsFor(presetById(pid)), why = window.UmaParentRelevance.positionMiss(pos, id, style);
    if (why) return MISS_SHORT[why];
    const k = window.UmaParentRelevance.aheadScale(pos, id, style);
    return k < 1 ? `needs a rival ahead: counted at ${Math.round(k * 100)}%` : "";
  }

  function skillMap(pid, style) {
    const map = {};
    const costs = {};
    skillRows(pid, style).forEach((r) => { map[r.id] = r.L; costs[r.id] = skillInfo(r.id)[1]; });
    return { map, costs };
  }

  // ---- game8's picks per cup (game8.js), pasted by hand from game8's Global cup guide ----
  // Must-haves join each racing ace's must-have skills for that cup (✕ drops one for her);
  // recommended ones get a tag and win ties in the skill-set comparisons. game8 doesn't rank its
  // picks, so the simulator still values them.
  const G8 = window.UmaGame8, G8_GUIDE = "https://game8.co/games/Umamusume-Pretty-Derby/archives/541155";
  const g8Entry = (pid) => (state.game8 && state.game8[pid]) || null;
  // A pick fits her style unless it's another style's skill (Front Runner Savvy for a Pace
  // Chaser): data/skill-styles.js, every version of the skill needing that running style.
  function g8Fits(pid, style) {
    const only = window.UmaSkillStyles || {};
    return (id) => !only[String(id)] || only[String(id)] === style;
  }
  const g8Picks = (pid, style) => G8.picks(g8Entry(pid), g8Fits(pid, style));
  // Names game8 may use: the cup's valued skills, then every other skill in the game data (lane
  // skills such as Dodging Danger have no chart value but are still game8 picks).
  const g8Names = (p) => { const have = new Set(soCupNames(p).map(([id]) => String(id))); return soCupNames(p).concat(Object.entries(D.DATA.skills).filter(([id]) => !have.has(String(id)))); };
  // game8's pairings broken by a skill set (bought plus held): "Dodging Danger needs Prudent
  // Positioning or Ignited Spirit WIT".
  function g8PairHTML(pid, ids) {
    const bad = G8.unpaired(g8Entry(pid), ids);
    return bad.length ? `<p class="mini warn">game8 pairs ${bad.map((x) => `${skillNameHTML(x.id)} with ${x.with.map((id) => skillNameHTML(id)).join(" or ")}`).join("; ")}: without one, it doesn't pay off. Add the partner or skip it.</p>` : "";
  }
  // A lane skill (lane move speed or a lane change, effect types 28 and 35 in the simulator's data).
  const laneSkill = (cat, id) => !!(cat && cat.skills[id] && cat.skills[id].alternatives.some((a) => (a.effects || []).some((e) => e.type === 28 || e.type === 35)));
  function g8Pill(pid, style, id) {
    const kind = g8Picks(pid, style)[String(id)];
    if (!kind) return "";
    const e = g8Entry(pid), x = e.must.concat(e.rec).find((y) => y.id === String(id)), note = x && x.note;
    return ` <span class="pill g8" title="game8's ${kind === "must" ? "must-have" : "recommended"} skill for this cup${note ? " (" + esc(note) + ")" : ""}. game8 doesn't rank its picks: the simulator values them, and a game8 pick wins a close call.">game8${kind === "must" ? " must-have" : ""}</span>`;
  }
  // game8's must-haves were once added to the ace's must-have skills; they're white sparks for her
  // parents now (g8ParentWhites), so ones added that way are taken back out once.
  function g8Sync(c) {
    if (!c.g8added) return;
    const added = new Set(c.g8added.map(String));
    c.must = c.must.filter((id) => !added.has(String(id)));
    delete c.g8added; delete c.g8drop;
  }
  // The race simulator's skill data (conditions, Wit checks, scaling), loaded once per simulator
  // for notes and the Skill optimizer's quick plan; the page redraws when it arrives.
  const g8Catalogs = {};
  function raceCatalog(p) {
    const RS = window.UmaRaceSkills;
    if (!RS) return null;
    const kind = RS.engine(p, SV.meta.sims).catalog || "global";
    if (g8Catalogs[kind] && g8Catalogs[kind] !== "loading") return g8Catalogs[kind];
    if (!g8Catalogs[kind]) { g8Catalogs[kind] = "loading"; RS.load(RS.engine(p, SV.meta.sims).catalog).then((cat) => { g8Catalogs[kind] = cat; if (["cm", "parents", "skillopt"].includes(state.tab)) renderTab(); }).catch(() => { delete g8Catalogs[kind]; }); }
    return null;
  }
  // Why a skill's chart value may not tell the whole story, in a few words (the mechanics doc's
  // field conditions, greens and heals, game8's own note).
  function g8Why(p, style, id, cat, valued) {
    const k = String(id), out = [], kind = window.UmaSkillKinds && window.UmaSkillKinds.skills[k];
    const cav = skillCaveat(k, cat ? skillConditions(cat, [k])[k] : "", p.id, style);
    if (cav) out.push(cav);
    if (kind && kind[0] === "green") out.push("a green: the chart counts only its stat boost");
    if (kind && kind[0] === "recovery") out.push("a heal: the chart was run with stamina for a full spurt, so it's worth more if she's short or debuffed");
    if (MECHANIC_ONLY[k]) out.push(MECHANIC_ONLY[k]);
    if (laneSkill(cat, k)) out.push((valued ? "its lane movement isn't simulated (one runner, no lanes or blocking)" : "lane movement: the one-runner simulator has no lanes or blocking, so it can't value it") + ". In a race, changing lanes while a lane-speed skill is on adds √(0.0002 × Power) m/s to her target speed (race-mechanics document)");
    const pair = ((g8Entry(p.id) || {}).pairs || []).find((x) => x.id === k);
    if (pair) out.push("game8 pairs it with " + pair.with.map((id) => skillInfo(id)[0]).join(" or "));
    const e = g8Entry(p.id), x = e && e.must.concat(e.rec).find((y) => y.id === k);
    if (x && x.note) out.push("game8: " + x.note);
    return out.join("; ");
  }
  // game8's picks against the simulator for her style: picks the chart ranks low (or can't value),
  // and the chart's strongest skills game8 doesn't list. Neither side is the answer on its own.
  const G8_LOW_RANK = 40, G8_TOP = 8;
  // Skills whose worth is a race mechanic the lengths chart barely sees (mechanics.js).
  const MECHANIC_ONLY = { 202161: "lowers her Rushed chance by 3 points; the chart doesn't count Rushed races avoided", 200431: "start delay ×0.4: fewer late starts, a better position early", 200432: "start delay ×0.9: fewer late starts" };
  function g8CompareHTML(c) {
    const p = presetById(c.preset), e = g8Entry(p.id);
    if (!e) return "";
    const rows = skillRows(p.id, c.style).filter((r) => released(String(r.id), p));
    if (!rows.length) return `<p class="mini">The comparison with the simulator shows once this cup's skill values load.</p>`;
    const cat = raceCatalog(p), picks = g8Picks(p.id, c.style), rank = new Map(rows.map((r, i) => [String(r.id), { i: i + 1, L: r.L }]));
    const item = (id) => { const r = rank.get(id), why = g8Why(p, c.style, id, cat, !!r); return `<li>${skillNameHTML(id)} <span class="mini">${r ? `#${r.i}, ${r.L.toFixed(2)} L` : "no chart value for her style"}${why ? " · " + esc(why) : ""}</span></li>`; };
    const low = Object.keys(picks).filter((id) => !rank.has(id) || rank.get(id).i > G8_LOW_RANK);
    const fam = (id) => { const f = window.UmaSkillBudget.DATA.skills[id]; return f ? f[0] : id; };
    const pickFams = new Set(Object.keys(picks).map(fam));
    const top = rows.slice(0, 30).map((r) => String(r.id)).filter((id) => !pickFams.has(fam(id))).slice(0, G8_TOP);
    return `<div class="g8-compare"><p class="mini"><b>game8 vs the simulator</b> (${esc(STYLE_NAME[c.style] || c.style)}, the chart's ranking on this course${cat ? "" : "; loading skill conditions…"}). Neither is the answer on its own: game8 sees real races and fields, the simulator measures lengths alone.</p>
      ${low.length ? `<p class="mini">game8 picks the chart ranks low (past #${G8_LOW_RANK}) or can't value:</p><ul class="mini">${low.map(item).join("")}</ul>` : `<p class="mini">Every game8 pick is in the chart's top ${G8_LOW_RANK}.</p>`}
      ${top.length ? `<p class="mini">The chart's strongest skills game8 doesn't list:</p><ul class="mini">${top.map(item).join("")}</ul>` : ""}</div>`;
  }
  // Which whites her parents will look for from game8's must-haves, in words.
  function g8WhitesNote(e, c) {
    const fits = g8Fits(c.preset, c.style), w = [...new Set(e.must.filter((x) => fits(x.id)).map((x) => ACCESS.white(x.id)).filter(Boolean))];
    const none = e.must.filter((x) => fits(x.id) && !ACCESS.white(x.id));
    return (w.length ? ` White sparks for her parents: ${w.map((id) => skillNameHTML(id)).join(", ")} <button type="button" class="linkish" data-goto-tab="parents">Parents →</button>.` : "") + (none.length ? ` No white spark: ${none.map((x) => skillNameHTML(x.id)).join(", ")} (an inherited unique comes from a parent who is that character).` : "");
  }
  function g8BoxHTML(c) {
    const p = presetById(c.preset), e = g8Entry(p.id), fits = g8Fits(p.id, c.style);
    const pairOf = (id) => ((e && e.pairs) || []).find((x) => x.id === id);
    const chip = (x) => `<span class="chip${fits(x.id) ? "" : " warnchip"}">${skillNameHTML(x.id)}${pairOf(x.id) ? ` <span class="mini">+ ${pairOf(x.id).with.map((id) => esc(skillInfo(id)[0])).join(" or ")}</span>` : ""}${x.note ? ` <span class="mini" title="${esc(x.note)}">${esc(x.note.length > 60 ? x.note.slice(0, 57) + "…" : x.note)}</span>` : ""}${fits(x.id) ? "" : ` <span class="mini">not for a ${esc(STYLE_NAME[c.style] || c.style)}</span>`}</span>`;
    return `<details class="pred-help g8-box" data-cmp-open="cm-g8"><summary>game8's skills for this cup${e ? ` (${e.must.length} must-have, ${e.rec.length} recommended)` : ""}</summary>
      <p class="mini">Copy the skill lists from <a href="${G8_GUIDE}" target="_blank" rel="noopener">game8's guide for this cup</a> (Champions Meeting → the cup → Recommended Skills) and paste them here: must-haves in the first box, the rest in the second. Paste the page as it copies: "・" and ★ bullets (a ★ line counts as a must-have), the "Icon" labels, "A / B" lines (both skills; the second counts as recommended), inherited uniques after their card, notes in brackets and headings ending in ":". game8 doesn't rank its picks, so the simulator still values them: must-haves become <b>white-spark targets for her parents</b> (the white version of each: a gold's white; inherited uniques have none) at the top of Parents' list, first in both uma.moe searches. Every pick gets a <span class="pill g8">game8</span> tag and wins close calls in <b>Skills for this build</b> and the Skill optimizer. To make the racing deck cover one too, star it in the skills table.</p>
      <div class="row-wrap"><label class="field grow"><span>Must-have</span><textarea id="g8Must" rows="4" placeholder="Left-Handed ◯&#10;Tokyo Racecourse ◯">${esc(e ? e.text.must : "")}</textarea></label>
        <label class="field grow"><span>Recommended</span><textarea id="g8Rec" rows="4" placeholder="・ Solid Steps (requires 1000+ Power)&#10;・ Restraint">${esc(e ? e.text.rec : "")}</textarea></label></div>
      <div class="row-wrap"><button type="button" class="btn small" id="g8Save">Save for ${esc(presetLabel(p))}</button>${e ? '<button type="button" class="btn ghost small" id="g8Clear">Clear</button>' : ""}</div>
      ${e ? `<p class="mini">Saved ${esc(fmtDate(e.at))}, for every ace racing this cup.${g8WhitesNote(e, c)}</p>${e.must.length ? `<div class="row-wrap"><span class="mini"><b>Must-have:</b></span>${e.must.map(chip).join("")}</div>` : ""}${e.rec.length ? `<div class="row-wrap"><span class="mini"><b>Recommended:</b></span>${e.rec.map(chip).join("")}</div>` : ""}` : ""}
      ${e && e.missed.length ? `<p class="mini warn">Not matched to a skill (check the spelling, or it's not out on Global by this cup): ${e.missed.map(esc).join("; ")}.</p>` : ""}
      ${g8CompareHTML(c)}
    </details>`;
  }

  // Which cards can give each skill (hint or event), among the cards the optimizer may use.
  function skillSources(c) {
    const out = {};
    const ids = optPool(c).map(x => x.id);
    if (c.goal !== "race") {
      const inventory = window.UmaParentSkills.build(ids.map(id => D.card(id)), {
        skills: SV.skills, purchases: window.UmaSkillPurchases.skills, events: window.UmaCardEvents,
        globalOnly: c.globalSkills, today: TODAY, skillsBy: skillsBy(presetById(c.preset)), cardAvailable: card => cardAvailable(card, c)
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
      sc.onload = () => { renderCM(); if (state.tab === "tiers") renderTiers(); };
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
  function euOpts(c, p, tid = deckTrainee(c.goal === "ace" ? "parents" : "cm")) {
    const sv = skillMap(p.id, c.style);
    const o = { scenario: euScen(), overrides: euOver(), trainee: tid, skills: sv.map, costs: sv.costs, skillWeight: +c.skillW, must: (c.must || []).slice(), independent: itArg(c), itManual: +c.itManual, eventSuccessRate: +c.eventSuccessRate };
    if (c.goal === "ace") {
      o.parent = { targets: parentTargetsFor(c, p).targets, statsWeight: +c.statsW, globalOnly: c.globalSkills, today: TODAY, skillsBy: skillsBy(p), cardAvailable: card => CARD_RELEASE.available(card, p) };
      if (c.globalSkills) o.must = o.must.filter((id) => released(id, p));
      // Reach SS / S: keep the deck whose careers reach the selected rating most often.
      if (c.reachSS && window.UmaRating) {
        const t = tid ? D.trainee(tid) : null, stars = t ? t.r : 3;
        o.parent.reachSS = { ss: window.UmaRating.rankThreshold(c.reachSS === "S" ? "S" : "SS"), unique: window.UmaRating.uniqueBonus(stars, stars), spRating: parentSpRating(c, p, tid) };
      }
    }
    if (c.goal === "race" && c.rankGoal) o.rankGoal = raceRankGoal(p, c.style, tid, c.rankGoal);
    return o;
  }
  // Out on Global for this cup (skill-release.js): Global's skills now, or for a cup Global hasn't
  // reached yet, also every skill JP released by that cup's JP date.
  const skillsBy = (p) => window.UmaSkillRelease.cutoff(p, TODAY);
  const released = (id, p) => window.UmaSkillRelease.outBy(SV.skills[id], skillsBy(p));
  // The parent's relevant skills for a race and style (parent-relevance.js): { targets, why },
  // why naming the rule ("L", "green", "recovery"). Global releases only if set.
  // game8's must-haves for the ace's cup, as white sparks for her parents: each one's white
  // (a gold's white; inherited uniques have none), at the top of her relevant skills (valued like
  // her best one), why "game8". Only skills her style can use.
  function g8ParentWhites(out, p, style) {
    const e = g8Entry(p.id);
    if (!e || !e.must.length || !out) return out;
    const fits = g8Fits(p.id, style), top = Math.max(0, ...Object.values(out.targets || {}));
    out.targets = Object.assign({}, out.targets); out.why = Object.assign({}, out.why);
    e.must.filter((x) => fits(x.id)).forEach((x) => {
      const w = ACCESS.white(x.id);
      if (!w) return;
      out.targets[w] = Math.max(out.targets[w] || 0, top || 1, (out.L && out.L[w]) || 0);
      out.why[w] = "game8";
    });
    return out;
  }
  function parentTargetsFor(c, p) {
    return g8ParentWhites(parentTargetsBase(c, p), p, c.style);
  }
  function parentTargetsBase(c, p) {
    const sv = skillMap(p.id, c.style), rarity = (id) => (SV.skills[id] ? SV.skills[id][2] : null);
    const out = window.UmaParentRelevance.aceTargets({ preset: p, style: c.style, raceSkills: sv.map, debuffs: window.UmaDebuffs, minL: 0.1, rarityOf: rarity, kinds: window.UmaSkillKinds, positions: positionsFor(p) });
    if (c.globalSkills) Object.keys(out.targets).forEach((id) => { if (!released(id, p)) { delete out.targets[id]; delete out.why[id]; } });
    const training=state.cmp && state.cmp.training, decks=state.cmp && state.cmp.decks || {};
    const ace=training && decks[training.cup+"|"+training.tid] || state.cm;
    if(c.parentTargets) return {targets:Object.assign({},c.parentTargets),why:Object.fromEntries(Object.keys(c.parentTargets).map(id=>[id,"purchase"]))};
    const need=ace && ace.preset===p.id && ace.style===c.style ? currentSkillPlan(ace) : null;
    return need && need.mode === "plan" ? ACCESS.parentRel(out,need) : out;
  }
  // Rating per skill point when the parent buys her relevant skills: the median of their rating
  // (at the trainee's aptitudes) ÷ full cost. Falls back to the planner's typical value.
  function parentSpRating(c, p, tid = deckTrainee("parents")) {
    const PP = window.UmaParentPlanner, PR = window.UmaRating, SB = window.UmaSkillBudget;
    const t = tid ? D.trainee(tid) : null;
    const ids = Object.keys(parentTargetsFor(c, p).targets);
    return PP.spRating(ids, t ? t.apt : null, PR, SB);
  }

  function raceRankGoal(p, style, tid, rank) {
    if (rank !== "S" && rank !== "SS") return null;
    const PR = window.UmaRating, t = tid ? D.trainee(tid) : null, stars = t ? t.r : 3;
    const ids = Object.keys(parentTargetsFor({ style, globalSkills: (state.cm || {}).globalSkills !== false }, p).targets);
    return { ss: PR.rankThreshold(rank), unique: PR.uniqueBonus(stars, stars), spRating: window.UmaParentPlanner.spRating(ids, t ? t.apt : null, PR, window.UmaSkillBudget) };
  }

  // Euophrys' scenario preset and weights, editable like on its site.
  function euSettingsHTML(ty, host = "cm") {
    const scen = euScen();
    const auto = !eu().scen;
    const tab = T.TABS[ty || "speed"][0];
    const w = T.weightsFor(scen, ty || "speed", Object.assign({}, euOver().general, euOver().tabs[tab]), null, itArg(cm(host)));
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
    const base = T.weightsFor(euScen(), ty, Object.assign({}, o.general, o.tabs[tab]), null, itArg(cm(deckHost(el))));
    const v = el.type === "checkbox" ? el.checked : +el.value;
    if (field) { const arr = (bag[field] || base[field]).slice(); arr[+el.dataset.k] = v; bag[field] = arr; }
    else bag[el.dataset.k] = v;
    save();
  }

  // Cards you won't use (D.isHidden) never enter a deck search, upgrade or borrow.
  const cardAvailable = (card, c) => !D.isHidden(card.id) && CARD_RELEASE.available(card, presetById(c.preset));
  const cardPools = c => CARD_RELEASE.pools(D.DATA.supports.filter((x) => !D.isHidden(x.id)), owned, c, presetById(c.preset), (id, lb) => !!T.entry(id, lb));
  const optPool = c => cardPools(c).pool;
  const borrowPool = c => cardPools(c).borrow;
  function cardReleaseHTML(card) {
    const r = CARD_RELEASE.info(card);
    return r.estimated ? ` <span class="mini" title="GameTora's estimated Global release; the date can move.">· Expected ~${esc(fmtDate(r.date))}</span>` : "";
  }

  // over: values to use instead of the saved ones (keepDeckResult compares with the result's races).
  function optKey(host = deckHost(), over) {
    const c = Object.assign({}, cm(host), over || {});
    return [contestShare(c.preset), c.goal, c.globalSkills, state.scenario, JSON.stringify(state.caps), JSON.stringify(state.sparks), JSON.stringify(pasted[c.preset] && pasted[c.preset][c.style] || null), c.statsW, c.goal !== "race" && c.reachSS, c.rankGoal, JSON.stringify(c.raceSkills ? Object.assign({},c.raceSkills,{open:undefined}) : null), c.preset, c.style, euScen(), JSON.stringify(euOver()), deckTrainee(host), c.ownedOnly, c.borrow, c.skillW, c.locked.join("."), c.must.join("."), JSON.stringify(c.targets), c.independent, c.itRaces, c.itManual, c.helloProcRate, c.helloUnlockRate, c.eventSuccessRate, c.eventSongBoost, JSON.stringify(c.comp), ownedCode(), svCache[c.preset] && typeof svCache[c.preset] === "object" ? 1 : 0].join("|");
  }

  function runOptimizer(host = deckHost()) {
    const j = deckJob(host);
    if (host === "cm") { j.raceToken = null; if(j.raceWorker)j.raceWorker.close();j.raceWorker=null;j.raceRunning=false; }
    const saved = cm(host), c = JSON.parse(JSON.stringify(saved));
    const tid = deckTrainee(host);
    const p = presetById(c.preset);
    if (!euReady()) { flash("Loading the tier list data…"); return; }
    const pool = optPool(c);
    if (pool.length < 6 && !c.borrow) { flash("The optimizer needs at least 6 cards. Mark more owned cards, or untick “Only cards I own”."); return; }
    j.optRun = { f: 0 };
    renderCM();
    const key = optKey(host);
    const tg = cmTargets(c);
    // Independent Training parent runs race their agenda (see itShare).
    const raceShare = itShare(c);
    const simulationMeta = { scenario: scenario().id, trainee: tid };
    const done = (r, opts, fit) => {
      // The predicted stats: the target search's own careers, or a readout from the same
      // simulation for Euophrys' pick.
      let est = fit ? fit.after : null;
      if (!est) {
        try {
          const sv = skillMap(p.id, c.style);
          const ctx = OPT.buildCtx({ scenario: scenario(), build: p.build, buildTarget: c.goal === "race" ? raceBuildTarget(p, c.style) : undefined, trainee: tid, caps: E.capsFor(state, scenario()), raceShare, runs: 16, skills: sv.map, costs: sv.costs, helloProcRate: +c.helloProcRate, helloUnlockRate: +c.helloUnlockRate, eventSuccessRate: +c.eventSuccessRate, eventSongBoost: +c.eventSongBoost, must: c.must, independent: !!c.independent, skillBudget: c.goal === "race" });
          est = OPT.simulate(ctx, r.cards.map((x) => ({ card: D.card(x.id), lb: x.lb })));
        } catch (err) { est = null; }
      }
      if ((scenario().id === "grandlive" || est && est.scoring === "race") && c.goal === "race" && est) r.skills = est.skills;
      const result = Object.assign(r, { key, itRaces: c.itRaces, parentConfig: opts.parent ? { targets: opts.parent.targets, must: c.must.slice(), globalOnly: c.globalSkills, skillsBy: skillsBy(p) } : null, goal: c.goal, preset: p.id, style: c.style, scen: euScen(), est, fit, simulationMeta, independent: !!c.independent, link, skillsUsed: Object.keys(opts.parent ? opts.parent.targets : skillMap(p.id, c.style).map).length });
      j.optRun = null;
      j.optResult = result;
      if (deckTrainee(host) === tid) saved.cards = r.cards.map(x => ({ id: x.id, lb: x.lb, borrowed: !!x.borrowed, locked: c.locked.includes(x.id) }));
      if (deckTrainee(host) === tid) saved.forTrainee = tid;
      // The Parents tab's plan uses a deck you built in ③ (not the planner's quick build).
      if (host === "parents" && deckTrainee(host) === tid) saved.cardsFrom = "optimizer";
      if (host === "cm" && deckTrainee(host) === tid && c.goal === "race" && est) { const g = raceGaps(result, saved); saved.predicted = { stats: g.stats, target: g.target, sp: est.sp }; }
      save();
      j.wish = null;
      renderCM();
      // Parents step 3 follows ③: her plan is redone with this deck (cm-tab.js followDeck).
      if (host === "parents" && saved.cardsFrom === "optimizer" && cmPlan()) cmPlan().followDeck();
      if (host === "cm" && c.goal === "race") runRaceSkills(true);
    };
    const fail = (err) => { flash(String(err.message || err)); j.optRun = null; renderCM(); };
    let link = null;
    setTimeout(() => {
      try {
        let bp = c.borrow ? borrowPool(c) : [];
        const locked = c.locked.slice();
        link = itLink(c, pool, bp);
        if (link && link.lock && locked.indexOf(link.lock) === -1) locked.push(link.lock);
        if (link && link.borrow) bp = [link.borrow];
        const opts = Object.assign(euOpts(c, p, tid), { borrow: c.borrow, locked, comp: Object.assign({}, c.comp) });
        const r = T.buildDeck(opts, pool, bp);
        const ss = (opts.parent && opts.parent.reachSS) || opts.rankGoal;
        const rv = c.goal === "race" ? raceValues(p, c.style) : null;
        if (!tg && !ss && !(state.scenario === "grandlive" && c.goal === "race") && !rv) { done(r, opts, null); return; }
        // Target stats (or Reach SS): start from Euophrys' pick and swap cards toward them, a slot
        // at a time so the page can show progress. Reach SS without targets ignores the build's.
        if (ss && !tg) ss.ignoreFit = true;
        const sim = { scenario: scenario(), build: p.build, buildTarget: c.goal === "race" ? raceBuildTarget(p, c.style) : undefined, raceValues: rv, trainee: tid, target: tg, caps: E.capsFor(state, scenario()), raceShare, helloProcRate: +c.helloProcRate, helloUnlockRate: +c.helloUnlockRate, eventSuccessRate: +c.eventSuccessRate, eventSongBoost: +c.eventSongBoost, must: c.must, independent: !!c.independent };
        const search = OPT.targetSearch(opts, sim, r.cards, pool, bp);
        const tick = () => {
          try {
            let more = true;
            const t0 = Date.now();
            while (more && Date.now() - t0 < 150) more = search.next();
            if (j.optRun) j.optRun.f = search.progress();
            const bar = deckElement(host, "#cmProg i");
            if (bar) bar.style.width = Math.round(search.progress() * 100) + "%";
            const step3 = host === "parents" && document.querySelector("#cmpImproveProg i");
            if (step3) step3.style.width = Math.round(search.progress() * 100) + "%";
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

  // The race build's targets for a racing ace on this cup: the distance build's, with stamina
  // lowered to the simulator's empty-skill reference for her style here (data/stamina-needs.js:
  // no equipped skills, Normal mood) plus STAMINA_MARGIN, an uncalibrated allowance for stamina
  // debuffers. It only lowers: a higher reference (no heals in it) becomes a warning instead,
  // since her real heals are what decide it. Stamina-showdown cups keep the build's.
  const STAMINA_MARGIN = 100;
  function staminaInfo(p, style) {
    const cups = window.UmaStaminaNeeds && window.UmaStaminaNeeds.cups, cup = p && cups && cups[p.id];
    if (!cup || !E.BUILDS[p.build]) return null;
    const build = E.BUILDS[p.build].target.stamina;
    if (cup.status === "engine") return { kind: "engine", build };
    const x = cup.styles && cup.styles[style];
    // A reference that fails its independent-seed rerun (by more than 4 of 160 races) is noise.
    if (!x || x.status !== "ok" || !(x.need > 0) || (x.confirm && x.confirm.hits < x.goal - 4)) return null;
    const need = x.need + STAMINA_MARGIN;
    return { kind: need < build ? "lower" : "higher", need, raw: x.need, hits: x.hits, of: x.of, build };
  }
  function staminaNeed(p, style) { const s = staminaInfo(p, style); return s && s.kind === "lower" ? s : null; }
  // Race scoring for racing decks (optimizer.js raceL): her simulated stats in lengths on this cup
  // for this style, from data/stat-curves.js. Null where the cup has none (stamina showdown, no
  // course data). The optimizer also keeps targets when you typed your own, or on long cups where
  // a full spurt needs recovery skills (buildCtx raceOn).
  function raceValues(p, style) { return window.UmaStatCurves ? OPT.raceValuesFor(window.UmaStatCurves, p.id, style) : null; }
  function raceBuildTarget(p, style) {
    const bt = Object.assign({}, E.BUILDS[p.build].target), s = staminaNeed(p, style);
    if (s) bt.stamina = s.need;
    return bt;
  }
  function staminaNote(p, style) {
    const s = staminaInfo(p, style), who = esc(STYLE_NAME[style] || style);
    if (!s) return "";
    if (s.kind === "engine") return ` Stamina stays at ${s.build}: this cup has JP's stamina showdown, so on courses over 2100 m stamina past a full spurt still gains lengths (the deck's race value counts it, measured on the cup's JP-dated simulator).`;
    const ref = `the race simulator's reference (no skills equipped, Normal mood) gives a ${who} a full last spurt in ${s.hits} of ${s.of} races from ${s.raw}`;
    return s.kind === "lower"
      ? ` Stamina is lowered to ${s.need}: ${ref}, +${STAMINA_MARGIN} as a rough allowance for stamina debuffers (not measured). Check her finished build in <b>Skills for this build</b>.`
      : ` <span class="warn">Stamina: ${ref}, above the ${s.build} used here. Plan recovery skills, and check her full-spurt rate in <b>Skills for this build</b>.</span>`;
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

  function runSensitivity(host = deckHost()) {
    const j = deckJob(host);
    const r = j.optResult, c = cm(host);
    if (!r || r.key !== optKey(host) || j.sensitivityJob) return;
    const candidates = comparisonDecks(r, c);
    if (candidates.length < 2) { flash("No eligible alternative: the current slots may be locked."); return; }
    const p = presetById(r.preset), sv = skillMap(p.id, c.style);
    const sim = { scenario: scenario(), build: p.build, buildTarget: c.goal === "race" ? raceBuildTarget(p, c.style) : undefined, raceValues: c.goal === "race" ? raceValues(p, c.style) : null, trainee: deckTrainee(host), target: cmTargets(c) || undefined, caps: E.capsFor(state, scenario()), skills: sv.map, costs: sv.costs, skillWeight: +c.skillW, must: c.must, helloProcRate: +c.helloProcRate, helloUnlockRate: +c.helloUnlockRate, eventSuccessRate: +c.eventSuccessRate, eventSongBoost: +c.eventSongBoost, independent: !!c.independent, raceShare: itShare(c) };
    const job = OPT.sensitivity(sim, candidates);
    j.sensitivityJob = job; renderCM();
    const tick = () => {
      if (j.optResult !== r || r.key !== optKey(host)) { j.sensitivityJob = null; renderCM(); return; }
      try {
        const more = job.next();
        const progress = deckElement(host, "#sensitivityProgress"); if (progress) progress.textContent = Math.round(job.progress() * 100) + "%";
        if (more) { setTimeout(tick, 0); return; }
        r.sensitivity = job.result(); j.sensitivityJob = null;
        renderCM();
      } catch (err) { j.sensitivityJob = null; flash(err.message || String(err)); renderCM(); }
    };
    setTimeout(tick, 0);
  }

  function sensitivityHTML(r) {
    if (!r.sensitivity) return "";
    const s = r.sensitivity, anyLoss = s.comparisons.some((x) => x.minDelta < -1e-6);
    const number = (n) => (n > 0 ? "+" : "") + n.toFixed(1);
    return `<details class="pred-help" open id="sensitivityResult"><summary>Deck sensitivity check</summary><p class="mini${anyLoss ? " warn" : ""}">${anyLoss ? "The lead changes in at least one check. Compare these decks as close or assumption-dependent options." : "The suggested deck keeps its lead or ties in these checks."} This covers the listed alternatives only. Ranges are model sensitivity, not confidence intervals or proof of the best deck.</p><p class="mini">${s.seeds.length} held-out seeds; ${s.runsPerSeed} careers per deck per seed. Positive gaps favor the suggested deck. Scores use target fit and affordable skill value; SP contributes through the skills it can buy.</p><div class="table-wrap"><table><thead><tr><th>Alternative</th><th>Assumptions</th><th>Mean gap</th><th>Seed range</th><th>Leads</th></tr></thead><tbody>${s.comparisons.map((x) => `<tr><td>${esc(x.candidate)}</td><td>${esc(x.profile)}</td><td>${number(x.meanDelta)}</td><td>${number(x.minDelta)} to ${number(x.maxDelta)}</td><td>${x.wins}/${s.seeds.length}${x.ties ? " · " + x.ties + " tied" : ""}</td></tr>`).join("")}</tbody></table></div></details>`;
  }

  function runWishlist(host = deckHost()) {
    const j = deckJob(host);
    if (!j.optResult || !euReady()) return;
    const c = cm(host);
    const p = presetById(j.optResult.preset);
    const opts = euOpts(c, p);
    const deck = j.optResult.cards;
    if (j.optResult.est && j.optResult.est.skillBudget) {
      if (j.wishJob || j.optResult.key !== optKey(host)) return;
      const r = j.optResult, jobs = [];
      const required = (r.must || []).filter((m) => m.p > 0).map((m) => String(m.id));
      deck.forEach((cur, i) => {
        if (cur.borrowed || c.locked.includes(cur.id)) return;
        const rest = deck.filter((_, j) => j !== i), ty = D.card(cur.id).ty;
        const candidates = D.DATA.supports.filter((x) => cardAvailable(x, c) && T.entry(x.id, 4) && x.r >= 2 && x.ty === ty && (owned[x.id] == null || owned[x.id] < 4)).map((x) => ({ id: x.id, lb: 4 }));
        T.rank(opts, ty, rest, candidates).slice(0, 3).forEach((candidate) => {
          const cards = deck.map((x, j) => j === i ? { id: candidate.id, lb: candidate.lb, borrowed: false } : x);
          const covered = new Set(T.deckSkills(opts, cards).must.filter((m) => m.p > 0).map((m) => String(m.id)));
          if (required.every((id) => covered.has(id))) jobs.push({ cards, id: candidate.id, lb: candidate.lb, replaces: cur.id });
        });
      });
      const sv = skillMap(p.id, c.style);
      const sim = { scenario: scenario(), build: p.build, buildTarget: c.goal === "race" ? raceBuildTarget(p, c.style) : undefined, raceValues: c.goal === "race" ? raceValues(p, c.style) : null, trainee: deckTrainee(host), target: cmTargets(c) || undefined, caps: E.capsFor(state, scenario()), skills: sv.map, costs: sv.costs, skillWeight: +c.skillW, must: c.must, helloProcRate: +c.helloProcRate, helloUnlockRate: +c.helloUnlockRate, eventSuccessRate: +c.eventSuccessRate, eventSongBoost: +c.eventSongBoost, independent: !!c.independent, raceShare: itShare(c) };
      const token = {}; j.wishJob = token; j.wish = null; renderCM();
      const out = []; let at = 0;
      const tick = () => {
        if (j.wishJob !== token) return;
        if (j.optResult !== r || r.key !== optKey(host)) { j.wishJob = null; renderCM(); return; }
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
          j.wish = out.sort((a, b) => b.gain - a.gain).filter((x) => !seen.has(x.id) && seen.add(x.id)).slice(0, 10);
          r.wishMeta = { runs: 8, seed: 857563, candidates: jobs.length }; j.wishJob = null;
          renderCM();
        } catch (err) { j.wishJob = null; flash(err.message || String(err)); renderCM(); }
      };
      setTimeout(tick, 0); return;
    }
    const out = [];
    deck.forEach((cur, i) => {
      if (cur.borrowed || c.locked.indexOf(cur.id) !== -1) return;
      const ty = D.card(cur.id).ty;
      const rest = deck.filter((_, j) => j !== i);
      const cands = D.DATA.supports.filter((x) => cardAvailable(x, c) && T.entry(x.id, 4) && x.r >= 2 && x.ty === ty && (owned[x.id] == null || owned[x.id] < 4)).map((x) => ({ id: x.id, lb: 4 }));
      T.rank(opts, ty, rest, cands).slice(0, 3).forEach((x) => { if (x.score > cur.score) out.push({ id: x.id, gain: x.score - cur.score, share: (x.score - cur.score) / Math.max(1, cur.score), replaces: cur.id }); });
    });
    const seen = new Set();
    j.wish = out.sort((a, b) => b.gain - a.gain).filter((x) => !seen.has(x.id) && seen.add(x.id)).slice(0, 10);
    renderCM();
  }

  // CM & decks (the racing deck) and Parents (the ace's parents and the Ace-parent deck).
  function deckTab() { return state.tab === "cm" || state.tab === "parents"; }
  function renderCM() { if (deckTab()) renderTab(); }

  // CM & decks' header: the cup and your team for it (cm-tab.js), the course, her style.
  function cmHeader(p, c, team) {
    const [stCls, stText] = presetStatus(p);
    const s = p.stats;
    return `<section class="panel cm-head">
      ${team}
      <div class="cm-title"><h2>${esc(p.name)}</h2>
        <span class="chip">${p.kind === "loh" ? "League of Heroes " + p.no : "Champions Meeting #" + p.no}</span>
        <span class="chip cm-${stCls}">${stText}</span></div>
      <div class="cm-facts">
        <div class="cm-course"><b>${esc(p.course.track)} ${p.course.distance}m</b> · ${p.course.surface} · ${p.course.turn === "Straight" ? "straight course" : p.course.turn + "-handed"}${p.course.layout ? " (" + esc(p.course.layout) + ")" : ""} · ${p.course.dist}</div>
        <div>${esc(p.conditions)}</div>
        <div>Global: <b>${p.global.est ? "about " : ""}${fmtDate(p.global.start)} – ${fmtDate(p.global.end)}</b>${p.global.est ? ' <span class="pill">estimate</span>' : ""} · JP: ${fmtDate(p.jp.start)}</div>
      </div>
      ${c ? `<div class="row-wrap">
        <div class="field"><span>Running style</span><div class="seg style-seg" role="radiogroup" aria-label="Running style">${STYLES.map(([k, l]) => `<button type="button" role="radio" aria-checked="${c.style === k}" data-cm-style="${k}">${l}</button>`).join("")}</div></div>
        ${c.style === "Nige" ? `<label class="field"><span>Front Runners in this cup</span><select data-cm-contest="${esc(p.id)}"><option value="0"${contestShare(p.id) ? "" : " selected"}>She leads alone</option>${CONTEST_SHARES.map((v) => `<option value="${v}"${contestShare(p.id) === v ? " selected" : ""}>Fight for the lead: someone ahead ${Math.round(v * 100)}% of the race</option>`).join("")}</select></label>` : ""}
        <button type="button" class="btn ghost small" data-cm-build="${p.build}" ${state.build === p.build ? "disabled" : ""}>${state.build === p.build ? "Turn coach build: " + esc(E.BUILDS[p.build].label) : "Set the turn coach to " + esc(E.BUILDS[p.build].label)}</button>
      </div>` : ""}
      <p class="mini">Skill values on this course were simulated with Speed ${s.speed}, Stamina ${s.stamina}, Power ${s.power}, Guts ${s.guts}, Wit ${s.wisdom}, S distance and A surface aptitude, Great mood.</p>
    </section>`;
  }

  // The CM & decks tab: the cup and your team, then the selected ace's racing deck, exactly
  // as the deck optimizer builds it, with her gaps (target minus predicted) for Parents.
  function renderDecks(body) {
    if (!P || !T) { body.innerHTML = `<div class="empty">The CM data didn't load. Refresh the page.</div>`; return; }
    const plan = cmPlan(), x = W.current(state), p = presetById(x.cup) || defaultPreset();
    loadSkillValues(p.id);
    euReady();
    const c = x.ace ? cm("cm") : null;
    body.innerHTML = `<div class="cm">${cmHeader(p, c, plan.teamHTML())}${cmLogHTML(p)}${c ? cmOptimizer(p, c, "cm") + cmSkills(p, c, "cm") : `<section class="panel"><p class="mini">Add an ace to your team above to build her deck.</p></section>`}</div>`;
  }

  // Her gaps: each stat's target (yours, else the race build's, within the caps) against the
  // predicted average. Parents fills what's short with blue sparks.
  function raceGaps(r, c) {
    const p = presetById(r.preset), caps = E.capsFor(state, scenario()), mine = cmTargets(c || {}) || {};
    const style = r.style || (c || {}).style, goal = r.goal || (c || {}).goal;
    const bt = p ? style && goal !== "ace" ? raceBuildTarget(p, style) : E.BUILDS[p.build].target : {};
    const target = E.STATS.map((s) => Math.min(caps[s] != null ? caps[s] : Infinity, r.fit ? r.fit.target[s] : mine[s] != null ? mine[s] : bt[s]));
    const stats = r.est.stats.slice();
    return { target, stats, short: stats.map((v, i) => Math.max(0, target[i] - v)), mine: E.STATS.map((s) => mine[s] != null) };
  }

  function cmOptimizer(p, c, host = deckHost()) {
    const j = deckJob(host);
    const n = ownedIds().length;
    const running = !!j.optRun;
    const opt = (pairs, v) => pairs.map(([k, l]) => `<option value="${k}" ${String(v) === k ? "selected" : ""}>${l}</option>`).join("");
    const nSkills = Object.keys(skillMap(p.id, c.style).map).length;
    const goal = c.goal || "race";
    const by = CARD_RELEASE.cutoff(p), future = by > TODAY;
    const available = D.DATA.supports.filter(x => cardAvailable(x, c));
    const missingScores = available.filter(x => x.r >= 2 && !T.entry(x.id, 4)).length;
    // In the Parents tab the long explanations go into one closed box, to keep ③ short.
    const notes = [];
    const note = (html) => (host === "parents" ? (notes.push(html), "") : html);
    return `<section class="panel cm-opt" data-deck-host="${host}">
      <h3>Deck optimizer</h3>
      <p class="mini" data-card-availability>${future ? `Cards expected by ${esc(fmtDate(by))}; ~ releases are estimates. Untick “Only cards I own” to try future cards at LB4.` : "Cards released on Global today; updated daily from GameTora."}${missingScores ? ` ${missingScores} card${missingScores === 1 ? " lacks" : "s lack"} scoring data and ${missingScores === 1 ? "is" : "are"} left out of searches.` : ""}</p>

      ${host === "parents" ? `<p class="mini">Finds relevant white skills for the ace, with the parent rating goal set above.</p>` : ""}
      ${goal === "ace" ? note(`<p class="mini"><b>Ace parent:</b> picks the cards that give your parent the most white skills relevant on this race: worth more than 0.1 L (median) for the running style and weighted by it, the greens whose condition fits the race, and for Mile and longer the recoveries that fit it (never debuffs), so she can learn them and pass them down as skill sparks. Gold hints count through their white: a spark is always the base white skill's, and learning the gold raises its chance to 40% (20% for a white). Every skill counts, not just the best 8, and stats only count as much as you choose.</p>`) : ""}
      ${goal !== "race" ? `<label class="field"><span>Stats still count</span><select data-cm="statsW">${opt([["0", "Not at all"], ["0.1", "A little"], ["0.25", "Some"], ["0.5", "Half"], ["1", "Fully"]], c.statsW)}</select></label>` : ""}

      ${note(`<p class="mini">Builds the deck the way you'd use <a href="https://euophrys.github.io/uma-tiers/" target="_blank" rel="noopener">Euophrys' tier list</a>: it picks the best card, then the best card given that one, and so on, with Euophrys' own scoring for the scenario. On top, every skill a card can hint is scored by its median length gain on this race as a ${STYLE_LABEL[c.style]} runner. Then it rechecks each slot with the other five fixed.</p>`)}
      ${traineePickerHTML(p, "data-cm-style", host)}
      ${nSkills ? "" : `<p class="mini warn">No skill values for this race yet${svCache[p.id] === "loading" ? " (loading…)" : ""}, so skills won't count. Paste your own Umalator results below to add them.</p>`}
      <div class="row-wrap">
        <label class="chip-toggle"><input type="checkbox" data-cm="ownedOnly" ${c.ownedOnly ? "checked" : ""}> Only cards I own (${n})</label>
        <label class="chip-toggle"><input type="checkbox" data-cm="borrow" ${c.borrow ? "checked" : ""}> Borrow 1 card from a friend</label>
        ${host === "cm" ? `<label class="chip-toggle" title="The 50-minute auto mode"><input type="checkbox" data-cm="independent" ${c.independent ? "checked" : ""}> Independent Training</label>` : ""}
        ${goal === "race" ? `<label class="field"><span>Skill hints count</span><select data-cm="skillW">${opt(SKILL_W, c.skillW)}</select></label>` : ""}
      </div>
      ${c.independent ? `<label class="field"><span>Friendship, Mood, Training eff. count</span><select data-cm="itManual">${opt(IT_MANUAL_OPTS, c.itManual)}</select></label>` : ""}
      ${c.independent ? note(`<p class="mini it-note"><b>Independent Training:</b> card scores follow players' testing there: initial stats count ${T.IT_INITIAL}× and skill points ${T.IT_SP}× (Skill Point Bonus, events, Initial Skill Points), Specialty Priority counts for nothing, and Friendship Bonus, Mood Effect and Training Effectiveness count as much as you pick above (they haven't been measured there). These weights are assumptions; compare real runs at your limit breaks. A card's 3rd chain event rarely fires there, so skills only it gives count at ${Math.round(T.IT_LATE_CHAIN * 100)}% of their usual chance. ${c.itRaces != null ? `Race Bonus counts for the ${c.itRaces} extra race${c.itRaces === 1 ? "" : "s"} from ② (on top of her career goals), and the predicted stats race that many times.` : `Race Bonus counts for a G1-heavy agenda (${T.IT_RACES[0]} G1, ${T.IT_RACES[1]} G2/G3; change it in the Euophrys settings), and the predicted stats race about 1 turn in 4. Each race costs rating: ${host === "parents" ? "② Races sends the count of extra races here" : "the Parents tab plans the fewest G1s for affinity"}.`} Races there are won on distance and surface aptitude alone, so stats only matter for sparks and rating.${IT_LINK[euScen()] ? ` ${IT_LINK[euScen()]} goes in, since uma.guide calls the scenario's link card mandatory there.` : ""}${goal !== "race" ? " Parent decks with target stats may take up to 2 Friend and 2 Group cards (players report they add a lot of skill points toward an SS rating)." : ""}</p>`) : ""}
      ${compHTML(c)}
      ${state.scenario === "grandlive" ? `<details class="pred-help" data-cmp-open="${host}-events"><summary>Event-skill assumptions</summary><div class="row-wrap"><label class="field"><span>Conditional event success estimate</span><select data-cm="eventSuccessRate">${[["0.25", "25%"], ["0.5", "50% (default assumption)"], ["0.75", "75%"]].map(([v, l]) => `<option value="${v}" ${c.eventSuccessRate === v ? "selected" : ""}>${l}</option>`).join("")}</select></label><label class="field"><span>Experimental chain-rate boost per song level</span><select data-cm="eventSongBoost">${[["0", "0% (magnitude uncalibrated)"], ["0.05", "+5% relative rate (assumed)"], ["0.1", "+10% relative rate (assumed)"]].map(([v, l]) => `<option value="${v}" ${c.eventSongBoost === v ? "selected" : ""}>${l}</option>`).join("")}</select></label></div><p class="mini">Song event levels activate after concerts. Their numerical effect has not been verified; these boosts are sensitivity assumptions. Known event branches and chain-ending choices are separate. Grand Concert race decks receive career refinement using your targets, or the build defaults when blank.</p></details>` : ""}
      ${targetsHTML(p, c, host)}
      ${host === "cm" ? raceSkillsHTML(c) : ""}
      ${euSettingsHTML("speed", host)}
      <div class="row-wrap">
        <label class="field grow"><span>Must include (optional)</span><input id="cmLock" list="cmCardList" placeholder="A card that must be in the deck" autocomplete="off"></label>
        <button type="button" class="btn ghost small" id="cmLockAdd">Add</button>
      </div>
      <datalist id="cmCardList">${available.filter(x => T.entry(x.id, owned[x.id] != null ? +owned[x.id] : 4)).sort((a, b) => b.r - a.r || a.n.localeCompare(b.n)).map(card => { const r = CARD_RELEASE.info(card); return `<option value="${esc(D.label(card))}"${r.estimated ? ` label="Expected ~${esc(fmtDate(r.date))}"` : ""}></option>`; }).join("")}</datalist>
      ${c.locked.length ? `<div class="row-wrap">${c.locked.map((id) => `<span class="chip lockchip">${esc(D.card(id).n)}${cardReleaseHTML(D.card(id))} <button type="button" class="linkish" data-cm-unlock="${id}" aria-label="Remove ${esc(D.card(id).n)}">✕</button></span>`).join("")}</div>` : ""}
      ${mustHTML(c)}
      ${c.ownedOnly && n < 6 ? `<p class="mini warn">You've marked ${n} owned card${n === 1 ? "" : "s"}. Mark yours in the <button type="button" class="linkish" data-goto-tab="cards">Support cards</button> tab, or untick “Only cards I own” to try every SSR and SR available ${future ? "by this cup" : "on Global today"} at max limit break.</p>` : ""}
      ${notes.length ? `<details class="pred-help"><summary>How the deck builder works</summary>${notes.join("")}</details>` : ""}
      <div class="row-wrap run-row">
        <button type="button" class="btn" id="cmRun" ${running ? "disabled" : ""}>${running ? (cmTargets(c) || state.scenario === "grandlive" && goal === "race" ? "Simulating careers…" : "Building…") : "Find my best deck"}</button>
        ${running && (cmTargets(c) || state.scenario === "grandlive" && goal === "race") ? `<span class="progress" id="cmProg"><i style="width:${Math.round((j.optRun.f || 0) * 100)}%"></i></span>` : ""}
      </div>
      <div id="cmOut">${j.optResult ? optResultHTML(j.optResult, c, host) : ""}</div>
    </section>`;
  }

  // Target stats: blank boxes show the race build's targets.
  function concertSettingsHTML(c) {
    return state.scenario === "grandlive" ? `<details class="pred-help" data-cmp-open="${c.goal === "ace" ? "parents" : "cm"}-concert"><summary>Grand Concert simulation assumptions</summary><div class="row-wrap"><label class="field"><span>Light Hello repeat-event estimate</span><select data-cm="helloProcRate">${[["0.36", "36% (lower estimate)"], ["0.4", "40% (default estimate)"], ["0.45", "45% (upper estimate)"]].map(([v, l]) => `<option value="${v}" ${c.helloProcRate === v ? "selected" : ""}>${l}</option>`).join("")}</select></label><label class="field"><span>Outing unlock model, after meeting and bond 60</span><select data-cm="helloUnlockRate">${[["0.05", "5% per turn (slow sensitivity check)"], ["0.15", "15% per turn (default assumption)"], ["0.3", "30% per turn (fast sensitivity check)"]].map(([v, l]) => `<option value="${v}" ${c.helloUnlockRate === v ? "selected" : ""}>${l}</option>`).join("")}</select></label></div><p class="mini">These are model assumptions, not confirmed game probabilities. Compare results across settings. The turn coach only uses outings once you mark the actual unlock; expected token events never change its saved balances.</p></details>` : "";
  }

  function targetsHTML(p, c, host = deckHost()) {
    const stamina = c.goal !== "ace" ? staminaNeed(p, c.style) : null;
    const bt = stamina ? raceBuildTarget(p, c.style) : E.BUILDS[p.build].target;
    const t = c.targets || {};
    const coach = state.targets && E.STATS.some((s) => state.targets[s] > 0);
    const parent = c.goal === "ace";
    const automatic = state.scenario === "grandlive" && c.goal === "race";
    return `<div class="cm-targets">
      ${host === "parents" ? `<span class="mini"><b>Target stats</b> (optional): the search swaps cards to get her closer. <b>Blue spark targets</b> aims every stat at 1100 for 3★ blue sparks.</span><details class="pred-help"><summary>More on targets</summary>` : ""}
      <span class="mini"><b>Target stats</b> (optional). ${automatic ? "Blank boxes use the build targets below and still receive career comparison." : "Blank: Euophrys' pick. Set any target to compare simulated careers."} The optimizer tries swaps toward your targets while keeping useful skills and must-have coverage. Blank boxes use the ${esc(E.BUILDS[p.build].label)} targets shown.${c.goal !== "ace" ? staminaNote(p, c.style) : ""}${parent ? " For a parent, stats decide spark quality: the blue spark's stat (picked at random) needs 600+ for any chance of 3★ (5%), and over 1100 doubles it (10%); a final rating of SS (17,500+) also doubles the 3★ chance of white sparks. <b>Stats still count</b> sets how much of the skill score the search may give up to get closer: A little 4%, Some 10%, Half 20%, Fully 40%." : ""}</span>
      ${host === "parents" ? "</details>" : ""}
      <div class="tg-row">${E.STATS.map((s) => `<label class="field"><span>${E.STAT_LABELS[s]}</span><input type="number" inputmode="numeric" min="0" max="2500" step="50" data-cm-target="${s}" value="${t[s] > 0 ? t[s] : ""}" placeholder="${bt[s]}"></label>`).join("")}</div>
      ${coach || cmTargets(c) || parent ? `<div class="row-wrap">${parent ? '<button type="button" class="btn ghost small" id="cmTgSpark">Blue spark targets (1100 each)</button>' : ""}${coach ? '<button type="button" class="btn ghost small" id="cmTgCoach">Use the turn coach\'s targets</button>' : ""}${cmTargets(c) ? '<button type="button" class="btn ghost small" id="cmTgClear">Clear targets</button>' : ""}</div>` : ""}
      ${concertSettingsHTML(c)}
    </div>`;
  }

  // Must-have skills: the deck has to include a card that can give each one (hint or event).
  // Lists every skill a Global card can give; ☆ in the skills table adds one too.
  function mustHTML(c) {
    const src = skillSources(c);
    const tid = deckTrainee(c.goal === "ace" ? "parents" : "cm"), trn = tid ? D.trainee(tid) : null;
    const known = new Set(trn ? trn.us.concat(trn.is, trn.as).map(String) : []);
    let sourceIds = [...new Set(D.DATA.supports.filter((x) => cardAvailable(x, c) && T.entry(x.id, 4)).flatMap((x) => (x.hs || []).concat(x.es || [])))];
    if (c.goal !== "race") {
      sourceIds = sourceIds.map(String);
      if (c.globalSkills) sourceIds = sourceIds.filter(id => released(id, presetById(c.preset)));
      sourceIds = [...new Set(sourceIds.flatMap(id => [id, ...parentPurchaseRoutes.whites(id)]))];
      if (c.globalSkills) sourceIds = sourceIds.filter(id => released(id, presetById(c.preset)));
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
        // A must-have she can't fire in her place in the pack (No Stopping Me! for a Front Runner).
        const miss = positionNote(c.preset, id, c.style);
        return `<span class="chip lockchip${(n || known.has(String(id))) && !miss ? "" : " warnchip"}"${miss ? ` title="The skill values leave it out for ${/^[AEIOU]/.test(STYLE_NAME[c.style] || "") ? "an" : "a"} ${esc(STYLE_NAME[c.style] || c.style)}: ${esc(miss)}."` : ""}>${skillNameHTML(id)}${c.goal === "race" ? g8Pill(c.preset, c.style, id) : ""} <span class="mini">${note}${miss ? " · " + esc(miss) : ""}</span> <button type="button" class="linkish" data-must-del="${id}" aria-label="Remove ${esc(debuffOrSkillName(id))}">✕</button></span>`;
      }).join("")}</div>` : ""}
      <p class="mini">${c.goal === "race" ? "The deck will include a card that can hint each must-have skill or give it through an event, before anything else counts." : "Parent must-haves prioritize cards with a direct hint/event source or a canonical gold prerequisite route. A gold route makes the white purchasable, without granting its hint discount."} Cards only offer a skill by chance, so the result shows how likely you are to see it.</p>
      ${c.goal === "race" ? g8BoxHTML(c) : ""}
    </div>`;
  }
  const skillIdByName = (name, c = cm("cm")) => {
    const n = name.trim().toLowerCase();
    if (!n) return null;
    if (c.goal !== "race") {
      const id = Object.keys(SV.skills).find(id => debuffOrSkillName(id).toLowerCase() === n);
      if (id) return id;
    }
    for (const x of D.DATA.supports) for (const id of (x.hs || []).concat(x.es || [])) if (debuffOrSkillName(id).toLowerCase() === n) return String(id);
    return null;
  };

  // How much Friendship Bonus, Mood Effect and Training Effectiveness count in Independent
  // Training, against a manual career: unmeasured there, so it's your call (tiers.js IT_MANUAL).
  const IT_MANUAL_OPTS = [["1", "Fully (as in a manual career)"], ["0.5", "Half (default)"], ["0.25", "A quarter"], ["0", "Not at all"]];
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

  // Predicted stats per race count for the Parents tab (see queuePredict below).
  const predictCache = new Map();
  let predictQueue = [], predictTimer = null, predictDone = null;
  function predictDeck() {
    // The Parents tab's own result: live while it's open, else the one kept for it.
    const r = deckJob("parents").optResult;
    if (r && r.cards) return { label: "the deck built in ③", cards: r.cards.map((x) => ({ card: D.card(x.id), lb: x.lb })) };
    const c = state.pcm || {};
    if (c.forTrainee === deckTrainee("parents") && c.cards && c.cards.length) return { label: "the parent deck", cards: c.cards.map(x => ({ card: D.card(x.id), lb: x.lb })).filter(x => x.card) };
    const cards = (state.deck.slots || []).filter(Boolean).map((sl) => ({ card: D.card(sl.id), lb: sl.lb })).filter((x) => x.card);
    return cards.length ? { label: "your coach deck", cards } : null;
  }
  function predictKey(n) {
    const d = predictDeck();
    if (!d) return null;
    return JSON.stringify([d.cards.map((x) => x.card.id + ":" + x.lb), n, deckTrainee("parents"), state.scenario, (state.pcm || {}).preset, state.caps || {}, state.sparks || {}, (state.pcm || {}).helloProcRate, (state.pcm || {}).helloUnlockRate, (state.pcm || {}).eventSuccessRate, (state.pcm || {}).eventSongBoost]);
  }
  function predictNext() {
    predictTimer = null;
    const job = predictQueue.shift();
    if (!job) return;
    if (job.k !== predictKey(job.n)) {
      if (predictQueue.length) predictTimer = setTimeout(predictNext, 0);
      return;
    }
    try {
      const d = predictDeck(), c = state.pcm || {}, p = presetById(c.preset);
      const est = OPT.simulate(OPT.buildCtx({ scenario: scenario(), build: p.build, trainee: deckTrainee("parents"), caps: E.capsFor(state, scenario()), raceShare: Math.min(0.5, job.n / 60), runs: 16,
        helloProcRate: +(c.helloProcRate || 0.4), helloUnlockRate: +(c.helloUnlockRate || 0.15), eventSuccessRate: +(c.eventSuccessRate || 0.5), eventSongBoost: +(c.eventSongBoost || 0), independent: true, skillBudget: false }), d.cards);
      predictCache.set(job.k, { stats: est.stats, sp: est.sp, races: est.races, finals: est.finals });
    } catch (err) { predictCache.set(job.k, null); }
    if (predictQueue.length) predictTimer = setTimeout(predictNext, 0);
    if (predictDone && state.tab === "parents") predictDone();
  }

  // Resolves once every cup's skill values are loaded (the pull planner and the CM planner).
  const ensureSkills = (ids) => new Promise((resolve, reject) => {
    ids.forEach((id) => loadSkillValues(id));
    const t0 = Date.now();
    const wait = () => {
      if (ids.every((id) => typeof svCache[id] === "object" || svCache[id] === "missing")) resolve();
      else if (ids.some((id) => svCache[id] === "error")) reject(new Error("Couldn't load a cup's skill values. Check your connection and plan again."));
      else if (Date.now() - t0 > 60000) reject(new Error("Loading the cups' skill values timed out. Plan again."));
      else setTimeout(wait, 100);
    };
    wait();
  });
  // The ace's relevant skills on a race for her style ({ targets, why, L } with every charted
  // skill's L), out on Global by that cup when CM & decks says so; null while they load.
  function aceSkillsFor(race) {
    const id = race.preset.id;
    loadSkillValues(id);
    if (!(pasted[id] && pasted[id][race.style]) && typeof svCache[id] !== "object") return null;
    const L = skillMap(id, race.style).map, rarity = (x) => (SV.skills[x] ? SV.skills[x][2] : null);
    const out = window.UmaParentRelevance.aceTargets({ preset: race.preset, style: race.style, raceSkills: L, debuffs: window.UmaDebuffs, minL: 0.1, rarityOf: rarity, kinds: window.UmaSkillKinds, positions: positionsFor(race.preset) });
    if ((state.cm || {}).globalSkills !== false) Object.keys(out.targets).forEach((x) => { if (!released(x, race.preset)) { delete out.targets[x]; delete out.why[x]; } });
    return g8ParentWhites(Object.assign(out, { L }), race.preset, race.style);
  }

  // The CM planner's decks, built the quick way CM & decks starts (Euophrys' scoring plus the
  // race's skill values, no simulated search): her racing deck (races null), or an Ace parent's
  // deck for this race in Independent Training with that many G1s (the Parents tab's ③
  // settings). tid: her version (null: none). s: the planner's own settings for her racing deck
  // ({ comp, borrow, skillW, must, exclude: card ids left out, locked: your cards kept,
  // friend: the friend's card kept }), else CM & decks'. planSetup gives what the builder works
  // with ({ opts, pool, bp, link }), planDeck the deck.
  function planSetup(p, style, tid, races, s) {
    const parent = races != null;
    const base = Object.assign({ statsW: "0.1", comp: {}, ownedOnly: true, borrow: true, skillW: "1", itManual: "0.5", eventSuccessRate: "0.5", globalSkills: true }, parent ? state.pcm || {} : state.cm || {});
    const c = Object.assign({}, base, { goal: parent ? "ace" : "race", preset: p.id, style, independent: parent || !!base.independent, itRaces: parent ? races : null, locked: [], must: [], reachSS: false, rankGoal: "", comp: Object.assign({}, base.comp || {}) });
    if (s) Object.assign(c, { comp: Object.assign({}, s.comp || {}), borrow: s.borrow !== false, skillW: s.skillW != null ? s.skillW : c.skillW, must: (s.must || []).slice(),parentTargets:s.parentTargets });
    const out = new Set((s && s.exclude) || []);
    const pool = optPool(c).filter((x) => !out.has(x.id));
    let bp = c.borrow ? borrowPool(c).filter((x) => !out.has(x.id)) : [];
    const locked = ((s && s.locked) || []).filter((id) => pool.some((x) => x.id === id));
    const link = itLink(c, pool, bp);
    if (link && link.lock && locked.indexOf(link.lock) === -1) locked.push(link.lock);
    if (link && link.borrow) bp = [link.borrow];
    if (s && s.friend && c.borrow && cardAvailable(D.card(s.friend), c) && T.entry(s.friend, 4)) bp = [{ id: s.friend, lb: 4 }];
    const opts = Object.assign(euOpts(c, p, tid), { borrow: c.borrow, locked, comp: c.comp, trainee: tid || null });
    if (opts.parent) delete opts.parent.reachSS;
    if (!parent && s && s.rankGoal) opts.rankGoal = raceRankGoal(p, style, tid, s.rankGoal);
    return { opts, pool, bp, link };
  }
  function planDeck(p, style, tid, races, s) {
    const x = planSetup(p, style, tid, races, s);
    const r = T.buildDeck(x.opts, x.pool, x.bp);
    return { cards: r.cards, skills: r.skills, offers: T.deckOffers(x.opts, r.cards), link: x.link };
  }

  // cm-tab.js: CM & decks' team (the cup's aces) and the Parents tab (her gaps, Parent 1 and
  // the grandparent search, training her, the Parent 2 search, the family check).
  let cmTab = null;
  const charNames = new Map();
  function cmPlan() {
    if (cmTab || !window.UmaCmTab || !window.UmaCmPlan || !P || !T || !parents()) return cmTab;
    const fp = () => parents().family;
    const saddles = {};
    Object.keys(window.UmaVeterans.SADDLE).forEach((k) => { saddles[window.UmaVeterans.SADDLE[k]] = +k; });
    D.DATA.trainees.forEach((t) => { if (!charNames.has(t.cid)) charNames.set(t.cid, t.n); });
    const PR = window.UmaRating, SB = window.UmaSkillBudget;
    cmTab = window.UmaCmTab.create({
      D, P, T, A: window.UmaAffinity, F: window.UmaFamily, PR, SB, SS: PR.SS,
      esc, flash, save, today: TODAY, state: () => state, saddles,
      chars: () => [...new Set(D.DATA.trainees.filter((t) => D.onGlobal(t)).map((t) => t.cid))],
      cupLabel: (p) => presetLabel(p),
      owned: () => owned, ownedCode: () => ownedCode(), myUmas: () => myUmas(),
      veterans: () => (fp() ? fp().veterans() : { at: "", list: [] }),
      importVeterans: (text) => (fp() ? fp().importVeterans(text) : null),
      rentals: () => (fp() ? fp().rentalsList() : []),
      addRentals: (text) => fp() && fp().addRentals(text),
      clearRentals: () => fp() && fp().setRentals([]),
      euReady: () => euReady(),
      ensureSkills: (ids) => ensureSkills(ids),
      aceSkills: (race) => aceSkillsFor(race),
      build: (p) => E.BUILDS[p.build] || null,
      deck: (p, style, tid, races, s) => planDeck(p, style, tid, races, s),
      deckSetup: (p, style, tid, races, s) => planSetup(p, style, tid, races, s),
      skillPlan: () => {const c=cm("cm"),plan=currentSkillPlan(c);return plan && plan.mode==="plan"?plan:null;},
      refreshAceSkills: async () => {const plan=await runRaceSkills(false,true);if(!plan)throw new Error(deckJob("cm").raceError || "Compare the ace's skills first.");return plan;},
      parentLearning: (p,t,deck,n,f,prediction,weights) => parentLearning(p,t,deck,n,f,prediction,weights),
      deckOffers: (opts, cards) => T.deckOffers(opts, cards),
      // Out on Global today (rentals and the parent you train now can only have these).
      outNow: (id) => !!(SV.skills[id] && SV.skills[id][3]),
      // Her Ace-parent deck as you built it in ③ (Find my best deck), or null.
      parentDeck: (tid) => { const c = state.pcm || {}; return c.cardsFrom === "optimizer" && +c.forTrainee === +tid && (c.cards || []).length ? c.cards.map((x) => ({ id: x.id, lb: x.lb, borrowed: !!x.borrowed })) : null; },
      // These cards as an Ace-parent deck for that many extra races: { cards, offers }.
      deckWith: (p, style, tid, races, cards) => { const x = planSetup(p, style, tid, races); return { cards, offers: T.deckOffers(x.opts, cards), link: x.link }; },
      // A new ace's deck settings start from CM & decks'.
      deckDefaults: () => { const c = state.cm || {}; return { comp: Object.assign({}, c.comp || {}), borrow: c.borrow !== false, skillW: c.skillW != null ? String(c.skillW) : "1", targets: Object.assign({}, c.targets || {}), rankGoal: c.rankGoal || "" }; },
      buildTarget: (p) => E.BUILDS[p.build].target,
      buildLabel: (p) => E.BUILDS[p.build].label,
      coachTargets: () => (state.targets && E.STATS.some((x) => state.targets[x] > 0) ? state.targets : null),
      sync: () => syncWorkflow(),
      familyHTML: () => parents().familyHTML(),
      family: () => parents().st().family || {},
      planFamily: (p1, train, userChoice) => {
        const f = parents().st().family, blank = () => ({ cid: null, tid: null, white: [], blue: [0, 0], pink: [0, 0], green: 0, wins: [] });
        ["p1", "g11", "g12"].forEach(k => { f[k] = p1.f[k] ? JSON.parse(JSON.stringify(p1.f[k])) : blank(); });
        f.p1.planned = !userChoice;
        if (p1.kind === "vet") f.p1.vet = p1.v.id; else f.p1.fresh = true;
        if(p1.kind === "fresh" && p1.learning && p1.learning.ssShare>=window.UmaCmPlan.SS_SHARE)f.p1.projectedWhite=(p1.extra.whites.list||[]).map(w=>({id:w.id,learn:w.learn,spark:w.spark,stars:p1.rates.stars}));
        if (train) f.p1.wins = train.f.f.p1.wins.slice();
      },
      useRental: (friend) => {
        const r = fp().rentalsList().find(x => x.friend === friend), f = parents().st().family;
        if (!r) return;
        ["p2", "g21", "g22"].forEach((k, i) => { f[k] = JSON.parse(JSON.stringify(i ? r.parents[i - 1] : r.parent)); });
        f.p2.rental = r.friend;
      },
      trainingHTML: () => parents().trainingHTML(),
      trainingStatus: () => {
        const ps = parents().st(), t = ps.selfTrainee && D.trainee(ps.selfTrainee), n = parents().schedule();
        return t ? `${t.n} · ${n ? n.extra.length : 0} extra · ${state.cmp.parentRank || "no minimum"}` : "Choose a parent";
      },
      setParentRank: (value) => W.setParentRank(state, value),
      training: () => state.cmp.training || null,
      gotoParents: (section) => showSection(section),
      settingsKey: () => optKey("cm"),
      mustSkills: (d) => Object.keys(skillSources(Object.assign({}, d, { goal: "race" }))).map(id => ({ id, name: skillInfo(id)[0] })).sort((a, b) => a.name.localeCompare(b.name)),
      skillWeights: SKILL_W, compTypes: COMP_TYPES,
      // The race's skills for her style, most valuable first ({ id, L }), for must-haves.
      raceSkills: (p, style) => { const m = skillMap(p.id, style).map; return Object.keys(m).filter((id) => m[id] > 0 && D.DATA.skills[id] && released(id, p)).map((id) => ({ id, L: m[id] })).sort((a, b) => b.L - a.L); },
      // A parent's run with this deck and n extra races, as ② predicts it (16 careers).
      // focus: Independent Training's Training Focus ("balanced", "stamina", "sprint"), or none.
      simulate: (p, tid, cards, n, blueStart = [], focus = null) => {
        const c = state.pcm || {};
        const sim = OPT.buildCtx({ scenario: scenario(), build: p.build, trainee: tid, caps: E.capsFor(state, scenario()), raceShare: Math.min(0.5, n / 60), runs: 16,
          helloProcRate: +(c.helloProcRate || 0.4), helloUnlockRate: +(c.helloUnlockRate || 0.15), eventSuccessRate: +(c.eventSuccessRate || 0.5), eventSongBoost: +(c.eventSongBoost || 0), independent: true, skillBudget: false });
        sim.start = sim.start.map((v, i) => v + (blueStart[i] || 0));
        if (focus) OPT.applyFocus(sim, focus);
        const est = OPT.simulate(sim, cards.map((x) => ({ card: D.card(x.id), lb: x.lb })));
        return { stats: est.stats, sp: est.sp, finals: est.finals };
      },
      // Rating per skill point for a parent buying her relevant skills on this race.
      spRate: (p, style, apt) => window.UmaParentPlanner.spRating(Object.keys(parentTargetsFor({ style, globalSkills: (state.pcm || {}).globalSkills !== false }, p).targets), apt, PR, SB),
      skillName: (id) => skillInfo(id)[0],
      charName: (cid) => charNames.get(+cid) || "#" + cid,
      turnText: (t) => E.turnInfo(t, scenario()).text,
      scenario: () => ({ id: scenario().id, name: scenario().name }),
      scenarioName: (id) => (SCENARIOS.find((x) => x.id === id) || { name: id }).name,
      // Your Pull planner team for the cup's track, as the planner races it there: the 2 of your 3
      // umas worth the most on that cup (no two in one running style when another fits), then the
      // flex slot's best other uma of yours. [{ tid, style }], umas you have only.
      pullTeam: (p) => {
        const PV = window.UmaPullValues, g = PV && PV.groupOf(p), teams = (state.pull && state.pull.teams) || {};
        if (!g) return [];
        const list = teams[g] || [], mine = myUmas(), UV = window.UmaUmaValues || null;
        const core = PV.teamPick(p, list, (id) => mine.has(id), UV, D);
        const flex = list.some((m) => m && m.rotate) ? PV.flexPick(p, [...mine], core, UV, D) : null;
        return core.concat(flex ? [flex] : []).map((x) => ({ tid: +x.tid, style: x.style || null }));
      },
      trainParent: (o, section) => trainParent(o, section),
      // Parents step 3's "Improve this deck": ③'s deck optimizer for her, and how far it is (0-1, or null).
      improveDeck: () => runOptimizer("parents"),
      // The Parents plan just redid her race count for ③'s deck: when that's all that changed, the
      // search still stands (searching again for the new count could move the count again).
      keepDeckResult: () => { const j = deckJob("parents"), r = j && j.optResult; if (r && r.key !== optKey("parents") && r.key === optKey("parents", { itRaces: r.itRaces })) { r.key = optKey("parents"); r.racesFollowed = true; } },
      deckRun: () => { const j = deckJob("parents"); return j && j.optRun ? j.optRun.f || 0 : null; },
      rerender: () => { if (deckTab()) renderTab(); },
    });
    return cmTab;
  }
  // A fresh Parent 1 from the CM planner, set up in the Parents tab: the family (the ace, her,
  // and her veteran/rental parents), ① her (the coach's trainee too), ② her races, ③ the
  // ace's race as an Ace parent, ④ her target whites as spark ★.
  function trainParent(o, section) {
    const pp = parents();
    if (!pp) return;
    state.cmp.training = { cup: o.cup, tid: +o.ace.tid, parent: +o.p1.tid };
    const c = state.cm || (state.cm = {});
    c.preset = o.cup; c.style = o.style;
    const ps = pp.st(), f = ps.family || (ps.family = {});
    const blank = () => ({ cid: null, tid: null, white: [], blue: [0, 0], pink: [0, 0], green: 0, wins: [] });
    const vet = (v) => (v ? { cid: v.cid, tid: v.tid, white: v.self.white.map((w) => w.slice()), blue: v.self.blue.slice(), pink: v.self.pink.slice(), green: v.self.green, wins: v.self.wins.slice(), ...(v.rental ? { rental: v.rental } : { vet: v.id }) } : blank());
    f.ace = { cid: o.ace.cid, tid: o.ace.tid };
    f.p1 = Object.assign(blank(), { cid: o.p1.cid, tid: o.p1.tid, wins: (o.wins || []).slice() });
    f.g11 = vet(o.parents[0]); f.g12 = vet(o.parents[1]);
    if (f.rental == null) f.rental = true;
    f.builderUndo = pp.toBuilder(o.p1.tid, o.must);
    state.cmp.training.setup = o.setup;
    state.pcm = state.pcm || {};
    W.setParentRank(state, o.rank || "");
    cm("parents").cards = (o.cards || []).map(x => ({ id: x.id, lb: x.lb, borrowed: !!x.borrowed }));
    cm("parents").cardsFrom = o.cardsFrom || "planner";
    state.pcm.forTrainee = o.p1.tid;
    ps.races = o.races.slice();
    state.tab = "parents";
    state.cmp.open = Object.assign({}, state.cmp.open, { training: true });
    save();
    if (!o.quiet) flash(`${D.trainee(o.p1.tid).n} is ready to train here: her family, ${o.races.length} extra race${o.races.length === 1 ? "" : "s"} in ②, the ace's race in ③.`);
    renderTab();
    if (section) showSection(section);
  }
  // Open a workflow section and any folded sections containing it.
  function showSection(section) {
    const id = { family: "cm-family", who: "pp-who", races: "pp-races", deck: "pp-deck", rating: "pp-rating" }[section] || "cm-" + section;
    // Everything but the racing deck is in the Parents tab.
    if (state.tab !== "parents" && section !== "deck-cm") { state.tab = "parents"; save(); renderTab(); }
    setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      let p = el;
      while (p && p.id !== "tabBody") { if (p.tagName === "DETAILS") p.open = true; p = p.parentElement; }
      el.scrollIntoView({ block: "start", behavior: "smooth" });
      const focus = el.querySelector("summary, button, input, select"); if (focus) focus.focus({ preventScroll: true });
    }, 0);
  }

  // The Parents tab (parent-planner.js): the parent, her races, her deck, and the SS check.
  let pp = null;
  let ppSkillsOpen = false;
  // The Pull planner tab (pull-tab.js): the route through the banners ahead for your future
  // teams, valued with this tab's deck settings and the Parents tab's family rules.
  let pullTab = null;
  function pulls() {
    if (pullTab || !window.UmaPullTab || !window.UmaBanners || !window.UmaPullValues || !window.UmaPullPlanner || !P || !T) return pullTab;
    const c = () => cm("cm");
    pullTab = window.UmaPullTab.create({
      D, B: window.UmaBanners, P, PV: window.UmaPullValues, PP: window.UmaPullPlanner, T, A: window.UmaAffinity,
      esc, fmtDate, flash, save, today: TODAY, state: () => state,
      owned: () => owned, ownedCode: () => ownedCode(), myUmas: () => myUmas(),
      // "What I got" on the route: your limit break now (null: not owned) and the umas you got.
      setOwned: (id, lb) => { if (lb == null || lb === "") delete owned[id]; else owned[id] = Math.max(0, Math.min(4, +lb)); saveOwned(); },
      addMyUma: (id) => { const s = myUmas(); s.add(+id); setMyUmas(s); },
      euReady: () => euReady(),
      ensureSkills: (ids) => ensureSkills(ids),
      // Her racing deck there, as CM & decks builds it (its makeup, friend card and skill weight).
      // scen: the scenario Global trains in by that cup (pull-values.js); your Euophrys weight
      // changes apply in the scenario they're for.
      deckOpts: (p, style, traineeId, scen) => {
        const sv = skillMap(p.id, style), s = scen || euScen();
        return { scenario: s, overrides: s === euScen() ? euOver() : {}, trainee: traineeId, skills: sv.map, costs: sv.costs, skillWeight: c().skillW != null ? +c().skillW : 1, must: [], independent: false, itManual: c().itManual != null ? +c().itManual : 0.5, eventSuccessRate: c().eventSuccessRate != null ? +c().eventSuccessRate : 0.5, comp: Object.assign({}, c().comp || {}), borrow: c().borrow !== false };
      },
      // The ace's race whites (Parents tab's rules), out on Global by that cup.
      whites: (p, style) => {
        const sv = skillMap(p.id, style), rarity = (id) => (SV.skills[id] ? SV.skills[id][2] : null);
        const out = window.UmaParentRelevance.aceTargets({ preset: p, style, raceSkills: sv.map, debuffs: window.UmaDebuffs, minL: 0.1, rarityOf: rarity, kinds: window.UmaSkillKinds, positions: positionsFor(p) });
        return Object.keys(out.targets).filter((id) => released(id, p)).map((id) => out.targets[id]);
      },
      skillL: (p, style, id) => skillMap(p.id, style).map[id] || 0,
      settingsKey: () => JSON.stringify([euScen(), euOver(), c().comp || {}, c().borrow !== false, c().skillW]),
      settingsText: () => "Euophrys' " + (T.SCENARIOS.find((x) => x[0] === euScen()) || [0, euScen()])[1] + " preset, with CM &amp; decks' deck makeup, friend card and skill weight",
      rerender: () => { if (state.tab === "pulls") renderTab(); },
    });
    return pullTab;
  }

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
      coachTrainee: () => (deckTrainee("parents") ? D.trainee(deckTrainee("parents")) : null),
      turnText: (t) => E.turnInfo(t, scenario()).text,
      skillName: (id) => skillInfo(id)[0],
      skillNames: () => Array.from(new Set(Object.values(SV.skills).map((x) => x[0]).filter(Boolean))).sort(),
      skillIdByName: (n) => names.get(String(n || "").trim().toLowerCase()) || null,
      caps: () => { const c = E.capsFor(state, scenario()); return E.STATS.map((k) => c[k]); },
      cmMust: () => cm("parents").must || [],
      // ③'s race and style: the parent's relevant skills ({ targets, why, race, style }), or
      // null until the race's skill values load.
      relevant: () => {
        const c = cm("parents"), p = presetById(c.preset);
        loadSkillValues(p.id);
        if (c.goal === "ace" && !(pasted[p.id] && pasted[p.id][c.style]) && typeof svCache[p.id] !== "object") return null;
        return Object.assign(parentTargetsFor(c, p), { race: p.name, style: STYLE_LABEL[c.style] });
      },
      relevantLoading: () => svCache[cm("parents").preset] === "loading",
      // The family section: the ace races the CM set in CM & decks (state.cm, not ③'s parent race).
      aceRace: () => { const c = state.cm || {}; return { preset: presetById(c.preset) || defaultPreset(), style: c.style || defaultStyle() }; },
      // Her relevant skills there ({ targets, why, L } with every charted skill's L), or null
      // while the race's skill values load.
      aceSkills: (race) => aceSkillsFor(race),
      // How likely the racing deck built in CM & decks offers each skill, or null.
      // White skills the app has no race value for (none in the Umalator's data, or under 0.05 L
      // on every chart) and that aren't counted by condition either: named, so you know.
      unvalued: () => Object.keys(window.UmaSkillBudget.DATA.skills).filter((id) => window.UmaSkillBudget.DATA.skills[id][3] === 1 && /^20/.test(id) && !SV.skills[id]
        && !(window.UmaSkillKinds && window.UmaSkillKinds.skills[id]) && !(window.UmaDebuffs && window.UmaDebuffs[id]) && D.DATA.skills[id]),
      aceOffers: () => {
        const x = W.current(state), c = cm("cm");
        return x.deck && x.deck.cards ? T.deckOffers(euOpts(c, presetById(c.preset), deckTrainee("cm")), x.deck.cards) : null;
      },
      build: (p) => E.BUILDS[p.build] || null,
      // The relevant white skills the deck built in ③ can give (its skill pool), or null.
      deckRelevant: () => {
        const r = deckJob("parents").optResult;
        if (!r || !r.cards || !r.parentConfig) return null;
        const pool = window.UmaParentSkills.build(r.cards.map((x) => D.card(x.id)), { skills: SV.skills, purchases: window.UmaSkillPurchases.skills, events: window.UmaCardEvents,
          targets: r.parentConfig.targets, must: r.parentConfig.must, globalOnly: r.parentConfig.globalOnly, today: TODAY, skillsBy: r.parentConfig.skillsBy || null, cardAvailable: card => CARD_RELEASE.available(card, presetById(r.preset)) });
        return pool.skills.filter((x) => x.target && x.spark).map((x) => x.id);
      },
      setTrainee: (id) => {
        const x = W.current(state);
        if (x.ace) {
          const prior = state.cmp.training;
          const same = prior && prior.cup === x.cup && +prior.tid === +x.ace.tid && +prior.parent === +id;
          state.cmp.training = Object.assign({}, same ? prior : {}, { cup: x.cup, tid: x.ace.tid, parent: id });
        }
        setTrainee(id);
      },
      merged: true,
      renderTab: () => renderTab(),
      rankGoal: () => state.cmp.parentRank,
      statusUpdated: () => cmTab && cmTab.refreshStatus(),
      // Your veterans' decks (umaextractor import): each card at least at the limit break you
      // trained with; never lowers one. Returns { added, raised, unknown }.
      raiseOwned: (cards) => raiseOwned(cards),
      // ③ Deck: the deck builder's race header and controls, for the parent setup.
      deckHTML: () => {
        if (!P || !T) return `<div class="empty">The CM data didn't load. Refresh the page.</div>`;
        const c = cm("parents"), p = presetById(c.preset);
        loadSkillValues(p.id);
        euReady();
        // The race's skill table (must-have ☆, Global-only releases) in a closed box.
        const race = `<p class="mini">For the ace's race: <b>${esc(p.name)}</b> · ${esc(p.course.track)} ${p.course.distance}m ${esc(p.course.surface)} · ${esc(STYLE_LABEL[c.style])} (<button type="button" class="linkish" data-goto-tab="cm">change cup or ace in CM &amp; decks</button>).</p>`;
        return deckIds(`<div class="cm" data-deck-host="parents">${race}${cmOptimizer(p, c, "parents")}<details class="pp-skills"${ppSkillsOpen ? " open" : ""}><summary>Skills for this race: mark must-haves (☆), ${skillsBy(p) ? "skills out on Global by this cup" : "Global releases only"}</summary>${cmSkills(p, c, "parents")}</details></div>`, "parents");
      },
      // ② Races sets ③ Deck's Independent Training race count (no re-render: the page is drawing).
      setItRaces: (n) => { const c = cm("parents"); if (n == null) delete c.itRaces; else c.itRaces = n; },
      // ② "What the races cost": predicted stats and skill points for n extra races, with the
      // deck built in ③ (else the coach deck), Independent Training. Cached; filled in one
      // simulation at a time after the page draws.
      predictSource: () => (predictDeck() ? predictDeck().label : null),
      predict: (n) => predictCache.get(predictKey(n)) || null,
      queuePredict: (ns, done) => {
        ns.forEach((n) => { const k = predictKey(n); if (k && !predictCache.has(k) && !predictQueue.some((q) => q.k === k)) predictQueue.push({ k, n }); });
        predictDone = done;
        if (!predictTimer) predictTimer = setTimeout(predictNext, 30);
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

  function parentSkillsHTML(r) {
    const config = r.parentConfig;
    const pool = window.UmaParentSkills.build(r.cards.map(x => D.card(x.id)), {
      skills: SV.skills, purchases: window.UmaSkillPurchases.skills, events: window.UmaCardEvents,
      targets: config.targets, must: config.must, globalOnly: config.globalOnly, today: TODAY, skillsBy: config.skillsBy || null, cardAvailable: card => CARD_RELEASE.available(card, presetById(r.preset))
    });
    const name = id => skillNameHTML(id);
    const modeledAvailability = id => {
      const offer = (r.skills || []).find(x => String(x.id) === id) || (r.must || []).find(x => String(x.id) === id);
      return offer ? `<div class="mini">Estimated offer/unlock availability: ${Math.round(offer.p * 100)}%.${offer.hintP == null ? "" : ` Direct white hints: ${Math.round(offer.hintP * 100)}%.`} Not a learned-skill probability.</div>` : "";
    };
    const rows = skills => skills.map(s => `<tr data-parent-skill="${esc(s.id)}"><th>${name(s.id)} ${s.must ? '<span class="skillpill">Must-have</span>' : ""}${s.release === false ? ' <span class="mini warn">Not listed on Global</span>' : s.release == null ? ' <span class="mini warn">Release metadata unknown</span>' : ""}<div class="mini">${s.spark ? "White · skill spark candidate if learned" : s.rarity === 2 ? "Gold · learning it gives its white skill's spark a 40% chance (20% for the white alone)" : "Spark eligibility unverified / not a white skill"}</div>${modeledAvailability(s.id)}</th><td>${s.sources.map(source => {
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
      <details><summary>Parent estimates and limitations</summary><p class="mini">${r.expected == null ? "" : `Target offer estimate: ${r.expected.toFixed(1)} under the existing skill-source heuristic; not a learned-skill count or SP budget. `}Parent scoring values each target once through modeled direct offers or canonical gold-to-white prerequisite availability, alongside weighted stats; the share that comes with its gold counts double, since learning the gold raises the white's spark chance from 20% to 40%. A gold hint does not grant a separate white hint or discount. It does not solve an affordable parent skill set. Trainee innate/awakening skills are assumed available by scoring and are excluded from its added support value; this pool still shows their support sources. Trainee-only and scenario-only skills are outside this deck-source inventory. Event data may be incomplete; unknown event routes remain labeled. Static shortlisting can miss cards that help by discounting trainee skills, and final ace simulation can rank candidates differently. All listed outcomes are possibilities, not guarantees.</p></details>
    </div>`;
  }

  function optResultHTML(r, c, host = deckHost()) {
    const j = deckJob(host);
    const p = presetById(r.preset);
    const stale = r.key !== optKey(host);
    const w = j.wish;
    const total = r.cards.reduce((a, x) => a + x.score, 0);
    return `<div class="opt-result">
      <h4>${r.goal === "ace" ? "Best ace parent deck" : r.simulationMeta && r.simulationMeta.scenario === "grandlive" ? "Suggested deck" : "Best deck"} for ${esc(p.name)} · ${STYLE_LABEL[r.style]} · ${esc(T.SCENARIOS.find((x) => x[0] === r.scen)[1])} weights</h4>
      ${r.skillSetCheck ? `<p class="mini">The skill-set check compared ${r.skillSetCheck.decks} shortlisted deck${r.skillSetCheck.decks === 1 ? "" : "s"}, using equipped skills and affordable purchases together.</p>` : ""}
      ${stale ? `<p class="mini warn">Settings or cards changed since this search. Press <b>Find my best deck</b> again to update it.</p>` : ""}
      ${!stale && r.racesFollowed && r.itRaces !== c.itRaces ? `<p class="mini">Searched for ${r.itRaces} extra G1${r.itRaces === 1 ? "" : "s"}; her plan (Parents step 3) now runs ${c.itRaces} with this deck, since that's how many keep her at SS with it. Searching again would aim the deck at ${c.itRaces}, which can move the count again, so this deck stays.</p>` : ""}
      <div class="opt-cards">${r.cards.map((x) => {
        const card = D.card(x.id);
        return `<div class="opt-card ty-${card.ty}">
        <span class="tydot" aria-hidden="true"></span>
        <div class="opt-name"><b>${esc(card.n)}</b> <span class="mini">${esc(card.t)}</span>${cardReleaseHTML(card)}
          <div class="mini">${D.RARITY[card.r]} ${D.typeLabel(card.ty)} · LB${x.lb}${x.borrowed ? " · <b>borrow this</b>" : ""} · <button type="button" class="linkish" data-hide-card="${x.id}" title="Leave this card out of every deck search from now on (My cards lists it)">don't use</button>${c.locked.indexOf(x.id) !== -1 ? " · locked" : r.link && r.link.lock === x.id ? " · scenario card" : ""}</div>
          ${x.it ? `<div class="mini">${itPartsText(x.it)}</div>` : ""}
          ${r.goal === "race" && x.gives && x.gives.length ? `<div class="mini must-gives">Gives your must-have: ${x.gives.map((id) => skillNameHTML(id)).join(", ")}</div>` : ""}
          ${x.alt ? `<div class="mini">Next best: ${esc(D.card(x.alt.id).n)}${cardReleaseHTML(D.card(x.alt.id))} LB${x.alt.lb} (${Math.round(x.alt.score)}${x.alt.losesMust ? (r.goal === "race" ? ", but no must-have" : ", lower modeled must-have coverage") : ""})</div>` : ""}</div>
        <div class="num" title="Euophrys score with the other five cards fixed, plus skills">${Math.round(x.score)}<div class="mini">${Math.round(x.base)} + ${Math.round(x.skill)} skills</div></div>
      </div>`;
      }).join("")}</div>
      ${r.link ? `<p class="mini${r.link.lock ? "" : " warn"}">${r.link.lock ? `<b>${esc(r.link.name)}</b> is in${r.link.borrow ? " as the borrowed card" : ""}: uma.guide calls the scenario's link card mandatory for Independent Training.` : r.link.blocked ? `uma.guide calls ${esc(r.link.name)} mandatory for Independent Training here, but your deck makeup allows no Friend card.` : `uma.guide calls ${esc(r.link.name)} mandatory for Independent Training here, but you don't own her: mark her owned, or allow a borrowed card.`}</p>` : ""}
      ${r.goal === "race" ? `<p class="mini">Build-specific purchases: <button type="button" class="linkish" id="cmRaceShow">${deckJob("cm").raceRunning ? "comparing…" : "see the skill-set comparison above"}</button></p>` + mustResultHTML(r, c) : ""}
      ${predictedHTML(r, host)}
      ${supportEventsHTML(r)}
      <p class="mini">Each number is the card's score with the other five fixed: Euophrys' score plus its skill score. Deck total ${Math.round(total)}.</p>
      ${r.simulationMeta && r.simulationMeta.scenario === "grandlive" && r.goal === "race" ? '<p class="mini">The final suggestion also considers simulated careers. A lower static total can still finish closer to your targets or buy a stronger affordable skill set.</p>' : ""}
      ${r.goal !== "race" ? parentSkillsHTML(r) : r.expected != null ? `<p><b>About ${r.expected.toFixed(1)} target skills</b> expected from this deck's hints and events (out of ${r.skillsUsed} worth getting${r.goal === "debuff" ? " for a debuffer here" : " on this race"}). Each one you learn can become a skill spark.</p>
        <div class="opt-skills">${r.skills.map((x) => `<span class="skillpill">${skillNameHTML(x.id)} ${r.goal === "ace" ? `<b>${x.L.toFixed(2)} L</b> ` : ""}<span class="mini">${Math.round(x.p * 100)}%</span></span>`).join(" ")}</div>` : r.est && r.est.skillBudget ? affordableSkillsHTML(r) : r.skills.length ? `<div class="opt-skills"><b>Best skills this deck can hint here:</b> ${r.skills.map((x) => `<span class="skillpill">${skillNameHTML(x.id, skillInfo(x.id)[0])} <b>${x.L.toFixed(2)} L</b> <span class="mini">${Math.round(x.p * 100)}%</span></span>`).join(" ")}</div>` : r.skillsUsed ? "" : `<p class="mini">Skills weren't counted (no skill values for this race).</p>`}
      ${r.goal === "race" ? skillSourcesHTML(r.skills || [], !!(r.est && r.est.supportEvents)) : ""}
      <div class="row-wrap">
        <button type="button" class="btn" data-use-opt="1">Use this deck in the coach</button>
        <button type="button" class="btn ghost" id="cmWish" ${j.wishJob || stale && r.est && r.est.skillBudget ? "disabled" : ""}>${j.wishJob ? "Comparing upgrades…" : "Which cards would improve it?"}</button>
        ${r.simulationMeta && r.simulationMeta.scenario === "grandlive" && r.goal === "race" ? `<button type="button" class="btn ghost" id="cmSensitivity" ${stale || j.sensitivityJob || comparisonDecks(r, c).length < 2 ? "disabled" : ""}>${j.sensitivityJob ? "Checking…" : "Check ranking sensitivity"}</button>${j.sensitivityJob ? '<span class="mini" id="sensitivityProgress">0%</span>' : ""}` : ""}
      </div>
      ${sensitivityHTML(r)}
      ${r.wishMeta && Array.isArray(w) ? `<p class="mini" id="wishlistMethod">Upgrade comparison: ${r.wishMeta.candidates} shortlisted replacements, ${r.wishMeta.runs} careers per deck on paired seed ${r.wishMeta.seed}; target fit and affordable skills. Locked cards, borrowing and must-have coverage are preserved. This is a limited sample; use ranking sensitivity for closer checks.</p>` : ""}
      ${Array.isArray(w) ? (w.length ? `<div class="wish"><h4>Cards worth getting</h4><ol>${w.map((x) => {
        const cd = D.card(x.id);
        const have = owned[x.id] != null;
        return `<li><b>${esc(cd.n)}</b> <span class="mini">[${esc(cd.t)}] ${D.RARITY[cd.r]} ${D.typeLabel(cd.ty)}</span>${cardReleaseHTML(cd)} ${have ? "from LB" + owned[x.id] + " to LB4" : "at LB4"}: <b>+${Math.round(x.gain)}</b>, replacing ${esc(D.card(x.replaces).n)}</li>`;
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
  function predictedRatingHTML(r, host = deckHost()) {
    const PR = window.UmaRating, PP = window.UmaParentPlanner;
    if (!PR || !PP || !window.UmaParentData) return "";
    const t = r.simulationMeta && r.simulationMeta.trainee ? D.trainee(r.simulationMeta.trainee) : null;
    const stars = t ? t.r : 3;
    const c = host === "parents" ? cm(host) : null, selected = c ? c.reachSS : (state.cm || {}).rankGoal;
    const raceGoal = !c && selected && presetById(r.preset) ? raceRankGoal(presetById(r.preset), r.style, t && t.id, selected) : null;
    const rate = c && presetById(r.preset) ? parentSpRating(Object.assign({}, c, { goal: r.goal, style: r.style }), presetById(r.preset)) : raceGoal ? raceGoal.spRating : PP.SP_RATING;
    const stats = PR.statsScore(r.est.stats), skills = Math.round((r.est.sp || 0) * rate), unique = PR.uniqueBonus(stars, stars);
    const total = stats + skills + unique;
    const rk = PR.rankOf(total);
    const label = selected === "S" ? "S" : "SS", minimum = PR.rankThreshold(label);
    const fin = r.est.finals || [], hit = fin.filter((f) => PR.statsScore(f.stats) + Math.round(f.sp * rate) + unique >= minimum).length;
    return `<p class="mini"><b>Predicted rating: about ${total.toLocaleString()} (${rk.label})</b>${selected && fin.length ? ` · ${label} in ${hit} of ${fin.length}` : ""} · stats ${stats.toLocaleString()} + skills ~${skills.toLocaleString()} + unique ${unique}. <button type="button" class="linkish" data-cmp-jump="rating">Plan the buy in ④</button>.</p>`;
  }

  // Predicted stats from the simulated careers, against your targets when you set them.
  function predictedHTML(r, host = deckHost()) {
    if (!r.est) return "";
    const f = r.fit;
    const parent = r.goal === "ace";
    // The racing deck always shows her gaps: target (yours, else the build's), predicted, short.
    if (!parent) {
      const g = raceGaps(r, cm(host)), short = g.short.map((v, i) => v > 0 ? E.STAT_LABELS[E.STATS[i]] + " −" + v : "").filter(Boolean);
      const gapTable = `<div class="predicted">
      <b>Predicted stats and her gaps</b> <span class="mini">(average of ${r.est.runs || 16} simulated careers, before inheritance)</span>
      <div class="table-wrap"><table class="pred cm-gaps"><thead><tr><th></th>${E.STATS.map((s) => `<th>${E.STAT_LABELS[s]}</th>`).join("")}</tr></thead>
        <tbody><tr><th>Target</th>${g.target.map((t, i) => `<td class="num">${t}${g.mine[i] ? "" : '<div class="mini">build</div>'}</td>`).join("")}</tr>
        <tr><th>Predicted</th>${g.stats.map((v) => `<td class="num"><b>${v}</b></td>`).join("")}</tr>
        <tr><th>Short</th>${g.short.map((v, i) => `<td class="num ${v > 0 ? "short" : "over"}">${v > 0 ? "−" + v : "+" + (g.stats[i] - g.target[i])}</td>`).join("")}</tr></tbody></table></div>
      <p class="mini">${short.length ? `<b>Her gaps: ${short.join(" · ")}.</b> Parents turns them into the blue sparks to look for.` : "<b>No gaps:</b> every target is reached."} ${host === "cm" ? `<button type="button" class="linkish" data-goto-tab="parents" data-goto-section="gaps">Fill them in Parents →</button>` : ""}</p>`;
      return gapTable + powerLineHTML(presetById(r.preset), r.style, g.stats[2]) + (rushedLine(g.stats[4], 0, false) ? `<p class="mini">${rushedLine(g.stats[4], 0, false).trim()}</p>` : "") + `<p class="mini">Skill points: about ${r.est.sp}.</p>
      ${fitNoteHTML(r)}
      ${simulationDiagnosticsHTML(r)}${predictedIncludesHTML(r)}</div>`;
    }
    const cell = (i) => {
      const s = E.STATS[i];
      if (!f) return `<td class="num">${r.est.stats[i]}</td>`;
      const t = Math.min(f.target[s], f.caps[s]);
      const d = r.est.stats[i] - t;
      return `<td class="num">${r.est.stats[i]}<div class="mini">${t}</div><div class="mini ${d < 0 ? "short" : "over"}">${d < 0 ? d : "+" + d}</div></td>`;
    };
    const blue = (x) => (x > 1100 ? 10 : x >= 600 ? 5 : 0);
    return `<div class="predicted">
      <b>${f ? "Predicted stats vs your targets" : "Predicted stats"}</b> <span class="mini">(average of ${r.est.runs || 16} simulated careers${f ? "; rows: predicted, target, difference" : ""})</span>
      <table class="pred"><thead><tr>${E.STATS.map((s) => `<th>${E.STAT_LABELS[s]}</th>`).join("")}</tr></thead>
        <tbody><tr>${E.STATS.map((_, i) => cell(i)).join("")}</tr>
        ${parent ? `<tr class="blue-row">${E.STATS.map((_, i) => `<td class="num"><span class="mini">3★ ${blue(r.est.stats[i])}%</span></td>`).join("")}</tr>` : ""}</tbody></table>
      <p class="mini">Skill points: about ${r.est.sp}.${parent ? " 3★: the chance of a 3-star blue spark if that stat is the one picked (uma.guide: 0% under 600, 5% to 1100, 10% over). Inheritance isn't in these numbers and adds more." : ""}</p>
      ${parent ? predictedRatingHTML(r, host) : ""}
      ${fitNoteHTML(r)}
      ${simulationDiagnosticsHTML(r)}${predictedIncludesHTML(r)}
    </div>`;
  }
  // Conserve Power (mechanics.js): past a power line she builds up acceleration for her last spurt.
  // The race simulator and KuromiAK's mechanics document put the line in different places on a
  // course with a power penalty; both are shown until it's settled.
  function powerLineHTML(p, style, power) {
    const M = window.UmaMechanics;
    if (!M || !p) return "";
    const l = M.conservationLine(p), at = (line) => power > line ? `she's past it (+${power - line})` : `she's ${line - power + 1} short`;
    const where = l.penalty ? `the race simulator puts it at <b>${l.sim}</b> here (${esc(l.ground)} ${esc(l.surface.toLowerCase())} takes ${l.penalty} off power first), KuromiAK's race-mechanics document at <b>1200</b> (no ground penalty for this): ${at(l.sim)} of the first, ${at(l.doc)} of the second. Not settled; the deck scoring uses the simulator's` : `at <b>1200</b> on this course (no power penalty on ${esc(l.ground)} ${esc(l.surface.toLowerCase())}): ${at(1200)}`;
    return `<p class="mini"><b>Power line (Conserve Power):</b> past it she builds up extra acceleration for her last spurt, a big step in lengths. It's ${where}. Predicted power: ${power}.</p>`;
  }
  // How the deck search scored and picked the deck: target fit, or race value (lengths), with the
  // held-out recheck and a close call when the runner-up is within the noise.
  function fitNoteHTML(r) {
    const f = r.fit;
    if (!f) return "";
    const swaps = (lead) => f.swaps.length ? " " + lead + ": " + f.swaps.map((x) => esc(D.card(x.out).n) + " → " + esc(D.card(x.in).n)).join(", ") + "." : r.skillSetCheck ? " No swaps kept after the skill-set check." : " Euophrys' pick was already the best.";
    const L = (n) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(1) + " L";
    const v = f.validation || {}, held = v.heldOut ? ` The best ${v.heldOut.decks} of ${v.candidates} decks tried were rechecked on ${v.heldOut.runs} fresh careers.` : "";
    let close = "";
    if (f.close) {
      const out = r.cards.filter((x) => !f.close.cards.some((y) => y.id === x.id && y.lb === x.lb)), inn = f.close.cards.filter((x) => !r.cards.some((y) => y.id === x.id && y.lb === x.lb));
      const swap = out.map((x, i) => esc(D.card(x.id).n) + " → " + (inn[i] ? esc(D.card(inn[i].id).n) : "?")).join(", ");
      close = swap ? ` <b>Close call:</b> ${swap} scores within the noise (${f.scoring === "race" ? Math.abs(f.close.gap / OPT.L_VALUE).toFixed(1) + " L apart, noise ± " + (2 * f.close.se / OPT.L_VALUE).toFixed(1) + " L" : Math.round(f.close.gap) + " points apart, noise ± " + Math.round(2 * f.close.se)}), so treat them as tied: pick by the cards you'd rather raise or the skills you want.${r.skillSetCheck ? " The skill-set check raced it too." : ""}` : "";
    }
    if (f.scoring === "race") {
      const statL = (f.after.raceL || 0) - (f.before.raceL || 0), skillL = ((f.after.skill || 0) - (f.before.skill || 0)) / OPT.L_VALUE;
      return `<p class="mini">Scored by <b>race value</b>: lengths on this course for her style, from her simulated stats (each stat's value measured across its range in the race simulator, no skills, Normal mood; stamina read ${OPT.STAMINA_MARGIN} lower for opponents' debuffs) plus the skills each career's SP buys. Against Euophrys' pick: ${L(statL)} from stats, ${L(skillL)} from skills.${swaps("Swapped")}${held}${close} Type your own targets to rank by them instead.</p>`;
    }
    return `<p class="mini">${f.after.short ? Math.round(f.after.short) + " points short in all" : "Every target reached"}; Euophrys' pick alone: ${Math.round(f.before.short)} short.${swaps("Swapped for your targets")}${held}${close}</p>`;
  }
  function predictedIncludesHTML(r) {
    return `
      <details class="pred-help"><summary>What the predicted stats include</summary>
        <p class="mini"><b>Included:</b> your trainee's starting stats and growth bonuses (100 each without a trainee); every training turn up to the finale, with your cards dealt onto trainings by their specialty priority and the best training picked for your targets each turn (rest when energy runs low, failures by energy); the game's training formula with friendship at bond 80+, training effectiveness, stat bonuses, mood effect and unique effects; facility levels (+1 per 4 trainings, level 5 at summer camp); bonds (+7 per training, +5 per hint, plus card events); ${r.est.supportEvents ? "parsed ordinary-support event choices with coupled stats, SP, energy, bond, mood and hints; whole-card aggregate fallbacks where incomplete;" : "each card's aggregate event stats, skill points and energy;"} about 120 per stat from random events; ${r.est.calendarAssumptions ? "scheduled goal and URA races with winning rewards and Race Bonus; optional races: " + (typeof r.est.races === "number" ? Math.round(r.est.races * 100) / 100 : "not reported") + " per career" : "optional races on " + (r.independent ? "about 1 turn in 4 (a G1-heavy Independent Training agenda)" : "about 1 turn in 10 after the debut (more in Trackblazer)") + " with your race bonus"}; half gains past 1200; your stat caps with sparks; ${r.est.grandConcert ? "Grand Concert Performance, sampled lesson shops, song mastery gains, delayed friendship/specialty buffs, concerts, and Light Hello's first/repeat/unlock events, five outings, max energy and completion-dependent ending" : "a flat multiplier for the scenario's own bonuses"}.</p>
        <p class="mini"><b>Not included, so add these yourself:</b> inheritance (the two inspiration events from your parents' sparks), ${r.est.calendarAssumptions ? "separate career-end and secret-event rewards" : "goal and finale race rewards"}, ${r.est.grandConcert ? "other Friend/Group outings, raw-text event conditions/free grants, guest placements, uncalibrated event-frequency magnitude, hint-event stats and random mood drops (Grand Concert starts at Normal mood and uses Recreation/Hello to raise it)" : "friend card outings, New Year events, hint-event stats, scenario mechanics beyond the flat multiplier, and mood drops (it assumes Great all career)"}. These are simplified estimates, not guaranteed results. Missing mechanics can change both the predicted stats and how decks compare.</p>
      </details>`;
  }

  // How the deck covers each must-have: the chance it's offered and from which cards, or which
  // cards (outside the ones you can use) would give it.
  function mustResultHTML(r, c) {
    if (!r.must || !r.must.length) return "";
    const all = {};
    D.DATA.supports.filter((x) => cardAvailable(x, c)).forEach((x) => (x.hs || []).concat(x.es || []).forEach((id) => { (all[id] = all[id] || []).push(x); }));
    return `<div class="must-result"><b>Must-have skills</b><ul>${r.must.map((m) => {
      const name = skillNameHTML(m.id);
      if (m.p > 0) {
        const from = m.src.map((id) => { const cd = D.card(id); return esc(cd.n) + ((cd.es || []).map(String).indexOf(String(m.id)) !== -1 ? " (event)" : " (hint)"); }).join(", ");
        return `<li class="ok"><b>${name}</b>: about ${Math.round(m.p * 100)}% to be offered, from ${from}.</li>`;
      }
      if (!all[m.id]) return `<li class="miss"><b>${name}</b>: no support card available by this cup gives it (it comes from trainees or the scenario), so it can't shape the deck.</li>`;
      const others = all[m.id].filter((x) => !r.cards.some((y) => y.id === x.id)).sort((a, b) => b.r - a.r).slice(0, 4);
      return `<li class="miss"><b>${name}</b>: no card ${c.ownedOnly && ownedIds().length ? "you own" : "the optimizer could use"} gives it${Object.keys(c.comp).length ? " with this deck makeup" : ""}.${others.length ? " Cards that do: " + others.map((x) => esc(x.n) + " [" + esc(x.t) + "]").join(", ") + "." : ""}</li>`;
    }).join("")}</ul></div>`;
  }

  function cmSkills(p, c, host = "cm") {
    const status = svCache[p.id];
    const mine = pasted[p.id] && pasted[p.id][c.style];
    let rows = skillRows(p.id, c.style);
    const src = skillSources(c);
    const deckIds = new Set((c.cards || []).map((sl) => sl.id));
    const trn = deckTrainee(host) ? D.trainee(deckTrainee(host)) : null;
    const known = new Set(trn ? trn.us.concat(trn.is, trn.as) : []);
    const q = (c.sq || "").trim().toLowerCase();
    const cut = skillsBy(p), REL = window.UmaSkillRelease;
    const changed = mine ? {} : simVariant(p).changed || {};
    rows = rows.filter((r) => {
      const info = skillInfo(r.id);
      if (c.globalSkills && !REL.outBy(info, cut)) return false;
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
    return `<section class="panel cm-skills" data-deck-host="${host}">
      <h3>Skills for this race · ${STYLE_LABEL[c.style]}</h3>
      <p class="mini">${mine ? "Using <b>your pasted Umalator results</b> for this race and style." : `Median length gain (L = one horse length) of each skill on this course, from <a href="https://alpha123.github.io/uma-tools/umalator-global/" target="_blank" rel="noopener">alpha123's Umalator</a>: the same skill chart, run here for every skill. ${simNote(p)}`} SP totals include every required tier before hints. L per 100 SP uses that full price. The affordable-skill result applies the hints available in each simulated career.</p>
      <div class="db-controls">
        <label class="field grow"><span>Search</span><input data-cm="sq" value="${esc(c.sq || "")}" placeholder="Skill name" autocomplete="off"></label>
        <label class="field"><span>Show</span><select data-cm="sfilter">${opt([["all", "All skills"], ["cards", c.ownedOnly && ownedIds().length ? "Skills my cards can give" : "Skills Global cards can give"], ["deck", "Skills this deck can give"]], c.sfilter)}</select></label>
        <label class="chip-toggle" ${cut ? `title="Skills on Global now, plus the ones JP had by this cup's JP date (${fmtDate(p.jp.start)}): Global releases in JP's order."` : ""}><input type="checkbox" data-cm="globalSkills" ${c.globalSkills ? "checked" : ""}> ${cut ? "Out on Global by this cup" : "On Global only"}</label>
      </div>
      <div id="cmSkillTable">${shown.length ? `<div class="table-wrap"><table class="skills"><thead><tr><th>Skill</th><th class="num">Median</th>${mine ? "" : '<th class="num opt-col">Mean</th>'}<th class="num">SP total</th><th class="num">L / 100 SP</th><th class="opt-col">From cards</th></tr></thead><tbody>
        ${shown.map((r) => {
          const info = skillInfo(r.id);
          const cost = window.UmaSkillBudget.baseCost(r.id);
          const from = src[r.id] || [];
          const kind = info[2] === 2 ? "gold" : info[2] === 9 ? "inh" : "white";
          const must = c.must.indexOf(String(r.id)) !== -1;
          return `<tr class="sk-${kind}"><td><button type="button" class="must-tog" data-must="${r.id}" aria-pressed="${must}" title="${must ? "Remove from" : "Add to"} the deck optimizer's must-have skills">${must ? "★" : "☆"}</button> <b>${skillNameHTML(r.id, info[0])}</b>${releasePill(info, p, cut)}${changed[r.id] ? ` <span class="pill" title="Valued as JP's balance update of ${fmtDate(changed[r.id])} left it. Global runs JP's calendar in order, so it should have this version by this cup; it has an older one now.">${monthYear(changed[r.id])} JP version</span>` : ""}${known.has(r.id) ? ' <span class="pill" title="Your trainee has this unique, or can buy this innate/awakening skill">trainee skill</span>' : ""}${g8Pill(c.preset, c.style, r.id)}${gateTag(r.id, c.style)}${r.ahead ? ` <span class="pill" title="Needs a rival ahead of her. You set Front Runners in this cup to fight for the lead, so its simulated value is counted at ${Math.round(r.ahead * 100)}%.">needs a rival ahead: counted at ${Math.round(r.ahead * 100)}%</span>` : ""}</td><td class="num"><b>${r.L.toFixed(2)}</b></td>${mine ? "" : `<td class="num opt-col">${r.mean != null ? r.mean.toFixed(2) : "–"}</td>`}<td class="num">${cost == null ? "Unknown" : cost}</td><td class="num">${cost ? (r.L / cost * 100).toFixed(2) : "–"}</td><td class="mini opt-col">${from.slice(0, 3).map((x) => esc(x.n) + (deckIds.has(x.id) ? " ★" : "")).join(", ")}${from.length > 3 ? " +" + (from.length - 3) : ""}</td></tr>`;
        }).join("")}</tbody></table></div>
        ${rows.length > shown.length ? `<button type="button" class="btn ghost" data-cm-more="1">Show more (${rows.length - shown.length} left)</button>` : ""}` : `<div class="empty">${empty}</div>`}</div>
      ${leftOutHTML(p, c, cut)}
      <details class="paste" data-cmp-open="${host}-paste">
        <summary>Use your own Umalator results</summary>
        <p class="mini">In the Umalator's <b>Skill chart</b> tab, set up your own uma for this race and run it, then select the whole results table, copy it and paste it here. The coach reads each skill's median and uses it for this race and running style (${STYLE_LABEL[c.style]}). For purchase comparisons, use a chart with no purchased skills; the Umalator's learned-skill list is not imported.</p>
        <textarea id="cmPaste" rows="5" placeholder="Paste the Skill chart table here"></textarea>
        <div class="row-wrap"><button type="button" class="btn small" id="cmPasteBtn">Use these values</button>${mine ? '<button type="button" class="btn ghost small" id="cmPasteReset">Go back to the built-in values</button>' : ""}</div>
      </details>
    </section>`;
  }

  // Front Runners: skills worth more to her than their L. Concentration and Focus (a quicker gate
  // start) count only the distance it saves, and greens only their stat boost, but they all fire
  // at the gate: they help her take the lead, and they're among the 3 opening skills that set off
  // Groundwork right away. The simulator can't put a number on either, so it's a tag.
  const GATE_SKILLS = new Set(["200431", "200432"]); // Concentration, Focus: the only start-delay skills
  function gateTag(id, style) {
    if (style !== "Nige") return "";
    const k = String(id), kind = window.UmaSkillKinds && window.UmaSkillKinds.skills[k];
    if (GATE_SKILLS.has(k)) return ' <span class="pill" title="Its value here is only the distance a quicker start saves. For a Front Runner a quick start also helps her take the lead, and it fires at the gate, so it\'s one of the 3 skills that set off Groundwork right away. The simulator can\'t put a number on either.">helps her lead</span>';
    if (kind && kind[0] === "green") return ' <span class="pill" title="Its value here is only its own stat boost. Greens fire at the gate, so with Concentration, Early Lead or other greens they make the 3 skills that set off Groundwork right away, which the values assume. The simulator can\'t put a number on that.">sets off Groundwork</span>';
    return "";
  }

  // Under the skills table: what the values leave out for her running style, and why (the same
  // release filter as the table).
  function leftOutHTML(p, c, cut) {
    const REL = window.UmaSkillRelease, out = skillsLeftOut(p.id, c.style);
    const list = (k) => out[k].filter((r) => !c.globalSkills || REL.outBy(skillInfo(r.id), cut));
    const names = (rows) => rows.slice(0, 3).map((r) => skillNameHTML(r.id)).join(", ") + (rows.length > 3 ? "…" : "");
    const count = (rows) => rows.length + (rows.length === 1 ? " skill" : " skills");
    const ahead = list("ahead"), back = list("back"), front = list("front"), parts = [];
    if (ahead.length) parts.push(`${count(ahead)} that need a rival right ahead of her (${names(ahead)}), since the values have her leading, with nobody ahead (set <b>Front Runners in this cup</b> above if she fights for the lead)`);
    if (back.length) parts.push(`${count(back)} that need her in the back half of the pack (${names(back)})`);
    if (front.length) parts.push(`${count(front)} that need her in the front half of the pack (${names(front)})`);
    const style = STYLE_NAME[c.style] || c.style;
    const left = parts.length ? `<p class="mini cm-leftout">Left out for ${/^[AEIOU]/.test(style) ? "an" : "a"} ${esc(style)}: ${parts.join("; ")}. The Umalator runs one uma alone, so it would count them.</p>` : ""
    const contest = c.style === "Nige" && contestShare(p.id) ? `<p class="mini">She fights for the lead here: skills that need a rival ahead of her are counted at ${Math.round(contestShare(p.id) * 100)}% of their value (your assumption, not a measured rate), here and in her deck, skill purchases and Parents.</p>` : "";
    const gate = c.style === "Nige" ? '<p class="mini cm-gate">Tagged <b>helps her lead</b> and <b>sets off Groundwork</b>: Concentration, Focus and greens are worth more to a Front Runner than their L. They fire at the gate, where they help her take the lead and, three together, set off Groundwork right away; the simulator can\'t put a number on either.</p>' : "";
    return left + contest + gate;
  }

  function parseUmalator(text) {
    const names = {};
    Object.entries(D.DATA.skills).forEach(([id, n]) => { names[id] = n; });
    if (SV) Object.entries(SV.skills).forEach(([id, v]) => { names[id] = v[0]; });
    return OPT.parseChart(text, names);
  }

  const raceMemo = new Map();
  const skillPlanKey=c=>JSON.stringify([
    c.preset,c.style,contestShare(c.preset),(c.cards||[]).map(x=>[x.id,x.lb,!!x.borrowed]),
    c.raceSkills?Object.assign({},c.raceSkills,{open:undefined}):null,
    ["targets","must","skillW","statsW","globalSkills","ownedOnly","borrow","independent","itRaces","itManual","eventSuccessRate","eventSongBoost","helloProcRate","helloUnlockRate","rankGoal"].map(k=>c[k]),
    c.family||{},c.predicted,ownedCode(),state.scenario,state.caps,state.sparks,euOver(),pasted[c.preset] && pasted[c.preset][c.style],D.DATA.meta.built
  ]);
  const currentSkillPlan=c=>c.skillPlan && c.skillPlan.key===skillPlanKey(c)?c.skillPlan:null;
  function accessFamily(raw) {
    const family={};window.UmaFamily.SLOTS.forEach(slot=>{
      const m=raw && raw[slot];if(!m || !m.cid)return;
      const t=m.tid && D.trainee(m.tid);
      family[slot]=Object.assign({},m,{name:t?t.n:"Unknown version",unique:t && t.us && t.us[0]?"9"+String(t.us[0]).slice(1):m.unique});
    });return family;
  }
  function affinityFor(t,family) {
    const links={trainee:t.cid},wins={};window.UmaFamily.SLOTS.forEach(slot=>{links[slot]=family[slot] && family[slot].cid;if(family[slot])wins[slot]=family[slot].wins||[];});
    return window.UmaAffinity.individual(links,wins);
  }
  function skillSourcesFor(c,cards,t,entered,mode) {
    if(mode==="finished")return ACCESS.build({mode,entered});
    const opts=euOpts(c,presetById(c.preset)),family=accessFamily(c.family);
    const sourceCards=(cards||[]).filter(x=>cardAvailable(D.card(x.id),c)).map(x=>{
      const card=D.card(x.id),ownedHere=owned[x.id]!=null && +owned[x.id]>=+x.lb;
      if(c.ownedOnly && ownedIds().length && !x.borrowed && !ownedHere)return null;
      return {id:x.id,name:card.n+" ["+card.t+"] LB"+x.lb,borrowed:!!x.borrowed,planned:!ownedHere && !x.borrowed,offers:T.deckOffers(opts,[x])};
    }).filter(Boolean);
    return ACCESS.build({trainee:t,cards:sourceCards,family,affinity:affinityFor(t,family),entered});
  }
  function parentLearning(p,t,deck,n,parents,prediction,weights) {
    const family=accessFamily(parents),c=state.pcm||{};
    const direct=T.deckOffers({scenario:euScen(),trainee:t.id,independent:[n,0,0],offerRaces:n,itManual:+(c.itManual||0.5),eventSuccessRate:+(c.eventSuccessRate||0.5),skills:{}},deck.cards);
    return ACCESS.project({trainee:t,offers:direct,family,affinity:affinityFor(t,family),weights,stats:prediction.stats,sp:prediction.sp,finals:prediction.finals,minimum:window.UmaRating.SS});
  }
  function sourceRowsHTML(r) {
    const ids=[...new Set(r.plan.selected.map(x=>x.id).concat((r.requested||[]).map(x=>x.id)))];
    return `${r.access.missing.length ? `<p class="mini warn">Missing sources: ${r.access.missing.map(id=>skillNameHTML(id)).join(", ")}. These requests are excluded from purchases.</p>` : ""}<details><summary>Where these skills come from</summary><div class="table-wrap"><table><thead><tr><th>Skill</th><th>Source</th><th>Estimated access</th></tr></thead><tbody>${ids.map(id=>{
      const row=r.access.byId[id],sources=row?row.sources:[];
      return `<tr><th>${skillNameHTML(id)}</th><td>${sources.length?[...new Set(sources.map(s=>esc(s.name)))].join("; "):"No source in this deck or entered family"}</td><td>${row?`${Math.round(row.p*100)}%${sources.some(s=>s.conditional)?" · conditional":" · available"}`:"Not included in purchases"}</td></tr>`;
    }).join("")}</tbody></table></div><p class="mini">Access means an opportunity to buy a skill, not a purchase or an activation. Card offers and inspiration are uncertain. Awakening availability is assumed. Planned cards and parents must be obtained or trained first.</p></details>`;
  }
  function raceState(c) {
    return c.raceSkills || (c.raceSkills = { mode: "plan", stats: {}, apt: {}, skills: [], sp: "", uniqueLv: "1" });
  }
  // Your real CM races for this cup (cm-log.js), under the team.
  const logOpen = {};
  function cmLogHTML(p) {
    if (!window.UmaCmLog || !p) return "";
    const cmp = state.cmp || {}, team = ((cmp.byCup || {})[p.id] || []).filter((a) => D.trainee(a.tid));
    const name = (tid) => { const t = D.trainee(tid); return t ? t.n + (t.t ? " [" + t.t + "]" : "") : "#" + tid; };
    const aces = team.map((a) => ({ tid: +a.tid, style: a.style || "", name: name(a.tid) }));
    return `<section class="panel">${window.UmaCmLog.html({ cup: p.id, kind: p.kind, aces, races: (state.cmLog || {})[p.id] || [], open: logOpen[p.id], nameOf: name })}</section>`;
  }
  function cmLogClick(t) {
    const saveBtn = t.closest("[data-log-save]"), del = t.closest("[data-log-del]");
    if (!saveBtn && !del) return false;
    state.cmLog = state.cmLog || {};
    if (saveBtn) {
      const pid = saveBtn.dataset.logSave, p = presetById(pid), box = saveBtn.closest("details");
      const team = (((state.cmp || {}).byCup || {})[pid] || []);
      const places = team.map((a) => ({ tid: a.tid, style: a.style, place: (box.querySelector(`[data-log-place="${a.tid}"]`) || {}).value, reason: (box.querySelector(`[data-log-reason="${a.tid}"]`) || {}).value, contest: a.style === "Nige" ? contestShare(pid) : 0 }));
      const e = window.UmaCmLog.entry({ date: new Date().toISOString().slice(0, 10), field: p && p.kind === "loh" ? 12 : 9, places });
      if (!e) { flash("Pick at least one ace's place first."); return true; }
      (state.cmLog[pid] = state.cmLog[pid] || []).push(e);
      logOpen[pid] = true; commitLog(); flash("Race saved"); return true;
    }
    const [pid, i] = del.dataset.logDel.split(",");
    const list = state.cmLog[pid] || [];
    if (list[+i]) { list.splice(+i, 1); logOpen[pid] = true; commitLog(); flash("Race deleted"); }
    return true;
  }
  function commitLog() { save(); renderCM(); }
  document.addEventListener("toggle", (e) => { const d = e.target; if (d && d.dataset && d.dataset.logOpen) logOpen[d.dataset.logOpen] = d.open; }, true);
  // The head-to-head between the two best skill sets (race-skills.js duel), in plain words.
  function duelHTML(plan) {
    const d = plan && plan.duel, num = (x) => Number.isFinite(x) ? x.toFixed(2) : "–";
    if (!d) return "";
    const other = d.other.length ? d.other.map((id) => skillNameHTML(id)).join(", ") : "no purchases";
    const by = `${num(Math.abs(d.diff.mean))} ± ${num(d.diff.ci95)} L over ${d.diff.samples} paired races`;
    if (d.verdict === "tie") return `<p class="mini"><b>No clear difference</b> from the next-best set (${other}): ${by}. That shows no clear advantage either way, not that they're equal; ${d.rule === "prefer" ? "the set with more of game8's picks is kept, then the one that spends less SP" : "the set that spends less SP is kept"}. Pick by hints you already have if you prefer.</p>`;
    return `<p class="mini"><b>Checked head-to-head:</b> this set beats the next-best (${other}) by ${by}${d.verdict === "swapped" ? ". The search had ranked that one first, but it lost the head-to-head" : ""}.</p>`;
  }
  // Purchases dropped because they didn't clearly add lengths (race-skills.js pruning).
  function prunedHTML(plan) {
    const list = (plan && plan.pruned) || [], num = (x) => Number.isFinite(x) ? x.toFixed(2) : "–";
    return list.length ? ` <p class="mini"><b>Not bought, no clear gain:</b> ${list.map((x) => `${skillNameHTML(x.id)} (${x.diff.mean >= 0 ? "+" : ""}${num(x.diff.mean)} ± ${num(x.diff.ci95)} L for ${x.cost} SP)`).join(", ")}. ${list.length > 1 ? "Each one's" : "Its"} gain was within race-to-race noise, so the SP is kept.</p>` : "";
  }
  // Why a skill's simulated gain needs care, in a few words: debuffs (the simulator counts
  // slowing the copy she races), skills that depend on rivals, and skills that need others first.
  // conditions: the skill's activation conditions from the race catalog.
  function skillCaveat(id, conditions, pid, style) {
    const pos = positionNote(pid, id, style);
    if (window.UmaDebuffs && window.UmaDebuffs[id]) return "debuff: its gain is from slowing the copy she races; real rivals vary";
    if (pos) return pos;
    const c = conditions || "";
    if (/activate_count_start>=3/.test(c)) return "needs 3 opening activations";
    if (/activate_count/.test(c)) return "needs other skills to fire first";
    if (/order|overtake|blocked|bashin|distance_diff|compete|temptation|near_count/.test(c)) return "depends on the field (rivals' positions)";
    return "";
  }
  const skillConditions = (catalog, list) => Object.fromEntries(list.map((id) => [id, ((catalog.skills[id] || {}).alternatives || []).map((a) => (a.condition || "") + " " + (a.precondition || "")).join(" ")]));
  function raceSkillsHTML(c) {
    const q = raceState(c), j = deckJob("cm"), r = currentSkillPlan(c) ? j.raceResult : null, p = presetById(c.preset);
    const pairs = [["distanceAptitude", "Distance"], ["surfaceAptitude", "Surface"], ["strategyAptitude", "Style"]];
    const num = x => Number.isFinite(x) ? x.toFixed(2) : "–";
    const dependency = id => skillCaveat(id, r && r.conditions[id], c.preset, c.style);
    const table = (rows, ranking) => `<div class="table-wrap"><table><thead><tr><th>Skill</th><th>SP</th><th>Added L</th><th>L / 100 SP</th></tr></thead><tbody>${rows.map(x=>`<tr><th>${skillNameHTML(x.id)}${g8Pill(c.preset, c.style, x.id)}${dependency(x.id) ? `<div class="mini">${esc(dependency(x.id))}</div>` : ""}</th><td>${x.cost}${ranking && x.cost > r.plan.budget ? '<div class="mini">over budget</div>' : ""}</td><td>${num((ranking ? x.result : x.marginal).mean)}</td><td>${num(x.per100)}</td></tr>`).join("") || '<tr><td colspan="4">No additional purchase fits.</td></tr>'}</tbody></table></div>`;
    return `<details class="pred-help" id="cmRaceInputs"${q.open ? " open" : ""}><summary>Skills for this build: equipped skills, hints and SP</summary>
      <p class="mini">Compares affordable skill sets on this course. A new equipped skill changes the baseline and the remaining recommendations.</p>
      <div class="row-wrap"><label class="field"><span>Inputs</span><select data-race-field="mode"><option value="plan"${q.mode === "plan" ? " selected" : ""}>Plan from this deck</option><option value="finished"${q.mode === "finished" ? " selected" : ""}>Finished uma: enter stats and SP left</option></select></label><label class="field"><span>Unique level</span><select data-race-field="uniqueLv">${[1,2,3,4,5,6].map(n=>`<option value="${n}"${+(q.uniqueLv || 1)===n?" selected":""}>${n}</option>`).join("")}</select></label><label class="field"><span>Mood</span><select data-race-field="mood">${[["0","Normal (CM rounds)"],["1","Good"],["2","Great (finals)"]].map(([v,l])=>`<option value="${v}"${String(q.mood||"0")===v?" selected":""}>${l}</option>`).join("")}</select></label><label class="field"><span>SP left (finished uma)</span><input type="number" min="0" max="20000" data-race-field="sp" value="${esc(q.sp)}"></label></div>
      <div class="tg-row">${E.STATS.map(s=>`<label class="field"><span>${E.STAT_LABELS[s]}</span><input type="number" min="1" max="3000" data-race-stat="${s}" value="${q.stats[s] || ""}" placeholder="${((j.optResult || {}).est || {}).stats ? j.optResult.est.stats[E.STATS.indexOf(s)] : "Final stat"}"></label>`).join("")}</div>
      <div class="row-wrap">${pairs.map(([k,label])=>`<label class="field"><span>${label} aptitude</span><select data-race-apt="${k}"><option value="">Trainee's starting grade</option>${["G","F","E","D","C","B","A","S"].map(v=>`<option value="${v}"${q.apt[k]===v?" selected":""}>${v}</option>`).join("")}</select></label>`).join("")}</div>
      <div class="row-wrap"><label class="field grow"><span>Add a shop skill or planning target (including inherited uniques)</span><input id="cmRaceSkill" list="cmRaceSkillList" autocomplete="off" placeholder="Skill name"></label><button type="button" class="btn ghost small" id="cmRaceAdd">Add</button></div>
      <datalist id="cmRaceSkillList">${Object.keys(SV.skills).filter(id=>released(id,p)).map(id=>`<option value="${esc(skillInfo(id)[0])}"></option>`).join("")}</datalist>
      ${q.skills.map((x,i)=>`<div class="row-wrap"><b>${skillNameHTML(x.id)}</b><label class="chip-toggle"><input type="checkbox" data-race-equipped="${i}"${x.learned?" checked":""}> Equipped</label><label class="field"><span>Hint</span><select data-race-hint="${i}">${[0,1,2,3,4,5].map(n=>`<option value="${n}"${+x.hint===n?" selected":""}>Lv${n}</option>`).join("")}</select></label><button type="button" class="linkish" data-race-remove="${i}" aria-label="Remove ${esc(skillInfo(x.id)[0])}">✕</button></div>`).join("")}
      <p class="mini">Her own unique is equipped automatically. Planning targets need a card, trainee or parent source; equipped purchases are charged first. For a finished uma, enter SP remaining after those purchases. Edits update an existing comparison automatically.</p>
      <button type="button" class="btn ghost small" id="cmRaceRun">${j.raceRunning ? "Restart skill comparison" : "Compare skills"}</button>
      <div id="cmRaceOut">${j.raceRunning ? `<p class="mini" role="status">Comparing equipped builds… ${Math.round(j.raceProgress || 0)}%</p>` : j.raceError ? `<p class="mini warn">${esc(j.raceError)}</p>` : r ? `${r.staticReason ? `<p class="mini warn">Course-chart fallback: ${esc(r.staticReason)} This uses the chart and SP costs, without a new race simulation.</p>` : ""}<p><b>Suggested purchases</b>: ${r.plan.spent} / ${r.plan.budget} SP; ${r.plan.unspent} left. Mean +${num(r.plan.result.mean)} L against equipped skills. Lower 10% result: ${num(r.plan.result.low)} L.</p>${duelHTML(r.plan)}${prunedHTML(r.plan)}${g8PairHTML(p.id, r.plan.selected.map((x) => x.id).concat(q.skills.filter((x) => x.learned).map((x) => String(x.id))))}<p class="mini">${esc(r.source)}${r.baselineCost ? ` Equipped purchases use ${r.baselineCost} SP first.` : ""} Stats: ${r.stats.join(" / ")}; ${esc(r.apt.join(" / "))} distance / surface / style. ${["Normal","Good","Great"][Math.max(0,Math.min(2,+(q.mood||0)))]} mood.</p>
      ${!r.staticReason && (r.plan.result.fullSpurt||0)<0.95 ? `<p class="mini warn">With these skills she gets a full last spurt in only ${Math.round((r.plan.result.fullSpurt||0)*100)}% of simulated races (no stamina debuffers): raise stamina or add recovery skills.</p>` : ""}${sourceRowsHTML(r)}${table(r.plan.selected,false)}
      ${r.goals && r.goals.length ? `<p class="mini"><b>Parent targets:</b> ${[...new Set(r.goals.map(x=>ACCESS.white(x.id)).filter(Boolean))].map(id=>skillNameHTML(id)).join(", ")}. Targets to search or train for; these are not guaranteed purchases. <button type="button" class="linkish" data-goto-tab="parents">Plan their sources in Parents →</button></p>` : ""}
      <details><summary>Next skills from the equipped baseline</summary><p class="mini">Each is tested against equipped skills alone. The purchase list above tests combinations. Added L for its rows measures removing that purchase from the final set, so those rows do not add up.</p>${table(r.plan.ranking,true)}</details>
      ${(r.plan.offPosition||[]).length ? `<p class="mini">Left out because they need a rival ahead and she leads alone (change <b>Front Runners in this cup</b> above if she fights for the lead): ${r.plan.offPosition.map(id=>skillNameHTML(id)).join(", ")}.</p>` : ""}${(r.plan.scaled||[]).length ? `<p class="mini">Counted at ${Math.round(contestShare(p.id)*100)}% of their simulated gain (they need a rival ahead): ${r.plan.scaled.map(id=>skillNameHTML(id)).join(", ")}.</p>` : ""}${r.plan.excluded.length ? `<p class="mini warn">Race or purchase effects unavailable; excluded: ${r.plan.excluded.map(id=>skillNameHTML(id)).join(", ")}.</p>` : ""}${r.plan.failedSets ? `<p class="mini warn">${r.plan.failedSets} skill sets could not be simulated and were excluded.</p>` : ""}${r.plan.unmetMust.length ? `<p class="mini warn">Must-haves not purchased: ${r.plan.unmetMust.map(id=>skillNameHTML(id)).join(", ")}.</p>` : ""}
      <details><summary>How these comparisons work</summary><p class="mini">${r.staticReason ? "Existing course-chart gains and legal SP costs are used. This mode does not measure new skill interactions or full-spurt frequency." : `${r.plan.method === "every full affordable combination" ? `Every full affordable combination raced (${r.plan.evaluations} sets), 24 paired races each.` : `${r.plan.evaluations} sets checked in a bounded search, 24 paired races each.`} Finalists and purchase contributions use another seed and 96 races. Full spurt in ${Math.round((r.plan.result.fullSpurt||0)*100)}% of validation races${(r.plan.result.fullSpurt||0)<0.95?' <span class="warn">(under 95%: she needs more stamina or recovery skills)</span>':""}. Wit checks are on. Positions, overtaking and opponents remain simplified.`} Mean gain ${num(r.plan.result.mean)} L${r.plan.result.ci95?` (± ${num(r.plan.result.ci95)} L, 95% interval from race-to-race noise; SD ${num(r.plan.result.sd)} L)`:""}; 10th percentile ${num(r.plan.result.low)} L. These are estimates, not CM win rates or LoH points.</p><p class="mini">Planning includes only sourced skills. Card offers and inheritance are sampled, with unknown spark hint levels conservatively taken as Lv1. Equipped planning targets condition on getting those sourced skills, and their SP is charged first. User-entered shop skills are accepted as observed only in finished-uma mode. Parent targets come from a separate conditional purchase plan; they do not grant skills to the ace. Predicted stats exclude inheritance unless entered. Fast Learner and scenario-specific price discounts are not modeled. The deck/parent search is bounded, not proof of a global optimum.</p></details>` : ""}</div>
    </details>`;
  }
  async function runRaceSkills(refineDeck = false, fromParents = false) {
    const host = "cm", c = cm(host), j = deckJob(host), p = presetById(c.preset), q = JSON.parse(JSON.stringify(raceState(c)));
    if (!refineDeck && !fromParents) raceState(c).open = true;
    if (j.raceWorker) j.raceWorker.close();
    const token = {}; j.raceToken = token; j.raceTouched = true; j.raceRunning = true; j.raceError = null; j.raceProgress = 0;
    const same = () => j.raceToken === token && cm("cm") === c;
    let initialKey = optKey(host), initialSourceKey=skillPlanKey(c);
    renderCM();
    let worker;
    try {
      const RS = window.UmaRaceSkills, eng = RS.engine(p, SV.meta.sims), catalog = await RS.load(eng.catalog);
      const unsupported = RS.supported(p, Object.assign({}, simVariant(p), { inBrowser: !!eng.sim }), catalog);
      await ensureSkills([p.id]);
      if(!same())return;initialKey=optKey(host);initialSourceKey=skillPlanKey(c);
      worker = unsupported ? null : RS.runner(eng.sim); j.raceWorker = worker;
      const t = D.trainee(deckTrainee(host)), idx = { Sprint:2,Mile:3,Medium:4,Long:5 }[p.course.dist], si = STYLES.findIndex(x=>x[0]===c.style);
      const apt = [q.apt.distanceAptitude || t.apt[idx],q.apt.surfaceAptitude || t.apt[p.course.surface==="Dirt"?1:0],q.apt.strategyAptitude || t.apt[6+si]];
      const ownUnique=(t.us||[]).map(String);
      let learned=ownUnique.slice();
      const baseValues = skillMap(p.id,c.style).map;
      // The suggested deck, Euophrys' pick and, when the deck search called it close, its runner-up:
      // the race check decides between them with her real skill purchases.
      const candidates = refineDeck && q.mode === "plan" && j.optResult && j.optResult.fit ? [{cards:j.optResult.cards,est:j.optResult.est}, {cards:j.optResult.fit.startCards,est:j.optResult.fit.before}].concat(j.optResult.fit.close ? [{cards:j.optResult.fit.close.cards,est:j.optResult.fit.close.est}] : []) : [{cards:c.cards || [],est:j.optResult && j.optResult.est}];
      let chosen = null, chosenScore = -Infinity, compared = 0;
      for (let ci=0;ci<candidates.length;ci++) {
        const candidate = candidates[ci], est = candidate.est;
        if (!same()) return;
        if (ci && candidate.cards.map(x=>x.id+":"+x.lb+":"+!!x.borrowed).sort().join() === candidates[0].cards.map(x=>x.id+":"+x.lb+":"+!!x.borrowed).sort().join()) continue;
        if (ci && est.ssShare != null && est.ssShare < candidates[0].est.ssShare) continue;
        const stats = E.STATS.map((s,i)=>+(q.stats[s] || (est && est.stats[i]) || 0));
        if (q.mode === "finished" && E.STATS.some(s=>!(+q.stats[s]>0)) || stats.some(x=>!Number.isFinite(x)||x<=0)) throw new Error("Enter all five final stats, or build a deck first for its prediction.");
        const access=skillSourcesFor(c,candidate.cards,t,q.skills,q.mode);
        learned=[...new Set(ownUnique.concat(q.skills.filter(x=>x.learned && access.byId[x.id]).map(x=>String(x.id))))];
        let hints = {}, available = [], source, sp, baselineCost = 0;
        if(q.mode === "finished") { sp=+q.sp; if(q.sp==="" || !Number.isFinite(sp) || sp<0 || sp>20000)throw new Error("Enter SP left, from 0 to 20,000.");source="Your entered stats, skills and remaining SP."; }
        else {
          if(!est)throw new Error("Find her deck first, or choose finished-uma inputs.");
          const example=est.skillBudget && est.skillBudget.example;
          if(example) { hints=Object.assign({},example.hintLevels);sp=example.budget;available=example.offered.concat(Object.keys(hints),(t.is||[]).map(String),(t.as||[]).map(String));source="Projected offers and SP from career "+example.career+" of the deck prediction; not guaranteed purchases."; }
          else {
            sp=est.sp;available=(t.is||[]).concat(t.as||[]).map(String);let seed=872341;
            const offers=T.deckOffers(euOpts(c,p),candidate.cards);
            Object.keys(offers).sort().forEach(id=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;if((seed>>>0)/4294967296<offers[id]){available.push(id);hints[id]=1;}});
            source="One sample of the deck's estimated skill offers; predicted mean SP. Hint levels without career records are assumed Lv1.";
          }
        }
        if(q.mode === "plan") {
          available=available.filter(id=>access.byId[id]);
          const inherited=ACCESS.sample(access,517931,["parent"]);
          available.push(...inherited.available);Object.entries(inherited.hints).forEach(([id,lv])=>hints[id]=Math.min(5,(hints[id]||0)+lv));
        }
        q.skills.forEach(x=>{if(q.mode==="finished" || access.byId[x.id] && (available.includes(String(x.id)) || x.learned)){hints[x.id]=+x.hint;available.push(String(x.id));}});
        if(q.mode === "plan") {
          ({available,hints}=ACCESS.restrict(access,available,hints));
          const fixed=q.skills.filter(x=>x.learned && access.byId[x.id]).map(x=>String(x.id));
          const charged=window.UmaSkillBudget.create({available:fixed,must:fixed,skills:Object.fromEntries(fixed.map(id=>[id,0]))}).solve(hints,20000);
          if(charged.unmetMust.length)throw new Error("An equipped purchase lacks cost data.");
          baselineCost=charged.spent;sp-=baselineCost;if(sp<0)throw new Error("Equipped purchases exceed the projected SP budget.");
        }
        const input={outfitId:String(t.id),starCount:t.r,uniqueLv:+(q.uniqueLv || 1),mood:Math.max(-2,Math.min(2,+(q.mood||0))),strategy:c.style,speed:stats[0],stamina:stats[1],power:stats[2],guts:stats[3],wisdom:stats[4],distanceAptitude:apt[0],surfaceAptitude:apt[1],strategyAptitude:apt[2],aptitudes:t.apt.slice(2,6).concat(t.apt.slice(0,2),t.apt.slice(6,10))};
        const compare = async(before,after,n,seed)=>{
          if(!same())throw new Error("Comparison cancelled.");
          const key=JSON.stringify([p.id,input,before,after,n,seed]);
          if(unsupported) {
            const value=skills=>{const by={};skills.forEach(id=>{const f=window.UmaSkillBudget.DATA.skills[id] && window.UmaSkillBudget.DATA.skills[id][0] || id;by[f]=Math.max(by[f]||0,baseValues[id]||0);});return Object.values(by).reduce((a,b)=>a+b,0);};
            return RS.summary([value(after)-value(before)]);
          }
          if(!raceMemo.has(key)) {const answer=await worker.run(RS.request(p,input,before,after,catalog,n,seed));raceMemo.set(key,Object.assign(RS.summary(answer.results.results),{fullSpurt:answer.results.runData.nspurt[1]/n}));if(raceMemo.size>2500)raceMemo.delete(raceMemo.keys().next().value);}
          return raceMemo.get(key);
        };
        const plan=await RS.optimize({catalog,allowChartOnly:!!unsupported,available,learned,hints,sp,values:baseValues,must:c.must,prefer:Object.keys(g8Picks(p.id,c.style)),compare,scale:raceScale(p,c.style,available),maxEvaluations:64,progress:f=>{if(!same())return;j.raceProgress=(ci+f)/candidates.length*100;const box=deckElement(host,"#cmRaceOut");if(box)box.innerHTML=`<p class="mini" role="status">Comparing equipped builds… ${Math.round(j.raceProgress)}%</p>`;}});
        if(q.mode === "plan" && plan.selected.some(row=>!access.byId[row.id]))throw new Error("A purchase lacks a verified skill source. Compare again after checking her deck and family.");
        // A separate, explicitly conditional purchase plan asks which white hints would be
        // worth seeking. These never enter the actual purchase list without a source.
        const rel=aceSkillsFor({preset:p,style:c.style}), potential=[...new Set(Object.keys(rel?rel.targets:{}).map(id=>ACCESS.white(id)).filter(Boolean))]
          .filter(id=>released(id,p) && (unsupported || catalog.skills[id])).sort((a,b)=>(baseValues[b]||0)-(baseValues[a]||0)).slice(0,12);
        q.skills.forEach(x=>{const id=ACCESS.white(x.id);if(id && String(x.id)===id && !potential.includes(id))potential.push(id);});
        const goalHints=Object.assign({},hints);potential.forEach(id=>goalHints[id]=Math.max(1,goalHints[id]||0));
        const goalPlan=q.mode==="plan"?await RS.optimize({catalog,allowChartOnly:!!unsupported,available:[...new Set(available.concat(potential))],learned,hints:goalHints,sp,values:baseValues,must:c.must,compare,scale:raceScale(p,c.style,[...new Set(available.concat(potential))]),maxEvaluations:24}):plan;
        const parentValues={};goalPlan.selected.forEach(row=>{
          const id=ACCESS.white(row.id);if(!id)return;
          const own=goalPlan.ranking.find(x=>x.id===id), gain=own?own.result.mean:baseValues[id]||0;
          parentValues[id]=Math.max(0,gain,Math.min(window.UmaFamily.HINT_L,Math.max(0,row.marginal.mean)));
        });
        const baselineGain=learned.length>ownUnique.length?(await compare(ownUnique,learned,96,314159)).mean:0;
        compared++;
        const score=(est && est.value || 0) - (est && est.skill || est && est.skillValue || 0) * +c.skillW + (plan.result.mean+baselineGain)*60*+c.skillW;
        if(!chosen || score>chosenScore+1e-6) {chosenScore=score;chosen={plan,goalPlan,access,requested:q.skills,goals:goalPlan.selected.filter(x=>potential.includes(ACCESS.white(x.id))),parentValues,staticReason:unsupported,source,stats,apt,baselineCost,candidate,conditions:skillConditions(catalog,plan.ranking.map(x=>x.id))};}
      }
      if(same() && initialKey===optKey(host) && initialSourceKey===skillPlanKey(c)) {
        if(refineDeck && chosen && j.optResult && chosen.candidate.cards !== j.optResult.cards && candidates.length>1) {
          const r=j.optResult,setup=planSetup(p,c.style,t.id,null,{...c,locked:c.locked});
          const description=T.describeDeck(setup.opts,chosen.candidate.cards,setup.pool,setup.bp);
          Object.assign(r,description,{est:chosen.candidate.est});if(r.fit){r.fit.cards=description.cards;r.fit.after=chosen.candidate.est;r.fit.swaps=[];}
          c.cards=description.cards.map(x=>({id:x.id,lb:x.lb,borrowed:!!x.borrowed,locked:c.locked.includes(x.id)}));
          const g=raceGaps(r,c);c.predicted={stats:g.stats,target:g.target,sp:r.est.sp};save();
        }
        if(refineDeck && j.optResult)j.optResult.skillSetCheck={decks:compared};
        j.raceResult=chosen;
        const coverage=Object.fromEntries(Object.entries(chosen.access.byId).map(([id,row])=>[id,row.deck]));
        c.skillPlan={key:skillPlanKey(c),mode:q.mode,parentValues:chosen.parentValues,deckCoverage:coverage,selected:chosen.plan.selected.map(x=>x.id),goals:chosen.goals.map(x=>x.id),raceL:Object.fromEntries(chosen.goalPlan.ranking.map(x=>[x.id,x.result.mean])),model:unsupported?"source-checked course chart":"source-checked paired races",missing:chosen.access.missing};save();
      }
    } catch(error) {if(same())j.raceError=error.message || String(error);}
    finally {if(worker)worker.close();if(j.raceToken===token){j.raceRunning=false;j.raceWorker=null;if(cm("cm")===c)renderCM();}}
    return currentSkillPlan(c);
  }
  function raceEdited() {const j=deckJob("cm");raceState(cm("cm")).open=true;save();if(j.raceTouched)runRaceSkills();else renderCM();}
  document.addEventListener("toggle",e=>{if(e.target.id==="cmRaceInputs" && e.target.isConnected){raceState(cm("cm")).open=e.target.open;save();}},true);
  document.addEventListener("change",e=>{
    const el=e.target;if(!el.matches("[data-race-field],[data-race-stat],[data-race-apt],[data-race-equipped],[data-race-hint]"))return;
    const q=raceState(cm("cm"));
    if(el.dataset.raceField)q[el.dataset.raceField]=el.value;
    if(el.dataset.raceStat)q.stats[el.dataset.raceStat]=el.value;
    if(el.dataset.raceApt)q.apt[el.dataset.raceApt]=el.value;
    if(el.dataset.raceEquipped!=null)q.skills[+el.dataset.raceEquipped].learned=el.checked;
    if(el.dataset.raceHint!=null)q.skills[+el.dataset.raceHint].hint=+el.value;
    raceEdited();
  });
  document.addEventListener("click",e=>{
    if(e.target.closest("#cmRaceShow")){const box=document.getElementById("cmRaceInputs");box.open=true;box.scrollIntoView({block:"start"});return;}
    if(e.target.closest("#cmRaceRun")){runRaceSkills();return;}
    const remove=e.target.closest("[data-race-remove]");
    if(remove){raceState(cm("cm")).skills.splice(+remove.dataset.raceRemove,1);raceEdited();return;}
    if(e.target.closest("#cmRaceAdd")){
      const c=cm("cm"),q=raceState(c),text=document.getElementById("cmRaceSkill").value.trim().toLowerCase();
      const id=Object.keys(SV.skills).find(id=>skillInfo(id)[0].toLowerCase()===text);
      if(!id || !released(id,presetById(c.preset))){flash("Choose a skill available by this cup.");return;}
      if(!q.skills.some(x=>x.id===id))q.skills.push({id,hint:0,learned:false});raceEdited();
    }
  });

  function cmInput(el) {
    const host = deckHost(el), c = cm(host);
    const k = el.dataset.cm;
    const v = el.type === "checkbox" ? el.checked : el.value;
    c[k] = v;
    save();
    if (k === "sq") {
      skillLimit = 60;
      const box = deckElement(host, "#cmSkillTable");
      const tmp = document.createElement("div");
      tmp.innerHTML = cmSkills(presetById(c.preset), c);
      const fresh = tmp.querySelector("#cmSkillTable");
      if (box && fresh) box.innerHTML = fresh.innerHTML;
      return;
    }
    if (k === "preset") { state.cmp.cup = c.preset; syncWorkflow(); skillLimit = 60; }
    if (k === "reachSS") W.setParentRank(state, v);
    renderCM();
  }

  function cmClick(e) {
    const t = e.target, host = deckHost(t);
    const j = deckJob(host);
    const q = (selector) => deckElement(host, selector);
    const hit = (selector) => t.closest(deckSelector(host, selector));
    const c = deckTab() ? cm(host) : null;
    if (!c) return false;
    const style = hit("[data-cm-style]");
    if (style) {
      c.style = style.dataset.cmStyle;
      const ace = host === "cm" ? W.current(state).ace : null;
      if (ace) ace.style = c.style;
      skillLimit = 60; save(); renderCM(); return true;
    }
    const build = hit("[data-cm-build]");
    if (build) { state.build = build.dataset.cmBuild; commit(true); flash("Turn coach build set to " + E.BUILDS[state.build].label); return true; }
    const goalBtn = hit("[data-cm-goal]");
    if (goalBtn) { c.goal = goalBtn.dataset.cmGoal; save(); renderCM(); return true; }
    if (hit("#compClear")) { c.comp = {}; save(); renderCM(); return true; }
    if (hit("#cmRun")) {
      const fixed = Object.values(c.comp).reduce((a, b) => a + b, 0);
      if (fixed > 6) { flash("The deck makeup adds up to " + fixed + " cards. A deck has 6."); return true; }
      runOptimizer(host);
      return true;
    }
    if (hit("#cmWish, #cmSensitivity")) {
      const run = hit("#cmWish") ? runWishlist : runSensitivity;
      run(host);
      return true;
    }

    if (hit("#cmLockAdd")) {
      const card = cardByLabel.get(q("#cmLock").value.trim());
      if (!card) { flash("Pick a card from the list first."); return true; }
      if (!cardAvailable(card, c)) { flash("That card isn't expected on Global by this cup."); return true; }
      if (!T.entry(card.id, owned[card.id] != null ? +owned[card.id] : 4)) { flash("That card has no scoring data yet."); return true; }
      if (c.locked.indexOf(card.id) === -1) c.locked.push(card.id);
      if (host === "cm") (c.cards || []).filter(x => x.id === card.id).forEach(x => { x.locked = true; });
      if (c.ownedOnly && owned[card.id] == null) flash(card.n + " isn't marked as owned, so it can only come in as the borrowed card.");
      save();
      renderCM();
      return true;
    }
    if (hit("#cmTgCoach")) { c.targets = Object.assign({}, state.targets); save(); renderCM(); return true; }
    if (hit("#cmTgClear")) { c.targets = {}; save(); renderCM(); return true; }
    if (hit("#cmTgSpark")) { c.targets = { speed: 1100, stamina: 1100, power: 1100, guts: 1100, wit: 1100 }; save(); renderCM(); return true; }
    if (hit("#cmMustAdd")) {
      const id = skillIdByName(q("#cmMust").value, c);
      if (!id) { flash("Pick a skill from the list first. It lists the skills support cards can give."); return true; }
      if (c.must.indexOf(id) === -1) c.must.push(id);
      save();
      renderCM();
      return true;
    }
    const md = hit("[data-must-del]");
    if (md) { c.must = c.must.filter((id) => id !== md.dataset.mustDel); save(); renderCM(); return true; }
    if (hit("#g8Save")) {
      const p = presetById(c.preset);
      if (!state.game8) state.game8 = {};
      const e = G8.entry(q("#g8Must").value, q("#g8Rec").value, g8Names(p), TODAY);
      if (!e.must.length && !e.rec.length && !e.missed.length) delete state.game8[p.id]; else state.game8[p.id] = e;
      g8Sync(c); save(); renderCM();
      flash(`game8's picks saved for ${presetLabel(p)}: ${e.must.length} must-have, ${e.rec.length} recommended${e.missed.length ? `, ${e.missed.length} not matched` : ""}.`);
      return true;
    }
    if (hit("#g8Clear")) { if (state.game8) delete state.game8[c.preset]; g8Sync(c); save(); renderCM(); return true; }
    const mt = hit("[data-must]");
    if (mt) {
      const id = String(mt.dataset.must);
      c.must = c.must.indexOf(id) === -1 ? c.must.concat([id]) : c.must.filter((x) => x !== id);
      save();
      renderCM();
      return true;
    }
    const un = hit("[data-cm-unlock]");
    if (un) { c.locked = c.locked.filter((id) => id !== +un.dataset.cmUnlock); if (host === "cm") (c.cards || []).filter(x => x.id === +un.dataset.cmUnlock).forEach(x => { x.locked = false; }); save(); renderCM(); return true; }
    if (hit("[data-use-opt]") && j.optResult) {
      state.deck.trainee = deckTrainee(host);
      state.deck.slots = j.optResult.cards.map((x) => ({ id: x.id, lb: x.lb, bond: null }));
      state.facilities.forEach((f) => { f.members = []; f.hints = []; });
      commit(true);
      flash("Deck set in Trainee and deck" + (j.optResult.cards.some((x) => x.borrowed) ? ". Remember to borrow the marked card." : ""));
      return true;
    }
    if (hit("[data-cm-more]")) { skillLimit += 60; renderCM(); return true; }
    if (hit("#cmPasteBtn")) {
      const r = parseUmalator(q("#cmPaste").value);
      const n = Object.keys(r.values).length;
      if (!n) { flash("Couldn't find any skills with values like “1.23 L” in that text."); return true; }
      pasted[c.preset] = pasted[c.preset] || {};
      pasted[c.preset][c.style] = r.values;
      savePasted();
      flash("Read " + n + " skills" + (r.unknown ? ", " + r.unknown + " names not recognized" : ""));
      renderCM();
      return true;
    }
    if (hit("#cmPasteReset")) {
      if (pasted[c.preset]) delete pasted[c.preset][c.style];
      savePasted();
      renderCM();
      return true;
    }
    return false;
  }

  // ---- Tier list: Euophrys' ranking plus skills ----
  const TIER_NAMES = ["S", "A", "B", "C", "D", "E", "F"];
  const TIER_TYPES = [["speed", "Speed"], ["stamina", "Stamina"], ["power", "Power"], ["guts", "Guts"], ["wit", "Wit"], ["friend", "Friend"], ["group", "Group"]];
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
    const types = [t.type];
    let cards = D.DATA.supports.filter((c) => !D.isHidden(c.id) && (!t.global || D.onGlobal(c, TODAY) || owned[c.id] != null) && types.indexOf(c.ty) !== -1 && c.r >= +t.rarity);
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

  function traineePickerHTML(p, styleAttr, host = state.tab === "tiers" ? "tiers" : "cm") {
    const tr = deckTrainee(host) ? D.trainee(deckTrainee(host)) : null;
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
        ${host !== "parents" && cm(host).style !== best[0] ? `<button type="button" class="btn ghost small" ${styleAttr}="${best[0]}">Use her best style: ${esc(best[1])}</button>` : ""}
        ${weak ? `<span class="mini warn">Her aptitude for this race is below A, so she'll race at a penalty.</span>` : ""}`;
    }
    // The Parents tab picks her once, in ① Who.
    if (host === "parents") return `<details class="pred-help"><summary>Trainee: ${tr ? esc(label) : "choose her in ①"} · growth and skills</summary>${info}</details>`;
    // CM & decks builds for the ace picked in the team above.
    if (host === "cm") return `<div class="row-wrap tier-trainee"><span><b>Deck for ${tr ? esc(label) : "your ace"}</b></span>${info}</div>`;
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
    const types = [t.type];
    const nType = t.deck.filter((x) => types.indexOf(D.card(x.id).ty) !== -1).length;
    const ord = ["1st", "2nd", "3rd", "4th", "5th", "6th"][Math.min(5, nType)];
    const typeName = TIER_TYPES.find((x) => x[0] === t.type)[1];
    let tiersHTML = '<div class="empty">Loading the tier list data…</div>';
    if (ready) {
      const cands = tierCandidates(t);
      const opts = euOpts(c, p, tierTrainee());
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
    if (k === "preset") { state.cmp.cup = v; syncWorkflow(); }
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
    if (st) { const a = W.current(state).ace; if (a) a.style = st.dataset.tierStyle; cm().style = st.dataset.tierStyle; save(); renderTiers(); return true; }
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

  // ---- Skill optimizer: a finished uma's skill shop for one CM or League of Heroes cup ----
  // Inputs (skill-opt.js clean/encode), a live course-chart plan, and the paired race check
  // (race-skills.js optimize) on the cup's own simulator (Global's, or its JP-dated one).
  const SO = window.UmaSkillOpt;
  const soJob = { running: false, progress: 0, error: null, result: null, key: null, worker: null, token: null };
  const soNames = {};
  function soBuild() {
    if (!state.skillOpt || typeof state.skillOpt !== "object") state.skillOpt = {};
    const b = Object.assign(SO.clean(state.skillOpt), { pasteOpen: !!state.skillOpt.pasteOpen });
    if (!presetById(b.cup)) b.cup = defaultPreset().id;
    state.skillOpt = b;
    return b;
  }
  const soTrainee = (b) => (b.tid ? D.trainee(+b.tid) : null);
  // The cup's skill names, out on Global by then (datalist and pasted lists).
  function soCupNames(p) {
    if (!soNames[p.id]) soNames[p.id] = Object.keys(SV.skills).filter((id) => released(id, p)).map((id) => [id, skillInfo(id)[0]]).sort((a, b) => a[1].localeCompare(b[1]));
    return soNames[p.id];
  }
  // Her grades for this cup: entered, else the trainee's, else A.
  function soApt(b, p) {
    const t = soTrainee(b), si = STYLES.findIndex((x) => x[0] === b.style), di = { Sprint: 2, Mile: 3, Medium: 4, Long: 5 }[p.course.dist];
    return [b.apt.distanceAptitude || (t ? t.apt[di] : "A"), b.apt.surfaceAptitude || (t ? t.apt[p.course.surface === "Dirt" ? 1 : 0] : "A"), b.apt.strategyAptitude || (t ? t.apt[6 + si] : "A")];
  }
  function soAdd(b, id, hint, have) {
    const ids = SO.withLower(id, window.UmaSkillBudget.create());
    ids.forEach((x, i) => {
      const row = b.skills.find((r) => r.id === x), last = i === ids.length - 1;
      if (!row) b.skills.push({ id: x, hint: last ? hint || 0 : 0, have: !!have && last });
      else if (last) { if (hint != null) row.hint = hint; if (have) row.have = true; }
    });
  }
  function soCupOptions(cur) {
    const P2 = P.list, groups = [["Now and next on Global", P2.filter((x) => x.kind === "cm" && x.global.end >= TODAY && !x.global.est)], ["Later Champions Meetings (Global dates estimated)", P2.filter((x) => x.kind === "cm" && x.global.est)], ["League of Heroes", P2.filter((x) => x.kind === "loh")], ["Past Global Champions Meetings", P2.filter((x) => x.kind === "cm" && x.global.end < TODAY).reverse()]];
    return groups.filter((g) => g[1].length).map(([label, list]) => `<optgroup label="${esc(label)}">${list.map((x) => `<option value="${x.id}"${x.id === cur ? " selected" : ""}>${esc(presetLabel(x))}</option>`).join("")}</optgroup>`).join("");
  }
  // Which simulator the race check uses for this cup, in a few words.
  function soEngineNote(p) {
    const RS = window.UmaRaceSkills, eng = RS.engine(p, SV.meta.sims), v = simVariant(p);
    if (!eng.sim) return "Race check: Global's Umalator, skills as Global has them now (no stamina showdown, as on Global).";
    const showdown = v.syoubu ? (p.course.distance >= 2101 ? `stamina showdown on${v.syoubuLong ? " at JP's long-race strength (Oct 2024)" : ""}: stamina above 1200 speeds up her last spurt` : "stamina showdown on, but it only acts from 2101 m, so not on this course") : "no stamina showdown (JP added it after this cup's JP date)";
    return `Race check: the JP Umalator as JP's game was on this cup's JP date (${fmtDate(p.jp.start)}): skills at their versions then, ${showdown}.`;
  }
  const soNum = (x) => (Number.isFinite(x) ? x.toFixed(2) : "–");
  // ---- "For winning": the full-field simulator (GlobalSim, field-race.js) ----
  const FR = window.UmaFieldRace;
  let gsLoad = null;
  function globalSim() {
    return gsLoad || (gsLoad = (async () => {
      const base = new URL("vendor/globalsim/", location.href);
      const G = await import(new URL("index.js?v=" + ASSET_V, base).href);
      G.setGeometrySource(new URL("course_geometry/", base).href);
      const [table, settings] = await Promise.all(["skill-data.json", "settings.json"].map((f) => fetch(new URL(f + "?v=" + ASSET_V, base)).then((r) => { if (!r.ok) throw new Error("The full-field simulator did not load."); return r.json(); })));
      return { G, table: table.skills, legacy: new Set(table.legacy), settings };
    })().catch((e) => { gsLoad = null; throw e; }));
  }
  // Why the full-field check can't run this cup, or "".
  function fieldUnsupported(p) {
    return ["11703", "11709"].includes(String(p.course.id)) ? "The full-field simulator has no track data for Del Mar yet." : "";
  }
  const soMix = (b, p) => b.mix || FR.MIX[p.kind === "loh" ? "loh" : "cm"];
  const RP = window.UmaRivalPools;
  const topField = (b) => /^top-/.test(b.strength) && !!RP;
  const poolName = (p) => (p.course.surface === "Dirt" ? "Dirt" : p.course.dist);
  const soFieldSize = (p) => (p.kind === "loh" ? 12 : 9);
  // A rival's skills: the best chart picks for her style that this cup has (no debuffs), at hint
  // Lv2, within about the SP a finished uma has.
  function rivalSkills(p, style, sp, table) {
    const vals = skillMap(p.id, style).map;
    const ids = Object.keys(vals).filter((id) => vals[id] > 0 && released(id, p) && table[id] && !(window.UmaDebuffs && window.UmaDebuffs[id])).sort((a, c) => vals[c] - vals[a]).slice(0, 16);
    return SO.quickPlan({ skills: ids.map((id) => ({ id, hint: 2 })), values: vals, sp, fast: false }).selected.map((x) => x.id);
  }
  const canFire = (conds, p, style) => FR.canFire(conds, p, style);
  // A rival who runs short of stamina buys heals first, as a player would: the biggest heals
  // that can fire for her style on this course (up to about 45% of her SP), then chart picks.
  function rivalHealSkills(p, style, sp, table) {
    const K = (window.UmaSkillKinds || {}).skills || {}, heal = (id) => Math.max(0, ...((table[id] || {}).alternatives || []).flatMap((a) => a.effects.filter((e) => e.type === 9).map((e) => e.modifier)));
    const ids = Object.keys(K).filter((id) => K[id][0] === "recovery" && released(id, p) && table[id] && canFire(K[id][1], p, style) && !/activate_count|is_surrounded|blocked|change_order|is_overtake/.test(K[id][1].join("@")))
      .sort((a, c) => heal(c) - heal(a));
    const picked = SO.quickPlan({ skills: ids.slice(0, 8).map((id) => ({ id, hint: 2 })), values: Object.fromEntries(ids.map((id) => [id, heal(id) / 100])), sp: Math.round(sp * 0.45), fast: false }).selected.map((x) => x.id);
    const fams = new Set(picked.map((id) => (window.UmaSkillBudget.DATA.skills[id] || [id])[0]));
    const vals = skillMap(p.id, style).map;
    const rest = Object.keys(vals).filter((id) => vals[id] > 0 && released(id, p) && table[id] && !(window.UmaDebuffs && window.UmaDebuffs[id]) && !fams.has((window.UmaSkillBudget.DATA.skills[id] || [id])[0])).sort((a, c) => vals[c] - vals[a]).slice(0, 14);
    const spent = picked.reduce((n, id) => n + (SO.price(id, 2, false) || 0), 0);
    return picked.concat(SO.quickPlan({ skills: rest.map((id) => ({ id, hint: 2 })), values: vals, sp: sp - spent, fast: false }).selected.map((x) => x.id));
  }
  // A saved build as a teammate: her stats, style and unique, the skills she has and her quick plan.
  function teammate(code, p) {
    const t2 = SO.decode(code);
    if (!t2 || SO.STATS.some((s) => !(+t2.stats[s] > 0))) return null;
    const tr = soTrainee(t2), vals = skillMap(p.id, t2.style).map;
    const have = t2.skills.filter((x) => x.have).map((x) => x.id);
    const buy = t2.sp === "" ? [] : SO.quickPlan({ skills: t2.skills, values: vals, sp: +t2.sp, fast: t2.fast }).selected.map((x) => x.id);
    return { style: t2.style, stats: Object.fromEntries(SO.STATS.map((s) => [s, +t2.stats[s]])), apt: soApt(t2, p), mood: +t2.mood,
      unique: tr && tr.us && tr.us[0] ? { id: String(tr.us[0]), level: +t2.uniqueLv } : null, skills: have.concat(buy) };
  }
  function fieldResultHTML(r, b, p) {
    const pct = (x) => (x * 100).toFixed(1) + "%", n2 = (x) => x.toFixed(2), w = r.win, res = r.result, base = r.baseline;
    const goalLine = r.goal === "place"
      ? `Average place <b>${n2(res.place.mean)}</b> (± ${n2(res.place.ci95)}) of ${r.field}, buying nothing ${n2(base.place.mean)}. Top 3 in ${pct(res.top3.mean)}, wins ${pct(res.win.mean)}.`
      : r.goal === "team" ? `Her team wins <b>${pct(res.team.mean)}</b> (± ${pct(res.team.ci95)}) of races (${pct(base.team.mean)} if she buys nothing); she wins ${pct(res.win.mean)} herself. Average place ${n2(res.place.mean)}.`
      : `She wins <b>${pct(res.win.mean)}</b> (± ${pct(res.win.ci95)}) of races against this field, ${pct(base.win.mean)} if she buys nothing. Average place ${n2(res.place.mean)} of ${r.field}; top 3 in ${pct(res.top3.mean)}.`;
    const sameAsPick = r.duel && r.duel.other.slice().sort().join() === r.selected.map((x) => x.id).sort().join();
    const duel = r.duel && !sameAsPick ? `<p class="mini">${r.duel.verdict === "tie" ? "<b>No clear difference</b> from" : "<b>Beat</b>"} the next-best set (${r.duel.other.length ? r.duel.other.map((id) => skillNameHTML(id)).join(", ") : "no purchases"}) on fresh races: ${r.goal === "place" ? n2(r.duel.diff.mean) + " places" : pct(r.duel.diff.mean)} ± ${r.goal === "place" ? n2(r.duel.diff.ci95) : pct(r.duel.diff.ci95)}${r.duel.verdict === "tie" ? "; the one with the better estimate is kept (unspent SP is worth nothing to a finished uma)" : ""}.</p>` : "";
    const pruned = r.pruned.length ? `<p class="mini"><b>Not bought, no gain shown:</b> ${r.pruned.map((x) => `${skillNameHTML(x.id)} (${x.cost} SP)`).join(", ")}: without it she won and placed at least as well.</p>` : "";
    const rows = r.screened.map((x) => `<tr><th>${x.ids.length ? x.ids.map((id) => esc(skillInfo(id)[0])).join(", ") : "nothing"}</th><td class="num">${x.spent}</td><td class="num">${pct(x.win)}</td><td class="num">${n2(x.place)}</td></tr>`).join("");
    const mix = Object.entries(r.mix).filter(([, n]) => n).map(([k, n]) => `${n} ${STYLE_LABEL[k]}`).join(", ");
    return `<p><b>Buy for winning:</b> ${r.selected.length ? r.selected.map((x) => skillNameHTML(x.id)).join(", ") : "nothing"}. ${r.spent} / ${b.sp} SP.</p><p>${goalLine}</p>${duel}${pruned}
      <p class="mini">${r.method === "every full set" ? `<b>Every full set her SP allows was raced</b> (${r.fullSets}; full: no other skill still fits), so this is the best set against this field, not just the best a search found.` : `Her shop has too many combinations to race them all in the field, so the best sets from the lengths search and a swap search were raced: the best set found, not a guaranteed best.`}</p>
      <details><summary>Every set raced in the field</summary><p class="mini">${r.method === "every full set" ? "Every full set, plus" : "The strongest sets from"} the lengths search's best sets, buying nothing, the best set minus each purchase${r.method === "every full set" ? "" : ", and a swap search in the field (removing, adding or exchanging one purchase)"}, each on the same ${r.screenRaces} races (same gate draws, rivals and seeds). Win % and average place.</p><div class="table-wrap"><table><thead><tr><th>Set</th><th>SP</th><th>Win</th><th>Place</th></tr></thead><tbody>${rows}</tbody></table></div></details>
      <details><summary>The field and how it's raced</summary><p class="mini">${r.field} runners in GlobalSim (Global's game, version 77, checked against official race recordings), with pacing, lane changes, blocking and position fights between runners. Her: your stats, aptitudes, mood${r.unique ? ", her unique at level " + b.uniqueLv : ""}. ${r.team ? r.team + " teammate" + (r.team > 1 ? "s" : "") + " from your saved builds. " : ""}${r.fields ? `Rivals: <b>top players' builds</b> from uma.moe's statistics of top-class Team Trials rosters at this distance (not CM-specific): each uma with her own players' style split, stats, unique level and most-bought skills there; four different fields taking turns: ${r.fields.map((f, i) => `field ${i + 1}: ${f.map((x) => `${esc(x.name)} (${STYLE_LABEL[x.style]}, ${x.skills.length} skills)`).join(", ")}`).join("; ")}. Each skill is drawn at its real purchase rate from that uma's 50 most-bought there; real umas also carry minor skills not in that list.` : `Rivals: ${mix}, ${r.strength === "equal" ? "as strong as her (her stats)" : r.strength === "weaker" ? "10% weaker than her" : "10% stronger than her"}, A aptitudes, each with her style's best chart skills this cup has within about her SP, no debuffs and no own unique${r.rivalHeals ? ` (with chart picks they ran out of stamina in ${Math.round(r.outOf * 100)}% of races, so they carry the biggest heals that can fire for their style here first)` : ""}: <b>a modeled field, not real players' builds</b>. Their skills: ${Object.entries(r.picks).map(([k, ids]) => `${STYLE_LABEL[k]}: ${ids.map((id) => esc(skillInfo(id)[0])).join(", ") || "none"}`).join("; ")}.`} ${r.draws} gate draws, ${r.races} races in all: every set on the same draws and seeds, the top two head to head on fresh races, each purchase checked by racing without it, and the result on races no step used. ${r.showdownOff ? `<span class="warn">Stamina showdown isn't in this check: the field simulator's version is experimental and mishandles recovery skills, so it's left off (the lengths check above includes showdown).</span> ` : ""}${p.global.start > TODAY ? "Skills at Global's current versions (this cup is a forecast). " : ""}${r.missing.length ? `<span class="warn">Not in the field simulator's skill table, so they do nothing here: ${r.missing.map((id) => esc(skillInfo(id)[0])).join(", ")}.</span> ` : ""}${r.unsupported.length ? `<span class="warn">The field simulator can't run these skills' conditions yet, so they were taken out of every runner: ${r.unsupported.map((id) => esc(skillInfo(id)[0])).join(", ")}.</span> ` : ""}${r.legacy.length ? `Older skill definitions (not yet audited by the simulator) for: ${r.legacy.map((id) => esc(skillInfo(id)[0])).join(", ")}.` : ""}</p></details>`;
  }
  function soResultHTML(b, p) {
    if (soJob.running) return `<p class="mini" role="status">Racing skill sets… ${Math.round(soJob.progress)}% <button type="button" class="linkish" data-so="stop">Stop</button></p>`;
    if (soJob.error) return `<p class="mini warn">${esc(soJob.error)}</p>`;
    const r = soJob.result;
    if (!r) return `<p class="mini">Press <b>Race-check</b> to race the best sets head to head on this course (about a minute). The quick plan above adds up chart gains; the race check also catches skills that need each other, overlap, or need stamina she doesn't have.</p>`;
    const stale = soJob.key !== SO.encode(b);
    if (r.fieldError) return `${stale ? `<p class="mini warn">Inputs changed since this check. <button type="button" class="linkish" data-so="race">Race-check again</button></p>` : ""}<p class="mini warn">Full-field check failed: ${esc(r.fieldError)}</p>`;
    if (r.field2) return `${stale ? `<p class="mini warn">Inputs changed since this check. <button type="button" class="linkish" data-so="race">Race-check again</button></p>` : ""}${fieldResultHTML(r.field2, b, p)}<details><summary>The lengths result it started from</summary>${soLengthHTML(b, p, r)}</details>`;
    return (stale ? `<p class="mini warn">Inputs changed since this check. <button type="button" class="linkish" data-so="race">Race-check again</button></p>` : "") + soLengthHTML(b, p, r);
  }
  function soLengthHTML(b, p, r) {
    const note = (id) => skillCaveat(id, r.conditions[id], p.id, b.style);
    const rows = (list, mode) => list.map((x) => `<tr><th>${skillNameHTML(x.id)}${g8Pill(p.id, b.style, x.id)}${note(x.id) ? `<div class="mini">${esc(note(x.id))}</div>` : ""}</th><td>${x.cost}${mode === "rank" && x.cost > r.plan.budget ? '<div class="mini">over budget</div>' : ""}</td><td>${soNum((mode === "rank" ? x.result : x.marginal).mean)}</td><td>${soNum(x.per100)}</td></tr>`).join("");
    const plan = r.plan, spurt = plan.result.fullSpurt;
    return `
      ${r.staticReason ? `<p class="mini warn">Course-chart only: ${esc(r.staticReason)}</p>` : ""}
      <p><b>Buy:</b> ${plan.selected.length ? plan.selected.map((x) => skillNameHTML(x.id)).join(", ") : "nothing: no purchase gains length"}. ${plan.spent} / ${plan.budget} SP, ${plan.unspent} left. <b>+${soNum(plan.result.mean)} L</b> on average${plan.result.ci95 ? ` (± ${soNum(plan.result.ci95)})` : ""} over what she has; worst 10% of races ${soNum(plan.result.low)} L.</p>
      ${duelHTML(plan)}${prunedHTML(plan)}${g8PairHTML(p.id, plan.selected.map((x) => x.id).concat(b.skills.filter((x) => x.have).map((x) => x.id)))}
      ${(plan.unmetMust || []).length ? `<p class="mini warn">game8 must-haves her SP can't cover: ${plan.unmetMust.map((id) => skillNameHTML(id)).join(", ")}.</p>` : plan.selected.some((x) => g8Picks(p.id, b.style)[x.id] === "must") ? `<p class="mini">game8's must-haves in her shop are bought first, then the rest by lengths.</p>` : ""}
      ${!r.staticReason && Number.isFinite(spurt) && spurt < 0.95 ? `<p class="mini warn">With these skills she reaches a full last spurt in only ${Math.round(spurt * 100)}% of races: more stamina or a recovery skill would help.</p>` : ""}
      <div class="table-wrap"><table><thead><tr><th>Buy</th><th>SP</th><th>Added L</th><th>L / 100 SP</th></tr></thead><tbody>${rows(plan.selected, "buy") || '<tr><td colspan="4">No purchase.</td></tr>'}</tbody></table></div>
      <p class="mini">Added L: what she loses if that one skill is left out of the set, so rows don't add up to the total.</p>
      <details><summary>Every shop skill on its own</summary><p class="mini">Each one added alone to what she has, best L per 100 SP first.</p><div class="table-wrap"><table><thead><tr><th>Skill</th><th>SP</th><th>L alone</th><th>L / 100 SP</th></tr></thead><tbody>${rows(plan.ranking, "rank")}</tbody></table></div></details>
      ${(plan.offPosition || []).length ? `<p class="mini">Left out (they need a rival ahead and a Front Runner leads alone): ${plan.offPosition.map((id) => skillNameHTML(id)).join(", ")}.</p>` : ""}
      ${plan.excluded.length ? `<p class="mini warn">The simulator can't run these, so they were left out: ${plan.excluded.map((id) => skillNameHTML(id)).join(", ")}.</p>` : ""}
      <details><summary>How the race check works</summary><p class="mini">${r.staticReason ? "Chart gains and real SP costs only." : `${plan.method === "every full affordable combination" ? `Every full combination her SP allows was raced (${plan.evaluations} sets; full: nothing else still fits), 24 paired races each, so this is the best set under the simulator, not just the best a search found.` : `Her shop has too many combinations to race them all, so ${plan.evaluations} sets were raced in a search (several starting sets, additions, removals, one-for-one and two-for-two swaps), 24 paired races each: the best set found, not a guaranteed best.`} The best few again on 96 fresh races; then the top two head to head on 240 races; then each purchase raced against the set without it (240 races), dropping ones that don't clearly add lengths; and the final gain on 96 races no step used. "${r.field} runners" only sets the placing ranges her style assumes: the simulator races her against a copy of herself, not a field. Full spurt in ${Math.round((spurt || 0) * 100)}% of races.`} ${esc(r.engineNote)} Blocking, lane changes, rivals' skills and real opponents' debuffs aren't modeled; skills tagged "depends on the field" or "debuff" need your judgment. A ± range containing zero means no clear difference, not proof they're equal. Prices use hint discounts${b.fast ? " and Fast Learner" : ""}; a gold skill needs its white bought first (or owned), and that is counted.</p></details>`;
  }
  // The quick plan's chart values for her own stats (mechanics.js): skills with a Wit check fire
  // before the race max(100 - 9000 / base Wit, 20)% of the time, and the chart was run at the cup's
  // Wit; a few skills scale with her stats. The race check runs her real stats instead.
  // Her Rushed chance before each race (mechanics.js), and with Restraint (−3 points).
  function rushedLine(wit, mood, has) {
    const M = window.UmaMechanics;
    if (!M || !(wit > 0)) return "";
    const r = M.rushed(wit, mood || 0, false), w = M.rushed(wit, mood || 0, true);
    return ` Rushed (掛かり) chance at her Wit: <b>${Math.round(r * 100)}%</b> of races${has ? `, ${Math.round(w * 100)}% with Restraint, which she has` : `; Restraint would make it ${Math.round(w * 100)}%`}. Rushed burns 60% more HP for up to 12 s and costs part of her conserved power.`;
  }
  const soRushedHTML = (b) => { const line = rushedLine(+b.stats.wisdom, +b.mood, b.skills.some((x) => x.id === "202161" && x.have)); return line ? `</p><p class="mini">${line.trim()}` : ""; };
  function soAdjust(p, b, base) {
    const M = window.UmaMechanics, cat = raceCatalog(p), out = { values: Object.assign({}, base), notes: {}, wit: null };
    if (!M || !cat) return out;
    const her = SO.STATS.map((s) => +b.stats[s] || 0), chart = SO.STATS.map((s) => +p.stats[s] || 0), ground = M.groundSpeed(p.course.surface, M.groundOf(p));
    const wit = her[4] > 0 ? { her: M.activation(her[4], +b.mood || 0), chart: M.activation(chart[4], 0) } : null;
    out.wit = wit;
    Object.keys(out.values).forEach((id) => {
      const sk = cat.skills[id];
      if (!sk) return;
      if (wit && sk.wisdomCheck) out.values[id] *= wit.her / wit.chart;
      const sc = her.every((x) => x > 0) ? M.statScale(sk, her, chart, ground) : null;
      if (sc && sc.k != null) { out.values[id] *= sc.k; if (sc.k !== 1) out.notes[id] = `scales with her ${sc.type === 13 ? "highest stat" : "speed"}: ×${sc.k.toFixed(2)} of the chart's value`; }
      else if (sc) out.notes[id] = `scales with her speed: the chart's stats gave it nothing, so the race check values it`;
    });
    return out;
  }
  function renderSkillOpt(body) {
    const b = soBuild(), p = presetById(b.cup), t = soTrainee(b);
    loadSkillValues(p.id);
    const loaded = typeof svCache[p.id] === "object";
    const adj = soAdjust(p, b, loaded ? skillMap(p.id, b.style).map : {}), values = adj.values;
    const names = soCupNames(p), apt = soApt(b, p);
    let quick = null;
    try { if (loaded && b.sp !== "") quick = SO.quickPlan({ skills: b.skills, values, sp: +b.sp, fast: b.fast }); } catch (e) { quick = null; }
    const buy = new Set(quick ? quick.selected.flatMap((x) => x.tiers.map((y) => y.id)) : []);
    const statRow = SO.STATS.map((s, i) => `<label class="field"><span>${E.STAT_LABELS[E.STATS[i]]}</span><input type="number" min="1" max="3000" inputmode="numeric" data-so-stat="${s}" value="${esc(b.stats[s] || "")}" placeholder="Final"></label>`).join("");
    const aptSel = [["distanceAptitude", p.course.dist], ["surfaceAptitude", p.course.surface], ["strategyAptitude", STYLE_LABEL[b.style]]].map(([k, label], i) => `<label class="field"><span>${esc(label)} aptitude</span><select data-so-apt="${k}"><option value="">${t ? "Hers" : "A"} (${apt[i]})</option>${"SABCDEFG".split("").map((g) => `<option${b.apt[k] === g ? " selected" : ""}>${g}</option>`).join("")}</select></label>`).join("");
    const shopRows = b.skills.map((x, i) => {
      const L = values[x.id], own = SO.price(x.id, x.hint, b.fast), chain = window.UmaSkillBudget.create().chain(x.id) || [x.id];
      const lower = chain.slice(0, -1).filter((id) => !b.skills.some((r) => r.id === id && r.have));
      const note = [positionNote(p.id, x.id, b.style), adj.notes[x.id]].filter(Boolean).join(" · ");
      return `<tr class="${buy.has(x.id) && !x.have ? "so-buy" : ""}"><th>${skillNameHTML(x.id)}${g8Pill(p.id, b.style, x.id)}${releasePill(SV.skills[x.id], p, window.UmaSkillRelease.cutoff(p, TODAY))}${note ? `<div class="mini">${esc(note)}</div>` : ""}${lower.length && !x.have ? `<div class="mini">needs ${lower.map((id) => esc(skillInfo(id)[0])).join(" + ")}</div>` : ""}</th>
        <td><select data-so-hint="${i}" aria-label="Hint level">${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}"${x.hint === n ? " selected" : ""}>${n ? "Lv" + n : "–"}</option>`).join("")}</select></td>
        <td class="num">${x.have ? "–" : own == null ? "?" : own}</td><td class="num">${loaded ? (Number.isFinite(L) ? soNum(L) : '<span class="mini">no value</span>') : "…"}</td>
        <td><label class="chip-toggle"><input type="checkbox" data-so-have="${i}"${x.have ? " checked" : ""}> Has it</label></td>
        <td><button type="button" class="linkish" data-so-remove="${i}" aria-label="Remove ${esc(skillInfo(x.id)[0])}">✕</button></td></tr>`;
    }).join("");
    const quickHTML = !loaded ? `<p class="mini">Loading this cup's skill values…</p>` : b.sp === "" ? `<p class="mini">Enter her SP to see what to buy.</p>` : !b.skills.length ? `<p class="mini">Add the skills her shop offers.</p>` : quick ? `<p><b>Quick plan:</b> ${quick.selected.length ? quick.selected.map((x) => skillNameHTML(x.id)).join(", ") : "nothing affordable gains length"}. ${quick.spent} / ${quick.budget} SP, ${quick.unspent} left. About <b>+${soNum(quick.L)} L</b> by the course chart.</p><p class="mini">Highlighted in the list. Chart gains added up for her running style, with hint${b.fast ? " and Fast Learner" : ""} discounts and gold prerequisites counted${adj.wit ? `, and each Wit-checked skill valued at her Wit: it passes its pre-race Wit check in ${Math.round(adj.wit.her * 100)}% of races (the chart assumed ${Math.round(adj.wit.chart * 100)}%)` : ""}. Race-check it below: skills that overlap or need stamina change the answer.${soRushedHTML(b)}</p>` : `<p class="mini warn">Couldn't price this list.</p>`;
    const saved = state.soSaved || [];
    body.innerHTML = `<div class="skillopt">
      <section class="panel"><h2>Skill optimizer</h2>
        <p class="mini">What to buy with her skill points for a Champions Meeting or League of Heroes race: the skills that gain the most lengths on that course for her style, within her SP. Like UmaTools' optimizer, but scored by race lengths instead of rating.</p>
        <div class="row-wrap"><label class="field grow"><span>Cup</span><select data-so-field="cup">${soCupOptions(b.cup)}</select></label>
          <label class="field"><span>Running style</span><select data-so-field="style">${STYLES.map(([k, l]) => `<option value="${k}"${b.style === k ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>
        <p class="mini">${esc(p.course.track)} ${p.course.distance} m ${esc(p.course.surface)} · ${p.kind === "loh" ? "12" : "9"} runners. ${esc(soEngineNote(p))}</p>
        ${p.global.start > TODAY ? `<p class="mini"><span class="pill">Forecast</span> Global hasn't run this cup yet${p.global.est ? " (its date is estimated)" : ""}. It's simulated as JP's game was on the cup's JP date, never with older skill versions than Global has now. Global has brought balance changes early before, so a skill's version, or the rules, may differ when it comes.</p>` : ""}
        <div class="row-wrap"><label class="field grow"><span>Trainee (optional: her aptitudes and unique)</span><input data-so-trainee="1" list="traineeList" value="${t ? esc(traineeLabel(t)) : ""}" placeholder="Type a trainee name" autocomplete="off"></label>
          ${t ? `<button type="button" class="btn ghost small" data-so="innate">Add her innate skills</button>` : ""}
          <button type="button" class="btn ghost small" data-so="fromcm">Use my CM &amp; decks ace</button></div>
        <div class="tg-row">${statRow}</div>
        <div class="row-wrap">${aptSel}</div>
        <div class="row-wrap"><label class="field"><span>Skill points</span><input type="number" min="0" max="20000" inputmode="numeric" data-so-field="sp" value="${esc(b.sp)}" placeholder="SP"></label>
          <label class="chip-toggle"><input type="checkbox" data-so-field="fast"${b.fast ? " checked" : ""}> Fast Learner (−10%)</label>
          <label class="field"><span>Mood</span><select data-so-field="mood">${[["0", "Normal (CM rounds)"], ["1", "Good"], ["2", "Great (finals)"], ["-1", "Bad"], ["-2", "Awful"]].map(([v, l]) => `<option value="${v}"${b.mood === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
          <label class="field"><span>Unique level</span><select data-so-field="uniqueLv">${[1, 2, 3, 4, 5, 6].map((n) => `<option${+b.uniqueLv === n ? " selected" : ""}>${n}</option>`).join("")}</select></label></div>
      </section>
      <section class="panel"><h3>Her skill shop</h3>
        <div class="row-wrap"><label class="field grow"><span>Add a skill</span><input id="soSkill" list="soSkillList" autocomplete="off" placeholder="Skill name, then Enter"></label><button type="button" class="btn ghost small" data-so="add">Add</button></div>
        <datalist id="soSkillList">${names.map(([, n]) => `<option value="${esc(n)}"></option>`).join("")}</datalist>
        <details${b.pasteOpen ? " open" : ""} data-so-paste-box="1"><summary>Paste a list</summary><p class="mini">One skill per line. Add <b>Lv3</b> (or hint 3) for a hint level; a price at the end is ignored. "O" and "OO" at the end mean ○ and ◎.</p><textarea id="soPaste" rows="5" placeholder="Professor of Curvature Lv2&#10;Corner Adept O Lv3&#10;Swinging Maestro"></textarea><button type="button" class="btn ghost small" data-so="paste">Add these</button></details>
        ${b.skills.length ? `<div class="table-wrap"><table class="so-shop"><thead><tr><th>Skill</th><th>Hint</th><th>SP</th><th>L (chart)</th><th></th><th></th></tr></thead><tbody>${shopRows}</tbody></table></div><button type="button" class="linkish" data-so="clear">Clear the list</button>` : ""}
        <p class="mini">L: median lengths gained on this course for her style (Umalator chart, no other skills). Tick <b>Has it</b> for skills she already learned: they're the baseline and cost nothing. SP shown for one tier at its hint level.</p>
        ${quickHTML}
      </section>
      <section class="panel"><h3>Race check</h3>
        <div class="row-wrap"><label class="field grow"><span>Goal</span><select data-so-field="goal"><option value="length"${b.goal !== "win" ? " selected" : ""}>Most lengths gained (fast)</option><option value="win"${b.goal === "win" ? " selected" : ""}>${p.kind === "loh" ? "Best finish" : "Win the race"} in a full field (about a minute)</option></select></label></div>
        ${b.goal === "win" ? soFieldHTML(b, p) : ""}
        <button type="button" class="btn" data-so="race">${soJob.running ? "Restart race check" : "Race-check"}</button>
        <div id="soOut">${soResultHTML(b, p)}</div>
      </section>
      <section class="panel"><h3>Save and share</h3>
        <div class="row-wrap"><button type="button" class="btn ghost small" data-so="share">Copy share link</button><label class="field grow"><span>Save as</span><input id="soName" placeholder="${esc((t ? t.n : "Build") + " · " + p.name)}"></label><button type="button" class="btn ghost small" data-so="save">Save</button></div>
        ${saved.length ? `<ul class="so-saved">${saved.map((s, i) => `<li><button type="button" class="linkish" data-so-load="${i}">${esc(s.name)}</button> <span class="mini">${esc(s.at || "")}</span> <button type="button" class="linkish" data-so-del="${i}" aria-label="Delete ${esc(s.name)}">✕</button></li>`).join("")}</ul>` : `<p class="mini">Saved builds stay in this browser. A share link carries the whole build.</p>`}
      </section></div>`;
  }
  function soFieldHTML(b, p) {
    const why = fieldUnsupported(p);
    if (why) return `<p class="mini warn">${esc(why)} The lengths check still runs.</p>`;
    const mix = soMix(b, p), n = Object.values(mix).reduce((a, c) => a + c, 0), saved = state.soSaved || [];
    const own = SO.encode(b);
    return `<p class="mini">She races ${p.kind === "loh" ? "11" : "8"} rivals (and your teammates, if you pick them) in GlobalSim, a full-field simulator with blocking, lanes and position fights. ${p.kind === "loh" ? "League of Heroes scores by placing, so the goal is her best average place." : "The goal is her win rate (her team's, with teammates)."}</p>
      <div class="row-wrap"><label class="field grow"><span>Rivals</span><select data-so-field="strength">${[["top-strong", "Top players: strong (top-class stats, upper half)"], ["top-typical", "Top players: typical (top-class median stats)"], ["equal", "Modeled: as strong as her"], ["weaker", "Modeled: 10% weaker than her"], ["stronger", "Modeled: 10% stronger than her"]].map(([v, l]) => `<option value="${v}"${b.strength === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        ${topField(b) ? "" : FR.STYLES.map((k) => `<label class="field"><span>${STYLE_LABEL[k]} rivals</span><input type="number" min="0" max="17" inputmode="numeric" data-so-mix="${k}" value="${mix[k] || 0}"></label>`).join("")}</div>
      ${topField(b) ? `<p class="mini">Rivals are drawn from what top players run at ${esc(poolName(p))} distance (uma.moe statistics of ${RP ? RP.meta.classTrainers.toLocaleString() : "?"} top-class Team Trials trainers, ${RP ? fmtDate(RP.meta.version) : ""}): the most-picked umas by pick rate, each with her own aptitudes, unique and best style, top-class stats, and skills at their real purchase rates, debuffs included. Four different fields take turns, as opponents change from race to race.</p>` : ""}
      <div class="row-wrap"><label class="chip-toggle"><input type="checkbox" data-so-field="precise"${b.precise ? " checked" : ""}> More precise (about 2.5× the races, for close calls)</label></div>
      <div class="row-wrap">${[0, 1].map((i) => `<label class="field grow"><span>Teammate ${i + 1}</span><select data-so-team="${i}"><option value="">None</option>${saved.filter((x) => x.code !== own).map((x) => `<option value="${esc(x.code)}"${b.team[i] === x.code ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>`).join("")}</div>
      <p class="mini">${topField(b) ? soFieldSize(p) - 1 - b.team.length : n} rivals${b.team.length ? ` + ${b.team.length} teammate${b.team.length > 1 ? "s" : ""}` : ""}${!topField(b) && n + b.team.length + 1 !== soFieldSize(p) ? ` <span class="warn">(a real ${p.kind === "loh" ? "League of Heroes" : "CM"} race has ${soFieldSize(p)} runners)</span>` : ""}. Teammates come from your saved builds: save each ace's build first.</p>`;
  }
  function soChanged() { save(); renderTab(); }
  async function runSkillOpt() {
    const b = soBuild(), p = presetById(b.cup), t = soTrainee(b);
    if (soJob.worker) soJob.worker.close();
    const token = {}; Object.assign(soJob, { token, running: true, error: null, progress: 0, key: SO.encode(b) });
    const same = () => soJob.token === token;
    renderTab();
    let worker = null;
    try {
      if (SO.STATS.some((s) => !(+b.stats[s] > 0))) throw new Error("Enter all five final stats.");
      if (b.sp === "") throw new Error("Enter her skill points.");
      if (!b.skills.some((x) => !x.have)) throw new Error("Add the skills her shop offers.");
      const RS = window.UmaRaceSkills, eng = RS.engine(p, SV.meta.sims), catalog = await RS.load(eng.catalog);
      const unsupported = RS.supported(p, Object.assign({}, simVariant(p), { inBrowser: !!eng.sim }), catalog);
      await ensureSkills([p.id]);
      if (!same()) return;
      worker = unsupported ? null : RS.runner(eng.sim); soJob.worker = worker;
      const apt = soApt(b, p), own = t ? (t.us || []).map(String).filter((id) => catalog.skills[id]) : [];
      const learned = [...new Set(own.concat(b.skills.filter((x) => x.have).map((x) => x.id)))];
      const available = b.skills.filter((x) => !x.have).map((x) => x.id), hints = Object.fromEntries(b.skills.map((x) => [x.id, x.hint]));
      const values = skillMap(p.id, b.style).map;
      const input = { outfitId: t ? String(t.id) : "", starCount: t ? t.r : 3, uniqueLv: +b.uniqueLv, mood: +b.mood, strategy: b.style,
        speed: +b.stats.speed, stamina: +b.stats.stamina, power: +b.stats.power, guts: +b.stats.guts, wisdom: +b.stats.wisdom,
        distanceAptitude: apt[0], surfaceAptitude: apt[1], strategyAptitude: apt[2], aptitudes: t ? t.apt.slice(2, 6).concat(t.apt.slice(0, 2), t.apt.slice(6, 10)) : Array(10).fill("A") };
      const compare = async (before, after, n, seed) => {
        if (!same()) throw new Error("Comparison cancelled.");
        if (unsupported) {
          const value = (skills) => { const by = {}; skills.forEach((id) => { const f = window.UmaSkillBudget.DATA.skills[id] && window.UmaSkillBudget.DATA.skills[id][0] || id; by[f] = Math.max(by[f] || 0, values[id] || 0); }); return Object.values(by).reduce((a, c) => a + c, 0); };
          return RS.summary([value(after) - value(before)]);
        }
        const key = JSON.stringify([p.id, eng.sim, input, before, after, n, seed]);
        if (!raceMemo.has(key)) { const answer = await worker.run(RS.request(p, input, before, after, catalog, n, seed)); raceMemo.set(key, Object.assign(RS.summary(answer.results.results), { fullSpurt: answer.results.runData.nspurt[1] / n })); if (raceMemo.size > 2500) raceMemo.delete(raceMemo.keys().next().value); }
        return raceMemo.get(key);
      };
      // game8's must-haves in her shop are bought first; all its picks win close calls.
      const g8 = g8Picks(p.id, b.style), g8Must = available.filter((id) => g8[id] === "must" && !learned.includes(id));
      const plan = await RS.optimize({ catalog, allowChartOnly: !!unsupported, available, learned, hints, sp: +b.sp, values, must: g8Must, prefer: Object.keys(g8), compare, scale: raceScale(p, b.style, available), maxEvaluations: 96, fastLearner: b.fast,
        progress: (f) => { if (!same()) return; soJob.progress = f * (b.goal === "win" && !fieldUnsupported(p) ? 40 : 100); const box = document.getElementById("soOut"); if (box && state.tab === "skillopt") box.innerHTML = `<p class="mini" role="status">Racing skill sets… ${Math.round(soJob.progress)}% <button type="button" class="linkish" data-so="stop">Stop</button></p>`; } });
      if (same()) soJob.result = { plan, staticReason: unsupported, engineNote: soEngineNote(p), field: p.kind === "loh" ? 12 : 9, conditions: skillConditions(catalog, plan.ranking.map((x) => x.id).concat(available)) };
      if (same() && b.goal === "win" && !fieldUnsupported(p)) {
        let pool = null;
        try {
          const gs = await globalSim();
          if (!same()) return;
          const ctrl = new AbortController(); soJob.abort = ctrl;
          pool = await gs.G.RacePool.create({ size: Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1)) });
          const v = simVariant(p), tid = t && t.us && t.us[0] ? String(t.us[0]) : null;
          const her = { style: b.style, stats: Object.fromEntries(SO.STATS.map((s) => [s, +b.stats[s]])), apt, mood: +b.mood, unique: tid && gs.table[tid] ? { id: tid, level: +b.uniqueLv } : null };
          const ownCost = b.skills.filter((x) => x.have).reduce((n, x) => n + (SO.price(x.id, x.hint, b.fast) || 0), 0);
          const rivalSp = Math.max(1200, +b.sp + ownCost), mix = soMix(b, p), picks = {};
          FR.STYLES.forEach((k) => { if (mix[k]) picks[k] = rivalSkills(p, k, rivalSp, gs.table); });
          const team = b.team.map((code) => teammate(code, p)).filter(Boolean);
          let field = topField(b) ? null : FR.rivals(her, { mix, strength: b.strength, skillsFor: (k) => picks[k] });
          const familyOf = (id) => (window.UmaSkillBudget.DATA.skills[id] || [id])[0];
          const fields = topField(b) ? [0, 1, 2, 3].map((i) => FR.topRivals(RP.distances[poolName(p)], { preset: p, count: soFieldSize(p) - 1 - team.length, seed: 1000 + i * 7919 + p.course.id,
            level: b.strength === "top-typical" ? "typical" : "strong", trainee: (id) => D.trainee(+id), allowed: (id) => released(id, p), table: gs.table, mood: +b.mood, uniqueLevel: 4, familyOf })) : null;
          if (fields) field = fields[0];
          // If the rivals run out of stamina in more than 30% of races, they carry heals instead.
          const unsupported = new Set(), runIt = (req, seeds) => pool.runResults(req, seeds, { signal: ctrl.signal });
          const probe = await FR.runSafe({ preset: p, table: gs.table, settings: gs.settings, run: runIt }, [FR.runner(her)].concat(team.map(FR.runner), field.map(FR.runner)), FR.layouts(1 + team.length + field.length, 1)[0], Array.from({ length: 24 }, (_, i) => 777000 + i), unsupported);
          const outOf = probe.reduce((n, r) => n + r.results.slice(1 + team.length).filter((x) => x.hpEmptyOnRace).length, 0) / (probe.length * field.length);
          let rivalHeals = false;
          if (!fields && outOf > 0.3) { rivalHeals = true; FR.STYLES.forEach((k) => { if (mix[k]) picks[k] = rivalHealSkills(p, k, rivalSp, gs.table); }); field = FR.rivals(her, { mix, strength: b.strength, skillsFor: (k) => picks[k] }); }
          const mine = [...new Set(learned.concat(available))];
          const field2 = await FR.search({ preset: p, kind: p.kind, her, learned, team, field, fields, table: gs.table, options: plan.ranking, sp: +b.sp, precise: b.precise, settings: gs.settings,
            // GlobalSim's showdown is an experimental option that mishandles recovery skills (a heal
            // made runners run out of stamina in 90% of races); the validated setup leaves it off.
            showdown: false, candidates: plan.shortlist.concat([[]], plan.shortlist[0].map((x) => plan.shortlist[0].filter((y) => y !== x))), familyOf,
            run: runIt, unsupported, signal: ctrl.signal,
            progress: (f) => { if (!same()) return; soJob.progress = 40 + f * 60; const box = document.getElementById("soOut"); if (box && state.tab === "skillopt") box.innerHTML = `<p class="mini" role="status">Racing the field… ${Math.round(soJob.progress)}% <button type="button" class="linkish" data-so="stop">Stop</button></p>`; } });
          if (same()) soJob.result.field2 = Object.assign(field2, { mix, strength: b.strength, team: team.length, unique: !!her.unique, rivalHeals, outOf, picks, fields, showdownOff: !!(v.syoubu && p.course.distance >= 2101),
            missing: mine.filter((id) => !gs.table[id]), legacy: mine.filter((id) => gs.legacy.has(id)) });
        } catch (error) { if (same() && !/cancel|abort/i.test(error.message || "")) soJob.result.fieldError = error.message || String(error); }
        finally { if (pool) pool.close(); soJob.abort = null; }
      }
    } catch (error) { if (same() && !/cancelled/i.test(error.message || "")) soJob.error = error.message || String(error); }
    finally { if (worker) worker.close(); if (same()) { soJob.running = false; soJob.worker = null; if (state.tab === "skillopt") renderTab(); } }
  }
  function soClick(e) {
    const el = e.target.closest("[data-so],[data-so-remove],[data-so-load],[data-so-del]");
    if (!el) return false;
    const b = soBuild(), p = presetById(b.cup), act = el.dataset.so;
    if (el.dataset.soRemove != null) { b.skills.splice(+el.dataset.soRemove, 1); soChanged(); return true; }
    if (el.dataset.soLoad != null) { const s = (state.soSaved || [])[+el.dataset.soLoad], v = s && SO.decode(s.code); if (v) { state.skillOpt = v; soJob.result = null; soChanged(); flash("Loaded " + s.name); } return true; }
    if (el.dataset.soDel != null) { (state.soSaved || []).splice(+el.dataset.soDel, 1); soChanged(); return true; }
    if (act === "add") {
      const box = document.getElementById("soSkill"), text = box.value.trim().toLowerCase();
      const hit = soCupNames(p).find(([, n]) => n.toLowerCase() === text) || (SO.parsePaste(text, soCupNames(p)).found[0] || null);
      const id = hit ? (Array.isArray(hit) ? hit[0] : hit.id) : null;
      if (!id) { flash("Pick a skill from the list (out on Global by this cup)."); return true; }
      soAdd(b, id, Array.isArray(hit) ? 0 : hit.hint); soChanged();
      const again = document.getElementById("soSkill"); if (again) again.focus();
      return true;
    }
    if (act === "paste") {
      const r = SO.parsePaste((document.getElementById("soPaste") || {}).value || "", soCupNames(p));
      r.found.forEach((x) => soAdd(b, x.id, x.hint));
      b.pasteOpen = !!r.missed.length; soChanged();
      flash(`Added ${r.found.length} skill${r.found.length === 1 ? "" : "s"}${r.missed.length ? `; not found: ${r.missed.slice(0, 4).join(", ")}${r.missed.length > 4 ? "…" : ""}` : ""}`);
      return true;
    }
    if (act === "innate") { const t = soTrainee(b); if (t) { (t.is || []).concat(t.as || []).map(String).filter((id) => SV.skills[id]).forEach((id) => soAdd(b, id, 0)); soChanged(); } return true; }
    if (act === "fromcm") {
      const c = cm("cm"), ace = W.current(state).ace, q = raceState(c);
      b.cup = c.preset; b.style = c.style;
      if (ace && ace.tid) b.tid = String(ace.tid);
      SO.STATS.forEach((s) => { if (q.stats[s]) b.stats[s] = q.stats[s]; });
      ["distanceAptitude", "surfaceAptitude", "strategyAptitude"].forEach((k) => { if (q.apt[k]) b.apt[k] = q.apt[k]; });
      if (q.sp !== "" && q.sp != null) b.sp = q.sp;
      if (q.mood != null) b.mood = String(q.mood); if (q.uniqueLv) b.uniqueLv = String(q.uniqueLv);
      (q.skills || []).forEach((x) => soAdd(b, String(x.id), +x.hint || 0, !!x.learned));
      state.skillOpt = SO.clean(b); soChanged(); flash("Copied from CM & decks"); return true;
    }
    if (act === "clear") { b.skills = []; soChanged(); return true; }
    if (act === "race") { runSkillOpt(); return true; }
    if (act === "stop") { if (soJob.abort) soJob.abort.abort(); if (soJob.worker) soJob.worker.close(); soJob.token = null; soJob.running = false; soJob.worker = null; renderTab(); return true; }
    if (act === "share") {
      const url = location.origin + location.pathname + "#so=" + SO.encode(b);
      try { navigator.clipboard.writeText(url).then(() => flash("Share link copied"), () => prompt("Copy this link", url)); } catch (err) { prompt("Copy this link", url); }
      return true;
    }
    if (act === "save") {
      const t = soTrainee(b), name = ((document.getElementById("soName") || {}).value || "").trim() || (t ? t.n : "Build") + " · " + p.name;
      state.soSaved = (state.soSaved || []).filter((s) => s.name !== name);
      state.soSaved.unshift({ name: name.slice(0, 60), code: SO.encode(b), at: TODAY });
      state.soSaved = state.soSaved.slice(0, 30); soChanged(); flash("Saved"); return true;
    }
    return true;
  }
  function soChange(e) {
    const el = e.target, b = soBuild();
    if (el.dataset.soField) { const k = el.dataset.soField; b[k] = el.type === "checkbox" ? el.checked : el.value; }
    else if (el.dataset.soStat) b.stats[el.dataset.soStat] = el.value;
    else if (el.dataset.soApt) b.apt[el.dataset.soApt] = el.value;
    else if (el.dataset.soHint != null) b.skills[+el.dataset.soHint].hint = +el.value;
    else if (el.dataset.soHave != null) b.skills[+el.dataset.soHave].have = el.checked;
    else if (el.dataset.soMix) { b.mix = Object.assign({}, soMix(b, presetById(b.cup)), { [el.dataset.soMix]: +el.value || 0 }); }
    else if (el.dataset.soTeam != null) { const team = b.team.slice(); team[+el.dataset.soTeam] = el.value; b.team = team.filter(Boolean); }
    else if (el.dataset.soTrainee) {
      const t = traineeByLabel.get(el.value.trim());
      if (!t && el.value.trim()) { flash("Pick a trainee from the list."); return true; }
      b.tid = t ? String(t.id) : "";
      if (t) { const best = stylesFor(t)[0]; if ("GFEDCB".indexOf(t.apt[6 + STYLES.findIndex((x) => x[0] === b.style)]) !== -1) b.style = best[0]; }
    } else return false;
    state.skillOpt = SO.clean(Object.assign(b, { pasteOpen: b.pasteOpen }));
    state.skillOpt.pasteOpen = b.pasteOpen;
    soChanged();
    return true;
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target && e.target.id === "soSkill") { e.preventDefault(); soClick({ target: document.querySelector('[data-so="add"]') }); } });
  document.addEventListener("toggle", (e) => { const d = e.target; if (d && d.dataset && d.dataset.soPasteBox && state.skillOpt) { state.skillOpt.pasteOpen = d.open; save(); } }, true);
  // A shared build (#so=...) opens here once, then the link is taken off the address.
  if (HAS_DATA && /^#so=/.test(location.hash)) {
    const v = SO.decode(location.hash.slice(4));
    if (v) { state.skillOpt = v; state.tab = "skillopt"; save(); }
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
  }

  function renderTab() {
    if (HAS_DATA && P && W) W.migrate(state, workflowOptions());
    const sc = scenario();
    $$(".tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === state.tab)));
    const body = $("#tabBody");
    if (state.tab === "tiers" && HAS_DATA) {
      renderTiers();
      return;
    }
    if (state.tab === "cm" && HAS_DATA && cmPlan()) {
      syncWorkflow();
      renderDecks(body);
      return;
    }
    if (state.tab === "parents" && HAS_DATA && cmPlan()) {
      syncWorkflow();
      cmPlan().renderParents(body);
      return;
    }
    if (state.tab === "pulls" && HAS_DATA && pulls()) {
      pulls().render(body);
      return;
    }
    if (state.tab === "skillopt" && HAS_DATA && SO) {
      renderSkillOpt(body);
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

  if (HAS_DATA && P && W) { W.migrate(state, workflowOptions()); save(); }
  shell();
  fillLists();
  render();
})();
