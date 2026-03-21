# Requirements: local-agent-mcp

**Defined:** 2026-03-20
**Core Value:** Claude Code delegates tasks to a local Ollama model that actually executes them — closing the loop from tool call to result without any cloud API calls.

---

## v1 Requirements

### MCP Server

- [x] **MCP-01**: MCP server exposes a `run_local_agent(prompt, model?)` tool via stdio transport
- [x] **MCP-02**: Server builds and registers cleanly via `.mcp.json` project file (zero-config install for users who clone the repo)
- [x] **MCP-03**: All handler errors returned as `{ isError: true }` — no unhandled exceptions reach the MCP protocol layer
- [x] **MCP-04**: No writes to stdout (all logging goes to stderr only)

### Ollama Agent Loop

- [ ] **LOOP-01**: Agent loop posts to Ollama `/api/chat` with `stream: false`, tool definitions, and full message history
- [ ] **LOOP-02**: Loop continues until model produces a final text response (no tool calls) or max iterations reached
- [ ] **LOOP-03**: Each tool call result is returned to the model as a `role: "tool"` message (even on error)
- [ ] **LOOP-04**: Assistant message is appended to history before tool results on each iteration
- [ ] **LOOP-05**: Max iterations enforced (default: 10, configurable) — loop exits with a clear message on limit hit

### Local Tools

- [ ] **TOOL-01**: `read_file(path)` — reads file contents, path-safe
- [ ] **TOOL-02**: `write_file(path, content)` — writes file, path-safe
- [ ] **TOOL-03**: `list_dir(path)` — lists directory contents, path-safe
- [ ] **TOOL-04**: `bash(command)` — executes shell command, restricted by allow-list by default
- [ ] **TOOL-05**: Tool descriptions are meaningful — the model uses them to decide which tool to call

### Tool Call Parser

- [ ] **PARSE-01**: Native `message.tool_calls` path used as primary (fast path, ~80% of traffic)
- [ ] **PARSE-02**: Field name normalization handles aliases (`tool_name`/`name`/`function`, `args`/`arguments`/`params`/`kwargs`)
- [ ] **PARSE-03**: Text extraction pipeline handles: extra prose around JSON, markdown code fences, trailing commas, multiple JSON objects in response
- [ ] **PARSE-04**: Up to 3 retries with a correction prompt that includes the specific parse error and expected format
- [ ] **PARSE-05**: Parser returns a structured `ParseFailure` after max retries — does not throw
- [ ] **PARSE-06**: Parser passes all 14 test cases from PARSING.md (P0–P2 failure modes)

### Safety Layer

- [ ] **SAFE-01**: Path validation via `path.resolve()` + `root + path.sep` prefix check (not string prefix — prevents `/project-evil/` bypass)
- [ ] **SAFE-02**: Command allow-list enforced with trailing-space check (prevents `gitevil` passing as `git`)
- [ ] **SAFE-03**: Default allow-list: `git`, `ls`, `cat`, `echo`, `grep`, `find`, `mkdir`, `cp`, `mv`, `touch`, `npm`, `node`, `python` — `rm`, `curl`, `wget`, `sudo`, `ssh` excluded by default
- [ ] **SAFE-04**: Process group killed on timeout (Unix: `kill(-pid, SIGTERM)`) — grandchildren don't survive
- [ ] **SAFE-05**: Subprocess env inherits only an explicit allowlist (`PATH`, `HOME`, `USER`, `LANG`) — API keys not leaked
- [ ] **SAFE-06**: Bash output capped at 1MB with truncation notice
- [ ] **SAFE-07**: `shellMode: full` escape hatch available with a printed warning

### Configuration

- [ ] **CONF-01**: `OLLAMA_HOST` (default: `http://localhost:11434`)
- [ ] **CONF-02**: `AGENT_MODEL` (default: `qwen2.5-coder:7b`)
- [ ] **CONF-03**: `AGENT_WORKING_DIR` (default: `process.cwd()`)
- [ ] **CONF-04**: `AGENT_MAX_ITERATIONS` (default: `10`)
- [ ] **CONF-05**: `AGENT_TIMEOUT_SECONDS` (default: `30`)
- [ ] **CONF-06**: `AGENT_SHELL_MODE` (`restricted` | `full` | `none`, default: `restricted`)
- [ ] **CONF-07**: `AGENT_ALLOWED_COMMANDS` (comma-separated additions to default allow-list)

### Distribution / Open Source

- [ ] **DIST-01**: README covers: what it is, prerequisites (Ollama, Node.js), installation, Claude Code registration, configuration reference, supported models
- [ ] **DIST-02**: `.mcp.json` committed to repo for zero-config Claude Code registration
- [ ] **DIST-03**: Windows documented as not supported for bash execution (Mac/Linux only)
- [ ] **DIST-04**: Model upgrade path documented (7b default → 14b/32b via `AGENT_MODEL`)

---

## v2 Requirements

### Extended Safety

- **SAND-01**: `sandboxMode: 'firejail'` opt-in for Linux
- **SAND-02**: `sandboxMode: 'sandbox-exec'` opt-in for macOS
- **SAND-03**: `sandboxMode: 'docker'` opt-in (cross-platform)
- **SAND-04**: Windows bash support via `taskkill` process group kill

### Agent Capabilities

- **CAP-01**: Configurable system prompt for the local agent
- **CAP-02**: `working_dir` override param on `run_local_agent` (scoped to parent working dir)
- **CAP-03**: Context window management — summarize history when approaching `num_ctx` limit
- **CAP-04**: Audit log of all executed commands and file operations with timestamps

### Developer Experience

- **DX-01**: MCP Inspector integration guide for testing without Claude Code
- **DX-02**: GSD role wiring guide (using local-agent-mcp as a GSD executor)

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| GUI or web UI | MCP tool — no frontend needed |
| Non-Ollama backends (OpenAI, Anthropic) | Ollama-first; v2+ concern |
| Bundling into GSD | Standalone first; GSD wiring is a separate integration |
| Model fine-tuning or training | Runtime tool use only |
| Streaming tool call responses | Not verified; defer until live-tested |
| Windows bash support | Process group kill requires `taskkill` branch; v2 |

---

## Traceability

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

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-20*
*Last updated: 2026-03-20 after initial definition*
