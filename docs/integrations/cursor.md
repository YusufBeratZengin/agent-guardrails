# Cursor

Status: native Agent `preToolUse` denial adapter. Requires Node.js 20+.

## Configuration

Merge into `.cursor/hooks.json`, replacing the absolute checkout path:

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [{
      "command": "node \"/absolute/path/to/agent-guardrails/bin/agent-guardrails.mjs\" hook --agent cursor",
      "timeout": 10,
      "failClosed": true
    }]
  }
}
```

Cursor's generic `preToolUse` hook takes `tool_name`, `tool_input`, `cwd` and
returns `permission: "allow" | "deny"`. It differs from the narrower
`beforeShellExecution`/`beforeMCPExecution` events, which support `ask`.
`failClosed` blocks failures/timeouts. Project hook files reload automatically.
[Official hooks reference](https://cursor.com/docs/hooks), checked 2026-10-24.

## Behavior and verification

Use only `preToolUse` with this adapter. Both policy **`ask` and `deny` block**;
no interactive prompt is promised. Clean calls return `permission: "allow"`
for this hook, while Cursor's own permissions remain necessary. Warnings include
a redacted message.

`Shell` is normalized to shell checks, including its `working_directory`.
`Read`/`Write`/`Edit` use the engine's file checks; `path` is accepted as a
`file_path` alias. `MCP:*` and `mcp__*` receive MCP checks. Other tool names have
no assumed filesystem semantics. Tab completion events are not covered.

Open a fresh Agent conversation, test `git status`, then request `curl --version`
to verify default outbound denial without sending data. Use
[pre-commit](pre-commit.md) and [CI](github-actions.md) if your Cursor version has
no generic hook support. Never attach the Claude adapter directly to Cursor's
different wire protocol.
