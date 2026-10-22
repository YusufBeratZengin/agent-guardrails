import fs from 'node:fs';
import path from 'node:path';
import { resolveConfig } from '../src/config.mjs';

export const config = resolveConfig();
export function context(toolName = 'Bash', input = {}, cwd = '/project') {
  return { toolName, input, cwd, projectRoot: cwd, home: cwd.startsWith('C:') ? 'C:/Users/example' : '/home/example' };
}
export function payload(tool_name = 'Bash', tool_input = { command: 'git status' }, cwd = process.cwd()) {
  return { hook_event_name: 'PreToolUse', tool_name, tool_input, cwd, tool_use_id: 'fake-call', session_id: 'fake-session' };
}
let counter = 0;
// All test I/O stays inside the authorized workspace, excluded from scans/git.
export function fixture(t) {
  const dir = path.resolve('is', `test-${process.pid}-${counter++}`);
  if (path.dirname(dir) !== path.resolve('is')) { throw new Error('Fixture must stay inside workspace/is'); }
  fs.mkdirSync(dir, { recursive: true });
  t.after(() => {
    if (path.dirname(dir) !== path.resolve('is')) { throw new Error('Unsafe fixture cleanup target'); }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}
export const mixed = ['aB3dE5fG7hJ9kL2m', 'N4pQ6rS8tU1vW0zY'].join('');
export const fakeTokens = [
  ['aws-access-key', ['AK', 'IA', 'A1B2C3D4E5F6G7H8'].join('')],
  ['github-token', ['gh', 'p_', 'aB3dE5fG7hJ9kL2mN4pQ6rS8tU1vW0zY1234'].join('')],
  ['github-token', ['github_', 'pat_', mixed].join('')],
  ['openai-key', ['s', 'k-', mixed].join('')],
  ['openai-key', ['s', 'k-proj-', mixed].join('')],
  ['anthropic-key', ['s', 'k-ant-', mixed].join('')],
  ['google-key', ['AI', 'za', mixed, '123'].join('')],
  ['private-key', ['-----BEGIN ', 'RSA PRIVATE KEY', '-----'].join('')],
  ['jwt', ['eyJ', 'hbGciOiJub25lIn0', '.', 'eyJmYWtlIjp0cnVlfQ', '.', 'ZmFrZXNpZ25hdHVyZQ'].join('')],
];
