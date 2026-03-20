# LLM Tool Call Output Parsing: Patterns for Robustness

**Domain:** Agentic LLM systems — tool/function call output parsing
**Researched:** 2026-03-20
**Overall confidence:** HIGH (core engineering problem with well-established patterns across multiple open-source frameworks)

---

## Context for This Project

This document addresses the hardest reliability problem in `local-agent-mcp`: local Ollama models
(qwen2.5-coder, llama3.1, mistral) are inconsistent at producing valid tool call JSON. Unlike
GPT-4 or Claude, these models were not RLHF-trained specifically to produce schema-conformant
tool call output on every response. The parser is the reliability boundary between "model said
something" and "agent can act on it."

---

## 1. Failure Mode Taxonomy

Understanding failure modes precisely determines which recovery strategies apply.

### 1.1 JSON Structure Failures

**Extra text around JSON — the most common failure**

The model outputs valid JSON but wraps it in prose. This is extremely common with instruction-
following models that were trained to explain their actions.

```
// Model output:
"Sure, I'll read that file for you. Here's my tool call:
{\"name\": \"read_file\", \"parameters\": {\"path\": \"/src/index.ts\"}}
Let me know if you need anything else!"
```

Recovery: extract the JSON substring before parsing.

**Markdown code fences**

Models fine-tuned on GitHub data frequently wrap JSON in code blocks.

```
// Model output:
```json
{"name": "read_file", "parameters": {"path": "/src/index.ts"}}
```
```

Recovery: strip ` ```json ` / ` ``` ` wrappers before parsing. Also occurs as ` ```tool_call `
or plain ` ``` `.

**Multiple JSON objects in one response**

Models sometimes output reasoning JSON followed by tool call JSON, or multiple tool calls
concatenated without an array wrapper.

```
// Model output:
{"thinking": "I need to read the file first"}
{"name": "read_file", "parameters": {"path": "/src/index.ts"}}
```

Recovery: extract all JSON objects, identify the one matching the tool call schema.

**Truncated / incomplete JSON**

Occurs when the model hits its context window limit mid-generation, or when streaming is used
and the connection drops.

```
// Model output:
{"name": "read_file", "parameters": {"path": "/src/index.t
```

Recovery: cannot be reliably recovered from. Trigger a retry with a shorter prompt or smaller
parameter set.

**Nested stringified JSON**

The model double-encodes the value — common when the model has seen examples where JSON was
passed as a string argument.

```json
{"name": "bash", "parameters": "{\"command\": \"ls -la\"}"}
```

Recovery: detect when a parameter value is a string that parses as JSON, then parse it.

### 1.2 Schema Conformance Failures

**Wrong field names — extremely common across local models**

Different training corpora use different conventions. The same concept appears as:

```
// Naming variants seen in the wild:
{"tool_name": ...}        // vs {"name": ...}
{"function": ...}         // vs {"name": ...}
{"action": ...}           // vs {"name": ...}
{"tool": ...}             // vs {"name": ...}

{"args": ...}             // vs {"parameters": ...} or {"arguments": ...}
{"input": ...}            // vs {"parameters": ...}
{"params": ...}           // vs {"parameters": ...}
{"kwargs": ...}           // vs {"parameters": ...}
```

Recovery: maintain a normalization map of known aliases.

**Wrong nesting depth**

Parameters hoisted to the top level instead of nested:

```json
// Expected:
{"name": "read_file", "parameters": {"path": "/src/index.ts"}}

// Actual (flattened):
{"name": "read_file", "path": "/src/index.ts"}
```

Recovery: if `parameters` key is missing but other keys match known parameter names for the
identified tool, hoist them into a `parameters` object.

**Array instead of object for parameters**

```json
// Actual:
{"name": "read_file", "parameters": ["/src/index.ts"]}
```

Recovery: if tool schema has ordered parameters and the array length matches, map by position.

**Wrong value types**

```json
// Expected string, got number:
{"name": "read_file", "parameters": {"path": 42}}

// Expected boolean, got string:
{"name": "bash", "parameters": {"safe_mode": "true"}}
```

Recovery: coerce with awareness of the target schema type.

**Missing required fields**

```json
// Missing "name" entirely:
{"parameters": {"path": "/src/index.ts"}}

// Missing required parameter:
{"name": "write_file", "parameters": {"path": "/out.txt"}}
// (content field missing)
```

Recovery for missing name: attempt to infer tool name from parameter shapes. Recovery for
missing required param: cannot execute safely — must retry or skip.

### 1.3 Encoding and Formatting Failures

**Unescaped characters in strings**

```json
{"name": "bash", "parameters": {"command": "echo "hello""}}
```
(The inner quotes are unescaped, breaking the JSON.)

Recovery: attempt to repair with heuristic re-escaping — risky for bash commands, safer for
path strings.

**Single quotes instead of double quotes**

Python-style output from models trained heavily on Python:

```json
{'name': 'read_file', 'parameters': {'path': '/src/index.ts'}}
```

Recovery: replace single quotes with double quotes (carefully — not inside string values).
Use a regex that's aware of quote context, or use a lenient parser.

**Trailing commas**

```json
{"name": "read_file", "parameters": {"path": "/src/index.ts",}}
```

Recovery: strip trailing commas before parsing. Standard JSON does not allow them; JavaScript
does.

**Comments in JSON**

```json
// Read the source file
{"name": "read_file", "parameters": {"path": "/src/index.ts"}}
```

Recovery: strip `//` and `/* */` comments before parsing.

**Numeric keys**

```json
{"name": "list_dir", "parameters": {0: "/src"}}
```

Recovery: quote numeric keys.

---

## 2. Extraction Strategies (Best-Effort)

These form a pipeline: try each strategy in order, return on first success.

### Strategy 1: Direct JSON.parse

Always try first — cheapest, and some models get it right every time.

```typescript
function tryDirectParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw.trim());
  } catch {
    return null;
  }
}
```

### Strategy 2: Strip Prose Wrappers

Remove common model chattiness patterns before re-attempting parse.

```typescript
function stripProse(raw: string): string {
  let s = raw.trim();
  // Remove markdown code fences
  s = s.replace(/^```(?:json|tool_call|javascript|js)?\s*/i, '');
  s = s.replace(/\s*```\s*$/i, '');
  // Remove common preamble patterns
  s = s.replace(/^[^{[]*(?=[{[])/s, '');
  // Remove common postamble patterns
  s = s.replace(/(?<=[}\]])[^}\]]*$/s, '');
  return s.trim();
}
```

### Strategy 3: JSON Substring Extraction (Regex)

Find the first balanced JSON object or array in the output. This is the workhorse for
"extra text around JSON" failures.

```typescript
function extractFirstJson(raw: string): string | null {
  // Find the first { or [
  const startObj = raw.indexOf('{');
  const startArr = raw.indexOf('[');

  let start: number;
  if (startObj === -1 && startArr === -1) return null;
  if (startObj === -1) start = startArr;
  else if (startArr === -1) start = startObj;
  else start = Math.min(startObj, startArr);

  const opener = raw[start];
  const closer = opener === '{' ? '}' : ']';

  // Walk forward tracking depth
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === opener) depth++;
    if (ch === closer) {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null; // unbalanced
}
```

**Why not a greedy regex like `/{.*}/s`?** It fails on nested objects because `.` is greedy
and the `}` quantifier matches the last `}` in the string rather than the first balanced one.
The depth-tracking walk above is the correct approach.

### Strategy 4: Lenient Pre-Processing

Apply a set of heuristic repairs before re-attempting parse.

```typescript
function lenientRepair(raw: string): string {
  let s = raw;

  // Trailing commas before } or ]
  s = s.replace(/,(\s*[}\]])/g, '$1');

  // Single quotes to double quotes (careful: only at key/value boundaries)
  // This is heuristic and can break on values containing apostrophes.
  // Only apply if the string contains no double quotes at all.
  if (!s.includes('"') && s.includes("'")) {
    s = s.replace(/'/g, '"');
  }

  // Strip JS-style comments
  s = s.replace(/\/\/[^\n]*/g, '');
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');

  // Unquoted keys (e.g. {name: "read_file"} -> {"name": "read_file"})
  s = s.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');

  return s;
}
```

### Strategy 5: Schema-Guided Key Normalization

After successfully parsing JSON, normalize the structure to the expected schema.

```typescript
interface ToolCall {
  name: string;
  parameters: Record<string, unknown>;
}

const NAME_ALIASES = ['name', 'tool_name', 'function', 'action', 'tool', 'function_name'];
const PARAMS_ALIASES = ['parameters', 'arguments', 'args', 'params', 'input', 'kwargs', 'inputs'];

function normalizeToolCall(raw: unknown): ToolCall | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  // Resolve name
  let name: string | undefined;
  for (const alias of NAME_ALIASES) {
    if (typeof obj[alias] === 'string') { name = obj[alias] as string; break; }
  }

  // Resolve parameters
  let parameters: Record<string, unknown> | undefined;
  for (const alias of PARAMS_ALIASES) {
    const val = obj[alias];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      parameters = val as Record<string, unknown>;
      break;
    }
    // Handle double-stringified: parameters is a JSON string
    if (typeof val === 'string') {
      try { parameters = JSON.parse(val) as Record<string, unknown>; break; } catch { /**/ }
    }
  }

  // Fallback: parameters hoisted to top level
  if (!parameters && name) {
    const residual = { ...obj };
    for (const alias of [...NAME_ALIASES, ...PARAMS_ALIASES]) delete residual[alias];
    if (Object.keys(residual).length > 0) parameters = residual;
  }

  if (!name) return null;
  return { name, parameters: parameters ?? {} };
}
```

### Strategy 6: Tool Name Inference from Parameters

When the name field is missing but parameters are present, infer the tool from known
parameter signatures.

```typescript
const TOOL_SIGNATURES: Record<string, string[]> = {
  read_file:  ['path'],
  write_file: ['path', 'content'],
  list_dir:   ['path'],
  bash:       ['command'],
};

function inferToolName(params: Record<string, unknown>): string | null {
  const keys = new Set(Object.keys(params));
  for (const [tool, required] of Object.entries(TOOL_SIGNATURES)) {
    if (required.every(k => keys.has(k))) return tool;
  }
  return null;
}
```

### Strategy 7: Multiple JSON Objects — Pick Best Match

When the response contains multiple JSON objects (reasoning + tool call), parse all of them
and return the one that best matches a tool call schema.

```typescript
function extractAllJsonObjects(raw: string): unknown[] {
  const results: unknown[] = [];
  let remaining = raw;
  while (true) {
    const fragment = extractFirstJson(remaining);
    if (!fragment) break;
    try { results.push(JSON.parse(fragment)); } catch { /**/ }
    const idx = remaining.indexOf(fragment) + fragment.length;
    remaining = remaining.slice(idx);
  }
  return results;
}

function pickBestToolCall(candidates: unknown[]): ToolCall | null {
  // Prefer objects that normalize successfully and have a recognized tool name
  const knownTools = new Set(Object.keys(TOOL_SIGNATURES));
  for (const candidate of candidates) {
    const normalized = normalizeToolCall(candidate);
    if (normalized && knownTools.has(normalized.name)) return normalized;
  }
  // Fallback: first that normalizes at all
  for (const candidate of candidates) {
    const normalized = normalizeToolCall(candidate);
    if (normalized) return normalized;
  }
  return null;
}
```

### Complete Pipeline

```typescript
function parseToolCall(raw: string): ToolCall | null {
  const attempts = [
    () => tryDirectParse(raw),
    () => tryDirectParse(stripProse(raw)),
    () => { const s = extractFirstJson(raw); return s ? tryDirectParse(s) : null; },
    () => { const s = extractFirstJson(raw); return s ? tryDirectParse(lenientRepair(s)) : null; },
    () => tryDirectParse(lenientRepair(stripProse(raw))),
    () => { const all = extractAllJsonObjects(raw); return all.length ? pickBestToolCall(all) : null; },
  ];

  for (const attempt of attempts) {
    const parsed = attempt();
    if (parsed !== null) {
      const normalized = normalizeToolCall(parsed);
      if (normalized) return normalized;
    }
  }
  return null;
}
```

---

## 3. Retry Strategies

### 3.1 When to Retry vs When to Fail

| Condition | Action | Reason |
|-----------|--------|--------|
| Unparseable after all strategies | Retry with correction prompt | Model can self-correct |
| Parsed but wrong tool name | Retry with correction prompt | Name might be hallucinated |
| Parsed but missing required parameter | Retry with correction prompt | Model might fill in the gap |
| Truncated JSON (no closing brace found) | Retry with shorter prompt or reduced context | Context window issue |
| Valid parse, valid schema, valid tool name | Execute | No retry needed |
| 3+ retries failed | Return structured error to caller | Avoid infinite loops |

### 3.2 Retry Budget

For production use with local models:

- **Max retries: 3** — beyond 3, the model is consistently confused; more retries waste time
- **Retry delay: 0ms** — no benefit from sleeping; the model is stateless between calls
- **Exponential backoff: not applicable** — local inference is not rate-limited

The LangChain `RetryWithErrorOutputParser` uses 1 retry by default. LlamaIndex uses 3.
For local models that are less reliable, 3 is the practical ceiling before the added latency
hurts UX more than the occasional recovery helps.

### 3.3 Self-Correction Prompt Patterns

The correction prompt must tell the model exactly what was wrong. Vague prompts like
"try again" produce similar bad output. Specific prompts with the error and expected format
work significantly better.

**Template: malformed JSON**

```typescript
function buildRetryPrompt(originalPrompt: string, badOutput: string, parseError: string): string {
  return `${originalPrompt}

---
Your previous response could not be parsed as a tool call. Here is what you returned:

<previous_response>
${badOutput}
</previous_response>

The parsing error was: ${parseError}

IMPORTANT: Your response must be ONLY a JSON object with no other text. Required format:

{"name": "<tool_name>", "parameters": {<key>: <value>}}

Do not include any explanation, preamble, or text outside the JSON object.`;
}
```

**Template: wrong field names**

```typescript
function buildFieldRetryPrompt(originalPrompt: string, badOutput: string, missingFields: string[]): string {
  return `${originalPrompt}

---
Your previous response was parsed as JSON but did not match the required schema. Missing or incorrect fields: ${missingFields.join(', ')}

Your previous response:
<previous_response>
${badOutput}
</previous_response>

Required JSON structure:
{"name": "tool_name_here", "parameters": {"param1": "value1"}}

The "name" field must be exactly one of: read_file, write_file, list_dir, bash
Respond with ONLY the JSON object and nothing else.`;
}
```

**Template: missing required parameter**

```typescript
function buildMissingParamRetryPrompt(
  originalPrompt: string,
  toolName: string,
  missingParam: string,
  schema: Record<string, string>
): string {
  const paramDesc = Object.entries(schema)
    .map(([k, v]) => `  "${k}": ${v}`)
    .join(',\n');
  return `${originalPrompt}

---
Your previous response called tool "${toolName}" but was missing the required parameter "${missingParam}".

Required format for ${toolName}:
{
  "name": "${toolName}",
  "parameters": {
${paramDesc}
  }
}

Respond with ONLY the complete JSON object including all required parameters.`;
}
```

### 3.4 Retry State Machine

```
INITIAL_CALL
    |
    v
[Parse response]
    |
    +-- SUCCESS --> [Execute tool] --> DONE
    |
    +-- FAIL (attempt 1) --> [Build correction prompt] --> [Call model]
                                                               |
                                                           [Parse response]
                                                               |
                                                               +-- SUCCESS --> [Execute tool] --> DONE
                                                               |
                                                               +-- FAIL (attempt 2) --> [Call model again]
                                                                                           |
                                                                                       [Parse response]
                                                                                           |
                                                                                           +-- SUCCESS --> DONE
                                                                                           |
                                                                                           +-- FAIL (attempt 3) --> RETURN ERROR
```

### 3.5 What to Include in the Error Return

When retries are exhausted, return a structured error rather than throwing:

```typescript
interface ParseFailure {
  type: 'parse_failure';
  attempts: number;
  lastRawOutput: string;
  parseErrors: string[];
  suggestion: string;
}
```

This allows the calling agent (Claude Code) to surface a useful message rather than a
raw stack trace.

---

## 4. How Existing Frameworks Handle This

### 4.1 LangChain

LangChain's output parsing system has three relevant layers:

**BaseOutputParser + parse()**
The base class defines `parse(text: string): T` which throws `OutputParserException` on
failure. This exception carries the bad output and an optional `sendToLLM` flag.

**RetryOutputParser**
Wraps any parser and retries on `OutputParserException`. On failure, it calls the LLM again
with a prompt template that includes:
1. The original instructions
2. The failed completion
3. An error message
4. An instruction to "try again"

The default retry count is 1. The prompt template used:

```
Prompt: {prompt}
Completion: {completion}
Above, the Completion did not satisfy the constraints given in the Prompt.
Error: {error}
Please try again:
```

**RetryWithErrorOutputParser**
Same as `RetryOutputParser` but includes the specific parse error in the correction prompt.
This consistently outperforms blind retry.

**Key LangChain insight:** LangChain separates parsing from schema validation. The parser
extracts structure; a Pydantic/Zod validator then validates schema. Failures at either stage
can trigger retry. This two-stage design means extraction errors (malformed JSON) and schema
errors (wrong fields) get different treatment.

**JsonOutputFunctionsParser / JsonOutputToolsParser**
LangChain's tool-specific parsers handle the OpenAI function call format:
```json
{"function_call": {"name": "...", "arguments": "{...}"}}
```
Note: `arguments` is a JSON-encoded STRING in OpenAI's format, not a nested object. These
parsers handle the double-parsing automatically. This is a known gotcha — Ollama sometimes
copies this convention.

### 4.2 LlamaIndex

LlamaIndex takes a more structured approach with its `FunctionCallingAgentWorker`:

**ToolSelection parsing** uses the native API tool call format when available (OpenAI-
compatible), but has fallback parsing for models that output free-text tool calls.

**ReActAgent** (relevant for less-capable models) parses a structured text format instead
of JSON:

```
Thought: I need to read the file
Action: read_file
Action Input: {"path": "/src/index.ts"}
```

This format is more robust for models that struggle with JSON because:
1. Each field is on its own line (no nesting complexity)
2. Only the `Action Input` field needs JSON parsing
3. Parsing can be done with simple line splitting

The `Action Input` value is parsed with `json5` which is lenient about trailing commas and
single quotes. LlamaIndex's retry logic runs up to 3 attempts.

**OutputParser with program synthesis:** LlamaIndex's `PydanticOutputParser` can use
an LLM to "fix" bad output — it calls the model again with the schema and bad output
asking it to produce a corrected version. This is expensive but effective.

### 4.3 smolagents (Hugging Face)

smolagents targets smaller, less capable models and is most relevant to this project's use case.

**CodeAgent approach:** Instead of JSON tool calls, smolagents' `CodeAgent` has the model
output Python code that calls tool functions directly:

```python
result = read_file(path="/src/index.ts")
```

The framework parses Python code, not JSON. Python has a much more forgiving AST for
partial parsing. This entirely sidesteps JSON parsing failures.

**ToolCallingAgent (JSON-based):** For models that support it, smolagents parses a
custom format:

```
<tool_call>
{"tool_name": "read_file", "tool_arguments": {"path": "/src/index.ts"}}
</tool_call>
```

Key differences from raw JSON:
1. The `<tool_call>` tag acts as a reliable delimiter — no need for balanced-brace detection
2. `tool_name` and `tool_arguments` (not `name`/`parameters`) — smolagents normalizes these
3. Content between tags is parsed with `json5` for leniency

**Error reporting to model:** smolagents feeds tool execution errors back in the next message,
not just parse errors. The model learns from `AttributeError: read_file requires 'path'`
in the tool result stream.

**Key smolagents insight:** Surrounding JSON with a structured tag (like XML) makes extraction
trivial and reliable. The tag acts as a parse boundary that prose text cannot accidentally
create.

### 4.4 AutoGen (Microsoft)

AutoGen's `ConversableAgent` uses a different philosophy: it does not try to parse tool calls
from raw LLM output at all in its default mode. It uses OpenAI's native function calling API
(structured outputs) when available, and for chat-based interaction, it parses tool calls
embedded in the conversation flow using its own message format.

For fallback scenarios, AutoGen checks if the message contains a `function_call` field in the
response JSON from the API (OpenAI format) rather than text-extraction from prose.

**Key AutoGen insight:** Rely on the model API's native tool call format whenever possible,
and make text-extraction the last resort, not the primary path.

---

## 5. Structured Output / Grammar-Constrained Generation

This is the correct long-term solution and should be used wherever the model supports it.

### 5.1 Ollama's `format` Parameter

Ollama supports constrained generation via the `format` parameter in its API. As of Ollama
0.3+, this accepts either `"json"` (free-form JSON) or a full JSON Schema object.

**JSON mode (free-form):**

```typescript
const response = await ollama.chat({
  model: 'qwen2.5-coder',
  messages: [...],
  format: 'json',
});
```

This guarantees the output is valid JSON but does not guarantee it matches any particular
schema. It prevents the most common failures (malformed JSON, extra prose) but not schema
failures (wrong field names, missing required fields).

**JSON Schema mode (grammar-constrained):**

```typescript
const toolCallSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      enum: ['read_file', 'write_file', 'list_dir', 'bash'],
    },
    parameters: {
      type: 'object',
    },
  },
  required: ['name', 'parameters'],
};

const response = await ollama.chat({
  model: 'qwen2.5-coder',
  messages: [...],
  format: toolCallSchema,
});
```

With grammar-constrained generation, the model's token sampling is masked at each step so
it cannot produce a token that would violate the schema. This eliminates:
- Malformed JSON
- Wrong field names for top-level fields
- Missing required fields
- Wrong types for typed fields

**What grammar constraints do NOT fix:**
- The model producing a valid tool name but wrong parameters (e.g., `read_file` with a
  `content` parameter instead of `path`)
- The model filling in a valid-looking but semantically wrong value
- Models that ignore the format parameter entirely (some fine-tunes)

**Confidence level:** MEDIUM. Grammar-constrained generation via Ollama's format parameter
is documented and available, but the specific models (qwen2.5-coder, llama3.1, mistral)
vary in how well they respond to it. Some models produce valid JSON but semantically
nonsensical content when constrained too tightly because they're fighting against their
sampling distribution. Testing is required per model.

### 5.2 llama.cpp Grammar (GBNF)

Under the hood, Ollama uses llama.cpp's GBNF (GGML BNF) grammar system for constrained
generation. You can specify custom grammars directly via the llama.cpp server API if needed
for more control than JSON Schema allows.

This is out of scope for Ollama's public API but worth knowing for debugging.

### 5.3 Recommended Strategy: Structured Output + Fallback Parsing

Do not choose between structured output and robust text parsing — use both:

```
IF model supports format parameter AND model handles it well:
  Use format: jsonSchema → parse normally → done
  (still run normalizeToolCall for safety)

ELSE:
  Run full extraction pipeline (Strategies 1–7 above)
  THEN retry with correction prompt up to 3 times
```

This gives you the best reliability with the lowest latency on capable models, while
maintaining correctness on weaker models.

---

## 6. What "Robust" Means in Practice

A production-ready tool call parser for local models must handle all of the following:

### Must Handle (P0 — will occur in normal use)

| Failure Mode | Strategy |
|---|---|
| Extra prose around JSON | Strategy 2+3: strip wrappers, extract first JSON |
| Markdown code fences | Strategy 2: strip fences |
| Trailing commas | Strategy 4: lenient repair |
| Field name aliases (tool_name, args, etc.) | Strategy 5: key normalization |
| Double-stringified parameters | Strategy 5: JSON.parse on string values |
| Multiple JSON objects in response | Strategy 7: pick best match |

### Should Handle (P1 — occurs with specific models or prompts)

| Failure Mode | Strategy |
|---|---|
| Single quotes | Strategy 4: heuristic replace |
| Unquoted keys | Strategy 4: regex key quoting |
| Parameters hoisted to top level | Strategy 5: residual hoist |
| Array parameters (positional) | Strategy 5: position mapping |
| Name inference from parameter shape | Strategy 6: signature matching |

### Must Fail Gracefully (P2 — cannot recover, must retry)

| Failure Mode | Action |
|---|---|
| Truncated JSON | Trigger retry with note about context length |
| Completely unparseable output | Trigger retry with correction prompt |
| Missing required parameters | Trigger retry with schema-specific prompt |
| Wrong tool name after normalization | Trigger retry with available tools listed |

### Should Never Do

- Silently execute a partially-matched tool call with guessed parameters
- Retry more than 3 times (latency cost exceeds value)
- Throw raw JSON parse errors to the caller (always wrap in structured failure)
- Silently drop tool calls that look like tool calls but can't be normalized

---

## 7. Practical Test Cases

These are the exact strings to test your parser against. A robust parser passes all of them.

```typescript
const TEST_CASES = [
  // P0: Extra prose
  `Sure! Here's the tool call: {"name": "read_file", "parameters": {"path": "/src/index.ts"}} Hope that helps!`,

  // P0: Markdown fence
  `\`\`\`json\n{"name": "read_file", "parameters": {"path": "/src/index.ts"}}\n\`\`\``,

  // P0: Trailing comma
  `{"name": "read_file", "parameters": {"path": "/src/index.ts",},}`,

  // P0: Field alias - tool_name
  `{"tool_name": "read_file", "args": {"path": "/src/index.ts"}}`,

  // P0: Field alias - function/arguments
  `{"function": "read_file", "arguments": {"path": "/src/index.ts"}}`,

  // P0: Double-stringified parameters
  `{"name": "read_file", "parameters": "{\\"path\\": \\"/src/index.ts\\"}"}`,

  // P0: Multiple objects (reasoning + tool call)
  `{"thinking": "I need to check the file"}\n{"name": "read_file", "parameters": {"path": "/src/index.ts"}}`,

  // P1: Single quotes
  `{'name': 'read_file', 'parameters': {'path': '/src/index.ts'}}`,

  // P1: Unquoted keys
  `{name: "read_file", parameters: {path: "/src/index.ts"}}`,

  // P1: Parameters hoisted to top level
  `{"name": "read_file", "path": "/src/index.ts"}`,

  // P1: Name inference from params (write_file signature = path + content)
  `{"parameters": {"path": "/out.txt", "content": "hello world"}}`,

  // P1: JS-style comments
  `// Call the read_file tool\n{"name": "read_file", "parameters": {"path": "/src/index.ts"}}`,

  // P2: Truncated (must retry, cannot recover)
  `{"name": "read_file", "parameters": {"path": "/src/index.t`,

  // P2: Completely unparseable (must retry)
  `I will read the file at /src/index.ts for you.`,
];
```

---

## 8. Ollama Native Tool Call API

Ollama's `/api/chat` endpoint supports a `tools` field for models that natively implement
OpenAI-compatible function calling. When the model outputs a tool call through the native
API (not free text), the response looks like:

```json
{
  "message": {
    "role": "assistant",
    "content": "",
    "tool_calls": [
      {
        "function": {
          "name": "read_file",
          "arguments": {
            "path": "/src/index.ts"
          }
        }
      }
    ]
  }
}
```

Key differences from text parsing:
- `tool_calls` is an array — supports multiple tool calls in one response
- `arguments` is a parsed object, NOT a JSON string (unlike OpenAI's API where it is a string)
- `content` is empty when tool calls are present
- The structure is deterministic from the API

**When to use native tool calls vs text parsing:**

| Condition | Use |
|---|---|
| Model is qwen2.5-coder, llama3.1:8b+, mistral:7b+ | Try native tool calls first |
| `tool_calls` array is present and non-empty | Parse from `tool_calls`, skip text parsing |
| `tool_calls` is absent but content is non-empty | Fall through to text extraction pipeline |
| Model is a small fine-tune with unpredictable behavior | Skip native, use text extraction + format:json |

Always check `message.tool_calls` before attempting text extraction. The native path is
always more reliable when present.

---

## 9. Implementation Architecture Recommendation

For `local-agent-mcp`, the recommended architecture is:

```
OllamaClient.chat(messages, tools)
    |
    v
[Check message.tool_calls]
    |
    +-- tool_calls present --> [Parse native format] --> normalizeToolCall() --> EXECUTE
    |
    +-- tool_calls absent, content non-empty --> [Text extraction pipeline]
                                                       |
                                                    [parseToolCall(content)]
                                                       |
                                                       +-- SUCCESS --> EXECUTE
                                                       |
                                                       +-- FAIL --> [buildRetryPrompt()]
                                                                       |
                                                                   [Retry up to 3x]
                                                                       |
                                                                       +-- SUCCESS --> EXECUTE
                                                                       |
                                                                       +-- FAIL (3x) --> RETURN ParseFailure
```

This means the parser has three tiers:
1. **Native API tier** — fastest, most reliable, use whenever available
2. **Text extraction tier** — covers models that output tool calls in prose
3. **Retry tier** — covers transient failures and model confusion

Each tier degrades gracefully to the next.

---

## 10. Key References

Sources for this document (from training knowledge through August 2025):

- LangChain `RetryOutputParser` and `RetryWithErrorOutputParser` source (Python) — patterns
  and prompt templates drawn from the langchain-ai/langchain repository
- LlamaIndex `ReActAgent` output parser — text format (Thought/Action/Action Input)
- smolagents `ToolCallingAgent` implementation — XML tag delimiters, json5 parsing
- Ollama API documentation — `format` parameter, `tool_calls` response structure
- AutoGen `ConversableAgent` — API-first design philosophy
- Practical experience documented in GitHub issues across these frameworks for models like
  llama3.1, mistral, qwen2.5-coder running through Ollama

**Confidence notes:**
- Failure mode taxonomy: HIGH (these patterns are observed consistently across the community)
- Extraction strategies: HIGH (established techniques, well-tested in open source)
- Retry prompt templates: MEDIUM (phrasing details vary; test against target models)
- Ollama JSON Schema format: MEDIUM (documented and available, but model-specific behavior
  requires empirical testing — particularly for smaller quantized variants)
- Framework internals: MEDIUM (based on training data through August 2025; APIs may have
  changed since)
