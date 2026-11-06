// The CM/LoH planner tab: one section from the cup to the ace's parents. Pick the cup and up to
// three aces, then work on one at a time: ① search her racing deck from your cards (as CM &
// decks builds it) and change it by hand (makeup, friend card, skill weight, must-have skills,
// lock, swap, leave out); ② find her parents for the deck as it stands: Parent 1 from your
// veterans (or, when none is good enough, a fresh one to train, with her own parents from your
// veterans or a rental and the G1s to win, as many as keep her at S or SS) and the uma.moe search for Parent 2.
// Logic: cm-plan.js; keeps state.cmp (the aces, and each ace's deck and settings, by cup).
(function (root) {
  "use strict";
  const STYLES = [["Nige", "Front"], ["Senkou", "Pace"], ["Sasi", "Late"], ["Oikomi", "End"]];
  const STYLE_LABEL = Object.fromEntries(STYLES);
  const MAX_ACES = 3, SWAP_TOP = 8;
  const STATS = ["speed", "stamina", "power", "guts", "wit"];
  // A fresh parent's deck is first built for this many G1s (Race Bonus counts for them), before
  // her race plan is known.
  const PLAN_RACES = 10;
  const RANK = "GFEDCBAS";
  const TYPE_LABEL = { speed: "Speed", stamina: "Stamina", power: "Power", guts: "Guts", wit: "Wit", friend: "Friend", group: "Group" };
  const fmt = (v) => v.toFixed(2);
  const fmtN = (v) => Math.round(v).toLocaleString("en-US");
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const signed = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±") + fmtN(Math.abs(v));

  function create(ctx) {
    const { D, P, A, F, PR, T, esc } = ctx;
    const CP = root.UmaCmPlan.create({ A, F, skills: ctx.SB.DATA.skills, trainees: D.DATA.trainees, chars: ctx.chars(), saddles: ctx.saddles, SS: PR.SS, today: ctx.today });
    let job = null;             // a search in progress: { stage, f }
    const views = new Map();    // each ace's deck as it stands, described: { sig, … }
    const found = new Map();    // each ace's parents, with the deck they were found for
    const sims = new Map();     // each ace's simulated deck: { sig, stats, sp }
    let swap = null;            // the slot whose "Change" list is open: { k, i }
    let editAce = null;         // the chip being edited, or the new ace's index
    const opened = {};          // boxes you opened or closed (deck settings, rentals): kept across redraws
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
      if (c.parentRank == null) c.parentRank = c.ssMust === false ? "" : "SS";
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
    // Her deck and its settings (from CM & decks' at first): makeup, friend card, skill weight,
    // must-have skills, cards left out, and the deck itself (each card: locked or not).
    function deckOf(c, a) {
      const k = keyOf(c, a);
      if (!c.decks[k]) { const d = ctx.deckDefaults(); c.decks[k] = { comp: d.comp, borrow: d.borrow, skillW: d.skillW, must: [], exclude: [], targets: d.targets || {}, rankGoal: d.rankGoal || "", cards: null, searched: null }; }
      const d = c.decks[k], defaults = ctx.deckDefaults();
      Object.entries({ comp: {}, borrow: defaults.borrow, skillW: defaults.skillW, must: [], exclude: [], locked: [], cards: null }).forEach(([k, v]) => { if (d[k] == null) d[k] = v; });
      if (!c.decks[k].targets) c.decks[k].targets = {};
      if (!c.decks[k].rental) c.decks[k].rental = { pink: "auto", blue: "auto", sort: "affinity", quality: "recommended", required: [], version: 3 };
      const prefs = c.decks[k].rental;
      if (!prefs.version) { prefs.sort = "affinity"; prefs.required = [...new Set(prefs.required || [])].slice(0, 2); }
      // v3: pink follows your rule by default (S distance; S surface for a sprint).
      if ((prefs.version || 0) < 3) { if (prefs.pink === "none") prefs.pink = "auto"; prefs.version = 3; }
      return c.decks[k];
    }
    // The deck with your limit breaks now (a friend's card is always LB4).
    const cardsNow = (d) => (d.cards || []).map((x) => Object.assign({}, x, { lb: x.borrowed ? 4 : ctx.owned()[x.id] != null ? +ctx.owned()[x.id] : x.lb }));
    // What the deck builder works with: the settings, these cards kept (locked).
    // The stats you're aiming for ({ stat: value }, the ones you set), null for none.
    const targetsOf = (d) => { const t = {}; STATS.forEach((x) => { if (d.targets[x] > 0) t[x] = +d.targets[x]; }); return Object.keys(t).length ? t : null; };
    const settings = (d, keep) => ({ comp: d.comp, borrow: d.borrow, skillW: d.skillW, must: d.must, exclude: d.exclude, targets: targetsOf(d), rankGoal: d.rankGoal || "",
      locked: [...new Set((d.locked || []).concat(keep.filter((x) => !x.borrowed).map((x) => x.id)))], friend: (keep.find((x) => x.borrowed) || {}).id || null });
    function freshOf(d) {
      if (!d.fresh) d.fresh = { parentMode: "rental", picks: {}, rental: { pink: "auto", blue: "auto", quality: "recommended", sort: "affinity", required: [], version: 3 } };
      d.fresh.picks = d.fresh.picks || {};
      const r = d.fresh.rental || (d.fresh.rental = {});
      if ((r.version || 0) < 3) { if (!r.pink || r.pink === "none") r.pink = "auto"; r.version = 3; }
      return d.fresh;
    }
    const inputsKey = (c) => JSON.stringify([c.parentRank, ctx.veterans().at, ctx.veterans().list.length, [...ctx.myUmas()].sort(), ctx.rentals(), ctx.family(), current(c) && freshOf(deckOf(c, current(c)))]);

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

    // ---------- ① her deck ----------
    // The deck as it stands, described (each card's score with the other five fixed, the next
    // best for its slot, the race skills it offers), or null until the data is in.
    function view(c, a) {
      const d = deckOf(c, a);
      if (!d.cards) return null;
      const p = cup(c), style = styleOf(a), cards = cardsNow(d);
      const sig = JSON.stringify([p.id, a.tid, style, cards.map((x) => [x.id, x.lb, !!x.borrowed]), d.skillW, d.must, d.comp, d.borrow, d.exclude, d.targets, d.rankGoal, ctx.settingsKey(), ctx.scenario().id, ctx.ownedCode()]);
      const k = keyOf(c, a), had = views.get(k);
      if (had && had.sig === sig) { had.cards.forEach((x, i) => { x.locked = !!cards[i].locked; }); return had; }
      if (!ctx.euReady() || !ctx.aceSkills({ preset: p, style })) return null;
      const setup = ctx.deckSetup(p, style, a.tid, null, settings(d, cards));
      const desc = cards.length ? T.describeDeck(setup.opts, cards.map((x) => ({ id: x.id, lb: x.lb, borrowed: !!x.borrowed })), setup.pool, setup.bp) : { cards: [], skills: [] };
      const v = { sig, setup, result: desc, cards: desc.cards.map((x, i) => Object.assign({}, x, { locked: !!cards[i].locked })), skills: desc.skills || [], offers: cards.length ? T.deckOffers(setup.opts, cards) : {}, total: desc.cards.reduce((n, x) => n + x.score, 0) };
      views.set(k, v);
      return v;
    }
    // One search: quick build, optional targets/rank, prediction, then her parents.
    async function searchDeck(fill) {
      const c = st(), p = cup(c), a = current(c);
      if (!a) { ctx.flash("Pick an ace first."); return; }
      await busy("Loading the card data…", async () => {
        await ready(p);
        const d = deckOf(c, a), now = cardsNow(d), keep = fill ? now : now.filter((x) => x.locked);
        await stage(fill ? "Filling the empty slot…" : "Searching her deck…", 0.05);
        const r = ctx.deck(p, styleOf(a), a.tid, null, settings(d, keep));
        const lockedIds = new Set((d.locked || []).concat(now.filter((x) => x.locked).map((x) => x.id)));
        d.cards = r.cards.map((x) => ({ id: x.id, lb: x.lb, borrowed: !!x.borrowed, locked: lockedIds.has(x.id) }));
        let fit = null;
        if (!fill && (targetsOf(d) || d.rankGoal)) {
          const cards = cardsNow(d);
          const search = ctx.targetSearch(p, styleOf(a), a.tid, settings(d, cards.filter((x) => x.locked)), cards);
          let more = true;
          while (more) {
            const t0 = Date.now();
            while (more && Date.now() - t0 < 150) more = search.next();
            await stage("Checking your targets and rank…", 0.1 + 0.5 * search.progress());
          }
          await stage("Checking the best decks…", 0.65);
          fit = search.result();
          d.cards = fit.cards.map((x) => ({ id: x.id, lb: x.lb, borrowed: !!x.borrowed, locked: lockedIds.has(x.id) }));
        }
        swap = null;
        const v = view(c, a);
        if (!fill && v) d.searched = v.total;
        ctx.save();
        await stage("Predicting her stats…", 0.7);
        await predict(c, a, fit);
        if (!fill && v) await saveParents(c, p, a, v);
      });
    }

    async function predict(c, a, fit) {
      const d = deckOf(c, a), v = view(c, a), k = keyOf(c, a);
      if (!v || !d.cards.length) { sims.delete(k); ctx.deckChanged(cup(c), a, d, v, null); return; }
      await tick();
      const r = ctx.simulateRace(cup(c), styleOf(a), a.tid, cardsNow(d), d.must, targetsOf(d), d.rankGoal);
      if (fit) { r.before = { stats: fit.before.stats, short: fit.before.short }; r.swaps = fit.swaps; r.fit = fit; }
      sims.set(k, Object.assign(r, { sig: v.sig }));
      ctx.deckChanged(cup(c), a, d, v, r);
    }

    function refreshPrediction(c, a) {
      return busy("Predicting her stats…", async () => {
        await ready(cup(c));
        await predict(c, a);
        ctx.save();
      });
    }

    // The cards that could go in slot i, best first: { id, lb, score, gain } (gain over hers).
    function swapOptions(c, a, i) {
      const v = view(c, a), d = deckOf(c, a);
      if (!v) return [];
      const now = cardsNow(d), cur = now[i], rest = now.filter((_, j) => j !== i).map((x) => ({ id: x.id, lb: x.lb, borrowed: !!x.borrowed }));
      const from = (cur.borrowed ? v.setup.bp : v.setup.pool).filter((x) => x.id !== cur.id);
      const by = {};
      from.forEach((x) => { const ty = D.card(x.id).ty; (by[ty] = by[ty] || []).push(x); });
      const mine = T.rank(v.setup.opts, D.card(cur.id).ty, rest, [{ id: cur.id, lb: cur.lb }])[0];
      const base = mine ? mine.score : 0, out = [];
      Object.keys(by).forEach((ty) => T.rank(v.setup.opts, ty, rest, by[ty]).forEach((r) => out.push({ id: r.id, lb: r.lb, score: r.score, gain: r.score - base })));
      return out.sort((x, y) => y.score - x.score);
    }
    function setCard(c, a, i, id) {
      const d = deckOf(c, a), cur = d.cards[i];
      if (!cur) return;
      const owned = ctx.owned();
      d.cards[i] = { id, lb: cur.borrowed ? 4 : owned[id] != null ? +owned[id] : 4, borrowed: !!cur.borrowed, locked: true };
      d.locked = [...new Set(d.locked.filter((x) => x !== cur.id).concat(id))];
      swap = null;
      ctx.save();
    }
    // The makeup the deck breaks, in words, or "".
    function makeupNote(d) {
      const n = {};
      cardsNow(d).forEach((x) => { const ty = D.card(x.id).ty; n[ty] = (n[ty] || 0) + 1; });
      const off = Object.keys(d.comp || {}).filter((ty) => (n[ty] || 0) !== d.comp[ty]);
      return off.length && (d.cards || []).length === 6 ? `Not the makeup you set: ${off.map((ty) => `${n[ty] || 0} ${TYPE_LABEL[ty]} (you set ${d.comp[ty]})`).join(", ")}.` : "";
    }

    // ---------- ② her parents ----------
    async function findParents() {
      const c = st(), p = cup(c), a = current(c);
      if (!a) { ctx.flash("Pick an ace first."); return; }
      const d = deckOf(c, a);
      if (!d.cards || !d.cards.length) { ctx.flash("Search deck finds them too."); return; }
      await busy("Loading the card data…", async () => {
        await ready(p);
        const v = view(c, a);
        if (!v) throw new Error("The race's skill values didn't load. Try again.");
        await saveParents(c, p, a, v);
      });
    }
    async function saveParents(c, p, a, v) {
      const r = await planParents(c, p, a, v);
      found.set(keyOf(c, a), Object.assign(r, { sig: v.sig, inputs: inputsKey(c) }));
      deckOf(c, a).parentSummary = r.p1 ? { tid: r.useFresh ? r.p1.t.id : r.p1.v.tid, fresh: r.useFresh } : null;
      ctx.save();
    }
    async function planParents(c, p, a, v) {
      const t = trainee(a.tid), who = tName(t), style = styleOf(a);
      const rel = ctx.aceSkills({ preset: p, style });
      if (!rel) throw new Error("The race's skill values didn't load. Try again.");
      const vetsAll = ctx.veterans().list, umas = [...ctx.myUmas()];
      const x = CP.context({ ace: { cid: t.cid, tid: t.id }, race: { preset: p, style }, rel, offers: v.offers, build: ctx.build(p) });
      await stage(`${who}: Parent 1 from your veterans…`, 0.78);
      const vets = CP.rankVets(x, vetsAll);
      await stage(`${who}: would a fresh Parent 1 do better?`, 0.82);
      const pdeck = ctx.deck(p, style, null, PLAN_RACES);
      const prefs = freshOf(deckOf(c, a));
      const fresh = CP.rankFresh(x, vetsAll, umas, pdeck.offers, { parentMode: prefs.parentMode, picks: prefs.picks, rentals: ctx.rentals() });
      let useFresh = CP.freshWins(vets[0], fresh[0]), chosenVet = vets[0], chosenFresh = fresh.find(f => +f.t.id === +prefs.tid) || fresh[0];
      const family = ctx.family(), selected = family.p1;
      if (selected && selected.cid && !selected.planned) {
        const actual = selected.manual || selected.green || selected.blue[1] || selected.pink[1] || selected.white.length;
        if (selected.fresh && !selected.manual) {
          chosenFresh = fresh.find(z => z.t.id === selected.tid) || chosenFresh;
          useFresh = !!chosenFresh;
        } else if (selected.manual || actual && selected.vet == null) {
          chosenVet = CP.rankVets(x, [{ id: "manual", cid: selected.cid, tid: selected.tid, self: selected, parents: [family.g11, family.g12] }])[0] || chosenVet;
          useFresh = false;
        } else if (selected.vet != null) {
          chosenVet = vets.find(z => z.v.id === selected.vet) || chosenVet;
          useFresh = false;
        } else {
          chosenFresh = fresh.find(z => z.t.id === selected.tid) || chosenFresh;
          useFresh = !!chosenFresh;
        }
      }
      let train = null;
      if (chosenFresh) {
        let f = chosenFresh;
        const races = CP.racePlan(f, vetsAll);
        const her = ctx.deck(p, style, f.t.id, races.extraRaces);
        f = Object.assign({}, f, { offers: her.offers });
        await stage(`${who}: planning ${tName(f.t)}'s races…`, 0.9);
        const blueStart = CP.trainingStart(x, f);
        const ss = await ssCut(p, style, f.t, her.cards, races.extraRaces, c.parentRank, vetsAll, blueStart);
        chosenFresh = f = CP.atRaceCount(x, f, races, ss.n);
        const at = fresh.findIndex(y => y.t.id === f.t.id); if (at !== -1) fresh[at] = f;
        if (!(selected && selected.cid && !selected.planned)) useFresh = CP.freshWins(chosenVet, f);
        train = { f, races, deck: her, ss, agenda: CP.upTo(races, ss.n) };
      }
      const p1 = useFresh ? chosenFresh : chosenVet || null;
      if (p1 && !(p1.kind === "vet" && p1.v.id === "manual")) ctx.planFamily(p1, useFresh ? train : null, selected && selected.cid && !selected.planned);
      return { a, style, t, x, vets: vets.slice(0, 6), fresh: fresh.slice(0, 4), useFresh, train, p1, link: p1 ? linkFor(x, t, p1, useFresh ? train : null) : null };
    }

    // The most extra races (her plan's order) that keep her at the selected rank. Your veterans in the scenario
    // you train in that ran next to no extra races give the ratings you really reach; the
    // simulation (her deck, Independent Training, 16 careers) gives what each race costs her; a
    // count keeps her at the rank when SS_SHARE of those ratings, less that cost, still reach it.
    // Too few such veterans: the simulation alone (it leaves out inheritance, so it runs low).
    // Without a rating minimum, every planned race.
    async function ssCut(p, style, t, cards, max, rank, vets, blueStart) {
      const rate = ctx.spRate(p, style, t.apt), uniq = PR.uniqueBonus(t.r, t.r), share = root.UmaCmPlan.SS_SHARE;
      const minimum = rank ? PR.rankThreshold(rank) : 0;
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
      if (!rank) cut = Object.assign(cut, { n: max, none: false, loose: true });
      await sim(cut.n);
      return Object.assign(cut, { rank, perRace, rows: [...memo.values()].sort((a, b) => a.n - b.n), simScen: sc, blueStart });
    }

    // The uma.moe search for Parent 2 with this Parent 1.
    function linkFor(x, t, p1, train, prefs) {
      const saddles = CP.saddlesOf(train ? train.f : p1);
      return CP.rentalSearch(x, p1, Object.assign({}, prefs || {}, { saddles }));
    }

    // ---------- drawing ----------
    function render(body) {
      const c = st();
      aces(c);
      ctx.sync();
      c.open = c.open || { cup: true, deck: true, parents: true };
      const a = current(c), p = cup(c), d = a ? deckOf(c, a) : null;
      const section = (key, label, note, html) => `<details class="panel cmp-section" id="cm-${key}" data-cmp-section="${key}"${c.open[key] ? " open" : ""}><summary><h2>${label}</h2><span class="mini">${esc(note)}</span></summary><div class="cmp-section-body">${html}</div></details>`;
      const prog = job ? `<div class="row-wrap" role="status"><span class="progress"><i style="width:${Math.round(job.f * 100)}%"></i></span><span class="mini">${esc(job.stage)}</span></div>` : "";
      body.innerHTML = `<div class="cmp">
        <nav class="cmp-progress" id="cmpProgress" aria-label="CM/LoH progress">${progressHTML(c)}</nav>
        ${section("cup", "Cup & aces", p.name + (a ? " · " + tName(trainee(a.tid)) : " · Pick an ace"), setupHTML(c) + importHTML())}
        ${section("deck", "Her deck", d && d.cards ? `${d.cards.length}/6 cards${d.searched != null ? " · score " + fmtN(d.searched) : ""}` : "Search her racing deck", a ? `<div data-deck-host="cm">${deckHTML(c, a, p)}${ctx.moreDeckTools(p, a, d)}</div>` : '<p class="mini">Pick an ace above.</p>')}
        ${section("parents", "Her parents", parentNote(c, a), a ? parentsHTML(c, a, p) + `<details class="cmp-family-tools" id="cm-family" data-cmp-open="family-tools"${opened["family-tools"] ? " open" : ""}><summary>Family tools · enter and compare a family</summary>${ctx.familyHTML()}</details>` : '<p class="mini">Pick an ace above.</p>')}
        ${section("training", "Train her", ctx.trainingStatus(), parentRankHTML(c) + ctx.trainingHTML())}
        ${prog}${howHTML()}
      </div>`;
      if (job) body.querySelectorAll("button, select, input, textarea").forEach((el) => { el.disabled = true; });
      body.querySelectorAll("details[data-cmp-open]").forEach((el) => {
        if (opened[el.dataset.cmpOpen] != null) el.open = opened[el.dataset.cmpOpen];
        el.addEventListener("toggle", () => { if (el.isConnected) opened[el.dataset.cmpOpen] = el.open; });
      });
      body.querySelectorAll("details[data-cmp-section]").forEach((el) => el.addEventListener("toggle", () => { if (el.isConnected) { c.open[el.dataset.cmpSection] = el.open; ctx.save(); } }));
    }

    function parentNote(c, a) {
      const r = a && deckOf(c, a).parentSummary;
      return r ? `${r.fresh ? "Train " : "Parent 1: "}${tName(trainee(r.tid))}` : "Find Parent 1 and a rental";
    }
    function parentRankHTML(c) {
      return `<label class="field"><span>Her rating (parent you train)</span><select id="cmpParentRank">${[["SS", "SS (17,500)"], ["S", "S (14,500)"], ["", "No minimum"]].map(([v, l]) => `<option value="${v}"${c.parentRank === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>`;
    }
    function progressHTML(c) {
      const a = current(c), p = cup(c), d = a ? deckOf(c, a) : null, f = d && d.family || {}, summary = d && d.parentSummary, v = a && view(c, a);
      const name = (m) => m && m.tid && trainee(m.tid) ? trainee(m.tid).n : "Choose";
      return [["cup", "Cup", p.name], ["cup", "Ace", a ? trainee(a.tid).n + " · " + STYLE_LABEL[styleOf(a)] : "Choose"],
        ["deck", "Deck", d && d.cards ? `${d.cards.length === 6 ? "Done" : d.cards.length + "/6"}${v ? " · " + fmtN(v.total) : ""}` : "Search"],
        ["p1", "Parent 1", f.p1 && f.p1.tid ? name(f.p1) : summary ? `${summary.fresh ? "Train " : ""}${name(summary)}` : "Find"],
        ["p2", "Parent 2", f.p2 && f.p2.tid ? name(f.p2) : "Find a rental"], ["training", "Training", ctx.trainingStatus()]]
        .map(([key, label, text]) => `<button type="button" class="cmp-progress-item" data-cmp-jump="${key}" title="${esc(text)}"><span>${label}</span><b>${esc(text)}</b></button>`).join("");
    }
    function refreshStatus() {
      const el = document.getElementById("cmpProgress");
      if (el) el.innerHTML = progressHTML(st());
    }
    function jump(key) {
      if (["who", "races", "parent-deck", "rating"].includes(key)) { ctx.gotoParents(key === "parent-deck" ? "deck" : key); return; }
      const id = key === "p1" || key === "p2" ? "cmp-" + key : "cm-" + key;
      const el = document.getElementById(id) || document.getElementById("cm-parents");
      if (!el) return;
      let p = el;
      while (p && p.id !== "tabBody") { if (p.tagName === "DETAILS") p.open = true; p = p.parentElement; }
      el.scrollIntoView({ block: "start", behavior: "smooth" });
    }

    function importHTML() {
      const v = ctx.veterans(), n = v.list.length, owned = Object.keys(ctx.owned()).length;
      return `<section class="panel"><details class="cmp-import"${n ? "" : " open"}><summary><b>Your umaextractor export</b> · ${n ? `${plural(n, "veteran")} imported ${esc(v.at || "")}` : "not imported yet"} · ${plural(owned, "card")} in My cards · ${plural(ctx.myUmas().size, "uma")} in My umas</summary>
        <p class="mini">Import your veterans, umas and cards from umaextractor.</p>
        <textarea class="fp-vets" id="cmpVetsText" rows="3" placeholder="Paste the umaextractor JSON here"></textarea>
        <div class="row-wrap"><button type="button" class="btn small" id="cmpImport">Import</button><label class="btn ghost small">Pick the file<input type="file" accept=".json,application/json" id="cmpVetsFile" hidden></label></div>
      </details></section>`;
    }

    function setupHTML(c) {
      const p = cup(c), list = aces(c), selected = current(c);
      const mine = [...ctx.myUmas()].map(trainee).filter(Boolean).sort((a, b) => a.n.localeCompare(b.n) || a.t.localeCompare(b.t));
      const groups = [["Now and next on Global", P.list.filter(x => x.kind === "cm" && x.global.end >= ctx.today && !x.global.est)], ["Later Champions Meetings · estimated", P.list.filter(x => x.kind === "cm" && x.global.est)], ["League of Heroes · estimated", P.list.filter(x => x.kind === "loh")], ["Past Global cups", P.list.filter(x => x.kind === "cm" && x.global.end < ctx.today).reverse()]];
      const cupOpts = groups.filter(([, xs]) => xs.length).map(([label, xs]) => `<optgroup label="${label}">${xs.map(x => `<option value="${x.id}"${x.id === c.cup ? " selected" : ""}>${esc(ctx.cupLabel(x))}</option>`).join("")}</optgroup>`).join("");
      const chips = list.map((a, i) => `<div class="chip cmp-ace-chip${selected && a.tid === selected.tid ? " active" : ""}">
        <button type="button" class="linkish cmp-ace-name" data-cmp-sel="${a.tid}" aria-pressed="${!!selected && a.tid === selected.tid}">${esc(tName(trainee(a.tid)))} · ${STYLE_LABEL[styleOf(a)]}</button>
        <button type="button" class="linkish" data-cmp-edit="${i}" aria-label="Edit ${esc(tName(trainee(a.tid)))}" aria-expanded="${editAce === i}">Edit</button>
        <button type="button" class="linkish" data-cmp-ace-remove="${i}" aria-label="Remove ${esc(tName(trainee(a.tid)))}">✕</button></div>`).join("");
      let editor = "";
      if (editAce != null && editAce <= list.length) {
        const a = list[editAce], t = trainee(a && a.tid);
        editor = `<div class="row-wrap cmp-ace-pick"><label class="field grow"><span>${t ? "Ace" : "Add an ace"}</span><select data-cmp-ace="${editAce}"><option value="">Pick an uma…</option>${mine.map((m) => `<option value="${m.id}"${t && m.id === t.id ? " selected" : ""}>${esc(m.n + " [" + m.t + "]")}</option>`).join("")}</select></label>
          ${t ? `<label class="field"><span>Running style</span><select data-cmp-style="${editAce}">${STYLES.map(([k, l], i) => `<option value="${k}"${styleOf(a) === k ? " selected" : ""}>${l} (${t.apt[6 + i]})</option>`).join("")}</select></label>` : ""}
          <button type="button" class="btn ghost small" id="cmpAceDone">Done</button></div>`;
      }
      const team = ctx.pullTeam(p).filter((m) => ctx.myUmas().has(+m.tid));
      return `<section class="panel"><div class="row-wrap">
        <label class="field grow"><span>The cup</span><select id="cmpCup">${cupOpts}</select></label></div>
        ${ctx.cupFacts(p)}
        <div class="row-wrap cmp-chips" aria-label="Your aces">${chips}${list.length < MAX_ACES ? `<button type="button" class="btn ghost small" id="cmpAddAce"${mine.length ? "" : " disabled"}>+ Add an ace</button>` : ""}</div>${editor}
        ${!mine.length ? `<p class="mini">Import your export above, or tick My umas in the Trainees tab.</p>` : ""}
        ${team.length ? `<button type="button" class="linkish" id="cmpTeam">Use my Pull planner team</button>` : ""}
      </section>`;
    }

    function deckHTML(c, a, p) {
      const d = deckOf(c, a), v = view(c, a), k = keyOf(c, a);
      const opt = (pairs, val) => pairs.map(([x, l]) => `<option value="${x}"${String(val) === String(x) ? " selected" : ""}>${esc(l)}</option>`).join("");
      const comp = `<div class="comp"><span class="mini"><b>Deck makeup</b></span>
        <div class="comp-row">${ctx.compTypes.map(([ty, l]) => `<label class="field comp-f ty-${ty}"><span><i class="tydot"></i>${l}</span><select data-cmp-comp="${ty}"><option value="">Any</option>${[0, 1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}"${d.comp[ty] === n ? " selected" : ""}>${n}</option>`).join("")}</select></label>`).join("")}</div></div>`;
      const skills = ctx.mustSkills(d);
      const must = `<div class="row-wrap"><label class="field grow"><span>Must-have skills</span><select data-cmp-must-add><option value="">Add a skill…</option>${skills.filter((x) => d.must.indexOf(String(x.id)) === -1).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></label></div>
        ${d.must.length ? `<div class="row-wrap">${d.must.map((id) => `<span class="chip">${esc(ctx.skillName(id))} <button type="button" class="linkish" data-cmp-must-del="${id}" aria-label="Remove">✕</button></span>`).join("")}</div>` : ""}`;
      const out = d.exclude.length ? `<p class="mini">Left out of her searches: ${d.exclude.map((id) => `<span class="chip">${esc(cardName(id))} <button type="button" class="linkish" data-cmp-unexclude="${id}" aria-label="Allow again">✕</button></span>`).join(" ")}</p>` : "";
      const opts = `<details class="cmp-deckset" data-cmp-open="set"${(opened.set != null ? opened.set : !d.cards) ? " open" : ""}><summary class="mini"><b>Deck settings</b> · ${Object.keys(d.comp).length ? Object.keys(d.comp).map((ty) => `${d.comp[ty]} ${TYPE_LABEL[ty]}`).join(", ") : "any makeup"} · ${d.borrow ? "a friend's card" : "no friend's card"}${d.must.length ? ` · ${plural(d.must.length, "must-have")}` : ""}</summary>
        ${comp}
        <div class="row-wrap"><label class="chip-toggle"><input type="checkbox" data-cm="ownedOnly"${d.ownedOnly !== false ? " checked" : ""}> Only cards I own</label><label class="chip-toggle"><input type="checkbox" data-cmp-borrow${d.borrow ? " checked" : ""}> Borrow 1 card from a friend</label>
          <label class="field"><span>Skill hints count</span><select data-cmp-skillw>${opt(ctx.skillWeights, d.skillW)}</select></label></div>
        ${must}${ctx.lockHTML(d)}</details>`;
      const run = `<div class="row-wrap"><button type="button" class="btn" id="cmpDeck"${job ? " disabled" : ""}>Search deck</button><span class="mini">${d.cards && d.cards.some((x) => x.locked) ? "Keeps your locked cards." : "From My cards at your limit breaks."}</span></div>`;
      const aim = targetsHTML(c, a, p, d);
      if (!d.cards) return opts + aim + run + out;
      if (!v) return opts + aim + run + `<p class="mini">Loading the card data…</p>`;
      const slots = v.cards.map((x, i) => {
        const card = D.card(x.id), open = swap && swap.k === k && swap.i === i;
        return `<li class="cmp-slot${x.locked ? " locked" : ""}"><div class="cmp-slot-main"><b>${esc(cardName(x.id))}</b> <span class="mini">${TYPE_LABEL[card.ty] || card.ty} · LB${x.lb}${x.borrowed ? " · a friend's card" : ""} · score ${fmtN(x.score)}${x.alt ? ` · next best ${esc(cardName(x.alt.id))} ${fmtN(x.alt.score)}` : ""}</span></div>
          <div class="row-wrap cmp-slot-acts"><button type="button" class="btn ghost small" data-cmp-lock="${i}" aria-pressed="${!!x.locked}">${x.locked ? "🔒 Locked" : "Lock"}</button><button type="button" class="btn ghost small" data-cmp-swap="${i}" aria-expanded="${!!open}">Change</button><button type="button" class="btn ghost small" data-cmp-remove="${i}" title="Take it out and leave it out of her searches">Leave out</button></div>
          ${open ? swapHTML(c, a, i) : ""}</li>`;
      }).join("");
      const empty = 6 - v.cards.length;
      const emptyRows = empty > 0 ? `<li class="cmp-slot empty"><span class="mini">${plural(empty, "empty slot")}</span> <button type="button" class="btn small" data-cmp-fill>Fill ${empty === 1 ? "it" : "them"}</button> <span class="mini">(keeps the other cards)</span></li>` : "";
      const offers = v.skills.slice(0, 6).map((s) => `${esc(ctx.skillName(s.id))} ${Math.round(s.p * 100)}%`).join(", ");
      const diff = d.searched != null && v.cards.length === 6 && Math.abs(v.total - d.searched) >= 0.5 ? ` (${signed(v.total - d.searched)} against the deck the search found)` : "";
      const note = makeupNote(d);
      const sim = sims.get(k), simOk = sim && sim.sig === v.sig;
      return opts + aim + run + `<ol class="cmp-deck">${slots}${emptyRows}</ol>
        <p class="mini"><b>Deck score ${fmtN(v.total)}</b>${diff}.${note ? ` <span class="warn">${esc(note)}</span>` : ""}</p>
        ${offers ? `<p class="mini">Best race skills: ${offers}.</p>` : ""}
        ${out}
        ${simOk ? predictedHTML(sim, p, d) : ""}`;
    }

    // The stats you're aiming for: blank boxes show (and use) the race build's targets.
    function targetsHTML(c, a, p, d) {
      const bt = ctx.buildTarget(p), coach = ctx.coachTargets();
      return `<div class="cmp-targets"><span class="mini"><b>Stats you're aiming for</b> · blank uses the build target.</span>
        <div class="tg-row">${STATS.map((x, i) => `<label class="field"><span>${F.STAT_LABELS[i]}</span><input type="number" inputmode="numeric" min="0" max="2500" step="50" data-cmp-target="${x}" value="${d.targets[x] > 0 ? d.targets[x] : ""}" placeholder="${bt[x]}"></label>`).join("")}<label class="field"><span>Rank</span><select data-cmp-rank>${[["", "None"], ["S", "S"], ["SS", "SS"]].map(([v, l]) => `<option value="${v}"${(d.rankGoal || "") === v ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>
        ${coach || targetsOf(d) ? `<div class="row-wrap">${coach ? `<button type="button" class="btn ghost small" id="cmpTgCoach">Use the turn coach's targets</button>` : ""}${targetsOf(d) ? `<button type="button" class="btn ghost small" id="cmpTgClear">Clear targets</button>` : ""}</div>` : ""}</div>`;
    }
    // Predicted stats against the targets (the race build's where you left one blank).
    function predictedHTML(sim, p, d) {
      const bt = ctx.buildTarget(p), mine = targetsOf(d) || {};
      const tg = (x) => Math.min(sim.caps ? sim.caps[x] : Infinity, sim.target && sim.target[x] != null ? sim.target[x] : mine[x] != null ? mine[x] : bt[x]);
      let short = 0;
      const rows = STATS.map((x, i) => {
        const t = tg(x), have = sim.stats[i], gap = have - t;
        if (gap < 0) short -= gap;
        return `<tr><td>${F.STAT_LABELS[i]}</td><td class="num">${t}${mine[x] == null ? '<span class="mini"> build</span>' : ""}</td>${sim.before ? `<td class="num">${sim.before.stats[i]}</td>` : ""}<td class="num"><b>${have}</b></td><td class="num ${gap < 0 ? "warn" : ""}">${gap < 0 ? "−" + fmtN(-gap) + " short" : "+" + fmtN(gap)}</td></tr>`;
      }).join("");
      const swaps = sim.swaps && sim.swaps.length ? `<p class="mini">Changes: ${sim.swaps.map((w) => `${esc(cardName(w.out))} → <b>${esc(cardName(w.in))}</b>`).join(", ")}.</p>` : "";
      return `<div class="table-wrap"><table class="plan cmp-pred"><thead><tr><th>Stat</th><th class="num">Target</th>${sim.before ? '<th class="num">Before</th>' : ""}<th class="num">Predicted</th><th class="num"></th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="mini"><b>Predicted rating: about ${fmtN(sim.rating)} (${PR.rankOf(sim.rating).label})</b>${sim.rank ? ` · <b>${sim.rank} in ${sim.hit} of ${sim.of}</b>` : ""} · ${fmtN(sim.sp)} SP · ${fmtN(short)} stats short · ${sim.of} careers in ${esc(sim.scenario)}, before inheritance${sim.cards < 6 ? ` · ${sim.cards} cards` : ""}.</p>${swaps}`;
    }

    function swapHTML(c, a, i) {
      const opts = swapOptions(c, a, i);
      if (!opts.length) return `<p class="mini">No other card fits this slot.</p>`;
      const top = opts.slice(0, SWAP_TOP), all = opts.slice().sort((x, y) => cardName(x.id).localeCompare(cardName(y.id)));
      return `<div class="cmp-swap"><p class="mini">Best here with the other five as they are (score change):</p>
        <div class="row-wrap">${top.map((o) => `<button type="button" class="chip" data-cmp-put="${i}|${o.id}">${esc(cardName(o.id))} <span class="mini">${TYPE_LABEL[D.card(o.id).ty]} · LB${o.lb} · ${signed(o.gain)}</span></button>`).join("")}</div>
        <label class="field"><span>Or any card${deckOf(c, a).cards[i].borrowed ? " a friend could lend" : " you own"}</span><select data-cmp-pick="${i}"><option value="">Pick a card…</option>${all.map((o) => `<option value="${o.id}">${esc(cardName(o.id))} · ${TYPE_LABEL[D.card(o.id).ty]} · ${signed(o.gain)}</option>`).join("")}</select></label>
        <p class="mini">A card you put in by hand is locked, so the next search keeps it.</p></div>`;
    }

    function parentsHTML(c, a, p) {
      const k = keyOf(c, a), r = found.get(k), v = view(c, a), d = deckOf(c, a);
      const has = d.cards && d.cards.length;
      const stale = r && ((v && r.sig !== v.sig) || r.inputs !== inputsKey(c));
      const btn = `<div class="row-wrap"><button type="button" class="btn" id="cmpParents"${job || !has ? " disabled" : ""}>${r ? "Find them again" : "Find her parents"}</button><span class="mini">${has ? "For her deck as it is above." : "Search deck finds them too."}</span>${stale ? `<span class="mini warn">The plan changed; find them again.</span>` : ""}</div>`;
      if (!r) return btn;
      return btn + `<div id="cmp-p1"><h4 class="cmp-sub">Parent 1</h4>${p1HTML(r)}</div>
        <div id="cmp-p2"><h4 class="cmp-sub">Parent 2: a friend's rental</h4>${p2HTML(r, c, a)}</div>
        ${r.train ? `<details class="cmp-train" data-cmp-open="train"${(opened.train != null ? opened.train : r.useFresh) ? " open" : ""}><summary><b>${r.useFresh ? "Train her: " : "A fresh Parent 1, if you train one anyway: "}${esc(tName(r.train.f.t))}</b> · ${plural(r.train.ss.n, "extra race")}${r.train.ss.none ? ` (short of ${r.train.ss.rank})` : ""}</summary>${trainHTML(r, p)}</details>` : ""}`;
    }

    const sparks = (m) => [m.blue && m.blue[1] ? `${F.STAT_LABELS[m.blue[0]]} ${m.blue[1]}★` : "", m.pink && m.pink[1] ? `${F.APT_LABELS[m.pink[0]]} ${m.pink[1]}★` : "", m.green ? `green ${m.green}★` : "", m.white && m.white.length ? plural(m.white.length, "white") : "", m.wins && m.wins.length ? `${m.wins.length} G1` : ""].filter(Boolean).join(" · ");
    const vetName = (v) => tName(trainee(v.tid)) || ctx.charName(v.cid);
    const topSkills = (s, slots) => s.white.filter((w) => !slots || slots.indexOf(w.slot) !== -1).sort((a, b) => b.p * b.worth - a.p * a.worth).slice(0, 3).map((w) => esc(ctx.skillName(w.id))).join(", ");

    function famLine(s) { return `family score <b>${fmt(s.value)}</b> · affinity <b>${s.total} ${s.symbol}</b>`; }

    function p1HTML(r) {
      const pick = r.p1;
      let out;
      if (!pick) out = `<p class="mini">Import more veterans to find Parent 1.</p>`;
      else if (r.useFresh) out = `<p><b>Train ${esc(tName(pick.t))}</b> · parents ${pick.parents.map((v) => esc(vetName(v))).concat(pick.parentMode === "rental" && !pick.rental ? ["a rental to find"] : []).join(" + ")} · expected ${famLine(Object.assign({}, pick.s, { value: pick.value }))}.</p>`;
      else out = `<p><b>${pick.v.id === "manual" ? "Your parent" : "Your veteran"} ${esc(vetName(pick.v))}</b>${pick.v.score ? ` · rating ${fmtN(pick.v.score)}` : ""} · ${sparks(pick.v.self)} · ${famLine(pick.s)}.</p>`;
      const other = r.vets.concat(r.fresh).filter((x) => x !== pick).sort((a, b) => b.value - a.value);
      if (other.length) out += `<details><summary class="mini">Other options (${other.length})</summary><div class="table-wrap"><table class="plan"><thead><tr><th>Parent 1</th><th class="num">Family</th><th class="num">Affinity</th><th></th></tr></thead><tbody>${other.map((x) => {
        const fresh = x.kind === "fresh";
        const ps = fresh ? x.parents.map(vetName).concat(x.parentMode === "rental" && !x.rental ? ["a rental to find"] : []) : x.v.parents.filter(Boolean).map((m) => ctx.charName(m.cid));
        return `<tr><td>${fresh ? "Train " : "Veteran: "}<b>${esc(fresh ? tName(x.t) : vetName(x.v))}</b>${ps.length ? `<div class="mini">Parents: ${ps.map(esc).join(" + ")}</div>` : ""}</td><td class="num">${fresh ? "~" : ""}${fmt(x.value)}</td><td class="num">${x.s.total} ${x.s.symbol}</td><td><button type="button" class="linkish" data-cmp-p1="${fresh ? "fresh|" + x.t.id : "vet|" + x.v.id}">Use</button></td></tr>`;
      }).join("")}</tbody></table></div></details>`;
      return out;
    }

    function p2HTML(r, c, a) {
      if (!r.p1) return `<p class="mini">Pick Parent 1 first.</p>`;
      const prefs = deckOf(c, a).rental;
      const l = linkFor(r.x, r.t, r.p1, r.useFresh ? r.train : null, prefs), p1 = r.p1;
      const rents = CP.rankRentals(r.x, p1, ctx.rentals());
      return `<p><a class="btn small" href="${esc(l.url)}" target="_blank" rel="noopener">Search uma.moe for her Parent 2</a></p>
        ${filterSummaryHTML(l)}
        ${rentalSettingsHTML(l, r, prefs)}
        <details class="cmp-rent" data-cmp-open="rent"${(opened.rent != null ? opened.rent : rents.length > 0) ? " open" : ""}><summary class="mini"><b>Paste rentals from uma.moe</b> · ${ctx.rentals().length ? `${ctx.rentals().length} pasted` : "none yet"}</summary>
          <p class="mini">Paste whole uma.moe parent cards to rank them with Parent 1.</p>
          <textarea class="fp-vets" data-cmp-rent-text rows="3" placeholder="Paste uma.moe parent cards here"></textarea>
          <div class="row-wrap"><button type="button" class="btn small" data-cmp-rent-add>Add</button>${ctx.rentals().length ? `<button type="button" class="btn ghost small" data-cmp-rent-clear>Remove all</button>` : ""}</div>
          ${rents.length ? `<div class="table-wrap"><table class="plan"><thead><tr><th>Rental (and her parents)</th><th>Friend</th><th class="num">Family</th><th class="num">Affinity</th><th></th></tr></thead><tbody>${rents.slice(0, 10).map((x) => `<tr><td>${esc(x.r.names[0])} <span class="mini">+ ${esc(x.r.names[1] || "")} + ${esc(x.r.names[2] || "")}</span><div class="mini">${sparks(x.r.parent)}${topSkills(x.s, ["p2", "g21", "g22"]) ? ` · best sparks: ${topSkills(x.s, ["p2", "g21", "g22"])}` : ""}</div></td><td>${esc(x.r.trainer)}<div class="mini">${esc(x.r.friend.replace(/(\d{3})(?=\d)/g, "$1 "))}</div></td><td class="num">${fmt(x.value)}</td><td class="num">${x.s.total} ${x.s.symbol}</td><td><button type="button" class="linkish" data-cmp-rent-use="${esc(x.r.friend)}">Use</button></td></tr>`).join("")}</tbody></table></div>` : ""}
          ${rents.hidden && rents.hidden.length ? `<p class="mini">Not shown (the game wouldn't allow them here): ${rents.hidden.map((h) => `${esc(h.r.trainer)}'s ${esc(h.r.names[0])} (${esc(h.why)})`).join("; ")}.</p>` : ""}
        </details>`;
    }

    function filterSummaryHTML(l) {
      return `<p class="mini cmp-filters">${CP.searchSummary(l, ctx.skillName).map(esc).join(" · ")}.</p>`;
    }
    function rentalSettingsHTML(l, r, prefs, scope = "ace") {
      const attr = `data-cmp-rental-scope="${scope}"`, key = "rental-settings-" + scope;
      const selected = new Set(l.required);
      const options = (rows, value) => rows.map(([v, label]) => `<option value="${v}"${String(v) === String(value) ? " selected" : ""}>${esc(label)}</option>`).join("");
      return `<details class="cmp-rental-settings" data-cmp-open="${key}"${opened[key] ? " open" : ""}><summary><b>Full uma.moe settings</b></summary>
        <div class="row-wrap">
          <label class="field"><span>Blue stat</span><select data-cmp-rental="blue" ${attr}>${options([["auto", "Auto (" + l.blue[0].label + ")"], ...F.STAT_LABELS.map((v, i) => [i, v])], prefs.blue == null ? "auto" : prefs.blue)}</select></label>
          <label class="field"><span>Search width</span><select data-cmp-rental="quality" ${attr}>${options([["recommended", "Own 3★ · lineage 7–9★"], ["broad", "Wider: own 2–3★ · lineage 6–9★"]], l.broad ? "broad" : "recommended")}</select></label>
          <label class="field"><span>Pink focus</span><select data-cmp-rental="pink" ${attr}>${options([["auto", "Your rule" + (l.auto ? " (" + l.auto.label + " → " + l.auto.target + ")" : ": none needed")], ["none", "Off"], ...l.choices.map(p => [p.i, p.label + " · lineage 3★+"])], l.mode)}</select></label>
          <label class="field"><span>Sort</span><select data-cmp-rental="sort" ${attr}>${options([["affinity", "Affinity first"], ["whites", "Whites first"]], l.sort)}</select></label>
        </div>
        <fieldset class="cmp-required"><legend class="mini">Required whites · choose up to two (all checked must be in the rental branch)</legend><div class="row-wrap">${l.whites.map(w => `<label class="chip-toggle small"><input type="checkbox" data-cmp-rental-white="${w.id}" ${attr}${selected.has(w.id) ? " checked" : ""}>${esc(ctx.skillName(w.id))}</label>`).join("") || '<span class="mini">No missing race whites.</span>'}</div></fieldset>
        <p class="mini">Affinity first leaves the listed whites out of the filters. Whites first uses P0, then P1, then P2 before affinity. Pink needs no stars on the rental herself. Rank, support, scenario, counts, other star totals and the race calendar stay open; the legacy's G1 wins are affinity context.</p>
        ${l.focused.length ? `<details><summary class="mini">Focus an inherited unique</summary>${l.focused.map(g => `<p><a href="${esc(g.search.url)}" target="_blank" rel="noopener">${esc(ctx.skillName(g.skill.id))} · ${g.skill.owners.map(t => esc(tName(t))).join(" / ")}</a></p>${filterSummaryHTML(g.search)}`).join("")}</details>` : ""}
      </details>`;
    }

    function trainingRentalHTML(r, prefs) {
      const f = r.train.f, l = CP.trainingRentalSearch(r.x, f, prefs.rental), vets = ctx.veterans().list.filter(v => +v.cid !== +f.t.cid);
      const pick = prefs.picks[f.t.id] || {}, selected = f.rental && f.rental.friend;
      const rows = CP.rankTrainingRentals(r.x, f, ctx.rentals(), { vets: ctx.veterans().list, maxRaces: r.train.ss.n });
      return `<div class="cmp-training-rental"><h4>Borrowed parent for the parent you're training</h4>
        <label class="field"><span>${esc(tName(f.t))}'s veteran parent</span><select data-cmp-training-vet="${f.t.id}"><option value="">Best veteran (${esc(vetName(f.parents[0]))})</option>${vets.map(v => `<option value="${v.id}"${String(pick.veteran) === String(v.id) ? " selected" : ""}>${esc(vetName(v))} · ${sparks(v.self)}</option>`).join("")}</select></label>
        <p><a class="btn small" data-cmp-training-link href="${esc(l.url)}" target="_blank" rel="noopener">Search uma.moe for her borrowed parent</a></p>
        ${filterSummaryHTML(l)}${rentalSettingsHTML(l, r, prefs.rental, "training")}
        <p class="mini">${selected ? `Using ${esc(f.rental.names[0])}.` : "Choose a rental below."} Her own sparks help the ace as a grandparent; her full lineage helps ${esc(f.t.n)}. Scores add both parts. Blue start stats count toward her targets and SS; aim for 1,100 in her blue stat.</p>
        <details class="cmp-rent" data-cmp-open="training-rent"${opened["training-rent"] || rows.length ? " open" : ""}><summary class="mini">Paste and rank rentals for ${esc(f.t.n)} · ${ctx.rentals().length} pasted</summary>
          <textarea class="fp-vets" data-cmp-rent-text rows="3" placeholder="Paste whole uma.moe parent cards here"></textarea>
          <div class="row-wrap"><button type="button" class="btn small" data-cmp-rent-add>Add</button>${selected ? `<button type="button" class="btn ghost small" data-cmp-training-clear>Choose later</button>` : ""}</div>
          ${rows.length ? `<div class="table-wrap"><table class="plan cmp-training-scores"><thead><tr><th>Rental</th><th class="num">For ace</th><th class="num">For parent</th><th class="num">Total</th><th></th></tr></thead><tbody>${rows.map(y => `<tr><td><b>${esc(y.r.names[0])}</b><div class="mini">${esc(y.r.trainer)} · ${esc(y.r.friend)}${selected === y.r.friend ? " · selected" : ""}</div><div class="mini">${y.trainingPart.start.map((n, i) => n ? `${F.STAT_LABELS[i]} +${n}` : "").filter(Boolean).join(", ")} start stats · ${fmt(y.trainingPart.hints)} expected white hints for her career</div></td><td class="num">${fmt(y.acePart.value)}</td><td class="num">${fmt(y.trainingPart.value)}</td><td class="num"><b>${fmt(y.value)}</b></td><td><button type="button" class="linkish" data-cmp-training-use="${esc(y.r.friend)}">${selected === y.r.friend ? "Using" : "Use"}</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="mini">Paste rentals to compare both generations.</p>'}
          ${rows.hidden.length ? `<p class="mini">Not allowed: ${rows.hidden.map(y => `${esc(y.r.names[0])} (${esc(y.why)})`).join("; ")}.</p>` : ""}
          <p class="mini">The paste does not identify which grandparent holds each remaining star, so that split is estimated. G1 wins come from the rental's own race sparks; some wins may be missing.</p>
        </details></div>`;
    }

    // Where her race count comes from, in words.
    function ssText(ss) {
      const pct = Math.round(root.UmaCmPlan.SS_SHARE * 100);
      if (ss.loose) return "No rating minimum: keep every race she can fit.";
      if (ss.from === "veterans") return `${ss.n} extra races keep ${ss.ss} of ${ss.of} reference runs at ${ss.rank} (${pct}% needed, ${esc(ss.scen.name)})${ss.none ? `; even no extra races fall short of ${pct}%` : ""}.`;
      const row = ss.rows.find((x) => x.n === ss.n);
      return `Simulation: ${ss.rank} in ${row.hit} of ${row.of} with ${ss.n} extra races (${pct}% needed)${ss.none ? "; short even with no extras" : ""}.`;
    }
    function trainHTML(r) {
      const tr = r.train, ss = tr.ss, c = st(), a = current(c), prefs = freshOf(deckOf(c, a));
      const parentChoice = `<label class="field"><span>Her parents</span><select data-cmp-parent-mode><option value="rental"${prefs.parentMode !== "veterans" ? " selected" : ""}>One of my veterans + a rental</option><option value="veterans"${prefs.parentMode === "veterans" ? " selected" : ""}>Two of my veterans</option></select></label>`;
      const rows = tr.races.agenda.concat(tr.races.goals || []).sort((a, b) => a.turn - b.turn).map(x => {
        const keep = x.free || x.rank < ss.n;
        const why = x.free ? "Goal" : x.with && x.with.length ? `Shared +${3 * x.with.length}` : `Rental overlap (${x.pop || 0})`;
        return `<tr${keep ? "" : ' class="cmp-cut"'}><td>${x.turn}<div class="mini">${esc(ctx.turnText(x.turn))}</div></td><td>${esc(x.name)}</td><td class="mini">${why}${keep ? "" : ` · skip: ${ss.rank}`}</td></tr>`;
      }).join("");
      const sims = ss.rows.map(x => `<tr><td>${x.n}</td>${x.stats.map(v => `<td>${v}</td>`).join("")}<td>${x.sp}</td><td>${fmtN(x.rating)}</td><td>${x.hit}/${x.of}</td></tr>`).join("");
      const blue = ss.blueStart.map((n, i) => n ? `${F.STAT_LABELS[i]} +${n}` : "").filter(Boolean).join(", ");
      const l = prefs.parentMode !== "veterans" ? CP.trainingRentalSearch(r.x, tr.f, prefs.rental) : null;
      const row = ss.rows.find(x => x.n === ss.n), blueIndex = l ? l.blue[0].i : CP.want(r.x).blue[0].i;
      return `${parentChoice}${prefs.parentMode !== "veterans" ? trainingRentalHTML(r, prefs) : ""}<p class="mini">${ssText(ss)}</p>
        <p class="mini">Known blue start bonuses: ${blue || "none"}. ${F.STAT_LABELS[blueIndex]}: ${row.stats[blueIndex]} predicted · aim for 1,100+ for her own 3★ blue chance.</p>${stepsHTML(r)}<details><summary class="mini">Race plan and reference predictions</summary>
        <div class="table-wrap"><table class="plan cmp-races"><thead><tr><th>Turn</th><th>Race</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="table-wrap"><table class="plan pp-cost"><thead><tr><th>Extra</th>${F.STAT_LABELS.map(l => `<th>${l.slice(0, 3)}</th>`).join("")}<th>SP</th><th>Rating</th><th>${ss.rank || "No minimum"}</th></tr></thead><tbody>${sims}</tbody></table></div>
        <p class="mini">16 careers each, with known blue start bonuses; later inspiration rolls omitted · about ${fmtN(ss.perRace)} rating per extra race.</p></details>`;
    }

    // Is she already set up in the Parents tab (sent from here for this ace and cup)?
    function sentThere(r) {
      const f = ctx.training(), c = st();
      return !!(f && f.cup === c.cup && +f.tid === +r.t.id && +f.parent === +r.train.f.t.id && f.setup === trainingKey(r));
    }
    const trainingKey = r => JSON.stringify([r.train.f.t.id, r.train.f.parents.map(v => [v.id, v.rental || null]), st().parentRank, r.train.agenda.map(x => x.name)]);
    // The Parents tab's steps for her, one click each (the first one sets her up there).
    function stepsHTML(r) {
      const ready = sentThere(r);
      const step = (key, label) => `<button type="button" class="btn ${key === "family" ? "small" : "ghost small"}" data-cmp-send="${key}">${label}</button>`;
      return `<div class="cmp-steps"><p class="mini">${ready ? "She's ready below." : "Set her up below to train."}</p>
        <div class="row-wrap">${step("family", "Her family")}${step("races", "② Races")}${step("deck", "③ Deck")}${step("rating", "④ Skills to buy")}${ready ? `<button type="button" class="linkish" data-cmp-resend>Set her up again</button>` : ""}</div></div>`;
    }

    function howHTML() {
      return `<section class="panel"><details><summary><b>How the planner decides</b></summary><ul class="mini">
        <li><b>Cup:</b> later Global dates are estimates from JP’s order and Global’s pace. Skills marked JP version use that cup’s JP balance changes; By then marks expected releases.</li>
        <li><b>Independent Training:</b> initial stats and SP count more, Specialty counts for nothing, and late-chain hints count less. The weights and Grand Concert event rates are estimates.</li>
        <li><b>Import:</b> umaextractor replaces your veterans and adds your trained umas and cards. A card's limit break never goes down; the friend's card is left out. Family tools share these lists.</li>
        <li><b>Search deck:</b> starts with a quick build from My cards, using Euophrys' scoring and her race skills. Makeup includes the friend's card; Any lets the search decide. Locks stay and left-out cards stay out. A card's score is its value with the other five fixed; the deck score adds them up.</li>
        <li><b>Targets and rank:</b> if either is set, the search simulates swaps and checks all tested decks with 16 careers. The most careers at your chosen rank wins, then rating shortfall, stats and skills count. S starts at 14,500; S+ at 15,900; SS at 17,500. Rating estimates stats + SP spent on relevant skills + unique. Blank stats use the build targets. Predictions use the coach's scenario and leave out inheritance.</li>
        <li><b>Card edits:</b> Change locks your choice. Leave out predicts with the empty slot; Fill keeps the other cards. Predictions refresh automatically; Find them again updates her parents for the edited deck.</li>
        <li><b>Parent 1:</b> the family score counts spark chances over two inspirations, affinity, blue start bonuses and needed pinks. A white her deck offers, or she has innately, counts only for its hint discount (about ${F.HINT_L} L).</li>
        <li><b>A fresh parent:</b> any of My umas with one veteran and a rental, or two veterans, suggested only when she beats your best veteran by ${Math.round(root.UmaCmPlan.MARGIN * 100)}%. Expected whites use your veterans' learned skills and spark rates. Until 10 veterans with skills, defaults are 12 relevant skills, 30% sparks, and 1★/2★/3★ at 32/60/8%. Her unique counts at 2★; pink and blue land on a random aptitude and stat.</li>
        <li><b>Parent races:</b> career goals first, then shared G1s (+3 affinity per parent), preferring the borrowed parent’s wins, then likely rental overlap, at B aptitude or better. Her rating keeps ${Math.round(root.UmaCmPlan.SS_SHARE * 100)}% of runs at S or SS; No minimum keeps every race. Ratings come from at least ${root.UmaCmPlan.BASE_MIN} veterans with at most ${root.UmaCmPlan.BASE_EXTRA} extra race in the coach's scenario, or the last one you used. Known lineage blues add their start bonuses in the fresh-parent simulation, toward SS and her key-stat target; later inheritance rolls are omitted. Simulation estimates the cost per race; with too few veterans it supplies the ratings too.</li>
        <li><b>Parent 2:</b> Full uma.moe settings shows each field and why it is set or left open. The default asks for own 3★ and lineage 7–9★ in one blue stat. Wider uses own 2–3★ and lineage 6–9★. Pink is off unless selected (lineage 3★+, no own minimum). Affinity first sets no preferred-white groups; Whites first uses P0, P1 and P2 before affinity. At most two checked whites are required together. Green focus links require the selected inherited unique on the rental. Her rank is unrestricted: compare the sparks she already has. SS comes before extra affinity races when training your own parent.</li>
        <li><b>Train her:</b> learn relevant skills for whites and raise key stats for blue. The buttons set her family, races, parent deck and target whites, then open ① to ④ here. Set her up again resets that setup.</li>
      </ul></details></section>`;
    }

    // ---------- events ----------
    function click(e) {
      const t = e.target, c = st(), a = current(c);
      const jumpTo = t.closest("[data-cmp-jump]");
      if (jumpTo) { jump(jumpTo.dataset.cmpJump); return true; }
      if (t.closest("#cmpDeck")) { searchDeck(false); return true; }
      if (t.closest("[data-cmp-fill]")) { searchDeck(true); return true; }
      if (t.closest("#cmpParents")) { findParents(); return true; }
      const choose = t.closest("[data-cmp-p1]");
      if (choose && a) {
        const r = found.get(keyOf(c, a)), [kind, id] = choose.dataset.cmpP1.split("|");
        if (r) { const p1 = kind === "fresh" ? r.fresh.find(x => +x.t.id === +id) : r.vets.find(x => String(x.v.id) === id); if (p1) { if (kind === "fresh") freshOf(deckOf(c, a)).tid = p1.t.id; ctx.planFamily(p1, null, true); findParents(); } }
        return true;
      }
      const trainingRental = t.closest("[data-cmp-training-use]"), clearTraining = t.closest("[data-cmp-training-clear]");
      if (a && (trainingRental || clearTraining)) {
        const r = found.get(keyOf(c, a));
        if (r && r.train) { const prefs = freshOf(deckOf(c, a)), tid = r.train.f.t.id; prefs.tid = tid; prefs.picks[tid] = prefs.picks[tid] || {}; prefs.picks[tid].rental = trainingRental ? trainingRental.dataset.cmpTrainingUse : ""; ctx.save(); findParents(); }
        return true;
      }
      const useRental = t.closest("[data-cmp-rent-use]");
      if (useRental) { ctx.useRental(useRental.dataset.cmpRentUse); ctx.save(); ctx.rerender(); return true; }
      if (a && t.closest("#cmpTgCoach")) { const d = deckOf(c, a), ct = ctx.coachTargets() || {}; d.targets = {}; STATS.forEach((x) => { if (ct[x] > 0) d.targets[x] = +ct[x]; }); ctx.save(); ctx.rerender(); return true; }
      if (a && t.closest("#cmpTgClear")) { deckOf(c, a).targets = {}; ctx.save(); ctx.rerender(); return true; }
      if (t.closest("#cmpImport")) {
        const ta = document.getElementById("cmpVetsText");
        if (!ta || !ta.value.trim()) { ctx.flash("Paste the JSON first."); return true; }
        ctx.importVeterans(ta.value);
        ctx.rerender();
        return true;
      }
      if (t.closest("#cmpTeam")) { c.byCup[c.cup] = ctx.pullTeam(cup(c)).filter((m) => ctx.myUmas().has(+m.tid)).slice(0, MAX_ACES); editAce = null; ctx.save(); ctx.rerender(); return true; }
      if (t.closest("#cmpAddAce")) { editAce = aces(c).length; ctx.rerender(); return true; }
      if (t.closest("#cmpAceDone")) { editAce = null; ctx.rerender(); return true; }
      let el;
      if ((el = t.closest("[data-cmp-edit]"))) { editAce = editAce === +el.dataset.cmpEdit ? null : +el.dataset.cmpEdit; ctx.rerender(); return true; }
      if ((el = t.closest("[data-cmp-ace-remove]"))) { aces(c).splice(+el.dataset.cmpAceRemove, 1); editAce = null; swap = null; ctx.save(); ctx.rerender(); return true; }
      if ((el = t.closest("[data-cmp-sel]"))) { c.sel[c.cup] = +el.dataset.cmpSel; swap = null; ctx.save(); ctx.rerender(); return true; }
      if (a && (el = t.closest("[data-cmp-lock]"))) { const d = deckOf(c, a), x = d.cards[+el.dataset.cmpLock]; if (x) { x.locked = !x.locked; d.locked = d.locked.filter(id => id !== x.id); if (x.locked) d.locked.push(x.id); } ctx.save(); ctx.rerender(); return true; }
      if (a && (el = t.closest("[data-cmp-swap]"))) { const i = +el.dataset.cmpSwap, k = keyOf(c, a); swap = swap && swap.k === k && swap.i === i ? null : { k, i }; ctx.rerender(); return true; }
      if (a && (el = t.closest("[data-cmp-remove]"))) {
        const d = deckOf(c, a), i = +el.dataset.cmpRemove, x = d.cards[i];
        if (x) { d.cards.splice(i, 1); d.locked = d.locked.filter(id => id !== x.id); if (d.exclude.indexOf(x.id) === -1) d.exclude.push(x.id); }
        swap = null; ctx.save(); refreshPrediction(c, a);
        return true;
      }
      if (a && (el = t.closest("[data-cmp-put]"))) { const [i, id] = el.dataset.cmpPut.split("|").map(Number); setCard(c, a, i, id); refreshPrediction(c, a); return true; }
      if (a && (el = t.closest("[data-cmp-unexclude]"))) { const d = deckOf(c, a); d.exclude = d.exclude.filter((id) => id !== +el.dataset.cmpUnexclude); ctx.save(); ctx.rerender(); return true; }
      if (a && (el = t.closest("[data-cmp-must-del]"))) { const d = deckOf(c, a); d.must = d.must.filter((id) => id !== el.dataset.cmpMustDel); ctx.save(); ctx.rerender(); return true; }
      const add = t.closest("[data-cmp-rent-add]");
      if (add) {
        const ta = add.closest("details").querySelector("[data-cmp-rent-text]");
        if (!ta.value.trim()) { ctx.flash("Paste the uma.moe cards first."); return true; }
        ctx.addRentals(ta.value);
        ctx.rerender();
        return true;
      }
      if (t.closest("[data-cmp-rent-clear]")) { ctx.clearRentals(); ctx.rerender(); return true; }
      const send = t.closest("[data-cmp-send]"), resend = t.closest("[data-cmp-resend]");
      if ((send || resend) && a) {
        const r = found.get(keyOf(c, a));
        if (!r || !r.train) return true;
        const f = r.train.f, section = send ? send.dataset.cmpSend : "family";
        if (send && sentThere(r)) { ctx.gotoParents(section); return true; }
        ctx.trainParent({ setup: trainingKey(r), cup: c.cup, style: r.style, rank: c.parentRank, ace: { cid: r.t.cid, tid: r.t.id }, p1: { cid: f.t.cid, tid: f.t.id }, parents: f.parents, cards: r.train.deck.cards, races: r.train.agenda.filter((x) => !x.free).map((x) => x.name), wins: f.f.p1.wins.slice(), must: f.extra.whites.list.slice(0, 5).map((x) => x.id) }, section);
        return true;
      }
      return false;
    }
    function change(e) {
      const t = e.target, c = st(), ds = t.dataset, a = current(c);
      if (t.id === "cmpCup") { c.cup = t.value; swap = null; editAce = null; ctx.save(); ctx.rerender(); return true; }
      if (t.id === "cmpParentRank") { ctx.setParentRank(t.value); ctx.save(); ctx.rerender(); return true; }
      if (t.id === "cmpVetsFile") {
        const file = t.files && t.files[0];
        if (file) { const fr = new root.FileReader(); fr.onload = () => { ctx.importVeterans(String(fr.result)); ctx.rerender(); }; fr.readAsText(file); }
        return true;
      }
      if (ds.cmpAce != null) {
        const list = aces(c), i = +ds.cmpAce, tid = t.value ? +t.value : null;
        if (!tid) list.splice(i, 1);
        else if (list.some((x, j) => j !== i && trainee(x.tid).cid === trainee(tid).cid)) { ctx.flash("She's already one of the aces."); ctx.rerender(); return true; }
        else { list[i] = { tid, style: bestStyle(trainee(tid)) }; c.sel[c.cup] = tid; }
        c.byCup[c.cup] = list.filter(Boolean);
        swap = null; ctx.save(); ctx.rerender();
        return true;
      }
      if (ds.cmpStyle != null) { const x = aces(c)[+ds.cmpStyle]; if (x) x.style = t.value; ctx.save(); ctx.rerender(); return true; }
      if (a && ds.cmpComp != null) { const d = deckOf(c, a); if (t.value === "") delete d.comp[ds.cmpComp]; else d.comp[ds.cmpComp] = +t.value; ctx.save(); ctx.rerender(); return true; }
      if (a && ds.cmpBorrow != null) { const d = deckOf(c, a); d.borrow = t.checked; if (!t.checked && d.cards) d.cards = d.cards.filter((x) => !x.borrowed); ctx.save(); ctx.rerender(); return true; }
      if (a && ds.cmpTarget != null) { const d = deckOf(c, a), n = +t.value; if (n > 0) d.targets[ds.cmpTarget] = n; else delete d.targets[ds.cmpTarget]; ctx.save(); ctx.rerender(); return true; }
      if (a && ds.cmpSkillw != null) { deckOf(c, a).skillW = t.value; ctx.save(); ctx.rerender(); return true; }
      if (a && ds.cmpMustAdd != null) { const d = deckOf(c, a); if (t.value && d.must.indexOf(t.value) === -1) d.must.push(t.value); ctx.save(); ctx.rerender(); return true; }
      if (a && ds.cmpRank != null) { deckOf(c, a).rankGoal = t.value; ctx.save(); ctx.rerender(); return true; }
      if (a && ds.cmpParentMode != null) { const prefs = freshOf(deckOf(c, a)); prefs.parentMode = t.value; ctx.save(); findParents(); return true; }
      if (a && ds.cmpTrainingVet != null) {
        const prefs = freshOf(deckOf(c, a)), tid = ds.cmpTrainingVet; prefs.tid = +tid; prefs.picks[tid] = prefs.picks[tid] || {};
        prefs.picks[tid].veteran = t.value;
        const v = ctx.veterans().list.find(v => String(v.id) === t.value), r = ctx.rentals().find(r => r.friend === prefs.picks[tid].rental);
        if (v && r && +v.cid === +r.parent.cid) prefs.picks[tid].rental = "";
        ctx.save(); findParents(); return true;
      }
      if (a && ds.cmpRental != null) { (ds.cmpRentalScope === "training" ? freshOf(deckOf(c, a)).rental : deckOf(c, a).rental)[ds.cmpRental] = t.value; ctx.save(); ctx.rerender(); return true; }
      if (a && ds.cmpRentalWhite != null) {
        const prefs = ds.cmpRentalScope === "training" ? freshOf(deckOf(c, a)).rental : deckOf(c, a).rental, have = new Set(prefs.required || []);
        if (t.checked && !have.has(ds.cmpRentalWhite) && have.size >= 2) { ctx.flash("Choose at most two required whites."); t.checked = false; return true; }
        if (t.checked) have.add(ds.cmpRentalWhite); else have.delete(ds.cmpRentalWhite);
        prefs.required = [...have]; ctx.save(); ctx.rerender(); return true;
      }
      if (a && ds.cmpPick != null) { if (t.value) { setCard(c, a, +ds.cmpPick, +t.value); refreshPrediction(c, a); } return true; }
      if (ds.cmpRentText != null || t.id === "cmpVetsText") return true;
      return false;
    }

    return { render, click, change, st, refreshStatus, predictCurrent: () => { const c = st(), a = current(c); return a ? refreshPrediction(c, a) : Promise.resolve(); } };
  }

  const api = { create, PLAN_RACES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaCmTab = api;
})(typeof window !== "undefined" ? window : globalThis);
