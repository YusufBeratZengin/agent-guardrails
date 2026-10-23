# Gemini CLI

Status: native `BeforeTool` denial adapter. Requires Node.js 20+.

## Configuration

Merge into project `.gemini/settings.json`, replacing the absolute checkout path:

```json
{
  "hooks": {
    "BeforeTool": [{
      "matcher": ".*",
      "hooks": [{
        "type": "command",
        "name": "agent-guardrails",
        "command": "node \"/absolute/path/to/agent-guardrails/bin/agent-guardrails.mjs\" hook --agent gemini",
        "timeout": 10000
      }]
    }]
  }
}
```

Gemini uses JSON stdin/stdout and millisecond timeouts. `BeforeTool` supports
`decision: "deny"`; exit 2 blocks, while other failure codes can continue with a
warning. [Official hook reference](https://geminicli.com/docs/hooks/reference/),
checked 2026-10-24. Merge existing hooks and use a trusted project.

## Behavior and verification

This adapter maps `run_shell_command` to shell checks, `write_file`/`replace` to
write/edit checks, `read_file`, `grep_search`/`search_file_content` and `glob` to
literal read checks, and `mcp_*` tools to MCP checks. Shell `dir_path` is resolved
from the project root. Unknown tools and direct context attachments have no
assumed file semantics. [Tool arguments](https://geminicli.com/docs/reference/tools/).

Both policy **`ask` and `deny` block**. No interactive confirmation is fabricated;
pass/warn leave Gemini's normal permissions in place. Input/config/audit errors
exit 2. A missing executable or host timeout remains a host failure limitation.

Restart Gemini, verify hooks are enabled, run `git status`, then request
`curl --version` to test default outbound denial without sending data. If the
hook is unavailable in your version, install [pre-commit](pre-commit.md) and
[CI](github-actions.md). These fallback checks cover saved secrets, not commands.
