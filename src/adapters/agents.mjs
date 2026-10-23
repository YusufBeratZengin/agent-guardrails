import path from 'node:path';
import { decode as claudeDecode, encode as claudeEncode } from './claude-code.mjs';
import { isObject } from '../util.mjs';

/** @typedef {'claude-code'|'codex'|'gemini'|'cursor'} Agent */
/** @param {unknown} payload @param {Agent} agent
 * @param {{projectRoot: string, home: string}} options
 * @returns {import('../types.mjs').Context} */
export function decode(payload, agent, options) {
  if (agent === 'claude-code') { return claudeDecode(payload, options); }
  const event = agent === 'gemini' ? 'BeforeTool' : agent === 'cursor' ? 'preToolUse' : 'PreToolUse';
  if (!isObject(payload) || payload.hook_event_name !== event || typeof payload.tool_name !== 'string' || !payload.tool_name || !isObject(payload.tool_input)) {
    throw new Error('Invalid agent hook payload');
  }
  const input = { ...payload.tool_input };
  let name = payload.tool_name;
  let cwd = payload.cwd;
  if (agent === 'gemini') {
    const names = { run_shell_command: 'Bash', write_file: 'Write', replace: 'Edit', read_file: 'Read', grep_search: 'Grep', search_file_content: 'Grep', glob: 'Glob' };
    name = names[/** @type {keyof typeof names} */ (name)] ?? (name.startsWith('mcp_') ? `mcp__${name.slice(4)}` : name);
    if (name === 'Bash' && input.dir_path !== undefined) {
      if (typeof input.dir_path !== 'string' || typeof cwd !== 'string') { throw new Error('Invalid shell directory'); }
      const api = cwd.startsWith('/') ? path.posix : path.win32;
      cwd = api.resolve(options.projectRoot, input.dir_path);
    }
    if ((name === 'Grep' || name === 'Glob') && typeof input.dir_path === 'string') { input.path = input.dir_path; }
  }
  if (agent === 'cursor') {
    if (name === 'Shell') {
      name = 'Bash';
      if (input.working_directory !== undefined) { cwd = input.working_directory; }
    }
    if (name.startsWith('MCP:')) { name = `mcp__${name.slice(4)}`; }
  }
  if (agent === 'codex' && name === 'apply_patch') {
    // Scan the entire patch as content. Do not pretend patch text is a shell command.
    name = 'Edit';
    // Lexical patch paths cover the documented apply_patch wire representation.
    if (typeof input.command === 'string') {
      input.edits = [...input.command.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)\r?$/gm)].map(m => ({ file_path: m[1].trim() }));
    }
  }
  if (input.file_path === undefined && typeof input.path === 'string') { input.file_path = input.path; }
  if (typeof cwd !== 'string' || !(path.posix.isAbsolute(cwd) || path.win32.isAbsolute(cwd))) { throw new Error('Expected absolute hook cwd'); }
  return { toolName: name, input, cwd, ...options };
}

/** These generic hook contracts have no equivalent interactive ask decision.
 * @param {import('../types.mjs').Result} result @param {Agent} agent */
export function encode(result, agent) {
  if (agent === 'claude-code') { return claudeEncode(result); }
  const blocked = result.decision === 'ask' || result.decision === 'deny';
  const reason = result.findings.slice(0, 20).map(f => `[${f.ruleId}:${f.code}] ${f.message}`).join(' ');
  const message = (result.decision === 'ask' ? 'Approval required; this adapter blocks ask decisions. ' : '') + reason;
  if (agent === 'codex') {
    return blocked ? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: message } } : claudeEncode(result);
  }
  if (agent === 'gemini') { return blocked ? { decision: 'deny', reason: message } : result.decision === 'warn' ? { systemMessage: message } : {}; }
  // Cursor requires a permission field. This only permits continuation through
  // this hook; keep the host's own permissions and sandbox enabled.
  return { permission: blocked ? 'deny' : 'allow', ...(reason ? { user_message: message, agent_message: message } : {}) };
}
