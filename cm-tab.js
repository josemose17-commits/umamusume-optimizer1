// The CM/LoH planner tab: one section from the cup to the ace's parents. Pick the cup and up to
// three aces, then work on one at a time: ① search her racing deck from your cards (as CM &
// decks builds it) and change it by hand (makeup, friend card, skill weight, must-have skills,
// lock, swap, leave out); ② find her parents for the deck as it stands: Parent 1 from your
// veterans (or, when none is good enough, a fresh one to train, with her own parents from your
// veterans and the G1s to win, as many as keep her at SS) and the uma.moe search for Parent 2.
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
    const CP = root.UmaCmPlan.create({ A, F, skills: ctx.SB.DATA.skills, trainees: D.DATA.trainees, chars: ctx.chars(), saddles: ctx.saddles, SS: PR.SS });
    let job = null;             // a search in progress: { stage, f }
    const views = new Map();    // each ace's deck as it stands, described: { sig, … }
    const found = new Map();    // each ace's parents, with the deck they were found for
    const sims = new Map();     // each ace's simulated deck: { sig, stats, sp }
    let swap = null;            // the slot whose "Change" list is open: { k, i }
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
      if (c.ssMust == null) c.ssMust = true;
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
      if (!c.decks[k]) { const d = ctx.deckDefaults(); c.decks[k] = { comp: d.comp, borrow: d.borrow, skillW: d.skillW, must: [], exclude: [], targets: d.targets || {}, cards: null, searched: null }; }
      if (!c.decks[k].targets) c.decks[k].targets = {};
      return c.decks[k];
    }
    // The deck with your limit breaks now (a friend's card is always LB4).
    const cardsNow = (d) => (d.cards || []).map((x) => Object.assign({}, x, { lb: x.borrowed ? 4 : ctx.owned()[x.id] != null ? +ctx.owned()[x.id] : x.lb }));
    // What the deck builder works with: the settings, these cards kept (locked).
    // The stats you're aiming for ({ stat: value }, the ones you set), null for none.
    const targetsOf = (d) => { const t = {}; STATS.forEach((x) => { if (d.targets[x] > 0) t[x] = +d.targets[x]; }); return Object.keys(t).length ? t : null; };
    const settings = (d, keep) => ({ comp: d.comp, borrow: d.borrow, skillW: d.skillW, must: d.must, exclude: d.exclude, targets: targetsOf(d),
      locked: keep.filter((x) => !x.borrowed).map((x) => x.id), friend: (keep.find((x) => x.borrowed) || {}).id || null });
    const inputsKey = (c) => JSON.stringify([c.ssMust, ctx.veterans().at, ctx.veterans().list.length, [...ctx.myUmas()].sort(), ctx.rentals().length]);

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
      const sig = JSON.stringify([p.id, a.tid, style, cards.map((x) => [x.id, x.lb, !!x.borrowed]), d.skillW, d.must, d.comp, d.borrow, d.exclude, ctx.ownedCode()]);
      const k = keyOf(c, a), had = views.get(k);
      if (had && had.sig === sig) return had;
      if (!ctx.euReady() || !ctx.aceSkills({ preset: p, style })) return null;
      const setup = ctx.deckSetup(p, style, a.tid, null, settings(d, cards));
      const desc = cards.length ? T.describeDeck(setup.opts, cards.map((x) => ({ id: x.id, lb: x.lb, borrowed: !!x.borrowed })), setup.pool, setup.bp) : { cards: [], skills: [] };
      const v = { sig, setup, cards: desc.cards.map((x, i) => Object.assign({}, x, { locked: !!cards[i].locked })), skills: desc.skills || [], offers: cards.length ? T.deckOffers(setup.opts, cards) : {}, total: desc.cards.reduce((n, x) => n + x.score, 0) };
      views.set(k, v);
      return v;
    }
    // Search her deck: your locked cards stay, the rest is the builder's.
    async function searchDeck(fill) {
      const c = st(), p = cup(c), a = current(c);
      if (!a) { ctx.flash("Pick an ace first."); return; }
      await busy("Loading the card data…", async () => {
        await ready(p);
        const d = deckOf(c, a), now = cardsNow(d), keep = fill ? now : now.filter((x) => x.locked);
        await stage(fill ? "Filling the empty slot…" : "Searching her deck…", 0.5);
        const r = ctx.deck(p, styleOf(a), a.tid, null, settings(d, keep));
        const lockedIds = new Set(now.filter((x) => x.locked).map((x) => x.id));
        d.cards = r.cards.map((x) => ({ id: x.id, lb: x.lb, borrowed: !!x.borrowed, locked: lockedIds.has(x.id) }));
        const v = view(c, a);
        if (!fill && v) d.searched = v.total;
        swap = null;
        ctx.save();
      });
    }
    // Search toward the stats you're aiming for: CM & decks' simulated search, from her deck as it
    // stands (the quick search's first, if she has none), swapping a card at a time while the
    // careers end closer to the targets (blank ones: the race build's), keeping her locked cards,
    // makeup and must-haves.
    async function searchTargets() {
      const c = st(), p = cup(c), a = current(c);
      if (!a) { ctx.flash("Pick an ace first."); return; }
      await busy("Loading the card data…", async () => {
        await ready(p);
        const d = deckOf(c, a);
        if (!d.cards || d.cards.length < 6) {
          await stage("Searching her deck first…", 0.05);
          const now = cardsNow(d), r = ctx.deck(p, styleOf(a), a.tid, null, settings(d, now.filter((x) => x.locked)));
          const keep = new Set(now.filter((x) => x.locked).map((x) => x.id));
          d.cards = r.cards.map((x) => ({ id: x.id, lb: x.lb, borrowed: !!x.borrowed, locked: keep.has(x.id) }));
        }
        const now = cardsNow(d), lockedIds = new Set(now.filter((x) => x.locked).map((x) => x.id));
        const search = ctx.targetSearch(p, styleOf(a), a.tid, settings(d, now.filter((x) => x.locked)), now.map((x) => ({ id: x.id, lb: x.lb, borrowed: !!x.borrowed })));
        let more = true;
        while (more) {
          const t0 = Date.now();
          while (more && Date.now() - t0 < 150) more = search.next();
          await stage("Searching toward your targets: simulating careers for each swap…", 0.05 + 0.85 * search.progress());
        }
        await stage("Checking the best decks with more careers…", 0.92);
        const fit = search.result();
        d.cards = fit.cards.map((x) => ({ id: x.id, lb: x.lb, borrowed: !!x.borrowed, locked: lockedIds.has(x.id) }));
        swap = null;
        const v = view(c, a);
        if (v) {
          d.searched = v.total;
          sims.set(keyOf(c, a), { sig: v.sig, stats: fit.after.stats, sp: fit.after.sp, short: fit.after.short, target: fit.target, caps: fit.caps, scenario: ctx.scenario().name,
            before: { stats: fit.before.stats, short: fit.before.short }, swaps: fit.swaps });
        }
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
      if (!d.cards || !d.cards.length) { ctx.flash("Search her deck first: her parents are picked for it."); return; }
      await busy("Loading the card data…", async () => {
        await ready(p);
        const v = view(c, a);
        if (!v) throw new Error("The race's skill values didn't load. Try again.");
        const r = await planParents(c, p, a, v);
        found.set(keyOf(c, a), Object.assign(r, { sig: v.sig, inputs: inputsKey(c) }));
      });
    }
    async function planParents(c, p, a, v) {
      const t = trainee(a.tid), who = tName(t), style = styleOf(a);
      const rel = ctx.aceSkills({ preset: p, style });
      if (!rel) throw new Error("The race's skill values didn't load. Try again.");
      const vetsAll = ctx.veterans().list, umas = [...ctx.myUmas()];
      const x = CP.context({ ace: { cid: t.cid, tid: t.id }, race: { preset: p, style }, rel, offers: v.offers, build: ctx.build(p) });
      await stage(`${who}: Parent 1 from your veterans…`, 0.2);
      const vets = CP.rankVets(x, vetsAll);
      await stage(`${who}: would a fresh Parent 1 do better?`, 0.35);
      const pdeck = ctx.deck(p, style, null, PLAN_RACES);
      const fresh = CP.rankFresh(x, vetsAll, umas, pdeck.offers);
      const useFresh = CP.freshWins(vets[0], fresh[0]);
      let train = null;
      if (fresh[0]) {
        const f = fresh[0], races = CP.racePlan(f, vetsAll);
        const her = ctx.deck(p, style, f.t.id, races.extraRaces);
        await stage(`${who}: how many races keep ${tName(f.t)} at SS…`, 0.6);
        const ss = await ssCut(p, style, f.t, her.cards, races.extraRaces, c.ssMust, vetsAll);
        train = { f, races, deck: her, ss, agenda: CP.upTo(races, ss.n) };
      }
      const p1 = useFresh ? fresh[0] : vets[0] || null;
      return { a, style, t, x, vets: vets.slice(0, 6), fresh: fresh.slice(0, 4), useFresh, train, p1, link: p1 ? linkFor(x, t, p1, useFresh ? train : null) : null };
    }

    // The most extra races (her plan's order) that keep her at SS. Your veterans in the scenario
    // you train in that ran next to no extra races give the ratings you really reach; the
    // simulation (her deck, Independent Training, 16 careers) gives what each race costs her; a
    // count keeps her at SS when SS_SHARE of those ratings, less that cost, still reach it.
    // Too few such veterans: the simulation alone (it leaves out inheritance, so it runs low).
    // Without "SS is a must", every planned race.
    async function ssCut(p, style, t, cards, max, must, vets) {
      const rate = ctx.spRate(p, style, t.apt), uniq = PR.uniqueBonus(t.r, t.r), share = root.UmaCmPlan.SS_SHARE;
      const rating = (x) => PR.statsScore(x.stats) + Math.round((x.sp || 0) * rate) + uniq;
      const memo = new Map();
      const sim = async (k) => {
        if (!memo.has(k)) {
          await tick();
          const x = ctx.simulate(p, t.id, cards, k), fin = x.finals || [];
          memo.set(k, { n: k, stats: x.stats, sp: x.sp, rating: rating(x), hit: fin.filter((y) => rating(y) >= PR.SS).length, of: fin.length });
        }
        return memo.get(k);
      };
      const zero = await sim(0), top = await sim(max);
      const perRace = max > 0 ? Math.max(0, (zero.rating - top.rating) / max) : 0;
      const sc = ctx.scenario();
      let scen = sc, base = CP.baseline(vets, sc.id);
      if (!base) {
        // Not enough of your veterans in the coach's scenario: the one you trained in last.
        const last = (vets || []).filter((v) => v.scenario).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
        if (last && last.scenario !== sc.id) { base = CP.baseline(vets, last.scenario); if (base) scen = { id: last.scenario, name: ctx.scenarioName(last.scenario) }; }
      }
      let cut;
      if (base) cut = Object.assign(CP.ssLimit(base, perRace, max), { from: "veterans", base, scen });
      else {
        const ok = (y) => (y.of ? y.hit / y.of >= share : y.rating >= PR.SS);
        if (ok(top)) cut = { n: max };
        else if (!ok(zero)) cut = { n: 0, none: true };
        else {
          let lo = 0, hi = max;
          while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ok(await sim(mid))) lo = mid; else hi = mid; }
          cut = { n: lo };
        }
        cut.from = "simulation";
      }
      if (!must) cut = Object.assign(cut, { n: max, none: false, loose: true });
      await sim(cut.n);
      return Object.assign(cut, { perRace, rows: [...memo.values()].sort((a, b) => a.n - b.n), simScen: sc });
    }

    // The uma.moe search for Parent 2 with this Parent 1.
    function linkFor(x, t, p1, train) {
      const saddles = train ? train.agenda.map((r) => ctx.saddles[r.name]).filter(Boolean) : CP.saddlesOf(p1);
      const want = CP.want(x), whites = CP.missingWhites(x, p1.s).slice(0, 4);
      const blue = want.blue.map((b) => b.i);
      return Object.assign(CP.umaMoe({ ace: t.id, p1: { tid: p1.f.p1.tid, saddles }, blue, whites: whites.map((w) => w.id) }), { blue: want.blue, whites, pink: want.pink, green: want.green.slice(0, 3), wins: saddles.length });
    }

    // The uma.moe search for Parent 2 with this Parent 1.
    function linkFor(x, t, p1, train) {
      const saddles = train ? train.agenda.map((r) => ctx.saddles[r.name]).filter(Boolean) : CP.saddlesOf(p1);
      const want = CP.want(x), whites = CP.missingWhites(x, p1.s).slice(0, 4);
      const blue = want.blue.map((b) => b.i);
      return Object.assign(CP.umaMoe({ ace: t.id, p1: { tid: p1.f.p1.tid, saddles }, blue, whites: whites.map((w) => w.id) }), { blue: want.blue, whites, pink: want.pink, green: want.green.slice(0, 3), wins: saddles.length });
    }

    // ---------- drawing ----------
    function render(body) {
      const c = st();
      body.innerHTML = `<div class="cmp">
        <section class="panel"><h2>CM/LoH planner</h2><p class="mini">One section per ace, top to bottom: search her racing deck from your cards and change it as you like, then find her parents for that deck. Parent 1 comes from your veterans <i>given the deck</i> (a spark for a skill the deck already offers is worth only its hint's discount), or a fresh one to train when none of your veterans is good enough, with the G1s she should win; Parent 2 comes from uma.moe, with the search set up for you.</p></section>
        ${importHTML()}${setupHTML(c)}${aceHTML(c)}${howHTML()}
      </div>`;
      body.querySelectorAll("details[data-cmp-open]").forEach((el) => el.addEventListener("toggle", () => { opened[el.dataset.cmpOpen] = el.open; }));
    }

    function importHTML() {
      const v = ctx.veterans(), n = v.list.length, owned = Object.keys(ctx.owned()).length;
      return `<section class="panel"><details class="cmp-import"${n ? "" : " open"}><summary><b>Your umaextractor export</b> · ${n ? `${plural(n, "veteran")} imported ${esc(v.at || "")}` : "not imported yet"} · ${plural(owned, "card")} in My cards · ${plural(ctx.myUmas().size, "uma")} in My umas</summary>
        <p class="mini">Paste the JSON from umaextractor (or pick the file) whenever you've trained more: it replaces your veterans and adds to My umas and My cards (each card at least at the limit break you trained it with; a card you've raised since stays as you set it). The Parents tab shares the same list.</p>
        <textarea class="fp-vets" id="cmpVetsText" rows="3" placeholder="Paste the umaextractor JSON here"></textarea>
        <div class="row-wrap"><button type="button" class="btn small" id="cmpImport">Import</button><label class="btn ghost small">Pick the file<input type="file" accept=".json,application/json" id="cmpVetsFile" hidden></label></div>
      </details></section>`;
    }

    function setupHTML(c) {
      const p = cup(c), list = aces(c), mine = [...ctx.myUmas()].map(trainee).filter(Boolean).sort((a, b) => a.n.localeCompare(b.n) || a.t.localeCompare(b.t));
      const cupOpts = cups().map((x) => `<option value="${esc(x.id)}"${x.id === c.cup ? " selected" : ""}>${esc(ctx.cupLabel(x))}</option>`).join("");
      const row = (a, i) => {
        const t = trainee(a && a.tid);
        return `<div class="row-wrap cmp-ace-pick"><label class="field"><span>Ace ${i + 1}</span><select data-cmp-ace="${i}"><option value="">—</option>${mine.map((m) => `<option value="${m.id}"${t && m.id === t.id ? " selected" : ""}>${esc(m.n + " [" + m.t + "]")}</option>`).join("")}</select></label>
          <label class="field"><span>Running style</span><select data-cmp-style="${i}"${t ? "" : " disabled"}>${STYLES.map(([k, l]) => `<option value="${k}"${t && styleOf(a) === k ? " selected" : ""}>${l}${t ? " (" + t.apt[6 + STYLES.findIndex((s) => s[0] === k)] + ")" : ""}</option>`).join("")}</select></label>
          ${t ? `<span class="mini">${esc(p.course.surface)} ${esc(t.apt[p.course.surface === "Dirt" ? 1 : 0])} · ${esc(p.course.dist)} ${esc(t.apt[{ Sprint: 2, Mile: 3, Medium: 4, Long: 5 }[p.course.dist]] || "?")}</span>` : ""}</div>`;
      };
      const rows = list.slice(0, MAX_ACES).map(row).join("") + (list.length < MAX_ACES ? row(null, list.length) : "");
      const team = ctx.pullTeam(p).filter((m) => ctx.myUmas().has(+m.tid));
      return `<section class="panel">
        <div class="pp-form"><label class="field"><span>The cup</span><select id="cmpCup">${cupOpts}</select></label></div>
        <p class="mini">${esc(p.course.track)} ${p.course.distance}m ${esc(p.course.surface)} (${esc(p.course.dist)})${p.global.est ? " · estimated date" : ""}. Pick up to three aces from My umas${mine.length ? "" : " (tick yours in the Trainees tab, or import your export above)"}.</p>
        ${rows}
        <div class="row-wrap">${team.length ? `<button type="button" class="btn ghost small" id="cmpTeam">Use my Pull planner team for this track</button>` : ""}${list.length ? `<button type="button" class="btn ghost small" id="cmpClear">Clear the aces</button>` : ""}
          <label class="chip-toggle"><input type="checkbox" id="cmpSS"${c.ssMust ? " checked" : ""}> SS is a must for a parent you train (fewer races if needed)</label></div>
      </section>`;
    }

    // The ace you're working on: ① her deck, ② her parents.
    function aceHTML(c) {
      const a = current(c);
      if (!a) return "";
      const list = aces(c).filter((x) => trainee(x.tid)), t = trainee(a.tid), p = cup(c);
      const chips = list.length > 1 ? `<div class="row-wrap cmp-chips" role="tablist" aria-label="Your aces">${list.map((x) => `<button type="button" role="tab" class="chip" data-cmp-sel="${x.tid}" aria-selected="${x.tid === a.tid}">${esc(tName(trainee(x.tid)))} · ${STYLE_LABEL[styleOf(x)]}</button>`).join("")}</div>` : "";
      const prog = job ? `<div class="row-wrap"><span class="progress"><i style="width:${Math.round(job.f * 100)}%"></i></span><span class="mini">${esc(job.stage)}</span></div>` : "";
      return `<section class="panel cmp-ace">${chips}<h3>${esc(tName(t))} · ${STYLE_LABEL[styleOf(a)]}</h3>
        <h4>① Her deck</h4>${deckHTML(c, a, p)}
        <h4>② Her parents</h4>${parentsHTML(c, a, p)}
        ${prog}
      </section>`;
    }

    function deckHTML(c, a, p) {
      const d = deckOf(c, a), v = view(c, a), k = keyOf(c, a);
      const opt = (pairs, val) => pairs.map(([x, l]) => `<option value="${x}"${String(val) === String(x) ? " selected" : ""}>${esc(l)}</option>`).join("");
      const comp = `<div class="comp"><span class="mini"><b>Deck makeup</b> (how many of each type, the friend's card included; “Any” lets the search decide):</span>
        <div class="comp-row">${ctx.compTypes.map(([ty, l]) => `<label class="field comp-f ty-${ty}"><span><i class="tydot"></i>${l}</span><select data-cmp-comp="${ty}"><option value="">Any</option>${[0, 1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}"${d.comp[ty] === n ? " selected" : ""}>${n}</option>`).join("")}</select></label>`).join("")}</div></div>`;
      const skills = ctx.raceSkills(p, styleOf(a));
      const must = `<div class="row-wrap"><label class="field grow"><span>Must-have skills (the deck offers them)</span><select data-cmp-must-add><option value="">Add a skill…</option>${skills.filter((x) => d.must.indexOf(String(x.id)) === -1).slice(0, 80).map((x) => `<option value="${x.id}">${esc(ctx.skillName(x.id))} · ${x.L.toFixed(2)} L</option>`).join("")}</select></label></div>
        ${d.must.length ? `<div class="row-wrap">${d.must.map((id) => `<span class="chip">${esc(ctx.skillName(id))} <button type="button" class="linkish" data-cmp-must-del="${id}" aria-label="Remove">✕</button></span>`).join("")}</div>` : ""}`;
      const out = d.exclude.length ? `<p class="mini">Left out of her searches: ${d.exclude.map((id) => `<span class="chip">${esc(cardName(id))} <button type="button" class="linkish" data-cmp-unexclude="${id}" aria-label="Allow again">✕</button></span>`).join(" ")}</p>` : "";
      const opts = `<details class="cmp-deckset" data-cmp-open="set"${(opened.set != null ? opened.set : !d.cards) ? " open" : ""}><summary class="mini"><b>Deck settings</b> · ${Object.keys(d.comp).length ? Object.keys(d.comp).map((ty) => `${d.comp[ty]} ${TYPE_LABEL[ty]}`).join(", ") : "any makeup"} · ${d.borrow ? "a friend's card" : "no friend's card"}${d.must.length ? ` · ${plural(d.must.length, "must-have")}` : ""}</summary>
        ${comp}
        <div class="row-wrap"><label class="chip-toggle"><input type="checkbox" data-cmp-borrow${d.borrow ? " checked" : ""}> Borrow 1 card from a friend</label>
          <label class="field"><span>Skill hints count</span><select data-cmp-skillw>${opt(ctx.skillWeights, d.skillW)}</select></label></div>
        ${must}</details>`;
      const run = `<div class="row-wrap"><button type="button" class="btn" id="cmpDeck"${job ? " disabled" : ""}>${d.cards ? "Search again" : "Search deck"}</button><span class="mini">${d.cards && d.cards.some((x) => x.locked) ? "Keeps your locked cards." : "From My cards at your limit breaks."}</span></div>`;
      const aim = targetsHTML(c, a, p, d) + `<div class="row-wrap"><button type="button" class="btn small" id="cmpTarget"${job ? " disabled" : ""}>Search toward my targets</button><span class="mini">Searches her deck first, then swaps toward your targets.</span></div>`;
      if (!d.cards) return opts + run + out + aim;
      if (!v) return opts + run + `<p class="mini">Loading the card data…</p>` + aim;
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
      return opts + run + `<ol class="cmp-deck">${slots}${emptyRows}</ol>
        <p class="mini"><b>Deck score ${fmtN(v.total)}</b>${diff}: each card's value with the other five fixed, added up.${note ? ` <span class="warn">${esc(note)}</span>` : ""}</p>
        ${offers ? `<p class="mini">Its best race skills, with the chance it offers each: ${offers}.</p>` : ""}
        ${out}
        ${targetsHTML(c, a, p, d)}
        <div class="row-wrap"><button type="button" class="btn ghost small" id="cmpSim"${job || v.cards.length < 6 ? " disabled" : ""}>Simulate this deck</button><button type="button" class="btn small" id="cmpTarget"${job ? " disabled" : ""}>Search toward my targets</button><button type="button" class="btn ghost small" id="cmpUseCM"${v.cards.length ? "" : " disabled"}>Use this deck in CM &amp; decks</button></div>
        ${simOk ? predictedHTML(sim, p, d) : ""}`;
    }

    // The stats you're aiming for: blank boxes show (and use) the race build's targets.
    function targetsHTML(c, a, p, d) {
      const bt = ctx.buildTarget(p), coach = ctx.coachTargets();
      return `<div class="cmp-targets"><span class="mini"><b>Stats you're aiming for</b> (blank: the ${esc(ctx.buildLabel(p))} targets shown). <b>Search toward my targets</b> swaps cards until her simulated careers end closest to them; <b>Simulate this deck</b> shows how close this one gets.</span>
        <div class="tg-row">${STATS.map((x, i) => `<label class="field"><span>${F.STAT_LABELS[i]}</span><input type="number" inputmode="numeric" min="0" max="2500" step="50" data-cmp-target="${x}" value="${d.targets[x] > 0 ? d.targets[x] : ""}" placeholder="${bt[x]}"></label>`).join("")}</div>
        ${coach || targetsOf(d) ? `<div class="row-wrap">${coach ? `<button type="button" class="btn ghost small" id="cmpTgCoach">Use the turn coach's targets</button>` : ""}${targetsOf(d) ? `<button type="button" class="btn ghost small" id="cmpTgClear">Clear targets</button>` : ""}</div>` : ""}</div>`;
    }
    // Predicted stats against the targets (the race build's where you left one blank).
    function predictedHTML(sim, p, d) {
      const bt = ctx.buildTarget(p), mine = targetsOf(d) || {};
      const tg = (x) => (sim.target && sim.target[x] != null ? sim.target[x] : mine[x] != null ? mine[x] : bt[x]);
      let short = 0;
      const rows = STATS.map((x, i) => {
        const t = tg(x), have = sim.stats[i], gap = have - t;
        if (gap < 0) short -= gap;
        return `<tr><td>${F.STAT_LABELS[i]}</td><td class="num">${t}${mine[x] == null ? '<span class="mini"> build</span>' : ""}</td>${sim.before ? `<td class="num">${sim.before.stats[i]}</td>` : ""}<td class="num"><b>${have}</b></td><td class="num ${gap < 0 ? "warn" : ""}">${gap < 0 ? "−" + fmtN(-gap) + " short" : "+" + fmtN(gap)}</td></tr>`;
      }).join("");
      const swaps = sim.swaps && sim.swaps.length ? `<p class="mini">The search swapped ${sim.swaps.map((w) => `${esc(cardName(w.out))} → <b>${esc(cardName(w.in))}</b>`).join(", ")}: ${fmtN(sim.before.short)} short in all before, ${fmtN(sim.short)} after.</p>` : sim.before ? `<p class="mini">No swap got her careers closer to your targets: this deck is already the closest the search found (${fmtN(sim.short)} short in all).</p>` : "";
      return `<div class="table-wrap"><table class="plan cmp-pred"><thead><tr><th>Stat</th><th class="num">Target</th>${sim.before ? '<th class="num">Before</th>' : ""}<th class="num">Predicted</th><th class="num"></th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="mini">${fmtN(short)} short in all · ${fmtN(sim.sp)} SP. Average of 16 simulated careers in ${esc(sim.scenario)} (the coach's scenario), before inheritance.</p>${swaps}`;
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
      const btn = `<div class="row-wrap"><button type="button" class="btn" id="cmpParents"${job || !has ? " disabled" : ""}>${r ? "Find her parents again" : "Find her parents"}</button><span class="mini">${has ? "For her deck as it is above." : "Search her deck first: her parents are picked for it."}</span>${stale ? `<span class="mini warn">Her deck${r.inputs !== inputsKey(c) ? " or your veterans" : ""} changed since: find them again.</span>` : ""}</div>`;
      if (!r) return btn;
      return btn + `<h4 class="cmp-sub">Parent 1</h4>${p1HTML(r)}
        <h4 class="cmp-sub">Parent 2: a friend's rental</h4>${p2HTML(r)}
        ${r.train ? `<details class="cmp-train" data-cmp-open="train"${(opened.train != null ? opened.train : r.useFresh) ? " open" : ""}><summary><b>${r.useFresh ? "Train her: " : "A fresh Parent 1, if you train one anyway: "}${esc(tName(r.train.f.t))}</b> · ${plural(r.train.ss.n, "extra race")}${r.train.ss.none ? " (short of SS even without extra races)" : ""}</summary>${trainHTML(r, p)}</details>` : ""}`;
    }

    const sparks = (m) => [m.blue && m.blue[1] ? `${F.STAT_LABELS[m.blue[0]]} ${m.blue[1]}★` : "", m.pink && m.pink[1] ? `${F.APT_LABELS[m.pink[0]]} ${m.pink[1]}★` : "", m.green ? `green ${m.green}★` : "", m.white && m.white.length ? plural(m.white.length, "white") : "", m.wins && m.wins.length ? `${m.wins.length} G1` : ""].filter(Boolean).join(" · ");
    const vetName = (v) => tName(trainee(v.tid)) || ctx.charName(v.cid);
    const topSkills = (s, slots) => s.white.filter((w) => !slots || slots.indexOf(w.slot) !== -1).sort((a, b) => b.p * b.worth - a.p * a.worth).slice(0, 3).map((w) => esc(ctx.skillName(w.id))).join(", ");

    function famLine(s) { return `family score <b>${fmt(s.value)}</b> · affinity <b>${s.total} ${s.symbol}</b>`; }

    function p1HTML(r) {
      const v0 = r.vets[0], f0 = r.fresh[0];
      let out = "";
      if (r.useFresh) {
        const f = r.train.f;
        out += `<p><b>Train a new one: ${esc(tName(f.t))}</b>, with your veterans ${f.parents.map((v) => `<b>${esc(vetName(v))}</b>`).join(" and ")} as her parents (the ace's grandparents). Expected ${famLine(Object.assign({}, f.s, { value: f.value }))}${v0 ? `, against ${fmt(v0.value)} for your best veteran, ${esc(vetName(v0.v))}` : ""}. How to train her: below.</p>`;
      } else if (v0) {
        const v = v0.v;
        out += `<p><b>Your veteran ${esc(vetName(v))}</b> <span class="mini">(rating ${(v.score || 0).toLocaleString("en-US")} · ${sparks(v.self)}${v.parents.some(Boolean) ? ` · her parents ${v.parents.filter(Boolean).map((m) => esc(ctx.charName(m.cid))).join(" + ")}` : ""})</span>: ${famLine(v0.s)}${topSkills(v0.s, ["p1", "g11", "g12"]) ? `. Her family's best sparks here: ${topSkills(v0.s, ["p1", "g11", "g12"])}` : ""}.</p>
          <p class="mini">${f0 ? `Good enough: the best fresh Parent 1 you could train, ${esc(tName(f0.t))} (with ${f0.parents.map((x) => esc(vetName(x))).join(" + ")}), would score about ${fmt(f0.value)}${f0.value > v0.value ? `, ${Math.round((f0.value / v0.value - 1) * 100)}% more: not the ${Math.round(root.UmaCmPlan.MARGIN * 100)}% a new career is worth` : ""}.` : "None of your umas would do better as a fresh Parent 1."}</p>`;
      } else out += `<p class="mini">None of your veterans can be her Parent 1 (import your export above)${f0 ? "" : ", and no uma in My umas could be trained for it"}.</p>`;
      if (r.vets.length > 1 || (r.useFresh && r.vets.length)) {
        out += `<details><summary class="mini">Your best veterans as Parent 1 (${r.vets.length})</summary><div class="table-wrap"><table class="plan"><thead><tr><th>Veteran (and her parents)</th><th class="num">Family</th><th class="num">Affinity</th></tr></thead><tbody>${r.vets.map((x) => `<tr><td>${esc(vetName(x.v))}<div class="mini">rating ${(x.v.score || 0).toLocaleString("en-US")} · ${sparks(x.v.self)}${x.v.parents.some(Boolean) ? ` · parents ${x.v.parents.filter(Boolean).map((m) => esc(ctx.charName(m.cid))).join(" + ")}` : ""}</div></td><td class="num">${fmt(x.value)}</td><td class="num">${x.s.total} ${x.s.symbol}</td></tr>`).join("")}</tbody></table></div>
          <p class="mini">Each with her own two parents as the ace's grandparents, and Parent 2 as the rental character that suits her and the ace best (${r.vets[0] && r.vets[0].rent ? esc(ctx.charName(r.vets[0].rent.cid)) + " for the first" : "sparks unknown"}) until you pick a real one below.</p></details>`;
      }
      if (r.fresh.length) {
        out += `<details><summary class="mini">Fresh Parent 1s you could train (${r.fresh.length})</summary><div class="table-wrap"><table class="plan"><thead><tr><th>Train her, with these parents</th><th class="num">Expected family</th><th class="num">Affinity</th></tr></thead><tbody>${r.fresh.map((x) => `<tr><td>${esc(tName(x.t))}<div class="mini">${x.parents.map((v) => esc(vetName(v))).join(" + ")} · ${plural(x.f.p1.wins.filter((n, i, a) => a.indexOf(n) === i).length, "G1")} shared or career goals</div></td><td class="num">${fmt(x.value)}</td><td class="num">${x.s.total} ${x.s.symbol}</td></tr>`).join("")}</tbody></table></div>
          <p class="mini">Expected at your veterans' own rates (${ratesText(r.fresh[0].rates)}), with her inherited unique at 2★, and her pink and blue sparks on a random aptitude and stat.</p></details>`;
      }
      return out;
    }
    const ratesText = (q) => `${Math.round(q.spark * 100)}% of learned skills became white sparks, ${q.stars.map((v, i) => `${i + 1}★ ${Math.round(v * 100)}%`).join(" / ")}, about ${q.learn} relevant skills learned${q.vets ? ` (from ${plural(q.vets, "veteran")})` : " (defaults: import your export to use your own)"}`;

    function p2HTML(r) {
      if (!r.p1) return `<p class="mini">Pick Parent 1 first.</p>`;
      const l = r.link, p1 = r.p1, t = r.t;
      const name = ctx.skillName;
      const blue = l.blue.map((b) => `<b>${b.label} 3★</b>`).join(" or ");
      const items = [
        `<b>Affinity</b> → Target character: <b>${esc(tName(t))}</b>${p1.kind === "vet" ? ` · Legacy: your <b>${esc(vetName(p1.v))}</b> (if she's in your uma.moe veterans)` : ""}`,
        `<b>Main Parent Factors</b> → Blue: ${blue}${l.blue.length > 1 ? " (add both, the second set to OR)" : ""}`,
        l.whites.length ? `<b>White Factors</b> → Preferred: ${l.whites.map((w) => `<b>${esc(name(w.id))}</b>`).join(", ")}` : "",
        l.pink.length ? `optional, Pink: <b>${l.pink.map((x) => x.label).join(", ")}</b> (she has ${l.pink.map((x) => x.grade).join(", ")} there)` : "",
        l.green.length ? `optional, Green: <b>${l.green.map((g) => esc(name(g.id))).join(", ")}</b>` : "",
        `<b>Sort by</b>: Affinity`,
      ].filter(Boolean);
      const rents = CP.rankRentals(r.x, p1, ctx.rentals());
      return `<p><a class="btn small" href="${esc(l.url)}" target="_blank" rel="noopener">Search uma.moe for her Parent 2</a> <span class="mini">opens its database with these filters set, sorted by affinity with ${esc(tName(t))} and your ${esc(p1.kind === "vet" ? vetName(p1.v) : tName(p1.t))} (her character and ${plural(l.wins, "race win")}${p1.kind === "fresh" ? " she'll have" : ""}; shared G1s add affinity there too):</span></p>
        <ul class="mini cmp-filters">${items.map((x) => `<li>${x}</li>`).join("")}</ul>
        <details class="cmp-rent" data-cmp-open="rent"${(opened.rent != null ? opened.rent : rents.length > 0) ? " open" : ""}><summary class="mini"><b>Paste rentals from uma.moe</b> · ${ctx.rentals().length ? `${ctx.rentals().length} pasted` : "none yet"}</summary>
          <p class="mini">On uma.moe, select whole parent cards (from the trainer's name to the last race spark), copy, and paste here: each is ranked as Parent 2 with this Parent 1. The Parents tab keeps the same list.</p>
          <textarea class="fp-vets" data-cmp-rent-text rows="3" placeholder="Paste uma.moe parent cards here"></textarea>
          <div class="row-wrap"><button type="button" class="btn small" data-cmp-rent-add>Add</button>${ctx.rentals().length ? `<button type="button" class="btn ghost small" data-cmp-rent-clear>Remove all</button>` : ""}</div>
          ${rents.length ? `<div class="table-wrap"><table class="plan"><thead><tr><th>Rental (and her parents)</th><th>Friend</th><th class="num">Family</th><th class="num">Affinity</th></tr></thead><tbody>${rents.slice(0, 10).map((x) => `<tr><td>${esc(x.r.names[0])} <span class="mini">+ ${esc(x.r.names[1] || "")} + ${esc(x.r.names[2] || "")}</span><div class="mini">${sparks(x.r.parent)}${topSkills(x.s, ["p2", "g21", "g22"]) ? ` · best sparks: ${topSkills(x.s, ["p2", "g21", "g22"])}` : ""}</div></td><td>${esc(x.r.trainer)}<div class="mini">${esc(x.r.friend.replace(/(\d{3})(?=\d)/g, "$1 "))}</div></td><td class="num">${fmt(x.value)}</td><td class="num">${x.s.total} ${x.s.symbol}</td></tr>`).join("")}</tbody></table></div>` : ""}
          ${rents.hidden && rents.hidden.length ? `<p class="mini">Not shown (the game wouldn't allow them here): ${rents.hidden.map((h) => `${esc(h.r.trainer)}'s ${esc(h.r.names[0])} (${esc(h.why)})`).join("; ")}.</p>` : ""}
        </details>`;
    }

    // Where her race count comes from, in words.
    function ssText(ss) {
      const pct = Math.round(root.UmaCmPlan.SS_SHARE * 100), each = Math.round(ss.perRace);
      if (ss.loose) return `SS isn't a must (the box above), so every race she can fit is in: each extra race costs her about ${each} rating in the simulation.`;
      if (ss.from === "veterans") {
        const b = ss.base, more = b.more.n ? ` Those of yours that ran more reached SS in ${b.more.ss} of ${b.more.n}.` : "";
        if (ss.none) return `<span class="warn">Your ${esc(ss.scen.name)} veterans with at most one extra race reached SS in only ${b.ss} of ${b.n}</span>, under ${pct}%: no extra races, and the Parents tab's ④ shows what to buy to close the gap.${more}`;
        return `Your ${b.n} ${esc(ss.scen.name)} veterans with at most one extra race reached SS in ${b.ss}; each extra race costs her about ${each} rating (simulated), so ${ss.n ? `${plural(ss.n, "extra race")} still keep${ss.n === 1 ? "s" : ""} ${ss.ss} of those ${b.n} ratings at SS (${pct}% needed)` : `any extra race would drop them under ${pct}%`}.${more}`;
      }
      if (ss.none) return `<span class="warn">The simulation puts her short of SS even with no extra races</span> (it leaves out inheritance, so it runs low): import more of your veterans in this scenario to plan from your real ratings, or check the buy in the Parents tab's ④.`;
      return `From the simulation alone (too few of your veterans in this scenario to go by; it leaves out inheritance, so it runs low): ${plural(ss.n, "extra race")} keep ${pct}% of the simulated careers at SS; each costs about ${each} rating.`;
    }
    function trainHTML(r, p) {
      const tr = r.train, f = tr.f, ss = tr.ss;
      const shared = (x) => `shared with ${x.with.map((role) => esc(vetName(f.parents[role === "g12" ? 1 : 0]))).join(" and ")} (+${3 * x.with.length} affinity)`;
      const why = (x) => {
        if (x.free) return (x.goal === "choice" ? "career goal: pick this one" : x.goal === "open" ? "career goal: either one" : "career goal") + (x.with && x.with.length ? " · " + shared(x) : "");
        if (!x.extra) return shared(x);
        return `won by ${x.pop} of your veterans and their parents: a rental likely shares it`;
      };
      const all = tr.races.agenda.concat(tr.races.goals || []).sort((a, b) => a.turn - b.turn);
      const rows = all.map((x) => { const keep = x.free || x.rank < ss.n; return `<tr${keep ? "" : ' class="cmp-cut"'}><td class="num">${x.turn}<div class="mini">${esc(ctx.turnText(x.turn))}</div></td><td><b>${esc(x.name)}</b>${x.d ? `<div class="mini">${x.d}m ${x.s === 2 ? "dirt" : "turf"}${x.aptGrades ? " · aptitude " + x.aptGrades.join("/") : ""}</div>` : ""}</td><td class="mini">${why(x)}${keep ? "" : " · <b>skip</b>: past what keeps her at SS"}</td></tr>`; }).join("");
      const ssRows = ss.rows.map((x) => `<tr${x.n === ss.n ? ' class="cur"' : ""}><td class="num">${x.n}${x.n === ss.n ? " ←" : ""}</td>${x.stats.map((v) => `<td class="num">${v}</td>`).join("")}<td class="num">${x.sp}</td><td class="num">${x.rating.toLocaleString("en-US")}</td><td class="num">${x.hit}/${x.of}</td></tr>`).join("");
      const w = f.extra.whites.list.slice(0, 6).map((y) => esc(ctx.skillName(y.id))).join(", ");
      return `<p class="mini">Her own parents: ${f.parents.map((v) => `your <b>${esc(vetName(v))}</b> <span class="mini">(${sparks(v.self)})</span>`).join(" and ")}. Her own affinity in the ace's family: ${f.s.own.p1}.</p>
        <p><b>Her deck</b> (an Ace parent deck from your cards, Independent Training): ${tr.deck.cards.map((x) => esc(cardName(x.id)) + ` <span class="mini">LB${x.lb}${x.borrowed ? ", a friend's" : ""}</span>`).join(", ")}.</p>
        <p class="mini">Build into her: learn the race's skills ${w ? `(<b>${w}</b> first)` : ""} for white sparks, the key stats (${CP.want(r.x).blue.map((b) => b.label).join(", ")}) as high as you can for her blue spark${CP.want(r.x).pink.length ? `, and pink for ${CP.want(r.x).pink.map((x) => x.label).join(", ")} if you can` : ""}.</p>
        <p><b>Her races</b>: ${plural(ss.n, "extra race")} beyond her career goals${tr.races.extraRaces > ss.n ? ` (of the ${tr.races.extraRaces} she could run)` : ""}. The G1s her parents won come first (each shared win adds 3 affinity for her and that parent), then the G1s a rental most likely shares.</p>
        <p class="mini">${ssText(ss)}</p>
        <div class="table-wrap"><table class="plan cmp-races"><thead><tr><th class="num">Turn</th><th>Race</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table></div>
        ${tr.races.skipped.some((x) => x.points > 0) ? `<p class="mini">No free turn for ${tr.races.skipped.filter((x) => x.points > 0).map((x) => esc(x.name)).join(", ")}, which her parents won: it's held on a turn her career already takes.</p>` : ""}
        <details><summary class="mini">What the races cost: about ${Math.round(ss.perRace)} rating each, simulated</summary>
          <div class="table-wrap"><table class="plan pp-cost"><thead><tr><th class="num">Extra races</th>${F.STAT_LABELS.map((l) => `<th class="num">${l.slice(0, 3)}</th>`).join("")}<th class="num">SP</th><th class="num">Rating</th><th class="num">SS</th></tr></thead><tbody>${ssRows}</tbody></table></div>
          <p class="mini">Simulated in ${esc(ss.simScen.name)} (the coach's scenario) with her deck above, Independent Training, 16 careers each, rated as the Parents tab does (skill points spent on her relevant skills). It leaves out inheritance, so its ratings run low; the planner takes only what each race costs from it${ss.from === "veterans" ? ", and the ratings you reach from your veterans" : ""}.</p></details>
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
      return `<div class="cmp-steps"><p class="mini"><b>Train her in the Parents tab</b>${ready ? ": she's set up there; each button takes you to that step (the bar at the top of the tab brings you back here)." : ": the first click sets her up there (her as the parent you're training, also the coach's trainee; her races in ②; the ace's race in ③; these whites as spark ★ in ④; this family in 2 · Her parents), then takes you to the step. The bar at the top of the tab brings you back here."}</p>
        <div class="row-wrap">${step("family", "Her family")}${step("races", "② Her races and their cost")}${step("deck", "③ Her deck")}${step("rating", "④ Skills to buy for SS")}${ready ? `<button type="button" class="linkish" data-cmp-resend>Set her up there again</button>` : ""}</div></div>`;
    }

    function howHTML() {
      return `<section class="panel"><details><summary><b>How the planner decides</b></summary><ul class="mini">
        <li><b>The deck</b>: <b>Search deck</b> is CM &amp; decks' quick build (Euophrys' scoring plus the race's skill values for her style) from My cards at your limit breaks and a friend's SSR at LB4, with this section's makeup, friend card, skill weight and must-have skills. Cards you lock stay; cards you leave out never come back until you let them. A card's score is its value with the other five fixed (what the search compares); the deck score adds them up. CM &amp; decks can go further (target stats).</li>
        <li><b>Parent 1</b> is scored with the Parents tab's family score: each relevant spark's chance (by stars × the uma's own affinity, at two inspirations) × what it's worth to the ace, plus blue start bonuses on the key stats and needed pinks. A white spark is worth its skill's L only when her deck doesn't offer the skill (a hint for one it offers, or one she has innately, only takes some SP off: about ${F.HINT_L} L).</li>
        <li><b>A fresh Parent 1</b> is any uma in My umas, with the two of your veterans that suit her best as her own parents. She's valued at your own veterans' rates: the relevant whites her parent deck offers, learned as many as your veterans learn and turned into sparks as often as theirs were. She's suggested when she'd beat your best veteran by ${Math.round(root.UmaCmPlan.MARGIN * 100)}%: a whole career is a lot to spend on less.</li>
        <li><b>Her races</b>: career goals keep their turns; then the G1s her parents won (each shared win: +3 affinity), then the G1s your veterans and their parents won most, at B aptitude or better, one race a turn. With SS a must, as many as keep ${Math.round(root.UmaCmPlan.SS_SHARE * 100)}% of your runs at SS: your veterans in the scenario you train in that ran ${root.UmaCmPlan.BASE_EXTRA} extra race or none give the ratings you really reach (inheritance, your skill buys and all), and the simulation gives what each extra race costs her. With fewer than ${root.UmaCmPlan.BASE_MIN} such veterans, the simulation alone, which runs low.</li>
        <li><b>Parent 2</b>: the uma.moe link carries its own database filters: the ace as the affinity target and Parent 1 (her character and G1 wins) as the legacy, so its affinity sort counts both, a 3★ blue in a key stat on the rental herself, and the race whites the family still lacks as preferred sparks. Paste the best results back to rank them by the family score.</li>
      </ul></details></section>`;
    }

    // ---------- events ----------
    function click(e) {
      const t = e.target, c = st(), a = current(c);
      if (t.closest("#cmpDeck")) { searchDeck(false); return true; }
      if (t.closest("[data-cmp-fill]")) { searchDeck(true); return true; }
      if (t.closest("#cmpParents")) { findParents(); return true; }
      if (t.closest("#cmpTarget")) { searchTargets(); return true; }
      if (a && t.closest("#cmpTgCoach")) { const d = deckOf(c, a), ct = ctx.coachTargets() || {}; d.targets = {}; STATS.forEach((x) => { if (ct[x] > 0) d.targets[x] = +ct[x]; }); ctx.save(); ctx.rerender(); return true; }
      if (a && t.closest("#cmpTgClear")) { deckOf(c, a).targets = {}; ctx.save(); ctx.rerender(); return true; }
      if (t.closest("#cmpSim")) {
        const v = a && view(c, a);
        if (!v) return true;
        busy("Simulating her deck…", async () => {
          await tick();
          const d = deckOf(c, a), r = ctx.simulateRace(cup(c), styleOf(a), a.tid, cardsNow(d), d.must, targetsOf(d));
          sims.set(keyOf(c, a), Object.assign(r, { sig: v.sig }));
        });
        return true;
      }
      if (t.closest("#cmpUseCM") && a) {
        const d = deckOf(c, a);
        ctx.useInCM({ cup: c.cup, style: styleOf(a), tid: a.tid, comp: d.comp, borrow: d.borrow, skillW: d.skillW, must: d.must, targets: d.targets, cards: cardsNow(d) });
        return true;
      }
      if (t.closest("#cmpImport")) {
        const ta = document.getElementById("cmpVetsText");
        if (!ta || !ta.value.trim()) { ctx.flash("Paste the JSON first."); return true; }
        ctx.importVeterans(ta.value);
        ctx.rerender();
        return true;
      }
      if (t.closest("#cmpTeam")) { c.byCup[c.cup] = ctx.pullTeam(cup(c)).filter((m) => ctx.myUmas().has(+m.tid)).slice(0, MAX_ACES); ctx.save(); ctx.rerender(); return true; }
      if (t.closest("#cmpClear")) { c.byCup[c.cup] = []; ctx.save(); ctx.rerender(); return true; }
      let el;
      if ((el = t.closest("[data-cmp-sel]"))) { c.sel[c.cup] = +el.dataset.cmpSel; swap = null; ctx.save(); ctx.rerender(); return true; }
      if (a && (el = t.closest("[data-cmp-lock]"))) { const x = deckOf(c, a).cards[+el.dataset.cmpLock]; if (x) x.locked = !x.locked; ctx.save(); ctx.rerender(); return true; }
      if (a && (el = t.closest("[data-cmp-swap]"))) { const i = +el.dataset.cmpSwap, k = keyOf(c, a); swap = swap && swap.k === k && swap.i === i ? null : { k, i }; ctx.rerender(); return true; }
      if (a && (el = t.closest("[data-cmp-remove]"))) {
        const d = deckOf(c, a), i = +el.dataset.cmpRemove, x = d.cards[i];
        if (x) { d.cards.splice(i, 1); if (d.exclude.indexOf(x.id) === -1) d.exclude.push(x.id); }
        swap = null; ctx.save(); ctx.rerender();
        return true;
      }
      if (a && (el = t.closest("[data-cmp-put]"))) { const [i, id] = el.dataset.cmpPut.split("|").map(Number); setCard(c, a, i, id); ctx.rerender(); return true; }
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
        ctx.sendToParents({ cup: c.cup, style: r.style, ace: { cid: r.t.cid, tid: r.t.id }, p1: { cid: f.t.cid, tid: f.t.id }, parents: f.parents, races: r.train.agenda.filter((x) => !x.free).map((x) => x.name), wins: [...new Set(r.train.agenda.map((x) => x.name))], must: f.extra.whites.list.slice(0, 5).map((x) => x.id) }, section);
        return true;
      }
      return false;
    }
    function change(e) {
      const t = e.target, c = st(), ds = t.dataset, a = current(c);
      if (t.id === "cmpCup") { c.cup = t.value; swap = null; ctx.save(); ctx.rerender(); return true; }
      if (t.id === "cmpSS") { c.ssMust = t.checked; ctx.save(); ctx.rerender(); return true; }
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
      if (a && ds.cmpPick != null) { if (t.value) setCard(c, a, +ds.cmpPick, +t.value); ctx.rerender(); return true; }
      if (ds.cmpRentText != null || t.id === "cmpVetsText") return true;
      return false;
    }

    return { render, click, change, st };
  }

  const api = { create, PLAN_RACES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaCmTab = api;
})(typeof window !== "undefined" ? window : globalThis);
