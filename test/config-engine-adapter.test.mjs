import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveConfig, loadConfig } from '../src/config.mjs';
import { evaluate } from '../src/engine.mjs';
import { decode, encode, failure, settingsSnippet } from '../src/adapters/claude-code.mjs';
import { commands, invocations } from '../src/commands.mjs';
import { audit } from '../src/audit.mjs';
import { glob } from '../src/util.mjs';
import { config, context, payload, fixture, mixed } from './helpers.mjs';

test('engine deduplicates rule/code pairs while preserving first-seen message order', () => {
  const result = evaluate(context('Bash', { command: 'echo $(git clean -fdx); git reset --hard; git clean -fd' }), config);
  assert.deepEqual(result.findings.map(f => [f.ruleId, f.code, f.message]), [
    ['destructive', 'git-clean', 'Forced clean deletes untracked work.'],
    ['destructive', 'git-reset-hard', 'Hard reset discards work.'],
  ]);
  assert.equal(evaluate(context('Bash', { command: 'echo $(git clean -fdx)' }), config).findings.length, 1);
});

test('POSIX cwd stays POSIX on every host through config lookup and adapter', () => {
  const { config: loaded, projectRoot } = loadConfig('/tmp/proj', '/tmp/guardrails-synthetic-home');
  assert.equal(projectRoot, '/tmp/proj');
  const ctx = decode(payload('Bash', { command: 'rm -rf node_modules' }, '/tmp/proj'), { projectRoot, home: '/tmp/guardrails-synthetic-home' });
  assert.deepEqual(evaluate(ctx, loaded), { decision: 'pass', findings: [] });
});

test('config defaults, deep precedence, arrays replace, no default mutation', () => {
  const custom = resolveConfig({ rules: { secrets: { mode: 'ask', allowReadPaths: ['a'] }, outbound: { allMcp: true } } }, { rules: { secrets: { mode: 'warn', allowReadPaths: ['b'] } } });
  assert.equal(custom.rules.secrets.mode, 'warn');
  assert.equal(custom.rules.outbound.allMcp, true);
  assert.deepEqual(custom.rules.secrets.allowReadPaths, ['b']);
  custom.rules.secrets.allowReadPaths.push('c');
  assert.deepEqual(resolveConfig().rules.secrets.allowReadPaths, []);
});
for (const bad of [
  { unknown: true }, { rules: null }, { rules: { secret: {} } }, { rules: { secrets: { mode: 'allow' } } },
  { rules: { secrets: { id: 'outbound' } } }, { rules: { secrets: { minLength: 7 } } },
  { rules: { secrets: { entropyThreshold: 9 } } }, { rules: { secrets: { allowValues: [42] } } },
  { audit: { enabled: 'yes' } }, { audit: { path: '' } }, JSON.parse('{"__proto__":{"polluted":true}}'),
  { $schema: 4 }, { rules: { $schema: 'nested' } },
]) { test(`invalid config ${JSON.stringify(bad)}`, () => assert.throws(() => resolveConfig(bad))); }
test('disk config lookup and malformed files', t => {
  const dir = fixture(t);
  const home = path.join(dir, 'home');
  const project = path.join(dir, 'project');
  fs.mkdirSync(home); fs.mkdirSync(project); fs.mkdirSync(path.join(project, '.git')); fs.mkdirSync(path.join(project, 'src'));
  fs.writeFileSync(path.join(home, '.agent-guardrails.json'), JSON.stringify({ rules: { secrets: { mode: 'ask' } } }));
  fs.writeFileSync(path.join(project, '.agent-guardrails.json'), JSON.stringify({ rules: { secrets: { mode: 'warn' } } }));
  const loaded = loadConfig(path.join(project, 'src'), home);
  assert.equal(loaded.projectRoot, project);
  assert.equal(loaded.config.rules.secrets.mode, 'warn');
  fs.writeFileSync(path.join(project, '.agent-guardrails.json'), '{bad');
  assert.throws(() => loadConfig(project, home));
});
test('rule modes and decision precedence', () => {
  const ctx = context('Bash', { command: `API_KEY=${mixed} git push --force` });
  assert.equal(evaluate(ctx, config).decision, 'deny');
  const modes = { rules: { secrets: { mode: 'off' }, destructive: { mode: 'off' } } };
  assert.equal(evaluate(ctx, resolveConfig(modes)).decision, 'ask');
  assert.equal(evaluate(ctx, resolveConfig({ ...modes, rules: { ...modes.rules, outbound: { mode: 'warn' } } })).decision, 'warn');
  for (const id of Object.keys(config.rules)) {
    assert.equal(resolveConfig({ rules: { [id]: { mode: 'off' } } }).rules[id].mode, 'off');
  }
  assert.equal(evaluate(context('Bash', { command: 'git status' }), config).decision, 'pass');
});
test('adapter shape, denies, asks, warnings and abstention', () => {
  const options = { projectRoot: '/project', home: '/home/example' };
  assert.equal(decode(payload('Bash', { command: 'git status' }, '/project'), options).cwd, '/project');
  for (const input of [null, {}, [], payload('Bash', {}, 'relative'), { ...payload(), tool_input: null }, { ...payload(), hook_event_name: 'PostToolUse' }]) { assert.throws(() => decode(input, options)); }
  assert.equal(encode(evaluate(context('Bash', { command: 'git push' }), config)).hookSpecificOutput.permissionDecision, 'ask');
  assert.equal(encode(evaluate(context('Bash', { command: 'git reset --hard' }), config)).hookSpecificOutput.permissionDecision, 'deny');
  assert.deepEqual(encode({ decision: 'pass', findings: [] }), {});
  assert.ok(encode({ decision: 'warn', findings: [{ ruleId: 'secrets', code: 'fake', message: 'warn', mode: 'warn' }] }).systemMessage);
  assert.equal(failure().exitCode, 2);
  assert.equal(settingsSnippet().hooks.PreToolUse[0].matcher, '.*');
});
test('shell lexer and literal wrapper handling', () => {
  assert.deepEqual(commands('echo "a;b" && git status; pwd'), [['echo', 'a;b'], ['git', 'status'], ['pwd']]);
  assert.deepEqual(commands('echo hi # git reset --hard\ngit status'), [['echo', 'hi'], ['git', 'status']]);
  assert.ok(invocations('bash -c "git push"').some(w => w.join(' ') === 'git push'));
  assert.deepEqual(commands('Remove-Item C:\\project\\build -Recurse')[0][1], 'C:\\project\\build');
  assert.equal(glob('mcp__example__SEND', '*send'), true);
  assert.equal(glob('a.b', 'a.b'), true); assert.equal(glob('axb', 'a.b'), false);
  assert.equal(glob('a[b]', 'a[b]'), true); assert.equal(glob('ab', 'a?'), true);
  assert.equal(glob('a'.repeat(1000), '*a'.repeat(30) + 'b'), false);
});
for (const [id, ctx] of [
  ['secrets', context('Write', { content: `API_KEY=${mixed}` })],
  ['destructive', context('Bash', { command: 'git reset --hard' })],
  ['outbound', context('Bash', { command: 'git push' })],
  ['pii', context('mcp__example__send', { content: ['nobody', '@', 'example.invalid'].join('') })],
  ['protect-paths', context('Write', { file_path: '~/.ssh/config' })],
]) {
  for (const mode of ['deny', 'ask', 'warn', 'off']) {
    test(`mode ${id}=${mode}`, () => {
      const result = evaluate(ctx, resolveConfig({ rules: { [id]: { mode } } }));
      const findings = result.findings.filter(f => f.ruleId === id);
      if (mode === 'off') { assert.deepEqual(findings, []); }
      else { assert.ok(findings.length); assert.equal(findings[0].mode, mode); }
    });
  }
}
test('audit records contain no raw values and append valid JSONL', t => {
  const dir = fixture(t);
  const logConfig = resolveConfig({ audit: { enabled: true, path: 'audit.jsonl' } });
  const result = evaluate(context('Bash', { command: `API_KEY=${mixed}` }), logConfig);
  audit(result, logConfig, dir); audit(result, logConfig, dir);
  const raw = fs.readFileSync(path.join(dir, 'audit.jsonl'), 'utf8');
  assert.ok(!raw.includes(mixed)); assert.ok(!raw.includes('API_KEY')); assert.ok(!raw.includes('/project'));
  const rows = raw.trim().split('\n').map(s => JSON.parse(s));
  assert.equal(rows.length, 2); assert.equal(rows[0].decision, 'deny'); assert.equal(rows[0].findings[0].preview, '[REDACTED]');
  audit(result, config, dir);
  assert.throws(() => audit(result, resolveConfig({ audit: { enabled: true, path: 'missing/log' } }), dir));
});
