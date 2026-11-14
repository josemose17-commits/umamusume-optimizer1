#!/usr/bin/env python3
"""Download Global's gacha banners from GameTora and write data/banners.js for the pull planner.

Run from the repository root:  python3 tools/build_banners.py
Needs network access to gametora.com. The output is committed, so the app works offline.

Sources (GameTora, gametora.com/umamusume):
  - en/gacha/support-standard, en/gacha/char-standard: Global's banners with their start and end
    and every card's rate (in millionths). A featured SSR support card or 3-star trainee is
    0.75%, a featured SR 2.25%, a featured R 3.75%, a featured 2-star trainee 2.25% (like
    Matikanetannhauser on 2026-03-12). The banners running now and announced ones
    come from here, with their exact rates.
  - en/foresight/timeline: GameTora's forecast of Global's future banners (start dates estimated
    from Global's pace against JP, featured cards from JP's banners). Rates are assumed to follow
    the same rule as Global's banners so far.
  - en/foresight/predicted_releases: each JP card's and trainee's forecast Global release.
  - en/foresight/timeline also gives the training scenarios ahead (future_scenarios: GameTora's
    scenario id and its forecast Global start) and the story events ahead with their free SSRs
    (future_story_events: support_ids).
  - gacha/support-standard (JP's banners): the anniversaries. JP's game opened on 2021-02-24 and
    holds an anniversary every Feb 24 and a half anniversary every Aug 24, each with its
    selectors (uma.guide's selector overview: a free support selector from the anniversary
    missions, and $20.99 and $69.99 ones for support cards and umas). Global runs JP's campaigns
    in the same order on its own, faster calendar (its 1.5 Anniversary came in 2026), so each
    anniversary's Global date is that of the JP banner that opened it: Global's own when it's
    announced, else GameTora's forecast.

Future banners (umacaratcalculator.com, the Uma Musume Carat Calculator, which follows Henry's
resource spreadsheet; its public calculator data at /api/calculator-data):
  - banner_uma_data / banner_support_data: Global's banners with their dates (confirmed, or
    predicted: is_predicted), the featured trainees and cards by the game's own ids (game_id), and
    the pulls that come free on each (free_pulls). Its dates are maintained by hand as Global
    announces them, so they replace GameTora's forecast. GameTora's announced banners keep their
    own rates and take the calculator's free pulls. If the calculator can't be reached, GameTora's
    forecast is used as before.
Game data (c) Cygames, Inc.
"""
import datetime
import json
import os
import re
import urllib.request

BASE = "https://gametora.com"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "banners.js")
# Global's rules: 150 carats a pull (1,500 for ten), and 200 pulls on one banner earn a spark
# (an exchange for one featured card or trainee); exchange points don't carry over.
PULL_CARATS = 150
SPARK = 200
# Featured rates by rarity (support: 3 SSR, 2 SR, 1 R; trainee: 3 or 2 stars), as on Global's banners.
FEATURED = {"support": {3: 0.0075, 2: 0.0225, 1: 0.0375}, "trainee": {3: 0.0075, 2: 0.0225}}
# A card counts as featured on a banner when its rate is at least this (non-featured SSRs are
# about 0.02%, SRs 0.32-0.36%, Rs 0.89-0.92%, 3-star trainees 0.02%, 2-star trainees 1.97-2%).
THRESHOLD = {"support": {3: 0.005, 2: 0.01, 1: 0.02}, "trainee": {3: 0.005, 2: 0.021}}


def fetch(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "uma-turn-coach data build"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


UCC = "https://umacaratcalculator.com/api/calculator-data"
# Calculator banners get ids past GameTora's, and its uma and support banners (numbered apart)
# get their own ranges, so a trainee and a support banner never share an id.
UCC_ID = {"support": 1000000, "trainee": 2000000}


def calculator():
    req = urllib.request.Request(UCC, headers={"User-Agent": "uma-turn-coach data build"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def from_calculator(data, rarity, now):
    """The calculator's banners still running or ahead: {kind: [banner]}, in this file's shape."""
    out = {"support": [], "trainee": []}
    for kind, key, items in (("support", "banner_support_data", "support_cards"), ("trainee", "banner_uma_data", "umas")):
        for b in data.get(key, []):
            t = b.get("banner_timeline") or {}
            if not t.get("start_date") or not t.get("end_date"):
                continue
            end = datetime.datetime.fromisoformat(t["end_date"].replace("Z", "+00:00")).timestamp()
            if end < now - 86400:
                continue
            over = b.get("rate_overrides") or {}
            pick = []
            for x in b.get(items) or []:
                cid = x.get("game_id")
                if not cid:
                    continue
                rate = over.get(str(cid)) or FEATURED[kind].get(rarity[kind].get(cid), 0)
                if rate:
                    pick.append([cid, rate])
            if not pick:
                continue
            out[kind].append({"id": UCC_ID[kind] + b["id"], "start": t["start_date"][:10], "end": t["end_date"][:10],
                              "est": bool(t.get("is_predicted")), "free": int(b.get("free_pulls") or 0),
                              "pick": sorted(pick, key=lambda x: -x[1])})
    return out


def merge(gt, calc):
    """GameTora's announced banners, with the calculator's free pulls where it has the same banner
    (same featured ids, start within 3 days); then the calculator's other banners in place of
    GameTora's forecast."""
    out = {}
    for kind in gt:
        announced = [b for b in gt[kind] if not b["est"] and b.get("end")]
        def same(c, g):
            return set(i for i, _ in c["pick"]) == set(i for i, _ in g["pick"]) and \
                abs((datetime.date.fromisoformat(c["start"]) - datetime.date.fromisoformat(g["start"])).days) <= 3
        rest = []
        for c in calc[kind]:
            g = next((g for g in announced if same(c, g)), None)
            if g:
                if c.get("free"):
                    g["free"] = c["free"]
            else:
                rest.append(c)
        out[kind] = announced + rest
    return out


def day(ts):
    return datetime.datetime.fromtimestamp(ts, datetime.timezone.utc).strftime("%Y-%m-%d")


def main():
    manifest = fetch("/data/manifests/umamusume.json")
    get = lambda key: fetch("/data/umamusume/%s.%s.json" % (key, manifest[key]))
    rarity = {
        "support": {c["support_id"]: c["rarity"] for c in get("support-cards")},
        "trainee": {c["card_id"]: c["rarity"] for c in get("character-cards")},
    }
    now = datetime.datetime.now(datetime.timezone.utc).timestamp()
    out = {"support": [], "trainee": []}
    seen = set()
    # Running and announced banners, with their own rates.
    for kind, key in (("support", "en/gacha/support-standard"), ("trainee", "en/gacha/char-standard")):
        for b in get(key):
            if b.get("end", 0) < now - 86400:
                continue
            pick = []
            for rate, ids in b["lineup"].items():
                r = int(rate) / 1e6
                for cid in ids:
                    rr = rarity[kind].get(cid)
                    if rr in THRESHOLD[kind] and r >= THRESHOLD[kind][rr]:
                        pick.append([cid, round(r, 6)])
            if not pick:
                continue
            seen.add(b["id"])
            out[kind].append({"id": b["id"], "start": day(b.get("start", now)), "end": day(b["end"]), "est": False,
                              "pick": sorted(pick, key=lambda x: -x[1])})
    # GameTora's forecast of the banners after those.
    timeline = get("en/foresight/timeline")
    for kind, key in (("support", "future_support_banners"), ("trainee", "future_char_banners")):
        for b in timeline.get(key, []):
            if b["id"] in seen:
                continue
            pick = [[cid, FEATURED[kind].get(rarity[kind].get(cid), 0)] for cid in b.get("pickup_ids", [])]
            pick = [p for p in pick if p[1] > 0]
            if not pick:
                continue
            out[kind].append({"id": b["id"], "start": day(b["display_start"]), "end": None,
                              "est": bool(b.get("is_estimated", True)), "pick": sorted(pick, key=lambda x: -x[1])})
    # The calculator's banners in place of GameTora's forecast (GameTora's if it can't be reached).
    source = "GameTora (gametora.com): Global banners with their rates, and GameTora's forecast of Global's banners and releases"
    try:
        out = merge(out, from_calculator(calculator(), rarity, now))
        source = ("GameTora (gametora.com): Global's announced banners with their rates, card releases, anniversaries and scenarios; "
                  "umacaratcalculator.com (Henry's resource spreadsheet): the banners ahead, their dates and free pulls")
    except Exception as e:  # noqa: BLE001 - any failure keeps GameTora's forecast
        print("calculator unavailable, keeping GameTora's forecast:", e)
    for kind in out:
        out[kind].sort(key=lambda b: (b["start"], b["id"]))
    # The anniversaries on Global's calendar.
    jp_start = {}
    for b in get("gacha/support-standard"):
        if b.get("start"):
            jp_start.setdefault(day(b["start"]), []).append(b["id"])
    announced = {b["id"]: b for b in get("en/gacha/support-standard")}
    forecast = {b["id"]: b for b in timeline.get("future_support_banners", [])}
    events = []
    for year in range(2022, 2040):
        for md, half in (("02-24", 0), ("08-24", 0.5)):
            jp = "%d-%s" % (year, md)
            ids = sorted(jp_start.get(jp, []))
            if not ids:
                continue
            g = next((announced[i] for i in ids if i in announced), None)
            f = next((forecast[i] for i in ids if i in forecast), None)
            if g and g.get("start"):
                start, est = day(g["start"]), False
            elif f:
                start, est = day(f["display_start"]), bool(f.get("is_estimated", True))
            else:
                continue
            n = year - 2021 + half
            name = ("%g" % n) + ({1: "st", 2: "nd", 3: "rd"}.get(int(n), "th") if n == int(n) else "") + " Anniversary"
            events.append({"id": "anniv%g" % n, "kind": "anniversary", "name": name, "jp": jp, "start": start, "est": est})
    # The training scenarios ahead on Global and the story events' free SSRs (GameTora's forecast).
    scenarios = [{"id": s["id"], "start": day(s["display_start"]), "est": bool(s.get("is_estimated", True))}
                 for s in timeline.get("future_scenarios", [])]
    story = [{"id": e["id"], "start": day(e["display_start"]), "est": bool(e.get("is_estimated", True)), "cards": e["support_ids"]}
             for e in timeline.get("future_story_events", []) if e.get("support_ids")]
    predicted = get("en/foresight/predicted_releases")
    release = {
        "cards": {k: v["release_date"] for k, v in sorted(predicted.get("support_cards", {}).items())},
        "trainees": {k: v["release_date"] for k, v in sorted(predicted.get("char_cards", {}).items())},
    }
    data = {
        "meta": {
            "built": datetime.date.today().isoformat(),
            "source": source,
            "pullCarats": PULL_CARATS, "spark": SPARK, "featured": {k: {str(r): v for r, v in d.items()} for k, d in FEATURED.items()},
        },
        "support": out["support"], "trainee": out["trainee"], "release": release, "events": events,
        "scenarios": scenarios, "storyEvents": story,
    }
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    # Keep the old build date when nothing else changed, so scheduled rebuilds stay quiet.
    try:
        with open(OUT, encoding="utf-8") as f:
            prev = f.read()
        m = re.search(r'"built":"(\d{4}-\d{2}-\d{2})"', prev)
        if m:
            same = body.replace('"built":"%s"' % data["meta"]["built"], '"built":"%s"' % m.group(1))
            if same in prev:
                print("no changes")
                return 0
    except FileNotFoundError:
        pass
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// Generated by tools/build_banners.py from GameTora (gametora.com) and umacaratcalculator.com. Game data (c) Cygames, Inc.\n")
        f.write("(function (root) {\n  const BANNERS = " + body + ";\n")
        f.write('  if (typeof module !== "undefined" && module.exports) module.exports = BANNERS;\n  else root.UmaBanners = BANNERS;\n')
        f.write('})(typeof window !== "undefined" ? window : globalThis);\n')
    print("wrote", OUT, os.path.getsize(OUT), "bytes;", len(out["support"]), "support banners,", len(out["trainee"]), "trainee banners,", len(events), "anniversaries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
