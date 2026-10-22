import { command, finding, glob } from '../util.mjs';
import { invocations } from '../commands.mjs';

/** @param {import('../types.mjs').Context} ctx @param {import('../types.mjs').OutboundRule} rule */
export function isExternal(ctx, rule) {
  return ctx.toolName.startsWith('mcp__') || rule.toolPatterns.some(p => glob(ctx.toolName, p)) || invocations(command(ctx)).some(words => rule.commandPatterns.some(p => glob(words.join(' '), p)));
}

/** @param {import('../types.mjs').Context} ctx @param {import('../types.mjs').OutboundRule} rule */
export function outbound(ctx, rule) {
  const tool = (rule.allMcp && ctx.toolName.startsWith('mcp__')) || rule.toolPatterns.some(p => glob(ctx.toolName, p));
  const shell = invocations(command(ctx)).some(words => rule.commandPatterns.some(p => glob(words.join(' '), p)));
  return tool || shell ? [finding('outbound', 'human-confirmation', 'Outbound action requires human confirmation for this invocation.')] : [];
}
