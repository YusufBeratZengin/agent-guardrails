# Examples

## Claude settings

`agent-guardrails init` prints:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": ".*",
      "hooks": [{ "type": "command", "command": "agent-guardrails hook" }]
    }]
  }
}
```

If PATH differs in your agent, use an installed Node executable and an absolute script path. Quote paths that contain spaces using your host shell's syntax:

```json
{
  "type": "command",
  "command": "node \"/absolute/path/agent-guardrails/bin/agent-guardrails.mjs\" hook"
}
```

Generate either variant with `init --command <string>`; it is stored verbatim and must be a nonempty single line:

```sh
node bin/agent-guardrails.mjs init --command 'node "/absolute/path/agent-guardrails/bin/agent-guardrails.mjs" hook'
```

After installing the published package as a project development dependency, use `npx --no-install agent-guardrails init --write --command "npx --no-install agent-guardrails hook"`. `--no-install` prevents fetching a missing package at hook time; the hook must start in a directory where that local package resolves. On Windows, use the appropriate absolute Node/script paths and shell quoting. Verify the command in your installed Claude Code and review host failure behavior separately from package output.

The ready-to-copy [settings snippet](../examples/settings.snippet.json) matches this local install. The [strict team profile](../examples/.agent-guardrails.json) enables PII denial, asks for all MCP calls and disables the destructive force-with-lease exemption. Copy it to the project root as `.agent-guardrails.json` after reviewing the policy. Audit remains opt-in because log storage and access controls are deployment-specific. The profile uses the root [config schema](../schema/config.schema.json); the Claude settings example uses its separate `$defs.settingsSnippet` definition, without expanding the guardrails config format.

## PowerShell dry-run

```powershell
$guardPayload = @{
  hook_event_name = 'PreToolUse'
  tool_name = 'PowerShell'
  tool_input = @{ command = 'git push' }
  cwd = (Get-Location).Path
} | ConvertTo-Json -Compress
$guardPayload | agent-guardrails hook
```

This exercises JSON on stdin. The example only inspects the command string. To use `test` with legacy PowerShell/native quoting, pass the JSON as one preserved argument; stdin avoids quoting ambiguity for protocol smoke checks.

## Pre-commit

The supplied [hook](../.githooks/pre-commit) runs `node bin/agent-guardrails.mjs scan .`. From this repository, opt in yourself:

```sh
git config core.hooksPath .githooks
```

On POSIX, ensure `.githooks/pre-commit` is executable. For another repository use `agent-guardrails scan .` from its root, with the CLI installed. This scans working-tree content, including untracked/ignored credential files; staged content can differ. It skips symlinks and generated directories. Use a separate staged-index/history scanner for those needs. Remove the `core.hooksPath` setting to uninstall the hook.

For a project-local installation, copy [pre-commit.sh](../examples/pre-commit.sh) to your chosen hook directory as `pre-commit` and make it executable. It uses POSIX sh and `npx --no-install`, preserving the scanner's exit code. The [GitHub Actions scan workflow](../examples/github-actions-scan.yml) runs the same working-tree check after `npm ci`; commit your project's development dependency and lockfile first, after the first package release. No registry access occurs in the scan command itself.

## Ask instead of deny

```json
{
  "rules": {
    "destructive": { "mode": "ask", "allowForceWithLease": false }
  }
}
```

## Private audit directory

Create a directory with restrictive access using your operating system, then configure:

```json
{
  "audit": { "enabled": true, "path": "/absolute/private/logs/guardrails.jsonl" }
}
```

Use a Windows absolute path on Windows. The package does not create parent directories or manage retention. Log errors block execution.

## Locale detector plugin

Only trusted local code can register detectors. JSON configuration never imports a path or package:

```js
import { evaluate, resolveConfig } from 'agent-guardrails';

const locale = {
  id: 'example-locale',
  detect(text) {
    const index = text.indexOf('SYNTHETIC-LOCAL-ID');
    return index < 0 ? [] : [{ kind: 'local-id', index }];
  },
};
const config = resolveConfig({
  rules: { pii: { mode: 'deny', detectors: ['generic', 'example-locale'] } },
});
const result = evaluate({
  toolName: 'mcp__example__send',
  input: { content: 'SYNTHETIC-LOCAL-ID' },
  cwd: '/project', projectRoot: '/project', home: '/synthetic-home',
}, config, [locale]);
console.log(result.decision); // deny
```

`detect(text)` returns `{kind, index}[]` and should be deterministic, local and side-effect free. Findings from plugins are converted to fixed redacted messages; detector text and values are not emitted. Locale-specific rules should implement their own validation and false-positive tests. The shipped CLI uses only `generic`; a custom host can call the pure engine with additional detectors and must correctly enforce its returned decision.
