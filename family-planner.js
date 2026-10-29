// The Parents tab's family section, ace down: pick the ace (her CM race comes from CM & decks),
// see what to look for in her parents and grandparents, enter the ones you find, and compare
// candidates for a slot by the family score (family.js). Keeps state.parents.family.
(function (root) {
  "use strict";
  const SLOT_LABELS = { p1: "Parent 1", p2: "Parent 2", g11: "Parent 1's parent", g12: "Parent 1's parent", g21: "Parent 2's parent", g22: "Parent 2's parent" };
  const ORDER = ["p1", "g11", "g12", "p2", "g21", "g22"];
  const STYLE_LABEL = { Nige: "Front", Senkou: "Pace", Sasi: "Late", Oikomi: "End" };

  function create(ctx) {
    const { D, A, F, esc } = ctx;
    const fam = F.create({ A, skills: ctx.SB.DATA.skills });
    const g1 = A.g1Races().map((r) => r.name).sort();
    const trainee = (id) => D.DATA.trainees.find((t) => t.id === +id) || null;
    const versions = (cid) => D.DATA.trainees.filter((t) => t.cid === +cid);
    // Inherited unique (green spark) of a version: her unique's 9... id.
    const uniqueOf = (t) => (t && t.us && t.us.length ? "9" + String(t.us[0]).slice(1) : null);
    const owners = new Map();
    D.DATA.trainees.forEach((t) => { const u = uniqueOf(t); if (u) { if (!owners.has(u)) owners.set(u, []); owners.get(u).push(t); } });

    // Your veterans (veterans.js), kept in this browser under their own key so the app's state
    // stays small; each import replaces them.
    const V = root.UmaVeterans ? root.UmaVeterans.create(ctx.SB.DATA.skills) : null;
    let vets = null, vetPairs = null;
    const store = () => { try { return root.localStorage || null; } catch (e) { return null; } };
    function veterans() {
      if (vets) return vets;
      try { vets = JSON.parse(store().getItem(VETS_KEY)) || null; } catch (e) { vets = null; }
      return vets || (vets = { at: "", list: [] });
    }
    function setVeterans(v) {
      vets = v; vetPairs = null;
      try { if (v.list.length) store().setItem(VETS_KEY, JSON.stringify(v)); else store().removeItem(VETS_KEY); } catch (e) { /* ignore */ }
    }
    function importVeterans(text) {
      try {
        const r = V.parse(text);
        setVeterans({ at: new Date().toISOString().slice(0, 10), list: r.list });
        ctx.flash(`Imported ${r.list.length} veterans${r.skipped ? ` (${r.skipped} skipped)` : ""}.`);
      } catch (err) { ctx.flash("Couldn't read that: " + err.message); }
      ctx.rerender();
    }
    // A veteran in a parent slot brings her own two parents as the grandparents.
    const GRAND = { p1: ["g11", "g12"], p2: ["g21", "g22"] };
    const asMember = (m) => (m ? { cid: m.cid, tid: m.tid, white: m.white.map((w) => w.slice()), blue: m.blue.slice(), pink: m.pink.slice(), green: m.green, wins: m.wins.slice() } : blank());
    function withVet(f, k, v) {
      const out = Object.assign({}, f);
      out[k] = Object.assign(asMember(v.self), { vet: v.id });
      GRAND[k].forEach((g, i) => { out[g] = asMember(v.parents[i]); });
      return out;
    }
    const vetName = (v) => { const t = trainee(v.tid); return ctx.charName(v.cid) + (t && versions(v.cid).length > 1 ? ` [${t.t}]` : ""); };
    // Her sparks, with her rating to tell two of the same uma apart.
    const vetText = (v) => `rating ${(v.score || 0).toLocaleString("en-US")} · ${sparkText(v.self)}`;

    function st() {
      const p = ctx.parentsState();
      if (!p.family) p.family = {};
      const f = p.family;
      if (!f.ace) f.ace = { cid: null, tid: null };
      if (!f.cands) f.cands = {};
      if (f.rental == null) f.rental = true;
      F.SLOTS.forEach((k) => { if (!f[k]) f[k] = blank(); });
      return f;
    }
    const blank = () => ({ cid: null, tid: null, white: [], blue: [0, 0], pink: [0, 0], green: 0, wins: [] });
    // A member as family.js scores her: her version's unique for the green spark.
    const scored = (m) => (m && m.cid ? Object.assign({}, m, { unique: uniqueOf(trainee(m.tid)) }) : null);
    const familyOf = (f, swap) => {
      const out = {};
      F.SLOTS.forEach((k) => { out[k] = scored(swap && swap.slot === k ? swap.m : f[k]); });
      return out;
    };

    function inputs(f) {
      const race = ctx.aceRace(), rel = ctx.aceSkills(race);
      const t = trainee(f.ace.tid);
      const uniques = rel ? Object.keys(rel.L).filter((id) => /^9\d+$/.test(id) && owners.has(id)).map((id) => ({ id, L: rel.L[id], owners: owners.get(id) })) : [];
      return { race, rel, x: { ace: f.ace.cid ? { cid: f.ace.cid, apt: t ? t.apt : null } : null, race, rel, raceL: rel ? rel.L : {}, offers: ctx.aceOffers(),
        innate: t ? [].concat(t.is || [], t.as || []) : [], build: ctx.build(race.preset), chars: ctx.chars(), uniques, fam: f } };
    }

    // ---------- The section ----------
    function html() {
      const f = st(), { race, rel, x } = inputs(f);
      const vers = f.ace.cid ? versions(f.ace.cid) : [];
      let out = `<p class="mini">Start from the ace you'll race in the CM, then her parents, then theirs. Her race: <b>${esc(race.preset.name)}</b> · ${esc(race.preset.course.track)} ${race.preset.course.distance}m ${esc(race.preset.course.surface)} · ${STYLE_LABEL[race.style]} (set in <button type="button" class="linkish" data-goto-tab="cm">CM &amp; decks</button>).</p>
        <div class="pp-form"><label class="field"><span>The ace</span>${ctx.charInput("fp-ace", f.ace.cid, "Ace")}</label>
        ${vers.length > 1 ? `<label class="field"><span>Version</span><select data-fp-ace-ver>${vers.map((v) => `<option value="${v.id}"${v.id === +f.ace.tid ? " selected" : ""}>${esc(v.t)}</option>`).join("")}</select></label>` : ""}</div>`;
      if (!f.ace.cid) return out + `<p class="mini">Pick the ace to see what to look for.</p>`;
      if (!rel) return out + `<p class="mini">Loading the race's skill values…</p>`;
      const want = fam.lookFor(x);
      out += lookForHTML(f, want);
      out += vetsHTML(f, x);
      out += treeHTML(f, x);
      return out;
    }

    // ---------- Your veterans ----------
    function vetsHTML(f, x) {
      if (!V) return "";
      const v = veterans(), n = v.list.length;
      const key = pairKey(f);
      const pairs = vetPairs && vetPairs.key === key ? vetPairs.rows : null;
      return `<details class="pred-help" data-pp-open="fpVets"${ctx.isOpen("fpVets") ? " open" : ""}><summary><b>Your veterans</b> · ${n ? `${n} imported${v.at ? " " + esc(v.at) : ""}` : "import them from umaextractor"}</summary>
        <p class="mini">Paste the veterans JSON from umaextractor (or pick the file). Each import replaces the list; it stays in this browser. Her sparks, G1 wins and her two parents (your grandparents when she's a parent) come with her, and each parent card below ranks them.</p>
        <textarea class="fp-vets" data-fp-vets-text rows="3" placeholder="Paste the umaextractor veterans JSON here"></textarea>
        <div class="row-wrap"><button type="button" class="btn small" data-fp-vets-import>Import</button><label class="btn ghost small">Pick the file<input type="file" accept=".json,application/json" data-fp-vets-file hidden></label>${n ? `<button type="button" class="btn ghost small" data-fp-vets-clear>Remove them</button>` : ""}</div>
        ${n ? `<label class="mini"><input type="checkbox" data-fp-rental${f.rental ? " checked" : ""}> Parent 2 is a friend's rental (Parent 1 comes from your veterans)</label>` : ""}
        ${n && f.rental ? `<h4>Best Parent 1 from your veterans</h4><p class="mini">Each with her own parents, ranked by the family score${f.p2.cid ? ` with ${esc(ctx.charName(f.p2.cid))} as the rental` : "; until you pick the rental, each is paired with the rental character that suits her and the ace best (sparks unknown)"}.</p>${vetRowsHTML(f, "p1", x, 8)}` : ""}
        ${n > 1 && !f.rental ? `<h4>Best pair of your veterans</h4><p class="mini">Both parents from your own list, each with her own parents, ranked by the family score.</p>
          ${pairs ? pairsHTML(pairs) : `<button type="button" class="btn ghost small" data-fp-vets-pairs>Rank every pair</button>`}` : ""}
      </details>`;
    }
    // Rental characters for Parent 2: affinity with the ace and with Parent 1 (G1 wins they share
    // come on top, once you know the rental's).
    function rentals(f, p1) {
      const ace = f.ace.cid;
      return ctx.chars().filter((c) => +c !== +ace && +c !== +p1).map((c) => ({ cid: c, pts: A.together(ace, c) + A.together(p1, c) })).sort((a, b) => b.pts - a.pts);
    }
    // The family with veteran v in slot k; with no rental picked yet, the best rental character.
    function vetFamily(f, k, v) {
      const out = withVet(f, k, v);
      let rent = null;
      if (f.rental && k === "p1" && !f.p2.cid) {
        rent = rentals(f, v.cid)[0] || null;
        if (rent) out.p2 = Object.assign(blank(), { cid: rent.cid, tid: (versions(rent.cid)[0] || {}).id || null });
      }
      return { fm: out, rent };
    }
    function rentalHTML(f) {
      const top = rentals(f, f.p1.cid).slice(0, 8);
      if (!top.length) return "";
      const id = "fpRent";
      return `<details data-pp-open="${id}"${ctx.isOpen(id) ? " open" : ""}><summary class="mini">Rentals to look for: ${top.slice(0, 3).map((r) => esc(ctx.charName(r.cid))).join(", ")}</summary>
        <p class="mini">Affinity with the ace${f.p1.cid ? ` and ${esc(ctx.charName(f.p1.cid))}` : ""} (shared G1 wins add 3 each). Pick one, then enter the rental's sparks and parents from the friend list to compare.</p>
        <div class="row-wrap">${top.map((r) => `<button type="button" class="chip" data-fp-rent="${r.cid}">${esc(ctx.charName(r.cid))} · ${r.pts}</button>`).join(" ")}</div></details>`;
    }
    const pairKey = (f) => { const r = ctx.aceRace(); return [f.ace.tid, r.preset.id, r.style, veterans().list.length, veterans().at].join("|"); };
    function rankPairs(f, x) {
      const list = veterans().list.filter((v) => +v.cid !== +f.ace.cid), rows = [];
      list.forEach((a, i) => list.slice(i + 1).forEach((b) => {
        if (+a.cid === +b.cid) return;
        const fm = withVet(withVet(f, "p1", a), "p2", b), s = fam.score(familyOf(fm), x);
        if (!s.problems.length) rows.push({ a: a.id, b: b.id, value: s.value, total: s.total, symbol: s.symbol });
      }));
      return rows.sort((p, q) => q.value - p.value || q.total - p.total).slice(0, 8);
    }
    function pairsHTML(rows) {
      const by = new Map(veterans().list.map((v) => [v.id, v]));
      return `<div class="table-wrap"><table class="plan"><thead><tr><th>Parent 1</th><th>Parent 2</th><th>Family</th><th>Affinity</th><th></th></tr></thead><tbody>${rows.map((r) => {
        const a = by.get(r.a), b = by.get(r.b);
        return a && b ? `<tr><td>${esc(vetName(a))}<div class="mini">${vetText(a)}</div></td><td>${esc(vetName(b))}<div class="mini">${vetText(b)}</div></td><td class="num">${r.value.toFixed(2)}</td><td class="num">${r.total} ${r.symbol}</td><td><button type="button" class="linkish" data-fp-vets-pair="${r.a},${r.b}">Use both</button></td></tr>` : "";
      }).join("")}</tbody></table></div>`;
    }
    // Your veterans for one parent slot, with the rest of the family as it is.
    function rankVets(f, k, x) {
      const other = k === "p1" ? f.p2 : f.p1;
      return veterans().list.filter((v) => +v.cid !== +f.ace.cid && +v.cid !== +other.cid)
        .map((v) => { const r = vetFamily(f, k, v); return { v, rent: r.rent, s: fam.score(familyOf(r.fm), x) }; }).filter((r) => !r.s.problems.length)
        .sort((a, b) => b.s.value - a.s.value || b.s.total - a.s.total);
    }
    function vetRowsHTML(f, k, x, count, rows) {
      rows = (rows || rankVets(f, k, x)).slice(0, count);
      if (!rows.length) return `<p class="mini">None of your veterans fits here.</p>`;
      return `<div class="table-wrap"><table class="plan"><thead><tr><th>Veteran (and her parents)</th><th>Family</th><th>Affinity</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(vetName(r.v))}<div class="mini">${vetText(r.v)}${r.v.parents.some(Boolean) ? ` · parents ${r.v.parents.filter(Boolean).map((p) => esc(ctx.charName(p.cid))).join(" + ")}` : ""}${r.rent ? ` · rent ${esc(ctx.charName(r.rent.cid))}` : ""}</div></td><td class="num">${r.s.value.toFixed(2)}</td><td class="num">${r.s.total} ${r.s.symbol}</td><td><button type="button" class="linkish" data-fp-vet="${k},${r.v.id}">Use</button></td></tr>`).join("")}</tbody></table></div>`;
    }
    function vetSlotHTML(f, k, x) {
      if (!V || !GRAND[k] || !veterans().list.length) return "";
      if (f.rental && k === "p2") return rentalHTML(f);
      const rows = rankVets(f, k, x);
      if (!rows.length) return "";
      const id = "fpVet-" + k;
      return `<details data-pp-open="${id}"${ctx.isOpen(id) ? " open" : ""}><summary class="mini">Your best veterans here: ${esc(vetName(rows[0].v))} · ${rows[0].s.value.toFixed(2)}</summary>
        ${vetRowsHTML(f, k, x, 6, rows)}</details>`;
    }

    function lookForHTML(f, w) {
      const name = ctx.charName;
      const top = w.white.slice(0, 10), rest = w.white.slice(10);
      const whiteRow = (s) => `<li><b>${esc(ctx.skillName(s.id))}</b> <span class="mini">${s.L.toFixed(2)} L · ${WHY[s.why] || s.why}${s.deck != null ? ` · her deck offers it ${Math.round(s.deck * 100)}%` : ""}${s.own ? " · she has it (innate/awakening)" : ""}</span></li>`;
      const greens = w.green.slice(0, 6);
      const text = [
        w.pairs[0] ? `Parents: ${w.pairs.slice(0, 3).map((p) => name(p.p1) + " + " + name(p.p2)).join(" / ")}` : "",
        `White sparks: ${top.map((s) => ctx.skillName(s.id)).join(", ")}`,
        `Blue sparks: ${w.blue.map((b) => b.label).join(" or ")}, 6★+ across the family`,
        w.pink.length ? `Pink sparks: ${w.pink.map((p) => p.label).join(", ")}` : "",
        greens.length ? `Green sparks: ${greens.map((g) => ctx.skillName(g.id)).join(", ")}` : "",
      ].filter(Boolean).join("\n");
      return `<details class="pred-help" data-pp-open="fpLook"${ctx.isOpen("fpLook") ? " open" : ""}><summary><b>What to look for</b> (search uma.moe or your own veterans with these)</summary>
        <h4>Parents</h4><p class="mini">Best pairs for her by affinity (the ace with each parent, and the two together; grandparents and shared G1 wins add more):</p>
        <div class="row-wrap">${w.pairs.slice(0, 6).map((p) => `<button type="button" class="chip" data-fp-pair="${p.p1},${p.p2}" title="Put them in Parent 1 and Parent 2">${esc(name(p.p1))} + ${esc(name(p.p2))} · ${p.pts}</button>`).join(" ")}</div>
        ${["p1", "p2"].map((k) => w.grand[k] ? `<p class="mini"><b>${esc(name(f[k].cid))}'s parents</b> (what each adds with the ace and her): ${w.grand[k].slice(0, 6).map((g) => `<button type="button" class="linkish" data-fp-grand="${k},${g.cid}">${esc(name(g.cid))}</button> ${g.pts}`).join(" · ")}</p>` : "").join("")}
        <h4>White sparks</h4><p class="mini">Relevant skills for her race, first the ones worth the most that her own deck rarely gives (each fires 3/6/9% per inspiration by stars, × her affinity bonus):</p><ol class="mini">${top.map(whiteRow).join("")}</ol>
        ${rest.length ? `<details><summary class="mini">${rest.length} more</summary><ol class="mini" start="11">${rest.map(whiteRow).join("")}</ol></details>` : ""}
        <h4>Blue sparks</h4><p class="mini"><b>${w.blue.map((b) => b.label).join("</b> or <b>")}</b> (her build's top stats): aim for 6★+ in total across parents and grandparents, ideally 3★ on each parent. Each blue spark adds +5/+12/+21 at the start and fires 70/80/90% per inspiration.</p>
        <h4>Pink sparks</h4><p class="mini">${w.pink.length ? `She needs <b>${w.pink.map((p) => `${p.label} (${p.grade} now)`).join(", ")}</b>: pink sparks for it fire 2/3/5% per inspiration, and the family's pink stars also raise her starting aptitude.` : "None needed: her aptitudes for this race are A or better."}</p>
        <h4>Green sparks</h4><p class="mini">${greens.length ? `Inherited uniques strong on this race (5/10/15% per inspiration): ${greens.map((g) => `<b>${esc(ctx.skillName(g.id))}</b> ${g.L.toFixed(2)} L (${esc([...new Set(g.owners.map((t) => t.n + " [" + t.t + "]"))].slice(0, 2).join(", "))})`).join("; ")}.` : "No inherited unique is worth more than 0.1 L here."}</p>
        <p class="mini">G1 wins: every G1 both parents won adds 3 affinity, and so does each one a parent shares with her own parent.</p>
        <details><summary class="mini">As text, to copy</summary><pre class="mini fp-text">${esc(text)}</pre></details>
      </details>`;
    }

    // The family tree: six cards, ace down, and the family's score.
    function treeHTML(f, x) {
      const s = fam.score(familyOf(f), x);
      let out = `<h4>Her family</h4><div class="fp-tree">${ORDER.map((k) => cardHTML(f, k, s, x)).join("")}</div>`;
      out += scoreHTML(s);
      return out;
    }
    function cardHTML(f, k, s, x) {
      const m = f[k], vers = m.cid ? versions(m.cid) : [], parent = F.PARENT_OF[k];
      const label = parent ? `${SLOT_LABELS[k]}${f[parent].cid ? ` (${esc(ctx.charName(f[parent].cid))}'s)` : ""}` : SLOT_LABELS[k];
      const stars = (key, v) => `<select data-fp-${key}="${k}">${[0, 1, 2, 3].map((n) => `<option value="${n}"${+v === n ? " selected" : ""}>${n ? n + "★" : "–"}</option>`).join("")}</select>`;
      const cands = f.cands[k] || [];
      return `<div class="fp-card${parent ? " fp-grand" : ""}"><div class="fp-head"><b>${label}</b>${m.cid && s.own[k] != null ? ` <span class="mini">affinity ${s.own[k]} · sparks ×${A.sparkMult(s.own[k]).toFixed(2)}</span>` : ""}</div>
        <div class="pp-form"><label class="field"><span>Character</span>${ctx.charInput("fp-" + k, m.cid)}</label>
        ${vers.length > 1 ? `<label class="field"><span>Version</span><select data-fp-ver="${k}">${vers.map((v) => `<option value="${v.id}"${v.id === +m.tid ? " selected" : ""}>${esc(v.t)}</option>`).join("")}</select></label>` : ""}</div>
        ${m.cid ? `<div class="pp-form fp-sparks">
          <label class="field"><span>Blue</span><span class="fp-pair"><select data-fp-blue-stat="${k}">${F.STAT_LABELS.map((l, i) => `<option value="${i}"${+m.blue[0] === i ? " selected" : ""}>${l}</option>`).join("")}</select>${stars("blue", m.blue[1])}</span></label>
          <label class="field"><span>Pink</span><span class="fp-pair"><select data-fp-pink-apt="${k}">${F.APT_LABELS.map((l, i) => `<option value="${i}"${+m.pink[0] === i ? " selected" : ""}>${l}</option>`).join("")}</select>${stars("pink", m.pink[1])}</span></label>
          <label class="field"><span>Green (her unique)</span>${stars("green", m.green)}</label></div>
          <div class="row-wrap"><span class="mini">White:</span> ${m.white.map(([id, n], i) => `<span class="chip">${esc(ctx.skillName(id))} ${n}★ <button type="button" class="linkish" data-fp-white-del="${k},${i}" aria-label="Remove">✕</button></span>`).join(" ")}
          <input class="fp-skill" data-fp-white-name="${k}" list="ppSkills" placeholder="White spark" autocomplete="off"><select data-fp-white-stars="${k}">${[1, 2, 3].map((n) => `<option value="${n}">${n}★</option>`).join("")}</select><button type="button" class="btn ghost small" data-fp-white-add="${k}">Add</button></div>
          <details class="pp-wins" data-pp-open="fpWins-${k}"${ctx.isOpen("fpWins-" + k) ? " open" : ""}><summary class="mini">G1 wins · ${m.wins.length ? m.wins.length + " ticked" : "none"}</summary><div class="pp-g1grid">${g1.map((r) => `<label class="pp-g1"><input type="checkbox" data-fp-win="${k}" value="${esc(r)}"${m.wins.indexOf(r) !== -1 ? " checked" : ""}> ${esc(r)}</label>`).join("")}</div></details>
          <div class="row-wrap"><button type="button" class="btn ghost small" data-fp-keep="${k}">Save as a candidate for this slot</button>${m.cid ? `<button type="button" class="btn ghost small" data-fp-clear="${k}">Clear</button>` : ""}</div>` : ""}
        ${m.vet != null ? `<p class="mini">From your veterans${GRAND[k] ? " (her parents filled in below)" : ""}.</p>` : ""}
        ${vetSlotHTML(f, k, x)}
        ${cands.length ? candsHTML(f, k) : ""}</div>`;
    }

    // Candidates for a slot, ranked by the family score with each one in it.
    function candsHTML(f, k) {
      const { x } = inputs(f);
      const rows = f.cands[k].map((m, i) => ({ i, m, s: fam.score(familyOf(f, { slot: k, m }), x) })).sort((a, b) => b.s.value - a.s.value);
      return `<div class="table-wrap"><table class="plan"><thead><tr><th>Candidate</th><th>Family</th><th>Affinity</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(ctx.charName(r.m.cid))}<div class="mini">${sparkText(r.m)}</div></td><td class="num">${r.s.value.toFixed(2)}</td><td class="num">${r.s.total} ${r.s.symbol}</td><td><button type="button" class="linkish" data-fp-use="${k},${r.i}">Use</button> <button type="button" class="linkish" data-fp-cand-del="${k},${r.i}" aria-label="Remove">✕</button></td></tr>`).join("")}</tbody></table></div>`;
    }
    const sparkText = (m) => [m.blue[1] ? `${F.STAT_LABELS[m.blue[0]]} ${m.blue[1]}★` : "", m.pink[1] ? `${F.APT_LABELS[m.pink[0]]} ${m.pink[1]}★` : "", m.green ? `green ${m.green}★` : "", m.white.length ? `${m.white.length} white` : "", m.wins && m.wins.length ? `${m.wins.length} G1` : ""].filter(Boolean).join(" · ");

    function scoreHTML(s) {
      if (s.problems.length) return `<p class="mini warn">${s.problems.map(esc).join(" ")}</p>`;
      const pct = (p) => Math.round(p * 100) + "%";
      return `<div class="pp-result"><p>Affinity <b>${s.total} ${s.symbol}</b> · family score <b class="pp-big">${s.value.toFixed(2)}</b> <span class="mini">(in lengths: relevant hints and green sparks by their L and chance, key-stat start bonus at 60 per L, a needed aptitude at 1 L)</span></p>
        <p class="mini">Relevant white sparks: about <b>${s.hints.toFixed(1)}</b> hints expected over her two inspirations (${s.whiteL.toFixed(2)} L)${s.white.length ? ": " + s.white.sort((a, b) => b.p * b.L - a.p * a.L).slice(0, 8).map((w) => `${esc(ctx.skillName(w.id))} ${pct(w.p)}`).join(", ") : ""}. Each gives +1 to +5 hint levels (odds unknown).</p>
        ${s.green.length ? `<p class="mini">Green: ${s.green.map((g) => `${esc(ctx.skillName(g.id))} ${pct(g.p)} (${g.L.toFixed(2)} L)`).join(", ")}.</p>` : ""}
        <p class="mini">Blue at the start: ${s.start.map((v, i) => (v ? `+${v} ${F.STAT_LABELS[i]}` : "")).filter(Boolean).join(", ") || "none"} (more from inspirations).${s.pink.length ? ` Pink: ${s.pink.map((p) => `${p.label} ${pct(p.p)} to fire at least once`).join(", ")}.` : ""}</p>
        <p class="mini">Chances: uma.guide's community rates (white 3/6/9%, green 5/10/15%, pink 2/3/5%, blue 70/80/90%) × (1 + each uma's own affinity ÷ 100), at both inspirations.</p></div>`;
    }

    // ---------- Events ----------
    function click(e) {
      const f = st(), t = e.target;
      const hit = (attr) => t.closest("[" + attr + "]");
      let el;
      if ((el = hit("data-fp-pair"))) { const [a, b] = el.dataset.fpPair.split(",").map(Number); setChar(f, "p1", a); setChar(f, "p2", b); }
      else if ((el = hit("data-fp-grand"))) { const [k, cid] = el.dataset.fpGrand.split(","); const slot = k === "p1" ? (f.g11.cid ? "g12" : "g11") : (f.g21.cid ? "g22" : "g21"); setChar(f, slot, +cid); }
      else if ((el = hit("data-fp-white-add"))) {
        const k = el.dataset.fpWhiteAdd, card = el.closest(".fp-card");
        const id = ctx.skillIdByName(card.querySelector("[data-fp-white-name]").value);
        if (!id) { ctx.flash("Pick a skill from the list first."); return true; }
        f[k].white.push([fam.baseWhite(id), +card.querySelector("[data-fp-white-stars]").value]);
      } else if ((el = hit("data-fp-white-del"))) { const [k, i] = el.dataset.fpWhiteDel.split(","); f[k].white.splice(+i, 1); }
      else if ((el = hit("data-fp-keep"))) { const k = el.dataset.fpKeep; (f.cands[k] = f.cands[k] || []).push(JSON.parse(JSON.stringify(f[k]))); ctx.flash("Saved as a candidate: enter the next one and compare."); }
      else if ((el = hit("data-fp-clear"))) f[el.dataset.fpClear] = blank();
      else if ((el = hit("data-fp-use"))) { const [k, i] = el.dataset.fpUse.split(","); f[k] = JSON.parse(JSON.stringify(f.cands[k][+i])); }
      else if ((el = hit("data-fp-cand-del"))) { const [k, i] = el.dataset.fpCandDel.split(","); f.cands[k].splice(+i, 1); }
      else if ((el = hit("data-fp-vets-import"))) { const ta = el.closest("details").querySelector("[data-fp-vets-text]"); if (!ta.value.trim()) { ctx.flash("Paste the JSON first."); return true; } importVeterans(ta.value); return true; }
      else if ((el = hit("data-fp-vets-clear"))) setVeterans({ at: "", list: [] });
      else if ((el = hit("data-fp-vets-pairs"))) { vetPairs = { key: pairKey(f), rows: rankPairs(f, inputs(f).x) }; }
      else if ((el = hit("data-fp-vets-pair"))) { const [a, b] = el.dataset.fpVetsPair.split(",").map(Number), by = byId(); if (by.get(a) && by.get(b)) Object.assign(f, withVet(withVet(f, "p1", by.get(a)), "p2", by.get(b))); }
      else if ((el = hit("data-fp-vet"))) {
        const [k, id] = el.dataset.fpVet.split(","), v = byId().get(+id);
        if (v) { const r = vetFamily(f, k, v); Object.assign(f, withVet(f, k, v)); if (r.rent) setChar(f, "p2", r.rent.cid); }
      } else if ((el = hit("data-fp-rent"))) setChar(f, "p2", +el.dataset.fpRent);
      else return false;
      ctx.rerender();
      return true;
    }
    const byId = () => new Map(veterans().list.map((v) => [v.id, v]));
    function setChar(f, k, cid) {
      const vs = cid ? versions(cid) : [];
      f[k] = Object.assign(blank(), { cid: cid || null, tid: vs.length ? vs[0].id : null });
    }
    function change(e) {
      const f = st(), t = e.target, ds = t.dataset;
      if (ds.fpVetsText != null) return true;
      if (ds.fpRental != null) { f.rental = t.checked; ctx.rerender(); return true; }
      if (ds.fpVetsFile != null) {
        const file = t.files && t.files[0];
        if (file) { const r = new root.FileReader(); r.onload = () => importVeterans(String(r.result)); r.readAsText(file); }
        return true;
      }
      if (ds.ppChar && ds.ppChar.indexOf("fp-") === 0) {
        const key = ds.ppChar.slice(3), v = t.value.trim(), cid = v ? ctx.charId(v) : null;
        if (v && !cid) { ctx.flash("Pick a character from the list."); return true; }
        if (key === "ace") { const vs = cid ? versions(cid) : []; f.ace = { cid: cid || null, tid: vs.length ? vs[0].id : null }; }
        else setChar(f, key, cid);
      } else if (ds.fpAceVer != null) f.ace.tid = +t.value;
      else if (ds.fpVer) f[ds.fpVer].tid = +t.value;
      else if (ds.fpBlueStat) f[ds.fpBlueStat].blue[0] = +t.value;
      else if (ds.fpBlue) f[ds.fpBlue].blue[1] = +t.value;
      else if (ds.fpPinkApt) f[ds.fpPinkApt].pink[0] = +t.value;
      else if (ds.fpPink) f[ds.fpPink].pink[1] = +t.value;
      else if (ds.fpGreen) f[ds.fpGreen].green = +t.value;
      else if (ds.fpWin) { const w = f[ds.fpWin].wins, i = w.indexOf(t.value); if (t.checked && i === -1) w.push(t.value); if (!t.checked && i !== -1) w.splice(i, 1); }
      else return !!(ds.fpWhiteName != null || ds.fpWhiteStars != null);
      ctx.rerender();
      return true;
    }

    const note = () => { const f = st(); return f.ace.cid ? esc(ctx.charName(f.ace.cid)) + "'s family" : "pick the ace"; };
    return { html, click, change, note };
  }

  const VETS_KEY = "uma-veterans-v1";
  const WHY = { L: "race skill", green: "green", recovery: "recovery", debuff: "debuff" };
  const api = { create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaFamilyPlanner = api;
})(typeof window !== "undefined" ? window : globalThis);
