# ChatGPT Deep Research prompts

Paste each prompt into ChatGPT with **Deep Research** on, one per chat. Paste the full answer back
to Claude, which checks every claim against the app's data and the simulator before anything changes.
Each prompt lists what the app assumes today, so ChatGPT has to confirm or overturn something
specific instead of writing a general guide.

Rules in every prompt (keep them): separate **Global** from **JP** facts, give a date and link for
every number, say "unknown" instead of guessing, and flag anything that only one source says.

---

## 1. Picking skills for a Champions Meeting ace (is the Umalator enough?)

```
You are researching Umamusume: Pretty Derby (Global/English server) Champions Meeting.
I build my ace's skills with alpha123's Umalator (uma-tools, Global build). I keep losing, and I
want to know where Umalator-based picks are wrong. Be adversarial: I want the flaws, not praise.

My tool currently does this. Attack each point with sources:
1. Ranks skill sets by MEAN length gained vs. the same uma without them, 24 simulated races per
   set while searching, then the top 3 sets rechecked at 96 races. One runner, no real field.
2. Position keep, the Wit skill-activation check, rushed (kakari) and "compete for the lead" are on.
3. Skills that need her in the back half are dropped for Front Runners and Pace Chasers. Front-half
   skills are dropped for End Closers. For Front Runners, skills that need a rival ahead
   (Slipstream, No Stopping Me!, passing skills) are dropped.
4. Order-dependent skills (e.g. Unyielding, anything with change_order / "pass N umas") are
   otherwise taken at face value.
5. Debuffs are ignored for the ace, and stamina debuffs from opponents are not simulated.

Questions:
a) What do top Global and JP CM players use instead of, or on top of, Umalator's length chart?
   Name the tools (kachi-dev's fork, VFalator, Moomoolator, JP's race emulator at race.wf-calc.net,
   any 9-runner simulator) and what each models that alpha123's doesn't.
b) Which skill categories does a single-runner sim over-value or under-value, by running style?
   Give named examples (e.g. Unyielding, late-race passing skills, mid-race accel, position skills).
c) Is mean, median or a low percentile the better pick metric for winning a 9-runner race? Is
   there evidence that "late-race acceleration" or "reaching the front at the final corner" matters
   more than total length?
d) How many simulations are needed before two builds 0.3 lengths apart can be told apart?
e) For the next Global cups, Tokyo 1600m dirt (Soft, Snowy, Winter) and Nakayama 2000m turf
   (Firm, Sunny, Spring): which skills and inherited uniques do JP's guides from when JP ran these
   cups (game8.jp, gamewith, kamigame, note.com) rate highest, by style? Which of those exist on
   Global by those dates?
Output: a table of claims (claim, Global or JP, source link, date, confidence), then a list of
concrete changes I should make to my method.
```

## 2. Ace racing decks and stat targets (Global, by style)

```
Research Umamusume: Pretty Derby Global (English) support-card decks for Champions Meeting aces,
as of the latest available date. Separate Global facts from JP facts. Cite links and dates.

My deck optimizer currently scores decks with a simplified career simulation and targets these
stats for the next cups. Challenge them:
- Tokyo 1600m dirt, Soft, Winter (Aquarius Cup): Speed 1450, Stamina 850, Power 1300, Guts 700, Wit 1050
- Nakayama 2000m turf, Firm, Spring (Pisces Cup): Speed 1500, Stamina 1000, Power 1150, Guts 700, Wit 1050

Questions:
a) What stat lines do JP guides from when JP ran these cups recommend, by running style? Since the
   2026 update, stats above 1200 are halved in training and races on Global. Does that change the targets?
b) Which decks (card names, limit break, scenario) do top Global players use for these distances
   and styles? Give the most common 6-card decks and the scenario they train in.
c) How many Speed, Stamina, Power, Guts, Wit and Friend/Group cards? Why?
d) Which cards are "must have" for their skill hints or gold skills for these courses, not their stats?
e) What stamina is "enough" for each style on these two courses (Umalator survival and spurt
   rate), with and without recovery skills, and against stamina debuffers?
Output: per cup and style, a recommended stat line, the top 3 decks with sources, and the hint skills
each deck must supply.
```

## 3. Why I lose: team, style and the field

```
Research how to win Champions Meeting rounds and finals in Umamusume: Pretty Derby (Global).
I'm losing often. My planner builds 3 aces with separate racing decks and ignores team roles.

Questions (separate Global and JP evidence; cite links and dates):
a) Is "3 aces" or "2 aces + 1 debuffer" better on Global now? When does a debuffer pay off, and
   which debuff skills matter (stamina drains, speed debuffs, Intimidate/vision skills)?
b) How do the running styles in the field change which skills fire? E.g. "pass 3 umas" skills
   when there are few Front Runners, or Front Runner duels ("compete for the lead").
c) For a Tokyo 1600 dirt cup and a Nakayama 2000 turf cup, which styles won most in JP's version of
   the cup (published win rates or finals stats)? Which characters?
d) Mood, gate and popularity: do they matter, and what should a simulator assume (Normal vs Great mood)?
e) Does unique skill level matter much, and how does it rise (stars, fan milestones)?
Output: a ranked list of the 10 changes most likely to raise my win rate, each with its evidence.
```

## 4. Parents and sparks: check my numbers

```
Check these Umamusume: Pretty Derby inheritance assumptions against the best available data
(datamines, large-sample community tests, JP wiki/verification posts). Separate Global and JP
evidence, cite links and dates, and say "unknown" where nobody has measured.

What I assume:
1. Per inspiration (2 per career: early April of Classic and Senior), each parent's spark fires at
   base × (1 + that uma's affinity / 100). Base by stars 1/2/3:
   white skill 3/6/9%, green (unique) 5/10/15%, pink 1/3/5%, blue 70/80/90%, race 1/2/3%.
2. Grandparents fire at half the parent rate (only one source says this). Is there a measurement?
3. Spark generation at career end: white 20%, ◎ 25%, gold 40% (also gives the white's spark),
   +2.5% per lineage member with the same white (+5% for gold). Linear, or ×1.1 per copy?
4. Star odds for white/green: 50/45/5 below SS, 20/70/10 at SS+. Blue by stat: <600 90/10/0,
   600-1100 50/45/5, >1100 20/70/10.
5. An inherited white spark gives a hint of +1 to +5 levels. Are the odds by star known?
6. Affinity: +3 per G1 shared by a parent and the other parent/grandparents. Do repeat races count once?
7. Is it better to stack the same white across all 6 family members, or spread different whites?
   Has anyone computed the expected value?
Output: a table of each assumption: confirmed / wrong (with the right number) / unknown, plus a source.
```

## 5. Deck building for CM and LoH, in depth (check the deck optimizer)

The deep version of prompt 2. It lists the deck optimizer's built-in numbers (`optimizer.js`, `engine.js` BUILDS) so each one is confirmed or overturned, and asks for CSV tables the app can load.

```
You are doing a deep, adversarial research job on Umamusume: Pretty Derby support-card DECK BUILDING for
Champions Meeting (CM) and League of Heroes (LoH) aces. Take as long as you need. Use every source you can
reach: GameTora, uma.moe statistics, Umamusume wiki, game8 (EN + JP), gamewith, kamigame, note.com
verification posts, Reddit r/UmaMusume and r/umamusu, Discord write-ups mirrored on the web, YouTube
guides with numbers, datamine repos (e.g. master.mdb dumps), and alpha123/uma-tools source code.

HARD RULES (do not skip):
- Separate GLOBAL (English server) facts from JP facts on every line. Global is behind JP; say which
  JP date a Global cup corresponds to.
- Every number gets a source link and a date. If only one source says it, mark it SINGLE-SOURCE.
- Say "unknown" rather than guess. Do not fill gaps with general advice.
- Prefer measured data (datamines, large samples, simulator runs) over opinion. Say which is which.
- Be adversarial: for each of MY ASSUMPTIONS below, say CONFIRMED, WRONG (give the right value), or
  UNKNOWN, with evidence. I want my errors found, not praise.

CONTEXT: my tool builds a 6-card deck (5 owned + optionally 1 borrowed) for a named ace, cup and running
style. It simulates ~16 careers per deck in the chosen scenario (cards dealt to trainings each turn,
the trainee takes the most valuable training, real card effects at their limit break, game training
formula), then scores the deck by its final stats plus the skills it can afford, and searches decks with
greedy-add then one-for-one swaps. I want it to pick the deck that most raises the ace's chance to WIN
that CM / place well in LoH.

MY ASSUMPTIONS (attack each one):
A1. Stat targets per distance (used when the user gives none):
    Sprint  Spd 1600 Sta 600  Pow 1200 Gut 600 Wit 1100
    Mile    Spd 1600 Sta 800  Pow 1200 Gut 600 Wit 1100
    Medium  Spd 1600 Sta 1000 Pow 1200 Gut 600 Wit 1000
    Long    Spd 1500 Sta 1300 Pow 1100 Gut 700 Wit 1000
    Dirt    Spd 1500 Sta 800  Pow 1400 Gut 600 Wit 1000
    Stamina is lowered to (race-simulator stamina for a full last spurt, no skills, Normal mood) + 100.
A2. Since the 2026 update on Global, stat gains past 1200 are halved in training (and stats past 1200
    count half in races). Is that exactly right on Global, and from what date? What does it do to targets?
A3. Racing decks are scored in lengths: each stat's value measured across its range in alpha123's
    Umalator (one runner vs a copy of herself, no skills, Normal mood, one stat changed at a time, the
    five summed), plus the skills each simulated career's SP can buy. Example it produced: on Tokyo
    1600m dirt (Pace Chaser), power 1200->1300 = +0.36 L but 1300->1350 = +0.9 L; +100 speed past 1200
    ~ +0.23 L. Is there a real game mechanic behind a power step like that (dirt, position keep, lane
    or lead competition)? Does a single-runner sim over- or under-value any stat vs a 9-runner field?
    Any published lengths per +100 of each stat by distance/style to compare against?
A4. Guts matters little except in stamina-showdown races (CM 27+ equivalents, LoH). How much does guts
    matter in showdown, per 100 guts, by distance?
A5. Card dealing: each card appears at one training per turn, weighted by specialty priority, with
    "absent from all trainings" weighted 50 (vs a card's own training 100+specialty priority, others ~?).
    What is the real appearance formula (datamined)? Give the formula and source.
A6. Hint chance: 7.5% per card per training it is on, times (1 + Hint Frequency%). Hint levels from
    Hint Levels effect. Real values?
A7. Hint discount by hint level 1–5: 10/20/30/35/40%. Fast Learner -10% of base cost. Confirm.
A8. Optional races: 10% of turns (Trackblazer 35%, Grand Concert 0), each giving ~8 stats and 40 SP,
    scaled by the deck's Race Bonus. Real per-grade rewards on Global?
A9. Random (non-card) events give ~120 stat points over a career regardless of deck.
A10. Racing decks for aces run at most 1 Friend and 1 Group card; parent decks may take 2.
A11. Value conversion: 1 length of race gain ≈ 60 value points; 1 SP ≈ 0.35. An average skill buys
     about 0.5 lengths per 100 SP. Is there data on lengths per SP for typical skills vs lengths per stat?

QUESTIONS:
Q1. Scenario: which training scenarios are on Global right now (and next 6 months by JP timeline)?
    Which one do top Global players use for CM aces, per distance? Typical final stat lines and SP in
    each (medians from uma.moe or similar, not best-case screenshots).
Q2. Upcoming cups: list the next 8 Global CM and LoH events with course, distance, surface, direction,
    season, weather/ground, and the JP date of the same cup. For each, from JP's run of that cup: the
    winning running styles (published finals stats/win rates), the top 10 used characters, and the
    recommended stat lines by style.
Q3. Decks in use: for each upcoming cup (or at least each distance class), the most common 6-card decks
    among top Global players, with card names, LB, scenario. Card USAGE RATES from uma.moe or any
    statistic you find. Then the JP equivalents at the same point in JP's timeline.
Q4. Deck shape: how many Speed/Stamina/Power/Guts/Wit/Friend/Group cards per distance and scenario,
    and why. When is a Wit card or a 2nd Power card better than a 3rd Speed card?
Q5. Card value beyond stats: which cards are taken for their HINT skills or EVENT gold skills on each
    upcoming course (e.g. key accel/speed golds, recovery golds)? List skill -> cards that give it
    (hint or event), Global availability date.
Q6. Card effects ranking: which card effects matter most for an ace deck, with any quantitative
    model (Friendship Bonus, Training Effectiveness, Specialty Priority, Mood Effect, Race Bonus,
    Initial Bond, Hint Frequency/Levels, Stat Bonus, Energy Cost Reduction, Failure Protection).
    Link any community calculators/tier lists that rank by simulation (Euophrys, GameTora tier list,
    uma.moe) and explain their method and known weaknesses.
Q7. LB value: how much does LB3 vs LB4 (MLB) of a key SSR matter in final stats? Is a borrowed MLB
    card better than an owned LB2-3 copy? Any measured numbers.
Q8. Calibration data: any published average final stats/SP for a SPECIFIC deck+trainee+scenario over
    many runs (so I can check my simulator). Give the deck, the sample size, and the numbers.
Q9. Stamina: per upcoming cup and style, what stamina (with N recovery skills) is "enough", and how
    much do opponents' stamina debuffs change it?
Q10. LoH vs CM: what changes in deck/stat priorities for LoH (12-runner field? points by placing?
     showdown?) vs CM.

OUTPUT FORMAT (exactly this, so I can parse it):
1. ASSUMPTIONS table: id | verdict (CONFIRMED/WRONG/UNKNOWN) | correct value | Global/JP | source link | date | single-source?
2. CUPS CSV: cup_name,global_date,jp_date,track,distance_m,surface,direction,season,ground,weather,top_styles_jp,source
3. STAT_TARGETS CSV: cup_or_distance,style,speed,stamina,power,guts,wit,recovery_skills_assumed,server,source
4. DECKS CSV: cup_or_distance,style,scenario,card1(LB),...,card6(LB),usage_or_rank,server,date,source
5. CARD_USAGE CSV (if any statistic exists): card_name,rarity,type,usage_pct,population,server,date,source
6. SKILL_SOURCES CSV: skill_name,needed_for_cups,card_name,via(hint/event),global_available_date,source
7. CALIBRATION CSV: scenario,trainee,deck,runs,mean_speed,mean_stamina,mean_power,mean_guts,mean_wit,mean_sp,source
8. FORMULAS: datamined formulas (card appearance, hint chance, training gain, race rewards) as text with links.
9. A ranked list of the 10 changes most likely to make my deck optimizer pick decks that WIN more, each
   tied to evidence above.
10. A list of what is UNKNOWN and how someone could measure it.
```

## What to paste back

Paste the full answers, sources included. Claude will:
- check each claim against GameTora and Umalator data and the app's own simulation;
- note any claim from only one source, or JP-only;
- change the app only where the evidence holds.
