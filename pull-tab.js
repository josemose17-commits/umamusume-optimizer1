// The Pull planner tab: your carats and future teams, and the route through the banners ahead
// that gets your teams the most. pull-values.js values every featured card and trainee for your
// teams (decks and parents), pull-planner.js finds the route. Keeps state.pull.
(function (root) {
  "use strict";
  const STYLES = [["Nige", "Front Runner"], ["Senkou", "Pace Chaser"], ["Sasi", "Late Surger"], ["Oikomi", "End Closer"]];
  const STYLE_SHORT = { Nige: "Front", Senkou: "Pace", Sasi: "Late", Oikomi: "End" };
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
      const def = { carats: "", perMonth: "", sTickets: "", tTickets: "", months: "18", luck: "mean", parents: true };
      Object.keys(def).forEach((k) => { if (p[k] == null) p[k] = def[k]; });
      if (!p.teams) p.teams = JSON.parse(JSON.stringify(DEFAULT_TEAMS));
      return p;
    }
    const until = (p) => { const d = new Date(Date.parse(ctx.today) + (+p.months || 18) * 30.4375 * 864e5); return d.toISOString().slice(0, 10); };
    const inputsKey = (p) => JSON.stringify([p.carats, p.perMonth, p.sTickets, p.tTickets, p.months, p.luck, p.parents, p.teams, ctx.ownedCode(), [...ctx.myUmas()].sort(), ctx.settingsKey()]);
    const relT = (B && B.release && B.release.trainees) || {};
    const traineeOutDate = (t) => t.en || relT[t.id] || null;
    const firstBanner = (id) => (B ? B.trainee.find((b) => b.pick.some(([x]) => x === id) && (b.end ? b.end >= ctx.today : b.start >= ctx.today)) : null);
    const cardName = (id) => { const c = D.card(id); return c ? c.n + " (" + RARITY[c.r] + " " + c.ty + ")" : "#" + id; };
    const umaName = (id) => { const t = D.trainee(id); return t ? tLabel(t) : "#" + id; };
    const when = (b) => (b.est ? "~" : "") + fmtDate(b.start < ctx.today ? ctx.today : b.start) + (b.end && !b.est ? " to " + fmtDate(b.end) : "");

    // ---------- the run ----------
    const tick = () => new Promise((r) => setTimeout(r, 0));
    async function run() {
      const p = S();
      if (job) return;
      job = { stage: "Loading the card data…", f: 0 };
      ctx.rerender();
      try {
        for (let i = 0; !ctx.euReady(); i++) { if (i > 600) throw new Error("The card data didn't load. Check your connection."); await new Promise((r) => setTimeout(r, 100)); }
        const end = until(p), mine = ctx.myUmas();
        const teams = JSON.parse(JSON.stringify(p.teams));
        const cupIds = P.list.filter((x) => x.global.start > ctx.today && x.global.start <= end && PV.groupOf(x)).map((x) => x.id);
        job.stage = "Loading each cup's skill values…"; ctx.rerender();
        await ctx.ensureSkills(cupIds);
        const v = PV.create({
          D, T: ctx.T, A: ctx.A, B, P, today: ctx.today, until: end, teams, owned: ctx.owned(), umas: mine,
          deckOpts: ctx.deckOpts, whites: ctx.whites, skillL: ctx.skillL,
        });
        if (!p.parents) v.items.splice(0, v.items.length, ...v.items.filter((it) => it.kind === "support" || it.required));
        for (let i = 0; i < v.pairs.length; i++) {
          const pair = v.pairs[i];
          job = { stage: "Building " + pair.trainee.n + "'s deck for " + pair.cup.name + " (" + (i + 1) + " of " + v.pairs.length + ")", f: 0.6 * i / v.pairs.length };
          ctx.rerender();
          await tick();
          v.buildPair(pair);
        }
        const gains = new Map(); // what each planned item adds, in points
        const pl = PP.planner(v.items, {
          today: ctx.today, carats: num(p.carats), perMonth: num(p.perMonth), tickets: { support: num(p.sTickets), trainee: num(p.tTickets) },
          luck: p.luck, pullCarats: B.meta.pullCarats, spark: B.meta.spark,
          value: (key, k) => v.value(key, k),
          onStep: (s) => { v.commit(s.key, s.k); if (!s.required) gains.set(s.key, (gains.get(s.key) || 0) + (s.dv || 0)); },
        });
        let n = 0;
        for (;;) {
          job = { stage: "Choosing the route (" + n + " pulls planned so far)…", f: 0.6 + 0.4 * (1 - Math.exp(-n / 8)) };
          ctx.rerender();
          await tick();
          if (!pl.step()) break;
          n++;
        }
        result = { key: inputsKey(p), until: end, v, plan: pl.result(), pulls: pl.pulls, gains, at: ctx.today };
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
        <p class="mini">${B ? `Global's rules: ${B.meta.pullCarats} carats a pull, and ${B.meta.spark} pulls on one banner spark (exchange for) a featured card or trainee of your choice; spark points don't carry over to the next banner. Featured rates come from each banner (a featured SSR or 3★ trainee 0.75%, an SR or 2★ trainee 2.25%).` : ""} Free income has no fixed figure (guides put it at about 2,000–3,500 a month before events), so type yours. Tickets pay for pulls on their kind of banner first.</p>
      </section>`;
    }
    function teamsHTML(p) {
      const row = (g, i) => {
        const m = (p.teams[g] || [])[i] || { id: null, style: "Senkou" };
        const t = m.id ? D.trainee(m.id) : null;
        let status = "";
        if (t) {
          const out = traineeOutDate(t), b = firstBanner(t.id);
          status = ctx.myUmas().has(t.id) ? "You have her (My umas)"
            : t.en && t.en <= ctx.today ? "On Global" + (b ? "; on a banner " + when(b) : "") + " · not in your My umas (tick Own in Trainees if you have her)"
            : (out ? "Out on Global ~" + fmtDate(out) : "Not on Global yet") + (b ? "; first banner " + when(b) : "; no banner in the forecast yet");
        }
        return `<div class="row-wrap pull-team-row">
          <label class="field grow"><span>Uma ${i + 1}</span><input list="pullTrainees" data-pull-team="${g}" data-i="${i}" value="${esc(t ? tLabel(t) : "")}" placeholder="Name [version]" autocomplete="off"></label>
          <label class="field"><span>Style</span><select data-pull-style="${g}" data-i="${i}">${STYLES.map(([k, l]) => `<option value="${k}" ${m.style === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <span class="mini">${esc(status)}</span>
        </div>`;
      };
      return `<section class="panel">
        <h3>Your future teams</h3>
        <p class="mini">One team per kind of track: every cup ahead uses the team for its track. A team uma you don't own is planned on her first banner; one not out on Global by a cup sits that cup out.</p>
        ${Object.keys(PV.GROUPS).map((g) => `<div class="pull-team"><h4>${esc(PV.GROUPS[g].label)}</h4>${[0, 1, 2].map((i) => row(g, i)).join("")}</div>`).join("")}
        <datalist id="pullTrainees">${D.DATA.trainees.slice().sort((a, b) => tLabel(a).localeCompare(tLabel(b))).map((t) => `<option value="${esc(tLabel(t))}"></option>`).join("")}</datalist>
      </section>`;
    }
    function controlsHTML(p) {
      const owned = Object.keys(ctx.owned()).length;
      const stale = result && result.key !== inputsKey(p);
      return `<section class="panel">
        <h3>Plan my pulls</h3>
        <div class="row-wrap">
          <label class="field"><span>Plan ahead</span><select data-pull="months">${[["12", "12 months"], ["18", "18 months"], ["24", "24 months"]].map(([k, l]) => `<option value="${k}" ${p.months === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <label class="field"><span>Luck</span><select data-pull="luck"><option value="mean" ${p.luck === "mean" ? "selected" : ""}>Average luck (expected pulls)</option><option value="p90" ${p.luck === "p90" ? "selected" : ""}>Safe (90% sure of each target)</option></select></label>
          <label class="chip-toggle"><input type="checkbox" data-pull="parents" ${p.parents ? "checked" : ""}> Count trainees as parents</label>
          <button type="button" class="btn" id="pullRun" ${job ? "disabled" : ""}>${job ? "Planning…" : result ? "Plan again" : "Plan my pulls"}</button>
        </div>
        ${job ? `<div class="row-wrap"><span class="progress"><i style="width:${Math.round(job.f * 100)}%"></i></span><span class="mini">${esc(job.stage)}</span></div>` : ""}
        ${owned < 6 ? `<p class="mini warn">Mark the support cards you own (and their limit breaks) under <b>My cards</b> in the Support cards tab: the planner builds each deck from them.</p>` : ""}
        ${!num(p.carats) && !num(p.perMonth) ? `<p class="mini warn">Type your carats and monthly income above so there's something to plan with.</p>` : ""}
        ${stale ? `<p class="mini warn">Your inputs changed since this route was made. Plan again to update it.</p>` : ""}
        <p class="mini">It takes about half a minute: it builds every team uma's deck for every cup ahead (${esc(ctx.settingsText())}).</p>
      </section>`;
    }
    function why(it, k) {
      const v = result.v;
      if (it.required) return "Your team uma (" + esc(Object.keys(PV.GROUPS).filter((g) => (S().teams[g] || []).some((m) => m && +m.id === it.id)).map((g) => PV.GROUPS[g].label).join(", ")) + ")";
      const rows = v.breakdown(it.key, k);
      if (!rows.length) return "";
      const by = new Map();
      rows.forEach((r) => {
        const name = r.pair.trainee.n;
        if (!by.has(name)) by.set(name, []);
        by.get(name).push(r);
      });
      return [...by.entries()].map(([name, rs]) => it.kind === "support"
        ? esc(name) + "'s deck in " + rs.length + " cup" + (rs.length === 1 ? "" : "s") + " (" + rs.slice(0, 3).map((r) => esc(r.pair.cup.name)).join(", ") + (rs.length > 3 ? "…" : "") + ")"
        : "Parent 1 for " + esc(name) + " in " + rs.length + " cup" + (rs.length === 1 ? "" : "s")).join("; ");
    }
    function routeHTML(p) {
      if (!result) return "";
      const { v, plan } = result;
      const steps = plan.steps;
      const spent = steps.reduce((a, s) => a + s.carats, 0);
      const have = PP.caratsBy({ today: ctx.today, carats: num(p.carats), perMonth: num(p.perMonth) }, result.until);
      const rows = steps.map((s) => {
        const it = v.byKey.get(s.key);
        const c = PP.cost(s.k, it.rate, B.meta.spark);
        const target = it.kind === "support"
          ? `<b>${esc(cardName(it.id))}</b> to ${it.have + s.k >= 5 ? "its last limit break (LB4)" : "LB" + (it.have + s.k - 1)}${it.have ? " (you have LB" + (it.have - 1) + ")" : ""}`
          : `<b>${esc(umaName(it.id))}</b>`;
        const others = it.banner.pick.filter(([id]) => id !== it.id).map(([id]) => (it.kind === "support" ? cardName(id) : umaName(id)));
        return `<tr><td>${esc(when(it.banner))}</td><td>${target}${others.length ? `<div class="mini">Also on the banner: ${esc(others.join(", "))}</div>` : ""}</td>
          <td class="num">about ${fmtN(c.mean)}<div class="mini">90% sure by ${fmtN(c.p90)}, at most ${fmtN(c.max)}</div>${s.tickets ? `<div class="mini">${fmtN(s.tickets)} on tickets</div>` : ""}</td>
          <td class="num">${fmtN(s.carats)}</td><td class="num">${fmtN(s.left)}</td>
          <td class="num">${it.required ? "needed" : "+" + fmtN(result.gains.get(it.key) || 0)}</td><td class="mini">${why(it, s.k)}</td></tr>`;
      }).join("");
      const missed = plan.missed.map((key) => v.byKey.get(key)).map((it) => `<li><b>${esc(umaName(it.id))}</b> (${esc(when(it.banner))}): not affordable by then with these carats. Get her on a later rerun, or save more before.</li>`).join("");
      const noBanner = v.noBanner.map((id) => `<li><b>${esc(umaName(id))}</b>: no banner with her in the forecast within ${esc(p.months)} months.</li>`).join("");
      // Worth a look: the best picks the route left out.
      const left = v.items.filter((it) => !plan.chosen.get(it.key)).map((it) => {
        const k = it.kind === "support" ? Math.min(5 - it.have, 1) : 1;
        return { it, k, val: k > 0 ? v.value(it.key, k) : 0, carats: result.pulls(it, k) * B.meta.pullCarats };
      }).filter((x) => x.val > 0).sort((a, b) => b.val / b.carats - a.val / a.carats).slice(0, 6);
      return `<section class="panel pull-route">
        <h3>The route</h3>
        <p class="mini">From ${fmtN(num(p.carats))} carats now and ${fmtN(num(p.perMonth))} a month, you'll have about ${fmtN(have)} by ${esc(fmtDate(result.until))}. This route spends about ${fmtN(spent)} of them (${p.luck === "p90" ? "planned to be 90% sure of every target" : "at average luck"}), on the pulls that add the most to your teams per carat, in banner order so the carats are there at each one.</p>
        ${steps.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Pull for</th><th class="num">Pulls</th><th class="num">Carats</th><th class="num">Carats left</th><th class="num">Adds</th><th>What it's for</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="mini">Adds: points to your teams (the deck score's units; 60 = 1 L of race skills), summed over every cup after the banner. "At most" is the spark: one card per ${B.meta.spark} pulls.</p>` : `<div class="empty">No pull in the next ${esc(p.months)} months adds enough for the carats you'll have. Add your carats and income above, or mark your cards.</div>`}
        ${missed || noBanner ? `<ul class="mini">${missed}${noBanner}</ul>` : ""}
        ${left.length ? `<details><summary>Next best if you have carats to spare</summary><ul class="mini">${left.map((x) => `<li><b>${esc(x.it.kind === "support" ? cardName(x.it.id) : umaName(x.it.id))}</b> (${esc(when(x.it.banner))}): about ${fmtN(x.carats)} carats for ${x.it.kind === "support" ? "a copy" : "her"}, worth ${fmtN(x.val)} points to your teams.</li>`).join("")}</ul></details>` : ""}
        ${v.unscorable.length ? `<p class="mini">${v.unscorable.length} featured card${v.unscorable.length === 1 ? "" : "s"} in this window can't be scored yet (Euophrys' data doesn't have ${v.unscorable.length === 1 ? "it" : "them"}), so ${v.unscorable.length === 1 ? "it isn't" : "they aren't"} planned.</p>` : ""}
      </section>`;
    }
    function calendarHTML(p) {
      if (!B) return "";
      const end = until(p);
      const live = (b) => (b.end ? b.end >= ctx.today : b.start >= ctx.today) && b.start <= end;
      const list = B.support.filter(live).map((b) => ({ b, kind: "support" })).concat(B.trainee.filter(live).map((b) => ({ b, kind: "trainee" })))
        .sort((a, b) => (a.b.start < b.b.start ? -1 : a.b.start > b.b.start ? 1 : 0)).slice(0, 80);
      const mark = (kind, b, id) => {
        if (!result) return "";
        const key = (kind === "support" ? "s" : "t") + b.id + ":" + id, k = result.plan.chosen.get(key);
        return k ? ` <span class="pill">in your route</span>` : "";
      };
      return `<details class="panel"><summary><b>Banners ahead</b> (GameTora's forecast after the announced ones; ~ dates are estimates)</summary>
        <div class="table-wrap"><table><thead><tr><th>When</th><th>Banner</th><th>Featured</th></tr></thead><tbody>
        ${list.map(({ b, kind }) => `<tr><td>${esc(when(b))}</td><td>${kind === "support" ? "Support card" : "Trainee"}</td><td>${b.pick.map(([id, r]) => esc(kind === "support" ? cardName(id) : umaName(id)) + ` <span class="mini">${(r * 100).toFixed(2)}%</span>` + mark(kind, b, id)).join("<br>")}</td></tr>`).join("")}
        </tbody></table></div></details>`;
    }
    function howHTML() {
      return `<details class="panel"><summary><b>How it decides</b></summary><div class="mini">
        <p><b>Support cards.</b> For every cup in the window and every uma of the team for its track (once she's out on Global), it builds her racing deck the way CM &amp; decks does: Euophrys' scoring plus that race's skill values for her style, from the cards you own (and the route's earlier pulls), with a friend's card. A card's value there is how much it beats the card it would replace with the other five fixed (the "Which cards would improve it?" test), at the limit break its copies reach. Its value is the sum over every cup after its banner, in the deck score's points (1 L of race skills = 60 points). Cards on banners further out than Euophrys' data reaches can't be scored yet.</p>
        <p><b>Trainees.</b> A team uma you don't own is required: she's planned first, on her first banner. With "Count trainees as parents" on, any other trainee is worth what she adds as Parent 1 for your team umas (yours to train; Parent 2 is a friend's rental): her sparks fire at their base chance × (1 + her affinity with the ace / 100) at the ace's two inspirations. Built for the ace, she carries the ace's top 3 race whites and her inherited unique at 2★; her value is what that beats the best Parent 1 you'd otherwise have, in the same points. Future characters' affinity comes from JP's affinity table.</p>
        <p><b>Cost.</b> Pulls until you have the copies, sparking the card when the pulls allow (${B ? B.meta.spark : 200} pulls give one), so a copy never takes more than one spark. Average luck plans the expected pulls; Safe plans for the 90th percentile, often a full spark.</p>
        <p><b>The route.</b> Required trainees first, then step by step the pull (a card to one more copy, or a trainee) with the most points per carat that still leaves enough carats at every banner, counting your income up to each banner's date and using tickets first. Two cards on one banner are costed separately (their pulls overlap in reality, so the route is a little cautious there).</p>
        <p><b>Dates.</b> Banners Global has announced keep their own dates and rates. Later ones are GameTora's forecast from Global's pace against JP, so they can shift; plan again as banners are announced. Cups use the same forecast (CM &amp; decks).</p>
      </div></details>`;
    }
    function render(body) {
      const p = S();
      if (!B || !PV || !PP) { body.innerHTML = `<div class="empty">The banner data didn't load. Refresh the page.</div>`; return; }
      body.innerHTML = `<div class="pulls">
        <section class="panel"><h2>Pull planner</h2><p class="mini">Which banners to pull on, and how far, so your future teams get the most from your carats: support cards for their decks, the trainees you need, and trainees worth having as parents. It weighs everything the CM &amp; decks and Parents tabs know, on the banners Global has announced and GameTora's forecast of the rest.</p></section>
        ${budgetHTML(p)}${teamsHTML(p)}${controlsHTML(p)}${routeHTML(p)}${calendarHTML(p)}${howHTML()}
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
