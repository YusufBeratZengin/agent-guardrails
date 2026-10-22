#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { isObject } from '../src/util.mjs';
import { loadConfig } from '../src/config.mjs';
import { evaluate } from '../src/engine.mjs';
import { decode, encode, failure, settingsSnippet } from '../src/adapters/claude-code.mjs';
import { writeSettings } from '../src/init.mjs';
import { audit } from '../src/audit.mjs';
import { scan } from '../src/scan.mjs';
import { explanations } from '../src/explain.mjs';
import { scanSecrets } from '../src/guards/secrets.mjs';

const help = `agent-guardrails 0.1.0
  init [--write]     Print Claude settings; --write merges with backup
  hook               Read Claude PreToolUse JSON from stdin
  test '<json>'      Dry-run, redacted decision + Claude output (no audit)
  scan <path>        Scan secrets; exits 0 clean, 1 findings, 2 error
  explain <rule-id>  Explain a rule
  --help | --version
`;

/** @param {AsyncIterable<Buffer|string>} stdin */
async function readStdin(stdin) {
  /** @type {Buffer[]} */
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stdin) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 4 * 1024 * 1024) { throw new Error('Hook input size limit exceeded'); }
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** @typedef {{stdin: AsyncIterable<Buffer|string>, stdout: {write: (text: string) => unknown}, stderr: {write: (text: string) => unknown}, cwd: () => string, home?: string}} IO */
/** @param {string[]} args @param {IO} [io] @returns {Promise<number>} */
export async function main(args, io = { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr, cwd: () => process.cwd() }) {
  const [cmd, ...rest] = args;
  const print = (/** @type {unknown} */ value) => io.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);
  try {
    if (cmd === '--version' && !rest.length) { print('0.1.0'); return 0; }
    if ((!cmd || cmd === '--help') && !rest.length) { io.stdout.write(help); return 0; }
    if (cmd === 'init' && (rest.length === 0 || (rest.length === 1 && rest[0] === '--write'))) {
      print(rest.length ? writeSettings(io.cwd()) : settingsSnippet()); return 0;
    }
    if (cmd === 'explain' && rest.length === 1 && Object.hasOwn(explanations, rest[0])) {
      print(explanations[/** @type {keyof typeof explanations} */ (rest[0])]); return 0;
    }
    if ((cmd === 'hook' && !rest.length) || (cmd === 'test' && rest.length === 1)) {
      const raw = cmd === 'hook' ? await readStdin(io.stdin) : rest[0];
      if (Buffer.byteLength(raw) > 4 * 1024 * 1024) { throw new Error('Input size limit exceeded'); }
      const payload = JSON.parse(raw);
      if (!isObject(payload) || typeof payload.cwd !== 'string') { throw new Error('Invalid input'); }
      const { config, projectRoot, home } = loadConfig(payload.cwd, io.home);
      const result = evaluate(decode(payload, { projectRoot, home }), config);
      if (cmd === 'hook') { audit(result, config, projectRoot); }
      print(cmd === 'hook' ? encode(result) : { ...result, output: encode(result) }); return 0;
    }
    if (cmd === 'scan' && rest.length === 1) {
      const { config } = loadConfig(io.cwd(), io.home);
      // scan always checks secrets, even if hook mode is off/warn/ask.
      const results = scan(path.resolve(io.cwd(), rest[0]), config.rules.secrets);
      // File paths can themselves contain secrets: never echo them into output.
      print({ filesWithFindings: results.length, findings: results.map(r => {
        const relative = path.relative(io.cwd(), r.file);
        return { file: scanSecrets(relative, config.rules.secrets).length ? '[REDACTED PATH]' : relative, codes: r.findings.map(f => f.code), preview: '[REDACTED]' };
      }) });
      return results.length ? 1 : 0;
    }
    io.stderr.write(help); return 2;
  } catch {
    if (cmd === 'hook') { const error = failure(); io.stderr.write(error.stderr); return error.exitCode; }
    io.stderr.write('agent-guardrails: invalid input/configuration or local I/O failure. No input values are echoed.\n'); return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { process.exitCode = await main(process.argv.slice(2)); }
