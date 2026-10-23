import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scanGitChanges } from '../src/git-scan.mjs';
import { revisions, run } from '../scripts/action-scan.mjs';
import { scanSecrets } from '../src/guards/secrets.mjs';
import { defaults } from '../src/defaults.mjs';
import { fixture, fakeTokens } from './helpers.mjs';

const base = 'a'.repeat(40); const head = 'b'.repeat(40); const ancestor = 'c'.repeat(40);
const blob = 'd'.repeat(40); const old = 'e'.repeat(40);
const record = (file, mode = '100644', status = 'M') => `:100644 ${mode} ${old} ${blob} ${status}\0${file}\0`;

test('PR diff scans immutable changed regular blobs including renamed/ignored/unusual paths', t => {
  const cwd = fixture(t);
  const token = fakeTokens[0][1];
  const calls = [];
  const readGit = (dir, args) => {
    assert.equal(dir, cwd); calls.push(args);
    if (args[0] === 'merge-base') { return ancestor + '\n'; }
    if (args[0] === 'diff') { return record('.env') + record('name with\nnewline.txt') + record('renamed.txt', '100755', 'A') + record('deleted', '000000', 'D') + record('link', '120000') + record('module', '160000'); }
    assert.deepEqual(args, ['cat-file', 'blob', blob]);
    return token;
  };
  const result = scanGitChanges({ cwd, base, head }, readGit);
  assert.deepEqual(result.map(r => path.relative(cwd, r.file)), ['.env', 'name with\nnewline.txt', 'renamed.txt']);
  assert.equal(calls.filter(c => c[0] === 'cat-file').length, 3);
  assert.ok(calls[1].includes('--no-ext-diff')); assert.ok(calls[1].includes('--no-textconv')); assert.ok(calls[1].includes('--no-renames'));
  assert.ok(!JSON.stringify(result).includes(token));
});

test('PR scanner clean diff, unchanged/deleted files, invalid refs and Git failures', t => {
  const cwd = fixture(t);
  const clean = (dir, args) => args[0] === 'merge-base' ? ancestor : args[0] === 'diff' ? record('clean.txt') : 'hello world';
  assert.deepEqual(scanGitChanges({ cwd, base, head }, clean), []);
  assert.deepEqual(scanGitChanges({ cwd, base, head }, (dir, args) => args[0] === 'merge-base' ? ancestor : ''), []);
  for (const ref of ['main', '--help', base + '\n', 'a'.repeat(41)]) {
    let called = false;
    assert.throws(() => scanGitChanges({ cwd, base: ref, head }, () => { called = true; return ancestor; }));
    assert.equal(called, false, 'Invalid refs must not call Git');
  }
  assert.throws(() => scanGitChanges({ cwd, base, head }, () => { throw new Error('Unavailable Git'); }));
  assert.throws(() => scanGitChanges({ cwd, base, head }, () => 'invalid'));
  for (const raw of ['malformed\0path\0', 'unterminated', record('truncated').slice(0, -1), record('complete') + ':100644', record('../outside')]) {
    assert.throws(() => scanGitChanges({ cwd, base, head }, (dir, args) => args[0] === 'merge-base' ? ancestor : raw));
  }
});

test('Action runner writes reports and outputs before failing on findings, and fails closed on scan errors', t => {
  const cwd = fixture(t); const output = path.join(cwd, 'outputs.txt');
  const token = fakeTokens[0][1];
  const env = { GITHUB_WORKSPACE: cwd, RUNNER_TEMP: cwd, GITHUB_OUTPUT: output, GUARDRAILS_BASE: base, GUARDRAILS_HEAD: head };
  const logs = [];
  t.mock.method(console, 'log', text => { logs.push(text); });
  t.mock.method(console, 'error', text => { logs.push(text); });
  const findings = [{ file: path.join(cwd, 'example.txt'), findings: scanSecrets(token, defaults.rules.secrets) }];
  assert.equal(run(env, options => {
    assert.deepEqual(options, { cwd, base, head }); return findings;
  }), 1);
  const outputs = Object.fromEntries(fs.readFileSync(output, 'utf8').trim().split('\n').map(line => {
    const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)];
  }));
  assert.equal(outputs['files-with-findings'], '1');
  const text = fs.readFileSync(outputs['sarif-file'], 'utf8');
  assert.equal(JSON.parse(text).runs[0].results[0].ruleId, 'secrets/aws-access-key');
  assert.ok(!text.includes(token));
  assert.equal(run(env, () => []), 0);
  const before = fs.readFileSync(output, 'utf8');
  assert.equal(run(env, () => { throw new Error(token); }), 2);
  assert.equal(fs.readFileSync(output, 'utf8'), before, 'Error must not publish a successful report');
  assert.equal(run({ ...env, GUARDRAILS_BASE: undefined, GUARDRAILS_HEAD: undefined, GITHUB_EVENT_NAME: 'push' }), 2);
  assert.ok(!logs.join('\n').includes(token));
});

test('Action takes immutable PR event SHAs or an explicit revision pair', t => {
  const cwd = fixture(t); const event = path.join(cwd, 'event.json');
  fs.writeFileSync(event, JSON.stringify({ pull_request: { base: { sha: base }, head: { sha: head } } }));
  assert.deepEqual(revisions({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: event }), { base, head });
  assert.deepEqual(revisions({ GUARDRAILS_BASE: base, GUARDRAILS_HEAD: head }), { base, head });
  assert.throws(() => revisions({ GUARDRAILS_BASE: base }));
  assert.throws(() => revisions({ GITHUB_EVENT_NAME: 'pull_request_target', GITHUB_EVENT_PATH: event }));
});
