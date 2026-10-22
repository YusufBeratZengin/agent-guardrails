import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { defaults } from './defaults.mjs';
import { isObject } from './util.mjs';

/** @param {Record<string, unknown>} base @param {Record<string, unknown>} overlay @returns {Record<string, unknown>} */
function merge(base, overlay) {
  const result = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) { throw new Error('Unsafe configuration key'); }
    result[key] = isObject(value) && isObject(base[key]) ? merge(base[key], value) : value;
  }
  return result;
}

/** Validate against the default shape without a runtime schema dependency.
 * JSON Schema is shipped separately for editor tooling.
 * @param {Record<string, unknown>} config @param {Record<string, unknown>} shape @param {boolean} [root] */
function validateShape(config, shape, root = false) {
  for (const key of Object.keys(config)) {
    if (key === '$schema' && root && typeof config[key] === 'string') { continue; }
    if (!Object.hasOwn(shape, key)) { throw new Error('Unknown configuration key'); }
  }
  for (const [key, expected] of Object.entries(shape)) {
    const value = config[key];
    if (Array.isArray(expected)) {
      if (!Array.isArray(value) || value.some(v => typeof v !== 'string' || v.length > 1024) || value.length > 256) { throw new Error('Expected a bounded string array'); }
    } else if (isObject(expected)) {
      if (!isObject(value)) { throw new Error('Expected configuration object'); }
      validateShape(value, expected);
    } else if (typeof value !== typeof expected) { throw new Error('Invalid configuration value type'); }
  }
}

/** @param {Record<string, unknown>} [user] @param {Record<string, unknown>} [project] @returns {import('./types.mjs').Config} */
export function resolveConfig(user = {}, project = {}) {
  const value = merge(merge(/** @type {Record<string, unknown>} */ (structuredClone(defaults)), user), project);
  validateShape(value, /** @type {Record<string, unknown>} */ (defaults), true);
  const config = /** @type {import('./types.mjs').Config} */ (/** @type {unknown} */ (value));
  for (const [id, rule] of Object.entries(config.rules)) {
    if (rule.id !== id || !['deny', 'ask', 'warn', 'off'].includes(rule.mode)) { throw new Error('Invalid rule id or mode'); }
  }
  const { entropyThreshold, minLength } = config.rules.secrets;
  if (!Number.isFinite(entropyThreshold) || entropyThreshold < 0 || entropyThreshold > 8 || !Number.isInteger(minLength) || minLength < 8 || minLength > 4096) { throw new Error('Invalid entropy settings'); }
  if (!config.audit.path || config.audit.path.length > 4096) { throw new Error('Invalid audit path'); }
  return config;
}

/** @param {string} file @returns {Record<string, unknown>} */
function readConfig(file) {
  try {
    if (fs.statSync(file).size > 1024 * 1024) { throw new Error('Configuration size limit exceeded'); }
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!isObject(value)) { throw new Error('Expected configuration object'); }
    return value;
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') { return {}; }
    // Never include the parser's excerpt, raw file contents, or input paths.
    throw new Error('Cannot read valid guardrails configuration');
  }
}

/** Nearest .git marker or config determines project root. No git subprocess.
 * @param {string} cwd */
export function findProjectRoot(cwd) {
  let current = path.resolve(cwd);
  for (;;) {
    if (fs.existsSync(path.join(current, '.git')) || fs.existsSync(path.join(current, '.agent-guardrails.json'))) { return current; }
    const parent = path.dirname(current);
    if (parent === current) { return path.resolve(cwd); }
    current = parent;
  }
}

/** @param {string} cwd @param {string} [home] */
export function loadConfig(cwd, home = os.homedir()) {
  const projectRoot = findProjectRoot(cwd);
  const userFile = path.join(home, '.agent-guardrails.json');
  const projectFile = path.join(projectRoot, '.agent-guardrails.json');
  return { config: resolveConfig(readConfig(userFile), userFile === projectFile ? {} : readConfig(projectFile)), projectRoot, home };
}
