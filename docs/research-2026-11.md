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
| Sample noise | Same setup, 24 vs. 400 races: mean error 0.01 L and the same top 10. This supports single-skill screening on that setup. It does not prove that close **set** comparisons are always settled. **(audit)** Results now show the paired SD and a 95% interval (± L) for the chosen set, so a close call is visible. |
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

The app's rates follow the most common community values (uma.guide, umareference, GameTora):
inheritance white 3/6/9%, green 5/10/15%, pink 1/3/5%, blue 70/80/90%, × (1 + affinity/100).
Generation is 20% white, 25% ◎ and 40% gold. **(audit)** The sources do not all agree:
- Pink 1★: 1% on uma.guide's Sparks page, 2% on its Parenting page.
- Lineage bonus: linear (+2.5 points per copy, +5 for gold) vs. ×1.1 per copy.
- Mid-stat blue and below-SS white stars: 50/45/5 vs. 45/50/5.
- Grandparent factor: umareference says half and questions it for blues. The app applies 0.5 to blues too.

Measurements exist (e.g. Owada's JP tests, 2021-05-21, small samples) but don't settle the current
Global formula.

Fixed **(audit)**:
- **Gold lineage credit.** Budgeted parent purchases added +2.5 points per lineage copy even to a
  learned gold. A gold now gets +5 (an always-learned gold with 6 copies: 70%, not 55%).
- **Blue-spark stars.** A fresh parent's blue was scored with SS odds (20/70/10) for every stat.
  Blue stars depend on the stat it lands on. They now follow her predicted careers' stats per stat:
  under 600 90/10/0, 600–1100 50/45/5, over 1100 20/70/10.

## Ace decks

No per-cup Global meta-deck list was found to check the optimizer against. **(audit)** The note.com
article cited earlier (3 Speed, 1 Stamina, 1 Wit, 1 Friend) is for Kyoto 2200 turf in JP's newer
scenario. It is not evidence for Global's Aquarius or Pisces decks. Prompt 2 asks for Global decks.

## Open work (from the audit)

- Tactical packages (opening skills that set off Angling and Scheming; corner speed that connects
  into Lightning Surge; Christmas Oguri's recovery chain) evaluated as packages.
- An untouched confirmation batch for the final skill set, and more races for close finalists.
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
