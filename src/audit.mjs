import fs from 'node:fs';
import path from 'node:path';

/** Only fixed policy metadata is stored, never raw input, tool names, cwd,
 * paths, session ids, detector-provided values, or secret suffixes.
 * @param {import('./types.mjs').Result} result @param {import('./types.mjs').Config} config @param {string} projectRoot */
export function audit(result, config, projectRoot) {
  if (!config.audit.enabled) { return; }
  const row = {
    timestamp: new Date().toISOString(), decision: result.decision,
    findings: result.findings.map(f => ({ ruleId: f.ruleId, code: f.code, mode: f.mode, preview: '[REDACTED]' })),
  };
  // No directory creation: configure an existing private directory. Refuse an
  // existing symlink; O_NOFOLLOW is additionally effective on POSIX.
  const file = path.resolve(projectRoot, config.audit.path);
  try { if (fs.lstatSync(file).isSymbolicLink()) { throw new Error('Audit symlink refused'); } }
  catch (error) { if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') { throw error; } }
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
  try { fs.writeSync(fd, `${JSON.stringify(row)}\n`); } finally { fs.closeSync(fd); }
}
