# Claude Code

Status: primary native integration. Node.js 20+ is required. The default `hook`
command and `init` retain their existing Claude Code behavior.

## Configuration

In this checkout, from the repository root:

```sh
node bin/agent-guardrails.mjs init --write --command "node bin/agent-guardrails.mjs hook"
```

`init` without `--write` prints the configuration. Writes merge existing settings,
back up the original file and are idempotent. For another project, replace the
command below with `node "/absolute/path/to/agent-guardrails/bin/agent-guardrails.mjs" hook`.
Merge into `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": ".*",
      "hooks": [{
        "type": "command",
        "command": "node bin/agent-guardrails.mjs hook",
        "timeout": 10,
        "onFailure": "block"
      }]
    }]
  }
}
```

`onFailure: "block"` requires Claude Code v2.1.295+. It covers startup failures
and timeouts. The adapter itself returns exit 2 for malformed input, invalid
policy or audit failure. Keep the hook synchronous. Restart Claude Code and
review `/hooks`. [Official hook reference](https://code.claude.com/docs/en/hooks),
checked 2026-10-24.

## Verify

Use the [safe dry-run examples](../examples.md#powershell-dry-run), then verify
the installed host with a harmless `git status`. Test blocking without executing
a destructive command: temporarily set `rules.outbound.mode` to `deny` and ask
the agent to run `curl --version`; restore your policy afterward. The classifier
conservatively flags this command without needing network access.

`deny` and `ask` use `hookSpecificOutput.permissionDecision`; pass and warn
abstain from approval. The broad matcher covers shell, file and MCP calls exposed
by the host. Verify that an outbound `ask` produces an interactive prompt in
your installed permission mode; other hooks and host settings affect enforcement.

After a package release, a local dependency can use
`npx --no-install agent-guardrails hook`. Keep it installed; do not fetch packages
during hook execution. For agents without compatible hooks, use
[pre-commit](pre-commit.md) and [CI](github-actions.md).
