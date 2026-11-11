"use strict";
const test = require("node:test");
const assert = require("node:assert");
const L = require("../cm-log.js");

const race = (places, field = 9) => L.entry({ date: "2026-11-24", field, places });

test("a race keeps only placed aces and known reasons", () => {
  const r = race([{ tid: 1, style: "Nige", place: 3, reason: "lead", contest: 0.3 }, { tid: 2, style: "Senkou", place: "" }, { tid: 3, style: "Sasi", place: 10 }, { tid: 4, style: "Oikomi", place: 2, reason: "nonsense" }]);
  assert.deepEqual(r.places.map((p) => p.tid), [1, 4]);
  assert.equal(r.places[0].contest, 0.3);
  assert.equal(r.places[1].reason, "");
  assert.equal(race([{ tid: 1, place: "" }]), null);
  assert.equal(race([{ tid: 1, place: 12 }], 12).places[0].place, 12, "League of Heroes has 12 runners");
});

test("summary: per ace and style, and team wins when any ace is 1st", () => {
  const races = [
    race([{ tid: 1, style: "Nige", place: 1 }, { tid: 2, style: "Senkou", place: 4, reason: "blocked" }]),
    race([{ tid: 1, style: "Nige", place: 5, reason: "lead" }, { tid: 2, style: "Senkou", place: 2 }]),
    race([{ tid: 1, style: "Senkou", place: 2 }]),
  ];
  const s = L.summary(races);
  assert.deepEqual(s.team, { races: 3, wins: 1 });
  const front = s.rows.find((x) => x.tid === 1 && x.style === "Nige");
  assert.equal(front.races, 2); assert.equal(front.wins, 1); assert.equal(front.avg, 3);
  assert.deepEqual(front.reasons, { lead: 1 });
  assert.ok(s.rows.find((x) => x.tid === 1 && x.style === "Senkou"), "the same ace in another style is a separate row");
  assert.equal(front.advice.judged, false, "too few races to judge");
});

test("an ace who keeps losing is flagged, with the tip for her most common reason", () => {
  const losing = Array.from({ length: 6 }, (_, i) => race([{ tid: 7, style: "Nige", place: 5 + (i % 3), reason: i < 3 ? "stamina" : "" }]));
  const x = L.summary(losing).rows[0];
  assert.equal(x.advice.losing, true);
  assert.equal(x.advice.reason, "stamina");
  assert.match(x.advice.tip, /stamina/);
  const winning = Array.from({ length: 6 }, (_, i) => race([{ tid: 8, style: "Senkou", place: i % 2 ? 1 : 2 }]));
  assert.equal(L.summary(winning).rows[0].advice.losing, false);
  // "Never got the lead" is a Front Runner's problem only.
  const pace = Array.from({ length: 6 }, () => race([{ tid: 9, style: "Senkou", place: 6, reason: "lead" }]));
  assert.equal(L.summary(pace).rows[0].advice.tip, "");
});

test("the log renders its form and summary", () => {
  const h = L.html({ cup: "cm22", kind: "cm", aces: [{ tid: 1, style: "Nige", name: "Copano Rickey" }], races: [race([{ tid: 1, style: "Nige", place: 1 }])] });
  assert.match(h, /data-log-place="1"/);
  assert.match(h, /data-log-save="cm22"/);
  assert.match(h, /won 1 of 1 races/);
  assert.match(h, /data-log-del="cm22,0"/);
});
