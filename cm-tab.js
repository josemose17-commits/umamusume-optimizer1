// The CM/LoH planner tab: one section from the cup to the ace's parents. Pick the cup and up to
// three aces, then work on one at a time: ① search her racing deck from your cards (as CM &
// decks builds it) and change it by hand (makeup, friend card, skill weight, must-have skills,
// lock, swap, leave out); ② find her parents for the deck as it stands: Parent 1 from your
// veterans (or, when none is good enough, a fresh one to train, with her own parents from your
// veterans and the G1s to win, as many as keep her at S or SS) and the uma.moe search for Parent 2.
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
      if (!c.decks[k].targets) c.decks[k].targets = {};
      if (!c.decks[k].rental) c.decks[k].rental = { pink: "auto", quality: "recommended", required: [] };
      return c.decks[k];
    }
    // The deck with your limit breaks now (a friend's card is always LB4).
    const cardsNow = (d) => (d.cards || []).map((x) => Object.assign({}, x, { lb: x.borrowed ? 4 : ctx.owned()[x.id] != null ? +ctx.owned()[x.id] : x.lb }));
    // What the deck builder works with: the settings, these cards kept (locked).
    // The stats you're aiming for ({ stat: value }, the ones you set), null for none.
    const targetsOf = (d) => { const t = {}; STATS.forEach((x) => { if (d.targets[x] > 0) t[x] = +d.targets[x]; }); return Object.keys(t).length ? t : null; };
    const settings = (d, keep) => ({ comp: d.comp, borrow: d.borrow, skillW: d.skillW, must: d.must, exclude: d.exclude, targets: targetsOf(d), rankGoal: d.rankGoal || "",
      locked: keep.filter((x) => !x.borrowed).map((x) => x.id), friend: (keep.find((x) => x.borrowed) || {}).id || null });
    const inputsKey = (c) => JSON.stringify([c.parentRank, ctx.veterans().at, ctx.veterans().list.length, [...ctx.myUmas()].sort(), ctx.rentals().length]);

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
      const sig = JSON.stringify([p.id, a.tid, style, cards.map((x) => [x.id, x.lb, !!x.borrowed]), d.skillW, d.must, d.comp, d.borrow, d.exclude, d.targets, d.rankGoal, ctx.scenario().id, ctx.ownedCode()]);
      const k = keyOf(c, a), had = views.get(k);
      if (had && had.sig === sig) { had.cards.forEach((x, i) => { x.locked = !!cards[i].locked; }); return had; }
      if (!ctx.euReady() || !ctx.aceSkills({ preset: p, style })) return null;
      const setup = ctx.deckSetup(p, style, a.tid, null, settings(d, cards));
      const desc = cards.length ? T.describeDeck(setup.opts, cards.map((x) => ({ id: x.id, lb: x.lb, borrowed: !!x.borrowed })), setup.pool, setup.bp) : { cards: [], skills: [] };
      const v = { sig, setup, cards: desc.cards.map((x, i) => Object.assign({}, x, { locked: !!cards[i].locked })), skills: desc.skills || [], offers: cards.length ? T.deckOffers(setup.opts, cards) : {}, total: desc.cards.reduce((n, x) => n + x.score, 0) };
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
        const lockedIds = new Set(now.filter((x) => x.locked).map((x) => x.id));
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
      if (!v || !d.cards.length) { sims.delete(k); return; }
      await tick();
      const r = ctx.simulateRace(cup(c), styleOf(a), a.tid, cardsNow(d), d.must, targetsOf(d), d.rankGoal);
      if (fit) { r.before = { stats: fit.before.stats, short: fit.before.short }; r.swaps = fit.swaps; }
      sims.set(k, Object.assign(r, { sig: v.sig }));
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
      const fresh = CP.rankFresh(x, vetsAll, umas, pdeck.offers);
      const useFresh = CP.freshWins(vets[0], fresh[0]);
      let train = null;
      if (fresh[0]) {
        const f = fresh[0], races = CP.racePlan(f, vetsAll);
        const her = ctx.deck(p, style, f.t.id, races.extraRaces);
        await stage(`${who}: planning ${tName(f.t)}'s races…`, 0.9);
        const ss = await ssCut(p, style, f.t, her.cards, races.extraRaces, c.parentRank, vetsAll);
        train = { f, races, deck: her, ss, agenda: CP.upTo(races, ss.n) };
      }
      const p1 = useFresh ? fresh[0] : vets[0] || null;
      return { a, style, t, x, vets: vets.slice(0, 6), fresh: fresh.slice(0, 4), useFresh, train, p1, link: p1 ? linkFor(x, t, p1, useFresh ? train : null) : null };
    }

    // The most extra races (her plan's order) that keep her at the selected rank. Your veterans in the scenario
    // you train in that ran next to no extra races give the ratings you really reach; the
    // simulation (her deck, Independent Training, 16 careers) gives what each race costs her; a
    // count keeps her at the rank when SS_SHARE of those ratings, less that cost, still reach it.
    // Too few such veterans: the simulation alone (it leaves out inheritance, so it runs low).
    // Without a rating minimum, every planned race.
    async function ssCut(p, style, t, cards, max, rank, vets) {
      const rate = ctx.spRate(p, style, t.apt), uniq = PR.uniqueBonus(t.r, t.r), share = root.UmaCmPlan.SS_SHARE;
      const minimum = rank ? PR.rankThreshold(rank) : 0;
      const rating = (x) => PR.statsScore(x.stats) + Math.round((x.sp || 0) * rate) + uniq;
      const memo = new Map();
      const sim = async (k) => {
        if (!memo.has(k)) {
          await tick();
          const x = ctx.simulate(p, t.id, cards, k), fin = x.finals || [];
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
      return Object.assign(cut, { rank, perRace, rows: [...memo.values()].sort((a, b) => a.n - b.n), simScen: sc });
    }

    // The uma.moe search for Parent 2 with this Parent 1.
    function linkFor(x, t, p1, train, prefs) {
      const saddles = train ? train.agenda.map((r) => ctx.saddles[r.name]).filter(Boolean) : CP.saddlesOf(p1);
      return CP.rentalSearch(x, p1, Object.assign({}, prefs || {}, { saddles }));
    }

    // ---------- drawing ----------
    function render(body) {
      const c = st();
      body.innerHTML = `<div class="cmp">
        <section class="panel"><h2>CM/LoH planner</h2><p class="mini">Pick an ace, search her deck, and get her predicted stats and parents.</p></section>
        ${importHTML()}${setupHTML(c)}${aceHTML(c)}${howHTML()}
      </div>`;
      if (job) body.querySelectorAll("button, select, input, textarea").forEach((el) => { el.disabled = true; });
      body.querySelectorAll("details[data-cmp-open]").forEach((el) => el.addEventListener("toggle", () => { opened[el.dataset.cmpOpen] = el.open; }));
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
      const cupOpts = cups().map((x) => `<option value="${esc(x.id)}"${x.id === c.cup ? " selected" : ""}>${esc(ctx.cupLabel(x))}</option>`).join("");
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
        <label class="field grow"><span>The cup</span><select id="cmpCup">${cupOpts}</select></label>
        <label class="field"><span>Her rating (parent you train)</span><select id="cmpParentRank">${[["SS", "SS (17,500)"], ["S", "S (14,500)"], ["", "No minimum"]].map(([v, l]) => `<option value="${v}"${c.parentRank === v ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>
        <p class="mini">${esc(p.course.track)} ${p.course.distance}m ${esc(p.course.surface)}${p.global.est ? " · estimated date" : ""} · up to three aces from My umas.</p>
        <div class="row-wrap cmp-chips" aria-label="Your aces">${chips}${list.length < MAX_ACES ? `<button type="button" class="btn ghost small" id="cmpAddAce"${mine.length ? "" : " disabled"}>+ Add an ace</button>` : ""}</div>${editor}
        ${!mine.length ? `<p class="mini">Import your export above, or tick My umas in the Trainees tab.</p>` : ""}
        ${team.length ? `<button type="button" class="linkish" id="cmpTeam">Use my Pull planner team</button>` : ""}
      </section>`;
    }

    // The ace you're working on: ① her deck, ② her parents.
    function aceHTML(c) {
      const a = current(c);
      if (!a) return "";
      const t = trainee(a.tid), p = cup(c);
      const prog = job ? `<div class="row-wrap"><span class="progress"><i style="width:${Math.round(job.f * 100)}%"></i></span><span class="mini">${esc(job.stage)}</span></div>` : "";
      return `<section class="panel cmp-ace"><h3>${esc(tName(t))} · ${STYLE_LABEL[styleOf(a)]}</h3>
        <h4>① Her deck</h4>${deckHTML(c, a, p)}
        <h4>② Her parents</h4>${parentsHTML(c, a, p)}
        ${prog}
      </section>`;
    }

    function deckHTML(c, a, p) {
      const d = deckOf(c, a), v = view(c, a), k = keyOf(c, a);
      const opt = (pairs, val) => pairs.map(([x, l]) => `<option value="${x}"${String(val) === String(x) ? " selected" : ""}>${esc(l)}</option>`).join("");
      const comp = `<div class="comp"><span class="mini"><b>Deck makeup</b></span>
        <div class="comp-row">${ctx.compTypes.map(([ty, l]) => `<label class="field comp-f ty-${ty}"><span><i class="tydot"></i>${l}</span><select data-cmp-comp="${ty}"><option value="">Any</option>${[0, 1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}"${d.comp[ty] === n ? " selected" : ""}>${n}</option>`).join("")}</select></label>`).join("")}</div></div>`;
      const skills = ctx.raceSkills(p, styleOf(a));
      const must = `<div class="row-wrap"><label class="field grow"><span>Must-have skills</span><select data-cmp-must-add><option value="">Add a skill…</option>${skills.filter((x) => d.must.indexOf(String(x.id)) === -1).slice(0, 80).map((x) => `<option value="${x.id}">${esc(ctx.skillName(x.id))} · ${x.L.toFixed(2)} L</option>`).join("")}</select></label></div>
        ${d.must.length ? `<div class="row-wrap">${d.must.map((id) => `<span class="chip">${esc(ctx.skillName(id))} <button type="button" class="linkish" data-cmp-must-del="${id}" aria-label="Remove">✕</button></span>`).join("")}</div>` : ""}`;
      const out = d.exclude.length ? `<p class="mini">Left out of her searches: ${d.exclude.map((id) => `<span class="chip">${esc(cardName(id))} <button type="button" class="linkish" data-cmp-unexclude="${id}" aria-label="Allow again">✕</button></span>`).join(" ")}</p>` : "";
      const opts = `<details class="cmp-deckset" data-cmp-open="set"${(opened.set != null ? opened.set : !d.cards) ? " open" : ""}><summary class="mini"><b>Deck settings</b> · ${Object.keys(d.comp).length ? Object.keys(d.comp).map((ty) => `${d.comp[ty]} ${TYPE_LABEL[ty]}`).join(", ") : "any makeup"} · ${d.borrow ? "a friend's card" : "no friend's card"}${d.must.length ? ` · ${plural(d.must.length, "must-have")}` : ""}</summary>
        ${comp}
        <div class="row-wrap"><label class="chip-toggle"><input type="checkbox" data-cmp-borrow${d.borrow ? " checked" : ""}> Borrow 1 card from a friend</label>
          <label class="field"><span>Skill hints count</span><select data-cmp-skillw>${opt(ctx.skillWeights, d.skillW)}</select></label></div>
        ${must}</details>`;
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
        <div class="row-wrap"><button type="button" class="btn ghost small" id="cmpUseCM"${v.cards.length ? "" : " disabled"}>Use this deck in CM &amp; decks</button></div>
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
      return btn + `<h4 class="cmp-sub">Parent 1</h4>${p1HTML(r)}
        <h4 class="cmp-sub">Parent 2: a friend's rental</h4>${p2HTML(r, c, a)}
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
      else if (r.useFresh) out = `<p><b>Train ${esc(tName(pick.t))}</b> · parents ${pick.parents.map((v) => esc(vetName(v))).join(" + ")} · expected ${famLine(Object.assign({}, pick.s, { value: pick.value }))}.</p>`;
      else out = `<p><b>Your veteran ${esc(vetName(pick.v))}</b> · rating ${fmtN(pick.v.score || 0)} · ${sparks(pick.v.self)} · ${famLine(pick.s)}.</p>`;
      const other = r.vets.concat(r.fresh).filter((x) => x !== pick).sort((a, b) => b.value - a.value);
      if (other.length) out += `<details><summary class="mini">Other options (${other.length})</summary><div class="table-wrap"><table class="plan"><thead><tr><th>Parent 1</th><th class="num">Family</th><th class="num">Affinity</th></tr></thead><tbody>${other.map((x) => {
        const fresh = x.kind === "fresh";
        const ps = fresh ? x.parents.map(vetName) : x.v.parents.filter(Boolean).map((m) => ctx.charName(m.cid));
        return `<tr><td>${fresh ? "Train " : "Veteran: "}<b>${esc(fresh ? tName(x.t) : vetName(x.v))}</b>${ps.length ? `<div class="mini">Parents: ${ps.map(esc).join(" + ")}</div>` : ""}</td><td class="num">${fresh ? "~" : ""}${fmt(x.value)}</td><td class="num">${x.s.total} ${x.s.symbol}</td></tr>`;
      }).join("")}</tbody></table></div></details>`;
      return out;
    }

    function p2HTML(r, c, a) {
      if (!r.p1) return `<p class="mini">Pick Parent 1 first.</p>`;
      const prefs = deckOf(c, a).rental;
      const l = linkFor(r.x, r.t, r.p1, r.useFresh ? r.train : null, prefs), p1 = r.p1;
      const blue = l.blue.map((b) => `<b>${b.label} 3★</b>`).join(" or ");
      const rents = CP.rankRentals(r.x, p1, ctx.rentals());
      return `<p><a class="btn small" href="${esc(l.url)}" target="_blank" rel="noopener">Search uma.moe for her Parent 2</a></p>
        <p class="mini cmp-filters">${blue} · ${l.pink ? `${l.pink.label} pink ${l.pink.min}–9★` : "any pink"} · preferred whites first, then affinity.</p>
        ${rentalSettingsHTML(l, r, prefs)}
        <details class="cmp-rent" data-cmp-open="rent"${(opened.rent != null ? opened.rent : rents.length > 0) ? " open" : ""}><summary class="mini"><b>Paste rentals from uma.moe</b> · ${ctx.rentals().length ? `${ctx.rentals().length} pasted` : "none yet"}</summary>
          <p class="mini">Paste whole uma.moe parent cards to rank them with Parent 1.</p>
          <textarea class="fp-vets" data-cmp-rent-text rows="3" placeholder="Paste uma.moe parent cards here"></textarea>
          <div class="row-wrap"><button type="button" class="btn small" data-cmp-rent-add>Add</button>${ctx.rentals().length ? `<button type="button" class="btn ghost small" data-cmp-rent-clear>Remove all</button>` : ""}</div>
          ${rents.length ? `<div class="table-wrap"><table class="plan"><thead><tr><th>Rental (and her parents)</th><th>Friend</th><th class="num">Family</th><th class="num">Affinity</th></tr></thead><tbody>${rents.slice(0, 10).map((x) => `<tr><td>${esc(x.r.names[0])} <span class="mini">+ ${esc(x.r.names[1] || "")} + ${esc(x.r.names[2] || "")}</span><div class="mini">${sparks(x.r.parent)}${topSkills(x.s, ["p2", "g21", "g22"]) ? ` · best sparks: ${topSkills(x.s, ["p2", "g21", "g22"])}` : ""}</div></td><td>${esc(x.r.trainer)}<div class="mini">${esc(x.r.friend.replace(/(\d{3})(?=\d)/g, "$1 "))}</div></td><td class="num">${fmt(x.value)}</td><td class="num">${x.s.total} ${x.s.symbol}</td></tr>`).join("")}</tbody></table></div>` : ""}
          ${rents.hidden && rents.hidden.length ? `<p class="mini">Not shown (the game wouldn't allow them here): ${rents.hidden.map((h) => `${esc(h.r.trainer)}'s ${esc(h.r.names[0])} (${esc(h.why)})`).join("; ")}.</p>` : ""}
        </details>`;
    }

    function rentalSettingsHTML(l, r, prefs) {
      const name = (id) => esc(ctx.skillName(id));
      const list = (ids) => ids.length ? ids.map(name).join(", ") : "None";
      const row = (field, value, why) => `<tr><th scope="row">${field}</th><td>${value}</td><td class="mini">${why}</td></tr>`;
      const section = (title) => `<tr class="cmp-filter-section"><th colspan="3">${title}</th></tr>`;
      const who = r.p1.kind === "vet" ? vetName(r.p1.v) : tName(r.p1.t);
      const selected = new Set(l.required), grouped = [0, 1, 2].map((p) => ({ p, ids: l.whites.filter((w) => w.priority === p && !selected.has(w.id)).map((w) => w.id) })).filter((g) => g.ids.length);
      const pink = l.pink ? `${l.pink.label}: ${l.pink.min}–9★` : "Any";
      const wins = r.useFresh ? r.train.agenda.map((x) => x.name) : r.p1.f.p1.wins || [];
      const allWins = [...new Set(wins)].map(esc).join(", ");
      return `<details class="cmp-rental-settings" data-cmp-open="rental-settings"${opened["rental-settings"] ? " open" : ""}><summary><b>Full uma.moe settings</b> · factors, characters, rank and races</summary>
        <div class="row-wrap"><label class="field"><span>Pink focus</span><select data-cmp-rental="pink"><option value="auto"${!prefs.pink || prefs.pink === "auto" ? " selected" : ""}>Auto (${l.pink ? l.pink.label : "none"})</option>${l.choices.map((p) => `<option value="${p.i}"${String(prefs.pink) === String(p.i) ? " selected" : ""}>${p.label} (ace: ${p.grade})</option>`).join("")}<option value="none"${prefs.pink === "none" ? " selected" : ""}>Any pink</option></select></label>
          <label class="field"><span>Search width</span><select data-cmp-rental="quality"><option value="recommended"${!l.broad ? " selected" : ""}>More stars</option><option value="broad"${l.broad ? " selected" : ""}>More choices</option></select></label></div>
        <p class="mini">More choices lowers the star limits and lets a grandparent carry the pink; your required whites stay.</p>
        <fieldset class="cmp-required"><legend class="mini">Required white sparks (all checked skills must be in the rental branch)</legend><div class="row-wrap">${l.whites.map((w) => `<label class="chip-toggle small"><input type="checkbox" data-cmp-rental-white="${w.id}"${selected.has(w.id) ? " checked" : ""}>${name(w.id)}</label>`).join("") || '<span class="mini">No missing race whites.</span>'}</div></fieldset>
        <div class="table-wrap"><table class="cmp-filter-table"><thead><tr><th>Field</th><th>Set it to</th><th>Why</th></tr></thead><tbody>
          ${section("Affinity")}
          ${row("Target character", esc(tName(r.t)), "The ace you're training.")}
          ${row("Your legacy", `${esc(who)} · ${l.wins} G1 wins`, "Includes Parent 1 and her actual or planned shared wins in affinity.")}
          ${section("Include / Exclude Umas · Support Cards · Search")}
          ${row("Main Parent · Include", "Any character", "Compare whole families before locking a character.")}
          ${row("Main Parent · Exclude", `${esc(tName(r.t))} + ${esc(who)} (all versions)`, "Neither can be Parent 2 under the game's rules.")}
          ${row("Great Parent · Include / Exclude", "Any", "Keep good grandparents; sharing a character across branches can be legal.")}
          ${row("Support Card & LB", "Any card · Any LB", "Your rental parent and borrowed support card can come from different trainers.")}
          ${row("Search users", "Trainer ID and username blank", "Search all trainers.")}
          ${section("Inheritance Factors · rental and her two parents")}
          ${row("Blue Factors (Stats)", "No extra type limit", "The main parent's blue and the total below set the blue requirements.")}
          ${row("Pink Factors (Aptitude)", pink, l.pink ? `${l.pink.known}★ of ${l.pink.label} is known on your Parent 1 branch. ${l.pink.needed ? `The ace starts at ${esc(l.pink.grade)} there; this is an aptitude gap to fix.` : "More carriers improve your chance at an S aptitude; the roll is not guaranteed."}` : "No pink requirement selected.")}
          ${row("Green Factors (Unique)", "Any; focus links below", "Use a focus link when a specific inherited unique is essential.")}
          ${row("White Factors · Required", l.required.length ? `${list(l.required)} · 1–9★ each · AND` : "None", "Check only skills you need this rental branch to supply.")}
          ${row("Preferred White Factors", grouped.map((g) => `<b>P${g.p}:</b> ${list(g.ids)}`).join("<br>") || "None", "Missing skills first, accounting for her deck and Parent 1. P0 sorts before P1, then P2.")}
          ${row("Lineage White Factors", "None", "Repeat stacks are optional; this search fills the ace's missing hints.")}
          ${section("Main Parent Factors · the rental herself")}
          ${row("Blue Factors (Stats)", l.blue.map((b) => `${b.label} 3★`).join(" OR "), "One key-stat blue on the rental, not just on a grandparent.")}
          ${row("Pink Factors (Aptitude)", l.pink && l.pink.main ? `${l.pink.label} 3★` : "Any", l.pink && l.pink.main ? "Keep the focused pink on the direct parent too." : "The family pink filter can be met by a grandparent.")}
          ${row("Green / Required White Factors", "Any / None", "The required whites may be anywhere in this rental branch.")}
          ${row("Preferred White Factors", list(l.q.mainWhites) + (l.q.mainWhites.length ? " · P0" : ""), "Prefer the most valuable missing whites on the direct parent.")}
          ${row("White categories · Common / Scenario / Race", "All minimums 0", "Useful skills matter more than unrelated factor counts.")}
          ${section("General Criteria")}
          ${row("Training Scenario", "Any scenario", "Compare the sparks she already has.")}
          ${row("Min Win Count / Min White Factor Count", "0 / 0", "Shared G1 names and useful whites matter more than raw counts.")}
          ${row("Parent Rank", "Any rank", "SS is the priority when training your own parent; a rental's existing sparks determine her value.")}
          ${row("Max Follower Accounts", "Off (fewer than 1,000)", "uma.moe's default leaves out trainers with no free follower slot.")}
          ${section("Total Star Count · rental branch only")}
          ${row("Total Blue ★", String(l.q.totalBlue), l.broad ? "A broader search, keeping her own 3★ key blue." : "Three 3★ blues across this branch.")}
          ${row("Total Pink / Green / White ★", "0 / 0 / 0", "The focused pink above is specific; unrelated total stars do not prove a good parent.")}
          ${row("White categories · Common / Scenario / Race", "All minimums 0", "Preferred and required skills already guide this search.")}
          ${section("Race Schedule Filter and sorting")}
          ${row("Race Schedule Filter", "Blank", allWins ? `Shared wins to check: ${allWins}. Add specific wins only if you need to narrow the results.` : "The legacy context already accounts for shared wins; an extra hard calendar filter can discard useful families.")}
          ${row("Sort by", "Preferred white groups, then Affinity", "uma.moe applies P0/P1/P2 first; paste candidates below for the planner's whole-family comparison.")}
        </tbody></table></div>
        ${l.focused.length ? `<p class="mini"><b>Focus an inherited unique:</b> ${l.focused.map((g) => `<a href="${esc(g.search.url)}" target="_blank" rel="noopener">${name(g.skill.id)} · ${g.skill.owners.map((t) => esc(tName(t))).join(" / ")}</a>`).join(" · ")}. Each link also requires that unique on the rental herself.</p>` : ""}
      </details>`;
    }

    // Where her race count comes from, in words.
    function ssText(ss) {
      const pct = Math.round(root.UmaCmPlan.SS_SHARE * 100);
      if (ss.loose) return "No rating minimum: keep every race she can fit.";
      if (ss.from === "veterans") return `${ss.n} extra races keep ${ss.ss} of ${ss.of} reference runs at ${ss.rank} (${pct}% needed, ${esc(ss.scen.name)})${ss.none ? `; even no extra races fall short of ${pct}%` : ""}.`;
      const row = ss.rows.find((x) => x.n === ss.n);
      return `Simulation: ${ss.rank} in ${row.hit} of ${row.of} with ${ss.n} extra races (${pct}% needed)${ss.none ? "; short even with no extras" : ""}.`;
    }
    function trainHTML(r, p) {
      const tr = r.train, f = tr.f, ss = tr.ss;
      const shared = (x) => `Shared +${3 * x.with.length}`;
      const why = (x) => x.free ? `Goal${x.with && x.with.length ? " · " + shared(x) : ""}` : !x.extra ? shared(x) : `Rental overlap (${x.pop})`;
      const all = tr.races.agenda.concat(tr.races.goals || []).sort((a, b) => a.turn - b.turn);
      const rows = all.map((x) => { const keep = x.free || x.rank < ss.n; return `<tr${keep ? "" : ' class="cmp-cut"'}><td class="num">${x.turn}<div class="mini">${esc(ctx.turnText(x.turn))}</div></td><td><b>${esc(x.name)}</b>${x.d ? `<div class="mini">${x.d}m ${x.s === 2 ? "dirt" : "turf"}${x.aptGrades ? " · aptitude " + x.aptGrades.join("/") : ""}</div>` : ""}</td><td class="mini">${why(x)}${keep ? "" : ` · <b>skip: below ${ss.rank}</b>`}</td></tr>`; }).join("");
      const ssRows = ss.rows.map((x) => `<tr${x.n === ss.n ? ' class="cur"' : ""}><td class="num">${x.n}${x.n === ss.n ? " ←" : ""}</td>${x.stats.map((v) => `<td class="num">${v}</td>`).join("")}<td class="num">${x.sp}</td><td class="num">${x.rating.toLocaleString("en-US")}</td><td class="num">${x.hit}/${x.of}</td></tr>`).join("");
      const w = f.extra.whites.list.slice(0, 6).map((y) => esc(ctx.skillName(y.id))).join(", ");
      return `<p class="mini"><b>Deck:</b> ${tr.deck.cards.map((x) => esc(cardName(x.id)) + ` LB${x.lb}${x.borrowed ? " (friend)" : ""}`).join(", ")}.</p>
        ${w ? `<p class="mini"><b>Learn first:</b> ${w}.</p>` : ""}
        <p class="mini">${ssText(ss)}</p>
        <div class="table-wrap"><table class="plan cmp-races"><thead><tr><th class="num">Turn</th><th>Race</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table></div>
        ${tr.races.skipped.some((x) => x.points > 0) ? `<p class="mini">No free turn for ${tr.races.skipped.filter((x) => x.points > 0).map((x) => esc(x.name)).join(", ")}, which her parents won: it's held on a turn her career already takes.</p>` : ""}
        <details><summary class="mini">What the races cost: about ${Math.round(ss.perRace)} rating each, simulated</summary>
          <div class="table-wrap"><table class="plan pp-cost"><thead><tr><th class="num">Extra races</th>${F.STAT_LABELS.map((l) => `<th class="num">${l.slice(0, 3)}</th>`).join("")}<th class="num">SP</th><th class="num">Rating</th><th class="num">${ss.rank || "No minimum"}</th></tr></thead><tbody>${ssRows}</tbody></table></div>
          <p class="mini">16 careers each in ${esc(ss.simScen.name)}, before inheritance.</p></details>
        ${stepsHTML(r)}`;
    }

    // Is she already set up in the Parents tab (sent from here for this ace and cup)?
    function sentThere(r) {
      const f = ctx.plannerFrom(), c = st();
      return !!(f && f.kind === "parent" && f.cup === c.cup && +f.tid === +r.t.id && +f.p1 === +r.train.f.t.id);
    }
    // The Parents tab's steps for her, one click each (the first one sets her up there).
    function stepsHTML(r) {
      const ready = sentThere(r);
      const step = (key, label) => `<button type="button" class="btn ${key === "family" ? "small" : "ghost small"}" data-cmp-send="${key}">${label}</button>`;
      return `<div class="cmp-steps"><p class="mini"><b>Continue in the Parents tab</b>${ready ? ": she's set up there." : ": the first click sets her up."}</p>
        <div class="row-wrap">${step("family", "Her family")}${step("races", "② Races")}${step("deck", "③ Deck")}${step("rating", "④ Skills to buy")}${ready ? `<button type="button" class="linkish" data-cmp-resend>Set her up again</button>` : ""}</div></div>`;
    }

    function howHTML() {
      return `<section class="panel"><details><summary><b>How the planner decides</b></summary><ul class="mini">
        <li><b>Import:</b> umaextractor replaces your veterans and adds your trained umas and cards. A card's limit break never goes down; the friend's card is left out. The Parents tab shares these lists.</li>
        <li><b>Search deck:</b> starts with CM &amp; decks' quick build from My cards, using Euophrys' scoring and her race skills. Makeup includes the friend's card; Any lets the search decide. Locks stay and left-out cards stay out. A card's score is its value with the other five fixed; the deck score adds them up.</li>
        <li><b>Targets and rank:</b> if either is set, the search simulates swaps and checks all tested decks with 16 careers. The most careers at your chosen rank wins, then rating shortfall, stats and skills count. S starts at 14,500; S+ at 15,900; SS at 17,500. Rating estimates stats + SP spent on relevant skills + unique. Blank stats use the build targets. Predictions use the coach's scenario and leave out inheritance.</li>
        <li><b>Card edits:</b> Change locks your choice. Leave out predicts with the empty slot; Fill keeps the other cards. Predictions refresh automatically; Find them again updates her parents for the edited deck.</li>
        <li><b>Parent 1:</b> the family score counts spark chances over two inspirations, affinity, blue start bonuses and needed pinks. A white her deck offers, or she has innately, counts only for its hint discount (about ${F.HINT_L} L).</li>
        <li><b>A fresh parent:</b> any of My umas with her best two veterans as parents, suggested only when she beats your best veteran by ${Math.round(root.UmaCmPlan.MARGIN * 100)}%. Expected whites use your veterans' learned skills and spark rates. Until 10 veterans with skills, defaults are 12 relevant skills, 30% sparks, and 1★/2★/3★ at 32/60/8%. Her unique counts at 2★; pink and blue land on a random aptitude and stat.</li>
        <li><b>Parent races:</b> career goals first, then shared G1s (+3 affinity per parent), then likely rental overlap, at B aptitude or better. Her rating keeps ${Math.round(root.UmaCmPlan.SS_SHARE * 100)}% of runs at S or SS; No minimum keeps every race. Ratings come from at least ${root.UmaCmPlan.BASE_MIN} veterans with at most ${root.UmaCmPlan.BASE_EXTRA} extra race in the coach's scenario, or the last one you used. Simulation estimates the cost per race; with too few veterans it supplies the ratings too.</li>
        <li><b>Parent 2:</b> Full uma.moe settings shows each field and why it is set or left open. More stars asks for a 3★ key blue on her, 9 total blue stars and a focused pink; More choices relaxes stars. Required whites are AND conditions, while preferred whites use P0, then P1 and P2 before affinity. Green focus links require the selected inherited unique on the rental. Her rank is unrestricted: compare the sparks she already has. SS comes before extra affinity races when training your own parent.</li>
        <li><b>Train her:</b> learn relevant skills for whites and raise key stats for blue. The Parents tab buttons set her family, races, deck goal and target whites once, then open each step. Use the bar there to return; Set her up again starts over.</li>
      </ul></details></section>`;
    }

    // ---------- events ----------
    function click(e) {
      const t = e.target, c = st(), a = current(c);
      if (t.closest("#cmpDeck")) { searchDeck(false); return true; }
      if (t.closest("[data-cmp-fill]")) { searchDeck(true); return true; }
      if (t.closest("#cmpParents")) { findParents(); return true; }
      if (a && t.closest("#cmpTgCoach")) { const d = deckOf(c, a), ct = ctx.coachTargets() || {}; d.targets = {}; STATS.forEach((x) => { if (ct[x] > 0) d.targets[x] = +ct[x]; }); ctx.save(); ctx.rerender(); return true; }
      if (a && t.closest("#cmpTgClear")) { deckOf(c, a).targets = {}; ctx.save(); ctx.rerender(); return true; }
      if (t.closest("#cmpUseCM") && a) {
        const d = deckOf(c, a);
        ctx.useInCM({ cup: c.cup, style: styleOf(a), tid: a.tid, comp: d.comp, borrow: d.borrow, skillW: d.skillW, must: d.must, targets: d.targets, rankGoal: d.rankGoal, cards: cardsNow(d) });
        return true;
      }
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
      if (a && (el = t.closest("[data-cmp-lock]"))) { const x = deckOf(c, a).cards[+el.dataset.cmpLock]; if (x) x.locked = !x.locked; ctx.save(); ctx.rerender(); return true; }
      if (a && (el = t.closest("[data-cmp-swap]"))) { const i = +el.dataset.cmpSwap, k = keyOf(c, a); swap = swap && swap.k === k && swap.i === i ? null : { k, i }; ctx.rerender(); return true; }
      if (a && (el = t.closest("[data-cmp-remove]"))) {
        const d = deckOf(c, a), i = +el.dataset.cmpRemove, x = d.cards[i];
        if (x) { d.cards.splice(i, 1); if (d.exclude.indexOf(x.id) === -1) d.exclude.push(x.id); }
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
        ctx.sendToParents({ cup: c.cup, style: r.style, rank: c.parentRank, ace: { cid: r.t.cid, tid: r.t.id }, p1: { cid: f.t.cid, tid: f.t.id }, parents: f.parents, races: r.train.agenda.filter((x) => !x.free).map((x) => x.name), wins: [...new Set(r.train.agenda.map((x) => x.name))], must: f.extra.whites.list.slice(0, 5).map((x) => x.id) }, section);
        return true;
      }
      return false;
    }
    function change(e) {
      const t = e.target, c = st(), ds = t.dataset, a = current(c);
      if (t.id === "cmpCup") { c.cup = t.value; swap = null; editAce = null; ctx.save(); ctx.rerender(); return true; }
      if (t.id === "cmpParentRank") { c.parentRank = t.value; ctx.save(); ctx.rerender(); return true; }
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
      if (a && ds.cmpRental != null) { deckOf(c, a).rental[ds.cmpRental] = t.value; ctx.save(); ctx.rerender(); return true; }
      if (a && ds.cmpRentalWhite != null) {
        const prefs = deckOf(c, a).rental, have = new Set(prefs.required || []);
        if (t.checked) have.add(ds.cmpRentalWhite); else have.delete(ds.cmpRentalWhite);
        prefs.required = [...have]; ctx.save(); ctx.rerender(); return true;
      }
      if (a && ds.cmpPick != null) { if (t.value) { setCard(c, a, +ds.cmpPick, +t.value); refreshPrediction(c, a); } return true; }
      if (ds.cmpRentText != null || t.id === "cmpVetsText") return true;
      return false;
    }

    return { render, click, change, st };
  }

  const api = { create, PLAN_RACES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaCmTab = api;
})(typeof window !== "undefined" ? window : globalThis);
