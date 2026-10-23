import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { evaluate } from '../src/engine.mjs';
import { resolveConfig } from '../src/config.mjs';
import { decode } from '../src/adapters/claude-code.mjs';
import { main } from '../bin/agent-guardrails.mjs';

export const commands = [
  'git status', 'git diff --stat', 'npm test', 'git status && npm test',
  'git push', 'git reset --hard', 'curl https://example.invalid', 'rm -rf node_modules',
];

/** Nearest-rank percentiles. @param {number[]} samples */
export function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: sorted.length,
    medianMs: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    meanMs: sorted.reduce((a, b) => a + b, 0) / sorted.length,
  };
}

/** @param {string[]} [args] */
export async function benchmark(args = []) {
  const config = resolveConfig();
  const cwd = process.cwd();
  const payloads = commands.map(command => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd }));
  const contexts = payloads.map(payload => decode(payload, { projectRoot: cwd, home: cwd }));
  for (let i = 0; i < 200; i++) { evaluate(contexts[i % contexts.length], config); }
  const core = [];
  for (let i = 0; i < 1000; i++) {
    const start = performance.now();
    evaluate(contexts[i % contexts.length], config);
    core.push(performance.now() - start);
  }
  const stats = summarize(core);
  const metadata = { node: process.version, platform: process.platform, cpu: os.cpus()[0]?.model, syntheticCommands: commands.length, coreMedianMs: stats.medianMs, coreMeanMs: stats.meanMs, coreP95Ms: stats.p95Ms, coreBudgetMs: 10, coreSamples: stats.count };
  if (args.includes('--core-only')) { return { ...metadata, processLatency: 'not measured' }; }

  // Full CLI hook path: stdin, config I/O, evaluation and wire encoding.
  // Same-process timing excludes fresh Node process startup.
  const hook = [];
  const inputs = payloads.map(p => JSON.stringify(p));
  /** @param {number} index */
  async function invoke(index) {
    const status = await main(['hook'], {
      stdin: (async function* () { yield inputs[index % inputs.length]; })(), cwd: () => cwd,
      stdout: { write: () => {} }, stderr: { write: () => {} },
    });
    if (status !== 0) { throw new Error('Benchmark hook failed'); }
  }
  for (let i = 0; i < 200; i++) { await invoke(i); }
  for (let i = 0; i < 1000; i++) {
    const start = performance.now();
    await invoke(i);
    hook.push(performance.now() - start);
  }
  const result = { ...metadata, hook: summarize(hook), processLatency: 'not measured (use --process)' };
  if (!args.includes('--process')) { return result; }
  const processes = [];
  for (let i = 0; i < 1000; i++) {
    const start = performance.now();
    const child = spawnSync(process.execPath, ['bin/agent-guardrails.mjs', 'hook'], { input: inputs[i % inputs.length], encoding: 'utf8', windowsHide: true });
    if (child.error || child.status !== 0) {
      const code = /** @type {NodeJS.ErrnoException | undefined} */ (child.error)?.code ?? child.status ?? 'unknown';
      throw new Error(`Benchmark process could not run (${code}); no process latency claim can be made.`);
    }
    processes.push(performance.now() - start);
  }
  return { ...result, processLatency: 'measured', process: summarize(processes) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await benchmark(process.argv.slice(2));
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.coreP95Ms > result.coreBudgetMs ? 1 : 0;
}
