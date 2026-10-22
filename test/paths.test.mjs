import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePath } from '../src/paths.mjs';
import { protectPaths } from '../src/guards/protect-paths.mjs';
import { config, context } from './helpers.mjs';
const rule = { ...config.rules['protect-paths'], paths: ['~/.ssh', '/other/repo', '/project/locked'] };
for (const file of ['/home/example/.ssh/config', '~/.ssh/id_fake', '/other/repo/a', '/project/locked/../locked/a']) {
  for (const tool of ['Write', 'Edit', 'MultiEdit']) {
    test(`protect ${tool}: ${file}`, () => assert.ok(protectPaths(context(tool, { file_path: file }), rule).length));
  }
}
for (const cmd of ['echo safe > /project/locked/a', 'echo safe >> /project/locked/a', 'cp a /project/locked/a', 'mv /project/locked/a b', 'tee /project/locked/a', 'Set-Content /project/locked/a safe', 'Remove-Item /project/locked/a']) {
  test(`protect shell: ${cmd}`, () => assert.ok(protectPaths(context('Bash', { command: cmd }), rule).length));
}
test('path segment boundaries and safe reads', () => {
  assert.deepEqual(protectPaths(context('Write', { file_path: '/project/locked-other/a' }), rule), []);
  assert.deepEqual(protectPaths(context('Read', { file_path: '/project/locked/a' }), rule), []);
  assert.deepEqual(protectPaths(context('Bash', { command: 'cat /project/locked/a' }), rule), []);
  assert.ok(protectPaths(context('NotebookEdit', { notebook_path: '/project/locked/a' }), rule).length);
  assert.ok(protectPaths(context('Bash', { command: 'rm -rf /project/build' }), { ...rule, paths: ['/project/build/locked'] }).length);
});
test('Windows drives, UNC, traversal and home forms', () => {
  const ctx = context('Write', { file_path: 'C:\\USERS\\EXAMPLE\\.ssh\\config' }, 'C:/project');
  assert.ok(protectPaths(ctx, { ...rule, paths: ['~/.ssh'] }).length);
  for (const value of ['~/.ssh/a', '$HOME/.ssh/a', '${HOME}/.ssh/a', '%USERPROFILE%/.ssh/a', '$env:USERPROFILE/.ssh/a']) {
    assert.equal(normalizePath(value, ctx.cwd, ctx.home), 'c:/users/example/.ssh/a');
  }
  assert.equal(normalizePath('C:\\project\\..\\other', ctx.cwd, ctx.home), 'c:/other');
  assert.ok(protectPaths({ ...ctx, input: { file_path: '\\\\server\\share\\repo\\a' } }, { ...rule, paths: ['//server/share/repo'] }).length);
  assert.ok(protectPaths({ ...ctx, toolName: 'PowerShell', input: { command: 'echo safe > "\\\\server\\share\\repo\\a"' } }, { ...rule, paths: ['//server/share/repo'] }).length);
});
