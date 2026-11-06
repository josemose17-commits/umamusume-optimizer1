// CM & decks' team and the Parents tab.
// CM & decks: pick the cup and up to three aces (teamHTML); the deck optimizer (app.js) builds
// the selected ace's racing deck and saves her predicted stats against your targets.
// Parents, top to bottom: ① her gaps (target minus predicted) as blue sparks to look for;
// ② Parent 1: a new parent from My umas, trained from one of your veterans and a borrowed
// grandparent (or your veteran as Parent 1), with the uma.moe grandparent search; ③ training
// her (SS, as many G1s as SS allows); ④ the uma.moe Parent 2 search; ⑤ the family check
// (affinity 250+ for the ace). Logic: cm-plan.js; state.cmp keeps the aces and each ace's deck.
(function (root) {
  "use strict";
  const STYLES = [["Nige", "Front"], ["Senkou", "Pace"], ["Sasi", "Late"], ["Oikomi", "End"]];
  const STYLE_LABEL = Object.fromEntries(STYLES);
  const MAX_ACES = 3;
  // The ace's family must reach this affinity (both parents and their parents, as the game
  // shows it when you pick her parents). Families under it are not suggested.
  const MIN_AFFINITY = 250;
  // A fresh parent's deck is first built for this many G1s (Race Bonus counts for them), before
  // her race plan is known.
  const PLAN_RACES = 10;
  const RANK = "GFEDCBAS";
  const fmt = (v) => v.toFixed(2);
  const fmtN = (v) => Math.round(v).toLocaleString("en-US");
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  function create(ctx) {
    const { D, P, A, F, PR, esc } = ctx;
    const CP = root.UmaCmPlan.create({ A, F, skills: ctx.SB.DATA.skills, trainees: D.DATA.trainees, chars: ctx.chars(), saddles: ctx.saddles, SS: PR.SS, today: ctx.today });
    const VT = root.UmaVeterans ? root.UmaVeterans.create(ctx.SB.DATA.skills) : null;
    // Your own uma.moe API key (uma.moe → Settings → API Keys): kept in this browser only.
    const KEY = "uma-moe-api-key-v1";
    const apiKey = () => { try { return root.localStorage.getItem(KEY) || ""; } catch (e) { return ""; } };
    const setKey = (v) => { try { if (v) root.localStorage.setItem(KEY, v); else root.localStorage.removeItem(KEY); } catch (e) { /* private window */ } };
    let job = null;             // a search in progress: { stage, f }
    const views = new Map();    // each ace's deck as it stands, described: { sig, … }
    const found = new Map();    // each ace's parents, with the deck they were found for
    let editAce = null;         // the chip being edited, or the new ace's index
    const opened = {};          // boxes you opened or closed: kept across redraws
    const trainee = (id) => (id ? D.trainee(+id) : null);
    const tName = (t) => (t ? t.n + (D.DATA.trainees.filter((x) => x.cid === t.cid).length > 1 ? " [" + t.t + "]" : "") : "");
    const cardName = (id) => { const c = D.card(id); return c ? c.n + " [" + c.t + "]" : "#" + id; };
    const tick = () => new Promise((r) => setTimeout(r, 0));

    // ---------- state ----------
    const cups = () => P.list.filter((p) => p.global.end >= ctx.today);
    function st() {
      const s = ctx.state();
      if (!s.cmp) s.cmp = {};
      const c = s.cmp;
      if (!c.byCup) c.byCup = {};
      if (!c.sel) c.sel = {};
      if (!c.decks) c.decks = {};
      // You always train a parent to SS.
      if (c.parentRank !== "SS") ctx.setParentRank("SS");
      delete c.ssMust;
      if (!c.cup || !P.list.some((p) => p.id === c.cup)) c.cup = (cups().find((p) => p.kind === "cm") || cups()[0] || P.list[P.list.length - 1]).id;
      return c;
    }
    const cup = (c) => P.list.find((p) => p.id === c.cup);
    // Her running style: the one she's best at (Pace on ties).
    function bestStyle(t) {
      if (!t) return "Senkou";
      let best = 1;
      [0, 1, 2, 3].forEach((i) => { if (RANK.indexOf(t.apt[6 + i]) > RANK.indexOf(t.apt[6 + best])) best = i; });
      return STYLES[best][0];
    }
    // This cup's aces: yours to pick (starting from your Pull planner team for its track).
    function aces(c) {
      if (!c.byCup[c.cup]) c.byCup[c.cup] = ctx.pullTeam(cup(c)).filter((m) => ctx.myUmas().has(+m.tid)).slice(0, MAX_ACES);
      return c.byCup[c.cup];
    }
    // The ace you're working on.
    function current(c) {
      const list = aces(c).filter((a) => trainee(a.tid));
      return list.find((a) => a.tid === c.sel[c.cup]) || list[0] || null;
    }
    const styleOf = (a) => a.style || bestStyle(trainee(a.tid));
    const keyOf = (c, a) => c.cup + "|" + a.tid;
    // Her deck and its settings (CM & decks edits them), her saved prediction, and the
    // uma.moe search settings for Parent 2 (rental) and the grandparent (fresh.rental).
    function deckOf(c, a) {
      const k = keyOf(c, a);
      if (!c.decks[k]) { const d = ctx.deckDefaults(); c.decks[k] = { comp: d.comp, borrow: d.borrow, skillW: d.skillW, must: [], exclude: [], targets: d.targets || {}, rankGoal: d.rankGoal || "", cards: null, searched: null }; }
      const d = c.decks[k], defaults = ctx.deckDefaults();
      Object.entries({ comp: {}, borrow: defaults.borrow, skillW: defaults.skillW, must: [], exclude: [], locked: [], cards: null }).forEach(([k, v]) => { if (d[k] == null) d[k] = v; });
      if (!d.targets) d.targets = {};
      d.rental = prefsOf(d.rental);
      return d;
    }
    // Search settings. v3: pink follows your rule by default (S distance; S surface in a sprint).
    function prefsOf(r) {
      r = r || { pink: "auto", blue: "auto", sort: "whites", quality: "recommended", required: [], version: 4 };
      if ((r.version || 0) < 3) { if (!r.pink || r.pink === "none") r.pink = "auto"; r.required = [...new Set(r.required || [])]; }
      // v4: every listed white goes in as a preferred white by default (it ranks, never filters).
      if ((r.version || 0) < 4) { r.sort = "whites"; r.version = 4; }
      return r;
    }
    const cardsNow = (d) => (d.cards || []).map((x) => Object.assign({}, x, { lb: x.borrowed ? 4 : ctx.owned()[x.id] != null ? +ctx.owned()[x.id] : x.lb }));
    const targetsOf = (d) => { const t = {}; ["speed", "stamina", "power", "guts", "wit"].forEach((x) => { if (d.targets[x] > 0) t[x] = +d.targets[x]; }); return Object.keys(t).length ? t : null; };
    const settings = (d, keep) => ({ comp: d.comp, borrow: d.borrow, skillW: d.skillW, must: d.must, exclude: d.exclude, targets: targetsOf(d), rankGoal: d.rankGoal || "",
      locked: [...new Set((d.locked || []).concat(keep.filter((x) => !x.borrowed).map((x) => x.id)))], friend: (keep.find((x) => x.borrowed) || {}).id || null });
    // How you build Parent 1: "B" a new parent from your veteran and a borrowed grandparent
    // (the default), "A" your veteran as Parent 1.
    function freshOf(d) {
      if (!d.fresh) d.fresh = { setup: "B", picks: {} };
      const f = d.fresh;
      f.picks = f.picks || {};
      if (f.setup !== "A") f.setup = "B";
      f.parentMode = "rental";
      f.rental = prefsOf(f.rental);
      return f;
    }
    // Her gaps from CM & decks' prediction: how far each stat ends short of its target, or null.
    function gapsOf(d) {
      const p = d && d.predicted;
      return p && p.stats && p.target ? p.target.map((t, i) => Math.max(0, Math.round(t - p.stats[i]))) : null;
    }
    const inputsKey = (c) => { const a = current(c), d = a && deckOf(c, a), tid = d && d.fresh && d.fresh.plan && d.fresh.plan.tid; return JSON.stringify([ctx.veterans().at, ctx.veterans().list.length, [...ctx.myUmas()].sort(), ctx.family(), d && d.fresh, d && d.predicted, tid ? ctx.parentDeck(tid) : null]); };

    async function ready(p) {
      for (let i = 0; !ctx.euReady(); i++) { if (i > 600) throw new Error("The card data didn't load. Check your connection."); await new Promise((r) => setTimeout(r, 100)); }
      await ctx.ensureSkills([p.id]);
    }
    const stage = async (text, f) => { job = { stage: text, f }; ctx.rerender(); await tick(); };
    async function busy(first, fn) {
      if (job) return;
      job = { stage: first, f: 0 };
      ctx.rerender();
      try { await fn(); } catch (err) { ctx.flash(err.message || String(err)); }
      job = null;
      ctx.rerender();
    }

    // Her racing deck as CM & decks left it, described (the race skills it offers), or null.
    function view(c, a) {
      const d = deckOf(c, a);
      if (!d.cards || !d.cards.length) return null;
      const p = cup(c), style = styleOf(a), cards = cardsNow(d);
      const sig = JSON.stringify([p.id, a.tid, style, cards.map((x) => [x.id, x.lb, !!x.borrowed]), d.skillW, d.must, d.comp, d.borrow, d.exclude, d.targets, d.rankGoal, ctx.scenario().id, ctx.ownedCode()]);
      const k = keyOf(c, a), had = views.get(k);
      if (had && had.sig === sig) return had;
      if (!ctx.euReady() || !ctx.aceSkills({ preset: p, style })) return null;
      const setup = ctx.deckSetup(p, style, a.tid, null, settings(d, cards));
      const v = { sig, cards, offers: ctx.deckOffers(setup.opts, cards) };
      views.set(k, v);
      return v;
    }

    // ---------- Parent 1 ----------
    async function findParents() {
      const c = st(), p = cup(c), a = current(c);
      if (!a) { ctx.flash("Pick an ace in CM & decks first."); return; }
      const d = deckOf(c, a);
      if (!d.cards || !d.cards.length) { ctx.flash("Build her deck in CM & decks first."); return; }
      await busy("Loading the card data…", async () => {
        await ready(p);
        const v = view(c, a);
        if (!v) throw new Error("The race's skill values didn't load. Try again.");
        const r = await planParents(c, p, a, v);
        found.set(keyOf(c, a), Object.assign(r, { sig: v.sig, inputs: inputsKey(c) }));
        d.parentSummary = r.p1 ? { tid: r.useFresh ? r.p1.t.id : r.p1.v.tid, fresh: r.useFresh, total: r.p1.s.total } : null;
        ctx.save();
      });
    }
    // Best first, among families that can reach the affinity minimum (all, when none can).
    const reaching = (list) => { const ok = list.filter((x) => x.aff.total >= MIN_AFFINITY); return ok.length ? ok : list; };
    async function planParents(c, p, a, v) {
      const t = trainee(a.tid), who = tName(t), style = styleOf(a), d = deckOf(c, a), prefs = freshOf(d);
      const rel = ctx.aceSkills({ preset: p, style });
      if (!rel) throw new Error("The race's skill values didn't load. Try again.");
      const vetsAll = ctx.veterans().list, umas = [...ctx.myUmas()];
      const x = CP.context({ ace: { cid: t.cid, tid: t.id }, race: { preset: p, style }, rel, offers: v.offers, build: ctx.build(p), gaps: gapsOf(d) });
      await stage(`${who}: your veterans as Parent 1…`, 0.2);
      const vets = CP.rankVets(x, vetsAll);
      // The new parent you planned, trained and imported: she's Parent 1 now, with her real sparks.
      const made = prefs.setup === "B" ? CP.trainedParent(prefs.plan, vetsAll) : null;
      const trained = made && prefs.useTrained !== false ? CP.rankVets(x, [made])[0] || null : null;
      let fresh = [];
      if (prefs.setup === "B" && !trained) {
        await stage(`${who}: the best new Parent 1 from My umas…`, 0.4);
        const pdeck = ctx.deck(p, style, null, PLAN_RACES);
        // The grandparent you borrowed (entered under the grandparent search), per new parent.
        const gps = gpRentals(prefs), picks = {};
        Object.keys(prefs.picks).forEach((k) => { picks[k] = Object.assign({}, prefs.picks[k], gps[k] ? { rental: gps[k].friend } : {}); });
        fresh = CP.rankFresh(x, vetsAll, umas, pdeck.offers, { parentMode: "rental", picks, rentals: Object.values(gps) });
      }
      // The ace's family affinity each choice can reach once you borrow (cm-plan.js outlook).
      vets.concat(fresh).forEach((y) => { y.aff = CP.outlook(x, y.f, vetsAll); });
      const family = ctx.family(), selected = family.p1;
      let chosenVet = reaching(vets)[0] || null, chosenFresh = fresh.find((f) => +f.t.id === +prefs.tid) || reaching(fresh)[0] || null;
      // A Parent 1 you chose in the family table wins over the suggestion.
      if (selected && selected.cid && !selected.planned) {
        if (selected.fresh) chosenFresh = fresh.find((z) => z.t.id === selected.tid) || chosenFresh;
        else if (selected.vet != null) chosenVet = vets.find((z) => z.v.id === selected.vet) || chosenVet;
        else if (selected.manual || selected.green || selected.blue[1] || selected.pink[1] || selected.white.length) chosenVet = CP.rankVets(x, [{ id: "manual", cid: selected.cid, tid: selected.tid, self: selected, parents: [family.g11, family.g12] }])[0] || chosenVet;
      }
      if (trained) chosenVet = trained;
      const useFresh = prefs.setup === "B" && !trained && !!chosenFresh;
      if (useFresh && chosenFresh.vetOptions) chosenFresh.vetOptions.forEach((y) => { y.aff = CP.outlook(x, y.f, vetsAll); });
      let train = null;
      if (useFresh) {
        let f = chosenFresh;
        // In the order it depends on: her races → her deck → how many races keep SS with that deck
        // → (the quick build only) the deck again for the races she keeps, and the count again.
        const races = CP.racePlan(f, vetsAll), mine = ctx.parentDeck(f.t.id);
        let her = mine ? Object.assign(ctx.deckWith(p, style, f.t.id, races.extraRaces, mine), { source: "yours" }) : Object.assign(ctx.deck(p, style, f.t.id, races.extraRaces), { source: "quick" });
        f = Object.assign({}, f, { offers: her.offers });
        await stage(`${who}: ${tName(f.t)}'s races at SS…`, 0.7);
        const blueStart = CP.trainingStart(x, f);
        let ss = await ssCut(p, style, f.t, her.cards, races.extraRaces, "SS", vetsAll, blueStart);
        if (!mine && ss.n < races.extraRaces) {
          await stage(`${who}: her deck for the ${plural(ss.n, "race")} she keeps…`, 0.8);
          const kept = Object.assign(ctx.deck(p, style, f.t.id, ss.n), { source: "quick" });
          if (kept.cards.map((y) => y.id).join() !== her.cards.map((y) => y.id).join()) {
            her = kept; f = Object.assign({}, f, { offers: her.offers });
            ss = await ssCut(p, style, f.t, her.cards, races.extraRaces, "SS", vetsAll, blueStart);
          }
        }
        chosenFresh = f = CP.atRaceCount(x, f, races, ss.n);
        f.aff = CP.outlook(x, f.f, vetsAll);
        // The chosen veteran's line shows the same number as the headline: with her race plan at SS.
        (f.vetOptions || []).forEach((y) => { if (y.v === f.parents[0]) y.aff = f.aff; });
        const at = fresh.findIndex((y) => y.t.id === f.t.id); if (at !== -1) fresh[at] = f;
        await stage(`${who}: Training Focus for ${tName(f.t)}…`, 0.9);
        train = { f, races, deck: her, ss, agenda: CP.upTo(races, ss.n), focus: await focusPick(p, style, f.t, her.cards, ss.n, ss.blueStart) };
      }
      const p1 = useFresh ? chosenFresh : chosenVet;
      if (p1 && !p1.aff) p1.aff = CP.outlook(x, p1.f, vetsAll);
      if (p1 && !(p1.kind === "vet" && p1.v.id === "manual")) ctx.planFamily(p1, train, selected && selected.cid && !selected.planned);
      // Remember the parent you'll train (and when), so a later import finds her.
      if (useFresh) {
        const plan = prefs.plan, vet = train.f.parents[0].cid;
        prefs.plan = { tid: train.f.t.id, vet, at: plan && +plan.tid === +train.f.t.id && +plan.vet === +vet && plan.at ? plan.at : new Date().toISOString() };
      }
      return { a, style, t, x, gaps: x.gaps, setup: prefs.setup, vets: vets.slice(0, 6), fresh: fresh.slice(0, 6), useFresh, train, p1, trained: !!trained, made };
    }

    // The most extra races (her plan's order) that keep her at SS. Your veterans in the scenario
    // you train in that ran next to no extra races give the ratings you really reach; the
    // simulation (her deck, Independent Training, 16 careers) gives what each race costs her; a
    // count keeps her at SS when SS_SHARE of those ratings, less that cost, still reach it.
    // Too few such veterans: the simulation alone (it leaves out inheritance, so it runs low).
    async function ssCut(p, style, t, cards, max, rank, vets, blueStart) {
      const rate = ctx.spRate(p, style, t.apt), uniq = PR.uniqueBonus(t.r, t.r), share = root.UmaCmPlan.SS_SHARE;
      const minimum = PR.rankThreshold(rank);
      const rating = (x) => PR.statsScore(x.stats) + Math.round((x.sp || 0) * rate) + uniq;
      const memo = new Map();
      const sim = async (k) => {
        if (!memo.has(k)) {
          await tick();
          const x = ctx.simulate(p, t.id, cards, k, blueStart), fin = x.finals || [];
          memo.set(k, { n: k, stats: x.stats, sp: x.sp, rating: rating(x), hit: fin.filter((y) => rating(y) >= minimum).length, of: fin.length });
        }
        return memo.get(k);
      };
      const zero = await sim(0), top = await sim(max);
      const perRace = max > 0 ? Math.max(0, (zero.rating - top.rating) / max) : 0;
      const sc = ctx.scenario();
      let scen = sc, base = CP.baseline(vets, sc.id, minimum);
      if (!base) {
        // Not enough of your veterans in the coach's scenario: the one you trained in last.
        const last = (vets || []).filter((v) => v.scenario).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
        if (last && last.scenario !== sc.id) { base = CP.baseline(vets, last.scenario, minimum); if (base) scen = { id: last.scenario, name: ctx.scenarioName(last.scenario) }; }
      }
      let cut;
      if (base) cut = Object.assign(CP.ssLimit(base, perRace, max, minimum), { from: "veterans", base, scen });
      else {
        const ok = (y) => (y.of ? y.hit / y.of >= share : y.rating >= minimum);
        if (ok(top)) cut = { n: max };
        else if (!ok(zero)) cut = { n: 0, none: true };
        else {
          let lo = 0, hi = max;
          while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ok(await sim(mid))) lo = mid; else hi = mid; }
          cut = { n: lo };
        }
        cut.from = "simulation";
      }
      await sim(cut.n);
      return Object.assign(cut, { rank, perRace, rows: [...memo.values()].sort((a, b) => a.n - b.n), simScen: sc, blueStart });
    }

    // Independent Training's Training Focus: her run (her deck, her extra G1s) simulated with each,
    // 16 careers; the one with the most runs at SS, then the higher average rating (the simulation
    // leaves out inheritance, so it often reaches SS in none: rating is the closest measure), then
    // the most stats over 1,100 (the 3★ blue chance).
    const FOCUS = [["balanced", "Balanced"], ["stamina", "Stamina"], ["sprint", "Sprint"]];
    async function focusPick(p, style, t, cards, n, blueStart) {
      const rate = ctx.spRate(p, style, t.apt), uniq = PR.uniqueBonus(t.r, t.r), minimum = PR.rankThreshold("SS");
      const rating = (x) => PR.statsScore(x.stats) + Math.round((x.sp || 0) * rate) + uniq;
      const rows = [];
      for (const [k, label] of FOCUS) {
        await tick();
        const x = ctx.simulate(p, t.id, cards, n, blueStart, k), fin = x.finals || [];
        const over = fin.length ? fin.reduce((m, y) => m + y.stats.filter((v) => v > 1100).length, 0) / fin.length : x.stats.filter((v) => v > 1100).length;
        rows.push({ k, label, stats: x.stats, sp: x.sp, rating: rating(x), hit: fin.filter((y) => rating(y) >= minimum).length, of: fin.length, over });
      }
      const best = rows.slice().sort((a, b) => b.hit - a.hit || b.rating - a.rating || b.over - a.over)[0];
      return { rows, best };
    }

    // The uma.moe search for the ace's Parent 2, with this Parent 1 (her G1s as the legacy).
    function parent2Search(r, prefs) {
      const saddles = CP.saddlesOf(r.useFresh ? r.train.f : r.p1);
      return CP.rentalSearch(r.x, r.p1, Object.assign({}, prefs || {}, { saddles }));
    }
    // The uma.moe search for the grandparent: the new parent is the target, your veteran the legacy.
    const grandparentSearch = (r, prefs) => CP.trainingRentalSearch(r.x, r.train.f, prefs);

    // ---------- CM & decks: the cup and your team ----------
    function teamHTML() {
      const c = st();
      aces(c);
      ctx.sync();
      const p = cup(c), list = aces(c), selected = current(c);
      const mine = [...ctx.myUmas()].map(trainee).filter(Boolean).sort((a, b) => a.n.localeCompare(b.n) || a.t.localeCompare(b.t));
      const groups = [["Now and next on Global", P.list.filter(x => x.kind === "cm" && x.global.end >= ctx.today && !x.global.est)], ["Later Champions Meetings (Global dates estimated)", P.list.filter(x => x.kind === "cm" && x.global.est)], ["League of Heroes (JP so far, Global dates estimated)", P.list.filter(x => x.kind === "loh")], ["Past Global Champions Meetings", P.list.filter(x => x.kind === "cm" && x.global.end < ctx.today).reverse()]];
      const cupOpts = groups.filter(([, xs]) => xs.length).map(([label, xs]) => `<optgroup label="${esc(label)}">${xs.map(x => `<option value="${x.id}"${x.id === c.cup ? " selected" : ""}>${esc(ctx.cupLabel(x))}</option>`).join("")}</optgroup>`).join("");
      const chips = list.map((a, i) => `<div class="chip cmp-ace-chip${selected && a.tid === selected.tid ? " active" : ""}">
        <button type="button" class="linkish cmp-ace-name" data-cmp-sel="${a.tid}" aria-pressed="${!!selected && a.tid === selected.tid}">${esc(tName(trainee(a.tid)))} · ${STYLE_LABEL[styleOf(a)]}</button>
        <button type="button" class="linkish" data-cmp-edit="${i}" aria-label="Change ${esc(tName(trainee(a.tid)))}" aria-expanded="${editAce === i}">Change</button>
        <button type="button" class="linkish" data-cmp-ace-remove="${i}" aria-label="Remove ${esc(tName(trainee(a.tid)))}">✕</button></div>`).join("");
      let editor = "";
      if (editAce != null && editAce <= list.length) {
        const a = list[editAce], t = trainee(a && a.tid);
        editor = `<div class="row-wrap cmp-ace-pick"><label class="field grow"><span>${t ? "Ace" : "Add an ace"}</span><select data-cmp-ace="${editAce}"><option value="">Pick an uma…</option>${mine.map((m) => `<option value="${m.id}"${t && m.id === t.id ? " selected" : ""}>${esc(m.n + " [" + m.t + "]")}</option>`).join("")}</select></label>
          <button type="button" class="btn ghost small" id="cmpAceDone">Done</button></div>`;
      }
      const team = ctx.pullTeam(p).filter((m) => ctx.myUmas().has(+m.tid));
      return `<label class="field grow"><span>Champions Meeting or League of Heroes</span><select id="cmpCup">${cupOpts}</select></label>
        <div class="row-wrap cmp-chips" aria-label="Your team"><span class="mini"><b>Your team</b> (up to ${MAX_ACES}; the deck below is for the one picked)</span>${chips}${list.length < MAX_ACES ? `<button type="button" class="btn ghost small" id="cmpAddAce"${mine.length ? "" : " disabled"}>+ Add an ace</button>` : ""}${team.length ? `<button type="button" class="linkish" id="cmpTeam">Use my Pull planner team</button>` : ""}</div>${editor}
        ${!mine.length ? `<p class="mini">Your team comes from My umas: tick them in the Trainees tab, or import your umaextractor export in <button type="button" class="linkish" data-goto-tab="parents" data-goto-section="import">Parents</button>.</p>` : ""}`;
    }

    // ---------- Parents ----------
    function renderParents(body) {
      const c = st();
      aces(c);
      ctx.sync();
      const a = current(c), p = cup(c), d = a ? deckOf(c, a) : null;
      const r = a ? found.get(keyOf(c, a)) : null;
      const prog = job ? `<div class="row-wrap" role="status"><span class="progress"><i style="width:${Math.round(job.f * 100)}%"></i></span><span class="mini">${esc(job.stage)}</span></div>` : "";
      const panel = (key, title, html) => `<section class="panel cmp-step" id="cm-${key}"><h3>${title}</h3>${html}</section>`;
      const steps = a ? [
        panel("gaps", "1 · Her gaps", gapsHTML(c, a, d, r)),
        panel("p1", "2 · Make Parent 1", p1HTML(c, a, d, r) + prog),
        panel("training", "3 · Train her", trainHTML(c, a, d, r)),
        panel("p2", "4 · Parent 2", p2HTML(c, a, d, r)),
        panel("check", "5 · Her family", checkHTML(r))].join("") : "";
      body.innerHTML = `<div class="cm cmp">
        <section class="panel"><h2>Parents${a ? " for " + esc(tName(trainee(a.tid))) : ""}</h2>
          <p class="mini">${esc(p.name)} · ${a ? STYLE_LABEL[styleOf(a)] : "no ace yet"}. Fill her gaps with blue sparks, make Parent 1 with a borrowed grandparent, borrow Parent 2, reach ${MIN_AFFINITY}+ affinity.</p>
          <div class="row-wrap cmp-chips" aria-label="Your team">${aces(c).filter((x) => trainee(x.tid)).map((x) => `<button type="button" class="chip${a && x.tid === a.tid ? " active" : ""}" data-cmp-sel="${x.tid}" aria-pressed="${!!a && x.tid === a.tid}">${esc(tName(trainee(x.tid)))}</button>`).join("")}<button type="button" class="linkish" data-goto-tab="cm">${a ? "Team and decks in CM & decks" : "Pick your team in CM & decks"} →</button></div>
        </section>
        ${steps}
        <details class="panel" id="cm-family" data-cmp-open="family-tools"${opened["family-tools"] ? " open" : ""}><summary><b>Family table</b> · enter and compare a family by hand</summary>${ctx.familyHTML()}</details>
        ${importHTML()}
        ${howHTML()}
      </div>`;
      if (job) body.querySelectorAll("button, select, input, textarea").forEach((el) => { el.disabled = true; });
      body.querySelectorAll("details[data-cmp-open]").forEach((el) => {
        if (opened[el.dataset.cmpOpen] != null) el.open = opened[el.dataset.cmpOpen];
        el.addEventListener("toggle", () => { if (el.isConnected) opened[el.dataset.cmpOpen] = el.open; });
      });
    }

    // ① The blue sparks that fill her gaps, and roughly how many stars cover each.
    // A 3★ blue on a parent gives about 50 over the run, on a grandparent about 40 (family.js:
    // the start bonus plus both inspirations at a typical affinity).
    const PER_3STAR = Math.round((F.blueStats(3, 100, 1) + F.blueStats(3, 50, F.GRAND)) / 2);
    function gapsHTML(c, a, d, r) {
      const pred = d.predicted;
      if (!pred) return `<p class="mini">CM &amp; decks hasn't predicted her deck yet. <button type="button" class="btn small" data-goto-tab="cm">Build her deck in CM &amp; decks</button></p>`;
      const gaps = gapsOf(d), give = r && r.p1 ? r.p1.s.blueStats || null : null;
      const rows = F.STAT_LABELS.map((l, i) => {
        const g = gaps[i], sparks = Math.ceil(g / PER_3STAR);
        const need = !g ? "—" : sparks > 6 ? `more than 6 sparks at 3★ (~${fmtN(g - 6 * PER_3STAR)} stays short)` : `${sparks} × 3★ (${sparks * 3}★ in all)`;
        return `<tr${g ? "" : ' class="cmp-cut"'}><td>${l}</td><td class="num">${pred.target[i]}</td><td class="num">${pred.stats[i]}</td><td class="num ${g ? "short" : ""}">${g ? "−" + g : "+" + (pred.stats[i] - pred.target[i])}</td><td>${need}</td>${give ? `<td class="num">${give[i] ? "+" + fmtN(give[i]) : "—"}</td>` : ""}</tr>`;
      }).join("");
      const look = gaps.map((g, i) => g ? F.STAT_LABELS[i] : "").filter(Boolean);
      return `<div class="table-wrap"><table class="plan cmp-gaps"><thead><tr><th>Stat</th><th class="num">Target</th><th class="num">Predicted</th><th class="num">Gap</th><th>Blue to cover it</th>${give ? '<th class="num">Planned family gives</th>' : ""}</tr></thead><tbody>${rows}</tbody></table></div>
        <p class="mini">${look.length ? `<b>Look for blue in ${look.join(", ")}</b>, biggest gap first.` : "<b>No gaps</b>: blues go to her key stats."} About ${PER_3STAR} per 3★ spark over the run (start bonus + two inspirations).</p>`;
    }

    const sparks = (m) => [m.blue && m.blue[1] ? `${F.STAT_LABELS[m.blue[0]]} ${m.blue[1]}★` : "", m.pink && m.pink[1] ? `${F.APT_LABELS[m.pink[0]]} ${m.pink[1]}★` : "", m.green ? `green ${m.green}★` : "", m.white && m.white.length ? plural(m.white.length, "white") : "", m.wins && m.wins.length ? `${m.wins.length} G1` : ""].filter(Boolean).join(" · ");
    const vetName = (v) => tName(trainee(v.tid)) || ctx.charName(v.cid);
    // Affinity once you borrow (the best characters for the open slots), and what's known now.
    const affText = (y) => `~${y.aff.total} ${y.aff.symbol}${y.aff.total >= MIN_AFFINITY ? "" : " · under " + MIN_AFFINITY}`;

    // ② The new parent and her veteran (or your veteran as Parent 1), and the grandparent search.
    function p1HTML(c, a, d, r) {
      const prefs = freshOf(d), v = view(c, a), has = d.cards && d.cards.length;
      const stale = r && ((v && r.sig !== v.sig) || r.inputs !== inputsKey(c));
      const setup = `<div class="row-wrap"><label class="field"><span>Parent 1</span><select data-cmp-setup><option value="B"${prefs.setup === "B" ? " selected" : ""}>Train a new one: my veteran + a borrowed grandparent</option><option value="A"${prefs.setup === "A" ? " selected" : ""}>My veteran is Parent 1</option></select></label>
        <button type="button" class="btn" id="cmpParents"${job || !has ? " disabled" : ""}>${r ? "Find again" : "Find Parent 1"}</button>${!has ? `<span class="mini">Build her deck in <button type="button" class="linkish" data-goto-tab="cm">CM &amp; decks</button> first.</span>` : ""}${stale ? `<span class="mini warn">Something changed; find again.</span>` : ""}</div>`;
      if (!r) return setup;
      const pick = r.p1;
      if (!pick) return setup + `<p class="mini">${r.setup === "B" ? "No uma in My umas fits. Tick more in the Trainees tab." : "Import your veterans below."}</p>`;
      let out;
      const made = prefs.setup === "B" && !r.trained ? CP.trainedParent(prefs.plan, ctx.veterans().list) : null;
      if (r.trained) {
        const v = pick.v, ps = (v.parents || []).filter(Boolean).map((m) => esc(ctx.charName(m.cid)));
        out = `<p class="ok"><b>✓ Parent 1 is trained:</b> your veteran <b>${esc(vetName(v))}</b>${v.at ? ` (imported, made ${esc(String(v.at).slice(0, 10))})` : ""}${ps.length ? `, her parents ${ps.join(" + ")}` : ""}.</p>
          <p>${sparks(v.self)}${v.score ? ` · rating ${fmtN(v.score)}` : ""} · for the ace: score <b>${fmt(pick.s.value)}</b> · affinity <b>${affText(pick)}</b>. The Parent 2 search below now uses her real sparks and G1s.</p>
          <button type="button" class="linkish" data-cmp-trained="no">Plan a new parent instead</button>`;
        return setup + out;
      }
      if (made && prefs.useTrained === false) out = `<p class="mini">You trained ${esc(vetName(made))}. <button type="button" class="linkish" data-cmp-trained="yes">Use her as Parent 1</button></p>`;
      else if (made) out = `<p class="mini warn">Your trained ${esc(vetName(made))} is imported: press Find again to use her.</p>`;
      else out = "";
      if (r.useFresh) {
        // Your veterans for her, best first (never her character or the ace's); the ones the
        // ranking skipped (a weaker one of the same character) follow by name.
        const chosen = prefs.picks[pick.t.id] || {}, ranked = pick.vetOptions || [], seen = new Set(ranked.map((o) => o.v.id));
        const rest = ctx.veterans().list.filter((x) => !seen.has(x.id) && +x.cid !== +pick.t.cid && +x.cid !== +r.t.cid).sort((a, b) => vetName(a).localeCompare(vetName(b)));
        const top = ranked[0];
        out += `<p><b>Train ${esc(tName(pick.t))}</b> with your veteran <b>${esc(vetName(pick.parents[0]))}</b> (${sparks(pick.parents[0].self) || "no sparks listed"}) and ${pick.rental ? `your borrowed grandparent <b>${esc(pick.rental.names[0])}</b> (${sparks(pick.rental.parent) || "no sparks entered"})` : "a borrowed grandparent"} · for the ace: score <b>${fmt(pick.value)}</b> · affinity <b>${affText(pick)}</b>.</p>
          <label class="field"><span>Her veteran parent</span><select data-cmp-training-vet="${pick.t.id}"><option value="">Best for her${top ? " (" + esc(vetName(top.v)) + ")" : ""}</option>${ranked.map((o, i) => `<option value="${o.v.id}"${String(chosen.veteran) === String(o.v.id) ? " selected" : ""}>${i + 1}. ${esc(vetName(o.v))} · score ${fmt(o.value)}${o.aff ? " · ~" + o.aff.total + " " + o.aff.symbol : ""} · ${sparks(o.v.self)}</option>`).join("")}${rest.length ? `<optgroup label="Not ranked (a stronger one of the same character is above)">${rest.map((x) => `<option value="${x.id}"${String(chosen.veteran) === String(x.id) ? " selected" : ""}>${esc(vetName(x))} · ${sparks(x.self)}</option>`).join("")}</optgroup>` : ""}</select></label>
          <p class="mini">Ranked by what the pair gives the ace and the new parent's own career, best first. The ace's own character isn't offered: as the ace's grandparent she'd have 0 affinity with her.</p>
          ${searchHTML("Grandparent search", grandparentSearch(r, prefs.rental), "training", prefs.rental, `the grandparent you borrow for ${tName(pick.t)}`)}
          ${gpHTML(r, prefs)}`;
      } else {
        out += `<p><b>${pick.v.id === "manual" ? "Your parent" : "Your veteran"} ${esc(vetName(pick.v))}</b>${pick.v.score ? ` · rating ${fmtN(pick.v.score)}` : ""} · ${sparks(pick.v.self)} · score <b>${fmt(pick.s.value)}</b> · affinity <b>${affText(pick)}</b>.</p>`;
      }
      const other = (r.useFresh ? r.fresh : r.vets).filter((x) => x !== pick);
      if (other.length) out += `<details data-cmp-open="p1-other"><summary class="mini">Other choices (${other.length})</summary><div class="table-wrap"><table class="plan"><thead><tr><th>Parent 1</th><th class="num">For the ace</th><th class="num">Affinity</th><th></th></tr></thead><tbody>${other.map((x) => {
        const fresh = x.kind === "fresh";
        const ps = fresh ? x.parents.map(vetName).concat(["a borrowed grandparent"]) : x.v.parents.filter(Boolean).map((m) => ctx.charName(m.cid));
        return `<tr${x.aff.total >= MIN_AFFINITY ? "" : ' class="cmp-cut"'}><td>${fresh ? "Train " : "Veteran: "}<b>${esc(fresh ? tName(x.t) : vetName(x.v))}</b>${ps.length ? `<div class="mini">Parents: ${ps.map(esc).join(" + ")}</div>` : ""}</td><td class="num">${fresh ? "~" : ""}${fmt(x.value)}</td><td class="num">${affText(x)}</td><td><button type="button" class="linkish" data-cmp-p1="${fresh ? "fresh|" + x.t.id : "vet|" + x.v.id}">Use</button></td></tr>`;
      }).join("")}</tbody></table></div><p class="mini">Ranked by what she gives the ace: her expected sparks (whites boosted by copies her parents carry), the G1s she can share, and affinity. Faded: under ${MIN_AFFINITY}.</p></details>`;
      return setup + out;
    }

    // ---------- the grandparent you borrowed ----------
    // What you read off her uma.moe card: her version, her own sparks (her parents never reach
    // the ace) and the G1s she won. Saved per new parent: prefs.picks[tid].gp.
    const g1Names = () => A.g1Races().map((r) => r.name);
    function gpRentals(prefs) {
      const out = {};
      Object.keys(prefs.picks || {}).forEach((k) => {
        const g = prefs.picks[k].gp, t = g && trainee(g.tid);
        if (!t) return;
        out[k] = { friend: "gp-" + k, trainer: "you", names: [tName(t)], parents: [null, null], unknown: [],
          parent: { cid: t.cid, tid: t.id, white: (g.white || []).map((w) => w.slice()), blue: (g.blue || [0, 0]).slice(), pink: (g.pink || [0, 0]).slice(), green: +g.green || 0, wins: (g.wins || []).slice() } };
      });
      return out;
    }
    function gpHTML(r, prefs) {
      const f = r.train.f, tid = f.t.id, g = (prefs.picks[tid] || {}).gp || null, attr = `data-cmp-gp="${tid}"`;
      const using = f.rental && f.rental.friend === "gp-" + tid;
      const avoid = new Set([+f.t.cid, +f.parents[0].cid]);
      const glob = new Set(ctx.chars()), list = D.DATA.trainees.filter((t) => glob.has(t.cid) && !avoid.has(+t.cid)).sort((a, b) => a.n.localeCompare(b.n) || a.t.localeCompare(b.t));
      const opt = (rows, v) => rows.map(([k, l]) => `<option value="${k}"${String(k) === String(v) ? " selected" : ""}>${esc(l)}</option>`).join("");
      const stars = (v, zero) => opt((zero ? [[0, zero]] : []).concat([[1, "1★"], [2, "2★"], [3, "3★"]]), v);
      const whites = CP.want(r.x).white.map((w) => w.id), have = new Set((g && g.white || []).map((w) => String(w[0])));
      const body = g ? `<div class="row-wrap">
          <label class="field"><span>Blue</span><select data-cmp-gp-field="blue0" ${attr}>${opt(F.STAT_LABELS.map((l, i) => [i, l]), g.blue[0])}</select></label>
          <label class="field"><span>Stars</span><select data-cmp-gp-field="blue1" ${attr}>${stars(g.blue[1], "none")}</select></label>
          <label class="field"><span>Pink</span><select data-cmp-gp-field="pink0" ${attr}>${opt(F.APT_LABELS.map((l, i) => [i, l]), g.pink[0])}</select></label>
          <label class="field"><span>Stars</span><select data-cmp-gp-field="pink1" ${attr}>${stars(g.pink[1], "none")}</select></label>
          <label class="field"><span>Green (her unique)</span><select data-cmp-gp-field="green" ${attr}>${stars(g.green, "none")}</select></label></div>
        <div class="row-wrap"><label class="field grow"><span>Her whites that matter here</span><select data-cmp-gp-white ${attr}><option value="">Add a white…</option>${whites.filter((id) => !have.has(String(id))).map((id) => `<option value="${id}">${esc(ctx.skillName(id))}</option>`).join("")}</select></label>
          <label class="field"><span>Stars</span><select data-cmp-gp-white-stars ${attr}>${stars(g.whiteStars || 1)}</select></label></div>
        ${(g.white || []).length ? `<div class="row-wrap">${g.white.map((w) => `<span class="chip">${esc(ctx.skillName(w[0]))} ${w[1]}★ <button type="button" class="linkish" data-cmp-gp-white-del="${w[0]}" ${attr} aria-label="Remove">✕</button></span>`).join("")}</div>` : ""}
        <details data-cmp-open="gp-wins"><summary class="mini">G1s she won (${(g.wins || []).length}): her shared ones go first in ${esc(f.t.n)}'s races</summary><div class="row-wrap">${g1Names().map((n) => `<label class="chip-toggle small"><input type="checkbox" data-cmp-gp-win="${esc(n)}" ${attr}${(g.wins || []).includes(n) ? " checked" : ""}>${esc(n)}</label>`).join("")}</div></details>
        <div class="row-wrap"><button type="button" class="btn small" data-cmp-gp-use ${attr}>${using ? "Plan again with her" : "Plan with her"}</button><button type="button" class="linkish" data-cmp-gp-clear ${attr}>Remove her</button>${using ? '<span class="mini ok">✓ In the plan</span>' : '<span class="mini">Not in the plan yet.</span>'}</div>` : "";
      const key = apiKey();
      const look = `<div class="row-wrap"><label class="field"><span>Her trainer ID</span><input inputmode="numeric" data-cmp-gp-trainer="${tid}" value="${esc(g && g.trainer || "")}" placeholder="9–12 digits" autocomplete="off"></label>
          <button type="button" class="btn small" data-cmp-gp-lookup ${attr}${key ? "" : " disabled"}>Fill from uma.moe</button>${g && g.filled ? `<span class="mini">${esc(g.filled)}</span>` : ""}</div>
        ${key ? `<p class="mini">Uses your uma.moe API key (kept in this browser). <button type="button" class="linkish" data-cmp-key-forget>Forget the key</button></p>`
          : `<div class="row-wrap"><label class="field grow"><span>Your uma.moe API key (needed once)</span><input type="password" data-cmp-key autocomplete="off" placeholder="uma.moe → Settings → API Keys"></label><button type="button" class="btn ghost small" data-cmp-key-save>Save in this browser</button></div>
          <p class="mini">uma.moe only answers lookups made with a key: sign in at <a href="https://uma.moe/settings" target="_blank" rel="noopener">uma.moe/settings</a> and create one under API Keys. It stays in this browser; the app sends it only to uma.moe.</p>`}`;
      return `<div class="cmp-gp"><h4>The grandparent you borrowed</h4>${look}
        <label class="field"><span>Her uma (from the uma.moe card)</span><select data-cmp-gp-field="tid" ${attr}><option value="">Pick her…</option>${list.map((t) => `<option value="${t.id}"${g && +g.tid === +t.id ? " selected" : ""}>${esc(t.n + " [" + t.t + "]")}</option>`).join("")}</select></label>
        ${body}${g ? '<p class="mini">Only her own sparks: her parents never reach the ace. Whites not listed here don\'t count for this race.</p>' : ""}</div>`;
    }

    // Her trainer ID → her uma.moe profile → the form (still yours to check and change).
    async function lookupGp(c, a, tid, trainer) {
      const id = String(trainer || "").replace(/\D/g, "");
      if (!/^\d{9,12}$/.test(id)) { ctx.flash("A trainer ID has 9 to 12 digits."); return; }
      if (!apiKey() || !VT) { ctx.flash("Save your uma.moe API key first."); return; }
      let res;
      try { res = await root.fetch("https://uma.moe/api/v4/user/profile/" + id, { headers: { "X-API-Key": apiKey() } }); }
      catch (e) { ctx.flash("Couldn't reach uma.moe. Check your connection."); return; }
      const why = { 401: "uma.moe didn't accept the API key. Create a new one in uma.moe's settings.", 403: "That trainer's profile is hidden on uma.moe.", 404: "No trainer with that ID on uma.moe.", 429: "uma.moe says too many lookups: wait a minute." }[res.status];
      if (!res.ok) { ctx.flash(why || "uma.moe answered " + res.status + "."); return; }
      let got;
      try { got = VT.fromUmaMoe(await res.json()); } catch (e) { ctx.flash(e.message || "Couldn't read her uma.moe profile."); return; }
      const prefs = freshOf(deckOf(c, a)), pick = prefs.picks[tid] = prefs.picks[tid] || {};
      const versions = D.DATA.trainees.filter((t) => +t.cid === +got.cid);
      const version = got.tid && trainee(got.tid) ? +got.tid : versions.length === 1 ? versions[0].id : null;
      const m = got.self;
      pick.gp = { tid: version, blue: m.blue.slice(), pink: m.pink.slice(), green: m.green || 0, white: m.white.map((w) => w.slice()), wins: m.wins.slice(), trainer: id,
        filled: got.source === "veteran" ? "Filled from her veteran record on uma.moe: check it, then Plan with her." : `Filled from her uma.moe listing${version ? "" : " (pick her version)"}: tick her G1s, then Plan with her.` };
      if (!version) pick.gp.tid = null;
      // The game's rules: she can't be the same character as the new parent or your veteran;
      // as the ace's own character she'd have 0 affinity with the ace.
      const r = found.get(keyOf(c, a)), f = r && r.train && r.train.f;
      const clash = f && [f.t, f.parents[0]].find((u) => +u.cid === +got.cid);
      if (clash) { delete pick.gp; ctx.flash(`She's ${ctx.charName(got.cid)}, the same character as ${tName(trainee(clash.tid || clash.id)) || ctx.charName(clash.cid)}: she can't be her parent.`); }
      else if (+got.cid === +(trainee(a.tid) || {}).cid) pick.gp.filled += " She's the ace's own character: 0 affinity with the ace.";
      ctx.save(); ctx.rerender();
    }

    // A search link, exactly what it sets in plain words, and its settings.
    function searchHTML(title, l, scope, prefs, who) {
      return `<div class="cmp-search"><h4>${title}</h4><p><a class="btn small" href="${esc(l.url)}" target="_blank" rel="noopener" data-cmp-link="${scope}">Open the ${title.toLowerCase()} on uma.moe</a> <span class="mini">for ${esc(who)}</span></p>
        <ul class="mini cmp-filters">${CP.searchSummary(l, ctx.skillName).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        ${settingsHTML(l, prefs, scope)}</div>`;
    }
    function settingsHTML(l, prefs, scope) {
      const attr = `data-cmp-rental-scope="${scope}"`, key = "rental-settings-" + scope, selected = new Set(l.required);
      const options = (rows, value) => rows.map(([v, label]) => `<option value="${v}"${String(v) === String(value) ? " selected" : ""}>${esc(label)}</option>`).join("");
      return `<details class="cmp-rental-settings" data-cmp-open="${key}"${opened[key] ? " open" : ""}><summary class="mini">Change the search</summary>
        <div class="row-wrap">
          <label class="field"><span>Blue stat</span><select data-cmp-rental="blue" ${attr}>${options([["auto", "Her biggest gap (" + l.blue[0].label + ")"], ...F.STAT_LABELS.map((v, i) => [i, v])], prefs.blue == null ? "auto" : prefs.blue)}</select></label>
          <label class="field"><span>Blue stars</span><select data-cmp-rental="quality" ${attr}>${options([["recommended", "Own 3★ · lineage 7–9★"], ["broad", "Wider: own 2–3★ · lineage 6–9★"]], l.broad ? "broad" : "recommended")}</select></label>
          <label class="field"><span>Pink</span><select data-cmp-rental="pink" ${attr}>${options([["auto", "Your rule" + (l.auto ? " (" + l.auto.label + " → " + l.auto.target + ")" : ": none needed")], ["none", "Off"], ...l.choices.map(p => [p.i, p.label + " · lineage 3★+"])], l.mode)}</select></label>
          <label class="field"><span>Whites</span><select data-cmp-rental="sort" ${attr}>${options([["whites", "In the link as preferred (P0/P1/P2), then affinity"], ["affinity", "Not in the link: affinity only"]], l.sort)}</select></label>
        </div>
        <fieldset class="cmp-required"><legend class="mini">Require whites (each one you tick must be ${scope === "training" ? "on her" : "in her line"}; every tick cuts the results)</legend>${l.whites.length ? `<div class="row-wrap"><button type="button" class="btn ghost small" data-cmp-require="all" ${attr}>Require all</button><button type="button" class="btn ghost small" data-cmp-require="none" ${attr}>Clear</button></div>` : ""}<div class="row-wrap">${l.whites.map(w => `<label class="chip-toggle small"><input type="checkbox" data-cmp-rental-white="${w.id}" ${attr}${selected.has(w.id) ? " checked" : ""}>${esc(ctx.skillName(w.id))}</label>`).join("") || '<span class="mini">No race whites missing.</span>'}</div></fieldset>
        ${l.focused.length ? `<details><summary class="mini">Search for an inherited unique</summary>${l.focused.map(g => `<p><a href="${esc(g.search.url)}" target="_blank" rel="noopener">${esc(ctx.skillName(g.skill.id))} · ${g.skill.owners.map(t => esc(tName(t))).join(" / ")}</a></p><ul class="mini cmp-filters">${CP.searchSummary(g.search, ctx.skillName).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`).join("")}</details>` : ""}
      </details>`;
    }

    // Where her race count comes from, in words.
    function ssText(ss) {
      const pct = Math.round(root.UmaCmPlan.SS_SHARE * 100);
      if (ss.from === "veterans") return `${ss.n} extra G1s keep ${ss.ss} of ${ss.of} reference runs at SS (${pct}% needed, ${esc(ss.scen.name)})${ss.none ? `; even none falls short of ${pct}%` : ""}.`;
      const row = ss.rows.find((x) => x.n === ss.n);
      return `Simulation: SS in ${row.hit} of ${row.of} with ${ss.n} extra G1s (${pct}% needed)${ss.none ? "; short even with none" : ""}.`;
    }
    // ③ SS, as many G1s as SS allows (her veteran's first), her Ace-parent deck and skills, then ① to ④.
    function trainHTML(c, a, d, r) {
      if (!r) return `<p class="mini">Find Parent 1 first.</p>`;
      if (r.trained) return `<p class="ok">✓ Done: ${esc(vetName(r.p1.v))} is trained and imported.</p>`;
      if (!r.useFresh) return `<p class="mini">Your veteran is Parent 1: nothing to train. ${r.setup === "A" ? "Switch step 2 to a new parent to train one." : ""}</p>`;
      const tr = r.train, ss = tr.ss, f = tr.f;
      const keep = tr.agenda.filter((x) => !x.free);
      const rows = tr.races.agenda.concat(tr.races.goals || []).sort((x, y) => x.turn - y.turn).map(x => {
        const on = x.free || x.rank < ss.n;
        const why = x.free ? "Career goal" : x.with && x.with.length ? `Shared +${3 * x.with.length}` : `Rentals often won it (${x.pop || 0})`;
        return `<tr${on ? "" : ' class="cmp-cut"'}><td>${x.turn}<div class="mini">${esc(ctx.turnText(x.turn))}</div></td><td>${esc(x.name)}</td><td class="mini">${why}${on ? "" : " · skip: keeps SS"}</td></tr>`;
      }).join("");
      const sims = ss.rows.map(x => `<tr><td>${x.n}</td>${x.stats.map(v => `<td>${v}</td>`).join("")}<td>${x.sp}</td><td>${fmtN(x.rating)}</td><td>${x.hit}/${x.of}</td></tr>`).join("");
      // Top to bottom in the order it's worked out: her deck → her races at SS → what to set in
      // Independent Training → the sparks to aim for → set her up.
      const deckLine = tr.deck.source === "yours" ? "your deck from ③ (Find my best deck)" : "a quick build from your cards; build your own in ③ below, then Find again to plan with it";
      return `<ol class="cmp-order">
        <li><b>Her Ace-parent deck</b> <span class="mini">(${deckLine})</span>: ${tr.deck.cards.map((x) => esc(cardName(x.id)) + (x.borrowed ? " (borrow)" : "")).join(", ")}.</li>
        <li><b>${esc(tName(f.t))} at SS with ${plural(keep.length, "extra G1")}</b> with that deck: as many as keep her at SS, your veteran's G1s first (each one shared adds affinity). <span class="mini">${ssText(ss)}</span>
          <details data-cmp-open="races"><summary class="mini">Her race plan and the SS check</summary>
          <div class="table-wrap"><table class="plan cmp-races"><thead><tr><th>Turn</th><th>Race</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table></div>
          <div class="table-wrap"><table class="plan pp-cost"><thead><tr><th>Extra</th>${F.STAT_LABELS.map(l => `<th>${l.slice(0, 3)}</th>`).join("")}<th>SP</th><th>Rating</th><th>SS</th></tr></thead><tbody>${sims}</tbody></table></div>
          <p class="mini">16 careers each, with known blue start bonuses · about ${fmtN(ss.perRace)} rating per extra race.</p></details></li>
        <li>${itHTML(r)}</li>
        <li>${aimHTML(r)}</li>
      </ol>
        ${stepsHTML(r)}
        ${sentThere(r) ? ctx.trainingHTML() : ""}`;
    }
    // What to set in Independent Training: Training Focus, the 10 prioritized skills, the agenda.
    function itHTML(r) {
      const tr = r.train, f = tr.f, fo = tr.focus;
      const cards = tr.deck.cards.map((x) => D.card(x.id)).filter(Boolean);
      const from = (id) => cards.map((cd) => (cd.es || []).map(String).includes(id) ? cd.n + " (event)" : (cd.hs || []).map(String).includes(id) ? cd.n + " (hint)" : "").filter(Boolean);
      const list = CP.itSkills(r.x, f.offers || tr.deck.offers, 10);
      const skills = list.map((k) => {
        const src = from(k.id).concat(k.gold && k.id !== k.white ? from(k.white) : []);
        return `<li><b>${esc(ctx.skillName(k.id))}</b>${k.gold ? " (gold)" : ""} <span class="mini">${k.gamble ? "· no card of hers gives it: only if a random event offers it" : `· ${Math.round(k.p * 100)}% offered · ${esc([...new Set(src)].join(", ") || "her deck")}`}</span></li>`;
      }).join("");
      const races = tr.agenda.filter((x) => !x.free).map((x) => x.name);
      const anySS = fo && fo.rows.some((y) => y.hit > 0);
      const focus = fo ? `<p><b>Training Focus: ${fo.best.label}</b> <span class="mini">· ${fo.rows.map((y) => `${y.label} ${anySS ? `SS ${y.hit}/${y.of}, ` : ""}rating ~${fmtN(y.rating)}, ${y.over.toFixed(1)} stats over 1,100`).join(" · ")} (16 careers each, before inheritance). Stamina and Sprint lean slightly to Stamina and to Power; how much is an estimate, so a close call can go either way.</span></p>` : "";
      return `<div class="cmp-it"><h4>Independent Training settings</h4><p class="mini">For this deck and these ${plural(races.length, "extra G1")}.</p>${focus}
        <p class="mini"><b>Prioritized skills</b>, in this order (the game takes 10; it targets their hints in event choices):</p><ol class="mini">${skills || "<li>None of the race's whites come from her deck.</li>"}</ol>
        <p class="mini"><b>Agenda:</b> ${races.length ? races.map(esc).join(", ") : "her career goals only"}.</p></div>`;
    }

    // The sparks to aim for on the parent you train. Blue's stat and pink's aptitude are picked at
    // random (blue: any stat; pink: one of her A/S aptitudes, equal chances), so only whites,
    // her unique and the stars can be steered (uma.guide, Prydwen, GameTora).
    function aimHTML(r) {
      const f = r.train.f, t = f.t, ss = r.train.ss, row = ss.rows.find((y) => y.n === ss.n) || ss.rows[0];
      const apt = t.apt || [], good = (g) => g === "A" || g === "S";
      const tops = F.APT_LABELS.filter((_, i) => good(apt[i]));
      const need = CP.want(r.x).pink.find((p) => p.target === "S") || CP.want(r.x).pink[0];
      let pink;
      if (!need) pink = "the ace needs none for this race.";
      else if (good(apt[need.i])) pink = `<b>${need.label}</b> for the ace (to ${need.target}). Hers lands on one of her A/S aptitudes at random (${tops.join(", ")}): about 1 in ${tops.length} for ${need.label}. Inherited pinks that lift another aptitude to A lower that.`;
      else pink = `<b>${need.label}</b> for the ace, but she has ${need.label} ${apt[need.i] || "?"}: her pink can only land there if her parents' pinks lift it to A (it picks among her A/S aptitudes).`;
      const pct = (v) => (v > 1100 ? 10 : v >= 600 ? 5 : 0);
      const stats = row ? F.STAT_LABELS.map((l, i) => `${l} ${row.stats[i]} (${pct(row.stats[i])}%)`).join(", ") : "";
      const uid = CP.inherited(t), uL = uid && r.x.raceL ? r.x.raceL[uid] || 0 : 0;
      const whites = f.extra && f.extra.whites ? f.extra.whites.list.slice(0, 8).map((w) => esc(ctx.skillName(w.id))).join(", ") : "";
      return `<div class="cmp-aim"><h4>Sparks to aim for on ${esc(tName(t))}</h4><ul class="mini">
        <li><b>Whites</b> (the ones you control): learn ${whites || "the race's skills"}. A learned skill becomes a spark about 20% of the time, 40% if you learn its gold version; at SS they come out 1★/2★/3★ 20/70/10%.</li>
        <li><b>Green:</b> her unique ${uL >= 0.1 ? `is worth about ${uL.toFixed(2)} L here, so it counts for the ace` : "is weak on this race; it won't count much"}.</li>
        <li><b>Pink:</b> ${pink}</li>
        <li><b>Blue:</b> the stat is random, so you can't pick it; its stars depend on that stat (3★: 5% from 600, 10% over 1,100). Push as many stats past 1,100 as SS allows. Her predicted run: ${stats}.</li>
      </ul></div>`;
    }

    // Is she set up below (for this ace and cup)?
    function sentThere(r) {
      const f = ctx.training(), c = st();
      return !!(f && f.cup === c.cup && +f.tid === +r.t.id && +f.parent === +r.train.f.t.id && f.setup === trainingKey(r));
    }
    const trainingKey = r => JSON.stringify([r.train.f.t.id, r.train.f.parents.map(v => [v.id, v.rental || null]), "SS", r.train.agenda.map(x => x.name)]);
    function stepsHTML(r) {
      const ready = sentThere(r);
      return `<div class="row-wrap cmp-steps"><button type="button" class="btn small" data-cmp-send="who">${ready ? "Set her up again" : "Set her up to train"}</button><span class="mini">${ready ? "She's set up below: ① her, ② her races, ③ her deck, ④ the skills to buy, and the coach." : "Sets her up below: ① her, ② her races, ③ her deck, ④ the skills to buy."}</span></div>`;
    }

    // ④ The Parent 2 search for the ace.
    function p2HTML(c, a, d, r) {
      if (!r || !r.p1) return `<p class="mini">Find Parent 1 first.</p>`;
      const p1 = r.useFresh ? r.train.f.t : trainee(r.p1.v.tid), l = parent2Search(r, d.rental);
      const given = l.given ? l.given.map((v, i) => v >= 1 && r.gaps && r.gaps[i] ? `${F.STAT_LABELS[i]} ~+${fmtN(v)}` : "").filter(Boolean) : [];
      const note = r.gaps && given.length ? `<p class="mini">${r.trained ? "Her real family" : "Her family so far"} covers ${given.join(", ")} of the gaps; ${l.remaining && l.remaining.some((v) => v > 0) ? `Parent 2's blue goes to <b>${F.STAT_LABELS[l.blue[0].i]}</b> (~${fmtN(l.remaining[l.blue[0].i])} still short)` : "no gap is left, so blue goes to her key stat"}.</p>` : "";
      return note + searchHTML("Parent 2 search", l, "ace", d.rental, tName(trainee(a.tid)) + ", with " + (p1 ? tName(p1) : "Parent 1") + " as Parent 1");
    }

    // ⑤ The ace's family affinity: the minimum, or what's missing.
    function checkHTML(r) {
      if (!r || !r.p1) return `<p class="mini">Find Parent 1 first.</p>`;
      const y = r.p1.aff, miss = MIN_AFFINITY - y.total, fam = y.family;
      const label = { p1: "Parent 1", g11: "her parent", g12: "her other parent", p2: "Parent 2", g21: "Parent 2's parent", g22: "Parent 2's other parent" };
      const rows = ["p1", "g11", "g12", "p2", "g21", "g22"].filter((k) => fam[k]).map((k) => `<tr><td>${label[k]}</td><td>${esc(ctx.charName(fam[k].cid))}${fam[k].known ? "" : ' <span class="mini">(to borrow: best affinity)</span>'}</td><td class="num">${fam[k].wins.length}</td></tr>`).join("");
      const head = miss <= 0 ? `<p class="ok"><b>✓ About ${y.total} ${y.symbol}</b>: ${MIN_AFFINITY}+ for the ace's family once you borrow.</p>`
        : `<p class="warn"><b>About ${y.total} ${y.symbol}: ${miss} short of ${MIN_AFFINITY}.</b> About ${Math.ceil(miss / 3)} more shared G1 wins (+3 for each pair that both won one), or rentals with more affinity with her.</p>`;
      return head + `<p class="mini">${y.filled.length ? `Known now: ${y.known}. The rest assumes the best-affinity characters for the slots you borrow, each with the G1s rentals most often win; uma.moe's affinity sort shows the real number.` : "Every member is known."}</p>
        <details data-cmp-open="check"><summary class="mini">The family it counts</summary><div class="table-wrap"><table class="plan"><thead><tr><th>Slot</th><th>Character</th><th class="num">G1 wins</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
    }

    function importHTML() {
      const v = ctx.veterans(), n = v.list.length, owned = Object.keys(ctx.owned()).length;
      return `<details class="panel cmp-import" id="cm-import"${n ? "" : " open"}><summary><b>Your umaextractor export</b> · ${n ? `${plural(n, "veteran")} imported ${esc(v.at || "")}` : "not imported yet"} · ${plural(owned, "card")} in My cards · ${plural(ctx.myUmas().size, "uma")} in My umas</summary>
        <p class="mini">Import your veterans, umas and cards. Import again any time; your cards' limit breaks never go down.</p>
        <textarea class="fp-vets" id="cmpVetsText" rows="3" placeholder="Paste the umaextractor JSON here"></textarea>
        <div class="row-wrap"><button type="button" class="btn small" id="cmpImport">Import</button><label class="btn ghost small">Pick the file<input type="file" accept=".json,application/json" id="cmpVetsFile" hidden></label></div>
      </details>`;
    }

    function howHTML() {
      const pct = Math.round(root.UmaCmPlan.SS_SHARE * 100);
      return `<details class="panel"><summary><b>How this works</b></summary><ul class="mini">
        <li><b>Gaps:</b> CM &amp; decks' prediction (16 careers, before inheritance) against your targets, or the race build's where you left one blank.</li>
        <li><b>Blue sparks:</b> each of the 6 family members gives +5/+12/+21 (1★/2★/3★) at the start, and each blue can fire at both inspirations (early April, Classic and Senior) at 70/80/90% × (1 + that uma's affinity/100) for +1–10/1–16/1–28. Grandparents fire half as often (an estimate; no exact factor is known).</li>
        <li><b>Pink:</b> the family's stars raise an aptitude at the start (1–3★ +1 grade, 4–6★ +2, 7–9★ +3, 10+ +4), never past A. A to S only happens when a pink fires at an inspiration (1/3/5% × affinity). Your rule: S distance; S surface for a sprint; style up to A.</li>
        <li><b>Whites:</b> the race's skills her deck doesn't already give. A parent you train turns a learned skill into a spark about 20% of the time (40% with its gold), +2.5% per copy her parents and grandparents carry; at SS, sparks come out 1★/2★/3★ 20/70/10%.</li>
        <li><b>Parent 1:</b> any of My umas, trained from your best veteran for her and a borrowed grandparent, ranked by what she gives the ace. Families under ${MIN_AFFINITY} affinity aren't suggested. Each G1 two family members both won adds +3.</li>
        <li><b>Her races:</b> career goals, then G1s her veteran won, then G1s rentals often won, at B aptitude or better, as many as keep ${pct}% of runs at SS: from your veterans' ratings in the scenario you train in (or the simulation when you have too few).</li>
        <li><b>uma.moe searches:</b> the affinity target and the other parent (her G1 wins) make uma.moe's affinity sort count the whole family. Blue asks for one stat, her biggest gap: 3★ on the rental and 7–9★ across her and her parents. Pink follows your rule, 3★+ across her line. Every listed white goes in as a preferred white (P0 first), which ranks rentals without removing any; the ones you tick are required (any number). Both parents' characters are left out.</li>
      </ul></details>`;
    }

    // After an import: if the parent you planned is in it, plan again with her as Parent 1.
    function afterImport() {
      const c = st(), a = current(c), d = a && deckOf(c, a), prefs = d && freshOf(d);
      const r = a && found.get(keyOf(c, a));
      if (prefs && prefs.setup === "B" && prefs.useTrained !== false && d.cards && d.cards.length && !(r && r.trained) && CP.trainedParent(prefs.plan, ctx.veterans().list)) { ctx.gotoParents("p1"); findParents(); }
      else ctx.rerender();
    }

    // ---------- events ----------
    function jump(key) {
      if (["who", "races", "parent-deck", "rating"].includes(key)) { ctx.gotoParents(key === "parent-deck" ? "deck" : key); return; }
      ctx.gotoParents(key === "cup" ? "import" : key);
    }
    function click(e) {
      const t = e.target, c = st(), a = current(c);
      const jumpTo = t.closest("[data-cmp-jump]");
      if (jumpTo) { jump(jumpTo.dataset.cmpJump); return true; }
      if (t.closest("#cmpParents")) { findParents(); return true; }
      const tr = t.closest("[data-cmp-trained]");
      if (tr && a) { freshOf(deckOf(c, a)).useTrained = tr.dataset.cmpTrained === "yes"; ctx.save(); findParents(); return true; }
      const choose = t.closest("[data-cmp-p1]");
      if (choose && a) {
        const r = found.get(keyOf(c, a)), [kind, id] = choose.dataset.cmpP1.split("|");
        if (r) { const p1 = kind === "fresh" ? r.fresh.find(x => +x.t.id === +id) : r.vets.find(x => String(x.v.id) === id); if (p1) { if (kind === "fresh") freshOf(deckOf(c, a)).tid = p1.t.id; ctx.planFamily(p1, null, true); findParents(); } }
        return true;
      }
      if (t.closest("#cmpImport")) {
        const ta = document.getElementById("cmpVetsText");
        if (!ta || !ta.value.trim()) { ctx.flash("Paste the JSON first."); return true; }
        ctx.importVeterans(ta.value);
        afterImport();
        return true;
      }
      if (t.closest("#cmpTeam")) { c.byCup[c.cup] = ctx.pullTeam(cup(c)).filter((m) => ctx.myUmas().has(+m.tid)).slice(0, MAX_ACES); editAce = null; ctx.save(); ctx.rerender(); return true; }
      if (t.closest("#cmpAddAce")) { editAce = aces(c).length; ctx.rerender(); return true; }
      if (t.closest("#cmpAceDone")) { editAce = null; ctx.rerender(); return true; }
      let el;
      if ((el = t.closest("[data-cmp-edit]"))) { editAce = editAce === +el.dataset.cmpEdit ? null : +el.dataset.cmpEdit; ctx.rerender(); return true; }
      if ((el = t.closest("[data-cmp-ace-remove]"))) { aces(c).splice(+el.dataset.cmpAceRemove, 1); editAce = null; ctx.save(); ctx.rerender(); return true; }
      if ((el = t.closest("[data-cmp-sel]"))) { c.sel[c.cup] = +el.dataset.cmpSel; ctx.save(); ctx.rerender(); return true; }
      if (t.closest("[data-cmp-key-save]")) { const k = document.querySelector("[data-cmp-key]"); if (k && k.value.trim()) { setKey(k.value.trim()); ctx.flash("Key saved in this browser."); } ctx.rerender(); return true; }
      if (t.closest("[data-cmp-key-forget]")) { setKey(""); ctx.rerender(); return true; }
      const lk = t.closest("[data-cmp-gp-lookup]");
      if (lk && a) { const box = document.querySelector(`[data-cmp-gp-trainer="${lk.dataset.cmpGp}"]`); lookupGp(c, a, lk.dataset.cmpGp, box && box.value); return true; }
      const gpEl = t.closest("[data-cmp-gp]");
      if (gpEl && a && (t.closest("[data-cmp-gp-use]") || t.closest("[data-cmp-gp-clear]") || t.closest("[data-cmp-gp-white-del]"))) {
        const prefs = freshOf(deckOf(c, a)), tid = gpEl.dataset.cmpGp, pick = prefs.picks[tid] = prefs.picks[tid] || {};
        if (t.closest("[data-cmp-gp-white-del]") && pick.gp) { const id = t.closest("[data-cmp-gp-white-del]").dataset.cmpGpWhiteDel; pick.gp.white = pick.gp.white.filter((w) => String(w[0]) !== id); ctx.save(); ctx.rerender(); return true; }
        if (t.closest("[data-cmp-gp-clear]")) delete pick.gp;
        prefs.tid = +tid; ctx.save(); findParents(); return true;
      }
      const req = t.closest("[data-cmp-require]");
      if (req && a) {
        const prefs = req.dataset.cmpRentalScope === "training" ? freshOf(deckOf(c, a)).rental : deckOf(c, a).rental;
        const box = req.closest("fieldset");
        prefs.required = req.dataset.cmpRequire === "all" ? [...box.querySelectorAll("[data-cmp-rental-white]")].map((x) => x.dataset.cmpRentalWhite) : [];
        ctx.save(); ctx.rerender(); return true;
      }
      const send = t.closest("[data-cmp-send]");
      if (send && a) {
        const r = found.get(keyOf(c, a));
        if (!r || !r.train) return true;
        const f = r.train.f;
        ctx.trainParent({ setup: trainingKey(r), cup: c.cup, style: r.style, rank: "SS", ace: { cid: r.t.cid, tid: r.t.id }, p1: { cid: f.t.cid, tid: f.t.id }, parents: f.parents, cards: r.train.deck.cards, races: r.train.agenda.filter((x) => !x.free).map((x) => x.name), wins: f.f.p1.wins.slice(), must: f.extra.whites.list.slice(0, 5).map((x) => x.id) }, send.dataset.cmpSend);
        return true;
      }
      return false;
    }
    function change(e) {
      const t = e.target, c = st(), ds = t.dataset, a = current(c);
      if (t.id === "cmpCup") { c.cup = t.value; editAce = null; ctx.save(); ctx.rerender(); return true; }
      if (t.id === "cmpVetsFile") {
        const file = t.files && t.files[0];
        if (file) { const fr = new root.FileReader(); fr.onload = () => { ctx.importVeterans(String(fr.result)); afterImport(); }; fr.readAsText(file); }
        return true;
      }
      if (ds.cmpAce != null) {
        const list = aces(c), i = +ds.cmpAce, tid = t.value ? +t.value : null;
        if (!tid) list.splice(i, 1);
        else if (list.some((x, j) => j !== i && trainee(x.tid).cid === trainee(tid).cid)) { ctx.flash("She's already on the team."); ctx.rerender(); return true; }
        else { list[i] = { tid, style: bestStyle(trainee(tid)) }; c.sel[c.cup] = tid; editAce = null; }
        c.byCup[c.cup] = list.filter(Boolean);
        ctx.save(); ctx.rerender();
        return true;
      }
      if (a && ds.cmpSetup != null) { freshOf(deckOf(c, a)).setup = t.value; ctx.save(); findParents(); return true; }
      if (a && ds.cmpGp != null && (ds.cmpGpField != null || ds.cmpGpWhite != null || ds.cmpGpWhiteStars != null || ds.cmpGpWin != null)) {
        const prefs = freshOf(deckOf(c, a)), pick = prefs.picks[ds.cmpGp] = prefs.picks[ds.cmpGp] || {};
        if (ds.cmpGpField === "tid") { if (!t.value) delete pick.gp; else pick.gp = Object.assign({ blue: [0, 0], pink: [0, 0], green: 0, white: [], wins: [] }, pick.gp || {}, { tid: +t.value }); }
        else if (pick.gp) {
          const gp = pick.gp, v = +t.value;
          if (ds.cmpGpField === "blue0") gp.blue[0] = v; else if (ds.cmpGpField === "blue1") gp.blue[1] = v;
          else if (ds.cmpGpField === "pink0") gp.pink[0] = v; else if (ds.cmpGpField === "pink1") gp.pink[1] = v;
          else if (ds.cmpGpField === "green") gp.green = v;
          else if (ds.cmpGpWhiteStars != null) gp.whiteStars = v;
          else if (ds.cmpGpWhite != null && t.value) gp.white = gp.white.filter((w) => String(w[0]) !== t.value).concat([[+t.value, gp.whiteStars || 1]]);
          else if (ds.cmpGpWin != null) gp.wins = t.checked ? [...new Set(gp.wins.concat(ds.cmpGpWin))] : gp.wins.filter((n) => n !== ds.cmpGpWin);
        }
        ctx.save(); ctx.rerender(); return true;
      }
      if (a && ds.cmpTrainingVet != null) {
        const prefs = freshOf(deckOf(c, a)), tid = ds.cmpTrainingVet;
        prefs.tid = +tid; prefs.picks[tid] = prefs.picks[tid] || {};
        prefs.picks[tid].veteran = t.value;
        ctx.save(); findParents(); return true;
      }
      if (a && ds.cmpRental != null) { (ds.cmpRentalScope === "training" ? freshOf(deckOf(c, a)).rental : deckOf(c, a).rental)[ds.cmpRental] = t.value; ctx.save(); ctx.rerender(); return true; }
      if (a && ds.cmpRentalWhite != null) {
        const prefs = ds.cmpRentalScope === "training" ? freshOf(deckOf(c, a)).rental : deckOf(c, a).rental, have = new Set(prefs.required || []);
        if (t.checked) have.add(ds.cmpRentalWhite); else have.delete(ds.cmpRentalWhite);
        prefs.required = [...have]; ctx.save(); ctx.rerender(); return true;
      }
      if (t.id === "cmpVetsText" || ds.cmpKey != null || ds.cmpGpTrainer != null) return true;
      return false;
    }

    return { teamHTML, renderParents, click, change, st, refreshStatus: () => {} };
  }

  const api = { create, PLAN_RACES, MIN_AFFINITY };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaCmTab = api;
})(typeof window !== "undefined" ? window : globalThis);
