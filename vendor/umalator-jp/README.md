# Umalator JP worker

Unmodified JP worker by alpha123, licensed under GNU GPL v3 (see LICENSE).

Worker blob: 5f817730b55f382ff7a97ce7888a25c54ef9a48f.
Source and build instructions: https://github.com/alpha123/uma-tools/tree/376111657974ccbd1e1a245fdd4c57e825a73ad4 (built 2026-09-13).
The source uses the uma-skill-tools submodule; initialize it recursively as recorded by that revision.
Game data belongs to Cygames. The worker is loaded only when a race comparison for a JP-dated cup
(Champions Meeting 22 on, League of Heroes) is requested.

`race-worker.js` modifies it in the browser as `race-variants.js` describes: it overrides the
skills listed in `data/race-variants/<variant>.json`, and takes out stamina showdown or sets
JP's later long-race showdown factors for that variant. Rebuild with `tools/build_race_variants.js`.
