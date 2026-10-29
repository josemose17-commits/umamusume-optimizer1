// The Parents tab: the ace's family and its affinity (each uma's own too), the fewest G1s the
// uma you're training now should win for ◎ (each race costs rating), and the skill purchase
// that reaches SS (which doubles her white sparks' 3★ chance) with the most relevant skills.
// Logic lives in affinity.js and rating.js; this file renders and keeps state.parents.
(function (root) {
  "use strict";
  const APT_LABELS = ["Turf", "Dirt", "Sprint", "Mile", "Medium", "Long", "Front", "Pace", "Late", "End"];
  const GRADES = ["S", "A", "B", "C", "D", "E", "F", "G"];
  const STAT_LABELS = ["Speed", "Stamina", "Power", "Guts", "Wit"];
  // Rating per skill point for converting SP: the median white skill's rating ÷ its full cost
  // (1.21; hint discounts raise it). Used only for rough "or this many more SP" readouts.
  const SP_RATING = 1.2;
  const WHY = { L: "race skill", green: "green", recovery: "recovery" };

  // Rating per skill point for buying these skills: the median of each one's rating at these
  // aptitudes ÷ its full cost (no hint discount). SP_RATING when there are too few to tell.
  function spRating(ids, apt, R, SB) {
    const x = ids.map((id) => { const c = SB.baseCost(id); return c > 0 ? R.skillScore(id, apt) / c : null; }).filter((v) => v != null).sort((a, b) => a - b);
    return x.length < 5 ? SP_RATING : Math.round(x[x.length >> 1] * 100) / 100;
  }

  function create(ctx) {
    const { D, A, R, SB, esc } = ctx;
    const open = new Set(["family", "fpLook", "who", "races", "deck", "rating"]);

    function st() {
      const s = ctx.state();
      if (!s.parents) s.parents = {};
      const p = s.parents;
      const d = { self: null, selfTrainee: null, apt: null, races: [], rating: {}, runs: [], useRuns: true };
      Object.keys(d).forEach((k) => { if (p[k] === undefined) p[k] = d[k]; });
      const r = p.rating;
      const rd = { stats: [null, null, null, null, null], sp: null, uniqueLevel: null, learned: [], shop: {}, must: [] };
      Object.keys(rd).forEach((k) => { if (r[k] === undefined) r[k] = rd[k]; });
      // She is the coach's trainee (one trainee everywhere): ① sets it, and it follows it.
      const tr = ctx.coachTrainee();
      if (tr && (p.self !== tr.cid || p.selfTrainee !== tr.id)) { p.self = tr.cid; p.selfTrainee = tr.id; p.apt = null; }
      return p;
    }

    // Characters (one entry per character, any version). The picker offers the ones on Global:
    // Global's affinity data has no groups for the others, so they'd silently score 0.
    const chars = new Map(), charByName = new Map(), onGlobal = new Set();
    D.DATA.trainees.forEach((t) => {
      if (!chars.has(t.cid)) chars.set(t.cid, t.n);
      if (D.onGlobal(t)) onGlobal.add(t.cid);
    });
    chars.forEach((n, cid) => { if (onGlobal.has(cid)) charByName.set(n.toLowerCase(), cid); });
    const charName = (cid) => (cid ? chars.get(+cid) || "#" + cid : "");
    const trainee = (id) => D.DATA.trainees.find((t) => t.id === +id) || null;
    const versions = (cid) => D.DATA.trainees.filter((t) => t.cid === +cid);
    const g1 = A.g1Races().sort((a, b) => a.turns[0] - b.turns[0] || a.name.localeCompare(b.name));
    // The family section (family-planner.js), ace down; it shares this tab's lists and redraws.
    const fp = root.UmaFamilyPlanner && root.UmaFamily ? root.UmaFamilyPlanner.create(Object.assign({}, ctx, {
      F: root.UmaFamily, parentsState: () => st(), charInput, charName, charId: (v) => charByName.get(String(v).toLowerCase()) || null,
      chars: () => Array.from(onGlobal), isOpen: (k) => open.has(k), rerender: () => rerender(),
      toBuilder: (tid, must) => toBuilder(tid, must), undoBuilder: (u) => undoBuilder(u),
    })) : null;

    // The family section's Parent 1, sent here to be built: ① becomes her, ③ races the ace's CM
    // race as an Ace parent, and her target sparks go into ④'s shop as spark ★. Returns what it
    // replaced, for undoBuilder.
    function toBuilder(tid, must) {
      const s = ctx.state(), p = st(), r = p.rating, race = ctx.aceRace(), t = trainee(tid);
      const undo = { trainee: p.selfTrainee, pcm: s.pcm ? { goal: s.pcm.goal, preset: s.pcm.preset, style: s.pcm.style } : null, must: r.must.slice(), shop: Object.assign({}, r.shop) };
      s.pcm = Object.assign(s.pcm || { independent: true }, { goal: "ace", preset: race.preset.id, style: race.style });
      (must || []).forEach((id) => { id = String(id); if (r.learned.indexOf(id) === -1 && r.shop[id] == null) r.shop[id] = 0; if (r.must.indexOf(id) === -1) r.must.push(id); });
      if (t) { p.self = t.cid; p.selfTrainee = t.id; p.apt = null; setTraineeLater(t.id); }
      return undo;
    }
    function undoBuilder(u) {
      const s = ctx.state(), p = st(), r = p.rating;
      if (u.pcm && s.pcm) Object.assign(s.pcm, u.pcm);
      r.must = u.must.slice(); r.shop = Object.assign({}, u.shop);
      const t = trainee(u.trainee);
      p.self = t ? t.cid : null; p.selfTrainee = t ? t.id : null; p.apt = null;
      setTraineeLater(t ? t.id : null);
    }

    function apt(p) {
      if (p.apt) return p.apt;
      const t = trainee(p.selfTrainee);
      return t ? t.apt.slice() : null;
    }
    const stars = (p) => { const t = trainee(p.selfTrainee); return t ? t.r : 3; };

    // ---------- The parent and her races ----------
    const GRADE_RANK = { S: 7, A: 6, B: 5, C: 4, D: 3, E: 2, F: 1, G: 0 };
    // The G1s you picked for her (from your own affinity plan), placed on her calendar: career
    // goals keep their turns and a race held in two years moves to a free one (affinity.js).
    function schedule(p) {
      if (!p.self) return null;
      const out = A.planRaces({ self: p.self, apt: apt(p), minGrade: "G", links: [{ role: "picked", cid: -1, wins: p.races }], need: Infinity });
      const extra = out.agenda.filter((r) => !r.free);
      const lowApt = out.agenda.filter((r) => r.aptGrades && r.aptGrades.some((g) => GRADE_RANK[g] < GRADE_RANK.B));
      return Object.assign(out, { extra, lowApt });
    }
    const extraCount = (p) => { const sc = schedule(p); return sc ? sc.extra.length : null; };
    // Rating per skill point: what her relevant skills for ③'s race give at her aptitudes.
    const spRate = (p) => { const rel = ctx.relevant(); return rel ? spRating(Object.keys(rel.targets), apt(p), R, SB) : SP_RATING; };
    // Her rating from predicted stats and skill points (all spent, ~spRate each) and her unique.
    const predictedRating = (p, x) => R.statsScore(x.stats) + Math.round((x.sp || 0) * spRate(p)) + R.uniqueBonus(stars(p), stars(p));
    // How many of the simulated careers reach SS, each rated like predictedRating: [hit, of].
    const ssCount = (p, x) => { const f = x.finals || []; return [f.filter((c) => predictedRating(p, c) >= R.SS).length, f.length]; };

    // ---------- Your real runs ----------
    // Each saved run keeps what was predicted for it and what she really got. Their ratio (all
    // runs pooled, held to ×0.7..×1.3) corrects each stat and the skill points in later
    // predictions, when "Correct predictions with my runs" is on.
    function factors(p) {
      const runs = (p.runs || []).filter((x) => x.pred && x.real);
      if (!p.useRuns || !runs.length) return null;
      const ratio = (get) => { const a = runs.reduce((n, x) => n + get(x.real), 0), b = runs.reduce((n, x) => n + get(x.pred), 0); return b > 0 ? Math.max(0.7, Math.min(1.3, a / b)) : 1; };
      return { stats: [0, 1, 2, 3, 4].map((i) => ratio((x) => x.stats[i])), sp: ratio((x) => x.sp), n: runs.length };
    }
    function calibrate(p, x) {
      const f = x && factors(p);
      if (!f) return x;
      const caps = ctx.caps();
      const fix = (c) => ({ stats: c.stats.map((v, i) => Math.round(Math.min(caps ? caps[i] : Infinity, v * f.stats[i]))), sp: Math.round(c.sp * f.sp) });
      return Object.assign({}, x, fix(x), { finals: (x.finals || []).map(fix), calibrated: f.n });
    }
    // The prediction for k extra races, corrected by your runs.
    const predict = (p, k) => calibrate(p, ctx.predict(k));

    function runsHTML(p, n, typed) {
      const r = p.rating, raw = n != null ? ctx.predict(n) : null, f = factors(p);
      const sum = (a) => a.reduce((x, y) => x + y, 0);
      let out = `${typed && raw ? '<div class="row-wrap"><button type="button" class="btn ghost small" data-pp-act="saveRun">Save this run (corrects later predictions)</button></div>' : ""}<details class="pred-help" data-pp-open="runs"${open.has("runs") ? " open" : ""}><summary>My real runs (${p.runs.length})${f ? ` · predictions corrected by ${f.n}` : ""}</summary>
        <p class="mini">After a run, type her real final stats and the skill points she had left above, then save it: the app compares it with what it predicted for that deck and race count, and corrects later predictions (each stat and the skill points by your runs' total ÷ the predicted total). Skill points earned are counted as the ones left plus the full price of the skills she learned, so hint discounts make it read a little high.</p>
        ${typed && raw ? "" : `<p class="mini">${raw ? "Type her real final stats above to save a run." : "Build a deck in ③ first, so there's a prediction to compare with."}</p>`}`;
      if (p.runs.length) {
        out += `<label class="chip-toggle"><input type="checkbox" data-pp-use-runs ${p.useRuns ? "checked" : ""}> Correct predictions with my runs</label>`;
        if (f) out += `<p class="mini">Corrections: ${STAT_LABELS.map((l, i) => `${l} ×${f.stats[i].toFixed(2)}`).join(", ")}, skill points ×${f.sp.toFixed(2)}.</p>`;
        out += `<div class="table-wrap"><table class="plan"><thead><tr><th>Run</th><th>Stats (real / predicted)</th><th>SP</th><th></th></tr></thead><tbody>${p.runs.map((x, i) => `<tr><td>${esc(x.at)}<div class="mini">${x.races} extra race${x.races === 1 ? "" : "s"}${x.deck ? " · " + esc(x.deck) : ""}</div></td><td class="num">${sum(x.real.stats).toLocaleString()} / ${sum(x.pred.stats).toLocaleString()}</td><td class="num">${x.real.sp.toLocaleString()} / ${x.pred.sp.toLocaleString()}</td><td><button type="button" class="linkish" data-pp-run-del="${i}" aria-label="Remove">✕</button></td></tr>`).join("")}</tbody></table></div>`;
      }
      return out + "</details>";
    }
    // Skill points she earned in the run: those left plus the full price of what she learned.
    const earnedSp = (r) => (+r.sp || 0) + r.learned.reduce((n, id) => n + (SB.baseCost(id) || 0), 0);

    function charInput(key, value, placeholder) {
      return `<input data-pp-char="${key}" list="ppChars" value="${esc(charName(value))}" placeholder="${esc(placeholder || "Character")}" autocomplete="off">`;
    }

    // ① The parent: the uma you're training now, her version and aptitudes.
    function whoHTML(p) {
      const vers = p.self ? versions(p.self) : [];
      const a = apt(p);
      return `<div class="pp-form">
          <label class="field"><span>The parent you're training <i class="mini">also the coach's trainee</i></span>${charInput("self", p.self, "Your trainee")}</label>
          ${vers.length > 1 ? `<label class="field"><span>Version</span><select data-pp="selfTrainee">${vers.map((v) => `<option value="${v.id}"${v.id === +p.selfTrainee ? " selected" : ""}>${esc(v.t)}</option>`).join("")}</select></label>` : ""}
        </div>
        ${a ? `<div class="pp-apt"><span class="mini">${esc(charName(p.self))}'s aptitudes (change one if a spark raised it):</span> ${[0, 1, 2, 3, 4, 5].map((i) => `<label class="pp-aptf"><span>${APT_LABELS[i]}</span><select data-pp-apt="${i}">${GRADES.map((g) => `<option${a[i] === g ? " selected" : ""}>${g}</option>`).join("")}</select></label>`).join("")}${p.apt ? ' <button type="button" class="btn ghost small" data-pp-act="aptReset">Use her base aptitudes</button>' : ""}</div>` : ""}`;
    }

    // ② Races: the G1s she'll run, where they go, and what they cost in stats and rating.
    function racesHTML(p) {
      if (!p.self) return `<p class="mini">Pick the parent in ① first.</p>`;
      const sc = schedule(p);
      const goals = new Set(A.goalG1s(p.self).map((g) => g.name));
      const picked = new Set(p.races);
      let out = `<p class="mini">Tick the G1s she'll race (from your affinity plan). Her career goals are already on her calendar; every other race is an extra one, and each costs a training turn.</p>
        <details class="pp-wins" data-pp-open="raceList"${open.has("raceList") ? " open" : ""}><summary>Pick races · ${picked.size ? picked.size + " ticked" : "none yet"}</summary>
        <div class="pp-g1grid">${g1.map((r) => `<label class="pp-g1"><input type="checkbox" data-pp-race value="${esc(r.name)}"${picked.has(r.name) ? " checked" : ""}> ${esc(r.name)}${goals.has(r.name) ? ' <i class="mini">goal</i>' : ""}</label>`).join("")}</div></details>`;
      if (sc.agenda.length) {
        out += `<div class="table-wrap"><table class="plan"><thead><tr><th>Turn</th><th>Race</th><th></th></tr></thead><tbody>${sc.agenda.map((r) => `
          <tr><td class="num">${r.turn}<div class="mini">${esc(ctx.turnText(r.turn))}</div></td><td><b>${esc(r.name)}</b><div class="mini">${r.d}m ${r.s === 2 ? "dirt" : "turf"}${r.aptGrades ? " · aptitude " + r.aptGrades.join("/") : ""}</div></td><td>${r.free ? (r.goal === "choice" ? `<span class="chip">career goal: pick this one</span><div class="mini">of ${esc(r.options.join(" / "))}</div>` : '<span class="chip">career goal</span>') : '<span class="chip warnchip">extra race</span>'}</td></tr>`).join("")}</tbody></table></div>`;
      }
      out += `<p><b>${sc.extra.length} extra race${sc.extra.length === 1 ? "" : "s"}</b>${sc.agenda.length - sc.extra.length ? ` and ${sc.agenda.length - sc.extra.length} career goal${sc.agenda.length - sc.extra.length === 1 ? "" : "s"}` : ""}. ③ Deck counts the ${sc.extra.length} extra for Independent Training.</p>`;
      if (sc.skipped.length) out += `<p class="mini warn">No free turn for ${sc.skipped.map((r) => esc(r.name)).join(", ")}: it's held on the same turn as another race she runs.</p>`;
      if (sc.lowApt.length) out += `<p class="mini warn">Below B aptitude, so she may not win: ${sc.lowApt.map((r) => `${esc(r.name)} (${r.aptGrades.join("/")})`).join(", ")}. Only a win counts for affinity.</p>`;
      return out + costHTML(p, sc.extra.length);
    }

    // What the races cost: predicted stats, skill points and rating for several race counts,
    // simulated with the deck from ③ (or the coach deck), filled in as each finishes.
    function costHTML(p, n) {
      const src = ctx.predictSource();
      if (!src) return `<p class="mini">Build a deck in ③ (or set your deck in Trainee and deck) to see what the races cost in stats and rating.</p>`;
      const counts = Array.from(new Set([0, 3, 6, 9, 12, n])).sort((a, b) => a - b);
      const missing = counts.filter((k) => !ctx.predict(k));
      if (missing.length) ctx.queuePredict(missing, () => rerender());
      const row = (k) => {
        const x = predict(p, k);
        if (!x) return `<tr${k === n ? ' class="cur"' : ""}><td class="num">${k}</td><td colspan="8" class="mini">simulating…</td></tr>`;
        const rt = predictedRating(p, x);
        return `<tr${k === n ? ' class="cur"' : ""}><td class="num">${k}${k === n ? " ←" : ""}</td>${x.stats.map((v) => `<td class="num">${v}</td>`).join("")}<td class="num">${x.sp}</td><td class="num"><b>${rt.toLocaleString()}</b></td><td>${rt >= R.SS ? "SS ✓" : `${(R.SS - rt).toLocaleString()} short`}${ssCount(p, x)[1] ? `<div class="mini">SS in ${ssCount(p, x).join("/")}</div>` : ""}</td></tr>`;
      };
      return `<p class="mini"><b>What the races cost</b> (${esc(src)}, Independent Training, average of 16 simulated careers, and how many of them reach SS; rating counts all skill points spent on her relevant skills at ~${spRate(p).toFixed(2)} each, before inheritance${factors(p) ? `; corrected by your ${factors(p).n} real run${factors(p).n === 1 ? "" : "s"} (④)` : ""}):</p>
        <div class="table-wrap"><table class="plan pp-cost"><thead><tr><th>Extra races</th>${STAT_LABELS.map((l) => `<th>${l.slice(0, 3)}</th>`).join("")}<th>SP</th><th>Rating</th><th>SS</th></tr></thead><tbody>${counts.map(row).join("")}</tbody></table></div>${missing.length ? "" : maxRacesHTML(p, counts, n)}`;
    }

    // The most extra races that still reach SS: the last simulated count that does, and the
    // straight line from it to the next one that doesn't.
    function maxRacesHTML(p, counts, n) {
      const pts = counts.map((k) => [k, predictedRating(p, predict(p, k))]);
      const ok = pts.filter(([, rt]) => rt >= R.SS);
      if (!ok.length) return `<p class="pp-max"><b>Even with no extra races she falls short of SS</b> on the prediction: ④ shows what to change.</p>`;
      const [k, rt] = ok[ok.length - 1];
      const after = pts.find(([j]) => j > k);
      const most = after ? k + Math.floor((rt - R.SS) / Math.max(1, rt - after[1]) * (after[0] - k)) : null;
      const line = most == null ? `<b>${k}+ extra races</b> still reach SS (every count simulated here does)` : `<b>About ${most} extra race${most === 1 ? "" : "s"} at most</b> still reach SS`;
      return `<p class="pp-max">${line}${n != null ? `: you have ${n}${most != null && n > most ? `, ${n - most} too many` : " ✓"}` : ""}.</p>`;
    }

    // ---------- Rating check ----------
    function solver(p, a, must) {
      const r = p.rating;
      must = must || r.must;
      const values = {};
      Object.keys(SB.DATA.skills).forEach((id) => { values[id] = R.skillScore(id, a); });
      must.forEach((id) => { if (!Number.isFinite(values[id])) values[id] = 0; });
      const shop = r.shop;
      const levels = {}, available = [];
      Object.keys(shop).forEach((id) => { if (shop[id] > 0) levels[id] = shop[id]; else available.push(id); });
      const s = SB.create({ skills: values, learned: r.learned, available, must: must.filter((id) => r.learned.indexOf(id) === -1), lengthValue: 1 });
      return { s, levels, values };
    }
    // Learned skills count once per family (a gold replaces its white, ◎ its ○).
    // The chance a learned skill leaves a spark (of its base white) at career end: 20% for ○
    // and other whites, 25% for ◎ (a white with a white before it), 40% for gold (GameTora).
    function sparkChance(id) {
      const m = SB.DATA.skills[id];
      if (!m) return 20;
      if (m[3] === 2) return 40;
      return m[2] && SB.DATA.skills[m[2]] && SB.DATA.skills[m[2]][3] === 1 ? 25 : 20;
    }
    function learnedTop(s, ids) {
      const chains = ids.map((id) => ({ id, c: s.chain(id) }));
      return ids.filter((id) => !chains.some((x) => x.id !== id && x.c && x.c.indexOf(id) !== -1 && x.c.length > 1));
    }

    function ratingHTML(p) {
      const r = p.rating;
      const a = apt(p) || null;
      const t = trainee(p.selfTrainee);
      const uLv = r.uniqueLevel != null ? r.uniqueLevel : stars(p);
      // Her real final stats once you type them; until then the prediction for ②'s race count
      // (shown greyed in the boxes).
      const typed = r.stats.some((x) => x != null);
      const n = extraCount(p);
      const pred = n != null ? predict(p, n) : null;
      const statsIn = STAT_LABELS.map((l, i) => `<label class="field pp-stat"><span>${l}</span><input type="number" inputmode="numeric" min="0" max="2500" data-pp-stat="${i}" value="${r.stats[i] == null ? "" : r.stats[i]}" placeholder="${pred ? pred.stats[i] : ""}"></label>`).join("");
      let out = `<p class="mini">${typed ? "Using the stats you typed." : pred ? `Using the predicted stats for ${n} extra race${n === 1 ? "" : "s"} (②, with the deck from ③). Type her real final stats after the run.` : "Type her final stats, or build a deck in ③ to start from predicted ones."} Add the skills in her shop and it picks the buy that reaches SS (${R.SS.toLocaleString()}) with the most ✦ relevant skills for ③'s race, or gets her closest when nothing reaches it.</p><details class="pred-help"><summary>How this works</summary><p class="mini">Rating = each stat's score (it rises steeply: 1000 → 1200 Speed is worth more than 400 → 600) + each learned skill's rating (more for skills that fit her aptitudes; a gold replaces its white) + the unique skill's level × ${stars(p) >= 3 ? 170 : 120}. SS starts at ${R.SS.toLocaleString()} and doubles her white sparks' 3★ chance. Relevant (✦), for an Ace parent: white skills worth more than 0.1 L (median) on ③'s race for her style, greens whose condition fits the race (course, direction, distance, ground, weather, season, style), and for Mile and longer the recoveries that fit it; never debuffs. Each relevant family counts once: its spark is always the base white skill's hint, and learning ◎ or the gold only raises the chance of getting it (20% for ○, 25% for ◎, 40% for gold; GameTora), so a gold is a good buy, not a lost spark. SS raises the spark's chance of 2★ and 3★ (3★ 5% → 10%). Stat scores: UmaTools' rating guide; skill ratings: UmaTools' skill table.</p></details>
        <div class="pp-form">${statsIn}
          <label class="field pp-stat"><span>Skill points left</span><input type="number" inputmode="numeric" min="0" data-pp-r="sp" value="${r.sp == null ? "" : r.sp}" placeholder="${pred ? pred.sp : ""}"></label>
          <label class="field pp-stat"><span>Unique skill level</span><input type="number" inputmode="numeric" min="0" max="10" data-pp-r="uniqueLevel" value="${uLv}"></label>
        </div>
        <div class="row-wrap">${typed || r.sp != null ? '<button type="button" class="btn ghost small" data-pp-act="usePredicted">Clear: use the predicted stats</button>' : ""}${t ? `<button type="button" class="btn ghost small" data-pp-act="addInnate">Add her innate and awakening skills to the shop</button>` : ""}${ctx.cmMust().length ? `<button type="button" class="btn ghost small" data-pp-act="addMust">Add my CM &amp; decks must-haves as spark ★</button>` : ""}${ctx.deckRelevant() ? `<button type="button" class="btn ghost small" data-pp-act="addRelevant">Add the ③ deck's relevant skills to the shop</button>` : ""}</div>
        <div class="row-wrap"><label class="field grow"><span>Add a skill (learned, or offered in the skill shop)</span><input id="ppSkill" list="ppSkills" placeholder="Skill name" autocomplete="off"></label>
          <label class="field"><span>Hint level</span><select id="ppSkillLv">${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}">Lv${n}</option>`).join("")}</select></label>
          <button type="button" class="btn ghost small" data-pp-act="shopAdd">Add to shop</button><button type="button" class="btn ghost small" data-pp-act="learnAdd">Already learned</button></div>`;
      if (!a) return out + `<p class="mini">Pick the uma you're training now (above) so skill ratings use her aptitudes.</p>`;
      const { s, levels, values } = solver(p, a);
      const rel = ctx.relevant();
      const relT = rel ? rel.targets : {};
      // A learned or bought skill is a relevant spark when its family has a relevant skill: the
      // spark is the base white's, whichever tier she learns, and the tier sets its chance.
      const isRel = (id) => { const c = s.chain(id); return !!(c && c.some((x) => relT[x])); };
      const tag = (id) => {
        const k = (s.chain(id) || [id]).map((x) => rel && rel.why[x]).filter(Boolean).pop();
        return k ? `<span class="chip relchip">${WHY[k]} · ${sparkChance(id)}%</span>` : "";
      };
      const learned = learnedTop(s, r.learned);
      const stats = typed ? r.stats.map((x) => +x || 0) : pred ? pred.stats.slice() : [0, 0, 0, 0, 0];
      const now = R.rating({ stats, skills: learned, apt: a, uniqueLevel: uLv, stars: stars(p) });
      const shopIds = Object.keys(r.shop);
      if (r.learned.length) out += `<div class="row-wrap"><b class="mini">Learned:</b> ${r.learned.map((id) => `<span class="chip">${esc(ctx.skillName(id))} <span class="mini">${values[id] != null ? values[id] : R.skillScore(id, a)}</span>${isRel(id) ? " ✦" : ""} <button type="button" class="linkish" data-pp-learn-del="${id}" aria-label="Remove">✕</button></span>`).join("")}</div>`;
      if (shopIds.length) out += `<div class="table-wrap"><table class="plan"><thead><tr><th>In the shop</th><th>Hint</th><th>Rating</th><th title="Relevant for ③'s race: becomes a spark worth passing down">Relevant</th><th title="A spark skill you're building her for: always bought">Spark ★</th><th></th></tr></thead><tbody>${shopIds.map((id) => `<tr><td>${esc(ctx.skillName(id))}</td><td><select data-pp-lv="${id}">${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}"${+r.shop[id] === n ? " selected" : ""}>Lv${n}</option>`).join("")}</select></td><td class="num">${R.skillScore(id, a)}</td><td>${tag(id)}</td><td><button type="button" class="must-tog" data-pp-must="${id}" aria-pressed="${r.must.indexOf(id) !== -1}">${r.must.indexOf(id) !== -1 ? "★" : "☆"}</button></td><td><button type="button" class="linkish" data-pp-shop-del="${id}" aria-label="Remove">✕</button></td></tr>`).join("")}</tbody></table></div>`;
      const sp = r.sp != null ? +r.sp : !typed && pred ? pred.sp : 0;
      const gap = R.SS - now.total;
      const buy = shopIds.length || r.learned.length ? s.solveSS(levels, sp, { gap, relevant: relT }) : null;
      const gain = buy ? Math.round(buy.value) : 0;
      const after = now.total + gain;
      const rk = R.rankOf(after);
      out += `<div class="pp-result"><p>Now: <b>${now.total.toLocaleString()}</b> (${now.rank.label}) = stats ${now.stats.toLocaleString()} + skills ${now.skills.toLocaleString()} + unique ${now.unique}.</p>`;
      if (buy && buy.selected.length) {
        out += `<p>Best buy with ${sp} SP${rel ? ": SS first, then the most relevant skills" : ""}: ${buy.selected.map((o) => `<b>${esc(ctx.skillName(o.id))}</b> (${o.cost} SP, +${Math.round(o.value)}${o.rel > 0 ? ", ✦ relevant" : ""}${o.required.length ? ", spark ★" : ""})`).join(", ")}. Spends ${buy.spent}, ${buy.unspent} left.</p>`;
        if (buy.unmetMust.length) out += `<p class="mini warn">Can't afford every spark skill: ${buy.unmetMust.map((id) => esc(ctx.skillName(id))).join(", ")}.</p>`;
      }
      out += `<p>After buying: <b class="pp-big">${after.toLocaleString()} · ${rk.label}</b>${after >= R.SS ? " ✓ SS" : ` · <b>${(R.SS - after).toLocaleString()}</b> short of SS`}.</p>`;
      if (rel) {
        const have = learned.filter(isRel).length, more = buy ? buy.relevant : 0;
        // Each family's top skill after the buy, for the expected number of relevant sparks.
        const top = new Map(learned.filter((id) => SB.DATA.skills[id]).map((id) => [SB.DATA.skills[id][0], id]));
        if (buy) buy.selected.forEach((x) => top.set(x.family, x.id));
        const expect = [...top.values()].filter(isRel).reduce((n, id) => n + sparkChance(id) / 100, 0);
        out += `<p>✦ <b>${have + more} relevant skill${have + more === 1 ? "" : "s"}</b> to pass down (${have} learned${buy ? ` + ${more} from this buy` : ""}) for ${esc(rel.race)} as a ${esc(rel.style)} runner: about <b>${expect.toFixed(1)}</b> relevant white sparks expected (20% each for ○, 25% for ◎, 40% for gold).</p>`;
      } else out += `<p class="mini">Pick the race and style in ③ to count her relevant skills${ctx.relevantLoading() ? " (loading the race's skill values…)" : ""}.</p>`;
      if (after < R.SS) out += shortHTML(p, a, levels, sp, gap, after, stats, n, pred, typed);
      return out + "</div>" + runsHTML(p, n, typed);
    }

    // Short of SS: which spark ★ to let go, how many fewer races, or how many more stats.
    function shortHTML(p, a, levels, sp, gap, after, stats, n, pred, typed) {
      const r = p.rating, relT = (ctx.relevant() || { targets: {} }).targets;
      const tips = [];
      r.must.filter((id) => r.learned.indexOf(id) === -1).forEach((id) => {
        const x = solver(p, a, r.must.filter((m) => m !== id)).s.solveSS(levels, sp, { gap, relevant: relT });
        if (x.reached) tips.push(`unmark ★ <b>${esc(ctx.skillName(id))}</b> (then she reaches SS)`);
      });
      const zero = !typed && n > 0 ? predict(p, 0) : null;
      if (zero && pred) {
        const per = (predictedRating(p, zero) - predictedRating(p, pred)) / n;
        if (per > 0) { const k = Math.ceil((R.SS - after) / per); if (k <= n) tips.push(`about <b>${k} fewer extra race${k === 1 ? "" : "s"}</b> in ② (each costs about ${Math.round(per)} rating)`); }
      }
      const add = R.statsFor(stats, R.SS - after, ctx.caps());
      tips.push(`about ${add ? add.map((v, i) => (v ? `+${v} ${STAT_LABELS[i]}` : "")).filter(Boolean).join(", ") : "more stats than her caps allow"} (the highest stats score most per point)`);
      tips.push(`about ${Math.ceil((R.SS - after) / SP_RATING).toLocaleString()} more skill points of typical skills`);
      return `<p class="mini warn">SS is out of reach with this shop. To close it: ${tips.join("; or ")}. Every learned skill counts, including ones that don't help this race.</p>`;
    }

    const section = (key, title, note, body) => `<details class="panel pp-sec" data-pp-open="${key}"${open.has(key) ? " open" : ""}><summary><h2>${title}</h2><span class="mini" data-pp-note="${key}">${note}</span></summary><div data-pp-body="${key}">${body}</div></details>`;

    // The autocomplete lists don't change, so they're built once, outside the redrawn page.
    function lists() {
      if (document.getElementById("ppLists")) return;
      const box = document.createElement("div");
      box.id = "ppLists";
      box.hidden = true;
      box.innerHTML = `<datalist id="ppChars">${Array.from(charByName.keys()).map((k) => chars.get(charByName.get(k))).sort().map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>
        <datalist id="ppSkills">${ctx.skillNames().map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>`;
      document.body.appendChild(box);
    }

    // ③ Deck races the extra G1s ② lists (her career goals are on its calendar already).
    // Returns what ③ depends on, to redraw it only when that changes.
    let deckSig = null;
    function syncDeck(p) {
      const n = extraCount(p);
      ctx.setItRaces(n);
      return JSON.stringify([n, p.selfTrainee]);
    }

    const notes = (p) => { const n = extraCount(p); return { family: fp ? fp.note() : "", who: p.self ? esc(charName(p.self)) : "pick your uma", races: n == null ? "the G1s she'll run" : `${n} extra race${n === 1 ? "" : "s"}`, rating: "skills to buy, reach SS" }; };
    const bodies = { who: whoHTML, races: racesHTML, rating: ratingHTML };
    if (fp) bodies.family = () => fp.html();

    function render(el) {
      const p = st();
      lists();
      deckSig = syncDeck(p);
      const nt = notes(p);
      el.innerHTML = `<div class="parents">
        <p class="mini pp-intro">Plan the ace's family from the top down, then build each parent in order: who she is, the G1s she'll run, the deck, then the skills to buy so she reaches SS. More races mean fewer training turns, so ② shows what they cost.</p>
        ${fp ? section("family", "Family: ace → parents → grandparents", nt.family, fp.html()) : ""}
        ${section("who", "① The parent", nt.who, whoHTML(p))}
        ${section("races", "② Races", nt.races, racesHTML(p))}
        ${section("deck", "③ Deck", "ace parent", ctx.deckHTML())}
        ${section("rating", "④ After the run", nt.rating, ratingHTML(p))}
      </div>`;
    }

    // Redraw after a change in this tab: only ①, ② and ④, and ③ when its inputs changed (so
    // what you're typing in ③ stays). Not mid-event: a change fired by blur can't replace its
    // own element.
    let pending = false;
    function rerender() {
      ctx.save();
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        const el = ctx.container();
        if (!el || ctx.state().tab !== "parents") return;
        if (!el.querySelector(".parents")) { render(el); return; }
        const p = st();
        const sig = syncDeck(p);
        if (sig !== deckSig) {
          // ③ shows the race count: redraw it, keeping anything typed in its text boxes.
          deckSig = sig;
          const deck = el.querySelector('[data-pp-body="deck"]');
          if (deck) {
            const typed = Array.from(deck.querySelectorAll("input[id]")).filter((x) => x.type === "text" || !x.type || x.type === "search").map((x) => [x.id, x.value]);
            deck.innerHTML = ctx.deckHTML();
            typed.forEach(([id, v]) => { const x = deck.querySelector("#" + id); if (x && v) x.value = v; });
          }
        }
        const nt = notes(p);
        Object.keys(bodies).forEach((k) => {
          const body = el.querySelector(`[data-pp-body="${k}"]`), note = el.querySelector(`[data-pp-note="${k}"]`);
          if (body) body.innerHTML = bodies[k](p);
          if (note) note.innerHTML = nt[k];
        });
      }, 0);
    }

    function onToggle(e) {
      const d = e.target.closest && e.target.closest("[data-pp-open]");
      if (!d || d !== e.target) return;
      if (d.open) open.add(d.dataset.ppOpen); else open.delete(d.dataset.ppOpen);
    }

    function click(e) {
      if (fp && fp.click(e)) return true;
      const p = st(), r = p.rating;
      const t = e.target;
      const act = t.closest("[data-pp-act]");
      if (act) {
        const a = act.dataset.ppAct;
        if (a === "aptReset") p.apt = null;
        if (a === "usePredicted") { r.stats = [null, null, null, null, null]; r.sp = null; }
        if (a === "addMust") ctx.cmMust().forEach((id) => { id = String(id); if (r.learned.indexOf(id) === -1 && r.shop[id] == null) r.shop[id] = 0; if (r.must.indexOf(id) === -1) r.must.push(id); });
        // Every relevant white the ③ deck can give, at Lv0: remove the ones her shop doesn't show.
        if (a === "addRelevant") (ctx.deckRelevant() || []).forEach((id) => { id = String(id); if (r.shop[id] == null && r.learned.indexOf(id) === -1) r.shop[id] = 0; });
        if (a === "saveRun") {
          const n = extraCount(p), raw = n != null ? ctx.predict(n) : null;
          if (!raw || !r.stats.some((x) => x != null)) { ctx.flash("Type her real final stats first."); return true; }
          p.runs.push({ at: new Date().toISOString().slice(0, 10), races: n, deck: ctx.predictSource(), pred: { stats: raw.stats.slice(), sp: raw.sp }, real: { stats: r.stats.map((x) => +x || 0), sp: earnedSp(r) } });
          open.add("runs");
        }
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
      const rd = t.closest("[data-pp-run-del]");
      if (rd) { p.runs.splice(+rd.dataset.ppRunDel, 1); rerender(); return true; }
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
      if (fp && fp.change(e)) return true;
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
        }
      } else if (ds.ppUseRuns != null) {
        p.useRuns = t.checked;
      } else if (ds.ppRace != null) {
        const i = p.races.indexOf(t.value);
        if (t.checked && i === -1) p.races.push(t.value);
        if (!t.checked && i !== -1) p.races.splice(i, 1);
        open.add("raceList");
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

    return { render, click, change, onToggle, SP_RATING, spRate: () => spRate(st()), schedule: (p) => schedule(p || st()) };
  }

  const api = { create, SP_RATING, spRating };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaParentPlanner = api;
})(typeof window !== "undefined" ? window : globalThis);
