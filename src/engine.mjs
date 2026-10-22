import { secrets } from './guards/secrets.mjs';
import { destructive } from './guards/destructive.mjs';
import { outbound } from './guards/outbound.mjs';
import { pii } from './guards/pii.mjs';
import { protectPaths } from './guards/protect-paths.mjs';

/** Pure policy engine; deny > ask > warn > pass. Clean calls never auto-approve.
 * @param {import('./types.mjs').Context} ctx @param {import('./types.mjs').Config} config
 * @param {import('./types.mjs').PiiDetector[]} [plugins] @returns {import('./types.mjs').Result} */
export function evaluate(ctx, config, plugins = []) {
  const r = config.rules;
  /** @type {[import('./types.mjs').Rule, () => import('./types.mjs').Finding[]][]} */
  const checks = [
    [r.secrets, () => secrets(ctx, r.secrets)],
    [r.destructive, () => destructive(ctx, r.destructive)],
    [r.outbound, () => outbound(ctx, r.outbound)],
    [r.pii, () => pii(ctx, r.pii, r.outbound, plugins)],
    [r['protect-paths'], () => protectPaths(ctx, r['protect-paths'])],
  ];
  const seen = new Set();
  const findings = checks.flatMap(([rule, check]) => rule.mode === 'off' ? [] : check().map(f => ({ ...f, mode: f.mode === 'ask' && rule.mode === 'deny' ? 'ask' : rule.mode }))).filter(f => {
    const key = `${f.ruleId}:${f.code}`;
    if (seen.has(key)) { return false; }
    seen.add(key); return true;
  });
  const decision = findings.some(f => f.mode === 'deny') ? 'deny' : findings.some(f => f.mode === 'ask') ? 'ask' : findings.length ? 'warn' : 'pass';
  return { decision, findings };
}
