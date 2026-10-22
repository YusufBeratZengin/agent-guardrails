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

On Windows with a compatible shell, a command can be `node "C:/tools/agent-guardrails/bin/agent-guardrails.mjs" hook`. Verify it in your installed Claude Code. Do not use `npx` to resolve a package on each hook invocation. Review host failure behavior separately from package output.

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
  cwd: '/project', projectRoot: '/project', home: '/home/example',
}, config, [locale]);
console.log(result.decision); // deny
```

`detect(text)` returns `{kind, index}[]` and should be deterministic, local and side-effect free. Findings from plugins are converted to fixed redacted messages; detector text and values are not emitted. Locale-specific rules should implement their own validation and false-positive tests. The shipped CLI uses only `generic`; a custom host can call the pure engine with additional detectors and must correctly enforce its returned decision.
