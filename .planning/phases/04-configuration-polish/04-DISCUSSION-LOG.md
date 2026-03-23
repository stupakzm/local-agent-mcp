# Phase 4: Configuration + Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-23
**Areas discussed:** Config Validation, README Depth & Tone, .mcp.json Committed State, Startup Log Verbosity

---

## Config Validation

**Q: What should happen when AGENT_SHELL_MODE=typo (unrecognized value)?**
- Options: Fail-fast on startup / Warn and use default
- Selected: **Fail-fast on startup**

**Q: What should happen when AGENT_MAX_ITERATIONS=abc (not a number)?**
- Options: Fail-fast on startup / Warn and use default
- Selected: **Fail-fast on startup**

**Q: What about AGENT_TIMEOUT_SECONDS=0 or negative (semantically wrong)?**
- Options: Fail-fast / Clamp to minimum
- Selected: **Fail-fast**

---

## README Depth & Tone

**Q: How thorough should the README be?**
- Options: Moderate with examples / Minimal get-started / Comprehensive
- Selected: **Moderate with examples** — all 6 required sections, concrete examples, not a wall of text

**Q: Should the README include a troubleshooting section?**
- Options: Yes — common errors only / No
- Selected: **Yes — common errors only** (3-4 items: Ollama not running, model not pulled, permission errors)

**Q: Should the supported models section include a comparison table?**
- Options: Brief table / Prose only
- Selected: **Brief table** — model name, size, tool-call reliability, recommended use

---

## .mcp.json Committed State

**Q: Should the committed .mcp.json include an env block?**
- Options: No env block (minimal) / Commented-out env block with defaults
- Selected: **No env block** — keep minimal, document env vars in README only

---

## Startup Log Verbosity

**Q: What should the startup log show after Phase 4?**
- Options: Key values only / All 7 config values / Keep current format
- Selected: **Key values only** — format: `local-agent-mcp | dir: X | model: Y | shell: Z | host: W`
