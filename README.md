# local-agent-mcp

An MCP server that lets Claude Code delegate tasks to a local Ollama model. The local agent can read files, write files, list directories, and execute shell commands — completing multi-step coding tasks without any cloud API calls.

## Prerequisites

- **Node.js** 18 or later
- **Ollama** installed and running (`ollama serve`)
- A pulled model: `ollama pull qwen2.5-coder:7b`
- **Mac or Linux** (Windows: file tools work, but bash execution is not supported — see [Troubleshooting](#troubleshooting))

## Installation

```bash
git clone https://github.com/USER/local-agent-mcp.git
cd local-agent-mcp
npm install
npm run build
```

Replace `USER` with the actual GitHub username or organization.

## Claude Code Registration

The repo includes a `.mcp.json` file that Claude Code detects automatically. After building, Claude Code will find the `local-agent` tool when opened in the project directory.

**Manual registration** (if using a different directory or global config):

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "local-agent": {
      "command": "node",
      "args": ["/absolute/path/to/local-agent-mcp/build/index.js"],
      "env": {
        "AGENT_MODEL": "qwen2.5-coder:7b"
      }
    }
  }
}
```

The `env` block is optional — see [Configuration](#configuration) for all available settings.

## Configuration

All settings are controlled via environment variables. Set them in your MCP config `env` block or export them in your shell before starting the server.

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama API endpoint |
| `AGENT_MODEL` | `qwen2.5-coder:7b` | Model to use for agent tasks |
| `AGENT_WORKING_DIR` | Current directory | Root directory for file operations |
| `AGENT_MAX_ITERATIONS` | `10` | Maximum tool-call rounds before stopping |
| `AGENT_TIMEOUT_SECONDS` | `30` | Timeout per bash command in seconds |
| `AGENT_SHELL_MODE` | `restricted` | `restricted` (allow-list), `full` (no restrictions, warning printed), or `none` (bash disabled) |
| `AGENT_ALLOWED_COMMANDS` | *(empty)* | Comma-separated commands to add to the default allow-list (e.g., `rm,curl`) |

**Default allow-list** (when `AGENT_SHELL_MODE=restricted`): git, ls, cat, echo, grep, find, mkdir, cp, mv, touch, npm, node, python.

Use `AGENT_ALLOWED_COMMANDS` to add commands to this list. For example, `AGENT_ALLOWED_COMMANDS=rm,curl` adds `rm` and `curl` while keeping all defaults.

**Example** — custom model with full shell access and longer timeout:

```json
{
  "mcpServers": {
    "local-agent": {
      "command": "node",
      "args": ["build/index.js"],
      "env": {
        "AGENT_MODEL": "qwen2.5-coder:14b",
        "AGENT_SHELL_MODE": "full",
        "AGENT_TIMEOUT_SECONDS": "60"
      }
    }
  }
}
```

Invalid values cause the server to exit immediately with a clear error message — no silent defaults.

## Supported Models

Any Ollama model that supports tool calling works. Recommended options:

| Model | Size | VRAM | Tool-Call Reliability | Recommended Use |
|-------|------|------|----------------------|-----------------|
| `qwen2.5-coder:7b` | 4.7 GB | ~6 GB | Good | Default — runs on most hardware |
| `qwen2.5-coder:14b` | 9.0 GB | ~12 GB | Very good | Better reasoning, mid-range GPU |
| `qwen2.5-coder:32b` | 18 GB | ~24 GB | Excellent | Best quality, requires high-end GPU |
| `llama3.1:8b` | 4.7 GB | ~6 GB | Moderate | Alternative if qwen unavailable |

To upgrade: set `AGENT_MODEL=qwen2.5-coder:14b` (or `32b`) in your MCP config `env` block. Pull the model first:

```bash
ollama pull qwen2.5-coder:14b
```

## Troubleshooting

**"Connection refused" or "ECONNREFUSED"**

Ollama is not running. Start it with `ollama serve` or check if it's listening on the expected host (`OLLAMA_HOST`).

**"model not found" or 404 from Ollama**

The model hasn't been pulled. Run `ollama pull qwen2.5-coder:7b` (or whichever model you've configured).

**"path not allowed"**

The agent tried to access a file outside its working directory. Set `AGENT_WORKING_DIR` to the correct project root, or check that file paths in the task are relative to the working directory.

**Bash commands fail on Windows**

Bash execution uses Unix process groups (`kill(-pid)`) which are not available on Windows. File tools (`read_file`, `write_file`, `list_dir`) work on all platforms. Set `AGENT_SHELL_MODE=none` to disable bash entirely.

## License

MIT
