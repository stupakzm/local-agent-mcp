import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runAgentLoop } from "./loop.js";
import { loadConfig, ConfigError } from "./config.js";
import type { AppConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Configuration (fail-fast on invalid env vars)
// ---------------------------------------------------------------------------

let config: AppConfig;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

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
      model: z.string().optional().describe(`Ollama model name (default: ${config.model})`),
    },
  },
  async ({ prompt, model }) => {
    try {
      const result = await runAgentLoop({
        prompt,
        model: model ?? config.model,
        host: config.ollamaHost,
        workingDir: config.workingDir,
        maxIterations: config.maxIterations,
        shellMode: config.shellMode,
        allowedCommands: config.allowedCommands,
        timeoutMs: config.timeoutMs,
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
        logLines.push(`[stopped: max iterations reached (${config.maxIterations})]`);
      }

      if (result.parseFailure) {
        logLines.push(
          `[parse failed after ${result.parseFailure.attemptCount} attempts: ${result.parseFailure.reason}]`
        );
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
  console.error(`local-agent-mcp | dir: ${config.workingDir} | model: ${config.model} | shell: ${config.shellMode} | host: ${config.ollamaHost}`);
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
