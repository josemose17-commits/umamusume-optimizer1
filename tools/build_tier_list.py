#!/usr/bin/env python3
"""Champions Meeting tier lists per distance from kamigame (神ゲー攻略, a JP strategy site):
data/tier-list.js, for the Pull planner's meta picks.

The ranking page lists each distance's CM ranking (SS, S, A; lower tiers aren't given per
distance) as icons named in Japanese with an outfit prefix (新衣装, 水着, バレンタイン...). Each
icon links to that uma's own page, which names her unique skill; GameTora's Japanese skill
names (jpname) and trainee unique skills turn that into the exact outfit (card id). An icon whose
page names no outfit's unique (or several) is kept by name in "unmatched", never guessed.

Run by hand (it reads one page per uma, about 1 a second):
    python3 tools/build_tier_list.py
Data: kamigame.jp (ranking), GameTora (names, skills). Game data (c) Cygames, Inc.
"""
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request

PAGE = "https://kamigame.jp/umamusume/page/146166686402230480.html"
SITE = "https://kamigame.jp"
GT = "https://gametora.com"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "tier-list.js")
DISTANCES = {"短距離": "Sprint", "マイル": "Mile", "中距離": "Medium", "長距離": "Long", "ダート": "Dirt"}
TIERS = ("SS", "S", "A")


def get(url, agent="Mozilla/5.0 (uma-turn-coach tier list build)"):
    req = urllib.request.Request(url, headers={"User-Agent": agent})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8")


def norm(text):
    """Letters, kana and kanji only (NFKC), so punctuation written differently (…, ！, ☆) still matches."""
    return re.sub(r"[\W_]+", "", unicodedata.normalize("NFKC", text)).casefold()


# A tie between outfits of one uma: the icon's prefix says which. No prefix: her first outfit; a
# season prefix: the outfit JP released in those months.
SEASONS = [("バレンタイン", (1, 2)), ("花嫁", (5, 6)), ("水着", (6, 7, 8)), ("夏", (6, 7, 8)),
           ("ハロウィン", (9, 10)), ("クリスマス", (11, 12)), ("サンタ", (11, 12)), ("正月", (12, 1))]


def tiebreak(name, tied, info):
    for word, months in SEASONS:
        if name.startswith(word):
            fit = [cid for cid in tied if info[cid][1] and int(info[cid][1][5:7]) in months]
            return fit[0] if len(fit) == 1 else None
    chars = {info[cid][0] for cid in tied}
    if len(chars) == 1 and not re.match(r"^(新衣装|チア|ダンス|マーチ|UAF|メカ|忍者|和服|応援団|凱旋門賞|黄昏)", name):
        first = min(tied)
        return first if first % 100 == 1 else None
    return None


def outfit(page, title, uniques, name="", info=None):
    """The outfit whose unique skill the page names most (its own appears in its skill table and
    text; others only in comparisons). Characters named in the title first; a nickname title
    (クリスマスダスカ) falls back to every uma. A tie: tiebreak() by the icon's prefix, else None."""
    text = norm(re.sub(r"<[^>]+>", " ", page))
    count = lambda pool: sorted(((text.count(norm(uq)), cid) for cid, n, uq in pool if norm(uq)), reverse=True)
    named = [u for u in uniques if u[1] in title]
    hits = [h for h in count(named or uniques) if h[0] > 0]
    if hits and (len(hits) == 1 or hits[0][0] > hits[1][0]):
        return hits[0][1]
    # A tie, or a page that doesn't spell her unique out: the uma the title names, by the prefix.
    tied = [cid for c, cid in hits if c == hits[0][0]] if hits else [cid for cid, n, uq in named]
    if len(tied) == 1:
        return tied[0]
    return tiebreak(name, tied, info) if info and tied else None


def sections(src):
    """{distance: [(tier, name, href)]} from the "<distance>チャンミランキング" sections, each uma
    once (the page repeats its lists; the first place she appears is her tier)."""
    heads = [(m.start(), html.unescape(re.sub(r"<[^>]+>", "", m.group(2))).strip())
             for m in re.finditer(r"<(h2|h3)[^>]*>(.*?)</\1>", src, re.S)]
    out = {}
    for i, (pos, title) in enumerate(heads):
        m = re.fullmatch(r"(短距離|マイル|中距離|長距離|ダート)チャンミランキング", title)
        if not m:
            continue
        chunk = src[pos:heads[i + 1][0] if i + 1 < len(heads) else len(src)]
        tier, seen, rows = None, set(), []
        for x in re.finditer(r'(?:<a href="(/umamusume/page/\d+\.html)"[^>]*>\s*)?<img[^>]*alt="([^"]*)"', chunk):
            href, alt = x.group(1), html.unescape(x.group(2)).strip()
            if alt in TIERS or alt in ("B", "C", "D", "E", "F"):
                tier = alt if alt in TIERS else None
                continue
            if tier and href and alt not in seen:
                seen.add(alt)
                rows.append((tier, alt, href))
        out[DISTANCES[m.group(1)]] = rows
    return out


def main():
    src = get(PAGE)
    updated = re.search(r"最終更新日.{0,200}?(\d{4})/(\d{1,2})/(\d{1,2})", src, re.S)
    updated = "%s-%02d-%02d" % (updated.group(1), int(updated.group(2)), int(updated.group(3))) if updated else None
    lists = sections(src)
    if len(lists) != len(DISTANCES):
        sys.exit("expected %d CM rankings, found %s" % (len(DISTANCES), sorted(lists)))
    manifest = json.loads(get(GT + "/data/manifests/umamusume.json", "uma-turn-coach data build"))
    fetch = lambda key: json.loads(get(GT + "/data/umamusume/%s.%s.json" % (key, manifest[key]), "uma-turn-coach data build"))
    cards, skills = fetch("character-cards"), {s["id"]: s for s in fetch("skills")}
    info = {c["card_id"]: (c["char_id"], c.get("release")) for c in cards}
    uniques = [(c["card_id"], c["name_jp"], skills[c["skills_unique"][0]]["jpname"])
               for c in cards if c.get("skills_unique") and c["skills_unique"][0] in skills and skills[c["skills_unique"][0]].get("jpname")]

    pages, matched, unmatched = {}, {}, []
    hrefs = sorted({h for rows in lists.values() for _, _, h in rows})
    names = {h: n for rows in lists.values() for _, n, h in rows}
    for n, href in enumerate(hrefs):
        try:
            page = get(SITE + href)
        except Exception as e:  # a page that won't load stays unmatched
            print("skip", href, e, file=sys.stderr)
            continue
        title = html.unescape((re.search(r"<title>(.*?)</title>", page, re.S) or [None, ""])[1])
        cid = outfit(page, title, uniques, names[href], info)
        if cid:
            matched[href] = cid
        pages[href] = title
        if n % 10 == 9:
            print("%d/%d pages" % (n + 1, len(hrefs)), file=sys.stderr)
        time.sleep(1)

    cm = {}
    for dist, rows in lists.items():
        cm[dist] = {t: [] for t in TIERS}
        for tier, name, href in rows:
            if href in matched:
                cm[dist][tier].append(matched[href])
            else:
                unmatched.append({"distance": dist, "tier": tier, "name": name})
    data = {"meta": {"source": "kamigame.jp 神ゲー攻略: 最強キャラランキング (チャンミ, per distance)", "url": PAGE,
                     "updated": updated, "built": time.strftime("%Y-%m-%d"),
                     "rule": "JP's Champions Meeting ranking per distance (SS, S, A), each uma matched to her outfit by the unique skill her own page names"},
            "cm": cm, "unmatched": unmatched}
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// Generated by tools/build_tier_list.py. Do not edit.\n// JP Champions Meeting tier lists per distance (kamigame.jp), matched to outfits.\n"
                "(function (root) {\n  const data = " + body + ";\n  if (typeof module !== \"undefined\" && module.exports) module.exports = data;\n"
                "  else root.UmaTierList = data;\n})(typeof window !== \"undefined\" ? window : globalThis);\n")
    print("wrote", OUT, {d: {t: len(v[t]) for t in TIERS} for d, v in cm.items()}, "unmatched", len(unmatched))


if __name__ == "__main__":
    main()
