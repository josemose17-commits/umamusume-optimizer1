// Support card math: effect values at any level, unique effects, and the training gain formula.
// Effect interpolation is a port of GameTora's own function so values match its card pages.
(function (root) {
  const DATA = root.UmaData || (typeof require !== "undefined" ? require("./data/gametora.js") : null);
  const STATS = ["speed", "stamina", "power", "guts", "wit"];
  const MAX_LEVEL = { 3: 50, 2: 45, 1: 40 };
  const RARITY = { 3: "SSR", 2: "SR", 1: "R" };
  const MOOD_COEF = [-0.2, -0.1, 0, 0.1, 0.2];
  const BOND_FRIENDSHIP = 80;
  const BOND_PER_TRAINING = 7;
  const BOND_PER_HINT = 5; // extra bond from a hint (!) event, approximate
  const BOND_PER_DATE = 5; // bond from a Friend/Group card outing, approximate

  const byId = new Map();
  const traineeById = new Map();
  if (DATA) {
    DATA.supports.forEach((c) => byId.set(c.id, c));
    DATA.trainees.forEach((t) => traineeById.set(t.id, t));
  }

  function levelFor(card, lb) {
    return MAX_LEVEL[card.r] - 20 + 5 * Math.max(0, Math.min(4, lb | 0));
  }

  // GameTora: effect arrays hold values at levels 1,5,10,...,50; -1 means "fill in".
  const tableCache = new WeakMap();
  function effectTable(arr) {
    if (tableCache.has(arr)) return tableCache.get(arr);
    const n = Array(51);
    const a = arr.slice(1);
    let s = -1;
    let i = -1;
    for (let e = 0; e < a.length; e++) {
      if (a[e] === -1 && s === -1) { for (let x = 5 * e; x < (e + 1) * 5 - 1; x++) n[x] = 0; continue; }
      if (a[e] !== -1 && i === -1) { n[5 * e] = a[e]; s = a[e]; i = e; continue; }
      if (a[e] === -1) continue;
      const step = i === 0 ? (a[e] - s) / (5 * e - 5 * i - 1) : (a[e] - s) / (5 * e - 5 * i);
      let c = s;
      for (let x = 5 * i + 1; x < 5 * e; x++) {
        if (x === 1) { n[x] = s; x = 2; }
        c += step;
        n[x] = Math.floor(+c.toFixed(10));
      }
      n[5 * e] = a[e]; s = a[e]; i = e;
    }
    let last = 0;
    for (let x = 0; x < 51; x++) { if (n[x] == null) n[x] = last; else last = n[x]; }
    tableCache.set(arr, n);
    return n;
  }

  function combine(id, a, b) {
    // Energy reductions add; failure protection multiplies the remaining risk.
    // A 10% normal reduction and Light Hello's 30-point unique mean 40%, not 43%.
    if (+id === 28) return Math.min(100, a + b);
    if (+id === 27) return a + b - a * b / 100;
    const meta = DATA && DATA.effects[id];
    if (meta && meta.c === "mult") return a * b / 100 + a + b;
    return a + b;
  }

  // Effects that always apply at this level: base effects plus simple unique effects.
  function baseEffects(card, level) {
    const out = {};
    card.e.forEach((arr) => { out[arr[0]] = effectTable(arr)[level]; });
    if (card.u && card.u.lv <= level) {
      card.u.e.forEach((u) => {
        if (u.type >= 100 && u.type !== 9991) return;
        out[u.type] = out[u.type] != null ? combine(u.type, out[u.type], u.value) : u.value;
      });
    }
    return out;
  }

  function conditionalUniques(card, level) {
    if (!card.u || card.u.lv > level) return [];
    return card.u.e.filter((u) => u.type >= 100 && u.type !== 9991);
  }

  // Effects in a specific training situation, including conditional unique effects.
  // sit: { bond, facStat, members, facilityLevel, energy, maxEnergy, deckTypes, totalBond, rainbow }
  function effectsIn(card, level, sit) {
    const out = Object.assign({}, baseEffects(card, level));
    const add = (id, v) => { if (v) out[id] = out[id] != null ? combine(id, out[id], v) : v; };
    conditionalUniques(card, level).forEach((u) => {
      switch (u.type) {
        case 101: if ((sit.bond || 0) >= u.value) { add(u.value_1, u.value_2); if (u.value_3) add(u.value_3, u.value_4); } break;
        case 102: if ((sit.bond || 0) >= u.value && sit.facStat !== card.ty) add(8, u.value_1); break;
        case 103: if ((sit.deckTypes || 0) >= u.value) add(8, u.value_1); break;
        case 104: add(8, u.value_1); break;
        case 106: add(u.value_1, Math.round(u.value * u.value_2 / 2)); break;
        case 107: add(u.value, u.value_4 + (u.value_3 - u.value_4) * (1 - Math.min(100, sit.energy || 0) / 100)); break;
        case 108: add(u.value, Math.min(u.value_4, u.value_3 + Math.max(0, (sit.maxEnergy || 100) - u.value_1) * u.value_2 / 100)); break;
        case 109: add(u.value, Math.min(600 / u.value_1, Math.floor((sit.totalBond || 0) / u.value_1))); break;
        case 110: add(u.value, u.value_1 * (sit.members || 1)); break;
        case 111: add(u.value, u.value_1 * (sit.facilityLevel || 1)); break;
        case 113: if (sit.rainbow) add(u.value, u.value_1); break;
        case 114: add(u.value, u.value_1 + (u.value_2 - u.value_1) * Math.min(100, sit.energy || 0) / 100); break;
        case 115: add(u.value, u.value_1); break;
        case 117: add(u.value, u.value_2 * Math.min(1, ((sit.facilityLevel || 1) * 5) / 25)); break;
        default: break;
      }
    });
    return out;
  }

  function effectName(id) {
    const m = DATA && DATA.effects[id];
    return m ? m.n : "Effect " + id;
  }

  function formatEffect(id, v) {
    const m = DATA && DATA.effects[id];
    const s = m ? m.s : "";
    if (s === "Lv") return "Lv " + v;
    return (Math.round(v * 10) / 10) + (s === "%" ? "%" : "");
  }

  function uniqueText(u) {
    const T = (DATA && DATA.uniqueText) || {};
    const fill = (tpl, o) => (tpl || "").replace(/\{(\w+)\}/g, (_, k) => (o[k] != null ? o[k] : "?"));
    const e = (id) => effectName(id);
    switch (u.type) {
      case 101: {
        const dbl = !!u.value_3;
        const key = "101" + (dbl ? "_double" : "") + (u.value === 100 ? "_full" : "");
        return fill(T[key], { e1: e(u.value_1), v1: u.value_2, e2: dbl ? e(u.value_3) : "", v2: u.value_4, minBond: u.value });
      }
      case 102: return fill(T["102"], { minBond: u.value, v: u.value_1 });
      case 103: return fill(T["103"], { n: u.value, v: u.value_1 });
      case 104: return fill(T["104"], { fans: u.value, max: u.value_1 });
      case 105: return fill(T["105"], { v: u.value, v2: u.value_1 });
      case 106: return fill(T["106"], { e: e(u.value_1), v: u.value_2, times: u.value, max: u.value * u.value_2 });
      case 107: return fill(T["107"], { e: e(u.value) });
      case 108: return fill(T["108"], { e: e(u.value), min: u.value_3, max: u.value_4 });
      case 109: return fill(T["109"], { e: e(u.value), step: u.value_1, max: 600 / u.value_1 });
      case 110: case 111: case 113: case 115: case 122: return fill(T[String(u.type)], { e: e(u.value), v: u.value_1 });
      case 112: return fill(T["112"], { v: u.value });
      case 114: return fill(T["114"], { e: e(u.value), min: u.value_1, max: u.value_2 });
      case 116: return fill(T["116"], { e: e(u.value_1), v: u.value_2, max: u.value_2 * u.value_3 });
      case 117: return fill(T["117"], { e: e(u.value), max: u.value_2 });
      case 118: return fill(T["118"], { minBond: u.value_1, n: u.value + 1 });
      case 119: return fill(T["119"], { minBond: u.value_2 });
      case 120: return fill(T["120"], { minBond: u.value_1, max: u.value_3 });
      case 121: return fill(T["121"], { v: u.value, v2: u.value_1 });
      default: return effectName(u.type) + " (" + u.value + ")";
    }
  }

  function card(id) { return byId.get(+id) || null; }
  // Skill point cost before hint discounts. Other tables (the skill values file) can add costs.
  const extraCost = {};
  function skillCost(id) { return (DATA && DATA.skillCost && DATA.skillCost[id]) || extraCost[id] || 0; }
  function addSkillCosts(map) { Object.assign(extraCost, map); }
  function trainee(id) { return traineeById.get(+id) || null; }

  function onGlobal(item, today) {
    return !!(item.en && item.en <= (today || new Date().toISOString().slice(0, 10)));
  }

  function label(c) {
    return c.n + " [" + c.t + "] " + RARITY[c.r] + " " + typeLabel(c.ty);
  }

  function typeLabel(ty) {
    return { speed: "Speed", stamina: "Stamina", power: "Power", guts: "Guts", wit: "Wit", friend: "Friend", group: "Group" }[ty] || ty;
  }

  function initialBond(c, level) {
    return Math.min(100, baseEffects(c, level)[14] || 0);
  }

  // Can this card produce a friendship (rainbow) training on this facility?
  function isRainbow(c, bond, facStat) {
    if (bond < BOND_FRIENDSHIP) return false;
    if (c.ty === "group") return true;
    return c.ty === facStat;
  }

  // Training gain from the game's formula:
  //   floor((base + stat bonus) x friendship x mood x training effect x (1 + 0.05 x members) x growth)
  // row: [speed, stamina, power, guts, wit, skillPts, energy] at facility level 1.
  // members: [{ card, level, bond }] deck cards on this training. extra: other characters on it.
  function trainingGain(row, facStat, members, opts) {
    const o = opts || {};
    const L = Math.max(1, Math.min(5, o.facilityLevel || 1));
    const n = members.length + (o.extra || 0);
    const deckTypes = o.deckTypes || 0;
    const totalBond = o.totalBond || 0;
    let fm = 1;
    let te = 0;
    let me = 0;
    let sp = 0;
    let all = 0;
    let failMult = 1;
    let costDown = 0;
    let witRecovery = 0;
    const bonus = [0, 0, 0, 0, 0];
    const rainbowCards = [];
    const anyRainbow = members.some((m) => isRainbow(m.card, m.bond, facStat));
    members.forEach((m) => {
      const rb = isRainbow(m.card, m.bond, facStat);
      const eff = effectsIn(m.card, m.level, {
        bond: m.bond, facStat, members: n, facilityLevel: L, energy: o.energy, maxEnergy: o.maxEnergy, deckTypes, totalBond, rainbow: anyRainbow
      });
      if (rb) { fm *= 1 + (eff[1] || 0) / 100; rainbowCards.push(m); if (facStat === "wit") witRecovery += eff[31] || 0; }
      te += eff[8] || 0;
      me += eff[2] || 0;
      sp += eff[30] || 0;
      all += eff[41] || 0;
      for (let i = 0; i < 5; i++) bonus[i] += eff[3 + i] || 0;
      if (eff[27]) failMult *= 1 - eff[27] / 100;
      costDown += eff[28] || 0;
    });
    const moodCoef = MOOD_COEF[o.mood != null ? o.mood : 2];
    const moodMult = 1 + (moodCoef > 0 ? moodCoef * (1 + me / 100) : moodCoef);
    // Scenario friendship bonus (e.g. Grand Concert live bonus) only applies to friendship trainings.
    if (rainbowCards.length && o.fbBonus) fm *= 1 + o.fbBonus / 100;
    const common = fm * moodMult * (1 + te / 100) * (1 + 0.05 * n);
    const mainIdx = STATS.indexOf(facStat);
    const flat = o.flat || {};
    const growth = o.growth || [0, 0, 0, 0, 0];
    const gains = row.slice(0, 5).map((b, i) => {
      if (!(b > 0)) return 0;
      const lvAdd = i === mainIdx ? L - 1 : Math.floor((L - 1) / 2);
      return Math.min(100, Math.floor((b + lvAdd + bonus[i] + all) * common * (1 + (growth[i] || 0) / 100))) + (i === mainIdx ? flat.main || 0 : 0);
    });
    const skill = Math.floor((row[5] + sp) * common) + (flat.sp || 0);
    const baseEnergy = row[6];
    const energy = baseEnergy < 0 ? Math.floor((baseEnergy - 1.5 * (L - 1)) * Math.max(0, 1 - costDown / 100)) : baseEnergy + witRecovery;
    return {
      gains,
      total: gains.reduce((a, b) => a + b, 0),
      sp: skill,
      energy,
      failMult,
      rainbows: rainbowCards.length,
      unbonded: members.filter((m) => m.bond < BOND_FRIENDSHIP).length,
      cards: n
    };
  }

  // Suggests a build from a trainee's aptitudes: [turf, dirt, sprint, mile, medium, long, front, pace, late, end].
  function suggestBuild(t) {
    const rank = (g) => "GFEDCBAS".indexOf(g);
    const apt = t.apt;
    const dists = [["sprint", apt[2]], ["mile", apt[3]], ["medium", apt[4]], ["long", apt[5]]];
    dists.sort((a, b) => rank(b[1]) - rank(a[1]));
    if (rank(apt[1]) >= rank("A") && rank(apt[0]) < rank("A")) return "dirt";
    return dists[0][0];
  }

  // What a card's events give over a career (Euophrys' tier list data): stats, skill points,
  // energy and bond. Cards it doesn't list get its fallback: +7 (SR) / +9 (SSR) to every stat
  // and +5 bond.
  function eventRewards(c) {
    if (c.ev) return { stats: c.ev.slice(0, 5), sp: c.ev[5], energy: c.ev[6], bond: c.ev[7], known: true };
    const all = c.r === 3 ? 9 : c.r === 2 ? 7 : 0;
    return { stats: [all, all, all, all, all], sp: 0, energy: 0, bond: 5, known: false };
  }

  // ---- Cards and outfits you won't use ----
  // Left out of every deck search, upgrade, borrow, tier list and pull plan (set by the page from
  // your saved list). Support card ids and trainee (outfit) ids.
  // h: { cards, trainees } you hid by hand, and halloween: true to leave out every Halloween-themed
  // card and outfit (halloween(), so new ones from the daily data too) except keep: { cards, trainees }.
  const hidden = { cards: new Set(), trainees: new Set() };
  function setHidden(h) {
    const ids = (a) => (a || []).map(Number), keep = (h && h.keep) || {};
    hidden.cards = new Set(ids(h && h.cards));
    hidden.trainees = new Set(ids(h && h.trainees));
    if (h && h.halloween) {
      const hw = halloween(), kc = new Set(ids(keep.cards)), kt = new Set(ids(keep.trainees));
      hw.cards.forEach((id) => { if (!kc.has(id)) hidden.cards.add(id); });
      hw.trainees.forEach((id) => { if (!kt.has(id)) hidden.trainees.add(id); });
    }
  }
  const isHidden = (id) => hidden.cards.has(+id);
  const isHiddenTrainee = (id) => hidden.trainees.has(+id);
  // Halloween-themed cards and outfits: JP's Halloween banner opens around Sept 26-Oct 1 each year
  // (Tamamo Cross "Beware! Halloween Night!", Mejiro Palmer "Moonlit Devil ♪", Rice Shower
  // "Vampire Makeover!", Meisho Doto "Dot-o'-Lantern"), plus Halloween words in a title. R cards
  // and promo cards from those days aren't themed. "Witch" alone isn't Halloween (Sweep Tosho).
  const HALLOWEEN_WORDS = /hallow|trick ?☆|trick or treat|pumpkin|ghost|vampire|nosferatu|mummy|jiangshi|lantern|ハロウィン|おばけ|かぼちゃ|吸血鬼/i;
  const halloweenDay = (jp) => /^\d{4}-(09-(2[6-9]|30)|10-01)$/.test(jp || "");
  function halloween() {
    return {
      cards: DATA.supports.filter((c) => HALLOWEEN_WORDS.test(c.t || "") || (halloweenDay(c.jp) && c.r >= 2 && c.src !== "promo")).map((c) => c.id),
      trainees: DATA.trainees.filter((t) => HALLOWEEN_WORDS.test(t.t || "") || halloweenDay(t.jp)).map((t) => t.id),
    };
  }

  // Backup code for the cards you own: "UMA1:" then base-36 card id + limit break digit per card.
  // Cards and outfits you won't use follow as "~x" and "~t" lists of base-36 ids, then with the
  // Halloween rule on "~h" and "~k" lists of the Halloween ones you kept (older codes have none).
  function encodeOwned(owned, hide) {
    const list = (ids) => [...new Set((ids || []).map(Number))].sort((a, b) => a - b).map((id) => id.toString(36)).join(".");
    const any = hide && ((hide.cards || []).length || (hide.trainees || []).length || hide.halloween);
    const extra = any ? "~x" + list(hide.cards) + "~t" + list(hide.trainees) + (hide.halloween ? "~h" + list((hide.keep || {}).cards) + "~k" + list((hide.keep || {}).trainees) : "") : "";
    return "UMA1:" + Object.keys(owned).map(Number).filter((id) => byId.has(id)).sort((a, b) => a - b).map((id) => id.toString(36) + owned[id]).join(".") + extra;
  }
  function decodeHidden(text) {
    const m = String(text || "").trim().match(/^UMA1:[0-9a-z.]*~x([0-9a-z.]*)~t([0-9a-z.]*)(?:~h([0-9a-z.]*)~k([0-9a-z.]*))?$/i);
    if (!m) return null;
    const ids = (s) => (s || "").split(".").filter(Boolean).map((t) => parseInt(t, 36));
    const out = { cards: ids(m[1]).filter((id) => byId.has(id)), trainees: ids(m[2]).filter((id) => traineeById.has(id)) };
    if (m[3] != null) Object.assign(out, { halloween: true, keep: { cards: ids(m[3]).filter((id) => byId.has(id)), trainees: ids(m[4]).filter((id) => traineeById.has(id)) } });
    return out;
  }
  function decodeOwned(text) {
    const m = String(text || "").trim().replace(/~x[0-9a-z.]*~t[0-9a-z.]*(?:~h[0-9a-z.]*~k[0-9a-z.]*)?$/i, "").match(/^UMA1:([0-9a-z.]*)$/i);
    if (!m) return null;
    const out = {};
    m[1].split(".").filter(Boolean).forEach((t) => {
      const id = parseInt(t.slice(0, -1), 36);
      const lb = +t.slice(-1);
      if (byId.has(id) && lb >= 0 && lb <= 4) out[id] = lb;
    });
    return out;
  }

  // Independent opportunities for each skill. Keep the hint-level distribution:
  // a rare Lv5 opportunity must not discount every more likely Lv1 outcome.
  function skillOffers() {
    const skills = new Map();
    function exclusive(outcomes, source, kind = "event") {
      const ids = new Set(outcomes.flatMap((o) => Object.keys(o.levels || {})));
      ids.forEach((id) => {
        const incoming = [1, 0, 0, 0, 0, 0];
        outcomes.forEach((o) => { const lv = Math.min(5, Math.max(0, Math.floor((o.levels || {})[id] || 0))); if (lv) { incoming[lv] += o.p; incoming[0] -= o.p; } });
        incoming[0] = Math.max(0, incoming[0]);
        const incomingTotal = incoming.reduce((a, b) => a + b, 0);
        for (let n = 0; n <= 5; n++) incoming[n] /= incomingTotal;
        const chance = 1 - incoming[0];
        const x = skills.get(id) || { id, levels: [1, 0, 0, 0, 0, 0], src: [], eventMiss: 1, trainingMiss: 1 };
        const combined = [0, 0, 0, 0, 0, 0];
        for (let a = 0; a <= 5; a++) for (let b = 0; b <= 5; b++) combined[Math.min(5, a + b)] += x.levels[a] * incoming[b];
        const combinedTotal = combined.reduce((a, b) => a + b, 0);
        x.levels = combined.map((n) => n / combinedTotal);
        if (!x.src.includes(source)) x.src.push(source);
        if (kind === "training") x.trainingMiss *= 1 - chance; else x.eventMiss *= 1 - chance;
        if (chance > 0) skills.set(id, x);
      });
    }
    function add(id, probability, level, source, kind = "event") {
      const p = Math.max(0, Math.min(1, probability));
      if (!(p > 0)) return;
      const lv = Math.max(1, Math.min(5, Math.floor(level)));
      exclusive([{ p, levels: { [id]: lv } }], source, kind);
    }
    function trainingHints(id, mean, level, source) {
      const mu = Math.max(0, mean), lv = Math.max(1, Math.min(5, Math.floor(level)));
      const cap = Math.ceil(5 / lv), outcomes = [];
      let probability = Math.exp(-mu), remaining = 1 - probability;
      for (let n = 1; n < cap; n++) { probability *= mu / n; outcomes.push({ p: probability, levels: { [id]: n * lv } }); remaining -= probability; }
      outcomes.push({ p: Math.max(0, remaining), levels: { [id]: 5 } });
      exclusive(outcomes, source, "training");
    }
    function values() {
      const discount = [0, 0.1, 0.2, 0.3, 0.35, 0.4];
      return [...skills.values()].map((x) => {
        const p = 1 - x.levels[0];
        const expectedDiscount = x.levels.reduce((n, probability, lv) => n + probability * discount[lv], 0);
        const lv = x.levels.reduce((n, p, i) => p > 0 ? i : n, 0);
        return { id: x.id, p, lv, src: x.src, expectedDiscount, conditionalDiscount: Math.min(0.4, expectedDiscount / p), eventP: 1 - x.eventMiss, trainingP: 1 - x.trainingMiss };
      });
    }
    return { add, exclusive, trainingHints, values };
  }

  const api = {
    setHidden, isHidden, isHiddenTrainee, halloween, decodeHidden, hidden,
    DATA, STATS, RARITY, BOND_FRIENDSHIP, BOND_PER_TRAINING, BOND_PER_HINT, BOND_PER_DATE,
    card, trainee, skillCost, addSkillCosts, levelFor, effectTable, baseEffects, effectsIn, conditionalUniques, effectName, formatEffect, uniqueText,
    onGlobal, label, typeLabel, encodeOwned, decodeOwned, eventRewards, initialBond, isRainbow, trainingGain, suggestBuild, skillOffers
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaDeck = api;
})(typeof window !== "undefined" ? window : globalThis);
