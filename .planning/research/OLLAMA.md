# Ollama Tool Calling Research

**Project:** local-agent-mcp
**Researched:** 2026-03-20
**Overall Confidence:** MEDIUM
**Note:** WebFetch and WebSearch tools were unavailable during this research session. Findings are drawn from training data (knowledge cutoff August 2025) cross-referenced with the official Ollama API spec structure I have high confidence in. Flag all model-specific behavioral claims for live validation before shipping.

---

## 1. API Format: Defining Tools in a Chat Request

Ollama's `/api/chat` endpoint accepts a `tools` array in the OpenAI-compatible format. Tool definitions follow JSON Schema for parameters.

**Confidence: HIGH** — this is the stable, documented interface as of Ollama 0.3.x+.

### Endpoint

```
POST http://localhost:11434/api/chat
```

### Request Structure

```json
{
  "model": "qwen2.5-coder:7b",
  "messages": [
    {
      "role": "user",
      "content": "What files are in the /tmp directory?"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "list_dir",
        "description": "List the contents of a directory",
        "parameters": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "description": "The directory path to list"
            }
          },
          "required": ["path"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "read_file",
        "description": "Read the contents of a file",
        "parameters": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "description": "The file path to read"
            }
          },
          "required": ["path"]
        }
      }
    }
  ],
  "stream": false
}
```

### Key Fields

| Field | Type | Notes |
|-------|------|-------|
| `tools` | array | Array of tool definitions. Optional — omit if no tools needed. |
| `tools[].type` | string | Always `"function"` in current API |
| `tools[].function.name` | string | Tool identifier — model uses this in its response |
| `tools[].function.description` | string | Natural language description — critical for model selection |
| `tools[].function.parameters` | object | JSON Schema object describing the tool's inputs |
| `stream` | boolean | Set to `false` for simpler tool call handling; streaming with tool calls is more complex |

### Important: `stream: false` vs Streaming

For a tool loop, **always use `stream: false`** initially. Streaming tool calls require reassembling chunks, and the tool_call deltas are more complex to parse. The non-streaming response gives you the full tool call in one JSON blob.

---

## 2. Response Structure When Model Returns a Tool Call

When the model decides to call a tool, the response `message.content` will be empty (or null) and `message.tool_calls` will be populated.

**Confidence: HIGH** — this is the documented Ollama response structure.

### Response Body

```json
{
  "model": "qwen2.5-coder:7b",
  "created_at": "2025-01-15T10:30:00.000Z",
  "message": {
    "role": "assistant",
    "content": "",
    "tool_calls": [
      {
        "function": {
          "name": "list_dir",
          "arguments": {
            "path": "/tmp"
          }
        }
      }
    ]
  },
  "done_reason": "stop",
  "done": true
}
```

### Key Observations

1. **`message.content` is `""` (empty string) when tool_calls are present** — not null, not absent. Always check `tool_calls` length, not just whether `content` is truthy.

2. **`arguments` is a JSON object, not a string** — unlike OpenAI's API where `arguments` is a JSON-encoded string, Ollama returns `arguments` as a pre-parsed object. This is a critical difference if you're adapting OpenAI client code.

3. **No `id` field on tool calls** — Ollama does not include a `tool_call_id` on individual tool calls. This is relevant for the tool result message format (see Section 3).

4. **Multiple tool calls are possible** — a single response can include multiple entries in `tool_calls`. The model may request several tools in parallel.

```json
{
  "message": {
    "role": "assistant",
    "content": "",
    "tool_calls": [
      {
        "function": {
          "name": "read_file",
          "arguments": { "path": "/tmp/foo.txt" }
        }
      },
      {
        "function": {
          "name": "read_file",
          "arguments": { "path": "/tmp/bar.txt" }
        }
      }
    ]
  }
}
```

### Finish Reason

- `done_reason: "stop"` — model finished normally (tool call or final answer)
- There is no distinct `done_reason: "tool_calls"` in Ollama's API (unlike OpenAI's `finish_reason: "tool_calls"`). You detect tool use by checking whether `message.tool_calls` is non-empty.

---

## 3. Tool Result Message Format

After executing the tool, you append the assistant's tool_call message and a tool result message to the conversation, then re-send.

**Confidence: HIGH** — this is the standard Ollama chat continuation pattern.

### Appending Tool Results

```json
{
  "model": "qwen2.5-coder:7b",
  "messages": [
    {
      "role": "user",
      "content": "What files are in the /tmp directory?"
    },
    {
      "role": "assistant",
      "content": "",
      "tool_calls": [
        {
          "function": {
            "name": "list_dir",
            "arguments": { "path": "/tmp" }
          }
        }
      ]
    },
    {
      "role": "tool",
      "content": "foo.txt\nbar.txt\nbaz.log"
    }
  ],
  "tools": [ ... ],
  "stream": false
}
```

### Critical Details for Tool Result Messages

1. **Role is `"tool"`** — not `"function"`, not `"user"`.

2. **Content is a string** — even if the tool returns structured data, stringify it. The model reads it as plain text.

3. **No `tool_call_id` required** — Ollama does not require the tool result to reference a specific call ID. Results are implicitly matched by position/order in the conversation.

4. **Multiple tool calls → multiple tool messages** — if the assistant made two tool calls, append two separate `role: "tool"` messages in the same order as the calls appeared.

```json
{
  "messages": [
    { "role": "user", "content": "Read both files." },
    {
      "role": "assistant",
      "content": "",
      "tool_calls": [
        { "function": { "name": "read_file", "arguments": { "path": "/tmp/foo.txt" } } },
        { "function": { "name": "read_file", "arguments": { "path": "/tmp/bar.txt" } } }
      ]
    },
    { "role": "tool", "content": "Contents of foo.txt: Hello world" },
    { "role": "tool", "content": "Contents of bar.txt: Goodbye world" }
  ]
}
```

5. **Tool error results** — for failed tool executions, still send a `role: "tool"` message with the error text. Do not omit it — a missing tool result can cause model confusion or looping.

```json
{ "role": "tool", "content": "ERROR: Permission denied reading /tmp/secret.txt" }
```

---

## 4. Model-Specific Tool Calling Support

**Confidence: MEDIUM** — behavioral differences are partially from training data and partially from community reports. Validate with live tests.

### qwen2.5-coder (Recommended)

**Versions:** qwen2.5-coder:7b, qwen2.5-coder:14b, qwen2.5-coder:32b

**Tool calling quality: HIGH**

- Best-in-class tool calling reliability among locally-runnable models
- Specifically tuned for code-adjacent structured output tasks
- Consistently emits `tool_calls` in the correct Ollama format
- Arguments are almost always valid JSON objects — minimal parsing fallbacks needed
- Follows the system prompt reliably; tool descriptions are respected
- 7b is usable but 14b+ is noticeably more reliable at multi-step tool chains
- **Recommended default model for this project**

**Known issues:**
- Very occasionally emits tool call as a markdown code block in `content` instead of the `tool_calls` field — your parser needs a fallback for this
- May produce extraneous text in `content` alongside `tool_calls` (should be empty, sometimes isn't)

### llama3.1

**Versions:** llama3.1:8b, llama3.1:70b

**Tool calling quality: MEDIUM**

- Supports tool calling natively (Ollama added tool support for llama3.1 on release)
- More reliable than older llama versions but less consistent than qwen2.5-coder
- 8b model frequently struggles with multi-tool calls or complex parameter schemas
- Often produces correct structure but with argument values as strings instead of typed JSON (e.g., `"count": "5"` instead of `"count": 5`)
- May occasionally output tool call as JSON in `content` block rather than `tool_calls`
- 70b is substantially more reliable — approaches qwen2.5-coder:14b quality
- Truncation is more common with larger tool schemas — keep descriptions concise

**Known issues:**
- Has a tendency to "explain" what it's doing in `content` while also emitting `tool_calls` — results in non-empty `content` that must be ignored
- Argument coercion bugs: numeric parameters may arrive as strings

### mistral

**Versions:** mistral:7b (mistral-nemo, mistral-small-latest)

**Tool calling quality: LOW-MEDIUM**

- Mistral 7b has tool call support in Ollama but it is the least reliable of the three
- Frequently falls back to emitting JSON in the `content` field as a code block instead of using `tool_calls`
- Parameter schemas with nested objects are problematic — flatten schemas where possible for mistral
- Single-tool, simple-parameter calls work acceptably; multi-step chains degrade quickly
- The mistral-nemo variant is notably better than base mistral:7b
- **Requires the most robust fallback parsing of the three models**

**Known issues:**
- Will sometimes emit tool calls as: ` ```json\n{"tool": "...", "arguments": {...}}\n``` ` in `content` — requires extraction
- Parameter names may be hallucinated if descriptions are ambiguous
- Does not reliably stop after a tool call; may continue generating text after the tool call JSON

### Summary Comparison

| Dimension | qwen2.5-coder | llama3.1 | mistral |
|-----------|--------------|----------|---------|
| Structured `tool_calls` output | Reliable | Usually | Unreliable |
| Valid argument types | Good | Coerces strings | Inconsistent |
| Multi-tool calls | Works | Struggles at 8b | Often fails |
| Complex schemas | Handles well | Degrades | Requires flattening |
| Content pollution | Rare | Occasional | Common |
| Recommended for agent loop | Yes (primary) | Yes (fallback) | Needs heavy parsing |

---

## 5. Model Inconsistencies: Robust Parsing Requirements

This is the critical section for the tool loop implementation. Models do not reliably use the structured `tool_calls` field. Your parser must handle every format they produce.

**Confidence: MEDIUM-HIGH** — these patterns are well-documented in community issue trackers and agentic framework implementations.

### Inconsistency 1: Tool Call in Content as JSON Code Block

The most common failure mode. The model emits valid tool call JSON inside a markdown code block in `content`, with `tool_calls` empty or absent.

```json
{
  "message": {
    "role": "assistant",
    "content": "```json\n{\"name\": \"list_dir\", \"arguments\": {\"path\": \"/tmp\"}}\n```",
    "tool_calls": []
  }
}
```

**Parser action:** Extract JSON from code block. Try to map `name` → tool name, `arguments` → args.

### Inconsistency 2: Tool Call as Raw JSON in Content

The model emits JSON without markdown fencing.

```json
{
  "message": {
    "role": "assistant",
    "content": "{\"name\": \"read_file\", \"arguments\": {\"path\": \"/etc/hosts\"}}",
    "tool_calls": []
  }
}
```

**Parser action:** Attempt `JSON.parse(content)`. Check for `name` or `function_name` or `tool` field that matches a known tool.

### Inconsistency 3: OpenAI-Style Arguments as JSON String

Some models (and some Ollama versions) return `arguments` as a JSON-encoded string rather than an object.

```json
{
  "tool_calls": [
    {
      "function": {
        "name": "list_dir",
        "arguments": "{\"path\": \"/tmp\"}"
      }
    }
  ]
}
```

**Parser action:** After reading `arguments`, check `typeof arguments === "string"`. If so, `JSON.parse(arguments)`.

### Inconsistency 4: Non-Empty Content Alongside Tool Calls

Model correctly uses `tool_calls` but also puts reasoning text in `content`.

```json
{
  "message": {
    "role": "assistant",
    "content": "I'll list the directory for you.",
    "tool_calls": [
      { "function": { "name": "list_dir", "arguments": { "path": "/tmp" } } }
    ]
  }
}
```

**Parser action:** When `tool_calls.length > 0`, ignore `content` entirely. Process tool calls only.

### Inconsistency 5: Wrong Tool Name Casing or Slight Variation

Model invents `List_Dir` or `listDir` or `ListDir` instead of `list_dir`.

**Parser action:** Normalize all tool names to lowercase before lookup. Consider fuzzy matching (Levenshtein distance < 2) as a last resort.

### Inconsistency 6: Extra Wrapper Keys

Model wraps the call in a `tool_call` or `function_call` envelope:

```json
{
  "content": "{\"tool_call\": {\"name\": \"list_dir\", \"arguments\": {\"path\": \"/tmp\"}}}"
}
```

**Parser action:** After JSON.parse, check for `tool_call`, `function_call`, `action`, `tool` wrapper keys and unwrap.

### Inconsistency 7: Arguments as Positional Array

Very rare but observed with some mistral prompting:

```json
{
  "content": "{\"name\": \"read_file\", \"arguments\": [\"/tmp/foo.txt\"]}"
}
```

**Parser action:** If `arguments` is an array, map positionally to the tool's `required` parameter list.

### Inconsistency 8: Partial/Truncated JSON

Model runs into context limits mid-generation and produces truncated JSON.

```json
{
  "content": "{\"name\": \"read_file\", \"arguments\": {\"path\": \"/very/long/pa"
}
```

**Parser action:** Attempt partial JSON recovery. Libraries like `partial-json` can help. If unrecoverable, treat as failed tool call and retry with a simplified prompt.

### Recommended Parser Strategy (Layered)

```
Layer 1: Check message.tool_calls — if non-empty and arguments parses, use it
Layer 2: Check if arguments is a JSON string, parse it
Layer 3: Try JSON.parse(message.content)
Layer 4: Extract JSON from ```json ... ``` code block in content
Layer 5: Extract any JSON object from content with regex ({...})
Layer 6: Check for wrapper keys (tool_call, function_call, action)
Layer 7: Normalize tool name (lowercase, fuzzy match)
Layer 8: Fail → retry with explicit format reminder in system prompt
```

---

## 6. The Full Agentic Loop

**Confidence: HIGH** — this is a well-established pattern across all OpenAI-compatible tool loop implementations.

### Loop Structure

```
1. Build initial messages array with user prompt
2. Send to /api/chat with tools defined and stream: false
3. Receive response
4. Parse: does message.tool_calls contain tool calls? (use layered parser)
5. YES → execute each tool call
      → append assistant message (with tool_calls) to history
      → append tool result message(s) to history
      → increment iteration counter
      → if iteration < max_iterations: go to step 2
      → else: return "max iterations reached" error
6. NO → message.content is the final answer → return to caller
```

### Pseudocode (TypeScript-flavored)

```typescript
async function runAgentLoop(
  prompt: string,
  model: string,
  tools: ToolDefinition[],
  maxIterations = 10
): Promise<string> {
  const messages: Message[] = [
    { role: "user", content: prompt }
  ];

  for (let i = 0; i < maxIterations; i++) {
    const response = await ollamaChat({ model, messages, tools, stream: false });
    const assistantMessage = response.message;

    // Parse tool calls (layered strategy)
    const toolCalls = parseToolCalls(assistantMessage, tools);

    if (toolCalls.length === 0) {
      // No tool calls — this is the final answer
      return assistantMessage.content;
    }

    // Append assistant message exactly as received (preserving tool_calls field)
    messages.push({
      role: "assistant",
      content: assistantMessage.content ?? "",
      tool_calls: assistantMessage.tool_calls ?? []
    });

    // Execute each tool call and append results
    for (const call of toolCalls) {
      let result: string;
      try {
        result = await executeTool(call.name, call.arguments);
      } catch (err) {
        result = `ERROR: ${err.message}`;
      }
      messages.push({ role: "tool", content: result });
    }
  }

  throw new Error(`Agent did not complete within ${maxIterations} iterations`);
}
```

### Critical Loop Details

**1. Append the assistant message verbatim before tool results.**
The conversation history must include the assistant's tool_call message. Skipping it breaks the model's context — it loses track of what it asked for.

**2. Always append tool results, even on error.**
A missing `role: "tool"` message after a tool call causes the next response to be confused. Send the error string as the tool result.

**3. Max iteration guard is mandatory.**
Without it, a misbehaving model can loop forever requesting the same tool. 10 iterations is a reasonable default; expose it as a config parameter.

**4. Preserve the full message history.**
Do not summarize or truncate history mid-loop. If context grows too large (hitting the model's context window), you'll see quality degrade — this is a signal to either increase context limit in model options or implement history summarization.

**5. System prompt placement.**
If you use a system prompt (recommended for reliability), it goes as the first message:

```typescript
const messages: Message[] = [
  {
    role: "system",
    content: `You are a helpful assistant with access to tools. When you need to use a tool, call it using the tool_calls format. When you have gathered enough information to answer the user, respond with plain text without calling any tools.`
  },
  { role: "user", content: prompt }
];
```

**6. Options for controlling tool call behavior.**

```json
{
  "model": "qwen2.5-coder:7b",
  "messages": [...],
  "tools": [...],
  "stream": false,
  "options": {
    "temperature": 0.1,
    "num_ctx": 8192
  }
}
```

- Low temperature (0.0–0.2) dramatically improves tool call format reliability
- `num_ctx` controls context window — increase if long tool results cause truncation

---

## 7. OpenAI Compatibility Layer

Ollama also exposes an OpenAI-compatible endpoint:

```
POST http://localhost:11434/v1/chat/completions
```

This endpoint accepts the OpenAI format where `arguments` is a JSON-encoded string and uses `finish_reason: "tool_calls"`. **Avoid this for the agent loop.** The native `/api/chat` endpoint is more straightforward (arguments as object, not string) and avoids the impedance mismatch.

Exception: if you ever want to drop in the `openai` npm package as a client, use the compat endpoint with `baseURL: "http://localhost:11434/v1"`.

---

## 8. Model Availability and Context Limits

| Model | Size | Context (default) | Tool Support | VRAM (approx) |
|-------|------|------------------|--------------|---------------|
| qwen2.5-coder:7b | 7B | 32k | Native, reliable | ~5 GB |
| qwen2.5-coder:14b | 14B | 32k | Native, reliable | ~9 GB |
| qwen2.5-coder:32b | 32B | 32k | Native, best | ~20 GB |
| llama3.1:8b | 8B | 128k | Native, medium | ~5 GB |
| llama3.1:70b | 70B | 128k | Native, good | ~40 GB |
| mistral:7b | 7B | 32k | Partial | ~5 GB |
| mistral-nemo | 12B | 128k | Better than 7b | ~8 GB |

**Note:** Context limits above are model defaults. Ollama lets you override with `num_ctx` in `options`. Large contexts slow inference significantly.

---

## 9. Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| `/api/chat` request format | HIGH | Stable documented API since Ollama 0.3 |
| Response `tool_calls` structure | HIGH | Consistent with docs and OpenAI-compat design |
| `role: "tool"` result format | HIGH | Standard pattern across Ollama versions |
| qwen2.5-coder reliability | HIGH | Well-established in community usage |
| llama3.1 reliability | MEDIUM | Behavioral details from community reports |
| mistral reliability | MEDIUM | Behavioral details from community reports |
| Parser inconsistency patterns | MEDIUM | Community-observed, needs live validation |
| Streaming tool calls | LOW | Did not verify streaming chunk format — avoid until tested |
| Context window limits | MEDIUM | Default values; may change with model updates |

---

## 10. Validation Checklist (Run Before Implementation)

These should be verified with a live Ollama instance before writing the parser:

- [ ] Hit `/api/chat` with a tool definition and confirm `tool_calls` field is present in response
- [ ] Confirm `arguments` is an object (not a string) in the native endpoint
- [ ] Confirm `role: "tool"` message is accepted (not rejected with 400)
- [ ] Test qwen2.5-coder:7b with a two-tool sequence and observe format
- [ ] Test llama3.1:8b with the same sequence — note any format differences
- [ ] Test mistral:7b — confirm whether it uses `tool_calls` or falls back to content
- [ ] Deliberately send a malformed tool result to see how the model recovers
- [ ] Verify that `temperature: 0.1` produces more consistent tool call structure
- [ ] Test with `stream: true` to understand chunk format if streaming is needed later

---

## 11. Sources and Confidence

**Primary sources (training data, cutoff August 2025):**
- Ollama GitHub: `ollama/ollama` `docs/api.md` — official API reference
- Ollama blog post: "Tool Support" announcement (June 2024)
- LangChain Ollama integration source — shows how established frameworks handle the loop
- LlamaIndex Ollama tool calling implementation
- Community reports in `ollama/ollama` GitHub Issues tracker

**Not verified (WebFetch/WebSearch unavailable):**
- Exact current Ollama version and any API changes after August 2025
- Whether `tool_call_id` has been added to Ollama responses since August 2025
- Streaming tool call chunk format

**Recommendation:** Before implementing the parser, run the validation checklist above against a live Ollama instance. The structural API (request/response format, role names) is HIGH confidence. The behavioral model differences are MEDIUM confidence and require empirical testing.
