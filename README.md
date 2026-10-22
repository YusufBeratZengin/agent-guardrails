# agent-guardrails

[![CI](https://github.com/YusufBeratZengin/agent-guardrails/actions/workflows/ci.yml/badge.svg)](https://github.com/YusufBeratZengin/agent-guardrails/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Node >=20](https://img.shields.io/badge/node-%3E%3D20-green.svg)](package.json)

Local safety hooks for AI coding agents. Catch common secret leaks and destructive commands, and request human confirmation before outbound actions. Node.js 20+, ESM, zero runtime dependencies, no network requests or telemetry.

[Türkçe](README.tr.md) · [Configuration](docs/configuration.md) · [Threat model](docs/threat-model.md) · [Examples](docs/examples.md)

## 60-second quick start

**After the first release**, from your project root:

```sh
npx agent-guardrails init --write
```

For a repeatable project-local install after that release:

```sh
npm install --save-dev agent-guardrails
npx --no-install agent-guardrails init --write --command "npx --no-install agent-guardrails hook"
```

Keep the development dependency installed wherever the hook runs. `--no-install` avoids fetching packages during hook execution. The default snippet uses `agent-guardrails hook`, which must be on the hook process's PATH; `--command` explicitly selects a local or absolute-path command.

**Working now, from source:** in this checkout, without installing anything:

```sh
node bin/agent-guardrails.mjs init
node bin/agent-guardrails.mjs init --command 'node "/absolute/path/agent-guardrails/bin/agent-guardrails.mjs" hook'
```

Replace the absolute script path with your checkout's path and add `--write` to merge the selected snippet into `.claude/settings.json`. You can run the absolute CLI path from another project's root to install there. `init` prints a snippet without writing; `--write` preserves existing settings and creates `settings.json.bak.<timestamp>` before changing an existing file. Repeating the same command is a no-op. Custom commands are stored verbatim and must be nonempty single lines. Restart Claude Code and inspect `/hooks` to verify installation. See [shell and PATH examples](docs/examples.md).

The registry commands above are a release plan; this checkout does not claim the package is already published. Source commands and synthetic demos work now without registry access.

## What a block looks like

Run the [synthetic demo](examples/demo.mjs) from this checkout:

```sh
node examples/demo.mjs
```

It calls `agent-guardrails test` for each payload in memory. It never runs the inspected commands or writes the synthetic credential to a file. Actual output:

```text
git push
{
  "decision": "ask",
  "findings": [
    {
      "ruleId": "outbound",
      "code": "human-confirmation",
      "message": "Outbound action requires human confirmation for this invocation.",
      "preview": "[REDACTED]",
      "mode": "ask"
    }
  ],
  "output": {
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "ask",
      "permissionDecisionReason": "[outbound:human-confirmation] Outbound action requires human confirmation for this invocation."
    }
  }
}
git reset --hard
{
  "decision": "deny",
  "findings": [
    {
      "ruleId": "destructive",
      "code": "git-reset-hard",
      "message": "Hard reset discards work.",
      "preview": "[REDACTED]",
      "mode": "deny"
    }
  ],
  "output": {
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "[destructive:git-reset-hard] Hard reset discards work."
    }
  }
}
Write with a synthetic AWS key
{
  "decision": "deny",
  "findings": [
    {
      "ruleId": "secrets",
      "code": "aws-access-key",
      "message": "Potential aws-access-key detected.",
      "preview": "[REDACTED]",
      "mode": "deny"
    }
  ],
  "output": {
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "[secrets:aws-access-key] Potential aws-access-key detected."
    }
  }
}
```

The result includes both the policy findings and the Claude Code wire output. `test` exits 0 for all three valid evaluations; hook denial is expressed in JSON. For PowerShell stdin usage, see [the native object example](docs/examples.md#powershell-dry-run).

```text
RULE           DEFAULT  PURPOSE
secrets        deny     Credentials and sensitive reads
destructive    deny     Destructive commands
outbound       ask      Human confirmation on each outbound call
pii            off      Optional personal-data scanning
protect-paths  deny     Writes to protected paths
```

## Rules

| ID | Default | Checks |
| --- | --- | --- |
| `secrets` | deny | Writes, edits, shell commands and MCP inputs: AWS, GitHub, OpenAI, Anthropic, Google keys, private keys, JWT, high-entropy credential assignments; literal reads of credential paths |
| `destructive` | deny | Hard resets, forced clean/push, checkout-all, stash/ref/recovery deletion, primary-branch force deletion, Docker pruning, disk formatting/overwrites, shredding, external truncation, broad recursive deletion, recursive chmod 777, download-to-shell |
| `outbound` | ask | Matching send/publish/merge/spend tools, pushes, PR creation, releases, package publication and common network clients |
| `pii` | off | Optional email/phone heuristics, Luhn cards, mod-97 IBAN in external tool inputs; locale plugin API |
| `protect-paths` | deny | Writes under configured paths; defaults to `~/.ssh`, `~/.aws`, `~/.gnupg` |

Every rule supports `deny`, `ask`, `warn`, `off`. Decision precedence is **deny > ask > warn > pass**. Clean calls and warnings do not auto-approve the host's permission checks. Outbound confirmations are never cached. A permitted `git push --force-with-lease` still triggers the outbound rule.

## Why not just permissions.deny?

Claude Code permission patterns are useful for restricting tools and literal commands. These hooks add secret and optional PII scanning inside payload content, parsing of chained commands and literal wrappers, an `ask` decision for each outbound action, and an optional redacted audit log. Keep host permissions enabled alongside these checks; parser coverage and host enforcement still have limits.

## Examples

See [the runnable examples](docs/examples.md): [Claude settings](examples/settings.snippet.json), [strict team profile](examples/.agent-guardrails.json), [POSIX pre-commit hook](examples/pre-commit.sh), and [GitHub Actions scan](examples/github-actions-scan.yml).

## Configuration

Precedence: defaults → `~/.agent-guardrails.json` → project `.agent-guardrails.json`. Objects merge recursively; arrays replace. The nearest ancestor containing a config or `.git` marker defines the project root; if neither exists, hook `cwd` is used. Protect project configuration from untrusted edits.

```json
{
  "rules": {
    "secrets": {
      "mode": "deny",
      "entropyThreshold": 3.5,
      "allowReadPaths": [".env.example"]
    },
    "outbound": { "mode": "ask", "allMcp": true },
    "pii": { "mode": "deny" },
    "protect-paths": { "paths": ["~/.ssh", "../other-repo"] }
  },
  "audit": { "enabled": false }
}
```

By default, writes to `.agent-guardrails.json` and `~/.agent-guardrails.json` require approval (`askPaths`, `ask` while `protect-paths` is `deny`), so an agent cannot silently disable its own rules. Custom path arrays replace defaults: include every directory you want protected. Credential read allowlists are project-relative globs; allowlisting a read does not exempt secret scanning. See the [complete reference](docs/configuration.md) and [JSON Schema](schema/config.schema.json).

## CLI

```text
agent-guardrails init [--write] [--command <string>]
agent-guardrails hook
agent-guardrails test '<json>'
agent-guardrails scan <path>
agent-guardrails explain <rule-id>
```

`hook` reads up to 4 MiB of Claude Code `PreToolUse` JSON from stdin. Valid decisions use JSON on stdout and exit 0; input, config or audit errors exit 2 with a fixed, redacted blocking message on stderr. `test` returns a redacted policy result and wire output, always exits 0 for a valid evaluation, and writes no audit log. It does not exercise the host's permission UI.

`scan` exits **0 clean, 1 findings, 2 error**. It checks secrets regardless of the hook's mode, including ignored credential files. It skips symlinks and `.git`, `node_modules`, `coverage`, `.tmp-test` and legacy scratch directories. Findings include relative filenames, rule codes and a fully redacted preview, never matched values. It scans file content, not Git history or only the staged index. See the [pre-commit example](docs/examples.md#pre-commit).

## Threat model

This is defense in depth, **not a sandbox**. It catches common mistakes in visible tool inputs. A determined agent can obfuscate commands, run a script that performs hidden actions, change config/hooks, or use an uncovered tool. Literal path checks do not resolve symlinks, hardlinks or filesystem races. Shell parsing is heuristic; it does not implement Bash, cmd or PowerShell. PII detection is incomplete. File contents read by arbitrary programs are not inspected before upload. File mentions injected directly into model context may bypass tool hooks.

Keep host sandboxing, least privilege, credential isolation, network restrictions and human review enabled. Never auto-approve an entire session because a clean hook returned. See [coverage and limitations](docs/threat-model.md) before relying on a rule.

## Agent support

Claude Code `PreToolUse` is implemented in [`src/adapters/claude-code.mjs`](src/adapters/claude-code.mjs), using the [official contract](https://code.claude.com/docs/en/hooks#pretooluse-decision-control). It returns `deny`/`ask` in `hookSpecificOutput`; clean calls abstain. No deprecated top-level decision fields or automatic approvals.

**Codex CLI: planned.** Its documented hooks currently lack the `ask` behavior this package requires. No Codex adapter or notify-based enforcement is shipped. See [integration notes and sources](docs/adapters.md).

## Audit log

Opt in with `audit.enabled` and an existing local directory in `audit.path`. JSONL records contain timestamp, decision, rule ID, rule code, mode, and `[REDACTED]` previews. They omit commands, content, tool names, filenames, cwd, session IDs and value suffixes. POSIX file creation uses mode 0600; Windows access follows directory ACLs. An audit write failure blocks the hook. Retention and directory permissions are your responsibility.

## Development

```sh
npm run check
npm run scan
npm run bench
```

Install development tools as described in [CONTRIBUTING.md](CONTRIBUTING.md) before running the checks. Tests use built-in `node:test`, with in-memory CLI streams and local temporary fixtures under `.tmp-test/`. ESLint and TypeScript are development-only; `tsc --noEmit` checks JSDoc in shipped code. GitHub Actions runs lint, typecheck, tests, and a repository secret scan on Node 20/22/24 on Ubuntu/Windows. [CONTRIBUTING.md](CONTRIBUTING.md) covers changes and release checks.

Ubuntu CI enforces a 10 ms p95 budget for warmed core evaluation, excluding process startup. `npm run bench` reports warmed policy time separately from fresh process median/p95; disk, antivirus, Node startup and host scheduling affect total latency. In restricted environments, `npm run bench -- --core-only` avoids child processes and measures only policy evaluation. The task baseline reported about 120 ms fresh-process wall time; see [measurement limits](docs/threat-model.md#performance-evidence). No hardware-independent latency guarantee is claimed.

## FAQ

**Does it send any data anywhere?** No. Runtime code performs local I/O only and never executes inspected commands. Installing development packages uses your package manager's configured registry.

**Why did a fake key trigger it?** Detectors recognize formats, not credential validity. Use obvious placeholders such as `xxxx`, `<your-key>`, `example`, or a narrowly scoped `allowValues` entry. Do not put live values in config. Test tokens are assembled from clearly synthetic pieces.

**Why am I prompted for curl or a read-only MCP call?** Network clients may upload data, so curl/wget and PowerShell web clients ask by default. `allMcp: true` asks even for read-only calls. Narrow `commandPatterns` or `toolPatterns` only after reviewing the risk; arrays replace defaults.

**Can `ask` guarantee a human confirms?** The host owns the UI. Use an interactive permission mode, verify prompts in your installed agent, and never return auto-approval from another hook. There is no approval cache or custom confirmation service here.

**Can I protect another repo?** Add its absolute path or a project-relative path under `protect-paths.paths`. File tools and common literal shell mutators are covered. Use OS isolation for a hard boundary.

**Does scan replace a dedicated secret scanner?** No. It is a local pre-commit aid with format and entropy heuristics. Use a dedicated scanner for history, encoded data and organization-specific credentials.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), the [code of conduct](CODE_OF_CONDUCT.md), and [security reporting instructions](SECURITY.md). Release automation uses npm trusted publishing after the owner configures it.

## License

MIT · Copyright (c) 2026 Yusuf Berat Zengin
