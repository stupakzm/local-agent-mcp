---
phase: 02-agent-loop-tools-safety
verified: 2026-03-21T16:35:00Z
status: human_needed
score: 20/20 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 19/20
  gaps_closed:
    - "bash executes a command with timeout, process group kill, safe env, and output cap — SAFE-04 now fully implemented: manual setTimeout + process.kill(-child.pid!, SIGTERM) kills entire process group on Unix"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "On a Unix/Mac machine, invoke run_local_agent with a prompt causing the agent to run bash -c 'bash -c \"sleep 60\" & echo started'. Trigger timeout by temporarily lowering TIMEOUT_MS to 500ms. After timeout, run ps aux | grep sleep."
    expected: "Grandchild sleep 60 process is dead after the bash executor times out"
    why_human: "Cannot verify process group kill without a live process execution environment on Unix — the test is skipped on Windows where this machine runs"
  - test: "With Ollama running and qwen2.5-coder:7b available, connect via MCP Inspector and call run_local_agent with prompt: List the files in the current directory and tell me what you see"
    expected: "Response contains an execution log line like list_dir(path=.) → N lines followed by the model's summary"
    why_human: "Requires a live Ollama instance; not testable programmatically without it"
---

# Phase 2: Agent Loop + Tools + Safety Verification Report

**Phase Goal:** The local agent actually executes multi-step tasks — calling Ollama, parsing native tool calls, running file and shell operations, and completing safely within enforced constraints.
**Verified:** 2026-03-21T16:35:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (plan 02-04 fixed SAFE-04 process group kill)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A path outside the working directory is rejected by assertPathSafe | VERIFIED | security.ts line 23: `!resolved.startsWith(root + path.sep)` throws; 7 test cases in security.test.ts pass |
| 2 | A path that is a prefix of the working directory but not inside it (/project-evil/) is rejected | VERIFIED | security.ts line 23: `root + path.sep` prevents prefix attack; test "rejects prefix attack /project-evil/" passes |
| 3 | A command not on the allow-list is rejected by assertCommandAllowed | VERIFIED | security.ts lines 60-67: first-token extraction via split(/\s+/)[0]; rm, curl, wget, sudo, ssh all rejected |
| 4 | A command that is a prefix of an allowed command (e.g. gitevil) is rejected | VERIFIED | First-token extraction naturally rejects "gitevil" since it != "git"; test "rejects prefix attack gitevil" passes |
| 5 | Subprocess env contains only PATH, HOME, USER, LANG -- no ANTHROPIC_API_KEY | VERIFIED | security.ts lines 74-89: ALLOWED_ENV_KEYS = ["PATH","HOME","USER","LANG"]; buildSafeEnv iterates only those keys; test "excludes ANTHROPIC_API_KEY even when set" passes |
| 6 | Bash output longer than 1MB is truncated with a notice | VERIFIED | security.ts lines 100-121: truncateOutput with binary-search; tools.ts line 201 calls truncateOutput on bash output; 4 truncation tests pass |
| 7 | shellMode full bypasses all restrictions and appends a warning | VERIFIED | tools.ts line 204: appends "[shell mode: full — no restrictions applied]"; test "appends warning in full mode" passes |
| 8 | Ollama client posts to /api/chat with stream false and returns typed response | VERIFIED | ollama.ts line 45: `const url = \`${host}/api/chat\``; line 33: `stream: false` in OllamaChatRequest type; returns typed OllamaChatResponse |
| 9 | Ollama client returns a clear error when Ollama is not running | VERIFIED | ollama.ts lines 54-57: catch block throws "Ollama is not running at ${host} -- start it with: ollama serve" |
| 10 | read_file reads a file and returns its contents | VERIFIED | tools.ts lines 113-121: assertPathSafe then fs.readFile; test "reads existing file" passes |
| 11 | write_file writes content to a file and creates intermediate directories | VERIFIED | tools.ts lines 123-134: fs.mkdir with recursive:true then fs.writeFile; test "creates intermediate directories" passes |
| 12 | list_dir returns detailed entries with name, type, size, and modified date | VERIFIED | tools.ts lines 136-152: readdir with withFileTypes:true, stat for size+mtime, formats as "typeChar name sizeB isoDate" |
| 13 | bash executes a command with timeout, process group kill, safe env, and output cap | VERIFIED | tools.ts line 174: `let timedOut = false`; lines 183-185: conditional spread — Unix gets `detached:true`, Windows gets `timeout:timeoutMs`; lines 227-243: manual `setTimeout` calls `process.kill(-child.pid!, "SIGTERM")` on Unix; `clearTimeout` on `close` event; all paths present |
| 14 | All tool descriptions are meaningful for model tool selection | VERIFIED | TOOL_DEFINITIONS: all 4 entries have descriptions >50 chars; test validates this |
| 15 | Agent loop continues until model produces a final text response with no tool calls | VERIFIED | loop.ts lines 82-85: breaks when toolCalls is undefined/empty with `finalMessage = assistantMessage.content` |
| 16 | Agent loop stops at max iterations with a clear message | VERIFIED | loop.ts line 64: `while (iteration < maxIterations)`; index.ts line 74: appends "[stopped: max iterations reached (10)]" |
| 17 | Each tool result is returned as role tool message even on error | VERIFIED | loop.ts line 109: `messages.push({ role: "tool", content: result.output })` runs unconditionally after executeTool |
| 18 | Assistant message is appended to history BEFORE tool results | VERIFIED | loop.ts line 77: `messages.push(assistantMessage)` at line 77, before tool_calls iteration at line 93 |
| 19 | MCP handler formats execution log with each step as tool_name(args) then arrow then outcome | VERIFIED | index.ts lines 53-70: formats `${step.toolName}(${argsStr}) → ${summary}` or "blocked: ..." |
| 20 | Max iterations message appears in response when limit is hit | VERIFIED | index.ts lines 73-75: stoppedByLimit check appends "[stopped: max iterations reached (10)]" |

**Score:** 20/20 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/security.ts` | All safety pure functions | VERIFIED | 135 lines; exports assertPathSafe, assertCommandAllowed, DEFAULT_ALLOWED_COMMANDS, ALLOWED_ENV_KEYS, buildSafeEnv, truncateOutput, MAX_OUTPUT_BYTES, ShellMode, isShellModeRestricted |
| `src/__tests__/security.test.ts` | Full unit test coverage for security module | VERIFIED | 266 lines; 33 tests across 8 describe blocks; all pass |
| `src/ollama.ts` | Ollama HTTP client | VERIFIED | 65 lines; exports chatWithOllama, OllamaChatRequest, OllamaChatResponse, OllamaToolCall, OllamaMessage, OllamaToolDefinition |
| `src/tools.ts` | Tool executor dispatch and tool definitions | VERIFIED | 286 lines; exports executeTool, ToolResult, TOOL_DEFINITIONS; all 4 tools implemented; bashExec has manual setTimeout + process.kill(-child.pid!, SIGTERM) on Unix |
| `src/__tests__/tools.test.ts` | Unit tests for tool executors including grandchild kill test | VERIFIED | 155 lines; 16 tests (4 skipped on Windows); includes "kills grandchild processes on timeout" test at line 114 |
| `src/loop.ts` | Agent loop orchestrating Ollama calls and tool execution | VERIFIED | 124 lines; exports runAgentLoop, AgentResult, LoopStep |
| `src/index.ts` | Updated MCP handler wiring loop to run_local_agent tool | VERIFIED | 109 lines; stub removed, runAgentLoop wired, execution log formatted, hardcoded config present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| src/security.ts | node:path | path.resolve and path.sep for safe prefix checking | WIRED | Line 9: `import path from "node:path"`; line 22: `path.resolve(root, targetPath)`; line 23: `root + path.sep` |
| src/__tests__/security.test.ts | src/security.ts | import of all exported functions | WIRED | Lines 2-11: imports all 8 exports from "../security.js" |
| src/tools.ts | src/security.ts | import assertPathSafe, assertCommandAllowed, buildSafeEnv, truncateOutput | WIRED | Lines 8-15: all 4 functions imported and called in tool executors |
| src/tools.ts | process.kill | setTimeout callback on Unix when child.pid is defined | WIRED | Line 231: `process.kill(-child.pid!, "SIGTERM")` inside `setTimeout` at line 228; guarded by `process.platform !== "win32" && child.pid` at line 227 |
| src/ollama.ts | Ollama HTTP API | fetch POST to /api/chat | WIRED | Line 45: url construction; lines 49-53: fetch POST with JSON body |
| src/loop.ts | src/ollama.ts | chatWithOllama call per iteration | WIRED | Line 3: import; line 67: chatWithOllama called inside while loop |
| src/loop.ts | src/tools.ts | executeTool dispatch for each tool call | WIRED | Line 5: import; line 97: executeTool called for each tool_call |
| src/index.ts | src/loop.ts | runAgentLoop called from MCP handler | WIRED | Line 4: import; line 39: runAgentLoop called inside handler |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SAFE-01 | 02-01 | Path validation via path.resolve() + root + path.sep prefix check | SATISFIED | security.ts line 23: exact algorithm implemented; 7 assertPathSafe tests pass |
| SAFE-02 | 02-01 | Command allow-list with trailing-space/first-token check | SATISFIED | security.ts line 64: split(/\s+/)[0] first-token extraction; prevents gitevil attack |
| SAFE-03 | 02-01 | Default allow-list: 13 safe commands, rm/curl/wget/sudo/ssh excluded | SATISFIED | security.ts lines 35-49: exact 13 commands; test "contains exactly the 13 specified commands" and "does NOT include dangerous commands" pass |
| SAFE-04 | 02-01 / 02-04 | Process group killed on timeout (Unix: kill(-pid, SIGTERM)) | SATISFIED | tools.ts line 231: `process.kill(-child.pid!, "SIGTERM")` in manual setTimeout; `timedOut` flag coordinates callback; `clearTimeout` on close; conditional spread keeps built-in timeout only for Windows |
| SAFE-05 | 02-01 | Subprocess env inherits only PATH, HOME, USER, LANG -- API keys not leaked | SATISFIED | security.ts ALLOWED_ENV_KEYS + buildSafeEnv; tools.ts line 171: env=buildSafeEnv(); ANTHROPIC_API_KEY test passes |
| SAFE-06 | 02-01 | Bash output capped at 1MB with truncation notice | SATISFIED | security.ts truncateOutput with binary-search; tools.ts line 201: applied to bash output; truncation tests pass |
| SAFE-07 | 02-01 | shellMode: full escape hatch with printed warning | SATISFIED | tools.ts line 204: appends warning; security.ts isShellModeRestricted; test passes |
| LOOP-01 | 02-02 | Agent loop posts to /api/chat with stream:false, tool definitions, full message history | SATISFIED | ollama.ts: typed request with stream:false; loop.ts line 70: TOOL_DEFINITIONS passed; messages array maintained across iterations |
| LOOP-02 | 02-03 | Loop continues until final text response (no tool calls) or max iterations | SATISFIED | loop.ts line 82: breaks on empty tool_calls; line 64: while (iteration < maxIterations) |
| LOOP-03 | 02-03 | Each tool call result returned as role:"tool" message (even on error) | SATISFIED | loop.ts line 109: messages.push({role:"tool"}) runs unconditionally after executeTool |
| LOOP-04 | 02-03 | Assistant message appended BEFORE tool results on each iteration | SATISFIED | loop.ts line 77: messages.push(assistantMessage) before the tool_calls loop at line 93 |
| LOOP-05 | 02-03 | Max iterations enforced with clear message on limit hit | SATISFIED | loop.ts line 64 + 114-120: guard + stoppedByLimit detection; index.ts line 74: "[stopped: max iterations reached (10)]" |
| TOOL-01 | 02-02 | read_file(path) — reads file contents, path-safe | SATISFIED | tools.ts lines 113-121: assertPathSafe then fs.readFile; 3 tests pass |
| TOOL-02 | 02-02 | write_file(path, content) — writes file, path-safe | SATISFIED | tools.ts lines 123-134: assertPathSafe + mkdir recursive + writeFile; 3 tests pass |
| TOOL-03 | 02-02 | list_dir(path) — lists directory contents, path-safe | SATISFIED | tools.ts lines 136-152: assertPathSafe + readdir + stat; 2 tests pass |
| TOOL-04 | 02-02 | bash(command) — executes shell command, restricted by allow-list | SATISFIED | tools.ts lines 154-245: assertCommandAllowed in restricted mode, buildSafeEnv, truncateOutput, process group kill; tests pass |
| TOOL-05 | 02-02 | Tool descriptions are meaningful for model tool selection | SATISFIED | TOOL_DEFINITIONS: all 4 descriptions >50 chars with specific usage guidance; test validates length |

**All 17 requirement IDs from plan frontmatter accounted for. All now SATISFIED.**

**Orphaned requirements check:** REQUIREMENTS.md maps SAFE-01 through SAFE-07 and LOOP-01 through LOOP-05 and TOOL-01 through TOOL-05 to Phase 2. All 17 are covered. No orphaned requirements.

### Anti-Patterns Found

No anti-patterns found:
- No console.log in any source file
- No TODO/FIXME/HACK/placeholder comments in source files
- No stub return values (no `return {}`, `return []`, `return null` in handlers)
- No "not implemented" strings
- No void stubs
- All documented commit hashes verified in git log (including 02-04 gap closure commits 37d1be7 and 2fb5a42)

### Human Verification Required

#### 1. Process Group Kill on Timeout (Unix)

**Test:** On a Unix/Mac machine, use MCP Inspector to invoke `run_local_agent` with a prompt that causes the agent to run `bash -c 'bash -c "sleep 60" & echo started'`. Set TIMEOUT_MS to 500ms temporarily. After timeout, run `ps aux | grep sleep`.
**Expected:** The grandchild `sleep 60` process is dead after the bash executor times out.
**Why human:** The new test (tools.test.ts line 114) is skipped on Windows. Automated verification requires a Unix execution environment with live processes. Code evidence is complete: `process.kill(-child.pid!, "SIGTERM")` is wired correctly.

#### 2. End-to-End Agent Loop with Ollama

**Test:** With Ollama running and `qwen2.5-coder:7b` available, connect via MCP Inspector and call `run_local_agent` with prompt "List the files in the current directory and tell me what you see".
**Expected:** Response contains an execution log line like `list_dir(path=".") → N lines` followed by the model's summary of what it found.
**Why human:** Requires a live Ollama instance; not testable programmatically without it.

### Re-Verification Summary

The single gap from initial verification has been closed:

**SAFE-04 — Process Group Kill (CLOSED):** Plan 02-04 replaced `execFile`'s built-in `timeout` option with a manual `setTimeout` that calls `process.kill(-child.pid!, "SIGTERM")` on Unix. The implementation in `src/tools.ts` contains all required elements: `let timedOut = false` (line 174), conditional spread giving Unix `detached:true` and Windows `timeout:timeoutMs` (lines 183-185), the `setTimeout` firing `process.kill(-child.pid!, "SIGTERM")` (lines 228-235), and `clearTimeout` on the `close` event (lines 237-239). The new "kills grandchild processes on timeout" test (tools.test.ts line 114) is skipped on Windows but verifies the behavior on Unix. All 90 tests pass (7 skipped on Windows for Unix-only bash tests). Commits 37d1be7 and 2fb5a42 confirmed in git log.

All 17 requirements are now SATISFIED. Status upgraded from `gaps_found` to `human_needed` — automated checks are complete and the only remaining items require a live execution environment.

---

_Verified: 2026-03-21T16:35:00Z_
_Verifier: Claude (gsd-verifier)_
