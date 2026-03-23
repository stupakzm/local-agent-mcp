---
phase: 3
slug: robust-parsing-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.1.0 |
| **Config file** | None (uses vitest defaults via package.json) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 0 | PARSE-01..06 | unit | `npx vitest run src/__tests__/parser.test.ts` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 1 | PARSE-01 | unit | `npx vitest run src/__tests__/parser.test.ts -t "native"` | ✅ W0 | ⬜ pending |
| 3-01-03 | 01 | 1 | PARSE-02 | unit | `npx vitest run src/__tests__/parser.test.ts -t "alias"` | ✅ W0 | ⬜ pending |
| 3-01-04 | 01 | 1 | PARSE-03 | unit | `npx vitest run src/__tests__/parser.test.ts -t "extraction"` | ✅ W0 | ⬜ pending |
| 3-01-05 | 01 | 1 | PARSE-04 | unit | `npx vitest run src/__tests__/parser.test.ts -t "retry"` | ✅ W0 | ⬜ pending |
| 3-01-06 | 01 | 1 | PARSE-05 | unit | `npx vitest run src/__tests__/parser.test.ts -t "ParseFailure"` | ✅ W0 | ⬜ pending |
| 3-01-07 | 01 | 1 | PARSE-06 | unit | `npx vitest run src/__tests__/parser.test.ts` | ✅ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/parser.test.ts` — stubs for PARSE-01 through PARSE-06 (14+ test cases)

*Existing infrastructure covers vitest — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| llama3.1:8b completes a real task via text extraction | PARSE-03 | Requires live Ollama instance | Run `npm run dev` pointing at Ollama, ask a tool-using task with `llama3.1:8b`, verify it completes without error |
| Malformed prompt triggers retry loop | PARSE-04 | Requires adversarial model output | Inject a deliberately unparseable response and verify 3 retry attempts appear in logs before ParseFailure |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
