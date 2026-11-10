// Global support availability for a cup. Forecasts only count when planning a future cup;
// passing their estimated date never makes a card confirmed on Global today.
(function (root) {
  function create(banners, today) {
    const dates = {};
    const add = (id, date) => { if (date && (!dates[id] || date < dates[id])) dates[id] = date; };
    // Also cover banner and event cards without an individual release forecast.
    ((banners && banners.support) || []).forEach(b => (b.pick || []).forEach(([id]) => add(id, b.start)));
    ((banners && banners.storyEvents) || []).forEach(e => (e.cards || []).forEach(id => add(id, e.start)));
    Object.assign(dates, banners && banners.release && banners.release.cards);
    const cutoff = p => p && p.global && p.global.start > today ? p.global.start : today;
    const info = c => ({ date: c && (c.en || dates[c.id]) || null, estimated: !!(c && !c.en && dates[c.id]) });
    function available(c, p) {
      const r = info(c);
      return !!(r.date && r.date <= cutoff(p) && (!r.estimated || cutoff(p) > today));
    }
    // An empty collection keeps the builder's existing all-card preview. Otherwise only
    // the recorded copies are yours; future cards can be borrowed or tried in all-card mode.
    function pools(cards, owned, settings, p, scorable) {
      const mine = settings.ownedOnly && Object.keys(owned).length > 0;
      const usable = cards.filter(c => available(c, p));
      const pool = usable.filter(c => mine ? owned[c.id] != null : c.r >= 2)
        .map(c => ({ id: c.id, lb: mine ? +owned[c.id] : 4 }))
        .filter(c => !scorable || scorable(c.id, c.lb));
      const borrow = settings.borrow === false ? [] : usable.filter(c => c.r === 3)
        .map(c => ({ id: c.id, lb: 4 })).filter(c => !scorable || scorable(c.id, c.lb));
      return { pool, borrow };
    }
    return { cutoff, info, available, pools };
  }
  const api = { create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaCardRelease = api;
})(typeof window !== "undefined" ? window : globalThis);
