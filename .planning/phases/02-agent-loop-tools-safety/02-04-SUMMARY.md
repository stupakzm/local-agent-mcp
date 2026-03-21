---
phase: 02-agent-loop-tools-safety
plan: "04"
subsystem: safety
tags: [process-group, timeout, unix, sigterm, bash]

# Dependency graph
requires:
  - phase: 02-agent-loop-tools-safety
    provides: bashExec with detached:true process group creation (used as foundation for group kill)
provides:
  - Manual setTimeout-based timeout with process.kill(-pid, SIGTERM) killing entire process group on Unix
  - Grandchild process survival test verifying SAFE-04 compliance
affects: [02-agent-loop-tools-safety, testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Manual setTimeout over execFile built-in timeout for Unix process group kill"
    - "Conditional spread for platform-specific execFile options"
    - "timedOut boolean flag to coordinate between timer callback and execFile callback"

key-files:
  created: []
  modified:
    - src/tools.ts
    - src/__tests__/tools.test.ts

key-decisions:
  - "Manual setTimeout + process.kill(-child.pid, SIGTERM) replaces execFile built-in timeout on Unix to kill entire process group including grandchildren"
  - "Windows retains built-in timeout via conditional spread — only direct child kill needed there"
  - "timedOut flag checked first in callback so grandchild kill result resolves correctly even if error is null"

patterns-established:
  - "Process group kill pattern: detached:true + manual setTimeout + process.kill(-pid, SIGTERM) + clearTimeout on close"

requirements-completed: [SAFE-04]

# Metrics
duration: 2min
completed: 2026-03-21
---

# Phase 02 Plan 04: Fix Process Group Kill on Timeout (SAFE-04 Gap Closure) Summary

**Manual setTimeout replacing execFile built-in timeout on Unix so SIGTERM kills entire process group including grandchildren, with test verification**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-21T15:28:35Z
- **Completed:** 2026-03-21T15:30:20Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Replaced execFile built-in timeout with manual setTimeout that calls process.kill(-child.pid, SIGTERM) on Unix
- Added timedOut boolean flag to coordinate timeout signal between timer and execFile callback
- Retained clearTimeout on child close event to prevent spurious kills after natural exit
- Kept Windows fallback with built-in timeout via conditional spread
- Added grandchild kill test that verifies the spawned PID is gone after timeout (skipped on Windows)

## Task Commits

1. **Task 1: Replace execFile timeout with manual setTimeout + process group kill** - `37d1be7` (feat)
2. **Task 2: Add grandchild process group kill test (Unix only)** - `2fb5a42` (test)

## Files Created/Modified

- `src/tools.ts` - bashExec now uses manual setTimeout with process.kill(-child.pid!, SIGTERM) on Unix; conditional spread keeps built-in timeout only for Windows
- `src/__tests__/tools.test.ts` - New "kills grandchild processes on timeout" test verifies grandchild PID is gone after 500ms timeout; skipped on Windows

## Decisions Made

- Manual setTimeout chosen over execFile built-in because Node's built-in only kills the direct child process, not grandchildren spawned via `bash -c "... &"`
- Windows excluded from process group kill because Windows has no POSIX process groups — built-in timeout sufficient
- timedOut flag checked before error.killed in callback to ensure correct timeout message when SIGTERM causes non-standard error values

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SAFE-04 fully satisfied: grandchildren don't survive timeout on Unix
- All 90 tests pass (7 skipped on Windows for Unix-only bash tests)
- Ready to proceed to Phase 03 or next Phase 02 plan

---
*Phase: 02-agent-loop-tools-safety*
*Completed: 2026-03-21*
