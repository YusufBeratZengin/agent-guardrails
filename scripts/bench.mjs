import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { evaluate } from '../src/engine.mjs';
import { resolveConfig } from '../src/config.mjs';
import { decode } from '../src/adapters/claude-code.mjs';
const config = resolveConfig();
const payload = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git status && npm test' }, cwd: process.cwd() };
const ctx = decode(payload, { projectRoot: process.cwd(), home: process.cwd() });
for (let i = 0; i < 200; i++) { evaluate(ctx, config); }
const start = performance.now();
for (let i = 0; i < 1000; i++) { evaluate(ctx, config); }
const coreMeanMs = (performance.now() - start) / 1000;
if (process.argv.includes('--core-only')) {
  console.log(JSON.stringify({ node: process.version, platform: process.platform, coreMeanMs, processLatency: 'not measured', targetMs: 50 }, null, 2));
  process.exit(0);
}
const samples = [];
for (let i = 0; i < 25; i++) {
  const begin = performance.now();
  const result = spawnSync(process.execPath, ['bin/agent-guardrails.mjs', 'hook'], { input: JSON.stringify(payload), encoding: 'utf8' });
  if (result.status !== 0) { throw new Error('Benchmark hook failed'); }
  samples.push(performance.now() - begin);
}
samples.sort((a, b) => a - b);
console.log(JSON.stringify({ node: process.version, platform: process.platform, coreMeanMs, processMedianMs: samples[12], processP95Ms: samples[23], targetMs: 50 }, null, 2));
