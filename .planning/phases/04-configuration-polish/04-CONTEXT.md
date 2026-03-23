# Phase 4: Configuration + Polish - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire 7 env-var config values into a `src/config.ts` module, write the README, and make the tool usable by any Claude Code user — no source editing required. Deliverable: `src/config.ts` read at startup, all constants in `src/index.ts` replaced with config values, full README, committed `.mcp.json` unchanged.

</domain>

<decisions>
## Implementation Decisions

### Config Validation

- **D-01:** `AGENT_SHELL_MODE` with an unrecognized value (not `restricted` | `full` | `none`) → fail-fast: log a clear error to stderr (e.g., `AGENT_SHELL_MODE=typo is not valid, expected: restricted | full | none`) and `process.exit(1)` before the server starts.
- **D-02:** `AGENT_MAX_ITERATIONS` or `AGENT_TIMEOUT_SECONDS` with a non-numeric value → fail-fast: same pattern — clear error to stderr and exit 1.
- **D-03:** Semantically invalid numeric values (`AGENT_TIMEOUT_SECONDS=0`, negative numbers) → fail-fast: reject with a clear error. A zero timeout would silently break the bash tool.
- **D-04:** Consistent behavior — all invalid values fail-fast. No warn-and-default silent surprises for users.

### README

- **D-05:** Moderate depth — all 6 required sections (what it is, prerequisites, installation, Claude Code registration, configuration reference, supported models), each with concrete examples. Not a minimal stub, not a wall of text.
- **D-06:** Include a troubleshooting section with 3-4 common errors only: Ollama not running, model not pulled, permission/path errors. High value for open-source first-timers.
- **D-07:** Supported models section uses a brief comparison table: model name, size, tool-call reliability, recommended use. Helps users pick without guessing (qwen2.5-coder primary, llama3.1 fallback, mistral note).

### `.mcp.json` Committed State

- **D-08:** Keep `.mcp.json` minimal — no `env` block. Env vars are documented in README. Users add what they need. Current format stays as-is:
  ```json
  {
    "mcpServers": {
      "local-agent": {
        "command": "node",
        "args": ["build/index.js"]
      }
    }
  }
  ```

### Startup Log

- **D-09:** Log key values only — dir, model, shell mode, and host. Format:
  `local-agent-mcp | dir: /proj | model: qwen2.5-coder:7b | shell: restricted | host: localhost:11434`
  Replaces current format (`local-agent-mcp running on stdio | working dir: X | shell mode: Y`).

### Claude's Discretion

- Exact validation error message wording (beyond the structure shown in D-01)
- Internal `src/config.ts` module shape (single exported object vs named exports — pure-function module style from prior phases is the pattern)
- Whether `AGENT_ALLOWED_COMMANDS` value is trimmed/split on whitespace around commas (e.g., `rm, curl` vs `rm,curl`)
- README section ordering within the troubleshooting section

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Configuration — CONF-01 through CONF-07 (all 7 env vars with defaults)
- `.planning/REQUIREMENTS.md` §Distribution / Open Source — DIST-01 through DIST-04 (README sections, .mcp.json, Windows note, model upgrade path)
- `.planning/ROADMAP.md` §Phase 4 — Key deliverables checklist and success criteria

### No external specs
No external docs — all requirements fully captured above and in REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/index.ts` lines 9–16: hardcoded config constants (`OLLAMA_HOST`, `DEFAULT_MODEL`, `MAX_ITERATIONS`, `TIMEOUT_MS`, `SHELL_MODE`) — `src/config.ts` replaces these. The constants are already named cleanly; env var names map 1:1.
- `src/security.ts` `DEFAULT_ALLOWED_COMMANDS`: exported array — `AGENT_ALLOWED_COMMANDS` parses a comma-separated string and spreads it into a merged allow-list alongside the defaults.

### Established Patterns
- `console.error`-only logging: enforced by ESLint — config validation errors and startup log go to stderr
- Pure-function module style: `security.ts`, `tools.ts`, `parser.ts` all use exported functions, no classes — `config.ts` follows the same (exported `loadConfig()` or exported config object)
- Fail-fast pattern: `process.exit(1)` used elsewhere for fatal startup errors — consistent with D-01 through D-04

### Integration Points
- `src/index.ts` lines 9–16 → `src/config.ts`: replace all 5 hardcoded constants with values from config
- `src/index.ts` line 109 (startup log): update format to D-09 pattern
- `src/security.ts` `DEFAULT_ALLOWED_COMMANDS`: `config.ts` merges `AGENT_ALLOWED_COMMANDS` additions at startup

</code_context>

<specifics>
## Specific Ideas

- Startup log format established in Phase 2 (`working dir: X | shell mode: Y`) — Phase 4 extends to pipe-separated key values. Keep the pipe-delimited style, just add model and host.
- Error messages from Phase 2 hint at the env var that fixes them (e.g., `command not allowed (use AGENT_ALLOWED_COMMANDS to grant access)`) — README troubleshooting section can reference these same env var names for consistency.

</specifics>

<deferred>
## Deferred Ideas

- Per-model `format:'json'` toggle (from Phase 3 deferred) — not added to Phase 4 config. Would require a map of model → format override. Defer to v2.
- None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-configuration-polish*
*Context gathered: 2026-03-23*
