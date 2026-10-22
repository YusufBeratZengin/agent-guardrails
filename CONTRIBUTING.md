# Contributing

Use Node.js 20 or newer. Keep runtime code dependency-free and ESM. Install development tools, then run:

```sh
npm install --ignore-scripts --no-audit --no-fund
npm run check
npm run scan
npm run bench
```

`npm run check` runs ESLint, strict JSDoc type checking with `tsc --noEmit`, and the built-in Node test suite. Tests use a single process with in-memory CLI streams, do not execute inspected commands, do not access the network, and create fixtures only under ignored `is/`. Check supported Node 20/22 versions on Ubuntu/Windows through CI. The matrix is configuration, not evidence that a particular local change has already passed it.

Keep guards pure; adapt tool input and wire output separately. Add table-driven true-positive and false-positive cases, including chained commands and both path conventions, for behavior changes. Regression tests should fail before the fix. For new key formats construct obviously synthetic tokens from fragments; never paste live or plausible user credentials, personal data, or captured production payloads. Do not put real secrets in allowlists or logs.

Document false positives, missing coverage, host API versions and bypasses candidly. Follow official agent documentation and keep protocol changes isolated in the adapter. Do not invent Codex authorization behavior. No dynamic code loading from config, network calls, telemetry or runtime dependencies.

Use small Conventional Commits in English. Run the secret scan before every commit; the optional `.githooks/pre-commit` aids this. Keep unrelated changes out of a patch. Update both READMEs and CHANGELOG when changing user behavior.

Before release, verify `npm run check`, `npm run scan`, `npm run bench` and `npm pack --dry-run --ignore-scripts`. Review the tarball file list, license, and executable entry. Measure fresh-process latency on supported platforms; the 50 ms target includes startup and local I/O. Verify host deny/ask behavior interactively without executing a destructive or external action. Publishing is a separate human-authorized action.
