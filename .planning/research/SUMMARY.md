# Research Summary: local-agent-mcp

**Synthesized:** 2026-03-20
**Sources:** MCP.md, OLLAMA.md, PARSING.md, SAFETY.md
**Purpose:** Primary input for roadmap and requirements creation

---

## Executive Summary

Building `local-agent-mcp` is a well-understood engineering problem with mature, documented
patterns at every layer — but execution quality depends almost entirely on getting two things
right: the tool call parser and the safety layer. The MCP integration layer is the simplest
part: use `@modelcontextprotocol/sdk` with stdio transport, register a single `run_local_agent`
tool, and never write to stdout. The Ollama agentic loop is also well-specified: POST to
`/api/chat` with `stream: false`, check `message.tool_calls`, execute, append tool results as
`role: "tool"` messages, repeat. Both of these components have clear, well-tested patterns
that can be implemented with high confidence in a few hundred lines.

The hard part is that local models — even the best-in-class qwen2.5-coder — do not reliably
produce structured tool call JSON. They sometimes emit it in markdown code blocks, sometimes
as raw JSON in the `content` field, sometimes with wrong field names, sometimes with extra
prose. A parser that only handles the happy path will fail regularly in production. Research
from PARSING.md (drawn from LangChain, LlamaIndex, smolagents, and AutoGen implementations)
defines a layered 7-strategy extraction pipeline that handles all documented failure modes.
This parser is the reliability boundary of the entire system and should be treated as a
first-class engineering concern, not an afterthought.

The safety story is non-negotiable for an open-source project. Unlike interactive tools
(Open Interpreter, Aider) that rely on human confirmation, this server runs autonomously in
the background. The threat model includes path traversal via `../../`, environment variable
exfiltration of API keys, unbounded command output, infinite agent loops, and command
injection via clever model-generated shell invocations. All four of these can be addressed
with approximately 150 lines of TypeScript using only Node.js stdlib — no OS-level
sandboxing required for the initial release. Defaults must be restrictive; expansion must
be explicit and documented.

---

## Key Findings by Research Area

### MCP Layer (from MCP.md — HIGH confidence)

**Technology decisions are settled:**
- Package: `@modelcontextprotocol/sdk` + `zod@3` (not zod v4 — breaking changes)
- Transport: stdio only. HTTP transport is not how Claude Code integrates.
- API: `server.registerTool()` (not deprecated `server.tool()`)
- Config: ES modules (`"type": "module"`), TypeScript `module: "Node16"` — deviating from
  either breaks the SDK's `.js` extension imports at runtime.

**The critical gotcha:** `console.log()` corrupts the stdio JSON-RPC transport. Every debug
log, library output, and third-party write to stdout breaks the connection silently or with a
parse error. Only `console.error()` (stderr) is safe.

**Tool error handling contract:** Handler throws → Claude gets a protocol error it cannot
read. Handler returns `{ content: [...], isError: true }` → Claude can inspect and adapt.
Never let exceptions bubble out of handlers.

**Distribution:** Project `.mcp.json` file enables zero-config installation for users who
clone the repo. The MCP Inspector (`npx @modelcontextprotocol/inspector`) enables testing
without Claude Code.

**Build requirement:** Config must point to compiled `build/index.js`, not TypeScript
source. Always build before testing with Claude Code.

### Ollama Agentic Loop (from OLLAMA.md — HIGH confidence for API format, MEDIUM for model behavior)

**API format is stable and documented:**
- Endpoint: `POST http://localhost:11434/api/chat` with `stream: false`
- Tools passed in OpenAI-compatible format with JSON Schema parameters
- Response: `message.tool_calls` array when model wants a tool; `message.content` for final answer
- Critical difference from OpenAI: `arguments` is a pre-parsed object, NOT a JSON string

**Tool result format:**
- Role is `"tool"` (not `"user"`, not `"function"`)
- No `tool_call_id` needed — Ollama matches by order
- Multiple tool calls → multiple sequential `role: "tool"` messages
- Always send a tool result even for errors — a missing result causes model confusion

**Model recommendations:**
- Primary: `qwen2.5-coder:32b` (or `:14b` for lower VRAM). Best structured output reliability.
- Fallback: `llama3.1:8b` (medium reliability; numeric params sometimes arrive as strings)
- Avoid as default: `mistral:7b` (frequently falls back to content-field JSON, needs heavy parsing)
- Low temperature (0.0–0.2) meaningfully improves tool call format consistency
- `num_ctx` can be increased if tool results cause context truncation

**Loop control:**
- Max iterations (default 10, recommend exposing as config) is mandatory — no guard means
  potential infinite loops
- Append the assistant message verbatim before tool results — skipping it breaks model context
- Full message history must be preserved within the loop

### Tool Call Parsing (from PARSING.md — HIGH confidence)

**This is the most complex and most important component.** The parser is the reliability
boundary between model output and agent execution.

**Failure mode hierarchy (by frequency):**
1. P0 (will occur in normal use): extra prose around JSON, markdown code fences, trailing
   commas, field name aliases (`tool_name`/`args`/`arguments`/`kwargs`), double-stringified
   parameters, multiple JSON objects in one response
2. P1 (model/prompt-specific): single quotes, unquoted keys, parameters hoisted to top level,
   positional array parameters, JS comments in JSON
3. P2 (cannot recover, must retry): truncated JSON, completely unparseable output, missing
   required parameters

**Recommended architecture — three tiers:**
1. Native API tier: check `message.tool_calls` first. If non-empty and arguments parse,
   use it. This is the fast, reliable path.
2. Text extraction tier: 7-strategy pipeline (direct parse → strip prose → extract first
   JSON → lenient repair → multiple object extraction → schema normalization → tool name
   inference from parameter signatures). Run when native tool_calls are absent but content
   is non-empty.
3. Retry tier: up to 3 retries with a correction prompt that includes the specific parse
   error and expected format. Beyond 3 retries, return a structured `ParseFailure` to the
   caller — not a thrown exception.

**Field name normalization is mandatory.** The same concept appears as `name`/`tool_name`/
`function`/`action`/`tool` and `parameters`/`arguments`/`args`/`params`/`input`/`kwargs`.
Build a normalization map; do not assume the model uses the field names you defined.

**Ollama `format` parameter** (JSON Schema constrained generation) eliminates structural
failures but not semantic ones. Use it as a first-line enhancement, not a replacement for
the parsing pipeline — model behavior with grammar constraints needs empirical validation per
model variant.

**The parser should be tested against a fixed suite of 14 test cases** (P0 through P2
scenarios documented in PARSING.md) before considering it production-ready.

### Safety Layer (from SAFETY.md — HIGH confidence for path/env patterns, MEDIUM for OS sandboxing)

**The threat model for an autonomous background agent:**
- Path traversal to files outside working directory
- Environment variable exfiltration (`ANTHROPIC_API_KEY`, `AWS_SECRET_ACCESS_KEY`)
- Infinite agent loops consuming resources
- Command injection via shell metacharacters in model-generated commands
- Unbounded output filling memory

**Four required mitigations (all in stdlib, ~150 lines):**

1. Path validation: `path.resolve()` + `root + path.sep` prefix check. Never compare raw
   strings. Symlinks are a known gap — document and offer `fs.realpath()` as opt-in.

2. Command allow-list: prefix matching (check for trailing space — `trimmed.startsWith('git ')`
   not `startsWith('git')`), plus secondary escalation pattern check (pipe to shell, backtick
   subshell, `$()` subshell). Default excludes `rm`, `curl`, `wget`, `sudo`, `ssh`.

3. Process constraints: 30s default timeout, process group kill (`kill(-pid)` on Unix),
   1MB output cap with graceful truncation, explicit environment allowlist blocking API keys.
   Windows requires `taskkill /T /F` instead of process group kill — document or implement.

4. Configuration escape hatch: `shellMode: 'full'` to disable all restrictions, with a
   printed warning. Power users will need it; unsupported workarounds are worse.

**What comparable tools do:** Open Interpreter uses human confirmation (not viable for
background agent). Aider avoids bash altogether. Claude Code uses layered trust levels.
This project should follow Claude Code's model: read operations have wider trust than write
operations, which have wider trust than execution.

**OS-level sandboxing** (firejail, sandbox-exec, Docker) is deferred to Phase 2. Design the
config schema to include `sandboxMode` now so it doesn't need to be retrofitted.

---

## Critical Gotchas: Things That Will Bite You If Missed

These are the findings that are non-obvious and have high breakage cost:

| # | Gotcha | Component | Consequence if Missed |
|---|--------|-----------|----------------------|
| 1 | `console.log()` corrupts stdio transport | MCP | Silent connection failure or parse error |
| 2 | `zod@3` required, not zod v4 | MCP | Schema validation errors at startup |
| 3 | `moduleResolution: "Node16"` required | MCP | "Cannot find module" at runtime |
| 4 | Ollama `arguments` is an object, not a string | Ollama | Double-parse attempt breaks on object |
| 5 | Missing `role: "tool"` message causes model confusion | Ollama | Model loops or produces incoherent next response |
| 6 | Assistant message must be appended before tool results | Ollama | Model loses track of what it asked for |
| 7 | `message.tool_calls` can be present with non-empty `content` | Parsing | Ignoring content is correct — processing both breaks loop |
| 8 | `startsWith('git')` allows `gitevil` through allow-list | Safety | Allow-list bypass |
| 9 | `path.startsWith(root)` allows `/project-evil/` | Safety | Path traversal bypass |
| 10 | `exec()` timeout kills child but not grandchildren | Safety | Zombie processes accumulate |
| 11 | Default env inheritance leaks `ANTHROPIC_API_KEY` | Safety | Key exfiltration via model-generated curl command |
| 12 | Tool handler exceptions bubble as protocol errors | MCP | Claude cannot read error; cannot adapt or retry |

---

## Recommended Implementation Approach by Component

### Component 1: MCP Server Shell

Straightforward — follow the template from MCP.md exactly. Key decisions:
- Single `run_local_agent` tool with `prompt` (required) and `model` (optional, defaults to
  `qwen2.5-coder:32b`)
- All execution errors caught inside handler, returned as `isError: true`
- All debug output to `console.error()` only
- Project `.mcp.json` for easy distribution

### Component 2: Ollama Client

Thin HTTP client wrapping `/api/chat`. No need for the `ollama` npm package — a direct
`fetch()` call is sufficient and reduces dependencies. Key design points:
- Always `stream: false`
- Pass `temperature: 0.1` and configurable `num_ctx` in `options`
- Type the response shape — `tool_calls` may be absent, may be empty array, or non-empty
- Handle Ollama connection errors (service not running) with a clear error message

### Component 3: Tool Call Parser

Build in isolation with a test suite. The 14 test cases in PARSING.md are the acceptance
criteria. Implementation order:
1. Native `tool_calls` path (handles 80% of traffic with qwen2.5-coder)
2. Field name normalization map
3. Text extraction pipeline (strategies 1-7 in PARSING.md order)
4. Retry logic with correction prompts

Do not skip the text extraction pipeline assuming native tool_calls will always work —
the research explicitly shows qwen2.5-coder occasionally falls back to content-field output.

### Component 4: Tool Executor

Four tools: `read_file`, `write_file`, `bash`, `list_dir`. All path-based tools run through
`assertPathSafe()`. The `bash` tool runs through `assertCommandAllowed()`. Key design:
- Tool definitions must match what the model is told. Descriptions are load-bearing —
  the model uses them to decide which tool to call.
- Error returns from tools go back to the model as `role: "tool"` messages (not exceptions)
- Bash output is capped and truncated with a visible notice

### Component 5: Security Layer

Implement as a standalone module (`src/security.ts`) with exported pure functions.
The ~150-line skeleton in SAFETY.md is the right shape. Test it separately with unit tests
that exercise the boundary conditions (path traversal, prefix bypass, etc.).

### Component 6: Configuration

Read from environment variables at startup (MCP config's `env` block). Minimum viable config:
- `OLLAMA_HOST` (default: `http://localhost:11434`)
- `AGENT_MODEL` (default: `qwen2.5-coder:32b`)
- `AGENT_WORKING_DIR` (default: `process.cwd()`)
- `AGENT_MAX_ITERATIONS` (default: `10`)
- `AGENT_TIMEOUT_SECONDS` (default: `30`)
- `AGENT_SHELL_MODE` (`restricted` | `full` | `none`, default: `restricted`)
- `AGENT_ALLOWED_COMMANDS` (comma-separated additions to default allow-list)

---

## Implications for Roadmap

### Suggested Phase Structure

**Phase 1: MCP Shell + Ollama Passthrough (~1-2 days)**

Rationale: Establish the scaffolding before any complex logic. Deliverable is a working
MCP server that can be registered with Claude Code and calls Ollama, even if the agent loop
is trivial (one-shot, no tool execution).

Delivers: Registered tool in Claude Code, connection to Ollama confirmed, stdio transport
working, no stdout corruption.

Pitfalls to avoid: stdout corruption (#1), module resolution (#3), zod version (#2).

**Phase 2: Core Agent Loop + Native Tool Parsing (~2-3 days)**

Rationale: The native `tool_calls` path handles 80% of traffic and is the simplest correct
implementation. Get the loop working before adding fallback parsing complexity.

Delivers: Full multi-step agent loop working with qwen2.5-coder via native tool_calls.
The four tool executors (read_file, write_file, bash, list_dir) working correctly. Basic
safety layer (path validation, allow-list, timeout) in place.

Pitfalls to avoid: Missing assistant message append (#6), missing role:tool on error (#5),
no max iteration guard, env variable inheritance (#11).

**Phase 3: Robust Parsing Pipeline (~2-3 days)**

Rationale: Without the fallback parser, the agent fails when models produce non-native
output. This determines whether the tool is reliable enough for real-world use.

Delivers: 7-strategy text extraction pipeline, retry logic with correction prompts,
structured ParseFailure returns, parser test suite passing all 14 PARSING.md cases.

Pitfalls to avoid: Assuming greedy regex for JSON extraction works (#7 variations), not
testing against the full failure mode set.

**Phase 4: Configuration + Polish (~1 day)**

Rationale: Makes the tool usable by others without editing source code. Required for
open-source distribution.

Delivers: Env var configuration, `.mcp.json` project file, escape hatch (`shellMode: full`
with warning), basic README with installation instructions.

**Phase 5: Extended Safety + OS Sandboxing (deferred)**

Rationale: The Phase 2 safety layer is sufficient for trust-aware users. OS-level sandboxing
adds a hard dependency and implementation complexity. Design the `sandboxMode` config key now;
implement `firejail`/`sandbox-exec` later.

Delivers (when implemented): `sandboxMode: 'firejail' | 'sandbox-exec' | 'docker'` opt-in
wrappers.

### Research Flags

| Phase | Research Needed? | Reason |
|-------|-----------------|--------|
| Phase 1: MCP Shell | No | Well-documented SDK with official examples |
| Phase 2: Agent Loop | No | Stable Ollama API; patterns are established |
| Phase 3: Parsing | Empirical validation needed | Run OLLAMA.md's validation checklist against live models before coding the parser |
| Phase 4: Config | No | Standard env-var pattern |
| Phase 5: Sandboxing | Yes | OS-specific details need live testing |

**Action before Phase 3:** Run the validation checklist from OLLAMA.md section 10 against a
live Ollama instance. Specifically: confirm `arguments` is an object (not string), confirm
`role: "tool"` is accepted, and test qwen2.5-coder:7b plus llama3.1:8b with a two-tool
sequence. This takes 30 minutes and eliminates MEDIUM-confidence assumptions in the parser.

---

## Open Questions Requiring Decisions

These are not answered by research and need explicit choices before or during implementation:

| # | Question | Decision Needed | Impact |
|---|----------|----------------|--------|
| 1 | Should `bash` tool be on by default or require opt-in? | Conservative: opt-in via `AGENT_SHELL_MODE=restricted` (bash enabled but restricted). Or: off by default (`shellMode: none`). | Changes default security posture for open-source audience |
| 2 | Should `rm` be in the default allow-list? | Strong recommendation: no. But agents doing real refactoring work need it. Make it a documented opt-in. | Risk vs utility tradeoff |
| 3 | What is the default model? | `qwen2.5-coder:32b` (best quality) or `:7b` (most accessible hardware)? | Most users won't have 20GB VRAM for 32b |
| 4 | Should the `run_local_agent` tool accept a `working_dir` override? | If yes: scoped to parent working dir (safe). If no: always uses server's cwd. | Flexibility vs attack surface |
| 5 | How should agent output be structured for Claude? | Raw text? Structured summary with tool calls listed? Token cost vs readability. | How useful Claude's view of agent work is |
| 6 | Should the system prompt for the local agent be configurable? | If yes: users can tune agent behavior. If no: simpler and harder to misuse. | User power vs footgun potential |
| 7 | Windows support scope? | Full support (requires `taskkill` implementation), documented limitation, or not supported? | Affects user base significantly |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| MCP SDK integration | HIGH | Official docs, stable API, verified patterns |
| Ollama `/api/chat` format | HIGH | Documented stable API since Ollama 0.3+ |
| Ollama tool result message format | HIGH | Consistent with OpenAI-compat design |
| Parser failure modes | HIGH | Well-documented in open-source frameworks |
| Parser extraction strategies | HIGH | Established techniques, tested in production |
| qwen2.5-coder reliability | HIGH | Well-established in community |
| Safety: path validation | HIGH | Pure Node.js stdlib, established patterns |
| Safety: env isolation | HIGH | Established security practice |
| Safety: command allow-list | HIGH | Simple, auditable, well-understood |
| llama3.1/mistral behavior | MEDIUM | Community reports, needs live validation |
| Ollama `format` JSON Schema | MEDIUM | Documented but model behavior varies |
| Retry prompt effectiveness | MEDIUM | Framework patterns; phrasing needs testing |
| macOS `sandbox-exec` | MEDIUM | Exists but poorly documented; Apple deprecation signal |
| Linux `firejail`/`bwrap` | MEDIUM | Training data; needs live testing |
| Windows process group kill | LOW | `kill(-pid)` does not work; `taskkill` path untested |

**Overall confidence for Phase 1-3 implementation:** HIGH. The patterns are established,
the APIs are stable, and the failure modes are well-documented. The primary risk is the
MEDIUM-confidence model behavioral claims — these should be empirically validated before
writing the parsing pipeline.

---

## Gaps to Address During Implementation

1. **Live Ollama validation (before Phase 3):** Run OLLAMA.md section 10 checklist. Confirm
   `arguments` format, `role: "tool"` acceptance, and qwen2.5-coder/llama3.1 format differences.

2. **Default model decision (before Phase 1):** `qwen2.5-coder:7b` vs `:32b` as default
   significantly affects who can run the tool without configuration. A 7b default with a
   documented upgrade path is more accessible.

3. **Windows bash implementation (Phase 2):** Process group kill requires platform branching.
   Either implement `taskkill` path or document Windows as unsupported for bash execution.

4. **Audit logging design (Phase 4):** Not in the research but noted as high-value in
   SAFETY.md — all executed commands and file operations logged with timestamps. ~20 lines,
   significant for open-source trust and debugging.

5. **Context window management (Phase 3):** If the agent runs long tool chains, the message
   history can exceed the model's `num_ctx`. Research did not cover history summarization.
   Implement a hard-stop at context limit with a clear error, defer summarization to a later
   phase.

---

## Aggregated Sources

| Source | Confidence | Research File |
|--------|------------|---------------|
| modelcontextprotocol.io official docs | HIGH | MCP.md |
| Ollama API docs (`docs/api.md`) | HIGH | OLLAMA.md |
| Node.js child_process official docs | HIGH | SAFETY.md |
| LangChain output parser source | MEDIUM | PARSING.md |
| LlamaIndex tool calling implementation | MEDIUM | PARSING.md |
| smolagents ToolCallingAgent | MEDIUM | PARSING.md |
| Ollama GitHub Issues (community reports) | MEDIUM | OLLAMA.md, PARSING.md |
| Open Interpreter safety model | MEDIUM | SAFETY.md |
| Aider command execution model | MEDIUM | SAFETY.md |
| Claude Code permission model | MEDIUM | SAFETY.md |
| macOS sandbox-exec | MEDIUM | SAFETY.md |
| Linux firejail/bwrap | MEDIUM | SAFETY.md |
