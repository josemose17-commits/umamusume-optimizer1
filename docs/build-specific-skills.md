# Build-specific skill comparisons

The racing deck's **Skills for this build** uses alpha123's pinned Global Umalator worker,
loaded locally in a Web Worker. The app still has no build step or external runtime API.
Source revision, worker hash and GPL v3 license are in `vendor/umalator/`.

## Inputs and purchases

The runner uses the selected course, weather, ground, style, aptitudes, unique level and
normal mood. Her own unique is equipped automatically. Entered stats override predicted
stats. Finished-uma mode requires all five stats and the SP remaining after equipped purchases.
Only explicitly added available skills can be bought in finished mode.

Planning uses a complete sampled career's hint levels and SP when the training simulator
provides them. Otherwise it makes one deterministic sample of the deck's estimated offer
probabilities and assumes Lv1 hints; this fallback is labeled. Trainee innate/awakening
skills are available in planning. User-added skills supplement those offers; this does not
verify that a support, parent or scenario will provide them. Equipped purchases consume
projected SP before other purchases. Inheritance stats are excluded unless entered.

`skill-budget.js` supplies legal purchase options: prerequisite chains, actual hint discounts,
one final tier per skill family and only incremental upgrade costs for learned lower tiers.
Fast Learner and scenario-specific price discounts are not modeled. No guessed costs are substituted. Missing race/purchase data and unsupported skill conditions are listed. Skills with zero
standalone chart value may still be tested as part of a pair.

## Search and interpretation

The additive purchase solution and the empty set provide starting points. Small pairs,
additions, removals and exchanges are compared as complete equipped sets, within the SP
budget. The UI search checks at most 64 distinct sets with 24 races each (seed 271828).
Finalists, including the additive starting solution, are rechecked with 96 races and a separate
seed (314159). Sample noise and the bounded search can miss a better set.

Individual next-skill rows compare the equipped baseline against that baseline plus one
purchase. Purchase-list contributions compare the chosen complete set against itself with
that purchase removed. Upgrades restore the previously equipped tier. These contributions
need not add to total set gain. L/SP uses the additional purchase cost, not the full cost of
a lower tier already learned. Mean, median, 10th percentile and range describe sampled gains.
Full-spurt frequency is taken from the candidate runner's Umalator validation runs.

After career refinement, the final deck and its initial deck are eligible for this comparison.
The sampled set's joint race gain replaces the additive skill component for that final
shortlist, retaining the career score and rating-goal constraint. This is a limited deck
comparison, not a joint exhaustive search of every deck, every career and every skill set.
Parent searches retain their existing spark/rating objective.

## Model limits

Wit activation rolls, position keep and spot struggle are on. The engine does not model the
complete opposing field: position, overtaking, blocking and dependency conditions remain
simplified. The UI marks condition-dependent skills. Nine-runner CM and twelve-runner LoH
use assumed style position ranges; LoH weather/ground are held at the displayed preset.
Neither CM win probability nor expected LoH points can be inferred from these length gains.
Practice races remain necessary to validate the whole build.

The pinned Global worker is used only for a course it knows and a compatible rules version.
Cups requiring stamina showdown or changed Global skills are rejected rather than silently
using earlier physics. A skill absent from this worker is excluded and named; an equipped
skill with missing data stops the comparison. Existing per-cup charts remain available.

## Verification

`test/race-skills.test.js` covers set synergy, real hint costs and upgrades, equipped
baselines, held-out validation, format inputs and version guards. A VM test runs the actual
pinned worker, checking nonzero skill gain and a zero identical-build comparison.
Browser checks exercise finished inputs, equipping a lower tier, automatic recalculation,
saved settings, automatic deck predictions, future version guards and the 390px layout.
