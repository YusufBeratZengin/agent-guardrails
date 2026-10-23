import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { main } from '../bin/agent-guardrails.mjs';
import { sarif } from '../src/sarif.mjs';
import { scan } from '../src/scan.mjs';
import { fixture, fakeTokens, config } from './helpers.mjs';

async function run(args, cwd) {
  let stdout = ''; let stderr = '';
  const status = await main(args, { cwd: () => cwd, home: path.join(cwd, 'absent-home'), stdin: [], stdout: { write: s => { stdout += s; } }, stderr: { write: s => { stderr += s; } } });
  return { status, stdout, stderr };
}

test('SARIF CLI emits valid structure, stable rules, URI locations and no source content', async t => {
  const cwd = fixture(t);
  const token = fakeTokens[0][1];
  fs.writeFileSync(path.join(cwd, 'türkçe #%.txt'), token);
  fs.writeFileSync(path.join(cwd, 'second.txt'), token + '\n' + fakeTokens[3][1]);
  const result = await run(['scan', '.', '--format', 'sarif'], cwd);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stderr, '');
  assert.ok(!result.stdout.includes(token));
  const report = JSON.parse(result.stdout);
  assert.equal(report.version, '2.1.0');
  assert.equal(report.$schema, 'https://json.schemastore.org/sarif-2.1.0.json');
  const { tool, results } = report.runs[0];
  assert.equal(tool.driver.name, 'agent-guardrails');
  assert.equal(results.length, 3);
  for (const result of results) {
    assert.equal(tool.driver.rules[result.ruleIndex].id, result.ruleId);
    assert.equal(result.level, 'error');
    assert.equal(result.locations[0].physicalLocation.artifactLocation.uriBaseId, '%SRCROOT%');
    assert.ok(!('region' in result.locations[0].physicalLocation), 'Do not invent a line number');
  }
  assert.ok(results.some(r => r.locations[0].physicalLocation.artifactLocation.uri === 't%C3%BCrk%C3%A7e%20%23%25.txt'));
  const json = await run(['scan', '.', '--format', 'json'], cwd);
  assert.deepEqual(JSON.parse(json.stdout), JSON.parse((await run(['scan', '.'], cwd)).stdout));
});

test('SARIF redacts credential-bearing paths and handles clean scans and errors', async t => {
  const cwd = fixture(t);
  const clean = await run(['scan', '.', '--format', 'sarif'], cwd);
  assert.equal(clean.status, 0);
  assert.deepEqual(JSON.parse(clean.stdout).runs[0].results, []);
  const token = fakeTokens[0][1];
  fs.writeFileSync(path.join(cwd, token + '.txt'), token);
  const report = sarif(scan(cwd, config.rules.secrets), cwd, config.rules.secrets);
  assert.ok(!JSON.stringify(report).includes(token));
  assert.ok(!('locations' in report.runs[0].results[0]));
  for (const args of [['scan', '.', '--format', 'invalid'], ['scan', '.', '--format'], ['scan', 'missing', '--format', 'sarif']]) {
    const result = await run(args, cwd);
    assert.equal(result.status, 2); assert.equal(result.stdout, '');
  }
});
