# Configuration reference

Both config files are optional strict JSON objects, at most 1 MiB each. Unknown properties, wrong types, mismatched rule IDs, invalid modes and invalid entropy bounds fail closed in the hook. `$schema` is allowed only at the root. There is no executable config, environment interpolation, dynamic import, network lookup or regex execution from config.

Defaults live in [`src/defaults.mjs`](../src/defaults.mjs); editor schema: [`schema/config.schema.json`](../schema/config.schema.json). All properties are optional in each layer. A rule's `id`, if provided, must equal its key.

| Property | Default | Meaning |
| --- | --- | --- |
| `rules.<id>.mode` | varies | `deny`, `ask`, `warn`, `off` |
| `rules.secrets.entropyThreshold` | 3.5 | Shannon bits per character; finite 0–8 |
| `rules.secrets.minLength` | 20 | Minimum generic assignment value length, integer 8–4096 |
| `rules.secrets.allowValues` | `[]` | Exact, case-sensitive content exceptions; use synthetic values only |
| `rules.secrets.allowReadPaths` | `[]` | Normalized absolute or project-relative credential read globs |
| `rules.destructive.allowForceWithLease` | true | Exempt `--force-with-lease` from destructive detection; outbound still asks |
| `rules.outbound.allMcp` | false | Ask for every `mcp__` tool |
| `rules.outbound.toolPatterns` | see below | Tool-name globs |
| `rules.outbound.commandPatterns` | see below | Globs applied to normalized command invocations |
| `rules.pii.detectors` | `["generic"]` | IDs of trusted programmatic detectors |
| `rules.protect-paths.paths` | SSH/AWS/GnuPG dirs | Directory roots, not globs; includes descendants |
| `audit.enabled` | false | Append a decision per live hook invocation |
| `audit.path` | `.agent-guardrails.audit.jsonl` | Absolute path or path relative to project root; parent must exist |

String arrays have at most 256 entries, each at most 1024 characters. Audit path is 1–4096 characters. Globs match the whole normalized string, ignore case, and support only `*` and `?`. `*` can cross `/`. Brackets and other regex punctuation are literal. Avoid unnecessarily broad allowlists.

Default tool patterns: `*send*`, `*publish*`, `*create_post*`, `*merge*`, `*deploy*`, `*purchase*`, `*payment*`, `*charge*`, `*spend*`.

Default command patterns: `git push*`, `gh pr create*`, `gh pr merge*`, `gh release create*`, `npm publish*`, `npm unpublish*`, `pnpm publish*`, `yarn npm publish*`, `twine upload*`, `docker push*`, `cargo publish*`, `vercel*`, `netlify deploy*`, `curl*`, `wget*`, `Invoke-WebRequest*`, `Invoke-RestMethod*`.

Array replacement is intentional: `toolPatterns: []` removes all default tool patterns, while `commandPatterns` remains unchanged. `paths` is also replaced. Protect config against hostile project overrides; a user config is not a centrally enforced policy.

Credential formats run independently of the entropy threshold. Generic entropy applies only to assignments whose names end in `key`, `token`, `secret`, `password` or `passwd`. Obvious placeholders (`x` runs, zero runs, angle-bracket placeholders, environment references, example/dummy/your-key forms) are ignored. Encoding and splitting values defeat this check. Allowlisting a file read does not allow writes containing a detected secret.

Path rules normalize `..`, separators, `~`, and leading home references (`$HOME`, `${HOME}`, `%USERPROFILE%`, `$env:USERPROFILE`). Windows paths compare case-insensitively and support drives/UNC. POSIX paths compare case-sensitively. No other shell variables are expanded. Destructive deletion with unresolved variables/wildcards is considered broad; configurable protected paths use lexical literal comparisons.

PII runs for all MCP tools, tool names matching outbound patterns, and shell commands matching outbound command patterns, even if outbound mode is off. Arbitrary custom outbound transports require corresponding patterns. `generic` is bundled; unknown enabled detector IDs fail the hook. Custom locale detectors require the programmatic API described in [examples](examples.md#locale-detector-plugin).

Logging has no rotation. Use a private local directory and your own retention policy. Final path symlinks are refused; parent directory symlinks and filesystem races are not a supported security boundary. Audit I/O failure exits 2. Dry runs never write logs.
