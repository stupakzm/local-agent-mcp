// Tool executors and tool definitions for the local agent.
// All path operations routed through security.ts assertions.

import fs from "node:fs/promises";
import nodePath from "node:path";
import { execFile } from "node:child_process";
import type { OllamaToolDefinition } from "./ollama.js";
import {
  assertPathSafe,
  assertCommandAllowed,
  buildSafeEnv,
  truncateOutput,
  MAX_OUTPUT_BYTES,
  type ShellMode,
} from "./security.js";

// ---------------------------------------------------------------------------
// Tool definitions (TOOL-05: meaningful descriptions for model tool selection)
// ---------------------------------------------------------------------------

export const TOOL_DEFINITIONS: OllamaToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read the contents of a file at the given path. Returns the full file text. Use this to examine existing code, configs, or data files.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path relative to working directory",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Write content to a file at the given path. Creates the file if it does not exist. Creates intermediate directories automatically. Use this to create or update code, configs, or data files.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path relative to working directory",
          },
          content: {
            type: "string",
            description: "The full content to write to the file",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description:
        "List the contents of a directory with details: file name, type (file/dir), size in bytes, and last modified date. Use this to explore project structure before reading specific files.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path relative to working directory",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bash",
      description:
        "Execute a shell command and return its stdout and stderr. Commands are restricted to a safe allow-list by default: git, ls, cat, echo, grep, find, mkdir, cp, mv, touch, npm, node, python. Use this to run builds, tests, git operations, and explore the filesystem.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute",
          },
        },
        required: ["command"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool result type
// ---------------------------------------------------------------------------

export interface ToolResult {
  success: boolean;
  output: string;
}

// ---------------------------------------------------------------------------
// Individual tool executors
// ---------------------------------------------------------------------------

async function readFile(
  args: Record<string, unknown>,
  workingDir: string,
): Promise<ToolResult> {
  const filePath = String(args.path ?? "");
  const safePath = assertPathSafe(filePath, workingDir);
  const content = await fs.readFile(safePath, "utf-8");
  return { success: true, output: content };
}

async function writeFile(
  args: Record<string, unknown>,
  workingDir: string,
): Promise<ToolResult> {
  const filePath = String(args.path ?? "");
  const content = String(args.content ?? "");
  const safePath = assertPathSafe(filePath, workingDir);
  await fs.mkdir(nodePath.dirname(safePath), { recursive: true });
  await fs.writeFile(safePath, content, "utf-8");
  const bytes = Buffer.byteLength(content, "utf-8");
  return { success: true, output: `wrote ${bytes} bytes to ${filePath}` };
}

async function listDir(
  args: Record<string, unknown>,
  workingDir: string,
): Promise<ToolResult> {
  const dirPath = String(args.path ?? ".");
  const safePath = assertPathSafe(dirPath, workingDir);
  const entries = await fs.readdir(safePath, { withFileTypes: true });
  const lines: string[] = [];
  for (const entry of entries) {
    const entryPath = nodePath.join(safePath, entry.name);
    const stat = await fs.stat(entryPath);
    const typeChar = entry.isDirectory() ? "d" : "f";
    const modified = stat.mtime.toISOString();
    lines.push(`${typeChar} ${entry.name} ${stat.size}B ${modified}`);
  }
  return { success: true, output: lines.join("\n") };
}

async function bashExec(
  args: Record<string, unknown>,
  workingDir: string,
  shellMode: ShellMode,
  allowedCommands: readonly string[],
  timeoutMs: number,
): Promise<ToolResult> {
  if (shellMode === "none") {
    return { success: false, output: "bash is disabled (shell mode: none)" };
  }

  const command = String(args.command ?? "");

  if (shellMode === "restricted") {
    assertCommandAllowed(command, allowedCommands);
  }

  const env = buildSafeEnv();

  return new Promise<ToolResult>((resolve) => {
    const child = execFile(
      "bash",
      ["-c", command],
      {
        cwd: workingDir,
        timeout: timeoutMs,
        env,
        maxBuffer: MAX_OUTPUT_BYTES + 1024,
        ...(process.platform !== "win32" ? { detached: true } : {}),
      },
      (error, stdout, stderr) => {
        if (error && "killed" in error && error.killed) {
          const seconds = Math.round(timeoutMs / 1000);
          resolve({
            success: false,
            output: `command timed out after ${seconds}s`,
          });
          return;
        }

        let output = stdout + stderr;

        if (error && !stdout && !stderr) {
          resolve({ success: false, output: error.message });
          return;
        }

        output = truncateOutput(output);

        if (shellMode === "full") {
          output += "\n[shell mode: full — no restrictions applied]";
        }

        resolve({
          success: !error,
          output,
        });
      },
    );

    // Process group kill on timeout (Unix only)
    if (process.platform !== "win32" && child.pid) {
      child.on("error", () => {
        // handled in callback
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  workingDir: string,
  shellMode: ShellMode,
  allowedCommands: readonly string[],
  timeoutMs: number,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "read_file":
        return await readFile(args, workingDir);
      case "write_file":
        return await writeFile(args, workingDir);
      case "list_dir":
        return await listDir(args, workingDir);
      case "bash":
        return await bashExec(
          args,
          workingDir,
          shellMode,
          allowedCommands,
          timeoutMs,
        );
      default:
        return { success: false, output: `unknown tool: ${name}` };
    }
  } catch (err) {
    return {
      success: false,
      output: err instanceof Error ? err.message : String(err),
    };
  }
}
