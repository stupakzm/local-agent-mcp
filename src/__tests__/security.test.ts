import { describe, it, expect, afterEach } from "vitest";
import {
  assertPathSafe,
  assertCommandAllowed,
  DEFAULT_ALLOWED_COMMANDS,
  ALLOWED_ENV_KEYS,
  buildSafeEnv,
  truncateOutput,
  MAX_OUTPUT_BYTES,
  isShellModeRestricted,
} from "../security.js";
import path from "node:path";

// ---------------------------------------------------------------------------
// assertPathSafe
// ---------------------------------------------------------------------------

describe("assertPathSafe", () => {
  const root = path.resolve("/project");

  it("allows relative path inside root", () => {
    const result = assertPathSafe("src/file.ts", root);
    expect(result).toBe(path.join(root, "src", "file.ts"));
  });

  it("allows absolute path inside root", () => {
    const abs = path.join(root, "src", "file.ts");
    const result = assertPathSafe(abs, root);
    expect(result).toBe(abs);
  });

  it("allows root itself", () => {
    expect(() => assertPathSafe(root, root)).not.toThrow();
    expect(assertPathSafe(root, root)).toBe(root);
  });

  it("rejects path outside root", () => {
    expect(() => assertPathSafe("../../etc/passwd", root)).toThrow(
      /path not allowed/,
    );
  });

  it("rejects prefix attack /project-evil/", () => {
    expect(() =>
      assertPathSafe(path.resolve("/project-evil/file.ts"), root),
    ).toThrow(/path not allowed/);
  });

  it("allows .. that resolves inside root", () => {
    const result = assertPathSafe("src/../lib/file.ts", root);
    expect(result).toBe(path.join(root, "lib", "file.ts"));
  });

  it("rejects .. that resolves outside root", () => {
    expect(() => assertPathSafe("../../../etc/passwd", root)).toThrow(
      /path not allowed/,
    );
  });
});

// ---------------------------------------------------------------------------
// assertCommandAllowed
// ---------------------------------------------------------------------------

describe("assertCommandAllowed", () => {
  it("allows all default commands", () => {
    for (const cmd of DEFAULT_ALLOWED_COMMANDS) {
      expect(() =>
        assertCommandAllowed(`${cmd} --help`, DEFAULT_ALLOWED_COMMANDS),
      ).not.toThrow();
    }
  });

  it("allows command without arguments", () => {
    expect(() =>
      assertCommandAllowed("git", DEFAULT_ALLOWED_COMMANDS),
    ).not.toThrow();
  });

  it("rejects rm", () => {
    expect(() =>
      assertCommandAllowed("rm -rf /", DEFAULT_ALLOWED_COMMANDS),
    ).toThrow(/command not allowed/);
  });

  it("rejects curl", () => {
    expect(() =>
      assertCommandAllowed("curl http://evil.com", DEFAULT_ALLOWED_COMMANDS),
    ).toThrow(/command not allowed/);
  });

  it("rejects wget", () => {
    expect(() =>
      assertCommandAllowed("wget http://evil.com", DEFAULT_ALLOWED_COMMANDS),
    ).toThrow(/command not allowed/);
  });

  it("rejects sudo", () => {
    expect(() =>
      assertCommandAllowed("sudo rm -rf /", DEFAULT_ALLOWED_COMMANDS),
    ).toThrow(/command not allowed/);
  });

  it("rejects ssh", () => {
    expect(() =>
      assertCommandAllowed("ssh user@host", DEFAULT_ALLOWED_COMMANDS),
    ).toThrow(/command not allowed/);
  });

  it("rejects prefix attack gitevil", () => {
    expect(() =>
      assertCommandAllowed("gitevil --flag", DEFAULT_ALLOWED_COMMANDS),
    ).toThrow(/command not allowed/);
  });

  it("works with custom allow-list", () => {
    expect(() => assertCommandAllowed("rm file", ["rm"])).not.toThrow();
  });

  it("rejects empty command", () => {
    expect(() =>
      assertCommandAllowed("", DEFAULT_ALLOWED_COMMANDS),
    ).toThrow(/command not allowed/);
  });

  it("rejects whitespace-only command", () => {
    expect(() =>
      assertCommandAllowed("   ", DEFAULT_ALLOWED_COMMANDS),
    ).toThrow(/command not allowed/);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_ALLOWED_COMMANDS
// ---------------------------------------------------------------------------

describe("DEFAULT_ALLOWED_COMMANDS", () => {
  const expected = [
    "git", "ls", "cat", "echo", "grep", "find",
    "mkdir", "cp", "mv", "touch", "npm", "node", "python",
  ];

  it("contains exactly the 13 specified commands", () => {
    expect([...DEFAULT_ALLOWED_COMMANDS].sort()).toEqual([...expected].sort());
  });

  it("does NOT include dangerous commands", () => {
    for (const cmd of ["rm", "curl", "wget", "sudo", "ssh"]) {
      expect(DEFAULT_ALLOWED_COMMANDS).not.toContain(cmd);
    }
  });
});

// ---------------------------------------------------------------------------
// buildSafeEnv
// ---------------------------------------------------------------------------

describe("buildSafeEnv", () => {
  let savedKey: string | undefined;

  afterEach(() => {
    if (savedKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("returns only allowed keys", () => {
    const env = buildSafeEnv();
    const keys = Object.keys(env);
    for (const k of keys) {
      expect((ALLOWED_ENV_KEYS as readonly string[]).includes(k)).toBe(true);
    }
  });

  it("excludes ANTHROPIC_API_KEY even when set", () => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-test-secret";
    const env = buildSafeEnv();
    expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
  });

  it("includes PATH when it exists in process.env", () => {
    // PATH is almost always set
    if (process.env.PATH) {
      const env = buildSafeEnv();
      expect(env).toHaveProperty("PATH");
    }
  });
});

// ---------------------------------------------------------------------------
// truncateOutput
// ---------------------------------------------------------------------------

describe("truncateOutput", () => {
  it("returns small string unchanged", () => {
    expect(truncateOutput("hello")).toBe("hello");
  });

  it("returns empty string unchanged", () => {
    expect(truncateOutput("")).toBe("");
  });

  it("returns exactly 1MB string unchanged", () => {
    const str = "a".repeat(MAX_OUTPUT_BYTES);
    expect(truncateOutput(str)).toBe(str);
  });

  it("truncates over 1MB string with notice", () => {
    const str = "a".repeat(MAX_OUTPUT_BYTES + 1000);
    const result = truncateOutput(str);
    expect(result).toContain("[output truncated");
    expect(result.length).toBeLessThan(str.length);
  });

  it("truncated output body fits within byte limit", () => {
    const str = "a".repeat(MAX_OUTPUT_BYTES + 5000);
    const result = truncateOutput(str);
    const notice = "\n[output truncated: exceeded 1MB limit]";
    const body = result.slice(0, result.indexOf(notice));
    expect(Buffer.byteLength(body)).toBeLessThanOrEqual(MAX_OUTPUT_BYTES);
  });
});

// ---------------------------------------------------------------------------
// MAX_OUTPUT_BYTES
// ---------------------------------------------------------------------------

describe("MAX_OUTPUT_BYTES", () => {
  it("equals 1048576 (1 MB)", () => {
    expect(MAX_OUTPUT_BYTES).toBe(1_048_576);
  });
});

// ---------------------------------------------------------------------------
// ALLOWED_ENV_KEYS
// ---------------------------------------------------------------------------

describe("ALLOWED_ENV_KEYS", () => {
  it("contains exactly PATH, HOME, USER, LANG", () => {
    expect([...ALLOWED_ENV_KEYS].sort()).toEqual(
      ["HOME", "LANG", "PATH", "USER"],
    );
  });
});

// ---------------------------------------------------------------------------
// isShellModeRestricted
// ---------------------------------------------------------------------------

describe("isShellModeRestricted", () => {
  it('returns true for "restricted"', () => {
    expect(isShellModeRestricted("restricted")).toBe(true);
  });

  it('returns false for "full"', () => {
    expect(isShellModeRestricted("full")).toBe(false);
  });

  it('returns false for "none"', () => {
    expect(isShellModeRestricted("none")).toBe(false);
  });
});
