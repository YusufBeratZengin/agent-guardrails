/**
 * @typedef {'deny'|'ask'|'warn'|'off'} Mode
 * @typedef {'secrets'|'destructive'|'outbound'|'pii'|'protect-paths'} RuleId
 * @typedef {{id: RuleId, mode: Mode}} Rule
 * @typedef {Rule & {entropyThreshold: number, minLength: number, allowValues: string[], allowReadPaths: string[]}} SecretsRule
 * @typedef {Rule & {allowForceWithLease: boolean}} DestructiveRule
 * @typedef {Rule & {toolPatterns: string[], commandPatterns: string[], allMcp: boolean}} OutboundRule
 * @typedef {Rule & {detectors: string[]}} PiiRule
 * @typedef {Rule & {paths: string[], askPaths: string[]}} PathsRule
 * @typedef {{rules: {secrets: SecretsRule, destructive: DestructiveRule, outbound: OutboundRule, pii: PiiRule, 'protect-paths': PathsRule}, audit: {enabled: boolean, path: string}}} Config
 * @typedef {{toolName: string, input: Record<string, unknown>, cwd: string, projectRoot: string, home: string}} Context
 * @typedef {{ruleId: RuleId, code: string, message: string, preview: string, mode?: Mode}} Finding
 * @typedef {Finding & {mode: Mode}} DecisionFinding
 * @typedef {{decision: 'deny'|'ask'|'warn'|'pass', findings: DecisionFinding[]}} Result
 * @typedef {{kind: string, index: number}} Detection
 * @typedef {{id: string, detect: (text: string) => Detection[]}} PiiDetector
 */
export {};
