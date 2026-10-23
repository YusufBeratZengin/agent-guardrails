# Changelog

All notable changes are documented here following [Keep a Changelog 1.1](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Native Codex CLI, Gemini CLI and Cursor hook adapters with explicit denial for policy `ask`, plus copyable integration guides and agent-independent pre-commit/CI fallbacks.
- Dependency-free composite GitHub Action for immutable PR changed-file scanning, redacted SARIF outputs and Ubuntu/Windows self-tests.
- `scan --format sarif` for SARIF 2.1.0 reports, retaining default JSON output and scan exit codes.
- Hook latency benchmark over 1,000 synthetic calls, reporting median/p95 for core evaluation and the full same-process hook path, with optional fresh-process timing.
- Reproducible terminal SVG demo (`npm run demo`) embedded in both READMEs, with a regression check against real CLI output.
- npm version badges, three-point rationale and verified source-first quick start in English and Turkish.
- Dependency-free Node test coverage reporting in local runs and CI, plus a weekly JavaScript/TypeScript CodeQL workflow.
- Public npm package metadata, repository/support links, discovery keywords, provenance configuration and check/scan gates before publication.
- Tag-triggered npm trusted publishing in `release.yml`, a tag/version check and owner setup instructions in CONTRIBUTING.
- `init --command <string>` for verbatim, nonempty single-line local or absolute-path hook commands, with print/write/idempotence tests.
- Real CLI demo output for outbound confirmation, hard-reset denial and a synthetic AWS-key write; five-rule terminal summary and CI/MIT/Node badges in both READMEs.
- Destructive detection and table-driven true/false-positive tests for primary-branch force deletion, combined reflog expiry/GC, reference deletion, Docker pruning, device overwrites, filesystem formatting, shredding, external truncation and disk redirection.
- Bug, feature and false-positive/bypass issue forms, PR checklist, Contributor Covenant 2.1, weekly npm development dependency and GitHub Actions updates, and private vulnerability reporting setup guidance.
- Copyable Claude settings, strict team configuration, POSIX pre-commit hook and GitHub Actions scan examples, with schema validation tests.
- Ubuntu CI core benchmark gate at 10 ms p95 and documented local timing evidence with hardware and measurement limits.
- Regression checks keeping the English/Turkish README demo blocks equal to real CLI output and their section structure aligned.

### Changed

- Include the Action runner and benchmark in strict JSDoc type checking; link integration coverage and refreshed benchmark evidence from both READMEs.
- Lead quick start with currently working source commands; retain the post-release project-local npm/npx path and explain PATH requirements.
- Use `.tmp-test/` for test fixtures and scan exclusions, retaining the legacy scratch-directory exclusion for compatibility.
- Clarify the additional content scanning, chained-command checks, outbound confirmation and audit logging provided alongside host permissions.

### Fixed

- Writes to project and user `.agent-guardrails.json` ask for approval by default (`protect-paths.askPaths`).
- Deduplicate invocation findings by `(ruleId, code)` while preserving first-seen message order.
- Resolve POSIX-style absolute cwd/project roots consistently across hosts, keeping project-local recursive deletion allowed on Windows and Linux.
- Exclude informational reflog/GC calls from combined recovery deletion detection and inspect disk redirection even for help/version output.
- Explain child-process benchmark failures without hiding the subprocess error code.

## [0.1.0] - 2026-10-23

### Added

- Add dependency-free Node.js ESM guards for secrets, destructive commands, outbound actions, optional PII, and protected paths.
- Add an isolated Claude Code PreToolUse adapter with redacted deny/ask output and fail-closed processing errors.
- Add project/user configuration merging, JSON Schema, per-rule modes and optional JSONL auditing.
- Add init with settings backups, hook stdin handling, dry runs, secret scans and rule explanations.
- Add built-in tests, ESLint/JSDoc checks, Node 20/22 Ubuntu/Windows CI, and English/Turkish documentation.
- Document parser and path limits; reserve Codex CLI integration as planned until confirmation behavior is supported and verified.
