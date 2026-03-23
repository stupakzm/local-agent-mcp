---
status: complete
phase: 02-agent-loop-tools-safety
source: [02-VERIFICATION.md]
started: 2026-03-21T00:00:00Z
updated: 2026-03-23T18:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Process group kill on Unix (SAFE-04)
expected: When a bash command spawns a grandchild process and the timeout fires, both the child and grandchild processes are killed. The grandchild PID should be non-existent after the timeout resolves.
result: issue
reported: "Automated test timed out (5000ms) — Promise from executeTool never resolved. Root cause: execFile with detached:true does NOT create a new process group on Linux (child PGID = parent PGID). process.kill(-child.pid, SIGTERM) threw ESRCH silently; catch block swallowed it; child kept running indefinitely. Fixed by replacing execFile with spawn — spawn with detached:true correctly sets PGID=child.pid. All 49 tests now pass including kills-grandchild test (505ms)."
severity: blocker
fix_applied: "Replaced execFile with spawn in src/tools.ts bashExec. Commit: 7923776"
fix_verified: "npm test: 49 passed, grandchild kill test: 505ms"

### 2. End-to-end agent loop with Ollama (LOOP-01 through LOOP-05)
expected: With `qwen2.5-coder:7b` running locally, an MCP client (MCP Inspector) can send a `run_agent` request. The agent calls Ollama, parses native tool calls, executes file/shell operations, and returns a completed result within the configured turn limit.
result: issue
reported: "qwen2.5-coder:7b does not use native tool_calls — embeds tool call as JSON text (optionally in a markdown code fence) in the content field. Loop never detected or executed tools. Fixed by adding parseContentToolCalls() fallback in loop.ts that strips markdown fences, parses JSON, validates shape, and synthesizes OllamaToolCall[] for the existing execution path. Commit: 489aaf5"
severity: blocker
fix_applied: "Added parseContentToolCalls() helper in src/loop.ts with markdown fence stripping. Commit: 489aaf5"
fix_verified: "E2E MCP test: [agent] iteration 1: 1 tool call(s) | list_dir(path=.) → 14 lines | model summary returned correctly"

## Summary

total: 2
passed: 0
issues: 2
fixed: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "When a bash command spawns a grandchild process and the timeout fires, both child and grandchild are killed within the timeout window"
  status: fixed
  reason: "execFile with detached:true inherits parent PGID on Linux; process.kill(-child.pid) threw ESRCH; catch swallowed it; promise never resolved."
  fix: "Replaced execFile with spawn in src/tools.ts. PGID now equals child.pid. All 49 tests pass."
  severity: blocker
  test: 1
  artifacts: [src/tools.ts]

- truth: "With Ollama running and qwen2.5-coder:7b, the agent loop executes tool calls and returns an execution log with list_dir(path=.) → N lines followed by a model summary"
  status: fixed
  reason: "qwen2.5-coder:7b embeds tool calls as JSON text (with optional markdown fence) in content field. Loop only checked tool_calls field."
  fix: "Added parseContentToolCalls() fallback in src/loop.ts. Handles bare JSON and markdown-fenced JSON. Conservative: wrong shape falls through to plain-text finalMessage."
  severity: blocker
  test: 2
  artifacts: [src/loop.ts]
