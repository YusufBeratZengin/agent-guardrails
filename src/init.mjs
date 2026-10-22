import fs from 'node:fs';
import path from 'node:path';
import { settingsSnippet } from './adapters/claude-code.mjs';
import { isObject } from './util.mjs';

/** Merge without clobbering unrelated settings; backups use exclusive creation.
 * @param {string} cwd */
export function writeSettings(cwd) {
  const dir = path.join(cwd, '.claude');
  const target = path.join(dir, 'settings.json');
  if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) { throw new Error('Settings directory symlink refused'); }
  let original;
  /** @type {Record<string, unknown>} */
  let settings = {};
  try {
    if (fs.lstatSync(target).isSymbolicLink()) { throw new Error('Settings symlink refused'); }
    original = fs.readFileSync(target, 'utf8');
    const parsed = JSON.parse(original);
    if (!isObject(parsed)) { throw new Error('Invalid settings'); }
    settings = parsed;
  } catch (error) { if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') { throw new Error('Cannot safely read settings'); } }
  const hooks = settings.hooks === undefined ? {} : settings.hooks;
  if (!isObject(hooks)) { throw new Error('Invalid hooks object'); }
  const pre = hooks.PreToolUse === undefined ? [] : hooks.PreToolUse;
  if (!Array.isArray(pre)) { throw new Error('Invalid PreToolUse array'); }
  const entry = settingsSnippet().hooks.PreToolUse[0];
  const installed = pre.some(group => isObject(group) && group.matcher === entry.matcher && Array.isArray(group.hooks) && group.hooks.some(h => isObject(h) && h.type === 'command' && h.command === 'agent-guardrails hook'));
  if (installed) { return { changed: false, backup: false }; }
  const updated = { ...settings, hooks: { ...hooks, PreToolUse: [...pre, entry] } };
  fs.mkdirSync(dir, { recursive: true });
  if (original !== undefined) { fs.writeFileSync(`${target}.bak.${Date.now()}`, original, { flag: 'wx', mode: 0o600 }); }
  // Write in place only after backup. Failures remain visible to the caller.
  fs.writeFileSync(target, `${JSON.stringify(updated, null, 2)}\n`, { flag: original === undefined ? 'wx' : 'w', mode: 0o600 });
  return { changed: true, backup: original !== undefined };
}
