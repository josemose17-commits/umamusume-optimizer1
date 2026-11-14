# Race mechanics notes

What the app takes from KuromiAK's **Uma Musume Race Mechanics** document (reverse engineering by
@umamusu_reveng, @kak_eng and @hoffe_33; race simulators by Aya, kakku and Tunnelblick), and where
the race simulators the app runs (alpha123's Umalator, Global and JP builds, in `vendor/`) agree,
simplify or differ. The document says itself that mechanics added after the 1st anniversary are
partly inferred, and some differ by server.

## Used directly (`mechanics.js`)

| Mechanic | Document | Where the app uses it |
| --- | --- | --- |
| Stats past 1200 | Raw stats past 1200 are halved before motivation | Everything; the simulators do the same |
| Skill activation (Wit check) | max(100 − 9000 / base Wit, 20)%, base Wit = halved raw Wit × motivation; style aptitude and skills don't change it | Skill values rescaled to her Wit (the chart was run at the cup's Wit) |
| Rushed | (6.5 / log10(0.1 × base Wit + 1))², rounded up to a whole %; Self-Control −3 points | Her Rushed chance under the build |
| Ground modifier, power | Turf: 0 on Firm, −50 otherwise. Dirt: −50 on Good, −100 otherwise | The power line |
| Conserve Power / Release | Above 1200 power she builds up power in the first 10 sections (less in Speed Up, Pace Up, Overtake, spot struggle or Rushed) and releases it as acceleration √((power − 1200) × 130) × 0.001 × a style-distance factor when the last spurt starts | The power line in **Her gaps** |

## The power line: not settled

On every cup measured (`data/stat-curves.js`), power gains a large step just past a line: on turf
Firm 1200 → 1250, turf Good or Heavy 1250 → 1300, dirt 1300 → 1350. That is the Umalator's
Conserve Power, which it approximates as a skill: it fires at the start of the late race when
`rawPower > 1200`, with a fixed duration (3 s × 1000 / course length), where `rawPower` is shown
power × motivation **plus the ground modifier**. So on a dirt cup the simulator's line is 1300.

The document's formula is base power + 0.5 × (raw power − 1200) + skills, which is also shown power
past 1200 one for one, but **without the ground modifier**: 1200 on every course. If the document is
right, the simulator, the stat curves and the deck scoring ask for up to 100 more power than needed
on dirt and 50 more on non-Firm turf. The simulator also skips the build-up (conserved power per
second 4.2 in normal position keep, 6.7 in Pace Down, × 1.0 / 0.75 / 1.0 / 0.7 by style), so the
release's length doesn't depend on how her early race went.

The app shows both lines and keeps the simulator's for scoring. Practice races on a dirt cup at
1250 vs 1320 power would settle it; it's also in the research prompts.

## In the simulators already

Target speed, last spurt speed and HP use (speed only counts from the late race on; guts adds to
the last spurt and lowers HP use there), acceleration (√(500 × power)), start dash and late starts,
position keep (Speed Up, Overtake, Pace Up, Pace Down, Pace Up Ex), spot struggle, the course stat
thresholds, slopes, skill durations scaled by course length, and (JP-dated cups from CM 27) the
stamina showdown. The Global Umalator races one runner against a virtual pacer: lanes, blocking,
vision, dueling and anything that needs another runner are simplified. GlobalSim (the Skill
optimizer's win mode) races a full field.

## Stat values on stamina-showdown cups

`data/stat-curves.js` measures CM 27 on and every League of Heroes on the cup's JP-dated simulator
(`race-worker.js` with its variant). There stamina past a full spurt still gains lengths on
courses over 2100 m, so stamina's curve runs to 2000 instead of stopping at her full-spurt
stamina, which is measured on the same simulator. Summed curves matched whole stat lines within
0.14 L on League of Heroes 1 (Pace Chaser) and CM 28 (Late Surger), and within 0.07 L on CM 29.

## Conditions that need the field

These are why a skill's simulated gain can be off (tags in the skill tables):
- `near_count`: within 3 m and 3 horse lanes.
- `is_surrounded`: someone outside (within 1.5 m), ahead (0 to 3 m) and behind.
- `behind_near_lane_time` / `infront_near_lane_time`: within 2.5 m and 1 lane of the runner one
  place ahead or behind, for a time.
- Blocked in front: 0 to 2 m ahead, within 0.3 to 0.75 lanes; blocked on a side: within 1.05 m and
  2 lanes.
- `order_rate`: rounded to a place (order_rate > 50 in 9 runners means 6th or lower).

## JP only for now

Added on JP's 5th anniversary: stat caps removed, Zenkai Spurt (Speed over 2000), and the Wit limit
break buff (Wit over 1200 adds up to about 12% to gold, unique and evolved speed skills by style and
phase). None of the cups the app simulates use them yet.
