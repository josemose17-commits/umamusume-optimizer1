# uma.moe rental search

Verified against uma.moe's published frontend and database page on 2026-11-05 (build 2.2.26). Source: <https://uma.moe/database>. The page's `inheritance-factors-ByZrkMk4.js` codec, `profile-display-DI-RfDTF.js` query mapping and `DatabasePage-CB9YnEn1.js` controls were inspected. These filenames can change after a site update.

`cm-plan.js` builds the search; `cm-tab.js` shows the same values under **Full uma.moe settings**. The link's `filters` parameter is URI-encoded base64 JSON, not a query for our app. Opening it restores Advanced mode and replaces the site's saved filters.

| Compact field | Meaning | Planner choice |
| --- | --- | --- |
| `t[0]` | Affinity target, trainee version ID | The ace |
| `p2c`, `p2w` | Other parent's version and won G1 saddles | Parent 1 and her actual or rank-capped planned wins |
| `emp` | Excluded main-parent character IDs | The ace and Parent 1, all versions |
| `mb` | Direct parent's blue requirements | Key-stat 3★, joined with OR |
| `bss` | Total blue stars in the rental branch | 9; 6 in More choices |
| `p` | Combined pink requirement | Focused aptitude, minimum to 9★ |
| `mp` | Direct parent's pink requirement | Focused aptitude 3★; absent in More choices |
| `w` | Required white families | Each checked family, 1–9★, joined with AND |
| `ow` | Preferred whites and priority groups | Up to 12 relevant missing families: first 3 P0, next 4 P1, rest P2 |
| `omw` | Preferred whites on the direct parent | P0 families, also preferred here |
| `mg` | Direct parent's unique factor | Set only by a unique focus link, with its legal released versions joined by OR |

An ordinary requirement is `[factorId, minStars, maxStars]`; a fourth value of `1` joins that row to the previous row with OR. Combined requirements allow 1–9★; direct-parent requirements allow 1–3★. A preferred entry is a factor ID for P0, or `[factorId, priorityGroup]`. **P0 sorts first**, then P1, then P2; larger numbers have lower priority. Preferred matches precede the selected affinity sort. They are not required matches.

White factors use the skill family's ID multiplied by 10, so a gold and its white prerequisite map to one factor. Unique factors use the owner's trainee version ID multiplied by 10. Blue IDs are 10/20/30/40/50. Pink IDs in aptitude order are 110/120/310/320/330/340/210/220/230/240.

Pink focus first addresses a missing race aptitude; otherwise it defaults to the race's distance. More stars asks for that pink on the rental herself at 3★ and at least `max(3, 6 - knownStarsOnParent1Branch)` stars across the rental branch. More choices allows 1–9★ anywhere in the branch. This is a search preference, not a guaranteed aptitude upgrade. The user can select another focus or Any pink.

Character includes, grandparent filters, support-card/LB filters, trainer fields, scenario, win/white counts, other star totals, white category counts, lineage whites and the hard race calendar remain open. Their reasons and shared wins worth checking are shown in the table. The site's default excludes trainers at 1,000 followers. Parent 1's saddle list is affinity context, not a requirement that the rental won every listed race.

**Rental rank is unrestricted.** No `pr` filter or rating bonus is added: compare the factors the rental already has. SS takes priority over extra affinity races when training the user's own parent; the existing SS race cap remains in force. These are separate decisions.

Tests cover the compact values, scope, OR/AND rules, priority direction, exclusions, duplicate skill families, relaxed filters and absence of a rental-rank requirement. Local Playwright checks the settings, generated URLs, persistence, phone layout and console. Live uma.moe search results could not be validated because its browser verification timed out; no result counts or trainer availability are assumed.
