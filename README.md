# agent-guardrails

Local safety hooks for AI coding agents. Catch common secret leaks and destructive commands, and request human confirmation before outbound actions. Node.js 20+, ESM, zero runtime dependencies, no network requests or telemetry.

[Türkçe](README.tr.md) · [Configuration](docs/configuration.md) · [Threat model](docs/threat-model.md) · [Examples](docs/examples.md)

## 60-second quick start

From this checkout, install the CLI locally on your machine:

```sh
npm install --global . --omit=dev --ignore-scripts
cd /path/to/your-project
agent-guardrails init
agent-guardrails init --write
```

The first `init` prints the Claude Code settings snippet. `--write` merges it into `.claude/settings.json`, preserves existing settings, and backs up an existing file as `settings.json.bak.<timestamp>`. Repeated installation is a no-op. Nothing is written without `--write`. Restart Claude Code and inspect `/hooks` to verify installation. Ensure `agent-guardrails` is on the hook process's PATH; see the [absolute-path example](docs/examples.md).

Version 0.1.0 is prepared for npm publication; this checkout does not assume the name is published or available on the registry. Once a reviewed release is published, the intended package name is `agent-guardrails`.

On POSIX, try a harmless dry-run:

```sh
agent-guardrails test '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git push"},"cwd":"/absolute/path/to/your-project"}'
```

This inspects text; it never runs `git push`. The result should be `ask`. For PowerShell, use the [native object example](docs/examples.md#powershell-dry-run).

## Rules

| ID | Default | Checks |
| --- | --- | --- |
| `secrets` | deny | Writes, edits, shell commands and MCP inputs: AWS, GitHub, OpenAI, Anthropic, Google keys, private keys, JWT, high-entropy credential assignments; literal reads of credential paths |
| `destructive` | deny | Hard resets, forced clean/push, checkout-all, stash deletion, broad recursive deletion, recursive chmod 777, download-to-shell |
| `outbound` | ask | Matching send/publish/merge/spend tools, pushes, PR creation, releases, package publication and common network clients |
| `pii` | off | Optional email/phone heuristics, Luhn cards, mod-97 IBAN in external tool inputs; locale plugin API |
| `protect-paths` | deny | Writes under configured paths; defaults to `~/.ssh`, `~/.aws`, `~/.gnupg` |

Every rule supports `deny`, `ask`, `warn`, `off`. Decision precedence is **deny > ask > warn > pass**. Clean calls and warnings do not auto-approve the host's permission checks. Outbound confirmations are never cached. A permitted `git push --force-with-lease` still triggers the outbound rule.

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

Custom path arrays replace defaults: include every directory you want protected. Credential read allowlists are project-relative globs; allowlisting a read does not exempt secret scanning. See the [complete reference](docs/configuration.md) and [JSON Schema](schema/config.schema.json).

## CLI

```text
agent-guardrails init [--write]
agent-guardrails hook
agent-guardrails test '<json>'
agent-guardrails scan <path>
agent-guardrails explain <rule-id>
```

`hook` reads up to 4 MiB of Claude Code `PreToolUse` JSON from stdin. Valid decisions use JSON on stdout and exit 0; input, config or audit errors exit 2 with a fixed, redacted blocking message on stderr. `test` returns a redacted policy result and wire output, always exits 0 for a valid evaluation, and writes no audit log. It does not exercise the host's permission UI.

`scan` exits **0 clean, 1 findings, 2 error**. It checks secrets regardless of the hook's mode, including ignored credential files. It skips symlinks and `.git`, `node_modules`, `coverage`, `is` directories. Findings include relative filenames, rule codes and a fully redacted preview, never matched values. It scans file content, not Git history or only the staged index. See the [pre-commit example](docs/examples.md#pre-commit).

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
npm install --ignore-scripts --no-audit --no-fund
npm run check
npm run scan
npm run bench
```

Tests use built-in `node:test`, with in-memory CLI streams and local temporary fixtures under `is/`. ESLint and TypeScript are development-only; `tsc --noEmit` checks JSDoc in shipped code. GitHub Actions runs lint, typecheck, tests, and a repository secret scan on Node 20/22 on Ubuntu/Windows. [CONTRIBUTING.md](CONTRIBUTING.md) covers changes and release checks.

Hook evaluation targets under 50 ms for typical inputs. `npm run bench` reports warmed policy time separately from fresh process median/p95; disk, antivirus, Node startup and host scheduling affect total latency. In restricted environments, `npm run bench -- --core-only` avoids child processes and measures only policy evaluation. No hardware-independent latency guarantee is claimed.

## FAQ

**Does it send any data anywhere?** No. Runtime code performs local I/O only and never executes inspected commands. Installing development packages uses your package manager's configured registry.

**Why did a fake key trigger it?** Detectors recognize formats, not credential validity. Use obvious placeholders such as `xxxx`, `<your-key>`, `example`, or a narrowly scoped `allowValues` entry. Do not put live values in config. Test tokens are assembled from clearly synthetic pieces.

**Why am I prompted for curl or a read-only MCP call?** Network clients may upload data, so curl/wget and PowerShell web clients ask by default. `allMcp: true` asks even for read-only calls. Narrow `commandPatterns` or `toolPatterns` only after reviewing the risk; arrays replace defaults.

**Can `ask` guarantee a human confirms?** The host owns the UI. Use an interactive permission mode, verify prompts in your installed agent, and never return auto-approval from another hook. There is no approval cache or custom confirmation service here.

**Can I protect another repo?** Add its absolute path or a project-relative path under `protect-paths.paths`. File tools and common literal shell mutators are covered. Use OS isolation for a hard boundary.

**Does scan replace a dedicated secret scanner?** No. It is a local pre-commit aid with format and entropy heuristics. Use a dedicated scanner for history, encoded data and organization-specific credentials.

MIT · Copyright (c) 2026 Yusuf Berat Zengin
