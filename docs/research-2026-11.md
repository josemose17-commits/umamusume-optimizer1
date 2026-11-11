# Optimization research (November 2026)

The question: are parent skill picks, ace decks and Umalator-based skill picks as good as they
can be? Below: what was checked, what was found, and what changed. To have ChatGPT challenge it,
use [chatgpt-research-prompts.md](chatgpt-research-prompts.md).

## Skill picks (Umalator)

| Check | Result |
| --- | --- |
| Mood | **Bug fixed.** Comparisons ran at Great mood, while uma.guide and the app's own docs say CM rounds should use Normal. Normal is now the default; Good and Great (finals) can be picked. Measured effect on skill values: at most 0.02 L, so this was not a big source of losses. |
| Sample noise | 39 gold skills, Pace Chaser, Nakayama 2000: 24-race values against 400-race values. Mean error 0.01 L, the same top 10, top 5 differing by at most one. The paired comparison (same seeds for both runners) keeps noise low. Not a source of losses. |
| Rushed, Wit checks, position keep | Already simulated by the pinned worker (`kakari`, `withWisdomChecks`, `useDefaultPacer`). |
| Order-dependent skills | Guides warn the chart over-values skills like Unyielding (`change_order_onetime`) and "pass N umas" skills (e.g. Behold Thine Emperor's Divine Might). The app already flags these as "Depends on race conditions" and drops back-half, front-half and rival-ahead skills by style. |
| Single runner vs. a 9-runner field | Unfixable with this engine: no public 9-runner simulator for Global was found. kachi-dev's fork adds more Wit variance and custom pacers, not a field. JP's race emulator (race.wf-calc.net) is JP-only. |

Conclusion: the Umalator search is sound for what it can model. The biggest gains are in what it
is given (stats, especially stamina) and in what it can't see (the field and team roles).

## Stamina targets (ace decks and parents)

**Changed.** Stat targets were fixed per distance (dirt 800 stamina, mile 800, medium 1000). The
simulator, with no recovery skills, says much less is needed on most mile and dirt cups for
Pace Chasers, Late Surgers and End Closers. Example, Aquarius Cup 2 (Tokyo 1600 dirt): 500–550.
JP's guides for the same cup suggested about 650 (game8.jp, altema).

Head-to-head on that cup, moving 150–200 stamina into speed gained Pace, Late and End
0.3–0.46 L, about one gold skill. Speed past 1200 costs double to train, so the real gain is
about half that. Front Runners gained much less (0.07–0.10 L): rushing costs them stamina at random.

What the app now does (`data/stamina-needs.js`, `tools/build_stamina_needs.js`):
- For each cup and style: the lowest stamina whose full-spurt rate is within 2 points of her
  rate at 2000 stamina, at the cup's simulation stats, Normal mood, no recovery skills.
- Adds 100 for stamina debuffers (a guide's 100–150 rule of thumb, unverified).
- Only lowers the distance build's stamina target, never raises it. Long courses come out at
  1400–2000 with no heals, which isn't realistic, since every long-distance ace carries heals.
- Used for the racing ace's default targets, career scoring and **Her gaps**, so Parents stops
  asking for stamina blue sparks she doesn't need. Parent decks are unchanged. Your own targets
  still override it.

## Parents and sparks

Every rate in `family.js` and `skill-access.js` matches the community sources (uma.guide sparks and
parenting guides, umareference, GameTora, JP verification blogs):
inheritance white 3/6/9%, green 5/10/15%, pink 1/3/5%, blue 70/80/90%, × (1 + affinity/100).
Generation is 20/25/40% plus a lineage bonus. Open questions that nobody has measured:
- the grandparent factor (0.5 is one author's guess);
- whether the lineage bonus is linear (+2.5% per copy) or ×1.1 per copy;
- the hint-level odds for an inherited white.

Prompt 4 in the ChatGPT file asks for exactly these. No change was made, because no better
numbers exist.

## Ace decks

JP's current CM guides (note.com, October 2026) mostly use 3 Speed + 1 Stamina + 1 Wit + 1 Friend.
The deck search already ranks with Euophrys' JP-simulation card scores. No per-cup Global meta
deck list was found to check against. Prompt 2 asks for one.

## Sources

- uma.guide, Umalator 101: https://uma.guide/guides/umalator-101
- umareference, Finding good skills: https://www.umareference.com/guide/pvp-champions-meeting/finding-good-skills
- umaracesimulator.blog guide (unverified numbers): https://umaracesimulator.blog/blog/how-to-use-umalator-uma-race-simulator-guide/
- uma.guide, Sparks: https://uma.guide/guides/sparks
- uma.guide, Parenting: https://uma.guide/guides/parenting-in-umamusume
- umareference, Chance of inheriting sparks: https://www.umareference.com/guide/legacies/chance-of-inheriting-sparks
- GameTora, Legacies: https://gametora.com/umamusume/legacies
- kachi-dev fork: https://github.com/kachi-dev/uma-tools
- game8.jp, Aquarius Cup 2023: https://game8.jp/umamusume/509673
- altema, Aquarius Cup course: https://altema.jp/umamusume/akueriasuhaicourse
- note.com, October 2026 CM decks (JP): https://note.com/umamusume_sui/n/nbbf005958478
