import { finding, strings } from '../util.mjs';
import { isExternal } from './outbound.mjs';
import { generic } from '../detectors/generic.mjs';

/** Programmatic locale plugins must be trusted local code, never loaded from JSON.
 * @param {string} text @param {import('../types.mjs').PiiDetector[]} detectors */
export function detectPii(text, detectors) {
  return detectors.flatMap(detector => detector.detect(text).map(() => finding('pii', 'personal-data', 'Potential personal data in external tool content.')));
}

/** @param {import('../types.mjs').Context} ctx @param {import('../types.mjs').PiiRule} rule
 * @param {import('../types.mjs').OutboundRule} outboundRule @param {import('../types.mjs').PiiDetector[]} [plugins] */
export function pii(ctx, rule, outboundRule, plugins = []) {
  const available = [generic, ...plugins];
  const detectors = rule.detectors.map(id => {
    const detector = available.find(d => d.id === id);
    if (!detector) { throw new Error('Unknown PII detector'); }
    return detector;
  });
  return isExternal(ctx, outboundRule) ? detectPii(strings(ctx.input).join('\n'), detectors) : [];
}
