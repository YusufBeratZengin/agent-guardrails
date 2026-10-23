// Capture the first case of `node examples/demo.mjs` through the real CLI entry.
// In-process streams keep this usable where child processes are restricted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { main } from '../bin/agent-guardrails.mjs';
import { demoCases } from '../examples/demo.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const command = '$ node examples/demo.mjs';

export async function renderDemo() {
  const [label, tool_name, tool_input] = demoCases[0];
  let output = '';
  // A local fixture keeps personal/project policy overrides out of the image.
  const scratch = path.join(root, '.tmp-test');
  fs.mkdirSync(scratch, { recursive: true });
  const cwd = fs.mkdtempSync(path.join(scratch, 'demo-'));
  try {
    fs.writeFileSync(path.join(cwd, '.agent-guardrails.json'), '{}');
    const status = await main(['test', JSON.stringify({
      hook_event_name: 'PreToolUse', tool_name, tool_input, cwd,
    })], {
      cwd: () => cwd, home: cwd, stdin: [],
      stdout: { write: text => { output += text; } },
      stderr: { write: () => { throw new Error('Demo CLI failed'); } },
    });
    assert.equal(status, 0);
    assert.equal(JSON.parse(output).decision, 'ask');
  } finally {
    if (path.dirname(cwd) !== scratch) { throw new Error('Unsafe demo cleanup target'); }
    fs.rmSync(cwd, { recursive: true, force: true });
  }
  const lines = [command, label, ...output.trimEnd().split('\n')];
  const escape = text => text.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[char]);
  const width = Math.max(760, ...lines.map(line => line.length * 8.5 + 64));
  const height = 120 + lines.length * 23;
  const rows = lines.map((line, index) => {
    const color = index === 0 ? '#a5b4fc' : line.includes('"ask"') ? '#fbbf24' : '#d1d5db';
    return `    <text x="32" y="${88 + index * 23}" fill="${color}">${escape(line)}</text>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">agent-guardrails asks before git push</title>
  <desc id="desc">Real CLI output from the first case of node examples/demo.mjs. The outbound rule requests human confirmation, with a redacted preview. Remaining demo cases are omitted. Inspected commands are never executed.</desc>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="16" fill="#0d1117" stroke="#30363d"/>
  <path d="M17 1h${width - 34}a16 16 0 0 1 16 16v33H1V17A16 16 0 0 1 17 1Z" fill="#161b22"/>
  <g>
    <circle cx="25" cy="25" r="6" fill="#ff5f57"/>
    <circle cx="45" cy="25" r="6" fill="#febc2e"/>
    <circle cx="65" cy="25" r="6" fill="#28c840"/>
  </g>
  <text x="${width / 2}" y="30" text-anchor="middle" fill="#8b949e" font-family="monospace" font-size="13">agent-guardrails · local policy evaluation</text>
  <g font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="14" xml:space="preserve">
${rows}
  </g>
  <text x="32" y="${height - 17}" fill="#8b949e" font-family="monospace" font-size="12">First case shown · remaining cases omitted · inspected commands never run</text>
</svg>
`.replace(/\r\n/g, '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  fs.writeFileSync(path.join(root, 'docs/demo.svg'), await renderDemo());
  console.log('Generated docs/demo.svg from real CLI output.');
}
