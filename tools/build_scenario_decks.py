#!/usr/bin/env python3
"""Deck makeups per scenario and distance from the scenario master guides (the community's
"Uma Musume: Pretty Derby. <Scenario> scenario master guide" documents, .docx), for the Pull
planner and CM & decks: data/scenario-decks.js.

The guides draw their example decks as rows of card-type icons (speed, stamina, power, guts, wit)
and the scenario's own card, under distance headings ("Short:", "Mile:", "Mid/Long:"), and end
each deck section with an "Icons:" key listing the icons in that order, then the portraits. So a
deck is decoded from the key; the portraits are named here per guide (from the guide's text).
Usage: python3 tools/build_scenario_decks.py <guide.docx> ...
Reads the .docx XML directly (no other packages).
"""
import datetime, json, os, re, sys, zipfile

TYPES = ["speed", "stamina", "power", "guts", "wit"]
GUIDES = {  # guide name in the file name -> Pull planner era id, its portraits (image -> card id)
    "Grand_Masters": (5, {"image1.png": 30137}),            # Ancestors & Guides (the 3 goddesses)
    "Project_LArc": (6, {"image7.png": 30160}),             # Mei Satake
    "U.A.F._Ready_Go": (7, {"image3.png": 30188}),          # Ryoka Tsurugi
    "Great_Food_Festival": (8, {"image4.png": 30207}),      # Yayoi Akikawa
    "Run_Mecha_Umamusume": (9, {"image4.png": 30188}),      # Ryoka Tsurugi (no scenario card)
    "Twinkle_Legends": (10, {"image7.png": 30188, "image15.png": 30241}),  # Ryoka; Embodiment of Legends
    "Design_Your_Island": (11, {"image4.png": 30188, "image6.png": 30257}),  # Ryoka; Tucker Bryne
    "Yukoma_Hot_Springs": (12, {"image2.png": 30276}),      # Kiyoko Hoshina
}
# The card every post-release guide deck of the scenario includes; Mecha has none.
REQUIRED = {5: 30137, 6: 30160, 7: 30188, 8: 30207, 10: 30241, 11: 30257, 12: 30276}
# Cards a guide singles out for the scenario without making them required.
PREFER = {9: {"Medium": [30226], "Long": [30226]}}  # Mecha: Air Shakur (stamina) in mid/long decks
# Guides given as text, not .docx: Grand Concert's deck makeups (shared by the user, 2026-11-24),
# for every distance. "Pal" is Global's name for a Friend card: any Friend card, no named one.
ALL = ["Sprint", "Mile", "Medium", "Long"]

# Grand Masters (Era 5) guide deck comps (every comp includes Ancestors & Guides, 30137).
GM_COMPS = [
    {"speed": 2, "stamina": 1, "wit": 2},
    {"speed": 2, "power": 1, "wit": 2},
    {"speed": 2, "guts": 1, "wit": 2},
    {"speed": 2, "guts": 2, "wit": 1},
    {"speed": 2, "stamina": 2, "wit": 1},
    {"speed": 3, "stamina": 1, "wit": 1},
    {"speed": 3, "power": 1, "wit": 1},
    {"speed": 3, "guts": 1, "wit": 1},
    {"speed": 3, "wit": 2},
    {"speed": 1, "stamina": 2, "wit": 2},
    {"speed": 1, "guts": 2, "wit": 2},
    {"speed": 1, "stamina": 1, "guts": 2, "wit": 1},
    {"speed": 1, "power": 1, "guts": 2, "wit": 1},
    {"speed": 4, "wit": 1},
    {"speed": 1, "stamina": 1, "power": 1, "wit": 2},
]


def grand_masters_decks():
    return [{"dist": ALL, "comp": dict(comp, **{"card:30137": 1}), "note": ""} for comp in GM_COMPS]


MANUAL = {
    4: {"guide": "Grand Concert", "required": None, "prefer": {}, "decks": [
        {"dist": ALL, "comp": comp, "note": ""} for comp in [
            {"speed": 3, "wit": 2, "friend": 1}, {"speed": 2, "wit": 3, "friend": 1},
            {"speed": 2, "stamina": 1, "wit": 2, "friend": 1}, {"speed": 3, "stamina": 1, "wit": 1, "friend": 1},
            {"speed": 2, "power": 1, "wit": 2, "friend": 1}, {"speed": 3, "power": 1, "wit": 1, "friend": 1},
            {"speed": 2, "guts": 1, "wit": 2, "friend": 1}, {"speed": 2, "guts": 2, "wit": 1, "friend": 1},
            {"speed": 1, "guts": 3, "wit": 1, "friend": 1}, {"speed": 1, "stamina": 2, "wit": 2, "friend": 1},
            {"speed": 2, "stamina": 2, "wit": 1, "friend": 1}, {"speed": 4, "wit": 1, "friend": 1},
        ]]},
    5: {"guide": "Grand Masters", "required": 30137, "prefer": {}, "decks": grand_masters_decks()},
}
DIST = {"short/mile": ["Sprint", "Mile"], "mid/long": ["Medium", "Long"], "short": ["Sprint"], "mile": ["Mile"], "mid": ["Medium"], "long": ["Long"]}


def rows(path):
    z = zipfile.ZipFile(path)
    x = z.read("word/document.xml").decode()
    rels = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="([^"]+)"', z.read("word/_rels/document.xml.rels").decode()))
    seg = x[x.find("Deck choices"):]
    for p in re.findall(r"<w:p[ >].*?</w:p>", seg, flags=re.S):
        text = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p)).strip()
        imgs = [rels.get(r, "?").split("/")[-1] for r in re.findall(r'r:embed="(rId\d+)"', p)]
        if imgs or text:
            yield text, imgs


def decode(path, era, special):
    rs = list(rows(path))
    legend = next(im for t, im in rs if t.startswith("Icons"))
    kind = {legend[i]: TYPES[i] for i in range(5)}
    kind.update({k: str(v) for k, v in special.items()})
    dist, decks = None, []
    for t, im in rs:
        tl = t.lower()
        if re.match(r"^(what if|example|no-akikawa)", tl):
            dist = None
        m = re.match(r"^(short/mile|mid/long|short|mile|mid|long)\b", tl)
        if m:
            dist = DIST[m.group(1)]
        if dist and len(im) == 6 and all(i in kind for i in im):
            cards = [kind[i] for i in im]
            comp = {}
            for c in cards:
                k = c if c in TYPES else "card:" + c
                comp[k] = comp.get(k, 0) + 1
            note = "" if m else re.sub(r"^\(|\)$", "", t.strip())
            decks.append({"dist": dist, "comp": comp, "note": note})
    return decks


def main(paths):
    eras = {}
    for path in paths:
        name = next((g for g in GUIDES if g in os.path.basename(path)), None)
        if not name:
            continue
        era, special = GUIDES[name]
        if era == 5:
            eras[str(era)] = MANUAL[5]
            continue
        eras[str(era)] = {"guide": name.replace("_", " "), "required": REQUIRED.get(era), "prefer": PREFER.get(era, {}), "decks": decode(path, era, special)}
    for era, e in MANUAL.items():
        eras.setdefault(str(era), e)
    data = {"meta": {"built": datetime.date.today().isoformat(), "source": "the scenario master guides (community documents), example decks decoded from their icon rows"}, "eras": eras}
    out = os.path.join(os.path.dirname(__file__), "..", "data", "scenario-decks.js")
    with open(out, "w", encoding="utf-8") as f:
        f.write("// Generated by tools/build_scenario_decks.py from the scenario master guides. Do not edit.\n")
        f.write("// Deck makeups per scenario (Pull planner era id) and distance: comp counts by card type, plus\n")
        f.write("// card:<id> for a named card (the scenario's own card). required: the card every deck includes.\n")
        f.write("(function (root) {\n  const data = " + json.dumps(data, ensure_ascii=False) + ";\n")
        f.write('  if (typeof module !== "undefined" && module.exports) module.exports = data;\n  else root.UmaScenarioDecks = data;\n')
        f.write('})(typeof window !== "undefined" ? window : globalThis);\n')
    print("wrote", out, {k: len(v["decks"]) for k, v in eras.items()})


if __name__ == "__main__":
    main(sys.argv[1:])
