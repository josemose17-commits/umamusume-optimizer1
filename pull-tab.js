// The Pull planner tab: your plan (the banners you'll pull 400 on, with your carat estimates),
// your teams, and the route through the banners ahead: 200 or 400 pulls elsewhere, the free and
// $20.99 selectors, and only cards that make your decks clearly stronger in more than one cup.
// pull-values.js builds your decks (in each cup's scenario) and values every banner, trainee and
// selector pick on one scale; pull-planner.js finds the route. Keeps state.pull.
(function (root) {
  "use strict";
  const STYLES = [["Nige", "Front Runner"], ["Senkou", "Pace Chaser"], ["Sasi", "Late Surger"], ["Oikomi", "End Closer"]];
  // The teams you gave (by track): two fixed umas each (Late Surgers for Sprint & Mile; End
  // Closers for Medium & Long; Pace Chasers for Dirt) and a third that rotates through your umas.
  // The teams you gave (by track). The first two of each race every cup of their track once
  // they're yours; the third is yours too, but in CM and LoH that slot is a flex: a fresh uma of
  // yours each cup.
  const DEFAULT_TEAMS = {
    sm: [{ id: 105301, style: "Sasi" }, { id: 106301, style: "Sasi" }, { id: 106101, style: "Sasi", rotate: true }],
    ml: [{ id: 111501, style: "Oikomi" }, { id: 111901, style: "Oikomi" }, { id: 102501, style: "Sasi", rotate: true }],
    dirt: [{ id: 101401, style: "Senkou" }, { id: 109801, style: "Senkou" }, { id: 102902, style: "Senkou", rotate: true }],
  };
  // Your plan as you gave it (another planner's table), fixed: each row's banner at its # Pulls,
  // with the pulls that come free on it (its Free/Tickets/Paid) and that planner's Carat Est.
  // there (your balance after the rows above it). Paste a newer table in the tab to replace it.
  const DEFAULT_PLAN = [
    ["support", "Mejiro Ramonu", null, "2026-12-01", 400, 186, 60040, "Mejiro Ramonu"],
    ["support", "Mei Satake + El Condor Pasa", "Project L'Arc", "2027-04-07", 400, 197, 92700, "El Condor Pasa"],
    ["support", "Ryoka Tsurugi + Orfevre", "U.A.F. Ready GO!", "2027-08-09", 400, 237, 144920, "Orfevre"],
    ["stepup", "Yukino Bijin (Valentine)", "3rd Anniversary ★3 Select Step-Up", "2027-08-09", 0, 0, 115070, "Yukino Bijin (Valentine)"],
    ["trainee", "Dream Journey", "Great Food Festival", "2027-11-01", 200, 224, 164650, "Dream Journey"],
    ["support", "Yayoi Akikawa + Nishino Flower", null, "2027-11-01", 200, 158, 163900, "Yayoi Akikawa"],
    ["support", "Still in Love", null, "2027-12-16", 400, 154, 188030, "Still in Love"],
    ["support", "Daiwa Scarlet + Air Shakur", "Hashire! Mecha Umamusume", "2028-02-02", 200, 130, 178040, "Daiwa Scarlet"],
    ["trainee", "Orfevre", "The Twinkle Legends", "2028-04-24", 200, 116, 233100, "Orfevre"],
    ["support", "Embodiment of Legends + Almond Eye", null, "2028-04-24", 400, 185, 219300, "Almond Eye"],
    ["support", "Tucker Bryne + Tamamo Cross", "Design Your Island", "2028-07-16", 400, 120, 240270, "Tamamo Cross"],
    ["support", "Stay Gold + Admire Groove", null, "2028-08-29", 400, 116, 232880, "Stay Gold"],
    ["support", "Kiyoko Hoshina + Tokai Teio", "Paradise ♪ Yukoma Hot Springs", "2028-10-15", 200, 103, 218300, "Tokai Teio"],
    ["support", "Casino Drive + Forever Young", "Beyond Dreams", "2029-01-10", 400, 164, 285840, "Forever Young"],
    ["support", "Tazuna Hayakawa + Meisho Doto", "Order Up! Tracen Ramen!", "2029-04-07", 400, 107, 291850, "Tazuna Hayakawa"],
    ["support", "Mr. C.B. + Efforia", null, "2029-05-18", 400, 127, 287920, "Mr. C.B."],
  ].map(([kind, names, title, start, pulls, free, carats, target]) => ({ kind, names: names.split(" + "), title, start, pulls, free, carats, target }));
  // The selector picks you've decided: each anniversary's $20.99 Uma selector (by anniversary).
  const DEFAULT_PICKS = { anniv2: 105301, "anniv2.5": 102501 }; // Bamboo Memory, Manhattan Cafe
  const RARITY = ["", "R", "SR", "SSR"];
  const num = (x) => (x == null || x === "" || isNaN(+x) ? 0 : Math.max(0, +x));
  const fmtN = (x) => Math.round(x).toLocaleString("en-US");
  const pct = (x) => Math.round(x * 100) + "%";

  function create(ctx) {
    const { D, B, P, PV, PP, esc, fmtDate } = ctx;
    let job = null;    // the run in progress: { stage, f }
    let result = null; // the last route, with the inputs it was made for
    const tLabel = (t) => t.n + " [" + t.t + "]";
    const byLabel = new Map(D.DATA.trainees.map((t) => [tLabel(t).toLowerCase(), t.id]));

    function S() {
      const s = ctx.state();
      if (!s.pull) s.pull = {};
      const p = s.pull;
      const def = { carats: "", perMonth: "", sTickets: "", tTickets: "", months: "all", minCups: "2", minPct: "10", fade: "20", usePlan: true, selFree: true, selPaid: true, selUma: true };
      Object.keys(def).forEach((k) => { if (p[k] == null) p[k] = def[k]; });
      delete p.luck;
      delete p.parents;
      if (!p.teams) p.teams = JSON.parse(JSON.stringify(DEFAULT_TEAMS));
      // Once: each team's third uma is a flex in CM & LoH (you keep two fixed and use your other
      // umas there); the third you named stays yours. And your newer, fixed plan.
      if (!p.teamsV) { Object.keys(p.teams).forEach((g) => { if (p.teams[g]) p.teams[g][2] = { rotate: true }; }); p.teamsV = 2; p.months = "all"; }
      if (p.teamsV < 3) {
        Object.keys(DEFAULT_TEAMS).forEach((g) => { const m = p.teams[g] && p.teams[g][2]; if (m && m.rotate && !m.id) p.teams[g][2] = Object.assign({}, DEFAULT_TEAMS[g][2]); });
        p.plan = JSON.parse(JSON.stringify(DEFAULT_PLAN));
        p.teamsV = 3;
      }
      if (!p.plan) p.plan = JSON.parse(JSON.stringify(DEFAULT_PLAN));
      if (!p.selPicks) p.selPicks = Object.assign({}, DEFAULT_PICKS);
      return p;
    }
    // The last cup in the forecast (mid-2029): planning to it counts every cup a card will see.
    const lastCup = () => P.list.filter((x) => x.global && x.global.start > ctx.today).map((x) => x.global.start).sort().pop() || ctx.today;
    const until = (p) => {
      if (p.months === "all") return lastCup();
      const d = new Date(Date.parse(ctx.today) + (+p.months || 18) * 30.4375 * 864e5);
      return d.toISOString().slice(0, 10);
    };
    // Your plan matched to the calendar.
    const planned = (p) => (p.usePlan && p.plan && p.plan.length ? PV.matchPlan(p.plan, B, D) : []);
    // Your plan's locks (each row's banner at its # Pulls), its free pulls, and the umas it gets
    // you (its trainee rows and your Uma selector picks) with their dates.
    // Your plan's parts for a run (pull-values.js planParts): its locks, free pulls, the umas it
    // gets you, your selector picks, what's behind you, and the budget.
    const keyOf = (x) => PV.rowKey(x);
    const rowDone = (p, x) => PV.rowDone(x, ctx.today, p.done);
    function planInputs(p) {
      const mine = planned(p);
      return Object.assign({ mine }, PV.planParts(mine, { today: ctx.today, done: p.done, selPicks: p.selPicks, selUma: !!p.selUma, events: B.events || [], caratsNow: p.carats, pullCarats: B.meta.pullCarats }));
    }
    // What the decks rest on (a re-plan with the same keeps them), and everything the route does.
    const deckKey = (p) => JSON.stringify([ctx.today, until(p), p.teams, ctx.ownedCode(), ctx.settingsKey(), [...ctx.myUmas()].sort(), p.usePlan && p.plan, p.selUma && p.selPicks]);
    const inputsKey = (p) => JSON.stringify([deckKey(p), p.carats, p.perMonth, p.sTickets, p.tTickets, p.minCups, p.minPct, p.fade, p.usePlan, p.plan, p.selFree, p.selPaid, p.selUma, p.selPicks, p.done]);
    const relT = (B && B.release && B.release.trainees) || {};
    const traineeOutDate = (t) => t.en || relT[t.id] || null;
    const cardName = (id) => { const c = D.card(id); return c ? c.n + " (" + RARITY[c.r] + " " + c.ty + ")" : "#" + id; };
    const cardShort = (id) => { const c = D.card(id); return c ? c.n + " " + c.ty : "#" + id; };
    const umaName = (id) => { const t = D.trainee(id); return t ? tLabel(t) : "#" + id; };
    const est = (x) => (x.est ? "~" : "");
    const when = (b) => est(b) + fmtDate(b.start < ctx.today ? ctx.today : b.start) + (b.end && !b.est ? " to " + fmtDate(b.end) : "");
    const lb = (copies) => "LB" + Math.min(4, copies - 1);

    // ---------- the run ----------
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const total = (gains) => [...gains.values()].reduce((a, x) => a + (x || 0), 0);
    // Decks, scoring and the route for one set of locks (o: { locked, budget, reuse, label }).
    async function build(p, o) {
      const end = until(p), label = o.label || "";
      const v = PV.create({
        D, T: ctx.T, A: ctx.A, B, P, today: ctx.today, until: end, teams: JSON.parse(JSON.stringify(p.teams)), owned: ctx.owned(), umas: ctx.myUmas(),
        minCups: +p.minCups || 2, minPct: (+p.minPct || 10) / 100, fade: (+p.fade || 0) / 100, locked: o.locked, freePulls: o.freePulls,
        yours: o.yours, lockedPicks: o.lockedPicks, done: o.done,
        selectors: { free: !!p.selFree, paid: !!p.selPaid, uma: !!p.selUma },
        reuse: o.reuse, deckOpts: ctx.deckOpts, whites: ctx.whites, skillL: ctx.skillL,
      });
      const n = v.pairs.length;
      for (let i = 0; i < n; i++) {
        const pair = v.pairs[i];
        job = { stage: label + "Your decks now: " + pair.trainee.n + " for " + pair.cup.name + " (" + (i + 1) + " of " + n + ")", f: 0.5 * i / n };
        ctx.rerender();
        await tick();
        v.buildPair(pair);
      }
      job = { stage: label + "Shortlisting the selector picks…", f: 0.5 };
      ctx.rerender();
      await tick();
      v.addSelectors();
      for (let i = 0; i < n; i++) {
        const pair = v.pairs[i];
        job = { stage: label + "Trying the banner cards in " + pair.trainee.n + "'s deck for " + pair.cup.name + " (" + (i + 1) + " of " + n + ")", f: 0.5 + 0.2 * i / n };
        ctx.rerender();
        await tick();
        v.scorePair(pair);
      }
      // Every banner on one scale, before the route.
      const solo = v.standalone();
      // The route: the step-by-step pass, then (when a pull came after a selector pick) the same
      // pulls in date order with the selector picks on top (pull-values.js route()).
      const rt = v.route(PP, {
        today: ctx.today, carats: num(p.carats), perMonth: num(p.perMonth), budget: o.budget || undefined,
        tickets: { support: num(p.sTickets), trainee: num(p.tTickets) },
        pullCarats: B.meta.pullCarats, spark: B.meta.spark,
      });
      for (;;) {
        const pass = rt.pass(), m = rt.moves();
        job = pass === 1 ? { stage: label + "Choosing the route (" + m + " picks so far)…", f: 0.7 + 0.2 * (1 - Math.exp(-m / 8)) }
          : pass === 2 ? { stage: label + "Checking the pulls in date order…", f: 0.9 }
          : { stage: label + "Choosing the selector picks on top of the pulls…", f: 0.95 };
        ctx.rerender();
        await tick();
        if (!rt.step()) break;
      }
      const out = rt.result();
      return { v, end, solo, plan: out.plan, gains: out.gains, runners: out.runners };
    }
    async function run() {
      const p = S();
      if (job) return;
      job = { stage: "Loading the card data…", f: 0 };
      ctx.rerender();
      try {
        for (let i = 0; !ctx.euReady(); i++) { if (i > 600) throw new Error("The card data didn't load. Check your connection."); await new Promise((r) => setTimeout(r, 100)); }
        const end = until(p), dk = deckKey(p);
        const cupIds = P.list.filter((x) => x.global.start > ctx.today && x.global.start <= end && PV.groupOf(x)).map((x) => x.id);
        job.stage = "Loading each cup's skill values…"; ctx.rerender();
        await ctx.ensureSkills(cupIds);
        // Your plan: its banners locked at 400 (with their free pulls and your target), and its
        // carat estimates as the carats you'll have by each date.
        const { mine, locked, freePulls, yours, lockedPicks, budget, done } = planInputs(p);
        const r = await build(p, { locked, budget, freePulls, yours, lockedPicks, done, reuse: result && result.deckKey === dk ? result.v : null });
        result = { key: inputsKey(p), deckKey: dk, until: r.end, v: r.v, plan: r.plan, gains: r.gains, runners: r.runners, at: ctx.today, solo: r.solo, mine, budget, freePulls, yours, lockedPicks, done, total: total(r.gains), alt: null };
      } catch (err) {
        ctx.flash(err.message || String(err));
      }
      job = null;
      ctx.rerender();
    }
    // The check: the planner's own best route with the same carats and none of your locks, on the
    // same decks, so your plan can be weighed against it.
    async function check() {
      const p = S();
      if (job || !result) return;
      job = { stage: "The planner's own route…", f: 0 };
      ctx.rerender();
      try {
        // The banners of your plan the model can't value (no Euophrys data) stay as you planned.
        const keep = new Map(result.v.items.filter((it) => it.locked && it.blind).map((it) => [it.banner.id, { level: it.required === true ? 1 : it.required, free: it.free || 0, target: it.target }]));
        // Your selector picks and the umas your plan gets stay too: they're your team.
        const r = await build(p, { locked: keep, budget: result.budget, freePulls: result.freePulls, yours: result.yours, lockedPicks: result.lockedPicks, done: result.done, reuse: result.v, label: "The planner's own route: " });
        result.alt = { v: r.v, plan: r.plan, gains: r.gains, total: total(r.gains) };
      } catch (err) {
        ctx.flash(err.message || String(err));
      }
      job = null;
      ctx.rerender();
    }
    // Your plan against the planner's own route: total points, and the banners that differ.
    function checkHTML() {
      if (!result || !result.v.items.some((it) => it.locked)) return "";
      if (!result.alt) {
        return `<div class="row-wrap"><button type="button" class="btn ghost small" id="pullCheck" ${job ? "disabled" : ""}>Check my plan against the planner's own route</button>
          <span class="mini">Plans the same carats with none of your banners locked (a minute or so) and compares.</span></div>`;
      }
      const a = result.alt, mineKeys = new Set(result.v.items.filter((it) => it.locked).map((it) => it.key));
      const pulls = (plan, v) => plan.steps.map((s) => ({ s, it: v.byKey.get(s.key) })).filter((x) => x.it.kind !== "selector");
      const theirs = pulls(a.plan, a.v), ours = pulls(result.plan, result.v);
      const name = (it) => it.banner.pick.map(([id]) => (it.kind === "support" ? cardShort(id) : (D.trainee(id) || {}).n)).join(" + ");
      const added = theirs.filter((x) => !mineKeys.has(x.it.key)), dropped = ours.filter((x) => !a.plan.chosen.get(x.it.key));
      const blind = result.v.items.filter((it) => it.locked && it.blind).length;
      return `<div class="pull-check"><p class="mini"><b>Your plan adds +${fmtN(result.total)} points</b> (selector picks included); <b>the planner's own route adds +${fmtN(a.total)}</b> with the same carats and free pulls${blind ? `, keeping the ${blind} banner${blind === 1 ? "" : "s"} of your plan it can't value (no Euophrys data yet) as you planned` : ""}. ${a.total > result.total * 1.02 ? "By the model, these changes would make your decks stronger:" : "By the model, your plan is about as strong as the planner's own route."}</p>
        ${added.length ? `<ul class="mini">${added.map((x) => `<li>It pulls ${x.s.pulls} on <b>${esc(name(x.it))}</b> (${esc(when(x.it.banner))}), +${fmtN(a.gains.get(x.it.key) || 0)}</li>`).join("")}</ul>` : ""}
        ${dropped.length ? `<p class="mini">It skips from your plan: ${dropped.map((x) => esc(name(x.it)) + " (" + esc(when(x.it.banner)) + ", +" + fmtN(result.gains.get(x.it.key) || 0) + " in your route)").join("; ")}.</p>` : ""}</div>`;
    }

    // ---------- the page ----------
    function budgetHTML(p) {
      const f = (k, label, ph, hint) => `<label class="field"><span>${label}</span><input type="number" min="0" inputmode="numeric" data-pull="${k}" value="${esc(String(p[k]))}" placeholder="${ph}"${hint ? ` title="${esc(hint)}"` : ""}></label>`;
      return `<section class="panel">
        <h3>Your carats</h3>
        <div class="row-wrap">
          ${f("carats", "Carats now", "e.g. 45000")}
          ${f("perMonth", "Carats per month", "e.g. 3000", "Free income guides put at about 2,000–3,500 a month before events and campaigns; type yours, paid carats included if you buy them.")}
          ${f("sTickets", "Support tickets", "0")}
          ${f("tTickets", "Trainee tickets", "0")}
        </div>
        <p class="mini">${B ? `Global's rules: ${B.meta.pullCarats} carats a pull, so 200 pulls (one spark) are ${fmtN(200 * B.meta.pullCarats)} carats and 400 (two sparks) ${fmtN(400 * B.meta.pullCarats)}; spark points don't carry over to the next banner. ` : ""}${p.usePlan && p.plan && p.plan.length
          ? `<b>Your plan's carat estimates are the budget</b> (below): carats per month and the $20.99 packs' carats aren't added on top. Carats now (if you type them) set where the estimate starts today.`
          : `The $20.99 selector packs add 1,500 carats each when you buy them (counted on their dates). Free income has no fixed figure, so type yours.`} Tickets pay for pulls on their kind of banner first.</p>
      </section>`;
    }
    // The selector picks you've decided: an uma for each anniversary's $20.99 Uma selector (the
    // rest are the planner's to choose).
    function picksHTML(p) {
      const ahead = (B.events || []).filter((e) => e.start > ctx.today && e.start <= until(p));
      if (!ahead.length) return "";
      const rows = ahead.map((e) => {
        const id = p.selPicks && p.selPicks[e.id], t = id ? D.trainee(id) : null;
        return `<div class="row-wrap pull-team-row"><span class="field"><span>${esc(e.name)}</span>${esc(est(e) + fmtDate(e.start))}</span>
          <label class="field grow"><span>$20.99 Uma selector pick</span><input list="pullTrainees" data-pull-pick="${esc(e.id)}" value="${esc(t ? tLabel(t) : "")}" placeholder="Blank: the planner chooses" autocomplete="off"></label></div>`;
      }).join("");
      return `<section class="panel">
        <h3>Your selector picks</h3>
        <p class="mini">The Uma picks you've decided (each anniversary's $20.99 Uma selector). Such an uma is yours from that anniversary: for your team, for the flex picks and as a parent. Every other pick (the support selectors, a blank Uma one) is the planner's to choose.${p.selUma ? "" : ` <b>The $20.99 Uma selector is off below, so these don't count.</b>`}</p>
        ${rows}
      </section>`;
    }
    // Your plan: the banners you'll pull no matter what, from another planner's table.
    function planHTML(p) {
      const mine = p.plan && p.plan.length ? PV.matchPlan(p.plan, B, D) : [];
      const kindLabel = (x) => (x.kind === "trainee" ? "Trainee" : x.kind === "stepup" ? "Step-up" : "Support");
      const rows = mine.map((x) => `<tr><td>${esc(kindLabel(x))}${x.title ? `<div class="mini">${esc(x.title)}</div>` : ""}</td><td>${esc(x.names.join(" + "))}${x.target && x.names.length > 1 ? `<div class="mini">your target: ${esc(x.target)}</div>` : ""}</td>
        <td>${esc(fmtDate(x.start))}${x.banner ? `<div class="mini">calendar: ${esc(when(x.banner))}</div>` : x.kind === "stepup" ? `<div class="mini">not modeled${x.pulls ? "" : " (0 steps)"}</div>` : `<div class="mini warn">not on the calendar</div>`}${x.banner && rowDone(p, x)
          ? `<div class="mini"><b>Behind you</b> (${p.done && p.done[keyOf(x)] ? `you entered what you got <button type="button" class="btn ghost small" data-pull-undone="${esc(keyOf(x))}">Undo</button>` : "it has ended"})</div>` : ""}</td>
        <td class="num">${x.kind === "stepup" ? fmtN(x.pulls || 0) + " steps" : fmtN(x.pulls || 0)}</td><td class="num">${fmtN(x.free || 0)}</td><td class="num">${x.carats != null ? fmtN(x.carats) : "—"}</td></tr>`).join("");
      return `<section class="panel">
        <h3>Your plan</h3>
        <label class="chip-toggle"><input type="checkbox" data-pull="usePlan" ${p.usePlan ? "checked" : ""}> Pull these no matter what (each at its # Pulls), and use their carat estimates as my budget</label>
        ${mine.length ? `<div class="table-wrap"><table><thead><tr><th>Type</th><th>Banner</th><th>Starts</th><th class="num">Pulls</th><th class="num">Free on it</th><th class="num">Carat Est.</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">No plan yet: paste your planner's table below.</div>`}
        <p class="mini">Carat Est.: your planner's balance at that banner, after the pulls of the rows above it (two rows on one day show it), so the budget adds those back. Free on it: its Free/Tickets/Paid pulls, usable on that banner only (spent before carats). A trainee row for one of your team's umas makes her yours from that banner. The route takes these banners first, in date order, and says if any don't fit.</p>
        <details><summary>Paste a newer table</summary>
          <textarea id="pullPlanText" class="codebox" rows="6" placeholder="Paste your planner's table (each banner's Recommended:, Start:, Free/Tickets/Paid, Carat Est.)"></textarea>
          <div class="row-wrap"><button type="button" class="btn small" id="pullPlanRead">Read my table</button><button type="button" class="btn ghost small" id="pullPlanReset">Back to the plan you sent</button></div>
        </details>
      </section>`;
    }
    function teamsHTML(p) {
      const { yours } = planInputs(p);
      // When she's yours, and why: My umas, your plan (her banner, your selector pick), or out on Global.
      const since = (t) => {
        if (ctx.myUmas().has(t.id)) return { date: null, why: "you have her" };
        if (yours.has(t.id)) {
          const d = yours.get(t.id), ev = (B.events || []).find((e) => e.start === d && p.selPicks && +p.selPicks[e.id] === t.id);
          return { date: d, why: ev ? "your " + ev.name + " Uma selector pick" : "her banner in your plan" };
        }
        const out = traineeOutDate(t);
        return out && out > ctx.today ? { date: out, why: "out on Global then" } : { date: null, why: "on Global" };
      };
      const row = (g, i) => {
        const m = (p.teams[g] || [])[i] || { id: null, style: "Senkou" };
        const t = m.id ? D.trainee(m.id) : null;
        const flex = `<label class="chip-toggle"><input type="checkbox" data-pull-rotate="${g}" data-i="${i}" ${m.rotate ? "checked" : ""}> Flex in CM &amp; LoH</label>`;
        let status = "";
        if (t) {
          const s = since(t), from = s.date ? "from ~" + fmtDate(s.date) + " (" + s.why + ")" : "now (" + s.why + ")";
          status = m.rotate ? "Yours " + from + "; in CM & LoH this slot takes a fresh uma of yours each cup (she's one of them when she fits)."
            : "Races every cup of her track " + (s.date ? from + "; until then the slot is a flex." : from + ".");
        } else if (m.rotate) status = "A fresh uma of yours each cup.";
        return `<div class="row-wrap pull-team-row">
          <label class="field grow"><span>Uma ${i + 1}</span><input list="pullTrainees" data-pull-team="${g}" data-i="${i}" value="${esc(t ? tLabel(t) : "")}" placeholder="Name [version]" autocomplete="off"></label>
          <label class="field"><span>Style</span><select data-pull-style="${g}" data-i="${i}">${STYLES.map(([k, l]) => `<option value="${k}" ${m.style === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          ${flex}<span class="mini">${esc(status)}</span>
        </div>`;
      };
      const rotating = Object.keys(PV.GROUPS).some((g) => (p.teams[g] || []).some((m) => m && m.rotate));
      return `<section class="panel">
        <h3>Your future teams</h3>
        <p class="mini">One team per kind of track: every cup ahead uses the team for its track. Your team umas count as yours (no carats go to them unless your plan pulls for them), from when you'll have them. A fixed uma races every cup of her track from then; a flex slot takes, each cup, the uma of yours with A or better on its surface, distance and her best running style, a different one from the cup before when another fits.</p>
        ${rotating && !ctx.myUmas().size ? `<p class="mini warn">Tick the umas you own in the Trainees tab (My umas) so the rotating slot has umas to pick from; until then it sits out.</p>` : ""}
        ${Object.keys(PV.GROUPS).map((g) => `<div class="pull-team"><h4>${esc(PV.GROUPS[g].label)}</h4>${[0, 1, 2].map((i) => row(g, i)).join("")}</div>`).join("")}
        <datalist id="pullTrainees">${D.DATA.trainees.slice().sort((a, b) => tLabel(a).localeCompare(tLabel(b))).map((t) => `<option value="${esc(tLabel(t))}"></option>`).join("")}</datalist>
      </section>`;
    }
    function controlsHTML(p) {
      const owned = Object.keys(ctx.owned()).length;
      const stale = result && result.key !== inputsKey(p);
      const sel = (k, opts) => `<select data-pull="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(p[k]) === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
      const box = (k, label) => `<label class="chip-toggle"><input type="checkbox" data-pull="${k}" ${p[k] ? "checked" : ""}> ${label}</label>`;
      return `<section class="panel">
        <h3>Plan my pulls</h3>
        <div class="row-wrap">
          <label class="field"><span>Plan ahead</span>${sel("months", [["all", "To mid-2029 (every forecast cup)"], ["12", "12 months"], ["18", "18 months"], ["24", "24 months"]])}</label>
          <label class="field"><span>Far-off cups count less: a year ahead loses</span>${sel("fade", [["0", "nothing"], ["10", "10%"], ["20", "20%"], ["30", "30%"]])}</label>
          <label class="field"><span>Clearly stronger: beats the card it replaces by</span>${sel("minPct", [["5", "5% or more"], ["10", "10% or more"], ["15", "15% or more"], ["20", "20% or more"], ["30", "30% or more"]])}</label>
          <label class="field"><span>Not a one-time use: in at least</span>${sel("minCups", [["1", "1 cup"], ["2", "2 cups"], ["3", "3 cups"], ["4", "4 cups"], ["5", "5 cups"]])}</label>
        </div>
        <div class="row-wrap">
          ${box("selFree", "Free support selector")}
          ${box("selPaid", "$20.99 support selector")}
          ${box("selUma", "$20.99 Uma selector")}
          <button type="button" class="btn" id="pullRun" ${job ? "disabled" : ""}>${job ? "Planning…" : result ? "Plan again" : "Plan my pulls"}</button>
        </div>
        ${job ? `<div class="row-wrap"><span class="progress"><i style="width:${Math.round(job.f * 100)}%"></i></span><span class="mini">${esc(job.stage)}</span></div>` : ""}
        ${owned < 6 ? `<p class="mini warn">Mark the support cards you own (and their limit breaks) under <b>My cards</b> in the Support cards tab: your decks are built from them.</p>` : ""}
        ${!num(p.carats) && !num(p.perMonth) && !(p.usePlan && p.plan && p.plan.length) ? `<p class="mini warn">Type your carats and monthly income above (or use your plan) so there's something to plan with.</p>` : ""}
        ${stale ? `<p class="mini warn">Your inputs changed since this route was made. Plan again to update it.</p>` : ""}
        <p class="mini">A run to mid-2029 takes a minute or two: it builds every team uma's deck for every cup ahead in the scenario Global trains in then (${esc(ctx.settingsText())}) and tries every banner card in them. Planning again with the same cards, teams and window keeps the decks, so it's quicker.</p>
      </section>`;
    }

    // ---- the route ----
    // The decks a step makes clearly stronger, cup by cup (naming the card when the step brings
    // more than one; a card that came with the pulls for another is marked so).
    function decksText(notes, kind) {
      const clear = (notes || []).filter((x) => (kind === "trainee" ? true : x.clear));
      if (!clear.length) return { n: 0, cups: 0, html: "" };
      const named = kind !== "trainee" && new Set(clear.map((x) => x.id)).size > 1;
      const by = new Map();
      clear.forEach((x) => { const k = x.pair.cup.id; if (!by.has(k)) by.set(k, { cup: x.pair.cup, list: [] }); by.get(k).list.push(x); });
      const html = [...by.values()].map(({ cup, list }) => `<li>${esc(est(cup.global) + fmtDate(cup.global.start))} ${esc(cup.name)}: ${list.map((x) => esc(x.pair.trainee.n) + (kind === "trainee"
        ? " (" + esc(D.trainee(x.id) ? D.trainee(x.id).n : "") + " as Parent 1" + (x.pct != null ? ", +" + pct(x.pct) : "") + ")"
        : (named ? ": " + esc(cardShort(x.id)) + (x.side ? " (came with the pulls)" : "") : "") + " +" + pct(x.pct) + (x.upgrade ? " (limit break)" : x.replaced ? " over " + esc(cardShort(x.replaced)) : ""))).join(", ")}</li>`).join("");
      return { n: clear.length, cups: by.size, html };
    }
    // A card's chances after the pulls, from what you'd have: [have … LB4] with their shares.
    function spreadText(dist, have, from) {
      return [0, 1, 2, 3, 4, 5].filter((k) => k >= from && dist[k] > 0.005)
        .map((k) => (k === have ? (have ? "no new copy" : "none") : lb(k)) + " " + pct(dist[k])).join(" · ");
    }
    // The pulls and picks outside your plan you've entered results for: behind you (with undo).
    function doneHTML(p) {
      const planKeys = new Set((result.mine || []).filter((x) => x.banner).map(keyOf));
      const keys = Object.keys(p.done || {}).filter((k) => !planKeys.has(k));
      if (!keys.length) return "";
      const name = (k) => {
        if (k[0] === "x") { const id = k.slice(1), ev = (B.events || []).find((e) => id.indexOf(e.id + "-") === 0); return (ev ? ev.name + " " : "") + (/-free$/.test(id) ? "free support selector" : /-paid$/.test(id) ? "$20.99 support selector" : "$20.99 Uma selector"); }
        const b = (k[0] === "t" ? B.trainee : B.support).find((x) => "" + x.id === k.slice(1));
        return b ? b.pick.map(([id]) => (k[0] === "t" ? (D.trainee(id) || {}).n : cardShort(id))).join(" + ") : k;
      };
      return `<p class="mini">Behind you (you entered what you got): ${keys.map((k) => `${esc(name(k))}${p.done[k].pulls ? " (" + p.done[k].pulls + " pulls)" : ""} <button type="button" class="btn ghost small" data-pull-undone="${esc(k)}">Undo</button>`).join(" · ")}. Their carats are off your budget, and the route plans on without them.</p>`;
    }
    // "What I got": once you've pulled (or picked), your limit break now for each featured card
    // (or the umas you got). Saving puts it in My cards / My umas, marks the banner behind you and
    // plans again from there.
    function gotForm(it, s) {
      const owned = ctx.owned(), mine = ctx.myUmas();
      const lbSel = (id) => `<label class="field"><span>${esc(cardShort(id))}</span><select data-got-card="${id}">
        <option value="" ${owned[id] == null ? "selected" : ""}>not owned</option>${[0, 1, 2, 3, 4].map((l) => `<option value="${l}" ${owned[id] === l ? "selected" : ""}>LB${l}</option>`).join("")}</select></label>`;
      const umaBox = (id) => `<label class="chip-toggle"><input type="checkbox" data-got-uma="${id}" ${mine.has(id) ? "checked" : ""}> ${esc(umaName(id))}</label>`;
      let fields;
      if (it.kind === "selector") fields = it.pick === "support" ? lbSel(it.id) : umaBox(it.id);
      else if (it.kind === "support") fields = it.banner.pick.map(([id]) => id).filter((id) => D.card(id)).map(lbSel).join("");
      else fields = it.banner.pick.map(([id]) => id).filter((id) => D.trainee(id)).map(umaBox).join("");
      return `<details class="pull-got"><summary>What I got</summary><div class="row-wrap">${fields}</div>
        <div class="row-wrap"><button type="button" class="btn small" data-pull-save="${esc(it.key)}" data-pulls="${s.pulls || 0}" data-free="${s.free || 0}">Save and plan again</button>
        <span class="mini">Your limit breaks (or umas) now go to My cards (My umas), and the route plans on from there without this ${it.kind === "selector" ? "selector" : "banner"}.</span></div></details>`;
    }
    function stepRow(s, seen) {
      const v = result.v, it = v.byKey.get(s.key), c = v.committed.get(s.key);
      if (!it || !c) return "";
      const adds = result.gains.get(s.key) || 0;
      const d = decksText(c.notes, it.kind === "trainee" || (it.kind === "selector" && it.pick === "trainee") ? "trainee" : "card");
      const decks = d.n ? `<details><summary>${d.cups} cup${d.cups === 1 ? "" : "s"}, ${d.n} deck${d.n === 1 ? "" : "s"}</summary><ul class="mini">${d.html}</ul></details>` : `<span class="mini">—</span>`;
      const left = `<td class="num">${fmtN(s.left)}</td>`;
      if (it.kind === "selector") {
        const s0 = it.sel, e = s0.event;
        let got;
        if (it.pick === "support") {
          // Copies by then, with this anniversary's earlier pick of the same card.
          const k = it.date + "|" + it.id, have = Math.min(5, v.copiesBy(it.id, it.date, s.key) + (seen.get(k) || 0));
          seen.set(k, (seen.get(k) || 0) + 1);
          got = `<b>${esc(cardName(it.id))}</b>: ${have ? lb(have) + " → " + lb(have + 1) : "new, LB0"}`;
        } else got = `<b>${esc(umaName(it.id))}</b> ${v.team.has(it.id) ? "(your team uma: yours from here)" : it.locked ? "(yours from here)" : "(for Parent 1)"}`;
        const alt = (result.runners && result.runners.get(s.key)) || [];
        const altText = alt.length
          ? `<div class="mini">Next best here: ${alt.map((x) => esc(x.pick === "support" ? cardShort(x.id) + " " + (x.have ? lb(x.have) + " → " + lb(x.have + 1) : "LB0") : umaName(x.id)) + " " + (x.value > 0 ? "+" + fmtN(x.value) + " (" + x.cups + " cup" + (x.cups === 1 ? "" : "s") + ")" : "clearly stronger in only " + x.cups + " cup" + (x.cups === 1 ? "" : "s"))).join(" · ")}</div>`
          : `<div class="mini">Nothing else here makes a deck clearly stronger.</div>`;
        return `<tr><td>${esc(est(e) + fmtDate(e.start))}</td><td>${it.locked ? `<span class="pill">your pick</span> ` : ""}${esc(e.name)}: ${esc(s0.label)}</td><td class="num">${s0.price ? "$" + s0.price.toFixed(2) + `<div class="mini">+${fmtN(s0.carats)} carats</div>` : "free"}</td>
          <td>Pick ${got}${altText}${gotForm(it, s)}</td><td>${decks}</td>${left}<td class="num">+${fmtN(adds)}</td></tr>`;
      }
      const pulls = `${fmtN(s.pulls)} pulls<div class="mini">${fmtN(s.carats)} carats${s.free ? " + " + fmtN(s.free) + " free on the banner" : ""}${s.tickets ? " + " + fmtN(s.tickets) + " tickets" : ""}</div>`;
      const featured = it.banner.pick.map(([id]) => (it.kind === "support" ? cardName(id) : umaName(id)));
      const what = `${it.locked ? `<span class="pill">your plan</span> ` : ""}${it.kind === "support" ? "Support banner" : "Trainee banner"}<div class="mini">${esc(featured.join(", "))}</div>`;
      let got = "";
      if (it.blind && it.kind === "trainee" && it.mine && it.mine.length) {
        got = `<div class="mini">For your team:</div><b>${esc(it.mine.map(umaName).join(" and "))}</b><div class="mini">Yours from this banner: she races (or joins the flex picks) and counts as a parent from here.</div>`;
      } else if (it.blind) {
        got = `<span class="mini">Euophrys has no data for these cards yet, so they can't be scored; the carats are set aside for your plan. The daily data update picks them up once Euophrys adds them.</span>`;
      } else if (it.kind === "support") {
        // The target: the card the sparks go to. Side copies: what the pulls bring of the others.
        const spark = c.spark || [];
        const targets = [], sides = [];
        it.feat.forEach((f) => {
          const n = c.copies.get(f.id) || 0, have = v.copiesBy(f.id, it.date, s.key), onIt = spark.filter((x) => x === f.id).length;
          if (!n && !onIt) return;
          const dist = v.copiesDist(f.rate, s.pulls, have, onIt);
          const head = `<b>${esc(cardName(f.id))}</b> ${have ? lb(have) + " → " : ""}${lb(Math.min(5, have + n))}`;
          if (onIt) targets.push(`<div>${head}${onIt === 2 ? ` <span class="mini">(both sparks)</span>` : ""}<div class="mini">${spreadText(dist, have, have + onIt)}</div></div>`);
          else sides.push(`<div>${head} <span class="mini">likely; ${spreadText(dist, have, have)}</span></div>`);
        });
        // Your own target on a banner of your plan, when the sparks do more on another card.
        const yours = it.locked && it.target && spark.indexOf(it.target) === -1
          ? `<div class="mini">Your table targets ${esc(cardShort(it.target))}; the sparks add more on ${esc([...new Set(spark)].map(cardShort).join(" and "))} with your decks (${esc(cardShort(it.target))} still comes with the pulls).</div>` : "";
        got = `<div class="mini">Spark for (likely result):</div>${targets.join("")}${yours}${sides.length ? `<div class="mini">Comes with the pulls, not a target:</div>${sides.join("")}` : ""}`;
      } else {
        const spark = c.spark || [];
        const also = [...(c.got || [])].filter((id) => spark.indexOf(id) === -1);
        got = `<div class="mini">Spark:</div><b>${esc(spark.map(umaName).join(" and "))}</b>${also.length ? `<div class="mini">The pulls likely bring ${esc(also.map(umaName).join(", "))} too.</div>` : ""}`;
      }
      return `<tr><td>${esc(when(it.banner))}</td><td>${what}</td><td class="num">${pulls}</td><td>${got}${gotForm(it, s)}</td><td>${decks}</td>${left}<td class="num">+${fmtN(adds)}</td></tr>`;
    }
    function routeHTML(p) {
      if (!result) return "";
      const { v, plan } = result;
      const steps = plan.steps;
      const spent = steps.reduce((a, s) => a + s.carats, 0);
      // The $20.99 packs are bought for their carats too, picked from or not.
      const packs = v.selectors.filter((x) => x.price), dollars = packs.reduce((a, x) => a + x.price, 0);
      const bonus = v.bonus.reduce((a, b) => a + b.carats, 0);
      const last = steps.length ? steps[steps.length - 1] : null;
      const lastDate = last ? v.byKey.get(last.key).date : result.until;
      const have = result.budget ? result.budget(lastDate) : PP.caratsBy({ today: ctx.today, carats: num(p.carats), perMonth: num(p.perMonth) }, result.until) + bonus;
      const seen = new Map();
      const rows = steps.map((s) => stepRow(s, seen)).join("");
      const lockedN = v.items.filter((it) => it.locked && it.kind !== "selector").length, picksN = v.items.filter((it) => it.locked && it.kind === "selector").length;
      const planSpent = steps.filter((s) => v.byKey.get(s.key).locked).reduce((a, s) => a + s.carats, 0);
      // Banners of your plan that don't fit: what they need, and what's left of your carats then.
      const missed = plan.missed.map((key) => v.byKey.get(key)).filter(Boolean).map((it) => {
        const need = Math.max(0, it.pullsAt(it.required === true ? 1 : it.required) - (it.free || 0)) * B.meta.pullCarats;
        const before = steps.filter((s) => v.byKey.get(s.key).date <= it.date).reduce((a, s) => a + s.carats, 0);
        const left = (result.budget ? result.budget(it.date) : have) - before;
        return `<li><b>${esc(it.banner.pick.map(([id]) => cardShort(id)).join(" + "))}</b> (${esc(when(it.banner))}): 400 pulls need ${fmtN(need)} carats after its free pulls; ${left >= need
          ? `you'd have ${fmtN(left)} then, but taking it would leave too few for a later banner of your plan`
          : `you'd have about ${fmtN(Math.max(0, left))} then, ${fmtN(need - Math.max(0, left))} short`}.</li>`;
      }).join("");
      const intro = result.budget
        ? `Budget: your plan's carat estimates (about ${fmtN(have)} by ${esc(fmtDate(lastDate))} if you spent none). Your plan's ${lockedN} banner${lockedN === 1 ? "" : "s"} come first, each at its # Pulls, in date order (each banner's free pulls before carats)${picksN ? `, with your ${picksN} selector pick${picksN === 1 ? "" : "s"}` : ""}: ${fmtN(planSpent)} carats. The carats left over go to whatever else makes your decks clearly stronger in the most cups per carat (at least ${esc(p.minPct)}% over the card replaced, in at least ${esc(p.minCups)} cup${+p.minCups === 1 ? "" : "s"}): ${fmtN(spent - planSpent)} more, ${fmtN(spent)} in all.`
        : `From ${fmtN(num(p.carats))} carats now and ${fmtN(num(p.perMonth))} a month${bonus ? `, plus ${fmtN(bonus)} from the $20.99 packs` : ""}, you'll have about ${fmtN(have)} by ${esc(fmtDate(result.until))}. This route spends ${fmtN(spent)} of them on the pulls that make your decks clearly stronger in the most cups per carat (at least ${esc(p.minPct)}% over the card replaced, in at least ${esc(p.minCups)} cup${+p.minCups === 1 ? "" : "s"}), in banner order so the carats are there at each one.`;
      return `<section class="panel pull-route">
        <h3>The route</h3>
        <p class="mini">${intro}${packs.length ? ` The ${packs.length} $20.99 pack${packs.length === 1 ? "" : "s"} in the window come to $${dollars.toFixed(2)}.` : ""}</p>
        ${missed ? `<div class="mini warn"><b>Your plan doesn't all fit your carat estimates:</b><ul>${missed}</ul></div>` : ""}
        ${doneHTML(p)}
        ${steps.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>What</th><th class="num">Cost</th><th>You get</th><th>Clearly stronger in</th><th class="num">Carats left</th><th class="num">Adds</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="mini">Spark for: the card the route pulls for, at its likely limit break (the spark plus the median pulled copies), with the chances of every other result. Comes with the pulls: the other featured cards' likely copies; they aren't why the route pulls there, but they count where they're clearly stronger. Next best here: the other picks on that selector and their points. Adds: the expected points to your decks over every cup after the banner, counting only the clearly stronger ones (the deck score's units; 60 = 1 L of race skills).</p>` : `<div class="empty">Nothing in the next ${esc(p.months)} months makes your decks clearly stronger in ${esc(p.minCups)} or more cups for the carats you'll have. Add your carats and income above, mark your cards, or relax the rules.</div>`}
        ${checkHTML()}
        ${compareHTML()}
        ${selectorsHTML()}
        ${closeHTML(p)}
        ${v.unscorable.length ? `<p class="mini">${v.unscorable.length} featured card${v.unscorable.length === 1 ? "" : "s"} in this window can't be scored yet (Euophrys' data doesn't have ${v.unscorable.length === 1 ? "it" : "them"}), so ${v.unscorable.length === 1 ? "it isn't" : "they aren't"} planned.</p>` : ""}
      </section>`;
    }
    // Selectors the route leaves without a pick: nothing clears your rules there.
    function selectorsHTML() {
      const { v, plan } = result;
      const used = new Set(plan.steps.map((s) => v.byKey.get(s.key)).filter((it) => it.kind === "selector").map((it) => it.sel.id));
      const rest = v.selectors.filter((s) => !used.has(s.id));
      if (!rest.length) return "";
      return `<details><summary>Selectors without a pick (${rest.length})</summary><ul class="mini">${rest.map((s) => {
        const f = s.kind === "support" ? v.selectorFallback(s) : null;
        return `<li>${esc(est(s.event) + fmtDate(s.date))} ${esc(s.event.name)}, ${esc(s.label)}: no ${s.kind === "support" ? "card" : "uma"} makes your decks clearly stronger in ${esc(S().minCups)}+ cups from there.${f ? ` Best for your decks anyway: <b>${esc(cardName(f.id))}</b> (+${fmtN(f.raw)} points over the cups after it).` : s.kind === "trainee" ? " Pick a team uma you still need." : ""}</li>`;
      }).join("")}</ul></details>`;
    }
    // Cards near the line: the route's runners-up, and the best cards your rules leave out.
    function closeHTML(p) {
      const { v, plan } = result;
      const worth = [], out = [];
      v.items.filter((it) => it.kind === "support" && !plan.chosen.get(it.key)).forEach((it) => {
        const r = v.review(it.key);
        if (!r) return;
        if (r.v1 > 0 || r.v2 > 0) {
          const best = r.v1 / 200 >= r.v2 / 400 ? [200, r.v1] : [400, r.v2];
          worth.push({ rank: best[1] / best[0], it, text: `${best[0]} pulls would add +${fmtN(best[1])} points` });
          return;
        }
        r.cards.forEach((x) => {
          if (x.clear >= +p.minCups) out.push({ rank: 3e6 + x.clear, it, id: x.id, text: `clearly stronger at LB4 in ${x.clear} cups, but 200 or 400 pulls likely leave it at a limit break where it isn't` });
          else if (x.clear > 0) out.push({ rank: 2e6 + x.best * 1000, it, id: x.id, text: `clearly stronger (up to +${pct(x.best)}) in only ${x.clear} cup${x.clear === 1 ? "" : "s"}, even at LB4: a one-time use` });
          else if (x.best > 0.03) out.push({ rank: 1e6 + x.best * 1000, it, id: x.id, text: `at most ${pct(x.best)} stronger than the card it would replace, even at LB4 (your bar is ${esc(p.minPct)}%)` });
        });
      });
      const li = (x) => `<li>${esc(when(x.it.banner))}: <b>${esc(x.id ? cardName(x.id) : x.it.banner.pick.map(([id]) => cardShort(id)).join(", "))}</b>: ${x.text}.</li>`;
      worth.sort((a, b) => b.rank - a.rank);
      out.sort((a, b) => b.rank - a.rank);
      return (worth.length ? `<details><summary>Worth it by your rules, but the carats went further elsewhere (${Math.min(8, worth.length)} of ${worth.length})</summary><ul class="mini">${worth.slice(0, 8).map(li).join("")}</ul></details>` : "")
        + (out.length ? `<details><summary>Left out by your rules (${Math.min(8, out.length)} of ${out.length})</summary><ul class="mini">${out.slice(0, 8).map(li).join("")}</ul></details>` : "");
    }

    // Every banner on one scale: support cards for your decks and trainees as Parent 1, each on its
    // own against your decks now, in the same points (is this parent stronger than that support?).
    function compareHTML() {
      const list = (result.solo || []).filter((x) => !x.blind);
      if (!list.length) return "";
      const best = (x) => Math.max(x.v1, x.v2);
      const name = (x) => x.item.banner.pick.map(([id]) => (x.kind === "support" ? cardShort(id) : (D.trainee(id) || {}).n || "#" + id)).join(" + ");
      const top = list.slice().sort((a, b) => best(b) - best(a)).slice(0, 14);
      list.filter((x) => x.locked && top.indexOf(x) === -1).forEach((x) => top.push(x));
      const perK = (x) => { const a = x.v1 / 30, b = x.v2 / 60; return Math.max(a, b); };
      const rows = top.sort((a, b) => (a.item.date < b.item.date ? -1 : 1)).map((x) => `<tr><td>${esc(when(x.item.banner))}</td>
        <td>${x.locked ? `<span class="pill">your plan</span> ` : ""}${x.kind === "support" ? "Support" : "Trainee"}<div class="mini">${esc(name(x))}</div></td>
        <td class="num">+${fmtN(x.v1)}</td><td class="num">${x.item.most > 1 ? "+" + fmtN(x.v2) : "—"}</td><td class="num">${fmtN(perK(x))}</td></tr>`).join("");
      const trainee = list.filter((x) => x.kind === "trainee").sort((a, b) => best(b) - best(a))[0];
      const weakMine = list.filter((x) => x.locked && x.kind === "support").sort((a, b) => best(a) - best(b))[0];
      const verdict = trainee && weakMine
        ? `The best trainee banner (${esc(name(trainee))}, ${esc(when(trainee.item.banner))}) adds +${fmtN(best(trainee))} as Parent 1; the weakest support banner of your plan (${esc(name(weakMine))}) adds +${fmtN(best(weakMine))} to your decks. ${best(trainee) > best(weakMine) ? "Here the trainee is stronger." : "Here the support card is stronger."}`
        : "";
      return `<details><summary>Every banner on one scale (supports vs trainees)</summary>
        <p class="mini">Each banner on its own, against your decks now (before the route): what 200 and 400 pulls would add, support cards to your decks, trainees as Parent 1 for your fixed umas, in the same points. ${verdict} A parent adds a few skills and an aptitude at her inspirations; a support card is in every training run of the decks it joins, so supports usually come out far ahead.</p>
        <div class="table-wrap"><table><thead><tr><th>When</th><th>Banner</th><th class="num">200 pulls</th><th class="num">400 pulls</th><th class="num">Per 1,000 carats</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
    }

    // ---- your decks now ----
    function decksHTML() {
      if (!result) return "";
      const v = result.v;
      const cardLine = (c) => esc(cardShort(c.id)) + " LB" + c.lb + (c.borrowed ? " (friend's)" : "");
      // Which route cards in a deck only came with the pulls for another card: deck → card → side.
      const side = new Map();
      v.committed.forEach((c) => (c.notes || []).forEach((x) => {
        if (!x.pair || x.lb === undefined) return; // a parent's note
        if (!side.has(x.pair.key)) side.set(x.pair.key, new Map());
        const m = side.get(x.pair.key);
        m.set(x.id, m.get(x.id) !== false && !!x.side);
      }));
      const groups = Object.keys(PV.GROUPS).map((g) => {
        const ps = v.pairs.filter((x) => x.group === g);
        if (!ps.length) return "";
        const bySlot = new Map();
        ps.forEach((x) => { if (!bySlot.has(x.slot)) bySlot.set(x.slot, []); bySlot.get(x.slot).push(x); });
        const styleName = (k) => (STYLES.find(([s]) => s === k) || [0, ""])[1];
        const era = (x) => (x.era ? ` <span class="mini">(${esc(x.era.name)}${x.era.est ? ", estimated scoring" : ""})</span>` : "");
        const teamOf = (slot) => ((S().teams || {})[g] || [])[slot] || {};
        return `<h4>${esc(PV.GROUPS[g].label)}</h4>${[...bySlot.entries()].map(([slot, list]) => { const m = teamOf(slot); return `<div class="pull-decks">${m.rotate || !m.id
          ? `<b>Flex slot</b> <span class="mini">a fresh uma of yours each cup in CM &amp; LoH</span>`
          : `<b>${esc(umaName(m.id))}</b> <span class="mini">${esc(styleName(m.style))}</span>`}<ul class="mini">${list.map((x) => {
          const who = x.rotating ? `<b>${esc(x.trainee.n)}</b> (${esc(styleName(x.member.style))}${x.member.waiting ? ", until " + esc((D.trainee(x.member.waiting) || {}).n || "she") + " is yours" : ""}): ` : "";
          if (!x.base) return `<li>${esc(est(x.cup.global) + fmtDate(x.date))} ${esc(x.cup.name)}${era(x)}: ${who}${esc(x.error || "no deck")}</li>`;
          const now = new Set(x.base.map((c) => c.id + ":" + c.lb)), after = x.deck.filter((c) => !now.has(c.id + ":" + c.lb));
          const sm = side.get(x.key) || new Map(), extra = after.filter((c) => !c.borrowed && sm.get(c.id) === true), picked = after.filter((c) => extra.indexOf(c) === -1);
          return `<li>${esc(est(x.cup.global) + fmtDate(x.date))} ${esc(x.cup.name)}${era(x)}: ${who}${x.base.map(cardLine).join(" · ")}${picked.length ? `<div>With the route: ${picked.map(cardLine).join(" · ")}</div>` : ""}${extra.length ? `<div>Also from those pulls (not targets): ${extra.map(cardLine).join(" · ")}</div>` : ""}</li>`;
        }).join("")}</ul></div>`; }).join("")}`;
      }).join("");
      const skipped = v.unrotated.length ? `<p class="mini warn">${v.unrotated.length} flex slot${v.unrotated.length === 1 ? "" : "s"} sat out: no uma of yours has A or better on ${v.unrotated.length === 1 ? "that cup's" : "those cups'"} surface, distance and a running style (tick more umas in My umas).</p>` : "";
      return `<details class="panel"><summary><b>Your decks now</b> (every team uma, every cup ahead, from the cards you own)</summary>
        <p class="mini">Each deck is built the way CM &amp; decks builds it, with a friend's card, in the scenario Global trains in by that cup, and with the story events' free SSRs from their dates. These are the decks a banner card has to beat. "With the route" lists the cards the route's sparks and selector picks put in; "Also from those pulls" lists copies of other featured cards the pulls likely bring, which go in wherever they're any better (they aren't what the route pulls for).</p>${skipped}${groups}</details>`;
    }
    function calendarHTML(p) {
      if (!B) return "";
      const end = until(p);
      const live = (b) => (b.end ? b.end >= ctx.today : b.start >= ctx.today) && b.start <= end;
      const list = B.support.filter(live).map((b) => ({ b, kind: "support" })).concat(B.trainee.filter(live).map((b) => ({ b, kind: "trainee" })))
        .concat((B.events || []).filter((e) => e.start > ctx.today && e.start <= end).map((b) => ({ b, kind: "event" })))
        .sort((a, b) => (a.b.start < b.b.start ? -1 : a.b.start > b.b.start ? 1 : 0)).slice(0, 100);
      const chosen = (kind, b) => {
        if (!result) return 0;
        const k = result.plan.chosen.get((kind === "support" ? "s" : "t") + b.id);
        return k ? k * B.meta.spark : 0;
      };
      return `<details class="panel"><summary><b>Banners ahead</b> (GameTora's forecast after the announced ones; ~ dates are estimates)</summary>
        <div class="table-wrap"><table><thead><tr><th>When</th><th>Banner</th><th>Featured</th></tr></thead><tbody>
        ${list.map(({ b, kind }) => kind === "event"
          ? `<tr><td>${esc(est(b) + fmtDate(b.start))}</td><td>${esc(b.name)}</td><td class="mini">Selectors: a free support selector, and $20.99 and $69.99 ones for support cards and umas</td></tr>`
          : `<tr><td>${esc(when(b))}</td><td>${kind === "support" ? "Support card" : "Trainee"}${chosen(kind, b) ? ` <span class="pill">${chosen(kind, b)} pulls in your route</span>` : ""}</td><td>${b.pick.map(([id, r]) => esc(kind === "support" ? cardName(id) : umaName(id)) + ` <span class="mini">${(r * 100).toFixed(2)}%</span>`).join("<br>")}</td></tr>`).join("")}
        </tbody></table></div></details>`;
    }
    function howHTML() {
      return `<details class="panel"><summary><b>How it decides</b></summary><div class="mini">
        <p><b>Your plan.</b> The banners in your plan are pulled no matter what, each at its # Pulls, first, in date order, each banner's free pulls spent before carats. Your planner's Carat Est. is your balance at each row after the rows above it, so the budget adds back what those rows cost (their pulls past their free pulls) for the carats you'd have by each date if you spent none, straight lines between. A banner that doesn't fit is listed, not forced. On those banners the sparks go where they add the most to your decks, else to the card your table targets. A trainee row for a team uma makes her yours from that banner; a step-up isn't modeled.</p>
        <p><b>Your decks now.</b> Your team umas are yours from when you'll have them: now (My umas), from your plan (her banner, your selector pick), or else from when she's out on Global. For every cup in the window and every uma of the team for its track, it builds her racing deck the way CM &amp; decks does: Euophrys' scoring plus that race's skill values for her style, from the cards you own (and the story events' free SSRs, at LB4 once their event is over), with a friend's card. A flex slot (and a fixed uma's slot before she's yours) takes, each cup, the uma of yours with A or better on its surface, distance and her best running style, a different one from the cup before.</p>
        <p><b>Your selector picks.</b> The Uma picks you've decided are taken first; every other pick is the planner's.</p>
        <p><b>Scenarios.</b> Each cup's decks are trained in the scenario Global is on by then (GameTora's forecast: ${(result ? result.v.eras : []).filter((e) => e.start).map((e) => esc(e.name) + " ~" + esc(fmtDate(e.start))).join(", ") || "Grand Masters from the 2nd Anniversary, then a new one every few months"}). Euophrys scores Grand Concert, Grand Masters and Design Your Island; for the others it has no preset, so they're estimated: the nearest preset's weights with the scenario's own friend (or group) SSR as its link card, at the bonus Euophrys gives Tucker Bryne in Design Your Island. That's what makes a scenario's friend card count, and only while its scenario lasts.</p>
        <p><b>Longevity.</b> A card counts in every cup after its banner up to the last forecast cup (mid-2029), and a cup a year ahead counts less by your fade (forecast uncertainty and newer cards).</p>
        <p><b>Clearly stronger.</b> A banner card counts in a deck only when it beats the card it would replace (the "Which cards would improve it?" test, with the other five fixed) by your margin, at the limit break your copies reach. A card you'd otherwise borrow counts as yours, with the next-best friend's card. And only when that happens in enough different cups after its banner: a card you'd use once isn't one you pull for.</p>
        <p><b>200 or 400 pulls.</b> ${B ? B.meta.spark : 200} pulls give one spark (a featured card of your choice), so 200 pulls on an SSR's banner likely end at LB1 (the spark and one pulled copy), and 400 at LB4. A pull counts only when its likely result already clears your rules; its value is then the expected points over every result the pulls can give (with the sparks where they help most once you see the pulls), the other featured cards' copies included.</p>
        <p><b>Selectors.</b> At each anniversary (JP's campaigns, on Global's calendar: its 1.5 Anniversary was in July 2026), a free support selector and the $20.99 ones (support and Uma, each with 1,500 carats). The pool: the gacha SSRs (or 3★ umas) JP had about ${PV.POOL_LAG || 45} days before that anniversary. A pick is one copy, valued like a pulled one; it's taken before any carats are spent.</p>
        <p><b>Parents and supports on one scale.</b> A trainee counts as Parent 1 for your fixed team umas (yours to train; Parent 2 is a friend's rental): her sparks fire at their base chance × (1 + her affinity with the ace / 100) at the ace's two inspirations, carrying the ace's top 3 race whites and her inherited unique at 2★, and a 2★ pink spark where the ace lacks an A on the race (like El Condor Pasa's dirt B) and she has it. Blue sparks are left out: any parent can carry them. It's all in the same points as a deck card, so a trainee banner and a support banner compete for the same carats; "Every banner on one scale" shows them side by side. Same rules: clearly better than your best Parent 1 (your teams included), in enough cups. Future characters' affinity comes from JP's table.</p>
        <p><b>The route.</b> Step by step, the move with the most points per carat that still leaves enough carats at every banner (free selector picks first, then the pulls), counting your income up to each banner's date, the packs' carats and tickets first. After each step the decks take the step's likely cards, so the next card has to beat those. Then a second pass: back to your decks now, the same pulls in date order, and the selector picks chosen again on top of them, so no pick goes to a card a pull already brings to LB4. It's a careful step-by-step plan, not a search of every possible route.</p>
        <p><b>Dates.</b> Banners Global has announced keep their own dates and rates. Later ones, the anniversaries and the cups are GameTora's forecast from Global's pace against JP, so they can shift; plan again as banners are announced.</p>
      </div></details>`;
    }
    function render(body) {
      const p = S();
      if (!B || !PV || !PP) { body.innerHTML = `<div class="empty">The banner data didn't load. Refresh the page.</div>`; return; }
      body.innerHTML = `<div class="pulls">
        <section class="panel"><h2>Pull planner</h2><p class="mini">Your plan's banners at 400, and the best use of everything else (other banners, selector picks), so your teams' decks get clearly stronger in as many cups as your carats allow, through mid-2029. It builds your decks for every cup ahead from the cards you own, in the scenario of the time, and puts every support card and trainee on one scale, on the banners Global has announced and GameTora's forecast of the rest.</p></section>
        ${planHTML(p)}${picksHTML(p)}${budgetHTML(p)}${teamsHTML(p)}${controlsHTML(p)}${routeHTML(p)}${decksHTML()}${calendarHTML(p)}${howHTML()}
      </div>`;
    }

    // ---------- events ----------
    function click(e) {
      if (e.target.closest("#pullRun")) { run(); return true; }
      if (e.target.closest("#pullCheck")) { check(); return true; }
      const save = e.target.closest("[data-pull-save]");
      if (save) {
        const box = save.closest(".pull-got"), p = S(), key = save.dataset.pullSave, owned = ctx.owned(), got = [];
        box.querySelectorAll("select[data-got-card]").forEach((sel) => {
          const id = +sel.dataset.gotCard, lb = sel.value === "" ? null : +sel.value;
          if ((owned[id] == null ? null : owned[id]) !== lb) { ctx.setOwned(id, lb); got.push(cardShort(id) + (lb == null ? " not owned" : " LB" + lb)); }
        });
        box.querySelectorAll("input[data-got-uma]").forEach((cb) => { if (cb.checked && !ctx.myUmas().has(+cb.dataset.gotUma)) { ctx.addMyUma(+cb.dataset.gotUma); got.push(umaName(+cb.dataset.gotUma)); } });
        if (!p.done) p.done = {};
        p.done[key] = { pulls: +save.dataset.pulls || 0, free: +save.dataset.free || 0, at: ctx.today };
        ctx.save();
        ctx.flash((got.length ? "Saved " + got.join(", ") : "Marked as done") + ". Planning again…");
        run();
        return true;
      }
      const undo = e.target.closest("[data-pull-undone]");
      if (undo) {
        const p = S();
        if (p.done) delete p.done[undo.dataset.pullUndone];
        ctx.save();
        ctx.rerender();
        return true;
      }
      if (e.target.closest("#pullPlanRead")) {
        const box = document.getElementById("pullPlanText"), got = PV.parsePlan(box ? box.value : "");
        if (!got.length) { ctx.flash("That doesn't look like a planner table: each banner needs a Start: line with its name above it."); return true; }
        const p = S();
        p.plan = got.map((x) => ({ kind: x.kind, names: x.names, title: x.title, start: x.start, pulls: x.pulls || 0, free: x.free || 0, carats: x.carats, target: x.target }));
        ctx.save();
        ctx.flash("Read " + got.length + " banner" + (got.length === 1 ? "" : "s") + " from your table");
        ctx.rerender();
        return true;
      }
      if (e.target.closest("#pullPlanReset")) {
        const p = S();
        p.plan = JSON.parse(JSON.stringify(DEFAULT_PLAN));
        ctx.save();
        ctx.rerender();
        return true;
      }
      return false;
    }
    function change(e) {
      const t = e.target, p = S();
      if (t.dataset.pull) {
        p[t.dataset.pull] = t.type === "checkbox" ? t.checked : t.value;
        ctx.save();
        if (t.tagName === "SELECT" || t.type === "checkbox") ctx.rerender();
        return true;
      }
      if (t.dataset.pullTeam) {
        const id = byLabel.get(t.value.trim().toLowerCase());
        const list = p.teams[t.dataset.pullTeam] || (p.teams[t.dataset.pullTeam] = []);
        const i = +t.dataset.i;
        const keep = { style: (list[i] || {}).style || "Senkou", rotate: !!(list[i] || {}).rotate };
        if (!t.value.trim()) list[i] = Object.assign({ id: null }, keep);
        else if (id) list[i] = Object.assign({ id }, keep);
        else { ctx.flash("Pick a trainee from the list (name and version)."); return true; }
        ctx.save();
        ctx.rerender();
        return true;
      }
      if (t.dataset.pullStyle) {
        const list = p.teams[t.dataset.pullStyle] || (p.teams[t.dataset.pullStyle] = []);
        const i = +t.dataset.i;
        list[i] = Object.assign({ id: null }, list[i] || {}, { style: t.value });
        ctx.save();
        return true;
      }
      if (t.dataset.pullPick) {
        const id = byLabel.get(t.value.trim().toLowerCase());
        if (!p.selPicks) p.selPicks = {};
        if (!t.value.trim()) delete p.selPicks[t.dataset.pullPick];
        else if (id) p.selPicks[t.dataset.pullPick] = id;
        else { ctx.flash("Pick a trainee from the list (name and version)."); return true; }
        ctx.save();
        ctx.rerender();
        return true;
      }
      if (t.dataset.pullRotate) {
        const list = p.teams[t.dataset.pullRotate] || (p.teams[t.dataset.pullRotate] = []);
        const i = +t.dataset.i;
        list[i] = Object.assign({ id: null, style: "Senkou" }, list[i] || {}, { rotate: t.checked });
        ctx.save();
        ctx.rerender();
        return true;
      }
      return false;
    }
    return { render, click, change, running: () => !!job, DEFAULT_TEAMS };
  }

  const api = { create, DEFAULT_TEAMS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaPullTab = api;
})(typeof window !== "undefined" ? window : globalThis);
