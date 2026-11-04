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

  // o: { D, T, A, B (data/banners.js), P (data/presets.js), today, until, teams: { sm|ml|dirt:
  //      [{ id, style }] }, owned: { cardId: lb }, umas: Set of trainee ids you own,
  //      minCups (2), minPct (0.1), parents (true), selectors: { free, paid, uma } (all true),
  //      reuse (an earlier result of create() with the same cards, teams and deck settings),
  //      deckOpts(cup, style, traineeId) → tiers.js options for her racing deck there,
  //      whites(cup, style) → the ace's race white skills' L values, skillL(cup, style, id) → L }
  // Use: buildPair(pair) for every pair, then addSelectors(), then scorePair(pair) for every pair
  // (or prepare() for the last two), then the planner with value() and commit().
  function create(o) {
    const { D, T, A, B } = o;
    const card = (id) => D.card(id);
    const trainee = (id) => D.trainee(id);
    const spark = (B.meta && B.meta.spark) || 200;
    const minCups = Math.max(1, o.minCups != null ? +o.minCups : 2);
    const minPct = Math.max(0, o.minPct != null ? +o.minPct : 0.1);
    const parentsOn = o.parents !== false;
    const sel = Object.assign({ free: true, paid: true, uma: true }, o.selectors || {});
    const relC = (B.release && B.release.cards) || {};
    const scorable = (id) => !!T.entry(id, 4);
    const today = o.today, until = o.until;
    // Running or ahead: a forecast banner whose estimated start just passed is still to come.
    const twoWeeksAgo = addDays(today, -14);
    const later = (b) => (b.end ? b.end >= today : b.start >= twoWeeksAgo) && b.start <= until;
    const dateOf = (b) => (b.start < today ? today : b.start);

    // Your team umas count as yours from today, out on Global or not.
    const team = new Set();
    Object.values(o.teams || {}).forEach((list) => (list || []).forEach((m) => { if (m && m.id && trainee(m.id)) team.add(+m.id); }));
    const umas = new Set([...(o.umas || [])].map(Number).concat([...team]));

    // The cups ahead with the team for their track: one pair per cup and team uma.
    const cups = o.P.list.filter((p) => p.global.start > today && p.global.start <= until && groupOf(p))
      .sort((a, b) => (a.global.start < b.global.start ? -1 : 1));
    const pairs = [];
    cups.forEach((cup) => (o.teams[groupOf(cup)] || []).forEach((m, slot) => {
      const t = m && m.id ? trainee(m.id) : null;
      if (t) pairs.push({ key: cup.id + ":" + slot + ":" + t.id + ":" + m.style, cup, date: cup.global.start, group: groupOf(cup), slot, member: m, trainee: t });
    }));

    // The banners: one item per banner, 200 pulls (level 1) or 400 (level 2).
    const items = [], unscorable = [];
    B.support.filter(later).forEach((b) => {
      const feat = [];
      b.pick.forEach(([id, rate]) => {
        if (!card(id)) return;
        if (!scorable(id)) { unscorable.push({ banner: b, id }); return; }
        feat.push({ id, rate });
      });
      if (feat.length) items.push({ key: "s" + b.id, kind: "support", banner: b, date: dateOf(b), feat, most: 2, pullsAt: (k) => spark * k });
    });
    if (parentsOn) B.trainee.filter(later).forEach((b) => {
      const feat = b.pick.filter(([id]) => trainee(id) && !umas.has(id)).map(([id, rate]) => ({ id, rate }));
      if (feat.length) items.push({ key: "t" + b.id, kind: "trainee", banner: b, date: dateOf(b), feat, most: Math.min(2, feat.length), pullsAt: (k) => spark * k });
    });
    const byKey = new Map(items.map((it) => [it.key, it]));

    // The selectors ahead, and the carats the $20.99 packs bring.
    const selectors = [];
    (B.events || []).filter((e) => e.start > today && e.start <= until).forEach((e) => {
      const cut = addDays(e.jp, -POOL_LAG);
      const add = (id, kind, label, price) => selectors.push({ id: e.id + "-" + id, event: e, date: e.start, kind, cut, label, price, carats: price ? SELECTOR_CARATS : 0 });
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
    function slotScores(pair) {
      pair.deck.forEach((c, i) => {
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
      pair.opts = o.deckOpts(pair.cup, pair.member.style, pair.trainee.id);
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
    function placeCard(id, date, notes) {
      pairs.forEach((pair) => {
        if (!pair.deck || pair.date <= date) return;
        const have = copiesBy(id, pair.date);
        if (have <= 0) return;
        for (let l = 0; l <= lbOf(have); l++) pair.gains.delete(id + ":" + l);
        const lb = lbOf(have), at = pair.deck.findIndex((x) => !x.borrowed && x.id === id);
        if (at !== -1 && pair.deck[at].lb >= lb) return;
        const s = bestSpot(pair, id, lb);
        if (!s) return;
        const replaced = pair.deck[s.slot], types = new Set([card(id).ty, card(replaced.id).ty]);
        if (s.via) {
          const bi = pair.deck.findIndex((x) => x.borrowed);
          types.add(card(pair.deck[bi].id).ty).add(card(pair.alt.id).ty);
          pair.deck[bi] = Object.assign({}, pair.alt);
        }
        pair.deck[s.slot] = { id, lb, borrowed: false, score: s.score };
        if (notes) notes.push({ pair, id, lb, gain: s.gain, pct: s.base > 0 ? s.gain / s.base : 0, replaced: replaced.id === id ? null : replaced.id, upgrade: replaced.id === id, clear: s.gain >= minPct * s.base - 1e-9 });
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
      for (let n = 0; n <= 5; n++) rows.push({ gain: 0, cups: new Set(), decks: [] });
      pairs.forEach((pair) => {
        if (!pair.gains || pair.date <= date) return;
        const have = copiesBy(id, pair.date, skipKey);
        for (let n = 1; n <= 5 && have < 5; n++) {
          const lb = lbOf(Math.min(5, have + n)), g = pair.gains.get(id + ":" + lb);
          if (g && g.gain >= minPct * g.base - 1e-9) { rows[n].gain += g.gain; rows[n].cups.add(pair.cup.id); rows[n].decks.push({ pair, lb, gain: g.gain, pct: g.gain / g.base }); }
        }
      });
      const out = rows.map((r) => ({ value: r.cups.size >= minCups ? r.gain : 0, gain: r.gain, cups: r.cups.size, decks: r.decks }));
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
    function parentValue(pair, t) {
      if (!t || t.cid === pair.trainee.cid) return 0;
      const mk = pair.key + "|" + t.id;
      if (pvMemo.has(mk)) return pvMemo.get(mk);
      const aff = parentAffinity(pair.trainee.cid, t.cid);
      const whites = topWhites(pair).reduce((a, L) => a + L * twice(WHITE_2, aff), 0);
      const g = inheritedOf(t), gL = g ? Math.max(0, o.skillL(pair.cup, pair.member.style, g) || 0) : 0;
      const v = STAT_PER_L * (whites + gL * twice(GREEN_2, aff));
      pvMemo.set(mk, v);
      return v;
    }
    // Your best Parent 1 for the pair: your umas (your teams included) and the route's trainees.
    function bestParent(pair, skipKey) {
      const mk = "p|" + pair.key + "|" + (skipKey || "");
      if (memo.has(mk)) return memo.get(mk);
      let best = 0;
      const see = (id) => { best = Math.max(best, parentValue(pair, trainee(id))); };
      umas.forEach(see);
      committed.forEach((x, key) => { if (key !== skipKey && x.got && byKey.get(key).date < pair.date) x.got.forEach(see); });
      memo.set(mk, best);
      return best;
    }
    // New trainees (ids) from an item dated `date`: the clear gains over your best Parent 1.
    function parentRows(ids, date, skipKey) {
      const mk = "t|" + ids.slice().sort().join(",") + "|" + date + "|" + (skipKey || "");
      if (memo.has(mk)) return memo.get(mk);
      let gain = 0;
      const cups = new Set(), decks = [];
      if (ids.length) pairs.forEach((pair) => {
        if (pair.date <= date) return;
        const cur = bestParent(pair, skipKey);
        let best = 0, who = null;
        ids.forEach((id) => { const v = parentValue(pair, trainee(id)); if (v > best) { best = v; who = id; } });
        const g = best - cur;
        if (g > 1e-9 && g >= minPct * cur - 1e-9) { gain += g; cups.add(pair.cup.id); decks.push({ pair, id: who, gain: g, pct: cur > 0 ? g / cur : null }); }
      });
      const out = { value: cups.size >= minCups ? gain : 0, gain, cups: cups.size, decks };
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
        const short = new Set();
        pairs.forEach((pair) => {
          if (!pair.deck || pair.date <= first) return;
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
    }
    function prepare() {
      addSelectors();
      pairs.forEach((pair) => scorePair(pair));
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
      if (it.kind === "support") {
        const plan = supportPlan(it, k);
        const to = plan.likely.to.map((i) => plan.use[i].f.id);
        while (to.length < k) to.push(it.feat[0].id); // nothing helps: the first featured card
        const copies = new Map();
        plan.tabs.forEach((t) => copies.set(t.f.id, median(t.dist)));
        to.forEach((id) => copies.set(id, copies.get(id) + 1));
        const before = prev ? prev.copies : new Map();
        x.copies = copies;
        x.spark = to;
        x.dist = new Map(plan.tabs.map((t) => [t.f.id, t.dist]));
        committed.set(key, x);
        memo.clear();
        copies.forEach((n, id) => { if (n > (before.get(id) || 0)) placeCard(id, it.date, x.notes); });
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
    const deckScore = (deck) => (deck || []).reduce((a, c) => a + (c.score || 0), 0);

    return {
      GROUPS, groupOf, cups, pairs, items, byKey, unscorable, selectors, bonus, minCups, minPct, team,
      buildPair, addSelectors, scorePair: (pair) => scorePair(pair), prepare, value, commit, committed,
      copiesBy, copiesDist, review, selectorFallback, deckScore, parentValue, parentAffinity, bestParent,
      poolFor, borrowFor, shortlist, binom, median,
    };
  }

  const api = { create, GROUPS, groupOf, binom, median, POOL_LAG, SELECTOR_CARATS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaPullValues = api;
})(typeof window !== "undefined" ? window : globalThis);
