import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { evaluate } from '../src/engine.mjs';
import { resolveConfig } from '../src/config.mjs';
import { decode } from '../src/adapters/claude-code.mjs';
const config = resolveConfig();
const payload = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git status && npm test' }, cwd: process.cwd() };
const ctx = decode(payload, { projectRoot: process.cwd(), home: process.cwd() });
for (let i = 0; i < 200; i++) { evaluate(ctx, config); }
const coreSamples = [];
for (let i = 0; i < 1000; i++) {
  const start = performance.now();
  evaluate(ctx, config);
  coreSamples.push(performance.now() - start);
}
coreSamples.sort((a, b) => a - b);
const coreMeanMs = coreSamples.reduce((a, b) => a + b, 0) / coreSamples.length;
const coreP95Ms = coreSamples[Math.ceil(coreSamples.length * 0.95) - 1];
const metadata = { node: process.version, platform: process.platform, cpu: os.cpus()[0]?.model, coreMeanMs, coreP95Ms, coreBudgetMs: 10 };
if (process.argv.includes('--core-only')) {
  console.log(JSON.stringify({ ...metadata, processLatency: 'not measured' }, null, 2));
  process.exit(coreP95Ms > 10 ? 1 : 0);
}
const samples = [];
for (let i = 0; i < 25; i++) {
  const begin = performance.now();
  const result = spawnSync(process.execPath, ['bin/agent-guardrails.mjs', 'hook'], { input: JSON.stringify(payload), encoding: 'utf8' });
  if (result.status !== 0) { throw new Error('Benchmark hook failed'); }
  samples.push(performance.now() - begin);
}
samples.sort((a, b) => a - b);
console.log(JSON.stringify({ ...metadata, processMedianMs: samples[12], processP95Ms: samples[23] }, null, 2));
process.exitCode = coreP95Ms > 10 ? 1 : 0;
