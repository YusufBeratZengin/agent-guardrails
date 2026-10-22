/** @param {unknown} value @returns {value is Record<string, unknown>} */
export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Literal, case-insensitive glob: only * and ? have special meaning.
 * @param {string} value @param {string} pattern */
export function glob(value, pattern) {
  const input = value.toLowerCase();
  const match = pattern.toLowerCase();
  let i = 0; let p = 0; let star = -1; let retry = 0;
  while (i < input.length) {
    if (match[p] === '?' || match[p] === input[i]) { i++; p++; }
    else if (match[p] === '*') { star = p++; retry = i; }
    else if (star >= 0) { p = star + 1; i = ++retry; }
    else { return false; }
  }
  while (match[p] === '*') { p++; }
  return p === match.length;
}

/** @param {import('./types.mjs').RuleId} ruleId @param {string} code @param {string} message @returns {import('./types.mjs').Finding} */
export function finding(ruleId, code, message) {
  // Never return fragments of the input, even when a detector misses another value.
  return { ruleId, code, message, preview: '[REDACTED]' };
}

/** @param {unknown} value @param {number} [depth] @returns {string[]} */
export function strings(value, depth = 0) {
  if (depth > 32) { throw new Error('Input nesting limit exceeded'); }
  if (typeof value === 'string') { return [value]; }
  if (Array.isArray(value)) { return value.flatMap(v => strings(v, depth + 1)); }
  if (isObject(value)) { return Object.entries(value).flatMap(([k, v]) => [k, ...strings(v, depth + 1)]); }
  return [];
}

/** @param {import('./types.mjs').Context} ctx */
export function command(ctx) {
  return /^(Bash|PowerShell)$/i.test(ctx.toolName) && typeof ctx.input.command === 'string' ? ctx.input.command : '';
}

/** @param {import('./types.mjs').Context} ctx */
export function writePaths(ctx) {
  if (!/^(Write|Edit|MultiEdit|NotebookEdit)$/i.test(ctx.toolName)) { return []; }
  return [ctx.input.file_path, ctx.input.notebook_path].filter(v => typeof v === 'string');
}
