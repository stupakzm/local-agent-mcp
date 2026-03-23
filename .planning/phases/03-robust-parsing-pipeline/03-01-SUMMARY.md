---
phase: 03-robust-parsing-pipeline
plan: 01
subsystem: parser
tags: [tdd, parsing, reliability, text-extraction, retry]
dependency_graph:
  requires: [src/ollama.ts]
  provides: [src/parser.ts]
  affects: [src/loop.ts]
tech_stack:
  added: []
  patterns: [three-tier-parser, extraction-pipeline, retry-with-correction-prompt, parse-failure-return]
key_files:
  created:
    - src/parser.ts
    - src/__tests__/parser.test.ts
  modified: []
decisions:
  - "write_file checked before read_file in TOOL_SIGNATURES — more specific (2 required params vs 1), prevents read_file matching write_file calls"
  - "Single-quote replacement only when NO double quotes present — prevents corruption of values with apostrophes"
  - "JS comment stripping applied before trailing-comma removal in lenientRepair — comments may contain commas"
  - "extractAllJsonObjects guards idx >= raw.length to prevent infinite loop when fragment at end of string"
metrics:
  duration: 2min
  completed: 2026-03-23
  tasks: 1
  files: 2
---

# Phase 3 Plan 1: Parser TDD — Summary

**One-liner:** Three-tier fault-tolerant parser using 6 text-extraction strategies, field normalization aliases, tool name inference, and 3-retry correction loop — all 18 test cases passing.

## What Was Built

`src/parser.ts` — the core Phase 3 deliverable. A pure module exporting `parseToolCall(content, chatFn)` that handles all documented model output failure modes:

**Tier 1 (native):** Handled upstream in `loop.ts` — not the parser's concern. Parser handles Tier 2 and 3.

**Tier 2 (text extraction):** 6-strategy pipeline:
1. Direct JSON.parse
2. Strip prose/fences, then parse
3. Extract first balanced JSON object (depth-tracking walker), then parse
4. Extract first JSON, lenient repair, then parse
5. Lenient repair of stripped prose, then parse
6. Extract all JSON objects, pick best match via `normalizeToolCall` + `TOOL_SIGNATURES`

**Tier 3 (retry):** Up to 3 retries with correction prompt including the specific parse error and expected format. Returns `ParseFailure` after exhaustion — never throws.

**Normalization:**
- `NAME_ALIASES`: `name`, `tool_name`, `function`, `action`, `tool`, `function_name`
- `PARAMS_ALIASES`: `parameters`, `arguments`, `args`, `params`, `input`, `kwargs`, `inputs`
- Hoisted parameters fallback (residual keys collected when no params key found)
- Double-stringified parameters (JSON.parse on string values)
- Tool name inference from `TOOL_SIGNATURES` when name missing

## Test Coverage

18 test cases across P0/P1/P2 failure modes from PARSING.md section 7:

| Category | Cases |
|----------|-------|
| P0: Text extraction (prose, fences, trailing commas, multiple objects) | 4 |
| P0: Field normalization (tool_name, function/arguments, double-stringify) | 3 |
| P1: Lenient repair (single quotes, unquoted keys, hoisted params, name inference, JS comments) | 5 |
| Retry: PARSE-04 (3 attempts, error in prompt) | 2 |
| ParseFailure: PARSE-05 (never throws, all fields present) | 2 |
| P2: Unrecoverable cases trigger retry (truncated, unparseable) | 2 |

All 18 pass.

## Deviations from Plan

None — plan executed exactly as written.

The pre-existing `kills grandchild processes on timeout` test in `tools.test.ts` timed out during the full test run — this is a pre-existing flaky test (process group kill timing) completely unrelated to the parser. Logged to deferred items.

## Known Stubs

None. Parser is fully wired with all strategies and retry logic.

## Self-Check: PASSED

- `src/parser.ts` exists: FOUND
- `src/__tests__/parser.test.ts` exists: FOUND
- Commit 2d71fd8 exists: FOUND
- `npx vitest run src/__tests__/parser.test.ts` exits 0: CONFIRMED (18/18 pass)
- `npm run build` exits 0: CONFIRMED
- `grep -c console.log src/parser.ts` returns 0: CONFIRMED
- `grep -c "throw " src/parser.ts` returns 0: CONFIRMED
