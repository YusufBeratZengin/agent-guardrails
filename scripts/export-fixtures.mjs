#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { exportDecisionsJsonl, fixtures } from '../src/fixtures.mjs';

/**
 * Runs the fixture export CLI command.
 * Supports:
 *   node scripts/export-fixtures.mjs [--output <file>] [--category <category>] [--audit-format]
 * @param {string[]} [args]
 * @param {{stdout: {write: (text: string) => unknown}}} [io]
 * @returns {number}
 */
export function runExport(args = process.argv.slice(2), io = { stdout: process.stdout }) {
  let outputPath;
  let category = 'all';
  let auditFormat = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[++i];
    } else if (args[i] === '--category' && args[i + 1]) {
      category = args[++i];
    } else if (args[i] === '--audit-format') {
      auditFormat = true;
    }
  }

  const jsonl = exportDecisionsJsonl(fixtures, {
    category: /** @type {import('../src/types.mjs').FixtureCategory|'all'} */ (category),
    auditFormat,
    outputPath,
  });

  if (!outputPath) {
    io.stdout.write(jsonl);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runExport();
}
