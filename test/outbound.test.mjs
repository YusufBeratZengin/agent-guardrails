import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outbound } from '../src/guards/outbound.mjs';
import { config, context } from './helpers.mjs';
const rule = config.rules.outbound;
for (const tool of ['mcp__mail__send_message', 'mcp__site__publish', 'mcp__social__create_post', 'mcp__git__merge', 'mcp__shop__purchase', 'mcp__billing__charge']) {
  test(`outbound tool: ${tool}`, () => assert.ok(outbound(context(tool), rule).length));
}
for (const cmd of ['git push', 'git -C /project push origin main', 'gh pr create --title fake', 'npm publish', 'true && npm publish', 'echo $(git push)', 'curl https://example.invalid', 'PowerShell -Command "Invoke-RestMethod https://example.invalid"']) {
  test(`outbound command: ${cmd}`, () => assert.ok(outbound(context('Bash', { command: cmd }), rule).length));
}
for (const cmd of ['git status', 'gh pr view', 'npm test', 'echo "npm publish"']) {
  test(`local command: ${cmd}`, () => assert.deepEqual(outbound(context('Bash', { command: cmd }), rule), []));
}
test('MCP default and configurable globs', () => {
  assert.deepEqual(outbound(context('mcp__fs__read_file'), rule), []);
  assert.ok(outbound(context('mcp__fs__read_file'), { ...rule, allMcp: true }).length);
  assert.ok(outbound(context('CustomUpload'), { ...rule, toolPatterns: ['custom*'] }).length);
  assert.deepEqual(outbound(context('mcp__mail__send'), { ...rule, toolPatterns: [] }), []);
});
