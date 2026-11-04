// What each pull is worth to you, for the pull planner (pull-planner.js): every featured support
// card and trainee on the banners ahead, valued for your future teams with the rest of the site.
//
// Support cards: for every cup ahead and every uma of the team for its track, the planner builds
// her racing deck the way CM & decks does (Euophrys' scoring plus the race's skill values for her
// style, with a friend's card) from the cards you own and the ones the route has planned by then.
// A card's value there is how much it beats the card it would replace with the other five fixed
// (the "Which cards would improve it?" test), at the limit break its copies reach. Its value is
// the sum over the cups after its banner (a card you own keeps helping), in the deck score's units
// (1 L of race skills = 60).
// Trainees: a team uma you don't own is required, on her first banner. Any other trainee can be
// worth having as Parent 1 for your team umas (the parent you train must be yours; Parent 2 can be
// a friend's rental): her sparks fire at their base chance × (1 + her affinity with the ace / 100)
// at each of the ace's two inspirations (family.js). Built for the ace, she carries the ace's top 3
// race whites at 2★ (6%) and her inherited unique at 2★ (10%); her value is what that beats the
// best Parent 1 you'd otherwise have, in the same units.
(function (root) {
  "use strict";
  const GROUPS = {
    sm: { label: "Sprint & Mile", builds: ["sprint", "mile"] },
    ml: { label: "Medium & Long", builds: ["medium", "long"] },
    dirt: { label: "Dirt", builds: ["dirt"] },
  };
  const groupOf = (p) => Object.keys(GROUPS).find((g) => GROUPS[g].builds.indexOf(p.build) !== -1) || null;
  const WHITE_2 = 0.06, GREEN_2 = 0.1, TOP_WHITES = 3, STAT_PER_L = 60, SHORTLIST = 12;
  const twice = (base, aff) => { const p = Math.min(1, base * (1 + Math.max(0, aff || 0) / 100)); return 1 - (1 - p) * (1 - p); };
  const lbOf = (copies) => Math.min(4, copies - 1);

  // o: { D, T, A, B (data/banners.js), P (data/presets.js), today, until, teams: { sm|ml|dirt:
  //      [{ id, style }] }, owned: { cardId: lb }, umas: Set of trainee ids you own,
  //      deckOpts(cup, style, traineeId) → tiers.js options for her racing deck there,
  //      whites(cup, style) → the ace's race white skills' L values, skillL(cup, style, id) → L }
  function create(o) {
    const { D, T, A, B } = o;
    const card = (id) => D.card(id);
    const trainee = (id) => D.trainee(id);
    const relC = (B.release && B.release.cards) || {}, relT = (B.release && B.release.trainees) || {};
    const cardOut = (c, date) => !!((c.en && c.en <= date) || (relC[c.id] && relC[c.id] <= date));
    const traineeOut = (t, date) => !!((t.en && t.en <= date) || (relT[t.id] && relT[t.id] <= date));
    const scorable = (id) => !!T.entry(id, 4);
    const today = o.today, until = o.until;
    // Running or ahead: a forecast banner whose estimated start just passed is still to come.
    const twoWeeksAgo = new Date(Date.parse(today) - 14 * 864e5).toISOString().slice(0, 10);
    const later = (b) => (b.end ? b.end >= today : b.start >= twoWeeksAgo) && b.start <= until;

    // The cups ahead with the team for their track.
    const cups = o.P.list.filter((p) => p.global.start > today && p.global.start <= until && groupOf(p))
      .sort((a, b) => (a.global.start < b.global.start ? -1 : 1));
    const pairs = [];
    cups.forEach((cup) => (o.teams[groupOf(cup)] || []).forEach((m, slot) => {
      const t = m && m.id ? trainee(m.id) : null;
      if (t && traineeOut(t, cup.global.start)) pairs.push({ cup, date: cup.global.start, group: groupOf(cup), slot, member: m, trainee: t });
    }));

    // The banners' featured cards and trainees, one item per banner and pick.
    const items = [], unscorable = [];
    B.support.filter(later).forEach((b) => b.pick.forEach(([id, rate]) => {
      const c = card(id);
      if (!c) return;
      if (!scorable(id)) { unscorable.push({ banner: b, id }); return; }
      const have = o.owned[id] != null ? +o.owned[id] + 1 : 0;
      if (have >= 5) return;
      items.push({ key: "s" + b.id + ":" + id, kind: "support", id, banner: b, date: b.start < today ? today : b.start, rate, have, most: 5 });
    }));
    const needed = new Map(); // team versions you don't own → their first banner
    Object.values(o.teams).forEach((list) => (list || []).forEach((m) => { if (m && m.id && !o.umas.has(+m.id)) needed.set(+m.id, null); }));
    B.trainee.filter(later).forEach((b) => b.pick.forEach(([id, rate]) => {
      const t = trainee(id);
      if (!t || o.umas.has(id)) return;
      const required = needed.has(id) && needed.get(id) == null;
      if (required) needed.set(id, b.id);
      items.push({ key: "t" + b.id + ":" + id, kind: "trainee", id, banner: b, date: b.start < today ? today : b.start, rate, have: 0, most: 1, required });
    }));
    const noBanner = [...needed.entries()].filter(([, b]) => b == null).map(([id]) => id);
    const byKey = new Map(items.map((it) => [it.key, it]));

    // The route so far: new copies per item (kept in step with pull-planner.js's plan).
    const committed = new Map();
    // Copies of a card you'll have by a date: yours plus the route's from earlier banners.
    const copiesBy = (id, date, skipKey) => {
      let n = o.owned[id] != null ? +o.owned[id] + 1 : 0;
      committed.forEach((k, key) => { const it = byKey.get(key); if (key !== skipKey && it.kind === "support" && it.id === id && it.date < date) n += k; });
      return n;
    };

    // ---- support cards: each pair's racing deck and what each candidate adds to it ----
    const poolFor = (pair) => {
      const pool = [];
      const ids = new Set(Object.keys(o.owned).map(Number));
      committed.forEach((k, key) => { const it = byKey.get(key); if (it.kind === "support" && it.date < pair.date) ids.add(it.id); });
      ids.forEach((id) => { const c = card(id), n = copiesBy(id, pair.date); if (c && n > 0 && scorable(id)) pool.push({ id, lb: lbOf(n) }); });
      return pool;
    };
    const borrowFor = (pair) => D.DATA.supports.filter((c) => c.r === 3 && cardOut(c, pair.date) && scorable(c.id)).map((c) => ({ id: c.id, lb: 4 }));
    // Each type's best few alone, so the deck search stays quick (the rest rarely make a deck).
    function shortlist(opts, pool) {
      const by = {};
      pool.forEach((c) => { const ty = card(c.id).ty; (by[ty] = by[ty] || []).push(c); });
      return Object.keys(by).flatMap((ty) => T.rank(opts, ty, [], by[ty]).slice(0, SHORTLIST).map((r) => ({ id: r.id, lb: r.lb })));
    }
    function slotScores(pair) {
      pair.deck.forEach((c, i) => {
        const rest = pair.deck.filter((_, j) => j !== i);
        const r = T.rank(pair.opts, card(c.id).ty, rest, [{ id: c.id, lb: c.lb }])[0];
        c.score = r ? r.score : 0;
      });
    }
    // Candidates for a pair: the planned items' cards (banner before the cup) above the limit
    // break you'd have there.
    function candidates(pair) {
      const out = [];
      const seen = new Set();
      items.forEach((it) => {
        if (it.kind !== "support" || it.date >= pair.date || seen.has(it.id) || !cardOut(card(it.id), pair.date)) return;
        seen.add(it.id);
        const have = copiesBy(it.id, pair.date);
        for (let lb = have > 0 ? lbOf(have) + 1 : 0; lb <= 4; lb++) out.push({ id: it.id, lb });
      });
      return out;
    }
    const comp = (pair) => pair.opts.comp || {};
    function computeGains(pair) {
      pair.gains = new Map();
      const cands = candidates(pair);
      if (!cands.length || !pair.deck) return;
      const byTy = {};
      cands.forEach((c) => { const ty = card(c.id).ty; (byTy[ty] = byTy[ty] || []).push(c); });
      const put = (r, j, base) => {
        const g = r.score - base, k = r.id + ":" + r.lb, cur = pair.gains.get(k);
        if (g > 0 && (!cur || g > cur.gain)) pair.gains.set(k, { gain: g, slot: j });
      };
      const owned = pair.deck.map((c, j) => ({ c, j })).filter((x) => !x.c.borrowed);
      // The same type in every slot, and any type in her weakest slot when the makeup allows it.
      owned.forEach(({ c, j }) => {
        const ty = card(c.id).ty;
        if (!byTy[ty]) return;
        const rest = pair.deck.filter((_, i) => i !== j);
        T.rank(pair.opts, ty, rest, byTy[ty]).forEach((r) => put(r, j, c.score));
      });
      const weak = owned.slice().sort((a, b) => a.c.score - b.c.score)[0];
      if (weak) {
        const wty = card(weak.c.id).ty, cp = comp(pair);
        const rest = pair.deck.filter((_, i) => i !== weak.j);
        Object.keys(byTy).forEach((ty) => {
          if (ty === wty || cp[ty] != null || cp[wty] != null) return;
          T.rank(pair.opts, ty, rest, byTy[ty]).forEach((r) => put(r, weak.j, weak.c.score));
        });
      }
    }
    function buildPair(pair) {
      pair.opts = o.deckOpts(pair.cup, pair.member.style, pair.trainee.id);
      try {
        const pool = poolFor(pair);
        const r = T.buildDeck(pair.opts, shortlist(pair.opts, pool), shortlist(pair.opts, borrowFor(pair)));
        pair.deck = r.cards.map((c) => ({ id: c.id, lb: c.lb, borrowed: c.borrowed, score: c.score }));
        pair.error = null;
      } catch (err) { pair.deck = null; pair.error = err.message || String(err); }
      if (pair.deck) computeGains(pair);
    }
    // Puts a planned card into the decks it improves (from its banner on) and rescores them.
    function placeCard(it) {
      pairs.forEach((pair) => {
        if (!pair.deck || pair.date <= it.date) return;
        const lb = lbOf(copiesBy(it.id, pair.date));
        const g = pair.gains.get(it.id + ":" + lb);
        if (!g) return;
        const at = pair.deck.findIndex((c) => !c.borrowed && c.id === it.id);
        if (at !== -1) pair.deck[at].lb = lb;
        else pair.deck[g.slot] = { id: it.id, lb, borrowed: false, score: 0 };
        slotScores(pair);
        computeGains(pair);
      });
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
    function parentValue(pair, t) {
      if (!t || t.cid === pair.trainee.cid) return 0;
      const aff = parentAffinity(pair.trainee.cid, t.cid);
      const whites = topWhites(pair).reduce((a, L) => a + L * twice(WHITE_2, aff), 0);
      const g = inheritedOf(t), gL = g ? Math.max(0, o.skillL(pair.cup, pair.member.style, g) || 0) : 0;
      return STAT_PER_L * (whites + gL * twice(GREEN_2, aff));
    }
    // The best Parent 1 you'd have for the pair: your umas, the route's trainees by then.
    function bestParent(pair, skipKey) {
      let best = 0;
      o.umas.forEach((id) => { const t = trainee(id); if (t && traineeOut(t, pair.date)) best = Math.max(best, parentValue(pair, t)); });
      committed.forEach((k, key) => {
        const it = byKey.get(key);
        if (key !== skipKey && it.kind === "trainee" && k > 0 && it.date < pair.date) best = Math.max(best, parentValue(pair, trainee(it.id)));
      });
      return best;
    }

    // ---- the planner's value callback ----
    function value(key, k) {
      const it = byKey.get(key);
      if (!it || k <= (committed.get(key) || 0)) return 0;
      let v = 0;
      if (it.kind === "support") {
        pairs.forEach((pair) => {
          if (!pair.deck || pair.date <= it.date) return;
          const lb = lbOf(copiesBy(it.id, pair.date, key) + k);
          const g = pair.gains.get(it.id + ":" + lb);
          if (g) v += g.gain;
        });
      } else {
        const t = trainee(it.id);
        pairs.forEach((pair) => {
          if (pair.date <= it.date || !traineeOut(t, pair.date)) return;
          v += Math.max(0, parentValue(pair, t) - bestParent(pair));
        });
      }
      return v;
    }
    function commit(key, k) {
      const it = byKey.get(key);
      committed.set(key, k);
      if (it.kind === "support") placeCard(it);
    }
    // What a planned item gives, pair by pair (for the route's "why").
    function breakdown(key, k) {
      const it = byKey.get(key), out = [];
      if (!it) return out;
      pairs.forEach((pair) => {
        if (pair.date <= it.date) return;
        if (it.kind === "support") {
          if (!pair.deck) return;
          const at = pair.deck.find((c) => !c.borrowed && c.id === it.id);
          if (at) out.push({ pair, lb: at.lb });
        } else {
          const t = trainee(it.id), pv = parentValue(pair, t);
          if (pv > 0 && pv >= bestParent(pair, key) - 1e-9) out.push({ pair, parent: pv });
        }
      });
      return out;
    }

    return { GROUPS, groupOf, cups, pairs, items, byKey, unscorable, noBanner, buildPair, value, commit, breakdown, parentValue, parentAffinity, committed, poolFor, borrowFor, shortlist };
  }

  const api = { create, GROUPS, groupOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaPullValues = api;
})(typeof window !== "undefined" ? window : globalThis);
