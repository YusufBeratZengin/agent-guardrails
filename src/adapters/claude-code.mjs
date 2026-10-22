import path from 'node:path';
import { isObject } from '../util.mjs';

/** This module alone owns the Claude Code wire contract.
 * @param {unknown} payload @param {{projectRoot: string, home: string}} options
 * @returns {import('../types.mjs').Context} */
export function decode(payload, options) {
  if (!isObject(payload) || payload.hook_event_name !== 'PreToolUse' || typeof payload.tool_name !== 'string' || !payload.tool_name || !isObject(payload.tool_input) || typeof payload.cwd !== 'string' || !(path.posix.isAbsolute(payload.cwd) || path.win32.isAbsolute(payload.cwd))) {
    throw new Error('Expected a PreToolUse object with tool_name, tool_input, and absolute cwd');
  }
  return { toolName: payload.tool_name, input: payload.tool_input, cwd: payload.cwd, ...options };
}

/** Omit permissionDecision on pass/warn to retain the host's permission checks.
 * @param {import('../types.mjs').Result} result @returns {Record<string, unknown>} */
export function encode(result) {
  const reason = result.findings.slice(0, 20).map(f => `[${f.ruleId}:${f.code}] ${f.message}`).join(' ');
  if (result.decision === 'deny' || result.decision === 'ask') {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: result.decision, permissionDecisionReason: reason } };
  }
  return result.decision === 'warn' ? { systemMessage: reason } : {};
}

/** @returns {{exitCode: number, stderr: string}} */
export function failure() {
  return { exitCode: 2, stderr: 'agent-guardrails: hook input, configuration, or audit processing failed; action blocked.\n' };
}

/** Broad matcher includes PowerShell and MCP tools. No npx/network at hook time. */
export function settingsSnippet() {
  return { hooks: { PreToolUse: [{ matcher: '.*', hooks: [{ type: 'command', command: 'agent-guardrails hook' }] }] } };
}
