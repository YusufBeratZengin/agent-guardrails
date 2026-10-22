import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entropy, scanSecrets, secrets } from '../src/guards/secrets.mjs';
import { config, context, fakeTokens, mixed } from './helpers.mjs';
const rule = config.rules.secrets;

for (const [code, token] of fakeTokens) {
  test(`secret format: ${code} (${token.length} characters)`, () => {
    assert.ok(scanSecrets(`value: ${token}`, rule).some(f => f.code === code));
    assert.ok(!JSON.stringify(scanSecrets(token, rule)).includes(token));
  });
}
for (const text of ['const answer = 42', 'API_KEY=xxxx', 'API_KEY=<your-key>', 'API_KEY=example', 'API_KEY=${API_KEY}', 'API_KEY="your-api-key-here"', ['s', 'k-', 'x'.repeat(32)].join(''), 'API_KEY=' + 'a'.repeat(40), 'git status']) {
  test(`safe content: ${text.slice(0, 32)}`, () => assert.deepEqual(scanSecrets(text, rule), []));
}
test('entropy assignments, JSON and tuning', () => {
  assert.equal(entropy('aaaa'), 0);
  assert.equal(entropy('abcd'), 2);
  for (const text of [`API_KEY=${mixed}`, `export ACCESS_TOKEN='${mixed}'`, `{"password":"${mixed}"}`]) { assert.ok(scanSecrets(text, rule).length); }
  assert.deepEqual(scanSecrets(`API_KEY=${mixed}`, { ...rule, entropyThreshold: 8 }), []);
  assert.deepEqual(scanSecrets(`API_KEY=${mixed}`, { ...rule, allowValues: [mixed] }), []);
});
for (const toolName of ['Write', 'Edit', 'MultiEdit', 'Bash', 'PowerShell', 'mcp__example__send']) {
  test(`content adapter: ${toolName}`, () => {
    const content = `API_KEY=${mixed}`;
    const input = toolName === 'MultiEdit' ? { edits: [{ new_string: content }] } : { content, new_string: content, command: content };
    assert.ok(secrets(context(toolName, input), rule).length);
  });
}
for (const file of ['.env', '/project/.env.local', '/home/example/.ssh/id_rsa', 'C:\\Users\\example\\.aws\\credentials', '.npmrc', 'service-account-fake.json', '.netrc']) {
  test(`credential read: ${file}`, () => {
    assert.equal(secrets(context('Read', { file_path: file }), rule)[0]?.code, 'credential-read');
    assert.equal(secrets(context('Bash', { command: `cat "${file}"` }), rule)[0]?.code, 'credential-read');
  });
}
test('credential allowlist is normalized and scoped; source file reads allowed', () => {
  const ctx = context('Read', { file_path: '/project/.env.example' });
  assert.deepEqual(secrets(ctx, { ...rule, allowReadPaths: ['.env.example'] }), []);
  assert.ok(secrets(context('Read', { file_path: '/outside/.env.example' }), { ...rule, allowReadPaths: ['.env.example'] }).length);
  assert.deepEqual(secrets(context('Read', { file_path: '/project/src/index.mjs' }), rule), []);
});
