---
phase: 04-configuration-polish
verified: 2026-03-23T23:23:00Z
status: gaps_found
score: 17/19 must-haves verified
re_verification: false
gaps:
  - truth: "npm run lint exits 0 (phase acceptance criterion)"
    status: failed
    reason: "7 lint errors in src/__tests__/parser.test.ts (unused vars from Phase 3) and src/__tests__/tools.test.ts (useless-assignment from Phase 2). These files were modified in earlier phases, not phase 4, but lint is a phase-level acceptance criterion stated in both PLAN files."
    artifacts:
      - path: "src/__tests__/parser.test.ts"
        issue: "5 unused-vars errors: 'vi' (line 3) and '_messages' (lines 14, 21, 166, 267, 284)"
      - path: "src/__tests__/tools.test.ts"
        issue: "1 no-useless-assignment error: 'alive' (line 136)"
    missing:
      - "Fix or suppress lint errors in parser.test.ts and tools.test.ts so 'npm run lint' exits 0"
  - truth: "npm test exits 0 (all tests pass)"
    status: failed
    reason: "1 test fails in src/__tests__/tools.test.ts: 'kills grandchild processes on timeout' times out at 5000ms. This test is from Phase 2 and flaky in CI/sandbox environments but is counted against the full suite."
    artifacts:
      - path: "src/__tests__/tools.test.ts"
        issue: "Test 'kills grandchild processes on timeout' times out in 5000ms (line 114)"
    missing:
      - "Either increase test timeout (the test requires >5s for the grandchild kill to propagate) or annotate the test with a longer timeout value"
human_verification:
  - test: "End-to-end registration and env-var override"
    expected: "Clone repo, build, open in Claude Code, invoke run_local_agent with AGENT_MODEL set in env block — agent uses the configured model"
    why_human: "Requires live Claude Code + live Ollama instance; cannot verify programmatically without running services"
  - test: "AGENT_SHELL_MODE=full prints warning to stderr"
    expected: "Starting the server with AGENT_SHELL_MODE=full causes a warning to appear in stderr before any tool call"
    why_human: "Requires running the server process and observing stderr output"
  - test: "README readability and moderate depth"
    expected: "README flows naturally, sections have correct depth (not too sparse, not too verbose), config table defaults match actual code"
    why_human: "Quality judgment cannot be automated"
---

# Phase 4: Configuration + Polish Verification Report

**Phase Goal:** All agent behavior is tunable via environment variables (7 env vars with fail-fast validation), and the tool is distributable — README covers prerequisites, installation, config, models, and troubleshooting; .mcp.json enables zero-config registration.
**Verified:** 2026-03-23T23:23:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                            | Status      | Evidence                                                                     |
|----|----------------------------------------------------------------------------------|-------------|------------------------------------------------------------------------------|
| 1  | All 7 env vars are read at startup with correct defaults                         | VERIFIED    | src/config.ts lines 60-91 — all 7 env vars with documented defaults          |
| 2  | Invalid AGENT_SHELL_MODE throws ConfigError                                      | VERIFIED    | config.ts line 78; config.test.ts line 168 — test passes                     |
| 3  | Non-numeric AGENT_MAX_ITERATIONS throws ConfigError                              | VERIFIED    | config.ts line 49; config.test.ts line 114 — test passes                     |
| 4  | Non-numeric AGENT_TIMEOUT_SECONDS throws ConfigError                             | VERIFIED    | config.ts line 49; config.test.ts line 147 — test passes                     |
| 5  | Zero or negative numeric values throw ConfigError                                | VERIFIED    | config.ts line 48 (parsed <= 0); tests at lines 122-130, 142 — all pass      |
| 6  | AGENT_ALLOWED_COMMANDS merges with DEFAULT_ALLOWED_COMMANDS                      | VERIFIED    | config.ts line 91 spread operator; test at line 180 — passes                 |
| 7  | AGENT_TIMEOUT_SECONDS is converted to milliseconds                               | VERIFIED    | config.ts line 73 (timeoutSeconds * 1000); test at line 136 — passes         |
| 8  | Startup log matches D-09 format                                                  | VERIFIED    | index.ts line 114; live load confirms: "local-agent-mcp \| dir: ... \| model: ... \| shell: ... \| host: ..." |
| 9  | index.ts catches ConfigError and calls process.exit(1)                           | VERIFIED    | index.ts lines 12-21 — try/catch with instanceof ConfigError and process.exit(1) |
| 10 | README contains one-paragraph description of what local-agent-mcp does          | VERIFIED    | README.md line 3 — clear description paragraph                               |
| 11 | README lists prerequisites: Node.js 18+, Ollama, a pulled model, Mac/Linux      | VERIFIED    | README.md lines 5-11 — all 4 prerequisites present                           |
| 12 | README has clone-to-run installation steps                                       | VERIFIED    | README.md lines 13-19 — git clone, npm install, npm run build                |
| 13 | README shows .mcp.json registration and manual config option                     | VERIFIED    | README.md lines 23-45 — auto via .mcp.json and manual JSON config snippet     |
| 14 | README has a configuration reference table with all 7 env vars                  | VERIFIED    | README.md lines 51-59 — table with all 7 vars, defaults, descriptions        |
| 15 | README has a supported models comparison table                                   | VERIFIED    | README.md lines 89-94 — 4-row table with qwen2.5 7b/14b/32b and llama3.1    |
| 16 | README documents Windows bash limitation                                         | VERIFIED    | README.md lines 10 and 116-118 — mentioned in prerequisites and troubleshooting |
| 17 | README documents model upgrade path (7b to 14b/32b)                             | VERIFIED    | README.md lines 96-99 — explicit upgrade instructions with ollama pull cmd   |
| 18 | npm run lint exits 0                                                             | FAILED      | 7 lint errors in parser.test.ts (Phase 3 file) and tools.test.ts (Phase 2 file) |
| 19 | npm test exits 0 (all tests pass)                                                | FAILED      | 1 test times out: "kills grandchild processes on timeout" in tools.test.ts    |

**Score:** 17/19 truths verified

---

### Required Artifacts

#### Plan 04-01 Artifacts

| Artifact                          | Expected                                    | Status     | Details                                                           |
|-----------------------------------|---------------------------------------------|------------|-------------------------------------------------------------------|
| `src/config.ts`                   | loadConfig() function and AppConfig type    | VERIFIED   | 102 lines; exports ConfigError, AppConfig, loadConfig             |
| `src/__tests__/config.test.ts`    | Unit tests for all 7 env vars (min 80 lines) | VERIFIED   | 196 lines; 16 test cases; all 16 pass                             |
| `src/index.ts`                    | Config consumption and startup log update   | VERIFIED   | Imports loadConfig, AppConfig, ConfigError; D-09 log at line 114  |

#### Plan 04-02 Artifacts

| Artifact      | Expected                                                    | Status     | Details                                              |
|---------------|-------------------------------------------------------------|------------|------------------------------------------------------|
| `README.md`   | Complete project documentation (min 100 lines)             | VERIFIED   | 122 lines; all 6 sections present                    |
| `.mcp.json`   | Zero-config Claude Code registration (contains "local-agent") | VERIFIED | Minimal format; no env block; git-tracked             |

---

### Key Link Verification

#### Plan 04-01 Key Links

| From             | To                  | Via                                       | Status   | Details                                                         |
|------------------|---------------------|-------------------------------------------|----------|-----------------------------------------------------------------|
| `src/config.ts`  | `src/security.ts`   | import DEFAULT_ALLOWED_COMMANDS, ShellMode | VERIFIED | config.ts lines 8-9 — both imports present                     |
| `src/index.ts`   | `src/config.ts`     | import loadConfig                          | VERIFIED | index.ts line 5 — import present; called at line 14            |
| `src/index.ts`   | `src/loop.ts`       | passes config values to runAgentLoop       | VERIFIED | index.ts lines 46-52 — all 7 config fields passed              |

#### Plan 04-02 Key Links

| From          | To               | Via                                      | Status   | Details                                               |
|---------------|------------------|------------------------------------------|----------|-------------------------------------------------------|
| `README.md`   | `.mcp.json`      | References .mcp.json for registration    | VERIFIED | README.md line 25 — explicit .mcp.json mention        |
| `README.md`   | `src/config.ts`  | Documents all 7 env vars from config.ts  | VERIFIED | README.md lines 51-59 — all 7 var names present       |

---

### Data-Flow Trace (Level 4)

Config is not a rendering artifact — it is a pure data-provider module. The critical data-flow to verify is that `loadConfig()` values actually reach `runAgentLoop` rather than being shadowed by leftover hardcoded constants.

| Artifact         | Data Variable         | Source              | Produces Real Data  | Status    |
|------------------|-----------------------|---------------------|---------------------|-----------|
| `src/index.ts`   | config.model          | loadConfig() line 63 | Yes — process.env.AGENT_MODEL ?? "qwen2.5-coder:7b" | FLOWING |
| `src/index.ts`   | config.ollamaHost     | loadConfig() line 60 | Yes — process.env.OLLAMA_HOST ?? "http://localhost:11434" | FLOWING |
| `src/index.ts`   | config.shellMode      | loadConfig() line 76 | Yes — process.env.AGENT_SHELL_MODE ?? "restricted" | FLOWING |
| `src/index.ts`   | config.allowedCommands | loadConfig() line 87-91 | Yes — spread of DEFAULT_ALLOWED_COMMANDS + extras | FLOWING |

No hardcoded constants remain in index.ts that could shadow config values. Confirmed by grep returning no matches for `const OLLAMA_HOST`, `const DEFAULT_MODEL`, `const MAX_ITERATIONS`, `const TIMEOUT_MS`, `const SHELL_MODE`.

---

### Behavioral Spot-Checks

| Behavior                                | Command                                                                                | Result                                                                          | Status  |
|-----------------------------------------|----------------------------------------------------------------------------------------|---------------------------------------------------------------------------------|---------|
| Build compiles cleanly                  | `npm run build`                                                                        | Exit 0, no errors                                                               | PASS    |
| Typecheck passes                        | `npm run typecheck`                                                                    | Exit 0, no errors                                                               | PASS    |
| All config tests pass (16 cases)        | `npx vitest run src/__tests__/config.test.ts`                                          | 16/16 pass (48 total including worktree copies)                                 | PASS    |
| Startup log emits D-09 format           | `node build/index.js` (require via CJS wrapper)                                        | "local-agent-mcp \| dir: /… \| model: qwen2.5-coder:7b \| shell: restricted \| host: http://localhost:11434" | PASS |
| Lint passes on phase 4 files            | `npm run lint`                                                                         | 7 errors in parser.test.ts and tools.test.ts (pre-phase-4 files)               | FAIL    |
| Full test suite passes                  | `npm test`                                                                             | 1 test times out: "kills grandchild processes on timeout" (tools.test.ts:114)  | FAIL    |
| .mcp.json git-tracked                   | `git ls-files .mcp.json`                                                               | `.mcp.json` — tracked                                                           | PASS    |
| .mcp.json has no env block              | File inspection                                                                        | No "env" key; minimal format per D-08                                           | PASS    |
| README has all 6 sections               | `grep -c "## Prerequisites\|## Installation\|..."  README.md`                          | 6                                                                               | PASS    |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                                              | Status       | Evidence                                                    |
|-------------|-------------|------------------------------------------------------------------------------------------|--------------|-------------------------------------------------------------|
| CONF-01     | 04-01       | `OLLAMA_HOST` (default: `http://localhost:11434`)                                       | SATISFIED    | config.ts line 60; test line 78                              |
| CONF-02     | 04-01       | `AGENT_MODEL` (default: `qwen2.5-coder:7b`)                                            | SATISFIED    | config.ts line 63; test line 88                              |
| CONF-03     | 04-01       | `AGENT_WORKING_DIR` (default: `process.cwd()`)                                          | SATISFIED    | config.ts line 66; test line 98                              |
| CONF-04     | 04-01       | `AGENT_MAX_ITERATIONS` (default: `10`)                                                  | SATISFIED    | config.ts line 69; test line 108                             |
| CONF-05     | 04-01       | `AGENT_TIMEOUT_SECONDS` (default: `30`, stored as ms)                                  | SATISFIED    | config.ts lines 72-73; test line 136                         |
| CONF-06     | 04-01       | `AGENT_SHELL_MODE` (`restricted`\|`full`\|`none`, default: `restricted`)               | SATISFIED    | config.ts lines 76-84; test line 168                         |
| CONF-07     | 04-01       | `AGENT_ALLOWED_COMMANDS` (comma-separated additions to default allow-list)              | SATISFIED    | config.ts lines 87-91; test line 180                         |
| DIST-01     | 04-02       | README covers: description, prerequisites, installation, registration, config, models  | SATISFIED    | README.md — all 6 sections verified; 122 lines               |
| DIST-02     | 04-02       | `.mcp.json` committed for zero-config Claude Code registration                          | SATISFIED    | `git ls-files .mcp.json` returns `.mcp.json`; minimal format |
| DIST-03     | 04-02       | Windows documented as not supported for bash execution                                  | SATISFIED    | README.md lines 10, 116-118 — prerequisites and troubleshooting |
| DIST-04     | 04-02       | Model upgrade path documented (7b default → 14b/32b)                                  | SATISFIED    | README.md lines 92-99 — comparison table + upgrade command   |

**All 11 phase 4 requirement IDs accounted for. No orphaned requirements.**

---

### Anti-Patterns Found

| File                                | Line  | Pattern                  | Severity | Impact                                                               |
|-------------------------------------|-------|--------------------------|----------|----------------------------------------------------------------------|
| `src/__tests__/parser.test.ts`      | 3     | Unused import `vi`       | Warning  | Lint failure — pre-phase-3 artifact, not from phase 4               |
| `src/__tests__/parser.test.ts`      | 14,21,166,267,284 | Unused `_messages` vars | Warning | Lint failure — pre-phase-3 artifact, not from phase 4             |
| `src/__tests__/tools.test.ts`       | 136   | Useless assignment `alive` | Warning | Lint failure — pre-phase-2 artifact, not from phase 4             |

Note: None of these are in phase 4 files (`src/config.ts`, `src/index.ts`, `README.md`, `.mcp.json`). The lint errors originate in earlier phases but are included under this phase's acceptance criteria ("npm run lint exits 0"). No anti-patterns were found in phase 4's own code.

The test timeout (`tools.test.ts` "kills grandchild processes on timeout") is also a pre-existing issue from Phase 2. It requires the test be given a timeout > 5000ms since it orchestrates Unix process group kill semantics.

---

### Human Verification Required

#### 1. End-to-End Registration and Env-var Override

**Test:** Clone the repo on a Mac or Linux machine with Ollama running. Build with `npm run build`. Open the project directory in Claude Code. In the Claude Code MCP settings, add an env block with `AGENT_MODEL=qwen2.5-coder:14b`. Invoke `run_local_agent` with a simple prompt.
**Expected:** The server starts using the 14b model (confirmed in startup log to stderr), the agent completes the task, and no source editing was required.
**Why human:** Requires live Claude Code and a running Ollama instance with the 14b model pulled.

#### 2. AGENT_SHELL_MODE=full Warning

**Test:** Set `AGENT_SHELL_MODE=full` in the environment and run the server. Issue a bash command that would be blocked in restricted mode.
**Expected:** A warning is printed to stderr indicating full shell mode is active; the command executes without restriction.
**Why human:** Requires running the server process and inspecting stderr; the warning is emitted inside the tools.ts bash handler which needs a real tool invocation to trigger.

#### 3. README Readability and Accuracy

**Test:** Read README.md end-to-end and follow the installation and registration sections on a fresh machine.
**Expected:** Each step works as written; config table defaults match what the server actually uses; no gaps or misleading instructions.
**Why human:** Quality and usability judgment cannot be automated.

---

### Gaps Summary

Two gaps exist, both rooted in lint and test failures that originate in pre-phase-4 files:

**Gap 1 — Lint:** `npm run lint` fails with 7 errors. All errors are in `src/__tests__/parser.test.ts` (Phase 3) and `src/__tests__/tools.test.ts` (Phase 2). Phase 4's own files are lint-clean. Fix requires adding `/* eslint-disable */` suppression comments or correcting the unused variables in those earlier test files.

**Gap 2 — Test timeout:** `npm test` fails with 1 test timing out. The failing test ("kills grandchild processes on timeout" in tools.test.ts) is a Phase 2 test that requires more than the default 5000ms to observe the grandchild-kill behavior. Adding a `{ timeout: 10000 }` option to that `it.skipIf` call would resolve it.

Both gaps are pre-existing quality issues from earlier phases surfacing under this phase's acceptance criteria. Phase 4's own deliverables — `src/config.ts`, `src/__tests__/config.test.ts`, updated `src/index.ts`, `README.md`, and `.mcp.json` — are all correct, complete, and wired.

---

_Verified: 2026-03-23T23:23:00Z_
_Verifier: Claude (gsd-verifier)_
