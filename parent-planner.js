// The Parents tab: plan the G1s the uma you're training now should win so that, as a parent,
// she reaches ◎ affinity with the fewest races (each race costs rating), and check whether her
// rating reaches SS (which doubles her white sparks' 3★ chance) with the best skill purchase.
// Logic lives in affinity.js and rating.js; this file renders and keeps state.parents.
(function (root) {
  "use strict";
  const ROLES = [
    ["l1", "Her legacy 1", ""],
    ["l2", "Her legacy 2", ""],
    ["partner", "Her partner", "optional"],
    ["pg1", "Partner's legacy 1", "optional"],
    ["pg2", "Partner's legacy 2", "optional"],
  ];
  const APT_LABELS = ["Turf", "Dirt", "Sprint", "Mile", "Medium", "Long", "Front", "Pace", "Late", "End"];
  const GRADES = ["S", "A", "B", "C", "D", "E", "F", "G"];
  const STAT_LABELS = ["Speed", "Stamina", "Power", "Guts", "Wit"];
  // Rating per skill point for converting SP: the median white skill's rating ÷ its full cost
  // (1.21; hint discounts raise it). Used only for rough "or this many more SP" readouts.
  const SP_RATING = 1.2;

  function create(ctx) {
    const { D, A, R, SB, esc } = ctx;
    const open = new Set(["who", "races", "deck", "rating"]);
    let raceCost = null; // { perRace, races, ... } from ctx.raceCost(), until inputs change

    function st() {
      const s = ctx.state();
      if (!s.parents) s.parents = {};
      const p = s.parents;
      const d = { self: null, selfTrainee: null, apt: null, minGrade: "B", target: 151, ace: null, rating: {} };
      Object.keys(d).forEach((k) => { if (p[k] === undefined) p[k] = d[k]; });
      ROLES.forEach(([k]) => { if (!p[k]) p[k] = { cid: null, wins: [] }; });
      const r = p.rating;
      const rd = { stats: [null, null, null, null, null], sp: null, uniqueLevel: null, learned: [], shop: {}, must: [] };
      Object.keys(rd).forEach((k) => { if (r[k] === undefined) r[k] = rd[k]; });
      // She is the coach's trainee (one trainee everywhere): ① sets it, and it follows it.
      const tr = ctx.coachTrainee();
      if (tr && (p.self !== tr.cid || p.selfTrainee !== tr.id)) { p.self = tr.cid; p.selfTrainee = tr.id; p.apt = null; }
      return p;
    }

    // Characters (one entry per character, any version).
    const chars = new Map(), charByName = new Map();
    D.DATA.trainees.forEach((t) => {
      if (!chars.has(t.cid)) chars.set(t.cid, t.n);
      if (!charByName.has(t.n.toLowerCase())) charByName.set(t.n.toLowerCase(), t.cid);
    });
    const charName = (cid) => (cid ? chars.get(+cid) || "#" + cid : "");
    const trainee = (id) => D.DATA.trainees.find((t) => t.id === +id) || null;
    const versions = (cid) => D.DATA.trainees.filter((t) => t.cid === +cid);
    const g1 = A.g1Races().sort((a, b) => a.turns[0] - b.turns[0] || a.name.localeCompare(b.name));

    function apt(p) {
      if (p.apt) return p.apt;
      const t = trainee(p.selfTrainee);
      return t ? t.apt.slice() : null;
    }
    const stars = (p) => { const t = trainee(p.selfTrainee); return t ? t.r : 3; };

    // ---------- Affinity and the G1 plan ----------
    function lineage(p) {
      return { trainee: p.ace, p1: p.self, p2: p.partner.cid, g11: p.l1.cid, g12: p.l2.cid, g21: p.pg1.cid, g22: p.pg2.cid };
    }
    function knownWins(p) {
      return { p2: p.partner.wins, g11: p.l1.wins, g12: p.l2.wins, g21: p.pg1.wins, g22: p.pg2.wins };
    }
    function plan(p) {
      const base = A.total(lineage(p), knownWins(p));
      const need = p.ace ? Math.max(0, p.target - base.total) : Infinity;
      const links = [["l1", "her parent 1"], ["l2", "her parent 2"], ["partner", "partner"]]
        .map(([k, role]) => ({ role, cid: p[k].cid, wins: p[k].wins }));
      const out = A.planRaces({ self: p.self, apt: apt(p), minGrade: p.minGrade, links, need });
      return Object.assign(out, { base, need, after: base.total + out.points });
    }

    function charInput(key, value, placeholder) {
      return `<input data-pp-char="${key}" list="ppChars" value="${esc(charName(value))}" placeholder="${esc(placeholder || "Character")}" autocomplete="off">`;
    }
    function winsBox(key, wins) {
      const id = "w-" + key;
      return `<details class="pp-wins" data-pp-open="${id}"${open.has(id) ? " open" : ""}><summary>Tick her G1 wins · ${wins.length ? wins.length + " ticked: " + esc(wins.slice(0, 3).join(", ")) + (wins.length > 3 ? " +" + (wins.length - 3) : "") : "none yet"}</summary>
        <div class="pp-g1grid">${g1.map((r) => `<label class="pp-g1"><input type="checkbox" data-pp-win="${key}" value="${esc(r.name)}"${wins.indexOf(r.name) !== -1 ? " checked" : ""}> ${esc(r.name)}</label>`).join("")}</div></details>`;
    }

    // ① Who: the uma you're training, her parents, the ace and partner, and their G1 wins.
    function whoHTML(p) {
      const vers = p.self ? versions(p.self) : [];
      const a = apt(p);
      return `<p class="mini pp-tree"><b>Ace</b> = She + Partner · <b>She</b> = Legacy 1 + Legacy 2 · <b>Partner</b> = Partner's legacy 1 + 2</p>
        <h3 class="pp-h">Now: this run</h3>
        <div class="pp-form">
          <label class="field"><span>Uma you're training <i class="mini">also the coach's trainee</i></span>${charInput("self", p.self, "Your trainee")}</label>
          ${vers.length > 1 ? `<label class="field"><span>Version</span><select data-pp="selfTrainee">${vers.map((v) => `<option value="${v.id}"${v.id === +p.selfTrainee ? " selected" : ""}>${esc(v.t)}</option>`).join("")}</select></label>` : ""}
        </div>
        ${a ? `<div class="pp-apt"><span class="mini">Her aptitudes, used to skip races she can't win. If a spark raised one, change it here:</span> ${[0, 1, 2, 3, 4, 5].map((i) => `<label class="pp-aptf"><span>${APT_LABELS[i]}</span><select data-pp-apt="${i}">${GRADES.map((g) => `<option${a[i] === g ? " selected" : ""}>${g}</option>`).join("")}</select></label>`).join("")}${p.apt ? ' <button type="button" class="btn ghost small" data-pp-act="aptReset">Use her base aptitudes</button>' : ""}</div>` : ""}
        <div class="pp-links">${["l1","l2"].map((k) => { const [, l, hint] = ROLES.find((r) => r[0] === k); return `<div class="pp-link"><label class="field"><span>${l}${hint ? ` <i class="mini">${hint}</i>` : ""}</span>${charInput(k, p[k].cid)}</label>${p[k].cid ? winsBox(k, p[k].wins) : ""}</div>`; }).join("")}</div>
        <h3 class="pp-h">Later: when she's a parent</h3>
        <div class="pp-form"><label class="field"><span>The ace you'll breed <i class="mini">optional</i></span>${charInput("ace", p.ace, "The future trainee")}</label></div>
        <div class="pp-links">${["partner","pg1","pg2"].map((k) => { const [, l, hint] = ROLES.find((r) => r[0] === k); return `<div class="pp-link"><label class="field"><span>${l}${hint ? ` <i class="mini">${hint}</i>` : ""}</span>${charInput(k, p[k].cid)}</label>${p[k].cid ? winsBox(k, p[k].wins) : ""}</div>`; }).join("")}</div>`;
    }

    // ② Races: the fewest G1s she should win for the affinity target, and what they cost.
    function racesHTML(p) {
      const res = p.self ? plan(p) : null;
      const sym = (n) => `<b class="pp-sym">${A.symbol(n)}</b> ${n}`;
      let out = `<p class="mini">The fewest G1s she should win so that, as a parent later, she reaches ${A.symbol(p.target)} affinity. Each race costs rating, so fewer is better.</p>
        <div class="pp-form">
          <label class="field"><span>Target</span><select data-pp="target">${[[151, "◎ (151+)"], [51, "○ (51+)"]].map(([v, l]) => `<option value="${v}"${+p.target === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
          <label class="field"><span>Race only if aptitude is</span><select data-pp="minGrade">${["A", "B", "C"].map((g) => `<option value="${g}"${p.minGrade === g ? " selected" : ""}>${g} or better</option>`).join("")}</select></label>
        </div>
        <details class="pred-help"><summary>How this works</summary><p class="mini">Affinity (◎/○/△ on the legacy screen) raises every spark's chance to fire. Most of it is fixed by which characters you pair, but each G1 that two of them both won adds <b>+3</b>: the two parents, and each parent with her own two parents. So she should win the G1s her own parents won (they'll be her grandparents later) and the ones her future partner won. Career-goal G1s come first (she runs them anyway), then the races shared with the most umas; races outside her aptitudes or on a turn already taken are skipped. G2/G3 wins and titles don't count on Global; over 150 is ◎. Formula: GameTora's compatibility calculator.</p></details>`;
      if (!res) return out + `<p class="mini">Pick the uma you're training in ① to plan her races.</p>`;
      const b = res.base;
      out += `<div class="pp-result">`;
      if (p.ace) {
        out += `<p>Affinity in that lineage without her wins: ${sym(b.total)} (pairings ${b.base}, shared wins among the others ${b.racePts}). ${res.need > 0 ? `Needs <b>+${res.need}</b> from her G1s for ${A.symbol(p.target)}.` : `Already ${A.symbol(p.target)}: she only needs her career goals.`}</p>`;
      } else {
        out += `<p class="mini">Pick the ace you'll breed to see how much affinity she still needs. Until then this lists every shared G1 she can run.</p>`;
      }
      const extra = res.agenda.filter((r) => !r.free);
      if (!res.candidates.length) out += `<p class="mini">None of the linked umas has a G1 win entered yet. Tick each one's G1 wins above.</p>`;
      else {
        out += `<div class="table-wrap"><table class="plan"><thead><tr><th>Turn</th><th>Race</th><th></th><th>Shared with</th><th>Affinity</th></tr></thead><tbody>${res.agenda.map((r) => `
          <tr><td class="num">${r.turn}<div class="mini">${esc(ctx.turnText(r.turn))}</div></td><td><b>${esc(r.name)}</b><div class="mini">${r.d}m ${r.s === 2 ? "dirt" : "turf"}${r.aptGrades ? " · aptitude " + r.aptGrades.join("/") : ""}</div></td><td>${r.free ? '<span class="chip">career goal, free</span>' : '<span class="chip warnchip">extra race</span>'}</td><td class="mini">${esc(r.with.join(", "))}</td><td class="num">+${r.points}</td></tr>`).join("")}</tbody></table></div>
          <p><b>${extra.length} extra race${extra.length === 1 ? "" : "s"}</b> (plus ${res.agenda.length - extra.length} career goal${res.agenda.length - extra.length === 1 ? "" : "s"}) for <b>+${res.points}</b>${p.ace ? ` → ${sym(res.after)}${res.reached ? "" : ` · still short of ${A.symbol(p.target)}: pair her with umas she shares more with, or raise an aptitude`}` : ""}.</p>`;
        if (res.skipped.length) out += `<p class="mini">Clashes with a race already planned on the same turn: ${res.skipped.map((r) => esc(r.name)).join(", ")}.</p>`;
        if (res.unfit.length) out += `<p class="mini">Shared but outside her aptitudes (${esc(p.minGrade)} or better): ${res.unfit.map((r) => `${esc(r.name)} (+${r.points}, ${r.aptGrades.join("/")})`).join(", ")}.</p>`;
        out += `<p class="mini">Win every race listed: only a win counts. Independent Training wins races on distance and surface aptitude alone.</p>`;
      }
      // What the races cost, and the hand-off to Independent Training scoring.
      const g1Count = res.agenda.length;
      out += `<div class="row-wrap"><button type="button" class="btn ghost small" data-pp-act="cost">Estimate the rating cost per race</button></div>`;
      if (raceCost) out += raceCost.error ? `<p class="mini warn">${esc(raceCost.error)}</p>` : `<p class="mini">With your coach deck, each optional race costs about <b>${Math.round(raceCost.perRace)} rating</b> (a training turn's stats and skill points, minus what the race gives; skill points at ~${SP_RATING} rating each). ${extra.length} extra races: about <b>${Math.round(raceCost.perRace * extra.length)}</b>. Simulated ${raceCost.runs} careers each at ${raceCost.races.map((n) => n.toFixed(1)).join(" and ")} optional races.</p>`;
      out += `<p class="mini">③ Deck counts these ${g1Count} G1 race${g1Count === 1 ? "" : "s"} for Independent Training (Race Bonus and the predicted stats).</p>`;
      return out + "</div>";
    }

    // ---------- Rating check ----------
    function solver(p, a) {
      const r = p.rating;
      const values = {};
      Object.keys(SB.DATA.skills).forEach((id) => { values[id] = R.skillScore(id, a); });
      r.must.forEach((id) => { if (!Number.isFinite(values[id])) values[id] = 0; });
      const shop = r.shop;
      const levels = {}, available = [];
      Object.keys(shop).forEach((id) => { if (shop[id] > 0) levels[id] = shop[id]; else available.push(id); });
      const s = SB.create({ skills: values, learned: r.learned, available, must: r.must.filter((id) => r.learned.indexOf(id) === -1), lengthValue: 1 });
      return { s, levels, values };
    }
    // Learned skills count once per family (a gold replaces its white, ◎ its ○).
    function learnedTop(s, ids) {
      const chains = ids.map((id) => ({ id, c: s.chain(id) }));
      return ids.filter((id) => !chains.some((x) => x.id !== id && x.c && x.c.indexOf(id) !== -1 && x.c.length > 1));
    }

    function ratingHTML(p) {
      const r = p.rating;
      const a = apt(p) || null;
      const t = trainee(p.selfTrainee);
      const uLv = r.uniqueLevel != null ? r.uniqueLevel : stars(p);
      const statsIn = STAT_LABELS.map((l, i) => `<label class="field pp-stat"><span>${l}</span><input type="number" inputmode="numeric" min="0" max="2500" data-pp-stat="${i}" value="${r.stats[i] == null ? "" : r.stats[i]}"></label>`).join("");
      let out = `<p class="mini">Enter her final stats and skill points, add the skills in her shop, and it picks the buy that gets her closest to SS (${R.SS.toLocaleString()}).</p><details class="pred-help"><summary>How this works</summary><p class="mini">Rating = each stat's score (it rises steeply: 1000 → 1200 Speed is worth more than 400 → 600) + each learned skill's rating (more for skills that fit her aptitudes; a gold replaces its white) + the unique skill's level × ${stars(p) >= 3 ? 170 : 120}. SS starts at ${R.SS.toLocaleString()} and doubles her white sparks' 3★ chance. Stat scores: UmaTools' rating guide; skill ratings: UmaTools' skill table.</p></details>
        <div class="pp-form">${statsIn}
          <label class="field pp-stat"><span>Skill points left</span><input type="number" inputmode="numeric" min="0" data-pp-r="sp" value="${r.sp == null ? "" : r.sp}"></label>
          <label class="field pp-stat"><span>Unique skill level</span><input type="number" inputmode="numeric" min="0" max="10" data-pp-r="uniqueLevel" value="${uLv}"></label>
        </div>
        <div class="row-wrap">${ctx.predicted() ? '<button type="button" class="btn ghost small" data-pp-act="usePredicted">Use the deck optimizer\'s predicted stats</button>' : ""}${t ? `<button type="button" class="btn ghost small" data-pp-act="addInnate">Add her innate and awakening skills to the shop</button>` : ""}${ctx.cmMust().length ? `<button type="button" class="btn ghost small" data-pp-act="addMust">Add my CM &amp; decks must-haves as spark ★</button>` : ""}</div>
        <div class="row-wrap"><label class="field grow"><span>Add a skill (learned, or offered in the skill shop)</span><input id="ppSkill" list="ppSkills" placeholder="Skill name" autocomplete="off"></label>
          <label class="field"><span>Hint level</span><select id="ppSkillLv">${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}">Lv${n}</option>`).join("")}</select></label>
          <button type="button" class="btn ghost small" data-pp-act="shopAdd">Add to shop</button><button type="button" class="btn ghost small" data-pp-act="learnAdd">Already learned</button></div>`;
      if (!a) return out + `<p class="mini">Pick the uma you're training now (above) so skill ratings use her aptitudes.</p>`;
      const { s, levels, values } = solver(p, a);
      const learned = learnedTop(s, r.learned);
      const stats = r.stats.map((x) => +x || 0);
      const now = R.rating({ stats, skills: learned, apt: a, uniqueLevel: uLv, stars: stars(p) });
      const shopIds = Object.keys(r.shop);
      if (r.learned.length) out += `<div class="row-wrap"><b class="mini">Learned:</b> ${r.learned.map((id) => `<span class="chip">${esc(ctx.skillName(id))} <span class="mini">${values[id] != null ? values[id] : R.skillScore(id, a)}</span> <button type="button" class="linkish" data-pp-learn-del="${id}" aria-label="Remove">✕</button></span>`).join("")}</div>`;
      if (shopIds.length) out += `<div class="table-wrap"><table class="plan"><thead><tr><th>In the shop</th><th>Hint</th><th>Rating</th><th title="A spark skill you're building her for: always bought">Spark ★</th><th></th></tr></thead><tbody>${shopIds.map((id) => `<tr><td>${esc(ctx.skillName(id))}</td><td><select data-pp-lv="${id}">${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}"${+r.shop[id] === n ? " selected" : ""}>Lv${n}</option>`).join("")}</select></td><td class="num">${R.skillScore(id, a)}</td><td><button type="button" class="must-tog" data-pp-must="${id}" aria-pressed="${r.must.indexOf(id) !== -1}">${r.must.indexOf(id) !== -1 ? "★" : "☆"}</button></td><td><button type="button" class="linkish" data-pp-shop-del="${id}" aria-label="Remove">✕</button></td></tr>`).join("")}</tbody></table></div>`;
      const sp = +r.sp || 0;
      const buy = shopIds.length || r.learned.length ? s.solve(levels, sp) : null;
      const gain = buy ? Math.round(buy.value) : 0;
      const after = now.total + gain;
      const rk = R.rankOf(after);
      out += `<div class="pp-result"><p>Now: <b>${now.total.toLocaleString()}</b> (${now.rank.label}) = stats ${now.stats.toLocaleString()} + skills ${now.skills.toLocaleString()} + unique ${now.unique}.</p>`;
      if (buy && buy.selected.length) {
        out += `<p>Best buy with ${sp} SP: ${buy.selected.map((o) => `<b>${esc(ctx.skillName(o.id))}</b> (${o.cost} SP, +${Math.round(o.value)}${o.required.length ? ", spark ★" : ""})`).join(", ")}. Spends ${buy.spent}, ${buy.unspent} left.</p>`;
        if (buy.unmetMust.length) out += `<p class="mini warn">Can't afford every spark skill: ${buy.unmetMust.map((id) => esc(ctx.skillName(id))).join(", ")}.</p>`;
      }
      out += `<p>After buying: <b class="pp-big">${after.toLocaleString()} · ${rk.label}</b>${after >= R.SS ? " ✓ SS" : ` · <b>${(R.SS - after).toLocaleString()}</b> short of SS`}.</p>`;
      if (after < R.SS) {
        const add = R.statsFor(stats, R.SS - after, ctx.caps());
        out += `<p class="mini">To close it: about ${add ? add.map((n, i) => (n ? `+${n} ${STAT_LABELS[i]}` : "")).filter(Boolean).join(", ") : "more stats than her caps allow"} (the highest stats score most per point), or about ${Math.ceil((R.SS - after) / SP_RATING).toLocaleString()} more skill points of typical skills, or fewer races. Every learned skill counts, including ones that don't help this race.</p>`;
      }
      return out + "</div>";
    }

    const section = (key, title, note, body) => `<details class="panel pp-sec" data-pp-open="${key}"${open.has(key) ? " open" : ""}><summary><h2>${title}</h2><span class="mini">${note}</span></summary>${body}</details>`;

    function render(el) {
      const p = st();
      // ③ Deck races the G1s ② plans (the default agenda until a win is entered).
      const res = p.self ? plan(p) : null;
      ctx.setItRaces(res && res.candidates.length ? res.agenda.length : null);
      const skillNames = ctx.skillNames();
      el.innerHTML = `<div class="parents">
        <datalist id="ppChars">${Array.from(chars.values()).sort().map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>
        <datalist id="ppSkills">${skillNames.map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>
        <p class="mini pp-intro">Build a parent in order: who she is, which G1s to win, the deck, then the skills to buy at the end so she reaches SS.</p>
        ${section("who", "① Who", p.self ? esc(charName(p.self)) : "pick your uma", whoHTML(p))}
        ${section("races", "② Races", "fewest G1s for affinity", racesHTML(p))}
        ${section("deck", "③ Deck", "ace or debuffer parent", ctx.deckHTML())}
        ${section("rating", "④ After the run", "skills to buy, reach SS", ratingHTML(p))}
      </div>`;
    }

    // Re-render after the event: a change fired by blur can't replace its own element mid-event.
    let pending = false;
    function rerender() {
      ctx.save();
      if (pending) return;
      pending = true;
      setTimeout(() => { pending = false; const el = ctx.container(); if (el && ctx.state().tab === "parents") render(el); }, 0);
    }

    function onToggle(e) {
      const d = e.target.closest && e.target.closest("[data-pp-open]");
      if (!d || d !== e.target) return;
      if (d.open) open.add(d.dataset.ppOpen); else open.delete(d.dataset.ppOpen);
    }

    function click(e) {
      const p = st(), r = p.rating;
      const t = e.target;
      const act = t.closest("[data-pp-act]");
      if (act) {
        const a = act.dataset.ppAct;
        if (a === "aptReset") p.apt = null;
        if (a === "cost") { raceCost = ctx.raceCost() || { error: "Set your deck in Trainee and deck (on the coach) to simulate the cost." }; }
        if (a === "usePredicted") { const pr = ctx.predicted(); if (pr) { r.stats = pr.stats.slice(); r.sp = pr.sp; } }
        if (a === "addMust") ctx.cmMust().forEach((id) => { id = String(id); if (r.learned.indexOf(id) === -1 && r.shop[id] == null) r.shop[id] = 0; if (r.must.indexOf(id) === -1) r.must.push(id); });
        if (a === "addInnate") { const tr = trainee(p.selfTrainee); if (tr) (tr.is || []).concat(tr.as || []).forEach((id) => { id = String(id); if (r.shop[id] == null && r.learned.indexOf(id) === -1) r.shop[id] = 0; }); }
        if (a === "shopAdd" || a === "learnAdd") {
          const id = ctx.skillIdByName(ctx.container().querySelector("#ppSkill").value);
          if (!id) { ctx.flash("Pick a skill from the list first."); return true; }
          if (a === "shopAdd") r.shop[id] = +ctx.container().querySelector("#ppSkillLv").value;
          else { if (r.learned.indexOf(id) === -1) r.learned.push(id); delete r.shop[id]; }
        }
        rerender();
        return true;
      }
      const m = t.closest("[data-pp-must]");
      if (m) { const id = m.dataset.ppMust; const i = r.must.indexOf(id); if (i === -1) r.must.push(id); else r.must.splice(i, 1); rerender(); return true; }
      const sd = t.closest("[data-pp-shop-del]");
      if (sd) { delete r.shop[sd.dataset.ppShopDel]; r.must = r.must.filter((id) => id !== sd.dataset.ppShopDel); rerender(); return true; }
      const ld = t.closest("[data-pp-learn-del]");
      if (ld) { r.learned = r.learned.filter((id) => id !== ld.dataset.ppLearnDel); rerender(); return true; }
      return false;
    }

    // Setting the coach's trainee redraws the page, so not mid-event (see rerender).
    const setTraineeLater = (id) => setTimeout(() => ctx.setTrainee(id || null), 0);

    function change(e) {
      const p = st(), r = p.rating;
      const t = e.target, ds = t.dataset;
      if (!t.isConnected) return false;
      if (ds.ppChar != null) {
        const v = t.value.trim();
        const cid = v ? charByName.get(v.toLowerCase()) : null;
        if (v && !cid) { ctx.flash("Pick a character from the list."); return true; }
        const k = ds.ppChar;
        if (k === "self") {
          p.self = cid || null;
          const vs = cid ? versions(cid) : [];
          const keep = vs.find((x) => x.id === +p.selfTrainee);
          p.selfTrainee = keep ? keep.id : vs.length ? vs[0].id : null;
          p.apt = null;
          setTraineeLater(p.selfTrainee);
        } else if (k === "ace") p.ace = cid || null;
        else { if (p[k].cid !== cid) p[k] = { cid: cid || null, wins: cid ? p[k].wins : [] }; }
        raceCost = null;
      } else if (ds.ppWin != null) {
        const w = p[ds.ppWin].wins;
        const i = w.indexOf(t.value);
        if (t.checked && i === -1) w.push(t.value);
        if (!t.checked && i !== -1) w.splice(i, 1);
        open.add("w-" + ds.ppWin);
      } else if (ds.ppApt != null) {
        const a = apt(p).slice();
        a[+ds.ppApt] = t.value;
        p.apt = a;
      } else if (ds.pp != null) {
        const k = ds.pp;
        p[k] = k === "target" ? +t.value : k === "selfTrainee" ? +t.value : t.value;
        if (k === "selfTrainee") { p.apt = null; setTraineeLater(p.selfTrainee); }
      } else if (ds.ppStat != null) {
        const v = t.value === "" ? null : Math.max(0, Math.min(2500, +t.value || 0));
        r.stats[+ds.ppStat] = v;
      } else if (ds.ppR != null) {
        r[ds.ppR] = t.value === "" ? null : Math.max(0, +t.value || 0);
      } else if (ds.ppLv != null) {
        r.shop[ds.ppLv] = +t.value;
      } else return false;
      rerender();
      return true;
    }

    return { render, click, change, onToggle, SP_RATING, plan: (p) => plan(p || st()) };
  }

  const api = { create, SP_RATING };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaParentPlanner = api;
})(typeof window !== "undefined" ? window : globalThis);
