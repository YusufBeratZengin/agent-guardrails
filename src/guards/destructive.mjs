import { invocations } from '../commands.mjs';
import { broadPath } from '../paths.mjs';
import { command, finding } from '../util.mjs';

/** @param {string[]} words */
function recursiveTargets(words) {
  return words.slice(1).filter(w => !/^(-|\/s$|\/q$|\/f$)/i.test(w) && !/^(true|false)$/i.test(w));
}

/** Pure command evaluator. It never executes the inspected command.
 * @param {string} source @param {import('../types.mjs').Context} ctx @param {import('../types.mjs').DestructiveRule} rule */
export function inspectDestructive(source, ctx, rule) {
  const calls = invocations(source);
  const changesDirectory = calls.some(w => /^(cd|chdir|pushd|set-location)$/i.test(w[0])) || /\bgit\s+.*(?:-C|--work-tree)/i.test(source);
  /** @type {import('../types.mjs').Finding[]} */
  const found = [];
  /** @param {string} code @param {string} message */
  const add = (code, message) => found.push(finding('destructive', code, message));
  const expiresReflog = calls.some(w => w[0] === 'git' && w[1] === 'reflog' && w[2] === 'expire' && (w.includes('--expire=now') || (w.includes('--expire') && w[w.indexOf('--expire') + 1] === 'now')));
  const prunesNow = calls.some(w => w[0] === 'git' && w[1] === 'gc' && (w.includes('--prune=now') || (w.includes('--prune') && w[w.indexOf('--prune') + 1] === 'now')));
  if (expiresReflog && prunesNow) { add('git-recovery-delete', 'Expiring reflogs and pruning now removes recovery data.'); }
  for (const words of calls) {
    const [exe, sub, ...args] = words;
    const lower = words.map(w => w.toLowerCase());
    if (words.includes('--help') || words.includes('--version')) { continue; }
    if (exe.toLowerCase() === 'git') {
      if (sub === 'reset' && args.some(a => a === '--hard' || a.startsWith('--hard='))) { add('git-reset-hard', 'Hard reset discards work.'); }
      if (sub === 'clean' && args.some(a => /^-[^-]*f/.test(a) || a === '--force') && !args.some(a => a === '--dry-run' || /^-[^-]*n/.test(a))) { add('git-clean', 'Forced clean deletes untracked work.'); }
      if (sub === 'push' && args.some(a => a === '--force' || a === '--mirror' || a === '-f' || /^-[^-]*f/.test(a) || a.startsWith('--force=') || a.startsWith('+') || (!rule.allowForceWithLease && a.startsWith('--force-with-lease')))) { add('git-force-push', 'Force push can overwrite shared history.'); }
      if (sub === 'checkout' && args.includes('--') && args.slice(args.indexOf('--') + 1).some(a => ['.', ':/', '*'].includes(a))) { add('git-checkout-all', 'Checkout discards working tree changes.'); }
      if (sub === 'stash' && args.some(a => a === 'drop' || a === 'clear')) { add('git-stash-delete', 'Deleting stashes discards saved work.'); }
      if (sub === 'branch' && args.some(a => ['main', 'master', 'trunk'].includes(a)) && (args.some(a => /^-[^-]*D/.test(a)) || (args.some(a => a === '--delete' || /^-[^-]*d/.test(a)) && args.some(a => a === '--force' || /^-[^-]*f/.test(a))))) { add('git-primary-branch-delete', 'Force deleting a primary branch discards its reference.'); }
      if (sub === 'update-ref' && args.some(a => a === '-d' || a === '--delete')) { add('git-update-ref-delete', 'Deleting a Git reference can discard recovery pointers.'); }
    }
    if (exe === 'docker' && sub === 'system' && args[0] === 'prune' && args.some(a => a === '--all' || /^-[^-]*a/.test(a))) { add('docker-system-prune', 'Pruning all Docker data removes unused images and containers.'); }
    if (exe === 'docker' && sub === 'volume' && args[0] === 'prune' && args.some(a => a === '--force' || /^-[^-]*f/.test(a))) { add('docker-volume-prune', 'Forced Docker volume pruning deletes persistent data.'); }
    if (exe === 'dd' && words.some(w => /^of=\/dev\/(?!null$|zero$|random$|urandom$|full$|tty$|std(?:in|out|err)$|fd\/).+/.test(w))) { add('disk-overwrite', 'Writing directly to a device can destroy disk data.'); }
    if (/^mkfs/.test(exe)) { add('filesystem-format', 'Formatting a filesystem destroys existing data.'); }
    if (exe === 'shred') { add('file-shred', 'Shredding irreversibly overwrites file data.'); }
    if (exe === 'truncate') {
      const targets = [];
      let zero = false;
      for (let i = 1; i < words.length; i++) {
        const w = words[i];
        if (w === '-s' || w === '--size') { zero ||= /^0(?:[kKmMgGtTpPeEzZyY]B?)?$/.test(words[++i] ?? ''); }
        else if (/^(?:-s|--size=)0(?:[kKmMgGtTpPeEzZyY]B?)?$/.test(w)) { zero = true; }
        else if (!w.startsWith('-')) { targets.push(w); }
      }
      if (zero && (!targets.length || changesDirectory || targets.some(p => broadPath(p, ctx)))) { add('external-truncate', 'Truncating a broad, external, or unresolved path destroys file data.'); }
    }
    if (words.some((w, i) => w === '>' && /^\/dev\/sd[^/]*$/.test(words[i + 1] ?? ''))) { add('disk-redirection', 'Redirecting output to a disk device destroys data.'); }
    // PowerShell accepts any unambiguous parameter prefix: -r, -rec, -Recurse.
    const psRecurse = /^-r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?(?::\$?true)?$/i;
    const rm = (/^(rm|rmdir)$/i.test(exe) && lower.some(a => /^-[^-]*r/i.test(a) || a === '--recursive'))
      || (/^(rd|rmdir)$/i.test(exe) && lower.includes('/s'));
    const ps = /^(remove-item|ri|del|erase|rd|rmdir|rm)$/i.test(exe) && lower.some(a => psRecurse.test(a));
    if (/^find$/i.test(exe) && lower.includes('-delete')) {
      const stop = lower.findIndex((a, i) => i > 0 && /^[-!]/.test(a));
      const roots = words.slice(1, stop < 0 ? undefined : stop);
      if (!roots.length || changesDirectory || roots.some(p => broadPath(p, ctx))) { add('broad-recursive-delete', 'Recursive deletion targets a broad, external, or unresolved path.'); }
    }
    if (/^(del|erase)$/i.test(exe) && lower.includes('/s')) { add('windows-recursive-delete', 'Recursive del requires review.'); }
    if (rm || ps) {
      const targets = recursiveTargets(words);
      if (!targets.length || changesDirectory || targets.some(p => broadPath(p, ctx))) { add('broad-recursive-delete', 'Recursive deletion targets a broad, external, or unresolved path.'); }
    }
    if (/^chmod$/i.test(exe) && words.some(a => /^-[^-]*R/.test(a) || a === '--recursive') && words.includes('777')) { add('chmod-world-writable', 'Recursive mode 777 makes files writable by everyone.'); }
  }
  // Includes literal shell wrappers. Quoted examples can conservatively match.
  const fetcher = String.raw`(?:curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod|new-object\s+net\.webclient)`;
  const pipeline = [
    // curl ... | sh
    String.raw`\b(?:curl|wget)\b[^\n;]*\|\s*(?:(?:sudo|env)\s+)*(?:\/(?:usr\/)?bin\/)?(?:ba|da|z|k)?sh\b`,
    // bash <(curl ...), sh -c "$(curl ...)", eval "$(wget ...)", source <(curl ...)
    String.raw`\b(?:(?:ba|da|z|k)?sh|eval|source)\b[^\n;|&]*(?:<\(|\$\(|\x60)\s*` + fetcher + String.raw`\b`,
    // iwr ... | iex, irm ... | Invoke-Expression
    String.raw`\b` + fetcher + String.raw`\b[^\n;]*\|\s*(?:iex|invoke-expression)\b`,
    // iex (irm ...), iex (New-Object Net.WebClient).DownloadString(...)
    String.raw`\b(?:iex|invoke-expression)\b[^\n;|]*` + fetcher + String.raw`\b`,
  ];
  if (pipeline.some(p => new RegExp(p, 'i').test(source))) { add('download-execute', 'Piping a download into a shell executes unreviewed code.'); }
  return found;
}

/** @param {import('../types.mjs').Context} ctx @param {import('../types.mjs').DestructiveRule} rule */
export function destructive(ctx, rule) {
  return inspectDestructive(command(ctx), ctx, rule);
}
