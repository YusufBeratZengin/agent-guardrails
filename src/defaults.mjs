/** @type {import('./types.mjs').Config} */
export const defaults = {
  rules: {
    secrets: { id: 'secrets', mode: 'deny', entropyThreshold: 3.5, minLength: 20, allowValues: [], allowReadPaths: [] },
    destructive: { id: 'destructive', mode: 'deny', allowForceWithLease: true },
    outbound: {
      id: 'outbound', mode: 'ask', allMcp: false,
      toolPatterns: ['*send*', '*publish*', '*create_post*', '*merge*', '*deploy*', '*purchase*', '*payment*', '*charge*', '*spend*'],
      commandPatterns: ['git push*', 'gh pr create*', 'gh pr merge*', 'gh release create*', 'npm publish*', 'npm unpublish*', 'pnpm publish*', 'yarn npm publish*', 'twine upload*', 'docker push*', 'cargo publish*', 'vercel*', 'netlify deploy*', 'curl*', 'wget*', 'Invoke-WebRequest*', 'Invoke-RestMethod*'],
    },
    pii: { id: 'pii', mode: 'off', detectors: ['generic'] },
    'protect-paths': { id: 'protect-paths', mode: 'deny', paths: ['~/.ssh', '~/.aws', '~/.gnupg'], askPaths: ['.agent-guardrails.json', '~/.agent-guardrails.json'] },
  },
  audit: { enabled: false, path: '.agent-guardrails.audit.jsonl' },
};
