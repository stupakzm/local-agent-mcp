---
status: complete
phase: 02-agent-loop-tools-safety
source: [02-VERIFICATION.md]
started: 2026-03-21T00:00:00Z
updated: 2026-03-23T17:55:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Process group kill on Unix (SAFE-04)
expected: When a bash command spawns a grandchild process and the timeout fires, both the child and grandchild processes are killed. The grandchild PID should be non-existent after the timeout resolves.
result: issue
reported: "Automated test timed out (5000ms) — Promise from executeTool never resolved. Root cause: execFile with detached:true does NOT create a new process group on Linux (child PGID = parent PGID). process.kill(-child.pid, SIGTERM) threw ESRCH silently; catch block swallowed it; child kept running indefinitely. Fixed by replacing execFile with spawn — spawn with detached:true correctly sets PGID=child.pid. All 49 tests now pass including kills-grandchild test (505ms)."
severity: blocker
fix_applied: "Replaced execFile with spawn in src/tools.ts bashExec. Removed unused MAX_OUTPUT_BYTES import."

### 2. End-to-end agent loop with Ollama (LOOP-01 through LOOP-05)
expected: With `qwen2.5-coder:7b` running locally, an MCP client (MCP Inspector) can send a `run_agent` request. The agent calls Ollama, parses native tool calls, executes file/shell operations, and returns a completed result within the configured turn limit.
result: issue
reported: "qwen2.5-coder:7b (and 14b) do not return native tool_calls — they embed the tool call as JSON text in the content field (e.g. content: '{\"name\":\"list_dir\",\"arguments\":{\"path\":\".\"}}'). The agent loop only checks toolCalls field; sees it empty; treats content as finalMessage; breaks immediately without executing any tools. The MCP response contains the raw tool-call JSON string instead of an execution log + summary."
severity: blocker

## Summary

total: 2
passed: 0
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "When a bash command spawns a grandchild process and the timeout fires, both child and grandchild are killed within the timeout window"
  status: fixed
  reason: "execFile with detached:true inherits parent PGID on Linux; process.kill(-child.pid) threw ESRCH; catch swallowed it; promise never resolved. Fixed: replaced execFile with spawn."
  severity: blocker
  test: 1
  artifacts: [src/tools.ts]
  missing: []

- truth: "With Ollama running and qwen2.5-coder:7b, the agent loop executes tool calls and returns an execution log with list_dir(path=.) → N lines followed by a model summary"
  status: failed
  reason: "qwen2.5-coder:7b does not use native tool_calls format — embeds tool call JSON in content field. Loop never executes tools. Response is the raw JSON tool-call string."
  severity: blocker
  test: 2
  artifacts: [src/loop.ts, src/ollama.ts]
  missing: ["content-field tool call parsing fallback, OR model that supports native tool_calls"]
