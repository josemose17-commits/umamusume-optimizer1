# Optimization research (November 2026)

The question: are parent skill picks, ace decks and Umalator-based skill picks as good as they
can be? Below: what was checked, what was found, and what changed. To have ChatGPT challenge it,
use [chatgpt-research-prompts.md](chatgpt-research-prompts.md). The first ChatGPT audit (prompt 1
plus a review of the first commit) led to the corrections marked **(audit)**.

Benchmark scripts are in `tools/research/` (`exp.js`: noise and mood; `stam.js`: full spurt by
stamina; `trade.js`: stat-line head-to-heads), all on the pinned worker.

## Skill picks (Umalator)

| Check | Result |
| --- | --- |
| Mood | **Fixed.** Comparisons ran at Great mood. uma.guide recommends Normal for CM rounds and Great for finals. Normal is now the default; Good and Great can be picked. In `exp.js` (Pace Chaser, Nakayama 2000 [cm23], 40 gold skills, single skills only, 400 races) mood moved values by at most 0.02 L. That is one setup, not every build. |
| Sample noise | **Changed:** the top two sets now play head-to-head (240 paired races, fresh seed: tie, win or swap), and the final gain is confirmed on races the search never used. Same setup, 24 vs. 400 races: mean error 0.01 L and the same top 10. This supports single-skill screening on that setup. It does not prove that close **set** comparisons are always settled. **(audit)** Results now show the paired SD and a 95% interval (± L) for the chosen set, so a close call is visible. |
| Rushed, Wit checks, position keep | In the pinned worker (`kakari`, `withWisdomChecks`, `useDefaultPacer`). A virtual pacer and lead-fight approximation are not a full field. |
| Opponent-dependent triggers | **(audit)** Upstream maps `blocked_front`, `change_order_onetime` and similar to sampled timing. A simulated activation is not evidence that a real opponent supplied the condition. The app labels these "Depends on race conditions". Treat their L as conditional. |
| Front Runner "rival ahead" exclusion | **(audit)** This describes the assumed position (leading), not every race. **Changed:** a per-cup setting, *Fight for the lead* (15/30/50% of the race with someone ahead, an assumption), brings those skills back at that share. Also fixed: **Skills for this build**'s set search let them back in at full simulated value even for a leader. They are now dropped when she leads alone. |
| Single runner vs. a 9-runner field | No publicly validated full-field Global simulator was found. kachi-dev's fork, VFalator and Moomoolator are related forks: agreement between them is weak corroboration. JP's emulator (mee1080/umasim, a port of uma-clock-emu) is JP rules. |

Skill naming: match by skill ID, not English name. **Unyielding** and **Unyielding Spirit** are
different skills, and the pinned catalog's Unyielding condition is not the `change_order_onetime`
example a guide quotes.

## Stamina targets (ace decks and parents)

Stat targets were fixed per distance (dirt 800 stamina, mile 800, medium 1000). The simulator
gives a much lower **empty-skill reference** on most mile and dirt cups for Pace Chasers, Late
Surgers and End Closers. Example, Aquarius Cup 2 (Tokyo 1600 dirt): Pace 550 (159/160 full
spurts), Late/End 500, Front 800. ChatGPT reproduced these counts. Historical JP guidance for that cup
(altema, updated 2024-01-11) was 650 for Pace Chasers and 600 for the other styles, under its own
reference conditions.

`trade.js` (same cup, no skills): moving 150–200 stamina into speed gained Pace, Late and End
0.3–0.46 L in the simulator, Front 0.07–0.10 L. **(audit)** That is the stat line alone. What a
career can actually reach, with coupled gains, caps and SP, is a separate question: the deck search
answers it, and this number doesn't.

What the app does (`data/stamina-needs.js`, built by `tools/build_stamina_needs.js`, version 2):
- **Reference, not requirement.** Each cup and style: the cup's simulation stats, Normal mood,
  A aptitudes, **no equipped skills at all**. Need = the lowest stamina (steps of 50) whose
  full-spurt count over 160 races is within 2 points of the count at 2000 stamina. The 2-point
  tolerance is a policy choice, not a confidence bound (159/160 has a 95% Wilson lower bound of
  about 96.6%). Each entry records its counts, the step below (which must fail) and a rerun on an
  independent seed. The app ignores a value whose rerun misses by more than 4 races (one does: CM 11's
  Front Runner).
- **(audit)** Cups with JP's stamina showdown (CM 27 on, every League of Heroes) are **skipped**:
  the Global engine has no showdown, and showdown is a stamina mechanic. The first version wrongly
  lowered their targets. They now keep the distance build's stamina, with a note saying why.
- +100 is added as a rough allowance for stamina debuffers. It is **uncalibrated** (one guide's rule
  of thumb), and the app labels it that way.
- It only lowers the distance build's target. **(audit)** When the reference is higher (long
  courses: no heals in it), the app now warns and says to plan recovery skills, instead of staying
  silent.
- **(audit)** The finished build is checked separately. **Skills for this build** reports her
  full-spurt rate with her real stats and skills, and now warns below 95%.
- Used for the racing ace's default targets, career scoring and **Her gaps**. Parent decks are
  unchanged. Your own targets override it.

## Parents and sparks

The app's rates follow the community values (uma.guide, umareference, GameTora), and the second
ChatGPT pass checked them against JP measurements:
- Inheritance white 3/6/9%, green 5/10/15%, pink 1/3/5%, race 1/2/3%, blue 70/80/90%,
  × (1 + that uma's own affinity / 100). **Confirmed** by Polaris's JP counts (2025-08-05; e.g.
  2★ white 9,912/166,000 = 5.97%, 1★ pink 37/4,000 = 0.93%). Cygames' patent JP2022018121A has the
  affinity structure. Global not independently replicated.
- **Changed: grandparents.** The app also multiplied grandparents by 0.5 (umareference's guess).
  Polaris (2024-07-30, 1,000 inspirations) measured zero-affinity grandparent blues at 895–900 (3★)
  and 783–795 (2★) per 1,000: the parent rate. A grandparent's own affinity is already lower in the
  app (affinity.js counts only her own links), so the extra 0.5 double-counted. Now 1.
- **Changed: lineage.** The spark-generation bonus per family member carrying the same white is now
  ×1.1 each (Pochi's JP table, 2022), not +2.5/+5 points: 20% → 35.4%, ◎ 25% → 44.3%,
  gold 40% → 70.9% with all six. Owada's 2021 tests support the direction, not the formula.
- **Changed: inherited hint level.** A white spark was taken as Lv1 (10% SP off). GameWith's JP counts
  (29/57/12 observations for 1★/2★/3★) average about Lv1.7/2.4/3.0, so it's now Lv1/Lv2/Lv3 by stars,
  rounded down. Small samples: still on the cautious side.
- Star odds: 50/45/5 below SS, 20/70/10 from **SS** (17,500): the app already used SS. Blue by that
  stat: <600 90/10/0, 600–1099 ~50/45/5 (Data Station 2021: 49/45/6, retained records, some bias),
  1100+ 20/70/10. Already matched.
- Affinity: +3 per distinct shared G1 on the links Parent 1↔Parent 2 and each parent↔her own
  parents (U-tools 2023, JP), as affinity.js does. Global guides disagree about when Global got
  this system; the app assumes it has.
- Stacking vs spreading whites: no universal answer. The app values each family's combined chance
  (1 − Π(1 − p)) against what her deck already offers, which is the calculation ChatGPT describes.

Gold-lineage and blue-star fixes from the first audit stand. The gold fix is now part of the ×1.1 rule.

## What stats and aptitudes are worth (parents)

**Changed.** The family score converted every stat at 60 points = 1 L and every needed aptitude at
1 L. `tools/build_stat_values.js` (`data/stat-values.js`) measures both per cup and style,
head-to-head, no skills, Normal mood. Other stats are measured at the style's full-spurt stamina.
Stamina is measured over the 150 points below that level, what filling a real gap is worth.
Aquarius Cup 2, per 60 points:

| Style | Speed | Stamina | Power | Guts | Wit |
| --- | --- | --- | --- | --- | --- |
| Front | 0.15 | 0.11 | 1.18 | 0.13 | 0.18 |
| Pace | 0.14 | 0.14 | 0.99 | 0.03 | 0.20 |
| Late | 0.13 | 0.27 | 0.94 | 0.10 | 0.19 |
| End | 0.12 | 0.36 | 1.01 | 0.08 | 0.21 |

Speed past 1200 counts half in races, so on these stat lines power is worth several times more
per point. Aptitudes: distance A→S 0.55–0.65 L on that dirt mile and about 1.25 L on Nakayama
2000, surface A→S 0.75–0.8 L, style A→S 0.3–0.45 L. B→A is about twice A→S.

Now used for blue-spark value where she's short, blue order and the split of blues you still pick
(fewest lengths short), pink value, pink choice within each group, and parent ranking. A below-A
aptitude still comes first, because start stars lift it for sure, while S needs an inspiration roll.
Stamina-showdown cups keep the flat rules. Limits: one stat line per cup, no skills. Skills that
add speed or acceleration change these values somewhat.

## Ace decks

No per-cup Global meta-deck list was found to check the optimizer against. **(audit)** The note.com
article cited earlier (3 Speed, 1 Stamina, 1 Wit, 1 Friend) is for Kyoto 2200 turf in JP's newer
scenario. It is not evidence for Global's Aquarius or Pisces decks. Prompt 2 asks for Global decks.

## Open work (from the audit)

- Tactical packages (opening skills that set off Angling and Scheming; corner speed that connects
  into Lightning Surge; Christmas Oguri's recovery chain) evaluated as packages.
- Stamina stress tests against debuffs once a debuff model exists.
- Practice and room matches against fields of contrasting styles remain the real check.

## Sources

- uma.guide, Umalator 101: https://uma.guide/guides/umalator-101
- umareference, Finding good skills: https://www.umareference.com/guide/pvp-champions-meeting/finding-good-skills
- umaracesimulator.blog guide (unverified numbers): https://umaracesimulator.blog/blog/how-to-use-umalator-uma-race-simulator-guide/
- uma.guide, Sparks: https://uma.guide/guides/sparks
- uma.guide, Parenting: https://uma.guide/guides/parenting-in-umamusume
- umareference, Chance of inheriting sparks: https://www.umareference.com/guide/legacies/chance-of-inheriting-sparks
- umareference, Chance of getting white sparks: https://www.umareference.com/guide/legacies/chance-of-getting-white-sparks
- GameTora, Legacies: https://gametora.com/umamusume/legacies
- Owada (JP), white sparks: https://owadablog.com/white-factor/
- alpha123 activation conditions: https://github.com/alpha123/uma-skill-tools/blob/master/ActivationConditions.ts
- kachi-dev fork: https://github.com/kachi-dev/uma-tools
- altema, Aquarius Cup stamina: https://altema.jp/umamusume/akueriasuhaistamina
- game8.jp, Aquarius Cup 2023: https://game8.jp/umamusume/509673
- umamusumelabo, Aquarius 2023 guides: https://umamusumelabo.com/ikusei/aquarius2023-senkou-ikusei
- note.com, October 2026 CM decks (JP, Kyoto 2200): https://note.com/umamusume_sui/n/nbbf005958478
