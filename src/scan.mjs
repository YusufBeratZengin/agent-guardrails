import fs from 'node:fs';
import path from 'node:path';
import { scanSecrets } from './guards/secrets.mjs';

/** Stream results one file at a time, skip symlinks and common generated dirs.
 * Explicit file arguments are always scanned. Never silently skip large files.
 * @param {string} target @param {import('./types.mjs').SecretsRule} rule
 * @returns {{file: string, findings: import('./types.mjs').Finding[]}[]} */
export function scan(target, rule) {
  /** @type {{file: string, findings: import('./types.mjs').Finding[]}[]} */
  const results = [];
  /** @param {string} file */
  function visit(file) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) { return; }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(file).sort()) {
        if (!['.git', 'node_modules', 'coverage', '.tmp-test', 'is'].includes(entry)) { visit(path.join(file, entry)); }
      }
    } else if (stat.isFile()) {
      // Bounded memory and overlap preserve tokens/assignments across chunks.
      const fd = fs.openSync(file, 'r');
      const buffer = Buffer.alloc(64 * 1024);
      let tail = '';
      /** @type {Map<string, import('./types.mjs').Finding>} */
      const byCode = new Map();
      try {
        let count;
        while ((count = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
          const text = tail + buffer.subarray(0, count).toString('utf8');
          for (const f of scanSecrets(text, rule)) { byCode.set(f.code, f); }
          tail = text.slice(-8192);
        }
      } finally { fs.closeSync(fd); }
      if (byCode.size) { results.push({ file, findings: [...byCode.values()] }); }
    }
  }
  visit(path.resolve(target));
  return results;
}
