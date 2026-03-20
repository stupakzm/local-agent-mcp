# MCP TypeScript SDK Research

**Project:** local-agent-mcp
**Researched:** 2026-03-20
**Sources:** modelcontextprotocol.io official docs (HIGH confidence), personal Claude Code knowledge (MEDIUM confidence)

---

## 1. Package Installation

```bash
npm install @modelcontextprotocol/sdk zod
npm install -D @types/node typescript
```

The SDK is published as `@modelcontextprotocol/sdk`. Zod is the recommended schema library
for defining `inputSchema` — the SDK expects Zod schemas directly, not raw JSON Schema.

**Required `package.json` settings:**

```json
{
  "type": "module",
  "scripts": {
    "build": "tsc && chmod 755 build/index.js"
  }
}
```

The `"type": "module"` is required — the SDK uses ES module imports. Without it, the
`.js` extension imports inside the SDK break.

**Required `tsconfig.json`:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

`module: "Node16"` and `moduleResolution: "Node16"` are required for the SDK's `.js`
extension imports to resolve correctly in TypeScript.

---

## 2. Server Initialization

### The `McpServer` Class

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer({
  name: "my-server",     // Required: human-readable server name
  version: "1.0.0",      // Required: semver string
});
```

`McpServer` is the high-level API. There is also a lower-level `Server` class from
`@modelcontextprotocol/sdk/server/index.js` that requires manual request handler
registration — use `McpServer` unless you need fine-grained control.

---

## 3. Defining and Exposing Tools

### Method: `server.registerTool()`

This is the primary API for registering tools. It takes three arguments:

```typescript
server.registerTool(
  toolName: string,
  config: {
    description: string,
    inputSchema: ZodRawShape,   // Zod field definitions (NOT z.object())
    annotations?: ToolAnnotations,
  },
  handler: (args: inferred) => Promise<ToolResult>
);
```

**Important:** `inputSchema` takes a plain object of Zod field definitions, not a wrapped
`z.object()`. The SDK wraps it internally.

```typescript
import { z } from "zod";

server.registerTool(
  "run_local_agent",
  {
    description: "Run a task using a local Ollama model",
    inputSchema: {
      prompt: z.string().describe("The task or question for the local agent"),
      model: z.string().optional().describe("Ollama model name, e.g. qwen2.5-coder:32b"),
    },
  },
  async ({ prompt, model }) => {
    // handler receives typed, validated args
    const result = await runAgent(prompt, model ?? "qwen2.5-coder:32b");
    return {
      content: [{ type: "text", text: result }],
    };
  }
);
```

### Alternative: `server.tool()` (deprecated alias)

The docs show `server.registerTool()` as the canonical method. Older examples used
`server.tool()` — treat `registerTool` as authoritative.

### Tool Return Format

Handlers must return an object with a `content` array. Each item in `content` is a
content block:

```typescript
// Text response (most common)
return {
  content: [{ type: "text", text: "Result text here" }],
};

// Error response (use isError: true, not thrown exception)
return {
  content: [{ type: "text", text: "Error: something went wrong" }],
  isError: true,
};

// Multiple content blocks
return {
  content: [
    { type: "text", text: "Summary: ..." },
    { type: "text", text: "Details: ..." },
  ],
};

// Image response
return {
  content: [{
    type: "image",
    data: base64String,
    mimeType: "image/png",
  }],
};
```

### Tool Error Handling

Two distinct error channels exist:

1. **Protocol errors** — throw a JavaScript `Error`. The SDK converts this to a JSON-RPC
   error response. Use for: invalid args that Zod missed, initialization failures.

2. **Tool execution errors** — return `{ content: [...], isError: true }`. Use for:
   runtime failures (API down, file not found, command failed). This signals to Claude
   that the tool ran but the operation failed, allowing it to retry or adapt.

**Do not** let unhandled exceptions bubble up in tool handlers. Claude will receive a
generic protocol error and cannot inspect the failure reason. Catch all exceptions in
handlers and return them as `isError: true` responses.

---

## 4. Transport: stdio vs HTTP

### stdio (use this for Claude Code integration)

```typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Server running on stdio"); // stderr only — see gotchas
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

How it works: Claude Code (or Claude Desktop) spawns the server as a child process and
communicates over `stdin`/`stdout`. JSON-RPC messages are newline-delimited.

**stdio is the only transport supported by Claude Code's MCP config.** HTTP transport
requires a separately running server process and a URL, which is not the standard
Claude Code integration pattern.

### Streamable HTTP (for remote/multi-client servers)

```typescript
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// This requires running an HTTP server (e.g., Express) and mounting the transport
// Not needed for Claude Code local integration
```

The old `SSEServerTransport` from protocol version 2024-11-05 has been **deprecated** and
replaced by `StreamableHTTPServerTransport`. If you see `SSEServerTransport` in older
examples, it is the deprecated version.

**Decision for this project:** Use stdio. It is simpler, has no network security surface,
and is exactly what Claude Code expects.

---

## 5. Claude Code: MCP Server Registration

Claude Code (the CLI) and Claude Desktop use the same config file format but different
file locations.

### Config File Locations

| Client | Platform | Path |
|--------|----------|------|
| Claude Desktop | macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop | Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Claude Code | Global | `~/.claude/claude_code_config.json` (or set via `claude mcp` CLI) |
| Claude Code | Project | `.mcp.json` in project root |

Claude Code also supports a project-scoped `.mcp.json` file committed to the repo. This
is the recommended approach for open-source distribution — users clone the repo and the
server config is already there.

### Config Format

```json
{
  "mcpServers": {
    "local-agent": {
      "command": "node",
      "args": ["/absolute/path/to/local-agent-mcp/build/index.js"],
      "env": {
        "OLLAMA_HOST": "http://localhost:11434"
      }
    }
  }
}
```

**Field reference:**

| Field | Required | Description |
|-------|----------|-------------|
| `command` | Yes | Executable to run (`node`, `npx`, `python`, etc.) |
| `args` | Yes | Array of arguments passed to the command |
| `env` | No | Environment variables merged with the process environment |
| `cwd` | No | Working directory for the server process |

**Path rules:**
- `args` paths must be absolute, not relative.
- On Windows, use forward slashes or double-escaped backslashes.
- If `node` is not in PATH, use the full path to the Node.js executable.

### Claude Code CLI Commands

Claude Code supports a `claude mcp` subcommand for managing servers:

```bash
# Add a server globally
claude mcp add local-agent node /absolute/path/to/build/index.js

# Add a server scoped to a project (creates/updates .mcp.json)
claude mcp add --scope project local-agent node /absolute/path/to/build/index.js

# List registered servers
claude mcp list

# Remove a server
claude mcp remove local-agent
```

After adding a server, Claude Code discovers it on the next invocation — no restart
required (unlike Claude Desktop which requires a full restart).

### How Claude Code Discovers Tools

1. Claude Code reads its MCP config (global and/or project `.mcp.json`).
2. For each entry in `mcpServers`, it spawns the process using `command` + `args`.
3. It sends `tools/list` over stdio to enumerate available tools.
4. Tool names are prefixed with the server name in the UI (e.g., `local-agent:run_local_agent`).
5. When Claude decides to call a tool, it sends `tools/call` with the tool name and args.

---

## 6. Testing Without Claude

Use the MCP Inspector to test a server without connecting Claude Code:

```bash
npx @modelcontextprotocol/inspector node /path/to/build/index.js
```

This launches a browser UI at `localhost:6274` where you can:
- List tools and see their schemas
- Call tools with custom inputs
- Inspect the raw JSON-RPC messages

Useful for verifying tool definitions and return shapes before integrating with Claude.

---

## 7. Gotchas and Known Issues

### CRITICAL: Never Write to stdout in stdio Mode

`console.log()` writes to stdout. In stdio mode, stdout is the JSON-RPC transport
channel. Any non-MCP bytes on stdout will corrupt the message stream and break the
connection silently or with a parse error.

```typescript
// WRONG — corrupts the transport
console.log("Server started");

// CORRECT — stderr is safe
console.error("Server started");
```

This applies to any stdout writes: `process.stdout.write()`, `console.log()`,
third-party libraries that write to stdout, etc. Audit dependencies for stdout writes.

### Build Required Before Registration

The config must point to the compiled `.js` output, not the `.ts` source. TypeScript
source cannot be run directly with `node`. Always run `npm run build` after changes
before testing with Claude Code.

### Windows Path Issues

On Windows, `%APPDATA%` and similar environment variables are not expanded in the
config JSON. If you see `${APPDATA}` appearing literally in paths, hardcode the
expanded value or add it to the `env` block:

```json
{
  "mcpServers": {
    "local-agent": {
      "command": "node",
      "args": ["C:\\Users\\username\\projects\\local-agent-mcp\\build\\index.js"],
      "env": {
        "APPDATA": "C:\\Users\\username\\AppData\\Roaming"
      }
    }
  }
}
```

### npx in Claude Desktop / Claude Code can Fail

When using `npx` as the `command`, it may fail on Windows if npm is not installed
globally, or if the PATH seen by the spawned process differs from the shell PATH. Prefer
`node path/to/build/index.js` for local servers.

### ES Module `.js` Extensions in Imports

Because the SDK uses ES module imports with explicit `.js` extensions, TypeScript
`moduleResolution: "Node16"` (or `"Bundler"`) is required. The legacy `"node"` resolution
mode causes import errors. If you see `Cannot find module` errors at runtime, this is
the likely cause.

### Zod v3 vs v4 Compatibility

The docs and examples pin Zod at `zod@3`. Zod v4 introduced breaking changes. Install
the specific version:

```bash
npm install zod@3
```

Confirm the installed version with `npm list zod` if you encounter schema validation
errors.

### Tool Handler Must Not Throw for Expected Failures

If a tool handler throws an unhandled exception, Claude receives a protocol-level error
(JSON-RPC error response) rather than a tool result. This means it cannot read the
error message and adapt. Always catch exceptions inside handlers and return them as
`{ content: [...], isError: true }`.

```typescript
// Pattern: always catch in handlers
async ({ prompt }) => {
  try {
    const result = await doWork(prompt);
    return { content: [{ type: "text", text: result }] };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${String(err)}` }],
      isError: true,
    };
  }
}
```

### Claude Desktop Requires Full Restart

Unlike Claude Code (which picks up server changes on next invocation), Claude Desktop
caches MCP server connections at startup and requires a full application restart after
any config change.

### SSE Transport Is Deprecated

The older `SSEServerTransport` (HTTP + Server-Sent Events) from protocol version
2024-11-05 is deprecated. The replacement is `StreamableHTTPServerTransport` which
supports both plain HTTP responses and optional SSE streaming. Do not build new servers
on `SSEServerTransport`.

---

## 8. Complete Minimal Server Template

```typescript
// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "local-agent-mcp",
  version: "1.0.0",
});

server.registerTool(
  "run_local_agent",
  {
    description: "Run a task using a local Ollama model",
    inputSchema: {
      prompt: z.string().describe("The task or question to delegate to the local agent"),
      model: z
        .string()
        .optional()
        .describe("Ollama model name (default: qwen2.5-coder:32b)"),
    },
  },
  async ({ prompt, model }) => {
    try {
      // Tool implementation here
      const result = `Agent result for: ${prompt}`;
      return {
        content: [{ type: "text", text: result }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Agent failed: ${String(err)}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("local-agent-mcp running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
```

---

## 9. MCP Protocol Message Reference

For debugging, these are the raw JSON-RPC messages that flow over stdio:

**tools/list request (client → server):**
```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }
```

**tools/list response (server → client):**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [{
      "name": "run_local_agent",
      "description": "...",
      "inputSchema": {
        "type": "object",
        "properties": {
          "prompt": { "type": "string", "description": "..." }
        },
        "required": ["prompt"]
      }
    }]
  }
}
```

**tools/call request (client → server):**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "run_local_agent",
    "arguments": { "prompt": "List files in /tmp" }
  }
}
```

**tools/call response (server → client):**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [{ "type": "text", "text": "file1.txt\nfile2.txt" }],
    "isError": false
  }
}
```

---

## Sources

- Tool concepts: https://modelcontextprotocol.io/docs/concepts/tools (HIGH confidence)
- TypeScript quickstart: https://modelcontextprotocol.io/quickstart/server (HIGH confidence)
- Transport spec: https://modelcontextprotocol.io/docs/concepts/transports (HIGH confidence)
- Local server connection: https://modelcontextprotocol.io/docs/develop/connect-local-servers.md (HIGH confidence)
- Claude Code `mcp` CLI commands: Claude Code documentation (MEDIUM confidence — verified by use, not docs page)
- `.mcp.json` project scoping: Claude Code documentation (MEDIUM confidence)
