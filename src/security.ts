/**
 * Security module -- pure functions for path validation, command allow-listing,
 * environment sanitization, and output truncation.
 *
 * Every tool executor routes through these functions.
 * No external dependencies beyond node:path and node:process.
 */

import path from "node:path";

// ---------------------------------------------------------------------------
// SAFE-01: Path validation
// ---------------------------------------------------------------------------

/**
 * Assert that `targetPath` resolves to a location inside `root`.
 * Returns the resolved absolute path on success; throws on violation.
 *
 * Uses `root + path.sep` prefix check to prevent `/project-evil/` matching `/project`.
 */
export function assertPathSafe(targetPath: string, root: string): string {
  const resolved = path.resolve(root, targetPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(
      "path not allowed (use AGENT_ALLOWED_PATHS to grant access)",
    );
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// SAFE-02 / SAFE-03: Command allow-list
// ---------------------------------------------------------------------------

export const DEFAULT_ALLOWED_COMMANDS: readonly string[] = [
  "git",
  "ls",
  "cat",
  "echo",
  "grep",
  "find",
  "mkdir",
  "cp",
  "mv",
  "touch",
  "npm",
  "node",
  "python",
] as const;

/**
 * Assert that the first token of `command` is in `allowList`.
 * Extracts the first whitespace-delimited token to prevent prefix attacks
 * (e.g. "gitevil" is not "git").
 */
export function assertCommandAllowed(
  command: string,
  allowList: readonly string[],
): void {
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    throw new Error("command not allowed (use AGENT_ALLOWED_COMMANDS to add)");
  }
  const firstToken = trimmed.split(/\s+/)[0]!;
  if (!allowList.includes(firstToken)) {
    throw new Error("command not allowed (use AGENT_ALLOWED_COMMANDS to add)");
  }
}

// ---------------------------------------------------------------------------
// SAFE-05: Safe subprocess environment
// ---------------------------------------------------------------------------

export const ALLOWED_ENV_KEYS = ["PATH", "HOME", "USER", "LANG"] as const;

/**
 * Build a sanitized environment object containing only allowed keys.
 * Returns a fresh object -- no reference to `process.env`.
 */
export function buildSafeEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ALLOWED_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}

// ---------------------------------------------------------------------------
// SAFE-06: Output truncation
// ---------------------------------------------------------------------------

export const MAX_OUTPUT_BYTES = 1_048_576; // 1 MB

/**
 * If `output` exceeds MAX_OUTPUT_BYTES, truncate and append a notice.
 */
export function truncateOutput(output: string): string {
  if (Buffer.byteLength(output) <= MAX_OUTPUT_BYTES) {
    return output;
  }
  // Slice conservatively within byte budget
  let end = output.length;
  while (Buffer.byteLength(output.slice(0, end)) > MAX_OUTPUT_BYTES) {
    end = Math.floor(end * 0.9);
  }
  // Binary-search upward for tighter fit
  let lo = end;
  let hi = output.length;
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (Buffer.byteLength(output.slice(0, mid)) <= MAX_OUTPUT_BYTES) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return output.slice(0, lo) + "\n[output truncated: exceeded 1MB limit]";
}

// ---------------------------------------------------------------------------
// SAFE-07: Shell mode
// ---------------------------------------------------------------------------

export type ShellMode = "restricted" | "full" | "none";

/**
 * Returns true when shell mode is "restricted" (default safe mode).
 */
export function isShellModeRestricted(mode: ShellMode): boolean {
  return mode === "restricted";
}
