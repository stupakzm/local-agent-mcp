// Agent loop — orchestrates Ollama calls and tool execution.

import { chatWithOllama } from "./ollama.js";
import type { OllamaMessage, OllamaToolCall } from "./ollama.js";
import { executeTool, TOOL_DEFINITIONS } from "./tools.js";
import type { ToolResult } from "./tools.js";
import type { ShellMode } from "./security.js";
import { parseToolCall } from "./parser.js";
import type { ParseFailure } from "./parser.js";

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
  parseFailure?: ParseFailure;  // per D-08
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

  // chatFn for parser retry loop — isolated from main conversation history (per D-03)
  const chatFn = async (correctionMessages: OllamaMessage[]): Promise<OllamaMessage> => {
    const response = await chatWithOllama(host, {
      model,
      messages: correctionMessages,
      tools: TOOL_DEFINITIONS,
      stream: false as const,
      format: 'json',
    });
    return response.message;
  };

  while (iteration < maxIterations) {
    iteration++;

    const response = await chatWithOllama(host, {
      model,
      messages,
      tools: TOOL_DEFINITIONS,
      stream: false as const,
      format: 'json',
    });

    const assistantMessage = response.message;

    // CRITICAL (LOOP-04): Append assistant message BEFORE processing tool results
    messages.push(assistantMessage);

    // Tier 1: native tool_calls (PARSE-01 fast path)
    let toolCalls: OllamaToolCall[] | null = assistantMessage.tool_calls ?? null;

    // Tier 2+3: text extraction + retry (only if no native tool_calls)
    if (!toolCalls || toolCalls.length === 0) {
      const parseResult = await parseToolCall(assistantMessage.content, chatFn);

      // Check for ParseFailure (per D-07)
      if (parseResult && 'reason' in parseResult) {
        const failure = parseResult as ParseFailure;

        // Per D-07: append synthetic tool result message to history before breaking
        messages.push({
          role: 'tool' as const,
          content: `[parse failed: ${failure.reason}]`,
        });

        return {
          steps,
          finalMessage: "",
          iterationCount: iteration,
          stoppedByLimit: false,
          parseFailure: failure,
        };
      }

      toolCalls = parseResult as OllamaToolCall[] | null;
    }

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
