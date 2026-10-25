// Tier list and CM deck building on Euophrys' scoring (vendor/euophrys.js), plus skills.
//
// The base score is exactly what Euophrys' tier list gives a card: the extra weighted stats
// it adds to the deck you have so far, for the scenario's preset weights. On top of that
// comes a skill score: the skills the card can hint or give through events, each valued by
// its median length gain (L) on the chosen race minus its skill point cost, counting only
// what the deck doesn't already cover and what the trainee doesn't already have.
// Must-have skills (opts.must) come first: the deck covers every one some usable card gives.
(function (root) {
  const D = root.UmaDeck || (typeof require !== "undefined" ? require("./deck.js") : null);
  const SkillEvents = root.UmaSkillEvents || (typeof require !== "undefined" ? require("./skill-events.js") : null);
  const EU = root.Euophrys || (typeof require !== "undefined" ? require("./vendor/euophrys.js") : null);
  const cardsData = () => root.EuophrysCards || (typeof require !== "undefined" ? require("./data/euophrys-cards.js") : null);
  const eventsData = () => root.UmaCardEvents || (typeof require !== "undefined" ? require("./data/card-events.js") : null);

  const ParentPrerequisites = root.UmaParentPrerequisites || (typeof require !== "undefined" ? require("./parent-prerequisites.js") : null);
  const purchases = root.UmaSkillPurchases || (typeof require !== "undefined" ? require("./data/skill-purchases.js") : null);
  const skillInfo = root.UmaSkillValues || (typeof require !== "undefined" ? require("./data/skillvalues/index.js") : null);
  const parentRoutes = ParentPrerequisites.create(purchases.skills);

  // Euophrys' Global scenario presets, and which one each coach scenario uses.
  const SCENARIOS = [["URA", "URA Finale"], ["Aoharu", "Unity Cup"], ["MANT", "Trackblazer"], ["GL", "Grand Concert"], ["GM", "Grand Masters"]];
  const FROM_COACH = { ura: "URA", unity: "Aoharu", trackblazer: "MANT", grandlive: "GL", grandmasters: "GM" };
  // Euophrys' weight tabs: card type -> tab key and type number in its data.
  const TABS = { speed: ["speed", 0], stamina: ["stamina", 1], power: ["power", 2], guts: ["guts", 3], wit: ["wisdom", 4], friend: ["friend", 6], group: ["friend", 6] };

  // Skill value in Euophrys' units. A hint makes a skill available and cheaper, so a skill is
  // worth its length gain (1 L counted like 60 Speed, at the Speed weight of the card's tab)
  // plus the skill points the hint discount saves (at the skill point weight).
  const SPEED_PER_L = 60;
  const HINT_CHANCE = 0.075; // per turn trained with the card, before its hint frequency
  const TRAIN_SHARE = { type: 0.3, friend: 0.22 }; // share of training turns spent with the card
  // Must-have skills: covering one (a card in the deck can hint it or give it through an event)
  // outweighs any card's score, so the builder covers each one it can. Past that, a better
  // chance to actually be offered it counts a little (MUST_P for a sure thing).
  // Independent Training (the 50-minute auto mode): a card's 3rd chain event rarely fires
  // (uma.guide), so a skill only that event (or a later one) gives counts at IT_LATE_CHAIN of
  // its usual chance. Parent runs there race a G1-heavy agenda for affinity and race sparks,
  // and the stats races give scale with Race Bonus, so Euophrys' race counts become IT_RACES
  // (G1, G2/G3, OP) unless you've set your own.
  const IT_LATE_CHAIN = 0.2;
  const IT_RACES = [15, 3, 0];
  // Independent Training card value, from players' testing there (r/UmamusumeGame, fujikiseki.xyz):
  // initial stats and skill points stand out, Specialty Priority seems to do nothing, and
  // Friendship Bonus, Mood Effect and Training Effectiveness haven't been measured there, so
  // they count at `itManual` (default half) of their manual-career value. Initial stats and
  // skill points (Skill Point Bonus, events, Initial Skill Points) count IT_INITIAL / IT_SP
  // times. These are assumptions, not measured game rules.
  const IT_INITIAL = 1.5, IT_SP = 1.5, IT_MANUAL = 0.5;
  function itEntry(e, k) {
    if (!e) return e;
    const x = Object.assign({}, e);
    const scale = (v) => 1 + ((v == null ? 1 : v) - 1) * k;
    x.specialty_rate = 0;
    x.unique_specialty = 1;
    x.fs_specialty = 1;
    x.tb = scale(e.tb);
    x.mb = scale(e.mb);
    x.fs_bonus = scale(e.fs_bonus);
    x.unique_fs_bonus = scale(e.unique_fs_bonus);
    x.fs_training = (e.fs_training || 0) * k;
    x.fs_motivation = (e.fs_motivation || 0) * k;
    x.starting_stats = e.starting_stats.map((v) => v * IT_INITIAL);
    x.type_stats = (e.type_stats || 0) * IT_INITIAL;
    return x;
  }
  const itOn = (opts) => !!opts.independent;
  const itK = (opts) => (opts.itManual != null ? +opts.itManual : IT_MANUAL);
  const lateMemo = new Map();
  function lateChainSkills(card) {
    if (lateMemo.has(card.id)) return lateMemo.get(card.id);
    const ev = eventsData();
    const ce = ev && ev.cards && ev.cards[card.id];
    const out = new Set();
    if (ce && ce.chain && ce.chain.length >= 3) {
      const skillsOf = (eid) => {
        const set = new Set();
        const e = ev.events[eid];
        ((e && e.c) || []).forEach((ch) => [ch, ch.ok || {}, ch.ng || {}].forEach((x) => {
          (x.h || []).forEach((h) => set.add(String(h[0])));
          (x.g || []).forEach((g) => set.add(String(g)));
        }));
        return set;
      };
      const early = new Set();
      ce.chain.slice(0, 2).concat(ce.other || []).forEach((eid) => skillsOf(eid).forEach((x) => early.add(x)));
      ce.chain.slice(2).forEach((eid) => skillsOf(eid).forEach((x) => { if (!early.has(x)) out.add(x); }));
    }
    lateMemo.set(card.id, out);
    return out;
  }
  const MUST_COVER = 1e6;
  const MUST_P = 500;

  const byKey = new Map();
  function entry(id, lb) {
    const all = cardsData();
    if (!all) return null;
    if (!byKey.size) all.forEach((c) => byKey.set(c.id + ":" + c.limit_break, c));
    return byKey.get(id + ":" + lb) || null;
  }

  // Euophrys' weights for one card type in one scenario, with your overrides and the trainee's
  // growth bonuses (in place of Euophrys' flat +6%).
  function weightsFor(scen, ty, overrides, trainee, independent) {
    const s = EU.getScenario("gl", scen);
    const [tab, type] = TABS[ty] || TABS.speed;
    const w = Object.assign({}, s.general, s[tab], { type });
    // `independent` may carry your own agenda's race counts [G1, G2/G3, OP] (the Parents tab's G1 plan).
    if (independent) {
      w.races = (Array.isArray(independent) ? independent : IT_RACES).concat(w.races.slice(3));
      w.stats = w.stats.slice();
      w.stats[5] *= IT_SP;
    }
    const o = overrides || {};
    Object.keys(o).forEach((k) => { if (o[k] != null) w[k] = Array.isArray(o[k]) ? o[k].slice() : o[k]; });
    const t = trainee ? D.trainee(trainee) : null;
    if (t) w.umaBonus = t.g.map((g) => 1 + g / 100).concat([1]);
    return w;
  }

  // Expected skill value of a set of cards: each skill once, by its chance to be offered.
  function skillValue(cards, ctx) {
    const offers = ctx.parent ? parentRoutes.offers(ctx) : D.skillOffers();
    const days = Math.max(1, 65 - (ctx.races || 0));
    cards.forEach((c) => {
      const card = D.card(c.id);
      if (ctx.parentGlobal && !D.onGlobal(card, ctx.today)) return;
      const eu = entry(c.id, c.lb);
      const level = D.levelFor(card, c.lb);
      const fx = D.baseEffects(card, level);
      const share = card.ty === "friend" || card.ty === "group" ? TRAIN_SHARE.friend : TRAIN_SHARE.type;
      const hints = days * share * HINT_CHANCE * (eu ? eu.hint_rate : 1 + (fx[18] || 0) / 100);
      const lv = 1 + (fx[17] || 0);
      const hs = card.hs || [];
      hs.forEach((id) => offers.trainingHints(id, hints / Math.max(1, hs.length), lv, card.id));
      SkillEvents.add(offers, card, ctx.parent ? parentRoutes.eventContext(ctx, card) : ctx, { success: ctx.eventSuccessRate, independent: ctx.it });
    });
    const list = [];
    const probabilities = offers.values();
    probabilities.forEach((offer) => {
      const { id } = offer;
      const L = ctx.skills[id];
      if (L == null || ctx.known.has(id)) return;
      const cost = ctx.costs[id] || D.skillCost(id) || 150;
      const surplus = L * SPEED_PER_L * ctx.speedWeight + cost * offer.conditionalDiscount * ctx.spWeight;
      list.push(Object.assign({}, offer, { L, cost, surplus }));
    });
    list.sort((a, b) => b.surplus * b.p - a.surplus * a.p);
    let value = 0;
    // A race build only has the skill points for so many skills; a parent wants every skill it
    // can get, since each one learned can become a skill spark to pass down.
    list.forEach((s, i) => { if (s.surplus > 0) value += s.p * s.surplus * (ctx.parent || i < 8 ? 1 : 0.4); });
    // Must-have skills: the chance the deck offers each, and which cards give it.
    let mustValue = 0;
    const must = (ctx.must || []).map((id) => {
      const e = probabilities.find((x) => x.id === String(id));
      const pr = e ? e.p : 0;
      if (pr > 0) mustValue += MUST_COVER + MUST_P * pr;
      return { id, p: pr, src: e ? e.src : [] };
    });
    return { value, list, must, mustValue };
  }

  function makeCtx(opts) {
    const t = opts.trainee ? D.trainee(opts.trainee) : null;
    const parent = opts.parent || null;
    const ctx = {
      parent: !!parent,
      // Parent decks value target skills by weight (in lengths) instead of race skill values.
      skills: parent ? parent.targets : opts.skills || {}, costs: opts.costs || {},
      skillWeight: parent ? 1 : opts.skillWeight != null ? opts.skillWeight : 1,
      known: new Set((t ? [].concat(t.us || [], t.is || [], t.as || []) : []).map(String)),
      traineeChar: t ? t.cid : null,
      it: !!opts.independent,
      eventSuccessRate: opts.eventSuccessRate == null ? 0.5 : opts.eventSuccessRate,
    };
    if (parent) {
      ctx.parentGlobal = !!parent.globalOnly;
      ctx.today = parent.today;
      ctx.allowSkill = id => !ctx.parentGlobal || !!(skillInfo.skills[id] && skillInfo.skills[id][3]);
      [...ctx.known].forEach(id => parentRoutes.whites(id).forEach(white => ctx.known.add(white)));
    }
    // A must-have the trainee already has needs no card.
    ctx.must = (opts.must || []).map(String).filter((id) => !ctx.known.has(id));
    return ctx;
  }

  // Ranks candidates ([{id, lb}]) of one card type for the deck so far ([{id, lb}]).
  // Returns [{ id, lb, base, skill, score, skills }] best first.
  function rank(opts, ty, deck, candidates) {
    const ctx = makeCtx(opts);
    const ov = opts.overrides || {};
    const w = weightsFor(opts.scenario, ty, Object.assign({}, ov.general, ov.tabs && ov.tabs[TABS[ty][0]]), opts.trainee, opts.independent);
    ctx.spWeight = w.stats[5];
    ctx.speedWeight = w.stats[0];
    ctx.races = w.races.slice(0, 3).reduce((a, b) => a + b, 0);
    const it = itOn(opts), k = itK(opts);
    const ent = (c) => (it ? itEntry(entry(c.id, c.lb), k) : entry(c.id, c.lb));
    const selected = deck.map(ent).filter(Boolean);
    const inDeck = new Set(deck.map((c) => D.card(c.id).cid));
    const cands = candidates.filter((c) => {
      const card = D.card(c.id);
      return card && !inDeck.has(card.cid) && card.cid !== ctx.traineeChar && entry(c.id, c.lb);
    });
    const base = EU.processCards(cands.map(ent), w, selected);
    const baseBy = new Map(base.map((x) => [x.id + ":" + x.lb, x]));
    const before = skillValue(deck, ctx);
    return cands.map((c) => {
      const b = baseBy.get(c.id + ":" + c.lb);
      // Independent Training: what the card's score rests on there, and its Initial Skill
      // Points (Euophrys leaves them out).
      let itParts = null;
      if (it) {
        const card = D.card(c.id), fx = D.baseEffects(card, D.levelFor(card, c.lb));
        const e = entry(c.id, c.lb);
        const initSp = fx[32] || 0; // skill points already count IT_SP times
        itParts = {
          initialStats: Math.round(e.starting_stats.reduce((a, v) => a + v, 0) + (e.type_stats || 0) * (deck.length + 1)),
          initialSp: fx[32] || 0,
          spBonus: e.stat_bonus[5] || 0,
          raceBonus: e.race_bonus || 0,
          hint: { rate: e.hint_rate, lv: fx[17] || 0 },
          initialSpScore: initSp * w.stats[5],
        };
        b.score += itParts.initialSpScore;
      }
      const sv = skillValue(deck.concat([c]), ctx);
      const skill = (sv.value - before.value) * ctx.skillWeight;
      const must = sv.mustValue - before.mustValue;
      const base = b.score * (opts.parent ? opts.parent.statsWeight : 1);
      return {
        id: c.id, lb: c.lb, base, skill, must, score: base + skill + must, info: b.info, it: itParts,
        gives: sv.must.filter((m) => m.src.indexOf(c.id) !== -1).map((m) => m.id),
        skills: sv.list.filter((s) => s.src.indexOf(c.id) !== -1 && s.surplus > 0).slice(0, 3).map((s) => ({ id: s.id, L: s.L, p: s.p }))
      };
    }).sort((a, b) => b.score - a.score);
  }

  // Builds a deck the way Euophrys' list is used: pick the best card, then the best card given
  // that one, and so on, keeping to the deck makeup (comp: { type: count }), then retry each
  // slot with the others fixed until nothing improves. pool/borrowPool: [{id, lb}].
  function buildDeck(opts, pool, borrowPool) {
    const comp = opts.comp || {};
    const types = Object.keys(TABS);
    const locked = (opts.locked || []).map((id) => pool.find((c) => c.id === id)).filter(Boolean);
    const borrowSlot = opts.borrow && borrowPool && borrowPool.length ? 1 : 0;
    const count = (deck) => { const n = {}; deck.forEach((c) => { const t = D.card(c.id).ty; n[t] = (n[t] || 0) + 1; }); return n; };
    // Types that may fill the next slot without breaking the makeup.
    const openTypes = (deck) => {
      const n = count(deck);
      let need = 0;
      types.forEach((t) => { if (comp[t] != null) need += Math.max(0, comp[t] - (n[t] || 0)); });
      const left = 6 - deck.length;
      return types.filter((t) => {
        if (comp[t] != null) return (n[t] || 0) < comp[t];
        return left - 1 >= need; // a free type only while the fixed counts still fit
      });
    };
    const best = (deck, from) => {
      let top = null;
      openTypes(deck).forEach((t) => {
        const cands = from.filter((c) => D.card(c.id).ty === t);
        if (!cands.length) return;
        const r = rank(opts, t, deck, cands)[0];
        if (r && (!top || r.score > top.score)) top = r;
      });
      return top;
    };
    let deck = locked.slice();
    while (deck.length < 6 - borrowSlot) {
      const pick = best(deck, pool);
      if (!pick) break;
      deck.push({ id: pick.id, lb: pick.lb, score: pick.score, base: pick.base, skill: pick.skill });
    }
    if (deck.length < 6 - borrowSlot) {
      const fixed = types.filter((t) => comp[t] != null).map((t) => comp[t] + " " + t).join(", ");
      throw new Error("Not enough cards to fill the deck" + (fixed ? " with " + fixed : "") + ". Mark more owned cards or allow a borrowed card.");
    }
    if (borrowSlot) {
      const pick = best(deck, borrowPool);
      if (pick) deck.push({ id: pick.id, lb: pick.lb, borrowed: true, score: pick.score, base: pick.base, skill: pick.skill });
    }
    // Revisit each owned, unlocked slot with the other five fixed.
    const lockedIds = new Set(locked.map((c) => c.id));
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      deck.forEach((c, i) => {
        if (lockedIds.has(c.id)) return;
        const rest = deck.filter((_, j) => j !== i);
        const pick = best(rest, c.borrowed ? borrowPool : pool);
        const cur = rank(opts, D.card(c.id).ty, rest, [c])[0];
        if (pick && cur && pick.score > cur.score + 1e-6 && (pick.id !== c.id || pick.lb !== c.lb)) {
          deck[i] = { id: pick.id, lb: pick.lb, borrowed: c.borrowed, score: pick.score, base: pick.base, skill: pick.skill };
          changed = true;
        }
      });
      if (!changed) break;
    }
    return describeDeck(opts, deck, pool, borrowPool);
  }

  // A finished deck as the page shows it: each card's value with the other five fixed and the
  // next-best card for its slot (scores leave out the must-have bonus; gives lists the
  // must-haves the card brings), the deck's best skills and its must-have coverage.
  function describeDeck(opts, deck, pool, borrowPool) {
    const requiredCoverage = deckSkills(opts, deck).must.filter((x) => x.p > 0).map((x) => x.id);
    const cards = deck.map((c, i) => {
      const rest = deck.filter((_, j) => j !== i);
      const own = rank(opts, D.card(c.id).ty, rest, [c])[0] || { score: 0, base: 0, skill: 0, must: 0, skills: [], gives: [] };
      const from = (c.borrowed ? borrowPool : pool).filter((x) => x.id !== c.id && D.card(x.id).ty === D.card(c.id).ty);
      const alt = from.length ? rank(opts, D.card(c.id).ty, rest, from)[0] : null;
      const altCoverage = alt ? deckSkills(opts, rest.concat([alt])).must.filter((x) => x.p > 0).map((x) => x.id) : [];
      return {
        id: c.id, lb: c.lb, borrowed: !!c.borrowed, score: own.score - own.must, base: own.base, skill: own.skill, skills: own.skills, gives: own.gives, it: own.it || null,
        alt: alt ? { id: alt.id, lb: alt.lb, score: alt.score - alt.must, losesMust: requiredCoverage.some((id) => !altCoverage.includes(id)) } : null
      };
    });
    const ctx = makeCtx(opts);
    ctx.spWeight = 1;
    ctx.speedWeight = 1;
    if (opts.parent) {
      const sv = skillValue(deck, ctx);
      const sum = sv.list.filter((s) => s.surplus > 0);
      return { cards, skills: sum, expected: sum.reduce((a, s) => a + s.p, 0), must: sv.must };
    }
    ctx.races = 0;
    const sv = skillValue(deck, ctx);
    return { cards, skills: sv.list.filter((s) => s.surplus > 0 && s.p >= 0.15).slice(0, 10), must: sv.must };
  }

  // The whole deck's skill score in stat points (1 L = 60, skill points at 0.35 each, as in
  // optimizer.js) and its must-have bonus, for the target-stat search.
  function deckSkills(opts, deck) {
    const ctx = makeCtx(opts);
    const ov = opts.overrides || {};
    ctx.speedWeight = 1;
    ctx.spWeight = 0.35;
    ctx.races = weightsFor(opts.scenario, "speed", ov.general, null, opts.independent).races.slice(0, 3).reduce((a, b) => a + b, 0);
    const sv = skillValue(deck, ctx);
    return { value: sv.value, mustValue: sv.mustValue, must: sv.must };
  }

  // Target skills for a parent deck, as { skill id: weight in lengths }. Only white skills
  // become skill sparks, so gold skills (and inherited uniques) don't count.
  //   ace: white skills that are good on the race (median L for the running style);
  //   debuff: white debuffs that can trigger on the race's distance/surface with your style
  //   (each counted like a 1 L skill). rarityOf(id): 1 white, 2 gold, 9 inherited unique.
  const STYLE_NO = { Nige: 1, Senkou: 2, Sasi: 3, Oikomi: 4 };
  const DIST_NO = { Sprint: 1, Mile: 2, Medium: 3, Long: 4 };
  function parentTargets(mode, preset, style, raceSkills, debuffs, minL, rarityOf) {
    const out = {};
    // Debuffer parent: white debuffs only (they become sparks). Debuffer ace (the runner you
    // enter to debuff): golds too, counted double since they hit about twice as hard.
    if (mode === "debuff" || mode === "debuffAce") {
      Object.entries(debuffs || {}).forEach(([id, d]) => {
        if (d.dist.length && d.dist.indexOf(DIST_NO[preset.course.dist]) === -1) return;
        if (d.ground.length && d.ground.indexOf(preset.course.surface === "Dirt" ? 2 : 1) === -1) return;
        if (d.style.length && d.style.indexOf(STYLE_NO[style]) === -1) return;
        if (mode === "debuff" ? d.r !== 1 : d.r !== 1 && d.r !== 2) return;
        out[id] = d.r === 2 ? 2 : 1; // a debuffer lives on these: count each like a strong race skill
      });
      return out;
    }
    Object.entries(raceSkills || {}).forEach(([id, L]) => {
      if (L < (minL || 0.1) || id[0] === "9") return;
      if (rarityOf && rarityOf(id) !== 1) return;
      out[id] = L;
    });
    return out;
  }

  const api = { SCENARIOS, FROM_COACH, TABS, weightsFor, rank, buildDeck, describeDeck, deckSkills, skillValue, entry, parentTargets, lateChainSkills, IT_RACES, IT_LATE_CHAIN, IT_INITIAL, IT_SP, IT_MANUAL, itEntry };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaTiers = api;
})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : globalThis);
