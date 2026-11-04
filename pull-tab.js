// The Pull planner tab: your carats and future teams, and the route through the banners ahead
// by your rules: 200 or 400 pulls on a banner, the free and $20.99 selectors, and only cards
// that make your decks clearly stronger in more than one cup. pull-values.js builds your decks
// and values every banner and selector pick; pull-planner.js finds the route. Keeps state.pull.
(function (root) {
  "use strict";
  const STYLES = [["Nige", "Front Runner"], ["Senkou", "Pace Chaser"], ["Sasi", "Late Surger"], ["Oikomi", "End Closer"]];
  // The teams you gave (by track): Sprint & Mile Late Surgers; Medium & Long two End Closers and a
  // Late Surger; Dirt Pace Chasers. Change them in the tab.
  const DEFAULT_TEAMS = {
    sm: [{ id: 105301, style: "Sasi" }, { id: 106301, style: "Sasi" }, { id: 106101, style: "Sasi" }],
    ml: [{ id: 111501, style: "Oikomi" }, { id: 111901, style: "Oikomi" }, { id: 102501, style: "Sasi" }],
    dirt: [{ id: 101401, style: "Senkou" }, { id: 109801, style: "Senkou" }, { id: 102902, style: "Senkou" }],
  };
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
      const def = { carats: "", perMonth: "", sTickets: "", tTickets: "", months: "18", minCups: "2", minPct: "10", parents: true, selFree: true, selPaid: true, selUma: true };
      Object.keys(def).forEach((k) => { if (p[k] == null) p[k] = def[k]; });
      delete p.luck;
      if (!p.teams) p.teams = JSON.parse(JSON.stringify(DEFAULT_TEAMS));
      return p;
    }
    const until = (p) => { const d = new Date(Date.parse(ctx.today) + (+p.months || 18) * 30.4375 * 864e5); return d.toISOString().slice(0, 10); };
    // What the decks rest on (a re-plan with the same keeps them), and everything the route does.
    const deckKey = (p) => JSON.stringify([ctx.today, until(p), p.teams, ctx.ownedCode(), ctx.settingsKey()]);
    const inputsKey = (p) => JSON.stringify([deckKey(p), p.carats, p.perMonth, p.sTickets, p.tTickets, p.minCups, p.minPct, p.parents, p.selFree, p.selPaid, p.selUma, [...ctx.myUmas()].sort()]);
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
    async function run() {
      const p = S();
      if (job) return;
      job = { stage: "Loading the card data…", f: 0 };
      ctx.rerender();
      try {
        for (let i = 0; !ctx.euReady(); i++) { if (i > 600) throw new Error("The card data didn't load. Check your connection."); await new Promise((r) => setTimeout(r, 100)); }
        const end = until(p), dk = deckKey(p);
        const teams = JSON.parse(JSON.stringify(p.teams));
        const cupIds = P.list.filter((x) => x.global.start > ctx.today && x.global.start <= end && PV.groupOf(x)).map((x) => x.id);
        job.stage = "Loading each cup's skill values…"; ctx.rerender();
        await ctx.ensureSkills(cupIds);
        const v = PV.create({
          D, T: ctx.T, A: ctx.A, B, P, today: ctx.today, until: end, teams, owned: ctx.owned(), umas: ctx.myUmas(),
          minCups: +p.minCups || 2, minPct: (+p.minPct || 10) / 100, parents: !!p.parents,
          selectors: { free: !!p.selFree, paid: !!p.selPaid, uma: !!p.selUma },
          reuse: result && result.deckKey === dk ? result.v : null,
          deckOpts: ctx.deckOpts, whites: ctx.whites, skillL: ctx.skillL,
        });
        const n = v.pairs.length;
        for (let i = 0; i < n; i++) {
          const pair = v.pairs[i];
          job = { stage: "Your decks now: " + pair.trainee.n + " for " + pair.cup.name + " (" + (i + 1) + " of " + n + ")", f: 0.5 * i / n };
          ctx.rerender();
          await tick();
          v.buildPair(pair);
        }
        job = { stage: "Shortlisting the selector picks…", f: 0.5 };
        ctx.rerender();
        await tick();
        v.addSelectors();
        for (let i = 0; i < n; i++) {
          const pair = v.pairs[i];
          job = { stage: "Trying the banner cards in " + pair.trainee.n + "'s deck for " + pair.cup.name + " (" + (i + 1) + " of " + n + ")", f: 0.5 + 0.2 * i / n };
          ctx.rerender();
          await tick();
          v.scorePair(pair);
        }
        // The route: the step-by-step pass, then the same pulls in date order with the selector
        // picks on top (pull-values.js route()).
        const rt = v.route(PP, {
          today: ctx.today, carats: num(p.carats), perMonth: num(p.perMonth),
          tickets: { support: num(p.sTickets), trainee: num(p.tTickets) },
          pullCarats: B.meta.pullCarats, spark: B.meta.spark,
        });
        for (;;) {
          const pass = rt.pass(), m = rt.moves();
          job = pass === 1 ? { stage: "Choosing the pulls (" + m + " picks so far)…", f: 0.7 + 0.2 * (1 - Math.exp(-m / 8)) }
            : pass === 2 ? { stage: "Checking the pulls in date order…", f: 0.9 }
            : { stage: "Choosing the selector picks on top of the pulls…", f: 0.95 };
          ctx.rerender();
          await tick();
          if (!rt.step()) break;
        }
        const out = rt.result();
        result = { key: inputsKey(p), deckKey: dk, until: end, v, plan: out.plan, gains: out.gains, runners: out.runners, at: ctx.today };
      } catch (err) {
        ctx.flash(err.message || String(err));
      }
      job = null;
      ctx.rerender();
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
        <p class="mini">${B ? `Global's rules: ${B.meta.pullCarats} carats a pull, so 200 pulls (one spark) are ${fmtN(200 * B.meta.pullCarats)} carats and 400 (two sparks) ${fmtN(400 * B.meta.pullCarats)}; spark points don't carry over to the next banner. ` : ""}The $20.99 selector packs add 1,500 carats each when you buy them (counted on their dates). Free income has no fixed figure, so type yours. Tickets pay for pulls on their kind of banner first.</p>
      </section>`;
    }
    function teamsHTML(p) {
      const row = (g, i) => {
        const m = (p.teams[g] || [])[i] || { id: null, style: "Senkou" };
        const t = m.id ? D.trainee(m.id) : null;
        let status = "";
        if (t) {
          const out = traineeOutDate(t);
          status = "Counted as yours" + (ctx.myUmas().has(t.id) ? "" : out && out <= ctx.today ? " (on Global)" : out ? " (out on Global ~" + fmtDate(out) + ")" : " (not on Global yet)");
        }
        return `<div class="row-wrap pull-team-row">
          <label class="field grow"><span>Uma ${i + 1}</span><input list="pullTrainees" data-pull-team="${g}" data-i="${i}" value="${esc(t ? tLabel(t) : "")}" placeholder="Name [version]" autocomplete="off"></label>
          <label class="field"><span>Style</span><select data-pull-style="${g}" data-i="${i}">${STYLES.map(([k, l]) => `<option value="${k}" ${m.style === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <span class="mini">${esc(status)}</span>
        </div>`;
      };
      return `<section class="panel">
        <h3>Your future teams</h3>
        <p class="mini">One team per kind of track: every cup ahead uses the team for its track. They count as yours already, so no carats go to them, and each one races every cup of her track in the window.</p>
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
          <label class="field"><span>Plan ahead</span>${sel("months", [["12", "12 months"], ["18", "18 months"], ["24", "24 months"]])}</label>
          <label class="field"><span>Clearly stronger: beats the card it replaces by</span>${sel("minPct", [["5", "5% or more"], ["10", "10% or more"], ["15", "15% or more"], ["20", "20% or more"], ["30", "30% or more"]])}</label>
          <label class="field"><span>Not a one-time use: in at least</span>${sel("minCups", [["1", "1 cup"], ["2", "2 cups"], ["3", "3 cups"], ["4", "4 cups"], ["5", "5 cups"]])}</label>
        </div>
        <div class="row-wrap">
          ${box("selFree", "Free support selector")}
          ${box("selPaid", "$20.99 support selector")}
          ${box("selUma", "$20.99 Uma selector")}
          ${box("parents", "Count trainees as parents")}
          <button type="button" class="btn" id="pullRun" ${job ? "disabled" : ""}>${job ? "Planning…" : result ? "Plan again" : "Plan my pulls"}</button>
        </div>
        ${job ? `<div class="row-wrap"><span class="progress"><i style="width:${Math.round(job.f * 100)}%"></i></span><span class="mini">${esc(job.stage)}</span></div>` : ""}
        ${owned < 6 ? `<p class="mini warn">Mark the support cards you own (and their limit breaks) under <b>My cards</b> in the Support cards tab: your decks are built from them.</p>` : ""}
        ${!num(p.carats) && !num(p.perMonth) ? `<p class="mini warn">Type your carats and monthly income above so there's something to plan with.</p>` : ""}
        ${stale ? `<p class="mini warn">Your inputs changed since this route was made. Plan again to update it.</p>` : ""}
        <p class="mini">A run takes about half a minute: it builds every team uma's deck for every cup ahead (${esc(ctx.settingsText())}) and tries every banner card in them. Planning again with the same cards, teams and window keeps the decks, so it's quicker.</p>
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
        } else got = `<b>${esc(umaName(it.id))}</b> (for Parent 1)`;
        const alt = (result.runners && result.runners.get(s.key)) || [];
        const altText = alt.length
          ? `<div class="mini">Next best here: ${alt.map((x) => esc(x.pick === "support" ? cardShort(x.id) + " " + (x.have ? lb(x.have) + " → " + lb(x.have + 1) : "LB0") : umaName(x.id)) + " " + (x.value > 0 ? "+" + fmtN(x.value) + " (" + x.cups + " cup" + (x.cups === 1 ? "" : "s") + ")" : "clearly stronger in only " + x.cups + " cup" + (x.cups === 1 ? "" : "s"))).join(" · ")}</div>`
          : `<div class="mini">Nothing else here makes a deck clearly stronger.</div>`;
        return `<tr><td>${esc(est(e) + fmtDate(e.start))}</td><td>${esc(e.name)}: ${esc(s0.label)}</td><td class="num">${s0.price ? "$" + s0.price.toFixed(2) + `<div class="mini">+${fmtN(s0.carats)} carats</div>` : "free"}</td>
          <td>Pick ${got}${altText}</td><td>${decks}</td>${left}<td class="num">+${fmtN(adds)}</td></tr>`;
      }
      const pulls = `${fmtN(s.pulls)} pulls<div class="mini">${fmtN(s.carats)} carats${s.tickets ? " + " + fmtN(s.tickets) + " tickets" : ""}</div>`;
      const featured = it.banner.pick.map(([id]) => (it.kind === "support" ? cardName(id) : umaName(id)));
      const what = `${it.kind === "support" ? "Support banner" : "Trainee banner"}<div class="mini">${esc(featured.join(", "))}</div>`;
      let got = "";
      if (it.kind === "support") {
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
        got = `<div class="mini">Spark for (likely result):</div>${targets.join("")}${sides.length ? `<div class="mini">Comes with the pulls, not a target:</div>${sides.join("")}` : ""}`;
      } else {
        const spark = c.spark || [];
        const also = [...(c.got || [])].filter((id) => spark.indexOf(id) === -1);
        got = `<div class="mini">Spark:</div><b>${esc(spark.map(umaName).join(" and "))}</b>${also.length ? `<div class="mini">The pulls likely bring ${esc(also.map(umaName).join(", "))} too.</div>` : ""}`;
      }
      return `<tr><td>${esc(when(it.banner))}</td><td>${what}</td><td class="num">${pulls}</td><td>${got}</td><td>${decks}</td>${left}<td class="num">+${fmtN(adds)}</td></tr>`;
    }
    function routeHTML(p) {
      if (!result) return "";
      const { v, plan } = result;
      const steps = plan.steps;
      const spent = steps.reduce((a, s) => a + s.carats, 0);
      // The $20.99 packs are bought for their carats too, picked from or not.
      const packs = v.selectors.filter((x) => x.price), dollars = packs.reduce((a, x) => a + x.price, 0);
      const bonus = v.bonus.reduce((a, b) => a + b.carats, 0);
      const have = PP.caratsBy({ today: ctx.today, carats: num(p.carats), perMonth: num(p.perMonth) }, result.until) + bonus;
      const seen = new Map();
      const rows = steps.map((s) => stepRow(s, seen)).join("");
      return `<section class="panel pull-route">
        <h3>The route</h3>
        <p class="mini">From ${fmtN(num(p.carats))} carats now and ${fmtN(num(p.perMonth))} a month${bonus ? `, plus ${fmtN(bonus)} from the $20.99 packs` : ""}, you'll have about ${fmtN(have)} by ${esc(fmtDate(result.until))}. This route spends ${fmtN(spent)} of them on the pulls that make your decks clearly stronger in the most cups per carat (at least ${esc(p.minPct)}% over the card replaced, in at least ${esc(p.minCups)} cup${+p.minCups === 1 ? "" : "s"}), in banner order so the carats are there at each one.${packs.length ? ` The ${packs.length} $20.99 pack${packs.length === 1 ? "" : "s"} in the window come to $${dollars.toFixed(2)}.` : ""}</p>
        ${steps.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>What</th><th class="num">Cost</th><th>You get</th><th>Clearly stronger in</th><th class="num">Carats left</th><th class="num">Adds</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="mini">Spark for: the card the route pulls for, at its likely limit break (the spark plus the median pulled copies), with the chances of every other result. Comes with the pulls: the other featured cards' likely copies; they aren't why the route pulls there, but they count where they're clearly stronger. Next best here: the other picks on that selector and their points. Adds: the expected points to your decks over every cup after the banner, counting only the clearly stronger ones (the deck score's units; 60 = 1 L of race skills).</p>` : `<div class="empty">Nothing in the next ${esc(p.months)} months makes your decks clearly stronger in ${esc(p.minCups)} or more cups for the carats you'll have. Add your carats and income above, mark your cards, or relax the rules.</div>`}
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
        return `<h4>${esc(PV.GROUPS[g].label)}</h4>${[...bySlot.values()].map((list) => `<div class="pull-decks"><b>${esc(umaName(list[0].trainee.id))}</b> <span class="mini">${esc((STYLES.find(([k]) => k === list[0].member.style) || [0, ""])[1])}</span><ul class="mini">${list.map((x) => {
          if (!x.base) return `<li>${esc(est(x.cup.global) + fmtDate(x.date))} ${esc(x.cup.name)}: ${esc(x.error || "no deck")}</li>`;
          const now = new Set(x.base.map((c) => c.id + ":" + c.lb)), after = x.deck.filter((c) => !now.has(c.id + ":" + c.lb));
          const m = side.get(x.key) || new Map(), extra = after.filter((c) => !c.borrowed && m.get(c.id) === true), picked = after.filter((c) => extra.indexOf(c) === -1);
          return `<li>${esc(est(x.cup.global) + fmtDate(x.date))} ${esc(x.cup.name)}: ${x.base.map(cardLine).join(" · ")}${picked.length ? `<div>With the route: ${picked.map(cardLine).join(" · ")}</div>` : ""}${extra.length ? `<div>Also from those pulls (not targets): ${extra.map(cardLine).join(" · ")}</div>` : ""}</li>`;
        }).join("")}</ul></div>`).join("")}`;
      }).join("");
      return `<details class="panel"><summary><b>Your decks now</b> (every team uma, every cup ahead, from the cards you own)</summary>
        <p class="mini">Each deck is built the way CM &amp; decks builds it, with a friend's card. These are the decks a banner card has to beat. "With the route" lists the cards the route's sparks and selector picks put in; "Also from those pulls" lists copies of other featured cards the pulls likely bring, which go in wherever they're any better (they aren't what the route pulls for).</p>${groups}</details>`;
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
        <p><b>Your decks now.</b> Your teams count as yours already. For every cup in the window and every uma of the team for its track, it builds her racing deck the way CM &amp; decks does: Euophrys' scoring plus that race's skill values for her style, from the cards you own, with a friend's card.</p>
        <p><b>Clearly stronger.</b> A banner card counts in a deck only when it beats the card it would replace (the "Which cards would improve it?" test, with the other five fixed) by your margin, at the limit break your copies reach. A card you'd otherwise borrow counts as yours, with the next-best friend's card. And only when that happens in enough different cups after its banner: a card you'd use once isn't one you pull for.</p>
        <p><b>200 or 400 pulls.</b> ${B ? B.meta.spark : 200} pulls give one spark (a featured card of your choice), so 200 pulls on an SSR's banner likely end at LB1 (the spark and one pulled copy), and 400 at LB4. A pull counts only when its likely result already clears your rules; its value is then the expected points over every result the pulls can give (with the sparks where they help most once you see the pulls), the other featured cards' copies included.</p>
        <p><b>Selectors.</b> At each anniversary (JP's campaigns, on Global's calendar: its 1.5 Anniversary was in July 2026), a free support selector and the $20.99 ones (support and Uma, each with 1,500 carats). The pool: the gacha SSRs (or 3★ umas) JP had about ${PV.POOL_LAG || 45} days before that anniversary. A pick is one copy, valued like a pulled one; it's taken before any carats are spent.</p>
        <p><b>Parents.</b> With "Count trainees as parents" on, a trainee counts as Parent 1 for your team umas (yours to train; Parent 2 is a friend's rental): her sparks fire at their base chance × (1 + her affinity with the ace / 100) at the ace's two inspirations, carrying the ace's top 3 race whites and her inherited unique at 2★. Same rules: clearly better than your best Parent 1 (your teams included), in enough cups. Future characters' affinity comes from JP's table.</p>
        <p><b>The route.</b> Step by step, the move with the most points per carat that still leaves enough carats at every banner (free selector picks first, then the pulls), counting your income up to each banner's date, the packs' carats and tickets first. After each step the decks take the step's likely cards, so the next card has to beat those. Then a second pass: back to your decks now, the same pulls in date order, and the selector picks chosen again on top of them, so no pick goes to a card a pull already brings to LB4. It's a careful step-by-step plan, not a search of every possible route.</p>
        <p><b>Dates.</b> Banners Global has announced keep their own dates and rates. Later ones, the anniversaries and the cups are GameTora's forecast from Global's pace against JP, so they can shift; plan again as banners are announced.</p>
      </div></details>`;
    }
    function render(body) {
      const p = S();
      if (!B || !PV || !PP) { body.innerHTML = `<div class="empty">The banner data didn't load. Refresh the page.</div>`; return; }
      body.innerHTML = `<div class="pulls">
        <section class="panel"><h2>Pull planner</h2><p class="mini">Which banners to pull 200 or 400 on, and what to pick on each selector, so your future teams' decks get clearly stronger in as many cups as your carats allow. It builds your best decks for every cup ahead from the cards you own, then checks each banner card against them, on the banners Global has announced and GameTora's forecast of the rest.</p></section>
        ${budgetHTML(p)}${teamsHTML(p)}${controlsHTML(p)}${routeHTML(p)}${decksHTML()}${calendarHTML(p)}${howHTML()}
      </div>`;
    }

    // ---------- events ----------
    function click(e) {
      if (e.target.closest("#pullRun")) { run(); return true; }
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
        if (!t.value.trim()) list[i] = { id: null, style: (list[i] || {}).style || "Senkou" };
        else if (id) list[i] = { id, style: (list[i] || {}).style || "Senkou" };
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
      return false;
    }
    return { render, click, change, running: () => !!job, DEFAULT_TEAMS };
  }

  const api = { create, DEFAULT_TEAMS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaPullTab = api;
})(typeof window !== "undefined" ? window : globalThis);
