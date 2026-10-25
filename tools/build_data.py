#!/usr/bin/env python3
"""Download support card, trainee and skill data from GameTora and write data/gametora.js.

Run from the repository root:  python3 tools/build_data.py
Needs network access to gametora.com. The output is committed, so the coach works offline.
Data source: GameTora (https://gametora.com/umamusume). Game data © Cygames, Inc.
"""
import datetime
import json
import os
import re
import sys
import urllib.request

BASE = "https://gametora.com"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "gametora.js")
TYPE_MAP = {"speed": "speed", "stamina": "stamina", "power": "power", "guts": "guts", "intelligence": "wit", "friend": "friend", "group": "group"}

# Text for unique effects with conditions (type 101+), from GameTora's English strings.
UNIQUE_TEXT = {
    "101": "Gain {e1} ({v1}) when the bond gauge is at least {minBond}",
    "101_full": "Gain {e1} ({v1}) when the bond gauge is full",
    "101_double": "Gain {e1} ({v1}) and {e2} ({v2}) when the bond gauge is at least {minBond}",
    "101_double_full": "Gain {e1} ({v1}) and {e2} ({v2}) when the bond gauge is full",
    "102": "When the bond gauge is {minBond} or higher and this card is in a facility different from its type, gain Training Effectiveness ({v})",
    "103": "If your deck has at least {n} different support types, gain Training Effectiveness ({v})",
    "104": "Gain Training Effectiveness (1) per {fans} fans, up to ({max})",
    "105": "Gain initial stats ({v}) of this card's type for every card in your deck (Friend and Group give ({v2}) to every stat)",
    "106": "Gain {e} ({v}) each friendship training with this card, up to {times} times ({max} total)",
    "107": "The less energy you have, the more {e} you gain",
    "108": "Gain {e} ({min}%), more with higher maximum energy, up to ({max}%)",
    "109": "Gain {e} (1%) for every {step} combined support bond, up to ({max}%) at 600",
    "110": "Gain {e} ({v}) for every support card in the same training",
    "111": "Gain {e} ({v}) per level of the current training facility",
    "112": "{v}% chance to make the current training's failure rate zero",
    "113": "Gain {e} ({v}) when part of a friendship (rainbow) training",
    "114": "Gain {e} scaling with energy, from ({min}%) at 0 to ({max}%) at 100+",
    "115": "All support cards gain {e} ({v})",
    "116": "Gain {e} ({v}) per matching skill, up to ({max})",
    "117": "The higher the combined facility level, the more {e} you gain (up to {max})",
    "118": "When the bond gauge is {minBond} or higher, this card can appear in {n} trainings at once",
    "119": "When the bond gauge is {minBond} or higher, all your support cards appear in trainings more often",
    "120": "When the bond gauge is {minBond} or higher, gain stat bonus per card in your deck (up to {max})",
    "121": "All supports get {v} bonus bond from training, {v2} if training with this card",
    "122": "Supports that train with this card gain {e} ({v}) next turn",
}


def fetch(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "uma-turn-coach data build"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


# Card event rewards from Euophrys' tier list (MIT, github.com/Euophrys/umamusume-tierlist):
# per card [Speed, Stamina, Power, Guts, Wit, skill points, energy, bond] over a career,
# best reasonable choices, taking the chain to its gold skill.
EVENTS_URL = "https://raw.githubusercontent.com/Euophrys/umamusume-tierlist/main/src/card-events.js"


def fetch_events():
    req = urllib.request.Request(EVENTS_URL, headers={"User-Agent": "uma-turn-coach data build"})
    with urllib.request.urlopen(req, timeout=60) as r:
        text = r.read().decode("utf-8")
    return {int(k): [float(x) if "." in x else int(x) for x in v.replace(" ", "").split(",")]
            for k, v in re.findall(r"(\d+):\s*\[([^\]]+)\]", text)}


def main():
    manifest = fetch("/data/manifests/umamusume.json")
    get = lambda key: fetch("/data/umamusume/%s.%s.json" % (key, manifest[key]))
    supports = get("support-cards")
    effects = get("support_effects")
    trainees = get("character-cards")
    skills = get("skills")
    objectives = get("ura-objectives")
    race_list = get("races")
    ura_races = get("ura-races")
    race_fans = {x["id"]: {f["order"]: f["fans"] for f in x["fans"]} for x in get("race-fans")}
    events = fetch_events()

    effect_meta = {}
    for e in effects:
        effect_meta[e["id"]] = {
            "n": e.get("name_en") or e.get("name_en_eon") or e.get("name_ja"),
            "c": e.get("calc") or "add",
            "s": {"percent": "%", "level": "Lv"}.get(e.get("symbol"), ""),
        }

    want_skills = set()
    out_cards = []
    for c in supports:
        u = c.get("unique")
        card = {
            "id": c["support_id"],
            "cid": c.get("char_id"),
            "n": c["char_name"],
            "t": (c.get("title_en") or c.get("title_ja") or "").strip("[]"),
            "r": c["rarity"],
            "ty": TYPE_MAP.get(c["type"], c["type"]),
            "jp": c.get("release"),
            "en": c.get("release_en"),
            "src": c.get("obtained"),
            "e": c["effects"],
            "hs": c.get("hints", {}).get("hint_skills", []),
            "es": c.get("event_skills", []),
        }
        if u:
            card["u"] = {"lv": u["level"], "e": u["effects"]}
        if c["support_id"] in events:
            card["ev"] = events[c["support_id"]]
        want_skills.update(card["hs"])
        want_skills.update(card["es"])
        out_cards.append(card)

    out_trainees = []
    for t in trainees:
        tr = {
            "id": t["card_id"],
            "cid": t["char_id"],
            "n": t["name_en"],
            "t": (t.get("title_en_gl") or t.get("title") or "").strip("[]"),
            "r": t["rarity"],
            "jp": t.get("release"),
            "en": t.get("release_en"),
            "apt": t["aptitude"],
            "g": t["stat_bonus"],
            "b": t.get("five_star_stats") or t.get("base_stats"),
            "us": t.get("skills_unique", []),
            "is": t.get("skills_innate", []),
            "as": t.get("skills_awakening", []),
        }
        want_skills.update(tr["us"] + tr["is"] + tr["as"])
        out_trainees.append(tr)

    # Career objectives per character (GameTora's URA objectives; other scenarios use the same
    # character goals except where the scenario sets its own). Each goal: turn (deadline, or the
    # race's turn for a fixed race), condition type (1 = finish in the top N, 3 = fans), value,
    # race choice (0 = one fixed race, else pick one of the races), order (alternatives share
    # it), race names. URA Finals goals
    # (target type 3) are left to the scenario.
    out_obj = {}
    for o in objectives:
        goals = []
        for g in sorted(o["objectives"], key=lambda x: x.get("order", 0)):
            if g.get("target_type") == 3:
                continue
            goals.append({
                "t": g.get("turn"),
                "c": g.get("cond_type"),
                "v": g.get("cond_value"),
                "ch": g.get("race_choice", 0),
                # Goals with the same order and a race choice are alternatives: run one of them.
                "o": g.get("order", 0),
                "r": [r.get("name_en") or r.get("name_ja") for r in g.get("races", [])],
            })
        out_obj[o["char_id"]] = goals

    # Career race calendar: every race you can enter on each turn (years 1-3), with grade
    # (100 G1, 200 G2, 300 G3, 400 OP, 700 Pre-OP), fans for 1st to 5th, fans needed to enter,
    # distance and surface (1 turf, 2 dirt). Turn = (year - 1) * 24 + (month - 1) * 2 + half.
    by_instance = {r["id"]: r for r in race_list}
    out_races = []
    for x in ura_races:
        r = by_instance.get(x.get("instance"))
        if not r or x.get("year", 9) > 3 or r.get("grade") not in (100, 200, 300, 400, 700):
            continue
        fans = race_fans.get(x.get("fans_gain"), {})
        out_races.append({
            "t": (x["year"] - 1) * 24 + (x["month"] - 1) * 2 + x["half"],
            "n": r.get("name_en") or r.get("name_ja"),
            "g": r["grade"],
            "f": [fans.get(i, 0) for i in range(1, 6)],
            "need": x.get("fans_needed", 0),
            "d": r.get("distance"),
            "s": r.get("terrain"),
        })
    out_races.sort(key=lambda r: (r["t"], r["g"], r["n"]))

    skill_names = {}
    skill_cost = {}
    for s in skills:
        if s["id"] in want_skills:
            skill_names[s["id"]] = s.get("name_en") or s.get("enname") or s.get("jpname")
            if s.get("cost"):
                skill_cost[s["id"]] = s["cost"]

    data = {
        "meta": {"source": "GameTora (gametora.com)", "built": datetime.date.today().isoformat(), "cards": len(out_cards), "trainees": len(out_trainees)},
        "effects": effect_meta,
        "uniqueText": UNIQUE_TEXT,
        "supports": out_cards,
        "trainees": out_trainees,
        "skills": skill_names,
        "skillCost": skill_cost,
        "objectives": out_obj,
        "races": out_races,
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
        f.write("// Generated by tools/build_data.py from GameTora (gametora.com). Game data (c) Cygames, Inc.\n")
        f.write("(function (root) {\n  const DATA = " + body + ";\n")
        f.write('  if (typeof module !== "undefined" && module.exports) module.exports = DATA;\n  else root.UmaData = DATA;\n')
        f.write('})(typeof window !== "undefined" ? window : globalThis);\n')
    print("wrote", OUT, os.path.getsize(OUT), "bytes;", len(out_cards), "cards,", len(out_trainees), "trainees,", len(skill_names), "skills")


if __name__ == "__main__":
    sys.exit(main())
