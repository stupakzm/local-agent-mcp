// Agent loop — orchestrates Ollama calls and tool execution.

import { chatWithOllama } from "./ollama.js";
import type { OllamaMessage } from "./ollama.js";
import { executeTool, TOOL_DEFINITIONS } from "./tools.js";
import type { ToolResult } from "./tools.js";
import type { ShellMode } from "./security.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoopStep {
  toolName: string;
  args: Record<string, unknown>;
  result: ToolResult;
}

export interface AgentResult {
  steps: LoopStep[];
  finalMessage: string;
  iterationCount: number;
  stoppedByLimit: boolean;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  "You are a helpful coding assistant. You have access to tools for reading files, writing files, listing directories, and executing shell commands. Use these tools to complete the user's task. When you are done, respond with a final text message summarizing what you did.";

export async function runAgentLoop(options: {
  prompt: string;
  model: string;
  host: string;
  workingDir: string;
  maxIterations: number;
  shellMode: ShellMode;
  allowedCommands: readonly string[];
  timeoutMs: number;
}): Promise<AgentResult> {
  const {
    prompt,
    model,
    host,
    workingDir,
    maxIterations,
    shellMode,
    allowedCommands,
    timeoutMs,
  } = options;

  const messages: OllamaMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ];

  const steps: LoopStep[] = [];
  let iteration = 0;
  let finalMessage = "";
  let stoppedByLimit = false;

  while (iteration < maxIterations) {
    iteration++;

    const response = await chatWithOllama(host, {
      model,
      messages,
      tools: TOOL_DEFINITIONS,
      stream: false as const,
    });

    const assistantMessage = response.message;

    // CRITICAL (LOOP-04): Append assistant message BEFORE processing tool results
    messages.push(assistantMessage);

    const toolCalls = assistantMessage.tool_calls;

    // If no tool calls, the model is done
    if (!toolCalls || toolCalls.length === 0) {
      finalMessage = assistantMessage.content;
      break;
    }

    // Log iteration to stderr
    console.error(
      `[agent] iteration ${iteration}: ${toolCalls.length} tool call(s)`,
    );

    // Process each tool call
    for (const tc of toolCalls) {
      const name = tc.function.name;
      const args = tc.function.arguments; // Pre-parsed object, do NOT JSON.parse

      const result = await executeTool(
        name,
        args,
        workingDir,
        shellMode,
        allowedCommands,
        timeoutMs,
      );

      steps.push({ toolName: name, args, result });

      // LOOP-03: Always append tool result as role:tool, even on error
      messages.push({ role: "tool", content: result.output });
    }
  }

  // Check if stopped by iteration limit
  if (iteration >= maxIterations && steps.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === "tool") {
      // Last iteration had tool calls — model never got to respond
      stoppedByLimit = true;
      finalMessage = "";
    }
  }

  return { steps, finalMessage, iterationCount: iteration, stoppedByLimit };
}
