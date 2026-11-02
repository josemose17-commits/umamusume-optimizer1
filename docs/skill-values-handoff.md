# Handoff: skill values by cup date (prompt for the next assistant)

Copy everything below the line into the next assistant (GPT or another Claude) as its prompt. It is
written so it can finish the work with no access to the previous session.

---

You are continuing a half-finished change in the GitHub repository
`josemose17-commits/umamusume-optimizer1` ("Uma Turn Coach", a static browser app for *Umamusume:
Pretty Derby*: open `index.html`, no build step). Work on the branch
`claude/funny-brahmagupta-a7v8n2`. **Never push to `main`**: `.github/workflows/auto-merge.yml`
merges the branch into `main` by itself when `node --test test/*.test.js` passes, so run the tests
before every push. Read `CLAUDE.md` first: for any *new* request it wants a plan and the user's
go-ahead before code changes; this task is already approved ("cm22 to the latest, JP only, do
everything you can to be as accurate as possible"), so just finish it.

Write for the user in plain words (they read the app, not the code). Commit messages end with
the attribution lines the session asks for, if any.

## 1. What the user asked, and what was wrong

The user said the skill rankings looked off. The **CM & decks** tab ranks every skill for a Champions
Meeting (CM) or League of Heroes (LoH) cup by its median length gain (L) from alpha123's Umalator
skill chart (`data/skillvalues/<cup>.json`, one list per running style: Nige = Front, Senkou = Pace,
Sasi = Late, Oikomi = End). They asked that the values be right for every cup from now on, using
the skills each cup will actually have on Global at its date, with the Global and JP Umalators.

What was wrong (all confirmed):

1. **Cups Global hasn't run yet (cm22 to cm49 and LoH 1 to 5) were all simulated with the JP
   Umalator's *current* game**, so JP balance patches made long after each cup's slot leaked in.
   Example: Shooting for Victory! (inherited) on cm22 Pace: 0.93 L with JP's current 3.0 s
   version, 0.00 L with the 2.4 s version Global has. 42 skills differ between Global and JP now.
2. **"On Global only" ignored the cup's date**: it showed only skills on Global *today* for every
   cup, and unticked it showed every JP skill, including ones that won't exist by that cup.
3. The Global dates of future cups used a fixed 3-week pace. JP's cups went from monthly to every
   two months in 2023, so later cups were placed up to a year too early.
4. JP's newest cup, cm50 (Kyoto 2200, JP 2026-10-20), was missing.
5. Skills whose condition depends on the pack half (`data/skill-positions.js`) were classified from
   Global's data only, so JP-only skills weren't classified and JP's later condition changes
   weren't reflected.

## 2. The model (decisions already made, keep them)

Global runs JP's calendar in order (cups, cards, scenarios, balance patches). So a cup on Global
gets **JP's game as it was on that cup's JP date** (`preset.jp.start`):

- **Skill versions**: each skill at the version JP had on the cup's JP date, **but never older than
  what Global already has now** (Global has brought JP's patches early: Beeline Burst 0.9 s → 2.4 s
  in Global's Dec 2025 update and → 3.0 s on 2026-07-01, i.e. JP's 2nd-anniversary changes).
  Result: cm22–cm26 run every Global skill exactly as Global has it now.
- **JP patch dates** (data commit → real JP patch, checked against patch notes):
  - 2023-04-26 → 2023-02-24 (2nd anniversary: Beeline Burst/Straightaway Adept longer, Fast &
    Furious order ≥ 40, Sturm und Drang …)
  - 2023-10-27 → 2023-08-24 (2.5th: "final corner exit" → `is_last_straight` on many skills,
    Shooting for Victory! 3.0 s)
  - 2024-03-06 → 2024-02-24 (3rd: Breakin' Ahead order ≥ 75 → ≥ 50, YUMMY☆SPEED, KEEP IT REAL …)
  - 2026-02-24 (5th: Taking the Lead, Swinging Maestro, Nothing Ventured, Sharp Turns …)
  - 2026-04-12, 2026-06-19 (single uniques: Special Week, Tokai Teio)
  - 2026-08-13 build → 2026-07-30 (Silence Suzuka's unique; date from the official X post id)
  - 2026-09-13 build → 2026-08-24 (5.5th: order conditions ≥ 50 → ≥ 40 on 18+ skills)
  - Format-only changes are ignored: target null→1 (2025-07), CurrentSpeed type 22 split from 27
    (2023-04), scenario-skill scaling (2023-10/11), Seirios split/merge (2024-12, 2025-12),
    `durationScaling`/`scaling` fields added (2026-03-12).
- **Mechanics**: leg conservation (asitame) and spot struggle stay on for every cup (Global has
  them). **Stamina showdown** (JP 2023-08-24) is on from cm27, off for cm22–cm26. JP made it
  stronger in long races on 2024-10-29 (distance factor 1.2 → 1.5 for 2401–2600 m, 1.5 → 1.8
  beyond; 2200–2400 m unchanged; player-measured: note.com/shimahokke_uma, note.com/200000is). The
  Umalator still has the original factors, so cups ≥ 2401 m with a JP date ≥ 2024-10-29 (cm34,
  cm37, LoH 1, cm43, cm47) run a patched simulator ("longsyoubu" variants). Stamina showdown only
  fires above 1200 stamina; the preset stat lines give 1250 only to Long cups.
- **Tracks**: JP's current track data for every cup (it equals Global's for every track Global has;
  it has the newer Hanshin 2400 (cm35) and Longchamp (cm27, cm49) and Del Mar (cm44, cm45)).
- **Which skills a cup can use** (`skill-release.js`): for a cup Global hasn't started yet, a skill
  counts when it's on Global now, or when JP released it on or before the cup's JP date. The JP
  release date is field 5 of each `data/skillvalues/index.js` skill row: the earliest JP release
  of a card or trainee that gives it (GameTora); inherited uniques use the trainee; a ◎/× uses
  its ○; scenario-only skills use their scenario's JP release; and never before the first JP data
  snapshot that had the skill when that's > 180 days after its source (skills added to old
  trainees later, e.g. awakening levels JP added in 2026: Twinkling Star → 2026-04-12).
  Cups Global has run or is running keep "on Global now".
- **Sampling noise** is small (median |Δ| 0.002–0.004 L between independent runs; p90 ≤ 0.014 L),
  so one run of the Umalator's standard chart (up to 200 races per skill, seed 20261006) is enough.

## 3. What is already done (commit 7afb14b on the branch, pushed)

Code and tools (all committed):

- `tools/build_skill_versions.js` (new): reads the history of alpha123's repos (uma-skill-tools
  `data/skill_data.json` commits before 2025-08-23, uma-tools `umalator/simulator.worker.js`
  builds after), dates each skill change, assigns each cup its versions, and writes one simulator
  directory per group of cups ("variant") plus `variants.json` (`presets`: cup → variant;
  `variants[name]`: `{ syoubu, syoubuLong, cups, changed, over, positions }`; `firstSeen`).
  A variant = today's JP worker with its embedded skill-data object replaced (JSON), stamina
  showdown calls removed where it isn't in yet, and the distance factor patched for longsyoubu.
  Verified: the no-showdown variant reproduces the Global Umalator's results exactly for skills
  whose data matches Global's; the unchanged variant reproduces the JP Umalator exactly.
- `tools/build_skillvalues.js`: `--variants=<dir>` runs listed cups on their variant; compose
  (`--compose=data/skillvalues --gametora=<dir>`) keeps cups it didn't recompute, writes field 5
  (JP release date), `meta.sims` (cup → "global" | "jp" | variant name), `meta.variants`
  (`{ syoubu, syoubuLong, changed, positions }`), `meta.jpBuild`; ignores placeholder cache files.
- `tools/build_count_skills.js`: `--variants=<dir>`; its `activate_count` rewrite now also matches
  JSON keys (`"condition":"…"`) — needed because variant workers embed JSON.
- `tools/build_skill_positions.js`: exports `classify(skillData)`.
- `tools/build_presets.py`: future Global dates from GameTora's forecast
  (`en/foresight/timeline` `future_cm`, pace from `en/foresight/model` ≈ 1.426 JP days per Global
  day), LoH slots scaled by that pace; regenerated `data/presets.js` (adds cm50; cm20 now uses
  GameTora's recorded start 2026-10-10).
- `skill-release.js` (new, loaded in `index.html` after `data/skillvalues/index.js`):
  `cutoff(preset, today)`, `outBy(info, cut)`, `status(info, cut)`.
- `app.js`: `skillsBy(p)`/`released(id, p)` everywhere Global availability matters (skill table,
  parent targets, must-haves, family ace skills, parent skill pool via `skillsBy` in
  `parent-skills.js`, optimizer parent mode via `tiers.js`); table toggle "Out on Global by this
  cup", pills "By then" / "JP" / "<Mon YYYY> JP version"; a note per cup saying which simulator
  and game state it used (`simNote`); `positionsFor(p)` (cup-specific pack halves via
  `parent-relevance.js` `positionsWith`); header text for forecast dates.
- `README.md` (CM & decks section), tests: `test/skill-release.test.js`,
  `test/skill-versions.test.js` (new), updates in `test/parent-ss.test.js`,
  `test/optimizer.test.js`; `index.html` cache stamps bumped to `?v=20261101versions`.

Data state at the last update (2026-11-02 00:15 UTC): cm22–cm28 and cm50 recomputed and
committed (without the count-skill pass, which `finalize` runs over every cup at the end); cm29–cm49
and LoH 1–5 still simulating (`grep ok` in the run log; nearest Global cups go first). **The three tests that fail until
then are expected**: "every cup Global hasn't reached ran on its own JP-dated simulator", "a cup is
never valued behind Global's current skills…", "a JP-dated cup splits the pack by its own skill
versions". Everything else (430 tests) passes.

## 4. How to finish

### 4a. If the original container still exists

Scratch dir: `/tmp/claude-0/-home-user-umamusume-optimizer1/0b8988e4-ed2c-5f4f-a469-2d15a1496def/scratchpad`
(`S` below). The simulation runs detached (`setsid nohup`), log `$S/run3.log`, cache `$S/cache`.
Check: `grep -c " ok " $S/run3.log` (118 jobs in that run), `grep ERR $S/run3.log`,
`ls $S/cache/*.json | grep -vc job` (136 when all done incl. cm50). When it prints `all done`, run
`bash $S/finalize.sh` (compose → count skills → tests), check the result (4c), commit, push.

### 4b. From scratch (any machine: Node 22, git, Python 3, network; ~5 h on 4 cores)

```bash
git clone https://github.com/josemose17-commits/umamusume-optimizer1 && cd umamusume-optimizer1
git checkout claude/funny-brahmagupta-a7v8n2
S=$PWD/../work && mkdir -p $S/repos $S/uma/global $S/uma/jp $S/gt $S/cache
# alpha123's repos with full history (blob:none is enough)
git clone --filter=blob:none --no-checkout https://github.com/alpha123/uma-tools $S/repos/uma-tools
git clone --filter=blob:none https://github.com/alpha123/uma-skill-tools $S/repos/uma-skill-tools
# Umalator files: Global from the site, JP data from uma-skill-tools
for f in skill_data.json skill_meta.json skillnames.json course_data.json simulator.worker.js bundle.js; do
  curl -sSo $S/uma/global/$f https://alpha123.github.io/uma-tools/umalator-global/$f; done
curl -sSo $S/uma/jp/simulator.worker.js https://alpha123.github.io/uma-tools/umalator/simulator.worker.js
curl -sSo $S/uma/jp/bundle.js https://alpha123.github.io/uma-tools/umalator/bundle.js
for f in skill_data.json skillnames.json course_data.json; do
  curl -sSo $S/uma/jp/$f https://raw.githubusercontent.com/alpha123/uma-skill-tools/master/data/$f; done
curl -sSo $S/uma/jp/skill_meta.json https://raw.githubusercontent.com/alpha123/uma-tools/master/skill_meta.json
# GameTora files (versioned names come from the manifest)
curl -sSo $S/gt/manifest.json -A "uma-turn-coach data build" https://gametora.com/data/manifests/umamusume.json
for k in skills support-cards character-cards scenarios events/champions-meeting en/events/champions-meeting en/foresight/timeline en/foresight/model; do
  v=$(node -e 'console.log(require(process.argv[1])[process.argv[2]])' $S/gt/manifest.json "$k")
  out=$(echo "$k" | sed 's#/#__#g').json
  curl -sSo "$S/gt/$out" -A "uma-turn-coach data build" "https://gametora.com/data/umamusume/$k.$v.json"; done
# (build_presets.py reads events__champions-meeting.json, en__events__champions-meeting.json,
#  en__foresight__timeline.json, en__foresight__model.json; compose reads skills.json,
#  support-cards.json, character-cards.json, scenarios.json from the same dir)
python3 tools/build_presets.py $S/gt $S/uma/global/bundle.js $S/uma/jp/bundle.js $S/uma/jp/course_data.json   # only if presets need refreshing
node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify(require("./data/presets.js").list))' $S/presets.json
node tools/build_skill_versions.js $S/repos/uma-tools $S/repos/uma-skill-tools $S/variants
ONLY=$(node -e 'console.log(require("./data/presets.js").list.filter(p=>p.no>=22||p.kind==="loh").map(p=>p.id).join(","))')
setsid nohup node tools/build_skillvalues.js $S/presets.json $S/uma/global $S/uma/jp $S/cache \
  --workers=$(nproc) --only=$ONLY --variants=$S/variants > $S/run.log 2>&1 < /dev/null &
# wait until $S/run.log says "all done" (resumable: cached jobs are skipped on a restart), then:
node tools/build_skillvalues.js $S/presets.json $S/uma/global $S/uma/jp $S/cache --variants=$S/variants --compose=data/skillvalues --gametora=$S/gt
node tools/build_count_skills.js $S/uma/global $S/uma/jp $S/gt/skills.json --variants=$S/variants --workers=$(nproc)
node --test test/*.test.js
```

Notes: the Umalator's newest data may have moved on since 2026-11-01; that's fine (the tools read
history and today's builds), but if the JP build gains a new balance patch, add its date to
`PATCH` in `tools/build_skill_versions.js` after checking the patch notes (a data commit lands
after the patch; map it to the real JP patch date, as the existing entries do). If a long-running
command is run from a tool with a time limit, detach it (`setsid nohup … &`); don't `pkill -f`
with a pattern that also matches your own shell.

### 4c. Checks before the final push

1. `node --test test/*.test.js`: all pass (433+ tests).
2. `data/skillvalues/index.js`: `meta.sims` gives every cm22–cm50 and LoH a variant name;
   `meta.variants[...]`: no-showdown for cm22–cm26, longsyoubu for cm34, cm37, LoH 1, cm43, cm47.
3. Spot checks: cm22 Pace "Shooting for Victory! (inherited)" ≈ 0 (Global's 2.4 s version);
   cm27+ Come What May uses the last-straight condition; cm30 Breakin' Ahead (End) uses order ≥ 50;
   LoH 5/cm48/cm49/cm50 use JP's current versions (Leap Forward counts for Pace there).
4. In a browser (serve the repo: `python3 -m http.server`), CM & decks for cm22, cm30, cm49, cm50,
   cm21: the toggle reads "Out on Global by this cup" for future cups and "On Global only" for
   cm21; the note names the simulator, the cup's JP date and stamina showdown; "By then" and
   "JP version" pills show; no console errors. Parents tab: the race box summary says "skills out
   on Global by this cup".
5. Commit (message: what changed and why, in plain words), push to the branch, and tell the user
   in plain words: what was wrong, what each cup now uses, what's marked in the table, and the
   caveats below.

## 5. Caveats to tell the user (honest limits)

- Global has brought JP balance patches *early* before (Dec 2025, Jul 2026). If it does again, the
  cups just before a patch's slot may already have it; their values assume Global's current pace.
- The JP Umalator's data ends with JP's 2026-09-13 build: skills released on JP after that
  (Admire Groove's card, Mayano Top Gun's new card, Duramente, Air Groove, Symboli Rudolf …) have
  no values yet, and any JP patch between then and cm50 (JP 2026-10-20) isn't in.
- The simulated uma's stats are fixed per distance (`tools/build_presets.py` `STATS`); umas get
  stronger over time, which shifts some skill values. Not changed in this work.
- The 2024-10-29 long-race stamina showdown factors are players' measurements, not official.
- Cards in the optimizer are still the ones out on Global today; only skills are date-aware.
