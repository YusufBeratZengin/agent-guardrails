import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  fixtures,
  rulePriorityFixtures,
  defaultBehaviorFixtures,
  argumentMatchingFixtures,
  evaluateFixture,
  exportDecisionsJsonl,
  fixtureContext,
} from '../src/fixtures.mjs';
import { runExport } from '../scripts/export-fixtures.mjs';
import { main } from '../bin/agent-guardrails.mjs';
import { fixture } from './helpers.mjs';

test('all fixtures evaluate to their expected decisions and codes', () => {
  for (const item of fixtures) {
    const record = evaluateFixture(item);
    assert.equal(record.matched, true, `Fixture ${item.id} decision mismatch: expected ${item.expectedDecision}, got ${record.decision}`);
    assert.equal(record.decision, item.expectedDecision, `Fixture ${item.id} decision mismatch`);
    if (item.expectedFindingCodes) {
      assert.deepEqual(record.findings.map(f => f.code), item.expectedFindingCodes, `Fixture ${item.id} code mismatch`);
    }
  }
});

test('rule priority suite documents and verifies precedence and check order', () => {
  // Precedence: deny > ask > warn > pass
  const denyOverAsk = evaluateFixture(rulePriorityFixtures.find(f => f.id === 'priority-deny-over-ask-destructive-outbound'));
  assert.equal(denyOverAsk.decision, 'deny');
  assert.ok(denyOverAsk.findings.some(f => f.mode === 'deny'));
  assert.ok(denyOverAsk.findings.some(f => f.mode === 'ask'));

  const denyOverWarn = evaluateFixture(rulePriorityFixtures.find(f => f.id === 'priority-deny-over-warn'));
  assert.equal(denyOverWarn.decision, 'deny');

  const askOverWarn = evaluateFixture(rulePriorityFixtures.find(f => f.id === 'priority-ask-over-warn'));
  assert.equal(askOverWarn.decision, 'ask');

  const warnOverPass = evaluateFixture(rulePriorityFixtures.find(f => f.id === 'priority-warn-over-pass'));
  assert.equal(warnOverPass.decision, 'warn');

  const cleanPass = evaluateFixture(rulePriorityFixtures.find(f => f.id === 'priority-clean-pass'));
  assert.equal(cleanPass.decision, 'pass');
  assert.equal(cleanPass.findings.length, 0);

  // Evaluation check order: secrets -> destructive -> outbound -> pii -> protect-paths
  const seq = evaluateFixture(rulePriorityFixtures.find(f => f.id === 'priority-execution-order-check-sequence'));
  assert.deepEqual(seq.findings.map(f => f.ruleId), ['secrets', 'destructive', 'outbound']);

  // Mode 'off' bypass
  const modeOff = evaluateFixture(rulePriorityFixtures.find(f => f.id === 'priority-mode-off-bypass'));
  assert.equal(modeOff.decision, 'pass');

  // protect-paths config-write retains ask mode
  const configAsk = evaluateFixture(rulePriorityFixtures.find(f => f.id === 'priority-protect-paths-config-write-ask'));
  assert.equal(configAsk.decision, 'ask');
  assert.equal(configAsk.findings[0].code, 'config-write');

  // Deduplication
  const dedup = evaluateFixture(rulePriorityFixtures.find(f => f.id === 'priority-finding-deduplication'));
  assert.equal(dedup.findings.length, 2);
});

test('default behavior suite documents and verifies default rules configuration', () => {
  // Safe commands pass
  assert.equal(evaluateFixture(defaultBehaviorFixtures.find(f => f.id === 'default-clean-bash-pass')).decision, 'pass');
  assert.equal(evaluateFixture(defaultBehaviorFixtures.find(f => f.id === 'default-clean-build-pass')).decision, 'pass');
  assert.equal(evaluateFixture(defaultBehaviorFixtures.find(f => f.id === 'default-clean-write-pass')).decision, 'pass');

  // Destructive denies
  for (const id of [
    'default-destructive-reset-deny',
    'default-destructive-clean-deny',
    'default-destructive-rm-root-deny',
    'default-destructive-rm-dot-deny',
    'default-destructive-chmod-deny',
    'default-destructive-download-shell-deny',
  ]) {
    const res = evaluateFixture(defaultBehaviorFixtures.find(f => f.id === id));
    assert.equal(res.decision, 'deny', `Fixture ${id} must deny`);
  }

  // Outbound asks
  for (const id of [
    'default-outbound-push-ask',
    'default-outbound-curl-ask',
    'default-outbound-tool-ask',
  ]) {
    const res = evaluateFixture(defaultBehaviorFixtures.find(f => f.id === id));
    assert.equal(res.decision, 'ask', `Fixture ${id} must ask`);
  }

  // Unmatched MCP tool passes by default (allMcp: false)
  assert.equal(evaluateFixture(defaultBehaviorFixtures.find(f => f.id === 'default-outbound-unmatched-mcp-pass')).decision, 'pass');

  // Secrets: credential reads and real secret writes deny, placeholders pass
  assert.equal(evaluateFixture(defaultBehaviorFixtures.find(f => f.id === 'default-secrets-read-env-deny')).decision, 'deny');
  assert.equal(evaluateFixture(defaultBehaviorFixtures.find(f => f.id === 'default-secrets-read-ssh-deny')).decision, 'deny');
  assert.equal(evaluateFixture(defaultBehaviorFixtures.find(f => f.id === 'default-secrets-write-key-deny')).decision, 'deny');
  assert.equal(evaluateFixture(defaultBehaviorFixtures.find(f => f.id === 'default-secrets-high-entropy-deny')).decision, 'deny');
  assert.equal(evaluateFixture(defaultBehaviorFixtures.find(f => f.id === 'default-secrets-placeholder-pass')).decision, 'pass');

  // PII is off by default
  const piiDefault = evaluateFixture(defaultBehaviorFixtures.find(f => f.id === 'default-pii-off-pass'));
  assert.equal(piiDefault.findings.some(f => f.ruleId === 'pii'), false);

  // Force with lease asks under outbound, allowed by destructive
  const fwl = evaluateFixture(defaultBehaviorFixtures.find(f => f.id === 'default-destructive-force-with-lease-ask'));
  assert.equal(fwl.decision, 'ask');
  assert.equal(fwl.findings.some(f => f.ruleId === 'destructive'), false);
});

test('argument matching suite documents and verifies argument parsing and normalization', () => {
  // Shell wrappers
  assert.equal(evaluateFixture(argumentMatchingFixtures.find(f => f.id === 'arg-match-shell-sudo-unwrap')).decision, 'deny');
  assert.equal(evaluateFixture(argumentMatchingFixtures.find(f => f.id === 'arg-match-shell-env-unwrap')).decision, 'deny');
  assert.equal(evaluateFixture(argumentMatchingFixtures.find(f => f.id === 'arg-match-shell-timeout-unwrap')).decision, 'deny');

  // Chained commands and subshells
  assert.equal(evaluateFixture(argumentMatchingFixtures.find(f => f.id === 'arg-match-shell-semicolon-chain')).decision, 'deny');
  assert.equal(evaluateFixture(argumentMatchingFixtures.find(f => f.id === 'arg-match-shell-and-chain')).decision, 'deny');
  assert.equal(evaluateFixture(argumentMatchingFixtures.find(f => f.id === 'arg-match-shell-dollar-subshell')).decision, 'deny');
  assert.equal(evaluateFixture(argumentMatchingFixtures.find(f => f.id === 'arg-match-shell-backtick-subshell')).decision, 'deny');

  // Inline shells and Git global options
  assert.equal(evaluateFixture(argumentMatchingFixtures.find(f => f.id === 'arg-match-shell-bash-c')).decision, 'deny');
  assert.equal(evaluateFixture(argumentMatchingFixtures.find(f => f.id === 'arg-match-shell-powershell-command')).decision, 'deny');
  assert.equal(evaluateFixture(argumentMatchingFixtures.find(f => f.id === 'arg-match-shell-git-global-options')).decision, 'deny');

  // PowerShell parameter prefixes
  assert.equal(evaluateFixture(argumentMatchingFixtures.find(f => f.id === 'arg-match-powershell-recurse-prefix')).decision, 'deny');
  assert.equal(evaluateFixture(argumentMatchingFixtures.find(f => f.id === 'arg-match-powershell-recurse-boolean')).decision, 'deny');

  // Path argument extraction and normalization
  assert.equal(evaluateFixture(argumentMatchingFixtures.find(f => f.id === 'arg-match-write-paths-multiedit')).decision, 'deny');
  assert.equal(evaluateFixture(argumentMatchingFixtures.find(f => f.id === 'arg-match-write-paths-notebook-edit')).decision, 'deny');
  assert.equal(evaluateFixture(argumentMatchingFixtures.find(f => f.id === 'arg-match-read-paths-grep')).decision, 'deny');
  assert.equal(evaluateFixture(argumentMatchingFixtures.find(f => f.id === 'arg-match-shell-cat-sensitive-path')).decision, 'deny');
  assert.equal(evaluateFixture(argumentMatchingFixtures.find(f => f.id === 'arg-match-path-dotdot-traversal')).decision, 'deny');

  // Glob matching
  assert.equal(evaluateFixture(argumentMatchingFixtures.find(f => f.id === 'arg-match-glob-case-insensitive')).decision, 'ask');
  assert.equal(evaluateFixture(argumentMatchingFixtures.find(f => f.id === 'arg-match-glob-literal-star')).decision, 'ask');
  assert.equal(evaluateFixture(argumentMatchingFixtures.find(f => f.id === 'arg-match-shell-redirection-disk')).decision, 'deny');
});

test('fixtureContext helper populates defaults and preserves custom overrides', () => {
  const def = fixtureContext({ id: 't1', category: 'default-behavior', description: '', toolName: 'Bash', input: {}, expectedDecision: 'pass' });
  assert.equal(def.cwd, '/project');
  assert.equal(def.home, '/home/example');
  assert.equal(def.projectRoot, '/project');

  const win = fixtureContext({ id: 't2', category: 'default-behavior', description: '', toolName: 'Bash', input: {}, cwd: 'C:/app', expectedDecision: 'pass' });
  assert.equal(win.cwd, 'C:/app');
  assert.equal(win.home, 'C:/Users/example');
  assert.equal(win.projectRoot, 'C:/app');
});

test('exportDecisionsJsonl produces valid newline-delimited JSON and supports options', t => {
  const dir = fixture(t);
  const jsonl = exportDecisionsJsonl();
  const lines = jsonl.trim().split('\n');
  assert.equal(lines.length, fixtures.length);

  for (const line of lines) {
    const parsed = JSON.parse(line);
    assert.ok(parsed.id);
    assert.ok(parsed.category);
    assert.ok(['deny', 'ask', 'warn', 'pass'].includes(parsed.decision));
    assert.equal(parsed.matched, true);
    assert.ok(Array.isArray(parsed.findings));
  }

  // Category filtering
  const priorityJsonl = exportDecisionsJsonl(fixtures, { category: 'rule-priority' });
  const priorityLines = priorityJsonl.trim().split('\n');
  assert.equal(priorityLines.length, rulePriorityFixtures.length);
  for (const line of priorityLines) {
    assert.equal(JSON.parse(line).category, 'rule-priority');
  }

  // Audit format
  const auditJsonl = exportDecisionsJsonl(fixtures, { auditFormat: true });
  const firstAudit = JSON.parse(auditJsonl.trim().split('\n')[0]);
  assert.deepEqual(Object.keys(firstAudit).sort(), ['decision', 'findings', 'timestamp'].sort());

  // Output to file
  const targetFile = path.join(dir, 'decisions.jsonl');
  const writtenJsonl = exportDecisionsJsonl(fixtures, { outputPath: targetFile });
  assert.equal(fs.existsSync(targetFile), true);
  assert.equal(fs.readFileSync(targetFile, 'utf8'), writtenJsonl);
});

test('export-fixtures script CLI exports decisions to stdout or file', t => {
  const dir = fixture(t);
  let stdout = '';
  const status = runExport([], { stdout: { write: text => { stdout += text; } } });
  assert.equal(status, 0);
  assert.equal(stdout.trim().split('\n').length, fixtures.length);

  // Script with category and audit format
  let auditOut = '';
  assert.equal(runExport(['--category', 'argument-matching', '--audit-format'], { stdout: { write: text => { auditOut += text; } } }), 0);
  const auditLines = auditOut.trim().split('\n');
  assert.equal(auditLines.length, argumentMatchingFixtures.length);

  // Script with file output
  const scriptFile = path.join(dir, 'script-out.jsonl');
  assert.equal(runExport(['--output', scriptFile]), 0);
  assert.equal(fs.existsSync(scriptFile), true);
  assert.equal(fs.readFileSync(scriptFile, 'utf8').trim().split('\n').length, fixtures.length);
});

test('CLI agent-guardrails fixtures command exports JSONL', async t => {
  const dir = fixture(t);
  let stdout = '';
  let stderr = '';
  const status = await main(['fixtures'], {
    stdin: [],
    stdout: { write: text => { stdout += text; } },
    stderr: { write: text => { stderr += text; } },
    cwd: () => dir,
  });
  assert.equal(status, 0, stderr);
  const rows = stdout.trim().split('\n').map(l => JSON.parse(l));
  assert.equal(rows.length, fixtures.length);

  // CLI with --output option
  const outPath = path.join(dir, 'cli-fixtures.jsonl');
  const fileStatus = await main(['fixtures', '--format', 'jsonl', '--output', outPath], {
    stdin: [],
    stdout: { write: () => {} },
    stderr: { write: () => {} },
    cwd: () => dir,
  });
  assert.equal(fileStatus, 0);
  assert.equal(fs.existsSync(outPath), true);

  // CLI rejects invalid option
  let errText = '';
  const badStatus = await main(['fixtures', '--bad-opt'], {
    stdin: [],
    stdout: { write: () => {} },
    stderr: { write: text => { errText += text; } },
    cwd: () => dir,
  });
  assert.equal(badStatus, 2);
  assert.ok(errText.includes('invalid input'));
});
