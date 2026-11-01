#!/usr/bin/env python3
"""Builds data/presets.js: every Champions Meeting and League of Heroes with its course and dates.

Sources:
  - GameTora (gametora.com/umamusume): JP and Global Champions Meeting schedules with exact dates
    and race conditions. Files: events/champions-meeting and en/events/champions-meeting.
  - alpha123's Umalator (alpha123.github.io/uma-tools): its CM/LoH preset lists, which carry the
    simulator course ID and the newest dates (the Global list runs a little ahead of GameTora,
    and the JP list is the only source for League of Heroes courses).

Global follows JP's Champions Meeting order, so cups Global hasn't announced yet get an
estimated date, marked est: GameTora's forecast of Global's calendar (en/foresight, built from
Global's measured pace against JP: about 1.4 JP days per Global day), else one cup every 3 weeks.
JP's gaps between cups grew from a month to two from 2023 on, which a fixed pace can't follow.

Usage: python3 tools/build_presets.py <gametora cache dir> <umalator-global bundle.js>
       <umalator (JP) bundle.js> <umalator JP course_data.json> [jobs.json]
"""
import datetime as dt
import json
import re
import sys

GT, BUNDLE_GLOBAL, BUNDLE_JP, COURSES_JP = sys.argv[1:5]
JOBS = sys.argv[5] if len(sys.argv) > 5 else None

TRACKS = {
    10001: "Sapporo", 10002: "Hakodate", 10003: "Niigata", 10004: "Fukushima", 10005: "Nakayama",
    10006: "Tokyo", 10007: "Chukyo", 10008: "Kyoto", 10009: "Hanshin", 10010: "Kokura",
    10101: "Ooi", 10103: "Kawasaki", 10104: "Funabashi", 10105: "Morioka",
    10201: "Longchamp", 10202: "Santa Anita Park", 10203: "Del Mar",
}
GROUND = {1: "Firm", 2: "Good", 3: "Soft", 4: "Heavy"}
WEATHER = {1: "Sunny", 2: "Cloudy", 3: "Rainy", 4: "Snowy"}
SEASON = {1: "Spring", 2: "Summer", 3: "Autumn", 4: "Winter", 5: "Spring (sakura)"}
SURFACE = {1: "Turf", 2: "Dirt"}
TURN = {1: "Right", 2: "Left", 4: "Straight"}
DIST = {1: "Sprint", 2: "Mile", 3: "Medium", 4: "Long"}
CATEGORY = {"MILE": "Mile", "DIRT": "Dirt", "CLASSIC": "Classic", "LONG": "Long", "SPRINT": "Sprint"}
# Fallback when GameTora's forecast is missing: one Champions Meeting about every 3 weeks.
GLOBAL_PACE_DAYS = 21

# Stat lines the skill values are simulated with: a strong Global uma for that distance.
# Above 1200 the game halves stat gains in races, and the simulator models that.
STATS = {
    "sprint": {"speed": 1500, "stamina": 600, "power": 1200, "guts": 700, "wisdom": 1100},
    "mile": {"speed": 1500, "stamina": 800, "power": 1200, "guts": 700, "wisdom": 1100},
    "medium": {"speed": 1500, "stamina": 1000, "power": 1150, "guts": 700, "wisdom": 1050},
    "long": {"speed": 1450, "stamina": 1250, "power": 1100, "guts": 750, "wisdom": 1000},
    "dirt": {"speed": 1450, "stamina": 850, "power": 1300, "guts": 700, "wisdom": 1050},
}


def day(ts):
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).strftime("%Y-%m-%d")


def add_days(s, n):
    return (dt.date.fromisoformat(s) + dt.timedelta(days=n)).isoformat()


def load(name):
    with open(f"{GT}/{name}.json", encoding="utf-8") as f:
        return json.load(f)


def umalator_presets(path, var):
    src = open(path, encoding="utf-8").read()
    i = src.index(var + "=[")
    j = src.index("]", i)
    out = []
    for m in re.finditer(r"\{([^{}]*)\}", src[i:j + 1]):
        o = {}
        for k, v in re.findall(r'(\w+):("[^"]*"|[\d.e]+)', m.group(1)):
            o[k.lower()] = v.strip('"') if v.startswith('"') else int(float(v))
        out.append(o)
    return out


courses = json.load(open(COURSES_JP, encoding="utf-8"))


def course_for(track, distance, surface):
    ids = [k for k, c in courses.items()
           if c["raceTrackId"] == track and c["distance"] == distance and c["surface"] == surface]
    if len(ids) != 1:
        raise SystemExit(f"course lookup failed for {track} {distance} {surface}: {ids}")
    return int(ids[0])


def course_info(cid):
    c = courses[str(cid)]
    return {
        "id": cid, "track": TRACKS.get(c["raceTrackId"], str(c["raceTrackId"])),
        "distance": c["distance"], "surface": SURFACE[c["surface"]], "turn": TURN.get(c["turn"], "?"),
        "dist": DIST[c["distanceType"]],
        # Inner/outer layout (2 inner, 3 outer, 4 outer to inner) changes skill triggers.
        "layout": {1: "", 2: "inner", 3: "outer", 4: "outer-inner"}.get(c.get("course"), ""),
        "corners": len(c["corners"]), "slopes": len(c["slopes"]),
    }


def build_key(info):
    if info["surface"] == "Dirt":
        return "dirt"
    return {"Sprint": "sprint", "Mile": "mile", "Medium": "medium", "Long": "long"}[info["dist"]]


# GameTora's forecast (files en__foresight__timeline and en__foresight__model, optional).
try:
    FORESIGHT = {c["id"]: c for c in load("en__foresight__timeline")["future_cm"]}
    PACE = load("en__foresight__model")["pace_ratio"]
except FileNotFoundError:
    FORESIGHT, PACE = {}, None

jp = load("events__champions-meeting")
en = {x["id"]: x for x in load("en__events__champions-meeting")}
ug = umalator_presets(BUNDLE_GLOBAL, "var ji")
ujp = umalator_presets(BUNDLE_JP, "$a")
# Global cups beyond GameTora's list: the Umalator's Global presets are newest first.
ug_sorted = sorted([p for p in ug if p.get("type") == 0], key=lambda p: p["date"])

presets = []
last_global = None
for x in jp:
    r = x["race"]
    cid = course_for(r["track"], r["distance"], r["ground"])
    info = course_info(cid)
    raw = x.get("name_en") or x["name"]
    name = raw if "Cup" in raw else None
    cat = CATEGORY.get(raw)
    p = {
        "id": "cm%d" % x["id"], "kind": "cm", "no": x["id"],
        "course": info,
        "racedef": {"ground": r["condition"], "weather": r["weather"], "season": r["season"], "time": 2},
        "conditions": "%s · %s · %s" % (GROUND[r["condition"]], WEATHER[r["weather"]], SEASON[r["season"]]),
        "jp": {"start": day(x["start"]), "end": day(x["end"])},
    }
    g = en.get(x["id"])
    if g:
        p["global"] = {"start": day(g["start"]), "end": day(g["end"]), "src": "GameTora"}
        p["name"] = g["name"]
    elif len(ug_sorted) >= x["id"]:
        u = ug_sorted[x["id"] - 1]
        if u["courseid"] != cid:
            raise SystemExit(f"Umalator Global preset {u} disagrees with JP cup {x['id']}")
        p["global"] = {"start": u["date"], "end": add_days(u["date"], 6), "src": "Umalator"}
        p["name"] = re.sub(r"\s+\d+$", "", u["name"])
    else:
        f = FORESIGHT.get(x["id"])
        start = day(f["display_start"]) if f else add_days(last_global, GLOBAL_PACE_DAYS)
        p["global"] = {"start": start, "end": add_days(start, 6), "src": "estimate", "est": True,
                       "by": "GameTora forecast" if f else "3-week pace"}
        p["name"] = name or ("%s %s" % (cat, "CM") if cat else "CM %d" % x["id"])
    if cat:
        p["category"] = cat
    last_global = p["global"]["start"]
    # Cups repeat their names each zodiac year: label the second run "Cup 2" like the game does.
    same = [q for q in presets if q.get("name") == p["name"]]
    if same and "Cup" in p["name"]:
        p["name"] = "%s %d" % (p["name"], len(same) + 1)
    presets.append(p)

# League of Heroes: JP only so far. Place each one after the JP cup it followed so Global's
# expected slot can be estimated the same way.
loh = sorted([p for p in ujp if p.get("type") == 1], key=lambda p: p["date"])
for n, u in enumerate(loh, 1):
    cid = u["courseid"]
    info = course_info(cid)
    after = max((q for q in presets if q["jp"]["start"] <= u["date"]), key=lambda q: q["jp"]["start"])
    # Its gap after that cup on JP, at Global's pace (GameTora's), else 10 days.
    gap = (dt.date.fromisoformat(u["date"]) - dt.date.fromisoformat(after["jp"]["start"])).days
    gstart = add_days(after["global"]["start"], round(gap / PACE) if PACE else 10)
    presets.append({
        "id": "loh%d" % n, "kind": "loh", "no": n,
        "name": "League of Heroes %d" % n,
        "course": info,
        "racedef": {"ground": 1, "weather": 1, "season": u["season"], "time": u.get("time", 2)},
        "conditions": "Firm · Sunny · %s" % SEASON[u["season"]],
        "jp": {"start": u["date"], "end": add_days(u["date"], 9)},
        "global": {"start": gstart, "end": add_days(gstart, 9), "src": "estimate", "est": True,
                   "note": "Not on Global yet. JP ran it after CM %d, so this is that slot's estimate." % after["no"]},
    })

for p in presets:
    p["build"] = build_key(p["course"])
    p["stats"] = STATS[p["build"]]
    # Cups Global has run or announced are simulated with the Global Umalator (Global skill set),
    # later ones with the JP Umalator, which has every course and skill.
    p["sim"] = "global" if p["kind"] == "cm" and p["global"]["src"] != "estimate" else "jp"

presets.sort(key=lambda p: p["global"]["start"])
meta = {"built": dt.date.today().isoformat(), "pace": GLOBAL_PACE_DAYS,
        "forecast": {"source": "GameTora en/foresight", "jpDaysPerGlobalDay": round(PACE, 3)} if PACE else None}
with open("data/presets.js", "w", encoding="utf-8") as f:
    f.write("// Generated by tools/build_presets.py from GameTora and alpha123's Umalator. Do not edit.\n")
    f.write("(function (root) {\n  const PRESETS = ")
    json.dump({"meta": meta, "list": presets}, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n  if (typeof module !== \"undefined\" && module.exports) module.exports = PRESETS;\n")
    f.write("  else root.UmaPresets = PRESETS;\n})(typeof window !== \"undefined\" ? window : globalThis);\n")
print(len(presets), "presets")
if JOBS:
    with open(JOBS, "w") as f:
        json.dump(presets, f)
