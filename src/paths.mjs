import path from 'node:path';

/** @param {string} value */
const windows = value => /^[a-z]:|^\\\\|^\/\//i.test(value);

/** Pure, lexical normalization. No filesystem access or variable evaluation.
 * @param {string} value @param {string} cwd @param {string} home */
export function normalizePath(value, cwd, home) {
  let expanded = value.replace(/^~(?=$|[\\/])/, home)
    .replace(/^\$(?:HOME|\{HOME\}|env:USERPROFILE)(?=$|[\\/])/i, home)
    .replace(/^%USERPROFILE%(?=$|[\\/])/i, home);
  const win = windows(expanded) || windows(cwd);
  const api = win ? path.win32 : path.posix;
  expanded = expanded.replace(/\\/g, '/');
  const resolved = api.resolve(cwd, expanded).replace(/\\/g, '/').replace(/\/$/, '');
  return win ? resolved.toLowerCase() : resolved;
}

/** @param {string} candidate @param {string} parent */
export function within(candidate, parent) {
  return candidate === parent || candidate.startsWith(`${parent}/`);
}

/** @param {string} value @param {import('./types.mjs').Context} ctx */
export function broadPath(value, ctx) {
  if (!value || /[?*]|\$|%[^%]+%/.test(value)) { return true; }
  const target = normalizePath(value, ctx.cwd, ctx.home);
  const root = normalizePath(ctx.projectRoot, ctx.cwd, ctx.home);
  const home = normalizePath(ctx.home, ctx.cwd, ctx.home);
  return !within(target, root) || target === root || target === home || target === '' || /^[a-z]:$/i.test(target);
}
