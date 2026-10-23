# Contributing

Use Node.js 20 or newer. Keep runtime code dependency-free and ESM. Install development tools, then run:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run scan
npm run bench
```

`npm run check` runs ESLint, strict JSDoc type checking with `tsc --noEmit`, and the built-in Node test suite. `npm test` enables `--experimental-test-coverage` and prints line, branch and function coverage in the terminal and CI logs. The report excludes test files; it includes the CLI, imported source, demo example and demo generator. Tests use a single process with in-memory CLI streams, do not execute inspected commands, do not access the network, and create fixtures only under ignored `.tmp-test/`. Check supported Node 20/22/24 versions on Ubuntu/Windows through CI. Ubuntu CI also enforces the 10 ms warmed core p95 budget. The matrix is configuration, not evidence that a particular local change has already passed it.

After changing demo output, run `npm run demo` to regenerate `docs/demo.svg` and update the transcripts in both READMEs. The generator captures the first case of `node examples/demo.mjs` through the real CLI entry with in-memory streams. A temporary fixture under `.tmp-test/` selects the default policy and isolates personal/project configuration, so the image is reproducible across checkouts. Tests reject a stale image or transcript.

Keep guards pure; adapt tool input and wire output separately. Add table-driven true-positive and false-positive cases, including chained commands and both path conventions, for behavior changes. Regression tests should fail before the fix. For new key formats construct obviously synthetic tokens from fragments; never paste live or plausible user credentials, personal data, or captured production payloads. Do not put real secrets in allowlists or logs.

Document false positives, missing coverage, host API versions and bypasses candidly. Follow official agent documentation and keep protocol changes isolated in the adapter. Do not invent Codex authorization behavior. No dynamic code loading from config, network calls, telemetry or runtime dependencies.

Use small Conventional Commits in English. Run the secret scan before every commit; the optional `.githooks/pre-commit` aids this. Keep unrelated changes out of a patch. Update both READMEs and CHANGELOG when changing user behavior.

Before release, verify `npm run check`, `npm run scan`, `npm run bench` and `npm pack --dry-run --ignore-scripts`. Review the tarball file list, license, and executable entry. Measure fresh-process latency on supported platforms separately from the 10 ms core p95 budget. Verify host deny/ask behavior interactively without executing a destructive or external action.

## Releasing

The owner first configures the npm trusted publisher for `YusufBeratZengin/agent-guardrails`, workflow filename `release.yml`, environment `npm`, and this package. Create the GitHub `npm` environment with appropriate release protections. Trusted publishing requires a compatible npm CLI (npm 11.5.1 or newer); the workflow uses Node 24 with its bundled npm. No npm token is stored in the workflow. For the first release, establish package ownership and the trusted publisher on npm before triggering the workflow; any necessary initial publication is an explicit maintainer action.

Enable GitHub private vulnerability reporting before publication, as described in [SECURITY.md](SECURITY.md). Verify the Security tab offers **Report a vulnerability**.

For an authorized release:

1. Move the reviewed Unreleased notes into a dated Keep a Changelog version section and update `package.json` and the lockfile to the same SemVer version. Leave a new Unreleased section.
2. Run the checks above and inspect `npm pack --dry-run --ignore-scripts`. Review the exact files to publish.
3. The maintainer commits with `chore(release): vX.Y.Z`, creates the matching `vX.Y.Z` tag and pushes the tag when ready to publish.
4. [release.yml](.github/workflows/release.yml) checks the tag against the package version, runs `npm ci`, `npm run check` and `npm run scan`, then publishes with OIDC provenance and public access. `prepublishOnly` repeats check and scan before publication.

Do not trigger the workflow or run `npm publish` during an improvement or review pass. If trusted publishing is not configured, stop and configure it rather than adding a token fallback.
