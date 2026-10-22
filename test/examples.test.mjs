import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveConfig } from '../src/config.mjs';
import { settingsSnippet } from '../src/adapters/claude-code.mjs';

const schema = JSON.parse(fs.readFileSync('schema/config.schema.json', 'utf8'));

// Dependency-free assertion of the JSON Schema vocabulary used by our examples.
// Unknown assertions fail so schema additions cannot silently weaken this check.
function validate(value, node) {
  for (const key of Object.keys(node)) {
    assert.ok(['$schema', '$defs', '$ref', 'title', 'description', 'default', 'type', 'const', 'enum', 'required', 'additionalProperties', 'properties', 'items', 'minItems', 'maxItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'pattern'].includes(key), `Unsupported schema keyword: ${key}`);
  }
  if (node.$ref) { validate(value, node.$ref.split('/').slice(1).reduce((part, key) => part[key], schema)); return; }
  if (node.type) {
    if (node.type === 'object') { assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value)); }
    else if (node.type === 'array') { assert.ok(Array.isArray(value)); }
    else if (node.type === 'integer') { assert.ok(Number.isInteger(value)); }
    else { assert.equal(typeof value, node.type); }
  }
  if (Object.hasOwn(node, 'const')) { assert.deepEqual(value, node.const); }
  if (node.enum) { assert.ok(node.enum.includes(value)); }
  if (node.required) { for (const key of node.required) { assert.ok(Object.hasOwn(value, key)); } }
  if (node.properties) {
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(node.properties, key)) { validate(child, node.properties[key]); }
      else { assert.notEqual(node.additionalProperties, false, `Unexpected property ${key}`); }
    }
  }
  if (node.items) { for (const child of value) { validate(child, node.items); } }
  for (const [key, actual] of [['minItems', value?.length], ['minLength', value?.length], ['minimum', value]]) {
    if (node[key] !== undefined) { assert.ok(actual >= node[key]); }
  }
  for (const [key, actual] of [['maxItems', value?.length], ['maxLength', value?.length], ['maximum', value]]) {
    if (node[key] !== undefined) { assert.ok(actual <= node[key]); }
  }
  if (node.pattern) { assert.match(value, new RegExp(node.pattern)); }
}

test('every example JSON validates against its definition in config.schema.json', () => {
  const files = fs.readdirSync('examples').filter(file => file.endsWith('.json'));
  assert.deepEqual(files.sort(), ['.agent-guardrails.json', 'settings.snippet.json']);
  for (const file of files) {
    const value = JSON.parse(fs.readFileSync(`examples/${file}`, 'utf8'));
    if (file === 'settings.snippet.json') {
      validate(value, schema.$defs.settingsSnippet);
      assert.deepEqual(value, settingsSnippet('npx --no-install agent-guardrails hook'));
      assert.throws(() => validate({ ...value, rules: {} }, schema.$defs.settingsSnippet));
    } else {
      validate(value, schema);
      const config = resolveConfig(value);
      assert.equal(config.rules.pii.mode, 'deny');
      assert.equal(config.rules.outbound.allMcp, true);
      assert.equal(config.rules.destructive.allowForceWithLease, false);
      assert.throws(() => validate({ rules: { destructive: { mode: 'allow' } } }, schema));
      assert.throws(() => validate({ hooks: {} }, schema));
    }
  }
});
