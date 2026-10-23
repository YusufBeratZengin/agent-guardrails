import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { scanSecrets } from './guards/secrets.mjs';
import { defaults } from './defaults.mjs';

/** Read Git objects only: never check out or execute PR files, hooks or scripts.
 * Bound each Git response; exceeding the bound fails rather than skipping data.
 * @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) { throw new Error('Git object scan failed'); }
  return result.stdout;
}

/** Scan full head blobs of regular files changed since the merge base.
 * Defaults are intentional: untrusted PR config cannot disable CI detection.
 * @param {{cwd: string, base: string, head: string}} options
 * @param {(cwd: string, args: string[]) => string} [readGit]
 * @returns {{file: string, findings: import('./types.mjs').Finding[]}[]} */
export function scanGitChanges({ cwd, base, head }, readGit = git) {
  if (![base, head].every(ref => [40, 64].includes(ref.length) && /^[a-f0-9]+$/i.test(ref))) { throw new Error('Expected full commit SHAs'); }
  const ancestor = readGit(cwd, ['merge-base', base, head]).trim();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(ancestor)) { throw new Error('Invalid merge base'); }
  const raw = readGit(cwd, ['diff', '--no-ext-diff', '--no-textconv', '--raw', '--no-abbrev', '--no-renames', '-z', ancestor, head, '--']);
  const fields = raw.split('\0');
  if (fields.pop() !== '' || fields.length % 2 !== 0) { throw new Error('Incomplete Git diff records'); }
  const results = [];
  for (let i = 0; i < fields.length; i += 2) {
    const header = fields[i].match(/^:\d{6} (\d{6}) [a-f0-9]+ ([a-f0-9]+) ([A-Z])$/i);
    const file = fields[i + 1];
    if (!header || !file) { throw new Error('Invalid Git diff record'); }
    // Deleted paths, symlinks and submodules have no regular file body to scan.
    if (!/^100(?:644|755)$/.test(header[1])) { continue; }
    const absolute = path.resolve(cwd, file);
    const relative = path.relative(cwd, absolute);
    if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) { throw new Error('Invalid Git path'); }
    const text = readGit(cwd, ['cat-file', 'blob', header[2]]);
    const findings = scanSecrets(text, defaults.rules.secrets);
    if (findings.length) { results.push({ file: absolute, findings }); }
  }
  return results;
}
