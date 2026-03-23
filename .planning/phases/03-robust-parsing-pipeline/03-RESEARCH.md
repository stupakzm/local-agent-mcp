# Phase 3: Robust Parsing Pipeline - Research

**Researched:** 2026-03-23
**Domain:** LLM tool call output parsing and retry orchestration
**Confidence:** HIGH

## Summary

Phase 3 replaces the basic `parseContentToolCalls` function in `loop.ts` with a comprehensive three-tier parser in `src/parser.ts`. The existing parser handles only clean JSON with exact field names (`name`/`arguments`). The new parser must handle the full spectrum of real-world model output: prose-wrapped JSON, malformed JSON, wrong field names, missing fields, and completely unparseable output.

The implementation is well-scoped. PARSING.md provides complete code for all 7 extraction strategies, the normalization map, retry prompt templates, and 14 test cases. The CONTEXT.md decisions lock the architecture: parser owns the retry loop via `chatFn` callback, single exported function `parseToolCall`, `ParseFailure` as a return type (never throw). No external libraries needed -- this is pure string manipulation and JSON parsing.

**Primary recommendation:** Implement parser.ts as a single module with all 7 strategies as internal functions, the retry loop using the `chatFn` callback, and export only `parseToolCall` and `ParseFailure`. Add `format: 'json'` to the Ollama chat call in loop.ts. Wire integration at `loop.ts:137`. Test all 14 cases from PARSING.md section 7.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `parser.ts` owns the retry loop -- it receives a `chatFn` callback and calls it internally up to 3 times on parse failure. `loop.ts` does NOT contain retry logic.
- **D-02:** Single exported function: `parseToolCall(content: string, chatFn: ChatFn): Promise<OllamaToolCall[] | ParseFailure>`. Self-contained -- one call from loop.ts, all retry orchestration hidden inside parser.ts.
- **D-03:** `chatFn` signature: `(messages: OllamaMessage[]) => Promise<OllamaMessage>` -- parser builds the correction prompt as a message array and calls it, just like the main loop does.
- **D-04:** Add `format: 'json'` to all Ollama chat requests -- set at the `loop.ts` call site (one line in the `chatWithOllama` call), not inside `ollama.ts` defaults.
- **D-05:** `ollama.ts` `OllamaChatRequest` interface gets an optional `format?: 'json'` field.
- **D-06:** `loop.ts` replaces the inline `parseContentToolCalls(assistantMessage.content)` call with `await parseToolCall(assistantMessage.content, chatFn)`.
- **D-07:** If `parseToolCall` returns `ParseFailure`, the loop appends a synthetic tool result message to history and breaks the iteration loop, then surfaces the failure in `AgentResult`.
- **D-08:** `AgentResult` gets a new optional field: `parseFailure?: ParseFailure`. When set, the execution log shows: `[parse failed after N attempts: <reason>]`.
- **D-09:** `ParseFailure` fields: `reason: string`, `rawContent: string`, `attemptCount: number`, `lastError: string`.

### Claude's Discretion
- Exact wording of correction prompts (PARSING.md section 3.3 is the reference)
- Internal ordering of the 7 extraction strategies (PARSING.md section 2 pipeline is the reference)
- Whether to deduplicate strategies that overlap
- Test case wording and assertions beyond the 14 canonical cases

### Deferred Ideas (OUT OF SCOPE)
- `format: jsonSchema` (grammar-constrained generation) -- v2
- Context window summarization (CAP-03) -- v2
- Per-model format parameter toggle -- Phase 4 config concern
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PARSE-01 | Native `message.tool_calls` path used as primary fast path | Tier 1 in three-tier architecture; D-06 integration point at loop.ts:137; existing `tool_calls` check already works, parser adds validation |
| PARSE-02 | Field name normalization handles aliases | NAME_ALIASES and PARAMS_ALIASES maps from PARSING.md section 5; `normalizeToolCall()` function handles all documented variants |
| PARSE-03 | Text extraction pipeline handles extra prose, fences, trailing commas, multiple objects | Strategies 1-7 from PARSING.md section 2; complete code provided for each strategy |
| PARSE-04 | Up to 3 retries with correction prompt including parse error and expected format | Tier 3 retry loop owned by parser (D-01); prompt templates from PARSING.md section 3.3; `chatFn` callback (D-03) |
| PARSE-05 | Structured `ParseFailure` return after max retries -- no throw | `ParseFailure` type with 4 fields (D-09); surfaced via `AgentResult.parseFailure` (D-08) |
| PARSE-06 | Parser passes all 14 test cases from PARSING.md P0-P2 | Test cases from PARSING.md section 7; Vitest test file at `src/__tests__/parser.test.ts` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.9.3 | Language | Already in project |
| Vitest | ^3.1.0 | Test framework | Already in project, `npm test` runs it |

### Supporting
No additional libraries needed. The parser is pure TypeScript -- JSON.parse, string manipulation, regex. No json5, no external parser libraries.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled lenient JSON repair | `json5` npm package | json5 handles single quotes and trailing commas, but adds a dependency for ~20 lines of regex. Hand-roll is correct here -- the repair logic is specific to tool call shapes and well-documented in PARSING.md |
| Hand-rolled balanced-brace extraction | `jsonrepair` npm package | Overkill -- we need substring extraction, not full document repair |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  parser.ts          # NEW: Three-tier parser with retry orchestration
  loop.ts            # MODIFIED: Wire parseToolCall, add format:'json', handle ParseFailure
  ollama.ts          # MODIFIED: Add format? field to OllamaChatRequest
  index.ts           # MODIFIED: Surface ParseFailure in execution log
  tools.ts           # UNCHANGED
  security.ts        # UNCHANGED
  __tests__/
    parser.test.ts   # NEW: 14+ test cases
    security.test.ts # UNCHANGED
    tools.test.ts    # UNCHANGED
```

### Pattern 1: Three-Tier Parser Architecture
**What:** Tier 1 (native tool_calls) -> Tier 2 (7-strategy text extraction) -> Tier 3 (retry with correction prompts)
**When to use:** Always -- this is the only parse path
**Example:**
```typescript
// Source: PARSING.md section 9, adapted per CONTEXT.md decisions
export type ChatFn = (messages: OllamaMessage[]) => Promise<OllamaMessage>;

export interface ParseFailure {
  reason: string;
  rawContent: string;
  attemptCount: number;
  lastError: string;
}

export async function parseToolCall(
  content: string,
  chatFn: ChatFn,
): Promise<OllamaToolCall[] | ParseFailure> {
  // Tier 2: Try extraction pipeline on content
  const extracted = extractToolCalls(content);
  if (extracted) return extracted;

  // Tier 3: Retry up to 3 times with correction prompts
  let lastError = "Could not parse tool call from content";
  let rawContent = content;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const correctionMessages = buildCorrectionMessages(rawContent, lastError);
    const response = await chatFn(correctionMessages);
    rawContent = response.content;

    const retryResult = extractToolCalls(response.content);
    if (retryResult) return retryResult;

    lastError = getParseError(response.content);
  }

  return { reason: lastError, rawContent, attemptCount: 3, lastError };
}
```

### Pattern 2: Extraction Pipeline (Internal)
**What:** 7 strategies tried in order, first success wins
**When to use:** Called by `parseToolCall` when `tool_calls` is absent
**Example:**
```typescript
// Source: PARSING.md section 2
function extractToolCalls(raw: string): OllamaToolCall[] | null {
  const strategies = [
    () => tryDirectParse(raw),
    () => tryDirectParse(stripProse(raw)),
    () => { const s = extractFirstJson(raw); return s ? tryDirectParse(s) : null; },
    () => { const s = extractFirstJson(raw); return s ? tryDirectParse(lenientRepair(s)) : null; },
    () => tryDirectParse(lenientRepair(stripProse(raw))),
    () => { const all = extractAllJsonObjects(raw); return all.length > 0 ? pickBestToolCall(all) : null; },
  ];

  for (const strategy of strategies) {
    const parsed = strategy();
    if (parsed !== null) {
      const normalized = normalizeToolCall(parsed);
      if (normalized) return [toOllamaToolCall(normalized)];
    }
  }
  return null;
}
```

### Pattern 3: Integration at loop.ts
**What:** Replace inline parse with `parseToolCall`, handle `ParseFailure` return
**When to use:** At the single integration point (line 137)
**Example:**
```typescript
// Source: CONTEXT.md D-06, D-07
// In loop.ts, replace:
//   const toolCalls = assistantMessage.tool_calls ?? parseContentToolCalls(assistantMessage.content);
// With:
const toolCalls = assistantMessage.tool_calls ??
  await parseToolCall(assistantMessage.content, chatFn);

// Check for ParseFailure
if (toolCalls && 'reason' in toolCalls) {
  // D-07: surface in AgentResult
  return { steps, finalMessage: "", iterationCount: iteration, stoppedByLimit: false, parseFailure: toolCalls };
}
```

### Anti-Patterns to Avoid
- **Throwing on parse failure:** Parser must NEVER throw. Return `ParseFailure` for all unrecoverable cases. The loop and MCP handler deal with it as data.
- **Retry logic in loop.ts:** All retry orchestration stays inside parser.ts (D-01). The loop makes a single call and gets back either tool calls or a failure.
- **Using `console.log`:** Project enforces `console.error`-only logging. Parser can log strategy attempts to stderr for debugging, never stdout.
- **Parsing `tool_calls[].function.arguments` as string:** Ollama returns arguments as a pre-parsed object. Do NOT `JSON.parse()` it. This is a known gotcha documented in STATE.md.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| N/A -- this phase IS the hand-rolled parser | -- | -- | The parser itself is the deliverable; PARSING.md provides all code patterns |

**Key insight:** This phase is unusual in that the parser IS the custom solution. The decision to hand-roll is correct because: (1) no npm package handles Ollama-specific tool call normalization, (2) the total code is ~200 lines, (3) every strategy is well-specified in PARSING.md with tested code.

## Common Pitfalls

### Pitfall 1: Tier 1 bypass when tool_calls present but malformed
**What goes wrong:** The native `tool_calls` array exists but contains entries with missing/empty arguments that fail downstream.
**Why it happens:** Some models emit `tool_calls` with arguments as an empty object or null.
**How to avoid:** Tier 1 should validate that each `tool_calls` entry has a non-empty `function.name` and that `function.arguments` is an object. If validation fails, fall through to Tier 2 text extraction on `content`.
**Warning signs:** Tool execution errors on `undefined` parameters with models that appear to support native tool calls.

### Pitfall 2: Greedy regex for JSON extraction
**What goes wrong:** Using `/{.*}/s` or similar greedy regex matches the first `{` to the LAST `}`, capturing too much text.
**Why it happens:** Natural instinct to use regex for substring extraction.
**How to avoid:** Use the balanced-brace depth-tracking walker from PARSING.md Strategy 3. It correctly handles nested objects.
**Warning signs:** Parse succeeding but producing nonsensical tool calls from concatenated JSON fragments.

### Pitfall 3: Single-quote replacement breaking string values
**What goes wrong:** Replacing `'` with `"` globally corrupts strings containing apostrophes (e.g., `"it's"`, `"don't"`).
**Why it happens:** Naive global replace without context awareness.
**How to avoid:** Only apply single-quote-to-double-quote replacement when the string contains NO double quotes at all (PARSING.md Strategy 4). This heuristic is safe because valid JSON always uses double quotes.
**Warning signs:** Parse errors on content strings that contain apostrophes.

### Pitfall 4: chatFn closure scope in loop.ts
**What goes wrong:** The `chatFn` callback passed to parser doesn't properly capture `host`, `model`, and current message context.
**Why it happens:** Closure over loop variables that change during iteration.
**How to avoid:** Define `chatFn` as a const closure over the fixed `host` and `model` values. The parser builds its own message array for correction prompts (it does NOT append to the main conversation history).
**Warning signs:** Retry calls going to the wrong model or host, or retry messages polluting the main conversation.

### Pitfall 5: Correction prompt polluting main conversation history
**What goes wrong:** Retry messages from the parser get appended to the main `messages` array in loop.ts, confusing subsequent turns.
**Why it happens:** Passing the actual messages array to the parser instead of letting it build independent correction prompts.
**How to avoid:** The parser builds its own correction message array per D-03. It receives `chatFn` (a thin wrapper around `chatWithOllama`), NOT the messages array. The retry conversation is isolated.
**Warning signs:** Model confusion after a successful retry -- the main conversation contains parse-error correction messages.

### Pitfall 6: ParseFailure type discrimination
**What goes wrong:** Code uses `if (!toolCalls)` to check for failure, but `ParseFailure` is truthy.
**Why it happens:** `ParseFailure` is an object, which is truthy in JavaScript.
**How to avoid:** Use `'reason' in result` or a type guard function `isParseFailure(result)` to discriminate between `OllamaToolCall[]` and `ParseFailure`.
**Warning signs:** TypeScript compiler errors about incompatible types, or runtime errors accessing `.length` on a `ParseFailure` object.

## Code Examples

### Normalization Map (PARSE-02)
```typescript
// Source: PARSING.md section 5
const NAME_ALIASES = ['name', 'tool_name', 'function', 'action', 'tool', 'function_name'];
const PARAMS_ALIASES = ['parameters', 'arguments', 'args', 'params', 'input', 'kwargs', 'inputs'];
```

### OllamaToolCall Shape (target output)
```typescript
// Source: src/ollama.ts -- existing type, parser must produce this shape
interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}
```

### Correction Prompt Template (PARSE-04)
```typescript
// Source: PARSING.md section 3.3
function buildCorrectionMessages(badOutput: string, parseError: string): OllamaMessage[] {
  return [
    { role: "user", content: `Your previous response could not be parsed as a tool call.

Here is what you returned:
<previous_response>
${badOutput}
</previous_response>

The parsing error was: ${parseError}

IMPORTANT: Your response must be ONLY a JSON object with no other text. Required format:
{"name": "<tool_name>", "parameters": {<key>: <value>}}

Do not include any explanation, preamble, or text outside the JSON object.` },
  ];
}
```

### Tool Signatures for Name Inference (PARSE-02 fallback)
```typescript
// Source: PARSING.md section 6, verified against src/tools.ts TOOL_DEFINITIONS
const TOOL_SIGNATURES: Record<string, string[]> = {
  read_file:  ['path'],
  write_file: ['path', 'content'],
  list_dir:   ['path'],
  bash:       ['command'],
};
```

### format: 'json' Addition (D-04)
```typescript
// Source: CONTEXT.md D-04, D-05
// In ollama.ts, add to OllamaChatRequest:
export interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  tools?: OllamaToolDefinition[];
  stream: false;
  format?: 'json';  // NEW: D-05
}

// In loop.ts, add at chatWithOllama call site:
const response = await chatWithOllama(host, {
  model,
  messages,
  tools: TOOL_DEFINITIONS,
  stream: false as const,
  format: 'json',  // NEW: D-04
});
```

### ParseFailure in AgentResult and index.ts (D-08)
```typescript
// In loop.ts AgentResult:
export interface AgentResult {
  steps: LoopStep[];
  finalMessage: string;
  iterationCount: number;
  stoppedByLimit: boolean;
  parseFailure?: ParseFailure;  // NEW: D-08
}

// In index.ts execution log:
if (result.parseFailure) {
  logLines.push(
    `[parse failed after ${result.parseFailure.attemptCount} attempts: ${result.parseFailure.reason}]`
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Basic JSON.parse only | Multi-strategy extraction pipeline | Standard practice in agentic frameworks (LangChain, LlamaIndex, smolagents) | Handles 90%+ of real model output vs ~50% with basic parse |
| Throw on parse failure | Structured error return | Modern pattern in all major frameworks | Caller can surface useful error instead of crash |
| No retry | Retry with specific error in correction prompt | LangChain RetryWithErrorOutputParser pattern | Recovers ~40% of transient parse failures |
| Text extraction only | Native tool_calls first, text extraction fallback | Ollama tool calling support (2024+) | Fast path for models that support native calling |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.1.0 |
| Config file | None (uses vitest defaults via package.json) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PARSE-01 | Native tool_calls used as primary path | unit | `npx vitest run src/__tests__/parser.test.ts -t "native"` | Wave 0 |
| PARSE-02 | Field name normalization handles aliases | unit | `npx vitest run src/__tests__/parser.test.ts -t "alias"` | Wave 0 |
| PARSE-03 | Text extraction handles prose, fences, commas, multiple objects | unit | `npx vitest run src/__tests__/parser.test.ts -t "extraction"` | Wave 0 |
| PARSE-04 | Up to 3 retries with correction prompt | unit | `npx vitest run src/__tests__/parser.test.ts -t "retry"` | Wave 0 |
| PARSE-05 | Structured ParseFailure after max retries | unit | `npx vitest run src/__tests__/parser.test.ts -t "ParseFailure"` | Wave 0 |
| PARSE-06 | All 14 test cases pass | unit | `npx vitest run src/__tests__/parser.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/parser.test.ts` -- covers PARSE-01 through PARSE-06 (14+ test cases)
- No framework install needed -- vitest is already configured

## Open Questions

1. **Tool name inference ambiguity: read_file vs list_dir**
   - What we know: Both `read_file` and `list_dir` have identical signatures (`['path']`). The `inferToolName` function from PARSING.md will match whichever comes first in the map.
   - What's unclear: Whether this ambiguity causes real problems in practice.
   - Recommendation: Return the first match (read_file). This only triggers when the tool name is completely missing, which is extremely rare. The retry prompt will ask the model to specify the tool name explicitly, which is a better recovery path.

2. **chatFn message format for retries**
   - What we know: D-03 says `chatFn` takes `OllamaMessage[]` and returns `OllamaMessage`. The parser builds correction prompts as messages.
   - What's unclear: Whether the correction messages should include the system prompt or just the user correction.
   - Recommendation: Include only the user correction message. The system prompt is already part of the main conversation; the retry is a targeted correction, not a full conversation restart. This keeps retry calls fast and focused.

## Sources

### Primary (HIGH confidence)
- `.planning/research/PARSING.md` -- Complete failure mode taxonomy, all 7 strategies with code, retry templates, 14 test cases, architecture recommendation
- `.planning/phases/03-robust-parsing-pipeline/03-CONTEXT.md` -- All 9 locked decisions (D-01 through D-09)
- `src/loop.ts` -- Current integration point (line 137), existing `parseContentToolCalls` to replace
- `src/ollama.ts` -- `OllamaChatRequest` interface to extend, `OllamaToolCall` type as target shape
- `src/tools.ts` -- `TOOL_DEFINITIONS` with parameter schemas for tool signature inference
- `src/index.ts` -- `AgentResult` formatting to extend with `parseFailure`

### Secondary (MEDIUM confidence)
- PARSING.md framework analysis (LangChain, LlamaIndex, smolagents) -- patterns verified across multiple open-source implementations but specific API details may have evolved

### Tertiary (LOW confidence)
- None -- all findings verified against project source code and PARSING.md research document

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, pure TypeScript
- Architecture: HIGH -- all decisions locked in CONTEXT.md, complete code patterns in PARSING.md
- Pitfalls: HIGH -- based on actual code analysis of loop.ts, ollama.ts, and known JavaScript/TypeScript gotchas
- Test cases: HIGH -- 14 canonical cases provided verbatim in PARSING.md section 7

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable -- no external dependencies to drift)
