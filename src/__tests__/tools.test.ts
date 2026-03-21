import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executeTool, TOOL_DEFINITIONS } from "../tools.js";
import { DEFAULT_ALLOWED_COMMANDS } from "../security.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tempDir: string;
const shellMode = "restricted" as const;
const allowedCommands = DEFAULT_ALLOWED_COMMANDS;
const timeoutMs = 5000;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tools-test-"));
  await fs.writeFile(path.join(tempDir, "test.txt"), "hello world", "utf-8");
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("TOOL_DEFINITIONS", () => {
  it("has 4 tool definitions", () => {
    expect(TOOL_DEFINITIONS).toHaveLength(4);
  });

  it("each has a description longer than 50 characters", () => {
    for (const def of TOOL_DEFINITIONS) {
      expect(def.function.description.length).toBeGreaterThan(50);
    }
  });
});

describe("read_file", () => {
  it("reads existing file", async () => {
    const result = await executeTool("read_file", { path: "test.txt" }, tempDir, shellMode, allowedCommands, timeoutMs);
    expect(result.success).toBe(true);
    expect(result.output).toBe("hello world");
  });

  it("fails on missing file", async () => {
    const result = await executeTool("read_file", { path: "nope.txt" }, tempDir, shellMode, allowedCommands, timeoutMs);
    expect(result.success).toBe(false);
  });

  it("rejects path outside working dir", async () => {
    const result = await executeTool("read_file", { path: "../../etc/passwd" }, tempDir, shellMode, allowedCommands, timeoutMs);
    expect(result.success).toBe(false);
    expect(result.output).toContain("path not allowed");
  });
});

describe("write_file", () => {
  it("writes new file", async () => {
    const result = await executeTool("write_file", { path: "new.txt", content: "hello" }, tempDir, shellMode, allowedCommands, timeoutMs);
    expect(result.success).toBe(true);
    const written = await fs.readFile(path.join(tempDir, "new.txt"), "utf-8");
    expect(written).toBe("hello");
  });

  it("creates intermediate directories", async () => {
    const result = await executeTool("write_file", { path: "deep/nested/file.txt", content: "nested" }, tempDir, shellMode, allowedCommands, timeoutMs);
    expect(result.success).toBe(true);
    const written = await fs.readFile(path.join(tempDir, "deep", "nested", "file.txt"), "utf-8");
    expect(written).toBe("nested");
  });

  it("rejects path outside working dir", async () => {
    const result = await executeTool("write_file", { path: "../../evil.txt", content: "bad" }, tempDir, shellMode, allowedCommands, timeoutMs);
    expect(result.success).toBe(false);
    expect(result.output).toContain("path not allowed");
  });
});

describe("list_dir", () => {
  it("lists directory contents", async () => {
    const result = await executeTool("list_dir", { path: "." }, tempDir, shellMode, allowedCommands, timeoutMs);
    expect(result.success).toBe(true);
    expect(result.output).toContain("test.txt");
    expect(result.output).toContain("f");
  });

  it("fails on missing directory", async () => {
    const result = await executeTool("list_dir", { path: "nope" }, tempDir, shellMode, allowedCommands, timeoutMs);
    expect(result.success).toBe(false);
  });
});

describe("bash", () => {
  it.skipIf(process.platform === "win32")("executes allowed command", async () => {
    const result = await executeTool("bash", { command: "echo hello" }, tempDir, "restricted", allowedCommands, timeoutMs);
    expect(result.success).toBe(true);
    expect(result.output).toContain("hello");
  });

  it.skipIf(process.platform === "win32")("rejects blocked command in restricted mode", async () => {
    const result = await executeTool("bash", { command: "rm -rf /" }, tempDir, "restricted", allowedCommands, timeoutMs);
    expect(result.success).toBe(false);
    expect(result.output).toContain("command not allowed");
  });

  it("disabled in none mode", async () => {
    const result = await executeTool("bash", { command: "echo hi" }, tempDir, "none", allowedCommands, timeoutMs);
    expect(result.success).toBe(false);
    expect(result.output).toContain("bash is disabled");
  });

  it.skipIf(process.platform === "win32")("appends warning in full mode", async () => {
    const result = await executeTool("bash", { command: "echo hi" }, tempDir, "full", allowedCommands, timeoutMs);
    expect(result.success).toBe(true);
    expect(result.output).toContain("shell mode: full");
  });
});

describe("unknown tool", () => {
  it("returns error for unknown tool", async () => {
    const result = await executeTool("fake_tool", {}, tempDir, shellMode, allowedCommands, timeoutMs);
    expect(result.success).toBe(false);
    expect(result.output).toContain("unknown tool");
  });
});
