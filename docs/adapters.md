# Agent adapters

## Claude Code

Protocol ownership: [`src/adapters/claude-code.mjs`](../src/adapters/claude-code.mjs). Reference: [official hooks documentation](https://code.claude.com/docs/en/hooks), consulted 2026-10-22.

The adapter accepts `PreToolUse` JSON with `tool_name`, object `tool_input`, and absolute `cwd`. Other host metadata is accepted and ignored. It maps policy `deny`/`ask` to `hookSpecificOutput.permissionDecision`, includes `hookEventName`, and puts a redacted reason in `permissionDecisionReason`. Valid responses exit 0. Warnings use `systemMessage`; pass returns `{}`. Neither supplies an approval.

Malformed input, invalid config, input/nesting limits or failed audit I/O use exit 2 and a fixed stderr message. This only helps if the hook starts and runs. Missing executables and host timeouts need host-level fail-closed settings supported by your installed Claude version.

The generated matcher is `.*` so it covers PowerShell, file tools and MCP calls. The hook command is a locally installed executable; no network package resolution occurs during a hook invocation. No PermissionRequest, PostToolUse, async or HTTP hook semantics are assumed.

## Codex CLI, Gemini CLI and Cursor

[`src/adapters/agents.mjs`](../src/adapters/agents.mjs) owns normalization and output for these hosts. Select it with `hook --agent codex|gemini|cursor`. The existing public `decode`/`encode` exports and default `hook` still use the Claude Code protocol.

All three adapters convert policy `ask` to denial. They never claim interactive approval. Audit records retain the underlying policy decision (`ask`), while the host receives denial. Codex and Gemini clean/warn results abstain; Cursor requires `permission: "allow"` to continue through this hook. Keep host sandboxing and permissions enabled.

Copyable settings, verified source links, tool normalization and host failure limits live in the [Codex](integrations/codex.md), [Gemini](integrations/gemini.md) and [Cursor](integrations/cursor.md) guides. These are protocol-tested adapters; live host enforcement must be verified in your installed version. Unknown tools have no assumed file/shell semantics. Native hooks do not cover every agent-internal action, direct context attachment or Tab completion.

For hosts without compatible hook support, use [git pre-commit](integrations/pre-commit.md) and [CI](integrations/github-actions.md). They check saved secrets, not command execution. No notification-only hook is treated as an authorization gate.
