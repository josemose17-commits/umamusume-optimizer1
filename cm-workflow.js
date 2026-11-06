// Saved CM/LoH state: one cup, up to three aces, and one deck per ace and cup.
// Older cm / cmplan / parents saves retain their settings and family entries.
(function (root) {
  "use strict";
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const rank = (x) => x === "S" ? "S" : x === "" || x === false ? "" : "SS";
  const keyOf = (cup, tid) => cup + "|" + tid;

  function current(s) {
    const c = s.cmp || {}, list = (c.byCup || {})[c.cup] || [];
    const ace = list.find((a) => +a.tid === +(c.sel || {})[c.cup]) || list[0] || null;
    const key = ace ? keyOf(c.cup, ace.tid) : null;
    return { cup: c.cup, ace, key, deck: key ? (c.decks || {})[key] || null : null };
  }

  function setParentRank(s, value) {
    (s.cmp || (s.cmp = {})).parentRank = rank(value);
    (s.pcm || (s.pcm = {})).reachSS = rank(value);
  }

  function sync(s, o) {
    const c = s.cmp, x = current(s);
    if (!x.ace) return x;
    const t = o.trainee(x.ace.tid);
    if (!x.deck) {
      const defaults = clone(s.cm || {});
      delete defaults.family; delete defaults.parentSummary;
      c.decks[x.key] = Object.assign(defaults, { cards: null, searched: null, exclude: [], must: [], locked: [], rental: { pink: "auto", quality: "recommended", required: [] } });
    }
    const d = c.decks[x.key];
    x.ace.style = x.ace.style || o.style(t);
    // These are projections for existing consumers, never separate editable choices.
    d.preset = c.cup; d.style = x.ace.style; d.goal = "race";
    d.comp = d.comp || {}; d.must = d.must || []; d.exclude = d.exclude || [];
    d.targets = d.targets || {}; d.locked = d.locked || [];
    s.cm = d;
    if (t) {
      d.family = d.family || {};
      d.family.ace = { cid: t.cid, tid: t.id };
      ["p1", "p2", "g11", "g12", "g21", "g22"].forEach(k => {
        d.family[k] = Object.assign({ cid: null, tid: null, white: [], blue: [0, 0], pink: [0, 0], green: 0, wins: [] }, d.family[k]);
      });
      (s.parents || (s.parents = {})).family = d.family;
    }
    return Object.assign(x, { deck: d });
  }

  function migrate(s, o) {
    const c = s.cmp || (s.cmp = {}), oldTab = s.tab;
    const legacy = s.cm || {};
    c.byCup = c.byCup || {}; c.sel = c.sel || {}; c.decks = c.decks || {};
    if (!c.workflowVersion) {
      if (!s.pcm && ["ace", "debuff"].includes(legacy.goal)) s.pcm = clone(legacy);
      Object.keys(c.decks).forEach(k => {
        const d = c.decks[k];
        c.decks[k] = Object.assign(clone(legacy), { locked: (d.cards || []).filter(x => x.locked).map(x => x.id) }, d);
      });
      const validCup = (id) => o.cups.includes(id);
      const oldCup = validCup(legacy.preset) ? legacy.preset : validCup(c.cup) ? c.cup : o.defaultCup;
      if (!validCup(c.cup) || oldTab === "cm" || oldTab === "parents") c.cup = oldCup;
      const family = s.parents && s.parents.family;
      if (family && family.ace && o.trainee(family.ace.tid)) {
        const k = keyOf(oldCup, family.ace.tid);
        (c.decks[k] || (c.decks[k] = clone(legacy))).family = family;
      }
      const from = c.from;
      const familyAce = family && family.ace && family.ace.tid;
      const tid = oldTab === "parents" || ["ace", "debuff"].includes(legacy.goal) ? familyAce
        : oldTab === "cm" ? from && from.tid || (s.deck || {}).trainee || familyAce
          : !(c.byCup[c.cup] || []).length ? familyAce : null;
      if (o.trainee(tid)) {
        const list = c.byCup[c.cup] || (c.byCup[c.cup] = []);
        if (!list.some((a) => +a.tid === +tid) && list.length < 3) list.push({ tid: +tid, style: legacy.style || o.style(o.trainee(tid)) });
        if (list.some((a) => +a.tid === +tid)) c.sel[c.cup] = +tid;
        const k = keyOf(c.cup, tid), prior = c.decks[k];
        c.decks[k] = Object.assign(clone(legacy), prior || {});
        if (oldTab === "cm") Object.assign(c.decks[k], clone(legacy));
        if (Array.isArray(c.decks[k].cards)) c.decks[k].cards.forEach((x) => { if ((legacy.locked || []).includes(x.id)) x.locked = true; });
      }
      setParentRank(s, oldTab === "parents" && s.pcm && s.pcm.reachSS != null ? s.pcm.reachSS : c.parentRank != null ? c.parentRank : c.ssMust);
      if (from && from.kind === "parent") c.training = { cup: from.cup, tid: +from.tid, parent: +from.p1 };
      c.open = Object.assign({ cup: true, deck: true, parents: true, training: oldTab === "parents" }, c.open);
      const first = current(s);
      if (first.ace && !first.deck) c.decks[first.key] = clone(legacy);
      delete c.from; delete c.ssMust;
      c.workflowVersion = 1;
    }
    if (["cm", "cmplan", "parents"].includes(s.tab)) s.tab = "cm";
    return sync(s, o);
  }

  const api = { migrate, sync, current, setParentRank };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaCmWorkflow = api;
})(typeof window !== "undefined" ? window : globalThis);
