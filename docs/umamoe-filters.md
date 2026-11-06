# uma.moe rental searches

Checked against uma.moe's published frontend on 2026-11-06: <https://uma.moe/database>. The `/app/inheritance-factors-ByZrkMk4.js` codec, `profile-display-DI-RfDTF.js` query mapping and `DatabasePage-CB9YnEn1.js` sorting were inspected. Filenames can change after an update. Generated links were also decoded with that published codec, independently of the app's tests.

`cm-plan.js` builds both searches. `cm-tab.js` shows every active filter in a plain summary and keeps separate settings for each search. The `filters` parameter is URI-encoded base64 JSON. Opening it restores Advanced mode and replaces saved filters.

| Field | Ace's Parent 2 | Grandparent (borrowed parent for X) |
| --- | --- | --- |
| `t[0]` | Ace's trainee version | X's trainee version |
| `p2c` | Parent 1's version | Selected veteran V's version |
| `p2w` | Parent 1's actual or rank-capped planned G1 saddles | V's G1 saddles |
| `emp` | Ace and Parent 1 character IDs | X and V character IDs |
| `mb` | Chosen stat, own 3★ | Same |
| `b` | Same stat, lineage 7–9★ | Absent: only her own sparks reach the ace |
| `p` | The ace's pink by the rule, lineage 3–9★ | Absent |
| `mp` | Absent | The ace's pink by the rule, on her, 2–3★ (Wider 1–3★) |
| `w` | Every ticked white family (any number), 1–9★ each, AND | Absent |
| `mw` | Absent | Every ticked white family on her (any number), 1–3★ each, AND |
| `ow` | Default: the listed whites, P0/P1/P2; absent with "affinity only" | Absent |
| `omw` | Default: the P0 whites on the rental herself; absent with "affinity only" | Default: the listed whites on her, P0/P1/P2; absent with "affinity only" |
| `mg` | Only a unique-focus link requires a specific own unique, 1–3★ | Same |

**One blue stat.** Auto picks the ace's highest-weight key stat, usually Speed; all five stats are selectable. Wider changes `mb` to 2–3★ and `b` to 6–9★, keeping the same stat. There is no `bss` total-any-stat requirement: a Speed/Wit/Guts branch cannot meet the default Speed lineage filter.

**Pink is optional.** It starts off. Selecting a pink asks for 3–9★ across the branch, with no requirement on the rental herself. It does not guarantee an aptitude upgrade.

**Sort.** Affinity first lists whites to look for without `ow` or `omw`. The site's automatic sort is Affinity when these target/factor filters are present. Whites first uses up to 12 missing race-white families: first three P0, next four P1, rest P2. uma.moe sorts those groups before affinity. Required families are removed from preferred groups. A focus link adds its own unique requirement and shows its complete summary too.

**Codec.** A requirement is `[factorId, minStars, maxStars]`; a fourth value of `1` joins a row to the previous row with OR. Direct-parent maxima are 3★; lineage maxima are 9★. A preferred entry is a factor ID for P0, or `[factorId, priorityGroup]`. White factors use the purchase family's ID × 10, so gold and white versions deduplicate. Unique factors use the owner's trainee version ID × 10. Blue IDs are 10/20/30/40/50. Pink IDs in aptitude order are 110/120/310/320/330/340/210/220/230/240.

**Open filters.** Rental rank, character includes, grandparent includes/excludes, support/LB, trainer name/ID, scenario, win/white counts, other star totals, white categories and the hard race calendar stay open. The site's default allows trainers below 1,000 followers. Legacy saddles affect affinity; they do not require that the rental won all those races. The summary names the target, legacy and G1 count, blues, pink, whites and priorities, excluded characters, sort, unrestricted rank and follower default.

## One veteran + one rental

This is the fresh-parent default; two veterans remain an option. For each X, the planner chooses V using the ace's family value, X's training hints and blue stats, and shared G1s. You can choose another V and paste rentals for R.

A rental row adds two contributions, using `family.js` and each member's own affinity:

- **For the ace:** R occupies `g12`. Only R's own white/green/blue/pink sparks count. R's parents are great-grandparents and do not appear here.
- **For X:** V and R are parents, with both of their lineages as X's four grandparents. R's branch contributes relevant white hints (including hint discounts when X's deck offers a skill) and blue start stats. All stats help rating; the search focuses on the chosen stat for X's targets and her own 3★ blue chance at 1,100+. This is a score estimate, not an SS guarantee.

The two values use the existing length/stat scale (60 stat points per score unit) and sum to the displayed total. Known blue start bonuses enter the fresh-parent simulation before training; later inspiration gains remain omitted. R's shared G1 wins take precedence among equally shared races, then the SS/S reliability cap cuts extras. Ace affinity and the Parent 2 link use only retained races. Reference veterans already include their own inheritance, so their ratings are not given these bonuses again.

Rental paste does not identify the exact grandparent split of remaining stars: `rentals.js` estimates it, and only known own race sparks identify R's wins. The UI states both limits. A rental's rating adds no score or minimum. SS/S applies to training X.

## Validation

`test/cm-plan.test.js` decodes every search, width, sort mode and unique-focus link, checking all compact fields, optional/required whites, exclusions and absence of hidden rank/pink/any-stat-total filters. It also checks the two contributions, generation boundary, known blue start bonuses and rank-capped G1 affinity. Browser QA uses synthetic imports and rentals, checks selections and reloads, console errors and 390px overflow. Playwright could not load the generated live link in this sandbox (`net::ERR_EMPTY_RESPONSE`). Live result counts and active chips therefore remain unverified; no result count is assumed.
