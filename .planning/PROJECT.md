# local-agent-mcp

## What This Is

A TypeScript/Node.js MCP server that exposes a `run_local_agent` tool to Claude Code. When invoked, it runs a local Ollama model in its own tool loop — the model receives tool definitions (read_file, write_file, bash, list_dir), outputs structured JSON tool calls, and the server executes them and feeds results back until the task is done. Built for open-source release so any Claude Code user can register it and gain a local, private, free-tier agent.

## Core Value

Claude Code delegates tasks to a local Ollama model that actually executes them — closing the loop from tool call to result without any cloud API calls.

## Requirements

### Validated

- [x] MCP server exposes `run_local_agent(prompt, model)` tool to Claude Code — *Validated in Phase 1: MCP Server Shell*
- [x] Easy Claude Code MCP registration (`.mcp.json` zero-config) — *Validated in Phase 1: MCP Server Shell*

### Active

- [ ] Ollama tool loop: call API → parse tool calls → execute → feed back → repeat until done
- [ ] Ollama tool loop: call API → parse tool calls → execute → feed back → repeat until done
- [ ] Local tools implemented: read_file, write_file, bash, list_dir
- [ ] Robust tool call parsing: best-effort JSON extraction with multiple fallback strategies
- [ ] Retry logic on malformed model output
- [ ] Safety layer: path restrictions, bash command allow-list, configurable sandboxing
- [ ] Works daily-use ready with qwen2.5-coder, llama3.1, and mistral
- [ ] Clear README installation guide
- [ ] Open-source quality: README, setup UX, installation guide

### Out of Scope

- GUI or web UI — this is a CLI/MCP tool only
- Supporting non-Ollama backends (OpenAI, Anthropic) — Ollama-first, v2+ concern
- Bundling into GSD — standalone first, GSD wiring is a separate integration step
- Fine-tuning or training local models — runtime tool use only

## Current State

Phase 1 complete — MCP server shell proven. Transport layer validates end-to-end: `npm run build` compiles, server starts on stdio, `run_local_agent` stub returns correct response, `.mcp.json` registered. Phase 2 (agent loop) is next.

## Context

- Claude Code supports MCP servers natively; this plugs in as a standard MCP config entry
- Ollama's API supports function/tool calling for qwen2.5-coder:32b, llama3.1, mistral
- The hard part is reliability: local models are inconsistent at structured tool call output, so robust JSON parsing and retry logic are critical
- Target audience: Claude Code users who want cost savings, privacy, or local execution — not just the author
- MCP SDK for Node.js/TypeScript is mature and well-documented

## Constraints

- **Tech stack**: TypeScript + Node.js — better native MCP SDK support
- **Runtime dependency**: Ollama must be installed and running locally (user-managed)
- **Safety**: bash tool must be restricted by default; open-ended shell access is a non-starter for open-source distribution
- **Compatibility**: Must support the models that actually implement tool calling (qwen2.5-coder, llama3.1, mistral)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript over Python | Better native MCP SDK, lighter runtime for MCP server use case | — Pending |
| Standalone repo, not GSD-bundled | Generic enough to be useful without GSD; GSD can wire it later | — Pending |
| Ollama-only for v1 | Keeps scope tight; Ollama covers the local model use case completely | — Pending |
| Robust parsing over fail-fast | Open-source tool needs to handle model inconsistency gracefully | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-21 after Phase 1 completion*
