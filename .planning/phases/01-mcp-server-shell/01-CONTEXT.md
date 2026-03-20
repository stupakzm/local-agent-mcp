# Phase 1: MCP Server Shell - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

A working MCP server that Claude Code can register and invoke — transport layer proven, tool stub wired, no correctness logic yet. Deliverable: `run_local_agent(prompt, model?)` returns `"not implemented"` stub. No agent logic, no Ollama calls.

</domain>

<decisions>
## Implementation Decisions

### TypeScript Configuration
- **D-01:** `strict: true` — all strict checks enabled from day one (noImplicitAny, strictNullChecks, strictFunctionTypes, etc.)
- **D-02:** `target: "ES2022"` — modern Node.js 18+ features (top-level await, class fields, Object.hasOwn)
- **D-03:** `noUnusedLocals: true` and `noUnusedParameters: true` — error on unused variables and parameters
- **D-04:** `module: "Node16"` and `moduleResolution: "Node16"` — required for MCP SDK's `.js` extension imports (locked by ROADMAP.md)
- **D-05:** Single `tsconfig.json` — no separate build/check split for this project size
- **D-06:** `outDir: "build"` — compiled output goes to `build/`

### npm Scripts
- **D-07:** `build` — `tsc` (compiles to `build/`)
- **D-08:** `start` — `node build/index.js`
- **D-09:** `dev` — `tsx --watch src/index.ts` (hot reload, no separate compile step)
- **D-10:** `typecheck` — `tsc --noEmit` (fast type-check without building)

### Dev Tooling
- **D-11:** ESLint with `@typescript-eslint` for linting — add `.eslintrc.json` and `npm run lint`
- **D-12:** Prettier for formatting — add `.prettierrc` and `npm run format`
- **D-13:** `tsx` as dev dependency for watch mode

### Package Identity
- **D-14:** Package name: `local-agent-mcp`
- **D-15:** Description: `"Run local AI agents via Claude Code — delegates tasks to Ollama with file and shell tools"`
- **D-16:** Not publishing to npm initially — open source, install from git. No `files` field or `prepublishOnly` script needed.
- **D-17:** `"type": "module"` in package.json — ESM throughout (locked by ROADMAP.md)

### MCP Server Implementation
- **D-18:** `server.registerTool()` — not deprecated `server.tool()` (locked by ROADMAP.md)
- **D-19:** `StdioServerTransport` — stdio JSON-RPC transport (locked by ROADMAP.md)
- **D-20:** All logging via `console.error()` only — `console.log()` corrupts stdio transport (locked by ROADMAP.md)
- **D-21:** Tool handler returns `{ content: [{ type: "text", text: "not implemented" }] }` stub
- **D-22:** All errors caught and returned as `{ isError: true }` — no unhandled exceptions

### Claude's Discretion
- Exact ESLint rule set (beyond @typescript-eslint/recommended)
- Prettier config details (printWidth, tabWidth, singleQuote)
- `zod@3` schema for `run_local_agent` parameter descriptions and validation details
- `.gitignore` contents

</decisions>

<specifics>
## Specific Ideas

- No specific references beyond what's in the roadmap
- Phase 1 is intentionally minimal — prove the transport, nothing more

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### MCP SDK patterns and gotchas
- `.planning/research/MCP.md` — MCP SDK API surface, registerTool() signature, transport setup, known pitfalls
- `.planning/research/SUMMARY.md` — Cross-cutting gotchas: zod@3 requirement, console.log corruption, Node16 module resolution

### Requirements
- `.planning/REQUIREMENTS.md` §MCP Server — MCP-01 through MCP-04 (the four requirements this phase must satisfy)
- `.planning/ROADMAP.md` §Phase 1 — Key deliverables checklist and success criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — fresh project, no existing code

### Established Patterns
- None yet — Phase 1 establishes the patterns for all future phases

### Integration Points
- `build/index.js` → `.mcp.json` → Claude Code registration (the single integration point for this phase)

</code_context>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-mcp-server-shell*
*Context gathered: 2026-03-20*
