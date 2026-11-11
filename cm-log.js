// CM results log: your real Champions Meeting and League of Heroes races, per cup. Each race
// records your aces' placings (and an optional reason a loss happened), with the style and
// Front Runner setting each ran with. The summary says which ace and style win for you, and flags
// an ace who keeps losing, with what to check. Logic and HTML only; app.js stores and wires it.
(function (root) {
  "use strict";
  const REASONS = [
    ["blocked", "Got blocked"],
    ["stamina", "Ran out of stamina"],
    ["lead", "Never got the lead"],
    ["accel", "Late acceleration didn't fire"],
    ["slower", "Just slower"],
  ];
  const REASON_LABEL = Object.fromEntries(REASONS);
  const STYLE_NAME = { Nige: "Front Runner", Senkou: "Pace Chaser", Sasi: "Late Surger", Oikomi: "End Closer" };
  // Below this many races an ace's numbers are too few to judge.
  const MIN_RACES = 5;
  const TIPS = {
    stamina: "She runs out of stamina: raise her stamina or add recovery skills, and check her full-spurt rate in Skills for this build.",
    lead: "She doesn't get the lead: set Front Runners in this cup to Fight for the lead, and look at opening skills (Groundwork, Concentration, Early Lead) and gate greens.",
    blocked: "She gets blocked: positioning and lane skills help, or a style that spends less time in the pack.",
    accel: "Her late acceleration doesn't fire: check those skills' conditions (many need a position or a rival she doesn't have). Another acceleration skill may fit her better.",
    slower: "She's just slower: compare her stats with the cup's targets in Her gaps; speed and her skill set matter most.",
  };

  // One race: { date, field (runners), places: [{ tid, style, place, reason, contest }] }.
  function entry(o) {
    const places = (o.places || []).filter((p) => p && p.tid && +p.place >= 1 && +p.place <= (o.field || 9))
      .map((p) => ({ tid: +p.tid, style: p.style || "", place: +p.place, reason: REASON_LABEL[p.reason] ? p.reason : "", contest: +p.contest || 0 }));
    return places.length ? { date: o.date || "", field: o.field || 9, places } : null;
  }

  // Per ace and style: races, wins, top-3 finishes, average place, reasons; and the team's races
  // and wins (a race is won when any of your aces finishes 1st).
  function summary(races) {
    const rows = {}, team = { races: 0, wins: 0 };
    (races || []).forEach((r) => {
      team.races++;
      if (r.places.some((p) => p.place === 1)) team.wins++;
      r.places.forEach((p) => {
        const k = p.tid + "|" + p.style;
        const x = rows[k] || (rows[k] = { tid: p.tid, style: p.style, races: 0, wins: 0, top3: 0, placeSum: 0, reasons: {}, field: r.field });
        x.races++; x.placeSum += p.place;
        if (p.place === 1) x.wins++;
        if (p.place <= 3) x.top3++;
        if (p.reason && p.place > 1) x.reasons[p.reason] = (x.reasons[p.reason] || 0) + 1;
      });
    });
    const list = Object.values(rows).map((x) => Object.assign(x, { avg: x.placeSum / x.races, winRate: x.wins / x.races, advice: advice(x) }))
      .sort((a, b) => b.winRate - a.winRate || a.avg - b.avg);
    return { rows: list, team };
  }

  // Is she losing, and what to check: the reason given in at least a third of her losses (two or
  // more), else nothing specific. Losing: at least MIN_RACES races and a win rate under half the
  // team's even share (a third of races for 3 aces in a 9-runner field) or an average place past 4th.
  function advice(x) {
    if (x.races < MIN_RACES) return { judged: false, losing: false, tip: "" };
    const losses = x.races - x.wins;
    const top = Object.entries(x.reasons).sort((a, b) => b[1] - a[1])[0];
    const reason = top && top[1] >= 2 && top[1] >= losses / 3 ? top[0] : "";
    const losing = x.winRate < 1 / 6 || x.placeSum / x.races > 4;
    return { judged: true, losing, reason, tip: reason && TIPS[reason] && !(reason === "lead" && x.style !== "Nige") ? TIPS[reason] : "" };
  }

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x) => Math.round(x * 100) + "%";

  // o: { cup, kind, aces: [{ tid, style, name }], races, contest (Front Runner share), open }
  function html(o) {
    const field = o.kind === "loh" ? 12 : 9, aces = o.aces || [], races = o.races || [];
    const s = summary(races);
    const placeSel = (tid) => `<select data-log-place="${tid}" aria-label="Place"><option value="">—</option>${Array.from({ length: field }, (_, i) => `<option value="${i + 1}">${i + 1}${["st", "nd", "rd"][i] || "th"}</option>`).join("")}</select>`;
    const reasonSel = (tid) => `<select data-log-reason="${tid}" aria-label="Why she lost"><option value="">No reason</option>${REASONS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select>`;
    const form = aces.length ? `<div class="table-wrap"><table class="plan"><thead><tr><th>Ace</th><th>Place</th><th>If she lost, why</th></tr></thead><tbody>${aces.map((a) => `<tr><td>${esc(a.name)} <span class="mini">${esc(STYLE_NAME[a.style] || a.style)}</span></td><td>${placeSel(a.tid)}</td><td>${reasonSel(a.tid)}</td></tr>`).join("")}</tbody></table></div>
      <button type="button" class="btn ghost small" data-log-save="${esc(o.cup)}">Save this race</button>` : `<p class="mini">Add your aces to the team above to log races.</p>`;
    const nameOf = (tid) => { const a = aces.find((x) => +x.tid === +tid); return a ? a.name : o.nameOf ? o.nameOf(tid) : "#" + tid; };
    const rows = s.rows.length ? `<div class="table-wrap"><table class="plan"><thead><tr><th>Ace</th><th class="num">Races</th><th class="num">Wins</th><th class="num">Top 3</th><th class="num">Avg place</th><th>Losses, by reason</th></tr></thead><tbody>${s.rows.map((x) => `<tr${x.advice.losing ? ' class="short"' : ""}><td>${esc(nameOf(x.tid))} <span class="mini">${esc(STYLE_NAME[x.style] || x.style)}</span></td><td class="num">${x.races}</td><td class="num">${x.wins} <span class="mini">(${pct(x.winRate)})</span></td><td class="num">${pct(x.top3 / x.races)}</td><td class="num">${x.avg.toFixed(1)}</td><td class="mini">${Object.entries(x.reasons).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${esc(REASON_LABEL[k])} ${n}`).join(", ") || "—"}</td></tr>`).join("")}</tbody></table></div>` : "";
    const flags = s.rows.filter((x) => x.advice.judged && (x.advice.losing || x.advice.tip)).map((x) => `<li><b>${esc(nameOf(x.tid))}</b> (${esc(STYLE_NAME[x.style] || x.style)})${x.advice.losing ? `: ${x.wins} wins in ${x.races} races, average ${x.avg.toFixed(1)}.` : ":"} ${esc(x.advice.tip || "No single reason stands out. Try her in another style, or swap her for another ace.")}</li>`).join("");
    const thin = s.rows.filter((x) => !x.advice.judged).length;
    const recent = races.slice(-5).reverse().map((r, k) => { const i = races.length - 1 - k; return `<li>${esc(r.date)}: ${r.places.map((p) => `${esc(nameOf(p.tid))} ${p.place}${p.reason ? ` (${esc(REASON_LABEL[p.reason])})` : ""}`).join(", ")} <button type="button" class="linkish" data-log-del="${esc(o.cup)},${i}" aria-label="Delete this race">✕</button></li>`; }).join("");
    return `<details class="pred-help" data-log-open="${esc(o.cup)}"${o.open ? " open" : ""}><summary>Your CM results (${races.length} race${races.length === 1 ? "" : "s"})</summary>
      <p class="mini">After each race, enter where your aces placed, and why one lost if you know. It shows which ace and style actually win for you, and from ${MIN_RACES} races on it flags an ace who keeps losing, with what to check. Saved in this browser.</p>
      ${form}
      ${s.team.races ? `<p><b>Team:</b> won ${s.team.wins} of ${s.team.races} races (${pct(s.team.wins / s.team.races)}).</p>` : ""}
      ${rows}
      ${flags ? `<ul class="mini">${flags}</ul>` : ""}
      ${thin ? `<p class="mini">${thin === 1 ? "One ace has" : thin + " aces have"} fewer than ${MIN_RACES} races so far: too few to judge.</p>` : ""}
      ${recent ? `<p class="mini"><b>Last races</b></p><ul class="mini">${recent}</ul>` : ""}
    </details>`;
  }

  const api = { REASONS, MIN_RACES, entry, summary, advice, html };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaCmLog = api;
})(typeof window !== "undefined" ? window : globalThis);
