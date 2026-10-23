# OpenAI Codex CLI

Status: native denial adapter, with pre-commit/CI fallback. Run
`node /absolute/path/to/agent-guardrails/bin/agent-guardrails.mjs hook --agent codex`.
Node.js 20+ is required; installation from this checkout needs no npm release.

## Configuration

Merge this into the trusted project's `.codex/hooks.json`. Replace the absolute
path with your checkout; forward slashes also work in Windows paths:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": ".*",
      "hooks": [{
        "type": "command",
        "command": "node \"/absolute/path/to/agent-guardrails/bin/agent-guardrails.mjs\" hook --agent codex",
        "timeout": 10
      }]
    }]
  }
}
```

Codex supports project/user hooks and requires review and trust through `/hooks`.
The documented `PreToolUse` contract supports denial, **not `ask`**; unsupported
outputs, callback errors and timeouts can let the tool continue. `notify` is not
an authorization gate. [Official hooks reference](https://learn.chatgpt.com/docs/hooks#pretooluse),
checked 2026-10-24.

## Behavior and verification

This adapter converts **both policy `ask` and `deny` to denial**. Thus a default
`git push` is blocked, rather than opening a permission prompt. Arrange a separate
human-controlled operation when approval is needed. Pass/warn never auto-approve.
Do not install the default Claude command unchanged in Codex.

The adapter normalizes canonical `Bash`, `apply_patch` (patch text in
`tool_input.command`) and `mcp__*` inputs. It scans patch content and literal
Add/Update/Delete/Move paths. Unknown tools receive only the engine's documented
generic checks. Patch parsing is lexical, not an execution boundary.

Review the hook in `/hooks`, test `git status`, and test denial with
`curl --version`. Review [coverage limits](../threat-model.md) before use.

If your installed CLI lacks this hook contract, use the ready-to-copy
[git pre-commit configuration](pre-commit.md) and [GitHub Action](github-actions.md).
Those scan saved content for secrets; they cannot prevent a live shell command
or outbound action. Keep Codex sandboxing and approval policies enabled.
