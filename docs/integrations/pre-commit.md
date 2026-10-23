# Any agent via git pre-commit

Status: agent-independent saved-content scanning. Works with Claude Code, Codex,
Gemini, Cursor and tools with no compatible pre-execution hook.

Requires Git and Node.js 20+. Git for Windows supplies the shell for Git hooks.
The scanner runs locally, makes no network calls and never executes inspected
commands.

## Ready-to-copy hook

Check `git config --get core.hooksPath` and your existing hooks first. Merge the
scanner into an existing pre-commit hook if one is installed. Otherwise save
the following as `.githooks/pre-commit`:

```sh
#!/bin/sh
set -eu
cd "$(git rev-parse --show-toplevel)"
exec node "/absolute/path/to/agent-guardrails/bin/agent-guardrails.mjs" scan .
```

Replace the absolute path with your checkout. Enable it from the repository root
(POSIX shell or Git Bash):

```sh
chmod +x .githooks/pre-commit
git config core.hooksPath .githooks
```

For this project itself, use `exec node bin/agent-guardrails.mjs scan .`.
After an npm release, a project-local dependency may use
`exec npx --no-install agent-guardrails scan .`.

Git runs pre-commit before creating a commit; a nonzero hook exit aborts it.
Hooks can be bypassed by a user and are not distributed automatically with a
clone. [Official Git hook documentation](https://git-scm.com/docs/githooks).
Require the [CI scan](github-actions.md) as a branch protection check too.

## Scope and verification

`scan .` scans the **working tree**, including ignored credential files. It
does not scan the staged index or history, so partial staging can differ from
what is checked. It skips symlinks and the generated/scratch directories listed
in the [CLI reference](../../README.md#cli). It detects secrets, not destructive
commands or outbound operations.

Run `node /absolute/path/to/agent-guardrails/bin/agent-guardrails.mjs scan .`
directly before installing. Exit codes are 0 clean, 1 findings, 2 error. Test
the hook itself with `sh .githooks/pre-commit`; no commit is necessary. Existing
findings block even when the hook policy's `secrets.mode` is off.
