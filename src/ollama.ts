// Ollama HTTP client — typed request/response with native fetch

export interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
}

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>; // Pre-parsed object, NOT a JSON string
  };
}

export interface OllamaToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  tools?: OllamaToolDefinition[];
  stream: false;
}

export interface OllamaChatResponse {
  message: OllamaMessage;
  done: boolean;
}

export async function chatWithOllama(
  host: string,
  request: OllamaChatRequest,
): Promise<OllamaChatResponse> {
  const url = `${host}/api/chat`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    throw new Error(
      `Ollama is not running at ${host} -- start it with: ollama serve`,
    );
  }

  if (!resp.ok) {
    throw new Error(`Ollama error: ${resp.status} ${resp.statusText}`);
  }

  return (await resp.json()) as OllamaChatResponse;
}
