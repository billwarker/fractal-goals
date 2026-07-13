# Speed up the pre-commit flow

## Context

Every `git commit` currently takes ~2 minutes because the pre-commit hook ([.githooks/pre-commit](.githooks/pre-commit) → `run-tests.sh verify`) runs the **entire** frontend vitest suite (~175 test files, ~115s warm) plus a responsive-CSS audit — regardless of what is being committed. Backend-only commits pay the full frontend-test cost. Two things compound this:

1. **The suite is artificially serial**: `client/vitest.config.js` sets `pool: 'forks', fileParallelism: false, maxWorkers: 1`, so all 175 files run one-at-a-time in a single forked process. This was added inside an unrelated feature commit (`873013a`) with no documented reason, alongside a wall-timeout wrapper — likely a fix for test hangs at the time.
2. **The safety net is misplaced**: `.githooks/pre-push` (full verify) exists but is **not installed** in `.git/hooks/`, and CI (cloudbuild) runs no tests. So the only test gate is the slowest possible place — every single commit.

Goal: commits complete in seconds (running only tests related to staged changes), the full suite moves to pre-push as the real safety net, and the full suite itself gets faster via bounded parallelism.

## Existing setup grade: C-

Correct and hang-protected, but slow by design: no change-awareness (backend commits run 175 frontend test files), forced single-worker execution with no recorded justification, duplicate full-suite cost defined for both commit and push, and the pre-push half of the design isn't even installed — so the intended layered gating doesn't exist in practice.

## Plan (targeting S+)

### 1. Add a fast, change-aware `verify-fast` command to `run-tests.sh`

New `run_verify_fast()` + `verify-fast` case in [run-tests.sh](run-tests.sh):

- Compute staged files: `git diff --cached --name-only --diff-filter=ACMR`.
- Always: `bash -n run-tests.sh` (sub-second).
- **No staged `client/` files → skip all frontend checks** with a printed note ("no client changes staged; skipping frontend tests"). This makes backend-only commits near-instant.
- Staged `client/` files present:
  - Run **only related tests**: `vitest related --run <staged client files>` (paths made relative to `client/`). Non-source files (e.g. `client/package.json`, css-only changes) that vitest can't map simply produce a fast no-test run.
  - Run `check:responsive` (pure regex file reads, milliseconds).
- Known, acceptable limitation to note in a comment: `vitest related` tests the working tree, not the staged index (same as the current full run).

### 2. Extend the vitest timeout wrapper to support `related`

[client/scripts/run-vitest-with-timeout.mjs](client/scripts/run-vitest-with-timeout.mjs) hardcodes `vitest run`. Add support for a `--related` mode (e.g. first arg `--related` → spawn `vitest related --run <files>`), keeping the existing wall-timeout hang protection. Add npm script `"test:related": "node scripts/run-vitest-with-timeout.mjs --related"` in `client/package.json`. `run-tests.sh` calls this via a new `frontend_vitest_related()` helper.

### 3. Repoint the hooks

- [.githooks/pre-commit](.githooks/pre-commit): `run-tests.sh verify` → `run-tests.sh verify-fast`.
- [.githooks/pre-push](.githooks/pre-push): unchanged (full `verify`).
- Run `./run-tests.sh install-hooks` so **both** hooks land in `.git/hooks/` (pre-push is currently missing there).

### 4. Re-enable bounded vitest parallelism (measured experiment)

In [client/vitest.config.js](client/vitest.config.js): drop `fileParallelism: false`, set `maxWorkers: 4` (bounded, not unbounded — keeps memory/jsdom pressure sane; keep `pool: 'forks'` and default per-file isolation).

- Verification gate: run the full suite **3 consecutive times**. Keep the change only if all 3 pass with no hangs and wall time improves meaningfully (expect ~115s → roughly 30–50s).
- If flaky or hanging: revert to serial and add a comment in the config documenting *why* it must stay serial (fixing the undocumented-magic problem either way).
- On success, update the timeout wrapper's `DEFAULT_TIMEOUT_MS` comment/value to match the new timing (e.g. 240s → 120s).

### Resulting behavior

| Action | Before | After |
|---|---|---|
| Backend-only commit | ~115s | <5s |
| Frontend commit (few files) | ~115s | ~5–20s (related tests only) |
| Push | 0s (hook not installed) | full suite, ~30–50s if parallelism sticks |

## Files to modify

- `run-tests.sh` — add `verify-fast` command + helper
- `.githooks/pre-commit` — call `verify-fast`
- `client/scripts/run-vitest-with-timeout.mjs` — `--related` mode
- `client/package.json` — `test:related` script
- `client/vitest.config.js` — bounded parallelism
- After approval: save this plan into `/planning/` per project convention

## Verification

1. **Backend-only commit**: stage a whitespace tweak in a backend file, `git commit` — hook should finish in seconds and print the frontend-skip note.
2. **Frontend commit**: stage a change to one component (e.g. a file with a matching `__tests__` suite), commit — observe only the related test files run.
3. **Related-mode wrapper**: `cd client && npm run test:related -- src/utils/fractalNavigation.js` runs only tests importing that module.
4. **Full verify unchanged**: `./run-tests.sh verify` still runs the whole suite + responsive audit.
5. **Parallelism stability**: full suite 3× consecutively — all green, no wall-timeout trips, record timings.
6. **Hooks installed**: `ls .git/hooks/pre-commit .git/hooks/pre-push` both present and executable after `install-hooks`.

## Outcome (implemented 2026-07-13)

- Backend-only / nothing-staged commit: **~0.05s** (was ~115s)
- Frontend commit touching one source file: **~6.5s** (related tests + responsive audit)
- Full suite with `maxWorkers: 4`: **45–84s** (was ~115s serial); wall timeout lowered 240s → 180s
- Parallelism validation: one unreproduced failure on the first (cold) run, then 4 consecutive fully green runs; noted as a watch item in `client/vitest.config.js`
- `pre-push` hook now installed (was missing), running full `verify`
