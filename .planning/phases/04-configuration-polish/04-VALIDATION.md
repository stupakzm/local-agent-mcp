---
phase: 4
slug: configuration-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npm test -- --reporter=verbose` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --reporter=verbose`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | CONF-01..07 | unit | `npm test -- src/config.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | CONF-05,06,07 | unit | `npm test -- src/config.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-03 | 01 | 2 | DIST-01,03,04 | e2e-manual | see manual table | — | ⬜ pending |
| 4-01-04 | 01 | 2 | DIST-02 | file-check | `test -f .mcp.json` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/config.test.ts` — unit tests for all 7 env vars, defaults, validation, and ConfigError throws
- [ ] `src/index.test.ts` update — ensure index.ts catches ConfigError and exits with code 1

*Existing vitest infrastructure covers test running — no new framework needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| README clone-to-run flow | DIST-01 | Requires real Ollama + model pull | Follow README verbatim from fresh dir; verify `run_local_agent` returns a response |
| AGENT_SHELL_MODE=full warning | CONF-06 | Stderr output needs visual inspection | Set mode=full, invoke bash tool, confirm warning line on stderr |
| AGENT_SHELL_MODE=none refusal | CONF-06 | Tool behavior change needs live test | Set mode=none, attempt bash command, confirm error returned |
| Model upgrade path | DIST-04 | Requires 14b model pull | Set AGENT_MODEL=qwen2.5-coder:14b, run agent, confirm model used in Ollama logs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
