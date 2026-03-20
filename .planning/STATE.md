# Project State: local-agent-mcp

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-20)

**Core value:** Claude Code delegates tasks to a local Ollama model that actually executes them — closing the loop from tool call to result without any cloud API calls.
**Current focus:** Phase 1 — MCP Server Shell

## Current Status

**Milestone:** v1.0
**Phase:** 1 of 4
**Status:** Ready to plan

## Phase Overview

| Phase | Name | Status | Requirements |
|-------|------|--------|--------------|
| 1 | MCP Server Shell | ○ Pending | MCP-01–04 |
| 2 | Agent Loop + Tools + Safety | ○ Pending | LOOP-01–05, TOOL-01–05, SAFE-01–07 |
| 3 | Robust Parsing Pipeline | ○ Pending | PARSE-01–06 |
| 4 | Configuration + Polish | ○ Pending | CONF-01–07, DIST-01–04 |

## Notes

- Default model: qwen2.5-coder:7b (user upgrades to 14b/32b via AGENT_MODEL)
- Windows: Mac/Linux only for bash execution; taskkill support deferred to v2
- Bash on by default in restricted mode (allow-list)
- Run OLLAMA.md section 10 validation checklist against live Ollama before Phase 3 coding

---
*Last updated: 2026-03-20 after project initialization*
