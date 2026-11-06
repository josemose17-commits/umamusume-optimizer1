// The CM/LoH planner's logic (cm-tab.js draws it). For one ace on one cup, once her racing deck
// is built (its skill offers make a parent's spark for a skill the deck gives anyway worth only
// its discount, family.js):
//  - Parent 1 from your veterans, each with her own two parents (the ace's grandparents), by the
//    family score, with Parent 2 as the rental character that suits the ace and her best;
//  - a fresh Parent 1 to train, when one would beat your best veteran by MARGIN: one of your
//    umas, one veteran and a rental (or two veterans), the G1s she should win for affinity, and the
//    sparks a parent built for this race should get, in expectation at your own veterans' rates:
//    the relevant whites her parent deck offers, learned (the best first, as many as your
//    veterans learn) and turned into sparks as often as theirs were, at their stars; her
//    inherited unique at 2★; her pink and blue on a random aptitude and stat;
//  - her race plan: her career goals, then the G1s her parents won (each +3 affinity per parent
//    who won it), then the G1s your veterans and their parents won most (a rental likely shares
//    them), as many as keep her at the selected rank: your veterans in the scenario that ran no extra races
//    give the ratings you reach, and the simulation (cm-tab.js) what each race costs;
//  - Parent 2: the uma.moe search (its database filters, in a link): the ace as the affinity
//    target, Parent 1's character and G1 wins as the legacy, a 3★ key-stat blue on the rental,
//    and the race whites the family still lacks as preferred sparks; then the rentals you paste
//    from it, ranked with your Parent 1.
(function (root) {
  "use strict";
  const MARGIN = 0.1, FRESH_STARS = 2, GRAND_SHORT = 6;
  // A fresh parent's white sparks, until your veterans tell (MIN_VETS with their skills): a
  // spark for SPARK_P of the skills she learns, 1★/2★/3★ at STARS, and LEARN_MAX relevant skills
  // learned (else LEARN_SHARE of what your veterans learned, the median).
  const SPARK_P = 0.3, STARS = [0.32, 0.6, 0.08], LEARN_MAX = 12, LEARN_SHARE = 0.75, MIN_VETS = 10, SPARK_RANGE = [0.15, 0.45];
  // Races and SS: your veterans in the scenario with BASE_EXTRA extra races or fewer (BASE_MIN
  // of them at least) give the ratings you reach; the simulation gives what each race costs.
  const BASE_EXTRA = 1, BASE_MIN = 10;
  // A race count keeps her at the selected rank when this share of careers reach it.
  const SS_SHARE = 0.75;
  const UMA_MOE = "https://uma.moe/database";
  // uma.moe's factor ids (the game's factor id without its star digit): blue by stat, pink by
  // family.js's aptitude order (Turf, Dirt, Sprint, Mile, Medium, Long, Front, Pace, Late, End).
  const BLUE_IDS = [10, 20, 30, 40, 50];
  const PINK_IDS = [110, 120, 310, 320, 330, 340, 210, 220, 230, 240];
  const STYLE_INDEX = { Nige: 6, Senkou: 7, Sasi: 8, Oikomi: 9 };
  const MOE_STYLES = { 6: "Front Runner", 7: "Pace Chaser", 8: "Late Surger", 9: "End Closer" };
  const b64 = (s) => (typeof btoa === "function" ? btoa(s) : Buffer.from(s, "binary").toString("base64"));

  // o: { A (affinity.js), F (family.js), skills (skill-purchases' skills), trainees, chars
  //      (character ids to rent from: Global's), saddles ({ G1 name: saddle id }), SS (rating) }
  function create(o) {
    const { A, F } = o, meta = o.skills;
    if (!o.SS) o = Object.assign({}, o, { SS: 17500 });
    const fam = F.create({ A, skills: meta });
    const byTid = new Map(o.trainees.map((t) => [t.id, t]));
    const trainee = (id) => byTid.get(+id) || null;
    // Her inherited unique (green spark): the unique's 9… id.
    const inherited = (t) => (t && t.us && t.us.length ? "9" + String(t.us[0]).slice(1) : null);
    const owners = new Map();
    o.trainees.forEach((t) => { const u = inherited(t); if (u) { if (!owners.has(u)) owners.set(u, []); owners.get(u).push(t); } });
    const g1s = A.g1Races(), g1Map = new Map(g1s.map((r) => [r.name, r]));
    const DIST = (d) => (d <= 1400 ? 2 : d <= 1800 ? 3 : d <= 2400 ? 4 : 5); // aptitude index
    const saddleOf = o.saddles || {};

    // ---- the family ----
    const blank = () => ({ cid: null, tid: null, white: [], blue: [0, 0], pink: [0, 0], green: 0, wins: [] });
    // A family member as family.js scores her (her version's inherited unique for the green).
    function member(m, tid) {
      if (!m || !m.cid) return null;
      const t = trainee(tid || m.tid);
      return { cid: m.cid, tid: tid || m.tid || null, white: (m.white || []).map((w) => w.slice()), blue: (m.blue || [0, 0]).slice(), pink: (m.pink || [0, 0]).slice(), green: m.green || 0, wins: (m.wins || []).slice(), unique: inherited(t) };
    }
    const charMember = (cid) => Object.assign(blank(), { cid });
    const familyOf = (f) => { const out = {}; F.SLOTS.forEach((k) => { out[k] = f[k] || null; }); return out; };

    // The x family.js scores against: the ace ({ cid, tid, apt }), her race ({ preset, style }),
    // rel (her relevant skills with every charted skill's L), offers (her deck's), build, chars.
    function context(c) {
      const t = trainee(c.ace.tid);
      const L = (c.rel && c.rel.L) || {};
      const uniques = Object.keys(L).filter((id) => /^9\d+$/.test(id) && owners.has(id)).map((id) => ({ id, L: L[id], owners: owners.get(id) }));
      return { ace: { cid: c.ace.cid, tid: c.ace.tid, apt: c.ace.apt || (t ? t.apt : null) }, race: c.race, rel: c.rel, raceL: L, offers: c.offers || null, innate: t ? [].concat(t.is || [], t.as || []) : [], build: c.build, chars: [], mine: [], uniques, fam: {} };
    }
    const wantMemo = new WeakMap();
    const want = (x) => { if (!wantMemo.has(x)) wantMemo.set(x, fam.lookFor(x)); return wantMemo.get(x); };

    // The rental character (Parent 2, sparks unknown) with the most affinity with the ace and
    // Parent 1: the stand-in until you pick a real rental.
    const rentMemo = new Map();
    function rentalFor(ace, p1) {
      const k = ace + ":" + p1;
      if (!rentMemo.has(k)) {
        let best = null;
        (o.chars || []).forEach((c) => {
          if (+c === +ace || +c === +p1) return;
          const pts = A.together(ace, c) + A.together(p1, c);
          if (!best || pts > best.pts) best = { cid: +c, pts };
        });
        rentMemo.set(k, best);
      }
      return rentMemo.get(k);
    }

    // ---- Parent 1: your veterans ----
    // v as Parent 1 with her two parents, the stand-in rental as Parent 2.
    function vetFamily(x, v, rental) {
      const rent = rental ? null : rentalFor(x.ace.cid, v.cid);
      return {
        rent,
        f: { p1: member(v.self, v.tid), g11: member(v.parents[0]), g12: member(v.parents[1]),
          p2: rental ? member(rental.parent) : rent ? charMember(rent.cid) : null, g21: rental ? member(rental.parents[0]) : null, g22: rental ? member(rental.parents[1]) : null },
      };
    }
    function rankVets(x, vets) {
      return (vets || []).filter((v) => +v.cid !== +x.ace.cid).map((v) => {
        const { f, rent } = vetFamily(x, v);
        const s = fam.score(familyOf(f), x);
        return { kind: "vet", v, rent, f, s, value: s.value };
      }).filter((r) => !r.s.problems.length).sort((a, b) => b.value - a.value || b.s.total - a.s.total);
    }

    // ---- a fresh Parent 1 ----
    const fitsAll = (t) => new Set(g1s.filter((r) => A.fits(t.apt, r, "B")).map((r) => r.name));
    // The spark rates your veterans got: white sparks per skill learned, their stars, and how
    // many skills they learned (the median); the defaults until there are enough to tell.
    function rates(vets) {
      const with_ = (vets || []).filter((v) => v.learned > 0);
      let learned = 0, whites = 0;
      const st = [0, 0, 0];
      with_.forEach((v) => { learned += v.learned; (v.self.white || []).forEach((w) => { whites++; st[Math.max(1, Math.min(3, w[1])) - 1]++; }); });
      const n = st[0] + st[1] + st[2], counts = with_.map((v) => v.learned).sort((a, b) => a - b);
      const enough = with_.length >= MIN_VETS;
      // A learned skill leaves a spark 20% (○) to 40% (gold) of the time (GameTora): a measured
      // rate far outside that is your data, not the game.
      const spark = enough ? Math.max(SPARK_RANGE[0], Math.min(SPARK_RANGE[1], whites / learned)) : SPARK_P;
      return { spark, stars: enough && n ? st.map((k) => k / n) : STARS.slice(), learn: enough ? Math.round(counts[counts.length >> 1] * LEARN_SHARE) : LEARN_MAX, vets: enough ? with_.length : 0 };
    }
    // Her white sparks in expectation: she learns the relevant whites her parent deck offers
    // (offers: { id: chance }), the most valuable first, up to r.learn of them; each becomes a
    // spark r.spark of the time, at r.stars, firing at her affinity aff.
    function freshWhites(x, offers, aff, r) {
      const fams = fam.families(x.rel), eff = fam.worthOf(x);
      const fire = r.stars.reduce((n, d, k) => n + d * F.twice(F.WHITE, k + 1, aff), 0);
      const got = Object.keys(fams).map((f) => ({ f, p: Math.min(1, Math.max(0, ...fams[f].ids.map((id) => (offers && offers[id]) || 0))) }))
        .filter((a) => a.p > 0).sort((a, b) => eff[b.f] - eff[a.f] || b.p - a.p);
      let room = r.learn, value = 0;
      const list = [];
      got.forEach((a) => {
        const p = Math.min(a.p, room);
        if (p <= 0) return;
        room -= p;
        value += p * r.spark * fire * eff[a.f];
        list.push({ id: fam.baseWhite(fams[a.f].ids[0]), learn: p, spark: p * r.spark, L: eff[a.f] });
      });
      return { value, list, fire };
    }
    // Her blue spark's stat is random (1 in 5 each): the key stats' start bonus, at 2★.
    const blueExpected = (x) => (want(x).blue.length / 5) * F.START_BLUE[FRESH_STARS - 1] / F.STAT_PER_L;
    // Her pink spark lands on one of her A-or-better aptitudes: the share that's one the ace needs.
    function pinkExpected(x, t, aff) {
      const good = (t.apt || []).filter((g) => g === "S" || g === "A").length;
      const hit = want(x).pink.filter((p) => ["S", "A"].indexOf((t.apt || [])[p.i]) !== -1).length;
      return good && hit ? (hit / good) * F.twice(F.PINK, FRESH_STARS, aff) * F.APT_L : 0;
    }
    // What a parent built for this race carries for sure: her inherited unique (2★); her whites,
    // pink and blue are added in expectation, her wins come from her race plan.
    function freshMember(t) {
      const u = inherited(t);
      return { cid: t.cid, tid: t.id, white: [], blue: [0, 0], pink: [0, 0], green: u ? FRESH_STARS : 0, wins: [], unique: u };
    }
    // The family score's parts for her that it can't count itself, at her own affinity there.
    function freshExtra(x, t, s, offers, r) {
      const aff = s.own.p1 || 0, w = freshWhites(x, offers, aff, r);
      const blue = blueExpected(x), pink = pinkExpected(x, t, aff);
      return { value: w.value + blue + pink, whites: w, blue, pink };
    }
    // Her G1 plan with these two veterans as her parents (extra: more G1s after the shared ones).
    function plan(t, parents, extra, priorityWins) {
      return A.planRaces({ self: t.cid, apt: t.apt, minGrade: "B", links: parents.map((v, i) => ({ role: i ? "g12" : "g11", cid: v.cid, wins: v.self.wins })), need: Infinity, extra: extra || [], priorityWins: priorityWins || [] });
    }
    const asVeteran = r => ({ id: "rental:" + r.friend, cid: r.parent.cid, tid: r.parent.tid, self: r.parent, parents: r.parents, rental: r.friend });
    function trainingContext(x, t, offers) {
      return context({ ace: { cid: t.cid, tid: t.id }, race: x.race, rel: x.rel, offers: offers || {}, build: x.build });
    }
    function trainingFamily(parents) {
      const v = parents[0], r = parents[1];
      return { p1: v ? member(v.self, v.tid) : null, g11: v ? member(v.parents[0]) : null, g12: v ? member(v.parents[1]) : null,
        p2: r ? member(r.self, r.tid) : null, g21: r ? member(r.parents[0]) : null, g22: r ? member(r.parents[1]) : null };
    }
    // A slot's spark value at its affinity in the complete family. Training counts white
    // hints and key-blue start stats; an ace also benefits from uniques and needed pinks.
    function contribution(f, s, x, slots, training) {
      const whites = s.white.filter(w => slots.includes(w.slot));
      const white = whites.reduce((n, w) => n + w.p * w.worth, 0), key = new Set(want(x).blue.map(b => b.i));
      const start = [0, 0, 0, 0, 0], miss = {};
      slots.forEach(k => { const m = f[k]; if (!m) return;
        if (m.blue && m.blue[1]) start[m.blue[0]] += F.START_BLUE[m.blue[1] - 1];
        if (m.pink && m.pink[1] && want(x).pink.some(p => p.i === m.pink[0])) miss[m.pink[0]] = (miss[m.pink[0]] == null ? 1 : miss[m.pink[0]]) * (1 - F.twice(F.PINK, m.pink[1], s.own[k]));
      });
      const blue = start.reduce((n, v, i) => n + (key.has(i) ? v : 0), 0) / F.STAT_PER_L;
      const green = training ? 0 : s.green.filter(w => slots.includes(w.slot)).reduce((n, w) => n + w.p * w.L, 0);
      const pink = training ? 0 : Object.values(miss).reduce((n, p) => n + (1 - p) * F.APT_L, 0);
      return { value: white + blue + green + pink, white, blue, green, pink, start, hints: whites.reduce((n, w) => n + w.p, 0) };
    }
    // Every version in umas (trainee ids) that could be Parent 1 for the ace, trained with a
    // parent deck that offers offers: the best two of your veterans as her parents (her G1s
    // shared with them), best first. Each { kind: "fresh", t, parents, f, s, extra, value, plan }.
    function rankFresh(x, vets, umas, offers, opts = {}) {
      const ace = x.ace.cid, out = [], seen = new Set(), r = rates(vets);
      (umas || []).map(trainee).filter(Boolean).forEach((t) => {
        if (+t.cid === +ace || seen.has(t.cid) || (o.chars && o.chars.indexOf(t.cid) === -1)) return;
        seen.add(t.cid);
        const base = freshMember(t), fit = fitsAll(t);
        const rent = rentalFor(ace, t.cid), p2 = rent ? charMember(rent.cid) : null;
        const rentalMode = opts.parentMode !== "veterans", pick = (opts.picks || {})[t.id] || {};
        const selectedVet = pick.veteran != null ? pick.veteran : opts.veteran;
        const selectedRental = opts.rental || (opts.rentals || []).find(r => r.friend === pick.rental);
        const pool = (vets || []).filter(v => +v.cid !== +t.cid && (!rentalMode || selectedVet == null || selectedVet === "" || String(v.id) === String(selectedVet)));
        const tx = trainingContext(x, t, offers);
        const total = (f) => { const s = fam.score(familyOf(f), x); return { s, extra: freshExtra(x, t, s, offers, r) }; };
        // Each veteran alone as her parent (sharing the G1s she can run), the best per character.
        const solo = new Map();
        pool.forEach((v) => {
          const f = { p1: Object.assign({}, base, { wins: (v.self.wins || []).filter((n) => fit.has(n)) }), g11: member(v.self, v.tid), p2 };
          const y = total(f), tf = trainingFamily([v]), ts = fam.score(familyOf(tf), tx);
          const value = y.s.value + y.extra.value + (rentalMode ? contribution(tf, ts, tx, F.SLOTS, true).value : 0), cur = solo.get(v.cid);
          if (!cur || value > cur.value) solo.set(v.cid, { v, value });
        });
        const top = [...solo.values()].sort((a, b) => b.value - a.value).slice(0, GRAND_SHORT);
        const tryParents = (ps) => {
          const pl = plan(t, ps, [], selectedRental ? selectedRental.parent.wins : []);
          const f = { p1: Object.assign({}, base, { wins: pl.agenda.map((z) => z.name) }), g11: member(ps[0].self, ps[0].tid), g12: ps[1] ? member(ps[1].self, ps[1].tid) : null, p2 };
          const y = total(f);
          const tf = trainingFamily(ps), ts = fam.score(familyOf(tf), tx);
          const training = contribution(tf, ts, tx, F.SLOTS, true);
          return y.s.problems.length || ts.problems.length ? null : { kind: "fresh", t, parents: ps, f, s: y.s, extra: y.extra, value: y.s.value + y.extra.value,
            selectionValue: y.s.value + y.extra.value + training.value, rent, plan: pl, rates: r, offers, parentMode: rentalMode ? "rental" : "veterans", rental: rentalMode ? selectedRental || null : null };
        };
        let best = null;
        if (rentalMode) {
          [...solo.values()].forEach(a => {
            const rental = selectedRental && +selectedRental.parent.cid !== +t.cid && +selectedRental.parent.cid !== +a.v.cid ? selectedRental : null;
            // A saved rental that cannot join this pair is never silently substituted.
            if (selectedRental && !rental) return;
            const c = tryParents([a.v].concat(rental ? [asVeteran(rental)] : []));
            if (c && (!best || c.selectionValue > best.selectionValue)) best = c;
          });
        } else {
          top.forEach((a, i) => top.slice(i + 1).forEach((b) => { const c = tryParents([a.v, b.v]); if (c && (!best || c.value > best.value)) best = c; }));
          if (!best && top.length === 1) best = tryParents([top[0].v]);
        }
        if (best) out.push(best);
      });
      return out.sort((a, b) => b.value - a.value);
    }
    // Is your best veteran good enough? A fresh one is worth training when she'd beat it by MARGIN.
    const freshWins = (vet, fresh) => !!fresh && (!vet || fresh.value > vet.value * (1 + MARGIN));

    // ---- her races ----
    // The G1s your veterans (and the parents they were trained with, many of them rentals) won,
    // most first: the ones a rental Parent 2 most likely shares.
    function popular(vets) {
      const n = new Map();
      (vets || []).forEach((v) => [v.self].concat(v.parents || []).forEach((m) => { if (m) (m.wins || []).forEach((w) => n.set(w, (n.get(w) || 0) + 1)); }));
      return g1s.map((r) => r.name).filter((name) => n.get(name)).sort((a, b) => n.get(b) - n.get(a) || a.localeCompare(b)).map((name) => ({ name, n: n.get(name) }));
    }
    // A fresh Parent 1's race plan: career goals, the G1s shared with her parents, then the
    // popular ones; agenda races carry rank (extra races only: the first n make a plan of n).
    function racePlan(fresh, vets) {
      const pop = popular(vets), t = fresh.t;
      const pl = plan(t, fresh.parents, pop.map((p) => p.name), fresh.rental ? fresh.rental.parent.wins : []);
      const count = new Map(pop.map((p) => [p.name, p.n]));
      pl.agenda.forEach((r) => { r.pop = count.get(r.name) || 0; });
      // Her other career goal races, for her calendar (the agenda has the ones that add affinity).
      const g = A.careerGoals(t.cid), have = new Set(pl.agenda.filter((r) => r.free).map((r) => r.name + "@" + r.turn));
      const info = (name) => {
        const r = g1Map.get(name);
        return r ? { d: r.d, s: r.s, aptGrades: t.apt ? [t.apt[r.s === 2 ? 1 : 0], t.apt[DIST(r.d)]] : null } : {};
      };
      pl.goals = g.fixed.filter((x) => !have.has(x.name + "@" + x.turn)).map((x) => Object.assign({ name: x.name, turn: x.turn, free: true, goal: "fixed", with: [] }, info(x.name)))
        .concat(g.choices.filter((opts) => !opts.some((x) => have.has(x.name + "@" + x.turn)))
          .map((opts) => Object.assign({ name: opts.map((x) => x.name).join(" or "), turn: opts[0].turn, free: true, goal: "open", with: [], options: opts.map((x) => x.name) }, info(opts[0].name))));
      return pl;
    }
    // The agenda for n extra races (career goals always).
    const upTo = (pl, n) => pl.agenda.filter((r) => r.free || r.rank < n);

    // ---- how many races keep her at the selected rank ----
    // A veteran's extra races: those she ran before the finale beyond her career goals.
    const goalCount = (cid) => { const g = A.careerGoals(cid); return g.fixed.length + g.choices.length; };
    const extraOf = (v) => (v.races == null ? null : v.races - goalCount(v.cid));
    // Your veterans in this scenario that ran next to no extra races (BASE_EXTRA or fewer): the
    // ratings you really reach there. null when there are fewer than BASE_MIN of them.
    function baseline(vets, scenario, minimum = o.SS) {
      const xs = (vets || []).filter((v) => v.scenario === scenario && v.score > 0 && extraOf(v) != null && extraOf(v) <= BASE_EXTRA);
      if (xs.length < BASE_MIN) return null;
      const more = (vets || []).filter((v) => v.scenario === scenario && v.score > 0 && extraOf(v) > BASE_EXTRA);
      return { scores: xs.map((v) => v.score), ss: xs.filter((v) => v.score >= minimum).length, n: xs.length, more: { n: more.length, ss: more.filter((v) => v.score >= minimum).length } };
    }
    // The most extra races that keep SS_SHARE of those runs at minimum (SS by default), each costing perRace
    // rating (the simulation's slope), up to max. { n, ss, of } at that count.
    function ssLimit(base, perRace, max, minimum = o.SS) {
      if (minimum <= 0) return { n: max, ss: base.n, of: base.n };
      const at = (n) => base.scores.filter((s) => s - perRace * n >= minimum).length;
      let n = 0;
      if (at(0) < SS_SHARE * base.n) return { n: 0, ss: at(0), of: base.n, none: true };
      while (n < max && at(n + 1) >= SS_SHARE * base.n) n++;
      return { n, ss: at(n), of: base.n };
    }

    // ---- Parent 2: uma.moe, then the rentals you paste ----
    // The whites still worth a spark from Parent 2: each relevant one by what it's worth to the
    // ace (her deck's offers counted) × the chance her family so far doesn't give its hint.
    function missingWhites(x, s) {
      const have = new Map((s.skills || []).map((k) => [String(k.id), k.p]));
      return want(x).white.map((w) => ({ id: w.id, L: w.L, need: w.priority * (1 - (have.get(String(w.id)) || 0)) }))
        .filter((w) => w.need > 0.01).sort((a, b) => b.need - a.need);
    }
    // Both searches share the same codec and defaults. One stat, on the rental and across
    // her branch; no total-any-stat shortcut, pink requirement, or preferred-white sort by default.
    function umaMoe(q) {
      const c = { t: [q.ace ? +q.ace : null, null, null, null, null, null, null] };
      if (q.p1 && q.p1.tid) {
        c.p2c = +q.p1.tid;
        if (q.p1.saddles && q.p1.saddles.length) c.p2w = [...new Set(q.p1.saddles.map(Number))];
      }
      const blue = Array.isArray(q.blue) ? q.blue[0] : q.blue, broad = q.quality === "broad";
      if (BLUE_IDS[blue]) { c.mb = [[BLUE_IDS[blue], broad ? 2 : 3, 3]]; c.b = [[BLUE_IDS[blue], broad ? 6 : 7, 9]]; }
      const factor = (id) => meta[id] ? +meta[id][0] * 10 : null;
      const ws = new Map();
      (q.whites || []).forEach((w) => {
        const id = factor(typeof w === "object" ? w.id : w), priority = typeof w === "object" ? Math.max(0, Math.floor(w.priority || 0)) : 0;
        if (id && (!ws.has(id) || priority < ws.get(id))) ws.set(id, priority);
      });
      const required = [...new Set((q.required || []).map(factor).filter(Boolean))].slice(0, 2);
      required.forEach((id) => ws.delete(id));
      if (q.sort === "whites" && ws.size) {
        c.ow = [...ws].map(([id, p]) => p ? [id, p] : id);
        const main = [...ws].filter(([, p]) => p === 0).map(([id]) => id);
        if (main.length) c.omw = main;
      }
      if (required.length) c.w = required.map((id) => [id, 1, 9]);
      if (q.pink && PINK_IDS[q.pink.i]) c.p = [[PINK_IDS[q.pink.i], 3, 9]];
      if (q.green && q.green.length) c.mg = [...new Set(q.green)].map((tid, k) => k ? [+tid * 10, 1, 3, 1] : [+tid * 10, 1, 3]);
      const excluded = [...new Set([q.ace, q.p1 && q.p1.tid].filter(Boolean).map((id) => Math.floor(+id / 100)))];
      if (excluded.length) c.emp = excluded;
      return { url: UMA_MOE + "?filters=" + encodeURIComponent(b64(JSON.stringify(c))), filters: c };
    }
    function rentalSearch(x, p1, opts = {}) {
      const needs = want(x), course = x.race.preset.course;
      const indexes = [...new Set([course.surface === "Dirt" ? 1 : 0, DIST(course.distance), STYLE_INDEX[x.race.style]].filter((i) => i != null))];
      const choices = indexes.map((i) => ({ i, label: MOE_STYLES[i] || F.APT_LABELS[i], grade: (x.ace.apt || [])[i] || "?", needed: needs.pink.some((p) => p.i === i) }));
      const auto = choices.find((p) => p.needed) || choices.find((p) => p.i === DIST(course.distance));
      const focus = opts.pink === "auto" ? auto : choices.find((p) => String(p.i) === String(opts.pink));
      const pink = focus ? Object.assign({}, focus, { min: 3, main: false }) : null;
      const blueIndex = opts.blue != null && opts.blue !== "auto" && BLUE_IDS[+opts.blue] ? +opts.blue : (needs.blue[0] || { i: 0 }).i;
      const blue = [{ i: blueIndex, label: F.STAT_LABELS[blueIndex] }];
      const whites = missingWhites(x, p1.s).slice(0, 12).map((w, i) => Object.assign({}, w, { priority: i < 3 ? 0 : i < 7 ? 1 : 2 }));
      // At most two explicitly checked families; keep them visible after a deck change.
      const families = new Set(), required = [];
      (opts.required || []).map(String).filter(id => meta[id]).forEach(id => { if (required.length < 2 && !families.has(meta[id][0])) { families.add(meta[id][0]); required.push(id); } });
      required.forEach((id) => { if (!whites.some((w) => meta[w.id][0] === meta[id][0])) whites.push({ id, priority: 0, need: 0, L: 0 }); });
      const green = needs.green.map((g) => Object.assign({}, g, { owners: g.owners.filter((t) => +t.cid !== +x.ace.cid && +t.cid !== +p1.f.p1.cid && (!o.today || t.en && t.en <= o.today)) }))
        .filter((g) => g.owners.length).slice(0, 3);
      const saddles = [...new Set(opts.saddles || saddlesOf(p1))], broad = opts.quality === "broad", sort = opts.sort === "whites" ? "whites" : "affinity";
      const q = { ace: x.ace.tid, p1: { tid: p1.f.p1.tid, saddles }, blue: blueIndex, pink, whites, required, sort, quality: broad ? "broad" : "recommended" };
      return Object.assign(umaMoe(q), { q, blue, pink, choices, whites, required, green, wins: saddles.length, broad, sort,
        focused: green.map((g) => ({ skill: g, search: Object.assign(umaMoe(Object.assign({}, q, { green: g.owners.map((t) => t.id) })), { q: Object.assign({}, q, { green: g.owners.map((t) => t.id) }) }) })) });
    }
    // All fields set by umaMoe, including a unique-focus link's extra requirement.
    function searchSummary(search, skillName = id => String(id)) {
      const q = search.q, c = search.filters, tn = id => { const t = trainee(id); return t ? t.n + " [" + t.t + "]" : "#" + id; };
      const char = cid => { const t = o.trainees.find(t => +t.cid === +cid); return t ? t.n : "#" + cid; };
      const required = new Set((q.required || []).map(id => meta[id] && meta[id][0]));
      const names = (q.whites || []).filter(w => !required.has(meta[w.id] && meta[w.id][0])).map(w => skillName(w.id) + (q.sort === "whites" ? " (P" + w.priority + ")" : ""));
      const lines = ["Target: " + tn(c.t[0]), "Legacy: " + (c.p2c ? tn(c.p2c) + " · " + (c.p2w || []).length + " G1 wins" : "none")];
      if (c.mb) lines.push("Blue: " + F.STAT_LABELS[BLUE_IDS.indexOf(c.mb[0][0])] + " · own " + c.mb[0][1] + "–3★ · lineage " + c.b[0][1] + "–9★");
      lines.push("Pink: " + (c.p ? (MOE_STYLES[PINK_IDS.indexOf(c.p[0][0])] || F.APT_LABELS[PINK_IDS.indexOf(c.p[0][0])]) + " · lineage 3–9★; no own minimum" : "off"));
      lines.push("Required whites: " + (q.required.length ? q.required.map(skillName).join(", ") + " · 1–9★ each; all required" : "none"));
      lines.push((q.sort === "whites" ? "Preferred whites: " : "Whites to look for (no filter): ") + (names.join(", ") || "none"));
      if (c.omw) lines.push("Own preferred whites: " + q.whites.filter(w => w.priority === 0 && !required.has(meta[w.id][0])).map(w => skillName(w.id) + " (P0)").join(", "));
      if (c.mg) lines.push("Own unique: " + q.green.map(tn).join(" or ") + " · 1–3★");
      lines.push("Exclude: " + (c.emp || []).map(char).join(", ") + " (all versions)", "Sort: " + (q.sort === "whites" ? "P0, P1, P2, then affinity" : "affinity first"), "Any rental rank · trainers below 1,000 followers (site default)");
      return lines;
    }
    // X is the target; V is the other parent. X's race whites are the ace's relevant
    // whites, with X's own skills and parent-deck offers supplying their hint-discount value.
    function trainingRentalSearch(x, fresh, opts = {}) {
      const v = fresh.parents[0], tx = trainingContext(x, fresh.t, fresh.offers);
      const f = { p1: member(v.self, v.tid), g11: member(v.parents[0]), g12: member(v.parents[1]) };
      const s = fam.score(familyOf(f), tx);
      return rentalSearch(tx, { kind: "vet", v, f, s }, opts);
    }
    function trainingStart(x, fresh) {
      return fam.score(familyOf(trainingFamily(fresh.parents)), trainingContext(x, fresh.t, fresh.offers)).start;
    }
    function withTrainingRental(x, fresh, rental, vets, maxRaces = Infinity) {
      const parents = [fresh.parents[0], asVeteran(rental)];
      const out = Object.assign({}, fresh, { parents, rental });
      const races = racePlan(out, vets || []), wins = upTo(races, maxRaces).map(r => r.name);
      out.f = Object.assign({}, fresh.f, { p1: Object.assign({}, fresh.f.p1, { wins }), g11: member(parents[0].self, parents[0].tid), g12: member(rental.parent) });
      out.s = fam.score(familyOf(out.f), x);
      out.extra = freshExtra(x, out.t, out.s, out.offers, out.rates);
      out.value = out.s.value + out.extra.value;
      return out;
    }
    function rankTrainingRentals(x, fresh, rentals, opts = {}) {
      const rows = [], hidden = [], v = fresh.parents[0], tx = trainingContext(x, fresh.t, fresh.offers);
      (rentals || []).forEach(r => {
        if (+r.parent.cid === +fresh.t.cid || +r.parent.cid === +v.cid) { hidden.push({ r, why: "same character as the parent you're training or her veteran" }); return; }
        const next = withTrainingRental(x, fresh, r, opts.vets, opts.maxRaces);
        const tf = trainingFamily(next.parents), ts = fam.score(familyOf(tf), tx);
        const problems = next.s.problems.concat(ts.problems);
        if (problems.length) { hidden.push({ r, why: problems[0] }); return; }
        const acePart = contribution(next.f, next.s, x, ["g12"], false);
        const trainingPart = contribution(tf, ts, tx, ["p2", "g21", "g22"], true);
        rows.push({ r, fresh: next, f: next.f, s: next.s, trainingScore: ts, acePart, trainingPart, value: acePart.value + trainingPart.value });
      });
      rows.sort((a, b) => b.value - a.value || b.s.total - a.s.total);
      return Object.assign(rows, { hidden });
    }
    // Parent 1's G1 saddles for uma.moe: a veteran's own, or a fresh one's planned wins.
    const saddlesOf = (p1) => [...new Set((p1.kind === "vet" ? p1.v.saddles || [] : []).concat((p1.f.p1.wins || []).map(n => saddleOf[n]).filter(Boolean)))];
    // Pasted rentals (rentals.js) as Parent 2 with this Parent 1 (her family kept), best first.
    function rankRentals(x, p1, rentals) {
      const rows = [], hidden = [];
      (rentals || []).forEach((r) => {
        if (+r.parent.cid === +x.ace.cid) { hidden.push({ r, why: "same character as the ace" }); return; }
        if (+r.parent.cid === +p1.f.p1.cid) { hidden.push({ r, why: "same character as Parent 1" }); return; }
        const f = Object.assign({}, p1.f, { p2: member(r.parent), g21: member(r.parents[0]), g22: member(r.parents[1]) });
        const s = fam.score(familyOf(f), x);
        // A fresh Parent 1's expected sparks are scored at her affinity with this rental.
        const extra = p1.kind === "fresh" ? freshExtra(x, p1.t, s, p1.offers, p1.rates).value : 0;
        if (s.problems.length) hidden.push({ r, why: s.problems[0] }); else rows.push({ r, f, s, value: s.value + extra });
      });
      rows.sort((a, b) => b.value - a.value || b.s.total - a.s.total);
      return Object.assign(rows, { hidden });
    }

    return { context, rankVets, rankFresh, freshWins, racePlan, upTo, popular, rates, freshWhites, extraOf, baseline, ssLimit, missingWhites, umaMoe, rentalSearch, searchSummary, trainingRentalSearch, rankTrainingRentals, trainingFamily, trainingStart, saddlesOf, rankRentals, want, rentalFor, fam, inherited, trainee };
  }

  const api = { create, MARGIN, FRESH_STARS, SS_SHARE, SPARK_P, STARS, LEARN_MAX, BASE_EXTRA, BASE_MIN, BLUE_IDS, PINK_IDS, UMA_MOE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaCmPlan = api;
})(typeof window !== "undefined" ? window : globalThis);
