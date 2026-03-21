import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runAgentLoop } from "./loop.js";
import { DEFAULT_ALLOWED_COMMANDS } from "./security.js";
import type { ShellMode } from "./security.js";

// ---------------------------------------------------------------------------
// Hardcoded config (Phase 4 will replace with env vars)
// ---------------------------------------------------------------------------

const OLLAMA_HOST = "http://localhost:11434";
const DEFAULT_MODEL = "qwen2.5-coder:7b";
const MAX_ITERATIONS = 10;
const TIMEOUT_MS = 30_000;
const SHELL_MODE: ShellMode = "restricted";

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "local-agent-mcp",
  version: "0.1.0",
});

server.registerTool(
  "run_local_agent",
  {
    description:
      "Run a task using a local Ollama model. The agent can read files, write files, list directories, and execute shell commands to complete the task.",
    inputSchema: {
      prompt: z.string().describe("The task or question for the local agent"),
      model: z.string().optional().describe("Ollama model name (default: qwen2.5-coder:7b)"),
    },
  },
  async ({ prompt, model }) => {
    try {
      const result = await runAgentLoop({
        prompt,
        model: model ?? DEFAULT_MODEL,
        host: OLLAMA_HOST,
        workingDir: process.cwd(),
        maxIterations: MAX_ITERATIONS,
        shellMode: SHELL_MODE,
        allowedCommands: DEFAULT_ALLOWED_COMMANDS,
        timeoutMs: TIMEOUT_MS,
      });

      // Format execution log
      const logLines: string[] = [];

      for (const step of result.steps) {
        const argsStr = Object.entries(step.args)
          .map(([k, v]) => {
            const val = typeof v === "string" && v.length > 80
              ? v.slice(0, 80) + "..."
              : JSON.stringify(v);
            return `${k}=${val}`;
          })
          .join(", ");

        if (step.result.success) {
          const summary = step.result.output.length > 200
            ? `${step.result.output.split("\n").length} lines`
            : step.result.output.trim();
          logLines.push(`${step.toolName}(${argsStr}) → ${summary}`);
        } else {
          logLines.push(`${step.toolName}(${argsStr}) → blocked: ${step.result.output}`);
        }
      }

      if (result.stoppedByLimit) {
        logLines.push(`[stopped: max iterations reached (${MAX_ITERATIONS})]`);
      }

      const executionLog = logLines.length > 0
        ? logLines.join("\n") + "\n\n"
        : "";

      const responseText = executionLog + result.finalMessage;

      return {
        content: [{ type: "text" as const, text: responseText }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`local-agent-mcp running on stdio | working dir: ${process.cwd()} | shell mode: ${SHELL_MODE}`);
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
