import { command, finding, glob, strings } from '../util.mjs';
import { normalizePath } from '../paths.mjs';
import { invocations } from '../commands.mjs';

/** @param {string} value */
export function entropy(value) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const c of value) { counts.set(c, (counts.get(c) ?? 0) + 1); }
  let total = 0;
  for (const n of counts.values()) { const p = n / value.length; total -= p * Math.log2(p); }
  return total;
}

/** @param {string} value @param {string[]} allowValues */
export function placeholder(value, allowValues = []) {
  return allowValues.includes(value) || /^(?:x+|\*+|0+|<[^>]+>|\$\{[^}]+\}|\$[a-z_][\w]*|(?:your[-_ ]?|example[-_ ]?|placeholder|dummy|changeme|replace[-_ ]?me|test[-_ ]?key)[\w .<>-]*)$/i.test(value);
}

/** @type {[string, RegExp][]} */
const formats = [
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g],
  ['anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{20,255}/g],
  ['openai-key', /\bsk-(?:(?:proj|svcacct)-)?[A-Za-z0-9_-]{20,255}/g],
  ['google-key', /\bAIza[A-Za-z0-9_-]{35}\b/g],
  ['private-key', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{7,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
];

/** Pure content scanner. Returned objects never contain the matched value.
 * @param {string} text @param {import('../types.mjs').SecretsRule} rule */
export function scanSecrets(text, rule) {
  /** @type {import('../types.mjs').Finding[]} */
  const found = [];
  for (const [code, pattern] of formats) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0];
      const suffix = value.replace(/^(?:AKIA|ASIA|gh[pousr]_|github_pat_|sk-ant-|sk-(?:(?:proj|svcacct)-)?|AIza)/, '');
      if (!placeholder(value, rule.allowValues) && !placeholder(suffix, [])) {
        found.push(finding('secrets', code, `Potential ${code} detected.`)); break;
      }
    }
  }
  const assignments = /["']?\b([a-z_][\w.-]*(?:key|token|secret|password|passwd)|(?:key|token|secret|password|passwd))["']?\s*[:=]\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s;,&|}]+))/gi;
  for (const match of text.matchAll(assignments)) {
    const value = match[2] ?? match[3] ?? match[4];
    if (value.length >= rule.minLength && !placeholder(value, rule.allowValues) && entropy(value) >= rule.entropyThreshold) {
      found.push(finding('secrets', 'high-entropy-assignment', 'Potential high-entropy credential assignment detected.')); break;
    }
  }
  return found;
}

/** @param {string} file */
export function sensitivePath(file) {
  const normalized = file.replace(/\\/g, '/').toLowerCase();
  return /(?:^|\/)\.env[^/]*$|(?:^|\/)id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$|(?:^|\/)(?:credentials(?:\.json)?|service-account[^/]*\.json|\.netrc|\.npmrc|\.pypirc)$|(?:^|\/)\.(?:aws|ssh|gnupg)(?:\/|$)|(?:^|\/)gcloud\/(?:application_default_credentials\.json|credentials\.db)$/.test(normalized);
}

/** Pure guard adapter for normalized Claude input.
 * @param {import('../types.mjs').Context} ctx @param {import('../types.mjs').SecretsRule} rule */
export function secrets(ctx, rule) {
  const shell = command(ctx);
  const content = shell || (/^(Write|Edit|MultiEdit|NotebookEdit)$/i.test(ctx.toolName) || ctx.toolName.startsWith('mcp__') ? strings(ctx.input).join('\n') : '');
  const found = scanSecrets(content, rule);
  /** @type {string[]} */
  let paths = [];
  if (/^(Read|Grep|Glob)$/i.test(ctx.toolName)) {
    paths = [ctx.input.file_path, ctx.input.path, ctx.input.pattern].filter(v => typeof v === 'string');
  }
  if (shell) {
    // Any literal credential-path argument is conservative evidence of a read.
    paths.push(...invocations(shell).flatMap(words => words.slice(1)));
  }
  for (const file of paths) {
    const normalized = normalizePath(file, ctx.cwd, ctx.home);
    if (sensitivePath(file) && !rule.allowReadPaths.some(p => glob(normalized, normalizePath(p, ctx.projectRoot, ctx.home)))) {
      found.push(finding('secrets', 'credential-read', 'Reading a credential path requires an explicit allowlist entry.')); break;
    }
  }
  return found;
}
