# Build-specific skill comparisons

The racing deck's **Skills for this build** and the **Skill optimizer** tab use alpha123's pinned Global Umalator worker,
loaded locally in a Web Worker. JP-dated cups (CM 22 on, League of Heroes) use the pinned JP worker with that cup's
skill versions and stamina showdown rules (`race-variants.js`, `data/race-variants/`). The app still has no build step or external runtime API.
Source revision, worker hash and GPL v3 license are in `vendor/umalator/`.

## Inputs and purchases

The runner uses the selected course, weather, ground, style, aptitudes, unique level and
mood (Normal by default; Good or Great can be picked; earlier versions ran every race at Great). Her own unique is equipped automatically. Entered stats override predicted
stats. Finished-uma mode requires all five stats and the SP remaining after equipped purchases.
Only explicitly added available skills can be bought in finished mode.

Planning uses a complete sampled career's hint levels and SP when the training simulator
provides them. Otherwise it makes one deterministic sample of the deck's estimated offer
probabilities and assumes Lv1 hints; this fallback is labeled. `skill-access.js` checks each
source: innate skills, assumed-unlocked awakenings, each eligible support card and the six
entered family slots. Unowned preview cards and untrained parents are labeled conditional.
Typing a planning target never creates a source. A typed equipped target conditions on
getting it from a verified route and consumes projected SP first. A finished uma's entered
shop/equipped skills are treated as observed. Inheritance stats are excluded unless entered.

Family white hints are sampled at each member's existing affinity-based inspiration chance;
unknown hint levels conservatively use Lv1. Direct parents' inherited uniques are available
at the start; grandparent uniques use the existing inspiration estimate. Great-grandparents
are ignored. A white spark cannot unlock gold. A gold source unlocks its prerequisite but
does not give the white a hint discount. Related routes from one card share an access roll,
so aliases do not create independent extra chances.

`skill-budget.js` supplies legal purchase options: prerequisite chains, actual hint discounts,
one final tier per skill family and only incremental upgrade costs for learned lower tiers.
Fast Learner is priced in the Skill optimizer tab (10% of the base cost, added to the hint discount); this deck flow doesn't ask for it. Scenario-specific price discounts are not modeled. No guessed costs are substituted. Missing race/purchase data and unsupported skill conditions are listed. Skills with zero
standalone chart value may still be tested as part of a pair.

## Search and interpretation

When every *full* affordable set (one tier per skill family, nothing else still fits the SP; skills that clearly lose lengths alone left out) numbers 200 or fewer, all of them are raced (24 races each) instead of searched; purchases that add nothing are removed by the pruning step below. Otherwise the search below runs. The additive purchase solution, the empty set and greedy fills by each skill's own simulated gain (per SP and outright) provide starting points; moves include two-for-two exchanges (two purchases out, the SP refilled greedily). Small pairs,
additions, removals and exchanges are compared as complete equipped sets, within the SP
budget. The UI search checks at most 64 distinct sets with 24 races each (seed 271828).
Finalists, including the additive starting solution, are rechecked with 96 races and a separate
seed (314159). Sample noise and the bounded search can miss a better set.

The best finalist then plays the runner-up (the next finalist meeting the same must-haves) head to
head: 240 paired races on a fresh seed (161803), best set against runner-up set directly. If the
difference is within its 95% interval, no clear difference is reported (not equivalence) and the set that spends less SP is kept. If the runner-up wins clearly,
they swap. Each purchase in the winner is then raced against the set without it (240 paired races, seed 141421); while one doesn't clearly add lengths (mean within its 95% interval), the weakest is dropped and its SP kept. The gain reported for the final set comes from another 96 races on a seed no step of
the search used (577215).

Individual next-skill rows compare the equipped baseline against that baseline plus one
purchase. Purchase-list contributions compare the chosen complete set against itself with
that purchase removed. Upgrades restore the previously equipped tier. These contributions
need not add to total set gain. L/SP uses the additional purchase cost, not the full cost of
a lower tier already learned. Mean, median, 10th percentile and range describe sampled gains. The chosen set also reports the SD of its paired per-race differences and a 95% interval for its mean (normal approximation): sampling noise only, not the simplified field. Picking the best of many sets still favors lucky ones; a difference within that interval is no clear difference, not proof of equivalence. A full-spurt rate under 95% for the chosen set is flagged.
Full-spurt frequency is taken from the candidate runner's Umalator validation runs.

After career refinement, the final deck and its initial deck are eligible for this comparison.
The sampled set's joint race gain replaces the additive skill component for that final
shortlist, retaining the career score and rating-goal constraint. This is a limited deck
comparison, not a joint exhaustive search of every deck, every career and every skill set.

## Parent and deck feedback

A separate conditional purchase search adds at most twelve relevant base-white hints plus
explicitly entered white targets. It supplies priorities to parent ranking and both rental
searches; those hypothetical routes never enter the actual purchase list. Existing deck
coverage reduces a spark's value to its hint discount. Duplicate family routes combine
their access chances rather than granting the skill twice.

Find Parent 1 checks up to four fresh versions (plus the manually selected version), builds
each one's training deck and samples sixteen legal skill shops against her predicted careers.
It seeks SS first, then useful white-spark value within SP, with a bounded two-pass purchase
exchange search. Inherited hints and trainee skills count as routes too. The chosen parent's
race cap and Training Focus use these budgeted ratings. Below 75% SS careers, fresh-parent
spark credit is withheld and the UI warns. This is not a rank filter on existing rentals.

Learning probability is the share of sampled shops that buy the skill. Spark generation
uses the existing white/upgrade/gold rates and lineage-copy bonus; inheritance then applies
the existing star/affinity estimate. These are forecasts, not guaranteed sparks. Independent
Training lists only sourced, budgeted targets once this plan exists. The ace's purchases
are rechecked with the selected family in two planning passes. If targets shift on the final
check, the UI says so; this is not a convergence guarantee or an exhaustive joint optimum.

## Model limits

Wit activation rolls, position keep and spot struggle are on. The engine does not model the
complete opposing field: position, overtaking, blocking and dependency conditions remain
simplified. The UI marks condition-dependent skills. Nine-runner CM and twelve-runner LoH
use assumed style position ranges; LoH weather/ground are held at the displayed preset.
Neither CM win probability nor expected LoH points can be inferred from these length gains.
Practice races remain necessary to validate the whole build.

The pinned Global worker is used only for a course it knows and a compatible rules version.
Cups requiring stamina showdown or changed Global skills use an explicit course-chart
fallback. It keeps source checks and SP legality but measures no new interactions or
full-spurt frequency. For supported versions, a skill absent from the worker is excluded
and named; an equipped skill with missing data stops the comparison.

## Verification

`test/race-skills.test.js` covers set synergy, real hint costs and upgrades, equipped
baselines, held-out validation, format inputs and version guards. A VM test runs the actual
pinned worker, checking nonzero skill gain and a zero identical-build comparison.
Browser checks exercise finished inputs, equipping a lower tier, automatic recalculation,
saved settings, automatic deck predictions, future version guards and the 390px layout.
`test/skill-access.test.js`, `test/cm-plan.test.js` and `test/family.test.js` cover typed
wishes without sources, gold/white routes, six-slot inheritance, affordable SS purchases,
purchase-driven parent ranking and decoded rental links, and duplicate access.

## Brute-force checks (Nov 11, 2026)

The lengths search was checked against racing every affordable combination of a real shop on
192 fresh races each (`optimize` on the pinned workers, then all combinations of the charted skills):

| Cup, style, SP | Simulator | Combinations | Optimizer's pick |
|---|---|---:|---|
| League of Heroes 1, Pace, 1500 | JP-dated (long-race showdown) | 144 | #1 |
| CM 22, Late, 800 | JP-dated | 108 | #1 |
| CM 21, Pace, 700 | Global | 108 | #1 |

Before the full-set mode and pruning, the first check's pick was tied with #1 but spent 323 SP on a
skill that added nothing; those changes came from it.
