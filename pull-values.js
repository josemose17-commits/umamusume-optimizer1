// What each pull is worth to you, for the pull planner (pull-planner.js), by these rules:
//  - Your future teams count as yours already (you'll have them), so no carats go to them.
//  - Your decks now: for every cup ahead and every uma of the team for its track, her best
//    racing deck from the cards you own, the way CM & decks builds it (Euophrys' scoring plus the
//    race's skill values for her style, with a friend's card).
//  - You pull 200 (one spark) or 400 (two sparks) on a banner. A featured card counts in a deck
//    only when it's clearly stronger than the card it would replace, with the other five fixed
//    (the "Which cards would improve it?" test, at the limit break your copies reach): by at least
//    minPct. And only when that happens in at least minCups different cups after its banner: a
//    card you'd use once isn't worth pulling for. A banner is worth the expected sum of those
//    gains over what the pulls give you (the sparks chosen after seeing the pulls), in the deck
//    score's points (1 L of race skills = 60).
//  - Selectors at each anniversary (JP's campaigns, on Global's calendar): the free support
//    selector and the $20.99 ones (support and Uma, each with 1,500 carats). A pick is one copy
//    of a card (or an uma) from the pool, worth the same as a pulled one.
//  - Trainees, when they count as parents: Parent 1 for your team umas (yours to train; Parent 2
//    is a friend's rental). Her sparks fire at their base chance × (1 + her affinity with the
//    ace / 100) at each of the ace's two inspirations (family.js). Built for the ace, she carries
//    the ace's top 3 race whites at 2★ (6%) and her inherited unique at 2★ (10%); she counts
//    where that beats your best Parent 1 by minPct, in minCups cups, in the same points.
(function (root) {
  "use strict";
  const GROUPS = {
    sm: { label: "Sprint & Mile", builds: ["sprint", "mile"] },
    ml: { label: "Medium & Long", builds: ["medium", "long"] },
    dirt: { label: "Dirt", builds: ["dirt"] },
  };
  const groupOf = (p) => Object.keys(GROUPS).find((g) => GROUPS[g].builds.indexOf(p.build) !== -1) || null;
  const WHITE_2 = 0.06, GREEN_2 = 0.1, TOP_WHITES = 3, STAT_PER_L = 60, SHORTLIST = 12, BORROW_SHORT = 6;
  // A selector's pool: the gacha SSRs (or 3★ umas) JP had this many days before its anniversary.
  // uma.guide: JP's 2nd Anniversary support selector went up to the cards of 2022-12-29 (57 days
  // before) and left out those of 2023-01-20 (35 days before).
  const POOL_LAG = 45;
  const SELECTOR_CARATS = 1500, SELECTOR_PRICE = 20.99;
  const SELECT_SHORT = 8, UMA_SHORT = 10, MAX_USEFUL = 4;
  const twice = (base, aff) => { const p = Math.min(1, base * (1 + Math.max(0, aff || 0) / 100)); return 1 - (1 - p) * (1 - p); };
  const lbOf = (copies) => Math.min(4, copies - 1);
  const DAY = 864e5;
  const addDays = (d, n) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
  // Copies from n pulls at rate r: [P(0), …, P(4), P(5 or more)].
  function binom(n, r) {
    const out = [0, 0, 0, 0, 0, 0];
    let pmf = Math.pow(1 - r, n), cum = 0;
    for (let j = 0; j < 5; j++) { out[j] = pmf; cum += pmf; pmf *= ((n - j) / (j + 1)) * (r / (1 - r)); }
    out[5] = Math.max(0, 1 - cum);
    return out;
  }
  const median = (dist) => { let c = 0; for (let i = 0; i < dist.length; i++) { c += dist[i]; if (c >= 0.5) return i; } return dist.length - 1; };

  // GameTora's scenario ids → the scenario Global trains in from its start: Euophrys' own preset
  // (key), or an estimate on a base preset with the scenario's friend card as its link (Euophrys
  // has no preset for it). Names as Global's banners give them.
  const ERAS = {
    4: { name: "Grand Concert", key: "GL" },
    5: { name: "Grand Masters", key: "GM" },
    6: { name: "Project L'Arc", base: "GM" },
    7: { name: "U.A.F. Ready GO!", base: "GM" },
    8: { name: "Great Food Festival", base: "GM" },
    9: { name: "Hashire! Mecha Umamusume", base: "GM" },
    10: { name: "The Twinkle Legends", base: "GM" },
    11: { name: "Design Your Island", key: "DYI", jp: true },
    12: { name: "Paradise ♪ Yukoma Hot Springs", base: "DYI" },
    13: { name: "Beyond Dreams", base: "DYI" },
    14: { name: "Order Up! Tracen Ramen!", base: "DYI" },
  };
  const NOW_ERA = 4; // Global's scenario before the forecast's first
  // Parents: an aptitude raised to A on the race counts like 1 L (family.js's stand-in), from a
  // 2★ pink spark (3% base). Ranks for picking a rotating uma.
  const PINK_2 = 0.03, APT_L = 1;
  const RANK = { S: 8, A: 7, B: 6, C: 5, D: 4, E: 3, F: 2, G: 1 };
  const DIST_IX = { Sprint: 2, Mile: 3, Medium: 4, Long: 5 }, STYLE_IX = { Nige: 6, Senkou: 7, Sasi: 8, Oikomi: 9 };
  const STYLES = ["Senkou", "Sasi", "Oikomi", "Nige"];
  const EVENT_DAYS = 14; // a story event's SSR is yours (to LB4) by the end of its event
  const needsOf = (cup, style) => [cup.course.surface === "Dirt" ? 1 : 0, DIST_IX[cup.course.dist], STYLE_IX[style]].filter((i) => i != null);

  // o: { D, T, A, B (data/banners.js), P (data/presets.js), today, until, teams: { sm|ml|dirt:
  //      [{ id, style, rotate }] (rotate: a flex slot, a fresh uma of yours each cup; its id, if
  //      any, is an uma you'll have) }, owned: { cardId: lb }, umas: Set of trainee ids you own,
  //      yours: Map(trainee id → date) (umas your plan gets, from then), lockedPicks: Map(selector
  //      id → trainee or card id) (selector picks you've decided), minCups (2), minPct (0.1), parents (true), fade (share
  //      of value lost a year ahead, 0), selectors: { free, paid, uma } (all true),
  //      locked: Map(banner id → { level, free, target }) (banners you'll pull no matter what, at
  //      that level, with that banner's free pulls and the card you'd spark when nothing else
  //      helps), freePulls: Map(banner id → free pulls on it, locked or not), freeCards (true: story events' SSRs are yours to
  //      LB4 by their event's end), eras (true: each cup's decks in the scenario of its date),
  //      reuse (an earlier result of create() with the same cards, teams and deck settings),
  //      deckOpts(cup, style, traineeId, scenario) → tiers.js options for her racing deck there,
  //      whites(cup, style) → the ace's race white skills' L values, skillL(cup, style, id) → L }
  // Use: buildPair(pair) for every pair, then addSelectors(), then scorePair(pair) for every pair
  // (or prepare() for the last two), then route() (or the planner with value() and commit()).
  function create(o) {
    const { D, T, A, B } = o;
    const card = (id) => D.card(id);
    const trainee = (id) => D.trainee(id);
    const spark = (B.meta && B.meta.spark) || 200;
    const minCups = Math.max(1, o.minCups != null ? +o.minCups : 2);
    const minPct = Math.max(0, o.minPct != null ? +o.minPct : 0.1);
    const parentsOn = o.parents !== false;
    const fade = Math.min(0.9, Math.max(0, +o.fade || 0));
    const sel = Object.assign({ free: true, paid: true, uma: true }, o.selectors || {});
    const locked = o.locked || new Map();
    const relC = (B.release && B.release.cards) || {};
    const scorable = (id) => !!T.entry(id, 4);
    const today = o.today, until = o.until;
    // Running or ahead: a forecast banner whose estimated start just passed is still to come.
    const twoWeeksAgo = addDays(today, -14);
    // o.done: items you've pulled on or picked already (their keys: "s"/"t" + banner id, "x" +
    // selector id): they're behind you, so they're out of the planning.
    const done = o.done || new Set();
    const later = (b, k) => !done.has(k + b.id) && (locked.has(b.id) || ((b.end ? b.end >= today : b.start >= twoWeeksAgo) && b.start <= until));
    const dateOf = (b) => (b.start < today ? today : b.start);
    // A gain a year ahead counts (1 - fade) as much (forecast uncertainty, newer cards).
    const weight = (date) => (fade ? Math.pow(1 - fade, Math.max(0, (Date.parse(date) - Date.parse(today)) / (365.25 * DAY))) : 1);

    // ---- the scenario each cup's decks are trained in ----
    // Its preset in tiers.js: Euophrys' own, Design Your Island from Euophrys' JP bundle, or an
    // estimate: the base preset with the scenario's friend (or group) SSR from its opening banner
    // as the link card, at Design Your Island's link bonus (Euophrys' value for Tucker Bryne).
    const eraList = [{ id: NOW_ERA, start: "0000-00-00" }].concat((B.scenarios || []).filter((s) => ERAS[s.id]));
    const dyiBonus = 1000;
    const eras = new Map();
    eraList.forEach((s) => {
      const E = ERAS[s.id], era = { id: s.id, name: E.name, start: s.start === "0000-00-00" ? null : s.start, est: !E.key, key: E.key || "EST" + s.id, link: null };
      if (o.eras !== false) {
        if (E.key && !T.hasScenario(E.key)) T.addScenario(E.key, E.key, { bondPerDay: 10 });
        if (!E.key) {
          const open = B.support.find((b) => b.start && Math.abs(Date.parse(b.start) - Date.parse(s.start)) <= 3 * DAY
            && b.pick.some(([id]) => { const c = card(id); return c && c.r === 3 && (c.ty === "friend" || c.ty === "group") && scorable(id); }));
          const linkId = open ? open.pick.map(([id]) => id).find((id) => { const c = card(id); return c && c.r === 3 && (c.ty === "friend" || c.ty === "group") && scorable(id); }) : null;
          era.link = linkId || null;
          T.addScenario(era.key, E.base, { bondPerDay: 10, scenarioLink: linkId ? [T.entry(linkId, 4).char_name] : [], scenarioBonus: linkId ? dyiBonus : 0 });
        }
      }
      eras.set(s.id, era);
    });
    const eraAt = (date) => { let e = eras.get(NOW_ERA); eraList.forEach((s) => { if (s.start <= date && eras.has(s.id)) e = eras.get(s.id); }); return e; };

    // Your umas and when each is yours: My umas now; o.yours (the umas your plan gets: a trainee
    // banner of it, a selector pick) from then; and your team umas (a flex slot's named uma
    // included) from when they're out on Global if nothing says sooner: you'll have them.
    const relT = (B.release && B.release.trainees) || {};
    const yours = new Map();
    const setYours = (id, d) => { id = +id; if (!trainee(id)) return; d = !d || d < today ? today : d; if (!yours.has(id) || d < yours.get(id)) yours.set(id, d); };
    [...(o.umas || [])].forEach((id) => setYours(id, today));
    (o.yours || new Map()).forEach((d, id) => setYours(id, d));
    const team = new Set();
    Object.values(o.teams || {}).forEach((list) => (list || []).forEach((m) => { if (m && m.id && trainee(m.id)) team.add(+m.id); }));
    team.forEach((id) => { if (!yours.has(id)) { const t = trainee(id); setYours(id, t.en || relT[id] || today); } });
    const yoursBy = (id, date) => yours.has(+id) && yours.get(+id) < date;
    const umas = new Set(yours.keys());

    // A flex slot: each cup, the uma of yours that fits it best (A or better on its surface,
    // distance and her best running style), a different one from the cup before when another
    // fits as well. The umas racing that cup already (and their characters) are out. A fixed uma
    // you won't have yet by a cup leaves her slot flex there.
    function fitFor(t, cup) {
      const surf = cup.course.surface === "Dirt" ? 1 : 0, dist = DIST_IX[cup.course.dist];
      let best = null;
      STYLES.forEach((st) => { const g = RANK[t.apt[STYLE_IX[st]]] || 0; if (!best || g > best.g) best = { st, g }; });
      const s = RANK[t.apt[surf]] || 0, d = RANK[t.apt[dist]] || 0;
      return { style: best.st, good: s >= 7 && d >= 7 && best.g >= 7, score: Math.min(s, d, best.g) * 100 + s + d + best.g };
    }
    const lastRotated = {}; // group:slot → the uma rotated in last
    const rotateFor = (cup, key, used) => {
      const list = [...yours.keys()].filter((id) => yoursBy(id, cup.global.start)).map((id) => trainee(id)).filter((t) => t && !used.has(t.cid))
        .map((t) => Object.assign({ t }, fitFor(t, cup)))
        .sort((a, b) => (b.good - a.good) || ((a.t.id === lastRotated[key]) - (b.t.id === lastRotated[key])) || (b.score - a.score) || (a.t.id - b.t.id));
      const pick = list[0];
      if (!pick || !pick.good) return null;
      lastRotated[key] = pick.t.id;
      return pick;
    };

    // The cups ahead with the team for their track: one pair per cup and team uma.
    const cups = o.P.list.filter((p) => p.global.start > today && p.global.start <= until && groupOf(p))
      .sort((a, b) => (a.global.start < b.global.start ? -1 : 1));
    const pairs = [], unrotated = [];
    cups.forEach((cup) => {
      const g = groupOf(cup), list = o.teams[g] || [], date = cup.global.start, era = eraAt(date);
      const fixedNow = (m) => m && m.id && !m.rotate && yoursBy(m.id, date);
      const used = new Set(list.filter(fixedNow).map((m) => trainee(m.id).cid));
      list.forEach((m, slot) => {
        if (!m || (!m.id && !m.rotate)) return;
        let t, member = m, rotating = false;
        if (fixedNow(m)) t = trainee(m.id);
        else {
          const r = rotateFor(cup, g + ":" + slot, used);
          if (!r) { unrotated.push({ cup, slot, waiting: !m.rotate ? +m.id : null }); return; }
          t = r.t; member = { id: r.t.id, style: r.style, rotate: true, waiting: !m.rotate ? +m.id : null }; rotating = true;
          used.add(t.cid);
        }
        pairs.push({ key: [cup.id, slot, t.id, member.style, era.key].join(":"), cup, date, group: g, slot, member, trainee: t, rotating, era });
      });
    });

    // The banners: one item per banner, 200 pulls (level 1) or 400 (level 2). A locked banner is
    // taken first at its level, its free pulls used first; one with no card Euophrys can score
    // still gets its carats set aside.
    const items = [], unscorable = [];
    // freePulls: Map(banner id → pulls that come free on it), locked or not.
    const freePulls = o.freePulls || new Map();
    const lock = (it) => {
      if (freePulls.has(it.banner.id)) it.free = +freePulls.get(it.banner.id) || 0;
      const L = locked.get(it.banner.id);
      // Locked at that level exactly: the route doesn't take it further (your plan is fixed).
      if (L) { it.required = L.level || 2; it.most = it.required; it.free = +L.free || it.free || 0; it.locked = true; it.target = L.target || null; }
      return it;
    };
    B.support.filter((b) => later(b, "s")).forEach((b) => {
      const feat = [];
      b.pick.forEach(([id, rate]) => {
        if (!card(id)) return;
        if (!scorable(id)) { unscorable.push({ banner: b, id }); return; }
        feat.push({ id, rate });
      });
      if (feat.length || locked.has(b.id)) items.push(lock({ key: "s" + b.id, kind: "support", banner: b, date: dateOf(b), feat, most: 2, pullsAt: (k) => spark * k, blind: !feat.length }));
    });
    if (parentsOn) B.trainee.filter((b) => later(b, "t")).forEach((b) => {
      // Umas you'll have anyway (your team, your plan's) aren't what these pulls are worth; a
      // locked banner of yours for one of them just sets its carats aside.
      const feat = b.pick.filter(([id]) => trainee(id) && !umas.has(id)).map(([id, rate]) => ({ id, rate }));
      const mine = b.pick.map(([id]) => id).filter((id) => umas.has(id));
      if (feat.length || locked.has(b.id)) items.push(lock({ key: "t" + b.id, kind: "trainee", banner: b, date: dateOf(b), feat, mine, most: Math.max(1, Math.min(2, feat.length)), pullsAt: (k) => spark * k, blind: !feat.length }));
    });
    const byKey = new Map(items.map((it) => [it.key, it]));
    // The story events' free SSRs, yours to LB4 by the end of their event.
    const freeCards = new Map(); // card id → the date you have it by
    if (o.freeCards !== false) (B.storyEvents || []).forEach((e) => {
      const by = addDays(e.start, EVENT_DAYS);
      if (e.start > today) e.cards.forEach((id) => { if (card(id) && scorable(id) && (!freeCards.has(id) || by < freeCards.get(id))) freeCards.set(id, by); });
    });

    // The selectors ahead, and the carats the $20.99 packs bring.
    const selectors = [];
    (B.events || []).filter((e) => e.start > today && e.start <= until).forEach((e) => {
      const cut = addDays(e.jp, -POOL_LAG);
      const add = (id, kind, label, price) => { if (!done.has("x" + e.id + "-" + id)) selectors.push({ id: e.id + "-" + id, event: e, date: e.start, kind, cut, label, price, carats: price ? SELECTOR_CARATS : 0 }); };
      if (sel.free) add("free", "support", "Free support selector", 0);
      if (sel.paid) add("paid", "support", "$20.99 support selector", SELECTOR_PRICE);
      if (sel.uma) add("uma", "trainee", "$20.99 Uma selector", SELECTOR_PRICE);
    });
    const bonus = selectors.filter((s) => s.carats).map((s) => ({ date: s.date, carats: s.carats, label: s.label }));
    const inSupportPool = (c, cut) => c.r === 3 && c.src === "gacha" && !!c.jp && c.jp <= cut && scorable(c.id);

    // ---- the route so far ----
    // key → { k, copies: Map(card → new copies), got: Set(trainee), spark: [ids], notes: [] }
    const committed = new Map();
    const memo = new Map(); // cleared with every commit
    const copiesBy = (id, date, skipKey) => {
      if (freeCards.has(id) && freeCards.get(id) < date) return 5;
      let n = o.owned[id] != null ? +o.owned[id] + 1 : 0;
      committed.forEach((x, key) => { if (key !== skipKey && x.copies && byKey.get(key).date < date) n += x.copies.get(id) || 0; });
      return Math.min(5, n);
    };
    // Cards worth checking in each deck, from the date you could have them (their banner or a
    // selector).
    const candFrom = new Map();
    const addCand = (id, date) => { if (!candFrom.has(id) || date < candFrom.get(id)) candFrom.set(id, date); };
    items.forEach((it) => { if (it.kind === "support") it.feat.forEach((f) => addCand(f.id, it.date)); });
    const cardOut = (c, date) => !!((c.en && c.en <= date) || (relC[c.id] && relC[c.id] <= date) || (candFrom.has(c.id) && candFrom.get(c.id) < date));

    // ---- decks ----
    const poolFor = (pair) => {
      const ids = new Set(Object.keys(o.owned).map(Number));
      freeCards.forEach((by, id) => { if (by < pair.date) ids.add(id); });
      committed.forEach((x, key) => { if (x.copies && byKey.get(key).date < pair.date) x.copies.forEach((n, id) => { if (n > 0) ids.add(id); }); });
      const pool = [];
      ids.forEach((id) => { const n = copiesBy(id, pair.date); if (card(id) && n > 0 && scorable(id)) pool.push({ id, lb: lbOf(n) }); });
      return pool;
    };
    const borrowFor = (pair) => D.DATA.supports.filter((c) => c.r === 3 && cardOut(c, pair.date) && scorable(c.id)).map((c) => ({ id: c.id, lb: 4 }));
    // Each type's best few alone, so the deck search stays quick (the rest rarely make a deck).
    function shortlist(opts, pool, n) {
      const by = {};
      pool.forEach((c) => { const ty = card(c.id).ty; (by[ty] = by[ty] || []).push(c); });
      return Object.keys(by).flatMap((ty) => T.rank(opts, ty, [], by[ty]).slice(0, n || SHORTLIST).map((r) => ({ id: r.id, lb: r.lb })));
    }
    const comp = (pair) => pair.opts.comp || {};
    // Types that may fill a slot of rest (a deck missing one card) and keep the deck makeup.
    function openType(pair, rest) {
      const cp = comp(pair), n = {};
      rest.forEach((c) => { const t = card(c.id).ty; n[t] = (n[t] || 0) + 1; });
      let need = 0;
      Object.keys(cp).forEach((t) => { need += Math.max(0, cp[t] - (n[t] || 0)); });
      const left = 6 - rest.length;
      return (ty) => (cp[ty] != null ? (n[ty] || 0) < cp[ty] : left - 1 >= need);
    }
    // Each card's value with the other five fixed.
    // types: rescore only the cards of these types (those a change in the deck competes with).
    function slotScores(pair, types) {
      pair.deck.forEach((c, i) => {
        if (types && !types.has(card(c.id).ty)) return;
        const rest = pair.deck.filter((_, j) => j !== i);
        const r = T.rank(pair.opts, card(c.id).ty, rest, [{ id: c.id, lb: c.lb }])[0];
        c.score = r ? r.score : 0;
      });
    }
    // The friend's card you'd borrow instead if you owned the one you borrow now (keep: the same
    // card as before, rescored, while the friend's slot hasn't changed).
    function altBorrow(pair, keep) {
      const bi = pair.deck.findIndex((c) => c.borrowed);
      if (keep && pair.alt && bi >= 0) {
        const rest = pair.deck.filter((_, i) => i !== bi), r = T.rank(pair.opts, card(pair.alt.id).ty, rest, [{ id: pair.alt.id, lb: pair.alt.lb }])[0];
        if (r) { pair.alt.score = r.score; pair.altLoss = Math.max(0, pair.deck[bi].score - r.score); return; }
      }
      pair.alt = null;
      pair.altLoss = 0;
      if (bi < 0 || !pair.borrowShort) return;
      const b = pair.deck[bi], bCid = card(b.id).cid;
      const rest = pair.deck.filter((_, i) => i !== bi), open = openType(pair, rest);
      const byTy = {};
      pair.borrowShort.forEach((c) => { const cc = card(c.id); if (cc.cid !== bCid && open(cc.ty)) (byTy[cc.ty] = byTy[cc.ty] || []).push(c); });
      let best = null;
      Object.keys(byTy).forEach((ty) => { const r = T.rank(pair.opts, ty, rest, byTy[ty])[0]; if (r && (!best || r.score > best.score)) best = r; });
      if (best) { pair.alt = { id: best.id, lb: best.lb, borrowed: true, score: best.score }; pair.altLoss = Math.max(0, b.score - best.score); }
    }
    // o.reuse: an earlier run with the same cards, teams and deck settings, whose decks hold.
    const reuse = o.reuse ? new Map(o.reuse.pairs.filter((p) => p.base).map((p) => [p.key, p])) : null;
    function buildPair(pair) {
      pair.opts = o.deckOpts(pair.cup, pair.member.style, pair.trainee.id, o.eras !== false ? pair.era.key : null);
      const old = reuse && reuse.get(pair.key);
      if (old) {
        pair.deck = old.base.map((c) => Object.assign({}, c));
        pair.base = old.base.map((c) => Object.assign({}, c));
        pair.borrowShort = old.borrowShort;
        pair.error = null;
        altBorrow(pair);
        return;
      }
      try {
        pair.borrowShort = shortlist(pair.opts, borrowFor(pair), BORROW_SHORT);
        const r = T.buildDeck(pair.opts, shortlist(pair.opts, poolFor(pair)), pair.borrowShort);
        pair.deck = r.cards.map((c) => ({ id: c.id, lb: c.lb, borrowed: !!c.borrowed, score: 0 }));
        pair.error = null;
      } catch (err) { pair.deck = null; pair.error = err.message || String(err); }
      if (!pair.deck) return;
      slotScores(pair);
      altBorrow(pair);
      pair.base = pair.deck.map((c) => Object.assign({}, c));
    }

    // ---- what a card adds to a deck ----
    // The swap test for candidates [{id, lb}] in a pair's deck now: in the weakest slot of the
    // same type, and in her weakest slot for any type when the makeup allows it (a copy already in
    // the deck is upgraded where it sits; at: card → the one slot to try). A card you borrow now
    // is tried as yours with the next-best friend's card. Keeps each candidate's best:
    // gains "id:lb" → { gain, base (the replaced card's score), slot, via (frees the friend slot) }.
    function evaluate(pair, list, at) {
      if (!list.length) return;
      const bi = pair.deck.findIndex((x) => x.borrowed), b = bi >= 0 ? pair.deck[bi] : null, bCid = b ? card(b.id).cid : null;
      const owned = pair.deck.map((c, j) => ({ c, j })).filter((x) => !x.c.borrowed);
      const weak = owned.slice().sort((a, c) => a.c.score - c.c.score)[0];
      const cp = comp(pair);
      const groups = {};
      list.forEach((c) => {
        const cc = card(c.id), via = !!(b && cc.cid === bCid);
        if (via && !pair.alt) return;
        const k = cc.ty + "|" + (via ? 1 : 0);
        (groups[k] = groups[k] || []).push(c);
      });
      const put = (r, j, base, extra, via) => {
        const g = r.score - base - extra, k = r.id + ":" + r.lb, cur = pair.gains.get(k);
        if (g > 1e-9 && (!cur || g > cur.gain)) pair.gains.set(k, { gain: g, base, slot: j, via, score: r.score });
      };
      Object.keys(groups).forEach((k) => {
        const [ty, v] = k.split("|"), via = v === "1", cands = groups[k], extra = via ? pair.altLoss : 0;
        const run = (j, cs) => {
          if (!cs.length) return;
          let rest = pair.deck.filter((_, i) => i !== j);
          if (via) rest = rest.filter((x) => !x.borrowed).concat([pair.alt]);
          T.rank(pair.opts, ty, rest, cs).forEach((r) => put(r, j, pair.deck[j].score, extra, via));
        };
        const bySlot = new Map(), free = [];
        cands.forEach((c) => {
          const j = at && at.has(c.id) ? at.get(c.id) : pair.deck.findIndex((x) => !x.borrowed && x.id === c.id);
          if (j >= 0) { if (!bySlot.has(j)) bySlot.set(j, []); bySlot.get(j).push(c); } else if (!at) free.push(c);
        });
        bySlot.forEach((cs, j) => run(j, cs));
        if (!free.length) return;
        const same = owned.filter((x) => card(x.c.id).ty === ty).sort((a, c) => a.c.score - c.c.score)[0];
        if (same) run(same.j, free);
        const wty = weak ? card(weak.c.id).ty : null;
        if (weak && wty !== ty && cp[ty] == null && cp[wty] == null) run(weak.j, free);
      });
    }
    // The limit breaks above what you'd have there, for cards you could have by the cup.
    function candidates(pair, only) {
      const out = [];
      candFrom.forEach((from, id) => {
        if (from >= pair.date || (only && !only.has(id))) return;
        const have = copiesBy(id, pair.date);
        for (let lb = have > 0 ? lbOf(have) + 1 : 0; lb <= 4; lb++) out.push({ id, lb });
      });
      return out;
    }
    // Every candidate at its last limit break, then the lower ones of those that clear the bar
    // there (a card that isn't clearly stronger at LB4 isn't at LB0 either). Rescoring (ids: as
    // the route fills a deck) redoes only the cards it names and keeps to the ones that cleared
    // the bar the first time: decks only get stronger.
    function scorePair(pair, ids) {
      const first = !ids;
      if (first || !pair.gains) pair.gains = new Map();
      if (!pair.deck) return;
      if (!first) {
        if (!ids.size) return;
        [...pair.gains.keys()].forEach((k) => { if (ids.has(+k.split(":")[0])) pair.gains.delete(k); });
      }
      const all = candidates(pair, ids), top = all.filter((c) => c.lb === 4);
      evaluate(pair, top);
      const clear = new Set(), at = new Map();
      top.forEach((c) => { const g = pair.gains.get(c.id + ":4"); if (g && g.gain >= minPct * g.base - 1e-9) { clear.add(c.id); at.set(c.id, g.slot); } });
      if (first) { pair.live = clear; pair.first = new Map(pair.gains); }
      evaluate(pair, all.filter((c) => c.lb < 4 && clear.has(c.id)), at);
    }
    // After a card goes into slot j: the cards it competes with (its type and the replaced
    // card's, the friend's card, anything whose best spot was slot j or the friend's slot).
    function rescore(pair, j, types) {
      if (!pair.live || !pair.live.size) return;
      const bi = pair.deck.findIndex((x) => x.borrowed), bCid = bi >= 0 ? card(pair.deck[bi].id).cid : null;
      const ids = new Set();
      pair.live.forEach((id) => {
        const c = card(id);
        if (types.has(c.ty) || c.cid === bCid) { ids.add(id); return; }
        for (let lb = 0; lb <= 4; lb++) { const g = pair.gains.get(id + ":" + lb); if (g && (g.slot === j || g.via)) { ids.add(id); return; } }
      });
      scorePair(pair, ids);
    }
    // The best spot for a card at a limit break in a pair's deck now (an owned copy is upgraded
    // where it sits).
    function bestSpot(pair, id, lb) {
      const save = pair.gains;
      pair.gains = new Map();
      evaluate(pair, [{ id, lb }]);
      const g = pair.gains.get(id + ":" + lb) || null;
      pair.gains = save;
      return g;
    }
    // Puts new copies of a card into the decks they improve (from date on) and rescores those.
    // side: the copies came with the pulls for another card (not the spark's target).
    function placeCard(id, date, notes, side) {
      pairs.forEach((pair) => {
        if (!pair.deck || pair.date <= date) return;
        const have = copiesBy(id, pair.date);
        if (have <= 0) return;
        for (let l = 0; l <= lbOf(have); l++) pair.gains.delete(id + ":" + l);
        const lb = lbOf(have), at = pair.deck.findIndex((x) => !x.borrowed && x.id === id);
        if (at !== -1 && pair.deck[at].lb >= lb) return;
        // A card that didn't help this deck even at LB4 before the route can't now (decks only
        // get stronger): no need to try it (unless it's in the deck already).
        if (at === -1 && pair.first && !pair.first.has(id + ":4") && !(pair.live && pair.live.has(id)) && !pair.deck.some((x) => x.id === id)) return;
        const s = bestSpot(pair, id, lb);
        if (!s) return;
        const replaced = pair.deck[s.slot], types = new Set([card(id).ty, card(replaced.id).ty]);
        if (s.via) {
          const bi = pair.deck.findIndex((x) => x.borrowed);
          types.add(card(pair.deck[bi].id).ty).add(card(pair.alt.id).ty);
          pair.deck[bi] = Object.assign({}, pair.alt);
        }
        pair.deck[s.slot] = { id, lb, borrowed: false, score: s.score };
        if (notes) notes.push({ pair, id, lb, gain: s.gain, pct: s.base > 0 ? s.gain / s.base : 0, replaced: replaced.id === id ? null : replaced.id, upgrade: replaced.id === id, clear: s.gain >= minPct * s.base - 1e-9, side: !!side });
        slotScores(pair);
        altBorrow(pair, !s.via);
        rescore(pair, s.slot, types);
      });
    }

    // ---- a card's worth: its clear gains, in enough cups ----
    // rows[n] for n new copies (0–5) from an item dated `date`: the clear gains over the pairs
    // after it, and their value (0 unless they're in minCups different cups).
    function cardRows(id, date, skipKey) {
      if (skipKey && !committed.has(skipKey)) skipKey = null; // nothing of it to leave out yet
      const mk = "c|" + id + "|" + date + "|" + (skipKey || "");
      if (memo.has(mk)) return memo.get(mk);
      const rows = [];
      for (let n = 0; n <= 5; n++) rows.push({ gain: 0, faded: 0, cups: new Set(), decks: [] });
      pairs.forEach((pair) => {
        if (!pair.gains || pair.date <= date) return;
        const have = copiesBy(id, pair.date, skipKey), w = weight(pair.date);
        for (let n = 1; n <= 5 && have < 5; n++) {
          const lb = lbOf(Math.min(5, have + n)), g = pair.gains.get(id + ":" + lb);
          if (g && g.gain >= minPct * g.base - 1e-9) { rows[n].gain += g.gain; rows[n].faded += g.gain * w; rows[n].cups.add(pair.cup.id); rows[n].decks.push({ pair, lb, gain: g.gain, pct: g.gain / g.base }); }
        }
      });
      // The rules on the gains as they are; the value with far-off cups faded.
      const out = rows.map((r) => ({ value: r.cups.size >= minCups ? r.faded : 0, gain: r.gain, cups: r.cups.size, decks: r.decks }));
      memo.set(mk, out);
      return out;
    }
    // The best use of k sparks after the pulls (rand: copies pulled of each useful card).
    function sparksFor(use, rand, k) {
      const val = (i, c) => use[i].rows[Math.min(5, c)].value;
      let base = 0;
      use.forEach((x, i) => { base += val(i, rand[i]); });
      let best = { v: base, to: [] };
      for (let i = 0; i < use.length && k >= 1; i++) {
        const v1 = base - val(i, rand[i]) + val(i, rand[i] + 1);
        if (k === 1) { if (v1 > best.v + 1e-9) best = { v: v1, to: [i] }; continue; }
        for (let j = i; j < use.length; j++) {
          const v2 = j === i ? base - val(i, rand[i]) + val(i, rand[i] + 2) : v1 - val(j, rand[j]) + val(j, rand[j] + 1);
          if (v2 > best.v + 1e-9) best = { v: v2, to: j === i ? [i, i] : [i, j] };
        }
      }
      return best;
    }
    // A support banner at k sparks: the expected value over the copies the pulls give, when its
    // likely result (each card's median copies, the sparks where they add most) clears your rules
    // (a pull that likely leaves the card out of your decks isn't one you'd make).
    function supportPlan(it, k) {
      const mk = "s|" + it.key + "|" + k;
      if (memo.has(mk)) return memo.get(mk);
      const n = spark * k;
      const tabs = it.feat.map((f) => ({ f, rows: cardRows(f.id, it.date, it.key), dist: binom(n, f.rate) }));
      const use = tabs.filter((x) => x.rows.some((r) => r.value > 0))
        .sort((a, b) => Math.max(...b.rows.map((r) => r.value)) - Math.max(...a.rows.map((r) => r.value))).slice(0, MAX_USEFUL);
      const likely = use.length ? sparksFor(use, use.map((u) => median(u.dist)), k) : { v: 0, to: [] };
      let value = 0;
      if (likely.v > 1e-9) {
        const rand = new Array(use.length).fill(0);
        const rec = (i, p) => {
          if (i === use.length) { value += p * sparksFor(use, rand, k).v; return; }
          const d = use[i].dist;
          for (let c = 0; c <= 5; c++) { if (d[c] < 1e-7) continue; rand[i] = c; rec(i + 1, p * d[c]); }
        };
        rec(0, 1);
      }
      const out = { value, tabs, use, n, likely };
      memo.set(mk, out);
      return out;
    }

    // ---- trainees: Parent 1 for your team umas ----
    const chars = [...new Set(D.DATA.trainees.map((t) => t.cid))];
    const affMemo = new Map();
    // Her own affinity as Parent 1 for the ace, with the friend's Parent 2 that suits them best.
    function parentAffinity(aceCid, cid) {
      const k = aceCid + ":" + cid;
      if (affMemo.has(k)) return affMemo.get(k);
      let best = -1, mine = 0;
      chars.forEach((c) => {
        if (c === aceCid || c === cid) return;
        const fam = A.together(aceCid, c) + A.together(cid, c);
        if (fam > best) { best = fam; mine = A.together(cid, c); }
      });
      const v = A.together(aceCid, cid) + mine;
      affMemo.set(k, v);
      return v;
    }
    const whitesMemo = new Map();
    const topWhites = (pair) => {
      const k = pair.cup.id + ":" + pair.member.style;
      if (!whitesMemo.has(k)) whitesMemo.set(k, (o.whites(pair.cup, pair.member.style) || []).slice().sort((a, b) => b - a).slice(0, TOP_WHITES));
      return whitesMemo.get(k);
    };
    const inheritedOf = (t) => (t && t.us && t.us.length ? "9" + String(t.us[0]).slice(1) : null);
    const pvMemo = new Map();
    // Her worth as Parent 1 for the pair's ace: the ace's top whites and her inherited unique at
    // 2★, and a 2★ pink spark where the ace lacks an A on the race (surface, distance, style) and
    // she has it (one pink spark a parent), all at her affinity with the ace. Blue sparks are left
    // out: any parent can carry them, so they don't make one trainee worth more than another.
    function parentValue(pair, t) {
      if (!t || t.cid === pair.trainee.cid || pair.rotating) return 0;
      const mk = pair.key + "|" + t.id;
      if (pvMemo.has(mk)) return pvMemo.get(mk);
      const aff = parentAffinity(pair.trainee.cid, t.cid);
      const whites = topWhites(pair).reduce((a, L) => a + L * twice(WHITE_2, aff), 0);
      const g = inheritedOf(t), gL = g ? Math.max(0, o.skillL(pair.cup, pair.member.style, g) || 0) : 0;
      const ace = pair.trainee.apt || [], pink = needsOf(pair.cup, pair.member.style).some((i) => (RANK[ace[i]] || 0) < 7 && (RANK[(t.apt || [])[i]] || 0) >= 7);
      const v = STAT_PER_L * (whites + gL * twice(GREEN_2, aff) + (pink ? APT_L * twice(PINK_2, aff) : 0));
      pvMemo.set(mk, v);
      return v;
    }
    // Your best Parent 1 for the pair: your umas (your teams included) and the route's trainees.
    function bestParent(pair, skipKey) {
      const mk = "p|" + pair.key + "|" + (skipKey || "");
      if (memo.has(mk)) return memo.get(mk);
      let best = 0;
      const see = (id) => { best = Math.max(best, parentValue(pair, trainee(id))); };
      umas.forEach((id) => { if (yoursBy(id, pair.date)) see(id); });
      committed.forEach((x, key) => { if (key !== skipKey && x.got && byKey.get(key).date < pair.date) x.got.forEach(see); });
      memo.set(mk, best);
      return best;
    }
    // New trainees (ids) from an item dated `date`: the clear gains over your best Parent 1.
    function parentRows(ids, date, skipKey) {
      const mk = "t|" + ids.slice().sort().join(",") + "|" + date + "|" + (skipKey || "");
      if (memo.has(mk)) return memo.get(mk);
      let gain = 0, faded = 0;
      const cups = new Set(), decks = [];
      if (ids.length) pairs.forEach((pair) => {
        if (pair.date <= date || pair.rotating) return;
        const cur = bestParent(pair, skipKey);
        let best = 0, who = null;
        ids.forEach((id) => { const v = parentValue(pair, trainee(id)); if (v > best) { best = v; who = id; } });
        const g = best - cur;
        if (g > 1e-9 && g >= minPct * cur - 1e-9) { gain += g; faded += g * weight(pair.date); cups.add(pair.cup.id); decks.push({ pair, id: who, gain: g, pct: cur > 0 ? g / cur : null }); }
      });
      const out = { value: cups.size >= minCups ? faded : 0, gain, cups: cups.size, decks };
      memo.set(mk, out);
      return out;
    }
    // A trainee banner at k sparks: the expected value over who the pulls bring (one copy each
    // is enough), sparking the best of the rest.
    function traineePlan(it, k) {
      const mk = "tp|" + it.key + "|" + k;
      if (memo.has(mk)) return memo.get(mk);
      const n = spark * k;
      const feat = it.feat.map((f) => ({ id: f.id, q: 1 - Math.pow(1 - f.rate, n), solo: parentRows([f.id], it.date, it.key).gain }))
        .filter((f) => f.solo > 0).sort((a, b) => b.solo - a.solo).slice(0, MAX_USEFUL);
      const bestWith = (got, miss) => {
        let best = { v: parentRows(got, it.date, it.key).value, add: [] };
        const pick = (from, left, add) => {
          if (!left || !from.length) return;
          from.forEach((id, i) => {
            const a = add.concat([id]), v = parentRows(got.concat(a), it.date, it.key).value;
            if (v > best.v + 1e-9) best = { v, add: a };
            pick(from.slice(i + 1), left - 1, a);
          });
        };
        pick(miss, k, []);
        return best;
      };
      // Her likely result: the sparks on the ones worth most, and whoever the pulls likely bring.
      const sparked = feat.slice(0, k).map((f) => f.id);
      const got = [...new Set(sparked.concat(feat.filter((f) => f.q >= 0.5).map((f) => f.id)))];
      const likely = { v: got.length ? parentRows(got, it.date, it.key).value : 0, spark: sparked, got };
      let value = 0;
      if (likely.v > 1e-9) for (let mask = 0; mask < 1 << feat.length; mask++) {
        let p = 1;
        const hit = [], miss = [];
        feat.forEach((f, i) => { if (mask & (1 << i)) { p *= f.q; hit.push(f.id); } else { p *= 1 - f.q; miss.push(f.id); } });
        if (p < 1e-7) continue;
        value += p * bestWith(hit, miss).v;
      }
      const out = { value, feat, n, bestWith, likely };
      memo.set(mk, out);
      return out;
    }

    // ---- selectors: each one's shortlist of picks ----
    // Every deck's best few pool cards per type (at the copies you'd have) and the pool cards in
    // it now (one copy up, or yours instead of the friend's); every Uma selector's best parents.
    let selectorsAdded = false;
    function addSelectors() {
      if (selectorsAdded) return;
      selectorsAdded = true;
      const sup = selectors.filter((s) => s.kind === "support");
      if (sup.length) {
        const first = sup.reduce((a, s) => (s.date < a ? s.date : a), "9999-99-99");
        const lastCut = sup.reduce((a, s) => (s.cut > a ? s.cut : a), "");
        const pool = D.DATA.supports.filter((c) => inSupportPool(c, lastCut));
        const short = new Set(), ranked = new Set();
        pairs.forEach((pair) => {
          if (!pair.deck || pair.date <= first) return;
          // The pool is ranked in one deck a cup (its umas share the race; their decks' own
          // cards still join below), so this stays quick.
          const rank = !ranked.has(pair.cup.id);
          ranked.add(pair.cup.id);
          if (!rank) { pair.deck.forEach((c) => { if (inSupportPool(card(c.id), lastCut) && (c.borrowed || c.lb < 4)) short.add(c.id); }); return; }
          const owned = pair.deck.map((c, j) => ({ c, j })).filter((x) => !x.c.borrowed);
          const weak = owned.slice().sort((a, b) => a.c.score - b.c.score)[0];
          const rest = pair.deck.filter((_, i) => !weak || i !== weak.j);
          const byTy = {};
          pool.forEach((c) => { const have = copiesBy(c.id, pair.date); if (have < 5) (byTy[c.ty] = byTy[c.ty] || []).push({ id: c.id, lb: lbOf(have + 1) }); });
          Object.keys(byTy).forEach((ty) => T.rank(pair.opts, ty, rest, byTy[ty]).slice(0, SELECT_SHORT).forEach((r) => short.add(r.id)));
          pair.deck.forEach((c) => { if (inSupportPool(card(c.id), lastCut) && (c.borrowed || c.lb < 4)) short.add(c.id); });
        });
        sup.forEach((s) => short.forEach((id) => {
          if (!inSupportPool(card(id), s.cut)) return;
          const it = { key: "x" + s.id + ":" + id, kind: "selector", pick: "support", sel: s, id, date: s.date, group: "x" + s.id, most: 1, pullsAt: () => 0 };
          items.push(it);
          byKey.set(it.key, it);
          addCand(id, s.date);
        }));
      }
      if (parentsOn) selectors.filter((s) => s.kind === "trainee").forEach((s) => {
        D.DATA.trainees.filter((t) => t.r === 3 && t.jp && t.jp <= s.cut && !umas.has(t.id))
          .map((t) => ({ t, v: pairs.reduce((a, pair) => a + (pair.date > s.date ? Math.max(0, parentValue(pair, t) - bestParent(pair)) : 0), 0) }))
          .filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, UMA_SHORT).forEach(({ t }) => {
            const it = { key: "x" + s.id + ":" + t.id, kind: "selector", pick: "trainee", sel: s, id: t.id, date: s.date, group: "x" + s.id, most: 1, pullsAt: () => 0 };
            items.push(it);
            byKey.set(it.key, it);
          });
      });
      // Your own picks on a selector (o.lockedPicks: selector id → trainee or card id): taken
      // first, like a locked banner.
      (o.lockedPicks || new Map()).forEach((id, sid) => {
        const s = selectors.find((x) => x.id === sid);
        if (!s || !(s.kind === "trainee" ? trainee(id) : card(id))) return;
        const pick = s.kind === "trainee" ? "trainee" : "support", key = "x" + s.id + ":" + id;
        let it = byKey.get(key);
        if (!it) {
          it = { key, kind: "selector", pick, sel: s, id: +id, date: s.date, group: "x" + s.id, most: 1, pullsAt: () => 0 };
          items.push(it);
          byKey.set(key, it);
          if (pick === "support") addCand(+id, s.date);
        }
        it.required = true;
        it.locked = true;
      });
    }
    function prepare() {
      addSelectors();
      pairs.forEach((pair) => scorePair(pair));
    }
    // Every banner on one scale, before the route: what 200 and 400 pulls on it would add to your
    // decks (support cards) or as Parent 1 (trainees) on their own, in the same points.
    function standalone() {
      return items.filter((it) => it.kind !== "selector").map((it) => ({
        key: it.key, kind: it.kind, item: it, blind: !!it.blind, locked: !!it.locked,
        v1: it.blind ? 0 : value(it.key, 1), v2: it.blind || it.most < 2 ? 0 : value(it.key, 2),
      }));
    }
    // Your decks and their gains before the route (snapshot), and back to them (reset).
    function snapshot() {
      pairs.forEach((p) => {
        if (p.deck) p.snap = { deck: p.deck.map((c) => Object.assign({}, c)), gains: new Map(p.gains), live: new Set(p.live || []), alt: p.alt ? Object.assign({}, p.alt) : null, altLoss: p.altLoss };
      });
    }
    function reset() {
      committed.clear();
      memo.clear();
      items.forEach((it) => { delete it.pre; });
      pairs.forEach((p) => {
        if (!p.snap) return;
        p.deck = p.snap.deck.map((c) => Object.assign({}, c));
        p.gains = new Map(p.snap.gains);
        p.live = new Set(p.snap.live);
        p.alt = p.snap.alt ? Object.assign({}, p.snap.alt) : null;
        p.altLoss = p.snap.altLoss;
      });
    }
    // The route, in two passes. First the planner's step-by-step pass (free selector picks first,
    // then the pulls with the most points per carat). The free picks went first, so a later pull
    // can max a card a pick went to. So, second: back to your decks now, the same pulls in date
    // order, then the selector picks (and any pull the carats still allow) on top of them.
    // o: pull-planner.js options (today, carats, perMonth, tickets, pullCarats, spark).
    // step() runs one move (false when done); result(): { plan, gains (key → points it adds),
    // runners (a selector pick → the next best picks there) }.
    function route(PP, o) {
      const opts = (onStep) => Object.assign({}, o, { bonus: o.bonus || bonus, value: (key, k) => value(key, k), onStep });
      const gains = new Map(), runners = new Map();
      snapshot();
      let pass = 1, moves = 0, replay = null, sawPick = false, pullAfterPick = false;
      // The first pass keeps what each step adds, for when it's already in order (no pull came
      // after a selector pick, as when your locked banners take the carats): then it's the route.
      const note = (s) => {
        const it = byKey.get(s.key);
        if (it.kind === "selector") { sawPick = true; runners.set(s.key, alternatives(s.key, 3)); }
        else if (sawPick) pullAfterPick = true;
        if (s.required) gains.set(s.key, value(s.key, s.k));
        commit(s.key, s.k);
        if (!s.required) gains.set(s.key, (gains.get(s.key) || 0) + (s.dv || 0));
      };
      let pl = PP.planner(items, opts(note));
      function step() {
        if (pass === 1) {
          if (pl.step()) { moves++; return true; }
          if (!pullAfterPick) { pass = 4; return false; }
          gains.clear();
          runners.clear();
          replay = [...pl.result().chosen].filter(([key, k]) => k > 0 && byKey.get(key).kind !== "selector")
            .sort((a, b) => (byKey.get(a[0]).date < byKey.get(b[0]).date ? -1 : byKey.get(a[0]).date > byKey.get(b[0]).date ? 1 : 0));
          reset();
          pass = 2;
          return true;
        }
        if (pass === 2) {
          if (replay.length) {
            const [key, k] = replay.shift();
            gains.set(key, value(key, k));
            commit(key, k);
            return true;
          }
          const keep = new Map();
          committed.forEach((x, key) => keep.set(key, x.k));
          pl = PP.planner(items, Object.assign(opts((s) => {
            if (byKey.get(s.key).kind === "selector") runners.set(s.key, alternatives(s.key, 3));
            commit(s.key, s.k);
            gains.set(s.key, (gains.get(s.key) || 0) + (s.dv || 0));
          }), { chosen: keep }));
          pass = 3;
          return true;
        }
        if (pass === 3 && pl.step()) { moves++; return true; }
        pass = 4;
        return false;
      }
      return { step, pass: () => pass, moves: () => moves, result: () => ({ plan: pl.result(), gains, runners }) };
    }

    // ---- the planner's callbacks ----
    // What an item at a level adds, given the route so far. A banner the route already pulls on
    // goes from 200 to 400 pulls at what that was worth when it was first planned.
    function value(key, k) {
      const it = byKey.get(key);
      if (!it) return 0;
      const c = committed.get(key);
      if (c) return k <= c.k || !it.pre ? 0 : Math.max(0, (it.pre[k] || 0) - (it.pre[c.k] || 0));
      if (it.kind === "support") return supportPlan(it, k).value;
      if (it.kind === "trainee") return traineePlan(it, k).value;
      if (it.kind === "selector") return it.pick === "support" ? cardRows(it.id, it.date, key)[1].value : parentRows([it.id], it.date, key).value;
      return 0;
    }
    // Takes an item into the route at its likely outcome: each featured card's median copies
    // from the pulls, with the sparks where they add most (or the pick), into the decks.
    function commit(key, k) {
      const it = byKey.get(key);
      if (!it) return;
      const prev = committed.get(key);
      if (!prev && it.most > 1) it.pre = [0].concat([1, 2].map((l) => (l <= it.most ? value(key, l) : 0)));
      const x = prev || { k: 0, notes: [] };
      x.k = k;
      if (it.blind) {
        // A locked banner with no card Euophrys can score: its carats are set aside, nothing more.
        x.copies = new Map();
        x.spark = [];
        x.got = new Set();
        committed.set(key, x);
        memo.clear();
        return;
      }
      if (it.kind === "support") {
        const plan = supportPlan(it, k);
        const to = plan.likely.to.map((i) => plan.use[i].f.id);
        // Nothing (more) helps: your own target on a locked banner, else its best-rarity card.
        const fallback = (it.target && it.feat.some((f) => f.id === it.target) ? it.target : null)
          || it.feat.slice().sort((a, b) => card(b.id).r - card(a.id).r || a.rate - b.rate)[0].id;
        while (to.length < k) to.push(fallback);
        const copies = new Map();
        plan.tabs.forEach((t) => copies.set(t.f.id, median(t.dist)));
        to.forEach((id) => copies.set(id, copies.get(id) + 1));
        const before = prev ? prev.copies : new Map();
        x.copies = copies;
        x.spark = to;
        x.dist = new Map(plan.tabs.map((t) => [t.f.id, t.dist]));
        committed.set(key, x);
        memo.clear();
        copies.forEach((n, id) => { if (n > (before.get(id) || 0)) placeCard(id, it.date, x.notes, to.indexOf(id) === -1); });
      } else if (it.kind === "trainee") {
        // The sparks on the ones worth most; the pulls likely bring the others too.
        const plan = traineePlan(it, k);
        x.spark = plan.likely.spark.length ? plan.likely.spark.slice() : [it.feat[0].id];
        x.got = new Set(plan.likely.got.length ? plan.likely.got : x.spark);
        x.notes = parentRows([...x.got], it.date, key).decks;
        committed.set(key, x);
        memo.clear();
      } else if (it.kind === "selector") {
        if (it.pick === "support") {
          x.copies = new Map([[it.id, 1]]);
          committed.set(key, x);
          memo.clear();
          placeCard(it.id, it.date, x.notes);
        } else {
          x.notes = parentRows([it.id], it.date, key).decks;
          x.got = new Set([it.id]);
          committed.set(key, x);
          memo.clear();
        }
      }
      memo.clear();
    }

    // ---- for the page ----
    // A card's chances after n pulls with s sparks on it, from `have` copies: P(0 … 5 copies).
    function copiesDist(rate, n, have, s) {
      const d = binom(n, rate), out = [0, 0, 0, 0, 0, 0];
      d.forEach((p, c) => { out[Math.min(5, have + s + c)] += p; });
      return out;
    }
    // Why a banner isn't in the route: each featured card's best case (at LB4) against your rules.
    function review(key) {
      const it = byKey.get(key);
      if (!it || it.kind !== "support") return null;
      // The same gains the route reads (the first ones for cards never rescored: those that
      // didn't clear the bar even then).
      const cards = it.feat.map((f) => {
        const cups = new Set(), clear = new Set();
        let best = 0, decks = 0;
        pairs.forEach((pair) => {
          if (!pair.gains || pair.date <= it.date || copiesBy(f.id, pair.date, key) >= 5) return;
          const live = pair.live && pair.live.has(f.id);
          const g = live ? pair.gains.get(f.id + ":4") : pair.first && pair.first.get(f.id + ":4");
          if (!g) return;
          cups.add(pair.cup.id);
          decks++;
          best = Math.max(best, g.gain / g.base);
          if (live && g.gain >= minPct * g.base - 1e-9) clear.add(pair.cup.id);
        });
        return { id: f.id, cups: cups.size, clear: clear.size, decks, best };
      });
      return { item: it, cards, v1: value(key, 1), v2: value(key, 2) };
    }
    // The pick with the most raw gain (rules aside) for a support selector, for when nothing
    // clears them.
    function selectorFallback(s) {
      let best = null;
      items.forEach((it) => {
        if (it.kind !== "selector" || it.sel !== s || it.pick !== "support") return;
        const g = cardRows(it.id, it.date, it.key)[1];
        let raw = 0;
        pairs.forEach((pair) => {
          const have = copiesBy(it.id, pair.date, it.key);
          if (!pair.gains || pair.date <= it.date || have >= 5) return;
          const x = pair.gains.get(it.id + ":" + lbOf(have + 1));
          if (x) raw += x.gain;
        });
        if (raw > 0 && (!best || raw > best.raw)) best = { id: it.id, raw, clearCups: g.cups };
      });
      return best;
    }
    // Copies of a card by a selector's date, its earlier picks that day included.
    const copiesAtPick = (id, date) => {
      let n = copiesBy(id, date);
      committed.forEach((c, k) => { const y = byKey.get(k); if (y.kind === "selector" && y.pick === "support" && y.date === date && y.id === id) n++; });
      return Math.min(5, n);
    };
    // The other picks on an item's selector, best first, as they stand now (ask before the pick
    // is committed): their points by your rules, the cups they'd be clearly stronger in, and the
    // clear gains even when those are in too few cups.
    function alternatives(key, n) {
      const it = byKey.get(key);
      if (!it || !it.group) return [];
      return items.filter((x) => x.group === it.group && x.key !== key && !committed.has(x.key)).map((x) => {
        const r = x.pick === "support" ? cardRows(x.id, x.date, x.key)[1] : parentRows([x.id], x.date, x.key);
        return { key: x.key, id: x.id, pick: x.pick, value: r.value, cups: r.cups, gain: r.gain, have: x.pick === "support" ? copiesAtPick(x.id, x.date) : 0 };
      }).filter((x) => x.gain > 0).sort((a, b) => b.value - a.value || b.gain - a.gain).slice(0, n || 3);
    }
    const deckScore = (deck) => (deck || []).reduce((a, c) => a + (c.score || 0), 0);

    return {
      GROUPS, groupOf, cups, pairs, items, byKey, unscorable, selectors, bonus, minCups, minPct, team,
      buildPair, addSelectors, scorePair: (pair) => scorePair(pair), prepare, value, commit, committed, route, snapshot, reset,
      copiesBy, copiesAtPick, copiesDist, review, selectorFallback, alternatives, deckScore, parentValue, parentAffinity, bestParent,
      standalone, eras: [...eras.values()], eraAt, freeCards, unrotated, weight, yours, yoursBy,
      poolFor, borrowFor, shortlist, binom, median,
    };
  }

  // ---- your own plan (another planner's table, pasted) ----
  // One row a banner, in the table's order, each with its "Start: 2026/12/1" line. Above it, the
  // banner's own lines: its title, and "Recommended:A + B" for a support banner (a trainee
  // banner names the uma instead; a step-up says "Step-Up"). Below it: "End: …",
  // "Free/Tickets/Paid" then "120/30/36", "Carat Est." then "60,040", "Paid Carat Est.", and "Max
  // Pulls" then its number and then the row's # Pulls ("Step #" for a step-up), then the odds
  // ("Odds for X", or "X MLB + Y" for two at once: the card you're after).
  // → [{ names, title, kind ("support" | "trainee" | "stepup"), start, end, free, carats, paid,
  //      max, pulls, target }].
  function parsePlan(text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n").map((l) => l.trim());
    const date = (s) => { const m = /(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(s || ""); return m ? m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0") : null; };
    const num = (s) => (s == null || !/\d/.test(s) ? null : +String(s).replace(/[^\d.]/g, ""));
    const odds = (s) => /%$/.test(s) || /^(None|[0-4]LB|MLB|[1-5]x)$/.test(s) || /^MLB & /.test(s) || /^Odds for /.test(s) || / MLB \+ /.test(s) || /^[\d.,]+$/.test(s);
    const tableHead = (s) => /^(Type|Images|Banner|Start \/ End Date|Derived Stats|# Pulls|Reserved|% Chance)/.test(s);
    const starts = [];
    lines.forEach((l, i) => { if (/^Start:/.test(l)) starts.push(i); });
    const out = [];
    starts.forEach((si, n) => {
      const head = [];
      for (let i = si - 1; i >= 0 && lines[i] && !odds(lines[i]) && !tableHead(lines[i]) && !/^Start:/.test(lines[i]); i--) head.unshift(lines[i]);
      const body = lines.slice(si, n + 1 < starts.length ? starts[n + 1] : lines.length);
      const after = (label, k) => { const i = body.indexOf(label); return i >= 0 ? body[i + (k || 1)] : null; };
      const rec = head.find((l) => /^Recommended:/.test(l));
      const stepUp = head.some((l) => /Step-Up/i.test(l)) || body.indexOf("Step #") !== -1;
      let names, title = null;
      if (rec) {
        names = rec.replace(/^Recommended:\s*/, "").split("+").map((s) => s.trim()).filter(Boolean);
        if (head.length > 2) title = head[0];
      } else if (stepUp) {
        names = head.length ? [head[0]] : [];
        title = head.find((l) => /Step-Up/i.test(l)) || null;
      } else {
        names = head.length ? [head[head.length - 1]] : [];
        if (head.length > 1 && head[0] !== names[0]) title = head[0];
      }
      const ftp = after("Free/Tickets/Paid"), parts = ftp ? ftp.split("/").map(num) : [];
      const target = body.map((l) => /^Odds for (.+)$/.exec(l) || /^(.+?) MLB \+ /.exec(l)).find(Boolean);
      if (!names.length) return;
      out.push({
        names, title, kind: stepUp ? "stepup" : rec ? "support" : "trainee", start: date(body[0]), end: date(body.find((l) => /^End:/.test(l))),
        free: parts.reduce((a, x) => a + (x || 0), 0), carats: num(after("Carat Est.")), paid: num(after("Paid Carat Est.")),
        max: num(after(stepUp ? "Max Steps" : "Max Pulls")), pulls: stepUp ? num(after("Step #")) : num(after("Max Pulls", 2)),
        target: target ? target[1].trim() : names[0],
      });
    });
    return out;
  }
  // The banner of the calendar each entry is (its featured cards, or its uma, by name, the
  // nearest start within three weeks): [{ ...entry, banner, kind, targetId }] (banner null when
  // none matches; a step-up isn't on the calendar).
  function matchPlan(entries, B, D) {
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
    return entries.map((e) => {
      let best = null;
      const kinds = e.kind === "stepup" ? [] : [["support", B.support, (id) => D.card(id)], ["trainee", B.trainee, (id) => D.trainee(id)]].filter(([k]) => !e.kind || e.kind === k);
      kinds.forEach(([kind, list, get]) => list.forEach((b) => {
        const names = b.pick.map(([id]) => { const x = get(id); return x ? norm(x.n) : ""; });
        if (!e.names.every((n) => names.indexOf(norm(n)) !== -1)) return;
        const gap = Math.abs(Date.parse(b.start) - Date.parse(e.start)) / DAY;
        if (gap <= 21 && (!best || gap < best.gap)) best = { banner: b, kind, gap };
      }));
      // Your target as a card (or trainee) id on that banner.
      const get = best && best.kind === "trainee" ? (id) => D.trainee(id) : (id) => D.card(id);
      const target = best && e.target ? (best.banner.pick.map(([id]) => id).find((id) => { const x = get(id); return x && norm(x.n) === norm(e.target); }) || null) : null;
      return Object.assign({}, e, { banner: best ? best.banner : null, kind: best ? best.kind : e.kind || null, targetId: target });
    });
  }
  // Carats you'll have by a date if you spend none, from a plan's estimates. Each row's Carat
  // Est. is that planner's balance at the row: what you'll have there after the pulls of the rows
  // above it (two rows on one day show it). Adding back what those rows cost (their # Pulls past
  // their free pulls, at 150 carats) gives the carats you'd have by each date if you spent none;
  // two rows on one day keep the lower. Straight lines between, from what you have today (or the
  // first stretch's pace back to today), and on at the plan's average pace after its last row.
  function budgetFrom(entries, today, caratsNow) {
    let spent = 0;
    const byDate = new Map();
    entries.forEach((e) => {
      if (e.carats == null || !e.start) return;
      const cum = e.carats + spent;
      byDate.set(e.start, byDate.has(e.start) ? Math.min(byDate.get(e.start), cum) : cum);
      if (e.kind !== "stepup") spent += Math.max(0, (+e.pulls || 0) - (+e.free || 0)) * 150;
    });
    const pts = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (!pts.length) return null;
    const t = (d) => Date.parse(d) / DAY;
    const rate = pts.length > 1 ? (pts[pts.length - 1][1] - pts[0][1]) / Math.max(1, t(pts[pts.length - 1][0]) - t(pts[0][0])) : 0;
    const first = pts.length > 1 ? (pts[1][1] - pts[0][1]) / Math.max(1, t(pts[1][0]) - t(pts[0][0])) : rate;
    if (pts[0][0] > today) pts.unshift([today, caratsNow != null && caratsNow !== "" && !isNaN(+caratsNow) ? +caratsNow : Math.max(0, pts[0][1] - first * (t(pts[0][0]) - t(today)))]);
    return (date) => {
      if (date <= pts[0][0]) return pts[0][1];
      for (let i = 1; i < pts.length; i++) if (date <= pts[i][0]) return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * (t(date) - t(pts[i - 1][0])) / Math.max(1, t(pts[i][0]) - t(pts[i - 1][0]));
      return pts[pts.length - 1][1] + rate * (t(date) - t(pts[pts.length - 1][0]));
    };
  }

  // A plan row's key ("s"/"t" + its banner id), and whether it's behind you: its end has passed
  // (your table's End, else the calendar's, else three weeks after it starts), or you've entered
  // what you got there (done: { key: { pulls, free } }).
  const rowKey = (x) => (x.kind === "trainee" ? "t" : "s") + x.banner.id;
  const rowEnd = (x) => x.end || (x.banner && x.banner.end) || addDays((x.banner || x).start, 21);
  const rowDone = (x, today, done) => !!(x.banner && (rowEnd(x) < today || (done && done[rowKey(x)])));
  // Your plan's parts for a run, from matchPlan() rows. o: { today, done, selPicks: { event id:
  // trainee id }, selUma, events, caratsNow, pullCarats }. → { locked (each row still ahead at its
  // # Pulls), freePulls, yours (the umas it gets you, from when), lockedPicks (your Uma selector
  // picks still ahead), done (Set of keys behind you), budget(date) }. The budget comes from the
  // rows still ahead (each one's balance has the rows behind you paid already), less what you've
  // spent outside your plan since (done keys that aren't plan rows).
  function planParts(mine, o) {
    const today = o.today, done = o.done || {}, pullCarats = o.pullCarats || 150;
    const rows = mine.filter((x) => x.banner && x.kind !== "stepup"), live = rows.filter((x) => !rowDone(x, today, done));
    const locked = new Map(live.filter((x) => x.pulls > 0).map((x) => [x.banner.id, { level: x.pulls >= 400 ? 2 : 1, free: x.free || 0, target: x.targetId }]));
    const freePulls = new Map(live.map((x) => [x.banner.id, x.free || 0]));
    const yours = new Map();
    rows.filter((x) => x.kind === "trainee" && x.pulls > 0 && x.targetId).forEach((x) => yours.set(x.targetId, x.banner.start));
    const lockedPicks = new Map();
    if (o.selUma) Object.keys(o.selPicks || {}).forEach((ev) => {
      const id = +o.selPicks[ev], e = (o.events || []).find((x) => x.id === ev);
      if (!id || !e) return;
      if (e.start > today && !done["x" + ev + "-uma"]) lockedPicks.set(ev + "-uma", id);
      if (!yours.has(id) || e.start < yours.get(id)) yours.set(id, e.start);
    });
    let budget = mine.length ? budgetFrom(mine.filter((x) => !rowDone(x, today, done)), today, o.caratsNow) : null;
    const planKeys = new Set(rows.map(rowKey));
    const extra = Object.keys(done).filter((k) => !planKeys.has(k)).reduce((a, k) => a + Math.max(0, (+done[k].pulls || 0) - (+done[k].free || 0)) * pullCarats, 0);
    if (budget && extra) { const b0 = budget; budget = (d) => b0(d) - extra; }
    return { locked, freePulls, yours, lockedPicks, budget, done: new Set(Object.keys(done).concat(rows.filter((x) => rowDone(x, today, done)).map(rowKey))) };
  }

  const api = { create, GROUPS, groupOf, binom, median, POOL_LAG, SELECTOR_CARATS, ERAS, parsePlan, matchPlan, budgetFrom, planParts, rowKey, rowDone };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaPullValues = api;
})(typeof window !== "undefined" ? window : globalThis);
