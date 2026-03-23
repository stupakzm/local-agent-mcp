# Phase 3: Robust Parsing Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Session date:** 2026-03-23

---

## Area 1: Retry Architecture

**Q: Where should the retry-with-correction-prompt logic live?**

Options presented:
- `parser.ts` owns retries — receives chatFn callback, runs retries internally, returns `OllamaToolCall[] | ParseFailure`
- `loop.ts` owns retries — parser is a pure stateless extractor, loop handles retry orchestration
- Separate retrier module — `parser.ts` + `retrier.ts` + `loop.ts`, cleanest separation

**Selected:** `parser.ts` owns retries (recommended)

---

**Q: What should the parser's exported API look like?**

Options presented:
- `parseToolCall(content, chatFn)` — single function, self-contained
- Two functions: `extract()` + `parseWithRetry()` — more testable in isolation
- Class-based `Parser` — OOP approach

**Selected:** `parseToolCall(content, chatFn)` (recommended)

---

## Area 2: Ollama Format Parameter

**Q: Should Phase 3 add `format:'json'` to Ollama chat requests?**

Options presented:
- Yes — add `format:'json'` to all requests now (proactive, low cost)
- No — defer to Phase 4 alongside other config
- Only on retry calls (escalating constraints)

**Selected:** Yes — add `format:'json'` now (recommended)

---

**Q: Where should `format:'json'` be set — in the Ollama client or at the call site?**

Options presented:
- Always-on at `loop.ts` call site — explicit, easy to toggle per model
- Default in `ollama.ts` client — centralized, callers can't opt out

**Selected:** Always-on at `loop.ts` call site (recommended)

---

*Discussion log generated: 2026-03-23*
