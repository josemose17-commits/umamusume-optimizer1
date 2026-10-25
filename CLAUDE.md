# Working in this repo

## Plan first, every chat

Before changing any code for a new request, reply with a plan and wait for the user's go-ahead:

1. A short note on what already exists in the app for this request (so nothing is rebuilt).
2. Numbered steps. For each one: what it does for the user, in plain words, and the
   **effort level** it needs (`low`, `medium` or `high`, the `/effort` setting), with one line
   on why. Flag any step that depends on data we may not have.
3. The suggested order, and the questions whose answers change the work (with the default
   you'll use if they just say "go").

Then stop. Start only after the user approves (e.g. "go", "do the high ones", "do step 2").
Small follow-ups inside an approved plan, and pure questions, don't need a new plan.

## Shipping

Commit and push to the session's `claude/*` branch. `.github/workflows/auto-merge.yml` merges
it into `main` when the tests pass, so run `node --test test/*.test.js` before every push.
