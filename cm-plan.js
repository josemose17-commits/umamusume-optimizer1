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
  const SS_STARS = [0.2, 0.7, 0.1], LINEAGE_WHITE = 0.025;
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
    // A character standing in for a rental you haven't picked (no sparks or wins known).
    const charMember = (cid) => Object.assign(blank(), { cid, standIn: true });
    const familyOf = (f) => { const out = {}; F.SLOTS.forEach((k) => { out[k] = f[k] || null; }); return out; };

    // The x family.js scores against: the ace ({ cid, tid, apt }), her race ({ preset, style }),
    // rel (her relevant skills with every charted skill's L), offers (her deck's), build, chars.
    function context(c) {
      const t = trainee(c.ace.tid);
      const L = (c.rel && c.rel.L) || {};
      const uniques = Object.keys(L).filter((id) => /^9\d+$/.test(id) && owners.has(id)).map((id) => ({ id, L: L[id], owners: owners.get(id) }));
      // gaps: the ace's shortfall per stat (CM & decks' prediction against her targets), or null.
      return { ace: { cid: c.ace.cid, tid: c.ace.tid, apt: c.ace.apt || (t ? t.apt : null) }, race: c.race, rel: c.rel, raceL: L, offers: c.offers || null, innate: t ? [].concat(t.is || [], t.as || []) : [], build: c.build, gaps: c.gaps || null, chars: [], mine: [], uniques, fam: {} };
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
      // You always train a parent to SS, where white and green sparks come out 1★/2★/3★ 20/70/10%
      // (uma.guide), whatever ranks your veterans reached.
      return { spark, stars: SS_STARS.slice(), learn: enough ? Math.round(counts[counts.length >> 1] * LEARN_SHARE) : LEARN_MAX, vets: enough ? with_.length : 0 };
    }
    // Her white sparks in expectation: she learns the relevant whites her parent deck offers
    // (offers: { id: chance }), the most valuable first, up to r.learn of them; each becomes a
    // spark r.spark of the time, at r.stars, firing at her affinity aff.
    // copies: { family: how many of her parents and grandparents carry that white spark }; each
    // copy adds LINEAGE_WHITE to the chance a learned skill leaves its spark (uma.guide: 20% →
    // 22.5% → 25%…; the parenting guide has ×1.1 per copy instead, about the same for 1–3).
    // cover: how likely the ace already gets each white from the rest of her family
    // (familyCover); a white she'd get anyway is worth that much less on this parent.
    function freshWhites(x, offers, aff, r, copies, cover) {
      const fams = fam.families(x.rel), eff = fam.worthOf(x), cv = (f) => (cover && cover[f]) || 0;
      const fire = r.stars.reduce((n, d, k) => n + d * F.twice(F.WHITE, k + 1, aff), 0);
      const got = Object.keys(fams).map((f) => ({ f, p: Math.min(1, Math.max(0, ...fams[f].ids.map((id) => (offers && offers[id]) || 0))) }))
        .filter((a) => a.p > 0).sort((a, b) => eff[b.f] * (1 - cv(b.f)) - eff[a.f] * (1 - cv(a.f)) || b.p - a.p);
      let room = r.learn, value = 0;
      const list = [];
      got.forEach((a) => {
        const p = Math.min(a.p, room);
        if (p <= 0) return;
        room -= p;
        const chance = Math.min(1, r.spark + LINEAGE_WHITE * ((copies && copies[a.f]) || 0));
        value += p * chance * fire * eff[a.f] * (1 - cv(a.f));
        list.push({ id: fam.baseWhite(fams[a.f].ids[0]), learn: p, spark: p * chance, L: eff[a.f], copies: (copies && copies[a.f]) || 0, cover: cv(a.f) });
      });
      return { value, list, fire };
    }
    // The pink the ace needs most with this family (s: her family's score): an aptitude still
    // below A it doesn't lift, else the one your rule takes to S. Same order as the searches.
    function pinkFocus(x, s) {
      const needs = want(x).pink, lifted = (i) => { const q = ((s && s.pink) || []).find((y) => y.i === i); return q ? q.p : 0; };
      return needs.find((p) => p.target === "A" && lifted(p.i) < 0.9) || needs.find((p) => p.target === "S") || needs[0] || null;
    }
    // Independent Training's prioritized skills (the game takes up to 10): the race's whites her
    // deck can offer, most valuable as a spark for the ace first (worth × chance the deck offers
    // it). The gold version when her deck offers it (a learned gold doubles the spark chance).
    // Slots left over go to the best whites no card of hers gives, in case a random event does.
    // anyway: skill ids one of her deck's events gives on every choice (most gold-skill events do):
    // they come whatever the AI picks, so they take no slot (listed apart, with .anyway).
    let famMembers = null;
    function itSkills(x, offers, n = 10, anyway = new Set(), cover = {}) {
      if (!famMembers) { famMembers = {}; Object.keys(meta).forEach((id) => { (famMembers[meta[id][0]] = famMembers[meta[id][0]] || []).push(id); }); }
      const fams = fam.families(x.rel), eff = fam.worthOf(x), o2 = offers || {}, rows = [];
      Object.keys(fams).forEach((f) => {
        if (!(eff[f] > 0)) return;
        const all = famMembers[f] || fams[f].ids, p = Math.min(1, Math.max(0, ...all.map((id) => o2[id] || 0)));
        const gold = all.filter((id) => meta[id] && meta[id][2] && o2[id] > 0).sort((a, b) => o2[b] - o2[a])[0];
        const white = fam.baseWhite(fams[f].ids[0]), id = String(gold || white);
        const c = cover[f] || 0;
        rows.push({ family: f, id, white: String(white), gold: !!gold, p, L: eff[f], cover: c, score: eff[f] * p * (1 - c), gamble: !(p > 0), anyway: anyway.has(id) || (gold && anyway.has(String(gold))) || false });
      });
      const offered = rows.filter((r) => !r.gamble && !r.anyway).sort((a, b) => b.score - a.score || b.L - a.L);
      const rest = rows.filter((r) => r.gamble).sort((a, b) => b.L * (1 - b.cover) - a.L * (1 - a.cover));
      return Object.assign(offered.concat(rest).slice(0, n), { anyway: rows.filter((r) => r.anyway).sort((a, b) => b.L - a.L) });
    }
    // Her blue spark's stat is random (1 in 5 each), its stars 20/70/10% (her stats at SS are 1100+):
    // what it adds over the run where the ace is short (her gaps), else on the key stats.
    function blueExpected(x, aff) {
      const w = want(x), per = SS_STARS.reduce((n, d, k) => n + d * F.blueStats(k + 1, aff), 0);
      return w.blue.reduce((n, b) => n + (w.gaps ? Math.min(per, b.gap) : per), 0) / 5 / F.STAT_PER_L;
    }
    // Her pink spark lands on one of her A-or-better aptitudes at random, 20/70/10% by stars: the
    // share that's one the ace needs, as the chance it fires and takes that aptitude a grade on.
    function pinkExpected(x, t, aff, s) {
      const good = (t.apt || []).filter((g) => g === "S" || g === "A").length;
      if (!good) return 0;
      const fire = SS_STARS.reduce((n, d, k) => n + d * F.twice(F.PINK, k + 1, aff), 0);
      return want(x).pink.filter((p) => ["S", "A"].indexOf((t.apt || [])[p.i]) !== -1)
        .reduce((n, p) => { const now = s && s.pink ? (s.pink.find((q) => q.i === p.i) || { p: 0 }).p : 0; return n + (1 - now) * fire / good * F.APT_L; }, 0);
    }
    // How many of her parents and grandparents carry each relevant white spark.
    function lineageCopies(x, parents) {
      const out = {};
      (parents || []).forEach((v) => [v.self].concat(v.parents || []).forEach((m) => {
        if (!m) return;
        new Set((m.white || []).map((w) => fam.family(w[0]))).forEach((f) => { if (f) out[f] = (out[f] || 0) + 1; });
      }));
      return out;
    }
    // What a parent built for this race carries for sure: her inherited unique (2★); her whites,
    // pink and blue are added in expectation, her wins come from her race plan.
    function freshMember(t) {
      const u = inherited(t);
      return { cid: t.cid, tid: t.id, white: [], blue: [0, 0], pink: [0, 0], green: u ? FRESH_STARS : 0, wins: [], unique: u };
    }
    // The family score's parts for her that it can't count itself, at her own affinity there.
    // How likely the ace already gets each white family's hint from her family without Parent 1
    // (her veteran, the grandparent, Parent 2's side): 1 − Π(1 − each spark's chance).
    function familyCover(s) {
      const miss = {};
      ((s && s.white) || []).forEach((w) => { if (w.slot === "p1") return; const f = fam.family(w.id); if (f == null) return; miss[f] = (miss[f] == null ? 1 : miss[f]) * (1 - w.p); });
      const out = {};
      Object.keys(miss).forEach((f) => { out[f] = 1 - miss[f]; });
      return out;
    }
    function freshExtra(x, t, s, offers, r, parents) {
      const aff = s.own.p1 || 0, w = freshWhites(x, offers, aff, r, lineageCopies(x, parents), familyCover(s));
      const blue = blueExpected(x, aff), pink = pinkExpected(x, t, aff, s);
      return { value: w.value + blue + pink, whites: w, blue, pink };
    }
    // Her G1 plan with these parents (veterans or a rental) (extra: more G1s after the shared ones).
    function plan(t, parents, extra, priorityWins) {
      return A.planRaces({ self: t.cid, apt: t.apt, minGrade: "B", links: parents.map((v, i) => ({ role: i ? "g12" : "g11", cid: v.cid, wins: v.self.wins })), need: Infinity, extra: extra || [], priorityWins: priorityWins || [] });
    }
    const asVeteran = r => ({ id: "rental:" + r.friend, cid: r.parent.cid, tid: r.parent.tid, self: r.parent, parents: r.parents, rental: r.friend });
    function trainingContext(x, t, offers) {
      // The parent you train looks for the blues that fill the ace's gaps.
      return context({ ace: { cid: t.cid, tid: t.id }, race: x.race, rel: x.rel, offers: offers || {}, build: x.build, gaps: x.gaps });
    }
    function trainingFamily(parents) {
      const v = parents[0], r = parents[1];
      return { p1: v ? member(v.self, v.tid) : null, g11: v ? member(v.parents[0]) : null, g12: v ? member(v.parents[1]) : null,
        p2: r ? member(r.self, r.tid) : null, g21: r ? member(r.parents[0]) : null, g22: r ? member(r.parents[1]) : null };
    }
    // A slot's spark value at its affinity in the complete family. Training counts white
    // hints and key-blue start stats; an ace also benefits from uniques and needed pinks.
    function contribution(f, s, x, slots, training) {
      const whites = s.white.filter(w => slots.includes(w.slot)), w = want(x);
      const white = whites.reduce((n, q) => n + q.p * q.worth, 0), key = new Set(w.blue.map(b => b.i));
      const stats = [0, 0, 0, 0, 0], start = [0, 0, 0, 0, 0], pinks = {};
      slots.forEach(k => { const m = f[k]; if (!m) return;
        if (m.blue && m.blue[1]) { stats[m.blue[0]] += F.blueStats(m.blue[1], s.own[k], F.slotScale(k)); start[m.blue[0]] += F.START_BLUE[m.blue[1] - 1]; }
        if (m.pink && m.pink[1]) (pinks[m.pink[0]] = pinks[m.pink[0]] || []).push({ stars: m.pink[1], aff: s.own[k], scale: F.slotScale(k) });
      });
      // Training a parent: every stat she gains counts. The ace: what fills her gaps (else key stats).
      const blue = stats.reduce((n, v, i) => n + (training ? v : w.gaps ? Math.min(v, w.gaps[i] || 0) : key.has(i) ? v : 0), 0) / F.STAT_PER_L;
      const green = training ? 0 : s.green.filter(q => slots.includes(q.slot)).reduce((n, q) => n + q.p * q.L, 0);
      const pink = training ? 0 : w.pink.reduce((n, p) => n + F.pinkReach(p.grade, p.target, pinks[p.i] || []) * F.APT_L, 0);
      return { value: white + blue + green + pink, white, blue, green, pink, start, stats, hints: whites.reduce((n, q) => n + q.p, 0) };
    }
    // Every version in umas (trainee ids) that could be Parent 1 for the ace, trained with a
    // parent deck that offers offers: one veteran plus a rental, or two veterans, sharing
    // their G1s. The veteran is chosen for both the ace and her own career. Each { kind: "fresh", t, parents, f, s, extra, value, plan }.
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
        // Never the ace's own character: as the ace's grandparent she'd have no affinity with her
        // (affinity.js counts a character with herself as 0; Prydwen's legacies guide agrees).
        const eligible = (vets || []).filter(v => +v.cid !== +t.cid && +v.cid !== +ace);
        const chosenVet = rentalMode && selectedVet != null && selectedVet !== "" ? String(selectedVet) : null;
        const pool = eligible;
        const tx = trainingContext(x, t, offers);
        const total = (f, ps) => { const s = fam.score(familyOf(f), x); return { s, extra: freshExtra(x, t, s, offers, r, ps) }; };
        // Each veteran alone as her parent (sharing the G1s she can run), the best per character.
        const solo = new Map();
        pool.forEach((v) => {
          const f = { p1: Object.assign({}, base, { wins: (v.self.wins || []).filter((n) => fit.has(n)) }), g11: member(v.self, v.tid), p2 };
          const y = total(f, [v]), tf = trainingFamily([v]), ts = fam.score(familyOf(tf), tx);
          const value = y.s.value + y.extra.value + (rentalMode ? contribution(tf, ts, tx, F.SLOTS, true).value : 0), cur = solo.get(v.cid);
          if (!cur || value > cur.value) solo.set(v.cid, { v, value });
        });
        const top = [...solo.values()].sort((a, b) => b.value - a.value).slice(0, GRAND_SHORT);
        const tryParents = (ps) => {
          const pl = plan(t, ps, [], selectedRental ? selectedRental.parent.wins : []);
          const f = { p1: Object.assign({}, base, { wins: pl.agenda.map((z) => z.name) }), g11: member(ps[0].self, ps[0].tid), g12: ps[1] ? member(ps[1].self, ps[1].tid) : null, p2 };
          const y = total(f, ps);
          const tf = trainingFamily(ps), ts = fam.score(familyOf(tf), tx);
          const training = contribution(tf, ts, tx, F.SLOTS, true);
          return y.s.problems.length || ts.problems.length ? null : { kind: "fresh", t, parents: ps, f, s: y.s, extra: y.extra, value: y.s.value + y.extra.value,
            selectionValue: y.s.value + y.extra.value + training.value, rent, plan: pl, rates: r, offers, parentMode: rentalMode ? "rental" : "veterans", rental: rentalMode ? selectedRental || null : null };
        };
        let best = null;
        if (rentalMode) {
          // Every veteran (the best of each character) as her parent, ranked by what the pair
          // gives the ace and her own career; yours if you picked one, else the top.
          const ranked = [];
          (chosenVet ? pool.filter(v => String(v.id) === chosenVet).map(v => ({ v })) : []).concat([...solo.values()]).forEach(a => {
            if (ranked.some(y => y.v === a.v)) return;
            const rental = selectedRental && +selectedRental.parent.cid !== +t.cid && +selectedRental.parent.cid !== +a.v.cid ? selectedRental : null;
            // A saved rental that cannot join this pair is never silently substituted.
            if (selectedRental && !rental) return;
            const c = tryParents([a.v].concat(rental ? [asVeteran(rental)] : []));
            if (c) ranked.push({ v: a.v, value: c.selectionValue, c });
          });
          ranked.sort((a, b) => b.value - a.value);
          const mine = chosenVet && ranked.find(y => String(y.v.id) === chosenVet);
          best = mine ? mine.c : ranked[0] ? ranked[0].c : null;
          if (best) best.vetOptions = ranked.map(y => ({ v: y.v, value: y.value, f: y.c.f, s: y.c.s }));
        } else {
          top.forEach((a, i) => top.slice(i + 1).forEach((b) => { const c = tryParents([a.v, b.v]); if (c && (!best || c.value > best.value)) best = c; }));
          if (!best && top.length === 1) best = tryParents([top[0].v]);
        }
        if (best) out.push(best);
      });
      return out.sort((a, b) => b.value - a.value);
    }
    // The new parent you planned (plan: { tid, vet: her veteran's character, at: when planned }),
    // once you've trained her and imported her: a veteran of that version made after the plan,
    // or one with that veteran as a parent. The newest such one, or null.
    function trainedParent(plan, vets) {
      if (!plan || !plan.tid) return null;
      const t0 = Date.parse(plan.at || "") || 0, when = (v) => Date.parse(String(v.at || "").replace(" ", "T")) || 0;
      return (vets || []).filter((v) => +v.tid === +plan.tid && ((t0 && when(v) >= t0) || (v.parents || []).some((m) => m && plan.vet != null && +m.cid === +plan.vet)))
        .sort((a, b) => when(b) - when(a))[0] || null;
    }
    // Is your best veteran good enough? A fresh one is worth training when she'd beat it by MARGIN.
    const freshWins = (vet, fresh) => !!fresh && (!vet || fresh.value > vet.value * (1 + MARGIN));

    // ---- the ace's family affinity, before you borrow ----
    // The total the game will show when you pick her parents, with the slots you haven't
    // filled yet (the borrowed grandparent, Parent 2 and her parents) taken by the characters
    // with the most affinity there, as uma.moe's affinity sort finds them. A rental is assumed
    // to have won the G1s rentals most often win (popular(vets)); her own parents share those
    // with her. Known members keep their real wins. { total, symbol, known, filled: [slot] }.
    function outlook(x, f, vets) {
      const ace = +x.ace.cid, pop = popular(vets).slice(0, 12).map((p) => p.name), out = {}, filled = [];
      F.SLOTS.forEach((k) => { out[k] = f[k] && f[k].cid ? { cid: +f[k].cid, wins: (f[k].wins || []).slice(), known: !f[k].standIn } : null; });
      const pick = (others, avoid) => {
        let best = null;
        (o.chars || []).forEach((c) => { if (avoid.includes(+c)) return; const pts = A.together(ace, ...others, +c); if (!best || pts > best.pts) best = { cid: +c, pts }; });
        return best ? best.cid : null;
      };
      const rent = (k, cid) => { if (cid) { out[k] = { cid, wins: pop.slice(), known: false }; filled.push(k); } };
      if (out.p1 && !out.g12) rent("g12", pick([out.p1.cid], [ace, out.p1.cid, out.g11 && out.g11.cid]));
      if (out.p1 && (!out.p2 || !out.p2.known)) {
        let best = null;
        (o.chars || []).forEach((c) => { if ([ace, out.p1.cid].includes(+c)) return; const pts = A.together(ace, +c) + A.together(out.p1.cid, +c); if (!best || pts > best.pts) best = { cid: +c, pts }; });
        rent("p2", best && best.cid);
      }
      if (out.p2 && !out.p2.known) { rent("g21", pick([out.p2.cid], [ace, out.p2.cid])); rent("g22", pick([out.p2.cid], [ace, out.p2.cid, out.g21 && out.g21.cid])); }
      const L = { trainee: ace }, wins = {};
      F.SLOTS.forEach((k) => { L[k] = out[k] ? out[k].cid : null; if (out[k]) wins[k] = out[k].wins; });
      const t = A.total(L, wins), knownL = { trainee: ace }, knownW = {};
      F.SLOTS.forEach((k) => { knownL[k] = out[k] && out[k].known ? out[k].cid : null; if (out[k] && out[k].known) knownW[k] = out[k].wins; });
      return { total: t.total, symbol: t.symbol, known: A.total(knownL, knownW).total, filled, family: out };
    }

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
    // q.own: only the rental's own sparks count (the grandparent: her parents would be the ace's
    // great-grandparents), so blue, pink and required whites go on her (mb, mp, mw), not her line.
    function umaMoe(q) {
      const c = { t: [q.ace ? +q.ace : null, null, null, null, null, null, null] }, own = !!q.own;
      if (q.p1 && q.p1.tid) {
        c.p2c = +q.p1.tid;
        if (q.p1.saddles && q.p1.saddles.length) c.p2w = [...new Set(q.p1.saddles.map(Number))];
      }
      const blue = Array.isArray(q.blue) ? q.blue[0] : q.blue, broad = q.quality === "broad";
      // blueRows: a planned split ({ main: [stat, min ★] on her, line: [[stat, min ★ across her and
      // her parents], …] }), else one stat on her and across her line.
      if (q.blueRows) {
        const br = q.blueRows;
        if (br.main && BLUE_IDS[br.main[0]]) c.mb = [[BLUE_IDS[br.main[0]], br.main[1], 3]];
        const line = own ? [] : (br.line || []).filter(([i, n]) => BLUE_IDS[i] && n > 0);
        if (line.length) c.b = line.map(([i, n]) => [BLUE_IDS[i], Math.min(9, n), 9]);
      } else if (BLUE_IDS[blue]) { c.mb = [[BLUE_IDS[blue], broad ? 2 : 3, 3]]; if (!own) c.b = [[BLUE_IDS[blue], broad ? 6 : 7, 9]]; }
      const factor = (id) => meta[id] ? +meta[id][0] * 10 : null;
      const ws = new Map();
      (q.whites || []).forEach((w) => {
        const id = factor(typeof w === "object" ? w.id : w), priority = typeof w === "object" ? Math.max(0, Math.floor(w.priority || 0)) : 0;
        if (id && (!ws.has(id) || priority < ws.get(id))) ws.set(id, priority);
      });
      const required = [...new Set((q.required || []).map(factor).filter(Boolean))];
      required.forEach((id) => ws.delete(id));
      if (q.sort === "whites" && ws.size) {
        if (own) c.omw = [...ws].map(([id, p]) => p ? [id, p] : id);
        else {
          c.ow = [...ws].map(([id, p]) => p ? [id, p] : id);
          const main = [...ws].filter(([, p]) => p === 0).map(([id]) => id);
          if (main.length) c.omw = main;
        }
      }
      if (required.length) c[own ? "mw" : "w"] = required.map((id) => [id, 1, own ? 3 : 9]);
      // Her own pink: 2–3★ (1–3★ wider); across a whole line: 3–9★.
      if (q.pink && PINK_IDS[q.pink.i]) c[own ? "mp" : "p"] = [[PINK_IDS[q.pink.i], own ? (broad ? 1 : 2) : 3, own ? 3 : 9]];
      if (q.green && q.green.length) c.mg = [...new Set(q.green)].map((tid, k) => k ? [+tid * 10, 1, 3, 1] : [+tid * 10, 1, 3]);
      const excluded = [...new Set([q.ace, q.p1 && q.p1.tid].filter(Boolean).map((id) => Math.floor(+id / 100)))];
      if (excluded.length) c.emp = excluded;
      return { url: UMA_MOE + "?filters=" + encodeURIComponent(b64(JSON.stringify(c))), filters: c };
    }
    // opts.pinkFor: whose aptitudes pink is for (the ace, when the target is the parent you train).
    function rentalSearch(x, p1, opts = {}) {
      const needs = want(x), course = x.race.preset.course, px = opts.pinkFor || x, pinks = want(px).pink;
      const indexes = [...new Set([course.surface === "Dirt" ? 1 : 0, DIST(course.distance), STYLE_INDEX[x.race.style]].filter((i) => i != null))];
      const choices = indexes.map((i) => { const n = pinks.find((p) => p.i === i); return { i, label: MOE_STYLES[i] || F.APT_LABELS[i], grade: (px.ace.apt || [])[i] || "?", needed: !!n, target: n ? n.target : null }; });
      // An aptitude still below A that her known family doesn't already lift first (1–3★ of pink
      // anywhere in the family lifts it to A at the start, for sure), then your rule's S (her
      // distance; her surface in a sprint), which only a pink firing at an inspiration gives.
      const fam = opts.pinkReach || (!opts.pinkFor && p1.s && p1.s.pink) || [];
      const lifted = (i) => { const q = fam.find((y) => y.i === i); return q ? q.p : 0; };
      const auto = choices.find((p) => p.needed && p.target === "A" && lifted(p.i) < 0.9) || choices.find((p) => p.needed && p.target === "S") || choices.find((p) => p.needed) || null;
      const mode = opts.pink == null || opts.pink === "auto" ? "auto" : opts.pink === "none" ? "none" : String(opts.pink);
      const focus = mode === "auto" ? auto : mode === "none" ? null : choices.find((p) => String(p.i) === mode);
      const pink = focus ? Object.assign({}, focus, { min: 3, main: false }) : null;
      // The gap her known family (Parent 1 and her parents, with their real sparks) leaves: the
      // rental's blue goes to the biggest one still open.
      const given = opts.given || (p1.s && p1.s.blueStats), remaining = x.gaps ? x.gaps.map((g, i) => Math.max(0, Math.round(g - ((given && given[i]) || 0)))) : null;
      const left = remaining && remaining.some((v) => v > 0) ? remaining.indexOf(Math.max(...remaining)) : null;
      const blueIndex = opts.blue != null && opts.blue !== "auto" && BLUE_IDS[+opts.blue] ? +opts.blue : left != null ? left : (needs.blue[0] || { i: 0 }).i;
      const blue = [{ i: blueIndex, label: F.STAT_LABELS[blueIndex] }];
      const whites = (opts.whites || missingWhites(x, p1.s)).slice(0, 12).map((w, i) => Object.assign({}, w, { priority: i < 3 ? 0 : i < 7 ? 1 : 2 }));
      // The whites you ticked (any number, one per family); kept visible after a deck change.
      const families = new Set(), required = [];
      (opts.required || []).map(String).filter(id => meta[id]).forEach(id => { if (!families.has(meta[id][0])) { families.add(meta[id][0]); required.push(id); } });
      required.forEach((id) => { if (!whites.some((w) => meta[w.id][0] === meta[id][0])) whites.push({ id, priority: 0, need: 0, L: 0 }); });
      const green = needs.green.map((g) => Object.assign({}, g, { owners: g.owners.filter((t) => +t.cid !== +x.ace.cid && +t.cid !== +p1.f.p1.cid && (!o.today || t.en && t.en <= o.today)) }))
        .filter((g) => g.owners.length).slice(0, 3);
      const saddles = [...new Set(opts.saddles || saddlesOf(p1))], broad = opts.quality === "broad", sort = opts.sort === "affinity" ? "affinity" : "whites";
      const q = { ace: x.ace.tid, p1: { tid: p1.f.p1.tid, saddles }, blue: blueIndex, blueRows: opts.blueRows || null, pink, whites, required, sort, quality: broad ? "broad" : "recommended", own: !!opts.own };
      return Object.assign(umaMoe(q), { q, blue, pink, auto, mode, remaining, given: given || null, choices, whites, required, green, wins: saddles.length, broad, sort,
        focused: green.map((g) => ({ skill: g, search: Object.assign(umaMoe(Object.assign({}, q, { green: g.owners.map((t) => t.id) })), { q: Object.assign({}, q, { green: g.owners.map((t) => t.id) }) }) })) });
    }
    // All fields set by umaMoe, including a unique-focus link's extra requirement.
    function searchSummary(search, skillName = id => String(id)) {
      const q = search.q, c = search.filters, tn = id => { const t = trainee(id); return t ? t.n + " [" + t.t + "]" : "#" + id; };
      const char = cid => { const t = o.trainees.find(t => +t.cid === +cid); return t ? t.n : "#" + cid; };
      const required = new Set((q.required || []).map(id => meta[id] && meta[id][0]));
      const names = (q.whites || []).filter(w => !required.has(meta[w.id] && meta[w.id][0])).map(w => skillName(w.id) + (q.sort === "whites" ? " (P" + w.priority + ")" : ""));
      const lines = ["Affinity target: " + tn(c.t[0]), "Other parent (legacy): " + (c.p2c ? tn(c.p2c) + " · her " + (c.p2w || []).length + " G1 wins" : "none")];
      const aptName = (id) => MOE_STYLES[PINK_IDS.indexOf(id)] || F.APT_LABELS[PINK_IDS.indexOf(id)], toS = q.pink && q.pink.target ? " (to take the ace to " + q.pink.target + ")" : "";
      const statName = (id) => F.STAT_LABELS[BLUE_IDS.indexOf(id)];
      if (c.mb || c.b) lines.push("Blue: " + [c.mb ? statName(c.mb[0][0]) + " " + (c.mb[0][1] === 3 ? "3★" : "2–3★") + " on the rental herself" : ""].concat(c.b ? c.b.map((row) => statName(row[0]) + " " + row[1] + "–9★ across her and her parents") : []).filter(Boolean).join(" · ") + (c.b ? "" : " (her own sparks only: her parents don't reach the ace)"));
      lines.push("Pink: " + (c.mp ? aptName(c.mp[0][0]) + " · " + c.mp[0][1] + "–3★ on the rental herself" + toS : c.p ? aptName(c.p[0][0]) + " · 3–9★ across her and her parents; none needed on her" + toS : "off"));
      lines.push("Required whites: " + (q.required.length ? q.required.map(skillName).join(", ") + (c.mw ? " · on the rental herself, 1–3★ each" : " · 1–9★ each") + "; all required" : "none"));
      lines.push((q.sort === "whites" ? (q.own ? "Her own preferred whites (rank, don't filter): " : "Preferred whites (rank, don't filter): ") : "Whites to look for (not in the link): ") + (names.join(", ") || "none"));
      if (c.omw && c.ow) lines.push("Own preferred whites: " + q.whites.filter(w => w.priority === 0 && !required.has(meta[w.id][0])).map(w => skillName(w.id) + " (P0)").join(", "));
      if (c.mg) lines.push("Own unique: " + q.green.map(tn).join(" or ") + " · 1–3★");
      lines.push("Exclude: " + (c.emp || []).map(char).join(", ") + " (all versions)", "Sort: " + (q.sort === "whites" ? "rentals with P0 whites first, then P1, P2, then affinity" : "affinity only"), "Any rental rank · trainers below 1,000 followers (site default)");
      return lines;
    }
    // X is the target; V is the other parent. X's race whites are the ace's relevant
    // whites, with X's own skills and parent-deck offers supplying their hint-discount value.
    function trainingRentalSearch(x, fresh, opts = {}) {
      const v = fresh.parents[0], tx = trainingContext(x, fresh.t, fresh.offers);
      const f = { p1: member(v.self, v.tid), g11: member(v.parents[0]), g12: member(v.parents[1]) };
      const s = fam.score(familyOf(f), tx);
      // Her grandparent is the ace's grandparent too: pink by the ace's rule, the ace's missing whites.
      // Only her own sparks reach the ace (her parents would be great-grandparents), so the search
      // asks for them on her: own blue, own pink, own required whites.
      return rentalSearch(tx, { kind: "vet", v, f, s }, Object.assign({}, opts, { whites: missingWhites(x, fresh.s), pinkFor: x, own: true, given: fresh.s && fresh.s.blueStats, pinkReach: fresh.s && fresh.s.pink }));
    }
    function raceWins(races, n) {
      return [...new Set(upTo(races, n).map(r => r.name).concat((races.goals || []).filter(r => r.goal === "fixed" && g1Map.has(r.name)).map(r => r.name)))];
    }
    function atRaceCount(x, fresh, races, n) {
      const out = Object.assign({}, fresh, { f: Object.assign({}, fresh.f, { p1: Object.assign({}, fresh.f.p1, { wins: raceWins(races, n) }) }) });
      out.s = fam.score(familyOf(out.f), x);
      out.extra = freshExtra(x, out.t, out.s, out.offers, out.rates, out.parents);
      out.value = out.s.value + out.extra.value;
      return out;
    }
    function trainingStart(x, fresh) {
      return fam.score(familyOf(trainingFamily(fresh.parents)), trainingContext(x, fresh.t, fresh.offers)).start;
    }
    function withTrainingRental(x, fresh, rental, vets, maxRaces = Infinity) {
      const parents = [fresh.parents[0], asVeteran(rental)];
      const out = Object.assign({}, fresh, { parents, rental });
      const races = racePlan(out, vets || []), wins = raceWins(races, maxRaces);
      out.f = Object.assign({}, fresh.f, { p1: Object.assign({}, fresh.f.p1, { wins }), g11: member(parents[0].self, parents[0].tid), g12: member(rental.parent) });
      out.s = fam.score(familyOf(out.f), x);
      out.extra = freshExtra(x, out.t, out.s, out.offers, out.rates, out.parents);
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
        const extra = p1.kind === "fresh" ? freshExtra(x, p1.t, s, p1.offers, p1.rates, p1.parents).value : 0;
        if (s.problems.length) hidden.push({ r, why: s.problems[0] }); else rows.push({ r, f, s, value: s.value + extra });
      });
      rows.sort((a, b) => b.value - a.value || b.s.total - a.s.total);
      return Object.assign(rows, { hidden });
    }

    return { context, outlook, trainedParent, itSkills, familyCover, pinkFocus, rankVets, rankFresh, freshWins, racePlan, upTo, popular, rates, freshWhites, extraOf, baseline, ssLimit, missingWhites, umaMoe, rentalSearch, searchSummary, trainingRentalSearch, rankTrainingRentals, trainingFamily, trainingStart, atRaceCount, raceWins, saddlesOf, rankRentals, want, rentalFor, fam, inherited, trainee };
  }

  const api = { create, MARGIN, FRESH_STARS, SS_SHARE, SPARK_P, STARS, LEARN_MAX, BASE_EXTRA, BASE_MIN, BLUE_IDS, PINK_IDS, UMA_MOE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaCmPlan = api;
})(typeof window !== "undefined" ? window : globalThis);
