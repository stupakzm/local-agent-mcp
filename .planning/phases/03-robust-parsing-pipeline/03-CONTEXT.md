# Phase 3: Robust Parsing Pipeline - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

A three-tier fault-tolerant parser in `src/parser.ts` that handles all documented model output failure modes — replacing the basic `parseContentToolCalls` in `loop.ts`. Tier 1: native tool_calls fast path. Tier 2: 7-strategy text extraction pipeline. Tier 3: up to 3 retries with correction prompts via Ollama.

Also adds `format: 'json'` to all Ollama chat requests in `loop.ts` as a proactive reliability measure.

Configuration, env-var wiring, and context window summarization are out of scope (Phase 4 and v2 respectively).

</domain>

<decisions>
## Implementation Decisions

### Retry Architecture

- **D-01:** `parser.ts` owns the retry loop — it receives a `chatFn` callback and calls it internally up to 3 times on parse failure. `loop.ts` does NOT contain retry logic.
- **D-02:** Single exported function: `parseToolCall(content: string, chatFn: ChatFn): Promise<OllamaToolCall[] | ParseFailure>`. Self-contained — one call from loop.ts, all retry orchestration hidden inside parser.ts.
- **D-03:** `chatFn` signature: `(messages: OllamaMessage[]) => Promise<OllamaMessage>` — parser builds the correction prompt as a message array and calls it, just like the main loop does.

### Ollama Format Parameter

- **D-04:** Add `format: 'json'` to all Ollama chat requests — set at the `loop.ts` call site (one line in the `chatWithOllama` call), not inside `ollama.ts` defaults. Prevents malformed JSON at the source; parser still runs the full extraction pipeline for schema conformance.
- **D-05:** `ollama.ts` `OllamaChatRequest` interface gets an optional `format?: 'json'` field so TypeScript is happy. Callers can opt out by omitting it.

### Integration with loop.ts

- **D-06:** `loop.ts` replaces the inline `parseContentToolCalls(assistantMessage.content)` call with `await parseToolCall(assistantMessage.content, chatFn)` — where `chatFn` is a closure over the current `host` and `model`.
- **D-07:** If `parseToolCall` returns `ParseFailure`, the loop appends a synthetic tool result message to history and breaks the iteration loop, then surfaces the failure in `AgentResult`.

### ParseFailure in AgentResult

- **D-08:** `AgentResult` gets a new optional field: `parseFailure?: ParseFailure`. When set, the execution log (returned to Claude Code) shows a final line: `[parse failed after N attempts: <reason>]` using the same format as `[stopped: max iterations reached]`.
- **D-09:** `ParseFailure` fields: `reason: string`, `rawContent: string`, `attemptCount: number`, `lastError: string` — matches ROADMAP.md spec.

### Claude's Discretion

- Exact wording of correction prompts (template structure from PARSING.md §3.3 is the reference)
- Internal ordering of the 7 extraction strategies (PARSING.md §2 pipeline is the reference)
- Whether to deduplicate strategies that overlap (e.g., stripProse + extractFirstJson vs lenient repair)
- Test case wording and assertions beyond the 14 canonical cases from PARSING.md §7

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Parser implementation reference
- `.planning/research/PARSING.md` — Complete failure mode taxonomy (P0/P1/P2), all 7 extraction strategies with code, retry prompt templates, 14 canonical test cases (§7), architecture recommendation (§9)

### Requirements
- `.planning/REQUIREMENTS.md` §Parsing Pipeline — PARSE-01 through PARSE-06 (exact acceptance criteria for this phase)
- `.planning/ROADMAP.md` §Phase 3 — Key deliverables checklist, success criteria, and field normalization alias map

### Existing code to replace/extend
- `src/loop.ts` lines 41–82 — `parseContentToolCalls` being replaced by `parseToolCall` from `src/parser.ts`; line 137 is the integration point
- `src/ollama.ts` — `OllamaChatRequest` interface needs optional `format?: 'json'` field; `OllamaMessage` and `OllamaToolCall` types used by the new parser

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ollama.ts`: `OllamaMessage`, `OllamaToolCall`, `chatWithOllama` — parser uses these types directly. `chatFn` callback will wrap `chatWithOllama`.
- `src/__tests__/`: Existing Vitest test setup — parser test suite adds `parser.test.ts` here, same `npm test` command.

### Established Patterns
- `console.error`-only logging: enforced, no `console.log` anywhere in parser
- Pure-function module style: `security.ts` and `tools.ts` use exported functions, not classes — `parser.ts` follows the same pattern
- `OllamaToolCall` shape: `{ function: { name: string; arguments: Record<string, unknown> } }` — parser normalizes all input to this shape

### Integration Points
- `src/loop.ts:137` — replace `parseContentToolCalls(assistantMessage.content)` with `await parseToolCall(assistantMessage.content, chatFn)`
- `src/loop.ts` `runAgentLoop` — add `chatFn` closure and handle `ParseFailure` return from `parseToolCall`
- `src/index.ts` — `AgentResult` format string may need updating for `parseFailure` field

</code_context>

<specifics>
## Specific Ideas

- Correction prompt template from PARSING.md §3.3 is the canonical reference — downstream agents should follow it rather than invent their own
- `format: 'json'` set at call site in loop.ts, not as client default — keeps the option visible and easy to toggle per model if needed

</specifics>

<deferred>
## Deferred Ideas

- `format: jsonSchema` (grammar-constrained generation, PARSING.md §5.2) — stronger than `format:'json'` but model-specific behavior needs empirical testing. Consider for v2.
- Context window summarization (CAP-03) — hard-stop is in scope for Phase 3, but summarization to recover is v2.
- Per-model format parameter toggle (e.g., disable `format:'json'` for models that break on it) — Phase 4 config concern.

</deferred>

---

*Phase: 03-robust-parsing-pipeline*
*Context gathered: 2026-03-23*
