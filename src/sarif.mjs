import path from 'node:path';
import { scanSecrets } from './guards/secrets.mjs';

/** File-level SARIF: the scanner deduplicates by code and does not track lines.
 * Never include source snippets or credential-bearing filenames.
 * @param {{file: string, findings: import('./types.mjs').Finding[]}[]} results
 * @param {string} cwd @param {import('./types.mjs').SecretsRule} rule */
export function sarif(results, cwd, rule) {
  const codes = [...new Set(results.flatMap(r => r.findings.map(f => f.code)))].sort();
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: { driver: {
        name: 'agent-guardrails', version: '0.1.0',
        informationUri: 'https://github.com/YusufBeratZengin/agent-guardrails',
        rules: codes.map(code => ({ id: `secrets/${code}`, shortDescription: { text: `Potential ${code} detected.` } })),
      } },
      results: results.flatMap(r => {
        const relative = path.relative(cwd, r.file);
        const hidden = scanSecrets(relative, rule).length > 0;
        const uri = relative.split(path.sep).map(encodeURIComponent).join('/');
        return r.findings.map(f => ({
          ruleId: `secrets/${f.code}`, ruleIndex: codes.indexOf(f.code), level: 'error',
          message: { text: `Potential ${f.code} detected. Content redacted.` },
          ...(hidden ? {} : { locations: [{ physicalLocation: { artifactLocation: { uri, uriBaseId: '%SRCROOT%' } } }] }),
        }));
      }),
    }],
  };
}
