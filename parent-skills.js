// Factual support skill coverage for parent results. Deliberately separate from
// target scoring and its event-choice/availability estimates.
(function (root) {
  const Prerequisites = root.UmaParentPrerequisites || (typeof require !== "undefined" ? require("./parent-prerequisites.js") : null);
  const Release = root.UmaSkillRelease || (typeof require !== "undefined" ? require("./skill-release.js") : null);
  function build(cards, opts = {}) {
    const info = opts.skills || {}, purchase = opts.purchases || {};
    const events = opts.events || {cards: {}, events: {}};
    const byId = new Map(), unavailableCards = [], unresolvedPrerequisites = [];
    const canonical = Prerequisites.create(purchase);
    const must = new Set((opts.must || []).map(String));
    function add(id, card, route) {
      id = String(id);
      if (!byId.has(id)) {
        const m = info[id];
        // Released: out on Global (by the ace's cup with opts.skillsBy, a JP date; else now).
        byId.set(id, {id, rarity: m ? m[2] : null, release: m ? Release.outBy(m, opts.skillsBy || null) : null,
          spark: !!(m && m[2] === 1 && !id.startsWith('9')), target: (opts.targets || {})[id] > 0,
          must: must.has(id), sources: []});
      }
      const skill = byId.get(id);
      let source = skill.sources.find(s => s.card === card.id);
      if (!source) skill.sources.push(source = {card: card.id, routes: []});
      if (!source.routes.some(r => JSON.stringify(r) === JSON.stringify(route))) source.routes.push(route);
    }
    function offer(id, card, route) {
      id = String(id); add(id, card, route);
      const isGold = (purchase[id] && purchase[id][3] === 2) || (info[id] && info[id][2] === 2);
      if (isGold && !canonical.whites(id).length) {
        if (!unresolvedPrerequisites.some(x => x.id === id && x.card === card.id)) unresolvedPrerequisites.push({id, card:card.id});
        return;
      }
      // An excluded or unknown-release gold cannot establish a Global white route.
      if (opts.globalOnly && !Release.outBy(info[id], opts.skillsBy || null)) return;
      canonical.unlocks(id).forEach(other => {
        const throughGold = isGold && canonical.whites(id).includes(other);
        add(other, card, Object.assign({}, route, {via:id, purchase:throughGold ? 'prerequisite' : 'upgrade'}));
      });
    }

    cards.forEach(card => {
      if (opts.globalOnly && !(card.en && card.en <= opts.today)) { unavailableCards.push(card.id); return; }
      (card.hs || []).forEach(id => offer(id, card, {kind: 'hint'}));
      const ce = (events.cards || {})[card.id] || {};
      const parsed = new Set();
      [...new Set([...(ce.chain || []), ...(ce.other || [])])].forEach(eid => {
        const visit = (part, choice, conditional) => {
          if (!part) return;
          [...(part.h || []).map(h => h[0]), ...(part.g || [])].forEach(id => {
            parsed.add(String(id));
            offer(id, card, {kind: 'event', event: eid, choice, conditional, note: part.x || null, grant: (part.g || []).map(String).includes(String(id))});
          });
          visit(part.ok, choice, true); visit(part.ng, choice, true);
          (part.when || []).forEach(x => visit(x, choice, true));
        };
        ((events.events[eid] || {}).c || []).forEach((ch, i) => visit(ch, i + 1, false));
      });
      (card.es || []).forEach(id => {
        if (!parsed.has(String(id))) offer(id, card, {kind: 'event', unresolved: true});
      });
    });
    const all = [...byId.values()].sort((a, b) => +b.target - +a.target || a.id.localeCompare(b.id));
    const skills = all.filter(s => !opts.globalOnly || s.release === true);
    return {skills, unresolvedPrerequisites, restricted: all.filter(s => !skills.includes(s)), unavailableCards,
      missingMust: [...must].filter(id => !skills.some(s => s.id === id))};
  }
  const api = {build};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.UmaParentSkills = api;
})(typeof window !== 'undefined' ? window : globalThis);
