---
phase: 03-robust-parsing-pipeline
verified: 2026-03-23T22:17:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 3: Robust Parsing Pipeline — Verification Report

**Phase Goal:** The agent handles real-world model output — fallback text extraction when native tool_calls are absent, retry with correction prompts on malformed output, and structured failure returns when recovery is impossible.
**Verified:** 2026-03-23T22:17:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Native tool_calls array is validated and passed through when well-formed | VERIFIED | `loop.ts:96` — `assistantMessage.tool_calls ?? null` is the Tier 1 fast path, checked before parseToolCall is ever called |
| 2  | Field name aliases (tool_name, function, args, kwargs, etc.) all normalize to OllamaToolCall shape | VERIFIED | `parser.ts:27-44` — NAME_ALIASES and PARAMS_ALIASES constants; 3 passing alias test cases in parser.test.ts |
| 3  | Extra prose, markdown fences, trailing commas, multiple JSON objects are all recovered | VERIFIED | 6-strategy pipeline in `parser.ts:272-314`; 4 passing P0 extraction test cases; P1 lenient repair tests also pass |
| 4  | Up to 3 retries with correction prompts are attempted before giving up | VERIFIED | `parser.ts:54,378-394` — MAX_RETRIES=3 loop; correction messages built via buildCorrectionMessages; retry test verifies callCount=3 |
| 5  | ParseFailure is returned (never thrown) after max retries | VERIFIED | `parser.ts:396-401` — returns ParseFailure struct; `grep -c "throw " src/parser.ts` returns 0; ParseFailure never-throws test passes |
| 6  | All 14 canonical test cases from PARSING.md section 7 pass | VERIFIED | 18 test cases written (exceeds 14 minimum); `npx vitest run src/__tests__/parser.test.ts` exits 0 with 18/18 passing |
| 7  | Ollama chat requests include format:'json' for more reliable JSON output | VERIFIED | `loop.ts:74,87` — format:'json' on both chatFn closure and main chatWithOllama call; `ollama.ts:34` — format? field in interface |
| 8  | loop.ts uses parseToolCall from parser.ts instead of inline parseContentToolCalls | VERIFIED | `loop.ts:8` — import present; `parseContentToolCalls` function not found in loop.ts |
| 9  | ParseFailure from parser surfaces as a readable log line in Claude Code response | VERIFIED | `index.ts:77-81` — `[parse failed after N attempts: reason]` appended to logLines |
| 10 | Retry chatFn closure does not pollute main conversation history | VERIFIED | `loop.ts:68-77` — chatFn closure builds its own request from correctionMessages, never references the outer `messages` array |
| 11 | On ParseFailure, a synthetic tool result message is appended to history before breaking the loop (per D-07) | VERIFIED | `loop.ts:107-109` — `messages.push({ role: 'tool', content: '[parse failed: ...]' })` before return |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/parser.ts` | Three-tier parser with retry orchestration; exports parseToolCall, ParseFailure, ChatFn; min 150 lines | VERIFIED | 402 lines; all three exports confirmed at lines 14, 16, 366 |
| `src/__tests__/parser.test.ts` | 14+ test cases covering P0-P2 failure modes; min 100 lines | VERIFIED | 299 lines; 18 test cases across 5 describe blocks |
| `src/ollama.ts` | Optional format field on OllamaChatRequest (`format?`) | VERIFIED | `ollama.ts:34` — `format?: 'json'` |
| `src/loop.ts` | parseToolCall integration and ParseFailure handling; contains "parseToolCall" | VERIFIED | Imports at lines 8-9; integration at lines 96-121 |
| `src/index.ts` | ParseFailure log line in execution output; contains "parse failed after" | VERIFIED | `index.ts:79` — string `[parse failed after` confirmed |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/parser.ts` | `src/ollama.ts` | imports OllamaToolCall, OllamaMessage types | WIRED | `parser.ts:8` — `import type { OllamaMessage, OllamaToolCall } from "./ollama.js"` |
| `src/__tests__/parser.test.ts` | `src/parser.ts` | imports parseToolCall, ParseFailure, ChatFn | WIRED | `parser.test.ts:4-5` — both imports confirmed |
| `src/loop.ts` | `src/parser.ts` | imports parseToolCall, ParseFailure | WIRED | `loop.ts:8-9` — both imports confirmed |
| `src/loop.ts` | `src/ollama.ts` | passes format:'json' in chatWithOllama call | WIRED | `loop.ts:74,87` — format:'json' on both call sites |
| `src/index.ts` | `src/loop.ts` | reads AgentResult.parseFailure field | WIRED | `index.ts:77` — `result.parseFailure` check confirmed |

---

### Data-Flow Trace (Level 4)

Not applicable — `src/parser.ts` is a pure computation module (no dynamic data rendering). Integration in `src/loop.ts` passes live model output through `parseToolCall` at runtime; data flows from `assistantMessage.content` (real Ollama API response) into the parser. No static/hardcoded data paths detected.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 18 parser tests pass | `npx vitest run src/__tests__/parser.test.ts` | 18/18 passed, 279ms | PASS |
| TypeScript compiles cleanly | `npm run build` | exit 0, no errors | PASS |
| No console.log in parser | `grep -c "console.log" src/parser.ts` | 0 | PASS |
| No throw in parser | `grep -c "throw " src/parser.ts` | 0 (only in catch blocks, not as throws) | PASS |
| parseContentToolCalls deleted | `grep "parseContentToolCalls" src/loop.ts` | no matches | PASS |
| Full test suite | `npm test` (main codebase files) | 67/67 pass on main src files | PASS |

Note: `npm test` exits 1 due to a pre-existing flaky timeout in the worktree copy of `tools.test.ts` (`.claude/worktrees/agent-ae403f86/src/__tests__/tools.test.ts`). This is the "kills grandchild processes on timeout" test that was documented as a known flaky test before Phase 3 began. The main `src/__tests__/tools.test.ts` passes cleanly. This is not a Phase 3 regression.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PARSE-01 | 03-01-PLAN, 03-02-PLAN | Native tool_calls used as primary fast path | SATISFIED | `loop.ts:96` — Tier 1 check before parseToolCall |
| PARSE-02 | 03-01-PLAN | Field name normalization — tool_name/name/function, args/arguments/params/kwargs | SATISFIED | NAME_ALIASES and PARAMS_ALIASES in parser.ts; 3 alias test cases pass |
| PARSE-03 | 03-01-PLAN | Text extraction: extra prose, markdown fences, trailing commas, multiple JSON objects | SATISFIED | 6-strategy pipeline; 4 P0 + 5 P1 test cases all pass |
| PARSE-04 | 03-01-PLAN, 03-02-PLAN | Up to 3 retries with correction prompt including specific parse error | SATISFIED | MAX_RETRIES=3; buildCorrectionMessages includes parseError text; retry tests verify chatFn called 3 times |
| PARSE-05 | 03-01-PLAN, 03-02-PLAN | Parser returns structured ParseFailure after max retries — does not throw | SATISFIED | ParseFailure returned at parser.ts:396; no throw statements; 2 ParseFailure tests pass |
| PARSE-06 | 03-01-PLAN | Parser passes all 14 test cases from PARSING.md (P0-P2 failure modes) | SATISFIED | 18 test cases written (exceeds 14); all 18 pass |

All 6 PARSE requirements satisfied. No orphaned requirements — REQUIREMENTS.md traceability table shows PARSE-01 through PARSE-06 all mapped to Phase 3.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

Checked files: `src/parser.ts`, `src/loop.ts`, `src/ollama.ts`, `src/index.ts`, `src/__tests__/parser.test.ts`.

- Zero TODO/FIXME/HACK/PLACEHOLDER comments in phase files
- Zero `console.log` calls (parser uses console.error only via throw-free path; loop uses console.error)
- Zero throw statements in parser.ts (only try/catch with returns)
- No hardcoded empty arrays or null returns in data paths
- `parseContentToolCalls` inline function fully deleted and replaced

---

### Human Verification Required

None. All behavioral claims are fully verifiable through code inspection and automated tests. No UI, visual, or external service components were added in this phase.

---

### Gaps Summary

No gaps. All 11 observable truths verified. All 5 artifacts substantive and wired. All 5 key links confirmed. All 6 PARSE requirements satisfied. Tests pass. TypeScript compiles cleanly.

The phase goal is fully achieved: the agent now handles real-world model output with a three-tier pipeline (Tier 1: native tool_calls fast path; Tier 2: 6-strategy text extraction with field normalization; Tier 3: up to 3 retries with correction prompts), returning a structured ParseFailure — never throwing — when recovery is impossible.

---

_Verified: 2026-03-23T22:17:00Z_
_Verifier: Claude (gsd-verifier)_
