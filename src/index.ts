import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

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
      // Stub implementation for Phase 1
      // Phase 2 will replace this with the actual agent loop
      void prompt;
      void model;
      return {
        content: [{ type: "text" as const, text: "not implemented" }],
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
  console.error("local-agent-mcp running on stdio");
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
