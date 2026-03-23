# Roadmap: local-agent-mcp

**Created:** 2026-03-20
**Core Value:** Claude Code delegates tasks to a local Ollama model that actually executes them — closing the loop from tool call to result without any cloud API calls.
**Granularity:** Standard (4 phases)
**Coverage:** 35/35 v1 requirements mapped

---

## Phases

- [x] **Phase 1: MCP Server Shell** - Working MCP server registered with Claude Code, stub tool proves the transport layer
- [x] **Phase 2: Agent Loop + Tools + Safety** - Full agentic tool loop executing real file and shell operations safely (completed 2026-03-21)
- [ ] **Phase 3: Robust Parsing Pipeline** - Fault-tolerant parser handles all documented model output failure modes
- [ ] **Phase 4: Configuration + Polish** - Env-var config, README, and distribution artifacts make the tool usable by others

---

## Phase Details

### Phase 1: MCP Server Shell

**Goal:** A working MCP server that Claude Code can register and invoke — transport layer proven, tool stub wired, no correctness logic yet.

**Depends on:** Nothing (first phase)

**Requirements:** MCP-01, MCP-02, MCP-03, MCP-04

**Key Deliverables:**

1. `package.json` with `"type": "module"`, `@modelcontextprotocol/sdk`, and `zod@3` (not zod v4 — breaking API changes)
2. `tsconfig.json` with `module: "Node16"` and `moduleResolution: "Node16"` — required for SDK's `.js` extension imports
3. `src/index.ts`: `McpServer` with `StdioServerTransport`, single `run_local_agent(prompt, model?)` tool registered via `server.registerTool()` (not deprecated `server.tool()`)
4. Tool handler returns `"not implemented"` stub — all errors caught and returned as `{ isError: true }`, no unhandled exceptions
5. All logging via `console.error()` only — `console.log()` corrupts the stdio JSON-RPC transport
6. `.mcp.json` project file pointing at compiled `build/index.js` for zero-config Claude Code registration
7. `npm run build` compiles cleanly; `npm start` runs without error

**Success Criteria** (what must be TRUE when this phase is complete):

1. Claude Code can invoke `run_local_agent` via the registered `.mcp.json` and receives a response (even if stub)
2. The MCP Inspector (`npx @modelcontextprotocol/inspector`) connects to the server and lists `run_local_agent` with correct schema
3. Passing a prompt returns `{ content: [{ type: "text", text: "not implemented" }] }` — no protocol error
4. Triggering a deliberate handler error returns `{ isError: true }` — Claude Code receives an inspectable error, not a protocol crash
5. No writes to stdout during normal operation or on error — all output goes to stderr

**Plans:** 1 plan

Plans:
- [x] 01-01-PLAN.md — Scaffold project and implement MCP server with stub run_local_agent tool

**Research Notes:**

Three gotchas from SUMMARY.md that will cause silent failures if missed:
- `console.log()` anywhere (including third-party libs) corrupts the transport silently
- `zod@3` required — zod v4 has breaking schema API changes that will error at startup
- `module: "Node16"` required — any other moduleResolution breaks `.js` extension resolution at runtime

No pre-phase research needed. MCP SDK patterns are HIGH confidence and well-documented.

---

### Phase 2: Agent Loop + Tools + Safety

**Goal:** The local agent actually executes multi-step tasks — calling Ollama, parsing native tool calls, running file and shell operations, and completing safely within enforced constraints.

**Depends on:** Phase 1

**Requirements:** LOOP-01, LOOP-02, LOOP-03, LOOP-04, LOOP-05, TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05, SAFE-01, SAFE-02, SAFE-03, SAFE-04, SAFE-05, SAFE-06, SAFE-07

**Key Deliverables:**

1. `src/ollama.ts`: Thin `fetch()`-based HTTP client for `POST /api/chat` with `stream: false`, typed response shape, clear error on Ollama not running — no `ollama` npm package needed
2. `src/loop.ts`: Full agentic tool loop — POST to Ollama → check `message.tool_calls` → execute tools → append assistant message to history → append `role: "tool"` results → repeat until no tool calls or max iterations hit
3. `src/tools.ts`: Four tool executors — `read_file(path)`, `write_file(path, content)`, `list_dir(path)`, `bash(command)` — all path-based tools routed through `assertPathSafe()`, bash through `assertCommandAllowed()`
4. `src/security.ts`: Standalone safety module with exported pure functions:
   - `assertPathSafe(p, root)` — `path.resolve()` + `root + path.sep` prefix check (not raw string prefix — prevents `/project-evil/` bypass)
   - `assertCommandAllowed(cmd, allowList)` — trailing-space prefix match (`trimmed.startsWith('git ')` not `startsWith('git')`) to prevent `gitevil` bypass
   - Default allow-list: `git`, `ls`, `cat`, `echo`, `grep`, `find`, `mkdir`, `cp`, `mv`, `touch`, `npm`, `node`, `python` — `rm`, `curl`, `wget`, `sudo`, `ssh` excluded
   - Process group kill on timeout (`kill(-pid, SIGTERM)` on Unix — kills grandchildren)
   - Subprocess env restricted to explicit allowlist: `PATH`, `HOME`, `USER`, `LANG` — blocks `ANTHROPIC_API_KEY` exfiltration
   - Bash output capped at 1MB with truncation notice appended
   - `shellMode: 'full'` escape hatch that prints a warning and disables all restrictions
5. Tool error results returned to model as `role: "tool"` messages — not thrown exceptions; a missing tool result causes model confusion
6. Max iterations enforced (hardcoded at 10 for this phase; config in Phase 4); loop exits with a clear message when limit is hit

**Success Criteria** (what must be TRUE when this phase is complete):

1. Asking `run_local_agent` to "list the files in the current directory and read one of them" completes a two-step tool sequence and returns the file contents in the final response
2. Asking the agent to write a file and then read it back produces a correct multi-turn loop with the written content confirmed
3. Requesting a bash command not on the allow-list returns an error to the model (and the model's error response reaches Claude), not an unhandled exception
4. Requesting a file path outside the working directory (e.g., `../../etc/passwd`) is rejected by the path validator — the agent does not read the file
5. A bash command that runs for longer than the timeout is terminated — including any child processes spawned by it
6. Environment variables like `ANTHROPIC_API_KEY` are not available to subprocess commands even when set in the parent process
7. A deliberate infinite tool loop is stopped at max iterations with a clear "max iterations reached" message

**Plans:** 4/4 plans complete

Plans:
- [x] 02-01-PLAN.md — Security module with path validation, command allow-list, safe env, and output truncation
- [x] 02-02-PLAN.md — Ollama HTTP client, tool executors, and tool tests
- [x] 02-03-PLAN.md — Agent loop and MCP handler wiring

**Research Notes:**

Four critical gotchas from SUMMARY.md specific to this phase:

- Ollama `arguments` in `message.tool_calls` is a pre-parsed object, NOT a JSON string — do not attempt `JSON.parse()` on it
- Assistant message must be appended to history BEFORE tool results on each iteration — skipping it causes the model to lose track of what it requested
- Always send a `role: "tool"` result even when tool execution errors — a missing result causes model confusion on the next turn
- `exec()` timeout kills the child process but not grandchildren — use process group kill (`kill(-pid)`) on Unix; document Windows as unsupported for bash execution

Windows note: Process group kill requires `kill(-pid)` which does not work on Windows. Either implement `taskkill /T /F` branching or document Windows bash as unsupported. REQUIREMENTS.md documents this as DIST-03 (Windows bash not supported). Implement as documentation for this phase; full Windows support is v2 (SAND-04).

No pre-phase research needed. Ollama `/api/chat` API format is HIGH confidence.

---

### Phase 3: Robust Parsing Pipeline

**Goal:** The agent handles real-world model output — fallback text extraction when native tool_calls are absent, retry with correction prompts on malformed output, and structured failure returns when recovery is impossible.

**Depends on:** Phase 2

**Requirements:** PARSE-01, PARSE-02, PARSE-03, PARSE-04, PARSE-05, PARSE-06

**Key Deliverables:**

1. `src/parser.ts`: Three-tier parser architecture:
   - **Tier 1 (native):** Check `message.tool_calls` — if non-empty and arguments parse cleanly, use it directly. This is the fast path handling ~80% of traffic with qwen2.5-coder.
   - **Tier 2 (text extraction):** 7-strategy pipeline run when native tool_calls are absent but `message.content` is non-empty: (1) direct JSON parse, (2) strip prose and retry, (3) extract first JSON object, (4) lenient JSON repair (trailing commas, single quotes, unquoted keys), (5) extract multiple JSON objects and pick best match, (6) schema normalization, (7) tool name inference from parameter signatures
   - **Tier 3 (retry):** Up to 3 retries with a correction prompt that includes the specific parse error and expected JSON format. After 3 failures, return structured `ParseFailure` — never throw.
2. Field name normalization map covering all documented aliases:
   - Tool name: `name` / `tool_name` / `function` / `action` / `tool`
   - Parameters: `parameters` / `arguments` / `args` / `params` / `input` / `kwargs`
3. `ParseFailure` return type with fields: `reason`, `rawContent`, `attemptCount`, `lastError` — structured so the loop can surface a useful message to Claude
4. Parser test suite: 14 test cases covering PARSING.md P0-P2 failure modes:
   - P0 (normal-use failures): extra prose, markdown code fences, trailing commas, field name aliases, double-stringified parameters, multiple JSON objects in one response
   - P1 (model-specific): single quotes, unquoted keys, parameters hoisted to top level, positional array parameters, JS comments in JSON
   - P2 (unrecoverable): truncated JSON, completely unparseable output, missing required parameters

**Success Criteria** (what must be TRUE when this phase is complete):

1. Parser test suite passes all 14 cases — each P0 through P2 scenario produces the correct parsed tool call or the correct `ParseFailure`
2. Asking the agent a task while using `llama3.1:8b` (which frequently produces content-field JSON) completes successfully — the text extraction pipeline recovers where native tool_calls would return nothing
3. Sending a deliberately malformed prompt that causes the model to emit unparseable output triggers the retry loop — the agent makes up to 3 correction attempts before returning a `ParseFailure` (no throw, no crash)
4. A `ParseFailure` result surfaces a readable error to Claude Code — not a protocol error and not silence
5. A response where `message.tool_calls` is present but `message.content` is also non-empty is handled correctly — tool_calls path is used, content is ignored (not processed in parallel)

**Plans:** 2 plans

Plans:
- [ ] 03-01-PLAN.md — Three-tier parser module with 14+ test cases (TDD)
- [ ] 03-02-PLAN.md — Integration wiring: format:'json', parseToolCall in loop.ts, ParseFailure in AgentResult

**Research Notes:**

Pre-phase empirical validation recommended before writing the parser (from SUMMARY.md):

Run the OLLAMA.md section 10 validation checklist against a live Ollama instance before coding. Specifically:
- Confirm `arguments` arrives as an object (not a string) for both qwen2.5-coder:7b and llama3.1:8b
- Confirm `role: "tool"` is accepted correctly
- Test a two-tool sequence and observe any differences in output format between the two models

This takes ~30 minutes and confirms the MEDIUM-confidence behavioral claims. The parser's text extraction strategies should be calibrated against the actual failure modes observed, not just the documented ones.

Context window note: If a long tool chain fills the model's `num_ctx`, the message history will be truncated. For this phase, implement a hard-stop with a clear error message when approaching context limits. Summarization is a v2 concern (CAP-03).

---

### Phase 4: Configuration + Polish

**Goal:** Any Claude Code user can clone the repo, follow the README, and have a working local agent — no source editing required, behavior is tunable via environment variables.

**Depends on:** Phase 3

**Requirements:** CONF-01, CONF-02, CONF-03, CONF-04, CONF-05, CONF-06, CONF-07, DIST-01, DIST-02, DIST-03, DIST-04

**Key Deliverables:**

1. `src/config.ts`: Configuration module reading all env vars at startup with documented defaults:
   - `OLLAMA_HOST` (default: `http://localhost:11434`)
   - `AGENT_MODEL` (default: `qwen2.5-coder:7b` — accessible hardware default; 14b/32b upgrade documented)
   - `AGENT_WORKING_DIR` (default: `process.cwd()`)
   - `AGENT_MAX_ITERATIONS` (default: `10`)
   - `AGENT_TIMEOUT_SECONDS` (default: `30`)
   - `AGENT_SHELL_MODE` (`restricted` | `full` | `none`, default: `restricted`)
   - `AGENT_ALLOWED_COMMANDS` (comma-separated additions to default allow-list)
2. `README.md` covering all six required sections:
   - What it is (one paragraph)
   - Prerequisites (Ollama, Node.js version, supported OS)
   - Installation (clone, `npm install`, `npm run build`)
   - Claude Code registration (`.mcp.json` snippet + manual config option)
   - Configuration reference (all 7 env vars with defaults and examples)
   - Supported models (qwen2.5-coder primary, llama3.1 fallback, mistral note, upgrade path)
3. Model upgrade path documentation: 7b default → 14b/32b via `AGENT_MODEL=qwen2.5-coder:14b` — VRAM requirements noted per size
4. Windows bash limitation documented clearly: bash tool is Mac/Linux only due to process group kill using Unix `kill(-pid)`; Windows users get read_file, write_file, list_dir, but not bash
5. `.mcp.json` committed to repo (confirming DIST-02 from Phase 1 persists correctly and env var config is wired through)

**Success Criteria** (what must be TRUE when this phase is complete):

1. A user who has never seen the codebase can follow the README from clone to first successful `run_local_agent` invocation with no source editing
2. Setting `AGENT_MODEL=qwen2.5-coder:14b` in the MCP config env block causes the agent to use the 14b model — no code change required
3. Setting `AGENT_SHELL_MODE=full` causes bash to run without restrictions and prints the expected warning to stderr; setting `AGENT_SHELL_MODE=none` causes bash to refuse all commands
4. Setting `AGENT_ALLOWED_COMMANDS=rm,curl` adds those commands to the allow-list and the agent can execute them
5. The README's Claude Code registration section can be followed literally — the config snippet works without modification on Mac and Linux

**Plans:** 1 plan

Plans:
- [ ] 01-01-PLAN.md — Scaffold project and implement MCP server with stub run_local_agent tool

**Research Notes:**

Default model decision (from SUMMARY.md open question #3): `qwen2.5-coder:7b` is the right default — most users will not have the 20GB VRAM for 32b. Document the upgrade path explicitly so performance-focused users know what to set.

No pre-phase research needed. Env-var config is a standard pattern with no uncertainty.

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. MCP Server Shell | 1/1 | Done | 2026-03-21 |
| 2. Agent Loop + Tools + Safety | 4/4 | Complete   | 2026-03-21 |
| 3. Robust Parsing Pipeline | 0/2 | Planning complete | - |
| 4. Configuration + Polish | 0/? | Not started | - |

---

## Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| MCP-01 | Phase 1 | Complete |
| MCP-02 | Phase 1 | Complete |
| MCP-03 | Phase 1 | Complete |
| MCP-04 | Phase 1 | Complete |
| LOOP-01 | Phase 2 | Pending |
| LOOP-02 | Phase 2 | Pending |
| LOOP-03 | Phase 2 | Pending |
| LOOP-04 | Phase 2 | Pending |
| LOOP-05 | Phase 2 | Pending |
| TOOL-01 | Phase 2 | Pending |
| TOOL-02 | Phase 2 | Pending |
| TOOL-03 | Phase 2 | Pending |
| TOOL-04 | Phase 2 | Pending |
| TOOL-05 | Phase 2 | Pending |
| SAFE-01 | Phase 2 | Pending |
| SAFE-02 | Phase 2 | Pending |
| SAFE-03 | Phase 2 | Pending |
| SAFE-04 | Phase 2 | Pending |
| SAFE-05 | Phase 2 | Pending |
| SAFE-06 | Phase 2 | Pending |
| SAFE-07 | Phase 2 | Pending |
| PARSE-01 | Phase 3 | Pending |
| PARSE-02 | Phase 3 | Pending |
| PARSE-03 | Phase 3 | Pending |
| PARSE-04 | Phase 3 | Pending |
| PARSE-05 | Phase 3 | Pending |
| PARSE-06 | Phase 3 | Pending |
| CONF-01 | Phase 4 | Pending |
| CONF-02 | Phase 4 | Pending |
| CONF-03 | Phase 4 | Pending |
| CONF-04 | Phase 4 | Pending |
| CONF-05 | Phase 4 | Pending |
| CONF-06 | Phase 4 | Pending |
| CONF-07 | Phase 4 | Pending |
| DIST-01 | Phase 4 | Pending |
| DIST-02 | Phase 4 | Pending |
| DIST-03 | Phase 4 | Pending |
| DIST-04 | Phase 4 | Pending |

**v1 requirements:** 35 total / 35 mapped / 0 unmapped

---

*Roadmap created: 2026-03-20*
*Last updated: 2026-03-23 after Phase 3 planning*
