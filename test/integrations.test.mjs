import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { main } from '../bin/agent-guardrails.mjs';
import { decode, encode } from '../src/adapters/agents.mjs';
import { evaluate } from '../src/engine.mjs';
import { resolveConfig } from '../src/config.mjs';
import { fixture, fakeTokens, config } from './helpers.mjs';
import { summarize, commands } from '../scripts/bench.mjs';

const hosts = [
  ['codex', 'PreToolUse', 'Bash'],
  ['gemini', 'BeforeTool', 'run_shell_command'],
  ['cursor', 'preToolUse', 'Shell'],
];

async function hook(agent, input, cwd) {
  let stdout = ''; let stderr = '';
  const status = await main(['hook', '--agent', agent], {
    cwd: () => cwd, home: path.join(cwd, 'absent-home'), stdin: [JSON.stringify(input)],
    stdout: { write: s => { stdout += s; } }, stderr: { write: s => { stderr += s; } },
  });
  return { status, stdout, stderr };
}

test('native hooks deny destructive commands, map ask to deny and preserve clean continuation', async t => {
  const cwd = fixture(t);
  for (const [agent, hook_event_name, tool_name] of hosts) {
    for (const command of ['git reset --hard', 'git push', 'git status']) {
      const response = await hook(agent, { cwd, hook_event_name, tool_name, tool_input: { command } }, cwd);
      assert.equal(response.status, 0, response.stderr);
      const output = JSON.parse(response.stdout);
      const decision = agent === 'codex' ? output.hookSpecificOutput?.permissionDecision : agent === 'gemini' ? output.decision : output.permission;
      assert.equal(decision, command === 'git status' ? agent === 'cursor' ? 'allow' : undefined : 'deny');
      assert.ok(!response.stdout.includes('"ask"'));
    }
  }
});

test('native hooks scan file content and MCP payloads, and protect write destinations', async t => {
  const cwd = fixture(t);
  const token = fakeTokens[0][1];
  const options = { projectRoot: cwd, home: cwd };
  for (const [agent, event] of hosts) {
    const names = agent === 'gemini' ? ['write_file', 'mcp_fake_send'] : agent === 'cursor' ? ['Write', 'MCP:fake_send'] : ['apply_patch', 'mcp__fake__send'];
    const input = agent === 'codex' ? { command: `*** Begin Patch\n*** Add File: hello.txt\n+${token}\n*** End Patch` } : { file_path: 'hello.txt', content: token };
    for (const [tool_name, tool_input] of [[names[0], input], [names[1], { value: token }]]) {
      const ctx = decode({ cwd, hook_event_name: event, tool_name, tool_input }, agent, options);
      const result = evaluate(ctx, config);
      assert.ok(result.findings.some(f => f.code === 'aws-access-key'));
      assert.ok(!JSON.stringify(encode(result, agent)).includes(token));
    }
    const tool_input = agent === 'codex' ? { command: '*** Begin Patch\n*** Update File: .ssh/config\n+x\n*** Move to: elsewhere\n*** End Patch' } : { file_path: path.join(cwd, '.ssh/config'), content: 'hello' };
    assert.equal(evaluate(decode({ cwd, hook_event_name: event, tool_name: names[0], tool_input }, agent, options), config).decision, 'deny');
  }
});

test('native hooks preserve warning behavior and redact invalid inputs/config', async t => {
  const cwd = fixture(t);
  const token = fakeTokens[0][1];
  const warn = { decision: 'warn', findings: [{ ruleId: 'outbound', code: 'human-confirmation', message: 'Review required.', preview: '[REDACTED]', mode: 'warn' }] };
  assert.equal(encode(warn, 'codex').systemMessage, '[outbound:human-confirmation] Review required.');
  assert.equal(encode(warn, 'gemini').systemMessage, '[outbound:human-confirmation] Review required.');
  assert.equal(encode(warn, 'cursor').permission, 'allow');
  for (const [agent, event, name] of hosts) {
    for (const bad of [null, { cwd, hook_event_name: 'wrong', tool_name: name, tool_input: {} }, { cwd: 'relative', hook_event_name: event, tool_name: name, tool_input: {} }, { cwd, hook_event_name: event, tool_name: name, tool_input: token }]) {
      const response = await hook(agent, bad, cwd);
      assert.equal(response.status, 2); assert.equal(response.stdout, ''); assert.ok(!response.stderr.includes(token));
    }
  }
  fs.writeFileSync(path.join(cwd, '.agent-guardrails.json'), '{bad');
  assert.equal((await hook('gemini', { cwd, hook_event_name: 'BeforeTool', tool_name: 'run_shell_command', tool_input: { command: 'git status' } }, cwd)).status, 2);
  const malformed = await hook('unknown', {}, cwd);
  assert.equal(malformed.status, 2);
});

test('Cursor shell working_directory is used for path checks and validated', () => {
  const input = { cwd: '/repo', hook_event_name: 'preToolUse', tool_name: 'Shell', tool_input: { command: 'rm -rf child', working_directory: '/outside' } };
  const ctx = decode(input, 'cursor', { projectRoot: '/repo', home: '/home/fake' });
  assert.equal(ctx.cwd, '/outside');
  assert.equal(evaluate(ctx, resolveConfig()).decision, 'deny');
  assert.throws(() => decode({ ...input, tool_input: { working_directory: 'relative' } }, 'cursor', { projectRoot: '/repo', home: '/home/fake' }));
});

test('Gemini resolves shell dir_path from the workspace root and checks literal read paths', () => {
  const options = { projectRoot: '/repo', home: '/home/fake' };
  const payload = { cwd: '/repo/sub', hook_event_name: 'BeforeTool', tool_name: 'run_shell_command', tool_input: { command: 'rm -rf child', dir_path: '../outside' } };
  const ctx = decode(payload, 'gemini', options);
  assert.equal(ctx.cwd, '/outside');
  assert.equal(evaluate(ctx, config).decision, 'deny');
  assert.throws(() => decode({ ...payload, tool_input: { dir_path: 42 } }, 'gemini', options));
  const read = decode({ ...payload, tool_name: 'grep_search', tool_input: { dir_path: '.ssh', pattern: 'hello' } }, 'gemini', options);
  assert.ok(evaluate(read, config).findings.some(f => f.code === 'credential-read'));
  const alias = decode({ ...payload, tool_name: 'write_file', tool_input: { path: '/home/fake/.ssh/config', content: 'hello' } }, 'gemini', options);
  assert.equal(evaluate(alias, config).decision, 'deny');
});

test('benchmark nearest-rank percentiles and synthetic workload include all decision paths', () => {
  assert.deepEqual(summarize([5, 1, 4, 3, 2]), { count: 5, medianMs: 3, p95Ms: 5, meanMs: 3 });
  const decisions = commands.map(command => evaluate({ toolName: 'Bash', input: { command }, cwd: '/repo', projectRoot: '/repo', home: '/home/fake' }, config).decision);
  assert.deepEqual(new Set(decisions), new Set(['pass', 'ask', 'deny']));
});

test('integration JSON snippets parse, select their documented host, and are linked in both READMEs', () => {
  const contracts = [
    ['claude-code', 'PreToolUse', undefined], ['codex', 'PreToolUse', 'codex'],
    ['gemini', 'BeforeTool', 'gemini'], ['cursor', 'preToolUse', 'cursor'],
  ];
  for (const [tool, event, agent] of contracts) {
    const text = fs.readFileSync(`docs/integrations/${tool}.md`, 'utf8');
    const snippet = JSON.parse(text.match(/```json\r?\n([\s\S]*?)```/)[1]);
    const group = snippet.hooks[event][0];
    const handler = tool === 'cursor' ? group : group.hooks[0];
    assert.ok(handler.command.endsWith(agent ? `hook --agent ${agent}` : 'hook'));
    assert.ok(handler.timeout > 0);
    if (tool === 'cursor') { assert.equal(handler.failClosed, true); }
    if (tool === 'claude-code') { assert.equal(handler.onFailure, 'block'); }
  }
  for (const readme of ['README.md', 'README.tr.md']) {
    const text = fs.readFileSync(readme, 'utf8');
    for (const tool of ['claude-code', 'codex', 'gemini', 'cursor', 'pre-commit', 'github-actions']) {
      assert.ok(text.includes(`docs/integrations/${tool}.md`));
    }
  }
});
