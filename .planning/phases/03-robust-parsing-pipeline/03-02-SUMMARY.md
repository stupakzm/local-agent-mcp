---
phase: 03-robust-parsing-pipeline
plan: 02
subsystem: loop
tags: [integration, parsing, agent-loop, format-json, parse-failure]
dependency_graph:
  requires: [src/parser.ts, src/ollama.ts]
  provides: [src/loop.ts, src/index.ts]
  affects: [agent-loop, mcp-response]
tech_stack:
  added: []
  patterns: [three-tier-parse-integration, chatfn-isolation, parse-failure-surface]
key_files:
  created: []
  modified:
    - src/ollama.ts
    - src/loop.ts
    - src/index.ts
decisions:
  - "chatFn closure builds its own request with correctionMessages — never touches main conversation history (per D-03)"
  - "format:'json' added to both main chatWithOllama call and chatFn to maximize structured output reliability (per D-04)"
  - "ParseFailure discrimination uses 'reason' in parseResult — distinguishes from OllamaToolCall[] at runtime"
  - "Synthetic tool result message appended to history before returning on ParseFailure to keep conversation state valid (per D-07)"
metrics:
  duration: 3min
  completed: 2026-03-23
  tasks: 2
  files: 3
---

# Phase 3 Plan 2: Parser Integration Wiring — Summary

**One-liner:** Wired three-tier parser into agent loop — format:'json' on all Ollama requests, chatFn closure isolated from history, ParseFailure surfaced as log line in MCP response.

## What Was Built

Integration connecting the standalone `src/parser.ts` module (from Plan 01) to the live agent loop.

**src/ollama.ts:**
- Added `format?: 'json'` to `OllamaChatRequest` interface (per D-05)

**src/loop.ts:**
- Deleted `parseContentToolCalls` inline function — fully replaced by parser module
- Added imports: `parseToolCall` and `ParseFailure` from `./parser.js`
- Added `parseFailure?: ParseFailure` to `AgentResult` interface (per D-08)
- Added `chatFn` closure that builds its own isolated request from `correctionMessages` — does NOT use the main `messages` array (per D-03)
- Added `format: 'json'` to the main `chatWithOllama` call inside the loop (per D-04)
- Replaced inline `parseContentToolCalls` call with:
  - Tier 1: `assistantMessage.tool_calls` fast path (preserved)
  - Tier 2+3: `parseToolCall(assistantMessage.content, chatFn)` when no native tool_calls
  - ParseFailure branch: appends synthetic `role: 'tool'` message to history before returning (per D-07)

**src/index.ts:**
- Added `parseFailure` check after `stoppedByLimit` block
- Surfaces failure as: `[parse failed after N attempts: reason]` in execution log

## Test Coverage

All 67 tests pass:
- 18 parser tests (src/__tests__/parser.test.ts)
- 33 security tests (src/__tests__/security.test.ts)
- 16 tools tests (src/__tests__/tools.test.ts)

No new tests were added — the parser module was already fully tested in Plan 01. The loop changes are integration wiring; behavioral coverage comes from parser unit tests.

## Deviations from Plan

None — plan executed exactly as written.

The worktree needed to be merged from master before execution since `src/parser.ts` existed on the master branch but not in this worktree. Merge was performed as a prerequisite step. No changes to the plan were needed.

## Known Stubs

None. All wiring is complete and functional.

## Self-Check: PASSED

- `src/ollama.ts` contains `format?: 'json'`: CONFIRMED
- `src/loop.ts` contains `import { parseToolCall }`: CONFIRMED
- `src/loop.ts` contains `import type { ParseFailure }`: CONFIRMED
- `src/loop.ts` does NOT contain `parseContentToolCalls`: CONFIRMED (deleted)
- `src/loop.ts` contains `parseFailure?: ParseFailure`: CONFIRMED
- `src/loop.ts` contains `format: 'json'`: CONFIRMED (both calls)
- `src/loop.ts` contains `const chatFn`: CONFIRMED (isolated closure)
- `src/loop.ts` contains `'reason' in parseResult`: CONFIRMED
- `src/loop.ts` contains `[parse failed:` synthetic tool message: CONFIRMED
- `src/index.ts` contains `result.parseFailure`: CONFIRMED
- `src/index.ts` contains `[parse failed after`: CONFIRMED
- Commit 70747d3 (Task 1) exists: CONFIRMED
- Commit ecd18b7 (Task 2) exists: CONFIRMED
- `npm run build` exits 0: CONFIRMED
- `npm test` exits 0 (67/67 pass): CONFIRMED
