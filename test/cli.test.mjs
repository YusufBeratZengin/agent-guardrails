import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { main } from '../bin/agent-guardrails.mjs';
import { fixture, payload, mixed, config } from './helpers.mjs';
import { scan } from '../src/scan.mjs';

async function run(args, { cwd = process.cwd(), input = '' } = {}) {
  let stdout = '';
  let stderr = '';
  const status = await main(args, {
    stdin: Readable.from([input]),
    stdout: { write: text => { stdout += text; } },
    stderr: { write: text => { stderr += text; } },
    cwd: () => cwd,
    home: path.join(cwd, 'absent-fake-home'),
  });
  return { status, stdout, stderr };
}

test('CLI help, version, explain and usage', async () => {
  assert.equal((await run(['--help'])).status, 0); assert.equal((await run(['--version'])).stdout.trim(), '0.1.0');
  for (const id of Object.keys(config.rules)) { assert.equal((await run(['explain', id])).status, 0); }
  for (const args of [['explain', 'missing'], ['unknown'], ['init', '--force'], ['hook', 'extra']]) { assert.equal((await run(args)).status, 2); }
});
test('CLI hook stdin protocol and error redaction', async t => {
  const dir = fixture(t);
  const deny = await run(['hook'], { input: JSON.stringify(payload('Bash', { command: 'git reset --hard' }, dir)) });
  assert.equal(deny.status, 0, deny.stderr); assert.equal(JSON.parse(deny.stdout).hookSpecificOutput.permissionDecision, 'deny');
  const ask = await run(['hook'], { input: JSON.stringify(payload('Bash', { command: 'git push' }, dir)) });
  assert.equal(JSON.parse(ask.stdout).hookSpecificOutput.permissionDecision, 'ask');
  const pass = await run(['hook'], { input: JSON.stringify(payload('Bash', { command: 'git status' }, dir)) });
  assert.deepEqual(JSON.parse(pass.stdout), {});
  for (const input of ['{bad ' + mixed, 'null', JSON.stringify(payload('Bash', {}, 'relative')), JSON.stringify({ ...payload(), hook_event_name: 'Stop' })]) {
    const error = await run(['hook'], { input });
    assert.equal(error.status, 2); assert.equal(error.stdout, ''); assert.ok(!error.stderr.includes(mixed));
  }
});
test('CLI dry-run never writes audit and malformed config blocks hook', async t => {
  const dir = fixture(t);
  fs.writeFileSync(path.join(dir, '.agent-guardrails.json'), JSON.stringify({ audit: { enabled: true, path: 'audit.jsonl' } }));
  const text = JSON.stringify(payload('Write', { file_path: path.join(dir, 'fake.txt'), content: `API_KEY=${mixed}` }, dir));
  const dry = await run(['test', text], { cwd: dir });
  assert.equal(dry.status, 0, dry.stderr); assert.equal(JSON.parse(dry.stdout).decision, 'deny'); assert.ok(!dry.stdout.includes(mixed));
  assert.equal(fs.existsSync(path.join(dir, 'audit.jsonl')), false);
  assert.equal((await run(['hook'], { cwd: dir, input: text })).status, 0);
  assert.equal(fs.existsSync(path.join(dir, 'audit.jsonl')), true);
  fs.writeFileSync(path.join(dir, '.agent-guardrails.json'), '{bad');
  assert.equal((await run(['hook'], { cwd: dir, input: text })).status, 2);
});
test('init prints by default; write merges with exact backup and is idempotent', async t => {
  const dir = fixture(t);
  assert.equal((await run(['init'], { cwd: dir })).status, 0); assert.equal(fs.existsSync(path.join(dir, '.claude')), false);
  fs.mkdirSync(path.join(dir, '.claude'));
  const target = path.join(dir, '.claude/settings.json');
  const original = JSON.stringify({ permissions: { deny: ['Read(.env)'] }, hooks: { Stop: [], PreToolUse: [{ matcher: 'Read', hooks: [] }] } });
  fs.writeFileSync(target, original);
  const written = await run(['init', '--write'], { cwd: dir });
  assert.equal(written.status, 0, written.stderr);
  const files = fs.readdirSync(path.dirname(target));
  const backup = files.find(f => f.startsWith('settings.json.bak.'));
  assert.ok(backup); assert.equal(fs.readFileSync(path.join(path.dirname(target), backup), 'utf8'), original);
  const settings = JSON.parse(fs.readFileSync(target, 'utf8'));
  assert.deepEqual(settings.permissions, { deny: ['Read(.env)'] }); assert.equal(settings.hooks.PreToolUse.length, 2);
  assert.equal(JSON.parse((await run(['init', '--write'], { cwd: dir })).stdout).changed, false);
  assert.equal(fs.readdirSync(path.dirname(target)).length, files.length);
  fs.writeFileSync(target, '{bad');
  assert.equal((await run(['init', '--write'], { cwd: dir })).status, 2); assert.equal(fs.readFileSync(target, 'utf8'), '{bad');
});

test('init --command preserves custom commands in print and idempotent writes', async t => {
  const dir = fixture(t);
  for (const command of ['npx --no-install agent-guardrails hook', 'node "/absolute path/bin/agent-guardrails.mjs" hook', '  node "C:/tools/guardrails.mjs" hook  ']) {
    const printed = await run(['init', '--command', command], { cwd: dir });
    assert.equal(printed.status, 0, printed.stderr);
    assert.equal(JSON.parse(printed.stdout).hooks.PreToolUse[0].hooks[0].command, command);
    const written = await run(['init', '--command', command, '--write'], { cwd: dir });
    assert.equal(written.status, 0, written.stderr);
    const settings = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
    assert.equal(settings.hooks.PreToolUse.at(-1).hooks[0].command, command);
    assert.equal(JSON.parse((await run(['init', '--write', '--command', command], { cwd: dir })).stdout).changed, false);
  }
});

test('init preserves distinct exact backups when multiple writes share a timestamp', async t => {
  const dir = fixture(t);
  const timestamp = 1234567890000;
  t.mock.method(Date, 'now', () => timestamp);
  const settingsDir = path.join(dir, '.claude');
  fs.mkdirSync(settingsDir);
  const target = path.join(settingsDir, 'settings.json');
  const original = '{ "permissions": { "deny": ["Read(.env)"] } }\n';
  fs.writeFileSync(target, original);
  const existingBackup = `settings.json.bak.${timestamp}`;
  fs.writeFileSync(path.join(settingsDir, existingBackup), 'existing backup');
  const expectedBackups = ['existing backup'];
  for (const command of ['node first.mjs hook', 'node second.mjs hook', '  node "C:/tools/guardrails.mjs" hook  ']) {
    expectedBackups.push(fs.readFileSync(target, 'utf8'));
    const written = await run(['init', '--write', '--command', command], { cwd: dir });
    assert.equal(written.status, 0, written.stderr);
    assert.deepEqual(JSON.parse(written.stdout), { changed: true, backup: true });
    assert.equal(JSON.parse(fs.readFileSync(target, 'utf8')).hooks.PreToolUse.at(-1).hooks[0].command, command);
    const unchanged = await run(['init', '--write', '--command', command], { cwd: dir });
    assert.equal(unchanged.status, 0, unchanged.stderr);
    assert.deepEqual(JSON.parse(unchanged.stdout), { changed: false, backup: false });
    const backups = fs.readdirSync(settingsDir).filter(name => name.startsWith('settings.json.bak.'));
    assert.deepEqual(backups.map(name => fs.readFileSync(path.join(settingsDir, name), 'utf8')).sort(), [...expectedBackups].sort());
  }
  assert.equal(fs.readFileSync(path.join(settingsDir, existingBackup), 'utf8'), 'existing backup');
});

test('init option errors explain usage without echoing arguments', async () => {
  for (const args of [['--command'], ['--write', '--write'], [`--unknown-${mixed}`]]) {
    const result = await run(['init', ...args]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Invalid init option/);
    assert.match(result.stderr, /init \[--write\] \[--command <string>\]/);
    assert.ok(!result.stderr.includes(mixed));
  }
});

test('init rejects missing, empty, multiline, duplicate and unknown command options without writing', async t => {
  const dir = fixture(t);
  for (const args of [
    ['--command'], ['--command', ''], ['--command', '  '], ['--command', 'echo one\necho two'],
    ['--command', 'echo one\recho two'], ['--command', 'a\u2028b'], ['--command', 'a\0b'],
    ['--command', 'one', '--command', 'two'], ['--write', '--write'], ['--unknown'],
  ]) {
    assert.equal((await run(['init', '--write', ...args], { cwd: dir })).status, 2);
    assert.equal(fs.existsSync(path.join(dir, '.claude')), false);
  }
});

test('scan skips new scratch and legacy directories but scans explicit files', t => {
  const dir = fixture(t);
  for (const name of ['.tmp-test', 'is']) {
    fs.mkdirSync(path.join(dir, name));
    const target = path.join(dir, name, 'synthetic.txt');
    fs.writeFileSync(target, `API_KEY=${mixed}`);
    assert.equal(scan(target, config.rules.secrets).length, 1);
  }
  assert.deepEqual(scan(dir, config.rules.secrets), []);
});
test('init fresh write and scan clean/findings/error; scan ignores hook mode', async t => {
  const dir = fixture(t);
  assert.equal((await run(['init', '--write'], { cwd: dir })).status, 0);
  const source = path.join(dir, 'fake.txt');
  fs.writeFileSync(source, 'hello world');
  assert.equal((await run(['scan', source], { cwd: dir })).status, 0);
  fs.writeFileSync(source, `API_KEY=${mixed}`);
  fs.writeFileSync(path.join(dir, '.agent-guardrails.json'), JSON.stringify({ rules: { secrets: { mode: 'off' } } }));
  const result = await run(['scan', source], { cwd: dir });
  assert.equal(result.status, 1); assert.ok(!result.stdout.includes(mixed)); assert.equal(JSON.parse(result.stdout).filesWithFindings, 1);
  assert.equal(JSON.parse(result.stdout).findings[0].file, 'fake.txt');
  assert.equal((await run(['scan', path.join(dir, 'missing')], { cwd: dir })).status, 2);
  const large = path.join(dir, 'large.txt');
  fs.writeFileSync(large, ' '.repeat(65530) + `API_KEY=${mixed}`);
  assert.equal(scan(large, config.rules.secrets).length, 1);
});
test('oversized and nested inputs fail closed', async t => {
  const dir = fixture(t);
  assert.equal((await run(['hook'], { input: ' '.repeat(4 * 1024 * 1024 + 1) })).status, 2);
  const nested = {}; let child = nested;
  for (let i = 0; i < 35; i++) { child.data = {}; child = child.data; }
  assert.equal((await run(['hook'], { input: JSON.stringify(payload('Write', nested, dir)) })).status, 2);
});
test('hook preserves Unicode paths when stdin splits a multibyte character', async t => {
  const dir = fixture(t);
  const locked = path.join(dir, 'locked-\u011f');
  fs.writeFileSync(path.join(dir, '.agent-guardrails.json'), JSON.stringify({ rules: { 'protect-paths': { paths: [locked] } } }));
  const bytes = Buffer.from(JSON.stringify(payload('Write', { file_path: path.join(locked, 'a'), content: 'hello' }, dir)));
  const boundary = bytes.indexOf(Buffer.from('\u011f')) + 1;
  let output = '';
  const status = await main(['hook'], {
    stdin: Readable.from([bytes.subarray(0, boundary), bytes.subarray(boundary)]),
    stdout: { write: text => { output += text; } },
    stderr: { write: () => {} }, cwd: () => dir, home: path.join(dir, 'absent-home'),
  });
  assert.equal(status, 0);
  assert.equal(JSON.parse(output).hookSpecificOutput.permissionDecision, 'deny');
});
