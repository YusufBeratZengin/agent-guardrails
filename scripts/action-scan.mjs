import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { scanGitChanges } from '../src/git-scan.mjs';
import { sarif } from '../src/sarif.mjs';
import { defaults } from '../src/defaults.mjs';

/** @param {NodeJS.ProcessEnv} env */
export function revisions(env) {
  if (env.GUARDRAILS_BASE || env.GUARDRAILS_HEAD) {
    if (!env.GUARDRAILS_BASE || !env.GUARDRAILS_HEAD) { throw new Error('Both revisions required'); }
    return { base: env.GUARDRAILS_BASE, head: env.GUARDRAILS_HEAD };
  }
  if (env.GITHUB_EVENT_NAME !== 'pull_request' || !env.GITHUB_EVENT_PATH) { throw new Error('Expected pull_request or explicit revisions'); }
  const event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  return { base: event.pull_request?.base?.sha, head: event.pull_request?.head?.sha };
}

/** @param {NodeJS.ProcessEnv} [env] @param {typeof scanGitChanges} [scanner] */
export function run(env = process.env, scanner = scanGitChanges) {
  try {
    const refs = revisions(env);
    if (typeof refs.base !== 'string' || typeof refs.head !== 'string') { throw new Error('Missing revisions'); }
    const cwd = path.resolve(env.GITHUB_WORKSPACE || process.cwd(), env.GUARDRAILS_WORKING_DIRECTORY || '.');
    const results = scanner({ cwd, ...refs });
    const report = path.join(env.RUNNER_TEMP || os.tmpdir(), `agent-guardrails-${randomUUID()}.sarif`);
    fs.writeFileSync(report, JSON.stringify(sarif(results, cwd, defaults.rules.secrets), null, 2) + '\n', { mode: 0o600 });
    if (env.GITHUB_OUTPUT) { fs.appendFileSync(env.GITHUB_OUTPUT, `sarif-file=${report}\nfiles-with-findings=${results.length}\n`); }
    console.log(`agent-guardrails: ${results.length} changed file(s) with findings. Content redacted.`);
    return results.length ? 1 : 0;
  } catch {
    console.error('agent-guardrails: PR scan failed; fetch both commit SHAs and their merge base. No input values are echoed.');
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { process.exitCode = run(); }
