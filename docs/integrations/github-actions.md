# GitHub Action and SARIF

The root [`action.yml`](../../action.yml) is a composite action. It needs Git,
Node.js 20+ and Bash (available on GitHub's Ubuntu and Windows runners), with no
package install or runtime dependencies.

## PR workflow

Copy to `.github/workflows/guardrails.yml` in the consuming repository:

```yaml
name: Guardrails
on: [pull_request]
permissions:
  contents: read
jobs:
  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 0
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: YusufBeratZengin/agent-guardrails@main
```

`@main` becomes usable when the maintainer merges this change. Pin a reviewed
commit SHA in production. Checkout must contain both PR SHAs and their merge
base. The Action reads `pull_request.base.sha`/`head.sha` from the event file;
optional `base` and `head` inputs must both be full commit SHAs. `working-directory`
defaults to `.`. For push/manual workflows, supply both SHAs explicitly.

The scan uses the merge-base-to-head diff to select files, then scans **the full
head contents of changed regular files**, including unchanged lines in those
files and ignored paths tracked by Git. Renames are treated as delete/add.
Deleted paths, symlinks and submodules are skipped. Unchanged files, historical
versions and intermediate commits are not scanned. This is changed-file scanning,
not an added-lines-only or history scanner.

PR source, hooks, package scripts and PR policy files are never executed/loaded.
The scanner uses its built-in secret defaults so PR config cannot disable it.
Each Git response is limited to 64 MiB; an exceeded limit, unavailable commit or
Git failure fails the action. Findings fail with exit 1; errors with exit 2.
Use `pull_request`, not `pull_request_target` with untrusted code execution.

Outputs: `sarif-file` (a temporary report path) and `files-with-findings`.
The report is written on clean/finding scans, including when findings fail the
step. A scanner error produces no report. No upload occurs automatically.

## Optional code scanning upload

GitHub code scanning accepts [SARIF 2.1.0](https://docs.github.com/en/code-security/reference/code-scanning/sarif-files/sarif-support).
If code scanning is already available for your repository, add job permission
`security-events: write`, give the scan step `id: guardrails`, and append:

```yaml
      - name: Upload redacted SARIF
        if: ${{ always() && steps.guardrails.outputs.sarif-file != '' }}
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: ${{ steps.guardrails.outputs.sarif-file }}
          category: agent-guardrails
```

Keep the scanner's failure status; `always()` permits upload after findings.
Fork PR permissions can restrict uploads. The required check still fails locally
within the runner. Do not enable a paid feature just to run this scanner.
Reports contain filenames and redacted rule messages; review your data policy
before sending even redacted reports to GitHub.

For local file scans:

```sh
node bin/agent-guardrails.mjs scan . --format sarif > guardrails.sarif
```

This retains scan's 0/1/2 exit codes. JSON remains the default. SARIF findings
are deduplicated per file/code with file-level locations, not invented line
numbers or source snippets. Credential-shaped filenames omit locations. GitHub
may not show inline PR annotations without line locations.

The [self-test workflow](../../.github/workflows/action-self-test.yml) exercises
clean and synthetic-finding PR histories on Ubuntu and Windows, checks action
failure propagation and verifies the redacted SARIF report.
