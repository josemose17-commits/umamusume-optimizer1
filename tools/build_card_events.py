#!/usr/bin/env python3
"""Builds data/card-events.js: every support card's training events, from the Umamusume Wiki.

Source: umamusu.wiki (CC BY-SA 4.0). Each event's choices and results come from the wiki's
Game_Training_Event_Choice Cargo table; which events belong to which card (chain, other
events) and their titles come from the wiki's own support page module. Values are as the
wiki lists them (players' observations, so the card level behind them varies).

Usage: python3 tools/build_card_events.py [cache dir]
Run from the repository root. Needs network access to umamusu.wiki.
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

API = "https://umamusu.wiki/w/api.php"
CACHE = sys.argv[1] if len(sys.argv) > 1 else None
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "card-events.js")
UA = {"User-Agent": "uma-turn-coach data build (github.com/josemose17-commits/hfh-test)"}


def get(params, key):
    path = CACHE and os.path.join(CACHE, key + ".json")
    if path and os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    url = API + "?" + urllib.parse.urlencode(dict(params, format="json"))
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                data = json.load(r)
            break
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** (attempt + 1))
    if path:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    time.sleep(0.5)  # be gentle with the wiki
    return data


def supports():
    with open(os.path.join(os.path.dirname(__file__), "..", "data", "gametora.js"), encoding="utf-8") as f:
        src = f.read()
    i = src.index("const DATA = ") + len("const DATA = ")
    data = json.JSONDecoder().raw_decode(src[i:])[0]
    return data["supports"]


def choices():
    rows, offset = [], 0
    while True:
        d = get({"action": "cargoquery", "tables": "Game_Training_Event_Choice",
                 "fields": "_pageName=page,number,text_en,description",
                 "where": '_pageName LIKE "Game:Training Events/8%"', "limit": 500, "offset": offset,
                 "order_by": "_pageName,number"}, "choices_%d" % offset)
        batch = [r["title"] for r in d.get("cargoquery", [])]
        rows += batch
        if len(batch) < 500:
            return rows
        offset += 500


def card_sections(ids):
    """Titles, chain order and sections for a batch of cards, from the wiki's own module."""
    text = "".join("\n@@CARD %d@@\n{{#invoke:Game/TrainingEvents|supportPageInsert|%d}}" % (i, i) for i in ids)
    d = get({"action": "expandtemplates", "text": text, "prop": "wikitext"}, "cards_%d_%d" % (ids[0], ids[-1]))
    return d["expandtemplates"]["wikitext"]


STAT_KEYS = {"speed": 0, "stamina": 1, "power": 2, "guts": 3, "wit": 4, "wits": 4, "wisdom": 4, "intelligence": 4}
# A value, or a range "+10-16" (the low and high end across card levels), kept as [low, high].
NUM = r"([+-]\s*\d+(?:-\d+)?|\d+(?:-\d+)?)\??"


def num(v):
    v = v.replace(" ", "")
    sign = -1 if v.startswith("-") else 1
    v = v.lstrip("+-")
    if "-" in v:
        lo, hi = v.split("-")
        return [sign * int(lo), sign * int(hi)]
    return sign * int(v)


def add(a, b):
    if isinstance(a, list) or isinstance(b, list):
        a = a if isinstance(a, list) else [a, a]
        b = b if isinstance(b, list) else [b, b]
        return [a[0] + b[0], a[1] + b[1]]
    return a + b
BOLD = re.compile(r"'{2,3}")


def parse_effects(text):
    """One block of results ("Speed +10, Bond +5, <skill:200362> Hint +3") as a compact dict."""
    out = {}
    notes = []
    stats = [0, 0, 0, 0, 0]
    # Some entries miss a comma ("Guts +13 Bond +10"): split before each "Name +N".
    text = re.sub(r"(\d)\s+(?=[A-Z][a-z]+(?: [A-Za-z]+)? ?[+-]\s*\d|<skill:)", r"\1, ", text)
    for tok in re.split(r",|;|\n|<br\s*/?>", text):
        t = BOLD.sub("", tok).strip().strip("*").strip()
        if not t:
            continue
        low = t.lower()
        m = re.match(r"<skill:(\d+)>\s*(?:hints?(?: level)?\s*)?" + NUM, t, re.I)
        if m:
            lv = num(m.group(2))
            out.setdefault("h", []).append([int(m.group(1)), abs(lv[1] if isinstance(lv, list) else lv)])
            continue
        m = re.match(r"<skill:(\d+)>\s*(gain|obtain)", t, re.I) or re.match(r"(?:obtain|gain)\s+(?:skill\s+)?<skill:(\d+)>", t, re.I)
        if m:
            out.setdefault("g", []).append(int(m.group(1)))
            continue
        m = re.match(r"((?:\d+\s+)?[A-Za-z/ ]+?)(?:\(\?\))?\s*" + NUM + r"\s*\*?(?:\s*\(random\))?$", t)
        if m:
            name, v = m.group(1).strip().lower(), num(m.group(2))
            parts = [x.strip() for x in name.split("/")]
            if all(x in STAT_KEYS for x in parts):
                for x in parts:
                    stats[STAT_KEYS[x]] = add(stats[STAT_KEYS[x]], v)
                continue
            if name in ("all stats", "all parameters", "all stat", "all status", "all attributes", "all atributes"):
                stats = [add(x, v) for x in stats]
                continue
            key = {"energy": "e", "max energy": "me", "mood": "mo", "bond": "b", "skill points": "sp",
                   "skill pts": "sp", "skill point": "sp"}.get(name)
            if key:
                out[key] = add(out.get(key, 0), v)
                continue
            m2 = re.match(r"(\d+)?\s*random (attribute|atribute|stat)s?$", name)
            if m2:
                out["r"] = [abs(v[0]), abs(v[1])] if isinstance(v, list) else abs(v)
                out["rn"] = int(m2.group(1) or 1)
                continue
        if "unlocks recreation" in low or "unlocked recreation" in low:
            out["unlock"] = True
            continue
        if "bad condition" in low or "negative condition" in low:
            out["cure"] = True
            continue
        if "ends chain" in low or "ends support chain" in low or "end of chain event" in low:
            out["end"] = True
            continue
        if "depends on card level" in low:
            out["lv"] = True
            continue
        t = re.sub(r"\[\[Game:Conditions[^|\]]*\|([^\]]+)\]\]", r"\1 condition", t)
        t = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", t)
        t = re.sub(r'(?:Acquired|Gain|Get)\s+"([^"]+?)(?: condition)?"\s*Condition', r"\1 condition", t)
        t = re.sub(r"<skill:(\d+)>", r"skill #\1", t)
        t = re.sub(r"<[^>]+>", "", t).strip()
        if t and t not in ("???", "/"):
            notes.append(t)
    if any(x != 0 for x in stats):
        out["s"] = stats
    if notes:
        out["x"] = "; ".join(notes)
    return out


def parse_choice(desc):
    """Results always given, then the On Success / On Failure parts."""
    # A later reward can depend on an earlier selected choice. Do not flatten
    # those alternative rewards into one additive outcome (Nakayama Festa). The wiki may put
    # the outcome in italics: ''(Success)''.
    conditional = re.split(r"(?:'{3})?\s*Selected Choice (\d+) for (\d+)(?:st|nd|rd|th) event(?:\s*(?:'{2})?\((Success|Failure)\)(?:'{2})?)?\s*(?:'{3})?\s*:\s*(?:'{3})?", desc, flags=re.I)
    if len(conditional) > 1:
        base = parse_choice(conditional[0])
        groups = {}
        for k in range(1, len(conditional), 4):
            choice, stage, branch, text = conditional[k:k + 4]
            key = (int(stage), int(choice))
            entry = groups.setdefault(key, {"stage": key[0], "choice": key[1]})
            reward = parse_choice(text)
            if branch:
                entry["ok" if branch.lower() == "success" else "ng"] = reward
            else:
                entry.update(reward)
        base["when"] = list(groups.values())
        return base
    d = desc.replace("/ <br> /", "\n")
    m = re.split(r"'{3}\s*On (Success|Failure)(?:\(\?\))?:?\s*'{3}\s*:?", d)
    base = parse_effects(m[0])
    for k in range(1, len(m), 2):
        base["ok" if m[k] == "Success" else "ng"] = parse_effects(m[k + 1])
    return base


TITLE = re.compile(r"training-event-title-text\">'{3}<nowiki>(.*?)</nowiki>'{3}(?:\s*&nbsp;\s*<nowiki>(.*?)</nowiki>)?"
                   r"</div><div class=\"training-event-title-marker\">\s*(\(\d+ / \d+\))?\s*"
                   r"\[\[Game:Training Events/(\d+)\|edit\]\]", re.S)


def card_events(raw):
    """Per card: its event story ids by section (chain, other), and each event's title."""
    cards, titles = {}, {}
    for w in raw:
        parts = re.split(r"\n@@CARD (\d+)@@\n", w)
        for i in range(1, len(parts), 2):
            cid, body = int(parts[i]), parts[i + 1]
            secs = {}
            for sec in re.split(r"\n(?==+\s*[^=\n]+?\s*=+\n)", body):
                h = re.match(r"=+\s*([^=\n]+?)\s*=+\n", sec)
                if not h:
                    continue
                key = "chain" if "Chain" in h.group(1) else "other"
                for m in TITLE.finditer(sec):
                    sid = m.group(4)
                    secs.setdefault(key, []).append(int(sid))
                    titles[sid] = [m.group(1), m.group(2) if m.group(2) and m.group(2) != m.group(1) else ""]
            cards[cid] = secs
    return cards, titles


if __name__ == "__main__":
    sups = supports()
    rows = choices()
    ids = [c["id"] for c in sups]
    raw = [card_sections(ids[k:k + 20]) for k in range(0, len(ids), 20)]
    cards, titles = card_events(raw)
    found = {}
    for r in rows:
        sid = r["page"].rsplit("/", 1)[-1]
        ch = parse_choice(r.get("description") or "")
        if r.get("text en"):
            ch["t"] = r["text en"]
        found.setdefault(sid, []).append(ch)
    events = {}
    for sid, (en, jp) in titles.items():
        e = {"n": en}
        if jp:
            e["jp"] = jp
        if sid in found:
            e["c"] = found[sid]
        events[sid] = e
    have = sum(1 for e in events.values() if "c" in e)
    meta = {"source": "Umamusume Wiki (umamusu.wiki), training event pages", "license": "CC BY-SA 4.0",
            "events": len(events), "withResults": have}
    body = json.dumps({"meta": meta, "cards": cards, "events": events}, ensure_ascii=False, separators=(",", ":"))
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// Generated by tools/build_card_events.py from the Umamusume Wiki (umamusu.wiki).\n"
                "// Event data is licensed CC BY-SA 4.0 by the wiki's contributors. Do not edit.\n")
        f.write("(function (root) {\n  const CARD_EVENTS = " + body + ";\n")
        f.write('  if (typeof module !== "undefined" && module.exports) module.exports = CARD_EVENTS;\n'
                "  else root.UmaCardEvents = CARD_EVENTS;\n})(typeof window !== \"undefined\" ? window : globalThis);\n")
    print(len(cards), "cards,", len(events), "events,", have, "with results,", len(body) // 1024, "KB")
