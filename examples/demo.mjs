import { pathToFileURL } from 'node:url';
import { main } from '../bin/agent-guardrails.mjs';

// Synthetic credential assembled only in memory; inspected commands never run.
export const demoCases = [
  ['git push', 'Bash', { command: 'git push' }],
  ['git reset --hard', 'Bash', { command: 'git reset --hard' }],
  ['Write with a synthetic AWS key', 'Write', { file_path: 'demo.txt', content: ['AK', 'IA', 'A1B2C3D4E5F6G7H8'].join('') }],
];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [label, tool_name, tool_input] of demoCases) {
    console.log(label);
    const status = await main(['test', JSON.stringify({ hook_event_name: 'PreToolUse', tool_name, tool_input, cwd: process.cwd() })]);
    if (status !== 0) { process.exitCode = status; break; }
  }
}
