import { command, finding, writePaths } from '../util.mjs';
import { normalizePath, within } from '../paths.mjs';
import { invocations } from '../commands.mjs';

/** Pure path check; filesystem aliases are outside this lexical check's scope.
 * @param {string[]} paths @param {import('../types.mjs').Context} ctx @param {import('../types.mjs').PathsRule} rule */
export function inspectPaths(paths, ctx, rule) {
  const protectedPaths = rule.paths.map(p => normalizePath(p, ctx.projectRoot, ctx.home));
  return paths.some(p => protectedPaths.some(parent => within(normalizePath(p, ctx.cwd, ctx.home), parent)))
    ? [finding('protect-paths', 'protected-write', 'A write targets a protected path.')] : [];
}

/** @param {import('../types.mjs').Context} ctx @param {import('../types.mjs').PathsRule} rule */
export function protectPaths(ctx, rule) {
  const paths = writePaths(ctx);
  const ancestors = [];
  for (const words of invocations(command(ctx))) {
    // Conservative literal targets for common mutators and redirection. Includes
    // source arguments of cp/mv to cover moving a protected source away.
    if (/^(rm|rmdir|del|erase|remove-item|ri|cp|copy|copy-item|mv|move|move-item|tee|out-file|set-content|add-content|touch|chmod|mkdir)$/i.test(words[0])) { paths.push(...words.slice(1)); }
    if (/^(rm|rmdir|del|erase|remove-item|ri|mv|move|move-item)$/i.test(words[0])) { ancestors.push(...words.slice(1).filter(w => !w.startsWith('-'))); }
    words.forEach((word, i) => { if (word === '>' && words[i + 1] && words[i + 1] !== '>') { paths.push(words[i + 1]); } });
  }
  const parentRemoval = ancestors.some(p => rule.paths.some(protectedPath => within(normalizePath(protectedPath, ctx.projectRoot, ctx.home), normalizePath(p, ctx.cwd, ctx.home))));
  return parentRemoval ? [finding('protect-paths', 'protected-write', 'A removal or move affects a protected path.')] : inspectPaths(paths, ctx, rule);
}
