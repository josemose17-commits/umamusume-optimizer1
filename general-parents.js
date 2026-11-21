// General grandparents (and parents) by running style, for any cup: uma.guide's general parent
// skills per style (data/general-parents.js) as white targets, then per character what she
// already brings, her pink and blue, a race plan that wins as many different G1s as fit her, and
// which of your veterans already fit each style. The Parents tab shows it as one panel (panel()).
(function (root) {
  "use strict";
  const DATA = root.UmaGeneralParentsData || (typeof require !== "undefined" ? require("./data/general-parents.js") : null);
  const STYLES = ["Nige", "Senkou", "Sasi", "Oikomi"];
  const STYLE_LABEL = { Nige: "Front Runner", Senkou: "Pace Chaser", Sasi: "Late Surger", Oikomi: "End Closer" };
  const STYLE_APT = { Nige: 6, Senkou: 7, Sasi: 8, Oikomi: 9 }; // in a trainee's aptitude list
  const APT_LABELS = ["Turf", "Dirt", "Sprint", "Mile", "Medium", "Long", "Front", "Pace", "Late", "End"];
  const GRADE = { S: 7, A: 6, B: 5, C: 4, D: 3, E: 2, F: 1, G: 0 };
  // Deck-target weights by tier: the short list first, then the long-term list, then straights
  // and corners (they stand in for a race value: none of this is tied to one cup).
  const WEIGHT = { short: 1, long: 0.6, corner: 0.3 };
  const TIER_LABEL = { short: "first 4", long: "long-term", corner: "straight/corner" };
  // Blue: uma.guide says to pursue the stats a career doesn't prioritise; speed and wit come from
  // training anyway, so stamina first, then power.
  const BLUE = [{ i: 1, label: "Stamina", w: 0.5 }, { i: 2, label: "Power", w: 0.3 }];

  // The style's targets in order, each once: [{ id, tier }].
  function list(style) {
    const s = DATA.styles[style];
    if (!s) return [];
    const out = [], seen = new Set();
    const add = (ids, tier) => ids.forEach((id) => { id = String(id); if (!seen.has(id)) { seen.add(id); out.push({ id, tier }); } });
    add(s.short, "short"); add(s.long, "long"); add(s.corner.concat(DATA.corner), "corner");
    return out;
  }
  // { targets: { id: weight }, why: { id: "general-short" | ... } } for the parent deck optimizer.
  // o.out(id): false drops a skill not on Global yet.
  function targets(style, o = {}) {
    const t = {}, why = {};
    list(style).forEach((x) => { if (o.out && !o.out(x.id)) return; t[x.id] = WEIGHT[x.tier]; why[x.id] = "general-" + x.tier; });
    return { targets: t, why };
  }
  const shortList = (style) => (DATA.styles[style] ? DATA.styles[style].short.map(String) : []);
  const altList = (style) => (DATA.styles[style] && DATA.styles[style].alt ? DATA.styles[style].alt.map(String) : null);

  // Her grade in the style (her best version's if versions are given).
  const gradeOf = (t, style) => (t && t.apt ? t.apt[STYLE_APT[style]] : null);
  // Pink sparks she can carry: uma.guide picks a parent's pink from her A/S aptitudes. Her style
  // first, then distance and surface (the ones aces need most often).
  function pinks(apt, style) {
    if (!apt) return [];
    const order = [STYLE_APT[style], 4, 3, 5, 2, 0, 1];
    return order.filter((i) => GRADE[apt[i]] >= GRADE.A).map((i) => ({ i, label: APT_LABELS[i], grade: apt[i] }));
  }
  // The list skills she starts with (innate) or unlocks by awakening, matched by skill family.
  // family(id) → the skill's family (data/skill-purchases.js), so ◎ and ○ count as one.
  function own(t, style, family = (id) => id) {
    if (!t) return [];
    const by = new Map(list(style).map((x) => [family(x.id), x]));
    const out = [], seen = new Set();
    [["innate", t.is || []], ["awakening", t.as || []]].forEach(([how, ids]) => ids.forEach((id) => {
      const x = by.get(family(String(id)));
      if (x && !seen.has(x.id)) { seen.add(x.id); out.push({ id: x.id, tier: x.tier, how }); }
    }));
    return out;
  }

  // How often each G1 is a career goal across the characters (a "pick one" goal counts its share):
  // a grandparent shares a G1 win with her child (+3 affinity) when the child won it too, and a
  // child wins her career-goal G1s anyway. → Map(name → share of characters, 0..1).
  function goalShares(A, cids) {
    const n = new Map(), g1 = new Set(A.g1Races().map((r) => r.name));
    cids.forEach((cid) => {
      const g = A.careerGoals(cid);
      g.fixed.forEach((x) => { if (g1.has(x.name)) n.set(x.name, (n.get(x.name) || 0) + 1); });
      g.choices.forEach((opts) => opts.forEach((x) => { if (g1.has(x.name)) n.set(x.name, (n.get(x.name) || 0) + 1 / opts.length); }));
    });
    const out = new Map();
    n.forEach((v, k) => out.set(k, cids.length ? v / cids.length : 0));
    return out;
  }
  // Her race plan: as many different G1s as fit her (B+ in surface and distance, a turn each),
  // the ones most characters have as a goal first. Her own G1 goals are won anyway.
  // → { goals: [names], extra: [{ name, turn, share }], shared } (shared: expected G1 wins in
  // common with a typical child, the sum of the shares).
  function racePlan(A, cid, apt, shares) {
    const names = A.g1Races().map((r) => r.name).sort((a, b) => (shares.get(b) || 0) - (shares.get(a) || 0) || a.localeCompare(b));
    const out = A.planRaces({ self: cid, apt, minGrade: "B", links: [], extra: names, need: 0 });
    const goals = A.goalG1s(cid).map((g) => g.name);
    const extra = out.agenda.filter((r) => !r.free).map((r) => ({ name: r.name, turn: r.turn, share: shares.get(r.name) || 0 }));
    const shared = goals.concat(extra.map((r) => r.name)).reduce((n, name) => n + (shares.get(name) || 0), 0);
    return { goals, extra, shared, skipped: out.skipped };
  }

  // A veteran's fit as a general grandparent of this style: her list whites (by tier weight ×
  // stars / 3), her parents' at half (they pass down one generation less), a stamina/power blue
  // and a pink in the style. → { score, self: [{ id, stars, tier }], line: [...] }.
  function vetFit(v, style, family = (id) => id) {
    const by = new Map(list(style).map((x) => [family(x.id), x]));
    const whites = (m) => ((m && m.white) || []).map(([id, stars]) => { const x = by.get(family(String(id))); return x ? { id: x.id, stars, tier: x.tier } : null; }).filter(Boolean);
    const self = whites(v.self), mine = new Set(self.map((w) => w.id)), line = [];
    (v.parents || []).forEach((p) => whites(p).forEach((w) => { if (!mine.has(w.id) && !line.some((x) => x.id === w.id)) line.push(w); }));
    const s = v.self || {}, blue = s.blue || [0, 0], pink = s.pink || [0, 0];
    const b = BLUE.find((x) => x.i === blue[0]);
    const score = self.reduce((n, w) => n + WEIGHT[w.tier] * w.stars / 3, 0) + line.reduce((n, w) => n + WEIGHT[w.tier] * w.stars / 6, 0)
      + (b ? b.w * blue[1] / 3 : 0) + (pink[0] === STYLE_APT[style] ? 0.3 * pink[1] / 3 : 0);
    return { score, self, line };
  }

  // Characters as general grandparents of this style. Her own affinity in a family is her trio
  // with the trainee and her child (averaged over every pair of other characters) plus 3 per G1
  // she shares with her child (racePlan's shared); each point is +1% on her sparks. A list skill
  // she starts with or unlocks counts 2 points (a free white spark chance). Needs A+ in the style.
  // o: { A, cids, version(cid) → trainee, family, shares } → [{ cid, t, grade, trio, shared, own, score }].
  let trioCache = null;
  function trios(A, cids) {
    const key = cids.join(",");
    if (trioCache && trioCache.key === key) return trioCache.map;
    const map = new Map();
    cids.forEach((g) => {
      let n = 0, k = 0;
      for (let i = 0; i < cids.length; i++) for (let j = i + 1; j < cids.length; j++) {
        const a = cids[i], b = cids[j];
        if (a === g || b === g) continue;
        n += A.together(a, b, g); k++;
      }
      map.set(g, k ? n / k : 0);
    });
    trioCache = { key, map };
    return map;
  }
  function rank(style, o) {
    const tri = trios(o.A, o.cids);
    return o.cids.map((cid) => {
      const t = o.version(cid, style), grade = gradeOf(t, style);
      if (!t || !(GRADE[grade] >= GRADE.A)) return null;
      const plan = racePlan(o.A, cid, t.apt, o.shares), mine = own(t, style, o.family);
      const trio = tri.get(cid) || 0, shared = 3 * plan.shared;
      return { cid, t, grade, trio, shared, own: mine, races: plan.extra.length, score: trio + shared + 2 * mine.length };
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.cid - b.cid);
  }

  // ---------- The panel (the Parents tab) ----------
  // ctx: { esc, state() → state.parents.general, skillName, outNow(id), cost(id), A, family,
  //   cids() (Global characters), charName, versions(cid), mine() → Set(cid), veterans() → list,
  //   vetName(v), send({ tid, style, must, races }), sent() → { style, tid } | null,
  //   trainingHTML(), save(), rerender(), flash }.
  function panel(ctx) {
    const esc = ctx.esc;
    let shares = null;
    const sharesOf = () => shares || (shares = goalShares(ctx.A, ctx.cids()));
    function st() {
      const g = ctx.state();
      if (!STYLES.includes(g.style)) g.style = "Senkou";
      if (g.cid == null) g.cid = null;
      return g;
    }
    // Her version for the style: yours first (My umas), then the best grade in it.
    function version(cid, style) {
      const vs = ctx.versions(cid);
      if (!vs.length) return null;
      const mine = ctx.mineTids ? ctx.mineTids() : new Set();
      return vs.slice().sort((a, b) => (GRADE[b.apt[STYLE_APT[style]]] || 0) - (GRADE[a.apt[STYLE_APT[style]]] || 0) || Number(mine.has(b.id)) - Number(mine.has(a.id)))[0];
    }
    const chip = (id, extra) => `<span class="chip${ctx.outNow(id) ? "" : " warnchip"}" title="${ctx.outNow(id) ? "" : "Not on Global yet"}">${esc(ctx.skillName(id))}${extra || ""}</span>`;

    function listHTML(style, t) {
      const L = list(style), alt = altList(style), mine = t ? own(t, style, ctx.family) : [], has = new Map(mine.map((x) => [x.id, x.how]));
      const row = (tier) => L.filter((x) => x.tier === tier).map((x) => chip(x.id, has.has(x.id) ? ` <i class="mini">${has.get(x.id) === "innate" ? "she has it" : "her awakening"}</i>` : "")).join(" ");
      const later = L.filter((x) => !ctx.outNow(x.id));
      return `<p class="mini"><b>First 4</b> (easy to get, for your first loop):</p><div class="row-wrap">${row("short")}</div>
        ${alt ? `<p class="mini">or: ${alt.map((id) => esc(ctx.skillName(id))).join(", ")}</p>` : ""}
        <p class="mini"><b>Long-term</b> (on top of the first 4, as your loop grows):</p><div class="row-wrap">${row("long")}</div>
        <p class="mini"><b>Straights and corners</b> (any course, and her style's own):</p><div class="row-wrap">${row("corner")}</div>
        ${later.length ? `<p class="mini warn">Not on Global yet: ${later.map((x) => esc(ctx.skillName(x.id))).join(", ")}. It stays on the list for when it comes out, and the deck skips it until then.</p>` : ""}`;
    }

    function umaHTML(g) {
      const all = ctx.cids(), mine = ctx.mine();
      const name = (c) => ctx.charName(c);
      const opts = (cs) => cs.slice().sort((a, b) => name(a).localeCompare(name(b))).map((c) => `<option value="${c}"${+g.cid === +c ? " selected" : ""}>${esc(name(c))}</option>`).join("");
      const yours = all.filter((c) => mine.has(+c)), rest = all.filter((c) => !mine.has(+c));
      let out = `<label class="field"><span>The uma you'll make a general ${esc(STYLE_LABEL[g.style])} grandparent</span><select data-gp-uma><option value="">Pick one</option>${yours.length ? `<optgroup label="My umas">${opts(yours)}</optgroup><optgroup label="Others">${opts(rest)}</optgroup>` : opts(all)}</select></label>`;
      if (!g.cid) return out;
      const t = version(g.cid, g.style), grade = gradeOf(t, g.style);
      if (!t) return out;
      const plan = racePlan(ctx.A, +g.cid, t.apt, sharesOf()), pk = pinks(t.apt, g.style), have = own(t, g.style, ctx.family);
      const sent = ctx.sent(), here = sent && sent.style === g.style && +sent.tid === +t.id;
      const low = !(GRADE[grade] >= GRADE.A);
      out += `<ul class="mini">
        <li>${esc(name(g.cid))}${ctx.versions(g.cid).length > 1 ? ` [${esc(t.t)}]` : ""}: <b>${grade}</b> as ${/^[AEIOU]/.test(STYLE_LABEL[g.style]) ? "an" : "a"} ${esc(STYLE_LABEL[g.style])}${low ? ` <span class="warn">(below A: she can't carry a ${APT_LABELS[STYLE_APT[g.style]]} pink, and her own runs in the style are weaker)</span>` : ""}.</li>
        <li>Whites: learn the first 4 (◎ or gold raises the spark chance), then the long-term ones you can.${have.length ? ` She ${have.map((x) => `${x.how === "innate" ? "starts with" : "unlocks by awakening"} <b>${esc(ctx.skillName(x.id))}</b>`).join(", ")}.` : ""}</li>
        <li>Blue: <b>Stamina</b> 3★ if you can, else <b>Power</b> (uma.guide: the stats a career doesn't prioritise).</li>
        <li>Pink: ${pk.length ? pk.slice(0, 3).map((p) => `<b>${p.label}</b> (${p.grade})`).join(", ") : "none at A or S"}${pk[0] && pk[0].i === STYLE_APT[g.style] ? " (her style first: every ace of the style wants it)" : ""}.</li>
        <li>Races: her ${plan.goals.length} G1 goal${plan.goals.length === 1 ? "" : "s"} plus <b>${plan.extra.length} more G1s</b> that fit her, the ones most characters have as a goal first: about ${(3 * plan.shared).toFixed(0)} affinity from wins in common with a typical child.</li>
      </ul>
      <details data-cmp-open="gp-races"><summary class="mini">Her extra G1s (${plan.extra.length})</summary><div class="table-wrap"><table class="plan"><thead><tr><th>Turn</th><th>Race</th><th class="num">Goal for</th></tr></thead><tbody>${plan.extra.map((r) => `<tr><td class="num">${r.turn}</td><td>${esc(r.name)}</td><td class="num">${Math.round(r.share * 100)}%</td></tr>`).join("")}</tbody></table></div>
        <p class="mini">"Goal for": the share of characters with it as a career goal, so her child likely wins it too. Every extra race costs a training turn and some rating: untick any in ② once she's set up.</p></details>
      <div class="row-wrap"><button type="button" class="btn small" data-gp-send="${t.id}">${here ? "Set her up again" : "Set her up to train"}</button><span class="mini">${here ? "She's set up below: ① her, ② these races, ③ a deck for the list, ④ the list in the shop." : "① her, ② these races, ③ a deck that gives the list, ④ the first 4 in the shop as spark ★."}</span></div>
      ${here ? ctx.trainingHTML() : ""}`;
      return out;
    }

    function rankHTML(g) {
      const rows = rank(g.style, { A: ctx.A, cids: ctx.cids(), version, family: ctx.family, shares: sharesOf() }), mine = ctx.mine();
      return `<details data-cmp-open="gp-rank"><summary><b>Who makes a good general ${esc(STYLE_LABEL[g.style])} grandparent</b></summary>
        <p class="mini">Characters with A or S in the style, by her own affinity in a typical family: her trio with the trainee and her child (averaged over every pair of others) + 3 for each G1 she likely shares with her child (her plan above) + 2 for each list skill she starts with or unlocks. Each point of her own affinity is +1% on her sparks. No guide names general grandparents: this ranking is the app's. ★ = in My umas.</p>
        <div class="table-wrap"><table class="plan"><thead><tr><th>Character</th><th class="num">Trio</th><th class="num">G1s</th><th>List skills</th><th class="num">Score</th><th></th></tr></thead><tbody>${rows.slice(0, 12).map((r) => `<tr><td>${esc(ctx.charName(r.cid))}${mine.has(+r.cid) ? " ★" : ""} <span class="mini">${r.grade}</span></td><td class="num">${r.trio.toFixed(1)}</td><td class="num">${r.shared.toFixed(1)}</td><td class="mini">${r.own.map((x) => esc(ctx.skillName(x.id))).join(", ") || "—"}</td><td class="num">${r.score.toFixed(1)}</td><td><button type="button" class="linkish" data-gp-pick="${r.cid}">Pick</button></td></tr>`).join("")}</tbody></table></div></details>`;
    }

    function vetsHTML(g) {
      const vets = ctx.veterans();
      if (!vets.length) return `<p class="mini">Import your veterans (Parent 1 in the steps above, or the import below) to see which already fit each style.</p>`;
      const rows = vets.map((v) => ({ v, f: vetFit(v, g.style, ctx.family) })).filter((x) => x.f.score > 0).sort((a, b) => b.f.score - a.f.score).slice(0, 8);
      const w = (list) => list.map((x) => `${esc(ctx.skillName(x.id))} ${x.stars}★`).join(", ");
      return `<h4>Your veterans as general ${esc(STYLE_LABEL[g.style])} grandparents</h4>
        <p class="mini">Her list whites (first 4 count most, then long-term, then straights and corners; × stars), her parents' at half, a stamina or power blue and a ${APT_LABELS[STYLE_APT[g.style]]} pink. Each style's best is kept in the veteran cleanout.</p>
        ${rows.length ? `<div class="table-wrap"><table class="plan"><thead><tr><th>Veteran</th><th>Her list whites</th><th>On her parents</th><th class="num">Fit</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(ctx.vetName(r.v))}</td><td class="mini">${w(r.f.self) || "—"}</td><td class="mini">${w(r.f.line) || "—"}</td><td class="num">${r.f.score.toFixed(2)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="mini">None of your veterans has a skill from this list yet.</p>`}`;
    }

    function html() {
      const g = st();
      const t = g.cid ? version(g.cid, g.style) : null;
      return `<details class="panel" id="cm-general" data-cmp-open="gp-panel"><summary><b>General grandparents</b> · by running style, for any cup</summary>
        <p class="mini">A grandparent you can reuse under many aces: <a href="${esc(DATA.url)}" target="_blank" rel="noopener">uma.guide</a>'s general parent skills for the style${t ? `, checked against ${esc(ctx.charName(g.cid))}` : ""}. The cup steps above still pick the family for one ace; this is for building your loop.</p>
        <div class="row-wrap" role="group" aria-label="Running style">${STYLES.map((s) => `<button type="button" class="chip${s === g.style ? " active" : ""}" data-gp-style="${s}" aria-pressed="${s === g.style}">${esc(STYLE_LABEL[s])}</button>`).join("")}</div>
        ${listHTML(g.style, t)}
        <p class="mini">Also worth having for every style (uma.guide's special mentions): ${DATA.special.map(esc).join(", ")}.</p>
        ${umaHTML(g)}
        ${rankHTML(g)}
        ${vetsHTML(g)}
      </details>`;
    }

    function click(e) {
      const t = e.target, hit = (a) => t.closest("[" + a + "]");
      const g = st();
      let el;
      if ((el = hit("data-gp-style"))) { g.style = el.dataset.gpStyle; }
      else if ((el = hit("data-gp-pick"))) { g.cid = +el.dataset.gpPick; ctx.flash(`${ctx.charName(g.cid)} picked: her plan is above.`); }
      else if ((el = hit("data-gp-send"))) {
        const tid = +el.dataset.gpSend, tr = version(g.cid, g.style);
        if (!tr || tr.id !== tid) return true;
        const plan = racePlan(ctx.A, +g.cid, tr.apt, sharesOf());
        ctx.send({ tid, style: g.style, must: shortList(g.style).filter((id) => ctx.outNow(id)), races: plan.extra.map((r) => r.name) });
        return true;
      } else return false;
      ctx.save(); ctx.rerender();
      return true;
    }
    function change(e) {
      const t = e.target;
      if (t.dataset.gpUma == null) return false;
      st().cid = t.value ? +t.value : null;
      ctx.save(); ctx.rerender();
      return true;
    }
    return { html, click, change, version };
  }

  const api = { DATA, STYLES, STYLE_LABEL, STYLE_APT, WEIGHT, TIER_LABEL, BLUE, list, targets, shortList, altList, gradeOf, pinks, own, goalShares, racePlan, vetFit, rank, panel };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaGeneralParents = api;
})(typeof window !== "undefined" ? window : globalThis);
