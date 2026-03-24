---
phase: 04-configuration-polish
plan: 03
subsystem: tests
tags: [lint, tests, gap-closure, eslint, vitest]
dependency_graph:
  requires: [src/__tests__/parser.test.ts, src/__tests__/tools.test.ts]
  provides: [lint-clean test suite, passing test suite]
  affects: [CI acceptance criteria, phase 4 completion]
tech_stack:
  added: [vitest.config.ts]
  patterns: [eslint-disable-line inline comments, vitest include scoping]
key_files:
  modified:
    - src/__tests__/parser.test.ts
    - src/__tests__/tools.test.ts
  created:
    - vitest.config.ts
decisions:
  - Used inline eslint-disable-line comments on parameter lines instead of eslint-disable-next-line on the function declaration line — the error is on the parameter line itself in multi-line signatures
  - Added vitest.config.ts with include: src/**/*.test.ts to prevent worktree test files from being collected by parallel agent execution
metrics:
  duration: 10min
  completed: 2026-03-24
  tasks: 2
  files: 3
---

# Phase 4 Plan 3: Lint and Test Gap Closure Summary

Fix 7 lint errors in parser.test.ts and tools.test.ts, increase grandchild-kill test timeout to 15s, and add vitest.config.ts to scope test discovery to src/ only.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix lint errors in parser.test.ts and tools.test.ts | 6f28648 | src/__tests__/parser.test.ts, src/__tests__/tools.test.ts |
| 2 | Fix test timeout for grandchild-kill test | 283ba9f | src/__tests__/tools.test.ts, vitest.config.ts |

## What Was Built

**Task 1 — Lint fixes (7 errors resolved):**

- `src/__tests__/parser.test.ts`: Removed unused `vi` import (line 3). Added inline `// eslint-disable-line @typescript-eslint/no-unused-vars` comments on the `_messages` parameter lines in 5 callback functions that conform to the `ChatFn` type signature.
- `src/__tests__/tools.test.ts`: Changed `let alive = false` to `let alive: boolean` to remove the useless initial assignment that the linter flagged.

**Task 2 — Test timeout and vitest scoping:**

- Added `{ timeout: 15000 }` to the "kills grandchild processes on timeout" test — the test spawns a bash subprocess with a 500ms timeout and needs up to 15s in slow environments.
- Created `vitest.config.ts` with `include: ["src/**/*.test.ts"]` to prevent vitest from collecting test files in `.claude/worktrees/` during parallel agent execution (deviation from plan — necessary to achieve exit 0).

## Verification

```
npm run lint  → exit 0 (0 errors, 0 warnings)
npm test      → exit 0 (83 tests, 4 test files)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added vitest.config.ts to scope test discovery**
- **Found during:** Task 2 verification
- **Issue:** vitest by default discovers `**/*.test.ts` globally, picking up test files in `.claude/worktrees/agent-*/` from other parallel agents. Those worktrees have the old unpatched `tools.test.ts` without the timeout fix, causing 2 test failures even after our fix was applied.
- **Fix:** Created `vitest.config.ts` with `include: ["src/**/*.test.ts"]` to limit discovery to the main source tree.
- **Files modified:** vitest.config.ts (created)
- **Commit:** 283ba9f

## Known Stubs

None.

## Self-Check: PASSED

- [x] `src/__tests__/parser.test.ts` modified and committed (6f28648)
- [x] `src/__tests__/tools.test.ts` modified and committed (6f28648, 283ba9f)
- [x] `vitest.config.ts` created and committed (283ba9f)
- [x] `npm run lint` exits 0
- [x] `npm test` exits 0, 83 tests pass
