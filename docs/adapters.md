# Agent adapters

## Claude Code

Protocol ownership: [`src/adapters/claude-code.mjs`](../src/adapters/claude-code.mjs). Reference: [official hooks documentation](https://code.claude.com/docs/en/hooks), consulted 2026-10-22.

The adapter accepts `PreToolUse` JSON with `tool_name`, object `tool_input`, and absolute `cwd`. Other host metadata is accepted and ignored. It maps policy `deny`/`ask` to `hookSpecificOutput.permissionDecision`, includes `hookEventName`, and puts a redacted reason in `permissionDecisionReason`. Valid responses exit 0. Warnings use `systemMessage`; pass returns `{}`. Neither supplies an approval.

Malformed input, invalid config, input/nesting limits or failed audit I/O use exit 2 and a fixed stderr message. This only helps if the hook starts and runs. Missing executables and host timeouts need host-level fail-closed settings supported by your installed Claude version.

The generated matcher is `.*` so it covers PowerShell, file tools and MCP calls. The hook command is a locally installed executable; no network package resolution occurs during a hook invocation. No PermissionRequest, PostToolUse, async or HTTP hook semantics are assumed.

## Codex CLI — planned

No Codex adapter is included in 0.1.0. The [official hooks reference](https://learn.chatgpt.com/docs/hooks#pretooluse) documents pre-tool denial, but currently states that `permissionDecision: "ask"` is unsupported: an unsupported response can fail the hook while the tool call continues. Reusing the Claude adapter would therefore give a misleading outbound confirmation guarantee.

The [official configuration reference](https://developers.openai.com/codex/config-reference/) describes `notify` as notifications. This package does not treat it as an authorization gate. Future support needs a separately verified decision contract, tool coverage, an explicit confirmation strategy, and its own adapter tests. The shared pure guards are available for trusted integrations today; hosts must supply their own enforcement.
