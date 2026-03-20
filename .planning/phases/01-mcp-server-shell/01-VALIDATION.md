---
phase: 1
slug: mcp-server-shell
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest (or vitest) |
| **Config file** | `jest.config.js` or `vitest.config.ts` — Wave 0 installs |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | MCP-01 | build | `npm run build` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | MCP-02 | build | `npm run build` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | MCP-03 | manual | see manual table | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 1 | MCP-04 | lint | `npm run lint` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `package.json` — with test script and lint script
- [ ] `tsconfig.json` — with `module: "Node16"` and `moduleResolution: "Node16"`
- [ ] Test framework install — jest or vitest with TypeScript support

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Claude Code invokes `run_local_agent` via `.mcp.json` | MCP-03 | Requires Claude Code runtime | Register `.mcp.json`, restart Claude Code, invoke tool, verify response |
| MCP Inspector connects and lists tool | MCP-03 | Requires running server + inspector | Run `npx @modelcontextprotocol/inspector`, connect to server, verify `run_local_agent` appears with correct schema |
| Error handler returns `{ isError: true }` | MCP-01 | Requires live invocation | Trigger deliberate error in handler, verify structured error response |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
