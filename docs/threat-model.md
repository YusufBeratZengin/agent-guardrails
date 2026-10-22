# Threat model and coverage

The intended user runs a cooperative coding agent that may make mistakes. The package observes tool arguments before execution and helps a human review high-impact actions. It neither grants permissions nor executes the inspected command. Pure guard functions do not touch the filesystem; config, scan, audit and settings I/O live outside them.

## Covered inputs

| Surface | Coverage |
| --- | --- |
| `Write`, `Edit`, `MultiEdit`, `NotebookEdit` | String fields scanned for secrets; file/notebook path checked against protected roots |
| `Read`, `Grep`, `Glob` | Literal credential file paths/patterns; no recursive inspection of directory contents |
| `Bash`, `PowerShell` | Raw command secret scan, common literal credential arguments, destructive command parsing, outbound patterns and common write destinations |
| `mcp__*` | All string arguments and keys scanned for secrets; optional PII; outbound tool-name patterns or `allMcp` |
| Unknown/custom tools | Outbound tool-name patterns and optional PII when classified external; no assumed filesystem semantics |

The MCP prefix is a classification heuristic, not proof of server trust. Read-only MCP tools can send their arguments to a remote service. Use `allMcp: true` when this matters.

## Destructive rule codes

All entries use the configured `destructive` mode (default `deny`). Examples are inspected text, never executed by the package.

| Code | Detected operation | Allowed comparison / limit |
| --- | --- | --- |
| `git-reset-hard` | `git reset --hard` | Soft reset |
| `git-clean` | Forced clean without dry-run | `git clean -nd` |
| `git-force-push` | Force/mirror push | Force-with-lease is configurable; outbound still asks |
| `git-checkout-all` | `git checkout -- .` | Checkout of a literal individual file |
| `git-stash-delete` | Stash drop/clear | Stash list |
| `git-primary-branch-delete` | `git branch -D main`, `master`, `trunk`; delete + force equivalents | `git branch -d feature`, `git branch -D feature` |
| `git-recovery-delete` | `git reflog expire --expire=now` together with `git gc --prune=now` in one inspected command | Either alone or a non-now expiry; separate tool calls are not correlated |
| `git-update-ref-delete` | `git update-ref -d` / `--delete` | Updating a reference without deletion |
| `docker-system-prune` | `docker system prune -a` / `--all` | `docker image ls`, prune without all |
| `docker-volume-prune` | `docker volume prune -f` / `--force` | Volume list, prune without force |
| `disk-overwrite` | `dd ... of=/dev/<device>` | File output and null/zero/random/urandom/full/tty/standard-stream/fd pseudo-devices are excluded |
| `filesystem-format` | `mkfs*` executables | Help/version output, text passed to echo |
| `file-shred` | `shred` | Help/version output, text passed to echo |
| `external-truncate` | `truncate -s 0` (also size variants) on broad, external or unresolved paths | Literal file inside project; directory changes cause conservative detection |
| `disk-redirection` | `> /dev/sd*`, including append redirection | File output, `/dev/null`; other device families are not covered by this redirection rule |
| `broad-recursive-delete` | Recursive rm/PowerShell removal or find-delete of a broad/external path | `rm -rf node_modules` |
| `windows-recursive-delete` | `del /s`, `erase /s` | Nonrecursive deletion |
| `chmod-world-writable` | Recursive chmod 777 | Recursive chmod 755 |
| `download-execute` | Literal download-to-shell/eval pipelines | Download to a file (outbound asks) |

## Command parser limits

The lexer splits unquoted `&&`, `||`, `;`, `|`, newlines and grouping characters, handles single/double quoted tokens, preserves typical Windows path separators, and inspects literal subshells, backticks, `$()` substitutions and common `sh -c`, `bash -lc`, `cmd /c`, `powershell -Command` wrappers. Common wrappers (`sudo`, `env`, `timeout`, `nice`, `xargs`, `time`, `command`, `eval` and similar) are stripped together with their own options, as are leading environment assignments. Windows `rd`/`rmdir /s`, PowerShell `-r`/`-Rec` abbreviations, `find -delete`, `bash <(curl ...)` and `iwr ... | iex` are covered. MSYS (`/c/...`), Cygwin and extended-length (`\\?\`) spellings of Windows paths are normalized. Git global options are stripped before matching subcommands.

Deletion is conservative: the project root itself, home, filesystem roots, sibling/outside paths, wildcards and unresolved variables trigger destructive detection. A literal directory change anywhere in a compound command makes recursive deletion require review because relative target resolution is uncertain. `rm -rf node_modules` and an ordinary literal project subdirectory are allowed by this rule. Recursive `del /s` always triggers it.

A `cwd` beginning with `/` uses POSIX project-root resolution on every host, including Windows. Thus `/tmp/proj` stays `/tmp/proj`, and `rm -rf node_modules` resolves inside it consistently. This is lexical portability, not filesystem virtualization: config lookup still uses the host filesystem. Windows drive/UNC paths retain Windows normalization. Repeated findings are deduplicated per invocation by `(ruleId, code)`, retaining the first message and original rule order.

This is not a shell grammar, AST or interpreter. It does not model aliases, functions, every shell flag/abbreviation, `env` option combinations, PowerShell arrays/splatting, here-documents, encoded commands, interpreter code, configuration-supplied Git aliases, npm lifecycle scripts, shell-specific expansion, escaped/assembled executable names or arbitrary nesting. Substitution checks may flag single-quoted examples that would not execute. Quoted download-pipeline examples can also produce conservative false positives. Malformed or complex commands are not guaranteed to be rejected.

Protect-paths inspects file tools, common literal mutator arguments and `>` redirections. It includes parent removal/move checks. It does not infer writes inside Python/Node/scripts, arbitrary MCP tools, editor macros, custom binaries or computed paths. Symlinks, hardlinks, bind mounts, junctions, 8.3 aliases, case behavior on unusual filesystems and time-of-check/time-of-use races remain outside the boundary.

## What this cannot guarantee

- A determined or compromised agent cannot be contained by editable hooks and config.
- A secret already in model context, a transcript, command history or another tool result cannot be recalled. Tool hooks may not run for direct file mentions or agent-internal reads.
- Known-format and entropy heuristics miss new key formats, encoded/split secrets and secrets in unscanned data. Placeholders and allowlists trade false positives for coverage. A JWT-like string is detected without verifying its signature.
- File scanning uses 64 KiB chunks with 8 KiB overlap. Common credential formats fit within the overlap; unusually long assignments spanning chunks may be missed. Symlinks are skipped, not followed.
- Directory scans skip `.git`, `node_modules`, `coverage`, `.tmp-test` and the legacy scratch directory for backward compatibility. Explicit file arguments are scanned even within a skipped directory. Do not store production source or credentials in generated/scratch directories expecting this scan to cover them.
- Network patterns cannot cover all ways of sending or spending. A `git push` can contain secret file contents even when the command text does not. Uploading a file by name does not scan its body.
- Phone detection can mistake IDs for numbers. Generic IBAN checks shape and mod-97, not every country's account length. Card checks use Luhn and 13–19 digits, not issuer verification. Names, addresses and other sensitive categories need additional detectors.
- `ask` relies on an interactive host permission flow. Another hook or a host version can change behavior. Verify prompts in your deployed agent and fail closed at the host level when a hook cannot start or times out.
- The audit omits input data by design. It cannot prove which exact payload a human reviewed, and it is not tamper-evident.

Use OS permissions, agent sandboxing, separate service credentials, network controls and dedicated scanning in addition to these hooks. Keep code/config read-only to the agent when enforcement matters. Do not enable dangerous permission bypass modes solely because this package is installed.
