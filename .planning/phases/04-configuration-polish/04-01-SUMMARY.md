---
phase: 04-configuration-polish
plan: 01
subsystem: config
tags: [config, env-vars, validation, tdd]
dependency_graph:
  requires: [security.ts]
  provides: [config.ts, AppConfig, loadConfig, ConfigError]
  affects: [index.ts]
tech_stack:
  added: []
  patterns: [fail-fast-validation, env-var-config, ConfigError-class]
key_files:
  created:
    - src/config.ts
    - src/__tests__/config.test.ts
  modified:
    - src/index.ts
decisions:
  - ConfigError class thrown (not process.exit) for testability
  - parsePositiveInt helper centralizes numeric env var validation
  - AGENT_ALLOWED_COMMANDS merges with defaults (does not replace)
metrics:
  duration: 3min
  completed: "2026-03-23T22:02:00Z"
  tasks: 2
  files: 3
---

# Phase 04 Plan 01: Config Module (TDD) + Index Wiring Summary

Env-var config module with fail-fast validation for all 7 agent settings, wired into index.ts replacing all hardcoded constants.

## What Was Done

### Task 1: Config module with TDD (RED -> GREEN)

**RED phase:** Created 16 test cases in `src/__tests__/config.test.ts` covering defaults, overrides, and validation errors for all 7 env vars. Tests confirmed failing (module did not exist).

**GREEN phase:** Created `src/config.ts` with:
- `ConfigError` class extending `Error` with `envKey=value is not valid, expected: ...` message format
- `AppConfig` interface matching `runAgentLoop` options shape
- `loadConfig()` function reading OLLAMA_HOST, AGENT_MODEL, AGENT_WORKING_DIR, AGENT_MAX_ITERATIONS, AGENT_TIMEOUT_SECONDS, AGENT_SHELL_MODE, AGENT_ALLOWED_COMMANDS
- `parsePositiveInt()` helper rejecting zero, negative, non-integer, and non-numeric values
- AGENT_TIMEOUT_SECONDS converted to milliseconds (value * 1000)
- AGENT_ALLOWED_COMMANDS split on comma, trimmed, filtered, merged with DEFAULT_ALLOWED_COMMANDS

All 16 tests passed on first run.

### Task 2: Wire config into index.ts

- Replaced 5 hardcoded constants (OLLAMA_HOST, DEFAULT_MODEL, MAX_ITERATIONS, TIMEOUT_MS, SHELL_MODE) with single `loadConfig()` call
- Added ConfigError catch with `process.exit(1)` for fail-fast startup
- Updated startup log to D-09 format: `local-agent-mcp | dir: ... | model: ... | shell: ... | host: ...`
- Tool schema description now references `config.model` dynamically
- All config values flow through to `runAgentLoop` call

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 (RED) | 6a6ef5f | test(04-01): add failing tests for config module |
| 1 (GREEN) | 49b661b | feat(04-01): implement config module with TDD (16 tests passing) |
| 2 | 2b54298 | feat(04-01): wire loadConfig into index.ts, remove all hardcoded constants |

## Verification Results

- `npm run build` -- exits 0
- `npm run typecheck` -- exits 0
- `npx eslint src/config.ts src/__tests__/config.test.ts` -- exits 0 (no errors)
- `npm test` -- 83 tests passing across 4 test files
- No hardcoded constants remain in index.ts

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None -- all config values are wired end-to-end from env vars through to runAgentLoop.

## Self-Check: PASSED

- All 3 created/modified files exist on disk
- All 3 commits (6a6ef5f, 49b661b, 2b54298) found in git log
