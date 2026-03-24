# Project Instructions

## Local Agent Delegation

This project has a `run_local_agent` MCP tool connected. Use it to offload mechanical
coding work to the local Ollama model, reserving Claude for reasoning, orchestration,
and judgment.

---

### When to Delegate (always prefer local agent for these)

| Task type | Examples |
|-----------|---------|
| Implement a function | "Add X following the same pattern as Y" |
| Edit a single file | Fix lint, update imports, rename, add type |
| Write tests | Add test cases following existing suite style |
| Run a command and report | `npm test`, `npm run lint`, `npm run build` |
| Boilerplate / scaffolding | New file from a clear template |
| Mechanical refactor | Rename variable across one file, extract function |
| Read + summarize | Summarize what a file does, list exports |

### When to Keep with Claude (never delegate these)

- GSD state updates (STATE.md, ROADMAP.md, SUMMARY.md) — Claude only
- Planning, architecture, and design decisions
- Cross-file analysis requiring broad context (>3 files)
- Verification and quality judgment
- Debugging complex failures requiring reasoning
- Any task that requires spawning subagents

---

### How to Invoke — Prompt Template

Always give the local agent a **bounded, explicit prompt**. Vague prompts cause looping.

**Template:**
```
Use the run_local_agent tool with this prompt:

"Read [exact file path(s)].
[Single specific action — one task only].
Do not read any other files.
Do not explore the directory.
[Expected output or acceptance criteria]."
```

**Good delegation prompt:**
```
Use run_local_agent: "Read src/tools.ts lines 80-120. Add a new tool called
filter_list_dir that wraps list_dir and removes entries matching a glob pattern.
Follow the exact same structure as list_dir. Do not read other files."
```

**Bad delegation prompt (too vague — causes looping):**
```
Use run_local_agent: "Add a filter tool to the project."
```

---

### Model Selection

The local agent defaults to `AGENT_MODEL` from config (currently `qwen2.5-coder:7b`).
Override per-call when needed:

| Task complexity | Model to request in prompt |
|----------------|---------------------------|
| Simple edits, lint fixes, test additions | `qwen2.5-coder:7b` (fast, default) |
| Multi-step implementation, pattern matching | `qwen2.5-coder:14b` |
| Complex logic, architectural refactor | `qwen2.5-coder:32b` |

To override, include in the run_local_agent prompt:
`"Use model qwen2.5-coder:32b for this task."`

---

### Efficiency Rules

1. **One task per invocation.** Split multi-step work into sequential calls.
2. **Name the files explicitly.** "Read src/tools.ts" — not "find the tools file."
3. **Forbid exploration.** Always append: "Do not read other files. Do not list directories."
4. **State the done condition.** End every prompt with what success looks like.
5. **Limit scope to one file when possible.** Multi-file edits cause confusion.
6. **For test runs:** just ask for the command output — don't ask it to fix failures too.

---

### Delegation Patterns by Scenario

**GSD plan task — implement a function:**
```
Use run_local_agent: "Read src/[file].ts. Implement [function name] that [description].
Follow the existing code style in that file. Do not read other files.
The function is complete when it compiles and matches the signature: [signature]."
```

**GSD plan task — add tests:**
```
Use run_local_agent: "Read src/__tests__/[file].test.ts. Add [N] test cases for
[function name] covering: [case 1], [case 2], [case 3]. Follow the existing
describe/it/expect style exactly. Do not modify test logic outside the new cases."
```

**Fix lint errors:**
```
Use run_local_agent: "Read src/[file].ts. Fix all ESLint errors reported below.
Do not change any logic — only fix the lint issues.
Errors: [paste lint output]"
```

**Run and report:**
```
Use run_local_agent: "Run `npm test` from /home/stupakzm/projects/local-agent-mcp.
Report: how many tests passed, how many failed, and the names of any failures.
Do not attempt to fix failures."
```

---

### What the Local Agent Can Access

- `read_file` — read any file within `AGENT_WORKING_DIR`
- `write_file` — write/overwrite files
- `list_dir` — list directory contents
- `bash` — run shell commands (restricted mode by default: git, ls, cat, echo, grep,
  find, mkdir, cp, mv, touch, npm, node, python)

It cannot: spawn subagents, call external APIs, access GSD tools, or write to
`.planning/` — those stay with Claude.
