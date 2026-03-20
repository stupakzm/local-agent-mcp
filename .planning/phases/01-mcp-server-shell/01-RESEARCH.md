# Phase 1: MCP Server Shell - Research

**Researched:** 2026-03-20
**Domain:** MCP TypeScript SDK, project scaffolding, stdio transport
**Confidence:** HIGH

## Summary

Phase 1 is a straightforward scaffolding phase: create a TypeScript project, install the MCP SDK with zod@3, register a single stub tool (`run_local_agent`), connect via stdio transport, and produce a `.mcp.json` for zero-config Claude Code registration. The MCP SDK API is stable, well-documented, and the official TypeScript quickstart provides a near-complete template. The project research in `.planning/research/MCP.md` already covers the exact API surface needed.

The primary risks are three silent-failure gotchas: (1) any stdout write corrupts the stdio JSON-RPC transport, (2) zod v4 has breaking schema API changes, and (3) `moduleResolution: "Node16"` is required for the SDK's `.js` extension imports. All three are well-understood and easily avoided by following the locked decisions.

**Primary recommendation:** Follow the MCP.md template almost verbatim. The only additions beyond it are dev tooling (ESLint, Prettier, tsx) and the `.mcp.json` project file.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `strict: true` -- all strict checks enabled from day one
- **D-02:** `target: "ES2022"` -- modern Node.js 18+ features
- **D-03:** `noUnusedLocals: true` and `noUnusedParameters: true`
- **D-04:** `module: "Node16"` and `moduleResolution: "Node16"` -- required for MCP SDK
- **D-05:** Single `tsconfig.json`
- **D-06:** `outDir: "build"`
- **D-07:** `build` script: `tsc`
- **D-08:** `start` script: `node build/index.js`
- **D-09:** `dev` script: `tsx --watch src/index.ts`
- **D-10:** `typecheck` script: `tsc --noEmit`
- **D-11:** ESLint with `@typescript-eslint` for linting
- **D-12:** Prettier for formatting
- **D-13:** `tsx` as dev dependency for watch mode
- **D-14:** Package name: `local-agent-mcp`
- **D-15:** Description: "Run local AI agents via Claude Code -- delegates tasks to Ollama with file and shell tools"
- **D-16:** Not publishing to npm initially
- **D-17:** `"type": "module"` in package.json
- **D-18:** `server.registerTool()` -- not deprecated `server.tool()`
- **D-19:** `StdioServerTransport` -- stdio JSON-RPC transport
- **D-20:** All logging via `console.error()` only
- **D-21:** Tool handler returns `{ content: [{ type: "text", text: "not implemented" }] }` stub
- **D-22:** All errors caught and returned as `{ isError: true }`

### Claude's Discretion
- Exact ESLint rule set (beyond @typescript-eslint/recommended)
- Prettier config details (printWidth, tabWidth, singleQuote)
- `zod@3` schema for `run_local_agent` parameter descriptions and validation details
- `.gitignore` contents

### Deferred Ideas (OUT OF SCOPE)
- None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MCP-01 | MCP server exposes `run_local_agent(prompt, model?)` tool via stdio transport | MCP SDK `registerTool()` API verified against official docs; template in MCP.md section 8 |
| MCP-02 | Server builds and registers cleanly via `.mcp.json` project file | `.mcp.json` format verified; `command: "node"`, `args: ["build/index.js"]` pattern confirmed |
| MCP-03 | All handler errors returned as `{ isError: true }` -- no unhandled exceptions | Error handling contract documented in MCP.md section 3; try/catch pattern verified |
| MCP-04 | No writes to stdout (all logging goes to stderr only) | Stdio transport corruption documented; `console.error()` only pattern confirmed |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | 1.27.1 | MCP server framework | Official SDK; only supported TypeScript SDK for MCP |
| `zod` | 3.25.76 (latest 3.x) | Input schema validation | Required by MCP SDK for `inputSchema` definitions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `typescript` | 5.9.3 | TypeScript compiler | Build step; compiles to `build/` |
| `@types/node` | latest | Node.js type definitions | TypeScript compilation |
| `tsx` | 4.21.0 | TypeScript runner with watch | Dev mode hot reload (`npm run dev`) |
| `eslint` | 10.1.0 | Linting | Code quality enforcement |
| `typescript-eslint` | 8.57.1 | TypeScript ESLint integration | Unified package for flat config |
| `prettier` | 3.8.1 | Code formatting | Consistent style |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `zod@3` | `zod@4` | SDK 1.27.1 peer deps allow `^3.25 \|\| ^4.0`, but project locks to v3 per ROADMAP.md decision |
| `tsx` | `ts-node` | tsx is faster, supports ESM natively, no config needed |
| `eslint` 10 | `eslint` 8 | ESLint 10 uses flat config (`eslint.config.js`); ESLint 8 uses `.eslintrc.json` (deprecated format). Use 10 for current ecosystem. |

**Installation:**
```bash
npm install @modelcontextprotocol/sdk zod@3
npm install -D typescript @types/node tsx eslint typescript-eslint prettier
```

**Version verification:** All versions confirmed via `npm view` on 2026-03-20. The MCP SDK is at 1.27.1, zod@3 latest is 3.25.76.

**Important note on ESLint config format:** CONTEXT.md decision D-11 mentions `.eslintrc.json`, but ESLint 9+ dropped legacy config format. ESLint 10 (current) requires flat config via `eslint.config.js`. Since the exact ESLint rule set is under Claude's Discretion, use `eslint.config.js` with the `typescript-eslint` unified package. This is the modern standard approach.

## Architecture Patterns

### Recommended Project Structure
```
local-agent-mcp/
├── src/
│   └── index.ts           # McpServer + StdioServerTransport + tool registration
├── build/                  # Compiled output (gitignored)
│   └── index.js
├── package.json            # type: "module", scripts, dependencies
├── tsconfig.json           # Node16 module resolution, strict mode
├── eslint.config.js        # Flat config with typescript-eslint
├── .prettierrc             # Prettier config
├── .gitignore              # node_modules, build, etc.
└── .mcp.json               # Claude Code project registration
```

### Pattern 1: MCP Server Initialization
**What:** Single-file server with tool registration and stdio transport
**When to use:** Phase 1 (and as the entry point for all future phases)
**Example:**
```typescript
// Source: modelcontextprotocol.io/docs/develop/build-server (verified 2026-03-20)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "local-agent-mcp",
  version: "0.1.0",
});

server.registerTool(
  "run_local_agent",
  {
    description: "Run a task using a local Ollama model",
    inputSchema: {
      prompt: z.string().describe("The task or question for the local agent"),
      model: z.string().optional().describe("Ollama model name (default: qwen2.5-coder:7b)"),
    },
  },
  async ({ prompt, model }) => {
    try {
      // Stub implementation for Phase 1
      return {
        content: [{ type: "text", text: "not implemented" }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${String(err)}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("local-agent-mcp running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
```

### Pattern 2: .mcp.json Project Registration
**What:** Project-scoped MCP server config for zero-config Claude Code discovery
**When to use:** Committed to repo root; users clone and it works
**Example:**
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

**Note on paths:** The `.mcp.json` `args` paths are resolved relative to the project root when the file is in the project root. Using `"build/index.js"` (relative) works for project-scoped `.mcp.json`. Absolute paths are needed only for global config.

### Pattern 3: Tool Error Handling Contract
**What:** Two distinct error channels in MCP
**When to use:** Every tool handler must follow this pattern

| Error Type | How to Signal | When Claude Sees It |
|------------|--------------|---------------------|
| Tool execution failure | `return { content: [...], isError: true }` | Claude can read the error message and adapt |
| Protocol-level error | `throw new Error(...)` | Claude gets a generic JSON-RPC error, cannot inspect |

**Rule:** Never let exceptions bubble out of tool handlers. Always catch and return as `isError: true`.

### Anti-Patterns to Avoid
- **Using `console.log()` anywhere:** Corrupts stdio transport. Use `console.error()` exclusively.
- **Wrapping inputSchema in `z.object()`:** The SDK expects a plain object of Zod field definitions (ZodRawShape), not `z.object({...})`. The SDK wraps it internally.
- **Using `.eslintrc.json` with ESLint 10:** Legacy config format was dropped. Use `eslint.config.js` (flat config).
- **Pointing `.mcp.json` at TypeScript source:** Must point to compiled `build/index.js`. Always build before testing.
- **Installing zod without version constraint:** `npm install zod` may install v4. Use `npm install zod@3`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP protocol handling | Custom JSON-RPC parser | `@modelcontextprotocol/sdk` McpServer class | Protocol has many edge cases; SDK handles versioning, capabilities negotiation |
| Input validation | Manual argument checking | Zod schemas via `inputSchema` | SDK validates automatically and returns typed args to handler |
| Stdio transport | Custom stdin/stdout reader | `StdioServerTransport` | Handles message framing, JSON-RPC envelope, buffering |
| TypeScript ESM execution | Custom ts-node config | `tsx` | Zero-config ESM TypeScript execution with watch mode |

**Key insight:** The entire MCP server for Phase 1 is approximately 40 lines of code. The SDK does all the heavy lifting. There is nothing to hand-roll.

## Common Pitfalls

### Pitfall 1: stdout Corruption
**What goes wrong:** Any write to stdout (console.log, process.stdout.write, third-party library output) corrupts the JSON-RPC message stream.
**Why it happens:** Stdio transport uses stdout as its communication channel. Non-MCP bytes are interpreted as malformed JSON-RPC messages.
**How to avoid:** Use `console.error()` exclusively. Grep the codebase for `console.log` before committing. Audit any dependencies for stdout writes.
**Warning signs:** "Parse error" in Claude Code, silent disconnection, "Server failed to start" messages.

### Pitfall 2: Zod Version Mismatch
**What goes wrong:** `npm install zod` installs v4, which has a different schema API. Server fails at startup with schema validation errors.
**Why it happens:** Zod v4 is the latest major version on npm. The MCP SDK peer dependency allows `^3.25 || ^4.0` but the project locks to v3.
**How to avoid:** Always use `npm install zod@3`. Verify with `npm list zod` after install.
**Warning signs:** TypeScript compilation errors about Zod types, runtime "invalid schema" errors.

### Pitfall 3: Module Resolution Mismatch
**What goes wrong:** TypeScript compilation succeeds but runtime fails with "Cannot find module" for MCP SDK imports.
**Why it happens:** The SDK uses ES module imports with explicit `.js` extensions (e.g., `@modelcontextprotocol/sdk/server/mcp.js`). Only `moduleResolution: "Node16"` resolves these correctly.
**How to avoid:** Use `module: "Node16"` and `moduleResolution: "Node16"` in tsconfig.json. Do not use `"node"`, `"classic"`, or `"bundler"`.
**Warning signs:** "Cannot find module '@modelcontextprotocol/sdk/server/mcp.js'" at runtime despite clean compilation.

### Pitfall 4: Wrapping inputSchema in z.object()
**What goes wrong:** If you pass `z.object({ prompt: z.string() })` as `inputSchema`, the SDK double-wraps it, producing an incorrect JSON Schema.
**Why it happens:** The SDK's `registerTool` expects a `ZodRawShape` (plain object of Zod field definitions) and calls `z.object()` internally.
**How to avoid:** Pass `{ prompt: z.string(), model: z.string().optional() }` directly, without wrapping.
**Warning signs:** Tool schema in MCP Inspector shows unexpected nesting or missing properties.

### Pitfall 5: Build Before Test
**What goes wrong:** `.mcp.json` points to `build/index.js` which does not exist or is stale.
**Why it happens:** Forgetting to run `npm run build` after code changes.
**How to avoid:** Add `npm run build` to the test workflow. The `dev` script (tsx --watch) is for development only and does not produce `build/` output.
**Warning signs:** "ENOENT: no such file or directory" when Claude Code tries to spawn the server.

## Code Examples

Verified patterns from official sources:

### tsconfig.json
```json
// Source: modelcontextprotocol.io TypeScript quickstart + CONTEXT.md decisions
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### package.json
```json
// Source: CONTEXT.md locked decisions + verified package versions
{
  "name": "local-agent-mcp",
  "version": "0.1.0",
  "description": "Run local AI agents via Claude Code -- delegates tasks to Ollama with file and shell tools",
  "type": "module",
  "main": "build/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node build/index.js",
    "dev": "tsx --watch src/index.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "format": "prettier --write src/"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.27.1",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "typescript": "^5.9.3",
    "@types/node": "^22.0.0",
    "tsx": "^4.21.0",
    "eslint": "^10.1.0",
    "typescript-eslint": "^8.57.1",
    "prettier": "^3.8.1"
  }
}
```

### eslint.config.js (flat config)
```javascript
// Source: typescript-eslint docs for ESLint 9+/10 flat config
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Disallow console.log (only console.error allowed for MCP stdio safety)
      "no-console": ["error", { allow: ["error"] }],
    },
  },
  {
    ignores: ["build/", "node_modules/"],
  }
);
```

**Note:** The `no-console` rule configured to only allow `console.error` is a strong safeguard against pitfall 1 (stdout corruption). This catches accidental `console.log()` at lint time.

### .prettierrc
```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "singleQuote": false,
  "trailingComma": "all",
  "semi": true
}
```

### .gitignore
```
node_modules/
build/
*.tsbuildinfo
```

### .mcp.json
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

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `server.tool()` | `server.registerTool()` | MCP SDK ~1.x | `tool()` is deprecated; `registerTool()` is canonical |
| `SSEServerTransport` | `StreamableHTTPServerTransport` | Protocol 2024-11-05 | SSE deprecated; not relevant for this project (uses stdio) |
| `.eslintrc.json` | `eslint.config.js` (flat config) | ESLint 9.0 (2024) | Legacy config format removed in ESLint 9+; flat config is the only option |
| `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` | `typescript-eslint` unified package | typescript-eslint v8 | Single package replaces two separate packages |

**Deprecated/outdated:**
- `server.tool()`: Still functional but deprecated. Use `server.registerTool()`.
- `.eslintrc.json`: Not supported by ESLint 10. Must use `eslint.config.js`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected -- greenfield project |
| Config file | None -- see Wave 0 |
| Quick run command | `npx @modelcontextprotocol/inspector node build/index.js` |
| Full suite command | N/A for Phase 1 (manual validation via Inspector + Claude Code) |

### Phase Requirements --> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MCP-01 | `run_local_agent` tool exposed via stdio | smoke | `npx @modelcontextprotocol/inspector node build/index.js` (verify tool listed) | N/A -- manual |
| MCP-02 | Server registers via `.mcp.json` | smoke | Start Claude Code in project dir, verify tool appears | N/A -- manual |
| MCP-03 | Handler errors return `{ isError: true }` | smoke | Call tool via Inspector, verify error response shape | N/A -- manual |
| MCP-04 | No stdout writes | smoke | Run server, check no stdout output: `node build/index.js 2>/dev/null` should produce no output on stdout | N/A -- manual |

### Sampling Rate
- **Per task commit:** `npm run build && npm run typecheck && npm run lint`
- **Per wave merge:** MCP Inspector manual verification
- **Phase gate:** All 5 success criteria verified manually

### Wave 0 Gaps
- No test framework needed for Phase 1 -- validation is via MCP Inspector and Claude Code integration (both are manual smoke tests)
- Linting (`eslint.config.js`) serves as the automated quality gate
- TypeScript strict mode serves as the automated correctness gate
- The `no-console` ESLint rule (allow only `console.error`) is the automated guard for MCP-04

## Open Questions

1. **`.mcp.json` relative path resolution**
   - What we know: Official docs show absolute paths for global config. Project-scoped `.mcp.json` files are documented to work with relative paths (resolved from project root).
   - What's unclear: Whether Claude Code on Windows resolves forward-slash paths in `.mcp.json` correctly.
   - Recommendation: Use `"build/index.js"` (forward slash, relative). Test on first build. If it fails, switch to absolute path with a note.

2. **ESLint config format vs CONTEXT.md**
   - What we know: CONTEXT.md D-11 says "add `.eslintrc.json`". ESLint 10 does not support this format.
   - What's unclear: Whether the user intended to pin ESLint 8 (which supports `.eslintrc.json`) or use the latest ESLint.
   - Recommendation: Use ESLint 10 with `eslint.config.js` (flat config). The exact ESLint config is listed under Claude's Discretion, and using a deprecated config format would be a poor engineering choice. The intent of D-11 (use ESLint with typescript-eslint) is preserved.

3. **`@eslint/js` package requirement**
   - What we know: ESLint 10 flat config requires `@eslint/js` as a separate dependency for the recommended config.
   - Recommendation: Add `@eslint/js` to devDependencies.

## Sources

### Primary (HIGH confidence)
- modelcontextprotocol.io/docs/develop/build-server -- TypeScript `registerTool()` API, `inputSchema` format (ZodRawShape), stdio transport pattern
- `.planning/research/MCP.md` -- MCP SDK complete API surface, transport, config, gotchas
- `.planning/research/SUMMARY.md` -- Cross-cutting gotchas, implementation approach
- npm registry -- All package versions verified via `npm view` on 2026-03-20

### Secondary (MEDIUM confidence)
- github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md -- `registerTool` vs `tool` deprecation confirmed
- MCP SDK peer dependencies (`npm view @modelcontextprotocol/sdk peerDependencies`) -- zod `^3.25 || ^4.0` confirmed

### Tertiary (LOW confidence)
- `.mcp.json` relative path behavior on Windows -- documented for Unix; Windows behavior assumed equivalent but not verified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all versions verified via npm registry, SDK API verified against official docs
- Architecture: HIGH -- follows official TypeScript quickstart template exactly
- Pitfalls: HIGH -- three critical gotchas documented in project research and confirmed by official docs

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable SDK, no breaking changes expected)
