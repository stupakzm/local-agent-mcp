# Phase 4: Configuration + Polish - Research

**Researched:** 2026-03-23
**Domain:** TypeScript environment-variable configuration, README documentation, MCP project distribution
**Confidence:** HIGH

## Summary

Phase 4 is an integration and documentation phase -- no new libraries are introduced. The work involves extracting 5 hardcoded constants from `src/index.ts` into a new `src/config.ts` module that reads 7 environment variables with validated defaults, updating the startup log format, writing a comprehensive README, and confirming `.mcp.json` is committed.

The codebase is well-structured for this change: constants are isolated on lines 9-16 of `src/index.ts`, the `runAgentLoop` function already accepts all config values as an options object, and the `DEFAULT_ALLOWED_COMMANDS` array in `src/security.ts` is already exported for merging. No architectural changes are needed -- this is a wire-and-validate exercise.

**Primary recommendation:** Build `src/config.ts` as a pure-function module (`loadConfig()` that returns a typed config object) with fail-fast validation for all 7 env vars, then replace the hardcoded constants in `src/index.ts` with a single `loadConfig()` call at startup.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `AGENT_SHELL_MODE` with an unrecognized value (not `restricted` | `full` | `none`) -> fail-fast: log a clear error to stderr and `process.exit(1)` before the server starts.
- **D-02:** `AGENT_MAX_ITERATIONS` or `AGENT_TIMEOUT_SECONDS` with a non-numeric value -> fail-fast: same pattern -- clear error to stderr and exit 1.
- **D-03:** Semantically invalid numeric values (`AGENT_TIMEOUT_SECONDS=0`, negative numbers) -> fail-fast: reject with a clear error.
- **D-04:** Consistent behavior -- all invalid values fail-fast. No warn-and-default silent surprises.
- **D-05:** README: moderate depth -- all 6 required sections with concrete examples.
- **D-06:** Include a troubleshooting section with 3-4 common errors only.
- **D-07:** Supported models section uses a brief comparison table.
- **D-08:** Keep `.mcp.json` minimal -- no `env` block. Current format stays as-is.
- **D-09:** Startup log format: `local-agent-mcp | dir: /proj | model: qwen2.5-coder:7b | shell: restricted | host: localhost:11434`

### Claude's Discretion
- Exact validation error message wording (beyond the structure shown in D-01)
- Internal `src/config.ts` module shape (single exported object vs named exports -- pure-function module style from prior phases is the pattern)
- Whether `AGENT_ALLOWED_COMMANDS` value is trimmed/split on whitespace around commas
- README section ordering within the troubleshooting section

### Deferred Ideas (OUT OF SCOPE)
- Per-model `format:'json'` toggle -- deferred to v2
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONF-01 | `OLLAMA_HOST` (default: `http://localhost:11434`) | String env var, no validation beyond presence; config.ts reads `process.env.OLLAMA_HOST` |
| CONF-02 | `AGENT_MODEL` (default: `qwen2.5-coder:7b`) | String env var, no validation beyond presence; config.ts reads `process.env.AGENT_MODEL` |
| CONF-03 | `AGENT_WORKING_DIR` (default: `process.cwd()`) | String env var; could optionally validate path exists with `fs.existsSync` |
| CONF-04 | `AGENT_MAX_ITERATIONS` (default: `10`) | Numeric env var; D-02 + D-03 require fail-fast on non-numeric and <=0 |
| CONF-05 | `AGENT_TIMEOUT_SECONDS` (default: `30`) | Numeric env var; D-02 + D-03 require fail-fast on non-numeric and <=0; multiply by 1000 for `timeoutMs` |
| CONF-06 | `AGENT_SHELL_MODE` (default: `restricted`) | Enum env var; D-01 requires fail-fast on invalid values; ShellMode type already exists in security.ts |
| CONF-07 | `AGENT_ALLOWED_COMMANDS` (comma-separated additions) | Parse, trim, merge with `DEFAULT_ALLOWED_COMMANDS`; discretion on whitespace handling |
| DIST-01 | README covers 6 sections | README structure documented below in Architecture Patterns |
| DIST-02 | `.mcp.json` committed | Already exists and matches D-08 format -- just verify it stays committed |
| DIST-03 | Windows bash limitation documented | README prerequisites or troubleshooting note |
| DIST-04 | Model upgrade path documented | README supported models section with comparison table per D-07 |
</phase_requirements>

## Standard Stack

### Core
No new libraries needed. Phase 4 uses only existing project dependencies.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `process.env` | built-in | Env var reading | Zero-dependency, standard Node.js pattern |
| TypeScript strict mode | 5.9.x | Type safety for config object | Already configured in tsconfig.json |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 3.1.x | Unit tests for config validation | Testing loadConfig() fail-fast behavior |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual env parsing | dotenv / envalid / zod env | Overkill for 7 vars; adds dependency. Manual is fine. |
| zod schema for env | zod (already in deps) | Could work but adds complexity for simple string/number parsing. Not worth it for 7 flat values. |

**Installation:**
No new packages needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
  config.ts          # NEW: loadConfig() + AppConfig type + validation
  index.ts           # MODIFIED: import config, replace hardcoded constants
  security.ts        # MODIFIED: no code change, but config.ts imports DEFAULT_ALLOWED_COMMANDS
  loop.ts            # UNCHANGED: already accepts config via options parameter
  tools.ts           # UNCHANGED
  parser.ts          # UNCHANGED
  ollama.ts          # UNCHANGED
  __tests__/
    config.test.ts   # NEW: validation tests
    security.test.ts # EXISTING
    tools.test.ts    # EXISTING
    parser.test.ts   # EXISTING
```

### Pattern 1: Pure-Function Config Module
**What:** Export a `loadConfig()` function that reads `process.env`, validates, and returns a frozen typed object. No module-level side effects.
**When to use:** Consistent with security.ts, tools.ts, parser.ts patterns in this project.
**Example:**
```typescript
// src/config.ts
import { DEFAULT_ALLOWED_COMMANDS } from "./security.js";
import type { ShellMode } from "./security.js";

export interface AppConfig {
  ollamaHost: string;
  model: string;
  workingDir: string;
  maxIterations: number;
  timeoutMs: number;
  shellMode: ShellMode;
  allowedCommands: readonly string[];
}

export function loadConfig(): AppConfig {
  const shellMode = process.env.AGENT_SHELL_MODE ?? "restricted";
  if (!["restricted", "full", "none"].includes(shellMode)) {
    console.error(
      `AGENT_SHELL_MODE=${shellMode} is not valid, expected: restricted | full | none`
    );
    process.exit(1);
  }

  const maxIterations = parsePositiveInt("AGENT_MAX_ITERATIONS", 10);
  const timeoutSeconds = parsePositiveInt("AGENT_TIMEOUT_SECONDS", 30);

  const extraCommands = process.env.AGENT_ALLOWED_COMMANDS
    ? process.env.AGENT_ALLOWED_COMMANDS.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  return {
    ollamaHost: process.env.OLLAMA_HOST ?? "http://localhost:11434",
    model: process.env.AGENT_MODEL ?? "qwen2.5-coder:7b",
    workingDir: process.env.AGENT_WORKING_DIR ?? process.cwd(),
    maxIterations,
    timeoutMs: timeoutSeconds * 1000,
    shellMode: shellMode as ShellMode,
    allowedCommands: [...DEFAULT_ALLOWED_COMMANDS, ...extraCommands],
  };
}

function parsePositiveInt(envKey: string, defaultValue: number): number {
  const raw = process.env[envKey];
  if (raw === undefined) return defaultValue;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.error(
      `${envKey}=${raw} is not valid, expected: a positive integer`
    );
    process.exit(1);
  }
  return parsed;
}
```

### Pattern 2: Config Consumption in index.ts
**What:** Call `loadConfig()` once at startup, pass values to `runAgentLoop`.
**Example:**
```typescript
// In src/index.ts -- replace hardcoded block
import { loadConfig } from "./config.js";

const config = loadConfig();

// In registerTool handler:
const result = await runAgentLoop({
  prompt,
  model: model ?? config.model,
  host: config.ollamaHost,
  workingDir: config.workingDir,
  maxIterations: config.maxIterations,
  shellMode: config.shellMode,
  allowedCommands: config.allowedCommands,
  timeoutMs: config.timeoutMs,
});

// Updated startup log (D-09):
console.error(
  `local-agent-mcp | dir: ${config.workingDir} | model: ${config.model} | shell: ${config.shellMode} | host: ${config.ollamaHost}`
);
```

### Pattern 3: README Structure (DIST-01)
**What:** Six required sections plus troubleshooting (D-06) and model comparison table (D-07).
**Structure:**
```markdown
# local-agent-mcp

[1-2 sentence description of what it does]

## Prerequisites
- Node.js 18+
- Ollama installed and running
- A pulled model (e.g., `ollama pull qwen2.5-coder:7b`)
- Mac/Linux (Windows not supported for bash execution)

## Installation
git clone, npm install, npm run build steps

## Claude Code Registration
.mcp.json explanation, how to verify

## Configuration Reference
Table of all 7 env vars with defaults and descriptions

## Supported Models
Comparison table: model name | size | tool-call reliability | recommended use

## Troubleshooting
3-4 common errors: Ollama not running, model not pulled, permission/path errors
```

### Anti-Patterns to Avoid
- **Module-level process.exit in config.ts imported at test time:** Tests that import config.ts should not trigger validation. Solution: `loadConfig()` is a function call, not top-level execution. Tests control when it runs.
- **Mutating process.env in tests without cleanup:** Always save/restore env vars in beforeEach/afterEach.
- **Silently defaulting on invalid input:** D-04 explicitly forbids this. Every invalid value must fail-fast.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Env var parsing | Complex parser with types | Simple `process.env` reads + manual validation | Only 7 vars, all flat strings/numbers. A library is overkill. |

**Key insight:** This phase has no "deceptively complex" problems. The validation logic is straightforward -- the only subtlety is the fail-fast consistency requirement (D-04) and ensuring tests can exercise validation without process.exit actually killing the test runner.

## Common Pitfalls

### Pitfall 1: process.exit in Unit Tests
**What goes wrong:** Calling `loadConfig()` with invalid env vars calls `process.exit(1)`, which kills the vitest process.
**Why it happens:** Fail-fast is correct for production but incompatible with test assertions.
**How to avoid:** Either (a) use `vi.spyOn(process, 'exit').mockImplementation()` in tests, or (b) separate validation from exit -- have `loadConfig` throw an error, and have the caller in `index.ts` catch and exit. Option (b) is cleaner and more testable.
**Warning signs:** Tests pass individually but vitest exits unexpectedly.
**Recommendation:** Option (b) -- `loadConfig()` throws a `ConfigError`, `index.ts` catches it and does `console.error` + `process.exit(1)`. Tests assert on the thrown error. This keeps config.ts pure and testable.

### Pitfall 2: AGENT_TIMEOUT_SECONDS vs timeoutMs Confusion
**What goes wrong:** The env var is in seconds but `runAgentLoop` expects milliseconds.
**Why it happens:** Easy to forget the multiplication.
**How to avoid:** Config module converts once: `timeoutMs: timeoutSeconds * 1000`. Downstream code never sees raw seconds.
**Warning signs:** Timeout fires immediately (forgot to multiply) or after 30000 seconds (multiplied twice).

### Pitfall 3: AGENT_ALLOWED_COMMANDS Empty String Edge Case
**What goes wrong:** `"".split(",")` returns `[""]`, which adds an empty string to the allow-list.
**Why it happens:** JS split behavior on empty strings.
**How to avoid:** Filter empty strings after split: `.filter(Boolean)`.
**Warning signs:** Empty command passes allow-list check.

### Pitfall 4: ESLint no-console Rule
**What goes wrong:** `console.log` in config validation fails ESLint.
**Why it happens:** Project enforces `no-console` with only `console.error` allowed.
**How to avoid:** All config output uses `console.error` (stderr). This is already the project pattern.
**Warning signs:** ESLint errors on build.

### Pitfall 5: .mcp.json Already Exists
**What goes wrong:** Creating a new .mcp.json overwrites the existing one.
**Why it happens:** Not checking existing state.
**How to avoid:** `.mcp.json` already exists with correct D-08 content. DIST-02 is already satisfied -- just verify it's tracked by git (not gitignored).
**Warning signs:** N/A -- just verify, don't recreate.

## Code Examples

### Config Validation Error Pattern (D-01 through D-04)
```typescript
// Consistent error format for all validation failures
// Pattern: ENV_VAR=value is not valid, expected: description
export class ConfigError extends Error {
  constructor(envKey: string, value: string, expected: string) {
    super(`${envKey}=${value} is not valid, expected: ${expected}`);
    this.name = "ConfigError";
  }
}
```

### Startup Log (D-09)
```typescript
// Replaces: `local-agent-mcp running on stdio | working dir: ${process.cwd()} | shell mode: ${SHELL_MODE}`
// New format:
console.error(
  `local-agent-mcp | dir: ${config.workingDir} | model: ${config.model} | shell: ${config.shellMode} | host: ${config.ollamaHost}`
);
```

### Test Pattern for Config Validation
```typescript
import { describe, it, expect, afterEach, vi } from "vitest";
import { loadConfig, ConfigError } from "../config.js";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns defaults when no env vars set", () => {
    const config = loadConfig();
    expect(config.ollamaHost).toBe("http://localhost:11434");
    expect(config.model).toBe("qwen2.5-coder:7b");
    expect(config.maxIterations).toBe(10);
    expect(config.timeoutMs).toBe(30000);
    expect(config.shellMode).toBe("restricted");
  });

  it("throws ConfigError for invalid AGENT_SHELL_MODE", () => {
    process.env.AGENT_SHELL_MODE = "typo";
    expect(() => loadConfig()).toThrow(ConfigError);
  });

  it("throws ConfigError for non-numeric AGENT_MAX_ITERATIONS", () => {
    process.env.AGENT_MAX_ITERATIONS = "abc";
    expect(() => loadConfig()).toThrow(ConfigError);
  });

  it("throws ConfigError for zero AGENT_TIMEOUT_SECONDS", () => {
    process.env.AGENT_TIMEOUT_SECONDS = "0";
    expect(() => loadConfig()).toThrow(ConfigError);
  });

  it("merges AGENT_ALLOWED_COMMANDS with defaults", () => {
    process.env.AGENT_ALLOWED_COMMANDS = "rm, curl";
    const config = loadConfig();
    expect(config.allowedCommands).toContain("rm");
    expect(config.allowedCommands).toContain("curl");
    expect(config.allowedCommands).toContain("git"); // default preserved
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded constants in index.ts | Env-var config module | Phase 4 (now) | All behavior tunable without source edits |

No deprecated APIs or breaking changes relevant to this phase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v24.14.0 | -- |
| npm | Build | Yes | 11.9.0 | -- |
| Ollama | Agent loop (runtime) | Yes | 0.18.2 | -- |
| vitest | Tests | Yes | 3.1.x (in devDeps) | -- |

**Missing dependencies with no fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.1.x |
| Config file | None (vitest uses defaults with package.json "test" script) |
| Quick run command | `npx vitest run src/__tests__/config.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONF-01 | OLLAMA_HOST default and override | unit | `npx vitest run src/__tests__/config.test.ts` | Wave 0 |
| CONF-02 | AGENT_MODEL default and override | unit | `npx vitest run src/__tests__/config.test.ts` | Wave 0 |
| CONF-03 | AGENT_WORKING_DIR default and override | unit | `npx vitest run src/__tests__/config.test.ts` | Wave 0 |
| CONF-04 | AGENT_MAX_ITERATIONS validation + default | unit | `npx vitest run src/__tests__/config.test.ts` | Wave 0 |
| CONF-05 | AGENT_TIMEOUT_SECONDS validation + default + ms conversion | unit | `npx vitest run src/__tests__/config.test.ts` | Wave 0 |
| CONF-06 | AGENT_SHELL_MODE enum validation | unit | `npx vitest run src/__tests__/config.test.ts` | Wave 0 |
| CONF-07 | AGENT_ALLOWED_COMMANDS parse + merge | unit | `npx vitest run src/__tests__/config.test.ts` | Wave 0 |
| DIST-01 | README has all 6 sections | manual | Visual inspection | N/A |
| DIST-02 | .mcp.json committed | manual | `git ls-files .mcp.json` | Already committed |
| DIST-03 | Windows limitation documented | manual | Visual inspection | N/A |
| DIST-04 | Model upgrade path documented | manual | Visual inspection | N/A |

### Sampling Rate
- **Per task commit:** `npx vitest run src/__tests__/config.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/config.test.ts` -- covers CONF-01 through CONF-07

## Open Questions

1. **AGENT_WORKING_DIR validation: should it check the directory exists?**
   - What we know: Other config values validate strictly per D-04. But a nonexistent directory will fail naturally when tools try to use it.
   - What's unclear: Whether to fail-fast on nonexistent directory or let it fail at tool use time.
   - Recommendation: Validate with `fs.existsSync` at startup for consistency with D-04. A nonexistent working dir is always a user error.

## Sources

### Primary (HIGH confidence)
- Project source code: `src/index.ts`, `src/security.ts`, `src/loop.ts` -- direct inspection of integration points
- `04-CONTEXT.md` -- locked decisions D-01 through D-09
- `REQUIREMENTS.md` -- CONF-01 through CONF-07, DIST-01 through DIST-04

### Secondary (MEDIUM confidence)
- Node.js `process.env` documentation -- standard API, no version concerns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing project deps
- Architecture: HIGH -- clear integration points, existing patterns to follow
- Pitfalls: HIGH -- known JS/TS patterns for env var handling and testing

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable domain, no moving targets)
