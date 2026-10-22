# Changelog

## Unreleased

- Fix: writes to the project and user `.agent-guardrails.json` now ask for approval by default (`protect-paths.askPaths`), so an agent cannot silently disable its own rules.

## 0.1.0 — 2026-10-22

- Add dependency-free Node.js ESM guards for secrets, destructive commands, outbound actions, optional PII, and protected paths.
- Add an isolated Claude Code PreToolUse adapter with redacted deny/ask output and fail-closed processing errors.
- Add project/user configuration merging, JSON Schema, per-rule modes and optional JSONL auditing.
- Add init with settings backups, hook stdin handling, dry runs, secret scans and rule explanations.
- Add built-in tests, ESLint/JSDoc checks, Node 20/22 Ubuntu/Windows CI, and English/Turkish documentation.
- Document parser and path limits; reserve Codex CLI integration as planned until confirmation behavior is supported and verified.
