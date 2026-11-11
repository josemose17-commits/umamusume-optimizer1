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

## What to paste back

Paste the full answers, sources included. Claude will:
- check each claim against GameTora and Umalator data and the app's own simulation;
- note any claim from only one source, or JP-only;
- change the app only where the evidence holds.
