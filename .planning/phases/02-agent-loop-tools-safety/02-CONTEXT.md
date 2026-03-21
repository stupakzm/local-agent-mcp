# Phase 2: Agent Loop + Tools + Safety - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

The local agent actually executes multi-step tasks — calling Ollama, parsing native tool calls (`message.tool_calls` fast path only), running file and shell operations, and completing safely within enforced constraints. Fallback text parsing, retry logic, and env-var configuration are out of scope (Phases 3 and 4 respectively).

</domain>

<decisions>
## Implementation Decisions

### Response format returned to Claude Code

- Full execution log showing each tool call with name, args, and outcome — then the model's final message
- Each step: `tool_name("arg") → outcome` (e.g. `read_file("src/index.ts") → 53 lines`, `bash("npm test") → exit 1`)
- Errors inline on the same line: `bash("rm -rf /") → blocked: command not allowed`
- Max iterations hit: return the model's last partial response + `[stopped: max iterations reached]`

### Test strategy

- `src/__tests__/` with `npm test` — standard test setup alongside source
- **`src/security.ts`**: Full unit test coverage — pure functions, easy to test, wrong allow-list check is a security bug
- **`src/tools.ts`**: Unit tests using real filesystem ops against a temp directory — no mocking, realistic
- **Ollama client + agent loop**: No automated tests — verify manually using MCP Inspector + live Ollama instance

### Error messages for blocked operations

- Short messages: `path not allowed` / `command not allowed`
- Include hint pointing to Phase 4 config: `path not allowed (use AGENT_ALLOWED_PATHS to grant access)`
- No verbose explanations of what the allow-list contains (keep it terse)

### `shellMode: 'full'` warning

- Warn in two places: stderr on server startup AND appended to every tool result that ran unrestricted
- Startup: `working dir: /path/to/project | shell mode: full (no restrictions)`
- Per-result: `[shell mode: full — no restrictions applied]`

### Working directory (Phase 2 hardcoded)

- Default: `process.cwd()` — wherever `node build/index.js` is launched from
- Log to stderr on startup: `working dir: /path/to/project | shell mode: restricted`
- `AGENT_WORKING_DIR` config deferred to Phase 4

### File write behavior

- Auto-create intermediate directories with `mkdir -p` semantics — less friction, agent just works

### `list_dir` output format

- Full details per entry: name, type (file/dir), size, modified date
- Model gets enough context to reason about the filesystem without needing a follow-up call

### Bash output truncation

- Cap at 1MB per SAFE-06 — Claude's discretion on truncation notice format

### Claude's Discretion

- Truncation notice wording for 1MB bash output cap
- Internal error handling for Ollama connection failures (Ollama not running)
- Module wiring in `src/index.ts` (how loop.ts is imported and called)

</decisions>

<specifics>
## Specific Ideas

- Error messages should be self-documenting: blocked operations hint at what env var fixes them (`AGENT_ALLOWED_PATHS`, `AGENT_ALLOWED_COMMANDS`) — user sees the fix without reading docs
- `list_dir` full details modeled after `ls -la` output — familiar to the models that were trained on terminal sessions

</specifics>

<canonical_refs>
## Canonical References

No external specs — requirements are fully captured in REQUIREMENTS.md and the decisions above.

### Safety implementation
- `.planning/REQUIREMENTS.md` §Safety Layer (SAFE-01 through SAFE-07) — exact path validation algorithm, allow-list, env allowlist, process group kill, output cap, shellMode escape hatch
- `.planning/REQUIREMENTS.md` §Ollama Agent Loop (LOOP-01 through LOOP-05) — message history structure, termination conditions, max iterations
- `.planning/REQUIREMENTS.md` §Local Tools (TOOL-01 through TOOL-05) — tool signatures and path-safety routing

### Phase 2 ROADMAP detail
- `.planning/ROADMAP.md` §Phase 2 — file structure (`src/ollama.ts`, `src/loop.ts`, `src/tools.ts`, `src/security.ts`), gotchas (Ollama `arguments` is pre-parsed object NOT JSON string, assistant message must be appended BEFORE tool results)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/index.ts` lines 20–40: `run_local_agent` handler stub — Phase 2 replaces `void prompt; void model` with the actual loop call. Error handling pattern (`try/catch → isError: true`) is established and should be preserved.

### Established Patterns
- `console.error`-only logging: enforced by ESLint `no-console` rule — all new modules must follow this. No `console.log` anywhere.
- `isError: true` on all handler errors: established in Phase 1, carry forward to loop error returns
- zod@3 for schema validation: locked at `^3.x` — do not upgrade to v4

### Integration Points
- `src/index.ts` → `src/loop.ts`: the `run_local_agent` handler calls `runAgentLoop(prompt, model, workingDir)` and formats its return value into the execution log + final message structure
- `src/loop.ts` → `src/ollama.ts`: loop calls the Ollama HTTP client per iteration
- `src/loop.ts` → `src/tools.ts`: loop dispatches tool calls by name
- `src/tools.ts` → `src/security.ts`: all path operations routed through `assertPathSafe()`, all bash through `assertCommandAllowed()`

</code_context>

<deferred>
## Deferred Ideas

- **Interactive path approval mid-loop** — User wanted "approve this path and proceed" similar to Claude Code's permission prompts. Deferred because the loop has no mid-execution channel back to the user. Phase 4 addresses this via `AGENT_ALLOWED_PATHS` env var in `.mcp.json` (persistent, version-controlled, readable).
- **Interactive command approval** — Same pattern: `command not allowed → prompt user to add to list`. Deferred to Phase 4 via `AGENT_ALLOWED_COMMANDS` (already planned as CONF-07).
- **Per-session vs global allowlists** — User asked about this; resolved as: `.mcp.json` env vars ARE the persistent config, they survive session restarts and are version-controlled in the repo.

</deferred>

---

*Phase: 02-agent-loop-tools-safety*
*Context gathered: 2026-03-21*
